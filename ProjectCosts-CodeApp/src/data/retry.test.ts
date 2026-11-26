/**
 * UT-RETRY-001.. — the delete retry (`withDeleteRetry`, `deleteRetryDelay`) and the helpers moved out of
 * `generatorsBulk.ts` (still importable from there; `generatorsBulk.test.ts` UT-GENBULK-043 keeps pinning them).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataError } from "@/platform/errors";

// dvopt T-10: this file pins the PREVIOUS retry rules (1 s x attempt waits, 3 tries, a bare 503 not retried), which are now the
// `RETRY_POLICY_V2 = false` rollback path. The new rules are pinned in `retry.v2.test.ts`; `retry.legacyEquality.test.ts` proves the two paths.
vi.mock("./requestFlags", () => ({ RETRY_POLICY_V2: false, REQUEST_DEADLINES: false, GLOBAL_GATE: false }));
import * as bulk from "./generatorsBulk";
import {
  deleteRetryDelay, MAX_BULK_TRIES, MAX_NO_STATUS_TRIES, MAX_RETRY_WAIT_MS, retryAfterMs, retryDelay, setDeleteSleeper, withDeleteRetry,
} from "./retry";

const http = (status: number, headers?: Record<string, string>) =>
  Object.assign(new Error(`HTTP ${status}`), { status, ...(headers ? { headers } : {}) });

/** A DELETE that fails with each of `errors` in turn, then succeeds. */
function flaky(errors: unknown[]) {
  let n = 0;
  const op = vi.fn(async () => {
    const next = errors[n];
    n += 1;
    if (next !== undefined) throw next;
    return "ok";
  });
  return op;
}

const harness = () => {
  const waits: number[] = [];
  const lines: string[] = [];
  return {
    waits, lines,
    o: { sleep: async (ms: number) => { waits.push(ms); }, log: (l: string) => { lines.push(l); } },
  };
};

afterEach(() => setDeleteSleeper(null));

describe("withDeleteRetry", () => {
  it.each([
    ["429", http(429), "HTTP 429"],
    ["503 with Retry-After", http(503, { "retry-after": "3" }), "HTTP 503"],
    ["500", http(500), "HTTP 500"],
    ["504", http(504), "HTTP 504"],
    ["a network error (no status)", new TypeError("Failed to fetch"), "network error"],
  ])("UT-RETRY-001 retries %s once and then succeeds, printing one line", async (_name, error, text) => {
    const h = harness();
    const op = flaky([error]);
    await expect(withDeleteRetry(op, h.o)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
    expect(h.waits).toHaveLength(1);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toContain(text);
  });

  it("UT-RETRY-002 a 503 WITHOUT Retry-After is not retried", async () => {
    const h = harness();
    const op = flaky([http(503)]);
    await expect(withDeleteRetry(op, h.o)).rejects.toMatchObject({ status: 503 });
    expect(op).toHaveBeenCalledTimes(1);
    expect(h.lines).toEqual([]);
  });

  it.each([400, 401, 403, 404, 409])("UT-RETRY-003 never retries HTTP %i", async (status) => {
    const h = harness();
    const op = flaky([http(status), http(status)]);
    await expect(withDeleteRetry(op, h.o)).rejects.toMatchObject({ status });
    expect(op).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
    expect(h.lines).toEqual([]);
  });

  it("UT-RETRY-004 stops after 3 tries in all and throws the LAST error unchanged", async () => {
    const h = harness();
    const last = http(500);
    const op = flaky([http(429), http(500), last, http(500)]);
    await expect(withDeleteRetry(op, h.o)).rejects.toBe(last);
    expect(op).toHaveBeenCalledTimes(3);
    expect(h.lines).toHaveLength(2);
  });

  it("UT-RETRY-005 without Retry-After the waits are 1 s, then 2 s", async () => {
    const h = harness();
    await withDeleteRetry(flaky([http(500), http(429)]), h.o);
    expect(h.waits).toEqual([1000, 2000]);
  });

  it("UT-RETRY-006 honours Retry-After (seconds), capped at MAX_RETRY_WAIT_MS", async () => {
    const h = harness();
    await withDeleteRetry(flaky([http(429, { "retry-after": "7" }), http(503, { "Retry-After": "600" })]), h.o);
    expect(h.waits).toEqual([7000, MAX_RETRY_WAIT_MS]);
  });

  it("UT-RETRY-007 reads Retry-After from the SDK error under a DataError (the cause chain)", async () => {
    const h = harness();
    const wrapped = new DataError("delete x", http(429, { "retry-after": "4" }), 429);
    await withDeleteRetry(flaky([wrapped]), h.o);
    expect(h.waits).toEqual([4000]);
  });

  it("UT-RETRY-008 a DataError's own status decides, whatever the cause says", async () => {
    const h = harness();
    const op = flaky([new DataError("delete x", "denied", 403)]);
    await expect(withDeleteRetry(op, h.o)).rejects.toBeInstanceOf(DataError);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("UT-RETRY-009 each retry prints ONE line with the status and the wait, and never an id or a value", async () => {
    const h = harness();
    const id = "11111111-2222-3333-4444-555555555555";
    await withDeleteRetry(flaky([Object.assign(new Error(`delete ${id} failed`), { status: 500 })]), h.o);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).not.toContain(id);
    expect(h.lines[0]).toMatch(/try 1 of 3 failed \(HTTP 500\); trying again in 1000 ms/);
  });

  it("UT-RETRY-010 the default log is one [VSB] ACTION warn line through logAction", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await withDeleteRetry(flaky([http(429)]), { sleep: async () => undefined });
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("[VSB] ACTION"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("delete try 1 of 3");
    } finally {
      warn.mockRestore();
    }
  });

  it("UT-RETRY-011 maxTries 1 never retries; maxTries 2 retries once", async () => {
    const h = harness();
    const one = flaky([http(500)]);
    await expect(withDeleteRetry(one, { ...h.o, maxTries: 1 })).rejects.toMatchObject({ status: 500 });
    expect(one).toHaveBeenCalledTimes(1);
    const two = flaky([http(500), http(500), http(500)]);
    await expect(withDeleteRetry(two, { ...h.o, maxTries: 2 })).rejects.toMatchObject({ status: 500 });
    expect(two).toHaveBeenCalledTimes(2);
  });

  it("UT-RETRY-012 the sleeper test seam replaces the real timer when the caller passes none", async () => {
    const waits: number[] = [];
    setDeleteSleeper(async (ms) => { waits.push(ms); });
    await withDeleteRetry(flaky([http(500)]), { log: () => undefined });
    expect(waits).toEqual([1000]);
  });

  it("UT-RETRY-013 deleteRetryDelay is pure: the table of statuses and attempts", () => {
    expect(deleteRetryDelay(http(429), 1)).toBe(1000);
    expect(deleteRetryDelay(http(500), 2)).toBe(2000);
    expect(deleteRetryDelay(http(500), 3)).toBeUndefined();
    expect(deleteRetryDelay(http(503), 1)).toBeUndefined();
    expect(deleteRetryDelay(http(503, { "retry-after": "2" }), 1)).toBe(2000);
    expect(deleteRetryDelay(http(502), 1)).toBeUndefined();
    expect(deleteRetryDelay(undefined, 1)).toBe(1000);
    expect(deleteRetryDelay(http(404), 1)).toBeUndefined();
  });

  it("UT-RETRY-100 an error with NO status is retried at most once (2 tries in all)", async () => {
    const h = harness();
    const last = new TypeError("boom");
    const op = flaky([new TypeError("first"), last, new TypeError("third")]);
    await expect(withDeleteRetry(op, h.o)).rejects.toBe(last);
    expect(op).toHaveBeenCalledTimes(MAX_NO_STATUS_TRIES);
    expect(h.waits).toEqual([1000]);
    expect(h.lines).toHaveLength(1);
  });

  it("UT-RETRY-101 an error WITH a retryable status keeps 3 tries (429, 500, 504, 503 with Retry-After)", async () => {
    for (const error of [http(429), http(500), http(504), http(503, { "retry-after": "1" })]) {
      const h = harness();
      const op = flaky([error, error, error, error]);
      await expect(withDeleteRetry(op, h.o)).rejects.toBe(error);
      expect(op).toHaveBeenCalledTimes(3);
    }
  });

  it("UT-RETRY-102 deleteRetryDelay: no status stops at attempt 2, a status does not", () => {
    expect(deleteRetryDelay(undefined, 1)).toBe(1000);
    expect(deleteRetryDelay(undefined, 2)).toBeUndefined();
    expect(deleteRetryDelay(new TypeError("x"), 2)).toBeUndefined();
    expect(deleteRetryDelay(http(500), 2)).toBe(2000);
    expect(deleteRetryDelay(new DataError("d", new TypeError("x"), undefined), 2)).toBeUndefined();
  });
});

describe("the helpers moved out of generatorsBulk.ts", () => {
  it("UT-RETRY-014 generatorsBulk re-exports the SAME functions and constants", () => {
    expect(bulk.retryAfterMs).toBe(retryAfterMs);
    expect(bulk.retryDelay).toBe(retryDelay);
    expect(bulk.MAX_BULK_TRIES).toBe(MAX_BULK_TRIES);
    expect(bulk.MAX_RETRY_WAIT_MS).toBe(MAX_RETRY_WAIT_MS);
    expect(MAX_BULK_TRIES).toBe(3);
    expect(MAX_RETRY_WAIT_MS).toBe(30_000);
  });

  it("UT-RETRY-015 the bulk policy is unchanged: only 429, and 503 with Retry-After, are retried", () => {
    expect(retryDelay(http(429), 1)).toBe(1000);
    expect(retryDelay(http(500), 1)).toBeUndefined();
    expect(retryDelay(new TypeError("network"), 1)).toBeUndefined();
    expect(retryDelay(http(503), 1)).toBeUndefined();
    expect(retryDelay(http(503, { "retry-after": "1" }), 1)).toBe(1000);
    expect(retryDelay(http(429), 3)).toBeUndefined();
  });
});
