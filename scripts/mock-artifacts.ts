import { deflateSync } from "node:zlib"

/**
 * Deterministic mock image artifacts. This is intentionally not a real image
 * generator: it draws a dark slate with a large, repeated MOCK OUTPUT warning
 * and metadata, encodes it as a real PNG, and adds uncompressed PNG tEXt
 * metadata so tests and reviewers can see the provenance without an image
 * decoder. No repository sample image is read or served.
 */

export const MOCK_ARTIFACT_LABEL = "MOCK OUTPUT - NOT AI-GENERATED"
export const MOCK_ARTIFACT_NOTICE =
  "VIREO LOCAL MOCK / DETERMINISTIC TEST ARTIFACT / NO AI MODEL WAS CALLED"
export const MOCK_IMAGE_WIDTH = 1280
export const MOCK_IMAGE_HEIGHT = 720
export const MOCK_VIDEO_RELATIVE_PATH = "scripts/mock-media/mock-output.mp4"

export type MockImageOptions = {
  requestId: string
  modelPath: string
  index?: number
  count?: number
  width?: number
  height?: number
}

type Rgb = readonly [number, number, number]

const BACKGROUND: Rgb = [10, 12, 14]
const PANEL: Rgb = [20, 25, 24]
const LIME: Rgb = [163, 230, 53]
const WHITE: Rgb = [242, 245, 240]
const MUTED: Rgb = [180, 188, 184]
const DARK_LINE: Rgb = [54, 68, 60]

const FONT: Record<string, readonly string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
}

const FALLBACK_GLYPH = FONT["?"]!
const GLYPH_WIDTH = 5
const GLYPH_HEIGHT = 7
const GLYPH_GAP = 1

export function createMockPng(options: MockImageOptions): Buffer {
  const width = options.width ?? MOCK_IMAGE_WIDTH
  const height = options.height ?? MOCK_IMAGE_HEIGHT
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32)
    throw new Error("Mock image dimensions must be integers of at least 32px")

  const pixels = Buffer.alloc(width * height * 3)
  fillRect(pixels, width, 0, 0, width, height, BACKGROUND)
  fillRect(pixels, width, 0, 0, width, 12, LIME)
  fillRect(pixels, width, 0, height - 12, width, 12, LIME)
  fillRect(pixels, width, 34, 34, width - 68, height - 68, PANEL)
  strokeRect(pixels, width, 34, 34, width - 68, height - 68, DARK_LINE, 2)

  const index = options.index ?? 0
  const count = options.count ?? 1
  const requestId = sanitize(options.requestId)
  const modelPath = truncate(sanitize(options.modelPath), 42)

  drawCentered(
    pixels,
    width,
    "VIREO LOCAL MOCK",
    54,
    3,
    LIME
  )
  drawCentered(
    pixels,
    width,
    "MOCK OUTPUT",
    166,
    Math.min(11, Math.floor((width - 120) / (6 * GLYPH_WIDTH))),
    WHITE
  )
  drawCentered(
    pixels,
    width,
    "NOT AI-GENERATED",
    310,
    Math.min(8, Math.floor((width - 120) / (16 * 6))),
    LIME
  )
  drawCentered(
    pixels,
    width,
    "DETERMINISTIC TEST ARTIFACT",
    390,
    3,
    MUTED
  )
  fillRect(pixels, width, 80, 438, width - 160, 2, DARK_LINE)
  drawCentered(
    pixels,
    width,
    `MODEL: ${modelPath}`,
    468,
    3,
    WHITE
  )
  drawCentered(
    pixels,
    width,
    `REQUEST: ${truncate(requestId, 48)}`,
    522,
    3,
    WHITE
  )
  drawCentered(
    pixels,
    width,
    `TYPE: IMAGE ${index + 1}/${count}`,
    576,
    3,
    WHITE
  )
  drawCentered(
    pixels,
    width,
    "NO AI MODEL WAS CALLED",
    630,
    3,
    LIME
  )

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: none
    pixels.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk(
      "tEXt",
      Buffer.from(`Software\u0000Vireo local mock provider`, "latin1")
    ),
    pngChunk(
      "tEXt",
      Buffer.from(
        `Comment\u0000${MOCK_ARTIFACT_LABEL}; ${MOCK_ARTIFACT_NOTICE}; request=${requestId}; model=${modelPath}`,
        "latin1"
      )
    ),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function sanitize(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 .:/_+\-]/g, "?")
    .replace(/\s+/g, " ")
    .trim()
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`
}

function drawCentered(
  pixels: Buffer,
  canvasWidth: number,
  rawText: string,
  top: number,
  preferredScale: number,
  colour: Rgb
): void {
  const text = rawText.replace(/[^A-Z0-9 .:/_+\-]/g, "?").toUpperCase()
  const naturalWidth = textWidth(text, preferredScale)
  const maxWidth = canvasWidth - 120
  const scale =
    naturalWidth <= maxWidth
      ? preferredScale
      : Math.max(1, Math.floor((preferredScale * maxWidth) / naturalWidth))
  const left = Math.floor((canvasWidth - textWidth(text, scale)) / 2)
  drawText(pixels, canvasWidth, text, left, top, scale, colour)
}

function textWidth(text: string, scale: number): number {
  if (!text.length) return 0
  return text.length * (GLYPH_WIDTH + GLYPH_GAP) * scale - GLYPH_GAP * scale
}

function drawText(
  pixels: Buffer,
  canvasWidth: number,
  text: string,
  left: number,
  top: number,
  scale: number,
  colour: Rgb
): void {
  let cursor = left
  for (const character of text) {
    const glyph = FONT[character] ?? FALLBACK_GLYPH
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const line = glyph[row]!
      for (let column = 0; column < GLYPH_WIDTH; column++) {
        if (line[column] === "1")
          fillRect(
            pixels,
            canvasWidth,
            cursor + column * scale,
            top + row * scale,
            scale,
            scale,
            colour
          )
      }
    }
    cursor += (GLYPH_WIDTH + GLYPH_GAP) * scale
  }
}

function fillRect(
  pixels: Buffer,
  canvasWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: Rgb
): void {
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  const right = Math.min(canvasWidth, Math.floor(x + width))
  const bottom = Math.min(pixels.length / 3 / canvasWidth, Math.floor(y + height))
  for (let py = top; py < bottom; py++) {
    for (let px = left; px < right; px++) {
      const offset = (py * canvasWidth + px) * 3
      pixels[offset] = colour[0]
      pixels[offset + 1] = colour[1]
      pixels[offset + 2] = colour[2]
    }
  }
}

function strokeRect(
  pixels: Buffer,
  canvasWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: Rgb,
  thickness: number
): void {
  fillRect(pixels, canvasWidth, x, y, width, thickness, colour)
  fillRect(pixels, canvasWidth, x, y + height - thickness, width, thickness, colour)
  fillRect(pixels, canvasWidth, x, y, thickness, height, colour)
  fillRect(pixels, canvasWidth, x + width - thickness, y, thickness, height, colour)
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}
