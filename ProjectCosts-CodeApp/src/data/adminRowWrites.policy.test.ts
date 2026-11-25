/**
 * UT-ADMINPOL-001.. — the Application Settings row writes through the request policy (dvopt T-11, WE-02; switch
 * `POLICY_ADMIN_WRITES`): `createRowsEach` ('create': 429 only), `updateRowsEach` and `updateRecordJustCreated` ('patchAbsolute'),
 * `deleteRowIfPresent` ('delete'). The CAPEX clean-up keeps its own retry (`withIdempotentRetry` / `withDeleteRetry`) and is never
 * stacked with the policy. Sleeper and jitter injected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ flags: { POLICY_ADMIN_WRITES: true }, lines: [] as string[] }));
const sdk = vi.hoisted(() => ({ deleteRecordAsync: vi.fn() }));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => sdk }));
vi.mock("./requestFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./requestFlags")>();
  return { ...actual, get POLICY_ADMIN_WRITES() { return h.flags.POLICY_ADMIN_WRITES; } };
});
vi.mock("@/platform/requestLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/requestLog")>();
  return { ...actual, logAction: (line: string) => { h.lines.push(line); } };
});

import { DataError } from "@/platform/errors";
import {
  createRowsEach, deleteRowIfPresent, RowWriteError, setRetrySleeper, updateRecordJustCreated, updateRowsEach, updateRowsSettled,
  type RowWriteClient,
} from "./adminRowWrites";
import { setPolicyTestSeams } from "./requestPolicy";

const T = "vsb_capexaccountlists";
const PK = "vsb_capexaccountlistid";
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const bad = (status: number) => ({ success: false as const, error: Object.assign(new Error(`HTTP ${status}`), { status }) });
const created = (n: number) => ({ success: true as const, data: { [PK]: g(n) } });
const done = { success: true as const, data: {} };
const waits: number[] = [];

/** A client with a script per kind; the last answer repeats. */
function client(script: { create?: unknown[]; update?: unknown[]; read?: unknown[] }) {
  const counts = { create: 0, update: 0, read: 0 };
  const pick = (kind: "create" | "update" | "read", fallback: unknown) => {
    const list = script[kind] ?? [fallback];
    return list[Math.min(counts[kind]++, list.length - 1)];
  };
  const c: RowWriteClient = {
    createRecordAsync: (async () => pick("create", created(500))) as never,
    updateRecordAsync: (async () => pick("update", done)) as never,
    retrieveMultipleRecordsAsync: (async () => pick("read", { success: true, data: [{ [PK]: g(1) }] })) as never,
  };
  return { counts, get: () => c };
}

beforeEach(() => {
  h.flags.POLICY_ADMIN_WRITES = true;
  h.lines.length = 0;
  waits.length = 0;
  sdk.deleteRecordAsync.mockReset();
  setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
  setRetrySleeper(async () => {});
});
afterEach(() => {
  setPolicyTestSeams(null);
  setRetrySleeper(null);
});

describe("createRowsEach", () => {
  it("UT-ADMINPOL-001 a 429 on create row k is retried and every id comes back in input order", async () => {
    const { counts, get } = client({ create: [created(1), bad(429), created(2)] });
    const ids = await createRowsEach("op", T, PK, [{ a: 1 }, { a: 2 }], { client: get, concurrency: 1 });
    expect(ids).toEqual([g(1), g(2)]);
    expect(counts.create).toBe(3);
  });

  it("UT-ADMINPOL-002 a create is NOT retried after a 500 or a 503 (a second POST would duplicate the row)", async () => {
    const a = client({ create: [bad(500)] });
    await expect(createRowsEach("op", T, PK, [{ a: 1 }], { client: a.get })).rejects.toBeInstanceOf(RowWriteError);
    expect(a.counts.create).toBe(1);
    const b = client({ create: [bad(503)] });
    await expect(createRowsEach("op", T, PK, [{ a: 1 }], { client: b.get })).rejects.toBeInstanceOf(RowWriteError);
    expect(b.counts.create).toBe(1);
    expect(waits).toEqual([]);
  });

  it("UT-ADMINPOL-003 with no retry the RowWriteError is the same ON and OFF; the switch OFF sends a 429 create once", async () => {
    const run = async (on: boolean) => {
      h.flags.POLICY_ADMIN_WRITES = on;
      const { counts, get } = client({ create: [bad(403)] });
      const error = await createRowsEach("op", T, PK, [{ a: 1 }, { a: 2 }], { client: get }).catch((e: unknown) => e) as RowWriteError;
      return { partial: error.partial, written: error.written, total: error.total, cause: (error.cause as DataError).message, calls: counts.create };
    };
    expect(await run(true)).toEqual(await run(false));
    h.flags.POLICY_ADMIN_WRITES = false;
    const { counts, get } = client({ create: [bad(429), created(1)] });
    await expect(createRowsEach("op", T, PK, [{ a: 1 }], { client: get })).rejects.toBeInstanceOf(RowWriteError);
    expect(counts.create).toBe(1);
  });
});

describe("updateRowsEach / updateRecordJustCreated", () => {
  it("UT-ADMINPOL-010 a guarded per-row update retries a 503 on its PATCH and a 429 on its existence read", async () => {
    const { counts, get } = client({ read: [bad(429), { success: true, data: [{ [PK]: g(1) }] }], update: [bad(503), done] });
    await updateRowsEach("op", T, PK, [{ [PK]: g(1), vsb_x: 1 }], { client: get });
    expect(counts).toMatchObject({ read: 2, update: 2 });
  });

  it("UT-ADMINPOL-011 a 403 on the PATCH is never retried; the failure keeps its RowWriteError shape", async () => {
    const { counts, get } = client({ update: [bad(403)] });
    const error = await updateRowsEach("op", T, PK, [{ [PK]: g(1), vsb_x: 1 }], { client: get }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RowWriteError);
    expect(counts.update).toBe(1);
  });

  it("UT-ADMINPOL-012 the switch OFF: updateRowsEach sends each request once", async () => {
    h.flags.POLICY_ADMIN_WRITES = false;
    const { counts, get } = client({ update: [bad(503), done] });
    await expect(updateRowsEach("op", T, PK, [{ [PK]: g(1), vsb_x: 1 }], { client: get })).rejects.toBeInstanceOf(RowWriteError);
    expect(counts.update).toBe(1);
  });

  it("UT-ADMINPOL-013 updateRecordJustCreated (a plain PATCH, absolute values) retries a 503; the switch OFF does not", async () => {
    const a = client({ update: [bad(503), done] });
    await updateRecordJustCreated("op", T, g(1), { vsb_x: 1 }, { client: a.get });
    expect(a.counts.update).toBe(2);
    h.flags.POLICY_ADMIN_WRITES = false;
    const b = client({ update: [bad(503), done] });
    await expect(updateRecordJustCreated("op", T, g(1), { vsb_x: 1 }, { client: b.get })).rejects.toMatchObject({ status: 503 });
    expect(b.counts.update).toBe(1);
  });
});

describe("deleteRowIfPresent", () => {
  it("UT-ADMINPOL-020 a 503 delete is retried; a 404 on the FIRST attempt is 'gone' as before (no retry)", async () => {
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue({ success: true, data: undefined });
    await expect(deleteRowIfPresent("op", T, g(1))).resolves.toBe("deleted");
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(2);
    sdk.deleteRecordAsync.mockReset();
    sdk.deleteRecordAsync.mockResolvedValue(bad(404));
    await expect(deleteRowIfPresent("op", T, g(1))).resolves.toBe("gone");
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-ADMINPOL-021 the switch OFF: a 503 delete is sent once and throws", async () => {
    h.flags.POLICY_ADMIN_WRITES = false;
    sdk.deleteRecordAsync.mockResolvedValue(bad(503));
    await expect(deleteRowIfPresent("op", T, g(1))).rejects.toMatchObject({ status: 503 });
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });
});

describe("no stacking with the clean-up's own retry", () => {
  it("UT-ADMINPOL-030 updateRowsSettled keeps ONE retry loop (withIdempotentRetry): a persistent 503 PATCH is 3 requests, not 9", async () => {
    const { counts, get } = client({ update: [bad(503)] });
    const result = await updateRowsSettled("op", T, PK, [{ [PK]: g(1), vsb_x: 0 }], { client: get, sleep: async () => {} });
    expect(result.failures).toHaveLength(1);
    expect(counts.update).toBe(3);
    expect(waits).toEqual([]);
  });
});
