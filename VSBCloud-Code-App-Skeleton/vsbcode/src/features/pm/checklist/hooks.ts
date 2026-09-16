/**
 * Project General CheckList Screen — queries, mutations and the four flow calls.
 *
 * Canvas screen: `Project General CheckList Screen` (PM app)
 *   141 controls · 5 606 lines of Power Fx · 66 substantive blocks · band L
 *
 * `OnVisible` re-queried `'Project State Trackings'` FIVE times and rebuilt six
 * collections; `but_Project_States_CheckList_Refresh.OnSelect` did it all again on every
 * cluster click. Here there is one query key per table, invalidated on mutation.
 *
 * Every mutation hands a plan from `rules.ts` to `dataClient.batch`, so a cluster
 * transition is one bounded fan-out rather than a `Patch` chain that can half-apply.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, projectStateRepo, projectStateTrackingFullRepo,
  projectChecklistFullRepo, projectDefaultChecklistRepo, projectDefaultApprovalsFullRepo,
  checkListDefaultApprovalRepo, projectStateTrackingNoteRepo,
  projectChecklistTrackingNoteRepo, checklistCountryAndTechnologyRepo, countryRepo,
  type ProjectRow,
} from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { ES, ES_PROCESS } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import { f, asc, desc } from "@/platform/odata";
import { toAppError, ok, err, type AppError, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  performCheckListApproval, performGateApproval,
  cancelCheckListApproval, cancelGateApproval,
} from "@/flows/flowClient";
import {
  TRACKING_COL, CHECKLIST_COL, NOTE_COL, PROJECT_COLUMN,
  planSkippedClusterBackfill, shouldBackfillSkippedClusters, planEnsureTracking,
  planChecklistMaterialisation, shouldMaterialiseChecklist, planClusterTransition,
  planTerminalStateChange, planGateCancel, planWasRefused, startClusterNo,
  checklistApprovalArgs, gateApprovalArgs, gateCancelArgs, flowWriteBackPatch,
  checklistCancelSucceeded, CHECKLIST_CANCEL_FAILED,
  approvalPersonaSnapshot, checklistNoteWrite, historyDescriptor,
  type ChecklistProject, type ChecklistRow, type TrackingRow, type ProjectStateRef,
  type GateSetting, type ChecklistApprovalSetting, type DefaultChecklistTemplate,
  type SequenceEntry, type PanelState, type TerminalStaging, type WritePlan,
  type FlowResult,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const REF_STALE = 30 * 60_000;

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

export const checklistKeys = {
  states: ["ref", "projectStates", "checklist"] as const,
  trackings: (projectId: string) => qk.child("projectStateTrackings", projectId),
  checklists: (projectId: string, clusterId: string) =>
    ["child", "projectChecklists", projectId, clusterId] as const,
  gates: (countryId: string, technology: string) =>
    ["ref", "projectDefaultApprovals", countryId, technology] as const,
  checklistApprovals: (clusterId: string) =>
    ["ref", "checkListDefaultApprovals", clusterId] as const,
  templates: (clusterId: string, countryId: string, technology: string) =>
    ["ref", "projectDefaultChecklists", clusterId, countryId, technology] as const,
  history: (kind: string, id: string) => ["child", "checklistHistory", kind, id] as const,
};

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export function toChecklistProject(r: ProjectRow | undefined): ChecklistProject | null {
  if (!r) return null;
  return {
    id: r.vsb_projectid,
    projectName: r.vsb_name,
    projectNumber: r.vsb_internalprojectid,
    startCluster: num(r[PROJECT_COL.startCluster]),
    clusterStateId: r._vsb_clusterstate_value,
    clusterStateName:
      str(r["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"]),
    approvalState: num(r[PROJECT_COL.approvalState]),
    countryId: r._vsb_country_value,
    // `ProjectRow` declares `vsb_technology` as `string | null`; it is a picklist
    // (`vsb_technology`, Wind = 952850000 …), so it arrives as a number. Read through
    // the index signature rather than "fixing" the shared row type from a feature.
    technology: num(r["vsb_technology"]),
    owningBusinessUnitId: str(r["_owningbusinessunit_value"]),
    totalCapacity: r.vsb_totalcapacity,
    netYieldP50: r.vsb_netyieldp50,
    milestones: {
      projectStartDate: str(r[PROJECT_COL.projectStartDate]),
      feasibilityStudies: str(r[PROJECT_COL.feasibilityStudies]),
      projectDevelopmentStarted: str(r[PROJECT_COL.projectDevelopmentStarted]),
      applicationSubmitted: str(r[PROJECT_COL.applicationSubmitted]),
      legallyBindingPermits: str(r[PROJECT_COL.legallyBindingPermits]),
      fid: str(r[PROJECT_COL.fid]),
      construction: str(r[PROJECT_COL.construction]),
      cod: str(r[PROJECT_COL.cod]),
    },
  };
}

export const toProjectStateRef = (r: Record<string, unknown>): ProjectStateRef => ({
  id: String(r["vsb_projectstateid"] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  order: num(r["vsb_order"]) ?? 0,
  isVisibleOnChecklist: r["vsb_isvisibleonchecklist"] === true,
  clusterDescription: str(r["vsb_clusterdescription"]),
});

export const toTrackingRow = (r: Record<string, unknown>): TrackingRow => ({
  id: String(r[TRACKING_COL.id] ?? ""),
  clusterStateId: str(r[TRACKING_COL.clusterState]),
  clusterStateName: str(
    r[`${TRACKING_COL.clusterState}@OData.Community.Display.V1.FormattedValue`],
  ) ?? str(r[TRACKING_COL.name]),
  approvalClusterState: num(r[TRACKING_COL.approvalClusterState]),
  clusterStepState: num(r[TRACKING_COL.clusterStepState]),
  approvalComment: str(r[TRACKING_COL.approvalComment]),
  approvalDueDate: str(r[TRACKING_COL.approvalDueDate]),
  flowRunId: str(r[TRACKING_COL.flowRunId]),
  flowApprovalId: str(r[TRACKING_COL.flowApprovalId]),
});

/** Rule 12's flat projection, renaming the Dataverse columns to the gallery's shape. */
export const toChecklistRow = (r: Record<string, unknown>): ChecklistRow => ({
  id: String(r[CHECKLIST_COL.id] ?? ""),
  title: String(r[CHECKLIST_COL.name] ?? ""),
  clusterStateId: str(r[CHECKLIST_COL.clusterState]),
  gateRelevance: r[CHECKLIST_COL.gateRelevance] === true,
  holdingDescription: str(r[CHECKLIST_COL.holdingTaskDescription]),
  isCompletionDate: r[CHECKLIST_COL.isCompletionDate] === true,
  completionDate: str(r[CHECKLIST_COL.completionDate]),
  taskState: num(r[CHECKLIST_COL.taskState]),
  approvalChecklistState: num(r[CHECKLIST_COL.approvalChecklistState]),
  note: str(r[CHECKLIST_COL.comments]),
  sort: num(r[CHECKLIST_COL.order]) ?? 0,
  projectDefaultChecklistId: str(r[CHECKLIST_COL.projectDefaultChecklist]),
  flowRunId: str(r[CHECKLIST_COL.flowRunId]),
  flowApprovalId: str(r[CHECKLIST_COL.flowApprovalId]),
});

export const toGateSetting = (r: Record<string, unknown>): GateSetting => ({
  id: String(r["vsb_projectdefaultapprovalsid"] ?? ""),
  clusterStateId: str(r["_vsb_clusterstate_value"]),
  approvalMode: num(r["vsb_approvalmodecode"]),
  gateActive: r["vsb_gateactive"] === true,
  portfolioManagerId: str(r["_vsb_approvalparticipant1_value"]),
  portfolioManagerMail: str(
    r["_vsb_approvalparticipant1_value@OData.Community.Display.V1.FormattedValue"],
  ),
  defaultApprovals: str(r["vsb_defaultapprovals"]),
  defaultContributors: str(r["vsb_defaultcontributors"]),
  defaultNotifications: str(r["vsb_defaultnotifications"]),
});

export const toChecklistApprovalSetting = (
  r: Record<string, unknown>,
): ChecklistApprovalSetting => ({
  id: String(r["vsb_checklistdefaultapprovalsid"] ?? ""),
  projectDefaultChecklistId: str(r["_vsb_projectdefaultchecklistid_value"]),
  approvalMode: num(r["vsb_approvalmodecode"]),
  gateActive: r["vsb_gateisactive"] === true,
  portfolioManagerMail: str(
    r["_vsb_portfoliomanagerid_value@OData.Community.Display.V1.FormattedValue"],
  ),
  defaultApprovers: str(r["vsb_defaultapprovers"]),
  defaultContributors: str(r["vsb_defaultcontributors"]),
  defaultNotifications: str(r["vsb_defaultnotifications"]),
});

export const toTemplate = (r: Record<string, unknown>): DefaultChecklistTemplate => ({
  id: String(r["vsb_projectdefaultchecklistsid"] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  clusterStateId: str(r["_vsb_clusterstate_value"]),
  gateRelevance: r["vsb_gaterelevance"] === true,
  holdingTaskDescription: str(r["vsb_holdingtaskdescription"]),
  isCompletionDate: r["vsb_iscompletiondate"] === true,
  order: num(r["vsb_order"]) ?? 0,
});

/* ══════════════════════════════════════════════════════════════════ queries ════ */

export function useChecklistProject(projectId: string | undefined) {
  const user = useAppStore((s) => s.session.user);
  const q = useQuery({
    queryKey: qk.projects.one(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!),
  });
  return {
    project: useMemo(() => toChecklistProject(q.data), [q.data]),
    language: user?.language ?? "en-US",
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * The three queries the sequence is built from: `Project States` filtered
 * `vsb_isvisibleonchecklist eq true` and ordered by `vsb_order`; the project's
 * `Project State Trackings`; and the ACTIVE `Project Default Approvals` for the project's
 * country and technology (step 4).
 */
export function useClusterSequence(project: ChecklistProject | null) {
  const states = useQuery({
    queryKey: checklistKeys.states,
    staleTime: REF_STALE,
    queryFn: async (): Promise<ProjectStateRef[]> => {
      const rows = await projectStateRepo.listAll({
        filter: f.eq("vsb_isvisibleonchecklist", true),
        orderBy: [asc("vsb_order")],
      });
      return rows.map(toProjectStateRef);
    },
  });

  const trackings = useQuery({
    queryKey: checklistKeys.trackings(project?.id ?? "none"),
    enabled: Boolean(project?.id),
    queryFn: async (): Promise<TrackingRow[]> => {
      const rows = await projectStateTrackingFullRepo.listAll({
        filter: f.guid(TRACKING_COL.project, project!.id),
      });
      return rows.map(toTrackingRow);
    },
  });

  const gates = useQuery({
    queryKey: checklistKeys.gates(
      project?.countryId ?? "", String(project?.technology ?? ""),
    ),
    enabled: Boolean(project?.countryId && project?.technology !== null),
    staleTime: REF_STALE,
    queryFn: async (): Promise<GateSetting[]> => {
      const rows = await projectDefaultApprovalsFullRepo.listAll({
        filter: f.and(
          f.eq("vsb_gateactive", true),
          f.guid("_vsb_approvalscountry_value", project!.countryId!),
          f.eq("vsb_technologycode", project!.technology!),
        ),
      });
      return rows.map(toGateSetting);
    },
  });

  return {
    states: states.data ?? [],
    trackings: trackings.data ?? [],
    gates: gates.data ?? [],
    startCluster: startClusterNo(project),
    isLoading: states.isLoading || trackings.isLoading || gates.isLoading,
    isError: states.isError || trackings.isError,
    error: (states.error ?? trackings.error ?? gates.error) as AppError | null,
  };
}

/** The selected cluster's checklist rows. `Status = Active` is a server-side filter. */
export function useClusterChecklist(
  projectId: string | undefined,
  clusterStateId: string | null,
) {
  const q = useQuery({
    queryKey: checklistKeys.checklists(projectId ?? "none", clusterStateId ?? "none"),
    enabled: Boolean(projectId && clusterStateId),
    queryFn: async (): Promise<ChecklistRow[]> => {
      const rows = await projectChecklistFullRepo.listAll({
        filter: f.and(
          f.guid(CHECKLIST_COL.project, projectId!),
          f.guid(CHECKLIST_COL.clusterState, clusterStateId!),
          // Rule 12 — `Status = 'Status (Project Checklists)'.Active`, filtered on the
          // server (step 7), not with a client-side `Filter` over the whole table.
          f.eq("statecode", 0),
        ),
        orderBy: [asc(CHECKLIST_COL.order)],
      });
      return rows.map(toChecklistRow);
    },
  });
  return {
    rows: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error as AppError | null,
  };
}

/** `Check List Default Approvals` for the cluster's templates (rules 13–15). */
export function useChecklistApprovalSettings(clusterStateId: string | null) {
  const q = useQuery({
    queryKey: checklistKeys.checklistApprovals(clusterStateId ?? "none"),
    enabled: Boolean(clusterStateId),
    staleTime: REF_STALE,
    queryFn: async (): Promise<ChecklistApprovalSetting[]> => {
      const rows = await checkListDefaultApprovalRepo.listAll({
        filter: f.eq("vsb_gateisactive", true),
      });
      return rows.map(toChecklistApprovalSetting);
    },
  });
  return { settings: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Rule 11's templates. The country/technology scope comes from
 * `Checklist Country And Technology`, which the canvas navigated through as
 * `'Associated Country And Technology'.Country.Country` and `.Technology` — two levels of
 * lookup traversal per row. Here the matching scope rows are resolved once and the
 * templates are filtered on their id.
 */
export function useDefaultChecklistTemplates(
  project: ChecklistProject | null,
  clusterStateId: string | null,
) {
  const q = useQuery({
    queryKey: checklistKeys.templates(
      clusterStateId ?? "none", project?.countryId ?? "", String(project?.technology ?? ""),
    ),
    enabled: Boolean(clusterStateId && project?.countryId && project?.technology !== null),
    staleTime: REF_STALE,
    queryFn: async (): Promise<DefaultChecklistTemplate[]> => {
      const scopes = await checklistCountryAndTechnologyRepo.listAll({
        filter: f.and(
          f.guid("_vsb_country_value", project!.countryId!),
          f.eq("vsb_technology", project!.technology!),
        ),
      });
      const scopeIds = scopes
        .map((s) => String(s["vsb_checklistcountryandtechnologyid"] ?? ""))
        .filter(Boolean);
      if (!scopeIds.length) return [];
      const rows = await projectDefaultChecklistRepo.listAll({
        filter: f.and(
          f.eq("statecode", 0),
          f.guid("_vsb_clusterstate_value", clusterStateId!),
          f.inList("_vsb_associatedcountryandtechnology_value", scopeIds),
        ),
        orderBy: [asc("vsb_order")],
      });
      return rows.map(toTemplate);
    },
  });
  return { templates: q.data ?? [], isLoading: q.isLoading };
}

const CREATED_BY_FORMATTED =
  `${NOTE_COL.createdBy}@OData.Community.Display.V1.FormattedValue`;

/**
 * Rule 27 — the history, per panel kind, ordered on the server.
 *
 * GUIDE q20 — each comment is followed by "by <author>" in the recording ("# Azure VSB
 * Cloud Flow Service …", "Lucas Georg"). `createdby` is a standard Dataverse audit column
 * on every table, so it is added to this ONE query's own select rather than to the shared
 * note repos' `defaultSelect` — no other screen needs it.
 */
export function useHistory(panel: PanelState | null) {
  const descriptor = panel ? historyDescriptor(panel) : null;
  const q = useQuery({
    queryKey: checklistKeys.history(
      descriptor?.entitySet ?? "none", descriptor?.lookupValue ?? "none",
    ),
    enabled: Boolean(descriptor),
    queryFn: async () => {
      const repo = descriptor!.entitySet === ES_PROCESS.projectChecklistTrackingNotes
        ? projectChecklistTrackingNoteRepo
        : projectStateTrackingNoteRepo;
      const rows = await repo.listAll({
        select: [...repo.defaultSelect, NOTE_COL.createdBy, CREATED_BY_FORMATTED],
        filter: f.guid(descriptor!.lookupColumn, descriptor!.lookupValue),
        orderBy: [desc(NOTE_COL.createdOn)],
      });
      return rows.map((r) => ({
        id: String(r["vsb_projectstatetrackingnoteid"]
          ?? r["vsb_projectchecklisttrackingnoteid"] ?? ""),
        name: str(r[NOTE_COL.name]),
        comment: str(r[NOTE_COL.comment]),
        createdOn: str(r[NOTE_COL.createdOn]),
        createdByName: str(r[CREATED_BY_FORMATTED]),
      }));
    },
  });
  return {
    entries: q.data ?? [], isLoading: q.isLoading, descriptor,
    // GUIDE q20 — the "History" section header's refresh icon.
    refetch: q.refetch,
  };
}

/**
 * GUIDE q18/q19 — the "Country Description" checklist column. `Project Checklists` has no
 * per-row country field; the value the recording shows is the same for every row in a
 * project's checklist, which is consistent with it being the PROJECT's own country
 * (`countryRepo`, already used elsewhere) rather than a column this screen invents.
 */
export function useChecklistCountryName(countryId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["ref", "country", countryId ?? "none"] as const,
    enabled: Boolean(countryId),
    staleTime: REF_STALE,
    queryFn: () => countryRepo.getById(countryId!),
  });
  return q.data?.vsb_name ?? null;
}

/* ══════════════════════════════════════════════════════════════ plan execution ════ */

async function runPlan(plan: WritePlan, source: string): Promise<Result<WritePlan>> {
  if (planWasRefused(plan)) {
    return err(toAppError(
      { status: 403, message: "You do not have permission to edit this project." },
      source,
    ));
  }
  if (!plan.writes.length) return ok(plan);
  try {
    trace("information", source, { writes: plan.writes.length, log: plan.log });
    // One bounded fan-out for every write in the plan — the canvas issued a Patch chain
    // that could half-apply.
    await dataClient.batch(plan.writes.map(({ op, entitySet, id, data }) =>
      ({ op, entitySet, id, data })));
    return ok(plan);
  } catch (e) {
    return err(toAppError(e, source));
  }
}

/** Exposed so the tests can assert the batch shape without a live client. */
export const planToBatchOps = (plan: WritePlan) =>
  plan.writes.map(({ op, entitySet, id, data }) => ({ op, entitySet, id, data }));

function useProjectInvalidation() {
  const qc = useQueryClient();
  return (projectId: string, clusterStateId?: string | null) => {
    void qc.invalidateQueries({ queryKey: checklistKeys.trackings(projectId) });
    void qc.invalidateQueries({ queryKey: qk.projects.one(projectId) });
    if (clusterStateId) {
      void qc.invalidateQueries({
        queryKey: checklistKeys.checklists(projectId, clusterStateId),
      });
    }
  };
}

/* ═══════════════════════════════════════════════════════════ the self-heal writes ════ */

export interface BackfillArgs {
  project: ChecklistProject;
  states: ProjectStateRef[];
  trackings: TrackingRow[];
  canEdit: boolean;
}

/**
 * Rule 3–5 — the skipped-cluster back-fill.
 *
 * Guarded exactly as the source is (`shouldBackfillSkippedClusters`) and idempotent by
 * construction: a second run over the rows the first run wrote produces an empty plan and
 * therefore issues no request at all (step 5).
 */
export async function backfillSkippedClusters(
  args: BackfillArgs,
): Promise<Result<WritePlan>> {
  const startCluster = startClusterNo(args.project);
  if (!shouldBackfillSkippedClusters({
    startCluster,
    clusterStateName: args.project.clusterStateName,
    trackings: args.trackings,
  })) {
    return ok({ writes: [], log: ["Back-fill not required."] });
  }
  if (!args.canEdit) {
    return ok({ writes: [], log: ["Refused: you do not have permission to edit this project."] });
  }
  const plan = planSkippedClusterBackfill(args.states, args.trackings, startCluster, {
    projectId: args.project.id,
    owningBusinessUnitId: args.project.owningBusinessUnitId,
  });
  return runPlan(plan, "checklist/backfill");
}

export function useSkippedClusterBackfill() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: BackfillArgs) => {
      const res = await backfillSkippedClusters(args);
      if (!res.ok) throw res.error;
      return { plan: res.value, projectId: args.project.id };
    },
    onSuccess: (out) => {
      if (out.plan.writes.length) invalidate(out.projectId);
    },
  });
}

export interface EnsureTrackingArgs {
  project: ChecklistProject;
  selected: SequenceEntry;
  tracking: TrackingRow | null;
  canEdit: boolean;
}

/** Rule 10 — create the selected cluster's tracking row when it is missing. */
export function useEnsureTracking() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: EnsureTrackingArgs) => {
      if (!args.canEdit || args.tracking) return { projectId: args.project.id, wrote: false };
      const plan = planEnsureTracking(args.selected, args.tracking, {
        projectId: args.project.id,
        owningBusinessUnitId: args.project.owningBusinessUnitId,
      });
      const res = await runPlan(plan, "checklist/ensureTracking");
      if (!res.ok) throw res.error;
      return { projectId: args.project.id, wrote: plan.writes.length > 0 };
    },
    onSuccess: (out) => { if (out.wrote) invalidate(out.projectId); },
  });
}

export interface MaterialiseArgs {
  project: ChecklistProject;
  clusterStateId: string;
  tracking: TrackingRow | null;
  templates: DefaultChecklistTemplate[];
  existingRowCount: number;
  canEdit: boolean;
}

/** Rule 11 — materialise the cluster's checklist from the country/technology templates. */
export function useChecklistMaterialisation() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: MaterialiseArgs) => {
      if (!args.canEdit
        || !shouldMaterialiseChecklist(args.tracking, args.existingRowCount)
        || args.templates.length === 0) {
        return { projectId: args.project.id, clusterStateId: args.clusterStateId, wrote: false };
      }
      const plan = planChecklistMaterialisation(args.templates, {
        projectId: args.project.id,
        clusterStateId: args.clusterStateId,
        owningBusinessUnitId: args.project.owningBusinessUnitId,
      });
      const res = await runPlan(plan, "checklist/materialise");
      if (!res.ok) throw res.error;
      return {
        projectId: args.project.id, clusterStateId: args.clusterStateId, wrote: true,
      };
    },
    onSuccess: (out) => {
      if (out.wrote) invalidate(out.projectId, out.clusterStateId);
    },
  });
}

/* ═════════════════════════════════════════════════════════════ the row actions ════ */

export interface ChecklistRowPatchArgs {
  projectId: string;
  clusterStateId: string;
  row: ChecklistRow;
  data: Record<string, unknown>;
  canEdit: boolean;
}

/** Rules 15–17 and the completion-date editor — one patch of one `Project Checklists` row. */
export function usePatchChecklistRow() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: ChecklistRowPatchArgs) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "checklist/patchRow",
        );
      }
      await projectChecklistFullRepo.update(args.row.id, args.data);
      return { projectId: args.projectId, clusterStateId: args.clusterStateId };
    },
    onSuccess: (out) => invalidate(out.projectId, out.clusterStateId),
  });
}

/* ══════════════════════════════════════════════════════════ the cluster transition ════ */

export interface ClusterTransitionArgs {
  project: ChecklistProject;
  state: SequenceEntry;
  tracking: TrackingRow | null;
  next: SequenceEntry | null;
  nextTracking: TrackingRow | null;
  comment: string;
  approvalDueDate: string | null;
  canEdit: boolean;
}

/** Rule 18 — the direct move, as one batch (step 14). */
export function useClusterTransition() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: ClusterTransitionArgs) => {
      const plan = planClusterTransition(args);
      const res = await runPlan(plan, "checklist/clusterTransition");
      if (!res.ok) throw res.error;
      return { projectId: args.project.id, plan: res.value };
    },
    onSuccess: (out) => invalidate(out.projectId),
  });
}

export interface TerminalStateArgs {
  project: ChecklistProject;
  staging: TerminalStaging;
  trackings: TrackingRow[];
  canEdit: boolean;
}

/** Rules 20–21 — Abandon / Inactivate / Activate, plus the canceled-row reset (step 15). */
export function useTerminalState() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: TerminalStateArgs) => {
      const plan = planTerminalStateChange(args);
      const res = await runPlan(plan, "checklist/terminalState");
      if (!res.ok) throw res.error;
      return { projectId: args.project.id, plan: res.value };
    },
    onSuccess: (out) => invalidate(out.projectId),
  });
}

/* ═══════════════════════════════════════════════════════════════════ the flows ════ */

export interface ChecklistApprovalArgs {
  project: ChecklistProject;
  clusterStateId: string;
  row: ChecklistRow;
  setting: ChecklistApprovalSetting;
  currentProjectStateId: string;
  comment: string;
  canEdit: boolean;
}

/**
 * Flow 1 — `PerformCommonRequestofCheckListApproval`.
 *
 * A long-running human workflow (`WaitForAnApproval`, `PostCardAndWaitForResponse`);
 * nothing in a browser app can hold it, so it stays a flow. After it returns, rule 26
 * gates the local write-back on a non-empty `runid`, and the audit note is written.
 */
export function useRequestChecklistApproval() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: ChecklistApprovalArgs) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "checklist/requestChecklistApproval",
        );
      }
      const call = checklistApprovalArgs({
        projectId: args.project.id,
        checklistId: args.row.id,
        checkListDefaultApprovalId: args.setting.id,
        currentProjectStateId: args.currentProjectStateId,
      });
      const result = (await performCheckListApproval({
        ...call.request, comment: args.comment,
      })) as FlowResult;

      // Rule 26 — write back only when a run id came back.
      const writeBack = flowWriteBackPatch(result, "checklist");
      if (writeBack) await projectChecklistFullRepo.update(args.row.id, writeBack);

      const note = checklistNoteWrite({
        name: `Approval requested - ${args.row.title}`,
        checklistId: args.row.id,
        comment: args.comment.trim(),
        owningBusinessUnitId: args.project.owningBusinessUnitId,
      });
      await dataClient.batch([{
        op: note.op, entitySet: note.entitySet, data: note.data,
      }]);

      return {
        projectId: args.project.id,
        clusterStateId: args.clusterStateId,
        wroteFlowIds: writeBack !== null,
      };
    },
    onSuccess: (out) => invalidate(out.projectId, out.clusterStateId),
  });
}

export interface GateApprovalArgs {
  project: ChecklistProject;
  state: SequenceEntry;
  tracking: TrackingRow;
  gate: GateSetting;
  comment: string;
  canEdit: boolean;
}

/**
 * Flow 2 — `PerformCommonRequestofGateApproval`.
 *
 * Rule 25 snapshots the persona set onto the tracking row BEFORE the call, so the record
 * of who was asked survives even if the flow's own writes are later overwritten.
 */
export function useRequestGateApproval() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: GateApprovalArgs) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "checklist/requestGateApproval",
        );
      }
      // Rule 25 — the snapshot, plus the comment and due date the panel captured.
      await projectStateTrackingFullRepo.update(args.tracking.id, {
        ...approvalPersonaSnapshot(args.gate),
        [TRACKING_COL.approvalComment]: args.comment,
      });

      const call = gateApprovalArgs({
        projectId: args.project.id,
        stateId: args.state.id,
        stateTrackingId: args.tracking.id,
        defaultApprovalId: args.gate.id,
      });
      const result = (await performGateApproval({
        ...call.request, comment: args.comment,
      })) as FlowResult;

      const writeBack = flowWriteBackPatch(result, "tracking");
      if (writeBack) {
        await projectStateTrackingFullRepo.update(args.tracking.id, writeBack);
      }
      return { projectId: args.project.id, wroteFlowIds: writeBack !== null };
    },
    onSuccess: (out) => invalidate(out.projectId),
  });
}

/**
 * Flow 3 — `PerformRequestofCheckListApprovalCancellation`, replaced by the custom API
 * `vsb_CancelCheckListApproval`. It returns `{success: boolean}`; a `false` must surface
 * as an error and leave the checklist state alone (UT-CHKLST-034).
 */
export function useCancelChecklistApproval() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: {
      projectId: string; clusterStateId: string; checklistId: string; canEdit: boolean;
    }) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "checklist/cancelChecklistApproval",
        );
      }
      const res = await cancelCheckListApproval({ checklistId: args.checklistId }) as
        { ok?: boolean; success?: boolean };
      if (!checklistCancelSucceeded(res)) {
        throw toAppError(
          { status: 500, message: CHECKLIST_CANCEL_FAILED },
          "vsb_CancelCheckListApproval",
        );
      }
      return { projectId: args.projectId, clusterStateId: args.clusterStateId };
    },
    onSuccess: (out) => invalidate(out.projectId, out.clusterStateId),
  });
}

/**
 * Flow 4 — `PerformRequestofGateApprovalCancellation`, replaced by
 * `vsb_CancelGateApproval`. It takes the state-tracking id ALONE: the 13-field JSON blob
 * and the `AppId` (which no action in the flow references — ambiguity 3) are gone.
 */
export function useCancelGateApproval() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: {
      project: ChecklistProject; tracking: TrackingRow; comment: string; canEdit: boolean;
    }) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "checklist/cancelGateApproval",
        );
      }
      await cancelGateApproval(gateCancelArgs(args.tracking.id));
      const plan = planGateCancel(args);
      const res = await runPlan(plan, "checklist/cancelGateApproval");
      if (!res.ok) throw res.error;
      return { projectId: args.project.id };
    },
    onSuccess: (out) => invalidate(out.projectId),
  });
}

/** The entity sets, exported so the tests can name the request targets. */
export const CHECKLIST_ENTITY_SETS = {
  projects: ES.projects,
  projectStates: ES.projectStates,
  trackings: ES.projectStateTrackings,
  checklists: ES.projectChecklists,
  trackingNotes: ES.projectStateTrackingNotes,
  checklistNotes: ES_PROCESS.projectChecklistTrackingNotes,
  defaultChecklists: ES_PROCESS.projectDefaultChecklists,
  defaultApprovals: ES_PROCESS.projectDefaultApprovals,
  checkListDefaultApprovals: ES_PROCESS.checkListDefaultApprovals,
} as const;

export { PROJECT_COLUMN };
