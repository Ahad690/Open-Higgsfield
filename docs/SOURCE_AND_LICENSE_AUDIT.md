# Source and licence audit

Scope: the application repository at commit `133f556`, its direct
dependencies, bundled static assets, and the research archive in the parent
directory. Method: local inspection only (file contents, lockfile,
`node_modules/*/package.json`, zip listing). No web requests, no legal advice,
no new licence applied.

**Bottom line:** the application's own code is internally consistent, but the
repository has **no root licence**, its UI is adapted from an upstream template
whose licence was unresolved at the documented review date, and it bundles
sample media and brand logos with **no recorded provenance**. Those are release
blockers for a public or commercial distribution, not blockers for continued
internal development (which this pass continued, as instructed).

## 1. Application repository

| Item | Finding |
|---|---|
| Root licence | **None.** No `LICENSE`, `COPYING`, `NOTICE` or `ATTRIBUTION` file is tracked. |
| Baseline history | Single commit `133f556` (“Initial commit: Vireo AI image and video studio”). No prior history to audit. |
| Copyright headers in app code | None found. The only “Copyright” string is a report-dialog reason label (`components/marketing/report-dialog.tsx`), not a notice. |
| README claim | “The brand, copy and media are ours.” Brand/copy ownership is asserted but unrecorded; media provenance is not recorded anywhere (see §4). |
| UI provenance | README and `AGENTS.md` state the Studio UI is scaffolded/adapted from `higgsfield-ai/app-templates` (commit `b29cdab`). `docs/decisions.md` records: **no LICENSE file as of 2026-09-26**; Higgsfield publishes it as a public shadcn registry for apps built on its API; template attribution comments are kept. |
| Template attribution comments | The provenance is documented in `README.md` and `docs/decisions.md`; there is no per-file header. Keep those statements and re-check upstream before release. |

No new root licence was created. Creating one would purport to grant rights
over template-derived UI and bundled assets whose status is unconfirmed.

## 2. Direct dependencies

Read from each installed package's `package.json` (lockfile pins the versions).

| Licence | Packages |
|---|---|
| MIT | `@base-ui/react`, `@react-email/components`, `@react-email/render`, `@tanstack/react-virtual`, `cn`, `next`, `react`, `react-dom`, `resend`, `server-only`, `shadcn`, `stripe`, `tw-animate-css`, `zod`, `zustand`; dev: `@tailwindcss/postcss`, `@types/*`, `eslint`, `eslint-config-next`, `mongodb-memory-server`, `prettier`, `prettier-plugin-tailwindcss`, `tailwindcss`, `tsx`, `vitest` |
| ISC | `@auth/mongodb-adapter`, `lucide-react`, `next-auth` |
| Apache-2.0 | `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `class-variance-authority`, `mongodb`; dev: `@playwright/test`, `typescript` |

Obligations that follow:

- MIT/ISC: retain copyright and permission notices in distributions.
- Apache-2.0: retain notices and include the licence text; check for `NOTICE`
  files in those packages when producing a distribution bundle.
- **Transitive** dependencies were not individually audited; the lockfile is
  the inventory. A full licence scan (e.g. `license-checker`) is required
  before release.

No GPL/AGPL/SSPL dependency was observed among direct dependencies.

## 3. Fonts

`app/layout.tsx` uses `next/font/google` for **Inter**, **Space Grotesk** and
**IBM Plex Mono**. All three families are SIL Open Font License 1.1 upstream,
and `next/font` self-hosts the font files in the build output. OFL requires the
licence text to accompany redistribution and forbids selling the fonts alone.

Action: include the three `OFL.txt` files (fetched from the upstream projects,
not from the research bundle) in the distribution notices. No font binaries are
committed to the repo.

## 4. Bundled media and logos

| Asset | Count / size | Provenance in repo |
|---|---|---|
| `public/media/{hero,loops,models,presets,showcase,steps}` | 48 files (42 JPG, 6 MP4), ~11.0 MB | **None recorded.** Used by marketing pages and by the dev mock as “generated” outputs. |
| `public/model-icons/*.svg` | 14 SVGs (Flux, Grok, Happy Horse, Higgsfield, Ideogram, Kling, LTX, MiniMax, …) | **None recorded.** Brand/model logos are third-party trademarks. |
| Test fixtures | `tests/support/harness.ts` generates PNG/MP4/WAV byte fixtures programmatically | Original test code. |

Risks:

- Photographs may depict identifiable people, private locations or third-party
  property. Without a release/provenance record, “we own it” cannot be
  substantiated.
- Model logos are trademarks. Nominative use to identify a model is common, but
  it is not covered by an open licence and should be reviewed before a public
  launch.
- The mock returns these real sample files as if generated, so any public demo
  using the mock could imply the media was AI-generated. See the mock gap in
  `docs/CAPABILITY_MATRIX.md` row 22.

Actions: add a `public/media/PROVENANCE.md` (or equivalent) listing source,
author, licence/release and retrieval date per file; replace anything without a
release; confirm logo usage or replace with neutral icons.

## 5. Research archive (parent directory, not part of the app)

The workspace contains an export archive plus generated research reports. It is
**not** a Git repository and was not modified.

| Material | Status | Use in this pass |
|---|---|---|
| `README.md`, `INVENTORY.md`, `MANIFEST.json`, `EXCLUSIONS.md`, `COMPATIBILITY-NOTES.md`, `ASSET-FROM-UPSTREAM.md`, `SCRIPT-FUNCTION-REFERENCE.md`, licence notices, `tools/verify_manifest.py` | Authored for the user; archive states they may be used, modified and redistributed without restriction | Read for requirements/provenance |
| `higgsfield_pass2_technical_capability_report.md`, `skill_catalog_decision_reference.md` | Prior-session documents produced for the user; archive claims no new rights | Read for architecture; not copied |
| `deep-research-report.md`, `higgsfield_capabilities_and_penora_ugc_workflow.md`, `higgsfield_supercomputer_conversation_dump.md`, prompts | Generated research/notes, not verified contracts | Treated as unverified |
| `higgsfield_reusable_resources.zip` (108,691 B) | Contains only the 12 documentation files above; **no code, audio, fonts or model binaries** (verified by listing) | Not extracted |

Excluded platform material (documented in `EXCLUSIONS.md`, not present here and
not copied into the app):

- 100 skill code files (2.17 MB) with no licence, header or package metadata;
- 393 `.ogg` files (8.9 MB): 338 CC0 upstream, 55 undetermined;
- 14 fonts (11.6 MB): 11 OFL/Unlicense, 3 undetermined;
- one YuNet ONNX model (MIT);
- a 48 MB zip whose contents were not inspected;
- 12 licence notice files.

The previous agent's private scripts are **specifications, not reusable
implementation**. This pass wrote its own provider layer and tests; no skill
code, prompt, font, sound or model binary was copied.

## 6. Unverified claims in the generated research

These claims were **not** used as production facts. They are recorded so a
future reader does not treat the reports as authoritative:

| Claim | Source | Problem |
|---|---|---|
| “Anthropic (Claude): Claude 3 can generate and edit images with prompts … ~$0.045 per 512px image” | `deep-research-report.md` lines 39, 51 | Claude is a text/vision **input** model family in the cited context; it is not an image-generation API, and the price has no cited basis. |
| “DALL·E 3 video” | `deep-research-report.md` line 67 | DALL·E 3 does not generate video. |
| “Higgsfield (ByteDance)” | `deep-research-report.md` line 48 | Conflates the delivery API with a model producer. Higgsfield delivers models from several producers (the app's catalog lists 10), which is exactly why the code now separates `apiProvider` from `provider`. |
| OpenAI image pricing “exact current rates are not public”; various per-image prices | `deep-research-report.md` lines 38, 50, 55 | Approximate/undated and partly contradicted by OpenAI's published pricing; not used. |
| “Stable Diffusion … licensed MIT/CreativeML” | `deep-research-report.md` line 53 | Overgeneralised: licences differ per model/version (e.g. OpenRAIL variants), and “CreativeML” is not a single licence. |
| ElevenLabs / Runway Gen-4.5 / Veo / Sora capability and price rows | `deep-research-report.md` table 1 | No local contract verification; not used to add any provider. |
| Provider adapter sketch (`ProviderAdapter`) | `higgsfield_pass2_technical_capability_report.md` §14.2 | Marked `[INF]` (inferred) by its own author. The implemented contract is smaller and follows the existing app; the report's richer `validate/buildPayload/events` split was not implemented. |

Consequence: **no external provider integration, price, quota or licence
conclusion was derived from these reports.** The one provider in code
(Higgsfield) is the repository's existing integration.

## 7. Model output rights and user content

- Generation outputs are subject to the delivery provider's terms. Higgsfield's
  terms were not reviewed here; the app copies outputs into its own storage,
  which is an operational requirement, not a licence grant.
- The app accepts face/voice/photo references and stores them under the user's
  id. There is no consent record, provenance field or retention policy specific
  to likeness data. This is a product/legal gap before launching character or
  voice features.
- The report dialog records user reports (`lib/db/collections.ts`), but there is
  no takedown workflow or repeat-infringer policy documented.

## 8. Release checklist (blocking)

1. Resolve `higgsfield-ai/app-templates` licensing in writing (or replace the
   template-derived UI) before distributing the app.
2. Choose and add a project licence **after** (1) and after the media/logo
   status is known. Do not license third-party material you cannot grant.
3. Produce `THIRD-PARTY-NOTICES` covering direct and transitive dependencies,
   the three OFL font texts, and any asset licences.
4. Record provenance/releases for all 48 sample media files; replace
   unverifiable ones.
5. Review model-logo usage; replace with neutral icons if not permitted.
6. Confirm provider terms for commercial use, output ownership, retention and
   moderation obligations.
7. Keep the research archive out of the shipped app; it contains restricted
   inventory references even though the binaries themselves were excluded.
8. Re-run this audit after any dependency, font or asset change.

Nothing in this pass changed the licensing position: no licence file was added,
no third-party asset was imported, and no restricted material was copied.
