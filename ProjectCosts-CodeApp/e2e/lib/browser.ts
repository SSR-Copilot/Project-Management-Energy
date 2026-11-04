/**
 * The browser settings every Playwright run here shares: the old specs (`playwright.config.ts`) and the one-hour parity
 * harness (`e2e/harness/playwright.harness.config.ts`, D80). One definition, so the two suites drive the same browser.
 *
 * - Real Chrome with Chrome's local-network checks off: the play page calls http://localhost:3000 and :8080, which the
 *   bundled Chromium blocks (the player then says "We could not retrieve your app").
 * - 1920 x 1040: the viewport the Canvas reference and the code app recordings were taken at.
 * - A single click / fill that waits longer than 30 s is stuck (e.g. a click on a DISABLED control retries for ever: Land
 *   Lease run, 3 Nov 2026); it fails with the reason instead of eating the whole test's time. A call can pass its own timeout.
 */
import type { PlaywrightTestOptions, PlaywrightWorkerOptions } from "@playwright/test";

/** Chrome flags: the local-network checks a fresh profile cannot answer (also used by `e2e/auth.mjs`). */
export const CHROME_ARGS: readonly string[] = [
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
];

export const VIEWPORT = { width: 1920, height: 1040 } as const;

/** The `use` block both configs spread. Recording options (trace, video, screenshot) stay per config. */
export const BROWSER_USE: Pick<PlaywrightWorkerOptions, "channel" | "launchOptions"> & Pick<PlaywrightTestOptions, "viewport" | "actionTimeout"> = {
  channel: "chrome",
  launchOptions: { args: [...CHROME_ARGS] },
  viewport: { ...VIEWPORT },
  actionTimeout: 30_000,
};

/** The saved sessions (`npm run e2e:auth:codeapp` / `e2e:auth:canvas`), relative to the code repo root. Git-ignored. */
export const STORAGE_STATE = { code: "e2e/.auth/codeapp.json", canvas: "e2e/.auth/canvas.json" } as const;
