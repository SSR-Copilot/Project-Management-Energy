// @vitest-environment jsdom
/**
 * UT-CHKPERF-050.. — A3 (D138): `useChecklistOrchestration` no longer lists `writes` (a NEW object on every render of the
 * screen) among its effect dependencies, and `restart()` re-runs the visit by itself. The behaviour pinned by UT-CHKHOOK-014..017 is
 * unchanged; these add the two cases the change could have broken.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { CHOICE_PROCESS } from "@/data/dataverseNames";

vi.mock("@/data/checklist", () => ({
  listChecklistTrackings: vi.fn(), listClusterChecklist: vi.fn(), countClusterChecklistRows: vi.fn(), listClusterTemplates: vi.fn(),
  listChecklistApprovalSettings: vi.fn(), listChecklistGates: vi.fn(), listChecklistProjectStates: vi.fn(), listHistory: vi.fn(),
  loadChecklistProject: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));

import { useChecklistOrchestration } from "./hooks";
import type { ChecklistProject, ProjectStateRef, SequenceEntry, TrackingRow } from "./rules";

const A = CHOICE_PROCESS.approvalClusterState;
const project = {
  id: "p1", startCluster: 0, clusterStateName: "Cluster 1", owningBusinessUnitId: "bu", countryId: "c", technology: 1,
} as ChecklistProject;
const states: ProjectStateRef[] = [{ id: "ps-1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true, clusterDescription: null }];
const trackings = [{ id: "t-1", clusterStateId: "ps-1", approvalClusterState: A.inProgress }] as TrackingRow[];
const selected = { id: "ps-1", name: "Cluster 1" } as SequenceEntry;
const mkWrites = () => ({ backfill: vi.fn(async () => [] as string[]), prepareCluster: vi.fn(async () => [] as string[]) });
type Args = Parameters<typeof useChecklistOrchestration>[0];

describe("useChecklistOrchestration (A3)", () => {
  it("UT-CHKPERF-050 a screen that hands over a NEW writes object on every render still prepares the cluster once", async () => {
    const first = mkWrites();
    const args = (writes: ReturnType<typeof mkWrites>): Args => ({ project, states, trackings, sequenceReady: true, selected, writes });
    const { rerender } = renderHook((a: Args) => useChecklistOrchestration(a), { initialProps: args(first) });
    await waitFor(() => expect(first.prepareCluster).toHaveBeenCalledTimes(1));
    const later = mkWrites();
    for (let i = 0; i < 5; i += 1) rerender(args(i % 2 ? later : mkWrites()));
    expect(first.prepareCluster).toHaveBeenCalledTimes(1);
    expect(later.prepareCluster).not.toHaveBeenCalled();
  });

  it("UT-CHKPERF-051 restart() alone (no new project, states or trackings) runs the visit again, with the LATEST writes", async () => {
    const first = mkWrites();
    const args = (writes: ReturnType<typeof mkWrites>): Args => ({ project, states, trackings, sequenceReady: true, selected, writes });
    const { result, rerender } = renderHook((a: Args) => useChecklistOrchestration(a), { initialProps: args(first) });
    await waitFor(() => expect(first.prepareCluster).toHaveBeenCalledTimes(1));
    const latest = mkWrites();
    rerender(args(latest));
    act(() => { result.current.restart(); });
    await waitFor(() => expect(latest.prepareCluster).toHaveBeenCalledTimes(1));
    expect(first.prepareCluster).toHaveBeenCalledTimes(1);
  });
});
