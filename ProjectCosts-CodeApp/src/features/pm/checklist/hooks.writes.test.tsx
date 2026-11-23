// @vitest-environment jsdom
/**
 * UT-CHKHOOK-001.. — the REAL `useChecklistWrites` and `useChecklistOrchestration` of `hooks.ts` (checklist analysis C11, CT-1).
 * `hooks.ts` was at 0 % because every Screen test mocks it whole. Here `usePlanWrite`, `qk`, `rules.ts` and the plans are the real
 * ones; the Dataverse loaders (`@/data/checklist`), the cloud flows (`@/data/flows`) and `executePlan` (the sender) are stubbed.
 * The stub answers a refused plan with the real `PlanRefusedError`, so a stale-state refusal behaves as it does in the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  sent: [] as unknown[],
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  rows: vi.fn<(id: string, state: string) => Promise<unknown[]>>(),
  count: vi.fn<(id: string, state: string) => Promise<number>>(),
  templates: vi.fn<(p: unknown, state: string) => Promise<unknown[]>>(),
  requestGate: vi.fn(async (_a: unknown) => ({ runid: "run", approvalid: "ap" })),
  requestChecklist: vi.fn(async (_a: unknown) => ({ runid: "run", approvalid: "ap" })),
  cancelGate: vi.fn(async (_a: unknown) => {}),
  cancelChecklist: vi.fn(async (_id: string) => ({ success: true })),
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan) => {
      if (plan.refusedReason) throw new mod.PlanRefusedError(plan.refusedReason);
      h.sent.push(plan);
      return { done: plan.writes.length, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] };
    }),
  };
});
vi.mock("@/data/checklist", () => ({
  listChecklistTrackings: (id: string) => h.trackings(id),
  listClusterChecklist: (id: string, state: string) => h.rows(id, state),
  // OPT-24 (S4-12, B6): the narrow reads answer from the same fixtures the cluster / tracking lists give.
  readClusterTask: async (id: string, state: string, rowId: string) => ((await h.rows(id, state)) as { id: string }[]).find((r) => r.id === rowId) ?? null,
  readClusterTracking: async (id: string, state: string) => ((await h.trackings(id)) as { clusterStateId: string | null }[]).find((t) => t.clusterStateId === state) ?? null,
  countClusterChecklistRows: (id: string, state: string) => h.count(id, state),
  listClusterTemplates: (p: unknown, state: string) => h.templates(p, state),
  listChecklistApprovalSettings: vi.fn(), listChecklistGates: vi.fn(), listChecklistProjectStates: vi.fn(),
  listHistory: vi.fn(), loadChecklistProject: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: h.requestGate, requestChecklistApproval: h.requestChecklist,
  cancelGateApproval: h.cancelGate, cancelChecklistApproval: h.cancelChecklist,
}));

import { executePlan } from "@/data/executePlan";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { CHECKLIST_PERF_ALL_OFF, setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import {
  APP_ID_MSG, STALE_MSG, type ChecklistProject, type ChecklistRow, type SequenceEntry, type TrackingRow,
} from "./rules";
import { checklistWriteKeys, useChecklistOrchestration, useChecklistWrites } from "./hooks";

const A = CHOICE_PROCESS.approvalClusterState;
const PROJECT = "11111111-1111-1111-1111-111111111111";
const project: ChecklistProject = {
  id: PROJECT, projectName: "Windpark Nord", projectNumber: "DE-1", startCluster: 0, clusterStateId: "ps-1", clusterStateName: "Cluster 1",
  approvalState: null, countryId: "c-de", technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: "bu-de", totalCapacity: 1,
  netYieldP50: 1,
  milestones: {
    projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};
const state = (o: Partial<SequenceEntry> = {}): SequenceEntry => ({
  id: "ps-1", name: "Cluster 1", clusterNo: 1, rowNumber: 1, clusterDescription: null, hasGate: false, gateId: null, ...o,
});
const tracking = (o: Partial<TrackingRow> = {}): TrackingRow => ({
  id: "t-1", name: "Cluster 1", clusterStateId: "ps-1", clusterStateName: "Cluster 1", approvalClusterState: A.inProgress,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null, ...o,
});
const row = (o: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: "cl-1", title: "Land secured", clusterStateId: "ps-1", gateRelevance: true, holdingDescription: null, isCompletionDate: false,
  completionDate: null, taskState: null, approvalChecklistState: A.notStarted, note: null, sort: 1, projectDefaultChecklistId: "tpl-1",
  flowRunId: null, flowApprovalId: null, ...o,
});

function writesHook() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useChecklistWrites(PROJECT), { wrapper }), spy };
}
const invalidated = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
const sentPlans = () => h.sent as WritePlan[];

beforeEach(() => {
  h.sent = [];
  vi.mocked(executePlan).mockClear();
  for (const f of [h.trackings, h.rows, h.count, h.templates]) f.mockReset();
  for (const f of [h.requestGate, h.requestChecklist, h.cancelGate, h.cancelChecklist]) f.mockClear();
  h.trackings.mockResolvedValue([tracking()]);
  h.rows.mockResolvedValue([row()]);
  h.count.mockResolvedValue(3);
  h.templates.mockResolvedValue([]);
});
// D150: a test that runs with the switches off puts them back for the next one.
afterEach(() => { setChecklistPerfFlags(null); });

describe("the write hook's refresh and prepareCluster (C5)", () => {
  it("UT-CHKHOOK-001 a write refreshes the project, trackings, rows, approvals and history plus the other screens' copies, and NOT the states, gates or Entra data", async () => {
    const keys = checklistWriteKeys(PROJECT);
    expect(keys).toEqual([
      qk.checklist(PROJECT, "project"), qk.checklist(PROJECT, "trackings"), qk.checklist(PROJECT, "rows"),
      qk.checklist(PROJECT, "approvals"), qk.checklist(PROJECT, "history"),
      qk.project(PROJECT), qk.generalDataProject(PROJECT), qk.stateTrackings(PROJECT), qk.milestoneProject(PROJECT),
    ]);
    const parts = keys.filter((k) => k[0] === "pmChecklist").map((k) => k[2]);
    expect(parts).not.toContain("states");
    expect(parts).not.toContain("gates");
    expect(keys).not.toContainEqual(qk.checklistAll(PROJECT));

    // D150: this is the behaviour of `targetedReload` OFF (the rollback); with it ON a row patch reloads the rows only (UT-CHKHOOK-018).
    setChecklistPerfFlags(CHECKLIST_PERF_ALL_OFF);
    const { result, spy } = writesHook();
    await act(async () => { await result.current.patchRow(row(), { vsb_taskstate: 1 }, { progress: "go", error: (d) => d }); });
    expect(invalidated(spy)).toEqual(keys);
    // The command bar's Refresh still refreshes everything.
    spy.mockClear();
    await act(async () => { await result.current.refresh(); });
    expect(invalidated(spy)).toEqual([qk.checklistAll(PROJECT)]);
  });

  it("UT-CHKHOOK-002 a visit that has nothing to write skips the write job: no plan sent, no overlay, no refresh", async () => {
    const { result, spy } = writesHook();
    let out: string[] | null = null;
    await act(async () => { out = await result.current.prepareCluster(project, state()); });
    expect(out).toEqual([]);
    expect(h.count).toHaveBeenCalledWith(PROJECT, "ps-1");
    expect(h.templates).not.toHaveBeenCalled();
    expect(executePlan).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("UT-CHKHOOK-003 an empty cluster with no tracking sends ONE plan: the tracking, then the template creates as one concurrent group", async () => {
    h.trackings.mockResolvedValue([]);
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([
      { id: "tpl-1", name: "A", clusterStateId: "ps-1", gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: 1 },
      { id: "tpl-2", name: "B", clusterStateId: "ps-1", gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: 2 },
    ]);
    const { result, spy } = writesHook();
    await act(async () => { await result.current.prepareCluster(project, state()); });
    expect(executePlan).toHaveBeenCalledTimes(1);
    const [plan] = sentPlans();
    expect(plan!.writes.map((w) => w.entitySet)).toEqual([ES.projectStateTrackings, ES.projectChecklists, ES.projectChecklists]);
    expect(plan!.writes.slice(1).every((w) => w.concurrent === true)).toBe(true);
    expect(invalidated(spy)).toEqual(checklistWriteKeys(PROJECT));
  });

  it("UT-CHKHOOK-004 a failed read of the visit is the job's error, shown like a failed write (rule 3: never silent)", async () => {
    h.count.mockRejectedValue(new Error("HTTP 503"));
    const { result } = writesHook();
    let out: string[] | null = ["untouched"];
    await act(async () => { out = await result.current.prepareCluster(project, state()); });
    expect(out).toBeNull();
    expect(result.current.error).toContain("HTTP 503");
    expect(executePlan).not.toHaveBeenCalled();
  });
});

describe("stale-state refusals (C6)", () => {
  it("UT-CHKHOOK-005 Save is refused, with nothing sent, when the fresh read no longer shows the cluster In Progress", async () => {
    h.trackings.mockResolvedValue([tracking({ approvalClusterState: A.completed })]);
    const { result } = writesHook();
    let out: string[] | null = ["x"];
    await act(async () => {
      out = await result.current.saveTransition({ project, state: state(), next: state({ id: "ps-2", name: "Cluster 2" }), comment: "go", approvalDueDate: null });
    });
    expect(out).toBeNull();
    expect(result.current.error).toContain(STALE_MSG.saveNotInProgress("Cluster 1"));
    expect(h.sent).toEqual([]);
  });

  it("UT-CHKHOOK-006 Save with the cluster still In Progress sends the move, with the tracking updates guarded", async () => {
    const { result } = writesHook();
    await act(async () => {
      await result.current.saveTransition({ project, state: state(), next: state({ id: "ps-2", name: "Cluster 2" }), comment: "go", approvalDueDate: null });
    });
    expect(result.current.error).toBeNull();
    const [plan] = sentPlans();
    expect(plan!.writes.find((w) => w.reason === "Cluster 1 → Completed")?.guarded).toBe(true);
    expect(plan!.writes.at(-1)).toMatchObject({ entitySet: ES.projects, op: "update" });
  });

  it("UT-CHKHOOK-007 Reset is refused for a cluster that is no longer In Progress, Rejected or Request canceled", async () => {
    h.trackings.mockResolvedValue([tracking({ approvalClusterState: A.notStarted })]);
    const { result } = writesHook();
    await act(async () => { await result.current.returnToPrevious({ project, state: state(), previous: state({ id: "ps-0", name: "Draft", clusterNo: 0 }) }); });
    expect(result.current.error).toContain(STALE_MSG.returnNotResettable("Cluster 1"));
    expect(h.sent).toEqual([]);
  });

  it("UT-CHKHOOK-008 Request Approval (cluster) is refused while an approval is running: no patch, no flow call, no second mail", async () => {
    h.trackings.mockResolvedValue([tracking({ approvalClusterState: A.inProgress, flowRunId: "run-1" })]);
    const { result } = writesHook();
    await act(async () => {
      await result.current.requestApproval({ kind: "cluster", project, state: state({ hasGate: true, gateId: "g-1" }), gate: null, comment: "x", approvalDueDate: null });
    });
    expect(result.current.error).toContain(STALE_MSG.clusterRequestStale("Cluster 1"));
    expect(h.sent).toEqual([]);
    expect(h.requestGate).not.toHaveBeenCalled();
  });

  it("UT-CHKHOOK-009 Request Approval (cluster) on an open cluster patches, calls the flow with the tracking id, then writes the note", async () => {
    const { result } = writesHook();
    await act(async () => {
      await result.current.requestApproval({ kind: "cluster", project, state: state({ hasGate: true, gateId: "g-1" }), gate: null, comment: "x", approvalDueDate: null });
    });
    expect(result.current.error).toBeNull();
    expect(h.requestGate).toHaveBeenCalledWith({ projectId: PROJECT, stateId: "ps-1", stateTrackingId: "t-1", defaultApprovalId: "g-1" });
    expect(sentPlans()).toHaveLength(2);
    expect(sentPlans()[0]!.writes[0]).toMatchObject({ op: "update", guarded: true });
    expect(sentPlans()[1]!.writes[0]!.entitySet).toBe(ES.projectStateTrackingNotes);
  });

  it("UT-CHKHOOK-010 Request Approval (checklist) re-reads the task and refuses one that is already requested; an open one runs the flow", async () => {
    h.rows.mockResolvedValue([row({ approvalChecklistState: A.inProgress })]);
    const req = {
      kind: "checklist" as const, project, row: row(), checkListDefaultApprovalId: "cda-1", currentStateId: "ps-1",
      approvalRequested: true, comment: "x", approvalDueDate: null,
    };
    const { result } = writesHook();
    await act(async () => { await result.current.requestApproval(req); });
    expect(result.current.error).toContain(STALE_MSG.taskRequestStale("Land secured"));
    expect(h.requestChecklist).not.toHaveBeenCalled();
    expect(h.sent).toEqual([]);

    h.rows.mockResolvedValue([row()]);
    await act(async () => { await result.current.requestApproval(req); });
    expect(h.requestChecklist).toHaveBeenCalledWith({
      projectId: PROJECT, checklistId: "cl-1", checkListDefaultApprovalId: "cda-1", currentProjectStateId: "ps-1",
    });
  });
});

describe("cancel flows (C7)", () => {
  const cancelReq = (appId: string) => ({
    project, state: state(), gate: null, previous: null, next: null, comment: "wrong", userDisplayName: "Ada", appId,
  });

  it("UT-CHKHOOK-011 a blank app id is refused BEFORE anything is read or patched, and the flow is not called", async () => {
    const { result } = writesHook();
    await act(async () => { await result.current.cancelGateApproval(cancelReq("")); });
    expect(result.current.error).toContain(APP_ID_MSG);
    expect(h.trackings).not.toHaveBeenCalled();
    expect(h.sent).toEqual([]);
    expect(h.cancelGate).not.toHaveBeenCalled();
  });

  it("UT-CHKHOOK-012 with an app id the tracking is patched, the flow gets the id, then the note is written", async () => {
    h.trackings.mockResolvedValue([tracking({ flowRunId: "run-1", flowApprovalId: "ap-1" })]);
    const { result } = writesHook();
    await act(async () => { await result.current.cancelGateApproval(cancelReq("app-1")); });
    expect(result.current.error).toBeNull();
    expect(h.cancelGate).toHaveBeenCalledWith(expect.objectContaining({ appId: "app-1" }));
    expect(sentPlans().map((p) => p.writes[0]!.entitySet)).toEqual([ES.projectStateTrackings, ES.projectStateTrackingNotes]);
  });

  it("UT-CHKHOOK-013 the row's cancel flow answering false is reported and nothing is written", async () => {
    h.cancelChecklist.mockResolvedValueOnce({ success: false });
    const { result } = writesHook();
    await act(async () => { await result.current.cancelChecklistApproval(row()); });
    expect(result.current.error).toContain("could not be cancelled");
    // The job's own plan is empty (the flow does the work); no write follows the failed flow.
    expect(sentPlans().every((p) => p.writes.length === 0)).toBe(true);
  });
});

describe("the OnVisible orchestration (C10)", () => {
  const trackingsBehind = [tracking({ clusterStateId: "ps-0", approvalClusterState: A.notStarted })];
  const states = [
    { id: "ps-0", name: "Draft", order: 0, isVisibleOnChecklist: true, clusterDescription: null },
    { id: "ps-1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true, clusterDescription: null },
  ];
  const mkWrites = (backfillResult: string[] | null) => ({
    backfill: vi.fn(async () => backfillResult),
    prepareCluster: vi.fn(async () => [] as string[] | null),
  });
  type Args = Parameters<typeof useChecklistOrchestration>[0];
  const render = (writes: Args["writes"], over: Partial<Args> = {}) => {
    const args: Args = {
      project: { ...project, startCluster: 0, clusterStateName: "Draft" }, states, trackings: [tracking({ clusterStateId: "ps-0", name: "Draft", approvalClusterState: A.inProgress }), tracking({ id: "t-1", clusterStateId: "ps-1", approvalClusterState: A.notStarted })],
      sequenceReady: true, selected: state(), writes, ...over,
    };
    return renderHook((a: Args) => useChecklistOrchestration(a), { initialProps: args });
  };

  it("UT-CHKHOOK-014 the cluster is prepared once per visit, however often the screen renders", async () => {
    const writes = mkWrites([]);
    const { rerender } = render(writes);
    await waitFor(() => expect(writes.prepareCluster).toHaveBeenCalledTimes(1));
    rerender({ project, states, trackings: [], sequenceReady: true, selected: state(), writes } as Args);
    rerender({ project, states, trackings: [], sequenceReady: true, selected: state(), writes } as Args);
    expect(writes.prepareCluster).toHaveBeenCalledTimes(1);
    expect(writes.prepareCluster).toHaveBeenCalledWith(expect.objectContaining({ id: PROJECT }), expect.objectContaining({ id: "ps-1" }));
  });

  it("UT-CHKHOOK-015 nothing starts until the sequence is ready, and Refresh (restart) runs the visit again", async () => {
    const writes = mkWrites([]);
    const { result, rerender } = render(writes, { sequenceReady: false });
    expect(writes.prepareCluster).not.toHaveBeenCalled();
    expect(writes.backfill).not.toHaveBeenCalled();
    const ready: Args = { project, states, trackings: [tracking()], sequenceReady: true, selected: state(), writes };
    rerender(ready);
    await waitFor(() => expect(writes.prepareCluster).toHaveBeenCalledTimes(1));
    act(() => { result.current.restart(); });
    // In the screen the Refresh's refetch hands the hook new arrays; that is what lets the visit start again.
    rerender({ ...ready, trackings: [tracking()] });
    await waitFor(() => expect(writes.prepareCluster).toHaveBeenCalledTimes(2));
  });

  it("UT-CHKHOOK-016 a needed back-fill runs first and the cluster is prepared only after it succeeded", async () => {
    const order: string[] = [];
    const writes = {
      backfill: vi.fn(async () => { order.push("backfill"); return [] as string[]; }),
      prepareCluster: vi.fn(async () => { order.push("prepare"); return [] as string[]; }),
    };
    render(writes, { project: { ...project, startCluster: 2, clusterStateName: "Draft" }, trackings: trackingsBehind });
    await waitFor(() => expect(writes.prepareCluster).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["backfill", "prepare"]);
    expect(writes.backfill).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKHOOK-017 CW-2: a FAILED back-fill is not followed by a prepare job (whose run() would clear the error)", async () => {
    const writes = mkWrites(null);
    render(writes, { project: { ...project, startCluster: 2, clusterStateName: "Draft" }, trackings: trackingsBehind });
    await waitFor(() => expect(writes.backfill).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(writes.prepareCluster).not.toHaveBeenCalled();
  });
});
