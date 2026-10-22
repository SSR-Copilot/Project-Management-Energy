/**
 * Upsert guard: `updateRecordIfExists` must never let a PATCH recreate a deleted row (SDK 1.3.1 sent
 * it without `If-Match`, an upsert; SDK 1.5.0 sends `If-Match: *`, so a late delete yields 404).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

import { DataError, RecordGoneError } from "@/platform/errors";
import { primaryKeyOf, updateRecordIfExists, type GuardedUpdateClient } from "./client";

type Call = { op: "read" | "update"; table: string; id?: string; body?: unknown; options?: Record<string, unknown> };

const ID = "AAAAAAAA-0000-0000-0000-000000000001";
const id = ID.toLowerCase();

let calls: Call[];
let exists: boolean;
let readResult: "ok" | "fail" | "throw";
let updateResult: "ok" | "fail" | "throw" | "gone";

const fake = {
  retrieveMultipleRecordsAsync: async (table: string, options?: Record<string, unknown>) => {
    calls.push({ op: "read", table, options: options ?? {} });
    if (readResult === "throw") throw new Error("not registered");
    if (readResult === "fail") return { success: false, data: [], error: { message: "denied", status: 403 } };
    return { success: true, data: exists ? [{ pk: id }] : [] };
  },
  updateRecordAsync: async (table: string, rowId: string, body: unknown) => {
    calls.push({ op: "update", table, id: rowId, body });
    if (updateResult === "throw") throw new Error("boom");
    if (updateResult === "fail") return { success: false, data: undefined, error: { message: "denied", status: 412 } };
    // SDK 1.5: the PATCH carries `If-Match: *`, so a row deleted after the read is refused with 404.
    if (updateResult === "gone") return { success: false, data: undefined, error: { message: "Not Found", status: 404 } };
    return { success: true, data: { pk: rowId, ok: true } };
  },
  createRecordAsync: async () => ({ success: true, data: {} }),
  deleteRecordAsync: async () => ({ success: true, data: undefined }),
};

const client = () => fake as unknown as GuardedUpdateClient;

beforeEach(() => {
  calls = [];
  exists = true;
  readResult = "ok";
  updateResult = "ok";
});

describe("UpdateRecordIfExists", () => {
  it("UT-UPDGUARD-001 Row exists: reads by primary key only (1 row), then PATCHes and returns the unwrapped data", async () => {
    const data = await updateRecordIfExists("rename x", "things", ID, { name: "n" }, { primaryKey: "pk", client });
    expect(calls).toEqual([
      { op: "read", table: "things", options: { select: ["pk"], filter: `pk eq ${id}`, maxPageSize: 1 } },
      // PATCHes the same normalised id the existence check looked up.
      { op: "update", table: "things", id, body: { name: "n" } },
    ]);
    expect(data).toEqual({ pk: id, ok: true });
  });

  it("UT-UPDGUARD-002 Row gone: RecordGoneError (a 404 DataError naming the operation), and NO update is sent", async () => {
    exists = false;
    const error = await updateRecordIfExists("rename x", "things", ID, {}, { primaryKey: "pk", client }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(error).toBeInstanceOf(DataError);
    expect((error as RecordGoneError).status).toBe(404);
    expect((error as RecordGoneError).operation).toBe("rename x");
    expect((error as RecordGoneError).id).toBe(id);
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it.each([["fail"], ["throw"]] as const)("UT-UPDGUARD-003 update %s: surfaces as a DataError (not RecordGoneError)", async (mode) => {
    updateResult = mode;
    const error = await updateRecordIfExists("rename x", "things", ID, {}, { primaryKey: "pk", client }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).not.toBeInstanceOf(RecordGoneError);
    expect((error as DataError).operation).toBe("rename x");
    if (mode === "fail") expect((error as DataError).status).toBe(412);
  });

  it("UT-UPDGUARD-004 Row deleted between the read and the PATCH (SDK 1.5 If-Match: * → 404): RecordGoneError, not a resurrected row", async () => {
    updateResult = "gone";
    const error = await updateRecordIfExists("rename x", "things", ID, { name: "n" }, { primaryKey: "pk", client })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect((error as RecordGoneError).status).toBe(404);
    expect((error as RecordGoneError).operation).toBe("rename x");
    expect((error as RecordGoneError).table).toBe("things");
    expect((error as RecordGoneError).id).toBe(id);
    // The read found the row; the one PATCH was sent and refused — nothing else was attempted.
    expect(calls.map((c) => c.op)).toEqual(["read", "update"]);
  });

  it.each([["fail"], ["throw"]] as const)("UT-UPDGUARD-005 existence read %s: DataError, never 'gone', no update sent", async (mode) => {
    readResult = mode;
    const error = await updateRecordIfExists("rename x", "things", ID, {}, { primaryKey: "pk", client }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).not.toBeInstanceOf(RecordGoneError);
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it("UT-UPDGUARD-006 Fails closed when no primary key is known (unregistered table, none passed)", async () => {
    const error = await updateRecordIfExists("rename x", "not_a_table", ID, {}, { client }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(calls).toEqual([]);
  });

  it("UT-UPDGUARD-007 Fails closed on a non-GUID id (no request at all)", async () => {
    const error = await updateRecordIfExists("rename x", "things", "t1", {}, { primaryKey: "pk", client }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(calls).toEqual([]);
  });

  it("UT-UPDGUARD-008 Takes the primary key from the generated dataSourcesInfo for a registered table", () => {
    expect(primaryKeyOf("vsb_capexaccountlists")).toBe("vsb_capexaccountlistid");
    expect(primaryKeyOf("not_a_table")).toBeUndefined();
  });
});
