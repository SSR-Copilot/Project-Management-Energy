// @vitest-environment jsdom
/**
 * Optimization programme B6, OPT-24 (S4-12): the transition wait after an Only Notifications gate request polls ONE tracking.
 *
 * OLD (recorded on the unmodified tree): every poll (every 1.5 s, up to 20) was `listChecklistTrackings(project)`, all 11 columns of
 * every tracking of the project; a wait that needed 2 polls cost 3 full-list reads in all (the plan's own read included).
 * NEW: the plan's read is the only full-list read; each poll is `readClusterTracking(project, cluster)`. The 30 s limit, the 1.5 s
 * period, "a failed read just waits for the next one" and the result of the wait are unchanged.
 * Ids: UT-CHKNARROW-OPT-02N.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  sent: [] as unknown[],
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  poll: vi.fn<(id: string, state: string) => Promise<unknown>>(),
  rows: vi.fn<(id: string, state: string) => Promise<unknown[]>>(),
  requestGate: vi.fn(async (_a: unknown) => ({ runid: "run", approvalid: "ap" })),
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
  readClusterTracking: (id: string, state: string) => h.poll(id, state),
  listClusterChecklist: (id: string, state: string) => h.rows(id, state),
  readClusterTask: vi.fn(),
  countClusterChecklistRows: vi.fn(), listClusterTemplates: vi.fn(), listChecklistApprovalSettings: vi.fn(), listChecklistGates: vi.fn(),
  listChecklistProjectStates: vi.fn(), listHistory: vi.fn(), loadChecklistProject: vi.fn(), listClusterCopyProbe: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: h.requestGate, requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));

import { CHOICE_PROCESS } from "@/data/dataverseNames";
import type { ChecklistProject, GateSetting, SequenceEntry, TrackingRow } from "./rules";
import { useChecklistWrites } from "./hooks";

const A = CHOICE_PROCESS.approvalClusterState;
const PROJECT = "11111111-1111-1111-1111-111111111111";
const project = { id: PROJECT, projectName: "Nord", projectNumber: "DE-1", clusterStateId: "ps-1", owningBusinessUnitId: "bu" } as unknown as ChecklistProject;
const state: SequenceEntry = { id: "ps-1", name: "Cluster 1", clusterNo: 1, rowNumber: 1, clusterDescription: null, hasGate: true, gateId: "g-1" };
const gate = { id: "g-1", clusterStateId: "ps-1", approvalMode: CHOICE_PROCESS.approvalMode.onlyNotifications, gateActive: true } as unknown as GateSetting;
const tracking = (s: number): TrackingRow => ({
  id: "t-1", name: "Cluster 1", clusterStateId: "ps-1", clusterStateName: "Cluster 1", approvalClusterState: s,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
} as TrackingRow);

function hook() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useChecklistWrites(PROJECT), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers();
  h.sent = [];
  for (const f of [h.trackings, h.poll, h.rows, h.requestGate]) f.mockClear();
  h.trackings.mockResolvedValue([tracking(A.notStarted)]);
  h.rows.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); });

const run = async (result: { current: ReturnType<typeof useChecklistWrites> }, ms: number) => {
  await act(async () => {
    const p = result.current.requestApproval({ kind: "cluster", project, state, gate, comment: "x", approvalDueDate: null });
    await vi.advanceTimersByTimeAsync(ms);
    await p;
  });
};

describe("OPT-24 S4-12: the transition wait", () => {
  it("UT-CHKNARROW-OPT-021 each poll reads ONE cluster tracking; the plan's own full read is the only full-list read; ends when Completed", async () => {
    h.poll.mockResolvedValueOnce(tracking(A.inProgress)).mockResolvedValueOnce(tracking(A.completed));
    const { result } = hook();
    await run(result, 3_000);
    expect(h.poll).toHaveBeenCalledTimes(2);
    expect(h.poll).toHaveBeenCalledWith(PROJECT, "ps-1");
    expect(h.trackings).toHaveBeenCalledTimes(1); // OLD: 1 + one per poll = 3
    expect(h.rows).toHaveBeenCalledTimes(1);
    expect(h.sent).toHaveLength(2);
  });

  it("UT-CHKNARROW-OPT-022 a failed poll just waits for the next one; a missing tracking keeps waiting; the wait stops at 30 s (20 polls)", async () => {
    h.poll.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(null).mockResolvedValue(tracking(A.inProgress));
    const { result } = hook();
    await run(result, 31_500);
    expect(h.poll).toHaveBeenCalledTimes(20);
    expect(h.trackings).toHaveBeenCalledTimes(1);
    expect(h.sent).toHaveLength(2); // the note is still written after a time-out, as before
  });
});
