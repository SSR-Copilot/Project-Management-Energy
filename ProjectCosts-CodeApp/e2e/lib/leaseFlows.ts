/**
 * Land Lease UI flows shared by the write specs (landlease.write.parity, landlease.flows.parity): open the screen in a fresh
 * context, fill fields, create a contract, select a tagged period row, run a command, confirm a delete, save, and read back the
 * rows a flow wrote. One definition each (CONVENTIONS rule 17). Writes happen only through the apps' own panels.
 */
import { type Browser, type BrowserContext, type FrameLocator, type Locator, type Page, expect } from "@playwright/test";
import { openCanvasCost, openCodeCost, pickOption, toggleLeaseCard, waitForNotBusy, waitForStable, type Kind } from "./cost";
import { normalizeRow, readLeaseByTag, type LeaseRows } from "./dataverse";

export const P = "txt_LandLease_RightPanel_NewEditPeriod_BodyContent_";
export const C = "txt_LandLease_RightPanel_NewEditCost_BodyContent_";
export const SAVE = "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1";
const T = 30_000;

/** A fresh browser context for one app, signed in from its saved session. */
export async function appContext(browser: Browser, kind: Kind): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: `e2e/.auth/${kind === "canvas" ? "canvas" : "codeapp"}.json`, viewport: { width: 1920, height: 1040 } });
  return { ctx, page: await ctx.newPage() };
}

export const openLease = (kind: Kind, page: Page, projectId: string): Promise<FrameLocator> =>
  kind === "canvas" ? openCanvasCost(page, projectId, "Land Lease") : openCodeCost(page, projectId, "/costs/land-lease");

export const byName = (kind: Kind, a: FrameLocator, name: string) =>
  kind === "canvas" ? a.locator(`[data-control-name='${name}']`).first() : a.getByTestId(name).first();

/** Types into a text field and leaves it (Tab), so its OnChange / onBlur runs. */
export async function fill(kind: Kind, page: Page, a: FrameLocator, field: string, value: string): Promise<void> {
  const input = byName(kind, a, field).locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first();
  await input.click({ force: kind === "canvas", timeout: T });
  await input.fill(value);
  await input.press("Tab");
  await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
}

/** Clicks a control given as canvas name / code test id (a toggle, an icon button). */
export async function press(kind: Kind, page: Page, a: FrameLocator, canvasName: string, codeTestId: string): Promise<void> {
  await byName(kind, a, kind === "canvas" ? canvasName : codeTestId).click({ force: kind === "canvas", timeout: T });
  await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
}

/** A command of the open card, by its verbatim caption. */
export async function command(kind: Kind, page: Page, a: FrameLocator, caption: string): Promise<void> {
  await a.getByText(caption, { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: T });
  await waitForStable(page, a);
}

/**
 * Selects the `n`th period row whose text contains `text` (the run tag), in screen order.
 *  canvas  : the row container (`con_…CostsTableRow_1`), forced: the click lands on its transparent select button
 *  code app: the table row ITSELF is the select button (`<tr data-testid="btn_…TransparentButton_2-<id>">`, as the canvas
 *            row is one transparent button); clicking a selected row deselects it, so a flow starts from a fresh screen
 */
export async function selectRowWith(kind: Kind, page: Page, a: FrameLocator, text: string, n = 0): Promise<void> {
  if (kind === "canvas") {
    await a.locator("[data-control-name='con_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_1']").filter({ hasText: text })
      .filter({ visible: true }).nth(n).click({ force: true, timeout: T });
  } else {
    await a.locator("tr[data-testid^='btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_2-']")
      .filter({ hasText: text }).nth(n).click({ timeout: T });
  }
  await waitForStable(page, a);
}

/** Clicks Save of the open panel (after checking it is enabled) and waits for the screen to settle. */
export async function save(kind: Kind, page: Page, a: FrameLocator, what: string): Promise<void> {
  const btn = byName(kind, a, SAVE).locator("xpath=descendant-or-self::button").first();
  await expect(btn, `${kind}: Save is enabled for ${what} (if not, the panel needs another field; see the screenshot)`).toBeEnabled({ timeout: 15_000 });
  await btn.click({ force: kind === "canvas", timeout: T });
  // Until "Saving ..." has gone the app is still writing; leaving now would abort the save (Stage B run, 3 Nov 2026).
  await waitForNotBusy(a);
  await waitForStable(page, a, { timeoutMs: 90_000 });
}

/**
 * Confirms the delete pop-up that opened. The canvas has two (B10): deleting Period 1 deletes the contract
 * (`…DeleteLandLeaseCost`), any other period only itself (`…DeletePeriod`); returns which one was shown. The code app's
 * `ConfirmDialog` is a Fluent Dialog with `modalType="alert"`, so its role is `alertdialog`.
 */
export async function confirmDelete(kind: Kind, page: Page, a: FrameLocator): Promise<"contract" | "period" | "dialog"> {
  let which: "contract" | "period" | "dialog" = "dialog";
  if (kind === "canvas") {
    const contract = a.locator("[data-control-name^='cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost']");
    const period = a.locator("[data-control-name^='cmp_LandLease_PopUpConfirmation_DeletePeriod']");
    which = (await contract.getByText("Delete", { exact: true }).first().isVisible().catch(() => false)) ? "contract" : "period";
    await (which === "contract" ? contract : period).getByText("Delete", { exact: true }).first().click({ force: true, timeout: T });
  } else {
    await a.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click({ timeout: T });
  }
  await waitForNotBusy(a);
  await waitForStable(page, a, { timeoutMs: 90_000 });
  return which;
}

/**
 * The full text of the delete prompt that opened (title, body, buttons), whitespace collapsed, so the two apps' wording can be
 * compared verbatim: the canvas pop-up (`…DeleteLandLeaseCost` for a contract, `…DeletePeriod` for a period) or the code app's
 * `alertdialog`. "none" when no prompt is open.
 */
export async function deletePromptText(kind: Kind, a: FrameLocator): Promise<string> {
  // The canvas buttons put an icon-font glyph (Unicode private use) before "Delete" / "Cancel": not wording, so it is removed.
  const text = async (l: Locator) => (await l.first().innerText())
    .replace(/[-​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  if (kind === "canvas") {
    for (const sel of ["DeleteLandLeaseCost", "DeletePeriod"]) {
      const host = a.locator(`[data-control-name^='cmp_LandLease_PopUpConfirmation_${sel}']`);
      if (await host.getByText("Delete", { exact: true }).first().isVisible().catch(() => false)) return text(host);
    }
    return "none";
  }
  const d = a.getByRole("alertdialog");
  return (await d.count()) ? text(d) : "none";
}

const ALLOCATION = { canvas: "cmb_LandLease_RightPanel_NewEditCost_BodyContent_AllocationWtg_1", code: "lease-allocation" } as const;

/**
 * Ticks or unticks one generator in the open panel's Allocation list (probe, 3 Nov 2026): both apps open a list of
 * `role="menuitemcheckbox"` items — the canvas through its ComboBox's "Open" button, the code app through its dropdown button.
 * The list is closed by the same trigger (Escape would also close the panel).
 */
export async function setAllocation(kind: Kind, page: Page, a: FrameLocator, generator: string, checked: boolean): Promise<void> {
  const host = byName(kind, a, kind === "canvas" ? ALLOCATION.canvas : ALLOCATION.code);
  const trigger = kind === "canvas" ? host.locator("[aria-label='Open'], span[role='button']").first() : host;
  await trigger.click({ force: kind === "canvas", timeout: T });
  const item = a.getByRole("menuitemcheckbox", { name: generator, exact: true });
  await item.waitFor({ state: "visible", timeout: 15_000 });
  if ((await item.getAttribute("aria-checked")) !== String(checked)) await item.click({ timeout: T });
  await trigger.click({ force: kind === "canvas", timeout: T }).catch(() => {});
  await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
}

/**
 * Sets the open panel's Start Date to day `day` of the month it shows. The code app's date input takes typed text; the canvas
 * date picker does not (a fill times out; probe, 3 Nov 2026), so its calendar is opened and the day is clicked.
 */
export async function setStartDay(kind: Kind, page: Page, a: FrameLocator, day: number): Promise<string> {
  if (kind === "code") {
    const input = a.getByTestId("lease-start");
    const shown = new Date(await input.inputValue());
    if (Number.isNaN(shown.getTime())) throw new Error(`code: Start Date not readable: ${await input.inputValue()}`);
    await input.fill(`${shown.getMonth() + 1}/${day}/${shown.getFullYear()}`);
    await input.press("Enter");
    await page.keyboard.press("Tab");
    await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
    return input.inputValue();
  }
  const host = a.locator("[data-control-name='dte_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_1']").first();
  await host.locator("span[role='button'], button").first().click({ force: true, timeout: T });
  const grid = a.locator("[role='grid']").filter({ visible: true }).first();
  await grid.waitFor({ state: "visible", timeout: 15_000 });
  // The day of the month on show (not a greyed day of the month before or after).
  await grid.getByRole("button", { name: new RegExp(`^${day},`) }).first().click({ timeout: T })
    .catch(async () => grid.getByText(String(day), { exact: true }).first().click({ timeout: T }));
  await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
  return host.locator("input").first().inputValue();
}

/** A minimal new contract on card `card`, tagged `tag` (the fields the canvas requires; first write run, 3 Nov 2026). */
export async function createContract(kind: Kind, page: Page, a: FrameLocator, card: number, tag: string): Promise<void> {
  await toggleLeaseCard(kind, page, a, card);
  await command(kind, page, a, "Add Contract Type");
  await fill(kind, page, a, `${C}Description_1`, tag);
  await fill(kind, page, a, `${P}EuroWTG_1`, "1000");
  await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1", "lease-years", "1 year");
  await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1", "lease-months", "0 months");
  await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1", "lease-frequency", 0);
  await press(kind, page, a, "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs", "lease-all-wtg");
  await save(kind, page, a, "the minimal contract");
}

/**
 * Records into `found` every difference between the rows two apps wrote (header, periods, WTG allocations), with each app's
 * tag masked and ids / audit stamps left out (`normalizeRow`), plus any row without an Owning Business Unit (CONVENTIONS rule 4).
 */
export function diffLeaseRows(
  found: Record<string, string>, prefix: string, canvas: LeaseRows, code: LeaseRows, tags: { canvas: string; code: string },
): void {
  const same = (key: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) found[key] = `canvas ${JSON.stringify(x)} / code ${JSON.stringify(y)}`;
  };
  for (const [part, sortKey] of [["costs", "vsb_name"], ["periods", "vsb_period"], ["allocations", "_vsb_generatorinproject_value"]] as const) {
    const norm = (rows: LeaseRows, tag: string) => rows[part].map((r) => normalizeRow(r, tag))
      .sort((x, y) => String(x[sortKey]).localeCompare(String(y[sortKey])));
    const a = norm(canvas, tags.canvas);
    const b = norm(code, tags.code);
    same(`${prefix}.${part}.count`, a.length, b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      for (const col of new Set([...Object.keys(a[i]!), ...Object.keys(b[i]!)])) same(`${prefix}.${part}[${i}].${col}`, a[i]![col], b[i]![col]);
    }
    for (const [kind, rows] of [["canvas", canvas], ["code", code]] as const) {
      const missing = rows[part].filter((r) => !r._owningbusinessunit_value).length;
      if (missing) found[`${prefix}.${part}.${kind}.owningBusinessUnitMissing`] = `${missing} row(s)`;
    }
  }
}

/** Waits until the rows of `tag` can be read and stop changing (a save may still be writing allocations). */
export async function settledRows(reader: Page, tag: string, want: "some" | "none" = "some"): Promise<LeaseRows> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const rows = await readLeaseByTag(reader, tag);
    const key = JSON.stringify(rows);
    const n = rows.costs.length + rows.periods.length + rows.allocations.length;
    const ok = want === "none" ? n === 0 : rows.costs.length > 0;
    if (ok && key === last) return rows;
    last = key;
    await reader.waitForTimeout(1500);
  }
  return readLeaseByTag(reader, tag);
}
