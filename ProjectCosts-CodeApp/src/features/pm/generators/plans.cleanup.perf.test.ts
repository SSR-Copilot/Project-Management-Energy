/**
 * Optimization programme B6, OPT-30 (S4-10): `planTypeLandLeaseCleanup` groups allocations per cost by pushing, not by copying the
 * growing list for every allocation. The OLD body is kept below as the oracle (recorded before the change); the output must be
 * identical. Ids: UT-GENPLAN-OPT-NNN.
 */
import { describe, expect, it } from "vitest";
import { planTypeLandLeaseCleanup } from "./plans";

type Alloc = { id: string; costId: string };
type Step = ReturnType<typeof planTypeLandLeaseCleanup>[number];

/** The pre-change body, verbatim. */
function oldCleanup(args: { allocations: Alloc[]; allocationCountByCost: Record<string, number> }): Step[] {
  const byCost = new Map<string, string[]>();
  for (const a of args.allocations) byCost.set(a.costId, [...(byCost.get(a.costId) ?? []), a.id]);
  const steps: Step[] = [];
  for (const [costId, ids] of byCost) {
    if ((args.allocationCountByCost[costId] ?? 0) > ids.length) {
      for (const id of ids) steps.push({ kind: "removeAllocation", allocationId: id });
    } else {
      steps.push({ kind: "removeLandLeaseCost", costId });
    }
  }
  return steps;
}

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function fixture(n: number, costs: number, rnd: () => number) {
  const allocations: Alloc[] = [];
  const own: Record<string, number> = {};
  for (let i = 0; i < n; i += 1) {
    const costId = `k${Math.floor(rnd() * costs)}`;
    allocations.push({ id: `a${i}`, costId });
    own[costId] = (own[costId] ?? 0) + 1;
  }
  // Some costs are shared with other types (a bigger total), the rest are wholly this type's.
  const allocationCountByCost: Record<string, number> = {};
  for (const [c, k] of Object.entries(own)) allocationCountByCost[c] = rnd() < 0.5 ? k : k + 1 + Math.floor(rnd() * 3);
  return { allocations, allocationCountByCost };
}

describe("OPT-30 S4-10: planTypeLandLeaseCleanup", () => {
  it("UT-GENPLAN-OPT-001 the output equals the pre-change body on 200 random inputs (order of costs and of ids included)", () => {
    const rnd = seeded(42);
    for (let i = 0; i < 200; i += 1) {
      const args = fixture(Math.floor(rnd() * 60), 1 + Math.floor(rnd() * 8), rnd);
      expect(planTypeLandLeaseCleanup(args)).toEqual(oldCleanup(args));
    }
  });

  it("UT-GENPLAN-OPT-002 edge cases: no allocations, one cost, a cost missing from the counts", () => {
    expect(planTypeLandLeaseCleanup({ allocations: [], allocationCountByCost: {} })).toEqual([]);
    const one = { allocations: [{ id: "a1", costId: "k" }, { id: "a2", costId: "k" }], allocationCountByCost: { k: 5 } };
    expect(planTypeLandLeaseCleanup(one)).toEqual([
      { kind: "removeAllocation", allocationId: "a1" }, { kind: "removeAllocation", allocationId: "a2" },
    ]);
    expect(planTypeLandLeaseCleanup({ allocations: one.allocations, allocationCountByCost: {} })).toEqual([{ kind: "removeLandLeaseCost", costId: "k" }]);
  });

  it("UT-GENPLAN-OPT-003 a large input (30,000 allocations on 3 costs) equals the oracle and runs in linear time", () => {
    const args = fixture(30_000, 3, seeded(7));
    const t0 = performance.now();
    const fresh = planTypeLandLeaseCleanup(args);
    const ms = performance.now() - t0;
    expect(fresh).toEqual(oldCleanup(args));
    expect(ms).toBeLessThan(250);
  });
});
