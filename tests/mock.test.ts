import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  AmbiguousSubmitError,
  PlatformError,
  createHiggsfieldClient,
} from "@/lib/higgsfield/client"
import { probeImage, probeMedia } from "@/lib/storage/probe"
import {
  MOCK_ARTIFACT_LABEL,
  createMockPng,
} from "@/scripts/mock-artifacts"
import { parseMockScenario } from "@/scripts/mock-scenarios"
import { startMockServer } from "@/scripts/mock-higgsfield"

type MockServer = Awaited<ReturnType<typeof startMockServer>>
let mock: MockServer

beforeEach(async () => {
  mock = await startMockServer({
    host: "127.0.0.1",
    port: 0,
    timeoutDelayMs: 120,
    timing: {
      queuedMs: 5,
      completedMs: 20,
      slowQueuedMs: 60,
      slowCompletedMs: 120,
    },
    log: () => undefined,
  })
})

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  await mock.close()
})

function submit(
  prompt: string,
  options: {
    path?: string
    body?: Record<string, unknown>
    webhook?: string
  } = {}
) {
  const url = new URL(
    `${mock.baseUrl}/${options.path ?? "higgsfield-ai/soul/v2/standard"}`
  )
  if (options.webhook) url.searchParams.set("hf_webhook", options.webhook)
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Key mock:mock",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, ...options.body }),
  })
}

async function status(id: string) {
  const response = await fetch(`${mock.baseUrl}/requests/${id}/status`, {
    headers: { Authorization: "Key mock:mock" },
  })
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

async function waitForStatus(
  id: string,
  predicate: (payload: Record<string, unknown>) => boolean,
  timeoutMs = 2_000
) {
  const started = Date.now()
  for (;;) {
    const payload = await status(id)
    if (predicate(payload)) return payload
    if (Date.now() - started > timeoutMs)
      throw new Error(`timed out waiting for status: ${JSON.stringify(payload)}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("mock scenario parsing", () => {
  it("keeps the existing normal, fail, nsfw and slow behaviour", () => {
    expect(parseMockScenario("a normal prompt")).toEqual({
      kind: "normal",
      outcome: "completed",
      slow: false,
    })
    expect(parseMockScenario("[fail] prompt")).toEqual({
      kind: "normal",
      outcome: "failed",
      slow: false,
    })
    expect(parseMockScenario("[nsfw] prompt")).toEqual({
      kind: "normal",
      outcome: "nsfw",
      slow: false,
    })
    expect(parseMockScenario("[slow] prompt")).toEqual({
      kind: "normal",
      outcome: "completed",
      slow: true,
    })
  })

  it.each([
    ["[reject]", "reject"],
    ["[429]", "rate_limited"],
    ["[500]", "server_error_500"],
    ["[503]", "server_error_503"],
    ["[timeout]", "timeout"],
  ])("recognises the explicit failure marker %s", (marker, kind) => {
    expect(parseMockScenario(`${marker} prompt`)).toEqual({ kind })
  })
})

describe("mock artifacts", () => {
  it("generates a deterministic PNG with explicit mock metadata", () => {
    const a = createMockPng({
      requestId: "11111111-1111-4111-8111-111111111111",
      modelPath: "higgsfield-ai/soul/v2/standard",
      index: 0,
      count: 1,
    })
    const b = createMockPng({
      requestId: "11111111-1111-4111-8111-111111111111",
      modelPath: "higgsfield-ai/soul/v2/standard",
      index: 0,
      count: 1,
    })
    expect(a.equals(b)).toBe(true)
    expect(a.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
    expect(a.toString("latin1")).toContain(MOCK_ARTIFACT_LABEL)
    expect(a.toString("latin1")).toContain("NOT AI-GENERATED")
    expect(probeImage(a)).toEqual({ width: 1280, height: 720 })
  })
})

describe("mock HTTP contract", () => {
  it("requires the documented mock credentials", async () => {
    const response = await fetch(
      `${mock.baseUrl}/higgsfield-ai/soul/v2/standard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      }
    )
    expect(response.status).toBe(401)
  })

  it("completes an image request with unmistakable mock PNGs and no sample media", async () => {
    const response = await submit("an image fixture")
    expect(response.status).toBe(200)
    const queued = (await response.json()) as { request_id: string }
    const payload = await waitForStatus(
      queued.request_id,
      (value) => value.status === "completed"
    )
    const images = payload.images as { url: string; content_type: string }[]
    expect(images).toHaveLength(1)
    expect(images[0]!.url).toContain(`${mock.baseUrl}/mock-assets/`)
    expect(images[0]!.url).not.toMatch(/samples|presets|showcase|loops|public\/media/)
    expect(images[0]!.content_type).toBe("image/png")
    expect(payload.mock).toBe(true)
    expect(payload.mock_label).toBe(MOCK_ARTIFACT_LABEL)

    const artifact = await fetch(images[0]!.url)
    expect(artifact.status).toBe(200)
    expect(artifact.headers.get("content-type")).toBe("image/png")
    const bytes = Buffer.from(await artifact.arrayBuffer())
    expect(probeImage(bytes)).toEqual({ width: 1280, height: 720 })
    expect(bytes.toString("latin1")).toContain(MOCK_ARTIFACT_LABEL)
  })

  it("completes a batch image request with deterministic distinct artifacts", async () => {
    const response = await submit("batch", { body: { batch_size: 2 } })
    const queued = (await response.json()) as { request_id: string }
    const payload = await waitForStatus(
      queued.request_id,
      (value) => value.status === "completed"
    )
    const images = payload.images as { url: string }[]
    expect(images).toHaveLength(2)
    expect(images[0]!.url).not.toBe(images[1]!.url)
  })

  it("serves a real, clearly labelled MP4 for video models", async () => {
    const response = await submit("a video fixture", {
      path: "higgsfield-ai/seedance/v2/text-to-video",
    })
    const queued = (await response.json()) as { request_id: string }
    const payload = await waitForStatus(
      queued.request_id,
      (value) => value.status === "completed"
    )
    const video = payload.video as { url: string; content_type: string }
    expect(video.url).toContain(`${mock.baseUrl}/mock-assets/`)
    expect(video.url).not.toMatch(/samples|presets|showcase|loops|public\/media/)
    expect(video.content_type).toBe("video/mp4")

    const artifact = await fetch(video.url)
    expect(artifact.status).toBe(200)
    expect(artifact.headers.get("content-type")).toBe("video/mp4")
    const bytes = Buffer.from(await artifact.arrayBuffer())
    expect(bytes.subarray(4, 8).toString("ascii")).toBe("ftyp")
    expect(bytes.byteLength).toBeGreaterThan(10_000)
    expect(bytes.toString("latin1")).toContain(MOCK_ARTIFACT_LABEL)
    expect(probeMedia(bytes, "video/mp4")).toMatchObject({
      width: 1280,
      height: 720,
      durationSec: 3,
    })
  })

  it("keeps the existing failed and nsfw terminal fixtures", async () => {
    for (const [prompt, expected] of [
      ["[fail] fixture", "failed"],
      ["[nsfw] fixture", "nsfw"],
    ] as const) {
      const response = await submit(prompt)
      const queued = (await response.json()) as { request_id: string }
      const payload = await waitForStatus(
        queued.request_id,
        (value) => value.status === expected
      )
      if (expected === "failed")
        expect(payload.error).toMatch(/Generation failed \(mock\)/)
      expect(payload.images).toBeUndefined()
      expect(payload.video).toBeUndefined()
    }
  })

  it("keeps the slow fixture cancelable while queued", async () => {
    const response = await submit("[slow] fixture")
    const queued = (await response.json()) as { request_id: string }
    expect((await status(queued.request_id)).status).toBe("queued")

    const canceled = await fetch(
      `${mock.baseUrl}/requests/${queued.request_id}/cancel`,
      { method: "POST", headers: { Authorization: "Key mock:mock" } }
    )
    expect(canceled.status).toBe(202)
    expect((await status(queued.request_id)).status).toBe("canceled")
  })

  it.each([
    ["[reject]", 422, "mock_rejected_input", null],
    ["[429]", 429, "mock_rate_limited", "1"],
    ["[500]", 500, "mock_upstream_error", null],
    ["[503]", 503, "mock_upstream_unavailable", "1"],
  ])(
    "returns the deterministic %s response",
    async (marker, expectedStatus, code, retryAfter) => {
      const response = await submit(marker)
      expect(response.status).toBe(expectedStatus)
      const body = (await response.json()) as { code: string; detail: string }
      expect(body.code).toBe(code)
      expect(body.detail).toBeTruthy()
      expect(response.headers.get("retry-after")).toBe(retryAfter)
      expect(mock.requests.size).toBe(0)
      expect(mock.attempts).toBe(1)
    }
  )

  it.each([429, 500, 503])(
    "uses the existing client retry policy for HTTP %i without creating a job",
    async (statusCode) => {
      const client = createHiggsfieldClient({
        credentials: "mock:mock",
        baseUrl: mock.baseUrl,
        timeoutMs: 1_000,
        sleep: async () => undefined,
      })
      await expect(
        client.submit("higgsfield-ai/soul/v2/standard", { prompt: `[${statusCode}]` })
      ).rejects.toMatchObject({ status: statusCode })
      expect(mock.attempts).toBe(3)
      expect(mock.requests.size).toBe(0)
    }
  )

  it("does not retry a rejected input", async () => {
    const client = createHiggsfieldClient({
      credentials: "mock:mock",
      baseUrl: mock.baseUrl,
      timeoutMs: 1_000,
      sleep: async () => undefined,
    })
    await expect(
      client.submit("higgsfield-ai/soul/v2/standard", { prompt: "[reject]" })
    ).rejects.toMatchObject({ status: 422 })
    expect(mock.attempts).toBe(1)
    expect(mock.requests.size).toBe(0)
  })

  it("accepts a timeout request before the client aborts, leaving an ambiguous job", async () => {
    const client = createHiggsfieldClient({
      credentials: "mock:mock",
      baseUrl: mock.baseUrl,
      timeoutMs: 30,
      sleep: async () => undefined,
    })
    await expect(
      client.submit("higgsfield-ai/soul/v2/standard", { prompt: "[timeout]" })
    ).rejects.toBeInstanceOf(AmbiguousSubmitError)
    expect(mock.attempts).toBe(1)
    expect(mock.requests.size).toBe(1)
    // Let the delayed response finish before the server closes.
    await new Promise((resolve) => setTimeout(resolve, 150))
  })
})

describe("mock failure response types", () => {
  it("keeps PlatformError as the normalized client error", async () => {
    const client = createHiggsfieldClient({
      credentials: "mock:mock",
      baseUrl: mock.baseUrl,
      timeoutMs: 1_000,
      sleep: async () => undefined,
    })
    const error = await client
      .submit("higgsfield-ai/soul/v2/standard", { prompt: "[reject]" })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PlatformError)
    expect((error as PlatformError).status).toBe(422)
  })
})
