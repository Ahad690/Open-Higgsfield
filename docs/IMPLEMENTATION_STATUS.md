# Implementation status

Snapshot: 2026-10-25 · baseline commit `133f556` · source and docs changes remain
uncommitted in the local working tree for review. A temporary branch,
`ci/provider-abstraction`, was pushed to GitHub only to run the offline checks on
GitHub Actions after the local machine ran low on RAM. Nothing was deployed.

## 0. Where the code is

The workspace root was a research archive (documents, manifest, zip) and was
not a Git repository. The public baseline was cloned into a nested directory:

```
C:\Users\subha\Documents\PROJECTS\Open-Higgsfield\vireo   # app, git 133f556
C:\Users\subha\Documents\PROJECTS\Open-Higgsfield\*.md     # research archive
```

Cloning in place would have overwritten the archive's `README.md`, so the app
was cloned into `vireo/`. The parent directory remains untouched and is not a
Git repository. No file in the research archive was modified.

## 1. Baseline audit

The generation path was traced through code and tests, not just the README:

| Step | Where |
|---|---|
| Picker / panel | `components/generator/*`, `generation/catalog/models/*` |
| Validation | `lib/generations/submit.ts` (`submitSchema`), `generation/catalog/parse-settings.ts` |
| Catalog + request construction | `generation/catalog/**`, `generation/to-platform.ts` |
| Media/upload ownership | `lib/generations/media.ts`, `lib/uploads.ts` |
| Pricing and quota | `lib/billing/price.ts`, `pricing.ts`, `lib/env.ts`, `lib/rate-limit.ts` |
| Debit + record | `lib/generations/submit.ts` + `lib/billing/ledger.ts` (one Mongo transaction) |
| Provider submission | `lib/higgsfield/client.ts` via `lib/providers/higgsfield.ts` |
| Status | `GET /api/generations/status` (our DB only), webhook, reconciler |
| Finalize / copy | `lib/generations/finalize.ts`, `lib/storage/index.ts` |
| Refund / timeout / reconcile | `lib/generations/reconcile.ts`, `lib/billing/ledger.ts` |
| Library / assets / projects | `lib/generations/library.ts`, `app/(app)`, `components/library` |

Findings:

- Billing, auth and ownership were healthy on inspection: server-side prices,
  ledger-only mutations inside transactions, `auth()`/`requireUser` on actions
  and routes, `userId`-scoped reads, idempotent finalize/refund, untrusted
  webhook payloads re-fetched, ambiguous submits reconciled rather than
  retried, and the browser polling only our DB.
- There was no provider-neutral layer: every stage named Higgsfield or
  `hfRequestId` directly. That was the highest-value safe change (Priority B).
- The catalog is large and all-Higgsfield: **47 entries** — 11 image
  (`create`), 26 video `create`, 5 video `edit`, 5 video `motion` — across 10
  model producers. There are **0 audio models**. All 47 use a custom
  `toPlatform` mapper; none rely on the shared `paths` shortcut.
- The catalog's `provider` field means the **model producer** (ByteDance,
  Kling, …), so it was left alone; a separate optional `apiProvider` was added.

## 2. Baseline check results

Command: `pnpm` scripts from `package.json`; Node/pnpm as installed in this
environment; Windows 11.

### 2.1 First attempt (mongod binary not cached)

| Check | Result |
|---|---|
| `pnpm typecheck` | **pass**, exit 0 |
| `pnpm lint` | **pass**, exit 0 |
| `pnpm test` | **could not run fully**: `mongodb-memory-server` was downloading MongoDB 8.2.6; the hard-coded `beforeAll(startDatabase, 120_000)` timed out. 427 tests passed, 129 skipped, 2 suites failed in `beforeAll`. |
| `pnpm build` | not run at that point |

This was an environment limitation, not a code failure. The binary was
pre-downloaded into the user cache, after which the suite ran.

### 2.2 Pristine baseline (separate git worktree at `133f556`, binary cached)

| Check | Result |
|---|---|
| `pnpm typecheck` | **pass**, exit 0 |
| `pnpm lint` | **pass**, exit 0 |
| `pnpm test` | 5 files: **455 passed, 1 failed, 100 skipped** (11.7 s). The failure is `tests/webhooks.test.ts` → “never trusts the payload”; it waits 50 ms for the `after()` finalize under load. The same file passes 8/8 when run alone. **Pre-existing timing flake**, reproduced without this change. |
| `pnpm build` | **not executable in that worktree**: `node_modules` was a junction to the main checkout and Turbopack rejected it (“Symlink [project]/node_modules is invalid, it points out of the filesystem root”). Harness artifact, not a code failure. |

No test was skipped or altered to make the baseline look green.

### 2.3 Working tree with the provider change

| Check | Result |
|---|---|
| `pnpm typecheck` | **pass**, exit 0 |
| `pnpm lint` | **pass**, exit 0 |
| `pnpm test` | 6 files: **469 passed, 100 skipped** (15.2 s). This is the 456 pre-existing tests plus 13 new provider tests. |
| `pnpm test` (first full run, concurrently with the baseline suite) | 468 passed, 1 failed — the same pre-existing webhook timing flake. Passed on a clean rerun. |
| `pnpm build` | **pass**, exit 0. `next build` emitted 30 static/dynamic routes and the post-build scan printed `[secrets] client bundle clean`. The build log notes `pricing`/`community` unavailable because `MONGODB_URI` is not set, which is expected without a database and does not fail the build. |
| `pnpm test:e2e` (local) | **34 passed, 1 failed** (8.2 min) against the local mock stack. The failure was `e2e/access.spec.ts:16`: after creating a project the page stayed on `/assets` instead of `/projects/:id`. The same suite passed **35/35** in GitHub Actions; see §2.5. |

These four commands were run again after the final source and test edits, with
the same results (typecheck 0, lint 0, 469 passed / 100 skipped, build 0).

### 2.4 Offline mock smoke test (no DB, no credentials, no paid calls)

Started `npx tsx scripts/mock-higgsfield.ts` with a dummy
`Authorization: Key mock:mock` header and exercised it directly:

- normal prompt → `status=completed`, 1 image artifact at
  `http://localhost:4010/samples/presets/dolly-zoom.jpg`;
- `[fail]` prompt → `status=failed`, `error=Generation failed (mock)`.

The mock process was stopped afterwards. This proves the documented offline
development path still works after the refactor.

### 2.5 E2E and continuous integration

The local machine had about 1.5 GB of free RAM, so the E2E stack was also run on
GitHub Actions at the user's request. `.github/workflows/ci.yml` has two Ubuntu
jobs:

- `checks`: frozen install, typecheck, lint, unit tests, production build;
- `e2e`: bundled Playwright Chromium, then `pnpm db:dev`,
  `pnpm mock:higgsfield` and `pnpm dev`, followed by `pnpm test:e2e`.

The workflow writes only dummy local values. Every provider call goes to
`localhost:4010`; no real credential, paid endpoint, Stripe key or R2 bucket is
used. Logs and Playwright artifacts are uploaded when the E2E job finishes.

| Run | Result |
|---|---|
| Local Windows, 2026-10-25 | **34 passed, 1 failed** in 8.2 min. The failure was `e2e/access.spec.ts:16`, before any provider call, when the project-creation redirect stayed on `/assets`. |
| GitHub Actions run [40181777304](https://github.com/Ahad690/Open-Higgsfield/actions/runs/40181777304), commit `d66a2b4` | **35 passed** in 1.9 min; the `checks` job passed in 46 s. |

The local failure did not reproduce in CI and its step does not exercise the
provider layer. It is recorded as a local memory/timing failure, not claimed as
green locally. The CI run is the authoritative E2E result. The same branch was
used only for verification; local `main` remains uncommitted.

### 2.6 Generated files

`next build` regenerates `generation/catalog/models.generated.ts`; Vitest
touches `tests/__snapshots__/catalog.test.ts.snap`. Both showed as modified
only because of CRLF/LF normalisation — `git hash-object` matched the committed
blob before restore. They were restored, and no snapshot was updated to hide a
failure.

## 3. What was implemented

**Priority B: provider abstraction around the existing Higgsfield integration.**
Backward compatible by construction; no second provider was invented.

New files:

- `lib/providers/types.ts` — neutral contract and capability types (types
  only, safe for the shared catalog).
- `lib/providers/index.ts` — registry, `providerById`, `providerFor`,
  `providerForGeneration`, `primaryProvider`, `providerRequestIdOf`,
  `UnknownProviderError`.
- `lib/providers/higgsfield.ts` — adapter that delegates to the existing
  `lib/higgsfield/client.ts` and builds the Higgsfield callback URL.
- `lib/providers/status.ts` — canonical states, synonym mapping and
  `isTerminalStatus`.
- `tests/providers.test.ts` — 13 focused tests.
- `docs/PROVIDER_ARCHITECTURE.md` — the actual design and its limits.

Changed files:

| File | Change |
|---|---|
| `generation/catalog/types.ts` | optional `apiProvider?: ProviderId`; `provider` stays the model producer |
| `lib/db/collections.ts` | `providerId?`, `providerRequestId?`; documented legacy `hfRequestId` |
| `lib/db/indexes.ts` | partial unique index `generations.provider_request` |
| `lib/generations/submit.ts` | registry resolution, provider estimate guard, stores provider fields, dual-writes the Higgsfield mirror |
| `lib/generations/finalize.ts` | resolves provider from the stored job, polls via the adapter, uses `isTerminalStatus` and `providerRequestIdOf` |
| `lib/generations/cancel.ts` | resolves provider + request id; requires a real `cancel` capability |
| `lib/generations/reconcile.ts` | matches either request-id field; cancels through the adapter |
| `lib/uploads.ts` | `primaryProvider().createUpload` |
| `lib/admin.ts` | request id through `providerRequestIdOf` (same admin column) |
| `app/api/webhooks/higgsfield/route.ts` | provider/request-id checks, neutral terminal set, dual-write on adoption |
| `.github/workflows/ci.yml` | Ubuntu checks + offline E2E; dummy local env, loopback provider only |

Preserved intentionally: every Higgsfield path/body mapping, pricing and
ledger flow, webhook HMAC and re-fetch, finalize lease/refund logic, upload
ticket signing, auth and ownership scoping.

## 4. Test coverage added

`tests/providers.test.ts`:

1. registry defaults to Higgsfield for entries without `apiProvider`;
2. explicit `apiProvider` resolves and stays distinct from `provider`;
3. unknown provider ids throw instead of falling back;
4. `providerRequestIdOf` prefers the neutral field and reads legacy jobs;
5. canonical status synonyms map correctly;
6. unmapped states pass through and are not terminal;
7. adapter declares only its real operations;
8. adapter submit keeps the catalog path and adds the HMAC callback URL;
9. adapter status keeps artifacts and canonicalizes the state;
10. submitted generation stores `providerId`, `providerRequestId` and the
    legacy mirror;
11. a document with only `hfRequestId` still finalizes to `completed`;
12. a stored job with an unregistered provider throws and refunds nothing;
13. the partial unique index rejects a duplicated provider job id while
    allowing many pending jobs.

## 5. Known limitations and blockers

- **No second provider.** No additional API contract, credential set or
  licence review was available locally, so only the interface and fixtures
  exist (Priority D deferred by design). See `docs/PROVIDER_ARCHITECTURE.md`
  §8 for the exact missing pieces.
- **Pre-existing webhook test flake.** `tests/webhooks.test.ts:257` waits a
  fixed 50 ms for Next's `after()`. It fails under CPU load in both the
  pristine baseline and this tree. Not introduced here; left unchanged because
  changing it would alter an existing test unrelated to this slice.
- **Local E2E had one failure.** The Windows run was 34/35; `e2e/access.spec.ts`
  did not reach `/projects/:id` after project creation. The same suite passed
  35/35 in GitHub Actions, and the failing step precedes any provider call. It
  is not claimed as locally green; CI is the authoritative E2E result (§2.5).
- **No live price verification.** No paid calls or credentials were used, so
  the price tables in `lib/billing/pricing-table.ts` and the generated
  `pricing.generated.json` were not re-validated against the provider. Models
  with `placeholder` prices remain unsellable on the live API by design.
- **Mock fidelity gaps** (see `docs/CAPABILITY_MATRIX.md`): outputs are the
  app's real sample media rather than unmistakable mock frames; `[fail]`,
  `[nsfw]` and `[slow]` exist, but there is no deterministic rejected-input
  mode, no 429/5xx simulation, and the estimate endpoint returns a fixed
  $0.01 regardless of model.
- **Licensing/provenance unresolved** at repository level: no root LICENSE,
  template licence unconfirmed, sample media provenance unrecorded. See
  `docs/SOURCE_AND_LICENSE_AUDIT.md`.
- **CI branch left on the remote.** `ci/provider-abstraction` exists only to run
  Actions; nothing was merged or deployed. It can be deleted once the results
  have been reviewed.

## 6. Definition-of-done check

| Requirement | Status |
|---|---|
| Baseline inspected and results recorded | yes, §1–2 |
| Substantive tested improvement | yes, provider layer + 13 tests |
| Core functionality not knowingly broken | yes, all pre-existing unit/build checks pass; E2E 35/35 in CI; one local E2E environment failure is recorded, not hidden |
| Existing Higgsfield integration preserved | yes, adapter delegates to the existing client |
| Offline/mock usable | yes, smoke-tested §2.4 and full E2E in CI §2.5 |
| Billing/auth/ownership intact | untouched; verified by existing tests and diff review |
| Docs describe real code | yes, five documents under `docs/` |
| Remaining work prioritised | `docs/ROADMAP.md` |
