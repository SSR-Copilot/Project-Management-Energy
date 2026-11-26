/**
 * UT-LLDVOPT-001..014 — Land Lease write executor, dvopt tasks T-01 (CB-01 upsert guard), T-03 (CB-03 gone-as-done deletes), T-09 part
 * (CB-14 stable header id) and T-02's fresh standard-contract read (CB-02).
 *
 * The REAL `client.ts`, `costUpdateGuard.ts` and `stableCreateId.ts` run here against a mocked SDK client and mocked generated services;
 * `landLease.writes.test.ts` is the OPT-10 differential and keeps these three switched off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  /** `table|id` of every row that exists on the server (lower case). */
  present: new Set<string>(),
  reads: [] as { table: string; select: string[]; filter: string }[],
  deletes: [] as string[],
  /** `table|id` -> the status a delete answers with (default: success). */
  deleteStatus: new Map<string, number>(),
  readFails: false,
  calls: [] as { op: "create" | "update"; table: string; id?: string; payload: Record<string, unknown> }[],
  /** The next create of a table answers `success: false` this many times. */
  failCreates: new Map<string, number>(),
  getAllOptions: [] as Record<string, unknown>[],
  getAllRows: [] as Record<string, unknown>[],
  nextId: 0,
}));

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: async (table: string, options: { select: string[]; filter: string }) => {
      sdk.reads.push({ table, select: options.select, filter: options.filter });
      if (sdk.readFails) return { success: false, data: [], error: { message: "denied", status: 403 } };
      const pk = options.select[0]!;
      const rows = [...sdk.present]
        .filter((key) => key.startsWith(`${table}|`) && options.filter.toLowerCase().includes(key.split("|")[1]!))
        .map((key) => ({ [pk]: key.split("|")[1] }));
      return { success: true, data: rows };
    },
    deleteRecordAsync: async (table: string, id: string) => {
      sdk.deletes.push(`${table}|${id}`);
      const status = sdk.deleteStatus.get(`${table}|${id}`);
      if (status !== undefined) return { success: false, error: { message: `HTTP ${status}`, status } };
      return { success: true, data: undefined };
    },
  }),
}));

function service(table: string, idColumn: string) {
  return {
    getAll: async (options: Record<string, unknown>) => {
      sdk.getAllOptions.push(options);
      return { success: true, data: sdk.getAllRows };
    },
    create: async (payload: Record<string, unknown>) => {
      const left = sdk.failCreates.get(table) ?? 0;
      sdk.calls.push({ op: "create", table, payload });
      if (left > 0) {
        sdk.failCreates.set(table, left - 1);
        return { success: false, error: new Error(`${table} create timed out`) };
      }
      const id = typeof payload[idColumn] === "string" ? (payload[idColumn] as string) : `server-${table}-${(sdk.nextId += 1)}`;
      sdk.present.add(`${tableSet[table]}|${id.toLowerCase()}`);
      return { success: true, data: { [idColumn]: id } };
    },
    update: async (id: string, payload: Record<string, unknown>) => {
      sdk.calls.push({ op: "update", table, id, payload });
      return { success: true, data: {} };
    },
    delete: async () => ({ success: true, data: undefined }),
  };
}
const tableSet: Record<string, string> = {
  cost: "vsb_landleaseprojectcosts", period: "vsb_landleaseperiods", alloc: "vsb_landleaseallocationwtgs",
};
vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({
  Vsb_landleaseprojectcostsService: service("cost", "vsb_landleaseprojectcostid"),
}));
vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({
  Vsb_landleaseperiodsService: service("period", "vsb_landleaseperiodid"),
}));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({
  Vsb_landleaseallocationwtgsService: service("alloc", "vsb_landleaseallocationwtgid"),
}));
// STABLE_CREATE_IDS ships OFF at integration (CB-14, owner decision). The tests of the feature switch it ON for their own duration
// (`stableIds.on = true`); the file's beforeEach puts it back OFF.
const stableIds = vi.hoisted(() => ({ on: false }));
vi.mock("./leaseOpexFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./leaseOpexFlags")>()),
  get STABLE_CREATE_IDS() { return stableIds.on; },
  COST_WRITES_POLICY: false, // a refused write fails at once here; the policy has its own tests (UT-COSTPOLICY-*)
}));
import { DataError, RECORD_GONE_TEXT, RecordGoneError } from "@/platform/errors";
import { resetStableCreateIds } from "./stableCreateId";
import type { LeaseWrite } from "@/features/cost/periods/landLeaseRules";
import { LEASE_ENTITY_SET as ES, LeaseStepsError } from "@/features/cost/periods/landLeaseRules";

const { applyLeaseWrites, guardLeaseUpdates, loadStandardLeaseContracts } = await import("./landLease");

const guid = (n: number) => `bbbbbbbb-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PROJECT = guid(900);
const SUBACCOUNT = guid(901);
const COST = guid(1);
const PERIOD = guid(2);
const A1 = guid(3);
const A2 = guid(4);
const A3 = guid(5);

const seed = (...rows: [string, string][]) => rows.forEach(([set, id]) => sdk.present.add(`${set}|${id}`));
const seedAll = () => seed([ES.cost, COST], [ES.period, PERIOD], [ES.allocation, A1], [ES.allocation, A2], [ES.allocation, A3]);

/** A Period-1 edit shaped like the real plan: header, three allocation re-writes, the period. */
const editPlan = (): LeaseWrite[] => [
  { op: "update", entitySet: ES.cost, id: COST, payload: { vsb_name: "c" } },
  { op: "update", entitySet: ES.allocation, id: A1, payload: { n: 1 } },
  { op: "update", entitySet: ES.allocation, id: A2, payload: { n: 2 } },
  { op: "update", entitySet: ES.allocation, id: A3, payload: { n: 3 } },
  { op: "update", entitySet: ES.period, id: PERIOD, payload: { vsb_fixedcosts: 5 } },
];

/** A new contract: a header, an allocation and a period bound to it. */
const createPlan = (): LeaseWrite[] => [
  { op: "create", entitySet: ES.cost, ref: "cost", payload: { vsb_name: "New contract", "vsb_Project@odata.bind": `/vsb_projects(${PROJECT})` } },
  { op: "create", entitySet: ES.allocation, parentRef: "cost", payload: { n: 1 } },
  { op: "create", entitySet: ES.period, parentRef: "cost", payload: { vsb_fixedcosts: 1 } },
];

const deletePlan = (): LeaseWrite[] => [
  { op: "delete", entitySet: ES.allocation, id: A1 },
  { op: "delete", entitySet: ES.allocation, id: A2 },
  { op: "delete", entitySet: ES.period, id: PERIOD },
  { op: "delete", entitySet: ES.cost, id: COST },
];

beforeEach(() => {
  stableIds.on = false;
  sdk.present.clear();
  sdk.reads.length = 0;
  sdk.deletes.length = 0;
  sdk.deleteStatus.clear();
  sdk.readFails = false;
  sdk.calls.length = 0;
  sdk.failCreates.clear();
  sdk.getAllOptions.length = 0;
  sdk.getAllRows = [];
  sdk.nextId = 0;
  resetStableCreateIds();
});

/* ══════════════════════════════════════════════════════════════ CB-01 the upsert guard ══ */

describe("guard (CB-01)", () => {
  it("UT-LLDVOPT-001 an edit plan makes ONE key-only read per table, before any write, and then writes in the plan's order", async () => {
    seedAll();
    await applyLeaseWrites(editPlan());
    expect(sdk.reads.map((r) => r.table).sort()).toEqual([ES.allocation, ES.cost, ES.period].sort());
    expect(sdk.reads.every((r) => r.select.length === 1)).toBe(true);
    expect(sdk.calls.map((c) => `${c.op}:${c.table}`)).toEqual([
      "update:cost", "update:alloc", "update:alloc", "update:alloc", "update:period",
    ]);
  });

  it("UT-LLDVOPT-002 an allocation another user deleted refuses the whole plan: RecordGoneError, NOTHING written", async () => {
    seedAll();
    sdk.present.delete(`${ES.allocation}|${A2}`);
    const error = await applyLeaseWrites(editPlan()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(sdk.calls).toEqual([]);
  });

  it("UT-LLDVOPT-003 QA-08 independentSteps: a deleted header fails the CONTRACT step only (the gone text); the allocation and period steps still save", async () => {
    seedAll();
    sdk.present.delete(`${ES.cost}|${COST}`);
    const error = await applyLeaseWrites(editPlan(), { independentSteps: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LeaseStepsError);
    expect((error as LeaseStepsError).failures.map((f) => [f.step, f.message])).toEqual([["contract", RECORD_GONE_TEXT]]);
    expect(sdk.calls.map((c) => `${c.op}:${c.table}`)).toEqual(["update:alloc", "update:alloc", "update:alloc", "update:period"]);
  });

  it("UT-LLDVOPT-003b QA-08 independentSteps: an allocation another user deleted fails the ALLOCATION step only; the contract and period still save", async () => {
    seedAll();
    sdk.present.delete(`${ES.allocation}|${A2}`);
    const error = await applyLeaseWrites(editPlan(), { independentSteps: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LeaseStepsError);
    expect((error as LeaseStepsError).failures.map((f) => [f.step, f.message])).toEqual([["allocation", RECORD_GONE_TEXT]]);
    // the contract and the period were written; NOTHING of the allocation step was (not even the allocations that still exist)
    expect(sdk.calls.map((c) => `${c.op}:${c.table}`)).toEqual(["update:cost", "update:period"]);
    // one existence read per table, still key only
    expect(sdk.reads.map((r) => r.table).sort()).toEqual([ES.allocation, ES.cost, ES.period].sort());
  });

  it("UT-LLDVOPT-003c QA-08 independentSteps: a failed existence read of one table fails that step with the read error, the other steps still save", async () => {
    seedAll();
    sdk.readFails = true;
    const error = await applyLeaseWrites(editPlan(), { independentSteps: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LeaseStepsError);
    expect((error as LeaseStepsError).failures.map((f) => f.step)).toEqual(["contract", "allocation", "period"]);
    expect(sdk.calls).toEqual([]);
  });

  it("UT-LLDVOPT-003d QA-08 a plan that is NOT independentSteps keeps the whole-plan refusal: RecordGoneError, nothing written, no per-step errors", async () => {
    seedAll();
    sdk.present.delete(`${ES.allocation}|${A2}`);
    const whole = await applyLeaseWrites(editPlan()).catch((e: unknown) => e);
    expect(whole).toBeInstanceOf(RecordGoneError);
    expect(whole).not.toBeInstanceOf(LeaseStepsError);
    expect(sdk.calls).toEqual([]);
  });

  it("UT-LLDVOPT-004 a plan that only creates reads nothing (rows created in the plan are never checked)", async () => {
    await applyLeaseWrites(createPlan());
    expect(sdk.reads).toEqual([]);
    expect(sdk.calls.map((c) => c.op)).toEqual(["create", "create", "create"]);
  });

  it("UT-LLDVOPT-005 a failed existence read refuses the plan with a DataError (never read as 'gone'), nothing written", async () => {
    seedAll();
    sdk.readFails = true;
    const error = await applyLeaseWrites(editPlan()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).not.toBeInstanceOf(RecordGoneError);
    expect(sdk.calls).toEqual([]);
  });

  it("UT-LLDVOPT-006 differential: with every row present the writes equal those of the old, unguarded executor (flags off)", async () => {
    seedAll();
    await applyLeaseWrites(editPlan());
    const guarded = sdk.calls.map((c) => ({ ...c }));
    sdk.calls.length = 0;
    sdk.reads.length = 0;
    vi.resetModules();
    vi.doMock("./leaseOpexFlags", () => ({
      GONE_AS_DONE_LEASE_OPEX: false, LEASE_GUARD: false, OPEX_GUARD: false, COST_REFRESH_ON_FAILURE: false, STABLE_CREATE_IDS: false,
      // dvopt batch 2: every batch-2 switch off, so this run is the old code.
      LEASE_TIER_WIDER: false, LEASE_LEAN_RELOAD: false, COST_WRITES_POLICY: false, OPEX_WRITES_TOGETHER: false, OPEX_BOOK_REUSES_CATALOGUE: false,
      CONTRACT_LINKS_WITH_PATCH: false, CONTRACT_KEYS_ONCE: false, BOP_ASSUMPTIONS_ONE_READ: false, COST_READS_RETRY: false,
    }));
    const legacy = await import("./landLease");
    await legacy.applyLeaseWrites(editPlan());
    vi.doUnmock("./leaseOpexFlags");
    vi.resetModules();
    expect(sdk.reads).toEqual([]);
    expect(sdk.calls).toEqual(guarded);
  });

  it("UT-LLDVOPT-007 LEASE_GUARD off sends the unguarded update (the rollback), and guardLeaseUpdates(…, false) reads nothing", async () => {
    await guardLeaseUpdates(editPlan(), false);
    expect(sdk.reads).toEqual([]);
    await expect(guardLeaseUpdates(editPlan(), true)).rejects.toBeInstanceOf(RecordGoneError);
  });
});

/* ══════════════════════════════════════════════════════════ CB-03 gone-as-done deletes ══ */

describe("deletes (CB-03)", () => {
  it("UT-LLDVOPT-008 a 404 on the 2nd allocation still sends the period and the header: the delete finishes", async () => {
    sdk.deleteStatus.set(`${ES.allocation}|${A2}`, 404);
    await applyLeaseWrites(deletePlan());
    expect(sdk.deletes).toEqual([
      `${ES.allocation}|${A1}`, `${ES.allocation}|${A2}`, `${ES.period}|${PERIOD}`, `${ES.cost}|${COST}`,
    ]);
  });

  it("UT-LLDVOPT-009 any other refusal (403) still stops the plan: nothing after the failed tier is sent", async () => {
    sdk.deleteStatus.set(`${ES.allocation}|${A1}`, 403);
    await expect(applyLeaseWrites(deletePlan())).rejects.toBeInstanceOf(DataError);
    expect(sdk.deletes).not.toContain(`${ES.cost}|${COST}`);
    expect(sdk.deletes).not.toContain(`${ES.period}|${PERIOD}`);
  });

  it("UT-LLDVOPT-010 GONE_AS_DONE_LEASE_OPEX off: a 404 fails the plan at that request, as before", async () => {
    sdk.deleteStatus.set(`${ES.period}|${PERIOD}`, 404);
    vi.resetModules();
    vi.doMock("./leaseOpexFlags", () => ({
      GONE_AS_DONE_LEASE_OPEX: false, LEASE_GUARD: true, OPEX_GUARD: true, COST_REFRESH_ON_FAILURE: true, STABLE_CREATE_IDS: true,
      // dvopt batch 2: every batch-2 switch off, so this run is the old code.
      LEASE_TIER_WIDER: false, LEASE_LEAN_RELOAD: false, COST_WRITES_POLICY: false, OPEX_WRITES_TOGETHER: false, OPEX_BOOK_REUSES_CATALOGUE: false,
      CONTRACT_LINKS_WITH_PATCH: false, CONTRACT_KEYS_ONCE: false, BOP_ASSUMPTIONS_ONE_READ: false, COST_READS_RETRY: false,
    }));
    const legacy = await import("./landLease");
    // (a fresh module graph: the error class is a different instance, so it is read by name, not by instanceof)
    await expect(legacy.applyLeaseWrites(deletePlan())).rejects.toMatchObject({ name: "DataError", status: 404 });
    vi.doUnmock("./leaseOpexFlags");
    vi.resetModules();
    expect(sdk.deletes).not.toContain(`${ES.cost}|${COST}`);
  });
});

/* ════════════════════════════════════════════════════════ CB-14 the header's stable id ══ */

describe("header create (CB-14)", () => {
  it("UT-LLDVOPT-011 the header create carries a client id and the children bind to it", async () => {
    stableIds.on = true;
    const { createdIds } = await applyLeaseWrites(createPlan());
    const header = sdk.calls.find((c) => c.table === "cost")!;
    expect(header.payload.vsb_landleaseprojectcostid).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdIds.cost).toBe(header.payload.vsb_landleaseprojectcostid);
    const child = sdk.calls.find((c) => c.table === "alloc")!;
    expect(JSON.stringify(child.payload)).toContain(String(createdIds.cost));
    // Allocations and periods are NOT given a client id (only the header is).
    expect(child.payload).not.toHaveProperty("vsb_landleaseallocationwtgid");
  });

  it("UT-LLDVOPT-012 a header create that failed and is retried sends the SAME id, once the read-back finds nothing", async () => {
    stableIds.on = true;
    sdk.failCreates.set("cost", 1);
    await expect(applyLeaseWrites(createPlan())).rejects.toBeInstanceOf(DataError);
    const first = sdk.calls.find((c) => c.table === "cost")!.payload.vsb_landleaseprojectcostid;
    sdk.calls.length = 0;
    await applyLeaseWrites(createPlan());
    const headers = sdk.calls.filter((c) => c.table === "cost");
    expect(headers).toHaveLength(1);
    expect(headers[0]!.payload.vsb_landleaseprojectcostid).toBe(first);
    expect(sdk.calls.map((c) => c.table)).toEqual(["cost", "alloc", "period"]);
  });

  it("UT-LLDVOPT-013 when the earlier POST landed but looked failed, the retry creates NO second header and still writes the children", async () => {
    stableIds.on = true;
    sdk.failCreates.set("cost", 1);
    await expect(applyLeaseWrites(createPlan())).rejects.toBeInstanceOf(DataError);
    const landedId = String(sdk.calls.find((c) => c.table === "cost")!.payload.vsb_landleaseprojectcostid);
    // The POST had landed after all: the row is on the server.
    seed([ES.cost, landedId.toLowerCase()]);
    sdk.calls.length = 0;
    const { createdIds } = await applyLeaseWrites(createPlan());
    expect(sdk.calls.filter((c) => c.table === "cost")).toEqual([]);
    expect(createdIds.cost).toBe(landedId.toLowerCase());
    const child = sdk.calls.find((c) => c.table === "alloc")!;
    expect(JSON.stringify(child.payload)).toContain(landedId.toLowerCase());
    expect(sdk.calls.map((c) => c.table)).toEqual(["alloc", "period"]);
  });
});

/* ══════════════════════════════════════════════════ CB-02 the fresh standard-contract read ══ */

describe("standard contract check (CB-02)", () => {
  it("UT-LLDVOPT-014 loadStandardLeaseContracts reads key columns only, scoped to project + sub-account + standard + active", async () => {
    sdk.getAllRows = [{ vsb_landleaseprojectcostid: COST, _vsb_subaccount_value: SUBACCOUNT, vsb_isstandardcontract: true }];
    const rows = await loadStandardLeaseContracts(PROJECT, SUBACCOUNT);
    expect(rows).toEqual([{ id: COST, subaccountId: SUBACCOUNT, isStandardContract: true }]);
    const options = sdk.getAllOptions[0]!;
    expect(options.select).toEqual(["vsb_landleaseprojectcostid", "_vsb_subaccount_value", "vsb_isstandardcontract"]);
    const filter = String(options.filter);
    expect(filter).toContain(PROJECT);
    expect(filter).toContain(SUBACCOUNT);
    expect(filter).toContain("vsb_isstandardcontract eq true");
    expect(filter).toContain("statecode eq 0");
  });
});
