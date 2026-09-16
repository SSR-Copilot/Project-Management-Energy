/**
 * DEVEX/CAPEX — the screen's rules.
 *
 * Stage 2.0 of `docs/06-DEMO-COMPLETION-PLAN.md`. All of this was inline in `Screen.tsx`, which
 * is where three shipped defects came from: logic in a component cannot be tested, so nothing
 * caught them. The convention here is the one both references use and the one that worked for
 * Contracts — `rules.ts` pure, `Screen.tsx` composition only.
 *
 * Names follow the skeleton's (`VSBCloud-Code-App-Skeleton/vsbcode/src/features/cost/capex-costs/
 * rules.ts`) wherever an equivalent exists, so the two can be diffed.
 */
import { inRange, isInteger, parseNumber, round } from "@/domain/numeric";
import {
  CATEGORIES, total, type CostAccount, type CostLine, type Payment,
} from "../costing/model";
import { distributionSchedule, equalDistributionAmounts } from "./distribution";

/* ═══════════════════════════════════════════════════════════════ constants ══ */

/**
 * Field limit, transcribed — not chosen.
 *
 * `docs/VSBCloud-Harness-Plan.md` §19: "the 512-character description". The comment counter
 * moved to `./comments.ts` (`COMMENT_MAX_LENGTH = 250`) with the rest of the threaded-comment
 * model in stage 2.4 — kept separate from the CONTRACTS panel's own 255-character limit.
 */
export const DESCRIPTION_MAX_LENGTH = 512;

/** `SUMMARY_TAB_NAME` in the skeleton. The tab strip is this plus the five categories. */
export const SUMMARY_TAB_NAME = "DEVEX/CAPEX Summary";

/**
 * The five category labels, re-exported so the screen has one import for its vocabulary.
 *
 * They are also the names the level-1 accounts carry in Dataverse — `loadCostAccounts` matches
 * on them to decide a category — so this list and the chart of accounts have to agree.
 */
export const CATEGORY_LABELS = CATEGORIES;

/** The Summary tab is category `-1`; a real category is an index into `CATEGORIES`. */
export const SUMMARY_CATEGORY = -1;

/** `colDistributionFrequency` — the canvas offers these four on this panel. */
export const FREQUENCY_OPTIONS = [1, 3, 6, 12] as const;

export const PAYER_FILTERS = ["Show All Cost", "DevCo", "SPV"] as const;

/* ══════════════════════════════════════════════════════════════════ tabs ══ */

export const isSummaryTab = (category: number): boolean => category < 0;

/**
 * The tab strip, Summary first.
 *
 * `categories` defaults to the hard-coded `CATEGORIES` and should be passed
 * `loadCapexCategories()` (`data/costBook.ts`) once the screen has it — the canvas builds this
 * strip from `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")),
 * "vsb_order")`, i.e. from Dataverse, not from a literal. The two agree on VSBCloud_Dev today;
 * the argument exists so a category added by an admin gets a tab instead of vanishing.
 *
 * An EMPTY list falls back to `CATEGORIES` rather than rendering a strip with only Summary on
 * it: `loadCapexCategories` returns `[]` when the account tree has no "00001" root, and a
 * transient query failure must not blank the navigation.
 */
export const categoryTabs = (
  categories: readonly string[] = CATEGORY_LABELS,
): string[] => [SUMMARY_TAB_NAME, ...(categories.length > 0 ? categories : CATEGORY_LABELS)];

/**
 * The category a URL asks for.
 *
 * Anything absent, non-integer or out of range is the Summary tab rather than an error — a
 * hand-edited or stale deep link must not break the screen. `categoryCount` is how many tabs
 * there actually are; see `categoryTabs` for why it is an argument.
 */
export function resolveCategory(
  raw: string | null,
  categoryCount: number = CATEGORY_LABELS.length,
): number {
  if (raw === null || raw.trim() === "") return SUMMARY_CATEGORY;
  const count = categoryCount > 0 ? categoryCount : CATEGORY_LABELS.length;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < count ? n : SUMMARY_CATEGORY;
}

/** Blank until the query lands, rather than flashing a `0` that is not a real figure. */
export const formatSummaryAmount = (value: number | undefined): string =>
  value === undefined
    ? ""
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);

/* ══════════════════════════════════════════════════════════════ the panel ══ */

/** A brand-new cost line, with the canvas' defaults. */
export function newCostLine(accountId: string, id: string): CostLine {
  return {
    id, accountId, description: "", payer: "SPV",
    depreciation: true, vat: true, standard: false,
    distribution: "equal", equalMode: "cluster", distributionScheme: "absolute",
    startDate: "2025-04-01", endDate: "2027-07-31",
    frequency: 1, clusters: [], payments: [], comments: [],
  };
}

/**
 * What the Total Costs box opens with — `Coalesce('Total Cost', Sum(existing costs), typed)`.
 *
 * The canvas binds the box to `locAllYearsCost = contract.'Total Cost'`
 * (`CapexScreenCode.txt:7212`, control value `:10841`), NOT to the sum of the monthly rows. The
 * two differ whenever the stored total was set independently, and reading the sum alone showed
 * the wrong figure on every edit.
 */
export function totalCostForPercent(
  contractTotal: number | undefined,
  existingSum: number,
  typed: string,
  locale?: string,
): number | undefined {
  if (contractTotal !== undefined && contractTotal !== null) return contractTotal;
  if (existingSum) return existingSum;
  const parsed = parseNumber(typed, locale);
  return parsed === undefined || Number.isNaN(parsed) ? undefined : parsed;
}

/** The string the panel puts in the box — `""` rather than `"undefined"` when there is nothing. */
export const initialCostValue = (line: CostLine | undefined): string => {
  if (!line) return "";
  const value = totalCostForPercent(line.totalCost, total(line.payments), "");
  return value === undefined ? "" : String(value);
};

/* ═══════════════════════════════════════════════════════ proposed payments ══ */

/** `YYYY-MM-DD` → the schedule's year/month pair, or `undefined` for an unusable date. */
function monthOf(iso: string): { year: number; month: number } | undefined {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? undefined
    : { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * An equal distribution over a date range, in the canvas' arithmetic.
 *
 * `distributionSchedule` + `equalDistributionAmounts` — rounds DOWN to whole currency units with
 * the whole remainder on the final payment. See `distribution.ts`.
 */
export function equalPayments(
  amount: number,
  from: string,
  to: string,
  frequency: number,
): Payment[] {
  const start = monthOf(from);
  const end = monthOf(to);
  if (!start || !end || !Number.isFinite(amount)) return [];
  const schedule = distributionSchedule({
    startYear: start.year, startMonth: start.month,
    endYear: end.year, endMonth: end.month,
    frequency,
  });
  const { amounts } = equalDistributionAmounts(amount, schedule.length);
  return schedule.map((point, i) => ({
    year: point.year, month: point.month, amount: amounts[i] ?? 0, paid: false,
  }));
}

/**
 * An equal distribution across the ticked clusters.
 *
 * The months come from each cluster's window; the money is then split across ALL of them at
 * once, so the remainder lands on the last month overall rather than once per cluster.
 *
 * DUPLICATE MONTHS ARE COLLAPSED FIRST. The canvas builds the same per-cluster slots and then
 * runs them through `Distinct(colCapexCostDataToPatch, ThisRecord)` BEFORE counting them
 * (`CapexScreenCode.txt:1756-1775`) — `locNumPayments` is the DEDUPED count, and it is what
 * both the amounts and the stored Average Payment divide by. This is not merely defensive: a
 * project whose milestone chain repeats a date (two adjacent milestones on the same day) gives
 * two clusters that both schedule the same month, and without the dedupe the money is split one
 * way too many and two rows are written for one month.
 */
export function clusterPayments(
  amount: number,
  clusters: readonly number[],
  frequency: number,
  clusterDates: readonly (string | undefined)[],
): Payment[] {
  const raw = clusters.flatMap((i) => {
    const from = clusterDates[i - 1];
    const boundary = clusterDates[i];
    if (!from || !boundary) return [];
    // A cluster runs up to the day before the next cluster starts. The canvas expresses the
    // same boundary as `DateAdd(nextMilestone, -1, TimeUnit.Months)`; because every boundary
    // is the first of a month, one day back and one month back land in the same month.
    const end = new Date(`${boundary}T12:00:00`);
    end.setDate(end.getDate() - 1);
    const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    return equalPayments(0, from, to, frequency);
  });
  const seen = new Set<string>();
  const slots = raw.filter((p) => {
    const key = `${p.year}-${p.month}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const { amounts } = equalDistributionAmounts(amount, slots.length);
  return slots.map((p, i) => ({ ...p, amount: amounts[i] ?? 0 }));
}

/** Everything the panel would write, for the current form state. */
export function proposedPayments(
  line: CostLine | null,
  costValue: string,
  clusterDates: readonly (string | undefined)[],
): Payment[] {
  if (!line) return [];
  if (line.distribution === "individual") return line.payments;
  const amount = Number(costValue) || 0;
  return line.equalMode === "cluster"
    ? clusterPayments(amount, line.clusters, line.frequency, clusterDates)
    : equalPayments(amount, line.startDate, line.endDate, line.frequency);
}

/** `RoundDown(total / n, 0)` — the canvas shows the base, not the mean. */
export function averagePayment(costValue: string, count: number): number | undefined {
  if (count <= 0) return undefined;
  return equalDistributionAmounts(Number(costValue) || 0, count).averagePayment;
}

/** The Allocated Cost figure on a year's accordion header. */
export const allocatedForYear = (payments: readonly Payment[], year: number): number =>
  total(payments.filter((p) => p.year === year));

/* ═══════════════════════════════════════════════════════════════ the gate ══ */

/**
 * Whether Save is enabled.
 *
 * A description is required; the distribution must actually produce months; no month may be
 * negative or unparseable; and an EQUAL distribution additionally needs a total. An individual
 * distribution does not — its money is typed month by month.
 */
export function canSaveContract(
  line: CostLine | null,
  costValue: string,
  proposed: readonly Payment[],
): boolean {
  if (!line) return false;
  if (!line.description.trim()) return false;
  if (proposed.length === 0) return false;
  if (!proposed.every((p) => Number.isFinite(p.amount) && p.amount >= 0)) return false;
  if (line.distribution === "individual") {
    // For a PERCENT scheme, proposed carries raw percentages that must sum to 100; for
    // ABSOLUTE, it carries money and just needs a positive sum. Money conversion happens
    // separately, in `resolvedPayments` — this gate checks the shape the user typed.
    return canPersistIndividual(
      proposed.map((p) => ({ year: p.year, month: p.month, value: p.amount })),
      line.distributionScheme,
    );
  }
  const typed = costValue.trim();
  return typed !== "" && Number.isFinite(Number(typed)) && Number(typed) >= 0;
}

/**
 * The payments actually written to Dataverse.
 *
 * For an equal distribution, and for an individual/ABSOLUTE one, `proposed` already holds
 * money. For an individual/PERCENT one, `proposed`'s `amount` field holds a PERCENTAGE and has
 * no meaning as money until it is converted against the contract's total — the same coalesced
 * total the Total Costs box shows (`totalCostForPercent`).
 */
export function resolvedPayments(
  line: CostLine,
  costValue: string,
  proposed: readonly Payment[],
): Payment[] {
  if (line.distribution !== "individual" || line.distributionScheme !== "percent") return [...proposed];
  const totalForPct = totalCostForPercent(line.totalCost, 0, costValue) ?? 0;
  const converted = individualDistribution(
    proposed.map((p) => ({ year: p.year, month: p.month, value: p.amount, costId: p.id })),
    "percent",
    totalForPct,
  );
  return converted.map((r) => ({
    id: r.costId, year: r.year, month: r.month, amount: r.cost ?? 0, paid: false,
  }));
}

/* ══════════════════════════════════════════════════════════════════ labels ══ */

/** `Add Costs - <account>` / `Edit Costs - <account>`. */
export const panelTitle = (isEdit: boolean, accountName: string): string =>
  `${isEdit ? "Edit" : "Add"} Costs - ${accountName}`;

export const frequencyLabel = (months: number): string =>
  `${months} month${months === 1 ? "" : "s"}`;

/** The accounts a category tab shows. */
export const accountsInCategory = (
  accounts: readonly CostAccount[],
  category: number,
): CostAccount[] => accounts.filter((a) => a.category === category);

/**
 * The existing cost-row id for each month of a line, keyed `year-month`.
 *
 * `capexWriteSet` distinguishes "update this row" from "create one" by whether an id is present,
 * so the panel has to carry the ids of the months it started with.
 */
export function paymentIdsByMonth(line: CostLine | undefined): Map<string, string | undefined> {
  return new Map((line?.payments ?? []).map((p) => [`${p.year}-${p.month}`, p.id]));
}

/** One month as `saveCostLine` wants it — `amount: null` is "delete the row that was here". */
export interface PaymentWrite {
  id?: string;
  year: number;
  month: number;
  amount: number | null;
}

/**
 * The full set of month writes for a save: the proposed months, plus a tombstone for every
 * month the contract HAD and no longer has.
 *
 * Without the second half a save is additive only. Re-saving a contract with a wider frequency
 * or a shorter date range left every month the old schedule touched sitting in Dataverse with
 * its old money, so the grid's Total went up rather than changing — the contract's rows were
 * the union of every schedule it had ever had.
 *
 * The canvas has no such problem because it is blunt about it: it deletes the contract's whole
 * cost set and rewrites it (`RemoveIf('CAPEX Costs', Contract = ...)` then `Patch`,
 * `CapexScreenCode.txt:1776-1781`). Reconciling instead of deleting everything is a deliberate
 * divergence — it keeps the `vsb_capexcostid` of a month that survives, and with it the month's
 * paid flag and any payment-date comment hanging off that row, all of which the canvas
 * destroys on every save. The set of rows that ends up in Dataverse is the same either way.
 *
 * A dropped month with no id is simply absent: nothing existed, so nothing is deleted.
 */
export function reconcilePayments(
  existing: readonly Payment[],
  proposed: readonly Payment[],
): PaymentWrite[] {
  const idOf = new Map(existing.map((p) => [`${p.year}-${p.month}`, p.id]));
  const kept = new Set(proposed.map((p) => `${p.year}-${p.month}`));
  const writes: PaymentWrite[] = proposed.map((p) => ({
    id: idOf.get(`${p.year}-${p.month}`),
    year: p.year,
    month: p.month,
    amount: p.amount,
  }));
  for (const p of existing) {
    const key = `${p.year}-${p.month}`;
    if (kept.has(key) || !p.id) continue;
    writes.push({ id: p.id, year: p.year, month: p.month, amount: null });
  }
  return writes;
}

/* ═══════════════════════════════════════════════════════ panel validation ══ */

/** `totalCostMax` — Poland's ceiling is 2.25bn; everywhere else 500m. */
export function totalCostMax(countryName: string | null | undefined): number {
  return countryName === "Poland" ? 2_250_000_000 : 500_000_000;
}

/**
 * `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1`:
 *
 *   If(Country.Name = "Poland",
 *      $"Value must be between 0 and {If(Lower(…Language()…) = "en", "2,250,000,000",
 *                                                                   "2.250.000.000")}",
 *      $"Value must be between 0 and {If(… = "en", "500,000,000", "500.000.000")}")
 *
 * Three things this had wrong, all visible in the message itself: the lower bound reads **0**,
 * not 1; there is **no full stop** at the end; and the thousands separator follows the app
 * LANGUAGE — `en` gets commas, every other language gets dots — which `Intl` reproduces with the
 * `en-GB`/`de-DE` pair the canvas is choosing between.
 *
 * The accepted RANGE is left alone: the canvas Save gate rejects 0 elsewhere, so only the
 * sentence changes here.
 */
export function validateTotalCost(
  value: string,
  countryName: string | null | undefined,
  locale?: string,
): { valid: boolean; message: string | null } {
  const max = totalCostMax(countryName);
  const ok = isInteger(value, locale) && inRange(value, 1, max, locale);
  const grouped = new Intl.NumberFormat(
    (locale ?? "en-GB").toLowerCase().startsWith("en") ? "en-GB" : "de-DE",
  ).format(max);
  return { valid: ok, message: ok ? null : `Value must be between 0 and ${grouped}` };
}

const MM_YYYY = /^(0[1-9]|1[0-2])\/[0-9]{4}$/;
const mmYYYY = (month: number, year: number) => `${String(month).padStart(2, "0")}/${year}`;

/**
 * `lbl_AddContract_RightPanel_StartDate_ErrorMessage_1`.
 *
 * A blank value is valid — blankness is handled by the Save gate, not here. Anything not in
 * `MM/YYYY` fails the format check before the "must be on or after" check even runs.
 *
 *   If(Not(IsMatch(…, "^(0[1-9]|1[0-2])/[0-9]{4}$")), "Date must be in MM/YYYY format",
 *      If(varEnteredDate < locCostAllowedStartDate,
 *         "Start Date must be in or after " & Text(locCostAllowedStartDate, "mm/yyyy")))
 *
 * (`CapexScreenCode.txt:11413-11444`; the older `Start Date must take place after the milestone
 * Project Start` version directly above it is commented out in the source and never renders.)
 */
export function validateStartMonthYear(value: string, allowedStart: Date): string | null {
  if (!value.trim()) return null;
  if (!MM_YYYY.test(value)) return "Date must be in MM/YYYY format";
  const parts = value.split("/").map(Number);
  const entered = new Date(parts[1] as number, (parts[0] as number) - 1, 1);
  if (entered < allowedStart) {
    return `Start Date must be in or after ${
      mmYYYY(allowedStart.getMonth() + 1, allowedStart.getFullYear())}`;
  }
  return null;
}

/**
 * `lbl_AddContract_RightPanel_EndDate_ErrorMessage_1` — a DIFFERENT rule from the start date's,
 * not the same one re-pointed:
 *
 *   If(Not(IsMatch(End, MM/YYYY)), "Date must be in MM/YYYY format",
 *      IsMatch(End, …) && IsMatch(Start, …) && DateValue("01/" & Start) >= DateValue("01/" & End),
 *      "End Date must take place after Start Date")
 *
 * The end date is compared against the START DATE the user typed, never against
 * `locCostAllowedStartDate` — and the comparison is `>=`, so an end date in the SAME month as
 * the start is an error too. This used to reuse the start date's "must be in or after {month}"
 * check and message, which accepted `03/2026 → 03/2026` and rejected nothing the canvas rejects.
 */
export function validateEndMonthYear(value: string, startValue: string): string | null {
  if (!value.trim()) return null;
  if (!MM_YYYY.test(value)) return "Date must be in MM/YYYY format";
  if (!MM_YYYY.test(startValue.trim())) return null;
  const end = value.split("/").map(Number);
  const start = startValue.trim().split("/").map(Number);
  const endDate = new Date(end[1] as number, (end[0] as number) - 1, 1);
  const startDate = new Date(start[1] as number, (start[0] as number) - 1, 1);
  return startDate >= endDate ? "End Date must take place after Start Date" : null;
}

/**
 * `lbl_GeneratorData_..._ErrorMessage_2` — the description field's duplicate/reserved-word
 * guard. Unchanged from its own original value never re-triggers, so opening Edit on a
 * standard contract does not immediately flag its own name.
 */
export function describeDescriptionError(
  value: string,
  originalDescription: string | null,
  existingNames: readonly string[],
): string | null {
  if (!value.trim()) return null;
  if (value === originalDescription) return null;
  if (value.toLowerCase().includes("standard")) {
    return 'The term "Standard" is applicable only for system-prefilled contracts.';
  }
  const needle = value.trim().toLowerCase();
  const clash = existingNames.some((n) => n.trim().toLowerCase() === needle);
  return clash ? "There cannot be two contracts with the same name under the same sub-account" : null;
}

/**
 * `Substitute(txt_..._Description_1.Value, "Standard", "")` — editing a standard contract's
 * description clears the standard flag and strips every occurrence of the word.
 */
export function applyDescriptionChange(
  value: string,
  wasStandard: boolean,
): { description: string; isStandardContract: boolean } {
  if (!wasStandard) return { description: value, isStandardContract: false };
  return { description: value.replace(/Standard/g, "").trim(), isStandardContract: false };
}

/* ═══════════════════════════════════════════════════ cluster JSON columns ══ */

/**
 * The panel's five cluster checkboxes.
 *
 * FIVE, not six. `clusterDurations` yields six clusters (the sixth is COD -> End Date) but the
 * canvas panel only ever offers `chk_AddContract_RightPanel_SelectCluster1_1` … `…Cluster5_1`
 * (`CapexScreenCode.txt:10930+`), and both JSON columns carry exactly `Cluster1`..`Cluster5`.
 * Verified against VSBCloud_Dev: every populated `vsb_byclusterjson` has five keys.
 */
export const PANEL_CLUSTER_COUNT = 5;

/**
 * `vsb_byclusterjson` — which clusters are ticked.
 *
 * The canvas writes `JSON([{Cluster1: ..., Cluster5: ...}])` — an ARRAY holding ONE record, not
 * a bare object — and reads it back with `First(ParseJSON(...))` (`CapexScreenCode.txt:1544`
 * writes, `:19542` reads). Live rows in VSBCloud_Dev confirm it:
 *
 *     [{"Cluster1":false,"Cluster2":true,"Cluster3":false,"Cluster4":true,"Cluster5":false}]
 *
 * Writing a bare object here would still round-trip through OUR parser but would break the
 * canvas app reading the same row, so the wrapper is not cosmetic.
 *
 * Every cluster is written explicitly, including the unticked ones as `false`. The canvas is
 * emphatic about that — `Checked && DisplayMode = DisplayMode.Edit`, so a cluster that is
 * ticked but DISABLED (below the project's start cluster) serialises as `false`.
 */
export function byClusterJson(clusters: readonly number[]): string {
  const record: Record<string, boolean> = {};
  for (let i = 1; i <= PANEL_CLUSTER_COUNT; i += 1) record[`Cluster${i}`] = clusters.includes(i);
  return JSON.stringify([record]);
}

/**
 * The inverse of `byClusterJson` — `Boolean(locClusters.ClusterN)` for each of the five.
 *
 * Accepts the canvas' array wrapper and a bare object alike, so a row written by an earlier
 * build still reads. Only a literal `true` counts: the column always lists all five keys, so
 * "the key is present" says nothing at all about whether the cluster was ticked.
 *
 * A malformed value yields no clusters rather than throwing — a contract whose JSON cannot be
 * parsed must still render with its money intact.
 */
export function parseByClusterJson(json: string | undefined | null): number[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    const record = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown>;
    if (!record || typeof record !== "object") return [];
    return Object.entries(record)
      .filter(([k, v]) => /^Cluster\d+$/.test(k) && v === true)
      .map(([k]) => Number(k.replace("Cluster", "")))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/* ═════════════════════════════════════════════════ start/end JSON column ══ */

/** `YYYY-MM-DD` (what the panel's date inputs hold) -> `MM/YYYY` (what the column stores). */
function isoToMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
  return m ? `${m[2]}/${m[1]}` : "";
}

/**
 * `vsb_bystartenddatejson` — the By Start and End Date pair.
 *
 * Same array-of-one-record shape as `byClusterJson`, and the two dates are `MM/YYYY` STRINGS,
 * not ISO dates and not Dataverse dates. `CapexScreenCode.txt:1555` writes the raw values of
 * `txt_AddContract_RightPanel_StartDate_1` / `…EndDate_1`, whose `Placeholder` is `"MM/YYYY"`,
 * and the save then splits them back apart on `"/"` to get the month and year
 * (`:1702-1717`). Live rows agree: `[{"EndDate":"06/2026","StartDate":"12/2017"}]`.
 *
 * The skeleton's `parseStartEndJson` expects `{StartMonth, StartYear, EndMonth, EndYear}`
 * instead. That shape exists nowhere in the canvas or in the dev org, so it is not followed.
 *
 * An unset pair writes `""` for both, exactly as the canvas does when the boxes are empty —
 * that is the value the "By Cluster / By Start and End Date" radio tests for on reopen.
 */
export function startEndJson(startDate: string, endDate: string): string {
  return JSON.stringify([{
    StartDate: isoToMonthYear(startDate),
    EndDate: isoToMonthYear(endDate),
  }]);
}

/**
 * The inverse of `startEndJson`, as the `YYYY-MM-01` the panel's date inputs want.
 *
 * Reads the canvas' `MM/YYYY` first and falls back to a full ISO date, so a row written by an
 * earlier build (which stored ISO) still opens. The day is always the 1st: the column carries
 * no day, and every consumer — `distributionSchedule`, the grid — works in whole months.
 */
export function parseStartEndJson(
  json: string | undefined | null,
): { startDate: string; endDate: string } {
  const empty = { startDate: "", endDate: "" };
  if (!json) return empty;
  let record: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    record = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown>;
    if (!record || typeof record !== "object") return empty;
  } catch {
    return empty;
  }
  const toIso = (value: unknown): string => {
    if (typeof value !== "string") return "";
    const mmYyyy = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(value.trim());
    if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1]}-01`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    return iso ? value.trim() : "";
  };
  return { startDate: toIso(record.StartDate), endDate: toIso(record.EndDate) };
}

/**
 * Which of the two equal-distribution modes a stored contract opens in.
 *
 * `rad_AddContract_RightPanel_DistributionBy_1.DefaultSelectedItems`
 * (`CapexScreenCode.txt:10683`): any cluster ticked -> By Cluster; otherwise a non-blank
 * start AND end -> By Start and End Date; otherwise **By Cluster**. That last fallback is the
 * one worth stating — a contract with neither stored opens on By Cluster, not on dates.
 */
export function resolveEqualMode(
  clusters: readonly number[],
  startDate: string,
  endDate: string,
): "cluster" | "dates" {
  if (clusters.length > 0) return "cluster";
  return startDate && endDate ? "dates" : "cluster";
}

/* ══════════════════════════════════════════════════ the grid's sub-label ══ */

/** `MM/YYYY` from the `YYYY-MM-DD` the model carries; `""` for anything unusable. */
function monthYearLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
  return m ? `${m[2]}/${m[1]}` : "";
}

/**
 * The grid contract row's second line — `SubLabel` (`Capex Costs Screen.pa.yaml:1222-1330`).
 *
 * The canvas builds it as three concatenated segments:
 *
 *     "[" & CostPaidBy & "]"
 *   & If(Not(IsBlank('Linked Cluster')), " Link to Cluster " & 'Linked Cluster'.Order, "")
 *   & <the distribution half>
 *
 * THE MIDDLE SEGMENT reads the contract's `Project States` lookup — `linkedClusterOrder` on
 * `CostLine`, from `_vsb_linkedcluster_value` resolved through `loadProjectStates`. It is
 * `" Link to Cluster " & Order` with a LEADING space and no trailing one, so an unlinked
 * contract's label is byte-for-byte what it was before this segment existed.
 *
 * The distribution half is EQUAL-DISTRIBUTION ONLY — both branches of the canvas' `If` test
 * `CPC.Distribution = 'Distribution Type'.'Equal Distribution'` first, so an individually
 * distributed contract never gets one. Ticked clusters win over the date pair, and the cluster
 * list is joined with `", "` when there are MORE THAN TWO and with `" & "` otherwise:
 *
 *     Concat(locSelectedClusters, label, If(CountRows(locSelectedClusters) > 2, ", ", " & "))
 *
 * THE SEPARATOR BEFORE THE DISTRIBUTION HALF IS CONDITIONAL — transcribed, not chosen. The canvas
 * emits the `", "` from inside each distribution branch and guards it with
 * `If(Not(IsBlank(CPC.'Linked Cluster')), ", ", "")` (`:1299-1302` and `:1313-1317`), so the
 * comma exists only to separate the distribution text from a "Link to Cluster N" that precedes
 * it. With no linked cluster the canvas really does render `[SPV]Distribution to Cluster 1 & 2`,
 * with the bracket butted straight against the D. (The `" " & Text(CPC.Distribution)` that would
 * have separated them is commented out in the source, `:1237-1241`.) Reproduced exactly: this
 * string is also the PCF's fallback source for the payer tag and the distribution type
 * (`DatasetParser.ts:243`/`:293`), so inventing a space here is a divergence, not a tidy-up.
 *
 * The separator is emitted per BRANCH, not once before the half — a linked contract with an
 * equal distribution that has neither clusters nor dates falls out of both branches and gets no
 * trailing comma, because the canvas' `If` returns blank rather than reaching either `", "`.
 * Same for a linked contract distributed individually.
 *
 * The date branch fires when EITHER date is set — the canvas tests
 * `Not(IsBlank(StartDate & EndDate))`, a concatenation, so one date alone still produces the
 * segment with the other half empty.
 */
export function contractSubLabel(
  contract: Pick<
    CostLine,
    "payer" | "distribution" | "clusters" | "startDate" | "endDate" | "linkedClusterOrder"
  >,
): string {
  const linked = contract.linkedClusterOrder;
  const base = `[${contract.payer}]`
    + (linked === undefined ? "" : ` Link to Cluster ${linked}`);
  // `If(Not(IsBlank(CPC.'Linked Cluster')), ", ", "")`, prepended inside each branch below.
  const lead = linked === undefined ? "" : ", ";
  if (contract.distribution !== "equal") return base;

  const clusters = [...contract.clusters].sort((a, b) => a - b);
  if (clusters.length > 0) {
    const separator = clusters.length > 2 ? ", " : " & ";
    return `${base}${lead}Distribution to Cluster ${clusters.join(separator)}`;
  }

  const from = monthYearLabel(contract.startDate);
  const to = monthYearLabel(contract.endDate);
  if (!from && !to) return base;
  return `${base}${lead}Distribution from ${from} to ${to}`;
}

/* ═══════════════════════════════════════════════════════ individual mode ══ */

export type DistributionScheme = "percent" | "absolute";

export interface PanelMonthRow {
  year: number;
  month: number;
  value: number | null;
  costId?: string;
}

/**
 * Rule — a percentage row converts against the contract's total; an absolute row is the money
 * itself. Both round to whole currency units, half away from zero (`RoundDown` is for equal
 * distribution's arithmetic; individual amounts use ordinary rounding).
 */
export function individualDistribution(
  rows: readonly PanelMonthRow[],
  scheme: DistributionScheme,
  totalCostForPct: number,
): { year: number; month: number; cost: number | null; costId?: string }[] {
  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    cost: r.value === null || r.value === undefined
      ? null
      : scheme === "percent" ? round((totalCostForPct * r.value) / 100, 0) : round(r.value, 0),
    costId: r.costId,
  }));
}

/**
 * Whether an individual distribution is saveable: a percent scheme must sum to exactly 100 (to
 * one decimal, to absorb rounding); an absolute scheme just needs a positive sum.
 */
export function canPersistIndividual(
  rows: readonly PanelMonthRow[],
  scheme: DistributionScheme,
): boolean {
  const sum = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  return scheme === "percent" ? round(sum, 1) === 100 : sum > 0;
}

/* ═══════════════════════════════════════════════════════════ paid toggle ══ */

/**
 * `Self.SetCostPaidUnpaidTriggered` guard — a cluster-LINKED, individually-distributed contract
 * asks for confirmation before its paid state changes, because marking it paid also clears the
 * cluster link (the canvas' `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation`).
 */
export function paidToggleNeedsConfirmation(
  contract: Pick<CostLine, "distribution"> & { linkedClusterOrder?: number },
): boolean {
  return contract.distribution === "individual" && contract.linkedClusterOrder !== undefined;
}

/** Resolves a grid click (contract + year + month) back to the cost row it should update. */
export function resolvePaidTarget(
  payments: readonly Payment[],
  year: number,
  month: number,
): { costId: string } | { error: string } {
  const hit = payments.find((p) => p.year === year && p.month === month);
  return hit?.id
    ? { costId: hit.id }
    : { error: "No monthly cost row found for the selected contract/month/year." };
}

/* ═══════════════════════════════════════════════════════ link to milestone ══ */

/**
 * `con_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster` — the "Link to Milestone" dropdown.
 *
 * `CapexScreenCode.txt:11178-11345`. The group container's label is `"Link to Milestone"`
 * (`:11216`) with a red asterisk (`:11222-11231`), so the field is REQUIRED on screen — but see
 * `NO_MILESTONE` below for what "required" actually means here.
 */

/** The first entry of `Items` — `Table({vsb_name: "None"}, Sort(Filter(…)))`, `:11265`. */
export const NO_MILESTONE = "None";

/** The label above the dropdown, and the asterisk that goes with it (`:11216`, `:11226`). */
export const LINK_TO_MILESTONE_LABEL = "Link to Milestone";

/**
 * Whether the dropdown is on screen at all.
 *
 * `Visible` on the container (`:11192-11199`):
 *
 *     Or(DistributionType = 'Individual Distribution',
 *        And(DistributionType = 'Equal Distribution', DistributionBy = "By Start and End Date"))
 *
 * so an equal distribution spread BY CLUSTER never offers it — the clusters are the
 * distribution, and linking one of them as a milestone as well is meaningless.
 */
export const linkToMilestoneVisible = (
  line: Pick<CostLine, "distribution" | "equalMode"> | null,
): boolean =>
  line !== null
  && (line.distribution === "individual"
    || (line.distribution === "equal" && line.equalMode === "dates"));

/** One `Project States` row, structurally — `data/costBook.ts`'s `ProjectState`. */
export interface MilestoneOption {
  id: string;
  name: string;
  order: number;
}

/**
 * `Items` — the milestones this cost may be linked to (`:11244-11281`).
 *
 *     Filter('Project States',
 *            Order in [1, 2, 3, 4, 5, 6]
 *            && Order > gblSelectedProject.'Cluster State'.Order
 *            && Order >= Max(1, varStartClusterNo))
 *     sorted by Order ascending
 *
 * Three clauses, each doing different work and none redundant:
 *
 *   `Order in [1..6]`  the table also holds Draft (0), Abandoned (8) and Inactive/On-hold (9),
 *                      which are project states but not clusters. Without it the dropdown would
 *                      offer "Abandoned".
 *   `> clusterStateOrder`  a cost can only be linked to a milestone the project has NOT reached.
 *   `>= Max(1, startClusterNo)`  an ACQUIRED project never had the clusters before the one it
 *                      was bought at. `Max(1, …)` is why Greenfield (0) still starts at 1.
 *
 * `varStartClusterNo` is `Coalesce(locProjectStartClusterNo, Switch(project.'Start Cluster', …))`
 * (`:11246-11263`) — the same 0..6 `vsb_startcluster` value `ProjectContext.startClusterNo`
 * already carries, so no mapping is needed here.
 *
 * The caller prepends `NO_MILESTONE`; this returns the rows, because the confirmation copy and
 * the write both need the selected row's `id` and `order`, not just its name.
 */
export function milestoneOptions(
  projectStates: readonly MilestoneOption[],
  clusterStateOrder: number | undefined,
  startClusterNo: number | undefined,
): MilestoneOption[] {
  const reached = clusterStateOrder ?? 0;
  const floor = Math.max(1, startClusterNo ?? 0);
  return projectStates
    .filter((s) => s.order >= 1 && s.order <= 6 && s.order > reached && s.order >= floor)
    .slice()
    .sort((a, b) => a.order - b.order);
}

/**
 * `locClusterLinkageChanged` (`:11289-11292`).
 *
 *     And(Selected.Name <> "None",
 *         Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name)
 *
 * BY NAME, not by id — transcribed, not chosen. It also means UNLINKING (picking "None" over a
 * stored link) is NOT a "linkage change" and never asks for confirmation: only moving a cost
 * ONTO a milestone does. A contract with no stored link has a blank `.Name`, and
 * `"Cluster 3" <> Blank()` is true, so a first link counts as a change.
 */
export function clusterLinkageChanged(
  selectedName: string,
  storedName: string | undefined,
): boolean {
  return selectedName !== NO_MILESTONE && selectedName !== (storedName ?? "");
}

/**
 * `locMilestoneRelinkResetNeeded` (`:11301-11324`).
 *
 * The linkage change above, AND the contract carries something a milestone-linked cost may not
 * have: a month marked Paid, or a "Comments to payment date" comment.
 *
 *     And(Self.Selected.Name <> "None",
 *         Self.Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name,
 *         Or(CountRows(Filter('CAPEX Costs', Contract = … && 'Cost Paid' = true)) > 0,
 *            CountRows(Filter('Capex Comments',
 *                             'Capex Contract' = … && 'Comment Type' = 'Comments to payment date'
 *                            )) > 0))
 *
 * Accepting the dialog is what clears both — see `saveCostLine`'s
 * `resetPaidAndPaymentDateComments`.
 */
export function milestoneRelinkResetNeeded(args: {
  selectedName: string;
  storedName: string | undefined;
  payments: readonly Pick<Payment, "paid">[];
  paymentDateCommentCount: number;
}): boolean {
  if (!clusterLinkageChanged(args.selectedName, args.storedName)) return false;
  return args.payments.some((p) => p.paid) || args.paymentDateCommentCount > 0;
}

/**
 * `colOtherClusterHavingCost` — the clusters whose window contains a month that carries money
 * (`btn_Capex_Cost_Add_New_*_Distribution_Cost_Calculate_Cluster_Range_Out_Of_LinkedCost`,
 * `CapexScreenCode.txt:645-760`).
 *
 * The canvas builds it slightly differently per distribution type — the equal-distribution
 * button scans `colCapexCostDataToPatch` with an inclusive end, the individual one scans
 * `colNewEditPanelCost` with a half-open end — and this follows the INCLUSIVE form, which is
 * the one the skeleton ported and the one that matches `clusterDurations`' own inclusive
 * `[start, end]` months. The difference only shows on a cost booked in the exact month one
 * cluster hands over to the next.
 *
 * A zero month is not "cost entered": the canvas tests `Coalesce(C.<Month>Save, 0) > 0`.
 */
export function clustersHavingCost<
  C extends { order: number; startYear: number; startMonth: number; endYear: number; endMonth: number },
>(
  clusters: readonly C[],
  rows: readonly { year: number; month: number; cost: number | null }[],
): C[] {
  const live = rows.filter((r) => (r.cost ?? 0) !== 0);
  const idx = (y: number, m: number) => y * 12 + m;
  return clusters.filter((c) =>
    live.some((r) =>
      idx(r.year, r.month) >= idx(c.startYear, c.startMonth)
      && idx(r.year, r.month) <= idx(c.endYear, c.endMonth)));
}

/**
 * Whether Save has to stop and ask — the gate on `locShowClusterLinkageConfirmation`
 * (`CapexScreenCode.txt:17413` / `:17526`, inside the Save button's `If(locValidCostInContract,
 * …)`):
 *
 *     Or(And(CountRows(Filter(colOtherClusterHavingCost,
 *                             Order <> drp_…_Link_to_Cluster.Selected.Order)) > 0,
 *            locClusterLinkageChanged),
 *        locCostPaidByChanged,
 *        locMilestoneRelinkResetNeeded)
 *
 * Note the exclusion of the SELECTED cluster from the count: money inside the cluster you are
 * linking to is the normal case and is not worth a dialog. Money in any OTHER cluster is,
 * because the link is about to move it.
 */
export function needsClusterLinkageConfirmation(args: {
  clusters: readonly { order: number; startYear: number; startMonth: number; endYear: number; endMonth: number }[];
  rows: readonly { year: number; month: number; cost: number | null }[];
  selectedClusterOrder: number | undefined;
  clusterLinkageChanged: boolean;
  costPaidByChanged: boolean;
  milestoneRelinkResetNeeded: boolean;
}): boolean {
  const others = clustersHavingCost(args.clusters, args.rows)
    .filter((c) => c.order !== args.selectedClusterOrder);
  return (others.length > 0 && args.clusterLinkageChanged)
    || args.costPaidByChanged
    || args.milestoneRelinkResetNeeded;
}

/**
 * Everything the relink dialog renders — `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup`
 * (`CapexScreenCode.txt:19853-19980`), the one whose `Visible` really is
 * `locShowClusterLinkageConfirmation` (`:19965`).
 *
 * There is an OLDER `cmp_PopUp_Confirmation_1` in the same file (`:19672-19800`) with a
 * four-armed `If` that produces one sentence per case; it is DEAD — its `Visible` is a
 * commented-out `locShowClusterLinkageConfirmation` followed by a bare `false`
 * (`Capex Costs Screen.pa.yaml:426-428`). The live control is the bulleted one below, so that
 * is what is reproduced.
 */
export interface ClusterLinkageConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function clusterLinkageConfirmation(args: {
  /** `locCostPaidByChanged`, and the payer the radio now shows. */
  costPaidByChanged: boolean;
  payer: CostLine["payer"];
  /** `locClusterLinkageChanged`. */
  clusterLinkageChanged: boolean;
  /** `locMilestoneRelinkResetNeeded`. */
  milestoneRelinkResetNeeded: boolean;
  /** `colOtherClusterHavingCost`, UNFILTERED — see the two counts below. */
  clustersWithCost: readonly { order: number }[];
  /** `drp_…_Link_to_Cluster.Selected.Name`. */
  selectedName: string;
  /** `drp_…_Link_to_Cluster.Selected.Order`, absent for "None". */
  selectedOrder: number | undefined;
}): ClusterLinkageConfirmation {
  /*
   * THE CANVAS USES TWO DIFFERENT COUNTS OF THE SAME COLLECTION, and the difference is not a
   * typo to tidy up. `locShowC2` and the Title test `Filter(colOtherClusterHavingCost,
   * Order <> Selected.Order)` — the selected cluster excluded — while the confirm button's
   * label tests the RAW `CountRows(colOtherClusterHavingCost)` (`:19929`, `:19974`). A cost
   * whose only money sits in the cluster it is being linked to therefore gets "Confirm All"
   * width on a dialog that shows no cluster bullet. Reproduced.
   */
  const others = args.clustersWithCost.filter((c) => c.order !== args.selectedOrder);
  const showC1 = args.costPaidByChanged;
  const showC2 = args.clusterLinkageChanged && others.length > 0;
  const showC3 = args.milestoneRelinkResetNeeded;

  // `Concat(locClusterItems, Order, ", ")` — `locClusterItems` is the UNFILTERED collection.
  const orders = args.clustersWithCost.map((c) => c.order).join(", ");

  const description = "Are you sure you want to proceed with the following changes?"
    + (showC1
      ? `\n• Switch the "Cost Paid By" to ${args.payer}. This will impact liquidity planning and BoP.`
      : "")
    + (showC2
      ? `\n• Costs have been entered for Cluster ${orders} and linked to ${args.selectedName}.`
      : "")
    + (showC3
      ? '\n• "Paid" markers are not supported for milestone-linked costs. '
        + "Linking this cost to a milestone will reset all costs to unpaid."
      : "");

  const title = showC1 && showC2
    ? "Confirm Changes"
    : showC1 ? "Change Cost Paid By" : "Change Cluster Link";

  const confirmLabel = args.costPaidByChanged
    && args.clusterLinkageChanged
    && args.clustersWithCost.length > 0
    && args.selectedName !== ""
    && args.selectedName !== NO_MILESTONE
    ? "Confirm All"
    : "Confirm";

  return { title, description, confirmLabel, cancelLabel: "Cancel" };
}

/* ══════════════════════════════════════════════════════════ delete plan ══ */

/** Deleting a contract takes its comments with it — the canvas' `RemoveIf('Capex Comments', ...)`. */
export function planDeleteContract(
  contractId: string,
  commentIds: readonly { id: string; contractId: string }[],
): { contractId: string; commentIds: string[] } {
  return {
    contractId,
    commentIds: commentIds.filter((c) => c.contractId === contractId).map((c) => c.id),
  };
}
