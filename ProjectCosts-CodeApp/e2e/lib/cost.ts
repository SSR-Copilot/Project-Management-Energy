/**
 * The Cost-screen parity harness: open a Cost screen for one project in both apps (E2E-PARITY-PROMPT.md section 2), plus the
 * Land Lease card, row and command helpers the older specs and the Land Lease manifest share.
 *
 * Opening and waiting (`openCanvasCost`, `openCodeCost`, `waitForStable`, `waitForNotBusy`, `busyNow`, `unclippedIndexesOf`,
 * the app URLs) live in the screen-neutral `lib/appFrame.ts`. They are re-exported here, so the older specs keep their imports.
 *
 * Everything that differs per run comes from the environment, never from code (no project, no URL is written in a test):
 *   LANDLEASE_PROJECT_ID   the test project (required by the Land Lease specs; they skip without it)
 *   CODEAPP_URL            default: the local play URL `pac code run` serves (`lib/appFrame.ts`)
 *   CANVAS_COST_URL        default: the Cost canvas app in VSBCloud_Dev (`lib/appFrame.ts`)
 */
import { type FrameLocator, type Locator, type Page, test } from "@playwright/test";
import { unclippedIndexesOf, waitForStable } from "./appFrame";

export {
  BUSY_INDICATORS, BUSY_MESSAGE, busyNow, CANVAS_COST_URL, CODEAPP_URL, openCanvasCost, openCodeCost, unclippedIndexesOf,
  waitForNotBusy, waitForStable,
} from "./appFrame";

export type Kind = "canvas" | "code";

/** The test project from the environment; the calling test is skipped (not failed) when it is not set. */
export function projectIdOrSkip(variable = "LANDLEASE_PROJECT_ID"): string {
  const id = process.env[variable]?.trim() ?? "";
  test.skip(!/^[0-9a-f-]{36}$/i.test(id), `Set ${variable} to the test project's GUID to run this spec`);
  return id;
}

/** Clicks a visible text in either app. A canvas control sits under an invisible button, so the canvas click is forced. */
export async function clickText(kind: Kind, app: FrameLocator, text: string, nth = 0): Promise<void> {
  await app.getByText(text, { exact: true }).nth(nth).click({ force: kind === "canvas", timeout: 15_000 });
}

const LEASE_CARD_TITLE = "lbl_LandLease_Content_SubaccountsCardHeader_SubaccountName_2";
const LEASE_CHEVRONS = "[data-control-name='ico_LandLease_Content_SubaccountsCardHeader_Down_2'], [data-control-name='ico_LandLease_Content_SubaccountsCardHeader_Up_2']";

/**
 * The title of Canvas card `index` in SCREEN order: the `index`th title from the top (by y), not the `index`th in the page.
 * A guard: the Canvas gallery positions its items absolutely, so page order is not guaranteed to be screen order (the probe
 * of 4 Nov 2026 found them equal; the standard import's wrong card was a clipped command, see `cardCommand`). Falls back to
 * page order when fewer titles than `index + 1` have a box.
 */
export async function canvasCardTitle(app: FrameLocator, index: number): Promise<Locator> {
  const titles = app.locator(`[data-control-name='${LEASE_CARD_TITLE}']`);
  const byY = await titles.evaluateAll((els) => els
    .map((e, i) => ({ i, r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0 || x.r.height > 0)
    .sort((a, b) => a.r.top - b.r.top)
    .map((x) => x.i));
  const at = byY[index];
  return titles.nth(at ?? index);
}

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
    const title = await canvasCardTitle(app, index);
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
    // The `index`th card SECTION. Not `filter({ has: header.nth(index) })`: `has` is matched inside each section, and each
    // holds exactly one header, so only index 0 ever matched (live run 3, 4 Nov 2026, the standard import on card 6).
    return app.locator("section").filter({ has: app.locator("[data-testid^='leasecard-']") }).nth(index)
      .getByText(caption, { exact: true }).first();
  }
  const title = await (await canvasCardTitle(app, index)).boundingBox();
  if (!title) throw new Error(`Canvas card ${index}: title not on screen`);
  const items = app.getByText(caption, { exact: true });
  // Only commands a user can SEE: a folded card keeps its bar laid out but clipped, 49 px under its own title, which is just
  // below the NEXT card's title (probe, 4 Nov 2026: card 5's hidden "Add Standard Contract" at y 340, card 6's title at 333,
  // card 6's own command at 382). Playwright's isVisible ignores clipping, so the standard import clicked card 5's button.
  const seen = new Set(await unclippedIndexesOf(items));
  let best = -1;
  let bestDy = Number.POSITIVE_INFINITY;
  for (let k = 0, n = await items.count(); k < n; k++) {
    if (!seen.has(k)) continue;
    const b = await items.nth(k).boundingBox();
    if (!b) continue;
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
    const title = await canvasCardTitle(app, i); // screen order, not page order
    await title.scrollIntoViewIfNeeded().catch(() => {});
    seen.push((await title.innerText().catch(() => "")).trim());
  }
  return seen;
}

/**
 * The indexes of the elements matching `selector` that a user can actually see (`lib/appFrame.ts` unclippedIndexesOf: a folded
 * canvas card keeps its rows laid out but clipped).
 */
export async function unclippedIndexes(app: FrameLocator, selector: string): Promise<number[]> {
  return unclippedIndexesOf(app.locator(selector));
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
  // A card's rows can render a moment after it opens (live run 10, 4 Nov 2026: "visible rows: 0" right after the open), so
  // the row is waited for, up to 20 s, before it is called missing.
  let shown = await unclippedIndexes(app, LEASE_ROW[kind]);
  for (let end = Date.now() + 20_000; shown[n] === undefined && Date.now() < end;) {
    await page.waitForTimeout(500);
    shown = await unclippedIndexes(app, LEASE_ROW[kind]);
  }
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
