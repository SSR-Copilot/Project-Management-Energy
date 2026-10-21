/**
 * The Cost repository boundary.
 *
 * Demo mode was removed on 15 Sep, and with it the tests that exercised a second runtime
 * (`UT-REPO-005…019`, `UT-REPO-023`). What survives is what was always the valuable part: the
 * pure narrowing rule that decides which cost rows a contract's recalculation sums. Coverage of
 * the Dataverse reads now lives in `costBook.test.ts`, which drives real row shapes through a
 * mocked `fetchAll` rather than through a parallel implementation.
 */
import { describe, expect, it } from "vitest";
import { costRepository, costRowsForAccounts, dataverseCostRepository } from "./costRepository";

describe("costRowsForAccounts", () => {
  const devCo = [
    { id: "c1", accountId: "a1", totalCost: 100 },
    { id: "c2", accountId: "a2", totalCost: 200 },
  ];
  const rows = [
    { contractId: "c1", year: 2025, month: 4, cost: 100 },
    { contractId: "c2", year: 2025, month: 4, cost: 200 },
  ];

  it("UT-REPO-001 returns nothing when no account is ticked", () => {
    // The panel opens with an empty selection; recalculating then must produce 0, not the
    // whole project's DevCo spend.
    expect(costRowsForAccounts(rows, devCo, [])).toEqual([]);
  });

  it("UT-REPO-002 keeps only the rows under the ticked accounts", () => {
    expect(costRowsForAccounts(rows, devCo, ["a1"])).toEqual([rows[0]]);
    expect(costRowsForAccounts(rows, devCo, ["a1", "a2"])).toHaveLength(2);
  });

  it("UT-REPO-003 returns nothing when a ticked account has no DevCo contract", () => {
    expect(costRowsForAccounts(rows, devCo, ["a-unknown"])).toEqual([]);
  });

  it("UT-REPO-004 keeps every contract under one account, not just the first", () => {
    // Dataverse models the account as a lookup ON the contract, so one account can carry
    // several. Deduping by account would drop real money.
    const many = [...devCo, { id: "c3", accountId: "a1", totalCost: 50 }];
    const manyRows = [...rows, { contractId: "c3", year: 2026, month: 1, cost: 50 }];
    expect(costRowsForAccounts(manyRows, many, ["a1"]).map((r) => r.contractId))
      .toEqual(["c1", "c3"]);
  });
});

describe("costRepository", () => {
  it("UT-REPO-020 resolves to the Dataverse implementation", () => {
    // The indirection is kept as the seam tests stub. With demo mode gone there is exactly one
    // implementation, and this asserts no second one crept back in behind a flag.
    expect(costRepository()).toBe(dataverseCostRepository);
  });

  it("UT-REPO-021 exposes every operation the screens call", () => {
    // A missing method is a runtime crash in one screen and nowhere else, which is the failure
    // mode this boundary exists to remove.
    for (const op of [
      "listContracts", "listPaymentTargets", "listDevCoLinks", "listCapexAccounts",
      "listDevCoCapexContracts", "listCapexCostRows", "getCostBook", "getCapexTotals",
      "getLandLeaseCostFlags", "getLandLeaseContracts", "getCountryInflationAreas",
      "findBopStandardAssumption", "saveContract", "deleteContract", "replaceDevCoLinks",
      "savePaymentTarget", "deletePaymentTarget", "setCostPaid", "saveCostLine", "deleteCostLine",
      // The three period screens' writes. `addStandardContract` is separate from `savePeriod`
      // because it creates a whole CHAIN, which a one-period-at-a-time save cannot express.
      "savePeriod", "deletePeriod", "addStandardContract",
      /*
       * The Land Lease screen's whole data surface. It used to live in
       * `features/land-lease/hooks.ts` with its own `fetchAll` calls, which is precisely the
       * bypass this boundary exists to prevent: the Land Lease screen edits two tables plus an
       * allocation join and its rules module wants the raw rows, so the operations are wider
       * than `getCostBook` — but they are still operations of THIS interface.
       */
      "getLeaseBook", "getLeaseGenerators", "getCountryInflation", "listCurrencies",
      "getLeaseAssumptions", "applyLeaseWrites",
      // The OPEX screens' reference data, which the screen used to carry as constants.
      "listOpexAccounts", "listOpexSubaccounts", "listOpexDeviceTypes",
      "listOpexAssumptionScopes",
    ]) {
      expect(typeof (dataverseCostRepository as unknown as Record<string, unknown>)[op])
        .toBe("function");
    }
  });
});
