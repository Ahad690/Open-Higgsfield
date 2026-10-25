/**
 * Prompt-token scenarios for the local mock. These are deliberately explicit
 * markers rather than fuzzy prompt matching, so tests fail deterministically.
 *
 * Existing markers are retained. New markers model the HTTP failure paths the
 * real client has to handle: rejected input, rate limiting, 5xx and timeout.
 */

export type MockOutcome = "completed" | "failed" | "nsfw"

export type MockScenario =
  | { kind: "normal"; outcome: MockOutcome; slow: boolean }
  | { kind: "reject" }
  | { kind: "rate_limited" }
  | { kind: "server_error_500" }
  | { kind: "server_error_503" }
  | { kind: "timeout" }

/**
 * HTTP scenarios win over status scenarios when a prompt contains more than one
 * marker. The mock documentation asks for one marker per request; this order
 * simply keeps accidental combinations deterministic instead of surprising.
 */
export function parseMockScenario(prompt: string): MockScenario {
  if (prompt.includes("[reject]")) return { kind: "reject" }
  if (prompt.includes("[429]")) return { kind: "rate_limited" }
  if (prompt.includes("[500]")) return { kind: "server_error_500" }
  if (prompt.includes("[503]")) return { kind: "server_error_503" }
  if (prompt.includes("[timeout]")) return { kind: "timeout" }

  const outcome: MockOutcome = prompt.includes("[fail]")
    ? "failed"
    : prompt.includes("[nsfw]")
      ? "nsfw"
      : "completed"
  return { kind: "normal", outcome, slow: prompt.includes("[slow]") }
}

/** Stable marker list for documentation and tests. */
export const MOCK_SCENARIO_MARKERS = [
  "[reject]",
  "[429]",
  "[500]",
  "[503]",
  "[timeout]",
  "[fail]",
  "[nsfw]",
  "[slow]",
] as const
