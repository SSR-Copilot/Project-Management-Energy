import { defineConfig, devices } from "@playwright/test";

/**
 * Local-only execution, per TEST-STRATEGY.md §13 — no CI project, no paid parallel grid.
 * `fullyParallel` is still on: free local parallelism across Playwright's own worker pool
 * is not the thing the "no premium license" constraint is about.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // no silent retry-until-green — see TEST-STRATEGY.md §14.1
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000, // canvas screens are slower to settle than the code app's own
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testDir: "scripts",
      testMatch: "capture-auth.ts",
      // Headed is required here — a human completes Entra login + MFA in this window.
      use: { ...devices["Desktop Chrome"], headless: false },
    },
    {
      name: "default",
      testDir: ".",
      testMatch: "specs/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
