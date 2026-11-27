/**
 * UT-CHKDATA-001.. — the PM Checklist's REAL read functions (`data/checklist.ts`) against mocked generated services (checklist
 * analysis C11, CT-1 / CT-2). Until now the screen tests mocked `./hooks` whole and `rules.test.ts` only ran the pure mappers, so
 * no query's `$filter`, `$select`, ordering or fallback was ever executed. `fetchAll` / `fetchPage`, `odata.ts` and the row mappers
 * are the real ones; the seams are each generated service's `getAll` and the four Admin Gates Approvals reads the module reuses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  fns: {} as Record<string, import("vitest").Mock<(o: unknown) => Promise<unknown>>>,
  scope: vi.fn<(c: string, t: number) => Promise<string | null>>(),
  entra: vi.fn<(ids: readonly string[]) => Promise<Map<string, { mail?: string }>>>(),
  approvals: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
  gates: vi.fn<(c: string, t: number) => Promise<unknown[]>>(),
  states: vi.fn<() => Promise<unknown[]>>(),
}));
const getAllOf = (name: string) => {
  svc.fns[name] ??= vi.fn<(o: unknown) => Promise<unknown>>();
  return svc.fns[name]!;
};
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: (o: unknown) => getAllOf("projects")(o) } }));
vi.mock("@/generated/services/Vsb_projectstatetrackingsService", () => ({ Vsb_projectstatetrackingsService: { getAll: (o: unknown) => getAllOf("trackings")(o) } }));
vi.mock("@/generated/services/Vsb_projectchecklistsService", () => ({ Vsb_projectchecklistsService: { getAll: (o: unknown) => getAllOf("rows")(o) } }));
vi.mock("@/generated/services/Vsb_projectdefaultchecklistsesService", () => ({ Vsb_projectdefaultchecklistsesService: { getAll: (o: unknown) => getAllOf("templates")(o) } }));
vi.mock("@/generated/services/Vsb_projectdefaultapprovalsesService", () => ({ Vsb_projectdefaultapprovalsesService: { getAll: (o: unknown) => getAllOf("gateRows")(o) } }));
vi.mock("@/generated/services/Vsb_projectstatetrackingnotesService", () => ({ Vsb_projectstatetrackingnotesService: { getAll: (o: unknown) => getAllOf("stateNotes")(o) } }));
vi.mock("@/generated/services/Vsb_projectchecklisttrackingnotesService", () => ({ Vsb_projectchecklisttrackingnotesService: { getAll: (o: unknown) => getAllOf("taskNotes")(o) } }));
vi.mock("./adminGatesApprovals", () => ({
  findScopeCountryTechId: (c: string, t: number) => svc.scope(c, t),
  getEntraPeople: (ids: readonly string[]) => svc.entra(ids),
  listChecklistApprovals: (ids: readonly string[]) => svc.approvals(ids),
  listGateApprovals: (c: string, t: number) => svc.gates(c, t),
}));
vi.mock("./projectStatesRead", () => ({ listProjectStates: () => svc.states() }));

import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import {
  countClusterChecklistRows, listChecklistApprovalSettings, listChecklistGates, listChecklistProjectStates,
  listChecklistTrackings, listClusterChecklist, listClusterTemplates, listHistory, loadChecklistProject,
} from "./checklist";
import { resetChecklistPeopleCache } from "./checklistPeople";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown[]) => ({ success: true, data });
type Query = { select?: string[]; filter?: string; orderBy?: string[]; top?: number };
const queries = (name: string): Query[] => getAllOf(name).mock.calls.map((c) => c[0] as Query);
const MODE = CHOICE_PROCESS.approvalMode;

beforeEach(() => {
  resetChecklistPeopleCache(); // D138 (A2): the people answers are shared between reads; each test starts empty
  for (const f of Object.values(svc.fns)) f.mockReset();
  for (const f of [svc.scope, svc.entra, svc.approvals, svc.gates, svc.states]) f.mockReset();
  svc.entra.mockResolvedValue(new Map());
});

describe("the project, the states and the trackings", () => {
  it("UT-CHKDATA-001 loadChecklistProject reads ONE row by id with the columns the screen branches on, and maps it", async () => {
    getAllOf("projects").mockResolvedValueOnce(ok([{
      vsb_projectid: PROJECT, vsb_name: "DE-0001", vsb_projectname: "Nord", vsb_startcluster: 2, _vsb_country_value: id(9),
      vsb_technology: CHOICE_PROCESS.technology.wind, _owningbusinessunit_value: id(5), _vsb_clusterstate_value: id(7),
    }]));
    const p = await loadChecklistProject(PROJECT);
    const [q] = queries("projects");
    expect(q!.filter).toBe(`vsb_projectid eq ${PROJECT}`);
    expect(q!.top).toBe(1);
    expect(q!.select).toEqual(expect.arrayContaining(["_owningbusinessunit_value", "_vsb_country_value", "_vsb_clusterstate_value"]));
    expect(p).toMatchObject({ id: PROJECT, projectNumber: "DE-0001", projectName: "Nord", owningBusinessUnitId: id(5), countryId: id(9) });
  });

  it("UT-CHKDATA-002 a project that does not exist is null", async () => {
    getAllOf("projects").mockResolvedValueOnce(ok([]));
    expect(await loadChecklistProject(PROJECT)).toBeNull();
  });

  it("UT-CHKDATA-003 a failed read throws (rule 3: never an empty answer), for the project and for the trackings", async () => {
    getAllOf("projects").mockResolvedValueOnce({ success: false, error: new Error("403") });
    await expect(loadChecklistProject(PROJECT)).rejects.toThrow();
    getAllOf("trackings").mockResolvedValueOnce({ success: false, error: new Error("500") });
    await expect(listChecklistTrackings(PROJECT)).rejects.toThrow();
  });

  it("UT-CHKDATA-004 the states come from the shared Project States read with a null description defaulted", async () => {
    svc.states.mockResolvedValueOnce([{ id: "s1", name: "Draft", order: 0, isVisibleOnChecklist: true, clusterDescription: undefined }]);
    expect(await listChecklistProjectStates()).toEqual([
      { id: "s1", name: "Draft", order: 0, isVisibleOnChecklist: true, clusterDescription: null },
    ]);
  });

  it("UT-CHKDATA-005 listChecklistTrackings filters the project on the server and selects the flow and persona columns", async () => {
    getAllOf("trackings").mockResolvedValueOnce(ok([{
      vsb_projectstatetrackingid: id(1), vsb_name: "Draft", _vsb_clusterstate_value: id(2), vsb_approvalclusterstate: 952850001,
      vsb_flowrunid: "run",
    }]));
    const rows = await listChecklistTrackings(PROJECT);
    const [q] = queries("trackings");
    expect(q!.filter).toBe(`_vsb_project_value eq ${PROJECT}`);
    expect(q!.select).toEqual(expect.arrayContaining(["vsb_flowrunid", "vsb_flowapprovalid", "vsb_lasttriggeredapprovalpersonas"]));
    expect(rows[0]).toMatchObject({ id: id(1), clusterStateId: id(2), approvalClusterState: 952850001, flowRunId: "run" });
  });
});

describe("the gates", () => {
  const gateRow = (n: number, over: Record<string, unknown> = {}) => ({
    id: id(n), clusterStateId: id(20 + n), approvalMode: MODE.formalApproval, gateActive: true, portfolioManagerId: id(30 + n),
    defaultApprovals: null, defaultContributors: null, defaultNotifications: null, ...over,
  });

  it("UT-CHKDATA-006 with a country and a technology the shared gate read is used and inactive gates are dropped", async () => {
    svc.gates.mockResolvedValueOnce([gateRow(1), gateRow(2, { gateActive: false })]);
    svc.entra.mockResolvedValueOnce(new Map([[id(31), { mail: "pm@vsb.energy" }]]));
    const gates = await listChecklistGates({ countryId: id(9), technology: CHOICE_PROCESS.technology.wind });
    expect(svc.gates).toHaveBeenCalledWith(id(9), CHOICE_PROCESS.technology.wind);
    expect(getAllOf("gateRows")).not.toHaveBeenCalled();
    expect(gates.map((g) => g.id)).toEqual([id(1)]);
    expect(gates[0]!.portfolioManagerMail).toBe("pm@vsb.energy");
  });

  it("UT-CHKDATA-007 a blank country or technology drops its clause and reads the active gate rows directly", async () => {
    getAllOf("gateRows").mockResolvedValue(ok([{
      vsb_projectdefaultapprovalsid: id(1), _vsb_clusterstate_value: id(21), vsb_approvalmodecode: MODE.onlyNotifications,
      vsb_gateactive: true, _vsb_approvalparticipant1_value: id(31),
    }]));
    const noCountry = await listChecklistGates({ countryId: null, technology: CHOICE_PROCESS.technology.wind });
    expect(svc.gates).not.toHaveBeenCalled();
    const [q1] = queries("gateRows");
    expect(q1!.filter).toBe(`(vsb_gateactive eq true) and (vsb_technologycode eq ${CHOICE_PROCESS.technology.wind})`);
    expect(q1!.orderBy).toEqual(["createdon asc"]);
    expect(noCountry[0]).toMatchObject({ id: id(1), approvalMode: MODE.onlyNotifications, gateActive: true });
    await listChecklistGates({ countryId: id(9), technology: null });
    expect(queries("gateRows")[1]!.filter).toBe(`(vsb_gateactive eq true) and (_vsb_approvalscountry_value eq ${id(9)})`);
    await listChecklistGates({ countryId: null, technology: null });
    expect(queries("gateRows")[2]!.filter).toBe("vsb_gateactive eq true");
  });

  it("UT-CHKDATA-008 C2: a failed Entra lookup does not take the gates down; only that person's mail is lost", async () => {
    svc.gates.mockResolvedValueOnce([gateRow(1), gateRow(2)]);
    svc.entra.mockImplementation(async (ids) => {
      if (ids[0] === id(32)) throw new Error("Graph 503");
      return new Map([[ids[0]!, { mail: "one@vsb.energy" }]]);
    });
    const gates = await listChecklistGates({ countryId: id(9), technology: CHOICE_PROCESS.technology.pv });
    expect(gates).toHaveLength(2);
    expect(gates.find((g) => g.id === id(1))!.portfolioManagerMail).toBe("one@vsb.energy");
    expect(gates.find((g) => g.id === id(2))!.portfolioManagerMail).toBeNull();
    expect(gates.every((g) => g.approvalMode === MODE.formalApproval)).toBe(true);
  });
});

describe("the checklist rows and the templates", () => {
  it("UT-CHKDATA-009 listClusterChecklist reads the project's ACTIVE rows of one cluster in Order", async () => {
    getAllOf("rows").mockResolvedValueOnce(ok([{
      vsb_projectchecklistid: id(1), vsb_name: "Land", vsb_order: 2, vsb_taskstate: CHOICE_PROCESS.taskState.completed,
      vsb_projectdefaultchecklist: id(8), vsb_comments: "n",
    }]));
    const rows = await listClusterChecklist(PROJECT, id(2));
    const [q] = queries("rows");
    expect(q!.filter).toBe(`((_vsb_project_value eq ${PROJECT}) and (_vsb_clusterstate_value eq ${id(2)})) and (statecode eq 0)`);
    expect(q!.orderBy).toEqual(["vsb_order asc"]);
    expect(rows[0]).toMatchObject({ id: id(1), title: "Land", sort: 2, projectDefaultChecklistId: id(8), note: "n" });
  });

  it("UT-CHKDATA-010 the materialisation guard counts rows of ANY status (no statecode clause) and asks for one row", async () => {
    getAllOf("rows").mockResolvedValueOnce(ok([{ vsb_projectchecklistid: id(1) }]));
    expect(await countClusterChecklistRows(PROJECT, id(2))).toBe(1);
    const [q] = queries("rows");
    expect(q!.filter).not.toContain("statecode");
    expect(q!.top).toBe(1);
    expect(q!.select).toEqual(["vsb_projectchecklistid"]);
    getAllOf("rows").mockResolvedValueOnce(ok([]));
    expect(await countClusterChecklistRows(PROJECT, id(2))).toBe(0);
  });

  it("UT-CHKDATA-011 the templates need the project's country AND technology and a scope row; none of them is an empty list, not an error", async () => {
    expect(await listClusterTemplates({ countryId: null, technology: CHOICE_PROCESS.technology.wind }, id(2))).toEqual([]);
    expect(await listClusterTemplates({ countryId: id(9), technology: null }, id(2))).toEqual([]);
    expect(svc.scope).not.toHaveBeenCalled();
    svc.scope.mockResolvedValueOnce(null);
    expect(await listClusterTemplates({ countryId: id(9), technology: CHOICE_PROCESS.technology.wind }, id(2))).toEqual([]);
    expect(getAllOf("templates")).not.toHaveBeenCalled();
  });

  it("UT-CHKDATA-012 with a scope row the templates are filtered on the server: Active, the cluster and the scope, in Order", async () => {
    svc.scope.mockResolvedValueOnce(id(40));
    getAllOf("templates").mockResolvedValueOnce(ok([{
      vsb_projectdefaultchecklistsid: id(1), vsb_name: "Land", _vsb_clusterstate_value: id(2), vsb_gaterelevance: true, vsb_order: 3,
    }]));
    const t = await listClusterTemplates({ countryId: id(9), technology: CHOICE_PROCESS.technology.wind }, id(2));
    expect(svc.scope).toHaveBeenCalledWith(id(9), CHOICE_PROCESS.technology.wind);
    const [q] = queries("templates");
    expect(q!.filter).toContain("statecode eq 0");
    expect(q!.filter).toContain(`_vsb_clusterstate_value eq ${id(2)}`);
    expect(q!.filter).toContain(`_vsb_associatedcountryandtechnology_value eq ${id(40)}`);
    expect(q!.orderBy).toEqual(["vsb_order asc"]);
    expect(t[0]).toMatchObject({ id: id(1), name: "Land", gateRelevance: true, order: 3 });
  });
});

describe("the approval settings and the history", () => {
  const approval = (n: number, over: Record<string, unknown> = {}) => ({
    id: id(n), projectDefaultChecklistId: id(50 + n), approvalMode: MODE.formalApproval, gateActive: true,
    portfolioManagerId: id(60 + n), defaultApprovers: null, defaultContributors: null, defaultNotifications: null, ...over,
  });

  it("UT-CHKDATA-013 the settings map the shared rows, active AND inactive, with the Portfolio Manager's mail", async () => {
    svc.approvals.mockResolvedValueOnce([approval(1), approval(2, { gateActive: false })]);
    svc.entra.mockResolvedValue(new Map([[id(61), { mail: "pm1@vsb.energy" }]]));
    const out = await listChecklistApprovalSettings([id(51), id(52)]);
    expect(svc.approvals).toHaveBeenCalledWith([id(51), id(52)]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: id(1), approvalMode: MODE.formalApproval, gateActive: true, portfolioManagerMail: "pm1@vsb.energy" });
    expect(out[1]!.gateActive).toBe(false);
  });

  it("UT-CHKDATA-014 C1: a failed Entra lookup keeps the approval MODE (it decides whether a task needs approval); only the mail is lost", async () => {
    svc.approvals.mockResolvedValueOnce([approval(1)]);
    svc.entra.mockRejectedValue(new Error("Graph down"));
    const out = await listChecklistApprovalSettings([id(51)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ approvalMode: MODE.formalApproval, gateActive: true, portfolioManagerMail: null });
  });

  it("UT-CHKDATA-015 a failure of the approval rows themselves still rejects, so the screen can say so", async () => {
    svc.approvals.mockRejectedValueOnce(new Error("403"));
    await expect(listChecklistApprovalSettings([id(51)])).rejects.toThrow("403");
  });

  it("UT-CHKDATA-016 the history reads the tracking's notes for a cluster panel and the task's notes for a checklist panel, newest first", async () => {
    getAllOf("stateNotes").mockResolvedValueOnce(ok([{ vsb_projectstatetrackingnoteid: id(1), vsb_comment: "moved", createdon: "2026-11-02T10:00:00Z" }]));
    const cluster = await listHistory({
      entitySet: ES.projectStateTrackingNotes, lookupColumn: "_vsb_projectstatetracking_value", lookupValue: id(3), orderBy: "createdon desc",
    });
    expect(queries("stateNotes")[0]).toMatchObject({ filter: `_vsb_projectstatetracking_value eq ${id(3)}`, orderBy: ["createdon desc"] });
    expect(cluster[0]).toMatchObject({ id: id(1), comment: "moved" });
    expect(getAllOf("taskNotes")).not.toHaveBeenCalled();

    getAllOf("taskNotes").mockResolvedValueOnce(ok([{ vsb_projectchecklisttrackingnoteid: id(2), vsb_name: "Completed" }]));
    const task = await listHistory({
      entitySet: "vsb_projectchecklisttrackingnotes", lookupColumn: "_vsb_projectchecklist_value", lookupValue: id(4), orderBy: "createdon desc",
    });
    expect(queries("taskNotes")[0]).toMatchObject({ filter: `_vsb_projectchecklist_value eq ${id(4)}` });
    expect(task[0]).toMatchObject({ id: id(2), name: "Completed" });
  });
});
