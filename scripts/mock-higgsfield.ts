/**
 * A local stand-in for the Higgsfield REST API (docs.higgsfield.ai), for
 * development and E2E tests without a platform key. Implements the documented
 * shapes: submit (+ hf_webhook), status, cancel, signed uploads and estimate.
 *
 *   pnpm mock:higgsfield
 *   HF_API_BASE_URL=http://127.0.0.1:4010 HF_CREDENTIALS=mock:mock
 *
 * The server binds to loopback by default and refuses wildcard, LAN or public
 * bind addresses. Prompt markers select deterministic outcomes:
 *
 *   [reject]  422 rejected input, no job created
 *   [429]     429 rate limit, no job created (client retries)
 *   [500]     500 upstream error, no job created (client retries)
 *   [503]     503 unavailable, no job created (client retries)
 *   [timeout] job created, response delayed beyond the client timeout
 *   [fail]    job completes as failed
 *   [nsfw]    job completes as nsfw
 *   [slow]    stays queued 20 s (cancelable), then completes at 26 s
 *
 * Outputs are generated mock PNGs and a checked-in, clearly labelled mock MP4.
 * No repository sample image/video is served as generated output.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  DEFAULT_MOCK_HOST,
  DEFAULT_MOCK_PORT,
  MockBindError,
  assertMockBindHost,
  formatMockBaseUrl,
  parseMockBindConfig,
} from "./mock-bind"
import {
  MOCK_ARTIFACT_LABEL,
  MOCK_VIDEO_RELATIVE_PATH,
  createMockPng,
} from "./mock-artifacts"
import { parseMockScenario } from "./mock-scenarios"

export type MockTiming = {
  queuedMs: number
  completedMs: number
  slowQueuedMs: number
  slowCompletedMs: number
}

const DEFAULT_TIMING: MockTiming = {
  queuedMs: 1_500,
  completedMs: 6_000,
  slowQueuedMs: 20_000,
  slowCompletedMs: 26_000,
}

const DEFAULT_TIMEOUT_DELAY_MS = 25_000

export type MockRequestStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled"

export type MockRequest = {
  status: MockRequestStatus
  path: string
  body: Record<string, unknown>
  webhook?: string
  createdAt: number
  outcome: "completed" | "failed" | "nsfw"
  slow: boolean
  webhookDelivered?: boolean
}

export type MockServerOptions = {
  host?: string
  /** 0 is allowed for tests so the OS can choose a free loopback port. */
  port?: number
  timing?: Partial<MockTiming>
  timeoutDelayMs?: number
  videoPath?: string
  log?: (line: string) => void
  now?: () => number
}

export type MockServerHandle = {
  server: Server
  host: string
  port: number
  baseUrl: string
  requests: Map<string, MockRequest>
  uploads: Map<string, { type: string; body: Buffer }>
  readonly attempts: number
  close: () => Promise<void>
}

export async function startMockServer(
  options: MockServerOptions = {}
): Promise<MockServerHandle> {
  const host = assertMockBindHost(options.host ?? DEFAULT_MOCK_HOST)
  const port = validatePort(options.port ?? DEFAULT_MOCK_PORT)
  const timing = { ...DEFAULT_TIMING, ...options.timing }
  for (const [name, value] of Object.entries(timing)) {
    if (!Number.isFinite(value) || value < 0)
      throw new MockBindError(`Mock timing ${name} must be a non-negative number.`)
  }
  const timeoutDelayMs = options.timeoutDelayMs ?? DEFAULT_TIMEOUT_DELAY_MS
  if (!Number.isFinite(timeoutDelayMs) || timeoutDelayMs < 0)
    throw new MockBindError("timeoutDelayMs must be a non-negative number.")
  const log = options.log ?? ((line: string) => console.log(line))
  const now = options.now ?? Date.now
  const videoPath =
    options.videoPath ?? join(process.cwd(), MOCK_VIDEO_RELATIVE_PATH)
  let videoBytes: Buffer
  try {
    videoBytes = readFileSync(videoPath)
  } catch {
    throw new MockBindError(
      `Mock video fixture is missing at ${videoPath}. Expected the checked-in clearly-labelled ${MOCK_VIDEO_RELATIVE_PATH}.`
    )
  }

  const requests = new Map<string, MockRequest>()
  const uploads = new Map<string, { type: string; body: Buffer }>()
  let attempts = 0
  let baseUrl = formatMockBaseUrl(host, port)

  function requireAuth(req: IncomingMessage): boolean {
    return /^Key [^:\s]+:[^:\s]+$/.test(req.headers.authorization ?? "")
  }

  function isVideoPath(path: string): boolean {
    return /video|kling|seedance|wan|minimax|hailuo|happy-horse|ltx|pixverse|cinema-studio|genjutsu/.test(
      path
    )
  }

  function terminal(status: MockRequestStatus): boolean {
    return (
      status === "completed" ||
      status === "failed" ||
      status === "nsfw" ||
      status === "canceled"
    )
  }

  function advance(request: MockRequest): void {
    const age = now() - request.createdAt
    if (
      request.status === "queued" &&
      age > (request.slow ? timing.slowQueuedMs : timing.queuedMs)
    )
      request.status = "in_progress"
    if (
      request.status === "in_progress" &&
      age > (request.slow ? timing.slowCompletedMs : timing.completedMs)
    )
      request.status = request.outcome
  }

  function artifactCount(request: MockRequest): number {
    const raw = Number(request.body.batch_size ?? 1)
    if (!Number.isFinite(raw)) return 1
    return Math.max(1, Math.min(8, Math.floor(raw) || 1))
  }

  function statusPayload(id: string, request: MockRequest): Record<string, unknown> {
    advance(request)
    const payload: Record<string, unknown> = {
      status: request.status,
      request_id: id,
      status_url: `${baseUrl}/requests/${id}/status`,
      cancel_url: `${baseUrl}/requests/${id}/cancel`,
      mock: true,
      mock_label: MOCK_ARTIFACT_LABEL,
    }
    if (request.status === "completed") {
      if (isVideoPath(request.path)) {
        payload.video = {
          url: `${baseUrl}/mock-assets/${id}/video.mp4`,
          content_type: "video/mp4",
        }
      } else {
        const count = artifactCount(request)
        payload.images = Array.from({ length: count }, (_, index) => ({
          url: `${baseUrl}/mock-assets/${id}/${index + 1}.png`,
          content_type: "image/png",
        }))
      }
    }
    if (request.status === "failed") payload.error = "Generation failed (mock)"
    return payload
  }

  function statusOf(id: string, request: MockRequest): Record<string, unknown> {
    const payload = statusPayload(id, request)
    if (
      terminal(request.status) &&
      request.status !== "canceled" &&
      !request.webhookDelivered
    ) {
      request.webhookDelivered = true
      void deliverWebhook(id, request)
    }
    return payload
  }

  async function deliverWebhook(id: string, request: MockRequest) {
    if (!request.webhook) return
    const payload = statusPayload(id, request)
    try {
      await fetch(request.webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          status: request.status,
          error: request.status === "failed" ? "Generation failed (mock)" : null,
          mock: true,
          mock_label: MOCK_ARTIFACT_LABEL,
          payload:
            request.status === "completed"
              ? { images: payload.images, video: payload.video }
              : null,
        }),
        signal: AbortSignal.timeout(5_000),
      })
    } catch {
      /* the reconciler will pick it up */
    }
  }

  function serveImage(
    res: ServerResponse,
    id: string,
    request: MockRequest,
    index: number
  ): void {
    const count = artifactCount(request)
    const image = createMockPng({
      requestId: id,
      modelPath: request.path,
      index: Math.max(0, Math.min(count - 1, index - 1)),
      count,
    })
    res.writeHead(200, {
      "content-type": "image/png",
      "content-length": image.length,
      "cache-control": "no-store",
      "x-mock-artifact": "true",
      "x-mock-label": MOCK_ARTIFACT_LABEL,
    })
    res.end(image)
  }

  function serveVideo(req: IncomingMessage, res: ServerResponse): void {
    const range = req.headers.range
    const headers: Record<string, string | number> = {
      "content-type": "video/mp4",
      "cache-control": "no-store",
      "accept-ranges": "bytes",
      "x-mock-artifact": "true",
      "x-mock-label": MOCK_ARTIFACT_LABEL,
    }
    if (!range) {
      res.writeHead(200, { ...headers, "content-length": videoBytes.length })
      res.end(videoBytes)
      return
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) {
      res.writeHead(416, { ...headers, "content-range": `bytes */${videoBytes.length}` })
      res.end()
      return
    }
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Number(match[2]) : videoBytes.length - 1
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= videoBytes.length
    ) {
      res.writeHead(416, { ...headers, "content-range": `bytes */${videoBytes.length}` })
      res.end()
      return
    }
    const boundedEnd = Math.min(end, videoBytes.length - 1)
    const body = videoBytes.subarray(start, boundedEnd + 1)
    res.writeHead(206, {
      ...headers,
      "content-length": body.length,
      "content-range": `bytes ${start}-${boundedEnd}/${videoBytes.length}`,
    })
    res.end(body)
  }

  function send(
    res: ServerResponse,
    status: number,
    data?: unknown,
    extra: Record<string, string | number> = {}
  ): void {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-correlation-id": randomUUID(),
      ...extra,
    })
    res.end(data === undefined ? "" : JSON.stringify(data))
  }

  async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", baseUrl)
    const method = req.method ?? "GET"
    try {
      const artifactMatch = url.pathname.match(
        /^\/mock-assets\/([^/]+)\/(.+)$/
      )
      if (method === "GET" && artifactMatch) {
        const request = requests.get(artifactMatch[1]!)
        if (!request || request.status !== "completed")
          return send(res, 404, { detail: "Mock artifact not found" })
        const file = artifactMatch[2]!
        if (file === "video.mp4") {
          if (!isVideoPath(request.path))
            return send(res, 404, { detail: "Not a video request" })
          return serveVideo(req, res)
        }
        const image = /^(\d+)\.png$/.exec(file)
        if (!image) return send(res, 404, { detail: "Not found" })
        return serveImage(res, artifactMatch[1]!, request, Number(image[1]))
      }

      if (method === "PUT" && url.pathname.startsWith("/upload/")) {
        const id = url.pathname.split("/")[2]!
        uploads.set(id, {
          type: req.headers["content-type"] ?? "application/octet-stream",
          body: await readBody(req),
        })
        res.writeHead(200, { "access-control-allow-origin": "*" })
        return res.end()
      }
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "PUT, GET, POST",
          "access-control-allow-headers": "content-type, x-amz-tagging",
        })
        return res.end()
      }
      if (method === "GET" && url.pathname.startsWith("/files/")) {
        const file = uploads.get(url.pathname.split("/")[2]!)
        if (!file) return send(res, 404, { detail: "Not found" })
        res.writeHead(200, {
          "content-type": file.type,
          "content-length": file.body.length,
        })
        return res.end(file.body)
      }

      if (!requireAuth(req))
        return send(res, 401, { detail: "Invalid credentials" })

      if (method === "POST" && url.pathname === "/files/generate-upload-url") {
        const { content_type } = JSON.parse(
          (await readBody(req)).toString() || "{}"
        ) as { content_type?: string }
        const id = randomUUID()
        return send(res, 200, {
          upload_url: `${baseUrl}/upload/${id}`,
          public_url: `${baseUrl}/files/${id}`,
          content_type,
          upload_headers: {
            "Content-Type": content_type,
            "x-amz-tagging": "retention=temporary",
          },
        })
      }
      const statusMatch = url.pathname.match(/^\/requests\/([^/]+)\/status$/)
      if (method === "GET" && statusMatch) {
        const request = requests.get(statusMatch[1]!)
        return request
          ? send(res, 200, statusOf(statusMatch[1]!, request))
          : send(res, 404, { detail: "Request not found" })
      }
      const cancelMatch = url.pathname.match(/^\/requests\/([^/]+)\/cancel$/)
      if (method === "POST" && cancelMatch) {
        const request = requests.get(cancelMatch[1]!)
        if (!request) return send(res, 404, { detail: "Request not found" })
        statusOf(cancelMatch[1]!, request)
        if (request.status !== "queued")
          return send(res, 400, { detail: "Request already started" })
        request.status = "canceled"
        return send(res, 202)
      }
      if (method === "POST" && url.pathname.startsWith("/estimate/"))
        return send(res, 200, {
          credits: "1.000",
          usd: "0.010",
          mock: true,
          endpoint: url.pathname.slice("/estimate/".length),
        })

      if (method === "POST") {
        attempts++
        const body = JSON.parse(
          (await readBody(req)).toString() || "{}"
        ) as Record<string, unknown>
        const prompt = String(body.prompt ?? "")
        const scenario = parseMockScenario(prompt)
        const path = url.pathname.slice(1)

        if (scenario.kind === "reject")
          return send(res, 422, {
            detail: "Mock rejected input: prohibited prompt or invalid fixture",
            code: "mock_rejected_input",
            mock: true,
          })
        if (scenario.kind === "rate_limited")
          return send(
            res,
            429,
            {
              detail: "Mock rate limit reached",
              code: "mock_rate_limited",
              mock: true,
            },
            { "retry-after": "1" }
          )
        if (scenario.kind === "server_error_500")
          return send(res, 500, {
            detail: "Mock upstream failure",
            code: "mock_upstream_error",
            mock: true,
          })
        if (scenario.kind === "server_error_503")
          return send(
            res,
            503,
            {
              detail: "Mock upstream unavailable",
              code: "mock_upstream_unavailable",
              mock: true,
            },
            { "retry-after": "1" }
          )

        const id = randomUUID()
        const request: MockRequest = {
          status: "queued",
          path,
          body,
          webhook: url.searchParams.get("hf_webhook") ?? undefined,
          createdAt: now(),
          outcome:
            scenario.kind === "normal" ? scenario.outcome : "completed",
          slow: scenario.kind === "normal" ? scenario.slow : false,
        }
        requests.set(id, request)
        log(`[mock] ${path} -> ${id} (${scenario.kind})`)

        if (scenario.kind === "timeout")
          await new Promise((resolve) =>
            setTimeout(resolve, timeoutDelayMs)
          )
        if (res.destroyed) return
        return send(res, 200, {
          status: "queued",
          request_id: id,
          status_url: `${baseUrl}/requests/${id}/status`,
          cancel_url: `${baseUrl}/requests/${id}/cancel`,
          mock: true,
        })
      }
      return send(res, 404, { detail: "Not found" })
    } catch (error) {
      log(`[mock] error: ${error instanceof Error ? error.message : "unknown"}`)
      if (!res.headersSent) return send(res, 500, { detail: "Mock error" })
      res.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, host)
  })

  const address = server.address()
  if (!address || typeof address === "string")
    throw new MockBindError("Mock server did not report a TCP address.")
  baseUrl = formatMockBaseUrl(address.address, address.port)
  log(`[mock] Mock Higgsfield API on ${baseUrl} (mock output only)`)

  return {
    server,
    host,
    port: address.port,
    baseUrl,
    requests,
    uploads,
    get attempts() {
      return attempts
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new MockBindError("Mock port must be an integer from 0 to 65535.")
  return port
}

/** Run only when this file is the CLI entry point, not when a test imports it. */
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  try {
    const config = parseMockBindConfig()
    await startMockServer(config)
  } catch (error) {
    console.error(
      `[mock] ${error instanceof Error ? error.message : "failed to start"}`
    )
    process.exitCode = 1
  }
}
