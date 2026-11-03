/**
 * Land Lease Stage B parity: the functional flows, compared in Dataverse step by step (rule map B, C, D, F, G): E2E-LANDLEASE-060.
 *
 * WRITES TO VSBCloud_Dev (PARITY_WRITE=1, approved by the user for the test project). Each app runs the SAME steps on ITS OWN
 * contract, tagged `PW-LL-<run>-cv` / `-ca`, through its own panels; after every step the rows of that contract (header, periods,
 * WTG allocations) are read back raw (lib/dataverse.ts) and the two apps are compared column by column, tag and ids masked:
 *   S1 create the contract (Period 1)                        S2 Add Period on Period 1 -> Period 2
 *   S3 Add Period on Period 2 -> Period 3                    S4 gates with Period 1 / 2 / 3 selected + the delete prompt offered
 *   S5 Edit Period 2 (EUR/WTG, Fix Costs)                    S6 delete Period 3 only (the period pop-up)
 *   S7 edit Period 1: One-Time Payment on (payments 1 and 2) and Inflation on (start year, profile)
 *   S8 take one generator off the contract (Allocate to all off, one item unticked; F4, D5)
 *   S9 move Period 1's Start Date to the 20th (the date and its standard-assumption flag; C4)
 * A difference fails unless it is in KNOWN. Every PW- row of the run is deleted in afterAll whatever happened.
 *
 *   $env:PARITY_WRITE = "1"; $env:LANDLEASE_PROJECT_ID = "<guid>"; npx playwright test --project=parity landlease.flows.parity
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, type BrowserContext, type FrameLocator, type Page, expect, test } from "@playwright/test";
import { leaseCommandStates, openCodeCost, pickOption, projectIdOrSkip, toggleLeaseCard, waitForStable, type Kind } from "./lib/cost";
import { checkKnown, type Known } from "./lib/known";
import { deleteLeaseByTag, type LeaseRows } from "./lib/dataverse";
import {
  C, P, appContext, command, confirmDelete, createContract, deletePromptText, diffLeaseRows, fill, openLease, press, save,
  selectRowWith, setAllocation, setStartDay, settledRows,
} from "./lib/leaseFlows";

const OUT = "e2e/parity-out";
const CARD = Number(process.env.LANDLEASE_CARD ?? 0);
const RUN = (process.env.PARITY_RUN_ID ?? Date.now().toString(36)).replace(/[^A-Za-z0-9]/g, "");
const TAG: Record<Kind, string> = { canvas: `PW-LL-${RUN}-cv`, code: `PW-LL-${RUN}-ca` };
/** The generator S8 takes off the contract (present on the test project, probe 3 Nov 2026). */
const DEALLOCATE = process.env.LANDLEASE_DEALLOCATE ?? "Test PV Module";

/**
 * Accepted differences, key -> reason (rule map section 5). Only entries whose difference these steps can show are listed, so
 * none can go stale by never occurring.
 */
const KNOWN: Known = {
  "gates.period 1.Add Period": "DIVERGENCE (product owner, 27 Oct 2026, leaseCommands): Add Period on any period; the canvas only on the last by Period",
  "gates.period 2.Add Period": "DIVERGENCE (product owner, 27 Oct 2026, leaseCommands): Add Period on any period; the canvas only on the last by Period",
};

test.skip(process.env.PARITY_WRITE !== "1", "Flows layer: set PARITY_WRITE=1 (it creates, edits and deletes PW- rows on DEV)");
test.describe.configure({ mode: "serial", timeout: 3_600_000 });

let reader: { ctx: BrowserContext; page: Page } | null = null;
async function readerPage(browser: Browser, projectId: string): Promise<Page> {
  if (!reader) {
    const { ctx, page } = await appContext(browser, "code");
    await openCodeCost(page, projectId, "/costs/land-lease");
    reader = { ctx, page };
  }
  return reader.page;
}

interface Run {
  /** A step that failed, by name; the run carries on (every step starts from a freshly opened screen). */
  errors: Record<string, string>;
  rows: Record<string, LeaseRows>;
  gates: Record<string, Record<string, boolean>>;
  prompts: Record<string, string>;
  /** What the Start Date field showed after S9 picked the 20th. */
  startDateShown?: string;
}

/** Opens the screen fresh, opens the card, selects the `n`th row of this app's contract. */
async function atRow(kind: Kind, page: Page, projectId: string, n: number): Promise<FrameLocator> {
  const a = await openLease(kind, page, projectId);
  await toggleLeaseCard(kind, page, a, CARD);
  await selectRowWith(kind, page, a, TAG[kind], n);
  return a;
}

/**
 * The fields an added period needs before Save is enabled (the same values in both apps). The canvas carries the name, the
 * start date and the contract fields over from the previous period, but NOT the Distribution Frequency (first run, 3 Nov).
 */
async function fillPeriod(kind: Kind, page: Page, a: FrameLocator, euroWtg: string): Promise<void> {
  await fill(kind, page, a, `${P}EuroWTG_1`, euroWtg);
  await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1", "lease-years", "1 year");
  await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1", "lease-months", "0 months");
  await pickOption(kind, page, a, "drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1", "lease-frequency", 0);
}

async function runApp(kind: Kind, browser: Browser, projectId: string, reader: Page): Promise<Run> {
  const run: Run = { errors: {}, rows: {}, gates: {}, prompts: {} };
  const { ctx, page } = await appContext(browser, kind);
  // A failed step is recorded and the run goes on, so one slow load does not discard the steps that did complete.
  const step = async (name: string, flow: () => Promise<void>) => {
    try {
      await flow();
    } catch (e) {
      run.errors[name] = String(e).slice(0, 400);
    } finally {
      await page.screenshot({ path: `${OUT}/landlease.flows.${kind}.${name}.png` }).catch(() => {});
    }
    run.rows[name] = await settledRows(reader, TAG[kind]);
  };
  try {
    await step("S1-create", async () => createContract(kind, page, await openLease(kind, page, projectId), CARD, TAG[kind]));
    await step("S2-add-period-2", async () => {
      const a = await atRow(kind, page, projectId, 0);
      await command(kind, page, a, "Add Period");
      await fillPeriod(kind, page, a, "1100");
      await save(kind, page, a, "Period 2");
    });
    await step("S3-add-period-3", async () => {
      const a = await atRow(kind, page, projectId, 1);
      await command(kind, page, a, "Add Period");
      await fillPeriod(kind, page, a, "1200");
      await save(kind, page, a, "Period 3");
    });
    // S4: read-only — the gates per period, and the delete prompt offered for Period 1 and Period 3 (opened, never confirmed).
    for (const n of [0, 1, 2]) {
      try {
        const a = await atRow(kind, page, projectId, n);
        run.gates[`period ${n + 1}`] = await leaseCommandStates(kind, a);
        if (n !== 1) {
          await command(kind, page, a, "Delete");
          run.prompts[`period ${n + 1}`] = (await deletePromptText(kind, a)).split(TAG[kind]).join("<tag>");
        }
      } catch (e) {
        run.errors[`S4-gates-period-${n + 1}`] = String(e).slice(0, 400);
      }
    }
    await step("S5-edit-period-2", async () => {
      const a = await atRow(kind, page, projectId, 1);
      await command(kind, page, a, "Edit");
      await fill(kind, page, a, `${P}EuroWTG_1`, "2000");
      await fill(kind, page, a, `${P}FixedCosts_1`, "500");
      await save(kind, page, a, "the Period 2 edit");
    });
    await step("S6-delete-period-3", async () => {
      const a = await atRow(kind, page, projectId, 2);
      await command(kind, page, a, "Delete");
      await confirmDelete(kind, page, a);
    });
    await step("S7-edit-period-1-payments-inflation", async () => {
      const a = await atRow(kind, page, projectId, 0);
      await command(kind, page, a, "Edit");
      await press(kind, page, a, "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment", "lease-otp");
      await fill(kind, page, a, `${C}DueDate_1`, "12/2027");
      await fill(kind, page, a, `${C}Amount_1`, "500");
      await command(kind, page, a, "Add One-Time payment");
      await fill(kind, page, a, `${C}DueDate2_1`, "06/2028");
      await fill(kind, page, a, `${C}Amount2_1`, "250");
      await press(kind, page, a, "tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1", "lease-inflation");
      await fill(kind, page, a, `${C}InflationStartYear_1`, "2027");
      await fill(kind, page, a, `${C}InflationProfile_1`, "2.0");
      await save(kind, page, a, "Period 1 with payments and inflation");
    });
    // S8 (F4, D5): one generator taken off the contract — "Allocate to all WTGs" off, "Test PV Module" unticked.
    await step("S8-deallocate-one-generator", async () => {
      const a = await atRow(kind, page, projectId, 0);
      await command(kind, page, a, "Edit");
      await press(kind, page, a, "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs", "lease-all-wtg");
      await setAllocation(kind, page, a, DEALLOCATE, false);
      await save(kind, page, a, "Period 1 with one generator less");
    });
    // S9 (C4): Period 1's Start Date moved to the 20th of its month — the date and its standard-assumption flag.
    await step("S9-change-start-date", async () => {
      const a = await atRow(kind, page, projectId, 0);
      await command(kind, page, a, "Edit");
      run.startDateShown = await setStartDay(kind, page, a, 20);
      await save(kind, page, a, "Period 1 with a new start date");
    });
  } finally {
    await ctx.close();
  }
  return run;
}

test.afterAll(async ({ browser }) => {
  if (!process.env.LANDLEASE_PROJECT_ID) return;
  const page = await readerPage(browser, process.env.LANDLEASE_PROJECT_ID.trim());
  const left = [...await deleteLeaseByTag(page, TAG.canvas), ...await deleteLeaseByTag(page, TAG.code)];
  if (left.length) console.log(`PW- rows that could NOT be deleted (delete them by hand):\n${left.join("\n")}`);
  await reader?.ctx.close();
});

test("E2E-LANDLEASE-060 add, edit and delete periods, payments and inflation write the same rows in both apps; gates and prompts match", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  const r = await readerPage(browser, projectId);
  const runs: Partial<Record<Kind, Run>> = {};
  const errors: Record<string, string> = {};
  for (const kind of ["canvas", "code"] as const) {
    try {
      runs[kind] = await runApp(kind, browser, projectId, r);
    } catch (e) {
      errors[kind] = String(e).slice(0, 400);
    }
  }
  const found: Record<string, string> = {};
  const canvas = runs.canvas;
  const code = runs.code;
  for (const kind of ["canvas", "code"] as const) {
    for (const [name, message] of Object.entries(runs[kind]?.errors ?? {})) errors[`${kind}.${name}`] = message;
  }
  if (canvas && code) {
    // Only the steps both apps completed are compared; a failed step is in `errors`, not counted as a row difference.
    for (const name of Object.keys(canvas.rows)) {
      if (canvas.errors[name] || code.errors[name] || !code.rows[name]) continue;
      diffLeaseRows(found, `step.${name}`, canvas.rows[name]!, code.rows[name]!, TAG);
    }
    for (const state of Object.keys(canvas.gates)) {
      for (const cmd of new Set([...Object.keys(canvas.gates[state] ?? {}), ...Object.keys(code.gates[state] ?? {})])) {
        const x = canvas.gates[state]?.[cmd];
        const y = code.gates[state]?.[cmd];
        if (x !== y) found[`gates.${state}.${cmd}`] = `canvas ${x} / code ${y}`;
      }
    }
    if (canvas.startDateShown !== code.startDateShown) found["S9.startDateShown"] = `canvas ${JSON.stringify(canvas.startDateShown)} / code ${JSON.stringify(code.startDateShown)}`;
    for (const k of Object.keys(canvas.prompts)) if (canvas.prompts[k] !== code.prompts[k]) found[`prompts.${k}`] = `canvas ${JSON.stringify(canvas.prompts[k])} / code ${JSON.stringify(code.prompts[k])}`;
  }
  const result = checkKnown(found, KNOWN);
  writeFileSync(`${OUT}/landlease.flows.diff.json`, JSON.stringify({ errors, result, runs }, null, 1));
  expect(errors, "a flow did not finish (see the step screenshots in e2e/parity-out)").toEqual({});
  expect({ unexpected: result.unexpected, stale: result.stale }).toEqual({ unexpected: {}, stale: [] });
});
