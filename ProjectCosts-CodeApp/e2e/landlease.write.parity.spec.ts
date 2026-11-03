/**
 * Land Lease write and data-integrity parity (E2E-PARITY-PROMPT.md section 4.5; rule map F2-F11): E2E-LANDLEASE-046 and 047.
 *
 * WRITES TO VSBCloud_Dev, so it runs only with PARITY_WRITE=1 (approved by the user, 2 Nov 2026, for the test project only).
 * Each app creates the same contract ("Add Contract Type") on the same card, tagged `PW-LL-<run>-cv` (Canvas) / `-ca` (code app);
 * the rows each app wrote (header, periods, WTG allocations) are read back from Dataverse with raw values (lib/dataverse.ts) and
 * compared column by column, the tag and the ids masked. Then each app deletes its contract through its own Delete pop-up and the
 * read-back must find nothing left (F9, F10). Every PW- row of the run is deleted in afterAll whatever happened, and anything that
 * could not be deleted is printed.
 *
 *   $env:PARITY_WRITE = "1"; $env:LANDLEASE_PROJECT_ID = "<guid>"; npx playwright test --project=parity landlease.write.parity
 *   LANDLEASE_CARD  the card to add the contract to (default 0)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, type BrowserContext, type FrameLocator, type Page, expect, test } from "@playwright/test";
import { openCanvasCost, openCodeCost, pickOption, projectIdOrSkip, toggleLeaseCard, waitForStable, type Kind } from "./lib/cost";
import { checkKnown, noteDiff, type Known } from "./lib/known";
import { deleteLeaseByTag, normalizeRow, readLeaseByTag, type LeaseRows } from "./lib/dataverse";

const OUT = "e2e/parity-out";
const CARD = Number(process.env.LANDLEASE_CARD ?? 0);
const RUN = (process.env.PARITY_RUN_ID ?? Date.now().toString(36)).replace(/[^A-Za-z0-9]/g, "");
const TAG: Record<Kind, string> = { canvas: `PW-LL-${RUN}-cv`, code: `PW-LL-${RUN}-ca` };
const P = "txt_LandLease_RightPanel_NewEditPeriod_BodyContent_";
const C = "txt_LandLease_RightPanel_NewEditCost_BodyContent_";
const SAVE = "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1";

/** Accepted write differences, key -> reason. F3 (allocation name after a rename) does not occur on a create, so it is not here. */
const KNOWN: Known = {};

test.skip(process.env.PARITY_WRITE !== "1", "Write layer: set PARITY_WRITE=1 (it creates and deletes PW- rows on DEV)");
test.describe.configure({ mode: "serial", timeout: 1_200_000 });

let reader: { ctx: BrowserContext; page: Page } | null = null;
const written: Partial<Record<Kind, LeaseRows>> = {};

async function readerPage(browser: Browser, projectId: string): Promise<Page> {
  if (!reader) {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/codeapp.json", viewport: { width: 1920, height: 1040 } });
    const page = await ctx.newPage();
    await openCodeCost(page, projectId, "/costs/land-lease");
    reader = { ctx, page };
  }
  return reader.page;
}

const app = (kind: Kind, page: Page, projectId: string): Promise<FrameLocator> =>
  kind === "canvas" ? openCanvasCost(page, projectId, "Land Lease") : openCodeCost(page, projectId, "/costs/land-lease");

const byName = (kind: Kind, a: FrameLocator, name: string) =>
  kind === "canvas" ? a.locator(`[data-control-name='${name}']`).first() : a.getByTestId(name).first();

async function fill(kind: Kind, page: Page, a: FrameLocator, field: string, value: string): Promise<void> {
  const input = byName(kind, a, field).locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first();
  await input.click({ force: kind === "canvas", timeout: 30_000 });
  await input.fill(value);
  await input.press("Tab");
  await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
}

async function createContract(kind: Kind, browser: Browser, projectId: string): Promise<void> {
  const ctx = await browser.newContext({ storageState: `e2e/.auth/${kind === "canvas" ? "canvas" : "codeapp"}.json`, viewport: { width: 1920, height: 1040 } });
  const page = await ctx.newPage();
  try {
    const a = await app(kind, page, projectId);
    await toggleLeaseCard(kind, page, a, CARD);
    await a.getByText("Add Contract Type", { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, a);
    await fill(kind, page, a, `${C}Description_1`, TAG[kind]);
    await fill(kind, page, a, `${P}EuroWTG_1`, "1000");
    // The canvas also requires a Duration, a Distribution Frequency and an Allocation (first write run, 3 Nov 2026).
    await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1", "lease-years", "1 year");
    await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1", "lease-months", "0 months");
    await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1", "lease-frequency", 0);
    await byName(kind, a, kind === "canvas" ? "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs" : "lease-all-wtg")
      .click({ force: kind === "canvas", timeout: 15_000 });
    await waitForStable(page, a, { pollMs: 400, timeoutMs: 10_000 });
    const save = byName(kind, a, SAVE).locator("xpath=descendant-or-self::button").first();
    await expect(save, `${kind}: Save is enabled for the minimal contract (if not, the panel needs another field; see the screenshot)`).toBeEnabled({ timeout: 15_000 });
    await save.click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, a, { timeoutMs: 90_000 });
  } finally {
    await page.screenshot({ path: `${OUT}/landlease.write.${kind}.created.png` }).catch(() => {});
    await ctx.close();
  }
}

async function deleteContract(kind: Kind, browser: Browser, projectId: string): Promise<void> {
  const ctx = await browser.newContext({ storageState: `e2e/.auth/${kind === "canvas" ? "canvas" : "codeapp"}.json`, viewport: { width: 1920, height: 1040 } });
  const page = await ctx.newPage();
  try {
    const a = await app(kind, page, projectId);
    await toggleLeaseCard(kind, page, a, CARD);
    // The new contract's Period 1 row carries the tag in its name; selecting it then Delete opens the delete-contract pop-up (B10).
    await a.getByText(TAG[kind], { exact: false }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, a);
    await a.getByText("Delete", { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, a);
    const confirm = kind === "canvas"
      ? a.locator("[data-control-name^='cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost']").getByText("Delete", { exact: true }).first()
      // `ConfirmDialog` is a Fluent Dialog with `modalType="alert"`, so its role is `alertdialog`, not `dialog`.
      : a.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true });
    await confirm.click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, a, { timeoutMs: 90_000 });
  } finally {
    await page.screenshot({ path: `${OUT}/landlease.write.${kind}.deleted.png` }).catch(() => {});
    await ctx.close();
  }
}

/** Waits until the rows of `tag` can be read and stop changing (a save may still be writing allocations). */
async function settledRows(page: Page, tag: string, want: "some" | "none"): Promise<LeaseRows> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const rows = await readLeaseByTag(page, tag);
    const key = JSON.stringify([rows.costs.length, rows.periods.length, rows.allocations.length]);
    const ok = want === "none" ? rows.costs.length + rows.periods.length + rows.allocations.length === 0 : rows.costs.length > 0;
    if (ok && key === last) return rows;
    last = key;
    await page.waitForTimeout(1500);
  }
  return readLeaseByTag(page, tag);
}

test.afterAll(async ({ browser }) => {
  if (!process.env.LANDLEASE_PROJECT_ID) return;
  const page = await readerPage(browser, process.env.LANDLEASE_PROJECT_ID.trim());
  const left = [...await deleteLeaseByTag(page, TAG.canvas), ...await deleteLeaseByTag(page, TAG.code)];
  if (left.length) console.log(`PW- rows that could NOT be deleted (delete them by hand):\n${left.join("\n")}`);
  await reader?.ctx.close();
});

test("E2E-LANDLEASE-046 a new contract writes the same rows and columns from both apps, with the Owning Business Unit", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  const page = await readerPage(browser, projectId);
  for (const kind of ["canvas", "code"] as const) {
    await createContract(kind, browser, projectId);
    written[kind] = await settledRows(page, TAG[kind], "some");
  }
  const found: Record<string, string> = {};
  for (const [part, sortKey] of [["costs", "vsb_name"], ["periods", "vsb_period"], ["allocations", "_vsb_generatorinproject_value"]] as const) {
    const norm = (kind: Kind) => (written[kind]?.[part] ?? [])
      .map((r) => normalizeRow(r, TAG[kind]))
      .sort((x, y) => String(x[sortKey]).localeCompare(String(y[sortKey])));
    const a = norm("canvas");
    const b = norm("code");
    noteDiff(found, `writes.${part}.count`, a.length, b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      for (const col of new Set([...Object.keys(a[i]!), ...Object.keys(b[i]!)])) noteDiff(found, `writes.${part}[${i}].${col}`, a[i]![col], b[i]![col]);
    }
    // CONVENTIONS rule 4: every row either app created carries an Owning Business Unit.
    for (const kind of ["canvas", "code"] as const) {
      const missing = (written[kind]?.[part] ?? []).filter((r) => !r._owningbusinessunit_value).length;
      if (missing) found[`writes.${part}.${kind}.owningBusinessUnitMissing`] = `${missing} row(s)`;
    }
  }
  const result = checkKnown(found, KNOWN);
  writeFileSync(`${OUT}/landlease.write.diff.json`, JSON.stringify({ result, written }, null, 1));
  expect({ unexpected: result.unexpected, stale: result.stale }).toEqual({ unexpected: {}, stale: [] });
});

test("E2E-LANDLEASE-047 deleting the contract removes its header, periods and allocations in both apps", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  test.skip(!written.canvas || !written.code, "E2E-LANDLEASE-046 did not create both contracts");
  const page = await readerPage(browser, projectId);
  const left: Record<string, string> = {};
  for (const kind of ["canvas", "code"] as const) {
    await deleteContract(kind, browser, projectId);
    const rows = await settledRows(page, TAG[kind], "none");
    const n = rows.costs.length + rows.periods.length + rows.allocations.length;
    if (n) left[kind] = `${rows.costs.length} header, ${rows.periods.length} period, ${rows.allocations.length} allocation row(s) left`;
  }
  expect(left).toEqual({});
});
