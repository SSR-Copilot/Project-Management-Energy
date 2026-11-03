/**
 * Land Lease parity run, visible text (E2E-PARITY-PROMPT.md sections 5 and 7; plan: ProjectDocs/app-docs/e2e/RULEMAP-land-lease.md).
 *
 * Standing order (29 Oct 2026): the Canvas app runs FIRST. For each state it records every visible text (size, weight, colour,
 * position) to `e2e/reference/landlease.<state>.canvas.texts.json`; the code app run then pairs the same texts by their words
 * (`compareTexts`) and writes `e2e/parity-out/landlease.<state>.diff.json`, the code app's texts and a screenshot of each app.
 * Read-only: every state starts from a freshly opened screen, panels and pop-ups are only opened, nothing is saved.
 *
 *   $env:LANDLEASE_PROJECT_ID = "<test project guid>"     # required; never written into a file
 *   npx playwright test --project=parity landlease.parity -g "EXPLORE"      # step 0: which card positions to use
 *   npx playwright test --project=parity landlease.parity -g "Canvas"       # step 1
 *   npx playwright test --project=parity landlease.parity -g "code app"     # step 2
 *   node e2e/report-parity.mjs landlease
 *
 * Card positions (0-based, in screen order; set them from the EXPLORE output, the defaults suit most projects):
 *   LANDLEASE_CARD        a sub-account card with several periods and costs   (default 0)
 *   LANDLEASE_EMPTY_CARD  a sub-account card with no costs                    (state skipped when unset)
 *   LANDLEASE_STATES      a comma list of state names to run                  (default: all)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { type Browser, type FrameLocator, type Page, test } from "@playwright/test";
import { shot } from "./lib/parity";
import { collectTexts, compareTexts, type TextFact } from "./lib/texts";
import {
  control, leaseCardTitles, leaseRowCount, openCanvasCost, openCodeCost, projectIdOrSkip, selectLeaseRow, toggleLeaseCard,
  waitForStable, type Kind,
} from "./lib/cost";

const OUT = "e2e/parity-out";
const REF = "e2e/reference";
const MENU = "Land Lease";
const COST_SCREEN = "/costs/land-lease";
const CARD = Number(process.env.LANDLEASE_CARD ?? 0);
const EMPTY_CARD = process.env.LANDLEASE_EMPTY_CARD === undefined ? null : Number(process.env.LANDLEASE_EMPTY_CARD);
const ONLY = process.env.LANDLEASE_STATES?.split(",").map((s) => s.trim());

/** The canvas control names and the code app's test ids for the same thing (the code app uses its own ids for some). */
const IDS = {
  otp: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment", code: "lease-otp" },
  inflation: { canvas: "tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1", code: "lease-inflation" },
  allWtg: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs", code: "lease-all-wtg" },
} as const;

const expandCard = (kind: Kind, page: Page, app: FrameLocator, index: number): Promise<void> => toggleLeaseCard(kind, page, app, index);

const selectFirstRow = (kind: Kind, page: Page, app: FrameLocator): Promise<void> => selectLeaseRow(kind, page, app, 0);

/** A command of the expanded card, by its caption (the same verbatim caption in both apps). */
async function command(kind: Kind, page: Page, app: FrameLocator, caption: string): Promise<void> {
  await app.getByText(caption, { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: 15_000 });
  await waitForStable(page, app);
}

async function toggle(kind: Kind, page: Page, app: FrameLocator, id: { canvas: string; code: string }): Promise<void> {
  await control(kind, app, id.canvas, id.code).click({ force: kind === "canvas", timeout: 15_000 });
  await waitForStable(page, app);
}

interface State { name: string; steps: (kind: Kind, page: Page, app: FrameLocator) => Promise<void> }

const STATES: State[] = [
  { name: "default", steps: async () => {} },
  { name: "card-open", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); } },
  { name: "row-selected", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await selectFirstRow(k, p, a); } },
  ...(EMPTY_CARD === null ? [] : [{ name: "empty-card-open", steps: async (k: Kind, p: Page, a: FrameLocator) => { await expandCard(k, p, a, EMPTY_CARD); } }]),
  { name: "new-contract-panel", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await command(k, p, a, "Add Contract Type"); } },
  { name: "new-contract-otp-on", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await command(k, p, a, "Add Contract Type"); await toggle(k, p, a, IDS.otp); } },
  { name: "new-contract-inflation-on", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await command(k, p, a, "Add Contract Type"); await toggle(k, p, a, IDS.inflation); } },
  { name: "new-contract-allwtg-toggled", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await command(k, p, a, "Add Contract Type"); await toggle(k, p, a, IDS.allWtg); } },
  { name: "new-period-panel", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await selectFirstRow(k, p, a); await command(k, p, a, "Add Period"); } },
  { name: "edit-panel", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await selectFirstRow(k, p, a); await command(k, p, a, "Edit"); } },
  { name: "delete-confirmation", steps: async (k, p, a) => { await expandCard(k, p, a, CARD); await selectFirstRow(k, p, a); await command(k, p, a, "Delete"); } },
];
const states = STATES.filter((s) => !ONLY || ONLY.includes(s.name));

const context = (browser: Browser, session: string) =>
  browser.newContext({ storageState: `e2e/.auth/${session}.json`, viewport: { width: 1920, height: 1040 } });

/** Opens the screen fresh for a state, so no state inherits another one's panels or selection. */
const open = (kind: Kind, page: Page, projectId: string) =>
  kind === "canvas" ? openCanvasCost(page, projectId, MENU) : openCodeCost(page, projectId, COST_SCREEN);

test.describe.configure({ mode: "serial", timeout: 1_800_000 });

test("EXPLORE both apps: the sub-account cards in screen order, with their row counts", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  for (const kind of ["canvas", "code"] as const) {
    const ctx = await context(browser, kind === "canvas" ? "canvas" : "codeapp");
    const page = await ctx.newPage();
    const app = await open(kind, page, projectId);
    const titles = await leaseCardTitles(kind, app);
    const lines: string[] = [];
    for (let i = 0; i < titles.length; i++) {
      // A card the screen opened by itself is folded first, so each count is that card's rows only.
      const rowsNow = () => leaseRowCount(kind, app);
      const before = await rowsNow();
      await expandCard(kind, page, app, i);
      const after = await rowsNow();
      lines.push(`  card ${i} "${titles[i]}": ${Math.abs(after - before)} row(s)`);
      await expandCard(kind, page, app, i); // back as it was
    }
    console.log(`${kind}: ${titles.length} sub-account card(s)\n${lines.join("\n")}`);
    await ctx.close();
  }
});

test("Canvas first: record the reference texts of every Land Lease state", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  mkdirSync(REF, { recursive: true });
  const ctx = await context(browser, "canvas");
  const page = await ctx.newPage();
  for (const state of states) {
    const app = await open("canvas", page, projectId);
    await state.steps("canvas", page, app);
    const facts = await collectTexts(app);
    writeFileSync(`${REF}/landlease.${state.name}.canvas.texts.json`, JSON.stringify(facts, null, 1));
    await shot(page, `${OUT}/landlease.${state.name}.canvas.png`);
    console.log(`canvas landlease.${state.name}: ${facts.length} texts`);
  }
  await ctx.close();
});

test("code app: compare every Land Lease state with the Canvas reference", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  const ctx = await context(browser, "codeapp");
  const page = await ctx.newPage();
  const summary: string[] = [];
  for (const state of states) {
    const refFile = `${REF}/landlease.${state.name}.canvas.texts.json`;
    if (!existsSync(refFile)) { summary.push(`landlease.${state.name}: no Canvas reference (run the Canvas step first)`); continue; }
    const app = await open("code", page, projectId);
    await state.steps("code", page, app);
    const code = await collectTexts(app);
    const canvas = JSON.parse(readFileSync(refFile, "utf8")) as TextFact[];
    const result = compareTexts(canvas, code);
    writeFileSync(`${OUT}/landlease.${state.name}.diff.json`, JSON.stringify(result, null, 1));
    writeFileSync(`${OUT}/landlease.${state.name}.code.json`, JSON.stringify(code, null, 1));
    await shot(page, `${OUT}/landlease.${state.name}.code.png`);
    summary.push(`landlease.${state.name}: matched ${result.matched}, differences ${result.diffs.length}, text only in Canvas ${result.missingInCode.length}, text only in code app ${result.extraInCode.length}`);
  }
  console.log(summary.join("\n"));
  await ctx.close();
});
