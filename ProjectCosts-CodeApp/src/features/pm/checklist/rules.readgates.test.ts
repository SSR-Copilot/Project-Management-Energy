/**
 * PM Checklist, 17 Nov 2026 fixes (C1-C10): the pure rules behind the read gates, the stale-state refusals, the app-id check, the
 * concurrent template copy, the guarded updates, the note limits and the localised dates. `rules.test.ts` is untouched except for
 * the `guarded` flag one existing expectation gained and the ten ids it had lacked.
 */
import { describe, expect, it } from "vitest";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import {
  APP_ID_MSG, CHECKLIST_NOTE_NAME_MAX, CHECKLIST_COL, LOOKUP, MSG, NOTE_COL, NOTE_COMMENT_MAX, READ_GATE_MSG, STALE_MSG,
  STATE_NOTE_NAME_MAX, appIdRefusal, approvalSettingsHint, approvalSettingsNeeded, approvalSettingsState,
  checklistIsLoading, checklistLoadErrorMode, fmtCanvasDate, planChecklistApprovalRequestFollowUp,
  planChecklistApprovalRequestPatch, planChecklistMaterialisation, planChecklistRowPatch, planClusterTransition,
  planGateApprovalRequestNote, planGateApprovalRequestPatch, planGateCancelNote, planGateCancelPatch, planPrepareCluster,
  planReturnToPreviousCluster, planTerminalStateChange, staleClusterRequestRefusal, staleReturnRefusal, staleSaveRefusal,
  staleTaskRequestRefusal, completeTaskPatch, stepCardDescription,
  type ChecklistProject, type ChecklistRow, type DefaultChecklistTemplate, type SequenceEntry, type TrackingRow,
} from "./rules";
import type { WritePlan } from "@/data/writePlan";

const A = CHOICE_PROCESS.approvalClusterState;

const project = (o: Partial<ChecklistProject> = {}): ChecklistProject => ({
  id: "p-1", projectName: "Windpark Nord", projectNumber: "DE-1021", startCluster: 0, clusterStateId: "ps-0",
  clusterStateName: "Draft", approvalState: null, countryId: "c-de", technology: CHOICE_PROCESS.technology.wind,
  owningBusinessUnitId: "bu-de", totalCapacity: 1, netYieldP50: 1,
  milestones: {
    projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
  ...o,
});
const tracking = (o: Partial<TrackingRow> = {}): TrackingRow => ({
  id: "t-1", name: "Cluster 1", clusterStateId: "ps-1", clusterStateName: "Cluster 1", approvalClusterState: A.inProgress,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null, ...o,
});
const entry = (o: Partial<SequenceEntry> = {}): SequenceEntry => ({
  id: "ps-1", name: "Cluster 1", clusterNo: 1, rowNumber: 1, clusterDescription: null, hasGate: false, gateId: null, ...o,
});
const row = (o: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: "cl-1", title: "Land secured", clusterStateId: "ps-1", gateRelevance: true, holdingDescription: null,
  isCompletionDate: false, completionDate: null, taskState: null, approvalChecklistState: A.notStarted, note: null, sort: 1,
  projectDefaultChecklistId: "tpl-1", flowRunId: null, flowApprovalId: null, ...o,
});
const template = (n: number): DefaultChecklistTemplate => ({
  id: `tpl-${n}`, name: `Task ${n}`, clusterStateId: "ps-1", gateRelevance: false, holdingTaskDescription: null,
  isCompletionDate: false, order: n,
});
const guardedOf = (plan: WritePlan) => plan.writes.filter((w) => w.op === "update").map((w) => w.guarded === true);

describe("C1 / C2 / C3 / C4 — reads the screen waits for", () => {
  it("UT-CHKLST-093 the approval settings are ready when nothing is to be read or the answer is known; a failure beats 'still checking'", () => {
    expect(approvalSettingsState({ needed: false, known: false, failed: false })).toBe("ready");
    expect(approvalSettingsState({ needed: false, known: false, failed: true })).toBe("ready");
    expect(approvalSettingsState({ needed: true, known: true, failed: false })).toBe("ready");
    // A failed refresh that still has the earlier answer keeps the screen usable.
    expect(approvalSettingsState({ needed: true, known: true, failed: true })).toBe("ready");
    expect(approvalSettingsState({ needed: true, known: false, failed: false })).toBe("checking");
    expect(approvalSettingsState({ needed: true, known: false, failed: true })).toBe("failed");
  });

  it("UT-CHKLST-094 the hint explains a held-back action and is null once the settings are ready", () => {
    expect(approvalSettingsHint("ready")).toBeNull();
    expect(approvalSettingsHint("checking")).toBe(READ_GATE_MSG.approvalsChecking);
    expect(approvalSettingsHint("failed")).toBe(READ_GATE_MSG.approvalsFailed);
    expect(READ_GATE_MSG.approvalsFailed).toContain("Complete and Approval are unavailable");
  });

  it("UT-CHKLST-095 the settings are needed only for tasks that name a template", () => {
    expect(approvalSettingsNeeded([])).toBe(false);
    expect(approvalSettingsNeeded([{ projectDefaultChecklistId: null }, { projectDefaultChecklistId: "" }])).toBe(false);
    expect(approvalSettingsNeeded([{ projectDefaultChecklistId: null }, { projectDefaultChecklistId: "tpl-1" }])).toBe(true);
  });

  it("UT-CHKLST-096 the first load: only a project id makes the screen wait, and either read still running is enough", () => {
    expect(checklistIsLoading({ hasProjectId: false, projectLoading: true, sequenceLoading: true })).toBe(false);
    expect(checklistIsLoading({ hasProjectId: true, projectLoading: true, sequenceLoading: false })).toBe(true);
    expect(checklistIsLoading({ hasProjectId: true, projectLoading: false, sequenceLoading: true })).toBe(true);
    expect(checklistIsLoading({ hasProjectId: true, projectLoading: false, sequenceLoading: false })).toBe(false);
  });

  it("UT-CHKLST-097 a failed read blanks the screen only when it has no data; a failed refresh with data is a banner", () => {
    expect(checklistLoadErrorMode([{ error: undefined }, { error: null, hasData: true }])).toBe("none");
    expect(checklistLoadErrorMode([{ error: new Error("x"), hasData: false }])).toBe("blocking");
    // A double without `hasData` counts as "no data".
    expect(checklistLoadErrorMode([{ error: new Error("x") }])).toBe("blocking");
    expect(checklistLoadErrorMode([{ error: new Error("x"), hasData: true }, { error: undefined }])).toBe("banner");
    expect(checklistLoadErrorMode([{ error: new Error("x"), hasData: true }, { error: new Error("y"), hasData: false }])).toBe("blocking");
  });
});

describe("C6 — a job whose fresh read no longer matches the button that started it is refused", () => {
  it("UT-CHKLST-098 Save needs the cluster still In Progress; Reset needs In Progress, Rejected or Request canceled", () => {
    const state = entry();
    expect(staleSaveRefusal(state, tracking({ approvalClusterState: A.inProgress }))).toBeNull();
    for (const s of [A.notStarted, A.completed, A.rejected, A.requestCanceled]) {
      expect(staleSaveRefusal(state, tracking({ approvalClusterState: s }))).toBe(STALE_MSG.saveNotInProgress("Cluster 1"));
    }
    expect(staleSaveRefusal(state, null)).toBe(STALE_MSG.saveNotInProgress("Cluster 1"));
    for (const s of [A.inProgress, A.rejected, A.requestCanceled]) {
      expect(staleReturnRefusal(state, tracking({ approvalClusterState: s }))).toBeNull();
    }
    for (const s of [A.notStarted, A.completed]) {
      expect(staleReturnRefusal(state, tracking({ approvalClusterState: s }))).toBe(STALE_MSG.returnNotResettable("Cluster 1"));
    }
    expect(staleReturnRefusal(state, null)).toBe(STALE_MSG.returnNotResettable("Cluster 1"));
  });

  it("UT-CHKLST-099 Request Approval is refused for a completed cluster or a live run, and for a task already requested or completed", () => {
    const state = entry();
    expect(staleClusterRequestRefusal(state, null)).toBeNull();
    expect(staleClusterRequestRefusal(state, tracking({ approvalClusterState: A.notStarted }))).toBeNull();
    // The stalled-recovery path stays open: In Progress with no flow run id.
    expect(staleClusterRequestRefusal(state, tracking({ approvalClusterState: A.inProgress, flowRunId: null }))).toBeNull();
    expect(staleClusterRequestRefusal(state, tracking({ approvalClusterState: A.inProgress, flowRunId: "run-1" })))
      .toBe(STALE_MSG.clusterRequestStale("Cluster 1"));
    expect(staleClusterRequestRefusal(state, tracking({ approvalClusterState: A.completed })))
      .toBe(STALE_MSG.clusterRequestStale("Cluster 1"));
    expect(staleTaskRequestRefusal(row({ approvalChecklistState: A.notStarted }))).toBeNull();
    expect(staleTaskRequestRefusal(row({ approvalChecklistState: null }))).toBeNull();
    expect(staleTaskRequestRefusal(row({ approvalChecklistState: A.inProgress }))).toBe(STALE_MSG.taskRequestStale("Land secured"));
    expect(staleTaskRequestRefusal(row({ approvalChecklistState: A.completed }))).toBe(STALE_MSG.taskRequestStale("Land secured"));
  });

  it("UT-CHKLST-100 every update the plans send to a tracking or a checklist row is guarded; creates and the project patch are not", () => {
    const ctx = { project: project(), canEdit: true };
    const s1 = entry();
    const s2 = entry({ id: "ps-2", name: "Cluster 2", clusterNo: 2 });
    expect(guardedOf(planChecklistRowPatch("cl-1", completeTaskPatch(), "Land"))).toEqual([true]);
    const move = planClusterTransition({
      ...ctx, state: s1, tracking: tracking(), next: s2, nextTracking: tracking({ id: "t-2", clusterStateId: "ps-2" }),
      comment: "go", approvalDueDate: null,
    });
    // current tracking, next tracking and the project: only the two trackings are guarded.
    expect(move.writes.filter((w) => w.op === "update").map((w) => [w.entitySet, w.guarded === true])).toEqual([
      [ES.projectStateTrackings, true], [ES.projectStateTrackings, true], [ES.projects, false],
    ]);
    expect(move.writes.filter((w) => w.op === "create").every((w) => w.guarded === undefined)).toBe(true);
    const back = planReturnToPreviousCluster({
      ...ctx, state: s2, tracking: tracking({ id: "t-2" }), previous: s1, previousTracking: tracking(), comment: "",
    });
    expect(guardedOf(back)).toEqual([true, true]);
    const terminal = planTerminalStateChange({
      project: project(), canEdit: true,
      staging: {
        approvalClusterState: A.abandoned, targetClusterStateId: "ps-ab", targetClusterStateName: "Abandoned",
        label: "Abandon", description: "",
      },
      trackings: [tracking(), tracking({ id: "t-9", approvalClusterState: A.rejected })],
    });
    expect(terminal.writes.filter((w) => w.entitySet === ES.projectStateTrackings).every((w) => w.guarded === true)).toBe(true);
    expect(terminal.writes.find((w) => w.entitySet === ES.projects)?.guarded).toBeUndefined();
    expect(guardedOf(planGateCancelPatch({ ...ctx, tracking: tracking() }))).toEqual([true]);
    expect(guardedOf(planGateApprovalRequestPatch({
      ...ctx, state: s1, tracking: tracking(), gate: null, comment: "x", approvalDueDate: null,
    }))).toEqual([true]);
    expect(guardedOf(planChecklistApprovalRequestPatch({ row: row(), comment: "x", approvalDueDate: null, canEdit: true }))).toEqual([true]);
    const followUp = planChecklistApprovalRequestFollowUp({
      project: project(), row: row(), result: { runid: "r", approvalid: "a" }, approvalRequested: true,
    });
    expect(followUp.writes.map((w) => [w.op, w.guarded === true])).toEqual([["update", true], ["create", false]]);
  });
});

describe("C7 — the cancellation flow needs the app id", () => {
  it("UT-CHKLST-101 a blank, missing or whitespace app id is refused with the NEW TEXT; a real one passes", () => {
    for (const blank of ["", "   ", null, undefined]) expect(appIdRefusal(blank)).toBe(APP_ID_MSG);
    expect(appIdRefusal("807a2fba-665c-40f3-b158-ffe822aa7da4")).toBeNull();
    expect(APP_ID_MSG).toContain("vsb_ProjectManagementAppID");
  });
});

describe("C5 — the template copy", () => {
  const ctx = { projectId: "p-1", clusterStateId: "ps-1", owningBusinessUnitId: "bu-de" };

  it("UT-CHKLST-102 the N creates are ONE concurrent group that stops on a failure, in template order", () => {
    const plan = planChecklistMaterialisation([template(1), template(2), template(3), template(4)], ctx);
    expect(plan.writes).toHaveLength(4);
    expect(plan.writes.every((w) => w.concurrent === true && w.stopOnFailure === true)).toBe(true);
    expect(new Set(plan.writes.map((w) => w.concurrencyGroup)).size).toBe(1);
    expect(plan.writes.map((w) => w.data![CHECKLIST_COL.order])).toEqual([1, 2, 3, 4]);
    expect(plan.writes.map((w) => w.data![CHECKLIST_COL.name])).toEqual(["Task 1", "Task 2", "Task 3", "Task 4"]);
    // Two plans are two groups, so two visits never share a run.
    const other = planChecklistMaterialisation([template(1)], ctx);
    expect(other.writes[0]!.concurrencyGroup).not.toBe(plan.writes[0]!.concurrencyGroup);
  });

  it("UT-CHKLST-103 no templates is an empty plan; the tracking create stays first and single, the task creates follow as the group", () => {
    expect(planChecklistMaterialisation([], ctx).writes).toEqual([]);
    const plan = planPrepareCluster({
      selected: entry(), tracking: null, existingRowCount: 0, templates: [template(1), template(2)],
      ctx: { projectId: "p-1", owningBusinessUnitId: "bu-de" },
    });
    expect(plan.writes.map((w) => w.entitySet)).toEqual([ES.projectStateTrackings, ES.projectChecklists, ES.projectChecklists]);
    expect(plan.writes[0]!.concurrent).toBeUndefined();
    expect(plan.writes.slice(1).every((w) => w.concurrent === true)).toBe(true);
    // The usual visit: the tracking and the rows exist, so nothing is written (the hook then skips the job).
    expect(planPrepareCluster({
      selected: entry(), tracking: tracking(), existingRowCount: 3, templates: [],
      ctx: { projectId: "p-1", owningBusinessUnitId: "bu-de" },
    }).writes).toEqual([]);
  });
});

describe("C10 — note limits and dates", () => {
  it("UT-CHKLST-104 the notes are cut at their real column lengths, not at the 300 of the comment box", () => {
    expect([STATE_NOTE_NAME_MAX, CHECKLIST_NOTE_NAME_MAX, NOTE_COMMENT_MAX]).toEqual([256, 850, 4000]);
    const longName = "N".repeat(900);
    const longComment = "c".repeat(5000);
    const tracked = planGateApprovalRequestNote({
      project: project({ projectName: longName }), state: entry(), trackingId: "t-1", comment: longComment, noteHtml: null,
    });
    expect(String(tracked.writes[0]!.data![NOTE_COL.name])).toHaveLength(256);
    expect(String(tracked.writes[0]!.data![NOTE_COL.comment])).toHaveLength(4000);
    // 300 characters of user text plus the 20-character prefix used to lose its last 20.
    const typed = "x".repeat(300);
    const kept = planGateCancelNote({ project: project(), tracking: tracking(), comment: typed, userDisplayName: "Ada" });
    expect(String(kept.writes[0]!.data![NOTE_COL.comment])).toBe(`Request canceled - ${typed}`);
    const task = planChecklistApprovalRequestFollowUp({
      project: project({ projectName: longName }), row: row(), result: null, approvalRequested: true,
    });
    expect(String(task.writes[0]!.data![NOTE_COL.name])).toHaveLength(850);
    // The comment column holds 4000, so the 900-character project name is kept whole in it.
    expect(String(task.writes[0]!.data![NOTE_COL.comment])).toBe(`Approval requested Land secured for Project ${longName}`);
    expect(task.writes[0]!.data).toHaveProperty(`${LOOKUP.projectChecklist}@odata.bind`);
  });

  it("UT-CHKLST-105 the canvas date keeps its field order and punctuation, with the user's weekday and month names", () => {
    const d = "2026-11-02T10:05:00"; // a Monday, local time
    expect(fmtCanvasDate(d)).toBe("Mon, Nov. 02, 2026");
    expect(fmtCanvasDate(d, true)).toBe("Mon, Nov. 02, 2026 10:05");
    // Every en locale prints what it printed before.
    expect(fmtCanvasDate(d, false, "en-US")).toBe("Mon, Nov. 02, 2026");
    expect(fmtCanvasDate(d, false, "en-GB")).toBe("Mon, Nov. 02, 2026");
    expect(fmtCanvasDate(d, false, "de-DE")).toBe("Mo, Nov. 02, 2026");
    expect(fmtCanvasDate(d, true, "nl-NL")).toBe("ma, nov. 02, 2026 10:05");
    expect(fmtCanvasDate(d, false, "fr-FR")).toBe("lun, nov. 02, 2026");
    // Blank and unparseable stay blank; an invalid language tag does not throw.
    expect(fmtCanvasDate(null, false, "de-DE")).toBe("");
    expect(fmtCanvasDate("not a date", false, "de-DE")).toBe("");
    expect(fmtCanvasDate(d, false, "not a locale!!")).toBe("Mon, Nov. 02, 2026");
  });

  it("UT-CHKLST-107 a stepper card's description is its state, then its gate lines joined with commas; no state reads 'Not started'", () => {
    expect(stepCardDescription("In Progress", null)).toBe("In Progress");
    expect(stepCardDescription("", null)).toBe("Not started");
    expect(stepCardDescription("Completed", "Portfolio Manager: pm@x\rApprovers: a@x\r\r")).toBe("Completed. Portfolio Manager: pm@x, Approvers: a@x");
    expect(stepCardDescription("", "Notifications: n@x\n")).toBe("Not started. Notifications: n@x");
  });

  it("UT-CHKLST-106 MSG.taskChanging names the task, and is not the success text (C8)", () => {
    expect(MSG.taskChanging("Land secured")).toBe("The state of task 'Land secured' will be changed, please wait...");
    expect(MSG.taskChanging("Land secured")).not.toBe(MSG.taskChanged);
  });
});
