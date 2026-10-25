import { defineConfig, devices } from "@playwright/test"

/**
 * E2E against a running stack. Locally: `pnpm db:dev`, `pnpm mock:higgsfield`
 * and `pnpm dev` (with E2E_TEST_MODE=true and a loopback HF_API_BASE_URL),
 * then `pnpm test:e2e`. Protected mode rejects external provider hosts and is
 * itself rejected under NODE_ENV=production, so preview/production deploys
 * cannot run this stack.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
})
