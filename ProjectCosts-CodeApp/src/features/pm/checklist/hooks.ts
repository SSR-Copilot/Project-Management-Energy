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
 * FLOWS (D81, 4 Nov 2026; `ProjectDocs/app-docs/16-PM-FLOWS-IN-THE-CODE-APP.md`) — called through `data/flows.ts`,
 * each inside ONE `usePlanWrite` job with the canvas's writes around it (`PlanJob.then`), in the canvas order:
 *  - Request Approval: the pre-flow patch → `PerformCommonRequestofGateApproval` / `…CheckListApproval` → the
 *    `runid`-gated write-back (checklist mode) and the audit note;
 *  - Cancel Approval Request: the tracking patch → `PerformRequestofGateApprovalCancellation` → the note;
 *  - the row's ✕: `PerformRequestofCheckListApprovalCancellation`, then the refresh.
 * Before D81 these three controls were visible and disabled (D29: the flows send mails / Teams cards).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ES, ES_PROCESS } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { CHECKLIST_BULK } from "@/data/checklistBulkFlags";
import { resetChecklistPeopleCache } from "@/data/checklistPeople";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { emptyPlan, refusePlan } from "@/data/writePlan";
import {
  cancelChecklistApproval as cancelChecklistApprovalFlow, cancelGateApproval as cancelGateApprovalFlow,
  requestChecklistApproval, requestGateApproval,
} from "@/data/flows";
import {
  countClusterChecklistRows, listChecklistApprovalSettings, listChecklistGates, listChecklistProjectStates,
  listChecklistTrackings, listClusterChecklist, listClusterTemplates, listHistory, loadChecklistProject,
  type HistoryEntry,
} from "@/data/checklist";
import {
  MSG, appIdRefusal, backfillNeeded, checklistCancelSucceeded, checklistHtmlTable, gateCancellationPayload, needsTemplates,
  planChecklistApprovalRequestFollowUp, planChecklistApprovalRequestPatch, planChecklistRowPatch, planClusterTransition,
  planGateApprovalRequestNote, planGateApprovalRequestPatch, planGateCancelNote, planGateCancelPatch,
  planPrepareCluster, planReturnToPreviousCluster, planSkippedClusterBackfill, planTerminalStateChange,
  shouldBackfillSkippedClusters, startClusterNo, trackingFor, clusterTransitionDone, flowMovesCluster,
  staleClusterRequestRefusal, staleReturnRefusal, staleSaveRefusal, staleTaskRequestRefusal,
  type ChecklistApprovalSetting, type ChecklistProject, type ChecklistRow, type GateSetting,
  type HistoryQueryDescriptor, type ProjectStateRef, type SequenceEntry, type TerminalStaging,
  type TrackingRow, type WritePlan,
} from "./rules";

/** NEW (6 Nov 2026): how long, and how often, the screen waits for the gate flow to move a cluster on. */
const TRANSITION_WAIT_MS = 30_000;
const TRANSITION_POLL_MS = 1_500;

/**
 * Re-reads the trackings until the gate flow has completed `clusterStateId`, for at most 30 seconds (the canvas
 * tooltip's "wait 30 Seconds"). True once it has; false on time-out, and the refresh after the job then shows
 * whatever the server has. A failed read is not an error here: it just waits for the next one.
 */
async function waitForClusterTransition(projectId: string, clusterStateId: string): Promise<boolean> {
  const deadline = Date.now() + TRANSITION_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => { setTimeout(resolve, TRANSITION_POLL_MS); });
    try {
      if (clusterTransitionDone(await listChecklistTrackings(projectId), clusterStateId)) return true;
    } catch {
      // keep waiting
    }
  }
  return false;
}

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

/**
 * `ScreenData` plus `hasData` (C1 / C4): the query HAS an answer (possibly of an earlier refresh), so the Screen can tell "no
 * answer yet" and "no answer, it failed" from "an empty answer", and a failed refetch need not blank the screen.
 */
export type ReadResult<T> = ScreenData<T> & { hasData?: boolean };

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ReadResult<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true, hasData: q.data !== undefined });

/**
 * The cache keys every checklist write refreshes (C5, CN-4): what a write can change (the project and its cluster state, the
 * trackings, the rows, the approval settings and the history) plus the other screens' copies of the project. NOT the
 * project states, the gates or the Entra lookups, which no write on this screen changes; `checklistAll` refetched them (and
 * the Entra reads) after every visit to a cluster. The command bar's Refresh still refreshes everything (`refresh()`).
 */
export const checklistWriteKeys = (projectId: string) => [
  qk.checklist(projectId, "project"), qk.checklist(projectId, "trackings"), qk.checklist(projectId, "rows"),
  qk.checklist(projectId, "approvals"), qk.checklist(projectId, "history"),
  qk.project(projectId), qk.generalDataProject(projectId), qk.stateTrackings(projectId), qk.milestoneProject(projectId),
] as const;

const NONE: never[] = [];

export interface ClusterSequenceData {
  states: ProjectStateRef[];
  trackings: TrackingRow[];
  gates: GateSetting[];
}

/** `gblRecordSelectedProject` — re-read on every visit, as `OnVisible` does. */
export function useChecklistProject(projectId: string | undefined): ReadResult<ChecklistProject | null> & { isFetching: boolean } {
  const q = useQuery({
    queryKey: qk.checklist(projectId ?? "", "project"),
    queryFn: () => loadChecklistProject(projectId!),
    enabled: Boolean(projectId),
  });
  return { ...out(q, null), isFetching: q.isFetching };
}

/** The states, the project's trackings and its active gates — what the two sequences are built from. */
export function useClusterSequence(
  projectId: string | undefined,
  project: ChecklistProject | null,
): ReadResult<ClusterSequenceData> & { isFetching: boolean } {
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
    // Every part that is asked for has an answer (the gates are asked for once the project is known).
    hasData: states.data !== undefined && trackings.data !== undefined && (project === null || gates.data !== undefined),
  };
}

/** `colProjectCheckList` — the selected cluster's active tasks. */
export function useClusterChecklist(projectId: string | undefined, clusterStateId: string | null): ReadResult<ChecklistRow[]> {
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
): ReadResult<ChecklistApprovalSetting[]> {
  // D138 (A3): rebuilt only when the rows change, not on every render (the query key is the same by value either way).
  const ids = useMemo(
    () => [...new Set(rows.map((r) => r.projectDefaultChecklistId).filter((x): x is string => Boolean(x)))].sort(),
    [rows],
  );
  const q = useQuery({
    queryKey: qk.checklist(projectId ?? "", "approvals", ...ids),
    queryFn: () => listChecklistApprovalSettings(ids),
    enabled: Boolean(projectId) && ids.length > 0,
  });
  return out(q, NONE as ChecklistApprovalSetting[]);
}

/** The panel history for `historyDescriptor(panel)`. */
export function useHistory(projectId: string | undefined, descriptor: HistoryQueryDescriptor | null): ReadResult<HistoryEntry[]> {
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

/** Request Approval (`pcf_…_Buttons_RequestApproval.OnChange`, D81): the cluster branch and the checklist branch. */
export type ApprovalRequest =
  | {
      kind: "cluster";
      project: ChecklistProject;
      state: SequenceEntry;
      gate: GateSetting | null;
      comment: string;
      approvalDueDate: string | null;
    }
  | {
      kind: "checklist";
      project: ChecklistProject;
      row: ChecklistRow;
      /** `LookUp('Check List Default Approvals', template).'Check List Default Approval'` — the first row, active or not. */
      checkListDefaultApprovalId: string;
      /** `locRecordSelectedProjectState.'Project State'` — the selected cluster. */
      currentStateId: string;
      /** The row's approval-mode icon is People: "Approval requested"; otherwise "Completed and notified about Check List". */
      approvalRequested: boolean;
      comment: string;
      approvalDueDate: string | null;
    };

/** Cancel Approval Request (`pcf_…_Buttons_CancelApproval.OnChange`, D81). */
export interface GateCancelRequest {
  project: ChecklistProject;
  state: SequenceEntry;
  gate: GateSetting | null;
  previous: SequenceEntry | null;
  next: SequenceEntry | null;
  comment: string;
  /** `gblCurrentUser.DisplayName`. */
  userDisplayName: string;
  /** `gblProjectManagmentAppID` — the environment variable `vsb_ProjectManagementAppID`. */
  appId: string;
}

/**
 * What a panel's Save does the moment the writes are over (D106): `onWritten` closes the panel, then the reload shows the
 * canvas's next spinner ("Loading, please wait...") behind the closed panel.
 */
export interface WriteEnd { onWritten: (ok: boolean) => void }
const endOf = (after?: WriteEnd): { onWritten?: (ok: boolean) => void; reloadProgress?: string } =>
  after ? { onWritten: after.onWritten, reloadProgress: MSG.loading } : {};

/** Runs the screen's writes and refreshes the screen, the header and the other project views. */
export function useChecklistWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  const qc = useQueryClient();
  const w = usePlanWrite({
    invalidate: checklistWriteKeys(id),
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

  /**
   * `but_Project_States_CheckList_Refresh` for the selected cluster: ensure the tracking, then copy the templates.
   * C5: the reads come first, WITHOUT the blocking overlay; an empty plan (the usual visit: the tracking and the rows are
   * there) skips the write job altogether: no overlay, no refetch of the screen's data. A failed read is still the job's
   * error, shown as before. DIVERGENCE: D127 §8 (the canvas ran its spinner for every visit).
   */
  const prepareCluster = async (project: ChecklistProject, selected: SequenceEntry): Promise<string[] | null> => {
    let plan: WritePlan;
    try {
      const [trackings, count] = await Promise.all([
        listChecklistTrackings(id), countClusterChecklistRows(id, selected.id),
      ]);
      const tracking = trackingFor(trackings, selected.id);
      const templates = needsTemplates(tracking, selected, count) ? await listClusterTemplates(project, selected.id) : [];
      // D138 (B1): with the switch on, the bulk backend learns the table (a separate chunk, loaded only now).
      const bulk = CHECKLIST_BULK.materialise && templates.length > 0;
      if (bulk) (await import("@/data/checklistBulk")).registerChecklistBulk();
      plan = planPrepareCluster({
        selected, tracking, existingRowCount: count, templates, ctx: ctx(project), ...(bulk ? { materialise: { bulk: true } } : {}),
      });
    } catch (e) {
      return w.run({ progress: MSG.loading, plan: () => Promise.reject(e) });
    }
    if (plan.writes.length === 0) return [];
    return w.run({ progress: MSG.loading, plan });
  };

  const patchRow = (row: ChecklistRow, data: Record<string, unknown>, texts: { progress: string; success?: string; error: (d: string) => string }) =>
    w.run({ progress: texts.progress, ...(texts.success ? { success: texts.success } : {}), errorText: texts.error, plan: planChecklistRowPatch(row.id, data, row.title) });

  /** `pcf_…_Buttons_Save` (Y:5235-5411): the direct move, with the cluster's task table as the note. */
  const saveTransition = (req: TransitionRequest, after?: WriteEnd) => w.run({
    progress: MSG.clusterSaving(req.state.name),
    ...endOf(after),
    // No green "Cluster data '…' will be saved." bar after the move (PO, 3 Nov 2026).
    errorText: MSG.projectStatusError,
    plan: async () => {
      const [trackings, rows] = await Promise.all([listChecklistTrackings(id), listClusterChecklist(id, req.state.id)]);
      // C6: the fresh read must still show the cluster In Progress, as the button did when it was drawn.
      const stale = staleSaveRefusal(req.state, trackingFor(trackings, req.state.id));
      if (stale) return refusePlan(stale);
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
      // C6: the cluster must still be In Progress, Rejected or Request canceled, as when the button was drawn.
      const stale = staleReturnRefusal(req.state, tracking);
      if (stale) return refusePlan(stale);
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

  /**
   * `pcf_…_Buttons_RequestApproval.OnChange` (Y:5470-5720), D81: the pre-flow patch → the flow → the write-back and
   * the note, in the canvas order, as one job. Cluster mode: the flow updates the tracking row itself, so only the
   * note follows; the row's id (an existing tracking, or the one the patch created) is the flow's StateTrackingGUID.
   */
  const requestApproval = (req: ApprovalRequest, after?: WriteEnd) => {
    if (req.kind === "checklist") {
      return w.run({
        progress: MSG.pleaseWait, errorText: MSG.projectStatusError, ...endOf(after),
        plan: async () => {
          // C6: a fresh read of the task; one whose approval was requested (or completed) meanwhile is not requested again.
          const fresh = (await listClusterChecklist(id, req.currentStateId)).find((r) => r.id === req.row.id);
          const stale = fresh ? staleTaskRequestRefusal(fresh) : null;
          if (stale) return refusePlan(stale);
          return planChecklistApprovalRequestPatch({
            row: req.row, comment: req.comment, approvalDueDate: req.approvalDueDate, canEdit: CAN_EDIT_SELECTED_PROJECT,
          });
        },
        then: async () => planChecklistApprovalRequestFollowUp({
          project: req.project, row: req.row, approvalRequested: req.approvalRequested,
          result: await requestChecklistApproval({
            projectId: req.project.id, checklistId: req.row.id,
            checkListDefaultApprovalId: req.checkListDefaultApprovalId, currentProjectStateId: req.currentStateId,
          }),
        }),
      });
    }
    let trackingId: string | null = null;
    return w.run({
      progress: MSG.pleaseWait, errorText: MSG.projectStatusError, ...endOf(after),
      plan: async () => {
        const tracking = trackingFor(await listChecklistTrackings(id), req.state.id);
        trackingId = tracking?.id ?? null;
        // C6: no second request while an approval is running or the cluster is completed.
        const stale = staleClusterRequestRefusal(req.state, tracking);
        if (stale) return refusePlan(stale);
        return planGateApprovalRequestPatch({
          project: req.project, state: req.state, tracking, gate: req.gate,
          comment: req.comment, approvalDueDate: req.approvalDueDate, canEdit: CAN_EDIT_SELECTED_PROJECT,
        });
      },
      then: async (first, ctl) => {
        const stateTrackingId = trackingId ?? first.createdIds[0] ?? "";
        await requestGateApproval({
          projectId: req.project.id, stateId: req.state.id, stateTrackingId, defaultApprovalId: req.state.gateId ?? "",
        });
        // NEW (6 Nov 2026): an Only Notifications gate is moved on by the flow itself, seconds after it answers.
        // The loader stays until that has happened, so the screen does not open on the half-way state.
        if (flowMovesCluster(req.gate)) {
          ctl.setProgress(MSG.clusterTransitionInProgress);
          await waitForClusterTransition(id, req.state.id);
        }
        const rows = await listClusterChecklist(id, req.state.id);
        return planGateApprovalRequestNote({
          project: req.project, state: req.state, trackingId: stateTrackingId, comment: req.comment,
          noteHtml: checklistHtmlTable(rows),
        });
      },
    });
  };

  /** `pcf_…_Buttons_CancelApproval.OnChange` (Y:1536-1640), D81: the tracking patch → the cancellation flow → the note. */
  const cancelGateApproval = (req: GateCancelRequest) => {
    let tracking: TrackingRow | null = null;
    return w.run({
      progress: MSG.cancelApprovalSent(req.state.name), errorText: MSG.projectStatusError,
      plan: async () => {
        // C7: refused BEFORE anything is read or patched; the flow needs the app id and the patch cannot be undone.
        const noApp = appIdRefusal(req.appId);
        if (noApp) return refusePlan(noApp);
        tracking = trackingFor(await listChecklistTrackings(id), req.state.id);
        if (!tracking) return refusePlan(MSG.noTrackingToCancel);
        return planGateCancelPatch({ project: req.project, tracking, canEdit: CAN_EDIT_SELECTED_PROJECT });
      },
      then: async (_first, ctl) => {
        ctl.setProgress(MSG.cancelClusterApproval);
        await cancelGateApprovalFlow({
          appId: req.appId,
          project: gateCancellationPayload({
            project: req.project, state: req.state, tracking: tracking!, gate: req.gate, previous: req.previous, next: req.next,
          }),
        });
        return planGateCancelNote({ project: req.project, tracking: tracking!, comment: req.comment, userDisplayName: req.userDisplayName });
      },
    });
  };

  /** `ico_…_ListRow_CancelApproval.OnSelect` (Y:3689-3703), D81: the flow, then `Refresh('Project Checklists')`. */
  const cancelChecklistApproval = (row: ChecklistRow) => w.run({
    progress: MSG.cancelingChecklistApproval,
    plan: emptyPlan(),
    then: async () => {
      const result = await cancelChecklistApprovalFlow(row.id);
      // DIVERGENCE (rule 3): the canvas keeps `.success` in a context variable and shows nothing for a false.
      if (!checklistCancelSucceeded(result)) throw new Error(MSG.checklistCancelFailed(row.title));
      return null;
    },
  });

  return {
    progress: w.progress, error: w.error, success: w.success, clear: w.clear,
    backfill, prepareCluster, patchRow, saveTransition, returnToPrevious, changeTerminal,
    requestApproval, cancelGateApproval, cancelChecklistApproval,
    /** The command bar's Refresh (`Navigate` to the same screen) and the history Refresh. */
    refresh: (part?: string) => {
      // D138 (A2): the command bar's Refresh re-asks Entra too; a history-only refresh does not need to.
      if (!part) resetChecklistPeopleCache();
      return qc.invalidateQueries({ queryKey: part ? qk.checklist(id, part) : qk.checklistAll(id) });
    },
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
  /**
   * D138 (A3): `writes` is a new object on every render, so listing it in the effects' dependencies re-ran both of
   * them after every render (a comment keystroke included); they were idle only because of the guards below. The latest copy is
   * read through a ref instead, and `restart()` bumps `epoch` so a Refresh still runs the visit again, now by design rather than
   * by the side effect of a changing `writes`.
   */
  const writesRef = useRef(writes);
  useEffect(() => { writesRef.current = writes; });
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (!project || !sequenceReady || backfillStarted.current === project.id) return;
    backfillStarted.current = project.id;
    const start = startClusterNo(project);
    const needed = shouldBackfillSkippedClusters({ startCluster: start, clusterStateName: project.clusterStateName, trackings })
      && backfillNeeded(states, trackings, start);
    const id = project.id;
    // C10 (CW-2): the cluster is prepared only after the back-fill succeeded (or was not needed). A failed back-fill leaves
    // its error on screen, which the next job's run() would have cleared. Refresh runs the visit again.
    // DIVERGENCE: D127 §9 (the canvas ran the preparation whatever the back-fill did).
    void (needed ? writesRef.current.backfill(project, states) : Promise.resolve<string[] | null>([])).then((result) => {
      if (result !== null) setBackfillDone(id);
    });
  }, [project, sequenceReady, states, trackings, epoch]);

  useEffect(() => {
    if (!project || !selected || !sequenceReady || backfillDone !== project.id) return;
    const key = `${project.id}:${selected.id}`;
    if (prepared.current.has(key)) return;
    prepared.current.add(key);
    void writesRef.current.prepareCluster(project, selected);
  }, [project, selected, sequenceReady, backfillDone]);

  return {
    restart: () => { backfillStarted.current = null; prepared.current.clear(); setBackfillDone(null); setEpoch((e) => e + 1); },
  };
}
