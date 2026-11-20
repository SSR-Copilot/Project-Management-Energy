/**
 * UT-GENLAT-* — Generators save latency (D144): the plan builders with the `relaneWrites`, `replaceLanes` and `wideGroups`
 * switches off (today's plan, kept reachable) and on.
 *
 * THE INVARIANT: a switch changes only the GROUPING and ORDER of the writes, never WHAT is written. So every changed builder is
 * run as a golden master: the OLD plan and the NEW plan are built from the same inputs (same injected row ids) and must hold
 * exactly the same multiset of writes (operation, entity set, target row id, payload with every bind and the owning business
 * unit, delete flags, bulk rows), over a grid of N = 1, 5, 20, 41 turbines, L = 0, 1, 3 all-WTG costs, O = 0, 5 O&M costs,
 * apply-all on / off, in country / out of country, a new or an edited row, and the D115 bulk flags off / on. The wave counts
 * (plan steps, the repo's `steps()` helper) and the happens-before edges are asserted for each save.
 *
 * 001-004 the switches; 010-016 Add WTG type; 020-026 Add Individual Generator; 030-034 Add PV Module; 040-043 the status toggle;
 * 050-058 Replace Generator Type; 060-064 Replace PV Module; 070-074 the group limit (`wideGroups`).
 */
import { afterEach, describe, expect, it } from "vitest";
import { LEAF_DELETE_CONCURRENCY, CASCADE_DELETE_CONCURRENCY, WIDE_GROUP_CONCURRENCY, WRITE_CONCURRENCY } from "@/data/concurrency";
import { executePlan, type PlanClient } from "@/data/executePlan";
import {
  GENERATORS_PERF, GENERATORS_PERF_ALL_OFF, generatorsPerf, setGeneratorsPerfFlags,
} from "@/data/generatorsPerfFlags";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import type { PlannedWrite, WritePlan } from "@/data/writePlan";
import * as R from "./rules";
import {
  ALLOC, BRIDGE, OPEX, OFF, P, PROJECTS, PVTYPE, TURBINE, TYPE, costs, counter, genType, model, n, only, simple, steps, turbine,
  withoutGroupIds, type Step,
} from "./bulkPlans.testkit";

afterEach(() => setGeneratorsPerfFlags(null));

/** The three switches this work added, all off (today's plans) / all on (the shipped defaults). */
const OLD = { relaneWrites: false, replaceLanes: false, wideGroups: false } as const;
const NEW = { relaneWrites: true, replaceLanes: true, wideGroups: true } as const;
const NEW_NO_WIDE = { relaneWrites: true, replaceLanes: true, wideGroups: false } as const;
const BULK_ALL = only("allocations", "turbines", "applyAll", "status", "replace");

/* ───────────────────────────────────────────────────────────── helpers */

const stable = (value: unknown): string => JSON.stringify(value, (_k, v: unknown) =>
  (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : v));

/** A write without the scheduling metadata (`concurrent`, group id, limit): what is WRITTEN, not how it is sent. */
const content = (w: PlannedWrite): Record<string, unknown> => {
  const { concurrent: _c, concurrencyGroup: _g, concurrencyLimit: _l, ...rest } = w;
  return rest;
};
/** The multiset of writes of some plans: one canonical string per write, sorted. */
const multiset = (...plans: readonly WritePlan[]): string[] => plans.flatMap((p) => p.writes.map((w) => stable(content(w)))).sort();
const allSteps = (...plans: readonly WritePlan[]): Step[] => plans.flatMap((p) => steps(p.writes));
const waveCount = (...plans: readonly WritePlan[]): number => allSteps(...plans).length;
const isDelete = (s: Step): boolean => s.writes.every((w) => w.op === "delete");
const touches = (s: Step, entitySet: string): boolean => s.writes.some((w) => w.entitySet === entitySet);
const indexOfStep = (list: readonly Step[], pred: (s: Step) => boolean): number => list.findIndex(pred);
const lastIndexOfStep = (list: readonly Step[], pred: (s: Step) => boolean): number => {
  for (let i = list.length - 1; i >= 0; i -= 1) if (pred(list[i]!)) return i;
  return -1;
};
const countOf = (plans: readonly WritePlan[], pred: (w: PlannedWrite) => boolean): number => plans.flatMap((p) => p.writes).filter(pred).length;
const isRollup = (w: PlannedWrite): boolean => w.entitySet === PROJECTS;

const GRID_N = [1, 5, 20, 41] as const;
const GRID_L = [0, 1, 3] as const;

/* ───────────────────────────────────────────────────────────── 001-004 the switches */

describe("the save-latency switches (D144)", () => {
  it("UT-GENLAT-001 the shipped defaults: all four ON; the old behaviour of each is one value away", () => {
    expect(GENERATORS_PERF).toMatchObject({ relaneWrites: true, replaceLanes: true, trimReload: true, wideGroups: true });
    expect(generatorsPerf()).toMatchObject({ relaneWrites: true, replaceLanes: true, trimReload: true, wideGroups: true });
  });

  it("UT-GENLAT-002 every switch off (GENERATORS_PERF_ALL_OFF) switches all four off, and the test seam can set one", () => {
    expect(GENERATORS_PERF_ALL_OFF).toMatchObject({ relaneWrites: false, replaceLanes: false, trimReload: false, wideGroups: false });
    setGeneratorsPerfFlags({ relaneWrites: false });
    expect(generatorsPerf().relaneWrites).toBe(false);
    expect(generatorsPerf().replaceLanes).toBe(true);
  });

  it("UT-GENLAT-003 a builder reads the installed switch when no `perf` option is given, and `perf` wins over it", () => {
    const args = { project: P, type: genType(), turbines: wtgUnits(3), allTypes: [genType()] };
    setGeneratorsPerfFlags({ relaneWrites: false, wideGroups: false });
    expect(steps(R.planToggleStatus(args, { bulk: OFF }).writes).map((s) => s.kind)).toEqual(["single", "group", "single"]);
    expect(steps(R.planToggleStatus(args, { bulk: OFF, perf: { relaneWrites: true } }).writes).map((s) => s.kind)).toEqual(["group", "single"]);
    setGeneratorsPerfFlags(null);
    expect(steps(R.planToggleStatus(args, { bulk: OFF }).writes).map((s) => s.kind)).toEqual(["group", "single"]);
    expect(steps(R.planToggleStatus(args, { bulk: OFF, perf: OLD }).writes).map((s) => s.kind)).toEqual(["single", "group", "single"]);
  });

  it("UT-GENLAT-004 the group limit constants: 16 wide, 8 default, and the delete tiers (16 / 4) unchanged", () => {
    expect(WIDE_GROUP_CONCURRENCY).toBe(16);
    expect(WRITE_CONCURRENCY).toBe(8);
    expect(LEAF_DELETE_CONCURRENCY).toBe(16);
    expect(CASCADE_DELETE_CONCURRENCY).toBe(4);
  });
});

const wtgUnits = (count: number) => n(count, (i) => turbine(i));

/* ───────────────────────────────────────────────────────────── 010-016 Add WTG type */

const typeArgs = (count: number, inCountry: boolean): Parameters<typeof R.planCreateGeneratorType>[0] => ({
  project: P, inCountry, model: model({ specificCapacity: 5.6, hubHeight: 148, rotorDiameter: 150 }), numberOfGenerators: count,
  costPerWtg: 900_000, selectedHeight: 150, revisedHubHeight: null, existingTypes: [genType({ id: "t0" })], projectTurbines: [turbine(1), turbine(2)],
});

/** The save as the screen runs it: job 1 (the type, its turbines), then the follow-up built from job 1's created ids. */
function addTypePlans(
  count: number, costCount: number, inCountry: boolean, perf: R.PlanBulkOptions["perf"], bulk = OFF, hasDeviceType = false,
): [R.CreateTypePlan, WritePlan] {
  const first = R.planCreateGeneratorType(typeArgs(count, inCountry), { bulk, perf, newId: counter("w") });
  const follow = R.planGeneratorTypeFollowUp({
    project: P, typeId: "tNew", typeName: "WTG-0100", hasDeviceType,
    turbines: n(count, (i) => ({ id: `nw${i}`, name: `WTG WPN_${i + 2}` })), landLeaseCosts: costs(costCount),
    ...(first.deferredRollup ? { rollup: first.deferredRollup } : {}),
  }, { bulk, perf, newId: counter("a") });
  return [first, follow];
}

describe("Add WTG type (relaneWrites)", () => {
  it("UT-GENLAT-010 golden master: the same multiset of writes, old plan vs new plan, over N x L x country x hasDeviceType x bulk flags", () => {
    let cases = 0;
    for (const count of GRID_N) for (const L of GRID_L) for (const inCountry of [true, false]) for (const hasDevice of [false, true]) {
      for (const bulk of [OFF, only("turbines", "allocations")]) {
        const oldPlans = addTypePlans(count, L, inCountry, OLD, bulk, hasDevice);
        const newPlans = addTypePlans(count, L, inCountry, NEW, bulk, hasDevice);
        expect(multiset(...newPlans), `N=${count} L=${L} in=${inCountry} dev=${hasDevice}`).toEqual(multiset(...oldPlans));
        // Out of country there is no roll-up in either plan, and nothing is handed over.
        if (!inCountry) {
          expect(countOf(newPlans, isRollup)).toBe(0);
          expect(newPlans[0].deferredRollup).toBeUndefined();
        } else expect(countOf(newPlans, isRollup)).toBe(1);
        cases += 1;
      }
    }
    expect(cases).toBe(4 * 3 * 2 * 2 * 2);
  });

  it("UT-GENLAT-011 wave count (no bulk flags): 4 -> 3 in country (type, turbines, ONE wave of device-type row + roll-up + allocations); out of country 3 -> 3", () => {
    for (const count of GRID_N) for (const L of GRID_L) {
      const oldPlans = addTypePlans(count, L, true, OLD);
      const newPlans = addTypePlans(count, L, true, NEW);
      expect(waveCount(...oldPlans), `old N=${count} L=${L}`).toBe(4);
      expect(waveCount(...newPlans), `new N=${count} L=${L}`).toBe(3);
      const s = allSteps(...newPlans);
      expect(s.map((x) => x.kind)).toEqual(["single", "group", "group"]);
      // The last wave holds the device-type row, the roll-up and the N x L allocations.
      expect(s[2]!.writes).toHaveLength(2 + count * L);
      const out = addTypePlans(count, L, false, NEW);
      expect(waveCount(...out)).toBe(3);
      expect(waveCount(...addTypePlans(count, L, false, OLD))).toBe(3);
    }
  });

  it("UT-GENLAT-012 happens-before: the type first; every turbine, bridge row, allocation and the roll-up after it; the roll-up after every turbine and exactly once", () => {
    for (const count of [1, 5, 20]) {
      const plans = addTypePlans(count, 3, true, NEW);
      const s = allSteps(...plans);
      expect(s[0]!.ops).toEqual([`create:${TYPE}`]);
      const turbineStep = indexOfStep(s, (x) => touches(x, TURBINE));
      const allocStep = indexOfStep(s, (x) => touches(x, ALLOC));
      const rollupStep = indexOfStep(s, (x) => x.writes.some(isRollup));
      expect(turbineStep).toBeGreaterThan(0);
      // Allocations bind the turbines created in the step before; the roll-up sums the turbines.
      expect(allocStep).toBeGreaterThan(turbineStep);
      expect(rollupStep).toBeGreaterThan(turbineStep);
      expect(countOf(plans, isRollup)).toBe(1);
      // The turbines are created by job 1 (the follow-up is built from their ids), so the allocation wave is job 2's.
      expect(plans[0].writes.some((w) => w.entitySet === ALLOC)).toBe(false);
      expect(plans[0].writes.some(isRollup)).toBe(false);
    }
  });

  it("UT-GENLAT-013 the roll-up is handed back, not dropped: `deferredRollup` is the SAME write the old plan ended with", () => {
    const old = R.planCreateGeneratorType(typeArgs(5, true), { bulk: OFF, perf: OLD });
    const fresh = R.planCreateGeneratorType(typeArgs(5, true), { bulk: OFF, perf: NEW });
    expect(old.deferredRollup).toBeUndefined();
    expect(stable(content(fresh.deferredRollup!))).toBe(stable(content(old.writes[old.writes.length - 1]!)));
    expect(fresh.writes).toHaveLength(old.writes.length - 1);
    expect(stable(fresh.writes.map(content))).toBe(stable(old.writes.slice(0, -1).map(content)));
  });

  it("UT-GENLAT-014 a follow-up handed no roll-up (the switch off, or out of country) is today's plan, byte for byte", () => {
    const base = {
      project: P, typeId: "tNew", typeName: "WTG-0100", hasDeviceType: false,
      turbines: n(5, (i) => ({ id: `nw${i}`, name: `WTG WPN_${i}` })), landLeaseCosts: costs(3),
    };
    const a = R.planGeneratorTypeFollowUp(base, { bulk: OFF, perf: OLD });
    const b = R.planGeneratorTypeFollowUp(base, { bulk: OFF, perf: { ...OLD } });
    expect(withoutGroupIds(a.writes)).toEqual(withoutGroupIds(b.writes));
    expect(steps(a.writes).map((x) => [x.kind, x.limit, x.ops.length])).toEqual([["group", undefined, 16]]);
    // With the switch on but nothing handed over (out of country) the same writes form the same one group.
    expect(steps(R.planGeneratorTypeFollowUp(base, { bulk: OFF, perf: NEW_NO_WIDE }).writes).map((x) => [x.kind, x.limit, x.ops.length]))
      .toEqual([["group", undefined, 16]]);
  });

  it("UT-GENLAT-015 with the D115 bulk flags on: type, createMany(turbines), ONE wave {device-type row, roll-up}, createMany(allocations): 5 -> 4 steps", () => {
    const oldPlans = addTypePlans(20, 3, true, OLD, only("turbines", "allocations"));
    const newPlans = addTypePlans(20, 3, true, NEW, only("turbines", "allocations"));
    expect(steps(oldPlans[0].writes).map((s) => s.kind).concat(steps(oldPlans[1].writes).map((s) => s.kind))).toEqual(["single", "bulk", "single", "single", "bulk"]);
    expect(allSteps(...newPlans).map((s) => s.kind)).toEqual(["single", "bulk", "group", "bulk"]);
    expect(waveCount(...oldPlans)).toBe(5);
    expect(waveCount(...newPlans)).toBe(4);
    // No bulk step is inside a group.
    expect(newPlans.flatMap((p) => p.writes).every((w) => !(w.op === "createMany" || w.op === "updateMany") || !w.concurrent)).toBe(true);
  });

  it("UT-GENLAT-016 a refused plan (no owning business unit) stays refused and sends nothing, switch on or off", () => {
    const refusedArgs = { ...typeArgs(5, true), project: { ...P, owningBusinessUnitId: null } };
    for (const perf of [OLD, NEW]) {
      const refused = R.planCreateGeneratorType(refusedArgs, { bulk: OFF, perf });
      expect(refused.refusedReason).toBe(R.OWNING_BU_MSG.missing);
      expect(refused.writes).toEqual([]);
    }
  });
});

/* ───────────────────────────────────────────────────────────── 020-026 Add Individual Generator */

const turbineArgs = (
  siblings: number, costCount: number, over: Partial<Parameters<typeof R.planSaveTurbine>[0]> = {},
): Parameters<typeof R.planSaveTurbine>[0] => {
  const type = genType({ id: "t1", numberOfGenerators: siblings });
  const all = n(siblings, (i) => turbine(i, { foundationPlinth: i % 2, hubHeightExclPlinth: 148 }));
  return {
    lang: "en-US", project: P, type, model: model({ rotorDiameter: 150 }), accumulatedIndex: 1, turbine: null,
    typeTurbines: all, allTypes: [type, genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })],
    form: { nameIndex: "99", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["nameIndex"]) },
    applyAll: { capacity: false, hubHeight: false, plinth: false }, totalHeight: 226, landLeaseCosts: costs(costCount), ...over,
  };
};
const APPLY_ALL = { capacity: true, hubHeight: true, plinth: false };

describe("Add Individual Generator (relaneWrites)", () => {
  it("UT-GENLAT-020 golden master: the same multiset of writes over N siblings x L costs x apply-all x bulk flags (a NEW turbine)", () => {
    let cases = 0;
    for (const siblings of GRID_N) for (const L of GRID_L) for (const applyAll of [{ capacity: false, hubHeight: false, plinth: false }, APPLY_ALL]) {
      for (const bulk of [OFF, only("allocations", "applyAll"), BULK_ALL]) {
        const args = turbineArgs(siblings, L, { applyAll });
        const old = R.planSaveTurbine(args, { bulk, perf: OLD, newId: counter("a") });
        const fresh = R.planSaveTurbine(args, { bulk, perf: NEW, newId: counter("a") });
        expect(multiset(fresh), `S=${siblings} L=${L} all=${applyAll.capacity}`).toEqual(multiset(old));
        cases += 1;
      }
    }
    expect(cases).toBe(4 * 3 * 2 * 3);
  });

  it("UT-GENLAT-021 wave count, no apply-all: L = 0 3 -> 2, L > 0 4 -> 2 (the turbine create, then ONE wave of type update + roll-up + allocations)", () => {
    for (const siblings of GRID_N) for (const L of GRID_L) {
      const args = turbineArgs(siblings, L);
      const old = R.planSaveTurbine(args, { bulk: OFF, perf: OLD });
      const fresh = R.planSaveTurbine(args, { bulk: OFF, perf: NEW });
      expect(steps(old.writes).length, `old S=${siblings} L=${L}`).toBe(L === 0 ? 3 : 4);
      expect(steps(fresh.writes).length, `new S=${siblings} L=${L}`).toBe(2);
      const s = steps(fresh.writes);
      expect(s[0]!.ops).toEqual([`create:${TURBINE}`]);
      expect(s[1]!.kind).toBe("group");
      expect(s[1]!.writes).toHaveLength(2 + L);
    }
  });

  it("UT-GENLAT-022 wave count with apply-all: the siblings update in the SAME wave as the type update (1 + S + 2 + L writes in 2 steps)", () => {
    for (const siblings of GRID_N) for (const L of GRID_L) {
      const args = turbineArgs(siblings, L, { applyAll: APPLY_ALL });
      const old = R.planSaveTurbine(args, { bulk: OFF, perf: OLD });
      const fresh = R.planSaveTurbine(args, { bulk: OFF, perf: NEW });
      expect(steps(old.writes).length).toBe(L === 0 ? 4 : 5);
      expect(steps(fresh.writes).length).toBe(2);
      expect(fresh.writes).toHaveLength(1 + siblings + 2 + L);
      expect(steps(fresh.writes)[1]!.writes.filter((w) => w.entitySet === TURBINE)).toHaveLength(siblings);
    }
  });

  it("UT-GENLAT-023 happens-before: the allocations bind the turbine the first step created (@created#0); the roll-up is written once, with the re-derived type", () => {
    const args = turbineArgs(5, 3);
    const fresh = R.planSaveTurbine(args, { bulk: OFF, perf: NEW });
    const alloc = fresh.writes.filter((w) => w.entitySet === ALLOC);
    expect(alloc).toHaveLength(3);
    expect(alloc.every((w) => w.data![R.PLANT_BIND.generatorInProject] === "/vsb_generatorinprojects(@created#0)")).toBe(true);
    expect(fresh.writes[0]!.op).toBe("create");
    expect(fresh.writes.slice(1).every((w) => w.concurrent)).toBe(true);
    expect(fresh.writes.filter(isRollup)).toHaveLength(1);
    const old = R.planSaveTurbine(args, { bulk: OFF, perf: OLD });
    expect(stable(content(fresh.writes.find(isRollup)!))).toBe(stable(content(old.writes.find(isRollup)!)));
  });

  it("UT-GENLAT-024 an EDIT keeps today's order and shape (only the group limit follows `wideGroups`)", () => {
    for (const siblings of [1, 5, 20]) {
      const base = turbineArgs(siblings, 3, { applyAll: APPLY_ALL });
      const args = { ...base, turbine: base.typeTurbines[0]! };
      const old = R.planSaveTurbine(args, { bulk: OFF, perf: OLD });
      const noWide = R.planSaveTurbine(args, { bulk: OFF, perf: NEW_NO_WIDE });
      expect(withoutGroupIds(noWide.writes)).toEqual(withoutGroupIds(old.writes));
      expect(steps(noWide.writes).map((s) => [s.kind, s.ops])).toEqual(steps(old.writes).map((s) => [s.kind, s.ops]));
      const wide = R.planSaveTurbine(args, { bulk: OFF, perf: NEW });
      expect(multiset(wide)).toEqual(multiset(old));
      expect(steps(wide.writes).map((s) => s.ops)).toEqual(steps(old.writes).map((s) => s.ops));
    }
  });

  it("UT-GENLAT-025 with the D115 bulk flags on: bulk steps keep their place (after the turbine / after the wave) and none is inside a group", () => {
    const args = turbineArgs(20, 3, { applyAll: APPLY_ALL });
    const fresh = R.planSaveTurbine(args, { bulk: BULK_ALL, perf: NEW, newId: counter("a") });
    expect(steps(fresh.writes).map((s) => [s.kind, s.ops])).toEqual([
      ["single", [`create:${TURBINE}`]], ["bulk", [`updateMany:${TURBINE}`]], ["group", [`update:${TYPE}`, `update:${PROJECTS}`]],
      ["bulk", [`createMany:${ALLOC}`]],
    ]);
    expect(steps(R.planSaveTurbine(args, { bulk: BULK_ALL, perf: OLD, newId: counter("a") }).writes).map((s) => s.kind))
      .toEqual(["single", "bulk", "single", "single", "bulk"]);
  });

  it("UT-GENLAT-026 the guarded-updates flag (D116 DEL-7a) still guards the type update and every sibling inside the wave", () => {
    const args = turbineArgs(5, 2, { applyAll: APPLY_ALL });
    const fresh = R.planSaveTurbine(args, { bulk: OFF, perf: NEW, delete: { guardedUpdates: true } });
    const guarded = fresh.writes.filter((w) => w.guarded);
    expect(guarded.map((w) => w.entitySet).sort()).toEqual([...Array(5).fill(TURBINE), TYPE].sort());
    expect(multiset(fresh)).toEqual(multiset(R.planSaveTurbine(args, { bulk: OFF, perf: OLD, delete: { guardedUpdates: true } })));
  });
});

/* ───────────────────────────────────────────────────────────── 030-034 Add PV Module */

const pvArgs = (costCount: number, over: Partial<Parameters<typeof R.planPvFollowUp>[0]> = {}): Parameters<typeof R.planPvFollowUp>[0] => ({
  project: P, pvId: "pv1", pvName: "PV-0007", unitId: null, hasDeviceType: false,
  pvRows: [{ capacity: 12, cost: 100 }, { capacity: 3, cost: 20 }], inverters: [{ cost: 5 }], substructures: [{ cost: 7 }],
  isNew: true, landLeaseCosts: costs(costCount), ...over,
});
const pvForm = { capacity: "12", moduleLabel: "JA 600", supplier: "m1", degradation1stYear: "", degradationRemainingYears: "", dirty: new Set<string>() };
const pvFirst = () => R.planSavePvType({ project: P, pv: null, form: pvForm, deviceCostModules: 100, otherSupplierChosen: false, lang: "en-US" });

describe("Add PV Module (relaneWrites)", () => {
  it("UT-GENLAT-030 golden master: the same multiset over L x new / edit x unit existing x device-type row x allocations bulk", () => {
    let cases = 0;
    for (const L of GRID_L) for (const isNew of [true, false]) for (const unitId of [null, "u7"]) for (const hasDeviceType of [true, false]) {
      for (const bulk of [OFF, only("allocations")]) {
        const args = pvArgs(L, { isNew, unitId, hasDeviceType });
        const old = R.planPvFollowUp(args, { bulk, perf: OLD, newId: counter("a") });
        const fresh = R.planPvFollowUp(args, { bulk, perf: NEW, newId: counter("a") });
        expect(multiset(fresh), `L=${L} new=${isNew} unit=${String(unitId)} dev=${hasDeviceType}`).toEqual(multiset(old));
        cases += 1;
      }
    }
    expect(cases).toBe(3 * 2 * 2 * 2 * 2);
    // The first job (the PV type create) is not touched.
    expect(multiset(pvFirst())).toHaveLength(1);
  });

  it("UT-GENLAT-031 wave count: the whole save is 5 -> 3 (PV create, unit create, ONE wave of allocations + device-type row + roll-up); L = 0 4 -> 3", () => {
    for (const L of GRID_L) {
      const args = pvArgs(L);
      const old = R.planPvFollowUp(args, { bulk: OFF, perf: OLD });
      const fresh = R.planPvFollowUp(args, { bulk: OFF, perf: NEW });
      expect(waveCount(pvFirst(), old), `old L=${L}`).toBe(L === 0 ? 4 : 5);
      expect(waveCount(pvFirst(), fresh), `new L=${L}`).toBe(3);
      const s = steps(fresh.writes);
      expect(s[0]!.ops).toEqual([`create:${TURBINE}`]);
      expect(s[1]!.kind).toBe("group");
      expect(s[1]!.writes).toHaveLength(L + 2);
    }
  });

  it("UT-GENLAT-032 happens-before: the unit is created first; the allocations bind it (@created#0); the roll-up is written once; the bridge row names the PV type", () => {
    const fresh = R.planPvFollowUp(pvArgs(3), { bulk: OFF, perf: NEW });
    expect(fresh.writes[0]!.op).toBe("create");
    expect(fresh.writes[0]!.entitySet).toBe(TURBINE);
    const alloc = fresh.writes.filter((w) => w.entitySet === ALLOC);
    expect(alloc).toHaveLength(3);
    expect(alloc.every((w) => w.data![R.PLANT_BIND.generatorInProject] === "/vsb_generatorinprojects(@created#0)")).toBe(true);
    expect(fresh.writes.filter(isRollup)).toHaveLength(1);
    expect(fresh.writes.filter((w) => w.entitySet === BRIDGE)).toHaveLength(1);
    expect(fresh.writes.slice(1).every((w) => w.concurrent)).toBe(true);
  });

  it("UT-GENLAT-033 with the allocations flag on: the unit, createMany, ONE wave {roll-up, device-type row}: 4 -> 3 steps", () => {
    const args = pvArgs(3);
    const old = R.planPvFollowUp(args, { bulk: only("allocations"), perf: OLD, newId: counter("a") });
    const fresh = R.planPvFollowUp(args, { bulk: only("allocations"), perf: NEW, newId: counter("a") });
    expect(steps(old.writes).map((s) => s.kind)).toEqual(["single", "bulk", "single", "single"]);
    expect(steps(fresh.writes).map((s) => [s.kind, s.ops])).toEqual([
      ["single", [`create:${TURBINE}`]], ["bulk", [`createMany:${ALLOC}`]], ["group", [`update:${PROJECTS}`, `create:${BRIDGE}`]],
    ]);
  });

  it("UT-GENLAT-034 a refused follow-up (no owning business unit) stays refused", () => {
    for (const perf of [OLD, NEW]) {
      const refused = R.planPvFollowUp(pvArgs(2, { project: { ...P, owningBusinessUnitId: null } }), { bulk: OFF, perf });
      expect(refused.refusedReason).toBe(R.OWNING_BU_MSG.missing);
      expect(refused.writes).toEqual([]);
    }
  });
});

/* ───────────────────────────────────────────────────────────── 040-043 the status toggle */

const toggleArgs = (count: number, status: number = CHOICE_PLANT.status.active) => {
  const type = genType({ status });
  return { project: P, type, turbines: wtgUnits(count), allTypes: [type, genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })] };
};

describe("status toggle (relaneWrites)", () => {
  it("UT-GENLAT-040 golden master: the same multiset over N turbines (0, 1, 5, 20, 41) x activate / deactivate x the `status` bulk flag", () => {
    for (const count of [0, ...GRID_N]) for (const status of [CHOICE_PLANT.status.active, CHOICE_PLANT.status.inactive]) {
      for (const bulk of [OFF, only("status")]) {
        const args = toggleArgs(count, status);
        expect(multiset(R.planToggleStatus(args, { bulk, perf: NEW })), `N=${count}`).toEqual(multiset(R.planToggleStatus(args, { bulk, perf: OLD })));
      }
    }
  });

  it("UT-GENLAT-041 wave count: 3 -> 2 (ONE wave of type update + turbine updates, then the roll-up); with no turbines 2 -> 2", () => {
    for (const count of GRID_N) {
      const old = R.planToggleStatus(toggleArgs(count), { bulk: OFF, perf: OLD });
      const fresh = R.planToggleStatus(toggleArgs(count), { bulk: OFF, perf: NEW });
      expect(steps(old.writes).map((s) => s.kind)).toEqual(["single", "group", "single"]);
      const s = steps(fresh.writes);
      expect(s.map((x) => x.kind)).toEqual(["group", "single"]);
      expect(s[0]!.writes).toHaveLength(1 + count);
      expect(s[1]!.ops).toEqual([`update:${PROJECTS}`]);
    }
    expect(steps(R.planToggleStatus(toggleArgs(0), { bulk: OFF, perf: NEW }).writes).map((x) => x.kind)).toEqual(["single", "single"]);
    expect(steps(R.planToggleStatus(toggleArgs(0), { bulk: OFF, perf: OLD }).writes).map((x) => x.kind)).toEqual(["single", "single"]);
  });

  it("UT-GENLAT-042 the roll-up stays LAST and is written once (after the type and the turbines it sums)", () => {
    for (const count of [1, 20]) {
      const fresh = R.planToggleStatus(toggleArgs(count), { bulk: OFF, perf: NEW });
      expect(fresh.writes[fresh.writes.length - 1]!.entitySet).toBe(PROJECTS);
      expect(fresh.writes.filter(isRollup)).toHaveLength(1);
    }
  });

  it("UT-GENLAT-043 the `status` bulk path is unchanged by relaneWrites (type, updateMany, roll-up)", () => {
    const fresh = R.planToggleStatus(toggleArgs(5), { bulk: only("status"), perf: NEW });
    expect(steps(fresh.writes).map((s) => s.kind)).toEqual(["single", "bulk", "single"]);
    expect(withoutGroupIds(fresh.writes)).toEqual(withoutGroupIds(R.planToggleStatus(toggleArgs(5), { bulk: only("status"), perf: OLD }).writes));
  });
});

/* ───────────────────────────────────────────────────────────── 050-058 Replace Generator Type */

type RA = R.ReplaceInputs["allocations"];
const replaceInputs = (count: number, costCount: number, opexCount: number, bridges = 1, manual = 2): R.ReplaceInputs => {
  const allWtg: RA = n(count * costCount, (i) => ({
    id: `aw${i}`, costId: `c${((i - 1) % Math.max(costCount, 1)) + 1}`, unitIndex: ((i - 1) % count) + 1, allWtgAllocated: true,
  }));
  const manuals: RA = n(manual, (i) => ({ id: `m${i}`, costId: "cm", unitIndex: i, allWtgAllocated: false }));
  return {
    bridgeIds: n(bridges, (i) => `b${i}`), opexCostIds: n(opexCount, (i) => `o${i}`), unitIds: n(count, (i) => `w${i}`),
    allocations: [...allWtg, ...manuals], landLeaseCosts: costs(costCount),
  };
};

function replaceWtgPlans(
  count: number, costCount: number, opexCount: number, inCountry: boolean, perf: R.PlanBulkOptions["perf"],
  o: { bulk?: R.PlanBulkOptions["bulk"]; bridges?: number; existingBridgeId?: string | null; delete?: R.PlanBulkOptions["delete"]; manual?: number } = {},
): [R.CreateTypePlan, R.ReplaceFollowUpPlan] {
  const inputs = replaceInputs(count, costCount, opexCount, o.bridges ?? 1, o.manual ?? 2);
  const bulk = o.bulk ?? OFF;
  const opts: R.PlanBulkOptions = { bulk, perf, newId: counter("w"), ...(o.delete ? { delete: o.delete } : {}) };
  const first = R.planReplaceGeneratorType({
    project: P, oldType: genType({ id: "t1", numberOfGenerators: count }), inCountry,
    model: model({ id: "g2", specificCapacity: 6, hubHeight: 150, rotorDiameter: 160 }), costPerWtg: 1000, selectedHeight: 150,
    revisedHubHeight: null, otherTypes: [genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })], otherTurbines: [turbine(7)], inputs,
  }, opts);
  const follow = R.planReplaceGeneratorTypeFollowUp({
    project: P, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId: o.existingBridgeId ?? null,
    newUnits: n(count, (i) => ({ id: `n${i}`, name: `WTG WPN_${i + 1}` })), inputs,
    ...(first.deferredRollup ? { rollup: first.deferredRollup } : {}),
  }, { ...opts, newId: counter("a") });
  return [first, follow];
}

describe("Replace Generator Type (replaceLanes)", () => {
  it("UT-GENLAT-050 golden master: the same multiset over N x L x O x country x bridge rows x existing bridge x D115 flags (off / all on)", () => {
    let cases = 0;
    for (const count of GRID_N) for (const L of GRID_L) for (const O of [0, 5]) for (const inCountry of [true, false]) {
      for (const bridges of [1, 2]) for (const existingBridgeId of [null, "b9"]) {
        for (const bulk of [OFF, BULK_ALL]) {
          const o = { bulk, bridges, existingBridgeId };
          const old = replaceWtgPlans(count, L, O, inCountry, OLD, o);
          const fresh = replaceWtgPlans(count, L, O, inCountry, NEW, o);
          expect(multiset(...fresh), `N=${count} L=${L} O=${O} in=${inCountry} br=${bridges} ex=${String(existingBridgeId)}`).toEqual(multiset(...old));
          expect(countOf(fresh, isRollup)).toBe(inCountry ? 1 : 0);
          cases += 1;
        }
      }
    }
    expect(cases).toBe(4 * 3 * 2 * 2 * 2 * 2 * 2);
  });

  it("UT-GENLAT-051 write waves (no bulk flags, 1 bridge row to create, no manual allocations): old = detach + 8 + rows + removals, new = detach + 6 + rows + removals; the units and the bridge row are ONE delete wave", () => {
    for (const count of GRID_N) for (const L of GRID_L) for (const O of [0, 5]) {
      const rows = count * L + O > 0 ? 1 : 0; // the run of allocation creates and O&M re-links
      const removals = L > 0 ? 1 : 0; // the old AllWTG allocations
      const detach = O > 0 ? 1 : 0;
      const old = replaceWtgPlans(count, L, O, true, OLD, { manual: 0 });
      const fresh = replaceWtgPlans(count, L, O, true, NEW, { manual: 0 });
      // old: detach, units, bridge row, old type, new type, turbines, roll-up | device-type row, rows, removals
      expect(waveCount(...old), `old N=${count} L=${L} O=${O}`).toBe(detach + 6 + 1 + rows + removals);
      // new: detach, units + bridge row, old type, new type, turbines | device-type row + roll-up, rows, removals
      expect(waveCount(...fresh), `new N=${count} L=${L} O=${O}`).toBe(detach + 4 + 1 + rows + removals);
      expect(waveCount(...old) - waveCount(...fresh)).toBe(2);
      const s = allSteps(...fresh);
      const leaf = s[detach]!;
      expect(leaf.ops.every((op) => op === `delete:${TURBINE}` || op === `delete:${BRIDGE}`)).toBe(true);
      expect(leaf.writes).toHaveLength(count + 1);
      expect(s[detach + 1]!.ops).toEqual([`delete:${TYPE}`]);
    }
  });

  it("UT-GENLAT-052 happens-before: the detach precedes every device-type-row delete; children before the type delete; the type delete before the type create", () => {
    const fresh = replaceWtgPlans(20, 3, 5, true, NEW);
    const s = allSteps(...fresh);
    const detach = indexOfStep(s, (x) => x.writes.every((w) => w.entitySet === OPEX && w.op === "update") && x.writes.length > 0);
    const bridgeDelete = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === BRIDGE && w.op === "delete"));
    const unitDelete = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === TURBINE && w.op === "delete"));
    const typeDelete = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === TYPE && w.op === "delete"));
    const typeCreate = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === TYPE && w.op === "create"));
    expect(detach).toBe(0);
    expect(bridgeDelete).toBeGreaterThan(detach);
    expect(unitDelete).toBe(bridgeDelete);
    expect(typeDelete).toBeGreaterThan(bridgeDelete);
    expect(typeCreate).toBeGreaterThan(typeDelete);
  });

  it("UT-GENLAT-053 the delete lane and the create lane never overlap (D115 decision 5): no step mixes deletes with creates or updates, the old allocations go LAST", () => {
    for (const O of [0, 5]) for (const L of [1, 3]) {
      const fresh = replaceWtgPlans(20, L, O, true, NEW);
      const s = allSteps(...fresh);
      for (const step of s) expect(isDelete(step) || step.writes.every((w) => w.op !== "delete"), `${step.ops.join(",")}`).toBe(true);
      const firstCreate = indexOfStep(s, (x) => x.writes.some((w) => w.op === "create"));
      const lastDeleteBeforeCreates = lastIndexOfStep(s.slice(0, firstCreate), isDelete);
      expect(lastDeleteBeforeCreates).toBe(firstCreate - 1);
      // The removal of the old allocations is the last step; every create and update comes before it.
      const last = s[s.length - 1]!;
      expect(isDelete(last) && last.writes.every((w) => w.entitySet === ALLOC)).toBe(true);
      expect(lastIndexOfStep(s, (x) => x.writes.some((w) => w.op !== "delete"))).toBe(s.length - 2);
    }
  });

  it("UT-GENLAT-054 the roll-up lands in the follow-up's FIRST wave (beside the device-type row), after every turbine, once; with an existing bridge it joins the allocations", () => {
    const fresh = replaceWtgPlans(20, 3, 5, true, NEW);
    const job2 = steps(fresh[1].writes);
    expect(job2[0]!.writes.map((w) => w.entitySet).sort()).toEqual([BRIDGE, PROJECTS].sort());
    expect(fresh[0].deferredRollup).toBeDefined();
    expect(fresh[0].writes.some(isRollup)).toBe(false);
    const existing = replaceWtgPlans(20, 3, 5, true, NEW, { existingBridgeId: "b9" });
    expect(steps(existing[1].writes)[0]!.writes.some(isRollup)).toBe(true);
    expect(countOf(existing, (w) => w.entitySet === BRIDGE && w.op === "create")).toBe(0);
    // The re-links bind the device-type row created in the first wave (@created#0).
    const relinks = fresh[1].writes.filter((w) => w.entitySet === OPEX);
    expect(relinks).toHaveLength(5);
    expect(relinks.every((w) => (w.data as Record<string, unknown>)[R.PLANT_BIND.deviceTypeInProject] === "/vsb_devicetypesinprojects(@created#0)")).toBe(true);
  });

  it("UT-GENLAT-055 every delete keeps its own flags in the merged delete wave: units `confirm`, bridge rows plain, hardened, the type `confirm`", () => {
    const fresh = replaceWtgPlans(5, 1, 0, true, NEW, { bridges: 2 });
    const wave1 = steps(fresh[0].writes)[0]!;
    expect(wave1.writes.every((w) => w.hardened === true)).toBe(true);
    expect(wave1.writes.filter((w) => w.entitySet === TURBINE).every((w) => w.confirm === true)).toBe(true);
    expect(wave1.writes.filter((w) => w.entitySet === BRIDGE).every((w) => !w.confirm)).toBe(true);
    expect(wave1.limit).toBe(LEAF_DELETE_CONCURRENCY);
    const typeDelete = fresh[0].writes.find((w) => w.entitySet === TYPE && w.op === "delete")!;
    expect(typeDelete.confirm).toBe(true);
  });

  it("UT-GENLAT-056 a lone delete (no unit, one bridge row) stays a plain step; with neither the type delete follows the detach directly", () => {
    const lone = R.planReplaceGeneratorType({
      project: P, oldType: genType({ id: "t1", numberOfGenerators: 0 }), inCountry: true, model: model({ id: "g2" }), costPerWtg: 1000,
      selectedHeight: 150, revisedHubHeight: null, otherTypes: [], otherTurbines: [],
      inputs: { bridgeIds: ["b1"], opexCostIds: [], unitIds: [], allocations: [], landLeaseCosts: [] },
    }, { bulk: OFF, perf: NEW });
    expect(steps(lone.writes).map((s) => [s.kind, s.ops])).toEqual([
      ["single", [`delete:${BRIDGE}`]], ["single", [`delete:${TYPE}`]], ["single", [`create:${TYPE}`]],
    ]);
  });

  it("UT-GENLAT-057 with the tiers off the merged wave is a default-limit group (8, or 16 with wideGroups only where the plan uses `group`); cascade and leaf tiers untouched", () => {
    const tiersOff = { tieredDeletes: false };
    const fresh = replaceWtgPlans(5, 1, 0, true, NEW_NO_WIDE, { delete: tiersOff });
    expect(steps(fresh[0].writes)[0]!.limit).toBeUndefined();
    const old = replaceWtgPlans(5, 1, 0, true, OLD, { delete: tiersOff });
    expect(multiset(...fresh)).toEqual(multiset(...old));
  });

  it("UT-GENLAT-058 out of country: no roll-up in either plan; the approval flow stays the only step after job 1 (nothing is handed over)", () => {
    const fresh = replaceWtgPlans(5, 3, 0, false, NEW);
    expect(fresh[0].deferredRollup).toBeUndefined();
    expect(countOf(fresh, isRollup)).toBe(0);
    // Only the units + bridge row merge (no roll-up to move): one step fewer.
    expect(waveCount(...fresh)).toBe(waveCount(...replaceWtgPlans(5, 3, 0, false, OLD)) - 1);
  });
});

/* ───────────────────────────────────────────────────────────── 060-064 Replace PV Module */

function replacePvPlans(
  costCount: number, opexCount: number, perf: R.PlanBulkOptions["perf"],
  o: { bulk?: R.PlanBulkOptions["bulk"]; bridges?: number; existingBridgeId?: string | null; manual?: number } = {},
): [WritePlan, WritePlan] {
  const inputs = replaceInputs(1, costCount, opexCount, o.bridges ?? 1, o.manual ?? 2);
  const opts: R.PlanBulkOptions = { bulk: o.bulk ?? OFF, perf, newId: counter("w") };
  const first = R.planReplacePvType({
    project: P, oldPv: simple({ id: "pv0" }), form: pvForm, deviceCostModules: 100, otherSupplierChosen: false, inputs, lang: "en-US",
  }, opts);
  const follow = R.planReplacePvTypeFollowUp({
    project: P, newPvId: "pv1", newPvName: "PV-0007", existingBridgeId: o.existingBridgeId ?? null, inputs,
    pvRows: [{ capacity: 12, cost: 100 }], inverters: [{ cost: 5 }], substructures: [{ cost: 7 }],
  }, { ...opts, newId: counter("a") });
  return [first, follow];
}

describe("Replace PV Module (replaceLanes)", () => {
  it("UT-GENLAT-060 golden master: the same multiset over L x O x bridge rows x existing bridge x D115 flags (off / all on)", () => {
    let cases = 0;
    for (const L of GRID_L) for (const O of [0, 5]) for (const bridges of [1, 2]) for (const existingBridgeId of [null, "b9"]) {
      for (const bulk of [OFF, BULK_ALL]) {
        const o = { bulk, bridges, existingBridgeId };
        expect(multiset(...replacePvPlans(L, O, NEW, o)), `L=${L} O=${O} br=${bridges}`).toEqual(multiset(...replacePvPlans(L, O, OLD, o)));
        cases += 1;
      }
    }
    expect(cases).toBe(3 * 2 * 2 * 2 * 2);
  });

  it("UT-GENLAT-061 write waves (no bulk flags, 1 bridge row to create, no manual allocations): old = detach + 8 + rows + removals + re-links, new = detach + 5 + removals; the unit and the device-type row create in ONE wave", () => {
    for (const L of GRID_L) for (const O of [0, 5]) {
      const detach = O > 0 ? 1 : 0;
      const old = replacePvPlans(L, O, OLD, { manual: 0 });
      const fresh = replacePvPlans(L, O, NEW, { manual: 0 });
      // old: detach, unit, bridge row, PV type, new PV type | device-type row, unit, [allocation creates], [old allocations], roll-up, [re-links]
      expect(waveCount(...old), `old L=${L} O=${O}`).toBe(detach + 4 + 1 + 1 + (L > 0 ? 2 : 0) + 1 + (O > 0 ? 1 : 0));
      // new: detach, units + bridge row, PV type, new PV type | device-type row + unit, ONE wave [allocation creates, roll-up, re-links], [old allocations]
      expect(waveCount(...fresh), `new L=${L} O=${O}`).toBe(detach + 5 + (L > 0 ? 1 : 0));
      const s = allSteps(...fresh);
      const siblings = steps(fresh[1].writes)[0]!;
      expect(siblings.writes.map((w) => w.entitySet).sort()).toEqual([BRIDGE, TURBINE].sort());
      expect(s[detach]!.writes.every((w) => w.op === "delete")).toBe(true);
    }
  });

  it("UT-GENLAT-062 happens-before: PV delete before PV create; the unit and bridge rows after the PV create; allocations, moves, roll-up, re-links after them; the old allocations LAST", () => {
    const fresh = replacePvPlans(3, 5, NEW);
    const s = allSteps(...fresh);
    const pvDelete = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === PVTYPE && w.op === "delete"));
    const pvCreate = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === PVTYPE && w.op === "create"));
    const unitCreate = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === TURBINE && w.op === "create"));
    const allocCreate = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === ALLOC && w.op === "create"));
    const rollup = indexOfStep(s, (x) => x.writes.some(isRollup));
    const relink = indexOfStep(s, (x) => x.writes.some((w) => w.entitySet === OPEX && w.op === "update" && w.data![R.PLANT_BIND.deviceTypeInProject] !== null));
    expect(pvDelete).toBeLessThan(pvCreate);
    expect(unitCreate).toBeGreaterThan(pvCreate);
    expect(allocCreate).toBeGreaterThan(unitCreate);
    expect(rollup).toBeGreaterThan(unitCreate);
    expect(relink).toBeGreaterThan(unitCreate);
    expect(countOf(fresh, isRollup)).toBe(1);
    const last = s[s.length - 1]!;
    expect(isDelete(last) && last.writes.every((w) => w.entitySet === ALLOC)).toBe(true);
    expect(lastIndexOfStep(s, (x) => x.writes.some((w) => w.op !== "delete"))).toBe(s.length - 2);
  });

  it("UT-GENLAT-063 the re-links bind the device-type row (@created#0) and the allocations the unit (@created#1) created in the step before", () => {
    const fresh = replacePvPlans(3, 5, NEW);
    const job2 = fresh[1].writes;
    const relinks = job2.filter((w) => w.entitySet === OPEX);
    expect(relinks.every((w) => (w.data as Record<string, unknown>)[R.PLANT_BIND.deviceTypeInProject] === "/vsb_devicetypesinprojects(@created#0)")).toBe(true);
    const alloc = job2.filter((w) => w.entitySet === ALLOC && w.op === "create");
    expect(alloc.every((w) => w.data![R.PLANT_BIND.generatorInProject] === "/vsb_generatorinprojects(@created#1)")).toBe(true);
    const existing = replacePvPlans(3, 5, NEW, { existingBridgeId: "b9" });
    expect(existing[1].writes.filter((w) => w.entitySet === ALLOC && w.op === "create")
      .every((w) => w.data![R.PLANT_BIND.generatorInProject] === "/vsb_generatorinprojects(@created#0)")).toBe(true);
  });

  it("UT-GENLAT-064 a refused follow-up (O&M costs and no device-type row, no business unit) stays refused", () => {
    const refused = R.planReplacePvTypeFollowUp({
      project: { ...P, owningBusinessUnitId: null }, newPvId: "pv1", newPvName: "PV-0007", existingBridgeId: null,
      inputs: replaceInputs(1, 1, 2), pvRows: [], inverters: [], substructures: [],
    }, { bulk: OFF, perf: NEW });
    expect(refused.refusedReason).toBe(R.OWNING_BU_MSG.missing);
    expect(refused.writes).toEqual([]);
  });
});

/* ───────────────────────────────────────────────────────────── 070-074 the group limit */

/** A client whose updates stay open one macrotask, counting how many are in flight at once. */
function countingClient() {
  let inFlight = 0;
  let peak = 0;
  const tick = async (): Promise<{ success: true; data: object }> => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
    return { success: true as const, data: {} };
  };
  const client = {
    createRecordAsync: async () => ({ success: true as const, data: { id: "x" } }),
    updateRecordAsync: tick,
    deleteRecordAsync: async () => ({ success: true as const, data: undefined }),
  };
  return { client: client as unknown as PlanClient, peak: () => peak };
}

describe("wideGroups: the in-flight limit of a Generators group", () => {
  it("UT-GENLAT-070 off: the default groups carry no limit (the executor's 8); on: they carry 16; the delete tiers keep 16 / 4", () => {
    const old = R.planToggleStatus(toggleArgs(20), { bulk: OFF, perf: OLD });
    const fresh = R.planToggleStatus(toggleArgs(20), { bulk: OFF, perf: { ...OLD, wideGroups: true } });
    expect(steps(old.writes)[1]!.limit).toBeUndefined();
    expect(steps(fresh.writes)[1]!.limit).toBe(16);
    const replace = replaceWtgPlans(5, 1, 5, true, NEW);
    const limits = replace.flatMap((p) => steps(p.writes)).filter((s) => s.kind === "group").map((s) => [s.ops[0], s.limit]);
    expect(limits).toContainEqual([`delete:${TURBINE}`, LEAF_DELETE_CONCURRENCY]);
    expect(limits).toContainEqual([`update:${OPEX}`, WIDE_GROUP_CONCURRENCY]);
  });

  it("UT-GENLAT-071 a group of 41 updates never exceeds the limit in flight: peak 8 with the switch off, peak 16 on", async () => {
    for (const [perf, expected] of [[OLD, 8], [{ ...OLD, wideGroups: true }, 16]] as const) {
      const { client, peak } = countingClient();
      const plan = R.planToggleStatus(toggleArgs(40), { bulk: OFF, perf });
      await executePlan({ writes: plan.writes.filter((w) => w.entitySet === TURBINE), log: [] }, "test", client);
      expect(peak()).toBe(expected);
    }
  });

  it("UT-GENLAT-072 a group of fewer than the limit uses its size; a group of N never exceeds the limit (N = 1, 5, 15, 16, 17, 41)", async () => {
    for (const count of [1, 5, 15, 16, 17, 41]) {
      const { client, peak } = countingClient();
      const plan = R.planToggleStatus(toggleArgs(count), { bulk: OFF, perf: NEW });
      await executePlan({ writes: plan.writes.filter((w) => w.entitySet === TURBINE), log: [] }, "test", client);
      expect(peak()).toBe(Math.min(count, 16));
    }
  });

  it("UT-GENLAT-073 the worst case in flight: one group at a time, so a save has at most 16 writes in flight (the gate is per group; groups run one after the other)", async () => {
    const { client, peak } = countingClient();
    const plan = R.planSaveTurbine(turbineArgs(41, 3, { applyAll: APPLY_ALL }), { bulk: OFF, perf: NEW });
    // The create goes through the single-step path; every update is in the one wave (41 siblings + type + roll-up = 43 updates).
    await executePlan({ writes: plan.writes.filter((w) => w.op === "update"), log: [] }, "test", client);
    expect(peak()).toBe(16);
  });

  it("UT-GENLAT-074 the other screens' groups are untouched: `together()` without a limit is still the executor's 8", async () => {
    const { client, peak } = countingClient();
    const { together } = await import("@/data/writePlan");
    const writes = together(Array.from({ length: 30 }, (_, i) => ({ op: "update" as const, entitySet: TURBINE, id: `r${i}`, data: {}, reason: "r" })));
    await executePlan({ writes, log: [] }, "test", client);
    expect(peak()).toBe(8);
  });
});
