/**
 * The pending-delete registry and its pure read filters (D51 §11.19, CA-13): rows whose deferred
 * delete has not landed must not come back on a CAPEX read, and must come back once released.
 */
import { describe, expect, it } from "vitest";
import {
  NO_PENDING_DELETES, createPendingDeletes, excludePendingCosts, excludePendingFromBook,
  excludePendingFromSheet, isPendingContract, isPendingCost, pendingExcept, type PendingDeleteIds,
} from "./pendingDeletes";
import type { CostBook, CostLine } from "@/features/cost/costing/model";

const line = (id: string, paymentIds: string[]): CostLine => ({
  id, accountId: "sub-1", description: id, payer: "SPV", depreciation: false, vat: false,
  standard: false, distribution: "individual", equalMode: "cluster", distributionScheme: "absolute",
  startDate: "", endDate: "", frequency: 1, clusters: [], comments: [],
  payments: paymentIds.map((pid, i) => ({ id: pid, year: 2026, month: i + 1, amount: 10, paid: false })),
});
const book = (lines: CostLine[]): CostBook => ({
  accounts: [], lines, periods: [], extraGroups: { om: [], land: [], other: [] },
});
/** A snapshot as the registry makes one: lower-cased (`PendingDeleteIds` is always lower-case). */
const pending = (contractIds: string[], costIds: string[]): PendingDeleteIds => ({
  contractIds: new Set(contractIds.map((id) => id.toLowerCase())),
  costIds: new Set(costIds.map((id) => id.toLowerCase())),
});

describe("createPendingDeletes", () => {
  it("UT-PENDDEL-001 add registers lower-cased ids; release removes exactly them", () => {
    const r = createPendingDeletes();
    const release = r.add({ contractIds: ["C-1"], costIds: ["K-1", "k-2"] });
    expect([...r.snapshot().contractIds]).toEqual(["c-1"]);
    expect([...r.snapshot().costIds].sort()).toEqual(["k-1", "k-2"]);
    release();
    expect(r.snapshot()).toBe(NO_PENDING_DELETES);
  });

  it("UT-PENDDEL-002 is reference-counted: an id two saves deferred stays until both released", () => {
    const r = createPendingDeletes();
    const first = r.add({ contractIds: ["c-1"] });
    const second = r.add({ contractIds: ["c-1"], costIds: ["k-9"] });
    first();
    expect(r.snapshot().contractIds.has("c-1")).toBe(true);
    second();
    expect(r.snapshot().contractIds.size).toBe(0);
    expect(r.snapshot().costIds.size).toBe(0);
  });

  it("UT-PENDDEL-003 a release is idempotent: calling it twice never un-counts another save's id", () => {
    const r = createPendingDeletes();
    const first = r.add({ costIds: ["k-1"] });
    const second = r.add({ costIds: ["k-1"] });
    first();
    first();
    expect(r.snapshot().costIds.has("k-1")).toBe(true);
    second();
    expect(r.snapshot().costIds.has("k-1")).toBe(false);
  });

  it("UT-PENDDEL-004 a snapshot is a copy: later adds and releases do not change it", () => {
    const r = createPendingDeletes();
    const release = r.add({ contractIds: ["c-1"] });
    const snap = r.snapshot();
    r.add({ contractIds: ["c-2"] });
    release();
    expect([...snap.contractIds]).toEqual(["c-1"]);
  });

  it("UT-PENDDEL-005 add accepts missing lists; the input arrays are copied", () => {
    const r = createPendingDeletes();
    const ids = ["c-1"];
    const release = r.add({ contractIds: ids });
    ids.push("c-2");
    release();
    expect(r.snapshot()).toBe(NO_PENDING_DELETES);
    expect(() => r.add({})()).not.toThrow();
  });
});

describe("excludePendingFromBook", () => {
  it("UT-PENDDEL-010 drops a pending contract's line and a pending cost id from a line's payments", () => {
    const b = book([line("c-1", ["k-1", "k-2"]), line("c-2", ["k-3"])]);
    const out = excludePendingFromBook(b, pending(["c-2"], ["K-2"]));
    expect(out.lines.map((l) => l.id)).toEqual(["c-1"]);
    expect(out.lines[0]?.payments.map((p) => p.id)).toEqual(["k-1"]);
    // Pure: the input is untouched.
    expect(b.lines).toHaveLength(2);
    expect(b.lines[0]?.payments).toHaveLength(2);
  });

  it("UT-PENDDEL-011 returns the book itself when nothing is pending or nothing matched", () => {
    const b = book([line("c-1", ["k-1"])]);
    expect(excludePendingFromBook(b, NO_PENDING_DELETES)).toBe(b);
    expect(excludePendingFromBook(b, pending(["c-9"], ["k-9"]))).toBe(b);
  });

  it("UT-PENDDEL-012 matches case-insensitively and keeps id-less (unsaved) payments", () => {
    const l = line("C-1", ["k-1"]);
    l.payments.push({ year: 2027, month: 1, amount: 5, paid: false });
    const out = excludePendingFromBook(book([l, line("c-2", ["K-7"])]), pending(["c-1"], ["k-7"]));
    expect(out.lines.map((x) => x.id)).toEqual(["c-2"]);
    expect(out.lines[0]?.payments).toEqual([]);
    const keep = excludePendingFromBook(book([l]), pending([], ["k-1"]));
    expect(keep.lines[0]?.payments).toEqual([{ year: 2027, month: 1, amount: 5, paid: false }]);
  });
});

describe("excludePendingFromSheet", () => {
  const data = {
    accounts: [], subaccounts: [], payerDefaults: new Map<string, string>(),
    contracts: [{ id: "c-1" }, { id: "c-2" }],
    costs: [
      { id: "k-1", contractId: "c-1" }, { id: "k-2", contractId: "c-2" }, { id: "k-3", contractId: "c-2" },
    ],
  };

  it("UT-PENDDEL-020 drops a pending contract with its cost rows, and a pending cost row", () => {
    const out = excludePendingFromSheet(data, pending(["C-1"], ["k-3"]));
    expect(out.contracts).toEqual([{ id: "c-2" }]);
    expect(out.costs).toEqual([{ id: "k-2", contractId: "c-2" }]);
    expect(out.payerDefaults).toBe(data.payerDefaults);
  });

  it("UT-PENDDEL-021 returns the data itself when nothing matched", () => {
    expect(excludePendingFromSheet(data, NO_PENDING_DELETES)).toBe(data);
    expect(excludePendingFromSheet(data, pending(["x"], ["y"]))).toBe(data);
  });

  it("UT-PENDDEL-030 excludePendingCosts drops rows of a pending contract and pending rows; itself when nothing matched", () => {
    const costs = [{ id: "K-1", contractId: "c-1" }, { id: "k-2", contractId: "C-2" }, { id: "k-3", contractId: "c-3" }];
    expect(excludePendingCosts(costs, pending(["c-2"], ["k-1"]))).toEqual([{ id: "k-3", contractId: "c-3" }]);
    expect(excludePendingCosts(costs, pending(["x"], ["y"]))).toBe(costs);
    expect(excludePendingCosts(costs, NO_PENDING_DELETES)).toBe(costs);
  });

  it("UT-PENDDEL-031 pendingExcept removes this save's own ids (case-insensitively) and leaves the input alone", () => {
    const p = pending(["c-1", "c-2"], ["k-1", "k-2"]);
    const out = pendingExcept(p, { contractIds: ["C-2"], costIds: ["K-1", "k-9"] });
    expect([...out.contractIds]).toEqual(["c-1"]);
    expect([...out.costIds]).toEqual(["k-2"]);
    expect(p.contractIds.size).toBe(2);
    expect(pendingExcept(NO_PENDING_DELETES, { contractIds: ["a"], costIds: [] })).toBe(NO_PENDING_DELETES);
  });

  it("UT-PENDDEL-022 isPendingContract / isPendingCost: case-insensitive, undefined is never pending", () => {
    const p = pending(["c-1"], ["k-1"]);
    expect(isPendingContract(p, "C-1")).toBe(true);
    expect(isPendingContract(p, "k-1")).toBe(false);
    expect(isPendingCost(p, "K-1")).toBe(true);
    expect(isPendingCost(p, undefined)).toBe(false);
  });
});
