/**
 * UT-CAPEXINV-OPT-001..008 — which reads each CAPEX write refreshes (B2, OPT-12). The safety net the plan asks for: a job that
 * writes a table must invalidate every key that READS it, and may leave alone the keys that cannot show it.
 *
 * What each key reads (so each job's list can be argued, not just asserted):
 *   cost book        vsb_capexprojectcontracts, vsb_capexcosts (cost, paid), the chart, payer defaults, project states
 *   capex totals     vsb_capexprojectcontracts (account), vsb_capexcosts (`vsb_cost`)
 *   DevCo contracts  vsb_capexprojectcontracts (account, total cost, cost type)
 *   DevCo costs      vsb_capexprojectcontracts, vsb_capexcosts (`vsb_cost`, year, month)
 *   comments         vsb_capexcommentses only
 */
import { describe, expect, it } from "vitest";
import { COMMENTS_KEY, capexWriteInvalidations, savedMonthsDeleteRows, monthRowsOfSave } from "./capexInvalidation";
import { capexWriteSet } from "@/features/cost/capex-costs/writeSet";

const P = "p-1";
const keysOf = (job: Parameters<typeof capexWriteInvalidations>[2], cat: number | undefined = 2) =>
  capexWriteInvalidations(P, cat, job).map((k) => JSON.stringify(k));
const BOOK = JSON.stringify(["cost-book", P, 2]);
const TOTALS = JSON.stringify(["capex-totals", P]);
const DEVCO_CONTRACTS = JSON.stringify(["devCoCapexContracts", P]);
const DEVCO_COSTS = JSON.stringify(["devCoCapexCosts", P]);
const COMMENTS = JSON.stringify(COMMENTS_KEY);

describe("capexWriteInvalidations", () => {
  it("UT-CAPEXINV-OPT-001 marking a month paid refreshes the cost book only (it was five keys)", () => {
    // `vsb_costpaid` (and a cleared Linked Cluster) is shown by the book. Totals sum `vsb_cost`, the DevCo reads select amounts, comments are another table.
    expect(keysOf("paid")).toEqual([BOOK]);
  });

  it("UT-CAPEXINV-OPT-002 a panel save refreshes the book, totals and both DevCo reads, not the comments", () => {
    expect(keysOf("save")).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS]);
  });

  it("UT-CAPEXINV-OPT-003 a save that deleted month rows also refreshes the comments (a payment-date comment points at its month's row)", () => {
    expect(keysOf("save-deleted")).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS, COMMENTS]);
  });

  it("UT-CAPEXINV-OPT-004 a delete and a failed write refresh everything, as before", () => {
    expect(keysOf("delete")).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS, COMMENTS]);
    expect(keysOf("failed")).toEqual(keysOf("delete"));
  });

  it("UT-CAPEXINV-OPT-005 the book key is the tab the write was made on, or `none` for the period screens", () => {
    expect(capexWriteInvalidations(P, 4, "paid")).toEqual([["cost-book", P, 4]]);
    expect(capexWriteInvalidations(P, undefined, "paid")).toEqual([["cost-book", P, "none"]]);
  });

  it("UT-CAPEXINV-OPT-006 the lists of a job are always a subset of the full list: nothing is invalidated that the old code did not", () => {
    const full = new Set(keysOf("failed"));
    for (const job of ["paid", "save", "save-deleted", "delete"] as const) {
      for (const k of keysOf(job)) expect(full.has(k)).toBe(true);
    }
  });
});

describe("savedMonthsDeleteRows", () => {
  const month = (over: Partial<{ id: string; year: number; month: number; amount: number | null }> = {}) =>
    ({ year: 2027, month: 1, amount: 100, ...over });

  it("UT-CAPEXINV-OPT-007 true only when a cleared month had a row; the same rule `capexWriteSet` (and so the save) applies", () => {
    expect(savedMonthsDeleteRows([month({ id: "r1", amount: null })])).toBe(true);
    expect(savedMonthsDeleteRows([month({ amount: null })])).toBe(false); // cleared, never existed: nothing to delete
    expect(savedMonthsDeleteRows([month({ id: "r1", amount: 0 })])).toBe(false); // a stored zero is updated, not deleted
    expect(savedMonthsDeleteRows([month({ id: "r1" }), month({ month: 2 })])).toBe(false);
    expect(savedMonthsDeleteRows([])).toBe(false);
  });

  it("UT-CAPEXINV-OPT-008 agrees with capexWriteSet on a grid of cases (differential)", () => {
    const amounts: (number | null)[] = [null, 0, 5, -3];
    const ids = [undefined, "r1"];
    for (const a of amounts) for (const b of amounts) for (const ia of ids) for (const ib of ids) {
      const payments = [month({ amount: a, id: ia }), month({ month: 2, amount: b, id: ib })];
      expect(savedMonthsDeleteRows(payments)).toBe(capexWriteSet(monthRowsOfSave(payments)).deletes.length > 0);
    }
  });
});
