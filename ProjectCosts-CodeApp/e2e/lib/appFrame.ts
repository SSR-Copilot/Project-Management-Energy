/**
 * The app frame: opening a project-scoped Cost screen in either app, and waiting on it (D80). Screen-neutral: nothing here
 * knows a screen. The parity harness (`e2e/harness/`) imports these from here only; `lib/cost.ts` re-exports them, so the
 * older Land Lease specs keep their imports unchanged.
 *
 *   canvas  : the Cost canvas app, opened with `&projectId=<guid>` exactly as Edit Costs opens it; then the left menu
 *   code app: the `pac code run` play URL plus the launch parameters Edit Costs sends (`costScreen` + `projectId`,
 *             CONVENTIONS rule 12), so the run takes the same deep-link path a user does
 *
 * Everything that differs per run comes from the environment, never from code (no project, no URL is written in a test):
 *   CODEAPP_URL            default: the local play URL `pac code run` serves
 *   CANVAS_COST_URL        default: the Cost canvas app in VSBCloud_Dev
 */
import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { CANVAS_FRAME, CODE_FRAME, pressSignIn, withParams } from "./parity";

export const CODEAPP_URL = process.env.CODEAPP_URL
  ?? "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local"
  + "?_localAppUrl=http://localhost:3000&_localConnectionUrl=http://localhost:8080";
export const CANVAS_COST_URL = process.env.CANVAS_COST_URL
  ?? "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/ab3554c5-a4fc-4436-8825-8a84484ec5ea?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1";

/** Busy indicators: the FIRST element matching counts, and only when it is laid out (`offsetParent`), as always here. */
export const BUSY_INDICATORS = "[aria-busy='true'], [role='progressbar'], .fui-Spinner";
/**
 * The apps' own busy messages ("Saving Land Lease Contract...", "Deleting ...", "Loading ..."; canvas pop-up and code overlay
 * alike), matched on a visible leaf `div, span, p, label`. A save is still writing while one shows: leaving the screen then
 * aborts it (Stage B run, 3 Nov 2026).
 */
export const BUSY_MESSAGE = /^(Saving|Deleting|Loading)\b.*\.{3}$/;

/**
 * What is busy in the app frame right now ("indicator <tag>" or "message \"Saving ...\""), or null when nothing is. One
 * in-page read; no text-node walk. `indicators: false` checks the busy messages only (`waitForNotBusy`). Shared by
 * `waitForStable`, `waitForNotBusy` and the harness's `settle` (`e2e/harness/waits.ts`), so the rule lives in one place.
 */
export async function busyNow(app: FrameLocator, { indicators = true } = {}): Promise<string | null> {
  return app.locator("body").evaluate((b, a) => {
    if (a.sel) {
      const busy = b.querySelector(a.sel);
      if (busy && (busy as HTMLElement).offsetParent !== null) {
        const cls = (busy.getAttribute("class") ?? "").trim().split(/\s+/)[0];
        return `indicator ${busy.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
      }
    }
    const msg = new RegExp(a.msg);
    for (const e of Array.from(b.querySelectorAll<HTMLElement>("div, span, p, label"))) {
      if (e.children.length > 0) continue;
      const text = (e.textContent ?? "").trim();
      // offsetParent forces layout, so it is read last, only for a leaf whose text already matches.
      if (msg.test(text) && e.offsetParent !== null) return `message ${JSON.stringify(text)}`;
    }
    return null;
  }, { sel: indicators ? BUSY_INDICATORS : "", msg: BUSY_MESSAGE.source });
}

/**
 * Waits until the screen stops changing: the number of visible text nodes in the app frame is the same on two
 * polls in a row and no busy indicator is shown. A condition, not a fixed sleep (prompt section 3.3).
 */
export async function waitForStable(page: Page, app: FrameLocator, { pollMs = 700, timeoutMs = 45_000 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let same = 0;
  while (Date.now() < deadline) {
    const busy = await busyNow(app).catch(() => "unreadable");
    const n = busy !== null ? -1 : await app.locator("body").evaluate((b) => {
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      let count = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) if (t.textContent?.trim()) count++;
      return count;
    }).catch(() => -1);
    same = n >= 0 && n === last ? same + 1 : 0;
    if (same >= 2) return;
    last = n;
    await page.waitForTimeout(pollMs);
  }
}

/**
 * Waits until the app shows none of its busy messages ("Saving …...", "Deleting …...", "Loading …...") and FAILS if one is still
 * there after `timeoutMs`: after a Save the test must not move on (a navigation would abort the save part-way).
 */
export async function waitForNotBusy(app: FrameLocator, timeoutMs = 180_000): Promise<void> {
  const busy = async () => (await busyNow(app, { indicators: false })) !== null;
  const deadline = Date.now() + timeoutMs;
  // Give the busy message a moment to appear after the click, then wait for it to go (two clear reads in a row).
  let clear = 0;
  while (Date.now() < deadline) {
    clear = (await busy().catch(() => true)) ? 0 : clear + 1;
    if (clear >= 3) return;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`still busy after ${timeoutMs} ms (a "Saving / Deleting / Loading..." message is shown)`);
}

/**
 * The indexes of the matches of `locator` that a user can actually see. The canvas lays out the rows of a FOLDED card too and
 * hides them by clipping (an overflow ancestor cuts them off; CSS still says "visible"), the same reason `lib/texts.ts` skips
 * clipped text. So an element counts only when it has a box and its centre lies inside every clipping ancestor.
 */
export async function unclippedIndexesOf(locator: Locator): Promise<number[]> {
  return locator.evaluateAll((els) => els.flatMap((e, i) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return [];
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return [];
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (!/(hidden|clip|auto|scroll)/.test(as.overflowX + as.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) return [];
    }
    return [i];
  }));
}

/** The Cost canvas app on one project, then a left-menu screen ("Land Lease"). */
export async function openCanvasCost(page: Page, projectId: string, menuLabel: string): Promise<FrameLocator> {
  await page.goto(withParams(CANVAS_COST_URL, { projectId }));
  const app = page.frameLocator(CANVAS_FRAME);
  for (let i = 0; i < 45; i++) {
    if ((await app.locator("[data-control-name]").count().catch(() => 0)) > 20) break;
    await pressSignIn(page);
    await page.waitForTimeout(4000);
  }
  await expect(app.locator("[data-control-name]").first()).toBeVisible({ timeout: 60_000 });
  await app.getByText(menuLabel, { exact: true }).first().click({ force: true, timeout: 60_000 });
  await waitForStable(page, app);
  return app;
}

/** The code app on one project and screen, through the Edit Costs launch parameters. */
export async function openCodeCost(page: Page, projectId: string, costScreen: string): Promise<FrameLocator> {
  await page.goto(withParams(CODEAPP_URL, { costScreen, projectId }));
  const app = page.frameLocator(CODE_FRAME);
  for (let i = 0; i < 15 && !(await app.getByTestId("header-user").isVisible().catch(() => false)); i++) {
    await pressSignIn(page);
    await page.waitForTimeout(3000);
  }
  await app.getByTestId("header-user").waitFor({ state: "visible", timeout: 30_000 });
  await waitForStable(page, app);
  return app;
}
