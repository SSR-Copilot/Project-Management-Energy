/**
 * UT-CHKPERF-001.. — the Cluster Check List's request counts, measured on the REAL plan builders (`rules.ts`) and the REAL
 * plan engine (`executePlan`) against a counting SDK stub (D138). They pin BEHAVIOUR (what is sent, in which order,
 * how many at once) so every optimisation can be compared with the unchanged code: the numbers below were taken on `dbc412d`
 * BEFORE any change. Nothing here touches Dataverse.
 */
import { describe, expect, it, vi } from "vitest";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";
import { executePlan, type PlanClient } from "@/data/executePlan";
import { ES } from "@/data/dataverseNames";
import {
  planChecklistRowPatch, planClusterTransition, planPrepareCluster, completeTaskPatch,
  type ChecklistProject, type DefaultChecklistTemplate, type SequenceEntry, type TrackingRow,
} from "./rules";

const ok = <T,>(data: T) => ({ success: true as const, data });
const pkOf = (set: string): string => (dataSourcesInfo as Record<string, { primaryKey: string }>)[set]!.primaryKey;
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

/** A stub that logs every request in order and measures the most requests in flight at once. */
function countingClient() {
  const log: string[] = [];
  let inFlight = 0;
  let peak = 0;
  let seq = 0;
  const run = async <T,>(line: string, result: () => T): Promise<T> => {
    log.push(line);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise<void>((r) => { setTimeout(r, 2); });
    inFlight -= 1;
    return result();
  };
  const raw = {
    retrieveMultipleRecordsAsync: vi.fn(async (table: string, o: { filter?: string }) => {
      const id = /eq ([0-9a-f-]{36})$/i.exec(o.filter ?? "")?.[1] ?? "";
      return run(`read ${table}`, () => ok([{ [pkOf(table)]: id }]));
    }),
    createRecordAsync: vi.fn(async (table: string) => run(`create ${table}`, () => ok({ [pkOf(table)]: uuid(++seq) }))),
    updateRecordAsync: vi.fn(async (table: string) => run(`update ${table}`, () => ok({}))),
    deleteRecordAsync: vi.fn(async (table: string) => run(`delete ${table}`, () => ok(undefined))),
  };
  return { client: raw as unknown as PlanClient, log, raw, peak: () => peak };
}

const ctx = { projectId: uuid(900), owningBusinessUnitId: uuid(901) };
const selected = { id: uuid(10), name: "Cluster 1" } as SequenceEntry;
const templates = (n: number): DefaultChecklistTemplate[] => Array.from({ length: n }, (_, i) => ({
  id: uuid(100 + i), name: `Task ${i}`, clusterStateId: selected.id, gateRelevance: false,
  holdingTaskDescription: null, isCompletionDate: false, order: i,
}));
const tracking = (id: number, state: number | null): TrackingRow => ({ id: uuid(id), approvalClusterState: state } as TrackingRow);

describe("Cluster Check List — direct request counts (baseline, unchanged code)", () => {
  it.each([[10, 2], [40, 5]])("UT-CHKPERF-001 first visit with %i templates: 1 tracking create + %i creates in waves of 8, never more than 8 in flight", async (n) => {
    const { client, log, peak } = countingClient();
    const plan = planPrepareCluster({ selected, tracking: null, existingRowCount: 0, templates: templates(n), ctx });
    const result = await executePlan(plan, "t", client);
    expect(log.filter((l) => l === `create ${ES.projectChecklists}`)).toHaveLength(n);
    expect(log.filter((l) => l === `create ${ES.projectStateTrackings}`)).toHaveLength(1);
    expect(log).toHaveLength(n + 1);
    expect(log[0]).toBe(`create ${ES.projectStateTrackings}`);
    expect(peak()).toBe(Math.min(8, n));
    expect(result.done).toBe(n + 1);
  });

  it("UT-CHKPERF-002 a usual visit (tracking and rows exist) sends nothing", async () => {
    const { client, log } = countingClient();
    const plan = planPrepareCluster({ selected, tracking: tracking(1, 952850001), existingRowCount: 12, templates: [], ctx });
    await executePlan(plan, "t", client);
    expect(log).toEqual([]);
  });

  it("UT-CHKPERF-003 a row action is 1 existence read then 1 PATCH (the D127 guard)", async () => {
    const { client, log } = countingClient();
    await executePlan(planChecklistRowPatch(uuid(50), completeTaskPatch(), "Task"), "t", client);
    expect(log).toEqual([`read ${ES.projectChecklists}`, `update ${ES.projectChecklists}`]);
  });

  it("UT-CHKPERF-004 Move to next cluster: read+update (current), read+update (next), note create, project update — strictly in this order", async () => {
    const { client, log, peak } = countingClient();
    const state = { id: uuid(10), name: "Cluster 1" } as SequenceEntry;
    const next = { id: uuid(11), name: "Cluster 2" } as SequenceEntry;
    const plan = planClusterTransition({
      project: { id: uuid(900), owningBusinessUnitId: uuid(901) } as ChecklistProject, state, next,
      tracking: tracking(1, 952850001), nextTracking: tracking(2, 952850000), comment: "ok", approvalDueDate: null, canEdit: true,
    });
    await executePlan(plan, "t", client);
    expect(log).toEqual([
      `read ${ES.projectStateTrackings}`, `update ${ES.projectStateTrackings}`,
      `read ${ES.projectStateTrackings}`, `update ${ES.projectStateTrackings}`,
      `create ${ES.projectStateTrackingNotes}`, `update ${ES.projects}`,
    ]);
    expect(peak()).toBe(1);
  });
});
