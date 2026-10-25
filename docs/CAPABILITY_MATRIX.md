# Capability matrix

Actual state of the code at `133f556` plus the provider slice in the working
tree. Milestones are defined in `docs/ROADMAP.md`; `M0` = baseline, `M1` =
provider slice (this pass).

Legend: **Hosted?** = needs a paid/hosted model API · **Det.?** = can be built
deterministically with ordinary software (no model inference) · **Tests** =
existing automated coverage, by file.

| # | Capability | Current implementation | Code | Tests | Missing | Hosted? | Det.? | Licensing / data | Milestone |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Image generation | 11 catalog entries, submit → poll → copy → library | `generation/catalog/models/*`, `lib/generations/*` | catalog snapshots, lifecycle submit/finalize | no non-Higgsfield delivery | yes | no | provider terms; outputs copied to our storage | done (M0) |
| 2 | Image editing / reference images | image entries with `reference` roles; custom mappers | `generation/to-platform.ts`, model files | catalog snapshots + rejection cases | masks/inpainting UI beyond provider params; no local editor | yes | partly (crop/compose) | reference images may be personal data | done (M0) / M4 local edits |
| 3 | Text-to-video | 26 video `create` entries | `generation/catalog/models/*` | catalog snapshots | second provider | yes | no | provider terms; outputs re-hosted | done (M0) |
| 4 | Image-to-video, start/end frames | `start`/`end` roles, required-role validation | `generation/catalog/types.ts`, model files | catalog rejections (`end` without `start`, etc.) | — | yes | no | same | done (M0) |
| 5 | Reference / omni / motion transfer | `reference`, `video`, `source` roles; Kling motion entries | model files, `to-platform.ts` | catalog snapshots incl. Kling motion rejections | identity consistency tooling | yes | no | likeness/consent risk; no consent model stored | M5 |
| 6 | Video edit / extend | 5 video `edit` entries with source-video validation | model files | catalog snapshots, "requires source video" | local timeline editing | yes | partly | provider terms | M4 |
| 7 | Audio generation / TTS / music | **none**: 0 audio models; audio upload/player plumbing exists | `generation/catalog`, uploads, `components/studio` | upload contract, WAV probe | any audio model entry; voice selection | yes | no (TTS is model output) | voice cloning needs explicit consent | M3 (blocked on contract) |
| 8 | Transcription / captions | not implemented | — | — | ASR dependency, word timing, layout | partly (whisper local) | yes, with local ASR | audio is personal data; retention | M4 |
| 9 | Burn-in captions / subtitles | not implemented | — | — | FFmpeg dependency not installed/verified | no | yes | fonts need licences (see audit) | M4 |
| 10 | Trim / concat / reframe / transcode | not implemented; uploads are validated, not transformed | `lib/storage` | probe only | FFmpeg/executor, job model, QC | no | yes | codec licences; user media | M2/M4 |
| 11 | Thumbnails / contact sheets | not implemented | — | — | image decoder/resizer | no | yes | user media | M2 |
| 12 | Media metadata / QC | header-only probe: PNG/JPEG/WebP/GIF dimensions, MP4/MOV duration+size, WAV duration | `lib/storage/probe.ts` | `tests/units.test.ts` media probes | fps/codec/loudness; ffprobe path | no | yes | none beyond user media | M2 |
| 13 | Character / reusable references | asset library + reference uploads; no character entity | `lib/uploads.ts`, `lib/generations/library.ts` | ownership tests | character records, consent state, reuse UI | yes for training | no | biometric/consent; high risk | M5 |
| 14 | Projects / assets / history | projects, library pages, publish/unpublish, delete, move | `lib/generations/library.ts`, `app/(app)`, `components/library` | ownership test in lifecycle | richer search/tagging | no | yes | user data retention/deletion | M2 |
| 15 | Multistep workflows / DAG | not implemented (deliberately) | — | — | job chaining by id, then an editor | mixed | yes (orchestration) | none inherent | M5 |
| 16 | Multiple delivery providers | registry + neutral contract; **1 registered** (Higgsfield) | `lib/providers/*` | `tests/providers.test.ts` (13) | a verified second contract, credentials, pricing | yes | no | per-provider terms; unverified APIs must not ship | M1 done / M3 blocked |
| 17 | Open-weight / self-hosted models | not implemented | — | — | runtime, GPUs, model licences | no (self-host) | partly | model licences vary; GPU cost | deferred |
| 18 | Auth / sessions / ownership | Auth.js magic link (Resend), DB sessions, `requireUser`, `userId` scoping, 404 for others | `auth.ts`, `app/actions`, `lib/auth` | lifecycle ownership, access E2E spec (CI: pass) | — | no | yes | email/PII | done (M0) |
| 19 | Credits / subscriptions / Stripe | ledger with buckets, plans, checkout, portal, idempotent webhooks | `lib/billing/*`, `app/api/webhooks/stripe` | units, pricing, webhooks (Stripe), lifecycle | multi-currency/tax; dunning | no | yes | payment PII (Stripe) | done (M0) |
| 20 | Server-side pricing + guard | `priceFor`/`quoteRequest`, generated price table, live estimate guard, placeholder prices unsellable | `lib/billing/{price,pricing,pricing-table}.ts`, `submit.ts` | pricing tests, placeholder test | per-provider pricing sources | partly | yes | provider price terms | M0 done / M3 per provider |
| 21 | Moderation / reporting / consent | `nsfw` terminal state and refund; user report dialog; no pre-submit moderation or consent record | `lib/generations/finalize.ts`, `components/marketing/report-dialog.tsx` | finalize refund tests | pre-submit screening, consent ledger, appeals | yes (moderation API) | partly (blocklists) | **high**: likeness, minors, copyright | M5 |
| 22 | Offline / mock operation | mock API: submit, status, cancel, uploads, estimate; `[fail]`, `[nsfw]`, `[slow]` | `scripts/mock-higgsfield.ts` | manual smoke (this pass); unit fake in `tests/support/harness.ts` | unmistakable mock media, rejected-input mode, 429/5xx and timeout simulation | no | yes | mock outputs use repo sample media (provenance unrecorded) | M2 |
| 23 | Capability discovery | static adapter `capabilities` + catalog roles/settings/modes | `lib/providers/index.ts`, `generation/catalog/types.ts` | providers tests, catalog tests | per-model provider capability metadata; availability states | no | yes | — | M3 |
| 24 | Licence / provenance registry | documents only, no runtime registry | `docs/SOURCE_AND_LICENSE_AUDIT.md` | none | asset provenance fields, licence gate before publish | no | yes | **release blocker** (see audit) | M2 |

## Notes on non-obvious rows

- **47 entries, 11 image / 36 video / 0 audio.** Counts are from
  `MODELS.length` at this commit, not the README. Every entry uses a custom
  `toPlatform` mapper, so “capability discovery” is code-driven, not a generic
  schema interpreter.
- **Audio is input-only.** Uploads accept audio (`audio/mpeg`, WAV, etc.), the
  upload probe reads WAV duration, and audio references price source-length
  endpoints. There is no audio generation model, no TTS and no player content
  beyond uploaded references.
- **Probe is deliberately dependency-free.** `lib/storage/probe.ts` reads
  headers only; it does not decode frames, read codecs, measure loudness or
  validate corruption. That is why it runs on serverless hosts and why it is
  not a substitute for FFprobe.
- **The mock is a state machine, not inference.** It returns the repository's
  own sample JPG/MP4 files. They are real photographs/videos, not visibly
  synthetic placeholders, which is an honesty gap for “unmistakably mock data”.
  It also cannot simulate 429/5xx or a rejected submit; those paths are covered
  by the unit fake (`FakeHiggsfield.nextSubmit`), not the dev mock.
- **Moderation today is reactive.** The platform can return `nsfw`, which is
  refunded and shown as blocked. Nothing screens a prompt before spending a
  credit, and there is no recorded consent for face/voice inputs. That is a
  product and legal gap, not a bug in the existing flow.
- **The provider layer is infrastructure, not a second integration.** It makes
  adding a verified provider cheap; it does not claim multi-provider support.
  The only registered provider is Higgsfield, and all catalog entries default
  to it.
