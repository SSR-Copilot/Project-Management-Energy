/**
 * E2E parity suite (Playwright). See `ProjectDocs/instructions/E2E-PARITY-PROMPT.md`.
 *
 * Two projects, one scenario set:
 *   codeapp : the code app through the `pac code run` play URL (never bare localhost:3000)
 *   canvas  : the existing canvas app
 * URLs come from the environment, never from code:
 *   CODEAPP_URL  the `apps.powerapps.com/.../app/local?...` URL `pac code run` prints
 *   CANVAS_URL   the Project Management canvas app's play URL (also holds Application Settings)
 *   CANVAS_COST_URL  the Cost canvas app's play URL; add `&projectId=<guid>` to open a project (what Edit Costs does)
 * Sign in once with `npm run e2e:auth:codeapp` / `npm run e2e:auth:canvas` (a headed browser; MFA by hand).
 */
import { defineConfig } from "@playwright/test";

const DEFAULT_CODEAPP_URL =
  "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local"
  + "?_localAppUrl=http://localhost:3000&_localConnectionUrl=http://localhost:8080";

/** Canvas apps in VSBCloud_Dev (different app ids from the code app, 807a2fba-...). Given by the product owner, 29 Oct 2026. */
const DEFAULT_CANVAS_PM_URL =
  "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/67054ad6-e70b-4738-a3e6-125384fe2b4b?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1";
const DEFAULT_CANVAS_COST_URL =
  "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/ab3554c5-a4fc-4436-8825-8a84484ec5ea?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  // Live data and a slow canvas player: one worker, one retry, and a retry is reported as flaky.
  workers: 1,
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/results",
  use: {
    // Real Chrome with Chrome's local-network checks off: the play page calls http://localhost:3000 and :8080,
    // which the bundled Chromium blocks (the player then says "We could not retrieve your app").
    channel: "chrome",
    launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests"] },
    viewport: { width: 1920, height: 1040 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // Both apps in one test (Canvas first, then the code app): each test opens its own contexts from the saved sessions.
      name: "parity",
      testMatch: /.*.parity.spec.ts/,
    },
    {
      name: "codeapp",
      testMatch: /.*\.codeapp\.spec\.ts/,
      use: { baseURL: process.env.CODEAPP_URL ?? DEFAULT_CODEAPP_URL, storageState: "e2e/.auth/codeapp.json" },
    },
    {
      name: "canvas",
      testMatch: /.*\.canvas\.spec\.ts/,
      use: { baseURL: process.env.CANVAS_URL ?? DEFAULT_CANVAS_PM_URL, storageState: "e2e/.auth/canvas.json" },
      metadata: { costUrl: process.env.CANVAS_COST_URL ?? DEFAULT_CANVAS_COST_URL },
    },
  ],
});
