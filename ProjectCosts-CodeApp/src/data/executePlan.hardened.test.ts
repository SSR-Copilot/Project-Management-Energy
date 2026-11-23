/**
 * UT-PLAN-922.. — the engine's opt-in delete hardening (Generators delete hardening DEL-2 and DEL-4): bounded retry,
 * strict gone-check, read-back (`verifyGone` / `DeleteNotConfirmedError`), `serialKey` order, `stopOnFailure`.
 * Every plan here marks its deletes `hardened`; the unmarked ones are pinned as unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataError } from "@/platform/errors";
import { setDeleteSleeper } from "./retry";
import { executePlan, PlanError, type ExecutePlanOptions, type PlanClient } from "./executePlan";
import { DeleteNotConfirmedError } from "./verifyGone";
import { emptyPlan, hardenedDelete, together, type PlannedWrite } from "./writePlan";

const SET = "vsb_landleaseallocationwtgs";
const PK = "vsb_landleaseallocationwtgid";
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const http = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });

/** One scripted answer of a delete: ok, an HTTP status, or a thrown network error. */
type Answer = "ok" | number | "net" | { status: number; message: string };

interface StubOptions {
  /** Answers per id, consumed one per attempt; the last one repeats. Default: "ok". */
  script?: Record<string, Answer[]>;
  /** Ids Dataverse still returns when read back (case-insensitive). */
  present?: string[];
  /** The read-back fails with this status. */
  readFails?: number;
  /** Milliseconds each delete takes. */
  deleteMs?: number;
  /** No `retrieveMultipleRecordsAsync` at all. */
  noRead?: boolean;
}

function stub(o: StubOptions = {}) {
  const attempts = new Map<string, number>();
  const events: string[] = [];
  const present = new Set((o.present ?? []).map((p) => p.toLowerCase()));
  let inFlight = 0;
  let peak = 0;
  const reads: string[] = [];
  const client = {
    createRecordAsync: vi.fn(async () => ({ success: true as const, data: {} })),
    updateRecordAsync: vi.fn(async () => ({ success: true as const, data: {} })),
    deleteRecordAsync: vi.fn(async (_table: string, id: string) => {
      const n = attempts.get(id) ?? 0;
      attempts.set(id, n + 1);
      events.push(`start ${id}`);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      if (o.deleteMs) await new Promise((r) => { setTimeout(r, o.deleteMs); });
      inFlight -= 1;
      events.push(`end ${id}`);
      const list = o.script?.[id] ?? ["ok"];
      const answer = list[Math.min(n, list.length - 1)]!;
      if (answer === "ok") return { success: true as const, data: undefined };
      if (answer === "net") throw new TypeError("Failed to fetch");
      if (typeof answer === "number") return { success: false as const, error: http(answer) };
      return { success: false as const, error: { status: answer.status, message: answer.message } };
    }),
    ...(o.noRead ? {} : {
      retrieveMultipleRecordsAsync: vi.fn(async (_table: string, options?: Record<string, unknown>) => {
        const filter = String(options?.["filter"] ?? "");
        reads.push(filter);
        if (o.readFails) return { success: false as const, error: http(o.readFails) };
        const named = filter.match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? [];
        return { success: true as const, data: named.filter((n) => present.has(n)).map((n) => ({ [PK]: n })) };
      }),
    }),
  };
  return { client: client as unknown as PlanClient, raw: client, attempts, events, reads, peak: () => peak };
}

const planOf = (...writes: PlannedWrite[]) => {
  const plan = emptyPlan();
  plan.writes.push(...writes);
  return plan;
};
const hd = (n: number, o?: { confirm?: boolean; serialKey?: string }) => hardenedDelete(SET, g(n), `delete ${n}`, o);
const plain = (n: number): PlannedWrite => ({ op: "delete", entitySet: SET, id: g(n), reason: `delete ${n}` });
const run = (plan: ReturnType<typeof planOf>, s: ReturnType<typeof stub>, options?: ExecutePlanOptions) =>
  executePlan(plan, "test", s.client, options);
const failed = async (p: Promise<unknown>) => (await p.catch((e: unknown) => e)) as PlanError;

beforeEach(() => setDeleteSleeper(async () => undefined));
afterEach(() => setDeleteSleeper(null));

describe("a hardened delete, sequential", () => {
  it("UT-PLAN-922 retries a 429 and a network error, then lands: 3 requests, counted as one deleted row", async () => {
    const s = stub({ script: { [g(1)]: ["net", 429, "ok"] } });
    const result = await run(planOf(hd(1)), s);
    expect(s.raw.deleteRecordAsync).toHaveBeenCalledTimes(3);
    expect(result.done).toBe(1);
    expect(result.deleted).toEqual([{ entitySet: SET, id: g(1) }]);
    expect(s.reads).toEqual([]);
  });

  it("UT-PLAN-923 gives up after 3 tries; a 403 is not retried at all", async () => {
    const s = stub({ script: { [g(1)]: [500] , [g(2)]: [403] } });
    const e1 = await failed(run(planOf(hd(1)), s));
    expect(e1).toBeInstanceOf(PlanError);
    expect(s.attempts.get(g(1))).toBe(3);
    expect((e1.cause as DataError).status).toBe(500);
    const e2 = await failed(run(planOf(hd(2)), s));
    expect(s.attempts.get(g(2))).toBe(1);
    expect((e2.cause as DataError).status).toBe(403);
    expect(e2.done).toBe(0);
  });

  it("UT-PLAN-924 a 404 is \"gone\": the row is read back, found absent, and counts as deleted", async () => {
    const s = stub({ script: { [g(1)]: [404] }, present: [] });
    const result = await run(planOf(hd(1)), s);
    expect(s.attempts.get(g(1))).toBe(1);
    expect(s.reads).toHaveLength(1);
    expect(result.done).toBe(1);
    expect(result.deleted).toEqual([{ entitySet: SET, id: g(1) }]);
  });

  it("UT-PLAN-925 a 404 whose row is STILL there fails with DeleteNotConfirmedError inside PlanError, and is not in deleted", async () => {
    const s = stub({ script: { [g(1)]: [404] }, present: [g(1)] });
    const err = await failed(run(planOf(plain(9), hd(1)), s));
    expect(err).toBeInstanceOf(PlanError);
    expect(err.cause).toBeInstanceOf(DeleteNotConfirmedError);
    const cause = err.cause as DeleteNotConfirmedError;
    expect([cause.entitySet, cause.count]).toEqual([SET, 1]);
    expect(err.message).not.toContain(g(1));
    expect(err.failedReason).toBe("delete 1");
    expect(err.done).toBe(1);
    expect(err.total).toBe(2);
    expect(err.deleted).toEqual([{ entitySet: SET, id: g(9) }]);
  });

  it("UT-PLAN-926 \"does not exist\" text on a 400 is NOT gone, for a hardened delete or (since D157) an unhardened one", async () => {
    const script = { [g(1)]: [{ status: 400, message: "Entity Other Does Not Exist" } as Answer] };
    const s = stub({ script });
    const err = await failed(run(planOf(hd(1)), s));
    expect(err).toBeInstanceOf(PlanError);
    expect((err.cause as DataError).status).toBe(400);
    expect(s.attempts.get(g(1))).toBe(1);
    expect(s.reads).toEqual([]);
    // D157: the unhardened delete accepted this text as "the row is gone" (it was `ok.deleted`); it is now the same failure.
    const s2 = stub({ script });
    const err2 = await failed(run(planOf(plain(1)), s2));
    expect(err2).toBeInstanceOf(PlanError);
    expect((err2.cause as DataError).status).toBe(400);
  });

  it("UT-PLAN-927 an UNHARDENED delete is exactly as before: a 404 is done with no read, a 500 is not retried", async () => {
    const s = stub({ script: { [g(1)]: [404], [g(2)]: [500] }, present: [g(1)] });
    const ok = await run(planOf(plain(1)), s);
    expect(ok.done).toBe(1);
    expect(s.reads).toEqual([]);
    const err = await failed(run(planOf(plain(2)), s));
    expect(s.attempts.get(g(2))).toBe(1);
    expect(err.cause).toBeInstanceOf(DataError);
  });

  it("UT-PLAN-928 confirm: a deleted row is read back only when verifyDeletes is on (the default is off)", async () => {
    const s = stub({ present: [g(1)] });
    const off = await run(planOf(hd(1, { confirm: true })), s);
    expect(off.deleted).toHaveLength(1);
    expect(s.reads).toEqual([]);
    const err = await failed(run(planOf(hd(1, { confirm: true })), s, { deleteFlags: { verifyDeletes: true } }));
    expect(err.cause).toBeInstanceOf(DeleteNotConfirmedError);
    expect(s.reads).toHaveLength(1);
    expect(err.deleted).toEqual([]);
    expect(err.done).toBe(0);
    const clean = stub({ present: [] });
    const done = await run(planOf(hd(1, { confirm: true }), hd(2)), clean, { deleteFlags: { verifyDeletes: true } });
    expect(done.deleted).toHaveLength(2);
    expect(clean.reads).toHaveLength(1);
  });

  it("UT-PLAN-929 a failed read-back stops the plan and the row is not claimed as deleted", async () => {
    const s = stub({ script: { [g(1)]: [404] }, readFails: 500 });
    const err = await failed(run(planOf(hd(1)), s));
    expect(err).toBeInstanceOf(PlanError);
    expect(err.cause).toBeInstanceOf(DataError);
    expect(err.cause).not.toBeInstanceOf(DeleteNotConfirmedError);
    expect(err.deleted).toEqual([]);
    expect(err.done).toBe(0);
  });

  it("UT-PLAN-930 a client that cannot read refuses to claim a gone row (fail closed)", async () => {
    const s = stub({ script: { [g(1)]: [404] }, noRead: true });
    const err = await failed(run(planOf(hd(1)), s));
    expect(err).toBeInstanceOf(PlanError);
    expect(err.message).toMatch(/cannot read rows/);
    expect(err.deleted).toEqual([]);
  });

  it("UT-PLAN-931 hardened or confirm on a write that is not a delete is refused before anything is sent", async () => {
    const s = stub();
    const bad: PlannedWrite = { op: "update", entitySet: SET, id: g(1), data: {}, reason: "u", hardened: true };
    await expect(run(planOf(plain(2), bad), s)).rejects.toThrow(/only a delete can be hardened/);
    await expect(run(planOf({ op: "update", entitySet: SET, id: g(1), data: {}, reason: "u", confirm: true }), s)).rejects.toThrow(/only a delete can be hardened/);
    expect(s.raw.deleteRecordAsync).not.toHaveBeenCalled();
  });
});

describe("a hardened delete, in a concurrent group", () => {
  it("UT-PLAN-932 a bare 503 is not retried inside the group: it fails the group, and the gone row is still read back", async () => {
    const s = stub({ script: { [g(1)]: [503, "ok"], [g(2)]: [404] }, present: [g(2)] });
    const group = together([hd(1), hd(2), hd(3)], { limit: 3 });
    const err = await failed(run(planOf(...group), s));
    expect(s.attempts.get(g(1))).toBe(1);
    expect((err.cause as DataError).status).toBe(503);
    expect(err.failures).toHaveLength(2);
    expect(err.failures[1]!.cause).toBeInstanceOf(DeleteNotConfirmedError);
  });

  it("UT-PLAN-933 a 429 inside the group is retried; a still-present gone row leaves deleted and done, the rest stay", async () => {
    const s = stub({ script: { [g(1)]: [429, "ok"], [g(2)]: [404] }, present: [g(2)] });
    const group = together([hd(1), hd(2), hd(3)], { limit: 3 });
    const err = await failed(run(planOf(...group), s));
    expect(s.attempts.get(g(1))).toBe(2);
    expect(err.cause).toBeInstanceOf(DeleteNotConfirmedError);
    expect(err.done).toBe(2);
    expect(err.deleted).toEqual([{ entitySet: SET, id: g(1) }, { entitySet: SET, id: g(3) }]);
    expect(s.reads).toHaveLength(1);
  });

  it("UT-PLAN-934 a write failure is reported first; every failure is in failures, an unconfirmed one last", async () => {
    const s = stub({ script: { [g(1)]: [403], [g(2)]: [404], [g(3)]: [400] }, present: [g(2)] });
    const group = together([hd(1), hd(2), hd(3), hd(4)], { limit: 4 });
    const err = await failed(run(planOf(...group), s));
    expect((err.cause as DataError).status).toBe(403);
    expect(err.failedReason).toBe("delete 1");
    expect(err.failures.map((f) => f.reason)).toEqual(["delete 1", "delete 3", "delete 2"]);
    expect(err.failures[2]!.cause).toBeInstanceOf(DeleteNotConfirmedError);
    expect(err.deleted).toEqual([{ entitySet: SET, id: g(4) }]);
    expect(err.done).toBe(1);
  });

  it("UT-PLAN-935 a plan failure outside hardened writes still has a single-entry failures list", async () => {
    const s = stub({ script: { [g(1)]: [403] } });
    const err = await failed(run(planOf(plain(1)), s));
    expect(err.failures).toEqual([{ reason: "delete 1", cause: err.cause }]);
  });
});

describe("serialKey inside a together() group", () => {
  /** Index of each event of an id in the stub's start/end log. */
  const at = (s: ReturnType<typeof stub>, what: string) => s.events.indexOf(what);

  it("UT-PLAN-936 writes with the same key run strictly one after another, in plan order", async () => {
    const s = stub({ deleteMs: 5 });
    const group = together([1, 2, 3, 4].map((n) => hd(n, { serialKey: "parent-A" })), { limit: 8 });
    await run(planOf(...group), s);
    expect(s.events).toEqual([1, 2, 3, 4].flatMap((n) => [`start ${g(n)}`, `end ${g(n)}`]));
    expect(s.peak()).toBe(1);
  });

  it("UT-PLAN-937 different keys overlap, and each key keeps its own order", async () => {
    const s = stub({ deleteMs: 10 });
    const group = together([
      hd(1, { serialKey: "A" }), hd(2, { serialKey: "B" }), hd(3, { serialKey: "A" }), hd(4, { serialKey: "B" }),
    ], { limit: 8 });
    await run(planOf(...group), s);
    expect(s.peak()).toBe(2);
    expect(at(s, `end ${g(1)}`)).toBeLessThan(at(s, `start ${g(3)}`));
    expect(at(s, `end ${g(2)}`)).toBeLessThan(at(s, `start ${g(4)}`));
    expect(at(s, `start ${g(2)}`)).toBeLessThan(at(s, `end ${g(1)}`));
  });

  it("UT-PLAN-938 keyless writes behave as before (all in flight up to the limit) and mix with keyed ones", async () => {
    const s = stub({ deleteMs: 10 });
    const group = together([hd(1), hd(2), hd(3), hd(4), hd(5, { serialKey: "K" }), hd(6, { serialKey: "K" })], { limit: 8 });
    await run(planOf(...group), s);
    expect(s.peak()).toBe(5);
    expect(at(s, `end ${g(5)}`)).toBeLessThan(at(s, `start ${g(6)}`));
  });

  it("UT-PLAN-939 the group's limit still bounds the requests in flight across many keys", async () => {
    const s = stub({ deleteMs: 5 });
    const group = together(Array.from({ length: 24 }, (_, i) => hd(i + 1, { serialKey: `K${i % 8}` })), { limit: 3 });
    const result = await run(planOf(...group), s);
    expect(result.done).toBe(24);
    expect(s.peak()).toBeLessThanOrEqual(3);
    expect(s.peak()).toBe(3);
  });

  it("UT-PLAN-940 a long queue on one key does not starve the others (no slot is held while waiting)", async () => {
    const s = stub({ deleteMs: 5 });
    const group = together([
      ...Array.from({ length: 6 }, (_, i) => hd(i + 1, { serialKey: "SLOW" })),
      hd(10, { serialKey: "OTHER" }),
    ], { limit: 2 });
    await run(planOf(...group), s);
    expect(at(s, `end ${g(10)}`)).toBeLessThan(at(s, `end ${g(6)}`));
  });

  it("UT-PLAN-941 a failure in a key does not stop the rest of that key unless stopOnFailure is set", async () => {
    const s = stub({ script: { [g(2)]: [403] } });
    const group = together([1, 2, 3].map((n) => hd(n, { serialKey: "A" })), { limit: 4 });
    const err = await failed(run(planOf(...group), s));
    expect(s.attempts.get(g(3))).toBe(1);
    expect(err.done).toBe(2);
  });
});

describe("together({ stopOnFailure })", () => {
  it("UT-PLAN-942 after the first failure no NEW write starts; the ones in flight finish; the rest are not counted", async () => {
    const s = stub({ script: { [g(2)]: [403] } });
    const group = together([1, 2, 3, 4, 5].map((n) => plain(n)), { limit: 1, stopOnFailure: true });
    const err = await failed(run(planOf(...group), s));
    expect(s.attempts.get(g(1))).toBe(1);
    expect(s.attempts.get(g(2))).toBe(1);
    expect(s.attempts.has(g(3))).toBe(false);
    expect(s.attempts.has(g(5))).toBe(false);
    expect(err.done).toBe(1);
    expect(err.total).toBe(5);
    expect(err.deleted).toEqual([{ entitySet: SET, id: g(1) }]);
  });

  it("UT-PLAN-943 writes already in flight finish and stay in deleted, and every failure they saw is reported", async () => {
    const s = stub({ script: { [g(1)]: [403], [g(2)]: [409] }, deleteMs: 5 });
    const group = together([1, 2, 3, 4, 5, 6].map((n) => plain(n)), { limit: 3, stopOnFailure: true });
    const err = await failed(run(planOf(...group), s));
    expect(err.failures.map((f) => f.reason)).toEqual(["delete 1", "delete 2"]);
    expect(s.attempts.has(g(4))).toBe(false);
    expect(err.deleted).toEqual([{ entitySet: SET, id: g(3) }]);
    expect(err.done).toBe(1);
  });

  it("UT-PLAN-944 the default sends every write even after a failure (allSettled, as before)", async () => {
    const s = stub({ script: { [g(2)]: [403] } });
    const group = together([1, 2, 3, 4, 5].map((n) => plain(n)), { limit: 1 });
    const err = await failed(run(planOf(...group), s));
    expect(s.raw.deleteRecordAsync).toHaveBeenCalledTimes(5);
    expect(err.done).toBe(4);
    expect(group.every((w) => w.stopOnFailure === undefined)).toBe(true);
  });

  it("UT-PLAN-945 the group's own failures, not the next group's: a stopped group stops the plan and the next group never runs", async () => {
    const s = stub({ script: { [g(1)]: [403] } });
    const first = together([plain(1), plain(2)], { limit: 1, stopOnFailure: true });
    const second = together([plain(7)], { limit: 1 });
    await failed(run(planOf(...first, ...second), s));
    expect(s.attempts.has(g(2))).toBe(false);
    expect(s.attempts.has(g(7))).toBe(false);
  });
});

describe("hardenedDelete() and together() shapes", () => {
  it("UT-PLAN-946 hardenedDelete builds a hardened delete; confirm and serialKey only when given", () => {
    expect(hardenedDelete(SET, g(1), "why")).toEqual({ op: "delete", entitySet: SET, id: g(1), reason: "why", hardened: true });
    expect(hardenedDelete(SET, g(1), "why", { confirm: true, serialKey: "k" })).toEqual({
      op: "delete", entitySet: SET, id: g(1), reason: "why", hardened: true, confirm: true, serialKey: "k",
    });
    expect(hardenedDelete(SET, g(1), "why", { serialKey: "" })).not.toHaveProperty("serialKey");
  });

  it("UT-PLAN-947 together() keeps hardened, confirm and serialKey and sets stopOnFailure only when asked", () => {
    const [a] = together([hardenedDelete(SET, g(1), "w", { confirm: true, serialKey: "k" })], { limit: 4, stopOnFailure: true });
    expect(a).toMatchObject({ concurrent: true, hardened: true, confirm: true, serialKey: "k", stopOnFailure: true, concurrencyLimit: 4 });
    const [b] = together([plain(1)]);
    expect(b).not.toHaveProperty("stopOnFailure");
  });
});
