/**
 * Project General Milestones Screen — business rules.
 *
 * Canvas screen: `Project General Milestones Screen` (PM app)
 *   137 controls · 4 288 lines of Power Fx · 45 substantive blocks · band L
 *
 * Everything here is pure. `Screen.tsx` and `hooks.ts` call it; `rules.test.ts` tests it.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colMilestonesFormValidation` as a collection, and its TWO writers
 *    (`btn_..._Reset_Validation` evaluating the rules against the stored record, and
 *    `btn_..._Recalculate` evaluating the same rules against the controls). They are two
 *    copies of one rule set; `validateMilestones` is that rule set, called with whichever
 *    dates you have. `Dirty` becomes the form's dirty-field set.
 *  - `con_Milestones_Tip` (hard-coded `Visible: false`) and the farmdown error label
 *    (also hard-coded `false`) — dead UI. The farmdown VALIDATION is kept: it still gates
 *    the save through the validation collection.
 *  - The commented-out `Fabric Sync Jobs` insert and
 *    `'ForaProjecttriggerFabricDEVEX/CAPEXrecalculation'.Run` block. See `FABRIC_SYNC_NOTE`.
 *  - `colLogs` — the per-step re-pricing log is telemetry now, not a collection rendered
 *    into a dialog.
 *
 * SOURCE DEFECT (rule 3), corrected: the canvas sorts the milestone labels by
 * `Text(Order)`, so an `Order` of 10 would sort before 2. `milestoneLabels` sorts
 * numerically. See the comment there.
 */
import {
  parseNumber, isTwoDecimal, inRange, isBlank, pfxRound, type Lang,
} from "@/domain/numeric";
import { addDays, addMonths, addYears } from "@/domain/dates";
import { ES, CHOICE } from "@/data/entities";
import type { WriteOp } from "@/platform/dataClient";
import {
  PROJECT_COL, bind, clearSkippedMilestones, startClusterNo, formatAuditStamp,
} from "@/features/pm/general-data/rules";

/**
 * Rule 17 is the SAME RULE as General Data's cluster-change panel (rule 29), so it is
 * defined once there and re-exported here. Both screens blank the milestones the start
 * cluster skips and clear their standard-assumption flags at the same thresholds.
 */
export { clearSkippedMilestones, startClusterNo, formatAuditStamp };

/** Kept so the open question is visible in code, not only in the migration log. */
export const FABRIC_SYNC_NOTE =
  "AMBIGUOUS — the canvas save contains a commented-out `Patch('Fabric Sync Jobs', …, "
  + "{'Job Status': Dirty, 'Job Type': \"Project Milestones changed\"})` plus a "
  + "`'ForaProjecttriggerFabricDEVEX/CAPEXrecalculation'.Run(...)`. That workflow is not in "
  + "the solution export. Confirm with the product owner whether Fabric recalculation on a "
  + "milestone change is meant to be restored; if so, insert a `Fabric Sync Jobs` row here "
  + "and let the Dataverse-triggered flow pick it up — do not call a manual flow from the client.";

/* ═════════════════════════════════════════════════════════════ the date chain ════ */

export const MILESTONE_KEYS = [
  "StartDate",
  "FeasibilityStudies",
  "ProjectDevelopmentStarted",
  "ApplicationSubmitted",
  "LegallyBindingPermits",
  "FinalInvestmentDecision",
  "Construction",
  "OperationsStartDate",
  "EndDate",
  "SalesStartDate",
  /**
   * The source's collection row for Sales COMPLETION is literally named "StartCompleted".
   * Keep the mapping explicit so the rename cannot silently break.
   */
  "StartCompleted",
  "ShareOfFarmdown",
] as const;

export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export interface MilestoneMeta {
  key: MilestoneKey;
  label: string;
  /** `Projects` column this milestone writes. Absent for the farmdown pseudo-row. */
  projectField?: string;
  /** The `Is ... Standard Assumption?` flag, where one exists. */
  standardFlagField?: string;
  /**
   * Milestones AT OR BELOW the start cluster are unconditionally valid (rule 7).
   * `undefined` means always required, whatever the start cluster.
   */
  startClusterThreshold?: number;
  previousKey?: MilestoneKey;
  /** The `Text` column of `colMilestonesFormValidation`. */
  text: string;
}

/**
 * GUIDE p15/p16 — the ordering-validation copy exactly as it renders under each date
 * field. Every date after Project Start is invalid — blank or not — until it is later
 * than the date named here, and the message always names THAT earlier date, never the
 * field's own name. Six of these are verbatim from the screenshots (marked below); the
 * rest extend the same pattern one link further up the chain, which is the only
 * consistent reading of "later than the one before it" (rule 7's own description) — they
 * are not independently confirmed.
 */
const PREVIOUS_DATE_LABEL: Record<
  Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate" | "SalesStartDate">, string
> = {
  FeasibilityStudies: "Project Start", // pattern extension — not directly visible in p15/p16
  ProjectDevelopmentStarted: "Cluster 1", // pattern extension
  ApplicationSubmitted: "Cluster 2", // pattern extension
  LegallyBindingPermits: "Cluster 3", // GUIDE p15: verbatim
  FinalInvestmentDecision: "Cluster 4", // GUIDE p15: verbatim
  Construction: "Final Investment Decision", // GUIDE p15: verbatim
  OperationsStartDate: "Cluster 5", // GUIDE p15: verbatim
  EndDate: "Cluster 6", // GUIDE p15: verbatim
  StartCompleted: "sales starts", // GUIDE p15: verbatim, including the lowercase wording
};

export type OrderedDateKey = keyof typeof PREVIOUS_DATE_LABEL;

/** The exact copy, e.g. `"The date needs to be later than Cluster 3 date."`. */
export function orderingMessage(key: OrderedDateKey): string {
  return `The date needs to be later than ${PREVIOUS_DATE_LABEL[key]} date.`;
}

export const MILESTONE_CHAIN: MilestoneMeta[] = [
  // GUIDE p15/p16 — labels transcribed verbatim from the two-column form.
  { key: "StartDate", label: "Project Start", projectField: PROJECT_COL.projectStartDate,
    startClusterThreshold: 1, text: "Check input for Project Start date." },
  { key: "FeasibilityStudies", label: "Cluster 1: Feasibility Studies",
    projectField: PROJECT_COL.feasibilityStudies, startClusterThreshold: 2,
    previousKey: "StartDate", text: orderingMessage("FeasibilityStudies") },
  { key: "ProjectDevelopmentStarted", label: "Cluster 2: Pre-Permitting",
    projectField: PROJECT_COL.projectDevelopmentStarted,
    standardFlagField: PROJECT_COL.isProjectDevelopmentStd, startClusterThreshold: 3,
    previousKey: "FeasibilityStudies", text: orderingMessage("ProjectDevelopmentStarted") },
  { key: "ApplicationSubmitted", label: "Cluster 3: Permitting",
    projectField: PROJECT_COL.applicationSubmitted,
    standardFlagField: PROJECT_COL.isApplicationSubmittedStd, startClusterThreshold: 4,
    previousKey: "ProjectDevelopmentStarted", text: orderingMessage("ApplicationSubmitted") },
  { key: "LegallyBindingPermits", label: "Cluster 4: Pre-Construction",
    projectField: PROJECT_COL.legallyBindingPermits,
    standardFlagField: PROJECT_COL.isLegallyBindingPermitsStd, startClusterThreshold: 5,
    previousKey: "ApplicationSubmitted", text: orderingMessage("LegallyBindingPermits") },
  { key: "FinalInvestmentDecision", label: "Final Investment Decision",
    projectField: PROJECT_COL.fid, standardFlagField: PROJECT_COL.isFidStd,
    previousKey: "LegallyBindingPermits", text: orderingMessage("FinalInvestmentDecision") },
  { key: "Construction", label: "Cluster 5: Construction", projectField: PROJECT_COL.construction,
    standardFlagField: PROJECT_COL.isConstructionStd, previousKey: "FinalInvestmentDecision",
    text: orderingMessage("Construction") },
  { key: "OperationsStartDate", label: "Cluster 6: Operation",
    projectField: PROJECT_COL.cod, standardFlagField: PROJECT_COL.isCodStd,
    previousKey: "Construction", text: orderingMessage("OperationsStartDate") },
  { key: "EndDate", label: "Project End Date", projectField: PROJECT_COL.endDate,
    standardFlagField: PROJECT_COL.isEndDateStd, previousKey: "OperationsStartDate",
    text: orderingMessage("EndDate") },
  { key: "SalesStartDate", label: "Sales Start Date", projectField: PROJECT_COL.salesStartDate,
    standardFlagField: PROJECT_COL.isSalesStartStd, text: "Check input for Sales Start Date." },
  { key: "StartCompleted", label: "Sales Completion Date", projectField: PROJECT_COL.salesCompleted,
    standardFlagField: PROJECT_COL.isSalesCompletedStd, text: orderingMessage("StartCompleted") },
  { key: "ShareOfFarmdown", label: "Share of Farmdown [%]", text: "Check input for Share of Farmdown [%]." },
];

const META = new Map(MILESTONE_CHAIN.map((m) => [m.key, m]));
export const milestoneMeta = (k: MilestoneKey): MilestoneMeta => META.get(k)!;

export type MilestoneDates = Record<Exclude<MilestoneKey, "ShareOfFarmdown">, string | null>;

export const emptyMilestoneDates: MilestoneDates = {
  StartDate: null, FeasibilityStudies: null, ProjectDevelopmentStarted: null,
  ApplicationSubmitted: null, LegallyBindingPermits: null, FinalInvestmentDecision: null,
  Construction: null, OperationsStartDate: null, EndDate: null,
  SalesStartDate: null, StartCompleted: null,
};

export type StandardAssumptionFlags = Partial<Record<MilestoneKey, boolean>>;

export interface MilestonesForm {
  dates: MilestoneDates;
  standardAssumption: StandardAssumptionFlags;
  /** As typed, in percent. */
  shareOfFarmdown: string;
  isStandardShareOfFarmdown: boolean;
}

/* ═════════════════════════════════════════════════════════════════ binding ════ */

export interface MilestoneProject {
  id: string | null;
  /** 'Project Name' — part of the seeded revenue contract's `Name`. */
  name: string | null;
  /** 'Project ID' — blank means the page is locked. */
  projectNumber: string | null;
  clusterStateName: string | null;
  countryId: string | null;
  countryName: string | null;
  countryBusinessUnitId: string | null;
  areaName: string | null;
  technology: string | null;
  startCluster: number | null;
  acquisitionDate: string | null;
  shareOfFarmdown: number | null;
  isStandardShareOfFarmdown: boolean | null;
  dates: MilestoneDates;
  standardAssumption: StandardAssumptionFlags;
  /** For `RecordFooter`'s audit stamp — GUIDE p15/p16. */
  createdOn: string | null;
  modifiedOn: string | null;
}

const time = (d: string | null | undefined): number | null => {
  if (isBlank(d)) return null;
  const t = new Date(d!).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Rule 4 — for an ACQUIRED project whose start cluster equals a given cluster and whose
 * `End Date` is blank, that cluster's date defaults to the acquisition date.
 */
export function initialDates(p: MilestoneProject): MilestoneDates {
  const n = startClusterNo(p.startCluster);
  const endBlank = isBlank(p.dates.EndDate);
  const pick = (
    cluster: number, key: Exclude<MilestoneKey, "ShareOfFarmdown">,
  ): string | null =>
    n === cluster && endBlank ? p.dates[key] ?? p.acquisitionDate ?? null : p.dates[key];

  return {
    ...p.dates,
    FeasibilityStudies: pick(1, "FeasibilityStudies"),
    ProjectDevelopmentStarted: pick(2, "ProjectDevelopmentStarted"),
    ApplicationSubmitted: pick(3, "ApplicationSubmitted"),
    LegallyBindingPermits: pick(4, "LegallyBindingPermits"),
    Construction: pick(5, "Construction"),
    OperationsStartDate: pick(6, "OperationsStartDate"),
  };
}

/** Rule 5 — `locShareOfFarmdown: Coalesce(project.'Share of Farmdown', 50)`. */
export function initialForm(p: MilestoneProject): MilestonesForm {
  return {
    dates: initialDates(p),
    standardAssumption: { ...p.standardAssumption },
    shareOfFarmdown: String(p.shareOfFarmdown ?? 50),
    isStandardShareOfFarmdown: p.isStandardShareOfFarmdown ?? true,
  };
}

/* ═══════════════════════════════════════════════════════════════ validation ════ */

export interface MilestoneValidity { valid: boolean; text: string }
export type MilestoneValidation = Record<MilestoneKey, MilestoneValidity>;

/**
 * Rules 6–9 in ONE pass. This replaces both `btn_..._Reset_Validation` (evaluated against
 * the stored record) and `btn_..._Recalculate` (evaluated against the controls) — they
 * are the same twelve rules against different inputs, so the inputs are arguments.
 *
 * FID, Cluster 5, Cluster 6, End Date, Sales Start and Sales Completed are ALWAYS
 * required, whatever the start cluster; everything at or below the start cluster is
 * unconditionally valid.
 */
export function validateMilestones(
  dates: MilestoneDates,
  startCluster: number | null | undefined,
  shareOfFarmdown = "50",
  language: Lang = "en-US",
): MilestoneValidation {
  const n = startClusterNo(startCluster ?? 0);
  const d = (k: Exclude<MilestoneKey, "ShareOfFarmdown">) => time(dates[k]);
  const present = (k: Exclude<MilestoneKey, "ShareOfFarmdown">) => !isBlank(dates[k]);

  /** `a > b`, with both dates required to be present. */
  const after = (
    a: Exclude<MilestoneKey, "ShareOfFarmdown">,
    b: Exclude<MilestoneKey, "ShareOfFarmdown">,
  ) => {
    const x = d(a), y = d(b);
    return x !== null && y !== null && x > y;
  };

  const valid: Record<MilestoneKey, boolean> = {
    StartDate: n >= 1 || present("StartDate"),
    FeasibilityStudies:
      n >= 2 || (present("FeasibilityStudies") && (n === 1 || after("FeasibilityStudies", "StartDate"))),
    ProjectDevelopmentStarted:
      n >= 3 || (present("ProjectDevelopmentStarted")
        && (n === 2 || after("ProjectDevelopmentStarted", "FeasibilityStudies"))),
    ApplicationSubmitted:
      n >= 4 || (present("ApplicationSubmitted")
        && (n === 3 || after("ApplicationSubmitted", "ProjectDevelopmentStarted"))),
    LegallyBindingPermits:
      n >= 5 || (present("LegallyBindingPermits")
        && (n === 4 || after("LegallyBindingPermits", "ApplicationSubmitted"))),
    FinalInvestmentDecision:
      present("FinalInvestmentDecision")
      && (n >= 5 || after("FinalInvestmentDecision", "LegallyBindingPermits")),
    Construction: after("Construction", "FinalInvestmentDecision"),
    OperationsStartDate: after("OperationsStartDate", "Construction"),
    EndDate: after("EndDate", "OperationsStartDate"),
    // Sales Start must PRECEDE Sales Completed; Sales Completed must FOLLOW Sales Start.
    // Both rows go invalid together, which is what the canvas does.
    SalesStartDate: (() => {
      const a = d("SalesStartDate"), b = d("StartCompleted");
      return a !== null && b !== null && a < b;
    })(),
    StartCompleted: after("StartCompleted", "SalesStartDate"),
    ShareOfFarmdown: validateFarmdown(shareOfFarmdown, language),
  };

  return Object.fromEntries(
    MILESTONE_KEYS.map((k) => [k, { valid: valid[k], text: milestoneMeta(k).text }]),
  ) as MilestoneValidation;
}

/** Rule 15 — two decimals, 0..100. */
export function validateFarmdown(raw: string, language: Lang = "en-US"): boolean {
  if (isBlank(raw)) return false;
  return isTwoDecimal(raw, language) && inRange(raw, 0, 100, language);
}

/** The `Text` of every currently invalid row — the InfoButton's tooltip content. */
export const invalidMessages = (v: MilestoneValidation): string[] =>
  MILESTONE_KEYS.filter((k) => !v[k].valid).map((k) => v[k].text);

/**
 * Page lock — `con_Milestones_Page_LockMessage.Visible = IsBlank(project.'Project ID')`.
 * The whole screen is unusable until General Data has been saved once.
 */
export const isPageLocked = (p: MilestoneProject | null): boolean =>
  !p || isBlank(p.projectNumber);

/** The save gate: permission AND nothing invalid AND something dirty AND not locked. */
export function canSaveMilestones(args: {
  perms: { canCreate: boolean; canEdit: boolean };
  project: MilestoneProject | null;
  validation: MilestoneValidation;
  dirtyKeys: MilestoneKey[];
  locked?: boolean;
}): boolean {
  const permitted = args.project?.id ? args.perms.canEdit : args.perms.canCreate;
  if (!permitted) return false;
  if (args.locked ?? isPageLocked(args.project)) return false;
  if (invalidMessages(args.validation).length > 0) return false;
  return args.dirtyKeys.length > 0;
}

/* ═══════════════════════════════════════════════════════ recalculate buttons ════ */

/**
 * The `Milestones Standard Assumptions` row for the project's country + technology.
 * `Name = "average duration [months]"`.
 */
export const AVERAGE_DURATION_MONTHS = "average duration [months]";

export interface MilestoneAssumptionRow {
  cluster1: number | null;
  cluster2: number | null;
  cluster3: number | null;
  cluster4: number | null;
  cluster5: number | null;
  cluster6: number | null;
}

/** `fn_Common.DateAddMonths` = `DateAdd(candidate, Value(addition), TimeUnit.Months)`. */
export function deriveNextDate(from: string | null, months: number | null | undefined): string | null {
  if (isBlank(from) || months === null || months === undefined || Number.isNaN(months)) return null;
  return addMonths(from!, months).toISOString().slice(0, 10);
}

/**
 * Rule 10/11 — every date's recalculate button derives the NEXT date from the assumption
 * row and marks the derived date a standard assumption. A missing assumption row is a
 * no-op, not a crash.
 */
export function recalculateMilestone(
  form: MilestonesForm,
  target: Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate">,
  assumption: MilestoneAssumptionRow | null | undefined,
): MilestonesForm {
  const source: Partial<Record<MilestoneKey, {
    from: Exclude<MilestoneKey, "ShareOfFarmdown">;
    months: keyof MilestoneAssumptionRow;
  }>> = {
    FeasibilityStudies: { from: "StartDate", months: "cluster1" },
    ProjectDevelopmentStarted: { from: "FeasibilityStudies", months: "cluster1" },
    ApplicationSubmitted: { from: "ProjectDevelopmentStarted", months: "cluster2" },
    LegallyBindingPermits: { from: "ApplicationSubmitted", months: "cluster3" },
    FinalInvestmentDecision: { from: "LegallyBindingPermits", months: "cluster4" },
    Construction: { from: "FinalInvestmentDecision", months: "cluster5" },
    OperationsStartDate: { from: "Construction", months: "cluster6" },
  };
  const spec = source[target];
  if (!spec || !assumption) return form;
  const next = deriveNextDate(form.dates[spec.from], assumption[spec.months]);
  if (next === null) return form;
  return {
    ...form,
    dates: { ...form.dates, [target]: next },
    standardAssumption: { ...form.standardAssumption, [target]: true },
  };
}

/**
 * Rule 12 — editing a date by hand marks the row dirty and re-runs the validation pass.
 * Typing over a recalculated date clears its standard-assumption flag.
 */
export function editMilestone(
  form: MilestonesForm,
  key: Exclude<MilestoneKey, "ShareOfFarmdown">,
  value: string | null,
): MilestonesForm {
  return {
    ...form,
    dates: { ...form.dates, [key]: value },
    standardAssumption: { ...form.standardAssumption, [key]: false },
  };
}

/**
 * GUIDE p16 — the single most important finding on this screen: a date the app derived
 * from a cluster duration renders italic and blue; a date the user typed — including one
 * that started life derived and was then overwritten — renders plain. `editMilestone`
 * already clears `standardAssumption[key]` on every keystroke, so that flag alone is the
 * classification; Share of Farmdown carries the same idea under its own flag. This is
 * evaluated against the CURRENT form, not a fixed list of keys — in the p16 fixture below,
 * Cluster 1 and Cluster 3 both support standard-assumption tracking structurally but read
 * `false` because they were typed, which is exactly why they render plain there.
 */
export function isDerivedMilestone(
  key: MilestoneKey,
  form: Pick<MilestonesForm, "standardAssumption" | "isStandardShareOfFarmdown">,
): boolean {
  if (key === "ShareOfFarmdown") return form.isStandardShareOfFarmdown === true;
  return form.standardAssumption[key] === true;
}

export type DerivedFlags = Record<MilestoneKey, boolean>;

/** Every key's `isDerivedMilestone`, for `Screen.tsx` to read once per render. */
export function classifyDerivedMilestones(form: MilestonesForm): DerivedFlags {
  return Object.fromEntries(
    MILESTONE_KEYS.map((k) => [k, isDerivedMilestone(k, form)]),
  ) as DerivedFlags;
}

/**
 * GUIDE p15 — the small reset button beside Share of Farmdown. There is no assumption
 * table for it the way the date clusters have one; the only default the spec gives (rule
 * 5) is the flat 50 % `Coalesce`, so the reset restores that and re-marks the field a
 * standard assumption, exactly like a date's recalculate button would.
 */
export function resetShareOfFarmdown(): Pick<MilestonesForm, "shareOfFarmdown" | "isStandardShareOfFarmdown"> {
  return { shareOfFarmdown: "50", isStandardShareOfFarmdown: true };
}

/* ═════════════════════════════════════════════════════════ operational lifetime ════ */

/**
 * Power Fx `DateDiff(..., TimeUnit.Months)` counts MONTH BOUNDARIES crossed, not whole
 * elapsed months. `monthsBetween` in domain/dates floors by day, which is a different
 * answer, so the boundary version is implemented here.
 */
export function pfxMonthDiff(from: Date | string, to: Date | string): number {
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export interface OperationalLifetime {
  years: number;
  months: number;
  yearsText: string;
  monthsText: string;
  /** What the save writes: `$"{Years.Value} {Months.Value}"`. */
  text: string;
}

/**
 * Rule 14, exactly — including the `+1 day` before the month diff and the `Mod(…, 12)`.
 *   varMonth : DateDiff(DateTimeValue(COD), DateAdd(DateTimeValue(End), 1, Days), Months)
 *   varYears : Trunc(varMonth / 12)
 *   varMonthInYear : Mod(varMonth, 12)
 */
export function operationalLifetime(
  cod: string | null,
  endDate: string | null,
): OperationalLifetime {
  if (isBlank(cod) || isBlank(endDate)) {
    return { years: 0, months: 0, yearsText: "0 years", monthsText: "0 months", text: "0 years 0 months" };
  }
  const totalMonths = pfxMonthDiff(new Date(cod!), addDays(endDate!, 1));
  const years = Math.trunc(totalMonths / 12);
  const months = ((totalMonths % 12) + 12) % 12;
  const yearsText = `${years} ${years === 1 ? "year" : "years"}`;
  const monthsText = `${months} ${months === 1 ? "month" : "months"}`;
  return { years, months, yearsText, monthsText, text: `${yearsText} ${monthsText}` };
}

/* ═════════════════════════════════════════════════════ FID-driven re-pricing ════ */

export interface PriceInflationRow {
  fidYear: number;
  annualIndex: number | null;
  accumulatedIndex: number | null;
}

/**
 * Rule 13 —
 *   prev.'Accumulated Price Escalation Index'
 *   + (cur.'Accumulated Price Escalation Index' - prev.'Accumulated Price Escalation Index')
 *     * Month(FID) / 12
 */
export function accumulatedIndex(
  fid: string | null,
  current: PriceInflationRow | null | undefined,
  previous: PriceInflationRow | null | undefined,
): number {
  if (isBlank(fid) || !current || !previous) return 1;
  const prev = previous.accumulatedIndex ?? 0;
  const cur = current.accumulatedIndex ?? 0;
  // Power Fx `Month()` is 1-based.
  const month = new Date(fid!).getMonth() + 1;
  return prev + (cur - prev) * (month / 12);
}

export interface ProjectGenerator {
  id: string;
  count: number;
  /** `'1 WTG price'` .. `'5 WTG price'` — index 0 is the 1-WTG price. */
  wtgPrices: (number | null)[];
  additionalFoundationCost: number | null;
  foundationCostIncluded: boolean;
  generatorsCost: number;
}

/**
 * Rule 13's inner `ForAll` — cost per WTG comes from the 1..5-WTG price ladder (5 and
 * above all use the 5-WTG price), the additional foundation cost is added unless it is
 * already included, and the whole thing is scaled by the accumulated index.
 */
export function repriceGenerators(
  generators: ProjectGenerator[],
  index: number,
): ProjectGenerator[] {
  return generators.map((g) => {
    const rung = Math.min(Math.max(g.count, 1), 5) - 1;
    const net = g.wtgPrices[rung] ?? g.wtgPrices[g.wtgPrices.length - 1] ?? 0;
    const perWtg = g.foundationCostIncluded
      ? net * index
      : (net + (g.additionalFoundationCost ?? 0)) * index;
    return { ...g, generatorsCost: pfxRound(g.count * perWtg, 2) };
  });
}

/** `locNeedPlantCostsRecalculation: Not(project.'Final Investment Decision' = SelectedDate)`. */
export function needsPlantCostRecalculation(
  storedFid: string | null,
  selectedFid: string | null,
): boolean {
  return (time(storedFid) ?? null) !== (time(selectedFid) ?? null);
}

/** `'Plant WTG Cost [EUR]': Sum(colProjectGenerators, 'Generators Cost')`. */
export const plantWtgCost = (generators: ProjectGenerator[]): number =>
  pfxRound(generators.reduce((a, g) => a + (g.generatorsCost || 0), 0), 2);

/* ═══════════════════════════════════════════════════════════════ the COD guard ════ */

/**
 * Rule 16 — a COD change that would invalidate individual-volume revenue contracts opens
 * a warning instead of saving.
 */
export function codChangeBlocksSave(
  codDirty: boolean,
  codChanged: boolean,
  individualVolumeContractCount: number,
): boolean {
  return codDirty && codChanged && individualVolumeContractCount > 0;
}

/* ═════════════════════════════════════════════════════════════ milestone labels ════ */

export interface ProjectStateLabelRow {
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
  clusterDescription: string | null;
}

/**
 * Rule 3 — `Filter('Project States', Order > 0, 'Is Visible On Checklist')` projected to
 * `'Cluster Description'`.
 *
 * SOURCE DEFECT, corrected: the canvas sorts by `Text(Order)`, so an `Order` of 10 would
 * sort before 2. It has never bitten because the solution ships nine states, but it is a
 * latent bug at ten or more. This sorts numerically. The canvas ordering is not kept
 * reachable — a wrong sort has no legitimate use.
 */
export function milestoneLabels(states: ProjectStateLabelRow[]): string[] {
  return states
    .filter((s) => s.order > 0 && s.isVisibleOnChecklist)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => s.clusterDescription ?? s.name);
}

/* ═════════════════════════════════════════════════════ the default revenue seed ════ */

/** One row of `Assumptions Revenues SQL`. */
export interface RevenueAssumptionRow {
  country: string;
  valuetype: string;
  category: string | null;
  pv: string | null;
  wind: string | null;
}

export type RevenueLabel = "FiT" | "PPA";

/** Rule 22 — the 19-entry Italian region map. */
const ITALIAN_REGIONS: Record<string, string> = {
  Lazio: "Italy_Centre - South",
  Lombardia: "Italy_North",
  "Emilia Romagna": "Italy_North",
  Sicilia: "Italy_Sicily",
  // The source uses a typographic apostrophe here; both spellings are accepted.
  "Valle d’Aosta": "Italy_North",
  "Valle d'Aosta": "Italy_North",
  Veneto: "Italy_North",
  "Friuli Venezia Giulia": "Italy_North",
  Puglia: "Italy_South",
  Marche: "Italy_Centre - North",
  Molise: "Italy_South",
  Calabria: "Italy_Calabria",
  Abruzzo: "Italy_Centre - South",
  Piemonte: "Italy_North",
  Sardegna: "Italy_Sardinia",
  Toscana: "Italy_Centre - North",
  "Trentino Alto Adige": "Italy_North",
  Campania: "Italy_Centre - South",
  Liguria: "Italy_North",
  Basilicata: "Italy_South",
  Umbria: "Italy_Centre - South",
};

export function italianRegion(areaName: string | null | undefined): string | null {
  if (isBlank(areaName)) return null;
  return ITALIAN_REGIONS[areaName!.trim()] ?? null;
}

const pick = (row: RevenueAssumptionRow | undefined, technology: string | null): string | null => {
  if (!row) return null;
  return technology === "PV" ? row.pv : technology === "Wind" ? row.wind : null;
};

const find = (rows: RevenueAssumptionRow[], valuetype: string, category?: string) =>
  rows.find((r) => r.valuetype === valuetype && (category === undefined || r.category === category));

/**
 * Rule 21 — the contract type comes from the `valuetype = "revenuetype"` row.
 *
 * SOURCE DEFECT, preserved by default and flagged: the WIND branch reads
 * `recRevenueTypeRecordForCountry.pv`, not `.wind`, so a country whose PV revenue type
 * differs from its wind revenue type labels wind contracts wrongly. `fixWindDefect: true`
 * reads `.wind`. Do NOT flip the default until the product owner confirms intent — a
 * silent change here re-labels every seeded wind contract.
 */
export function revenueLabelFor(
  technology: string | null,
  row: RevenueAssumptionRow | undefined,
  opts: { fixWindDefect?: boolean } = {},
): RevenueLabel | null {
  if (!row) return null;
  const raw = technology === "PV" ? row.pv
    : technology === "Wind" ? (opts.fixWindDefect ? row.wind : row.pv)
    : null;
  if (raw === "fit") return "FiT";
  if (raw === "ppa") return "PPA";
  return null;
}

export interface SubContractSwitch {
  dependsOnReferenceDate: boolean;
  /** "FiT " / "CfD " / "PPA " — note the trailing space, which the source keeps. */
  typeAfterDecisionYear: string | null;
  decisionYearUp: number | null;
  /** The project date the switch is measured against. */
  referenceDate: string | null;
}

/**
 * Rule 24 — a contract type can flip based on a reference date. The reference milestone is
 * selected by `subcontract_type_reference_date`, defaulting to `operationstartdatecod`.
 */
export function subContractSwitch(
  rows: RevenueAssumptionRow[],
  technology: string | null,
  dates: MilestoneDates,
): SubContractSwitch {
  const changes = rows.filter((r) => r.valuetype === "change_revenuetype");
  const at = (category: string) =>
    pick(changes.find((r) => r.category === category), technology);

  const dependsOnReferenceDate = String(at("issubcontract_type_depending_on_reference_date")) === "true";
  const after = (at("subcontract_type_after_decision_year") ?? "").toLowerCase();
  const typeAfterDecisionYear =
    after === "fit" ? "FiT " : after === "cfd" ? "CfD " : after === "ppa" ? "PPA " : null;

  const yearRaw = at("subcontract_type_decision_year_up");
  const decisionYearUp = isBlank(yearRaw) ? null : Number(yearRaw);

  const refToken = at("subcontract_type_reference_date") ?? "operationstartdatecod";
  const REF: Record<string, keyof MilestoneDates> = {
    feasibilitystudies: "FeasibilityStudies",
    projectdevelopmentstarted: "ProjectDevelopmentStarted",
    applicationsubmitted: "ApplicationSubmitted",
    legallybindingpermits: "LegallyBindingPermits",
    construction: "Construction",
    finalinvestmentdecision: "FinalInvestmentDecision",
    operationstartdatecod: "OperationsStartDate",
  };

  return {
    dependsOnReferenceDate,
    typeAfterDecisionYear,
    decisionYearUp: decisionYearUp !== null && Number.isFinite(decisionYearUp) ? decisionYearUp : null,
    referenceDate: dependsOnReferenceDate ? dates[REF[refToken] ?? "OperationsStartDate"] : null,
  };
}

/** The type token actually used, after rule 24's reference-date switch. */
function effectiveTypeToken(
  base: string,
  sw: SubContractSwitch,
): string {
  if (!sw.dependsOnReferenceDate || sw.decisionYearUp === null || !sw.typeAfterDecisionYear) {
    return base;
  }
  const ref = time(sw.referenceDate);
  if (ref === null) return base;
  // DateDiff(reference, Date(decisionYearUp, 1, 1), Days) < 0 → the reference is later.
  return ref > new Date(sw.decisionYearUp, 0, 1).getTime() ? sw.typeAfterDecisionYear : base;
}

/** Rules 22 and 23 — the contract description. */
export function describeRevenue(args: {
  countryName: string | null;
  areaName: string | null;
  revenueLabel: RevenueLabel;
  sub?: SubContractSwitch;
}): string {
  const sw = args.sub ?? {
    dependsOnReferenceDate: false, typeAfterDecisionYear: null,
    decisionYearUp: null, referenceDate: null,
  };
  const region = args.countryName === "Italy" ? italianRegion(args.areaName) : null;

  if (region) {
    // "Standard " & <type> & " Italy - " & Substitute(region, "Italy_", "")
    const token = effectiveTypeToken(args.revenueLabel, sw).trim();
    return `Standard ${token} Italy - ${region.replace("Italy_", "")}`;
  }

  const base =
    args.countryName === "Germany" && args.revenueLabel === "FiT" ? "EEG "
    : args.countryName === "France" && args.revenueLabel === "FiT" ? "CfD "
    : `${args.revenueLabel} `;
  return `Standard ${effectiveTypeToken(base, sw)}${args.countryName ?? ""}`;
}

/**
 * Rule 25 — `'Contract End Date'` =
 * `DateAdd(DateAdd(DateAdd(start, years, Years), months, Months), -1, Days)`.
 */
export function contractDates(
  cod: string | null,
  years: number | null,
  months: number | null,
): { start: string | null; end: string | null } {
  if (isBlank(cod)) return { start: null, end: null };
  const start = cod!;
  const afterYears = addYears(start, years ?? 0);
  const afterMonths = addMonths(afterYears, months ?? 0);
  return { start, end: addDays(afterMonths, -1).toISOString().slice(0, 10) };
}

/**
 * Rule 26 — the `valuetype = "price"` row whose `category` equals `Text(Year(COD))`; if
 * none, clamp to the first/last row, otherwise pick the nearest year.
 *
 * SOURCE DEFECT, corrected: the canvas's clamp compares the COD YEAR to the PRICE
 * (`Value(recYear) < Value(First(recFilteredPrices).pv)`) and its nearest-match sorts on
 * `Abs(Value(pv) - Value(year))` — both compare a price to a year, which is meaningless.
 * This implementation clamps and matches on the row's `category` year, which is what the
 * comment above the block describes. The canvas behaviour is NOT kept reachable: it
 * produces an arbitrary row and no caller could want it.
 */
export function pickPrice(
  rows: RevenueAssumptionRow[],
  technology: string | null,
  codYear: number,
): number | null {
  const prices = rows.filter((r) => r.valuetype === "price");
  if (prices.length === 0) return null;

  const exact = prices.find((r) => r.category === String(codYear));
  if (exact) {
    const v = Number(pick(exact, technology));
    return Number.isFinite(v) ? v : null;
  }

  const withYear = prices
    .map((r) => ({ row: r, year: Number(r.category) }))
    .filter((x) => Number.isFinite(x.year))
    .sort((a, b) => a.year - b.year);
  if (withYear.length === 0) return null;

  const target =
    codYear < withYear[0].year ? withYear[0]
    : codYear > withYear[withYear.length - 1].year ? withYear[withYear.length - 1]
    : withYear.reduce((best, x) =>
        Math.abs(x.year - codYear) < Math.abs(best.year - codYear) ? x : best);

  const v = Number(pick(target.row, technology));
  return Number.isFinite(v) ? v : null;
}

export interface InflationSettings {
  useInflation: boolean;
  useCountryInflation: boolean;
  customProfile: number;
  startYear: number | null;
}

/** Rule 28 — the `valuetype = "inflation"` rows. */
export function inflationSettings(
  rows: RevenueAssumptionRow[],
  technology: string | null,
  dates: MilestoneDates,
): InflationSettings {
  const inflation = rows.filter((r) => r.valuetype === "inflation");
  const at = (category: string) =>
    pick(inflation.find((r) => r.category === category), technology);

  const yearOf = (d: string | null): number | null =>
    isBlank(d) ? null : new Date(d!).getFullYear();

  const token = at("inflationstartyear");
  const startYear =
    token === "operationstartdatecod" ? yearOf(dates.OperationsStartDate)
    : token === "finalinvestmentdecision" ? yearOf(dates.FinalInvestmentDecision)
    : token === "construction" ? yearOf(dates.Construction)
    : token === "legallybindingpermits" ? yearOf(dates.LegallyBindingPermits)
    : null;

  const custom = Number(at("inflationprofile"));

  return {
    useInflation: at("useinflation") === "true",
    useCountryInflation: at("usecountryinflation") === "true",
    customProfile: Number.isFinite(custom) ? custom : 0,
    startYear,
  };
}

export interface RevenueSeedContext {
  project: MilestoneProject;
  dates: MilestoneDates;
  /** Rows of `Assumptions Revenues SQL` for this project's country. */
  assumptions: RevenueAssumptionRow[];
  existingRevenueCount: number;
  currencyId: string | null;
  subaccountId: string | null;
  owningBusinessUnitId: string | null;
  fixWindDefect?: boolean;
}

export interface ProjectRevenueDraft {
  data: Record<string, unknown>;
  /** Exposed so the tests can assert the derived values without reading logical names. */
  derived: {
    label: RevenueLabel;
    description: string;
    price: number | null;
    biddingPrice: number;
    correctionFactor: number;
    contractStart: string | null;
    contractEnd: string | null;
    inflation: InflationSettings;
  };
}

const REVENUE_COL = {
  name: "vsb_name",
  label: "vsb_label",
  description: "vsb_description",
  biddingPrice: "vsb_biddingprice",
  tariffPrice: "vsb_tariffprice",
  tariffPriceP90: "vsb_tariffpricep90",
  correctionFactor: "vsb_correctionfactor",
  correctionFactorP90: "vsb_correctionfactorp90",
  contractStartDate: "vsb_contractstartdate",
  contractEndDate: "vsb_contractenddate",
  contractDurationYears: "vsb_contractdurationyears",
  contractDurationMonths: "vsb_contractdurationmonths",
  useInflationProfile: "vsb_useinflationprofile",
  useCountryInflationProfile: "vsb_usecountryinflationprofile",
  inflationProfile: "vsb_inflationprofile",
  hedgedVolume: "vsb_hedgedvolume",
  inflationStartYear: "vsb_inflationstartyear",
  isBiddingPriceStd: "vsb_isbiddingpricestandardassumption",
  isCorrectionFactorStd: "vsb_iscorrectionfactorstandardassumption",
  isCorrectionFactorP90Std: "vsb_iscorrectionfactorp90standardassumption",
  isContractDurationYearsStd: "vsb_iscontractdurationyearsstandardassumption",
  isContractDurationMonthsStd: "vsb_iscontractdurationmonthsstandardassumption",
  isContractStartDateStd: "vsb_iscontractstartdatestandardassumption",
  isContractEndDateStd: "vsb_iscontractenddatestandardassumption",
  isTariffPriceStd: "vsb_istariffpricestandardassumption",
  isTariffPriceP90Std: "vsb_istariffpricep90standardassumption",
  isUseInflationProfileStd: "vsb_isuseinflationprofilestandardassumption",
  isUseCustomInflationStd: "vsb_isusecustominflationstandardassumption",
  isInflationProfileYearStd: "vsb_isinflationprofileyearstandardassumption",
  isHedgedVolumeStd: "vsb_ishedgedvolumestandardassumption",
  isCustomInflationProfileStd: "vsb_iscustominflationprofilestandardassumption",
  negativePriceManualOverride: "vsb_negativepricemanualoverride",
} as const;

/**
 * Rules 20–28 as ONE pure function: the whole ~600-line default `Project Revenues` seed.
 *
 * Returns `null` — meaning "seed nothing" — when the project is not in Draft or Cluster 1,
 * when revenue rows already exist, or when the country/technology combination has no
 * revenue type at all.
 */
export function buildDefaultRevenue(ctx: RevenueSeedContext): ProjectRevenueDraft | null {
  const { project, dates, assumptions } = ctx;

  // Rule 20 — the gate.
  if (!["Draft", "Cluster 1"].includes(project.clusterStateName ?? "")) return null;
  if (ctx.existingRevenueCount !== 0) return null;

  const label = revenueLabelFor(
    project.technology,
    find(assumptions, "revenuetype"),
    { fixWindDefect: ctx.fixWindDefect },
  );
  if (!label) return null;

  const sub = subContractSwitch(assumptions, project.technology, dates);
  const description = describeRevenue({
    countryName: project.countryName,
    areaName: project.areaName,
    revenueLabel: label,
    sub,
  });

  const numAt = (valuetype: string): number | null => {
    const v = Number(pick(find(assumptions, valuetype), project.technology));
    return Number.isFinite(v) ? v : null;
  };
  const years = numAt("contractdurationyear");
  const months = numAt("contractdurationmonth");
  const hedgedVolume = numAt("hedgedvolume");

  const cod = dates.OperationsStartDate;
  const { start, end } = contractDates(cod, years, months);
  const price = isBlank(cod)
    ? null
    : pickPrice(assumptions, project.technology, new Date(cod!).getFullYear());

  // Rule 27 — German FiT non-PV contracts get the bidding price and correction factor 1.
  const germanFitNonPv =
    project.countryName === "Germany" && label === "FiT" && project.technology !== "PV";
  // The p90 variants test `= Wind`, not `<> PV`. Not the same thing for Hybrid/Storage.
  const germanFitWind =
    project.countryName === "Germany" && label === "FiT" && project.technology === "Wind";

  const inflation = inflationSettings(assumptions, project.technology, dates);

  const data: Record<string, unknown> = {
    [REVENUE_COL.name]: revenueContractName(project, label, description),
    [REVENUE_COL.label]: label === "FiT" ? CHOICE.revenueLabel.fit : CHOICE.revenueLabel.ppa,
    [REVENUE_COL.description]: description,
    [REVENUE_COL.biddingPrice]: germanFitNonPv ? price ?? 0 : 0,
    [REVENUE_COL.tariffPrice]: price ?? 0,
    [REVENUE_COL.tariffPriceP90]: price ?? 0,
    [REVENUE_COL.correctionFactor]: germanFitNonPv ? 1.0 : 0,
    [REVENUE_COL.correctionFactorP90]: germanFitWind ? 1.0 : 0,
    [REVENUE_COL.contractStartDate]: start,
    [REVENUE_COL.contractEndDate]: end,
    [REVENUE_COL.contractDurationYears]: years,
    [REVENUE_COL.contractDurationMonths]: months,
    [REVENUE_COL.useInflationProfile]: inflation.useInflation,
    [REVENUE_COL.useCountryInflationProfile]: inflation.useCountryInflation,
    [REVENUE_COL.inflationProfile]: inflation.customProfile,
    [REVENUE_COL.hedgedVolume]: hedgedVolume,
    [REVENUE_COL.inflationStartYear]: inflation.startYear,
    [REVENUE_COL.isBiddingPriceStd]: germanFitNonPv,
    [REVENUE_COL.isCorrectionFactorStd]: germanFitNonPv,
    [REVENUE_COL.isCorrectionFactorP90Std]: germanFitWind,
    [REVENUE_COL.isContractDurationYearsStd]: true,
    [REVENUE_COL.isContractDurationMonthsStd]: true,
    [REVENUE_COL.isContractStartDateStd]: true,
    [REVENUE_COL.isContractEndDateStd]: true,
    [REVENUE_COL.isTariffPriceStd]: true,
    [REVENUE_COL.isTariffPriceP90Std]: true,
    [REVENUE_COL.isUseInflationProfileStd]: true,
    [REVENUE_COL.isUseCustomInflationStd]: true,
    [REVENUE_COL.isInflationProfileYearStd]: true,
    [REVENUE_COL.isHedgedVolumeStd]: true,
    [REVENUE_COL.isCustomInflationProfileStd]: true,
    [REVENUE_COL.negativePriceManualOverride]: false,
    ...bind("vsb_Project", ES.projects, project.id),
    ...bind("vsb_Currency", ES.currencies, ctx.currencyId),
    ...bind("vsb_Subaccount", ES.revenueSubaccounts, ctx.subaccountId),
    "owningbusinessunit@odata.bind": ctx.owningBusinessUnitId
      ? `/businessunits(${ctx.owningBusinessUnitId})` : null,
  };

  return {
    data,
    derived: {
      label,
      description,
      price,
      biddingPrice: germanFitNonPv ? price ?? 0 : 0,
      correctionFactor: germanFitNonPv ? 1.0 : 0,
      contractStart: start,
      contractEnd: end,
      inflation,
    },
  };
}

/** `Name: project.'Project Name' & "-" & Text(revenueType) & "-" & description`. */
export const revenueContractName = (
  p: MilestoneProject, label: RevenueLabel, description: string,
): string => `${p.name ?? ""}-${label}-${description}`;

/* ═══════════════════════════════════════════════════════════ the save plan ════ */

export interface MilestoneSaveStep {
  kind: "patch-project" | "reprice-generators" | "seed-revenue";
  log: string | null;
  writes: WriteOp[];
}

export interface MilestoneSavePlan {
  steps: MilestoneSaveStep[];
  writes: WriteOp[];
  log: string[];
}

export interface MilestoneSaveContext {
  project: MilestoneProject;
  form: MilestonesForm;
  /** Set when the FID moved and the generators were re-priced. */
  repricedGenerators: ProjectGenerator[] | null;
  revenueDraft: ProjectRevenueDraft | null;
  language: Lang;
}

/**
 * `btn_Project_Milestone_Save.OnSelect` as an ordered list of write operations.
 *
 * Rule 17 — the save blanks the milestones the start cluster skips, exactly as General
 * Data's cluster panel does; that rule is imported from `general-data/rules` rather than
 * written twice.
 * Rule 18 — `'Besitzer (Unternehmenseinheit)'` is re-stamped on every milestone save.
 */
export function planSaveMilestones(ctx: MilestoneSaveContext): MilestoneSavePlan {
  const { project, form } = ctx;
  const n = startClusterNo(project.startCluster);
  const dates = form.dates;
  const steps: MilestoneSaveStep[] = [];

  const flag = (k: MilestoneKey) => form.standardAssumption[k] ?? false;
  const lifetime = operationalLifetime(dates.OperationsStartDate, dates.EndDate);
  const farmdown = parseNumber(form.shareOfFarmdown, ctx.language);

  const data: Record<string, unknown> = {
    // Rule 17 — start-cluster-skipped milestones and their flags.
    ...clearSkippedMilestones({
      startDate: dates.StartDate,
      cluster1: dates.FeasibilityStudies,
      cluster2: dates.ProjectDevelopmentStarted,
      cluster3: dates.ApplicationSubmitted,
      cluster4: dates.LegallyBindingPermits,
    }, n),

    [PROJECT_COL.fid]: dates.FinalInvestmentDecision,
    [PROJECT_COL.construction]: dates.Construction,
    [PROJECT_COL.cod]: dates.OperationsStartDate,
    [PROJECT_COL.endDate]: dates.EndDate,
    [PROJECT_COL.salesStartDate]: dates.SalesStartDate,
    [PROJECT_COL.salesCompleted]: dates.StartCompleted,

    // The three thresholded flags are already handled by clearSkippedMilestones; these
    // set them where the threshold was NOT reached.
    ...(n >= 3 ? {} : { [PROJECT_COL.isProjectDevelopmentStd]: flag("ProjectDevelopmentStarted") }),
    ...(n >= 4 ? {} : { [PROJECT_COL.isApplicationSubmittedStd]: flag("ApplicationSubmitted") }),
    ...(n >= 5 ? {} : { [PROJECT_COL.isLegallyBindingPermitsStd]: flag("LegallyBindingPermits") }),

    [PROJECT_COL.isFidStd]: flag("FinalInvestmentDecision"),
    [PROJECT_COL.isConstructionStd]: flag("Construction"),
    [PROJECT_COL.isCodStd]: flag("OperationsStartDate"),
    [PROJECT_COL.isEndDateStd]: flag("EndDate"),
    [PROJECT_COL.isSalesStartStd]: flag("SalesStartDate"),
    [PROJECT_COL.isSalesCompletedStd]: flag("StartCompleted"),

    // Rule 14 — saved as the concatenated string, not two numbers.
    [PROJECT_COL.operationalLifetime]: lifetime.text,
    [PROJECT_COL.shareOfFarmdown]: Number.isNaN(farmdown) ? null : farmdown,
    [PROJECT_COL.isStandardShareOfFarmdown]: form.isStandardShareOfFarmdown,
    // Rule 18.
    "owningbusinessunit@odata.bind": project.countryBusinessUnitId
      ? `/businessunits(${project.countryBusinessUnitId})` : null,
  };

  // Rule 13's result — the plant cost rides along with the same patch rather than a
  // second sequential Patch(Projects, ...) as the canvas does.
  if (ctx.repricedGenerators) {
    data[PROJECT_COL.plantWtgCost] = plantWtgCost(ctx.repricedGenerators);
  }
  steps.push({
    kind: "patch-project",
    log: "Project data was saved/updated successfully.",
    writes: [{ op: "update", entitySet: ES.projects, id: project.id!, data }],
  });

  if (ctx.repricedGenerators) {
    steps.push({
      kind: "reprice-generators",
      log: `Plant WTG Cost (WTG's: ${ctx.repricedGenerators.length}), was recalculated and updated successfully.`,
      writes: ctx.repricedGenerators.map((g) => ({
        op: "update" as const,
        entitySet: ES.generatorTypeInProjects,
        id: g.id,
        data: { vsb_totalcosteur: g.generatorsCost },
      })),
    });
  }

  if (ctx.revenueDraft) {
    steps.push({
      kind: "seed-revenue",
      log: "A default revenue contract was created.",
      writes: [{ op: "create", entitySet: ES.projectRevenues, data: ctx.revenueDraft.data }],
    });
  }

  return {
    steps,
    writes: steps.flatMap((s) => s.writes),
    log: steps.map((s) => s.log).filter((l): l is string => l !== null),
  };
}

/** Rule 19 — after a successful patch every validation row resets to valid and clean. */
export const resetValidationAfterSave = (): MilestoneKey[] => [];

/**
 * The leave guard —
 * `If(CountRows(Filter(colMilestonesFormValidation, Dirty = true)) > 0,
 *     UpdateContext({locLeaveMilestonesConfirmationDialog: true}), <navigate>)`.
 */
export const shouldConfirmLeave = (dirtyKeys: MilestoneKey[]): boolean => dirtyKeys.length > 0;
