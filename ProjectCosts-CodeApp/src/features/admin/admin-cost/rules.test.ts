/**
 * Admin Cost Screen — unit tests (UT-ADCOST-nnn).
 *
 * Rewritten 19 Oct 2026 (D24) for the connected screen. Removed with the code they tested: 001b
 * (the invented country scope), 028 (the blank-scope empty state — the canvas opens on its first
 * country and Wind), 030/031 (the client privilege gates, D1), 041–045 (Apply and its tracking,
 * out of scope, D20), 047/049 (the rail key helpers, gone).
 */
import { describe, it, expect } from "vitest";
import { CHOICE_ADMIN, CHOICE_PRODUCTION, CAPEX_ROOT_NUMBER } from "@/data/dataverseNames";
import {
  ADMIN_COST_LABELS, COST_CATEGORIES, CASCADE_COLUMNS, NON_CASCADE_COLUMNS, OPEX_COL, OPEX_FIXED,
  DEVEX_COL, DEVEX_DISTRIBUTION_FREQUENCY, COST_RANGE_ERROR, COST_INTEGER_ERROR, MSG, PERIOD_ONE,
  INFLATION_START_YEAR_LITERAL, START_DATE_DEFAULT,
  buildCapexSubaccounts, buildCostCategories, buildCostPicker, buildOpexPayload, buildStandardCostPayload,
  canAddPeriod, canSaveOpexPeriod, canSaveStandardCost, categoryOptions, changeDevexCategory,
  changeDevexSubaccount, changeDevexUnit, changeDurationYears, codOffsetText, contractRowsOf,
  contractTypeMenu, costAmountError, costBreadcrumbText, costCurrency, currencyFor, defaultCostScope,
  defaultUnit, deleteDialogDescription, deleteDialogTitle, derivedDescription, devexAccountCell,
  devexCategoryCell, devexClusterCell, devexCostCell, devexRows, devexSubaccountCell, dueDateError,
  durationError, endDateText, externalContractDefault, externalContractDefaultCanvasParity,
  fixCostsError, hintVisible, inflationProfileError, isPeriodOneOrNew, mappedCostPaidBy,
  mappedCostPaidByCanvasParity, modeFor, newTailCanvasParity, nextPeriod, nextPeriodCanvasParity,
  opexCells, opexColumnHeaders, opexGridLines, opexRowsForCategory, paymentAmountError,
  percentOfRevenuesError, periodPanelTitle, planDeleteOpexPeriodOrContract, planDeleteStandardCost,
  planSaveOpexPeriod, planSaveStandardCost, rateError, rateText, reopenAfterWrite, showAddContractType,
  showAddCost, splitOpexSubaccounts, startDateText, subaccountMenuLabel, subaccountOptions,
  toDevexForm, toOpexForm, toggleCollapsed, toggleCategoryCard, toggleDevexCategory, unitChoices,
  unitError, unitLabel, isUnitValid, expandAfterSave,
  type CapexAccount, type CostScope, type DevexCost, type OpexPeriodRow, type OpexSubaccount,
  type PeriodContext, type SpvDevCoMapping,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const P = CHOICE_PRODUCTION.opexLandLeasePeriod;
const T = CHOICE_ADMIN.contractTypes;

const scope = (o: Partial<CostScope> = {}): CostScope => ({
  countryId: "de", countryName: "Germany", technology: "Wind",
  technologyValue: CHOICE_ADMIN.technology.wind, ...o,
});

const acc = (o: Partial<CapexAccount>): CapexAccount => ({
  id: "x", name: "X", number: "0", order: 1, parentId: null, status: 0, owningBusinessUnitId: null, ...o,
});

const chart: CapexAccount[] = [
  acc({ id: "root", number: CAPEX_ROOT_NUMBER, name: "Root" }),
  acc({ id: "cat1", number: "10000", name: "Development Expenses", parentId: "root", order: 2 }),
  acc({ id: "cat0", number: "05000", name: "Wind Turbine / Panels", parentId: "root", order: 1 }),
  acc({ id: "over", number: "90000", name: "Overleveraging", parentId: "root", order: 9 }),
  acc({ id: "a1", number: "10001", name: "Permits", parentId: "cat1", order: 2 }),
  acc({ id: "a0", number: "10002", name: "Studies", parentId: "cat1", order: 1 }),
  acc({ id: "s1", number: "10001_01", name: "Permit fees", parentId: "a1", order: 1 }),
  acc({ id: "s2", number: "10002_01", name: "Wind study", parentId: "a0", order: 2 }),
  acc({ id: "s3", number: "10002_02", name: "Noise study", parentId: "a0", order: 1 }),
];
const categories = buildCostCategories(chart);
const subaccounts = buildCapexSubaccounts(chart, categories);
const subById = new Map(subaccounts.map((x) => [x.id, x]));

const cost = (o: Partial<DevexCost> = {}): DevexCost => ({
  id: "dc1", description: "Standard Permit fees - x", descriptionInput: "x", costAmount: 10000,
  unit: CHOICE_ADMIN.costUnit.eur, costPaidBy: CHOICE_ADMIN.costPaidType.devCo, comment: null,
  technology: CHOICE_ADMIN.technology.wind, countryId: "de", categoryId: "cat1", subaccountId: "s1",
  clusters: [true, true, false, false, false], ...o,
});

const opexRow = (o: Partial<OpexPeriodRow> = {}): OpexPeriodRow => ({
  id: "p1", description: "Standard LL Locations", startDateString: "Cluster 6: Operation", countryId: "de",
  technology: CHOICE_ADMIN.technology.wind, typeOfContract: T.landlease, period: P.period1,
  opexSubaccountId: null, landLeaseSubaccountId: "ll1", currencyId: "eur", currencyName: "Euro",
  isLastPeriod: true, isCollapsed: false, fixCosts: 1500, percentOfRevenues: null, eurPerMwh: null,
  eurPerMw: null, eurPerWtg: null, aggregation: CHOICE_PRODUCTION.aggregation.sum, distributionFrequency: 12,
  durationYears: 5, durationMonths: 6, secured: false, allWtgAllocated: true, externalContract: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null, inflationArea: null,
  inflationCountryArea: null, amount1: null, dueDate1: null, amount2: null, dueDate2: null, amount3: null,
  dueDate3: null, threshold: false, thresholdType: null, thresholdIndividual: null, alignWithProjectDuration: false,
  ...o,
});

const llSub: OpexSubaccount = { id: "ll1", name: "Locations", order: 1, accountOrder: null };
const ctxFor = (o: Partial<PeriodContext> = {}): PeriodContext => ({
  mode: "addContract", typeOfContract: T.landlease, subaccount: llSub, existing: null, reference: null,
  contractRows: [], ...o,
});

/* ═══════════════════════════════════════════════════════════════ categories ════ */

describe("the four categories and the scope", () => {
  it("UT-ADCOST-002 they render in source order, every card folded at first", () => {
    expect(COST_CATEGORIES.map((c) => c.category)).toEqual(["DEVEX/CAPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs"]);
    expect([...toggleCategoryCard(new Set(), "Land Lease")]).toEqual(["Land Lease"]);
    expect([...toggleCategoryCard(new Set(["Land Lease"]), "Land Lease")]).toEqual([]);
  });

  it("UT-ADCOST-002b Add-Contract-Type shows for the three OPEX rows, Add-Cost for DEVEX", () => {
    expect(COST_CATEGORIES.filter(showAddContractType).map((c) => c.family)).toEqual(["opex", "landLease", "opex"]);
    expect(COST_CATEGORIES.filter(showAddCost).map((c) => c.category)).toEqual(["DEVEX/CAPEX"]);
  });

  it("UT-ADCOST-001c the picker excludes Spain, Greece and Romania and offers Wind/PV only", () => {
    const picker = buildCostPicker([{ id: "es", name: "Spain" }, { id: "fr", name: "France" }, { id: "de", name: "Germany" }]);
    expect(picker.countries.map((c) => c.name)).toEqual(["Germany", "France"]);
    expect(picker.nestings[0]!.childs.map((c) => c.value)).toEqual(["Wind", "PV"]);
  });

  it("UT-ADCOST-028 the screen opens on the first rail country and Wind (the picker's default)", () => {
    expect(defaultCostScope([{ id: "fr", name: "France" }, { id: "de", name: "Germany" }])).toEqual(scope());
  });

  it("UT-ADCOST-050 the breadcrumb and the currency", () => {
    expect(costBreadcrumbText(scope())).toBe("Standard Assumptions / Costs / Germany / Wind");
    expect(costCurrency("Poland")).toBe("PLN");
    expect(costCurrency("Germany")).toBe("EUR");
  });

  it("UT-ADCOST-001 without the admin rule no plan writes anything", () => {
    expect(planDeleteStandardCost(cost(), false, MSG.noPermission).refusedReason).toBe(MSG.noPermission);
    expect(planDeleteOpexPeriodOrContract({ target: opexRow(), contractRows: [], canEdit: false, noPermissionText: MSG.noPermission }).writes)
      .toHaveLength(0);
  });
});

/* ═════════════════════════════════════════════════════════════ DEVEX / CAPEX ════ */

describe("the DEVEX/CAPEX chart and grid", () => {
  it("UT-ADCOST-004 Overleveraging is excluded from the categories, sorted by Order", () => {
    expect(categories.map((c) => c.name)).toEqual(["Wind Turbine / Panels", "Development Expenses"]);
  });

  it("UT-ADCOST-004b the subaccounts are level 3, with account, category and AggregatedName", () => {
    expect(subaccounts.map((x) => x.id)).toEqual(["s3", "s2", "s1"]);
    expect(subById.get("s1")).toMatchObject({ parentName: "Permits", categoryId: "cat1", aggregatedName: "Permits / Permit fees 10001_01" });
  });

  it("UT-ADCOST-027 only categories with costs appear; children sort by account then subaccount order", () => {
    const costs = [cost({ id: "c1", subaccountId: "s1" }), cost({ id: "c2", subaccountId: "s2" }), cost({ id: "c3", subaccountId: "s3" })];
    const closed = devexRows(categories, costs, subById, new Set());
    expect(closed.map((r) => r.kind)).toEqual(["category"]);
    const open = devexRows(categories, costs, subById, new Set(["cat1"]));
    expect(open.filter((r) => r.kind === "cost").map((r) => (r.kind === "cost" ? r.cost.id : ""))).toEqual(["c3", "c2", "c1"]);
  });

  it("UT-ADCOST-027b a write re-opens the touched category only; the toggle flips one", () => {
    expect([...reopenAfterWrite("cat1")]).toEqual(["cat1"]);
    expect([...toggleDevexCategory(new Set(["cat1"]), "cat0")]).toEqual(["cat1", "cat0"]);
  });

  it("UT-ADCOST-053 the cells: account in both account columns, 'Name - Number', clusters with ','", () => {
    const row = devexRows(categories, [cost()], subById, new Set(["cat1"]))[1]!;
    expect(devexCategoryCell(row)).toBe("Permits");
    expect(devexAccountCell(row)).toBe("Permits");
    expect(devexSubaccountCell(row)).toBe("Permit fees - 10001_01");
    expect(devexClusterCell(cost())).toBe("1,2");
    expect(devexCategoryCell(devexRows(categories, [cost()], subById, new Set())[0]!)).toBe("Development Expenses");
  });

  it("UT-ADCOST-052 the cost cell is a grouped integer and the unit label", () => {
    expect(devexCostCell(cost({ costAmount: 1234567 }))).toBe("1,234,567 EUR");
    expect(unitLabel(CHOICE_ADMIN.costUnit.eurPerMw)).toBe("EUR/MW(p)");
  });
});

describe("the DEVEX/CAPEX panel", () => {
  it("UT-ADCOST-035 the unit defaults to the record's, else PLN for Poland, else EUR", () => {
    expect(defaultUnit(null, "Poland")).toBe(CHOICE_ADMIN.costUnit.pln);
    expect(defaultUnit(null, "Germany")).toBe(CHOICE_ADMIN.costUnit.eur);
    expect(defaultUnit(CHOICE_ADMIN.costUnit.eurPerMw, "Poland")).toBe(CHOICE_ADMIN.costUnit.eurPerMw);
  });

  it("UT-ADCOST-035b Wind gets three units, other technologies two", () => {
    expect(unitChoices("Germany", "Wind").map(unitLabel)).toEqual(["EUR", "EUR/MW(p)", "EUR/WTG"]);
    expect(unitChoices("Poland", "PV").map(unitLabel)).toEqual(["PLN", "PLN/MW(p)"]);
  });

  it("UT-ADCOST-036 a per-WTG unit outside Wind is invalid, with the canvas text", () => {
    expect(isUnitValid(CHOICE_ADMIN.costUnit.eurPerWtg, "PV")).toBe(false);
    expect(isUnitValid(CHOICE_ADMIN.costUnit.eurPerWtg, "Wind")).toBe(true);
    expect(unitError("Poland")).toBe("PLN/WTG only applicable for Wind");
    expect(unitError("Germany")).toBe("EUR/WTG only applicable for Wind");
  });

  it("UT-ADCOST-033 / 034 the cost is an integer within 0 – 100,000,000", () => {
    expect(costAmountError("12.5")).toBe(COST_INTEGER_ERROR);
    expect(costAmountError("100000001")).toBe(COST_RANGE_ERROR);
    expect(costAmountError("5000")).toBeNull();
    expect(costAmountError("")).toBeNull();
  });

  it("UT-ADCOST-037 changing the unit clears the amount", () => {
    expect(changeDevexUnit({ ...toDevexForm(cost(), "Germany") }, CHOICE_ADMIN.costUnit.eurPerMw)).toMatchObject({ cost: "", dirty: true });
  });

  it("UT-ADCOST-038 a subaccount back-fills the category and takes the mapping's Cost Paid By", () => {
    const mapping: SpvDevCoMapping[] = [{ id: "m", accountNumber: "10001_01", subaccountId: "s1", devCoSpv: CHOICE_ADMIN.costPaidType.spv }];
    const f = changeDevexSubaccount(toDevexForm(null, "Germany"), subById.get("s1")!, mapping);
    expect(f).toMatchObject({ subaccountId: "s1", categoryId: "cat1", costPaidBy: CHOICE_ADMIN.costPaidType.spv });
    expect(changeDevexCategory(f, "cat0")).toMatchObject({ categoryId: "cat0", subaccountId: null, costPaidBy: null });
  });

  it("UT-ADCOST-038c SOURCE DEFECT fixed: the mapping is matched by lookup, else by number", () => {
    const byNumberOnly: SpvDevCoMapping[] = [{ id: "m", accountNumber: "10001_01", subaccountId: null, devCoSpv: CHOICE_ADMIN.costPaidType.devCo }];
    expect(mappedCostPaidBy(byNumberOnly, subById.get("s1")!)).toBe(CHOICE_ADMIN.costPaidType.devCo);
    expect(mappedCostPaidByCanvasParity(byNumberOnly, subById.get("s1")!)).toBeNull();
  });

  it("UT-ADCOST-038b a subaccount stops being offered at 50 costs; categories follow", () => {
    const full = Array.from({ length: 50 }, (_, i) => cost({ id: `c${i}`, subaccountId: "s1" }));
    expect(subaccountOptions("cat1", subaccounts, full).map((x) => x.id)).toEqual(["s3", "s2"]);
    expect(subaccountOptions(null, subaccounts, []).length).toBe(3);
    expect(categoryOptions(categories, subaccounts, full).map((c) => c.id)).toEqual(["cat1"]);
  });

  it("UT-ADCOST-032 Save needs dirty, every required field and at least one cluster", () => {
    const filled = { ...toDevexForm(cost(), "Germany"), dirty: true };
    expect(canSaveStandardCost(filled, scope())).toBe(true);
    expect(canSaveStandardCost({ ...filled, clusters: [false, false, false, false, false] }, scope())).toBe(false);
    expect(canSaveStandardCost({ ...filled, dirty: false }, scope())).toBe(false);
  });

  it("UT-ADCOST-032b SOURCE DEFECT fixed: the panel opens clean every time", () => {
    expect(toDevexForm(cost(), "Germany").dirty).toBe(false);
    expect(toDevexForm(null, "Germany").dirty).toBe(false);
  });

  it("UT-ADCOST-039 the payload: composed name/description, fixed VAT/Depreciation/frequency, every lookup", () => {
    const data = buildStandardCostPayload({ ...toDevexForm(cost(), "Germany"), description: "x " }, { scope: scope(), subaccountName: "Permit fees" });
    expect(data).toMatchObject({
      [DEVEX_COL.name]: "Standard Cost : Germany-Wind-Permit fees",
      [DEVEX_COL.description]: "Standard Permit fees - x ",
      [DEVEX_COL.descriptionInput]: "x ",
      [DEVEX_COL.applyVat]: true,
      [DEVEX_COL.depreciation]: true,
      [DEVEX_COL.distributionFrequency]: DEVEX_DISTRIBUTION_FREQUENCY,
      "vsb_Subaccount@odata.bind": "/vsb_capexaccountlists(s1)",
      "vsb_Category@odata.bind": "/vsb_capexaccountlists(cat1)",
      "vsb_Country@odata.bind": "/vsb_countries(de)",
    });
    expect(Object.keys(data).some((k) => k.toLowerCase().startsWith("owningbusinessunit"))).toBe(false);
  });

  it("UT-ADCOST-039b an update writes every column too (the subaccount is editable)", () => {
    const plan = planSaveStandardCost({
      form: { ...toDevexForm(cost(), "Germany"), dirty: true }, scope: scope(), subaccountName: "Permit fees",
      existing: cost(), canEdit: true, noPermissionText: MSG.noPermission, incompleteText: MSG.incomplete,
    });
    expect(plan.writes[0]).toMatchObject({ op: "update", id: "dc1" });
    expect(plan.writes[0]!.data!["vsb_Subaccount@odata.bind"]).toBe("/vsb_capexaccountlists(s1)");
  });

  it("UT-ADCOST-040 delete removes the standard cost only (the plugin cleans the project rows)", () => {
    expect(planDeleteStandardCost(cost(), true, MSG.noPermission).writes).toEqual([
      expect.objectContaining({ op: "delete", id: "dc1", entitySet: "vsb_devexcapexstandardassumptionses" }),
    ]);
    expect(deleteDialogTitle("cost")).toBe("Delete Cost");
    expect(deleteDialogDescription("cost", "Standard X - y")).toBe('Are you sure you want to delete the "Standard X - y" cost?');
    expect(MSG.devexDeleteError("boom")).toBe("Error : boom, standard cost could not be deleted");
  });
});

/* ═══════════════════════════════════════════════════════════════ OPEX / LL ════ */

describe("the OPEX subaccounts and menu", () => {
  it("UT-ADCOST-003 the O&M / Other-OPEX split follows the name/order heuristic", () => {
    const split = splitOpexSubaccounts([
      { id: "a", name: "Operation & Maintenance", order: 3, accountOrder: 2 },
      { id: "b", name: "Insurance", order: 2, accountOrder: 2 },
      { id: "c", name: "Service", order: 1, accountOrder: 1 },
      { id: "d", name: "TCMA services", order: 1, accountOrder: 2 },
    ]);
    expect(split.oAndM.map((x) => x.id)).toEqual(["a", "c"]);
    expect(split.otherOpex.map((x) => x.id)).toEqual(["d", "b"]);
  });

  it("UT-ADCOST-007 TCMA and Environmental are relabelled in the menu only", () => {
    expect(subaccountMenuLabel("TCMA services")).toBe("TCMA");
    expect(subaccountMenuLabel("Environmental compensation")).toBe("E&CM");
    expect(subaccountMenuLabel("Insurance")).toBe("Insurance");
  });

  it("UT-ADCOST-005 / 006 an item is disabled once a contract of that subaccount exists in scope", () => {
    const menu = contractTypeMenu(T.landlease, [llSub, { ...llSub, id: "ll2", name: "Other" }], [opexRow()], scope());
    expect(menu.map((m) => m.enabled)).toEqual([false, true]);
    expect(contractTypeMenu(T.landlease, [llSub], [opexRow({ countryId: "fr" })], scope())[0]!.enabled).toBe(true);
  });
});

describe("the OPEX grid", () => {
  const head = opexRow({ id: "h", description: "Standard LL Locations", isLastPeriod: false });
  const p2 = opexRow({ id: "p2", description: "Standard LL Locations - 2", period: P.period2, isLastPeriod: true, durationYears: 2, durationMonths: 9 });

  it("UT-ADCOST-008 the grid filters the scope and type, sorted by Description", () => {
    const rows = opexRowsForCategory([p2, head, opexRow({ id: "x", typeOfContract: T.opexOther })], scope(), T.landlease);
    expect(rows.map((r) => r.id)).toEqual(["h", "p2"]);
  });

  it("UT-ADCOST-008b collapse hides later periods; Delete only on Period 1 and the tail; Add Period under the tail", () => {
    const open = opexGridLines([head, p2], new Map());
    expect(open.map((l) => [l.row.id, l.canDelete, l.showAddPeriod])).toEqual([["h", true, false], ["p2", true, true]]);
    const closed = opexGridLines([head, p2], toggleCollapsed(new Map(), head));
    expect(closed.map((l) => l.row.id)).toEqual(["h"]);
    expect(closed[0]!.showAddPeriod).toBe(false);
    expect([...expandAfterSave(toggleCollapsed(new Map(), head), "ll1")]).toEqual([["ll1", false]]);
  });

  it("UT-ADCOST-008c the cells: cumulative end date, durations, currency, OTP for Land Lease", () => {
    expect(endDateText(p2, [head, p2])).toBe("COD + 8 Years 3 Months");
    const cells = opexCells(head, [head, p2]);
    expect(cells.slice(0, 7)).toEqual(["Standard LL Locations", "Cluster 6: Operation", "5 years 6 months", "COD + 5 Years 6 Months", "Euro", "No", "1,500"]);
    expect(cells.at(-1)).toBe("No");
    expect(opexColumnHeaders(true, "Poland")).toContain("OTP");
    expect(opexColumnHeaders(false, "Poland")).not.toContain("OTP");
    expect(opexColumnHeaders(false, "Poland")[6]).toBe("Fix Costs p.a. [PLN]");
  });
});

describe("the OPEX period panel", () => {
  it("UT-ADCOST-016 the description and start date are derived, never typed", () => {
    expect(derivedDescription(ctxFor())).toBe("Standard LL Locations");
    expect(derivedDescription(ctxFor({ typeOfContract: T.opexOandM }))).toBe("Standard Locations");
    expect(derivedDescription(ctxFor({ typeOfContract: T.opexOther }))).toBe("Standard Opex Locations");
    const head = opexRow({ id: "h" });
    const add = ctxFor({ reference: head, contractRows: [head] });
    expect(derivedDescription(add)).toBe("Standard LL Locations - 2");
    expect(startDateText(add)).toBe("COD + 5 Years 6 Months");
    expect(startDateText(ctxFor())).toBe(START_DATE_DEFAULT);
    expect(modeFor(null, head)).toBe("addPeriod");
    expect(periodPanelTitle("editPeriod", "Locations")).toBe("Edit Period : Locations");
  });

  it("UT-ADCOST-016b an untouched panel cannot be saved; a filled one can", () => {
    const ctx = ctxFor();
    const f = toOpexForm(ctx);
    expect(canSaveOpexPeriod(f, ctx, "Germany")).toBe(false);
    const filled = { ...changeDurationYears(f, 5), fixCosts: "100", distributionFrequency: 12 };
    expect(filled.durationMonths).toBe(0);
    expect(canSaveOpexPeriod(filled, ctx, "Germany")).toBe(true);
  });

  it("UT-ADCOST-018 a zero duration blocks the save", () => {
    const ctx = ctxFor();
    const f = { ...toOpexForm(ctx), durationYears: 0, durationMonths: 0, fixCosts: "1", distributionFrequency: 1, dirty: true };
    expect(durationError(f)).toBe("0 year 0 months can't be selected");
    expect(canSaveOpexPeriod(f, ctx, "Germany")).toBe(false);
  });

  it("UT-ADCOST-019 the hint blocks the save until a commercial figure is entered", () => {
    const ctx = ctxFor();
    const f = { ...toOpexForm(ctx), durationYears: 1, durationMonths: 0, distributionFrequency: 1, dirty: true };
    expect(hintVisible(f, ctx)).toBe(true);
    expect(canSaveOpexPeriod(f, ctx, "Germany")).toBe(false);
  });

  it("UT-ADCOST-020 Italy + the country profile requires an area", () => {
    const ctx = ctxFor({ typeOfContract: T.opexOandM });
    const f = { ...toOpexForm(ctx), durationYears: 1, durationMonths: 0, distributionFrequency: 1, fixCosts: "1", dirty: true };
    expect(f.useInflationProfile && f.useCountryInflationProfile).toBe(true);
    expect(canSaveOpexPeriod(f, ctx, "Italy")).toBe(false);
    expect(canSaveOpexPeriod({ ...f, area: "North" }, ctx, "Italy")).toBe(true);
  });

  it("UT-ADCOST-021 a custom profile is required when the country profile is off; its texts are verbatim", () => {
    expect(inflationProfileError("2.25", false)).toBe("Value must be a numeric with 1 decimal place.");
    expect(inflationProfileError("120", false)).toBe("Please select a value between 0 and 100.");
    expect(inflationProfileError("2.5", false)).toBeNull();
    expect(inflationProfileError("abc", true)).toBeNull();
  });

  it("UT-ADCOST-022c the rate and amount texts are verbatim", () => {
    expect(fixCostsError("1.234")).toBe("Value must be a numeric with two decimal places.");
    expect(fixCostsError("2000000000")).toBe("Value must be between 0 and 1,000,000,000.0.");
    expect(percentOfRevenuesError("20000")).toBe("Please select a value between 0 and 10,000.0.");
    expect(percentOfRevenuesError("1.234")).toBe("Value must be a numeric with two decimal place.");
    expect(rateError("200000000")).toBe("Please select a value between 0 and 100,000,000.0.");
    expect(paymentAmountError("1.234")).toBe("Value must be a number");
    expect(dueDateError("13/2025")).toBe("Due Date must be in format MM/YYYY.");
    expect(dueDateError("01/2025")).toBeNull();
  });

  it("UT-ADCOST-024 defaults: inflation on for O&M / Other, off for Land Lease; Sum; months 0 once a year is set", () => {
    expect(toOpexForm(ctxFor()).useInflationProfile).toBe(false);
    expect(toOpexForm(ctxFor({ typeOfContract: T.opexOther })).useInflationProfile).toBe(true);
    expect(toOpexForm(ctxFor()).aggregation).toBe(CHOICE_PRODUCTION.aggregation.sum);
    const edit = toOpexForm(ctxFor({ existing: opexRow({ durationMonths: null }) }));
    expect(edit.durationMonths).toBe(0);
  });

  it("UT-ADCOST-024b SOURCE DEFECT fixed: a stored 0 rate opens as 0", () => {
    expect(rateText(0)).toBe("0");
    expect(rateText(12.5)).toBe("12.5");
    expect(rateText(12.346)).toBe("12.35");
    expect(toOpexForm(ctxFor({ existing: opexRow() })).fixCosts).toBe("1500.00");
  });

  it("UT-ADCOST-025 SOURCE DEFECT fixed: External Contract keeps a stored No; TCMA is case-insensitive", () => {
    const tcma: OpexSubaccount = { id: "t", name: "TCMA services", order: 1, accountOrder: 2 };
    const stored = ctxFor({ typeOfContract: T.opexOther, subaccount: tcma, existing: opexRow({ typeOfContract: T.opexOther, externalContract: false }) });
    expect(externalContractDefault(stored)).toBe(false);
    expect(externalContractDefaultCanvasParity({ ...stored, subaccount: { ...tcma, name: "Insurance" } })).toBe(true);
    const fresh = ctxFor({ typeOfContract: T.opexOther, subaccount: tcma });
    expect(externalContractDefault(fresh)).toBe(false);
    expect(externalContractDefaultCanvasParity(fresh)).toBe(true);
  });

  it("UT-ADCOST-023 payment 2/3 show only for Add Period, from the reference row", () => {
    const ref = opexRow({ amount2: 500, dueDate2: "01/2030" });
    expect(toOpexForm(ctxFor({ reference: ref, contractRows: [ref] })).showSecond).toBe(true);
    expect(toOpexForm(ctxFor({ existing: ref })).showSecond).toBe(false);
    expect(isPeriodOneOrNew(ctxFor({ reference: ref }))).toBe(false);
  });
});

describe("the OPEX save and delete", () => {
  const filledForm = (ctx: PeriodContext) => ({ ...toOpexForm(ctx), durationYears: 1, durationMonths: 0, fixCosts: "100", distributionFrequency: 12, dirty: true });
  const save = (ctx: PeriodContext) => planSaveOpexPeriod({
    form: filledForm(ctx), ctx, scope: scope(), currencyId: "eur", canEdit: true,
    noPermissionText: MSG.noPermission, incompleteText: MSG.incomplete, addPeriodBlockedText: "blocked",
  });

  it("UT-ADCOST-026 the payload: composed name, derived fields, fixed toggles, currency and subaccount binds", () => {
    const ctx = ctxFor();
    const data = buildOpexPayload(filledForm(ctx), { ctx, scope: scope(), period: PERIOD_ONE, isLastPeriod: true, currencyId: "eur" });
    expect(data).toMatchObject({
      [OPEX_COL.name]: "Standard LL Locations - Germany - Wind",
      [OPEX_COL.startDateString]: START_DATE_DEFAULT,
      [OPEX_COL.inflationStartYearString]: INFLATION_START_YEAR_LITERAL,
      [OPEX_COL.secured]: OPEX_FIXED.secured,
      [OPEX_COL.allWtgAllocated]: true,
      [OPEX_COL.threshold]: false,
      [OPEX_COL.alignWithProjectDuration]: false,
      "vsb_Currency@odata.bind": "/transactioncurrencies(eur)",
      "vsb_LandLeaseSubaccount@odata.bind": "/vsb_landleasesubaccounts(ll1)",
    });
    expect(currencyFor([{ id: "p", code: "PLN", name: "Zloty" }, { id: "e", code: "EUR", name: "Euro" }], "Poland")?.id).toBe("p");
  });

  it("UT-ADCOST-009 / 011 Add Period: the successor period, then the reference loses the tail flag", () => {
    const head = opexRow({ id: "h" });
    const plan = save(ctxFor({ reference: head, contractRows: [head] }));
    expect(plan.writes.map((w) => w.op)).toEqual(["create", "update"]);
    expect(plan.writes[0]!.data![OPEX_COL.period]).toBe(P.period2);
    expect(plan.writes[1]).toMatchObject({ id: "h", data: { [OPEX_COL.isLastPeriod]: false } });
  });

  it("UT-ADCOST-010 SOURCE DEFECT fixed: Period 10 blocks an 11th add", () => {
    expect(nextPeriod(P.period10)).toBeNull();
    expect(nextPeriodCanvasParity(P.period10)).toBe(P.period1);
    expect(canAddPeriod(P.period9)).toBe(true);
    const last = opexRow({ id: "t", period: P.period10 });
    expect(save(ctxFor({ reference: last, contractRows: [last] })).refusedReason).toBe("blocked");
  });

  it("UT-ADCOST-012 / 013 editing Period 1 cascades exactly the 17 columns to every later period", () => {
    const head = opexRow({ id: "h" });
    const p2 = opexRow({ id: "p2", period: P.period2 });
    const plan = save(ctxFor({ existing: head, contractRows: [head, p2] }));
    expect(plan.writes.map((w) => `${w.op} ${w.id}`)).toEqual(["update h", "update p2"]);
    expect(Object.keys(plan.writes[1]!.data!).sort()).toEqual([...CASCADE_COLUMNS].sort());
    expect(CASCADE_COLUMNS).toHaveLength(17);
    for (const k of NON_CASCADE_COLUMNS) expect(k in plan.writes[1]!.data!).toBe(false);
  });

  it("UT-ADCOST-013b editing a later period cascades nothing", () => {
    const p2 = opexRow({ id: "p2", period: P.period2 });
    expect(save(ctxFor({ existing: p2, contractRows: [opexRow({ id: "h" }), p2] })).writes).toHaveLength(1);
  });

  it("UT-ADCOST-014 deleting Period 1 deletes every period of the contract", () => {
    const rows = [opexRow({ id: "h" }), opexRow({ id: "p2", period: P.period2 })];
    const plan = planDeleteOpexPeriodOrContract({ target: rows[0]!, contractRows: rows, canEdit: true, noPermissionText: MSG.noPermission });
    expect(plan.writes.map((w) => `${w.op} ${w.id}`)).toEqual(["delete h", "delete p2"]);
    expect(deleteDialogTitle("contract")).toBe("Delete Contract");
  });

  it("UT-ADCOST-015 SOURCE DEFECT fixed: the new tail is the highest remaining PERIOD", () => {
    const rows = Array.from({ length: 10 }, (_, i) => opexRow({
      id: `p${i + 1}`, period: P.period1 + i, description: i === 0 ? "X" : `X - ${i + 1}`,
    }));
    const plan = planDeleteOpexPeriodOrContract({ target: rows[9]!, contractRows: rows, canEdit: true, noPermissionText: MSG.noPermission });
    expect(plan.writes.map((w) => `${w.op} ${w.id}`)).toEqual(["delete p10", "update p9"]);
    expect(newTailCanvasParity(rows)?.id).not.toBe("p9");
  });

  it("UT-ADCOST-015b the texts and the contract rows", () => {
    expect(MSG.savingPeriod("Standard LL Locations")).toBe('Please wait, saving "Standard LL Locations"...');
    expect(MSG.deleting).toBe("Please wait, deleting...");
    expect(codOffsetText(27)).toBe("COD + 2 Years 3 Months");
    const rows = [opexRow({ id: "a" }), opexRow({ id: "b", landLeaseSubaccountId: "other" })];
    expect(contractRowsOf(rows, rows[0]!).map((r) => r.id)).toEqual(["a"]);
    expect(ADMIN_COST_LABELS.addContractType).toBe("Add Contract Type");
  });
});
