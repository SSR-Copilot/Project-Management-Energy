/**
 * Project Planning Screen — unit tests.
 *
 * IDs are the spec's (UT-PLAN-nnn). Pure functions only; the "one $batch" and "$filter
 * contains" cases assert the plan and the filter string the hooks build, which is where
 * the behaviour lives.
 *
 * The two documented defects (the height-limit `And`/`Or` and the acquisition Secured
 * range message) each carry both a fixed-behaviour case and a canvas-parity case.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PROCESS } from "@/data/entities";
import { formatDate } from "@/domain/dates";
import {
  PLANNING_COL, PLANNING_LOOKUP, PERMIT_COL, PERMIT_LOOKUP, AQUISITION_COL,
  AQUISITION_LOOKUP, CUSTOM_CHOICE_FIELD, MAX_LENGTH, MSG, MSG_CANVAS,
  PERCENT_NOT_APPLICABLE, PAGE_LOCK_TITLE, LEAVE_CONFIRMATION, PLANNING_TABS, parseTab,
  pageLock, isPageLocked, pageLockCanvasHeightParity, isDraft,
  showCooperationPartner, showCooperationDetails, cooperationDetailsEditable,
  showSecuredAccess, showRepoweringDetails, showHeightLimit,
  applyCooperationChange, applyRepoweringChange, applyHeightToggle,
  validateHeightLimit, validateHeightLimitCanvasParity, validatePlanning,
  invalidPlanningFields, planningMessages, formatOneToTwoPlaces,
  toPlanningForm, emptyPlanningForm, dirtyFields, isDirty, isDirtyCanvasParity,
  canEditPlanning, canEditLegalPlanningBasis, canSwitchTabs,
  canSave, saveDisabledReason, canReset,
  buildPlanningPayload, buildPlanningSeedPayload, numericOrNull,
  togglePermitSelection, canSavePermit, permitCommandState, buildPermitPayload,
  emptyPermitDraft, permitDraftFrom,
  securedPercent, storedPercentToDisplay, validateAquisition, canSaveAquisition,
  aquisitionPanelErrors, buildAquisitionPayload, buildAquisitionClearPayload,
  planAquisitionSeed, planAquisitionSeedCanvasParity, sortByTypeOrder,
  matchesCustomChoiceScope, customChoiceOptions,
  permitDateCell, permitPanelTitle, PERMIT_GRID_COLUMNS, PERMIT_COMMAND_LABELS,
  PERMIT_PANEL_LABELS, GENERAL_TAB_LABELS, REPOWERING_TAB_LABELS,
  type PlanningForm, type PlanningProject, type PlanningRecord, type PermitRow,
  type AquisitionStatusRow, type AquisitionTypeRow, type CustomChoiceOption,
} from "./rules";
import {
  toPlanningProject, toPlanningRecord, customChoiceFilter, AQUISITION_ORDER_BY,
  savePlanning,
} from "./hooks";

const YNU = CHOICE_PROCESS.yesNoUnknown;

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
  createdOn: "2025-01-01T09:00:00Z",
  modifiedOn: "2025-06-01T09:00:00Z",
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
  owningBusinessUnitId: "bu-de",
  ...o,
});

const form = (o: Partial<PlanningForm> = {}): PlanningForm => ({
  ...emptyPlanningForm(), ...o,
});

const permit = (o: Partial<PermitRow> = {}): PermitRow => ({
  id: "pm-1", name: "BImSchG", submissionDate: "2026-04-01",
  submissionDateType: CHOICE_PROCESS.permitDateType.plan,
  approvalDate: "2027-02-01", approvalDateType: CHOICE_PROCESS.permitDateType.plan,
  canEdit: true, canDelete: true, ...o,
});

const aqType = (o: Partial<AquisitionTypeRow> = {}): AquisitionTypeRow => ({
  id: "at-1", name: "Lease", type: CHOICE_PROCESS.aquisitionType.inPersonam, order: 1, ...o,
});

const aqRow = (o: Partial<AquisitionStatusRow> = {}): AquisitionStatusRow => ({
  id: "as-1", typeId: "at-1", typeName: "Lease", typeOrder: 1,
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
    // No form field travels with the self-heal — the Save owns those.
    expect(payload[PLANNING_COL.cooperation]).toBeUndefined();
  });

  it("UT-PLAN-002 an existing row binds the form and issues no create", () => {
    const bound = toPlanningForm(record());
    expect(bound.cooperation).toBe(YNU.yes);
    expect(bound.cooperationPartner).toBe("Stadtwerke Nord");
    expect(bound.legalPlanningId).toBe("ccv-1");
    expect(bound.isHeightLimitation).toBe(true);
    expect(bound.heightLimitation).toBe("200");
    // A null record yields the pristine form — the shape the create path starts from.
    expect(toPlanningForm(null)).toEqual(emptyPlanningForm());
  });

  it("the Dataverse row maps to the narrowed record", () => {
    const mapped = toPlanningRecord({
      vsb_projectplanningid: "pp-9",
      vsb_cooperation: YNU.unknown,
      vsb_cooperationpartner: "",
      vsb_cooperationdetails: null,
      _vsb_legalplanninglookup_value: "ccv-3",
      vsb_planningbasiscategory: null,
      _vsb_permitprocedurelookup_value: null,
      vsb_planningbasisdetails: "text",
      vsb_repowering: YNU.no,
      vsb_securedaccess: null,
      vsb_repoweringdetails: null,
      vsb_isheightlimitationforwtg: false,
      vsb_heightlimitationm: null,
      _owningbusinessunit_value: "bu-fr",
    });
    expect(mapped!.id).toBe("pp-9");
    expect(mapped!.cooperationPartner).toBeNull();  // "" is blank in Power Fx
    expect(mapped!.isHeightLimitation).toBe(false);
    expect(toPlanningRecord(undefined)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════ the seed and sort */

describe("UT-PLAN the acquisition seed", () => {
  const types = [
    aqType({ id: "at-1", order: 1 }),
    aqType({ id: "at-2", order: 2 }),
    aqType({ id: "at-3", order: 3 }),
    aqType({ id: "at-4", order: 4 }),
    aqType({ id: "at-5", order: 5 }),
  ];

  it("UT-PLAN-003 the seed creates one row per missing type, in one batch", () => {
    const plan = planAquisitionSeed(types, [], {
      projectId: "p-1", owningBusinessUnitId: "bu-de",
    });
    expect(plan).toHaveLength(5);
    // One $batch: the plan is a single array handed to repo.saveMany, not five calls.
    expect(plan.every((p) => p.op === "create")).toBe(true);
    for (const p of plan) {
      expect(p.data[`${AQUISITION_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
      expect(p.data[`${AQUISITION_LOOKUP.type}@odata.bind`])
        .toBe(`/vsb_aquisitiontypes(${p.typeId})`);
      expect(p.data[AQUISITION_COL.secured]).toBeNull();
      expect(p.data[AQUISITION_COL.required]).toBeNull();
      expect(p.data[AQUISITION_COL.percentage]).toBeNull();
    }
  });

  it("UT-PLAN-004 the seed is a no-op when every type already has a row", () => {
    const existing = types.map((t) => aqRow({ id: `as-${t.id}`, typeId: t.id }));
    expect(planAquisitionSeed(types, existing, {
      projectId: "p-1", owningBusinessUnitId: null,
    })).toEqual([]);
  });

  it("the seed self-heals a type added after the first visit (canvas would not)", () => {
    const existing = [aqRow({ typeId: "at-1" }), aqRow({ id: "as-2", typeId: "at-2" })];
    const plan = planAquisitionSeed(types, existing, {
      projectId: "p-1", owningBusinessUnitId: null,
    });
    expect(plan.map((p) => p.typeId)).toEqual(["at-3", "at-4", "at-5"]);
    // The canvas guard was `If(Or(IsBlank(col), IsEmpty(col)), ForAll(allTypes, …))`, so
    // one existing row meant nothing was ever seeded again.
    expect(planAquisitionSeedCanvasParity(types, existing)).toEqual([]);
    expect(planAquisitionSeedCanvasParity(types, [])).toHaveLength(5);
  });

  it("UT-PLAN-005 both galleries order by the TYPE's Order, not the row's", () => {
    const rows = [
      aqRow({ id: "a", typeOrder: 3, typeName: "Third" }),
      aqRow({ id: "b", typeOrder: 1, typeName: "First" }),
      aqRow({ id: "c", typeOrder: 2, typeName: "Second" }),
    ];
    expect(sortByTypeOrder(rows).map((r) => r.typeOrder)).toEqual([1, 2, 3]);
    // The $orderby names the type's order column, not the row's.
    expect(AQUISITION_ORDER_BY).toBe("vsb_AquisitionStatusType/vsb_order asc");
  });
});

/* ═══════════════════════════════════════════════════════ conditional fields */

describe("UT-PLAN cooperation and repowering", () => {
  it("UT-PLAN-006 Cooperation = Yes shows Partner and Details", () => {
    expect(showCooperationPartner(YNU.yes)).toBe(true);
    expect(showCooperationDetails(YNU.yes)).toBe(true);
    // …but Details are read-only for Yes.
    expect(cooperationDetailsEditable(YNU.yes)).toBe(false);
  });

  it("UT-PLAN-007 Cooperation = Unknown hides Partner and makes Details editable", () => {
    expect(showCooperationPartner(YNU.unknown)).toBe(false);
    expect(showCooperationDetails(YNU.unknown)).toBe(true);
    expect(cooperationDetailsEditable(YNU.unknown)).toBe(true);
  });

  it("UT-PLAN-008 Cooperation = No hides both", () => {
    expect(showCooperationPartner(YNU.no)).toBe(false);
    expect(showCooperationDetails(YNU.no)).toBe(false);
    const cleared = applyCooperationChange(
      form({ cooperation: YNU.yes, cooperationPartner: "X", cooperationDetails: "Y" }),
      YNU.no,
    );
    expect(cleared.cooperationPartner).toBe("");
    expect(cleared.cooperationDetails).toBe("");
  });

  it("UT-PLAN-009 Repowering = No clears both dependent fields", () => {
    const filled = form({
      repowering: YNU.yes, securedAccess: "12 of 14", repoweringDetails: "Old machines",
    });
    const next = applyRepoweringChange(filled, YNU.no);
    expect(next.securedAccess).toBe("");
    expect(next.repoweringDetails).toBe("");
    // Rule 7 mirrors it server-side: both columns go out as null.
    const payload = buildPlanningPayload(next, project(), { isCreate: false });
    expect(payload[PLANNING_COL.securedAccess]).toBeNull();
    expect(payload[PLANNING_COL.repoweringDetails]).toBeNull();
  });

  it("UT-PLAN-010 Repowering = Unknown clears only Secured Access", () => {
    const filled = form({
      repowering: YNU.yes, securedAccess: "12 of 14", repoweringDetails: "Old machines",
    });
    const next = applyRepoweringChange(filled, YNU.unknown);
    expect(next.securedAccess).toBe("");
    expect(next.repoweringDetails).toBe("Old machines");
    expect(showSecuredAccess(YNU.unknown)).toBe(false);
    expect(showRepoweringDetails(YNU.unknown)).toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════ the custom choices */

describe("UT-PLAN the custom-choice pickers", () => {
  const options: CustomChoiceOption[] = [
    { id: "n-1", label: "Neutral A", order: 2, countryId: null },
    { id: "de-1", label: "German", order: 1, countryId: "c-de" },
    { id: "fr-1", label: "French", order: 3, countryId: "c-fr" },
  ];

  it("UT-PLAN-011 the list filters by field name and the null-or-country clause", () => {
    const filter = customChoiceFilter(CUSTOM_CHOICE_FIELD.legalPlanningBasis, "c-de");
    expect(filter).toContain("vsb_fieldname eq 'vsb_legalplanningbasis'");
    expect(filter).toContain("_vsb_country_value eq null");
    expect(filter).toContain("_vsb_country_value eq c-de");
    const scoped = customChoiceOptions(options, "c-de");
    expect(scoped.map((o) => o.id)).toEqual(["de-1", "n-1"]);   // sorted by vsb_order
  });

  it("UT-PLAN-012 country-neutral choices are always offered", () => {
    const filter = customChoiceFilter(CUSTOM_CHOICE_FIELD.permitProcedure, "c-fr");
    expect(filter).toContain("vsb_fieldname eq 'vsb_permitprocedure'");
    expect(matchesCustomChoiceScope(options[0], "c-fr")).toBe(true);
    expect(matchesCustomChoiceScope(options[1], "c-fr")).toBe(false);
    expect(customChoiceOptions([options[0]], "c-fr").map((o) => o.id)).toEqual(["n-1"]);
  });

  it("UT-PLAN-013 Legal Planning Basis is disabled when the list is empty", () => {
    const g = { project: project(), canEdit: true };
    expect(canEditLegalPlanningBasis(g, 0)).toBe(false);
    expect(canEditLegalPlanningBasis(g, 3)).toBe(true);
    // …and still disabled when the page is locked, however many options exist.
    expect(canEditLegalPlanningBasis(
      { project: project({ netYieldP50: 0 }), canEdit: true }, 3,
    )).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════ the height limitation */

describe("UT-PLAN the height limitation", () => {
  it("UT-PLAN-014 the field is hidden when the toggle is off and saves as null", () => {
    expect(showHeightLimit(false)).toBe(false);
    const off = applyHeightToggle(form({ isHeightLimitation: true, heightLimitation: "200" }), false);
    expect(off.heightLimitation).toBe("");
    const payload = buildPlanningPayload(off, project(), { isCreate: false });
    expect(payload[PLANNING_COL.heightLimitation]).toBeNull();
    expect(payload[PLANNING_COL.isHeightLimitation]).toBe(false);
  });

  it("UT-PLAN-015 Save is blocked when the toggle is on and the field is blank", () => {
    const base = toPlanningForm(record());
    const state = {
      project: project(), canEdit: true,
      form: { ...base, isHeightLimitation: true, heightLimitation: "" },
      baseline: base,
    };
    expect(canSave(state)).toBe(false);
    expect(saveDisabledReason(state))
      .toBe("Enter the height limitation, or switch the toggle off.");
  });

  it("UT-PLAN-016 two decimals in range are valid", () => {
    expect(validateHeightLimit("1234.56")).toEqual({ valid: true });
    expect(validateHeightLimit("0")).toEqual({ valid: true });
    expect(validateHeightLimit("99999")).toEqual({ valid: true });
    expect(validateHeightLimit("")).toEqual({ valid: true });   // blank shows no error
  });

  it("UT-PLAN-017 three decimals are rejected (canvas showed nothing)", () => {
    expect(validateHeightLimit("1.234"))
      .toEqual({ valid: false, message: MSG.heightDecimals });
    // SOURCE DEFECT: `And(Not(IsBlank), Not(IsTwoDecimal), Not(InRange))` needs BOTH
    // checks to fail, and 1.234 is in range, so the canvas label stayed hidden.
    expect(validateHeightLimitCanvasParity("1.234")).toEqual({ valid: true });
  });

  it("UT-PLAN-018 out-of-range is rejected with the range message", () => {
    expect(validateHeightLimit("100000"))
      .toEqual({ valid: false, message: MSG.heightRange });
    expect(MSG.heightRange).toBe("Please select a value between 0 and 99999.");
    // The canvas is silent here too: 100000 is a valid two-decimal number, so only one
    // of the two negated checks fails.
    expect(validateHeightLimitCanvasParity("100000")).toEqual({ valid: true });
  });

  it("SOURCE DEFECT — the canvas only complains when BOTH checks fail, and then with the wrong message", () => {
    // Three decimals AND out of range: the one input the canvas label does render.
    expect(validateHeightLimit("100000.123"))
      .toEqual({ valid: false, message: MSG.heightDecimals });
    expect(validateHeightLimitCanvasParity("100000.123"))
      .toEqual({ valid: false, message: MSG.heightDecimals });
    // Its `.Text` third branch is un-negated — the range message would render for an
    // IN-range value, which is why the parity function can never return it.
    expect(validateHeightLimitCanvasParity("1.234").message).toBeUndefined();
  });

  it("rule 10 — the integer/decimal display switch", () => {
    expect(formatOneToTwoPlaces(200)).toBe("200");
    expect(formatOneToTwoPlaces(200.5)).toBe("200.5");
    expect(formatOneToTwoPlaces(200.567)).toBe("200.56");
    expect(formatOneToTwoPlaces(null)).toBe("");
  });

  it("the validation table reports only the height row", () => {
    const v = validatePlanning(form({ isHeightLimitation: true, heightLimitation: "1.234" }));
    expect(invalidPlanningFields(v)).toEqual(["heightLimitation"]);
    expect(planningMessages(v)).toEqual([MSG.heightDecimals]);
    // With the toggle off the row is valid whatever the text says.
    expect(validatePlanning(
      form({ isHeightLimitation: false, heightLimitation: "1.234" }),
    ).heightLimitation.valid).toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════ acquisition status */

describe("UT-PLAN the acquisition panel", () => {
  it("UT-PLAN-019 the percentage derives from Secured / Required", () => {
    expect(securedPercent(25, 100)).toBe(25);
    expect(securedPercent("25", "100")).toBe(25);
    // RoundDown, not Round: 2/3 is 66 %, never 67 %.
    expect(securedPercent(2, 3)).toBe(66);
  });

  it("UT-PLAN-020 the percentage is N/A when Required is 0, with no division error", () => {
    expect(securedPercent(5, 0)).toBe(PERCENT_NOT_APPLICABLE);
    expect(securedPercent(null, null)).toBe(PERCENT_NOT_APPLICABLE);
    expect(securedPercent("", "")).toBe(PERCENT_NOT_APPLICABLE);
    expect(storedPercentToDisplay(0.25, 0)).toBe(PERCENT_NOT_APPLICABLE);
    expect(storedPercentToDisplay(0.25, 100)).toBe(25);
  });

  it("UT-PLAN-021 Secured greater than Required is rejected on both fields", () => {
    const v = validateAquisition({ secured: "50", required: "20" });
    expect(v.secured.message).toBe('"Secured" has to be lower than or equal to "Required".');
    expect(v.required.message).toBe('"Required" has to be higher than or equal to "Secured".');
    expect(canSaveAquisition({ secured: "50", required: "20" })).toBe(false);
    expect(canSaveAquisition({ secured: "20", required: "20" })).toBe(true);
  });

  it("UT-PLAN-022 values above 999 are rejected on either field", () => {
    expect(validateAquisition({ secured: "5", required: "1000" }).required.message)
      .toBe(MSG.requiredRange);
    expect(validateAquisition({ secured: "1000", required: "1000" }).secured.message)
      .toBe(MSG.securedRange);
  });

  it("SOURCE DEFECT — the Secured range message contradicted its own 0–999 check", () => {
    // The canvas condition is `>= 0 && <= 999`; its message said "between 0 and 100".
    expect(MSG_CANVAS.securedRange100).toBe("Secured must be between 0 and 100.");
    expect(MSG.securedRange).toBe("Secured must be between 0 and 999.");
    // Resolved in favour of the condition: 150 of 200 secured LLAs is legitimate.
    expect(canSaveAquisition({ secured: "150", required: "200" })).toBe(true);
  });

  it("non-numeric input reports the two 'must be number' messages", () => {
    const v = validateAquisition({ secured: "abc", required: "" });
    expect(v.secured.message).toBe("Secured must be number.");
    expect(v.required.message).toBe("Required must be number");
    expect(aquisitionPanelErrors({ secured: "abc", required: "" }))
      .toEqual([MSG.securedNumber, MSG.requiredNumber]);
  });

  it("UT-PLAN-023 the save stores the fraction, not the percentage", () => {
    const payload = buildAquisitionPayload(
      { secured: "25", required: "100" },
      { projectId: "p-1", typeId: "at-1", owningBusinessUnitId: "bu-de", isCreate: false },
    );
    expect(payload[AQUISITION_COL.percentage]).toBe(0.25);
    expect(payload[AQUISITION_COL.secured]).toBe(25);
    expect(payload[AQUISITION_COL.required]).toBe(100);
    // An update does not re-bind the project or the type.
    expect(payload[`${AQUISITION_LOOKUP.project}@odata.bind`]).toBeUndefined();
  });

  it("SOURCE DEFECT — the In-rem save divided without an error guard", () => {
    // The In-rem handler was `Value(Percentage.Value) / 100` where the percentage box can
    // render the literal "N/A". Here the percentage is derived from the numbers, so both
    // LLA types take one path and a Required of 0 stores null rather than erroring.
    const payload = buildAquisitionPayload(
      { secured: "5", required: "0" },
      { projectId: "p-1", typeId: "at-1", owningBusinessUnitId: null, isCreate: false },
    );
    expect(payload[AQUISITION_COL.percentage]).toBeNull();
    expect(payload[AQUISITION_COL.required]).toBe(0);
  });

  it("UT-PLAN-024 Clear nulls all three acquisition fields", () => {
    expect(buildAquisitionClearPayload()).toEqual({
      [AQUISITION_COL.secured]: null,
      [AQUISITION_COL.required]: null,
      [AQUISITION_COL.percentage]: null,
    });
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

  it("UT-PLAN-026 create versus update", () => {
    const draft = permitDraftFrom(permit());
    const create = buildPermitPayload(draft, "pp-1", "bu-de", { isCreate: true });
    expect(create[`${PERMIT_LOOKUP.projectPlanning}@odata.bind`])
      .toBe("/vsb_projectplannings(pp-1)");
    expect(create[`${PERMIT_LOOKUP.owningBusinessUnit}@odata.bind`])
      .toBe("/businessunits(bu-de)");
    const update = buildPermitPayload(draft, "pp-1", "bu-de", { isCreate: false });
    expect(update[`${PERMIT_LOOKUP.projectPlanning}@odata.bind`]).toBeUndefined();
    expect(update[PERMIT_COL.name]).toBe("BImSchG");
  });

  it("UT-PLAN-027 a permit edit marks the form dirty (defect fixed)", () => {
    const base = toPlanningForm(record());
    expect(isDirty(base, base, /* permitsTouched */ true)).toBe(true);
    // The canvas `UpdateIf(colPlanningFormValidation, Name = "Permits", …)` was inside a
    // block comment, so the Permits row was permanently clean and the leave dialog never
    // fired after a permit-only change.
    expect(isDirtyCanvasParity(base, base)).toBe(false);
  });

  it("UT-PLAN-028 clicking the selected permit deselects it", () => {
    expect(togglePermitSelection("pm-1", "pm-1")).toBeNull();
    expect(togglePermitSelection("pm-1", "pm-2")).toBe("pm-2");
    expect(togglePermitSelection(null, "pm-1")).toBe("pm-1");
    const g = { project: project(), canEdit: true };
    expect(permitCommandState(g, null)).toEqual({
      canNew: true, canEdit: false, canDelete: false,
    });
  });

  it("UT-PLAN-029 Delete is gated by the record's own privilege", () => {
    const g = { project: project(), canEdit: true };
    expect(permitCommandState(g, permit({ canDelete: false })).canDelete).toBe(false);
    expect(permitCommandState(g, permit({ canEdit: false })).canEdit).toBe(false);
    expect(permitCommandState(g, permit()).canDelete).toBe(true);
    // The whole command bar is off when the page is locked.
    const locked = { project: project({ totalCapacity: 0 }), canEdit: true };
    expect(permitCommandState(locked, permit())).toEqual({
      canNew: false, canEdit: false, canDelete: false,
    });
  });

  it("UT-PLAN-030 GUIDE q22: the Permits grid folds the type into the date cell", () => {
    expect(permitDateCell(null, null)).toBe("—");
    expect(permitDateCell("2026-09-10", null)).toBe(formatDate("2026-09-10"));
    expect(permitDateCell("2026-09-10", CHOICE_PROCESS.permitDateType.plan))
      .toBe(`${formatDate("2026-09-10")} (Plan)`);
    expect(permitDateCell("2026-10-01", CHOICE_PROCESS.permitDateType.actual))
      .toBe(`${formatDate("2026-10-01")} (Actual)`);
    expect(PERMIT_GRID_COLUMNS).toEqual({
      permit: "Permit", submitted: "Permit Submitted", approved: "Permit Approved",
    });
  });

  it("UT-PLAN-031 GUIDE q22/q23: the permit command and panel labels are verbatim", () => {
    expect(PERMIT_COMMAND_LABELS).toEqual({
      newPermit: "New Permit", edit: "Edit", delete: "Delete",
    });
    expect(PERMIT_PANEL_LABELS).toEqual({
      name: "Name", submissionDate: "Submission Date", approvalDate: "Approval Date",
    });
    expect(permitPanelTitle(true)).toBe("New Permit");
    expect(permitPanelTitle(false)).toBe("Edit Permit");
  });
});

describe("UT-PLAN GUIDE q22/q24: the field labels", () => {
  it("UT-PLAN-032 the General tab's five field labels are verbatim", () => {
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
    const state = { project: project(), canEdit: false, form: dirtyForm, baseline: base };
    expect(canSave(state)).toBe(false);
    expect(saveDisabledReason(state))
      .toBe("You do not have permission to edit this project.");
  });

  it("UT-PLAN-036 Save and the tab strip are disabled while the project is Draft", () => {
    const p = project({ clusterStateName: "Draft" });
    expect(canSave({ project: p, canEdit: true, form: dirtyForm, baseline: base })).toBe(false);
    expect(canSwitchTabs({ project: p, canEdit: true })).toBe(false);
    expect(canEditPlanning({ project: p, canEdit: true })).toBe(false);
    expect(isDraft(p)).toBe(true);
  });

  it("UT-PLAN-037 the page lock lists every missing prerequisite", () => {
    const p = project({ projectNumber: null, netYieldP50: null });
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(p).map((e) => e.reason)).toEqual(["General", "Production"]);
    expect(PAGE_LOCK_TITLE).toContain("This page is locked");
    expect(pageLock(project())).toEqual([]);
  });

  it("SOURCE DEFECT — the banner's Height tests Project Start Date, Visible tests End Date", () => {
    expect(isPageLocked(project({ projectStartDate: null }))).toBe(false);
    expect(pageLockCanvasHeightParity(project({ projectStartDate: null }))).toBe(true);
  });

  it("UT-PLAN-038 a save failure keeps the form dirty and Cancel enabled", async () => {
    const res = await savePlanning({
      project: project(), record: record(), form: dirtyForm,
      canEdit: false, language: "en-US",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.status).toBe(403);
    // The screen does not clear the draft on failure, so both stay true.
    expect(isDirty(dirtyForm, base)).toBe(true);
    expect(canReset({ allowReset: true, form: dirtyForm, baseline: base })).toBe(true);
  });

  it("UT-PLAN-034 leaving with unsaved data prompts with the canvas text", () => {
    expect(LEAVE_CONFIRMATION)
      .toBe("You have unsaved data. Do you really want to leave current form without saving?");
    expect(isDirty(dirtyForm, base)).toBe(true);
    expect(isDirty(base, base)).toBe(false);
    expect(dirtyFields(dirtyForm, base)).toEqual(["planningBasisDetails"]);
  });

  it("Save is enabled for a dirty, valid, unlocked, permitted form", () => {
    const state = { project: project(), canEdit: true, form: dirtyForm, baseline: base };
    expect(canSave(state)).toBe(true);
    expect(saveDisabledReason(state)).toBeUndefined();
    expect(canReset({ allowReset: false, form: dirtyForm, baseline: base })).toBe(false);
  });

  it("the project maps its lock prerequisites, country and business unit", () => {
    const mapped = toPlanningProject({
      vsb_projectid: "p-9", vsb_name: "Solarpark Süd", vsb_internalprojectid: "DE-3001",
      vsb_technology: "PV", vsb_totalcapacity: 20, vsb_plantwtgcapacity: null,
      vsb_plantwtgcost: null, vsb_projectstartdate: "2026-01-01",
      vsb_netyieldp50: 21000, vsb_finalinvestmentdecision: null, vsb_enddate: "2056-01-01",
      _vsb_country_value: "c-de", _vsb_clusterstate_value: "cs-3",
      "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue": "Cluster 3",
      _owningbusinessunit_value: "bu-de", statecode: 0,
      modifiedon: "2026-01-01T00:00:00Z",
    });
    expect(mapped!.countryId).toBe("c-de");
    expect(mapped!.projectName).toBe("Solarpark Süd");
    expect(isPageLocked(mapped)).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════ the payload */

describe("UT-PLAN the planning payload", () => {
  it("the create binds Project and the business unit; the update does not", () => {
    const f = toPlanningForm(record());
    const create = buildPlanningPayload(f, project(), { isCreate: true });
    expect(create[`${PLANNING_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
    const update = buildPlanningPayload(f, project(), { isCreate: false });
    expect(update[`${PLANNING_LOOKUP.project}@odata.bind`]).toBeUndefined();
  });

  it("the two custom-choice lookups travel as @odata.bind, and clear as null", () => {
    const withIds = buildPlanningPayload(
      toPlanningForm(record()), project(), { isCreate: false },
    );
    expect(withIds[`${PLANNING_LOOKUP.legalPlanning}@odata.bind`])
      .toBe("/vsb_customchoicevalues(ccv-1)");
    expect(withIds[`${PLANNING_LOOKUP.permitProcedure}@odata.bind`])
      .toBe("/vsb_customchoicevalues(ccv-9)");
    const cleared = buildPlanningPayload(
      toPlanningForm(record({ legalPlanningId: null, permitProcedureId: null })),
      project(), { isCreate: false },
    );
    expect(cleared[`${PLANNING_LOOKUP.legalPlanning}@odata.bind`]).toBeNull();
  });

  it("text columns respect their MaxLength and blanks become null", () => {
    const payload = buildPlanningPayload(
      form({ repoweringDetails: "x".repeat(400), cooperationPartner: "" }),
      project(), { isCreate: false },
    );
    expect(String(payload[PLANNING_COL.repoweringDetails]))
      .toHaveLength(MAX_LENGTH.repoweringDetails);
    expect(MAX_LENGTH.repoweringDetails).toBe(300);
    expect(MAX_LENGTH.cooperationPartner).toBe(55);
    expect(payload[PLANNING_COL.cooperationPartner]).toBeNull();
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
    expect(parseTab("aquisition")).toBe("aquisition");
    expect(parseTab(null)).toBe("general");
    expect(parseTab("nope")).toBe("general");
  });
});
