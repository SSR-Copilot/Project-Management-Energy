/**
 * UT-BULKPOL-001.. — the Add Cost / CAPEX bulk transport, the per-row upsert fallback, the deep insert and the verify reads through
 * the request policy (dvopt T-11, CA-01, CA-17; switches `POLICY_BULK_TRANSPORT`, `POLICY_VERIFY_READS`). Matrix: a bulk call retries
 * only a 429 (a 500 may have landed); a per-row PATCH (absolute values, stable id) retries a 5xx; a deep-insert create retries only a
 * 429; a read inside the write path retries a 429 / 5xx. The retry wait holds no `saveGate` slot. Sleeper and jitter injected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  flags: { POLICY_BULK_TRANSPORT: true, POLICY_VERIFY_READS: true, GLOBAL_GATE: false },
  lines: [] as string[],
  datas: [] as { kind: string; ok: boolean; rows?: number }[],
  /** Scripted answers per service call; the last repeats. */
  script: { create: [] as unknown[], update: [] as unknown[], rowPatch: [] as unknown[], rowCreate: [] as unknown[], read: [] as unknown[] },
  calls: { create: 0, update: 0, rowPatch: 0, rowCreate: 0, read: 0 },
}));

const next = (kind: keyof typeof h.calls): unknown => {
  const list = h.script[kind];
  const answer = list[Math.min(h.calls[kind], list.length - 1)];
  h.calls[kind] += 1;
  return answer;
};

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));
vi.mock("./requestFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./requestFlags")>();
  return {
    ...actual,
    get POLICY_BULK_TRANSPORT() { return h.flags.POLICY_BULK_TRANSPORT; },
    get POLICY_VERIFY_READS() { return h.flags.POLICY_VERIFY_READS; },
    get GLOBAL_GATE() { return h.flags.GLOBAL_GATE; },
  };
});
vi.mock("@/platform/requestLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/requestLog")>();
  return {
    ...actual,
    logAction: (line: string) => { h.lines.push(line); },
    logData: (d: { kind: string; ok: boolean; rows?: number }) => { h.datas.push({ kind: d.kind, ok: d.ok, rows: d.rows }); },
  };
});
vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: { CreateMultiple: async () => next("create") },
}));
vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: { UpdateMultiple: async () => next("update") },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => next("read"),
    update: async () => next("rowPatch"),
    create: async () => next("rowCreate"),
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => next("read"),
    update: async () => next("rowPatch"),
    create: async () => next("rowCreate"),
  },
}));

import { DataError } from "@/platform/errors";
import { CAPEX_CONTRACTS, CAPEX_COSTS } from "./addCostSheetBulk";
import {
  createRequestMeter, deepInsertContracts, existingIds, resetBulkWriteAvailability, resetDeepInsertState, upsertRowsByAction,
} from "./bulkSend";
import type { DeepInsertGroup, UpsertTarget } from "./bulkTypes";
import { setPolicyTestSeams } from "./requestPolicy";

const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const bad = (status: number) => ({ success: false as const, error: Object.assign(new Error(`HTTP ${status}`), { status }) });
const ok = { success: true as const, data: {} };
const waits: number[] = [];
let inFlightDuringWait: number[] = [];

const newRow = (n: number): UpsertTarget => ({
  id: g(n), isNew: true, fields: { vsb_cost: n, "OwningBusinessUnit@odata.bind": "/businessunits(x)" } as Record<string, unknown>,
});
const oldRow = (n: number): UpsertTarget => ({ id: g(n), isNew: false, fields: { vsb_cost: n } });

beforeEach(() => {
  h.flags.POLICY_BULK_TRANSPORT = true;
  h.flags.POLICY_VERIFY_READS = true;
  h.flags.GLOBAL_GATE = false;
  h.lines.length = 0;
  h.datas.length = 0;
  for (const k of Object.keys(h.calls) as (keyof typeof h.calls)[]) { h.calls[k] = 0; h.script[k] = [ok]; }
  waits.length = 0;
  inFlightDuringWait = [];
  resetBulkWriteAvailability();
  resetDeepInsertState();
  setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
});
afterEach(() => setPolicyTestSeams(null));

describe("bulk transport", () => {
  it("UT-BULKPOL-001 a 429 on a bulk chunk is retried and the group completes", async () => {
    h.script.create = [bad(429), ok];
    const result = await upsertRowsByAction(CAPEX_COSTS, [newRow(1), newRow(2)], "costs");
    expect(h.calls.create).toBe(2);
    expect(waits).toHaveLength(1);
    expect(result.requests).toBe(1);
  });

  it("UT-BULKPOL-002 a bulk call is NOT retried after a 500 or a network failure (it may have landed): one request, the same error", async () => {
    h.script.create = [bad(500)];
    await expect(upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs")).rejects.toMatchObject({ name: "BulkWriteError" });
    expect(h.calls.create).toBe(1);
    h.calls.create = 0;
    h.script.create = [Promise.reject(new TypeError("Failed to fetch"))];
    await expect(upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs")).rejects.toBeDefined();
    expect(h.calls.create).toBe(1);
    expect(waits).toEqual([]);
  });

  it("UT-BULKPOL-003 a 400, 403, 409 and 501 are never retried (501 still reaches the per-row fallback)", async () => {
    for (const status of [400, 403, 409]) {
      h.calls.update = 0;
      h.script.update = [bad(status)];
      await expect(upsertRowsByAction(CAPEX_COSTS, [oldRow(1)], "costs")).rejects.toBeDefined();
      expect(h.calls.update).toBe(1);
    }
    h.calls.update = 0;
    h.script.update = [bad(501)];
    await upsertRowsByAction(CAPEX_COSTS, [oldRow(1)], "costs");
    expect(h.calls.update).toBe(1);
    expect(h.calls.rowPatch).toBe(1);
  });

  it("UT-BULKPOL-004 a persistent 429 gives up after 4 tries and fails as before; each attempt logs its own DATA line", async () => {
    h.script.create = [bad(429)];
    await expect(upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs")).rejects.toMatchObject({ name: "BulkWriteError" });
    expect(h.calls.create).toBe(4);
    expect(h.datas.filter((d) => d.kind === "create" && !d.ok)).toHaveLength(4);
  });

  it("UT-BULKPOL-005 the retry wait holds no write-gate slot (WE-05): the meter shows nothing in flight while sleeping", async () => {
    const meter = createRequestMeter();
    setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); inFlightDuringWait.push(meter.inFlight); }, random: () => 0.5 });
    h.script.create = [bad(429), ok];
    await upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs", undefined, { meter });
    expect(inFlightDuringWait).toEqual([0]);
    expect(meter.count).toBe(2);
  });

  it("UT-BULKPOL-006 a retry prints one [VSB] line with the entity set, no id", async () => {
    h.script.create = [bad(429), ok];
    await upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs");
    const retry = h.lines.filter((l) => l.includes("trying again"));
    expect(retry).toHaveLength(1);
    expect(retry[0]).toContain("vsb_capexcosts (bulk): try 1 of 4 failed (throttled, HTTP 429)");
    expect(retry[0]).not.toContain(g(1));
  });

  it("UT-BULKPOL-007 the switch OFF: a 429 chunk is sent once and fails; no retry line", async () => {
    h.flags.POLICY_BULK_TRANSPORT = false;
    h.script.create = [bad(429), ok];
    await expect(upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs")).rejects.toMatchObject({ name: "BulkWriteError" });
    expect(h.calls.create).toBe(1);
    expect(h.lines.filter((l) => l.includes("trying again"))).toEqual([]);
  });

  it("UT-BULKPOL-008 with no retry the error and the DATA lines equal those of the switch OFF (differential)", async () => {
    const run = async (on: boolean) => {
      h.flags.POLICY_BULK_TRANSPORT = on;
      h.calls.update = 0;
      h.datas.length = 0;
      h.lines.length = 0;
      h.script.update = [bad(403)];
      const error = await upsertRowsByAction(CAPEX_COSTS, [oldRow(1), oldRow(2)], "costs").catch((e: unknown) => e) as Error;
      return { name: error.name, message: error.message, datas: [...h.datas], lines: [...h.lines], calls: h.calls.update };
    };
    expect(await run(true)).toEqual(await run(false));
  });
});

describe("per-row upsert fallback", () => {
  const to501 = () => { h.script.create = [bad(501)]; h.script.update = [bad(501)]; };

  it("UT-BULKPOL-010 after a 501 each row is a PATCH; a 503 on row k is retried and the save completes", async () => {
    to501();
    h.script.rowPatch = [ok, bad(503), ok, ok];
    const result = await upsertRowsByAction(CAPEX_COSTS, [newRow(1), newRow(2), newRow(3)], "costs");
    expect(h.calls.rowPatch).toBe(4);
    expect(result.requests).toBeGreaterThan(0);
  });

  it("UT-BULKPOL-011 a 400 / 403 / 404 / 409 on a per-row PATCH is never retried", async () => {
    for (const status of [400, 403, 404, 409]) {
      resetBulkWriteAvailability();
      h.calls.rowPatch = 0;
      to501();
      h.script.rowPatch = [bad(status)];
      await expect(upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs")).rejects.toBeDefined();
      expect(h.calls.rowPatch).toBe(1);
    }
  });

  it("UT-BULKPOL-012 the switch OFF: a 503 per-row PATCH is sent once", async () => {
    h.flags.POLICY_BULK_TRANSPORT = false;
    to501();
    h.script.rowPatch = [bad(503), ok];
    await expect(upsertRowsByAction(CAPEX_COSTS, [newRow(1)], "costs")).rejects.toBeDefined();
    expect(h.calls.rowPatch).toBe(1);
  });
});

describe("deep insert", () => {
  const group = (n: number): DeepInsertGroup => ({
    contract: { id: g(n), isNew: true, fields: { vsb_name: "c", "OwningBusinessUnit@odata.bind": "/businessunits(x)" } },
    costs: [{ id: g(n + 100), isNew: true, fields: { vsb_cost: 1, "OwningBusinessUnit@odata.bind": "/businessunits(x)" } }],
  }) as unknown as DeepInsertGroup;

  it("UT-BULKPOL-020 a deep-insert create IS retried after a 429", async () => {
    h.script.rowCreate = [bad(429), ok];
    h.script.read = [{ success: true, data: [{ vsb_capexcostid: g(101) }] }];
    await deepInsertContracts([group(1)], "save");
    expect(h.calls.rowCreate).toBe(2);
  });

  it("UT-BULKPOL-021 a deep-insert create is NOT retried after a 500 (the contract may exist)", async () => {
    h.script.rowCreate = [bad(500), ok];
    await expect(deepInsertContracts([group(1)], "save")).rejects.toMatchObject({ name: "DeepInsertError" });
    expect(h.calls.rowCreate).toBe(1);
  });

  it("UT-BULKPOL-022 the switch OFF: a 429 deep-insert create is sent once", async () => {
    h.flags.POLICY_BULK_TRANSPORT = false;
    h.script.rowCreate = [bad(429), ok];
    await expect(deepInsertContracts([group(1)], "save")).rejects.toMatchObject({ name: "DeepInsertError" });
    expect(h.calls.rowCreate).toBe(1);
  });
});

describe("verify reads (existingIds)", () => {
  const page = (ids: string[]) => ({ success: true as const, data: ids.map((id) => ({ vsb_capexcostid: id })) });

  it("UT-BULKPOL-030 a 429 or 503 on the existence read is retried; the ids come back lower-cased", async () => {
    h.script.read = [bad(429), bad(503), page([g(1).toUpperCase()])];
    const found = await existingIds(CAPEX_COSTS, [g(1)]);
    expect([...found]).toEqual([g(1)]);
    expect(h.calls.read).toBe(3);
  });

  it("UT-BULKPOL-031 a read that keeps failing still THROWS (never 'gone'); a 403 is sent once", async () => {
    h.script.read = [bad(403)];
    await expect(existingIds(CAPEX_COSTS, [g(1)])).rejects.toBeInstanceOf(DataError);
    expect(h.calls.read).toBe(1);
    h.calls.read = 0;
    h.script.read = [bad(503)];
    await expect(existingIds(CAPEX_CONTRACTS, [g(1)])).rejects.toBeInstanceOf(DataError);
    expect(h.calls.read).toBe(3);
  });

  it("UT-BULKPOL-032 the switch OFF: one attempt", async () => {
    h.flags.POLICY_VERIFY_READS = false;
    h.script.read = [bad(503), page([])];
    await expect(existingIds(CAPEX_COSTS, [g(1)])).rejects.toBeInstanceOf(DataError);
    expect(h.calls.read).toBe(1);
  });

  it("UT-BULKPOL-033 with GLOBAL_GATE on, the verify read takes a read slot of the global gate (CA-17) and still returns the same ids", async () => {
    const { requestGate } = await import("./concurrency");
    requestGate.reset();
    h.flags.GLOBAL_GATE = true;
    h.script.read = [page([g(1)])];
    const found = await existingIds(CAPEX_COSTS, [g(1)]);
    expect([...found]).toEqual([g(1)]);
    expect(requestGate.peak()).toBe(1);
    requestGate.reset();
  });
});
