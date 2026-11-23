/**
 * Optimization programme B5b, OPT-01 / OPT-07d, the NEW behaviour. The OLD full load is pinned by `projectLoad.waves.test.ts`
 * (recorded on the unmodified tree); this file measures the Project Management row-only load and the shared-list state lookup with
 * the same wave recorder, and compares each against the old single-row read. Ids: UT-PROJLOAD-OPT-010 and up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveClient, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({ wave: undefined as unknown as WaveClient, row: {} as Record<string, unknown>, states: [] as Record<string, unknown>[] }));

vi.mock("./client", () => ({
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
}));
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/EnvironmentvariablevaluesService", () => ({ EnvironmentvariablevaluesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/EnvironmentvariabledefinitionsService", () => ({ EnvironmentvariabledefinitionsService: { getAll: async () => ({ success: true, data: [] }) } }));
const get = (label: string, find: (id: string) => Record<string, unknown> | undefined) => async (id: string) => {
  const rows = await h.wave.fetchAll(label, null, { id });
  const data = rows[0] ? find(id) : undefined;
  return data ? { success: true, data } : { success: false, error: { message: "not found" } };
};
vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: { get: (id: string) => get("lookup country", () => ({ vsb_countryid: id, vsb_isocurrencycode: "PLN", vsb_name: "Poland" }))(id) },
}));
vi.mock("@/generated/services/Vsb_countryareasService", () => ({
  Vsb_countryareasService: { get: (id: string) => get("lookup area", () => ({ vsb_countryareaid: id, vsb_name: "Pomorskie" }))(id) },
}));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({
  Vsb_projectstatesService: { get: (id: string) => get("lookup state", (i) => h.states.find((s) => s.vsb_projectstateid === i))(id) },
}));

const { loadProject, projectLoadSwitch } = await import("./project");
const { loadProjectStateOrder } = await import("./projects");
const { projectStateLookup } = await import("./projectStateLookup");
const { QueryClient } = await import("@tanstack/react-query");

const P = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const COUNTRY = "c0000000-0000-0000-0000-000000000001";
const AREA = "a0000000-0000-0000-0000-000000000001";
const STATE = "5a000000-0000-0000-0000-000000000003";
const OTHER = "5a000000-0000-0000-0000-0000000000aa";
const FV = "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue";
const APPROVAL = { Draft: 952850000, Approving: 952850001, Approved: 952850002, Rejected: 952850003, Canceled: 952850004 } as const;

const fullRow = (): Record<string, unknown> => ({
  vsb_projectid: P, vsb_name: "10000123", vsb_projectname: "Wirmighausen", vsb_projectstartdate: "2015-01-20",
  _vsb_country_value: COUNTRY, _vsb_countryarea_value: AREA, _vsb_clusterstate_value: STATE, [FV]: "Cluster 3",
  vsb_approvalstates: APPROVAL.Approving, _owningbusinessunit_value: "b0000000-0000-0000-0000-000000000001",
});
const labels = (calls: { label: string }[]) => calls.map((c) => c.label);

beforeEach(() => {
  h.wave = createWaveClient((label) => {
    if (label === "load project") return h.row ? [h.row] : [];
    if (label === "list project states") return h.states; // the shared list, read with the real `listProjectStates`
    return [{}];
  });
  h.row = fullRow();
  h.states = [{ vsb_projectstateid: STATE, vsb_order: 3, vsb_name: "Cluster 3", statecode: 0 }];
  projectLoadSwitch.pmRowOnly = true;
});

describe("OPT-01: the Project Management load reads the row only", () => {
  it("UT-PROJLOAD-OPT-010 scope pm: 1 request, 1 wave (OLD 4 requests, 2 waves); the state name comes from the row's annotation", async () => {
    const { value, waves, calls } = await h.wave.run(() => loadProject(P, { scope: "pm" }));
    expect(labels(calls)).toEqual(["load project"]);
    expect(waves).toBe(1);
    expect(value).toMatchObject({ projectId: P, projectIdCode: "10000123", projectName: "Wirmighausen", approvalState: "Approving", clusterStateName: "Cluster 3" });
    // Cost-only fields are not loaded on a PM route.
    expect(value?.countryName).toBeUndefined();
    expect(value?.isoCurrencyCode).toBeUndefined();
    expect(value?.areaStateProvince).toBeUndefined();
    expect(value?.clusterStateOrder).toBeUndefined();
  });

  it("UT-PROJLOAD-OPT-011 the header fields are IDENTICAL to the full load for each approval state, and for none", async () => {
    for (const [label, code] of [...Object.entries(APPROVAL), ["none", undefined]] as [string, number | undefined][]) {
      h.row = { ...fullRow(), vsb_approvalstates: code };
      const full = await h.wave.run(() => loadProject(P));
      const pm = await h.wave.run(() => loadProject(P, { scope: "pm" }));
      const header = (c: typeof full.value) => ({
        projectId: c?.projectId, projectIdCode: c?.projectIdCode, projectName: c?.projectName, approvalState: c?.approvalState,
        clusterStateName: c?.clusterStateName, startDate: c?.startDate, endDate: c?.endDate,
        owningBusinessUnitId: c?.owningBusinessUnitId, milestones: c?.milestones,
      });
      expect(header(pm.value), label).toEqual(header(full.value));
      expect(pm.value?.approvalState, label).toBe(code === undefined ? undefined : label);
    }
  });

  it("UT-PROJLOAD-OPT-012 a project with no cluster state has no state name and costs 1 request, as before", async () => {
    h.row = { ...fullRow(), _vsb_clusterstate_value: undefined, [FV]: undefined };
    const pm = await h.wave.run(() => loadProject(P, { scope: "pm" }));
    expect(labels(pm.calls)).toEqual(["load project"]);
    expect(pm.value?.clusterStateName).toBeUndefined();
    const full = await h.wave.run(() => loadProject(P));
    expect(full.value?.clusterStateName).toBeUndefined();
  });

  it("UT-PROJLOAD-OPT-013 a missing project (or one the user cannot read) is undefined after 1 request, as before", async () => {
    h.wave = createWaveClient(() => []);
    const { value, waves, calls } = await h.wave.run(() => loadProject(P, { scope: "pm" }));
    expect(value).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(waves).toBe(1);
  });

  it("UT-PROJLOAD-OPT-014 no annotation on a row that has a cluster state: falls back to the single-row lookup, never a blank name", async () => {
    for (const annotation of [undefined, ""]) {
      h.row = { ...fullRow(), [FV]: annotation };
      const { value, waves, calls } = await h.wave.run(() => loadProject(P, { scope: "pm" }));
      expect(labels(calls)).toEqual(["load project", "lookup state"]);
      expect(waves).toBe(2);
      expect(value?.clusterStateName).toBe("Cluster 3");
    }
  });

  it("UT-PROJLOAD-OPT-015 the fallback with the shared list: no single-row request when the list holds the state", async () => {
    h.row = { ...fullRow(), [FV]: undefined };
    const { value, calls } = await h.wave.run(() => loadProject(P, { scope: "pm", stateLookup: projectStateLookup(new QueryClient()) }));
    expect(labels(calls)).toEqual(["load project", "list project states"]);
    expect(value?.clusterStateName).toBe("Cluster 3");
  });

  it("UT-PROJLOAD-OPT-016 the fallback meets an unreadable state: no name, never a wrong one; the approval state is untouched", async () => {
    h.row = { ...fullRow(), [FV]: undefined };
    h.states = [];
    const { value } = await h.wave.run(() => loadProject(P, { scope: "pm" }));
    expect(value?.clusterStateName).toBeUndefined();
    expect(value?.approvalState).toBe("Approving");
  });

  it("UT-PROJLOAD-OPT-017 the switch off (PM_ROW_ONLY_PROJECT_LOAD = false): scope pm is the OLD full load, 4 requests in 2 waves", async () => {
    projectLoadSwitch.pmRowOnly = false;
    const { value, waves, calls } = await h.wave.run(() => loadProject(P, { scope: "pm" }));
    expect(labels(calls)).toEqual(["load project", "lookup country", "lookup state", "lookup area"]);
    expect(waves).toBe(2);
    expect(value).toMatchObject({ countryName: "Poland", areaStateProvince: "Pomorskie", clusterStateOrder: 3, clusterStateName: "Cluster 3" });
  });

  it("UT-PROJLOAD-OPT-018 the PM read keeps the row's $select and, as the full load (23 Nov 2026), reads the project in any state", async () => {
    const { calls } = await h.wave.run(() => loadProject(P, { scope: "pm" }));
    expect(calls[0]?.select).toEqual(expect.arrayContaining(["vsb_projectid", "vsb_projectname", "vsb_approvalstates", "_vsb_clusterstate_value"]));
    expect(calls[0]?.filter).toContain(P);
    expect(calls[0]?.filter).not.toContain("statecode");
  });
});

describe("OPT-07d: the cluster state comes from the shared Project States list, with the same result", () => {
  it("UT-PROJLOAD-OPT-020 the full load with the shared list: still 2 waves, same context; warm, no state request at all", async () => {
    const qc = new QueryClient();
    const old = await h.wave.run(() => loadProject(P));
    const now = await h.wave.run(() => loadProject(P, { stateLookup: projectStateLookup(qc) }));
    expect(labels(now.calls).sort()).toEqual(["list project states", "load project", "lookup area", "lookup country"]);
    expect(now.waves).toBe(old.waves);
    expect(now.value).toEqual(old.value);
    const warm = await h.wave.run(() => loadProject(P, { stateLookup: projectStateLookup(qc) }));
    expect(labels(warm.calls).sort()).toEqual(["load project", "lookup area", "lookup country"]);
    expect(warm.value).toEqual(old.value);
  });

  // The differential: the old single-row read and the shared-list lookup give the same name and order on every shape of row.
  const SHAPES: [string, Record<string, unknown>[]][] = [
    ["an ordinary state", [{ vsb_projectstateid: STATE, vsb_order: 3, vsb_name: "Cluster 3", statecode: 0 }]],
    ["a tie on Order", [
      { vsb_projectstateid: OTHER, vsb_order: 3, vsb_name: "Other", statecode: 0 },
      { vsb_projectstateid: STATE, vsb_order: 3, vsb_name: "Cluster 3", statecode: 0 }]],
    ["a blank Order (the list's own order maps it to 0)", [
      { vsb_projectstateid: OTHER, vsb_order: 0, vsb_name: "Zero", statecode: 0 },
      { vsb_projectstateid: STATE, vsb_order: null, vsb_name: "No order", statecode: 0 }]],
    ["an Order of 0, a real value", [{ vsb_projectstateid: STATE, vsb_order: 0, vsb_name: "Draft", statecode: 0 }]],
    ["an inactive state", [{ vsb_projectstateid: STATE, vsb_order: 8, vsb_name: "Abandoned", statecode: 1 }]],
    ["a blank name", [{ vsb_projectstateid: STATE, vsb_order: 2, vsb_name: "", statecode: 0 }]],
    ["no name column", [{ vsb_projectstateid: STATE, vsb_order: 2, statecode: 0 }]],
    ["a state the list does not hold", []],
  ];
  for (const [i, [label, table]] of SHAPES.entries()) {
    it(`UT-PROJLOAD-OPT-03${i} differential, ${label}: loadProject and loadProjectStateOrder agree with the single-row read`, async () => {
      h.states = table;
      const single = await h.wave.run(() => loadProject(P));
      const shared = await h.wave.run(() => loadProject(P, { stateLookup: projectStateLookup(new QueryClient()) }));
      expect(shared.value?.clusterStateOrder).toBe(single.value?.clusterStateOrder);
      expect(shared.value?.clusterStateName).toBe(single.value?.clusterStateName);
      expect(Object.keys(shared.value ?? {}).sort()).toEqual(Object.keys(single.value ?? {}).sort());

      const oldOrder = await h.wave.run(() => loadProjectStateOrder(STATE).catch(() => "threw"));
      const newOrder = await h.wave.run(() => loadProjectStateOrder(STATE, projectStateLookup(new QueryClient())).catch(() => "threw"));
      expect(newOrder.value).toEqual(oldOrder.value);
    });
  }

  it("UT-PROJLOAD-OPT-040 the Simulate gate's order: no request of its own when the list is warm, the list read once when cold", async () => {
    const qc = new QueryClient();
    const cold = await h.wave.run(() => loadProjectStateOrder(STATE, projectStateLookup(qc)));
    expect(cold.value).toBe(3);
    expect(labels(cold.calls)).toEqual(["list project states"]);
    const warm = await h.wave.run(() => loadProjectStateOrder(STATE, projectStateLookup(qc)));
    expect(warm.value).toBe(3);
    expect(warm.calls).toHaveLength(0);
    expect((await h.wave.run(() => loadProjectStateOrder(null, projectStateLookup(qc)))).value).toBeNull();
  });

  it("UT-PROJLOAD-OPT-041 a list that cannot be read falls back to the single-row read, which still throws when it fails (PO-006)", async () => {
    const failing = () => Promise.reject(new Error("list down"));
    const viaFallback = await h.wave.run(() => loadProjectStateOrder(STATE, failing));
    expect(viaFallback.value).toBe(3);
    expect(labels(viaFallback.calls)).toEqual(["lookup state"]);
    h.states = [];
    await expect(h.wave.run(() => loadProjectStateOrder(STATE, failing))).rejects.toThrow();
    const ctx = await h.wave.run(() => loadProject(P, { stateLookup: failing }));
    expect(ctx.value?.clusterStateName).toBeUndefined();
  });
});
