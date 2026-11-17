/** UT-CONTR-195..198 — `queriesReady`: which reads a contract form and a payment target need before they open. */
import { describe, expect, it } from "vitest";
import { queriesReady } from "./rules";

const ALL = {
  contractCount: 2, contractsLoaded: true, accountsLoaded: true, costRowsLoaded: true,
  devCoContractsLoaded: true, linksLoaded: true, targetsLoaded: true,
};

describe("queriesReady", () => {
  it("UT-CONTR-195 everything answered: both are ready", () => {
    expect(queriesReady(ALL)).toEqual({ contractForm: true, targets: true });
  });

  it("UT-CONTR-196 a missing cost-row, DevCo-contract, account or link read blocks the contract form only", () => {
    for (const missing of ["costRowsLoaded", "devCoContractsLoaded", "accountsLoaded", "linksLoaded"] as const) {
      expect(queriesReady({ ...ALL, [missing]: false })).toEqual({ contractForm: false, targets: true });
    }
  });

  it("UT-CONTR-197 the payment targets not answered block both (the remaining percentage depends on them)", () => {
    expect(queriesReady({ ...ALL, targetsLoaded: false })).toEqual({ contractForm: false, targets: false });
  });

  it("UT-CONTR-198 with no contract the links and targets reads are disabled and count as ready, the rest still counts", () => {
    const none = { ...ALL, contractCount: 0, linksLoaded: false, targetsLoaded: false };
    expect(queriesReady(none)).toEqual({ contractForm: true, targets: true });
    expect(queriesReady({ ...none, costRowsLoaded: false }).contractForm).toBe(false);
    expect(queriesReady({ ...none, contractsLoaded: false })).toEqual({ contractForm: false, targets: false });
  });
});
