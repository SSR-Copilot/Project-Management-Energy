/**
 * Project Planning Screen — unit tests (D31).
 *
 * IDs are the spec's (UT-PLAN-nnn), kept where the case survives; 042–066 are new with D31. Every
 * SOURCE DEFECT carries a fixed-behaviour case and a canvas-parity case.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import {
  Vsb_projectplanningsvsb_cooperation, Vsb_projectplanningsvsb_planningbasiscategory, Vsb_projectplanningsvsb_repowering,
} from "@/generated/models/Vsb_projectplanningsModel";
import { Vsb_permitsvsb_approvaldatetype, Vsb_permitsvsb_submissiondatetype } from "@/generated/models/Vsb_permitsModel";
import { Vsb_aquisitiontypesvsb_type } from "@/generated/models/Vsb_aquisitiontypesModel";
import {
  PLANNING_COL, PLANNING_LOOKUP, PERMIT_COL, PERMIT_LOOKUP, AQUISITION_COL, AQUISITION_LOOKUP, MAX_LENGTH, MSG,
  MSG_CANVAS, NOTIFY, ERROR_TEXT, REFUSAL, PLANNING_BASIS_CATEGORIES, PERMIT_DATE_TYPES, YES_NO_UNKNOWN, LLA_TYPE_VALUE,
  AQUISITION_GRID_COLUMNS,
  percentCell, countCell, aquisitionPanelTitle, deletePermitDescription,
  PERCENT_NOT_APPLICABLE, PAGE_LOCK_TITLE, LEAVE_CONFIRMATION, PLANNING_TABS, parseTab,
  pageLock, isPageLocked, pageLockCanvasHeightParity, isDraft,
  showCooperationPartner, showCooperationDetails, cooperationDetailsEditable,
  showSecuredAccess, showRepoweringDetails, showHeightLimit,
  applyCooperationChange, applyRepoweringChange, applyHeightToggle,
  validateHeightLimit, validateHeightLimitCanvasParity, validatePlanning,
  invalidPlanningFields, planningMessages, formatOneToTwoPlaces, formatOneToTwoPlacesCanvasParity,
  toPlanningForm, emptyPlanningForm, dirtyFields, isDirty, isDirtyCanvasParity,
  canEditPlanning, canEditLegalPlanningBasis, canSwitchTabs,
  canSave, canSaveCanvasParity, canReset, canResetCanvasParity, resetPlanningForm, resetPlanningFormCanvasParity,
  buildPlanningPayload, buildPlanningSeedPayload, planEnsurePlanning, planSavePlanning, savePlanningJob, numericOrNull,
  togglePermitSelection, canSavePermit, permitCommandState, buildPermitPayload, planSavePermit, savePermitJob,
  planDeletePermit, deletePermitJob,
  emptyPermitDraft, permitDraftFrom,
  securedPercent, securedPercentCanvasParity, storedPercentToDisplay, validateAquisition, canSaveAquisition,
  aquisitionFraction, aquisitionFractionCanvasParity,
  buildAquisitionPayload, planSaveAquisition, saveAquisitionJob, buildAquisitionClearPayload, clearAquisitionJob,
  planAquisitionSeed, planAquisitionSeedCanvasParity, sortByTypeOrder, aquisitionRowsFor,
  matchesCustomChoiceScope, customChoiceOptions,
  permitDateCell, permitDateCellCanvasParity, permitDateIsActual, permitDateTag, permitDateValue,
  permitInputDate, permitPanelTitle, PERMIT_GRID_COLUMNS, PERMIT_COMMAND_LABELS,
  PERMIT_PANEL_LABELS, GENERAL_TAB_LABELS, REPOWERING_TAB_LABELS,
  type PlanningForm, type PlanningProject, type PlanningRecord, type PermitRow,
  type AquisitionStatusRow, type AquisitionTypeRow, type CustomChoiceOption,
} from "./rules";
import { LEAVE_DIALOG as PLAN_LEAVE_DIALOG, shouldConfirmLeave as planShouldConfirmLeave } from "./rules";

const YNU = CHOICE_PROCESS.yesNoUnknown;
const PERSONAM = CHOICE_PROCESS.aquisitionType.inPersonam;
const REM = CHOICE_PROCESS.aquisitionType.inRem;

/* ─────────────────────────────────────────────────────────────────── fixtures */

const project = (o: Partial<PlanningProject> = {}): PlanningProject => ({
  id: "p-1",
  projectNumber: "DE-1021",
  endDate: "2059-12-31",
  projectStartDate: "2026-01-01",
  totalCapacity: 42.5,
  netYieldP50: 112400,
  clusterStateName: "Cluster 2",
  countryId: "c-de",
  owningBusinessUnitId: "bu-de",
  projectName: "Windpark Nord",
  ...o,
});

const record = (o: Partial<PlanningRecord> = {}): PlanningRecord => ({
  id: "pp-1",
  cooperation: YNU.yes,
  cooperationPartner: "Stadtwerke Nord",
  cooperationDetails: "Joint development agreement",
  legalPlanningId: "ccv-1",
  planningBasisCategory: CHOICE_PROCESS.planningBasisCategory.exists,
  permitProcedureId: "ccv-9",
  planningBasisDetails: "B-Plan 14",
  repowering: YNU.yes,
  securedAccess: "12 of 14 plots",
  repoweringDetails: "Old 1.5 MW machines",
  isHeightLimitation: true,
  heightLimitation: 200,
  owningBusinessUnitId: "bu-pp",
  ...o,
});

const form = (o: Partial<PlanningForm> = {}): PlanningForm => ({ ...emptyPlanningForm(), ...o });

const permit = (o: Partial<PermitRow> = {}): PermitRow => ({
  id: "pm-1", name: "BImSchG", submissionDate: "2026-04-01",
  submissionDateType: CHOICE_PROCESS.permitDateType.plan,
  approvalDate: "2027-02-01", approvalDateType: CHOICE_PROCESS.permitDateType.plan,
  canEdit: true, canDelete: true, ...o,
});

const aqType = (o: Partial<AquisitionTypeRow> = {}): AquisitionTypeRow => ({
  id: "at-1", statusName: "Lease", type: PERSONAM, order: 1, ...o,
});

const aqRow = (o: Partial<AquisitionStatusRow> = {}): AquisitionStatusRow => ({
  id: "as-1", typeId: "at-1", typeName: "Lease", typeOrder: 1, typeKind: PERSONAM,
  secured: 25, required: 100, percentage: 0.25, ...o,
});

/* ══════════════════════════════════════════════════ the planning row lifecycle */

describe("UT-PLAN the planning row", () => {
  it("UT-PLAN-001 the seed payload carries Project, Name and Owning Business Unit only", () => {
    const payload = buildPlanningSeedPayload(project());
    expect(payload).toEqual({
      [PLANNING_COL.name]: "Windpark Nord",
      [`${PLANNING_LOOKUP.project}@odata.bind`]: "/vsb_projects(p-1)",
      [`${PLANNING_LOOKUP.owningBusinessUnit}@odata.bind`]: "/businessunits(bu-de)",
    });
    expect(payload[PLANNING_COL.cooperation]).toBeUndefined();
  });

  it("UT-PLAN-002 an existing row binds the form and issues no create", () => {
    const bound = toPlanningForm(record());
    expect(bound.cooperation).toBe(YNU.yes);
    expect(bound.cooperationPartner).toBe("Stadtwerke Nord");
    expect(bound.legalPlanningId).toBe("ccv-1");
    expect(bound.isHeightLimitation).toBe(true);
    expect(bound.heightLimitation).toBe("200");
    expect(toPlanningForm(null)).toEqual(emptyPlanningForm());
    expect(planEnsurePlanning(project(), record()).writes).toEqual([]);
  });

  it("UT-PLAN-042 OnVisible creates the planning row when the project has none", () => {
    const plan = planEnsurePlanning(project(), null);
    expect(plan.writes).toEqual([{
      op: "create", entitySet: "vsb_projectplannings", data: buildPlanningSeedPayload(project()),
      reason: "create the project planning",
    }]);
    expect(planEnsurePlanning(null, null).writes).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════ the seed and sort */

describe("UT-PLAN the acquisition seed", () => {
  const types = [
    aqType({ id: "at-r1", type: REM, order: 1 }),
    aqType({ id: "at-2", order: 2 }),
    aqType({ id: "at-1", order: 1 }),
    aqType({ id: "at-r2", type: REM, order: 2 }),
  ];

  it("UT-PLAN-003 the seed creates one row per type, In personam first, each by Order", () => {
    const plan = planAquisitionSeed(types, [], project());
    expect(plan.writes.map((w) => w.data?.[`${AQUISITION_LOOKUP.type}@odata.bind`])).toEqual([
      "/vsb_aquisitiontypes(at-1)", "/vsb_aquisitiontypes(at-2)",
      "/vsb_aquisitiontypes(at-r1)", "/vsb_aquisitiontypes(at-r2)",
    ]);
    for (const w of plan.writes) {
      expect(w.op).toBe("create");
      expect(w.entitySet).toBe("vsb_aquisitionstatuses");
      expect(w.data?.[`${AQUISITION_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
      expect(w.data?.["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
      expect(w.data?.[AQUISITION_COL.secured]).toBeNull();
      expect(w.data?.[AQUISITION_COL.required]).toBeNull();
      expect(w.data?.[AQUISITION_COL.percentage]).toBeNull();
    }
  });

  it("UT-PLAN-004 the seed is a no-op when every type already has a row", () => {
    const existing = types.map((t) => aqRow({ id: `as-${t.id}`, typeId: t.id, typeKind: t.type }));
    expect(planAquisitionSeed(types, existing, project()).writes).toEqual([]);
    expect(planAquisitionSeed(types, [], null).writes).toEqual([]);
  });

  it("SOURCE DEFECT — the seed fills a type added after the first visit (canvas: all-or-nothing per kind)", () => {
    const existing = [aqRow({ typeId: "at-1" }), aqRow({ id: "as-r1", typeId: "at-r1", typeKind: REM })];
    const plan = planAquisitionSeed(types, existing, project());
    expect(plan.writes.map((w) => w.data?.[`${AQUISITION_LOOKUP.type}@odata.bind`]))
      .toEqual(["/vsb_aquisitiontypes(at-2)", "/vsb_aquisitiontypes(at-r2)"]);
    expect(planAquisitionSeedCanvasParity(types, existing, "personam")).toEqual([]);
    expect(planAquisitionSeedCanvasParity(types, existing, "rem")).toEqual([]);
    expect(planAquisitionSeedCanvasParity(types, [], "rem").map((t) => t.id)).toEqual(["at-r1", "at-r2"]);
  });

  it("UT-PLAN-005 both galleries order by the TYPE's Order, not the row's", () => {
    const rows = [
      aqRow({ id: "a", typeOrder: 3, typeName: "Third" }),
      aqRow({ id: "b", typeOrder: 1, typeName: "First" }),
      aqRow({ id: "c", typeOrder: 2, typeName: "Second" }),
      aqRow({ id: "d", typeOrder: 0, typeName: "Rem", typeKind: REM }),
    ];
    expect(sortByTypeOrder(rows).map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
    expect(aquisitionRowsFor(rows, "personam").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(aquisitionRowsFor(rows, "rem").map((r) => r.id)).toEqual(["d"]);
  });
});

/* ═══════════════════════════════════════════════════════ conditional fields */

describe("UT-PLAN cooperation and repowering", () => {
  it("UT-PLAN-006 Cooperation = Yes shows Partner and Details", () => {
    expect(showCooperationPartner(YNU.yes)).toBe(true);
    expect(showCooperationDetails(YNU.yes)).toBe(true);
    expect(cooperationDetailsEditable(YNU.yes)).toBe(false);
  });

  it("UT-PLAN-007 Cooperation = Unknown hides Partner and makes Details editable", () => {
    expect(showCooperationPartner(YNU.unknown)).toBe(false);
    expect(showCooperationDetails(YNU.unknown)).toBe(true);
    expect(cooperationDetailsEditable(YNU.unknown)).toBe(true);
  });

  it("UT-PLAN-008 Cooperation = No hides both, but keeps their values (the canvas OnChange only marks dirty)", () => {
    expect(showCooperationPartner(YNU.no)).toBe(false);
    expect(showCooperationDetails(YNU.no)).toBe(false);
    const next = applyCooperationChange(
      form({ cooperation: YNU.yes, cooperationPartner: "X", cooperationDetails: "Y" }), YNU.no,
    );
    expect(next.cooperationPartner).toBe("X");
    expect(next.cooperationDetails).toBe("Y");
    // …and the Save writes them, as the canvas `Patch` does.
    const payload = buildPlanningPayload(next, project());
    expect(payload[PLANNING_COL.cooperationPartner]).toBe("X");
  });

  it("UT-PLAN-009 Repowering = No resets both fields to the stored values; the Save blanks both", () => {
    const baseline = toPlanningForm(record());
    const typed = { ...baseline, securedAccess: "typed", repoweringDetails: "typed" };
    const next = applyRepoweringChange(typed, YNU.no, baseline);
    expect(next.securedAccess).toBe("12 of 14 plots");
    expect(next.repoweringDetails).toBe("Old 1.5 MW machines");
    const payload = buildPlanningPayload(next, project());
    expect(payload[PLANNING_COL.securedAccess]).toBeNull();
    expect(payload[PLANNING_COL.repoweringDetails]).toBeNull();
  });

  it("UT-PLAN-010 Repowering = Unknown resets only Secured Access, which the Save keeps", () => {
    const baseline = toPlanningForm(record());
    const typed = { ...baseline, securedAccess: "typed", repoweringDetails: "typed" };
    const next = applyRepoweringChange(typed, YNU.unknown, baseline);
    expect(next.securedAccess).toBe("12 of 14 plots");
    expect(next.repoweringDetails).toBe("typed");
    expect(showSecuredAccess(YNU.unknown)).toBe(false);
    expect(showRepoweringDetails(YNU.unknown)).toBe(true);
    expect(buildPlanningPayload(next, project())[PLANNING_COL.securedAccess]).toBe("12 of 14 plots");
    expect(applyRepoweringChange(typed, YNU.yes, baseline).securedAccess).toBe("typed");
  });
});

/* ═════════════════════════════════════════════════════════ the custom choices */

describe("UT-PLAN the custom-choice pickers", () => {
  const options: CustomChoiceOption[] = [
    { id: "n-1", label: "Neutral A", order: 2, countryId: null },
    { id: "de-1", label: "German", order: 1, countryId: "c-de" },
    { id: "fr-1", label: "French", order: 3, countryId: "c-fr" },
  ];

  it("UT-PLAN-011 the list filters by the null-or-country clause and sorts by Order", () => {
    expect(customChoiceOptions(options, "c-de").map((o) => o.id)).toEqual(["de-1", "n-1"]);
  });

  it("UT-PLAN-012 country-neutral choices are always offered; no project country offers all", () => {
    expect(matchesCustomChoiceScope(options[0]!, "c-fr")).toBe(true);
    expect(matchesCustomChoiceScope(options[1]!, "c-fr")).toBe(false);
    expect(customChoiceOptions(options, null).map((o) => o.id)).toEqual(["de-1", "n-1", "fr-1"]);
  });

  it("UT-PLAN-013 Legal Planning Basis is disabled when the list is empty", () => {
    const g = { project: project(), canEdit: true };
    expect(canEditLegalPlanningBasis(g, 0)).toBe(false);
    expect(canEditLegalPlanningBasis(g, 3)).toBe(true);
    expect(canEditLegalPlanningBasis({ project: project({ netYieldP50: 0 }), canEdit: true }, 3)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════ the height limitation */

describe("UT-PLAN the height limitation", () => {
  it("UT-PLAN-014 unchecking resets the field to the stored value; the Save writes null", () => {
    expect(showHeightLimit(false)).toBe(false);
    const baseline = toPlanningForm(record());
    const off = applyHeightToggle({ ...baseline, heightLimitation: "150" }, false, baseline);
    expect(off.heightLimitation).toBe("200");
    const payload = buildPlanningPayload(off, project());
    expect(payload[PLANNING_COL.heightLimitation]).toBeNull();
    expect(payload[PLANNING_COL.isHeightLimitation]).toBe(false);
    expect(applyHeightToggle(off, true, baseline).heightLimitation).toBe("200");
  });

  it("UT-PLAN-015 Save is blocked when the toggle is on and the field is blank", () => {
    const base = toPlanningForm(record());
    expect(canSave({ project: project(), canEdit: true, form: { ...base, heightLimitation: "" }, baseline: base }))
      .toBe(false);
  });

  it("UT-PLAN-016 two decimals in range are valid", () => {
    expect(validateHeightLimit("1234.56")).toEqual({ valid: true });
    expect(validateHeightLimit("0")).toEqual({ valid: true });
    expect(validateHeightLimit("99999")).toEqual({ valid: true });
    expect(validateHeightLimit("")).toEqual({ valid: true });
  });

  it("UT-PLAN-017 three decimals are rejected (canvas showed nothing)", () => {
    expect(validateHeightLimit("1.234")).toEqual({ valid: false, message: MSG.heightDecimals });
    expect(validateHeightLimitCanvasParity("1.234")).toEqual({ valid: true });
  });

  it("UT-PLAN-018 out-of-range is rejected with the range message", () => {
    expect(validateHeightLimit("100000")).toEqual({ valid: false, message: MSG.heightRange });
    expect(MSG.heightRange).toBe("Please select a value between 0 and 99999.");
    expect(validateHeightLimitCanvasParity("100000")).toEqual({ valid: true });
  });

  it("SOURCE DEFECT — the canvas only complains when BOTH checks fail, and then with the wrong message", () => {
    expect(validateHeightLimit("100000.123")).toEqual({ valid: false, message: MSG.heightDecimals });
    expect(validateHeightLimitCanvasParity("100000.123")).toEqual({ valid: false, message: MSG.heightDecimals });
    expect(validateHeightLimitCanvasParity("1.234").message).toBeUndefined();
  });

  it("UT-PLAN-043 the display switch rounds like `#0.0#`", () => {
    expect(formatOneToTwoPlaces(200)).toBe("200");
    expect(formatOneToTwoPlaces(200.5)).toBe("200.5");
    expect(formatOneToTwoPlaces(200.567)).toBe("200.57");
    expect(formatOneToTwoPlaces(1.235)).toBe("1.24");
    expect(formatOneToTwoPlaces(null)).toBe("");
  });

  it("SOURCE DEFECT — `Text(0, \"#\")` showed a stored 0 as blank", () => {
    expect(formatOneToTwoPlaces(0)).toBe("0");
    expect(formatOneToTwoPlacesCanvasParity(0)).toBe("");
    expect(formatOneToTwoPlacesCanvasParity(200.567)).toBe("200.57");
  });

  it("the validation table reports only the height row", () => {
    const v = validatePlanning(form({ isHeightLimitation: true, heightLimitation: "1.234" }));
    expect(invalidPlanningFields(v)).toEqual(["heightLimitation"]);
    expect(planningMessages(v)).toEqual([MSG.heightDecimals]);
    expect(validatePlanning(form({ isHeightLimitation: false, heightLimitation: "1.234" })).heightLimitation.valid)
      .toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════ acquisition status */

describe("UT-PLAN the acquisition panel", () => {
  it("UT-PLAN-019 the percentage derives from Secured / Required, rounded down", () => {
    expect(securedPercent(25, 100)).toBe(25);
    expect(securedPercent("25", "100")).toBe(25);
    expect(securedPercent(2, 3)).toBe(66);
    // 29 / 100 × 100 is 28.999… in binary floating point; Power Fx gives 29.
    expect(securedPercent(29, 100)).toBe(29);
    expect(securedPercent(57, 100)).toBe(57);
  });

  it("UT-PLAN-020 the percentage is N/A when Required is 0, and EMPTY while a field is blank (D31 L4; canvas 0)", () => {
    expect(securedPercent(5, 0)).toBe(PERCENT_NOT_APPLICABLE);
    expect(securedPercent(null, null)).toBe("");
    expect(securedPercent("", "")).toBe("");
    expect(securedPercent("5", "")).toBe("");
    expect(securedPercent(" ", "10")).toBe("");
    expect(securedPercent("abc", "10")).toBe(PERCENT_NOT_APPLICABLE);
    // the canvas twin: blank counts as 0
    expect(securedPercentCanvasParity("", "")).toBe(PERCENT_NOT_APPLICABLE);
    expect(securedPercentCanvasParity("", "10")).toBe(0);
    expect(securedPercentCanvasParity("5", "10")).toBe(50);
  });

  it("UT-PLAN-021 Secured greater than Required is rejected on both fields", () => {
    const v = validateAquisition({ secured: "50", required: "20" });
    expect(v.secured.message).toBe('"Secured" has to be lower than or equal to "Required".');
    expect(v.required.message).toBe('"Required" has to be higher than or equal to "Secured".');
    expect(canSaveAquisition({ secured: "50", required: "20" })).toBe(false);
    expect(canSaveAquisition({ secured: "20", required: "20" })).toBe(true);
  });

  it("UT-PLAN-022 values above 999 are rejected on either field", () => {
    expect(validateAquisition({ secured: "5", required: "1000" }).required.message).toBe(MSG.requiredRange);
    expect(validateAquisition({ secured: "1000", required: "1000" }).secured.message).toBe(MSG.securedRange);
  });

  it("SOURCE DEFECT — the Secured range message contradicted its own 0–999 check", () => {
    expect(MSG_CANVAS.securedRange100).toBe("Secured must be between 0 and 100.");
    expect(MSG.securedRange).toBe("Secured must be between 0 and 999.");
    expect(canSaveAquisition({ secured: "150", required: "200" })).toBe(true);
  });

  it("non-numeric input reports the two 'must be number' messages", () => {
    const v = validateAquisition({ secured: "abc", required: "" });
    expect(v.secured.message).toBe("Secured must be number.");
    expect(v.required.message).toBe("Required must be number");
  });

  it("UT-PLAN-023 the save stores the fraction and re-writes Project, Type and Owning Business Unit", () => {
    const payload = buildAquisitionPayload({ secured: "25", required: "100" }, { project: project(), typeId: "at-1" });
    expect(payload).toEqual({
      [AQUISITION_COL.secured]: 25,
      [AQUISITION_COL.required]: 100,
      [AQUISITION_COL.percentage]: 0.25,
      [`${AQUISITION_LOOKUP.project}@odata.bind`]: "/vsb_projects(p-1)",
      [`${AQUISITION_LOOKUP.type}@odata.bind`]: "/vsb_aquisitiontypes(at-1)",
      "owningbusinessunit@odata.bind": "/businessunits(bu-de)",
    });
  });

  it("SOURCE DEFECT — the In-rem save divided without an error guard", () => {
    const zero = { secured: "0", required: "0" };
    expect(aquisitionFraction(zero)).toBe(0);
    expect(aquisitionFractionCanvasParity(zero, "personam")).toBe(0);
    expect(aquisitionFractionCanvasParity(zero, "rem")).toBe("error");
    expect(aquisitionFractionCanvasParity({ secured: "1", required: "3" }, "rem")).toBe(0.33);
  });

  it("UT-PLAN-024 Clear nulls the three acquisition fields and nothing else", () => {
    expect(buildAquisitionClearPayload()).toEqual({
      [AQUISITION_COL.secured]: null, [AQUISITION_COL.required]: null, [AQUISITION_COL.percentage]: null,
    });
    const job = clearAquisitionJob(aqRow());
    expect(job.progress).toBe("");
    expect(job.plan).toEqual({
      writes: [{ op: "update", entitySet: "vsb_aquisitionstatuses", id: "as-1", data: buildAquisitionClearPayload(), reason: "clear the acquisition status" }],
      log: [],
    });
  });

  it("UT-PLAN-044 the acquisition Save job: one update, the canvas texts", () => {
    const job = saveAquisitionJob({ secured: "1", required: "4" }, aqRow(), project());
    expect(job.progress).toBe("Saving Aquisition Status...");
    expect(job.success).toBeUndefined();
    expect(job.errorText?.("boom")).toBe(
      "Error: assosiated Shareholder Entity could not be saved. Internal error: originated on vsb_aquisitionstatuses. Message: boom",
    );
    const plan = planSaveAquisition({ secured: "1", required: "4" }, aqRow(), project());
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({ op: "update", entitySet: "vsb_aquisitionstatuses", id: "as-1" });
    expect(planSaveAquisition({ secured: "5", required: "4" }, aqRow(), project()).refusedReason).toBe(REFUSAL.invalidAquisition);
    expect(planSaveAquisition({ secured: "1", required: "4" }, aqRow(), null).refusedReason).toBe(REFUSAL.noProject);
  });
});

/* ══════════════════════════════════════════════════════════════════ permits */

describe("UT-PLAN the permits sub-grid", () => {
  it("UT-PLAN-025 Permit Save requires all five fields", () => {
    const full = permitDraftFrom(permit());
    expect(canSavePermit(full)).toBe(true);
    expect(canSavePermit({ ...full, approvalDateType: null })).toBe(false);
    expect(canSavePermit({ ...full, name: "   " })).toBe(false);
    expect(canSavePermit(emptyPermitDraft())).toBe(false);
    expect(canSavePermit({ ...full, submissionDate: null })).toBe(false);
  });

  it("UT-PLAN-026 create and update send the same columns, with the PLANNING row's business unit", () => {
    const draft = permitDraftFrom(permit());
    const data = buildPermitPayload(draft, record());
    expect(data).toEqual({
      [`${PERMIT_LOOKUP.projectPlanning}@odata.bind`]: "/vsb_projectplannings(pp-1)",
      [PERMIT_COL.name]: "BImSchG",
      [PERMIT_COL.submissionDate]: "2026-04-01",
      [PERMIT_COL.submissionDateType]: CHOICE_PROCESS.permitDateType.plan,
      [PERMIT_COL.approvalDate]: "2027-02-01",
      [PERMIT_COL.approvalDateType]: CHOICE_PROCESS.permitDateType.plan,
      [`${PERMIT_LOOKUP.owningBusinessUnit}@odata.bind`]: "/businessunits(bu-pp)",
    });
    expect(planSavePermit(draft, null, record()).writes[0]).toMatchObject({ op: "create", entitySet: "vsb_permits", data });
    expect(planSavePermit(draft, "pm-1", record()).writes[0]).toMatchObject({ op: "update", id: "pm-1", data });
    expect(planSavePermit(draft, null, null).refusedReason).toBe(REFUSAL.noPlanning);
    expect(planSavePermit(emptyPermitDraft(), null, record()).refusedReason).toBe(REFUSAL.incompletePermit);
  });

  it("UT-PLAN-027 a permit edit can mark the form dirty (defect fixed)", () => {
    const base = toPlanningForm(record());
    expect(isDirty(base, base, /* permitsTouched */ true)).toBe(true);
    expect(isDirtyCanvasParity(base, base)).toBe(false);
  });

  it("UT-PLAN-028 clicking the selected permit deselects it", () => {
    expect(togglePermitSelection("pm-1", "pm-1")).toBeNull();
    expect(togglePermitSelection("pm-1", "pm-2")).toBe("pm-2");
    expect(togglePermitSelection(null, "pm-1")).toBe("pm-1");
    expect(permitCommandState({ project: project(), canEdit: true }, null)).toEqual({
      canNew: true, canEdit: false, canDelete: false,
    });
  });

  it("UT-PLAN-029 Edit / Delete follow the record's privilege; the whole bar is off when locked", () => {
    const g = { project: project(), canEdit: true };
    expect(permitCommandState(g, permit({ canDelete: false })).canDelete).toBe(false);
    expect(permitCommandState(g, permit({ canEdit: false })).canEdit).toBe(false);
    expect(permitCommandState(g, permit()).canDelete).toBe(true);
    expect(permitCommandState({ project: project({ totalCapacity: 0 }), canEdit: true }, permit())).toEqual({
      canNew: false, canEdit: false, canDelete: false,
    });
  });

  it("UT-PLAN-030 the Permits grid shows dd/mm/yyyy (D31 L3; canvas d/mm/yyyy as the twin), blank for no date", () => {
    expect(permitDateCell(null)).toBe("");
    expect(permitDateCell("2026-09-10")).toBe("10/09/2026");
    expect(permitDateCell("2026-10-01T00:00:00Z")).toBe("01/10/2026");
    expect(permitDateCell("not a date")).toBe("");
    expect(permitDateCellCanvasParity("2026-10-01T00:00:00Z")).toBe("1/10/2026");
    expect(permitDateCellCanvasParity("2026-09-10")).toBe("10/09/2026");
    expect(permitDateCellCanvasParity(null)).toBe("");
    expect(PERMIT_GRID_COLUMNS).toEqual({ permit: "Permit", submitted: "Permit Submitted", approved: "Permit Approved" });
  });

  it("UT-PLAN-061 an Actual grid date is shown in the theme blue; Plan or no type is normal text", () => {
    expect(permitDateIsActual(CHOICE_PROCESS.permitDateType.actual)).toBe(true);
    expect(permitDateIsActual(CHOICE_PROCESS.permitDateType.plan)).toBe(false);
    expect(permitDateIsActual(null)).toBe(false);
  });

  it("UT-PLAN-062 the permit input shows LongAbbreviated (\"Mon, Oct 19, 2026\") from local date parts", () => {
    expect(permitInputDate(new Date(2026, 9, 19))).toBe("Mon, Oct 19, 2026");
    expect(permitInputDate(new Date(2027, 1, 1))).toBe("Mon, Feb 1, 2027");
    expect(permitInputDate(new Date(2026, 3, 5, 23, 59))).toBe("Sun, Apr 5, 2026");
    expect(permitInputDate(null)).toBe("");
    expect(permitInputDate(new Date(Number.NaN))).toBe("");
    // the stored date-only value becomes a LOCAL-midnight date (rule 18)
    const d = permitDateValue("2026-10-19")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 19, 0]);
    expect(permitDateValue(null)).toBeNull();
    expect(permitInputDate(permitDateValue("2026-10-19"))).toBe("Mon, Oct 19, 2026");
  });

  it("UT-PLAN-063 the permit input tag is the date type: Plan / Actual, nothing without a type", () => {
    expect(permitDateTag(CHOICE_PROCESS.permitDateType.plan)).toBe("Plan");
    expect(permitDateTag(CHOICE_PROCESS.permitDateType.actual)).toBe("Actual");
    expect(permitDateTag(null)).toBe("");
  });

  it("UT-PLAN-031 the permit command and panel labels are verbatim", () => {
    expect(PERMIT_COMMAND_LABELS).toEqual({ newPermit: "New Permit", edit: "Edit", delete: "Delete" });
    expect(PERMIT_PANEL_LABELS).toEqual({ name: "Name", submissionDate: "Submission Date", approvalDate: "Approval Date" });
    expect(permitPanelTitle(true)).toBe("New Permit");
    expect(permitPanelTitle(false)).toBe("Edit Permit");
  });

  it("UT-PLAN-045 the permit Save / Delete jobs carry the canvas Notify texts", () => {
    const save = savePermitJob(permitDraftFrom(permit()), "pm-1", record());
    expect(save.progress).toBe("");
    expect(save.success).toBe("Permit was successfully added!");
    expect(save.errorText?.("x")).toBe("Error: Permits could not be saved. Internal error: originated on vsb_permits. Message: x");
    const del = deletePermitJob("pm-1");
    expect(del.success).toBe(NOTIFY.permitDeleted);
    expect(del.errorText?.("x")).toBe("Error: Permit could not be deleted. Internal error: originated on vsb_permits. Message: x");
    expect(del.plan).toEqual(planDeletePermit("pm-1"));
    expect(planDeletePermit("pm-1").writes).toEqual([{ op: "delete", entitySet: "vsb_permits", id: "pm-1", reason: "delete the permit" }]);
  });
});

describe("UT-PLAN the field labels", () => {
  it("UT-PLAN-032 the General tab's labels are verbatim", () => {
    expect(GENERAL_TAB_LABELS).toEqual({
      cooperation: "Cooperation",
      legalPlanningBasis: "Legal Planning Basis",
      planningBasisCategory: "Planning Basis Category",
      permitProcedure: "Permit Procedure",
      planningBasisDetails: "Planning Basis Details",
      heightLimitationWtg: "Height limitation WTG",
    });
  });

  it("UT-PLAN-033 the Repowering tab's field label is verbatim", () => {
    expect(REPOWERING_TAB_LABELS).toEqual({ repowering: "Repowering" });
  });
});

/* ════════════════════════════════════════════════════ save gate and page lock */

describe("UT-PLAN Save, permissions and the page lock", () => {
  const base = toPlanningForm(record());
  const dirtyForm = { ...base, planningBasisDetails: "B-Plan 15" };

  it("UT-PLAN-035 Save is disabled without edit permission", () => {
    expect(canSave({ project: project(), canEdit: false, form: dirtyForm, baseline: base })).toBe(false);
  });

  it("UT-PLAN-036 Save and the tab strip are disabled while the project is Draft", () => {
    const p = project({ clusterStateName: "Draft" });
    expect(canSave({ project: p, canEdit: true, form: dirtyForm, baseline: base })).toBe(false);
    expect(canSwitchTabs({ project: p, canEdit: true })).toBe(false);
    expect(canEditPlanning({ project: p, canEdit: true })).toBe(false);
    expect(isDraft(p)).toBe(true);
  });

  it("UT-PLAN-037 the page lock lists every missing prerequisite with its canvas label", () => {
    const p = project({ projectNumber: null, netYieldP50: null });
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(p).map((e) => e.reason)).toEqual(["General", "Production"]);
    expect(pageLock(p)[1]!.testId).toBe("lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_25");
    expect(PAGE_LOCK_TITLE).toBe("This page is locked. To unlock it, please complete the following sections:");
    expect(pageLock(project())).toEqual([]);
    // With no project every condition is blank: all five bullets.
    expect(pageLock(null).map((e) => e.label)).toEqual([
      "• General", "• Milestones", "• Generator", "• Production", "• Change the project status from Draft",
    ]);
  });

  it("SOURCE DEFECT — the banner's Height tests Project Start Date, Visible tests End Date", () => {
    expect(isPageLocked(project({ projectStartDate: null }))).toBe(false);
    expect(pageLockCanvasHeightParity(project({ projectStartDate: null }))).toBe(true);
  });

  it("UT-PLAN-038 Cancel is enabled while the form is dirty", () => {
    expect(canReset(dirtyForm, base)).toBe(true);
    expect(canReset(base, base)).toBe(false);
  });

  it("SOURCE DEFECT — after one save the canvas Cancel stays disabled for the rest of the visit", () => {
    // `locAllowPlanningReset` is false after every successful save and is only reset by OnVisible.
    expect(canResetCanvasParity({ allowReset: false, form: dirtyForm, baseline: base })).toBe(false);
    expect(canResetCanvasParity({ allowReset: true, form: dirtyForm, baseline: base })).toBe(true);
    expect(canReset(dirtyForm, base)).toBe(true);
  });

  it("SOURCE DEFECT — the canvas Cancel left the height toggle and value unreset", () => {
    const changed = { ...dirtyForm, isHeightLimitation: false, heightLimitation: "150" };
    expect(resetPlanningForm(changed, base)).toEqual(base);
    const canvas = resetPlanningFormCanvasParity(changed, base);
    expect(canvas.isHeightLimitation).toBe(false);
    expect(canvas.heightLimitation).toBe("150");
    expect(canvas.planningBasisDetails).toBe(base.planningBasisDetails);
  });

  it("UT-PLAN-034 the leave text and the dirty diff", () => {
    expect(LEAVE_CONFIRMATION).toBe("You have unsaved data. Do you really want to leave current form without saving?");
    expect(isDirty(dirtyForm, base)).toBe(true);
    expect(isDirty(base, base)).toBe(false);
    expect(dirtyFields(dirtyForm, base)).toEqual(["planningBasisDetails"]);
  });

  it("Save is enabled for a dirty, valid, unlocked, permitted form, and not while busy", () => {
    const state = { project: project(), canEdit: true, form: dirtyForm, baseline: base };
    expect(canSave(state)).toBe(true);
    expect(canSave({ ...state, busy: true })).toBe(false);
  });

  it("DIVERGENCE — Clear & Save arms the canvas Save; here only a planning change does", () => {
    const clean = { project: project(), canEdit: true, form: base, baseline: base };
    expect(canSave(clean)).toBe(false);
    expect(canSaveCanvasParity(clean, true)).toBe(true);
    expect(canSaveCanvasParity(clean, false)).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════ the payload */

describe("UT-PLAN the planning payload", () => {
  it("UT-PLAN-046 every save binds Project, Name and the project's business unit (canvas Patch)", () => {
    const payload = buildPlanningPayload(toPlanningForm(record()), project());
    expect(payload[`${PLANNING_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
    expect(payload["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    expect(payload[PLANNING_COL.name]).toBe("Windpark Nord");
    expect(payload[PLANNING_COL.heightLimitation]).toBe(200);
  });

  it("the two custom-choice lookups travel as @odata.bind, and clear as null", () => {
    const withIds = buildPlanningPayload(toPlanningForm(record()), project());
    expect(withIds[`${PLANNING_LOOKUP.legalPlanning}@odata.bind`]).toBe("/vsb_customchoicevalues(ccv-1)");
    expect(withIds[`${PLANNING_LOOKUP.permitProcedure}@odata.bind`]).toBe("/vsb_customchoicevalues(ccv-9)");
    const cleared = buildPlanningPayload(
      toPlanningForm(record({ legalPlanningId: null, permitProcedureId: null })), project(),
    );
    expect(cleared[`${PLANNING_LOOKUP.legalPlanning}@odata.bind`]).toBeNull();
  });

  it("UT-PLAN-047 text columns respect their MaxLength (Cooperation Details 300, D15e) and blanks become null", () => {
    const payload = buildPlanningPayload(
      form({ repoweringDetails: "x".repeat(400), cooperationDetails: "y".repeat(300), cooperationPartner: "" }),
      project(),
    );
    expect(String(payload[PLANNING_COL.repoweringDetails])).toHaveLength(300);
    expect(String(payload[PLANNING_COL.cooperationDetails])).toHaveLength(300);
    expect(MAX_LENGTH).toEqual({
      cooperationPartner: 55, cooperationDetails: 300, planningBasisDetails: 55, securedAccess: 100, repoweringDetails: 300,
    });
    expect(payload[PLANNING_COL.cooperationPartner]).toBeNull();
  });

  it("UT-PLAN-048 the Save job: update the row (or create it), with the canvas texts", () => {
    const f = toPlanningForm(record());
    const job = savePlanningJob(f, project(), record());
    expect(job.progress).toBe("Project Planning will be saved, please wait...");
    expect(job.success).toBe("Project Planning data was successfully saved!");
    expect(job.errorText?.("E")).toBe(
      "Error: Project Planning could not be saved. Internal error: originated on vsb_projectplannings. Message: E",
    );
    expect(ERROR_TEXT.save("E")).toBe(job.errorText?.("E"));
    expect(planSavePlanning(f, project(), record()).writes[0]).toMatchObject({ op: "update", id: "pp-1", entitySet: "vsb_projectplannings" });
    expect(planSavePlanning(f, project(), null).writes[0]).toMatchObject({ op: "create", entitySet: "vsb_projectplannings" });
    expect(planSavePlanning(f, null, null).refusedReason).toBe(REFUSAL.noProject);
  });

  it("numericOrNull keeps 0 and rejects nonsense", () => {
    expect(numericOrNull("0")).toBe(0);
    expect(numericOrNull("")).toBeNull();
    expect(numericOrNull("   ")).toBeNull();
    expect(numericOrNull("abc")).toBeNull();
    expect(numericOrNull("1,5", "de-DE")).toBe(1.5);
  });

  it("the tab keys survive a reload", () => {
    expect(PLANNING_TABS.map((t) => t.key)).toEqual(["general", "repowering", "aquisition"]);
    expect(PLANNING_TABS.map((t) => t.label)).toEqual(["General", "Repowering", "Aquisition Status"]);
    expect(parseTab("aquisition")).toBe("aquisition");
    expect(parseTab(null)).toBe("general");
    expect(parseTab("nope")).toBe("general");
  });
});

describe("UT-PLAN the screen cells and copy", () => {
  it("UT-PLAN-039 the gallery percentage cell: hidden, N/A, or the stored fraction × 100 (not rounded)", () => {
    expect(percentCell(aqRow({ required: null, percentage: null }))).toBe("");
    expect(percentCell(aqRow({ required: 0, percentage: 0.5 }))).toBe(PERCENT_NOT_APPLICABLE);
    expect(percentCell(aqRow({ required: 4, secured: 1, percentage: 0.25 }))).toBe("25");
    expect(percentCell(aqRow({ required: 100, percentage: 0.29 }))).toBe("29");
    expect(percentCell(aqRow({ required: 3, percentage: 0.333 }))).toBe("33.3");
    // `Value(Blank()) * 100` — a blank fraction shows 0 once Required is set.
    expect(storedPercentToDisplay(null, 5)).toBe(0);
  });

  it("UT-PLAN-040 the Secured/Required cells hide negatives and blanks; the columns are in the canvas order", () => {
    expect(countCell(null)).toBe("");
    expect(countCell(-1)).toBe("");
    expect(countCell(0)).toBe("0");
    expect(countCell(12)).toBe("12");
    expect(Object.values(AQUISITION_GRID_COLUMNS)).toEqual(["Types", "Secured", "Required", "Aquisition Status [%]", ""]);
  });

  it("UT-PLAN-041 the panel title and the delete text are built as the canvas builds them", () => {
    expect(aquisitionPanelTitle("LLAs in rem")).toBe("Aquisition Status - [LLAs in rem]");
    expect(deletePermitDescription("BImSchG")).toBe("Are you sure that you want to delete permit BImSchG?");
  });

  it("UT-PLAN-049 the loading texts are verbatim", () => {
    expect(NOTIFY.loading).toBe("Loading, Please wait...");
    expect(NOTIFY.savingAquisition).toBe("Saving Aquisition Status...");
  });
});

describe("UT-PLAN option values pinned to the generated schema", () => {
  const keys = (o: Record<number, string>) => Object.keys(o).map(Number).sort();

  it("UT-PLAN-060 every hard-coded option value is in its pac-generated enum", () => {
    expect(YES_NO_UNKNOWN.map((o) => o.value).sort()).toEqual(keys(Vsb_projectplanningsvsb_cooperation));
    expect(YES_NO_UNKNOWN.map((o) => o.value).sort()).toEqual(keys(Vsb_projectplanningsvsb_repowering));
    expect(PLANNING_BASIS_CATEGORIES.map((o) => o.value).sort()).toEqual(keys(Vsb_projectplanningsvsb_planningbasiscategory));
    expect(PERMIT_DATE_TYPES.map((o) => o.value).sort()).toEqual(keys(Vsb_permitsvsb_submissiondatetype));
    expect(PERMIT_DATE_TYPES.map((o) => o.value).sort()).toEqual(keys(Vsb_permitsvsb_approvaldatetype));
    expect([LLA_TYPE_VALUE.personam, LLA_TYPE_VALUE.rem].sort()).toEqual(keys(Vsb_aquisitiontypesvsb_type));
    expect(Vsb_aquisitiontypesvsb_type[LLA_TYPE_VALUE.personam as 952850000]).toBe("LLAsinpersonam");
    expect(Vsb_projectplanningsvsb_cooperation[YNU.unknown as 952850002]).toBe("Unknown");
  });
});

describe("D35 — the shared leave guard", () => {
  it("UT-PLAN-910 asks while the planning row differs from what was loaded; the canvas texts verbatim", () => {
    const baseline = toPlanningForm(record());
    expect(planShouldConfirmLeave(baseline, baseline)).toBe(false);
    expect(planShouldConfirmLeave({ ...baseline, securedAccess: "typed" }, baseline)).toBe(true);
    expect(PLAN_LEAVE_DIALOG).toEqual({ title: "Unsaved data", description: "You have unsaved data. Do you really want to leave current form without saving?", confirm: "Yes", cancel: "Cancel" });
  });
});
