/**
 * WS-B, deep insert: `deepInsertPlan` (pure) and `executeSavePlan` with `SavePlanDeps.deepInsert`,
 * against an in-memory Dataverse that applies upserts, deep inserts (each one atomic) and deletes,
 * plus a call log. No SDK. The flag-off half (no `deepInsert` dep: today's (1) → (2b) hop) is
 * pinned here at the orchestrator and, request by request, in `addCostSheet.deep.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  CAPEX_CONTRACTS, DEEP_INSERT_MAX_CONTRACTS, DEEP_INSERT_MAX_COSTS, RowsGoneError, SavePlanError,
  deepInsertPlan, executeSavePlan, type SavePlanDeps,
} from "./addCostSheetBulk";
import type { BulkTableInfo, DeepInsertGroup, SaveBuildPlan, UpsertTarget } from "./bulkTypes";
import { OWNING_BU_BIND } from "./odata";
import type { ExistingCost } from "@/features/cost/add-costs-from-table/rules";

/* ═════════════════════════════════════════════════════════════════ fixtures ══ */

const BIND = "vsb_Contract@odata.bind";
const BU = "/businessunits(bu-1)";

const STATS: SaveBuildPlan["stats"] = {
  contractsCreated: 2, contractsUpdated: 1, costsCreated: 3, costsUpdated: 1,
  costsDeleted: 0, contractsDeleted: 0, noOpCells: 0,
};

const cost = (id: string, contractId: string, value: number): ExistingCost =>
  ({ id, contractId, year: 2026, month: 1, cost: value });

/** A NEW cost row as the planner writes it: contract bind and owning-BU bind. */
const newCost = (id: string, contractId: string, value: number): UpsertTarget => ({
  id, isNew: true,
  fields: { contractId, vsb_cost: value, [BIND]: `/${CAPEX_CONTRACTS.entitySetName}(${contractId})`, [OWNING_BU_BIND]: BU },
});

const costUpdate = (id: string, contractId: string, value: number): UpsertTarget =>
  ({ id, isNew: false, fields: { contractId, vsb_cost: value } });

const contractRow = (id: string, total: number, isNew = false): UpsertTarget =>
  ({ id, isNew, fields: isNew ? { vsb_totalcost: total, [OWNING_BU_BIND]: BU } : { vsb_totalcost: total } });

/**
 * Store before: c-1 (100, k-1 = 100). The plan: k-1 → 300 on c-1; new c-a gets k-a1 = 10 and
 * k-a2 = 20; new c-b gets k-b1 = 5. Final totals: c-1 300, c-a 30, c-b 5.
 */
function plan(over: Partial<SaveBuildPlan> = {}): SaveBuildPlan {
  return {
    contractUpserts: [contractRow("c-1", 300), contractRow("c-a", 30, true), contractRow("c-b", 5, true)],
    costUpserts: [costUpdate("k-1", "c-1", 300), newCost("k-a1", "c-a", 10), newCost("k-a2", "c-a", 20), newCost("k-b1", "c-b", 5)],
    costDeletes: [],
    costDeletesIfExist: [],
    contractDeletes: [],
    totals: new Map([["c-1", 300], ["c-a", 30], ["c-b", 5]]),
    stats: STATS,
    ...over,
  };
}

/* ═════════════════════════════════════════════════════════════════ the fake ══ */

interface Call { kind: string; label?: string; step?: string; ids: string[]; fields?: unknown[] }

interface FakeOptions {
  /** A deep insert of these contract ids is refused (nothing of that group lands). */
  refuseDeep?: ReadonlySet<string>;
  /** The deep-insert error reports no `landedIds` (an opaque failure). */
  opaqueDeepError?: boolean;
  /** The host drops the nested rows: the contracts land, their costs do not, and the sender says so. */
  dropNested?: boolean;
}

function fake(seed: { contracts: Record<string, number>; costs: ExistingCost[] }, options: FakeOptions = {}) {
  const contracts = new Map(Object.entries(seed.contracts));
  const costs = new Map(seed.costs.map((c) => [c.id, { ...c }]));
  const calls: Call[] = [];
  const deepGroups: DeepInsertGroup[][] = [];
  const apply = (table: BulkTableInfo, row: UpsertTarget) => {
    if (table === CAPEX_CONTRACTS) contracts.set(row.id, Number(row.fields.vsb_totalcost ?? contracts.get(row.id) ?? 0));
    else {
      const prev = costs.get(row.id);
      costs.set(row.id, {
        id: row.id, contractId: String(row.fields.contractId ?? prev?.contractId), year: 2026, month: 1,
        cost: (row.fields.vsb_cost as number | undefined) ?? prev?.cost ?? null,
      });
    }
  };
  const deps: SavePlanDeps = {
    async upsert(table, rows, label, step) {
      calls.push({ kind: `upsert:${table.entitySetName}`, label, step, ids: rows.map((r) => r.id), fields: rows.map((r) => r.fields) });
      rows.forEach((r) => apply(table, r));
      return { requests: 1 };
    },
    async deleteMany(table, ids, label) {
      calls.push({ kind: `delete:${table.entitySetName}`, label, ids: [...ids] });
      ids.forEach((id) => (table === CAPEX_CONTRACTS ? contracts : costs).delete(id));
      return { requests: ids.length };
    },
    async loadCosts(contractIds) {
      calls.push({ kind: "load", ids: [...contractIds] });
      return [...costs.values()].filter((c) => contractIds.includes(c.contractId)).map((c) => ({ ...c }));
    },
    async existingIds(table, ids) {
      calls.push({ kind: `verify:${table.entitySetName}`, ids: [...ids] });
      const store: ReadonlyMap<string, unknown> = table === CAPEX_CONTRACTS ? contracts : costs;
      return new Set(ids.filter((id) => store.has(id)).map((id) => id.toLowerCase()));
    },
    async deepInsert(groups, label, step) {
      deepGroups.push([...groups]);
      calls.push({ kind: "deep", label, step, ids: groups.map((g) => g.contract.id) });
      const landed: string[] = [];
      const failed: string[] = [];
      for (const g of groups) {
        if (options.refuseDeep?.has(g.contract.id)) { failed.push(g.contract.id); continue; }
        // Atomic: the contract and every nested row, or nothing (unless the host drops them).
        contracts.set(g.contract.id, Number(g.contract.fields.vsb_totalcost));
        if (!options.dropNested) {
          for (const c of g.costs) costs.set(c.id, { id: c.id, contractId: g.contract.id, year: 2026, month: 1, cost: c.fields.vsb_cost as number });
        }
        landed.push(g.contract.id);
      }
      if (failed.length > 0 || options.dropNested) {
        throw options.opaqueDeepError
          ? new Error("opaque deep insert failure")
          : Object.assign(new Error("deep insert failed"), { landedIds: landed, failedIds: failed, childrenMissing: options.dropNested === true });
      }
      return { requests: groups.length };
    },
  };
  return { deps, calls, deepGroups, contracts, costs };
}

const caught = async (p: Promise<unknown>): Promise<SavePlanError> => {
  try {
    await p;
  } catch (error) {
    return error as SavePlanError;
  }
  throw new Error("expected the save to fail");
};

const kinds = (calls: readonly Call[]) => calls.map((c) => c.kind);

/* ═══════════════════════════════════════════════════════════ deepInsertPlan ══ */

describe("deepInsertPlan — which new contracts carry their cost rows", () => {
  const stageB = [newCost("k-a1", "c-a", 10), newCost("k-a2", "c-a", 20), newCost("k-b1", "c-b", 5)];

  it("UT-ACDEEP-001 groups each new contract with its stage-B rows; updates and cost-less new contracts stay flat", () => {
    const lone = contractRow("c-lone", 0, true);
    const split = deepInsertPlan([...plan().contractUpserts, lone], stageB);
    expect(split?.groups.map((g) => [g.contract.id, g.costs.map((c) => c.id)])).toEqual([
      ["c-a", ["k-a1", "k-a2"]], ["c-b", ["k-b1"]],
    ]);
    expect(split?.flatContracts.map((c) => c.id)).toEqual(["c-1", "c-lone"]);
  });

  it("UT-ACDEEP-002 a nested row loses its contract bind and keeps its id, its owning-BU bind and every other field", () => {
    const nested = deepInsertPlan(plan().contractUpserts, stageB)?.groups.flatMap((g) => g.costs) ?? [];
    expect(nested).toHaveLength(3);
    for (const row of nested) {
      expect(row.isNew).toBe(true);
      expect(row.fields).not.toHaveProperty(BIND);
      expect(row.fields[OWNING_BU_BIND]).toBe(BU); // CONVENTIONS rule 4
      expect(Object.isFrozen(row.fields)).toBe(true);
    }
    expect(nested.map((r) => [r.id, r.fields.vsb_cost])).toEqual([["k-a1", 10], ["k-a2", 20], ["k-b1", 5]]);
    // The planner's own targets are untouched.
    expect(stageB[0]?.fields[BIND]).toBe(`/${CAPEX_CONTRACTS.entitySetName}(c-a)`);
  });

  it("UT-ACDEEP-003 more deep-insert contracts than DEEP_INSERT_MAX_CONTRACTS keeps today's path; exactly the limit does not", () => {
    const n = DEEP_INSERT_MAX_CONTRACTS;
    const many = (count: number) => ({
      contracts: Array.from({ length: count }, (_, i) => contractRow(`c-${i}`, 1, true)),
      costs: Array.from({ length: count }, (_, i) => newCost(`k-${i}`, `c-${i}`, 1)),
    });
    const atLimit = many(n);
    expect(deepInsertPlan(atLimit.contracts, atLimit.costs)?.groups).toHaveLength(n);
    const over = many(n + 1);
    expect(deepInsertPlan(over.contracts, over.costs)).toBeUndefined();
  });

  it("UT-ACDEEP-004 a contract with more than DEEP_INSERT_MAX_COSTS rows keeps today's path for the whole plan", () => {
    const rows = (count: number) => Array.from({ length: count }, (_, i) => newCost(`k-${i}`, "c-a", 1));
    const contracts = [contractRow("c-a", 1, true)];
    expect(deepInsertPlan(contracts, rows(DEEP_INSERT_MAX_COSTS))?.groups[0]?.costs).toHaveLength(DEEP_INSERT_MAX_COSTS);
    expect(deepInsertPlan(contracts, rows(DEEP_INSERT_MAX_COSTS + 1))).toBeUndefined();
  });

  it("UT-ACDEEP-005 nothing in stage B, or a stage-B row that is not new, keeps today's path", () => {
    expect(deepInsertPlan(plan().contractUpserts, [])).toBeUndefined();
    expect(deepInsertPlan(plan().contractUpserts, [...stageB, costUpdate("k-x", "c-a", 1)])).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════ executeSavePlan ══ */

describe("executeSavePlan — (1') deep insert", () => {
  it("UT-ACDEEP-006 with deepInsert: (1) gets only the flat rows, (1') the new contracts with their costs, and no (2b) is sent", async () => {
    const f = fake({ contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] });
    const result = await executeSavePlan(plan(), { ...f.deps, verifyUpserts: false });
    const contractCall = f.calls.find((c) => c.kind === `upsert:${CAPEX_CONTRACTS.entitySetName}`);
    expect(contractCall?.ids).toEqual(["c-1"]);
    const costCalls = f.calls.filter((c) => c.kind === "upsert:vsb_capexcosts");
    expect(costCalls.map((c) => [c.step, c.ids])).toEqual([["upsert costs (existing contracts)", ["k-1"]]]);
    expect(f.calls.find((c) => c.kind === "deep")).toMatchObject({
      label: "upsert contracts", step: "upsert new contracts with their costs (deep insert)", ids: ["c-a", "c-b"],
    });
    expect([...f.costs.keys()].sort()).toEqual(["k-1", "k-a1", "k-a2", "k-b1"]);
    expect(f.contracts.get("c-a")).toBe(30);
    // (1') counts as contracts: 1 flat request + 2 deep inserts.
    expect(result.requests).toMatchObject({ contracts: 3, costs: 1, total: 4 });
    expect(result.timings.contractsDeep).toBeTypeOf("number");
    expect(result.timings.costsB).toBeUndefined();
  });

  it("UT-ACDEEP-007 (1), (1') and (2a) start together: (1') does not wait for (1)", async () => {
    const order: string[] = [];
    let releaseContracts!: () => void;
    const contractsHeld = new Promise<void>((r) => { releaseContracts = r; });
    const f = fake({ contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] });
    const deps: SavePlanDeps = {
      ...f.deps,
      verifyUpserts: false,
      upsert: async (table, rows, label, step) => {
        order.push(`start ${table.entitySetName}`);
        if (table === CAPEX_CONTRACTS) await contractsHeld;
        return f.deps.upsert(table, rows, label, step);
      },
      deepInsert: async (groups, label, step) => {
        order.push("start deep");
        const r = await (f.deps.deepInsert as NonNullable<SavePlanDeps["deepInsert"]>)(groups, label, step);
        order.push("deep done");
        return r;
      },
    };
    const saving = executeSavePlan(plan(), deps);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual([`start ${CAPEX_CONTRACTS.entitySetName}`, "start deep", "start vsb_capexcosts", "deep done"]);
    releaseContracts();
    await saving;
  });

  it("UT-ACDEEP-008 a partly failed (1'): phase-1 SavePlanError, the landed contract compared, the failed one left out, totals reconciled", async () => {
    const f = fake({ contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] }, { refuseDeep: new Set(["c-b"]) });
    const error = await caught(executeSavePlan(plan(), { ...f.deps, verifyUpserts: false }));
    expect(error).toBeInstanceOf(SavePlanError);
    expect(error.phase).toBe(1);
    expect(error.failures.map((x) => x.phase)).toEqual([1]);
    expect(error.committedBefore).toBe(true);
    expect(error.reconciled).toBe(true);
    expect(error.unverifiedContractIds).toEqual([]);
    const load = f.calls.find((c) => c.kind === "load");
    expect(load?.ids.sort()).toEqual(["c-1", "c-a"]); // c-b took its nested row with it
    expect(f.calls.some((c) => c.label === "reconcile totals")).toBe(false); // every landed total is true
    expect(f.costs.has("k-b1")).toBe(false);
  });

  it("UT-ACDEEP-009 a (1') failure that names no landed contracts leaves them unverified, never written", async () => {
    const f = fake({ contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] }, { refuseDeep: new Set(["c-b"]), opaqueDeepError: true });
    const error = await caught(executeSavePlan(plan(), { ...f.deps, verifyUpserts: false }));
    expect(error.phase).toBe(1);
    expect(error.reconciled).toBe(false);
    expect([...error.unverifiedContractIds].sort()).toEqual(["c-a", "c-b"]);
    expect(f.calls.find((c) => c.kind === "load")?.ids).toEqual(["c-1"]);
  });

  it("UT-ACDEEP-010 a (1') that landed nothing, with nothing else in the plan, commits nothing and reconciles nothing", async () => {
    const only = plan({
      contractUpserts: [contractRow("c-a", 30, true)],
      costUpserts: [newCost("k-a1", "c-a", 10), newCost("k-a2", "c-a", 20)],
      totals: new Map([["c-a", 30]]),
    });
    const f = fake({ contracts: {}, costs: [] }, { refuseDeep: new Set(["c-a"]) });
    const error = await caught(executeSavePlan(only, { ...f.deps, verifyUpserts: false }));
    expect(error.phase).toBe(1);
    expect(error.committedBefore).toBe(false);
    expect(error.reconciled).toBe(true);
    expect(kinds(f.calls)).toEqual(["deep"]);
  });

  it("UT-ACDEEP-011 nested rows that did not land (childrenMissing): the landed contract's total is rewritten from what is there", async () => {
    const f = fake({ contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] }, { dropNested: true });
    const error = await caught(executeSavePlan(plan(), { ...f.deps, verifyUpserts: false }));
    expect(error.phase).toBe(1);
    expect(error.reconciled).toBe(true);
    const fix = f.calls.find((c) => c.label === "reconcile totals");
    expect(fix?.ids.sort()).toEqual(["c-a", "c-b"]);
    expect(f.contracts.get("c-a")).toBe(0);
    expect(f.contracts.get("c-b")).toBe(0);
    expect(f.contracts.get("c-1")).toBe(300);
  });

  it("UT-ACDEEP-012 a retry whose new contract already exists sends it as an update: no deep insert, its new costs go to (2a) with the same ids", async () => {
    // An earlier attempt created c-a (and nothing else); the retry reuses its ids (D51 §3a).
    const f = fake({ contracts: { "c-1": 100, "c-a": 30 }, costs: [cost("k-1", "c-1", 100)] });
    const retry = plan({
      contractUpserts: [contractRow("c-1", 300), contractRow("c-a", 30, true)],
      costUpserts: [costUpdate("k-1", "c-1", 300), newCost("k-a1", "c-a", 10), newCost("k-a2", "c-a", 20)],
      totals: new Map([["c-1", 300], ["c-a", 30]]),
    });
    await executeSavePlan(retry, { ...f.deps, mayExist: () => true });
    expect(f.calls.some((c) => c.kind === "deep")).toBe(false);
    const contractCall = f.calls.find((c) => c.kind === `upsert:${CAPEX_CONTRACTS.entitySetName}`);
    expect(contractCall?.ids).toEqual(["c-1", "c-a"]);
    expect(contractCall?.fields?.[1]).not.toHaveProperty(OWNING_BU_BIND); // a flipped update never moves its BU
    const stageA = f.calls.find((c) => c.step === "upsert costs (existing contracts)");
    expect(stageA?.ids).toEqual(["k-1", "k-a1", "k-a2"]);
  });

  it("UT-ACDEEP-013 above the threshold the plan keeps the (1) → (2b) hop even with deepInsert given", async () => {
    const n = DEEP_INSERT_MAX_CONTRACTS + 1;
    const big = plan({
      contractUpserts: Array.from({ length: n }, (_, i) => contractRow(`c-${i}`, 1, true)),
      costUpserts: Array.from({ length: n }, (_, i) => newCost(`k-${i}`, `c-${i}`, 1)),
      totals: new Map(Array.from({ length: n }, (_, i) => [`c-${i}`, 1] as [string, number])),
    });
    const f = fake({ contracts: {}, costs: [] });
    await executeSavePlan(big, { ...f.deps, verifyUpserts: false });
    expect(f.calls.some((c) => c.kind === "deep")).toBe(false);
    expect(f.calls.map((c) => c.step ?? c.label)).toEqual(["upsert contracts", "upsert costs (new contracts)"]);
  });

  it("UT-ACDEEP-014 without deepInsert the calls are exactly today's: (1) with every contract, then (2b)", async () => {
    const f = fake({ contracts: { "c-1": 100 }, costs: [cost("k-1", "c-1", 100)] });
    const { deepInsert: _unused, ...withoutDeep } = f.deps;
    const result = await executeSavePlan(plan(), { ...withoutDeep, verifyUpserts: false });
    expect(f.calls.map((c) => [c.kind, c.step ?? c.label, c.ids])).toEqual([
      [`upsert:${CAPEX_CONTRACTS.entitySetName}`, "upsert contracts", ["c-1", "c-a", "c-b"]],
      ["upsert:vsb_capexcosts", "upsert costs (existing contracts)", ["k-1"]],
      ["upsert:vsb_capexcosts", "upsert costs (new contracts)", ["k-a1", "k-a2", "k-b1"]],
    ]);
    // The new contracts' rows still carry their contract bind on this path.
    const firstNew = (f.calls[2]?.fields ?? [])[0] as Record<string, unknown> | undefined;
    expect(firstNew?.[BIND]).toBe(`/${CAPEX_CONTRACTS.entitySetName}(c-a)`);
    expect(result.timings.contractsDeep).toBeUndefined();
  });

  it("UT-ACDEEP-015 rows gone in phase 0: RowsGoneError and no deep insert is sent", async () => {
    const f = fake({ contracts: {}, costs: [] }); // c-1 and k-1 were deleted by someone else
    await expect(executeSavePlan(plan(), f.deps)).rejects.toBeInstanceOf(RowsGoneError);
    expect(f.deepGroups).toHaveLength(0);
  });
});
