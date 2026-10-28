/**
 * `mapLimit` — the bounded write pool.
 *
 * It replaced the `for (… of …) await` loops in `saveAddCostSheet`, so what these assert is that
 * it is a faithful replacement: same results, same order, and the same thing on failure — the
 * first rejection thrown, and nothing further started after it. The ceiling matters too, because
 * Dataverse cuts a user off at 52 concurrent requests and there is no retry on the write path.
 */
import { describe, expect, it } from "vitest";
import { createGate, mapLimit, forEachLimit, WRITE_CONCURRENCY } from "./concurrency";

/** Resolves on the next microtask, so tasks actually overlap. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("mapLimit", () => {
  it("UT-CONC-001 returns results in INPUT order, not completion order", async () => {
    // Reversed delays: the last task finishes first.
    const out = await mapLimit([30, 20, 10, 0], async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    }, 4);
    expect(out).toEqual([30, 20, 10, 0]);
  });

  it("UT-CONC-002 never has more than `limit` tasks in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 25 }, (_, i) => i), async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
    }, 4);
    expect(peak).toBe(4);
  });

  it("UT-CONC-003 still runs everything when there are fewer items than the limit", async () => {
    const seen: number[] = [];
    await mapLimit([1, 2, 3], async (n) => { await tick(); seen.push(n); }, 50);
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  it("UT-CONC-004 throws the FIRST rejection, as the sequential loop did", async () => {
    await expect(mapLimit([1, 2, 3], async (n) => {
      await tick();
      if (n === 1) throw new Error("first");
      if (n === 2) throw new Error("second");
      return n;
    }, 3)).rejects.toThrow("first");
  });

  it("UT-CONC-005 starts no further task once one has failed", async () => {
    const started: number[] = [];
    // Width 1 makes the sequencing exact: task 0 fails before task 1 is ever picked up.
    await expect(mapLimit([0, 1, 2, 3], async (n) => {
      started.push(n);
      await tick();
      if (n === 0) throw new Error("stop");
      return n;
    }, 1)).rejects.toThrow("stop");
    expect(started).toEqual([0]);
  });

  it("UT-CONC-006 leaves no unhandled rejection when several tasks fail together", async () => {
    // Every worker catches its own, so a sibling's failure cannot escape as an unhandled
    // rejection the way `Promise.all` over pre-started promises would allow.
    const unhandled: unknown[] = [];
    const onUnhandled: EventListener = (e) => {
      unhandled.push((e as Event & { reason?: unknown }).reason);
    };
    globalThis.addEventListener?.("unhandledrejection", onUnhandled);
    await expect(
      mapLimit([1, 2, 3, 4], async () => { await tick(); throw new Error("boom"); }, 4),
    ).rejects.toThrow("boom");
    await tick();
    globalThis.removeEventListener?.("unhandledrejection", onUnhandled);
    expect(unhandled).toEqual([]);
  });

  it("UT-CONC-007 does nothing, and calls nothing, for an empty list", async () => {
    let calls = 0;
    expect(await mapLimit([], async () => { calls += 1; })).toEqual([]);
    expect(calls).toBe(0);
  });

  it("UT-CONC-008 passes the index alongside the item", async () => {
    const pairs = await mapLimit(["a", "b"], async (item, i) => `${i}:${item}`, 2);
    expect(pairs).toEqual(["0:a", "1:b"]);
  });

  it("UT-CONC-009 defaults to a width well under Dataverse's 52-concurrent ceiling", () => {
    expect(WRITE_CONCURRENCY).toBeLessThan(52);
    expect(WRITE_CONCURRENCY).toBeGreaterThan(1);
  });
});

describe("forEachLimit", () => {
  it("UT-CONC-010 runs every task and resolves to nothing", async () => {
    const seen: number[] = [];
    expect(await forEachLimit([1, 2, 3], async (n) => { await tick(); seen.push(n); }, 2))
      .toBeUndefined();
    expect(seen.sort()).toEqual([1, 2, 3]);
  });
});

describe("createGate", () => {
  it("UT-CONC-011 caps in-flight tasks across SEVERAL pools sharing one gate", async () => {
    const gate = createGate(3);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
    };
    // Three pools of width 4 each = 12 would be in flight without the shared gate.
    await Promise.all([1, 2, 3].map(() => forEachLimit([1, 2, 3, 4, 5], () => gate(task), 4)));
    expect(peak).toBe(3);
  });

  it("UT-CONC-012 a failed task frees its slot", async () => {
    const gate = createGate(1);
    await expect(gate(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await gate(async () => "next")).toBe("next");
  });

  it("UT-CONC-013 peak() reports the highest in-flight count, capped at the limit", async () => {
    const gate = createGate(3);
    expect(gate.peak()).toBe(0);
    await gate(async () => undefined);
    expect(gate.peak()).toBe(1);
    // 10 tasks through a gate of 3: the slot hand-over never pushes the count past 3.
    await Promise.all(Array.from({ length: 10 }, () => gate(tick)));
    expect(gate.peak()).toBe(3);
    // Two at once afterwards does not lower the recorded peak.
    await Promise.all([gate(tick), gate(tick)]);
    expect(gate.peak()).toBe(3);
  });

  it("UT-CONC-014 reset() restarts the peak from what is in flight now, without changing scheduling", async () => {
    const gate = createGate(2);
    await Promise.all([gate(tick), gate(tick), gate(tick)]);
    expect(gate.peak()).toBe(2);
    gate.reset();
    expect(gate.peak()).toBe(0); // idle
    await gate(tick);
    expect(gate.peak()).toBe(1);

    // A reset while one task is in flight starts from 1, and the cap still holds afterwards.
    let release: () => void = () => undefined;
    const held = gate(() => new Promise<void>((r) => { release = r; }));
    gate.reset();
    expect(gate.peak()).toBe(1);
    // The held task still counts: with it, the cap of 2 is reached, and never passed.
    let active = 1;
    let observed = 1;
    const task = async () => { active += 1; observed = Math.max(observed, active); await tick(); active -= 1; };
    const more = Promise.all([gate(task), gate(task), gate(task)]);
    await tick();
    release();
    active -= 1;
    await Promise.all([held, more]);
    expect(observed).toBeLessThanOrEqual(2);
    expect(gate.peak()).toBe(2);
  });
});
