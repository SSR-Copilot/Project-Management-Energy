/**
 * UT-RETRYV2-NNN: the status-based retry policy (dvopt T-10, `RETRY_POLICY_V2` on, the default). SDK-shaped errors, no headers.
 * The previous rules stay pinned in `retry.test.ts` (flag off); their equality with the `legacy*` functions is in
 * `retry.legacyEquality.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { DataError } from "@/platform/errors";
import {
  BACKOFF_CAP_MS, backoffMs, deleteRetryDelay, MAX_NO_STATUS_TRIES, MAX_RETRY_WAIT_MS, retryAfterMs, retryDelay, THROTTLED_TRIES,
  TRANSIENT_TRIES, triesFor, withDeleteRetry,
} from "./retry";

const sdk = (status?: number) => ({ message: `HTTP ${status}`, ...(status === undefined ? {} : { status }) });
const withHeader = (status: number, seconds: string) => Object.assign(new Error("x"), { status, headers: { "retry-after": seconds } });
const max = () => 0.999999;

describe("backoffMs (UT-RETRYV2)", () => {
  it("UT-RETRYV2-001 full jitter: 0 <= wait < min(cap, 1000 * 2^(attempt-1)) for every attempt", () => {
    const ceilings = [1000, 2000, 4000, 8000, 15000, 15000, 15000];
    ceilings.forEach((ceiling, i) => {
      const attempt = i + 1;
      expect(backoffMs({ cls: "transient", attempt, random: () => 0 })).toBe(0);
      expect(backoffMs({ cls: "transient", attempt, random: () => 0.5 })).toBe(ceiling / 2);
      const top = backoffMs({ cls: "throttled", attempt, random: max });
      expect(top).toBeLessThan(ceiling);
      expect(top).toBeGreaterThanOrEqual(ceiling - 2);
    });
  });

  it("UT-RETRYV2-002 never exceeds the cap, however many tries; whole milliseconds", () => {
    for (const attempt of [5, 10, 40, 1000]) {
      const w = backoffMs({ cls: "transient", attempt, random: max });
      expect(w).toBeLessThan(BACKOFF_CAP_MS);
      expect(Number.isInteger(w)).toBe(true);
    }
  });

  it("UT-RETRYV2-003 a bad attempt or a random outside [0, 1) is clamped, not NaN", () => {
    expect(backoffMs({ cls: "transient", attempt: 0, random: max })).toBeLessThan(1000);
    expect(backoffMs({ cls: "transient", attempt: -3, random: max })).toBeLessThan(1000);
    expect(backoffMs({ cls: "transient", attempt: 1, random: () => 7 })).toBeLessThan(1000);
    expect(backoffMs({ cls: "transient", attempt: 1, random: () => -1 })).toBe(0);
  });

  it("UT-RETRYV2-004 uses Math.random when none is injected", () => {
    const w = backoffMs({ cls: "transient", attempt: 2 });
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(2000);
  });

  it("UT-RETRYV2-005 tries per class: transient 3, throttled 4, everything else 1", () => {
    expect(triesFor("transient")).toBe(TRANSIENT_TRIES);
    expect(TRANSIENT_TRIES).toBe(3);
    expect(triesFor("throttled")).toBe(THROTTLED_TRIES);
    expect(THROTTLED_TRIES).toBe(4);
    for (const cls of ["validation", "auth", "permission", "notFound", "conflict", "unknown"] as const) expect(triesFor(cls)).toBe(1);
  });
});

describe("retryDelay, a bulk request (UT-RETRYV2)", () => {
  it("UT-RETRYV2-010 a 429 is retried up to 4 tries with a jittered wait", () => {
    for (const attempt of [1, 2, 3]) {
      const w = retryDelay(sdk(429), attempt, 0, max);
      expect(w).toBeDefined();
      expect(w).toBeLessThan(Math.min(BACKOFF_CAP_MS, 1000 * 2 ** (attempt - 1)));
    }
    expect(retryDelay(sdk(429), 1, 0, () => 0)).toBe(0);
    expect(retryDelay(sdk(429), THROTTLED_TRIES, 0, max)).toBeUndefined();
  });

  it("UT-RETRYV2-011 a bare 503, a 500, a 504 and a network failure are NOT retried for a bulk write", () => {
    for (const e of [sdk(503), sdk(500), sdk(504), sdk(502), new TypeError("Failed to fetch"), sdk(400), sdk(403), sdk(409), sdk(501)]) {
      expect(retryDelay(e, 1, 0, max)).toBeUndefined();
    }
  });

  it("UT-RETRYV2-012 a Retry-After header, if a host ever exposes one, wins over the backoff and is capped at 30 s", () => {
    expect(retryDelay(withHeader(429, "3"), 1, 0, max)).toBe(3000);
    expect(retryDelay(withHeader(429, "120"), 1, 0, max)).toBe(MAX_RETRY_WAIT_MS);
    expect(retryDelay(withHeader(503, "2"), 1, 0, max)).toBe(2000);
    expect(retryAfterMs(withHeader(429, "3"))).toBe(3000);
  });

  it("UT-RETRYV2-013 the status is read through a DataError cause chain", () => {
    expect(retryDelay(new DataError("bulk", sdk(429)), 1, 0, () => 0)).toBe(0);
    expect(retryDelay(new DataError("bulk", sdk(500)), 1, 0, () => 0)).toBeUndefined();
  });
});

describe("deleteRetryDelay and withDeleteRetry (UT-RETRYV2)", () => {
  it.each([429, 500, 502, 503, 504, 408])("UT-RETRYV2-020 a DELETE answered %s is retried, with no Retry-After needed", (status) => {
    expect(deleteRetryDelay(sdk(status), 1, undefined, 0, max)).toBeDefined();
  });

  it.each([400, 401, 403, 404, 409, 412, 501])("UT-RETRYV2-021 a DELETE answered %s is never retried", (status) => {
    expect(deleteRetryDelay(sdk(status), 1, undefined, 0, max)).toBeUndefined();
  });

  it("UT-RETRYV2-022 tries: 429 gets 4, a transient failure 3, no status 2, and an explicit maxTries is honoured", () => {
    expect(deleteRetryDelay(sdk(429), 3, undefined, 0, max)).toBeDefined();
    expect(deleteRetryDelay(sdk(429), 4, undefined, 0, max)).toBeUndefined();
    expect(deleteRetryDelay(sdk(503), 2, undefined, 0, max)).toBeDefined();
    expect(deleteRetryDelay(sdk(503), 3, undefined, 0, max)).toBeUndefined();
    expect(deleteRetryDelay(undefined, 1, undefined, 0, max)).toBeDefined();
    expect(deleteRetryDelay(undefined, MAX_NO_STATUS_TRIES, undefined, 0, max)).toBeUndefined();
    expect(deleteRetryDelay(sdk(429), 2, 2, 0, max)).toBeUndefined();
    expect(deleteRetryDelay(sdk(500), 5, 9, 0, max)).toBeDefined();
  });

  it("UT-RETRYV2-023 a deterministic DataError is never retried, whatever its status", () => {
    expect(deleteRetryDelay(DataError.deterministic("cap", "x", 500), 1, undefined, 0, max)).toBeUndefined();
  });

  it("UT-RETRYV2-024 withDeleteRetry on a bare 503: retried with the injected jitter, ONE log line per retry, no id or value in it", async () => {
    const waits: number[] = [];
    const lines: string[] = [];
    let calls = 0;
    const op = async () => { calls += 1; if (calls < 3) throw sdk(503); return "ok"; };
    await expect(withDeleteRetry(op, {
      sleep: async (ms) => { waits.push(ms); }, log: (l) => lines.push(l), random: () => 0.5,
    })).resolves.toBe("ok");
    expect(calls).toBe(3);
    expect(waits).toEqual([500, 1000]);
    expect(lines).toEqual([
      "delete try 1 of 3 failed (HTTP 503); trying again in 500 ms",
      "delete try 2 of 3 failed (HTTP 503); trying again in 1000 ms",
    ]);
  });

  it("UT-RETRYV2-025 withDeleteRetry gives a 429 four tries and then throws the last error unchanged", async () => {
    const error = sdk(429);
    let calls = 0;
    const op = async () => { calls += 1; throw error; };
    await expect(withDeleteRetry(op, { sleep: async () => {}, log: () => {}, random: () => 0 })).rejects.toBe(error);
    expect(calls).toBe(4);
  });

  it("UT-RETRYV2-026 withDeleteRetry does not retry a 404 or a 403", async () => {
    for (const status of [404, 403]) {
      let calls = 0;
      const op = async () => { calls += 1; throw sdk(status); };
      await expect(withDeleteRetry(op, { sleep: async () => {}, log: () => {} })).rejects.toMatchObject({ status });
      expect(calls).toBe(1);
    }
  });
});
