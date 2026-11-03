/**
 * Land Lease standard-contract import parity (rule map F8, B4): E2E-LANDLEASE-070.
 *
 * WRITES TO VSBCloud_Dev (PARITY_WRITE=1, approved by the user for the test project). "Add Standard Contract" creates contracts
 * from the country's standard assumptions, so the rows carry no run tag. They are found NARROWLY: headers of this project,
 * created at or after this test's start (less a small clock margin), flagged `vsb_isstandardcontract`, with their periods and
 * allocations. The import runs in the Canvas first, its rows are read and deleted (the canvas offers the import only while the
 * card has no standard contract), then in the code app; the two sets are compared column by column, ids masked.
 * afterAll deletes any standard row of this project created during the run, whatever happened.
 *
 *   LANDLEASE_STD_CARD  the card whose "Add Standard Contract" is enabled (default 6, "Temporary Areas" on the test project)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";
import {
  cardCommand, cardCommandEnabled, openCodeCost, projectIdOrSkip, toggleLeaseCard, waitForNotBusy, waitForStable, type Kind,
} from "./lib/cost";
import { checkKnown, type Known } from "./lib/known";
import { deleteLeaseRows, readLeaseCreatedSince, type LeaseRows } from "./lib/dataverse";
import { appContext, diffLeaseRows, openLease } from "./lib/leaseFlows";

const OUT = "e2e/parity-out";
const STD_CARD = Number(process.env.LANDLEASE_STD_CARD ?? 6);
/** Rows created by this run: the server's `createdon` may run a little behind this machine's clock. */
const MARGIN_MS = 120_000;
const NO_TAG = "\u0000no-tag";
const KNOWN: Known = {};

test.skip(process.env.PARITY_WRITE !== "1", "Standard import: set PARITY_WRITE=1 (it creates and deletes rows on DEV)");
test.describe.configure({ mode: "serial", timeout: 1_800_000 });

let reader: { ctx: BrowserContext; page: Page } | null = null;
let suiteStart = "";
async function readerPage(browser: Browser, projectId: string): Promise<Page> {
  if (!reader) {
    const { ctx, page } = await appContext(browser, "code");
    await openCodeCost(page, projectId, "/costs/land-lease");
    reader = { ctx, page };
  }
  return reader.page;
}

/** Only the standard contracts (and their children) among the rows created since `since`. */
async function importedSince(r: Page, projectId: string, since: string): Promise<LeaseRows> {
  const all = await readLeaseCreatedSince(r, projectId, since);
  const costs = all.costs.filter((c) => c.vsb_isstandardcontract === true);
  const ids = new Set(costs.map((c) => String(c.vsb_landleaseprojectcostid)));
  return {
    costs,
    periods: all.periods.filter((p) => ids.has(String(p._vsb_projectcost_value))),
    allocations: all.allocations.filter((a) => ids.has(String(a._vsb_projectcost_value))),
  };
}

async function settledImport(r: Page, projectId: string, since: string): Promise<LeaseRows> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const rows = await importedSince(r, projectId, since);
    const key = JSON.stringify([rows.costs.length, rows.periods.length, rows.allocations.length]);
    if (rows.costs.length > 0 && key === last) return rows;
    last = key;
    await r.waitForTimeout(2000);
  }
  return importedSince(r, projectId, since);
}

test.afterAll(async ({ browser }) => {
  const pid = process.env.LANDLEASE_PROJECT_ID?.trim();
  if (!pid || !suiteStart) return;
  const r = await readerPage(browser, pid);
  const left = await deleteLeaseRows(r, await importedSince(r, pid, suiteStart));
  if (left.length) console.log(`Standard rows that could NOT be deleted (delete them by hand):\n${left.join("\n")}`);
  await reader?.ctx.close();
});

test("E2E-LANDLEASE-070 Add Standard Contract imports the same contracts, periods and allocations in both apps", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  suiteStart = new Date(Date.now() - MARGIN_MS).toISOString();
  const r = await readerPage(browser, projectId);
  expect((await importedSince(r, projectId, suiteStart)).costs.length, "no standard contract created in the last minutes before the test").toBe(0);
  const imported: Partial<Record<Kind, LeaseRows>> = {};
  for (const kind of ["canvas", "code"] as const) {
    const since = new Date(Date.now() - MARGIN_MS).toISOString();
    const { ctx, page } = await appContext(browser, kind);
    try {
      const a = await openLease(kind, page, projectId);
      await toggleLeaseCard(kind, page, a, STD_CARD);
      // The command of THIS card's bar: another card's bar can be on screen too (first run, 3 Nov 2026).
      expect(await cardCommandEnabled(kind, a, STD_CARD, "Add Standard Contract"), `${kind}: "Add Standard Contract" is enabled on card ${STD_CARD}`).toBe(true);
      await (await cardCommand(kind, a, STD_CARD, "Add Standard Contract")).click({ force: kind === "canvas", timeout: 30_000 });
      await waitForNotBusy(a);
      await waitForStable(page, a, { timeoutMs: 120_000 });
      await page.screenshot({ path: `${OUT}/landlease.standard.${kind}.png` }).catch(() => {});
    } finally {
      await ctx.close();
    }
    imported[kind] = await settledImport(r, projectId, since);
    // Delete this import before the other app runs: the import is offered only while the card has no standard contract.
    const left = await deleteLeaseRows(r, imported[kind]!);
    expect(left, `${kind}: its imported rows could be deleted`).toEqual([]);
  }
  const found: Record<string, string> = {};
  diffLeaseRows(found, "standard", imported.canvas!, imported.code!, { canvas: NO_TAG, code: NO_TAG });
  const result = checkKnown(found, KNOWN);
  writeFileSync(`${OUT}/landlease.standard.diff.json`, JSON.stringify({ result, imported }, null, 1));
  expect(imported.canvas!.costs.length, "the canvas imported at least one standard contract").toBeGreaterThan(0);
  expect({ unexpected: result.unexpected, stale: result.stale }).toEqual({ unexpected: {}, stale: [] });
});
