/**
 * Phase 4 of the Generators bulk programme (work package R2, plan §3 phase 4): the N turbines of a new WTG type are ONE
 * `createMany` when `GENERATORS_BULK.turbines` is on; the type stays a single create first. IDs UT-GEN-240..; both halves.
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { setBulkBackend, type BulkBackend, type BulkRow } from "@/data/bulkBackend";
import { executePlan, type PlanClient } from "@/data/executePlan";
import * as R from "./rules";
import {
  OBU, OFF, PROJECTS, TURBINE, TYPE, P, changes, counter, genType, model, n, noBulkInGroup, only, steps, turbine, waves,
} from "./bulkPlans.testkit";

/*
 * D144 pin: this file tests the D115 / D116 flags and the plan shapes of BEFORE the save-latency work (relaneWrites, replaceLanes,
 * wideGroups), so those three switches are held OFF here. The same builders with the switches ON are covered by saveLatency.test.ts.
 */
beforeEach(() => setGeneratorsPerfFlags({ relaneWrites: false, replaceLanes: false, wideGroups: false }));
afterEach(() => setGeneratorsPerfFlags(null));

const ON = only("turbines");

const createType = (count: number, opts?: R.PlanBulkOptions, over: Partial<Parameters<typeof R.planCreateGeneratorType>[0]> = {}) =>
  R.planCreateGeneratorType({
    project: P, inCountry: true, model: model({ specificCapacity: 5.6, hubHeight: 148, rotorDiameter: 150 }), numberOfGenerators: count,
    costPerWtg: 900_000, selectedHeight: 150, revisedHubHeight: null, existingTypes: [genType({ id: "t0" })],
    projectTurbines: [turbine(1), turbine(2)], ...over,
  }, opts);

describe("phase 4: bulk turbine creates (flag GENERATORS_BULK.turbines)", () => {
  it("UT-GEN-240 flag off: the type create, ONE parallel run of the N turbine creates (default limit), the roll-up last (today's plan)", () => {
    const s = steps(createType(3, { bulk: OFF }).writes);
    expect(s.map((x) => [x.kind, x.limit, x.ops.length])).toEqual([["single", undefined, 1], ["group", undefined, 3], ["single", undefined, 1]]);
    expect(s[0]!.ops).toEqual([`create:${TYPE}`]);
    expect(s[2]!.ops).toEqual([`update:${PROJECTS}`]);
  });

  it("UT-GEN-241 flag on: the type as a SINGLE create first, ONE createMany of the turbine rows (injected ids, today's data, the type bind as @created#0), the roll-up last", () => {
    const plan = createType(3, { bulk: ON, newId: counter("w") });
    const s = steps(plan.writes);
    expect(s.map((x) => [x.kind, x.ops])).toEqual([
      ["single", [`create:${TYPE}`]], ["bulk", [`createMany:${TURBINE}`]], ["single", [`update:${PROJECTS}`]],
    ]);
    const rows = s[1]!.rows!;
    expect(rows.map((r) => r.id)).toEqual(["w-1", "w-2", "w-3"]);
    expect(rows.map((r) => r.data[R.GEN_INSTANCE_COL.name])).toEqual(["WTG WPN_3", "WTG WPN_4", "WTG WPN_5"]);
    // Exactly today's single-create payloads, in the same order.
    const today = createType(3, { bulk: OFF }).writes.filter((w) => w.entitySet === TURBINE).map((w) => w.data);
    expect(rows.map((r) => r.data)).toEqual(today);
    expect(rows.every((r) => r.data[R.PLANT_BIND.moduleTypeWtg] === "/vsb_generatortypeinprojects(@created#0)")).toBe(true);
    expect(rows.every((r) => r.data[OBU] === "/businessunits(bu-1)")).toBe(true);
    expect(plan.writes[0]!.concurrent).toBeFalsy();
    expect(plan.writes[0]!.op).toBe("create");
    expect(noBulkInGroup(plan.writes)).toBe(true);
    expect(plan.writes[plan.writes.length - 1]!.entitySet).toBe(PROJECTS);
    expect(plan.log).toEqual(["Generator type with 3 turbines"]);
  });

  it("UT-GEN-242 the request-count model (N = 0, 1, 10, 200): N+2 writes today, 3 plan steps with the flag; the rows add up to the same changes", () => {
    for (const count of [0, 1, 10, 200]) {
      const off = createType(count, { bulk: OFF });
      const on = createType(count, { bulk: ON, newId: counter() });
      expect(off.writes, `off N=${count}`).toHaveLength(count + 2);
      expect(on.writes, `on N=${count}`).toHaveLength(count > 0 ? 3 : 2);
      expect(changes(on.writes)).toBe(changes(off.writes));
      expect(waves(on.writes)).toBe(count > 0 ? 3 : 2);
      expect(waves(off.writes)).toBe(count > 0 ? 3 : 2);
      const ids = on.writes.flatMap((w) => (w.rows ?? []).map((r) => r.id));
      expect(ids).toHaveLength(count);
      expect(new Set(ids).size).toBe(count);
    }
  });

  it("UT-GEN-243 out of country there is no roll-up: the type, then the createMany (flag on) or the run (flag off)", () => {
    const on = createType(2, { bulk: ON, newId: counter() }, { inCountry: false });
    expect(steps(on.writes).map((x) => x.kind)).toEqual(["single", "bulk"]);
    const off = createType(2, { bulk: OFF }, { inCountry: false });
    expect(steps(off.writes).map((x) => x.kind)).toEqual(["single", "group"]);
  });

  it("UT-GEN-244 names continue after the project's highest index and match in both halves", () => {
    const names = (opts: R.PlanBulkOptions) => {
      const plan = createType(4, opts, { projectTurbines: [turbine(7), turbine(9)] });
      return plan.writes.flatMap((w) => (w.rows ?? [w]).map((r) => (r.data as Record<string, unknown>)[R.GEN_INSTANCE_COL.name])).filter(Boolean);
    };
    expect(names({ bulk: OFF })).toEqual(["WTG WPN_10", "WTG WPN_11", "WTG WPN_12", "WTG WPN_13"]);
    expect(names({ bulk: ON, newId: counter() })).toEqual(["WTG WPN_10", "WTG WPN_11", "WTG WPN_12", "WTG WPN_13"]);
  });

  it("UT-GEN-245 the default id source makes distinct GUIDs when no newId is injected", () => {
    const rows = createType(5, { bulk: ON }).writes[1]!.rows!;
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    expect(rows.every((r) => /^[0-9a-f-]{36}$/.test(r.id))).toBe(true);
  });
});

/** An engine stub: the type create answers `type-1`; the fake bulk backend records rows and answers their own ids. */
function engine() {
  const sent: { entitySet: string; rows: BulkRow[] }[] = [];
  const backend: BulkBackend = {
    createMany: vi.fn(async (entitySet: string, rows: readonly BulkRow[]) => {
      sent.push({ entitySet, rows: [...rows] });
      return { ids: rows.map((r) => r.id), requests: 1 };
    }),
    updateMany: vi.fn(async () => ({ requests: 1 })),
  };
  setBulkBackend(backend);
  const ok = <T,>(data: T) => ({ success: true as const, data });
  const client = {
    createRecordAsync: vi.fn(async () => ok({ vsb_generatortypeinprojectid: "type-1" })),
    updateRecordAsync: vi.fn(async () => ok({})),
    deleteRecordAsync: vi.fn(async () => ok(undefined)),
  } as unknown as PlanClient;
  return { client, sent };
}

describe("phase 4: the createdIds contract through the engine", () => {
  afterEach(() => setBulkBackend(null));

  it("UT-GEN-246 createdIds is [the type, then the turbines in row order]; the type bind is resolved per row before the send", async () => {
    const { client, sent } = engine();
    const plan = createType(4, { bulk: ON, newId: counter("w") });
    const result = await executePlan(plan, "save type", client);
    expect(result.createdIds).toEqual(["type-1", "w-1", "w-2", "w-3", "w-4"]);
    // The screen's consumer: `createdIds.slice(1, 1 + n)` are the turbines, in the order of their names.
    expect(result.createdIds.slice(1, 1 + 4)).toEqual(sent[0]!.rows.map((r) => r.id));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.entitySet).toBe(TURBINE);
    expect(sent[0]!.rows.every((r) => r.data[R.PLANT_BIND.moduleTypeWtg] === "/vsb_generatortypeinprojects(type-1)")).toBe(true);
    expect(result.landed.map((l) => `${l.entitySet}:${l.id}`)).toEqual([
      `${TYPE}:type-1`, ...n(4, (i) => `${TURBINE}:w-${i}`),
    ]);
    // 1 type + 4 turbines + the roll-up: changes are counted per row.
    expect(result.done).toBe(6);
  });

  it("UT-GEN-247 with the flag off the engine returns the same id order (type first, then the turbines) from single creates", async () => {
    const { client } = engine();
    const ids = ["type-1", "a", "b", "c"];
    let next = 0;
    (client as unknown as { createRecordAsync: (...a: unknown[]) => unknown }).createRecordAsync = vi.fn(async (entitySet: unknown) => ({
      success: true as const,
      data: { [entitySet === TYPE ? "vsb_generatortypeinprojectid" : "vsb_generatorinprojectid"]: ids[next++] },
    }));
    const result = await executePlan(createType(3, { bulk: OFF }), "save type", client);
    expect(result.createdIds).toEqual(["type-1", "a", "b", "c"]);
  });
});
