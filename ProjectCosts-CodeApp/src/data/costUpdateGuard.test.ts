/**
 * UT-COSTGUARD-001..009 — the upsert guard of a plan of updates (dvopt T-01, CB-01) and `rowExists`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

import { DataError, RecordGoneError } from "@/platform/errors";
import { assertRowsExist, rowExists } from "./costUpdateGuard";

const SET = "vsb_landleaseallocationwtgs";
const PK = "vsb_landleaseallocationwtgid";
const id = (n: number) => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`;

/** A client double: `present` ids answer, everything else is absent. */
function fake(present: Set<string>, behaviour: "ok" | "fail" | "throw" = "ok") {
  const calls: { table: string; options: Record<string, unknown> }[] = [];
  const client = {
    retrieveMultipleRecordsAsync: async (table: string, options: Record<string, unknown>) => {
      calls.push({ table, options });
      if (behaviour === "throw") throw new Error("network");
      if (behaviour === "fail") return { success: false, data: [], error: { message: "denied", status: 403 } };
      const filter = String(options.filter);
      return { success: true, data: [...present].filter((p) => filter.includes(p)).map((p) => ({ [PK]: p })) };
    },
  };
  return { calls, client: () => client as never };
}

describe("assertRowsExist", () => {
  it("UT-COSTGUARD-001 resolves, with ONE key-only read, when every id exists", async () => {
    const ids = [id(1), id(2), id(3)];
    const f = fake(new Set(ids));
    await expect(assertRowsExist("update x", SET, ids, f.client)).resolves.toBeUndefined();
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.table).toBe(SET);
    expect(f.calls[0]!.options.select).toEqual([PK]);
    expect(String(f.calls[0]!.options.filter)).toContain(`${PK} eq ${id(1)}`);
  });

  it("UT-COSTGUARD-002 a missing id throws RecordGoneError naming the table and that id", async () => {
    const f = fake(new Set([id(1), id(3)]));
    const error = await assertRowsExist("update x", SET, [id(1), id(2), id(3)], f.client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect((error as RecordGoneError).id).toBe(id(2));
    expect((error as RecordGoneError).table).toBe(SET);
    expect((error as RecordGoneError).status).toBe(404);
  });

  it("UT-COSTGUARD-003 ids are read in chunks of 40, every chunk select-only", async () => {
    const ids = Array.from({ length: 85 }, (_, i) => id(i + 1));
    const f = fake(new Set(ids));
    await assertRowsExist("update x", SET, ids, f.client);
    expect(f.calls.map((c) => String(c.options.filter).split(" or ").length)).toEqual([40, 40, 5]);
    expect(f.calls.every((c) => (c.options.select as string[]).join() === PK)).toBe(true);
  });

  it("UT-COSTGUARD-004 a missing id in a LATER chunk is still found", async () => {
    const ids = Array.from({ length: 85 }, (_, i) => id(i + 1));
    const f = fake(new Set(ids.slice(0, 84)));
    await expect(assertRowsExist("update x", SET, ids, f.client)).rejects.toBeInstanceOf(RecordGoneError);
  });

  it("UT-COSTGUARD-005 duplicates (any case) are read once, and an empty list reads nothing", async () => {
    const f = fake(new Set([id(1)]));
    await assertRowsExist("update x", SET, [id(1), id(1).toUpperCase(), id(1)], f.client);
    expect(String(f.calls[0]!.options.filter).split(" or ")).toHaveLength(1);
    const g = fake(new Set());
    await assertRowsExist("update x", SET, [], g.client);
    expect(g.calls).toEqual([]);
  });

  it("UT-COSTGUARD-006 a FAILED read is a DataError, never read as 'gone'", async () => {
    const f = fake(new Set(), "fail");
    const error = await assertRowsExist("update x", SET, [id(1)], f.client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).not.toBeInstanceOf(RecordGoneError);
    const t = fake(new Set(), "throw");
    const thrown = await assertRowsExist("update x", SET, [id(1)], t.client).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(DataError);
    expect(thrown).not.toBeInstanceOf(RecordGoneError);
  });

  it("UT-COSTGUARD-007 a malformed id and an unregistered table are refused before any read (fail closed)", async () => {
    const f = fake(new Set());
    await expect(assertRowsExist("update x", SET, ["not-a-guid"], f.client)).rejects.toBeInstanceOf(DataError);
    await expect(assertRowsExist("update x", "vsb_not_registered", [id(1)], f.client)).rejects.toBeInstanceOf(DataError);
    expect(f.calls).toEqual([]);
  });
});

describe("rowExists", () => {
  it("UT-COSTGUARD-008 true when the row is there, false when it is not", async () => {
    expect(await rowExists("read back", SET, id(1), fake(new Set([id(1)])).client)).toBe(true);
    expect(await rowExists("read back", SET, id(1), fake(new Set()).client)).toBe(false);
  });

  it("UT-COSTGUARD-009 a failed read throws (it is not 'absent')", async () => {
    await expect(rowExists("read back", SET, id(1), fake(new Set(), "fail").client)).rejects.toBeInstanceOf(DataError);
  });
});
