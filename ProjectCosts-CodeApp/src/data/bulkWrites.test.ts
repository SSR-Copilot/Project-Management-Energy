/**
 * The bulk executor (`./bulkWrites.ts`): target shape, validation, chunking, sequential
 * failure accounting, and the delete phase's attempt-everything-then-throw contract.
 *
 * Fake transports and deleters only; nothing here reaches the SDK.
 */
import { describe, expect, it } from "vitest";
import type { IOperationResult } from "@microsoft/power-apps/data";
import type { BulkTableInfo, BulkUpsertTransport, UpsertTarget } from "./bulkTypes";
import {
  BulkDeleteError,
  BulkPartialWriteError,
  BulkValidationError,
  BulkWriteError,
  DEFAULT_BULK_CHUNK,
  MIN_PARALLEL_CHUNK,
  deleteMany,
  identify,
  parallelChunkSize,
  toUpsertTargets,
  upsertMultiple,
} from "./bulkWrites";
import { DataError } from "../platform/errors";

const TABLE: BulkTableInfo = {
  entitySetName: "vsb_capexcosts",
  logicalName: "vsb_capexcost",
  primaryKey: "vsb_capexcostid",
};

const row = (i: number, fields: Record<string, unknown> = { vsb_amount: i }): UpsertTarget => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  isNew: false,
  fields,
});
const rows = (n: number): UpsertTarget[] => Array.from({ length: n }, (_, i) => row(i));

const ok = (): IOperationResult<unknown> => ({ success: true, data: {} } as IOperationResult<unknown>);
const fail = (message = "refused"): IOperationResult<unknown> =>
  ({ success: false, data: undefined, error: new Error(message) } as unknown as IOperationResult<unknown>);

/** Records every call; `results` decides each call's outcome by 0-based call index. */
function fakeTransport(results: (call: number) => IOperationResult<unknown> = ok) {
  const calls: { entitySetName: string; targets: readonly Record<string, unknown>[] }[] = [];
  const transport: BulkUpsertTransport = async (entitySetName, targets) => {
    const call = calls.length;
    calls.push({ entitySetName, targets });
    await Promise.resolve();
    return results(call);
  };
  return { transport, calls };
}

describe("toUpsertTargets / identify", () => {
  it("UT-BULK-001 builds @odata.type, the primary key and the fields, and nothing else", () => {
    const [target] = toUpsertTargets(TABLE, [row(7, { vsb_amount: 12.5, "vsb_Contract@odata.bind": "/vsb_contracts(x)" })]);
    expect(target).toEqual({
      "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost",
      vsb_capexcostid: "00000000-0000-0000-0000-000000000007",
      vsb_amount: 12.5,
      "vsb_Contract@odata.bind": "/vsb_contracts(x)",
    });
  });

  it("UT-BULK-002 identify() names the record by its primary key", () => {
    expect(identify(TABLE, "abc")).toEqual({ vsb_capexcostid: "abc" });
  });

  it("UT-BULK-003 rejects a duplicate id (case-insensitive) before anything is built", () => {
    const a = row(1);
    const b = { ...row(2), id: a.id.toUpperCase() };
    expect(() => toUpsertTargets(TABLE, [a, b])).toThrow(/more than once/);
  });

  it("UT-BULK-004 rejects the primary key inside fields", () => {
    expect(() => toUpsertTargets(TABLE, [row(1, { vsb_capexcostid: "x" })])).toThrow(/vsb_capexcostid/);
  });

  it("UT-BULK-005 rejects @odata.type inside fields", () => {
    expect(() => toUpsertTargets(TABLE, [row(1, { "@odata.type": "x" })])).toThrow(/@odata\.type/);
  });

  it("UT-BULK-006 rejects @odata.id inside fields", () => {
    expect(() => toUpsertTargets(TABLE, [row(1, { "@odata.id": "x" })])).toThrow(/@odata\.id/);
  });

  it("UT-BULK-007 rejects an empty id", () => {
    expect(() => toUpsertTargets(TABLE, [{ id: "", isNew: true, fields: {} }])).toThrow(/no id/);
  });
});

describe("upsertMultiple", () => {
  it("UT-BULK-010 DEFAULT_BULK_CHUNK is 500, inside the 100–1,000 guidance", () => {
    expect(DEFAULT_BULK_CHUNK).toBe(500);
  });

  it.each([
    ["UT-BULK-011", 0, 0],
    ["UT-BULK-012", 1, 1],
    ["UT-BULK-013", 499, 1],
    ["UT-BULK-014", 500, 1],
    ["UT-BULK-015", 501, 2],
    ["UT-BULK-016", 1000, 2],
    ["UT-BULK-017", 1001, 3],
  ])("%s %i rows at size 500 → %i request(s)", async (_id, n, expected) => {
    const { transport, calls } = fakeTransport();
    const result = await upsertMultiple(TABLE, rows(n), transport);
    expect(result).toEqual({ requests: expected, rows: n });
    expect(calls).toHaveLength(expected);
    expect(calls.reduce((sum, c) => sum + c.targets.length, 0)).toBe(n);
    for (const c of calls) {
      expect(c.entitySetName).toBe("vsb_capexcosts");
      expect(c.targets.length).toBeLessThanOrEqual(500);
    }
  });

  it("UT-BULK-018 honours a custom chunkSize", async () => {
    const { transport, calls } = fakeTransport();
    const result = await upsertMultiple(TABLE, rows(250), transport, { chunkSize: 100 });
    expect(result).toEqual({ requests: 3, rows: 250 });
    expect(calls.map((c) => c.targets.length)).toEqual([100, 100, 50]);
  });

  it("UT-BULK-019 rejects a non-positive chunkSize without sending", async () => {
    const { transport, calls } = fakeTransport();
    await expect(upsertMultiple(TABLE, rows(3), transport, { chunkSize: 0 })).rejects.toThrow(/chunkSize/);
    expect(calls).toHaveLength(0);
  });

  it("UT-BULK-020 sends chunks sequentially, in order, never two in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const firstIds: unknown[] = [];
    const transport: BulkUpsertTransport = async (_set, targets) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      firstIds.push(targets[0]?.["vsb_capexcostid"]);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return ok();
    };
    await upsertMultiple(TABLE, rows(25), transport, { chunkSize: 10 });
    expect(maxInFlight).toBe(1);
    expect(firstIds).toEqual([row(0).id, row(10).id, row(20).id]);
  });

  it("UT-BULK-021 a failure in chunk 2 of 3 stops chunk 3 and reports the committed prefix", async () => {
    const { transport, calls } = fakeTransport((call) => (call === 1 ? fail("429 throttled") : ok()));
    const error = await upsertMultiple(TABLE, rows(25), transport, { chunkSize: 10, label: "save costs" })
      .catch((e: unknown) => e);
    expect(calls).toHaveLength(2);
    expect(error).toBeInstanceOf(BulkWriteError);
    const e = error as BulkWriteError;
    expect(e.label).toBe("save costs");
    expect(e.table).toBe("vsb_capexcosts");
    expect(e.chunkIndex).toBe(1);
    expect(e.chunksCommitted).toBe(1);
    expect(e.rowsCommitted).toBe(10);
    expect(e.message).toContain("429 throttled");
  });

  it("UT-BULK-022 a {success:false} result is unwrapped into a DataError cause", async () => {
    const { transport } = fakeTransport(() => fail("forbidden"));
    const error = (await upsertMultiple(TABLE, rows(1), transport).catch((e: unknown) => e)) as BulkWriteError;
    expect(error).toBeInstanceOf(BulkWriteError);
    expect(error.cause).toBeInstanceOf(DataError);
    expect((error.cause as DataError).message).toContain("forbidden");
    expect(error.chunksCommitted).toBe(0);
    expect(error.rowsCommitted).toBe(0);
  });

  it("UT-BULK-023 a transport that throws is reported the same way", async () => {
    const boom = new Error("network down");
    const transport: BulkUpsertTransport = async () => { throw boom; };
    const error = (await upsertMultiple(TABLE, rows(3), transport).catch((e: unknown) => e)) as BulkWriteError;
    expect(error).toBeInstanceOf(BulkWriteError);
    expect(error.cause).toBe(boom);
  });

  it("UT-BULK-024 a duplicate in the LAST chunk fails before the first chunk is sent", async () => {
    const { transport, calls } = fakeTransport();
    const list = [...rows(12), row(0)];
    await expect(upsertMultiple(TABLE, list, transport, { chunkSize: 5 })).rejects.toThrow(/more than once/);
    expect(calls).toHaveLength(0);
  });
});

describe("BulkValidationError (nothing sent, nothing committed)", () => {
  const dup = () => {
    const a = row(1);
    return [a, row(2), { ...row(3), id: a.id.toUpperCase() }];
  };

  it.each<[string, () => UpsertTarget[], RegExp]>([
    ["UT-BULK-040 duplicate id", dup, /more than once/],
    ["UT-BULK-041 empty id", () => [row(1), { id: "  ", isNew: true, fields: {} }], /no id/],
    ["UT-BULK-042 primary key in fields", () => [row(1, { vsb_capexcostid: "x" })], /vsb_capexcostid/],
    ["UT-BULK-043 @odata.type in fields", () => [row(1, { "@odata.type": "x" })], /@odata\.type/],
    ["UT-BULK-044 @odata.id in fields", () => [row(1, { "@odata.id": "x" })], /@odata\.id/],
  ])("%s: upsertMultiple throws BulkValidationError, 0 committed, transport never called", async (_id, input, reason) => {
    const { transport, calls } = fakeTransport();
    const error = await upsertMultiple(TABLE, input(), transport, { label: "save costs" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulkValidationError);
    expect(error).not.toBeInstanceOf(BulkWriteError);
    const e = error as BulkValidationError;
    expect(e.name).toBe("BulkValidationError");
    expect(e.label).toBe("save costs");
    expect(e.table).toBe("vsb_capexcosts");
    expect(e.reason).toMatch(reason);
    expect(e.message).toMatch(reason);
    expect(e.rowsCommitted).toBe(0);
    expect(e.chunksCommitted).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("UT-BULK-045 a bad chunkSize is a BulkValidationError, transport never called", async () => {
    const { transport, calls } = fakeTransport();
    const error = (await upsertMultiple(TABLE, rows(3), transport, { chunkSize: -1 })
      .catch((e: unknown) => e)) as BulkValidationError;
    expect(error).toBeInstanceOf(BulkValidationError);
    expect(error.label).toBe("upsert vsb_capexcost");
    expect(error.reason).toMatch(/chunkSize/);
    expect(error.rowsCommitted).toBe(0);
    expect(error.chunksCommitted).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("UT-BULK-046 toUpsertTargets standalone throws BulkValidationError labelled \"validate\"", () => {
    let caught: unknown;
    try {
      toUpsertTargets(TABLE, dup());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BulkValidationError);
    const e = caught as BulkValidationError;
    expect(e.label).toBe("validate");
    expect(e.table).toBe("vsb_capexcosts");
    expect(e.rowsCommitted).toBe(0);
    expect(e.chunksCommitted).toBe(0);
  });

  it("UT-BULK-047 a duplicate in the LAST chunk is a BulkValidationError before chunk 1 is sent", async () => {
    const { transport, calls } = fakeTransport();
    const error = await upsertMultiple(TABLE, [...rows(12), row(0)], transport, { chunkSize: 5 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulkValidationError);
    expect((error as BulkValidationError).rowsCommitted).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("upsertMultiple, parallel > 1", () => {
  const sizes = (calls: { targets: readonly unknown[] }[]) => calls.map((c) => c.targets.length);

  it("UT-BULK-050 MIN_PARALLEL_CHUNK is 25", () => {
    expect(MIN_PARALLEL_CHUNK).toBe(25);
  });

  it.each<[string, number, number, number | undefined, number[]]>([
    ["UT-BULK-051", 40, 4, undefined, [40]],
    ["UT-BULK-052", 49, 4, undefined, [49]],
    ["UT-BULK-053", 100, 4, undefined, [25, 25, 25, 25]],
    ["UT-BULK-054", 1000, 4, undefined, [250, 250, 250, 250]],
    ["UT-BULK-055", 2500, 4, 500, [500, 500, 500, 500, 500]],
    ["UT-BULK-056", 60, 8, undefined, [25, 25, 10]],
  ])("%s %i rows, parallel %i, max %s → chunks %j", async (_id, n, parallel, chunkSize, expected) => {
    const { transport, calls } = fakeTransport();
    const result = await upsertMultiple(TABLE, rows(n), transport, { parallel, chunkSize });
    expect(sizes(calls)).toEqual(expected);
    expect(result).toEqual({ requests: expected.length, rows: n });
  });

  it("UT-BULK-057 parallelChunkSize follows min(max, max(25, ceil(rows / parallel)))", () => {
    expect(parallelChunkSize(100, 4)).toBe(25);
    expect(parallelChunkSize(1000, 4)).toBe(250);
    expect(parallelChunkSize(2500, 4, 500)).toBe(500);
    expect(parallelChunkSize(1000, 4, 100)).toBe(100);
    expect(parallelChunkSize(40, 4)).toBe(40);
  });

  it("UT-BULK-058 every chunk is in flight before any resolves", async () => {
    const pending: { resolve: (r: IOperationResult<unknown>) => void; first: unknown }[] = [];
    const transport: BulkUpsertTransport = (_set, targets) =>
      new Promise((resolve) => pending.push({ resolve, first: targets[0]?.["vsb_capexcostid"] }));
    const run = upsertMultiple(TABLE, rows(100), transport, { parallel: 4 });
    for (let i = 0; i < 5 && pending.length < 4; i += 1) await Promise.resolve();
    expect(pending).toHaveLength(4);
    expect(pending.map((p) => p.first)).toEqual([row(0).id, row(25).id, row(50).id, row(75).id]);
    // Resolve out of order: the result does not depend on completion order.
    [3, 1, 0, 2].forEach((i) => pending[i]?.resolve(ok()));
    await expect(run).resolves.toEqual({ requests: 4, rows: 100 });
  });

  it("UT-BULK-059 all chunks succeed → { requests: chunks, rows }", async () => {
    const { transport, calls } = fakeTransport();
    await expect(upsertMultiple(TABLE, rows(1000), transport, { parallel: 4 }))
      .resolves.toEqual({ requests: 4, rows: 1000 });
    expect(calls.every((c) => c.entitySetName === "vsb_capexcosts")).toBe(true);
  });

  it("UT-BULK-060 every chunk 501 → BulkWriteError with 0 committed, cause a 501 DataError", async () => {
    const transport: BulkUpsertTransport = async () => { throw new DataError("bulk", "not implemented", 501); };
    const error = await upsertMultiple(TABLE, rows(100), transport, { parallel: 4, label: "save costs" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulkWriteError);
    expect(error).not.toBeInstanceOf(BulkPartialWriteError);
    const e = error as BulkWriteError;
    expect(e.chunkIndex).toBe(0);
    expect(e.chunksCommitted).toBe(0);
    expect(e.rowsCommitted).toBe(0);
    expect(e.cause).toBeInstanceOf(DataError);
    expect((e.cause as DataError).status).toBe(501);
  });

  it("UT-BULK-061 every chunk {success:false} → BulkWriteError, cause the FIRST chunk's failure", async () => {
    const { transport } = fakeTransport((call) => fail(`refused ${call}`));
    const e = (await upsertMultiple(TABLE, rows(100), transport, { parallel: 4 })
      .catch((x: unknown) => x)) as BulkWriteError;
    expect(e).toBeInstanceOf(BulkWriteError);
    expect(e.rowsCommitted).toBe(0);
    expect((e.cause as Error).message).toContain("refused 0");
  });

  it("UT-BULK-062 a partial failure → BulkPartialWriteError with NO prefix-count properties", async () => {
    // Chunks 1 and 3 (0-based) of 4 × 25 fail; chunks 0 and 2 land: not a prefix.
    const { transport, calls } = fakeTransport((call) => (call === 1 || call === 3 ? fail(`refused ${call}`) : ok()));
    const error = await upsertMultiple(TABLE, rows(100), transport, { parallel: 4, label: "save costs" })
      .catch((e: unknown) => e);
    expect(calls).toHaveLength(4);
    expect(error).toBeInstanceOf(BulkPartialWriteError);
    expect(error).not.toBeInstanceOf(BulkWriteError);
    const e = error as BulkPartialWriteError;
    expect("rowsCommitted" in e).toBe(false);
    expect("chunksCommitted" in e).toBe(false);
    expect(e.name).toBe("BulkPartialWriteError");
    expect(e.label).toBe("save costs");
    expect(e.table).toBe("vsb_capexcosts");
    expect(e.chunksFailed).toBe(2);
    expect(e.rowsLanded).toBe(50);
    expect(e.causes).toHaveLength(2);
    expect((e.cause as Error).message).toContain("refused 1");
    expect((e.causes[1] as Error).message).toContain("refused 3");
  });

  it("UT-BULK-063 rowsLanded counts the remainder chunk's real size", async () => {
    const { transport } = fakeTransport((call) => (call === 0 ? fail() : ok()));
    const e = (await upsertMultiple(TABLE, rows(60), transport, { parallel: 8 })
      .catch((x: unknown) => x)) as BulkPartialWriteError;
    expect(e).toBeInstanceOf(BulkPartialWriteError);
    expect(e.rowsLanded).toBe(35);
    expect(e.chunksFailed).toBe(1);
  });

  it("UT-BULK-064 validation runs over every row before any parallel send", async () => {
    const { transport, calls } = fakeTransport();
    const error = await upsertMultiple(TABLE, [...rows(99), row(0)], transport, { parallel: 4 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulkValidationError);
    expect(calls).toHaveLength(0);
  });

  it("UT-BULK-065 a bad parallel is a BulkValidationError, transport never called", async () => {
    const { transport, calls } = fakeTransport();
    for (const parallel of [0, -1, 1.5]) {
      const error = await upsertMultiple(TABLE, rows(100), transport, { parallel }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BulkValidationError);
      expect((error as BulkValidationError).reason).toMatch(/parallel/);
    }
    expect(calls).toHaveLength(0);
  });

  it("UT-BULK-066 parallel 1 is sequential with exact prefix counts (today's behaviour)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let call = 0;
    const transport: BulkUpsertTransport = async () => {
      const mine = call;
      call += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return mine === 2 ? fail() : ok();
    };
    const e = (await upsertMultiple(TABLE, rows(100), transport, { parallel: 1, chunkSize: 25 })
      .catch((x: unknown) => x)) as BulkWriteError;
    expect(maxInFlight).toBe(1);
    expect(call).toBe(3);
    expect(e).toBeInstanceOf(BulkWriteError);
    expect(e.chunksCommitted).toBe(2);
    expect(e.rowsCommitted).toBe(50);
  });

  it("UT-BULK-067 parallel > 1 with one chunk takes the sequential path (exact BulkWriteError)", async () => {
    const { transport, calls } = fakeTransport(() => fail("forbidden"));
    const e = (await upsertMultiple(TABLE, rows(40), transport, { parallel: 4 })
      .catch((x: unknown) => x)) as BulkWriteError;
    expect(calls).toHaveLength(1);
    expect(e).toBeInstanceOf(BulkWriteError);
    expect(e.rowsCommitted).toBe(0);
    expect(e.message).toContain("request 1 on vsb_capexcosts");
  });
});

describe("deleteMany", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  it("UT-BULK-030 empty input sends 0 requests", async () => {
    let called = 0;
    const result = await deleteMany(TABLE, [], async () => { called += 1; });
    expect(result).toEqual({ requests: 0 });
    expect(called).toBe(0);
  });

  it("UT-BULK-031 respects the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const deleter = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
    };
    const result = await deleteMany(TABLE, ids(20), deleter, { limit: 3 });
    expect(result).toEqual({ requests: 20 });
    expect(maxInFlight).toBe(3);
  });

  it("UT-BULK-032 de-duplicates ids (case-insensitively) before deleting", async () => {
    const seen: string[] = [];
    const result = await deleteMany(TABLE, ["A", "b", "a", "B", "c"], async (_t, id) => { seen.push(id); });
    expect(result).toEqual({ requests: 3 });
    expect([...seen].sort()).toEqual(["A", "b", "c"]);
  });

  it("UT-BULK-033 passes the entity set name and each id to the deleter", async () => {
    const calls: [string, string][] = [];
    await deleteMany(TABLE, ["x"], async (t, id) => { calls.push([t, id]); });
    expect(calls).toEqual([["vsb_capexcosts", "x"]]);
  });

  it("UT-BULK-034 a partial failure attempts every id, then throws the exact failed ids", async () => {
    const attempted: string[] = [];
    const deleter = async (_t: string, id: string) => {
      attempted.push(id);
      await new Promise((r) => setTimeout(r, 1));
      if (id === "id-1" || id === "id-6") throw new Error(`refused ${id}`);
    };
    const error = (await deleteMany(TABLE, ids(8), deleter, { limit: 2, label: "delete costs" })
      .catch((e: unknown) => e)) as BulkDeleteError;
    expect([...attempted].sort()).toEqual(ids(8).sort());
    expect(error).toBeInstanceOf(BulkDeleteError);
    expect(error.label).toBe("delete costs");
    expect(error.table).toBe("vsb_capexcosts");
    expect(error.failedIds).toEqual(["id-1", "id-6"]);
    expect(error.deletedCount).toBe(6);
    expect(error.causes.map((c) => (c as Error).message)).toEqual(["refused id-1", "refused id-6"]);
  });

  it("UT-BULK-035 a single refusal never resolves as success", async () => {
    await expect(
      deleteMany(TABLE, ["only"], async () => { throw new DataError("delete", "403", 403); }),
    ).rejects.toBeInstanceOf(BulkDeleteError);
  });
});
