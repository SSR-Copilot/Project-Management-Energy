/**
 * UT-PLAN — `executePlan` runs a WritePlan in order, substitutes the created id, and reports a
 * partial run.
 */
import { describe, expect, it, vi } from "vitest";
import { executePlan, PlanError, type PlanClient } from "./executePlan";
import { CREATED_ROW_ID, createdRowRef, emptyPlan, refusePlan } from "./writePlan";

const ok = <T,>(data: T) => ({ success: true as const, data });
const fail = (message: string) => ({ success: false as const, data: undefined, error: { message, status: 500 } });

function stubClient() {
  const calls: string[] = [];
  const client = {
    createRecordAsync: vi.fn(async (table: string, data: Record<string, unknown>) => {
      calls.push(`create ${table} ${JSON.stringify(data)}`);
      return ok({ vsb_capexaccountlistid: "new-1" });
    }),
    updateRecordAsync: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
      calls.push(`update ${table} ${id} ${JSON.stringify(data)}`);
      return ok({});
    }),
    deleteRecordAsync: vi.fn(async (table: string, id: string) => {
      calls.push(`delete ${table} ${id}`);
      return ok(undefined);
    }),
  };
  return { client: client as unknown as PlanClient, calls, raw: client };
}

describe("executePlan", () => {
  it("UT-PLAN-001 sends the writes in plan order and substitutes the created id", async () => {
    const { client, calls } = stubClient();
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: { vsb_name: "A" }, reason: "create" },
      { op: "update", entitySet: "vsb_capexaccountlists", id: CREATED_ROW_ID, data: { statecode: 1 }, reason: "status" },
      { op: "delete", entitySet: "vsb_capexcosts", id: "c-9", reason: "delete" },
    );
    const result = await executePlan(plan, "test", client);
    expect(result).toEqual({ done: 3, createdIds: ["new-1"] });
    expect(calls).toEqual([
      'create vsb_capexaccountlists {"vsb_name":"A"}',
      'update vsb_capexaccountlists new-1 {"statecode":1}',
      "delete vsb_capexcosts c-9",
    ]);
  });

  it("UT-PLAN-002 a refused plan sends nothing", async () => {
    const { client, calls } = stubClient();
    await expect(executePlan(refusePlan("no"), "test", client)).rejects.toThrow("no");
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-003 a failure stops the run and reports how many writes were sent", async () => {
    const { client, raw } = stubClient();
    const plan = emptyPlan();
    plan.writes.push(
      { op: "update", entitySet: "vsb_capexaccountlists", id: "a", data: {}, reason: "first" },
      { op: "update", entitySet: "vsb_capexaccountlists", id: "b", data: {}, reason: "second" },
      { op: "update", entitySet: "vsb_capexaccountlists", id: "c", data: {}, reason: "third" },
    );
    raw.updateRecordAsync
      .mockResolvedValueOnce(ok({}) as never)
      .mockResolvedValueOnce(fail("boom") as never);
    const err = await executePlan(plan, "test", client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect((err as PlanError).done).toBe(1);
    expect((err as PlanError).total).toBe(3);
    expect((err as PlanError).failedReason).toBe("second");
    expect(raw.updateRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-PLAN-004 a table that is not registered fails before any request", async () => {
    const { client, calls } = stubClient();
    const plan = emptyPlan();
    plan.writes.push({ op: "update", entitySet: "vsb_notatable", id: "x", data: {}, reason: "x" });
    await expect(executePlan(plan, "test", client)).rejects.toBeInstanceOf(PlanError);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-005 createdRowRef(n) binds later writes to the n-th created row, not the latest", async () => {
    const { client, raw } = stubClient();
    raw.createRecordAsync
      .mockResolvedValueOnce(ok({ vsb_capexaccountlistid: "parent-1" }) as never)
      .mockResolvedValueOnce(ok({ vsb_capexaccountlistid: "child-1" }) as never)
      .mockResolvedValueOnce(ok({ vsb_capexaccountlistid: "child-2" }) as never);
    const plan = emptyPlan();
    const bindParent = `/vsb_capexaccountlists(${createdRowRef(0)})`;
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: { vsb_name: "P" }, reason: "parent" },
      { op: "create", entitySet: "vsb_capexaccountlists", data: { "x@odata.bind": bindParent, n: 1 }, reason: "c1" },
      { op: "create", entitySet: "vsb_capexaccountlists", data: { "x@odata.bind": bindParent, n: 2 }, reason: "c2" },
    );
    const result = await executePlan(plan, "test", client);
    expect(result.createdIds).toEqual(["parent-1", "child-1", "child-2"]);
    expect(raw.createRecordAsync.mock.calls.slice(1).map(([, data]) => data)).toEqual([
      { "x@odata.bind": "/vsb_capexaccountlists(parent-1)", n: 1 },
      { "x@odata.bind": "/vsb_capexaccountlists(parent-1)", n: 2 },
    ]);
  });

  it("UT-PLAN-006 a createdRowRef to a create that has not run fails before sending", async () => {
    const { client, calls } = stubClient();
    const plan = emptyPlan();
    plan.writes.push({
      op: "create", entitySet: "vsb_capexaccountlists",
      data: { "x@odata.bind": `/vsb_capexaccountlists(${createdRowRef(0)})` }, reason: "orphan",
    });
    await expect(executePlan(plan, "test", client)).rejects.toBeInstanceOf(PlanError);
    expect(calls).toEqual([]);
  });
});
