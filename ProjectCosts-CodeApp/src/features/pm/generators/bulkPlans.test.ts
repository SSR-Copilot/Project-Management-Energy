/**
 * Generators bulk programme, work package R2 (plan §9.4, §2, §3 phases 1B-5): tiered deletes and the bulk paths of the
 * plan builders in `rules.ts`. IDs continue the generators block after `UT-GEN-186` (rollback.test.ts): UT-GEN-200 up.
 *
 * Phase 1B (200-209) has no flag: concurrency tiers only. Phases 2-5 (210 up) are flag-gated; every test pins both
 * halves (flag off = today's plan, flag on = the bulk plan) with an injected `newId`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, WRITE_CONCURRENCY } from "@/data/concurrency";
import * as R from "./rules";
import {
  ALLOC, BRIDGE, COST, OPEX, PROJECTS, PVTYPE, TURBINE, TYPE, P, costs, genType, idsOf, model, n, reps, simple, steps, turbine, wtgUnits,
} from "./bulkPlans.testkit";

/*
 * D144 pin: this file tests the D115 / D116 flags and the plan shapes of BEFORE the save-latency work (relaneWrites, replaceLanes,
 * wideGroups), so those three switches are held OFF here. The same builders with the switches ON are covered by saveLatency.test.ts.
 */
beforeEach(() => setGeneratorsPerfFlags({ relaneWrites: false, replaceLanes: false, wideGroups: false }));
afterEach(() => setGeneratorsPerfFlags(null));

/* ═════════════════════════════════════════════ phase 1B — tiered parallel deletes ═══ */

describe("phase 1B: tiered deletes (plan §9.4)", () => {
  it("UT-GEN-200 the tier constants are the plan's starting values (leaf 16, cascade 4, update default 8)", () => {
    expect(LEAF_DELETE_CONCURRENCY).toBe(16);
    expect(CASCADE_DELETE_CONCURRENCY).toBe(4);
    expect(WRITE_CONCURRENCY).toBe(8);
  });

  it("UT-GEN-201 turbine delete: allocation deletes are a leaf group (16), land-lease cost deletes a cascade group (4), apart and in that order; the turbine, type and roll-up after", () => {
    const type = genType();
    const t = turbine(1);
    // 30 allocations of this turbine: costs c1..c30; c1..c20 have siblings (allocation delete), c21..c30 are alone (cost delete).
    const allocations = n(30, (i) => ({ id: `a${i}`, costId: `c${i}` }));
    const allocationCountByCost = Object.fromEntries(allocations.map((a, i) => [a.costId, i < 20 ? 2 : 1]));
    const plan = R.planDeleteTurbine({
      project: P, type, model: model(), accumulatedIndex: 1, turbine: t, typeTurbines: [t], allTypes: [type],
      allocations, allocationCountByCost,
    });
    const s = steps(plan.writes);
    expect(s.map((x) => x.kind)).toEqual(["group", "group", "single", "single", "single"]);
    expect(s[0]!.ops).toEqual(reps(`delete:${ALLOC}`, 20));
    expect(s[0]!.limit).toBe(LEAF_DELETE_CONCURRENCY);
    expect(s[1]!.ops).toEqual(reps(`delete:${COST}`, 10));
    expect(s[1]!.limit).toBe(CASCADE_DELETE_CONCURRENCY);
    // Two different groups: they never merge into one run.
    expect(s[0]!.writes[0]!.concurrencyGroup).not.toBe(s[1]!.writes[0]!.concurrencyGroup);
    expect(s.slice(2).map((x) => x.ops[0])).toEqual([`delete:${TURBINE}`, `update:${TYPE}`, `update:${PROJECTS}`]);
    expect(plan.writes[plan.writes.length - 1]!.entitySet).toBe(PROJECTS);
    expect(plan.writes).toHaveLength(33);
  });

  it("UT-GEN-202 turbine delete: no allocations gives no group; only costs gives one cascade group only", () => {
    const type = genType();
    const t = turbine(1);
    const base = { project: P, type, model: model(), accumulatedIndex: 1, turbine: t, typeTurbines: [t], allTypes: [type] };
    expect(steps(R.planDeleteTurbine({ ...base, allocations: [], allocationCountByCost: {} }).writes).map((x) => x.kind))
      .toEqual(["single", "single", "single"]);
    const onlyCosts = steps(R.planDeleteTurbine({
      ...base, allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c2" }], allocationCountByCost: { c1: 1, c2: 1 },
    }).writes);
    expect(onlyCosts[0]).toMatchObject({ kind: "group", limit: CASCADE_DELETE_CONCURRENCY, ops: [`delete:${COST}`, `delete:${COST}`] });
    expect(onlyCosts.map((x) => x.kind)).toEqual(["group", "single", "single", "single"]);
  });

  it("UT-GEN-203 type delete: allocations + O&M costs are one leaf group (16), land-lease costs one cascade group (4) after it, then the type and the roll-up", () => {
    const type = genType();
    const allocations = [...n(6, (i) => ({ id: `a${i}`, costId: `c${i}` })), ...n(3, (i) => ({ id: `b${i}`, costId: `d${i}` }))];
    const allocationCountByCost = { c1: 9, c2: 9, c3: 9, c4: 9, c5: 9, c6: 9, d1: 1, d2: 1, d3: 1 };
    const plan = R.planDeleteGeneratorType({
      project: P, type, allTypes: [type, genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })],
      allocations, allocationCountByCost, opexCostIds: ["o1", "o2", "o3", "o4"],
    });
    const s = steps(plan.writes);
    expect(s.map((x) => x.kind)).toEqual(["group", "group", "single", "single"]);
    expect(s[0]!.ops).toEqual([...reps(`delete:${ALLOC}`, 6), ...reps(`delete:${OPEX}`, 4)]);
    expect(s[0]!.limit).toBe(LEAF_DELETE_CONCURRENCY);
    expect(s[1]!.ops).toEqual(reps(`delete:${COST}`, 3));
    expect(s[1]!.limit).toBe(CASCADE_DELETE_CONCURRENCY);
    expect(s[2]!).toMatchObject({ ops: [`delete:${TYPE}`] });
    expect(s[3]!).toMatchObject({ ops: [`update:${PROJECTS}`] });
    // Children before parents: every leaf and cascade delete comes before the type delete.
    expect(plan.writes.findIndex((w) => w.entitySet === TYPE)).toBe(13);
  });

  it("UT-GEN-204 PV delete: leaf group, cascade group, then the unit(s) (a leaf group when several, a plain step when one), then the type and the roll-up", () => {
    const pvA = simple({ id: "a", capacity: 10, cost: 3000 });
    const base = {
      project: P, pv: pvA, pvRows: [pvA], inverters: [], substructures: [], deviceCostFix: 1, deviceCostTracker: 1,
      allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c2" }, { id: "a3", costId: "c3" }],
      allocationCountByCost: { c1: 1, c2: 5, c3: 5 }, opexCostIds: ["o1", "o2"],
    };
    const one = steps(R.planDeletePvType({ ...base, unitIds: ["u1"] }).writes);
    expect(one.slice(0, 4).map((x) => [x.kind, x.limit, x.ops.length])).toEqual([
      ["group", LEAF_DELETE_CONCURRENCY, 4], ["group", CASCADE_DELETE_CONCURRENCY, 1], ["single", undefined, 1], ["single", undefined, 1],
    ]);
    expect(one[2]!.ops).toEqual([`delete:${TURBINE}`]);
    expect(one[3]!.ops).toEqual([`delete:${PVTYPE}`]);
    const many = steps(R.planDeletePvType({ ...base, unitIds: ["u1", "u2", "u3"] }).writes);
    expect(many[2]).toMatchObject({ kind: "group", limit: LEAF_DELETE_CONCURRENCY, ops: reps(`delete:${TURBINE}`, 3) });
    expect(many[3]!.ops).toEqual([`delete:${PVTYPE}`]);
  });

  it("UT-GEN-205 rollback: allocations and turbines are leaf groups (16), several bridge rows a leaf group, several types a cascade group; a single bridge row or type is a plain step; roll-up last", () => {
    const row = (entitySet: string, id: string) => ({ entitySet, id });
    const remaining = [{ id: "t-old", requestPermissionState: null, status: CHOICE_PLANT.status.active, generatorsCapacity: 3, generatorsCost: 4 }];
    const landed = [
      row(TYPE, "t-new"), ...n(40, (i) => row(TURBINE, `w${i}`)), row(BRIDGE, "b1"), ...n(30, (i) => row(ALLOC, `a${i}`)),
    ];
    const plan = R.planRollbackCreate({ project: P, landed, rollupRan: true, remainingTypes: remaining });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.limit, x.ops.length])).toEqual([
      ["group", LEAF_DELETE_CONCURRENCY, 30], ["single", undefined, 1], ["group", LEAF_DELETE_CONCURRENCY, 40],
      ["single", undefined, 1], ["single", undefined, 1],
    ]);
    expect(s[4]!.ops).toEqual([`update:${PROJECTS}`]);
    const several = R.planRollbackCreate({
      project: P, landed: [row(TYPE, "t1"), row(TYPE, "t2"), row(BRIDGE, "b1"), row(BRIDGE, "b2")], rollupRan: false, remainingTypes: remaining,
    });
    const s2 = steps(several.writes);
    expect(s2.map((x) => [x.kind, x.limit, x.ops])).toEqual([
      ["group", LEAF_DELETE_CONCURRENCY, [`delete:${BRIDGE}`, `delete:${BRIDGE}`]],
      ["group", CASCADE_DELETE_CONCURRENCY, [`delete:${TYPE}`, `delete:${TYPE}`]],
    ]);
  });

  it("UT-GEN-206 status toggle: the turbines' statecode UPDATES keep the default limit (8), not a delete tier; type update first, roll-up last", () => {
    const type = genType();
    const plan = R.planToggleStatus({ project: P, type, turbines: wtgUnits(20), allTypes: [type] });
    const s = steps(plan.writes);
    expect(s.map((x) => x.kind)).toEqual(["single", "group", "single"]);
    expect(s[1]!.limit).toBeUndefined();
    expect(s[1]!.ops).toEqual(reps(`update:${TURBINE}`, 20));
    expect(plan.writes).toHaveLength(22);
  });

  it("UT-GEN-207 Replace job 1: the detach (updates, default limit) runs before the unit deletes (leaf, 16) and every bridge-row delete; a single bridge row is a plain step; the type delete follows", () => {
    const plan = R.planReplaceGeneratorType({
      project: P, oldType: genType({ numberOfGenerators: 2 }), inCountry: true, model: model(), costPerWtg: 1000,
      selectedHeight: 150, revisedHubHeight: null, otherTypes: [], otherTurbines: [],
      inputs: { bridgeIds: ["b1"], opexCostIds: ["o1", "o2", "o3"], unitIds: ["w1", "w2", "w3", "w4"], allocations: [], landLeaseCosts: [] },
    });
    const s = steps(plan.writes);
    expect(s[0]).toMatchObject({ kind: "group", limit: undefined, ops: reps(`update:${OPEX}`, 3) });
    expect(s[1]).toMatchObject({ kind: "group", limit: LEAF_DELETE_CONCURRENCY, ops: reps(`delete:${TURBINE}`, 4) });
    expect(s[2]).toMatchObject({ kind: "single", ops: [`delete:${BRIDGE}`] });
    expect(s[3]).toMatchObject({ kind: "single", ops: [`delete:${TYPE}`] });
    // Several bridge rows: one leaf group, still after the detach.
    const multi = R.planReplaceGeneratorType({
      project: P, oldType: genType({ numberOfGenerators: 2 }), inCountry: true, model: model(), costPerWtg: 1000,
      selectedHeight: 150, revisedHubHeight: null, otherTypes: [], otherTurbines: [],
      inputs: { bridgeIds: ["b1", "b2"], opexCostIds: ["o1"], unitIds: [], allocations: [], landLeaseCosts: [] },
    });
    const m = steps(multi.writes);
    expect(m[0]!.ops).toEqual([`update:${OPEX}`]);
    expect(m[1]).toMatchObject({ kind: "group", limit: LEAF_DELETE_CONCURRENCY, ops: reps(`delete:${BRIDGE}`, 2) });
  });

  it("UT-GEN-208 Replace WTG job 2: creates, moves and O&M re-links are one run; the old allocations' deletes are their own leaf group AFTER it", () => {
    const plan = R.planReplaceGeneratorTypeFollowUp({
      project: P, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId: "b9",
      newUnits: [{ id: "n1", name: "WTG WPN_8" }, { id: "n2", name: "WTG WPN_9" }],
      inputs: {
        bridgeIds: [], opexCostIds: ["o1", "o2"], unitIds: [], landLeaseCosts: costs(2),
        allocations: [
          { id: "m1", unitIndex: 1, allWtgAllocated: false }, { id: "m2", unitIndex: 2, allWtgAllocated: false },
          { id: "m3", unitIndex: 3, allWtgAllocated: false }, { id: "aw1", unitIndex: 1, allWtgAllocated: true },
          { id: "aw2", unitIndex: 2, allWtgAllocated: true },
        ],
      },
    });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.limit])).toEqual([["group", undefined], ["group", LEAF_DELETE_CONCURRENCY]]);
    // 4 creates (2 costs x 2 units), 2 moves, 2 re-links in the first run; 3 deletes (surplus m3, aw1, aw2) after it.
    expect(s[0]!.ops).toEqual([...reps(`create:${ALLOC}`, 4), ...reps(`update:${ALLOC}`, 2), ...reps(`update:${OPEX}`, 2)]);
    expect(s[1]!.ops).toEqual(reps(`delete:${ALLOC}`, 3));
    expect(idsOf(s[1]!)).toEqual(["m3", "aw1", "aw2"]);
  });

  it("UT-GEN-209 Replace PV job 2: unit create, then creates + moves, then the old AllWTG deletes as their own leaf group, then the PV totals, then the O&M re-links", () => {
    const plan = R.planReplacePvTypeFollowUp({
      project: P, newPvId: "pvN", newPvName: "JA 600", existingBridgeId: "b9",
      inputs: {
        bridgeIds: [], opexCostIds: ["o1"], unitIds: [], landLeaseCosts: costs(2),
        allocations: [
          { id: "m1", unitIndex: 1, allWtgAllocated: false },
          { id: "aw1", unitIndex: 1, allWtgAllocated: true }, { id: "aw2", unitIndex: 1, allWtgAllocated: true },
        ],
      },
      pvRows: [{ capacity: 12, cost: 1 }], inverters: [], substructures: [],
    });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.limit])).toEqual([
      ["single", undefined], ["group", undefined], ["group", LEAF_DELETE_CONCURRENCY], ["single", undefined], ["group", undefined],
    ]);
    expect(s[0]!.ops).toEqual([`create:${TURBINE}`]);
    expect(s[1]!.ops).toEqual([...reps(`create:${ALLOC}`, 2), `update:${ALLOC}`]);
    expect(s[2]!.ops).toEqual(reps(`delete:${ALLOC}`, 2));
    expect(s[3]!.ops).toEqual([`update:${PROJECTS}`]);
    expect(s[4]!.ops).toEqual([`update:${OPEX}`]);
  });
});
