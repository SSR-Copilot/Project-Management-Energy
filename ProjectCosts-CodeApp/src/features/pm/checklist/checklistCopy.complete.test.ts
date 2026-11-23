/**
 * UT-CHKCOPY-001.. — D158 (`completeCopy`): finishing a template copy that stopped part-way. The pure rules and the plan builder; the
 * hook that reads and sends is `hooks.completeCopy.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import {
  copyProbeRowTouched, planPrepareCluster, templatesMissingFromCluster,
  type CopyProbeRow, type DefaultChecklistTemplate, type SequenceEntry, type TrackingRow,
} from "./rules";

const TASK = CHOICE_PROCESS.taskState;
const A = CHOICE_PROCESS.approvalClusterState;
const PROJECT = "11111111-1111-1111-1111-111111111111";
const BU = "22222222-2222-2222-2222-222222222222";

const tpl = (n: number): DefaultChecklistTemplate => ({
  id: `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`, name: `Task ${n}`, clusterStateId: "ps-2",
  gateRelevance: n % 2 === 0, holdingTaskDescription: null, isCompletionDate: false, order: n,
});
const row = (n: number | null, over: Partial<CopyProbeRow> = {}): CopyProbeRow => ({
  templateId: n === null ? null : tpl(n).id, taskState: TASK.none, comment: null, approvalChecklistState: null, ...over,
});
const ten = Array.from({ length: 10 }, (_, i) => tpl(i + 1));
const selected: SequenceEntry = { id: "ps-2", name: "Cluster 2", clusterNo: 2, rowNumber: 2, clusterDescription: null, hasGate: false, gateId: null };
const tracking = (state: number): TrackingRow => ({
  id: "t-2", name: "Cluster 2", clusterStateId: "ps-2", clusterStateName: "Cluster 2", approvalClusterState: state,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
});

describe("copyProbeRowTouched", () => {
  it("UT-CHKCOPY-001 a freshly copied row is untouched; a task state, a comment or an approval state makes it touched", () => {
    expect(copyProbeRowTouched(row(1))).toBe(false);
    expect(copyProbeRowTouched(row(1, { taskState: null }))).toBe(false);
    expect(copyProbeRowTouched(row(1, { taskState: TASK.inProgress }))).toBe(true);
    expect(copyProbeRowTouched(row(1, { taskState: TASK.completed }))).toBe(true);
    expect(copyProbeRowTouched(row(1, { comment: "called the owner" }))).toBe(true);
    expect(copyProbeRowTouched(row(1, { comment: "   " }))).toBe(false);
    expect(copyProbeRowTouched(row(1, { approvalChecklistState: A.inProgress }))).toBe(true);
    expect(copyProbeRowTouched(row(1, { approvalChecklistState: A.notStarted }))).toBe(false);
  });
});

describe("templatesMissingFromCluster", () => {
  it("UT-CHKCOPY-002 an interrupted copy (7 of 10 rows, none worked on) is completed with exactly the 3 missing templates", () => {
    const got = templatesMissingFromCluster(ten, [1, 2, 3, 5, 6, 8, 9].map((n) => row(n)));
    expect(got.map((t) => t.name)).toEqual(["Task 4", "Task 7", "Task 10"]);
  });

  it("UT-CHKCOPY-003 nothing is copied into a cluster with no row (that is the normal first copy, decided by the count)", () => {
    expect(templatesMissingFromCluster(ten, [])).toEqual([]);
  });

  it("UT-CHKCOPY-004 a cluster where ANY row was worked on is never topped up: a template an admin adds later does not reach work in progress", () => {
    const existing = [row(1), row(2, { taskState: TASK.inProgress }), row(3)];
    expect(templatesMissingFromCluster(ten, existing)).toEqual([]);
  });

  it("UT-CHKCOPY-005 a complete cluster has nothing missing, and an inactive row still counts as having its template (the canvas count is of any status)", () => {
    expect(templatesMissingFromCluster(ten, ten.map((t) => ({ ...row(null), templateId: t.id })))).toEqual([]);
  });

  it("UT-CHKCOPY-006 rows are matched to templates by id in any letter case; a row without a template key matches none", () => {
    const upper = [{ ...row(null), templateId: tpl(1).id.toUpperCase() }];
    expect(templatesMissingFromCluster([tpl(1), tpl(2)], upper).map((t) => t.name)).toEqual(["Task 2"]);
    expect(templatesMissingFromCluster([tpl(1)], [row(null)]).map((t) => t.name)).toEqual(["Task 1"]);
  });
});

describe("planPrepareCluster with completeWith", () => {
  const ctx = { projectId: PROJECT, owningBusinessUnitId: BU };
  const creates = (plan: { writes: { op: string; entitySet: string; data?: Record<string, unknown>; concurrent?: boolean }[] }) =>
    plan.writes.filter((w) => w.op === "create" && w.entitySet === ES.projectChecklists);

  it("UT-CHKCOPY-007 a cluster with rows and a completeWith list creates only those tasks, carrying the template, the cluster, the project and the owner", () => {
    const missing = [tpl(4), tpl(7)];
    const plan = planPrepareCluster({ selected, tracking: tracking(A.inProgress), existingRowCount: 7, templates: [], ctx, completeWith: missing });
    const made = creates(plan);
    expect(made).toHaveLength(2);
    expect(made.map((w) => w.data!["vsb_projectdefaultchecklist"])).toEqual([tpl(4).id, tpl(7).id]);
    for (const w of made) {
      expect(w.data!["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BU})`);
      expect(w.data!["vsb_taskstate"]).toBe(TASK.none);
    }
  });

  it("UT-CHKCOPY-008 without completeWith a cluster with rows is untouched (the canvas rule), and an empty cluster still gets every template", () => {
    expect(creates(planPrepareCluster({ selected, tracking: tracking(A.inProgress), existingRowCount: 7, templates: ten, ctx }))).toHaveLength(0);
    expect(creates(planPrepareCluster({ selected, tracking: tracking(A.notStarted), existingRowCount: 0, templates: ten, ctx }))).toHaveLength(10);
  });

  it("UT-CHKCOPY-009 for an empty cluster completeWith is ignored: the full copy is not doubled", () => {
    const plan = planPrepareCluster({ selected, tracking: tracking(A.notStarted), existingRowCount: 0, templates: ten, ctx, completeWith: [tpl(1)] });
    expect(creates(plan)).toHaveLength(10);
  });
});
