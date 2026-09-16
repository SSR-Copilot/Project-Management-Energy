/**
 * Capex Costs Screen — unit tests. IDs are the spec's `UT-CAPEX-nnn`.
 *
 * Pure functions only: no rendering, no mocking beyond the input record. The cases the
 * spec types as "Rendering" or "Integration" are asserted against the pure function that
 * decides what gets rendered or written, which is where the behaviour actually lives.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_COST, DEAD_CAPEX_MARGIN } from "@/data/entities";
import {
  MSG, costAllowedStart, navigationWindow, clampSelectedYear, projectPeriods,
  canGoPreviousYear, canGoNextYear, visibleCategories, monthIndex, flattenCosts,
  contractTotals, buildGrid, contractSubLabel, distributionSchedule,
  equalDistributionAmounts, planEqualDistribution, individualDistribution,
  canPersistIndividual, capexWriteSet, clustersHavingCost,
  needsClusterLinkageConfirmation, standardAssumptionAmount, applicableStartCluster,
  eligibleClusters, standardContractRefusal, buildStandardOptions, showStandardSubMenu,
  checkStandardContractClick, synthesiseClusterDates, describeDescriptionError,
  totalCostMax, validateTotalCost, validateMonthYear, canSaveContract, byClusterJson,
  applyDescriptionChange, capexCommands, paidToggleNeedsConfirmation, resolvePaidTarget,
  commentThreads, gridCommentFlags, resolveThread, planDeleteRoot, sortComments,
  paymentDateCommentsAllowed, canSaveComments, truncateComment, commentEditable,
  planDeleteContract, summaryRows, formatSummaryAmount, activeWtgCount,
  totalCostForPercent, formatThousands, formatCostCell, rollupTotals, grandTotalRow,
  MONTH_LABELS, GRAND_TOTAL_LABEL, CAPEX_TOOLBAR_LABELS, CAPEX_GRID_COLUMNS,
  ROW_ADD_BUTTON_LABEL, ROW_ADD_MENU_ITEM_LABEL,
  type CapexAccountNode, type CapexContract, type CapexCostRow, type CapexComment,
  type ClusterDuration, type ContractForm, type DevexCapexAssumption,
} from "./rules";

/* ────────────────────────────────────────────────────────────────── fixtures */

const account = (o: Partial<CapexAccountNode> = {}): CapexAccountNode => ({
  id: "acc-1", name: "Account", number: "10001", order: 1, parentId: "cat-1",
  status: 0, ...o,
});

const contract = (o: Partial<CapexContract> = {}): CapexContract => ({
  id: "c-1", name: "Grid connection", description: "Grid connection",
  subaccountId: "sub-1", totalCost: null, costType: null,
  distribution: CHOICE_COST.distributionType.individual, distributionScheme: null,
  distributionFrequency: null, linkedClusterOrder: null, byClusterJson: null,
  byStartEndDateJson: null, isStandardContract: false, standardAssumptionId: null, ...o,
});

const cost = (o: Partial<CapexCostRow> = {}): CapexCostRow => ({
  id: "cost-1", contractId: "c-1", year: 2025, month: 1, cost: 100, isPaid: false, ...o,
});

const comment = (o: Partial<CapexComment> = {}): CapexComment => ({
  id: "cm-1", text: "hello", contractId: "c-1", costId: null, parentId: null,
  rootId: null, commentType: CHOICE_COST.capexCommentType.generalComment,
  resolved: false, resolvedById: null, createdOn: "2026-01-01T00:00:00Z",
  createdById: "u-1", ...o,
});

const cluster = (o: Partial<ClusterDuration> = {}): ClusterDuration => ({
  order: 1, name: "Cluster 1", startMonth: 1, startYear: 2025,
  endMonth: 12, endYear: 2025, ...o,
});

const assumption = (o: Partial<DevexCapexAssumption> = {}): DevexCapexAssumption => ({
  id: "a-1", description: "Standard grid fee", subaccountId: "sub-1",
  countryId: "de", technology: "Wind", costAmount: 1000,
  unit: CHOICE_COST.costUnit.eur, costPaidBy: null, distributionFrequency: 1,
  applyVat: false, depreciation: false,
  clusters: [true, true, true, true, true], ...o,
});

const form = (o: Partial<ContractForm> = {}): ContractForm => ({
  description: "Grid connection", originalDescription: null, totalCost: "100000",
  distribution: CHOICE_COST.distributionType.individual,
  scheme: CHOICE_COST.distributionScheme.absoluteValues,
  equalMode: null,
  clusterTicks: Array.from({ length: 5 }, () => ({ checked: false, enabled: true })),
  startDate: "", endDate: "", frequency: null, isDirty: true,
  isStandardContract: false, ...o,
});

/* ═══════════════════════════════════════════════════ the year window ════ */

describe("Capex — cost start year and navigation window", () => {
  it("UT-CAPEX-001 uses the Acquisition date for a non-greenfield project", () => {
    const r = costAllowedStart({
      startClusterNo: 3, acquisitionDate: "2023-04-10", projectStartDate: "2021-01-01",
    });
    expect(r.year).toBe(2023);
    expect(r.date.getFullYear()).toBe(2023);
    expect(r.date.getMonth()).toBe(0);
    expect(r.date.getDate()).toBe(1);
  });

  it("UT-CAPEX-002 uses the Project Start Date for greenfield", () => {
    const r = costAllowedStart({
      startClusterNo: 0, acquisitionDate: null, projectStartDate: "2021-06-01",
    });
    expect(r.year).toBe(2021);
    expect(r.date.getFullYear()).toBe(2021);
  });

  it("UT-CAPEX-003 ignores sentinel dates before 1900", () => {
    const today = new Date(2026, 5, 1);
    const r = costAllowedStart({
      startClusterNo: 2, acquisitionDate: "1899-12-31", projectStartDate: null,
    }, today);
    expect(r.year).toBe(2026);
  });

  it("UT-CAPEX-004 spans acquisition to project end", () => {
    const w = navigationWindow(
      { acquisitionDate: "2022-01-01", codDate: "2029-01-01", endDate: "2049-12-31" },
      [cluster({ startYear: 2022, endYear: 2029 })],
      2022, null,
    );
    expect(w).toEqual({ min: 2022, max: 2049 });
  });

  it("UT-CAPEX-004b falls back to this year when every input is a sentinel", () => {
    const today = new Date(2026, 0, 1);
    const w = navigationWindow(
      { acquisitionDate: "1899-01-01", codDate: null, endDate: null },
      [], 1899, null, today,
    );
    expect(w).toEqual({ min: 2026, max: 2026 });
  });

  it("UT-CAPEX-005 clamps the selected year into the window", () => {
    expect(clampSelectedYear(2051, 2022, 2049)).toBe(2049);
    expect(clampSelectedYear(2000, 2022, 2049)).toBe(2022);
    expect(clampSelectedYear(2030, 2022, 2049)).toBe(2030);
  });

  it("UT-CAPEX-006 lists every year in the window, each with 12 months", () => {
    const p = projectPeriods(2022, 2025);
    expect(p).toHaveLength(4);
    expect(p.map((x) => x.year)).toEqual([2022, 2023, 2024, 2025]);
    expect(p[0].months).toHaveLength(12);
  });

  it("UT-CAPEX-054 bounds the year navigation buttons", () => {
    expect(canGoPreviousYear(2022, 2022)).toBe(false);
    expect(canGoNextYear(2049, 2049)).toBe(false);
    expect(canGoPreviousYear(2023, 2022)).toBe(true);
    expect(canGoNextYear(2048, 2049)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════ categories ════ */

describe("Capex — categories and month normalisation", () => {
  it("UT-CAPEX-007 hides the Overleveraging category everywhere", () => {
    const cats = [{ id: "1", name: "Grid connection" }, { id: "2", name: "Overleveraging" }];
    expect(visibleCategories(cats).map((c) => c.name)).toEqual(["Grid connection"]);
    expect(summaryRows(cats, new Map([["2", 999]])).map((r) => r.name))
      .toEqual(["Grid connection"]);
  });

  it("UT-CAPEX-009 accepts a localised label, the English name and a number", () => {
    expect(monthIndex("März")).toBe(3);
    expect(monthIndex("march")).toBe(3);
    expect(monthIndex("3")).toBe(3);
    expect(monthIndex(3)).toBe(3);
    expect(monthIndex("nonsense")).toBe(0);
    expect(monthIndex(null)).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════ the grid ════ */

describe("Capex — grid roll-up", () => {
  const accounts = [account({ id: "acc-A", parentId: "cat-1" })];
  const subs = [
    account({ id: "sub-1", parentId: "acc-A", order: 1 }),
    account({ id: "sub-2", parentId: "acc-A", order: 2 }),
  ];
  const contracts = [
    contract({ id: "c-1", subaccountId: "sub-1", description: "A" }),
    contract({ id: "c-2", subaccountId: "sub-1", description: "B" }),
    contract({ id: "c-3", subaccountId: "sub-2", description: "C" }),
  ];
  const costs = [
    cost({ id: "k1", contractId: "c-1", month: 1, cost: 100 }),
    cost({ id: "k2", contractId: "c-2", month: 1, cost: 200 }),
    cost({ id: "k3", contractId: "c-3", month: 1, cost: 300 }),
  ];

  it("UT-CAPEX-010 an account month total is the sum of its sub-accounts' contracts", () => {
    const flat = flattenCosts(costs, contracts, subs, 2025);
    const rows = buildGrid({ accounts, subaccounts: subs, contracts, flat, allCosts: costs });
    const accountRow = rows.find((r) => r.type === "account")!;
    expect(accountRow.m[0]).toBe(600);
    expect(rows.find((r) => r.id === "sub-1")!.m[0]).toBe(300);
    expect(rows.find((r) => r.id === "sub-2")!.m[0]).toBe(300);
  });

  it("UT-CAPEX-006b only the selected year's costs reach the grid", () => {
    const flat = flattenCosts(
      [...costs, cost({ id: "k9", contractId: "c-1", year: 2024, cost: 5000 })],
      contracts, subs, 2025,
    );
    expect(flat).toHaveLength(3);
  });

  it("UT-CAPEX-008 only Active sub-accounts reach the tree", () => {
    // The Active filter is applied server-side in `useCapexAccountTree`; the grid simply
    // never sees an inactive row. Prove the grid honours the list it is given.
    const activeOnly = subs.filter((x) => x.id !== "sub-2");
    const flat = flattenCosts(costs, contracts, activeOnly, 2025);
    const rows = buildGrid({
      accounts, subaccounts: activeOnly, contracts, flat, allCosts: costs,
    });
    expect(rows.some((r) => r.id === "sub-2")).toBe(false);
  });

  it("UT-CAPEX-011 planned = total − paid", () => {
    const t = contractTotals({ totalCost: 1000 }, [
      { cost: 400, isPaid: true }, { cost: 100, isPaid: false },
    ]);
    expect(t).toEqual({ total: 1000, planned: 600, actual: 400 });
  });

  it("UT-CAPEX-012 total falls back to the sum of the cost rows", () => {
    expect(contractTotals({ totalCost: null }, [{ cost: 250, isPaid: false }]).total).toBe(250);
  });

  it("UT-CAPEX-013 a month is paid when any of its rows is paid", () => {
    const marchCosts = [
      cost({ id: "m1", contractId: "c-1", month: 3, cost: 10, isPaid: false }),
      cost({ id: "m2", contractId: "c-1", month: 3, cost: 20, isPaid: true }),
    ];
    const flat = flattenCosts(marchCosts, [contracts[0]], subs, 2025);
    const rows = buildGrid({
      accounts, subaccounts: subs, contracts: [contracts[0]], flat, allCosts: marchCosts,
    });
    expect(rows.find((r) => r.type === "contract")!.mPaid[2]).toBe(true);
    expect(rows.find((r) => r.type === "contract")!.mPaid[0]).toBe(false);
  });

  it("UT-CAPEX-056 an empty project renders dashes (null), never zeros, and never throws", () => {
    const rows = buildGrid({
      accounts, subaccounts: subs, contracts: [], flat: [], allCosts: [],
    });
    expect(rows).toHaveLength(3); // one account + two sub-accounts
    expect(rows.every((r) => r.total === null && r.paid === null && r.planned === null))
      .toBe(true);
    expect(rows.every((r) => r.m.every((v) => v === null))).toBe(true);
  });

  it("the CostPaidBy filter is applied inside the grid, not in the component", () => {
    const devco = contract({ id: "c-9", costType: CHOICE_COST.costPaidType.devCo });
    const spv = contract({ id: "c-8", costType: CHOICE_COST.costPaidType.spv });
    const rows = buildGrid({
      accounts, subaccounts: subs, contracts: [devco, spv], flat: [], allCosts: [],
      costPaidByFilter: "devco",
    });
    expect(rows.filter((r) => r.type === "contract").map((r) => r.id)).toEqual(["c-9"]);
  });

  it("UT-CAPEX-011b the contract sub-label carries the payer, link and distribution", () => {
    expect(contractSubLabel({
      costType: CHOICE_COST.costPaidType.devCo, linkedClusterOrder: 3,
      distribution: CHOICE_COST.distributionType.individual,
      byClusterJson: null, byStartEndDateJson: null,
    })).toBe("[DevCo] Link to Cluster 3");

    expect(contractSubLabel({
      costType: CHOICE_COST.costPaidType.spv, linkedClusterOrder: null,
      distribution: CHOICE_COST.distributionType.equal,
      byClusterJson: '{"Cluster1":true,"Cluster2":false,"Cluster3":true}',
      byStartEndDateJson: null,
    })).toBe("[SPV] Distribution to Cluster 1, 3");

    expect(contractSubLabel({
      costType: null, linkedClusterOrder: null,
      distribution: CHOICE_COST.distributionType.equal,
      byClusterJson: null,
      byStartEndDateJson:
        '{"StartMonth":1,"StartYear":2027,"EndMonth":12,"EndYear":2029}',
    })).toBe("Distribution from 01/2027 to 12/2029");
  });
});

/* ═════════════════════════════════════ GUIDE r06/r08 — dashes, labels, Grand Total ════ */

describe("Capex — the dash convention, the grid's verbatim labels and the Grand Total row", () => {
  it("GUIDE r06 formatCostCell renders '-' for no data, and a real zero as '0'", () => {
    expect(formatCostCell(null)).toBe("-");
    expect(formatCostCell(0)).toBe("0");
    expect(formatCostCell(3000)).toBe("3,000");
  });

  it("GUIDE r06 the month header labels are Jan .. Dec", () => {
    expect(MONTH_LABELS).toHaveLength(12);
    expect(MONTH_LABELS[0]).toBe("Jan");
    expect(MONTH_LABELS[11]).toBe("Dec");
  });

  it("GUIDE r06 the toolbar and grid column labels are verbatim", () => {
    expect(CAPEX_TOOLBAR_LABELS.addCostFromTable).toBe("+ Add Cost from Table");
    expect(CAPEX_TOOLBAR_LABELS.showEmptyAccounts).toBe("Show Empty Accounts");
    expect(CAPEX_TOOLBAR_LABELS.showTotalPlannedPaid).toBe("Show Total Planned/Paid");
    expect(CAPEX_GRID_COLUMNS).toEqual({
      number: "Number", accountName: "Account Name", totalCosts: "Total Costs",
      totalPaid: "Total Paid", totalPlanned: "Total Planned",
    });
  });

  it("GUIDE r06 the row-level Add flyout's own labels", () => {
    expect(ROW_ADD_BUTTON_LABEL).toBe("Add");
    expect(ROW_ADD_MENU_ITEM_LABEL).toBe("+ Add New Cost");
  });

  it("GUIDE r08 the saving-costs modal text, verbatim, three dots included", () => {
    expect(MSG.savingCosts).toBe("Please wait, saving costs...");
  });

  it("GUIDE r06 'Grand Total' is the row's own label", () => {
    expect(GRAND_TOTAL_LABEL).toBe("Grand Total");
  });

  it("rollupTotals: no contract under a row has ever carried a cost -> every figure is null", () => {
    expect(rollupTotals([], new Map())).toEqual({ total: null, paid: null, planned: null });
  });

  it("rollupTotals: a fixed Total Cost with no bookings -> Total Paid is '-', not 0", () => {
    const c = contract({ id: "c-1", totalCost: 3000 });
    expect(rollupTotals([c], new Map())).toEqual({ total: 3000, paid: null, planned: 3000 });
  });

  it("rollupTotals sums descendant contracts, across every year, not just the one on screen", () => {
    const c1 = contract({ id: "c-1", totalCost: 1000 });
    const c2 = contract({ id: "c-2", totalCost: null });
    const byContract = new Map([
      ["c-2", [cost({ id: "k1", contractId: "c-2", year: 2019, cost: 200, isPaid: true })]],
    ]);
    expect(rollupTotals([c1, c2], byContract))
      .toEqual({ total: 1200, paid: 200, planned: 1000 });
  });

  it("GUIDE r06 mirrors 80000 (no data) / 80001 (3,000 fixed, unpaid) exactly", () => {
    const accounts = [
      account({ id: "a-80000", number: "80000", name: "Turbine / PV Supply Agreement", order: 1 }),
      account({ id: "a-80001", number: "80001", name: "Additional WTG / PV Costs", order: 2 }),
    ];
    const subs = [
      account({ id: "s-80000_0", number: "80000_0", name: "Turbine / PV Supply Agreement",
        parentId: "a-80000", order: 1 }),
      account({ id: "s-80001_0", number: "80001_0", name: "Additional WTG / PV Costs",
        parentId: "a-80001", order: 1 }),
    ];
    const contracts = [contract({ id: "c-1", subaccountId: "s-80001_0", totalCost: 3000 })];
    const rows = buildGrid({ accounts, subaccounts: subs, contracts, flat: [], allCosts: [] });

    const acc80000 = rows.find((r) => r.id === "a-80000")!;
    expect(acc80000.total).toBeNull();
    expect(acc80000.paid).toBeNull();
    expect(acc80000.planned).toBeNull();
    expect(acc80000.m.every((v) => v === null)).toBe(true);

    const sub80000 = rows.find((r) => r.id === "s-80000_0")!;
    expect(sub80000.number).toBe("80000_0");
    expect(sub80000.total).toBeNull();

    const acc80001 = rows.find((r) => r.id === "a-80001")!;
    expect(acc80001.number).toBe("80001");
    expect(acc80001.total).toBe(3000);
    expect(acc80001.paid).toBeNull();
    expect(acc80001.planned).toBe(3000);
    expect(acc80001.m.every((v) => v === null)).toBe(true);

    const grand = grandTotalRow(rows);
    expect(grand.total).toBe(3000);
    expect(grand.paid).toBeNull();
    expect(grand.planned).toBe(3000);
    expect(grand.m.every((v) => v === null)).toBe(true);
  });

  it("grandTotalRow sums account rows only, so it never double-counts sub-accounts/contracts", () => {
    const accounts = [account({ id: "a-1", number: "1", order: 1 })];
    const subs = [account({ id: "s-1", number: "1.1", parentId: "a-1", order: 1 })];
    const contracts = [contract({ id: "c-1", subaccountId: "s-1", totalCost: 500 })];
    const rows = buildGrid({ accounts, subaccounts: subs, contracts, flat: [], allCosts: [] });
    expect(grandTotalRow(rows).total).toBe(500); // not 500 (account) + 500 (sub) + 500 (contract)
  });
});

/* ═════════════════════════════════════════════════ equal distribution ════ */

describe("Capex — equal distribution", () => {
  it("UT-CAPEX-014 a 3-month frequency over one year gives four payments", () => {
    expect(distributionSchedule({
      startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 12, frequency: 3,
    })).toEqual([
      { year: 2025, month: 1 }, { year: 2025, month: 4 },
      { year: 2025, month: 7 }, { year: 2025, month: 10 },
    ]);
  });

  it("UT-CAPEX-015 the schedule wraps across a year boundary", () => {
    expect(distributionSchedule({
      startYear: 2025, startMonth: 11, endYear: 2026, endMonth: 4, frequency: 2,
    })).toEqual([
      { year: 2025, month: 11 }, { year: 2026, month: 1 }, { year: 2026, month: 3 },
    ]);
  });

  it("UT-CAPEX-016 the whole remainder lands on the last payment", () => {
    const r = equalDistributionAmounts(1000, 3);
    expect(r.amounts).toEqual([333, 333, 334]);
    expect(r.averagePayment).toBe(333);
  });

  it("UT-CAPEX-017 a single-payment range takes the full total", () => {
    const schedule = distributionSchedule({
      startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 6, frequency: 12,
    });
    expect(schedule).toEqual([{ year: 2025, month: 6 }]);
    expect(equalDistributionAmounts(1000, 1).amounts).toEqual([1000]);
  });

  it("UT-CAPEX-020b equal distribution replaces rather than merges", () => {
    const plan = planEqualDistribution(1000, {
      startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 3, frequency: 1,
    });
    expect(plan.deleteAllForContract).toBe(true);
    expect(plan.rows).toEqual([
      { year: 2025, month: 1, cost: 333 },
      { year: 2025, month: 2, cost: 333 },
      { year: 2025, month: 3, cost: 334 },
    ]);
    expect(plan.averagePayment).toBe(333);
  });

  it("a blank frequency behaves as monthly (Coalesce(freq, 1))", () => {
    expect(distributionSchedule({
      startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 3, frequency: null,
    })).toHaveLength(3);
  });
});

/* ════════════════════════════════════════════ individual distribution ════ */

describe("Capex — individual distribution", () => {
  const rows = (values: (number | null)[], ids: (string | null)[] = []) =>
    values.map((v, i) => ({
      year: 2025, month: i + 1, value: v, costId: ids[i] ?? null,
    }));

  it("UT-CAPEX-018 a % distribution must total exactly 100", () => {
    expect(canPersistIndividual(rows([50, 49.9]), "percent")).toBe(false);
    expect(canPersistIndividual(rows([50, 50]), "percent")).toBe(true);
  });

  it("UT-CAPEX-019 % values convert against the total cost", () => {
    const out = individualDistribution(rows([12.5]), "percent", 200_000);
    expect(out[0].cost).toBe(25_000);
  });

  it("UT-CAPEX-020 an absolute distribution needs a positive sum", () => {
    expect(canPersistIndividual(rows(Array(12).fill(0)), "absolute")).toBe(false);
    expect(canPersistIndividual(rows([0, 1]), "absolute")).toBe(true);
  });

  it("absolute values are rounded to whole currency units", () => {
    expect(individualDistribution(rows([1234.6]), "absolute", 0)[0].cost).toBe(1235);
  });

  it("UT-CAPEX-021 zero is written only when the row already exists", () => {
    const set = capexWriteSet([
      { year: 2025, month: 3, cost: 0, costId: "existing-march" },
      { year: 2025, month: 4, cost: 0, costId: null },
    ]);
    expect(set.upserts).toEqual([
      { year: 2025, month: 3, cost: 0, costId: "existing-march" },
    ]);
    expect(set.deletes).toEqual([]);
  });

  it("UT-CAPEX-022 blanking an existing month deletes its row", () => {
    const set = capexWriteSet([
      { year: 2025, month: 6, cost: null, costId: "existing-june" },
      { year: 2025, month: 7, cost: null, costId: null },
    ]);
    expect(set.deletes).toEqual(["existing-june"]);
    expect(set.upserts).toEqual([]);
  });

  it("totalCostForPercent coalesces contract total, existing sum, then the typed box", () => {
    expect(totalCostForPercent(500, 200, "700")).toBe(500);
    expect(totalCostForPercent(null, 200, "700")).toBe(200);
    expect(totalCostForPercent(null, 0, "700")).toBe(700);
  });

  it("UT-CAPEX-024b the cluster-linkage confirmation fires on a changed link", () => {
    const clusters = [
      cluster({ order: 1, startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 6 }),
      cluster({ order: 2, startYear: 2025, startMonth: 7, endYear: 2025, endMonth: 12 }),
    ];
    const monthRows = [{ year: 2025, month: 8, cost: 100 }];
    expect(clustersHavingCost(clusters, monthRows).map((c) => c.order)).toEqual([2]);
    expect(needsClusterLinkageConfirmation({
      clusters, rows: monthRows, selectedClusterOrder: 1,
      clusterLinkageChanged: true, costPaidByChanged: false,
      milestoneRelinkResetNeeded: false,
    })).toBe(true);
    expect(needsClusterLinkageConfirmation({
      clusters, rows: monthRows, selectedClusterOrder: 2,
      clusterLinkageChanged: true, costPaidByChanged: false,
      milestoneRelinkResetNeeded: false,
    })).toBe(false);
  });
});

/* ═══════════════════════════════════════════════ standard assumptions ════ */

describe("Capex — standard assumptions", () => {
  const durations = [
    cluster({ order: 1 }), cluster({ order: 2 }), cluster({ order: 3 }),
    cluster({ order: 4 }), cluster({ order: 5 }),
  ];

  it("UT-CAPEX-031 EUR/WTG multiplies by the active generator count", () => {
    const count = activeWtgCount([
      { count: 6, status: 0 }, { count: 4, status: 0 }, { count: 99, status: 1 },
    ]);
    expect(count).toBe(10);
    expect(standardAssumptionAmount(CHOICE_COST.costUnit.eurPerWtg, 1500, {
      totalCapacity: null, activeWtgCount: count,
    })).toBe(15_000);
  });

  it("UT-CAPEX-032 EUR/MW(p) multiplies by the total capacity", () => {
    expect(standardAssumptionAmount(CHOICE_COST.costUnit.eurPerMw, 2000, {
      totalCapacity: 42.5, activeWtgCount: 0,
    })).toBe(85_000);
  });

  it("plain EUR and PLN pass through unchanged", () => {
    expect(standardAssumptionAmount(CHOICE_COST.costUnit.eur, 1234, {
      totalCapacity: 10, activeWtgCount: 3,
    })).toBe(1234);
    expect(standardAssumptionAmount(CHOICE_COST.costUnit.pln, 1234, {
      totalCapacity: 10, activeWtgCount: 3,
    })).toBe(1234);
  });

  it("UT-CAPEX-033 clusters below the project start cluster are excluded", () => {
    const eligible = eligibleClusters(assumption(), durations, 3);
    expect(eligible.map((c) => c.order)).toEqual([3, 4, 5]);
  });

  it("UT-CAPEX-034 a start cluster of 6 is capped at 5", () => {
    expect(applicableStartCluster(6)).toBe(5);
    expect(applicableStartCluster(7)).toBe(5);
    expect(applicableStartCluster(0)).toBe(0);
    const eligible = eligibleClusters(
      assumption({ clusters: [false, false, false, false, true] }), durations, 6,
    );
    expect(eligible.map((c) => c.order)).toEqual([5]);
  });

  it("UT-CAPEX-035 no eligible cluster aborts creation with the info message", () => {
    const eligible = eligibleClusters(
      assumption({ clusters: [true, false, false, false, false] }), durations, 4,
    );
    expect(eligible).toHaveLength(0);
    expect(standardContractRefusal(eligible)).toBe(MSG.noApplicableCluster);
    expect(standardContractRefusal([durations[0]])).toBeNull();
  });

  it("a cluster with an inverted or missing date range never counts", () => {
    const broken = [
      cluster({ order: 1, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 3 }),
      cluster({ order: 2, startYear: 0, endYear: 0 }),
    ];
    expect(eligibleClusters(assumption(), broken, 0)).toHaveLength(0);
  });

  it("UT-CAPEX-036 an assumption already used is not offered", () => {
    const base = {
      assumptions: [assumption()],
      subaccountIdsInCategory: ["sub-1"],
      project: { countryId: "de", technology: "Wind", startClusterNo: 0 },
      clusterDurations: durations,
    };
    expect(buildStandardOptions({ ...base, existingContracts: [] })).toHaveLength(1);
    expect(buildStandardOptions({
      ...base,
      existingContracts: [contract({ subaccountId: "sub-1", standardAssumptionId: "a-1" })],
    })).toHaveLength(0);
  });

  it("the option list matches country and technology case-insensitively", () => {
    const opts = buildStandardOptions({
      assumptions: [assumption({ technology: "WIND" })],
      subaccountIdsInCategory: ["sub-1"],
      project: { countryId: "de", technology: "wind", startClusterNo: 0 },
      existingContracts: [], clusterDurations: durations,
    });
    expect(opts).toHaveLength(1);
    expect(buildStandardOptions({
      assumptions: [assumption({ countryId: "pl" })],
      subaccountIdsInCategory: ["sub-1"],
      project: { countryId: "de", technology: "Wind", startClusterNo: 0 },
      existingContracts: [], clusterDurations: durations,
    })).toHaveLength(0);
  });

  it("UT-CAPEX-037 re-adding an existing standard contract is refused at click time", () => {
    expect(checkStandardContractClick({
      selectedRow: { type: "subaccount" }, serverHasContract: true,
    })).toEqual({ ok: false, message: MSG.duplicateStandard, removeOption: true });

    expect(checkStandardContractClick({
      selectedRow: null, serverHasContract: false,
    })).toEqual({ ok: false, message: MSG.noSubaccountSelected });

    expect(checkStandardContractClick({
      selectedRow: { type: "subaccount" }, serverHasContract: false,
    })).toEqual({ ok: true });
  });

  it("the standard sub-menu only renders above one option", () => {
    expect(showStandardSubMenu(1)).toBe(false);
    expect(showStandardSubMenu(2)).toBe(true);
  });

  it("clusters 5 and 6 are never synthesised from the milestone durations", () => {
    const synth = synthesiseClusterDates(new Date(2025, 0, 1), {
      cluster1: 6, cluster2: 6, cluster3: 12, cluster4: 6, finalInvestmentDecision: 3,
    });
    expect(synth.map((c) => c.order)).toEqual([1, 2, 3, 4]);
    expect(synth[0]).toMatchObject({ startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 7 });
    expect(synth[1]).toMatchObject({ startYear: 2025, startMonth: 7, endYear: 2026, endMonth: 1 });
  });
});

/* ══════════════════════════════════════════════════ validation gating ════ */

describe("Capex — panel validation", () => {
  it("UT-CAPEX-023 a duplicate contract name under one sub-account is blocked", () => {
    expect(describeDescriptionError("Grid connection", {
      originalDescription: null, existingNames: ["Grid connection"],
    })).toBe(MSG.duplicateContract);
    expect(canSaveContract(form({ description: "Grid connection" }), {
      existingNames: ["Grid connection"], countryName: "Germany",
      allowedStart: new Date(2023, 0, 1),
    })).toBe(false);
  });

  it("UT-CAPEX-023b an unchanged edit is not treated as a duplicate", () => {
    expect(describeDescriptionError("Grid connection", {
      originalDescription: "Grid connection", existingNames: ["Grid connection"],
    })).toBeNull();
  });

  it('UT-CAPEX-024 the word "standard" is reserved', () => {
    expect(describeDescriptionError("Standard fee", {
      originalDescription: null, existingNames: [],
    })).toBe(MSG.standardReserved);
    expect(describeDescriptionError("standard fee", {
      originalDescription: null, existingNames: [],
    })).toBe(MSG.standardReserved);
  });

  it("UT-CAPEX-025 editing a standard contract clears its flag and strips the word", () => {
    expect(applyDescriptionChange("Standard grid fee", true))
      .toEqual({ description: "grid fee", isStandardContract: false });
    expect(applyDescriptionChange("Grid fee", false))
      .toEqual({ description: "Grid fee", isStandardContract: false });
  });

  it("UT-CAPEX-026 the total-cost ceiling is 2 250 000 000 for Poland", () => {
    expect(totalCostMax("Poland")).toBe(2_250_000_000);
    expect(totalCostMax("Germany")).toBe(500_000_000);
    expect(validateTotalCost("2000000000", "Poland").valid).toBe(true);
    expect(validateTotalCost("2000000000", "Germany").valid).toBe(false);
    expect(validateTotalCost("0", "Germany").valid).toBe(false);
    expect(validateTotalCost("12.5", "Germany").valid).toBe(false);
  });

  it("the total-cost message carries the thousands-formatted ceiling", () => {
    expect(validateTotalCost("2250000001", "Poland").message)
      .toContain(formatThousands(2_250_000_000));
  });

  it("UT-CAPEX-027 a start date must be MM/YYYY and not before the allowed start", () => {
    const allowed = new Date(2023, 0, 1);
    expect(validateMonthYear("12/2022", allowed, "start")).toBe(MSG.startBefore("01/2023"));
    expect(validateMonthYear("13/2023", allowed, "start")).toBe(MSG.dateFormat);
    expect(validateMonthYear("03/2023", allowed, "start")).toBeNull();
    expect(validateMonthYear("12/2022", allowed, "end")).toBe(MSG.endBefore("01/2023"));
  });

  it("UT-CAPEX-028 Equal + By Cluster with nothing ticked cannot be saved", () => {
    expect(canSaveContract(form({
      distribution: CHOICE_COST.distributionType.equal, equalMode: "cluster",
      frequency: 1,
    }), {
      existingNames: [], countryName: "Germany", allowedStart: new Date(2023, 0, 1),
    })).toBe(false);
  });

  it("UT-CAPEX-029 a checked but disabled cluster does not count", () => {
    const ticks = [
      { checked: false, enabled: true }, { checked: true, enabled: false },
      { checked: false, enabled: true }, { checked: false, enabled: true },
      { checked: false, enabled: true },
    ];
    expect(canSaveContract(form({
      distribution: CHOICE_COST.distributionType.equal, equalMode: "cluster",
      clusterTicks: ticks, frequency: 1,
    }), {
      existingNames: [], countryName: "Germany", allowedStart: new Date(2023, 0, 1),
    })).toBe(false);
    expect(JSON.parse(byClusterJson(ticks)).Cluster2).toBe(false);
  });

  it("UT-CAPEX-030 an untouched panel cannot be saved", () => {
    expect(canSaveContract(form({ isDirty: false }), {
      existingNames: [], countryName: "Germany", allowedStart: new Date(2023, 0, 1),
    })).toBe(false);
    expect(canSaveContract(form({ isDirty: true }), {
      existingNames: [], countryName: "Germany", allowedStart: new Date(2023, 0, 1),
    })).toBe(true);
  });

  it("Individual + % needs a total cost; Individual + Absolute does not", () => {
    const ctx = {
      existingNames: [], countryName: "Germany", allowedStart: new Date(2023, 0, 1),
    };
    expect(canSaveContract(form({
      scheme: CHOICE_COST.distributionScheme.percentValues, totalCost: "",
    }), ctx)).toBe(false);
    expect(canSaveContract(form({
      scheme: CHOICE_COST.distributionScheme.absoluteValues, totalCost: "",
    }), ctx)).toBe(true);
  });

  it("Equal + dates needs both dates, both valid, and a frequency", () => {
    const ctx = {
      existingNames: [], countryName: "Germany", allowedStart: new Date(2023, 0, 1),
    };
    const base = {
      distribution: CHOICE_COST.distributionType.equal, equalMode: "dates" as const,
      startDate: "01/2024", endDate: "12/2024", frequency: 3,
    };
    expect(canSaveContract(form(base), ctx)).toBe(true);
    expect(canSaveContract(form({ ...base, frequency: null }), ctx)).toBe(false);
    expect(canSaveContract(form({ ...base, endDate: "" }), ctx)).toBe(false);
    expect(canSaveContract(form({ ...base, startDate: "12/2022" }), ctx)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ commands ════ */

describe("Capex — command bar and paid toggle", () => {
  const privileges = { canCreateCost: true, canDeleteCost: true };

  it("UT-CAPEX-052 Add New Cost needs a sub-account row", () => {
    const onContract = capexCommands({
      selected: { type: "contract" }, privileges, standardOptionCount: 1, busy: false,
    });
    expect(onContract.addNewCost).toBe(false);
    expect(onContract.edit).toBe(true);
    expect(onContract.deleteCost).toBe(true);

    const onSub = capexCommands({
      selected: { type: "subaccount" }, privileges, standardOptionCount: 1, busy: false,
    });
    expect(onSub.addNewCost).toBe(true);
    expect(onSub.edit).toBe(false);
  });

  it("UT-CAPEX-053 Delete needs the delete privilege while Edit keeps the create one", () => {
    const g = capexCommands({
      selected: { type: "contract" },
      privileges: { canCreateCost: true, canDeleteCost: false },
      standardOptionCount: 0, busy: false,
    });
    expect(g.deleteCost).toBe(false);
    expect(g.edit).toBe(true);
  });

  it("Add Standard Contract is hidden with zero options", () => {
    const g = capexCommands({
      selected: { type: "subaccount" }, privileges, standardOptionCount: 0, busy: false,
    });
    expect(g.addStandardVisible).toBe(false);
    expect(g.addStandardContract).toBe(false);
  });

  it("UT-CAPEX-038 a cluster-linked individual cost asks before being marked paid", () => {
    expect(paidToggleNeedsConfirmation({
      distribution: CHOICE_COST.distributionType.individual, linkedClusterOrder: 2,
    })).toBe(true);
  });

  it("UT-CAPEX-039 toggling paid without a cluster link writes immediately", () => {
    expect(paidToggleNeedsConfirmation({
      distribution: CHOICE_COST.distributionType.individual, linkedClusterOrder: null,
    })).toBe(false);
    expect(paidToggleNeedsConfirmation({
      distribution: CHOICE_COST.distributionType.equal, linkedClusterOrder: 2,
    })).toBe(false);
  });

  it("UT-CAPEX-040 a paid toggle with no matching cost row warns", () => {
    const costs = [cost({ id: "k1", contractId: "c-1", year: 2025, month: "march" })];
    expect(resolvePaidTarget(costs, { contractId: "c-1", year: 2025, month: 3 }))
      .toEqual({ costId: "k1" });
    expect(resolvePaidTarget(costs, { contractId: "c-1", year: 2025, month: 4 }))
      .toEqual({ error: MSG.noCostRow });
  });
});

/* ══════════════════════════════════════════════════════════ comments ════ */

describe("Capex — comment threads", () => {
  const root = comment({ id: "r1", createdOn: "2026-01-01T00:00:00Z", text: "day 1" });
  const reply1 = comment({
    id: "p1", parentId: "r1", rootId: "r1",
    createdOn: "2026-01-02T00:00:00Z", text: "day 2",
  });
  const reply2 = comment({
    id: "p2", parentId: "r1", rootId: "r1",
    createdOn: "2026-01-05T00:00:00Z", text: "day 5",
  });

  it("UT-CAPEX-042 a thread flattens to its latest reply", () => {
    const [t] = commentThreads([root, reply1, reply2]);
    expect(t.lastActivityOn).toBe("2026-01-05T00:00:00Z");
    expect(t.latestText).toBe("day 5");
    expect(t.replies).toHaveLength(2);
  });

  it("a thread with no reply falls back to the root", () => {
    const [t] = commentThreads([root]);
    expect(t.lastActivityOn).toBe(root.createdOn);
    expect(t.latestText).toBe("day 1");
  });

  it("UT-CAPEX-043 the grid badge ignores resolved threads", () => {
    const open = commentThreads([root]);
    expect(gridCommentFlags(open, [], 2025).get("c-1")!.general).toBe(true);
    const closed = commentThreads([{ ...root, resolved: true }]);
    expect(closed.length).toBe(1);
    expect(gridCommentFlags(closed, [], 2025).has("c-1")).toBe(false);
  });

  it("UT-CAPEX-044 a month-cell badge matches both the year and the month", () => {
    const paymentComment = comment({
      id: "r2", costId: "cost-9",
      commentType: CHOICE_COST.capexCommentType.commentsToPaymentDate,
    });
    const costs = [cost({ id: "cost-9", contractId: "c-1", year: 2025, month: 3 })];
    const threads = commentThreads([paymentComment]);
    expect(gridCommentFlags(threads, costs, 2024).has("c-1")).toBe(true);
    expect(gridCommentFlags(threads, costs, 2024).get("c-1")!.months[2]).toBe(false);
    expect(gridCommentFlags(threads, costs, 2025).get("c-1")!.months[2]).toBe(true);
  });

  it("UT-CAPEX-045 resolving a root resolves its replies", () => {
    const out = resolveThread([root, reply1, reply2], "r1", "u-9");
    expect(out.every((c) => c.resolved)).toBe(true);
    expect(out.every((c) => c.resolvedById === "u-9")).toBe(true);
  });

  it("UT-CAPEX-046 deleting a root stages its replies and renumbers the survivors", () => {
    const threads = commentThreads([
      comment({ id: "r1", createdOn: "2026-01-01T00:00:00Z" }),
      comment({ id: "r2", createdOn: "2026-01-02T00:00:00Z" }),
      comment({ id: "p2", parentId: "r2", createdOn: "2026-01-03T00:00:00Z" }),
      comment({ id: "r3", createdOn: "2026-01-04T00:00:00Z" }),
    ]);
    expect(threads.map((t) => t.sequenceNumber)).toEqual([1, 2, 3]);
    const plan = planDeleteRoot(threads, "r2");
    expect(plan.deletedIds.sort()).toEqual(["p2", "r2"]);
    expect(plan.remaining.map((t) => [t.root.id, t.sequenceNumber]))
      .toEqual([["r1", 1], ["r3", 2]]);
  });

  it("UT-CAPEX-047 pin + sort ordering", () => {
    const threads = commentThreads([
      comment({
        id: "g1", createdOn: "2026-01-01T00:00:00Z",
        commentType: CHOICE_COST.capexCommentType.generalComment,
      }),
      comment({
        id: "p1", createdOn: "2026-01-02T00:00:00Z", costId: "k1",
        commentType: CHOICE_COST.capexCommentType.commentsToPaymentDate,
      }),
      comment({
        id: "p2", createdOn: "2026-01-03T00:00:00Z", costId: "k2",
        commentType: CHOICE_COST.capexCommentType.commentsToPaymentDate,
      }),
    ]);
    const sorted = sortComments(threads, {
      pinGeneral: true, order: "newest", showResolved: true,
    });
    expect(sorted.map((t) => t.root.id)).toEqual(["g1", "p2", "p1"]);
    const unpinned = sortComments(threads, {
      pinGeneral: false, order: "oldest", showResolved: true,
    });
    expect(unpinned.map((t) => t.root.id)).toEqual(["g1", "p1", "p2"]);
  });

  it("UT-CAPEX-048 resolved threads are hidden unless the box is ticked", () => {
    const threads = commentThreads([
      comment({ id: "r1", resolved: true }),
      comment({ id: "r2", createdOn: "2026-02-01T00:00:00Z" }),
    ]);
    expect(sortComments(threads, {
      pinGeneral: false, order: "oldest", showResolved: false,
    })).toHaveLength(1);
    expect(sortComments(threads, {
      pinGeneral: false, order: "oldest", showResolved: true,
    })).toHaveLength(2);
  });

  it("UT-CAPEX-049 comment text is capped at 250 characters", () => {
    const r = truncateComment("x".repeat(300));
    expect(r.text).toHaveLength(250);
    expect(r.counter).toBe("250 / 250");
  });

  it("UT-CAPEX-050 save is blocked while any comment box is empty", () => {
    expect(canSaveComments([
      { id: "1", text: "ok", isDirty: true, isModified: false },
      { id: "2", text: "  ", isDirty: true, isModified: false },
    ], [])).toBe(false);
    expect(canSaveComments([
      { id: "1", text: "ok", isDirty: true, isModified: false },
    ], [])).toBe(true);
    expect(canSaveComments([
      { id: "1", text: "ok", isDirty: false, isModified: false },
    ], [])).toBe(false);
    expect(canSaveComments([
      { id: "1", text: "ok", isDirty: false, isModified: false },
    ], ["deleted-1"])).toBe(true);
  });

  it("UT-CAPEX-051 payment-date comments are refused on equal-distributed contracts", () => {
    expect(paymentDateCommentsAllowed(
      contract({ distribution: CHOICE_COST.distributionType.equal }),
    )).toBe(false);
    expect(paymentDateCommentsAllowed(
      contract({ distribution: CHOICE_COST.distributionType.individual }),
    )).toBe(true);
  });

  it("edit icons are hidden on resolved threads", () => {
    expect(commentEditable({ resolved: true })).toBe(false);
    expect(commentEditable({ resolved: false })).toBe(true);
  });

  it("UT-CAPEX-041 deleting a contract deletes its comments in the same plan", () => {
    const plan = planDeleteContract("c-1", [
      comment({ id: "a", contractId: "c-1" }),
      comment({ id: "b", contractId: "c-1" }),
      comment({ id: "c", contractId: "c-1" }),
      comment({ id: "d", contractId: "c-2" }),
    ]);
    expect(plan.commentIds).toEqual(["a", "b", "c"]);
    expect(plan.contractId).toBe("c-1");
  });
});

/* ═══════════════════════════════════════════════════ summary and misc ════ */

describe("Capex — summary tab and error states", () => {
  it("UT-CAPEX-055 the summary lists per-category totals in the project currency", () => {
    const rows = summaryRows(
      [{ id: "1", name: "Grid connection" }, { id: "2", name: "Civil works" }],
      new Map([["1", 1_234_567], ["2", -5]]),
    );
    expect(rows).toEqual([
      { id: "1", name: "Grid connection", sum: 1_234_567 },
      { id: "2", name: "Civil works", sum: 0 },
    ]);
    expect(formatSummaryAmount(1_234_567, "PLN")).toBe("1,234,567 PLN");
    expect(formatSummaryAmount(0, null)).toBe("0 EUR");
  });

  it("UT-CAPEX-057 a save failure has a message that keeps the user informed", () => {
    expect(MSG.saveFailed).toContain("Something went wrong saving the Capex data");
  });

  it("UT-CAPEX-058 a missing projectId is an error state, not a hard-coded GUID", () => {
    expect(MSG.missingProject).toContain("hard-coded test project");
    // The canvas' fallback GUID must appear nowhere in the ported rules.
    expect(JSON.stringify(MSG)).not.toContain("33b9cc79");
  });

  it("the dead CAPEX margin feature is documented as dead and unused", () => {
    expect(DEAD_CAPEX_MARGIN.isDead).toBe(true);
    expect(DEAD_CAPEX_MARGIN.defaultProjectCostsMarginValue).toBe(10);
  });
});
