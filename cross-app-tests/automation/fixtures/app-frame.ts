import type { FrameLocator, Page } from "@playwright/test";

/**
 * The Power Apps player renders the actual app (canvas or code app) inside an iframe, not
 * directly in the outer `apps.powerapps.com` page — confirmed for the code app this session
 * (see `ProjectCosts-CodeApp/app/src/app/deepLinks.ts`'s own comments on this). Whether the
 * CLASSIC canvas player uses the same wrapping, and under what selector, is explicitly
 * UNVERIFIED — this is exactly what `TC-OV-000` (Phase 0's smoke test) exists to confirm.
 *
 * Until confirmed, this tries the most common Power Apps player iframe selectors in order.
 * If none match when you actually run this against a live session, use
 * `npx playwright codegen <the play url>` against your authenticated browser to find the
 * real one, then replace `CANDIDATE_SELECTORS` below — do not guess further in code, update
 * this comment with what you found and cite it from `TC-OV-000`'s "Expected result".
 */
const CANDIDATE_SELECTORS = [
  'iframe[title="App"]',
  "iframe#fullscreen-app-host",
  'iframe[name="fullscreen-app-host"]',
  "iframe.appplayer-canvas-container",
];

export async function resolveAppFrame(page: Page): Promise<FrameLocator> {
  for (const selector of CANDIDATE_SELECTORS) {
    // `.count()` checks the CURRENT dom, no auto-wait — safe to probe several candidates.
    if ((await page.locator(selector).count()) > 0) {
      return page.frameLocator(selector);
    }
  }
  throw new Error(
    "No known Power Apps player iframe selector matched. Run `npx playwright codegen` " +
      "against this URL with an authenticated session, find the real iframe, and add its " +
      "selector to CANDIDATE_SELECTORS in fixtures/app-frame.ts. Document the finding in " +
      "test-cases/overview/TC-OV-000-deep-link-behaviour.md once confirmed.",
  );
}
