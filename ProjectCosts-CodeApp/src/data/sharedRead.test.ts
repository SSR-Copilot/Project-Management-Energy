/**
 * UT-SHARED-OPT-001..008 — the shared-read helper behind the chart of accounts and currency reads (B2, OPT-07b/c).
 * The freshness rules are what make it safe to share, so each one is pinned: simultaneous callers share one read, a young
 * answer is reused, an old one is not, `invalidate()` forgets, a read already running when it is called is NOT remembered,
 * and a failure is never served later.
 */
import { describe, expect, it, vi } from "vitest";
import { sharedRead } from "./sharedRead";

/** A read whose answer the test releases by hand. */
function manualRead<T>() {
  const pending: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const read = vi.fn(() => new Promise<T>((resolve, reject) => { pending.push({ resolve, reject }); }));
  return { read, pending };
}

describe("sharedRead", () => {
  it("UT-SHARED-OPT-001 callers that ask while a read runs share it (one read, one answer)", async () => {
    const { read, pending } = manualRead<number[]>();
    const shared = sharedRead(read, 30_000);
    const a = shared.get();
    const b = shared.get();
    const c = shared.get();
    expect(read).toHaveBeenCalledTimes(1);
    pending[0]!.resolve([1, 2]);
    expect(await a).toEqual([1, 2]);
    expect(await b).toBe(await a);
    expect(await c).toBe(await a);
  });

  it("UT-SHARED-OPT-002 a young answer is reused, an old one is read again (the clock is injected)", async () => {
    let t = 1_000;
    const read = vi.fn(async () => t);
    const shared = sharedRead(read, 30_000, () => t);
    expect(await shared.get()).toBe(1_000);
    t += 29_999;
    expect(await shared.get()).toBe(1_000);
    expect(read).toHaveBeenCalledTimes(1);
    t += 2;
    expect(await shared.get()).toBe(31_001);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("UT-SHARED-OPT-003 invalidate() forgets a finished answer", async () => {
    const read = vi.fn(async () => ({ n: Math.random() }));
    const shared = sharedRead(read, 30_000);
    const first = await shared.get();
    shared.invalidate();
    const second = await shared.get();
    expect(read).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it("UT-SHARED-OPT-004 a read already RUNNING when invalidate() is called is not remembered: nobody is served a pre-write answer later", async () => {
    const { read, pending } = manualRead<string>();
    const shared = sharedRead(read, 30_000);
    const preWrite = shared.get();
    shared.invalidate(); // the admin write lands while the read is in flight
    const postWrite = shared.get();
    expect(read).toHaveBeenCalledTimes(2);
    pending[0]!.resolve("old chart");
    expect(await preWrite).toBe("old chart"); // its own callers still get what they asked for
    pending[1]!.resolve("new chart");
    expect(await postWrite).toBe("new chart");
    expect(await shared.get()).toBe("new chart"); // the memo is the POST-write read
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("UT-SHARED-OPT-005 a failed read is dropped at once: the next caller reads again, nothing serves the rejection", async () => {
    let fail = true;
    const read = vi.fn(async () => { if (fail) throw new Error("503"); return "ok"; });
    const shared = sharedRead(read, 30_000);
    await expect(shared.get()).rejects.toThrow("503");
    fail = false;
    expect(await shared.get()).toBe("ok");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("UT-SHARED-OPT-006 ttl 0 keeps only the sharing of simultaneous reads (the reversible switch)", async () => {
    const { read, pending } = manualRead<number>();
    const shared = sharedRead(read, 0);
    const a = shared.get();
    const b = shared.get();
    expect(read).toHaveBeenCalledTimes(1);
    pending[0]!.resolve(1);
    await Promise.all([a, b]);
    const c = shared.get();
    expect(read).toHaveBeenCalledTimes(2);
    pending[1]!.resolve(2);
    expect(await c).toBe(2);
  });

  it("UT-SHARED-OPT-007 a read that outlives the ttl is still shared while it runs", async () => {
    let t = 0;
    const { read, pending } = manualRead<number>();
    const shared = sharedRead(read, 30_000, () => t);
    const a = shared.get();
    t = 120_000;
    const b = shared.get();
    expect(read).toHaveBeenCalledTimes(1);
    pending[0]!.resolve(7);
    expect([await a, await b]).toEqual([7, 7]);
  });

  it("UT-SHARED-OPT-008 invalidate() with nothing cached is harmless", () => {
    expect(() => sharedRead(async () => 1, 1).invalidate()).not.toThrow();
  });
});
