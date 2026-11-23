/**
 * Optimization programme B6, OPT-24 (Check List part): narrow reads and the scope-id memo (`data/checklist.ts`, `checklistPeople.ts`).
 *
 * OLD (recorded against the unmodified tree): the transition wait read EVERY tracking of the project with 11 columns on every poll
 * (up to 20 polls); Request Approval (checklist) read the whole cluster to `.find` one task; every copy of the templates read the
 * scope row again. NEW: one tracking (3 columns, top 1) per poll; one task by id (3 columns, top 1); the scope id once per
 * country and technology for the reference window. The differential tests compare each narrow read with the full read it replaces.
 * Ids: UT-CHKNARROW-OPT-NNN.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  fns: {} as Record<string, import("vitest").Mock<(o: unknown) => Promise<unknown>>>,
  scope: vi.fn<(c: string, t: number) => Promise<string | null>>(),
}));
const getAllOf = (name: string) => {
  svc.fns[name] ??= vi.fn<(o: unknown) => Promise<unknown>>();
  return svc.fns[name]!;
};
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: (o: unknown) => getAllOf("projects")(o) } }));
vi.mock("@/generated/services/Vsb_projectstatetrackingsService", () => ({ Vsb_projectstatetrackingsService: { getAll: (o: unknown) => getAllOf("trackings")(o) } }));
vi.mock("@/generated/services/Vsb_projectchecklistsService", () => ({ Vsb_projectchecklistsService: { getAll: (o: unknown) => getAllOf("rows")(o) } }));
vi.mock("@/generated/services/Vsb_projectdefaultchecklistsesService", () => ({ Vsb_projectdefaultchecklistsesService: { getAll: (o: unknown) => getAllOf("templates")(o) } }));
vi.mock("@/generated/services/Vsb_projectdefaultapprovalsesService", () => ({ Vsb_projectdefaultapprovalsesService: { getAll: () => Promise.resolve({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectstatetrackingnotesService", () => ({ Vsb_projectstatetrackingnotesService: { getAll: () => Promise.resolve({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectchecklisttrackingnotesService", () => ({ Vsb_projectchecklisttrackingnotesService: { getAll: () => Promise.resolve({ success: true, data: [] }) } }));
vi.mock("./adminGatesApprovals", () => ({
  findScopeCountryTechId: (c: string, t: number) => svc.scope(c, t),
  getEntraPeople: async () => new Map(),
  listChecklistApprovals: async () => [],
  listGateApprovals: async () => [],
}));
vi.mock("./generalData", () => ({ listProjectStates: async () => [] }));

import { CHOICE_PROCESS } from "@/data/dataverseNames";
import { clusterTransitionDone, staleTaskRequestRefusal, trackingFor } from "@/features/pm/checklist/rules";
import {
  listChecklistTrackings, listClusterChecklist, listClusterTemplates, readClusterTask, readClusterTracking,
} from "./checklist";
import { resetChecklistPeopleCache } from "./checklistPeople";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown[]) => ({ success: true, data });
type Query = { select?: string[]; filter?: string; orderBy?: string[]; top?: number };
const queries = (name: string): Query[] => getAllOf(name).mock.calls.map((c) => c[0] as Query);
const ACS = CHOICE_PROCESS.approvalClusterState;

beforeEach(() => {
  resetChecklistPeopleCache();
  for (const f of Object.values(svc.fns)) f.mockReset();
  svc.scope.mockReset();
});

const tracking = (n: number, cluster: number, state: number | null) => ({
  vsb_projectstatetrackingid: id(n), vsb_name: `Cluster ${cluster}`, _vsb_clusterstate_value: id(100 + cluster), vsb_approvalclusterstate: state,
  vsb_flowrunid: "run", vsb_flowapprovalid: "ap",
});

describe("OPT-24 S4-12: the transition wait reads one tracking", () => {
  it("UT-CHKNARROW-OPT-001 readClusterTracking asks for ONE row of the project and cluster with three columns", async () => {
    getAllOf("trackings").mockResolvedValueOnce(ok([tracking(1, 2, ACS.completed)]));
    const row = await readClusterTracking(PROJECT, id(102));
    const [q] = queries("trackings");
    expect(q!.filter).toBe(`(_vsb_project_value eq ${PROJECT}) and (_vsb_clusterstate_value eq ${id(102)})`);
    expect(q!.top).toBe(1);
    expect(q!.select).toEqual(["vsb_projectstatetrackingid", "_vsb_clusterstate_value", "vsb_approvalclusterstate"]);
    expect(row).toMatchObject({ id: id(1), clusterStateId: id(102), approvalClusterState: ACS.completed });
  });

  it("UT-CHKNARROW-OPT-002 no tracking is null, and a failed read throws (the wait's own catch keeps waiting)", async () => {
    getAllOf("trackings").mockResolvedValueOnce(ok([]));
    expect(await readClusterTracking(PROJECT, id(102))).toBeNull();
    getAllOf("trackings").mockResolvedValueOnce({ success: false, error: new Error("500") });
    await expect(readClusterTracking(PROJECT, id(102))).rejects.toThrow();
  });

  it("UT-CHKNARROW-OPT-003 differential: the narrow read decides `clusterTransitionDone` exactly as the full list did", async () => {
    const all = [tracking(1, 1, ACS.completed), tracking(2, 2, ACS.inProgress), tracking(3, 3, null)];
    for (const cluster of [1, 2, 3, 4]) {
      getAllOf("trackings").mockReset();
      getAllOf("trackings").mockResolvedValueOnce(ok(all));
      const full = await listChecklistTrackings(PROJECT);
      const oldAnswer = clusterTransitionDone(full, id(100 + cluster));
      // The server answers the narrow query with the first row that matches it.
      getAllOf("trackings").mockResolvedValueOnce(ok(all.filter((t) => t._vsb_clusterstate_value === id(100 + cluster)).slice(0, 1)));
      const narrow = await readClusterTracking(PROJECT, id(100 + cluster));
      expect(clusterTransitionDone(narrow ? [narrow] : [], id(100 + cluster))).toBe(oldAnswer);
      expect(narrow?.id ?? null).toBe(trackingFor(full, id(100 + cluster))?.id ?? null);
    }
  });
});

describe("OPT-24 S4-12: Request Approval (checklist) reads the one task", () => {
  it("UT-CHKNARROW-OPT-004 readClusterTask filters project, cluster, ACTIVE and the id, top 1, three columns", async () => {
    getAllOf("rows").mockResolvedValueOnce(ok([{ vsb_projectchecklistid: id(5), vsb_name: "Land secured" }]));
    const row = await readClusterTask(PROJECT, id(102), id(5));
    const [q] = queries("rows");
    expect(q!.filter).toBe(`((_vsb_project_value eq ${PROJECT}) and (_vsb_clusterstate_value eq ${id(102)})) and (statecode eq 0) and (vsb_projectchecklistid eq ${id(5)})`);
    expect(q!.top).toBe(1);
    expect(q!.select).toHaveLength(3);
    expect(q!.select).toContain("vsb_projectchecklistid");
    expect(row).toMatchObject({ id: id(5), title: "Land secured" });
  });

  it("UT-CHKNARROW-OPT-005 a task that is not there (inactive, or left the cluster) is null, like the `.find` that missed it", async () => {
    getAllOf("rows").mockResolvedValueOnce(ok([]));
    expect(await readClusterTask(PROJECT, id(102), id(5))).toBeNull();
  });

  it("UT-CHKNARROW-OPT-006 differential: the C6 refusal is the same as with the whole-cluster read", async () => {
    // The state column name comes from CHECKLIST_COL; read it through the full mapper so the test follows the real name.
    const { CHECKLIST_COL } = await import("@/features/pm/checklist/rules");
    for (const state of [null, ACS.notStarted, ACS.inProgress, ACS.completed]) {
      const raw = { vsb_projectchecklistid: id(5), vsb_name: "Land secured", [CHECKLIST_COL.approvalChecklistState]: state, statecode: 0 };
      getAllOf("rows").mockReset();
      getAllOf("rows").mockResolvedValueOnce(ok([raw, { ...raw, vsb_projectchecklistid: id(6), vsb_name: "Other" }]));
      const fresh = (await listClusterChecklist(PROJECT, id(102))).find((r) => r.id === id(5));
      const oldRefusal = fresh ? staleTaskRequestRefusal(fresh) : null;
      getAllOf("rows").mockResolvedValueOnce(ok([raw]));
      const one = await readClusterTask(PROJECT, id(102), id(5));
      expect(one ? staleTaskRequestRefusal(one) : null).toBe(oldRefusal);
    }
  });
});

describe("OPT-24 S4-13: the scope id is read once per country and technology", () => {
  const WIND = CHOICE_PROCESS.technology.wind;
  const project = (countryId: string) => ({ countryId, technology: WIND });

  it("UT-CHKNARROW-OPT-007 two copies for the same country and technology read the scope row once (OLD: once per copy)", async () => {
    svc.scope.mockResolvedValue(id(77));
    getAllOf("templates").mockResolvedValue(ok([]));
    await listClusterTemplates(project(id(9)), id(102));
    await listClusterTemplates(project(id(9)), id(103));
    expect(svc.scope).toHaveBeenCalledTimes(1);
    expect(queries("templates")).toHaveLength(2);
    expect(queries("templates")[1]!.filter).toContain(`_vsb_associatedcountryandtechnology_value eq ${id(77)}`);
    await listClusterTemplates(project(id(10)), id(102));
    expect(svc.scope).toHaveBeenCalledTimes(2);
  });

  it("UT-CHKNARROW-OPT-008 a missing scope is NOT kept (a scope an admin adds is seen at once), a failed read is not kept, Refresh clears", async () => {
    getAllOf("templates").mockResolvedValue(ok([]));
    svc.scope.mockResolvedValueOnce(null);
    expect(await listClusterTemplates(project(id(9)), id(102))).toEqual([]);
    svc.scope.mockRejectedValueOnce(new Error("503"));
    await expect(listClusterTemplates(project(id(9)), id(102))).rejects.toThrow("503");
    svc.scope.mockResolvedValue(id(77));
    await listClusterTemplates(project(id(9)), id(102));
    expect(svc.scope).toHaveBeenCalledTimes(3);
    await listClusterTemplates(project(id(9)), id(102));
    expect(svc.scope).toHaveBeenCalledTimes(3);
    resetChecklistPeopleCache();
    await listClusterTemplates(project(id(9)), id(102));
    expect(svc.scope).toHaveBeenCalledTimes(4);
  });
});
