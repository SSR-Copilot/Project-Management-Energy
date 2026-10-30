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
 *
 * Connected 19 Oct 2026 (D26). The SOURCE DEFECTs corrected on that pass, each with its canvas
 * twin where behaviour or numbers are involved (`…CanvasParity`):
 *  - `recalculateMilestone`: Cluster 5 / Cluster 6 read the wrong duration columns, and the End
 *    Date, Sales Start and Sales Completion buttons did nothing (code defects, not canvas ones);
 *    a missing assumption row copies the predecessor date in the canvas — here it is a no-op.
 *  - `needsPlantCostRecalculation`: the canvas re-prices the generators only when the FID is
 *    TYPED, never when the FID CalendarAdd button sets it.
 *  - `accumulatedIndex`: a missing `Estimation Price Inflations` row gives index 0 in the canvas
 *    (every generator cost becomes 0); here re-pricing is skipped instead.
 *  - `cancelMilestones`: the canvas Cancel keeps every row Dirty and keeps the typed farmdown.
 */
import {
  parseNumber, isTwoDecimal, inRange, isBlank, pfxRound, decimalSeparator, type Lang,
} from "@/domain/powerFxNumeric";
import { addDays, addMonths, addYears } from "@/domain/dates";
import { foundationCostAdded, foundationCostAddedBooleanReading } from "@/domain/foundationCost";
import { dateFormat } from "@/domain/locale";
import { ES, CHOICE, CHOICE_FINANCE } from "@/data/dataverseNames";
import { dateOnly } from "@/data/odata";
import type { PlannedWrite, WritePlan } from "@/data/writePlan";
import type { MilestoneAssumptionValues } from "@/data/costBook";
import {
  PROJECT_COL, bind, clearSkippedMilestones, startClusterNo, formatAuditStamp,
} from "@/features/pm/general-data/rules";

/**
 * Rule 17 is the SAME RULE as General Data's cluster-change panel (rule 29), so it is
 * defined once there and re-exported here. Both screens blank the milestones the start
 * cluster skips and clear their standard-assumption flags at the same thresholds.
 */
export { clearSkippedMilestones, startClusterNo, formatAuditStamp };

/**
 * The canvas save's `Patch('Fabric Sync Jobs', …, {'Job Status': Dirty, 'Job Type': "Project
 * Milestones changed"})` and its `'ForaProjecttriggerFabricDEVEX/CAPEXrecalculation'.Run(...)`
 * are inside a `/* … *\/` block (Y:475-501): the canvas never runs them, so neither does this
 * app (D26). The flow is also missing from the solution export. Restoring it is a product
 * decision; if restored, insert the `Fabric Sync Jobs` row and let the server pick it up.
 */
export const FABRIC_SYNC_NOTE =
  "Not ported: the canvas Fabric Sync Jobs insert and ForaProjecttriggerFabricDEVEX/CAPEXrecalculation "
  + "call are commented out (Y:475-501), so a milestone save starts no Fabric recalculation (D26).";

/* ═══════════════════════════════════════════════════════ pinned option values ════ */

/** `'Hedging Type'.'Individual Volumes'` — `vsb_hedgetype` (pinned to the generated enum). */
export const HEDGE_TYPE_INDIVIDUAL_VOLUMES = CHOICE_FINANCE.hedgingType.individualVolumes;

/** `'Job States'.'In Progress'` / `.Importing` — `vsb_jobstatuscode` (pinned to the generated enum). */
export const FABRIC_JOB_STATUS = { inProgress: 952850002, importing: 952850006 } as const;

/** `'Job Type'.Name = "Project Milestones changed"` (`Icon3.Visible`, Y:4180-4191). */
export const FABRIC_JOB_TYPE_MILESTONES = "Project Milestones changed";

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
  /**
   * The `Text` column of `colMilestonesFormValidation`, verbatim from
   * `btn_Milestones_DisplayProject_Body_Buttons_Reset_Validation.OnSelect` (Y:4201-4342) —
   * what the "Required fields" InfoButton lists. CORRECTED (D26): this held the field-label
   * copy ("The date needs to be later than …"), which is `MILESTONE_FIELD_ERROR`, not this.
   */
  text: string;
}

export const MILESTONE_CHAIN: MilestoneMeta[] = [
  // The cluster captions are `Index(locRecordMilestoneNames, n).vsb_clusterdescription` on the
  // canvas; these are only the fallbacks until `Project States` has loaded (GUIDE p15/p16).
  { key: "StartDate", label: "Project Start", projectField: PROJECT_COL.projectStartDate,
    startClusterThreshold: 1, text: "Check input for Project Start date." },
  { key: "FeasibilityStudies", label: "Cluster 1: Feasibility Studies",
    projectField: PROJECT_COL.feasibilityStudies, startClusterThreshold: 2,
    previousKey: "StartDate", text: "Check input for Cluster 1 date." },
  { key: "ProjectDevelopmentStarted", label: "Cluster 2: Pre-Permitting",
    projectField: PROJECT_COL.projectDevelopmentStarted,
    standardFlagField: PROJECT_COL.isProjectDevelopmentStd, startClusterThreshold: 3,
    previousKey: "FeasibilityStudies", text: "Check input for Cluster 2 date." },
  { key: "ApplicationSubmitted", label: "Cluster 3: Permitting",
    projectField: PROJECT_COL.applicationSubmitted,
    standardFlagField: PROJECT_COL.isApplicationSubmittedStd, startClusterThreshold: 4,
    previousKey: "ProjectDevelopmentStarted", text: "Check input for Cluster 3 date." },
  { key: "LegallyBindingPermits", label: "Cluster 4: Pre-Construction",
    projectField: PROJECT_COL.legallyBindingPermits,
    standardFlagField: PROJECT_COL.isLegallyBindingPermitsStd, startClusterThreshold: 5,
    previousKey: "ApplicationSubmitted", text: "Check input for Cluster 4 date." },
  { key: "FinalInvestmentDecision", label: "Final Investment Decision",
    projectField: PROJECT_COL.fid, standardFlagField: PROJECT_COL.isFidStd,
    previousKey: "LegallyBindingPermits", text: "Check input for Final Investment Decision date." },
  { key: "Construction", label: "Cluster 5: Construction", projectField: PROJECT_COL.construction,
    standardFlagField: PROJECT_COL.isConstructionStd, previousKey: "FinalInvestmentDecision",
    text: "Check input for Cluster 5 date." },
  // "Date" with a capital D — verbatim (Y:4300).
  { key: "OperationsStartDate", label: "Cluster 6: Operation",
    projectField: PROJECT_COL.cod, standardFlagField: PROJECT_COL.isCodStd,
    previousKey: "Construction", text: "Check input for Cluster 6 Date." },
  { key: "EndDate", label: "Project End Date", projectField: PROJECT_COL.endDate,
    standardFlagField: PROJECT_COL.isEndDateStd, previousKey: "OperationsStartDate",
    text: "Check input for End Date." },
  { key: "SalesStartDate", label: "Sales Start Date", projectField: PROJECT_COL.salesStartDate,
    standardFlagField: PROJECT_COL.isSalesStartStd, text: "Check input for Sales Start Date." },
  { key: "StartCompleted", label: "Sales Completion Date", projectField: PROJECT_COL.salesCompleted,
    standardFlagField: PROJECT_COL.isSalesCompletedStd, text: "Check input for Sales Completion Date." },
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
  /** The technology LABEL ("Wind", "PV" …) — the rules compare labels. */
  technology: string | null;
  /** The `vsb_technology` option value — what the assumption lookup filters on. */
  technologyValue: number | null;
  startCluster: number | null;
  acquisitionDate: string | null;
  shareOfFarmdown: number | null;
  isStandardShareOfFarmdown: boolean | null;
  dates: MilestoneDates;
  standardAssumption: StandardAssumptionFlags;
  /** The footer: `'Erstellt von'.'Full Name'`, `'Erstellt am'`, `'Geändert von'`, `'Geändert am'`. */
  createdByName: string | null;
  createdOn: string | null;
  modifiedByName: string | null;
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

/**
 * Rule 5 — `locShareOfFarmdown: Coalesce(project.'Share of Farmdown', 50)`, shown through
 * `txt_…_Share_of_Farmdown.Value: Text(locShareOfFarmdown, "##0.0")` (Y:3544).
 * CORRECTED (D26): the value was shown unformatted ("50" instead of "50.0").
 */
export function initialForm(p: MilestoneProject, language: Lang = "en-US"): MilestonesForm {
  return {
    dates: initialDates(p),
    standardAssumption: { ...p.standardAssumption },
    shareOfFarmdown: formatFarmdown(p.shareOfFarmdown ?? 50, language),
    isStandardShareOfFarmdown: p.isStandardShareOfFarmdown ?? true,
  };
}

/** `Text(value, "##0.0")` — one decimal, no grouping, the user's decimal separator. */
export function formatFarmdown(value: number, language: Lang = "en-US"): string {
  const text = pfxRound(value, 1).toFixed(1);
  return decimalSeparator(language) === "," ? text.replace(".", ",") : text;
}

/**
 * The Cancel button — `pcf_btn_…_Buttons_Reset.OnChange` (Y:4842-4916).
 *
 * SOURCE DEFECT, corrected (D26): the canvas restores the stored dates and the nine flags but
 * keeps the typed Share of Farmdown and leaves every validation row `Dirty`, so Save and Cancel
 * stay enabled after a Cancel and the farmdown edit survives it. Here Cancel returns the whole
 * form to the state the page opened with, and nothing is dirty. `cancelMilestonesCanvasParity`
 * is what the canvas does.
 */
export function cancelMilestones(p: MilestoneProject, language: Lang = "en-US"): {
  form: MilestonesForm; dirtyKeys: MilestoneKey[];
} {
  return { form: initialForm(p, language), dirtyKeys: [] };
}

export function cancelMilestonesCanvasParity(
  p: MilestoneProject, current: MilestonesForm, dirtyKeys: MilestoneKey[],
): { form: MilestonesForm; dirtyKeys: MilestoneKey[] } {
  return {
    // The stored dates — without the acquisition-date default `OnVisible` applies.
    form: { ...current, dates: { ...p.dates }, standardAssumption: { ...p.standardAssumption } },
    dirtyKeys,
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
 * `ibtn_GeneralData_DisplayProject_Body_Buttons_Requered_Fileds_1.Content` —
 * `Concat(colMilestonesFormValidation, If(Not(Valid), Text & Char(10), ""))`.
 */
export const requiredFieldsContent = (v: MilestoneValidation): string =>
  invalidMessages(v).map((t) => `${t}\n`).join("");

/**
 * `lbl_…_<Field>_ErrorMessage.Visible` (Y:1630-3804), which is NOT the validation row: the label
 * hides while the predecessor is blank (Power Fx `date <= Blank()` is false, `date > Blank()` is
 * true), and the Cluster 1–4 labels hide once the start cluster passes them. Sales Start has no
 * error label.
 */
export function isMilestoneFieldErrorVisible(
  key: Exclude<MilestoneKey, "ShareOfFarmdown">,
  dates: MilestoneDates,
  startCluster: number | null | undefined,
): boolean {
  const n = startClusterNo(startCluster ?? 0);
  const blank = (k: Exclude<MilestoneKey, "ShareOfFarmdown">) => isBlank(dates[k]);
  /** `a <= b` with Power Fx blank semantics: false when b is blank. */
  const le = (a: Exclude<MilestoneKey, "ShareOfFarmdown">, b: Exclude<MilestoneKey, "ShareOfFarmdown">) => {
    const x = time(dates[a]), y = time(dates[b]);
    return x !== null && y !== null && x <= y;
  };
  /** `a > b` with Power Fx blank semantics: true when b is blank. */
  const gt = (a: Exclude<MilestoneKey, "ShareOfFarmdown">, b: Exclude<MilestoneKey, "ShareOfFarmdown">) => {
    const x = time(dates[a]), y = time(dates[b]);
    return x !== null && (y === null || x > y);
  };
  switch (key) {
    case "StartDate": return n === 0 && blank("StartDate");
    case "FeasibilityStudies":
      return n <= 1 && (blank("FeasibilityStudies") || (n === 0 && le("FeasibilityStudies", "StartDate")));
    case "ProjectDevelopmentStarted":
      return n <= 2 && (blank("ProjectDevelopmentStarted")
        || (n < 2 && le("ProjectDevelopmentStarted", "FeasibilityStudies")));
    case "ApplicationSubmitted":
      return n <= 3 && (blank("ApplicationSubmitted")
        || (n < 3 && le("ApplicationSubmitted", "ProjectDevelopmentStarted")));
    case "LegallyBindingPermits":
      return n <= 4 && (blank("LegallyBindingPermits")
        || (n < 4 && le("LegallyBindingPermits", "ApplicationSubmitted")));
    case "FinalInvestmentDecision":
      return blank("FinalInvestmentDecision")
        || (n <= 4 && le("FinalInvestmentDecision", "LegallyBindingPermits"));
    case "Construction": return blank("Construction") || le("Construction", "FinalInvestmentDecision");
    case "OperationsStartDate":
      return blank("OperationsStartDate") || le("OperationsStartDate", "Construction");
    case "EndDate": return !gt("EndDate", "OperationsStartDate");
    case "StartCompleted": return !gt("StartCompleted", "SalesStartDate");
    case "SalesStartDate": return false;
  }
}

/** Same calendar instant, blank-safe — `stored = selected` in the canvas. */
export const sameDate = (a: string | null | undefined, b: string | null | undefined): boolean =>
  time(a) === time(b);

/**
 * The `Dirty` column after a change. Every date `OnChange` and every CalendarAdd button sets
 * `Dirty: true`; the FID picker alone sets `Dirty: Not(stored FID = SelectedDate)` (Y:2335), so
 * typing the stored FID back clears its row.
 */
export function nextDirtyKeys(
  dirtyKeys: MilestoneKey[],
  key: MilestoneKey,
  change: { via: "edit" | "recalculate"; storedFid?: string | null; value?: string | null },
): MilestoneKey[] {
  const dirty = key === "FinalInvestmentDecision" && change.via === "edit"
    ? !sameDate(change.storedFid, change.value)
    : true;
  if (dirty) return dirtyKeys.includes(key) ? dirtyKeys : [...dirtyKeys, key];
  return dirtyKeys.filter((k) => k !== key);
}

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

/**
 * The `"average duration [months]"` row's columns (`data/costBook.ts`
 * `loadMilestoneAssumptionValues`). CORRECTED (D26): the type named a `vsb_cluster6` column
 * that does not exist and lacked `'Final Investment Decision'`, `'Operational Lifetime'`,
 * `'Sales Start'` and `'Sales End'`.
 */
export type MilestoneAssumptionRow = MilestoneAssumptionValues;

/**
 * `fn_Common.DateAddMonths` = `DateAdd(candidate, Value(addition), TimeUnit.Months)`, formatted
 * from LOCAL parts (CONVENTIONS rule 18; it was `toISOString().slice(0, 10)`). `DateAdd` takes
 * whole months, as General Data's `applyCalendarAdd` does.
 */
export function deriveNextDate(from: string | null, months: number | null | undefined): string | null {
  if (isBlank(from) || months === null || months === undefined || Number.isNaN(months)) return null;
  return dateOnly(addMonths(localDay(from!), Math.trunc(months)));
}

/** A `YYYY-MM-DD` value as LOCAL midnight (`new Date("YYYY-MM-DD")` is UTC midnight). */
function localDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

export type RecalcKey = Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate" | "FeasibilityStudies">;

/**
 * Which date and which assumption column each CalendarAdd button reads — `but_…_<seg>.OnSelect`:
 * Cluster 2 ← Cluster 1 + 'Cluster 1' (Y:1808), Cluster 3 ← Cluster 2 + 'Cluster 2' (Y:1978),
 * Cluster 4 ← Cluster 3 + 'Cluster 3' (Y:2198), FID ← Cluster 4 + 'Cluster 4' (Y:2504),
 * Cluster 5 ← FID + 'Final Investment Decision' (Y:2647), Cluster 6 ← Cluster 5 + 'Cluster 5'
 * (Y:2816), Sales Start ← Cluster 4 + 'Sales Start' (Y:3066), Sales Completion ← FID +
 * 'Sales End' (Y:3232), End Date ← Cluster 6 + Coalesce('Operational Lifetime', 30*12) − 1 day
 * (Y:3849). Cluster 1 has no button.
 *
 * CORRECTED (D26): Cluster 5 / Cluster 6 read `cluster5` / a non-existent `cluster6`, and the
 * End Date, Sales Start and Sales Completion buttons had no entry, so they did nothing.
 */
export const RECALC_SOURCE: Record<RecalcKey, {
  from: Exclude<MilestoneKey, "ShareOfFarmdown">;
  months: keyof MilestoneAssumptionRow;
}> = {
  ProjectDevelopmentStarted: { from: "FeasibilityStudies", months: "cluster1" },
  ApplicationSubmitted: { from: "ProjectDevelopmentStarted", months: "cluster2" },
  LegallyBindingPermits: { from: "ApplicationSubmitted", months: "cluster3" },
  FinalInvestmentDecision: { from: "LegallyBindingPermits", months: "cluster4" },
  Construction: { from: "FinalInvestmentDecision", months: "finalInvestmentDecision" },
  OperationsStartDate: { from: "Construction", months: "cluster5" },
  EndDate: { from: "OperationsStartDate", months: "operationalLifetime" },
  SalesStartDate: { from: "LegallyBindingPermits", months: "salesStart" },
  StartCompleted: { from: "FinalInvestmentDecision", months: "salesEnd" },
};

/** `Coalesce(…'Operational Lifetime', 30 * 12)` — the End Date button's default (Y:3862). */
export const DEFAULT_OPERATIONAL_LIFETIME_MONTHS = 30 * 12;

/** `but_….DisplayMode` — the button is usable only once the date it reads is set. */
export const isRecalculateEnabled = (target: RecalcKey, dates: MilestoneDates): boolean =>
  !isBlank(dates[RECALC_SOURCE[target].from]);

function applyRecalculated(form: MilestonesForm, target: RecalcKey, next: string | null): MilestonesForm {
  return {
    ...form,
    dates: { ...form.dates, [target]: next },
    standardAssumption: { ...form.standardAssumption, [target]: true },
  };
}

/**
 * Rules 10/11 — a CalendarAdd button derives its date from the predecessor and the project's
 * country + technology assumption row, and marks it a standard assumption.
 *
 * SOURCE DEFECT, corrected (D26): with no assumption row (or a blank duration) the canvas still
 * runs `DateAdd(predecessor, Blank(), Months)`, i.e. copies the predecessor date and flags it
 * a standard assumption — a date that then fails its own "later than" check. Here that is a
 * no-op. The End Date button is the exception: its `Coalesce(…, 30 * 12)` is a real default.
 * `recalculateMilestoneCanvasParity` keeps the canvas behaviour.
 */
export function recalculateMilestone(
  form: MilestonesForm,
  target: RecalcKey,
  assumption: MilestoneAssumptionRow | null | undefined,
): MilestonesForm {
  const spec = RECALC_SOURCE[target];
  const from = form.dates[spec.from];
  if (target === "EndDate") {
    const months = assumption?.operationalLifetime ?? DEFAULT_OPERATIONAL_LIFETIME_MONTHS;
    const end = deriveNextDate(from, months);
    return end === null ? form : applyRecalculated(form, target, dateOnly(addDays(localDay(end), -1)));
  }
  const next = deriveNextDate(from, assumption?.[spec.months]);
  return next === null ? form : applyRecalculated(form, target, next);
}

export function recalculateMilestoneCanvasParity(
  form: MilestonesForm,
  target: RecalcKey,
  assumption: MilestoneAssumptionRow | null | undefined,
): MilestonesForm {
  if (target === "EndDate") return recalculateMilestone(form, target, assumption);
  const from = form.dates[RECALC_SOURCE[target].from];
  // `DateAdd(x, Blank(), Months)` = x; a blank predecessor gives a blank date.
  const next = deriveNextDate(from, assumption?.[RECALC_SOURCE[target].months] ?? 0);
  return applyRecalculated(form, target, next);
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
export function resetShareOfFarmdown(
  language: Lang = "en-US",
): Pick<MilestonesForm, "shareOfFarmdown" | "isStandardShareOfFarmdown"> {
  // `locShareOfFarmdown: 50`, then `Reset(txt_…)` re-renders `Text(50, "##0.0")` (Y:3564-3587).
  return { shareOfFarmdown: formatFarmdown(50, language), isStandardShareOfFarmdown: true };
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
export function accumulatedIndexCanvasParity(
  fid: string | null,
  current: PriceInflationRow | null | undefined,
  previous: PriceInflationRow | null | undefined,
): number {
  // Blank arithmetic is 0 in Power Fx: a missing row or index contributes 0.
  const prev = previous?.accumulatedIndex ?? 0;
  const cur = current?.accumulatedIndex ?? 0;
  // Power Fx `Month()` is 1-based; `Month(Blank())` is 0.
  const month = isBlank(fid) ? 0 : localDay(fid!).getMonth() + 1;
  return prev + (cur - prev) * (month / 12);
}

/**
 * SOURCE DEFECT, corrected (D26): when either year's `Estimation Price Inflations` row (or its
 * accumulated index) is missing, the canvas computes with blanks as 0 — usually an index of 0,
 * so every generator cost and the plant WTG cost are written as 0. Here the index is `null`
 * and the save skips re-pricing, leaving the stored costs alone. (Before D26 the code assumed
 * an index of 1, which is invented data.)
 */
export function accumulatedIndex(
  fid: string | null,
  current: PriceInflationRow | null | undefined,
  previous: PriceInflationRow | null | undefined,
): number | null {
  if (isBlank(fid)) return null;
  if (current?.accumulatedIndex == null || previous?.accumulatedIndex == null) return null;
  return accumulatedIndexCanvasParity(fid, current, previous);
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
 * Rule 13's inner `ForAll` (Y:2402-2463) — `Switch(Value('Number of Generators'), 1, '1 WTG
 * price', …, 4, '4 WTG price', '5 WTG price')`, plus `'Additional foundation cost'` unless
 * `Text('Foundation cost included') = "Yes"`; the whole is scaled by the accumulated index.
 *
 * CANVAS BEHAVIOUR, kept (D26 M4, product owner 20 Oct 2026): `'Foundation cost included'`
 * (`vsb_foundationcostincluded`) is a Dataverse Yes/No column, which a canvas app reads as a
 * Boolean. `Text()` of a Boolean is "true" / "false", never the label "Yes", so the canvas test
 * `varFoundationCostIncluded = "Yes"` is always false and the additional foundation cost is
 * ALWAYS added — whatever the flag says. The product owner chose that outcome. The flag itself is
 * still read (`foundationCostIncluded`) for the documented twin
 * `repriceGeneratorsBooleanReading`, which honours it. The decision is the shared
 * `foundationCostAdded` (`@/domain/foundationCost`), which Generators uses too (D27).
 *
 * CORRECTED (D26): a blank rung price is Blank (0) in the canvas — it no longer falls back to the
 * 5-WTG price — and the result is no longer rounded to 2 dp here (the canvas does not round;
 * Dataverse applies the currency column's precision).
 */
export function repriceGenerators(
  generators: ProjectGenerator[],
  index: number,
): ProjectGenerator[] {
  return generators.map((g) => {
    const foundation = foundationCostAdded(g.foundationCostIncluded) ? (g.additionalFoundationCost ?? 0) : 0;
    const perWtg = (rungPrice(g) + foundation) * index;
    return { ...g, generatorsCost: g.count * perWtg };
  });
}

/**
 * NOT LIVE — the boolean reading of `'Foundation cost included'` (what the canvas formula was
 * presumably meant to do): an included foundation adds no extra cost. This app used it until
 * 20 Oct 2026; kept, with a test, so the M4 decision stays reversible.
 */
export function repriceGeneratorsBooleanReading(
  generators: ProjectGenerator[],
  index: number,
): ProjectGenerator[] {
  return generators.map((g) => {
    const net = rungPrice(g);
    const perWtg = foundationCostAddedBooleanReading(g.foundationCostIncluded)
      ? (net + (g.additionalFoundationCost ?? 0)) * index
      : net * index;
    return { ...g, generatorsCost: g.count * perWtg };
  });
}

/** The `Switch(Value('Number of Generators'), 1 … 4, …, '5 WTG price')` rung; Blank → 0. */
function rungPrice(g: ProjectGenerator): number {
  const rung = g.count >= 1 && g.count <= 4 ? Math.trunc(g.count) - 1 : 4;
  return g.wtgPrices[rung] ?? 0;
}

/**
 * Whether the save re-prices the generators: the saved FID differs from the stored one.
 *
 * SOURCE DEFECT, corrected (D26): the canvas sets `locNeedPlantCostsRecalculation` (and loads the
 * generators) only in the FID picker's `OnChange`. The FID CalendarAdd button changes the FID
 * without it, so a FID set by the button leaves the plant cost priced for the old FID — and a
 * FID typed and then recalculated is priced for the typed value. Here the saved FID decides.
 */
export function needsPlantCostRecalculation(
  storedFid: string | null,
  selectedFid: string | null,
): boolean {
  return !sameDate(storedFid, selectedFid);
}

/** The canvas flag: set only when the FID was TYPED to a value other than the stored one. */
export function needsPlantCostRecalculationCanvasParity(
  storedFid: string | null,
  lastTypedFid: string | null | undefined,
): boolean {
  return lastTypedFid !== undefined && !sameDate(storedFid, lastTypedFid);
}

/** `'Plant WTG Cost [EUR]': Sum(colProjectGenerators, 'Generators Cost')` — unrounded, as the canvas. */
export const plantWtgCost = (generators: ProjectGenerator[]): number =>
  generators.reduce((a, g) => a + (g.generatorsCost || 0), 0);

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
  clusterDescription?: string | null;
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

/**
 * Rule 22 — the 19-entry Italian region map. 1.21.753: the two centre zones are spelled
 * without spaces ("Italy_Centre-South" / "Italy_Centre-North"), matching the SQL rows.
 */
const ITALIAN_REGIONS: Record<string, string> = {
  Lazio: "Italy_Centre-South",
  Lombardia: "Italy_North",
  "Emilia Romagna": "Italy_North",
  Sicilia: "Italy_Sicily",
  // The source uses a typographic apostrophe here; both spellings are accepted.
  "Valle d’Aosta": "Italy_North",
  "Valle d'Aosta": "Italy_North",
  Veneto: "Italy_North",
  "Friuli Venezia Giulia": "Italy_North",
  Puglia: "Italy_South",
  Marche: "Italy_Centre-North",
  Molise: "Italy_South",
  Calabria: "Italy_Calabria",
  Abruzzo: "Italy_Centre-South",
  Piemonte: "Italy_North",
  Sardegna: "Italy_Sardinia",
  Toscana: "Italy_Centre-North",
  "Trentino Alto Adige": "Italy_North",
  Campania: "Italy_Centre-South",
  Liguria: "Italy_North",
  Basilicata: "Italy_South",
  Umbria: "Italy_Centre-South",
};

export function italianRegion(areaName: string | null | undefined): string | null {
  if (isBlank(areaName)) return null;
  return ITALIAN_REGIONS[areaName!.trim()] ?? null;
}

/**
 * 1.21.753 — `recCountryAssumptions: Switch(Country.Name, "Italy", Filter(SQL,
 * StartsWith(country, "Italy")), Filter(SQL, country = Country.Name))`. An Italian project's
 * slice is every `Italy*` row; `hooks.ts` sends it as `startswith(country,'Italy')`.
 */
export const isInRevenueSlice = (country: string, countryName: string | null): boolean =>
  countryName === "Italy" ? country.startsWith("Italy") : country === countryName;

/**
 * 1.21.753 — `recFilteredPrices: Switch(Country.Name, "Italy", Filter(slice, valuetype =
 * "price", country = locAreaWithRegion), Filter(slice, valuetype = "price"))`. Italy prices
 * from its own zone only; no recognised province means no price.
 */
export function revenuePricePool(
  rows: RevenueAssumptionRow[],
  countryName: string | null,
  areaName: string | null,
): RevenueAssumptionRow[] {
  const prices = rows.filter((r) => r.valuetype === "price");
  if (countryName !== "Italy") return prices;
  const region = italianRegion(areaName);
  return region ? prices.filter((r) => r.country === region) : [];
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
  const afterYears = addYears(localDay(start), years ?? 0);
  const afterMonths = addMonths(afterYears, months ?? 0);
  // Rule 18 — local parts (was `toISOString().slice(0, 10)`, a day early east of UTC).
  return { start, end: dateOnly(addDays(afterMonths, -1)) };
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
    codYear < withYear[0]!.year ? withYear[0]
    : codYear > withYear[withYear.length - 1]!.year ? withYear[withYear.length - 1]
    : withYear.reduce((best, x) =>
        Math.abs(x.year - codYear) < Math.abs(best.year - codYear) ? x : best);

  const v = Number(pick(target!.row, technology));
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

export const REVENUE_COL = {
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
  // The table spells it "tarrif" (as the Revenues `FLAG_COL`); `'Is Use Inflation Profile …'`
  // is `vsb_isinflationprofilestandardassumption`. Corrected 28 Oct 2026: the create was refused.
  isTariffPriceStd: "vsb_istarrifpricestandardassumption",
  isTariffPriceP90Std: "vsb_istarrifpricep90standardassumption",
  isUseInflationProfileStd: "vsb_isinflationprofilestandardassumption",
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

  // `recRevenueTypeRecordForCountry` is a LookUp on the WHOLE SQL table with
  // `country = Country.Name` — never one of the Italy_<zone> rows the slice now carries.
  const label = revenueLabelFor(
    project.technology,
    assumptions.find((r) => r.valuetype === "revenuetype" && r.country === project.countryName),
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
    : pickPrice(
        revenuePricePool(assumptions, project.countryName, project.areaName),
        project.technology,
        new Date(cod!).getFullYear(),
      );

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
  // As rule 18: omitted rather than sent as null, so Dataverse defaults the owner on create.
  if (!ctx.owningBusinessUnitId) delete data["owningbusinessunit@odata.bind"];

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
  writes: PlannedWrite[];
}

/** A `WritePlan` (run in order by `usePlanWrite`), with its steps kept for the tests. */
export interface MilestoneSavePlan extends WritePlan {
  steps: MilestoneSaveStep[];
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

  // Rule 18 — omitted rather than sent as null when the country has no 'Business Unit':
  // Dataverse cannot clear a record's owning business unit.
  if (!project.countryBusinessUnitId) delete data["owningbusinessunit@odata.bind"];

  steps.push({
    kind: "patch-project",
    log: MILESTONES_MSG.stepProjectSaved,
    writes: [{ op: "update", entitySet: ES.projects, id: project.id!, data, reason: "Save the milestones" }],
  });

  // Rule 13, in the canvas order (Y:445-473): the re-priced generators, then a SECOND project
  // patch with `'Plant WTG Cost [EUR]': Sum(colProjectGenerators, 'Generators Cost')`.
  if (ctx.repricedGenerators) {
    steps.push({
      kind: "reprice-generators",
      log: MILESTONES_MSG.stepPlantCost(ctx.repricedGenerators.length),
      writes: [
        ...ctx.repricedGenerators.map((g): PlannedWrite => ({
          op: "update",
          entitySet: ES.generatorTypeInProjects,
          id: g.id,
          // CORRECTED (D26): was `vsb_totalcosteur`, which does not exist on the table.
          data: { [GENERATOR_TYPE_COL.generatorsCost]: g.generatorsCost },
          reason: "Re-price a generator type for the new FID",
        })),
        {
          op: "update", entitySet: ES.projects, id: project.id!,
          data: { [PROJECT_COL.plantWtgCost]: plantWtgCost(ctx.repricedGenerators) },
          reason: "Update the plant WTG cost",
        },
      ],
    });
  }

  // The canvas seeds silently after its Notify — no log line. CORRECTED (D26): the invented
  // "A default revenue contract was created." step text is gone.
  if (ctx.revenueDraft) {
    steps.push({
      kind: "seed-revenue",
      log: null,
      writes: [{
        op: "create", entitySet: ES.projectRevenues, data: ctx.revenueDraft.data,
        reason: "Create the default revenue contract",
      }],
    });
  }

  return {
    steps,
    writes: steps.flatMap((s) => s.writes),
    log: steps.map((s) => s.log).filter((l): l is string => l !== null),
  };
}

/** `Generator Type In Projects` columns (generated `Vsb_generatortypeinprojectsModel`). */
export const GENERATOR_TYPE_COL = {
  id: "vsb_generatortypeinprojectid",
  count: "vsb_numberofgenerators",
  generatorsCost: "vsb_generatorscost",
} as const;

/**
 * The leave guard —
 * `If(CountRows(Filter(colMilestonesFormValidation, Dirty = true)) > 0,
 *     UpdateContext({locLeaveMilestonesConfirmationDialog: true}), <navigate>)`.
 */
export const shouldConfirmLeave = (dirtyKeys: MilestoneKey[]): boolean => dirtyKeys.length > 0;

/* ═══════════════════════════════════════════════════════ field visibility ════ */

/**
 * `con_Milestones_DisplayProject_Body_General_Content_<Field>.Visible` — every container up
 * to Cluster 4 is `locSelectedStartClusterNo <= n` (Project Start is `= 0`); FID, Cluster 5,
 * Cluster 6, the sales dates and End Date have no `Visible` and always render.
 */
export function isMilestoneFieldVisible(
  key: Exclude<MilestoneKey, "ShareOfFarmdown">,
  startCluster: number | null | undefined,
): boolean {
  const n = startClusterNo(startCluster ?? 0);
  switch (key) {
    case "StartDate": return n === 0;
    case "FeasibilityStudies": return n <= 1;
    case "ProjectDevelopmentStarted": return n <= 2;
    case "ApplicationSubmitted": return n <= 3;
    case "LegallyBindingPermits": return n <= 4;
    default: return true;
  }
}

/**
 * `but_Milestones_DisplayProject_Body_General_Content_<Cluster2…6|FiD|EndDate>.Visible` —
 * `Or(Technology = gblAppConstants.Texnology.Wind, Technology = gblAppConstants.Texnology.PV)`.
 * The two sales recalculate buttons carry no `Visible` and always render.
 */
export const isRecalculateVisible = (technology: string | null | undefined): boolean =>
  technology === "Wind" || technology === "PV";

/* ═══════════════════════════════════════════════════════════ screen copy ════ */

/** Every visible string on the screen that is not a field label in `MILESTONE_CHAIN`. */
export const MILESTONES_MSG = {
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_1.Text` — verbatim. */
  lockMessage: "This page is locked. To unlock it, please complete the following sections:",
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_2.Text` — verbatim. */
  lockSection: "• General",
  /** `dtp_Milestones_DisplayProject_Body_General_Content_StartDate.Placeholder` — verbatim. */
  startDatePlaceholder: "Select a project start date...",
  /** `dtp_Milestones_DisplayProject_Body_General_Content_Cluster3.Placeholder` — verbatim. */
  datePlaceholder: "Select a date...",
  /** `dtp_Milestones_DisplayProject_Body_General_Content_Sales_StartDate.Placeholder` — verbatim. */
  salesStartPlaceholder: "Select a sales start date...",
  /** `dtp_Milestones_DisplayProject_Body_General_Content_Sales_CompletionDate.Placeholder` — verbatim. */
  salesCompletionPlaceholder: "Select a sales completion date...",
  /** `lbl_Milestones_DisplayProject_Body_General_Content_Lifetime.Text` — verbatim. */
  operationalLifetime: "Operational Lifetime",
  /** `but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset.Tooltip` — verbatim. */
  farmdownReset: "Reset to standard assumption of 50%",
  /**
   * `Icon1_2.Tooltip` — verbatim: three lines, with the canvas's runs of spaces (Y:3613-3616).
   * CORRECTED (D26): the line breaks had been joined into one line.
   */
  farmdownInfo:
    "0%     : Project will remain fully at VSB\n50%   : Standard farmdown approach\n100% : Project will be fully sold",
  /** `htm_lbl_…_Share_of_Farmdown_ErrorMessage.HtmlText`, blank branch — verbatim. */
  farmdownBlank: "Share of Farmdown cannot be blank",
  /** `htm_lbl_…_Share_of_Farmdown_ErrorMessage.HtmlText`, format branch — verbatim. */
  farmdownFormat:
    "Please ensure the entry is a number using no more than two decimal places and within the range of 0 to 100",
  /** `lbl_GeneralData_…_Creator_1.Text` — verbatim. */
  createdBy: "Created By:",
  /** `lbl_GeneralData_…_CreatorOn_1.Text` — verbatim. */
  createdOn: "Created:",
  /** `lbl_GeneralData_…_Editor_1.Text` — verbatim. */
  modifiedBy: "Modified By:",
  /** `lbl_GeneralData_…_EditOn_1.Text` — verbatim. */
  modifiedOn: "Modified:",
  /** `btn_Project_Milestone_Save.OnSelect` → `colProcessingSteps` (Y:428) — verbatim. */
  stepProjectSaved: "Project data was saved/updated successfully.",
  /** `$"Plant WTG Cost (WTG's: {CountIf(colProjectGeneratorsUpdated, true)}), was recalculated…"` (Y:469-472). */
  stepPlantCost: (count: number) =>
    `Plant WTG Cost (WTG's: ${count}), was recalculated and updated successfully.`,
  /** `Icon3.Text` — verbatim (shown while a `Fabric Sync Jobs` recalculation runs). */
  recalculating: "Currently recalculating this projects CAPEX costs.",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_ProjectName_ErrorMessage_5.Text` — verbatim. */
  requiredFields: "Required fields",
  /** `pcf_btn_Milestones_DisplayProject_Body_Buttons_Save.Text` — verbatim. */
  save: "Save",
  /** `pcf_btn_Milestones_DisplayProject_Body_Buttons_Save.Tooltip` — verbatim. */
  saveTooltip: "Save Milestone data.",
  /** `pcf_btn_Milestones_DisplayProject_Body_Buttons_Reset.Text` — verbatim. */
  cancel: "Cancel",
  /** `pcf_btn_Milestones_DisplayProject_Body_Buttons_Reset.Tooltip` — verbatim. */
  cancelTooltip: "Reset values entered.",
  /** `cmp_PopUp_Leave_Milestones_Confirmation.Title` — verbatim. */
  leaveTitle: "Unsaved data",
  /** `cmp_PopUp_Leave_Milestones_Confirmation.Description` — verbatim. */
  leaveDescription: "You have unsaved data. Do you really want to leave current form without saving?",
  /** `cmp_PopUp_Leave_Milestones_Confirmation.ConfirmButtonText` — verbatim. */
  leaveConfirm: "Yes",
  /** `cmp_PopUp_Confirmation_IndividualVolume_Review.Title` — verbatim. */
  codReviewTitle: "Review Impact of COD Change",
  /** `cmp_PopUp_Confirmation_IndividualVolume_Review.Description` — verbatim. */
  codReviewDescription:
    "Changing the COD may affect existing revenue contracts with individual volumes. Please review the affected revenue contracts.",
  /** `cmp_PopUp_Confirmation_IndividualVolume_Review.ConfirmButtonText` — verbatim. */
  codReviewConfirm: "Confirm",
  /** `btn_Project_Milestone_Save.OnSelect` → `locGeneralDataSavingDialogText` — verbatim. */
  saving: "The project is being saved, please wait..",
} as const;

/**
 * `cmp_PopUp_Leave_Milestones_Confirmation` — the texts the shared `UnsavedChangesGuard` shows
 * (D35, PO X1). `CancelButtonText: ="Cancel"` — verbatim.
 */
export const LEAVE_DIALOG = {
  title: MILESTONES_MSG.leaveTitle,
  description: MILESTONES_MSG.leaveDescription,
  confirm: MILESTONES_MSG.leaveConfirm,
  cancel: "Cancel",
} as const;

/**
 * `lbl_Milestones_DisplayProject_Body_General_Content_<Field>_ErrorMessage.Text` — the copy
 * rendered UNDER each date field, verbatim. It differs from `MILESTONE_CHAIN[].text` (the
 * `colMilestonesFormValidation.Text` the "Required fields" InfoButton lists) for Project Start
 * ("cannot be empty") and Cluster 1 ("Project Start Date"). Sales Start Date has no error
 * label in the canvas.
 */
export const MILESTONE_FIELD_ERROR: Partial<Record<Exclude<MilestoneKey, "ShareOfFarmdown">, string>> = {
  StartDate: "The Project Start Date cannot be empty.",
  FeasibilityStudies: "The date needs to be later than Project Start Date.",
  ProjectDevelopmentStarted: "The date needs to be later than Cluster 1 date.",
  ApplicationSubmitted: "The date needs to be later than Cluster 2 date.",
  LegallyBindingPermits: "The date needs to be later than Cluster 3 date.",
  FinalInvestmentDecision: "The date needs to be later than Cluster 4 date.",
  Construction: "The date needs to be later than Final Investment Decision date.",
  OperationsStartDate: "The date needs to be later than Cluster 5 date.",
  EndDate: "The date needs to be later than Cluster 6 date.",
  StartCompleted: "The date needs to be later than sales starts date.",
};

/**
 * Screen texts that are NOT canvas captions (NEW, D26): the load-error state (rule 19) and the
 * notices for what is deliberately not connected. Kept short; never shown as canvas copy.
 */
export const MILESTONES_SCREEN_TEXT = {
  loadFailedTitle: "The milestone data could not be loaded",
  loadFailedDescription: "Reload the page or try again later.",
  loading: "Loading...",
  noProject: "The project could not be found.",
  /** The save could not read `Assumptions Revenues SQL` (Fabric SQL), so no default revenue contract was created. */
  revenueSeedFabricFailed:
    "The milestones were saved, but the default revenue contract was not created: the revenue assumptions could not be read from Fabric SQL.",
} as const;

/**
 * `Text(value, DateTimeFormat.ShortDateTime24)` — the footer's Created / Modified stamps: the
 * language's short date, a space, then `HH:mm` (24 h), e.g. "4/7/2025 22:08" in en-US (product
 * owner's canvas screenshot, 20 Oct 2026). English short dates keep the language's own padding
 * (en-US "4/7/2025", en-GB "07/04/2025"); other languages pad day and month ("07.04.2025").
 */
export function formatShortDateTime24(timestamp: string | null, locale: string): string {
  if (isBlank(timestamp)) return "";
  const d = new Date(timestamp!);
  if (Number.isNaN(d.getTime())) return "";
  const part = locale.toLowerCase().split("-")[0] === "en" ? "numeric" : "2-digit";
  const date = dateFormat(locale, { year: "numeric", month: part, day: part }).format(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The seed gate of the default revenue contract (rule 20, Y:509-521): `'Cluster State'.Name in
 * ["Draft", "Cluster 1"]` and no `Project Revenues` row yet. `loadRevenueSeed` checks it at save time.
 */
export const revenueSeedWouldRun = (p: MilestoneProject | null, revenueRowCount: number): boolean =>
  !!p && ["Draft", "Cluster 1"].includes(p.clusterStateName ?? "") && revenueRowCount === 0;

/** `htm_lbl_…_Share_of_Farmdown_ErrorMessage` — which of its two messages applies, if any. */
export function farmdownError(raw: string, language: Lang = "en-US"): string | null {
  if (isBlank(raw)) return MILESTONES_MSG.farmdownBlank;
  return validateFarmdown(raw, language) ? null : MILESTONES_MSG.farmdownFormat;
}
