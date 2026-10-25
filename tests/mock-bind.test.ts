import { describe, expect, it } from "vitest"

import {
  DEFAULT_MOCK_HOST,
  DEFAULT_MOCK_PORT,
  formatMockBaseUrl,
  parseMockBindConfig,
} from "@/scripts/mock-bind"
import { startMockServer } from "@/scripts/mock-higgsfield"

describe("mock bind configuration", () => {
  it("defaults to loopback on port 4010", () => {
    expect(parseMockBindConfig({})).toEqual({
      host: DEFAULT_MOCK_HOST,
      port: DEFAULT_MOCK_PORT,
    })
    expect(DEFAULT_MOCK_HOST).toBe("127.0.0.1")
  })

  it.each(["127.0.0.1", "127.0.0.2", "localhost", "::1"])(
    "accepts the loopback bind host %s",
    (host) => {
      expect(parseMockBindConfig({ MOCK_HF_HOST: host }).host).toBe(
        host.toLowerCase()
      )
    }
  )

  it.each([
    "0.0.0.0",
    "::",
    "[::]",
    "*",
    "192.168.1.10",
    "10.0.0.4",
    "localhost.example.com",
    "127.0.0.1.example.com",
    "https://127.0.0.1",
    "",
  ])("refuses the unsafe or ambiguous bind host %j", (host) => {
    expect(() => parseMockBindConfig({ MOCK_HF_HOST: host })).toThrow(
      /refuse|loopback|MOCK_HF_HOST/i
    )
  })

  it("validates the port explicitly", () => {
    expect(parseMockBindConfig({ MOCK_HF_PORT: "5010" }).port).toBe(5010)
    for (const port of ["", "0", "-1", "65536", "abc", "12.5"]) {
      expect(() => parseMockBindConfig({ MOCK_HF_PORT: port })).toThrow(
        /MOCK_HF_PORT|port/i
      )
    }
  })

  it("formats IPv4 and IPv6 base URLs correctly", () => {
    expect(formatMockBaseUrl("127.0.0.1", 4010)).toBe("http://127.0.0.1:4010")
    expect(formatMockBaseUrl("::1", 4010)).toBe("http://[::1]:4010")
  })

  it("refuses an unsafe host before it starts listening", async () => {
    await expect(
      startMockServer({ host: "0.0.0.0", port: 0, log: () => undefined })
    ).rejects.toThrow(/refuse|loopback/i)
  })
})
