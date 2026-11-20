/**
 * Generators delete hardening, rules part (work package X3; plan `GENERATORS-DELETE-HARDENING-PLAN.md`): DEL-1 (the tier
 * flag), DEL-2 (hardened deletes), DEL-4 (allocation `serialKey`), DEL-7(a) (guarded updates). IDs 953 to 980.
 *
 * Every flag test pins both halves: the DEFAULT (today's plan) and the overridden value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY } from "@/data/concurrency";
import { GENERATORS_DELETE } from "@/data/generatorsDeleteFlags";
import { executePlan, PlanError, type PlanClient } from "@/data/executePlan";
import { writeErrorMessage } from "@/data/usePlanWrite";
import { isRecordGone, RECORD_GONE_TEXT } from "@/platform/errors";
import type { PlannedWrite, WritePlan } from "@/data/writePlan";
import * as R from "./rules";
import {
  ALLOC, BRIDGE, COST, OPEX, P, PROJECTS, PVTYPE, TURBINE, TYPE, costs, counter, genType, model, n, only, reps, simple,
  steps, turbine, wtgUnits, withoutGroupIds,
} from "./bulkPlans.testkit";

/*
 * D144 pin: this file tests the D115 / D116 flags and the plan shapes of BEFORE the save-latency work (relaneWrites, replaceLanes,
 * wideGroups), so those three switches are held OFF here. The same builders with the switches ON are covered by saveLatency.test.ts.
 */
beforeEach(() => setGeneratorsPerfFlags({ relaneWrites: false, replaceLanes: false, wideGroups: false }));
afterEach(() => setGeneratorsPerfFlags(null));

/** A turbine delete with `perCost` allocations on shared costs (`cs*`) and `alone` on costs only it uses (`ca*`). */
function turbinePlan(opts?: R.PlanBulkOptions, shared = 4, alone = 2) {
  const type = genType();
  const t = turbine(1);
  const allocations = [...n(shared, (i) => ({ id: `a${i}`, costId: `cs${i}` })), ...n(alone, (i) => ({ id: `b${i}`, costId: `ca${i}` }))];
  const allocationCountByCost = Object.fromEntries(allocations.map((a) => [a.costId, a.costId.startsWith("cs") ? 3 : 1]));
  return R.planDeleteTurbine({
    project: P, type, model: model(), accumulatedIndex: 1, turbine: t, typeTurbines: [t], allTypes: [type], allocations, allocationCountByCost,
  }, opts);
}

function typePlan(opts?: R.PlanBulkOptions) {
  const type = genType();
  return R.planDeleteGeneratorType({
    project: P, type, allTypes: [type, genType({ id: "t2" })],
    allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c1" }, { id: "a3", costId: "c2" }, { id: "a4", costId: "c3" }],
    allocationCountByCost: { c1: 9, c2: 9, c3: 1 }, opexCostIds: ["o1", "o2", "o3"],
  }, opts);
}

const pvArgs = () => {
  const pvA = simple({ id: "a", capacity: 10, cost: 3000 });
  return {
    project: P, pv: pvA, pvRows: [pvA], inverters: [], substructures: [], deviceCostFix: 1, deviceCostTracker: 1,
    allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c1" }, { id: "a3", costId: "c3" }],
    allocationCountByCost: { c1: 5, c3: 1 }, opexCostIds: ["o1", "o2"], unitIds: ["u1", "u2"],
  };
};

const inputs = (over: Partial<R.ReplaceInputs> = {}): R.ReplaceInputs => ({
  bridgeIds: ["b1", "b2"], opexCostIds: ["o1", "o2"], unitIds: ["u1", "u2", "u3"],
  allocations: [
    { id: "m1", unitIndex: 1, allWtgAllocated: false, costId: "k1" },
    { id: "m2", unitIndex: 2, allWtgAllocated: false, costId: "k1" },
    { id: "w1", unitIndex: 1, allWtgAllocated: true, costId: "k2" },
    { id: "w2", unitIndex: 2, allWtgAllocated: true, costId: "k2" },
  ],
  landLeaseCosts: costs(2), ...over,
});

const followUp = (opts?: R.PlanBulkOptions, over: Partial<R.ReplaceInputs> = {}) => R.planReplaceGeneratorTypeFollowUp({
  project: P, newTypeId: "nt", newTypeName: "N", existingBridgeId: "nb",
  newUnits: [{ id: "nu1", name: "U1" }, { id: "nu2", name: "U2" }], inputs: inputs(over),
}, opts);

const replaceJob1 = (opts?: R.PlanBulkOptions) => R.planReplaceGeneratorType({
  project: P, oldType: genType({ id: "old", numberOfGenerators: 2 }), inCountry: true, model: model(), costPerWtg: 100, selectedHeight: 148,
  revisedHubHeight: null, otherTypes: [], otherTurbines: [], inputs: inputs(),
}, { newId: counter(), ...opts });

const rollbackPlan = (opts?: R.PlanBulkOptions) => R.planRollbackCreate({
  project: P, rollupRan: false, remainingTypes: [],
  landed: [
    { entitySet: TYPE, id: "t-new" }, ...n(3, (i) => ({ entitySet: TURBINE, id: `w${i}` })),
    ...n(2, (i) => ({ entitySet: BRIDGE, id: `b${i}` })), ...n(3, (i) => ({ entitySet: ALLOC, id: `a${i}` })),
  ],
}, opts);

const deletes = (writes: readonly PlannedWrite[]) => writes.filter((w) => w.op === "delete");

/* ═════════════════════════════════════════════ DEL-1 the tier flag ═══ */

describe("DEL-1: GENERATORS_DELETE.tieredDeletes", () => {
  it("UT-GEN-953 the flag is ON by default and an explicit ON equals the default plan (turbine delete)", () => {
    expect(GENERATORS_DELETE.tieredDeletes).toBe(true);
    const s = steps(turbinePlan().writes);
    expect(s.slice(0, 2).map((x) => [x.kind, x.limit])).toEqual([["group", LEAF_DELETE_CONCURRENCY], ["group", CASCADE_DELETE_CONCURRENCY]]);
    expect(withoutGroupIds(turbinePlan({ delete: { tieredDeletes: true } }).writes)).toEqual(withoutGroupIds(turbinePlan().writes));
  });

  it("UT-GEN-954 OFF, turbine delete: each delete group is ONE plain together() at the default limit, in the same order; nothing else changes", () => {
    const on = steps(turbinePlan().writes);
    const off = steps(turbinePlan({ delete: { tieredDeletes: false } }).writes);
    expect(off.map((x) => [x.kind, x.ops])).toEqual(on.map((x) => [x.kind, x.ops]));
    expect(off.slice(0, 2).map((x) => x.limit)).toEqual([undefined, undefined]);
    expect(off[0]!.writes[0]!.concurrencyGroup).not.toBe(off[1]!.writes[0]!.concurrencyGroup);
    expect(off.slice(2).map((x) => x.kind)).toEqual(["single", "single", "single"]);
  });

  it("UT-GEN-955 OFF, type delete: the allocation + O&M group and the land-lease cost group lose their limits only", () => {
    const on = steps(typePlan().writes);
    const off = steps(typePlan({ delete: { tieredDeletes: false } }).writes);
    expect(on.slice(0, 2).map((x) => x.limit)).toEqual([LEAF_DELETE_CONCURRENCY, CASCADE_DELETE_CONCURRENCY]);
    expect(off.slice(0, 2).map((x) => x.limit)).toEqual([undefined, undefined]);
    expect(off.map((x) => [x.kind, x.ops])).toEqual(on.map((x) => [x.kind, x.ops]));
  });

  it("UT-GEN-956 OFF, PV delete: leaf, cascade and the several-unit group have no limit; a single unit stays a plain step", () => {
    const on = steps(R.planDeletePvType(pvArgs()).writes);
    const off = steps(R.planDeletePvType(pvArgs(), { delete: { tieredDeletes: false } }).writes);
    expect(on.slice(0, 3).map((x) => x.limit)).toEqual([LEAF_DELETE_CONCURRENCY, CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY]);
    expect(off.slice(0, 3).map((x) => [x.kind, x.limit])).toEqual([["group", undefined], ["group", undefined], ["group", undefined]]);
    const one = steps(R.planDeletePvType({ ...pvArgs(), unitIds: ["u1"] }, { delete: { tieredDeletes: false } }).writes);
    expect(one[2]).toMatchObject({ kind: "single", ops: [`delete:${TURBINE}`] });
  });

  it("UT-GEN-957 OFF, Replace job 1 and the follow-up: unit, bridge-row and allocation-removal groups have no limit; the detach and the type delete are unchanged", () => {
    const on = steps(replaceJob1().writes);
    const off = steps(replaceJob1({ delete: { tieredDeletes: false } }).writes);
    expect(on.filter((x) => x.ops[0] === `delete:${TURBINE}` || x.ops[0] === `delete:${BRIDGE}`).map((x) => x.limit))
      .toEqual([LEAF_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY]);
    expect(off.filter((x) => x.ops[0] === `delete:${TURBINE}` || x.ops[0] === `delete:${BRIDGE}`).map((x) => x.limit)).toEqual([undefined, undefined]);
    expect(off.map((x) => [x.kind, x.ops])).toEqual(on.map((x) => [x.kind, x.ops]));
    const fOn = steps(followUp().writes).find((x) => x.ops.every((o) => o === `delete:${ALLOC}`))!;
    const fOff = steps(followUp({ delete: { tieredDeletes: false } }).writes).find((x) => x.ops.every((o) => o === `delete:${ALLOC}`))!;
    expect([fOn.limit, fOff.limit]).toEqual([LEAF_DELETE_CONCURRENCY, undefined]);
  });

  it("UT-GEN-958 OFF, rollback: allocations, bridge rows, turbines and the types are plain groups (single stays a plain step)", () => {
    const on = steps(rollbackPlan().writes);
    const off = steps(rollbackPlan({ delete: { tieredDeletes: false } }).writes);
    expect(on.map((x) => x.limit)).toEqual([LEAF_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, undefined]);
    expect(off.map((x) => x.limit)).toEqual([undefined, undefined, undefined, undefined]);
    expect(off.map((x) => [x.kind, x.ops])).toEqual(on.map((x) => [x.kind, x.ops]));
  });
});

/* ═════════════════════════════════════════════ DEL-2 hardened deletes ═══ */

describe("DEL-2: hardened deletes with confirm on types, land-lease costs and units only", () => {
  const confirmed = (writes: readonly PlannedWrite[]) => deletes(writes).filter((w) => w.confirm).map((w) => w.entitySet);

  it("UT-GEN-959 turbine delete: every delete is hardened; only the land-lease costs confirm (not allocations, not the turbine)", () => {
    const d = deletes(turbinePlan().writes);
    expect(d).toHaveLength(4 + 2 + 1);
    expect(d.every((w) => w.hardened === true)).toBe(true);
    expect(d.filter((w) => w.entitySet === ALLOC).every((w) => w.confirm === undefined)).toBe(true);
    expect(confirmed(turbinePlan().writes)).toEqual([COST, COST]);
    expect(d.find((w) => w.entitySet === TURBINE)!.confirm).toBeUndefined();
  });

  it("UT-GEN-960 type delete: hardened; the type and the land-lease costs confirm, the allocations and O&M costs do not", () => {
    const w = typePlan().writes;
    expect(deletes(w).every((x) => x.hardened === true)).toBe(true);
    expect(confirmed(w).sort()).toEqual([COST, TYPE].sort());
    expect(deletes(w).filter((x) => x.entitySet === OPEX).every((x) => x.confirm === undefined)).toBe(true);
  });

  it("UT-GEN-961 PV delete: hardened; the PV type, the units and the land-lease costs confirm", () => {
    const w = R.planDeletePvType(pvArgs()).writes;
    expect(deletes(w).every((x) => x.hardened === true)).toBe(true);
    expect(confirmed(w).sort()).toEqual([COST, PVTYPE, TURBINE, TURBINE].sort());
    expect(deletes(w).filter((x) => x.entitySet === ALLOC || x.entitySet === OPEX).every((x) => x.confirm === undefined)).toBe(true);
  });

  it("UT-GEN-962 Replace job 1: units and the old type confirm, the bridge rows do not; every delete hardened", () => {
    const d = deletes(replaceJob1().writes);
    expect(d.every((x) => x.hardened === true)).toBe(true);
    expect(d.filter((x) => x.entitySet === TURBINE && x.reason.startsWith("a unit")).every((x) => x.confirm === true)).toBe(true);
    expect(d.filter((x) => x.entitySet === BRIDGE).every((x) => x.confirm === undefined)).toBe(true);
    expect(d.find((x) => x.entitySet === TYPE)!.confirm).toBe(true);
  });

  it("UT-GEN-963 Replace follow-ups: the allocation removals are hardened, none confirms (generator and PV)", () => {
    const g = deletes(followUp().writes);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.hardened === true && x.confirm === undefined)).toBe(true);
    const pv = deletes(R.planReplacePvTypeFollowUp({
      project: P, newPvId: "npv", newPvName: "PV", existingBridgeId: "nb", inputs: inputs(), pvRows: [], inverters: [], substructures: [],
    }).writes);
    expect(pv).toHaveLength(2);
    expect(pv.every((x) => x.hardened === true && x.confirm === undefined)).toBe(true);
  });

  it("UT-GEN-964 rollback: every undo is hardened; the undone type confirms, allocations, bridges and turbines do not", () => {
    const d = deletes(rollbackPlan().writes);
    expect(d).toHaveLength(9);
    expect(d.every((x) => x.hardened === true)).toBe(true);
    expect(confirmed(rollbackPlan().writes)).toEqual([TYPE]);
  });

  it("UT-GEN-965 inverter, substructure and BESS / hydrogen / substation deletes are hardened and confirm (type rows)", () => {
    const row = simple({ id: "r1", name: "Row" });
    for (const family of ["inverter", "substructure"] as const) {
      const w = R.planDeleteInverterOrSubstructure({ project: P, family, row, pv: [], inverters: [row], substructures: [row] }).writes;
      expect(w[0]).toMatchObject({ op: "delete", hardened: true, confirm: true });
      expect(w[1]!.op).toBe("update");
    }
    for (const family of ["storage", "hydrogen", "substation"] as const) {
      const w = R.planDeleteSimple({ project: P, family, row, rows: [row] }).writes;
      expect(w[0]).toMatchObject({ op: "delete", hardened: true, confirm: true });
      expect(w[1]!.op).toBe("update");
    }
  });

  it("UT-GEN-966 no write other than a delete is hardened, confirmed or keyed (updates and creates stay plain)", () => {
    const plans = [turbinePlan(), typePlan(), R.planDeletePvType(pvArgs()), replaceJob1(), followUp(), rollbackPlan()];
    for (const plan of plans) {
      for (const w of plan.writes.filter((x) => x.op !== "delete")) {
        expect([w.hardened, w.confirm, w.serialKey]).toEqual([undefined, undefined, undefined]);
      }
    }
  });
});

/* ═════════════════════════════════════════════ DEL-4 allocation serialKey ═══ */

describe("DEL-4: parentOrder gives each allocation delete serialKey = its land-lease cost id", () => {
  const keys = (writes: readonly PlannedWrite[]) => deletes(writes).filter((w) => w.entitySet === ALLOC).map((w) => w.serialKey);

  it("UT-GEN-967 flag OFF (the default): no serialKey on any delete of any plan", () => {
    expect(GENERATORS_DELETE.parentOrder).toBe(false);
    const plans = [turbinePlan(), typePlan(), R.planDeletePvType(pvArgs()), replaceJob1(), followUp(), rollbackPlan()];
    for (const plan of plans) expect(deletes(plan.writes).every((w) => w.serialKey === undefined)).toBe(true);
  });

  it("UT-GEN-968 turbine delete, flag ON: each allocation delete carries its cost id; the costs, the turbine and the group boundaries are unchanged", () => {
    const withKey = turbinePlan({ delete: { parentOrder: true } });
    expect(keys(withKey.writes)).toEqual(["cs1", "cs2", "cs3", "cs4"]);
    expect(deletes(withKey.writes).filter((w) => w.entitySet !== ALLOC).every((w) => w.serialKey === undefined)).toBe(true);
    const off = turbinePlan();
    expect(steps(withKey.writes).map((x) => [x.kind, x.ops, x.limit])).toEqual(steps(off.writes).map((x) => [x.kind, x.ops, x.limit]));
  });

  it("UT-GEN-969 type delete, flag ON: allocations carry their cost ids (two on one cost share a key); O&M costs carry none", () => {
    const w = typePlan({ delete: { parentOrder: true } }).writes;
    expect(keys(w)).toEqual(["c1", "c1", "c2"]);
    expect(deletes(w).filter((x) => x.entitySet === OPEX).every((x) => x.serialKey === undefined)).toBe(true);
    expect(steps(w).map((x) => x.ops)).toEqual(steps(typePlan().writes).map((x) => x.ops));
  });

  it("UT-GEN-970 PV delete, flag ON: allocations keyed by cost; O&M costs and units carry none", () => {
    const w = R.planDeletePvType(pvArgs(), { delete: { parentOrder: true } }).writes;
    expect(keys(w)).toEqual(["c1", "c1"]);
    expect(deletes(w).filter((x) => x.entitySet !== ALLOC).every((x) => x.serialKey === undefined)).toBe(true);
  });

  it("UT-GEN-971 Replace follow-up, flag ON: removals are keyed when the inputs carry the cost id, unkeyed when they do not; the rollback is never keyed", () => {
    expect(keys(followUp({ delete: { parentOrder: true } }).writes)).toEqual(["k2", "k2"]);
    const noCost = inputs().allocations.map(({ costId: _c, ...rest }) => rest);
    expect(keys(followUp({ delete: { parentOrder: true } }, { allocations: noCost }).writes)).toEqual([undefined, undefined]);
    const pv = R.planReplacePvTypeFollowUp({
      project: P, newPvId: "npv", newPvName: "PV", existingBridgeId: "nb", inputs: inputs(), pvRows: [], inverters: [], substructures: [],
    }, { delete: { parentOrder: true } });
    expect(keys(pv.writes)).toEqual(["k2", "k2"]);
    expect(keys(rollbackPlan({ delete: { parentOrder: true } }).writes)).toEqual([undefined, undefined, undefined]);
  });

  it("UT-GEN-972 toReplaceAllocations keeps its shape unless keepCostIds is passed", () => {
    const args = {
      allocations: [{ id: "a1", costId: "c1", turbineId: "w2" }], units: [turbine(2, { id: "w2" })], allWtgCostIds: new Set<string>(),
    };
    expect(R.toReplaceAllocations(args)).toEqual([{ id: "a1", unitIndex: 2, allWtgAllocated: false }]);
    expect(R.toReplaceAllocations({ ...args, keepCostIds: true })).toEqual([{ id: "a1", unitIndex: 2, allWtgAllocated: false, costId: "c1" }]);
  });

  it("UT-GEN-973 the key runs two deletes on one cost one after another through the engine, different costs together", async () => {
    // Through the real engine: a slow stub records the overlap of the allocation deletes.
    const plan = R.planDeleteGeneratorType({
      project: P, type: genType(), allTypes: [genType()],
      allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c1" }, { id: "a3", costId: "c2" }],
      allocationCountByCost: { c1: 9, c2: 9 }, opexCostIds: [],
    }, { delete: { parentOrder: true } });
    const active = new Map<string, number>();
    let overlap = 0;
    const costOf: Record<string, string> = { a1: "c1", a2: "c1", a3: "c2" };
    const ok = { success: true as const, data: undefined };
    const client = {
      retrieveMultipleRecordsAsync: vi.fn(async () => ({ success: true as const, data: [] })),
      createRecordAsync: vi.fn(async () => ok),
      updateRecordAsync: vi.fn(async () => ({ success: true as const, data: {} })),
      deleteRecordAsync: vi.fn(async (table: string, id: string) => {
        const cost = costOf[id];
        if (table === ALLOC && cost) {
          active.set(cost, (active.get(cost) ?? 0) + 1);
          overlap = Math.max(overlap, active.get(cost)!);
          await new Promise((r) => setTimeout(r, 5));
          active.set(cost, active.get(cost)! - 1);
        }
        return ok;
      }),
    } as unknown as PlanClient;
    await executePlan(plan, "test", client).catch(() => undefined);
    expect(overlap).toBe(1);
  });
});

/* ═════════════════════════════════════════════ DEL-7(a) guarded updates ═══ */

describe("DEL-7(a): guardedUpdates marks exactly the listed updates", () => {
  const guardedOf = (writes: readonly PlannedWrite[]) => writes.filter((w) => w.guarded === true).map((w) => `${w.op}:${w.entitySet}:${w.reason}`);
  const saveTurbine = (opts?: R.PlanBulkOptions): WritePlan => {
    const type = genType({ id: "t1" });
    const all = wtgUnits(3);
    return R.planSaveTurbine({
      lang: "en-US", project: P, type, model: model({ rotorDiameter: 150 }), accumulatedIndex: 1, turbine: all[0]!,
      typeTurbines: all, allTypes: [type],
      form: { nameIndex: "1", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["effectiveCapacity"]) },
      applyAll: { capacity: true, hubHeight: true, plinth: false }, totalHeight: 226, landLeaseCosts: [],
    }, opts);
  };

  it("UT-GEN-974 flag OFF (the default): no write of any plan is guarded, and an explicit OFF equals the default", () => {
    expect(GENERATORS_DELETE.guardedUpdates).toBe(false);
    for (const plan of [turbinePlan(), saveTurbine(), followUp(), replaceJob1()]) expect(guardedOf(plan.writes)).toEqual([]);
    expect(withoutGroupIds(turbinePlan({ delete: { guardedUpdates: false } }).writes)).toEqual(withoutGroupIds(turbinePlan().writes));
  });

  it("UT-GEN-975 turbine delete, flag ON: only the type totals update is guarded (not the turbine delete, not the roll-up)", () => {
    expect(guardedOf(turbinePlan({ delete: { guardedUpdates: true } }).writes)).toEqual([`update:${TYPE}:the generator type's totals`]);
    const roll = turbinePlan({ delete: { guardedUpdates: true } }).writes.find((w) => w.entitySet === PROJECTS)!;
    expect(roll.guarded).toBeUndefined();
  });

  it("UT-GEN-976 save turbine, flag ON: the type totals and every non-bulk apply-to-all sibling update are guarded; the turbine itself and the roll-up are not", () => {
    const g = guardedOf(saveTurbine({ delete: { guardedUpdates: true } }).writes);
    expect(g.filter((x) => x.includes("apply to all"))).toHaveLength(2);
    expect(g).toContain(`update:${TYPE}:the generator type's totals`);
    expect(g).toHaveLength(3);
    const w = saveTurbine({ delete: { guardedUpdates: true } }).writes;
    expect(w[0]!.guarded).toBeUndefined();
    expect(w.find((x) => x.entitySet === PROJECTS)!.guarded).toBeUndefined();
  });

  it("UT-GEN-977 save turbine, flag ON with bulk applyAll: the siblings stay one updateMany (guarded by the backend, no guarded flag); the type update is guarded", () => {
    const w = saveTurbine({ delete: { guardedUpdates: true }, bulk: only("applyAll") }).writes;
    expect(w.some((x) => x.op === "updateMany" && x.guarded === undefined)).toBe(true);
    expect(guardedOf(w)).toEqual([`update:${TYPE}:the generator type's totals`]);
  });

  it("UT-GEN-978 status toggle, flag ON: only the type update is guarded, with and without the bulk status path", () => {
    const type = genType();
    const args = { project: P, type, turbines: wtgUnits(3), allTypes: [type] };
    for (const bulk of [only(), only("status")]) {
      expect(guardedOf(R.planToggleStatus(args, { bulk, delete: { guardedUpdates: true } }).writes)).toEqual([`update:${TYPE}:the generator type's status`]);
      expect(guardedOf(R.planToggleStatus(args, { bulk }).writes)).toEqual([]);
    }
  });

  it("UT-GEN-979 Replace follow-ups, flag ON: the O&M re-links are guarded (generator and PV); moves, creates and the detach are not; the bulk re-link is untouched", () => {
    const g = guardedOf(followUp({ delete: { guardedUpdates: true } }).writes);
    expect(g).toEqual(reps("update:" + OPEX + ":re-link an O&M cost to the new type", 2));
    const pv = guardedOf(R.planReplacePvTypeFollowUp({
      project: P, newPvId: "npv", newPvName: "PV", existingBridgeId: "nb", inputs: inputs(), pvRows: [], inverters: [], substructures: [],
    }, { delete: { guardedUpdates: true } }).writes);
    expect(pv).toEqual(reps("update:" + OPEX + ":re-link an O&M cost to the new PV type", 2));
    expect(guardedOf(replaceJob1({ delete: { guardedUpdates: true } }).writes)).toEqual([]);
    const bulk = followUp({ delete: { guardedUpdates: true }, bulk: only("replace") }).writes;
    expect(guardedOf(bulk)).toEqual([]);
    expect(bulk.some((x) => x.op === "updateMany" && x.entitySet === OPEX)).toBe(true);
  });

  it("UT-GEN-980 a guarded type update on a row another user deleted: nothing is sent for it and the failure reads as RECORD_GONE (PlanError.gone, the shared text)", async () => {
    const TYPE_ID = "30000000-0000-0000-0000-000000000001";
    const TURBINE_ID = "30000000-0000-0000-0000-000000000002";
    const type = genType({ id: TYPE_ID });
    const t = turbine(1, { id: TURBINE_ID });
    const plan = R.planDeleteTurbine({
      project: P, type, model: model(), accumulatedIndex: 1, turbine: t, typeTurbines: [t], allTypes: [type], allocations: [], allocationCountByCost: {},
    }, { delete: { guardedUpdates: true } });
    const calls: string[] = [];
    const ok = { success: true as const, data: undefined };
    const client = {
      retrieveMultipleRecordsAsync: vi.fn(async () => ({ success: true as const, data: [] })),
      createRecordAsync: vi.fn(async () => ok),
      updateRecordAsync: vi.fn(async (table: string) => { calls.push(`update ${table}`); return { success: true as const, data: {} }; }),
      deleteRecordAsync: vi.fn(async (table: string) => { calls.push(`delete ${table}`); return ok; }),
    } as unknown as PlanClient;
    const err = (await executePlan(plan, "delete turbine", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.gone).toBe(true);
    expect(isRecordGone(err)).toBe(true);
    expect(writeErrorMessage(err, "delete")).toBe(RECORD_GONE_TEXT);
    // The turbine delete went out; the type PATCH and the roll-up did not.
    expect(calls).toEqual([`delete ${TURBINE}`]);
  });
});
