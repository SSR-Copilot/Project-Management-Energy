/**
 * UT-RETRYV2-1NN: `RETRY_POLICY_V2 = false` reproduces the previous retry logic exactly (dvopt T-10, rule 3 of the programme).
 * The ORACLES below are the pre-change implementations, copied verbatim from `retry.ts` at commit 30afece. The flag is flipped
 * through a mocked `./requestFlags`; the real `retryDelay`, `deleteRetryDelay` and `withDeleteRetry` are compared with the oracles
 * over a grid of statuses, headers, attempts and tries.
 */
import { describe, expect, it, vi } from "vitest";
import { DataError } from "@/platform/errors";

const flags = vi.hoisted(() => ({ v2: false }));
vi.mock("./requestFlags", () => ({
  get RETRY_POLICY_V2() { return flags.v2; },
  REQUEST_DEADLINES: false,
  GLOBAL_GATE: false,
}));

import {
  deleteRetryDelay, legacyDeleteRetryDelay, legacyRetryDelay, MAX_BULK_TRIES, MAX_NO_STATUS_TRIES, MAX_RETRY_WAIT_MS, retryAfterMs,
  retryDelay, withDeleteRetry,
} from "./retry";

/* ── oracles: the previous code, verbatim ── */
const oStatusOf = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  const status = e["status"] ?? e["statusCode"];
  return typeof status === "number" ? status : undefined;
};
function oChain(error: unknown): unknown[] {
  const out: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    out.push(current);
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
  }
  return out;
}
function oFirst<T>(values: Iterable<T | undefined>): T | undefined {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
}
function oracleRetryDelay(error: unknown, attempt: number, now: number): number | undefined {
  if (attempt >= MAX_BULK_TRIES) return undefined;
  const status = oStatusOf(error);
  const header = retryAfterMs(error, now);
  if (status !== 429 && !(status === 503 && header !== undefined)) return undefined;
  return Math.min(header ?? 1000 * attempt, MAX_RETRY_WAIT_MS);
}
function oracleDeleteRetryDelay(error: unknown, attempt: number, maxTries: number, now: number): number | undefined {
  if (attempt >= maxTries) return undefined;
  const chain = oChain(error);
  const status = oFirst(chain.map(oStatusOf));
  if (status === undefined && attempt >= MAX_NO_STATUS_TRIES) return undefined;
  const header = oFirst(chain.map((e) => retryAfterMs(e, now)));
  const retryable = status === undefined || status === 429 || status === 500 || status === 504 || (status === 503 && header !== undefined);
  if (!retryable) return undefined;
  return Math.min(header ?? 1000 * attempt, MAX_RETRY_WAIT_MS);
}

const statuses = [undefined, 400, 401, 403, 404, 408, 409, 412, 429, 500, 501, 502, 503, 504];
const headerVariants = [undefined, "1", "3", "45", "Thu, 01 Jan 1970 00:00:10 GMT", "junk"];
const grid: unknown[] = [];
for (const status of statuses) {
  for (const h of headerVariants) {
    const e = Object.assign(new Error("x"), status === undefined ? {} : { status }, h === undefined ? {} : { headers: { "retry-after": h } });
    grid.push(e);
    grid.push(new DataError("op", e, status));
  }
}
grid.push(undefined, null, "text", new TypeError("network"));

describe("RETRY_POLICY_V2 = false equals the previous logic (UT-RETRYV2-1NN)", () => {
  it("UT-RETRYV2-100 retryDelay equals the oracle on every error, attempt 1 to 5 (flag off)", () => {
    flags.v2 = false;
    let compared = 0;
    for (const error of grid) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect(retryDelay(error, attempt, 0)).toBe(oracleRetryDelay(error, attempt, 0));
        expect(legacyRetryDelay(error, attempt, 0)).toBe(oracleRetryDelay(error, attempt, 0));
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(400);
  });

  it("UT-RETRYV2-101 deleteRetryDelay equals the oracle for every error, attempt and maxTries (flag off)", () => {
    flags.v2 = false;
    for (const error of grid) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        for (const maxTries of [1, 2, 3, 5]) {
          expect(deleteRetryDelay(error, attempt, maxTries, 0)).toBe(oracleDeleteRetryDelay(error, attempt, maxTries, 0));
          expect(legacyDeleteRetryDelay(error, attempt, maxTries, 0)).toBe(oracleDeleteRetryDelay(error, attempt, maxTries, 0));
        }
        // The default maxTries is 3, as before.
        expect(deleteRetryDelay(error, attempt, undefined, 0)).toBe(oracleDeleteRetryDelay(error, attempt, 3, 0));
      }
    }
  });

  it("UT-RETRYV2-102 withDeleteRetry (flag off): 3 tries, waits 1 s then 2 s, the old log line, a bare 503 not retried", async () => {
    flags.v2 = false;
    const waits: number[] = [];
    const lines: string[] = [];
    const o = { sleep: async (ms: number) => { waits.push(ms); }, log: (l: string) => { lines.push(l); } };
    let calls = 0;
    await expect(withDeleteRetry(async () => { calls += 1; throw { status: 500 }; }, o)).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(3);
    expect(waits).toEqual([1000, 2000]);
    expect(lines).toEqual([
      "delete try 1 of 3 failed (HTTP 500); trying again in 1000 ms",
      "delete try 2 of 3 failed (HTTP 500); trying again in 2000 ms",
    ]);
    calls = 0;
    await expect(withDeleteRetry(async () => { calls += 1; throw { status: 503 }; }, o)).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(1);
  });

  it("UT-RETRYV2-103 the switch really selects: flag on differs from the oracle exactly where intended (bare 503 delete, 3rd 429)", () => {
    flags.v2 = true;
    expect(deleteRetryDelay({ status: 503 }, 1, undefined, 0, () => 0.5)).toBe(500);
    expect(oracleDeleteRetryDelay({ status: 503 }, 1, 3, 0)).toBeUndefined();
    // QA-04: the third 429 is attempt 3, equal jitter on a 2 s base: ceiling 8 s, so 0.5 gives 6 s.
    expect(retryDelay({ status: 429 }, 3, 0, () => 0.5)).toBe(6000);
    expect(oracleRetryDelay({ status: 429 }, 3, 0)).toBeUndefined();
    flags.v2 = false;
  });
});
