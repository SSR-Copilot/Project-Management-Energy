/**
 * UT-REQPOL-NNN: `sendWithPolicy`, `withDeadline`, `policyDelay` (dvopt T-10, T-12, T-13): the idempotency matrix of doc 21 section 2,
 * the deadline with fake timers, the gate integration (a retry wait holds no slot) and the switch-off paths.
 * Errors are SDK-shaped (`{ message, status }`, no headers).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataError, UnknownOutcomeError } from "@/platform/errors";
import { createRequestGate } from "./concurrency";
import {
  mayRetry, policyDelay, READ_DEADLINE_MS, sendWithPolicy, withDeadline, WRITE_DEADLINE_MS, type PolicyOptions, type RequestKind,
} from "./requestPolicy";

const sdk = (status?: number) => ({ message: `HTTP ${status}`, ...(status === undefined ? {} : { status }) });
const KINDS: RequestKind[] = ["read", "delete", "patchAbsolute", "create", "bulk"];
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

/** Options that never sleep and never print; `waits` and `lines` record what would have happened. */
function quiet(extra: PolicyOptions = {}) {
  const waits: number[] = [];
  const lines: string[] = [];
  const opts: PolicyOptions = {
    sleep: async (ms) => { waits.push(ms); }, log: (l) => { lines.push(l); }, random: () => 0.5, ...extra,
  };
  return { waits, lines, opts };
}

/** A request that fails with each of `failures` in turn (thrown), then answers "ok". */
function failing(failures: unknown[]) {
  let n = 0;
  const fn = vi.fn(async () => {
    const next = failures[n];
    n += 1;
    if (next !== undefined) throw next;
    return "ok";
  });
  return fn;
}

afterEach(() => { vi.useRealTimers(); });

describe("the idempotency matrix (UT-REQPOL)", () => {
  it.each(KINDS)("UT-REQPOL-001 %s: a 429 (not processed) is retried, then succeeds", async (kind) => {
    const q = quiet();
    const fn = failing([sdk(429)]);
    await expect(sendWithPolicy(kind, fn, q.opts)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    // QA-04: a 429 waits equal jitter on a 2 s base: attempt 1, random 0.5 gives 1000 + 0.5 * 1000.
    expect(q.waits).toEqual([1500]);
    expect(q.lines).toHaveLength(1);
  });

  it.each([
    ["read", true], ["delete", true], ["patchAbsolute", true], ["create", false], ["bulk", false],
  ] as const)("UT-REQPOL-002 %s: a 503 / 500 / network drop is retried = %s", async (kind, retried) => {
    for (const failure of [sdk(503), sdk(500), sdk(504), new TypeError("Failed to fetch")]) {
      const q = quiet();
      const fn = failing([failure]);
      if (retried) {
        await expect(sendWithPolicy(kind, fn, q.opts)).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(2);
      } else {
        await expect(sendWithPolicy(kind, fn, q.opts)).rejects.toBe(failure);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(q.lines).toEqual([]);
      }
    }
  });

  it.each(KINDS)("UT-REQPOL-003 %s: 400, 401, 403, 404, 409, 412, 501 are never retried; the same error is thrown", async (kind) => {
    for (const status of [400, 401, 403, 404, 409, 412, 501]) {
      const q = quiet();
      const error = sdk(status);
      const fn = failing([error]);
      await expect(sendWithPolicy(kind, fn, q.opts)).rejects.toBe(error);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("UT-REQPOL-004 tries: a 429 gets 4, a transient failure 3 (read), a failure with no status 2", async () => {
    for (const [failure, tries] of [[sdk(429), 4], [sdk(503), 3], [new TypeError("Failed to fetch"), 2]] as const) {
      const q = quiet();
      const fn = failing(Array.from({ length: 10 }, () => failure));
      await expect(sendWithPolicy("read", fn, q.opts)).rejects.toBe(failure);
      expect(fn).toHaveBeenCalledTimes(tries);
      expect(q.waits).toHaveLength(tries - 1);
    }
  });

  it("UT-REQPOL-005 a 429 waits equal jitter on a 2 s base: attempt n waits c/2 + random * c/2, c = min(15 s, 2 s * 2^(n-1))", async () => {
    const q = quiet({ random: () => 0.999 });
    const fn = failing([sdk(429), sdk(429), sdk(429)]);
    await sendWithPolicy("read", fn, q.opts);
    expect(q.waits).toEqual([1999, 3998, 7996]);
  });

  it("UT-REQPOL-006 maxTries caps the tries below the class's own number", async () => {
    const q = quiet({ maxTries: 2 });
    const fn = failing(Array.from({ length: 5 }, () => sdk(429)));
    await expect(sendWithPolicy("delete", fn, q.opts)).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("UT-REQPOL-007 the status is read through a DataError cause chain, and a deterministic DataError is never retried", async () => {
    const q = quiet();
    const fn = failing([new DataError("read x", sdk(429))]);
    await expect(sendWithPolicy("read", fn, q.opts)).resolves.toBe("ok");
    const cap = DataError.deterministic("fetchAll cap", "too many pages");
    const g = failing([cap]);
    await expect(sendWithPolicy("read", g, quiet().opts)).rejects.toBe(cap);
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("UT-REQPOL-008 a Retry-After header, if a host exposes one, wins over the jitter", async () => {
    const q = quiet();
    const fn = failing([Object.assign(new Error("x"), { status: 429, headers: { "retry-after": "7" } })]);
    await sendWithPolicy("create", fn, q.opts);
    expect(q.waits).toEqual([7000]);
  });

  it("UT-REQPOL-009 mayRetry is the matrix", () => {
    expect(mayRetry("create", "throttled")).toBe(true);
    expect(mayRetry("create", "transient")).toBe(false);
    expect(mayRetry("bulk", "transient")).toBe(false);
    expect(mayRetry("read", "transient")).toBe(true);
    for (const kind of KINDS) {
      for (const cls of ["validation", "auth", "permission", "notFound", "conflict", "unknown"] as const) expect(mayRetry(kind, cls)).toBe(false);
    }
  });

  it("UT-REQPOL-010 a bulk request keeps the bulk rule: a 503 is retried only with Retry-After, and never a 500", async () => {
    expect(policyDelay("bulk", sdk(503), 1, { random: () => 0.5 })).toBeUndefined();
    expect(policyDelay("bulk", Object.assign(new Error("x"), { status: 503, headers: { "retry-after": "2" } }), 1)).toBe(2000);
    expect(policyDelay("bulk", sdk(500), 1)).toBeUndefined();
    expect(policyDelay("bulk", sdk(429), 4)).toBeUndefined();
  });
});

describe("IOperationResult handling (UT-REQPOL)", () => {
  it("UT-REQPOL-020 a success result passes through untouched", async () => {
    const result = { success: true, data: [1, 2, 3] };
    await expect(sendWithPolicy("read", async () => result, quiet().opts)).resolves.toBe(result);
  });

  it("UT-REQPOL-021 a {success:false} with a 429 is retried; the later success is returned", async () => {
    const q = quiet();
    const answers = [{ success: false, error: sdk(429) }, { success: false, error: sdk(429) }, { success: true, data: "row" }];
    let n = 0;
    const fn = vi.fn(async () => answers[n++]);
    await expect(sendWithPolicy("create", fn, q.opts)).resolves.toEqual({ success: true, data: "row" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("UT-REQPOL-022 a non-retryable failed result is returned UNCHANGED (same object), so unwrap behaves as before", async () => {
    const failed = { success: false, error: sdk(403) };
    const fn = vi.fn(async () => failed);
    await expect(sendWithPolicy("read", fn, quiet().opts)).resolves.toBe(failed);
    expect(fn).toHaveBeenCalledTimes(1);
    // A create that failed with a 500 is not retried either: the failed result comes back as it is.
    const failed500 = { success: false, error: sdk(500) };
    await expect(sendWithPolicy("create", async () => failed500, quiet().opts)).resolves.toBe(failed500);
  });

  it("UT-REQPOL-023 retries exhausted on a failed result: the LAST failed result is returned, not thrown", async () => {
    const results = Array.from({ length: 6 }, (_, i) => ({ success: false, error: sdk(429), i }));
    let n = 0;
    const out = await sendWithPolicy("read", async () => results[n++], quiet().opts);
    expect(out).toBe(results[3]);
  });
});

describe("log lines (UT-REQPOL)", () => {
  it("UT-REQPOL-030 exactly one line per retry: label, kind, class, status, try and wait; never an id or a value", async () => {
    const q = quiet();
    const fn = failing([sdk(503), sdk(429)]);
    await sendWithPolicy("read", fn, { ...q.opts, label: "vsb_projects" });
    expect(q.lines).toEqual([
      "vsb_projects (read): try 1 of 3 failed (transient, HTTP 503); trying again in 500 ms",
      "vsb_projects (read): try 2 of 4 failed (throttled, HTTP 429); trying again in 3000 ms",
    ]);
  });

  it("UT-REQPOL-031 no line when nothing was retried", async () => {
    const q = quiet();
    await sendWithPolicy("read", async () => 1, q.opts);
    await expect(sendWithPolicy("create", failing([sdk(500)]), q.opts)).rejects.toBeDefined();
    expect(q.lines).toEqual([]);
  });
});

describe("withDeadline and REQUEST_DEADLINES (UT-REQPOL, T-12)", () => {
  it("UT-REQPOL-040 a write that never answers ends as UnknownOutcomeError after the deadline, and is NOT retried", async () => {
    vi.useFakeTimers();
    const q = quiet({ flags: { deadlines: true } });
    const fn = vi.fn(() => new Promise<string>(() => {}));
    const settled = sendWithPolicy("create", fn, q.opts).then(() => "resolved", (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(WRITE_DEADLINE_MS - 1);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const error = await settled;
    expect(error).toBeInstanceOf(UnknownOutcomeError);
    expect((error as UnknownOutcomeError).deadlineMs).toBe(WRITE_DEADLINE_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(q.lines.some((l) => /outcome unknown/.test(l))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("UT-REQPOL-041 a delete or a bulk call that exceeds the deadline is also UnknownOutcomeError, never retried", async () => {
    vi.useFakeTimers();
    for (const kind of ["delete", "patchAbsolute", "bulk"] as const) {
      const fn = vi.fn(() => new Promise<string>(() => {}));
      const settled = sendWithPolicy(kind, fn, quiet({ flags: { deadlines: true }, deadlineMs: 1000 }).opts).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await settled).toBeInstanceOf(UnknownOutcomeError);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("UT-REQPOL-042 a read that exceeds the deadline throws a retryable timeout (status undefined) and is retried", async () => {
    vi.useFakeTimers();
    const q = quiet({ flags: { deadlines: true } });
    let calls = 0;
    const fn = vi.fn(() => { calls += 1; return calls === 1 ? new Promise<string>(() => {}) : Promise.resolve("late but fine"); });
    const settled = sendWithPolicy("read", fn, q.opts);
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
    await expect(settled).resolves.toBe("late but fine");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(q.lines.some((l) => /try 1 of 3 failed \(transient, no HTTP status\)/.test(l))).toBe(true);
  });

  it("UT-REQPOL-043 a read that always times out ends as a DataError with no status after 2 tries", async () => {
    vi.useFakeTimers();
    const q = quiet({ flags: { deadlines: true }, deadlineMs: 500 });
    const fn = vi.fn(() => new Promise<string>(() => {}));
    const settled = sendWithPolicy("read", fn, q.opts).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    const error = await settled;
    expect(error).toBeInstanceOf(DataError);
    expect(error).not.toBeInstanceOf(UnknownOutcomeError);
    expect((error as DataError).status).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("UT-REQPOL-044 a slow success inside the deadline is untouched and the timer is cleared", async () => {
    vi.useFakeTimers();
    const q = quiet({ flags: { deadlines: true } });
    const result = { success: true, data: 42 };
    const fn = () => new Promise<typeof result>((resolve) => { setTimeout(() => resolve(result), WRITE_DEADLINE_MS - 5000); });
    const settled = sendWithPolicy("create", fn, q.opts);
    await vi.advanceTimersByTimeAsync(WRITE_DEADLINE_MS - 5000);
    await expect(settled).resolves.toBe(result);
    expect(vi.getTimerCount()).toBe(0);
    expect(q.lines).toEqual([]);
  });

  it("UT-REQPOL-045 an answer that arrives AFTER the deadline is dropped without an unhandled rejection", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let rejectLate!: (e: unknown) => void;
      const late = new Promise<string>((_resolve, reject) => { rejectLate = reject; });
      const settled = withDeadline(() => late, 100, "write", { log: () => {} }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100);
      expect(await settled).toBeInstanceOf(UnknownOutcomeError);
      rejectLate(new Error("too late"));
      await flush();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("UT-REQPOL-046 withDeadline clears its timer when the call rejects, and passes the error through", async () => {
    vi.useFakeTimers();
    const error = sdk(500);
    await expect(withDeadline(async () => { throw error; }, 1000, "read", { log: () => {} })).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
    await expect(withDeadline(() => { throw new Error("sync"); }, 1000, "write", { log: () => {} })).rejects.toThrow("sync");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("UT-REQPOL-047 with the switch OFF (the default) there is no deadline: a very slow write simply succeeds", async () => {
    vi.useFakeTimers();
    const fn = () => new Promise<string>((resolve) => { setTimeout(() => resolve("done"), WRITE_DEADLINE_MS * 3); });
    const settled = sendWithPolicy("create", fn, quiet().opts);
    await vi.advanceTimersByTimeAsync(WRITE_DEADLINE_MS * 3);
    await expect(settled).resolves.toBe("done");
  });

  it("UT-REQPOL-048 initial deadlines: reads 60 s, writes 120 s", () => {
    expect(READ_DEADLINE_MS).toBe(60_000);
    expect(WRITE_DEADLINE_MS).toBe(120_000);
  });
});

describe("the gate inside sendWithPolicy (UT-REQPOL, T-13)", () => {
  it("UT-REQPOL-050 a retry wait releases the slot: another request runs while the first sleeps", async () => {
    const gate = createRequestGate({ ceiling: 1, writeLane: 1 });
    let wake!: () => void;
    const sleeping = new Promise<void>((resolve) => { wake = resolve; });
    let firstCalls = 0;
    const first = sendWithPolicy("read", async () => {
      firstCalls += 1;
      if (firstCalls === 1) throw sdk(429);
      return "first";
    }, { ...quiet().opts, flags: { gate: true }, gate, sleep: () => sleeping });
    await flush();
    expect(firstCalls).toBe(1);
    expect(gate.inFlight()).toBe(0); // asleep, holding nothing
    await expect(sendWithPolicy("read", async () => "second", { ...quiet().opts, flags: { gate: true }, gate })).resolves.toBe("second");
    wake();
    await expect(first).resolves.toBe("first");
    expect(gate.peak()).toBe(1);
  });

  it("UT-REQPOL-051 reads use runRead, every other kind the write lane", async () => {
    const gate = createRequestGate({ ceiling: 4, writeLane: 1 });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const opts = { ...quiet().opts, flags: { gate: true }, gate };
    const writes = ["create", "delete", "patchAbsolute", "bulk"].map((kind) => sendWithPolicy(kind as RequestKind, () => hold.then(() => kind), opts));
    await flush();
    expect(gate.writesInFlight()).toBe(1);
    expect(gate.inFlight()).toBe(1);
    const reads = [1, 2, 3].map(() => sendWithPolicy("read", () => hold.then(() => "r"), opts));
    await flush();
    expect(gate.inFlight()).toBe(4);
    expect(gate.writesInFlight()).toBe(1);
    release();
    await Promise.all([...writes, ...reads]);
    expect(gate.peak()).toBe(4);
    expect(gate.writePeak()).toBe(1);
  });

  it("UT-REQPOL-052 with the switch OFF (the default) the gate is not used", async () => {
    const gate = createRequestGate({ ceiling: 1, writeLane: 1 });
    const hold = new Promise<void>(() => {});
    void sendWithPolicy("read", () => hold, { ...quiet().opts, gate });
    void sendWithPolicy("read", () => hold, { ...quiet().opts, gate });
    await flush();
    expect(gate.inFlight()).toBe(0);
  });

  it("UT-REQPOL-053 the gate also bounds a request that hangs until its deadline, then frees the slot", async () => {
    vi.useFakeTimers();
    const gate = createRequestGate({ ceiling: 1, writeLane: 1 });
    const opts = { ...quiet().opts, flags: { gate: true, deadlines: true }, gate, deadlineMs: 1000 };
    const hung = sendWithPolicy("create", () => new Promise<string>(() => {}), opts).catch((e: unknown) => e);
    const next = sendWithPolicy("create", async () => "next", opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.inFlight()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await hung).toBeInstanceOf(UnknownOutcomeError);
    await expect(next).resolves.toBe("next");
    expect(gate.inFlight()).toBe(0);
  });
});

describe("RETRY_POLICY_V2 off inside sendWithPolicy (UT-REQPOL)", () => {
  it("UT-REQPOL-060 off: create, read and patchAbsolute are never retried; delete and bulk follow the previous rules", async () => {
    const off = { flags: { retryV2: false } };
    for (const kind of ["read", "create", "patchAbsolute"] as const) {
      const fn = failing([sdk(429)]);
      await expect(sendWithPolicy(kind, fn, { ...quiet().opts, ...off })).rejects.toMatchObject({ status: 429 });
      expect(fn).toHaveBeenCalledTimes(1);
    }
    // delete: a bare 503 is not retried (the previous rule); a 500 is, waiting 1 s x attempt.
    const d503 = failing([sdk(503)]);
    await expect(sendWithPolicy("delete", d503, { ...quiet().opts, ...off })).rejects.toMatchObject({ status: 503 });
    const q = quiet(off);
    const d500 = failing([sdk(500), sdk(500)]);
    await expect(sendWithPolicy("delete", d500, q.opts)).resolves.toBe("ok");
    expect(q.waits).toEqual([1000, 2000]);
    // bulk: only a 429, 3 tries, 1 s x attempt.
    const q2 = quiet(off);
    const b = failing([sdk(429), sdk(429), sdk(429)]);
    await expect(sendWithPolicy("bulk", b, q2.opts)).rejects.toMatchObject({ status: 429 });
    expect(b).toHaveBeenCalledTimes(3);
    expect(q2.waits).toEqual([1000, 2000]);
  });
});
