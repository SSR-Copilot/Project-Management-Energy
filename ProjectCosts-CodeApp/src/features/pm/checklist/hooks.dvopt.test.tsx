// @vitest-environment jsdom
/**
 * UT-CHKDVOPT-001.. — the Dataverse optimization programme on the Cluster Check List hooks (`hooks.ts`):
 *  - PB-13 `CHECKLIST_TRACKINGS_ONCE`: `prepareCluster` reuses the trackings the screen's query read a moment ago;
 *  - PB-14 `CHECKLIST_BACKFILL_GUARD`: the Draft back-fill reads which trackings still exist and writes only those, in the OLD
 *    sequential order; `CHECKLIST_BACKFILL_TOGETHER` (default OFF, QA-07) additionally sends its independent writes as one
 *    concurrent group.
 * Same harness as `hooks.writes.test.tsx`: real hook, `usePlanWrite`, `rules.ts`; the loaders and `executePlan` are stubs.
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
  exist: vi.fn<(ids: readonly string[]) => Promise<Set<string>>>(),
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
  existingTrackingIds: (ids: readonly string[]) => h.exist(ids),
  listClusterChecklist: vi.fn(async () => []), readClusterTask: vi.fn(), readClusterTracking: vi.fn(), listClusterTemplates: vi.fn(async () => []),
  listClusterCopyProbe: vi.fn(async () => []),
  listChecklistApprovalSettings: vi.fn(), listChecklistGates: vi.fn(), listChecklistProjectStates: vi.fn(), listHistory: vi.fn(), loadChecklistProject: vi.fn(),
}));
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));

import { executePlan } from "@/data/executePlan";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import {
  CHECKLIST_BACKFILL_GUARD, CHECKLIST_BACKFILL_TOGETHER, CHECKLIST_PERF, CHECKLIST_PERF_ALL_OFF, TRACKINGS_REUSE_MS, setChecklistPerfFlags,
} from "@/data/checklistPerfFlags";
import { AUTO_SKIPPED_COMMENT, type ChecklistProject, type ProjectStateRef, type SequenceEntry, type TrackingRow } from "./rules";
import { reusableTrackings, useChecklistWrites } from "./hooks";

const A = CHOICE_PROCESS.approvalClusterState;
const PROJECT = "11111111-1111-1111-1111-111111111111";
const project: ChecklistProject = {
  id: PROJECT, projectName: "Windpark Nord", projectNumber: "DE-1", startCluster: 3, clusterStateId: "ps-0", clusterStateName: "Draft",
  approvalState: null, countryId: "c-de", technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: "bu-de", totalCapacity: 1,
  netYieldP50: 1,
  milestones: {
    projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};
const states: ProjectStateRef[] = ["Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"].map((name, i) => ({
  id: `ps-${i}`, name, order: i, isVisibleOnChecklist: true, clusterDescription: null,
}));
const selected: SequenceEntry = { id: "ps-1", name: "Cluster 1", clusterNo: 1, rowNumber: 1, clusterDescription: null, hasGate: false, gateId: null };
const tracking = (o: Partial<TrackingRow> = {}): TrackingRow => ({
  id: "t-1", name: "Cluster 1", clusterStateId: "ps-1", clusterStateName: "Cluster 1", approvalClusterState: A.inProgress,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null, ...o,
});
/** Draft, Cluster 1 and Cluster 2 exist and are stale (updates); Clusters 3-6 are missing (creates). */
const stale = (): TrackingRow[] => states.slice(0, 3).map((s, i) => tracking({
  id: `T-${i}`, clusterStateId: s.id, clusterStateName: s.name, approvalClusterState: A.notStarted, approvalComment: i === 0 ? null : "old",
}));

let qc: QueryClient;
function hook() {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useChecklistWrites(PROJECT), { wrapper });
}
const sentPlans = () => h.sent as WritePlan[];

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  h.sent = [];
  vi.mocked(executePlan).mockClear();
  for (const f of [h.trackings, h.count, h.exist]) f.mockReset();
  h.trackings.mockResolvedValue([tracking()]);
  h.count.mockResolvedValue(3);
});
afterEach(() => { setChecklistPerfFlags(null); vi.useRealTimers(); });

describe("UT-CHKDVOPT PB-13 the trackings are read once per cluster visit", () => {
  const seed = () => qc.setQueryData(qk.checklist(PROJECT, "trackings"), [tracking()]);

  it("UT-CHKDVOPT-001 a young, settled trackings query is reused: prepareCluster lists NOTHING, still counts the rows afresh", async () => {
    seed();
    const { result } = hook();
    await act(async () => { await result.current.prepareCluster(project, selected); });
    expect(h.trackings).not.toHaveBeenCalled();
    expect(h.count).toHaveBeenCalledTimes(1);
    expect(executePlan).not.toHaveBeenCalled(); // tracking present and rows present: an empty plan, as before
  });

  it("UT-CHKDVOPT-002 no cached data: the list is read (once)", async () => {
    const { result } = hook();
    await act(async () => { await result.current.prepareCluster(project, selected); });
    expect(h.trackings).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKDVOPT-003 the switch OFF: the list is read again, as before", async () => {
    seed();
    setChecklistPerfFlags({ trackingsOnce: false });
    const { result } = hook();
    await act(async () => { await result.current.prepareCluster(project, selected); });
    expect(h.trackings).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKDVOPT-004 data older than the window is not reused", async () => {
    seed();
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0 + TRACKINGS_REUSE_MS + 500, toFake: ["Date"] });
    const { result } = hook();
    await act(async () => { await result.current.prepareCluster(project, selected); });
    expect(h.trackings).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKDVOPT-005 a WRITE invalidates the query: the next visit reads afresh (the back-fill is a write job)", async () => {
    seed();
    h.exist.mockResolvedValue(new Set(["t-0", "t-1", "t-2"]));
    h.trackings.mockResolvedValue(stale());
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(qc.getQueryState(qk.checklist(PROJECT, "trackings"))?.isInvalidated).toBe(true);
    h.trackings.mockClear();
    await act(async () => { await result.current.prepareCluster(project, selected); });
    expect(h.trackings).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKDVOPT-006 reusableTrackings: success + idle + not invalidated + young only; every other state reads", () => {
    const rows = [tracking()];
    const base = { data: rows, status: "success", fetchStatus: "idle", isInvalidated: false, dataUpdatedAt: 10_000 };
    expect(reusableTrackings(base, 10_000 + TRACKINGS_REUSE_MS)).toBe(rows);
    expect(reusableTrackings(base, 10_000 + TRACKINGS_REUSE_MS + 1)).toBeNull();
    expect(reusableTrackings({ ...base, isInvalidated: true }, 10_100)).toBeNull();
    expect(reusableTrackings({ ...base, fetchStatus: "fetching" }, 10_100)).toBeNull();
    expect(reusableTrackings({ ...base, status: "error" }, 10_100)).toBeNull();
    expect(reusableTrackings({ ...base, data: undefined }, 10_100)).toBeNull();
    expect(reusableTrackings(undefined, 10_100)).toBeNull();
    expect(reusableTrackings(base, 9_000)).toBeNull(); // a clock that went backwards
  });

  it("UT-CHKDVOPT-007 a write job (Move) still reads the trackings afresh even with a young cache (C6)", async () => {
    seed();
    h.trackings.mockResolvedValue([tracking()]);
    const { result } = hook();
    await act(async () => {
      await result.current.saveTransition({
        project, state: selected, next: { ...selected, id: "ps-2", name: "Cluster 2" }, comment: "go", approvalDueDate: null,
      });
    });
    expect(h.trackings).toHaveBeenCalledTimes(1);
  });
});

describe("UT-CHKDVOPT PB-14 the back-fill is guarded and grouped", () => {
  const OLD_ORDER = ["update:T-0", "update:T-1", "update:T-2", "create:", "create:", "create:", "create:"];

  it("UT-CHKDVOPT-009 the shipped defaults: the guard is ON, the concurrent group is OFF (QA-07)", () => {
    expect(CHECKLIST_BACKFILL_GUARD).toBe(true);
    expect(CHECKLIST_BACKFILL_TOGETHER).toBe(false);
    expect(CHECKLIST_PERF.backfillGuard).toBe(true);
    expect(CHECKLIST_PERF.backfillTogether).toBe(false);
    expect(CHECKLIST_PERF_ALL_OFF.backfillTogether).toBe(false);
  });

  it("UT-CHKDVOPT-010 guard only (the default): one existence read of the update ids, every row present: the old plan, SEQUENTIAL and in the old order", async () => {
    h.trackings.mockResolvedValue(stale());
    h.exist.mockResolvedValue(new Set(["t-0", "t-1", "t-2"]));
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(h.exist).toHaveBeenCalledTimes(1);
    expect(h.exist.mock.calls[0]![0]).toEqual(["T-0", "T-1", "T-2"]);
    const [plan] = sentPlans();
    expect(plan!.writes.map((w) => `${w.op}:${w.id ?? ""}`)).toEqual(OLD_ORDER);
    expect(plan!.writes.every((w) => w.entitySet === ES.projectStateTrackings)).toBe(true);
    expect(plan!.writes.some((w) => w.concurrent || w.concurrencyGroup !== undefined)).toBe(false);
  });

  it("UT-CHKDVOPT-010b guard + together (CHECKLIST_BACKFILL_TOGETHER ON): the same writes in the same order as ONE concurrent group", async () => {
    setChecklistPerfFlags({ ...CHECKLIST_PERF, backfillTogether: true });
    h.trackings.mockResolvedValue(stale());
    h.exist.mockResolvedValue(new Set(["t-0", "t-1", "t-2"]));
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(h.exist).toHaveBeenCalledTimes(1);
    const [plan] = sentPlans();
    expect(plan!.writes.map((w) => `${w.op}:${w.id ?? ""}`)).toEqual(OLD_ORDER);
    expect(plan!.writes.every((w) => w.entitySet === ES.projectStateTrackings && w.concurrent === true)).toBe(true);
    expect(new Set(plan!.writes.map((w) => w.concurrencyGroup)).size).toBe(1);
  });

  it("UT-CHKDVOPT-010c both OFF equals the old behaviour: no existence read, the unguarded sequential plan, the same writes as the guard-only plan", async () => {
    h.trackings.mockResolvedValue(stale());
    h.exist.mockResolvedValue(new Set(["t-0", "t-1", "t-2"]));
    const guarded = hook();
    await act(async () => { await guarded.result.current.backfill(project, states); });
    const guardedPlan = sentPlans()[0]!;
    h.sent = []; h.exist.mockClear();
    setChecklistPerfFlags({ ...CHECKLIST_PERF, backfillGuard: false, backfillTogether: false });
    const old = hook();
    await act(async () => { await old.result.current.backfill(project, states); });
    expect(h.exist).not.toHaveBeenCalled();
    const oldPlan = sentPlans()[0]!;
    expect(oldPlan.writes.map((w) => `${w.op}:${w.id ?? ""}`)).toEqual(OLD_ORDER);
    expect(oldPlan.writes).toEqual(guardedPlan.writes);
    expect(oldPlan.writes.some((w) => w.concurrent)).toBe(false);
  });

  it("UT-CHKDVOPT-010d the group needs the guard: backfillTogether ON with the guard OFF still reads nothing and writes sequentially", async () => {
    setChecklistPerfFlags({ ...CHECKLIST_PERF, backfillGuard: false, backfillTogether: true });
    h.trackings.mockResolvedValue(stale());
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(h.exist).not.toHaveBeenCalled();
    expect(sentPlans()[0]!.writes.some((w) => w.concurrent)).toBe(false);
  });

  it("UT-CHKDVOPT-011 a tracking deleted since the list was read is NOT written (no orphan); the others and the creates are", async () => {
    h.trackings.mockResolvedValue(stale());
    h.exist.mockResolvedValue(new Set(["t-0", "t-2"]));
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    const [plan] = sentPlans();
    expect(plan!.writes.some((w) => w.id === "T-1")).toBe(false);
    expect(plan!.writes.filter((w) => w.op === "update").map((w) => w.id)).toEqual(["T-0", "T-2"]);
    expect(plan!.writes.filter((w) => w.op === "create")).toHaveLength(4);
  });

  it("UT-CHKDVOPT-012 only creates to do (a fresh project): NO existence read", async () => {
    h.trackings.mockResolvedValue([]);
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(h.exist).not.toHaveBeenCalled();
    const [plan] = sentPlans();
    expect(plan!.writes).toHaveLength(7);
    expect(plan!.writes.every((w) => w.op === "create")).toBe(true);
  });

  it("UT-CHKDVOPT-013 the switch OFF: no existence read, the old sequential unguarded plan (no concurrent flags)", async () => {
    setChecklistPerfFlags({ ...CHECKLIST_PERF, backfillGuard: false });
    h.trackings.mockResolvedValue(stale());
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(h.exist).not.toHaveBeenCalled();
    const [plan] = sentPlans();
    expect(plan!.writes).toHaveLength(7);
    expect(plan!.writes.some((w) => w.concurrent)).toBe(false);
  });

  it("UT-CHKDVOPT-014 failure injection: a failed existence read is the job's error and NOTHING is written", async () => {
    h.trackings.mockResolvedValue(stale());
    h.exist.mockRejectedValue(new Error("HTTP 503"));
    const { result } = hook();
    let out: string[] | null = ["x"];
    await act(async () => { out = await result.current.backfill(project, states); });
    expect(out).toBeNull();
    expect(result.current.error).toContain("HTTP 503");
    expect(executePlan).not.toHaveBeenCalled();
  });

  it("UT-CHKDVOPT-014b QA-11 PB-14: a FAILED existence read fails the job without writing a single row, in both group modes; a later run writes normally", async () => {
    for (const backfillTogether of [false, true]) {
      setChecklistPerfFlags({ ...CHECKLIST_PERF, backfillTogether });
      h.sent = []; vi.mocked(executePlan).mockClear();
      h.trackings.mockResolvedValue(stale());
      h.exist.mockRejectedValueOnce(new Error("HTTP 503"));
      const { result } = hook();
      let out: string[] | null = ["x"];
      await act(async () => { out = await result.current.backfill(project, states); });
      expect(out).toBeNull();
      expect(result.current.error).toContain("HTTP 503");
      expect(executePlan).not.toHaveBeenCalled();
      expect(h.sent).toEqual([]);
      // nothing was half-written, so the next visit simply runs the whole back-fill (idempotent)
      h.exist.mockResolvedValue(new Set(["t-0", "t-1", "t-2"]));
      await act(async () => { await result.current.backfill(project, states); });
      expect(sentPlans()).toHaveLength(1);
      expect(sentPlans()[0]!.writes).toHaveLength(7);
    }
  });

  it("UT-CHKDVOPT-015 nothing to back-fill (already at target): no existence read", async () => {
    const done = states.map((s, i) => tracking({
      id: `d-${i}`, clusterStateId: s.id, clusterStateName: s.name,
      approvalClusterState: i === 0 ? A.inProgress : i < 3 ? A.completed : A.notStarted,
      approvalComment: i > 0 && i < 3 ? AUTO_SKIPPED_COMMENT : null,
    }));
    h.trackings.mockResolvedValue(done);
    const { result } = hook();
    await act(async () => { await result.current.backfill(project, states); });
    expect(h.exist).not.toHaveBeenCalled();
  });
});
