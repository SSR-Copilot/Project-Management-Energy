/**
 * UT-PLAN-150.. — review fix F2 in the write-plan engine: `PlanError.maybeLanded` (rows of a failed createMany step
 * that are not confirmed landed) and `PlanResult.deleted` / `PlanError.deleted` (rows whose delete succeeded).
 * Same fake-backend approach as `executePlan.bulk.test.ts` (UT-PLAN-100..140).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BulkBackendValidationError, BulkBatchError, BulkRowsGoneError, setBulkBackend, type BulkBackend, type BulkRow,
} from "./bulkBackend";
import { CreatedIdMissingError, executePlan, PlanError, type PlanClient } from "./executePlan";
import { CREATED_ROW_ID, createdRowRef, createMany, emptyPlan, together, updateMany, type PlannedWrite } from "./writePlan";

const ok = <T,>(data: T) => ({ success: true as const, data });
const SET = "vsb_landleaseallocationwtgs";
const OBU = { "owningbusinessunit@odata.bind": "/businessunits(bu-1)" };
const row = (id: string): BulkRow => ({ id, data: { ...OBU } });

function stubClient(opts: { gone?: string[]; failOn?: string[] } = {}) {
  let n = 0;
  const client = {
    createRecordAsync: vi.fn(async () => {
      n += 1;
      return ok({ vsb_capexaccountlistid: `single-${n}` });
    }),
    updateRecordAsync: vi.fn(async () => ok({})),
    deleteRecordAsync: vi.fn(async (_table: string, id: string) => {
      if (opts.failOn?.includes(id)) return { success: false as const, error: Object.assign(new Error("denied"), { status: 403 }) };
      if (opts.gone?.includes(id)) return { success: false as const, error: Object.assign(new Error("Does Not Exist"), { status: 404 }) };
      return ok(undefined);
    }),
  };
  return client as unknown as PlanClient;
}

const backendWith = (createMany_: BulkBackend["createMany"], updateMany_?: BulkBackend["updateMany"]): BulkBackend => ({
  createMany: vi.fn(createMany_),
  updateMany: vi.fn(updateMany_ ?? (async () => ({ requests: 1 }))),
});
const L = (id: string, entitySet = SET) => ({ entitySet, id });

afterEach(() => setBulkBackend(null));

describe("maybeLanded", () => {
  it("UT-PLAN-150 a createMany that fails with an ambiguous error and no landed ids reports EVERY row id of the step as maybeLanded", async () => {
    setBulkBackend(backendWith(async () => { throw new Error("network error"); }));
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a"), row("b"), row("c")], "allocations"));
    const err = (await executePlan(plan, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.landed).toEqual([]);
    expect(err.maybeLanded).toEqual([L("a"), L("b"), L("c")]);
    expect(err.deleted).toEqual([]);
  });

  it("UT-PLAN-151 a partly landed createMany: the confirmed ids are landed, the others maybeLanded, and no id is in both lists", async () => {
    setBulkBackend(backendWith(async (_set, rows) => {
      throw new BulkBatchError("2 of 4 saved", { rowsLanded: 2, rowsTotal: rows.length, landedIds: ["b", "d"], cause: new Error("500") });
    }));
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a"), row("b"), row("c"), row("d")], "allocations"));
    const err = (await executePlan(plan, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.done).toBe(2);
    expect(err.landed).toEqual([L("b"), L("d")]);
    expect(err.maybeLanded).toEqual([L("a"), L("c")]);
    const confirmed = new Set(err.landed.map((r) => r.id));
    expect(err.maybeLanded.some((r) => confirmed.has(r.id))).toBe(false);
  });

  it("UT-PLAN-152 landed ids are matched case-insensitively, so a row the backend confirmed in upper case is not also maybe", async () => {
    setBulkBackend(backendWith(async (_set, rows) => {
      throw new BulkBatchError("1 of 2 saved", { rowsLanded: 1, rowsTotal: rows.length, landedIds: ["AA-1"], cause: new Error("500") });
    }));
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("aa-1"), row("bb-2")], "allocations"));
    const err = (await executePlan(plan, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.maybeLanded).toEqual([L("bb-2")]);
  });

  it("UT-PLAN-153 a fail-closed refusal or a rows-gone guard sent nothing, so nothing is maybeLanded", async () => {
    setBulkBackend(backendWith(async () => { throw new BulkBackendValidationError("row a: no business unit"); }));
    const first = emptyPlan();
    first.writes.push(
      { op: "update", entitySet: "vsb_projects", id: "p", data: {}, reason: "first" },
      createMany(SET, [row("a")], "allocations"),
    );
    const refused = (await executePlan(first, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(refused).toBeInstanceOf(PlanError);
    expect(refused.maybeLanded).toEqual([]);

    setBulkBackend(backendWith(async (_s, rows) => ({ ids: rows.map((r) => r.id), requests: 1 }), async () => {
      throw new BulkRowsGoneError(["g1"]);
    }));
    const gone = emptyPlan();
    gone.writes.push(updateMany("vsb_generatorinprojects", [row("g1")], "status"));
    const err = (await executePlan(gone, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.rowsGone).toBe(true);
    expect(err.maybeLanded).toEqual([]);
  });

  it("UT-PLAN-154 a createMany whose ids come from createdRowRef reports the RESOLVED ids; earlier steps' landed rows stay out of maybeLanded", async () => {
    setBulkBackend(backendWith(async (_set, rows) => {
      if (rows.length === 1) return { ids: rows.map((r) => r.id), requests: 1 };
      throw new Error("timeout");
    }));
    const plan = emptyPlan();
    plan.writes.push(
      createMany("vsb_generatortypeinprojects", [row("type-1")], "type"),
      createMany(SET, [
        { id: "x-1", data: { ...OBU, "vsb_Type@odata.bind": `/vsb_generatortypeinprojects(${createdRowRef(0)})` } },
        row("x-2"),
      ], "turbines"),
    );
    const err = (await executePlan(plan, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.done).toBe(1);
    expect(err.landed).toEqual([L("type-1", "vsb_generatortypeinprojects")]);
    expect(err.maybeLanded).toEqual([L("x-1"), L("x-2")]);
  });

  it("UT-PLAN-155 a backend that returns too few ids (CreatedIdMissingError): the returned ids are landed, the rest maybeLanded", async () => {
    setBulkBackend(backendWith(async () => ({ ids: ["a"], requests: 1 })));
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a"), row("b")], "allocations"));
    const err = (await executePlan(plan, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.cause).toBeInstanceOf(CreatedIdMissingError);
    expect(err.landed).toEqual([L("a")]);
    expect(err.maybeLanded).toEqual([L("b")]);
  });

  it("UT-PLAN-156 a successful plan has an empty maybeLanded, and a failed updateMany never has any", async () => {
    setBulkBackend(backendWith(async (_s, rows) => ({ ids: rows.map((r) => r.id), requests: 1 }), async () => {
      throw new Error("boom");
    }));
    const okPlan = emptyPlan();
    okPlan.writes.push(createMany(SET, [row("a")], "allocations"));
    await expect(executePlan(okPlan, "test", stubClient())).resolves.toMatchObject({ maybeLanded: [], deleted: [], landed: [L("a")] });
    const bad = emptyPlan();
    bad.writes.push(updateMany("vsb_generatorinprojects", [row("g")], "status"));
    const err = (await executePlan(bad, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.maybeLanded).toEqual([]);
  });
});

describe("deleted rows", () => {
  const del = (id: string, reason = `d-${id}`): PlannedWrite => ({ op: "delete", entitySet: "vsb_capexcosts", id, reason });

  it("UT-PLAN-160 PlanResult.deleted lists the rows whose delete succeeded in plan order, a 404 (already gone) included", async () => {
    const plan = emptyPlan();
    plan.writes.push(del("d1"), del("d2"), { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "c" }, del("d3"));
    const result = await executePlan(plan, "test", stubClient({ gone: ["d2"] }));
    expect(result.deleted).toEqual([
      { entitySet: "vsb_capexcosts", id: "d1" }, { entitySet: "vsb_capexcosts", id: "d2" }, { entitySet: "vsb_capexcosts", id: "d3" },
    ]);
    expect(result.done).toBe(4);
  });

  it("UT-PLAN-161 a delete that fails stops the plan; PlanError.deleted holds the deletes before it, not the failed one", async () => {
    const plan = emptyPlan();
    plan.writes.push(del("d1"), del("d2"), del("d3"), del("d4"));
    const err = (await executePlan(plan, "test", stubClient({ failOn: ["d3"] })).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.done).toBe(2);
    expect(err.deleted).toEqual([{ entitySet: "vsb_capexcosts", id: "d1" }, { entitySet: "vsb_capexcosts", id: "d2" }]);
  });

  it("UT-PLAN-162 a together() run of deletes lists the successful ones in plan order, also when another delete of the run fails", async () => {
    const plan = emptyPlan();
    plan.writes.push(...together([del("d1"), del("d2"), del("d3"), del("d4")]));
    const err = (await executePlan(plan, "test", stubClient({ failOn: ["d2"] })).catch((e: unknown) => e)) as PlanError;
    expect(err.done).toBe(3);
    expect(err.deleted.map((r) => r.id)).toEqual(["d1", "d3", "d4"]);
  });

  it("UT-PLAN-163 a delete whose id is CREATED_ROW_ID or a createdRowRef is recorded under the RESOLVED id; a bulk failure after it keeps the list", async () => {
    setBulkBackend(backendWith(async () => { throw new Error("boom"); }));
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "c" },
      { op: "delete", entitySet: "vsb_capexcosts", id: CREATED_ROW_ID, reason: "undo" },
      { op: "delete", entitySet: "vsb_capexcosts", id: createdRowRef(0), reason: "undo again" },
      createMany(SET, [row("a")], "allocations"),
    );
    const err = (await executePlan(plan, "test", stubClient()).catch((e: unknown) => e)) as PlanError;
    expect(err.deleted).toEqual([{ entitySet: "vsb_capexcosts", id: "single-1" }, { entitySet: "vsb_capexcosts", id: "single-1" }]);
    expect(err.landed).toEqual([{ entitySet: "vsb_capexaccountlists", id: "single-1" }]);
    expect(err.maybeLanded).toEqual([L("a")]);
  });
});
