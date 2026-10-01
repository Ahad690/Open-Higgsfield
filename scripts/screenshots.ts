/**
 * Capture our pages at 1440 and 390 px into docs/screens/vireo-<page>-<width>.png
 * for side-by-side comparison with the reference captures (docs/screens/<page>-<width>.png).
 *   BASE_URL=http://localhost:3000 pnpm exec tsx scripts/screenshots.ts
 */
import { chromium } from "@playwright/test"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const PAGES: [name: string, path: string][] = [
  ["home", "/"],
  ["image", "/image"],
  ["video", "/video"],
  ["effects", "/effects"],
  ["effects-detail", "/effects/neon-noir"],
  ["community", "/community"],
  ["pricing", "/pricing"],
  ["login", "/login"],
]

const browser = await chromium.launch({ channel: "chrome" })
for (const width of [1440, 390]) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    deviceScaleFactor: width === 390 ? 2 : 1,
    isMobile: width === 390,
    hasTouch: width === 390,
  })
  await context.addInitScript(() =>
    localStorage.setItem(
      "vireo.consent.v1",
      JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        at: 0,
      })
    )
  )
  const page = await context.newPage()
  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    await page.screenshot({ path: `docs/screens/vireo-${name}-${width}.png` })
    console.log(`captured ${name} @ ${width}`)
  }
  await context.close()
}
await browser.close()
