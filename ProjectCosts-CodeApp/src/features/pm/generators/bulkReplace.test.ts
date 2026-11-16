/**
 * Phase 5 of the Generators bulk programme (work package R2, plan §3 phase 5, §9.4): Replace Generator / Replace PV
 * composed from the other phases (flag `replace`: the repoint, the O&M detach and the re-link as `updateMany`).
 * Decision 3 holds: delete and recreate, no repointing of old allocation rows to new ones. IDs UT-GEN-250..; both halves.
 */
import { describe, expect, it } from "vitest";
import { LEAF_DELETE_CONCURRENCY } from "@/data/concurrency";
import type { PlannedWrite } from "@/data/writePlan";
import * as R from "./rules";
import {
  ALLOC, BRIDGE, OBU, OFF, OPEX, PROJECTS, PVTYPE, TURBINE, TYPE, P, changes, costs, counter, genType, model, n, noBulkInGroup, only,
  reps, simple, steps, turbine, waves, withoutGroupIds,
} from "./bulkPlans.testkit";

const PV = { capacity: "12", moduleLabel: "JA 600", supplier: "m1", degradation1stYear: "", degradationRemainingYears: "", dirty: new Set<string>() };
const DETACH_NULL = { "vsb_DeviceTypeInProject@odata.bind": null };

const inputs = (over: Partial<R.ReplaceInputs> = {}): R.ReplaceInputs => ({
  bridgeIds: ["b1"], opexCostIds: ["o1", "o2", "o3"], unitIds: ["w1", "w2"], allocations: [], landLeaseCosts: [], ...over,
});

const job1 = (count: number, opts?: R.PlanBulkOptions, inp: R.ReplaceInputs = inputs()) =>
  R.planReplaceGeneratorType({
    project: P, oldType: genType({ id: "t1", numberOfGenerators: count }), inCountry: true,
    model: model({ id: "g2", specificCapacity: 6, hubHeight: 150, rotorDiameter: 160 }), costPerWtg: 1000, selectedHeight: 150,
    revisedHubHeight: null, otherTypes: [genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })], otherTurbines: [turbine(7)],
    inputs: inp,
  }, opts);

const units = (count: number) => n(count, (i) => ({ id: `n${i}`, name: `WTG WPN_${i}` }));
const manual = (count: number): R.ReplaceInputs["allocations"] =>
  n(count, (i) => ({ id: `m${i}`, unitIndex: i, allWtgAllocated: false }));
const allWtg = (count: number): R.ReplaceInputs["allocations"] =>
  n(count, (i) => ({ id: `aw${i}`, unitIndex: 1, allWtgAllocated: true }));

const follow = (unitCount: number, costCount: number, manualCount: number, allWtgCount: number, opexCount: number,
  opts?: R.PlanBulkOptions, existingBridgeId: string | null = null) =>
  R.planReplaceGeneratorTypeFollowUp({
    project: P, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId, newUnits: units(unitCount),
    inputs: inputs({
      opexCostIds: n(opexCount, (i) => `o${i}`), landLeaseCosts: costs(costCount), allocations: [...manual(manualCount), ...allWtg(allWtgCount)],
    }),
  }, opts);

const indexOfLast = (ws: readonly PlannedWrite[], pred: (w: PlannedWrite) => boolean): number => ws.map(pred).lastIndexOf(true);
const indexOfFirst = (ws: readonly PlannedWrite[], pred: (w: PlannedWrite) => boolean): number => ws.findIndex(pred);

const REPLACE = only("replace");
const ALL = only("allocations", "status", "applyAll", "turbines", "replace");

describe("phase 5: Replace Generator Type, job 1", () => {
  it("UT-GEN-250 flags off: detach group, unit deletes (leaf), bridge row, type delete, then the Add (today's plan with the 1B tiers)", () => {
    const s = steps(job1(2, { bulk: OFF }).writes);
    expect(s.map((x) => [x.kind, x.limit, x.ops])).toEqual([
      ["group", undefined, reps(`update:${OPEX}`, 3)], ["group", LEAF_DELETE_CONCURRENCY, reps(`delete:${TURBINE}`, 2)],
      ["single", undefined, [`delete:${BRIDGE}`]], ["single", undefined, [`delete:${TYPE}`]],
      ["single", undefined, [`create:${TYPE}`]], ["group", undefined, reps(`create:${TURBINE}`, 2)], ["single", undefined, [`update:${PROJECTS}`]],
    ]);
    expect(withoutGroupIds(job1(2).writes)).toEqual(withoutGroupIds(job1(2, { bulk: OFF }).writes));
  });

  it("UT-GEN-251 flag replace: the O&M detach is ONE updateMany of null-bind rows, a step of its own BEFORE the unit and bridge-row deletes", () => {
    const plan = job1(2, { bulk: REPLACE });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops])).toEqual([
      ["bulk", [`updateMany:${OPEX}`]], ["group", reps(`delete:${TURBINE}`, 2)], ["single", [`delete:${BRIDGE}`]],
      ["single", [`delete:${TYPE}`]], ["single", [`create:${TYPE}`]], ["group", reps(`create:${TURBINE}`, 2)], ["single", [`update:${PROJECTS}`]],
    ]);
    // A `null` bind clears the lookup and is passed through unchanged.
    expect(s[0]!.rows).toEqual([{ id: "o1", data: DETACH_NULL }, { id: "o2", data: DETACH_NULL }, { id: "o3", data: DETACH_NULL }]);
    expect(Object.values(s[0]!.rows![0]!.data)[0]).toBeNull();
    expect(indexOfFirst(plan.writes, (w) => w.op === "updateMany")).toBeLessThan(indexOfFirst(plan.writes, (w) => w.entitySet === BRIDGE));
    expect(noBulkInGroup(plan.writes)).toBe(true);
  });

  it("UT-GEN-252 turbines flag reaches the Add: the type is created single, then ONE createMany; replace on or off", () => {
    for (const opts of [only("turbines"), only("turbines", "replace")]) {
      const plan = job1(3, { bulk: opts, newId: counter("w") });
      const kinds = steps(plan.writes);
      const create = indexOfFirst(plan.writes, (w) => w.op === "create" && w.entitySet === TYPE);
      expect(plan.writes[create + 1]).toMatchObject({ op: "createMany", entitySet: TURBINE });
      expect(plan.writes[create + 1]!.rows!.map((r) => r.id)).toEqual(["w-1", "w-2", "w-3"]);
      expect(kinds[kinds.length - 1]!.ops).toEqual([`update:${PROJECTS}`]);
    }
  });

  it("UT-GEN-253 the request-count model of job 1 (N turbines, O O&M costs, U units): detach O updates become one step; the unit and bridge deletes stay single requests; with turbines the N creates become one step", () => {
    for (const count of [1, 10, 200]) {
      for (const opexCount of [0, 3, 30]) {
        const inp = inputs({ opexCostIds: n(opexCount, (i) => `o${i}`), unitIds: ["w1", "w2", "w3", "w4"] });
        const off = job1(count, { bulk: OFF }, inp);
        const on = job1(count, { bulk: ALL, newId: counter() }, inp);
        // Off: O detach + 4 units + 1 bridge + 1 type delete + 1 type create + N turbines + 1 roll-up.
        expect(off.writes, `off N=${count} O=${opexCount}`).toHaveLength(opexCount + 4 + 1 + 1 + 1 + count + 1);
        // On: (1 if O>0) + 4 + 1 + 1 + 1 + 1 bulk + 1 roll-up.
        expect(on.writes, `on N=${count} O=${opexCount}`).toHaveLength((opexCount > 0 ? 1 : 0) + 4 + 1 + 1 + 1 + 1 + 1);
        expect(changes(on.writes)).toBe(changes(off.writes));
        expect(noBulkInGroup(on.writes)).toBe(true);
      }
    }
  });

  it("UT-GEN-254 the old type's delete comes after the detach in every flag combination", () => {
    for (const opts of [OFF, REPLACE, ALL]) {
      const plan = job1(2, { bulk: opts, newId: counter() });
      const detachEnd = Math.max(
        indexOfLast(plan.writes, (w) => w.entitySet === OPEX), 0,
      );
      expect(detachEnd).toBeLessThan(indexOfFirst(plan.writes, (w) => w.entitySet === BRIDGE));
      expect(detachEnd).toBeLessThan(indexOfFirst(plan.writes, (w) => w.op === "delete" && w.entitySet === TYPE));
    }
  });
});

describe("phase 5: Replace Generator Type, job 2 (the follow-up)", () => {
  it("UT-GEN-255 flags off: the device-type row, ONE run of creates + moves + re-links, then the old allocations' deletes as their own leaf group", () => {
    const plan = follow(2, 2, 3, 2, 2, { bulk: OFF });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.limit, x.ops.length])).toEqual([["single", undefined, 1], ["group", undefined, 4 + 2 + 2], ["group", LEAF_DELETE_CONCURRENCY, 1 + 2]]);
    expect(plan.unmatchedCount).toBe(1);
  });

  it("UT-GEN-256 all flags on: bridge, createMany allocations, updateMany moves, updateMany re-links, then the deletes as a leaf group LAST (after every new row)", () => {
    const plan = follow(2, 2, 3, 2, 2, { bulk: ALL, newId: counter("a") });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops[0]])).toEqual([
      ["single", `create:${BRIDGE}`], ["bulk", `createMany:${ALLOC}`], ["bulk", `updateMany:${ALLOC}`], ["bulk", `updateMany:${OPEX}`], ["group", `delete:${ALLOC}`],
    ]);
    expect(s[1]!.rows).toHaveLength(4);
    expect(s[2]!.rows).toEqual([
      { id: "m1", data: { "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(n1)" } },
      { id: "m2", data: { "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(n2)" } },
    ]);
    expect(s[3]!.rows).toEqual([
      { id: "o1", data: { "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(@created#0)" } },
      { id: "o2", data: { "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(@created#0)" } },
    ]);
    expect(s[4]).toMatchObject({ limit: LEAF_DELETE_CONCURRENCY, ops: reps(`delete:${ALLOC}`, 3) });
    expect(s[4]!.writes.map((w) => w.id)).toEqual(["m3", "aw1", "aw2"]);
    // Every delete comes after the last create / update (decision §9.4).
    expect(indexOfFirst(plan.writes, (w) => w.op === "delete")).toBeGreaterThan(indexOfLast(plan.writes, (w) => w.op !== "delete"));
    expect(plan.unmatchedCount).toBe(1);
    expect(noBulkInGroup(plan.writes)).toBe(true);
  });

  it("UT-GEN-257 an existing device-type row is bound directly in the re-link rows; only replace on: the creates stay a run before the bulk moves", () => {
    const plan = follow(2, 1, 2, 0, 1, { bulk: REPLACE }, "b9");
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops[0]])).toEqual([
      ["group", `create:${ALLOC}`], ["bulk", `updateMany:${ALLOC}`], ["bulk", `updateMany:${OPEX}`],
    ]);
    expect(s[2]!.rows![0]!.data).toEqual({ "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(b9)" });
  });

  it("UT-GEN-258 the request-count model of job 2 (N = 1, 10, 200 units; L = 0, 3, 30 costs; 5 manual, 2 old AllWTG, 3 O&M): same changes, bulk steps replace the runs", () => {
    for (const unitCount of [1, 10, 200]) {
      for (const costCount of [0, 3, 30]) {
        const off = follow(unitCount, costCount, 5, 2, 3, { bulk: OFF });
        const on = follow(unitCount, costCount, 5, 2, 3, { bulk: ALL, newId: counter() });
        const creates = unitCount * costCount;
        const moves = Math.min(5, unitCount);
        const removals = (5 - moves) + 2;
        const label = `N=${unitCount} L=${costCount}`;
        // Off: bridge + creates + moves + 3 re-links + removals single writes.
        expect(off.writes, label).toHaveLength(1 + creates + moves + 3 + removals);
        // On: bridge + (createMany if creates) + updateMany moves + updateMany re-links + the removals (still single deletes).
        expect(on.writes, label).toHaveLength(1 + (creates > 0 ? 1 : 0) + 1 + 1 + removals);
        expect(changes(on.writes), label).toBe(changes(off.writes));
        expect(off.unmatchedCount).toBe(on.unmatchedCount);
        expect(waves(on.writes)).toBeLessThanOrEqual(5);
      }
    }
  });

  it("UT-GEN-259 nothing to move or re-link gives no updateMany step", () => {
    const plan = follow(2, 2, 0, 0, 0, { bulk: ALL, newId: counter() }, "b9");
    expect(steps(plan.writes).map((x) => x.kind)).toEqual(["bulk"]);
    expect(plan.writes[0]).toMatchObject({ op: "createMany", entitySet: ALLOC });
    expect(plan.writes[0]!.rows!.every((r) => r.data[OBU] === "/businessunits(bu-1)")).toBe(true);
  });
});

const pvFollow = (opts?: R.PlanBulkOptions, over: Partial<Parameters<typeof R.planReplacePvTypeFollowUp>[0]> = {}) =>
  R.planReplacePvTypeFollowUp({
    project: P, newPvId: "pvN", newPvName: "JA 600", existingBridgeId: null,
    inputs: inputs({ opexCostIds: ["o1", "o2"], landLeaseCosts: costs(2), allocations: [...manual(2), ...allWtg(2)] }),
    pvRows: [{ capacity: 12, cost: 1 }], inverters: [], substructures: [], ...over,
  }, opts);

describe("phase 5: Replace PV Module Type", () => {
  it("UT-GEN-260 job 1: the detach is one updateMany with the flag, a run without it; units and the old type delete follow, then the PV save body", () => {
    const args = {
      lang: "en-US" as const, project: P, oldPv: simple({ id: "pvA" }), form: PV, deviceCostModules: 300, otherSupplierChosen: false,
      inputs: inputs({ unitIds: ["u1"] }),
    };
    const off = steps(R.planReplacePvType(args, { bulk: OFF }).writes);
    expect(off.map((x) => [x.kind, x.ops[0]])).toEqual([
      ["group", `update:${OPEX}`], ["group", `delete:${TURBINE}`], ["single", `delete:${BRIDGE}`], ["single", `delete:${PVTYPE}`], ["single", `create:${PVTYPE}`],
    ]);
    const on = R.planReplacePvType(args, { bulk: REPLACE });
    const s = steps(on.writes);
    expect(s.map((x) => [x.kind, x.ops[0]])).toEqual([
      ["bulk", `updateMany:${OPEX}`], ["group", `delete:${TURBINE}`], ["single", `delete:${BRIDGE}`], ["single", `delete:${PVTYPE}`], ["single", `create:${PVTYPE}`],
    ]);
    expect(s[0]!.rows).toHaveLength(3);
    expect(s[0]!.rows!.every((r) => Object.values(r.data)[0] === null)).toBe(true);
  });

  it("UT-GEN-261 job 2, all flags on: unit create, createMany allocations, updateMany moves, deletes (leaf), the PV totals, updateMany re-links", () => {
    const plan = pvFollow({ bulk: ALL, newId: counter("a") });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops[0]])).toEqual([
      ["single", `create:${BRIDGE}`], ["single", `create:${TURBINE}`], ["bulk", `createMany:${ALLOC}`], ["bulk", `updateMany:${ALLOC}`],
      ["group", `delete:${ALLOC}`], ["single", `update:${PROJECTS}`], ["bulk", `updateMany:${OPEX}`],
    ]);
    // The device-type row is create 0, the unit create 1: moves and allocations bind the unit, re-links the bridge.
    expect(s[2]!.rows!.every((r) => r.data["vsb_GeneratorInProject@odata.bind"] === "/vsb_generatorinprojects(@created#1)")).toBe(true);
    expect(s[3]!.rows).toEqual([
      { id: "m1", data: { "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(@created#1)" } },
      { id: "m2", data: { "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(@created#1)" } },
    ]);
    expect(s[4]!.limit).toBe(LEAF_DELETE_CONCURRENCY);
    expect(s[6]!.rows!.map((r) => r.data)).toEqual(reps("", 2).map(() => ({ "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(@created#0)" })));
    expect(noBulkInGroup(plan.writes)).toBe(true);
    expect(indexOfFirst(plan.writes, (w) => w.op === "delete")).toBeGreaterThan(indexOfLast(plan.writes, (w) => w.op === "createMany" && w.entitySet === ALLOC));
  });

  it("UT-GEN-262 job 2, flags off: today's plan (a run of creates + moves, the deletes group, the PV totals, the re-link run); the bridge-missing refusal is untouched by the flags", () => {
    const off = pvFollow({ bulk: OFF });
    expect(steps(off.writes).map((x) => [x.kind, x.ops.length])).toEqual([
      ["single", 1], ["single", 1], ["group", 2 + 2], ["group", 2], ["single", 1], ["group", 2],
    ]);
    expect(withoutGroupIds(pvFollow().writes)).toEqual(withoutGroupIds(off.writes));
    // The unreachable PV_BRIDGE_MISSING refusal is untouched by the flags.
    expect(pvFollow({ bulk: ALL }, { existingBridgeId: "b9" }).refusedReason).toBeUndefined();
  });

  it("UT-GEN-263 job 2 with an existing bridge and nothing to allocate or move: only the re-link bulk step and the PV totals", () => {
    const plan = pvFollow({ bulk: ALL, newId: counter() }, {
      existingBridgeId: "b9", inputs: inputs({ opexCostIds: ["o1"], landLeaseCosts: [], allocations: [] }),
    });
    expect(steps(plan.writes).map((x) => [x.kind, x.ops[0]])).toEqual([
      ["single", `create:${TURBINE}`], ["single", `update:${PROJECTS}`], ["bulk", `updateMany:${OPEX}`],
    ]);
    expect(plan.writes[2]!.rows).toEqual([{ id: "o1", data: { "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(b9)" } }]);
  });
});
