/**
 * Grid Operator Screen — every business rule as a pure function.
 *
 * Canvas screen: `Grid Operator Screen` (PM app)
 *   68 controls · 1 320 lines of Power Fx · 23 substantive blocks · band M
 *
 * The smallest screen in the PM app and therefore the reference implementation for the
 * rebuild: one Dataverse row per project, two tabs, eleven writable columns, one Save,
 * one Cancel, no flows, no galleries.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colGridOperatorFormValidation`, the ten-row `{Name, Dirty, Valid}` table, and its
 *    priming idiom `Collect(colGridOperatorFormValidation, Blank())`. Dirty and valid are
 *    computed from the form and the server row (`dirtyFields`, `validateForm`) instead of
 *    being maintained by hand in twelve `OnChange` handlers.
 *  - The ten per-control `Reset()` calls inside `Concurrent(...)` on OnVisible and Cancel.
 *    Cancel is `toForm(record)` — one expression, no control coupling.
 *  - `locGridOperatorTabSelected`. The tab is a `?tab=` search param so it survives a
 *    reload (`parseTab`).
 *  - `Notify(...)` string concatenation of `FirstError.Source`/`.Message`/
 *    `.Details.HttpResponse`. The message text survives as `SAVE_ERROR_PREFIX`; the error
 *    detail goes to structured telemetry.
 *
 * SOURCE DEFECTS carried forward as fixes — each is commented at its rule:
 *  1. the Operator field updated the `GridExpansionRequired` validation row (ambiguity 12)
 *  2. the Grid Connection tab has no `DisplayMode` gating at all (ambiguity 14)
 *  3. the lock banner's `Height` and `Visible` test different columns (ambiguity 13)
 *  4. `canSave` omitted the grid-voltage error label (spec Validation and gating)
 */
import {
  isNumeric, isDecimalWithPlaces, inRange, parseNumber, isBlank, type Lang,
} from "@/domain/numeric";
import { CHOICE_PROCESS, TEXT_MAX_LENGTH } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/**
 * `vsb_GridOperator` logical names, read out of the solution's `customizations.xml`
 * rather than guessed from the canvas display names quoted in the spec.
 *
 * The display name → logical name mapping is not mechanical here: `'Voltage level [kV]'`
 * is `vsb_voltagelevel` (no `kv` suffix) and `Operator` is `vsb_operator` while the
 * table's own `Name` column is `vsb_name` and holds an autonumber `Id`.
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

/** `MaxLength = 55` on Operator, Grid expansion details and Substation operator. */
export const CHAR_MAX_LENGTH = TEXT_MAX_LENGTH.default;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** The project fields this screen reads — the five lock prerequisites plus the BU. */
export interface GridOperatorProject {
  id: string;
  /** `'Project ID'` — the human-readable identifier. Blank until General Data is saved. */
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
  /** `gblAppResx.NumericThreeDecimals` — the App.OnStart message resource table, verbatim. */
  threeDecimals: "Numeric value with maximum of three decimals",
  /** `gblAppResx.NumericOneDecimals` — the App.OnStart message resource table, verbatim. */
  oneDecimal: "Numeric value with maximum of one decimals",
  /**
   * `lbl_GridOperator_DisplayProjectBodyRightContent_LengthExternalCabeling_ErrorMessage.Text`
   * — verbatim.
   */
  lengthRange: "Please select a value between 0 and 99.",
  /**
   * `lbl_GridOperator_DisplayProjectBodyRightContent_DiameterExternalCabeling_ErrorMessage.Text`
   * — verbatim.
   */
  diameterRange: "Please select a value between 0 and 999.",
} as const;

/**
 * `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.OnChange` — verbatim (the canvas
 * literal is built in that behaviour formula).
 */
export const SAVE_SUCCESS = "Grid operator data was saved successfully!";
/**
 * NEW — no canvas equivalent: the code app surfaces a failed save; the canvas only had the
 * success toast
 */
export const SAVE_ERROR_PREFIX = "Error: Grid operator data could not be saved.";
export const LEAVE_CONFIRMATION =
  "You have unsaved data. Do you really want to leave current form without saving?";

/* ══════════════════════════════════════════════════════ number presentation ════ */

/**
 * Rule 5 — the canvas display switch, which differs by field precision:
 *   `'Voltage level [kV]'` and both DIAMETERS use `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0#"))`
 *   both LENGTHS use                          `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0##"))`
 *
 * `#0.0#` is "at least one, at most two" fraction digits; `#0.0##` is one to three. An
 * integer renders bare. This belongs in a shared `domain/numberFormat.ts` per step 4 of
 * the implementation plan — it lives here because this task may only touch its own
 * feature folder, and `NumericInput` already formats its own hint.
 */
export function formatDecimal(
  value: number | null | undefined,
  maxFractionDigits: 2 | 3,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  // Truncate rather than round: `Text(1.2345, "#0.0##")` in Power Fx rounds, but the
  // spec's own expectation (UT-GRIDOP-005) is `1.234` from `1.2345`, i.e. truncation.
  const factor = 10 ** maxFractionDigits;
  const truncated = Math.trunc(value * factor) / factor;
  const text = truncated.toFixed(maxFractionDigits).replace(/0+$/, "");
  return text.endsWith(".") ? `${text}0` : text;
}

/** `'Voltage level [kV]'` and the two diameters — one to two fraction digits. */
export const formatTwoPlaces = (v: number | null | undefined) => formatDecimal(v, 2);
/** The two lengths — one to three fraction digits. */
export const formatThreePlaces = (v: number | null | undefined) => formatDecimal(v, 3);

/* ════════════════════════════════════════════════════════════════ validation ════ */

/**
 * Rule 6 — grid voltage. `And(Not(IsBlank(v)), Or(Not(IsNumeric(v)), IsMatch(v, ",", Contains)))`
 * with the message `"Value must be numeric."`.
 *
 * The comma test is the decimal-separator guard: the source comment says "dot should be
 * used instead". It is deliberately locale-INDEPENDENT — the canvas hard-codes the comma
 * here even though `fn_Numeric` branches on `Language()`. Reproduced as-is, because a
 * German user typing `1,5` into a field the app then reads with `Value()` in the app's
 * own locale is exactly the failure this guard exists to catch.
 *
 * A blank value shows no message (UT-GRIDOP-009) but is NOT valid: the canvas validation
 * row for `GridVoltage` is `And(Not(IsBlank(Self.Value)), IsNumeric(Self.Value))`, so a
 * blank voltage marks the row invalid and blocks Save the moment the field is touched.
 */
export function validateVoltage(text: string): FieldValidity {
  if (isBlank(text)) return { valid: false };
  if (!isNumeric(text, "en-US") || text.includes(",")) {
    return { valid: false, message: MSG.numeric };
  }
  return { valid: true };
}

/**
 * Rule 7 — length internal/external: at most three decimals, range 0…99.
 *
 * The source's error label is one condition with two messages:
 *   `Or(Not(IsThreeDecimal(v)), Not(And(IsNumeric(v), Value(v) >= 0, Value(v) <= 99)))`
 * decimal failure → `gblAppResx.NumericThreeDecimals`, otherwise the range message. The
 * decimal check is evaluated FIRST, so `"1.2345"` reports the decimals message even
 * though it is also out of no range at all.
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
 * Rule 8 — diameter internal/external: at most one decimal, range 0…999.
 *
 * SOURCE INCONSISTENCY: the diameter DISPLAY format (rule 5) is `#0.0##`'s narrower
 * sibling `#0.0#`, i.e. up to TWO fraction digits, while this validator is
 * `IsOneDecimal`. A stored `12.75` renders as `12.75` and then fails its own validation,
 * blocking Save on a value the app wrote itself. Reported rather than widened: whether
 * the column is one decimal or two is a data decision, not a code one. Covered by a test.
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
 * Rule 4 — the whole ten-row validation table in one pure function.
 *
 * The blank case matters and differs per field group. In the canvas the five free-text /
 * choice rows are `{Valid: true}` unconditionally, so a blank Operator never blocks Save;
 * the numeric rows are `And(Not(IsBlank(v)), IsNumeric(v))`, so a blank numeric row IS
 * invalid — but only once its `OnChange` has fired. A never-touched blank numeric field
 * therefore keeps the `Valid: true` it was seeded with in `OnVisible`.
 *
 * `touched` reproduces that exactly: an untouched blank numeric field is valid, a cleared
 * one is not. Pass an empty set to evaluate the pristine form.
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

/** The fields whose inline error label is showing, in the source's field order. */
export function invalidFields(validity: FormValidity): GridOperatorField[] {
  return FIELDS.filter((f) => !validity[f].valid);
}

/** Every inline message currently rendered — drives the Save tooltip and the summary. */
export function validationMessages(validity: FormValidity): string[] {
  return FIELDS.map((f) => validity[f].message).filter((m): m is string => Boolean(m));
}

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

export type PageLockReason = "General" | "Milestones" | "Generator" | "Production" | "Draft";

export interface PageLockEntry {
  reason: PageLockReason;
  label: string;
  /** What the user has to do, for the banner body. */
  hint: string;
}

/**
 * `con_Milestones_Page_LockMessage_6.Visible` — the ordered missing-prerequisite list:
 * `'Project ID'` blank, or `'End Date'` blank, or `'Total Capacity'` 0/blank, or
 * `'Net Yield p50'` 0/blank, or `'Cluster State'.Name` blank or `"Draft"`.
 *
 * SOURCE DEFECT (ambiguity 13): the banner's `Height` switch tests
 * `IsBlank('Project Start Date')` for the Milestones slot while its `Visible` — and the
 * bullet label bound to that slot — tests `IsBlank('End Date')`. The two disagree, so the
 * banner can be sized for a bullet it does not render and vice versa.
 *
 * RESOLVED to `'End Date'`, as step 6 of the implementation plan directs: that is what
 * `Visible` and the bullet itself use, and it is the semantically correct test — End Date
 * is the last milestone, so its presence is what "Milestones is done" means. Project
 * Start Date is legitimately blank for every project whose start cluster is 1 or later,
 * so testing it would lock this screen permanently for every acquired project.
 * The canvas height condition stays reachable through `pageLockCanvasHeightParity`.
 */
export function pageLock(project: GridOperatorProject | null): PageLockEntry[] {
  if (!project) {
    return [{
      reason: "General",
      label: "• General",
      hint: "No project is loaded.",
    }];
  }
  const out: PageLockEntry[] = [];
  if (isBlank(project.projectNumber)) {
    out.push({
      reason: "General", label: "• General",
      hint: "Save General Data once — Dataverse assigns the Project ID there.",
    });
  }
  // See the SOURCE DEFECT note above: 'End Date', not 'Project Start Date'.
  if (isBlank(project.endDate)) {
    out.push({
      reason: "Milestones", label: "• Milestones",
      hint: "Set the project's End Date on the Milestones screen.",
    });
  }
  if (!project.totalCapacity) {
    out.push({
      reason: "Generator", label: "• Generator",
      hint: "Add at least one generator so the project has a Total Capacity.",
    });
  }
  if (!project.netYieldP50) {
    out.push({
      reason: "Production", label: "• Production",
      hint: "Enter an energy yield so the project has a Net Yield p50.",
    });
  }
  if (isBlank(project.clusterStateName) || project.clusterStateName === "Draft") {
    out.push({
      reason: "Draft", label: "• Change the project status from Draft",
      hint: "Move the project out of Draft on the CheckList screen.",
    });
  }
  return out;
}

export const isPageLocked = (project: GridOperatorProject | null): boolean =>
  pageLock(project).length > 0;

/**
 * The canvas banner's HEIGHT condition, kept only so the divergence documented on
 * `pageLock` is asserted by a test rather than described in a comment.
 */
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
  canEdit: boolean;
}

/**
 * `If(Or(IsBlank('Cluster State'.Name), 'Cluster State'.Name = "Draft",
 *       con_Milestones_Page_LockMessage_6.Visible), DisplayMode.Disabled, DisplayMode.Edit)`
 *
 * SOURCE DEFECT (ambiguity 14): in the canvas this expression is present on the tab strip
 * and on the four Grid Operator tab controls ONLY. The six Grid Connection controls —
 * Substation construction required, Substation operator and the four cabling numbers —
 * carry no `DisplayMode` property at all, verified by grepping every `DisplayMode:`
 * occurrence in the screen (lines 538, 632, 710, 739, 807, 870, 1508, 1614). They stay
 * editable on a locked or Draft project; only the disabled tab strip keeps them out of
 * reach, and only for a user who is not already standing on that tab.
 *
 * FIXED: `canEditField` gates every field the same way, so the six Grid Connection
 * controls are disabled under lock and Draft too. This is a deliberate divergence from
 * the canvas source; step 10 of the implementation plan flags it for product sign-off.
 * `canEditFieldCanvasParity` keeps the original behaviour reachable and testable.
 *
 * `canEdit` (the server-evaluated `CanEditSelectedProject`) is folded in as well. The
 * canvas read that flag on the Save button only, which let a user without write access
 * type into every field and only discover it on Save.
 */
export function canEditField(state: GatingState, _field: GridOperatorField): boolean {
  void _field; // every field is gated identically — see the SOURCE DEFECT note.
  if (!state.canEdit) return false;
  if (isDraft(state.project)) return false;
  return !isPageLocked(state.project);
}

/** The canvas's actual per-field gating, for parity tests. */
export function canEditFieldCanvasParity(
  state: GatingState,
  field: GridOperatorField,
): boolean {
  if (CONNECTION_TAB_FIELDS.includes(field)) return true; // no DisplayMode at all
  return !isDraft(state.project) && !isPageLocked(state.project);
}

/** `tab_…DisplayProjectBodyRightContent.DisplayMode` — the tab strip. */
export const canSwitchTabs = (state: GatingState): boolean =>
  !isDraft(state.project) && !isPageLocked(state.project);

/* ════════════════════════════════════════════════════════════════════ dirty ════ */

/** Numeric column → the text the field shows. */
const numText = (v: number | null, places: 2 | 3): string => formatDecimal(v, places);

/** The bound values, i.e. what Cancel restores. */
export function toForm(record: GridOperatorRecord | null): GridOperatorForm {
  if (!record) return emptyForm();
  return {
    operator: record.operator ?? "",
    voltageLevel: numText(record.voltageLevel, 2),
    expansionRequired: record.expansionRequired,
    expansionDetails: record.expansionDetails ?? "",
    substationConstructionRequired: record.substationConstructionRequired,
    substationOperator: record.substationOperator ?? "",
    lengthInternal: numText(record.lengthInternal, 3),
    diameterInternal: numText(record.diameterInternal, 2),
    lengthExternal: numText(record.lengthExternal, 3),
    diameterExternal: numText(record.diameterExternal, 2),
  };
}

/** Rule 1's `Concurrent(Reset(...) × 10)` — the empty form for a project with no row. */
export function emptyForm(): GridOperatorForm {
  return {
    operator: "", voltageLevel: "", expansionRequired: null, expansionDetails: "",
    substationConstructionRequired: null, substationOperator: "",
    lengthInternal: "", diameterInternal: "", lengthExternal: "", diameterExternal: "",
  };
}

/**
 * The `Dirty` column of the deleted validation table, derived instead of maintained.
 *
 * SOURCE DEFECT (ambiguity 12): `txt_GridOperator_…_GridOperator.OnChange` is
 * `UpdateIf(colGridOperatorFormValidation, Name = "GridExpansionRequired", {Valid: true,
 * Dirty: true})` — editing Operator marked the GRID EXPANSION REQUIRED row dirty, and the
 * `"GridOperator"` row seeded in `OnVisible` was never touched again. Save still enabled
 * (any dirty row will do), so the effect was cosmetic, but the row name is plainly wrong.
 *
 * FIXED by construction: dirtiness is a diff between the form and the server row, so it
 * cannot be attributed to the wrong field. `dirtyFieldsCanvasParity` reproduces the
 * mis-routing so the defect is visible in a test.
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
 * Rule 14 — `cmp_PopUp_Leave_GridOperator_Confirmation` fires from the header logo and
 * the left nav whenever `CountRows(Filter(colGridOperatorFormValidation, Dirty)) > 0`.
 *
 * One rule replaces the two duplicated dirty-count checks (step 13). A clean form
 * navigates straight through.
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
  /** True while the mutation is in flight. */
  busy?: boolean;
}

/**
 * The Save button, exactly as the source requires:
 *   `gblCurrentUser.CanEditSelectedProject`
 *   `'Cluster State'.Name <> "Draft"`
 *   zero rows with `Valid = false`
 *   at least one row with `Dirty = true`
 *   all four cabling error labels hidden
 *   the page not locked
 *
 * FIXED (spec Validation and gating): the canvas list names the four CABLING error labels
 * and omits the GRID VOLTAGE one, so an invalid voltage passed Save whenever some other
 * field was dirty and valid. Here `invalidFields` covers all five numeric fields, so the
 * voltage blocks Save like everything else (UT-GRIDOP-018). `canSaveCanvasParity` keeps
 * the omission reachable.
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

/** Why Save is off — rendered as the command's `disabledReason`. */
export function saveDisabledReason(state: SaveState): string | undefined {
  if (canSave(state)) return undefined;
  if (state.busy) return "The record is being saved.";
  if (!state.canEdit) return "You do not have permission to edit this project.";
  if (isPageLocked(state.project)) {
    return `This page is locked: ${pageLock(state.project).map((e) => e.reason).join(", ")}.`;
  }
  if (isDraft(state.project)) return "The project is still in Draft.";
  if (!isDirty(state.form, state.baseline)) return "Nothing has changed yet.";
  const messages = validationMessages(validateForm(state.form, state.touched, state.language));
  return messages[0] ?? "Fix the highlighted fields first.";
}

/**
 * Rule 12 / Cancel — `locAllowGridOperatorReset` (true on entry, false after a save)
 * AND at least one dirty row. Restores the bound values without touching the server.
 */
export function canCancel(state: {
  allowReset: boolean;
  form: GridOperatorForm;
  baseline: GridOperatorForm;
}): boolean {
  return state.allowReset && isDirty(state.form, state.baseline);
}

/* ══════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Rule 11 — numeric columns go through `Value(...)`, so an EMPTY text box must serialise
 * to `null`, never `0`. An unparseable value also serialises to `null`: `Value("abc")` is
 * an error in Power Fx and `Patch` would have written blank.
 */
export function numericColumn(text: string, language: Lang = "en-US"): number | null {
  if (isBlank(text)) return null;
  const n = parseNumber(text, language);
  return Number.isNaN(n) ? null : n;
}

/** Text columns keep the canvas's `MaxLength` cap. */
const textColumn = (text: string): string | null =>
  isBlank(text) ? null : text.slice(0, CHAR_MAX_LENGTH);

/**
 * Rule 10's payload — the eleven writable columns plus `Owning Business Unit`.
 *
 * `Project` and `Owning Business Unit` are lookups, so they are `@odata.bind` bindings,
 * and they are only sent on a CREATE: re-binding the project of an existing row on every
 * Save is a write the canvas made for free (`Patch` with the whole record) and that a
 * PATCH should not repeat.
 */
export function buildPayload(
  form: GridOperatorForm,
  project: GridOperatorProject,
  opts: { isCreate: boolean; language?: Lang } ,
): Record<string, unknown> {
  const lang = opts.language ?? "en-US";
  const payload: Record<string, unknown> = {
    [GRID_OPERATOR_COL.operator]: textColumn(form.operator),
    [GRID_OPERATOR_COL.voltageLevel]: numericColumn(form.voltageLevel, lang),
    [GRID_OPERATOR_COL.expansionRequired]: form.expansionRequired,
    [GRID_OPERATOR_COL.expansionDetails]: textColumn(form.expansionDetails),
    [GRID_OPERATOR_COL.substationConstructionRequired]: form.substationConstructionRequired,
    [GRID_OPERATOR_COL.substationOperator]: textColumn(form.substationOperator),
    [GRID_OPERATOR_COL.lengthInternal]: numericColumn(form.lengthInternal, lang),
    [GRID_OPERATOR_COL.diameterInternal]: numericColumn(form.diameterInternal, lang),
    [GRID_OPERATOR_COL.lengthExternal]: numericColumn(form.lengthExternal, lang),
    [GRID_OPERATOR_COL.diameterExternal]: numericColumn(form.diameterExternal, lang),
  };
  if (opts.isCreate) {
    payload[`${GRID_OPERATOR_LOOKUP.project}@odata.bind`] =
      `/vsb_projects(${project.id})`;
    if (project.owningBusinessUnitId) {
      payload[`${GRID_OPERATOR_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${project.owningBusinessUnitId})`;
    }
  }
  return payload;
}

/* ═════════════════════════════════════════════════════════════════════ tabs ════ */

export type TabKey = "operator" | "connection";

export interface TabDescriptor { key: TabKey; label: string }

/**
 * Rule 2 — `locGridOperatorTabListItems`, which was a local `Table(...)` of two rows.
 * The `TabValue`s were `"operatorTab"` / `"connectionTab"`; the URL keys drop the suffix.
 */
export const TABS: TabDescriptor[] = [
  { key: "operator", label: "Grid Operator" },
  { key: "connection", label: "Grid Connection" },
];

/** `?tab=` → a tab key. Anything unrecognised falls back to the first tab. */
export function parseTab(raw: string | null | undefined): TabKey {
  return raw === "connection" ? "connection" : "operator";
}

/** How many fields on a tab currently show an inline error — the tab's badge. */
export function tabErrorCount(validity: FormValidity, tab: TabKey): number {
  const fields = tab === "operator" ? OPERATOR_TAB_FIELDS : CONNECTION_TAB_FIELDS;
  return fields.filter((f) => validity[f].message !== undefined).length;
}

/* ════════════════════════════════════════════════════════════════ choice sets ════ */

/**
 * `Choices('Grid Expansion Required')` and `Choices('Substation construction required')`
 * are the same Yes/No/Unknown shape, so one option list serves both dropdowns.
 */
export const YES_NO_UNKNOWN: { value: number; label: string }[] = [
  { value: CHOICE_PROCESS.yesNoUnknown.yes, label: "Yes" },
  { value: CHOICE_PROCESS.yesNoUnknown.no, label: "No" },
  { value: CHOICE_PROCESS.yesNoUnknown.unknown, label: "Unknown" },
];

export const choiceLabel = (value: number | null): string =>
  YES_NO_UNKNOWN.find((o) => o.value === value)?.label ?? "—";

/** `$"{Len(value)}/{gblAppConstants.DefaultMaxLength}"` — the character counter. */
export const charCounter = (value: string): string =>
  `${value.length}/${CHAR_MAX_LENGTH}`;
