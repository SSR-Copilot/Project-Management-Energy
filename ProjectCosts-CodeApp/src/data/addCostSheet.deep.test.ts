/**
 * WS-B, deep insert, wired end to end: `saveAddCostSheetBulk` → `executeSavePlan` →
 * `deepInsertContracts` (`./bulkSend.ts`) with only the SDK edge faked, as in
 * `addCostSheet.bulk.test.ts`: the two bulk actions, the contract `create` (the deep-insert POST),
 * and `client.fetchAll` / `client.deleteRecord`. Pins the request shape with the flag on, the
 * once-per-tab read-back of the nested rows, the tab fallback after a failure, retry-stable ids,
 * and — flag off, the default — that the requests are exactly today's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Action = "create" | "update";
interface UpsertCall { action: Action; entitySetName: string; targets: Record<string, unknown>[] }

let upsertCalls: UpsertCall[] = [];
/** Every deep-insert POST body, in send order. */
let creates: Record<string, unknown>[] = [];
/** Every `fetchAll` label, in call order. */
let reads: string[] = [];
/** Ids in the fake Dataverse, lower case. */
let stored = new Set<string>();
/** Cost rows in the fake Dataverse (for the reconcile read): id → contract and amount. */
let costRows = new Map<string, { contract: string; cost: number }>();
/** The contract create answers `{ success: false }` (400). */
let refuseCreate = false;
/** The host drops the nested array: the contract lands, its cost rows do not. */
let dropNested = false;

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NAV = "vsb_capexcost_Contract_vsb_capexprojectcontract";
const PRIMARY_KEY: Record<string, string> = {
  vsb_capexprojectcontracts: "vsb_capexprojectcontractid",
  vsb_capexcosts: "vsb_capexcostid",
};
const contractOf = (fields: Record<string, unknown>): string =>
  String(fields["vsb_Contract@odata.bind"] ?? "").match(GUID)?.[0]?.toLowerCase() ?? "";

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    reads.push(label);
    const filter = (options as { filter?: string }).filter ?? "";
    const named = new Set((filter.match(GUID) ?? []).map((g) => g.toLowerCase()));
    if (label.startsWith("check existing ")) {
      const { select } = options as { select: string[] };
      return [...named].filter((id) => stored.has(id)).map((id) => ({ [select[0] as string]: id }));
    }
    if (label === "list Add Cost from Table costs") {
      return [...costRows].filter(([, r]) => named.has(r.contract)).map(([id, r]) => ({
        vsb_capexcostid: id, _vsb_contract_value: r.contract, vsb_year: 2026, vsb_month: 1, vsb_cost: r.cost,
      }));
    }
    return [];
  },
  deleteRecord: async () => undefined,
}));

const bulk = (action: Action) => async (entitySetName: string, targets: Record<string, unknown>[]) => {
  upsertCalls.push({ action, entitySetName, targets });
  for (const t of targets) {
    const id = String(t[PRIMARY_KEY[entitySetName] as string]).toLowerCase();
    stored.add(id);
    if (entitySetName === "vsb_capexcosts") {
      const prev = costRows.get(id);
      costRows.set(id, { contract: contractOf(t) || (prev?.contract ?? ""), cost: Number(t.vsb_cost ?? prev?.cost ?? 0) });
    }
  }
  return { success: true, data: {} };
};

vi.mock("@/generated/services/CreateMultipleService", () => ({ CreateMultipleService: { CreateMultiple: bulk("create") } }));
vi.mock("@/generated/services/UpdateMultipleService", () => ({ UpdateMultipleService: { UpdateMultiple: bulk("update") } }));
vi.mock("@/generated/services/UpsertMultipleService", () => ({
  UpsertMultipleService: { UpsertMultiple: async () => { throw new Error("UpsertMultiple must no longer be called"); } },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => ({ success: true, data: [] }),
    // The deep-insert POST: the contract and, unless the host drops them, its nested rows.
    create: async (body: Record<string, unknown>) => {
      creates.push(body);
      if (refuseCreate) return { success: false, error: { message: "deep insert refused", status: 400 } };
      const id = String(body.vsb_capexprojectcontractid).toLowerCase();
      stored.add(id);
      if (!dropNested) {
        for (const c of (body[NAV] as Record<string, unknown>[] | undefined) ?? []) {
          const costId = String(c.vsb_capexcostid).toLowerCase();
          stored.add(costId);
          costRows.set(costId, { contract: id, cost: Number(c.vsb_cost) });
        }
      }
      return { success: true, data: { vsb_capexprojectcontractid: id } };
    },
    update: async () => { throw new Error("per-row contract update on the bulk path"); },
    delete: async () => { throw new Error("raw contract delete"); },
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => { throw new Error("per-row cost create on the bulk path"); },
    update: async () => { throw new Error("per-row cost update on the bulk path"); },
    delete: async () => { throw new Error("raw cost delete"); },
  },
}));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: { getAll: async () => ({ success: true, data: [] }), delete: async () => ({ success: true, data: {} }) },
}));
// Pulled in transitively; each generated service calls `getClient(...)` at class-static init.
for (const name of [
  "Vsb_capexaccountlistsService", "Vsb_spvdevcomappingcapexdevexesService",
  "Vsb_landleaseprojectcostsService", "Vsb_landleaseperiodsService",
  "Vsb_landleasesubaccountsService", "Vsb_opexsubaccountsService", "Vsb_opexprojectcostsService",
  "Vsb_devicetypesinprojectsService", "Vsb_projectstatesService",
  "Vsb_milestonesstandardassumptionsesService",
]) {
  vi.doMock(`@/generated/services/${name}`, () => ({ [name]: { getAll: async () => ({ success: true, data: [] }) } }));
}

const { DEEP_INSERT_NEW_CONTRACTS, saveAddCostSheetBulk } = await import("./addCostSheet");
const {
  deepInsertBody, deepInsertContracts, isDeepInsertAvailable, resetBulkWriteAvailability, resetDeepInsertState,
  CONTRACT_COSTS_NAV, DeepInsertError,
} = await import("./bulkSend");
const { SavePlanError } = await import("./addCostSheetBulk");
const { BulkValidationError } = await import("./bulkWrites");
const { OWNING_BU_BIND } = await import("./odata");
type Args = Parameters<typeof saveAddCostSheetBulk>[0];

/* ─────────────────────────────────────────────────────────────── fixtures ── */

const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const BU = "0b0b0b0b-1111-2222-3333-444444444444";
const SUB = "33333333-7777-8888-9999-aaaaaaaaaaaa";
const C1 = "c1c1c1c1-7777-8888-9999-aaaaaaaaaaaa";
const COST_JAN = "a0000001-0000-4000-8000-000000000001";

const months = (...head: (number | null)[]) => [...head, ...new Array<number | null>(12 - head.length).fill(null)];
const row = (description: string, projectContractId: string | null, m: (number | null)[]) => ({
  rowId: "1", accountNumber: "100", accountName: "Account", description, year: 2026,
  costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes", months: m, subAccountId: SUB, projectContractId,
});
const contract = (id: string, name: string) => ({
  id, name, subaccountId: SUB, isStandardContract: false, initialContractSource: null,
  distribution: null, distributionScheme: null, isEditedFromPcf: false, costType: null, depreciation: null, applyVat: null,
});

/** C1's January 100 → 200, and a brand-new contract "New" with January 10 and February 20. */
const sheet = (over: Partial<Args> = {}): Args => ({
  projectId: PROJECT_ID,
  owningBusinessUnitId: BU,
  changedRows: [row("C1", C1, months(200)), row("New", null, months(10, 20))],
  existingContracts: [contract(C1, "C1")],
  existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
  contractDeleteIds: [],
  ...over,
});

/** Every request the save sent, GUIDs replaced by their order of appearance, so two runs compare. */
function normalised(): string {
  const seen = new Map<string, string>();
  const text = JSON.stringify({ upsertCalls, creates, reads });
  return text.replace(GUID, (g) => {
    const k = g.toLowerCase();
    if (!seen.has(k)) seen.set(k, `id${seen.size}`);
    return seen.get(k) as string;
  });
}

const saveLine = (info: { mock: { calls: unknown[][] } }) =>
  info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("Add Cost from Table save")) ?? "";

function reset() {
  upsertCalls = [];
  creates = [];
  reads = [];
  stored = new Set([C1, COST_JAN].map((id) => id.toLowerCase()));
  costRows = new Map([[COST_JAN.toLowerCase(), { contract: C1.toLowerCase(), cost: 100 }]]);
  refuseCreate = false;
  dropNested = false;
}

beforeEach(() => {
  reset();
  resetBulkWriteAvailability();
  resetDeepInsertState();
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
  vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
  vi.spyOn(console, "table").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ─────────────────────────────────────────────────────────────── flag off ── */

describe("DEEP_INSERT_NEW_CONTRACTS off (the default) — today's requests", () => {
  it("UT-ACDEEP-020 the flag ships off", () => {
    expect(DEEP_INSERT_NEW_CONTRACTS).toBe(false);
  });

  it("UT-ACDEEP-021 off sends exactly today's requests: contract CreateMultiple THEN the new contract's costs, no deep-insert POST", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await saveAddCostSheetBulk(sheet());
    const byDefault = normalised();
    expect(creates).toHaveLength(0);
    const shape = upsertCalls.map((c) => `${c.action}:${c.entitySetName}:${c.targets.length}`).sort();
    expect(shape).toEqual([
      "create:vsb_capexcosts:2", "create:vsb_capexprojectcontracts:1",
      "update:vsb_capexcosts:1", "update:vsb_capexprojectcontracts:1",
    ]);
    // The new contract's cost rows still bind to it and still went out after it.
    const newCosts = upsertCalls.find((c) => c.action === "create" && c.entitySetName === "vsb_capexcosts");
    expect(newCosts?.targets.every((t) => typeof t["vsb_Contract@odata.bind"] === "string")).toBe(true);
    expect(upsertCalls.at(-1)).toBe(newCosts);

    reset();
    await saveAddCostSheetBulk({ ...sheet(), deepInsertNewContracts: false });
    expect(normalised()).toBe(byDefault);
  });
});

/* ─────────────────────────────────────────────────────────────── flag on ── */

describe("DEEP_INSERT_NEW_CONTRACTS on — the new contract travels with its costs", () => {
  it("UT-ACDEEP-022 one POST carries the contract and its cost rows: client-minted ids, owning-BU bind on every child, no contract bind", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const idCache = new Map<string, string>();
    await saveAddCostSheetBulk({ ...sheet(), idCache, deepInsertNewContracts: true });
    expect(creates).toHaveLength(1);
    const body = creates[0] as Record<string, unknown>;
    expect(body[OWNING_BU_BIND]).toBe(`/businessunits(${BU})`);
    expect(body).not.toHaveProperty("@odata.type");
    const children = body[NAV] as Record<string, unknown>[];
    expect(children.map((c) => [c.vsb_month, c.vsb_cost])).toEqual([[1, 10], [2, 20]]);
    const minted = new Set([...idCache.values()].map((id) => id.toLowerCase()));
    expect(minted.has(String(body.vsb_capexprojectcontractid).toLowerCase())).toBe(true);
    for (const child of children) {
      expect(child[OWNING_BU_BIND]).toBe(`/businessunits(${BU})`); // CONVENTIONS rule 4
      expect(child).not.toHaveProperty("vsb_Contract@odata.bind");
      expect(minted.has(String(child.vsb_capexcostid).toLowerCase())).toBe(true); // D51 §3a
    }
    // No CreateMultiple at all: the only new contract and its costs went by deep insert.
    expect(upsertCalls.map((c) => `${c.action}:${c.entitySetName}`).sort())
      .toEqual(["update:vsb_capexcosts", "update:vsb_capexprojectcontracts"]);
  });

  it("UT-ACDEEP-023 the log names the step; the nested rows are read back on the tab's first deep insert only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await saveAddCostSheetBulk({ ...sheet(), deepInsertNewContracts: true });
    expect(saveLine(info)).toMatch(
      /upsert new contracts with their costs \(deep insert\) \(create 2 req deep insert \[[\d,]+ ms\]\) [\d,]+ ms/,
    );
    expect(reads.filter((l) => l === "check existing vsb_capexcosts")).toHaveLength(1);

    reset();
    info.mockClear();
    await saveAddCostSheetBulk({ ...sheet(), deepInsertNewContracts: true });
    expect(creates).toHaveLength(1);
    expect(reads.filter((l) => l.startsWith("check existing "))).toHaveLength(0); // confirmed for the tab
    expect(saveLine(info)).toMatch(/\(create 1 req deep insert \[/);
  });

  it("UT-ACDEEP-024 nested rows that did not land: phase-1 SavePlanError, the new contract's total rewritten from what landed, the tab falls back", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    dropNested = true;
    const idCache = new Map<string, string>();
    const error = await saveAddCostSheetBulk({ ...sheet(), idCache, deepInsertNewContracts: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SavePlanError);
    expect((error as InstanceType<typeof SavePlanError>).phase).toBe(1);
    expect((error as InstanceType<typeof SavePlanError>).reconciled).toBe(true);
    const newId = String(creates[0]?.vsb_capexprojectcontractid);
    const cause = (error as InstanceType<typeof SavePlanError>).cause;
    expect(cause).toBeInstanceOf(DeepInsertError);
    expect(cause).toMatchObject({ childrenMissing: true, landedIds: [newId], failedIds: [] });
    const fix = upsertCalls.find((c) => c.action === "update" && c.targets.some((t) => t.vsb_capexprojectcontractid === newId));
    expect(fix?.targets.find((t) => t.vsb_capexprojectcontractid === newId)?.vsb_totalcost).toBe(0);
    expect(isDeepInsertAvailable()).toBe(false);
  });

  it("UT-ACDEEP-025 a refused deep insert: phase-1 SavePlanError, and the retry sends the SAME ids by CreateMultiple", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    refuseCreate = true;
    const idCache = new Map<string, string>();
    const error = await saveAddCostSheetBulk({ ...sheet(), idCache, deepInsertNewContracts: true }).catch((e: unknown) => e);
    expect((error as InstanceType<typeof SavePlanError>).phase).toBe(1);
    expect((error as InstanceType<typeof SavePlanError>).unverifiedContractIds).toEqual([]);
    const first = creates[0] as Record<string, unknown>;
    const firstCostIds = (first[NAV] as Record<string, unknown>[]).map((c) => c.vsb_capexcostid);
    expect(isDeepInsertAvailable()).toBe(false);

    upsertCalls = [];
    creates = [];
    refuseCreate = false;
    await saveAddCostSheetBulk({ ...sheet(), idCache, deepInsertNewContracts: true });
    expect(creates).toHaveLength(0); // the tab took the CreateMultiple path
    const contractCreate = upsertCalls.find((c) => c.action === "create" && c.entitySetName === "vsb_capexprojectcontracts");
    expect(contractCreate?.targets.map((t) => t.vsb_capexprojectcontractid)).toEqual([first.vsb_capexprojectcontractid]);
    const costCreate = upsertCalls.find((c) => c.action === "create" && c.entitySetName === "vsb_capexcosts");
    expect(costCreate?.targets.map((t) => t.vsb_capexcostid)).toEqual(firstCostIds);
    expect(costCreate?.targets.every((t) => t[OWNING_BU_BIND] === `/businessunits(${BU})`)).toBe(true);
  });
});

/* ───────────────────────────────────────────────────────────── the sender ── */

describe("deepInsertContracts / deepInsertBody — the sender", () => {
  const group = {
    contract: { id: "c-a", isNew: true, fields: { vsb_totalcost: 30, [OWNING_BU_BIND]: "/businessunits(bu)" } },
    costs: [{ id: "k-a1", isNew: true, fields: { vsb_cost: 10, [OWNING_BU_BIND]: "/businessunits(bu)" } }],
  };

  it("UT-ACDEEP-026 deepInsertBody: the contract's fields and id, its rows under the contract → cost navigation property", () => {
    expect(CONTRACT_COSTS_NAV).toBe(NAV);
    expect(deepInsertBody(group)).toEqual({
      vsb_totalcost: 30, [OWNING_BU_BIND]: "/businessunits(bu)", vsb_capexprojectcontractid: "c-a",
      [NAV]: [{ vsb_cost: 10, [OWNING_BU_BIND]: "/businessunits(bu)", vsb_capexcostid: "k-a1" }],
    });
  });

  it("UT-ACDEEP-027 a nested row that still carries its contract bind, or a non-new contract, is refused before anything is sent", async () => {
    const withBind = { ...group, costs: [{ id: "k-a1", isNew: true, fields: { vsb_cost: 10, "vsb_Contract@odata.bind": "/x(c-a)" } }] };
    await expect(deepInsertContracts([withBind], "upsert contracts")).rejects.toBeInstanceOf(BulkValidationError);
    const update = { ...group, contract: { ...group.contract, isNew: false } };
    await expect(deepInsertContracts([update], "upsert contracts")).rejects.toBeInstanceOf(BulkValidationError);
    expect(creates).toHaveLength(0);
    expect(isDeepInsertAvailable()).toBe(true); // a refused plan is not a refused route
  });
});
