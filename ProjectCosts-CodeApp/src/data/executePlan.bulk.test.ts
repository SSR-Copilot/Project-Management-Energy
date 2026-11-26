/**
 * UT-PLAN-100.. — the write-plan engine of the Generators bulk programme: tiered `together()` groups,
 * `createMany` / `updateMany` steps through a fake bulk backend (`setBulkBackend`), row-level counting, and the
 * landed-row record for rollback. Single-write behaviour stays pinned by `executePlan.test.ts` (UT-PLAN-001..063).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `invalidatePageTokens` is spied on; everything else in `./client` is kept.
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

import {
  BulkBackendValidationError, BulkBatchError, BulkRowsGoneError, setBulkBackend,
  type BulkBackend, type BulkCallOptions, type BulkRow,
} from "./bulkBackend";
import { CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, WRITE_CONCURRENCY } from "./concurrency";
import {
  CreatedIdMissingError, executePlan, PlanError, PlanRefusedError, type PlanClient,
} from "./executePlan";
import { writeErrorMessage } from "./usePlanWrite";
import {
  CREATED_ROW_ID, createdRowRef, createMany, emptyPlan, together, updateMany, type PlannedWrite,
} from "./writePlan";

const ok = <T,>(data: T) => ({ success: true as const, data });
const SET = "vsb_landleaseallocationwtgs";
const OBU = { "owningbusinessunit@odata.bind": "/businessunits(bu-1)" };
const row = (id: string, data: Record<string, unknown> = {}): BulkRow => ({ id, data: { ...OBU, ...data } });

function stubClient() {
  const calls: string[] = [];
  let n = 0;
  const client = {
    createRecordAsync: vi.fn(async (table: string, data: Record<string, unknown>) => {
      calls.push(`create ${table} ${JSON.stringify(data)}`);
      n += 1;
      return ok({ vsb_capexaccountlistid: `single-${n}` });
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

/** A fake backend that records every call and answers with the input ids; tests override the methods. */
function fakeBackend() {
  const calls: string[] = [];
  const sent: { op: string; entitySet: string; rows: BulkRow[]; label?: string }[] = [];
  const backend: BulkBackend = {
    createMany: vi.fn(async (entitySet: string, rows: readonly BulkRow[], opts?: BulkCallOptions) => {
      calls.push(`createMany ${entitySet} ${rows.length}`);
      sent.push({ op: "createMany", entitySet, rows: [...rows], label: opts?.label });
      return { ids: rows.map((r) => r.id), requests: 1 };
    }),
    updateMany: vi.fn(async (entitySet: string, rows: readonly BulkRow[], opts?: BulkCallOptions) => {
      calls.push(`updateMany ${entitySet} ${rows.length}`);
      sent.push({ op: "updateMany", entitySet, rows: [...rows], label: opts?.label });
      return { requests: 1 };
    }),
  };
  return { backend, calls, sent };
}

const deletes = (n: number, entitySet = "vsb_capexcosts"): PlannedWrite[] =>
  Array.from({ length: n }, (_, i) => ({ op: "delete" as const, entitySet, id: `d-${i}`, reason: `d${i}` }));

/** Runs `plan` with delete stubs that record the in-flight peak. */
async function peakOf(writes: PlannedWrite[]) {
  const { client, raw } = stubClient();
  let inFlight = 0;
  let peak = 0;
  raw.deleteRecordAsync.mockImplementation(async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return ok(undefined) as never;
  });
  const plan = emptyPlan();
  plan.writes.push(...writes);
  await executePlan(plan, "test", client);
  return peak;
}

beforeEach(() => {
  invalidated.length = 0;
});
afterEach(() => setBulkBackend(null));

describe("tiered together() groups", () => {
  it("UT-PLAN-100 the tiers are exported: leaf deletes 16, cascade deletes 4, default writes 8", () => {
    expect([LEAF_DELETE_CONCURRENCY, CASCADE_DELETE_CONCURRENCY, WRITE_CONCURRENCY]).toEqual([16, 4, 8]);
  });

  it("UT-PLAN-101 a group of 40 deletes with limit 16 peaks at 16", async () => {
    expect(await peakOf(together(deletes(40), { limit: LEAF_DELETE_CONCURRENCY }))).toBe(16);
  });

  it("UT-PLAN-102 a group of 40 deletes with limit 4 peaks at 4", async () => {
    expect(await peakOf(together(deletes(40), { limit: CASCADE_DELETE_CONCURRENCY }))).toBe(4);
  });

  it("UT-PLAN-103 together() without options keeps the default limit of 8 and adds no limit field", async () => {
    const group = together(deletes(40));
    expect(group.every((w) => w.concurrent === true && w.concurrencyLimit === undefined)).toBe(true);
    expect(await peakOf(group)).toBe(8);
  });

  it("UT-PLAN-104 consecutive groups with different limits are separate sequential runs, each held to its own limit", async () => {
    const { client, raw } = stubClient();
    const live = { leaf: 0, casc: 0 };
    const peaks = { leaf: 0, casc: 0 };
    const events: string[] = [];
    raw.deleteRecordAsync.mockImplementation(async (_t: string, id: string) => {
      const tier = id.startsWith("leaf-") ? "leaf" : "casc";
      live[tier] += 1;
      peaks[tier] = Math.max(peaks[tier], live[tier]);
      events.push(tier);
      await new Promise((r) => setTimeout(r, 5));
      live[tier] -= 1;
      return ok(undefined) as never;
    });
    const plan = emptyPlan();
    plan.writes.push(
      ...together(deletes(20).map((w) => ({ ...w, id: `leaf-${w.id}` })), { limit: 16 }),
      ...together(deletes(10).map((w) => ({ ...w, id: `casc-${w.id}` })), { limit: 4 }),
    );
    await executePlan(plan, "test", client);
    expect(peaks).toEqual({ leaf: 16, casc: 4 });
    // Sequential: every leaf delete started before the first cascade delete.
    expect(events.indexOf("casc")).toBe(20);
  });

  it("UT-PLAN-105 two adjacent together() calls are two groups even with the same limit: the second starts after the first finished", async () => {
    const { client, raw } = stubClient();
    const live = { a: 0, b: 0 };
    const peaks = { a: 0, b: 0 };
    let bStartedWhileAOpen = false;
    raw.deleteRecordAsync.mockImplementation(async (_t: string, id: string) => {
      const g = id.startsWith("a-") ? "a" : "b";
      live[g] += 1;
      peaks[g] = Math.max(peaks[g], live[g]);
      if (g === "b" && live.a > 0) bStartedWhileAOpen = true;
      await new Promise((r) => setTimeout(r, 5));
      live[g] -= 1;
      return ok(undefined) as never;
    });
    const plan = emptyPlan();
    plan.writes.push(
      ...together(deletes(6).map((w) => ({ ...w, id: `a-${w.id}` })), { limit: 3 }),
      ...together(deletes(6).map((w) => ({ ...w, id: `b-${w.id}` })), { limit: 3 }),
    );
    await expect(executePlan(plan, "test", client)).resolves.toMatchObject({ done: 12 });
    expect(bStartedWhileAOpen).toBe(false);
    expect(peaks).toEqual({ a: 3, b: 3 });
  });

  it("UT-PLAN-107 adjacent groups 16 then 4 peak at 16 then 4 in order, and a failure in the first group stops before the second", async () => {
    const { client, raw } = stubClient();
    const live = { leaf: 0, casc: 0 };
    const peaks = { leaf: 0, casc: 0 };
    const order: string[] = [];
    raw.deleteRecordAsync.mockImplementation(async (_t: string, id: string) => {
      const tier = id.startsWith("leaf-") ? "leaf" : "casc";
      live[tier] += 1;
      peaks[tier] = Math.max(peaks[tier], live[tier]);
      order.push(tier);
      await new Promise((r) => setTimeout(r, 5));
      live[tier] -= 1;
      if (id === "leaf-d-3") return { success: false as const, data: undefined, error: { message: "boom", status: 500 } } as never;
      return ok(undefined) as never;
    });
    const build = () => {
      const plan = emptyPlan();
      plan.writes.push(
        ...together(deletes(40).map((w) => ({ ...w, id: `leaf-${w.id}` })), { limit: LEAF_DELETE_CONCURRENCY }),
        ...together(deletes(40).map((w) => ({ ...w, id: `casc-${w.id}` })), { limit: CASCADE_DELETE_CONCURRENCY }),
      );
      return plan;
    };
    // First, with the failing leaf delete: the cascade group never starts.
    const err = (await executePlan(build(), "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(order.includes("casc")).toBe(false);
    // Then a clean run: 16 then 4, in order.
    raw.deleteRecordAsync.mockImplementation(async (_t: string, id: string) => {
      const tier = id.startsWith("leaf-") ? "leaf" : "casc";
      live[tier] += 1;
      peaks[tier] = Math.max(peaks[tier], live[tier]);
      order.push(tier);
      await new Promise((r) => setTimeout(r, 5));
      live[tier] -= 1;
      return ok(undefined) as never;
    });
    order.length = 0;
    peaks.leaf = 0;
    peaks.casc = 0;
    await executePlan(build(), "test", client);
    expect(peaks).toEqual({ leaf: 16, casc: 4 });
    expect(order.indexOf("casc")).toBe(40);
  });

  it("UT-PLAN-106 a limit that is not a whole number of at least 1 is a programmer error", () => {
    expect(() => together(deletes(2), { limit: 0 })).toThrow(/limit must be a whole number/);
    expect(() => together(deletes(2), { limit: 2.5 })).toThrow(/limit must be a whole number/);
  });
});

describe("bulk steps in a plan", () => {
  it("UT-PLAN-110 a bulk step runs once, in plan order between single writes, through the backend", async () => {
    const { client, raw } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const events: string[] = [];
    raw.createRecordAsync.mockImplementation(async () => { events.push("create"); return ok({ vsb_capexaccountlistid: "t-0" }) as never; });
    raw.updateRecordAsync.mockImplementation(async () => { events.push("update"); return ok({}) as never; });
    (fake.backend.createMany as ReturnType<typeof vi.fn>).mockImplementation(async (_s: string, rows: BulkRow[]) => {
      events.push("bulk");
      return { ids: rows.map((r) => r.id), requests: 1 };
    });
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: { vsb_name: "T" }, reason: "type" },
      createMany(SET, [row("a-1"), row("a-2")], "allocations"),
      { op: "update", entitySet: "vsb_projects", id: "p-1", data: { x: 1 }, reason: "roll-up" },
    );
    const result = await executePlan(plan, "test", client);
    expect(events).toEqual(["create", "bulk", "update"]);
    expect(fake.backend.createMany).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(4);
  });

  it("UT-PLAN-111 createdRowRef placeholders are substituted per row, in data strings and in a row id, from earlier steps", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "type" },
      createMany(SET, [
        row("t-1", { "vsb_Type@odata.bind": `/vsb_capexaccountlists(${createdRowRef(0)})`, n: 1, note: "plain" }),
        row("t-2", { "vsb_Type@odata.bind": `/vsb_capexaccountlists(${createdRowRef(0)})`, n: 2 }),
      ], "turbines"),
      updateMany(SET, [{ id: createdRowRef(1), data: { "vsb_Self@odata.bind": `/${SET}(${createdRowRef(2)})` } }], "touch"),
    );
    await executePlan(plan, "test", client);
    expect(fake.sent[0]!.rows.map((r) => r.data["vsb_Type@odata.bind"])).toEqual([
      "/vsb_capexaccountlists(single-1)", "/vsb_capexaccountlists(single-1)",
    ]);
    expect(fake.sent[0]!.rows[0]!.data).toMatchObject({ n: 1, note: "plain" });
    // createdIds = [single-1, t-1, t-2]: ref 1 is t-1, ref 2 is t-2.
    expect(fake.sent[1]).toMatchObject({ op: "updateMany", rows: [{ id: "t-1", data: { "vsb_Self@odata.bind": `/${SET}(t-2)` } }] });
  });

  it("UT-PLAN-112 a placeholder for a create that has not run fails the step with the single-write wording, sending nothing", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a", { b: createdRowRef(4) })], "bad ref"));
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as Error;
    // dvopt T-15 (WE-06): refused before the plan starts (a PlanShapeError; was a PlanError at send time), same wording.
    expect(err.name).toBe("PlanShapeError");
    expect(err.message).toMatch(/refers to created row 4/);
    expect(fake.calls).toEqual([]);
  });

  it("UT-PLAN-113 created ids are appended in input-row order and a later single write sees them", async () => {
    const { client, calls } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    // The backend answers in a different order than the rows were given only if it chose to; the contract is input order.
    const plan = emptyPlan();
    plan.writes.push(
      createMany(SET, [row("c"), row("a"), row("b")], "rows"),
      { op: "update", entitySet: "vsb_projects", id: CREATED_ROW_ID, data: {}, reason: "latest" },
      { op: "update", entitySet: "vsb_projects", id: createdRowRef(1), data: { ref: createdRowRef(0) }, reason: "by ref" },
    );
    const result = await executePlan(plan, "test", client);
    expect(result.createdIds).toEqual(["c", "a", "b"]);
    expect(calls).toEqual(["update vsb_projects b {}", 'update vsb_projects a {"ref":"c"}']);
  });

  it("UT-PLAN-114 a bulk step cannot be part of a together() group: building it throws", () => {
    expect(() => together([createMany(SET, [row("a")], "x")])).toThrow(/bulk operation .*cannot be part of a concurrent group/);
    expect(() => together([updateMany(SET, [row("a")], "x")])).toThrow(/bulk operation/);
  });

  it("UT-PLAN-115 a hand-built plan with a concurrent or guarded bulk step is refused BEFORE anything is sent", async () => {
    const { client, calls } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    for (const bad of [
      { ...createMany(SET, [row("a")], "grouped"), concurrent: true },
      { ...updateMany(SET, [row("a")], "guarded"), guarded: true },
    ]) {
      const plan = emptyPlan();
      plan.writes.push({ op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "first" }, bad);
      const err = await executePlan(plan, "test", client).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(PlanError);
      expect((err as Error).message).toMatch(/bulk operation/);
    }
    expect(calls).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("UT-PLAN-116 invalidatePageTokens runs once per bulk step, for the bulk entity set", async () => {
    const { client } = stubClient();
    setBulkBackend(fakeBackend().backend);
    const plan = emptyPlan();
    plan.writes.push(
      createMany(SET, [row("a"), row("b"), row("c")], "create"),
      updateMany("vsb_generatorinprojects", [row("g1"), row("g2")], "update"),
    );
    await executePlan(plan, "test", client);
    expect(invalidated).toEqual([SET, "vsb_generatorinprojects"]);
  });

  it("UT-PLAN-117 an empty bulk step sends nothing and counts nothing", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [], "none"), updateMany(SET, [], "none"));
    await expect(executePlan(plan, "test", client)).resolves.toMatchObject({ done: 0, createdIds: [], landed: [] });
    expect(fake.calls).toEqual([]);
    expect(invalidated).toEqual([]);
  });

  it("UT-PLAN-118 the backend gets the step's label (default `operation: reason`, or the write's own label)", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a")], "allocations"), updateMany(SET, [row("a")], "status", "pinned label"));
    await executePlan(plan, "Add type", client);
    expect(fake.sent.map((s) => s.label)).toEqual(["Add type: allocations", "pinned label"]);
  });
});

describe("bulk failures", () => {
  it("UT-PLAN-120 a failed chunk counts ROWS: done = single writes + rows that landed, total = every row of the plan", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    (fake.backend.createMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new BulkBatchError("chunk 2 of 3 failed", { rowsLanded: 3, rowsTotal: 5, landedIds: ["r1", "r2", "r3"] }),
    );
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "type" },
      createMany(SET, ["r1", "r2", "r3", "r4", "r5"].map((id) => row(id)), "allocations"),
      { op: "update", entitySet: "vsb_projects", id: "p", data: {}, reason: "roll-up" },
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect([err.done, err.total, err.failedReason]).toEqual([4, 7, "allocations"]);
    expect(err.createdIds).toEqual(["single-1", "r1", "r2", "r3"]);
    expect(writeErrorMessage(err, "save")).toBe("“allocations” failed: chunk 2 of 3 failed. 4 of 7 changes had already been saved.");
    expect(invalidated).toContain(SET);
  });

  it("UT-PLAN-121 a bulk failure with no row landed reports only the earlier writes and does not invalidate the bulk set", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    (fake.backend.updateMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new BulkBatchError("first chunk failed", { rowsLanded: 0, rowsTotal: 2 }),
    );
    const plan = emptyPlan();
    plan.writes.push(
      { op: "update", entitySet: "vsb_projects", id: "p", data: {}, reason: "first" },
      updateMany("vsb_generatorinprojects", [row("g1"), row("g2")], "status"),
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect([err.done, err.total]).toEqual([1, 3]);
    expect(invalidated).toEqual(["vsb_projects"]);
  });

  it("UT-PLAN-122 BulkRowsGoneError becomes a PlanError that is rowsGone, and reaches the user as its own message (with the prefix)", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const gone = new BulkRowsGoneError(["g1", "g2"]);
    (fake.backend.updateMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(gone);
    const plan = emptyPlan();
    plan.writes.push(
      { op: "update", entitySet: "vsb_projects", id: "p", data: {}, reason: "first" },
      updateMany("vsb_generatorinprojects", [row("g1"), row("g2")], "status"),
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.rowsGone).toBe(true);
    expect(err.cause).toBe(gone);
    expect([err.done, err.total]).toEqual([1, 3]);
    // Mid-plan (1 of 3 changes already sent): the saved-count sentence follows the rows-gone text (F2, finding 1).
    const saved = "2 row(s) no longer exist. Reload the page and try again. 1 of 3 changes had already been saved.";
    expect(writeErrorMessage(err, "save")).toBe(saved);
    expect(writeErrorMessage(err, "save", (d) => `Failed: ${d}`)).toBe(`Failed: ${saved}`);
    expect(writeErrorMessage(gone, "save")).toBe("2 row(s) no longer exist. Reload the page and try again.");
  });

  it("UT-PLAN-123 a validation refusal with nothing landed is a PlanRefusedError; after something landed it is a PlanError", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const refusal = () => new BulkBackendValidationError("row a: owningbusinessunit@odata.bind is missing");
    (fake.backend.createMany as ReturnType<typeof vi.fn>).mockRejectedValue(refusal());
    const first = emptyPlan();
    first.writes.push(createMany(SET, [row("a")], "allocations"));
    const refused = await executePlan(first, "test", client).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PlanRefusedError);
    expect((refused as Error).message).toBe("row a: owningbusinessunit@odata.bind is missing");

    const second = emptyPlan();
    second.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "type" },
      createMany(SET, [row("a")], "allocations"),
    );
    const partial = (await executePlan(second, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(partial).toBeInstanceOf(PlanError);
    expect([partial.done, partial.total]).toEqual([1, 2]);
    expect(partial.landed).toEqual([{ entitySet: "vsb_capexaccountlists", id: "single-1" }]);
  });

  it("UT-PLAN-124 an unknown backend failure is a PlanError carrying the cause, with the count unchanged", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    const boom = new Error("network down");
    (fake.backend.createMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(boom);
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a"), row("b")], "allocations"));
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect([err.done, err.total, err.cause]).toEqual([0, 2, boom]);
    expect(err.landed).toEqual([]);
  });

  it("UT-PLAN-125 a backend that answers with too few ids fails with CreatedIdMissingError, and the ids it did return are recorded as landed", async () => {
    const { client } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    (fake.backend.createMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ids: ["a"], requests: 1 });
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a"), row("b")], "allocations"));
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.cause).toBeInstanceOf(CreatedIdMissingError);
    expect(err.landed).toEqual([{ entitySet: SET, id: "a" }]);
  });

  it("UT-PLAN-126 a backend that cannot be used (it throws a plain Error) is a PlanError naming the cause, not a crash", async () => {
    // Integration change: the transport package installs a real default backend lazily, so
    // "no backend installed" no longer exists. The same engine path (a plain Error from the
    // backend becomes a PlanError) is pinned with a backend that throws.
    const { client } = stubClient();
    setBulkBackend({
      createMany: async () => {
        throw new Error("No bulk backend is available");
      },
      updateMany: async () => ({ requests: 0 }),
    });
    const plan = emptyPlan();
    plan.writes.push(createMany(SET, [row("a")], "allocations"));
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err).toBeInstanceOf(PlanError);
    expect(err.message).toMatch(/No bulk backend is available/);
    setBulkBackend(null);
  });
});

describe("landed rows", () => {
  it("UT-PLAN-130 after success `landed` lists single, bulk and concurrent creates in landing order; updates and deletes are not listed", async () => {
    const { client, raw } = stubClient();
    let n = 0;
    raw.createRecordAsync.mockImplementation(async () => {
      n += 1;
      return ok({ vsb_capexaccountlistid: `s-${n}` }) as never;
    });
    setBulkBackend(fakeBackend().backend);
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "type" },
      createMany(SET, [row("t-1"), row("t-2")], "turbines"),
      ...together([
        { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "p1" },
        { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "p2" },
      ]),
      { op: "update", entitySet: "vsb_projects", id: "p", data: {}, reason: "roll-up" },
      { op: "delete", entitySet: "vsb_capexcosts", id: "x", reason: "del" },
    );
    const result = await executePlan(plan, "test", client);
    expect(result.landed).toEqual([
      { entitySet: "vsb_capexaccountlists", id: "s-1" },
      { entitySet: SET, id: "t-1" },
      { entitySet: SET, id: "t-2" },
      { entitySet: "vsb_capexaccountlists", id: "s-2" },
      { entitySet: "vsb_capexaccountlists", id: "s-3" },
    ]);
    expect(result.landed.map((l) => l.id)).toEqual(result.createdIds);
  });

  it("UT-PLAN-131 after a mid-plan failure `PlanError.landed` has everything that landed before it, in order", async () => {
    const { client, raw } = stubClient();
    const fake = fakeBackend();
    setBulkBackend(fake.backend);
    (fake.backend.createMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ids: ["t-1", "t-2"], requests: 1 })
      .mockRejectedValueOnce(new BulkBatchError("chunk failed", { rowsLanded: 1, rowsTotal: 3, landedIds: ["a-1"] }));
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "type" },
      createMany(SET, [row("t-1"), row("t-2")], "turbines"),
      createMany("vsb_landleaseallocationwtgs", [row("a-1"), row("a-2"), row("a-3")], "allocations"),
      { op: "update", entitySet: "vsb_projects", id: "p", data: {}, reason: "never sent" },
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.landed).toEqual([
      { entitySet: "vsb_capexaccountlists", id: "single-1" },
      { entitySet: SET, id: "t-1" },
      { entitySet: SET, id: "t-2" },
      { entitySet: SET, id: "a-1" },
    ]);
    expect([err.done, err.total]).toEqual([4, 7]);
    expect(raw.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-PLAN-132 a single create that fails mid-plan leaves the earlier creates in `landed` (a failing single write adds none)", async () => {
    const { client, raw } = stubClient();
    raw.createRecordAsync
      .mockImplementationOnce(async () => ok({ vsb_capexaccountlistid: "first" }) as never)
      .mockImplementationOnce(async () => ({ success: false as const, data: undefined, error: { message: "boom", status: 500 } }) as never);
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "one" },
      { op: "create", entitySet: "vsb_capexaccountlists", data: {}, reason: "two" },
    );
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.landed).toEqual([{ entitySet: "vsb_capexaccountlists", id: "first" }]);
    expect(err.createdIds).toEqual(["first"]);
  });

  it("UT-PLAN-133 a failed concurrent run still records the creates of its writes that landed", async () => {
    const { client, raw } = stubClient();
    let n = 0;
    raw.createRecordAsync.mockImplementation(async () => {
      n += 1;
      if (n === 2) return { success: false as const, data: undefined, error: { message: "boom", status: 500 } } as never;
      return ok({ vsb_capexaccountlistid: `c-${n}` }) as never;
    });
    const plan = emptyPlan();
    plan.writes.push(...together([1, 2, 3].map((i) => ({
      op: "create" as const, entitySet: "vsb_capexaccountlists", data: {}, reason: `r${i}`,
    }))));
    const err = (await executePlan(plan, "test", client).catch((e: unknown) => e)) as PlanError;
    expect(err.landed).toEqual([
      { entitySet: "vsb_capexaccountlists", id: "c-1" },
      { entitySet: "vsb_capexaccountlists", id: "c-3" },
    ]);
    expect([err.done, err.total]).toEqual([2, 3]);
  });
});

describe("single writes are unchanged", () => {
  it("UT-PLAN-140 a plan with no bulk step counts writes, not rows, and sends exactly what it did before", async () => {
    const { client, calls } = stubClient();
    const plan = emptyPlan();
    plan.writes.push(
      { op: "create", entitySet: "vsb_capexaccountlists", data: { vsb_name: "A" }, reason: "create" },
      { op: "update", entitySet: "vsb_capexaccountlists", id: CREATED_ROW_ID, data: { statecode: 1 }, reason: "status" },
    );
    const result = await executePlan(plan, "test", client);
    expect(result).toMatchObject({ done: 2, createdIds: ["single-1"] });
    expect(calls).toEqual(['create vsb_capexaccountlists {"vsb_name":"A"}', 'update vsb_capexaccountlists single-1 {"statecode":1}']);
  });
});
