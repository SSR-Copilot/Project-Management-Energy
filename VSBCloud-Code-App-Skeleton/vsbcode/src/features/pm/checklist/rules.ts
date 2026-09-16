/**
 * Project General CheckList Screen — every business rule as a pure function.
 *
 * Canvas screen: `Project General CheckList Screen` (PM app)
 *   141 controls · 5 606 lines of Power Fx · 66 substantive blocks · band L
 *
 * The gate/cluster governance screen: a cluster stepper, a per-cluster checklist gallery
 * with approval actions, and a right panel that serves two entity types — a single
 * `Project Checklists` row ("Checklist Completion") or a single `Project State Trackings`
 * row ("Cluster Transition"). Four Power Automate flows are invoked from it. It writes
 * `Project State Trackings` (11 Patches), `Project Checklists` (8), two note tables and
 * `Projects` (2).
 *
 * THE ENGINE. Everything the two hidden dispatch buttons did —
 * `btn_CheckList_BuildProjectStatesSequence` and
 * `btn_CheckList_EnsureSkippedClusterStatesCompleted` — is here as pure functions that
 * RETURN THE WRITES rather than performing them. `hooks.ts` hands each plan to one
 * `repo.saveMany`, so a transition that the canvas issued as a `Patch` chain (and could
 * therefore half-apply) goes out as one bounded fan-out.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `ForAll(Sequence(CountRows(t)), Patch(Last(FirstN(t, Value)), {RowNumber: Value}))`,
 *    the canvas index idiom, used three times. `RowNumber` is the array index and
 *    previous/next are `seq[i-1]` / `seq[i+1]`.
 *  - The two hidden `ModernButton`s that existed only so other controls could `Select()`
 *    them, and `but_Project_States_CheckList_Refresh`, which re-queried
 *    `'Project State Trackings'` five times inside `OnVisible` alone.
 *  - `but_Checklist_…_ApplyDefaultChecklist` (rule 29) — `Visible: =false`, dead as wired.
 *  - `pcf_…_Buttons_Return` (rule 19) — `Visible` is hard-coded `false`. The rule is
 *    ported (`planReturnToPreviousCluster`) but nothing renders it; see its comment.
 *  - `Remove('Project Checklists', …)`, which is inside a `/* … *\/` comment in the
 *    refresh handler — orphan checklist rows are not deleted today and are not here.
 *  - `cmp_CheckList_Project_States.RefreshButtonVisibility`, a developer-only control
 *    gated on `colDevelopers` (rule 28).
 *  - The 13-field JSON blob built for `PerformRequestofGateApprovalCancellation`; the
 *    replacement custom API takes the state-tracking id alone.
 *
 * DEFECTS FIXED, each commented at its rule:
 *  - ambiguity 1: `CanEditSelectedProject` is computed and never consumed — every write
 *    plan here is gated on it (`requireEditPermission`).
 *  - ambiguity 2: the page lock omits the Draft clause. Kept omitted — deliberately, this
 *    is the screen that moves a project OUT of Draft — but the bullet list is built from
 *    the actual condition so it can no longer disagree with the banner.
 *  - ambiguity 3: `AppId` is unused by the cancellation flow. Not sent.
 *  - ambiguity 5: the "Checklist Completion" branch computes a `DefaultApprovalGUID` it
 *    never passes. Not carried forward; see `checklistApprovalArgs`.
 *
 * GUIDE q18–q20 — screen-recording batch D covers this screen for the first time (no
 * screenshot in the first guide pass reached it). It corrects the stepper's visual
 * language (`stepVisualStatus`, `stepConnectorLit`), the checklist table's title and
 * column set (`checklistTableTitle`, `gateRelevanceLabel`), and shows that
 * "View … Request History" opens a dedicated read-only "Cluster Movement to …" dialog
 * rather than the editable Cluster Transition panel (`nextClusterActionKind`,
 * `clusterMovementTitle`, `clusterStepStateLabel`).
 */
import { isBlank } from "@/domain/numeric";
import { ES, ES_PROCESS, CHOICE, CHOICE_PROCESS, TEXT_MAX_LENGTH } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_ProjectStateTracking` logical names. */
export const TRACKING_COL = {
  id: "vsb_projectstatetrackingid",
  name: "vsb_name",
  project: "_vsb_project_value",
  clusterState: "_vsb_clusterstate_value",
  approvalClusterState: "vsb_approvalclusterstate",
  clusterStepState: "vsb_clusterstepstate",
  approvalComment: "vsb_approvalcomment",
  approvalDueDate: "vsb_approvalduedate",
  /** Display name `FlowRunId` — no space, unlike the checklist table's `Flow Run Id`. */
  flowRunId: "vsb_flowrunid",
  flowApprovalId: "vsb_flowapprovalid",
  lastTriggeredApprovalMode: "vsb_lasttriggeredapprovalmode",
  lastTriggeredApprovalPersonas: "vsb_lasttriggeredapprovalpersonas",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** `vsb_ProjectChecklist` logical names. */
export const CHECKLIST_COL = {
  id: "vsb_projectchecklistid",
  name: "vsb_name",
  project: "_vsb_project_value",
  clusterState: "_vsb_clusterstate_value",
  approvalChecklistState: "vsb_approvalcheckliststate",
  approvalStepState: "vsb_approvalstepstatecode",
  approvalComment: "vsb_approvalcomment",
  approvalDueDate: "vsb_approvalduedate",
  comments: "vsb_comments",
  completionDate: "vsb_completiondate",
  flowRunId: "vsb_flowrunid",
  flowApprovalId: "vsb_flowapprovalid",
  gateRelevance: "vsb_gaterelevance",
  holdingTaskDescription: "vsb_holdingtaskdescription",
  isCompletionDate: "vsb_iscompletiondate",
  order: "vsb_order",
  /** A TEXT copy of the template's id, not a lookup — that is how the canvas joins. */
  projectDefaultChecklist: "vsb_projectdefaultchecklist",
  taskState: "vsb_taskstate",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const NOTE_COL = {
  name: "vsb_name",
  comment: "vsb_comment",
  note: "vsb_note",
  noteType: "vsb_notetype",
  trackingLookup: "_vsb_projectstatetracking_value",
  checklistLookup: "_vsb_projectchecklist_value",
  createdOn: "createdon",
  /** GUIDE q20 — the "by …" line under each history comment; a standard Dataverse audit
   *  column, present on every table without a schema change. */
  createdBy: "_createdby_value",
} as const;

export const LOOKUP = {
  project: "vsb_Project",
  clusterState: "vsb_ClusterState",
  projectStateTracking: "vsb_ProjectStateTracking",
  projectChecklist: "vsb_ProjectChecklist",
  owningBusinessUnit: "owningbusinessunit",
  /** On `Projects`, `'Cluster State'` is a lookup to `Project States`, not to a choice. */
  projectClusterState: "vsb_ClusterState",
} as const;

export const PROJECT_COLUMN = {
  clusterState: "_vsb_clusterstate_value",
  approvalStates: "vsb_approvalstates",
} as const;

/** `gblAppConstants.DefaultLongMaxLength` — the comment box's cap. */
export const COMMENT_MAX_LENGTH = TEXT_MAX_LENGTH.long;

const ACS = CHOICE_PROCESS.approvalClusterState;
const TASK = CHOICE_PROCESS.taskState;
const STEP = CHOICE_PROCESS.clusterStepState;
const MODE = CHOICE_PROCESS.approvalMode;

export { ACS as APPROVAL_CLUSTER_STATE, TASK as TASK_STATE, MODE as APPROVAL_MODE };

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** A `Project States` row, plus the gate the stepper resolves for it. */
export interface ProjectStateRef {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
  clusterDescription: string | null;
}

/** One entry of either sequence. `rowNumber` is the array index, not a patched column. */
export interface SequenceEntry {
  id: string;
  name: string;
  clusterNo: number;
  rowNumber: number;
  clusterDescription: string | null;
  /** `locSelectedItemProjectState.HasGate` — an active `Project Default Approvals` row. */
  hasGate: boolean;
  /** `locSelectedItemProjectState.Gate` — that row's id. */
  gateId: string | null;
  /** Display sequence only: a cluster below the project's start cluster. */
  isSkippedDisplayOnly?: boolean;
}

export interface TrackingRow {
  id: string;
  clusterStateId: string | null;
  clusterStateName: string | null;
  approvalClusterState: number | null;
  clusterStepState: number | null;
  approvalComment: string | null;
  approvalDueDate: string | null;
  flowRunId: string | null;
  flowApprovalId: string | null;
}

/** Rule 12's flat projection of the gallery source. */
export interface ChecklistRow {
  id: string;
  title: string;
  clusterStateId: string | null;
  gateRelevance: boolean;
  holdingDescription: string | null;
  isCompletionDate: boolean;
  completionDate: string | null;
  taskState: number | null;
  approvalChecklistState: number | null;
  note: string | null;
  sort: number;
  /** `'Project Default Checklist'` — the text key into `Check List Default Approvals`. */
  projectDefaultChecklistId: string | null;
  flowRunId: string | null;
  flowApprovalId: string | null;
}

/** A `Project Default Approvals` row — the GATE settings for one cluster. */
export interface GateSetting {
  id: string;
  clusterStateId: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  portfolioManagerId: string | null;
  portfolioManagerMail: string | null;
  defaultApprovals: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

/** A `Check List Default Approvals` row — the settings for one checklist template. */
export interface ChecklistApprovalSetting {
  id: string;
  projectDefaultChecklistId: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  portfolioManagerMail: string | null;
  defaultApprovers: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

/** A `Project Default Checklists` template row. */
export interface DefaultChecklistTemplate {
  id: string;
  name: string;
  clusterStateId: string | null;
  gateRelevance: boolean;
  holdingTaskDescription: string | null;
  isCompletionDate: boolean;
  order: number;
}

/** The project fields the screen branches on. */
export interface ChecklistProject {
  id: string;
  projectName: string | null;
  projectNumber: string | null;
  /** The `Cluster States` option-set value; blank means Greenfield. */
  startCluster: number | null;
  /** `'Cluster State'` is a lookup to `Project States`. */
  clusterStateId: string | null;
  clusterStateName: string | null;
  approvalState: number | null;
  countryId: string | null;
  technology: number | null;
  owningBusinessUnitId: string | null;
  totalCapacity: number | null;
  netYieldP50: number | null;
  /** The milestone chain the page lock tests, keyed by the start cluster. */
  milestones: {
    projectStartDate: string | null;
    feasibilityStudies: string | null;
    projectDevelopmentStarted: string | null;
    applicationSubmitted: string | null;
    legallyBindingPermits: string | null;
    fid: string | null;
    construction: string | null;
    cod: string | null;
  };
}

/** One write in a plan — the same shape `dataClient.batch` takes. */
export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  /** Why this write exists — rendered in the confirm dialog and the telemetry. */
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });

/* ══════════════════════════════════════════════════════════════ cluster order ════ */

/**
 * Rule 2 — the literal `Switch` the canvas repeats in three places:
 * `"Draft",0,"Cluster 1",1,…,"Cluster 6",6,999`.
 *
 * 999 is the sentinel for "not one of the seven", and it matters: the operational
 * sequence's `ClusterNo <= 6` test is what excludes those rows.
 */
const CLUSTER_NO: Record<string, number> = {
  Draft: 0, "Cluster 1": 1, "Cluster 2": 2, "Cluster 3": 3,
  "Cluster 4": 4, "Cluster 5": 5, "Cluster 6": 6,
};

export const UNKNOWN_CLUSTER_NO = 999;

export function clusterNo(name: string | null | undefined): number {
  if (!name) return UNKNOWN_CLUSTER_NO;
  return CLUSTER_NO[name] ?? UNKNOWN_CLUSTER_NO;
}

/**
 * Rule 1 — `Switch(Coalesce('Start Cluster', 'Cluster States'.Greenfield),
 * Greenfield, 0, 'Cluster 1', 1, … 'Cluster 6', 6, 0)`.
 *
 * The `Cluster States` option-set VALUE is the cluster number (Greenfield = 0, Cluster n
 * = n), so the seven-arm switch is an identity map with a blank default of 0. Anything
 * outside 0…6 falls back to 0, which is what the switch's trailing `0` does.
 */
export function startClusterNo(project: { startCluster: number | null } | null): number {
  const raw = project?.startCluster;
  if (raw === null || raw === undefined) return 0;
  return raw >= 0 && raw <= 6 ? raw : 0;
}

/* ═══════════════════════════════════════════════════════ the skipped back-fill ════ */

export const AUTO_SKIPPED_COMMENT =
  "Automatically completed because this project starts at a later cluster.";

/**
 * Rule 4 — `varRealGateProgressAlreadyExists`.
 *
 * A tracking row counts as REAL progress when any of:
 *   · it carries a `FlowRunId` or a `FlowApprovalId` — a flow has already run;
 *   · it is the DRAFT row (ClusterNo 0) and is in Completed / Rejected / Request canceled
 *     / Canceling / Abandoned / Inactive-On-hold, or carries an `Approval Comment`
 *     (Draft + In Progress + no comment is the clean initial state);
 *   · it is a NON-Draft row whose state is not `Not Started`, EXCEPT an auto-skipped
 *     Completed row below the start cluster, which this very back-fill wrote.
 *
 * That last exclusion is what makes the back-fill idempotent: its own output must not
 * count as the progress that blocks it.
 */
const DRAFT_PROGRESS_STATES: number[] = [
  ACS.completed, ACS.rejected, ACS.requestCanceled, ACS.canceling,
  ACS.abandoned, ACS.inactive,
];

export function hasRealGateProgress(
  trackings: TrackingRow[],
  startCluster: number,
): boolean {
  return trackings.some((row) => {
    if (!isBlank(row.flowRunId) || !isBlank(row.flowApprovalId)) return true;

    const no = clusterNo(row.clusterStateName);
    const state = row.approvalClusterState ?? ACS.notStarted;

    if (no === 0) {
      return DRAFT_PROGRESS_STATES.includes(state) || !isBlank(row.approvalComment);
    }
    if (no > 0) {
      if (state === ACS.notStarted) return false;
      const autoSkipped = no < startCluster && state === ACS.completed;
      return !autoSkipped;
    }
    return false;
  });
}

/**
 * Rule 5 — the target state per cluster during the back-fill:
 *   Draft (0)                        → In Progress
 *   0 < ClusterNo < startCluster     → Completed, with the auto-skip comment
 *   everything else                  → Not Started
 */
export function expectedApprovalState(cluster: number, startCluster: number): number {
  if (cluster === 0) return ACS.inProgress;
  if (cluster > 0 && cluster < startCluster) return ACS.completed;
  return ACS.notStarted;
}

export const expectedApprovalComment = (cluster: number, startCluster: number): string | null =>
  cluster > 0 && cluster < startCluster ? AUTO_SKIPPED_COMMENT : null;

/**
 * Rule 3's guard — `If(locProjectStartClusterNo > 0 && varProjectIsStillDraft &&
 * Not(varRealGateProgressAlreadyExists), Select(btn_…))`.
 *
 * `varProjectIsStillDraft` is `Coalesce('Cluster State'.Name, "Draft") = "Draft"`, so a
 * project with no cluster state at all counts as Draft.
 */
export function shouldBackfillSkippedClusters(args: {
  startCluster: number;
  clusterStateName: string | null;
  trackings: TrackingRow[];
}): boolean {
  if (args.startCluster <= 0) return false;
  const isStillDraft = (args.clusterStateName ?? "Draft") === "Draft";
  if (!isStillDraft) return false;
  return !hasRealGateProgress(args.trackings, args.startCluster);
}

/**
 * Rule 5's writes. Idempotent by construction: a row already at its target state AND
 * comment produces no write, so a second run issues nothing (UT-CHKLST-010).
 *
 * The patch also blanks `Cluster Step State`, `Approval Due Date`, `FlowRunId` and
 * `FlowApprovalId`, exactly as the canvas does — those are the four columns a stale
 * approval would have left behind.
 */
export function planSkippedClusterBackfill(
  states: ProjectStateRef[],
  trackings: TrackingRow[],
  startCluster: number,
  ctx: { projectId: string; owningBusinessUnitId: string | null },
): WritePlan {
  const plan = emptyPlan();
  const byCluster = new Map(
    trackings
      .filter((t) => t.clusterStateId)
      .map((t) => [t.clusterStateId as string, t]),
  );

  for (const state of checklistStates(states)) {
    const no = clusterNo(state.name);
    const target = expectedApprovalState(no, startCluster);
    const comment = expectedApprovalComment(no, startCluster);
    const existing = byCluster.get(state.id);

    if (existing
      && existing.approvalClusterState === target
      && (existing.approvalComment ?? null) === comment
      && isBlank(existing.flowRunId)
      && isBlank(existing.flowApprovalId)) {
      continue;   // already at target — no write
    }

    const data: Record<string, unknown> = {
      [TRACKING_COL.approvalClusterState]: target,
      [TRACKING_COL.approvalComment]: comment,
      [TRACKING_COL.clusterStepState]: null,
      [TRACKING_COL.approvalDueDate]: null,
      [TRACKING_COL.flowRunId]: null,
      [TRACKING_COL.flowApprovalId]: null,
    };

    if (existing) {
      plan.writes.push({
        op: "update", entitySet: ES.projectStateTrackings, id: existing.id, data,
        reason: `${state.name} → ${approvalStateLabel(target)}`,
      });
    } else {
      data[TRACKING_COL.name] = state.name;
      data[`${LOOKUP.project}@odata.bind`] = `/${ES.projects}(${ctx.projectId})`;
      data[`${LOOKUP.clusterState}@odata.bind`] = `/${ES.projectStates}(${state.id})`;
      if (ctx.owningBusinessUnitId) {
        data[`${LOOKUP.owningBusinessUnit}@odata.bind`] =
          `/businessunits(${ctx.owningBusinessUnitId})`;
      }
      plan.writes.push({
        op: "create", entitySet: ES.projectStateTrackings, data,
        reason: `${state.name} created as ${approvalStateLabel(target)}`,
      });
    }
    plan.log.push(`${state.name}: ${approvalStateLabel(target)}`);
  }
  return plan;
}

/** `Filter('Project States', 'Is Visible On Checklist' = true && Name in [...])`. */
export const checklistStates = (states: ProjectStateRef[]): ProjectStateRef[] =>
  states
    .filter((s) => s.isVisibleOnChecklist && clusterNo(s.name) !== UNKNOWN_CLUSTER_NO)
    .sort((a, b) => clusterNo(a.name) - clusterNo(b.name));

/* ═══════════════════════════════════════════════════════════════ the sequences ════ */

/**
 * Rule 6 — the OPERATIONAL sequence.
 * `Filter(colChecklistAllProjectStates, ClusterNo = 0 || (ClusterNo >= start && ClusterNo <= 6))`
 *
 * Draft is always kept, whatever the start cluster; the `<= 6` upper bound is what
 * excludes the 999 sentinel rows.
 */
export function buildOperationalSequence(
  states: ProjectStateRef[],
  startCluster: number,
  gates: GateSetting[] = [],
): SequenceEntry[] {
  return checklistStates(states)
    .filter((s) => {
      const no = clusterNo(s.name);
      return no === 0 || (no >= startCluster && no <= 6);
    })
    .map((s, index) => toSequenceEntry(s, index, gates));
}

/**
 * Rule 6 — the DISPLAY sequence. Every state is kept; the ones below the start cluster
 * are flagged `IsSkippedDisplayOnly` so the stepper can render them muted.
 */
export function buildDisplaySequence(
  states: ProjectStateRef[],
  startCluster: number,
  gates: GateSetting[] = [],
): SequenceEntry[] {
  return checklistStates(states).map((s, index) => {
    const entry = toSequenceEntry(s, index, gates);
    const no = clusterNo(s.name);
    return { ...entry, isSkippedDisplayOnly: no > 0 && no < startCluster };
  });
}

function toSequenceEntry(
  state: ProjectStateRef,
  index: number,
  gates: GateSetting[],
): SequenceEntry {
  // `HasGate` / `Gate` — the ACTIVE `Project Default Approvals` row for this cluster.
  const gate = gates.find((g) => g.clusterStateId === state.id && g.gateActive) ?? null;
  return {
    id: state.id,
    name: state.name,
    clusterNo: clusterNo(state.name),
    rowNumber: index,
    clusterDescription: state.clusterDescription,
    hasGate: gate !== null,
    gateId: gate?.id ?? null,
  };
}

/**
 * Rule 8 — previous and next.
 *
 * The canvas resolved them with `LookUp(colProjectStatesForChecklist, RowNumber = n ± 1)`
 * against a column it had to patch onto every row first. Here they are array neighbours
 * of the OPERATIONAL sequence, which is what the canvas looked them up in — so a project
 * starting at Cluster 3 has Draft as Cluster 3's previous, not Cluster 2.
 */
export const previousState = (
  sequence: SequenceEntry[],
  selectedId: string | null,
): SequenceEntry | null => neighbour(sequence, selectedId, -1);

export const nextState = (
  sequence: SequenceEntry[],
  selectedId: string | null,
): SequenceEntry | null => neighbour(sequence, selectedId, +1);

function neighbour(
  sequence: SequenceEntry[],
  selectedId: string | null,
  delta: -1 | 1,
): SequenceEntry | null {
  const i = sequence.findIndex((s) => s.id === selectedId);
  if (i < 0) return null;
  return sequence[i + delta] ?? null;
}

/**
 * Rule 9 — `Coalesce(LookUp(colProjectStatesForChecklist, State.StateProgress =
 * 'Approval Cluster States'.'In Progress'), First(colProjectStatesForChecklist))`.
 */
export function defaultSelectedCluster(
  sequence: SequenceEntry[],
  trackings: TrackingRow[],
): SequenceEntry | null {
  const inProgress = sequence.find((s) =>
    trackings.some((t) =>
      t.clusterStateId === s.id && t.approvalClusterState === ACS.inProgress),
  );
  return inProgress ?? sequence[0] ?? null;
}

/* ══════════════════════════════════════════════════════ ensure the tracking row ════ */

/**
 * Rule 10 — a selected cluster with no tracking row gets one created on the fly, as
 * `In Progress` for Draft and `Not Started` for everything else.
 */
export function planEnsureTracking(
  selected: SequenceEntry,
  existing: TrackingRow | null,
  ctx: { projectId: string; owningBusinessUnitId: string | null },
): WritePlan {
  const plan = emptyPlan();
  if (existing) return plan;

  const state = selected.name === "Draft" ? ACS.inProgress : ACS.notStarted;
  const data: Record<string, unknown> = {
    [TRACKING_COL.name]: selected.name,
    [TRACKING_COL.approvalClusterState]: state,
    [`${LOOKUP.project}@odata.bind`]: `/${ES.projects}(${ctx.projectId})`,
    [`${LOOKUP.clusterState}@odata.bind`]: `/${ES.projectStates}(${selected.id})`,
  };
  if (ctx.owningBusinessUnitId) {
    data[`${LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${ctx.owningBusinessUnitId})`;
  }
  plan.writes.push({
    op: "create", entitySet: ES.projectStateTrackings, data,
    reason: `${selected.name} tracking created as ${approvalStateLabel(state)}`,
  });
  plan.log.push(`Created the ${selected.name} tracking row.`);
  return plan;
}

/* ═════════════════════════════════════════════════ the checklist materialisation ════ */

/**
 * Rule 11's guard — templates are copied only when the cluster is NOT Completed and the
 * project has ZERO checklist rows for it.
 */
export function shouldMaterialiseChecklist(
  tracking: TrackingRow | null,
  existingRowCount: number,
): boolean {
  if (tracking?.approvalClusterState === ACS.completed) return false;
  return existingRowCount === 0;
}

/**
 * Rule 11's writes — one create per template, issued as one `$batch`.
 *
 * The country/technology filter (`'Associated Country And Technology'.Country.Country`
 * and `.Technology`) is applied SERVER-side by `hooks.ts`; the templates arriving here
 * are already scoped. This function only shapes the rows.
 */
export function planChecklistMaterialisation(
  templates: DefaultChecklistTemplate[],
  ctx: {
    projectId: string;
    clusterStateId: string;
    owningBusinessUnitId: string | null;
  },
): WritePlan {
  const plan = emptyPlan();
  for (const t of templates) {
    const data: Record<string, unknown> = {
      [CHECKLIST_COL.name]: t.name,
      [CHECKLIST_COL.gateRelevance]: t.gateRelevance === true,
      [CHECKLIST_COL.isCompletionDate]: t.isCompletionDate === true,
      [CHECKLIST_COL.holdingTaskDescription]: t.holdingTaskDescription,
      [CHECKLIST_COL.order]: t.order,
      [CHECKLIST_COL.projectDefaultChecklist]: t.id,
      [CHECKLIST_COL.taskState]: TASK.none,
      [CHECKLIST_COL.approvalChecklistState]: ACS.notStarted,
      [`${LOOKUP.project}@odata.bind`]: `/${ES.projects}(${ctx.projectId})`,
      [`${LOOKUP.clusterState}@odata.bind`]:
        `/${ES.projectStates}(${ctx.clusterStateId})`,
    };
    if (ctx.owningBusinessUnitId) {
      data[`${LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${ctx.owningBusinessUnitId})`;
    }
    plan.writes.push({
      op: "create", entitySet: ES.projectChecklists, data,
      reason: `Checklist task “${t.name}” created from the default template`,
    });
  }
  if (plan.writes.length) {
    plan.log.push(`Created ${plan.writes.length} checklist task(s) from the defaults.`);
  }
  return plan;
}

/* ═══════════════════════════════════════════════════════════════ the gallery ════ */

/**
 * Rule 13 — the row's approval icon, from the checklist's `Check List Default Approvals`
 * `Approval Mode`. Only Notifications → a mail icon, Formal/Local → a people icon,
 * anything else → nothing. The icon renders only when a matching `Gate active` row exists.
 */
export type RowApprovalIcon = "Mail" | "People" | null;

export function rowApprovalIcon(setting: ChecklistApprovalSetting | null): RowApprovalIcon {
  if (!setting || !setting.gateActive) return null;
  if (setting.approvalMode === MODE.onlyNotifications) return "Mail";
  if (setting.approvalMode === MODE.formalApproval
    || setting.approvalMode === MODE.localApproval) return "People";
  return null;
}

/**
 * Rule 14 — the row action button's caption.
 * With a People icon: In Progress → "Pending", Completed → "Approved", else "Approval".
 * Without one: "Complete".
 */
export type RowActionLabel = "Complete" | "Approval" | "Pending" | "Approved";

export function rowActionLabel(
  row: Pick<ChecklistRow, "approvalChecklistState">,
  setting: ChecklistApprovalSetting | null,
): RowActionLabel {
  if (rowApprovalIcon(setting) !== "People") return "Complete";
  if (row.approvalChecklistState === ACS.inProgress) return "Pending";
  if (row.approvalChecklistState === ACS.completed) return "Approved";
  return "Approval";
}

/**
 * `If(((!History.Visible && Self.Text = "Approval") || ThisItem.TaskState <> Completed)
 *     && Self.Text <> "Pending", DisplayMode.Edit, DisplayMode.Disabled)`
 *
 * `historyVisible` is the gallery's own per-row history toggle. A "Pending" row is never
 * actionable — the approval is with somebody else.
 */
export function rowActionEnabled(
  row: Pick<ChecklistRow, "taskState">,
  label: RowActionLabel,
  historyVisible = false,
): boolean {
  if (label === "Pending") return false;
  const openable = (!historyVisible && label === "Approval")
    || row.taskState !== TASK.completed;
  return openable;
}

/** `but_…_ListRow_CancelApproval.Visible` — the label is "Pending" or "Approved". */
export const showCancelApprovalIcon = (label: RowActionLabel): boolean =>
  label === "Pending" || label === "Approved";

/** The In Progress button is hidden whenever the cancel-approval icon is showing. */
export const canToggleInProgress = (label: RowActionLabel): boolean =>
  !showCancelApprovalIcon(label);

export const COMPLETION_DATE_MESSAGE =
  'Please enter completion date to set the cluster-check on "Complete"';

/**
 * Rule 16 — `If(And(ThisItem.IsCompletionDate, IsBlank(ThisItem.CompletionDate)), …)`.
 * A completion-date-bearing task cannot be completed until the date is set.
 */
export const completionDateBlocksComplete = (
  row: Pick<ChecklistRow, "isCompletionDate" | "completionDate">,
): boolean => row.isCompletionDate && isBlank(row.completionDate);

/**
 * Rule 17 — the In Progress toggle.
 * `varCurrentTaskState: If(TaskState = 'In Progress', 'Task State'.None, 'In Progress')`,
 * and the approval state ALWAYS resets to Not Started, in both directions.
 */
export function inProgressTogglePatch(
  row: Pick<ChecklistRow, "taskState">,
): Record<string, unknown> {
  return {
    [CHECKLIST_COL.taskState]:
      row.taskState === TASK.inProgress ? TASK.none : TASK.inProgress,
    [CHECKLIST_COL.approvalChecklistState]: ACS.notStarted,
  };
}

/** Rule 15's simple half — a task with no approval mode just goes Completed. */
export const completeTaskPatch = (): Record<string, unknown> => ({
  [CHECKLIST_COL.taskState]: TASK.completed,
});

/** The completion-date editor's write. */
export const completionDatePatch = (date: string | null): Record<string, unknown> => ({
  [CHECKLIST_COL.completionDate]: date,
});

/** Rule 12's sort — the gallery orders by `Order`, ascending. */
export const sortChecklistRows = (rows: ChecklistRow[]): ChecklistRow[] =>
  [...rows].sort((a, b) => a.sort - b.sort);

/**
 * The canvas re-ran `LookUp('Check List Default Approvals', 'Project Default Check List'.
 * 'Project Default Checklist' = GUID(ThisItem.…))` per row PER PROPERTY — five times a
 * row, on a Dataverse source. Resolve it once per cluster into a map (step 9).
 */
export function approvalSettingIndex(
  settings: ChecklistApprovalSetting[],
): Map<string, ChecklistApprovalSetting> {
  const map = new Map<string, ChecklistApprovalSetting>();
  for (const s of settings) {
    if (s.projectDefaultChecklistId) map.set(s.projectDefaultChecklistId, s);
  }
  return map;
}

export const settingForRow = (
  index: Map<string, ChecklistApprovalSetting>,
  row: Pick<ChecklistRow, "projectDefaultChecklistId">,
): ChecklistApprovalSetting | null =>
  row.projectDefaultChecklistId ? index.get(row.projectDefaultChecklistId) ?? null : null;

/* ══════════════════════════════════════════════════════════════ the right panel ════ */

/**
 * The discriminated union that replaces the string `locRequestApprovalEntityType`
 * (step 10). The canvas compared `"Checklist Completion"` / `"Cluster Transition"` in
 * fourteen separate `Switch`es; here the compiler enforces the two branches.
 */
export type PanelTarget =
  | { kind: "checklist"; row: ChecklistRow; setting: ChecklistApprovalSetting | null }
  | {
      kind: "cluster";
      state: SequenceEntry;
      tracking: TrackingRow | null;
      gate: GateSetting | null;
    };

export interface PanelState {
  target: PanelTarget;
  comment: string;
  approvalDueDate: string | null;
  /** Whether ANY `Check List Default Approvals` row exists for this checklist template. */
  hasChecklistApprovalEntry?: boolean;
}

/**
 * `lbl_GeneralData_RightPanel_ProjectState_InpForm_Comment_Details_ErrorMessage_1.Text` —
 * verbatim.
 */
export const COMMENT_REQUIRED_MESSAGE = "Please enter comment";

/**
 * `lbl_…_Comment_Details_ErrorMessage_1.Visible = IsBlank(Trim(txt_….Value))`.
 * That one flag disables Save, Request Approval, Cancel Approval and Return.
 */
export const commentMissing = (comment: string): boolean => isBlank(comment.trim());

export const commentError = (comment: string): string | null =>
  commentMissing(comment) ? COMMENT_REQUIRED_MESSAGE : null;

/**
 * The required asterisk is hidden once the project is already Approved:
 * `If('Approval States' = gblAppConstants.ApprovalState.Approved, false, true)`.
 * The VALIDATION still applies — only the asterisk goes away.
 */
export const commentAsteriskVisible = (project: ChecklistProject | null): boolean =>
  project?.approvalState !== CHOICE.approvalState.approved;

/**
 * The comment box goes read-only once the cluster is Completed —
 * `If(varClusterStepState.'Approval Cluster State' = Completed && entityType =
 * "Cluster Transition", DisplayMode.View, DisplayMode.Edit)`.
 */
export function commentReadOnly(panel: PanelState): boolean {
  if (panel.target.kind !== "cluster") return false;
  return panel.target.tracking?.approvalClusterState === ACS.completed;
}

/**
 * `con_…_Inputs_ApprovalDueDate.Visible` — Formal/Local approval modes only, and only
 * while the comment block is visible.
 */
export function showApprovalDueDate(panel: PanelState): boolean {
  const mode = panel.target.kind === "cluster"
    ? panel.target.gate?.approvalMode ?? null
    : panel.target.setting?.approvalMode ?? null;
  return mode === MODE.formalApproval || mode === MODE.localApproval;
}

/**
 * Save VISIBILITY.
 *  "Checklist Completion": the checklist is In Progress AND it has no
 *    `Check List Default Approvals` entry at all.
 *  "Cluster Transition": the state has NO gate and its tracking row is In Progress.
 */
export function showSave(panel: PanelState): boolean {
  if (panel.target.kind === "checklist") {
    return panel.target.row.approvalChecklistState === ACS.inProgress
      && panel.hasChecklistApprovalEntry !== true;
  }
  return !panel.target.state.hasGate
    && panel.target.tracking?.approvalClusterState === ACS.inProgress;
}

/**
 * Save DISPLAYMODE — disabled when the tracking row is Completed or the comment is blank.
 * (The Completed test is only meaningful on the cluster branch; the canvas's `LookUp` is
 * against `'Project State Trackings'` either way and resolves blank for a checklist.)
 */
export function canSavePanel(panel: PanelState): boolean {
  if (commentMissing(panel.comment)) return false;
  if (panel.target.kind === "cluster"
    && panel.target.tracking?.approvalClusterState === ACS.completed) return false;
  return true;
}

/**
 * Request Approval VISIBILITY.
 *  "Checklist Completion": the checklist state is blank, or NOT in {In Progress, Completed}.
 *  "Cluster Transition": the state HasGate AND either the tracking state is not in
 *    {In Progress, Completed}, OR it is In Progress with an empty FlowRunId/FlowApprovalId.
 *
 * That second disjunct is the recovery path for an approval that never started, and it is
 * the single most easily lost clause on this screen — without it a cluster whose flow
 * failed to launch is stuck In Progress with no way to retry (UT-CHKLST-028).
 */
export function showRequestApproval(panel: PanelState): boolean {
  if (panel.target.kind === "checklist") {
    const s = panel.target.row.approvalChecklistState;
    return s === null || s === undefined
      || !(s === ACS.inProgress || s === ACS.completed);
  }
  const { state, tracking } = panel.target;
  if (!state.hasGate) return false;
  const s = tracking?.approvalClusterState ?? null;
  const notLive = !(s === ACS.inProgress || s === ACS.completed);
  const stalled = s === ACS.inProgress
    && isBlank(tracking?.flowRunId)
    && isBlank(tracking?.flowApprovalId);
  return notLive || stalled;
}

/** Request Approval DISPLAYMODE — the cluster must not be Completed, comment required. */
export function canRequestApproval(panel: PanelState): boolean {
  if (commentMissing(panel.comment)) return false;
  if (panel.target.kind === "cluster"
    && panel.target.tracking?.approvalClusterState === ACS.completed) return false;
  return true;
}

/**
 * Cancel Approval VISIBILITY (cluster branch) — a live `FlowRunId`, the tracking row
 * In Progress, and the gate's `Approval Mode` is not `Only Notifications` (there is
 * nothing to cancel when nobody was asked to approve).
 */
export function showCancelApproval(panel: PanelState): boolean {
  if (panel.target.kind === "checklist") {
    return showCancelApprovalIcon(
      rowActionLabel(panel.target.row, panel.target.setting),
    );
  }
  const { tracking, gate } = panel.target;
  if (isBlank(tracking?.flowRunId)) return false;
  if (tracking?.approvalClusterState !== ACS.inProgress) return false;
  return gate?.approvalMode !== MODE.onlyNotifications;
}

export const canCancelApproval = (panel: PanelState): boolean => !commentMissing(panel.comment);

/**
 * Rule 19's visibility. `pcf_…_Buttons_Return.Visible` is hard-coded `false` in the
 * canvas, so the feature is DISABLED — but the sibling `Return_1` control carries the
 * real condition, which is ported here so the feature can be switched on without
 * re-deriving it: a previous state exists, it is at or after the start cluster, the
 * current tracking is In Progress / Rejected / Request canceled, no cancel-approval
 * button is showing, and the previous state is not Draft.
 */
export function showReturnToPrevious(
  panel: PanelState,
  previous: SequenceEntry | null,
  startCluster: number,
): boolean {
  if (panel.target.kind !== "cluster") return false;
  if (!previous) return false;
  if (previous.clusterNo < startCluster) return false;
  if (previous.name === "Draft") return false;
  const s = panel.target.tracking?.approvalClusterState ?? null;
  const resettable = s === ACS.inProgress || s === ACS.rejected || s === ACS.requestCanceled;
  if (!resettable) return false;
  return !showCancelApproval(panel);
}

/**
 * The actual-task-state block shows only for a Cluster Transition whose tracking row is
 * not Completed, whose `Cluster Step State` is blank or `None`, and which has at least
 * one checklist row.
 */
export function showActualTaskState(panel: PanelState, checklistRowCount: number): boolean {
  if (panel.target.kind !== "cluster") return false;
  const t = panel.target.tracking;
  if (t?.approvalClusterState === ACS.completed) return false;
  const step = t?.clusterStepState ?? null;
  if (!(step === null || step === STEP.none)) return false;
  return checklistRowCount > 0;
}

/* ══════════════════════════════════════════════════════════ the next-cluster button ════ */

/**
 * Rule 22 — the four-way caption.
 *   Completed / Request canceled / Canceling            → "View {next} Request History"
 *   a live FlowRunId while In Progress                  → "View {next} Request History"
 *   an ACTIVE gate in Only Notifications mode           → "Move to {next}"
 *   an ACTIVE gate in any other mode                    → "Request {next} Approval"
 *   no gate                                             → "Move to {next}"
 */
/**
 * GUIDE q18/q19 — `nextClusterCaption`'s "View … Request History" branches are what the
 * recording's blue "⚡ View Cluster 3 Request History" button is: a READ-ONLY history
 * view, not the editable Cluster Transition panel the caption's other branches open.
 * `nextClusterActionKind` names that split so `Screen.tsx` can route the click instead of
 * always opening the transition panel — the caption itself is unchanged, now derived from
 * this rather than repeating the branch.
 */
export type NextClusterActionKind = "history" | "transition";

export function nextClusterActionKind(args: {
  tracking: TrackingRow | null;
}): NextClusterActionKind {
  const s = args.tracking?.approvalClusterState ?? null;
  if (s === ACS.completed || s === ACS.requestCanceled || s === ACS.canceling) return "history";
  if (!isBlank(args.tracking?.flowRunId) && s === ACS.inProgress) return "history";
  return "transition";
}

export function nextClusterCaption(args: {
  tracking: TrackingRow | null;
  state: SequenceEntry;
  next: SequenceEntry | null;
  gate: GateSetting | null;
}): string {
  const nextName = args.next?.name ?? "next cluster";

  if (nextClusterActionKind(args) === "history") {
    return `View ${nextName} Request History`;
  }
  if (args.state.hasGate && args.gate?.gateActive) {
    return args.gate.approvalMode === MODE.onlyNotifications
      ? `Move to ${nextName}`
      : `Request ${nextName} Approval`;
  }
  return `Move to ${nextName}`;
}

/** Rule 23 — `"TriggerApproval"` for an active gate, otherwise `"CheckMark"`. */
export const nextClusterIcon = (
  state: SequenceEntry,
  gate: GateSetting | null,
): "TriggerApproval" | "CheckMark" =>
  state.hasGate && gate?.gateActive === true ? "TriggerApproval" : "CheckMark";

/**
 * The Next-cluster button's DisplayMode:
 *   disabled when the page is locked;
 *   disabled when the project's cluster state is Abandoned or Inactive;
 *   enabled when there is no previous cluster, or the current tracking is Completed or
 *     In Progress;
 *   otherwise enabled only when the PREVIOUS cluster's tracking is Completed AND the
 *     current tracking carries no `FlowRunId`.
 */
export function nextClusterEnabled(args: {
  locked: boolean;
  projectIsTerminal: boolean;
  tracking: TrackingRow | null;
  previous: SequenceEntry | null;
  previousTracking: TrackingRow | null;
}): boolean {
  if (args.locked) return false;
  if (args.projectIsTerminal) return false;
  const s = args.tracking?.approvalClusterState ?? null;
  if (!args.previous || s === ACS.completed || s === ACS.inProgress) return true;
  return args.previousTracking?.approvalClusterState === ACS.completed
    && isBlank(args.tracking?.flowRunId);
}

/* ═══════════════════════════════════════════════════════════ the cluster transition ════ */

/**
 * Rule 18 — the right panel's Save on a Cluster Transition, as ONE plan.
 *
 * The canvas issued this as a `Patch` chain: complete the current tracking row, upsert
 * the next one, write a note, then patch `Projects`. Any of the four could fail with the
 * earlier ones already applied — leaving a project whose tracking says Completed and
 * whose `Cluster State` still points at the old cluster. Here it is one batch (step 14).
 *
 * The `Projects` patch is the direct-movement path. The canvas comment states the intent
 * verbatim: *"No active Project Default Approval exists, so flow will not run. Direct
 * movement should still mark the project approval status as Approved."*
 */
export function planClusterTransition(args: {
  project: ChecklistProject;
  state: SequenceEntry;
  tracking: TrackingRow | null;
  next: SequenceEntry | null;
  nextTracking: TrackingRow | null;
  comment: string;
  approvalDueDate: string | null;
  /** The rendered history HTML the canvas stored on the note. */
  noteHtml?: string | null;
  canEdit: boolean;
}): WritePlan {
  const plan = emptyPlan();
  const guard = requireEditPermission(args.canEdit, plan);
  if (guard) return guard;

  const bu = args.project.owningBusinessUnitId;
  const dueDate = args.approvalDueDate;

  /* 1 — the current cluster completes. */
  const currentData: Record<string, unknown> = {
    [TRACKING_COL.approvalClusterState]: ACS.completed,
    [TRACKING_COL.approvalComment]: args.comment,
    [TRACKING_COL.approvalDueDate]: dueDate,
  };
  if (args.tracking) {
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: args.tracking.id,
      data: currentData,
      reason: `${args.state.name} → Completed`,
    });
  } else {
    plan.writes.push({
      op: "create", entitySet: ES.projectStateTrackings,
      data: {
        ...currentData,
        [TRACKING_COL.name]: args.state.name,
        [`${LOOKUP.project}@odata.bind`]: `/${ES.projects}(${args.project.id})`,
        [`${LOOKUP.clusterState}@odata.bind`]: `/${ES.projectStates}(${args.state.id})`,
        ...(bu ? { [`${LOOKUP.owningBusinessUnit}@odata.bind`]: `/businessunits(${bu})` } : {}),
      },
      reason: `${args.state.name} created as Completed`,
    });
  }
  plan.log.push(`${args.state.name} is complete.`);

  /* 2 — the next cluster starts. Upsert, exactly as the canvas `Patch(If(IsBlank(...)))`. */
  if (args.next) {
    const nextData: Record<string, unknown> = {
      [TRACKING_COL.approvalClusterState]: ACS.inProgress,
      [TRACKING_COL.approvalComment]: null,
      [TRACKING_COL.approvalDueDate]: dueDate,
    };
    if (args.nextTracking) {
      plan.writes.push({
        op: "update", entitySet: ES.projectStateTrackings, id: args.nextTracking.id,
        data: nextData,
        reason: `${args.next.name} → In Progress`,
      });
    } else {
      plan.writes.push({
        op: "create", entitySet: ES.projectStateTrackings,
        data: {
          ...nextData,
          [TRACKING_COL.name]: args.next.name,
          [`${LOOKUP.project}@odata.bind`]: `/${ES.projects}(${args.project.id})`,
          [`${LOOKUP.clusterState}@odata.bind`]: `/${ES.projectStates}(${args.next.id})`,
          ...(bu ? { [`${LOOKUP.owningBusinessUnit}@odata.bind`]: `/businessunits(${bu})` } : {}),
        },
        reason: `${args.next.name} created as In Progress`,
      });
    }
    plan.log.push(`${args.next.name} is now in progress.`);
  }

  /* 3 — the audit note.
   *
   * LIMITATION: the note's `Project State Tracking` lookup needs the current row's id, so
   * a transition on a cluster whose tracking row is being CREATED in this same batch
   * writes the note WITHOUT that lookup (the canvas had the same gap — its `Patch`
   * returned the record, but the note was built from a fresh `LookUp` that could not see
   * an uncommitted row). In practice `useEnsureTracking` has already created the row by
   * the time the panel can open, so the id is present. */
  plan.writes.push(
    trackingNoteWrite({
      name: args.next
        ? `Change ${args.state.name} to ${args.next.name}`
        : `Change ${args.state.name}`,
      trackingId: args.tracking?.id ?? null,
      comment: args.comment.trim(),
      note: args.noteHtml ?? null,
      noteType: CHOICE_PROCESS.noteType.checklistItem,
      owningBusinessUnitId: bu,
    }),
  );

  /* 4 — the direct-movement project patch. */
  if (args.next) {
    plan.writes.push({
      op: "update", entitySet: ES.projects, id: args.project.id,
      data: {
        [`${LOOKUP.projectClusterState}@odata.bind`]: `/${ES.projectStates}(${args.next.id})`,
        [PROJECT_COLUMN.approvalStates]: CHOICE.approvalState.approved,
      },
      reason: `Project moves to ${args.next.name} and is marked Approved`,
    });
    plan.log.push(`The project is now in ${args.next.name}.`);
  }

  return plan;
}

/**
 * Rule 19 — Reset to the previous cluster.
 *
 * The control's `Visible` is hard-coded `false`, so this is DEAD in the canvas. It is
 * ported because the behaviour is well defined and the screen would otherwise lose it
 * silently: current row → `Request canceled`, previous row → `In Progress`, plus a
 * `Project State Tracking Notes` row named `$"Project was reset to {previous}"`.
 * Nothing renders it; `showReturnToPrevious` is the gate to switch on.
 */
export function planReturnToPreviousCluster(args: {
  project: ChecklistProject;
  state: SequenceEntry;
  tracking: TrackingRow | null;
  previous: SequenceEntry;
  previousTracking: TrackingRow | null;
  comment: string;
  canEdit: boolean;
}): WritePlan {
  const plan = emptyPlan();
  const guard = requireEditPermission(args.canEdit, plan);
  if (guard) return guard;

  const bu = args.project.owningBusinessUnitId;

  if (args.tracking) {
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: args.tracking.id,
      data: { [TRACKING_COL.approvalClusterState]: ACS.requestCanceled },
      reason: `${args.state.name} → Request canceled`,
    });
  }
  if (args.previousTracking) {
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: args.previousTracking.id,
      data: { [TRACKING_COL.approvalClusterState]: ACS.inProgress },
      reason: `${args.previous.name} → In Progress`,
    });
  }
  plan.writes.push(
    trackingNoteWrite({
      name: `Project was reset to ${args.previous.name}`,
      trackingId: args.tracking?.id ?? null,
      comment: args.comment.trim(),
      note: null,
      noteType: CHOICE_PROCESS.noteType.none,
      owningBusinessUnitId: bu,
    }),
  );
  plan.log.push(`Project was reset to ${args.previous.name}.`);
  return plan;
}

/* ══════════════════════════════════════════════════════════ abandon / inactivate ════ */

export type TerminalKind = "abandon" | "inactivate";

export interface TerminalStaging {
  /** What `locChangeClusterStateConfirmationDialogApprovalClusterStateValue` becomes. */
  approvalClusterState: number;
  /** What `locChangeClusterStateConfirmationDialogValue` becomes — the target cluster. */
  targetClusterStateId: string | null;
  targetClusterStateName: string | null;
  /** The button caption: "Abandon" / "Inactivate/ Place On-hold" / "Activate". */
  label: string;
  /** The confirm dialog's body. */
  description: string;
}

/**
 * Rules 20 — the two symmetric toggles.
 *
 * Pressing Abandon on a project that is NOT abandoned stages `Abandoned` plus the
 * Abandoned cluster; pressing it on one that IS abandoned stages `In Progress` plus the
 * CURRENT TRACKING ROW's cluster — i.e. it puts the project back where it was, not at
 * some fixed cluster. Inactivate is the same shape against `Inactive/ On-hold`.
 */
export function stageTerminalToggle(args: {
  kind: TerminalKind;
  project: ChecklistProject;
  currentTracking: TrackingRow | null;
  abandonedState: ProjectStateRef | null;
  inactiveState: ProjectStateRef | null;
}): TerminalStaging {
  const terminalState = args.kind === "abandon" ? args.abandonedState : args.inactiveState;
  const alreadyThere = terminalState !== null
    && args.project.clusterStateId === terminalState.id;

  if (alreadyThere) {
    return {
      approvalClusterState: ACS.inProgress,
      targetClusterStateId: args.currentTracking?.clusterStateId ?? null,
      targetClusterStateName: args.currentTracking?.clusterStateName ?? null,
      label: "Activate",
      description: 'Do you really want to change the project state to "active"',
    };
  }
  const approval = args.kind === "abandon" ? ACS.abandoned : ACS.inactive;
  return {
    approvalClusterState: approval,
    targetClusterStateId: terminalState?.id ?? null,
    targetClusterStateName: terminalState?.name ?? null,
    label: args.kind === "abandon" ? "Abandon" : "Inactivate/ Place On-hold",
    description:
      `Do you really want to change Cluster State to "${terminalState?.name ?? ""}"?`,
  };
}

/**
 * Abandon / Inactivate VISIBILITY — the previous cluster must be Completed (or there is
 * no previous cluster), and the project must not already be in the OTHER terminal state.
 */
export function terminalButtonVisible(args: {
  kind: TerminalKind;
  project: ChecklistProject;
  previous: SequenceEntry | null;
  previousTracking: TrackingRow | null;
  abandonedStateId: string | null;
  inactiveStateId: string | null;
}): boolean {
  const ownId = args.kind === "abandon" ? args.abandonedStateId : args.inactiveStateId;
  const otherId = args.kind === "abandon" ? args.inactiveStateId : args.abandonedStateId;
  const inOwn = ownId !== null && args.project.clusterStateId === ownId;
  const inOther = otherId !== null && args.project.clusterStateId === otherId;
  if (!(inOwn || !inOther)) return false;
  if (!args.previous) return true;
  return args.previousTracking?.approvalClusterState === ACS.completed;
}

/**
 * Rule 21 — confirming the dialog.
 *
 * Patches the FIRST tracking row of the project that is In Progress / Abandoned /
 * Inactive-On-hold, patches `Projects.'Cluster State'`, and then bulk-resets every
 * `Request canceled` or `Rejected` tracking row back to `Not Started`.
 *
 * The canvas did that last part with `UpdateIf('Project State Trackings', …)`, which on a
 * Dataverse source is a hidden full scan. Here the rows to reset are the ones the caller
 * already has from its server-filtered query, so the plan is a PATCH per row and the
 * filter never leaves the server (step 15).
 */
export function planTerminalStateChange(args: {
  project: ChecklistProject;
  staging: TerminalStaging;
  trackings: TrackingRow[];
  canEdit: boolean;
}): WritePlan {
  const plan = emptyPlan();
  const guard = requireEditPermission(args.canEdit, plan);
  if (guard) return guard;

  const bu = args.project.owningBusinessUnitId;

  // `First(Filter(..., state in [In Progress, Abandoned, Inactive]))`.
  const primary = args.trackings.find((t) =>
    t.approvalClusterState === ACS.inProgress
    || t.approvalClusterState === ACS.abandoned
    || t.approvalClusterState === ACS.inactive);

  if (primary) {
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: primary.id,
      data: {
        [TRACKING_COL.approvalClusterState]: args.staging.approvalClusterState,
        ...(bu ? { [`${LOOKUP.owningBusinessUnit}@odata.bind`]: `/businessunits(${bu})` } : {}),
      },
      reason: `${primary.clusterStateName ?? "Tracking"} → ` +
        approvalStateLabel(args.staging.approvalClusterState),
    });
  }

  if (args.staging.targetClusterStateId) {
    plan.writes.push({
      op: "update", entitySet: ES.projects, id: args.project.id,
      data: {
        [`${LOOKUP.projectClusterState}@odata.bind`]:
          `/${ES.projectStates}(${args.staging.targetClusterStateId})`,
      },
      reason: `Project cluster state → ${args.staging.targetClusterStateName ?? "?"}`,
    });
  }

  // The bulk reset. `primary` is excluded — it was just set to the staged value.
  for (const t of args.trackings) {
    if (t.id === primary?.id) continue;
    if (t.approvalClusterState !== ACS.requestCanceled
      && t.approvalClusterState !== ACS.rejected) continue;
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: t.id,
      data: { [TRACKING_COL.approvalClusterState]: ACS.notStarted },
      reason: `${t.clusterStateName ?? "Tracking"} reset to Not Started`,
    });
  }

  plan.log.push(
    `Project set to ${args.staging.targetClusterStateName ?? "the current cluster"}.`,
  );
  return plan;
}

/* ═══════════════════════════════════════════════════════════════ the four flows ════ */

/**
 * Rule 25 — the persona snapshot written onto the tracking row BEFORE the gate flow runs.
 * `'Last Triggered Approval Personas': JSON([{PortfolioManager, Approvers, Contributors,
 * Notifications}])` and `'Last Triggered Approval Mode'`.
 */
export function approvalPersonaSnapshot(gate: GateSetting | null): Record<string, unknown> {
  return {
    [TRACKING_COL.lastTriggeredApprovalPersonas]: JSON.stringify([{
      PortfolioManager: gate?.portfolioManagerMail ?? "",
      Approvers: gate?.defaultApprovals ?? "",
      Contributors: gate?.defaultContributors ?? "",
      Notifications: gate?.defaultNotifications ?? "",
    }]),
    [TRACKING_COL.lastTriggeredApprovalMode]: gate?.approvalMode ?? null,
  };
}

/**
 * Rule 24 — the approver/contributor/notification tooltips.
 *
 * `Concat(ForAll(Table(ParseJSON(varDefaultApproval.'Default Approvers')),
 * {Mail: Value.PersonaRole}), Mail, Char(13))`. The JSON columns hold an array of persona
 * objects; the canvas reads `PersonaRole` off each. A malformed column must not take the
 * panel down, so a parse failure yields an empty list.
 */
export function parsePersonaList(json: string | null): string[] {
  if (isBlank(json)) return [];
  try {
    const parsed: unknown = JSON.parse(json as string);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const rec = p as Record<string, unknown>;
          const v = rec["PersonaRole"] ?? rec["Mail"] ?? rec["mail"];
          return typeof v === "string" ? v : null;
        }
        return null;
      })
      .filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}

export interface PersonaTooltip {
  portfolioManager: string[];
  contributors: string[];
  approvers: string[];
  notifications: string[];
}

/**
 * The tooltip's shape per `Approval Mode`: Formal shows Portfolio Manager, Contributors,
 * Approvers and Notifications; Local shows Approvers and Notifications; Only
 * Notifications shows Notifications alone.
 */
export function personaTooltip(gate: GateSetting | null): PersonaTooltip {
  const empty: PersonaTooltip = {
    portfolioManager: [], contributors: [], approvers: [], notifications: [],
  };
  if (!gate) return empty;
  const notifications = parsePersonaList(gate.defaultNotifications);
  if (gate.approvalMode === MODE.onlyNotifications) return { ...empty, notifications };
  const approvers = parsePersonaList(gate.defaultApprovals);
  if (gate.approvalMode === MODE.localApproval) {
    return { ...empty, approvers, notifications };
  }
  return {
    portfolioManager: gate.portfolioManagerMail ? [gate.portfolioManagerMail] : [],
    contributors: parsePersonaList(gate.defaultContributors),
    approvers,
    notifications,
  };
}

/**
 * The `PerformCommonRequestofCheckListApproval` payload.
 *
 * The flow's PowerAppV2 trigger takes four positional strings —
 * `text_1` ProjectGUID, `text_2` ProjectChecklistGUID, `text_4` DefaultApprovalGUID,
 * `text` CurrentProjectStateGUID — and `positional` preserves exactly that order so a
 * deployment against the flow (rather than the typed wrapper) cannot get it wrong.
 *
 * AMBIGUITY 5 not carried forward: the canvas's `"Checklist Completion"` branch computes
 * `DefaultApprovalGUID: locSelectedItemProjectState.Gate` inside its `With` and then does
 * not pass it — the `.Run()` passes a `Check List Default Approval` id, which is what the
 * flow's `GetItem` on `vsb_checklistdefaultapprovalses` actually needs. The dead binding
 * is dropped; the id that travels is the Check List Default Approval one.
 */
export function checklistApprovalArgs(args: {
  projectId: string;
  checklistId: string;
  checkListDefaultApprovalId: string;
  currentProjectStateId: string;
}): { positional: string[]; request: { projectId: string; checklistId: string; approverIds: string[] } } {
  return {
    positional: [
      args.projectId,
      args.checklistId,
      args.checkListDefaultApprovalId,
      args.currentProjectStateId,
    ],
    request: {
      projectId: args.projectId,
      checklistId: args.checklistId,
      // The flow resolves the personas itself from the Check List Default Approval row;
      // the id is what it needs, not a materialised approver list.
      approverIds: [args.checkListDefaultApprovalId],
    },
  };
}

/**
 * The `PerformCommonRequestofGateApproval` payload — `text_1` ProjectGUID, `text_2`
 * StateGUID, `text_3` StateTrackingGUID, `text_4` DefaultApprovalGUID.
 */
export function gateApprovalArgs(args: {
  projectId: string;
  stateId: string;
  stateTrackingId: string;
  defaultApprovalId: string;
}): { positional: string[]; request: { projectId: string; stateTrackingId: string; targetClusterState: string } } {
  return {
    positional: [
      args.projectId, args.stateId, args.stateTrackingId, args.defaultApprovalId,
    ],
    request: {
      projectId: args.projectId,
      stateTrackingId: args.stateTrackingId,
      targetClusterState: args.stateId,
    },
  };
}

/** What a flow hands back. The canvas reads `.runid` and `.approvalid` off the result. */
export interface FlowResult {
  runid?: string | null;
  approvalid?: string | null;
  /** The typed wrapper's camelCase field. */
  approvalId?: string | null;
}

/**
 * Rule 26 — the write-back is GATED ON `runid`.
 *
 * `If(Not(IsBlank(gblFlowRequestOfCheckListApproval.runid)), Patch(..., {'Flow Run Id':
 * …, 'Flow Approval Id': Coalesce(…approvalid, Blank())}))`. A flow that returns an
 * approval id but no run id writes NOTHING — the run never started, and recording the
 * approval id would make `showRequestApproval`'s stalled-recovery clause stop firing,
 * stranding the cluster.
 */
export function flowWriteBackPatch(
  result: FlowResult | null | undefined,
  target: "checklist" | "tracking",
): Record<string, unknown> | null {
  const runId = result?.runid ?? null;
  if (isBlank(runId)) return null;
  const approvalId = result?.approvalid ?? result?.approvalId ?? null;
  const cols = target === "checklist" ? CHECKLIST_COL : TRACKING_COL;
  return {
    [cols.flowRunId]: runId,
    [cols.flowApprovalId]: isBlank(approvalId) ? null : approvalId,
  };
}

/**
 * The gate-cancellation payload. AMBIGUITY 3: the flow declares `AppId` as required and
 * no action in its definition references it, and the 13-field JSON blob exists only
 * because a PowerAppV2 trigger cannot take a typed record. The replacement custom API
 * takes the state-tracking id alone (step 13).
 */
export const gateCancelArgs = (stateTrackingId: string): { stateTrackingId: string } =>
  ({ stateTrackingId });

export const CHECKLIST_CANCEL_FAILED =
  "The approval could not be cancelled. Nothing was changed.";

/**
 * Flow 3 / `vsb_CancelCheckListApproval` answers `{success: boolean}` — it responds
 * `false` when its scope failed, and the canvas read `.success` off the result and did
 * nothing with a `false`.
 *
 * The three writes the API makes are the ONLY thing that changes the checklist state, so
 * a `false` must surface as an error and the row must be left exactly as it was. Anything
 * that is not an explicit failure counts as success — the typed wrapper's mock returns
 * `{ok: true}` and a future contract might return neither field.
 */
export function checklistCancelSucceeded(
  result: { success?: boolean; ok?: boolean } | null | undefined,
): boolean {
  if (result?.success === false) return false;
  if (result?.ok === false) return false;
  return true;
}

/** The cancel writes the app makes alongside the API call (the flow writes the rest). */
export function planGateCancel(args: {
  project: ChecklistProject;
  tracking: TrackingRow;
  comment: string;
  canEdit: boolean;
}): WritePlan {
  const plan = emptyPlan();
  const guard = requireEditPermission(args.canEdit, plan);
  if (guard) return guard;

  plan.writes.push({
    op: "update", entitySet: ES.projectStateTrackings, id: args.tracking.id,
    data: {
      [TRACKING_COL.approvalClusterState]: ACS.inProgress,
      [TRACKING_COL.clusterStepState]: null,
      [TRACKING_COL.flowRunId]: null,
    },
    reason: `${args.tracking.clusterStateName ?? "Cluster"} approval request cancelled`,
  });
  plan.writes.push(
    trackingNoteWrite({
      name: `Request canceled - ${args.project.projectName ?? ""}`,
      trackingId: args.tracking.id,
      comment: `Request canceled - ${args.comment.trim()}`,
      note: null,
      noteType: CHOICE_PROCESS.noteType.none,
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    }),
  );
  return plan;
}

/* ══════════════════════════════════════════════════════════════════ the history ════ */

export interface HistoryQueryDescriptor {
  entitySet: string;
  lookupColumn: string;
  lookupValue: string;
  orderBy: string;
}

/**
 * Rule 27 — the history is a UNION keyed on the panel kind:
 * `'Project State Tracking Notes'` filtered by the tracking id for a Cluster Transition,
 * `'Project Checklist Tracking Note'` filtered by the checklist id for a Checklist
 * Completion, sorted by `createdon` descending.
 *
 * The canvas sorted client-side with `AddColumns(SortDate, DateTimeValue(createdon))`;
 * `$orderby=createdon desc` is the server's job (step 16).
 */
export function historyDescriptor(panel: PanelState): HistoryQueryDescriptor | null {
  if (panel.target.kind === "checklist") {
    return {
      entitySet: ES_PROCESS.projectChecklistTrackingNotes,
      lookupColumn: NOTE_COL.checklistLookup,
      lookupValue: panel.target.row.id,
      orderBy: `${NOTE_COL.createdOn} desc`,
    };
  }
  const id = panel.target.tracking?.id;
  if (!id) return null;
  return {
    entitySet: ES.projectStateTrackingNotes,
    lookupColumn: NOTE_COL.trackingLookup,
    lookupValue: id,
    orderBy: `${NOTE_COL.createdOn} desc`,
  };
}

function trackingNoteWrite(args: {
  name: string;
  trackingId: string | null;
  comment: string;
  note: string | null;
  noteType: number;
  owningBusinessUnitId: string | null;
}): PlannedWrite {
  const data: Record<string, unknown> = {
    [NOTE_COL.name]: args.name.slice(0, COMMENT_MAX_LENGTH),
    [NOTE_COL.comment]: args.comment.slice(0, COMMENT_MAX_LENGTH),
    [NOTE_COL.note]: args.note,
    [NOTE_COL.noteType]: args.noteType,
  };
  if (args.trackingId) {
    data[`${LOOKUP.projectStateTracking}@odata.bind`] =
      `/${ES.projectStateTrackings}(${args.trackingId})`;
  }
  if (args.owningBusinessUnitId) {
    data[`${LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${args.owningBusinessUnitId})`;
  }
  return {
    op: "create", entitySet: ES.projectStateTrackingNotes, data,
    reason: args.name,
  };
}

/** The checklist-side audit note the approval request writes. */
export function checklistNoteWrite(args: {
  name: string;
  checklistId: string;
  comment: string;
  owningBusinessUnitId: string | null;
}): PlannedWrite {
  const data: Record<string, unknown> = {
    [NOTE_COL.name]: args.name.slice(0, COMMENT_MAX_LENGTH),
    [NOTE_COL.comment]: args.comment.slice(0, COMMENT_MAX_LENGTH),
    [NOTE_COL.noteType]: CHOICE_PROCESS.noteType.checklistItem,
    [`${LOOKUP.projectChecklist}@odata.bind`]:
      `/${ES.projectChecklists}(${args.checklistId})`,
  };
  if (args.owningBusinessUnitId) {
    data[`${LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${args.owningBusinessUnitId})`;
  }
  return { op: "create", entitySet: ES_PROCESS.projectChecklistTrackingNotes, data,
    reason: args.name };
}

/* ══════════════════════════════════════════════════════════════════ the page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

export type ChecklistLockReason =
  | "General" | "Milestones" | "Generator" | "Production";

export interface ChecklistLockEntry {
  reason: ChecklistLockReason;
  label: string;
  hint: string;
}

/**
 * `con_Milestones_Page_LockMessage_3.Visible` — the start-cluster-aware milestone switch.
 *
 * `'Project ID'` blank, OR the milestone the project's START CLUSTER requires is missing,
 * OR `'Total Capacity'` is 0/blank, OR `'Net Yield p50'` is 0/blank:
 *
 *   0 → Project Start Date            4 → 4-Legally binding permits
 *   1 → 1-Feasibility studies         5 → FID and 5-Construction
 *   2 → 2-Project development started 6 → FID, 5-Construction and COD
 *   3 → 3-Application submitted       default → Project Start Date
 *
 * AMBIGUITY 2: unlike Planning, Grid Operator and Team this lock has NO Draft clause —
 * deliberately, because this is the screen that moves a project out of Draft. Kept
 * omitted. The banner's bullet list on the other screens is shared, which is how it can
 * render a set that does not match the condition; here the list is BUILT FROM the
 * condition, so the two cannot disagree.
 */
export function pageLock(project: ChecklistProject | null): ChecklistLockEntry[] {
  if (!project) {
    return [{ reason: "General", label: "• General", hint: "No project is loaded." }];
  }
  const out: ChecklistLockEntry[] = [];
  const m = project.milestones;

  if (isBlank(project.projectNumber)) {
    out.push({
      reason: "General", label: "• General",
      hint: "Save General Data once — Dataverse assigns the Project ID there.",
    });
  }

  const missing = missingStartClusterMilestones(project);
  if (missing.length) {
    out.push({
      reason: "Milestones", label: "• Milestones",
      hint: `This project starts at cluster ${startClusterNo(project)}, so it needs: ` +
        `${missing.join(", ")}.`,
    });
  }
  void m;

  if (!project.totalCapacity) {
    out.push({
      reason: "Generator", label: "• Generator",
      hint: "Add at least one generator so the project has a Total Capacity.",
    });
  }
  if (!project.netYieldP50) {
    out.push({
      reason: "Production", label: "• Production",
      hint: "Enter an energy yield so the project has a Net Yield p50.",
    });
  }
  return out;
}

/** The named milestones the project's start cluster requires and does not have. */
export function missingStartClusterMilestones(project: ChecklistProject): string[] {
  const m = project.milestones;
  const need = (value: string | null, label: string): string[] =>
    isBlank(value) ? [label] : [];

  switch (startClusterNo(project)) {
    case 0: return need(m.projectStartDate, "Project Start Date");
    case 1: return need(m.feasibilityStudies, "1-Feasibility studies");
    case 2: return need(m.projectDevelopmentStarted, "2-Project development started");
    case 3: return need(m.applicationSubmitted, "3-Application submitted");
    case 4: return need(m.legallyBindingPermits, "4-Legally binding permits");
    case 5: return [
      ...need(m.fid, "Final Investment Decision"),
      ...need(m.construction, "5-Construction"),
    ];
    case 6: return [
      ...need(m.fid, "Final Investment Decision"),
      ...need(m.construction, "5-Construction"),
      ...need(m.cod, "Operations start date (COD)"),
    ];
    default: return need(m.projectStartDate, "Project Start Date");
  }
}

export const isPageLocked = (project: ChecklistProject | null): boolean =>
  pageLock(project).length > 0;

/** The project sits in a terminal cluster — the Next-cluster button is off. */
export const projectIsTerminal = (
  project: ChecklistProject | null,
  abandonedStateId: string | null,
  inactiveStateId: string | null,
): boolean =>
  project !== null
  && project.clusterStateId !== null
  && (project.clusterStateId === abandonedStateId
    || project.clusterStateId === inactiveStateId);

/* ═════════════════════════════════════════════════════════════════════ helpers ════ */

export const APPROVAL_STATE_LABEL: Record<number, string> = {
  [ACS.notStarted]: "Not Started",
  [ACS.inProgress]: "In Progress",
  [ACS.completed]: "Completed",
  [ACS.rejected]: "Rejected",
  [ACS.requestCanceled]: "Request canceled",
  [ACS.abandoned]: "Abandoned",
  [ACS.inactive]: "Inactive/ On-hold",
  [ACS.canceling]: "Canceling",
};

export const approvalStateLabel = (v: number | null | undefined): string =>
  v === null || v === undefined ? "Not Started" : APPROVAL_STATE_LABEL[v] ?? String(v);

export const TASK_STATE_LABEL: Record<number, string> = {
  [TASK.none]: "Not started",
  [TASK.inProgress]: "In Progress",
  [TASK.completed]: "Completed",
};

export const taskStateLabel = (v: number | null | undefined): string =>
  v === null || v === undefined ? "Not started" : TASK_STATE_LABEL[v] ?? String(v);

export const APPROVAL_MODE_LABEL: Record<number, string> = {
  [MODE.formalApproval]: "Formal Approval",
  [MODE.localApproval]: "Local Approval",
  [MODE.onlyNotifications]: "Only Notifications",
};

/**
 * AMBIGUITY 1's fix — every plan-building function starts here.
 *
 * The canvas computed `CanEditSelectedProject` in `OnVisible` and NO control on the
 * screen reads it: the write buttons gate on approval state alone. Step 18 says do not
 * carry that forward. A refused plan is an EMPTY plan with a log line, so the caller
 * cannot accidentally issue a partial batch.
 */
function requireEditPermission(canEdit: boolean, plan: WritePlan): WritePlan | null {
  if (canEdit) return null;
  plan.log.push("Refused: you do not have permission to edit this project.");
  return plan;
}

/** True when a plan was refused rather than being genuinely empty. */
export const planWasRefused = (plan: WritePlan): boolean =>
  plan.writes.length === 0 && plan.log.some((l) => l.startsWith("Refused:"));

/** The gate settings for one cluster — active rows only, as every caller wants. */
export const activeGateFor = (
  gates: GateSetting[],
  clusterStateId: string | null,
): GateSetting | null =>
  gates.find((g) => g.clusterStateId === clusterStateId && g.gateActive) ?? null;

/** `LookUp('Project State Trackings', 'Cluster State'.'Project State' = <id>)`. */
export const trackingFor = (
  trackings: TrackingRow[],
  clusterStateId: string | null,
): TrackingRow | null =>
  trackings.find((t) => t.clusterStateId === clusterStateId) ?? null;

/* ═══════════════════════════════════════════ GUIDE q18/q19 — the checklist table ════ */

/**
 * GUIDE q18/q19 — the section title is `"{cluster} Checklist"`, title-cased ("Draft
 * Checklist"), not the lower-cased `"{cluster} checklist"` this screen rendered before the
 * recording existed.
 */
export const checklistTableTitle = (clusterName: string | null): string =>
  `${clusterName ?? "Cluster"} Checklist`;

/**
 * GUIDE q18/q19 — the "Gate Relevance" column is the literal `Yes` / `No` the recording
 * shows, not the `"Gate relevant"` badge this screen used to render.
 */
export const gateRelevanceLabel = (gateRelevance: boolean): "Yes" | "No" =>
  gateRelevance ? "Yes" : "No";

/**
 * GUIDE q18/q19's three-way stepper visual: a filled check for Completed, a pale fill for
 * In Progress, an unfilled circle for everything else (Not Started, and every other
 * approval state this screen can reach). Driven by `approvalStateLabel` so it never
 * disagrees with the text already rendered under the node.
 */
export type StepVisualStatus = "completed" | "inProgress" | "notStarted";

export const stepVisualStatus = (approvalLabel: string): StepVisualStatus => {
  if (approvalLabel === "Completed") return "completed";
  if (approvalLabel === "In Progress") return "inProgress";
  return "notStarted";
};

/**
 * GUIDE q18/q19 — the green envelope connector between two stepper nodes lights up once
 * the EARLIER of the pair is Completed; it is not itself an independent data field.
 */
export const stepConnectorLit = (earlierStatus: StepVisualStatus): boolean =>
  earlierStatus === "completed";

/* ═══════════════════════════════════════ GUIDE q20 — the cluster movement dialog ════ */

/**
 * GUIDE q20 — the dialog the recording opens from "View {next} Request History" is titled
 * `"Cluster Movement to {next}"`, interpolating the SAME `next` cluster name the button's
 * own caption already uses (`nextClusterCaption`), so the two can never disagree.
 */
export const clusterMovementTitle = (next: { name: string } | null): string =>
  `Cluster Movement to ${next?.name ?? "next cluster"}`;

/** `Approval Cluster Step State` (`vsb_approvalclusterstepstate`) labels. */
export const CLUSTER_STEP_STATE_LABEL: Record<number, string> = {
  [STEP.portfolioManager]: "Portfolio Manager",
  [STEP.controllingManager]: "Controlling Manager",
  [STEP.approvals]: "Approvals",
  [STEP.none]: "None",
};

/**
 * GUIDE q20 — the history dialog's nested table shows a "State" column reading `"None"`
 * for every row: that is `Cluster Step State`, a property of the TRACKING row the history
 * belongs to, not of the individual checklist row — which is why it repeats unchanged down
 * the table instead of varying per task.
 */
export const clusterStepStateLabel = (v: number | null | undefined): string =>
  v === null || v === undefined ? "None" : CLUSTER_STEP_STATE_LABEL[v] ?? String(v);
