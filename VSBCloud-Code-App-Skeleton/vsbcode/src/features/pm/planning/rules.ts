/**
 * Project Planning Screen — every business rule as a pure function.
 *
 * Canvas screen: `Project Planning Screen` (PM app)
 *   178 controls · 3 562 lines of Power Fx · 43 substantive blocks · band M
 *
 * Three tabs over one `Project Plannings` row plus two child sets. General holds
 * Cooperation, Legal Planning Basis, Planning Basis Category, Permit Procedure, Planning
 * Basis Details, the height-limitation toggle and the Permits sub-grid. Repowering holds
 * Repowering, "Access to old plants secured" and Repowering Details. Aquisition Status
 * holds the two acquisition galleries (in personam / in rem). No flows.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colPlanningFormValidation`, the 14-row `{Name, Dirty, Valid, Text}` table, and the
 *    ~30 `UpdateIf(colPlanningFormValidation, Name = "…", {Valid: true, Dirty: true})`
 *    handlers that maintained it. Dirty is a diff (`dirtyFields`), valid is a computed
 *    record (`validatePlanning`).
 *  - The commented-out bulk save block in `pcf_…_ButtonsSave.OnChange`: a
 *    `ClearCollect(colPermits, ForAll(colPermits, Patch(Permits, …)))` plus both
 *    acquisition sets, wrapped in `/* … *\/`. It is not resurrected (step 13) — permits
 *    and acquisition rows save through their own panels.
 *  - `Collect(colAquisitionStatusesUnderLawTypes, Blank())` and its three siblings, the
 *    schema-priming idiom.
 *  - The `SVGImages` `data:image/svg+xml;utf8,` selection dot on the permit gallery.
 *  - `OnHidden`'s ten `Reset(...)` calls plus `Clear(colPlanningFormValidation)`.
 *
 * SOURCE DEFECTS carried forward as fixes — each is commented at its rule:
 *  1. the height-limit error label uses `And` where `Or` is needed, and its range branch
 *     is un-negated (ambiguity 7)
 *  2. `"Secured must be between 0 and 100."` contradicts its own 0–999 check (ambiguity 8)
 *  3. the acquisition panel's "Cancel" button clears data (ambiguity 9)
 *  4. the In-rem save divides without an error guard (ambiguity 10)
 *  5. permit edits never mark the form dirty (ambiguity 11)
 *  6. `fn_Numeric_Revenues` is referenced but never instantiated on this screen
 *     (ambiguity 6) — the height validation is dead at runtime in the canvas
 */
import {
  isNumeric, isDecimalWithPlaces, inRange, parseNumber, roundDown, isBlank, type Lang,
} from "@/domain/numeric";
import { formatDate } from "@/domain/dates";
import { CHOICE_PROCESS, TEXT_MAX_LENGTH } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_ProjectPlanning` logical names, read out of the solution's `customizations.xml`. */
export const PLANNING_COL = {
  id: "vsb_projectplanningid",
  name: "vsb_name",
  project: "_vsb_project_value",
  cooperation: "vsb_cooperation",
  cooperationPartner: "vsb_cooperationpartner",
  cooperationDetails: "vsb_cooperationdetails",
  /** `Legal Planning` — a lookup to `Custom Choice Values`, not an option set. */
  legalPlanning: "_vsb_legalplanninglookup_value",
  planningBasisCategory: "vsb_planningbasiscategory",
  /** `Permit Procedure` — also a `Custom Choice Values` lookup. */
  permitProcedure: "_vsb_permitprocedurelookup_value",
  planningBasisDetails: "vsb_planningbasisdetails",
  repowering: "vsb_repowering",
  securedAccess: "vsb_securedaccess",
  repoweringDetails: "vsb_repoweringdetails",
  isHeightLimitation: "vsb_isheightlimitationforwtg",
  heightLimitation: "vsb_heightlimitationm",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const PLANNING_LOOKUP = {
  project: "vsb_Project",
  legalPlanning: "vsb_LegalPlanningLookUp",
  permitProcedure: "vsb_PermitProcedureLookup",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `vsb_Permit` logical names. Permits hang off the PLANNING row, not the project. */
export const PERMIT_COL = {
  id: "vsb_permitid",
  name: "vsb_name",
  projectPlanning: "_vsb_projectplanning_value",
  submissionDate: "vsb_submissiondate",
  submissionDateType: "vsb_submissiondatetype",
  approvalDate: "vsb_approvaldate",
  approvalDateType: "vsb_approvaldatetype",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const PERMIT_LOOKUP = {
  projectPlanning: "vsb_ProjectPlanning",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `vsb_AquisitionStatus` logical names. NOTE the project lookup is `vsb_projectid`. */
export const AQUISITION_COL = {
  id: "vsb_aquisitionstatusid",
  name: "vsb_name",
  project: "_vsb_projectid_value",
  type: "_vsb_aquisitionstatustype_value",
  secured: "vsb_secured",
  required: "vsb_required",
  /** `Aquisition Status [%]` — stores the FRACTION (0.25), the UI shows 25. */
  percentage: "vsb_aquisitionstatuspercentage",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const AQUISITION_LOOKUP = {
  project: "vsb_ProjectId",
  type: "vsb_AquisitionStatusType",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `Custom Choice Values.'Field Name'` — the two discriminators rule 8 filters on. */
export const CUSTOM_CHOICE_FIELD = {
  legalPlanningBasis: "vsb_legalplanningbasis",
  permitProcedure: "vsb_permitprocedure",
} as const;

/** `gblAppConstants.DefaultMaxLength` (55) and `.DefaultLongMaxLength` (300). */
export const MAX_LENGTH = {
  cooperationPartner: TEXT_MAX_LENGTH.default,
  cooperationDetails: TEXT_MAX_LENGTH.default,
  planningBasisDetails: TEXT_MAX_LENGTH.default,
  securedAccess: TEXT_MAX_LENGTH.default,
  repoweringDetails: TEXT_MAX_LENGTH.long,
} as const;

/**
 * GUIDE q22/q23/q24 — field and section labels captured verbatim from the recording. The
 * General tab's five visible fields render in this order: Cooperation, Legal Planning
 * Basis, Planning Basis Category, Permit Procedure, Planning Basis Details.
 */
export const GENERAL_TAB_LABELS = {
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_Cooperation.Text` — verbatim. */
  cooperation: "Cooperation",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_LegalPlanningBasis.Text` — verbatim. */
  legalPlanningBasis: "Legal Planning Basis",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisCategory.Text` — verbatim. */
  planningBasisCategory: "Planning Basis Category",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitProcedure.Text` — verbatim. */
  permitProcedure: "Permit Procedure",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisDetails.Text` — verbatim. */
  planningBasisDetails: "Planning Basis Details",
  /** Verbatim, including the missing "for" the earlier build had inserted. */
  /** `tgl_HeightLimitation_ProjectPlanning.Label` — verbatim. */
  heightLimitationWtg: "Height limitation WTG",
} as const;

export const REPOWERING_TAB_LABELS = {
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_Repowering.Text` — verbatim. */
  repowering: "Repowering",
} as const;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface PlanningProject {
  id: string;
  projectNumber: string | null;
  /** `'End Date'` — the Milestones prerequisite. */
  endDate: string | null;
  /** What the banner's HEIGHT formula tests instead. See `pageLock`. */
  projectStartDate: string | null;
  totalCapacity: number | null;
  netYieldP50: number | null;
  clusterStateName: string | null;
  countryId: string | null;
  owningBusinessUnitId: string | null;
  projectName: string | null;
  /** For the footer's "Created By" / "Modified By" stamps (GUIDE q22/q24's RecordFooter). */
  createdOn: string | null;
  modifiedOn: string | null;
}

export interface PlanningRecord {
  id: string;
  cooperation: number | null;
  cooperationPartner: string | null;
  cooperationDetails: string | null;
  legalPlanningId: string | null;
  planningBasisCategory: number | null;
  permitProcedureId: string | null;
  planningBasisDetails: string | null;
  repowering: number | null;
  securedAccess: string | null;
  repoweringDetails: string | null;
  isHeightLimitation: boolean;
  heightLimitation: number | null;
  owningBusinessUnitId: string | null;
}

/** The General + Repowering tab form. Numerics stay as text until the payload is built. */
export interface PlanningForm {
  cooperation: number | null;
  cooperationPartner: string;
  cooperationDetails: string;
  legalPlanningId: string | null;
  planningBasisCategory: number | null;
  permitProcedureId: string | null;
  planningBasisDetails: string;
  repowering: number | null;
  securedAccess: string;
  repoweringDetails: string;
  isHeightLimitation: boolean;
  heightLimitation: string;
}

export type PlanningField = keyof PlanningForm;

/** The 14 `colPlanningFormValidation` rows, minus the two the panels own. */
export const PLANNING_FIELDS: PlanningField[] = [
  "cooperation", "cooperationPartner", "cooperationDetails", "legalPlanningId",
  "planningBasisCategory", "permitProcedureId", "planningBasisDetails",
  "repowering", "securedAccess", "repoweringDetails",
  "isHeightLimitation", "heightLimitation",
];

export interface PermitRow {
  id: string;
  name: string | null;
  submissionDate: string | null;
  submissionDateType: number | null;
  approvalDate: string | null;
  approvalDateType: number | null;
  /** Server-evaluated `RecordInfo(record, RecordInfo.EditPermission)`. */
  canEdit: boolean;
  /** Server-evaluated `RecordInfo(record, RecordInfo.DeletePermission)`. */
  canDelete: boolean;
}

export interface PermitDraft {
  name: string;
  submissionDate: string | null;
  submissionDateType: number | null;
  approvalDate: string | null;
  approvalDateType: number | null;
}

export type LlaType = "personam" | "rem";

export interface AquisitionTypeRow {
  id: string;
  name: string | null;
  /** `Type` — 952850000 in personam, 952850001 in rem. */
  type: number | null;
  order: number | null;
}

export interface AquisitionStatusRow {
  id: string;
  typeId: string | null;
  typeName: string | null;
  /** The type's `Order`, which is what both galleries sort by (rule 3). */
  typeOrder: number | null;
  secured: number | null;
  required: number | null;
  /** The stored FRACTION. */
  percentage: number | null;
}

export interface AquisitionDraft {
  secured: string;
  required: string;
}

/* ══════════════════════════════════════════════════════════════════ messages ════ */

/** The inline messages, verbatim where the source is coherent. */
export const MSG = {
  /**
   * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured_ErrorMessage.Text` —
   * verbatim.
   */
  securedNumber: "Secured must be number.",
  /**
   * SOURCE DEFECT (ambiguity 8): the canvas condition is `Value(Secured) >= 0 && <= 999`
   * but the message reads `"Secured must be between 0 and 100."`, while `Required` — same
   * 0–999 check — reads "between 0 and 999.". Which bound is correct for Secured is not
   * determinable from the sources.
   *
   * RESOLVED in favour of the CONDITION: Secured is validated 0–999 like Required, and
   * the message says so. Two reasons. First, "Secured" and "Required" are counts of land
   * lease agreements, not percentages — `securedPercent` derives the percentage from
   * them — so a 100 ceiling on one and 999 on the other is arbitrary. Second, the panel
   * additionally enforces `Required >= Secured`, so a 0–100 Secured bound would silently
   * reject every project with more than 100 secured LLAs even though `Required` accepts
   * up to 999. The canvas string stays reachable as `MSG_CANVAS.securedRange100`.
   */
  /**
   * CANVAS DIVERGENCE — see MSG_CANVAS.securedRange100; canvas text: "Secured must be between 0
   * and 100."
   * (`lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured_ErrorMessage.Text`,
   * whose own condition checks 0–999).
   */
  securedRange: "Secured must be between 0 and 999.",
  /**
   * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured_ErrorMessage.Text` —
   * verbatim.
   */
  securedTooHigh: '"Secured" has to be lower than or equal to "Required".',
  /**
   * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Requered_ErrorMessage.Text` —
   * verbatim.
   */
  requiredNumber: "Required must be number",
  /**
   * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Requered_ErrorMessage.Text` —
   * verbatim.
   */
  requiredRange: "Required must be between 0 and 999.",
  /**
   * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Requered_ErrorMessage.Text` —
   * verbatim.
   */
  requiredTooLow: '"Required" has to be higher than or equal to "Secured".',
  /** `gblAppResx.NumericTwoDecimals` — the App.OnStart message resource table, verbatim. */
  heightDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_HeightLimit_ErrorMsg_ProjectPlanning.Text` — verbatim. */
  heightRange: "Please select a value between 0 and 99999.",
  /**
   * NEW — no canvas equivalent: the code app validates the whole permit row in one message; the
   * canvas reddened each field separately
   */
  permitIncomplete:
    "Name, Submission Date, Submission Date Type, Approval Date and Approval Date Type are all required.",
} as const;

/** The canvas strings this module deliberately diverges from. */
export const MSG_CANVAS = {
  /**
   * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured_ErrorMessage.Text` —
   * verbatim.
   */
  securedRange100: "Secured must be between 0 and 100.",
} as const;

/**
 * `pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave.OnChange` — verbatim (the
 * canvas literal is built in that behaviour formula).
 */
export const SAVE_SUCCESS = "Project Planning data was successfully saved!";
/**
 * NEW — no canvas equivalent: the code app surfaces a failed save; the canvas only had the
 * success toast
 */
export const SAVE_ERROR_PREFIX = "Error: Project Planning could not be saved.";
export const LEAVE_CONFIRMATION =
  "You have unsaved data. Do you really want to leave current form without saving?";
/**
 * `lbl_ProjectPlanning_DisplayProjectBodyRightContent_AquisitionStatus_InRem_Percentage.Text` —
 * verbatim.
 */
export const PERCENT_NOT_APPLICABLE = "N/A";

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

export type PageLockReason = "General" | "Milestones" | "Generator" | "Production" | "Draft";

export interface PageLockEntry { reason: PageLockReason; label: string; hint: string }

/**
 * `con_Milestones_Page_LockMessage_5.Visible` — `'Project ID'` blank, or `'End Date'`
 * blank, or `'Total Capacity'` 0/blank, or `'Net Yield p50'` 0/blank, or
 * `'Cluster State'.Name` blank or `"Draft"`.
 *
 * SOURCE DEFECT (ambiguity 13, which the spec notes appears on this screen too): the
 * banner's `Height` switch tests `IsBlank('Project Start Date')` for the Milestones slot
 * while `Visible` and the bullet label test `IsBlank('End Date')`. Resolved to
 * `'End Date'` for the same reasons as on Grid Operator and Team — it is what `Visible`
 * uses, and Project Start Date is legitimately blank for any project starting at cluster
 * 1 or later.
 */
export function pageLock(project: PlanningProject | null): PageLockEntry[] {
  if (!project) {
    return [{ reason: "General", label: "• General", hint: "No project is loaded." }];
  }
  const out: PageLockEntry[] = [];
  if (isBlank(project.projectNumber)) {
    out.push({
      reason: "General", label: "• General",
      hint: "Save General Data once — Dataverse assigns the Project ID there.",
    });
  }
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

export const isPageLocked = (project: PlanningProject | null): boolean =>
  pageLock(project).length > 0;

/** The canvas banner's HEIGHT condition, kept so the divergence above is testable. */
export function pageLockCanvasHeightParity(project: PlanningProject | null): boolean {
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

export const isDraft = (project: PlanningProject | null): boolean =>
  !project || isBlank(project.clusterStateName) || project.clusterStateName === "Draft";

/* ══════════════════════════════════════════════════════════════════ visibility ════ */

const YNU = CHOICE_PROCESS.yesNoUnknown;

/** Rule 5 — Partner is shown only for `Cooperation.Yes`. */
export const showCooperationPartner = (cooperation: number | null): boolean =>
  cooperation === YNU.yes;

/** Rule 5 — Details are shown for `Yes` or `Unknown`. */
export const showCooperationDetails = (cooperation: number | null): boolean =>
  cooperation === YNU.yes || cooperation === YNU.unknown;

/** Rule 5 — but Details are EDITABLE only for `Unknown`. */
export const cooperationDetailsEditable = (cooperation: number | null): boolean =>
  cooperation === YNU.unknown;

/** Rule 6 — "Access to old plants secured" is shown for `Repowering.Yes` only. */
export const showSecuredAccess = (repowering: number | null): boolean =>
  repowering === YNU.yes;

/** Rule 6 — Repowering Details are shown for `Yes` or `Unknown`. */
export const showRepoweringDetails = (repowering: number | null): boolean =>
  repowering === YNU.yes || repowering === YNU.unknown;

/** Rule 9 — the numeric field's container follows the toggle. */
export const showHeightLimit = (isHeightLimitation: boolean): boolean => isHeightLimitation;

/**
 * Rule 6's clearing — `If(varRepowering = No, Reset(SecuredAccess); Reset(RepoweringDetails),
 * varRepowering = Unknown, Reset(SecuredAccess);)`.
 *
 * `No` clears both; `Unknown` clears only Secured Access; `Yes` clears nothing.
 */
export function applyRepoweringChange(form: PlanningForm, repowering: number | null): PlanningForm {
  if (repowering === YNU.no) {
    return { ...form, repowering, securedAccess: "", repoweringDetails: "" };
  }
  if (repowering === YNU.unknown) {
    return { ...form, repowering, securedAccess: "" };
  }
  return { ...form, repowering };
}

/** The same shape for Cooperation, which the canvas did NOT clear — kept symmetrical. */
export function applyCooperationChange(
  form: PlanningForm,
  cooperation: number | null,
): PlanningForm {
  const next = { ...form, cooperation };
  if (!showCooperationPartner(cooperation)) next.cooperationPartner = "";
  if (!showCooperationDetails(cooperation)) next.cooperationDetails = "";
  return next;
}

/** Rule 9 — unchecking the toggle resets the numeric field. */
export function applyHeightToggle(form: PlanningForm, checked: boolean): PlanningForm {
  return checked
    ? { ...form, isHeightLimitation: true }
    : { ...form, isHeightLimitation: false, heightLimitation: "" };
}

/* ══════════════════════════════════════════════════════════════════ validation ════ */

export interface FieldValidity { valid: boolean; message?: string }

/**
 * The height-limitation numeric field: at most two decimals, range 0…99999.
 *
 * SOURCE DEFECT (ambiguity 7), two of them in one control:
 *   `.Visible = And(Not(IsBlank(Trim(v))), Not(IsTwoDecimal(v)), Not(InRange(v,0,99999)))`
 * shows the error only when the value fails BOTH checks, so `1.234` (three decimals but
 * in range) and `100000` (integer but out of range) both pass silently. And its `.Text`
 * third branch is `fn_Numeric_Revenues.InRange(v, 0, 99999), "Please select a value
 * between 0 and 99999."` — UN-NEGATED, so the range message renders when the value IS in
 * range.
 *
 * FIXED to the evident intent, which is also what the spec's own test cases assert
 * (UT-PLAN-017/018): `Or`, not `And`, and the range message on the negated condition.
 * `validateHeightLimitCanvasParity` keeps the literal source behaviour reachable.
 *
 * Additionally: ambiguity 6 — all three formulas call `fn_Numeric_Revenues`, an instance
 * that exists only on `Project Revenues Screen`. This screen declares no `fn_Numeric`
 * component at all, so in the canvas the height validation almost certainly errors at
 * runtime rather than validating anything. The rebuild calls the shared
 * `domain/numeric` functions, so the validation actually runs.
 */
export function validateHeightLimit(
  text: string,
  language: Lang = "en-US",
): FieldValidity {
  if (isBlank(text.trim())) return { valid: true };
  if (!isDecimalWithPlaces(text, 2, language)) {
    return { valid: false, message: MSG.heightDecimals };
  }
  if (!inRange(text, 0, 99999, language)) {
    return { valid: false, message: MSG.heightRange };
  }
  return { valid: true };
}

/** The literal source behaviour: `And` of both negations, and the un-negated message. */
export function validateHeightLimitCanvasParity(
  text: string,
  language: Lang = "en-US",
): FieldValidity {
  const trimmed = text.trim();
  if (isBlank(trimmed)) return { valid: true };
  const shapeBad = !isDecimalWithPlaces(text, 2, language);
  const rangeBad = !inRange(text, 0, 99999, language);
  // `And(Not(IsBlank), Not(IsTwoDecimal), Not(InRange))` — both must fail.
  if (!(shapeBad && rangeBad)) return { valid: true };
  // `.Text`'s third branch tests `InRange(...)` un-negated, so with the value out of
  // range it falls through to the decimals message.
  return { valid: false, message: MSG.heightDecimals };
}

export type PlanningValidity = Record<PlanningField, FieldValidity>;

const OK: FieldValidity = { valid: true };

/**
 * Rule 4's whole validation table. Every row except the height field is
 * `{Valid: true, Dirty: true}` in the canvas — the only real validation on the General
 * and Repowering tabs is the height limitation.
 */
export function validatePlanning(
  form: PlanningForm,
  language: Lang = "en-US",
): PlanningValidity {
  return {
    cooperation: OK,
    cooperationPartner: OK,
    cooperationDetails: OK,
    legalPlanningId: OK,
    planningBasisCategory: OK,
    permitProcedureId: OK,
    planningBasisDetails: OK,
    repowering: OK,
    securedAccess: OK,
    repoweringDetails: OK,
    isHeightLimitation: OK,
    heightLimitation: form.isHeightLimitation
      ? validateHeightLimit(form.heightLimitation, language)
      : OK,
  };
}

export const invalidPlanningFields = (v: PlanningValidity): PlanningField[] =>
  PLANNING_FIELDS.filter((f) => !v[f].valid);

export const planningMessages = (v: PlanningValidity): string[] =>
  PLANNING_FIELDS.map((f) => v[f].message).filter((m): m is string => Boolean(m));

/* ═════════════════════════════════════════════════════════════ dirty tracking ════ */

export function toPlanningForm(record: PlanningRecord | null): PlanningForm {
  if (!record) return emptyPlanningForm();
  return {
    cooperation: record.cooperation,
    cooperationPartner: record.cooperationPartner ?? "",
    cooperationDetails: record.cooperationDetails ?? "",
    legalPlanningId: record.legalPlanningId,
    planningBasisCategory: record.planningBasisCategory,
    permitProcedureId: record.permitProcedureId,
    planningBasisDetails: record.planningBasisDetails ?? "",
    repowering: record.repowering,
    securedAccess: record.securedAccess ?? "",
    repoweringDetails: record.repoweringDetails ?? "",
    isHeightLimitation: record.isHeightLimitation,
    // Rule 10 — `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))`.
    heightLimitation: formatOneToTwoPlaces(record.heightLimitation),
  };
}

export function emptyPlanningForm(): PlanningForm {
  return {
    cooperation: null, cooperationPartner: "", cooperationDetails: "",
    legalPlanningId: null, planningBasisCategory: null, permitProcedureId: null,
    planningBasisDetails: "", repowering: null, securedAccess: "", repoweringDetails: "",
    isHeightLimitation: false, heightLimitation: "",
  };
}

/** Rule 10 — the app-wide integer/decimal display switch. */
export function formatOneToTwoPlaces(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  const text = (Math.trunc(value * 100) / 100).toFixed(2).replace(/0+$/, "");
  return text.endsWith(".") ? `${text}0` : text;
}

export const dirtyFields = (form: PlanningForm, baseline: PlanningForm): PlanningField[] =>
  PLANNING_FIELDS.filter((f) => form[f] !== baseline[f]);

/**
 * `CountRows(Filter(colPlanningFormValidation, Dirty = true)) > 0`.
 *
 * SOURCE DEFECT (ambiguity 11): the `Permits` row of the validation table was permanently
 * clean — the `UpdateIf(colPlanningFormValidation, Name = "Permits", …)` in
 * `pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save.OnChange` sits inside a
 * `/* … *\/` comment. Permits save through their own panel so no data was lost, but the
 * leave-confirmation dialog never fired after a permit-only change and the user was
 * silently told nothing was pending.
 *
 * FIXED: `permitsTouched` participates in the dirty test (step 10), so a permit edit
 * arms the leave guard. It does NOT arm the planning Save — the planning row and the
 * permits are independent writes and Save must not send an unchanged planning patch.
 * `isDirtyCanvasParity` keeps the omission reachable.
 */
export function isDirty(
  form: PlanningForm,
  baseline: PlanningForm,
  permitsTouched = false,
  aquisitionTouched = false,
): boolean {
  return dirtyFields(form, baseline).length > 0 || permitsTouched || aquisitionTouched;
}

export const isDirtyCanvasParity = (form: PlanningForm, baseline: PlanningForm): boolean =>
  dirtyFields(form, baseline).length > 0;

/** Only the planning row's own fields — what the Save button actually gates on. */
export const isPlanningRowDirty = (form: PlanningForm, baseline: PlanningForm): boolean =>
  dirtyFields(form, baseline).length > 0;

/* ══════════════════════════════════════════════════════════════════ gating ════ */

export interface PlanningGating {
  project: PlanningProject | null;
  canEdit: boolean;
}

/**
 * `If(con_Milestones_Page_LockMessage_5.Visible, DisplayMode.Disabled, DisplayMode.Edit)`
 * — the one-liner Cooperation, Planning Basis Details, the height toggle and the Permits
 * command bar all share, plus the Draft clause the tab strip adds.
 *
 * `canEdit` is folded in: the canvas read `CanEditSelectedProject` on the Save button
 * only, so a read-only user could type into every field and only learn on Save.
 */
export const canEditPlanning = (g: PlanningGating): boolean =>
  g.canEdit && !isDraft(g.project) && !isPageLocked(g.project);

/** The tab strip is disabled when the project is Draft or the page is locked. */
export const canSwitchTabs = (g: PlanningGating): boolean =>
  !isDraft(g.project) && !isPageLocked(g.project);

/**
 * `Legal Planning Basis` adds a data-availability condition: editable only when at least
 * one matching `Custom Choice Values` row exists AND the page is not locked.
 */
export const canEditLegalPlanningBasis = (g: PlanningGating, optionCount: number): boolean =>
  canEditPlanning(g) && optionCount > 0;

/* ═══════════════════════════════════════════════════════════ the planning save ════ */

export interface PlanningSaveState extends PlanningGating {
  form: PlanningForm;
  baseline: PlanningForm;
  language?: Lang;
  busy?: boolean;
}

/**
 * Save requires all of: `CanEditSelectedProject`, `'Cluster State'.Name <> "Draft"`, zero
 * invalid validation rows, at least one dirty row, the height-limit error label hidden,
 * `If(tgl_HeightLimitation.Checked, !IsBlank(txt_HeightLimit.Value), true)`, and the page
 * not locked.
 */
export function canSave(state: PlanningSaveState): boolean {
  if (state.busy) return false;
  if (!state.canEdit) return false;
  if (isDraft(state.project)) return false;
  if (isPageLocked(state.project)) return false;
  if (!isPlanningRowDirty(state.form, state.baseline)) return false;
  // `If(Checked, !IsBlank(value), true)` — the toggle makes the field mandatory.
  if (state.form.isHeightLimitation && isBlank(state.form.heightLimitation.trim())) {
    return false;
  }
  return invalidPlanningFields(validatePlanning(state.form, state.language)).length === 0;
}

export function saveDisabledReason(state: PlanningSaveState): string | undefined {
  if (canSave(state)) return undefined;
  if (state.busy) return "The record is being saved.";
  if (!state.canEdit) return "You do not have permission to edit this project.";
  if (isPageLocked(state.project)) {
    return `This page is locked: ${pageLock(state.project).map((e) => e.reason).join(", ")}.`;
  }
  if (isDraft(state.project)) return "The project is still in Draft.";
  if (!isPlanningRowDirty(state.form, state.baseline)) return "Nothing has changed yet.";
  if (state.form.isHeightLimitation && isBlank(state.form.heightLimitation.trim())) {
    return "Enter the height limitation, or switch the toggle off.";
  }
  return planningMessages(validatePlanning(state.form, state.language))[0]
    ?? "Fix the highlighted fields first.";
}

/**
 * `Cancel/Reset` requires `locAllowPlanningReset` (true in OnVisible, false after a
 * successful save) AND at least one dirty row.
 *
 * SOURCE DEFECT: the canvas condition above greys Cancel out on an untouched or
 * just-saved form. GUIDE q22/q24 show the footer's outline Cancel with no disabled
 * styling on an untouched General tab (Cooperation and Legal Planning Basis both still
 * blank) — the same `RecordFooter` convention this repo already applies on General Data
 * and Milestones ("Cancel is always enabled… never a navigation", since it is a harmless
 * local reset either way). The screen wires Cancel as always-enabled; `canReset` stays
 * exported and tested so the canvas condition is not lost.
 */
export const canReset = (state: {
  allowReset: boolean; form: PlanningForm; baseline: PlanningForm;
}): boolean => state.allowReset && isPlanningRowDirty(state.form, state.baseline);

/**
 * Rules 7, 9 — the single `Project Plannings` patch.
 *
 * Rule 7 mirrors the visibility rules server-side: `'Secured Access'` and
 * `'Repowering Details'` are blanked when Repowering is `No`. The canvas only blanked on
 * `No`, not on `Unknown`, even though `Unknown` hides (and resets) Secured Access — so a
 * project switched Yes → Unknown kept its stored Secured Access. `applyRepoweringChange`
 * already clears the form field, so the payload is blank either way; the rule below keeps
 * the server-side guard as well, which is belt and braces rather than a divergence.
 */
export function buildPlanningPayload(
  form: PlanningForm,
  project: PlanningProject,
  opts: { isCreate: boolean; language?: Lang },
): Record<string, unknown> {
  const lang = opts.language ?? "en-US";
  const repoweringIsNo = form.repowering === YNU.no;
  const text = (v: string, max: number): string | null =>
    isBlank(v) ? null : v.slice(0, max);

  const payload: Record<string, unknown> = {
    [PLANNING_COL.name]: project.projectName,
    [PLANNING_COL.cooperation]: form.cooperation,
    [PLANNING_COL.cooperationPartner]:
      text(form.cooperationPartner, MAX_LENGTH.cooperationPartner),
    [PLANNING_COL.cooperationDetails]:
      text(form.cooperationDetails, MAX_LENGTH.cooperationDetails),
    [PLANNING_COL.planningBasisCategory]: form.planningBasisCategory,
    [PLANNING_COL.planningBasisDetails]:
      text(form.planningBasisDetails, MAX_LENGTH.planningBasisDetails),
    [PLANNING_COL.repowering]: form.repowering,
    // Rule 7 verbatim.
    [PLANNING_COL.securedAccess]:
      repoweringIsNo ? null : text(form.securedAccess, MAX_LENGTH.securedAccess),
    [PLANNING_COL.repoweringDetails]:
      repoweringIsNo ? null : text(form.repoweringDetails, MAX_LENGTH.repoweringDetails),
    [PLANNING_COL.isHeightLimitation]: form.isHeightLimitation,
    // Rule 9 — `If(Checked, Value(text), Blank())`.
    [PLANNING_COL.heightLimitation]: form.isHeightLimitation
      ? numericOrNull(form.heightLimitation, lang)
      : null,
  };

  // Rule 8's save half — the picker's id becomes an @odata.bind on the real lookup.
  payload[`${PLANNING_LOOKUP.legalPlanning}@odata.bind`] = form.legalPlanningId
    ? `/vsb_customchoicevalues(${form.legalPlanningId})`
    : null;
  payload[`${PLANNING_LOOKUP.permitProcedure}@odata.bind`] = form.permitProcedureId
    ? `/vsb_customchoicevalues(${form.permitProcedureId})`
    : null;

  if (opts.isCreate) {
    payload[`${PLANNING_LOOKUP.project}@odata.bind`] = `/vsb_projects(${project.id})`;
    if (project.owningBusinessUnitId) {
      payload[`${PLANNING_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${project.owningBusinessUnitId})`;
    }
  }
  return payload;
}

export function numericOrNull(text: string, language: Lang = "en-US"): number | null {
  if (isBlank(text.trim())) return null;
  const n = parseNumber(text, language);
  return Number.isNaN(n) ? null : n;
}

/**
 * Rule 1 — the get-or-create payload. `Patch('Project Plannings', Defaults(...),
 * {Project, Name, 'Owning Business Unit'})`, nothing else: the form fields are written by
 * the Save, not by the self-heal.
 */
export function buildPlanningSeedPayload(project: PlanningProject): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [PLANNING_COL.name]: project.projectName,
    [`${PLANNING_LOOKUP.project}@odata.bind`]: `/vsb_projects(${project.id})`,
  };
  if (project.owningBusinessUnitId) {
    payload[`${PLANNING_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${project.owningBusinessUnitId})`;
  }
  return payload;
}

/* ═════════════════════════════════════════════════════════════════ the permits ════ */

/**
 * Rule 15 — `locSelectedPermit: If(locSelectedPermit.Permit = ThisItem.Permit, Blank(),
 * ThisItem)`. Clicking the selected row deselects it.
 */
export const togglePermitSelection = (
  selectedId: string | null,
  clickedId: string,
): string | null => (selectedId === clickedId ? null : clickedId);

/** Permit Save requires all five fields. */
export function canSavePermit(draft: PermitDraft): boolean {
  return (
    !isBlank(draft.name.trim()) &&
    !isBlank(draft.submissionDate) &&
    draft.submissionDateType !== null &&
    !isBlank(draft.approvalDate) &&
    draft.approvalDateType !== null
  );
}

export const permitPanelErrors = (draft: PermitDraft): string[] =>
  canSavePermit(draft) ? [] : [MSG.permitIncomplete];

/**
 * `ItemEnabled: And(Not(IsBlank(locSelectedPermit)), RecordInfo(locSelectedPermit,
 * RecordInfo.EditPermission))` and the same for `DeletePermission`.
 *
 * The privilege itself is server-evaluated and surfaced on the row (step 9); this rule
 * only combines it with the selection and the page lock. Never re-implement the privilege.
 */
export function permitCommandState(
  g: PlanningGating,
  selected: PermitRow | null,
): { canNew: boolean; canEdit: boolean; canDelete: boolean } {
  const unlocked = canEditPlanning(g);
  return {
    canNew: unlocked,
    canEdit: unlocked && selected !== null && selected.canEdit,
    canDelete: unlocked && selected !== null && selected.canDelete,
  };
}

/** Rule 16 — the permit upsert payload. Permits bind to the PLANNING row. */
export function buildPermitPayload(
  draft: PermitDraft,
  planningId: string,
  owningBusinessUnitId: string | null,
  opts: { isCreate: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [PERMIT_COL.name]: draft.name.trim(),
    [PERMIT_COL.submissionDate]: draft.submissionDate,
    [PERMIT_COL.submissionDateType]: draft.submissionDateType,
    [PERMIT_COL.approvalDate]: draft.approvalDate,
    [PERMIT_COL.approvalDateType]: draft.approvalDateType,
  };
  if (opts.isCreate) {
    payload[`${PERMIT_LOOKUP.projectPlanning}@odata.bind`] =
      `/vsb_projectplannings(${planningId})`;
    if (owningBusinessUnitId) {
      payload[`${PERMIT_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${owningBusinessUnitId})`;
    }
  }
  return payload;
}

export const emptyPermitDraft = (): PermitDraft => ({
  name: "", submissionDate: null, submissionDateType: null,
  approvalDate: null, approvalDateType: null,
});

export const permitDraftFrom = (row: PermitRow): PermitDraft => ({
  name: row.name ?? "",
  submissionDate: row.submissionDate,
  submissionDateType: row.submissionDateType,
  approvalDate: row.approvalDate,
  approvalDateType: row.approvalDateType,
});

/** `Permit Date Type` — `Choices('Permit Date Type')`. */
export const PERMIT_DATE_TYPES: { value: number; label: string }[] = [
  { value: CHOICE_PROCESS.permitDateType.plan, label: "Plan" },
  { value: CHOICE_PROCESS.permitDateType.actual, label: "Actual" },
];

export const permitDateTypeLabel = (v: number | null): string =>
  PERMIT_DATE_TYPES.find((t) => t.value === v)?.label ?? "—";

/**
 * GUIDE q23 — the "New Permit" panel's three field labels and its two grouped date
 * fields, each one Field ("* Submission Date" / "* Approval Date") holding the Plan/Actual
 * choice and the date value together, not two separately-labelled required fields.
 */
export const PERMIT_PANEL_LABELS = {
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyContent_Name.Text` — verbatim. */
  name: "Name",
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDate.Text` — verbatim. */
  submissionDate: "Submission Date",
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDate.Text` — verbatim. */
  approvalDate: "Approval Date",
} as const;

/** GUIDE q22/q23 — the permit command row, verbatim: "+ New Permit", "Edit", "Delete". */
export const PERMIT_COMMAND_LABELS = {
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyHeader.Text` — verbatim. */
  newPermit: "New Permit",
  /** `btn_Edit_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  edit: "Edit",
  /** `btn_Delete_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  delete: "Delete",
} as const;

/** The panel's title, which follows the same casing whether adding or editing. */
export const permitPanelTitle = (isNew: boolean): string =>
  isNew ? "New Permit" : "Edit Permit";

/**
 * GUIDE q22 — the Permits grid has three columns: "Permit", "Permit Submitted" and
 * "Permit Approved". The submission/approval TYPE (Plan/Actual) is folded into the same
 * cell as its date rather than its own column, since the panel that produces the row
 * already presents Plan/Actual as a choice attached to each date, not a separate field.
 */
export const PERMIT_GRID_COLUMNS = {
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitsHeaderName.Text` — verbatim. */
  permit: "Permit",
  /**
   * `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitsHeaderSubmitted.Text` —
   * verbatim.
   */
  submitted: "Permit Submitted",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitsHeaderApproved.Text` — verbatim. */
  approved: "Permit Approved",
} as const;

/** One grid cell: the formatted date, with its Plan/Actual type in parentheses. */
export function permitDateCell(date: string | null, type: number | null): string {
  const d = formatDate(date);
  if (!d) return "—";
  const t = permitDateTypeLabel(type);
  return t === "—" ? d : `${d} (${t})`;
}

/* ═══════════════════════════════════════════════════════════ acquisition status ════ */

/** `Aquisition Types.Type` → the two gallery filters. */
export const LLA_TYPE_VALUE: Record<LlaType, number> = {
  personam: CHOICE_PROCESS.aquisitionType.inPersonam,
  rem: CHOICE_PROCESS.aquisitionType.inRem,
};

export const LLA_TYPE_LABEL: Record<LlaType, string> = {
  /**
   * `lbl_ProjectPlanning_DisplayProjectBodyRightContent_AquisitionStatus_UnderLaw_HeaderName.Text`
   * — verbatim.
   */
  personam: "LLAs in personam",
  /**
   * `lbl_ProjectPlanning_DisplayProjectBodyRightContent_AquisitionStatus_InRem_HeaderName.Text`
   * — verbatim.
   */
  rem: "LLAs in rem",
};

/**
 * Rules 11–12 — the derived percentage.
 *
 * The canvas computes `Value(Secured) / Value(Required)` into a local, then renders
 * `RoundDown(value * 100, 0)` and shows the literal `"N/A"` when `Required = 0` or the
 * division errored. Blank or non-numeric inputs produce 0 in the source (the Required
 * handler wraps it in `IfError(..., 0)`); here they produce `'N/A'` as well, because a
 * displayed `0 %` for "nothing entered yet" is a worse lie than "not applicable".
 */
export function securedPercent(
  secured: number | string | null,
  required: number | string | null,
  language: Lang = "en-US",
): number | typeof PERCENT_NOT_APPLICABLE {
  const s = typeof secured === "number" ? secured : parseNumber(secured, language);
  const r = typeof required === "number" ? required : parseNumber(required, language);
  if (Number.isNaN(s) || Number.isNaN(r)) return PERCENT_NOT_APPLICABLE;
  if (r === 0) return PERCENT_NOT_APPLICABLE;
  return roundDown((s / r) * 100, 0);
}

/** The galleries' `Value(ThisItem.'Aquisition Status [%]') * 100`, with the N/A guard. */
export function storedPercentToDisplay(
  percentage: number | null,
  required: number | null,
): number | typeof PERCENT_NOT_APPLICABLE {
  if (!required) return PERCENT_NOT_APPLICABLE;
  if (percentage === null || !Number.isFinite(percentage)) return PERCENT_NOT_APPLICABLE;
  return roundDown(percentage * 100, 0);
}

export interface AquisitionValidity {
  secured: FieldValidity;
  required: FieldValidity;
}

/**
 * The Acquisition Save gate: Required and Secured non-blank, numeric, each in 0…999, and
 * `Required >= Secured`. The six messages are the source's, with the one documented
 * divergence on `MSG.securedRange` (see its comment).
 *
 * Both bounds are 0…999 here — that is what the canvas CONDITION checks for both fields;
 * only the Secured MESSAGE claimed 100.
 */
export function validateAquisition(
  draft: AquisitionDraft,
  language: Lang = "en-US",
): AquisitionValidity {
  const out: AquisitionValidity = { secured: { valid: true }, required: { valid: true } };

  const secured = draft.secured.trim();
  const required = draft.required.trim();

  if (isBlank(secured) || !isNumeric(secured, language)) {
    out.secured = { valid: false, message: MSG.securedNumber };
  } else if (!inRange(secured, 0, 999, language)) {
    out.secured = { valid: false, message: MSG.securedRange };
  }

  if (isBlank(required) || !isNumeric(required, language)) {
    out.required = { valid: false, message: MSG.requiredNumber };
  } else if (!inRange(required, 0, 999, language)) {
    out.required = { valid: false, message: MSG.requiredRange };
  }

  if (out.secured.valid && out.required.valid) {
    const s = parseNumber(secured, language);
    const r = parseNumber(required, language);
    if (s > r) {
      out.secured = { valid: false, message: MSG.securedTooHigh };
      out.required = { valid: false, message: MSG.requiredTooLow };
    }
  }
  return out;
}

export const canSaveAquisition = (
  draft: AquisitionDraft,
  language: Lang = "en-US",
): boolean => {
  const v = validateAquisition(draft, language);
  return v.secured.valid && v.required.valid;
};

export const aquisitionPanelErrors = (
  draft: AquisitionDraft,
  language: Lang = "en-US",
): string[] => {
  const v = validateAquisition(draft, language);
  return [v.secured.message, v.required.message].filter((m): m is string => Boolean(m));
};

/**
 * Rule 13's payload.
 *
 * `Aquisition Status [%]` stores the FRACTION: the canvas patches
 * `Value(Percentage.Value) / 100` where the percentage box holds `secured/required*100`.
 * The stored unit is unchanged by the rebuild (step 4) — Secured 25 of Required 100
 * stores `0.25` and the galleries render `× 100`.
 *
 * SOURCE DEFECT (ambiguity 10): the In-personam handler wraps the division in
 * `IfError(..., 0)` and the In-rem handler does not, so the In-rem path could evaluate
 * `Value("N/A")` — the literal string the percentage box renders when `Required = 0` —
 * and error mid-Patch. FIXED by construction: the percentage is derived from the two
 * numbers here, never re-parsed from the rendered text, so there is no `"N/A"` to trip
 * over and both LLA types take exactly the same code path.
 */
export function buildAquisitionPayload(
  draft: AquisitionDraft,
  ctx: {
    projectId: string;
    typeId: string;
    owningBusinessUnitId: string | null;
    isCreate: boolean;
    language?: Lang;
  },
): Record<string, unknown> {
  const lang = ctx.language ?? "en-US";
  const secured = numericOrNull(draft.secured, lang);
  const required = numericOrNull(draft.required, lang);
  const display = securedPercent(secured, required, lang);
  const fraction = display === PERCENT_NOT_APPLICABLE ? null : display / 100;

  const payload: Record<string, unknown> = {
    [AQUISITION_COL.secured]: secured,
    [AQUISITION_COL.required]: required,
    [AQUISITION_COL.percentage]: fraction,
  };
  if (ctx.isCreate) {
    payload[`${AQUISITION_LOOKUP.project}@odata.bind`] = `/vsb_projects(${ctx.projectId})`;
    payload[`${AQUISITION_LOOKUP.type}@odata.bind`] =
      `/vsb_aquisitiontypes(${ctx.typeId})`;
    if (ctx.owningBusinessUnitId) {
      payload[`${AQUISITION_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${ctx.owningBusinessUnitId})`;
    }
  }
  return payload;
}

/**
 * Rule 14 — the panel's "Cancel" that is not a cancel.
 *
 * SOURCE DEFECT (ambiguity 9): `pcf_btn_…_AquisitionStatus_InpForm_Buttons_Cancel_1.OnChange`
 * patches `{Secured: Blank(), Required: Blank(), 'Aquisition Status [%]': Blank()}` and
 * reloads the gallery — it WIPES the row. A second control in the same panel,
 * `…_Buttons_Cancel`, is a genuine cancel; which label the user sees on the first one is
 * not visible in the YAML.
 *
 * FIXED (step 12): the two behaviours are two controls with honest labels. `Cancel`
 * closes the panel and writes nothing — it needs no rule. `Clear` calls this, and the UI
 * labels it "Clear" and confirms first.
 */
export function buildAquisitionClearPayload(): Record<string, unknown> {
  return {
    [AQUISITION_COL.secured]: null,
    [AQUISITION_COL.required]: null,
    [AQUISITION_COL.percentage]: null,
  };
}

/**
 * Rule 3 — both galleries sort by the TYPE's `Order`, not the row's.
 *
 * The canvas did it with `SortByColumns(AddColumns(Filter(...), Order, 'Aquisition Status
 * Type'.Order), "Order")`; here the sort is `$orderby=vsb_AquisitionStatusType/vsb_order`
 * on the server and this function only guarantees the order of an already-fetched page.
 */
export function sortByTypeOrder(rows: AquisitionStatusRow[]): AquisitionStatusRow[] {
  return [...rows].sort((a, b) => {
    const ao = a.typeOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.typeOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.typeName ?? "").localeCompare(b.typeName ?? "");
  });
}

export interface AquisitionSeedOp {
  op: "create";
  typeId: string;
  data: Record<string, unknown>;
}

/**
 * Rule 2 — the acquisition seed, as ONE parameterised function instead of the source's
 * two verbatim-duplicated `ForAll(... Patch(...))` blocks.
 *
 * The canvas guard is `If(Or(IsBlank(col), IsEmpty(col)), ForAll(allTypesOfThisKind, …))`,
 * i.e. all-or-nothing per LLA type: if the collection has even one row, nothing is
 * seeded, so a type added to `Aquisition Types` after the first visit never gets a row.
 * This computes the MISSING set instead, which is idempotent and self-healing in the way
 * the source only claimed to be, and is issued as one `$batch` (step 3).
 */
export function planAquisitionSeed(
  types: AquisitionTypeRow[],
  existing: AquisitionStatusRow[],
  ctx: { projectId: string; owningBusinessUnitId: string | null },
): AquisitionSeedOp[] {
  const have = new Set(existing.map((r) => r.typeId).filter((x): x is string => Boolean(x)));
  return types
    .filter((t) => !have.has(t.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => {
      const data: Record<string, unknown> = {
        [AQUISITION_COL.secured]: null,
        [AQUISITION_COL.required]: null,
        [AQUISITION_COL.percentage]: null,
        [`${AQUISITION_LOOKUP.project}@odata.bind`]: `/vsb_projects(${ctx.projectId})`,
        [`${AQUISITION_LOOKUP.type}@odata.bind`]: `/vsb_aquisitiontypes(${t.id})`,
      };
      if (ctx.owningBusinessUnitId) {
        data[`${AQUISITION_LOOKUP.owningBusinessUnit}@odata.bind`] =
          `/businessunits(${ctx.owningBusinessUnitId})`;
      }
      return { op: "create" as const, typeId: t.id, data };
    });
}

/** The canvas guard, kept so its all-or-nothing behaviour is testable. */
export function planAquisitionSeedCanvasParity(
  types: AquisitionTypeRow[],
  existing: AquisitionStatusRow[],
): AquisitionTypeRow[] {
  return existing.length === 0 ? types : [];
}

export const emptyAquisitionDraft = (): AquisitionDraft => ({ secured: "", required: "" });

export const aquisitionDraftFrom = (row: AquisitionStatusRow): AquisitionDraft => ({
  secured: row.secured === null ? "" : String(row.secured),
  required: row.required === null ? "" : String(row.required),
});

/* ═══════════════════════════════════════════════════════════════ custom choices ════ */

export interface CustomChoiceOption {
  id: string;
  label: string;
  order: number | null;
  countryId: string | null;
}

/**
 * Rule 8 — country-neutral rows plus rows matching the project's country, sorted by
 * `vsb_order`.
 *
 * The canvas materialised the whole `Custom Choice Values` table into
 * `colCustomChoiceValues` in `App.OnStart` and filtered client-side with a nested
 * `Or(IsBlank(...), Or(IsBlank(...), ... = ...))`. The rebuild filters on the server
 * (`$filter=vsb_fieldname eq '…' and (_vsb_country_value eq null or _vsb_country_value eq
 * {id})&$orderby=vsb_order`); this function is the same predicate, kept pure so the
 * filter's meaning is asserted by a test rather than by reading a query string.
 */
export function matchesCustomChoiceScope(
  option: CustomChoiceOption,
  projectCountryId: string | null,
): boolean {
  if (option.countryId === null) return true;      // country-neutral: always offered
  if (projectCountryId === null) return true;      // no project country: nothing to filter
  return option.countryId === projectCountryId;
}

export function customChoiceOptions(
  all: CustomChoiceOption[],
  projectCountryId: string | null,
): CustomChoiceOption[] {
  return all
    .filter((o) => matchesCustomChoiceScope(o, projectCountryId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ══════════════════════════════════════════════════════════════════════ tabs ════ */

export type PlanningTabKey = "general" | "repowering" | "aquisition";

/** `locTabList: ["General", "Repowering", "Aquisition Status"]`. */
export const PLANNING_TABS: { key: PlanningTabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "repowering", label: "Repowering" },
  { key: "aquisition", label: "Aquisition Status" },
];

export function parseTab(raw: string | null | undefined): PlanningTabKey {
  return raw === "repowering" || raw === "aquisition" ? raw : "general";
}

/* ════════════════════════════════════════════════════════════════ choice sets ════ */

export const YES_NO_UNKNOWN: { value: number; label: string }[] = [
  { value: YNU.yes, label: "Yes" },
  { value: YNU.no, label: "No" },
  { value: YNU.unknown, label: "Unknown" },
];

export const PLANNING_BASIS_CATEGORIES: { value: number; label: string }[] = [
  { value: CHOICE_PROCESS.planningBasisCategory.exists, label: "Planning law basis exists" },
  {
    value: CHOICE_PROCESS.planningBasisCategory.partial,
    /**
     * @labels-not-in-corpus — the `'Planning Basis Category'` option-set label, owned by
     * Dataverse; no canvas literal carries it
     */
    label: "Planning legal basis partially exists and/or is in an advanced stage",
  },
  { value: CHOICE_PROCESS.planningBasisCategory.none, label: "There is currently no planning" },
];

export const yesNoUnknownLabel = (v: number | null): string =>
  YES_NO_UNKNOWN.find((o) => o.value === v)?.label ?? "—";

export const planningBasisCategoryLabel = (v: number | null): string =>
  PLANNING_BASIS_CATEGORIES.find((o) => o.value === v)?.label ?? "—";

export const charCounter = (value: string, max: number): string => `${value.length}/${max}`;
