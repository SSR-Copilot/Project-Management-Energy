/**
 * Phase 2 of the Generators bulk programme (work package R2, plan §3 phase 2): the land-lease allocation creates of
 * every plan that uses `allocationCreates` become ONE `createMany` when `GENERATORS_BULK.allocations` is on. IDs
 * UT-GEN-210..; every test pins both halves (flag off = today's plan, flag on = the bulk plan).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { GENERATORS_BULK } from "@/data/generatorsBulkFlags";
import * as R from "./rules";
import {
  ALLOC, BRIDGE, OBU, OPEX, OFF, PROJECTS, TURBINE, P, changes, costs, counter, genType, model, n, noBulkInGroup,
  only, reps, steps, turbine, waves, withoutGroupIds,
} from "./bulkPlans.testkit";

/*
 * D144 pin: this file tests the D115 / D116 flags and the plan shapes of BEFORE the save-latency work (relaneWrites, replaceLanes,
 * wideGroups), so those three switches are held OFF here. The same builders with the switches ON are covered by saveLatency.test.ts.
 */
beforeEach(() => setGeneratorsPerfFlags({ relaneWrites: false, replaceLanes: false, wideGroups: false }));
afterEach(() => setGeneratorsPerfFlags(null));

const ON = only("allocations");
const units = (count: number) => n(count, (i) => ({ id: `w${i}`, name: `WTG WPN_${i}` }));

const followUp = (count: number, costCount: number, opts?: R.PlanBulkOptions, hasDeviceType = false) =>
  R.planGeneratorTypeFollowUp({
    project: P, typeId: "t9", typeName: "WTG-0009", hasDeviceType, turbines: units(count), landLeaseCosts: costs(costCount),
  }, opts);

describe("phase 2: bulk allocation creates (flag GENERATORS_BULK.allocations)", () => {
  it("UT-GEN-210 every flag is off by default, and with no options a plan is the flags-off plan", () => {
    expect(Object.values(GENERATORS_BULK).every((v) => v === false)).toBe(true);
    const plain = followUp(3, 2);
    const off = followUp(3, 2, { bulk: OFF });
    expect(withoutGroupIds(plain.writes)).toEqual(withoutGroupIds(off.writes));
    expect(steps(plain.writes).map((s) => s.kind)).toEqual(["group"]);
    expect(steps(plain.writes)[0]!.limit).toBeUndefined();
  });

  it("UT-GEN-211 Add type follow-up, flag off: the device-type row and the N x L single creates are ONE parallel run (today's plan)", () => {
    const plan = followUp(2, 3, { bulk: OFF });
    const s = steps(plan.writes);
    expect(s).toHaveLength(1);
    expect(s[0]!.ops).toEqual([`create:${BRIDGE}`, ...reps(`create:${ALLOC}`, 6)]);
    expect(plan.writes[1]!.data).toEqual({
      vsb_name: "M-D1-WTG WPN_1", "vsb_ProjectCost@odata.bind": "/vsb_landleaseprojectcosts(c1)",
      "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(w1)", [OBU]: "/businessunits(bu-1)",
    });
  });

  it("UT-GEN-212 Add type follow-up, flag on: the device-type row, then ONE createMany of the N x L rows with injected ids, the OBU bind and today's data", () => {
    const newId = counter("a");
    const plan = followUp(2, 3, { bulk: ON, newId });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops])).toEqual([
      ["single", [`create:${BRIDGE}`]], ["bulk", [`createMany:${ALLOC}`]],
    ]);
    const rows = s[1]!.rows!;
    expect(rows.map((r) => r.id)).toEqual(["a-1", "a-2", "a-3", "a-4", "a-5", "a-6"]);
    // The same rows, in the same (cost-major) order, as today's single creates.
    const today = followUp(2, 3, { bulk: OFF }).writes.filter((w) => w.entitySet === ALLOC).map((w) => w.data);
    expect(rows.map((r) => r.data)).toEqual(today);
    expect(rows.every((r) => r.data[OBU] === "/businessunits(bu-1)")).toBe(true);
    expect(rows.every((r) => !("id" in r.data) && !("vsb_landleaseallocationwtgid" in r.data))).toBe(true);
    expect(noBulkInGroup(plan.writes)).toBe(true);
    expect(s[1]!.writes[0]).toMatchObject({ op: "createMany", entitySet: ALLOC });
    expect(s[1]!.writes[0]!.concurrent).toBeFalsy();
  });

  it("UT-GEN-213 the request-count model: N turbines x L costs is N*L creates today and ONE bulk step of N*L rows with the flag (N = 1, 10, 200; L = 0, 3, 30)", () => {
    for (const count of [1, 10, 200]) {
      for (const costCount of [0, 3, 30]) {
        const off = followUp(count, costCount, { bulk: OFF }, true);
        const on = followUp(count, costCount, { bulk: ON, newId: counter() }, true);
        const rows = count * costCount;
        expect(changes(off.writes), `off N=${count} L=${costCount}`).toBe(rows);
        expect(changes(on.writes), `on N=${count} L=${costCount}`).toBe(rows);
        // Today: one parallel run (when there is anything to create); with the flag: one bulk step.
        expect(waves(off.writes)).toBe(rows > 0 ? 1 : 0);
        expect(waves(on.writes)).toBe(rows > 0 ? 1 : 0);
        expect(off.writes).toHaveLength(rows);
        expect(on.writes).toHaveLength(rows > 0 ? 1 : 0);
        if (rows > 0) expect(on.writes[0]).toMatchObject({ op: "createMany", entitySet: ALLOC });
        // No two rows share an id.
        const ids = on.writes.flatMap((w) => (w.rows ?? []).map((r) => r.id));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("UT-GEN-214 with no injected newId the default id source makes distinct GUIDs", () => {
    const plan = followUp(3, 2, { bulk: ON }, true);
    const ids = plan.writes[0]!.rows!.map((r) => r.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))).toBe(true);
  });

  it("UT-GEN-215 a cost that is not AllWTG gets no row; a project without a business unit is refused, nothing sent (F6, D121 §5: it used to send rows without the OBU key)", () => {
    const args = {
      typeId: "t9", typeName: "x", hasDeviceType: true, turbines: units(1),
      landLeaseCosts: [{ id: "c1", landOwner: "M", description: "A", allWtgAllocated: false }, ...costs(1).map((c) => ({ ...c, id: "c2" }))],
    };
    const plan = R.planGeneratorTypeFollowUp({ ...args, project: P }, { bulk: ON, newId: counter() });
    expect(plan.writes).toHaveLength(1);
    const rows = plan.writes[0]!.rows!;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data["vsb_ProjectCost@odata.bind"]).toBe("/vsb_landleaseprojectcosts(c2)");
    const refused = R.planGeneratorTypeFollowUp({ ...args, project: { ...P, owningBusinessUnitId: null } }, { bulk: ON, newId: counter() });
    expect(refused.refusedReason).toBe(R.OWNING_BU_MSG.missing);
    expect(refused.writes).toEqual([]);
  });

  it("UT-GEN-216 new turbine: the allocations bind the row step 1 created (@created#0); flag off is a parallel run after the roll-up, flag on one createMany there, roll-up not last (canvas order kept)", () => {
    const type = genType();
    const args = {
      lang: "en-US" as const, project: P, type, model: model({ rotorDiameter: 150 }), accumulatedIndex: 1, turbine: null,
      typeTurbines: [turbine(1), turbine(2)], allTypes: [type],
      form: { nameIndex: "3", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["nameIndex"]) },
      applyAll: { capacity: false, hubHeight: false, plinth: false }, totalHeight: 226, landLeaseCosts: costs(3),
    };
    const off = R.planSaveTurbine(args, { bulk: OFF });
    const on = R.planSaveTurbine(args, { bulk: ON, newId: counter("a") });
    const so = steps(off.writes);
    const sn = steps(on.writes);
    expect(so.map((x) => x.kind)).toEqual(["single", "single", "single", "group"]);
    expect(so[3]!.ops).toEqual(reps(`create:${ALLOC}`, 3));
    expect(sn.map((x) => x.kind)).toEqual(["single", "single", "single", "bulk"]);
    expect(sn.slice(0, 3).map((x) => x.ops[0])).toEqual([`create:${TURBINE}`, "update:vsb_generatortypeinprojects", `update:${PROJECTS}`]);
    expect(sn[3]!.rows!.map((r) => r.id)).toEqual(["a-1", "a-2", "a-3"]);
    expect(sn[3]!.rows!.every((r) => r.data["vsb_GeneratorInProject@odata.bind"] === "/vsb_generatorinprojects(@created#0)")).toBe(true);
    expect(sn[3]!.rows!.every((r) => r.data[OBU] === "/businessunits(bu-1)")).toBe(true);
    expect(sn[3]!.rows!.map((r) => r.data.vsb_name)).toEqual(["M-D1-WTG WPN_3", "M-D2-WTG WPN_3", "M-D3-WTG WPN_3"]);
    expect(noBulkInGroup(on.writes)).toBe(true);
    // An EDIT never allocates, with or without the flag; no costs means no step.
    expect(R.planSaveTurbine({ ...args, turbine: turbine(1) }, { bulk: ON }).writes.some((w) => w.entitySet === ALLOC)).toBe(false);
    expect(R.planSaveTurbine({ ...args, landLeaseCosts: [] }, { bulk: ON }).writes.some((w) => w.op === "createMany")).toBe(false);
  });

  it("UT-GEN-217 new PV type: the unit's allocations (G7) bind the created unit or the existing one; flag off a run, flag on a createMany before the roll-up", () => {
    const base = {
      project: P, pvId: "pv1", pvName: "JA 600", unitId: null as string | null, hasDeviceType: true,
      pvRows: [{ capacity: 12, cost: 1 }], inverters: [], substructures: [], isNew: true, landLeaseCosts: costs(2),
    };
    const off = R.planPvFollowUp(base, { bulk: OFF });
    const on = R.planPvFollowUp(base, { bulk: ON, newId: counter("a") });
    expect(steps(off.writes).map((x) => [x.kind, x.ops.length])).toEqual([["single", 1], ["group", 2], ["single", 1]]);
    const s = steps(on.writes);
    expect(s.map((x) => x.kind)).toEqual(["single", "bulk", "single"]);
    expect(s[1]!.ops).toEqual([`createMany:${ALLOC}`]);
    expect(s[1]!.rows!.map((r) => r.data["vsb_GeneratorInProject@odata.bind"])).toEqual(reps("/vsb_generatorinprojects(@created#0)", 2).map((x) => x));
    expect(s[2]!.ops).toEqual([`update:${PROJECTS}`]);
    // An existing unit id is bound directly; an edited type (isNew false) allocates nothing.
    const withUnit = R.planPvFollowUp({ ...base, unitId: "u7" }, { bulk: ON, newId: counter() });
    expect(steps(withUnit.writes)[1]!.rows!.every((r) => r.data["vsb_GeneratorInProject@odata.bind"] === "/vsb_generatorinprojects(u7)")).toBe(true);
    expect(R.planPvFollowUp({ ...base, isNew: false }, { bulk: ON }).writes.some((w) => w.op === "createMany")).toBe(false);
  });

  it("UT-GEN-218 Replace WTG follow-up: flag on makes the allocations one createMany before the moves and re-links; the old allocations' deletes stay their own leaf group after both", () => {
    const args = {
      project: P, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId: null as string | null,
      newUnits: units(2),
      inputs: {
        bridgeIds: [], opexCostIds: ["o1"], unitIds: [], landLeaseCosts: costs(2),
        allocations: [
          { id: "m1", unitIndex: 1, allWtgAllocated: false }, { id: "m2", unitIndex: 2, allWtgAllocated: false },
          { id: "m3", unitIndex: 3, allWtgAllocated: false }, { id: "aw", unitIndex: 1, allWtgAllocated: true },
        ],
      },
    };
    const off = R.planReplaceGeneratorTypeFollowUp(args, { bulk: OFF });
    expect(steps(off.writes).map((x) => [x.kind, x.ops.length])).toEqual([["single", 1], ["group", 7], ["group", 2]]);
    const on = R.planReplaceGeneratorTypeFollowUp(args, { bulk: ON, newId: counter("a") });
    const s = steps(on.writes);
    expect(s.map((x) => x.kind)).toEqual(["single", "bulk", "group", "group"]);
    expect(s[1]!.rows).toHaveLength(4);
    expect(s[2]!.ops).toEqual([`update:${ALLOC}`, `update:${ALLOC}`, `update:${OPEX}`]);
    expect(s[3]!.ops).toEqual(reps(`delete:${ALLOC}`, 2));
    expect(s[3]!.limit).toBe(16);
    // The bridge create is index 0, the re-link keeps pointing at it.
    expect(s[2]!.writes[2]!.data).toEqual({ "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(@created#0)" });
    expect(on.unmatchedCount).toBe(off.unmatchedCount);
    expect(noBulkInGroup(on.writes)).toBe(true);
  });

  it("UT-GEN-219 Replace PV follow-up: flag on one createMany for the unit's allocations before the moves; creates, moves, deletes, PV totals, re-links keep their order", () => {
    const args = {
      project: P, newPvId: "pvN", newPvName: "JA 600", existingBridgeId: "b9",
      inputs: {
        bridgeIds: [], opexCostIds: ["o1"], unitIds: [], landLeaseCosts: costs(2),
        allocations: [{ id: "m1", unitIndex: 1, allWtgAllocated: false }, { id: "aw1", unitIndex: 1, allWtgAllocated: true }],
      },
      pvRows: [{ capacity: 12, cost: 1 }], inverters: [], substructures: [],
    };
    const on = R.planReplacePvTypeFollowUp(args, { bulk: ON, newId: counter("a") });
    const s = steps(on.writes);
    expect(s.map((x) => [x.kind, x.ops[0]])).toEqual([
      ["single", `create:${TURBINE}`], ["bulk", `createMany:${ALLOC}`], ["group", `update:${ALLOC}`], ["group", `delete:${ALLOC}`],
      ["single", `update:${PROJECTS}`], ["group", `update:${OPEX}`],
    ]);
    expect(s[1]!.rows!.map((r) => r.data["vsb_GeneratorInProject@odata.bind"])).toEqual(reps("/vsb_generatorinprojects(@created#0)", 2));
    const off = R.planReplacePvTypeFollowUp(args, { bulk: OFF });
    expect(steps(off.writes).map((x) => x.kind)).toEqual(["single", "group", "group", "single", "group"]);
    expect(steps(off.writes)[1]!.ops).toEqual([...reps(`create:${ALLOC}`, 2), `update:${ALLOC}`]);
  });

  it("UT-GEN-220 the options are per call: another flag on does not switch the allocation path, and an explicit false beats nothing", () => {
    const plan = followUp(2, 2, { bulk: only("status", "applyAll", "turbines", "replace"), newId: counter() }, true);
    expect(steps(plan.writes).map((x) => x.kind)).toEqual(["group"]);
  });
});
