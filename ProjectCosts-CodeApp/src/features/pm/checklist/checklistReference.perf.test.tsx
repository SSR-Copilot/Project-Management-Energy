// @vitest-environment jsdom
/**
 * UT-CHKREF-001.. — D156: the reference reads of the Cluster Check List (project states, gate settings, approval settings) are
 * cached and shared differently, never read differently. Same stubs as `hooks.perf.test.tsx`: the loaders are stubbed, the hooks
 * are the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({
  states: vi.fn<() => Promise<unknown[]>>(),
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  gates: vi.fn<(p: unknown) => Promise<unknown[]>>(),
  approvals: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
}));
vi.mock("@/data/executePlan", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/data/executePlan")>()), executePlan: vi.fn() }));
vi.mock("@/data/checklist", () => ({
  listChecklistProjectStates: () => m.states(),
  listChecklistTrackings: (id: string) => m.trackings(id),
  listChecklistGates: (p: unknown) => m.gates(p),
  listChecklistApprovalSettings: (ids: readonly string[]) => m.approvals(ids),
  listClusterChecklist: vi.fn(), countClusterChecklistRows: vi.fn(), listClusterTemplates: vi.fn(), listHistory: vi.fn(),
  loadChecklistProject: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));

import { CHOICE_PROCESS } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { CHECKLIST_PERF_ALL_OFF, setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import type { ChecklistProject, ChecklistRow } from "./rules";
import { useChecklistApprovalSettings, useChecklistWrites, useClusterSequence } from "./hooks";

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";
const project = (id: string, over: Partial<ChecklistProject> = {}): ChecklistProject => ({
  id, projectName: "Windpark", projectNumber: "DE-1", startCluster: 0, clusterStateId: "ps-1", clusterStateName: "Cluster 1",
  approvalState: null, countryId: "c-de", technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: "bu-de", totalCapacity: 1,
  netYieldP50: 1,
  milestones: {
    projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
  ...over,
});
const stateRow = (over: Record<string, unknown> = {}) => ({ id: "ps-1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true, clusterDescription: null, ...over });
const row = (id: string): ChecklistRow => ({
  id, title: "Land secured", clusterStateId: "ps-1", gateRelevance: true, holdingDescription: null, isCompletionDate: false,
  completionDate: null, taskState: null, approvalChecklistState: 0, note: null, sort: 1, projectDefaultChecklistId: "tpl-1",
  flowRunId: null, flowApprovalId: null,
});

/**
 * `staleTime` as the app sets it (30 s, `app/Providers.tsx`) unless a test needs every query stale: with 0 a focus event shows
 * which queries refuse to refetch.
 */
function client(staleTime = 30_000) {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } } });
}
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const sequence = (qc: QueryClient, p: ChecklistProject) => renderHook(() => useClusterSequence(p.id, p), { wrapper: wrap(qc) });
const settled = async (r: { result: { current: { hasData?: boolean } } }) => { await waitFor(() => { expect(r.result.current.hasData).toBe(true); }); };

beforeEach(() => {
  for (const f of [m.states, m.trackings, m.gates, m.approvals]) f.mockReset();
  m.states.mockResolvedValue([stateRow()]);
  m.trackings.mockResolvedValue([]);
  m.gates.mockResolvedValue([]);
  m.approvals.mockResolvedValue([]);
});
afterEach(() => { setChecklistPerfFlags(null); focusManager.setFocused(undefined); });

describe("the reference reads are shared, not repeated (sharedStates, scopedGates)", () => {
  it("UT-CHKREF-001 a second project of the same country and technology reads the project states and the gates from the cache; its trackings are its own", async () => {
    const qc = client();
    await settled(sequence(qc, project(P1)));
    await settled(sequence(qc, project(P2)));
    expect(m.states).toHaveBeenCalledTimes(1);
    expect(m.gates).toHaveBeenCalledTimes(1);
    expect(m.trackings).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData(qk.generalDataProjectStates)).toBeDefined();
    expect(qc.getQueryData(qk.checklistGates("c-de", CHOICE_PROCESS.technology.wind))).toBeDefined();
  });

  it("UT-CHKREF-002 a project of ANOTHER country or technology reads its own gates (the cache key carries both)", async () => {
    const qc = client();
    await settled(sequence(qc, project(P1)));
    await settled(sequence(qc, project(P2, { countryId: "c-pl" })));
    await settled(sequence(qc, project(P2, { technology: CHOICE_PROCESS.technology.pv })));
    expect(m.gates).toHaveBeenCalledTimes(3);
  });

  it("UT-CHKREF-003 with every switch off each project reads its own states and gates, as before D156", async () => {
    setChecklistPerfFlags(CHECKLIST_PERF_ALL_OFF);
    const qc = client();
    await settled(sequence(qc, project(P1)));
    await settled(sequence(qc, project(P2)));
    expect(m.states).toHaveBeenCalledTimes(2);
    expect(m.gates).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData(qk.checklist(P1, "states"))).toBeDefined();
    expect(qc.getQueryData(qk.generalDataProjectStates)).toBeUndefined();
  });

  it("UT-CHKREF-004 states another screen put in the shared cache (no clusterDescription) are served with clusterDescription null, and are not read again", async () => {
    const qc = client();
    qc.setQueryData(qk.generalDataProjectStates, [{ id: "ps-9", name: "Cluster 9", order: 9, isVisibleOnChecklist: true }]);
    const r = sequence(qc, project(P1));
    await settled(r);
    expect(m.states).not.toHaveBeenCalled();
    expect(r.result.current.data.states).toEqual([
      { id: "ps-9", name: "Cluster 9", order: 9, isVisibleOnChecklist: true, clusterDescription: null },
    ]);
  });
});

describe("a window focus refetches what a second user can change, not the reference reads (quietFocus)", () => {
  const refocus = async () => {
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); await new Promise<void>((r) => { setTimeout(r, 0); }); });
  };

  it("UT-CHKREF-005 on focus the trackings are read again; the project states, the gates and the approval settings are not", async () => {
    const qc = client(0);
    const p = project(P1);
    const seq = sequence(qc, p);
    const settings = renderHook(() => useChecklistApprovalSettings(P1, [row("cl-1")]), { wrapper: wrap(qc) });
    await settled(seq);
    await waitFor(() => { expect(m.approvals).toHaveBeenCalledTimes(1); });
    await refocus();
    expect(m.trackings).toHaveBeenCalledTimes(2);
    expect(m.states).toHaveBeenCalledTimes(1);
    expect(m.gates).toHaveBeenCalledTimes(1);
    expect(m.approvals).toHaveBeenCalledTimes(1);
    settings.unmount();
  });

  it("UT-CHKREF-006 with the switch off every stale query refetches on focus, as before", async () => {
    setChecklistPerfFlags({ quietFocus: false });
    const qc = client(0);
    const seq = sequence(qc, project(P1));
    const settings = renderHook(() => useChecklistApprovalSettings(P1, [row("cl-1")]), { wrapper: wrap(qc) });
    await settled(seq);
    await waitFor(() => { expect(m.approvals).toHaveBeenCalledTimes(1); });
    await refocus();
    expect(m.trackings).toHaveBeenCalledTimes(2);
    expect(m.gates).toHaveBeenCalledTimes(2);
    expect(m.approvals).toHaveBeenCalledTimes(2);
    settings.unmount();
  });
});

describe("the command bar's Refresh still refreshes the reference reads", () => {
  const refreshKeys = async (part?: string) => {
    const qc = client();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useChecklistWrites(P1), { wrapper: wrap(qc) });
    await act(async () => { await result.current.refresh(part); });
    return spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
  };

  it("UT-CHKREF-007 a full Refresh invalidates the project's keys and, now that they sit outside them, the shared states and the gates; a history Refresh only the history", async () => {
    expect(await refreshKeys()).toEqual([qk.checklistAll(P1), qk.generalDataProjectStates, qk.checklistGatesAll]);
    expect(await refreshKeys("history")).toEqual([qk.checklist(P1, "history")]);
  });

  it("UT-CHKREF-008 with the switches off a full Refresh invalidates the project's keys only", async () => {
    setChecklistPerfFlags(CHECKLIST_PERF_ALL_OFF);
    expect(await refreshKeys()).toEqual([qk.checklistAll(P1)]);
  });

  it("UT-CHKREF-009 a Refresh makes the next visit read the states and the gates again", async () => {
    const qc = client();
    await settled(sequence(qc, project(P1)));
    const { result } = renderHook(() => useChecklistWrites(P1), { wrapper: wrap(qc) });
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => { expect(m.states).toHaveBeenCalledTimes(2); });
    await waitFor(() => { expect(m.gates).toHaveBeenCalledTimes(2); });
  });
});
