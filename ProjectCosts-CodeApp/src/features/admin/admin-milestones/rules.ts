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
 * │ No `DataSourceInfo`, no `RecordInfo`, no `gblCurrentUser` test anywhere on this │
 * │ screen. Entry is gated only by `Or(IsApplicationAdministrator,                  │
 * │ IsControllerOwnData)` on the nav items — CLIENT-SIDE HIDING.                    │
 * │                                                                                │
 * │ WHAT WE DID: the save plan takes `canEdit` = the same admin rule              │
 * │ (`app/adminAccess.ts`, with its local-run bypass). There is NO route guard (an  │
 * │ earlier note claimed `RequireAdmin`; none exists). None of this is security:    │
 * │ these numbers drive the assumed milestone dates of every project in a country, │
 * │ and the server must reject unauthorised writes.                                 │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * OUT OF SCOPE (product decision 19 Oct 2026, 02-OPEN-DECISIONS D20): Apply / Apply All. The
 * canvas `CommandBar1` (Apply All, `DisplayMode.Disabled`), the per-country Apply item
 * (`ItemEnabled: false`), their two confirmations, their commented-out `Fabric Sync Jobs` patches
 * and `ForCountriestriggerFabricrecalculationsforProjects` calls, AND the "Currently
 * recalculating…" badge (`Icon3_1`, which only shows jobs that Apply would create) are not
 * ported.
 *
 * NO SERVER AUTOMATION: no flow and no plugin step fires on `vsb_milestonesstandardassumptions`
 * (ProjectDocs/migration-plans/04-flow-inventory.md, verified 19 Oct 2026).
 * HIDDEN CONTROLS: `but_Admin_MilestoneAssumption_Form_Buttons_Reset` (`Select()`ed by Close,
 * Cancel and Save to reset the editor) → the screen clears the edit map on every close;
 * `lbl_CountryGuid_MilestoneStandardAssumptions_AdminScreen` (holds each card's country id) →
 * the card already has the id.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `col_MilestoneAssumtionsUpdates` and its SENTINEL STRINGS (`"invalid duration"` /
 *    `"invalid success rate"` written INTO the data). Replaced by a typed edit map whose
 *    validity is a boolean on the entry — see `MilestoneEdit`.
 *  - `fn_Numeric_MS`, referenced 3× but DECLARED ON ANOTHER SCREEN (`Project Main
 *    Screen`). `@/domain/powerFxNumeric` replaces it.
 *  - the ~18 in-formula `LookUp`s per assumption row in the Save `ForAll`.
 */
import { isTwoDecimal, inRange, isBlank } from "@/domain/powerFxNumeric";
import { ES_ADMIN, MILESTONE_ROW_NAME } from "@/data/dataverseNames";
import { canEditCountry, type CurrentUser } from "@/domain/session";
import { emptyPlan, refusePlan as refuse, type WritePlan } from "@/data/writePlan";
import { Vsb_milestonesstandardassumptionsesvsb_technology as TECHNOLOGY_LABELS } from "@/generated/models/Vsb_milestonesstandardassumptionsesModel";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_MilestonesStandardAssumptions` logical names, checked against the generated model. */
export const MILESTONE_COL = {
  /** Note the PLURAL entity name: `…assumptionsid` (corrected 19 Oct 2026; was `…assumptionid`). */
  id: "vsb_milestonesstandardassumptionsid",
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
  /**
   * The column whose DISPLAY name is "Sales End" (the canvas reads `'Sales End'`) has the
   * logical name `vsb_salesduration`. Corrected 19 Oct 2026 — the previous `vsb_salesend` does
   * not exist, so a save would have failed.
   */
  salesEnd: "vsb_salesduration",
} as const;

export const MILESTONE_ENTITY_SET = ES_ADMIN.milestonesStandardAssumptions;

/* ══════════════════════════════════════════════════════════ the label↔column map ════ */

/**
 * The nine field keys, in the fixed order the grid renders them (rule 2). "Sales Duration" is the
 * canvas's own internal `Label` (`{Label: "Sales Duration", Duration: Durations.'Sales End'}`);
 * the visible header and editor label are "Sales End".
 */
export type MilestoneField =
  | "Cluster 1" | "Cluster 2" | "Cluster 3" | "Cluster 4"
  | "FID" | "Cluster 5" | "Operational Lifetime" | "Sales Start" | "Sales Duration";

/** Rule 2 — the field↔column map, declared in ONE place. */
export const MILESTONE_FIELD_COLUMN: Record<MilestoneField, string> = {
  "Cluster 1": MILESTONE_COL.cluster1,
  "Cluster 2": MILESTONE_COL.cluster2,
  "Cluster 3": MILESTONE_COL.cluster3,
  "Cluster 4": MILESTONE_COL.cluster4,
  FID: MILESTONE_COL.finalInvestmentDecision,
  "Cluster 5": MILESTONE_COL.cluster5,
  "Operational Lifetime": MILESTONE_COL.operationalLifetime,
  "Sales Start": MILESTONE_COL.salesStart,
  "Sales Duration": MILESTONE_COL.salesEnd,
};

/**
 * The canvas input control name part per field —
 * `txt_Admin_MilestoneAssumption_Form_Fields_{Durations|SuccessRates}_<part>_Input`.
 */
export const MILESTONE_INPUT_NAME: Record<MilestoneField, string> = {
  "Cluster 1": "Cluster1", "Cluster 2": "Cluster2", "Cluster 3": "Cluster3", "Cluster 4": "Cluster4",
  FID: "FID", "Cluster 5": "Cluster5", "Operational Lifetime": "OperationalLifetime",
  "Sales Start": "SalesStart", "Sales Duration": "SalesEnd",
};

export const milestoneInputTestId = (kind: "duration" | "successRate", field: MilestoneField): string =>
  `txt_Admin_MilestoneAssumption_Form_Fields_${kind === "duration" ? "Durations" : "SuccessRates"}_${MILESTONE_INPUT_NAME[field]}_Input`;

/** The nine duration columns, in render order. */
export const DURATION_FIELDS: readonly MilestoneField[] = [
  "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "FID", "Cluster 5",
  "Operational Lifetime", "Sales Start", "Sales Duration",
];

/**
 * Rule 4 — the editor's success-rate section renders `Cluster 1`…`Cluster 4` ONLY, while the
 * durations section renders all nine.
 */
export const SUCCESS_RATE_FIELDS: readonly MilestoneField[] = [
  "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4",
];

/**
 * The editor spells two of the nine fields differently from their key: "FID" is written out as
 * "Final Investment Decision", and "Sales Duration" is labelled "Sales End".
 */
export function milestoneFieldDisplayLabel(field: MilestoneField): string {
  if (field === "FID") return "Final Investment Decision";
  if (field === "Sales Duration") return "Sales End";
  return field;
}

/** `txt_…_Input.MaxLength: =gblAppConstants.DefaultDefMaxLength` (App.pa.yaml) — 256. */
export const INPUT_MAX_LENGTH = 256;

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
  /** `Value(Key)` — `Key` is `vsb_title`; see `countryOrder`. */
  order: number | null;
  key: number | null;
}

/** The pivot's output: one entry per technology, with both series. */
export interface TechnologyMilestones {
  technology: number | null;
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

export { emptyPlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /** `lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage.Text` — verbatim. */
  invalidDuration: "Enter a positive value without decimals",
  /** `lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage.Text` — verbatim. */
  invalidSuccessRate: "Enter a value between 0 and 1 with a maximum of 2 decimals",
  /** NEW — no canvas equivalent: the save plan's refusal without the admin rule */
  outOfScope: "You do not have permission to change the milestone assumptions.",
  /** NEW — no canvas equivalent: the code app says why Save is refused */
  noEdits: "Nothing has been changed yet.",
  /** NEW — no canvas equivalent: empty state for a country with no assumptions */
  emptyCountry: "This country has no milestone assumptions yet.",
  /** NEW — no canvas equivalent: rule 19 load-error state */
  loadFailedTitle: "Milestone assumptions are unavailable",
  /** NEW — no canvas equivalent: rule 19 load-error state */
  loadFailedDescription: "The milestone assumptions could not be loaded. Please try again.",
  /** `lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterDurations.Text` — verbatim. */
  durationsSectionTitle: "Cluster Durations [months]",
  /** `lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterSuccessRates.Text` — verbatim. */
  successRateSectionTitle: "Cluster Probabilities - Success Rate [-]",
  /**
   * `pcf_but_…_Save.OnChange` success text. SOURCE DEFECT, FIXED (D21): the canvas misspells
   * "Standart" and clears the text in the same step, so it was never seen; the code app shows it.
   */
  saved: "Milestone Standard Assumptions were successfully saved.",
} as const;

/** Save progress — canvas `$"Milestone Standart Assumptions for '{Name}' will be saved, please wait..."` ("Standart" corrected). */
export const savingText = (countryName: string): string =>
  `Milestone Standard Assumptions for '${countryName}' will be saved, please wait...`;

/**
 * Save failure — canvas `$"Error: Milestone Standart Assumptions could not be saved. Internal
 * error: originated on {FirstError.Source}. Message: {…}"` ("Standart" corrected; the code app
 * passes the error detail).
 */
export const saveErrorText = (detail: string): string =>
  `Error: Milestone Standard Assumptions could not be saved. Internal error: ${detail}`;

/** The panel's title bar, `"Edit Milestones for " & countryName`. */
export const editMilestonesTitle = (countryName: string): string =>
  `Edit Milestones for ${countryName}`;

/* ═══════════════════════════════════════════════════════════════════ the pivot ════ */

/**
 * `Value(Key)` — the canvas coerces the country's text `Key` (`vsb_title`) to a number for the
 * sort. A key that is not a number becomes blank.
 */
export function countryOrder(title: string | null | undefined): number | null {
  const v = (title ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rule 1 — `SortByColumns(…, "Order", SortOrder.Ascending)`, numeric. Blank orders sort first,
 * as Power Fx sorts blanks before values in ascending order.
 */
export const sortCountries = (countries: CountryRow[]): CountryRow[] =>
  [...countries].sort((a, b) => {
    if (a.order === null || b.order === null) return a.order === b.order ? 0 : a.order === null ? -1 : 1;
    return a.order - b.order;
  });

const numberOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Rules 1–3 — the pivot: `GroupBy(Filter(…, Country = …), Technology, Techs)` then, per group,
 * the `"average duration [months]"` and `"success rate [-]"` rows. THE ROW'S NAME IS ITS TYPE.
 * Rule 3: FID's success rate is the LITERAL 1. A missing success-rate row yields
 * `successRate: undefined` rather than throwing.
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
      if (label === "FID") return { label, duration, successRate: 1 };
      const successRate = successRates === null ? undefined : numberOrNull(successRates.values[column]);
      return { label, duration, successRate };
    });
    out.push({ technology, durationRowId: durations?.id ?? null, successRateRowId: successRates?.id ?? null, entries });
  }
  return out.sort((a, b) => (a.technology ?? 0) - (b.technology ?? 0));
}

const text = (v: number | null | undefined): string => (v === null || v === undefined ? "" : String(v));
const textOrDash = (v: number | null | undefined): string => (v === null || v === undefined ? "-" : String(v));

/**
 * The read-only grid's two-line cell, exactly as each canvas cell builds it:
 *   Cluster 1–4            `{Duration}` / `{SuccessRate}`
 *   FID                    `{Coalesce(Duration, 0.75)}` / `1`
 *   Cluster 5              `{Duration}` / `1` (literal)
 *   Operational Lifetime   `{Coalesce(Text(D), "-")}` / `{Coalesce(Text(SR), "-")}`
 *   Sales Start, Sales End `{Coalesce(Text(D), "-")}` / `-`
 */
export function summaryCellText(entry: MilestoneEntry | undefined): [string, string] {
  if (!entry) return ["", ""];
  switch (entry.label) {
    case "FID": return [String(entry.duration ?? 0.75), "1"];
    case "Cluster 5": return [text(entry.duration), "1"];
    case "Operational Lifetime": return [textOrDash(entry.duration), textOrDash(entry.successRate)];
    case "Sales Start":
    case "Sales Duration": return [textOrDash(entry.duration), "-"];
    default: return [text(entry.duration), text(entry.successRate)];
  }
}

/**
 * The editor's starting value. Cluster 1–4 (both sections) show the stored value as is; FID,
 * Cluster 5, Operational Lifetime, Sales Start and Sales End show `Coalesce(ThisItem.'…', "0")`.
 */
export function initialInputValue(row: AssumptionRow, field: MilestoneField, kind: "duration" | "successRate"): string {
  const v = row.values[MILESTONE_FIELD_COLUMN[field]];
  const isCluster1to4 = (SUCCESS_RATE_FIELDS as readonly string[]).includes(field);
  if (kind === "duration" && !isCluster1to4) return v === null || v === undefined ? "0" : String(v);
  return v === null || v === undefined ? "" : String(v);
}

/** The `Technology` choice's label, from the generated model ("Wind", "PV", "BESS", …), or an em dash. */
export function technologyDisplayName(value: number | null): string {
  if (value === null) return "—";
  return (TECHNOLOGY_LABELS as Record<number, string>)[value] ?? "—";
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
 * Rule 7's duration validator — `IsMatch(Self.Value, "^\d+$")`, with no trim (as the canvas:
 * " 5" is rejected). Digits only. DIVERGENCE kept from the canvas: the message says "positive"
 * but 0 is accepted (D21).
 */
export const isValidDuration = (input: string): boolean => /^\d+$/.test(input ?? "");

/**
 * Rule 7's success-rate validator —
 * `And(Not(IsBlank(v)), fn_Numeric_MS.IsTwoDecimal(v), fn_Numeric_MS.InRange(v, 0, 1))`, where
 * `IsTwoDecimal` follows `Language()` (dot for "en", comma otherwise). BLANK IS INVALID.
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

/** Rule 6 — the journal is an UPSERT keyed on `(assumptionGuid, field)`. */
export function upsertEdit(edits: EditMap, edit: MilestoneEdit): Map<string, MilestoneEdit> {
  const next = new Map(edits);
  next.set(editKey(edit.rowId, edit.field), edit);
  return next;
}

/**
 * The Save gate — disabled while either invalid message shows or nothing was edited. Any single
 * bad cell blocks the whole country's save (preserved).
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

/** Country scope — NOT wired (the canvas lets every admin edit every country); kept for reuse. */
export function canEditScope(user: CurrentUser | null, countryId: string | null): boolean {
  if (!user) return false;
  return canEditCountry(user, countryId ?? undefined);
}

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Rule 8 — the save, as one PATCH per changed row carrying ONLY the changed columns. (The canvas
 * Patches every row of the country, mostly with empty bodies.) An invalid entry can never reach
 * the `Value(...)` coercion: the plan is refused while any entry is invalid.
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

/* ═════════════════════════════════════════════════════════ screen captions (canvas) ════ */

/** The remaining visible strings of the canvas screen, verbatim (CONVENTIONS rule 7). */
export const MILESTONE_SCREEN_TEXT = {
  /** `cmp_Admin_Milestones_Header.Project` → `Name: "Milestones"`. */
  title: "Milestones",
  /** `cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar.Items` → Edit. */
  edit: "Edit",
  /** The summary header labels, in their X order. */
  technology: "Technology",
  summaryHeaders: [
    "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "FID", "Cluster 5",
    "Operational Lifetime", "Sales Start", "Sales End",
  ] as readonly string[],
  /** `lbl_SubLabelsValue_MilestonesStandardAssumptions_AdminScreen.Text` — two lines. */
  subLabelDuration: "Duration [months]",
  subLabelSuccessRate: "Success Rate [-]",
  /** `pcf_but_Admin_MilestoneAssumption_Form_Buttons_{Save,Cancel}.Text`. */
  save: "Save",
  cancel: "Cancel",
} as const;
