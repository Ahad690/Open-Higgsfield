import "server-only"

import { higgsfield } from "@/lib/higgsfield/client"
import { webhookUrlFor } from "@/lib/higgsfield/webhook"

import { canonicalStatus } from "./status"
import type {
  GenerationProvider,
  ProviderJobStatus,
  SubmissionRequest,
  ProviderJob,
} from "./types"

/**
 * Higgsfield REST API adapter (docs.higgsfield.ai).
 *
 * It is a thin adapter on purpose: all retry, ambiguity and response-mapping
 * behaviour stays in `lib/higgsfield/client.ts`, where it was written against
 * the documented contract and is covered by the existing tests. This file only
 * translates that client into the provider-neutral vocabulary and declares what
 * the API actually supports.
 *
 * `higgsfield()` is resolved per call, not captured, so the test harness can
 * swap the underlying client (`setHiggsfieldClientForTests`) after import.
 */
export const higgsfieldProvider: GenerationProvider = {
  id: "higgsfield",
  label: "Higgsfield",
  capabilities: new Set([
    "submit",
    "status",
    "cancel",
    "upload",
    "estimate",
  ] as const),

  async submit(request: SubmissionRequest): Promise<ProviderJob> {
    const queued = await higgsfield().submit(
      request.path,
      request.body,
      // The callback URL (and its HMAC token) is part of this API's contract.
      webhookUrlFor(request.generationId)
    )
    return {
      providerId: "higgsfield",
      requestId: queued.requestId,
      status: canonicalStatus(queued.status),
    }
  },

  async status(requestId: string): Promise<ProviderJobStatus> {
    const status = await higgsfield().status(requestId)
    return {
      status: canonicalStatus(status.status),
      requestId: status.requestId || requestId,
      artifacts: status.artifacts,
      ...(status.error ? { error: status.error } : {}),
    }
  },

  async cancel(requestId: string): Promise<void> {
    await higgsfield().cancel(requestId)
  },

  async createUpload(contentType: unknown) {
    return higgsfield().createUpload(contentType)
  },

  async estimate(path: string, body: Record<string, unknown>) {
    return higgsfield().estimate(path, body)
  },
}
