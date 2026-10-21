/**
 * Grid Operator Screen — unit tests.
 *
 * IDs are the spec's (UT-GRIDOP-nnn). Pure functions only; the two integration cases
 * (023/024) assert the payload and the create/update decision, which is where the
 * behaviour actually lives, rather than mocking the transport.
 *
 * The four numeric fields share two near-identical rules that differ only in decimals and
 * range, so those validators carry the most cases on this screen.
 */
import { describe, it, expect } from "vitest";
import { isThreeDecimal, isOneDecimal } from "@/domain/powerFxNumeric";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import {
  Vsb_gridoperatorsvsb_expansionrequired, Vsb_gridoperatorsvsb_substationconstructionrequired,
} from "@/generated/models/Vsb_gridoperatorsModel";
import {
  GRID_OPERATOR_COL, GRID_OPERATOR_LOOKUP, CHAR_MAX_LENGTH, FIELDS,
  CONNECTION_TAB_FIELDS, MSG, SAVE_SUCCESS, SAVE_ERROR_PREFIX, LEAVE_CONFIRMATION, REFUSAL,
  formatDecimal, formatDecimalCanvasParity, formatTwoPlaces, formatThreePlaces,
  validateVoltage, validateLength, validateDiameter, validateForm, invalidFields,
  validationMessages, pageLock, isPageLocked, pageLockCanvasHeightParity, isDraft,
  canEditField, canEditFieldAllGated, canEditFieldCanvasParity, canSwitchTabs, toForm, emptyForm,
  dirtyFields, dirtyFieldsCanvasParity, isDirty, shouldPromptOnLeave,
  canSave, canSaveCanvasParity, canCancel, canCancelCanvasParity,
  numericColumn, buildPayload, planSaveGridOperator, saveGridOperatorJob, saveErrorText,
  TABS, parseTab, charCounter, choiceLabel, YES_NO_UNKNOWN,
  PAGE_LOCK_TITLE, PAGE_LOCK_TESTID,
  type GridOperatorForm, type GridOperatorProject, type GridOperatorRecord,
  type GridOperatorField,
} from "./rules";
import { LEAVE_DIALOG as GRID_LEAVE_DIALOG } from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

/** A project that passes every page-lock condition. */
const project = (o: Partial<GridOperatorProject> = {}): GridOperatorProject => ({
  id: "p-1",
  projectNumber: "DE-1021",
  endDate: "2059-12-31",
  projectStartDate: "2026-01-01",
  totalCapacity: 42.5,
  netYieldP50: 112400,
  clusterStateName: "Cluster 2",
  owningBusinessUnitId: "bu-de",
  ...o,
});

/** A fully populated server row — eleven columns of real values. */
const record = (o: Partial<GridOperatorRecord> = {}): GridOperatorRecord => ({
  id: "g-1",
  operator: "Netze BW GmbH",
  voltageLevel: 110,
  expansionRequired: CHOICE_PROCESS.yesNoUnknown.yes,
  expansionDetails: "New bay at the 110 kV substation",
  substationConstructionRequired: CHOICE_PROCESS.yesNoUnknown.no,
  substationOperator: "VSB Service GmbH",
  lengthInternal: 1.2345,
  // One decimal, because `validateDiameter` allows only one — see the
  // "display format is looser than the validator" case below.
  diameterInternal: 12.5,
  lengthExternal: 8.5,
  diameterExternal: 240,
  ...o,
});

const form = (o: Partial<GridOperatorForm> = {}): GridOperatorForm => ({
  ...emptyForm(), ...o,
});

const touch = (...fields: GridOperatorField[]) => new Set(fields);

/* ══════════════════════════════════════════════════════ binding and rendering */

describe("UT-GRIDOP binding", () => {
  it("UT-GRIDOP-001 missing record renders an empty form and disables Save", () => {
    const baseline = toForm(null);
    expect(baseline).toEqual(emptyForm());
    expect(Object.values(baseline).every((v) => v === "" || v === null)).toBe(true);
    // Nothing is dirty, so nothing can be saved and no create is issued on mount.
    expect(canSave({
      project: project(), canEdit: true, form: baseline, baseline, touched: new Set(),
    })).toBe(false);
  });

  it("UT-GRIDOP-002 existing record binds all eleven fields", () => {
    const bound = toForm(record());
    expect(bound).toEqual({
      operator: "Netze BW GmbH",
      voltageLevel: "110",
      expansionRequired: CHOICE_PROCESS.yesNoUnknown.yes,
      expansionDetails: "New bay at the 110 kV substation",
      substationConstructionRequired: CHOICE_PROCESS.yesNoUnknown.no,
      substationOperator: "VSB Service GmbH",
      lengthInternal: "1.235",
      diameterInternal: "12.5",
      lengthExternal: "8.5",
      diameterExternal: "240",
    });
    // Every one of the ten form fields is accounted for.
    expect(Object.keys(bound).sort()).toEqual([...FIELDS].sort());
  });

  it("UT-GRIDOP-003 the query filters by project on the table's own lookup column", () => {
    // `Grid Operators` names its project lookup `vsb_projectid`, not `vsb_project`, so
    // the $filter column is `_vsb_projectid_value`. (The spec quotes the commoner
    // `_vsb_project_value`, which is the shape Project Checklists uses.)
    expect(GRID_OPERATOR_COL.project).toBe("_vsb_projectid_value");
    expect(GRID_OPERATOR_LOOKUP.project).toBe("vsb_ProjectId");
  });

  it("UT-GRIDOP-004 integer values render without decimals", () => {
    expect(formatTwoPlaces(110)).toBe("110");
    expect(formatThreePlaces(0)).toBe("0");
    expect(formatTwoPlaces(null)).toBe("");
    expect(formatTwoPlaces(undefined)).toBe("");
  });

  it("UT-GRIDOP-005 length keeps up to three decimals and rounds like Text(x, \"#0.0##\")", () => {
    // Power Fx `Text()` rounds; the earlier code truncated (1.234).
    expect(formatThreePlaces(1.2345)).toBe("1.235");
    expect(formatThreePlaces(8.5)).toBe("8.5");
    expect(formatDecimal(0.5, 3)).toBe("0.5");
  });

  it("UT-GRIDOP-006 diameter keeps up to two shown decimals and rounds like Text(x, \"#0.0#\")", () => {
    expect(formatTwoPlaces(12.75)).toBe("12.75");
    expect(formatTwoPlaces(12.756)).toBe("12.76");
    expect(formatTwoPlaces(240)).toBe("240");
  });

  it("UT-GRIDOP-033 SOURCE DEFECT — a stored 0 shows \"0\", not blank (Text(0, \"#\"))", () => {
    expect(formatDecimalCanvasParity(0, 2)).toBe("");
    expect(formatDecimal(0, 2)).toBe("0");
    // The canvas Save writes Value(<every field>), so the blank would overwrite the 0.
    const bound = toForm(record({ voltageLevel: 0, lengthExternal: 0 }));
    expect(bound.voltageLevel).toBe("0");
    const payload = buildPayload({ ...bound, operator: "Changed" }, project());
    expect(payload[GRID_OPERATOR_COL.voltageLevel]).toBe(0);
    expect(payload[GRID_OPERATOR_COL.lengthExternal]).toBe(0);
  });

  it("SOURCE DEFECT — the diameter DISPLAY format is looser than its VALIDATOR", () => {
    // Rule 5 formats the diameters with `#0.0#` (up to two fraction digits) while rule 8
    // validates them with `IsOneDecimal`. A stored 12.75 therefore renders exactly as the
    // canvas rendered it and then fails its own validation as soon as the row is checked,
    // which blocks Save on a value the app itself wrote. Reported, not silently widened:
    // the fix is a data decision (is the column one decimal or two?), not a code one.
    expect(formatTwoPlaces(12.75)).toBe("12.75");
    expect(validateDiameter("12.75"))
      .toEqual({ valid: false, message: MSG.oneDecimal });
  });
});

/* ═════════════════════════════════════════════════════════════════ validation */

describe("UT-GRIDOP the numeric validators", () => {
  it("UT-GRIDOP-007 voltage rejects non-numeric", () => {
    expect(validateVoltage("abc")).toEqual({ valid: false, message: MSG.numeric });
    expect(MSG.numeric).toBe("Value must be numeric.");
  });

  it("UT-GRIDOP-008 voltage rejects the comma decimal separator", () => {
    // The canvas comma test is deliberately locale-independent: dot should be used.
    expect(validateVoltage("1,5")).toEqual({ valid: false, message: MSG.numeric });
    expect(validateVoltage("1.5")).toEqual({ valid: true });
  });

  it("UT-GRIDOP-009 blank voltage shows no message but is not valid", () => {
    expect(validateVoltage("")).toEqual({ valid: false });
    expect(validateVoltage("").message).toBeUndefined();
  });

  it("UT-GRIDOP-010 length rejects four decimals", () => {
    expect(validateLength("1.2345"))
      .toEqual({ valid: false, message: MSG.threeDecimals });
    expect(MSG.threeDecimals).toBe("Numeric value with maximum of three decimals");
  });

  it("UT-GRIDOP-011 length rejects out-of-range", () => {
    expect(validateLength("100")).toEqual({ valid: false, message: MSG.lengthRange });
    expect(MSG.lengthRange).toBe("Please select a value between 0 and 99.");
  });

  it("UT-GRIDOP-012 length accepts boundary values", () => {
    expect(validateLength("0")).toEqual({ valid: true });
    expect(validateLength("99")).toEqual({ valid: true });
    expect(validateLength("98.999")).toEqual({ valid: true });
  });

  it("UT-GRIDOP-013 diameter rejects two decimals", () => {
    expect(validateDiameter("1.25")).toEqual({ valid: false, message: MSG.oneDecimal });
    expect(MSG.oneDecimal).toBe("Numeric value with maximum of one decimals");
    expect(validateDiameter("1.2")).toEqual({ valid: true });
  });

  it("UT-GRIDOP-014 diameter rejects out-of-range", () => {
    expect(validateDiameter("1000")).toEqual({ valid: false, message: MSG.diameterRange });
    expect(validateDiameter("999")).toEqual({ valid: true });
    expect(MSG.diameterRange).toBe("Please select a value between 0 and 999.");
  });

  it("UT-GRIDOP-015 the decimal validators are locale-aware", () => {
    // fn_Numeric branches on Lower(First(Split(Language(),"-")).Value).
    expect(isThreeDecimal("1,234", "de-DE")).toBe(true);
    expect(isThreeDecimal("1,234", "en-US")).toBe(false);
    expect(isOneDecimal("1,2", "de-DE")).toBe(true);
    expect(validateLength("1,234", "de-DE")).toEqual({ valid: true });
    expect(validateLength("1,234", "en-US"))
      .toEqual({ valid: false, message: MSG.threeDecimals });
  });

  it("validateForm leaves the five free-text and choice rows unconditionally valid", () => {
    const v = validateForm(form({ operator: "", expansionDetails: "" }), touch("operator"));
    expect(v.operator.valid).toBe(true);
    expect(v.expansionDetails.valid).toBe(true);
    expect(v.expansionRequired.valid).toBe(true);
    expect(v.substationOperator.valid).toBe(true);
    expect(v.substationConstructionRequired.valid).toBe(true);
  });

  it("validateForm keeps an untouched blank numeric field valid, a cleared one invalid", () => {
    // OnVisible seeds every row Valid: true; only OnChange can make a blank row invalid.
    expect(validateForm(form()).voltageLevel.valid).toBe(true);
    expect(validateForm(form(), touch("voltageLevel")).voltageLevel.valid).toBe(false);
  });

  it("invalidFields and validationMessages report in the source's field order", () => {
    const v = validateForm(
      form({ voltageLevel: "1,5", lengthInternal: "100", diameterExternal: "1.25" }),
      touch("voltageLevel", "lengthInternal", "diameterExternal"),
    );
    expect(invalidFields(v)).toEqual(["voltageLevel", "lengthInternal", "diameterExternal"]);
    expect(validationMessages(v)).toEqual([
      MSG.numeric, MSG.lengthRange, MSG.oneDecimal,
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════ the page lock */

describe("UT-GRIDOP the page lock", () => {
  it("UT-GRIDOP-021 lock lists Production when Net Yield p50 is 0", () => {
    const p = project({ netYieldP50: 0 });
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(p).map((e) => e.reason)).toEqual(["Production"]);
    expect(canSave({
      project: p, canEdit: true,
      form: form({ operator: "x" }), baseline: emptyForm(), touched: touch("operator"),
    })).toBe(false);
  });

  it("an unlocked project produces no entries", () => {
    expect(pageLock(project())).toEqual([]);
    expect(isPageLocked(project())).toBe(false);
    expect(PAGE_LOCK_TITLE).toContain("This page is locked");
  });

  it("every prerequisite is reported, in order", () => {
    const p = project({
      projectNumber: null, endDate: null, totalCapacity: 0, netYieldP50: null,
      clusterStateName: "Draft",
    });
    expect(pageLock(p).map((e) => e.reason))
      .toEqual(["General", "Milestones", "Generator", "Production", "Draft"]);
  });

  it("SOURCE DEFECT — Visible tests End Date, the banner Height tests Project Start Date", () => {
    // Resolved in favour of End Date; the canvas height condition stays reachable.
    const acquired = project({ projectStartDate: null });
    expect(isPageLocked(acquired)).toBe(false);
    expect(pageLockCanvasHeightParity(acquired)).toBe(true);

    const noEnd = project({ endDate: null });
    expect(isPageLocked(noEnd)).toBe(true);
    expect(pageLockCanvasHeightParity(noEnd)).toBe(false);
  });

  it("a null project is treated as locked", () => {
    expect(isPageLocked(null)).toBe(true);
    expect(isDraft(null)).toBe(true);
  });

  it("UT-GRIDOP-034 with no project all five bullets show, each with its canvas label name", () => {
    expect(pageLock(null).map((e) => e.reason))
      .toEqual(["General", "Milestones", "Generator", "Production", "Draft"]);
    expect(pageLock(null).map((e) => e.testId)).toEqual([28, 29, 30, 31, 32].map(
      (n) => `lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_${n}`,
    ));
    expect(pageLock(null)[4]?.label).toBe("• Change the project status from Draft");
    expect(PAGE_LOCK_TESTID).toBe("con_Milestones_Page_LockMessage_6");
  });
});

/* ════════════════════════════════════════════════════════════════════ gating */

describe("UT-GRIDOP gating", () => {
  it("UT-GRIDOP-022 Grid Connection fields stay editable when locked, as the canvas (D32 R1); the reverted fix is the twin", () => {
    const locked = { project: project({ netYieldP50: 0 }), canEdit: true };
    for (const field of CONNECTION_TAB_FIELDS) {
      // The canvas sets no DisplayMode on these six: they stay editable.
      expect(canEditField(locked, field)).toBe(true);
      expect(canEditFieldCanvasParity(locked, field)).toBe(true);
      // NOT LIVE: the reverted fix locked them.
      expect(canEditFieldAllGated(locked, field)).toBe(false);
    }
    // The Grid Operator tab fields are locked in the canvas and here.
    expect(canEditField(locked, "operator")).toBe(false);
    expect(CONNECTION_TAB_FIELDS).toHaveLength(6);
  });

  it("Grid Connection fields stay editable while the project is Draft too; Save stays disabled", () => {
    const draft = { project: project({ clusterStateName: "Draft" }), canEdit: true };
    expect(canEditField(draft, "lengthExternal")).toBe(true);
    expect(canEditFieldCanvasParity(draft, "lengthExternal")).toBe(true);
    expect(canEditFieldAllGated(draft, "lengthExternal")).toBe(false);
    // The Grid Operator tab fields were gated in the canvas as well.
    expect(canEditField(draft, "operator")).toBe(false);
    expect(canEditFieldCanvasParity(draft, "operator")).toBe(false);
  });

  it("every field is read-only without edit permission", () => {
    const state = { project: project(), canEdit: false };
    for (const field of FIELDS) expect(canEditField(state, field)).toBe(false);
  });

  it("the tab strip is disabled while Draft or locked", () => {
    expect(canSwitchTabs({ project: project(), canEdit: true })).toBe(true);
    expect(canSwitchTabs({ project: project({ clusterStateName: "Draft" }), canEdit: true }))
      .toBe(false);
    expect(canSwitchTabs({ project: project({ totalCapacity: null }), canEdit: true }))
      .toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════ Save and Cancel gates */

describe("UT-GRIDOP the buttons", () => {
  const base = toForm(record());

  it("UT-GRIDOP-016 Save is disabled on a clean form", () => {
    expect(canSave({
      project: project(), canEdit: true, form: base, baseline: base, touched: new Set(),
    })).toBe(false);
  });

  it("UT-GRIDOP-017 Save is disabled while any field is invalid", () => {
    const dirty = { ...base, lengthInternal: "100", operator: "Changed" };
    expect(canSave({
      project: project(), canEdit: true, form: dirty, baseline: base,
      touched: touch("lengthInternal", "operator"),
    })).toBe(false);
  });

  it("UT-GRIDOP-018 an invalid voltage blocks Save (fixes the canvas omission)", () => {
    const state = {
      project: project(), canEdit: true,
      form: { ...base, voltageLevel: "1,5", operator: "Changed" },
      baseline: base,
      touched: touch("voltageLevel", "operator"),
    };
    expect(canSave(state)).toBe(false);
    // The canvas Save gate named the four cabling labels only, so it let this through.
    expect(canSaveCanvasParity(state)).toBe(true);
  });

  it("UT-GRIDOP-019 Save is disabled while the project is Draft", () => {
    expect(canSave({
      project: project({ clusterStateName: "Draft" }), canEdit: true,
      form: { ...base, operator: "Changed" }, baseline: base, touched: touch("operator"),
    })).toBe(false);
  });

  it("UT-GRIDOP-020 Save is disabled without edit permission", () => {
    const state = {
      project: project(), canEdit: false,
      form: { ...base, operator: "Changed" }, baseline: base, touched: touch("operator"),
    };
    expect(canSave(state)).toBe(false);
  });

  it("Save is enabled for a dirty, valid, unlocked, permitted form", () => {
    const state = {
      project: project(), canEdit: true,
      form: { ...base, operator: "Changed" }, baseline: base, touched: touch("operator"),
    };
    expect(canSave(state)).toBe(true);
  });

  it("Save is disabled while the mutation is in flight", () => {
    expect(canSave({
      project: project(), canEdit: true,
      form: { ...base, operator: "Changed" }, baseline: base, touched: touch("operator"),
      busy: true,
    })).toBe(false);
  });

  it("UT-GRIDOP-026 a successful save clears dirty, so Cancel is disabled", () => {
    // After the save the screen drops the draft; the re-read row is the new baseline.
    expect(canCancel(base, base)).toBe(false);
    expect(isDirty(base, base)).toBe(false);
    expect(SAVE_SUCCESS).toBe("Grid operator data was saved successfully!");
  });

  it("UT-GRIDOP-028 Cancel needs at least one dirty field", () => {
    const edited = { ...base, operator: "A", lengthExternal: "3.5" };
    expect(canCancel(edited, base)).toBe(true);
    expect(canCancel(base, base)).toBe(false);
    // Cancel restores the bound values — no request, and toForm is the restore.
    expect(toForm(record())).toEqual(base);
  });

  it("UT-GRIDOP-035 SOURCE DEFECT — Cancel is no longer disabled for the rest of the visit after a save", () => {
    const edited = { ...base, operator: "A" };
    // Canvas: `locAllowGridOperatorReset` is false after any save, until OnVisible.
    expect(canCancelCanvasParity({ allowReset: false, form: edited, baseline: base })).toBe(false);
    expect(canCancelCanvasParity({ allowReset: true, form: edited, baseline: base })).toBe(true);
    expect(canCancel(edited, base)).toBe(true);
  });

  it("SOURCE DEFECT — the Operator handler marked the GridExpansionRequired row dirty", () => {
    const edited = { ...base, operator: "Changed" };
    expect(dirtyFields(edited, base)).toEqual(["operator"]);
    expect(dirtyFieldsCanvasParity(edited, base)).toEqual(["expansionRequired"]);
  });
});

/* ═════════════════════════════════════════════════════════════════ the payload */

describe("UT-GRIDOP the save payload", () => {
  it("UT-GRIDOP-023 Save creates when no record exists, binding Project and BU", () => {
    const plan = planSaveGridOperator(toForm(record()), project(), null);
    expect(plan.writes).toHaveLength(1);
    const w = plan.writes[0]!;
    expect(w.op).toBe("create");
    expect(w.entitySet).toBe(ES.gridOperators);
    expect(w.data?.[`${GRID_OPERATOR_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
    expect(w.data?.["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    expect(w.data?.[GRID_OPERATOR_COL.operator]).toBe("Netze BW GmbH");
  });

  it("UT-GRIDOP-024 Save updates the row and re-binds Project and BU, as the canvas Patch", () => {
    const plan = planSaveGridOperator(toForm(record()), project(), record());
    const w = plan.writes[0]!;
    expect(w.op).toBe("update");
    expect(w.id).toBe("g-1");
    expect(w.data?.[`${GRID_OPERATOR_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
    expect(w.data?.["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    // The ten form columns plus the two binds.
    expect(Object.keys(w.data ?? {})).toHaveLength(12);
  });

  it("UT-GRIDOP-025 a blank numeric saves as null, not zero", () => {
    const payload = buildPayload(form({ operator: "x" }), project());
    expect(payload[GRID_OPERATOR_COL.lengthInternal]).toBeNull();
    expect(payload[GRID_OPERATOR_COL.voltageLevel]).toBeNull();
    expect(payload[GRID_OPERATOR_COL.diameterExternal]).toBeNull();
    expect(numericColumn("")).toBeNull();
    expect(numericColumn("0")).toBe(0);
    expect(numericColumn("abc")).toBeNull();
  });

  it("numeric columns respect the language's decimal separator", () => {
    expect(numericColumn("1,5", "de-DE")).toBe(1.5);
    expect(numericColumn("1.5", "en-US")).toBe(1.5);
  });

  it("UT-GRIDOP-036 a stored text longer than 55 is not cut by a save; blank becomes null", () => {
    // The input stops typing at 55; the columns hold 100 / 100 / 256.
    const long = "x".repeat(80);
    const payload = buildPayload(form({ operator: long }), project());
    expect(String(payload[GRID_OPERATOR_COL.operator])).toHaveLength(80);
    expect(payload[GRID_OPERATOR_COL.expansionDetails]).toBeNull();
  });

  it("UT-GRIDOP-037 the BU binding is left out when the project has none", () => {
    const payload = buildPayload(form(), project({ owningBusinessUnitId: null }));
    expect(payload[`${GRID_OPERATOR_LOOKUP.owningBusinessUnit}@odata.bind`]).toBeUndefined();
    expect(payload[`${GRID_OPERATOR_LOOKUP.project}@odata.bind`]).toBe("/vsb_projects(p-1)");
  });

  it("UT-GRIDOP-038 with no project the plan is refused and sends nothing", () => {
    const plan = planSaveGridOperator(form({ operator: "x" }), null, null);
    expect(plan.writes).toEqual([]);
    expect(plan.refusedReason).toBe(REFUSAL.noProject);
  });

  it("UT-GRIDOP-039 the Save job carries the canvas success and error texts", () => {
    const job = saveGridOperatorJob(form({ operator: "x" }), project(), null);
    expect(job.progress).toBe("");
    expect(job.success).toBe("Grid operator data was saved successfully!");
    expect(SAVE_ERROR_PREFIX).toBe("Error: Grid operator data could not be saved. ");
    expect(job.errorText?.("boom")).toBe(
      "Error: Grid operator data could not be saved. Internal error: originated on vsb_gridoperators. Message: boom",
    );
    expect(saveErrorText("x")).toContain("originated on vsb_gridoperators");
  });
});

/* ══════════════════════════════════════════════════════════════════════ tabs */

describe("UT-GRIDOP tabs and chrome", () => {
  it("UT-GRIDOP-031 the character counter tracks the 55-char limit", () => {
    expect(charCounter("x".repeat(20))).toBe("20/55");
    expect(CHAR_MAX_LENGTH).toBe(55);
  });

  it("UT-GRIDOP-032 tab selection survives a reload", () => {
    expect(parseTab("connection")).toBe("connection");
    expect(parseTab("operator")).toBe("operator");
    // Anything unrecognised or absent falls back to the first tab.
    expect(parseTab(null)).toBe("operator");
    expect(parseTab("nonsense")).toBe("operator");
    expect(TABS.map((t) => t.key)).toEqual(["operator", "connection"]);
    expect(TABS.map((t) => t.label)).toEqual(["Grid Operator", "Grid Connection"]);
  });

  it("the choice dropdowns share one Yes/No/Unknown option list", () => {
    expect(YES_NO_UNKNOWN.map((o) => o.label)).toEqual(["Yes", "No", "Unknown"]);
    expect(choiceLabel(CHOICE_PROCESS.yesNoUnknown.unknown)).toBe("Unknown");
    expect(choiceLabel(null)).toBe("");
  });

  it("UT-GRIDOP-040 every hard-coded option value is in its pac-generated enum", () => {
    const keys = (o: Record<number, string>) => Object.keys(o).map(Number).sort();
    const values = YES_NO_UNKNOWN.map((o) => o.value).sort();
    expect(values).toEqual(keys(Vsb_gridoperatorsvsb_expansionrequired));
    expect(values).toEqual(keys(Vsb_gridoperatorsvsb_substationconstructionrequired));
    for (const o of YES_NO_UNKNOWN) {
      expect(Vsb_gridoperatorsvsb_expansionrequired[o.value as 952850000]).toBe(o.label);
      expect(Vsb_gridoperatorsvsb_substationconstructionrequired[o.value as 952850000]).toBe(o.label);
    }
  });

  it("UT-GRIDOP-029 leaving with unsaved data prompts", () => {
    const base = toForm(record());
    expect(shouldPromptOnLeave({ ...base, operator: "Changed" }, base)).toBe(true);
    expect(LEAVE_CONFIRMATION)
      .toBe("You have unsaved data. Do you really want to leave current form without saving?");
  });

  it("UT-GRIDOP-030 leaving a clean form navigates directly", () => {
    const base = toForm(record());
    expect(shouldPromptOnLeave(base, base)).toBe(false);
    // …including the empty form of a project with no record at all.
    expect(shouldPromptOnLeave(emptyForm(), emptyForm())).toBe(false);
  });
});

describe("D35 — the shared leave guard", () => {
  it("UT-GRIDOP-909 the leave dialog texts are the canvas ones, verbatim", () => {
    expect(GRID_LEAVE_DIALOG).toEqual({ title: "Unsaved data", description: "You have unsaved data. Do you really want to leave current form without saving?", confirm: "Yes", cancel: "Cancel" });
  });
});
