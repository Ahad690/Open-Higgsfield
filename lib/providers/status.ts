/**
 * Canonical job states.
 *
 * The generation pipeline only ever understands these six provider states,
 * because they are the ones the database, the UI and the refund rules are
 * written against. (`pending_submit` is ours, not a provider state.) An adapter
 * maps its provider's vocabulary into them; anything it cannot map is passed
 * through lowercased and treated as still in flight, which is the safe reading
 * (never claim a run finished when its state is unknown).
 */

export const CANONICAL_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "canceled",
] as const

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number]

export type TerminalStatus = "completed" | "failed" | "nsfw" | "canceled"

/** States after which a run must never be polled or refunded again. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set<TerminalStatus>([
  "completed",
  "failed",
  "nsfw",
  "canceled",
])

export function isTerminalStatus(value: string): value is TerminalStatus {
  return TERMINAL_STATUSES.has(value)
}

/**
 * Unambiguous synonyms, mostly American/British spelling and the "succeeded"
 * family. Deliberately small: a provider's content-block state must be mapped
 * by that provider's adapter, not guessed here.
 */
const SYNONYMS: Readonly<Record<string, CanonicalStatus>> = {
  pending: "queued",
  queued: "queued",
  running: "in_progress",
  processing: "in_progress",
  in_progress: "in_progress",
  succeeded: "completed",
  success: "completed",
  completed: "completed",
  done: "completed",
  failed: "failed",
  error: "failed",
  nsfw: "nsfw",
  cancelled: "canceled",
  canceled: "canceled",
}

export function canonicalStatus(raw: string): string {
  const key = raw.trim().toLowerCase()
  return SYNONYMS[key] ?? key
}
