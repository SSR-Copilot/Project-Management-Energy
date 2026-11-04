/**
 * Parity manifest: Land Lease (D80; contract `e2e/harness/contract.ts` ScreenManifest).
 *
 * Every check of the old Land Lease specs, as data for the generic lanes (`e2e/harness/lanes/*.lane.ts`). The map from
 * each old assertion to its place here is `ProjectDocs/app-docs/e2e/COVERAGE-MAP-land-lease.md`. Two checks no layer can
 * express live beside this file: `standard.lane.ts` (070, the standard import, which carries no run tag) and
 * `codeapp.lane.ts` (004, a code-app-only assertion).
 *
 *   visual      the 11 states of landlease.parity.spec.ts (empty-card-open needs LANDLEASE_EMPTY_CARD)
 *   validation  the 10 groups and 130 inputs of landlease.validation.parity.spec.ts, unchanged, in the same order
 *   gates       050: every card opened in turn (one gates fact per card, `card-<i>-open`) and a period selected
 *   ux          050 card titles, 051 Save gate, 052 Edit panel load, 053 dropdown options, 054 names and hover texts
 *   flows       046/047 (`contract`, 15 min) and 060 S1–S9 (`periods`, 45 min); S4's gates and prompts and S9's shown start
 *               date are recorded through the lane's `ctx.record` as extra row-shaped facts `periods.S4-gates.ui` /
 *               `periods.S9-change-start-date.ui`. The Owning Business Unit is checked by the flows lane on the SETTLED
 *               rows of every table after every step; a step here only waits until its save has landed (`ctx.rows`)
 *   platform    001–006 are the generic platform lane (`restMarker` is any card's header, the code test id by prefix
 *               `leasecard-`; the smoke state is `card-open`, as 003 checked one open card)
 *
 * Settings from the environment, never from a file (no project id is written here):
 *   LANDLEASE_CARD        card with periods (default 0)          LANDLEASE_ROW          its row for validation (default 0)
 *   LANDLEASE_EMPTY_CARD  a card with no costs (state skipped)   LANDLEASE_STD_CARD     the standard-import card (default 6)
 *   LANDLEASE_DEALLOCATE  the generator S8 unticks
 *
 * Reset to rest WITHOUT a reload (`resetLease`): Escape, Cancel an open delete pop-up and the panel, clear a row
 * selection (a selection survives a fold in both apps), fold every open card, scroll back to the top. If that fails it
 * reloads the page in place. Validation groups reload once per group instead (the canvas panel's Cancel does not reset
 * every field it typed into, so a group must not inherit the previous one's values, as the old suite's fresh screen).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import type { AppHandle, ArtefactRule, Flow, FlowContext, FlowStep, Kind, ScreenManifest, TableSpec, ValidationGroup } from "../../harness/contract";
import { deleteRows, normaliseTables, readCreatedSince, rowCount, type TableRows } from "../../harness/data";
import { runEnv } from "../../harness/env";
import { visualKeyParts } from "../../harness/screens";
import { writeFact } from "../../harness/store";
import { settle } from "../../harness/waits";
import {
  canvasCardTitle, cardCommand, cardCommandEnabled, control, leaseCardTitles, leaseCommandStates, leaseRowCount, pickOption,
  selectLeaseRow, toggleLeaseCard, unclippedIndexesOf, waitForNotBusy, waitForStable,
} from "../../lib/cost";
import { LAND_LEASE_TABLES } from "../../lib/dataverse";
import {
  C, P, SAVE, command, confirmDelete, createContract, deletePromptText, fill, press, save, selectRowWith, setAllocation,
  setStartDay,
} from "../../lib/leaseFlows";
import { pressSignIn } from "../../lib/parity";

/* ─────────────────────────────────────────────────────────── settings ── */

const num = (name: string, fallback: number): number => {
  const v = Number(process.env[name] ?? fallback);
  return Number.isInteger(v) && v >= 0 ? v : fallback;
};
const CARD = num("LANDLEASE_CARD", 0);
const ROW = num("LANDLEASE_ROW", 0);
export const STD_CARD = num("LANDLEASE_STD_CARD", 6);
const EMPTY_CARD_VAR = "LANDLEASE_EMPTY_CARD";
const DEALLOCATE = process.env.LANDLEASE_DEALLOCATE?.trim() || "Test PV Module";
const MENU = "Land Lease";
/** `txt_…_Description_1.MaxLength` (LL:2202): the run tag is typed into the Description. */
const DESCRIPTION_MAX = 55;

/** Canvas control name -> code app test id (the code app uses `lease-*` ids for some, landlease specs' IDS / TOGGLES / DROPDOWNS). */
const TOGGLES = {
  secured: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_Secured", code: "lease-secured" },
  allWtg: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs", code: "lease-all-wtg" },
  oneTimePayment: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment", code: "lease-otp" },
  inflation: { canvas: "tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1", code: "lease-inflation" },
} as const;
const DROPDOWNS = {
  durationYears: { canvas: "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1", code: "lease-years" },
  durationMonths: { canvas: "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1", code: "lease-months" },
  currency: { canvas: "drp_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1", code: "lease-currency" },
  aggregation: { canvas: "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1", code: "lease-aggregation" },
  distributionFrequency: { canvas: "drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1", code: "lease-frequency" },
} as const;
type DropdownKey = keyof typeof DROPDOWNS;
/** The dropdowns whose canvas control sets a literal `AccessibleLabel` (YAML PA:2554, PA:2618, PA:3685): only these are compared (054). */
const LABELLED_DROPDOWNS: readonly DropdownKey[] = ["durationYears", "durationMonths", "distributionFrequency"];
const TEXTS = {
  description: `${C}Description_1`, euroMWh: `${P}EuroMWh_1`, euroMW: `${P}EuroMW_1`, euroWTG: `${P}EuroWTG_1`,
  fixCosts: `${P}FixedCosts_1`, shareOfRevenues: `${P}PercentOfRevenues_1`,
} as const;
const CANCEL = "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Cancel_1";
const ROW_BUTTON = "btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_2";
const PANEL_CLOSE = "ico_LandLease_RightPanel_NewEditPeriod_BodyheaderCancel_1";
const CARD_TITLE = "lbl_LandLease_Content_SubaccountsCardHeader_SubaccountName_2";
const CHEVRON_UP = "ico_LandLease_Content_SubaccountsCardHeader_Up_2";
const CHEVRONS = `[data-control-name='ico_LandLease_Content_SubaccountsCardHeader_Down_2'], [data-control-name='${CHEVRON_UP}']`;
const POPUPS = ["DeleteLandLeaseCost", "DeletePeriod"] as const;

/* ───────────────────────────────────────────────────────────── helpers ── */

type View = Pick<AppHandle, "kind" | "page" | "frame">;
/** Cards this manifest opened on a page (the canvas gallery renders only the cards near the viewport, so a sweep alone can miss one). */
const openedCards = new WeakMap<Page, Set<number>>();
/** Pages a validation baseline typed into: the next group reloads first. */
const typedInto = new WeakSet<Page>();

/** Whether card `index` is unfolded. Canvas: the chevron on its title row is `…_Up_2` (`Visible: =Not(ThisItem.IsFolded)`, LL:1891). */
async function isCardOpen({ kind, frame }: View, index: number): Promise<boolean> {
  if (kind === "code") {
    const header = frame.locator("[data-testid^='leasecard-']").nth(index);
    await header.waitFor({ state: "visible", timeout: 90_000 });
    return (await header.getAttribute("aria-expanded")) === "true";
  }
  const title = await canvasCardTitle(frame, index); // screen order (`lib/cost.ts`), not page order
  await title.scrollIntoViewIfNeeded({ timeout: 15_000 });
  const t = await title.boundingBox();
  if (!t) throw new Error(`Canvas card ${index}: title not on screen`);
  const chevrons = frame.locator(CHEVRONS);
  for (let k = 0, n = await chevrons.count(); k < n; k++) {
    const c = chevrons.nth(k);
    const b = await c.boundingBox();
    if (!b || !(await c.isVisible())) continue;
    if (Math.abs(b.y + b.height / 2 - (t.y + t.height / 2)) < 24) return (await c.getAttribute("data-control-name")) === CHEVRON_UP;
  }
  throw new Error(`Canvas card ${index}: no visible chevron on its header row`);
}

/** Unfolds card `index` (idempotent; `lib/cost.ts` toggleLeaseCard flips). */
export async function openCard(app: View, index: number): Promise<void> {
  if (!(await isCardOpen(app, index))) await toggleLeaseCard(app.kind, app.page, app.frame, index);
  const set = openedCards.get(app.page) ?? new Set<number>();
  set.add(index);
  openedCards.set(app.page, set);
}

async function foldCard(app: View, index: number): Promise<void> {
  if (await isCardOpen(app, index)) await toggleLeaseCard(app.kind, app.page, app.frame, index);
}

/** A row of the open card is selected: its Edit or Delete command is enabled (`leaseCommands`, LL:329 / LL:349). */
async function hasSelection(kind: Kind, frame: FrameLocator): Promise<boolean> {
  const s = await leaseCommandStates(kind, frame);
  return s.Edit === true || s.Delete === true;
}

/** Clicks the first visible period row (both apps toggle a selected row off, LL:1752). */
async function clickFirstRow(app: View): Promise<void> {
  await selectLeaseRow(app.kind, app.page, app.frame, 0);
}

/** A visible control's own button (the canvas PCF icon buttons render one inside the named control). */
const buttonIn = (app: View, name: string): Locator =>
  control(app.kind, app.frame, name).locator("xpath=descendant-or-self::button").first();

async function closePopUp(app: View): Promise<void> {
  if (app.kind === "code") {
    // Click only a Cancel a user can see, and accept a pop-up that is already closing (the Escape just pressed): a click
    // on a button that was there at the count and gone at the click waited its 10 s and reloaded the screen (run 16).
    const d = app.frame.getByRole("alertdialog");
    const cancel = d.getByRole("button", { name: "Cancel", exact: true }).first();
    if (await cancel.isVisible().catch(() => false)) await cancel.click({ timeout: 10_000 }).catch(() => {});
    if (await d.first().isVisible().catch(() => false)) await d.first().waitFor({ state: "hidden", timeout: 10_000 });
  } else {
    for (const p of POPUPS) {
      const cancel = app.frame.locator(`[data-control-name^='cmp_LandLease_PopUpConfirmation_${p}']`).getByText("Cancel", { exact: true }).first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click({ force: true, timeout: 10_000 });
    }
  }
  await waitForStable(app.page, app.frame, { pollMs: 300, timeoutMs: 10_000 });
}

const panelOpen = (app: View): Promise<boolean> => control(app.kind, app.frame, SAVE).isVisible().catch(() => false);

async function closePanel(app: View): Promise<void> {
  if (!(await panelOpen(app))) return;
  await buttonIn(app, CANCEL).click({ force: app.kind === "canvas", timeout: 10_000 });
  await waitForStable(app.page, app.frame, { pollMs: 300, timeoutMs: 10_000 });
}

/** The open cards a user can see: code app headers with aria-expanded, canvas `…_Up_2` chevrons that are not clipped. */
async function visibleOpenCard(app: View): Promise<Locator | null> {
  if (app.kind === "code") {
    const open = app.frame.locator("[data-testid^='leasecard-'][aria-expanded='true']");
    return (await open.count()) ? open.first() : null;
  }
  const up = app.frame.locator(`[data-control-name='${CHEVRON_UP}']`);
  const [first] = await unclippedIndexesOf(up);
  return first === undefined ? null : up.nth(first);
}

async function foldAll(app: View): Promise<void> {
  for (const i of [...(openedCards.get(app.page) ?? [])].sort((a, b) => b - a)) await foldCard(app, i);
  openedCards.delete(app.page);
  for (let i = 0; i < 12; i++) {
    const open = await visibleOpenCard(app);
    if (!open) return;
    await open.click({ force: app.kind === "canvas", timeout: 10_000 });
    await waitForStable(app.page, app.frame);
  }
  throw new Error("cards still open after 12 folds");
}

/** Every scroll container of the app back to the top, as on a freshly opened screen (positions are part of the visual facts). */
async function scrollTop(app: View): Promise<void> {
  await app.frame.locator("body").evaluate(() => {
    window.scrollTo(0, 0);
    for (const e of Array.from(document.querySelectorAll<HTMLElement>("*"))) if (e.scrollTop > 0) e.scrollTop = 0;
  }).catch(() => {});
  await waitForStable(app.page, app.frame, { pollMs: 300, timeoutMs: 10_000 });
}

async function tidy(app: View): Promise<void> {
  // Idle first: after a save the code app's write status is a modal overlay for a while, and a card header clicked under
  // it waited its 10 s and the reset reloaded the screen, four times in the write lanes of run 16 (4 Nov 2026). Still
  // busy after a minute: go on, and the clicks below decide (their failure still ends in `reopenInPlace`).
  await settle(app, { timeoutMs: 60_000 }).catch(() => {});
  await app.page.keyboard.press("Escape").catch(() => {});
  await closePopUp(app);
  await closePanel(app);
  // A selection survives Cancel and a fold (LL:1752 only toggles on a row click). Clicking a row either deselects it
  // (it was the selected one) or moves the selection to it, so at most two clicks clear it.
  for (let i = 0; i < 2 && (await visibleOpenCard(app)) && (await hasSelection(app.kind, app.frame)); i++) await clickFirstRow(app);
  if ((await visibleOpenCard(app)) && (await hasSelection(app.kind, app.frame))) throw new Error("a period row is still selected");
  await foldAll(app);
  await scrollTop(app);
  if (await panelOpen(app)) throw new Error("the panel is still open");
}

/** The screen opened again in the same page (a fallback when tidying failed); `app.frame` stays valid (same frame selector). */
async function reopenInPlace(app: View): Promise<void> {
  await app.page.reload();
  if (app.kind === "canvas") {
    for (let i = 0; i < 45 && (await app.frame.locator("[data-control-name]").count().catch(() => 0)) <= 20; i++) {
      await pressSignIn(app.page);
      await app.page.waitForTimeout(4000);
    }
    await app.frame.getByText(MENU, { exact: true }).first().click({ force: true, timeout: 60_000 });
  } else {
    for (let i = 0; i < 15 && !(await app.frame.getByTestId("header-user").isVisible().catch(() => false)); i++) {
      await pressSignIn(app.page);
      await app.page.waitForTimeout(3000);
    }
    await app.frame.getByTestId("header-user").waitFor({ state: "visible", timeout: 30_000 });
  }
  openedCards.delete(app.page);
  await waitForStable(app.page, app.frame);
}

/** The manifest's `reset`: back to rest without a reload; a reload in place only when that fails. */
export async function resetLease(kind: Kind, page: Page, frame: FrameLocator): Promise<void> {
  const app: View = { kind, page, frame };
  try {
    await tidy(app);
  } catch (e) {
    console.warn(`[land-lease] reset (${kind}): ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}; reopening the screen`);
    await reopenInPlace(app);
  }
}

/** A command of the open card by its verbatim caption (`lib/leaseFlows.ts` command). */
const run = (app: View, caption: string): Promise<void> => command(app.kind, app.page, app.frame, caption);

const toggle = (app: View, id: { canvas: string; code: string }): Promise<void> => press(app.kind, app.page, app.frame, id.canvas, id.code);

/** Save of the open panel enabled (the landlease specs' saveEnabled: the Save control's own button). */
async function saveEnabledNow(app: View): Promise<boolean> {
  return buttonIn(app, SAVE).evaluate((b) => !(b as HTMLButtonElement).disabled && b.getAttribute("aria-disabled") !== "true").catch(() => false);
}

/* ─────────────────────────────────────────────────── the rows, read back ── */

/**
 * The Land Lease tables (one definition, `lib/dataverse.ts`), with the row order of the comparison (`TableSpec.sortKey`, the
 * old `diffLeaseRows` order): headers by Name; periods by Period (the option set), then Name; allocations by the generator's
 * name (the lookup's formatted value, `_vsb_generatorinproject_value@name` once normalised: the GUID itself is masked and
 * differs between two write projects), then Name. Columns from `ProjectDocs/reference/dataverse-attributes.json`.
 */
const SORT_KEYS: Readonly<Record<string, string[]>> = {
  costs: ["vsb_name"],
  periods: ["vsb_period", "vsb_name"],
  allocations: ["_vsb_generatorinproject_value@name", "vsb_name"],
};
const TABLES: TableSpec[] = LAND_LEASE_TABLES.map((t) => ({ ...t, ...(SORT_KEYS[t.name] ? { sortKey: SORT_KEYS[t.name] } : {}) }));

/** Polls `ctx.rows(tag)` (40 reads, 1.5 s apart) until `done` holds; the last read either way. */
async function pollRows(app: View, ctx: FlowContext, tag: string, done: (rows: TableRows) => boolean): Promise<TableRows> {
  let rows: TableRows = {};
  for (let i = 0; i < 40; i++) {
    rows = await ctx.rows(tag);
    if (done(rows)) return rows;
    await app.page.waitForTimeout(1500);
  }
  return rows;
}

/**
 * After a save: waits until the tagged header exists, so the step does not end before its write landed. The Owning Business
 * Unit is NOT checked here on this early read: the flows lane checks every table's SETTLED rows after the step.
 */
async function assertWritten(app: View, tag: string, ctx: FlowContext): Promise<void> {
  const rows = await pollRows(app, ctx, tag, (r) => (r.costs ?? []).length > 0);
  if (!(rows.costs ?? []).length) throw new Error(`${app.kind}: no contract header tagged ${tag} after the save`);
}

/** After the app's own delete (047): nothing tagged may be left, header, periods and allocations. */
async function assertGone(app: View, tag: string, ctx: FlowContext): Promise<void> {
  const left = rowCount(await pollRows(app, ctx, tag, (r) => rowCount(r) === 0));
  if (left !== 0) throw new Error(`${app.kind}: ${left} row(s) tagged ${tag} left after the app's own delete`);
}

/** The run tag is typed into the Description, whose canvas MaxLength is 55. */
function checkTag(tag: string): string {
  if (tag.length > DESCRIPTION_MAX) throw new Error(`run tag ${tag} is longer than the Description allows (${DESCRIPTION_MAX}); use a shorter PARITY_RUN_ID`);
  return tag;
}

/* ───────────────────────────────────────────────────────────── visual ── */

const atCard = (index: number) => async (app: AppHandle) => { await openCard(app, index); };
/**
 * Card CARD open with a row selected. Idempotent: the Canvas keeps a selection when its card folds, and a second click on a
 * selected row deselects it (both apps, LL:1752), so the row is clicked only when nothing is selected (live run 3, 4 Nov
 * 2026: after the UX checks, `card-row-selected` was recorded on the Canvas with no selection). Throws when none results.
 */
const atRow = async (app: AppHandle) => {
  // Fold and open the card again, as a user opening it would: a Canvas row click stores `gal_LandLease_Content_Subaccounts
  // .Selected` as the selected card (LL:1762), and Edit / Delete need it to be the row's own card (LL:347, LL:367). A card
  // left open by an earlier state is not the gallery's Selected item once another card's chevron was clicked, so its row's
  // Edit / Delete stayed disabled, and the next click deselected the row (live runs 6 and 7, 4 Nov 2026).
  // The Canvas command bar follows a selection change a moment later, so each read is a short poll (live run 4: one read
  // right after the click still saw no selection). A second click covers a first one that deselected a stale selection.
  // 10 s after a click: right after a reopen the Canvas bar took longer than 5 s to follow (live run 6, 4 Nov 2026).
  // One reopen of the screen when two clicks still give no selection: in full runs 6-8 (4 Nov 2026) the Canvas sometimes
  // refused a selection after the reset had reopened the screen, which a probe of the same states alone did not reproduce.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      console.warn(`[land-lease] ${app.kind}: no row selected on card ${CARD} after two clicks; reopening the screen once`);
      await reopenInPlace(app);
    }
    await foldCard(app, CARD);
    await openCard(app, CARD);
    for (let click = 0; click < 2; click++) {
      if (await selectionWithin(app, click === 0 ? 1_500 : 10_000)) return;
      await clickFirstRow(app);
    }
    if (await selectionWithin(app, 10_000)) return;
  }
  throw new Error(`${app.kind}: no period row selected on card ${CARD} after two clicks, twice (the screen reopened in between)`);
};

/** Whether a row is selected within `ms` (polled every 250 ms). */
async function selectionWithin(app: View, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    if (await hasSelection(app.kind, app.frame)) return true;
    if (Date.now() >= end) return false;
    await app.page.waitForTimeout(250);
  }
}
const newContract = (then?: { canvas: string; code: string }) => async (app: AppHandle) => {
  await openCard(app, CARD);
  await run(app, "Add Contract Type");
  if (then) await toggle(app, then);
};
const onRow = (caption: string) => async (app: AppHandle) => { await atRow(app); await run(app, caption); };

/** Old `LANDLEASE_EMPTY_CARD` (a card with no costs); the state is skipped without it. */
const emptyCard = (): number => num(EMPTY_CARD_VAR, 0);

/* ─────────────────────────────────────────────────────────── validation ── */

/** The verbatim messages (landlease.validation MSG, rule map 4.1–4.8; LEASE_MSG in `landLeaseRules.ts`). */
const MSG = {
  rateDecimal: "Value must be a numeric with two decimal place.",
  rateRange: "Please select a value between 0 and 100,000,000.0.",
  fixRange: "Value must be between 0 and 1,000,000,000.0.",
  shareDecimal: "Enter a number with no more than two decimal places.",
  shareRange: "Please select a value between 0 and 10,000.0.",
  otpDecimal: "Value must be a number",
  otpRange: "Please select a value between 0 and 1,000,000,000.0.",
  inflOneDecimal: "Value must be a numeric with 1 decimal place",
  inflRange: "Please select a value between 0 and 100.",
  year: "Year value must be in format YYYY.",
  dueDate: "Due Date must be in format MM/YYYY.",
  standard: 'The term "Standard" is applicable only for system-prefilled contracts.',
} as const;
type MsgKey = keyof typeof MSG;
/** LEASE_MSG entries the old spec's MSG did not list (`lbl_…_StartDate_ErrorMessage_1`, the third inflation arm, the hint, the warning). */
const MORE_MESSAGES = [
  "Value cannot be blank",
  "Value must be a number with 1 decimal place",
  "Please fill in at least one commercial figure",
  "Warning: Saving is not possible, because additional periods exist, Please delete them first.",
] as const;

/** One rule-map row: what to type and the Canvas outcome the rule map derived by hand (null = "to confirm"). */
export interface RuleMapRow { input: string; message: MsgKey | "none" | null; save: boolean | null }
const r = (input: string, message: RuleMapRow["message"], save: RuleMapRow["save"]): RuleMapRow => ({ input, message, save });
const rateRows = (decimal: MsgKey, range: MsgKey, max: string): RuleMapRow[] => [
  r("abc", decimal, false), r("-1", range, false), r("0", "none", true), r("1", "none", true), r("1.5", "none", true),
  r("1,5", decimal, false), r("0.555", decimal, false), r("1e3", decimal, false), r(" ", decimal, false), r("", "none", true),
  r(max, "none", true), r(String(BigInt(max) + 1n), range, false), r(`${max}.01`, range, false), r("1.", null, null),
];

type Baseline = "rate" | "otp" | "infl";
interface GroupSpec { key: string; field: string; baseline: Baseline; prefill?: Record<string, string>; rows: RuleMapRow[] }

/** The groups of landlease.validation.parity.spec.ts, unchanged (rule map section 4). */
const GROUPS: readonly GroupSpec[] = [
  { key: "euroMWh", field: `${P}EuroMWh_1`, baseline: "rate", rows: [...rateRows("rateDecimal", "rateRange", "100000000"), r("+1", "none", true)] },
  { key: "euroMW", field: `${P}EuroMW_1`, baseline: "rate", rows: [...rateRows("rateDecimal", "rateRange", "100000000"), r("+1", "none", true)] },
  { key: "euroWTG", field: `${P}EuroWTG_1`, baseline: "rate", prefill: { [`${P}FixedCosts_1`]: "1000" }, rows: [...rateRows("rateDecimal", "rateRange", "100000000"), r("+1", "none", true)] },
  { key: "fixCosts", field: `${P}FixedCosts_1`, baseline: "rate", rows: rateRows("rateDecimal", "fixRange", "1000000000") },
  { key: "shareOfRevenues", field: `${P}PercentOfRevenues_1`, baseline: "rate", rows: rateRows("shareDecimal", "shareRange", "10000") },
  {
    key: "otpAmount1", field: `${C}Amount_1`, baseline: "otp",
    rows: rateRows("otpDecimal", "otpRange", "1000000000").map((x) => (x.input === "" ? r("", "none", false) : x.input === " " ? r(" ", "otpDecimal", false) : x)),
  },
  {
    key: "inflationProfile", field: `${C}InflationProfile_1`, baseline: "infl",
    rows: [
      r("abc", "inflOneDecimal", false), r("-1", "inflOneDecimal", false), r("0", "none", true), r("1", "none", true), r("1.5", "none", true),
      r("1,5", "inflOneDecimal", false), r("0.555", "inflOneDecimal", false), r("1e3", "inflOneDecimal", false), r(" ", "inflOneDecimal", false),
      r("", "none", false), r("100", "none", true), r("100.1", "inflRange", false), r("101", "inflRange", false), r("1.", null, null),
    ],
  },
  {
    key: "inflationStartYear", field: `${C}InflationStartYear_1`, baseline: "infl",
    rows: [
      r("abc", "year", false), r("-1", "year", false), r("0", "year", false), r("1", "year", false), r("2027", "none", true), r("0000", "none", true),
      r("99999", "year", false), r("2027.5", "year", false), r(" 2027", "year", false), r(" ", "year", false), r("", "none", false),
    ],
  },
  {
    key: "otpDueDate1", field: `${C}DueDate_1`, baseline: "otp",
    rows: [
      r("01/2027", "none", true), r("12/2027", "none", true), r("1/2027", "dueDate", false), r("13/2027", "dueDate", false), r("00/2027", "dueDate", false),
      r("01-2027", "dueDate", false), r("abc", "dueDate", false), r("29/02/2028", "dueDate", false), r("02/0000", "none", true),
      r(" 01/2027", "dueDate", false), r("", "none", false),
    ],
  },
  {
    key: "description", field: `${C}Description_1`, baseline: "rate",
    rows: [
      r("Lease A", "none", true), r("standard", "standard", false), r("Non-standard lease", "standard", false), r("STANDARD", "standard", false),
      r(" ", "none", true), r("", "none", false), r("x".repeat(56), "none", true),
    ],
  },
];

/**
 * The rule map's hand-derived Canvas outcome per group and input (the old Canvas test listed where the Canvas disagreed
 * with it in `landlease.validation.rulemap-corrections.txt`). Kept as data: `ruleMapCorrections` gives the same list from
 * a run's recorded Canvas facts.
 */
export const RULE_MAP: Readonly<Record<string, readonly RuleMapRow[]>> = Object.fromEntries(GROUPS.map((g) => [g.key, g.rows]));

/** The old Canvas test's rule-map check, as a pure function over the recorded Canvas outcomes (`validation/<group>` facts). */
export function ruleMapCorrections(canvas: Readonly<Record<string, Readonly<Record<string, { messages: string[]; save: boolean }>>>>): string[] {
  const out: string[] = [];
  for (const g of GROUPS) {
    for (const row of g.rows) {
      const got = canvas[g.key]?.[row.input];
      if (!got) continue;
      const want = row.message === null ? null : row.message === "none" ? [] : [MSG[row.message]];
      if (want !== null && JSON.stringify(got.messages) !== JSON.stringify(want)) out.push(`${g.key} ${JSON.stringify(row.input)}: messages ${JSON.stringify(got.messages)} (rule map ${JSON.stringify(want)})`);
      if (row.save !== null && got.save !== row.save) out.push(`${g.key} ${JSON.stringify(row.input)}: save ${got.save} (rule map ${row.save})`);
    }
  }
  return out;
}

const typeInto = (app: View, field: string, value: string): Promise<void> => fill(app.kind, app.page, app.frame, field, value);

/** The old `openBaseline`: a fresh screen per group -> card -> row -> Edit -> the group's toggles and prefill. */
const baselineOf = (g: GroupSpec) => async (app: AppHandle): Promise<void> => {
  if (typedInto.has(app.page)) await app.reload();
  typedInto.add(app.page);
  await openCard(app, CARD);
  await selectLeaseRow(app.kind, app.page, app.frame, ROW);
  await run(app, "Edit");
  if (g.baseline === "otp") {
    await toggle(app, TOGGLES.oneTimePayment);
    await typeInto(app, `${C}DueDate_1`, "12/2027");
    await typeInto(app, `${C}Amount_1`, "1000");
  }
  if (g.baseline === "infl") {
    await toggle(app, TOGGLES.inflation);
    await typeInto(app, `${C}InflationStartYear_1`, "2027");
    await typeInto(app, `${C}InflationProfile_1`, "2.0");
  }
  if (g.baseline === "rate" && g.key !== "euroWTG") await typeInto(app, `${P}EuroWTG_1`, "1000");
  for (const [field, value] of Object.entries(g.prefill ?? {})) await typeInto(app, field, value);
};

const validation: ValidationGroup[] = GROUPS.map((g) => ({ key: g.key, field: g.field, baseline: baselineOf(g), inputs: g.rows.map((x) => x.input) }));

/* ─────────────────────────────────────────────────────────────── gates ── */

/** 050: every card opened on its own (opened, read, folded again); one `gates/card-<i>-open` fact per card. */
async function eachCardInTurn(app: AppHandle): Promise<void> {
  const env = runEnv();
  const titles = await leaseCardTitles(app.kind, app.frame);
  for (let i = 0; i < titles.length; i++) {
    await openCard(app, i);
    writeFact(env, app.kind, "gates", `card-${i}-open`, await leaseCommandStates(app.kind, app.frame));
    await foldCard(app, i);
  }
}

/* ────────────────────────────────────────────────────────────────── ux ── */

/** 050 card titles in screen order with their row counts (the old `cards` diff and the EXPLORE listing). */
async function cards(app: AppHandle): Promise<{ title: string; rows: number }[]> {
  const titles = await leaseCardTitles(app.kind, app.frame);
  const out: { title: string; rows: number }[] = [];
  for (let i = 0; i < titles.length; i++) {
    // A card that is already open would count 0 (its rows are in `before` too): fold it first (live run 2, 3 Nov 2026).
    await foldCard(app, i);
    const before = await leaseRowCount(app.kind, app.frame);
    await openCard(app, i);
    const after = await leaseRowCount(app.kind, app.frame);
    out.push({ title: titles[i]!, rows: Math.abs(after - before) });
    await foldCard(app, i);
  }
  return out;
}

/** 051: the Save gate of a fresh "Add Contract Type" panel, empty, then after a Description only. */
async function saveGateNewContract(app: AppHandle): Promise<{ empty: boolean; descriptionOnly: boolean }> {
  await openCard(app, CARD);
  await run(app, "Add Contract Type");
  const empty = await saveEnabledNow(app);
  await typeInto(app, TEXTS.description, "Parity description only");
  return { empty, descriptionOnly: await saveEnabledNow(app) };
}

interface DropdownRead { value: string; enabled: boolean; options: string[]; label: string | null }
interface EditSnapshot {
  texts: Record<string, string>;
  dropdowns: Record<string, DropdownRead>;
  toggles: Record<string, boolean | null>;
  rowTitle: string | null;
  panelClose: string | null;
}

/** The hover text of a canvas control: the `title` sits on an element INSIDE the named control, not on its outer div. */
const titleIn = (host: Locator): Promise<string | null> =>
  host.evaluate((e) => (e.closest("[title]") ?? e.querySelector("[title]"))?.getAttribute("title") ?? null).catch(() => null);

/**
 * A dropdown's value, enabled state, accessible name and options. A DISABLED code-app dropdown cannot be opened (a click
 * waits for ever), so its options are not read. Canvas: the modern Dropdown is a native `<select>`.
 */
async function readDropdown(app: View, id: { canvas: string; code: string }): Promise<DropdownRead> {
  if (app.kind === "canvas") {
    return control("canvas", app.frame, id.canvas).locator("select").first().evaluate((s) => {
      const sel = s as HTMLSelectElement;
      return {
        value: sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex]?.textContent ?? "").trim() : "",
        enabled: !sel.disabled && sel.getAttribute("aria-disabled") !== "true",
        options: [...sel.options].map((o) => (o.textContent ?? "").trim()).filter(Boolean),
        label: sel.getAttribute("aria-label") || null,
      };
    });
  }
  const box = app.frame.getByTestId(id.code).first();
  const value = ((await box.textContent()) ?? "").trim();
  const label = await box.getAttribute("aria-label");
  const enabled = await box.isEnabled().catch(() => false);
  if (!enabled) return { value, enabled, options: [], label };
  await box.click({ timeout: 15_000 });
  const list = app.frame.getByRole("option").filter({ visible: true });
  await list.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  const options = (await list.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await box.click({ timeout: 15_000 }); // the trigger closes the list (Escape would also close the panel)
  await waitForStable(app.page, app.frame, { pollMs: 300, timeoutMs: 5000 });
  return { value, enabled, options, label };
}

async function readToggle(app: View, id: { canvas: string; code: string }): Promise<boolean | null> {
  return control(app.kind, app.frame, id.canvas, id.code).evaluate((e) => {
    const el = (e.matches("input") ? e : e.querySelector("input, [role='switch'], [aria-checked]")) as HTMLInputElement | null;
    if (!el) return null;
    const aria = el.getAttribute("aria-checked");
    return aria === null ? Boolean(el.checked) : aria === "true";
  }).catch(() => null);
}

/** The row's hover text, on the first row a user can see (canvas: inside the transparent button; code app: the row's `title`). */
async function rowTitle(app: View): Promise<string | null> {
  const rows = app.kind === "canvas"
    ? app.frame.locator(`[data-control-name='${ROW_BUTTON}']`)
    : app.frame.locator(`[data-testid^='${ROW_BUTTON}-']`);
  const [first] = await unclippedIndexesOf(rows);
  if (first === undefined) return null;
  return app.kind === "canvas" ? titleIn(rows.nth(first)) : rows.nth(first).getAttribute("title");
}

/** 052–054 in one pass, once per page (read-only): the row's hover text, then the Edit panel of card CARD's first period. */
const snapshots = new WeakMap<Page, Promise<EditSnapshot>>();
function editSnapshot(app: AppHandle): Promise<EditSnapshot> {
  let p = snapshots.get(app.page);
  if (!p) {
    p = (async () => {
      await atRow(app);
      const hover = await rowTitle(app);
      await run(app, "Edit");
      const texts: Record<string, string> = {};
      for (const [key, name] of Object.entries(TEXTS)) {
        texts[key] = await control(app.kind, app.frame, name).locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first()
          .inputValue().catch(() => "<not found>");
      }
      const dropdowns: Record<string, DropdownRead> = {};
      for (const [key, id] of Object.entries(DROPDOWNS)) dropdowns[key] = await readDropdown(app, id);
      const toggles: Record<string, boolean | null> = {};
      for (const [key, id] of Object.entries(TOGGLES)) toggles[key] = await readToggle(app, id);
      const panelClose = app.kind === "canvas"
        ? await titleIn(app.frame.locator(`[data-control-name='${PANEL_CLOSE}']`).first())
        : await app.frame.getByTestId("panel-close").first().getAttribute("title");
      return { texts, dropdowns, toggles, rowTitle: hover, panelClose };
    })();
    p.catch(() => snapshots.delete(app.page));
    snapshots.set(app.page, p);
  }
  return p;
}

const pick = <T>(f: (d: DropdownRead) => T) => async (app: AppHandle): Promise<Record<string, T>> => {
  const s = await editSnapshot(app);
  return Object.fromEntries(Object.entries(s.dropdowns).map(([k, d]) => [k, f(d)]));
};

/* ─────────────────────────────────────────────────────────────── flows ── */

/** Fresh state, the card, then the `n`th period row of this flow's contract; one reload and retry when the row does not show. */
async function atTaggedRow(app: AppHandle, tag: string, n: number): Promise<void> {
  const select = async () => {
    await app.reset();
    await openCard(app, CARD);
    await selectRowWith(app.kind, app.page, app.frame, tag, n);
  };
  try {
    await select();
  } catch {
    await app.reload();
    await select();
  }
}

/** The fields an added period needs before Save is enabled (the canvas does not carry the Distribution Frequency over, X6). */
async function fillPeriod(app: View, euroWtg: string): Promise<void> {
  await typeInto(app, `${P}EuroWTG_1`, euroWtg);
  await pickOption(app.kind, app.page, app.frame, DROPDOWNS.durationYears.canvas, DROPDOWNS.durationYears.code, "1 year");
  await pickOption(app.kind, app.page, app.frame, DROPDOWNS.durationMonths.canvas, DROPDOWNS.durationMonths.code, "0 months");
  await pickOption(app.kind, app.page, app.frame, DROPDOWNS.distributionFrequency.canvas, DROPDOWNS.distributionFrequency.code, 0);
}

const createStep = (name: string): FlowStep => ({
  name,
  run: async (app, tag, ctx) => {
    await createContract(app.kind, app.page, app.frame, CARD, checkTag(tag));
    openedCards.set(app.page, new Set([...(openedCards.get(app.page) ?? []), CARD]));
    await assertWritten(app, tag, ctx);
  },
});

/** 046 / 047: one new contract created through the app's own panel, then deleted through its own pop-up. */
const contractFlow: Flow = {
  name: "contract",
  // The old write spec had 20 min for both apps in one test; this flow is one app.
  timeoutMin: 15,
  steps: [
    createStep("create"),
    {
      name: "delete",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 0);
        await run(app, "Delete");
        await confirmDelete(app.kind, app.page, app.frame);
        await assertGone(app, tag, ctx);
      },
    },
  ],
  cleanup: async () => {},
};

const S4_PERIODS = [0, 1, 2] as const;

/** 060: S1–S9 on one tagged contract (landlease.flows.parity.spec.ts). */
const periodsFlow: Flow = {
  name: "periods",
  // The old flows spec had 60 min for both apps in one test; nine steps in one app.
  timeoutMin: 45,
  steps: [
    createStep("S1-create"),
    {
      name: "S2-add-period-2",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 0);
        await run(app, "Add Period");
        await fillPeriod(app, "1100");
        await save(app.kind, app.page, app.frame, "Period 2");
        await assertWritten(app, tag, ctx);
      },
    },
    {
      name: "S3-add-period-3",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 1);
        await run(app, "Add Period");
        await fillPeriod(app, "1200");
        await save(app.kind, app.page, app.frame, "Period 3");
        await assertWritten(app, tag, ctx);
      },
    },
    {
      // Read-only: the gates per period, and the delete prompt of Period 1 (contract) and Period 3 (period), opened, never confirmed.
      name: "S4-gates",
      run: async (app, tag, ctx) => {
        const gates: Record<string, unknown>[] = [];
        const prompts: Record<string, unknown>[] = [];
        for (const n of S4_PERIODS) {
          await atTaggedRow(app, tag, n);
          gates.push({ period: `period ${n + 1}`, ...(await leaseCommandStates(app.kind, app.frame)) });
          if (n !== 1) {
            await run(app, "Delete");
            prompts.push({ period: `period ${n + 1}`, text: (await deletePromptText(app.kind, app.frame)).split(tag).join("<tag>") });
          }
        }
        ctx.record("flows", "periods.S4-gates.ui", { gates, prompts });
        await app.reset();
      },
    },
    {
      name: "S5-edit-period-2",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 1);
        await run(app, "Edit");
        await typeInto(app, `${P}EuroWTG_1`, "2000");
        await typeInto(app, `${P}FixedCosts_1`, "500");
        await save(app.kind, app.page, app.frame, "the Period 2 edit");
        await assertWritten(app, tag, ctx);
      },
    },
    {
      name: "S6-delete-period-3",
      run: async (app, tag) => {
        await atTaggedRow(app, tag, 2);
        await run(app, "Delete");
        await confirmDelete(app.kind, app.page, app.frame);
      },
    },
    {
      name: "S7-edit-period-1-payments-inflation",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 0);
        await run(app, "Edit");
        await toggle(app, TOGGLES.oneTimePayment);
        await typeInto(app, `${C}DueDate_1`, "12/2027");
        await typeInto(app, `${C}Amount_1`, "500");
        await run(app, "Add One-Time payment");
        await typeInto(app, `${C}DueDate2_1`, "06/2028");
        await typeInto(app, `${C}Amount2_1`, "250");
        await toggle(app, TOGGLES.inflation);
        await typeInto(app, `${C}InflationStartYear_1`, "2027");
        await typeInto(app, `${C}InflationProfile_1`, "2.0");
        await save(app.kind, app.page, app.frame, "Period 1 with payments and inflation");
        await assertWritten(app, tag, ctx);
      },
    },
    {
      // F4, D5: "Allocate to all WTGs" off, one generator unticked.
      name: "S8-deallocate-one-generator",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 0);
        await run(app, "Edit");
        await toggle(app, TOGGLES.allWtg);
        await setAllocation(app.kind, app.page, app.frame, DEALLOCATE, false);
        await save(app.kind, app.page, app.frame, "Period 1 with one generator less");
        await assertWritten(app, tag, ctx);
      },
    },
    {
      // C4: Period 1's Start Date moved to the 20th of its month; what the field shows is recorded too.
      name: "S9-change-start-date",
      run: async (app, tag, ctx) => {
        await atTaggedRow(app, tag, 0);
        await run(app, "Edit");
        const shownDate = await setStartDay(app.kind, app.page, app.frame, 20);
        ctx.record("flows", "periods.S9-change-start-date.ui", { shown: [{ startDate: shownDate }] });
        await save(app.kind, app.page, app.frame, "Period 1 with a new start date");
        await assertWritten(app, tag, ctx);
      },
    },
  ],
  cleanup: async () => {},
};

/* ─────────────────────────────────────────── the standard import (070) ── */

/** Rows the server stamps a little behind this machine's clock: the standard import is found from `since` less this margin. */
export const STANDARD_MARGIN_MS = 120_000;

/** Only the standard contracts (and their children) of one project created since `since` (the old `importedSince`). */
export async function importedSince(reader: Page, projectId: string, since: string): Promise<TableRows> {
  const all = await readCreatedSince(reader, TABLES, projectId, since);
  const costs = (all.costs ?? []).filter((c) => c.vsb_isstandardcontract === true);
  const ids = new Set(costs.map((c) => String(c.vsb_landleaseprojectcostid)));
  const child = (rows: Record<string, unknown>[] | undefined) => (rows ?? []).filter((x) => ids.has(String(x._vsb_projectcost_value)));
  return { costs, periods: child(all.periods), allocations: child(all.allocations) };
}

/** `importedSince` until it holds a header and stops changing (40 reads, 2 s apart). */
export async function settledImport(reader: Page, projectId: string, since: string): Promise<TableRows> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const rows = await importedSince(reader, projectId, since);
    const key = JSON.stringify([rows.costs?.length, rows.periods?.length, rows.allocations?.length]);
    if ((rows.costs ?? []).length > 0 && key === last) return rows;
    last = key;
    await reader.waitForTimeout(2000);
  }
  return importedSince(reader, projectId, since);
}

/** "Add Standard Contract" on STD_CARD's own bar in one app; checks the command is enabled first (B4). */
export async function importStandard(app: View): Promise<void> {
  await openCard(app, STD_CARD);
  if (!(await cardCommandEnabled(app.kind, app.frame, STD_CARD, "Add Standard Contract"))) {
    throw new Error(`${app.kind}: "Add Standard Contract" is not enabled on card ${STD_CARD}`);
  }
  await (await cardCommand(app.kind, app.frame, STD_CARD, "Add Standard Contract")).click({ force: app.kind === "canvas", timeout: 30_000 });
  await waitForNotBusy(app.frame);
  await waitForStable(app.page, app.frame, { timeoutMs: 120_000 });
}

/** The imported rows as two apps must write them (no run tag: the names come from the standard assumptions). */
export const normaliseImport = (rows: TableRows): TableRows => normaliseTables(rows, TABLES, "");

/** Deletes imported rows through the app's `deleteRecord`; what could NOT be deleted. */
export const deleteImport = (reader: Page, rows: TableRows): Promise<string[]> => deleteRows(reader, TABLES, rows);

/* ─────────────────────────────────────────────────────────── artefacts ── */

/**
 * The header "Share of Revenues [%]" is right-aligned and comes out about 7 px narrower in Segoe UI (code app) than in the
 * canvas's Open Sans, so its x differs by just over the 6 px tolerance (E2E-PARITY-REPORT-LANDLEASE-2026-11-03.md section 7).
 */
const ARTEFACTS: ArtefactRule[] = [
  {
    id: "ll-share-of-revenues-x",
    layer: "visual",
    test: (d) => {
      const p = visualKeyParts(d.key);
      return p !== null && p.text === "Share of Revenues [%]" && p.property === "x"
        && typeof d.canvas === "number" && typeof d.code === "number" && Math.abs(d.canvas - d.code) <= 8;
    },
    reason: "a font artefact: the right-aligned header is narrower in Segoe UI (code app) than in Open Sans (canvas), by 7 px",
  },
];

/* ───────────────────────────────────────────────────────────── mutations ── */

/** The mutation proof's source edits (`scripts/parity-mutate.mjs`), kept in `mutations.json` beside this file. */
const MUTATIONS_FILE = fileURLToPath(new URL("./mutations.json", import.meta.url));
const mutations: ScreenManifest["mutations"] = existsSync(MUTATIONS_FILE) ? JSON.parse(readFileSync(MUTATIONS_FILE, "utf8")) : [];

/* ──────────────────────────────────────────────────────────── manifest ── */

/** The open panel's Save, the same control in both apps (`controls.save`). */
const PANEL_SAVE = { canvas: SAVE, code: SAVE } as const;

/**
 * The text window (frame pixels): right of the left menu, below the header. The shell default (`lib/texts.ts`, minY 128)
 * cut through the card list: the first card title ("Locations", y about 86) was left out in both apps, and the second
 * (y 127 in the code app, 128 on the Canvas) in one app only (live run 2, 3 Nov 2026). The header ends at about y 72, its
 * texts (project name, Help, the signed-in user) sit at about y 24-40. minY 80 still cut the open panel's top fields, which
 * start above the header line (the mutation proof of 4 Nov 2026 missed a misspelt panel "Description" caption): minY 50.
 */
const TEXT_WINDOW = { minX: 210, minY: 50 } as const;

const DIVERGENCE_ADD_PERIOD = "DIVERGENCE (product owner, 27 Oct 2026, leaseCommands): Add Period on any period; the canvas only on the last by Period";

export const manifest: ScreenManifest = {
  slug: "land-lease",
  title: "Land Lease",
  canvasSource: { app: "projectcosts", yaml: "Land Lease Costs Screen.pa.yaml" },
  canvasVersion: "1.21.709",
  open: { app: "cost", canvasMenu: MENU, codeRoute: "/costs/land-lease" },
  tables: TABLES,
  reset: resetLease,

  controls: {
    save: { canvas: SAVE, code: SAVE },
    cancel: { canvas: CANCEL, code: CANCEL },
    // The screen has no control that shows only at rest; a card's title shows whenever the screen does (the platform
    // lane's zoom check, as E2E-LANDLEASE-006 checked the first card). `resetLease` does not rely on it. The code app's
    // card header is `leasecard-<card>`: matched by prefix, so no sub-account name (master data) is written here.
    restMarker: { canvas: CARD_TITLE, code: "leasecard-", codeMatch: "prefix" },
    // pcf_con_LandLease_Content_Subaccounts_CardBody_SubaccountsCommandBar_1 items (PA:221); code app `lease-<key>` (LandLeaseScreen.tsx).
    commands: {
      "Add Contract Type": { canvas: "Add Contract Type", code: "lease-newLandLeaseContractKey", by: "caption" },
      "Add Period": { canvas: "Add Period", code: "lease-newLandLeasePeriodKey", by: "caption" },
      "Add Standard Contract": { canvas: "Add Standard Contract", code: "lease-AddLandLeaseStandardContractKey", by: "caption" },
      "Edit": { canvas: "Edit", code: "lease-EditLandLeasePeriodKey", by: "caption" },
      "Delete": { canvas: "Delete", code: "lease-deleteLandLeasePeriodKey", by: "caption" },
    },
  },

  messages: [...new Set<string>([...Object.values(MSG), ...MORE_MESSAGES])],

  visual: [
    { name: "default", steps: async () => {} },
    { name: "card-open", steps: atCard(CARD) },
    { name: "row-selected", steps: atRow },
    { name: "empty-card-open", needsEnv: EMPTY_CARD_VAR, steps: async (app) => { await openCard(app, emptyCard()); } },
    // A panel state is read once the panel's Save shows (`VisualState.until`): the Canvas Edit / Add Period OnSelect loads the
    // period before the panel opens, with no busy sign (live run 2, 3 Nov 2026, recorded the grid instead of the panel).
    { name: "new-contract-panel", until: PANEL_SAVE, steps: newContract() },
    { name: "new-contract-otp-on", until: PANEL_SAVE, steps: newContract(TOGGLES.oneTimePayment) },
    { name: "new-contract-inflation-on", until: PANEL_SAVE, steps: newContract(TOGGLES.inflation) },
    { name: "new-contract-allwtg-toggled", until: PANEL_SAVE, steps: newContract(TOGGLES.allWtg) },
    { name: "new-period-panel", until: PANEL_SAVE, steps: onRow("Add Period") },
    { name: "edit-panel", until: PANEL_SAVE, steps: onRow("Edit") },
    { name: "delete-confirmation", steps: onRow("Delete") },
  ],
  // E2E-LANDLEASE-003 checked the labels at rest and with one card open: the smoke tier opens `card-open` for the second.
  smokeState: "card-open",
  textWindow: TEXT_WINDOW,

  validation,

  gates: [
    // Records `card-<i>-open` per card itself; its own fact is the state after folding every card back (no command shows).
    { name: "each-card-in-turn", steps: eachCardInTurn },
    { name: "card-row-selected", steps: atRow },
  ],
  readGates: (app) => leaseCommandStates(app.kind, app.frame),

  ux: [
    { name: "cards", run: cards },
    { name: "save-gate-new-contract", run: saveGateNewContract },
    { name: "edit-panel-texts", run: async (app) => (await editSnapshot(app)).texts },
    { name: "edit-panel-dropdown-values", run: pick((d) => d.value) },
    { name: "edit-panel-dropdown-enabled", run: pick((d) => d.enabled) },
    // Options only where the dropdown is enabled (a disabled code-app dropdown cannot be opened): null otherwise.
    { name: "edit-panel-dropdown-options", run: pick((d) => (d.enabled ? d.options : null)) },
    { name: "edit-panel-toggles", run: async (app) => (await editSnapshot(app)).toggles },
    {
      name: "edit-panel-accessible-names",
      run: async (app) => {
        const s = await editSnapshot(app);
        return Object.fromEntries(LABELLED_DROPDOWNS.map((k) => [k, s.dropdowns[k]?.label ?? null]));
      },
    },
    { name: "row-hover-text", run: async (app) => (await editSnapshot(app)).rowTitle },
    { name: "panel-close-hover-text", run: async (app) => (await editSnapshot(app)).panelClose },
  ],

  flows: [contractFlow, periodsFlow],

  known: {
    'flows.periods.S4-gates.ui["gates"][0].Add Period': DIVERGENCE_ADD_PERIOD,
    'flows.periods.S4-gates.ui["gates"][1].Add Period': DIVERGENCE_ADD_PERIOD,
  },
  artefacts: ARTEFACTS,
  // Lane balance from live run 2 (3 Nov 2026): the 10 Canvas validation groups (130 inputs) fill canvas-B on their own, so
  // the Canvas gates (about 7 min) run on canvas-C after the UX checks (about 10 min).
  lanes: { gates: { canvas: "canvas-C", code: "code-B" } },
  budgets: { "canvas-B": 20, "canvas-C": 18 },
  mutations,
};
