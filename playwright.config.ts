import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for THEFVC.IS (PRD-008: Testing & CI).
 *
 * E2E tests boot the real Express server (via tests/e2e/server.ts helper)
 * on a random port and exercise the full stack: HTTP routes, SQLite DB,
 * and the React client rendered through Vite dev server.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // server tests must be serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    // Mobile viewport smoke tests
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  // Global setup: start the app server once for all E2E tests
  globalSetup: require.resolve("./tests/e2e/global-setup"),
});
