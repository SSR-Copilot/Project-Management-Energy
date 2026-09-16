/**
 * Land Lease Costs Screen — unit tests. IDs are the spec's `UT-LEASE-nnn`.
 *
 * The two rules that most need pinning are `writesContractHeader` (Period 1 owns the
 * contract header) and `nextPeriod` (the corrected Period-9 cap).
 */
import { describe, it, expect } from "vitest";
import { CHOICE_COST } from "@/data/entities";
import {
  LEASE_MSG, LEASE_STANDARD_STAMP, LEASE_NUMERIC_MSG, clearsSelectionAfterSave,
  orderedSubaccounts, periodNumber, periodValue, isPeriodOne, nextPeriod,
  nextPeriodCanvasParity, buildContracts, contractsForSubaccount, lastPeriod, firstPeriod,
  firstPeriodHasRate, writesContractHeader, landLeaseCostName, nextPeriodName,
  oneTimePaymentPayload, showSecondPayment, showThirdPayment, securedValue,
  validateDueDate, diffAllocation, allWtgSelected, allocationEditable, allocationVisible,
  generatorOptions, allocationName, standardPeriodStarts, mapAssumptionPeriod,
  mapAggregation, mapSecured, mapAllWtgAllocated, roundTwoDecimals, planStandardAllocation,
  resolveInflationProfile, inflationStartYear, planDelete, deleteDialog, leaseCommands,
  isStandardLocked, canSaveLandLease, validateLeaseNumber,
  type LandLeaseCost, type LandLeasePeriod, type AllocationRow, type LandLeaseForm,
  type LandLeaseAssumption,
} from "./rules";

/* ────────────────────────────────────────────────────────────────── fixtures */

const cost = (o: Partial<LandLeaseCost> = {}): LandLeaseCost => ({
  id: "cost-1", name: "Windpark A-Lease-Owner B", description: "Owner B",
  subaccountId: "sub-1", landOwner: "Owner B", currencyId: "eur",
  secured: CHOICE_COST.landLeaseSecured.no, allWtgAllocated: false,
  isStandardContract: false, isStartDateStandardAssumption: false,
  amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
  dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationCountryArea: null, inflationStartYear: null, ...o,
});

const period = (o: Partial<LandLeasePeriod> = {}): LandLeasePeriod => ({
  id: "per-1", name: "Lease", projectCostId: "cost-1",
  period: CHOICE_COST.landLeasePeriod.period1, startDate: "2027-01-01",
  durationYears: 5, durationMonths: 0, fixedCosts: 1000, percentOfRevenues: null,
  eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
  aggregation: CHOICE_COST.aggregation.sum, distributionFrequency: 12, ...o,
});

const alloc = (o: Partial<AllocationRow> = {}): AllocationRow => ({
  id: "a-1", projectCostId: "cost-1", generatorInProjectId: "G1", ...o,
});

const assumption = (o: Partial<LandLeaseAssumption> = {}): LandLeaseAssumption => ({
  id: "sa-1", period: CHOICE_COST.opexLandLeasePeriod.period1, description: "Standard lease",
  durationYears: 5, durationMonths: 0, aggregation: CHOICE_COST.aggregation.sum,
  secured: true, allWtgAllocated: false, fixCosts: 1000, percentOfRevenues: null,
  eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
  amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
  distributionFrequency: 12, useInflationProfile: false,
  useCountryInflationProfile: false, inflationProfile: null, ...o,
});

const form = (o: Partial<LandLeaseForm> = {}): LandLeaseForm => ({
  description: "Owner B", currencyId: "eur", securedChecked: false,
  oneTimePaymentsOn: false,
  payments: { dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "" },
  allWtgAllocated: false, allocatedGeneratorIds: [], startDate: "2027-01-01",
  durationYears: 5, durationMonths: 0, fixedCosts: "1000.00", percentOfRevenues: "",
  eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  aggregation: CHOICE_COST.aggregation.sum, distributionFrequency: 12, ...o,
});

const perms = {
  canCreateCost: true, canCreatePeriod: true, canEditRecord: true, canDeleteRecord: true,
};

/* ══════════════════════════════════════════════════════════ cards and model ════ */

describe("Land Lease — cards, contracts and periods", () => {
  it("UT-LEASE-001 sub-accounts render in Order and start collapsed", () => {
    const cards = orderedSubaccounts([
      { id: "b", name: "B", order: 2 },
      { id: "a", name: "A", order: 1 },
      { id: "c", name: "C", order: 3 },
    ]);
    expect(cards.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(cards.every((x) => x.isFolded)).toBe(true);
  });

  it("UT-LEASE-002 periods are scoped to their contract", () => {
    const contracts = buildContracts(
      [cost({ id: "c1" }), cost({ id: "c2" })],
      [
        period({ id: "p1", projectCostId: "c1" }),
        period({
          id: "p2", projectCostId: "c1", period: CHOICE_COST.landLeasePeriod.period2,
        }),
        period({ id: "p3", projectCostId: "c2" }),
      ],
    );
    expect(contracts[0].periods.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(contracts[1].periods.map((p) => p.id)).toEqual(["p3"]);
    expect(contractsForSubaccount(contracts, "sub-1")).toHaveLength(2);
    expect(contractsForSubaccount(contracts, "sub-9")).toHaveLength(0);
  });

  it("periods sort by their period NUMBER, not their option value order", () => {
    const c = buildContracts([cost()], [
      period({ id: "p3", period: CHOICE_COST.landLeasePeriod.period3 }),
      period({ id: "p1", period: CHOICE_COST.landLeasePeriod.period1 }),
      period({ id: "p2", period: CHOICE_COST.landLeasePeriod.period2 }),
    ])[0];
    expect(c.periods.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(lastPeriod(c)!.id).toBe("p3");
    expect(firstPeriod(c)!.id).toBe("p1");
    expect(lastPeriod({ cost: cost(), periods: [] })).toBeNull();
  });

  it("the period enum maps both ways", () => {
    expect(periodNumber(CHOICE_COST.landLeasePeriod.period1)).toBe(1);
    expect(periodNumber(CHOICE_COST.landLeasePeriod.period9)).toBe(9);
    expect(periodNumber(null)).toBe(0);
    expect(periodNumber(123)).toBe(0);
    expect(periodValue(4)).toBe(CHOICE_COST.landLeasePeriod.period4);
    expect(periodValue(10)).toBeNull();
    expect(isPeriodOne(CHOICE_COST.landLeasePeriod.period1)).toBe(true);
    expect(isPeriodOne(CHOICE_COST.landLeasePeriod.period2)).toBe(false);
  });
});

/* ══════════════════════════════════════════════ rule 2 · Period 1 owns it ════ */

describe("Land Lease — Period 1 owns the contract header", () => {
  it("UT-LEASE-003 the header is written when editing Period 1", () => {
    expect(writesContractHeader(
      period({ period: CHOICE_COST.landLeasePeriod.period1 }), false,
    )).toBe(true);
  });

  it("UT-LEASE-004 the header is NOT written when editing Period 2", () => {
    expect(writesContractHeader(
      period({ period: CHOICE_COST.landLeasePeriod.period2 }), false,
    )).toBe(false);
    expect(writesContractHeader(
      period({ period: CHOICE_COST.landLeasePeriod.period9 }), false,
    )).toBe(false);
  });

  it("UT-LEASE-005 a brand-new contract always writes the header", () => {
    expect(writesContractHeader(null, true)).toBe(true);
    expect(writesContractHeader(
      period({ period: CHOICE_COST.landLeasePeriod.period3 }), true,
    )).toBe(true);
  });

  it("UT-LEASE-006 the cost name convention", () => {
    expect(landLeaseCostName("Windpark A", "Lease", "Owner B"))
      .toBe("Windpark A-Lease-Owner B");
  });
});

/* ═════════════════════════════════════════════ rules 4–8 · header details ════ */

describe("Land Lease — one-time payments and period naming", () => {
  it("UT-LEASE-007 turning the toggle off blanks all six payment fields", () => {
    const values = {
      dueDate: "04/2027", amount: "1000", dueDate2: "04/2028", amount2: "2000",
      dueDate3: "04/2029", amount3: "3000",
    };
    expect(oneTimePaymentPayload(false, values)).toEqual({
      dueDate: null, amount: null, dueDate2: null,
      amount2: null, dueDate3: null, amount3: null,
    });
    expect(oneTimePaymentPayload(true, values)).toEqual({
      dueDate: "04/2027", amount: 1000, dueDate2: "04/2028",
      amount2: 2000, dueDate3: "04/2029", amount3: 3000,
    });
  });

  it("UT-LEASE-008 the 2nd/3rd blocks appear only when BOTH their fields hold data", () => {
    expect(showSecondPayment(cost({
      amountOneTimePayment2: 500, dueDateOneTimePayment2: null,
    }))).toBe(false);
    expect(showSecondPayment(cost({
      amountOneTimePayment2: 500, dueDateOneTimePayment2: "04/2028",
    }))).toBe(true);
    expect(showThirdPayment(cost({
      amountOneTimePayment3: null, dueDateOneTimePayment3: "04/2029",
    }))).toBe(false);
    expect(showThirdPayment(cost({
      amountOneTimePayment3: 500, dueDateOneTimePayment3: "04/2029",
    }))).toBe(true);
    expect(showSecondPayment(null)).toBe(false);
  });

  it("UT-LEASE-009 the due date must be MM/YYYY", () => {
    expect(validateDueDate("2027-04")).toBe(LEASE_MSG.dueDateFormat);
    expect(validateDueDate("13/2027")).toBe(LEASE_MSG.dueDateFormat);
    expect(validateDueDate("04/2027")).toBeNull();
    expect(validateDueDate("")).toBeNull();
  });

  it("Secured is written as a Yes/No CHOICE, not a boolean", () => {
    expect(securedValue(true)).toBe(CHOICE_COST.landLeaseSecured.yes);
    expect(securedValue(false)).toBe(CHOICE_COST.landLeaseSecured.no);
    expect(CHOICE_COST.landLeaseSecured.yes).toBe(952850000);
  });

  it("UT-LEASE-010 the next period number increments", () => {
    expect(nextPeriod(CHOICE_COST.landLeasePeriod.period3))
      .toBe(CHOICE_COST.landLeasePeriod.period4);
    expect(nextPeriod(null)).toBe(CHOICE_COST.landLeasePeriod.period1);
  });

  it("UT-LEASE-011 Period 9 does NOT wrap to Period 1", () => {
    expect(nextPeriod(CHOICE_COST.landLeasePeriod.period9)).toBeNull();
    // SOURCE DEFECT parity: the canvas' Switch default wraps to Period 1.
    expect(nextPeriodCanvasParity(CHOICE_COST.landLeasePeriod.period9))
      .toBe(CHOICE_COST.landLeasePeriod.period1);
    expect(nextPeriodCanvasParity(CHOICE_COST.landLeasePeriod.period8))
      .toBe(CHOICE_COST.landLeasePeriod.period9);
  });

  it("UT-LEASE-012 a numeric suffix in the period name auto-increments", () => {
    expect(nextPeriodName("Lease - 3", false)).toBe("Lease - 4");
    expect(nextPeriodName("Lease - 9", false)).toBe("Lease - 10");
  });

  it('UT-LEASE-013 the name falls back to " - 2"', () => {
    expect(nextPeriodName("Lease", false)).toBe("Lease - 2");
    // A Period-1 sibling suppresses the increment, per the canvas condition.
    expect(nextPeriodName("Lease - 3", true)).toBe("Lease - 3 - 2");
  });
});

/* ══════════════════════════════════════════════ rules 9–12 · allocation ════ */

describe("Land Lease — WTG allocation", () => {
  it("UT-LEASE-016 the allocation diff creates and deletes, leaving the rest alone", () => {
    const existing = [
      alloc({ id: "a1", generatorInProjectId: "G1" }),
      alloc({ id: "a2", generatorInProjectId: "G2" }),
    ];
    const diff = diffAllocation(existing, ["G2", "G3"]);
    expect(diff.toCreate).toEqual(["G3"]);
    expect(diff.toDelete).toEqual(["a1"]);
  });

  it("an empty selection deletes every allocation", () => {
    expect(diffAllocation([alloc({ id: "a1" })], []))
      .toEqual({ toCreate: [], toDelete: ["a1"] });
    expect(diffAllocation([], ["G1"])).toEqual({ toCreate: ["G1"], toDelete: [] });
  });

  it("UT-LEASE-017 allocate-to-all selects every generator", () => {
    const all = ["G1", "G2", "G3", "G4", "G5"];
    expect(allWtgSelected(all, all)).toBe(true);
  });

  it("UT-LEASE-018 deselecting one generator clears the all-WTG flag", () => {
    expect(allWtgSelected(["G1", "G2", "G3", "G4"], ["G1", "G2", "G3", "G4", "G5"]))
      .toBe(false);
    // Zero generators is not "all allocated".
    expect(allWtgSelected([], [])).toBe(false);
  });

  it("UT-LEASE-019 allocation is disabled outside Period 1", () => {
    expect(allocationEditable(
      period({ period: CHOICE_COST.landLeasePeriod.period2 }), false,
    )).toBe(false);
    expect(allocationEditable(
      period({ period: CHOICE_COST.landLeasePeriod.period1 }), false,
    )).toBe(true);
    expect(allocationEditable(null, true)).toBe(true);
  });

  it("UT-LEASE-020 the allocation block is hidden for non-Wind/PV technology", () => {
    expect(allocationVisible("Wind")).toBe(true);
    expect(allocationVisible("pv")).toBe(true);
    expect(allocationVisible("BESS")).toBe(false);
    expect(allocationVisible(null)).toBe(false);
  });

  it("UT-LEASE-037 a project with no generators still saves the all-WTG flag", () => {
    expect(planStandardAllocation(true, [])).toEqual([]);
    expect(generatorOptions([], [])).toEqual([]);
  });

  it("the picker labels generators `name - status` and orders by the numeric suffix", () => {
    const opts = generatorOptions(
      [
        { id: "g10", name: "WTG_10", status: "Active" },
        { id: "g2", name: "WTG_2", status: "Inactive" },
      ],
      [{ id: "pv1", label: "PV module 500W" }],
    );
    expect(opts.map((o) => o.id)).toEqual(["g2", "g10", "pv1"]);
    expect(opts[0].label).toBe("WTG_2 - Inactive");
    expect(opts[2].kind).toBe("pv");
    expect(allocationName("Owner B", "Lease", "WTG_2")).toBe("Owner B-Lease-WTG_2");
  });
});

/* ══════════════════════════════════════════════ rules 13–17 · standard load ════ */

describe("Land Lease — standard contract load", () => {
  it("UT-LEASE-026 the load chains the period start dates", () => {
    const starts = standardPeriodStarts("2027-04-01", [
      assumption({ period: CHOICE_COST.opexLandLeasePeriod.period1, durationYears: 5 }),
      assumption({ period: CHOICE_COST.opexLandLeasePeriod.period2, durationYears: 5 }),
      assumption({ period: CHOICE_COST.opexLandLeasePeriod.period3, durationYears: 10 }),
    ]);
    expect(starts.map((p) => p.startDate.toISOString().slice(0, 10)))
      .toEqual(["2027-04-01", "2032-04-01", "2037-04-01"]);
  });

  it("UT-LEASE-027 the period and aggregation enums map across tables", () => {
    expect(mapAssumptionPeriod(CHOICE_COST.opexLandLeasePeriod.period3))
      .toBe(CHOICE_COST.landLeasePeriod.period3);
    // Period 10 has no counterpart on the child table — the canvas default is Period 1.
    expect(mapAssumptionPeriod(CHOICE_COST.opexLandLeasePeriod.period10))
      .toBe(CHOICE_COST.landLeasePeriod.period1);
    expect(mapAssumptionPeriod(999)).toBe(CHOICE_COST.landLeasePeriod.period1);
    expect(mapAggregation(CHOICE_COST.aggregation.max)).toBe(CHOICE_COST.aggregation.max);
    expect(mapSecured(true)).toBe(CHOICE_COST.landLeaseSecured.yes);
    expect(mapSecured(false)).toBe(CHOICE_COST.landLeaseSecured.no);
    expect(mapAllWtgAllocated(true)).toBe(true);
  });

  it("UT-LEASE-028 amounts are rounded to two decimals", () => {
    expect(roundTwoDecimals(1234.5678)).toBe(1234.57);
    expect(roundTwoDecimals(1234.5)).toBe(1234.5);
    expect(roundTwoDecimals(null)).toBeNull();
  });

  it("UT-LEASE-029 every WTG is allocated when the assumption says so", () => {
    const gens = ["G1", "G2", "G3", "G4", "G5", "G6"].map((id, i) => ({
      id, label: id, order: i, kind: "wtg" as const,
    }));
    expect(planStandardAllocation(true, gens)).toHaveLength(6);
    expect(planStandardAllocation(false, gens)).toHaveLength(0);
  });

  it("UT-LEASE-030 the country inflation profile is used for COD + 1", () => {
    expect(inflationStartYear("2027-04-01")).toBe(2028);
    expect(resolveInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.5,
    }, 2.1)).toBe(2.1);
    expect(resolveInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.5,
    }, 2.1)).toBe(1.5);
    expect(resolveInflationProfile({
      useInflationProfile: false, useCountryInflationProfile: true, inflationProfile: 1.5,
    }, 2.1)).toBeNull();
    expect(LEASE_STANDARD_STAMP.isStandardContract).toBe(true);
  });
});

/* ══════════════════════════════════════════════ rule 18 · delete branching ════ */

describe("Land Lease — delete", () => {
  const contract = buildContracts([cost()], [
    period({ id: "p1", period: CHOICE_COST.landLeasePeriod.period1 }),
    period({ id: "p2", period: CHOICE_COST.landLeasePeriod.period2 }),
    period({ id: "p3", period: CHOICE_COST.landLeasePeriod.period3 }),
  ])[0];
  const allocations = [
    alloc({ id: "a1" }), alloc({ id: "a2" }), alloc({ id: "a3" }), alloc({ id: "a4" }),
    alloc({ id: "other", projectCostId: "cost-9" }),
  ];

  it("UT-LEASE-021 deleting Period 2 removes only that period", () => {
    const plan = planDelete(contract, contract.periods[1], allocations);
    expect(plan).toEqual({
      kind: "period", periodIds: ["p2"], allocationIds: [], costIds: [],
    });
  });

  it("UT-LEASE-022 deleting Period 1 cascades the whole contract in one batch", () => {
    const plan = planDelete(contract, contract.periods[0], allocations);
    expect(plan.kind).toBe("contract");
    expect(plan.allocationIds).toEqual(["a1", "a2", "a3", "a4"]);
    expect(plan.periodIds).toEqual(["p1", "p2", "p3"]);
    expect(plan.costIds).toEqual(["cost-1"]);
    expect(
      plan.allocationIds.length + plan.periodIds.length + plan.costIds.length,
    ).toBe(8);
  });

  it("UT-LEASE-023 the delete dialog matches the branch", () => {
    expect(deleteDialog(period({ period: CHOICE_COST.landLeasePeriod.period1 })))
      .toEqual({ title: LEASE_MSG.deleteContractTitle, body: LEASE_MSG.deleteContractBody });
    expect(deleteDialog(period({ period: CHOICE_COST.landLeasePeriod.period2 })))
      .toEqual({ title: LEASE_MSG.deletePeriodTitle, body: LEASE_MSG.deletePeriodBody });
  });
});

/* ═══════════════════════════════════════════════════════════ command gates ════ */

describe("Land Lease — command bar", () => {
  const chain = buildContracts([cost()], [
    period({ id: "p1", period: CHOICE_COST.landLeasePeriod.period1, fixedCosts: 1000 }),
    period({ id: "p2", period: CHOICE_COST.landLeasePeriod.period2 }),
    period({ id: "p3", period: CHOICE_COST.landLeasePeriod.period3 }),
  ])[0];

  const gates = (o: Partial<Parameters<typeof leaseCommands>[0]> = {}) => leaseCommands({
    contract: chain,
    selectedPeriod: chain.periods[2],
    costsInSubaccount: [chain.cost],
    hasMatchingAssumption: true,
    permissions: perms,
    inScope: true,
    nothingSelected: false,
    ...o,
  });

  it("UT-LEASE-014 Add Period requires a rate on Period 1", () => {
    const noRate = buildContracts([cost()], [
      period({
        id: "p1", period: CHOICE_COST.landLeasePeriod.period1,
        fixedCosts: null, percentOfRevenues: null, eurPerMw: null, eurPerMwh: null,
        eurPerWtg: null,
      }),
    ])[0];
    expect(firstPeriodHasRate(noRate)).toBe(false);
    expect(gates({ contract: noRate, selectedPeriod: noRate.periods[0] }).addPeriod)
      .toBe(false);
    expect(firstPeriodHasRate(chain)).toBe(true);
    expect(gates().addPeriod).toBe(true);
  });

  it("UT-LEASE-015 Add Period only works on the last period", () => {
    expect(gates({ selectedPeriod: chain.periods[1] }).addPeriod).toBe(false);
    expect(gates({ selectedPeriod: chain.periods[2] }).addPeriod).toBe(true);
  });

  it("UT-LEASE-011b Add Period is disabled on Period 9 (the corrected cap)", () => {
    const nine = buildContracts([cost()], [
      period({ id: "p1", period: CHOICE_COST.landLeasePeriod.period1, fixedCosts: 1 }),
      period({ id: "p9", period: CHOICE_COST.landLeasePeriod.period9 }),
    ])[0];
    expect(gates({ contract: nine, selectedPeriod: nine.periods[1] }).addPeriod).toBe(false);
  });

  it("UT-LEASE-024 Add Standard Contract needs a matching assumption", () => {
    expect(gates({ hasMatchingAssumption: false, costsInSubaccount: [] })
      .addStandardContract).toBe(false);
    expect(gates({ hasMatchingAssumption: true, costsInSubaccount: [] })
      .addStandardContract).toBe(true);
  });

  it("UT-LEASE-025 a standard contract is blocked once any cost exists", () => {
    expect(gates({ costsInSubaccount: [cost()] }).addStandardContract).toBe(false);
  });

  it("UT-LEASE-031 standard rows are locked for edit and extension", () => {
    const std = buildContracts([cost({ isStandardContract: true })], [
      period({ id: "p1", period: CHOICE_COST.landLeasePeriod.period1, fixedCosts: 1 }),
      period({ id: "p2", period: CHOICE_COST.landLeasePeriod.period2 }),
    ])[0];
    expect(isStandardLocked(std, null)).toBe(true);
    expect(gates({ contract: std, selectedPeriod: std.periods[1] }).edit).toBe(false);
    expect(gates({ contract: std, selectedPeriod: std.periods[1] }).addPeriod).toBe(false);
    // A period NAMED "Standard…" locks too, even on a non-standard cost.
    expect(isStandardLocked(null, period({ name: "Standard lease" }))).toBe(true);
  });

  it("UT-LEASE-032 a standard chain can only be deleted from Period 1", () => {
    const std = buildContracts([cost({ isStandardContract: true })], [
      period({ id: "p1", period: CHOICE_COST.landLeasePeriod.period1, fixedCosts: 1 }),
      period({ id: "p3", period: CHOICE_COST.landLeasePeriod.period3 }),
    ])[0];
    expect(gates({ contract: std, selectedPeriod: std.periods[1] }).delete).toBe(false);
    expect(gates({ contract: std, selectedPeriod: std.periods[0] }).delete).toBe(true);
  });

  it("UT-LEASE-035 Edit requires the record edit privilege", () => {
    expect(gates({ permissions: { ...perms, canEditRecord: false } }).edit).toBe(false);
    expect(gates({ permissions: { ...perms, canDeleteRecord: false } }).delete).toBe(false);
    expect(gates({ permissions: { ...perms, canCreatePeriod: false } }).addPeriod).toBe(false);
  });

  it("UT-LEASE-036 commands do not leak across cards", () => {
    const g = gates({ inScope: false });
    expect(g.edit).toBe(false);
    expect(g.delete).toBe(false);
    expect(g.addPeriod).toBe(false);
  });

  it("UT-LEASE-039 a sub-account with no contracts can still add one", () => {
    const g = gates({ costsInSubaccount: [], nothingSelected: true });
    expect(g.addContractType).toBe(true);
  });

  it("Add Contract Type is blocked once a standard contract exists in the sub-account", () => {
    const g = gates({
      costsInSubaccount: [cost({ isStandardContract: true })], nothingSelected: true,
    });
    expect(g.addContractType).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════ save gate ════ */

describe("Land Lease — save gate", () => {
  it("UT-LEASE-033 save is blocked while any numeric error is showing", () => {
    expect(validateLeaseNumber("eurPerMwh", "1.234")).toBe(LEASE_NUMERIC_MSG.twoDecimal);
    expect(canSaveLandLease(form({ eurPerMwh: "1.234" }))).toBe(false);
    expect(canSaveLandLease(form({ eurPerMwh: "1.23" }))).toBe(true);
    expect(validateLeaseNumber("eurPerMw", "1000000001"))
      .toBe(LEASE_NUMERIC_MSG.range(1_000_000_000));
    expect(validateLeaseNumber("fixedCosts", "")).toBeNull();
  });

  it("UT-LEASE-034 the description is required", () => {
    expect(canSaveLandLease(form({ description: "" }))).toBe(false);
    expect(canSaveLandLease(form({ description: "   " }))).toBe(false);
  });

  it("a bad one-time payment date blocks the save only while the toggle is on", () => {
    const bad = {
      dueDate: "2027-04", amount: "100", dueDate2: "", amount2: "",
      dueDate3: "", amount3: "",
    };
    expect(canSaveLandLease(form({ oneTimePaymentsOn: true, payments: bad }))).toBe(false);
    expect(canSaveLandLease(form({ oneTimePaymentsOn: false, payments: bad }))).toBe(true);
  });

  it("UT-LEASE-038 a save failure has a message that keeps the panel", () => {
    expect(LEASE_MSG.saveFailed).toContain("Land Lease Period could not be saved correctly");
    expect(LEASE_MSG.saveFailed).toContain("still in the panel");
  });

  it("UT-LEASE-040 the selection clears after a successful save", () => {
    expect(clearsSelectionAfterSave).toBe(true);
  });
});
