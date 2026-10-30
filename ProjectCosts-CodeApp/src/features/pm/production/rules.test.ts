/**
 * Project Production Screen — unit tests (D28).
 *
 * IDs are `UT-PROD-nnn`. Ids were kept where the case survives the redevelopment; 080–115 are new
 * (the connected write plans, the SOURCE DEFECT fixes with their canvas twins, the formats, and the
 * option values pinned to the pac-generated enums).
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PRODUCTION, ES, ES_FINANCE, ES_PLANT, ES_PRODUCTION } from "@/data/dataverseNames";
import { createdRowRef } from "@/data/writePlan";
import {
  Vsb_energyyieldsstatecode, Vsb_energyyieldsstatuscode, Vsb_energyyieldsvsb_allocation,
  Vsb_energyyieldsvsb_energyyieldassessment, Vsb_energyyieldsvsb_type,
} from "@/generated/models/Vsb_energyyieldsModel";
import { Vsb_landleaseperiodsvsb_aggregation, Vsb_landleaseperiodsvsb_period } from "@/generated/models/Vsb_landleaseperiodsModel";
import { Vsb_opexprojectcostsvsb_aggregation } from "@/generated/models/Vsb_opexprojectcostsModel";
import { Vsb_landleaseprojectcostsvsb_secured } from "@/generated/models/Vsb_landleaseprojectcostsModel";
import {
  Vsb_opexlandleasestandardassumptionsesvsb_period, Vsb_opexlandleasestandardassumptionsesvsb_typeofcontract,
} from "@/generated/models/Vsb_opexlandleasestandardassumptionsesModel";
import {
  pageLock, isPageLocked, commandBarState, selectedYield, onCardHeader, blocksLastYieldRemoval,
  derivedP75, derivedP90, totalLossesPct, deriveNetP50, grossFromIrradiation, deriveYieldView, fieldModes,
  newYieldForm, formFromRow, modesFromRow, changeLossesMode, changeUncertaintyMode, changeAllocationMode,
  buildYieldPayload, supersededInternalYields, projectYieldTotals, planRollUp,
  buildSeasonalityRows, seasonalityFromStored, applyMonthEdit, seasonalityTotal, isSeasonalityValid,
  seasonalityTotalError, seasonalityTotalErrorCanvasParity, serialiseStandardValuesJson,
  deserialiseStandardValuesJson, seasonalityFields,
  buildNegativePriceRows, negativeRowsForEdit, applyReductionEdit, resetNegativePriceRow,
  planNegativePriceWrites, planNegativePriceWritesCanvasParity, negativePriceFields,
  syncRevenueNegativePrices, revenueSyncYieldsCanvasParity, parseFabricNumber, normaliseAmount, parseStandardAssumptions,
  validateWindSpeed, validateGrossYield, validateIrradiation, validateTotalLosses, validateUncertainty,
  validateUncertaintyCanvasParity, validateNetYieldP50, validateNetYieldP75, validateNetYieldP90,
  validateCellPercent, canSaveYield, yieldErrors,
  planSaveYield, planDeleteYield, planStatusChange,
  shouldGenerate, inflationStartYear, resolveInflation, toLandLeasePeriod, toLandLeaseAggregation,
  planStandardContracts, markForCapexRecalculationFields,
  pfxText, summaryValues, detailValues, productionRowLabel, productionStatusLabel, fmtPercentTotal, panelTitle,
  statusDialog, MSG, PROJECT_YIELD_COL, SEASONALITY_COL, NEGATIVE_PRICE_COL, YIELD_COL, YIELD_STATUS, BIND,
  type ProductionProject, type EnergyYieldRow, type RevenueRow, type StandardAssumption, type YieldFormState,
  type GenerationInputs, type StoredNegativePrice,
} from "./rules";
import { LEAVE_DIALOG as PROD_LEAVE_DIALOG, shouldConfirmLeave as prodShouldConfirmLeave, shouldConfirmLeaveWhilePanelOpen } from "./rules";

/* ═══════════════════════════════════════════════════════════════════ fixtures ═══ */

const project = (over: Partial<ProductionProject> = {}): ProductionProject => ({
  id: "p1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryId: "c1", countryName: "Germany", technology: 952850000,
  totalCapacity: 22.4, endDate: "2055-12-31", cod: "2028-09-01", plantPvCapacity: 5,
  grossYield: 12_000, windSpeed: 7.25, irradiation: null, netYieldP50: 12_000, netYieldP75: 11_000, netYieldP90: 10_000,
  standardCostCreated: false, owningBusinessUnitId: "bu-1",
  ...over,
});

const yieldRow = (over: Partial<EnergyYieldRow> = {}): EnergyYieldRow => ({
  id: "y1", name: "EY-0001", description: "Internal WTG 2028",
  type: CHOICE_PRODUCTION.yieldType.wtg, assessment: CHOICE_PRODUCTION.yieldAssessment.internal,
  allocation: CHOICE_PRODUCTION.yieldAllocation.wholePlant,
  windSpeed: 7, irradiation: null, grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10,
  netYieldP75: 9_326, netYieldP90: 8_718,
  productionAllocation: null, productionLossesP50: false, productionUncertainty: false,
  considerSeasonality: false, considerNegativePrices: false, status: 0,
  ...over,
});

const revenue = (over: Partial<RevenueRow> = {}): RevenueRow =>
  ({ id: "r1", description: "PPA", considerNegativePrices: false, manualOverride: false, ...over });

const twelveStandard = (value: number) => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pv: value, wtg: value }));

const assumption = (over: Partial<StandardAssumption> = {}): StandardAssumption => ({
  id: "a1", name: "LL Standard", description: "A Land lease",
  period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1, typeOfContract: CHOICE_PRODUCTION.typeOfContract.landlease,
  landLeaseSubaccountId: "lls1", landLeaseSubaccountName: "Land lease", opexSubaccountId: null, opexSubaccountName: null,
  currencyId: "cur1", secured: true, allWtgAllocated: false, fixCosts: 1000, ofRevenues: 2, eurMw: 1, eurMwh: 2, eurWtg: 3,
  aggregation: CHOICE_PRODUCTION.aggregation.sum, durationInYears: 2, durationInMonths: 6, distributionFrequency: 12,
  amountOneTimePayment: 1_234.5678, amountOneTimePayment2: null, amountOneTimePayment3: null,
  dueDateOneTimePayment: "2029-01-01", dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
  useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.8, inflationCountryArea: "DE",
  alignWithProjectDuration: false, externalContract: false, threshold: false, thresholdType: null, thresholdIndividual: null,
  ...over,
});

const form = (over: Partial<YieldFormState> = {}): YieldFormState => ({
  ...newYieldForm("en-US"),
  description: "Assessment", windSpeed: "7", grossYield: "12000", totalLosses: "15", uncertainty: "10",
  ...over,
});

const viewOf = (f: YieldFormState, tech: "WTG" | "PV" = "WTG", cap: number | null = 5) =>
  deriveYieldView(f, tech, { plantPvCapacity: cap, lang: "en-US" });

const inputs = (over: Partial<GenerationInputs> = {}): GenerationInputs => ({
  project: project(), assumptions: [assumption()], existing: { landLease: 0, otherOpex: 0, oAndM: 0 },
  generators: [{ id: "g1", name: "WTG A_1" }, { id: "g2", name: "WTG A_2" }],
  deviceTypes: [{ id: "d1" }], oAndM: { id: "om", name: "Operation & Maintenance" }, countryInflation: 2.1,
  ...over,
});

/* ══════════════════════════════════════════════════════════ lock and gating ════ */

describe("page lock, command bar and selection", () => {
  it("UT-PROD-001 lists all three prerequisites", () => {
    const p = project({ projectIdText: null, endDate: null, totalCapacity: 0 });
    expect(pageLock(p)).toEqual(["• General", "• Milestones", "• Generator"]);
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(project())).toEqual([]);
    expect(isPageLocked(project())).toBe(false);
  });

  it("UT-PROD-002 every command is disabled at zero capacity", () => {
    const st = commandBarState({ canEdit: true, project: project({ totalCapacity: 0 }), selected: yieldRow() });
    expect(Object.values(st).every((c) => c.enabled === false)).toBe(true);
    const ok = commandBarState({ canEdit: true, project: project(), selected: yieldRow() });
    expect(Object.values(ok).every((c) => c.enabled === true)).toBe(true);
  });

  it("UT-PROD-080 the whole bar is disabled while the page lock shows (DisplayMode, Y:458)", () => {
    const st = commandBarState({ canEdit: true, project: project({ endDate: null }), selected: yieldRow() });
    expect(Object.values(st).every((c) => c.enabled === false)).toBe(true);
  });

  it("UT-PROD-003 Edit visibility follows the yield type", () => {
    const pvSel = commandBarState({ canEdit: true, project: project(), selected: yieldRow({ type: CHOICE_PRODUCTION.yieldType.pv }) });
    expect(pvSel.editProductionPV.visible).toBe(true);
    expect(pvSel.editProductionWTG.visible).toBe(false);
  });

  it("UT-PROD-004 Activate is hidden while the yield is already active", () => {
    const active = commandBarState({ canEdit: true, project: project(), selected: yieldRow({ status: 0 }) });
    expect(active.activateProdItem.visible).toBe(false);
    expect(active.deactivateProdItem.visible).toBe(true);
    const inactive = commandBarState({ canEdit: true, project: project(), selected: yieldRow({ status: 1 }) });
    expect(inactive.activateProdItem.visible).toBe(true);
    const none = commandBarState({ canEdit: true, project: project(), selected: null });
    expect(none.activateProdItem.visible || none.deactivateProdItem.visible || none.deleteProductionItem.visible).toBe(false);
  });

  it("UT-PROD-114 the first yield is pre-selected; the header only selects", () => {
    const rows = [yieldRow({ id: "a" }), yieldRow({ id: "b" })];
    expect(selectedYield(rows, undefined)?.id).toBe("a");
    expect(selectedYield(rows, null)).toBeNull();
    expect(selectedYield(rows, "b")?.id).toBe("b");
    expect(onCardHeader("a", "b")).toBe("b");
    expect(onCardHeader("a", "a")).toBe("a");
  });

  it("UT-PROD-115 the last active yield cannot be removed while it carries the whole p50", () => {
    const only = yieldRow({ netYieldP50: 12_000 });
    expect(blocksLastYieldRemoval({ project: project(), selected: only, yields: [only] })).toBe(true);
    expect(blocksLastYieldRemoval({ project: project(), selected: only, yields: [only, yieldRow({ id: "y2" })] })).toBe(false);
    expect(blocksLastYieldRemoval({ project: project(), selected: yieldRow({ status: 1, netYieldP50: 12_000 }), yields: [only] })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════ yield maths ════ */

describe("derived fields", () => {
  it("UT-PROD-005 p75 from p50 and a 10 % uncertainty", () => {
    expect(derivedP75(10_000, 10)).toBe(9_326);
  });
  it("UT-PROD-006 p90 from p50 and a 10 % uncertainty", () => {
    expect(derivedP90(10_000, 10)).toBe(8_718);
  });
  it("UT-PROD-007 non-numeric input yields no value (the -1 sentinel never leaks)", () => {
    expect(derivedP75("abc", 10)).toBeUndefined();
    expect(derivedP90(10_000, "x")).toBeUndefined();
  });
  it("UT-PROD-008 zero uncertainty leaves p50 unchanged", () => {
    expect(derivedP75(10_000, 0)).toBe(10_000);
  });
  it("UT-PROD-010 total losses derived from gross and p50", () => {
    expect(totalLossesPct(12_000, 10_200)).toBeCloseTo(15, 6);
    expect(totalLossesPct(null, 1)).toBeUndefined();
  });
  it("UT-PROD-011 negative derived losses raise the gross-yield message", () => {
    expect(validateTotalLosses("-5.0", { derived: true })).toBe(MSG.grossYieldOrder);
  });
  it("UT-PROD-012 a new form opens with losses 15.0 and uncertainty 10.0, Internal, the default modes", () => {
    const f = newYieldForm("en-US");
    expect([f.totalLosses, f.uncertainty]).toEqual(["15.0", "10.0"]);
    expect(f.assessment).toBe(CHOICE_PRODUCTION.yieldAssessment.internal);
    expect([f.allocationInput, f.lossesInput, f.uncertaintyInput]).toEqual(["Input Gross Yield", "Input losses", "Input Uncertainty"]);
    expect(newYieldForm("de-DE").totalLosses).toBe("15,0");
  });
  it("UT-PROD-013 Net p50 = Gross × (1 − Losses/100), whole MWh (Y:3110, 5930)", () => {
    expect(deriveNetP50(12_000, 15)).toBe(10_200);
    expect(deriveNetP50(1_001, 15)).toBe(851); // 850.85 → 851
    expect(deriveNetP50(null, 15)).toBe(0);
  });
  it("UT-PROD-014 'Input losses' derives p50, then p75/p90 from it", () => {
    const v = viewOf(form());
    expect(v.netP50).toBe("10,200");
    expect(v.netP75).toBe("9,512");
    expect(v.netP90).toBe("8,893");
  });
  it("UT-PROD-015 PV 'Input Irradiation' derives Gross = Round(capacity × irradiation, 0)", () => {
    expect(grossFromIrradiation(5.2, 1_000.4)).toBe(5_202);
    const v = viewOf(form({ allocationInput: "Input Irradiation", irradiation: "1000", grossYield: "" }), "PV", 5);
    expect(v.grossYield).toBe("5,000");
    expect(v.netP50).toBe("4,250");
  });
  it("UT-PROD-081 'Input Net Yield p50' derives the losses in both technologies (SOURCE DEFECT 8)", () => {
    const f = form({ lossesInput: "Input Net Yield p50", netP50: "9000", totalLosses: "" });
    expect(viewOf(f, "WTG").totalLosses).toBe("25.0");
    expect(viewOf(f, "PV").totalLosses).toBe("25.0");
  });
  it("UT-PROD-111 Edit restores the stored modes and the canvas field formats", () => {
    const row = yieldRow({ productionLossesP50: true, productionUncertainty: true, productionAllocation: false, windSpeed: 7.256 });
    expect(modesFromRow(row)).toEqual({ allocationInput: "Input Irradiation", lossesInput: "Input Net Yield p50", uncertaintyInput: "Input Net Yield p75/p90" });
    const blank = modesFromRow(yieldRow({ productionLossesP50: null, productionUncertainty: null, productionAllocation: null }));
    expect(blank).toEqual({ allocationInput: "Input Gross Yield", lossesInput: "Input Net Yield p50", uncertaintyInput: "Input Net Yield p75/p90" });
    const f = formFromRow(row, "WTG", "en-US");
    expect([f.windSpeed, f.grossYield, f.totalLosses, f.netP50]).toEqual(["7.26", "12,000", "15.0", "10,200"]);
  });
  it("UT-PROD-112 the radio changes reset the fields the canvas resets", () => {
    const f = form({ netP50: "1", irradiation: "5" });
    expect(changeLossesMode(f, "Input Net Yield p50", "WTG")).toMatchObject({ totalLosses: "", netP50: "", grossYield: "", irradiation: "5" });
    expect(changeLossesMode(f, "Input Net Yield p50", "PV").irradiation).toBe("");
    expect(changeUncertaintyMode(f, "Input Net Yield p75/p90")).toMatchObject({ uncertainty: "", netP75: "", netP90: "" });
    expect(changeAllocationMode(f, "Input Irradiation").irradiation).toBe("0.0");
    expect(changeAllocationMode(f, "Input Gross Yield").grossYield).toBe("0");
  });
  it("UT-PROD-113 field modes: radios locked on Edit, PV gross / irradiation by allocation", () => {
    expect(fieldModes(form(), "WTG", true).modesLocked).toBe(true);
    const pvIrr = fieldModes(form({ allocationInput: "Input Irradiation" }), "PV", false);
    expect([pvIrr.grossEditable, pvIrr.irradiationEditable, pvIrr.grossRequired]).toEqual([false, true, false]);
    const wtg = fieldModes(form(), "WTG", false);
    expect([wtg.grossEditable, wtg.grossRequired, wtg.lossesEditable, wtg.p50Editable]).toEqual([true, true, true, false]);
  });
});

/* ═══════════════════════════════════════════════════════════ the payload ════ */

describe("the yield payload", () => {
  it("UT-PROD-008b the radio → two-option mapping writes VALUES; WTG has no irradiation", () => {
    const f = form({ lossesInput: "Input Net Yield p50", uncertaintyInput: "Input Net Yield p75/p90", netP50: "10200", netP75: "9000", netP90: "8000" });
    const p = buildYieldPayload({ form: f, view: viewOf(f), technology: "WTG", project: project() });
    expect(p[YIELD_COL.productionLossesP50]).toBe(true);
    expect(p[YIELD_COL.productionUncertainty]).toBe(true);
    expect(p[YIELD_COL.allocation]).toBe(CHOICE_PRODUCTION.yieldAllocation.wholePlant);
    expect(p[YIELD_COL.windSpeed]).toBe(7);
    expect(YIELD_COL.irradiation in p).toBe(false);
    expect(YIELD_COL.productionAllocation in p).toBe(false);
    expect(p[BIND.project]).toBe("/vsb_projects(p1)");
    expect(p[BIND.owner]).toBe("/businessunits(bu-1)");
  });
  it("UT-PROD-013b PV writes irradiation and the allocation mode, never wind or allocation", () => {
    const f = form({ allocationInput: "Input Irradiation", irradiation: "1000" });
    const p = buildYieldPayload({ form: f, view: viewOf(f, "PV"), technology: "PV", project: project() });
    expect(p[YIELD_COL.irradiation]).toBe(1000);
    expect(p[YIELD_COL.productionAllocation]).toBe(false);
    expect(p[YIELD_COL.grossYield]).toBe(5000);
    expect(p[YIELD_COL.netYieldP50]).toBe(4250);
    expect(YIELD_COL.windSpeed in p).toBe(false);
    expect(YIELD_COL.allocation in p).toBe(false);
    expect(p[YIELD_COL.type]).toBe(CHOICE_PRODUCTION.yieldType.pv);
  });
  it("UT-PROD-016 an external assessment deactivates the internals of the SAME type", () => {
    const ys = [
      yieldRow({ id: "i1" }),
      yieldRow({ id: "i2", type: CHOICE_PRODUCTION.yieldType.pv }),
      yieldRow({ id: "i3", status: 1 }),
      yieldRow({ id: "e1", assessment: CHOICE_PRODUCTION.yieldAssessment.external }),
    ];
    expect(supersededInternalYields({ assessment: CHOICE_PRODUCTION.yieldAssessment.external, type: CHOICE_PRODUCTION.yieldType.wtg, yields: ys })).toEqual(["i1"]);
    expect(supersededInternalYields({ assessment: CHOICE_PRODUCTION.yieldAssessment.internal, type: CHOICE_PRODUCTION.yieldType.wtg, yields: ys })).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════ roll-up ════ */

describe("project yield roll-up", () => {
  it("UT-PROD-017 the roll-up is the SUM of the WTG and PV averages", () => {
    const t = projectYieldTotals([
      yieldRow({ grossYield: 10 }), yieldRow({ id: "b", grossYield: 20 }),
      yieldRow({ id: "c", type: CHOICE_PRODUCTION.yieldType.pv, grossYield: 5 }),
    ]);
    expect(t.grossYield).toBe(20);
  });
  it("UT-PROD-018 an empty side contributes zero", () => {
    expect(projectYieldTotals([]).netP50).toBe(0);
  });
  it("UT-PROD-019 wind averages WTG only, irradiation PV only", () => {
    const t = projectYieldTotals([yieldRow({ windSpeed: 7 }), yieldRow({ id: "pv", type: CHOICE_PRODUCTION.yieldType.pv, windSpeed: 99, irradiation: 1100 })]);
    expect(t.windSpeed).toBe(7);
    expect(t.irradiation).toBe(1100);
  });
  it("UT-PROD-020 only active yields count", () => {
    expect(projectYieldTotals([yieldRow({ grossYield: 10 }), yieldRow({ id: "x", grossYield: 1000, status: 1 })]).grossYield).toBe(10);
  });
  it("UT-PROD-082 Average ignores a blank value, as Power Fx does", () => {
    expect(projectYieldTotals([yieldRow({ netYieldP75: 9000 }), yieldRow({ id: "b", netYieldP75: null })]).netP75).toBe(9000);
  });
  it("UT-PROD-106 the roll-up plan patches the six project columns", () => {
    const plan = planRollUp("p1", [yieldRow()]);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({ op: "update", entitySet: ES.projects, id: "p1" });
    expect(Object.keys(plan.writes[0]!.data!).sort()).toEqual([
      PROJECT_YIELD_COL.grossYield, PROJECT_YIELD_COL.irradiation, PROJECT_YIELD_COL.netYieldP50,
      PROJECT_YIELD_COL.netYieldP75, PROJECT_YIELD_COL.netYieldP90, PROJECT_YIELD_COL.windSpeed,
    ].sort());
  });
});

/* ═══════════════════════════════════════════════════════════ seasonality ════ */

describe("seasonality", () => {
  it("UT-PROD-021 twelve rows are seeded from the standard, all standard", () => {
    const rows = buildSeasonalityRows(twelveStandard(8.3), "WTG");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ id: 1, month: "January", value: 8.3, text: "8.3", isStandard: true });
  });
  it("UT-PROD-030 WTG reads the WTG column, PV the PV column", () => {
    const std = [{ month: 1, pv: 6.5, wtg: 8 }];
    expect(buildSeasonalityRows(std, "PV")[0]!.value).toBe(6.5);
    expect(buildSeasonalityRows(std, "WTG")[0]!.value).toBe(8);
  });
  it("UT-PROD-085 a month missing from the standard (or a failed Fabric read) is blank", () => {
    const rows = buildSeasonalityRows([], "WTG");
    expect(rows.every((r) => r.value === null && r.text === "")).toBe(true);
    expect(isSeasonalityValid(rows)).toBe(false);
  });
  it("UT-PROD-022 editing one month clears EVERY standard flag and keeps the typed text", () => {
    const rows = applyMonthEdit(buildSeasonalityRows(twelveStandard(8), "WTG"), 2, "7.");
    expect(rows.every((r) => !r.isStandard)).toBe(true);
    expect(rows[1]).toMatchObject({ text: "7.", value: 7 });
    const bad = applyMonthEdit(rows, 3, "abc");
    expect(bad[2]).toMatchObject({ text: "abc", value: 8 });
    expect(validateCellPercent("abc")).toBe(MSG.cellRange);
  });
  it("UT-PROD-023 the twelve months must total 100", () => {
    const ok = buildSeasonalityRows([...twelveStandard(8).slice(0, 11), { month: 12, pv: 12, wtg: 12 }], "WTG");
    expect(seasonalityTotal(ok)).toBe(100);
    expect(isSeasonalityValid(ok)).toBe(true);
    expect(isSeasonalityValid(buildSeasonalityRows(twelveStandard(8), "WTG"))).toBe(false);
  });
  it("UT-PROD-083 the total's error label follows the rounded gate (SOURCE DEFECT 5)", () => {
    const vals = [8.1, 8.1, 8.1, 8.1, 8.1, 8.1, 8.1, 8.1, 8.1, 8.1, 9.5, 9.5];
    const rows = buildSeasonalityRows(vals.map((v, i) => ({ month: i + 1, pv: v, wtg: v })), "WTG");
    expect(isSeasonalityValid(rows)).toBe(true);
    expect(seasonalityTotalError(rows)).toBe(false);
    expect(seasonalityTotalErrorCanvasParity(rows)).toBe(seasonalityTotal(rows) !== 100);
  });
  it("UT-PROD-024 the cell regex is locale-aware", () => {
    expect(validateCellPercent("12.5", "en-US")).toBeNull();
    expect(validateCellPercent("12,5", "de-DE")).toBeNull();
    expect(validateCellPercent("12.5", "de-DE")).toBe(MSG.cellRange);
    expect(validateCellPercent("", "en-US")).toBe(MSG.cellEmpty);
    expect(validateCellPercent("100.0")).toBeNull();
    expect(validateCellPercent("100.1")).toBe(MSG.cellRange);
  });
  it("UT-PROD-027 the Standard Values JSON round-trips", () => {
    const rows = applyMonthEdit(buildSeasonalityRows(twelveStandard(8), "WTG"), 1, "8").map((r, i) => ({ ...r, isStandard: i === 3 }));
    const json = serialiseStandardValuesJson(rows);
    expect(JSON.parse(json)).toMatchObject({ Jan: false, Apr: true });
    expect(deserialiseStandardValuesJson(json)[3]).toBe(true);
    expect(deserialiseStandardValuesJson("not json")).toEqual(Array(12).fill(false));
  });
  it("UT-PROD-084 Edit reads the stored months and their flags", () => {
    const rows = seasonalityFromStored({ recordId: "s1", months: [8.5, ...Array(11).fill(null)], standardValuesJson: '{"Jan":true}' });
    expect(rows[0]).toMatchObject({ value: 8.5, text: "8.5", isStandard: true });
    expect(rows[1]).toMatchObject({ value: null, text: "", isStandard: false });
  });
  it("UT-PROD-025 the seasonality payload names the row and the twelve columns", () => {
    const f = seasonalityFields({ rows: buildSeasonalityRows(twelveStandard(8), "WTG"), yieldDescription: "North" });
    expect(f[SEASONALITY_COL.name]).toBe("Seasonality - North");
    for (const c of SEASONALITY_COL.months) expect(f[c]).toBe(8);
  });
});

/* ═══════════════════════════════════════════════════════════ negative prices ════ */

describe("negative prices", () => {
  const std = [{ year: 2028, pv: 2, wind: 3 }];
  it("UT-PROD-028 the curve spans 15 years from the COD year", () => {
    const rows = buildNegativePriceRows(2028, std, "WTG");
    expect(rows.map((r) => r.year)).toEqual(Array.from({ length: 15 }, (_, i) => 2028 + i));
    expect(rows[0]).toMatchObject({ reductionValue: 3, text: "3.0", standardAssumption: true });
  });
  it("UT-PROD-029 a missing standard year defaults to 0 and is not standard", () => {
    expect(buildNegativePriceRows(2028, std, "PV")[1]).toMatchObject({ reductionValue: 0, text: "0.0", standardAssumption: false, hasStandard: false });
  });
  it("UT-PROD-087 Edit shows the WHOLE stored set; with none it seeds the curve (SOURCE DEFECT 4)", () => {
    const stored: StoredNegativePrice[] = [{ id: "n2", year: 2050, reduction: 5, isStandard: false }, { id: "n1", year: 2028, reduction: 1, isStandard: true }];
    const rows = negativeRowsForEdit({ stored, standard: std, technology: "WTG", cod: "2030-01-01" });
    expect(rows.map((r) => r.year)).toEqual([2028, 2050]);
    expect(rows[0]).toMatchObject({ reductionValue: 1, standardReductionValue: 3, standardAssumption: true });
    expect(negativeRowsForEdit({ stored: [], standard: std, technology: "WTG", cod: "2030-01-01" })).toHaveLength(15);
  });
  it("UT-PROD-089 a typed reduction keeps its text and is no longer standard", () => {
    const rows = applyReductionEdit(buildNegativePriceRows(2028, std, "WTG"), 2028, "4x");
    expect(rows[0]).toMatchObject({ text: "4x", reductionValue: 3, standardAssumption: false });
  });
  it("UT-PROD-088 the per-year reset restores the standard value and flag", () => {
    const edited = applyReductionEdit(buildNegativePriceRows(2028, std, "WTG"), 2028, "9");
    expect(resetNegativePriceRow(edited, 2028)[0]).toMatchObject({ reductionValue: 3, text: "3.0", standardAssumption: true });
    expect(resetNegativePriceRow(edited, 2029)[1]).toMatchObject({ standardAssumption: false });
  });
  it("UT-PROD-031 only changed years are written back", () => {
    const rows = buildNegativePriceRows(2028, std, "WTG");
    const stored: StoredNegativePrice[] = rows.map((r, i) => ({ id: `n${i}`, year: r.year, reduction: r.reductionValue, isStandard: r.standardAssumption }));
    const edited = applyReductionEdit(rows, 2030, "7");
    expect(planNegativePriceWrites(edited, stored)).toEqual({ upserts: [{ id: "n2", year: 2030, reduction: 7, isStandard: false }], deletes: [] });
  });
  it("UT-PROD-086 stored years outside the curve are removed (SOURCE DEFECT 3); the canvas kept them", () => {
    const rows = buildNegativePriceRows(2030, [], "WTG");
    const stored: StoredNegativePrice[] = [{ id: "old", year: 2028, reduction: 1, isStandard: false }];
    expect(planNegativePriceWrites(rows, stored).deletes).toEqual(["old"]);
    const canvas = planNegativePriceWritesCanvasParity(rows, stored);
    expect(canvas.deletes).toEqual([]);
    expect(canvas.upserts).toHaveLength(15);
  });
  it("UT-PROD-032 the negative-price payload", () => {
    expect(negativePriceFields({ year: 2030, reduction: 2.5, isStandard: true })).toEqual({
      [NEGATIVE_PRICE_COL.name]: "Negative Price - 2030", [NEGATIVE_PRICE_COL.year]: 2030,
      [NEGATIVE_PRICE_COL.reduction]: 2.5, [NEGATIVE_PRICE_COL.isStandard]: true,
    });
  });
});

/* ═══════════════════════════════════════════════════════════ revenue sync ════ */

describe("revenue negative-price sync", () => {
  it("UT-PROD-033 turns contracts OFF when no active yield uses negative prices", () => {
    expect(syncRevenueNegativePrices({ activeYields: [yieldRow()], revenues: [revenue({ considerNegativePrices: true })] }))
      .toEqual([{ id: "r1", considerNegativePrices: false }]);
  });
  it("UT-PROD-034 turns contracts ON when one does", () => {
    expect(syncRevenueNegativePrices({ activeYields: [yieldRow({ considerNegativePrices: true })], revenues: [revenue()] }))
      .toEqual([{ id: "r1", considerNegativePrices: true }]);
  });
  it("UT-PROD-035 manual-override contracts are never touched", () => {
    expect(syncRevenueNegativePrices({ activeYields: [yieldRow()], revenues: [revenue({ considerNegativePrices: true, manualOverride: true })] })).toEqual([]);
  });
  it("UT-PROD-036 an INACTIVE negative-price yield does not keep contracts on", () => {
    expect(syncRevenueNegativePrices({ activeYields: [yieldRow({ considerNegativePrices: true, status: 1 })], revenues: [revenue({ considerNegativePrices: true })] }))
      .toEqual([{ id: "r1", considerNegativePrices: false }]);
  });
});

/* ═════════════════════════════════════════════════════════════ write plans ════ */

describe("write plans", () => {
  const wtgForm = form({ considerSeasonality: true, considerNegativePrices: true });
  const payload = buildYieldPayload({ form: wtgForm, view: viewOf(wtgForm), technology: "WTG", project: project() });
  const season = buildSeasonalityRows(twelveStandard(8), "WTG");
  const negatives = buildNegativePriceRows(2028, [], "WTG").slice(0, 2);

  it("UT-PROD-100 a new yield: yield, seasonality and negative prices bound to the created row, in order", () => {
    const plan = planSaveYield({
      editing: null, payload, project: project(),
      seasonality: { on: true, rows: season, storedId: null },
      negativePrices: { on: true, rows: negatives, stored: [] },
      yields: [], revenues: [],
    });
    expect(plan.writes.map((w) => [w.op, w.entitySet])).toEqual([
      ["create", ES_PRODUCTION.energyYields], ["create", ES_PRODUCTION.seasonalityValues],
      ["create", ES_PRODUCTION.negativePrices], ["create", ES_PRODUCTION.negativePrices],
    ]);
    for (const w of plan.writes.slice(1)) {
      expect(w.data![BIND.energyYield]).toBe(`/vsb_energyyields(${createdRowRef(0)})`);
      expect(w.data![BIND.owner]).toBe("/businessunits(bu-1)");
    }
  });
  it("UT-PROD-101 Edit with the toggles off removes the stored seasonality and every negative price", () => {
    const editing = yieldRow({ considerSeasonality: true, considerNegativePrices: true });
    const plan = planSaveYield({
      editing, payload: { ...payload, [YIELD_COL.considerSeasonality]: false, [YIELD_COL.considerNegativePrices]: false }, project: project(),
      seasonality: { on: false, rows: [], storedId: "s1" },
      negativePrices: { on: false, rows: [], stored: [{ id: "n1", year: 2028, reduction: 1, isStandard: false }] },
      yields: [editing], revenues: [],
    });
    expect(plan.writes.map((w) => [w.op, w.entitySet, w.id])).toEqual([
      ["update", ES_PRODUCTION.energyYields, "y1"], ["delete", ES_PRODUCTION.seasonalityValues, "s1"], ["delete", ES_PRODUCTION.negativePrices, "n1"],
    ]);
  });
  it("UT-PROD-102 Edit with seasonality on updates the stored row", () => {
    const editing = yieldRow();
    const plan = planSaveYield({
      editing, payload, project: project(), seasonality: { on: true, rows: season, storedId: "s1" },
      negativePrices: { on: false, rows: [], stored: [] }, yields: [editing], revenues: [],
    });
    expect(plan.writes[1]).toMatchObject({ op: "update", entitySet: ES_PRODUCTION.seasonalityValues, id: "s1" });
    expect(plan.writes[1]!.data![BIND.energyYield]).toBe("/vsb_energyyields(y1)");
  });
  it("UT-PROD-103 External supersedes, and the revenue sync sees the superseded set (SOURCE DEFECT 2)", () => {
    const internal = yieldRow({ id: "i1", considerNegativePrices: true });
    const ext = form({ assessment: CHOICE_PRODUCTION.yieldAssessment.external });
    const extPayload = buildYieldPayload({ form: ext, view: viewOf(ext), technology: "WTG", project: project() });
    const plan = planSaveYield({
      editing: null, payload: extPayload, project: project(), seasonality: { on: false, rows: [], storedId: null },
      negativePrices: { on: false, rows: [], stored: [] }, yields: [internal],
      revenues: [revenue({ considerNegativePrices: true })],
    });
    expect(plan.writes.map((w) => [w.op, w.entitySet, w.id ?? null])).toEqual([
      ["create", ES_PRODUCTION.energyYields, null],
      ["update", ES_FINANCE.projectRevenues, "r1"],
      ["update", ES_PRODUCTION.energyYields, "i1"],
    ]);
    expect(plan.writes[1]!.data).toEqual({ vsb_considernegativeprices: false });
    expect(plan.writes[2]!.data).toEqual(YIELD_STATUS.inactive);
    // The canvas read the yields before the supersede: the internal still counted, nothing changed.
    const before = revenueSyncYieldsCanvasParity([internal], yieldRow({ id: "@new", assessment: CHOICE_PRODUCTION.yieldAssessment.external }));
    expect(syncRevenueNegativePrices({ activeYields: before, revenues: [revenue({ considerNegativePrices: true })] })).toEqual([]);
  });
  it("UT-PROD-104 delete removes the yield (children cascade) and syncs the revenues", () => {
    const row = yieldRow({ considerNegativePrices: true });
    const plan = planDeleteYield({ row, yields: [row], revenues: [revenue({ considerNegativePrices: true })] });
    expect(plan.writes.map((w) => [w.op, w.entitySet, w.id])).toEqual([
      ["delete", ES_PRODUCTION.energyYields, "y1"], ["update", ES_FINANCE.projectRevenues, "r1"],
    ]);
  });
  it("UT-PROD-105 activate / deactivate writes statecode + statuscode, then syncs", () => {
    const off = planStatusChange({ row: yieldRow(), yields: [yieldRow()], revenues: [] });
    expect(off.writes[0]).toMatchObject({ op: "update", id: "y1", data: { statecode: 1, statuscode: 2 } });
    const on = planStatusChange({ row: yieldRow({ status: 1, considerNegativePrices: true }), yields: [yieldRow({ status: 1, considerNegativePrices: true })], revenues: [revenue()] });
    expect(on.writes.map((w) => w.data)).toEqual([{ statecode: 0, statuscode: 1 }, { vsb_considernegativeprices: true }]);
  });
});

/* ═══════════════════════════════════════════════════════════ Fabric / amounts ════ */

describe("Fabric and amounts", () => {
  it("UT-PROD-057 Fabric values are parsed locale-safely", () => {
    expect(parseFabricNumber("0.075", "en-US")).toBeCloseTo(0.075);
    expect(parseFabricNumber("0.075", "de-DE")).toBeCloseTo(0.075);
    expect(parseFabricNumber("", "en-US")).toBe(0);
  });
  it("UT-PROD-046 one-time payment amounts are normalised to 2 dp; a blank stays blank", () => {
    expect(normaliseAmount(1_234.5678)).toBe(1_234.57);
    expect(normaliseAmount(null)).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════ validation ════ */

describe("field validation", () => {
  it("UT-PROD-090 wind speed: two decimals, 0…15, the canvas texts", () => {
    expect(validateWindSpeed("7.25")).toBeNull();
    expect(validateWindSpeed("7.255")).toBe(MSG.windTwoDecimal);
    expect(validateWindSpeed("16")).toBe("Please enter value between 0 and 15 ");
  });
  it("UT-PROD-091 gross yield: a whole value 0…2,000,000, per-technology wording", () => {
    expect(validateGrossYield("12,000", "WTG")).toBeNull();
    expect(validateGrossYield("12.5", "WTG")).toBe("Numeric value without Decimal");
    expect(validateGrossYield("12.5", "PV")).toBe("Numeric value without decimal");
    expect(validateGrossYield("2000001", "PV")).toBe(MSG.grossRange);
  });
  it("UT-PROD-092 irradiation: three decimals, 0…3000", () => {
    expect(validateIrradiation("1,100.123")).toBeNull();
    expect(validateIrradiation("1.1234")).toBe(MSG.irradiationThreeDecimals);
    expect(validateIrradiation("3001")).toBe(MSG.irradiationRange);
  });
  it("UT-PROD-093 PV uncertainty is 0…100 (SOURCE DEFECT 1); the canvas allowed 0…3000", () => {
    expect(validateUncertainty("150", "en-US", "PV")).toBe(MSG.uncertaintyRange);
    expect(validateUncertainty("1.25", "en-US", "PV")).toBe("Numeric value with maximum of one decimal");
    expect(validateUncertaintyCanvasParity("150")).toBeNull();
    expect(validateUncertaintyCanvasParity("3001")).toBe("Please select a value between 0 and 3 000.");
  });
  it("UT-PROD-094 PV total losses use their own range text; WTG keeps the reproduced one", () => {
    expect(validateTotalLosses("150", { derived: false, technology: "PV" })).toBe("Please select a value between 0 and 100.");
    expect(validateTotalLosses("150", { derived: false, technology: "WTG" })).toBe(MSG.grossYieldOrder);
  });
  it("UT-PROD-052 p50 must be a whole number within range", () => {
    expect(validateNetYieldP50("10,200")).toBeNull();
    expect(validateNetYieldP50("1.5")).toBe(MSG.integerWtg);
    expect(validateNetYieldP50("3000000")).toBe(MSG.p50Range);
  });
  it("UT-PROD-053 uncertainty is one decimal within 0…100", () => {
    expect(validateUncertainty("10.5")).toBeNull();
    expect(validateUncertainty("10.55")).toBe(MSG.oneDecimal);
    expect(validateUncertainty("101")).toBe(MSG.uncertaintyRange);
  });
  it("UT-PROD-075 p75 must be below p50 in manual mode", () => {
    expect(validateNetYieldP75("11000", { mode: "Input Net Yield p75/p90", p50: "10000" })).toBe(MSG.p75BelowP50);
    expect(validateNetYieldP75("9000", { mode: "Input Net Yield p75/p90", p50: "10000" })).toBeNull();
  });
  it("UT-PROD-051 a negative computed p90 raises the uncertainty message", () => {
    expect(validateNetYieldP90("-5", { mode: "Input Uncertainty", p75: "" })).toBe(MSG.negativeYield);
    const v = viewOf(form({ uncertainty: "90" }));
    expect(yieldErrors(v, form({ uncertainty: "90" }), "WTG").netP90).toBe(MSG.negativeYield);
  });
  it("UT-PROD-050 Save is blocked when p90 exceeds p75", () => {
    const f = form({ uncertaintyInput: "Input Net Yield p75/p90", uncertainty: "", netP75: "9000", netP90: "9500" });
    expect(canSaveYield({ form: f, view: viewOf(f), technology: "WTG", seasonality: [], negativePrices: [] })).toBe(false);
    const ok = { ...f, netP90: "8000" };
    expect(canSaveYield({ form: ok, view: viewOf(ok), technology: "WTG", seasonality: [], negativePrices: [] })).toBe(true);
  });
  it("UT-PROD-054 Save is blocked when the chosen mode's inputs are blank", () => {
    const can = (f: YieldFormState, tech: "WTG" | "PV" = "WTG") => canSaveYield({ form: f, view: viewOf(f, tech), technology: tech, seasonality: [], negativePrices: [] });
    expect(can(form())).toBe(true);
    expect(can(form({ description: " " }))).toBe(false);
    expect(can(form({ windSpeed: "" }))).toBe(false);
    expect(can(form({ totalLosses: "" }))).toBe(false);
    expect(can(form({ uncertainty: "" }))).toBe(false);
    expect(can(form({ windSpeed: "", allocationInput: "Input Irradiation", irradiation: "" }), "PV")).toBe(false);
    expect(can(form({ windSpeed: "", allocationInput: "Input Irradiation", irradiation: "1000" }), "PV")).toBe(true);
  });
  it("UT-PROD-096 an invalid PV gross yield blocks Save in 'Input Net Yield p50' too (SOURCE DEFECT 7)", () => {
    const f = form({ lossesInput: "Input Net Yield p50", grossYield: "12000.5", netP50: "10000" });
    expect(canSaveYield({ form: f, view: viewOf(f, "PV"), technology: "PV", seasonality: [], negativePrices: [] })).toBe(false);
  });
  it("UT-PROD-055 Save is blocked on an invalid negative-price row", () => {
    const f = form({ considerNegativePrices: true });
    const rows = applyReductionEdit(buildNegativePriceRows(2028, [], "WTG"), 2028, "abc");
    expect(canSaveYield({ form: f, view: viewOf(f), technology: "WTG", seasonality: [], negativePrices: rows })).toBe(false);
  });
  it("UT-PROD-023b Save is blocked while seasonality does not total 100", () => {
    const f = form({ considerSeasonality: true });
    expect(canSaveYield({ form: f, view: viewOf(f), technology: "WTG", seasonality: buildSeasonalityRows(twelveStandard(8), "WTG"), negativePrices: [] })).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════ standard contracts ════ */

describe("standard contract generation", () => {
  it("UT-PROD-038 generation is one-shot and gated on p50", () => {
    expect(shouldGenerate({ netYieldP50: 1, standardCostCreated: false })).toBe(true);
    expect(shouldGenerate({ netYieldP50: 1, standardCostCreated: true })).toBe(false);
  });
  it("UT-PROD-039 nothing is generated at zero p50", () => {
    expect(shouldGenerate({ netYieldP50: 0, standardCostCreated: false })).toBe(false);
  });
  it("UT-PROD-041 the inflation start year is COD year + 1, read from the date's own digits", () => {
    expect(inflationStartYear("2028-01-01")).toBe(2029);
    expect(inflationStartYear(null)).toBeNull();
  });
  it("UT-PROD-042 the country profile wins when both flags are Yes", () => {
    expect(resolveInflation({ assumption: assumption({ useCountryInflationProfile: true }), countryProfile: 2.1 })).toBe(2.1);
  });
  it("UT-PROD-043 the assumption's own profile is used when the country flag is No", () => {
    expect(resolveInflation({ assumption: assumption(), countryProfile: 2.1 })).toBe(1.8);
  });
  it("UT-PROD-044 no inflation at all when the profile flag is off", () => {
    expect(resolveInflation({ assumption: assumption({ useInflationProfile: false }), countryProfile: 2.1 })).toBeNull();
  });
  it("UT-PROD-040 a family is skipped when the project already has standard contracts of it", () => {
    const plan = planStandardContracts(inputs({ existing: { landLease: 1, otherOpex: 1, oAndM: 1 } }));
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]!.data).toEqual(markForCapexRecalculationFields());
  });
  it("UT-PROD-046b the land lease cost carries the canvas binds, flags and 2-dp amounts", () => {
    const plan = planStandardContracts(inputs());
    const cost = plan.writes[0]!;
    expect(cost).toMatchObject({ op: "create", entitySet: ES_PLANT.landLeaseProjectCosts });
    expect(cost.data).toMatchObject({
      [BIND.project]: "/vsb_projects(p1)", [BIND.subaccount]: "/vsb_landleasesubaccounts(lls1)",
      [BIND.currency]: "/transactioncurrencies(cur1)", [BIND.owner]: "/businessunits(bu-1)",
      vsb_name: "Windpark Nord-Land lease-LL Standard", vsb_amountonetimepayment: 1_234.57,
      vsb_secured: CHOICE_PRODUCTION.landLeaseSecured.yes, vsb_inflationstartyear: 2029, vsb_inflationprofile: 1.8,
      vsb_isstandardcontract: true, vsb_isstartdatestandardassumption: true,
    });
    const period = plan.writes[1]!;
    expect(period).toMatchObject({ op: "create", entitySet: ES.landLeasePeriods });
    expect(period.data).toMatchObject({
      [BIND.projectCost]: `/vsb_landleaseprojectcosts(${createdRowRef(0)})`, vsb_startdate: "2028-09-01",
      vsb_period: CHOICE_PRODUCTION.landLeasePeriod.period1, vsb_fixedcosts: 1000, vsb_aggregation: CHOICE_PRODUCTION.aggregation.sum,
    });
  });
  it("UT-PROD-045 AllWTGAllocated creates one allocation per turbine, bound to the new cost", () => {
    const plan = planStandardContracts(inputs({ assumptions: [assumption({ allWtgAllocated: true })] }));
    const allocations = plan.writes.filter((w) => w.entitySet === ES.landLeaseAllocationWtgs);
    expect(allocations.map((w) => w.data!.vsb_name)).toEqual(["-A Land lease-WTG A_1", "-A Land lease-WTG A_2"]);
    expect(allocations[0]!.data![BIND.generatorInProject]).toBe("/vsb_generatorinprojects(g1)");
    expect(allocations[0]!.data![BIND.projectCost]).toBe(`/vsb_landleaseprojectcosts(${createdRowRef(0)})`);
  });
  it("UT-PROD-099 land lease periods chain start + duration, date-only", () => {
    const plan = planStandardContracts(inputs({ assumptions: [
      assumption(), assumption({ id: "a2", description: "B period 2", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period2 }),
    ] }));
    const periods = plan.writes.filter((w) => w.entitySet === ES.landLeasePeriods).map((w) => w.data!.vsb_startdate);
    expect(periods).toEqual(["2028-09-01", "2031-03-01"]);
  });
  it("UT-PROD-098 a land lease period without a Period-1 contract is skipped", () => {
    const plan = planStandardContracts(inputs({ assumptions: [assumption({ period: CHOICE_PRODUCTION.opexLandLeasePeriod.period2 })] }));
    expect(plan.writes.filter((w) => w.entitySet === ES.landLeasePeriods)).toHaveLength(0);
  });
  it("UT-PROD-047 O&M: one cost per device type, period 2 chained from it", () => {
    const om = (over: Partial<StandardAssumption>) => assumption({ typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOandM, landLeaseSubaccountId: null, ...over });
    const plan = planStandardContracts(inputs({
      deviceTypes: [{ id: "d1" }, { id: "d2" }],
      assumptions: [om({ id: "o1", description: "O&M 1" }), om({ id: "o2", description: "O&M 2", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period2 })],
    }));
    const opex = plan.writes.filter((w) => w.entitySet === ES_PLANT.opexProjectCosts);
    expect(opex).toHaveLength(4);
    expect(opex[0]!.data).toMatchObject({
      [BIND.subaccount]: "/vsb_opexsubaccounts(om)", [BIND.deviceTypeInProject]: "/vsb_devicetypesinprojects(d1)",
      vsb_name: "Operation & Maintenance-Operation & Maintenance-O&M 1", vsb_startdate: "2028-09-01", vsb_inflationstartyear: 2029,
    });
    expect(opex[2]!.data).toMatchObject({ vsb_startdate: "2031-03-01", [BIND.parentCost]: `/vsb_opexprojectcosts(${createdRowRef(0)})` });
    expect(opex[3]!.data).toMatchObject({ [BIND.deviceTypeInProject]: "/vsb_devicetypesinprojects(d2)", [BIND.parentCost]: `/vsb_opexprojectcosts(${createdRowRef(1)})` });
  });
  it("UT-PROD-097 Other OPEX: its own family; periods 3+ chain within their subaccount (SOURCE DEFECT 6)", () => {
    const other = (over: Partial<StandardAssumption>) => assumption({
      typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOther, landLeaseSubaccountId: null, opexSubaccountName: "Insurance", ...over,
    });
    const P = CHOICE_PRODUCTION.opexLandLeasePeriod;
    const assumptions = [
      other({ id: "x1", description: "A1", opexSubaccountId: "sA", durationInYears: 1, durationInMonths: 0 }),
      other({ id: "x2", description: "A2", opexSubaccountId: "sA", period: P.period2, durationInYears: 1, durationInMonths: 0 }),
      other({ id: "y1", description: "B1", opexSubaccountId: "sB", durationInYears: 5, durationInMonths: 0 }),
      other({ id: "y2", description: "B2", opexSubaccountId: "sB", period: P.period2, durationInYears: 5, durationInMonths: 0 }),
      other({ id: "x3", description: "C3", opexSubaccountId: "sA", period: P.period3, durationInYears: 1, durationInMonths: 0 }),
    ];
    const plan = planStandardContracts(inputs({ assumptions, oAndM: null }));
    const rows = plan.writes.filter((w) => w.entitySet === ES_PLANT.opexProjectCosts);
    expect(rows[0]!.data).toMatchObject({ vsb_name: "Other OPEX Costs-Insurance-A1", [BIND.subaccount]: "/vsb_opexsubaccounts(sA)" });
    expect(BIND.deviceTypeInProject in rows[0]!.data!).toBe(false);
    const c3 = rows.find((w) => w.data!.vsb_description === "C3")!;
    expect(c3.data!.vsb_startdate).toBe("2030-09-01"); // A2 (2029-09-01) + 1 year
    const canvas = planStandardContracts(inputs({ assumptions, oAndM: null }), { otherOpexChain: "canvasParity" })
      .writes.find((w) => w.data?.vsb_description === "C3")!;
    expect(canvas.data!.vsb_startdate).toBe("2038-09-01"); // chained from B2 (2033-09-01) + 5 years
  });
  it("UT-PROD-048 the four flags close the generation; no flow is invoked", () => {
    const plan = planStandardContracts(inputs());
    expect(plan.writes[plan.writes.length - 1]).toMatchObject({ op: "update", entitySet: ES.projects, id: "p1", data: {
      [PROJECT_YIELD_COL.initialP50Trigger]: true, [PROJECT_YIELD_COL.capexStandardContractsCreated]: false,
      [PROJECT_YIELD_COL.capexStandardCostsCreated]: false, [PROJECT_YIELD_COL.bopStandardContractsCreated]: false,
    } });
  });
  it("UT-PROD-058 without a COD no contract is generated, the flags still are", () => {
    expect(planStandardContracts(inputs({ project: project({ cod: null }) })).writes).toHaveLength(1);
  });
  it("UT-PROD-059 the period and aggregation translations", () => {
    expect(toLandLeasePeriod(CHOICE_PRODUCTION.opexLandLeasePeriod.period3)).toBe(CHOICE_PRODUCTION.landLeasePeriod.period3);
    expect(toLandLeasePeriod(CHOICE_PRODUCTION.opexLandLeasePeriod.period10)).toBe(CHOICE_PRODUCTION.landLeasePeriod.period1);
    expect(toLandLeaseAggregation(CHOICE_PRODUCTION.aggregation.max)).toBe(CHOICE_PRODUCTION.aggregation.max);
    expect(toLandLeaseAggregation(null)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════ display ════ */

describe("display", () => {
  it("UT-PROD-107 the card label carries the type (Y:2272)", () => {
    expect(productionRowLabel(CHOICE_PRODUCTION.yieldType.wtg, "North")).toBe("Production - WTG North");
    expect(productionRowLabel(CHOICE_PRODUCTION.yieldType.pv, null)).toBe("Production - PV ");
    expect(productionStatusLabel(0)).toBe("Active");
  });
  it("UT-PROD-108 the summary shows the STORED roll-up in the canvas formats", () => {
    expect(summaryValues(project({ grossYield: 1_234_567, windSpeed: 7, irradiation: 1100.25, netYieldP50: 0, netYieldP75: 10_000.5 }))).toEqual({
      grossYield: "1,234,567", windSpeed: "7.0", irradiation: "1,100.25", netP50: "", netP75: "10,000.5", netP90: "10,000",
    });
    expect(summaryValues(null).grossYield).toBe("");
    expect(summaryValues(project({ grossYield: 1234.5 }), "de-DE").grossYield).toBe("1.234,5");
  });
  it("UT-PROD-109 the detail values: Yes/No labels, wind 0.0#, 'No' for blank negative prices", () => {
    const d = detailValues(yieldRow({ considerSeasonality: true, considerNegativePrices: null, windSpeed: 7.256 }));
    expect([d.considerSeasonality, d.considerNegativePrices, d.windOrIrradiation, d.grossYield, d.totalLosses]).toEqual(["Yes", "No", "7.26", "12,000", "15.0"]);
    expect(detailValues(yieldRow({ considerSeasonality: null })).considerSeasonality).toBe("");
    expect(detailValues(yieldRow({ type: CHOICE_PRODUCTION.yieldType.pv, irradiation: 1100 })).windOrIrradiation).toBe("1,100.0");
  });
  it("UT-PROD-110 pfxText follows the language's separators", () => {
    expect(pfxText(1234.5, "###,##0.0#", "en-US")).toBe("1,234.5");
    expect(pfxText(1234.5, "###,##0.0#", "de-DE")).toBe("1.234,5");
    expect(pfxText(0, "##,###")).toBe("");
    expect(pfxText(null, "0.0")).toBe("");
  });
  it("UT-PROD-060 the Total Sum [%] has no trailing .0", () => {
    expect(fmtPercentTotal(100)).toBe("100");
    expect(fmtPercentTotal(99.94)).toBe("99.9");
  });
  it("UT-PROD-061 panel and status dialog texts", () => {
    expect(panelTitle("WTG", null)).toBe("Add Production WTG");
    expect(panelTitle("PV", { description: "South" })).toBe("Edit Production PV South");
    expect(statusDialog({ status: 0, description: "X" })).toMatchObject({ title: "Deactivate Production?", description: "Are you sure you want to deactivate: X?", confirm: "Deactivate" });
    expect(statusDialog({ status: 1, description: "X" }).title).toBe("Activate Production?");
  });
});

/* ════════════════════════════════════════════ option values vs the schema ════ */

describe("option values pinned to the pac-generated enums", () => {
  it("UT-PROD-095 every hard-coded option value exists in the generated schema", () => {
    expect(Vsb_energyyieldsvsb_type[CHOICE_PRODUCTION.yieldType.wtg]).toBe("WTG");
    expect(Vsb_energyyieldsvsb_type[CHOICE_PRODUCTION.yieldType.pv]).toBe("PV");
    expect(Vsb_energyyieldsvsb_energyyieldassessment[CHOICE_PRODUCTION.yieldAssessment.internal]).toBe("Internal");
    expect(Vsb_energyyieldsvsb_energyyieldassessment[CHOICE_PRODUCTION.yieldAssessment.external]).toBe("External");
    expect(Vsb_energyyieldsvsb_allocation[CHOICE_PRODUCTION.yieldAllocation.wholePlant]).toBe("Wholeplant");
    expect(Vsb_energyyieldsstatecode[YIELD_STATUS.inactive.statecode]).toBe("Inactive");
    expect(Vsb_energyyieldsstatuscode[YIELD_STATUS.inactive.statuscode]).toBe("Inactive");
    expect(Vsb_energyyieldsstatuscode[YIELD_STATUS.active.statuscode]).toBe("Active");
    const t = CHOICE_PRODUCTION.typeOfContract;
    expect([t.landlease, t.opexOandM, t.opexOther].map((v) => Vsb_opexlandleasestandardassumptionsesvsb_typeofcontract[v as keyof typeof Vsb_opexlandleasestandardassumptionsesvsb_typeofcontract]))
      .toEqual(["Landlease", "OpexO_M", "OpexOther"]);
    for (const v of Object.values(CHOICE_PRODUCTION.opexLandLeasePeriod)) {
      expect(Vsb_opexlandleasestandardassumptionsesvsb_period[v as keyof typeof Vsb_opexlandleasestandardassumptionsesvsb_period]).toBeDefined();
    }
    for (const v of Object.values(CHOICE_PRODUCTION.landLeasePeriod)) {
      expect(Vsb_landleaseperiodsvsb_period[v as keyof typeof Vsb_landleaseperiodsvsb_period]).toBeDefined();
    }
    const a = CHOICE_PRODUCTION.aggregation;
    expect([a.sum, a.max, a.min].map((v) => Vsb_landleaseperiodsvsb_aggregation[v])).toEqual(["SUM", "MAX", "MIN"]);
    expect([a.sum, a.max, a.min].map((v) => Vsb_opexprojectcostsvsb_aggregation[v])).toEqual(["SUM", "MAX", "MIN"]);
    expect(Vsb_landleaseprojectcostsvsb_secured[CHOICE_PRODUCTION.landLeaseSecured.yes]).toBe("Yes");
    expect(Vsb_landleaseprojectcostsvsb_secured[CHOICE_PRODUCTION.landLeaseSecured.no]).toBe("No");
  });
});

describe("D35 — the shared leave guard", () => {
  it("UT-PROD-911 SOURCE DEFECT reproduced: the canvas never sets a Dirty row, so leaving never asks; the twin asks while a panel is open", () => {
    expect(prodShouldConfirmLeave(true)).toBe(false);
    expect(prodShouldConfirmLeave(false)).toBe(false);
    expect(shouldConfirmLeaveWhilePanelOpen(true)).toBe(true);
    expect(shouldConfirmLeaveWhilePanelOpen(false)).toBe(false);
    expect(PROD_LEAVE_DIALOG).toEqual({ title: "Unsaved data", description: "You have unsaved data. Do you really want to leave current form without saving?", confirm: "Yes", cancel: "Cancel" });
  });
});

describe("parseStandardAssumptions (Fabric SQL, connected 28 Oct 2026)", () => {
  it("UT-PROD-120 seasonality: Month = Value(category), PV / WTG = Value × 100 (unrounded), sorted by category", () => {
    const { seasonality } = parseStandardAssumptions([
      { valuetype: "seasonality", category: "2", pv: "0.07", wind: "0.075" },
      { valuetype: "seasonality", category: "1", pv: "0.065", wind: "0.08" },
      { valuetype: "price", category: "2030", pv: "70", wind: "80" },
    ]);
    expect(seasonality.map((r) => r.month)).toEqual([1, 2]);
    expect(seasonality[0]!.pv).toBeCloseTo(6.5, 10);
    expect(seasonality[1]!.wtg).toBeCloseTo(7.5, 10);
  });

  it("UT-PROD-121 negative prices: Year = Value(category), Round(Value × 100, 1); blanks read 0, a non-numeric category is dropped", () => {
    const { negativePrices } = parseStandardAssumptions([
      { valuetype: "negativeprices", category: "2029", pv: "0.0123", wind: "" },
      { valuetype: "negativeprices", category: "2028", pv: "0.05", wind: "0.0456" },
      { valuetype: "negativeprices", category: "n/a", pv: "0.1", wind: "0.1" },
    ]);
    expect(negativePrices).toEqual([
      { year: 2028, pv: 5, wind: 4.6 },
      { year: 2029, pv: 1.2, wind: 0 },
    ]);
  });
});