/**
 * The Cost-screen parity harness: open a Cost screen for one project in both apps (E2E-PARITY-PROMPT.md section 2).
 *
 *   canvas  : the Cost canvas app, opened with `&projectId=<guid>` exactly as Edit Costs opens it; then the left menu
 *   code app: the `pac code run` play URL plus the launch parameters Edit Costs sends (`costScreen` + `projectId`,
 *             CONVENTIONS rule 12), so the run takes the same deep-link path a user does
 *
 * Everything that differs per run comes from the environment, never from code (no project, no URL is written in a test):
 *   LANDLEASE_PROJECT_ID   the test project (required by the Land Lease specs; they skip without it)
 *   CODEAPP_URL            default: the local play URL `pac code run` serves
 *   CANVAS_COST_URL        default: the Cost canvas app in VSBCloud_Dev
 */
import { expect, type FrameLocator, type Locator, type Page, test } from "@playwright/test";
import { CANVAS_FRAME, CODE_FRAME } from "./parity";

export const CODEAPP_URL = process.env.CODEAPP_URL
  ?? "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local"
  + "?_localAppUrl=http://localhost:3000&_localConnectionUrl=http://localhost:8080";
export const CANVAS_COST_URL = process.env.CANVAS_COST_URL
  ?? "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/ab3554c5-a4fc-4436-8825-8a84484ec5ea?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1";

export type Kind = "canvas" | "code";

/** The test project from the environment; the calling test is skipped (not failed) when it is not set. */
export function projectIdOrSkip(variable = "LANDLEASE_PROJECT_ID"): string {
  const id = process.env[variable]?.trim() ?? "";
  test.skip(!/^[0-9a-f-]{36}$/i.test(id), `Set ${variable} to the test project's GUID to run this spec`);
  return id;
}

const withParams = (base: string, params: Record<string, string>): string => {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};

async function pressSignIn(page: Page): Promise<void> {
  for (const f of page.frames()) {
    const b = f.getByRole("button", { name: "Sign in", exact: true });
    if (await b.count().catch(() => 0)) await b.first().click({ timeout: 2000 }).catch(() => {});
  }
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
    const n = await app.locator("body").evaluate((b) => {
      const busy = b.querySelector("[aria-busy='true'], [role='progressbar'], .fui-Spinner");
      if (busy && (busy as HTMLElement).offsetParent !== null) return -1;
      // The apps' own busy messages ("Saving Land Lease Contract...", "Deleting ...", "Loading ..."; canvas pop-up and code
      // overlay alike). A save is still writing while one shows: leaving the screen then aborts it (Stage B run, 3 Nov 2026).
      for (const e of Array.from(b.querySelectorAll<HTMLElement>("div, span, p, label"))) {
        if (e.children.length > 0 || e.offsetParent === null) continue;
        if (/^(Saving|Deleting|Loading)\b.*\.{3}$/.test((e.textContent ?? "").trim())) return -1;
      }
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
  const busy = () => app.locator("body").evaluate((b) => Array.from(b.querySelectorAll<HTMLElement>("div, span, p, label")).some((e) =>
    e.children.length === 0 && e.offsetParent !== null && /^(Saving|Deleting|Loading)\b.*\.{3}$/.test((e.textContent ?? "").trim())));
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

/** Clicks a visible text in either app. A canvas control sits under an invisible button, so the canvas click is forced. */
export async function clickText(kind: Kind, app: FrameLocator, text: string, nth = 0): Promise<void> {
  await app.getByText(text, { exact: true }).nth(nth).click({ force: kind === "canvas", timeout: 15_000 });
}

const LEASE_CARD_TITLE = "lbl_LandLease_Content_SubaccountsCardHeader_SubaccountName_2";
const LEASE_CHEVRONS = "[data-control-name='ico_LandLease_Content_SubaccountsCardHeader_Down_2'], [data-control-name='ico_LandLease_Content_SubaccountsCardHeader_Up_2']";

/**
 * Folds or unfolds Land Lease sub-account card `index` (screen order).
 *  canvas  : each card shows ONE chevron, `…_Down_2` when folded and `…_Up_2` when open, and the gallery renders only the cards near
 *            the viewport. So the card's title is scrolled into view first, then the visible chevron on the title's row is clicked.
 *  code app: the card header button (`leasecard-…`).
 */
export async function toggleLeaseCard(kind: Kind, page: Page, app: FrameLocator, index: number): Promise<void> {
  if (kind === "code") {
    const header = app.locator("[data-testid^='leasecard-']").nth(index);
    // A fresh load can still be fetching the cards after the header showed (Stage B run, 3 Nov 2026): wait for them first.
    await header.waitFor({ state: "visible", timeout: 90_000 });
    await header.scrollIntoViewIfNeeded();
    await header.click({ timeout: 15_000 });
  } else {
    const title = app.locator(`[data-control-name='${LEASE_CARD_TITLE}']`).nth(index);
    await title.scrollIntoViewIfNeeded({ timeout: 15_000 });
    const t = await title.boundingBox();
    if (!t) throw new Error(`Canvas card ${index}: title not on screen`);
    const chevrons = app.locator(LEASE_CHEVRONS);
    let clicked = false;
    for (let k = 0, n = await chevrons.count(); k < n && !clicked; k++) {
      const c = chevrons.nth(k);
      const b = await c.boundingBox();
      if (!b || !(await c.isVisible())) continue;
      if (Math.abs(b.y + b.height / 2 - (t.y + t.height / 2)) < 24) { await c.click({ force: true }); clicked = true; }
    }
    if (!clicked) throw new Error(`Canvas card ${index}: no visible chevron on its header row`);
  }
  await waitForStable(page, app);
}

/**
 * The command `caption` of card `index`'s OWN command bar. Another card's bar can be on screen too (a card above scrolled half
 * out of view; the standard-import run, 3 Nov 2026), so "the first visible Add Standard Contract" may be the wrong card's.
 *  canvas  : the first visible command BELOW card `index`'s title (its bar sits right under the header)
 *  code app: the command inside the card's own section
 */
export async function cardCommand(kind: Kind, app: FrameLocator, index: number, caption: string): Promise<Locator> {
  if (kind === "code") {
    return app.locator("section").filter({ has: app.locator("[data-testid^='leasecard-']").nth(index) })
      .getByText(caption, { exact: true }).first();
  }
  const title = await app.locator(`[data-control-name='${LEASE_CARD_TITLE}']`).nth(index).boundingBox();
  if (!title) throw new Error(`Canvas card ${index}: title not on screen`);
  const items = app.getByText(caption, { exact: true });
  let best = -1;
  let bestDy = Number.POSITIVE_INFINITY;
  for (let k = 0, n = await items.count(); k < n; k++) {
    const b = await items.nth(k).boundingBox();
    if (!b || !(await items.nth(k).isVisible())) continue;
    const dy = b.y - title.y;
    if (dy > 0 && dy < bestDy) { bestDy = dy; best = k; }
  }
  if (best < 0) throw new Error(`Canvas card ${index}: no visible "${caption}" under its title`);
  return items.nth(best);
}

/** Enabled / disabled of one command of card `index`'s own bar (see `cardCommand`). */
export async function cardCommandEnabled(kind: Kind, app: FrameLocator, index: number, caption: string): Promise<boolean> {
  const item = await cardCommand(kind, app, index, caption);
  return item.evaluate((e, k) => {
    const host = (e.closest("button, [role='menuitem']") ?? e) as HTMLButtonElement;
    return k === "canvas" ? host.getAttribute("aria-disabled") !== "true" : !host.disabled && host.getAttribute("aria-disabled") !== "true";
  }, kind);
}

/** The card titles in screen order (canvas: scrolled through, because its gallery renders only the cards near the viewport). */
export async function leaseCardTitles(kind: Kind, app: FrameLocator): Promise<string[]> {
  if (kind === "code") return app.locator("[data-testid^='leasecard-']").allInnerTexts().then((t) => t.map((s) => s.trim()));
  const seen: string[] = [];
  const titles = app.locator(`[data-control-name='${LEASE_CARD_TITLE}']`);
  for (let i = 0; i < 60; i++) {
    const n = await titles.count();
    if (i >= n) break;
    await titles.nth(i).scrollIntoViewIfNeeded().catch(() => {});
    seen.push((await titles.nth(i).innerText().catch(() => "")).trim());
  }
  return seen;
}

/**
 * The indexes of the elements matching `selector` that a user can actually see. The canvas lays out the rows of a FOLDED card too
 * and hides them by clipping (an overflow ancestor cuts them off; CSS still says "visible"), the same reason `lib/texts.ts` skips
 * clipped text. So an element counts only when it has a box and its centre lies inside every clipping ancestor.
 */
export async function unclippedIndexes(app: FrameLocator, selector: string): Promise<number[]> {
  return app.locator(selector).evaluateAll((els) => els.flatMap((e, i) => {
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

/** The visible period rows of the open cards, in screen order (canvas: the row containers; code app: the row select buttons). */
export const LEASE_ROW = {
  canvas: "[data-control-name='con_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_1']",
  code: "[data-testid^='btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_2-']",
} as const;

export async function leaseRowCount(kind: Kind, app: FrameLocator): Promise<number> {
  return (await unclippedIndexes(app, LEASE_ROW[kind])).length;
}

/** Selects the `n`th visible period row (a forced click on the canvas lands on the transparent button covering the row). */
export async function selectLeaseRow(kind: Kind, page: Page, app: FrameLocator, n = 0): Promise<void> {
  const shown = await unclippedIndexes(app, LEASE_ROW[kind]);
  const index = shown[n];
  if (index === undefined) throw new Error(`${kind}: no visible period row ${n} (visible rows: ${shown.length}); open a card with rows first`);
  await app.locator(LEASE_ROW[kind]).nth(index).click({ force: kind === "canvas", timeout: 15_000 });
  await waitForStable(page, app);
}

export const LEASE_COMMANDS = ["Add Contract Type", "Add Period", "Add Standard Contract", "Edit", "Delete"] as const;

/**
 * Enabled / disabled of the Land Lease commands that a user can see (folded cards keep theirs in the canvas page, clipped).
 *  canvas  : the PCF CommandBar marks a disabled item with `aria-disabled="true"` (the button itself stays enabled; probe 3 Nov)
 *  code app: a disabled item is a `disabled` button
 * Returns caption -> enabled for the FIRST visible bar (open one card at a time).
 */
export async function leaseCommandStates(kind: Kind, app: FrameLocator): Promise<Record<string, boolean>> {
  return app.locator("body").evaluate((b, { k, captions }) => {
    const out: Record<string, boolean> = {};
    for (const e of Array.from(b.querySelectorAll<HTMLButtonElement>("button, [role='menuitem']"))) {
      const t = (e.textContent || "").replace(/[^\x20-\x7E]/g, "").trim();
      if (!captions.includes(t) || t in out) continue;
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      let clipped = false;
      for (let a = e.parentElement; a && a !== b && !clipped; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (!/(hidden|clip|auto|scroll)/.test(as.overflowX + as.overflowY)) continue;
        const ar = a.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) clipped = true;
      }
      if (clipped) continue;
      out[t] = k === "canvas" ? e.getAttribute("aria-disabled") !== "true" : !e.disabled && e.getAttribute("aria-disabled") !== "true";
    }
    return out;
  }, { k: kind, captions: [...LEASE_COMMANDS] as string[] });
}

/**
 * Picks a dropdown option, by its exact text or by its position among the non-empty options (0-based).
 *  canvas  : the modern Dropdown renders a native `<select>` with `<option>`s inside a Fluent field (probe, 3 Nov 2026), so it is
 *            set with `selectOption`; there is no clickable list
 *  code app: Fluent's Dropdown opens a list of `role="option"` items
 */
export async function pickOption(
  kind: Kind, page: Page, app: FrameLocator, canvasName: string, codeTestId: string, option: string | number,
): Promise<void> {
  if (kind === "canvas") {
    const select = control(kind, app, canvasName, codeTestId).locator("select").first();
    const labels = (await select.locator("option").allInnerTexts()).map((t) => t.trim());
    const label = typeof option === "number" ? labels.filter(Boolean)[option] : option;
    if (!label || !labels.includes(label)) throw new Error(`${canvasName}: no option ${JSON.stringify(option)} in ${JSON.stringify(labels.slice(0, 12))}`);
    await select.selectOption({ label });
    await waitForStable(page, app, { pollMs: 400, timeoutMs: 10_000 });
    return;
  }
  await control(kind, app, canvasName, codeTestId).click({ timeout: 15_000 });
  const options = app.getByRole("option").filter({ visible: true });
  await options.first().waitFor({ state: "visible", timeout: 15_000 });
  const pick = typeof option === "number" ? options.nth(option) : options.filter({ hasText: new RegExp(`^\\s*${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();
  await pick.click({ timeout: 15_000 });
  await waitForStable(page, app, { pollMs: 400, timeoutMs: 10_000 });
}

/** A control by its canvas name (canvas) or by the code app's test id for it (see `FIELDS` in the screen's spec). */
export function control(kind: Kind, app: FrameLocator, canvasName: string, codeTestId = canvasName, nth = 0) {
  return kind === "canvas"
    ? app.locator(`[data-control-name='${canvasName}']`).nth(nth)
    : app.getByTestId(codeTestId).nth(nth);
}
