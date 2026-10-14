import type { Page } from "@playwright/test";
import { resolveAppFrame } from "../../fixtures/app-frame";

/**
 * Generic "did the canvas app actually render" check, shared by both canvas apps for the
 * Phase 0 smoke test. Deliberately minimal — richer per-screen Page Objects come in Phase 1
 * once the frame-targeting question (see `fixtures/app-frame.ts`) is confirmed and specific
 * screens are in scope.
 */
export class CanvasLandingPage {
  constructor(private readonly page: Page) {}

  /** Throws (via resolveAppFrame) if no known player iframe is found — the Phase 0 signal. */
  async waitForRender(): Promise<void> {
    const app = await resolveAppFrame(this.page);
    // Any visible text content is enough for a smoke check; a specific screen title is a
    // Phase 1 concern once we know which screen a bare/deep-linked URL actually lands on.
    await app.locator("body").first().waitFor({ state: "visible" });
  }

  /** Registers console/page-error listeners; call BEFORE navigation to catch everything. */
  watchForErrors(onError: (message: string) => void): void {
    this.page.on("pageerror", (err) => onError(`pageerror: ${err.message}`));
    this.page.on("console", (msg) => {
      if (msg.type() === "error") onError(`console.error: ${msg.text()}`);
    });
  }
}
