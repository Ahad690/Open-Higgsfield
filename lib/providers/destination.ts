import { isIP } from "node:net"

/**
 * Destination policy for the generation provider.
 *
 * The provider client is the one place that spends money. In ordinary
 * development it may point at the documented external API; in explicit
 * E2E/test mode it may only point at a loopback origin. This module is pure
 * (no env, no fetch) so the policy can be tested directly and reused by the
 * environment parser and the HTTP client.
 */

export const DEFAULT_PROVIDER_BASE_URL = "https://api.higgsfield.ai"

export type ProviderDestinationOptions = {
  protectedMode: boolean
}

export type ProviderDestinationErrorCode =
  | "provider_url_missing"
  | "provider_url_invalid"
  | "provider_url_scheme"
  | "provider_url_credentials"
  | "provider_url_path"
  | "provider_url_query"
  | "provider_url_fragment"
  | "provider_url_not_loopback"

export class ProviderDestinationError extends Error {
  constructor(
    readonly code: ProviderDestinationErrorCode,
    message: string
  ) {
    super(message)
    this.name = "ProviderDestinationError"
  }
}

/**
 * True only for a literal loopback host. No DNS is performed: the goal is to
 * reject a destination before a request, not to discover what a name resolves
 * to. `localhost` and its trailing-dot form are accepted because the runtime
 * resolves them as loopback in ordinary local use. IPv4 loopback is the whole
 * 127.0.0.0/8 range; IPv6 loopback is ::1 (plus IPv4-mapped forms).
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
  if (host === "localhost") return true

  const version = isIP(host)
  if (version === 4) return isLoopbackIpv4(host)
  if (version === 6) {
    if (host === "::1") return true
    const mapped = /^::ffff:(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(
      host
    )
    if (!mapped) return false
    if (mapped[1]) return isLoopbackIpv4(mapped[1])
    const high = Number.parseInt(mapped[2]!, 16)
    return high >= 0x7f00 && high <= 0x7fff
  }
  return false
}

function isLoopbackIpv4(host: string): boolean {
  return host.split(".")[0] === "127"
}

/**
 * Validate a provider base URL and return its normalized origin.
 *
 * The value must be an origin (no path, query or fragment), use HTTP(S), and
 * carry no embedded credentials. In protected mode the literal host must be
 * loopback. The original input is never included in an error message.
 */
export function validateProviderDestination(
  raw: string | undefined,
  options: ProviderDestinationOptions
): URL {
  if (!raw || !raw.trim())
    throw new ProviderDestinationError(
      "provider_url_missing",
      "HF_API_BASE_URL is required. In E2E_TEST_MODE it must be an explicit loopback URL (for example http://127.0.0.1:4010)."
    )

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ProviderDestinationError(
      "provider_url_invalid",
      "HF_API_BASE_URL must be a valid URL."
    )
  }

  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new ProviderDestinationError(
      "provider_url_scheme",
      "HF_API_BASE_URL must use http: or https:."
    )
  if (url.username || url.password)
    throw new ProviderDestinationError(
      "provider_url_credentials",
      "HF_API_BASE_URL must not embed credentials."
    )
  if (options.protectedMode && !isLoopbackHostname(url.hostname))
    throw new ProviderDestinationError(
      "provider_url_not_loopback",
      `E2E_TEST_MODE restricts generation-provider requests to loopback; host "${url.hostname}" is not loopback.`
    )
  if (url.pathname !== "/" && url.pathname !== "")
    throw new ProviderDestinationError(
      "provider_url_path",
      "HF_API_BASE_URL must be an origin without a path."
    )
  if (url.search)
    throw new ProviderDestinationError(
      "provider_url_query",
      "HF_API_BASE_URL must not contain a query string."
    )
  if (url.hash)
    throw new ProviderDestinationError(
      "provider_url_fragment",
      "HF_API_BASE_URL must not contain a fragment."
    )

  return new URL(url.origin)
}
