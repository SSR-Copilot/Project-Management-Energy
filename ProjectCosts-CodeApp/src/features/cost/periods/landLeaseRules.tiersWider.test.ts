/**
 * UT-LLTIER-001..012 — `leaseWriteTiers` with `{ wider: true }` (dvopt CB-07, `LEASE_TIER_WIDER`).
 *
 * The OPT-10 rule (only WTG allocation rows share a tier) is pinned by `landLeaseRules.test.ts` / `landLease.writes.test.ts`; with no
 * options the function is exactly that rule. `wider` adds two kinds of write that are independent by construction: the D118 follower
 * start-date updates (their dates are worked out from the SAVED period, never from each other) and the period deletes of a contract
 * delete. A period CREATE is never widened (the `createdon` order of an import's periods is a product question, D160).
 */
import { describe, expect, it } from "vitest";
import {
  LEASE_ENTITY_SET as ES, LEASE_PERIOD_COL, leaseWriteTiers, planFollowingLeaseStarts, type LeaseWrite, type LeasePeriodRow,
} from "./landLeaseRules";

const follower = (id: string, day = "2030-01-01"): LeaseWrite => ({ op: "update", entitySet: ES.period, id, payload: { [LEASE_PERIOD_COL.startDate]: day } });
const saved = (id = "p-1"): LeaseWrite => ({ op: "update", entitySet: ES.period, id, payload: { vsb_name: "x", [LEASE_PERIOD_COL.startDate]: "2027-01-01", vsb_fixedcosts: 1 } });
const alloc = (op: "update" | "delete", id: string): LeaseWrite => (op === "delete"
  ? { op, entitySet: ES.allocation, id }
  : { op, entitySet: ES.allocation, id, payload: { tag: id } });
const periodDelete = (id: string): LeaseWrite => ({ op: "delete", entitySet: ES.period, id });
const costDelete = (): LeaseWrite => ({ op: "delete", entitySet: ES.cost, id: "c-1" });
const periodCreate = (ref?: string): LeaseWrite => ({ op: "create", entitySet: ES.period, payload: { tag: ref ?? "p" }, ...(ref ? { ref } : {}) });

describe("leaseWriteTiers — wider (CB-07)", () => {
  it("UT-LLTIER-001 with no options (or wider false) every follower is a tier of its own: the OPT-10 rule", () => {
    const writes = [saved(), follower("f-1"), follower("f-2"), follower("f-3")];
    expect(leaseWriteTiers(writes)).toEqual([[0], [1], [2], [3]]);
    expect(leaseWriteTiers(writes, { wider: false })).toEqual([[0], [1], [2], [3]]);
  });

  it("UT-LLTIER-002 wider: the followers share ONE tier, behind the saved period's own update (D160 §12 stands)", () => {
    const writes = [saved(), follower("f-1"), follower("f-2"), follower("f-3")];
    expect(leaseWriteTiers(writes, { wider: true })).toEqual([[0], [1, 2, 3]]);
  });

  it("UT-LLTIER-003 the saved period's update never joins the followers, even when it sits right before them with a start date only", () => {
    // A full-payload update is not a follower. (A start-date-only update that OPENS the tier is a follower by shape, but the planner never
    // emits one for the saved period: its payload is the whole period form.)
    const writes = [saved(), follower("f-1")];
    const tiers = leaseWriteTiers(writes, { wider: true });
    expect(tiers).toEqual([[0], [1]]);
  });

  it("UT-LLTIER-004 an update with one more column than the start date is not a follower and is never widened", () => {
    const withName: LeaseWrite = { op: "update", entitySet: ES.period, id: "f-2", payload: { [LEASE_PERIOD_COL.startDate]: "2031-01-01", vsb_name: "n" } };
    expect(leaseWriteTiers([follower("f-1"), withName, follower("f-3")], { wider: true })).toEqual([[0], [1], [2]]);
  });

  it("UT-LLTIER-005 two writes to ONE follower row stay in order (never in the same tier)", () => {
    expect(leaseWriteTiers([follower("f-1"), follower("f-1", "2031-01-01"), follower("f-2")], { wider: true })).toEqual([[0], [1, 2]]);
  });

  it("UT-LLTIER-006 wider: the period deletes of a contract delete share a tier, after the allocation deletes and before the cost", () => {
    const writes = [alloc("delete", "a-1"), alloc("delete", "a-2"), periodDelete("p-1"), periodDelete("p-2"), periodDelete("p-3"), costDelete()];
    expect(leaseWriteTiers(writes)).toEqual([[0, 1], [2], [3], [4], [5]]);
    expect(leaseWriteTiers(writes, { wider: true })).toEqual([[0, 1], [2, 3, 4], [5]]);
  });

  it("UT-LLTIER-007 a period delete never shares a tier with a follower update or an allocation write", () => {
    expect(leaseWriteTiers([follower("f-1"), periodDelete("p-1"), follower("f-2")], { wider: true })).toEqual([[0], [1], [2]]);
    expect(leaseWriteTiers([alloc("delete", "a-1"), periodDelete("p-1")], { wider: true })).toEqual([[0], [1]]);
  });

  it("UT-LLTIER-008 period CREATES are not widened (the created-on order of an import is a product decision)", () => {
    const writes = [periodCreate(), periodCreate(), periodCreate()];
    expect(leaseWriteTiers(writes, { wider: true })).toEqual([[0], [1], [2]]);
  });

  it("UT-LLTIER-009 the allocation rule is unchanged by wider (same op, same set, other rows)", () => {
    const writes = [alloc("update", "a-1"), alloc("update", "a-2"), alloc("delete", "a-3"), alloc("delete", "a-4")];
    expect(leaseWriteTiers(writes, { wider: true })).toEqual(leaseWriteTiers(writes));
  });

  it("UT-LLTIER-010 a follower write that binds a parent (parentRef) is not widened", () => {
    const bound: LeaseWrite = { op: "update", entitySet: ES.period, id: "f-2", payload: { [LEASE_PERIOD_COL.startDate]: "x" }, parentRef: "cost" };
    expect(leaseWriteTiers([follower("f-1"), bound], { wider: true })).toEqual([[0], [1]]);
  });

  it("UT-LLTIER-011 a plan is covered exactly once, in planner order inside each tier (wider)", () => {
    const writes = [saved(), follower("f-1"), follower("f-2"), alloc("update", "a-1"), periodDelete("p-1"), periodDelete("p-2")];
    const flat = leaseWriteTiers(writes, { wider: true }).flat();
    expect([...flat].sort((a, b) => a - b)).toEqual(writes.map((_, i) => i));
  });
});

describe("a follower chain left half-written heals on the next save (the reason widening the followers is recoverable)", () => {
  const row = (id: string, period: number, start: string): LeasePeriodRow => ({
    id, name: "n", projectCostId: "c", period, startDate: start, durationYears: 1, durationMonths: 0,
    fixedCosts: null, percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null, aggregation: null, distributionFrequency: null,
  } as unknown as LeasePeriodRow);

  it("UT-LLTIER-012 with follower 3 of 4 refused and the others landed, the next save plans ONLY follower 3", () => {
    const savedPeriod = { id: "p-1", startDate: "2030-01-01", durationYears: 1, durationMonths: 0 };
    // Planned from the saved period alone: p-2 starts 2031-01-01, p-3 2032-01-01, p-4 2033-01-01.
    const first = planFollowingLeaseStarts({
      periods: [row("p-1", 1, "2027-01-01"), row("p-2", 2, "2028-01-01"), row("p-3", 3, "2029-01-01"), row("p-4", 4, "2030-01-01")],
      saved: savedPeriod,
    });
    expect(first.map((f) => [f.id, f.startDate])).toEqual([["p-2", "2031-01-01"], ["p-3", "2032-01-01"], ["p-4", "2033-01-01"]]);
    // p-2 and p-4 landed, p-3 did not (a failure in a wider tier): the stored chain has a gap at p-3.
    const stored = [row("p-1", 1, "2030-01-01"), row("p-2", 2, "2031-01-01"), row("p-3", 3, "2029-01-01"), row("p-4", 4, "2033-01-01")];
    const retry = planFollowingLeaseStarts({ periods: stored, saved: savedPeriod });
    // p-3 is re-planned; p-4 (landed, and equal to what the chain gives it) is not written again.
    expect(retry.map((f) => [f.id, f.startDate])).toEqual([["p-3", "2032-01-01"]]);
  });
});
