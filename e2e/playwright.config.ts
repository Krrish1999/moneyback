import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4173;
const baseURL = process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? `http://localhost:${port}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  // Skip starting a server when E2E_BASE_URL points somewhere else (e.g. a running dev server).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter @moneyback/web build && pnpm --filter @moneyback/web preview --port ${port} --strictPort`,
        cwd: repoRoot,
        url: `http://localhost:${port}`,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
