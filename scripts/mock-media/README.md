# Mock media

These files are **not AI-generated**. They are deterministic fixtures for the
local mock provider and automated tests. They must not be used in marketing
pages or presented as studio output.

## `mock-output.mp4`

- 1280×720, 3 seconds, H.264 Constrained Baseline, yuv420p, no audio.
- Every frame says `MOCK OUTPUT`, `NOT AI-GENERATED` and
  `DETERMINISTIC TEST ARTIFACT`.
- Produced by `scripts/generate-mock-media.mjs` (requires ffmpeg; not a runtime
  dependency). The encoded file is checked in so tests and E2E never need
  ffmpeg.
- Container metadata repeats `MOCK OUTPUT - NOT AI-GENERATED` and the
  deterministic-fixture notice (title/comment tags).
- SHA-256: `10d8f1fb8848d781834b274d0705710a130607a88629ad77630b7db5eb6da0ee`

Regenerate:

```sh
node scripts/generate-mock-media.mjs
```

If the font path cannot be found, set `MOCK_FONT_FILE` to a local bold
TTF/OTF. The script does not read `/public/media` or any repository sample
video.
