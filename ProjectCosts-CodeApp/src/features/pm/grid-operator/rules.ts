/**
 * Grid Operator Screen — every business rule as a pure function (connected 20 Oct 2026, D32).
 *
 * Canvas screen: `Grid Operator Screen` (PM app, solution 1.21.709)
 *   68 controls · 0 hidden · no flow call · no gallery
 *
 * One `Grid Operators` row per project, two tabs, ten writable fields, one Save, one Cancel.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colGridOperatorFormValidation`, the ten-row `{Name, Dirty, Valid}` table, and its
 *    priming idiom `Collect(colGridOperatorFormValidation, Blank())`. Dirty and valid are
 *    computed from the form and the server row (`dirtyFields`, `validateForm`).
 *  - The ten per-control `Reset()` calls inside `Concurrent(...)` on OnVisible and Cancel.
 *    Cancel is `toForm(record)`.
 *  - DIVERGENCE (carried over, as Planning D31): `locGridOperatorTabSelected` is reset to
 *    `"operatorTab"` on every visit in the canvas; here the tab is a `?tab=` search param so it
 *    survives a reload (`parseTab`).
 *
 * SOURCE DEFECTS fixed — each is commented at its rule, with a `…CanvasParity` twin:
 *  1. the Operator field updated the `GridExpansionRequired` validation row (`dirtyFields`)
 *  2. REVERTED (D32 R1, product owner 20 Oct 2026): the Grid Connection tab has no `DisplayMode`
 *     gating at all, so its six fields stay editable on a locked / Draft project, as the canvas
 *     (`canEditField`; the earlier fix is the documented twin `canEditFieldAllGated`)
 *  3. the lock banner's `Height` and `Visible` test different columns (`pageLock`)
 *  4. `canSave` omitted the grid-voltage error label (`canSave`)
 *  5. `Text(0, "#")` shows a stored 0 as blank, and the next Save writes it back blank
 *     (`formatDecimal`)
 *  6. Cancel stays disabled for the rest of the visit after one save (`canCancel`)
 *
 * NUMBER NOTATION: the screen formats, validates and parses in en-US (dot) notation, as the
 * other connected PM screens do (Planning D31). The canvas `fn_Numeric` branches on
 * `Language()`; the voltage guard itself hard-codes the comma test ("dot should be used
 * instead").
 */
import {
  isNumeric, isDecimalWithPlaces, inRange, parseNumber, isBlank, type Lang,
} from "@/domain/powerFxNumeric";
import { CHOICE_PROCESS, ES, TEXT_MAX_LENGTH } from "@/data/dataverseNames";
import { bind } from "@/data/odata";
import { refusePlan, type WritePlan } from "@/data/writePlan";
import type { PlanJob } from "@/data/usePlanWrite";
import { textFormat } from "@/features/pm/generators/rules";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/**
 * `vsb_GridOperator` logical names — verified against the generated
 * `src/generated/models/Vsb_gridoperatorsModel.ts` (registered 20 Oct 2026, D32).
 *
 * The display name → logical name mapping is not mechanical: `'Voltage level [kV]'` is
 * `vsb_voltagelevel` (no `kv` suffix), `Operator` is `vsb_operator`, and the table's own
 * `Name` column (`vsb_name`) is an autonumber Id.
 */
export const GRID_OPERATOR_COL = {
  id: "vsb_gridoperatorid",
  /** Autonumber `Id`. Never written by this screen. */
  name: "vsb_name",
  operator: "vsb_operator",
  voltageLevel: "vsb_voltagelevel",
  expansionRequired: "vsb_expansionrequired",
  expansionDetails: "vsb_expansiondetails",
  substationConstructionRequired: "vsb_substationconstructionrequired",
  substationOperator: "vsb_substationoperator",
  lengthInternal: "vsb_lengthinternalcabeling",
  diameterInternal: "vsb_diameterinternalcabeling",
  lengthExternal: "vsb_lengthexternalcabeling",
  diameterExternal: "vsb_diameterexternalcabeling",
  project: "_vsb_projectid_value",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** Lookup navigation properties — Dataverse writes them as `<Nav>@odata.bind`. */
export const GRID_OPERATOR_LOOKUP = {
  project: "vsb_ProjectId",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `MaxLength: gblAppConstants.DefaultMaxLength` (55) on Operator, Grid expansion details and Substation operator. */
export const CHAR_MAX_LENGTH = TEXT_MAX_LENGTH.default;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** The project fields this screen reads — the five lock prerequisites plus the BU. */
export interface GridOperatorProject {
  id: string;
  /** `'Project ID'` (`vsb_name`) — blank until General Data is saved. */
  projectNumber: string | null;
  /** `'End Date'` — the Milestones prerequisite. See `pageLock`. */
  endDate: string | null;
  /** `'Project Start Date'` — what the banner's HEIGHT formula tests instead. */
  projectStartDate: string | null;
  totalCapacity: number | null;
  netYieldP50: number | null;
  clusterStateName: string | null;
  /** `'Besitzer (Unternehmenseinheit)'` → every write's `Owning Business Unit`. */
  owningBusinessUnitId: string | null;
}

/** The server row, narrowed. `null` is a normal state — most projects have no row yet. */
export interface GridOperatorRecord {
  id: string;
  operator: string | null;
  voltageLevel: number | null;
  expansionRequired: number | null;
  expansionDetails: string | null;
  substationConstructionRequired: number | null;
  substationOperator: string | null;
  lengthInternal: number | null;
  diameterInternal: number | null;
  lengthExternal: number | null;
  diameterExternal: number | null;
}

/**
 * The form DTO. Numerics are the raw TEXT the user typed, exactly as the canvas text
 * inputs held them, so `"1,5"` can be rejected as a decimal-separator mistake rather
 * than silently coerced. `buildPayload` is the only place text becomes `number | null`.
 */
export interface GridOperatorForm {
  operator: string;
  voltageLevel: string;
  expansionRequired: number | null;
  expansionDetails: string;
  substationConstructionRequired: number | null;
  substationOperator: string;
  lengthInternal: string;
  diameterInternal: string;
  lengthExternal: string;
  diameterExternal: string;
}

export type GridOperatorField = keyof GridOperatorForm;

/** The ten `colGridOperatorFormValidation` row names, in the source's order. */
export const FIELDS: GridOperatorField[] = [
  "operator", "voltageLevel", "expansionRequired", "expansionDetails",
  "substationConstructionRequired", "substationOperator",
  "lengthInternal", "diameterInternal", "lengthExternal", "diameterExternal",
];

/** Which tab each field lives on — the basis of the Grid Connection gating fix. */
export const OPERATOR_TAB_FIELDS: GridOperatorField[] = [
  "operator", "voltageLevel", "expansionRequired", "expansionDetails",
];
export const CONNECTION_TAB_FIELDS: GridOperatorField[] = [
  "substationConstructionRequired", "substationOperator",
  "lengthInternal", "diameterInternal", "lengthExternal", "diameterExternal",
];

export interface FieldValidity {
  valid: boolean;
  /** `undefined` when nothing is rendered — a blank field shows no inline error. */
  message?: string;
}

export type FormValidity = Record<GridOperatorField, FieldValidity>;

/* ══════════════════════════════════════════════════════════════════ messages ════ */

/** `gblAppResx` and the literal strings, verbatim. */
export const MSG = {
  /** `lbl_GridOperator_DisplayProjectBodyRightContent_GridVoltage_ErrorMessage.Text` — verbatim. */
  numeric: "Value must be numeric.",
  /** `gblAppResx.NumericThreeDecimals` (App.pa.yaml) — verbatim. */
  threeDecimals: "Numeric value with maximum of three decimals",
  /** `gblAppResx.NumericOneDecimals` (App.pa.yaml) — verbatim. */
  oneDecimal: "Numeric value with maximum of one decimals",
  /** `lbl_…_LengthInternalCabeling_ErrorMessage.Text` / `…LengthExternal…` — verbatim. */
  lengthRange: "Please select a value between 0 and 99.",
  /** `lbl_…_DiameterInternalCabeling_ErrorMessage.Text` / `…DiameterExternal…` — verbatim. */
  diameterRange: "Please select a value between 0 and 999.",
  /**
   * NOT in the canvas, which let any number through and failed on Save with Dataverse's
   * `DecimalValueOutOfRange` (27 Oct 2026). Worded like the two range messages above.
   */
  voltageRange: "Please select a value between -100000000000 and 100000000000.",
} as const;

/** `vsb_gridoperator.vsb_voltagelevel`'s Dataverse range (decimal column). */
export const VOLTAGE_MIN = -100_000_000_000;
export const VOLTAGE_MAX = 100_000_000_000;

/** `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.OnChange` `Notify(…, Success, 1000)` — verbatim. */
export const SAVE_SUCCESS = "Grid operator data was saved successfully!";
/**
 * `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.OnChange` — the `IfError` branch:
 * `Notify("Error: Grid operator data could not be saved. " & "Internal error: originated on " &
 * FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse, Error)`.
 * Verbatim prefix, trailing space included. (The earlier comment here said the canvas had no
 * error Notify; it has.)
 */
export const SAVE_ERROR_PREFIX = "Error: Grid operator data could not be saved. ";

/**
 * The canvas error text. The table name stands in for `FirstError.Source`, as on General Data
 * (D25), Team (D30) and Planning (D31).
 */
export const saveErrorText = (detail: string): string =>
  `${SAVE_ERROR_PREFIX}Internal error: originated on ${ES.gridOperators}. Message: ${detail}`;

/** `cmp_PopUp_Leave_GridOperator_Confirmation.Description` — verbatim (rendered via `LEAVE_DIALOG`, D35). */
export const LEAVE_CONFIRMATION =
  "You have unsaved data. Do you really want to leave current form without saving?";

/** NEW (D32): the plan refusal — not reachable through the UI, which disables Save first. */
export const REFUSAL = {
  noProject: "No project is selected.",
} as const;

/** NEW (D32, rule 19): the load-error state. The canvas has none. */
export const GRID_OPERATOR_SCREEN_TEXT = {
  loadFailedTitle: "Grid operator data is unavailable",
  loadFailedDescription: "The grid operator data could not be loaded. Reload the page to try again.",
} as const;

/* ══════════════════════════════════════════════════════ number presentation ════ */

/**
 * The canvas display switch, which differs by field precision:
 *   `'Voltage level [kV]'` and both DIAMETERS: `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0#"))`
 *   both LENGTHS:                              `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0##"))`
 *
 * `Text()` ROUNDS (`Text(1.2345, "#0.0##")` is `1.235`); this used to truncate, citing a spec
 * test rather than the canvas — corrected (D32), as Planning's height (D31).
 *
 * SOURCE DEFECT: `Text(0, "#")` prints nothing, so a stored 0 opens blank — and because the
 * canvas Save writes `Value(<every field>)`, the next save of ANY field writes that 0 back as
 * blank. Here 0 shows "0". `formatDecimalCanvasParity` is the literal formula.
 */
export function formatDecimal(
  value: number | null | undefined,
  maxFractionDigits: 2 | 3,
  language: Lang = "en-US",
): string {
  if (value === 0) return "0";
  return formatDecimalCanvasParity(value, maxFractionDigits, language);
}

export function formatDecimalCanvasParity(
  value: number | null | undefined,
  maxFractionDigits: 2 | 3,
  language: Lang = "en-US",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return textFormat(value, "#", language);
  return textFormat(value, maxFractionDigits === 2 ? "#0.0#" : "#0.0##", language);
}

/** `'Voltage level [kV]'` and the two diameters — one to two fraction digits. */
export const formatTwoPlaces = (v: number | null | undefined, language: Lang = "en-US") => formatDecimal(v, 2, language);
/** The two lengths — one to three fraction digits. */
export const formatThreePlaces = (v: number | null | undefined, language: Lang = "en-US") => formatDecimal(v, 3, language);

/* ════════════════════════════════════════════════════════════════ validation ════ */

/**
 * Grid voltage. `lbl_…_GridVoltage_ErrorMessage.Visible`:
 * `And(Not(IsBlank(v)), Or(Not(IsNumeric(v)), IsMatch(v, ",", Contains)))`, message
 * `"Value must be numeric."`. The comma test is the decimal-separator guard ("dot should be
 * used instead").
 *
 * A blank value shows no message but is NOT valid: the canvas validation row for
 * `GridVoltage` is `And(Not(IsBlank(Self.Value)), IsNumeric(Self.Value))`, so a blank voltage
 * marks the row invalid and blocks Save once the field is touched.
 */
export function validateVoltage(text: string): FieldValidity {
  if (isBlank(text)) return { valid: false };
  if (!isNumeric(text, "en-US") || text.includes(",")) {
    return { valid: false, message: MSG.numeric };
  }
  // The column's range, so an out-of-range value is caught here rather than failing the Save.
  if (!inRange(text, VOLTAGE_MIN, VOLTAGE_MAX, "en-US")) return { valid: false, message: MSG.voltageRange };
  return { valid: true };
}

/**
 * Length internal/external: at most three decimals, range 0…99.
 *
 * The error label is one condition with two messages: a decimal failure shows
 * `gblAppResx.NumericThreeDecimals`, otherwise the range message. The decimal check is
 * evaluated FIRST, so `"1.2345"` reports the decimals message.
 */
export function validateLength(text: string, language: Lang = "en-US"): FieldValidity {
  if (isBlank(text)) return { valid: false };
  if (!isDecimalWithPlaces(text, 3, language)) {
    return { valid: false, message: MSG.threeDecimals };
  }
  if (!inRange(text, 0, 99, language)) return { valid: false, message: MSG.lengthRange };
  return { valid: true };
}

/**
 * Diameter internal/external: at most one decimal, range 0…999.
 *
 * SOURCE INCONSISTENCY, kept (D32 R2, product owner 20 Oct 2026: canvas validation, one decimal):
 * the diameter DISPLAY format is `#0.0#` (up to TWO fraction digits) and the column holds two
 * decimals (`Accuracy` 2 in `customizations.xml`), while the canvas validator is
 * `fn_Numeric_GridOperator.IsOneDecimal` (Y:1196, 1409). A stored `12.75` (written by another
 * source) renders as `12.75` and then fails its own validation until it is retyped.
 */
export function validateDiameter(text: string, language: Lang = "en-US"): FieldValidity {
  if (isBlank(text)) return { valid: false };
  if (!isDecimalWithPlaces(text, 1, language)) {
    return { valid: false, message: MSG.oneDecimal };
  }
  if (!inRange(text, 0, 999, language)) return { valid: false, message: MSG.diameterRange };
  return { valid: true };
}

/** Free text and choice fields: the canvas validation expression is a literal `true`. */
const ALWAYS_VALID: FieldValidity = { valid: true };

/**
 * The whole ten-row validation table in one pure function.
 *
 * In the canvas the five free-text / choice rows are `{Valid: true}` unconditionally; the
 * numeric rows are `And(Not(IsBlank(v)), IsNumeric(v))`, so a blank numeric row IS invalid —
 * but only once its `OnChange` has fired. A never-touched blank numeric field keeps the
 * `Valid: true` it was seeded with in `OnVisible`. `touched` reproduces that.
 */
export function validateForm(
  form: GridOperatorForm,
  touched: ReadonlySet<GridOperatorField> = new Set(),
  language: Lang = "en-US",
): FormValidity {
  const numeric = (
    field: GridOperatorField,
    value: string,
    validate: (t: string, l?: Lang) => FieldValidity,
  ): FieldValidity => {
    if (isBlank(value) && !touched.has(field)) return ALWAYS_VALID;
    return validate(value, language);
  };

  return {
    operator: ALWAYS_VALID,
    expansionRequired: ALWAYS_VALID,
    expansionDetails: ALWAYS_VALID,
    substationConstructionRequired: ALWAYS_VALID,
    substationOperator: ALWAYS_VALID,
    voltageLevel: numeric("voltageLevel", form.voltageLevel, (t) => validateVoltage(t)),
    lengthInternal: numeric("lengthInternal", form.lengthInternal, validateLength),
    diameterInternal: numeric("diameterInternal", form.diameterInternal, validateDiameter),
    lengthExternal: numeric("lengthExternal", form.lengthExternal, validateLength),
    diameterExternal: numeric("diameterExternal", form.diameterExternal, validateDiameter),
  };
}

/** The fields whose validation row is invalid, in the source's field order. */
export function invalidFields(validity: FormValidity): GridOperatorField[] {
  return FIELDS.filter((f) => !validity[f].valid);
}

/** Every inline message currently rendered. */
export function validationMessages(validity: FormValidity): string[] {
  return FIELDS.map((f) => validity[f].message).filter((m): m is string => Boolean(m));
}

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

/** `lbl_ProjectRevenues_…_VisibilityMessage_27.Text` — verbatim. */
export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";
export const PAGE_LOCK_TITLE_TESTID = "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_27";
export const PAGE_LOCK_TESTID = "con_Milestones_Page_LockMessage_6";
export const PAGE_LOCK_ICON_TESTID = "icon_milestones_lock_6";

export type PageLockReason = "General" | "Milestones" | "Generator" | "Production" | "Draft";

export interface PageLockEntry { reason: PageLockReason; label: string; testId: string }

const LOCK_LINE = (n: number) => `lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_${n}`;

/**
 * `con_Milestones_Page_LockMessage_6.Visible` and its five bullets (`…VisibilityMessage_28`–`_32`):
 * `'Project ID'` blank, or `'End Date'` blank, or `'Total Capacity'` 0/blank, or
 * `'Net Yield p50'` 0/blank, or `'Cluster State'.Name` blank or `"Draft"`. With no project every
 * condition is blank, so all five show (corrected D32: it showed only "• General").
 *
 * SOURCE DEFECT: the banner's `Height` switch tests `IsBlank('Project Start Date')` for the
 * Milestones slot while its `Visible` — and the bullet label — tests `IsBlank('End Date')`.
 * Resolved to `'End Date'`, as Team (D30) and Planning (D31). `pageLockCanvasHeightParity`
 * keeps the height condition. The invented per-bullet hints were removed (the canvas shows none).
 */
export function pageLock(project: GridOperatorProject | null): PageLockEntry[] {
  const p = project;
  const out: PageLockEntry[] = [];
  if (isBlank(p?.projectNumber)) out.push({ reason: "General", label: "• General", testId: LOCK_LINE(28) });
  if (isBlank(p?.endDate)) out.push({ reason: "Milestones", label: "• Milestones", testId: LOCK_LINE(29) });
  if (!p?.totalCapacity) out.push({ reason: "Generator", label: "• Generator", testId: LOCK_LINE(30) });
  if (!p?.netYieldP50) out.push({ reason: "Production", label: "• Production", testId: LOCK_LINE(31) });
  if (isBlank(p?.clusterStateName) || p?.clusterStateName === "Draft") {
    out.push({ reason: "Draft", label: "• Change the project status from Draft", testId: LOCK_LINE(32) });
  }
  return out;
}

export const isPageLocked = (project: GridOperatorProject | null): boolean =>
  pageLock(project).length > 0;

/** The canvas banner's HEIGHT condition, kept so the divergence above is testable. */
export function pageLockCanvasHeightParity(project: GridOperatorProject | null): boolean {
  if (!project) return true;
  return (
    isBlank(project.projectNumber) ||
    isBlank(project.projectStartDate) ||
    !project.totalCapacity ||
    !project.netYieldP50 ||
    isBlank(project.clusterStateName) ||
    project.clusterStateName === "Draft"
  );
}

/** `'Cluster State'.Name` is blank or `"Draft"` — the clause the DisplayMode rule adds. */
export const isDraft = (project: GridOperatorProject | null): boolean =>
  !project || isBlank(project.clusterStateName) || project.clusterStateName === "Draft";

/* ═══════════════════════════════════════════════════════════════════ gating ════ */

export interface GatingState {
  project: GridOperatorProject | null;
  /** `gblCurrentUser.CanEditSelectedProject` — passes in this app (D1, `GRID_OPERATOR_CAN_EDIT`). */
  canEdit: boolean;
}

/**
 * `If(Or(IsBlank('Cluster State'.Name), 'Cluster State'.Name = "Draft",
 *       con_Milestones_Page_LockMessage_6.Visible), DisplayMode.Disabled, DisplayMode.Edit)`
 *
 * In the canvas this expression is on the tab strip and on the four Grid Operator tab controls
 * ONLY. The six Grid Connection controls carry no `DisplayMode` at all (checked in
 * `Grid Operator Screen.pa.yaml`, Y:935-1507: no `DisplayMode`, no lock or Draft validation),
 * so they stay editable on a locked or Draft project (reachable through `?tab=` or by standing
 * on the tab when the lock appears). Save stays disabled there (its own `DisplayMode` tests
 * Draft and the lock), so nothing typed can be saved.
 *
 * CANVAS BEHAVIOUR (D32 R1, product owner 20 Oct 2026): lock them only if the canvas has a
 * validation that locks them — it has none, so the earlier fix (SOURCE DEFECT 2) is reverted.
 * `canEditFieldAllGated` keeps that fix as a documented, NOT LIVE twin.
 *
 * `canEdit` is folded in as well; it is the constant `true` here (D1), so it changes nothing
 * today. The canvas read it on the Save button only.
 */
export function canEditField(state: GatingState, field: GridOperatorField): boolean {
  if (!state.canEdit) return false;
  return canEditFieldCanvasParity(state, field);
}

/**
 * NOT LIVE — the reverted D32 fix: every field, the six Grid Connection ones included, gated like
 * the Grid Operator tab.
 */
export function canEditFieldAllGated(state: GatingState, _field: GridOperatorField): boolean {
  void _field; // every field is gated identically
  if (!state.canEdit) return false;
  if (isDraft(state.project)) return false;
  return !isPageLocked(state.project);
}

/** The canvas's actual per-field gating (no `canEdit`). */
export function canEditFieldCanvasParity(
  state: GatingState,
  field: GridOperatorField,
): boolean {
  if (CONNECTION_TAB_FIELDS.includes(field)) return true; // no DisplayMode at all
  return !isDraft(state.project) && !isPageLocked(state.project);
}

/** `tab_GridOperator_DisplayProjectBodyRightContent_TabList.DisplayMode` — the tab strip. */
export const canSwitchTabs = (state: GatingState): boolean =>
  !isDraft(state.project) && !isPageLocked(state.project);

/* ════════════════════════════════════════════════════════════════════ dirty ════ */

/** The bound values (`Value: gblRecordGridOperator.<column>`), i.e. what Cancel restores. */
export function toForm(record: GridOperatorRecord | null, language: Lang = "en-US"): GridOperatorForm {
  if (!record) return emptyForm();
  return {
    operator: record.operator ?? "",
    voltageLevel: formatTwoPlaces(record.voltageLevel),
    expansionRequired: record.expansionRequired,
    expansionDetails: record.expansionDetails ?? "",
    substationConstructionRequired: record.substationConstructionRequired,
    substationOperator: record.substationOperator ?? "",
    lengthInternal: formatThreePlaces(record.lengthInternal, language),
    diameterInternal: formatTwoPlaces(record.diameterInternal, language),
    lengthExternal: formatThreePlaces(record.lengthExternal, language),
    diameterExternal: formatTwoPlaces(record.diameterExternal, language),
  };
}

/** `OnVisible`'s `Concurrent(Reset(...) × 10)` — the empty form for a project with no row. */
export function emptyForm(): GridOperatorForm {
  return {
    operator: "", voltageLevel: "", expansionRequired: null, expansionDetails: "",
    substationConstructionRequired: null, substationOperator: "",
    lengthInternal: "", diameterInternal: "", lengthExternal: "", diameterExternal: "",
  };
}

/**
 * The `Dirty` column of the deleted validation table, derived from the values (as D25 / D31):
 * reverting a value makes the form clean again (DIVERGENCE: the canvas stays dirty).
 *
 * SOURCE DEFECT: `txt_GridOperator_…_GridOperator.OnChange` is
 * `UpdateIf(colGridOperatorFormValidation, Name = "GridExpansionRequired", {Valid: true,
 * Dirty: true})` — editing Operator marked the GRID EXPANSION REQUIRED row dirty. FIXED by
 * construction; `dirtyFieldsCanvasParity` reproduces the mis-routing.
 */
export function dirtyFields(
  form: GridOperatorForm,
  baseline: GridOperatorForm,
): GridOperatorField[] {
  return FIELDS.filter((f) => form[f] !== baseline[f]);
}

export const isDirty = (form: GridOperatorForm, baseline: GridOperatorForm): boolean =>
  dirtyFields(form, baseline).length > 0;

/**
 * `cmp_PopUp_Leave_GridOperator_Confirmation` fires from the header logo and the left nav
 * whenever a row is dirty. The shared `UnsavedChangesGuard`'s condition (D35).
 */
export const shouldPromptOnLeave = (
  form: GridOperatorForm,
  baseline: GridOperatorForm,
): boolean => isDirty(form, baseline);

/** The canvas's mis-routed dirty attribution, for a parity test. */
export function dirtyFieldsCanvasParity(
  form: GridOperatorForm,
  baseline: GridOperatorForm,
): GridOperatorField[] {
  return dirtyFields(form, baseline).map((f) =>
    // The Operator handler wrote to the GridExpansionRequired row.
    f === "operator" ? "expansionRequired" : f,
  );
}

/* ═══════════════════════════════════════════════════════════════════ buttons ════ */

export interface SaveState {
  project: GridOperatorProject | null;
  canEdit: boolean;
  form: GridOperatorForm;
  baseline: GridOperatorForm;
  touched: ReadonlySet<GridOperatorField>;
  language?: Lang;
  /** True while the write is in flight. */
  busy?: boolean;
}

/**
 * `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.DisplayMode`:
 *   `gblCurrentUser.CanEditSelectedProject`
 *   `'Cluster State'.Name <> "Draft"`
 *   zero rows with `Valid = false`
 *   at least one row with `Dirty = true`
 *   all four cabling error labels hidden
 *   the page not locked
 *
 * SOURCE DEFECT: the list names the four CABLING error labels and omits the GRID VOLTAGE one,
 * so an invalid voltage passed Save whenever another field was dirty. Here every numeric field
 * blocks Save. `canSaveCanvasParity` keeps the omission.
 */
export function canSave(state: SaveState): boolean {
  if (state.busy) return false;
  if (!state.canEdit) return false;
  if (isDraft(state.project)) return false;
  if (isPageLocked(state.project)) return false;
  if (!isDirty(state.form, state.baseline)) return false;
  const validity = validateForm(state.form, state.touched, state.language);
  return invalidFields(validity).length === 0;
}

/** The canvas Save gate, with the grid-voltage omission intact. */
export function canSaveCanvasParity(state: SaveState): boolean {
  if (!state.canEdit) return false;
  if (isDraft(state.project)) return false;
  if (isPageLocked(state.project)) return false;
  if (!isDirty(state.form, state.baseline)) return false;
  const validity = validateForm(state.form, state.touched, state.language);
  return invalidFields(validity).every((f) => f === "voltageLevel");
}

/**
 * `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset.DisplayMode`:
 * `locAllowGridOperatorReset AND ≥1 Dirty`.
 *
 * SOURCE DEFECT: `locAllowGridOperatorReset` is set false by every successful Save and only
 * `OnVisible` sets it true again, so after one save Cancel stays disabled for the rest of the
 * visit however much is edited. Here Cancel follows the dirty state alone (as Planning D31).
 * `canCancelCanvasParity` keeps the flag.
 */
export const canCancel = (form: GridOperatorForm, baseline: GridOperatorForm): boolean =>
  isDirty(form, baseline);

export function canCancelCanvasParity(state: {
  allowReset: boolean;
  form: GridOperatorForm;
  baseline: GridOperatorForm;
}): boolean {
  return state.allowReset && isDirty(state.form, state.baseline);
}

/* ══════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Numeric columns go through `Value(...)`, so an EMPTY text box serialises to `null`, never
 * `0`. An unparseable value also serialises to `null` (`Value("abc")` is an error and `Patch`
 * writes blank) — unreachable, because Save is disabled while a field is invalid.
 */
export function numericColumn(text: string, language: Lang = "en-US"): number | null {
  if (isBlank(text)) return null;
  const n = parseNumber(text, language);
  return Number.isNaN(n) ? null : n;
}

/**
 * Text columns: `<control>.Value` as typed; blank is `null`. The input stops typing at 55
 * (`MaxLength`); the value is NOT cut on save, so a longer stored value (the columns hold
 * 100 / 100 / 256) is not truncated by an unrelated save (corrected D32, as Planning D31).
 */
const textColumn = (text: string): string | null => (isBlank(text) ? null : text);

/**
 * The Save `Patch('Grid Operators', If(IsBlank(rec), Defaults(...), rec), {...})` — the ten form
 * columns plus `Project` and `'Owning Business Unit': gblRecordSelectedProject.'Besitzer
 * (Unternehmenseinheit)'`, on create AND update, as the canvas writes them (corrected D32: the
 * binds were sent on create only). The business-unit bind is left out when the project has none.
 */
export function buildPayload(
  form: GridOperatorForm,
  project: GridOperatorProject,
  language: Lang = "en-US",
): Record<string, unknown> {
  return {
    [`${GRID_OPERATOR_LOOKUP.project}@odata.bind`]: bind(ES.projects, project.id),
    [GRID_OPERATOR_COL.operator]: textColumn(form.operator),
    // Voltage is dot-only in every language (validateVoltage bans the comma, as the canvas does).
    [GRID_OPERATOR_COL.voltageLevel]: numericColumn(form.voltageLevel, "en-US"),
    [GRID_OPERATOR_COL.expansionRequired]: form.expansionRequired,
    [GRID_OPERATOR_COL.expansionDetails]: textColumn(form.expansionDetails),
    [GRID_OPERATOR_COL.substationConstructionRequired]: form.substationConstructionRequired,
    [GRID_OPERATOR_COL.substationOperator]: textColumn(form.substationOperator),
    [GRID_OPERATOR_COL.lengthInternal]: numericColumn(form.lengthInternal, language),
    [GRID_OPERATOR_COL.diameterInternal]: numericColumn(form.diameterInternal, language),
    [GRID_OPERATOR_COL.lengthExternal]: numericColumn(form.lengthExternal, language),
    [GRID_OPERATOR_COL.diameterExternal]: numericColumn(form.diameterExternal, language),
    ...(project.owningBusinessUnitId
      ? { [`${GRID_OPERATOR_LOOKUP.owningBusinessUnit}@odata.bind`]: bind("businessunits", project.owningBusinessUnitId) }
      : {}),
  };
}

/** The Save as a plan: one update of the project's row, or one create when it has none. */
export function planSaveGridOperator(
  form: GridOperatorForm,
  project: GridOperatorProject | null,
  record: GridOperatorRecord | null,
  language: Lang = "en-US",
): WritePlan {
  if (!project?.id) return refusePlan(REFUSAL.noProject);
  const data = buildPayload(form, project, language);
  return {
    writes: [record?.id
      ? { op: "update", entitySet: ES.gridOperators, id: record.id, data, reason: "save the grid operator data" }
      : { op: "create", entitySet: ES.gridOperators, data, reason: "create the grid operator data" }],
    log: [],
  };
}

/**
 * The Save job. The canvas shows no progress text for this save (no loading pop-up on the
 * screen), so `progress` is empty: Save is disabled while it runs, nothing else is shown.
 */
export function saveGridOperatorJob(
  form: GridOperatorForm,
  project: GridOperatorProject | null,
  record: GridOperatorRecord | null,
  language: Lang = "en-US",
): PlanJob {
  return {
    progress: "",
    success: SAVE_SUCCESS,
    errorText: saveErrorText,
    plan: planSaveGridOperator(form, project, record, language),
  };
}

/* ═════════════════════════════════════════════════════════════════════ tabs ════ */

export type TabKey = "operator" | "connection";

export interface TabDescriptor { key: TabKey; label: string }

/**
 * `locGridOperatorTabListItems` — a local `Table(...)` of two rows (`OnVisible`). The
 * `TabValue`s were `"operatorTab"` / `"connectionTab"`; the URL keys drop the suffix.
 */
export const TABS: TabDescriptor[] = [
  { key: "operator", label: "Grid Operator" },
  { key: "connection", label: "Grid Connection" },
];

/** `?tab=` → a tab key. Anything unrecognised falls back to the first tab. */
export function parseTab(raw: string | null | undefined): TabKey {
  return raw === "connection" ? "connection" : "operator";
}

/* ════════════════════════════════════════════════════════════════ choice sets ════ */

/**
 * `Choices('Grid Expansion Required')` and `Choices('Substation construction required')` —
 * two option sets with the same values and labels (pinned to the generated
 * `Vsb_gridoperatorsvsb_expansionrequired` / `…_substationconstructionrequired` by UT-GRIDOP-040).
 */
export const YES_NO_UNKNOWN: { value: number; label: string }[] = [
  { value: CHOICE_PROCESS.yesNoUnknown.yes, label: "Yes" },
  { value: CHOICE_PROCESS.yesNoUnknown.no, label: "No" },
  { value: CHOICE_PROCESS.yesNoUnknown.unknown, label: "Unknown" },
];

/** The dropdown's shown value — blank when nothing is selected, as the canvas dropdown. */
export const choiceLabel = (value: number | null): string =>
  YES_NO_UNKNOWN.find((o) => o.value === value)?.label ?? "";

/** `$"{Len(value)}/{gblAppConstants.DefaultMaxLength}"` — the character counter. */
export const charCounter = (value: string): string =>
  `${value.length}/${CHAR_MAX_LENGTH}`;

/* ═══════════════════════════════════════════════════════════════ screen copy ════ */

/** Field captions — `lbl_GridOperator_DisplayProjectBodyRightContent_<Field>.Text`, verbatim. */
export const FIELD_LABEL: Record<GridOperatorField, string> = {
  /** `lbl_…_GridOperator.Text` */
  operator: "Grid Operator",
  /** `lbl_…_GridVoltage.Text` */
  voltageLevel: "Grid voltage level [kV]",
  /** `lbl_…_GridExpansionRequired.Text` */
  expansionRequired: "Grid expansion required",
  /** `lbl_…_GridExpansionDetails.Text` */
  expansionDetails: "Grid expansion details",
  /** `lbl_…_SubstationConstruction.Text` */
  substationConstructionRequired: "Substation construction required",
  /** `lbl_…_SubstationOperator.Text` */
  substationOperator: "Substation construction and operator",
  /** `lbl_…_LengthInternalCabeling.Text` — the canvas spelling "cabeling" is kept. */
  lengthInternal: "Length internal cabeling [km]",
  /** `lbl_…_DiameterInternalCabeling.Text` */
  diameterInternal: "Diameter internal cabeling [mm]",
  /** `lbl_…_LengthExternalCabeling.Text` */
  lengthExternal: "Length external cabeling [km]",
  /** `lbl_…_DiameterExternalCabeling.Text` */
  diameterExternal: "Diameter external cabeling [mm]",
};

/** The canvas control behind each field — its `data-testid` and (= its `AccessibleLabel`) `aria-label`. */
export const FIELD_CONTROL: Record<GridOperatorField, string> = {
  operator: "txt_GridOperator_DisplayProjectBodyRightContent_GridOperator",
  voltageLevel: "txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage",
  expansionRequired: "drp_GridOperator_DisplayProjectBodyRightContent_GridExpansionRequired",
  expansionDetails: "txt_GridOperator_DisplayProjectBodyRightContent_GridExpansionDetails",
  substationConstructionRequired: "drp_GridOperator_DisplayProjectBodyRightContent_SubstationConstruction",
  substationOperator: "txt_GridOperator_DisplayProjectBodyRightContent_SubstationOperator",
  lengthInternal: "txt_GridOperator_DisplayProjectBodyRightContent_LengthInternalCabeling",
  diameterInternal: "txt_GridOperator_DisplayProjectBodyRightContent_DiameterInternalCabeling",
  lengthExternal: "txt_GridOperator_DisplayProjectBodyRightContent_LengthExternalCabeling",
  diameterExternal: "txt_GridOperator_DisplayProjectBodyRightContent_DiameterExternalCabeling",
};

/** The remaining visible strings on the screen. */
export const SCREEN_MSG = {
  /** `txt_…_GridVoltage.Placeholder` (and the four cabling inputs) — verbatim. */
  numericPlaceholder: "0",
  /** `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.Text` — verbatim. */
  save: "Save",
  /**
   * `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.Tooltip` is "Filter projects details list view.", a hint
   * copy-pasted from the Project Overview filter icon (12 canvas Save buttons carry it).
   * SOURCE DEFECT: the hint is wrong for a Save button, so it says "Save" (`HINTS.save`; pure module, no import).
   * Reverting is this one string.
   */
  saveTooltip: "Save",
  /** `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset.Text` — verbatim. */
  cancel: "Cancel",
  /** `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset.Tooltip` — verbatim. */
  cancelTooltip: "Reset values form fields back.",
  /** `cmp_PopUp_Leave_GridOperator_Confirmation.Title` — verbatim. */
  leaveTitle: "Unsaved data",
  /** `cmp_PopUp_Leave_GridOperator_Confirmation.ConfirmButtonText` — verbatim. */
  leaveConfirm: "Yes",
} as const;

/**
 * `cmp_PopUp_Leave_GridOperator_Confirmation` — the texts the shared `UnsavedChangesGuard` shows
 * (D35, PO X1). `CancelButtonText: ="Cancel"` — verbatim.
 */
export const LEAVE_DIALOG = {
  title: SCREEN_MSG.leaveTitle,
  description: LEAVE_CONFIRMATION,
  confirm: SCREEN_MSG.leaveConfirm,
  cancel: "Cancel",
} as const;

/** The canvas `AccessibilityLabel` of the footer buttons (rule 16) — their control names. */
export const BUTTON_CONTROL = {
  save: "pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave",
  cancel: "pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset",
} as const;
