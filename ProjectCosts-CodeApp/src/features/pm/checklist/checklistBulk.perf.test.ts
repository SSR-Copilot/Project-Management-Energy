/**
 * UT-CHKPERF-020.. — B1 (D138): the cluster's templates copied as ONE bulk create, behind `CHECKLIST_BULK.materialise`
 * (OFF by default). The plan with the switch off is the unchanged one (UT-CHKPERF-001, UT-CHKHOOK-003, UT-CHKLST-019/056).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKLIST_BULK } from "@/data/checklistBulkFlags";
import { ES } from "@/data/dataverseNames";
import { setBulkBackend, BulkBatchError, type BulkBackend, type BulkRow } from "@/data/bulkBackend";
import { executePlan, PlanError, type PlanClient } from "@/data/executePlan";
import { isBulkWrite } from "@/data/writePlan";
import { planChecklistMaterialisation, planPrepareCluster, type DefaultChecklistTemplate, type SequenceEntry } from "./rules";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ctx = { projectId: uuid(900), owningBusinessUnitId: uuid(901) };
const selected = { id: uuid(10), name: "Cluster 1" } as SequenceEntry;
const templates = (n: number): DefaultChecklistTemplate[] => Array.from({ length: n }, (_, i) => ({
  id: uuid(100 + i), name: `Task ${i}`, clusterStateId: selected.id, gateRelevance: i % 2 === 0,
  holdingTaskDescription: i % 3 === 0 ? null : `Hold ${i}`, isCompletionDate: i % 4 === 0, order: i,
}));
const counter = () => { let n = 0; return () => uuid(5000 + (n += 1)); };

afterEach(() => { setBulkBackend(null); });

describe("Cluster Check List — bulk materialisation (B1)", () => {
  it("UT-CHKPERF-020 ships OFF: the switch is false and the default plan is the unchanged tracking create + N concurrent creates", () => {
    expect(CHECKLIST_BULK.materialise).toBe(false);
    const plan = planPrepareCluster({ selected, tracking: null, existingRowCount: 0, templates: templates(3), ctx });
    expect(plan.writes.map((w) => w.op)).toEqual(["create", "create", "create", "create"]);
    expect(plan.writes.slice(1).every((w) => w.concurrent === true)).toBe(true);
  });

  it("UT-CHKPERF-021 ON: the tracking create, then ONE createMany whose rows carry exactly the single creates' data and the injected ids", () => {
    const single = planChecklistMaterialisation(templates(5), { ...ctx, clusterStateId: selected.id });
    const bulk = planPrepareCluster({
      selected, tracking: null, existingRowCount: 0, templates: templates(5), ctx,
      materialise: { bulk: true, newId: counter() },
    });
    expect(bulk.writes.map((w) => w.op)).toEqual(["create", "createMany"]);
    const step = bulk.writes[1]!;
    expect(isBulkWrite(step)).toBe(true);
    expect(step.entitySet).toBe(ES.projectChecklists);
    expect(step.concurrent).toBeUndefined();
    expect(step.rows!.map((r) => r.id)).toEqual([5001, 5002, 5003, 5004, 5005].map(uuid));
    expect(step.rows!.map((r) => r.data)).toEqual(single.writes.map((w) => w.data));
    expect(bulk.log.at(-1)).toBe("Created 5 checklist task(s) from the defaults.");
  });

  it("UT-CHKPERF-022 a project with NO Owning Business Unit keeps the single creates (the bulk backend refuses a create without the bind)", () => {
    const plan = planPrepareCluster({
      selected, tracking: null, existingRowCount: 0, templates: templates(3),
      ctx: { projectId: ctx.projectId, owningBusinessUnitId: null }, materialise: { bulk: true },
    });
    expect(plan.writes.map((w) => w.op)).toEqual(["create", "create", "create", "create"]);
  });

  it("UT-CHKPERF-023 no templates, no bulk step; an existing tracking sends only the bulk step", () => {
    expect(planChecklistMaterialisation([], { ...ctx, clusterStateId: selected.id }, { bulk: true }).writes).toEqual([]);
    const tracking = { id: uuid(1), approvalClusterState: 952850001 } as never;
    const plan = planPrepareCluster({ selected, tracking, existingRowCount: 0, templates: templates(2), ctx, materialise: { bulk: true } });
    expect(plan.writes.map((w) => w.op)).toEqual(["createMany"]);
  });

  it("UT-CHKPERF-024 the plan engine sends the bulk step once, counts rows, and keeps the created ids in row order", async () => {
    const createMany = vi.fn(async (_set: string, rows: readonly BulkRow[]) => ({ ids: rows.map((r) => r.id) }));
    setBulkBackend({ createMany, updateMany: vi.fn() } as unknown as BulkBackend);
    const client = {
      createRecordAsync: vi.fn(async () => ({ success: true as const, data: { vsb_projectstatetrackingid: uuid(777) } })),
      updateRecordAsync: vi.fn(), deleteRecordAsync: vi.fn(),
    } as unknown as PlanClient;
    const plan = planPrepareCluster({
      selected, tracking: null, existingRowCount: 0, templates: templates(40), ctx, materialise: { bulk: true, newId: counter() },
    });
    const result = await executePlan(plan, "t", client);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0]![0]).toBe(ES.projectChecklists);
    expect(createMany.mock.calls[0]![1]).toHaveLength(40);
    expect(result.done).toBe(41);
    expect(result.createdIds).toEqual([uuid(777), ...Array.from({ length: 40 }, (_, i) => uuid(5001 + i))]);
  });

  it("UT-CHKPERF-025 a failed bulk step is a PlanError that reports the tracking as saved and the rows as not confirmed", async () => {
    const createMany = vi.fn(async (_set: string, rows: readonly BulkRow[]) => {
      throw new BulkBatchError("boom", { rowsLanded: 0, rowsTotal: rows.length, landedIds: [], cause: new Error("500") });
    });
    setBulkBackend({ createMany, updateMany: vi.fn() } as unknown as BulkBackend);
    const client = {
      createRecordAsync: vi.fn(async () => ({ success: true as const, data: { vsb_projectstatetrackingid: uuid(777) } })),
      updateRecordAsync: vi.fn(), deleteRecordAsync: vi.fn(),
    } as unknown as PlanClient;
    const plan = planPrepareCluster({
      selected, tracking: null, existingRowCount: 0, templates: templates(3), ctx, materialise: { bulk: true, newId: counter() },
    });
    const error = await executePlan(plan, "t", client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect((error as PlanError).done).toBe(1);
    expect((error as PlanError).maybeLanded.map((r) => r.id)).toEqual([5001, 5002, 5003].map(uuid));
  });

  it("UT-CHKPERF-026 registerChecklistBulk makes the real bulk backend KNOW vsb_projectchecklists (it still refuses a row without the owner bind)", async () => {
    const { registerChecklistBulk } = await import("@/data/checklistBulk");
    const { getBulkBackend } = await import("@/data/bulkBackend");
    registerChecklistBulk();
    const err = await getBulkBackend().createMany(ES.projectChecklists, [{ id: uuid(1), data: { vsb_name: "x" } }], { label: "t" })
      .catch((e: unknown) => e as Error);
    expect(String((err as Error).message)).not.toMatch(/is not a table the Generators bulk backend writes/);
    expect(String((err as Error).message)).toMatch(/owning/i);
  });
});
