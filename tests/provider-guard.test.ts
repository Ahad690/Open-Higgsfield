import { afterEach, describe, expect, it } from "vitest"

import {
  ProviderDestinationError,
  validateProviderDestination,
} from "@/lib/providers/destination"
import {
  AmbiguousSubmitError,
  createHiggsfieldClient,
} from "@/lib/higgsfield/client"

const ENV_KEYS = [
  "NODE_ENV",
  "E2E_TEST_MODE",
  "HF_API_BASE_URL",
  "HF_CREDENTIALS",
] as const

const saved = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

async function resetEnvCache() {
  const { resetEnvForTests } = await import("@/lib/env")
  resetEnvForTests()
}

afterEach(async () => {
  restoreEnv()
  await resetEnvCache()
})

describe("provider destination validation", () => {
  const accepted = [
    "http://127.0.0.1:4010",
    "http://127.0.0.2:4010",
    "https://127.0.0.1:443",
    "http://localhost:4010",
    "http://localhost.:4010",
    "http://[::1]:4010",
    "http://[::ffff:127.0.0.1]:4010",
  ]

  it.each(accepted)("accepts the loopback destination %s", (url) => {
    expect(() =>
      validateProviderDestination(url, { protectedMode: true })
    ).not.toThrow()
  })

  const rejected = [
    ["https://api.higgsfield.ai", /loopback/],
    ["http://192.168.1.10:4010", /loopback/],
    ["http://10.0.0.4:4010", /loopback/],
    ["http://localhost.example.com:4010", /loopback/],
    ["http://127.0.0.1.example.com:4010", /loopback/],
    ["http://evil.test/127.0.0.1", /loopback/],
    ["http://0.0.0.0:4010", /loopback/],
    ["http://[::]:4010", /loopback/],
    ["http://127.0.0.1:4010/prefix", /path|origin/i],
    ["http://127.0.0.1:4010?token=secret", /query|parameter/i],
    ["http://127.0.0.1:4010#fragment", /fragment/i],
    ["http://user:secret@127.0.0.1:4010", /credential|username|password/i],
    ["ftp://127.0.0.1:4010", /http|scheme/i],
    ["not a url", /valid URL/i],
  ] as const

  it.each(rejected)("rejects %s in protected mode", (url, pattern) => {
    expect(() =>
      validateProviderDestination(url, { protectedMode: true })
    ).toThrow(pattern)
  })

  it("allows an ordinary external HTTPS provider outside protected mode", () => {
    const parsed = validateProviderDestination("https://api.higgsfield.ai", {
      protectedMode: false,
    })
    expect(parsed.origin).toBe("https://api.higgsfield.ai")
  })

  it("still rejects unsupported schemes and embedded credentials outside protected mode", () => {
    expect(() =>
      validateProviderDestination("ftp://api.higgsfield.ai", {
        protectedMode: false,
      })
    ).toThrow(/http|scheme/i)
    expect(() =>
      validateProviderDestination("https://user:pass@api.higgsfield.ai", {
        protectedMode: false,
      })
    ).toThrow(/credential|username|password/i)
  })

  it("fails closed when the protected URL is absent", () => {
    expect(() =>
      validateProviderDestination(undefined, { protectedMode: true })
    ).toThrow(/HF_API_BASE_URL|required/i)
    expect(() =>
      validateProviderDestination("  ", { protectedMode: true })
    ).toThrow(/HF_API_BASE_URL|required/i)
  })
})

describe("protected provider client", () => {
  it("refuses to construct a protected client for an external API", () => {
    expect(() =>
      createHiggsfieldClient({
        credentials: "mock:mock",
        baseUrl: "https://api.higgsfield.ai",
        protectedMode: true,
      })
    ).toThrow(ProviderDestinationError)
  })

  it("sends protected requests to loopback and never retries a network failure", async () => {
    const calls: string[] = []
    const client = createHiggsfieldClient({
      credentials: "mock:mock",
      baseUrl: "http://127.0.0.1:4010",
      protectedMode: true,
      timeoutMs: 100,
      sleep: async () => undefined,
      fetch: (async (input) => {
        calls.push(String(input))
        throw new TypeError("connection refused")
      }) as typeof fetch,
    })

    await expect(
      client.submit("higgsfield-ai/soul/v2/standard", { prompt: "hello" })
    ).rejects.toBeInstanceOf(AmbiguousSubmitError)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^http:\/\/127\.0\.0\.1:4010\//)
  })
})

describe("environment guard for E2E/test mode", () => {
  async function loadEnv(values: {
    nodeEnv?: "test" | "production"
    e2e?: string
    baseUrl?: string
  }) {
    process.env.NODE_ENV = values.nodeEnv ?? "test"
    if (values.e2e === undefined) delete process.env.E2E_TEST_MODE
    else process.env.E2E_TEST_MODE = values.e2e
    if (values.baseUrl === undefined) delete process.env.HF_API_BASE_URL
    else process.env.HF_API_BASE_URL = values.baseUrl
    await resetEnvCache()
    const { env } = await import("@/lib/env")
    return env()
  }

  it("accepts an explicit loopback mock in protected mode", async () => {
    const value = await loadEnv({
      e2e: "true",
      baseUrl: "http://127.0.0.1:4010",
    })
    expect(value.E2E_TEST_MODE).toBe(true)
    expect(value.HF_API_BASE_URL).toBe("http://127.0.0.1:4010")
  })

  it("fails before requests when protected mode points at a public host", async () => {
    await expect(
      loadEnv({
        e2e: "true",
        baseUrl: "https://api.higgsfield.ai",
      })
    ).rejects.toThrow(/E2E_TEST_MODE|loopback/i)
  })

  it("fails when protected mode has no explicit mock URL", async () => {
    await expect(loadEnv({ e2e: "true" })).rejects.toThrow(
      /HF_API_BASE_URL|E2E_TEST_MODE/i
    )
  })

  it("fails in production rather than silently allowing protected mode to hit a live API", async () => {
    await expect(
      loadEnv({
        nodeEnv: "production",
        e2e: "true",
        baseUrl: "https://api.higgsfield.ai",
      })
    ).rejects.toThrow(/E2E_TEST_MODE|loopback/i)
  })

  it("fails in production even when protected mode points at a loopback mock", async () => {
    await expect(
      loadEnv({
        nodeEnv: "production",
        e2e: "true",
        baseUrl: "http://127.0.0.1:4010",
      })
    ).rejects.toThrow(/E2E_TEST_MODE|not permitted|production/i)
  })

  it("keeps ordinary development able to use the documented live API", async () => {
    const value = await loadEnv({
      e2e: "false",
      baseUrl: "https://api.higgsfield.ai",
    })
    expect(value.HF_API_BASE_URL).toBe("https://api.higgsfield.ai")
  })
})
