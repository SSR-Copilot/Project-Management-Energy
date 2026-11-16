/**
 * Phase 3 of the Generators bulk programme (work package R2, plan §3 phase 3, §9.5): the status toggle (flag `status`)
 * and the apply-to-all siblings (flag `applyAll`) as ONE `updateMany` each. IDs UT-GEN-230..; both halves pinned.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { GEN_INSTANCE_COL } from "./rules";
import * as R from "./rules";
import {
  ALLOC, OBU, OFF, PROJECTS, TURBINE, TYPE, P, changes, costs, counter, genType, model, noBulkInGroup, only, reps, steps, turbine,
  waves, wtgUnits,
} from "./bulkPlans.testkit";

const STATUS = only("status");
const APPLY = only("applyAll");

const toggle = (count: number, opts?: R.PlanBulkOptions, status: number = CHOICE_PLANT.status.active) => {
  const type = genType({ id: "t1", status, generatorsCapacity: 22.4, generatorsCost: 9 });
  return R.planToggleStatus({ project: P, type, turbines: wtgUnits(count), allTypes: [type] }, opts);
};

describe("phase 3: bulk status toggle (flag GENERATORS_BULK.status)", () => {
  it("UT-GEN-230 flag off: the type update, ONE parallel run of the turbines' updates (default limit), the roll-up last (today's plan)", () => {
    const s = steps(toggle(3, { bulk: OFF }).writes);
    expect(s.map((x) => [x.kind, x.limit, x.ops.length])).toEqual([["single", undefined, 1], ["group", undefined, 3], ["single", undefined, 1]]);
    expect(s[1]!.ops).toEqual(reps(`update:${TURBINE}`, 3));
  });

  it("UT-GEN-231 flag on: the type update, ONE updateMany of {statecode} rows (ids in turbine order), the roll-up last, nothing inside a group", () => {
    const plan = toggle(3, { bulk: STATUS });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops])).toEqual([
      ["single", [`update:vsb_generatortypeinprojects`]], ["bulk", [`updateMany:${TURBINE}`]], ["single", [`update:${PROJECTS}`]],
    ]);
    expect(s[1]!.rows).toEqual([
      { id: "w1", data: { statecode: CHOICE_PLANT.status.inactive } }, { id: "w2", data: { statecode: CHOICE_PLANT.status.inactive } },
      { id: "w3", data: { statecode: CHOICE_PLANT.status.inactive } },
    ]);
    expect(plan.writes[0]).toMatchObject({ op: "update", id: "t1", data: { statecode: CHOICE_PLANT.status.inactive } });
    expect(plan.writes[plan.writes.length - 1]!.entitySet).toBe(PROJECTS);
    expect(noBulkInGroup(plan.writes)).toBe(true);
    // Payloads are today's: the same statecode on the same ids.
    const today = toggle(3, { bulk: OFF }).writes.filter((w) => w.entitySet === TURBINE);
    expect(s[1]!.rows!.map((r) => ({ id: r.id, data: r.data }))).toEqual(today.map((w) => ({ id: w.id, data: w.data })));
  });

  it("UT-GEN-232 the request-count model (N = 0, 1, 10, 200 turbines): N+2 changes either way; 3 waves today and with the flag, the middle one a bulk step", () => {
    for (const count of [0, 1, 10, 200]) {
      const off = toggle(count, { bulk: OFF });
      const on = toggle(count, { bulk: STATUS });
      expect(changes(off.writes), `off N=${count}`).toBe(count + 2);
      expect(changes(on.writes), `on N=${count}`).toBe(count + 2);
      expect(off.writes).toHaveLength(count + 2);
      expect(on.writes).toHaveLength(count > 0 ? 3 : 2);
      expect(waves(off.writes)).toBe(count > 0 ? 3 : 2);
      expect(waves(on.writes)).toBe(count > 0 ? 3 : 2);
    }
  });

  it("UT-GEN-233 activate sends the Active state and still rolls the type up; a repeated turbine id is sent once", () => {
    const inactive = toggle(2, { bulk: STATUS }, CHOICE_PLANT.status.inactive);
    expect(steps(inactive.writes)[1]!.rows!.every((r) => r.data.statecode === CHOICE_PLANT.status.active)).toBe(true);
    expect(inactive.writes[inactive.writes.length - 1]!.data).toEqual({ vsb_plantwtgcapacity: 22.4, vsb_plantwtgcost: 9 });
    const type = genType();
    const dup = R.planToggleStatus({ project: P, type, turbines: [turbine(1), turbine(1), turbine(2)], allTypes: [type] }, { bulk: STATUS });
    expect(steps(dup.writes)[1]!.rows!.map((r) => r.id)).toEqual(["w1", "w2"]);
  });

  it("UT-GEN-234 the flags are independent: applyAll on does not bulk the toggle, and no options at all is today's plan", () => {
    expect(steps(toggle(3, { bulk: APPLY }).writes).map((x) => x.kind)).toEqual(["single", "group", "single"]);
    expect(steps(toggle(3).writes).map((x) => x.kind)).toEqual(["single", "group", "single"]);
  });
});

const editArgs = (siblings: number, over: Partial<Parameters<typeof R.planSaveTurbine>[0]> = {}): Parameters<typeof R.planSaveTurbine>[0] => {
  const type = genType({ id: "t1" });
  // The edited turbine is w1; its siblings are w2..w(siblings+1), alternating plinths so the totals differ.
  const all = Array.from({ length: siblings + 1 }, (_, i) => turbine(i + 1, { foundationPlinth: i % 2, hubHeightExclPlinth: 148 }));
  return {
    lang: "en-US", project: P, type, model: model({ rotorDiameter: 150 }), accumulatedIndex: 1, turbine: all[0]!,
    typeTurbines: all, allTypes: [type],
    form: { nameIndex: "1", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["effectiveCapacity"]) },
    applyAll: { capacity: true, hubHeight: true, plinth: false }, totalHeight: 226, landLeaseCosts: [], ...over,
  };
};

describe("phase 3: bulk apply-to-all (flag GENERATORS_BULK.applyAll)", () => {
  it("UT-GEN-235 flag off: the turbine, ONE parallel run of the sibling updates, the type totals, the roll-up (today's plan)", () => {
    const s = steps(R.planSaveTurbine(editArgs(3), { bulk: OFF }).writes);
    expect(s.map((x) => [x.kind, x.ops.length])).toEqual([["single", 1], ["group", 3], ["single", 1], ["single", 1]]);
    expect(s[1]!.ops).toEqual(reps(`update:${TURBINE}`, 3));
  });

  it("UT-GEN-236 flag on: ONE updateMany of the siblings with today's per-row payloads (own total height, OBU bind); the turbine first, the type totals and roll-up after", () => {
    const off = R.planSaveTurbine(editArgs(3), { bulk: OFF });
    const on = R.planSaveTurbine(editArgs(3), { bulk: APPLY });
    const s = steps(on.writes);
    expect(s.map((x) => [x.kind, x.ops])).toEqual([
      ["single", [`update:${TURBINE}`]], ["bulk", [`updateMany:${TURBINE}`]],
      ["single", [`update:${TYPE}`]], ["single", [`update:${PROJECTS}`]],
    ]);
    const today = off.writes.filter((w) => w.entitySet === TURBINE).slice(1);
    expect(s[1]!.rows!.map((r) => ({ id: r.id, data: r.data }))).toEqual(today.map((w) => ({ id: w.id, data: w.data })));
    expect(s[1]!.rows!.map((r) => r.id)).toEqual(["w2", "w3", "w4"]);
    // Each sibling keeps ITS OWN plinth in its total: 150 + 1 + 75 (w2), 150 + 0 + 75 (w3), 150 + 1 + 75 (w4).
    expect(s[1]!.rows!.map((r) => r.data[GEN_INSTANCE_COL.totalHeight])).toEqual([226, 225, 226]);
    expect(s[1]!.rows!.every((r) => r.data[OBU] === "/businessunits(bu-1)" && r.data[GEN_INSTANCE_COL.effectiveCapacity] === 5)).toBe(true);
    // The rest of the plan is today's, step for step.
    const notTurbine = (ws: typeof on.writes) => ws.filter((w) => w.entitySet !== TURBINE);
    expect(notTurbine(on.writes)).toEqual(notTurbine(off.writes));
    expect(on.writes[0]).toEqual(off.writes[0]);
    expect(noBulkInGroup(on.writes)).toBe(true);
  });

  it("UT-GEN-237 the request-count model (S = 1, 10, 200 siblings): S updates today, ONE bulk step of S rows with the flag; nothing to patch gives no step", () => {
    for (const siblings of [1, 10, 200]) {
      const off = R.planSaveTurbine(editArgs(siblings), { bulk: OFF });
      const on = R.planSaveTurbine(editArgs(siblings), { bulk: APPLY });
      expect(off.writes).toHaveLength(siblings + 3);
      expect(on.writes).toHaveLength(4);
      expect(changes(on.writes)).toBe(changes(off.writes));
      expect(waves(on.writes)).toBe(waves(off.writes));
    }
    const nothing = R.planSaveTurbine(editArgs(5, { applyAll: { capacity: false, hubHeight: false, plinth: false } }), { bulk: APPLY });
    expect(nothing.writes.some((w) => w.op === "updateMany")).toBe(false);
    expect(R.planSaveTurbine(editArgs(0), { bulk: APPLY }).writes.some((w) => w.op === "updateMany")).toBe(false);
  });

  it("UT-GEN-238 a capacity-only apply sends only the capacity (no total height) plus the OBU bind, as today", () => {
    const on = R.planSaveTurbine(editArgs(2, { applyAll: { capacity: true, hubHeight: false, plinth: false } }), { bulk: APPLY });
    const rows = steps(on.writes)[1]!.rows!;
    expect(rows.map((r) => Object.keys(r.data).sort())).toEqual(reps("", 2).map(() => [OBU, GEN_INSTANCE_COL.effectiveCapacity].sort()));
  });

  it("UT-GEN-239 a NEW turbine with both flags on: the turbine create, the sibling updateMany, then the allocations createMany bound to @created#0; each flag works on its own", () => {
    const base = editArgs(2, { turbine: null, landLeaseCosts: costs(2) });
    const type = base.type;
    const siblings = base.typeTurbines.slice(1);
    const args = { ...base, typeTurbines: siblings, allTypes: [type], form: { ...base.form, nameIndex: "9" } };
    const both = R.planSaveTurbine(args, { bulk: only("applyAll", "allocations"), newId: counter("a") });
    expect(steps(both.writes).map((x) => x.kind)).toEqual(["single", "bulk", "single", "single", "bulk"]);
    expect(steps(both.writes)[4]!.ops).toEqual([`createMany:${ALLOC}`]);
    expect(steps(both.writes)[4]!.rows!.every((r) => r.data["vsb_GeneratorInProject@odata.bind"] === "/vsb_generatorinprojects(@created#0)")).toBe(true);
    const applyOnly = R.planSaveTurbine(args, { bulk: APPLY });
    expect(steps(applyOnly.writes).map((x) => x.kind)).toEqual(["single", "bulk", "single", "single", "group"]);
    const allocOnly = R.planSaveTurbine(args, { bulk: only("allocations"), newId: counter() });
    expect(steps(allocOnly.writes).map((x) => x.kind)).toEqual(["single", "group", "single", "single", "bulk"]);
  });
});
