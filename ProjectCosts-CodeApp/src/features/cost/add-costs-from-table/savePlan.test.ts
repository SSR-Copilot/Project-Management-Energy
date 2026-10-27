import { describe, expect, it } from "vitest";
import {
  buildSavePlan, contractFields, contractIdentityKey, costIdentityKey, SheetConflictError,
  type SavePlanInput,
} from "./savePlan";
import {
  CHOICE, contractUpserts, costWrites, recomputeContractTotal,
  type ContractUpsert, type CostWrite, type ExistingContract, type ExistingCost, type SheetRow,
} from "./rules";

const emptyMonths = (): (number | null)[] => new Array(12).fill(null);

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  rowId: "r1", accountNumber: "80000_0", accountName: "Turbine",
  description: "My Cost", year: 2026, costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes",
  months: emptyMonths(), subAccountId: "sub-1", projectContractId: null,
  ...over,
});

const contract = (over: Partial<ExistingContract> = {}): ExistingContract => ({
  id: "c-1", name: "My Cost", subaccountId: "sub-1", isStandardContract: false,
  initialContractSource: CHOICE.initialContractSource.pcf,
  distribution: CHOICE.distributionType.individual,
  distributionScheme: CHOICE.distributionScheme.absoluteValues,
  isEditedFromPcf: false, costType: CHOICE.costPaidType.devCo,
  depreciation: true, applyVat: true,
  ...over,
});

/** A contract the sheet's upsert would leave exactly as stored (Yes/Yes/DevCo rows). */
const settled = (over: Partial<ExistingContract> = {}): ExistingContract =>
  contract({ isEditedFromPcf: true, ...over });

const cost = (over: Partial<ExistingCost> = {}): ExistingCost => ({
  id: "k-1", contractId: "c-1", year: 2026, month: 1, cost: 100, ...over,
});

const months = (values: Record<number, number | null>): (number | null)[] => {
  const out = emptyMonths();
  for (const [m, v] of Object.entries(values)) out[Number(m) - 1] = v;
  return out;
};

const counter = (prefix = "id") => {
  let n = 0;
  return () => { n += 1; return `${prefix}-${n}`; };
};

const input = (over: Partial<SavePlanInput> = {}): SavePlanInput => ({
  projectId: "p-1", changedRows: [], existingContracts: [], existingCosts: [], contractDeleteIds: [],
  ...over,
});

const BU = "owningbusinessunit@odata.bind";

describe("contractFields", () => {
  it("UT-ACSAVE-001 carries exactly the legacy contractPayload columns", () => {
    const u: ContractUpsert = {
      contractId: null, subaccountId: "sub-1", name: "X", applyVat: true, depreciation: false,
      costType: CHOICE.costPaidType.spv, distribution: CHOICE.distributionType.individual,
      distributionScheme: CHOICE.distributionScheme.absoluteValues, isEditedFromPcf: true,
      initialContractSource: CHOICE.initialContractSource.pcf,
    };
    expect(contractFields(u)).toEqual({
      vsb_name: "X", vsb_applyvat: true, vsb_depreciation: false,
      vsb_costtype: CHOICE.costPaidType.spv, vsb_distribution: CHOICE.distributionType.individual,
      vsb_distributionscheme: CHOICE.distributionScheme.absoluteValues,
      vsb_iseditedfrompcf: true, vsb_initialcontractsource: CHOICE.initialContractSource.pcf,
    });
  });
});

describe("buildSavePlan", () => {
  it("UT-ACSAVE-002 creates a new contract and binds its costs to the generated id", () => {
    const plan = buildSavePlan(input({
      changedRows: [row({ months: months({ 1: 10, 2: 20.4 }) })],
    }), { newId: counter() });

    expect(plan.contractUpserts).toHaveLength(1);
    const [c] = plan.contractUpserts;
    expect(c).toMatchObject({ id: "id-1", isNew: true });
    expect(c?.fields).toMatchObject({
      vsb_name: "My Cost",
      "vsb_Project@odata.bind": "/vsb_projects(p-1)",
      "vsb_Account@odata.bind": "/vsb_capexaccountlists(sub-1)",
      vsb_totalcost: 30,
    });
    expect(plan.costUpserts.map((u) => u.id)).toEqual(["id-2", "id-3"]);
    for (const u of plan.costUpserts) {
      expect(u.isNew).toBe(true);
      expect(u.fields["vsb_Contract@odata.bind"]).toBe("/vsb_capexprojectcontracts(id-1)");
    }
    expect(plan.costUpserts[1]?.fields).toMatchObject({ vsb_cost: 20.4, vsb_year: 2026, vsb_month: 2 });
    expect(plan.totals.get("id-1")).toBe(30);
    expect(plan.stats).toMatchObject({ contractsCreated: 1, contractsUpdated: 0, costsCreated: 2 });
  });

  it("UT-ACSAVE-003 threads an existing group id onto a null-id row of the same group", () => {
    const plan = buildSavePlan(input({
      changedRows: [
        row({ rowId: "a", year: 2027, months: months({ 1: 5 }) }),
        row({ rowId: "b", projectContractId: "c-1", months: months({ 1: 7 }) }),
      ],
      existingContracts: [contract()],
    }), { newId: counter() });
    expect(plan.contractUpserts.map((c) => c.id)).toEqual(["c-1"]);
    expect(plan.costUpserts.every((u) => u.fields["vsb_Contract@odata.bind"] === "/vsb_capexprojectcontracts(c-1)"))
      .toBe(true);
    expect(plan.totals.get("c-1")).toBe(12);
  });

  it("UT-ACSAVE-004 an existing contract with a field change gets its columns plus its total", () => {
    const plan = buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", costPaidBy: "SPV", months: months({ 1: 100, 2: 50 }) })],
      existingContracts: [settled()],
      existingCosts: [cost(), cost({ id: "k-2", month: 2, cost: 50 })],
    }), { newId: counter() });
    expect(plan.contractUpserts).toEqual([{
      id: "c-1", isNew: false,
      fields: { ...contractFields(contractUpserts(
        [row({ projectContractId: "c-1", costPaidBy: "SPV" })], [settled()],
      )[0] as ContractUpsert), vsb_totalcost: 150 },
    }]);
    expect(plan.contractUpserts[0]?.fields).not.toHaveProperty("vsb_Project@odata.bind");
    expect(plan.stats.contractsUpdated).toBe(1);
  });

  it("UT-ACSAVE-005 a contract whose columns already match is a total-only target", () => {
    const plan = buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", months: months({ 1: 300 }) })],
      existingContracts: [settled()],
      existingCosts: [cost()],
    }), { newId: counter() });
    expect(plan.contractUpserts).toEqual([{ id: "c-1", isNew: false, fields: { vsb_totalcost: 300 } }]);
    expect(plan.costUpserts).toEqual([{ id: "k-1", isNew: false, fields: { vsb_cost: 300 } }]);
  });

  it("UT-ACSAVE-006 a contract reached only through a non-representative row still gets its total", () => {
    // Group "My Cost": the LAST row (null id) is the representative, so a new contract is made,
    // while the first row's costs stay on c-1 — which contractUpserts never names.
    const plan = buildSavePlan(input({
      changedRows: [
        row({ rowId: "a", projectContractId: "c-1", year: 2025, months: months({ 1: 40 }) }),
        row({ rowId: "b", year: 2026, months: months({ 1: 9 }) }),
      ],
      existingContracts: [contract()],
      existingCosts: [cost({ year: 2025, cost: 10 }), cost({ id: "k-2", year: 2024, cost: 5 })],
    }), { newId: counter() });
    expect(plan.contractUpserts.map((c) => [c.id, c.isNew, c.fields])).toEqual([
      ["id-1", true, expect.objectContaining({ vsb_totalcost: 9 })],
      ["c-1", false, { vsb_totalcost: 45 }],
    ]);
  });

  it("UT-ACSAVE-007 skips an unchanged existing cell and counts it", () => {
    const plan = buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", months: months({ 1: 100, 2: 60 }) })],
      existingContracts: [settled()],
      existingCosts: [cost(), cost({ id: "k-2", month: 2, cost: 50 })],
    }), { newId: counter() });
    expect(plan.costUpserts.map((u) => u.id)).toEqual(["k-2"]);
    expect(plan.stats.noOpCells).toBe(1);
    expect(plan.stats.costsUpdated).toBe(1);
    expect(plan.totals.get("c-1")).toBe(160);
  });

  it("UT-ACSAVE-008 a blanked month with a stored row becomes a cost delete", () => {
    const plan = buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", months: months({ 2: 50 }) })],
      existingContracts: [settled()],
      existingCosts: [cost(), cost({ id: "k-2", month: 2, cost: 50 })],
    }), { newId: counter() });
    expect(plan.costDeletes).toEqual(["k-1"]);
    expect(plan.costUpserts).toEqual([]);
    expect(plan.stats).toMatchObject({ costsDeleted: 1, noOpCells: 1 });
  });

  it("UT-ACSAVE-009 deletion wins: nothing is written or listed under a doomed contract", () => {
    const plan = buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", months: months({ 2: 70 }) }),
        row({ rowId: "r2", description: "Other", projectContractId: "c-2", months: months({ 1: 1 }) }),
      ],
      existingContracts: [contract(), contract({ id: "c-2", name: "Other" })],
      existingCosts: [cost(), cost({ id: "k-2", contractId: "c-2", cost: 3 })],
      contractDeleteIds: ["c-1", "c-1"],
    }), { newId: counter() });
    expect(plan.contractDeletes).toEqual(["c-1"]);
    expect(plan.contractUpserts.map((c) => c.id)).toEqual(["c-2"]);
    expect(plan.costDeletes).toEqual([]);
    expect(plan.costUpserts.map((u) => u.id)).toEqual(["k-2"]);
    expect(plan.totals.has("c-1")).toBe(false);
    expect(plan.stats.contractsDeleted).toBe(1);
  });

  it("UT-ACSAVE-010 totals reflect stored costs, upserts and deletes together", () => {
    const plan = buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", months: months({ 2: 25.5, 3: 4 }) }),
        row({ rowId: "r2", projectContractId: "c-1", year: 2027, months: emptyMonths() }),
      ],
      existingContracts: [settled()],
      existingCosts: [
        cost({ id: "k-1", month: 1, cost: 100 }),   // blanked → deleted
        cost({ id: "k-2", month: 2, cost: 10 }),    // updated to 25.5
        cost({ id: "k-3", year: 2024, cost: 7 }),   // untouched history
        cost({ id: "k-4", year: 2027, month: 5, cost: 1000 }), // blanked row → deleted
      ],
    }), { newId: counter() });
    expect(plan.costDeletes).toEqual(["k-1", "k-4"]);
    expect(plan.totals.get("c-1")).toBe(Math.round(25.5 + 4 + 7));
    expect(plan.contractUpserts[0]?.fields.vsb_totalcost).toBe(37);
  });

  it("UT-ACSAVE-011 refuses two upserts of one contract id", () => {
    expect(() => buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", description: "A" }),
        row({ rowId: "r2", projectContractId: "c-1", description: "B", year: 2027 }),
      ],
      existingContracts: [contract()],
    }), { newId: counter() })).toThrow(/upserted twice/);
  });

  it("UT-ACSAVE-012 refuses two rows writing one (contract, year, month)", () => {
    expect(() => buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", months: months({ 1: 1 }) }),
        row({ rowId: "r2", projectContractId: "c-1", months: months({ 1: 2 }) }),
      ],
      existingContracts: [contract()],
    }), { newId: counter() })).toThrow(/more than one sheet row writing 2026-1/);
  });

  it("UT-ACSAVE-013 refuses a newId that repeats or collides with a stored id", () => {
    expect(() => buildSavePlan(input({ changedRows: [row({ months: months({ 1: 1 }) })] }), { newId: () => "same" }))
      .toThrow(/already in use/);
    expect(() => buildSavePlan(input({
      changedRows: [row({ months: months({ 1: 1 }) })], existingCosts: [cost({ id: "dup" })],
    }), { newId: () => "dup" })).toThrow(/already in use/);
  });

  it("UT-ACSAVE-014 refuses two groups resolving to one sub-account and name", () => {
    expect(() => buildSavePlan(input({
      changedRows: [
        row({ accountName: "A" }),
        row({ rowId: "r2", accountName: "B" }),
      ],
    }), { newId: counter() })).toThrow(/two contract groups/);
  });

  it("UT-ACSAVE-015 the owning-BU bind goes on new rows only", () => {
    const plan = buildSavePlan(input({
      owningBusinessUnitId: "bu-1",
      changedRows: [
        row({ months: months({ 1: 1 }) }),
        row({ rowId: "r2", description: "Old", projectContractId: "c-1", months: months({ 1: 2, 2: 3 }) }),
      ],
      existingContracts: [contract({ name: "Old" })],
      existingCosts: [cost()],
    }), { newId: counter() });
    const byId = new Map([...plan.contractUpserts, ...plan.costUpserts].map((t) => [t.id, t]));
    expect(byId.get("id-1")?.fields[BU]).toBe("/businessunits(bu-1)");
    expect(byId.get("c-1")?.fields).not.toHaveProperty(BU);
    expect(byId.get("k-1")?.fields).not.toHaveProperty(BU);
    for (const t of plan.costUpserts.filter((t) => t.isNew)) expect(t.fields[BU]).toBe("/businessunits(bu-1)");

    const noBu = buildSavePlan(input({ changedRows: [row({ months: months({ 1: 1 }) })] }), { newId: counter() });
    for (const t of [...noBu.contractUpserts, ...noBu.costUpserts]) expect(t.fields).not.toHaveProperty(BU);
  });

  it("UT-ACSAVE-016 is deterministic for an injected newId and returns frozen arrays", () => {
    const make = () => buildSavePlan(input({
      changedRows: [
        row({ months: months({ 3: 3, 1: 1 }) }),
        row({ rowId: "r2", description: "Two", months: months({ 12: 12 }) }),
      ],
    }), { newId: counter("g") });
    const a = make();
    expect(make()).toEqual(a);
    expect(a.contractUpserts.map((c) => c.id)).toEqual(["g-1", "g-2"]);
    expect(a.costUpserts.map((c) => [c.id, c.fields.vsb_month])).toEqual([["g-3", 1], ["g-4", 3], ["g-5", 12]]);
    expect(Object.isFrozen(a.contractUpserts)).toBe(true);
    expect(Object.isFrozen(a.costUpserts)).toBe(true);
    expect(Object.isFrozen(a.costDeletes)).toBe(true);
    expect(Object.isFrozen(a.contractDeletes)).toBe(true);
  });

  it("UT-ACSAVE-017 plans 10,000 stored costs and 800 changed rows well inside a second", () => {
    const contracts: ExistingContract[] = [];
    const costs: ExistingCost[] = [];
    const rows: SheetRow[] = [];
    for (let c = 0; c < 200; c += 1) {
      const id = `c-${c}`;
      contracts.push(contract({ id, name: `N${c}`, subaccountId: `s-${c % 20}` }));
      for (let y = 0; y < 5; y += 1) {
        for (let m = 1; m <= 10; m += 1) costs.push(cost({ id: `k-${c}-${y}-${m}`, contractId: id, year: 2024 + y, month: m, cost: m }));
      }
      for (let y = 0; y < 4; y += 1) {
        rows.push(row({
          rowId: `r-${c}-${y}`, accountNumber: `A${c % 20}`, accountName: `S${c % 20}`, description: `N${c}`,
          subAccountId: `s-${c % 20}`, projectContractId: id, year: 2024 + y,
          months: Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? null : i + 2)),
        }));
      }
    }
    expect(costs).toHaveLength(10_000);
    expect(rows).toHaveLength(800);
    const started = performance.now();
    const plan = buildSavePlan(input({ changedRows: rows, existingContracts: contracts, existingCosts: costs }), { newId: counter() });
    const elapsed = performance.now() - started;
    console.info(`UT-ACSAVE-017 buildSavePlan: ${elapsed.toFixed(1)} ms`);
    expect(plan.contractUpserts).toHaveLength(200);
    expect(elapsed).toBeLessThan(1000);
  });
});

/* ═══════════════════════════════════════════ stable ids, pending ids, conflicts ══ */

/** The caller's cross-attempt id cache: same key, same id; a new key gets the next id. */
const cachingNewId = (cache: Map<string, string>, prefix = "g") => {
  let n = 0;
  return (key: string): string => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    n += 1;
    const id = `${prefix}-${n}`;
    cache.set(key, id);
    return id;
  };
};

/** Records every key `newId` is asked for. */
const recordingNewId = () => {
  const keys: string[] = [];
  const next = counter("rec");
  return { keys, newId: (key: string) => { keys.push(key); return next(); } };
};

describe("buildSavePlan: stable ids across a retry", () => {
  const sheet = () => input({
    changedRows: [
      row({ months: months({ 1: 10, 2: 20 }) }),                                  // new contract
      row({ rowId: "r2", description: "Old", projectContractId: "c-1", months: months({ 3: 5 }) }),
    ],
    existingContracts: [contract({ name: "Old" })],
  });

  it("UT-ACSAVE-020 the key builders have the documented shapes", () => {
    expect(contractIdentityKey("sub-1", "My Cost")).toBe("contract:sub-1|My Cost");
    expect(contractIdentityKey(null, "My Cost")).toBe("contract:null|My Cost");
    expect(costIdentityKey("c-1", 2026, 3)).toBe("cost:c-1|2026|3");
    expect(costIdentityKey("contract:sub-1|My Cost", 2026, 12)).toBe("cost:contract:sub-1|My Cost|2026|12");
  });

  it("UT-ACSAVE-021 the same sheet planned twice with one shared cache gets the same ids", () => {
    const cache = new Map<string, string>();
    const first = buildSavePlan(sheet(), { newId: cachingNewId(cache, "a") });
    // A second attempt with a DIFFERENT generator: only the cache can make the ids agree.
    const second = buildSavePlan(sheet(), { newId: cachingNewId(cache, "b") });
    expect(second.contractUpserts.map((t) => t.id)).toEqual(first.contractUpserts.map((t) => t.id));
    expect(second.costUpserts.map((t) => t.id)).toEqual(first.costUpserts.map((t) => t.id));
    expect(second).toEqual(first);
    expect([...cache.values()].every((id) => id.startsWith("a-"))).toBe(true);
  });

  it("UT-ACSAVE-022 every newId call in one plan gets a distinct key, so distinct ids", () => {
    const rec = recordingNewId();
    const plan = buildSavePlan(sheet(), { newId: rec.newId });
    expect(rec.keys).toEqual([
      "contract:sub-1|My Cost",
      "cost:contract:sub-1|My Cost|2026|1",
      "cost:contract:sub-1|My Cost|2026|2",
      "cost:c-1|2026|3",
    ]);
    expect(new Set(rec.keys).size).toBe(rec.keys.length);
    const ids = [...plan.contractUpserts, ...plan.costUpserts].filter((t) => t.isNew).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("UT-ACSAVE-023 a new contract's cost keys use its identity key, not its issued id", () => {
    // Whatever id the contract is issued, its costs are asked for under the same keys.
    const keysWith = (prefix: string) => {
      const keys: string[] = [];
      const next = counter(prefix);
      buildSavePlan(input({ changedRows: [row({ months: months({ 4: 1 }) })] }), {
        newId: (k) => { keys.push(k); return next(); },
      });
      return keys;
    };
    expect(keysWith("x")).toEqual(keysWith("y"));
    expect(keysWith("x")[1]).toBe(costIdentityKey(contractIdentityKey("sub-1", "My Cost"), 2026, 4));
  });

  it("UT-ACSAVE-024 a pending id for a now-blank cell goes to costDeletesIfExist only", () => {
    const pendingIds = new Map([
      [costIdentityKey("c-1", 2026, 2), "pend-1"],                  // blank under an existing contract
      [costIdentityKey(contractIdentityKey("sub-1", "New"), 2026, 5), "pend-2"], // blank under a new one
      [contractIdentityKey("sub-1", "New"), "pend-c"],              // contract keys are ignored
    ]);
    const plan = buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", months: months({ 1: 100 }) }),
        row({ rowId: "r2", description: "New", months: months({ 1: 7 }) }),
      ],
      existingContracts: [settled()],
      existingCosts: [cost()],
      pendingIds,
    }), { newId: cachingNewId(new Map(pendingIds)) });
    expect(plan.costDeletesIfExist).toEqual(["pend-1", "pend-2"]);
    expect(plan.costDeletes).toEqual([]);
    expect(plan.costUpserts.map((t) => t.id)).not.toContain("pend-1");
    expect(Object.isFrozen(plan.costDeletesIfExist)).toBe(true);
    // The new contract reuses its cached id; c-1 is touched so its total drops the pending row.
    expect(plan.contractUpserts.map((t) => t.id)).toEqual(["c-1", "pend-c"]);
    expect(plan.totals.get("c-1")).toBe(100);
  });

  it("UT-ACSAVE-025 a pending id this plan writes, stores, or cannot place is not a delete", () => {
    const pendingIds = new Map([
      [costIdentityKey("c-1", 2026, 1), "pend-w"],                  // written again → upsert updates it
      [costIdentityKey("c-1", 2026, 9), "k-9"],                     // in the snapshot → stored path owns it
      [costIdentityKey("c-2", 2026, 1), "pend-d"],                  // doomed contract → the cascade
      [costIdentityKey("c-x", 2026, 1), "pend-x"],                  // not in the snapshot
      [costIdentityKey(contractIdentityKey("sub-1", "Gone"), 2026, 1), "pend-g"], // removed new contract (CAVEAT)
    ]);
    const plan = buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", months: months({ 1: 4, 9: 9 }) })],
      existingContracts: [settled(), contract({ id: "c-2", name: "Two" })],
      existingCosts: [cost({ id: "k-9", month: 9, cost: 9 })],
      contractDeleteIds: ["c-2"],
      pendingIds,
    }), { newId: cachingNewId(new Map(pendingIds)) });
    expect(plan.costUpserts.map((t) => t.id)).toEqual(["pend-w"]);
    expect(plan.costDeletesIfExist).toEqual([]);
    expect(plan.costDeletes).toEqual([]);
  });

  it("UT-ACSAVE-026 every plan carries an empty frozen costDeletesIfExist by default", () => {
    const plan = buildSavePlan(input({ changedRows: [row({ months: months({ 1: 1 }) })] }), { newId: counter() });
    expect(plan.costDeletesIfExist).toEqual([]);
    expect(Object.isFrozen(plan.costDeletesIfExist)).toBe(true);
  });
});

describe("buildSavePlan: ambiguous sheets throw SheetConflictError", () => {
  const conflict = (fn: () => unknown): SheetConflictError => {
    try { fn(); } catch (e) { if (e instanceof SheetConflictError) return e; throw e; }
    throw new Error("expected a SheetConflictError");
  };

  it("UT-ACSAVE-027 a duplicate (contract, year, month) names the description, account and year", () => {
    const e = conflict(() => buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", months: months({ 1: 1 }) }),
        row({ rowId: "r2", projectContractId: "c-1", months: months({ 1: 2 }) }),
      ],
      existingContracts: [contract()],
    }), { newId: counter() }));
    expect(e.detail).toBe('"My Cost" under account "Turbine" has more than one row for 2026.');
    expect(e.message).toContain(e.detail);
    expect(e.detail).not.toContain("c-1");
  });

  it("UT-ACSAVE-028 two groups on one sub-account and name name both accounts", () => {
    const e = conflict(() => buildSavePlan(input({
      changedRows: [row({ accountName: "A" }), row({ rowId: "r2", accountName: "B" })],
    }), { newId: counter() }));
    expect(e.detail).toBe('"My Cost" is listed under "A" and "B", which are the same sub-account.');
    expect(e.detail).not.toContain("sub-1");
  });

  it("UT-ACSAVE-029 one contract id upserted twice names both descriptions and the account", () => {
    const e = conflict(() => buildSavePlan(input({
      changedRows: [
        row({ projectContractId: "c-1", description: "A" }),
        row({ rowId: "r2", projectContractId: "c-1", description: "B", year: 2027 }),
      ],
      existingContracts: [contract()],
    }), { newId: counter() }));
    expect(e.detail).toBe('"A" and "B" under account "Turbine" point to the same saved cost item.');
    expect(e.detail).not.toContain("c-1");
  });

  it("UT-ACSAVE-030 a repeating newId stays a plain Error, not a sheet conflict", () => {
    let thrown: unknown;
    try {
      buildSavePlan(input({ changedRows: [row({ months: months({ 1: 1 }) })] }), { newId: () => "same" });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(SheetConflictError);
  });
});

describe("buildSavePlan: owning BU on update paths", () => {
  it("UT-ACSAVE-031 a total-only touched existing contract carries NO owning-BU bind", () => {
    // c-1 is the group's representative and settled (total-only); c-2 is reached only through a
    // non-representative row (the `touch` path). Neither may carry the bind (rule 4).
    const plan = buildSavePlan(input({
      owningBusinessUnitId: "bu-1",
      changedRows: [
        row({ projectContractId: "c-1", months: months({ 1: 300 }) }),
        row({ rowId: "r2", description: "Two", projectContractId: "c-2", year: 2025, months: months({ 1: 4 }) }),
        row({ rowId: "r3", description: "Two", projectContractId: "c-3", months: months({ 1: 5 }) }),
      ],
      existingContracts: [settled(), settled({ id: "c-2", name: "Two" }), settled({ id: "c-3", name: "Two" })],
      existingCosts: [cost()],
    }), { newId: counter() });
    const byId = new Map(plan.contractUpserts.map((t) => [t.id, t]));
    expect(byId.get("c-1")?.fields).toEqual({ vsb_totalcost: 300 });
    expect(byId.get("c-2")?.fields).toEqual({ vsb_totalcost: 4 });
    for (const t of plan.contractUpserts) expect(t.fields).not.toHaveProperty(BU);
  });
});

describe("buildSavePlan: a contract that would not change is not written", () => {
  /** c-1 settled, stored Jan = 100, sheet changes Feb; the planned total is 100 + feb. */
  const plan = (totalCost: number | null | undefined, over: Partial<SheetRow> = {}, feb = 0.4) =>
    buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", months: months({ 1: 100, 2: feb }), ...over })],
      existingContracts: [settled({ totalCost })],
      existingCosts: [cost()],
    }), { newId: counter() });

  it("UT-ACSAVE-032 unchanged columns and a stored total equal to the plan's: no contract target", () => {
    const p = plan(100, {}, 0);
    expect(p.contractUpserts).toEqual([]);
    expect(p.costUpserts).toEqual([{ id: "id-1", isNew: true, fields: expect.objectContaining({ vsb_cost: 0, vsb_month: 2 }) }]);
    expect(p.stats.contractsUpdated).toBe(0);
  });

  it("UT-ACSAVE-033 a stored total that differs gives a total-only target", () => {
    const p = plan(90, {}, 5);
    expect(p.contractUpserts).toEqual([{ id: "c-1", isNew: false, fields: { vsb_totalcost: 105 } }]);
    expect(p.stats.contractsUpdated).toBe(1);
  });

  it("UT-ACSAVE-034 an unknown stored total (null or undefined) gives a total-only target", () => {
    for (const unknown of [null, undefined]) {
      expect(plan(unknown, {}, 0).contractUpserts, String(unknown))
        .toEqual([{ id: "c-1", isNew: false, fields: { vsb_totalcost: 100 } }]);
    }
  });

  it("UT-ACSAVE-035 changed columns give the full target even when the total is unchanged", () => {
    const p = plan(100, { costPaidBy: "SPV" }, 0);
    expect(p.contractUpserts).toHaveLength(1);
    expect(p.contractUpserts[0]?.fields).toMatchObject({ vsb_costtype: CHOICE.costPaidType.spv, vsb_totalcost: 100 });
  });

  it("UT-ACSAVE-036 rounding: stored 100 against a planned sum of 100.4 is equal, so no target", () => {
    expect(plan(100, {}, 0.4).contractUpserts).toEqual([]);
    // The stored value is compared exactly: a stored 100.4 would change to 100, so it is written.
    expect(plan(100.4, {}, 0.4).contractUpserts).toEqual([{ id: "c-1", isNew: false, fields: { vsb_totalcost: 100 } }]);
  });

  it("UT-ACSAVE-037 plan.totals keeps a contract that got no target", () => {
    const p = plan(100, {}, 0.4);
    expect(p.contractUpserts).toEqual([]);
    expect([...p.totals]).toEqual([["c-1", 100]]);
  });

  it("UT-ACSAVE-038 only no-op cells and a matching total: nothing at all is written", () => {
    const p = buildSavePlan(input({
      changedRows: [row({ projectContractId: "c-1", months: months({ 1: 100 }) })],
      existingContracts: [settled({ totalCost: 100 })],
      existingCosts: [cost()],
    }), { newId: counter() });
    expect(p.contractUpserts).toEqual([]);
    expect(p.costUpserts).toEqual([]);
    expect(p.stats.noOpCells).toBe(1);
    expect(p.totals.get("c-1")).toBe(100);
  });

  it("UT-ACSAVE-039 a new contract is always created, whatever totals exist", () => {
    const p = buildSavePlan(input({ changedRows: [row({ months: months({ 1: 0 }) })] }), { newId: counter() });
    expect(p.contractUpserts).toEqual([expect.objectContaining({ id: "id-1", isNew: true })]);
    expect(p.contractUpserts[0]?.fields.vsb_totalcost).toBe(0);
  });
});

/* ═══════════════════════════════════════════ equivalence with the legacy save ══ */

/** mulberry32 — a tiny seeded PRNG, so a failing case reproduces from its seed. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ORIGINAL quadratic `costWrites`, kept here as the reference the indexed one must match. */
function legacyCostWrites(rows: readonly SheetRow[], existingCosts: readonly ExistingCost[]) {
  const upserts: CostWrite[] = [];
  const deletes: string[] = [];
  for (const r of rows) {
    for (let m = 1; m <= 12; m += 1) {
      const value = r.months[m - 1] ?? null;
      const existing = existingCosts.find(
        (c) => c.contractId === r.projectContractId && c.year === r.year && c.month === m,
      );
      if (value === null) { if (existing) deletes.push(existing.id); continue; }
      upserts.push({ costId: existing?.id ?? null, contractId: r.projectContractId, year: r.year, month: m, cost: value });
    }
  }
  return { upserts, deletes, candidates: rows.length * 12 };
}

interface DvCost { contractId: string; year: number; month: number; cost: number | null }
interface DvContract { fields: Record<string, unknown>; total: number }
interface Dv { contracts: Map<string, DvContract>; costs: Map<string, DvCost> }

const STALE = -1;

function seedState(contracts: readonly ExistingContract[], costs: readonly ExistingCost[]): Dv {
  const dv: Dv = { contracts: new Map(), costs: new Map() };
  for (const c of contracts) {
    dv.contracts.set(c.id, {
      // The stored total the plan may compare against; STALE when the snapshot has none.
      total: typeof c.totalCost === "number" ? c.totalCost : STALE,
      fields: {
        vsb_name: c.name, vsb_applyvat: c.applyVat, vsb_depreciation: c.depreciation, vsb_costtype: c.costType,
        vsb_distribution: c.distribution, vsb_distributionscheme: c.distributionScheme,
        vsb_iseditedfrompcf: c.isEditedFromPcf, vsb_initialcontractsource: c.initialContractSource,
      },
    });
  }
  for (const c of costs) dv.costs.set(c.id, { contractId: c.contractId, year: c.year, month: c.month, cost: c.cost });
  return dv;
}

const cascadeDelete = (dv: Dv, contractId: string) => {
  for (const [id, c] of dv.costs) if (c.contractId === contractId) dv.costs.delete(id);
  dv.contracts.delete(contractId);
};

/** Replays `saveAddCostSheet`'s semantics against an in-memory Dataverse. Returns the touched ids. */
function replayLegacy(dv: Dv, args: SavePlanInput, newContractId: () => string): Set<string> {
  let costSeq = 0;
  const upserts = contractUpserts(args.changedRows, args.existingContracts);
  const resolvedIdByGroup = new Map<string, string>();
  for (const u of upserts) {
    const key = `${u.subaccountId}|${u.name}`;
    if (u.contractId) {
      const c = dv.contracts.get(u.contractId);
      if (c) Object.assign(c.fields, contractFields(u));
      resolvedIdByGroup.set(key, u.contractId);
    } else {
      const id = newContractId();
      dv.contracts.set(id, { fields: contractFields(u), total: STALE });
      resolvedIdByGroup.set(key, id);
    }
  }
  const resolvedRows = args.changedRows.map((r) => (r.projectContractId ? r
    : { ...r, projectContractId: resolvedIdByGroup.get(`${r.subAccountId}|${r.description}`) ?? null }));
  const plan = legacyCostWrites(resolvedRows, args.existingCosts);
  for (const u of plan.upserts) {
    if (u.costId) { const c = dv.costs.get(u.costId); if (c) c.cost = u.cost; } else if (u.contractId) {
      costSeq += 1;
      dv.costs.set(`legacy-cost-${costSeq}`, { contractId: u.contractId, year: u.year, month: u.month, cost: u.cost });
    }
  }
  for (const id of plan.deletes) dv.costs.delete(id);

  const touched = new Set<string>([
    ...resolvedIdByGroup.values(),
    ...upserts.map((u) => u.contractId).filter((id): id is string => id !== null),
  ]);
  for (const contractId of touched) {
    const merged = new Map<string, number>();
    for (const c of args.existingCosts) if (c.contractId === contractId) merged.set(`${c.year}-${c.month}`, c.cost ?? 0);
    for (const u of plan.upserts) if (u.contractId === contractId) merged.set(`${u.year}-${u.month}`, u.cost);
    for (const id of plan.deletes) {
      const c = args.existingCosts.find((x) => x.id === id);
      if (c && c.contractId === contractId) merged.delete(`${c.year}-${c.month}`);
    }
    const c = dv.contracts.get(contractId);
    if (c) c.total = recomputeContractTotal([...merged.values()].map((v) => ({ cost: v })));
  }
  for (const id of args.contractDeleteIds) cascadeDelete(dv, id);
  return touched;
}

const BIND_RE = /^\/vsb_capexprojectcontracts\((.+)\)$/;

function applyPlan(dv: Dv, plan: ReturnType<typeof buildSavePlan>) {
  for (const t of plan.contractUpserts) {
    const { vsb_totalcost, ...fields } = t.fields as Record<string, unknown>;
    const existing = dv.contracts.get(t.id);
    const stripped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) if (!k.includes("@odata.bind")) stripped[k] = v;
    if (existing) { Object.assign(existing.fields, stripped); existing.total = vsb_totalcost as number; } else {
      dv.contracts.set(t.id, { fields: stripped, total: vsb_totalcost as number });
    }
  }
  for (const t of plan.costUpserts) {
    const existing = dv.costs.get(t.id);
    if (existing) { existing.cost = t.fields.vsb_cost as number; continue; }
    const contractId = BIND_RE.exec(String(t.fields["vsb_Contract@odata.bind"]))?.[1] ?? "";
    dv.costs.set(t.id, {
      contractId, year: t.fields.vsb_year as number, month: t.fields.vsb_month as number, cost: t.fields.vsb_cost as number,
    });
  }
  for (const id of plan.costDeletes) dv.costs.delete(id);
  for (const id of plan.contractDeletes) cascadeDelete(dv, id);
}

const cellMap = (dv: Dv) => {
  const out = new Map<string, number | null>();
  for (const c of dv.costs.values()) out.set(`${c.contractId}|${c.year}|${c.month}`, c.cost);
  return out;
};

const trueTotal = (dv: Dv, contractId: string) =>
  recomputeContractTotal([...dv.costs.values()].filter((c) => c.contractId === contractId));

/** One random sheet Save over random stored data. */
function randomCase(rand: () => number): SavePlanInput {
  const int = (n: number) => Math.floor(rand() * n);
  const pick = <T,>(xs: readonly T[]): T => xs[int(xs.length)] as T;
  const yesNoText = () => pick(["Yes", "No"]);
  const YEARS = [2024, 2025, 2026, 2027];
  const contracts: ExistingContract[] = [];
  const costs: ExistingCost[] = [];
  const rows: SheetRow[] = [];
  const contractDeleteIds: string[] = [];
  let costSeq = 0;
  let rowSeq = 0;

  const subCount = 1 + int(3);
  for (let s = 0; s < subCount; s += 1) {
    const sub = { id: `sub-${s}`, name: `Sub ${s}`, number: `8000${s}` };
    const base = { accountName: sub.name, accountNumber: sub.number, subAccountId: sub.id };
    const nContracts = int(4);
    for (let c = 0; c < nContracts; c += 1) {
      const id = `c-${s}-${c}`;
      const name = `Cost ${s}.${c}`;
      // Half the time, stored columns already equal what a Yes/Yes/DevCo row would write.
      const settledMeta = rand() < 0.5;
      contracts.push(contract({
        id, name, subaccountId: sub.id,
        isEditedFromPcf: settledMeta ? true : rand() < 0.5,
        costType: settledMeta ? CHOICE.costPaidType.devCo : pick([CHOICE.costPaidType.devCo, CHOICE.costPaidType.spv, null]),
        depreciation: settledMeta ? true : pick([true, false, null]),
        applyVat: settledMeta ? true : pick([true, false, null]),
        distribution: settledMeta ? CHOICE.distributionType.individual : pick([CHOICE.distributionType.equal, CHOICE.distributionType.individual]),
      }));
      const usedYears = new Set<number>();
      for (const year of YEARS) {
        if (rand() < 0.4) continue;
        for (let m = 1; m <= 12; m += 1) {
          if (rand() < 0.5) continue;
          costSeq += 1;
          costs.push({ id: `k-${costSeq}`, contractId: id, year, month: m, cost: rand() < 0.05 ? null : int(1000) + (rand() < 0.3 ? 0.5 : 0) });
        }
      }
      if (rand() < 0.2) { contractDeleteIds.push(id); if (rand() < 0.3) contractDeleteIds.push(id); if (rand() < 0.5) continue; }

      const meta = () => (settledMeta && rand() < 0.7
        ? { costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes" }
        : { costPaidBy: pick(["DevCo", "SPV"]), depreciation: yesNoText(), applyVat: yesNoText() });
      const m = meta();
      for (const year of YEARS) {
        if (rand() < 0.5) continue;
        usedYears.add(year);
        rowSeq += 1;
        rows.push(row({
          ...base, ...m, rowId: `r-${rowSeq}`, description: name, year, projectContractId: id,
          months: Array.from({ length: 12 }, (_, i) => {
            const stored = costs.find((k) => k.contractId === id && k.year === year && k.month === i + 1);
            const roll = rand();
            if (roll < 0.35) return stored ? stored.cost : null;   // unchanged (a no-op when stored)
            if (roll < 0.55) return null;                         // blanked
            return int(500);                                      // changed / new
          }),
        }));
      }
      // Occasionally a null-id row of this contract's group in an unused year: either it is
      // threaded onto this contract, or (when it is the group's last row) it becomes a new one.
      const free = YEARS.filter((y) => !usedYears.has(y));
      if (free.length > 0 && rand() < 0.15) {
        rowSeq += 1;
        const alias = row({
          ...base, ...m, rowId: `r-${rowSeq}`, description: name, year: pick(free), projectContractId: null,
          months: Array.from({ length: 12 }, () => (rand() < 0.5 ? null : int(300))),
        });
        if (rand() < 0.5) rows.push(alias); else rows.unshift(alias);
      }
    }
    const nNew = int(3);
    for (let n = 0; n < nNew; n += 1) {
      const meta = { costPaidBy: pick(["DevCo", "SPV"]), depreciation: yesNoText(), applyVat: yesNoText() };
      for (const year of YEARS) {
        if (rand() < 0.6) continue;
        rowSeq += 1;
        rows.push(row({
          ...base, ...meta, rowId: `r-${rowSeq}`, description: `New ${s}.${n}`, year, projectContractId: null,
          months: Array.from({ length: 12 }, () => (rand() < 0.5 ? null : int(400))),
        }));
      }
    }
  }
  // Shuffle the rows: the plan must not depend on any particular row order to stay equivalent.
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = int(i + 1);
    [rows[i], rows[j]] = [rows[j] as SheetRow, rows[i] as SheetRow];
  }
  return {
    projectId: "p-1", owningBusinessUnitId: rand() < 0.5 ? "bu-1" : undefined,
    changedRows: rows, existingContracts: contracts, existingCosts: costs, contractDeleteIds,
  };
}

/**
 * Gives each stored contract a `totalCost`, from a SEPARATE stream so `randomCase` (shared with
 * UT-ACSAVE-018) is unchanged. "Right" is the total this save ends with (a probe plan with no
 * stored totals, whose `totals` are unaffected by them), else the stored sum: a third right, a
 * third wrong (integer or not), a third unknown. The legacy replay starts from the same stored
 * total (`seedState`), so a plan that skips a contract whose stored total is already right must
 * leave the identical final state.
 */
function withStoredTotals(c: SavePlanInput, rand: () => number): SavePlanInput {
  const finalTotals = buildSavePlan(c, { newId: counter("probe") }).totals;
  const sums = new Map<string, number>();
  for (const k of c.existingCosts) sums.set(k.contractId, (sums.get(k.contractId) ?? 0) + (k.cost ?? 0));
  const existingContracts = c.existingContracts.map((k) => {
    const roll = rand();
    const right = finalTotals.get(k.id) ?? Math.round(sums.get(k.id) ?? 0);
    const totalCost = roll < 0.34 ? right
      : roll < 0.5 ? right + 1 + Math.floor(rand() * 5)
        : roll < 0.67 ? right + 0.4
          : roll < 0.84 ? null : undefined;
    return { ...k, totalCost };
  });
  return { ...c, existingContracts };
}

describe("buildSavePlan ≡ the legacy per-row save", () => {
  it("UT-ACSAVE-018 the indexed costWrites matches the original find-based one", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const c = randomCase(prng(seed));
      expect(costWrites(c.changedRows, c.existingCosts), `seed ${seed}`)
        .toEqual(legacyCostWrites(c.changedRows, c.existingCosts));
    }
  });

  it("UT-ACSAVE-019 leaves the same final Dataverse state over 400 random saves", () => {
    let divergedTotals = 0;
    let skippedContracts = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const c = withStoredTotals(randomCase(prng(seed)), prng(seed + 100_000));
      const legacy = seedState(c.existingContracts, c.existingCosts);
      const touched = replayLegacy(legacy, c, counter("new"));

      // The plan's newId issues contracts first, in upsert order, so its contract ids line up
      // with the legacy replay's; cost ids are compared by cell, never by id.
      const plan = buildSavePlan(c, { newId: counter("new") });
      const planned = seedState(c.existingContracts, c.existingCosts);
      applyPlan(planned, plan);

      expect(cellMap(planned), `seed ${seed}: cost cells`).toEqual(cellMap(legacy));
      expect([...planned.contracts.keys()].sort(), `seed ${seed}: contracts`).toEqual([...legacy.contracts.keys()].sort());
      for (const [id, p] of planned.contracts) {
        const l = legacy.contracts.get(id) as DvContract;
        expect(p.fields, `seed ${seed}: ${id} columns`).toEqual(l.fields);
        if (plan.totals.has(id)) {
          expect(p.total, `seed ${seed}: ${id} total`).toBe(trueTotal(planned, id));
          expect(plan.totals.get(id)).toBe(p.total);
        } else {
          expect(touched.has(id), `seed ${seed}: ${id} touched by legacy only`).toBe(false);
        }
        if (touched.has(id)) expect(p.total, `seed ${seed}: ${id} legacy total`).toBe(l.total);
        else if (p.total !== l.total) divergedTotals += 1; // the DIVERGENCE: legacy left it stale
      }
      for (const id of plan.contractDeletes) expect(plan.totals.has(id)).toBe(false);
      const targeted = new Set(plan.contractUpserts.map((t) => t.id));
      for (const id of plan.totals.keys()) if (!targeted.has(id)) skippedContracts += 1;
    }
    // The generator does reach the non-representative-row case the DIVERGENCE note describes,
    // and the "stored total already right, nothing written" case.
    expect(divergedTotals).toBeGreaterThan(0);
    expect(skippedContracts).toBeGreaterThan(0);
  });
});
