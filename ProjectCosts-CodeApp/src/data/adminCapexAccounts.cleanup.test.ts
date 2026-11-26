/**
 * CAPEX forecast clean-up, resilient mode (dvopt T-04 / AD-01, AD-05) and the CAPEX tree's gated contract checks (AD-03).
 * The REAL `adminRowWrites` runs here, over a scripted SDK client and a scripted `deleteRecord`. UT-ADCLEAN-nnn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => { throw new Error("tests inject a client"); } }));

type Options = { select?: string[]; filter?: string };
let fetchAllRows: Record<string, { id: string }[]> = {};
let pageDelayMs = 0;
let pageInFlight = 0;
let pagePeak = 0;
let pageCalls = 0;
let pageFails = new Set<number>();
/** id → scripted answers of its DELETEs (an HTTP status, 0 = success); consumed one per attempt. */
let deleteScript: Record<string, number[]> = {};
let deleteAttempts: Record<string, number> = {};
let deleted: string[] = [];

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  fetchAll: async (label: string, _page: unknown, _options: Options) => {
    if (label === "list CAPEX contracts for deactivated accounts") return [{ vsb_capexprojectcontractid: CONTRACT }];
    if (label === "list current-year forecast CAPEX costs") return (fetchAllRows["zero"] ?? []).map((r) => ({ vsb_capexcostid: r.id }));
    if (label === "list future-year forecast CAPEX costs") return (fetchAllRows["delete"] ?? []).map((r) => ({ vsb_capexcostid: r.id }));
    return [];
  },
  fetchPage: async () => {
    const n = pageCalls++;
    pageInFlight += 1;
    pagePeak = Math.max(pagePeak, pageInFlight);
    try {
      if (pageDelayMs) await new Promise((r) => setTimeout(r, pageDelayMs));
      if (pageFails.has(n)) throw new Error(`check ${n} failed`);
      return [];
    } finally {
      pageInFlight -= 1;
    }
  },
  deleteRecord: async (operation: string, _table: string, id: string) => {
    deleteAttempts[id] = (deleteAttempts[id] ?? 0) + 1;
    const code = deleteScript[id]?.[deleteAttempts[id]! - 1];
    if (code) {
      const { DataError } = await import("@/platform/errors");
      throw new DataError(operation, { message: `HTTP ${code}`, status: code }, code);
    }
    deleted.push(id);
  },
}));
vi.mock("@/generated/services/Vsb_capexaccountlistsService", () => ({ Vsb_capexaccountlistsService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({ Vsb_capexprojectcontractsService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({ Vsb_capexcostsService: { getAll: vi.fn() } }));

import { ADMIN_OPT } from "./adminFlags";
import { RowWriteError, type RowWriteClient } from "./adminRowWrites";
import {
  PartialStepError, cleanUpForecastCosts, deleteCapexAccount, deleteCapexSubaccount, hasContractsPooled,
} from "./adminCapexAccounts";

const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const CONTRACT = G(900);
const SUB = G(3);
const DEFAULTS = { ...ADMIN_OPT };

/** Scripted zero PATCHes: id → answers per attempt (an HTTP status, 0 = success). Records attempts, peak in flight and patched ids. */
function zeroClient(script: Record<string, number[]> = {}) {
  const attempts: Record<string, number> = {};
  const patched: { id: string; fields: unknown }[] = [];
  let inFlight = 0; let peak = 0;
  const client: RowWriteClient = {
    retrieveMultipleRecordsAsync: async <T,>(_t: string, options?: { filter?: string }) => {
      const id = /eq (\S+)$/.exec(options?.filter ?? "")?.[1] ?? "";
      return { success: true, data: [{ id }] as T[] };
    },
    updateRecordAsync: async <TIn, TOut>(_t: string, id: string, fields: TIn) => {
      attempts[id] = (attempts[id] ?? 0) + 1;
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      const code = script[id]?.[attempts[id]! - 1];
      if (code) return { success: false, data: undefined as TOut, error: Object.assign(new Error(`HTTP ${code}`), { status: code, ...(code === 429 ? { retryAfter: 2 } : {}) }) };
      patched.push({ id, fields });
      return { success: true, data: {} as TOut };
    },
    createRecordAsync: async () => { throw new Error("unused"); },
  };
  return { client: () => client, attempts, patched, peak: () => peak };
}

const Z = (n: number) => G(1000 + n);
const D = (n: number) => G(2000 + n);
const zeroIds = (n: number) => Array.from({ length: n }, (_, i) => ({ id: Z(i + 1) }));
const deleteIds = (n: number) => Array.from({ length: n }, (_, i) => ({ id: D(i + 1) }));
const sleepLog = () => { const waits: number[] = []; return { waits, sleep: async (ms: number) => { waits.push(ms); } }; };

beforeEach(() => {
  Object.assign(ADMIN_OPT, DEFAULTS);
  fetchAllRows = {}; deleteScript = {}; deleteAttempts = {}; deleted = [];
  pageDelayMs = 0; pageInFlight = 0; pagePeak = 0; pageCalls = 0; pageFails = new Set();
});
afterEach(() => { Object.assign(ADMIN_OPT, DEFAULTS); });

describe("Resilient clean-up (AD-01 / T-04)", () => {
  it("UT-ADCLEAN-001 success path: every row zeroed with the constant payload, every row deleted, result and counts unchanged", async () => {
    fetchAllRows = { zero: zeroIds(20), delete: deleteIds(40) };
    const z = zeroClient();
    const result = await cleanUpForecastCosts([SUB], 2026, 10, { client: z.client, sleep: async () => {} });
    expect(result).toEqual({ contracts: 1, zeroed: 20, deleted: 40 });
    expect(z.patched).toHaveLength(20);
    expect(z.patched.every((p) => JSON.stringify(p.fields) === JSON.stringify({ vsb_cost: 0 }))).toBe(true);
    expect([...deleted].sort()).toEqual(deleteIds(40).map((r) => r.id));
    expect(z.peak()).toBeLessThanOrEqual(8);
  });

  it("UT-ADCLEAN-002 differential: resilient on and off send the same PATCHes and DELETEs on the success path", async () => {
    fetchAllRows = { zero: zeroIds(15), delete: deleteIds(25) };
    const on = zeroClient();
    const resultOn = await cleanUpForecastCosts([SUB], 2026, 10, { client: on.client, sleep: async () => {} });
    const deletedOn = [...deleted].sort();
    deleted = []; deleteAttempts = {};
    ADMIN_OPT.CLEANUP_RESILIENT = false;
    const off = zeroClient();
    const resultOff = await cleanUpForecastCosts([SUB], 2026, 10, { client: off.client });
    expect(resultOn).toEqual(resultOff);
    expect(on.patched.map((p) => p.id).sort()).toEqual(off.patched.map((p) => p.id).sort());
    expect(deletedOn).toEqual([...deleted].sort());
  });

  it("UT-ADCLEAN-003 429 on zero row k: the row is retried after the wait and the run completes", async () => {
    fetchAllRows = { zero: zeroIds(12), delete: [] };
    const z = zeroClient({ [Z(5)]: [429, 429] });
    const s = sleepLog();
    const result = await cleanUpForecastCosts([SUB], 2026, 10, { client: z.client, sleep: s.sleep });
    expect(result).toEqual({ contracts: 1, zeroed: 12, deleted: 0 });
    expect(z.attempts[Z(5)]).toBe(3);
    expect(s.waits).toEqual([2000, 2000]);
    expect(z.patched.map((p) => p.id)).toContain(Z(5));
  });

  it("UT-ADCLEAN-004 429 on delete row k: retried through withDeleteRetry and the run completes", async () => {
    fetchAllRows = { zero: [], delete: deleteIds(20) };
    deleteScript = { [D(7)]: [429, 429] };
    const s = sleepLog();
    const result = await cleanUpForecastCosts([SUB], 2026, 10, { client: zeroClient().client, sleep: s.sleep });
    expect(result.deleted).toBe(20);
    expect(deleteAttempts[D(7)]).toBe(3);
    expect(deleted).toHaveLength(20);
    // QA-04: a 429 waits EQUAL jitter on a 2 s base, so the 1st retry lies in [1000, 2000] and the 2nd in [2000, 4000] (the old fixed 1000 / 2000 and the earlier full-jitter 0..1000 / 0..2000 are gone).
    expect(s.waits).toHaveLength(2);
    expect(s.waits[0]).toBeGreaterThanOrEqual(1000); expect(s.waits[0]).toBeLessThanOrEqual(2000);
    expect(s.waits[1]).toBeGreaterThanOrEqual(2000); expect(s.waits[1]).toBeLessThanOrEqual(4000);
  });

  it("UT-ADCLEAN-005 a 400 on a zero row is not retried, the other rows still go, and the PartialStepError carries the counts and the rerun note", async () => {
    fetchAllRows = { zero: zeroIds(20), delete: deleteIds(5) };
    const z = zeroClient({ [Z(3)]: [400] });
    const error = await cleanUpForecastCosts([SUB], 2026, 10, { client: z.client, sleep: async () => {} }).catch((e: unknown) => e) as PartialStepError;
    expect(error).toBeInstanceOf(PartialStepError);
    expect(z.attempts[Z(3)]).toBe(1);
    expect(z.patched).toHaveLength(19);
    expect(deleted).toHaveLength(5);
    expect(error.failedStep).toBe("Future-month costs set to 0 (20 rows)");
    expect(error.completed).toEqual(["Later-year costs deleted (5 rows)"]);
    expect(error.detail).toBe(
      "19 of 20 future-month cost rows were set to 0 (1 failed after retries; running the clean-up again is safe, it skips the rows already done)",
    );
    expect(error.cause).toBeInstanceOf(RowWriteError);
    expect((error.cause as RowWriteError).partial).toBe(true);
  });

  it("UT-ADCLEAN-006 a persistent 429 stops after 3 tries for that row only", async () => {
    fetchAllRows = { zero: zeroIds(6), delete: [] };
    const z = zeroClient({ [Z(2)]: [429, 429, 429, 429] });
    const error = await cleanUpForecastCosts([SUB], 2026, 10, { client: z.client, sleep: async () => {} }).catch((e: unknown) => e) as PartialStepError;
    expect(z.attempts[Z(2)]).toBe(3);
    expect(z.patched).toHaveLength(5);
    expect(error.detail).toContain("5 of 6 future-month cost rows were set to 0 (1 failed after retries");
  });

  it("UT-ADCLEAN-007 a 400 on a delete: the other deletes finish, the zeroing is listed as completed, counts are right", async () => {
    fetchAllRows = { zero: zeroIds(2), delete: deleteIds(30) };
    deleteScript = { [D(10)]: [400], [D(11)]: [400] };
    const error = await cleanUpForecastCosts([SUB], 2026, 10, { client: zeroClient().client, sleep: async () => {} }).catch((e: unknown) => e) as PartialStepError;
    expect(error.failedStep).toBe("Later-year costs deleted (30 rows)");
    expect(error.completed).toEqual(["Future-month costs set to 0 (2 rows)"]);
    expect(error.detail).toBe(
      "28 of 30 later-year cost rows were deleted (2 failed after retries; running the clean-up again is safe, it skips the rows already done)",
    );
    expect(deleted).toHaveLength(28);
    expect(deleteAttempts[D(10)]).toBe(1);
  });

  it("UT-ADCLEAN-008 a delete answering 404 (an overlapping clean-up got there first) counts as done", async () => {
    fetchAllRows = { zero: [], delete: deleteIds(10) };
    deleteScript = { [D(4)]: [404], [D(5)]: [404] };
    const result = await cleanUpForecastCosts([SUB], 2026, 10, { client: zeroClient().client, sleep: async () => {} });
    expect(result).toEqual({ contracts: 1, zeroed: 0, deleted: 10 });
    expect(deleteAttempts[D(4)]).toBe(1);
  });

  it("UT-ADCLEAN-009 with ADMIN_DELETE_ALREADY_GONE_OK off the same 404 is a failure again", async () => {
    ADMIN_OPT.ADMIN_DELETE_ALREADY_GONE_OK = false;
    fetchAllRows = { zero: [], delete: deleteIds(10) };
    deleteScript = { [D(4)]: [404] };
    const error = await cleanUpForecastCosts([SUB], 2026, 10, { client: zeroClient().client, sleep: async () => {} }).catch((e: unknown) => e) as PartialStepError;
    expect(error).toBeInstanceOf(PartialStepError);
    expect(error.detail).toContain("9 of 10 later-year cost rows were deleted (1 failed");
  });

  it("UT-ADCLEAN-010 both phases fail: the zeroing is reported (the canvas order) and nothing is listed as completed", async () => {
    fetchAllRows = { zero: zeroIds(4), delete: deleteIds(4) };
    deleteScript = { [D(1)]: [403] };
    const z = zeroClient({ [Z(1)]: [403] });
    const error = await cleanUpForecastCosts([SUB], 2026, 10, { client: z.client, sleep: async () => {} }).catch((e: unknown) => e) as PartialStepError;
    expect(error.failedStep).toBe("Future-month costs set to 0 (4 rows)");
    expect(error.completed).toEqual([]);
    expect(error.detail).toContain("3 of 4 future-month cost rows were set to 0");
    expect(error.detail).toContain("later-year costs: 3 of 4 rows were deleted");
  });

  it("UT-ADCLEAN-011 a status-less (network) failure on a zero row is retried up to 3 tries", async () => {
    fetchAllRows = { zero: zeroIds(3), delete: [] };
    const attempts: Record<string, number> = {};
    const inner = zeroClient().client();
    const client: RowWriteClient = {
      ...inner,
      updateRecordAsync: async (t, id, r) => {
        attempts[id] = (attempts[id] ?? 0) + 1;
        if (id === Z(2) && attempts[id] < 3) throw new TypeError("Failed to fetch");
        return inner.updateRecordAsync(t, id, r);
      },
    } as RowWriteClient;
    const result = await cleanUpForecastCosts([SUB], 2026, 10, { client: () => client, sleep: async () => {} });
    expect(result.zeroed).toBe(3);
    expect(attempts[Z(2)]).toBe(3);
  });

  it("UT-ADCLEAN-012 CLEANUP_RESILIENT off: no retry, fail-fast pools, the old in-step detail", async () => {
    ADMIN_OPT.CLEANUP_RESILIENT = false;
    fetchAllRows = { zero: zeroIds(2), delete: deleteIds(3) };
    deleteScript = { [D(2)]: [429, 429] };
    const error = await cleanUpForecastCosts([SUB], 2026, 10, { client: zeroClient().client }).catch((e: unknown) => e) as PartialStepError;
    expect(error).toBeInstanceOf(PartialStepError);
    expect(deleteAttempts[D(2)]).toBe(1);
    expect(error.failedStep).toBe("Later-year costs deleted (3 rows)");
    expect(error.detail).toMatch(/^\d of 3 later-year cost rows were deleted$/);
  });

  it("UT-ADCLEAN-013 peak in flight: at most 8 zero PATCHes and 16 deletes at once", async () => {
    fetchAllRows = { zero: zeroIds(60), delete: deleteIds(80) };
    const z = zeroClient();
    await cleanUpForecastCosts([SUB], 2026, 10, { client: z.client, sleep: async () => {} });
    expect(z.peak()).toBeLessThanOrEqual(8);
    expect(z.peak()).toBeGreaterThan(1);
  });
});

describe("Admin deletes treat 'already gone' as done (AD-05)", () => {
  it("UT-ADCLEAN-014 deleting a subaccount or an account that another admin already removed resolves", async () => {
    deleteScript = { [SUB]: [404], [G(4)]: [404] };
    await expect(deleteCapexSubaccount(SUB)).resolves.toBeUndefined();
    await expect(deleteCapexAccount(G(4))).resolves.toBeUndefined();
  });

  it("UT-ADCLEAN-015 a 403 still fails the delete", async () => {
    deleteScript = { [SUB]: [403] };
    await expect(deleteCapexSubaccount(SUB)).rejects.toMatchObject({ status: 403 });
  });

});

describe("Gated contract checks (AD-03)", () => {
  it("UT-ADCLEAN-016 40 checks started together never have more than the pool width in flight, and every id is answered", async () => {
    pageDelayMs = 3;
    const answers = await Promise.all(Array.from({ length: 40 }, (_, i) => hasContractsPooled(G(i + 1))));
    expect(answers).toEqual(Array.from({ length: 40 }, () => false));
    expect(pageCalls).toBe(40);
    expect(pagePeak).toBeLessThanOrEqual(6);
    expect(pagePeak).toBeGreaterThan(1);
  });

  it("UT-ADCLEAN-017 a failed check rejects only its own id and frees its slot", async () => {
    pageDelayMs = 1;
    pageFails = new Set([2, 9]);
    const settled = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => hasContractsPooled(G(i + 1))));
    expect(settled.filter((s) => s.status === "rejected")).toHaveLength(2);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(10);
  });

  it("UT-ADCLEAN-018 with ADMIN_HAS_CONTRACTS_POOL off every check starts at once, as before", async () => {
    ADMIN_OPT.ADMIN_HAS_CONTRACTS_POOL = false;
    pageDelayMs = 3;
    await Promise.all(Array.from({ length: 40 }, (_, i) => hasContractsPooled(G(i + 1))));
    expect(pagePeak).toBe(40);
  });
});
