/**
 * `executeSavePlan` — execution graph, request counts and total reconciliation, against fake
 * deps: an in-memory Dataverse that applies upserts and deletes (with the contract → cost
 * cascade), plus a call log. No SDK, no executor, no planner. UT-ACBULK-031+ use a GATED fake
 * whose every call waits on a deferred the test settles, to prove what runs concurrently.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CAPEX_CONTRACTS, CAPEX_COSTS, RowsGoneError, SavePlanError, executeSavePlan, type SavePlanDeps,
} from "./addCostSheetBulk";
import type { BulkTableInfo, SaveBuildPlan, UpsertTarget } from "./bulkTypes";
import { BulkValidationError } from "./bulkWrites";
import { OWNING_BU_BIND } from "./odata";
import type { ExistingCost } from "@/features/cost/add-costs-from-table/rules";

/* ═══════════════════════════════════════════════════════════════════ the fake ══ */

interface Call {
  kind: "upsert" | "delete" | "load"; table?: string; label?: string; ids: string[];
  fields?: unknown[]; isNew?: boolean[];
}

interface FakeOptions {
  /** Fail the upsert into this table after committing `afterChunks` chunks of `chunkSize`. */
  failUpsert?: { table: BulkTableInfo; chunkSize: number; afterChunks: number; reportCounts?: boolean };
  /** Fail the reconcile upsert (label "reconcile totals"). */
  failReconcile?: boolean;
  /** Fail the reconcile read. */
  failLoad?: boolean;
  /** Ids a `deleteMany` refuses; the rest are deleted. */
  refuseDelete?: ReadonlySet<string>;
  /** The upsert into this table throws a `BulkValidationError` (nothing sent). */
  invalidUpsert?: BulkTableInfo;
  /** The existence read fails. */
  failVerify?: boolean;
  /**
   * `UpdateMultiple` semantics: an upsert whose `isNew: false` row is missing is refused whole,
   * nothing committed (one all-or-nothing chunk). Without it the fake upserts like PATCH.
   */
  strictUpdates?: boolean;
}

/** One phase-0 existence read: the table and the ids asked about. */
interface VerifyCall { table: string; ids: string[] }

class FakeChunkError extends Error {
  readonly chunksCommitted: number;
  readonly rowsCommitted: number;
  constructor(chunksCommitted: number, rowsCommitted: number) {
    super("chunk failed");
    this.chunksCommitted = chunksCommitted;
    this.rowsCommitted = rowsCommitted;
  }
}

function fakeDataverse(
  seed: { contracts: Record<string, number>; costs: ExistingCost[] },
  options: FakeOptions = {},
) {
  const contracts = new Map(Object.entries(seed.contracts));
  const costs = new Map(seed.costs.map((c) => [c.id, { ...c }]));
  const calls: Call[] = [];
  /** Phase-0 reads, kept apart from `calls` so the write-order assertions stay as they were. */
  const verifies: VerifyCall[] = [];
  /** Every call of any kind, in order: `verify:<table>`, `upsert:<table>`, `delete:<table>`, `load`. */
  const timeline: string[] = [];

  const apply = (table: BulkTableInfo, row: UpsertTarget) => {
    if (table === CAPEX_CONTRACTS) {
      contracts.set(row.id, Number(row.fields.vsb_totalcost ?? contracts.get(row.id) ?? 0));
    } else {
      const prev = costs.get(row.id);
      costs.set(row.id, {
        id: row.id,
        contractId: String(row.fields.contractId ?? prev?.contractId),
        year: 2026, month: 1,
        cost: (row.fields.vsb_cost as number | null | undefined) ?? prev?.cost ?? null,
      });
    }
  };

  const deps: SavePlanDeps = {
    async upsert(table, rows, label) {
      calls.push({
        kind: "upsert", table: table.entitySetName, label, ids: rows.map((r) => r.id),
        fields: rows.map((r) => r.fields), isNew: rows.map((r) => r.isNew),
      });
      timeline.push(`upsert:${table.entitySetName}`);
      if (label === "reconcile totals" && options.failReconcile) throw new Error("reconcile refused");
      if (options.invalidUpsert === table && label !== "reconcile totals") {
        throw new BulkValidationError(label, table.entitySetName, "duplicate id");
      }
      if (options.strictUpdates) {
        const store: ReadonlyMap<string, unknown> = table === CAPEX_CONTRACTS ? contracts : costs;
        if (rows.some((r) => !r.isNew && !store.has(r.id))) throw new FakeChunkError(0, 0);
      }
      const fail = options.failUpsert;
      if (fail && fail.table === table && label !== "reconcile totals") {
        const committed = rows.slice(0, fail.chunkSize * fail.afterChunks);
        committed.forEach((r) => apply(table, r));
        if (fail.reportCounts === false) throw new Error("opaque failure");
        throw new FakeChunkError(fail.afterChunks, committed.length);
      }
      rows.forEach((r) => apply(table, r));
      return { requests: Math.max(1, Math.ceil(rows.length / 2)) };
    },
    async deleteMany(table, ids, label) {
      calls.push({ kind: "delete", table: table.entitySetName, label, ids: [...ids] });
      timeline.push(`delete:${table.entitySetName}`);
      const failed: string[] = [];
      for (const id of ids) {
        if (options.refuseDelete?.has(id)) { failed.push(id); continue; }
        if (table === CAPEX_CONTRACTS) {
          contracts.delete(id);
          for (const [costId, c] of costs) if (c.contractId === id) costs.delete(costId); // cascade
        } else costs.delete(id);
      }
      if (failed.length > 0) throw Object.assign(new Error("delete refused"), { failedIds: failed, deletedCount: ids.length - failed.length });
      return { requests: ids.length };
    },
    async loadCosts(contractIds) {
      calls.push({ kind: "load", ids: [...contractIds] });
      timeline.push("load");
      if (options.failLoad) throw new Error("read failed");
      return [...costs.values()].filter((c) => contractIds.includes(c.contractId)).map((c) => ({ ...c }));
    },
    async existingIds(table, ids) {
      verifies.push({ table: table.entitySetName, ids: [...ids] });
      timeline.push(`verify:${table.entitySetName}`);
      if (options.failVerify) throw new Error("verify read failed");
      const store: ReadonlyMap<string, unknown> = table === CAPEX_CONTRACTS ? contracts : costs;
      // Answers in UPPER case: the orchestrator must match case-insensitively.
      return new Set(ids.filter((id) => store.has(id)).map((id) => id.toUpperCase()));
    },
  };

  const sumOf = (contractId: string) =>
    [...costs.values()].filter((c) => c.contractId === contractId).reduce((a, c) => a + (c.cost ?? 0), 0);
  return { deps, calls, verifies, timeline, contracts, costs, sumOf };
}

/* ═════════════════════════════════════════════════════════════════ gated fake ══ */

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Lets every queued microtask and timer callback run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Every call records its name in `started` and waits until the test settles it by name:
 * `verify:contracts`, `verify:costs`, `contracts`, `costs:<ids>`, `costDeletes`,
 * `contractDeletes`, `load`, `reconcile`.
 */
function gatedDeps() {
  const started: string[] = [];
  const gates = new Map<string, Deferred<unknown>>();
  const settled: string[] = [];
  const gate = <T>(name: string): Promise<T> => {
    started.push(name);
    const d = deferred<unknown>();
    gates.set(name, d);
    return d.promise.finally(() => settled.push(name)) as Promise<T>;
  };
  const table = (t: BulkTableInfo) => (t === CAPEX_CONTRACTS ? "contracts" : "costs");
  const deps: SavePlanDeps = {
    upsert: (t, rows, label) => gate(label === "reconcile totals" ? "reconcile"
      : t === CAPEX_CONTRACTS ? "contracts" : `costs:${rows.map((r) => r.id).join(",")}`),
    deleteMany: (t) => gate(t === CAPEX_CONTRACTS ? "contractDeletes" : "costDeletes"),
    loadCosts: () => gate("load"),
    existingIds: (t) => gate(`verify:${table(t)}`),
  };
  const of = (name: string) => {
    const d = gates.get(name);
    if (!d) throw new Error(`${name} has not started; started: ${started.join(" | ")}`);
    return d;
  };
  return {
    deps, started, settled,
    resolve: (name: string, value: unknown) => of(name).resolve(value),
    reject: (name: string, error: unknown) => of(name).reject(error),
  };
}

/* ═══════════════════════════════════════════════════════════════════ fixtures ══ */

const STATS: SaveBuildPlan["stats"] = {
  contractsCreated: 1, contractsUpdated: 1, costsCreated: 2, costsUpdated: 1,
  costsDeleted: 1, contractsDeleted: 1, noOpCells: 3,
};

const cost = (id: string, contractId: string, value: number | null): ExistingCost =>
  ({ id, contractId, year: 2026, month: 1, cost: value });

/** A NEW cost row carries its contract bind, as the planner writes it; an update does not. */
const costRow = (id: string, contractId: string, value: number, isNew = true): UpsertTarget =>
  ({
    id, isNew,
    fields: isNew
      ? { contractId, vsb_cost: value, "vsb_Contract@odata.bind": `/${CAPEX_CONTRACTS.entitySetName}(${contractId})` }
      : { contractId, vsb_cost: value },
  });

const contractRow = (id: string, total: number, isNew = false): UpsertTarget =>
  ({ id, isNew, fields: { vsb_totalcost: total } });

/**
 * Store before: c-1 (old 100, costs k-1 = 100), c-2 (old 50, k-2 = 50, k-3 = 0), c-gone (k-9).
 * The plan: c-1's k-1 → 300; new c-new gets k-new = 70; delete k-2 from c-2 (keeps k-3 = 0);
 * delete c-gone. Final totals: c-1 300, c-new 70, c-2 0.
 * Stage A: (4) c-gone, (1) c-1/c-new/c-2, (2a) k-1, (3) k-2. Stage B: (2b) k-new.
 */
function seed() {
  return {
    contracts: { "c-1": 100, "c-2": 50, "c-gone": 9 },
    costs: [cost("k-1", "c-1", 100), cost("k-2", "c-2", 50), cost("k-3", "c-2", 0), cost("k-9", "c-gone", 9)],
  };
}

function typicalPlan(over: Partial<SaveBuildPlan> = {}): SaveBuildPlan {
  return {
    contractUpserts: [contractRow("c-1", 300), contractRow("c-new", 70, true), contractRow("c-2", 0)],
    costUpserts: [costRow("k-1", "c-1", 300, false), costRow("k-new", "c-new", 70)],
    costDeletes: ["k-2"],
    costDeletesIfExist: [],
    contractDeletes: ["c-gone"],
    totals: new Map([["c-1", 300], ["c-new", 70], ["c-2", 0]]),
    stats: STATS,
    ...over,
  };
}

/** The typical plan without its new contract: stage B is empty. */
const noNewContractPlan = (over: Partial<SaveBuildPlan> = {}) => typicalPlan({
  contractUpserts: [contractRow("c-1", 300), contractRow("c-2", 0)],
  costUpserts: [costRow("k-1", "c-1", 300, false)],
  totals: new Map([["c-1", 300], ["c-2", 0]]),
  ...over,
});

/** Only contract upserts: (1) is the one operation, so nothing overlaps it. */
const contractsOnlyPlan = () => typicalPlan({ costUpserts: [], costDeletes: [], contractDeletes: [] });

async function caught(p: Promise<unknown>): Promise<SavePlanError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(SavePlanError);
    return e as SavePlanError;
  }
  throw new Error("expected executeSavePlan to throw");
}

const writes = (calls: Call[]) => calls.filter((c) => c.kind !== "load");

/* ══════════════════════════════════════════════════════════════════ happy path ══ */

describe("executeSavePlan — order and call counts", () => {
  it("UT-ACBULK-001 a typical plan makes exactly 5 calls: the deletes (contract deletes first), the upserts, then stage B", async () => {
    // Changed (§11.12): both deletes start at t = 0, before the verify read answers, so the cost
    // delete now comes before the upserts instead of after (2a).
    const fake = fakeDataverse(seed());
    await executeSavePlan(typicalPlan(), fake.deps);
    expect(fake.calls.map((c) => [c.kind, c.table, c.ids])).toEqual([
      ["delete", CAPEX_CONTRACTS.entitySetName, ["c-gone"]],
      ["delete", CAPEX_COSTS.entitySetName, ["k-2"]],
      ["upsert", CAPEX_CONTRACTS.entitySetName, ["c-1", "c-new", "c-2"]],
      ["upsert", CAPEX_COSTS.entitySetName, ["k-1"]],
      ["upsert", CAPEX_COSTS.entitySetName, ["k-new"]],
    ]);
    expect(fake.contracts).toEqual(new Map([["c-1", 300], ["c-2", 0], ["c-new", 70]]));
    expect(fake.sumOf("c-1")).toBe(300);
    expect(fake.costs.has("k-9")).toBe(false); // cascade, not a phase-3 delete
  });

  it("UT-ACBULK-002 empty phases make no call", async () => {
    const fake = fakeDataverse(seed());
    await executeSavePlan(typicalPlan({ costDeletes: [], contractDeletes: [] }), fake.deps);
    expect(fake.calls.map((c) => c.kind)).toEqual(["upsert", "upsert", "upsert"]);
    const fakeNoNew = fakeDataverse(seed());
    await executeSavePlan(noNewContractPlan({ costDeletes: [], contractDeletes: [] }), fakeNoNew.deps);
    expect(fakeNoNew.calls.map((c) => c.kind)).toEqual(["upsert", "upsert"]);
  });

  it("UT-ACBULK-003 a deletes-only plan runs only phases 3 and 4", async () => {
    const fake = fakeDataverse(seed());
    const result = await executeSavePlan(
      typicalPlan({ contractUpserts: [], costUpserts: [], totals: new Map() }), fake.deps,
    );
    expect(fake.calls.map((c) => [c.kind, c.table])).toEqual([
      ["delete", CAPEX_CONTRACTS.entitySetName],
      ["delete", CAPEX_COSTS.entitySetName],
    ]);
    expect(result.requests).toMatchObject({ contracts: 0, costs: 0, costDeletes: 1, contractDeletes: 1 });
  });

  it("UT-ACBULK-004 requests.total is the sum of the per-phase counts, and stats pass through", async () => {
    const fake = fakeDataverse(seed());
    const { requests, stats } = await executeSavePlan(typicalPlan(), fake.deps);
    // costs: (2a) k-1 = 1 request + (2b) k-new = 1 request.
    expect(requests).toEqual({
      verify: 2, contracts: 2, costs: 2, costDeletes: 1, contractDeletes: 1, reconcile: 0, total: 8,
    });
    expect(requests.total).toBe(
      requests.verify + requests.contracts + requests.costs + requests.costDeletes
        + requests.contractDeletes + requests.reconcile,
    );
    expect(stats).toBe(STATS);
  });

  it("UT-ACBULK-005 an empty plan makes no call at all", async () => {
    const fake = fakeDataverse(seed());
    const result = await executeSavePlan(
      {
        contractUpserts: [], costUpserts: [], costDeletes: [], costDeletesIfExist: [], contractDeletes: [],
        totals: new Map(), stats: STATS,
      },
      fake.deps,
    );
    expect(fake.calls).toEqual([]);
    expect(fake.verifies).toEqual([]);
    expect(result.requests.total).toBe(0);
  });
});

/* ═════════════════════════════════════════════════════════════ reconciliation ══ */

describe("executeSavePlan — reconciliation", () => {
  it("UT-ACBULK-050 a contract skipped as unchanged is compared, not force-written, by the reconcile", async () => {
    // c-skip has a planned total but no target: its stored 20 already equals the plan (H2).
    const plan = typicalPlan({
      contractUpserts: [contractRow("c-1", 300)],
      costUpserts: [costRow("k-1", "c-1", 300, false)],
      costDeletes: [],
      contractDeletes: [],
      totals: new Map([["c-1", 300], ["c-skip", 20]]),
    });
    const fake = fakeDataverse(
      { contracts: { "c-1": 100, "c-skip": 20 }, costs: [cost("k-1", "c-1", 100), cost("k-s", "c-skip", 20)] },
      { failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 0 } },
    );
    const error = await caught(executeSavePlan(plan, fake.deps));
    expect(error.phase).toBe(1);
    const rewritten = fake.calls.filter((c) => c.label === "reconcile totals").flatMap((c) => c.ids);
    expect(rewritten).toContain("c-1"); // its own row did not land: forced to its actual sum
    expect(rewritten).not.toContain("c-skip"); // actual 20 = planned 20: nothing to write
    expect(fake.contracts.get("c-1")).toBe(fake.sumOf("c-1"));
  });

  it("UT-ACBULK-077 nothing committed (deletes removed 0 rows): no reconcile write, committedBefore false (E6 #1)", async () => {
    // SavePlanError: the cost delete is refused with removedCount 0, the contract delete removed 0.
    // c-2's actual 50 differs from its planned 0, but this save changed no stored total.
    const fake = fakeDataverse(seed());
    const deps: SavePlanDeps = {
      ...fake.deps,
      deleteMany: async (t, ids) => {
        if (t === CAPEX_COSTS) throw Object.assign(new Error("refused"), { deletedCount: 1, removedCount: 0 });
        return { requests: ids.length, removed: 0 };
      },
    };
    const e = await caught(executeSavePlan(typicalPlan({
      contractUpserts: [], costUpserts: [], contractDeletes: ["c-gone"], totals: new Map([["c-2", 0]]),
    }), deps));
    expect(e.requests.reconcile).toBe(0);
    expect(fake.calls.some((c) => c.label === "reconcile totals")).toBe(false);
    expect(fake.contracts.get("c-2")).toBe(50);
    expect(e.committedBefore).toBe(false);

    // RowsGoneError: the deletes beside the check removed nothing; c-2 is not force-written.
    const gone = seed();
    delete (gone.contracts as Record<string, number>)["c-1"];
    const fake2 = fakeDataverse(gone);
    const err = await executeSavePlan(typicalPlan(), {
      ...fake2.deps,
      deleteMany: async (_t, ids) => ({ requests: ids.length, removed: 0 }),
    }).then(() => null, (x: unknown) => x);
    expect(err).toBeInstanceOf(RowsGoneError);
    expect((err as RowsGoneError).requests.reconcile).toBe(0);
    expect((err as RowsGoneError).committedBefore).toBe(false);
    expect((err as RowsGoneError).reconciled).toBe(true);
  });

  it("UT-ACBULK-078 nothing landed and no total differs: committedBefore stays false", async () => {
    const fake = fakeDataverse(
      { contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] },
      { failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 0 } },
    );
    const error = await caught(executeSavePlan(
      typicalPlan({
        contractUpserts: [contractRow("c-1", 100)], costUpserts: [], costDeletes: [], contractDeletes: [],
        totals: new Map([["c-1", 100]]),
      }),
      fake.deps,
    ));
    expect(error.requests.reconcile).toBe(0);
    expect(error.committedBefore).toBe(false);
  });

  it("UT-ACBULK-006 a phase-2 failure leaves every stored total equal to its actual cost sum", async () => {
    // (2a) k-1 (→300) lands and then fails; (2b) k-new is never sent. (3) ran alongside.
    const fake = fakeDataverse(seed(), { failUpsert: { table: CAPEX_COSTS, chunkSize: 1, afterChunks: 1 } });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(2);
    expect(error.reconciled).toBe(true);
    expect(error.cause).toBeInstanceOf(FakeChunkError);
    for (const id of ["c-1", "c-new", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
    expect(fake.contracts.get("c-new")).toBe(0);
    // (3) ran in stage A alongside (2a), so k-2 is gone and c-2's total is the planned 0.
    expect(fake.costs.has("k-2")).toBe(false);
    expect(fake.contracts.get("c-2")).toBe(0);
    expect(fake.calls.some((c) => c.ids.includes("k-new"))).toBe(false);
  });

  it("UT-ACBULK-007 a partial phase-3 failure is reconciled against the deletes that did land", async () => {
    const plan = typicalPlan({ costDeletes: ["k-2", "k-3"], contractDeletes: [] });
    const fake = fakeDataverse(
      { contracts: { "c-1": 100, "c-2": 50 }, costs: [cost("k-1", "c-1", 100), cost("k-2", "c-2", 50), cost("k-3", "c-2", 7)] },
      { refuseDelete: new Set(["k-3"]) },
    );
    const error = await caught(executeSavePlan(plan, fake.deps));
    expect(error.phase).toBe(3);
    expect(error.reconciled).toBe(true);
    expect(fake.costs.has("k-2")).toBe(false);
    expect(fake.contracts.get("c-2")).toBe(7);
    expect(fake.contracts.get("c-2")).toBe(fake.sumOf("c-2"));
    expect(fake.contracts.get("c-1")).toBe(300);
  });

  it("UT-ACBULK-008 a phase-1 failure on the second chunk reconciles what committed and never creates a contract", async () => {
    // Contract chunks of 1: c-1 (300) lands; c-new and c-2 do not. (2a) k-1 and (3) k-2 land
    // alongside, so c-2 (whose own row did not land) must be written its actual sum.
    const fake = fakeDataverse(seed(), { failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 1 } });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(1);
    expect(error.reconciled).toBe(true);
    expect(error.unverifiedContractIds).toEqual([]);
    for (const id of ["c-1", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
    expect(fake.contracts.get("c-1")).toBe(300);
    expect(fake.contracts.get("c-2")).toBe(0);
    expect(fake.contracts.has("c-new")).toBe(false);
    const load = fake.calls.find((c) => c.kind === "load");
    expect(load?.ids).toEqual(["c-1", "c-2"]);
    const reconcile = fake.calls.find((c) => c.label === "reconcile totals");
    expect(reconcile?.ids).toEqual(["c-2"]);
    // Stage B (k-new, bound to the contract that did not land) never ran.
    expect(fake.calls.some((c) => c.ids.includes("k-new"))).toBe(false);
  });

  it("UT-ACBULK-009 a phase-1 failure that committed nothing does not reconcile", async () => {
    const fake = fakeDataverse(seed(), { failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 0 } });
    const error = await caught(executeSavePlan(contractsOnlyPlan(), fake.deps));
    expect(error.phase).toBe(1);
    expect(error.reconciled).toBe(true);
    expect(fake.calls.map((c) => c.kind)).toEqual(["upsert"]);
  });

  it("UT-ACBULK-010 a phase-1 error with no commit counts reconciles conservatively and flags new contracts as unverified", async () => {
    const fake = fakeDataverse(seed(), {
      failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 1, reportCounts: false },
    });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(1);
    expect(error.reconciled).toBe(false);
    expect(error.reconcileError).toBeUndefined();
    expect(error.unverifiedContractIds).toEqual(["c-new"]);
    expect(fake.calls.find((c) => c.kind === "load")?.ids).toEqual(["c-1", "c-2"]);
    // Neither existing contract is known to have landed: both are written their actual sum.
    expect(fake.calls.find((c) => c.label === "reconcile totals")?.ids).toEqual(["c-1", "c-2"]);
    for (const id of ["c-1", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
  });

  it("UT-ACBULK-011 a phase-4 failure makes no reconciliation call", async () => {
    const fake = fakeDataverse(seed(), { refuseDelete: new Set(["c-gone"]) });
    const error = await caught(executeSavePlan(noNewContractPlan(), fake.deps));
    expect(error.phase).toBe(4);
    expect(error.reconciled).toBe(true);
    expect(fake.calls.some((c) => c.kind === "load")).toBe(false);
    expect(fake.calls.some((c) => c.label === "reconcile totals")).toBe(false);
    expect(error.requests).toMatchObject({
      verify: 2, contracts: 1, costs: 1, costDeletes: 1, contractDeletes: 0, reconcile: 0, total: 5,
    });
  });

  it("UT-ACBULK-012 the reconcile upsert sends only the totals that differ, as updates of vsb_totalcost alone", async () => {
    const fake = fakeDataverse(seed(), { refuseDelete: new Set(["k-2"]) });
    const error = await caught(executeSavePlan(noNewContractPlan(), fake.deps));
    expect(error.phase).toBe(3);
    const reconcile = writes(fake.calls).filter((c) => c.label === "reconcile totals");
    expect(reconcile).toHaveLength(1);
    // c-1 (300) landed as planned; only c-2 (planned 0, actual 50) differs.
    expect(reconcile[0]?.table).toBe(CAPEX_CONTRACTS.entitySetName);
    expect(reconcile[0]?.ids).toEqual(["c-2"]);
    expect(reconcile[0]?.fields).toEqual([{ vsb_totalcost: 50 }]);
    expect(reconcile[0]?.isNew).toEqual([false]);
    expect(error.requests.reconcile).toBe(1);
    expect(error.requests.total).toBe(
      error.requests.verify + error.requests.contracts + error.requests.costs + error.requests.costDeletes
        + error.requests.contractDeletes + error.requests.reconcile,
    );
  });

  it("UT-ACBULK-013 no totals differ → no reconcile upsert at all", async () => {
    // Phase 3 refuses k-3, whose cost is 0: every planned total is already the actual one.
    const fake = fakeDataverse(seed(), { refuseDelete: new Set(["k-3"]) });
    const error = await caught(executeSavePlan(noNewContractPlan({ costDeletes: ["k-2", "k-3"] }), fake.deps));
    expect(error.reconciled).toBe(true);
    expect(fake.calls.some((c) => c.kind === "load")).toBe(true);
    expect(fake.calls.some((c) => c.label === "reconcile totals")).toBe(false);
  });

  it("UT-ACBULK-014 a failing reconcile upsert reports reconciled: false and keeps both errors", async () => {
    const fake = fakeDataverse(seed(), {
      failUpsert: { table: CAPEX_COSTS, chunkSize: 1, afterChunks: 1 }, failReconcile: true,
    });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(2);
    expect(error.reconciled).toBe(false);
    expect(error.cause).toBeInstanceOf(FakeChunkError);
    expect((error.reconcileError as Error).message).toBe("reconcile refused");
    expect(error.message).toContain("could NOT be reconciled");
  });

  it("UT-ACBULK-015 a failing reconcile read reports reconciled: false and keeps both errors", async () => {
    const fake = fakeDataverse(seed(), {
      failUpsert: { table: CAPEX_COSTS, chunkSize: 1, afterChunks: 1 }, failLoad: true,
    });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.reconciled).toBe(false);
    expect(error.cause).toBeInstanceOf(FakeChunkError);
    expect((error.reconcileError as Error).message).toBe("read failed");
    expect(fake.calls.some((c) => c.label === "reconcile totals")).toBe(false);
  });

  it("UT-ACBULK-016 deleted contracts are never reconciled, even if a total for one slipped into the plan", async () => {
    const plan = typicalPlan({ totals: new Map([["c-1", 300], ["c-new", 70], ["c-2", 0], ["c-gone", 0]]) });
    const fake = fakeDataverse(seed(), { failUpsert: { table: CAPEX_COSTS, chunkSize: 1, afterChunks: 1 } });
    await caught(executeSavePlan(plan, fake.deps));
    const load = fake.calls.find((c) => c.kind === "load");
    expect(load?.ids).not.toContain("c-gone");
    for (const call of fake.calls.filter((c) => c.label === "reconcile totals")) {
      expect(call.ids).not.toContain("c-gone");
    }
  });

  it("UT-ACBULK-017 a non-Error phase failure is still wrapped, never swallowed", async () => {
    const fake = fakeDataverse(seed());
    const deps: SavePlanDeps = { ...fake.deps, deleteMany: async () => { throw "refused"; } };
    const error = await caught(executeSavePlan(typicalPlan(), deps));
    expect(error.phase).toBe(3);
    expect(error.cause).toBe("refused");
    expect(error.name).toBe("SavePlanError");
    expect(error.failures.map((f) => f.phase)).toEqual([3, 4]);
  });
});

/* ══════════════════════════════════════════════════════════════ phase 0: verify ══ */

async function goneError(p: Promise<unknown>): Promise<RowsGoneError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(RowsGoneError);
    return e as RowsGoneError;
  }
  throw new Error("expected executeSavePlan to throw RowsGoneError");
}

describe("executeSavePlan — phase 0, the pre-write existence check", () => {
  it("UT-ACBULK-018 runs before any upsert, one read per table, for every upsert target (no delete id)", async () => {
    // Changed (§11.12): the deletes no longer wait for verify and are no longer filtered by it
    // (the deleter treats 404 as success), so they come first on the timeline and their ids
    // (c-gone, k-2) are no longer read. Verify still precedes every upsert.
    const fake = fakeDataverse(seed());
    const { requests } = await executeSavePlan(typicalPlan(), fake.deps);
    expect(fake.timeline.slice(0, 4)).toEqual([
      `delete:${CAPEX_CONTRACTS.entitySetName}`, `delete:${CAPEX_COSTS.entitySetName}`,
      `verify:${CAPEX_CONTRACTS.entitySetName}`, `verify:${CAPEX_COSTS.entitySetName}`,
    ]);
    expect(fake.timeline.slice(4).every((t) => t.startsWith("upsert:"))).toBe(true);
    // isNew targets (c-new, k-new) are asked about too: a retry may have created them.
    expect(fake.verifies).toEqual([
      { table: CAPEX_CONTRACTS.entitySetName, ids: ["c-1", "c-new", "c-2"] },
      { table: CAPEX_COSTS.entitySetName, ids: ["k-1", "k-new"] },
    ]);
    expect(requests.verify).toBe(2);
  });

  it("UT-ACBULK-019 a stored contract target deleted by someone else stops the save with zero upserts", async () => {
    // Changed (§11.12): the deletes (c-gone, k-2) ran alongside the check, so the calls are no
    // longer empty. No plan upsert is sent; k-2's delete changed c-1/c-2's sums, so the reconcile
    // writes the surviving existing contract (c-1) its actual sum and NEVER touches gone c-2.
    const s = seed();
    delete (s.contracts as Record<string, number>)["c-2"];
    const fake = fakeDataverse(s);
    const error = await goneError(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.gone).toEqual({ contracts: 1, costs: 0 });
    expect(fake.calls.filter((c) => c.kind === "upsert" && c.label !== "reconcile totals")).toEqual([]);
    expect(fake.calls.filter((c) => c.kind === "delete").map((c) => c.ids)).toEqual([["c-gone"], ["k-2"]]);
    expect(fake.calls.find((c) => c.label === "reconcile totals")?.ids).toEqual(["c-1"]);
    expect(fake.contracts.has("c-2")).toBe(false); // never re-created
    expect(fake.contracts.get("c-1")).toBe(fake.sumOf("c-1"));
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(error.requests).toEqual({
      verify: 2, contracts: 0, costs: 0, costDeletes: 1, contractDeletes: 1, reconcile: 1, total: 5,
    });
  });

  it("UT-ACBULK-020 a stored cost target deleted by someone else stops the save with zero upserts", async () => {
    // Changed (§11.12): as in 019, the deletes ran alongside the check; only upserts are absent.
    const s = seed();
    s.costs = s.costs.filter((c) => c.id !== "k-1");
    const fake = fakeDataverse(s);
    const error = await goneError(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.gone).toEqual({ contracts: 0, costs: 1 });
    expect(fake.calls.filter((c) => c.kind === "upsert" && c.label !== "reconcile totals")).toEqual([]);
    expect(fake.costs.has("k-1")).toBe(false);
    for (const id of ["c-1", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
  });

  it("UT-ACBULK-021 delete ids that are already gone are still sent (the deleter treats 404 as success); the rest of the save runs", async () => {
    // Changed (§11.12): verify no longer filters delete ids; they go out at t = 0 and a gone row
    // counts as deleted (the fake, like G2's deleter, succeeds on a missing id).
    const s = seed();
    s.costs = s.costs.filter((c) => c.id !== "k-2");
    delete (s.contracts as Record<string, number>)["c-gone"];
    const fake = fakeDataverse(s);
    const { requests } = await executeSavePlan(typicalPlan(), fake.deps);
    expect(fake.calls.map((c) => c.kind)).toEqual(["delete", "delete", "upsert", "upsert", "upsert"]);
    expect(requests).toMatchObject({ costDeletes: 1, contractDeletes: 1 });
  });

  it("UT-ACBULK-022 costDeletesIfExist keeps only the ids that exist, deleted in phase 3 after the verify read", async () => {
    // Changed (§11.12): (3) goes out at t = 0 and is not read back, so the costs read now holds
    // the upsert targets and the retry-only ids only, and the existing retry-only id goes out as
    // its own small phase-3 delete once the read answered (two phase-3 calls instead of one).
    const s = seed();
    s.costs.push(cost("k-left", "c-2", 0));
    const fake = fakeDataverse(s);
    const { requests } = await executeSavePlan(typicalPlan({ costDeletesIfExist: ["k-left", "k-never"] }), fake.deps);
    expect(fake.verifies[1]).toEqual({ table: CAPEX_COSTS.entitySetName, ids: ["k-1", "k-new", "k-left", "k-never"] });
    const phase3 = fake.calls.filter((c) => c.kind === "delete" && c.table === CAPEX_COSTS.entitySetName);
    expect(phase3.map((c) => c.ids)).toEqual([["k-2"], ["k-left"]]);
    expect(fake.costs.has("k-left")).toBe(false);
    expect(requests.costDeletes).toBe(2);
  });

  it("UT-ACBULK-023 no verify call for a table with nothing to check", async () => {
    const contractsOnly = fakeDataverse(seed());
    const result = await executeSavePlan(contractsOnlyPlan(), contractsOnly.deps);
    expect(contractsOnly.verifies.map((v) => v.table)).toEqual([CAPEX_CONTRACTS.entitySetName]);
    expect(result.requests.verify).toBe(1);

    const costsOnly = fakeDataverse(seed());
    await executeSavePlan(typicalPlan({ contractUpserts: [], contractDeletes: [], totals: new Map() }), costsOnly.deps);
    expect(costsOnly.verifies.map((v) => v.table)).toEqual([CAPEX_COSTS.entitySetName]);
  });

  it("UT-ACBULK-024 a failed existence read propagates as it is, with nothing written", async () => {
    // Changed (§11.12): the plan has no deletes now. Deletes start at t = 0 and would have landed
    // before the read failed; that case is UT-ACBULK-047.
    const fake = fakeDataverse(seed(), { failVerify: true });
    await expect(executeSavePlan(typicalPlan({ costDeletes: [], contractDeletes: [] }), fake.deps))
      .rejects.toThrow("verify read failed");
    expect(fake.calls).toEqual([]);
  });
});

/* ════════════════════════════════════════════════ committedBefore / validation ══ */

describe("executeSavePlan — committedBefore and BulkValidationError", () => {
  it("UT-ACBULK-025 a BulkValidationError in phase 1: no reconcile, reconciled, committedBefore false", async () => {
    const fake = fakeDataverse(seed(), { invalidUpsert: CAPEX_CONTRACTS });
    const error = await caught(executeSavePlan(contractsOnlyPlan(), fake.deps));
    expect(error.phase).toBe(1);
    expect(error.cause).toBeInstanceOf(BulkValidationError);
    expect(error.reconciled).toBe(true);
    expect(error.committedBefore).toBe(false);
    expect(fake.calls.map((c) => c.kind)).toEqual(["upsert"]);
  });

  it("UT-ACBULK-026 a BulkValidationError in phase 2 after phase 1 committed still reconciles phase 1's totals", async () => {
    const fake = fakeDataverse(seed(), { invalidUpsert: CAPEX_COSTS });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(2);
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(fake.calls.some((c) => c.kind === "load")).toBe(true);
    for (const id of ["c-1", "c-2", "c-new"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
  });

  it("UT-ACBULK-027 committedBefore follows phase 1's own commit count", async () => {
    const partial = fakeDataverse(seed(), { failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 1 } });
    expect((await caught(executeSavePlan(contractsOnlyPlan(), partial.deps))).committedBefore).toBe(true);
    const none = fakeDataverse(seed(), { failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 0 } });
    expect((await caught(executeSavePlan(contractsOnlyPlan(), none.deps))).committedBefore).toBe(false);
  });

  it("UT-ACBULK-028 committedBefore is true in phase 3 and 4 after earlier phases wrote", async () => {
    const p3 = fakeDataverse(seed(), { refuseDelete: new Set(["k-2"]) });
    expect((await caught(executeSavePlan(typicalPlan(), p3.deps))).committedBefore).toBe(true);
    const p4 = fakeDataverse(seed(), { refuseDelete: new Set(["c-gone"]) });
    expect((await caught(executeSavePlan(typicalPlan(), p4.deps))).committedBefore).toBe(true);
  });

  it("UT-ACBULK-029 a deletes-only phase 3 is committedBefore only when one of its own deletes landed", async () => {
    const plan = typicalPlan({
      contractUpserts: [], costUpserts: [], costDeletes: ["k-2", "k-3"], contractDeletes: [], totals: new Map(),
    });
    const some = fakeDataverse(seed(), { refuseDelete: new Set(["k-3"]) });
    expect((await caught(executeSavePlan(plan, some.deps))).committedBefore).toBe(true);
    const none = fakeDataverse(seed(), { refuseDelete: new Set(["k-2", "k-3"]) });
    expect((await caught(executeSavePlan(plan, none.deps))).committedBefore).toBe(false);
  });

  it("UT-ACBULK-030 a BulkValidationError in phase 2 with nothing committed before: no reconcile read", async () => {
    const fake = fakeDataverse(seed(), { invalidUpsert: CAPEX_COSTS });
    // `totals` is kept so a reconcile WOULD have something to read: only the guard prevents it.
    const error = await caught(executeSavePlan(
      typicalPlan({ contractUpserts: [], costDeletes: [], contractDeletes: [] }), fake.deps,
    ));
    expect(error.phase).toBe(2);
    expect(error.committedBefore).toBe(false);
    expect(error.reconciled).toBe(true);
    expect(fake.calls.some((c) => c.kind === "load")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════ concurrency (gated) ══ */

const EXISTING_CONTRACTS = new Set(["c-1", "c-2", "c-gone"]);
const EXISTING_COSTS = new Set(["k-1", "k-2"]);

/** Starts a typical save on gated deps and answers phase 0; stage A has started on return. */
async function throughVerify() {
  const g = gatedDeps();
  const save = executeSavePlan(typicalPlan(), g.deps);
  // Attach a handler at once so a rejection never goes unhandled while the test drives the gates.
  const outcome = save.then((r) => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e }));
  await flush();
  g.resolve("verify:contracts", EXISTING_CONTRACTS);
  g.resolve("verify:costs", EXISTING_COSTS);
  await flush();
  return { g, outcome };
}

describe("executeSavePlan — concurrency", () => {
  it("UT-ACBULK-031 the two verify reads run concurrently", async () => {
    // Changed (§11.12): the two deletes start at t = 0 too, ahead of the reads; the claim under
    // test (both reads in flight together, no UPSERT until both answered) is unchanged.
    const g = gatedDeps();
    const save = executeSavePlan(typicalPlan(), g.deps).catch(() => undefined);
    await flush();
    // Both started while neither has answered.
    expect(g.started).toEqual(["contractDeletes", "costDeletes", "verify:contracts", "verify:costs"]);
    expect(g.settled).toEqual([]);
    g.resolve("verify:costs", EXISTING_COSTS);
    await flush();
    expect(g.started).toHaveLength(4); // no upsert until BOTH answered
    g.resolve("verify:contracts", EXISTING_CONTRACTS);
    await flush();
    expect(g.started.length).toBeGreaterThan(4);
    for (const n of ["contractDeletes", "contracts", "costs:k-1", "costDeletes"]) g.resolve(n, { requests: 1 });
    await flush();
    g.resolve("costs:k-new", { requests: 1 });
    await save;
  });

  it("UT-ACBULK-032 every stage-A task starts before any of them completes, contract deletes first", async () => {
    // Changed (§11.12): the deletes now start before the reads, the upserts after them.
    const { g, outcome } = await throughVerify();
    expect(g.started).toEqual([
      "contractDeletes", "costDeletes", "verify:contracts", "verify:costs", "contracts", "costs:k-1",
    ]);
    expect(g.settled).toEqual(["verify:contracts", "verify:costs"]);
    for (const n of ["contractDeletes", "contracts", "costs:k-1", "costDeletes"]) g.resolve(n, { requests: 1 });
    await flush();
    g.resolve("costs:k-new", { requests: 1 });
    expect((await outcome).ok).toBe(true);
  });

  it("UT-ACBULK-033 stage-B costs start only after the contract upsert succeeded, and overlap the contract deletes", async () => {
    const { g, outcome } = await throughVerify();
    g.resolve("costs:k-1", { requests: 1 });
    g.resolve("costDeletes", { requests: 1 });
    await flush();
    expect(g.started).not.toContain("costs:k-new");
    g.resolve("contracts", { requests: 1 });
    await flush();
    expect(g.started.at(-1)).toBe("costs:k-new");
    expect(g.settled).not.toContain("contractDeletes"); // (4) still in flight: (2b) overlaps it
    g.resolve("costs:k-new", { requests: 1 });
    await flush();
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false); // the save waits for (4)
    g.resolve("contractDeletes", { requests: 1 });
    const result = await outcome;
    expect(result.ok && result.r.requests).toEqual({
      verify: 2, contracts: 1, costs: 2, costDeletes: 1, contractDeletes: 1, reconcile: 0, total: 7,
    });
  });

  it("UT-ACBULK-034 a stage-A failure: no stage B, every stage-A task settles, then reconcile; phase and committedBefore", async () => {
    const { g, outcome } = await throughVerify();
    g.reject("costDeletes", Object.assign(new Error("delete refused"), { deletedCount: 0 }));
    g.resolve("costs:k-1", { requests: 1 });
    await flush();
    expect(g.started).not.toContain("load"); // (1) and (4) are still in flight
    g.resolve("contracts", { requests: 1 });
    await flush();
    expect(g.started).not.toContain("costs:k-new"); // a failure was seen: stage B never starts
    expect(g.started).not.toContain("load");
    g.resolve("contractDeletes", { requests: 1 });
    await flush();
    // Every write settled before the reconcile read started.
    expect(g.started.at(-1)).toBe("load");
    expect(g.settled).toEqual(expect.arrayContaining(["contractDeletes", "contracts", "costs:k-1", "costDeletes"]));
    g.resolve("load", [cost("k-1", "c-1", 300), cost("k-2", "c-2", 50), cost("k-3", "c-2", 0)]);
    await flush();
    // c-new: planned 70, actual 0 (stage B skipped); c-2: planned 0, actual 50 (k-2 refused).
    g.resolve("reconcile", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(false);
    const error = (result as { e: SavePlanError }).e;
    expect(error).toBeInstanceOf(SavePlanError);
    expect(error.phase).toBe(3);
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(g.started).not.toContain("costs:k-new");
    expect(error.requests).toEqual({
      verify: 2, contracts: 1, costs: 1, costDeletes: 0, contractDeletes: 1, reconcile: 1, total: 6,
    });
  });

  it("UT-ACBULK-035 the error's phase is the lowest failed one, and committedBefore counts the others' commits", async () => {
    // (1) fails with no counts; (3) also fails. (2a) landed: committedBefore true, phase 1.
    const fake = fakeDataverse(seed(), {
      failUpsert: { table: CAPEX_CONTRACTS, chunkSize: 1, afterChunks: 0, reportCounts: false },
      refuseDelete: new Set(["k-2"]),
    });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(1);
    expect(error.failures.map((f) => f.phase)).toEqual([1, 3]);
    expect(error.committedBefore).toBe(true);
    expect(error.unverifiedContractIds).toEqual(["c-new"]);
    expect(error.reconciled).toBe(false);
    expect(fake.calls.some((c) => c.ids.includes("k-new"))).toBe(false);
    for (const id of ["c-1", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
  });

  it("UT-ACBULK-036 a retry: a 'new' target that already exists is sent as an update without the BU bind", async () => {
    // An earlier failed attempt created c-new and k-new; this retry plans them as new again.
    const s = seed();
    (s.contracts as Record<string, number>)["c-new"] = 70;
    s.costs.push(cost("k-new", "c-new", 70));
    const fake = fakeDataverse(s);
    const bu = { [OWNING_BU_BIND]: "/businessunits(bu-1)" };
    const newContract: UpsertTarget = {
      id: "c-new", isNew: true,
      fields: { vsb_totalcost: 70, "vsb_Project@odata.bind": "/vsb_projects(p-1)", ...bu },
    };
    const newCost = costRow("k-new", "c-new", 70);
    const stillNewCost: UpsertTarget = { ...costRow("k-fresh", "c-1", 5), fields: { ...costRow("k-fresh", "c-1", 5).fields, ...bu } };
    await executeSavePlan(typicalPlan({
      contractUpserts: [contractRow("c-1", 305), newContract, contractRow("c-2", 0)],
      costUpserts: [costRow("k-1", "c-1", 300, false), { ...newCost, fields: { ...newCost.fields, ...bu } }, stillNewCost],
      totals: new Map([["c-1", 305], ["c-new", 70], ["c-2", 0]]),
    }), fake.deps);

    const contractCall = fake.calls.find((c) => c.table === CAPEX_CONTRACTS.entitySetName && c.kind === "upsert");
    expect(contractCall?.isNew).toEqual([false, false, false]);
    expect(contractCall?.fields?.[1]).toEqual({ vsb_totalcost: 70, "vsb_Project@odata.bind": "/vsb_projects(p-1)" });

    // c-new now exists, so its cost goes in stage A with the other existing-contract costs.
    const costCalls = fake.calls.filter((c) => c.table === CAPEX_COSTS.entitySetName && c.kind === "upsert");
    expect(costCalls).toHaveLength(1);
    expect(costCalls[0]?.ids).toEqual(["k-1", "k-new", "k-fresh"]);
    expect(costCalls[0]?.isNew).toEqual([false, false, true]);
    const [, retried, fresh] = (costCalls[0]?.fields ?? []) as Record<string, unknown>[];
    expect(retried).not.toHaveProperty(OWNING_BU_BIND);
    expect(retried?.["vsb_Contract@odata.bind"]).toBe(`/${CAPEX_CONTRACTS.entitySetName}(c-new)`);
    expect(fresh?.[OWNING_BU_BIND]).toBe("/businessunits(bu-1)"); // a truly new row keeps it
  });

  it("UT-ACBULK-037 a contract-delete failure seen before (1) succeeds skips stage B, and the reconcile fixes the new contract", async () => {
    const { g, outcome } = await throughVerify();
    g.reject("contractDeletes", Object.assign(new Error("delete refused"), { deletedCount: 0 }));
    await flush();
    for (const n of ["contracts", "costs:k-1", "costDeletes"]) g.resolve(n, { requests: 1 });
    await flush();
    expect(g.started).not.toContain("costs:k-new");
    g.resolve("load", [cost("k-1", "c-1", 300), cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    const error = (await outcome as { e: SavePlanError }).e;
    expect(error.phase).toBe(4);
    expect(error.reconciled).toBe(true);
    expect(g.started.filter((n) => n === "reconcile")).toHaveLength(1);
  });

  it("UT-ACBULK-038 the result reports per-operation timings for the steps that ran", async () => {
    const fake = fakeDataverse(seed());
    const { timings } = await executeSavePlan(noNewContractPlan({ contractDeletes: [] }), fake.deps);
    expect(Object.keys(timings).sort()).toEqual(["contracts", "costDeletes", "costsA", "total", "verify"]);
    for (const ms of Object.values(timings)) expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("UT-ACBULK-039 mayExist skips reading back new ids minted for this save (F2)", async () => {
    const fake = fakeDataverse(seed());
    await executeSavePlan(typicalPlan(), { ...fake.deps, mayExist: (id) => id === "k-new" });
    // c-new was minted now (cannot exist): not asked about. k-new came from an earlier attempt: asked.
    // Changed (§11.12): the delete ids c-gone and k-2 are no longer read (see UT-ACBULK-018).
    expect(fake.verifies).toEqual([
      { table: CAPEX_CONTRACTS.entitySetName, ids: ["c-1", "c-2"] },
      { table: CAPEX_COSTS.entitySetName, ids: ["k-1", "k-new"] },
    ]);
  });
});

/* ══════════════════════════════════════════ §11.12: conditional verify, deletes at t = 0 ══ */

/** Starts a save on gated deps, with a handler attached at once. */
function gatedSave(plan: SaveBuildPlan, over: Partial<SavePlanDeps> = {}) {
  const g = gatedDeps();
  const outcome = executeSavePlan(plan, { ...g.deps, ...over })
    .then((r) => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e }));
  return { g, outcome };
}

describe("executeSavePlan — conditional verify and deletes at t = 0 (§11.12)", () => {
  it("UT-ACBULK-040 verifyUpserts: false makes no verify read; requests.verify is 0 and timings has no verify", async () => {
    const fake = fakeDataverse(seed());
    const { requests, timings } = await executeSavePlan(typicalPlan(), { ...fake.deps, verifyUpserts: false });
    expect(fake.verifies).toEqual([]);
    expect(fake.timeline.some((t) => t.startsWith("verify:"))).toBe(false);
    expect(requests.verify).toBe(0);
    expect(timings).not.toHaveProperty("verify");
    expect(fake.contracts).toEqual(new Map([["c-1", 300], ["c-2", 0], ["c-new", 70]]));
    expect(fake.sumOf("c-new")).toBe(70);
  });

  it("UT-ACBULK-041 verifyUpserts: false starts every first-wave write at t = 0, before any answers", async () => {
    const { g, outcome } = gatedSave(typicalPlan(), { verifyUpserts: false });
    // Synchronously, before a single microtask ran: every write is already in flight.
    expect(g.started).toEqual(["contractDeletes", "costDeletes", "contracts", "costs:k-1"]);
    await flush();
    expect(g.settled).toEqual([]);
    expect(g.started.some((n) => n.startsWith("verify:"))).toBe(false);
    for (const n of ["contractDeletes", "costDeletes", "contracts", "costs:k-1"]) g.resolve(n, { requests: 1 });
    await flush();
    expect(g.started.at(-1)).toBe("costs:k-new"); // stage B still waits for (1)
    g.resolve("costs:k-new", { requests: 1 });
    const result = await outcome;
    expect(result.ok && result.r.requests).toEqual({
      verify: 0, contracts: 1, costs: 2, costDeletes: 1, contractDeletes: 1, reconcile: 0, total: 5,
    });
  });

  it("UT-ACBULK-042 verifyUpserts: false and a gone update target: a phase failure and a reconcile, not RowsGoneError", async () => {
    // k-1 (an update target) was deleted by someone else. UpdateMultiple refuses it, nothing is
    // re-created, and the existing reconcile path makes every total true again.
    const s = seed();
    s.costs = s.costs.filter((c) => c.id !== "k-1");
    const fake = fakeDataverse(s, { strictUpdates: true });
    const error = await caught(executeSavePlan(typicalPlan(), { ...fake.deps, verifyUpserts: false }));
    expect(error).not.toBeInstanceOf(RowsGoneError);
    expect(error.phase).toBe(2);
    expect(error.cause).toBeInstanceOf(FakeChunkError);
    expect(error.reconciled).toBe(true);
    expect(fake.verifies).toEqual([]);
    expect(fake.costs.has("k-1")).toBe(false); // never resurrected
    expect(fake.calls.some((c) => c.kind === "load")).toBe(true);
    // c-1 was written its planned 300 by (1); its actual sum is now 0, so the reconcile fixed it.
    expect(fake.calls.find((c) => c.label === "reconcile totals")?.ids).toContain("c-1");
    for (const id of ["c-1", "c-2", "c-new"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
  });

  it("UT-ACBULK-043 deletes start before the verify read answers; upserts wait for it (default verify)", async () => {
    const { g, outcome } = gatedSave(typicalPlan());
    await flush();
    expect(g.started).toEqual(["contractDeletes", "costDeletes", "verify:contracts", "verify:costs"]);
    // Both deletes answer while verify is still outstanding: nothing waits on the read for them.
    g.resolve("contractDeletes", { requests: 1 });
    g.resolve("costDeletes", { requests: 1 });
    await flush();
    expect(g.settled).toEqual(["contractDeletes", "costDeletes"]);
    expect(g.started).not.toContain("contracts");
    g.resolve("verify:contracts", EXISTING_CONTRACTS);
    g.resolve("verify:costs", EXISTING_COSTS);
    await flush();
    expect(g.started.slice(4)).toEqual(["contracts", "costs:k-1"]);
    g.resolve("contracts", { requests: 1 });
    g.resolve("costs:k-1", { requests: 1 });
    await flush();
    g.resolve("costs:k-new", { requests: 1 });
    const result = await outcome;
    expect(result.ok && result.r.requests).toEqual({
      verify: 2, contracts: 1, costs: 2, costDeletes: 1, contractDeletes: 1, reconcile: 0, total: 7,
    });
  });

  it("UT-ACBULK-044 costDeletesIfExist still causes a verify (of those ids only), and its delete goes after it", async () => {
    const plan = typicalPlan({ costDeletesIfExist: ["k-left", "k-never", "k-2"] });
    const { g, outcome } = gatedSave(plan, { verifyUpserts: false });
    // The upserts are not verified: they start at t = 0 beside the read of the retry-only ids.
    expect(g.started).toEqual(["contractDeletes", "costDeletes", "verify:costs", "contracts", "costs:k-1"]);
    for (const n of ["contractDeletes", "costDeletes", "contracts", "costs:k-1"]) g.resolve(n, { requests: 1 });
    await flush();
    g.resolve("costs:k-new", { requests: 1 });
    await flush();
    expect(g.started.filter((n) => n === "costDeletes")).toHaveLength(1); // not before the read
    g.resolve("verify:costs", new Set(["K-LEFT"]));
    await flush();
    expect(g.started.at(-1)).toBe("costDeletes");
    expect(g.started.filter((n) => n === "costDeletes")).toHaveLength(2);
    // The second phase-3 delete reuses the gate name; resolve the newest one.
    g.resolve("costDeletes", { requests: 1 });
    const result = await outcome;
    expect(result.ok && result.r.requests).toEqual({
      verify: 1, contracts: 1, costs: 2, costDeletes: 2, contractDeletes: 1, reconcile: 0, total: 7,
    });
  });

  it("UT-ACBULK-045 costDeletesIfExist: only the retry-only ids are read, only existing ones deleted, ids already in (3) skipped", async () => {
    const s = seed();
    s.costs.push(cost("k-left", "c-2", 0));
    const fake = fakeDataverse(s);
    const { requests } = await executeSavePlan(
      typicalPlan({ costDeletesIfExist: ["k-left", "k-never", "k-2"] }), { ...fake.deps, verifyUpserts: false },
    );
    expect(fake.verifies).toEqual([{ table: CAPEX_COSTS.entitySetName, ids: ["k-left", "k-never"] }]);
    const phase3 = fake.calls.filter((c) => c.kind === "delete" && c.table === CAPEX_COSTS.entitySetName);
    expect(phase3.map((c) => c.ids)).toEqual([["k-2"], ["k-left"]]);
    expect(requests).toEqual({
      verify: 1, contracts: 2, costs: 2, costDeletes: 2, contractDeletes: 1, reconcile: 0, total: 8,
    });
  });

  it("UT-ACBULK-046 the dep omitted behaves exactly as verifyUpserts: true", async () => {
    const run = async (deps: (f: ReturnType<typeof fakeDataverse>) => SavePlanDeps) => {
      const fake = fakeDataverse(seed());
      const { requests } = await executeSavePlan(typicalPlan(), deps(fake));
      return { requests, verifies: fake.verifies, timeline: fake.timeline };
    };
    const omitted = await run((f) => f.deps);
    const explicit = await run((f) => ({ ...f.deps, verifyUpserts: true }));
    expect(omitted).toEqual(explicit);
    expect(omitted.requests).toEqual({
      verify: 2, contracts: 2, costs: 2, costDeletes: 1, contractDeletes: 1, reconcile: 0, total: 8,
    });
    // And the RowsGoneError check still runs by default.
    const s = seed();
    delete (s.contracts as Record<string, number>)["c-1"];
    await goneError(executeSavePlan(typicalPlan(), fakeDataverse(s).deps));
  });

  it("UT-ACBULK-047 a failed verify read after deletes landed: they are reconciled, and a SavePlanError names the stopped phase", async () => {
    const fake = fakeDataverse(seed(), { failVerify: true });
    const error = await caught(executeSavePlan(typicalPlan(), fake.deps));
    expect(error.phase).toBe(1);
    expect((error.cause as Error).message).toBe("verify read failed");
    expect(error.failures.map((f) => f.phase)).toEqual([1, 2]);
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(error.unverifiedContractIds).toEqual([]); // c-new was never sent: not "unknown"
    // No plan upsert went out; k-2's delete landed, so c-1/c-2 get their actual sums.
    expect(fake.calls.filter((c) => c.kind === "upsert").map((c) => c.label)).toEqual(["reconcile totals"]);
    expect(fake.calls.find((c) => c.kind === "load")?.ids).toEqual(["c-1", "c-2"]);
    for (const id of ["c-1", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
    expect(fake.contracts.has("c-new")).toBe(false);
    expect(error.requests).toEqual({
      verify: 0, contracts: 0, costs: 0, costDeletes: 1, contractDeletes: 1, reconcile: 1, total: 3,
    });
  });

  it("UT-ACBULK-048 a failed retry-only read with verifyUpserts: false is a phase-3 failure; the upserts still landed", async () => {
    const fake = fakeDataverse(seed(), { failVerify: true });
    const error = await caught(executeSavePlan(
      typicalPlan({ costDeletesIfExist: ["k-left"] }), { ...fake.deps, verifyUpserts: false },
    ));
    expect(error.phase).toBe(3);
    expect((error.cause as Error).message).toBe("verify read failed");
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(fake.calls.some((c) => c.label === "upsert contracts")).toBe(true);
    expect(fake.calls.filter((c) => c.kind === "delete").map((c) => c.ids)).toEqual([["c-gone"], ["k-2"]]);
    for (const id of ["c-1", "c-2", "c-new"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
    // (2b) is skipped once ANY failure was seen before (1) answered, so this is timing-dependent;
    // the totals are true either way (asserted above).
  });

  it("UT-ACBULK-049 RowsGoneError waits for the deletes still in flight", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan());
    await flush();
    g.resolve("verify:contracts", new Set(["c-2", "c-gone"])); // c-1 is gone
    g.resolve("verify:costs", EXISTING_COSTS);
    await flush();
    expect(g.started).not.toContain("contracts");
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false); // both deletes are still in flight
    g.resolve("contractDeletes", { requests: 1 });
    g.resolve("costDeletes", { requests: 1 });
    await flush();
    // k-2's delete landed: c-2 (surviving, existing) is reconciled; gone c-1 is not read or written.
    expect(g.started.at(-1)).toBe("load");
    g.resolve("load", [cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(false);
    const error = (result as { e: RowsGoneError }).e;
    expect(error).toBeInstanceOf(RowsGoneError);
    expect(error.gone).toEqual({ contracts: 1, costs: 0 });
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(error.requests).toEqual({
      verify: 2, contracts: 0, costs: 0, costDeletes: 1, contractDeletes: 1, reconcile: 1, total: 5,
    });
  });
});

/* ═════════════════════════════════════════ D51 option A: deferred contract deletes ══ */

describe("executeSavePlan — deferContractDeletes (D51 option A)", () => {
  const DEFER: Partial<SavePlanDeps> = { verifyUpserts: false, deferContractDeletes: true };
  /** Answers every write except (4); the plan has no new contract, so no stage B. */
  const answerOthers = (g: ReturnType<typeof gatedDeps>) => {
    for (const n of ["contracts", "costs:k-1", "costDeletes"]) g.resolve(n, { requests: 1 });
  };

  it("UT-ACBULK-051 the save resolves before the contract delete; background reports it later", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), DEFER);
    // Changed (late start): was "(4) at t = 0". Deferred, (4) waits until every write settled.
    expect(g.started).not.toContain("contractDeletes");
    expect(g.started[0]).toBe("costDeletes"); // not deferred here: still at t = 0
    answerOthers(g);
    const result = await outcome;
    expect(g.started).toContain("contractDeletes");
    expect(g.settled).not.toContain("contractDeletes");
    expect(result.ok).toBe(true);
    const r = (result as { r: Awaited<ReturnType<typeof executeSavePlan>> }).r;
    expect(r.requests).toEqual({
      verify: 0, contracts: 1, costs: 1, costDeletes: 1, contractDeletes: 0, reconcile: 0, total: 3,
    });
    expect(r.timings).not.toHaveProperty("contractDeletes");
    expect(r.background).toBeInstanceOf(Promise);
    let bgDone = false;
    void r.background?.then(() => { bgDone = true; });
    await flush();
    expect(bgDone).toBe(false);
    g.resolve("contractDeletes", { requests: 4 });
    await expect(r.background).resolves.toEqual({ requests: 4 });
    // The returned result is never mutated afterwards.
    expect(r.requests.contractDeletes).toBe(0);
    expect(r.requests.total).toBe(3);
    expect(r.timings).not.toHaveProperty("contractDeletes");
  });

  it("UT-ACBULK-052 a background delete failure resolves background with the error; no reconcile", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), DEFER);
    answerOthers(g);
    const result = await outcome;
    expect(result.ok).toBe(true);
    const r = (result as { r: Awaited<ReturnType<typeof executeSavePlan>> }).r;
    const refusal = Object.assign(new Error("delete refused"), { deletedCount: 0 });
    g.reject("contractDeletes", refusal);
    // Changed (cost-delete deferral): the outcome also names the group that failed.
    await expect(r.background).resolves.toEqual({ requests: 0, error: refusal, contractDeleteError: refusal });
    await flush();
    expect(g.started).not.toContain("load");
    expect(g.started).not.toContain("reconcile");
    expect(r.requests).toEqual({
      verify: 0, contracts: 1, costs: 1, costDeletes: 1, contractDeletes: 0, reconcile: 0, total: 3,
    });
  });

  it("UT-ACBULK-053 a write failure with the flag set waits for the contract delete and throws as today", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), DEFER);
    g.resolve("contracts", { requests: 1 });
    g.resolve("costDeletes", { requests: 1 });
    g.reject("costs:k-1", new FakeChunkError(0, 0));
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false); // (4) still in flight: no early return on a failure path
    expect(g.started).not.toContain("load"); // and no reconcile while it runs
    g.resolve("contractDeletes", { requests: 1 });
    await flush();
    expect(g.started.at(-1)).toBe("load");
    g.resolve("load", [cost("k-1", "c-1", 100), cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(false);
    const error = (result as { e: SavePlanError }).e;
    expect(error).toBeInstanceOf(SavePlanError);
    expect(error.phase).toBe(2);
    expect(error.reconciled).toBe(true);
    expect(error.requests).toEqual({
      verify: 0, contracts: 1, costs: 0, costDeletes: 1, contractDeletes: 1, reconcile: 1, total: 4,
    });
  });

  it("UT-ACBULK-057 a deferred contract delete can no longer skip stage B: it starts after it (E5-1)", async () => {
    // Changed (late start). Was: (4) refused before (1) landed skipped stage B, and only
    // `needsReconcile` stopped an early "success" leaving c-new without its cost rows. Deferred,
    // (4) now starts only after (1), (2a) AND (2b) settled, so its failure can never skip (2b);
    // it is a background failure with nothing to reconcile.
    const { g, outcome } = gatedSave(typicalPlan(), DEFER);
    expect(g.started).not.toContain("contractDeletes");
    for (const n of ["contracts", "costs:k-1", "costDeletes"]) g.resolve(n, { requests: 1 });
    await flush();
    expect(g.started).toContain("costs:k-new"); // stage B ran
    expect(g.started).not.toContain("contractDeletes");
    g.resolve("costs:k-new", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(true);
    const r = (result as { r: SaveResult }).r;
    const refusal = Object.assign(new Error("403"), { deletedCount: 0 });
    g.reject("contractDeletes", refusal);
    await expect(r.background).resolves.toEqual({ requests: 0, error: refusal, contractDeleteError: refusal });
    expect(g.started).not.toContain("load");
  });

  it("UT-ACBULK-058 every write fails with nothing landed: no early success even though no reconcile is needed (E5-2)", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), DEFER);
    g.reject("contracts", new FakeChunkError(0, 0));
    g.reject("costs:k-1", new FakeChunkError(0, 0));
    g.reject("costDeletes", Object.assign(new Error("refused"), { deletedCount: 0 }));
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false); // a failure path waits for (4)
    g.resolve("contractDeletes", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(false);
    expect((result as { e: SavePlanError }).e).toBeInstanceOf(SavePlanError);
  });

  it("UT-ACBULK-054 the flag with no contract deletes: background is undefined", async () => {
    const fake = fakeDataverse(seed());
    const result = await executeSavePlan(noNewContractPlan({ contractDeletes: [] }), { ...fake.deps, deferContractDeletes: true });
    expect(result.background).toBeUndefined();
    expect(result).not.toHaveProperty("background");
  });

  it("UT-ACBULK-055 the flag and a RowsGoneError: the contract delete is awaited and counted, no background", async () => {
    const s = seed();
    delete (s.contracts as Record<string, number>)["c-1"];
    const fake = fakeDataverse(s);
    const error = await goneError(executeSavePlan(typicalPlan(), { ...fake.deps, deferContractDeletes: true }));
    expect(error.requests.contractDeletes).toBe(1);
    expect(fake.contracts.has("c-gone")).toBe(false);
  });

  it("UT-ACBULK-056 flag off: the save waits for the contract delete and counts it (unchanged)", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), { verifyUpserts: false });
    answerOthers(g);
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    g.resolve("contractDeletes", { requests: 1 });
    const result = await outcome;
    const r = (result as { r: Awaited<ReturnType<typeof executeSavePlan>> }).r;
    expect(r.requests.contractDeletes).toBe(1);
    expect(r.timings).toHaveProperty("contractDeletes");
    expect(r).not.toHaveProperty("background");
  });
});

/* ═══════════════════════════════════════════════════ deferred cost deletes (Q2) ══ */

/** Holds every cost-table `deleteMany` until `release()`, then lets the real fake run it. */
function holdingCostDeletes(deps: SavePlanDeps) {
  const held: (() => void)[] = [];
  const wrapped: SavePlanDeps = {
    ...deps,
    deleteMany: (t, ids, label) => (t === CAPEX_COSTS
      ? new Promise<void>((r) => { held.push(r); }).then(() => deps.deleteMany(t, ids, label))
      : deps.deleteMany(t, ids, label)),
  };
  return { deps: wrapped, held, release: () => { held.splice(0).forEach((r) => r()); } };
}

type SaveResult = Awaited<ReturnType<typeof executeSavePlan>>;

describe("executeSavePlan — deferCostDeletes", () => {
  const COST_DEFER: Partial<SavePlanDeps> = { verifyUpserts: false, deferCostDeletes: true };
  /** c-1 / c-2 upserts and k-1; no new contract (no stage B), no contract delete. */
  const costOnlyPlan = (over: Partial<SaveBuildPlan> = {}) => noNewContractPlan({ contractDeletes: [], ...over });

  it("UT-ACBULK-059 the save resolves before the held cost delete; background resolves after it", async () => {
    const { g, outcome } = gatedSave(costOnlyPlan(), COST_DEFER);
    // Changed (late start): was "still started at t = 0". Deferred, (3) waits for the writes.
    expect(g.started).not.toContain("costDeletes");
    g.resolve("contracts", { requests: 1 });
    g.resolve("costs:k-1", { requests: 1 });
    const result = await outcome;
    expect(g.started).toContain("costDeletes");
    expect(g.settled).not.toContain("costDeletes");
    expect(result.ok).toBe(true);
    const r = (result as { r: SaveResult }).r;
    expect(r.requests).toEqual({
      verify: 0, contracts: 1, costs: 1, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 2,
    });
    expect(r.timings).not.toHaveProperty("costDeletes");
    expect(r.background).toBeInstanceOf(Promise);
    let bgDone = false;
    void r.background?.then(() => { bgDone = true; });
    await flush();
    expect(bgDone).toBe(false);
    g.resolve("costDeletes", { requests: 3 });
    await expect(r.background).resolves.toEqual({ requests: 3 });
    expect(g.started).not.toContain("load"); // a successful delete needs no reconcile
    expect(r.requests.costDeletes).toBe(0); // never mutated afterwards
    expect(r.requests.total).toBe(2);
    expect(r.timings).not.toHaveProperty("costDeletes");
  });

  it("UT-ACBULK-060 a failed background cost delete is reconciled in the background and reported", async () => {
    const fake = fakeDataverse(seed(), { refuseDelete: new Set(["k-2"]) });
    const hold = holdingCostDeletes(fake.deps);
    const r = await executeSavePlan(costOnlyPlan(), { ...hold.deps, ...COST_DEFER });
    // (1) wrote c-2's final total 0, which assumes k-2 (50) is gone.
    expect(fake.contracts.get("c-2")).toBe(0);
    expect(hold.held).toHaveLength(1);
    expect(fake.calls.some((c) => c.kind === "load")).toBe(false);
    hold.release();
    const bg = await r.background;
    expect(bg?.costDeleteError).toBeInstanceOf(Error);
    expect(bg?.error).toBe(bg?.costDeleteError);
    expect(bg?.contractDeleteError).toBeUndefined();
    expect(bg?.reconciled).toBe(true);
    expect(bg?.reconcileError).toBeUndefined();
    // Scope: every surviving contract of plan.totals, compared; only c-2 differs, so only it is written.
    expect(fake.calls.find((c) => c.kind === "load")?.ids).toEqual(["c-1", "c-2"]);
    expect(fake.calls.find((c) => c.label === "reconcile totals")?.ids).toEqual(["c-2"]);
    expect(fake.contracts.get("c-2")).toBe(50);
    for (const id of ["c-1", "c-2"]) expect(fake.contracts.get(id)).toBe(fake.sumOf(id));
    expect(bg?.requests).toBe(1); // the reconcile upsert; the failed delete's are not known
    expect(r.requests.reconcile).toBe(0); // the returned result is not touched
    expect(r.timings).not.toHaveProperty("reconcile");
  });

  it("UT-ACBULK-061 a failed background reconcile gives reconciled: false and its error", async () => {
    const fake = fakeDataverse(seed(), { refuseDelete: new Set(["k-2"]), failReconcile: true });
    const hold = holdingCostDeletes(fake.deps);
    const r = await executeSavePlan(costOnlyPlan(), { ...hold.deps, ...COST_DEFER });
    hold.release();
    const bg = await r.background;
    expect(bg?.costDeleteError).toBeInstanceOf(Error);
    expect(bg?.reconciled).toBe(false);
    expect(bg?.reconcileError).toBeInstanceOf(Error);
    expect((bg?.reconcileError as Error | undefined)?.message).toBe("reconcile refused");
    expect(bg?.requests).toBe(0);
  });

  it("UT-ACBULK-062 both flags: one merged background that resolves after both groups", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), { ...COST_DEFER, deferContractDeletes: true });
    g.resolve("contracts", { requests: 1 });
    g.resolve("costs:k-1", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(true);
    const r = (result as { r: SaveResult }).r;
    expect(r.requests).toEqual({
      verify: 0, contracts: 1, costs: 1, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 2,
    });
    let bgDone = false;
    void r.background?.then(() => { bgDone = true; });
    g.resolve("costDeletes", { requests: 1 });
    await flush();
    expect(bgDone).toBe(false); // the contract delete is still in flight
    g.resolve("contractDeletes", { requests: 4 });
    await expect(r.background).resolves.toEqual({ requests: 5 });
  });

  it("UT-ACBULK-063 both flags, both fail: error is the cost failure; the reconcile waits for the contract delete", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), { ...COST_DEFER, deferContractDeletes: true });
    g.resolve("contracts", { requests: 1 });
    g.resolve("costs:k-1", { requests: 1 });
    const r = ((await outcome) as { r: SaveResult }).r;
    const costRefusal = Object.assign(new Error("cost refused"), { deletedCount: 0 });
    const contractRefusal = Object.assign(new Error("contract refused"), { deletedCount: 0 });
    g.reject("costDeletes", costRefusal);
    await flush();
    expect(g.started).not.toContain("load"); // never while (4) is in flight
    g.reject("contractDeletes", contractRefusal);
    await flush();
    expect(g.started.at(-1)).toBe("load");
    g.resolve("load", [cost("k-1", "c-1", 300), cost("k-2", "c-2", 50), cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    await expect(r.background).resolves.toEqual({
      requests: 1, error: costRefusal, costDeleteError: costRefusal, contractDeleteError: contractRefusal,
      reconciled: true,
    });
  });

  it("UT-ACBULK-064 a write failure with the flag set waits for the cost delete and throws as today", async () => {
    const { g, outcome } = gatedSave(costOnlyPlan(), COST_DEFER);
    g.resolve("contracts", { requests: 1 });
    g.reject("costs:k-1", new FakeChunkError(0, 0));
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    expect(g.started).not.toContain("load");
    g.resolve("costDeletes", { requests: 1 });
    await flush();
    expect(g.started.at(-1)).toBe("load");
    g.resolve("load", [cost("k-1", "c-1", 100), cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(false);
    const error = (result as { e: SavePlanError }).e;
    expect(error).toBeInstanceOf(SavePlanError);
    expect(error.phase).toBe(2);
    expect(error.reconciled).toBe(true);
    expect(error.requests).toEqual({
      verify: 0, contracts: 1, costs: 0, costDeletes: 1, contractDeletes: 0, reconcile: 1, total: 3,
    });
  });

  it("UT-ACBULK-065 a deferred cost delete cannot fail before the save returns: it starts after the writes, its failure is reconciled in the background", async () => {
    // Changed (late start). Was: (3) refused at t = 0, before the writes answered, so the save
    // waited and threw phase 3. Deferred, (3) now starts only after every write settled, so with
    // both flags the save has already decided to return; the refusal is a background failure.
    // (`costDeleteFailureSeen` still matters with `deferCostDeletes` alone and a slow (4).)
    const { g, outcome } = gatedSave(costOnlyPlan(), COST_DEFER);
    expect(g.started).not.toContain("costDeletes");
    g.resolve("contracts", { requests: 1 });
    g.resolve("costs:k-1", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(true);
    const r = (result as { r: SaveResult }).r;
    const refusal = Object.assign(new Error("refused"), { deletedCount: 0 });
    g.reject("costDeletes", refusal);
    await flush();
    expect(g.started).toContain("load"); // the BACKGROUND reconcile
    g.resolve("load", [cost("k-1", "c-1", 300), cost("k-2", "c-2", 50), cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    await expect(r.background).resolves.toEqual({
      requests: 1, error: refusal, costDeleteError: refusal, reconciled: true,
    });
  });

  it("UT-ACBULK-066 costDeletesIfExist is deferred with (3): both held, counted in background only", async () => {
    const s = seed();
    s.costs.push(cost("k-left", "c-2", 0));
    const fake = fakeDataverse(s);
    const hold = holdingCostDeletes(fake.deps);
    const r = await executeSavePlan(costOnlyPlan({ costDeletesIfExist: ["k-left"] }), { ...hold.deps, ...COST_DEFER });
    await flush();
    expect(hold.held).toHaveLength(2);
    expect(r.requests.costDeletes).toBe(0);
    expect(r.requests.verify).toBe(1);
    hold.release();
    await expect(r.background).resolves.toEqual({ requests: 2 });
    expect(fake.costs.has("k-2")).toBe(false);
    expect(fake.costs.has("k-left")).toBe(false);
  });

  it("UT-ACBULK-067 flag off: the save waits for the cost delete and counts it (unchanged)", async () => {
    const { g, outcome } = gatedSave(costOnlyPlan(), { verifyUpserts: false });
    g.resolve("contracts", { requests: 1 });
    g.resolve("costs:k-1", { requests: 1 });
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    g.resolve("costDeletes", { requests: 1 });
    const r = ((await outcome) as { r: SaveResult }).r;
    expect(r.requests.costDeletes).toBe(1);
    expect(r.timings).toHaveProperty("costDeletes");
    expect(r).not.toHaveProperty("background");
  });

  it("UT-ACBULK-068 the flag with nothing to delete: no background", async () => {
    const fake = fakeDataverse(seed());
    const r = await executeSavePlan(costOnlyPlan({ costDeletes: [] }), { ...fake.deps, deferCostDeletes: true });
    expect(r).not.toHaveProperty("background");
  });
});

/* ════════════════════════════════ late start of the deferred deletes (DEV, 27 Oct) ══ */

describe("executeSavePlan — deferred deletes start only after the writes settle", () => {
  const BOTH: Partial<SavePlanDeps> = { deferContractDeletes: true, deferCostDeletes: true };
  const DELETES = ["contractDeletes", "costDeletes"];
  const noDeleteStarted = (g: ReturnType<typeof gatedDeps>) =>
    expect(g.started.filter((n) => DELETES.includes(n))).toEqual([]);

  it("UT-ACBULK-069 both flags: no delete starts before verify, (1), (2a) and (2b) settled; both start right after", async () => {
    const { g, outcome } = gatedSave(typicalPlan(), BOTH);
    expect([...g.started].sort()).toEqual(["verify:contracts", "verify:costs"]);
    g.resolve("verify:contracts", new Set(["c-1", "c-2"]));
    g.resolve("verify:costs", new Set(["k-1"]));
    await flush();
    expect(g.started).toContain("contracts");
    expect(g.started).toContain("costs:k-1");
    noDeleteStarted(g);
    g.resolve("contracts", { requests: 1 });
    await flush();
    expect(g.started).toContain("costs:k-new"); // stage B
    noDeleteStarted(g);
    g.resolve("costs:k-1", { requests: 1 });
    await flush();
    noDeleteStarted(g); // (2b) is still in flight
    const lastWrite = g.started.indexOf("costs:k-new");
    g.resolve("costs:k-new", { requests: 1 });
    const result = await outcome;
    // Right after the last write: the next calls made are the deletes, contract deletes first.
    expect(g.started.slice(lastWrite + 1)).toEqual(["contractDeletes", "costDeletes"]);
    expect(g.settled.filter((n) => DELETES.includes(n))).toEqual([]);
    expect(result.ok).toBe(true);
    const r = (result as { r: SaveResult }).r;
    expect(r.requests).toEqual({
      verify: 2, contracts: 1, costs: 2, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 5,
    });
    g.resolve("contractDeletes", { requests: 2 });
    g.resolve("costDeletes", { requests: 1 });
    await expect(r.background).resolves.toEqual({ requests: 3 });
    expect(g.started).not.toContain("load");
  });

  it("UT-ACBULK-070 both flags, a write fails: deletes start after the writes, are awaited, then reconcile and throw as today", async () => {
    const { g, outcome } = gatedSave(noNewContractPlan(), { ...BOTH, verifyUpserts: false });
    g.reject("costs:k-1", new FakeChunkError(0, 0));
    await flush();
    noDeleteStarted(g); // (1) is still in flight
    g.resolve("contracts", { requests: 1 });
    await flush();
    expect(g.started.slice(-2)).toEqual(["contractDeletes", "costDeletes"]);
    let done = false;
    void outcome.then(() => { done = true; });
    await flush();
    expect(done).toBe(false); // a failure path waits for the deletes
    expect(g.started).not.toContain("load"); // never reconcile while a delete is in flight
    g.resolve("contractDeletes", { requests: 1 });
    await flush();
    expect(g.started).not.toContain("load");
    g.resolve("costDeletes", { requests: 1 });
    await flush();
    expect(g.started.at(-1)).toBe("load");
    g.resolve("load", [cost("k-1", "c-1", 100), cost("k-3", "c-2", 0)]);
    await flush();
    g.resolve("reconcile", { requests: 1 });
    const result = await outcome;
    expect(result.ok).toBe(false);
    const error = (result as { e: SavePlanError }).e;
    expect(error).toBeInstanceOf(SavePlanError);
    expect(error.phase).toBe(2);
    expect(error.reconciled).toBe(true);
    // Waited for, so counted as without the flags.
    expect(error.requests).toEqual({
      verify: 0, contracts: 1, costs: 0, costDeletes: 1, contractDeletes: 1, reconcile: 1, total: 4,
    });
  });

  it("UT-ACBULK-071 flags off: both deletes still start at t = 0, before verify and every upsert; one flag defers only its group", async () => {
    const off = gatedSave(typicalPlan());
    expect(off.g.started.slice(0, 2)).toEqual(["contractDeletes", "costDeletes"]);
    expect(off.g.started.slice(2).sort()).toEqual(["verify:contracts", "verify:costs"]);
    const unverified = gatedSave(noNewContractPlan(), { verifyUpserts: false });
    expect(unverified.g.started).toEqual(["contractDeletes", "costDeletes", "contracts", "costs:k-1"]);
    // Only contract deletes deferred: (3) keeps its t = 0 start, (4) waits.
    const contractsOnly = gatedSave(noNewContractPlan(), { verifyUpserts: false, deferContractDeletes: true });
    expect(contractsOnly.g.started).toEqual(["costDeletes", "contracts", "costs:k-1"]);
    // Only cost deletes deferred: the mirror image.
    const costsOnly = gatedSave(noNewContractPlan(), { verifyUpserts: false, deferCostDeletes: true });
    expect(costsOnly.g.started).toEqual(["contractDeletes", "contracts", "costs:k-1"]);
  });

  it("UT-ACBULK-072 timings: flags off, each delete spans from t = 0; both flags, the result's timings are the writes' own", async () => {
    let clock = 0;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    try {
      const off = gatedSave(noNewContractPlan(), { verifyUpserts: false });
      clock = 300; off.g.resolve("contracts", { requests: 1 }); await flush();
      clock = 500; off.g.resolve("costs:k-1", { requests: 1 }); await flush();
      clock = 900; off.g.resolve("costDeletes", { requests: 1 }); await flush();
      clock = 1200; off.g.resolve("contractDeletes", { requests: 1 });
      const offResult = ((await off.outcome) as { r: SaveResult }).r;
      expect(offResult.timings).toEqual({
        contracts: 300, costsA: 500, costDeletes: 900, contractDeletes: 1200, total: 1200,
      });

      clock = 0;
      const on = gatedSave(noNewContractPlan(), { ...BOTH, verifyUpserts: false });
      clock = 300; on.g.resolve("contracts", { requests: 1 }); await flush();
      clock = 500; on.g.resolve("costs:k-1", { requests: 1 });
      const onResult = ((await on.outcome) as { r: SaveResult }).r;
      // The deferred deletes started at 500; none of their time is in the returned result.
      expect(onResult.timings).toEqual({ contracts: 300, costsA: 500, total: 500 });
      clock = 2000;
      on.g.resolve("contractDeletes", { requests: 1 });
      on.g.resolve("costDeletes", { requests: 1 });
      await expect(onResult.background).resolves.toEqual({ requests: 2 });
      expect(onResult.timings).toEqual({ contracts: 300, costsA: 500, total: 500 }); // never mutated
    } finally {
      spy.mockRestore();
    }
  });

  it("UT-ACBULK-073 both flags against the fake store: (3') waits for the writes too; every delete call comes after every write", async () => {
    const s = seed();
    s.costs.push(cost("k-left", "c-2", 0));
    const plan = () => typicalPlan({ costDeletesIfExist: ["k-left"] });
    const fake = fakeDataverse(s);
    const r = await executeSavePlan(plan(), { ...fake.deps, ...BOTH });
    await expect(r.background).resolves.toEqual({ requests: 3 });
    const firstDelete = fake.timeline.findIndex((t) => t.startsWith("delete:"));
    expect(firstDelete).toBeGreaterThan(0);
    expect(fake.timeline.slice(firstDelete).every((t) => t.startsWith("delete:"))).toBe(true);
    expect(fake.timeline.filter((t) => t.startsWith("delete:"))).toHaveLength(3);
    expect(fake.costs.has("k-left")).toBe(false);
    expect(fake.contracts.has("c-gone")).toBe(false);
    // Flags off, the same plan sends its deletes first.
    const s2 = seed();
    s2.costs.push(cost("k-left", "c-2", 0));
    const offFake = fakeDataverse(s2);
    await executeSavePlan(plan(), offFake.deps);
    expect(offFake.timeline.slice(0, 2)).toEqual([`delete:${CAPEX_CONTRACTS.entitySetName}`, `delete:${CAPEX_COSTS.entitySetName}`]);
  });
});

/* ═══════════════════════ committedBefore: a delete that removed nothing (L2 / F5) ══ */

describe("executeSavePlan — committedBefore is exact for deletes that removed nothing", () => {
  /** The fake's deleter, answering `removed` as the wiring does when every id was a confirmed 404. */
  const reporting = (deps: SavePlanDeps, removed: number | undefined): SavePlanDeps => ({
    ...deps,
    deleteMany: async (t, ids, label) => {
      const r = await deps.deleteMany(t, ids, label);
      return removed === undefined ? r : { ...r, removed };
    },
  });
  /** Only (2a) and the two deletes: (2a) fails with 0 committed, so only the deletes can have landed. */
  const deletesAndFailingCost = () => typicalPlan({
    contractUpserts: [], costUpserts: [costRow("k-1", "c-1", 300, false)], totals: new Map(),
  });
  const failingCosts = { failUpsert: { table: CAPEX_COSTS, chunkSize: 1, afterChunks: 0 } };

  it("UT-ACBULK-074 every delete removed 0 rows (all confirmed 404) and the write committed 0: committedBefore is false; removed 1 or omitted: true", async () => {
    const none = fakeDataverse(seed(), failingCosts);
    const e0 = await caught(executeSavePlan(deletesAndFailingCost(), reporting(none.deps, 0)));
    expect(e0.phase).toBe(2);
    expect(e0.committedBefore).toBe(false);
    // The reconcile decision is unchanged: the deletes still count as landed for it (a compare).
    expect(none.calls.some((c) => c.kind === "load")).toBe(false); // totals empty: nothing to read
    expect(e0.reconciled).toBe(true);

    const one = fakeDataverse(seed(), failingCosts);
    expect((await caught(executeSavePlan(deletesAndFailingCost(), reporting(one.deps, 1)))).committedBefore).toBe(true);
    const omitted = fakeDataverse(seed(), failingCosts);
    expect((await caught(executeSavePlan(deletesAndFailingCost(), omitted.deps))).committedBefore).toBe(true);
  });

  it("UT-ACBULK-075 a failed delete whose removedCount is 0 committed nothing; without removedCount, deletedCount decides", async () => {
    const fake = fakeDataverse(seed());
    const refusal = Object.assign(new Error("refused"), { deletedCount: 1, removedCount: 0 });
    const deps: SavePlanDeps = {
      ...fake.deps,
      deleteMany: async (t, ids, label) => {
        if (t === CAPEX_COSTS) throw refusal;
        return { ...(await fake.deps.deleteMany(t, ids, label)), removed: 0 };
      },
    };
    const plan = typicalPlan({
      contractUpserts: [], costUpserts: [], contractDeletes: ["c-gone"],
      totals: new Map([["c-2", 0]]),
    });
    const e = await caught(executeSavePlan(plan, deps));
    expect(e.phase).toBe(3);
    expect(e.cause).toBe(refusal);
    expect(e.committedBefore).toBe(false);
    // Nothing committed: no reconcile read or write (E6 #1, UT-ACBULK-077).
    expect(fake.calls.some((c) => c.kind === "load")).toBe(false);
    // The same refusal without `removedCount`: falls back to `deletedCount`, as before.
    const fake2 = fakeDataverse(seed());
    const e2 = await caught(executeSavePlan(plan, {
      ...fake2.deps,
      deleteMany: async (t, ids, label) => {
        if (t === CAPEX_COSTS) throw Object.assign(new Error("refused"), { deletedCount: 1 });
        return { ...(await fake2.deps.deleteMany(t, ids, label)), removed: 0 };
      },
    }));
    expect(e2.committedBefore).toBe(true);
  });

  it("UT-ACBULK-076 RowsGoneError: deletes beside the check that removed nothing leave committedBefore false", async () => {
    const goneSeed = () => {
      const s = seed();
      delete (s.contracts as Record<string, number>)["c-1"]; // a stored target deleted by someone else
      return s;
    };
    // The deletes find their rows already gone: nothing of this save committed, so the reconcile
    // does not run (it would otherwise force c-2 to its actual 50, a write).
    const fake = fakeDataverse(goneSeed());
    const alreadyGone: SavePlanDeps = {
      ...fake.deps,
      deleteMany: async (_t, ids) => ({ requests: ids.length, removed: 0 }),
    };
    const err = await executeSavePlan(typicalPlan(), alreadyGone).then(() => null, (x: unknown) => x);
    expect(err).toBeInstanceOf(RowsGoneError);
    expect((err as RowsGoneError).committedBefore).toBe(false);
    expect((err as RowsGoneError).requests.reconcile).toBe(0);
    const fake2 = fakeDataverse(goneSeed());
    const err2 = await executeSavePlan(typicalPlan(), fake2.deps).then(() => null, (x: unknown) => x);
    expect((err2 as RowsGoneError).committedBefore).toBe(true);
  });
});
