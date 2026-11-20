/**
 * UT-GENPERF-300.. — the optimistic Activate / Deactivate toggle (D143, `GENERATORS_PERF.optimisticToggle`): the pure row
 * functions, their canvas-parity twins and the cache apply / rollback against a real `QueryClient`.
 */
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import {
  applyOptimisticToggle, nextToggleStatus, optimisticTurbines, optimisticTurbinesCanvasParity, optimisticTypes,
  optimisticTypesCanvasParity,
} from "./optimisticToggle";
import { planToggleStatus, type GeneratorTypeRow, type TurbineRow } from "./rules";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ACTIVE = CHOICE_PLANT.status.active;
const INACTIVE = CHOICE_PLANT.status.inactive;

const type = (id: string, status: number = ACTIVE): GeneratorTypeRow => ({
  id, name: id, generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 2, costPerWtg: 1, generatorsCost: 2,
  generatorsCapacity: 11.2, requestPermissionState: null, flowRunId: null, flowApprovalId: null, status, specificCapacity: null,
});
const turbine = (id: string, typeId: string, status: number = ACTIVE): TurbineRow => ({
  id, name: id, typeId, index: 1, effectiveCapacity: 5.6, effectiveHubHeight: null, effectiveHubHeightChanged: false,
  foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status,
});

describe("the optimistic rows (pure)", () => {
  it("UT-GENPERF-300 only the toggled type changes status; every other row is the very same object", () => {
    const rows = [type("t1"), type("t2")];
    const next = optimisticTypes(rows, "t1", INACTIVE);
    expect(next[0]).toEqual({ ...rows[0], status: INACTIVE });
    expect(next[1]).toBe(rows[1]);
    expect(rows[0]!.status).toBe(ACTIVE);
  });

  it("UT-GENPERF-301 only the toggled type's turbines change status", () => {
    const rows = [turbine("a", "t1"), turbine("b", "t2"), turbine("c", "t1")];
    const next = optimisticTurbines(rows, "t1", INACTIVE);
    expect(next.map((t) => t.status)).toEqual([INACTIVE, ACTIVE, INACTIVE]);
    expect(next[1]).toBe(rows[1]);
  });

  it("UT-GENPERF-302 the canvas-parity twins show nothing early: the rows come back unchanged (switch off = today)", () => {
    const types = [type("t1")];
    const turbines = [turbine("a", "t1")];
    expect(optimisticTypesCanvasParity(types)).toEqual(types);
    expect(optimisticTypesCanvasParity(types)[0]!.status).toBe(ACTIVE);
    expect(optimisticTurbinesCanvasParity(turbines)).toEqual(turbines);
    expect(optimisticTurbinesCanvasParity(turbines)[0]!.status).toBe(ACTIVE);
  });

  it("UT-GENPERF-303 the status shown is the status the plan writes (one decision, both directions)", () => {
    const project = { id: PROJECT, shortName: "WPN", owningBusinessUnitId: "bu" };
    for (const status of [ACTIVE, INACTIVE]) {
      const t = type("t1", status);
      const plan = planToggleStatus({ project, type: t, turbines: [{ id: "a" }], allTypes: [t] });
      const typeWrite = plan.writes.find((w) => w.op === "update" && w.id === "t1");
      expect(typeWrite?.data).toEqual({ statecode: nextToggleStatus(t) });
    }
    expect(nextToggleStatus(type("t1", ACTIVE))).toBe(INACTIVE);
    expect(nextToggleStatus(type("t1", INACTIVE))).toBe(ACTIVE);
  });
});

function seededClient() {
  const qc = new QueryClient();
  const types = [type("t1"), type("t2")];
  const byIds = [turbine("a", "t1"), turbine("b", "t2")];
  const byProject = [turbine("a", "t1"), turbine("b", "t2"), turbine("c", "t1")];
  const pv = [{ id: "pv1" }];
  qc.setQueryData(qk.generators(PROJECT, "types"), types);
  qc.setQueryData(qk.generators(PROJECT, "turbines", "t1", "t2"), byIds);
  qc.setQueryData(qk.generators(PROJECT, "turbines", "byProject"), byProject);
  qc.setQueryData(qk.generators(PROJECT, "pv"), pv);
  qc.setQueryData(qk.generators("another-project", "types"), [type("t1")]);
  return { qc, types, byIds, byProject, pv };
}

describe("the optimistic cache (real QueryClient)", () => {
  it("UT-GENPERF-304 shows the new status in the types and in both turbine key forms; other families and projects are untouched", async () => {
    const { qc, pv } = seededClient();
    await applyOptimisticToggle(qc, { projectId: PROJECT, typeId: "t1", nextStatus: INACTIVE });
    const types = qc.getQueryData<GeneratorTypeRow[]>(qk.generators(PROJECT, "types"))!;
    expect(types.map((t) => t.status)).toEqual([INACTIVE, ACTIVE]);
    expect(qc.getQueryData<TurbineRow[]>(qk.generators(PROJECT, "turbines", "t1", "t2"))!.map((t) => t.status)).toEqual([INACTIVE, ACTIVE]);
    expect(qc.getQueryData<TurbineRow[]>(qk.generators(PROJECT, "turbines", "byProject"))!.map((t) => t.status)).toEqual([INACTIVE, ACTIVE, INACTIVE]);
    expect(qc.getQueryData(qk.generators(PROJECT, "pv"))).toBe(pv);
    expect(qc.getQueryData<GeneratorTypeRow[]>(qk.generators("another-project", "types"))![0]!.status).toBe(ACTIVE);
  });

  it("UT-GENPERF-305 the rollback puts back the EXACT previous rows (equal to the snapshot, status included), and a second call changes nothing", async () => {
    const { qc, types, byIds, byProject } = seededClient();
    const rollback = await applyOptimisticToggle(qc, { projectId: PROJECT, typeId: "t1", nextStatus: INACTIVE });
    expect(qc.getQueryData<GeneratorTypeRow[]>(qk.generators(PROJECT, "types"))![0]!.status).toBe(INACTIVE);
    rollback();
    // (`setQueryData` shares structure with the previous value, so the rows are equal to the snapshot, not always the same objects.)
    expect(qc.getQueryData(qk.generators(PROJECT, "types"))).toStrictEqual(types);
    expect(qc.getQueryData(qk.generators(PROJECT, "turbines", "t1", "t2"))).toStrictEqual(byIds);
    expect(qc.getQueryData(qk.generators(PROJECT, "turbines", "byProject"))).toStrictEqual(byProject);
    expect(qc.getQueryData<GeneratorTypeRow[]>(qk.generators(PROJECT, "types"))![0]!.status).toBe(ACTIVE);
    // A later real answer must not be overwritten by a second rollback.
    const real = [type("t1", INACTIVE), type("t2")];
    qc.setQueryData(qk.generators(PROJECT, "types"), real);
    rollback();
    expect(qc.getQueryData<GeneratorTypeRow[]>(qk.generators(PROJECT, "types"))![0]!.status).toBe(INACTIVE);
  });

  it("UT-GENPERF-306 a project with no cached rows is a no-op, and its rollback is too", async () => {
    const qc = new QueryClient();
    const rollback = await applyOptimisticToggle(qc, { projectId: PROJECT, typeId: "t1", nextStatus: INACTIVE });
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(() => rollback()).not.toThrow();
  });

  it("UT-GENPERF-307 reads of the two query groups still in flight are cancelled first, so an older answer cannot land over the optimistic rows", async () => {
    const { qc } = seededClient();
    const cancel = vi.spyOn(qc, "cancelQueries");
    await applyOptimisticToggle(qc, { projectId: PROJECT, typeId: "t1", nextStatus: INACTIVE });
    const keys = cancel.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
    expect(keys).toEqual([qk.generators(PROJECT, "types"), qk.generators(PROJECT, "turbines")]);
  });
});
