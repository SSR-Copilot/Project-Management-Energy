/**
 * `capexWriteSet` — the rule that makes a typed zero mean something different from a blank.
 *
 * The canvas equivalent is pinned in the skeleton by UT-CAPEX-021, UT-CAPEX-022 and
 * UT-CAPEX-057; these cover the same four cases against our types.
 */
import { describe, expect, it } from "vitest";
import { capexWriteSet, type CostRowInput } from "./writeSet";

const row = (over: Partial<CostRowInput>): CostRowInput =>
  ({ year: 2026, month: 1, cost: null, costId: null, ...over });

describe("capexWriteSet", () => {
  it("UT-CWS-001 deletes an existing row when its month is cleared", () => {
    const set = capexWriteSet([row({ cost: null, costId: "cost-1" })]);
    expect(set.deletes).toEqual(["cost-1"]);
    expect(set.upserts).toEqual([]);
  });

  it("UT-CWS-002 does nothing for a blank month that never had a row", () => {
    const set = capexWriteSet([row({ cost: null, costId: null })]);
    expect(set).toEqual({ upserts: [], deletes: [] });
  });

  it("UT-CWS-003 does not create a row for a zero typed into an empty month", () => {
    // This is the half of the rule that a naive upsert gets wrong: it would litter the table
    // with zero rows, and the grid renders "a row exists" differently from "no row".
    expect(capexWriteSet([row({ cost: 0, costId: null })])).toEqual({ upserts: [], deletes: [] });
  });

  it("UT-CWS-004 updates an existing row to zero", () => {
    const set = capexWriteSet([row({ cost: 0, costId: "cost-1" })]);
    expect(set.upserts).toEqual([{ year: 2026, month: 1, cost: 0, costId: "cost-1" }]);
    expect(set.deletes).toEqual([]);
  });

  it("UT-CWS-005 creates a row for a non-zero value in an empty month", () => {
    const set = capexWriteSet([row({ cost: 1500, costId: null })]);
    expect(set.upserts).toEqual([{ year: 2026, month: 1, cost: 1500, costId: null }]);
  });

  it("UT-CWS-006 updates a row that changes value", () => {
    const set = capexWriteSet([row({ cost: 1500, costId: "cost-1" })]);
    expect(set.upserts).toEqual([{ year: 2026, month: 1, cost: 1500, costId: "cost-1" }]);
  });

  it("UT-CWS-007 treats NaN as a blank rather than writing it", () => {
    // An unparsed text box yields NaN; writing that to a Decimal column fails server-side.
    expect(capexWriteSet([row({ cost: Number.NaN, costId: "cost-1" })]))
      .toEqual({ upserts: [], deletes: ["cost-1"] });
    expect(capexWriteSet([row({ cost: Number.NaN, costId: null })]))
      .toEqual({ upserts: [], deletes: [] });
  });

  it("UT-CWS-008 handles a whole year of mixed cases in one pass", () => {
    const set = capexWriteSet([
      row({ month: 1, cost: 100, costId: null }),      // create
      row({ month: 2, cost: 0, costId: "c2" }),        // update to zero
      row({ month: 3, cost: null, costId: "c3" }),     // delete
      row({ month: 4, cost: null, costId: null }),     // nothing
      row({ month: 5, cost: 0, costId: null }),        // nothing
      row({ month: 6, cost: 250, costId: "c6" }),      // update
    ]);

    expect(set.upserts.map((u) => u.month)).toEqual([1, 2, 6]);
    expect(set.deletes).toEqual(["c3"]);
  });

  it("UT-CWS-009 preserves the year and month it was given", () => {
    const set = capexWriteSet([row({ year: 2015, month: 12, cost: 7 })]);
    expect(set.upserts[0]).toMatchObject({ year: 2015, month: 12 });
  });
});
