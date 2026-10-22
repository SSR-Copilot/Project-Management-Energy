/**
 * `data/adminRowWrites.ts` — the per-row writes (master has no bulk services).
 * UT-ROWW-nnn.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => { throw new Error("tests inject a client"); } }));

import { RecordGoneError } from "@/platform/errors";
import { RowWriteError, createRowsEach, eachRow, updateRowsEach, type RowWriteClient } from "./adminRowWrites";

const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

function fakeClient(opts: { gone?: Set<string>; failUpdate?: Set<string>; failCreateAt?: number } = {}) {
  const updates: { table: string; id: string; fields: unknown }[] = [];
  const creates: Record<string, unknown>[] = [];
  const client: RowWriteClient = {
    retrieveMultipleRecordsAsync: async <T,>(_table: string, options?: { filter?: string }) => {
      const id = /eq (\S+)$/.exec(options?.filter ?? "")?.[1] ?? "";
      return { success: true, data: (opts.gone?.has(id) ? [] : [{ id }]) as T[] };
    },
    updateRecordAsync: async <TIn, TOut>(table: string, id: string, fields: TIn) => {
      if (opts.failUpdate?.has(id)) return { success: false, data: undefined as TOut, error: new Error("denied") };
      updates.push({ table, id, fields });
      return { success: true, data: {} as TOut };
    },
    createRecordAsync: async <TIn, TOut>(_table: string, record: TIn) => {
      if (opts.failCreateAt === creates.length) return { success: false, data: undefined as TOut, error: new Error("no") };
      creates.push(record as Record<string, unknown>);
      return { success: true, data: { pk: G(100 + creates.length) } as TOut };
    },
  };
  return { client: () => client, updates, creates };
}

describe("UpdateRowsEach", () => {
  it("UT-ROWW-001 one guarded update per row, primary key stripped from the fields", async () => {
    const f = fakeClient();
    await updateRowsEach("save order", "t", "pk", [{ pk: G(1), n: 1 }, { pk: G(2), n: 2 }], { client: f.client });
    expect(f.updates).toEqual([
      { table: "t", id: G(1), fields: { n: 1 } },
      { table: "t", id: G(2), fields: { n: 2 } },
    ]);
  });

  it("UT-ROWW-002 a deleted row is never recreated: RowWriteError whose cause is RecordGoneError", async () => {
    const f = fakeClient({ gone: new Set([G(1)]) });
    const error = await updateRowsEach("save", "t", "pk", [{ pk: G(1), n: 1 }], { client: f.client, concurrency: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RowWriteError);
    expect((error as RowWriteError).cause).toBeInstanceOf(RecordGoneError);
    expect((error as RowWriteError).partial).toBe(false);
    expect(f.updates).toEqual([]);
  });

  it("UT-ROWW-003 partial = true when an earlier row landed; no new row starts after the failure", async () => {
    const f = fakeClient({ failUpdate: new Set([G(2)]) });
    const error = await updateRowsEach("save", "t", "pk", [1, 2, 3].map((n) => ({ pk: G(n), n })), { client: f.client, concurrency: 1 })
      .catch((e: unknown) => e) as RowWriteError;
    expect(error.partial).toBe(true);
    expect(error.written).toBe(1);
    expect(error.total).toBe(3);
    expect(f.updates.map((u) => u.id)).toEqual([G(1)]);
  });

  it("UT-ROWW-004 an empty list writes nothing", async () => {
    const f = fakeClient();
    await updateRowsEach("save", "t", "pk", [], { client: f.client });
    expect(f.updates).toEqual([]);
  });
});

describe("CreateRowsEach", () => {
  it("UT-ROWW-005 returns the new ids in input order and drops a stray primary key", async () => {
    const f = fakeClient();
    const ids = await createRowsEach("create", "t", "pk", [{ pk: "x", a: 1 }, { a: 2 }], { client: f.client, concurrency: 1 });
    expect(ids).toEqual([G(101), G(102)]);
    expect(f.creates).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("UT-ROWW-006 a failed create throws RowWriteError (partial when an earlier one landed)", async () => {
    const f = fakeClient({ failCreateAt: 1 });
    const error = await createRowsEach("create", "t", "pk", [{ a: 1 }, { a: 2 }], { client: f.client, concurrency: 1 })
      .catch((e: unknown) => e) as RowWriteError;
    expect(error).toBeInstanceOf(RowWriteError);
    expect(error.partial).toBe(true);
  });
});

describe("EachRow", () => {
  it("UT-ROWW-007 resolves results in input order", async () => {
    await expect(eachRow([3, 1, 2], async (n) => n * 2)).resolves.toEqual([6, 2, 4]);
  });
});
