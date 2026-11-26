/**
 * UT-PLANPOL-001.. — the plan engine's single writes through the request policy (dvopt T-11, WE-02; switch `POLICY_PLAN_WRITES`).
 * Matrix (doc 21 section 2): a 429 retries every kind; a transient failure (5xx, network) retries only a delete and an update with
 * absolute values; a create never retries on a transient failure; 400, 403, 404, 409 never retry. Hardened deletes keep their own
 * retry and are not wrapped again. The sleeper and the jitter are injected: nothing here waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  flags: { POLICY_PLAN_WRITES: true, POLICY_VERIFY_READS: true },
  actions: [] as string[],
  datas: [] as unknown[],
}));
vi.mock("./requestFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./requestFlags")>();
  return {
    ...actual,
    get POLICY_PLAN_WRITES() { return h.flags.POLICY_PLAN_WRITES; },
    get POLICY_VERIFY_READS() { return h.flags.POLICY_VERIFY_READS; },
  };
});
vi.mock("@/platform/requestLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/requestLog")>();
  return {
    ...actual,
    logAction: (line: string) => { h.actions.push(line); },
    logData: (d: { kind: string; target: string; rows?: number; ok: boolean }) => { h.datas.push({ kind: d.kind, target: d.target, rows: d.rows, ok: d.ok }); },
  };
});

import { DataError } from "@/platform/errors";
import { executePlan, PlanError, type PlanClient } from "./executePlan";
import { setPolicyTestSeams } from "./requestPolicy";
import { setDeleteSleeper } from "./retry";
import { emptyPlan, hardenedDelete, type PlannedWrite } from "./writePlan";

const SET = "vsb_capexaccountlists";
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

type Answer = "ok" | number | "net";
const waits: number[] = [];

/** A client whose update / create / delete answer from a script per call (the last answer repeats). */
function client(script: { update?: Answer[]; create?: Answer[]; delete?: Answer[] }) {
  const counts = { update: 0, create: 0, delete: 0 };
  const answer = (kind: "update" | "create" | "delete", data: unknown) => {
    const list = script[kind] ?? ["ok"];
    const a = list[Math.min(counts[kind]++, list.length - 1)]!;
    if (a === "ok") return { success: true as const, data };
    if (a === "net") throw new TypeError("Failed to fetch");
    return { success: false as const, error: Object.assign(new Error(`HTTP ${a}`), { status: a }) };
  };
  const raw = {
    createRecordAsync: vi.fn(async () => answer("create", { vsb_capexaccountlistid: g(99) })),
    updateRecordAsync: vi.fn(async () => answer("update", {})),
    deleteRecordAsync: vi.fn(async () => answer("delete", undefined)),
    retrieveMultipleRecordsAsync: vi.fn(async () => ({ success: true as const, data: [{ vsb_capexaccountlistid: g(1) }] })),
  };
  return { client: raw as unknown as PlanClient, raw, counts };
}

const plan = (...writes: PlannedWrite[]) => {
  const p = emptyPlan();
  p.writes.push(...writes);
  return p;
};
const upd = (n: number): PlannedWrite => ({ op: "update", entitySet: SET, id: g(n), data: { vsb_name: `v${n}` }, reason: `update ${n}` });

beforeEach(() => {
  h.flags.POLICY_PLAN_WRITES = true;
  h.flags.POLICY_VERIFY_READS = true;
  h.actions.length = 0;
  h.datas.length = 0;
  waits.length = 0;
  setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
  setDeleteSleeper(async () => {});
});
afterEach(() => {
  setPolicyTestSeams(null);
  setDeleteSleeper(null);
});

describe("plan writes through the policy", () => {
  it("UT-PLANPOL-001 a 429 on update row k is retried and the plan completes", async () => {
    const { client: c, raw } = client({ update: ["ok", "ok", 429, "ok", "ok"] });
    const result = await executePlan(plan(upd(1), upd(2), upd(3), upd(4)), "test", c);
    expect(result.done).toBe(4);
    expect(raw.updateRecordAsync).toHaveBeenCalledTimes(5);
    expect(waits).toHaveLength(1);
  });

  it("UT-PLANPOL-002 a create is NOT retried after a 500 (it may have landed): one request, a PlanError", async () => {
    const { client: c, raw } = client({ create: [500] });
    const p = plan({ op: "create", entitySet: SET, data: { vsb_name: "n" }, reason: "create" });
    const error = await executePlan(p, "test", c).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(raw.createRecordAsync).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("UT-PLANPOL-003 a create is NOT retried after a network failure either", async () => {
    const { client: c, raw } = client({ create: ["net"] });
    const p = plan({ op: "create", entitySet: SET, data: { vsb_name: "n" }, reason: "create" });
    await expect(executePlan(p, "test", c)).rejects.toBeInstanceOf(PlanError);
    expect(raw.createRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-PLANPOL-004 a create IS retried after a 429 (not processed) and returns the created id", async () => {
    const { client: c, raw } = client({ create: [429, "ok"] });
    const p = plan({ op: "create", entitySet: SET, data: { vsb_name: "n" }, reason: "create" });
    const result = await executePlan(p, "test", c);
    expect(result.createdIds).toEqual([g(99)]);
    expect(raw.createRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-PLANPOL-005 an update (absolute values) retries a 503 and a network failure", async () => {
    const a = client({ update: [503, "ok"] });
    await executePlan(plan(upd(1)), "test", a.client);
    expect(a.raw.updateRecordAsync).toHaveBeenCalledTimes(2);
    const b = client({ update: ["net", "ok"] });
    await executePlan(plan(upd(1)), "test", b.client);
    expect(b.raw.updateRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-PLANPOL-006 an update that keeps answering 503 gives up after 3 tries; the PlanError counts are those of an unretried failure", async () => {
    const { client: c, raw } = client({ update: ["ok", 503] });
    const error = await executePlan(plan(upd(1), upd(2), upd(3)), "test", c).catch((e: unknown) => e) as PlanError;
    expect(error).toBeInstanceOf(PlanError);
    expect(raw.updateRecordAsync).toHaveBeenCalledTimes(1 + 3);
    expect([error.done, error.total, error.failedReason]).toEqual([1, 3, "update 2"]);
  });

  it("UT-PLANPOL-007 400, 403, 404 and 409 are never retried (an update, a delete and a create each sent once)", async () => {
    for (const status of [400, 403, 404, 409]) {
      const u = client({ update: [status] });
      await expect(executePlan(plan(upd(1)), "test", u.client)).rejects.toBeInstanceOf(PlanError);
      expect(u.raw.updateRecordAsync).toHaveBeenCalledTimes(1);
      const cr = client({ create: [status] });
      await expect(executePlan(plan({ op: "create", entitySet: SET, data: {}, reason: "c" }), "test", cr.client)).rejects.toBeInstanceOf(PlanError);
      expect(cr.raw.createRecordAsync).toHaveBeenCalledTimes(1);
      if (status !== 404) {
        const d = client({ delete: [status] });
        await expect(executePlan(plan({ op: "delete", entitySet: SET, id: g(1), reason: "d" }), "test", d.client)).rejects.toBeInstanceOf(PlanError);
        expect(d.raw.deleteRecordAsync).toHaveBeenCalledTimes(1);
      }
    }
    expect(waits).toEqual([]);
  });

  it("UT-PLANPOL-008 a plain delete retries a 503; a 404 (gone) is done, with no retry", async () => {
    const a = client({ delete: [503, "ok"] });
    const result = await executePlan(plan({ op: "delete", entitySet: SET, id: g(1), reason: "d" }), "test", a.client);
    expect(result.done).toBe(1);
    expect(a.raw.deleteRecordAsync).toHaveBeenCalledTimes(2);
    const b = client({ delete: [404] });
    const gone = await executePlan(plan({ op: "delete", entitySet: SET, id: g(1), reason: "d" }), "test", b.client);
    expect(gone.done).toBe(1);
    expect(b.raw.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-PLANPOL-009 a delete retried after a lost answer sees a 404 and counts as done", async () => {
    const { client: c, raw } = client({ delete: ["net", 404] });
    const result = await executePlan(plan({ op: "delete", entitySet: SET, id: g(1), reason: "d" }), "test", c);
    expect(result.done).toBe(1);
    expect(raw.deleteRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-PLANPOL-010 a guarded update retries its existence read and its PATCH (2 requests when nothing fails)", async () => {
    const { client: c, raw } = client({ update: [429, "ok"] });
    raw.retrieveMultipleRecordsAsync
      .mockResolvedValueOnce({ success: false as const, error: Object.assign(new Error("HTTP 503"), { status: 503 }) } as never)
      .mockResolvedValue({ success: true as const, data: [{ vsb_capexaccountlistid: g(1) }] } as never);
    const result = await executePlan(plan({ ...upd(1), guarded: true }), "test", c);
    expect(result.done).toBe(1);
    expect(raw.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(2);
    expect(raw.updateRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-PLANPOL-011 a hardened delete is not wrapped again: a persistent 503 is 3 requests, not 9", async () => {
    const { client: c, raw } = client({ delete: [503] });
    const error = await executePlan(plan(hardenedDelete(SET, g(1), "d")), "test", c).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(raw.deleteRecordAsync).toHaveBeenCalledTimes(3);
    expect(h.actions.filter((l) => l.includes("(delete):"))).toEqual([]);
  });

  it("UT-PLANPOL-012 one [VSB] retry line per retry, naming the entity set, with no id and no value", async () => {
    const { client: c } = client({ update: [429, 503, "ok"] });
    await executePlan(plan(upd(1)), "test", c);
    const lines = h.actions.filter((l) => l.includes("trying again"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`${SET} (patchAbsolute): try 1 of 4 failed (throttled, HTTP 429)`);
    expect(lines[1]).toContain("try 2 of 3 failed (transient, HTTP 503)");
    for (const line of lines) expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|v1/);
  });

  it("UT-PLANPOL-013 with no retry the error text, the partial counts and the [VSB] lines equal those of the switch OFF (differential)", async () => {
    const run = async (on: boolean) => {
      h.flags.POLICY_PLAN_WRITES = on;
      h.actions.length = 0;
      h.datas.length = 0;
      const { client: c } = client({ update: ["ok", 400] });
      const error = await executePlan(plan(upd(1), upd(2), upd(3)), "test", c).catch((e: unknown) => e) as PlanError;
      return { message: error.message, done: error.done, total: error.total, reason: error.failedReason, actions: [...h.actions], datas: [...h.datas] };
    };
    const on = await run(true);
    const off = await run(false);
    expect(on).toEqual(off);
    expect(on.done).toBe(1);
  });

  it("UT-PLANPOL-014 the switch OFF reproduces the earlier behaviour: a 429 update is sent once and fails", async () => {
    h.flags.POLICY_PLAN_WRITES = false;
    const { client: c, raw } = client({ update: [429, "ok"] });
    await expect(executePlan(plan(upd(1)), "test", c)).rejects.toBeInstanceOf(PlanError);
    expect(raw.updateRecordAsync).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("UT-PLANPOL-015 the switch OFF: a create after a 429 and a delete after a 503 are sent once", async () => {
    h.flags.POLICY_PLAN_WRITES = false;
    const a = client({ create: [429, "ok"] });
    await expect(executePlan(plan({ op: "create", entitySet: SET, data: {}, reason: "c" }), "test", a.client)).rejects.toBeInstanceOf(PlanError);
    expect(a.raw.createRecordAsync).toHaveBeenCalledTimes(1);
    const b = client({ delete: [503, "ok"] });
    await expect(executePlan(plan({ op: "delete", entitySet: SET, id: g(1), reason: "d" }), "test", b.client)).rejects.toBeInstanceOf(PlanError);
    expect(b.raw.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-PLANPOL-016 a persistent 429 on a create gives up after 4 tries (the throttled limit), then fails like before", async () => {
    const { client: c, raw } = client({ create: [429] });
    const error = await executePlan(plan({ op: "create", entitySet: SET, data: {}, reason: "c" }), "test", c).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect((error as PlanError).cause).toBeInstanceOf(DataError);
    expect(raw.createRecordAsync).toHaveBeenCalledTimes(4);
  });
});
