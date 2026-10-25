import "server-only"

import type { ModelEntry } from "@/generation/catalog/types"

import { higgsfieldProvider } from "./higgsfield"
import type { GenerationProvider, ProviderId } from "./types"

/**
 * The provider registry: the one place that knows which delivery API serves a
 * model, so the generation pipeline never names a vendor directly.
 *
 * Adding a provider is additive: implement `GenerationProvider`, register it
 * here, and annotate the catalog entries it delivers with
 * `apiProvider: "<id>"`. Models with no `apiProvider` are delivered by the
 * default provider, which is why the entire existing catalog needed no edits
 * when this layer was introduced.
 */

const PROVIDERS: Record<ProviderId, GenerationProvider> = {
  higgsfield: higgsfieldProvider,
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

/** Used for catalog entries that don't name a provider, and for uploads. */
export const DEFAULT_PROVIDER_ID: ProviderId = "higgsfield"

export class UnknownProviderError extends Error {
  constructor(readonly providerId: string) {
    super(`No provider registered for "${providerId}".`)
    this.name = "UnknownProviderError"
  }
}

export function isProviderId(value: string): value is ProviderId {
  return Object.hasOwn(PROVIDERS, value)
}

/** Look up by id; throws rather than silently falling back to another provider. */
export function providerById(id: string): GenerationProvider {
  if (!isProviderId(id)) throw new UnknownProviderError(id)
  return PROVIDERS[id]
}

/** The provider that delivers a model (default when the catalog doesn't say). */
export function providerFor(
  model: Pick<ModelEntry, "id" | "apiProvider">
): GenerationProvider {
  return providerById(model.apiProvider ?? DEFAULT_PROVIDER_ID)
}

/**
 * The provider that serves a stored generation. Reads `providerId`, which every
 * job written since the provider layer exists carries; jobs created before it
 * have no field and were all submitted through the Higgsfield API.
 */
export function providerForGeneration(generation: {
  providerId?: string
}): GenerationProvider {
  return providerById(generation.providerId ?? DEFAULT_PROVIDER_ID)
}

/** Uploads are not model-bound, so they use the configured primary provider. */
export function primaryProvider(): GenerationProvider {
  return providerById(DEFAULT_PROVIDER_ID)
}

/**
 * The provider's job id for a generation.
 *
 * `providerRequestId` is the provider-neutral field. `hfRequestId` is the
 * original, provider-specific name: it stays readable for jobs created before
 * the provider layer (no destructive migration, no orphaned in-flight work) and
 * is still written by the Higgsfield adapter as a compatibility mirror.
 */
export function providerRequestIdOf(generation: {
  providerRequestId?: string
  hfRequestId?: string
}): string | undefined {
  return generation.providerRequestId ?? generation.hfRequestId
}

export type { GenerationProvider, ProviderId } from "./types"
