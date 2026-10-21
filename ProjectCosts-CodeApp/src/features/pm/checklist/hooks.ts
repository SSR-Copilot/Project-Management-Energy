/**
 * Project General CheckList Screen — the data layer (connected 19 Oct 2026, D29).
 *
 * READS (`data/checklist.ts`): the project, every Project State, the project's trackings, the active
 * gate rows (`colDefaultProjectApprovalsSettings`), the selected cluster's active tasks, their
 * `Check List Default Approvals` rows, and the panel history.
 *
 * WRITES — each a `WritePlan` from `rules.ts`, run IN ORDER by `usePlanWrite`:
 *  - the `OnVisible` back-fill (`planSkippedClusterBackfill`), once per visit, before anything else;
 *  - per selected cluster, the refresh button's ensure-tracking + materialisation (`planPrepareCluster`);
 *  - the row Complete, In Progress, Completion Date and comment patches (`planChecklistRowPatch`);
 *  - the panel Save — the direct move to the next cluster (`planClusterTransition`);
 *  - Reset to … (`planReturnToPreviousCluster`) and Abandon / Inactivate / Activate (`planTerminalStateChange`).
 * Every plan is built from a fresh read when its job starts, as the canvas `Refresh`es first.
 *
 * SERVER AUTOMATION the writes fire (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified
 * 19 Oct 2026) — the client never does its work:
 *  - `SynchroniseProjectState` — `vsb_projectstatetracking` Added / Modified on `vsb_approvalclusterstate`,
 *    acting only when the new value is In Progress: it sets the project's Cluster State to that
 *    tracking's cluster. Fired by the back-fill / ensure-tracking (Draft), the move to the next cluster,
 *    Reset to … (the previous row) and Activate.
 *  - `UpdateTeamsandSPOSite` — `vsb_project` Modified on `vsb_clusterstate` (Teams / SharePoint; acts for
 *    Croatia only). Fired by the move to the next cluster and by Abandon / Inactivate / Activate.
 *  - No plugin step filters on these tables or columns.
 *
 * NOT CALLED (product decision D29 — they send approval mails / Teams cards): `PerformCommonRequestofGateApproval`,
 * `PerformCommonRequestofCheckListApproval`, `PerformRequestofGateApprovalCancellation`,
 * `PerformRequestofCheckListApprovalCancellation`. `power.config.json` has no connection reference for them.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ES, ES_PROCESS } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  countClusterChecklistRows, listChecklistApprovalSettings, listChecklistGates, listChecklistProjectStates,
  listChecklistTrackings, listClusterChecklist, listClusterTemplates, listHistory, loadChecklistProject,
  type HistoryEntry,
} from "@/data/checklist";
import {
  MSG, backfillNeeded, checklistHtmlTable, needsTemplates, planChecklistRowPatch, planClusterTransition,
  planPrepareCluster, planReturnToPreviousCluster, planSkippedClusterBackfill, planTerminalStateChange,
  shouldBackfillSkippedClusters, startClusterNo, trackingFor,
  type ChecklistApprovalSetting, type ChecklistProject, type ChecklistRow, type GateSetting,
  type HistoryQueryDescriptor, type ProjectStateRef, type SequenceEntry, type TerminalStaging,
  type TrackingRow, type WritePlan,
} from "./rules";

export type { HistoryEntry };

/** Every Dataverse entity set the screen reads or writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.projectStates,
  ES.projectStateTrackings,
  ES.projectChecklists,
  ES.projectStateTrackingNotes,
  ES_PROCESS.projectChecklistTrackingNotes,
  ES_PROCESS.projectDefaultChecklists,
  ES_PROCESS.projectDefaultApprovals,
  ES_PROCESS.checkListDefaultApprovals,
  ES.checklistCountryAndTechnologies,
];

/**
 * `gblCurrentUser.CanEditSelectedProject` — computed by the canvas and read by no control. The SDK
 * has no `DataSourceInfo` / `RecordInfo`: it passes, and Dataverse decides (D1).
 */
export const CAN_EDIT_SELECTED_PROJECT = true;

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NONE: never[] = [];

export interface ClusterSequenceData {
  states: ProjectStateRef[];
  trackings: TrackingRow[];
  gates: GateSetting[];
}

/** `gblRecordSelectedProject` — re-read on every visit, as `OnVisible` does. */
export function useChecklistProject(projectId: string | undefined): ScreenData<ChecklistProject | null> {
  const q = useQuery({
    queryKey: qk.checklist(projectId ?? "", "project"),
    queryFn: () => loadChecklistProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** The states, the project's trackings and its active gates — what the two sequences are built from. */
export function useClusterSequence(
  projectId: string | undefined,
  project: ChecklistProject | null,
): ScreenData<ClusterSequenceData> & { isFetching: boolean } {
  const id = projectId ?? "";
  const states = useQuery({
    queryKey: qk.checklist(id, "states"),
    queryFn: listChecklistProjectStates,
    enabled: Boolean(projectId),
  });
  const trackings = useQuery({
    queryKey: qk.checklist(id, "trackings"),
    queryFn: () => listChecklistTrackings(id),
    enabled: Boolean(projectId),
  });
  const gates = useQuery({
    queryKey: qk.checklist(id, "gates", project?.countryId ?? "", project?.technology ?? ""),
    queryFn: () => listChecklistGates(project!),
    enabled: project !== null,
  });
  return {
    data: { states: states.data ?? NONE, trackings: trackings.data ?? NONE, gates: gates.data ?? NONE },
    isLoading: states.isLoading || trackings.isLoading || gates.isLoading,
    isFetching: states.isFetching || trackings.isFetching || gates.isFetching,
    error: states.error ?? trackings.error ?? gates.error ?? undefined,
    connected: true,
  };
}

/** `colProjectCheckList` — the selected cluster's active tasks. */
export function useClusterChecklist(projectId: string | undefined, clusterStateId: string | null): ScreenData<ChecklistRow[]> {
  const q = useQuery({
    queryKey: qk.checklist(projectId ?? "", "rows", clusterStateId ?? ""),
    queryFn: () => listClusterChecklist(projectId!, clusterStateId!),
    enabled: Boolean(projectId) && Boolean(clusterStateId),
  });
  return out(q, NONE as ChecklistRow[]);
}

/** The rows' `Check List Default Approvals`, active and inactive. */
export function useChecklistApprovalSettings(
  projectId: string | undefined,
  rows: readonly ChecklistRow[],
): ScreenData<ChecklistApprovalSetting[]> {
  const ids = [...new Set(rows.map((r) => r.projectDefaultChecklistId).filter((x): x is string => Boolean(x)))].sort();
  const q = useQuery({
    queryKey: qk.checklist(projectId ?? "", "approvals", ...ids),
    queryFn: () => listChecklistApprovalSettings(ids),
    enabled: Boolean(projectId) && ids.length > 0,
  });
  return out(q, NONE as ChecklistApprovalSetting[]);
}

/** The panel history for `historyDescriptor(panel)`. */
export function useHistory(projectId: string | undefined, descriptor: HistoryQueryDescriptor | null): ScreenData<HistoryEntry[]> {
  const q = useQuery({
    queryKey: qk.checklist(projectId ?? "", "history", descriptor?.entitySet ?? "", descriptor?.lookupValue ?? ""),
    queryFn: () => listHistory(descriptor!),
    enabled: Boolean(projectId) && descriptor !== null,
  });
  return out(q, NONE as HistoryEntry[]);
}

/** What the panel Save sends; the hook re-reads the trackings and the tasks for the note's table. */
export interface TransitionRequest {
  project: ChecklistProject;
  state: SequenceEntry;
  next: SequenceEntry | null;
  comment: string;
  approvalDueDate: string | null;
}

/** What Reset to … sends. */
export interface ReturnRequest {
  project: ChecklistProject;
  state: SequenceEntry;
  previous: SequenceEntry;
}

/** Runs the screen's writes and refreshes the screen, the header and the other project views. */
export function useChecklistWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  const qc = useQueryClient();
  const w = usePlanWrite({
    invalidate: [qk.checklistAll(id), qk.project(id), qk.generalDataProject(id), qk.stateTrackings(id), qk.milestoneProject(id)],
    action: "change this project's checklist",
  });
  const ctx = (project: ChecklistProject) => ({ projectId: project.id, owningBusinessUnitId: project.owningBusinessUnitId });

  /** `btn_CheckList_EnsureSkippedClusterStatesCompleted` (Y:443-604), from a fresh read. */
  const backfill = (project: ChecklistProject, states: ProjectStateRef[]) => w.run({
    progress: MSG.loading,
    plan: async () => {
      const trackings = await listChecklistTrackings(id);
      const start = startClusterNo(project);
      if (!shouldBackfillSkippedClusters({ startCluster: start, clusterStateName: project.clusterStateName, trackings })) {
        return { writes: [], log: [] } satisfies WritePlan;
      }
      return planSkippedClusterBackfill(states, trackings, start, ctx(project));
    },
  });

  /** `but_Project_States_CheckList_Refresh` for the selected cluster: ensure the tracking, then copy the templates. */
  const prepareCluster = (project: ChecklistProject, selected: SequenceEntry) => w.run({
    progress: MSG.loading,
    plan: async () => {
      const [trackings, count] = await Promise.all([
        listChecklistTrackings(id), countClusterChecklistRows(id, selected.id),
      ]);
      const tracking = trackingFor(trackings, selected.id);
      const templates = needsTemplates(tracking, selected, count) ? await listClusterTemplates(project, selected.id) : [];
      return planPrepareCluster({ selected, tracking, existingRowCount: count, templates, ctx: ctx(project) });
    },
  });

  const patchRow = (row: ChecklistRow, data: Record<string, unknown>, texts: { progress: string; success: string; error: (d: string) => string }) =>
    w.run({ progress: texts.progress, success: texts.success, errorText: texts.error, plan: planChecklistRowPatch(row.id, data, row.title) });

  /** `pcf_…_Buttons_Save` (Y:5235-5411): the direct move, with the cluster's task table as the note. */
  const saveTransition = (req: TransitionRequest) => w.run({
    progress: MSG.clusterSaving(req.state.name),
    success: MSG.clusterSaved(req.state.name),
    errorText: MSG.projectStatusError,
    plan: async () => {
      const [trackings, rows] = await Promise.all([listChecklistTrackings(id), listClusterChecklist(id, req.state.id)]);
      return planClusterTransition({
        project: req.project, state: req.state, next: req.next,
        tracking: trackingFor(trackings, req.state.id),
        nextTracking: trackingFor(trackings, req.next?.id ?? null),
        comment: req.comment, approvalDueDate: req.approvalDueDate,
        noteHtml: checklistHtmlTable(rows),
        canEdit: CAN_EDIT_SELECTED_PROJECT,
      });
    },
  });

  /** `cmp_PopUp_CheckList_ClusterState_ReturnConfirmation.OnConfirm` (Y:6337-6409). */
  const returnToPrevious = (req: ReturnRequest) => w.run({
    progress: MSG.returning(req.previous.name),
    errorText: MSG.projectStatusError,
    plan: async () => {
      const trackings = await listChecklistTrackings(id);
      const tracking = trackingFor(trackings, req.state.id);
      return planReturnToPreviousCluster({
        project: req.project, state: req.state, previous: req.previous, tracking,
        previousTracking: trackingFor(trackings, req.previous.id),
        // `Trim(txt_…_Comment_1.Value)` — the closed panel's box holds the tracking's comment.
        comment: tracking?.approvalComment ?? "",
        canEdit: CAN_EDIT_SELECTED_PROJECT,
      });
    },
  });

  /** `cmp_PopUp_CheckList_ClusterState_Confirmation.OnConfirm` (Y:6187-6259). */
  const changeTerminal = (project: ChecklistProject, staging: TerminalStaging) => w.run({
    progress: MSG.pleaseWait,
    errorText: MSG.clusterStateError,
    plan: async () => planTerminalStateChange({
      project, staging, trackings: await listChecklistTrackings(id), canEdit: CAN_EDIT_SELECTED_PROJECT,
    }),
  });

  return {
    progress: w.progress, error: w.error, success: w.success, clear: w.clear,
    backfill, prepareCluster, patchRow, saveTransition, returnToPrevious, changeTerminal,
    /** The command bar's Refresh (`Navigate` to the same screen) and the history Refresh. */
    refresh: (part?: string) => qc.invalidateQueries({ queryKey: part ? qk.checklist(id, part) : qk.checklistAll(id) }),
  };
}

/**
 * The `OnVisible` orchestration: the back-fill once per visit (when its guard holds), THEN the
 * refresh button's preparation for each cluster the user lands on. `restart()` is the command bar's
 * Refresh (`Navigate` to the same screen).
 */
export function useChecklistOrchestration(args: {
  project: ChecklistProject | null;
  states: ProjectStateRef[];
  trackings: TrackingRow[];
  sequenceReady: boolean;
  selected: SequenceEntry | null;
  writes: Pick<ReturnType<typeof useChecklistWrites>, "backfill" | "prepareCluster">;
}) {
  const { project, states, trackings, sequenceReady, selected, writes } = args;
  const [backfillDone, setBackfillDone] = useState<string | null>(null);
  const backfillStarted = useRef<string | null>(null);
  const prepared = useRef(new Set<string>());

  useEffect(() => {
    if (!project || !sequenceReady || backfillStarted.current === project.id) return;
    backfillStarted.current = project.id;
    const start = startClusterNo(project);
    const needed = shouldBackfillSkippedClusters({ startCluster: start, clusterStateName: project.clusterStateName, trackings })
      && backfillNeeded(states, trackings, start);
    const id = project.id;
    void (needed ? writes.backfill(project, states) : Promise.resolve(null)).finally(() => setBackfillDone(id));
  }, [project, sequenceReady, states, trackings, writes]);

  useEffect(() => {
    if (!project || !selected || !sequenceReady || backfillDone !== project.id) return;
    const key = `${project.id}:${selected.id}`;
    if (prepared.current.has(key)) return;
    prepared.current.add(key);
    void writes.prepareCluster(project, selected);
  }, [project, selected, sequenceReady, backfillDone, writes]);

  return {
    restart: () => { backfillStarted.current = null; prepared.current.clear(); setBackfillDone(null); },
  };
}
