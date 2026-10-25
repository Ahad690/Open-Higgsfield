import { isLoopbackHostname } from "@/lib/providers/destination"

/**
 * Bind policy for the local mock provider. The default is explicit IPv4
 * loopback, not "all interfaces", because a test helper must never become a
 * reachable service on the LAN. Any MOCK_HF_HOST override is validated before
 * `listen()` runs.
 */

export const DEFAULT_MOCK_HOST = "127.0.0.1"
export const DEFAULT_MOCK_PORT = 4010

export class MockBindError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MockBindError"
  }
}

export type MockBind = {
  host: string
  port: number
}

/** Validate a bind host, including one supplied directly by a caller/test. */
export function assertMockBindHost(host: string): string {
  const value = host.trim()
  if (!value)
    throw new MockBindError(
      "MOCK_HF_HOST is empty. Use the loopback default 127.0.0.1."
    )
  if (value.startsWith("[") || value.endsWith("]"))
    throw new MockBindError(
      "MOCK_HF_HOST must be a bare bind host, not a URL/bracketed IPv6 literal. Use ::1 without brackets."
    )
  if (value.includes("/") || value.includes("://"))
    throw new MockBindError(
      "MOCK_HF_HOST must be a host name or IP address, not a URL."
    )
  if (!isLoopbackHostname(value))
    throw new MockBindError(
      `The mock server refuses to bind to non-loopback host "${value}". Use 127.0.0.1 (default), ::1 or localhost.`
    )
  return value.toLowerCase()
}

export function parseMockBindConfig(
  source: Record<string, string | undefined> = process.env
): MockBind {
  const rawHost = source.MOCK_HF_HOST
  const host =
    rawHost === undefined ? DEFAULT_MOCK_HOST : assertMockBindHost(rawHost)
  const rawPort = source.MOCK_HF_PORT
  if (rawPort === undefined)
    return { host, port: DEFAULT_MOCK_PORT }

  const port = Number(rawPort)
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65_535)
    throw new MockBindError(
      `MOCK_HF_PORT must be an integer from 1 to 65535; got "${rawPort}".`
    )
  return { host, port }
}

export function formatMockBaseUrl(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`
}
