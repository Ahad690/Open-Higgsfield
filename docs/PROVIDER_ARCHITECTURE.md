# Provider architecture

Status: **implemented for one delivery API (Higgsfield)**, with a
provider-neutral pipeline around it. This document describes code that exists
today; anything planned is marked *Not implemented*.

Date: 2026-10-25 · Baseline commit: `133f556` · Changes are in the working tree.

## 1. Why the layer exists

Before this pass, the generation pipeline named one vendor in every file:
`submit.ts` called `higgsfield().submit`, `finalize.ts` polled
`higgsfield().status`, `cancel.ts` called `higgsfield().cancel`, the
reconciler queried `hfRequestId`, and uploads went straight to the platform.
The product is meant to switch delivery APIs without rewriting billing,
finalization or the UI, so the vendor calls and the job identity were moved
behind a small internal contract.

The Higgsfield client is **not** replaced: the adapter delegates to
`lib/higgsfield/client.ts`, which keeps the documented request shapes, retry
policy, ambiguous-submit handling and error mapping. Existing behaviour and
tests are unchanged.

## 2. Two different meanings of "provider"

| Concept | Field | Meaning | Example |
|---|---|---|---|
| Model producer | `ModelEntry.provider` | Company that trained the model | `"ByteDance"`, `"Kling"` |
| API provider | `ModelEntry.apiProvider` (optional) | API that delivers the model | `"higgsfield"` |
| Job owner | `GenerationDoc.providerId` | API that accepted this job | `"higgsfield"` |

`ModelEntry.provider` already meant the producer and is used by the picker and
docs; it was **not** overloaded. `apiProvider` defaults to the registry's
`DEFAULT_PROVIDER_ID` (`"higgsfield"`), so all 47 existing catalog entries
work without edits. The catalog still has exactly 47 entries (11 image, 36
video; 0 audio), and all of them currently resolve to Higgsfield.

## 3. The contract

`lib/providers/types.ts` is types-only (no `server-only`, no runtime imports)
because the shared catalog imports `ProviderId` from it. The runtime lives in
`lib/providers/index.ts` (`server-only`).

| Member | Required | Purpose |
|---|---|---|
| `id`, `label` | yes | Stable id, display name |
| `capabilities` | yes | Static set of operations this API really implements |
| `submit(request)` | yes | Send a catalog-built path/body; returns our `ProviderJob` |
| `status(requestId)` | yes | Poll the API; returns canonical status + artifacts |
| `cancel(requestId)` | no | Only if the API can cancel a queued job |
| `createUpload(contentType)` | no | Presigned upload ticket for reference media |
| `estimate(path, body)` | no | The API's own quote, used only to guard our price |

```ts
type SubmissionRequest = {
  path: string            // from `toPlatform`, never from a client
  body: Record<string, unknown>
  generationId: string    // the adapter builds its own callback URL from this
}
```

The callback URL is deliberately **not** part of the neutral request. Scheme,
route, query parameter and HMAC token are properties of the delivery API; the
Higgsfield adapter builds them with `webhookUrlFor(generationId)`.

`status` returns `ProviderJobStatus` with `{ status, requestId, artifacts,
error? }`. Artifacts keep a provider-reported `url` and `contentType`; the
existing finalizer copies those bytes into our storage before the URL can
expire.

### Canonical states

`lib/providers/status.ts` owns the vocabulary the database and UI understand:
`queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`. The
Higgsfield adapter maps its responses through `canonicalStatus`. The synonym
table is intentionally small; an unmapped state is lowercased and passed
through, and `isTerminalStatus` returns false for it. That is the safe reading:
an unknown state is never treated as success or as a refund trigger.

## 4. Resolution

`lib/providers/index.ts`:

- `providerById(id)` throws `UnknownProviderError` for an unregistered id; it
  never silently falls back to another API.
- `providerFor(model)` uses `model.apiProvider ?? DEFAULT_PROVIDER_ID`.
- `providerForGeneration(doc)` uses `doc.providerId ?? DEFAULT_PROVIDER_ID`.
  Jobs created before this pass have no `providerId`; they were all submitted
  through Higgsfield, so they resolve correctly without a data migration.
- `primaryProvider()` is used for model-independent operations (uploads).
- `providerRequestIdOf(doc)` reads `providerRequestId` first, then the legacy
  `hfRequestId`. Reads in pipeline code go through this accessor.

A catalog entry naming an unknown provider is a configuration error. `submit`
logs the detail and returns a neutral user message (`PROVIDER_UNAVAILABLE`)
instead of charging and failing later.

## 5. What each pipeline stage uses

| Stage | File | Provider usage |
|---|---|---|
| Submit | `lib/generations/submit.ts` | Resolves before pricing; `guardPrice(provider, …)` calls the optional estimate; `provider.submit`; stores `providerId` + `providerRequestId` |
| Finalize | `lib/generations/finalize.ts` | Resolves from the stored doc; polls with `provider.status`; checks `isTerminalStatus` |
| Cancel | `lib/generations/cancel.ts` | Resolves from the doc; requires `cancel`; rejects with `NOT_CANCELABLE` when the adapter has no cancel |
| Reconcile | `lib/generations/reconcile.ts` | Finds jobs with **either** request-id field; cancels through the adapter |
| Uploads | `lib/uploads.ts` | `primaryProvider().createUpload` (guarded when absent) |
| Webhook | `app/api/webhooks/higgsfield/route.ts` | Still a Higgsfield route; validates provider, request id and terminal state through the neutral helpers |
| Admin | `lib/admin.ts` | Displays the request id via `providerRequestIdOf` |

## 6. Job identity and migration

New fields on `GenerationDoc`:

```ts
providerId?: ProviderId
providerRequestId?: string
hfRequestId?: string   // legacy name, still written for Higgsfield
```

Rules:

1. **Dual-write, single source of truth.** For Higgsfield, `submit` and the
   webhook adopt path write both `providerRequestId` and `hfRequestId` with the
   same value. That keeps the legacy unique index, the admin view and old code
   working. For any future provider only `providerRequestId` is written.
2. **Dual-read.** `providerRequestIdOf` handles documents that only have the
   legacy field. Finalize, cancel, reconcile, admin and the webhook all use it.
3. **No destructive migration.** No existing job is rewritten. In-flight jobs
   created before the deploy finalize normally.
4. **Indexes.** `generations.request` (unique sparse on `hfRequestId`) stays.
   `generations.provider_request` is unique and **partial** on
   `{ providerId, providerRequestId }` with
   `partialFilterExpression: { providerRequestId: { $exists: true } }`, so
   `pending_submit` jobs (no id yet) and legacy jobs never collide on a null
   key. Two jobs cannot claim one provider job id.
5. **Ambiguous submits.** If the submit response is lost, the job stays
   `pending_submit`; the reconciler may mark it failed/refunded after two
   minutes, and a late webhook still adopts the request id and delivers the
   result. The adapter does not retry such a submit, because the API has no
   idempotency key.
6. **Provider mismatch.** A Higgsfield webhook for a job whose `providerId` is
   another provider is ignored rather than allowed to settle it.

## 7. Invariants that the refactor preserves

- Credentials and model paths stay server-side; `lib/providers/index.ts` and
  the adapter import `server-only`.
- Prices still come from `priceFor`/`quoteRequest` on the server. The provider
  estimate is a guard, never the sellable price.
- Credits still move only through `lib/billing/ledger.ts` in transactions; the
  debit still happens in the same transaction as the generation insert.
- Finalize is still the only path to a terminal state, still re-fetches status,
  still leases, still refunds idempotently.
- The browser still polls our database; the webhook payload is still untrusted.
- Ownership scoping and `auth()` are untouched by this change.

## 7.1 Offline provider guard (M2.1)

`lib/providers/destination.ts` is the single destination policy used by both
the environment parser and the client:

- `E2E_TEST_MODE=true` requires an explicit `HF_API_BASE_URL`. It must be an
  HTTP(S) origin with no embedded credentials, path, query or fragment, and its
  literal host must be loopback (`localhost`, the 127.0.0.0/8 range, `::1`, or
  an IPv4-mapped loopback). No DNS lookup is performed.
- `createHiggsfieldClient` validates at construction and again before every
  request. In protected mode it uses `redirect: "error"`, so a local service
  cannot redirect the request to a public host.
- Errors are `ProviderDestinationError` / `EnvError` messages that name the
  variable and the rule but never echo a secret-bearing URL.
- There is no fallback: an unreachable mock surfaces as a normal
  platform/ambiguous-submit error, and the existing reconciler handles the
  pending job.
- `E2E_TEST_MODE` is rejected when `NODE_ENV=production`, before any provider
  request. Local/github-actions E2E runs use `NODE_ENV=development`.
- `scripts/mock-bind.ts` applies the same literal-loopback rule to the mock's
  listen host and validates the port; wildcard, LAN and public binds are
  refused.

The mock's artifacts are deterministic fixtures, not model output:
`scripts/mock-artifacts.ts` writes labelled PNGs and
`scripts/mock-media/mock-output.mp4` is a checked-in labelled MP4. The mock
never serves `public/media`.

## 8. Deliberately not implemented

These are real gaps, not hidden behaviour:

- **Only one provider is registered.** No external provider was added because
  this pass had no verified contract, credentials or licence review for a
  second API. Adding one on guessed endpoints would violate the repo rules.
- **No neutral error taxonomy.** `cancel` still recognises Higgsfield's HTTP
  400 ("already started") by catching `PlatformError`. A provider that signals
  this differently needs that branch extended; the contract has no typed error
  union yet.
- **No per-provider price metadata.** `lib/billing/pricing*.ts` is still
  Higgsfield-shaped (`estimate` endpoint semantics, USD basis). A second
  provider needs its own pricing source and `guardPrice` support.
- **No provider-specific capability discovery per model.** `capabilities` is
  per adapter, not per model, and the catalog's `paths`/`toPlatform` remain the
  source of model request shape.
- **No multi-provider credential store.** Environment variables and the single
  `HF_*` client are unchanged.
- **No output normalization beyond artifacts.** Artifact kind/url/content type
  are normalized; dimensions and durations are derived by our own copy/probe
  pipeline, not by the adapter.

## 9. Adding a provider

1. Implement `GenerationProvider` in `lib/providers/<id>.ts`. Reuse an existing
   documented client; do not invent paths or fields.
2. Verify the contract against provider documentation and record the source
   URLs next to the mappings.
3. Add the id to `ProviderId` and the registry. Decide its default status
   mapping and terminal set.
4. Annotate only the catalog entries it delivers with `apiProvider: "<id>"`.
   Leave `provider` as the model producer.
5. Decide how the provider reports job ids and whether it supports callbacks;
   build the callback URL inside the adapter.
6. Add a local fixture (see `tests/support/harness.ts`) and tests for submit,
   status, terminal mapping, cancellation (if supported), and one failure or
   ambiguous path. No paid calls.
7. Add pricing and entitlement handling before making any model sellable. An
   unpriced model must stay unsellable.
8. Document credential requirements in `.env.example`, never in client code.

## 10. Tests and evidence

`tests/providers.test.ts` (13 tests):

- registry defaults, explicit resolution, unknown-provider rejection, request
  id accessor order;
- canonical status mapping, unmapped status is not terminal;
- adapter declares its real capabilities;
- adapter submit goes through the existing client, keeps the catalog path and
  builds the HMAC callback URL;
- adapter status keeps artifacts and canonicalizes the state;
- a submitted generation stores `providerId`, `providerRequestId` and the
  `hfRequestId` mirror;
- a legacy document with only `hfRequestId` still finalizes;
- a stored job with an unregistered provider throws and does not refund;
- the partial unique index rejects a duplicated provider job id while allowing
  many pending jobs.

M2.1 adds `tests/provider-guard.test.ts` (destination policy, env fail-closed,
no-fallback), `tests/mock.test.ts` (artifacts, markers, retry/timeout) and
`tests/mock-bind.test.ts` (safe/unsafe binds), plus lifecycle retry/refund and
timeout-to-reconciler cases. Existing Higgsfield tests still pass, which is the
backward-compatibility evidence: catalog paths/bodies, pricing, webhook
finalization, refunds and reconciliation are unchanged.
