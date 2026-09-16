/**
 * Contracts Screen — unit tests. IDs are the spec's `UT-CONTR-nnn`.
 *
 * Two of these pin CORRECTIONS to the canvas rather than parity: UT-CONTR-017
 * (`Margin = No` must add nothing) and UT-CONTR-049 (Delete must check the DELETE
 * privilege). Both keep a `…CanvasParity` counterpart so the divergence is documented in
 * executable form.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_COST, CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER } from "@/data/entities";
import {
  CONTR_MSG, CONTRACT_COSTS_MAX, CONTRACT_TYPE_LABEL, CONTRACT_COMMAND_LABELS,
  buildAccountTree, markUsedAccounts, selectedLevel3Ids, toClosingDate, devCoCosts,
  costsUntilClosing, costsAfterClosing, totalCosts, totalCostOfContract,
  totalCostOfContractCanvasParity, fabricMarginDefaults, fabricRowsForProject,
  contractName, rightsContractName, paymentTargetName, devCoCostName,
  contractWritePayload, planDevCoCostSet, planDeleteContract, validateCostValue,
  validatePaymentPercentage, validatePaymentDate, paymentTargetHeadroom,
  canAddPaymentTarget, canSaveContract, canSaveRightsContract, contractCommands,
  contractCommandsCanvasParity, paymentTargetCommands, marginDisplay, panelForContract,
  groupByContractType, deriveFigures,
  type CapexAccountRow, type DevCoCapexContract, type CapexCostForContract,
  type BopContract, type PaymentTarget, type DevCoCostJoin, type BopAssumption,
  type ContractForm, type AccountNode,
} from "./rules";

/* ────────────────────────────────────────────────────────────────── fixtures */

const acc = (
  id: string, number: string, parentId: string | null, order = 1, name = `A${number}`,
): CapexAccountRow => ({ id, number, parentId, order, name });

/** root 00001 → L1 (10001, 10006-excluded) → L2 (10201) → L3 (10203, 10204) */
const accountRows: CapexAccountRow[] = [
  acc("root", "00001", null),
  acc("l1", "10001", "root", 1, "Grid"),
  acc("l1x", CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER, "root", 2, "Excluded"),
  acc("l2", "10201", "l1", 1, "Civil"),
  acc("l2x", "10601", "l1x", 1, "Excluded child"),
  acc("l3a", "10203", "l2", 1, "Cabling"),
  acc("l3b", "10204", "l2", 2, "Foundations"),
  acc("l3x", "10603", "l2x", 1, "Excluded grandchild"),
];

const capexContract = (o: Partial<DevCoCapexContract> = {}): DevCoCapexContract => ({
  id: "cc-1", accountId: "l3a", totalCost: 50_000,
  costType: CHOICE_COST.costPaidType.devCo, ...o,
});

const costRow = (o: Partial<CapexCostForContract> = {}): CapexCostForContract => ({
  contractId: "cc-1", accountId: "l3a", year: 2027, month: 6, cost: 100,
  costType: CHOICE_COST.costPaidType.devCo, ...o,
});

const bop = (o: Partial<BopContract> = {}): BopContract => ({
  id: "b-1", name: "BoP-9999940-Main BoP", description: "Main BoP",
  contractType: CHOICE_COST.bopContractTypes.development, closingDate: "2027-06-15",
  costsUntilClosingType: CHOICE_COST.closingDateType.plan,
  costsUntilClosingPlan: null, costsUntilClosingActual: null,
  costsAfterClosingType: CHOICE_COST.closingDateType.plan,
  costsAfterClosingPlan: null, costsAfterClosingActual: null,
  totalCostsType: CHOICE_COST.totalCostsType.calculated,
  totalCostsCalculated: null, totalCostsOverwrite: null,
  margin: false, marginType: null, marginPercentage: null, marginFixedValue: null,
  totalCostOfContract: null, isMarginStandardAssumption: false, isFolded: true, ...o,
});

const target = (o: Partial<PaymentTarget> = {}): PaymentTarget => ({
  id: "t-1", name: "BoP-PT-Main BoP-Mobilisation", description: "Mobilisation",
  note: null, contractId: "b-1", paymentDate: "04/2027", totalCostsContract: 40, ...o,
});

const fabric = (o: Partial<BopAssumption> = {}): BopAssumption => ({
  countryname: "Germany", technology: "Wind", contracttype: "development contract",
  margin: true, margintype: "Percentage", marginvalue: 7, ...o,
});

const form = (o: Partial<ContractForm> = {}): ContractForm => ({
  description: "Main BoP", contractType: CHOICE_COST.bopContractTypes.development,
  closingDate: "2027-06-15",
  untilType: CHOICE_COST.closingDateType.plan, untilActual: "",
  afterType: CHOICE_COST.closingDateType.plan, afterActual: "",
  totalType: CHOICE_COST.totalCostsType.calculated, totalOverwrite: "",
  marginEnabled: false, marginType: null, marginPercentage: "", marginFixedValue: "",
  isMarginStandardAssumption: false, isDirty: true, ...o,
});

const perms = { canCreate: true, canEditRecord: true, canDeleteRecord: true };
const closing = { year: 2027, month: 6 };

/* ═════════════════════════════════════════════════════════ the account tree ════ */

describe("Contracts — the CAPEX account picker", () => {
  it("UT-CONTR-002 the tree has three levels under 00001", () => {
    const tree = buildAccountTree(accountRows, []);
    expect(tree.filter((n) => n.level === 1).map((n) => n.id)).toEqual(["l1"]);
    expect(tree.filter((n) => n.level === 2).map((n) => n.id)).toEqual(["l2"]);
    expect(tree.filter((n) => n.level === 3).map((n) => n.id)).toEqual(["l3a", "l3b"]);
    expect(tree.find((n) => n.id === "l2")!.parentIdLevel1).toBe("l1");
    expect(tree.find((n) => n.id === "l3a")!.parentIdLevel2).toBe("l2");
    expect(tree.find((n) => n.id === "l1")!.childCount).toBe(1);
  });

  it("UT-CONTR-003 account number 10006 and its descendants are excluded", () => {
    const tree = buildAccountTree(accountRows, []);
    expect(tree.some((n) => n.number === CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER)).toBe(false);
    expect(tree.some((n) => n.id === "l2x")).toBe(false);
    expect(tree.some((n) => n.id === "l3x")).toBe(false);
  });

  it("an empty or root-less account list yields an empty tree", () => {
    expect(buildAccountTree([], [])).toEqual([]);
    expect(buildAccountTree([acc("x", "99999", null)], [])).toEqual([]);
  });

  it("UT-CONTR-004 only level-3 rows carry a total cost", () => {
    const tree = buildAccountTree(accountRows, [
      capexContract({ id: "c1", accountId: "l3a", totalCost: 40_000 }),
      capexContract({ id: "c2", accountId: "l3a", totalCost: 50_000 }),
    ]);
    expect(tree.find((n) => n.id === "l3a")!.totalCost).toBe(90_000);
    expect(tree.find((n) => n.id === "l2")!.totalCost).toBe(0);
    expect(tree.find((n) => n.id === "l1")!.totalCost).toBe(0);
  });

  it("UT-CONTR-005 only DevCo CAPEX contracts feed the tree", () => {
    const tree = buildAccountTree(accountRows, [
      capexContract({ id: "c1", accountId: "l3a", totalCost: 40_000 }),
      capexContract({
        id: "c2", accountId: "l3a", totalCost: 999_999,
        costType: CHOICE_COST.costPaidType.spv,
      }),
    ]);
    expect(tree.find((n) => n.id === "l3a")!.totalCost).toBe(40_000);
  });

  it("UT-CONTR-006 an account used by another contract is flagged", () => {
    const joins: DevCoCostJoin[] = [{ id: "j1", contractId: "X", accountId: "l3a" }];
    const marked = markUsedAccounts(buildAccountTree(accountRows, []), joins, "Y");
    expect(marked.find((n) => n.id === "l3a")!.used).toBe(true);
    expect(marked.find((n) => n.id === "l3a")!.usedInContractId).toBe("X");
    expect(marked.find((n) => n.id === "l3b")!.used).toBe(false);
  });

  it("UT-CONTR-007/038 accounts used by the contract being edited are ticked, not flagged", () => {
    const joins: DevCoCostJoin[] = [
      { id: "j1", contractId: "X", accountId: "l3a" },
      { id: "j2", contractId: "X", accountId: "l3b" },
    ];
    const marked = markUsedAccounts(buildAccountTree(accountRows, []), joins, "X");
    expect(marked.find((n) => n.id === "l3a")!.used).toBe(false);
    expect(marked.find((n) => n.id === "l3a")!.selected).toBe(true);
    expect(selectedLevel3Ids(marked)).toEqual(["l3a", "l3b"]);
  });
});

/* ═══════════════════════════════════════════════════════════ the cost split ════ */

describe("Contracts — the closing-date cost split", () => {
  const costs = [
    costRow({ year: 2026, month: 3, cost: 100 }),
    costRow({ year: 2027, month: 6, cost: 50 }),
    costRow({ year: 2027, month: 7, cost: 30 }),
  ];
  const ids = ["l3a"];

  it("UT-CONTR-008 costs until closing INCLUDE the closing month", () => {
    expect(costsUntilClosing(costs, closing, ids)).toBe(150);
  });

  it("UT-CONTR-009 costs after closing EXCLUDE the closing month", () => {
    expect(costsAfterClosing(costs, closing, ids)).toBe(30);
  });

  it("UT-CONTR-010 until + after equals the unfiltered total", () => {
    const total = costs.reduce((a, c) => a + c.cost, 0);
    expect(costsUntilClosing(costs, closing, ids)! + costsAfterClosing(costs, closing, ids)!)
      .toBe(total);
  });

  it("the canvas' two-sum form agrees with a plain month-index comparison", () => {
    const monthIndex = (y: number, m: number) => y * 12 + m;
    const cut = monthIndex(closing.year, closing.month);
    const naiveUntil = costs
      .filter((c) => monthIndex(c.year, c.month) <= cut)
      .reduce((a, c) => a + c.cost, 0);
    expect(costsUntilClosing(costs, closing, ids)).toBe(naiveUntil);
  });

  it("UT-CONTR-011 no closing date yields blank sums", () => {
    expect(costsUntilClosing(costs, null, ids)).toBeUndefined();
    expect(costsAfterClosing(costs, null, ids)).toBeUndefined();
    expect(toClosingDate(null)).toBeNull();
    expect(toClosingDate("not a date")).toBeNull();
    expect(toClosingDate("2027-06-15")).toEqual({ year: 2027, month: 6 });
  });

  it("UT-CONTR-012 only SELECTED LEVEL-3 accounts contribute", () => {
    // A level-2 parent ticked with no level-3 child contributes nothing.
    const tree = buildAccountTree(accountRows, []).map((n) =>
      n.id === "l2" ? { ...n, selected: true } : n);
    expect(selectedLevel3Ids(tree)).toEqual([]);
    expect(costsUntilClosing(costs, closing, selectedLevel3Ids(tree))).toBe(0);
    expect(costsAfterClosing(costs, closing, selectedLevel3Ids(tree))).toBe(0);
  });

  it("SPV cost rows never reach the sums", () => {
    const mixed = [
      costRow({ cost: 100 }),
      costRow({ cost: 999, costType: CHOICE_COST.costPaidType.spv }),
    ];
    expect(devCoCosts(mixed)).toHaveLength(1);
    expect(costsUntilClosing(mixed, closing, ids)).toBe(100);
  });

  it("UT-CONTR-053 a project with no DevCo costs computes zeros and still saves", () => {
    expect(costsUntilClosing([], closing, ids)).toBe(0);
    expect(costsAfterClosing([], closing, ids)).toBe(0);
    expect(canSaveContract(form(), ["l3a"], { until: 0, after: 0 })).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════ the totals ════ */

describe("Contracts — totals and margin", () => {
  it("UT-CONTR-013 Total Costs uses Actual when the radio says Actual", () => {
    expect(totalCosts(
      {
        untilType: CHOICE_COST.closingDateType.actual, untilActual: "12000",
        afterType: CHOICE_COST.closingDateType.plan, afterActual: "",
        totalType: CHOICE_COST.totalCostsType.calculated, totalOverwrite: "",
      },
      { until: 99_999, after: 4000 },
    )).toBe(16_000);
  });

  it("UT-CONTR-014 Total Costs Overwrite ignores the computed halves", () => {
    expect(totalCosts(
      {
        untilType: CHOICE_COST.closingDateType.plan, untilActual: "",
        afterType: CHOICE_COST.closingDateType.plan, afterActual: "",
        totalType: CHOICE_COST.totalCostsType.overwrite, totalOverwrite: "25000",
      },
      { until: 1, after: 2 },
    )).toBe(25_000);
  });

  it("a blank half makes the calculated total blank, never NaN", () => {
    expect(totalCosts(
      {
        untilType: CHOICE_COST.closingDateType.actual, untilActual: "",
        afterType: CHOICE_COST.closingDateType.plan, afterActual: "",
        totalType: CHOICE_COST.totalCostsType.calculated, totalOverwrite: "",
      },
      { until: 100, after: 200 },
    )).toBeUndefined();
  });

  it("UT-CONTR-015 a percentage margin multiplies the total", () => {
    expect(totalCostOfContract(100_000, {
      enabled: true, type: CHOICE_COST.contractMarginType.percentage,
      percentage: "8", fixedValue: "",
    })).toBe(108_000);
  });

  it("UT-CONTR-016 a fixed margin adds to the total", () => {
    expect(totalCostOfContract(100_000, {
      enabled: true, type: CHOICE_COST.contractMarginType.fixedValue,
      percentage: "", fixedValue: "5000",
    })).toBe(105_000);
  });

  it("UT-CONTR-017 Margin = No adds NOTHING (the canvas would add the stale fixed value)", () => {
    const margin = {
      enabled: false, type: CHOICE_COST.contractMarginType.fixedValue,
      percentage: "", fixedValue: "5000",
    };
    expect(totalCostOfContract(100_000, margin)).toBe(100_000);
    // SOURCE DEFECT parity: this is what the shipped canvas app returns.
    expect(totalCostOfContractCanvasParity(100_000, margin)).toBe(105_000);
  });

  it("UT-CONTR-018 a non-numeric margin percentage yields blank, never NaN", () => {
    const r = totalCostOfContract(100_000, {
      enabled: true, type: CHOICE_COST.contractMarginType.percentage,
      percentage: "abc", fixedValue: "",
    });
    expect(r).toBeUndefined();
    expect(Number.isNaN(r as unknown as number)).toBe(false);
    expect(totalCostOfContract(undefined, {
      enabled: false, type: null, percentage: "", fixedValue: "",
    })).toBeUndefined();
  });

  it("UT-CONTR-056 every figure recomputes without a Recalculate click", () => {
    const tree = buildAccountTree(accountRows, []).map((n) =>
      n.id === "l3a" ? { ...n, selected: true } : n);
    const costs = [
      costRow({ year: 2026, month: 3, cost: 100 }),
      costRow({ year: 2027, month: 7, cost: 30 }),
    ];
    const before = deriveFigures(form({ closingDate: "2027-06-15" }), costs, tree);
    expect(before).toMatchObject({ until: 100, after: 30, total: 130 });
    // Move the closing date past the second cost and everything shifts.
    const after = deriveFigures(form({ closingDate: "2027-12-15" }), costs, tree);
    expect(after).toMatchObject({ until: 130, after: 0, total: 130 });
  });
});

/* ═════════════════════════════════════════════════════════ the Fabric source ════ */

describe("Contracts — Fabric margin defaults", () => {
  it("UT-CONTR-019 the defaults populate a new Development contract", () => {
    const d = fabricMarginDefaults([fabric()], "Development Contract")!;
    expect(d.marginType).toBe(CHOICE_COST.contractMarginType.percentage);
    expect(d.marginPercentage).toBe("7");
    expect(d.marginEnabled).toBe(true);
    expect(d.isMarginStandardAssumption).toBe(true);
  });

  it("UT-CONTR-020 the lookup is case-insensitive on contracttype", () => {
    const d = fabricMarginDefaults(
      [fabric({ contracttype: "CONSTRUCTION CONTRACT", margintype: "Fixed Value",
        marginvalue: 5000 })],
      CONTRACT_TYPE_LABEL[CHOICE_COST.bopContractTypes.construction],
    )!;
    expect(d.marginType).toBe(CHOICE_COST.contractMarginType.fixedValue);
    expect(d.marginFixedValue).toBe("5000");
  });

  it("UT-CONTR-021/055 a missing or unavailable Fabric row leaves the margin blank", () => {
    expect(fabricMarginDefaults([], "Development Contract")).toBeNull();
    expect(fabricMarginDefaults([fabric({ contracttype: "other" })], "Development Contract"))
      .toBeNull();
    expect(CONTR_MSG.fabricUnavailable).toContain("The panel still opens");
  });

  it("UT-CONTR-022 reset-to-standard restores exactly what the Fabric row says", () => {
    const rows = [fabric({ marginvalue: 7 })];
    const first = fabricMarginDefaults(rows, "Development Contract")!;
    // The user overwrites to 12; resetting recomputes from the same source.
    const reset = fabricMarginDefaults(rows, "Development Contract")!;
    expect(reset.marginPercentage).toBe(first.marginPercentage);
    expect(reset.marginPercentage).toBe("7");
    expect(CONTR_MSG.resetTooltip).toBe("Reset to standard assumption.");
  });

  it("the rows are pre-filtered on country and technology", () => {
    const rows = [
      fabric({ countryname: "Germany", technology: "Wind" }),
      fabric({ countryname: "Poland", technology: "Wind" }),
      fabric({ countryname: "Germany", technology: "PV" }),
    ];
    expect(fabricRowsForProject(rows, { countryName: "Germany", technology: "Wind" }))
      .toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════ naming and payloads ════ */

describe("Contracts — naming and write payloads", () => {
  it("UT-CONTR-032 the contract name convention", () => {
    expect(contractName("9999940", "Main BoP")).toBe("BoP-9999940-Main BoP");
  });

  it("UT-CONTR-033 the Rights contract name uses ITS OWN description", () => {
    expect(rightsContractName("9999940", "Land rights")).toBe("BoP RC-9999940-Land rights");
  });

  it("UT-CONTR-035 the DevCo-cost join name", () => {
    expect(devCoCostName("10203", "Cabling")).toBe("10203-Cabling");
  });

  it("UT-CONTR-046 the payment-target name convention", () => {
    expect(paymentTargetName("Main BoP", "Mobilisation")).toBe("BoP-PT-Main BoP-Mobilisation");
  });

  it("UT-CONTR-029 Plan and Actual are mutually exclusive on write", () => {
    const p = contractWritePayload(
      form({ untilType: CHOICE_COST.closingDateType.plan, untilActual: "123" }),
      { until: 900, after: 100 },
    );
    expect(p.costsUntilClosingPlan).toBe(900);
    expect(p.costsUntilClosingActual).toBeNull();

    const q = contractWritePayload(
      form({ untilType: CHOICE_COST.closingDateType.actual, untilActual: "123" }),
      { until: 900, after: 100 },
    );
    expect(q.costsUntilClosingPlan).toBeNull();
    expect(q.costsUntilClosingActual).toBe(123);
  });

  it("UT-CONTR-030 Calculated and Overwrite are mutually exclusive on write", () => {
    const p = contractWritePayload(
      form({ totalType: CHOICE_COST.totalCostsType.overwrite, totalOverwrite: "25000" }),
      { until: 900, after: 100 },
    );
    expect(p.totalCostsOverwrite).toBe(25_000);
    expect(p.totalCostsCalculated).toBeNull();
  });

  it("UT-CONTR-031 the margin fields are blanked when the margin block is hidden", () => {
    const p = contractWritePayload(
      form({
        marginEnabled: false, marginType: CHOICE_COST.contractMarginType.fixedValue,
        marginFixedValue: "5000",
      }),
      { until: 900, after: 100 },
    );
    expect(p.marginType).toBeNull();
    expect(p.marginPercentage).toBeNull();
    expect(p.marginFixedValue).toBeNull();
    // …and the corrected total ignores the stale fixed value.
    expect(p.totalCostOfContract).toBe(1000);
  });

  it("UT-CONTR-036 Is Standard Contract is always No on save", () => {
    const p = contractWritePayload(
      form({ isMarginStandardAssumption: true }), { until: 1, after: 1 },
    );
    expect(p.isStandardContract).toBe(false);
    expect(p.isMarginStandardAssumption).toBe(true);
    expect(p.bopStandardAssumptionContract).toBeNull();
  });

  it("UT-CONTR-034 saving REPLACES the DevCo-cost set", () => {
    const tree: AccountNode[] = buildAccountTree(accountRows, []).map((n) =>
      n.id === "l3b" ? { ...n, selected: true } : n);
    const joins: DevCoCostJoin[] = [
      { id: "j1", contractId: "b-1", accountId: "l3a" },
      { id: "j2", contractId: "b-1", accountId: "l3b" },
      { id: "j3", contractId: "other", accountId: "l3a" },
    ];
    const plan = planDevCoCostSet(tree, joins, "b-1");
    expect(plan.deleteIds).toEqual(["j1", "j2"]);
    expect(plan.create).toEqual([{ accountId: "l3b", name: "10204-Foundations" }]);
  });

  it("UT-CONTR-048 deleting a contract removes its targets and joins explicitly", () => {
    const plan = planDeleteContract(
      "b-1",
      [target({ id: "t1" }), target({ id: "t2" }), target({ id: "t3", contractId: "b-2" })],
      [
        { id: "j1", contractId: "b-1", accountId: "l3a" },
        { id: "j2", contractId: "b-1", accountId: "l3b" },
        { id: "j3", contractId: "b-1", accountId: "l3a" },
        { id: "j4", contractId: "b-2", accountId: "l3a" },
      ],
    );
    expect(plan.targetIds).toEqual(["t1", "t2"]);
    expect(plan.joinIds).toEqual(["j1", "j2", "j3"]);
    expect(plan.targetIds.length + plan.joinIds.length + 1).toBe(6);
  });
});

/* ══════════════════════════════════════════════════════════════ payment targets ════ */

describe("Contracts — payment targets", () => {
  it("UT-CONTR-039 payment targets are capped at 100 in total", () => {
    expect(canAddPaymentTarget([target({ totalCostsContract: 100 })])).toBe(false);
    expect(canAddPaymentTarget([target({ totalCostsContract: 99.9 })])).toBe(true);
    expect(canAddPaymentTarget([])).toBe(true);
  });

  it("UT-CONTR-040 the headroom excludes the row being edited", () => {
    const targets = [
      target({ id: "t1", totalCostsContract: 40 }),
      target({ id: "t2", totalCostsContract: 30 }),
    ];
    expect(paymentTargetHeadroom(targets, "t2")).toBe(60);
    expect(paymentTargetHeadroom(targets, null)).toBe(30);
  });

  it("UT-CONTR-041 the percentage is one-decimal", () => {
    expect(validatePaymentPercentage("12.34", 100)).toBe(CONTR_MSG.oneDecimal);
    expect(validatePaymentPercentage("12.3", 100)).toBeNull();
    expect(validatePaymentPercentage("", 100)).toBeNull();
  });

  it("UT-CONTR-042 a value above the headroom is rejected with its message", () => {
    expect(validatePaymentPercentage("61", 60)).toBe(CONTR_MSG.headroom(60));
    expect(CONTR_MSG.headroom(60)).toBe("Please select a value between 0 and 60.0");
    expect(validatePaymentPercentage("60", 60)).toBeNull();
  });

  it("UT-CONTR-043 the payment date must be MM/YYYY", () => {
    expect(validatePaymentDate("2027/04", null)).toBe(CONTR_MSG.paymentDateFormat);
    expect(validatePaymentDate("13/2027", null)).toBe(CONTR_MSG.paymentDateFormat);
    expect(validatePaymentDate("04/2027", null)).toBeNull();
  });

  it("UT-CONTR-044 the payment date must not precede the project start", () => {
    expect(validatePaymentDate("02/2027", "2027-03-01"))
      .toBe("Payment date must be greater project start date 03/2027");
    expect(validatePaymentDate("03/2027", "2027-03-01")).toBeNull();
    // Compared at MONTH precision — the project start's day-of-month is irrelevant.
    expect(validatePaymentDate("03/2027", "2027-03-28")).toBeNull();
  });

  it("UT-CONTR-045 the payment date must not be blank", () => {
    expect(validatePaymentDate("", "2027-03-01")).toBe(CONTR_MSG.paymentDateBlank);
  });

  it("UT-CONTR-047 payment-target commands are scoped to their card", () => {
    const inScope = paymentTargetCommands({
      contract: bop({ id: "X" }), cardContractId: "X",
      selectedTarget: target(), targets: [], permissions: perms,
    });
    expect(inScope.edit).toBe(true);
    const outOfScope = paymentTargetCommands({
      contract: bop({ id: "X" }), cardContractId: "Y",
      selectedTarget: target(), targets: [], permissions: perms,
    });
    expect(outOfScope.edit).toBe(false);
    expect(outOfScope.delete).toBe(false);
    expect(outOfScope.addPeriod).toBe(false);
  });

  it("the payment-target bar now carries the privilege gates the canvas lacked", () => {
    const g = paymentTargetCommands({
      contract: bop({ id: "X" }), cardContractId: "X", selectedTarget: target(),
      targets: [], permissions: { canCreate: false, canEditRecord: false, canDeleteRecord: false },
    });
    expect(g).toEqual({ addPeriod: false, edit: false, delete: false });
  });
});

/* ═════════════════════════════════════════════════════════ gating and display ════ */

describe("Contracts — save gate, commands and card display", () => {
  const computed = { until: 900, after: 100 };

  it("UT-CONTR-023 save requires at least one selected account", () => {
    expect(canSaveContract(form(), [], computed)).toBe(false);
    expect(canSaveContract(form(), ["l3a"], computed)).toBe(true);
  });

  it("UT-CONTR-024 save requires a closing date", () => {
    expect(canSaveContract(form({ closingDate: null }), ["l3a"], computed)).toBe(false);
  });

  it("UT-CONTR-025 save requires the branch matching each radio", () => {
    // Until = Plan with no computed Plan figure (no closing date behind it).
    expect(canSaveContract(
      form({ untilType: CHOICE_COST.closingDateType.plan, untilActual: "12000" }),
      ["l3a"], { until: undefined, after: 100 },
    )).toBe(false);
    // Until = Actual with a blank Actual box.
    expect(canSaveContract(
      form({ untilType: CHOICE_COST.closingDateType.actual, untilActual: "" }),
      ["l3a"], computed,
    )).toBe(false);
  });

  it("UT-CONTR-026 Margin = Yes requires the field matching the margin type", () => {
    expect(canSaveContract(form({
      marginEnabled: true, marginType: CHOICE_COST.contractMarginType.percentage,
      marginPercentage: "",
    }), ["l3a"], computed)).toBe(false);
    expect(canSaveContract(form({
      marginEnabled: true, marginType: CHOICE_COST.contractMarginType.percentage,
      marginPercentage: "8",
    }), ["l3a"], computed)).toBe(true);
    // Margin on with no type chosen at all.
    expect(canSaveContract(form({ marginEnabled: true, marginType: null }), ["l3a"], computed))
      .toBe(false);
  });

  it("UT-CONTR-027 Margin = No requires no margin field", () => {
    expect(canSaveContract(form({
      marginEnabled: false, marginPercentage: "", marginFixedValue: "",
    }), ["l3a"], computed)).toBe(true);
  });

  it("an untouched panel cannot be saved (the Recalculate gate's replacement)", () => {
    expect(canSaveContract(form({ isDirty: false }), ["l3a"], computed)).toBe(false);
  });

  it("UT-CONTR-028 cost values are capped at 1 000 000 000", () => {
    expect(CONTRACT_COSTS_MAX).toBe(1_000_000_000);
    expect(validateCostValue("1000000001")).toBe(CONTR_MSG.costRange);
    expect(validateCostValue("1000000000")).toBeNull();
    expect(validateCostValue("12.345")).toBe(CONTR_MSG.costRange);
    expect(validateCostValue("")).toBeNull();
    expect(canSaveContract(
      form({ untilType: CHOICE_COST.closingDateType.actual, untilActual: "1000000001" }),
      ["l3a"], computed,
    )).toBe(false);
  });

  it("UT-CONTR-050 the three Add commands require the create permission", () => {
    const g = contractCommands({
      selected: null,
      permissions: { ...perms, canCreate: false },
      busy: false,
    });
    expect(g.addDevelopment).toBe(false);
    expect(g.addConstruction).toBe(false);
    expect(g.addRights).toBe(false);
  });

  it("GUIDE r07 Edit and Delete are disabled until a row is selected, even with full permissions", () => {
    const g = contractCommands({ selected: null, permissions: perms, busy: false });
    expect(g.edit).toBe(false);
    expect(g.delete).toBe(false);
    const selected = contractCommands({ selected: bop(), permissions: perms, busy: false });
    expect(selected.edit).toBe(true);
    expect(selected.delete).toBe(true);
  });

  it("GUIDE r07 the command bar's own labels are verbatim", () => {
    expect(CONTRACT_COMMAND_LABELS).toEqual({
      addDevelopment: "Add Development Contract",
      addConstruction: "Add Construction Contract",
      addRights: "Add Project Rights Contract",
      edit: "Edit",
      delete: "Delete",
    });
  });

  it("UT-CONTR-049 Delete requires the DELETE privilege (the canvas checks Edit)", () => {
    const permissions = { canCreate: true, canEditRecord: true, canDeleteRecord: false };
    const g = contractCommands({ selected: bop(), permissions, busy: false });
    expect(g.delete).toBe(false);
    expect(g.edit).toBe(true);
    // SOURCE DEFECT parity: the canvas enables Delete off the EDIT privilege.
    expect(contractCommandsCanvasParity({ selected: bop(), permissions }))
      .toEqual({ edit: true, delete: true });
  });

  it("UT-CONTR-051 the margin label shows % or the project currency", () => {
    expect(marginDisplay(bop({
      margin: true, marginType: CHOICE_COST.contractMarginType.percentage,
      marginPercentage: 8,
    }), "PLN")).toMatchObject({ label: "Margin [%]", value: 8 });
    expect(marginDisplay(bop({
      margin: true, marginType: CHOICE_COST.contractMarginType.fixedValue,
      marginFixedValue: 5000,
    }), "PLN")).toMatchObject({ label: "Margin [PLN]", value: 5000 });
    expect(marginDisplay(bop({
      margin: true, marginType: CHOICE_COST.contractMarginType.fixedValue,
      marginFixedValue: 5000,
    }), null).label).toBe("Margin [EUR]");
    // Margin = No shows nothing at all.
    expect(marginDisplay(bop({ margin: false }), "EUR").value).toBeNull();
  });

  it("UT-CONTR-052 a Fabric-sourced margin renders italic", () => {
    expect(marginDisplay(bop({ isMarginStandardAssumption: true }), "EUR").italic).toBe(true);
    expect(marginDisplay(bop({ isMarginStandardAssumption: false }), "EUR").italic).toBe(false);
  });

  it("UT-CONTR-037 a Rights contract opens the three-field panel", () => {
    expect(panelForContract(bop({
      contractType: CHOICE_COST.bopContractTypes.projectRights,
    }))).toBe("rights");
    expect(panelForContract(bop({
      contractType: CHOICE_COST.bopContractTypes.development,
    }))).toBe("main");
    expect(canSaveRightsContract({
      description: "Land rights", closingDate: "2027-01-01",
      totalOverwrite: "1000", isDirty: true,
    })).toBe(true);
    expect(canSaveRightsContract({
      description: "", closingDate: "2027-01-01", totalOverwrite: "1000", isDirty: true,
    })).toBe(false);
  });

  it("UT-CONTR-001 the card list is grouped by Contract Types", () => {
    const list = groupByContractType([
      bop({ id: "r", contractType: CHOICE_COST.bopContractTypes.projectRights }),
      bop({ id: "c1", contractType: CHOICE_COST.bopContractTypes.construction }),
      bop({ id: "d", contractType: CHOICE_COST.bopContractTypes.development }),
      bop({ id: "c2", contractType: CHOICE_COST.bopContractTypes.construction }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["d", "c1", "c2", "r"]);
    expect(list).toHaveLength(4);
  });

  it("UT-CONTR-054 a save failure has a message that keeps the panel", () => {
    expect(CONTR_MSG.saveFailed).toContain("BoP Contract could not be saved correctly");
    expect(CONTR_MSG.saveFailed).toContain("still in the panel");
  });
});
