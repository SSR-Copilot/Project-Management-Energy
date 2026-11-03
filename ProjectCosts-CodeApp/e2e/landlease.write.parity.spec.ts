/**
 * Land Lease write and data-integrity parity (E2E-PARITY-PROMPT.md section 4.5; rule map F2-F11): E2E-LANDLEASE-046 and 047.
 *
 * WRITES TO VSBCloud_Dev, so it runs only with PARITY_WRITE=1 (approved by the user, 2 Nov 2026, for the test project only).
 * Each app creates the same contract ("Add Contract Type") on the same card, tagged `PW-LL-<run>-cv` (Canvas) / `-ca` (code app);
 * the rows each app wrote (header, periods, WTG allocations) are read back from Dataverse with raw values (lib/dataverse.ts) and
 * compared column by column, the tag and the ids masked. Then each app deletes its contract through its own Delete pop-up and the
 * read-back must find nothing left (F9, F10). Every PW- row of the run is deleted in afterAll whatever happened, and anything that
 * could not be deleted is printed. The flows themselves are shared with landlease.flows.parity (lib/leaseFlows.ts).
 *
 *   $env:PARITY_WRITE = "1"; $env:LANDLEASE_PROJECT_ID = "<guid>"; npx playwright test --project=parity landlease.write.parity
 *   LANDLEASE_CARD  the card to add the contract to (default 0)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";
import { openCodeCost, projectIdOrSkip, toggleLeaseCard, waitForStable, type Kind } from "./lib/cost";
import { checkKnown, type Known } from "./lib/known";
import { deleteLeaseByTag, type LeaseRows } from "./lib/dataverse";
import { appContext, command, confirmDelete, createContract, diffLeaseRows, openLease, selectRowWith, settledRows } from "./lib/leaseFlows";

const OUT = "e2e/parity-out";
const CARD = Number(process.env.LANDLEASE_CARD ?? 0);
const RUN = (process.env.PARITY_RUN_ID ?? Date.now().toString(36)).replace(/[^A-Za-z0-9]/g, "");
const TAG: Record<Kind, string> = { canvas: `PW-LL-${RUN}-cv`, code: `PW-LL-${RUN}-ca` };

/** Accepted write differences, key -> reason. F3 (allocation name after a rename) does not occur on a create, so it is not here. */
const KNOWN: Known = {};

test.skip(process.env.PARITY_WRITE !== "1", "Write layer: set PARITY_WRITE=1 (it creates and deletes PW- rows on DEV)");
test.describe.configure({ mode: "serial", timeout: 1_200_000 });

let reader: { ctx: BrowserContext; page: Page } | null = null;
const written: Partial<Record<Kind, LeaseRows>> = {};

async function readerPage(browser: Browser, projectId: string): Promise<Page> {
  if (!reader) {
    const { ctx, page } = await appContext(browser, "code");
    await openCodeCost(page, projectId, "/costs/land-lease");
    reader = { ctx, page };
  }
  return reader.page;
}

/** One flow in a fresh context of `kind`, with a screenshot of where it ended. */
async function inApp(kind: Kind, browser: Browser, projectId: string, shotName: string, flow: (page: Page) => Promise<void>): Promise<void> {
  const { ctx, page } = await appContext(browser, kind);
  try {
    await flow(page);
  } finally {
    await page.screenshot({ path: `${OUT}/landlease.write.${kind}.${shotName}.png` }).catch(() => {});
    await ctx.close();
  }
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
    await inApp(kind, browser, projectId, "created", async (p) => createContract(kind, p, await openLease(kind, p, projectId), CARD, TAG[kind]));
    written[kind] = await settledRows(page, TAG[kind], "some");
  }
  const found: Record<string, string> = {};
  diffLeaseRows(found, "writes", written.canvas!, written.code!, TAG);
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
    await inApp(kind, browser, projectId, "deleted", async (p) => {
      const a = await openLease(kind, p, projectId);
      await toggleLeaseCard(kind, p, a, CARD);
      // The new contract's Period 1 row carries the tag; selecting it then Delete opens the delete-contract pop-up (B10).
      await selectRowWith(kind, p, a, TAG[kind]);
      await command(kind, p, a, "Delete");
      await confirmDelete(kind, p, a);
      await waitForStable(p, a);
    });
    const rows = await settledRows(page, TAG[kind], "none");
    const n = rows.costs.length + rows.periods.length + rows.allocations.length;
    if (n) left[kind] = `${rows.costs.length} header, ${rows.periods.length} period, ${rows.allocations.length} allocation row(s) left`;
  }
  expect(left).toEqual({});
});
