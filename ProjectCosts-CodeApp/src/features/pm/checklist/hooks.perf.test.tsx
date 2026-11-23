// @vitest-environment jsdom
/**
 * UT-CHKHOOK-018.. — what the REAL write hook (`useChecklistWrites`) reloads and reads ahead after the D150 changes: a row patch and a
 * template copy reload the rows only; every other job keeps the full list; the copy's approval settings and a Move's next-cluster
 * warm-up are read-only and never change a write. Same stubs as `hooks.writes.test.tsx` (the loaders, the flows and `executePlan`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  sent: [] as unknown[],
  release: null as null | (() => void),
  hold: false,
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  rows: vi.fn<(id: string, state: string) => Promise<unknown[]>>(),
  count: vi.fn<(id: string, state: string) => Promise<number>>(),
  templates: vi.fn<(p: unknown, state: string) => Promise<unknown[]>>(),
  approvals: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
  requestChecklist: vi.fn(async (_a: unknown) => ({ runid: "run", approvalid: "ap" })),
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan) => {
      if (plan.refusedReason) throw new mod.PlanRefusedError(plan.refusedReason);
      h.sent.push(plan);
      if (h.hold) await new Promise<void>((resolve) => { h.release = resolve; });
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
  listChecklistApprovalSettings: (ids: readonly string[]) => h.approvals(ids),
  listChecklistGates: vi.fn(), listChecklistProjectStates: vi.fn(), listHistory: vi.fn(), loadChecklistProject: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: h.requestChecklist, cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));

import { executePlan } from "@/data/executePlan";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { CHECKLIST_PERF_ALL_OFF, setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import type { ChecklistProject, ChecklistRow, SequenceEntry, TrackingRow } from "./rules";
import { checklistWriteKeys, useChecklistWrites } from "./hooks";

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
const tpl = (id: string, order: number) => ({ id, name: id, clusterStateId: "ps-2", gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order });

function writesHook() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useChecklistWrites(PROJECT), { wrapper }), spy };
}
const invalidated = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
const sentPlans = () => h.sent as WritePlan[];
const flush = () => act(async () => { await new Promise<void>((r) => { setTimeout(r, 0); }); });

beforeEach(() => {
  h.sent = []; h.hold = false; h.release = null;
  vi.mocked(executePlan).mockClear();
  for (const f of [h.trackings, h.rows, h.count, h.templates, h.approvals]) f.mockReset();
  h.requestChecklist.mockClear();
  h.trackings.mockResolvedValue([tracking()]);
  h.rows.mockResolvedValue([row()]);
  h.count.mockResolvedValue(3);
  h.templates.mockResolvedValue([]);
  h.approvals.mockResolvedValue([]);
});
afterEach(() => { setChecklistPerfFlags(null); });

describe("what a job reloads (targetedReload)", () => {
  it("UT-CHKHOOK-018 a row's Complete reloads the rows only; with the switch off it reloads the full list, as before", async () => {
    const run = async () => {
      const { result, spy } = writesHook();
      await act(async () => { await result.current.patchRow(row(), { vsb_taskstate: 1 }, { progress: "go", error: (d) => d }); });
      return invalidated(spy);
    };
    expect(await run()).toEqual([qk.checklist(PROJECT, "rows")]);
    // The write itself is the same single guarded update either way.
    expect(sentPlans()[0]!.writes).toHaveLength(1);
    expect(sentPlans()[0]!.writes[0]).toMatchObject({ op: "update", entitySet: ES.projectChecklists, id: "cl-1", guarded: true });
    setChecklistPerfFlags(CHECKLIST_PERF_ALL_OFF);
    expect(await run()).toEqual(checklistWriteKeys(PROJECT));
  });

  it("UT-CHKHOOK-019 the copy of the templates into a cluster whose tracking exists reloads the rows only; one that also creates the tracking reloads everything", async () => {
    h.trackings.mockResolvedValue([tracking({ id: "t-2", clusterStateId: "ps-2", approvalClusterState: A.notStarted })]);
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([tpl("tpl-1", 1), tpl("tpl-2", 2)]);
    const a = writesHook();
    await act(async () => { await a.result.current.prepareCluster(project, state({ id: "ps-2", name: "Cluster 2" })); });
    expect(sentPlans()[0]!.writes.map((w) => w.entitySet)).toEqual([ES.projectChecklists, ES.projectChecklists]);
    expect(invalidated(a.spy)).toEqual([qk.checklist(PROJECT, "rows")]);

    h.sent = [];
    h.trackings.mockResolvedValue([]);
    const b = writesHook();
    await act(async () => { await b.result.current.prepareCluster(project, state({ id: "ps-2", name: "Cluster 2" })); });
    expect(sentPlans()[0]!.writes.map((w) => w.entitySet)).toEqual([ES.projectStateTrackings, ES.projectChecklists, ES.projectChecklists]);
    expect(invalidated(b.spy)).toEqual(checklistWriteKeys(PROJECT));
  });

  it("UT-CHKHOOK-020 a job with a flow step keeps the full reload, although its first plan writes only a checklist row", async () => {
    const { result, spy } = writesHook();
    await act(async () => {
      await result.current.requestApproval({
        kind: "checklist", project, row: row(), checkListDefaultApprovalId: "cda-1", currentStateId: "ps-1", approvalRequested: true, comment: "x", approvalDueDate: null,
      });
    });
    expect(h.requestChecklist).toHaveBeenCalledTimes(1);
    expect(invalidated(spy)).toEqual(checklistWriteKeys(PROJECT));
  });

  it("UT-CHKHOOK-021 a Move to the next cluster keeps the full reload", async () => {
    const { result, spy } = writesHook();
    await act(async () => {
      await result.current.saveTransition({ project, state: state(), next: state({ id: "ps-2", name: "Cluster 2" }), comment: "go", approvalDueDate: null });
    });
    expect(invalidated(spy)).toEqual(checklistWriteKeys(PROJECT));
  });
});

describe("what is read ahead (prefetchCopy)", () => {
  const next = state({ id: "ps-2", name: "Cluster 2" });

  it("UT-CHKHOOK-027 the cached templates are keyed by the project's country and technology: a changed country reads them again", async () => {
    h.trackings.mockResolvedValue([tracking({ id: "t-2", clusterStateId: "ps-2", approvalClusterState: A.notStarted })]);
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([tpl("tpl-1", 1)]);
    const { result } = writesHook();
    await act(async () => { await result.current.prepareCluster(project, next); });
    await act(async () => { await result.current.prepareCluster(project, next); });
    expect(h.templates).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.prepareCluster({ ...project, countryId: "c-fr" }, next); });
    expect(h.templates).toHaveBeenCalledTimes(2);
  });

  it("UT-CHKHOOK-022 a Move warms the next cluster (count, templates); the visit then reuses the templates, counts the rows again and reads the settings while it copies", async () => {
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([tpl("tpl-b", 2), tpl("tpl-a", 1)]);
    h.trackings.mockResolvedValue([tracking(), tracking({ id: "t-2", clusterStateId: "ps-2", approvalClusterState: A.notStarted })]);
    const { result } = writesHook();
    await act(async () => { await result.current.saveTransition({ project, state: state(), next, comment: "go", approvalDueDate: null }); });
    await flush();
    expect(h.count).toHaveBeenCalledWith(PROJECT, "ps-2");
    expect(h.templates).toHaveBeenCalledTimes(1);
    // The Move's own reload invalidates every approvals key, so the settings are not warmed by the Move.
    expect(h.approvals).not.toHaveBeenCalled();

    await act(async () => { await result.current.prepareCluster(project, next); });
    // The settings are read for the templates' ids, sorted: the key the screen's own query uses once the copied rows arrive.
    expect(h.approvals).toHaveBeenCalledWith(["tpl-a", "tpl-b"]);
    expect(h.templates).toHaveBeenCalledTimes(1); // reused from the warm-up
    expect(h.count).toHaveBeenCalledTimes(2); // the guard's count stays a fresh read (D138)
    const copy = sentPlans().at(-1)!;
    expect(copy.writes.map((w) => w.entitySet)).toEqual([ES.projectChecklists, ES.projectChecklists]);
  });

  it("UT-CHKHOOK-023 the copy reads the approval settings WHILE it writes, not after", async () => {
    h.trackings.mockResolvedValue([tracking({ id: "t-2", clusterStateId: "ps-2", approvalClusterState: A.notStarted })]);
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([tpl("tpl-2", 2), tpl("tpl-1", 1)]);
    h.hold = true; // the write is in flight until released
    const { result } = writesHook();
    let done: Promise<unknown> | undefined;
    await act(async () => { done = result.current.prepareCluster(project, next); await flush(); });
    expect(h.sent).toHaveLength(1);
    expect(h.release).not.toBeNull(); // still writing
    expect(h.approvals).toHaveBeenCalledWith(["tpl-1", "tpl-2"]);
    await act(async () => { h.release!(); await done; });
  });

  it("UT-CHKHOOK-024 with the switch off nothing is read ahead: no count, templates or settings read for a Move, and the copy reads its own templates", async () => {
    setChecklistPerfFlags({ prefetchCopy: false });
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([tpl("tpl-1", 1)]);
    const { result } = writesHook();
    await act(async () => { await result.current.saveTransition({ project, state: state(), next, comment: "go", approvalDueDate: null }); });
    await flush();
    expect(h.count).not.toHaveBeenCalled();
    expect(h.templates).not.toHaveBeenCalled();
    expect(h.approvals).not.toHaveBeenCalled();
  });

  it("UT-CHKHOOK-025 a failed warm-up changes nothing: the Move is sent exactly as without it and no error is shown", async () => {
    h.count.mockRejectedValue(new Error("503"));
    const { result } = writesHook();
    await act(async () => { await result.current.saveTransition({ project, state: state(), next, comment: "go", approvalDueDate: null }); });
    await flush();
    expect(result.current.error).toBeNull();
    expect(sentPlans()).toHaveLength(1);
    expect(sentPlans()[0]!.writes.at(-1)).toMatchObject({ entitySet: ES.projects, op: "update" });
    expect(h.templates).not.toHaveBeenCalled();
  });

  it("UT-CHKHOOK-026 a next cluster that already has rows is not read further (no templates, no settings)", async () => {
    h.count.mockResolvedValue(12);
    const { result } = writesHook();
    await act(async () => { await result.current.saveTransition({ project, state: state(), next, comment: "go", approvalDueDate: null }); });
    await flush();
    expect(h.count).toHaveBeenCalledWith(PROJECT, "ps-2");
    expect(h.templates).not.toHaveBeenCalled();
    expect(h.approvals).not.toHaveBeenCalled();
  });
});
