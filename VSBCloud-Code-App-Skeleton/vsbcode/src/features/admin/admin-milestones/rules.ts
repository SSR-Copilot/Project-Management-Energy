/**
 * Admin Milestones Screen — every business rule as a pure function.
 *
 * Canvas screen: `Admin Milestones Screen` (PM app)
 *   102 controls · 2 259 lines of Power Fx · 43 substantive blocks · band M
 *
 * Maintains the per-country, per-technology standard milestone assumptions: a DURATION IN
 * MONTHS and a SUCCESS RATE for Cluster 1–5, FID, Operational Lifetime, Sales Start and
 * Sales End. Countries are an accordion; each expanded country shows a read-only grid
 * built by pivoting `Milestones Standard Assumptions` on `Technology`. A right panel edits
 * one country's numbers across all its technologies at once.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — NO SCREEN-LEVEL OR SERVER-SIDE PERMISSION CHECK.               │
 * │                                                                                │
 * │ `brief.py` reports `PERMISSION SIGNALS: none`: no `DataSourceInfo`, no          │
 * │ `RecordInfo`, no `gblCurrentUser` test anywhere on this screen. Entry is gated  │
 * │ only by `Or(gblCurrentUser.IsApplicationAdministrator,                          │
 * │ gblCurrentUser.IsControllerOwnData)` on the nav items — CLIENT-SIDE HIDING.     │
 * │                                                                                │
 * │ WHAT WE DID: `RequireAdmin` guards the route and `canEditScope` gates every     │
 * │ write on `canEditCountry`. THE ROUTE GUARD IS NOT SECURITY. These numbers drive │
 * │ the assumed milestone dates of every project in a country; the server must      │
 * │ reject unauthorised writes to `vsb_milestonesstandardassumptionses` and does    │
 * │ not today.                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * COUNTRY SCOPING. `gblCurrentUser.EditableCounties` is never read here either. The axis
 * is the whole `Countries` table (`colMilestoneStandardAssumptions =
 * AddColumns(Countries, Title, Name, Order, Value(Key), IsFolded, true)` sorted by
 * `Order`), so every admin sees every country. `canEditScope` is the gate the canvas
 * lacked.
 *
 * DEAD CODE, REPRODUCED AS DEAD — do not switch it on silently:
 *  - Both `Patch('Fabric Sync Jobs', Defaults(…), {…})` blocks (lines 2698–2722 and
 *    2746–2772) are inside `/* … *\/` comments, together with the flow call that follows
 *    each one.
 *  - The per-country Apply command item ships `ItemEnabled: false`; the Apply-All
 *    `CommandBar1` ships `DisplayMode: =DisplayMode.Disabled`. Both are disabled TWICE
 *    OVER — by the control and by the commented-out body.
 *  - `ForCountriestriggerFabricrecalculationsforProjects` IS NOT IN THE SOLUTION EXPORT.
 *    `@/flows/flowClient` exports a typed wrapper that throws; `applyCommands` below
 *    points the disabled commands at it so the INTENT is in the code and the internals
 *    are never invented.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `col_MilestoneAssumtionsUpdates` and its SENTINEL STRINGS (`"invalid duration"` /
 *    `"invalid success rate"` written INTO the data). Replaced by a typed edit map whose
 *    validity is a boolean on the entry — see `MilestoneEdit`.
 *  - `fn_Numeric_MS`, referenced 3× but DECLARED ON ANOTHER SCREEN (`Project Main
 *    Screen`, line 2316). A cross-screen canvas-component reference has no code-app
 *    equivalent; `@/domain/numeric` replaces it.
 *  - the ~18 in-formula `LookUp`s per assumption row in the Save `ForAll`.
 */
import { isTwoDecimal, inRange, isBlank } from "@/domain/numeric";
import { ES_ADMIN, MILESTONE_ROW_NAME, CHOICE_ADMIN } from "@/data/entities";
import { canEditCountry, type CurrentUser } from "@/domain/session";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const MILESTONE_COL = {
  id: "vsb_milestonesstandardassumptionid",
  name: "vsb_name",
  technology: "vsb_technology",
  country: "_vsb_country_value",
  cluster1: "vsb_cluster1",
  cluster2: "vsb_cluster2",
  cluster3: "vsb_cluster3",
  cluster4: "vsb_cluster4",
  cluster5: "vsb_cluster5",
  finalInvestmentDecision: "vsb_finalinvestmentdecision",
  operationalLifetime: "vsb_operationallifetime",
  salesStart: "vsb_salesstart",
  salesEnd: "vsb_salesend",
} as const;

export const MILESTONE_ENTITY_SET = ES_ADMIN.milestonesStandardAssumptions;

export const FABRIC_JOB_COL = {
  id: "vsb_fabricsyncjobid",
  regardingObject: "vsb_regardingobject",
  jobType: "_vsb_jobtype_value",
  jobStatus: "vsb_jobstatus",
} as const;

/**
 * Rule 14 — the recalculating indicator reads exactly this `Fabric Job Types` NAME and
 * three of the five `Job States`. It is the ONLY live read of `Fabric Sync Jobs` in the
 * whole batch.
 */
/**
 * @labels-not-in-corpus — a `'Job Type'`.`Name` DATA value the canvas compares against when it
 * polls the Fabric sync job
 */
export const MILESTONE_JOB_TYPE_NAME = "Portfolio Milestone Assumptions changed";

export const ACTIVE_JOB_STATES: readonly number[] = [
  CHOICE_ADMIN.jobStates.inDelay,
  CHOICE_ADMIN.jobStates.inProgress,
  CHOICE_ADMIN.jobStates.importing,
];

/* ══════════════════════════════════════════════════════════ the label↔column map ════ */

/** The nine display labels, in the fixed order the grid renders them (rule 2). */
export type MilestoneField =
  | "Cluster 1" | "Cluster 2" | "Cluster 3" | "Cluster 4"
  | "FID" | "Cluster 5" | "Operational Lifetime" | "Sales Start" | "Sales Duration";

/**
 * Rule 2 — the label↔column map, DECLARED IN ONE PLACE so the mismatch below cannot be
 * silently "fixed" in one of nine call sites.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — `Sales Duration` MAPS TO THE `'Sales End'` COLUMN.        │
 * │                                                                              │
 * │ The gallery renders a column headed "Sales Duration" whose value is           │
 * │ `Durations.'Sales End'`. The label and the column disagree, and the source    │
 * │ carries no comment explaining it. Two readings are possible: either the       │
 * │ column is misnamed (it really holds a duration in months, like every other    │
 * │ column on the row named "average duration [months]"), or the label is wrong.  │
 * │ Given every other value on the row IS a month count, the column name is the   │
 * │ likelier mistake.                                                            │
 * │                                                                              │
 * │ WE KEPT THE CANVAS BEHAVIOUR — "Sales Duration" reads and writes              │
 * │ `vsb_salesend` — because changing it would silently move data between         │
 * │ columns for every country. UT-ADMILE-006 pins it. The rename belongs in a     │
 * │ schema migration, not in this screen.                                        │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export const MILESTONE_FIELD_COLUMN: Record<MilestoneField, string> = {
  "Cluster 1": MILESTONE_COL.cluster1,
  "Cluster 2": MILESTONE_COL.cluster2,
  "Cluster 3": MILESTONE_COL.cluster3,
  "Cluster 4": MILESTONE_COL.cluster4,
  FID: MILESTONE_COL.finalInvestmentDecision,
  "Cluster 5": MILESTONE_COL.cluster5,
  "Operational Lifetime": MILESTONE_COL.operationalLifetime,
  "Sales Start": MILESTONE_COL.salesStart,
  /** See the defect note above — deliberately `'Sales End'`. */
  "Sales Duration": MILESTONE_COL.salesEnd,
};

/** The nine duration columns, in render order. */
export const DURATION_FIELDS: readonly MilestoneField[] = [
  "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "FID", "Cluster 5",
  "Operational Lifetime", "Sales Start", "Sales Duration",
];

/**
 * Rule 4 — the editor's success-rate section renders headers `""`, `Cluster 1`…`Cluster 4`
 * ONLY, while the durations section renders all nine. Cluster 5, FID, Operational
 * Lifetime, Sales Start and Sales Duration have no editable success rate.
 */
export const SUCCESS_RATE_FIELDS: readonly MilestoneField[] = [
  "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4",
];

/**
 * GUIDE p22 — the read-only grid shows only SEVEN value columns (Technology, Cluster 1–4,
 * FID, Cluster 5, Operational Lifetime); Sales Start and the "Sales Duration" column sit
 * further right, off the edge of the screenshot. Declared as a slice of `DURATION_FIELDS`
 * so the grid and the edit panel — which does show all nine — cannot silently drift apart.
 */
export const SUMMARY_TABLE_FIELDS: readonly MilestoneField[] = DURATION_FIELDS.slice(0, 7);

/**
 * GUIDE p22 — the EDIT PANEL spells two of the nine fields differently from their grid/
 * mapping key:
 *  - "FID" is written out in full, "Final Investment Decision".
 *  - "Sales Duration" (which maps to the `vsb_salesend` column — see the defect note on
 *    `MILESTONE_FIELD_COLUMN`) is labelled with the plain column name, "Sales End", in the
 *    panel. The panel's screenshot never shows a column called "Sales Duration" anywhere;
 *    that label is specific to the (off-screen) grid column and is not invented here.
 * Both labels are captured verbatim from the panel screenshot, not synthesised.
 */
export function milestoneFieldDisplayLabel(field: MilestoneField): string {
  if (field === "FID") return "Final Investment Decision";
  if (field === "Sales Duration") return "Sales End";
  return field;
}

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** One `Milestones Standard Assumptions` row, flat. */
export interface AssumptionRow {
  id: string;
  /** The MAGIC DISCRIMINATOR — exactly one of the two `MILESTONE_ROW_NAME` values. */
  name: string;
  technology: number | null;
  countryId: string | null;
  values: Partial<Record<string, number | null>>;
}

export interface CountryRow {
  id: string;
  name: string;
  order: number;
  /** `Value(Key)` — the canvas coerces the text key to a number for the sort. */
  key: number | null;
}

/** The pivot's output: one entry per technology, with both series. */
export interface TechnologyMilestones {
  technology: number | null;
  /** The row id of the `"average duration [months]"` row, or null when absent. */
  durationRowId: string | null;
  successRateRowId: string | null;
  entries: MilestoneEntry[];
}

export interface MilestoneEntry {
  label: MilestoneField;
  duration: number | null;
  /** `undefined` when the success-rate row is missing entirely (rule 4 / UT-004). */
  successRate: number | null | undefined;
}

/** One journalled cell edit. Validity is a BOOLEAN, not a sentinel string in the data. */
export interface MilestoneEdit {
  rowId: string;
  field: MilestoneField;
  kind: "duration" | "successRate";
  raw: string;
  valid: boolean;
}

export type EditMap = ReadonlyMap<string, MilestoneEdit>;

export const editKey = (rowId: string, field: MilestoneField): string => `${rowId}:${field}`;

export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  refusedReason?: string;
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });
const refuse = (reason: string): WritePlan => ({ writes: [], log: [], refusedReason: reason });

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /** `lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage.Text` — verbatim. */
  invalidDuration: "Enter a positive value without decimals",
  /** `lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage.Text` — verbatim. */
  invalidSuccessRate: "Enter a value between 0 and 1 with a maximum of 2 decimals",
  /** `cmp_Admin_MilestoneAssumptions_Apply_Confirmation` — verbatim, so no copy review. */
  applyConfirmation:
    "Are you sure you want to apply these standard milestone durations to all relevant "
    + "projects? This will override existing standard assumptions of milestones.",
  /** `Icon3_1`'s tooltip — verbatim, including its grammar. */
  /** `Icon3_1.Text` — verbatim. */
  recalculating:
    "Currently recalculating this countries projects Costs and standard assumed Milestone dates.",
  applyDisabled:
    "Recalculation is not enabled. The Fabric sync job and the flow it calls are commented "
    + "out in the shipped app, and the flow itself is not in the solution export.",
  /** NEW — no canvas equivalent: the country-scope gate is added by the code app */
  outOfScope: "This country is outside your editable country scope, so the values are read-only.",
  /**
   * NEW — no canvas equivalent: the code app says why Save is refused; the canvas only greyed
   * the button out
   */
  noEdits: "Nothing has been changed yet.",
  /** NEW — no canvas equivalent: empty state for a country with no assumptions */
  emptyCountry: "This country has no milestone assumptions yet.",
  /** NEW — no canvas equivalent: the code app surfaces a failed save */
  saveFailed: "The milestone assumptions could not be saved.",
  /** GUIDE p22 — the two section headers inside "Edit Milestones for {country}", verbatim. */
  /** `lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterDurations.Text` — verbatim. */
  durationsSectionTitle: "Cluster Durations [months]",
  /** `lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterSuccessRates.Text` — verbatim. */
  successRateSectionTitle: "Cluster Probabilities - Success Rate [-]",
} as const;

/** GUIDE p22 — the panel's title bar, `"Edit Milestones for " & countryName`. */
export const editMilestonesTitle = (countryName: string): string =>
  `Edit Milestones for ${countryName}`;

/* ═══════════════════════════════════════════════════════════════════ the pivot ════ */

/** Rule 1's country ordering — `Sort(colMilestoneStandardAssumptions, Order, Ascending)`. */
export const sortCountries = (countries: CountryRow[]): CountryRow[] =>
  [...countries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const numberOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Rules 1–3 — the pivot.
 *
 * `GroupBy(Filter(…, Country.Country = …), Technology, Techs)` then, per group,
 * `LookUp(techGroups.Techs, Name = "average duration [months]")` and the same for
 * `"success rate [-]"`. THE ROW'S NAME IS ITS TYPE — there is no flag column, so the two
 * magic strings in `MILESTONE_ROW_NAME` are load-bearing.
 *
 * Rule 3, reproduced verbatim: the `"FID"` entry's success rate is the LITERAL 1, not a
 * value read from the table. Whatever `'Final Investment Decision'` holds on the
 * success-rate row is ignored.
 *
 * A technology whose success-rate row is missing yields `successRate: undefined` on every
 * entry rather than throwing (UT-ADMILE-004).
 */
export function pivotByTechnology(rows: AssumptionRow[]): TechnologyMilestones[] {
  const byTech = new Map<number | null, AssumptionRow[]>();
  for (const r of rows) {
    const list = byTech.get(r.technology ?? null) ?? [];
    list.push(r);
    byTech.set(r.technology ?? null, list);
  }

  const out: TechnologyMilestones[] = [];
  for (const [technology, group] of byTech) {
    const durations = group.find((r) => r.name === MILESTONE_ROW_NAME.duration) ?? null;
    const successRates = group.find((r) => r.name === MILESTONE_ROW_NAME.successRate) ?? null;

    const entries: MilestoneEntry[] = DURATION_FIELDS.map((label) => {
      const column = MILESTONE_FIELD_COLUMN[label];
      const duration = durations ? numberOrNull(durations.values[column]) : null;
      // Rule 3 — FID's success rate is a hard-coded 1.
      if (label === "FID") return { label, duration, successRate: 1 };
      const successRate = successRates === null
        ? undefined
        : numberOrNull(successRates.values[column]);
      return { label, duration, successRate };
    });

    out.push({
      technology,
      durationRowId: durations?.id ?? null,
      successRateRowId: successRates?.id ?? null,
      entries,
    });
  }

  // `Sort(GroupBy(...), vsb_technology, SortOrder.Ascending)`.
  return out.sort((a, b) => (a.technology ?? 0) - (b.technology ?? 0));
}

/** The `Technology` choice's display name — "Wind", "PV", "Hybrid", … — or an em dash. */
export function technologyDisplayName(value: number | null): string {
  const entry = Object.entries(CHOICE_ADMIN.technology).find(([, v]) => v === value);
  if (!entry) return "—";
  return entry[0] === "pv" ? "PV" : entry[0][0].toUpperCase() + entry[0].slice(1);
}

/** One row of the read-only Technology × cluster grid (GUIDE p22). */
export interface MilestoneSummaryRow {
  key: string;
  technology: number | null;
  seriesLabel: "Duration [months]" | "Success Rate [-]";
  /**
   * GUIDE p22 — the grid's header row is `Technology, Cluster 1…Cluster 4, FID, Cluster 5,
   * Operational Lifetime`, with no separate row-label column. The Technology cell therefore
   * carries BOTH the technology name and which series the row is, e.g. "Wind — Duration
   * [months]"; that is the only way to show two rows per technology in an eight-column
   * table whose header list the screenshot gives with no ninth column.
   */
  technologyCell: string;
  values: Partial<Record<MilestoneField, number | null | undefined>>;
}

/** Builds the read-only grid's rows from the pivot — two per technology (rule 1–3). */
export function buildMilestoneSummaryRows(pivot: TechnologyMilestones[]): MilestoneSummaryRow[] {
  const out: MilestoneSummaryRow[] = [];
  for (const t of pivot) {
    const name = technologyDisplayName(t.technology);
    const durationValues: Partial<Record<MilestoneField, number | null>> = {};
    const successValues: Partial<Record<MilestoneField, number | null | undefined>> = {};
    for (const e of t.entries) {
      durationValues[e.label] = e.duration;
      successValues[e.label] = e.successRate;
    }
    out.push({
      key: `${name}-d`, technology: t.technology, seriesLabel: "Duration [months]",
      technologyCell: `${name} — Duration [months]`, values: durationValues,
    });
    out.push({
      key: `${name}-s`, technology: t.technology, seriesLabel: "Success Rate [-]",
      technologyCell: `${name} — Success Rate [-]`, values: successValues,
    });
  }
  return out;
}

/** Rule 5's split — the two editor galleries filter the same working set by `Name`. */
export const durationRows = (rows: AssumptionRow[]): AssumptionRow[] =>
  rows.filter((r) => r.name === MILESTONE_ROW_NAME.duration)
    .sort((a, b) => (a.technology ?? 0) - (b.technology ?? 0));

export const successRateRows = (rows: AssumptionRow[]): AssumptionRow[] =>
  rows.filter((r) => r.name === MILESTONE_ROW_NAME.successRate)
    .sort((a, b) => (a.technology ?? 0) - (b.technology ?? 0));

/* ═══════════════════════════════════════════════════════════════════ validation ════ */

/**
 * Rule 7's duration validator — `IsMatch(Self.Value, "^\d+$")`.
 * Digits only: no sign, no decimal point, no separators. `"-3"` and `"12.5"` both fail.
 */
export const isValidDuration = (input: string): boolean => /^\d+$/.test((input ?? "").trim());

/**
 * Rule 7's success-rate validator —
 * `And(Not(IsBlank(v)), fn_Numeric_MS.IsTwoDecimal(v), fn_Numeric_MS.InRange(v, 0, 1))`.
 * BLANK IS INVALID, which is why clearing a cell disables the whole country's Save.
 */
export function isValidSuccessRate(input: string, language = "en-US"): boolean {
  const v = (input ?? "").trim();
  if (isBlank(v)) return false;
  if (!isTwoDecimal(v, language)) return false;
  return inRange(v, 0, 1, language);
}

export const validateEdit = (
  kind: "duration" | "successRate",
  raw: string,
  language = "en-US",
): boolean => (kind === "duration" ? isValidDuration(raw) : isValidSuccessRate(raw, language));

/**
 * Rule 6 — the journal is an UPSERT keyed on `(assumptionGuid, field)`. The canvas does
 * that with a `LookUp` + `Collect`/`Update` pair per keystroke; here it is a `Map` set.
 */
export function upsertEdit(edits: EditMap, edit: MilestoneEdit): Map<string, MilestoneEdit> {
  const next = new Map(edits);
  next.set(editKey(edit.rowId, edit.field), edit);
  return next;
}

/**
 * The Save gate — `If(<durations invalid>.Visible || <success rates invalid>.Visible ||
 * IsEmpty(col_MilestoneAssumtionsUpdates), Disabled, Edit)`.
 *
 * NO JOURNAL, NO SAVE — and any single bad cell anywhere in the country blocks the whole
 * country's save. That coarseness is preserved (the numbers are cross-checked as a set),
 * but per-cell errors are now shown too, which the sentinel design made impossible.
 */
export function canSave(edits: EditMap): boolean {
  if (edits.size === 0) return false;
  for (const e of edits.values()) if (!e.valid) return false;
  return true;
}

export function invalidEdits(edits: EditMap): MilestoneEdit[] {
  return [...edits.values()].filter((e) => !e.valid);
}

export function saveErrorMessages(edits: EditMap): string[] {
  const bad = invalidEdits(edits);
  const out: string[] = [];
  if (bad.some((e) => e.kind === "duration")) out.push(MSG.invalidDuration);
  if (bad.some((e) => e.kind === "successRate")) out.push(MSG.invalidSuccessRate);
  return out;
}

/** Country scope, applied here and absent from the canvas. */
export function canEditScope(user: CurrentUser | null, countryId: string | null): boolean {
  if (!user) return false;
  return canEditCountry(user, countryId ?? undefined);
}

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Rule 8 — the save, as ONE batch of PATCHes carrying ONLY the changed columns.
 *
 * The canvas issues one `Patch` per assumption row whose body is a chain of nine
 * `If(!IsBlank(LookUp(varUpdates, …)), {<column>: Value(LookUp(varUpdates, …).value)})`
 * arguments — about eighteen collection scans per row. Here the edit map is already keyed,
 * so each row's payload is built in one pass.
 *
 * Rule 9's `Value(...)` coercion still happens (the raw string becomes a number), but an
 * INVALID entry can never reach it: `planSaveMilestones` refuses while any entry is
 * invalid, and the per-entry filter below is a second belt — the canvas relied on a single
 * global disable, which fails open the moment a new field forgets its validator.
 */
export function planSaveMilestones(args: {
  edits: EditMap;
  canEdit: boolean;
  language?: string;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (args.edits.size === 0) return refuse(MSG.noEdits);
  const bad = invalidEdits(args.edits);
  if (bad.length > 0) return refuse(saveErrorMessages(args.edits)[0] ?? MSG.invalidDuration);

  const byRow = new Map<string, Record<string, unknown>>();
  for (const e of args.edits.values()) {
    // Belt and braces — an invalid entry never contributes a column.
    if (!e.valid) continue;
    const column = MILESTONE_FIELD_COLUMN[e.field];
    const data = byRow.get(e.rowId) ?? {};
    data[column] = Number(e.raw.trim().replace(",", "."));
    byRow.set(e.rowId, data);
  }

  const plan = emptyPlan();
  for (const [rowId, data] of byRow) {
    plan.writes.push({
      op: "update", entitySet: MILESTONE_ENTITY_SET, id: rowId, data,
      reason: `${Object.keys(data).length} milestone column(s) updated`,
    });
  }
  plan.log.push(`Saved ${args.edits.size} cell edit(s) across ${byRow.size} row(s).`);
  return plan;
}

/* ═══════════════════════════════════════════════════════════════ the Fabric badge ════ */

export interface FabricJob {
  id: string;
  regardingObjectId: string | null;
  jobTypeName: string | null;
  jobStatus: number | null;
}

/**
 * Rule 14 — the badge is LIVE and reads three job states for one job type, scoped to the
 * country row it is rendered on. Its `DisplayMode` is `Disabled`: it is an indicator, not
 * a control.
 */
export function isRecalculating(jobs: FabricJob[], countryId: string): boolean {
  return jobs.some((j) =>
    j.regardingObjectId === countryId
    && j.jobTypeName === MILESTONE_JOB_TYPE_NAME
    && j.jobStatus !== null
    && ACTIVE_JOB_STATES.includes(j.jobStatus));
}

/* ═════════════════════════════════════════════════════════════════════ the Apply ════ */

export type ApplyScope = { kind: "country"; countryId: string; countryName: string }
  | { kind: "all" };

export interface ApplyCommandState {
  enabled: false;
  disabledReason: string;
  confirmation: string;
}

/**
 * Rule 13 — Apply and Apply All, DISABLED EXACTLY AS SHIPPED.
 *
 * The canvas disables them twice over: the per-country item carries `ItemEnabled: false`,
 * the Apply-All `CommandBar1` carries `DisplayMode: =DisplayMode.Disabled`, and BOTH
 * confirmation handlers have their `Fabric Sync Jobs` patch and their flow call inside
 * `/* … *\/` comments, leaving only an overlay that opens and immediately closes.
 *
 * `enabled` is a literal `false` in the type, so a future edit cannot flip it by accident;
 * turning the feature on means changing this function deliberately AND landing the custom
 * API. The wording is carried verbatim so the eventual enablement needs no copy review.
 */
export function applyCommandState(_scope: ApplyScope): ApplyCommandState {
  return {
    enabled: false,
    disabledReason: MSG.applyDisabled,
    confirmation: MSG.applyConfirmation,
  };
}

/**
 * The flow's call signature, from the two COMMENTED call sites:
 *
 *   ForCountriestriggerFabricrecalculationsforProjects.Run(
 *       locSelectedMilestoneAssumptionCountry.Name,          // or the literal "All"
 *       locActiveProjectFabricRecalculateJob.'Fabric Sync Job'
 *   )                                                        // returns { message }
 *
 * guarded by `If(locActiveProjectFabricRecalculateJob.'Job Status' = 'Job States'.Dirty,
 * …)` and preceded by the creation of a `Fabric Sync Jobs` row.
 *
 * THE FLOW IS NOT IN `sol/Workflows/` (17 files, none with this name). Its actions, inputs
 * and outputs cannot be described from these sources and are NOT invented here. This
 * function only shapes the arguments; the wrapper in `@/flows/flowClient` throws a clear
 * "not present in the export" error when called, which is what `UT-ADMILE-025` asserts.
 *
 * NOTE the failure mode the replacement must remove: the canvas creates the job row and
 * calls the flow as TWO operations, so a failure leaves an orphan `Dirty` job. The
 * replacement should be one `vsb_TriggerMilestoneRecalculation(country | "All")` custom
 * API that creates the row AND starts the pipeline in one transaction.
 */
export function fabricRecalculationArgs(scope: ApplyScope): { countryNames: string[] } {
  return scope.kind === "all"
    ? { countryNames: ["All"] }
    : { countryNames: [scope.countryName] };
}
