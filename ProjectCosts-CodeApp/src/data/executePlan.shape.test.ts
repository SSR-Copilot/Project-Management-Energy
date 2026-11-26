/**
 * UT-PLAN-950.. — dvopt T-15 / WE-06: a malformed plan is refused whole, BEFORE the first request (`PLAN_SHAPE_CHECKS`),
 * and a valid plan is untouched. Each rejected shape asserts that the client saw no call at all, even when an earlier,
 * valid write precedes the bad one (the half-applied plan the audit warned about).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { executePlan, PlanError, PlanShapeError, type PlanClient } from "./executePlan";
import {
  CREATED_ROW_ID, createdRowRef, createMany, emptyPlan, planEngineFlags, setPlanEngineFlags, together, updateMany,
  type PlannedWrite,
} from "./writePlan";
import { setBulkBackend } from "./bulkBackend";

const SET = "vsb_capexaccountlists";
const PK = "vsb_capexaccountlistid";
const ROW = "50000000-0000-0000-0000-000000000001";

const ok = <T,>(data: T) => ({ success: true as const, data });

function stub() {
  const calls: string[] = [];
  let n = 0;
  const raw = {
    createRecordAsync: vi.fn(async (table: string, data: Record<string, unknown>) => {
      calls.push(`create ${table} ${JSON.stringify(data)}`);
      n += 1;
      return ok({ [PK]: `new-${n}` });
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
  return { client: raw as unknown as PlanClient, calls };
}

const planOf = (...writes: PlannedWrite[]) => {
  const plan = emptyPlan();
  plan.writes.push(...writes);
  return plan;
};

/** A valid first write, so that "an earlier write had already landed" would be visible in `calls`. */
const GOOD: PlannedWrite = { op: "update", entitySet: "vsb_projects", id: "p-1", data: { a: 1 }, reason: "good" };

const refuse = async (plan: ReturnType<typeof planOf>) => {
  const { client, calls } = stub();
  const err = await executePlan(plan, "test", client).catch((e: unknown) => e);
  return { err, calls };
};

afterEach(() => {
  setPlanEngineFlags(null);
  setBulkBackend(null);
});

describe("executePlan: plan shape checks (WE-06)", () => {
  it("UT-PLAN-950 the switch ships ON", () => {
    expect(planEngineFlags()).toEqual({ shapeChecks: true, permissionLookup: true });
  });

  it("UT-PLAN-951 an update without an id is refused before any request, even after a valid write", async () => {
    const { err, calls } = await refuse(planOf(GOOD, { op: "update", entitySet: SET, data: { a: 1 }, reason: "no id" }));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect((err as Error).message).toMatch(/"no id": an update needs the id of the row/);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-952 a delete with an empty or blank id is refused before any request", async () => {
    for (const id of ["", "   "]) {
      const { err, calls } = await refuse(planOf(GOOD, { op: "delete", entitySet: SET, id, reason: "blank" }));
      expect(err).toBeInstanceOf(PlanShapeError);
      expect((err as Error).message).toMatch(/a delete needs the id/);
      expect(calls).toEqual([]);
    }
  });

  it("UT-PLAN-953 a non-string id is refused before any request", async () => {
    const bad = { op: "update", entitySet: SET, id: 42 as unknown as string, data: {}, reason: "num" } satisfies PlannedWrite;
    const { err, calls } = await refuse(planOf(GOOD, bad));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-954 an unknown op is refused (it would have been sent as a delete)", async () => {
    const bad = { op: "upsert" as unknown as "create", entitySet: SET, id: ROW, reason: "upsert" } satisfies PlannedWrite;
    const { err, calls } = await refuse(planOf(GOOD, bad));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect((err as Error).message).toMatch(/unknown operation "upsert"/);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-955 a table that is not registered is refused before the earlier valid write is sent", async () => {
    const { err, calls } = await refuse(planOf(GOOD, { op: "update", entitySet: "vsb_notatable", id: "x", data: {}, reason: "late" }));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect((err as Error).message).toMatch(/vsb_notatable.*not registered/);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-956 guarded on a create or a delete is refused before any request", async () => {
    for (const op of ["create", "delete"] as const) {
      const { err, calls } = await refuse(planOf(GOOD, { op, entitySet: SET, id: ROW, data: {}, reason: op, guarded: true }));
      expect(err).toBeInstanceOf(PlanShapeError);
      expect((err as Error).message).toMatch(/only an update can be guarded/);
      expect(calls).toEqual([]);
    }
  });

  it("UT-PLAN-957 CREATED_ROW_ID with no create before it is refused before any request", async () => {
    const { err, calls } = await refuse(planOf(GOOD, { op: "update", entitySet: SET, id: CREATED_ROW_ID, data: {}, reason: "orphan" }));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect((err as Error).message).toMatch(/no create preceded it/);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-958 createdRowRef(n) past the creates before it is refused, in the id and in a data value", async () => {
    const create: PlannedWrite = { op: "create", entitySet: SET, data: { vsb_name: "P" }, reason: "parent" };
    for (const bad of [
      { op: "update", entitySet: SET, id: createdRowRef(1), data: {}, reason: "id ref" },
      { op: "create", entitySet: SET, data: { "x@odata.bind": `/${SET}(${createdRowRef(1)})` }, reason: "bind ref" },
    ] satisfies PlannedWrite[]) {
      const { err, calls } = await refuse(planOf(create, bad));
      expect(err).toBeInstanceOf(PlanShapeError);
      expect((err as Error).message).toMatch(/refers to created row 1/);
      expect(calls).toEqual([]);
    }
  });

  it("UT-PLAN-959 a write of a concurrent run cannot refer to a create made inside the same run", async () => {
    const run = together([
      { op: "create", entitySet: SET, data: { vsb_name: "A" }, reason: "a" },
      { op: "update", entitySet: SET, id: CREATED_ROW_ID, data: {}, reason: "same run" },
    ]);
    const { err, calls } = await refuse(planOf(...run));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-960 a concurrentLimit that is not a whole number of at least 1 is refused before any request", async () => {
    for (const concurrencyLimit of [0, -2, 1.5, Number.NaN]) {
      const { err, calls } = await refuse(planOf(GOOD, { ...GOOD, reason: "limit", concurrent: true, concurrencyLimit }));
      expect(err).toBeInstanceOf(PlanShapeError);
      expect(calls).toEqual([]);
    }
  });

  it("UT-PLAN-961 a bulk step that refers to a create that has not run is refused before any request", async () => {
    const { err, calls } = await refuse(planOf(GOOD, createMany(SET, [{ id: "a", data: { b: createdRowRef(0) } }], "bulk ref")));
    expect(err).toBeInstanceOf(PlanShapeError);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-962 a PlanShapeError is not a PlanError and not a refusal: nothing was saved and no count is claimed", async () => {
    const { err } = await refuse(planOf({ op: "delete", entitySet: SET, reason: "x" }));
    expect(err).not.toBeInstanceOf(PlanError);
    expect((err as Error).name).toBe("PlanShapeError");
  });
});

describe("executePlan: valid shapes are unchanged by the shape checks", () => {
  it("UT-PLAN-963 create then update of CREATED_ROW_ID, a createdRowRef bind and a delete all run in order", async () => {
    const { client, calls } = stub();
    const plan = planOf(
      { op: "create", entitySet: SET, data: { vsb_name: "P" }, reason: "parent" },
      { op: "update", entitySet: SET, id: CREATED_ROW_ID, data: { statecode: 1 }, reason: "status" },
      { op: "create", entitySet: SET, data: { "x@odata.bind": `/${SET}(${createdRowRef(0)})` }, reason: "child" },
      { op: "update", entitySet: SET, id: createdRowRef(1), data: { n: 1 }, reason: "by ref" },
      { op: "delete", entitySet: "vsb_capexcosts", id: "c-9", reason: "delete" },
    );
    const result = await executePlan(plan, "test", client);
    expect(result).toMatchObject({ done: 5, createdIds: ["new-1", "new-2"] });
    expect(calls).toEqual([
      `create ${SET} {"vsb_name":"P"}`,
      `update ${SET} new-1 {"statecode":1}`,
      `create ${SET} {"x@odata.bind":"/${SET}(new-1)"}`,
      `update ${SET} new-2 {"n":1}`,
      "delete vsb_capexcosts c-9",
    ]);
  });

  it("UT-PLAN-964 a concurrent run may use creates made BEFORE the run, and a second group sees the first group's creates", async () => {
    const { client, calls } = stub();
    const plan = planOf(
      { op: "create", entitySet: SET, data: { vsb_name: "P" }, reason: "parent" },
      ...together([
        { op: "update", entitySet: SET, id: CREATED_ROW_ID, data: { a: 1 }, reason: "u1" },
        { op: "update", entitySet: SET, id: createdRowRef(0), data: { a: 2 }, reason: "u2" },
      ]),
      ...together([{ op: "create", entitySet: SET, data: { vsb_name: "Q" }, reason: "q" }], { limit: 2 }),
      ...together([{ op: "update", entitySet: SET, id: createdRowRef(1), data: { a: 3 }, reason: "u3" }], { limit: 3 }),
    );
    await expect(executePlan(plan, "test", client)).resolves.toMatchObject({ done: 5 });
    expect(calls).toContain(`update ${SET} new-2 {"a":3}`);
  });

  it("UT-PLAN-965 bulk steps: createMany ids are visible to later refs, one per row, and updateMany with a created id runs", async () => {
    const { client, calls } = stub();
    setBulkBackend({
      createMany: async (_set, rows) => ({ ids: rows.map((r) => r.id), requests: 1 }),
      updateMany: async () => ({ requests: 1 }),
    });
    const plan = planOf(
      createMany(SET, [{ id: "r0", data: {} }, { id: "r1", data: {} }], "rows"),
      { op: "update", entitySet: SET, id: createdRowRef(1), data: { x: createdRowRef(0) }, reason: "single" },
      updateMany(SET, [{ id: createdRowRef(0), data: { y: 1 } }], "many"),
    );
    await expect(executePlan(plan, "test", client)).resolves.toMatchObject({ done: 4 });
    expect(calls).toEqual([`update ${SET} r1 {"x":"r0"}`]);
  });

  it("UT-PLAN-966 with the switch OFF the old behaviour returns: a missing id is sent to the client as undefined", async () => {
    setPlanEngineFlags({ shapeChecks: false });
    const { client, calls } = stub();
    const plan = planOf(GOOD, { op: "update", entitySet: SET, data: { a: 1 }, reason: "no id" });
    await expect(executePlan(plan, "test", client)).resolves.toMatchObject({ done: 2 });
    expect(calls).toEqual(["update vsb_projects p-1 {\"a\":1}", `update ${SET} undefined {"a":1}`]);
  });

  it("UT-PLAN-967 with the switch OFF an unregistered table fails mid-plan as a PlanError after the first write landed", async () => {
    setPlanEngineFlags({ shapeChecks: false });
    const { client, calls } = stub();
    const err = (await executePlan(planOf(GOOD, { op: "update", entitySet: "vsb_notatable", id: "x", data: {}, reason: "late" }), "test", client)
      .catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.done).toBe(1);
    expect(calls).toHaveLength(1);
  });
});
