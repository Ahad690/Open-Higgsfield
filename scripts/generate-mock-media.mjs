#!/usr/bin/env node
/**
 * Regenerate the checked-in mock video fixture.
 *
 * This is a developer convenience, not a runtime dependency. The resulting MP4
 * is committed so tests and E2E never need ffmpeg or a generator model. The
 * video is intentionally labelled "MOCK OUTPUT - NOT AI-GENERATED" in every
 * frame. No repository sample video is used.
 *
 *   node scripts/generate-mock-media.mjs
 *
 * Requires ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg).
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = resolve(root, "scripts/mock-media/mock-output.mp4")
const ffmpeg = process.env.FFMPEG ?? "ffmpeg"

const fontCandidates = [
  process.env.MOCK_FONT_FILE,
  "C:/Windows/Fonts/arialbd.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
].filter(Boolean)
const font = fontCandidates.find((candidate) => existsSync(candidate))
if (!font) {
  console.error(
    "No bold font found. Set MOCK_FONT_FILE to a TTF/OTF path and try again."
  )
  process.exit(1)
}

const escapedFont = font.replace(/\\/g, "/").replace(/:/g, "\\:")
const filter = [
  "drawbox=x=0:y=0:w=iw:h=12:color=0xa3e635@1:t=fill",
  "drawbox=x=0:y=708:w=iw:h=12:color=0xa3e635@1:t=fill",
  `drawtext=fontfile='${escapedFont}':text='VIREO LOCAL MOCK':fontcolor=0xa3e635:fontsize=34:x=(w-text_w)/2:y=60`,
  `drawtext=fontfile='${escapedFont}':text='MOCK OUTPUT':fontcolor=0xffffff:fontsize=110:x=(w-text_w)/2:y=220`,
  `drawtext=fontfile='${escapedFont}':text='NOT AI-GENERATED':fontcolor=0xa3e635:fontsize=72:x=(w-text_w)/2:y=360`,
  `drawtext=fontfile='${escapedFont}':text='DETERMINISTIC TEST ARTIFACT - NO AI MODEL WAS CALLED':fontcolor=0xc7c9cc:fontsize=28:x=(w-text_w)/2:y=500`,
  `drawtext=fontfile='${escapedFont}':text='MOCK VIDEO - 3 SECOND LOOP':fontcolor=0xc7c9cc:fontsize=28:x=(w-text_w)/2:y=550`,
].join(",")

mkdirSync(dirname(output), { recursive: true })
const result = spawnSync(
  ffmpeg,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x0a0c0e:s=1280x720:d=3:r=30",
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-metadata",
    "title=MOCK OUTPUT - NOT AI-GENERATED",
    "-metadata",
    "comment=VIREO LOCAL MOCK / DETERMINISTIC TEST ARTIFACT / NO AI MODEL WAS CALLED",
    "-an",
    output,
  ],
  { stdio: "inherit" }
)
if (result.error) {
  console.error(`Could not run ${ffmpeg}: ${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`Wrote ${output}`)
