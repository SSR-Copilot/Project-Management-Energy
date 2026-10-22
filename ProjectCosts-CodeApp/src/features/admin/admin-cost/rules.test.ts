/**
 * Costs settings — every rule in `rules.ts` (defaults, options, ranges, messages).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

import {
  AGGREGATION, CONTRACT_TYPE, COST_PAID_BY, COST_UNIT, ContractDeleteError, DevexRuleError,
  OpexFollowUpError, OpexRuleError, TECHNOLOGY,
} from "@/domain/costStandards";
import { formatOneDecimalPercent, formatRevenuePercent } from "@/features/cost/periods/opexRules";
import { DataError, RecordGoneError } from "@/platform/errors";
import { RowWriteError } from "@/data/adminRowWrites";
import { COST_COUNTRY_RULE, COST_DEFAULT, defaultSelection, isSelectable, pickerCountries } from "@/domain/countryPicker";
import { COST_TECHNOLOGIES } from "@/domain/technology";
import { ERROR_HINT } from "@/platform/userMessage";
import { COST_TECHNOLOGIES_FOR, MSG } from "./constants";
import {
  FX_COUNTRIES, FX_CURRENCIES, FX_DEVEX_COSTS, FX_GERMANY, FX_HIERARCHY, FX_LAND_LEASE_SUBACCOUNTS,
  FX_OPEX_PERIODS, FX_OPEX_SUBACCOUNTS, FX_PAYER_DEFAULTS, fxDevexCost, fxPeriod,
} from "./fixtures";
import {
  breadcrumbText, buildDevexTree, canAddPeriod, canDeletePeriodRow, canDeleteRow, canSaveDevex, inactiveRowsReason, canSaveOpex, clusterText,
  codText, commentTooltip, contractMenu, costText, currencyCode, currencyIssue, defaultExternalContract,
  deleteDialogText, deleteKind, devexCategoryOptions, fmtCanvasPercent, fmtGridPercent, fmtStoredPercent,
  isInactiveSubaccount, PERCENT_DISPLAY, devexFormFromCost, devexPanelTitle,
  devexSubaccountOptions, devexWriteFromForm, editModeFor, emptyDevexForm, endDateText, errorText,
  groupContracts, hasCostTechnologies, hiddenValues, inputText, isContractLevelEditable, isDirty, newContractDescription,
  nextPeriodNumber, nextStartDateText, opexPanelTitle, opexStandardDefaults, opexWriteFromForm,
  otherOpexLabel, toCostSelection, toStandardOpexRow, unitOptions, validateDevexForm, validateOpexForm,
  withCountryInflation, withDevexCategory, withDevexSubaccount, withDevexUnit, withInflation, withYears,
  DEVEX_SUBACCOUNT_LIMIT, UNKNOWN_CATEGORY_ID, type ContractView, type CostSelection, type OpexForm,
  type OpexPanelContext,
} from "./rules";

const EN = "en-US";
const DE = "de-DE";
const germanyWind: CostSelection = { countryId: FX_GERMANY.id, countryName: "Germany", technology: TECHNOLOGY.wind };
const names = new Map(FX_LAND_LEASE_SUBACCOUNTS.map((s) => [s.id, s.name]));
const opexNames = new Map(FX_OPEX_SUBACCOUNTS.map((s) => [s.id, s.name]));
const llContract = (): ContractView => groupContracts(FX_OPEX_PERIODS, CONTRACT_TYPE.landLease, names)[0] as ContractView;

/* ═════════════════════════════════════════════════════════════ selection ══ */

describe("Picker and header", () => {
  // The shared picker model with the Costs configuration must give today's list and default.
  const costCountries = (rows: Parameters<typeof pickerCountries>[0]) => pickerCountries(rows, COST_COUNTRY_RULE);
  const costDefault = (rows: Parameters<typeof pickerCountries>[0]) => {
    const list = costCountries(rows);
    const sel = defaultSelection(list, COST_TECHNOLOGIES, COST_DEFAULT, COST_TECHNOLOGIES_FOR);
    return toCostSelection(sel, list.find((c) => c.id === sel?.countryId));
  };
  it("UT-ADCOST-001 excludes Spain/Greece/Romania and orders Germany, France, Poland, Italy, Finland, Croatia", () => {
    expect(costCountries(FX_COUNTRIES).map((c) => c.name))
      .toEqual(["Germany", "France", "Poland", "Italy", "Finland", "Croatia"]);
  });
  it("UT-ADCOST-002 lists any other country after the six, as the canvas deny-list does, but gives it no technology", () => {
    // Replaces the earlier allow-list expectation (six countries only).
    const list = costCountries([...FX_COUNTRIES, { id: "z", name: "Austria" }, { id: "y", name: "Romania" }]);
    expect(list.map((c) => c.name)).toEqual(["Germany", "France", "Poland", "Italy", "Finland", "Croatia", "Austria"]);
    const austria = list.find((c) => c.name === "Austria");
    expect(austria && COST_TECHNOLOGIES_FOR(austria)).toEqual([]);
    for (const c of list.filter((x) => x.name !== "Austria")) expect(COST_TECHNOLOGIES_FOR(c)).toEqual(COST_TECHNOLOGIES);
    // Never selectable, for either technology.
    for (const t of COST_TECHNOLOGIES) {
      expect(isSelectable({ countryId: "z", technology: t.code }, list, COST_TECHNOLOGIES, COST_TECHNOLOGIES_FOR)).toBe(false);
    }
    expect(isSelectable({ countryId: FX_GERMANY.id, technology: TECHNOLOGY.pv }, list, COST_TECHNOLOGIES, COST_TECHNOLOGIES_FOR)).toBe(true);
    // Listed first in a list → the default still skips it.
    expect(costDefault([{ id: "z", name: "Austria" }, { id: "x", name: "Italy" }])?.countryName).toBe("Italy");
  });
  it("UT-ADCOST-003 a non-configured country never yields a selection that enables reads or writes", () => {
    expect(hasCostTechnologies("Austria")).toBe(false);
    expect(hasCostTechnologies("Spain")).toBe(false);
    expect(hasCostTechnologies("germany")).toBe(false); // exact match, as the canvas LookUp
    for (const name of ["Germany", "France", "Poland", "Italy", "Finland", "Croatia"]) expect(hasCostTechnologies(name)).toBe(true);
    expect(toCostSelection({ countryId: "z", technology: TECHNOLOGY.wind }, { name: "Austria" })).toBeUndefined();
    expect(toCostSelection({ countryId: "z", technology: TECHNOLOGY.pv }, { name: "Austria" })).toBeUndefined();
    // A technology outside Wind / PV is refused too.
    expect(toCostSelection({ countryId: "p", technology: -1 }, { name: "Poland" })).toBeUndefined();
    // Only non-configured countries loaded → no default selection at all.
    expect(costDefault([{ id: "z", name: "Austria" }])).toBeUndefined();
  });
  it("UT-ADCOST-004 offers Wind then PV", () => {
    expect(COST_TECHNOLOGIES).toEqual([{ code: TECHNOLOGY.wind, label: "Wind" }, { code: TECHNOLOGY.pv, label: "PV" }]);
  });
  it("UT-ADCOST-005 defaults to Germany / Wind, falling back to the first country", () => {
    expect(costDefault(FX_COUNTRIES)).toEqual({ countryId: FX_GERMANY.id, countryName: "Germany", technology: TECHNOLOGY.wind });
    expect(costDefault([{ id: "x", name: "Italy" }])?.countryName).toBe("Italy");
    expect(costDefault([])).toBeUndefined();
  });
  it("UT-ADCOST-006 unified default (PO 2026-10-17): without Germany it is still the first configured country + Wind", () => {
    // `COST_DEFAULT` is now `{kind:"first"}`; the result is unchanged from the old
    // `preferred Germany / Wind` spelling on every list, including one Germany is missing from.
    const noGermany = FX_COUNTRIES.filter((c) => c.name !== "Germany");
    expect(costDefault(noGermany)).toEqual({
      countryId: noGermany.find((c) => c.name === "France")!.id, countryName: "France", technology: TECHNOLOGY.wind,
    });
  });
  it("UT-ADCOST-007 resolves the shared selection with its country name", () => {
    expect(toCostSelection({ countryId: "p", technology: TECHNOLOGY.pv }, { name: "Poland" }))
      .toEqual({ countryId: "p", countryName: "Poland", technology: TECHNOLOGY.pv });
    expect(toCostSelection(undefined, { name: "Poland" })).toBeUndefined();
    expect(toCostSelection({ countryId: "p", technology: TECHNOLOGY.pv }, undefined)).toBeUndefined();
  });
  it("UT-ADCOST-008 builds the exact breadcrumb", () => {
    expect(breadcrumbText("Poland", TECHNOLOGY.pv)).toBe("Standard Assumptions / Costs / Poland / PV");
  });
  it("UT-ADCOST-009 uses PLN for Poland and EUR otherwise", () => {
    expect(currencyCode("Poland")).toBe("PLN");
    expect(currencyCode("Germany")).toBe("EUR");
  });
});

/* ═══════════════════════════════════════════════════════════════ DEVEX ══ */

describe("DEVEX tree", () => {
  it("UT-ADCOST-010 groups by category order with account/sub-account order inside, skipping empty categories", () => {
    const groups = buildDevexTree(FX_DEVEX_COSTS, FX_HIERARCHY);
    expect(groups.map((g) => g.categoryName)).toEqual(["Wind Turbine / Panels", "Development Expenses"]);
    expect(groups[1]?.rows.map((r) => r.account)).toEqual(["Permits", "Studies"]);
  });
  it("UT-ADCOST-011 never drops costs whose category is outside the hierarchy", () => {
    const groups = buildDevexTree([fxDevexCost({ id: "o", categoryId: "gone" })], FX_HIERARCHY);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.categoryId).toBe(UNKNOWN_CATEGORY_ID);
  });
  it("UT-ADCOST-012 formats cost, clusters, sub-account and comment tooltip", () => {
    const row = buildDevexTree([fxDevexCost({ clusters: [true, true, false, false, true] })], FX_HIERARCHY)[0]?.rows[0];
    expect(row?.costText).toBe("1,234,567 EUR/MW(p)");
    expect(row?.clusterText).toBe("1,2,5");
    expect(row?.subaccount).toBe("Building permit - 21001");
    expect(clusterText([false, false, false, false, false])).toBe("");
    expect(costText(undefined, undefined)).toBe("");
    expect(commentTooltip("")).toBe("Add Comment");
    expect(commentTooltip("abc")).toBe("Comment:\nabc");
  });
  it("UT-ADCOST-013 hierarchy excludes Overleveraging", () => {
    expect(FX_HIERARCHY.categories.map((c) => c.name)).not.toContain("Overleveraging");
    expect(FX_HIERARCHY.subaccounts.find((s) => s.name === "Wind study")?.aggregatedName).toBe("Studies / Wind study 22001");
  });
});

describe("DEVEX options", () => {
  it("UT-ADCOST-014 offers units per country and technology", () => {
    expect(unitOptions("Germany", TECHNOLOGY.wind)).toEqual([COST_UNIT.eur, COST_UNIT.eurMw, COST_UNIT.eurWtg]);
    expect(unitOptions("Germany", TECHNOLOGY.pv)).toEqual([COST_UNIT.eur, COST_UNIT.eurMw]);
    expect(unitOptions("Poland", TECHNOLOGY.wind)).toEqual([COST_UNIT.pln, COST_UNIT.plnMw, COST_UNIT.plnWtg]);
    expect(unitOptions("Poland", TECHNOLOGY.pv)).toEqual([COST_UNIT.pln, COST_UNIT.plnMw]);
    expect(unitOptions("Germany", TECHNOLOGY.pv, COST_UNIT.eurWtg)).toContain(COST_UNIT.eurWtg);
  });
  it("UT-ADCOST-015 hides sub-accounts with 50 costs in scope, keeps the edited one, filters by category", () => {
    const full = Array.from({ length: DEVEX_SUBACCOUNT_LIMIT }, (_, i) => fxDevexCost({ id: `c${i}` }));
    const subId = FX_DEVEX_COSTS[0]?.subaccountId as string;
    expect(devexSubaccountOptions(FX_HIERARCHY, full, null).map((o) => o.value)).not.toContain(subId);
    expect(devexSubaccountOptions(FX_HIERARCHY, full, null, subId).map((o) => o.value)).toContain(subId);
    const devCat = FX_HIERARCHY.categories.find((c) => c.name === "Development Expenses")?.id as string;
    expect(devexSubaccountOptions(FX_HIERARCHY, [], devCat).map((o) => o.label))
      .toEqual(["Permits / Building permit 21001", "Studies / Wind study 22001"]);
  });
  it("UT-ADCOST-016 offers only categories with an available sub-account", () => {
    const full = Array.from({ length: DEVEX_SUBACCOUNT_LIMIT }, (_, i) => fxDevexCost({
      id: `w${i}`, subaccountId: FX_HIERARCHY.subaccounts.find((s) => s.name === "WTG supply")?.id,
    }));
    expect(devexCategoryOptions(FX_HIERARCHY, full).map((o) => o.label)).toEqual(["Development Expenses"]);
  });
});

describe("DEVEX form", () => {
  const ctx = { countryName: "Germany", technology: TECHNOLOGY.wind, locale: EN } as const;
  it("UT-ADCOST-017 defaults the unit to EUR / PLN", () => {
    expect(emptyDevexForm("Germany").unit).toBe(COST_UNIT.eur);
    expect(emptyDevexForm("Poland").unit).toBe(COST_UNIT.pln);
  });
  it("UT-ADCOST-018 prefills an edit from the stored row", () => {
    const f = devexFormFromCost(fxDevexCost({ comment: "c" }), "Germany");
    expect(f).toMatchObject({ description: "Fees", cost: "1234567", unit: COST_UNIT.eurMw, costPaidBy: COST_PAID_BY.devCo, comment: "c" });
    expect(f.clusters).toEqual([true, false, true, false, true]);
    expect(devexFormFromCost(fxDevexCost({ costPaidBy: 952850000 }), "Germany").costPaidBy).toBeNull();
  });
  it("UT-ADCOST-019 validates cost as an integer within 0..100,000,000", () => {
    const v = (cost: string) => validateDevexForm({ ...emptyDevexForm("Germany"), cost }, ctx).cost;
    expect(v("")).toBeUndefined();
    expect(v("12.5")).toBe(MSG.costDecimals);
    expect(v("abc")).toBe(MSG.costDecimals);
    expect(v("100000001")).toBe(MSG.costRange);
    expect(v("-1")).toBe(MSG.costRange);
    expect(v("100000000")).toBeUndefined();
  });
  it("UT-ADCOST-020 rejects a WTG unit for PV with the currency in the message", () => {
    const form = { ...emptyDevexForm("Poland"), unit: COST_UNIT.plnWtg };
    expect(validateDevexForm(form, { countryName: "Poland", technology: TECHNOLOGY.pv }).unit).toBe("PLN/WTG only applicable for Wind");
    expect(validateDevexForm(form, { countryName: "Poland", technology: TECHNOLOGY.wind }).unit).toBeUndefined();
  });
  it("UT-ADCOST-021 category change clears sub-account and payer; sub-account sets category and payer default; unit clears cost", () => {
    const sub = FX_HIERARCHY.subaccounts.find((s) => s.name === "Building permit");
    const picked = withDevexSubaccount(emptyDevexForm("Germany"), sub?.id ?? null, FX_HIERARCHY, FX_PAYER_DEFAULTS);
    expect(picked.categoryId).toBe(sub?.categoryId);
    expect(picked.costPaidBy).toBe(COST_PAID_BY.devCo);
    expect(withDevexCategory(picked, "x")).toMatchObject({ categoryId: "x", subaccountId: null, costPaidBy: null });
    expect(withDevexUnit({ ...picked, cost: "5" }, COST_UNIT.eurMw).cost).toBe("");
  });
  it("UT-ADCOST-022 save gate: pristine edit is disabled; no cluster disables; complete form enables", () => {
    const pristine = devexFormFromCost(fxDevexCost(), "Germany");
    expect(canSaveDevex(pristine, pristine, {})).toBe(false);
    const changed = { ...pristine, description: "Fees 2" };
    expect(canSaveDevex(changed, pristine, {})).toBe(true);
    expect(canSaveDevex({ ...changed, clusters: [false, false, false, false, false] }, pristine, {})).toBe(false);
    expect(canSaveDevex({ ...changed, description: "   " }, pristine, {})).toBe(false);
    expect(canSaveDevex(changed, pristine, { cost: "x" })).toBe(false);
    expect(canSaveDevex({ ...changed, costPaidBy: null }, pristine, {})).toBe(false);
  });
  it("UT-ADCOST-023 builds the write and the panel title", () => {
    const form = devexFormFromCost(fxDevexCost(), "Germany");
    const w = devexWriteFromForm({ ...form, cost: "42" }, { id: "row", selection: germanyWind, hierarchy: FX_HIERARCHY, locale: EN });
    expect(w).toMatchObject({ id: "row", costAmount: 42, subaccountName: "Building permit", technology: TECHNOLOGY.wind, countryName: "Germany" });
    expect(devexPanelTitle(undefined, FX_HIERARCHY)).toBe("Add Cost");
    expect(devexPanelTitle(fxDevexCost(), FX_HIERARCHY)).toBe("Edit Cost : Building permit");
  });
  it("UT-ADCOST-024 isDirty is a deep compare", () => {
    expect(isDirty({ a: [1] }, { a: [1] })).toBe(false);
    expect(isDirty({ a: [1] }, { a: [2] })).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════ OPEX contracts ══ */

describe("Contract grouping and display", () => {
  it("UT-ADCOST-025 orders periods numerically, never as text (Period 10 after Period 2)", () => {
    const rows = [1, 10, 2, 3].map((p) => fxPeriod({ id: `p${p}`, period: p, description: `X - ${p}` }));
    const c = groupContracts(rows, CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(c.periods.map((r) => r.period)).toEqual([1, 2, 3, 10]);
    expect(c.head.period).toBe(1);
    expect(c.last.period).toBe(10);
    expect(c.highestPeriod).toBe(10);
  });
  it("UT-ADCOST-026 groups by sub-account id and type", () => {
    const groups = groupContracts(FX_OPEX_PERIODS, CONTRACT_TYPE.oAndM, opexNames);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.subaccountName).toBe("Operation & Maintenance");
  });
  it("UT-ADCOST-027 sums end dates cumulatively and starts a new period after all existing periods", () => {
    const c = llContract();
    expect(endDateText(c, c.periods[0] as never)).toBe("COD + 5 Years 0 Months");
    expect(endDateText(c, c.periods[1] as never)).toBe("COD + 7 Years 6 Months");
    expect(nextStartDateText(c)).toBe("COD + 7 Years 6 Months");
    expect(codText(30)).toBe("COD + 2 Years 6 Months");
  });
  it("UT-ADCOST-028 formats a Land Lease row", () => {
    const c = llContract();
    const v = toStandardOpexRow(c.head, c, new Map(FX_CURRENCIES.map((x) => [x.id, x.name])));
    expect(v).toMatchObject({
      years: "5 years", months: "0 months", currency: "Euro", fixCosts: "12,000", ofRevenues: "2.50 %",
      eurMwh: "1.25", eurMw: "300", eurWtg: "", aggregation: "SUM", inflation: "2.0 %",
      securedOrFrequency: "false", allocationOrExternal: "true", otp: "No", startDate: "Cluster 6: Operation",
    });
    const otp = toStandardOpexRow({ ...c.head, otp: { ...c.head.otp, dueDate1: "01/2030", amount1: 5 } }, c, new Map());
    expect(otp.otp).toBe("Yes");
  });
  it("UT-ADCOST-029 formats an O&M row (distribution frequency, external contract, inflation labels)", () => {
    const c = groupContracts(FX_OPEX_PERIODS, CONTRACT_TYPE.oAndM, opexNames)[0] as ContractView;
    const v = toStandardOpexRow(c.head, c, new Map());
    expect(v).toMatchObject({ securedOrFrequency: "3", allocationOrExternal: "false", otp: "", inflation: "Country Inflation" });
    expect(toStandardOpexRow({ ...c.head, useInflation: false }, c, new Map()).inflation).toBe("No");
  });
  it("UT-ADCOST-030 delete only on head and tail; head deletes the contract", () => {
    const rows = [1, 2, 3].map((p) => fxPeriod({ id: `p${p}`, period: p }));
    const c = groupContracts(rows, CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(canDeleteRow(c, c.periods[0] as never)).toBe(true);
    expect(canDeleteRow(c, c.periods[1] as never)).toBe(false);
    expect(canDeleteRow(c, c.periods[2] as never)).toBe(true);
    expect(deleteKind(c, c.periods[0] as never)).toBe("contract");
    expect(deleteKind(c, c.periods[2] as never)).toBe("period");
  });
  it("UT-ADCOST-031 next period is highest + 1 and Add Period stops at 10", () => {
    const c9 = groupContracts(Array.from({ length: 9 }, (_, i) => fxPeriod({ id: `a${i}`, period: i + 1 })), CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(nextPeriodNumber(c9)).toBe(10);
    expect(canAddPeriod(c9)).toBe(true);
    const c10 = groupContracts(Array.from({ length: 10 }, (_, i) => fxPeriod({ id: `b${i}`, period: i + 1 })), CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(canAddPeriod(c10)).toBe(false);
  });
  it("UT-ADCOST-032 after deleting the last period the new highest becomes last, so Add Period stays available", () => {
    const rows = [1, 2, 3].map((p) => fxPeriod({ id: `p${p}`, period: p }));
    const c = groupContracts(rows.slice(0, 2), CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(c.last.period).toBe(2);
    expect(canAddPeriod(c)).toBe(true);
  });
});

describe("Add Contract Type menu", () => {
  it("UT-ADCOST-033 lists land-lease sub-accounts and disables existing contracts", () => {
    const items = contractMenu(CONTRACT_TYPE.landLease, FX_LAND_LEASE_SUBACCOUNTS, FX_OPEX_SUBACCOUNTS, FX_OPEX_PERIODS);
    expect(items.map((i) => [i.label, i.disabled])).toEqual([["Land Lease WTG", true], ["Land Lease Access", false]]);
  });
  it("UT-ADCOST-034 splits O&M and Other, relabelling TCMA and E&CM", () => {
    expect(contractMenu(CONTRACT_TYPE.oAndM, [], FX_OPEX_SUBACCOUNTS, []).map((i) => i.label)).toEqual(["Operation & Maintenance"]);
    expect(contractMenu(CONTRACT_TYPE.other, [], FX_OPEX_SUBACCOUNTS, []).map((i) => i.label)).toEqual(["TCMA", "E&CM", "Insurance"]);
    expect(otherOpexLabel("Some tcma thing")).toBe("TCMA");
  });
});

describe("Contract panel", () => {
  const base = (over: Partial<OpexPanelContext>): OpexPanelContext => ({
    mode: "newContract", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "Sub", order: 2 },
    decimalSeparator: ".", ...over,
  });
  it("UT-ADCOST-035 titles per mode", () => {
    expect(opexPanelTitle("newContract", "S")).toBe("Add Contract Type : S");
    expect(opexPanelTitle("editContract", "S")).toBe("Edit Contract : S");
    expect(opexPanelTitle("editPeriod", "S")).toBe("Edit Period : S");
    expect(opexPanelTitle("addPeriod", "S")).toBe("Add Period : S");
    expect(editModeFor(fxPeriod({ period: 1 }))).toBe("editContract");
    expect(editModeFor(fxPeriod({ period: 3 }))).toBe("editPeriod");
  });
  it("UT-ADCOST-036 contract-level fields are editable only for a new contract or Period 1", () => {
    expect(isContractLevelEditable("newContract")).toBe(true);
    expect(isContractLevelEditable("editContract")).toBe(true);
    expect(isContractLevelEditable("editPeriod")).toBe(false);
    expect(isContractLevelEditable("addPeriod")).toBe(false);
  });
  it("UT-ADCOST-037 new contract descriptions per category", () => {
    expect(newContractDescription(CONTRACT_TYPE.oAndM, "X")).toBe("Standard X");
    expect(newContractDescription(CONTRACT_TYPE.other, "X")).toBe("Standard Opex X");
    expect(newContractDescription(CONTRACT_TYPE.landLease, "X")).toBe("Standard LL X");
  });
  it("UT-ADCOST-038 new Land Lease defaults: inflation off, SUM, no frequency, empty figures", () => {
    const f = opexStandardDefaults(base({}));
    expect(f).toMatchObject({
      description: "Standard LL Sub", startDate: "Cluster 6: Operation", years: null, months: null,
      fixCosts: "", aggregation: AGGREGATION.sum, distributionFrequency: null, useInflation: false, useCountryInflation: false,
    });
    const om = opexStandardDefaults(base({ type: CONTRACT_TYPE.oAndM }));
    expect(om.useInflation).toBe(true);
    expect(om.useCountryInflation).toBe(true);
    expect(om.externalContract).toBe(true);
  });
  it("UT-ADCOST-039 TCMA rule for External Contract matches case-insensitively", () => {
    expect(defaultExternalContract(CONTRACT_TYPE.other, { name: "TCMA", order: 1 })).toBe(false);
    expect(defaultExternalContract(CONTRACT_TYPE.other, { name: "TCMA", order: 2 })).toBe(true);
    expect(defaultExternalContract(CONTRACT_TYPE.oAndM, { name: "TCMA", order: 1 })).toBe(true);
    expect(opexStandardDefaults(base({ type: CONTRACT_TYPE.other, subaccount: { id: "t", name: "tcma", order: 1 } })).externalContract).toBe(false);
  });
  it("UT-ADCOST-040 edit defaults format stored values; External Contract keeps a stored No", () => {
    const row = fxPeriod({ type: CONTRACT_TYPE.oAndM, fixCosts: 12000, ofRevenues: 2.5, eurMwh: 3, eurMw: 1.25, externalContract: false, inflationProfile: 2 });
    const c = groupContracts([row], CONTRACT_TYPE.oAndM, new Map())[0];
    const f = opexStandardDefaults(base({ mode: "editContract", type: CONTRACT_TYPE.oAndM, row, contract: c }));
    expect(f).toMatchObject({ fixCosts: "12000.00", ofRevenues: "2.5", eurMwh: "3", eurMw: "1.25", externalContract: false, customInflation: "2.0", years: 5, months: 0 });
    expect(opexStandardDefaults(base({ mode: "editContract", row, contract: c, decimalSeparator: "," })).fixCosts).toBe("12000,00");
  });
  it("UT-ADCOST-041 months default to 0 once a year is stored or chosen", () => {
    const row = fxPeriod({ years: 3, months: undefined });
    expect(opexStandardDefaults(base({ mode: "editContract", row })).months).toBe(0);
    const f = opexStandardDefaults(base({}));
    expect(withYears(f, 4)).toMatchObject({ years: 4, months: 0 });
  });
  it("UT-ADCOST-042 add-period defaults: description suffix, COD start, empty figures, inflation inherited", () => {
    const c = llContract();
    const ctx = base({ mode: "addPeriod", contract: c });
    const f = opexStandardDefaults(ctx);
    expect(f).toMatchObject({ description: "Standard LL Land Lease WTG - 3", startDate: "COD + 7 Years 6 Months", fixCosts: "", years: null, distributionFrequency: null, useInflation: true, useCountryInflation: false, customInflation: "2.0" });
    expect(hiddenValues(ctx).otp).toEqual(c.last.otp);
  });
  it("UT-ADCOST-043 inflation off resets the dependent fields to their defaults", () => {
    const d = opexStandardDefaults(base({ type: CONTRACT_TYPE.oAndM }));
    const changed = { ...d, useCountryInflation: false, customInflation: "5" };
    expect(withInflation(changed, false, d)).toMatchObject({ useInflation: false, useCountryInflation: true, customInflation: "" });
    expect(withCountryInflation(changed, true, d)).toMatchObject({ useCountryInflation: true, customInflation: "" });
  });
});

describe("Contract validation", () => {
  const hidden = { thresholdType: null, thresholdIndividual: null, otp: { dueDate1: null, amount1: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null }, storedInflationProfile: null, pristineCustomInflation: "" };
  const valid: OpexForm = {
    description: "Standard LL X", startDate: "Cluster 6: Operation", years: 5, months: 0, fixCosts: "100",
    ofRevenues: "", eurMwh: "", eurMw: "", eurWtg: "", aggregation: AGGREGATION.sum, distributionFrequency: 3,
    useInflation: false, useCountryInflation: false, area: "", customInflation: "", externalContract: false,
  };
  const v = (over: Partial<OpexForm>, locale = EN) => validateOpexForm({ ...valid, ...over }, { mode: "newContract", hidden, locale });

  it.each([
    ["fixCosts", "1.234", MSG.fixCostsDecimals],
    ["fixCosts", "1000000000.01", MSG.fixCostsRange],
    ["fixCosts", "-1", MSG.fixCostsRange],
    ["ofRevenues", "1.234", MSG.revenueDecimals],
    ["ofRevenues", "10000.5", MSG.revenueRange],
    ["eurMwh", "abc", MSG.perUnitDecimals],
    ["eurMw", "100000000.5", MSG.perUnitRange],
    ["eurWtg", "1.999", MSG.perUnitDecimals],
  ] as const)("UT-ADCOST-044 %s = %s → %s", (field, value, message) => {
    expect(v({ [field]: value }).errors[field]).toBe(message);
  });
  it("UT-ADCOST-045 accepts the maxima and two decimals", () => {
    expect(v({ fixCosts: "1000000000", ofRevenues: "10000", eurMwh: "100000000", eurMw: "0.25", eurWtg: "7" }).errors).toEqual({});
  });
  it("UT-ADCOST-046 follows the browser decimal separator", () => {
    expect(v({ fixCosts: "1,5" }, DE).errors.fixCosts).toBeUndefined();
    expect(v({ fixCosts: "1,5" }, EN).errors.fixCosts).toBe(MSG.fixCostsDecimals);
  });
  it("UT-ADCOST-047 rejects 0 years 0 months", () => {
    expect(v({ years: 0, months: 0 }).errors.duration).toBe(MSG.durationZero);
    expect(v({ years: 0, months: 1 }).errors.duration).toBeUndefined();
  });
  it("UT-ADCOST-048 validates the custom inflation only when the country profile is off", () => {
    expect(v({ useInflation: true, customInflation: "1.25" }).errors.customInflation).toBe(MSG.inflationDecimals);
    expect(v({ useInflation: true, customInflation: "100.5" }).errors.customInflation).toBe(MSG.inflationRange);
    expect(v({ useInflation: true, useCountryInflation: true, customInflation: "abc" }).errors.customInflation).toBeUndefined();
  });
  it("UT-ADCOST-049 shows the commercial-figure hint when every figure is blank; OTP 1 counts only for new/Period 1", () => {
    expect(v({ fixCosts: "" }).hint).toBe(true);
    const otp = { ...hidden, otp: { ...hidden.otp, amount1: 5 } };
    expect(validateOpexForm({ ...valid, fixCosts: "" }, { mode: "editContract", hidden: otp }).hint).toBe(false);
    expect(validateOpexForm({ ...valid, fixCosts: "" }, { mode: "editPeriod", hidden: otp }).hint).toBe(true);
  });
  it("UT-ADCOST-050 save gate", () => {
    const pristine = { ...valid, fixCosts: "" };
    const gate = (form: OpexForm, countryName = "Germany") =>
      canSaveOpex(form, pristine, validateOpexForm(form, { mode: "newContract", hidden }), { countryName, mode: "newContract" });
    expect(gate(valid)).toBe(true);
    expect(gate(pristine)).toBe(false);
    expect(gate({ ...valid, distributionFrequency: null })).toBe(false);
    expect(gate({ ...valid, years: null })).toBe(false);
    expect(gate({ ...valid, aggregation: null })).toBe(false);
    expect(gate({ ...valid, useInflation: true, useCountryInflation: false, customInflation: "" })).toBe(false);
    expect(gate({ ...valid, useInflation: true, useCountryInflation: true, area: "" }, "Italy")).toBe(false);
    expect(gate({ ...valid, useInflation: true, useCountryInflation: true, area: "North" }, "Italy")).toBe(true);
  });
  it("UT-ADCOST-051 add period is blocked on a Period 10 contract", () => {
    const c10 = groupContracts(Array.from({ length: 10 }, (_, i) => fxPeriod({ id: `b${i}`, period: i + 1 })), CONTRACT_TYPE.landLease, names)[0];
    const pristine = { ...valid, fixCosts: "" };
    expect(canSaveOpex(valid, pristine, { errors: {}, hint: false }, { countryName: "Germany", mode: "addPeriod", contract: c10 })).toBe(false);
  });
});

describe("Contract write", () => {
  const hidden = { thresholdType: 952850002, thresholdIndividual: 7, otp: { dueDate1: "01/2030", amount1: 9, dueDate2: null, amount2: null, dueDate3: null, amount3: null }, storedInflationProfile: null, pristineCustomInflation: "" };
  const form: OpexForm = {
    description: "Standard X", startDate: "Cluster 6: Operation", years: 5, months: 6, fixCosts: "1,5",
    ofRevenues: "", eurMwh: "2", eurMw: "", eurWtg: "", aggregation: AGGREGATION.max, distributionFrequency: 6,
    useInflation: true, useCountryInflation: false, area: "", customInflation: "2,5", externalContract: false,
  };
  it("UT-ADCOST-052 new O&M contract: Period 1, last, parsed numbers, fixed values, external contract written", () => {
    const panel: OpexPanelContext = { mode: "newContract", type: CONTRACT_TYPE.oAndM, subaccount: { id: "s", name: "S", order: 1 }, decimalSeparator: "," };
    const w = opexWriteFromForm(form, { panel, selection: germanyWind, currencies: FX_CURRENCIES, hidden, locale: DE });
    expect(w).toMatchObject({ mode: "new", period: 1, isLastPeriod: true, currencyId: FX_CURRENCIES[0]?.id });
    expect(w.fields).toMatchObject({
      fixCosts: 1.5, ofRevenues: null, eurMwh: 2, inflationProfile: 2.5, area: null, externalContract: false,
      secured: false, allWtgAllocated: true, alignWithProjectDuration: false, threshold: false,
      thresholdType: 952850002, thresholdIndividual: 7,
    });
    expect(w.fields.otp.amount1).toBe(9);
  });
  it("UT-ADCOST-053 Land Lease does not write External Contract; country inflation nulls the profile", () => {
    const panel: OpexPanelContext = { mode: "newContract", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 1 }, decimalSeparator: "," };
    const w = opexWriteFromForm({ ...form, useCountryInflation: true }, { panel, selection: { ...germanyWind, countryName: "Poland" }, currencies: FX_CURRENCIES, hidden, locale: DE });
    expect(w.fields.externalContract).toBeUndefined();
    expect(w.fields.inflationProfile).toBeNull();
    expect(w.currencyId).toBe(FX_CURRENCIES[1]?.id);
  });
  it("UT-ADCOST-054 add period uses highest + 1; edit keeps the row's period and flag", () => {
    const c = llContract();
    const add = opexWriteFromForm(form, { panel: { mode: "addPeriod", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 0 }, contract: c, decimalSeparator: "." }, selection: germanyWind, currencies: [], hidden, locale: EN });
    expect(add).toMatchObject({ mode: "addPeriod", period: 3, isLastPeriod: true });
    const edit = opexWriteFromForm(form, { panel: { mode: "editContract", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 0 }, row: c.head, contract: c, decimalSeparator: "." }, selection: germanyWind, currencies: [], hidden, locale: EN });
    expect(edit).toMatchObject({ mode: "edit", id: c.head.id, period: 1, isLastPeriod: false });
  });
});

describe("Canvas parity fixes", () => {
  const hidden = { thresholdType: null, thresholdIndividual: null, otp: { dueDate1: null, amount1: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null }, storedInflationProfile: null, pristineCustomInflation: "" };
  const valid: OpexForm = {
    description: "Standard LL X", startDate: "Cluster 6: Operation", years: 5, months: 0, fixCosts: "100",
    ofRevenues: "", eurMwh: "", eurMw: "", eurWtg: "", aggregation: AGGREGATION.sum, distributionFrequency: 3,
    useInflation: true, useCountryInflation: false, area: "", customInflation: "", externalContract: false,
  };
  const v = (over: Partial<OpexForm>, locale = EN) => validateOpexForm({ ...valid, ...over }, { mode: "newContract", hidden, locale });

  it("UT-ADCOST-055 a trailing separator is the whole number — no misleading range error (canvas Value('1.') = 1)", () => {
    expect(v({ fixCosts: "1.", ofRevenues: "2.", eurMwh: "3.", eurMw: "4.", eurWtg: "5.", customInflation: "1." }).errors).toEqual({});
    expect(v({ fixCosts: "1,", customInflation: "2," }, DE).errors).toEqual({});
    // Out of range with a trailing separator still gets the range message; malformed still the decimals one.
    expect(v({ fixCosts: "1000000001." }).errors.fixCosts).toBe(MSG.fixCostsRange);
    expect(v({ customInflation: "101." }).errors.customInflation).toBe(MSG.inflationRange);
    expect(v({ fixCosts: "1.." }).errors.fixCosts).toBe(MSG.fixCostsDecimals);
  });
  it("UT-ADCOST-056 '1.' is written as 1", () => {
    const panel: OpexPanelContext = { mode: "newContract", type: CONTRACT_TYPE.oAndM, subaccount: { id: "s", name: "S", order: 1 }, decimalSeparator: "." };
    const w = opexWriteFromForm({ ...valid, fixCosts: "12.", customInflation: "3." }, { panel, selection: germanyWind, currencies: FX_CURRENCIES, hidden, locale: EN });
    expect(w.fields.fixCosts).toBe(12);
    expect(w.fields.inflationProfile).toBe(3);
  });

  it("UT-ADCOST-057 a deactivated sub-account falls back to the stored lookup name, then the contract description", () => {
    const stored = fxPeriod({ id: "s1", landLeaseSubaccountId: "deactivated", subaccountLabel: "Old lease", description: "Standard LL Old lease" });
    const c1 = groupContracts([stored], CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(c1.subaccountName).toBe("Old lease");
    expect(opexPanelTitle("editContract", c1.subaccountName)).toBe("Edit Contract : Old lease");
    const bare = fxPeriod({ id: "s2", landLeaseSubaccountId: "deactivated", description: "Standard LL Old lease" });
    const c2 = groupContracts([bare], CONTRACT_TYPE.landLease, names)[0] as ContractView;
    expect(c2.subaccountName).toBe("Standard LL Old lease");
    expect(opexPanelTitle("addPeriod", c2.subaccountName)).not.toMatch(/: $/);
    // An active sub-account still shows its current name.
    expect(llContract().subaccountName).toBe("Land Lease WTG");
  });

  it("UT-ADCOST-058 hidden inactive rows of the contract block Add Period and tail Delete with a reason; head Delete stays", () => {
    const sub = FX_LAND_LEASE_SUBACCOUNTS[0]?.id;
    const inactive = [{ type: CONTRACT_TYPE.landLease, period: 3, landLeaseSubaccountId: sub, opexSubaccountId: undefined }];
    const c = groupContracts(FX_OPEX_PERIODS, CONTRACT_TYPE.landLease, names, inactive)[0] as ContractView;
    expect(c.inactivePeriods).toEqual([3]);
    expect(inactiveRowsReason(c)).toBe(MSG.inactivePeriods([3]));
    expect(MSG.inactivePeriods([3])).toMatch(/^This contract has an inactive Period 3 that is not shown here/);
    expect(MSG.inactivePeriods([3, 4])).toMatch(/inactive periods \(Period 3, Period 4\) that are not shown/);
    expect(canAddPeriod(c)).toBe(false);
    expect(canDeletePeriodRow(c, c.last)).toBe(false);
    expect(canDeletePeriodRow(c, c.head)).toBe(true);
    const pristine = { ...valid, fixCosts: "" };
    expect(canSaveOpex(valid, pristine, { errors: {}, hint: false }, { countryName: "Germany", mode: "addPeriod", contract: c })).toBe(false);
  });
  it("UT-ADCOST-059 inactive rows of another type or sub-account do not block", () => {
    const c = groupContracts(FX_OPEX_PERIODS, CONTRACT_TYPE.landLease, names, [
      { type: CONTRACT_TYPE.oAndM, period: 3, landLeaseSubaccountId: FX_LAND_LEASE_SUBACCOUNTS[0]?.id, opexSubaccountId: undefined },
      { type: CONTRACT_TYPE.landLease, period: 2, landLeaseSubaccountId: "other", opexSubaccountId: undefined },
    ])[0] as ContractView;
    expect(c.inactivePeriods).toBeUndefined();
    expect(inactiveRowsReason(c)).toBeUndefined();
    expect(canAddPeriod(c)).toBe(true);
    expect(canDeletePeriodRow(c, c.last)).toBe(true);
  });
});

describe("Percent fields: the stored value IS the percent — grid, panel and store agree", () => {
  const c = llContract();
  const row = (ofRevenues: number, inflationProfile: number) => ({ ...c.head, ofRevenues, inflationProfile, useInflation: true, useCountryInflation: false });

  it("UT-ADCOST-060 the grid shows the stored percent as-is with the canvas decimals (never ×100)", () => {
    expect(PERCENT_DISPLAY).toBe("stored");
    expect(fmtStoredPercent(5, "revenue")).toBe("5.00 %");
    expect(fmtStoredPercent(1234.5, "revenue")).toBe("1,234.50 %");
    expect(fmtStoredPercent(0, "revenue")).toBe("0.00 %");
    expect(fmtStoredPercent(2, "inflation")).toBe("2.0 %");
    expect(fmtStoredPercent(0.5, "inflation")).toBe("0.5 %");
    expect(fmtStoredPercent(undefined, "inflation")).toBe("");
    const v = toStandardOpexRow(row(5, 2), c, new Map());
    expect(v.ofRevenues).toBe("5.00 %");
    expect(v.inflation).toBe("2.0 %");
    expect(fmtGridPercent(2, "inflation")).toBe("2.0 %");
  });

  it("UT-ADCOST-061 matches the project screens' formatters for the same stored value", () => {
    for (const n of [0, 0.5, 2, 2.5, 12.34, 1234.5]) {
      expect(fmtStoredPercent(n, "revenue")).toBe(formatRevenuePercent(n));
      expect(fmtStoredPercent(n, "inflation")).toBe(formatOneDecimalPercent(n));
    }
  });

  it("UT-ADCOST-062 the old canvas ×100 formatter is kept only behind PERCENT_DISPLAY", () => {
    expect(fmtCanvasPercent(0.05, "revenue")).toBe("5.00 %");
    expect(fmtCanvasPercent(0.005, "inflation")).toBe(".5 %");
  });

  it.each([
    [5, 2, "5", "2.0", "5.00 %", "2.0 %"],
    [12.5, 2.5, "12.5", "2.5", "12.50 %", "2.5 %"],
    [0.05, 0.02, "0.05", "0.02", "0.05 %", "0.0 %"],
  ])("UT-ADCOST-063 stored %s / %s → panel input, grid cell and written value are the same number", (rev, infl, revText, inflText, revCell, inflCell) => {
    const panel: OpexPanelContext = {
      mode: "editContract", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 0 },
      row: row(rev, infl), contract: c, decimalSeparator: ".",
    };
    const form = opexStandardDefaults(panel);
    expect(form.ofRevenues).toBe(revText);
    expect(form.customInflation).toBe(inflText);
    const cell = toStandardOpexRow(row(rev, infl), c, new Map());
    expect(cell.ofRevenues).toBe(revCell);
    expect(cell.inflation).toBe(inflCell);
    const w = opexWriteFromForm(form, { panel, selection: germanyWind, currencies: [], hidden: hiddenValues(panel), locale: EN });
    expect(w.fields.ofRevenues).toBe(rev);
    expect(w.fields.inflationProfile).toBe(infl);
    expect(w.fields.inflationProfileUnchanged).toBe(true);
  });

  it("UT-ADCOST-064 a user entry of 5 / 2.5 is stored as 5 / 2.5 and shown in the grid as 5.00 % / 2.5 %", () => {
    const panel: OpexPanelContext = { mode: "newContract", type: CONTRACT_TYPE.oAndM, subaccount: { id: "s", name: "S", order: 2 }, decimalSeparator: "." };
    const form = { ...opexStandardDefaults(panel), ofRevenues: "5", useCountryInflation: false, customInflation: "2.5" };
    const w = opexWriteFromForm(form, { panel, selection: germanyWind, currencies: [], hidden: hiddenValues(panel), locale: EN });
    expect(w.fields.ofRevenues).toBe(5);
    expect(w.fields.inflationProfile).toBe(2.5);
    expect(fmtGridPercent(w.fields.ofRevenues ?? undefined, "revenue")).toBe("5.00 %");
    expect(fmtGridPercent(w.fields.inflationProfile ?? undefined, "inflation")).toBe("2.5 %");
  });
});

describe("DEVEX inactive sub-account", () => {
  const inactive = fxDevexCost({ subaccountId: "deactivated-sub", description: "Standard Old permit - Fees" });
  const ctx = { countryName: "Germany", technology: TECHNOLOGY.wind, locale: EN, hierarchy: FX_HIERARCHY };

  it("UT-ADCOST-065 flags the sub-account and blocks Save with a clear message", () => {
    const pristine = devexFormFromCost(inactive, "Germany");
    const changed = { ...pristine, description: "Fees 2" };
    expect(isInactiveSubaccount(changed, FX_HIERARCHY)).toBe(true);
    const errors = validateDevexForm(changed, ctx);
    expect(errors.subaccount).toBe(MSG.subaccountInactive);
    expect(MSG.subaccountInactive).toBe("The sub-account of this cost is inactive; choose an active sub-account.");
    expect(canSaveDevex(changed, pristine, errors)).toBe(false);
  });

  it("UT-ADCOST-066 picking an active sub-account clears the error and enables Save", () => {
    const pristine = devexFormFromCost(inactive, "Germany");
    const sub = FX_HIERARCHY.subaccounts.find((s) => s.name === "Wind study");
    const fixed = withDevexSubaccount(pristine, sub?.id ?? null, FX_HIERARCHY, new Map([[sub?.id ?? "", COST_PAID_BY.spv]]));
    const errors = validateDevexForm(fixed, ctx);
    expect(errors.subaccount).toBeUndefined();
    expect(canSaveDevex(fixed, pristine, errors)).toBe(true);
  });

  it("UT-ADCOST-067 never builds the broken name / description: the write throws instead", () => {
    const form = { ...devexFormFromCost(inactive, "Germany"), description: "Fees 2" };
    expect(() => devexWriteFromForm(form, { id: inactive.id, selection: germanyWind, hierarchy: FX_HIERARCHY, locale: EN }))
      .toThrow(DevexRuleError);
    expect(errorText(new DevexRuleError(MSG.subaccountInactive), "F.", "a")).toBe(MSG.subaccountInactive);
  });

  it("UT-ADCOST-068 the panel title falls back to the stored description", () => {
    expect(devexPanelTitle(inactive, FX_HIERARCHY)).toBe("Edit Cost : Standard Old permit - Fees");
  });
});

describe("Last-period flag on edit", () => {
  const rows = [1, 2, 3].map((p) => fxPeriod({ id: `p${p}`, period: p, isLastPeriodFlag: p === 2 }));
  const c = groupContracts(rows, CONTRACT_TYPE.landLease, names)[0] as ContractView;
  const edit = (row: (typeof rows)[number]) => {
    const panel: OpexPanelContext = { mode: editModeFor(row), type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 0 }, row, contract: c, decimalSeparator: "." };
    return opexWriteFromForm({ ...opexStandardDefaults(panel), fixCosts: "1" }, { panel, selection: germanyWind, currencies: [], hidden: hiddenValues(panel), locale: EN });
  };
  it("UT-ADCOST-069 a middle period stored with a stale `true` is written as not last", () => {
    expect(edit(rows[1] as never).isLastPeriod).toBe(false);
  });
  it("UT-ADCOST-070 the computed tail is written as last even when its stored flag is false", () => {
    expect(edit(rows[2] as never).isLastPeriod).toBe(true);
    expect(edit(rows[0] as never).isLastPeriod).toBe(false);
  });
});

describe("Italy Area and untouched values", () => {
  const legacy = fxPeriod({ id: "it1", period: 1, useInflation: true, useCountryInflation: true, inflationProfile: undefined, inflationArea: "Centre - North", fixCosts: 1234.567 });
  const c = groupContracts([legacy], CONTRACT_TYPE.landLease, names)[0] as ContractView;
  const panel: OpexPanelContext = { mode: "editContract", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 0 }, row: legacy, contract: c, decimalSeparator: "." };
  const italy: CostSelection = { ...germanyWind, countryName: "Italy" };

  it("UT-ADCOST-071 prefills the Area and marks it unchanged on an unrelated edit (no area column written)", () => {
    const form = opexStandardDefaults(panel);
    expect(form.area).toBe("Centre - North");
    const w = opexWriteFromForm({ ...form, eurMw: "7" }, { panel, selection: italy, currencies: FX_CURRENCIES, hidden: hiddenValues(panel), locale: EN });
    expect(w.fields.areaUnchanged).toBe(true);
    expect(w.fields.area).toBe("Centre - North");
  });

  it("UT-ADCOST-072 a changed Area is written", () => {
    const form = { ...opexStandardDefaults(panel), area: "South" };
    const w = opexWriteFromForm(form, { panel, selection: italy, currencies: FX_CURRENCIES, hidden: hiddenValues(panel), locale: EN });
    expect(w.fields.areaUnchanged).toBe(false);
    expect(w.fields.area).toBe("South");
  });

  it("UT-ADCOST-073 new contracts and added periods always write the Area", () => {
    const add: OpexPanelContext = { ...panel, mode: "addPeriod", row: undefined };
    const w = opexWriteFromForm({ ...opexStandardDefaults(add), years: 1 }, { panel: add, selection: italy, currencies: FX_CURRENCIES, hidden: hiddenValues(add), locale: EN });
    expect(w.fields.areaUnchanged).toBe(false);
    expect(w.fields.area).toBe("Centre - North");
  });

  it("UT-ADCOST-074 Italy with country inflation needs an Area to save", () => {
    const pristine = opexStandardDefaults(panel);
    const form = { ...pristine, area: "", fixCosts: "5" };
    const hidden = hiddenValues(panel);
    const v = validateOpexForm(form, { mode: panel.mode, hidden, locale: EN });
    expect(canSaveOpex(form, pristine, v, { countryName: "Italy", mode: panel.mode, contract: c })).toBe(false);
    expect(canSaveOpex({ ...form, area: "South" }, pristine, v, { countryName: "Italy", mode: panel.mode, contract: c })).toBe(true);
  });

  it("UT-ADCOST-075 an untouched figure is written as the exact stored number; a changed one is parsed", () => {
    const form = opexStandardDefaults(panel);
    expect(form.fixCosts).toBe("1234.57");
    const hidden = hiddenValues(panel);
    const same = opexWriteFromForm({ ...form, eurMw: "7" }, { panel, selection: italy, currencies: FX_CURRENCIES, hidden, locale: EN });
    expect(same.fields.fixCosts).toBe(1234.567);
    const changed = opexWriteFromForm({ ...form, fixCosts: "10" }, { panel, selection: italy, currencies: FX_CURRENCIES, hidden, locale: EN });
    expect(changed.fields.fixCosts).toBe(10);
  });

  it("UT-ADCOST-076 comma locale end to end: prefill, validation and write", () => {
    const de: OpexPanelContext = { ...panel, decimalSeparator: "," };
    const form = opexStandardDefaults(de);
    expect(form.fixCosts).toBe("1234,57");
    const edited = { ...form, eurMwh: "2,5" };
    const hidden = hiddenValues(de);
    expect(validateOpexForm(edited, { mode: de.mode, hidden, locale: DE }).errors).toEqual({});
    const w = opexWriteFromForm(edited, { panel: de, selection: italy, currencies: FX_CURRENCIES, hidden, locale: DE });
    expect(w.fields.eurMwh).toBe(2.5);
    expect(w.fields.fixCosts).toBe(1234.567);
  });
});

describe("Missing contract currency", () => {
  it("UT-ADCOST-077 reports the missing currency and blocks Save", () => {
    expect(currencyIssue(FX_CURRENCIES, "Poland")).toBeUndefined();
    expect(currencyIssue([FX_CURRENCIES[0] as never], "Poland")).toBe(MSG.currencyMissing("PLN"));
    const valid: OpexForm = {
      description: "Standard X", startDate: "Cluster 6: Operation", years: 5, months: 0, fixCosts: "100",
      ofRevenues: "", eurMwh: "", eurMw: "", eurWtg: "", aggregation: AGGREGATION.sum, distributionFrequency: 3,
      useInflation: false, useCountryInflation: false, area: "", customInflation: "", externalContract: false,
    };
    const pristine = { ...valid, fixCosts: "" };
    const ok = { errors: {}, hint: false };
    expect(canSaveOpex(valid, pristine, ok, { countryName: "Poland", mode: "newContract", currencies: FX_CURRENCIES })).toBe(true);
    expect(canSaveOpex(valid, pristine, ok, { countryName: "Poland", mode: "newContract", currencies: [FX_CURRENCIES[0] as never] })).toBe(false);
  });
});

describe("Inflation precision is never lost (deviation from canvas `Text(x, \"0.0\")`)", () => {
  const c = llContract();
  const stored = { ...c.head, inflationProfile: 0.02, useInflation: true, useCountryInflation: false };
  const panel: OpexPanelContext = {
    mode: "editContract", type: CONTRACT_TYPE.landLease, subaccount: { id: "s", name: "S", order: 0 },
    row: stored, contract: c, decimalSeparator: ".",
  };

  it("UT-ADCOST-078 a stored 0.02 survives an unrelated edit + save unchanged", () => {
    const hidden = hiddenValues(panel);
    const pristine = opexStandardDefaults(panel);
    const form = { ...pristine, fixCosts: "99.00" };
    const v = validateOpexForm(form, { mode: panel.mode, hidden, locale: EN });
    expect(v.errors.customInflation).toBeUndefined();
    expect(canSaveOpex(form, pristine, v, { countryName: "Germany", mode: panel.mode, contract: c })).toBe(true);
    const w = opexWriteFromForm(form, { panel, selection: germanyWind, currencies: [], hidden, locale: EN });
    expect(w.fields.inflationProfile).toBe(0.02);
    expect(w.fields.inflationProfileUnchanged).toBe(true);
  });

  it("UT-ADCOST-079 a changed value is validated (1 dp) and sent", () => {
    const hidden = hiddenValues(panel);
    const form = { ...opexStandardDefaults(panel), customInflation: "0.03" };
    expect(validateOpexForm(form, { mode: panel.mode, hidden, locale: EN }).errors.customInflation).toBe(MSG.inflationDecimals);
    const w = opexWriteFromForm({ ...form, customInflation: "3.5" }, { panel, selection: germanyWind, currencies: [], hidden, locale: EN });
    expect(w.fields.inflationProfile).toBe(3.5);
    expect(w.fields.inflationProfileUnchanged).toBe(false);
  });

  it("UT-ADCOST-080 add period inherits the exact stored value", () => {
    const rows = [stored];
    const contract = groupContracts(rows, CONTRACT_TYPE.landLease, names)[0] as ContractView;
    const add: OpexPanelContext = { ...panel, mode: "addPeriod", row: undefined, contract };
    const hidden = hiddenValues(add);
    const w = opexWriteFromForm({ ...opexStandardDefaults(add), years: 1 }, { panel: add, selection: germanyWind, currencies: [], hidden, locale: EN });
    expect(w.fields.inflationProfile).toBe(0.02);
  });
});

describe("Dialogs and errors", () => {
  it("UT-ADCOST-081 uses the exact dialog texts", () => {
    expect(deleteDialogText("devex", "D")).toEqual({ title: "Delete Cost", description: 'Are you sure you want to delete the "D" cost?' });
    expect(deleteDialogText("contract", "D").description).toBe('Are you sure you want to delete the "D" contract and all related periods?');
    expect(deleteDialogText("period", "D")).toEqual({ title: "Delete Period", description: 'Are you sure you want to delete the "D" period?' });
  });
  it("UT-ADCOST-082 maps errors to clean sentences, never raw JSON", () => {
    expect(errorText(new DataError("x", { message: "denied" }, 403), "P", "do it")).toMatch(/permission to do it/);
    expect(errorText(new DataError("x", { message: "Plug-in says no" }, 400), "Failed.", "a")).toBe("Failed. Plug-in says no.");
    // Shared wording: a 5xx gets the shared server hint (still no raw body).
    expect(errorText(new DataError("x", { error: { code: 1 } }, 500), "Failed.", "a")).toBe(`Failed. ${ERROR_HINT.server}`);
    expect(errorText(new DataError("x", '{"error":{"message":"raw"}}', 500), "Failed.", "a")).toBe(`Failed. ${ERROR_HINT.server}`);
    expect(errorText(new DataError("x", '{"error":{"message":"raw"}}', 400), "Failed.", "a")).toBe("Failed. Please try again.");
    expect(errorText(new ContractDeleteError(2, 4, null), "Failed.", "a")).toMatch(/2 of 4 row\(s\) were deleted/);
    expect(errorText(new OpexRuleError("Rule."), "F", "a")).toBe("Rule.");
    expect(errorText(new OpexFollowUpError("Follow.", "id", null), "F", "a")).toBe("Follow.");
    expect(errorText(new DevexRuleError("Devex."), "F", "a")).toBe("Devex.");
    // An edit of a row deleted meanwhile (guarded update, nothing written) → the shared "no longer exists" hint.
    expect(errorText(new RecordGoneError("update standard cost", "vsb_devexcapexstandardassumptionses", "x"), "Failed.", "a")).toBe(`Failed. ${ERROR_HINT.notFound}`);
    // Shared bulk wording (ERROR_HINT.partial / nothingSaved).
    expect(errorText(new RowWriteError(null, true), "F.", "a")).toBe(`F. ${ERROR_HINT.partial}`);
    expect(errorText(new RowWriteError(null, false), "F.", "a")).toBe(`F. ${ERROR_HINT.nothingSaved}`);
    // A business error is shown as-is even when its cause is a 403 (checked first, as before).
    expect(errorText(new OpexFollowUpError("Follow.", "id", new DataError("x", {}, 403)), "F", "a")).toBe("Follow.");
  });
  it("UT-ADCOST-083 a partial contract delete reports any flag inconsistency left after the repair", () => {
    const repaired = errorText(new ContractDeleteError(1, 3, null), "Failed.", "a");
    expect(repaired).not.toMatch(/inconsistent/);
    const broken = errorText(new ContractDeleteError(1, 3, null, "No period is marked as last; Period 2 should be."), "Failed.", "a");
    expect(broken).toBe("Failed. 1 of 3 row(s) were deleted before the failure; the remaining rows were not deleted. Reload and try again. The last-period flags are inconsistent: No period is marked as last; Period 2 should be.");
  });
  it("UT-ADCOST-084 inputText formats in the browser separator", () => {
    expect(inputText(undefined, "fixed2", ".")).toBe("");
    expect(inputText(1.5, "intOr2", ",")).toBe("1,5");
    expect(inputText(2, "fixed1", ".")).toBe("2.0");
    expect(inputText(0.02, "keep2", ".")).toBe("0.02");
    expect(inputText(2, "keep2", ",")).toBe("2,0");
    expect(inputText(2.5, "keep2", ".")).toBe("2.5");
  });
});
