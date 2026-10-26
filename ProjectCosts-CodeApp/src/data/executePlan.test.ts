/**
 * UT-PLAN — `executePlan` runs a WritePlan in order, substitutes the created id, and reports a
 * partial run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordGoneError } from "@/platform/errors";

// `invalidatePageTokens` is spied on; everything else in `./client` (the real guard) is kept.
const invalidated = vi.hoisted(() => [] as string[]);
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    invalidatePageTokens: vi.fn((tableName: string) => {
      invalidated.push(tableName);
      actual.invalidatePageTokens(tableName);
    }),
  };
});
beforeEach(() => {
  invalidated.length = 0;
});
import {
  CreatedIdMissingError, executePlan, PlanError, PlanRefusedError, type PlanClient,
} from "./executePlan";
import { CREATED_ROW_ID, createdRowRef, emptyPlan, guardedUpdate, refusePlan } from "./writePlan";

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

/* ───────────────────────── guarded updates (opt-in; no PM plan sets `guarded`) ───────────────────────── */

const SET = "vsb_capexaccountlists";
const PK = "vsb_capexaccountlistid";
const ROW = "50000000-0000-0000-0000-000000000001";
const ROW_2 = "50000000-0000-0000-0000-000000000002";
const CREATED = "50000000-0000-0000-0000-00000000c001";

/** A client that also answers the guard's existence read, logging every request in order. */
function guardedStub(opts: { gone?: string[]; patchStatus?: number } = {}) {
  const log: string[] = [];
  const gone = new Set(opts.gone ?? []);
  const raw = {
    retrieveMultipleRecordsAsync: vi.fn(async (table: string, options: { filter?: string; select?: string[]; maxPageSize?: number }) => {
      const id = /eq ([0-9a-f-]{36})$/i.exec(options.filter ?? "")?.[1] ?? "";
      log.push(`read ${table} ${id}`);
      return ok(gone.has(id) ? [] : [{ [PK]: id }]);
    }),
    createRecordAsync: vi.fn(async (table: string, data: Record<string, unknown>) => {
      log.push(`create ${table} ${JSON.stringify(data)}`);
      return ok({ [PK]: CREATED });
    }),
    updateRecordAsync: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
      log.push(`update ${table} ${id} ${JSON.stringify(data)}`);
      if (opts.patchStatus) return { success: false as const, data: undefined, error: { message: `HTTP ${opts.patchStatus}`, status: opts.patchStatus } };
      return ok({});
    }),
    deleteRecordAsync: vi.fn(async (table: string, id: string) => {
      log.push(`delete ${table} ${id}`);
      return ok(undefined);
    }),
  };
  return { client: raw as unknown as PlanClient, log, raw };
}

const planOf = (...writes: ReturnType<typeof guardedUpdate>[]) => {
  const plan = emptyPlan();
  plan.writes.push(...writes);
  return plan;
};

describe("executePlan: guarded updates", () => {
  it("UT-PLAN-007 a guarded update reads the row by primary key, then PATCHes it", async () => {
    const { client, log, raw } = guardedStub();
    const result = await executePlan(planOf(guardedUpdate(SET, ROW, { vsb_name: "A" }, "rename")), "test", client);
    expect(result).toEqual({ done: 1, createdIds: [] });
    expect(log).toEqual([`read ${SET} ${ROW}`, `update ${SET} ${ROW} {"vsb_name":"A"}`]);
    expect(raw.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(SET, { select: [PK], filter: `${PK} eq ${ROW}`, maxPageSize: 1 });
  });

  it("UT-PLAN-008 a row that is gone sends NOTHING: PlanError(gone) with a RecordGoneError cause; earlier writes stand and are counted", async () => {
    const { client, log } = guardedStub({ gone: [ROW_2] });
    const plan = planOf(
      guardedUpdate(SET, ROW, { vsb_name: "A" }, "first"),
      guardedUpdate(SET, ROW_2, { vsb_name: "B" }, "second"),
      guardedUpdate(SET, ROW, { vsb_name: "C" }, "third"),
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.gone).toBe(true);
    expect(err.cause).toBeInstanceOf(RecordGoneError);
    expect([err.done, err.total, err.failedReason]).toEqual([1, 3, "second"]);
    expect(log).toEqual([
      `read ${SET} ${ROW}`, `update ${SET} ${ROW} {"vsb_name":"A"}`,
      `read ${SET} ${ROW_2}`,
    ]);
  });

  it("UT-PLAN-009 create, then a guarded update of the created row through CREATED_ROW_ID (the read targets the new id)", async () => {
    const { client, log } = guardedStub();
    const plan = planOf(
      { op: "create", entitySet: SET, data: { vsb_name: "N" }, reason: "create" },
      guardedUpdate(SET, CREATED_ROW_ID, { statecode: 1 }, "status"),
    );
    const result = await executePlan(plan, "test", client);
    expect(result).toEqual({ done: 2, createdIds: [CREATED] });
    expect(log).toEqual([
      `create ${SET} {"vsb_name":"N"}`, `read ${SET} ${CREATED}`, `update ${SET} ${CREATED} {"statecode":1}`,
    ]);
  });

  it("UT-PLAN-010 a createdRowRef in the id of a guarded update is resolved before the read", async () => {
    const { client, log } = guardedStub();
    const plan = planOf(
      { op: "create", entitySet: SET, data: { vsb_name: "P" }, reason: "parent" },
      guardedUpdate(SET, createdRowRef(0), { vsb_name: "P2" }, "again"),
    );
    await executePlan(plan, "test", client);
    expect(log.slice(1)).toEqual([`read ${SET} ${CREATED}`, `update ${SET} ${CREATED} {"vsb_name":"P2"}`]);
  });

  it("UT-PLAN-011 PM pin: an unguarded update is exactly one PATCH and never reads", async () => {
    const { client, log, raw } = guardedStub();
    const plan = planOf({ op: "update", entitySet: SET, id: ROW, data: { vsb_name: "A" }, reason: "plain" });
    await executePlan(plan, "test", client);
    expect(log).toEqual([`update ${SET} ${ROW} {"vsb_name":"A"}`]);
    expect(raw.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
  });

  it("UT-PLAN-012 PM pin: an unguarded update works on a client that has no read at all", async () => {
    const { client, calls } = stubClient();
    const plan = planOf({ op: "update", entitySet: SET, id: "x", data: {}, reason: "plain" });
    await expect(executePlan(plan, "test", client)).resolves.toEqual({ done: 1, createdIds: [] });
    expect(calls).toEqual([`update ${SET} x {}`]);
  });

  it("UT-PLAN-013 guarded on a create or a delete is rejected before anything is sent", async () => {
    for (const op of ["create", "delete"] as const) {
      const { client, log } = guardedStub();
      const plan = planOf({ op, entitySet: SET, id: ROW, data: {}, reason: op, guarded: true });
      const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
      expect(err).toBeInstanceOf(PlanError);
      expect(err.message).toMatch(/only an update can be guarded/);
      expect(log).toEqual([]);
    }
  });

  it("UT-PLAN-014 a client that cannot read fails closed: the guarded update is refused, never sent unguarded", async () => {
    const { client, calls } = stubClient();
    const err = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "x")), "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.message).toMatch(/cannot read rows/);
    expect(calls).toEqual([]);
  });

  it("UT-PLAN-015 an id that is not a GUID is rejected before any request (read or PATCH)", async () => {
    const { client, log } = guardedStub();
    const err = (await executePlan(planOf(guardedUpdate(SET, "not-a-guid", {}, "x")), "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.gone).toBe(false);
    expect(log).toEqual([]);
  });

  it("UT-PLAN-016 a table that is not registered fails a guarded update before any request", async () => {
    const { client, log } = guardedStub();
    await expect(executePlan(planOf(guardedUpdate("vsb_notatable", ROW, {}, "x")), "test", client)).rejects.toBeInstanceOf(PlanError);
    expect(log).toEqual([]);
  });

  it("UT-PLAN-017 PlanError.createdIds lists the rows created before a later write failed", async () => {
    const { client } = guardedStub({ gone: [CREATED] });
    const plan = planOf(
      { op: "create", entitySet: SET, data: {}, reason: "create" },
      guardedUpdate(SET, CREATED_ROW_ID, { statecode: 1 }, "status"),
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect([err.done, err.total, err.createdIds, err.gone]).toEqual([1, 2, [CREATED], true]);
  });

  it("UT-PLAN-018 PM pin: PlanError keeps done / total / failedReason, createdIds is empty when nothing was created", async () => {
    const { client, raw } = stubClient();
    raw.updateRecordAsync.mockResolvedValueOnce(fail("boom") as never);
    const plan = planOf({ op: "update", entitySet: SET, id: "a", data: {}, reason: "first" });
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect([err.done, err.total, err.failedReason, err.gone]).toEqual([0, 1, "first", false]);
    expect(err.createdIds).toEqual([]);
    expect(err.message).toBe("test: first failed: boom");
  });

  it("UT-PLAN-019 a create that returns no id throws CreatedIdMissingError with the same message as before", async () => {
    const { client, raw } = stubClient();
    raw.createRecordAsync.mockResolvedValueOnce(ok({}) as never);
    const plan = planOf({ op: "create", entitySet: SET, data: {}, reason: "make" });
    const err = (await executePlan(plan, "op", client).catch((e: unknown) => e)) as PlanError;
    expect(err.cause).toBeInstanceOf(CreatedIdMissingError);
    expect(err.cause).toBeInstanceOf(Error);
    expect((err.cause as Error).message).toBe("op: make: the create returned no id");
    expect(err.message).toBe("op: make: the create returned no id");
  });

  it("UT-PLAN-020 a refused plan throws PlanRefusedError, an Error with exactly the refusal text", async () => {
    const { client } = stubClient();
    const err = await executePlan(refusePlan("not allowed"), "test", client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanRefusedError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PlanError);
    expect((err as Error).message).toBe("not allowed");
  });

  it("UT-PLAN-021 a PATCH refused with 404 after the read (the delete race) is mapped to a gone row", async () => {
    const { client, log } = guardedStub({ patchStatus: 404 });
    const err = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "x")), "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.gone).toBe(true);
    expect(err.cause).toBeInstanceOf(RecordGoneError);
    expect(log).toHaveLength(2);
  });

  it("UT-PLAN-022 any other PATCH failure of a guarded update is NOT reported as gone", async () => {
    const { client } = guardedStub({ patchStatus: 500 });
    const err = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "x")), "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.gone).toBe(false);
    expect(err.cause).not.toBeInstanceOf(RecordGoneError);
  });

  it("UT-PLAN-023 a write's label is used verbatim as the operation text; without one it stays `<operation>: <reason>`", async () => {
    const { client } = guardedStub({ patchStatus: 500 });
    const labelled = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "why", "update gate active")), "op", client).catch((e: unknown) => e)) as PlanError;
    expect(labelled.message).toBe("update gate active failed: HTTP 500");
    const plain = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "why")), "op", client).catch((e: unknown) => e)) as PlanError;
    expect(plain.message).toBe("op: why failed: HTTP 500");
  });

  it("UT-PLAN-024 guardedUpdate builds an update with guarded: true and only carries a label when given", () => {
    expect(guardedUpdate(SET, ROW, { a: 1 }, "r")).toEqual({
      op: "update", entitySet: SET, id: ROW, data: { a: 1 }, reason: "r", guarded: true,
    });
    expect(guardedUpdate(SET, ROW, {}, "r", "L")).toMatchObject({ label: "L", guarded: true });
  });
});

/* ───────────────────────── P-1: accepted writes drop the table's cached page tokens ───────────────────────── */

describe("executePlan: page-token invalidation", () => {
  it("UT-PLAN-025 a create on vsb_projects (Add Project) invalidates exactly \"vsb_projects\" — the table name countedPage caches under", async () => {
    const { client, raw } = stubClient();
    raw.createRecordAsync.mockResolvedValueOnce(ok({ vsb_projectid: "p-new" }) as never);
    const plan = planOf({ op: "create", entitySet: "vsb_projects", data: { vsb_name: "N" }, reason: "create the project" });
    await executePlan(plan, "test", client);
    expect(invalidated).toEqual(["vsb_projects"]);
  });

  it("UT-PLAN-026 an update and a delete each invalidate their own entity set, in plan order", async () => {
    const { client } = stubClient();
    const plan = planOf(
      { op: "update", entitySet: "vsb_projects", id: "p-1", data: { vsb_name: "B" }, reason: "rename" },
      { op: "delete", entitySet: "vsb_capexcosts", id: "c-9", reason: "delete" },
    );
    await executePlan(plan, "test", client);
    expect(invalidated).toEqual(["vsb_projects", "vsb_capexcosts"]);
  });

  it("UT-PLAN-027 a failed step does not invalidate (the cache is still correct)", async () => {
    for (const op of ["create", "update", "delete"] as const) {
      invalidated.length = 0;
      const { client, raw } = stubClient();
      raw.createRecordAsync.mockResolvedValueOnce(fail("boom") as never);
      raw.updateRecordAsync.mockResolvedValueOnce(fail("boom") as never);
      raw.deleteRecordAsync.mockResolvedValueOnce(fail("boom") as never);
      const plan = planOf({ op, entitySet: SET, id: op === "create" ? undefined : "x", data: {}, reason: op });
      await expect(executePlan(plan, "test", client)).rejects.toBeInstanceOf(PlanError);
      expect(invalidated).toEqual([]);
    }
  });

  it("UT-PLAN-028 a plan that fails mid-way invalidates only the steps that succeeded", async () => {
    const { client, raw } = stubClient();
    raw.deleteRecordAsync.mockResolvedValueOnce(fail("boom") as never);
    const plan = planOf(
      { op: "update", entitySet: "vsb_projects", id: "p-1", data: {}, reason: "first" },
      { op: "delete", entitySet: "vsb_capexcosts", id: "c-9", reason: "second" },
      { op: "update", entitySet: "vsb_opexcosts", id: "o-1", data: {}, reason: "third" },
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.done).toBe(1);
    expect(invalidated).toEqual(["vsb_projects"]);
  });

  it("UT-PLAN-029 a refused plan invalidates nothing", async () => {
    const { client } = stubClient();
    await expect(executePlan(refusePlan("no"), "test", client)).rejects.toBeInstanceOf(PlanRefusedError);
    expect(invalidated).toEqual([]);
  });

  it("UT-PLAN-030 guarded update: an accepted PATCH invalidates; a gone row (read empty, or PATCH 404) sends nothing and does NOT", async () => {
    await executePlan(planOf(guardedUpdate(SET, ROW, { vsb_name: "A" }, "ok")), "test", guardedStub().client);
    expect(invalidated).toEqual([SET]);

    invalidated.length = 0;
    const gone = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "x")), "test", guardedStub({ gone: [ROW] }).client)
      .catch((e: unknown) => e)) as PlanError;
    expect(gone.gone).toBe(true);
    expect(invalidated).toEqual([]);

    const raced = (await executePlan(planOf(guardedUpdate(SET, ROW, {}, "x")), "test", guardedStub({ patchStatus: 404 }).client)
      .catch((e: unknown) => e)) as PlanError;
    expect(raced.gone).toBe(true);
    expect(invalidated).toEqual([]);
  });

  it("UT-PLAN-031 a create the server accepted but returned no id still invalidates: the row exists although the step failed", async () => {
    const { client, raw } = stubClient();
    raw.createRecordAsync.mockResolvedValueOnce(ok({}) as never);
    const err = (await executePlan(planOf({ op: "create", entitySet: SET, data: {}, reason: "make" }), "op", client)
      .catch((e: unknown) => e)) as PlanError;
    expect(err.cause).toBeInstanceOf(CreatedIdMissingError);
    expect(invalidated).toEqual([SET]);
  });
});
