/**
 * T-C05 (NET-04 = SCC-10 = NET-12): the read lane for id-chunk reads (`data/readChunks.ts`). Ids: UT-READLANE-NNN.
 *
 * The OLD behaviour is the oracle: `Promise.all(chunk(ids).map(read))`, copied below. Reads are fakes whose answers are released
 * by hand, so who is in flight, in which order and for how long is deterministic (no wall clock).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGate } from "./concurrency";
import { chunk } from "./odata";
import { READ_LANE_WIDTH, readChunked, readLane, readLaned } from "./readChunks";
import { resetReadLaneFlags, setReadLaneFlagsForTests } from "./readLaneFlags";
import { flushDataLog, loggedCall, resetRequestLog } from "@/platform/requestLog";

/** The OLD sites, verbatim: every chunk at once. */
const oldPath = <T, R>(items: readonly T[], read: (part: T[]) => Promise<R>): Promise<R[]> =>
  Promise.all(chunk(items).map((part) => read(part)));

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `id-${String(i).padStart(4, "0")}`);

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}

interface Held { part: string[]; resolve: (rows: string[]) => void; reject: (e: unknown) => void }

/** A read whose answer is released by hand; `inFlight` / `peak` count the reads that have started and not yet settled. */
function heldReads() {
  const held: Held[] = [];
  const state = { inFlight: 0, peak: 0, started: [] as string[][] };
  const read = (part: string[]) => new Promise<string[]>((resolve, reject) => {
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    state.started.push(part);
    held.push({
      part,
      resolve: (rows) => { state.inFlight -= 1; resolve(rows); },
      reject: (e) => { state.inFlight -= 1; reject(e); },
    });
  });
  return { read, held, state };
}

/** Lets every continuation that needs no answer run (the gate hands a slot over in a few microtask hops). */
const tick = async (): Promise<void> => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };

beforeEach(() => { resetReadLaneFlags(); resetRequestLog(); });
afterEach(() => { resetReadLaneFlags(); vi.restoreAllMocks(); });

describe("readChunked: same answers as Promise.all", () => {
  it("UT-READLANE-001 the answers are the old ones, in chunk order, for 0, 1, 5 and 40 chunks (randomised completion order)", async () => {
    for (const chunks of [0, 1, 5, 40]) {
      const items = ids(chunks * 40 - (chunks > 1 ? 7 : 0)); // the last chunk is short
      const next = rng(1000 + chunks);
      const answer = (part: string[]) => part.map((p) => `${p}!`);
      const run = async (path: typeof oldPath) => {
        const { read, held, state } = heldReads();
        const out = path(items, read);
        // release in a random order, a random few at a time, so completion order differs from start order
        for (let guard = 0; guard < 500; guard += 1) {
          await tick();
          if (held.length === 0) { if (state.inFlight === 0) break; continue; }
          const batch = held.splice(0, 1 + Math.floor(next() * held.length));
          while (batch.length > 0) { const [h] = batch.splice(Math.floor(next() * batch.length), 1); if (h) h.resolve(answer(h.part)); }
        }
        return out;
      };
      const before = await run(oldPath);
      const after = await run(readChunked);
      expect(after).toEqual(before);
      expect(after.flat()).toEqual(items.map((p) => `${p}!`));
    }
  });

  it("UT-READLANE-002 randomised inputs: N, chunk size, answers and release order all agree with the old path (differential, 60 seeds)", async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = rng(seed);
      const n = Math.floor(next() * 900);
      const size = [1, 7, 40, 100][Math.floor(next() * 4)] as number;
      const items = ids(n);
      const answer = (part: string[]) => part.filter((_, i) => (i + part.length) % 3 !== 0).map((p) => `${seed}:${p}`);
      const run = async (path: (i: readonly string[], r: (p: string[]) => Promise<string[]>, s?: number) => Promise<string[][]>) => {
        const { read, held, state } = heldReads();
        const out = path(items, read, size);
        for (let guard = 0; guard < 500; guard += 1) {
          await tick();
          if (held.length === 0) { if (state.inFlight === 0) break; continue; }
          const batch = held.splice(0, 1 + Math.floor(next() * held.length));
          while (batch.length > 0) { const [h] = batch.splice(Math.floor(next() * batch.length), 1); if (h) h.resolve(answer(h.part)); }
        }
        return out;
      };
      const old = await run((i, r, s) => Promise.all(chunk(i, s).map((p) => r(p))));
      const lane = await run((i, r, s) => readChunked(i, r, s));
      expect(lane).toEqual(old);
    }
  });
});

describe("readChunked: the lane width", () => {
  it("UT-READLANE-003 the lane is 16 wide: 40 ceiling minus the 24-wide write lane", () => {
    expect(READ_LANE_WIDTH).toBe(16);
    expect(readLane.peak()).toBeLessThanOrEqual(16);
  });

  it("UT-READLANE-004 a 40-chunk call (1,600 ids) never has more than 16 reads in flight; the old path had 40", async () => {
    const items = ids(1600);
    const old = heldReads();
    const oldDone = oldPath(items, old.read);
    await tick();
    expect(old.state.peak).toBe(40);
    old.held.splice(0).forEach((h) => h.resolve(h.part));
    await oldDone;

    const lane = heldReads();
    const done = readChunked(items, lane.read);
    for (let guard = 0; guard < 200 && (lane.held.length > 0 || lane.state.inFlight > 0 || guard < 3); guard += 1) {
      await tick();
      expect(lane.state.inFlight).toBeLessThanOrEqual(16);
      lane.held.splice(0, 5).forEach((h) => h.resolve(h.part));
    }
    const rows = await done;
    expect(lane.state.peak).toBe(16);
    expect(rows.flat()).toEqual(items);
    // every chunk was read exactly once, in order of start
    expect(lane.state.started).toEqual(chunk(items));
  });

  it("UT-READLANE-005 100 chunks: the peak stays at 16 and every chunk is read once", async () => {
    const items = ids(4000);
    const { read, held, state } = heldReads();
    const done = readChunked(items, read);
    while (held.length > 0 || state.inFlight > 0 || state.started.length === 0) {
      await tick();
      expect(state.inFlight).toBeLessThanOrEqual(READ_LANE_WIDTH);
      held.splice(0, 3).forEach((h) => h.resolve(h.part));
    }
    expect((await done).flat()).toEqual(items);
    expect(state.peak).toBe(16);
    expect(state.started).toHaveLength(100);
  });

  it("UT-READLANE-006 up to 16 chunks every read starts in the same tick, exactly like Promise.all (waves unchanged)", async () => {
    for (const chunks of [1, 2, 15, 16]) {
      const { read, held, state } = heldReads();
      const done = readChunked(ids(chunks * 40), read);
      // no await between the call and the check: the gate starts a task synchronously while a slot is free
      expect(state.started).toHaveLength(chunks);
      held.splice(0).forEach((h) => h.resolve(h.part));
      await done;
    }
    const { read, held, state } = heldReads();
    const done = readChunked(ids(17 * 40), read);
    expect(state.started).toHaveLength(16); // the 17th queues
    held.splice(0, 1).forEach((h) => h.resolve(h.part));
    await tick();
    expect(state.started).toHaveLength(17);
    held.splice(0).forEach((h) => h.resolve(h.part));
    await done;
  });

  it("UT-READLANE-007 two concurrent calls share the one lane", async () => {
    const a = heldReads();
    const b = heldReads();
    const doneA = readChunked(ids(12 * 40), a.read);
    const doneB = readChunked(ids(12 * 40), b.read);
    expect(a.state.started).toHaveLength(12);
    expect(b.state.started).toHaveLength(4); // 12 + 4 = 16 in flight across both calls
    expect(readLane.inFlight()).toBe(16);
    a.held.splice(0).forEach((h) => h.resolve(h.part));
    await tick();
    expect(b.state.started).toHaveLength(12);
    b.held.splice(0).forEach((h) => h.resolve(h.part));
    await tick();
    b.held.splice(0).forEach((h) => h.resolve(h.part));
    await Promise.all([doneA, doneB]);
    expect(readLane.inFlight()).toBe(0);
  });
});

describe("readChunked: failure semantics", () => {
  it("UT-READLANE-008 the first failing chunk (in time) fails the call with its own error, like Promise.all", async () => {
    for (const path of [oldPath, readChunked] as const) {
      const { read, held } = heldReads();
      const done = path(ids(5 * 40), read);
      const caught = done.then(() => "resolved", (e: Error) => e.message);
      held[3]?.reject(new Error("chunk 3 refused"));
      held[1]?.reject(new Error("chunk 1 refused"));
      held.filter((_, i) => i !== 1 && i !== 3).forEach((h) => h.resolve(h.part));
      expect(await caught).toBe("chunk 3 refused");
    }
  });

  it("UT-READLANE-009 no chunk that is still waiting for a slot starts after a sibling failed", async () => {
    const { read, held, state } = heldReads();
    const done = readChunked(ids(30 * 40), read);
    const caught = done.then(() => undefined, (e: Error) => e.message);
    expect(state.started).toHaveLength(16);
    held[0]?.reject(new Error("429"));
    held.slice(1).forEach((h) => h.resolve(h.part));
    expect(await caught).toBe("429");
    await tick();
    await tick();
    // the 14 chunks that were queued never reached the read
    expect(state.started).toHaveLength(16);
    expect(readLane.inFlight()).toBe(0);
  });

  it("UT-READLANE-010 a synchronous throw in the read is a rejection and frees its slot", async () => {
    const read = (part: string[]): Promise<string[]> => { if (part[0] === "id-0040") throw new Error("boom"); return Promise.resolve(part); };
    await expect(readChunked(ids(120), read)).rejects.toThrow("boom");
    expect(readLane.inFlight()).toBe(0);
  });

  it("UT-READLANE-011 a failed call leaves the lane usable for the next call", async () => {
    const failing = heldReads();
    const bad = readChunked(ids(20 * 40), failing.read).catch((e: Error) => e.message);
    failing.held[2]?.reject(new Error("nope"));
    failing.held.splice(0).forEach((h) => h.resolve(h.part));
    expect(await bad).toBe("nope");
    const ok = heldReads();
    const done = readChunked(ids(16 * 40), ok.read);
    expect(ok.state.started).toHaveLength(16);
    ok.held.splice(0).forEach((h) => h.resolve(h.part));
    expect((await done).flat()).toHaveLength(640);
  });
});

describe("readChunked: switch and trace", () => {
  it("UT-READLANE-012 READ_LANE off is the old unbounded Promise.all (peak 40 for 40 chunks)", async () => {
    setReadLaneFlagsForTests({ enabled: false });
    const { read, held, state } = heldReads();
    const done = readChunked(ids(1600), read);
    expect(state.started).toHaveLength(40);
    held.splice(0).forEach((h) => h.resolve(h.part));
    expect((await done).flat()).toHaveLength(1600);
    expect(state.peak).toBe(40);
    expect(readLane.peak()).toBeLessThanOrEqual(16);
  });

  it("UT-READLANE-013 a call that has to queue prints one [VSB] ACTION line with the read count and the lane width; a call that fits prints none", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const small = heldReads();
    const doneSmall = readChunked(ids(16 * 40), small.read);
    small.held.splice(0).forEach((h) => h.resolve(h.part));
    await doneSmall;
    expect(info.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("read lane"))).toEqual([]);

    const big = heldReads();
    const doneBig = readChunked(ids(40 * 40), big.read);
    big.held.splice(0).forEach((h) => h.resolve(h.part));
    for (let i = 0; i < 4; i += 1) { await tick(); big.held.splice(0).forEach((h) => h.resolve(h.part)); }
    await doneBig;
    expect(info.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("read lane")))
      .toEqual(["[VSB] ACTION read lane: 40 reads queue behind a lane of 16 (0 in flight)"]);
  });

  it("UT-READLANE-014 reads inside the lane keep their own DATA lines (the lane adds no wrapper that swallows them)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const read = (part: string[]) => loggedCall("read", "list test rows", async () => part, (rows) => rows.length);
    await readChunked(ids(18 * 40), read);
    flushDataLog();
    const lines = info.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("DATA read list test rows"));
    // `logData` batches calls made close together: one line, 18 calls, 18 x 40 rows
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/DATA read list test rows: 720 rows, 18 calls/);
  });
});

describe("readLaned and a private lane", () => {
  it("UT-READLANE-015 readLaned runs one read per item through the lane, in input order, and a test lane can be narrower", async () => {
    const lane = createGate(2);
    const started: number[] = [];
    let inFlight = 0;
    let peak = 0;
    const out = await readLaned([3, 1, 2, 5, 4], async (n) => {
      started.push(n); inFlight += 1; peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return n * 10;
    }, lane, 2);
    expect(out).toEqual([30, 10, 20, 50, 40]);
    expect(started).toEqual([3, 1, 2, 5, 4]);
    expect(peak).toBe(2);
  });
});
