/**
 * UT-CLIENTPOL-001.. — `deleteRecord` and `updateRecordIfExists` through the request policy (dvopt T-11, WE-02; switch
 * `POLICY_CLIENT_WRITES`), the nesting marker (`insideOwnRetry`: no retry inside a caller's own retry) and `readPolicyPage`.
 * Sleeper and jitter injected; nothing waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ flags: { POLICY_CLIENT_WRITES: true }, lines: [] as string[] }));
const sdk = vi.hoisted(() => ({ deleteRecordAsync: vi.fn() }));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => sdk }));
vi.mock("./requestFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./requestFlags")>();
  return { ...actual, get POLICY_CLIENT_WRITES() { return h.flags.POLICY_CLIENT_WRITES; } };
});
vi.mock("@/platform/requestLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/requestLog")>();
  return { ...actual, logAction: (line: string) => { h.lines.push(line); } };
});

import { DataError, RecordGoneError } from "@/platform/errors";
import { deleteIfExists, deleteRecord, updateRecordIfExists, type GuardedUpdateClient } from "./client";
import { policyOn, readPolicyPage, setPolicyTestSeams } from "./requestPolicy";
import { insideOwnRetry, setDeleteSleeper, withDeleteRetry } from "./retry";

const ID = "aaaaaaaa-0000-0000-0000-000000000001";
const waits: number[] = [];
const bad = (status: number) => ({ success: false as const, error: Object.assign(new Error(`HTTP ${status}`), { status }) });
const ok = { success: true as const, data: undefined };

beforeEach(() => {
  h.flags.POLICY_CLIENT_WRITES = true;
  h.lines.length = 0;
  waits.length = 0;
  sdk.deleteRecordAsync.mockReset();
  setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
  setDeleteSleeper(async () => {});
});
afterEach(() => {
  setPolicyTestSeams(null);
  setDeleteSleeper(null);
});

describe("deleteRecord", () => {
  it("UT-CLIENTPOL-001 a 503 is retried and the delete completes", async () => {
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue(ok);
    await deleteRecord("delete x", "vsb_things", ID);
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(2);
    expect(waits).toHaveLength(1);
  });

  it("UT-CLIENTPOL-002 a 429 is retried up to 4 tries, then fails with the same DataError as before", async () => {
    sdk.deleteRecordAsync.mockResolvedValue(bad(429));
    const error = await deleteRecord("delete x", "vsb_things", ID).catch((e: unknown) => e) as DataError;
    expect(error).toBeInstanceOf(DataError);
    expect(error.status).toBe(429);
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(4);
  });

  it("UT-CLIENTPOL-003 a 400, 403, 404 and 409 on the FIRST attempt are never retried; a plain 404 still throws", async () => {
    for (const status of [400, 403, 404, 409]) {
      sdk.deleteRecordAsync.mockReset();
      sdk.deleteRecordAsync.mockResolvedValue(bad(status));
      await expect(deleteRecord("delete x", "vsb_things", ID)).rejects.toMatchObject({ status });
      expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
    }
    expect(waits).toEqual([]);
  });

  // QB-03: a 404 on a RETRY is no longer turned into success inside `deleteRecord`; it is thrown like any 404 and each caller decides.
  it("UT-CLIENTPOL-004 a 404 on a RETRY is thrown as a DataError with status 404 (what `deleteOr404` reads, so its read-back still runs)", async () => {
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue(bad(404));
    const error = await deleteRecord("delete x", "vsb_things", ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).status).toBe(404);
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(2);
    // The exact test `addCostSheet.deleteOr404` applies before it hands the id to `verifyNotFound`.
    expect(error instanceof DataError && error.status === 404).toBe(true);
  });

  it("UT-CLIENTPOL-005 a 404 on a retry after a thrown network error is thrown too; a plain caller (deleteIfExists) treats it as done", async () => {
    sdk.deleteRecordAsync.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(bad(404));
    await expect(deleteRecord("delete x", "vsb_things", ID)).rejects.toMatchObject({ status: 404 });
    sdk.deleteRecordAsync.mockReset();
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue(bad(404));
    await expect(deleteIfExists("delete x", "vsb_things", ID)).resolves.toBeUndefined();
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(2);
    sdk.deleteRecordAsync.mockReset();
    sdk.deleteRecordAsync.mockResolvedValue(bad(404));
    await expect(deleteIfExists("delete x", "vsb_things", ID)).resolves.toBeUndefined();
  });

  it("UT-CLIENTPOL-005b deleteIfExists with { policy: false } sends once (the caller's own policy is the one layer)", async () => {
    sdk.deleteRecordAsync.mockResolvedValue(bad(503));
    await expect(deleteIfExists("delete x", "vsb_things", ID, { policy: false })).rejects.toMatchObject({ status: 503 });
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-CLIENTPOL-006 a retry prints one [VSB] line naming the entity set, never the id", async () => {
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue(ok);
    await deleteRecord("delete x", "vsb_things", ID);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toContain("vsb_things (delete): try 1 of 3 failed (transient, HTTP 503)");
    expect(h.lines[0]).not.toContain(ID);
  });

  it("UT-CLIENTPOL-007 the switch OFF reproduces today's behaviour: a 503 is sent once and throws, no line", async () => {
    h.flags.POLICY_CLIENT_WRITES = false;
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue(ok);
    await expect(deleteRecord("delete x", "vsb_things", ID)).rejects.toMatchObject({ status: 503 });
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
    expect(h.lines).toEqual([]);
  });

  it("UT-CLIENTPOL-008 with no retry the error and the log are the same ON and OFF (differential)", async () => {
    const run = async (on: boolean) => {
      h.flags.POLICY_CLIENT_WRITES = on;
      h.lines.length = 0;
      sdk.deleteRecordAsync.mockReset();
      sdk.deleteRecordAsync.mockResolvedValue(bad(403));
      const error = await deleteRecord("delete x", "vsb_things", ID).catch((e: unknown) => e) as DataError;
      return { text: error.message, status: error.status, lines: [...h.lines], calls: sdk.deleteRecordAsync.mock.calls.length };
    };
    expect(await run(true)).toEqual(await run(false));
  });

  it("UT-CLIENTPOL-009 an explicit policy: false skips the policy even with the switch on", async () => {
    sdk.deleteRecordAsync.mockResolvedValueOnce(bad(503)).mockResolvedValue(ok);
    await expect(deleteRecord("delete x", "vsb_things", ID, { policy: false })).rejects.toMatchObject({ status: 503 });
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });
});

describe("no retry multiplication", () => {
  it("UT-CLIENTPOL-010 inside withDeleteRetry the delete is sent by ONE retry loop: a persistent 503 is 3 requests, not 9", async () => {
    sdk.deleteRecordAsync.mockResolvedValue(bad(503));
    await expect(withDeleteRetry(() => deleteRecord("delete x", "vsb_things", ID))).rejects.toMatchObject({ status: 503 });
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(3);
  });

  it("UT-CLIENTPOL-011 the nesting marker is set only while the wrapped call starts", async () => {
    expect(insideOwnRetry()).toBe(false);
    let seen: boolean | undefined;
    await withDeleteRetry(async () => { seen = insideOwnRetry(); });
    expect(seen).toBe(true);
    expect(insideOwnRetry()).toBe(false);
    await withDeleteRetry(async () => { throw new DataError("x", "denied", 403); }).catch(() => undefined);
    expect(insideOwnRetry()).toBe(false);
  });

  it("UT-CLIENTPOL-012 policyOn: the switch, an explicit value and the nesting marker", async () => {
    expect(policyOn(true)).toBe(true);
    expect(policyOn(false)).toBe(false);
    expect(policyOn(false, true)).toBe(true);
    expect(policyOn(true, false)).toBe(false);
    let inside: boolean | undefined;
    await withDeleteRetry(async () => { inside = policyOn(true, true); });
    expect(inside).toBe(false);
  });
});

describe("updateRecordIfExists", () => {
  const fake = (read: unknown[], patch: unknown[]) => {
    const reads = [...read];
    const patches = [...patch];
    const calls = { read: 0, patch: 0 };
    const client: GuardedUpdateClient = {
      retrieveMultipleRecordsAsync: (async () => { calls.read += 1; return reads.length > 1 ? reads.shift() : reads[0]; }) as never,
      updateRecordAsync: (async () => { calls.patch += 1; return patches.length > 1 ? patches.shift() : patches[0]; }) as never,
    };
    return { client, calls };
  };
  const found = { success: true as const, data: [{ pk: ID }] };
  const patched = { success: true as const, data: {} };
  const run = (c: GuardedUpdateClient, options: { policy?: boolean } = {}) =>
    updateRecordIfExists("op", "vsb_things", ID, { a: 1 }, { primaryKey: "pk", client: () => c, ...options });

  it("UT-CLIENTPOL-020 a 429 on the existence read and a 503 on the PATCH are each retried; the update completes", async () => {
    const { client, calls } = fake([bad(429), found], [bad(503), patched]);
    await run(client);
    expect(calls).toEqual({ read: 2, patch: 2 });
  });

  it("UT-CLIENTPOL-021 a 400, 403 and 409 on the PATCH are never retried; a 404 becomes RecordGoneError, also unretried", async () => {
    for (const status of [400, 403, 409]) {
      const { client, calls } = fake([found], [bad(status)]);
      await expect(run(client)).rejects.toMatchObject({ status });
      expect(calls.patch).toBe(1);
    }
    const { client, calls } = fake([found], [bad(404)]);
    await expect(run(client)).rejects.toBeInstanceOf(RecordGoneError);
    expect(calls.patch).toBe(1);
  });

  it("UT-CLIENTPOL-022 an empty existence read is RecordGoneError with nothing sent", async () => {
    const { client, calls } = fake([{ success: true as const, data: [] }], [patched]);
    await expect(run(client)).rejects.toBeInstanceOf(RecordGoneError);
    expect(calls).toEqual({ read: 1, patch: 0 });
  });

  it("UT-CLIENTPOL-023 the switch OFF (or policy: false) sends each request once", async () => {
    h.flags.POLICY_CLIENT_WRITES = false;
    const a = fake([bad(429), found], [patched]);
    await expect(run(a.client)).rejects.toMatchObject({ status: 429 });
    expect(a.calls).toEqual({ read: 1, patch: 0 });
    h.flags.POLICY_CLIENT_WRITES = true;
    const b = fake([found], [bad(503), patched]);
    await expect(run(b.client, { policy: false })).rejects.toMatchObject({ status: 503 });
    expect(b.calls).toEqual({ read: 1, patch: 1 });
  });

  it("UT-CLIENTPOL-024 inside withDeleteRetry's start the guarded update does not retry on its own (no stacking)", async () => {
    const { client, calls } = fake([found], [bad(503)]);
    await expect(withDeleteRetry(() => run(client), { maxTries: 1 })).rejects.toMatchObject({ status: 503 });
    expect(calls.patch).toBe(1);
  });
});

describe("readPolicyPage", () => {
  it("UT-CLIENTPOL-030 a page that answers 503 once is read again; the result is the page's own", async () => {
    const page = vi.fn().mockResolvedValueOnce(bad(503)).mockResolvedValue({ success: true, data: [1] });
    const wrapped = readPolicyPage("vsb_things", page, true);
    await expect(wrapped({ select: ["a"] })).resolves.toEqual({ success: true, data: [1] });
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenLastCalledWith({ select: ["a"] });
  });

  it("UT-CLIENTPOL-031 a page that keeps failing is returned UNCHANGED (fetchAll's unwrap reports it); a 403 is sent once", async () => {
    const failure = bad(403);
    const page = vi.fn().mockResolvedValue(failure);
    await expect(readPolicyPage("vsb_things", page, true)({})).resolves.toBe(failure);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("UT-CLIENTPOL-032 disabled it returns the page function itself (the switch OFF is the old code)", () => {
    const page = vi.fn();
    expect(readPolicyPage("vsb_things", page, false)).toBe(page);
  });
});
