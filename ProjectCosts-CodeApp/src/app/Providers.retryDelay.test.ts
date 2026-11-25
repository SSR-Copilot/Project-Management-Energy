// @vitest-environment jsdom
/**
 * UT-PROVRETRY-NNN: the query client's jittered `retryDelay` (dvopt T-10, OR-01). Reads keep their 2 retries; only the wait changes.
 */
import { describe, expect, it, vi } from "vitest";
import { DataError } from "@/platform/errors";

const flags = vi.hoisted(() => ({ v2: true }));
vi.mock("@/data/requestFlags", () => ({
  get RETRY_POLICY_V2() { return flags.v2; },
  REQUEST_DEADLINES: false,
  GLOBAL_GATE: false,
}));

import { queryRetryDelay } from "@/data/retry";
import { queryClient } from "./Providers";

describe("queryRetryDelay (UT-PROVRETRY)", () => {
  it("UT-PROVRETRY-001 full jitter on the shared schedule: failureCount 0, 1, 2 give < 1 s, < 2 s, < 4 s", () => {
    flags.v2 = true;
    expect(queryRetryDelay(0, undefined, () => 0)).toBe(0);
    expect(queryRetryDelay(0, new DataError("read", "x", 503), () => 0.5)).toBe(500);
    // QA-04: a 429 read (failureCount 1 = attempt 2) waits equal jitter on a 2 s base: 2 s at random 0, 3 s at 0.5, under 4 s at the top.
    expect(queryRetryDelay(1, new DataError("read", "x", 429), () => 0)).toBe(2000);
    expect(queryRetryDelay(1, new DataError("read", "x", 429), () => 0.5)).toBe(3000);
    expect(queryRetryDelay(1, new DataError("read", "x", 429), () => 0.999)).toBeLessThan(4000);
    expect(queryRetryDelay(2, undefined, () => 0.999)).toBe(3996);
  });

  it("UT-PROVRETRY-002 two reads that failed together do not retry in step (different jitter)", () => {
    flags.v2 = true;
    const draws = [0.1, 0.9];
    expect(queryRetryDelay(1, undefined, () => draws[0] as number)).not.toBe(queryRetryDelay(1, undefined, () => draws[1] as number));
  });

  it("UT-PROVRETRY-003 never above the 15 s cap, however many failures", () => {
    flags.v2 = true;
    expect(queryRetryDelay(30, undefined, () => 0.999999)).toBeLessThan(15_000);
  });

  it("UT-PROVRETRY-004 with RETRY_POLICY_V2 off it is TanStack's default, min(1000 * 2^n, 30000)", () => {
    flags.v2 = false;
    expect([0, 1, 2, 5, 9].map((n) => queryRetryDelay(n, undefined, () => 0))).toEqual([1000, 2000, 4000, 30_000, 30_000]);
    flags.v2 = true;
  });

  it("UT-PROVRETRY-005 the app's query client uses it, and still retries a read at most twice, never a 403 or a deterministic failure", () => {
    const q = queryClient.getDefaultOptions().queries;
    expect(q?.retryDelay).toBe(queryRetryDelay);
    const retry = q?.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new DataError("read", "x", 503))).toBe(true);
    expect(retry(1, new DataError("read", "x", 503))).toBe(true);
    expect(retry(2, new DataError("read", "x", 503))).toBe(false);
    expect(retry(0, new DataError("read", "x", 403))).toBe(false);
    expect(retry(0, DataError.deterministic("fetchAll cap", "too many pages"))).toBe(false);
  });
});
