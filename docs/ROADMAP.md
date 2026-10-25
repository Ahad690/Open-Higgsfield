# Roadmap

Phased from the code that exists at `133f556` plus the provider slice in the
working tree. Each milestone states what must already be true, what changes,
how it is verified, and what it costs. This is not a greenfield plan: the
catalog, billing ledger, auth, storage and lifecycle stay where they are.

Status at a glance:

| Milestone | Theme | State | Gate |
|---|---|---|---|
| M0 | Baseline, audit, trust | **done** | — |
| M1 | Provider seam around Higgsfield | **done** | — |
| M2 | Offline fidelity, deterministic media, provenance | next | no credentials needed |
| M3 | Second delivery provider | **blocked** | verified contract + licence + pricing |
| M4 | Editing, captions, export | after M2 media base | local CPU only |
| M5 | Characters, workflows, moderation/consent | after M3/M4 evidence | legal/product decisions |
| M6 | Open-weight / self-hosted models | deferred | GPU economics + model licences |

The ordering is deliberate. M2 makes every later milestone testable without
spending money and closes the two honesty gaps this pass found (mock media looks
real; sample-media provenance is unrecorded). M3 is the only milestone that
depends on material we do not have, so it must not hold up M2 or M4.

---

## M0 — Baseline and trust (done)

Delivered:

- full generation-path audit (`docs/IMPLEMENTATION_STATUS.md` §1);
- baseline and post-change check results, including the environment failures that
  were real (`docs/IMPLEMENTATION_STATUS.md` §2);
- provenance and licence review (`docs/SOURCE_AND_LICENSE_AUDIT.md`);
- capability matrix with code and test locations (`docs/CAPABILITY_MATRIX.md`);
- `.github/workflows/ci.yml`, which runs the offline stack and the existing
  Playwright suite on GitHub Actions. Run
  [40181777304](https://github.com/Ahad690/Open-Higgsfield/actions/runs/40181777304)
  passed 35/35 E2E tests in 1.9 min plus the typecheck/lint/unit/build job.

The local Windows E2E attempt was 34/35. The one failure was a project-creation
navigation step that did not reach `/projects/:id`, before any provider call,
and it did not reproduce in CI. It is recorded honestly in
`docs/IMPLEMENTATION_STATUS.md` §2.5; CI is the authoritative result.

No product code changes in M0 beyond what M1 already merged.

## M1 — Provider seam (done)

Delivered in the working tree:

- `lib/providers/{types,index,higgsfield,status}.ts` — neutral contract,
  registry, Higgsfield adapter, canonical terminal states;
- `providerId` / `providerRequestId` on generations with a partial unique index,
  `hfRequestId` kept as the Higgsfield mirror and read for old jobs;
- submit, finalize, cancel, reconcile, uploads, admin and the webhook route
  resolve through the registry;
- 13 provider tests, including legacy-job finalization, unknown-provider
  no-refund, and duplicate job-id rejection.

Deliberately still Higgsfield-shaped (do not "fix" without a second provider):

- the webhook path `/api/webhooks/higgsfield` and its HMAC token;
- `lib/higgsfield/client.ts` as the only HTTP implementation;
- the admin request-id column label.

Small follow-ups that are safe before M3:

- expose `apiProvider` in the admin generation view (today only the request id
  is shown);
- a test that a catalog entry with an explicit non-default `apiProvider` is
  rejected when that provider is not registered at submit time;
- document the one-time index creation behaviour for an existing database
  (`lib/db/indexes.ts` is idempotent, but verify against a database that already
  contains generations before deploying).

## M2 — Offline fidelity, deterministic media, provenance

Goal: the app can be explored, tested and demonstrated with **no external
service and no paid call**, and local media work is real rather than decorative.

No credentials, no provider contract and no new hosted dependency are required.

### M2.1 Honest mock — delivered (working tree)

The mock now serves generated, visibly labelled artifacts instead of
`public/media` samples:

1. **Unmistakable media.** Images are encoded at request time as 1280×720 PNGs
   with `VIREO LOCAL MOCK`, `MOCK OUTPUT`, `NOT AI-GENERATED`, the request id,
   model and timestamp, plus a PNG `tEXt` provenance record. Video models return
   the checked-in `scripts/mock-media/mock-output.mp4` (same labels; 3 s,
   1280×720, H.264). `scripts/generate-mock-media.mjs` / `pnpm mock:media`
   reproduces it; ffmpeg is not a runtime dependency.
2. **Deterministic failures.** `[reject]` → 422 before a job, `[429]` → 429 with
   `Retry-After`, `[500]` → 500, `[503]` → 503 with `Retry-After`, `[timeout]`
   → job accepted then response delayed, plus the existing `[fail]`, `[nsfw]`,
   `[slow]` and cancel paths. Named in `docs/runbook.md`.
3. **Estimate variation — not done.** The mock still returns a fixed estimate.
   The price guard is exercised by existing pricing tests, not by the dev mock;
   this remains a useful follow-up, and the mock does not claim the values are
   real.
4. **Loopback guard.** `E2E_TEST_MODE=true` requires an explicit loopback
   `HF_API_BASE_URL`; the client validates again at every request and refuses
   redirects. No fallback to the live provider. `E2E_TEST_MODE` is rejected
   under `NODE_ENV=production`. The mock refuses wildcard, LAN and public binds.
5. **Tests and docs.** `tests/provider-guard.test.ts`, `tests/mock.test.ts`,
   `tests/mock-bind.test.ts`, plus lifecycle retry/refund/timeout cases; runbook,
   README and `.env.example` updated.

Exit condition met for images/video and the documented outcomes. The estimate
variation item stays open as a small follow-up.

### M2.2 Local E2E stack

Delivered in M0: `.github/workflows/ci.yml` starts the mock, the local MongoDB
replica set and the dev server, then runs the existing Playwright specs. Keep it
offline-only (loopback provider, dummy env) and use it to prove M2.1 and M2.3 do
not break the app.

### M2.3 Deterministic media vertical slice

FFmpeg **is present on this machine** (`ffmpeg version 9.0-full_build-www.gyan.dev`,
`C:\Users\subha\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe`) but is **not a
repository dependency**, is not available on serverless hosts, and this build is
configured `--enable-gpl --enable-version3`. Do not vendor or bundle it. Call an
externally provisioned binary at an env-configured path and report its absence
honestly.

Scope, in order:

1. `lib/media/ffmpeg.ts`: binary detection (`ffmpeg -version`, `ffprobe
   -version`), `run(args, {timeout, maxOutputBytes})`, typed errors, no shell
   interpolation. Probe via `ffprobe -print_format json` for codec, fps,
   duration, dimensions; keep the existing header probe as the no-binary
   fallback.
2. Thumbnail + poster frame for a video the caller owns, written through the
   existing storage driver and recorded as an asset with `derivedFrom`.
3. Trim (stream copy first, re-encode only when necessary) and aspect-ratio
   reframe with an explicit fit mode. Reframe must not silently crop faces;
   expose the crop rectangle and show it in the UI.
4. A small `/api/media/derive` route handler or server action that: calls
   `auth()`, verifies the source generation/output belongs to the user (404
   otherwise), enforces a duration/size cap, is credit-free, and stores the
   derivative under the user's prefix. No provider call.
5. Tests: fixture media generated in-test by FFmpeg itself; skip with an
   explicit message when the binary is absent; assert exit codes and error
   mapping, ownership, and that no ledger entry is written.

Exit: one coherent operation (thumbnail) plus one structural operation (trim)
work end-to-end on a real file, are ownership-safe, and degrade to a clear
"ffmpeg not configured" error elsewhere. Do not build a timeline editor in M2.

Cost risk: CPU and disk only. Cap concurrency and output size; never accept a
client-supplied output path.

### M2.4 Provenance registry

- Add a manifest (for example `public/media/PROVENANCE.json`) with one record
  per bundled file: origin, creator/tool, date, licence or "unresolved", and
  the generation reference where applicable.
- Add a test that fails when a file under `public/media` has no record. This is
  the runtime counterpart to `docs/SOURCE_AND_LICENSE_AUDIT.md`.
- Resolve the 14 model-logo SVGs and the 48 sample media files before any public
  release; if rights cannot be established, replace them with generated or
  licensed assets.

Exit: the release checklist in the audit has a machine-checked first item.

## M3 — Second delivery provider (blocked)

Blocked on external facts, not on code. Do not start until **all** of these are
established from official documentation or a written contract:

1. Auth scheme, base URL, submit/status/cancel endpoints, request and response
   schemas, artifact TTL and download rules, error codes, rate limits, and
   whether submission is idempotent.
2. Terms that permit resale/credit-metered access by our users.
3. A price source we are allowed to use, or a per-request cost we can quote
   conservatively. Unverified numbers must remain unsellable, as the current
   `placeholder` price path already enforces.
4. A way to test without paid calls (fixture server or sandbox), and behaviour
   when credentials are absent (app still boots in offline mode).
5. A clear answer on callbacks: signed webhook, poll-only, or both.

Work once unblocked:

- `lib/providers/<name>.ts` implementing only the capabilities the provider
  really has; register it in `lib/providers/index.ts`;
- `apiProvider` on the catalog entries that map cleanly, without touching
  `provider` (model producer);
- a local fixture server and contract tests mirroring `FakeHiggsfield`;
- provider-specific price source and guard; per-provider concurrency/plan limits;
- status mapping added to `lib/providers/status.ts` only for documented states;
- docs: adapter contract, credential matrix, failure semantics.

Exit: one real model can be submitted end-to-end **against the fixture**, the
Higgsfield path still passes, and a missing credential leaves the app usable.

If the contract cannot be established, keep the interface and fixtures and do
not invent endpoints, parameters or prices. The local research reports are not a
contract (see the false-claim list in `docs/SOURCE_AND_LICENSE_AUDIT.md` §6).

## M4 — Editing, captions, export

Depends on M2.3's FFmpeg wrapper and on M2.2's E2E stack. All operations are
deterministic and credit-free; model calls are optional and separately priced.

1. **Captions without ASR first:** accept an SRT/VTT upload, validate timing and
   encoding, burn in with a bundled open-licence font (verify the font licence),
   and keep the subtitle file as an asset. This delivers a real caption feature
   with no model and no transcription risk.
2. **Optional transcription:** if a local ASR model is added, treat model weights
   as a separate licence review; store transcript provenance and let the user
   edit before burn-in. Do not upload user audio to a third party by default.
3. **Concat and audio:** concat owned clips with matching codecs; loudness
   normalisation to a documented target; keep originals immutable.
4. **Export presets:** short vertical, square, landscape; bitrate caps; job
   record with progress so long exports do not block a request.
5. **UI:** put these on an output's detail view (trim, poster, caption, export),
   not in a new editor surface. Every control must do something.

Verification: FFmpeg fixture tests, a golden-file test for one short clip
(hash or duration/dimension assertions, not pixel-perfect), E2E for the happy
path, and explicit unsupported-format errors.

Cost risk: CPU, storage growth. Add retention for derivatives and a per-user
quota before enabling in production.

## M5 — Characters, workflows, moderation/consent

Product and legal work dominates; do not start with a node-graph editor.

1. **Character entity:** named reference sets with a consent record (who is
   depicted, consent basis, expiry, deletion), reuse in the picker, and a hard
   block when consent is missing for a face/voice reference. Store no biometric
   templates beyond the uploaded references.
2. **Workflow primitive:** ordered steps referencing existing generation ids,
   with explicit input/output bindings. Start with a linear recipe (image →
   video → caption) and a "run again" action; only then consider branching.
3. **Pre-submit moderation:** optional blocklist/screening before debiting,
   reusing the existing `nsfw` refund path for provider-side rejections; appeals
   and an audit trail.
4. **Reporting:** the existing report dialog gets a queue and an admin decision
   record.

Exit: a character can be created, reused and deleted with its consent record;
a two-step workflow runs against the mock; a rejected submit is refunded exactly
once.

## M6 — Open-weight / self-hosted (deferred)

Only if M3/M4 show demand that hosted providers cannot meet. Entry criteria:
model licence permits commercial use, GPU cost per output is known, a runtime
exists that fits the deployment target, and the provider contract in
`lib/providers` can express its lifecycle. No action in this pass.

---

## Cross-cutting backlog (small, safe, ordered)

1. Fix the pre-existing webhook test flake: `tests/webhooks.test.ts:257` waits a
   fixed 50 ms for `after()`. Replace the sleep with a bounded poll
   (`waitFor` with a deadline) without weakening the assertion. This is test-only
   and would remove the only intermittent failure in the suite.
2. Add the mock startup guard from M2.1.4 before anything else in M2 — it is the
   safety property the mission cares about most.
3. Add `apiProvider` to the admin generation view and to the generation detail
   payload used by support; keep `provider` labelled as model producer.
4. Replace the fixed mock estimate with model-derived fake costs that are
   labelled mock, so the price-drift guard has a realistic shape.
5. Keep `docs/model-catalog.md` and `generation/catalog/models/*` in sync when a
   provider field changes; the generated barrel and snapshot must remain
   untouched by hand.

## Verification gate per milestone

| Milestone | Minimum evidence |
|---|---|
| M0 | typecheck, lint, unit tests, build; E2E 35/35 in CI |
| M1 | existing suite + `tests/providers.test.ts`; mock smoke test |
| M2 | unit tests for mock triggers/guard; FFmpeg tests with and without the binary; E2E offline; provenance manifest test |
| M3 | fixture-server contract tests; Higgsfield regression suite; no live paid call |
| M4 | FFmpeg golden tests; ownership tests; E2E happy path; no ledger writes |
| M5 | consent/ownership tests; idempotent refund test; moderation queue test |

Every milestone still has to pass the repository definition of done:
`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, plus E2E where a
running stack is available. A milestone is not done because a document
describes it.

## Explicit non-goals (unchanged from the mission)

- a full node-graph editor;
- training or hosting foundation models;
- a second billing system, auth system, database or storage layer;
- several provider integrations at once;
- a large UI redesign;
- 3D production tools;
- an autonomous creative agent before the primitives above are reliable.
