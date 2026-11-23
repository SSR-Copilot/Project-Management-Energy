/**
 * Optimization programme B5b, OPT-01 / OPT-07d: the session project load, as sequential WAVES and requests.
 *
 * Measured with the wave recorder (`src/test/waveClient.ts`): every read the loader makes (the project row through `fetchAll`, and
 * the single-row `Service.get` lookups, which are routed through the same recorder) is held until every read that CAN start has
 * started, then released together. The number of releases is the number of sequential round trips. The `OLD` tests were recorded
 * first against the unmodified tree and still pass: they pin the full load that `/costs/*` keeps. Ids: UT-PROJLOAD-OPT-NNN.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveClient, startedTogether, waveOf, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({ wave: undefined as unknown as WaveClient, row: {} as Record<string, unknown>, states: [] as Record<string, unknown>[] }));

vi.mock("./client", () => ({
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
}));
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/EnvironmentvariablevaluesService", () => ({ EnvironmentvariablevaluesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/EnvironmentvariabledefinitionsService", () => ({ EnvironmentvariabledefinitionsService: { getAll: async () => ({ success: true, data: [] }) } }));
// The lookups are single-row GETs. Each goes through the recorder so it counts as a request in a wave.
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

const P = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const COUNTRY = "c0000000-0000-0000-0000-000000000001";
const AREA = "a0000000-0000-0000-0000-000000000001";
const STATE = "5a000000-0000-0000-0000-000000000003";
const FV = "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue";

const fullRow = () => ({
  vsb_projectid: P, vsb_name: "10000123", vsb_projectname: "Wirmighausen", vsb_projectstartdate: "2015-01-20",
  _vsb_country_value: COUNTRY, _vsb_countryarea_value: AREA, _vsb_clusterstate_value: STATE, [FV]: "Cluster 3",
  vsb_approvalstates: 952850001, _owningbusinessunit_value: "b0000000-0000-0000-0000-000000000001",
});

beforeEach(() => {
  h.wave = createWaveClient((label) => {
    if (label === "load project") return h.row ? [h.row] : [];
    if (label === "list project states") return h.states; // the shared list, read with the real `listProjectStates`
    return [{}]; // every lookup exists
  });
  h.row = fullRow();
  h.states = [{ vsb_projectstateid: STATE, vsb_order: 3, vsb_name: "Cluster 3", statecode: 0 }];
  projectLoadSwitch.pmRowOnly = true;
});

describe("OLD (recorded on the unmodified tree): the full session load", () => {
  it("UT-PROJLOAD-OPT-001 the project row, then country, cluster state and area together: 4 requests, 2 waves", async () => {
    const { value, waves, calls } = await h.wave.run(() => loadProject(P));
    expect(calls.map((c) => c.label)).toEqual(["load project", "lookup country", "lookup state", "lookup area"]);
    expect(waves).toBe(2);
    expect(waveOf(calls, "load project")).toBe(0);
    expect(startedTogether(calls, ["lookup country", "lookup state", "lookup area"])).toBe(true);
    expect(waveOf(calls, "lookup country")).toBe(1);
    expect(value).toMatchObject({
      projectId: P, projectName: "Wirmighausen", approvalState: "Approving", clusterStateName: "Cluster 3", clusterStateOrder: 3,
      countryName: "Poland", isoCurrencyCode: "PLN", areaStateProvince: "Pomorskie",
    });
  });

  it("UT-PROJLOAD-OPT-002 a project with no country, state or area: the row alone, 1 request, 1 wave", async () => {
    h.row = { vsb_projectid: P, vsb_name: "1", vsb_projectname: "Bare" };
    const { value, waves, calls } = await h.wave.run(() => loadProject(P));
    expect(calls.map((c) => c.label)).toEqual(["load project"]);
    expect(waves).toBe(1);
    expect(value).toMatchObject({ projectName: "Bare" });
    expect(value?.clusterStateName).toBeUndefined();
    expect(value?.approvalState).toBeUndefined();
  });

  it("UT-PROJLOAD-OPT-003 a missing project is undefined after one request", async () => {
    h.wave = createWaveClient(() => []);
    const { value, waves, calls } = await h.wave.run(() => loadProject(P));
    expect(value).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(waves).toBe(1);
  });
});
