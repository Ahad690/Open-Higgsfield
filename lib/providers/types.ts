/**
 * Provider-neutral generation contract.
 *
 * "Provider" here means the API that *delivers* a model, not the company that
 * trained it. Those are separate facts and the catalog keeps them separate:
 * `ModelEntry.provider` is the model's producer ("ByteDance", "Kling"),
 * `ModelEntry.apiProvider` is the delivery API ("higgsfield"). One API serves
 * many producers' models, and one producer's model can be reachable through
 * more than one API, so the two must never be collapsed into one field.
 *
 * The contract is deliberately small: only `submit` and `status` are required,
 * because every generation path needs both (status is the only safe way to
 * reach a terminal state). `upload`, `cancel` and `estimate` are optional and
 * advertised through `capabilities`, so no provider is forced to pretend it
 * supports something it does not.
 *
 * Types only: this module is imported by the shared catalog, so it must stay
 * free of `server-only` and of runtime imports.
 */

export type ProviderId = "higgsfield"

/** Lifecycle operations a provider may implement. */
export type ProviderCapability =
  | "submit"
  | "status"
  | "cancel"
  | "upload"
  | "estimate"

export type ProviderArtifactKind = "image" | "video" | "audio" | "file"

/** A file the provider reports for a finished job (a temporary provider URL). */
export type ProviderArtifact = {
  kind: ProviderArtifactKind
  url: string
  contentType?: string
}

export type ProviderJobStatus = {
  /** Raw provider status; compare against the provider's terminal set. */
  status: string
  requestId: string
  artifacts: ProviderArtifact[]
  error?: string
}

export type SubmissionRequest = {
  /** Provider model path from the catalog (`toPlatform`), never from a client. */
  path: string
  body: Record<string, unknown>
  /**
   * Our generation id. A provider that supports callbacks builds its own
   * callback URL from it (scheme, secret and route are provider-specific).
   */
  generationId: string
}

/** A job accepted by the provider, in our own terms. */
export type ProviderJob = {
  providerId: ProviderId
  requestId: string
  status: string
}

/** Presigned upload the browser PUTs to, then confirms with the server. */
export type ProviderUploadTicket = {
  upload_url: string
  public_url: string
  content_type: string
  upload_headers: Record<string, string>
}

/** The provider's own pre-submit quote; used only to guard our selling price. */
export type ProviderEstimate = { credits: number; usd: number }

export interface GenerationProvider {
  readonly id: ProviderId
  readonly label: string
  /** Operations this provider really implements (see the optional members). */
  readonly capabilities: ReadonlySet<ProviderCapability>
  submit(request: SubmissionRequest): Promise<ProviderJob>
  status(requestId: string): Promise<ProviderJobStatus>
  cancel?(requestId: string): Promise<void>
  createUpload?(contentType: unknown): Promise<ProviderUploadTicket>
  estimate?(path: string, body: Record<string, unknown>): Promise<ProviderEstimate>
}
