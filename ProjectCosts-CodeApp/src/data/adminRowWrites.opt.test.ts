/**
 * `data/adminRowWrites.ts` — the dvopt additions (AD-01 / T-04, AD-05, AD-08): the already-gone delete, the settled pool, the
 * retry of an idempotent write and the update of a just-created row. UT-ROWW-OPT-nnn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => { throw new Error("tests inject a client"); } }));
const deleteMock = vi.hoisted(() => vi.fn());
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  deleteRecord: deleteMock,
}));

import { DataError, RecordGoneError } from "@/platform/errors";
import { ADMIN_OPT } from "./adminFlags";
import { isAlreadyGone } from "./client";
import {
  deleteRowIfPresent, idempotentWriteDelay, settleEach, updateRecordJustCreated, updateRowsSettled,
  withIdempotentRetry, type RowWriteClient,
} from "./adminRowWrites";

const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const DEFAULTS = { ...ADMIN_OPT };
const status = (code: number, extra: Record<string, unknown> = {}) => new DataError("op", { message: `HTTP ${code}`, status: code, ...extra }, code);

beforeEach(() => { Object.assign(ADMIN_OPT, DEFAULTS); deleteMock.mockReset(); });
afterEach(() => { Object.assign(ADMIN_OPT, DEFAULTS); });

describe("isAlreadyGone / deleteRowIfPresent (AD-05)", () => {
  it("UT-ROWW-OPT-001 404 and 0x80040217 are 'gone'; 400, 403, 409, 429 and 500 are not, nor a 400 that only names another missing object", () => {
    expect(isAlreadyGone(status(404))).toBe(true);
    expect(isAlreadyGone(new DataError("op", { message: "Does Not Exist 0x80040217" }, 400))).toBe(true);
    expect(isAlreadyGone(new DataError("op", { message: "x", status: 404 }))).toBe(true);
    for (const code of [400, 403, 409, 429, 500]) expect(isAlreadyGone(status(code))).toBe(false);
    expect(isAlreadyGone(new DataError("op", { message: "The related object does not exist" }, 400))).toBe(false);
    expect(isAlreadyGone(new Error("boom"))).toBe(false);
  });

  it("UT-ROWW-OPT-002 a delete that lands resolves 'deleted'; a 404 resolves 'gone'; any other failure is thrown unchanged", async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    await expect(deleteRowIfPresent("del", "t", G(1))).resolves.toBe("deleted");
    deleteMock.mockRejectedValueOnce(status(404));
    await expect(deleteRowIfPresent("del", "t", G(1))).resolves.toBe("gone");
    const refused = status(403);
    deleteMock.mockRejectedValueOnce(refused);
    await expect(deleteRowIfPresent("del", "t", G(1))).rejects.toBe(refused);
  });

  it("UT-ROWW-OPT-003 with ADMIN_DELETE_ALREADY_GONE_OK off a 404 throws, as deleteRecord always did", async () => {
    ADMIN_OPT.ADMIN_DELETE_ALREADY_GONE_OK = false;
    const gone = status(404);
    deleteMock.mockRejectedValueOnce(gone);
    await expect(deleteRowIfPresent("del", "t", G(1))).rejects.toBe(gone);
  });
});

describe("settleEach", () => {
  it("UT-ROWW-OPT-004 tries every item, collects every failure in input order, never throws and keeps the pool width", async () => {
    let inFlight = 0; let peak = 0;
    const seen: number[] = [];
    const result = await settleEach(Array.from({ length: 30 }, (_, i) => i), async (i) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      seen.push(i);
      if (i % 10 === 3) throw new Error(`row ${i}`);
    }, 8);
    expect(seen).toHaveLength(30);
    expect(result.landed).toBe(27);
    expect(result.failures.map((f) => f.index)).toEqual([3, 13, 23]);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("UT-ROWW-OPT-005 an empty list settles at once", async () => {
    expect(await settleEach([], async () => { throw new Error("never"); })).toEqual({ landed: 0, failures: [] });
  });
});

describe("idempotentWriteDelay / withIdempotentRetry (AD-01)", () => {
  it("UT-ROWW-OPT-006 retries 429, any 5xx and a status-less error, up to 3 tries; never a 400, 403, 404 or 409", () => {
    for (const e of [status(429), status(500), status(502), status(503), status(504), new Error("network")]) {
      expect(idempotentWriteDelay(e, 1)).toBe(1000);
      expect(idempotentWriteDelay(e, 2)).toBe(2000);
      expect(idempotentWriteDelay(e, 3)).toBeUndefined();
    }
    for (const code of [400, 401, 403, 404, 409]) expect(idempotentWriteDelay(status(code), 1)).toBeUndefined();
    expect(idempotentWriteDelay(new RecordGoneError("op", "t", G(1)), 1)).toBeUndefined();
  });

  it("UT-ROWW-OPT-007 waits the Retry-After of the failure (capped), else 1 s x attempt", () => {
    expect(idempotentWriteDelay(status(429, { retryAfter: 4 }), 1)).toBe(4000);
    expect(idempotentWriteDelay(status(429, { retryAfter: 600 }), 1)).toBe(30_000);
  });

  it("UT-ROWW-OPT-008 resends after the wait, logs one line per retry and resolves with the first good answer", async () => {
    const waits: number[] = []; const lines: string[] = [];
    let calls = 0;
    const out = await withIdempotentRetry(async () => {
      calls += 1;
      if (calls < 3) throw status(429, { retryAfter: 2 });
      return "ok";
    }, { sleep: async (ms) => { waits.push(ms); }, log: (l) => lines.push(l) });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("HTTP 429");
  });

  it("UT-ROWW-OPT-009 gives up after 3 tries with the last error unchanged; a 400 is sent once", async () => {
    let calls = 0;
    const last = status(500);
    await expect(withIdempotentRetry(async () => { calls += 1; throw last; }, { sleep: async () => {} })).rejects.toBe(last);
    expect(calls).toBe(3);
    calls = 0;
    await expect(withIdempotentRetry(async () => { calls += 1; throw status(400); }, { sleep: async () => {} })).rejects.toBeInstanceOf(DataError);
    expect(calls).toBe(1);
  });
});

function scriptedClient(script: Record<string, number[]> = {}, gone = new Set<string>()) {
  const attempts: Record<string, number> = {};
  const patched: string[] = [];
  const client: RowWriteClient = {
    retrieveMultipleRecordsAsync: async <T,>(_t: string, options?: { filter?: string }) => {
      const id = /eq (\S+)$/.exec(options?.filter ?? "")?.[1] ?? "";
      return { success: true, data: (gone.has(id) ? [] : [{ id }]) as T[] };
    },
    updateRecordAsync: async <TIn, TOut>(_t: string, id: string, _r: TIn) => {
      attempts[id] = (attempts[id] ?? 0) + 1;
      const code = script[id]?.[attempts[id]! - 1];
      if (code) return { success: false, data: undefined as TOut, error: Object.assign(new Error(`HTTP ${code}`), { status: code }) };
      patched.push(id);
      return { success: true, data: {} as TOut };
    },
    createRecordAsync: async () => { throw new Error("unused"); },
  };
  return { client: () => client, attempts, patched };
}

describe("updateRowsSettled (AD-01)", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ pk: G(i + 1), vsb_cost: 0 }));

  it("UT-ROWW-OPT-010 success path: one guarded PATCH per row, same payload as updateRowsEach, counts right", async () => {
    const f = scriptedClient();
    const result = await updateRowsSettled("zero", "t", "pk", rows(20), { client: f.client });
    expect(result).toEqual({ landed: 20, failures: [] });
    expect([...f.patched].sort()).toEqual(rows(20).map((r) => r.pk).sort());
  });

  it("UT-ROWW-OPT-011 429 on row k: the row is retried after the wait and the run completes", async () => {
    const f = scriptedClient({ [G(5)]: [429, 429] });
    const waits: number[] = [];
    const result = await updateRowsSettled("zero", "t", "pk", rows(12), { client: f.client, sleep: async (ms) => { waits.push(ms); } });
    expect(result).toEqual({ landed: 12, failures: [] });
    expect(f.attempts[G(5)]).toBe(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("UT-ROWW-OPT-012 a 400 is not retried and does not stop the other rows", async () => {
    const f = scriptedClient({ [G(3)]: [400] });
    const result = await updateRowsSettled("zero", "t", "pk", rows(12), { client: f.client, sleep: async () => {} });
    expect(f.attempts[G(3)]).toBe(1);
    expect(result.landed).toBe(11);
    expect(result.failures.map((x) => x.index)).toEqual([2]);
    expect(f.patched).toHaveLength(11);
  });

  it("UT-ROWW-OPT-013 a row deleted meanwhile (RecordGoneError) is a failure, never recreated and not retried", async () => {
    const f = scriptedClient({}, new Set([G(2)]));
    const result = await updateRowsSettled("zero", "t", "pk", rows(3), { client: f.client, sleep: async () => {} });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.error).toBeInstanceOf(RecordGoneError);
    expect(f.attempts[G(2)]).toBeUndefined();
  });

  it("UT-ROWW-OPT-014 never more than the pool width in flight (8)", async () => {
    let inFlight = 0; let peak = 0;
    const base = scriptedClient();
    const inner = base.client();
    const client: RowWriteClient = {
      ...inner,
      updateRecordAsync: async (t, id, r) => {
        inFlight += 1; peak = Math.max(peak, inFlight);
        await new Promise((x) => setTimeout(x, 1));
        inFlight -= 1;
        return inner.updateRecordAsync(t, id, r);
      },
    } as RowWriteClient;
    await updateRowsSettled("zero", "t", "pk", rows(40), { client: () => client });
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("updateRecordJustCreated (AD-08)", () => {
  it("UT-ROWW-OPT-015 one PATCH and no existence read", async () => {
    const reads: unknown[] = []; const patches: unknown[] = [];
    const client = {
      retrieveMultipleRecordsAsync: async () => { reads.push(1); return { success: true, data: [] }; },
      updateRecordAsync: async (_t: string, id: string, fields: unknown) => { patches.push({ id, fields }); return { success: true, data: {} }; },
    };
    await updateRecordJustCreated("set inactive", "t", G(7), { statecode: 1 }, { client: () => client as never });
    expect(reads).toEqual([]);
    expect(patches).toEqual([{ id: G(7), fields: { statecode: 1 } }]);
  });

  it("UT-ROWW-OPT-016 defensive mapping only (QA-06: SDK 1.3.1 never answers 404 to a PATCH without If-Match): a 404, if a host sends one, becomes RecordGoneError; any other failure stays a DataError", async () => {
    const make = (code: number) => ({
      retrieveMultipleRecordsAsync: async () => ({ success: true, data: [] }),
      updateRecordAsync: async () => ({ success: false, error: Object.assign(new Error("x"), { status: code }) }),
    });
    await expect(updateRecordJustCreated("op", "t", G(7), {}, { client: () => make(404) as never })).rejects.toBeInstanceOf(RecordGoneError);
    const other = await updateRecordJustCreated("op", "t", G(7), {}, { client: () => make(403) as never }).catch((e: unknown) => e);
    expect(other).toBeInstanceOf(DataError);
    expect(other).not.toBeInstanceOf(RecordGoneError);
  });

  it("UT-ROWW-OPT-017 an id that is not a GUID is refused before anything is sent", async () => {
    const sent: unknown[] = [];
    const client = { updateRecordAsync: async () => { sent.push(1); return { success: true, data: {} }; } };
    await expect(updateRecordJustCreated("op", "t", "not-a-guid", {}, { client: () => client as never })).rejects.toBeInstanceOf(DataError);
    expect(sent).toEqual([]);
  });
});
