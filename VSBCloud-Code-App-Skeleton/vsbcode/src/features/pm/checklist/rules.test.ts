/**
 * Project General CheckList Screen — unit tests.
 *
 * IDs are the spec's (UT-CHKLST-nnn). Pure functions only: the cluster-transition engine
 * returns WRITE PLANS, so the "one batch, not N requests" and "atomic" cases are asserted
 * on the plan rather than by mocking a transport.
 */
import { describe, it, expect } from "vitest";
import { ES, ES_PROCESS, CHOICE_PROCESS } from "@/data/entities";
import {
  TRACKING_COL, CHECKLIST_COL, NOTE_COL, PROJECT_COLUMN, LOOKUP, COMMENT_MAX_LENGTH,
  APPROVAL_CLUSTER_STATE as ACS, TASK_STATE as TASK, APPROVAL_MODE as MODE,
  AUTO_SKIPPED_COMMENT, UNKNOWN_CLUSTER_NO, COMPLETION_DATE_MESSAGE,
  COMMENT_REQUIRED_MESSAGE, PAGE_LOCK_TITLE,
  clusterNo, startClusterNo, hasRealGateProgress, expectedApprovalState,
  expectedApprovalComment, shouldBackfillSkippedClusters, planSkippedClusterBackfill,
  buildOperationalSequence, buildDisplaySequence, previousState, nextState,
  defaultSelectedCluster, planEnsureTracking, shouldMaterialiseChecklist,
  planChecklistMaterialisation, rowApprovalIcon, rowActionLabel, rowActionEnabled,
  showCancelApprovalIcon, canToggleInProgress, completionDateBlocksComplete,
  inProgressTogglePatch, completeTaskPatch, approvalSettingIndex, settingForRow,
  sortChecklistRows, commentMissing, commentError, commentReadOnly, showApprovalDueDate,
  showSave, canSavePanel, showRequestApproval, canRequestApproval, showCancelApproval,
  showReturnToPrevious, showActualTaskState,
  nextClusterCaption, nextClusterIcon, nextClusterEnabled, nextClusterActionKind,
  stageTerminalToggle, terminalButtonVisible, planTerminalStateChange,
  planClusterTransition, planReturnToPreviousCluster, planGateCancel, planWasRefused,
  checklistApprovalArgs, gateApprovalArgs, gateCancelArgs, flowWriteBackPatch,
  checklistCancelSucceeded, CHECKLIST_CANCEL_FAILED,
  approvalPersonaSnapshot, parsePersonaList, personaTooltip, historyDescriptor,
  pageLock, isPageLocked, missingStartClusterMilestones, projectIsTerminal,
  approvalStateLabel, taskStateLabel, activeGateFor, trackingFor, checklistStates,
  checklistTableTitle, gateRelevanceLabel, stepVisualStatus, stepConnectorLit,
  clusterMovementTitle, clusterStepStateLabel,
  type ChecklistProject, type ChecklistRow, type TrackingRow, type ProjectStateRef,
  type GateSetting, type ChecklistApprovalSetting, type DefaultChecklistTemplate,
  type PanelState, type SequenceEntry,
} from "./rules";
import {
  toChecklistProject, toTrackingRow, toChecklistRow, planToBatchOps,
  backfillSkippedClusters,
} from "./hooks";
import type { ProjectRow } from "@/data/repos";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const STATE_IDS = {
  draft: "ps-draft", c1: "ps-1", c2: "ps-2", c3: "ps-3",
  c4: "ps-4", c5: "ps-5", c6: "ps-6",
  abandoned: "ps-ab", inactive: "ps-in",
};

const state = (name: string, id: string, order: number): ProjectStateRef => ({
  id, name, order, isVisibleOnChecklist: true, clusterDescription: `${name} cluster`,
});

/** Draft … Cluster 6, in `vsb_order`. */
const ALL_STATES: ProjectStateRef[] = [
  state("Draft", STATE_IDS.draft, 0),
  state("Cluster 1", STATE_IDS.c1, 1),
  state("Cluster 2", STATE_IDS.c2, 2),
  state("Cluster 3", STATE_IDS.c3, 3),
  state("Cluster 4", STATE_IDS.c4, 4),
  state("Cluster 5", STATE_IDS.c5, 5),
  state("Cluster 6", STATE_IDS.c6, 6),
];

const project = (o: Partial<ChecklistProject> = {}): ChecklistProject => ({
  id: "p-1",
  projectName: "Windpark Nord",
  projectNumber: "DE-1021",
  startCluster: 0,
  clusterStateId: STATE_IDS.draft,
  clusterStateName: "Draft",
  approvalState: CHOICE_PROCESS.approvalClusterState.notStarted,
  countryId: "c-de",
  technology: CHOICE_PROCESS.technology.wind,
  owningBusinessUnitId: "bu-de",
  totalCapacity: 42.5,
  netYieldP50: 112400,
  milestones: {
    projectStartDate: "2026-01-01",
    feasibilityStudies: "2026-03-01",
    projectDevelopmentStarted: "2026-06-01",
    applicationSubmitted: "2027-01-01",
    legallyBindingPermits: "2027-09-01",
    fid: "2028-01-01",
    construction: "2028-04-01",
    cod: "2029-06-01",
  },
  ...o,
});

const tracking = (o: Partial<TrackingRow> = {}): TrackingRow => ({
  id: "t-1",
  clusterStateId: STATE_IDS.draft,
  clusterStateName: "Draft",
  approvalClusterState: ACS.inProgress,
  clusterStepState: null,
  approvalComment: null,
  approvalDueDate: null,
  flowRunId: null,
  flowApprovalId: null,
  ...o,
});

const row = (o: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: "cl-1",
  title: "Land secured",
  clusterStateId: STATE_IDS.c3,
  gateRelevance: true,
  holdingDescription: "All plots under contract",
  isCompletionDate: false,
  completionDate: null,
  taskState: TASK.none,
  approvalChecklistState: ACS.notStarted,
  note: null,
  sort: 1,
  projectDefaultChecklistId: "tpl-1",
  flowRunId: null,
  flowApprovalId: null,
  ...o,
});

const gate = (o: Partial<GateSetting> = {}): GateSetting => ({
  id: "g-1",
  clusterStateId: STATE_IDS.c3,
  approvalMode: MODE.formalApproval,
  gateActive: true,
  portfolioManagerId: "u-pm",
  portfolioManagerMail: "pm@vsb.energy",
  defaultApprovals: JSON.stringify([{ PersonaRole: "a@vsb.energy" }]),
  defaultContributors: JSON.stringify([{ PersonaRole: "c@vsb.energy" }]),
  defaultNotifications: JSON.stringify([{ PersonaRole: "n@vsb.energy" }]),
  ...o,
});

const setting = (o: Partial<ChecklistApprovalSetting> = {}): ChecklistApprovalSetting => ({
  id: "clda-1",
  projectDefaultChecklistId: "tpl-1",
  approvalMode: MODE.formalApproval,
  gateActive: true,
  portfolioManagerMail: "pm@vsb.energy",
  defaultApprovers: null,
  defaultContributors: null,
  defaultNotifications: null,
  ...o,
});

const template = (o: Partial<DefaultChecklistTemplate> = {}): DefaultChecklistTemplate => ({
  id: "tpl-1", name: "Land secured", clusterStateId: STATE_IDS.c3,
  gateRelevance: true, holdingTaskDescription: "All plots", isCompletionDate: false,
  order: 1, ...o,
});

/**
 * A raw Dataverse row. `ProjectRow` types some picklist columns as strings, so the fixture
 * is asserted rather than fought with — the mapper is what this file is testing.
 */
const projectRow = (o: Record<string, unknown>) => o as unknown as ProjectRow;

const seqEntry = (o: Partial<SequenceEntry> = {}): SequenceEntry => ({
  id: STATE_IDS.c3, name: "Cluster 3", clusterNo: 3, rowNumber: 1,
  clusterDescription: null, hasGate: false, gateId: null, ...o,
});

const clusterPanel = (o: {
  state?: SequenceEntry; tracking?: TrackingRow | null; gate?: GateSetting | null;
  comment?: string; approvalDueDate?: string | null;
} = {}): PanelState => ({
  target: {
    kind: "cluster",
    state: o.state ?? seqEntry(),
    tracking: o.tracking === undefined ? tracking() : o.tracking,
    gate: o.gate === undefined ? null : o.gate,
  },
  comment: o.comment ?? "Ready to move on",
  approvalDueDate: o.approvalDueDate ?? null,
});

const checklistPanel = (o: {
  row?: ChecklistRow; setting?: ChecklistApprovalSetting | null; comment?: string;
  hasEntry?: boolean;
} = {}): PanelState => ({
  target: {
    kind: "checklist",
    row: o.row ?? row(),
    setting: o.setting === undefined ? null : o.setting,
  },
  comment: o.comment ?? "Done",
  approvalDueDate: null,
  hasChecklistApprovalEntry: o.hasEntry,
});

/* ══════════════════════════════════════════════════════════════ cluster order */

describe("UT-CHKLST cluster ordinals", () => {
  it("UT-CHKLST-001 cluster names map to ordinals", () => {
    expect([
      clusterNo("Draft"), clusterNo("Cluster 1"), clusterNo("Cluster 2"),
      clusterNo("Cluster 3"), clusterNo("Cluster 4"), clusterNo("Cluster 5"),
      clusterNo("Cluster 6"), clusterNo("Operations"),
    ]).toEqual([0, 1, 2, 3, 4, 5, 6, 999]);
    expect(clusterNo(null)).toBe(UNKNOWN_CLUSTER_NO);
  });

  it("UT-CHKLST-002 a blank Start Cluster defaults to Greenfield", () => {
    expect(startClusterNo(project({ startCluster: null }))).toBe(0);
    expect(startClusterNo(null)).toBe(0);
  });

  it("UT-CHKLST-003 Start Cluster 3 resolves to 3", () => {
    expect(startClusterNo(project({ startCluster: 3 }))).toBe(3);
    expect(startClusterNo(project({ startCluster: 6 }))).toBe(6);
    // The trailing `0` arm of the Switch catches anything outside 0…6.
    expect(startClusterNo(project({ startCluster: 42 }))).toBe(0);
  });

  it("only checklist-visible, recognised clusters take part", () => {
    const states = [
      ...ALL_STATES,
      { ...state("Operations", "ps-op", 7) },
      { ...state("Cluster 4", "ps-hidden", 4), isVisibleOnChecklist: false },
    ];
    expect(checklistStates(states).map((x) => x.name)).toEqual([
      "Draft", "Cluster 1", "Cluster 2", "Cluster 3",
      "Cluster 4", "Cluster 5", "Cluster 6",
    ]);
  });
});

/* ══════════════════════════════════════════════════════════ real gate progress */

describe("UT-CHKLST real gate progress", () => {
  it("UT-CHKLST-004 a FlowRunId marks real gate progress", () => {
    expect(hasRealGateProgress([tracking({ flowRunId: "run-1" })], 3)).toBe(true);
    expect(hasRealGateProgress([tracking({ flowApprovalId: "ap-1" })], 3)).toBe(true);
  });

  it("UT-CHKLST-005 auto-skipped Completed rows are not real progress", () => {
    const rows = [
      tracking({
        id: "t-0", clusterStateId: STATE_IDS.draft, clusterStateName: "Draft",
        approvalClusterState: ACS.inProgress,
      }),
      tracking({
        id: "t-1", clusterStateId: STATE_IDS.c1, clusterStateName: "Cluster 1",
        approvalClusterState: ACS.completed, approvalComment: AUTO_SKIPPED_COMMENT,
      }),
      tracking({
        id: "t-2", clusterStateId: STATE_IDS.c2, clusterStateName: "Cluster 2",
        approvalClusterState: ACS.completed, approvalComment: AUTO_SKIPPED_COMMENT,
      }),
    ];
    expect(hasRealGateProgress(rows, 3)).toBe(false);
    // The same rows AT or ABOVE the start cluster are real progress.
    expect(hasRealGateProgress(rows, 1)).toBe(true);
  });

  it("UT-CHKLST-006 a Draft row with a comment is real progress", () => {
    expect(hasRealGateProgress([
      tracking({ approvalClusterState: ACS.inProgress, approvalComment: "Reviewed" }),
    ], 3)).toBe(true);
    // Draft + In Progress + no comment is the clean initial state.
    expect(hasRealGateProgress([tracking()], 3)).toBe(false);
  });

  it("a Draft row in any terminal state is real progress", () => {
    for (const s of [ACS.completed, ACS.rejected, ACS.requestCanceled, ACS.canceling,
      ACS.abandoned, ACS.inactive]) {
      expect(hasRealGateProgress([tracking({ approvalClusterState: s })], 3)).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════ the back-fill */

describe("UT-CHKLST the skipped-cluster back-fill", () => {
  it("UT-CHKLST-007 the back-fill targets", () => {
    expect([0, 1, 2, 3, 4].map((n) => expectedApprovalState(n, 3))).toEqual([
      ACS.inProgress, ACS.completed, ACS.completed, ACS.notStarted, ACS.notStarted,
    ]);
    expect(expectedApprovalComment(1, 3)).toBe(AUTO_SKIPPED_COMMENT);
    expect(expectedApprovalComment(3, 3)).toBeNull();
    expect(expectedApprovalComment(0, 3)).toBeNull();
  });

  it("UT-CHKLST-008 the back-fill is skipped once the project has left Draft", () => {
    expect(shouldBackfillSkippedClusters({
      startCluster: 3, clusterStateName: "Cluster 2", trackings: [],
    })).toBe(false);
    // …and for a Greenfield project, where nothing is skipped.
    expect(shouldBackfillSkippedClusters({
      startCluster: 0, clusterStateName: "Draft", trackings: [],
    })).toBe(false);
    // A project with no cluster state at all counts as Draft.
    expect(shouldBackfillSkippedClusters({
      startCluster: 3, clusterStateName: null, trackings: [],
    })).toBe(true);
  });

  it("UT-CHKLST-009 the back-fill is one batch, not N requests", () => {
    const plan = planSkippedClusterBackfill(ALL_STATES, [], 3, {
      projectId: "p-1", owningBusinessUnitId: "bu-de",
    });
    // Seven clusters, none of which exist yet → seven creates in ONE plan.
    expect(plan.writes).toHaveLength(7);
    const ops = planToBatchOps(plan);
    expect(ops.every((o) => o.entitySet === ES.projectStateTrackings)).toBe(true);
    expect(ops.every((o) => o.op === "create")).toBe(true);
    // The Draft row starts In Progress; 1 and 2 are auto-completed; 3+ Not Started.
    expect(ops[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.inProgress);
    expect(ops[1].data![TRACKING_COL.approvalComment]).toBe(AUTO_SKIPPED_COMMENT);
    expect(ops[3].data![TRACKING_COL.approvalClusterState]).toBe(ACS.notStarted);
  });

  it("UT-CHKLST-010 the back-fill is idempotent", () => {
    const existing: TrackingRow[] = ALL_STATES.map((st, i) => {
      const no = clusterNo(st.name);
      return tracking({
        id: `t-${i}`, clusterStateId: st.id, clusterStateName: st.name,
        approvalClusterState: expectedApprovalState(no, 3),
        approvalComment: expectedApprovalComment(no, 3),
      });
    });
    const plan = planSkippedClusterBackfill(ALL_STATES, existing, 3, {
      projectId: "p-1", owningBusinessUnitId: "bu-de",
    });
    expect(plan.writes).toEqual([]);
  });

  it("a row at the target state but carrying a stale FlowRunId is still rewritten", () => {
    const existing = [tracking({
      clusterStateId: STATE_IDS.c1, clusterStateName: "Cluster 1",
      approvalClusterState: ACS.completed, approvalComment: AUTO_SKIPPED_COMMENT,
      flowRunId: "stale-run",
    })];
    const plan = planSkippedClusterBackfill([ALL_STATES[1]], existing, 3, {
      projectId: "p-1", owningBusinessUnitId: null,
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].op).toBe("update");
    expect(plan.writes[0].data![TRACKING_COL.flowRunId]).toBeNull();
    expect(plan.writes[0].data![TRACKING_COL.clusterStepState]).toBeNull();
  });

  it("UT-CHKLST-042 the back-fill is refused without edit permission", async () => {
    const res = await backfillSkippedClusters({
      project: project({ startCluster: 3 }), states: ALL_STATES,
      trackings: [], canEdit: false,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.writes).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════ the sequences */

describe("UT-CHKLST the two sequences", () => {
  it("UT-CHKLST-011 the operational sequence keeps Draft plus clusters ≥ start", () => {
    expect(buildOperationalSequence(ALL_STATES, 3).map((x) => x.name))
      .toEqual(["Draft", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"]);
    expect(buildOperationalSequence(ALL_STATES, 0).map((x) => x.name)).toHaveLength(7);
    // RowNumber is the array index, not a patched column.
    expect(buildOperationalSequence(ALL_STATES, 3).map((x) => x.rowNumber))
      .toEqual([0, 1, 2, 3, 4]);
  });

  it("UT-CHKLST-012 the display sequence flags the skipped clusters", () => {
    const seq = buildDisplaySequence(ALL_STATES, 3);
    expect(seq).toHaveLength(7);
    expect(seq.filter((x) => x.isSkippedDisplayOnly).map((x) => x.name))
      .toEqual(["Cluster 1", "Cluster 2"]);
    expect(seq[0].isSkippedDisplayOnly).toBe(false);   // Draft is never skipped
    expect(seq[3].isSkippedDisplayOnly).toBe(false);   // the start cluster itself
  });

  it("UT-CHKLST-013 previous and next resolve by index on the operational sequence", () => {
    const seq = buildOperationalSequence(ALL_STATES, 3);
    expect(previousState(seq, STATE_IDS.c3)?.name).toBe("Draft");
    expect(nextState(seq, STATE_IDS.c3)?.name).toBe("Cluster 4");
    expect(previousState(seq, STATE_IDS.draft)).toBeNull();
    expect(nextState(seq, STATE_IDS.c6)).toBeNull();
    expect(nextState(seq, "not-in-the-sequence")).toBeNull();
  });

  it("the gate is resolved onto the sequence entry, active rows only", () => {
    const gates = [
      gate({ id: "g-3", clusterStateId: STATE_IDS.c3, gateActive: true }),
      gate({ id: "g-4", clusterStateId: STATE_IDS.c4, gateActive: false }),
    ];
    const seq = buildOperationalSequence(ALL_STATES, 3, gates);
    expect(seq.find((x) => x.id === STATE_IDS.c3)?.hasGate).toBe(true);
    expect(seq.find((x) => x.id === STATE_IDS.c3)?.gateId).toBe("g-3");
    expect(seq.find((x) => x.id === STATE_IDS.c4)?.hasGate).toBe(false);
    expect(activeGateFor(gates, STATE_IDS.c4)).toBeNull();
  });

  it("UT-CHKLST-014 the default selection is the first In Progress cluster", () => {
    const seq = buildOperationalSequence(ALL_STATES, 3);
    const trackings = [
      tracking({ clusterStateId: STATE_IDS.draft, approvalClusterState: ACS.completed }),
      tracking({ id: "t-3", clusterStateId: STATE_IDS.c3, approvalClusterState: ACS.completed }),
      tracking({ id: "t-4", clusterStateId: STATE_IDS.c4, approvalClusterState: ACS.inProgress }),
    ];
    expect(defaultSelectedCluster(seq, trackings)?.name).toBe("Cluster 4");
  });

  it("UT-CHKLST-015 with nothing In Progress the default is the first entry", () => {
    const seq = buildOperationalSequence(ALL_STATES, 3);
    const trackings = seq.map((x, i) => tracking({
      id: `t-${i}`, clusterStateId: x.id, approvalClusterState: ACS.notStarted,
    }));
    expect(defaultSelectedCluster(seq, trackings)?.name).toBe("Draft");
    expect(defaultSelectedCluster([], [])).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════ ensure tracking / materialise */

describe("UT-CHKLST the self-heals", () => {
  it("UT-CHKLST-016 a missing Draft tracking row is created In Progress", () => {
    const plan = planEnsureTracking(
      seqEntry({ id: STATE_IDS.draft, name: "Draft", clusterNo: 0 }), null,
      { projectId: "p-1", owningBusinessUnitId: "bu-de" },
    );
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.inProgress);
    expect(plan.writes[0].data![`${LOOKUP.clusterState}@odata.bind`])
      .toBe(`/${ES.projectStates}(${STATE_IDS.draft})`);
  });

  it("UT-CHKLST-017 a missing non-Draft tracking row is created Not Started", () => {
    const plan = planEnsureTracking(seqEntry(), null, {
      projectId: "p-1", owningBusinessUnitId: null,
    });
    expect(plan.writes[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.notStarted);
    // No business unit means no binding, not an empty one.
    expect(plan.writes[0].data![`${LOOKUP.owningBusinessUnit}@odata.bind`]).toBeUndefined();
  });

  it("an existing tracking row produces no write", () => {
    expect(planEnsureTracking(seqEntry(), tracking(), {
      projectId: "p-1", owningBusinessUnitId: null,
    }).writes).toEqual([]);
  });

  it("UT-CHKLST-018 materialisation is skipped for a Completed cluster", () => {
    expect(shouldMaterialiseChecklist(
      tracking({ approvalClusterState: ACS.completed }), 0,
    )).toBe(false);
    // …and whenever rows already exist.
    expect(shouldMaterialiseChecklist(tracking(), 4)).toBe(false);
    expect(shouldMaterialiseChecklist(tracking(), 0)).toBe(true);
    expect(shouldMaterialiseChecklist(null, 0)).toBe(true);
  });

  it("UT-CHKLST-019 materialised rows carry the template's shape", () => {
    const plan = planChecklistMaterialisation(
      [template(), template({ id: "tpl-2", name: "Grid connection", order: 2 })],
      { projectId: "p-1", clusterStateId: STATE_IDS.c3, owningBusinessUnitId: "bu-de" },
    );
    expect(plan.writes).toHaveLength(2);
    const first = plan.writes[0].data!;
    expect(plan.writes[0].entitySet).toBe(ES.projectChecklists);
    expect(first[CHECKLIST_COL.name]).toBe("Land secured");
    expect(first[CHECKLIST_COL.projectDefaultChecklist]).toBe("tpl-1");
    expect(first[CHECKLIST_COL.taskState]).toBe(TASK.none);
    expect(first[CHECKLIST_COL.approvalChecklistState]).toBe(ACS.notStarted);
    expect(first[`${LOOKUP.clusterState}@odata.bind`])
      .toBe(`/${ES.projectStates}(${STATE_IDS.c3})`);
  });
});

/* ═══════════════════════════════════════════════════════════════ the gallery */

describe("UT-CHKLST the checklist rows", () => {
  it("UT-CHKLST-020 the row action label reflects the approval state", () => {
    const withPeople = setting({ approvalMode: MODE.formalApproval });
    expect(rowActionLabel(row({ approvalChecklistState: ACS.inProgress }), withPeople))
      .toBe("Pending");
    expect(rowActionLabel(row({ approvalChecklistState: ACS.completed }), withPeople))
      .toBe("Approved");
    expect(rowActionLabel(row({ approvalChecklistState: ACS.notStarted }), withPeople))
      .toBe("Approval");
    expect(rowActionLabel(row({ approvalChecklistState: null }), withPeople))
      .toBe("Approval");
  });

  it("UT-CHKLST-021 without an approval mode the label is Complete", () => {
    expect(rowActionLabel(row(), null)).toBe("Complete");
    // Only Notifications draws a Mail icon, so the button is still "Complete".
    expect(rowActionLabel(row(), setting({ approvalMode: MODE.onlyNotifications })))
      .toBe("Complete");
  });

  it("rule 13 — the icon follows the approval mode and the Gate active flag", () => {
    expect(rowApprovalIcon(setting({ approvalMode: MODE.onlyNotifications }))).toBe("Mail");
    expect(rowApprovalIcon(setting({ approvalMode: MODE.formalApproval }))).toBe("People");
    expect(rowApprovalIcon(setting({ approvalMode: MODE.localApproval }))).toBe("People");
    expect(rowApprovalIcon(setting({ gateActive: false }))).toBeNull();
    expect(rowApprovalIcon(null)).toBeNull();
  });

  it("UT-CHKLST-022 a completion-date task blocks Complete", () => {
    const needsDate = row({ isCompletionDate: true, completionDate: null });
    expect(completionDateBlocksComplete(needsDate)).toBe(true);
    expect(completionDateBlocksComplete({ ...needsDate, completionDate: "2027-01-01" }))
      .toBe(false);
    expect(completionDateBlocksComplete(row())).toBe(false);
    expect(COMPLETION_DATE_MESSAGE)
      .toBe('Please enter completion date to set the cluster-check on "Complete"');
  });

  it("UT-CHKLST-023 In Progress toggles off to None and resets the approval state", () => {
    expect(inProgressTogglePatch(row({ taskState: TASK.inProgress }))).toEqual({
      [CHECKLIST_COL.taskState]: TASK.none,
      [CHECKLIST_COL.approvalChecklistState]: ACS.notStarted,
    });
    expect(inProgressTogglePatch(row({ taskState: TASK.none }))).toEqual({
      [CHECKLIST_COL.taskState]: TASK.inProgress,
      [CHECKLIST_COL.approvalChecklistState]: ACS.notStarted,
    });
    expect(completeTaskPatch()).toEqual({ [CHECKLIST_COL.taskState]: TASK.completed });
  });

  it("the row button and the In Progress toggle follow the label", () => {
    expect(rowActionEnabled(row({ taskState: TASK.none }), "Complete")).toBe(true);
    expect(rowActionEnabled(row({ taskState: TASK.completed }), "Complete")).toBe(false);
    expect(rowActionEnabled(row({ taskState: TASK.completed }), "Approval")).toBe(true);
    // …but not when the row's own history panel is open.
    expect(rowActionEnabled(row({ taskState: TASK.completed }), "Approval", true))
      .toBe(false);
    expect(rowActionEnabled(row(), "Pending")).toBe(false);
    expect(showCancelApprovalIcon("Pending")).toBe(true);
    expect(showCancelApprovalIcon("Approved")).toBe(true);
    expect(canToggleInProgress("Pending")).toBe(false);
    expect(canToggleInProgress("Complete")).toBe(true);
  });

  it("UT-CHKLST-043 an empty checklist renders nothing and does not crash", () => {
    expect(sortChecklistRows([])).toEqual([]);
    const index = approvalSettingIndex([]);
    expect(settingForRow(index, row())).toBeNull();
    expect(settingForRow(index, row({ projectDefaultChecklistId: null }))).toBeNull();
  });

  it("the approval settings resolve once per cluster, not per row per property", () => {
    const index = approvalSettingIndex([setting(), setting({
      id: "clda-2", projectDefaultChecklistId: "tpl-2",
    })]);
    expect(index.size).toBe(2);
    expect(settingForRow(index, row())?.id).toBe("clda-1");
    expect(settingForRow(index, row({ projectDefaultChecklistId: "tpl-2" }))?.id)
      .toBe("clda-2");
  });

  it("rows sort by Order ascending", () => {
    const rows = [row({ id: "c", sort: 3 }), row({ id: "a", sort: 1 }), row({ id: "b", sort: 2 })];
    expect(sortChecklistRows(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

/* ══════════════════════════════════════════════════════════════ the right panel */

describe("UT-CHKLST the panel buttons", () => {
  it("UT-CHKLST-024 a blank comment disables all four panel buttons", () => {
    const blank = clusterPanel({ comment: "   " });
    expect(commentMissing(blank.comment)).toBe(true);
    expect(commentError(blank.comment)).toBe(COMMENT_REQUIRED_MESSAGE);
    expect(canSavePanel(blank)).toBe(false);
    expect(canRequestApproval(blank)).toBe(false);
    expect(COMMENT_REQUIRED_MESSAGE).toBe("Please enter comment");
    expect(COMMENT_MAX_LENGTH).toBe(300);
  });

  it("UT-CHKLST-025 the comment is read-only once the cluster is Completed", () => {
    expect(commentReadOnly(clusterPanel({
      tracking: tracking({ approvalClusterState: ACS.completed }),
    }))).toBe(true);
    expect(commentReadOnly(clusterPanel())).toBe(false);
    // Never read-only on the checklist branch, whatever the tracking says.
    expect(commentReadOnly(checklistPanel())).toBe(false);
  });

  it("UT-CHKLST-026 the due date is hidden for Only Notifications", () => {
    expect(showApprovalDueDate(clusterPanel({
      gate: gate({ approvalMode: MODE.onlyNotifications }),
    }))).toBe(false);
    expect(showApprovalDueDate(clusterPanel({
      gate: gate({ approvalMode: MODE.formalApproval }),
    }))).toBe(true);
    expect(showApprovalDueDate(clusterPanel({
      gate: gate({ approvalMode: MODE.localApproval }),
    }))).toBe(true);
    expect(showApprovalDueDate(clusterPanel({ gate: null }))).toBe(false);
  });

  it("UT-CHKLST-027 Save is hidden for a gated cluster", () => {
    expect(showSave(clusterPanel({
      state: seqEntry({ hasGate: true, gateId: "g-1" }),
      tracking: tracking({ approvalClusterState: ACS.inProgress }),
    }))).toBe(false);
    // …and shown for an ungated one that is In Progress.
    expect(showSave(clusterPanel({
      tracking: tracking({ approvalClusterState: ACS.inProgress }),
    }))).toBe(true);
    // …but not once it has left In Progress.
    expect(showSave(clusterPanel({
      tracking: tracking({ approvalClusterState: ACS.notStarted }),
    }))).toBe(false);
  });

  it("Save on the checklist branch needs In Progress and NO approval entry", () => {
    expect(showSave(checklistPanel({
      row: row({ approvalChecklistState: ACS.inProgress }), hasEntry: false,
    }))).toBe(true);
    expect(showSave(checklistPanel({
      row: row({ approvalChecklistState: ACS.inProgress }), hasEntry: true,
    }))).toBe(false);
    expect(showSave(checklistPanel({
      row: row({ approvalChecklistState: ACS.notStarted }), hasEntry: false,
    }))).toBe(false);
  });

  it("UT-CHKLST-028 Request Approval is visible for a stalled In Progress cluster", () => {
    // The recovery path: In Progress with both flow ids blank means the flow never
    // started, so the user must be able to retry.
    expect(showRequestApproval(clusterPanel({
      state: seqEntry({ hasGate: true }),
      tracking: tracking({
        approvalClusterState: ACS.inProgress, flowRunId: null, flowApprovalId: null,
      }),
    }))).toBe(true);
  });

  it("UT-CHKLST-029 Request Approval is hidden once the flow is running", () => {
    expect(showRequestApproval(clusterPanel({
      state: seqEntry({ hasGate: true }),
      tracking: tracking({ approvalClusterState: ACS.inProgress, flowRunId: "run-1" }),
    }))).toBe(false);
    // …and once the cluster is Completed.
    expect(showRequestApproval(clusterPanel({
      state: seqEntry({ hasGate: true }),
      tracking: tracking({ approvalClusterState: ACS.completed }),
    }))).toBe(false);
    // An ungated cluster never offers it.
    expect(showRequestApproval(clusterPanel({
      state: seqEntry({ hasGate: false }),
      tracking: tracking({ approvalClusterState: ACS.notStarted }),
    }))).toBe(false);
  });

  it("Request Approval on the checklist branch", () => {
    expect(showRequestApproval(checklistPanel({
      row: row({ approvalChecklistState: null }),
    }))).toBe(true);
    expect(showRequestApproval(checklistPanel({
      row: row({ approvalChecklistState: ACS.notStarted }),
    }))).toBe(true);
    expect(showRequestApproval(checklistPanel({
      row: row({ approvalChecklistState: ACS.inProgress }),
    }))).toBe(false);
    expect(showRequestApproval(checklistPanel({
      row: row({ approvalChecklistState: ACS.completed }),
    }))).toBe(false);
  });

  it("Cancel Approval needs a live run, In Progress, and not Only Notifications", () => {
    const live = tracking({ approvalClusterState: ACS.inProgress, flowRunId: "run-1" });
    expect(showCancelApproval(clusterPanel({
      tracking: live, gate: gate({ approvalMode: MODE.formalApproval }),
    }))).toBe(true);
    expect(showCancelApproval(clusterPanel({
      tracking: live, gate: gate({ approvalMode: MODE.onlyNotifications }),
    }))).toBe(false);
    expect(showCancelApproval(clusterPanel({ tracking: tracking(), gate: gate() })))
      .toBe(false);
  });

  it("the disabled Return-to-previous rule is ported and testable", () => {
    // `pcf_…_Buttons_Return.Visible` is hard-coded false in the canvas; the sibling
    // control carries the real condition, which is what this reproduces.
    const previous = seqEntry({ id: STATE_IDS.c3, name: "Cluster 3", clusterNo: 3 });
    const panel = clusterPanel({
      state: seqEntry({ id: STATE_IDS.c4, name: "Cluster 4", clusterNo: 4 }),
      tracking: tracking({ approvalClusterState: ACS.inProgress }),
    });
    expect(showReturnToPrevious(panel, previous, 3)).toBe(true);
    // Not below the start cluster…
    expect(showReturnToPrevious(panel, previous, 4)).toBe(false);
    // …never back to Draft…
    expect(showReturnToPrevious(
      panel, seqEntry({ name: "Draft", clusterNo: 0 }), 0,
    )).toBe(false);
    // …and never on a Completed cluster.
    expect(showReturnToPrevious(
      clusterPanel({ tracking: tracking({ approvalClusterState: ACS.completed }) }),
      previous, 3,
    )).toBe(false);
  });

  it("the actual-task-state block needs an unfinished cluster with rows", () => {
    expect(showActualTaskState(clusterPanel(), 3)).toBe(true);
    expect(showActualTaskState(clusterPanel(), 0)).toBe(false);
    expect(showActualTaskState(clusterPanel({
      tracking: tracking({ approvalClusterState: ACS.completed }),
    }), 3)).toBe(false);
    expect(showActualTaskState(clusterPanel({
      tracking: tracking({ clusterStepState: CHOICE_PROCESS.clusterStepState.approvals }),
    }), 3)).toBe(false);
    expect(showActualTaskState(checklistPanel(), 3)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════ the next-cluster button */

describe("UT-CHKLST the next-cluster button", () => {
  const state3 = seqEntry({ id: STATE_IDS.c3, name: "Cluster 3", clusterNo: 3 });
  const next4 = seqEntry({ id: STATE_IDS.c4, name: "Cluster 4", clusterNo: 4 });

  it("rule 22 — the four-way caption", () => {
    // Completed / Request canceled / Canceling → history.
    for (const s of [ACS.completed, ACS.requestCanceled, ACS.canceling]) {
      expect(nextClusterCaption({
        tracking: tracking({ approvalClusterState: s }), state: state3, next: next4, gate: null,
      })).toBe("View Cluster 4 Request History");
    }
    // A live run while In Progress → history.
    expect(nextClusterCaption({
      tracking: tracking({ approvalClusterState: ACS.inProgress, flowRunId: "run-1" }),
      state: state3, next: next4, gate: null,
    })).toBe("View Cluster 4 Request History");
    // An active Only-Notifications gate → move.
    expect(nextClusterCaption({
      tracking: tracking({ approvalClusterState: ACS.inProgress }),
      state: { ...state3, hasGate: true },
      next: next4, gate: gate({ approvalMode: MODE.onlyNotifications }),
    })).toBe("Move to Cluster 4");
    // Any other active gate → request.
    expect(nextClusterCaption({
      tracking: tracking({ approvalClusterState: ACS.inProgress }),
      state: { ...state3, hasGate: true },
      next: next4, gate: gate({ approvalMode: MODE.formalApproval }),
    })).toBe("Request Cluster 4 Approval");
    // No gate → move.
    expect(nextClusterCaption({
      tracking: tracking({ approvalClusterState: ACS.inProgress }),
      state: state3, next: next4, gate: null,
    })).toBe("Move to Cluster 4");
  });

  it("rule 23 — the icon", () => {
    expect(nextClusterIcon({ ...state3, hasGate: true }, gate())).toBe("TriggerApproval");
    expect(nextClusterIcon({ ...state3, hasGate: true }, gate({ gateActive: false })))
      .toBe("CheckMark");
    expect(nextClusterIcon(state3, null)).toBe("CheckMark");
  });

  it("the button is disabled when locked, terminal or the previous cluster is open", () => {
    const base = {
      locked: false, projectIsTerminal: false,
      tracking: tracking({ approvalClusterState: ACS.notStarted }),
      previous: seqEntry({ id: STATE_IDS.c2 }),
      previousTracking: tracking({ approvalClusterState: ACS.completed }),
    };
    expect(nextClusterEnabled(base)).toBe(true);
    expect(nextClusterEnabled({ ...base, locked: true })).toBe(false);
    expect(nextClusterEnabled({ ...base, projectIsTerminal: true })).toBe(false);
    expect(nextClusterEnabled({
      ...base, previousTracking: tracking({ approvalClusterState: ACS.inProgress }),
    })).toBe(false);
    // A live FlowRunId on the current row also blocks it.
    expect(nextClusterEnabled({
      ...base, tracking: tracking({
        approvalClusterState: ACS.notStarted, flowRunId: "run-1",
      }),
    })).toBe(false);
    // With no previous cluster it is always available.
    expect(nextClusterEnabled({ ...base, previous: null, previousTracking: null }))
      .toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════ the cluster transition */

describe("UT-CHKLST the cluster transition", () => {
  const state3 = seqEntry({ id: STATE_IDS.c3, name: "Cluster 3", clusterNo: 3 });
  const next4 = seqEntry({ id: STATE_IDS.c4, name: "Cluster 4", clusterNo: 4 });

  it("UT-CHKLST-035 a direct move completes, starts the next and marks the project Approved", () => {
    const plan = planClusterTransition({
      project: project(), state: state3,
      tracking: tracking({ id: "t-3", clusterStateId: STATE_IDS.c3 }),
      next: next4, nextTracking: null,
      comment: "Everything is done", approvalDueDate: null, canEdit: true,
    });
    // current tracking, next tracking, the note, the project — four writes, one batch.
    expect(plan.writes).toHaveLength(4);
    expect(plan.writes[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.completed);
    expect(plan.writes[1].op).toBe("create");
    expect(plan.writes[1].data![TRACKING_COL.approvalClusterState]).toBe(ACS.inProgress);
    expect(plan.writes[2].entitySet).toBe(ES.projectStateTrackingNotes);
    const projectWrite = plan.writes[3];
    expect(projectWrite.entitySet).toBe(ES.projects);
    expect(projectWrite.data![`${LOOKUP.projectClusterState}@odata.bind`])
      .toBe(`/${ES.projectStates}(${STATE_IDS.c4})`);
    expect(projectWrite.data![PROJECT_COLUMN.approvalStates]).toBe(952850002);
  });

  it("UT-CHKLST-036 the whole move is one batch, so it cannot half-apply", () => {
    const plan = planClusterTransition({
      project: project(), state: state3, tracking: tracking({ id: "t-3" }),
      next: next4, nextTracking: tracking({ id: "t-4", clusterStateId: STATE_IDS.c4 }),
      comment: "Move on", approvalDueDate: "2027-01-31", canEdit: true,
    });
    const ops = planToBatchOps(plan);
    // One array → one `dataClient.batch` call. The canvas issued four separate Patches.
    expect(ops).toHaveLength(4);
    expect(ops.filter((o) => o.entitySet === ES.projectStateTrackings)).toHaveLength(2);
    expect(ops[1].op).toBe("update");
    expect(ops[1].id).toBe("t-4");
    expect(ops[0].data![TRACKING_COL.approvalDueDate]).toBe("2027-01-31");
  });

  it("the last cluster completes without a project patch", () => {
    const plan = planClusterTransition({
      project: project(), state: seqEntry({ id: STATE_IDS.c6, name: "Cluster 6" }),
      tracking: tracking({ id: "t-6" }), next: null, nextTracking: null,
      comment: "Done", approvalDueDate: null, canEdit: true,
    });
    expect(plan.writes.map((w) => w.entitySet)).toEqual([
      ES.projectStateTrackings, ES.projectStateTrackingNotes,
    ]);
  });

  it("the transition is refused without edit permission", () => {
    const plan = planClusterTransition({
      project: project(), state: state3, tracking: tracking(), next: next4,
      nextTracking: null, comment: "x", approvalDueDate: null, canEdit: false,
    });
    expect(plan.writes).toEqual([]);
    expect(planWasRefused(plan)).toBe(true);
  });

  it("the disabled reset-to-previous rule writes the three canvas rows", () => {
    const plan = planReturnToPreviousCluster({
      project: project(), state: seqEntry({ id: STATE_IDS.c4, name: "Cluster 4" }),
      tracking: tracking({ id: "t-4" }),
      previous: seqEntry({ id: STATE_IDS.c3, name: "Cluster 3" }),
      previousTracking: tracking({ id: "t-3" }),
      comment: "Back one", canEdit: true,
    });
    expect(plan.writes[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.requestCanceled);
    expect(plan.writes[1].data![TRACKING_COL.approvalClusterState]).toBe(ACS.inProgress);
    expect(plan.writes[2].data![NOTE_COL.name]).toBe("Project was reset to Cluster 3");
  });
});

/* ══════════════════════════════════════════════════════════ abandon / inactivate */

describe("UT-CHKLST abandon and inactivate", () => {
  const abandoned = state("Abandoned", STATE_IDS.abandoned, 90);
  const inactive = state("Inactive/ On-hold", STATE_IDS.inactive, 91);

  it("UT-CHKLST-037 confirming Abandon resets the canceled and rejected trackings", () => {
    const staging = stageTerminalToggle({
      kind: "abandon", project: project(), currentTracking: tracking(),
      abandonedState: abandoned, inactiveState: inactive,
    });
    expect(staging.approvalClusterState).toBe(ACS.abandoned);
    expect(staging.targetClusterStateId).toBe(STATE_IDS.abandoned);

    const trackings = [
      tracking({ id: "t-a", approvalClusterState: ACS.inProgress }),
      tracking({ id: "t-b", approvalClusterState: ACS.requestCanceled, clusterStateName: "Cluster 2" }),
      tracking({ id: "t-c", approvalClusterState: ACS.rejected, clusterStateName: "Cluster 3" }),
      tracking({ id: "t-d", approvalClusterState: ACS.completed }),
    ];
    const plan = planTerminalStateChange({
      project: project(), staging, trackings, canEdit: true,
    });
    // primary tracking, the project, then the two resets — the Completed row untouched.
    expect(plan.writes).toHaveLength(4);
    expect(plan.writes[0].id).toBe("t-a");
    expect(plan.writes[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.abandoned);
    expect(plan.writes[1].entitySet).toBe(ES.projects);
    expect(plan.writes.slice(2).map((w) => w.id)).toEqual(["t-b", "t-c"]);
    expect(plan.writes[2].data![TRACKING_COL.approvalClusterState]).toBe(ACS.notStarted);
  });

  it("UT-CHKLST-038 Activate from Abandoned restores In Progress at the tracking's cluster", () => {
    const staging = stageTerminalToggle({
      kind: "abandon",
      project: project({ clusterStateId: STATE_IDS.abandoned }),
      currentTracking: tracking({
        clusterStateId: STATE_IDS.c3, clusterStateName: "Cluster 3",
      }),
      abandonedState: abandoned, inactiveState: inactive,
    });
    expect(staging.approvalClusterState).toBe(ACS.inProgress);
    expect(staging.targetClusterStateId).toBe(STATE_IDS.c3);
    expect(staging.label).toBe("Activate");
    expect(staging.description)
      .toBe('Do you really want to change the project state to "active"');
  });

  it("Inactivate is the same shape against Inactive/ On-hold", () => {
    const staging = stageTerminalToggle({
      kind: "inactivate", project: project(), currentTracking: tracking(),
      abandonedState: abandoned, inactiveState: inactive,
    });
    expect(staging.approvalClusterState).toBe(ACS.inactive);
    expect(staging.label).toBe("Inactivate/ Place On-hold");
    expect(staging.description)
      .toBe('Do you really want to change Cluster State to "Inactive/ On-hold"?');
  });

  it("visibility needs a Completed previous cluster and not the other terminal state", () => {
    const args = {
      kind: "abandon" as const, project: project(),
      previous: seqEntry({ id: STATE_IDS.c2 }),
      previousTracking: tracking({ approvalClusterState: ACS.completed }),
      abandonedStateId: STATE_IDS.abandoned, inactiveStateId: STATE_IDS.inactive,
    };
    expect(terminalButtonVisible(args)).toBe(true);
    expect(terminalButtonVisible({
      ...args, previousTracking: tracking({ approvalClusterState: ACS.inProgress }),
    })).toBe(false);
    // No previous cluster at all → always visible.
    expect(terminalButtonVisible({ ...args, previous: null, previousTracking: null }))
      .toBe(true);
    // Abandon is hidden while the project is Inactive.
    expect(terminalButtonVisible({
      ...args, project: project({ clusterStateId: STATE_IDS.inactive }),
    })).toBe(false);
    // …but Activate (from Abandoned) stays visible.
    expect(terminalButtonVisible({
      ...args, project: project({ clusterStateId: STATE_IDS.abandoned }),
    })).toBe(true);
  });

  it("a terminal project disables the next-cluster button", () => {
    expect(projectIsTerminal(
      project({ clusterStateId: STATE_IDS.abandoned }),
      STATE_IDS.abandoned, STATE_IDS.inactive,
    )).toBe(true);
    expect(projectIsTerminal(project(), STATE_IDS.abandoned, STATE_IDS.inactive))
      .toBe(false);
    expect(projectIsTerminal(null, null, null)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════ the flows */

describe("UT-CHKLST the flows", () => {
  it("UT-CHKLST-030 the checklist approval payload is in the flow's positional order", () => {
    const args = checklistApprovalArgs({
      projectId: "p-1", checklistId: "cl-1",
      checkListDefaultApprovalId: "clda-1", currentProjectStateId: "ps-3",
    });
    expect(args.positional).toEqual(["p-1", "cl-1", "clda-1", "ps-3"]);
    expect(args.request.projectId).toBe("p-1");
    expect(args.request.checklistId).toBe("cl-1");
    // AMBIGUITY 5: the canvas's unused `locSelectedItemProjectState.Gate` binding is not
    // carried forward — what travels is the Check List Default Approval id.
    expect(args.request.approverIds).toEqual(["clda-1"]);
  });

  it("UT-CHKLST-032 the gate approval payload is in the flow's positional order", () => {
    const args = gateApprovalArgs({
      projectId: "p-1", stateId: "ps-3", stateTrackingId: "t-3", defaultApprovalId: "g-1",
    });
    expect(args.positional).toEqual(["p-1", "ps-3", "t-3", "g-1"]);
    expect(args.request.stateTrackingId).toBe("t-3");
    expect(args.request.targetClusterState).toBe("ps-3");
  });

  it("UT-CHKLST-031 the flow ids are written back only when a runid comes back", () => {
    expect(flowWriteBackPatch({ runid: "", approvalid: "x" }, "checklist")).toBeNull();
    expect(flowWriteBackPatch({ runid: null, approvalid: "x" }, "tracking")).toBeNull();
    expect(flowWriteBackPatch(null, "checklist")).toBeNull();
    expect(flowWriteBackPatch({ runid: "run-1", approvalid: "ap-1" }, "checklist"))
      .toEqual({
        [CHECKLIST_COL.flowRunId]: "run-1",
        [CHECKLIST_COL.flowApprovalId]: "ap-1",
      });
    // `Coalesce(approvalid, Blank())` — a missing approval id stores null.
    expect(flowWriteBackPatch({ runid: "run-1", approvalid: "" }, "tracking"))
      .toEqual({
        [TRACKING_COL.flowRunId]: "run-1",
        [TRACKING_COL.flowApprovalId]: null,
      });
  });

  it("UT-CHKLST-033 the gate cancel takes the tracking id alone", () => {
    // No 13-field JSON blob, and no AppId: no action in the flow ever referenced it.
    expect(gateCancelArgs("t-3")).toEqual({ stateTrackingId: "t-3" });
    expect(Object.keys(gateCancelArgs("t-3"))).toHaveLength(1);
  });

  it("UT-CHKLST-034 a checklist cancel that answers success:false is an error", () => {
    expect(checklistCancelSucceeded({ success: false })).toBe(false);
    expect(checklistCancelSucceeded({ ok: false })).toBe(false);
    expect(CHECKLIST_CANCEL_FAILED)
      .toBe("The approval could not be cancelled. Nothing was changed.");
    // Anything that is not an explicit failure counts as success: the mock answers
    // `{ok: true}` and a future contract might return neither field.
    expect(checklistCancelSucceeded({ success: true })).toBe(true);
    expect(checklistCancelSucceeded({ ok: true })).toBe(true);
    expect(checklistCancelSucceeded({})).toBe(true);
    expect(checklistCancelSucceeded(null)).toBe(true);
  });

  it("the gate cancel's local writes reopen the cluster and record a note", () => {
    const plan = planGateCancel({
      project: project(), tracking: tracking({ id: "t-3", flowRunId: "run-1" }),
      comment: "Wrong approver", canEdit: true,
    });
    expect(plan.writes[0].data![TRACKING_COL.approvalClusterState]).toBe(ACS.inProgress);
    expect(plan.writes[0].data![TRACKING_COL.flowRunId]).toBeNull();
    expect(plan.writes[1].entitySet).toBe(ES.projectStateTrackingNotes);
    expect(String(plan.writes[1].data![NOTE_COL.comment]))
      .toBe("Request canceled - Wrong approver");
  });

  it("rule 25 — the persona snapshot precedes the gate flow", () => {
    const snapshot = approvalPersonaSnapshot(gate());
    const personas = JSON.parse(
      String(snapshot[TRACKING_COL.lastTriggeredApprovalPersonas]),
    ) as Array<Record<string, string>>;
    expect(personas).toHaveLength(1);
    expect(personas[0].PortfolioManager).toBe("pm@vsb.energy");
    expect(snapshot[TRACKING_COL.lastTriggeredApprovalMode]).toBe(MODE.formalApproval);
    // A missing gate produces empty strings, not undefined, so the JSON stays valid.
    const none = approvalPersonaSnapshot(null);
    expect(String(none[TRACKING_COL.lastTriggeredApprovalPersonas]))
      .toContain('"PortfolioManager":""');
  });

  it("rule 24 — the persona tooltips are shaped per approval mode", () => {
    expect(parsePersonaList(JSON.stringify([{ PersonaRole: "a@x" }, { PersonaRole: "b@x" }])))
      .toEqual(["a@x", "b@x"]);
    // A malformed column must not take the panel down.
    expect(parsePersonaList("not json")).toEqual([]);
    expect(parsePersonaList(null)).toEqual([]);

    const formal = personaTooltip(gate({ approvalMode: MODE.formalApproval }));
    expect(formal.portfolioManager).toEqual(["pm@vsb.energy"]);
    expect(formal.contributors).toEqual(["c@vsb.energy"]);
    expect(formal.approvers).toEqual(["a@vsb.energy"]);
    expect(formal.notifications).toEqual(["n@vsb.energy"]);

    const local = personaTooltip(gate({ approvalMode: MODE.localApproval }));
    expect(local.portfolioManager).toEqual([]);
    expect(local.contributors).toEqual([]);
    expect(local.approvers).toEqual(["a@vsb.energy"]);

    const notify = personaTooltip(gate({ approvalMode: MODE.onlyNotifications }));
    expect(notify.approvers).toEqual([]);
    expect(notify.notifications).toEqual(["n@vsb.energy"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════ the history */

describe("UT-CHKLST the history", () => {
  it("UT-CHKLST-044 the history reads the right note table per panel kind", () => {
    const cluster = historyDescriptor(clusterPanel({ tracking: tracking({ id: "t-3" }) }));
    expect(cluster).toEqual({
      entitySet: ES.projectStateTrackingNotes,
      lookupColumn: NOTE_COL.trackingLookup,
      lookupValue: "t-3",
      orderBy: "createdon desc",
    });

    const checklist = historyDescriptor(checklistPanel({ row: row({ id: "cl-9" }) }));
    expect(checklist).toEqual({
      entitySet: ES_PROCESS.projectChecklistTrackingNotes,
      lookupColumn: NOTE_COL.checklistLookup,
      lookupValue: "cl-9",
      orderBy: "createdon desc",
    });

    // A cluster with no tracking row yet has no history to read.
    expect(historyDescriptor(clusterPanel({ tracking: null }))).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════ the page lock */

describe("UT-CHKLST the page lock", () => {
  it("UT-CHKLST-039 start cluster 0 requires the Project Start Date", () => {
    const p = project({
      startCluster: 0,
      milestones: { ...project().milestones, projectStartDate: null },
    });
    expect(isPageLocked(p)).toBe(true);
    expect(missingStartClusterMilestones(p)).toEqual(["Project Start Date"]);
    expect(pageLock(p).map((e) => e.reason)).toEqual(["Milestones"]);
    expect(PAGE_LOCK_TITLE).toContain("This page is locked");
  });

  it("UT-CHKLST-040 start cluster 6 checks FID, Construction and COD", () => {
    const p = project({
      startCluster: 6,
      milestones: { ...project().milestones, cod: null },
    });
    expect(isPageLocked(p)).toBe(true);
    expect(missingStartClusterMilestones(p)).toEqual(["Operations start date (COD)"]);
    const allThree = project({
      startCluster: 6,
      milestones: {
        ...project().milestones, fid: null, construction: null, cod: null,
      },
    });
    expect(missingStartClusterMilestones(allThree)).toEqual([
      "Final Investment Decision", "5-Construction", "Operations start date (COD)",
    ]);
  });

  it("each start cluster tests its own milestone", () => {
    const blank = {
      projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null,
      applicationSubmitted: null, legallyBindingPermits: null, fid: null,
      construction: null, cod: null,
    };
    const expected = [
      ["Project Start Date"],
      ["1-Feasibility studies"],
      ["2-Project development started"],
      ["3-Application submitted"],
      ["4-Legally binding permits"],
      ["Final Investment Decision", "5-Construction"],
      ["Final Investment Decision", "5-Construction", "Operations start date (COD)"],
    ];
    for (let n = 0; n <= 6; n++) {
      expect(missingStartClusterMilestones(
        project({ startCluster: n, milestones: blank }),
      )).toEqual(expected[n]);
    }
  });

  it("UT-CHKLST-041 the lock also fires on capacity, yield and the Project ID", () => {
    expect(pageLock(project({ projectNumber: null })).map((e) => e.reason))
      .toEqual(["General"]);
    expect(pageLock(project({ totalCapacity: 0 })).map((e) => e.reason))
      .toEqual(["Generator"]);
    expect(pageLock(project({ netYieldP50: null })).map((e) => e.reason))
      .toEqual(["Production"]);
    expect(pageLock(project())).toEqual([]);
    expect(isPageLocked(null)).toBe(true);
  });

  it("AMBIGUITY 2 — this lock deliberately has NO Draft clause", () => {
    // Planning, Grid Operator and Team all add `Or(IsBlank(clusterState), = "Draft")`.
    // This screen must not: it is the screen that moves a project OUT of Draft.
    expect(isPageLocked(project({ clusterStateName: "Draft" }))).toBe(false);
    expect(isPageLocked(project({ clusterStateName: null }))).toBe(false);
    // …and the bullet list is built from the same condition, so it cannot disagree.
    expect(pageLock(project({ clusterStateName: "Draft" }))).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════ mapping */

describe("UT-CHKLST mapping and labels", () => {
  it("the project maps its start cluster, milestones and lock inputs", () => {
    // `ProjectRow` types `vsb_technology` as a string; it is a picklist and arrives as a
    // number, which is why the mapper reads it through the index signature.
    const mapped = toChecklistProject(projectRow({
      vsb_projectid: "p-9", vsb_name: "Windpark Süd", vsb_internalprojectid: "DE-4001",
      vsb_technology: CHOICE_PROCESS.technology.wind, vsb_totalcapacity: 30,
      vsb_plantwtgcapacity: null, vsb_plantwtgcost: null,
      vsb_projectstartdate: "2026-02-01", vsb_netyieldp50: 60000,
      vsb_finalinvestmentdecision: "2028-01-01", vsb_startcluster: 3,
      vsb_construction: "2028-06-01", vsb_operationsstartdatecod: "2029-01-01",
      _vsb_country_value: "c-de", _vsb_clusterstate_value: "ps-3",
      "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue": "Cluster 3",
      _owningbusinessunit_value: "bu-de", statecode: 0,
      modifiedon: "2026-01-01T00:00:00Z",
    }));
    expect(mapped!.startCluster).toBe(3);
    expect(mapped!.technology).toBe(CHOICE_PROCESS.technology.wind);
    expect(startClusterNo(mapped)).toBe(3);
    expect(mapped!.milestones.fid).toBe("2028-01-01");
    expect(mapped!.clusterStateName).toBe("Cluster 3");
    expect(toChecklistProject(undefined)).toBeNull();
  });

  it("the tracking row prefers the formatted cluster name over the row name", () => {
    const mapped = toTrackingRow({
      vsb_projectstatetrackingid: "t-9",
      vsb_name: "row name",
      _vsb_clusterstate_value: STATE_IDS.c3,
      "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue": "Cluster 3",
      vsb_approvalclusterstate: ACS.inProgress,
      vsb_flowrunid: "",
    });
    expect(mapped.clusterStateName).toBe("Cluster 3");
    // An empty string is blank in Power Fx, so it maps to null — which is what
    // `hasRealGateProgress` and `showRequestApproval` both test with `IsBlank`.
    expect(mapped.flowRunId).toBeNull();
  });

  it("the checklist row is projected to the gallery's flat shape", () => {
    const mapped = toChecklistRow({
      vsb_projectchecklistid: "cl-9",
      vsb_name: "Grid connection agreed",
      _vsb_clusterstate_value: STATE_IDS.c3,
      vsb_gaterelevance: true,
      vsb_holdingtaskdescription: "Signed contract",
      vsb_iscompletiondate: true,
      vsb_completiondate: "2027-05-01",
      vsb_taskstate: TASK.inProgress,
      vsb_approvalcheckliststate: ACS.notStarted,
      vsb_comments: "waiting on the DSO",
      vsb_order: 4,
      vsb_projectdefaultchecklist: "tpl-9",
    });
    expect(mapped).toEqual({
      id: "cl-9", title: "Grid connection agreed", clusterStateId: STATE_IDS.c3,
      gateRelevance: true, holdingDescription: "Signed contract", isCompletionDate: true,
      completionDate: "2027-05-01", taskState: TASK.inProgress,
      approvalChecklistState: ACS.notStarted, note: "waiting on the DSO", sort: 4,
      projectDefaultChecklistId: "tpl-9", flowRunId: null, flowApprovalId: null,
    });
  });

  it("the state labels cover every option-set value", () => {
    expect(approvalStateLabel(ACS.notStarted)).toBe("Not Started");
    expect(approvalStateLabel(ACS.requestCanceled)).toBe("Request canceled");
    expect(approvalStateLabel(ACS.inactive)).toBe("Inactive/ On-hold");
    expect(approvalStateLabel(ACS.canceling)).toBe("Canceling");
    expect(approvalStateLabel(null)).toBe("Not Started");
    expect(taskStateLabel(TASK.completed)).toBe("Completed");
    expect(taskStateLabel(null)).toBe("Not started");
    // Task State has a GAP: In Progress is 952850002, not 952850001.
    expect(TASK.inProgress).toBe(952850002);
  });

  it("trackingFor resolves a cluster's row and returns null when there is none", () => {
    const rows = [tracking({ id: "t-3", clusterStateId: STATE_IDS.c3 })];
    expect(trackingFor(rows, STATE_IDS.c3)?.id).toBe("t-3");
    expect(trackingFor(rows, STATE_IDS.c4)).toBeNull();
    expect(trackingFor(rows, null)).toBeNull();
  });
});

/* ═══════════════════════════════════════════ GUIDE q18–q20 — Cluster Check List ════ */

describe("GUIDE q18/q19 — the checklist table", () => {
  it("UT-CHKLST-045 titles the table '{cluster} Checklist', title-cased", () => {
    expect(checklistTableTitle("Draft")).toBe("Draft Checklist");
    expect(checklistTableTitle("Cluster 3")).toBe("Cluster 3 Checklist");
    expect(checklistTableTitle(null)).toBe("Cluster Checklist");
  });

  it("UT-CHKLST-046 renders Gate Relevance as literal Yes / No", () => {
    expect(gateRelevanceLabel(true)).toBe("Yes");
    expect(gateRelevanceLabel(false)).toBe("No");
  });

  it("UT-CHKLST-047 the stepper's three visual buckets follow the approval label", () => {
    expect(stepVisualStatus("Completed")).toBe("completed");
    expect(stepVisualStatus("In Progress")).toBe("inProgress");
    expect(stepVisualStatus("Not Started")).toBe("notStarted");
    // Every other approval state (Rejected, Abandoned, …) is visually "not started".
    expect(stepVisualStatus("Rejected")).toBe("notStarted");
  });

  it("UT-CHKLST-048 the envelope connector lights only once the earlier node is complete", () => {
    expect(stepConnectorLit("completed")).toBe(true);
    expect(stepConnectorLit("inProgress")).toBe(false);
    expect(stepConnectorLit("notStarted")).toBe(false);
  });
});

describe("GUIDE q20 — the Cluster Movement history dialog", () => {
  it("UT-CHKLST-049 titles the dialog 'Cluster Movement to {next}', matching the button", () => {
    const next: SequenceEntry = {
      id: "s-3", name: "Cluster 3", clusterNo: 3, rowNumber: 3,
      clusterDescription: null, hasGate: true, gateId: "g-3",
    };
    expect(clusterMovementTitle(next)).toBe("Cluster Movement to Cluster 3");
    expect(clusterMovementTitle(null)).toBe("Cluster Movement to next cluster");
  });

  it("UT-CHKLST-050 'View {next} Request History' resolves to the history action", () => {
    expect(nextClusterActionKind({ tracking: tracking({ approvalClusterState: ACS.completed }) }))
      .toBe("history");
    expect(nextClusterActionKind({
      tracking: tracking({ approvalClusterState: ACS.inProgress, flowRunId: "run-1" }),
    })).toBe("history");
    expect(nextClusterActionKind({ tracking: null })).toBe("transition");
    expect(nextClusterActionKind({
      tracking: tracking({ approvalClusterState: ACS.notStarted }),
    })).toBe("transition");
  });

  it("UT-CHKLST-051 nextClusterCaption still reads 'View … Request History' for that kind", () => {
    const state: SequenceEntry = {
      id: "s-2", name: "Cluster 2", clusterNo: 2, rowNumber: 2,
      clusterDescription: null, hasGate: true, gateId: "g-2",
    };
    const next: SequenceEntry = {
      id: "s-3", name: "Cluster 3", clusterNo: 3, rowNumber: 3,
      clusterDescription: null, hasGate: true, gateId: "g-3",
    };
    const caption = nextClusterCaption({
      tracking: tracking({ approvalClusterState: ACS.completed }),
      state, next, gate: null,
    });
    expect(caption).toBe("View Cluster 3 Request History");
  });

  it("UT-CHKLST-052 Cluster Step State labels default to 'None'", () => {
    expect(clusterStepStateLabel(CHOICE_PROCESS.clusterStepState.none)).toBe("None");
    expect(clusterStepStateLabel(CHOICE_PROCESS.clusterStepState.approvals)).toBe("Approvals");
    expect(clusterStepStateLabel(null)).toBe("None");
    expect(clusterStepStateLabel(undefined)).toBe("None");
  });
});
