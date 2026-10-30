/**
 * `saveAddCostSheetLegacy` (the per-row save, `BULK_SAVE = false`) — the delete half.
 *
 * Add Cost from Table can remove a whole category's contracts in one save, and it removed them
 * the way `deleteCostLine` used to: cost rows, then the contract, and NOT the comments. Every
 * contract this screen deleted therefore left its whole thread in `vsb_capexcommentses` pointing
 * at a contract that no longer existed — invisible in the app, and counted by the next
 * `loadComments` for any contract that reused the id. The canvas runs `RemoveIf('Capex Comments',
 * …)` as part of contract deletion.
 *
 * ORDER is what these assert, not merely membership. A comment row points at BOTH the contract
 * (`vsb_CapexContract`) and, for a payment-date comment, the month's cost row (`vsb_CapexCost`),
 * so it is a child of both. The writes are not transactional — the SDK exposes no changeset — so
 * the only guarantee available is that an interrupted delete leaves rows that are still
 * reachable, which needs children strictly before parents.
 *
 * Ids continue the `UT-ADDCOST-` series from `features/add-costs-from-table/rules.test.ts`; this
 * is the I/O half of the same feature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every delete any path issued, in order, as `table:id`. */
let deleted: string[] = [];

/** Rows `fetchAll` should answer with, by the label its caller passes. */
let rowsByLabel: Record<string, unknown[]> = {};

/** The options every `fetchAll` was called with, by label. */
let queriedBy: Record<string, unknown[]> = {};

/** Ids whose `deleteRecord` Dataverse refuses (it throws, as the real one does on `success: false`). */
let refused = new Set<string>();

/** `deleteRecord`'s entity set → the prefix `deleted` records it under. */
const PREFIX: Record<string, string> = {
  vsb_capexcosts: "cost", vsb_capexprojectcontracts: "contract",
  // Comments too since CA-18 (`deleteComment` goes through `deleteRecord`).
  vsb_capexcommentses: "comment",
};

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? [];
  },
  // Cost, contract and comment deletes go through `deleteRecord` (CONVENTIONS rule 14), not the generated
  // services' raw `delete()`, so this is where they are recorded.
  deleteRecord: async (operation: string, tableName: string, id: string) => {
    if (refused.has(id)) throw new Error(`${operation}: 403 refused`);
    deleted.push(`${PREFIX[tableName] ?? tableName}:${id}`);
  },
}));

/** A raw generated `delete()` must never be reached on this path; it would discard a refusal. */
const rawDelete = (table: string) => async (id: string) => {
  throw new Error(`raw ${table}.delete(${id}) called; use deleteRecord`);
};

vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexprojectcontractid: "contract-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: rawDelete("Vsb_capexprojectcontractsService"),
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcostid: "cost-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: rawDelete("Vsb_capexcostsService"),
  },
}));
vi.mock("@/generated/services/UpsertMultipleService", () => ({
  UpsertMultipleService: {
    UpsertMultiple: async () => {
      throw new Error("the legacy path must not call UpsertMultiple");
    },
  },
}));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcommentsid: "comment-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: rawDelete("Vsb_capexcommentsesService"),
  },
}));

// Pulled in transitively by `costBook.ts`, which `addCostSheet.ts` reads its chart of accounts
// from. Each generated service calls `getClient(...)` at class-static init, so every one this
// module's import graph touches has to be stubbed.
vi.mock("@/generated/services/Vsb_capexaccountlistsService", () => ({
  Vsb_capexaccountlistsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_spvdevcomappingcapexdevexesService", () => ({
  Vsb_spvdevcomappingcapexdevexesService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({
  Vsb_landleaseprojectcostsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({
  Vsb_landleaseperiodsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({
  Vsb_landleasesubaccountsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_opexsubaccountsService", () => ({
  Vsb_opexsubaccountsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({
  Vsb_opexprojectcostsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({
  Vsb_devicetypesinprojectsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({
  Vsb_projectstatesService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_milestonesstandardassumptionsesService", () => ({
  Vsb_milestonesstandardassumptionsesService: {
    getAll: async () => ({ success: true, data: [] }),
  },
}));

// The LEGACY per-row path, driven directly: these pin its delete order whatever `BULK_SAVE` is.
// The bulk path has its own suite (`addCostSheet.bulk.test.ts`).
const { saveAddCostSheetLegacy } = await import("./addCostSheet");

/** `lookupIn`/`guid` reject anything that is not a real GUID, so every fixture id is one. */
const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const DOOMED = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const OTHER = "11111111-7777-8888-9999-aaaaaaaaaaaa";

const cost = (id: string, contractId: string) => ({
  id, contractId, year: 2026, month: 1, cost: 100,
});

const save = (contractDeleteIds: string[], existingCosts: ReturnType<typeof cost>[] = []) =>
  saveAddCostSheetLegacy({
    projectId: PROJECT_ID,
    changedRows: [],
    existingContracts: [],
    existingCosts,
    contractDeleteIds,
  });

beforeEach(() => {
  deleted = [];
  rowsByLabel = {};
  queriedBy = {};
  refused = new Set();
});

describe("saveAddCostSheetLegacy contract deletion", () => {
  it("UT-ADDCOST-032 deletes the contract's comments, then its cost rows, then the contract", async () => {
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "cm1", _vsb_capexcontract_value: DOOMED },
        { vsb_capexcommentsid: "cm2", _vsb_capexcontract_value: DOOMED },
      ],
    };

    await save([DOOMED], [cost("cost-1", DOOMED)]);

    expect(deleted).toEqual([
      "comment:cm1", "comment:cm2", "cost:cost-1", `contract:${DOOMED}`,
    ]);
  });

  it("UT-ADDCOST-033 never drags another contract's comments or costs into the delete", async () => {
    // `loadComments` filters server-side, but `planDeleteContract` filters again — one batched
    // query serves every doomed contract, so its rows have to be split back out by contract.
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "mine", _vsb_capexcontract_value: DOOMED },
        { vsb_capexcommentsid: "theirs", _vsb_capexcontract_value: OTHER },
        { vsb_capexcommentsid: "orphan", _vsb_capexcontract_value: null },
      ],
    };

    await save([DOOMED], [cost("cost-1", DOOMED), cost("cost-2", OTHER)]);

    expect(deleted).toEqual(["comment:mine", "cost:cost-1", `contract:${DOOMED}`]);
  });

  it("UT-ADDCOST-034 keeps each contract's children with it when several go at once", async () => {
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "cm-a", _vsb_capexcontract_value: DOOMED },
        { vsb_capexcommentsid: "cm-b", _vsb_capexcontract_value: OTHER },
      ],
    };

    await save([DOOMED, OTHER], [cost("cost-a", DOOMED), cost("cost-b", OTHER)]);

    expect(deleted).toEqual([
      "comment:cm-a", "cost:cost-a", `contract:${DOOMED}`,
      "comment:cm-b", "cost:cost-b", `contract:${OTHER}`,
    ]);
  });

  it("UT-ADDCOST-035 asks for the comments of every doomed contract in ONE query", async () => {
    await save([DOOMED, OTHER]);

    // Hoisted out of the delete loop: the single round trip must happen before any delete does,
    // and `loadComments` already chunks its `lookupIn` at 40 ids.
    expect(queriedBy["list CAPEX comments"]).toHaveLength(1);
    const options = queriedBy["list CAPEX comments"]?.[0] as { filter: string };
    expect(options.filter).toContain(DOOMED);
    expect(options.filter).toContain(OTHER);
  });

  it("UT-ADDCOST-036 asks for no comments at all when nothing is being deleted", async () => {
    await save([]);
    expect(queriedBy["list CAPEX comments"]).toBeUndefined();
    expect(deleted).toEqual([]);
  });

  it("UT-ADDCOST-037 still deletes a contract that has no comments", async () => {
    await save([DOOMED], [cost("cost-1", DOOMED)]);
    expect(deleted).toEqual(["cost:cost-1", `contract:${DOOMED}`]);
  });
});

describe("saveAddCostSheetLegacy refused deletes (CONVENTIONS rule 14)", () => {
  it("UT-ACSHEET-LEGACY-001 a refused cost delete rejects the save and keeps its contract", async () => {
    refused = new Set(["cost-1"]);
    await expect(save([DOOMED], [cost("cost-1", DOOMED)])).rejects.toThrow(/403 refused/);
    // The contract delete never ran: its child is still there.
    expect(deleted).not.toContain(`contract:${DOOMED}`);
  });

  it("UT-ACSHEET-LEGACY-002 a refused contract delete rejects the save", async () => {
    refused = new Set([DOOMED]);
    await expect(save([DOOMED])).rejects.toThrow(/delete CAPEX contract: 403 refused/);
  });

  it("UT-ACSHEET-LEGACY-003 a refused blanked-month delete rejects the save", async () => {
    const CONTRACT = "22222222-7777-8888-9999-aaaaaaaaaaaa";
    refused = new Set(["cost-blank"]);
    const months = new Array<number | null>(12).fill(null);
    await expect(saveAddCostSheetLegacy({
      projectId: PROJECT_ID,
      changedRows: [{
        rowId: "1", accountNumber: "100", accountName: "A", description: "C1", year: 2026,
        costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes", months,
        subAccountId: "33333333-7777-8888-9999-aaaaaaaaaaaa", projectContractId: CONTRACT,
      }],
      existingContracts: [],
      existingCosts: [{ id: "cost-blank", contractId: CONTRACT, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
    })).rejects.toThrow(/delete CAPEX cost: 403 refused/);
  });
});
