// @vitest-environment jsdom
/**
 * UT-CHKCOPY-010.. — D158 (`completeCopy`) through the REAL write hook: a visit to a cluster that has rows but is missing some of its
 * templates completes the copy for the missing ones only, and does nothing in every other case. Same stubs as `hooks.perf.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  sent: [] as unknown[],
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  count: vi.fn<(id: string, state: string) => Promise<number>>(),
  probe: vi.fn<(id: string, state: string) => Promise<unknown[]>>(),
  templates: vi.fn<(p: unknown, state: string) => Promise<unknown[]>>(),
  approvals: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan) => {
      h.sent.push(plan);
      return { done: plan.writes.length, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] };
    }),
  };
});
vi.mock("@/data/checklist", () => ({
  listChecklistTrackings: (id: string) => h.trackings(id),
  countClusterChecklistRows: (id: string, state: string) => h.count(id, state),
  listClusterCopyProbe: (id: string, state: string) => h.probe(id, state),
  listClusterTemplates: (p: unknown, state: string) => h.templates(p, state),
  listChecklistApprovalSettings: (ids: readonly string[]) => h.approvals(ids),
  listClusterChecklist: vi.fn(), listChecklistGates: vi.fn(), listChecklistProjectStates: vi.fn(), listHistory: vi.fn(), loadChecklistProject: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));

import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import type { ChecklistProject, ChecklistRow, DefaultChecklistTemplate, SequenceEntry, TrackingRow } from "./rules";
import { useChecklistWrites } from "./hooks";

const A = CHOICE_PROCESS.approvalClusterState;
const TASK = CHOICE_PROCESS.taskState;
const PROJECT = "11111111-1111-1111-1111-111111111111";
const BU = "22222222-2222-2222-2222-222222222222";
const project: ChecklistProject = {
  id: PROJECT, projectName: "Windpark Nord", projectNumber: "DE-1", startCluster: 0, clusterStateId: "ps-1", clusterStateName: "Cluster 1",
  approvalState: null, countryId: "c-de", technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: BU, totalCapacity: 1, netYieldP50: 1,
  milestones: {
    projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};
const cluster: SequenceEntry = { id: "ps-2", name: "Cluster 2", clusterNo: 2, rowNumber: 2, clusterDescription: null, hasGate: false, gateId: null };
const tracking = (state: number): TrackingRow => ({
  id: "t-2", name: "Cluster 2", clusterStateId: "ps-2", clusterStateName: "Cluster 2", approvalClusterState: state,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
});
const tpl = (n: number): DefaultChecklistTemplate => ({
  id: `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`, name: `Task ${n}`, clusterStateId: "ps-2",
  gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: n,
});
const ten = Array.from({ length: 10 }, (_, i) => tpl(i + 1));
const probeRow = (n: number, over: Record<string, unknown> = {}) => ({ templateId: tpl(n).id, taskState: TASK.none, comment: null, approvalChecklistState: null, ...over });
const sevenOfTen = [1, 2, 3, 5, 6, 8, 9].map((n) => probeRow(n));

const sentPlans = () => h.sent as WritePlan[];
const createdTemplateIds = () => sentPlans().flatMap((p) => p.writes).filter((w) => w.entitySet === ES.projectChecklists).map((w) => w.data!["vsb_projectdefaultchecklist"]);

function hook(cached?: ChecklistRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (cached) qc.setQueryData(qk.checklist(PROJECT, "rows", "ps-2"), cached);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useChecklistWrites(PROJECT), { wrapper });
}
const visit = async (r: ReturnType<typeof hook>) => {
  let out: string[] | null = null;
  await act(async () => { out = await r.result.current.prepareCluster(project, cluster); });
  return out;
};
const shownRow = (over: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: "cl-1", title: "Task 1", clusterStateId: "ps-2", gateRelevance: false, holdingDescription: null, isCompletionDate: false,
  completionDate: null, taskState: null, approvalChecklistState: null, note: null, sort: 1, projectDefaultChecklistId: tpl(1).id,
  flowRunId: null, flowApprovalId: null, ...over,
});

beforeEach(() => {
  h.sent = [];
  for (const f of [h.trackings, h.count, h.probe, h.templates, h.approvals]) f.mockReset();
  h.trackings.mockResolvedValue([tracking(A.inProgress)]);
  h.count.mockResolvedValue(7);
  h.probe.mockResolvedValue(sevenOfTen);
  h.templates.mockResolvedValue(ten);
  h.approvals.mockResolvedValue([]);
});
afterEach(() => { setChecklistPerfFlags(null); });

describe("completing an interrupted copy through the hook (D158)", () => {
  it("UT-CHKCOPY-010 7 of 10 tasks exist and none was worked on: the visit creates exactly the 3 missing ones", async () => {
    await visit(hook());
    expect(h.probe).toHaveBeenCalledTimes(1);
    expect(h.templates).toHaveBeenCalledTimes(1);
    expect(sentPlans()).toHaveLength(1);
    expect(createdTemplateIds()).toEqual([tpl(4).id, tpl(7).id, tpl(10).id]);
    for (const w of sentPlans()[0]!.writes) {
      expect(w.data!["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BU})`);
    }
  });

  it("UT-CHKCOPY-011 a row of the cluster was worked on: nothing is sent and the templates are not even read", async () => {
    h.probe.mockResolvedValue([...sevenOfTen, probeRow(4, { taskState: TASK.completed })]);
    const out = await visit(hook());
    expect(out).toEqual([]);
    expect(h.templates).not.toHaveBeenCalled();
    expect(sentPlans()).toHaveLength(0);
  });

  it("UT-CHKCOPY-012 the rows already on screen show work: not even the probe is read (the usual worked-on cluster costs no extra request)", async () => {
    const out = await visit(hook([shownRow(), shownRow({ id: "cl-2", taskState: TASK.inProgress })]));
    expect(out).toEqual([]);
    expect(h.probe).not.toHaveBeenCalled();
    expect(h.templates).not.toHaveBeenCalled();
    expect(sentPlans()).toHaveLength(0);
  });

  it("UT-CHKCOPY-013 a Completed cluster is never topped up", async () => {
    h.trackings.mockResolvedValue([tracking(A.completed)]);
    await visit(hook());
    expect(h.probe).not.toHaveBeenCalled();
    expect(sentPlans()).toHaveLength(0);
  });

  it("UT-CHKCOPY-014 every template already has a task: no write job at all", async () => {
    h.probe.mockResolvedValue(ten.map((t) => ({ templateId: t.id, taskState: TASK.none, comment: null, approvalChecklistState: null })));
    const out = await visit(hook());
    expect(out).toEqual([]);
    expect(sentPlans()).toHaveLength(0);
  });

  it("UT-CHKCOPY-015 an EMPTY cluster is the normal first copy: every template, and the probe is never read", async () => {
    h.count.mockResolvedValue(0);
    h.trackings.mockResolvedValue([tracking(A.notStarted)]);
    await visit(hook());
    expect(h.probe).not.toHaveBeenCalled();
    expect(createdTemplateIds()).toEqual(ten.map((t) => t.id));
  });

  it("UT-CHKCOPY-016 a failed probe changes nothing: the visit goes on as the canvas does, with no error and no write", async () => {
    h.probe.mockRejectedValue(new Error("graph 500"));
    const out = await visit(hook());
    expect(out).toEqual([]);
    expect(sentPlans()).toHaveLength(0);
  });

  it("UT-CHKCOPY-017 with the switch off the cluster is left as it is (the canvas rule), and nothing extra is read", async () => {
    setChecklistPerfFlags({ completeCopy: false });
    const out = await visit(hook());
    expect(out).toEqual([]);
    expect(h.probe).not.toHaveBeenCalled();
    expect(sentPlans()).toHaveLength(0);
  });

  it("UT-CHKCOPY-018 running the visit again after the copy was completed finds nothing missing", async () => {
    await visit(hook());
    h.sent = [];
    h.probe.mockResolvedValue(ten.map((t) => ({ templateId: t.id, taskState: TASK.none, comment: null, approvalChecklistState: null })));
    await visit(hook());
    expect(sentPlans()).toHaveLength(0);
  });
});
