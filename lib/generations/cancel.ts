import "server-only"

import type { ObjectId } from "mongodb"

import { NotFoundError, UserFacingError } from "@/lib/errors"
import { collections } from "@/lib/db/collections"
import { PlatformError } from "@/lib/higgsfield/client"
import {
  providerForGeneration,
  providerRequestIdOf,
} from "@/lib/providers"

import { finalizeGeneration } from "./finalize"

/**
 * Cancel really cancels on the platform (POST /requests/{id}/cancel): 202 while
 * queued, 400 once processing started. The canceled status then flows through
 * finalizeGeneration, which refunds exactly once.
 */
export async function cancelGeneration(
  userId: ObjectId,
  generationId: ObjectId
): Promise<void> {
  const { generations } = await collections()
  const gen = await generations.findOne({ _id: generationId, userId })
  if (!gen) throw new NotFoundError("Generation not found.")
  if (gen.status === "pending_submit")
    throw new UserFacingError(
      "Still starting — try cancelling again in a few seconds.",
      "NOT_YET"
    )
  if (gen.status !== "queued")
    throw new UserFacingError(
      gen.status === "in_progress"
        ? "This generation already started, so it can't be canceled."
        : "This generation already finished.",
      "NOT_CANCELABLE"
    )
  const provider = providerForGeneration(gen)
  const requestId = providerRequestIdOf(gen)
  if (!requestId || !provider.cancel)
    throw new UserFacingError(
      "This generation already finished.",
      "NOT_CANCELABLE"
    )
  try {
    await provider.cancel(requestId)
  } catch (caught) {
    // HTTP 400 is this API's "already processing" signal. A provider-neutral
    // error taxonomy is future work; see docs/PROVIDER_ARCHITECTURE.md.
    if (caught instanceof PlatformError && caught.status === 400) {
      await generations.updateOne(
        { _id: gen._id, status: "queued" },
        { $set: { status: "in_progress", updatedAt: new Date() } }
      )
      throw new UserFacingError(
        "This generation already started, so it can't be canceled.",
        "NOT_CANCELABLE"
      )
    }
    throw caught
  }
  await finalizeGeneration(gen._id)
}
