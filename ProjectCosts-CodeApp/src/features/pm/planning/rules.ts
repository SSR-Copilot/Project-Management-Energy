/**
 * Project Planning Screen — every business rule as a pure function (connected 20 Oct 2026, D31).
 *
 * Canvas screen: `Project Planning Screen.pa.yaml` (PM app, solution 1.21.709), cited as Y:<line>.
 *
 * Three tabs over one `Project Plannings` row plus two child sets. General holds Cooperation,
 * Legal Planning Basis, Planning Basis Category, Permit Procedure, Planning Basis Details, the
 * height-limitation toggle and the Permits sub-grid. Repowering holds Repowering, "Access to old
 * plants secured" and Repowering Details. Aquisition Status holds the two acquisition galleries
 * (in personam / in rem). The screen calls no flow (no `.Run(`), and no flow or plugin step is
 * registered on its tables (see `hooks.ts`).
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colPlanningFormValidation`, the 14-row `{Name, Dirty, Valid, Text}` table, and the ~30
 *    `UpdateIf(colPlanningFormValidation, …)` handlers. Dirty is a diff (`dirtyFields`), valid is
 *    a computed record (`validatePlanning`).
 *  - The commented-out bulk save block in `pcf_…_ButtonsSave.OnChange` (Y:2794-2904). It is not
 *    resurrected — permits and acquisition rows save through their own panels, as in the canvas.
 *  - `Collect(colAquisitionStatuses…Types, Blank())`, the schema-priming idiom.
 *  - The `SVGImages` selection dot on the permit gallery (now the row's selected state).
 *  - `OnHidden`'s `Reset(...)` calls (local state is discarded when the screen unmounts).
 *  - The `Trace(...)` warning when no planning row loaded (Y:101-107) — telemetry only.
 *
 * SOURCE DEFECTS fixed — each is marked at its rule, with a `…CanvasParity` twin and a test:
 *  1. the height-limit error label uses `And` where `Or` is needed, and its range branch is
 *     un-negated (`validateHeightLimit`);
 *  2. `"Secured must be between 0 and 100."` contradicts its own 0–999 check (`MSG.securedRange`);
 *  3. the In-rem acquisition save divides without an error guard (`aquisitionFractionCanvasParity`);
 *  4. the acquisition seed is all-or-nothing per LLA kind (`planAquisitionSeed`);
 *  5. the banner's height tests Project Start Date, its visibility End Date (`pageLock`);
 *  6. `Text(0, "#")` shows a stored height of 0 as blank (`formatOneToTwoPlaces`);
 *  7. footer Cancel resets ten fields but not the height toggle and value (`resetPlanningForm`);
 *  8. footer Cancel stays disabled for the rest of the visit after one save (`canReset`).
 */
import {
  isNumeric, isDecimalWithPlaces, inRange, parseNumber, roundDown, isBlank, type Lang,
} from "@/domain/powerFxNumeric";
import { CHOICE_PROCESS, ES, TEXT_MAX_LENGTH } from "@/data/dataverseNames";
import { bind } from "@/data/odata";
import { refusePlan, type WritePlan } from "@/data/writePlan";
import type { PlanJob } from "@/data/usePlanWrite";
import { textFormat } from "@/features/pm/generators/rules";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_ProjectPlanning` logical names (generated `Vsb_projectplanningsModel`). */
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

/** `vsb_Permit` logical names (generated `Vsb_permitsModel`). Permits hang off the PLANNING row. */
export const PERMIT_COL = {
  id: "vsb_permitid",
  name: "vsb_name",
  projectPlanning: "_vsb_projectplanning_value",
  submissionDate: "vsb_submissiondate",
  submissionDateType: "vsb_submissiondatetype",
  approvalDate: "vsb_approvaldate",
  approvalDateType: "vsb_approvaldatetype",
} as const;

export const PERMIT_LOOKUP = {
  projectPlanning: "vsb_ProjectPlanning",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `vsb_AquisitionStatus` logical names (generated model). NOTE the project lookup is `vsb_projectid`. */
export const AQUISITION_COL = {
  id: "vsb_aquisitionstatusid",
  project: "_vsb_projectid_value",
  type: "_vsb_aquisitionstatustype_value",
  secured: "vsb_secured",
  required: "vsb_required",
  /** `Aquisition Status [%]` — stores the FRACTION (0.25), the UI shows 25. */
  percentage: "vsb_aquisitionstatuspercentage",
} as const;

export const AQUISITION_LOOKUP = {
  project: "vsb_ProjectId",
  type: "vsb_AquisitionStatusType",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `vsb_AquisitionType` logical names (generated `Vsb_aquisitiontypesModel`). */
export const AQUISITION_TYPE_COL = {
  id: "vsb_aquisitiontypeid",
  /** `'Status Name'` — the caption the galleries and the panel show (Y:2223, 3208). `vsb_name` is the Id. */
  statusName: "vsb_statusname",
  type: "vsb_type",
  order: "vsb_order",
} as const;

/** `Custom Choice Values.'Field Name'` — the two discriminators the pickers filter on (Y:1051, 1196). */
export const CUSTOM_CHOICE_FIELD = {
  legalPlanningBasis: "vsb_legalplanningbasis",
  permitProcedure: "vsb_permitprocedure",
} as const;

/** `Projects` columns the screen reads (generated `Vsb_projectsModel`; Project ID / Name per D25). */
export const PROJECT_COL = {
  id: "vsb_projectid",
  /** `'Project ID'` is `vsb_name`. */
  projectNumber: "vsb_name",
  /** `'Project Name'` is `vsb_projectname` — what the planning row's Name is set to (Y:92, 2750). */
  projectName: "vsb_projectname",
  endDate: "vsb_enddate",
  projectStartDate: "vsb_projectstartdate",
  totalCapacity: "vsb_totalcapacity",
  netYieldP50: "vsb_netyieldp50",
  clusterState: "_vsb_clusterstate_value",
  country: "_vsb_country_value",
  /** `'Besitzer (Unternehmenseinheit)'` — the business unit every create here is owned by. */
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

const OBU_BIND = "owningbusinessunit@odata.bind";

/**
 * The text inputs' `MaxLength`: `gblAppConstants.DefaultMaxLength` (55) and
 * `.DefaultLongMaxLength` (300) (App.pa.yaml:1184-1187).
 *
 * Cooperation Details is `DefaultLongMaxLength` (Y:951, counter Y:983) — D15e: the earlier build
 * used 55, which would have truncated a stored 300-character value on Save.
 *
 * DIVERGENCE: `txt_…_SecuredAccess` sets no `MaxLength` (Y:1916-1934); the column holds 100
 * characters (`customizations.xml`), so the input stops at 100 instead of letting Dataverse refuse
 * the save. It has no counter, as in the canvas.
 */
export const MAX_LENGTH = {
  cooperationPartner: TEXT_MAX_LENGTH.default,
  cooperationDetails: TEXT_MAX_LENGTH.long,
  planningBasisDetails: TEXT_MAX_LENGTH.default,
  securedAccess: 100,
  repoweringDetails: TEXT_MAX_LENGTH.long,
} as const;

/** The acquisition inputs' `MaxLength: =3` (Y:3297, 3393, 3480). */
export const AQUISITION_MAX_LENGTH = 3;

/** The General tab's labels, verbatim. */
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

/** The `colPlanningFormValidation` rows, minus the two the panels own (Permits, AquisitionStatus). */
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
  /** `RecordInfo(record, RecordInfo.EditPermission)` — passes; Dataverse decides (D1). */
  canEdit: boolean;
  /** `RecordInfo(record, RecordInfo.DeletePermission)` — passes; Dataverse decides (D1). */
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
  /** `'Status Name'` (`vsb_statusname`) — the caption shown. */
  statusName: string | null;
  /** `Type` — 952850000 in personam, 952850001 in rem. */
  type: number | null;
  order: number | null;
}

export interface AquisitionStatusRow {
  id: string;
  typeId: string | null;
  /** The type's `'Status Name'`. */
  typeName: string | null;
  /** The type's `Order`, which is what both galleries sort by. */
  typeOrder: number | null;
  /** The type's `Type` — which gallery the row belongs to. */
  typeKind: number | null;
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
  /** `lbl_…_AquisitionStatus_InpForm_Body_Secured_ErrorMessage.Text` (Y:3267) — verbatim. */
  securedNumber: "Secured must be number.",
  /**
   * SOURCE DEFECT: the canvas condition is `Value(Secured) >= 0 && <= 999` (Y:3268-3273), but
   * the message reads `"Secured must be between 0 and 100."`, while Required — same 0–999 check —
   * reads "between 0 and 999.". Resolved in favour of the CONDITION (the Save gate also checks
   * 0–999, Y:3692-3715): the message says 999. The canvas string is `MSG_CANVAS.securedRange100`.
   */
  securedRange: "Secured must be between 0 and 999.",
  /** Same label (Y:3283) — verbatim. */
  securedTooHigh: '"Secured" has to be lower than or equal to "Required".',
  /** `lbl_…_InpForm_Body_Requered_ErrorMessage.Text` (Y:3364) — verbatim. */
  requiredNumber: "Required must be number",
  /** Same label (Y:3371) — verbatim. */
  requiredRange: "Required must be between 0 and 999.",
  /** Same label (Y:3379) — verbatim. */
  requiredTooLow: '"Required" has to be higher than or equal to "Secured".',
  /** `gblAppResx.NumericTwoDecimals` (App.pa.yaml:1630) — verbatim. */
  heightDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_HeightLimit_ErrorMsg_ProjectPlanning.Text` (Y:1379) — verbatim. */
  heightRange: "Please select a value between 0 and 99999.",
} as const;

/** The canvas strings this module deliberately diverges from. */
export const MSG_CANVAS = {
  /** `lbl_…_InpForm_Body_Secured_ErrorMessage.Text` (Y:3274) — verbatim. */
  securedRange100: "Secured must be between 0 and 100.",
} as const;

/** `Notify` / `cmp_PopUp_Loading` texts, verbatim. */
export const NOTIFY = {
  /** `OnVisible` (Y:50). */
  loading: "Loading, Please wait...",
  /** `pcf_…_ButtonsSave.OnChange` (Y:2738). */
  saving: "Project Planning will be saved, please wait...",
  /** Y:2785. */
  saved: "Project Planning data was successfully saved!",
  /** `pcf_btn_…_Buttons_Save_UnderLaw` / `_InRem` `.OnChange` (Y:3738, 3853). */
  savingAquisition: "Saving Aquisition Status...",
  /** `pcf_…_NewEditPermitBodyButtons_Save.OnChange` (Y:4345) — shown after an edit too. */
  permitSaved: "Permit was successfully added!",
  /** `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit.OnConfirm` (Y:4425). */
  permitDeleted: "Permit deleted.",
} as const;

/**
 * `"Error: <what> could not be saved. " & "Internal error: originated on " & FirstError.Source &
 * ". Message: " & FirstError.Message & FirstError.Details.HttpResponse`. The table stands in for
 * `FirstError.Source`, as on General Data (D25) and Team (D30).
 */
const errorText = (prefix: string, table: string) => (detail: string): string =>
  `${prefix}Internal error: originated on ${table}. Message: ${detail}`;

export const ERROR_TEXT = {
  /** Y:2790 — verbatim prefix, trailing space included. */
  save: errorText("Error: Project Planning could not be saved. ", ES.projectPlannings),
  /** Y:4341 — verbatim prefix. */
  permitSave: errorText("Error: Permits could not be saved. ", ES.permits),
  /** Y:4426 — verbatim prefix. */
  permitDelete: errorText("Error: Permit could not be deleted. ", ES.permits),
  /**
   * Y:3648, 3765, 3877 — verbatim, the canvas typo ("assosiated") and the copy-pasted entity name
   * ("Shareholder Entity") included: it is the text the acquisition Save and Clear & Save show.
   */
  aquisitionSave: errorText("Error: assosiated Shareholder Entity could not be saved. ", ES.aquisitionStatuses),
} as const;

/** `cmp_PopUp_Leave_Planning_Confirmation.Description` (Y:4446) — verbatim (rendered via `LEAVE_DIALOG`, D35). */
export const LEAVE_CONFIRMATION =
  "You have unsaved data. Do you really want to leave current form without saving?";
/** `lbl_…_AquisitionStatus_InRem_Percentage.Text` — verbatim. */
export const PERCENT_NOT_APPLICABLE = "N/A";

/** NEW (D31): plan refusals — not reachable through the UI, which disables the button first. */
export const REFUSAL = {
  noProject: "No project is selected.",
  noPlanning: "No Project Planning record is loaded.",
  incompletePermit: "The permit is incomplete.",
  invalidAquisition: "The acquisition values are not valid.",
} as const;

/** NEW (D31, rule 19): the load-error state. The canvas has none. */
export const PLANNING_SCREEN_TEXT = {
  loadFailedTitle: "Planning data is unavailable",
  loadFailedDescription: "The project planning could not be loaded. Reload the page to try again.",
} as const;

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

/** `lbl_ProjectRevenues_…_VisibilityMessage_21.Text` (Y:643) — verbatim. */
export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";
export const PAGE_LOCK_TITLE_TESTID = "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_21";
export const PAGE_LOCK_TESTID = "con_Milestones_Page_LockMessage_5";
export const PAGE_LOCK_ICON_TESTID = "icon_milestones_lock_5";

export type PageLockReason = "General" | "Milestones" | "Generator" | "Production" | "Draft";

export interface PageLockEntry { reason: PageLockReason; label: string; testId: string }

const LOCK_LINE = (n: number) => `lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_${n}`;

/**
 * `con_Milestones_Page_LockMessage_5.Visible` and its five bullets (Y:575-739) — `'Project ID'`
 * blank, `'End Date'` blank, `'Total Capacity'` 0/blank, `'Net Yield p50'` 0/blank, `'Cluster
 * State'.Name` blank or `"Draft"`. With no project every condition is blank, so all five show.
 *
 * SOURCE DEFECT: the banner's `Height` switch tests `IsBlank('Project Start Date')` for the
 * Milestones slot (Y:527-567) while `Visible` and the bullet test `IsBlank('End Date')`. Resolved
 * to `'End Date'`, as on Team (D30). `pageLockCanvasHeightParity` keeps the height condition.
 */
export function pageLock(project: PlanningProject | null): PageLockEntry[] {
  const p = project;
  const out: PageLockEntry[] = [];
  if (isBlank(p?.projectNumber)) out.push({ reason: "General", label: "• General", testId: LOCK_LINE(22) });
  if (isBlank(p?.endDate)) out.push({ reason: "Milestones", label: "• Milestones", testId: LOCK_LINE(23) });
  if (!p?.totalCapacity) out.push({ reason: "Generator", label: "• Generator", testId: LOCK_LINE(24) });
  if (!p?.netYieldP50) out.push({ reason: "Production", label: "• Production", testId: LOCK_LINE(25) });
  if (isBlank(p?.clusterStateName) || p?.clusterStateName === "Draft") {
    out.push({ reason: "Draft", label: "• Change the project status from Draft", testId: LOCK_LINE(26) });
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

/** `con_…_CooperationPartner.Visible` (Y:877) — Partner is shown only for `Yes`. */
export const showCooperationPartner = (cooperation: number | null): boolean =>
  cooperation === YNU.yes;

/** `con_…_CooperationDetails.Visible` (Y:937-941) — Details are shown for `Yes` or `Unknown`. */
export const showCooperationDetails = (cooperation: number | null): boolean =>
  cooperation === YNU.yes || cooperation === YNU.unknown;

/**
 * What the canvas actually SHOWS (PO, 28 Oct 2026: replicate the canvas for now).
 *
 * SOURCE DEFECT: `con_…_CooperationForm` is a wrapping AutoLayout fixed at `Height: =360`
 * (Y:798). With `Yes`, Cooperation (70) + Partner (94) + Details (178) + padding (20 + 20) is 382,
 * so Details wraps into a second column that the 380-wide form clips: it is never seen. Only
 * `Unknown`, where Partner is hidden, leaves room for it. `showCooperationDetails` keeps the
 * formula's intent.
 */
export const showCooperationDetailsCanvasParity = (cooperation: number | null): boolean =>
  cooperation === YNU.unknown;

/** `txt_…_CooperationDetails.DisplayMode` (Y:949) — Details are EDITABLE only for `Unknown`. */
export const cooperationDetailsEditable = (cooperation: number | null): boolean =>
  cooperation === YNU.unknown;

/** `con_…_SecuredAccess.Visible` (Y:1913) — shown for `Repowering.Yes` only. */
export const showSecuredAccess = (repowering: number | null): boolean =>
  repowering === YNU.yes;

/** `con_…_RepoweringDetails.Visible` (Y:1958-1962) — shown for `Yes` or `Unknown`. */
export const showRepoweringDetails = (repowering: number | null): boolean =>
  repowering === YNU.yes || repowering === YNU.unknown;

/** `con_HeightLimit_ProjectPlanning.Visible` (Y:1353) — the numeric field follows the toggle. */
export const showHeightLimit = (isHeightLimitation: boolean): boolean => isHeightLimitation;

/**
 * `drp_…_Repowering.OnChange` (Y:1863-1886): `No` → `Reset(SecuredAccess); Reset(RepoweringDetails)`,
 * `Unknown` → `Reset(SecuredAccess)`. `Reset` restores the control's DEFAULT — the stored value —
 * it does not blank it. The Save then blanks both columns only for `No` (`buildPlanningPayload`),
 * so with `Unknown` the stored Secured Access is kept, as in the canvas.
 */
export function applyRepoweringChange(
  form: PlanningForm, repowering: number | null, baseline: PlanningForm,
): PlanningForm {
  if (repowering === YNU.no) {
    return { ...form, repowering, securedAccess: baseline.securedAccess, repoweringDetails: baseline.repoweringDetails };
  }
  if (repowering === YNU.unknown) {
    return { ...form, repowering, securedAccess: baseline.securedAccess };
  }
  return { ...form, repowering };
}

/**
 * `drp_…_Cooperation.OnChange` (Y:842-850) only marks the row dirty: Partner and Details keep their
 * values while hidden, and the Save writes them (Y:2755-2756), as the canvas does.
 */
export const applyCooperationChange = (form: PlanningForm, cooperation: number | null): PlanningForm =>
  ({ ...form, cooperation });

/**
 * `tgl_HeightLimitation_ProjectPlanning.OnUncheck` (Y:1551) — `Reset(txt_HeightLimit…)`, which
 * restores the stored value; the Save writes Blank while the toggle is off (Y:2780).
 */
export function applyHeightToggle(form: PlanningForm, checked: boolean, baseline: PlanningForm): PlanningForm {
  return checked
    ? { ...form, isHeightLimitation: true }
    : { ...form, isHeightLimitation: false, heightLimitation: baseline.heightLimitation };
}

/* ══════════════════════════════════════════════════════════════════ validation ════ */

export interface FieldValidity { valid: boolean; message?: string }

/**
 * The height-limitation numeric field: at most two decimals, range 0…99999 (Y:1382-1433).
 *
 * SOURCE DEFECT, two of them in one control:
 *   `.Visible = And(Not(IsBlank(Trim(v))), Not(IsTwoDecimal(v)), Not(InRange(v,0,99999)))`
 * shows the error only when the value fails BOTH checks, so `1.234` and `100000` both pass
 * silently (the OnChange `Valid` flag is right, so Save stays disabled with no reason shown). And
 * its `.Text` third branch is `InRange(v, 0, 99999)` UN-NEGATED.
 *
 * FIXED: `Or`, and the range message on the negated condition. `validateHeightLimitCanvasParity`
 * keeps the literal source behaviour. The formulas call `fn_Numeric_Revenues`, an instance that
 * lives on `Project Revenues Screen` (Y:274 there); canvas apps resolve control references across
 * screens, so the canvas validation is live — the shared `domain/powerFxNumeric` functions are
 * the same checks.
 */
export function validateHeightLimit(text: string, language: Lang = "en-US"): FieldValidity {
  if (isBlank(text.trim())) return { valid: true };
  if (!isDecimalWithPlaces(text, 2, language)) return { valid: false, message: MSG.heightDecimals };
  if (!inRange(text, 0, 99999, language)) return { valid: false, message: MSG.heightRange };
  return { valid: true };
}

/** The literal source label: `And` of both negations, and the un-negated message. */
export function validateHeightLimitCanvasParity(text: string, language: Lang = "en-US"): FieldValidity {
  const trimmed = text.trim();
  if (isBlank(trimmed)) return { valid: true };
  const shapeBad = !isDecimalWithPlaces(text, 2, language);
  const rangeBad = !inRange(text, 0, 99999, language);
  if (!(shapeBad && rangeBad)) return { valid: true };
  return { valid: false, message: MSG.heightDecimals };
}

/**
 * What the screen uses, as the canvas behaves (PO, 28 Oct 2026: "make it same as canvas"): Save
 * follows the OnChange `Valid` flag (`validateHeightLimit`: two decimals AND 0…99999), while the
 * message shown is the canvas error label's (`validateHeightLimitCanvasParity`), so an
 * out-of-range whole number disables Save with no message, as in the canvas.
 */
export function heightLimitValidity(text: string, language: Lang = "en-US"): FieldValidity {
  const valid = validateHeightLimit(text, language).valid;
  const { message } = validateHeightLimitCanvasParity(text, language);
  return message ? { valid, message } : { valid };
}

export type PlanningValidity = Record<PlanningField, FieldValidity>;

const OK: FieldValidity = { valid: true };

/**
 * The whole validation table. Every row except the height field is `{Valid: true, Dirty: true}`
 * in the canvas — the only real validation on the General and Repowering tabs is the height.
 */
export function validatePlanning(form: PlanningForm, language: Lang = "en-US"): PlanningValidity {
  return {
    cooperation: OK, cooperationPartner: OK, cooperationDetails: OK, legalPlanningId: OK,
    planningBasisCategory: OK, permitProcedureId: OK, planningBasisDetails: OK,
    repowering: OK, securedAccess: OK, repoweringDetails: OK, isHeightLimitation: OK,
    heightLimitation: form.isHeightLimitation ? heightLimitValidity(form.heightLimitation, language) : OK,
  };
}

export const invalidPlanningFields = (v: PlanningValidity): PlanningField[] =>
  PLANNING_FIELDS.filter((f) => !v[f].valid);

export const planningMessages = (v: PlanningValidity): string[] =>
  PLANNING_FIELDS.map((f) => v[f].message).filter((m): m is string => Boolean(m));

/* ═════════════════════════════════════════════════════════════ dirty tracking ════ */

/** Each control's `Default` / `Value` from the stored row (Y:835-1986). */
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

/**
 * `txt_HeightLimit_ProjectPlanning.Value` (Y:1436-1451):
 * `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))`. `"#0.0#"` rounds (1.235 → "1.24").
 *
 * SOURCE DEFECT: `Text(0, "#")` prints nothing, so a stored 0 opens blank — and with the toggle on
 * a blank field blocks Save until it is typed again. Here 0 shows "0" (as Admin Cost's `rateText`).
 * `formatOneToTwoPlacesCanvasParity` is the literal formula.
 */
export function formatOneToTwoPlaces(value: number | null | undefined): string {
  if (value === 0) return "0";
  return formatOneToTwoPlacesCanvasParity(value);
}

export function formatOneToTwoPlacesCanvasParity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return textFormat(value, Number.isInteger(value) ? "#" : "#0.0#");
}

export const dirtyFields = (form: PlanningForm, baseline: PlanningForm): PlanningField[] =>
  PLANNING_FIELDS.filter((f) => form[f] !== baseline[f]);

/**
 * `CountRows(Filter(colPlanningFormValidation, Dirty = true)) > 0`, derived from the values.
 *
 * SOURCE DEFECT: the `Permits` row of the validation table was permanently clean — the
 * `UpdateIf(… Name = "Permits" …)` in the permit Save sits inside a `/* … *\/` comment (Y:4331-4339).
 * `permitsTouched` lets a permit edit count (unused by the leave guard: permits save from their own panel).
 * `isDirtyCanvasParity` keeps the omission.
 */
export function isDirty(
  form: PlanningForm, baseline: PlanningForm, permitsTouched = false, aquisitionTouched = false,
): boolean {
  return dirtyFields(form, baseline).length > 0 || permitsTouched || aquisitionTouched;
}

export const isDirtyCanvasParity = (form: PlanningForm, baseline: PlanningForm): boolean =>
  dirtyFields(form, baseline).length > 0;

/**
 * Only the planning row's own fields — what the Save button gates on.
 *
 * DIVERGENCE: Clear & Save marks the `AquisitionStatus` row dirty (Y:3659-3666), which arms the
 * planning Save although the planning row is unchanged (the acquisition Save does not). Here Save
 * arms only for a change to the planning row, so an unchanged planning patch is never sent.
 * `canSaveCanvasParity` keeps the canvas behaviour.
 */
export const isPlanningRowDirty = (form: PlanningForm, baseline: PlanningForm): boolean =>
  dirtyFields(form, baseline).length > 0;

/* ══════════════════════════════════════════════════════════════════ gating ════ */

export interface PlanningGating {
  project: PlanningProject | null;
  /** `gblCurrentUser.CanEditSelectedProject` — passes; Dataverse decides (D1). */
  canEdit: boolean;
}

/**
 * `If(con_Milestones_Page_LockMessage_5.Visible, DisplayMode.Disabled, DisplayMode.Edit)` — the
 * gate Cooperation, Category, Procedure, Planning Basis Details, the toggle and the Permits command
 * bar share (Draft is one of the lock's conditions). `canEdit` is folded in (it always passes, D1).
 */
export const canEditPlanning = (g: PlanningGating): boolean =>
  g.canEdit && !isDraft(g.project) && !isPageLocked(g.project);

/** `tab_….DisplayMode` (Y:767-776) — disabled when the project is Draft or the page is locked. */
export const canSwitchTabs = (g: PlanningGating): boolean =>
  !isDraft(g.project) && !isPageLocked(g.project);

/** `drp_…_LegalPlanningBasis.DisplayMode` (Y:1031-1050) — at least one option AND not locked. */
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
 * `pcf_…_ButtonsSave.DisplayMode` (Y:2694-2717): `CanEditSelectedProject`, not Draft, no invalid
 * row, at least one dirty row, the height error hidden, `If(Checked, !IsBlank(height), true)`,
 * and the page not locked.
 */
export function canSave(state: PlanningSaveState): boolean {
  if (state.busy) return false;
  return saveGate(state, isPlanningRowDirty(state.form, state.baseline));
}

function saveGate(state: PlanningSaveState, dirty: boolean): boolean {
  if (!state.canEdit || isDraft(state.project) || isPageLocked(state.project) || !dirty) return false;
  if (state.form.isHeightLimitation && isBlank(state.form.heightLimitation.trim())) return false;
  return invalidPlanningFields(validatePlanning(state.form, state.language)).length === 0;
}

/** The canvas gate, where a Clear & Save (`aquisitionCleared`) also counts as dirty. */
export const canSaveCanvasParity = (state: PlanningSaveState, aquisitionCleared: boolean): boolean =>
  saveGate(state, isPlanningRowDirty(state.form, state.baseline) || aquisitionCleared);

/**
 * `pcf_…_ButtonsReset.DisplayMode` (Y:2977-2990): `locAllowPlanningReset && dirty`.
 *
 * SOURCE DEFECT: `locAllowPlanningReset` is set false by every successful Save (Y:2958) and only
 * OnVisible sets it true again, so after one save Cancel stays disabled for the rest of the visit
 * however much is edited. Here Cancel follows the dirty state alone. `canResetCanvasParity` keeps it.
 */
export const canReset = (form: PlanningForm, baseline: PlanningForm): boolean =>
  isPlanningRowDirty(form, baseline);

export const canResetCanvasParity = (state: {
  allowReset: boolean; form: PlanningForm; baseline: PlanningForm;
}): boolean => state.allowReset && isPlanningRowDirty(state.form, state.baseline);

/**
 * `pcf_…_ButtonsReset.OnChange` (Y:3008-3029) — `Reset` of the form fields, then every row clean.
 *
 * SOURCE DEFECT: the ten `Reset`s leave out the height toggle and the height value, while the same
 * handler clears every Dirty flag — so a changed toggle stayed on screen, unsaved and no longer
 * counted as a change. Here Cancel resets everything. `resetPlanningFormCanvasParity` keeps the
 * toggle and the height.
 */
export const resetPlanningForm = (_form: PlanningForm, baseline: PlanningForm): PlanningForm => ({ ...baseline });

export const resetPlanningFormCanvasParity = (form: PlanningForm, baseline: PlanningForm): PlanningForm =>
  ({ ...baseline, isHeightLimitation: form.isHeightLimitation, heightLimitation: form.heightLimitation });

export function numericOrNull(text: string, language: Lang = "en-US"): number | null {
  if (isBlank(text.trim())) return null;
  const n = parseNumber(text, language);
  return Number.isNaN(n) ? null : n;
}

const projectBinds = (project: PlanningProject): Record<string, string> => ({
  [`${PLANNING_LOOKUP.project}@odata.bind`]: bind(ES.projects, project.id),
  ...(project.owningBusinessUnitId ? { [OBU_BIND]: `/businessunits(${project.owningBusinessUnitId})` } : {}),
});

/**
 * The `Project Plannings` patch (Y:2741-2783) — the same columns on create and update: Project,
 * Name (`'Project Name'`), every form field, the two `Custom Choice Values` lookups, and the
 * project's Owning Business Unit. `'Secured Access'` and `'Repowering Details'` are Blank when
 * Repowering is `No`; `'Height limitation [m]'` is Blank while the toggle is off.
 */
export function buildPlanningPayload(
  form: PlanningForm, project: PlanningProject, language: Lang = "en-US",
): Record<string, unknown> {
  const repoweringIsNo = form.repowering === YNU.no;
  const text = (v: string, max: number): string | null => (isBlank(v) ? null : v.slice(0, max));
  return {
    ...projectBinds(project),
    [PLANNING_COL.name]: project.projectName,
    [PLANNING_COL.cooperation]: form.cooperation,
    [PLANNING_COL.cooperationPartner]: text(form.cooperationPartner, MAX_LENGTH.cooperationPartner),
    [PLANNING_COL.cooperationDetails]: text(form.cooperationDetails, MAX_LENGTH.cooperationDetails),
    [`${PLANNING_LOOKUP.legalPlanning}@odata.bind`]:
      form.legalPlanningId ? bind(ES.customChoiceValues, form.legalPlanningId) : null,
    [PLANNING_COL.planningBasisCategory]: form.planningBasisCategory,
    [`${PLANNING_LOOKUP.permitProcedure}@odata.bind`]:
      form.permitProcedureId ? bind(ES.customChoiceValues, form.permitProcedureId) : null,
    [PLANNING_COL.planningBasisDetails]: text(form.planningBasisDetails, MAX_LENGTH.planningBasisDetails),
    [PLANNING_COL.repowering]: form.repowering,
    [PLANNING_COL.securedAccess]: repoweringIsNo ? null : text(form.securedAccess, MAX_LENGTH.securedAccess),
    [PLANNING_COL.repoweringDetails]: repoweringIsNo ? null : text(form.repoweringDetails, MAX_LENGTH.repoweringDetails),
    [PLANNING_COL.isHeightLimitation]: form.isHeightLimitation,
    [PLANNING_COL.heightLimitation]: form.isHeightLimitation ? numericOrNull(form.heightLimitation, language) : null,
  };
}

/**
 * `OnVisible` get-or-create (Y:80-100): with no planning row,
 * `Patch('Project Plannings', Defaults(...), {Project, Name: 'Project Name', 'Owning Business Unit'})`
 * — nothing else; the form fields are written by the Save.
 */
export function buildPlanningSeedPayload(project: PlanningProject): Record<string, unknown> {
  return { [PLANNING_COL.name]: project.projectName, ...projectBinds(project) };
}

/** The seed as a plan: empty when the row exists. */
export function planEnsurePlanning(project: PlanningProject | null, planning: PlanningRecord | null): WritePlan {
  if (!project?.id || planning) return { writes: [], log: [] };
  return {
    writes: [{ op: "create", entitySet: ES.projectPlannings, data: buildPlanningSeedPayload(project), reason: "create the project planning" }],
    log: [],
  };
}

/** The Save: `Patch(If(IsBlank(gblRecordProjectPlanning), Defaults(...), gblRecordProjectPlanning), …)`. */
export function planSavePlanning(
  form: PlanningForm, project: PlanningProject | null, planning: PlanningRecord | null, language: Lang = "en-US",
): WritePlan {
  if (!project?.id) return refusePlan(REFUSAL.noProject);
  const data = buildPlanningPayload(form, project, language);
  return {
    writes: [planning?.id
      ? { op: "update", entitySet: ES.projectPlannings, id: planning.id, data, reason: "save the project planning" }
      : { op: "create", entitySet: ES.projectPlannings, data, reason: "create the project planning" }],
    log: [],
  };
}

export function savePlanningJob(
  form: PlanningForm, project: PlanningProject | null, planning: PlanningRecord | null, language: Lang = "en-US",
): PlanJob {
  return {
    progress: NOTIFY.saving,
    success: NOTIFY.saved,
    errorText: ERROR_TEXT.save,
    plan: planSavePlanning(form, project, planning, language),
  };
}

/* ═════════════════════════════════════════════════════════════════ the permits ════ */

/**
 * `btn_…_PermitsRowTransparent.OnSelect` (Y:1697-1700) —
 * `If(locSelectedPermit.Permit = ThisItem.Permit, Blank(), ThisItem)`.
 */
export const togglePermitSelection = (selectedId: string | null, clickedId: string): string | null =>
  (selectedId === clickedId ? null : clickedId);

/** `pcf_…_NewEditPermitBodyButtons_Save.DisplayMode` (Y:4290-4301) — all five fields. */
export function canSavePermit(draft: PermitDraft): boolean {
  return (
    !isBlank(draft.name.trim()) &&
    !isBlank(draft.submissionDate) &&
    draft.submissionDateType !== null &&
    !isBlank(draft.approvalDate) &&
    draft.approvalDateType !== null
  );
}

/**
 * `pcf_…_PermitsCommandBar` (Y:1755-1781): the bar is disabled while the page is locked; Edit and
 * Delete need a selection and `RecordInfo(…, Edit/DeletePermission)` (which pass, D1).
 */
export function permitCommandState(
  g: PlanningGating, selected: PermitRow | null,
): { canNew: boolean; canEdit: boolean; canDelete: boolean } {
  const unlocked = canEditPlanning(g);
  return {
    canNew: unlocked,
    canEdit: unlocked && selected !== null && selected.canEdit,
    canDelete: unlocked && selected !== null && selected.canDelete,
  };
}

/**
 * The permit `Patch` (Y:4313-4330) — the same columns on create and update: the Project Planning
 * lookup, the five fields, and the PLANNING row's Owning Business Unit
 * (`gblRecordProjectPlanning.'Owning Business Unit'`).
 */
export function buildPermitPayload(draft: PermitDraft, planning: PlanningRecord): Record<string, unknown> {
  return {
    [`${PERMIT_LOOKUP.projectPlanning}@odata.bind`]: bind(ES.projectPlannings, planning.id),
    [PERMIT_COL.name]: draft.name.trim(),
    [PERMIT_COL.submissionDate]: draft.submissionDate,
    [PERMIT_COL.submissionDateType]: draft.submissionDateType,
    [PERMIT_COL.approvalDate]: draft.approvalDate,
    [PERMIT_COL.approvalDateType]: draft.approvalDateType,
    ...(planning.owningBusinessUnitId ? { [OBU_BIND]: `/businessunits(${planning.owningBusinessUnitId})` } : {}),
  };
}

/** `Patch(Permits, If(IsBlank(locSelectedPermit), Defaults(Permits), locSelectedPermit), …)`. */
export function planSavePermit(draft: PermitDraft, permitId: string | null, planning: PlanningRecord | null): WritePlan {
  if (!planning?.id) return refusePlan(REFUSAL.noPlanning);
  if (!canSavePermit(draft)) return refusePlan(REFUSAL.incompletePermit);
  const data = buildPermitPayload(draft, planning);
  return {
    writes: [permitId
      ? { op: "update", entitySet: ES.permits, id: permitId, data, reason: "update the permit" }
      : { op: "create", entitySet: ES.permits, data, reason: "add the permit" }],
    log: [],
  };
}

/** The permit Save shows no progress text in the canvas (`""` raises no overlay). */
export function savePermitJob(draft: PermitDraft, permitId: string | null, planning: PlanningRecord | null): PlanJob {
  return { progress: "", success: NOTIFY.permitSaved, errorText: ERROR_TEXT.permitSave, plan: planSavePermit(draft, permitId, planning) };
}

/** `Remove(Permits, locSelectedPermit)` (Y:4423), through `executePlan`, which checks the result (rule 14). */
export function planDeletePermit(permitId: string): WritePlan {
  return { writes: [{ op: "delete", entitySet: ES.permits, id: permitId, reason: "delete the permit" }], log: [] };
}

export function deletePermitJob(permitId: string): PlanJob {
  return { progress: "", success: NOTIFY.permitDeleted, errorText: ERROR_TEXT.permitDelete, plan: planDeletePermit(permitId) };
}

export const emptyPermitDraft = (): PermitDraft => ({
  name: "", submissionDate: null, submissionDateType: null, approvalDate: null, approvalDateType: null,
});

export const permitDraftFrom = (row: PermitRow): PermitDraft => ({
  name: row.name ?? "",
  submissionDate: row.submissionDate,
  submissionDateType: row.submissionDateType,
  approvalDate: row.approvalDate,
  approvalDateType: row.approvalDateType,
});

/** `Choices('Permit Date Type')` (Y:4147, 4226) — values pinned to the generated enum by UT-PLAN-060. */
export const PERMIT_DATE_TYPES: { value: number; label: string }[] = [
  { value: CHOICE_PROCESS.permitDateType.plan, label: "Plan" },
  { value: CHOICE_PROCESS.permitDateType.actual, label: "Actual" },
];

/** The permit panel's field labels. */
export const PERMIT_PANEL_LABELS = {
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyContent_Name.Text` — verbatim. */
  name: "Name",
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDate.Text` — verbatim. */
  submissionDate: "Submission Date",
  /** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDate.Text` — verbatim. */
  approvalDate: "Approval Date",
} as const;

/** `pcf_…_PermitsCommandBar.Items` (Y:1762-1781) — `ItemDisplayName`s, verbatim. */
export const PERMIT_COMMAND_LABELS = {
  newPermit: "New Permit",
  edit: "Edit",
  delete: "Delete",
} as const;

/** `lbl_ProjectPlanning_RightPanel_NewEditPermitBodyHeader.Text` — `If(IsBlank(locSelectedPermit), …)`. */
export const permitPanelTitle = (isNew: boolean): string => (isNew ? "New Permit" : "Edit Permit");

/** The Permits gallery's header row, verbatim. */
export const PERMIT_GRID_COLUMNS = {
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitsHeaderName.Text` — verbatim. */
  permit: "Permit",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitsHeaderSubmitted.Text` — verbatim. */
  submitted: "Permit Submitted",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_PermitsHeaderApproved.Text` — verbatim. */
  approved: "Permit Approved",
} as const;

/** The `YYYY-MM-DD` prefix of a stored date-only value as local parts; null when unusable. */
function dateParts(date: string | null): { y: number; m: number; d: number } | null {
  if (!date || date.length < 10) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * The Permits grid's date cells (`lbl_…_PermitsRowSubmitted` / `…Approved` `.Text`, Y:1628, 1639).
 *
 * DIVERGENCE (D31 L3, product owner 20 Oct 2026): `dd/mm/yyyy` — a two-digit day. The canvas
 * formats `Text(ThisItem.'… Date', "d/mm/yyyy")` (no leading zero on the day);
 * `permitDateCellCanvasParity` keeps that. A blank date is "" in both. Built from the stored
 * date's own parts (rule 18), never `toISOString()`.
 */
export function permitDateCell(date: string | null): string {
  const p = dateParts(date);
  if (!p) return "";
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

/** NOT LIVE — the canvas `Text(date, "d/mm/yyyy")`: "1/10/2026". */
export function permitDateCellCanvasParity(date: string | null): string {
  const p = dateParts(date);
  if (!p) return "";
  return `${p.d}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

/**
 * Whether a permit grid date is shown in the theme blue: the cell's `FontColor` (Y:1627, 1638)
 * is `If(ThisItem.'… Date Type' = 'Permit Date Type'.Actual, ColorValue(gblAppTheme.palette.
 * themePrimary))` — Actual is `palette.themePrimary`; Plan or blank falls back to the default
 * (black) text colour.
 */
export const permitDateIsActual = (dateType: number | null): boolean =>
  dateType === CHOICE_PROCESS.permitDateType.actual;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * The permit panel's date input text: `dte_…_SubmissionDate` / `…_ApprovalDate` have
 * `Format: 'DatePickerCanvas.Format'.LongAbbreviated` (Y:4140, 4220) — "Mon, Oct 19, 2026".
 * The weekday comes from the local calendar date (rule 18). A blank date is "".
 */
export function permitInputDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${WEEKDAY_SHORT[date.getDay()]}, ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** A stored `YYYY-MM-DD` as a local-midnight `Date` for the panel's date picker; null when blank. */
export function permitDateValue(date: string | null): Date | null {
  const p = dateParts(date);
  return p ? new Date(p.y, p.m - 1, p.d) : null;
}

/**
 * NEW (D31 L3, product owner 20 Oct 2026): the tag beside the permit panel's date input — the
 * label of the date's own `Permit Date Type` ("Plan" / "Actual", `PERMIT_DATE_TYPES`), "" while
 * no type is chosen. The canvas shows the type only in the radio above the picker.
 */
export const permitDateTag = (dateType: number | null): string =>
  PERMIT_DATE_TYPES.find((t) => t.value === dateType)?.label ?? "";

/* ═══════════════════════════════════════════════════════════ acquisition status ════ */

/** `Aquisition Types.Type` → the two gallery filters — pinned to the generated enum by UT-PLAN-060. */
export const LLA_TYPE_VALUE: Record<LlaType, number> = {
  personam: CHOICE_PROCESS.aquisitionType.inPersonam,
  rem: CHOICE_PROCESS.aquisitionType.inRem,
};

export const LLA_TYPE_LABEL: Record<LlaType, string> = {
  /** `lbl_…_AquisitionStatus_UnderLaw_HeaderName.Text` — verbatim. */
  personam: "LLAs in personam",
  /** `lbl_…_AquisitionStatus_InRem_HeaderName.Text` — verbatim. */
  rem: "LLAs in rem",
};

/**
 * The panel's derived percentage: `locAquisitionStatusEntityPercentageVal` = `Secured / Required`
 * (Y:3298-3312, 3394-3415), shown as `RoundDown(x * 100, 0)` or `"N/A"` when `Required = 0`
 * (Y:3486-3501). Computed as `Secured * 100 / Required` so 29 of 100 is 29, not 28.999….
 *
 * DIVERGENCE (D31 L4, product owner 20 Oct 2026): while Secured or Required is blank the box shows
 * nothing (""): neither "N/A" nor the canvas 0 (the OnChange falls back to 0;
 * `securedPercentCanvasParity`). A non-numeric value (already flagged by its error label) still
 * gives "N/A", as before.
 */
export function securedPercent(
  secured: number | string | null, required: number | string | null, language: Lang = "en-US",
): number | typeof PERCENT_NOT_APPLICABLE | "" {
  if (isBlankInput(secured) || isBlankInput(required)) return "";
  const s = typeof secured === "number" ? secured : parseNumber(secured, language);
  const r = typeof required === "number" ? required : parseNumber(required, language);
  if (Number.isNaN(s) || Number.isNaN(r) || r === 0) return PERCENT_NOT_APPLICABLE;
  return roundDown((s * 100) / r, 0);
}

/** NOT LIVE — the canvas: a blank or non-numeric input counts as 0; `Required = 0` is "N/A". */
export function securedPercentCanvasParity(
  secured: number | string | null, required: number | string | null, language: Lang = "en-US",
): number | typeof PERCENT_NOT_APPLICABLE {
  const toNum = (v: number | string | null): number => {
    const n = typeof v === "number" ? v : isBlankInput(v) ? 0 : parseNumber(v, language);
    return Number.isNaN(n) ? 0 : n;
  };
  const s = toNum(secured);
  const r = toNum(required);
  if (r === 0) return PERCENT_NOT_APPLICABLE;
  return roundDown((s * 100) / r, 0);
}

const isBlankInput = (v: number | string | null): boolean =>
  v === null || (typeof v === "string" && v.trim() === "");

/** Removes binary floating-point noise (0.29 × 100 = 28.999…96 in JS, 29 in Power Fx). */
const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

/**
 * The galleries' `lbl_…_Percentage.Text` (Y:2151-2163): `If(Required = 0, "N/A",
 * If(Or(Not(IsBlank(%)), Value(%) >= 0), Value(%) * 100, ""))` — the stored fraction × 100, not
 * rounded; a blank fraction is 0 (`Value(Blank()) * 100`).
 */
export function storedPercentToDisplay(
  percentage: number | null, required: number | null,
): number | typeof PERCENT_NOT_APPLICABLE {
  if (required === 0) return PERCENT_NOT_APPLICABLE;
  return clean((percentage ?? 0) * 100);
}

export interface AquisitionValidity { secured: FieldValidity; required: FieldValidity }

/**
 * The two error labels (Y:3259-3286, 3356-3382) and the Save gate (Y:3692-3715): both non-blank,
 * numeric, each in 0…999, and `Required >= Secured`.
 */
export function validateAquisition(draft: AquisitionDraft, language: Lang = "en-US"): AquisitionValidity {
  const out: AquisitionValidity = { secured: { valid: true }, required: { valid: true } };
  const secured = draft.secured.trim();
  const required = draft.required.trim();

  if (isBlank(secured) || !isNumeric(secured, language)) out.secured = { valid: false, message: MSG.securedNumber };
  else if (!inRange(secured, 0, 999, language)) out.secured = { valid: false, message: MSG.securedRange };

  if (isBlank(required) || !isNumeric(required, language)) out.required = { valid: false, message: MSG.requiredNumber };
  else if (!inRange(required, 0, 999, language)) out.required = { valid: false, message: MSG.requiredRange };

  if (out.secured.valid && out.required.valid && parseNumber(secured, language) > parseNumber(required, language)) {
    out.secured = { valid: false, message: MSG.securedTooHigh };
    out.required = { valid: false, message: MSG.requiredTooLow };
  }
  return out;
}

export const canSaveAquisition = (draft: AquisitionDraft, language: Lang = "en-US"): boolean => {
  const v = validateAquisition(draft, language);
  return v.secured.valid && v.required.valid;
};

/**
 * What `'Aquisition Status [%]'` is set to: `Value(Percentage.Value) / 100`, where the percentage
 * box holds `RoundDown(Secured / Required * 100)` or `"N/A"`.
 *
 * SOURCE DEFECT: the In-personam Save wraps it in `IfError(…, 0)` (Y:3757-3760); the In-rem Save
 * does not (Y:3866), so with Required = 0 it evaluates `Value("N/A") / 100` and the Patch fails.
 * FIXED: both kinds store 0 there, as In-personam does. `aquisitionFractionCanvasParity` keeps the
 * per-kind behaviour ("error" for In-rem).
 */
export function aquisitionFraction(draft: AquisitionDraft, language: Lang = "en-US"): number {
  const display = securedPercent(draft.secured, draft.required, language);
  return typeof display === "number" ? display / 100 : 0;
}

export function aquisitionFractionCanvasParity(
  draft: AquisitionDraft, lla: LlaType, language: Lang = "en-US",
): number | "error" {
  const display = securedPercentCanvasParity(draft.secured, draft.required, language);
  if (display !== PERCENT_NOT_APPLICABLE) return display / 100;
  return lla === "personam" ? 0 : "error";
}

/**
 * The acquisition Save `Patch` (Y:3745-3762, 3858-3871): Secured, Required, the fraction, and —
 * re-written from the row — Project, `'Aquisition Status Type'` and the project's Owning Business
 * Unit.
 */
export function buildAquisitionPayload(
  draft: AquisitionDraft,
  ctx: { project: PlanningProject; typeId: string | null; language?: Lang },
): Record<string, unknown> {
  const lang = ctx.language ?? "en-US";
  return {
    [AQUISITION_COL.secured]: numericOrNull(draft.secured, lang),
    [AQUISITION_COL.required]: numericOrNull(draft.required, lang),
    [AQUISITION_COL.percentage]: aquisitionFraction(draft, lang),
    [`${AQUISITION_LOOKUP.project}@odata.bind`]: bind(ES.projects, ctx.project.id),
    ...(ctx.typeId ? { [`${AQUISITION_LOOKUP.type}@odata.bind`]: bind(ES.aquisitionTypes, ctx.typeId) } : {}),
    ...(ctx.project.owningBusinessUnitId ? { [OBU_BIND]: `/businessunits(${ctx.project.owningBusinessUnitId})` } : {}),
  };
}

export function planSaveAquisition(
  draft: AquisitionDraft, row: AquisitionStatusRow, project: PlanningProject | null, language: Lang = "en-US",
): WritePlan {
  if (!project?.id) return refusePlan(REFUSAL.noProject);
  if (!canSaveAquisition(draft, language)) return refusePlan(REFUSAL.invalidAquisition);
  return {
    writes: [{
      op: "update", entitySet: ES.aquisitionStatuses, id: row.id,
      data: buildAquisitionPayload(draft, { project, typeId: row.typeId, language }), reason: "save the acquisition status",
    }],
    log: [],
  };
}

export function saveAquisitionJob(
  draft: AquisitionDraft, row: AquisitionStatusRow, project: PlanningProject | null, language: Lang = "en-US",
): PlanJob {
  return { progress: NOTIFY.savingAquisition, errorText: ERROR_TEXT.aquisitionSave, plan: planSaveAquisition(draft, row, project, language) };
}

/**
 * `pcf_btn_…_InpForm_Buttons_Cancel_1` — "Clear & Save" (Y:3560-3669): `Patch {Secured: Blank(),
 * Required: Blank(), 'Aquisition Status [%]': Blank()}`, then reload the gallery and close. Its
 * caption and tooltip ("Set secured and required field to blank.") say what it does; the panel's
 * other button, `…_Buttons_Cancel`, is the plain cancel.
 */
export function buildAquisitionClearPayload(): Record<string, unknown> {
  return { [AQUISITION_COL.secured]: null, [AQUISITION_COL.required]: null, [AQUISITION_COL.percentage]: null };
}

export function clearAquisitionJob(row: AquisitionStatusRow): PlanJob {
  return {
    progress: "",
    errorText: ERROR_TEXT.aquisitionSave,
    plan: {
      writes: [{ op: "update", entitySet: ES.aquisitionStatuses, id: row.id, data: buildAquisitionClearPayload(), reason: "clear the acquisition status" }],
      log: [],
    },
  };
}

/**
 * Both galleries sort by the TYPE's `Order` (Y:168-203: `SortByColumns(AddColumns(…, Order,
 * 'Aquisition Status Type'.Order), "Order")`). The Web API cannot `$orderby` a lookup's column, so
 * the sort is client-side.
 */
export function sortByTypeOrder(rows: AquisitionStatusRow[]): AquisitionStatusRow[] {
  return [...rows].sort((a, b) => {
    const ao = a.typeOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.typeOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.typeName ?? "").localeCompare(b.typeName ?? "");
  });
}

/** One gallery: the rows whose type is that LLA kind, by the type's Order. */
export const aquisitionRowsFor = (rows: AquisitionStatusRow[], lla: LlaType): AquisitionStatusRow[] =>
  sortByTypeOrder(rows.filter((r) => r.typeKind === LLA_TYPE_VALUE[lla]));

/**
 * `OnVisible`'s acquisition seed (Y:204-277): one `Aquisition Statuses` row per type, with the
 * project, the type, blank values and the project's Owning Business Unit — In personam first, then
 * In rem, each by the type's `Order`.
 *
 * SOURCE DEFECT: the canvas guard is `If(Or(IsBlank(col), IsEmpty(col)), ForAll(allTypesOfThisKind, …))`,
 * all-or-nothing per kind, so a type added to `Aquisition Types` after a project's first visit never
 * gets a row there. This seeds the MISSING types, which is the same on a first visit and idempotent
 * afterwards. `planAquisitionSeedCanvasParity` keeps the canvas guard.
 */
export function planAquisitionSeed(
  types: AquisitionTypeRow[], existing: AquisitionStatusRow[], project: PlanningProject | null,
): WritePlan {
  if (!project?.id) return { writes: [], log: [] };
  const have = new Set(existing.map((r) => r.typeId).filter((x): x is string => Boolean(x)));
  const byOrder = (a: AquisitionTypeRow, b: AquisitionTypeRow) => (a.order ?? 0) - (b.order ?? 0);
  const missing = (["personam", "rem"] as const).flatMap((lla) =>
    types.filter((t) => t.type === LLA_TYPE_VALUE[lla] && !have.has(t.id)).sort(byOrder));
  return {
    writes: missing.map((t) => ({
      op: "create" as const,
      entitySet: ES.aquisitionStatuses,
      data: {
        [AQUISITION_LOOKUP.type + "@odata.bind"]: bind(ES.aquisitionTypes, t.id),
        [`${AQUISITION_LOOKUP.project}@odata.bind`]: bind(ES.projects, project.id),
        [AQUISITION_COL.secured]: null,
        [AQUISITION_COL.required]: null,
        [AQUISITION_COL.percentage]: null,
        ...(project.owningBusinessUnitId ? { [OBU_BIND]: `/businessunits(${project.owningBusinessUnitId})` } : {}),
      },
      reason: `create the acquisition status for ${t.statusName ?? t.id}`,
    })),
    log: [],
  };
}

/** The canvas guard: a kind with no rows gets every type of that kind; a kind with one row, none. */
export function planAquisitionSeedCanvasParity(
  types: AquisitionTypeRow[], existing: AquisitionStatusRow[], lla: LlaType,
): AquisitionTypeRow[] {
  const kind = LLA_TYPE_VALUE[lla];
  return existing.some((r) => r.typeKind === kind) ? [] : types.filter((t) => t.type === kind);
}

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
 * The pickers' `Filter(colCustomChoiceValues, vsb_fieldname = "…", Or(IsBlank(vsb_Country),
 * Or(IsBlank(projectCountry), vsb_Country = projectCountry)))` (Y:1051-1068, 1196-1213). The read
 * filters the same way on the server (`listCustomChoiceValues`); this keeps the meaning testable.
 */
export function matchesCustomChoiceScope(option: CustomChoiceOption, projectCountryId: string | null): boolean {
  if (option.countryId === null) return true;      // country-neutral: always offered
  if (projectCountryId === null) return true;      // no project country: nothing to filter
  return option.countryId === projectCountryId;
}

/** `Sort(…, vsb_order, SortOrder.Ascending)`. */
export function customChoiceOptions(all: CustomChoiceOption[], projectCountryId: string | null): CustomChoiceOption[] {
  return all
    .filter((o) => matchesCustomChoiceScope(o, projectCountryId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ══════════════════════════════════════════════════════════════════════ tabs ════ */

export type PlanningTabKey = "general" | "repowering" | "aquisition";

/** `locTabList: ["General", "Repowering", "Aquisition Status"]` (Y:108-116). */
export const PLANNING_TABS: { key: PlanningTabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "repowering", label: "Repowering" },
  { key: "aquisition", label: "Aquisition Status" },
];

export function parseTab(raw: string | null | undefined): PlanningTabKey {
  return raw === "repowering" || raw === "aquisition" ? raw : "general";
}

/* ════════════════════════════════════════════════════════════════ choice sets ════ */

/** `Choices(Cooperation)` / `Choices(Repowering)` — pinned to the generated enums by UT-PLAN-060. */
export const YES_NO_UNKNOWN: { value: number; label: string }[] = [
  { value: YNU.yes, label: "Yes" },
  { value: YNU.no, label: "No" },
  { value: YNU.unknown, label: "Unknown" },
];

/** `Choices('Planning Basis Category')` — pinned to the generated enum by UT-PLAN-060. */
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

export const charCounter = (value: string, max: number): string => `${value.length}/${max}`;

/* ═══════════════════════════════════════════════════════════════ screen copy ════ */

/** The captions `GENERAL_TAB_LABELS` / `REPOWERING_TAB_LABELS` do not carry, verbatim. */
export const FIELD_LABELS = {
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_CooperationPartner.Text` */
  cooperationPartner: "Cooperation Partner",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_CooperationDetails.Text` */
  cooperationDetails: "Cooperation Details",
  /** `lbl_HeightLimit_Title_ProjectPlanning.Text` */
  heightLimitation: "Height limitation [m]",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_SecuredAccess.Text` */
  securedAccess: "Access to old plants secured",
  /** `lbl_ProjectPlanning_DisplayProjectBodyRightContent_RepoweringDetails.Text` */
  repoweringDetails: "Repowering Details",
} as const;

/** The two acquisition galleries' header row, verbatim, in the canvas order (Types · Secured · Required · %). */
export const AQUISITION_GRID_COLUMNS = {
  /** `lbl_…_AquisitionStatus_UnderLaw_HeaderType.Text` / `…_InRem_HeaderType.Text` */
  types: "Types",
  /** `lbl_…_HeaderSecured.Text` */
  secured: "Secured",
  /** `lbl_…_HeaderRequered.Text` */
  required: "Required",
  /** `lbl_…_HeaderPercentage.Text` */
  percentage: "Aquisition Status [%]",
  /** `lbl_…_UnderLaw_HeaderAction.Text` — an empty header over the Edit icon. */
  action: "",
} as const;

/** The Aquisition Status right panel (`con_ProjectPlanning_RightPanel_AquisitionStatus_Form`). */
export const AQUISITION_PANEL = {
  /** `lbl_…_InpForm_Body_AquisitionStatusType.Text` */
  llaType: "LLA Type",
  /** `lbl_…_InpForm_Body_Secured.Text` */
  secured: "Secured",
  /** `lbl_…_InpForm_Body_Requered.Text` */
  required: "Required",
  /** `lbl_…_InpForm_Body_Percentage.Text` — verbatim, trailing space included. */
  percentage: "Aquisition Status [%] ",
  /** `pcf_btn_…_InpForm_Buttons_Cancel_1.Text` / `.Tooltip` */
  clearAndSave: "Clear & Save",
  clearAndSaveTooltip: "Set secured and required field to blank.",
  /** `pcf_btn_…_InpForm_Buttons_Save_UnderLaw.Text` / `…_Save_InRem.Text` */
  save: "Save",
  /** `pcf_btn_…_InpForm_Buttons_Cancel.Text` */
  cancel: "Cancel",
} as const;

/**
 * `lbl_ProjectPlanning_RightPanel_AquisitionStatus_FormHeader_Title.Text` (Y:3095) —
 * `$"Aquisition Status - [{locAquisitionStatusEntity.'Aquisition Status Type'.Type}]"`.
 */
export const aquisitionPanelTitle = (typeLabel: string): string => `Aquisition Status - [${typeLabel}]`;

/** The permit panel's buttons and the delete confirmation, verbatim. */
export const PERMIT_DIALOG = {
  /** `pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save.Tooltip` */
  saveTooltip: "Save Permit",
  /** `pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Cancel.Text` */
  cancel: "Cancel",
  /** `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit.Title` */
  deleteTitle: "Delete permit?",
  /** `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit.ConfirmButtonText` */
  deleteConfirm: "Delete",
} as const;

/**
 * `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit.Description` (Y:4413) —
 * `"Are you sure that you want to delete permit " & locSelectedPermit.Name & "?"`.
 */
export const deletePermitDescription = (name: string | null): string =>
  `Are you sure that you want to delete permit ${name ?? ""}?`;

/** The screen's footer, verbatim. */
export const SCREEN_MSG = {
  /** `pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave.Text` / `.Tooltip` */
  save: "Save",
  saveTooltip: "Save Planning data",
  /** `pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsReset.Text` / `.Tooltip` */
  cancel: "Cancel",
  cancelTooltip: "Reset values form fields back.",
  /** `cmp_PopUp_Leave_Planning_Confirmation.Title` / `.ConfirmButtonText` — verbatim. */
  leaveTitle: "Unsaved data",
  leaveConfirm: "Yes",
} as const;

/**
 * `cmp_PopUp_Leave_Planning_Confirmation` (Y:4440-4482) — the texts the shared
 * `UnsavedChangesGuard` shows (D35, PO X1). `CancelButtonText: ="Cancel"` — verbatim.
 */
export const LEAVE_DIALOG = {
  title: SCREEN_MSG.leaveTitle,
  description: LEAVE_CONFIRMATION,
  confirm: SCREEN_MSG.leaveConfirm,
  cancel: "Cancel",
} as const;

/**
 * The leave-guard condition — `If(CountRows(Filter(colPlanningFormValidation, Dirty = true)) > 0, …)`
 * on the header logo and the left navigation (Y:413-420): the planning row differs from what was
 * loaded (`isDirty`; permits are saved from their own panel, so an untouched page is clean).
 */
export const shouldConfirmLeave = (form: PlanningForm, baseline: PlanningForm): boolean =>
  isDirty(form, baseline);

/** The gallery's percentage cell — hidden (`""`) while `Required` is blank (`Visible`, Y:2164). */
export const percentCell = (row: AquisitionStatusRow): string =>
  row.required === null ? "" : String(storedPercentToDisplay(row.percentage, row.required));

/** `If(ThisItem.Secured >= 0, ThisItem.Secured, "")` and the same for Required. */
export const countCell = (v: number | null): string => (v !== null && v >= 0 ? String(v) : "");
