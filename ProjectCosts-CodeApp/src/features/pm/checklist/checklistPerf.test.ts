/**
 * UT-CHKPERF-070.. — the pure rules behind the Cluster Check List performance work (D150): the rollout switches, which jobs reload only
 * the rows, the sixteen-wide copy and the early cluster. They run on the REAL plan builders of `rules.ts`, so a plan that starts writing
 * another table can never be narrowed by mistake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { WIDE_GROUP_CONCURRENCY } from "@/data/concurrency";
import { CHECKLIST_PERF, CHECKLIST_PERF_ALL_OFF, checklistPerf, setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import { emptyPlan } from "@/data/writePlan";
import { checklistReloadKeys } from "./reload";
import {
  buildOperationalSequence, commentPatch, completeTaskPatch, completionDatePatch, defaultSelectedCluster, earlyClusterEntry,
  inProgressTogglePatch, planChecklistMaterialisation, planChecklistRowPatch, planClusterTransition, planGateApprovalRequestPatch,
  planGateCancelPatch, planPrepareCluster, planReturnToPreviousCluster, planSkippedClusterBackfill, planTerminalStateChange,
  type ChecklistProject, type DefaultChecklistTemplate, type GateSetting, type ProjectStateRef, type SequenceEntry, type TrackingRow,
} from "./rules";

const ACS = CHOICE_PROCESS.approvalClusterState;
const PROJECT = "p1";
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const NAMES = ["Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"];
const STATES: ProjectStateRef[] = NAMES.map((name, i) => ({ id: uuid(10 + i), name, order: i, isVisibleOnChecklist: true, clusterDescription: null }));
const project = { id: PROJECT, owningBusinessUnitId: uuid(6), startCluster: 0 } as ChecklistProject;
const ctx = { projectId: PROJECT, owningBusinessUnitId: uuid(6) };
const entry = (i: number): SequenceEntry => ({
  id: STATES[i]!.id, name: NAMES[i]!, clusterNo: i, rowNumber: i, clusterDescription: null, hasGate: false, gateId: null,
});
const tracking = (i: number, state: number): TrackingRow => ({
  id: uuid(200 + i), name: NAMES[i]!, clusterStateId: STATES[i]!.id, clusterStateName: NAMES[i]!, approvalClusterState: state,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
} as TrackingRow);
const templates = (n: number): DefaultChecklistTemplate[] => Array.from({ length: n }, (_, i) => ({
  id: uuid(3000 + i), name: `Task ${i}`, clusterStateId: STATES[1]!.id, gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: i,
}));
const tablesOf = (plan: { writes: { entitySet: string }[] }) => [...new Set(plan.writes.map((w) => w.entitySet))];

afterEach(() => { setChecklistPerfFlags(null); });

describe("the rollout switches (D150)", () => {
  it("UT-CHKPERF-070 every switch ships ON, ALL_OFF turns every one off, and a test override can be installed and removed", () => {
    expect(Object.values(CHECKLIST_PERF).every((v) => v === true)).toBe(true);
    expect(Object.values(CHECKLIST_PERF_ALL_OFF).every((v) => v === false)).toBe(true);
    expect(Object.keys(CHECKLIST_PERF_ALL_OFF).sort()).toEqual(Object.keys(CHECKLIST_PERF).sort());
    expect(checklistPerf()).toEqual(CHECKLIST_PERF);
    setChecklistPerfFlags({ wideCopy: false });
    expect(checklistPerf()).toEqual({ ...CHECKLIST_PERF, wideCopy: false });
    setChecklistPerfFlags(null);
    expect(checklistPerf()).toEqual(CHECKLIST_PERF);
  });
});

describe("checklistReloadKeys — which jobs reload only the rows", () => {
  const rowsOnly = [qk.checklist(PROJECT, "rows")];

  it.each([
    ["Complete", () => completeTaskPatch()],
    ["In Progress toggle", () => inProgressTogglePatch({ taskState: null })],
    ["completion date", () => completionDatePatch("2026-11-20")],
    ["comment", () => commentPatch("  ok  ")],
  ])("UT-CHKPERF-071 a row's %s patch writes only vsb_projectchecklists, so it reloads the rows and nothing else", (_name, data) => {
    const plan = planChecklistRowPatch(uuid(1), data(), "Task");
    expect(tablesOf(plan)).toEqual([ES.projectChecklists]);
    expect(checklistReloadKeys(PROJECT, plan)).toEqual(rowsOnly);
  });

  it("UT-CHKPERF-072 with the switch off, an empty plan, or a plan that writes anything else, the hook's full list is kept (undefined)", () => {
    const row = planChecklistRowPatch(uuid(1), completeTaskPatch(), "Task");
    expect(checklistReloadKeys(PROJECT, row, CHECKLIST_PERF_ALL_OFF)).toBeUndefined();
    expect(checklistReloadKeys(PROJECT, emptyPlan())).toBeUndefined();
    // A checklist row AND a tracking in one plan: the tracking write fires the server flow, so everything reloads.
    const mixed = { writes: [...row.writes, { op: "update" as const, entitySet: ES.projectStateTrackings, id: uuid(2), data: {}, reason: "t" }], log: [] };
    expect(checklistReloadKeys(PROJECT, mixed)).toBeUndefined();
    const note = { writes: [{ op: "create" as const, entitySet: ES.projectStateTrackingNotes, data: {}, reason: "n" }], log: [] };
    expect(checklistReloadKeys(PROJECT, note)).toBeUndefined();
    const proj = { writes: [{ op: "update" as const, entitySet: ES.projects, id: PROJECT, data: {}, reason: "p" }], log: [] };
    expect(checklistReloadKeys(PROJECT, proj)).toBeUndefined();
  });

  it("UT-CHKPERF-073 the copy of the templates: rows only when the tracking exists (also as one bulk create), everything when the tracking is created too", () => {
    const existing = tracking(1, ACS.notStarted);
    const copyOnly = planPrepareCluster({ selected: entry(1), tracking: existing, existingRowCount: 0, templates: templates(3), ctx });
    expect(tablesOf(copyOnly)).toEqual([ES.projectChecklists]);
    expect(checklistReloadKeys(PROJECT, copyOnly)).toEqual(rowsOnly);

    const bulk = planPrepareCluster({
      selected: entry(1), tracking: existing, existingRowCount: 0, templates: templates(3), ctx, materialise: { bulk: true },
    });
    expect(bulk.writes.map((w) => w.op)).toEqual(["createMany"]);
    expect(checklistReloadKeys(PROJECT, bulk)).toEqual(rowsOnly);

    const withTracking = planPrepareCluster({ selected: entry(1), tracking: null, existingRowCount: 0, templates: templates(3), ctx });
    expect(tablesOf(withTracking)).toEqual([ES.projectStateTrackings, ES.projectChecklists]);
    expect(checklistReloadKeys(PROJECT, withTracking)).toBeUndefined();
  });

  it("UT-CHKPERF-074 safety net: every other plan builder of the screen writes something beyond the checklist rows, so none of them is narrowed", () => {
    const trackings = [tracking(0, ACS.completed), tracking(1, ACS.inProgress), tracking(2, ACS.notStarted)];
    const gate = null as GateSetting | null;
    const plans = {
      transition: planClusterTransition({
        project, state: entry(1), tracking: trackings[1]!, next: entry(2), nextTracking: trackings[2]!, comment: "ok", approvalDueDate: null, canEdit: true,
      }),
      transitionNoNextTracking: planClusterTransition({
        project, state: entry(1), tracking: trackings[1]!, next: entry(2), nextTracking: null, comment: "ok", approvalDueDate: null, canEdit: true,
      }),
      reset: planReturnToPreviousCluster({
        project, state: entry(2), tracking: trackings[2]!, previous: entry(1), previousTracking: trackings[1]!, comment: "", canEdit: true,
      }),
      terminal: planTerminalStateChange({
        project, trackings, canEdit: true,
        staging: { approvalClusterState: ACS.inProgress, targetClusterStateId: STATES[1]!.id, targetClusterStateName: "Cluster 1", label: "Activate", description: "" },
      }),
      backfill: planSkippedClusterBackfill(STATES, [tracking(0, ACS.inProgress)], 2, ctx),
      gateRequest: planGateApprovalRequestPatch({ project, state: entry(1), tracking: trackings[1]!, gate, comment: "ok", approvalDueDate: null, canEdit: true }),
      gateCancel: planGateCancelPatch({ project, tracking: trackings[1]!, canEdit: true }),
    };
    for (const [name, plan] of Object.entries(plans)) {
      expect(plan.writes.length, name).toBeGreaterThan(0);
      expect(plan.writes.some((w) => w.entitySet !== ES.projectChecklists), name).toBe(true);
      expect(checklistReloadKeys(PROJECT, plan), name).toBeUndefined();
    }
  });
});

describe("the sixteen-wide copy (wideCopy)", () => {
  it("UT-CHKPERF-075 the creates form one group of the given width with the SAME rows and payloads; with no limit the default group is unchanged", () => {
    const base = planChecklistMaterialisation(templates(20), { projectId: PROJECT, clusterStateId: STATES[1]!.id, owningBusinessUnitId: uuid(6) });
    const wide = planChecklistMaterialisation(
      templates(20), { projectId: PROJECT, clusterStateId: STATES[1]!.id, owningBusinessUnitId: uuid(6) }, { limit: WIDE_GROUP_CONCURRENCY },
    );
    expect(WIDE_GROUP_CONCURRENCY).toBe(16);
    expect(wide.writes).toHaveLength(20);
    expect(wide.writes.every((w) => w.concurrent === true && w.concurrencyLimit === 16 && w.stopOnFailure === true)).toBe(true);
    expect(base.writes.every((w) => w.concurrencyLimit === undefined && w.stopOnFailure === true)).toBe(true);
    // Everything but the width is identical: operation, table, payload, reason.
    const strip = (p: typeof base) => p.writes.map(({ concurrencyLimit: _l, concurrencyGroup: _g, ...rest }) => rest);
    expect(strip(wide)).toEqual(strip(base));
    expect(wide.log).toEqual(base.log);
  });
});

describe("the early cluster (earlyRows, earlyVisit)", () => {
  /** A small deterministic generator, so the property test has no flakiness. */
  const lcg = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  it("UT-CHKPERF-076 the early entry is the cluster the full sequence would select, for any trackings, start cluster, pick and gates (400 cases)", () => {
    const rnd = lcg(146);
    const choices = [ACS.notStarted, ACS.inProgress, ACS.completed, null];
    for (let n = 0; n < 400; n += 1) {
      const startCluster = Math.floor(rnd() * 7);
      const trackings = STATES.filter(() => rnd() < 0.7).map((s, i) => ({
        ...tracking(i, choices[Math.floor(rnd() * choices.length)] as number), clusterStateId: s.id,
      }));
      const gates: GateSetting[] = STATES.filter(() => rnd() < 0.5).map((s, i) => ({
        id: uuid(500 + i), clusterStateId: s.id, approvalMode: 1, gateActive: true, portfolioManagerId: null, portfolioManagerMail: null,
        defaultApprovals: null, defaultContributors: null, defaultNotifications: null,
      } as unknown as GateSetting));
      const picked = rnd() < 0.3 ? STATES[Math.floor(rnd() * STATES.length)]!.id : null;
      const full = buildOperationalSequence(STATES, startCluster, gates);
      const expected = full.find((x) => x.id === picked) ?? defaultSelectedCluster(full, trackings);
      const early = earlyClusterEntry({ states: STATES, startCluster, trackings, selectedClusterId: picked });
      expect(early?.id ?? null, `case ${n}`).toBe(expected?.id ?? null);
      expect(early?.name ?? null, `case ${n}`).toBe(expected?.name ?? null);
      // Only what the gates decide differs, and the early entry never claims a gate.
      expect(early?.hasGate ?? false).toBe(false);
    }
  });

  it("UT-CHKPERF-077 with no states there is no early cluster (the screen then waits, as before)", () => {
    expect(earlyClusterEntry({ states: [], startCluster: 0, trackings: [], selectedClusterId: null })).toBeNull();
  });
});
