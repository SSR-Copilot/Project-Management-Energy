/**
 * UT-GATE-NNN: the global request gate (dvopt T-13, WE-03): total in flight never above the ceiling, writes never above the
 * lane, a slot handed over without a transient overshoot, a failed or throwing task frees its slot.
 */
import { describe, expect, it } from "vitest";
import { createRequestGate, GLOBAL_REQUEST_CEILING, GLOBAL_WRITE_LANE, requestGate } from "./concurrency";

interface Held { promise: Promise<number>; release: () => void; fail: (e: unknown) => void; started: () => boolean }

/** A task that stays in flight until released; `started()` says whether the gate has started it. */
function held(id: number, startedIds?: number[]): { task: () => Promise<number>; h: Held } {
  let release!: () => void;
  let fail!: (e: unknown) => void;
  let didStart = false;
  const promise = new Promise<number>((resolve, reject) => { release = () => resolve(id); fail = reject; });
  const task = () => { didStart = true; startedIds?.push(id); return promise; };
  return { task, h: { promise, release, fail, started: () => didStart } };
}
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("createRequestGate (UT-GATE)", () => {
  it("UT-GATE-001 total in flight never exceeds the ceiling, across several pools, and every task finishes", async () => {
    const gate = createRequestGate({ ceiling: 5, writeLane: 3 });
    const tasks = Array.from({ length: 40 }, (_, i) => held(i));
    const results = tasks.map((t, i) => (i % 2 === 0 ? gate.runRead(t.task) : gate.runWrite(t.task)));
    await flush();
    expect(gate.inFlight()).toBe(5);
    expect(gate.waiting()).toBe(35);
    // Release what has started, round after round, checking the invariants at every step.
    for (let round = 0; round < 100 && !(gate.inFlight() === 0 && gate.waiting() === 0); round += 1) {
      tasks.filter((t) => t.h.started()).forEach((t) => t.h.release());
      await flush();
      expect(gate.inFlight()).toBeLessThanOrEqual(5);
      expect(gate.writesInFlight()).toBeLessThanOrEqual(3);
    }
    expect((await Promise.all(results)).sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(gate.peak()).toBe(5);
    expect(gate.writePeak()).toBeLessThanOrEqual(3);
    expect(gate.inFlight()).toBe(0);
    expect(gate.waiting()).toBe(0);
  });

  it("UT-GATE-002 writes never exceed the write lane, and a write waiting at the lane does not block a read", async () => {
    const gate = createRequestGate({ ceiling: 6, writeLane: 2 });
    const w = Array.from({ length: 5 }, (_, i) => held(i));
    w.forEach((t) => void gate.runWrite(t.task));
    await flush();
    expect(gate.writesInFlight()).toBe(2);
    expect(gate.inFlight()).toBe(2);
    const reads = Array.from({ length: 4 }, (_, i) => held(100 + i));
    reads.forEach((t) => void gate.runRead(t.task));
    await flush();
    // 3 more writes are queued ahead of the reads, yet all 4 reads started: ceiling 6 = 2 writes + 4 reads.
    expect(reads.every((r) => r.h.started())).toBe(true);
    expect(gate.inFlight()).toBe(6);
    expect(gate.writesInFlight()).toBe(2);
    expect(w.filter((t) => t.h.started())).toHaveLength(2);
    expect(gate.peak()).toBe(6);
    expect(gate.writePeak()).toBe(2);
    // A write finishing starts the next WRITE (the lane), not a read.
    w[0]!.h.release();
    await flush();
    expect(w[2]!.h.started()).toBe(true);
    expect(gate.writesInFlight()).toBe(2);
    [...w, ...reads].forEach((t) => t.h.release());
    await flush();
  });

  it("UT-GATE-003 a finishing task hands its slot straight to the next one: peak never overshoots", async () => {
    const gate = createRequestGate({ ceiling: 2, writeLane: 2 });
    const t = Array.from({ length: 6 }, (_, i) => held(i));
    t.forEach((x) => void gate.runRead(x.task));
    for (const x of t) { x.h.release(); await flush(); }
    expect(gate.peak()).toBe(2);
    expect(gate.inFlight()).toBe(0);
  });

  it("UT-GATE-004 waiting tasks start in arrival order (FIFO among those that may start)", async () => {
    const gate = createRequestGate({ ceiling: 1, writeLane: 1 });
    const order: number[] = [];
    const t = Array.from({ length: 4 }, (_, i) => held(i, order));
    t.forEach((x) => void gate.runRead(x.task));
    for (const x of t) { x.h.release(); await flush(); }
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("UT-GATE-005 a rejecting task, and a task that throws synchronously, free their slot and pass the error on", async () => {
    const gate = createRequestGate({ ceiling: 1, writeLane: 1 });
    const a = held(1);
    const first = gate.runWrite(a.task);
    const second = gate.runRead(async () => 2);
    const third = gate.runRead(() => { throw new Error("sync boom"); });
    const fourth = gate.runWrite(async () => 4);
    a.h.fail(new Error("async boom"));
    await expect(first).rejects.toThrow("async boom");
    await expect(second).resolves.toBe(2);
    await expect(third).rejects.toThrow("sync boom");
    await expect(fourth).resolves.toBe(4);
    expect(gate.inFlight()).toBe(0);
    expect(gate.writesInFlight()).toBe(0);
  });

  it("UT-GATE-006 reset restarts the peaks from the current counts; an idle gate resets to zero", async () => {
    const gate = createRequestGate({ ceiling: 3, writeLane: 2 });
    const t = Array.from({ length: 3 }, (_, i) => held(i));
    t.forEach((x) => void gate.runWrite(x.task));
    await flush();
    expect(gate.peak()).toBe(2);
    t.forEach((x) => x.h.release());
    await flush();
    gate.reset();
    expect(gate.peak()).toBe(0);
    expect(gate.writePeak()).toBe(0);
  });

  it("UT-GATE-007 a write lane larger than the ceiling is clamped to it; a ceiling below 1 becomes 1", async () => {
    const gate = createRequestGate({ ceiling: 2, writeLane: 99 });
    const t = Array.from({ length: 4 }, (_, i) => held(i));
    t.forEach((x) => void gate.runWrite(x.task));
    await flush();
    expect(gate.inFlight()).toBe(2);
    const tiny = createRequestGate({ ceiling: 0, writeLane: 0 });
    const x = held(1);
    void tiny.runRead(x.task);
    await flush();
    expect(tiny.inFlight()).toBe(1);
    t.forEach((y) => y.h.release());
    x.h.release();
    await flush();
  });

  it("UT-GATE-008 the module singleton is ceiling 40 / write lane 24", async () => {
    expect(GLOBAL_REQUEST_CEILING).toBe(40);
    expect(GLOBAL_WRITE_LANE).toBe(24);
    requestGate.reset();
    const writes = Array.from({ length: 60 }, (_, i) => held(i));
    writes.forEach((t) => void requestGate.runWrite(t.task));
    const reads = Array.from({ length: 60 }, (_, i) => held(200 + i));
    reads.forEach((t) => void requestGate.runRead(t.task));
    await flush();
    expect(requestGate.inFlight()).toBe(40);
    expect(requestGate.writesInFlight()).toBe(24);
    expect(requestGate.peak()).toBe(40);
    for (let i = 0; i < 10 && requestGate.inFlight() > 0; i += 1) {
      [...writes, ...reads].forEach((t) => t.h.release());
      await flush();
      expect(requestGate.inFlight()).toBeLessThanOrEqual(40);
    }
    expect(requestGate.inFlight()).toBe(0);
    expect(requestGate.peak()).toBe(40);
    requestGate.reset();
  });
});
