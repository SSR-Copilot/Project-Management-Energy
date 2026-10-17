/**
 * `saveAddCostSheet` — the delete half.
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

/** Set to make the NEXT contract delete reject, to test the cascade's own failure handling. */
let contractDeleteFails = false;

/** Set to make EVERY cost-row delete reject, to test the cleared-cell leg's failure handling. */
let costDeletesFail = false;

/** Cost-row ids whose delete answers 404, as if someone else removed them first. */
let alreadyGone = new Set<string>();

/** Rows `fetchAll` should answer with, by the label its caller passes. */
let rowsByLabel: Record<string, unknown[]> = {};

/** The options every `fetchAll` was called with, by label. */
let queriedBy: Record<string, unknown[]> = {};

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? [];
  },
  // The save deletes through `deleteRecord`, which surfaces a refused delete as a throw.
  deleteRecord: async (_operation: string, table: string, id: string) => {
    if (table === "vsb_capexprojectcontracts") {
      if (contractDeleteFails) { contractDeleteFails = false; throw new Error("contract delete denied"); }
      deleted.push(`contract:${id}`);
    } else if (table === "vsb_capexcosts") {
      if (costDeletesFail) throw new Error("cost delete denied");
      if (alreadyGone.has(id)) {
        const { DataError } = await import("@/platform/errors");
        throw new DataError("delete", "not found", 404);
      }
      deleted.push(`cost:${id}`);
    } else if (table === "vsb_capexcommentses") {
      deleted.push(`comment:${id}`);
    } else {
      throw new Error(`unexpected delete from ${table}`);
    }
  },
}));

vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexprojectcontractid: "contract-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: async (id: string) => {
      if (contractDeleteFails) { contractDeleteFails = false; throw new Error("contract delete denied"); }
      deleted.push(`contract:${id}`);
      return { success: true, data: {} };
    },
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcostid: "cost-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: async (id: string) => {
      if (costDeletesFail) throw new Error("cost delete denied");
      deleted.push(`cost:${id}`);
      return { success: true, data: {} };
    },
  },
}));
// `saveAddCostSheet` routes contract/cost creates-and-updates and the contract-totals update
// through these generic bulk services (see `bulkWrite.ts`). The delete-cascade tests above call
// `save` with `changedRows: []`, so all three plan to zero rows and never call through to
// these; the upsert/save tests below give them real queued responses.
let createCalls: { entitySetName: string; targets: Record<string, unknown>[] }[] = [];
let updateCalls: { entitySetName: string; targets: Record<string, unknown>[] }[] = [];
let createReplies: { success: boolean; data?: unknown; error?: unknown }[] = [];
let updateReplies: { success: boolean; error?: unknown }[] = [];

/** Default: every created row gets a fresh server-assigned id, in input order. */
function defaultCreateReply(targets: Record<string, unknown>[]) {
  return { success: true, data: { Ids: targets.map(() => crypto.randomUUID()) } };
}

vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: {
    CreateMultiple: async (entitySetName: string, targets: Record<string, unknown>[]) => {
      createCalls.push({ entitySetName, targets });
      return createReplies.shift() ?? defaultCreateReply(targets);
    },
  },
}));
vi.mock("@/generated/services/UpsertMultipleService", () => ({
  UpsertMultipleService: { UpsertMultiple: async () => ({ success: true, data: null }) },
}));
/**
 * When set, the contracts step's UpdateMultiple (not the totals update) waits on this before it
 * answers — used to prove what else is, or is not, sent WHILE that call is still in flight.
 */
let holdContractUpdate: Promise<void> | undefined;

/** When set, any UpdateMultiple this predicate matches fails — deterministic, unlike a queue. */
let failUpdate: ((entitySetName: string, targets: Record<string, unknown>[]) => boolean) | undefined;

vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: {
    UpdateMultiple: async (entitySetName: string, targets: Record<string, unknown>[]) => {
      updateCalls.push({ entitySetName, targets });
      if (failUpdate?.(entitySetName, targets)) return { success: false, error: "denied" };
      const reply = updateReplies.shift() ?? { success: true, data: null };
      if (holdContractUpdate && entitySetName === "vsb_capexprojectcontracts"
        && !("vsb_totalcost" in (targets[0] ?? {}))) {
        await holdContractUpdate;
      }
      return reply;
    },
  },
}));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcommentsid: "comment-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: async (id: string) => {
      deleted.push(`comment:${id}`);
      return { success: true, data: {} };
    },
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

const { saveAddCostSheet } = await import("./addCostSheet");
const { CHOICE } = await import("@/features/add-costs-from-table/rules");

/** `lookupIn`/`guid` reject anything that is not a real GUID, so every fixture id is one. */
const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const DOOMED = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const OTHER = "11111111-7777-8888-9999-aaaaaaaaaaaa";

const cost = (id: string, contractId: string) => ({
  id, contractId, year: 2026, month: 1, cost: 100,
});

const save = (contractDeleteIds: string[], existingCosts: ReturnType<typeof cost>[] = []) =>
  saveAddCostSheet({
    projectId: PROJECT_ID,
    changedRows: [],
    existingContracts: [],
    existingCosts,
    contractDeleteIds,
  });

beforeEach(() => {
  deleted = [];
  alreadyGone = new Set();
  contractDeleteFails = false;
  costDeletesFail = false;
  holdContractUpdate = undefined;
  failUpdate = undefined;
  rowsByLabel = {};
  queriedBy = {};
  createCalls = [];
  updateCalls = [];
  createReplies = [];
  updateReplies = [];
});

/** A single sheet row with one month filled in, matching `SheetRow` exactly. */
function sheetRow(over: Partial<{
  subAccountId: string | null;
  projectContractId: string | null;
  description: string;
  month1: number | null;
}> = {}) {
  const months: (number | null)[] = Array(12).fill(null);
  months[0] = over.month1 ?? 100;
  return {
    rowId: "row-1",
    accountNumber: "1.1",
    accountName: "Account",
    description: over.description ?? "Contract A",
    year: 2026,
    costPaidBy: "DevCo",
    depreciation: "Yes",
    applyVat: "Yes",
    months,
    subAccountId: over.subAccountId ?? SUBACCOUNT,
    projectContractId: over.projectContractId ?? null,
  };
}

const SUBACCOUNT = "22222222-7777-8888-9999-aaaaaaaaaaaa";
const EXISTING_CONTRACT = "33333333-7777-8888-9999-aaaaaaaaaaaa";
const EXISTING_COST = "44444444-7777-8888-9999-aaaaaaaaaaaa";

describe("saveAddCostSheet contract and cost upserts", () => {
  it(
    "UT-ADDCOST-038 a brand-new contract is CREATEd (no id in the request), and the cost row " +
      "for it binds to the id CreateMultiple's response actually returned",
    async () => {
      // First CreateMultiple call is the contract; give it a known id to check the cost row
      // binds to THAT id, not a client-generated guess.
      createReplies = [{ success: true, data: { Ids: ["55555555-0000-0000-0000-000000000000"] } }];

      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: null })],
        existingContracts: [],
        existingCosts: [],
        contractDeleteIds: [],
      });

      expect(createCalls).toHaveLength(2); // contract create, then cost create
      expect(updateCalls).toHaveLength(1); // the touched contract's total only
      const [contractCall, costCall] = createCalls as [typeof createCalls[0], typeof createCalls[0]];

      expect(contractCall.entitySetName).toBe("vsb_capexprojectcontracts");
      const contractRow = contractCall.targets[0] as Record<string, unknown>;
      expect(contractRow["vsb_name"]).toBe("Contract A");
      expect(contractRow["vsb_Project@odata.bind"]).toBe(`/vsb_projects(${PROJECT_ID})`);
      expect(contractRow["vsb_Account@odata.bind"]).toBe(`/vsb_capexaccountlists(${SUBACCOUNT})`);
      // CreateMultiple's documented shape has no id in the request body at all.
      expect(contractRow).not.toHaveProperty("vsb_capexprojectcontractid");

      expect(costCall.entitySetName).toBe("vsb_capexcosts");
      const costRow = costCall.targets[0] as Record<string, unknown>;
      expect(costRow["vsb_cost"]).toBe(100);
      expect(costRow["vsb_year"]).toBe(2026);
      expect(costRow["vsb_month"]).toBe(1);
      expect(costRow).not.toHaveProperty("vsb_capexcostid");
      // The id actually returned by the contract's CreateMultiple call, not a guess made before it.
      expect(costRow["vsb_Contract@odata.bind"])
        .toBe("/vsb_capexprojectcontracts(55555555-0000-0000-0000-000000000000)");
    },
  );

  it(
    "UT-ADDCOST-039 an existing contract and cost are UPDATEd by their real id, no navigation " +
      "bindings and no CreateMultiple call at all",
    async () => {
      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 })],
        existingContracts: [{
          id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
          isStandardContract: false, initialContractSource: null, distribution: null,
          distributionScheme: null, isEditedFromPcf: false, costType: null,
          depreciation: null, applyVat: null,
        }],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      });

      expect(createCalls).toEqual([]); // nothing new anywhere in this save
      expect(updateCalls).toHaveLength(3); // contract, cost, then the total
      const [contractCall, costCall] = updateCalls as [typeof updateCalls[0], typeof updateCalls[0]];

      const contractRow = contractCall.targets[0] as Record<string, unknown>;
      expect(contractRow["vsb_capexprojectcontractid"]).toBe(EXISTING_CONTRACT);
      expect(contractRow).not.toHaveProperty("vsb_Project@odata.bind");
      expect(contractRow).not.toHaveProperty("vsb_Account@odata.bind");

      const costRow = costCall.targets[0] as Record<string, unknown>;
      expect(costRow).toEqual({
        vsb_capexcostid: EXISTING_COST, vsb_cost: 250,
        "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost",
      });
    },
  );

  it("UT-ADDCOST-040 sends the touched contract's recomputed total through UpdateMultiple", async () => {
    // The sheet row carries only month 1 (every other month is `null` in `sheetRow()`), and a
    // row IS the complete state of its 12 months — so month 2's existing 50 is a cell the user
    // blanked out, not one left alone. `costWrites` plans it as a DELETE, same as the real
    // screen: the total must reflect that, not just the month-1 change.
    await saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 300 })],
      existingContracts: [{
        id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
        isStandardContract: false, initialContractSource: null, distribution: null,
        distributionScheme: null, isEditedFromPcf: false, costType: null,
        depreciation: null, applyVat: null,
      }],
      existingCosts: [
        { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        { id: "other-cost", contractId: EXISTING_CONTRACT, year: 2026, month: 2, cost: 50 },
      ],
      contractDeleteIds: [],
    });

    // updateCalls[0] = contract scalar update, [1] = cost month-1 update, [2] = the total.
    expect(updateCalls).toHaveLength(3);
    const totalsCall = updateCalls[2];
    expect(totalsCall?.entitySetName).toBe("vsb_capexprojectcontracts");
    expect(totalsCall?.targets).toEqual([{
      vsb_capexprojectcontractid: EXISTING_CONTRACT,
      vsb_totalcost: 300, // month 1's new 300; month 2's 50 was deleted along with the cell
      "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexprojectcontract",
    }]);
    // The blanked month-2 cell really was deleted (confirms the total's premise, not assumed).
    expect(deleted).toContain("cost:other-cost");
  });

  it("UT-ADDCOST-041 a failed contract create stops the save before any cost cell is written", async () => {
    createReplies = [{ success: false, error: "denied" }];

    await expect(saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [sheetRow({ projectContractId: null })],
      existingContracts: [],
      existingCosts: [],
      contractDeleteIds: [],
    })).rejects.toThrow("Saving contracts failed — no contracts were saved. Please retry.");

    expect(createCalls).toHaveLength(1); // the contract call only — never reached cost cells
    expect(updateCalls).toEqual([]);
  });

  it(
    "UT-ADDCOST-042 a failed cost create reports that contracts WERE saved but costs were not",
    async () => {
      // First CreateMultiple call (the contract) succeeds; second (the cost cell) fails.
      createReplies = [
        { success: true, data: { Ids: ["new-contract"] } },
        { success: false, error: "denied" },
      ];

      await expect(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: null })],
        existingContracts: [],
        existingCosts: [],
        contractDeleteIds: [],
      })).rejects.toThrow(
        "Saving cost values failed — contracts were saved, but no cost values were written. " +
        "Please retry.",
      );

      expect(createCalls).toHaveLength(2);
      expect(updateCalls).toHaveLength(0); // totals never reached
    },
  );

  it(
    "UT-ADDCOST-042b an existing contract that updates fine but whose cost update fails is " +
      "reported honestly, not as 'nothing was saved'",
    async () => {
      // Contract update succeeds; cost update fails. Both go through UpdateMultiple here (both
      // rows are existing), so this exercises `bulkStepError`'s message for that call directly —
      // `createAndUpdateMultiple`'s `partial`-forcing logic is specifically for the OTHER
      // ordering (a create that succeeds before a later update fails), covered in bulkWrite.test.ts.
      updateReplies = [{ success: true }, { success: false, error: "denied" }];

      await expect(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 })],
        existingContracts: [{
          id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
          isStandardContract: false, initialContractSource: null, distribution: null,
          distributionScheme: null, isEditedFromPcf: false, costType: null,
          depreciation: null, applyVat: null,
        }],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      })).rejects.toThrow(
        "Saving cost values failed — contracts were saved, but no cost values were written. " +
        "Please retry.",
      );
    },
  );

  it("UT-ADDCOST-043 a failed totals update reports contracts and costs were saved", async () => {
    // existingCosts is empty, so the sheet's one cost cell is NEW (goes through CreateMultiple,
    // default reply, succeeds silently) — only the contract scalar update and the totals update
    // touch UpdateMultiple, in that order, so these two replies are [contract OK, totals FAILS].
    updateReplies = [{ success: true }, { success: false, error: "denied" }];

    await expect(saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT })],
      existingContracts: [{
        id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
        isStandardContract: false, initialContractSource: null, distribution: null,
        distributionScheme: null, isEditedFromPcf: false, costType: null,
        depreciation: null, applyVat: null,
      }],
      existingCosts: [],
      contractDeleteIds: [],
    })).rejects.toThrow(/contracts and cost values were saved, but totals were not updated/);
  });

  it("UT-ADDCOST-044 nothing is sent when the sheet has no changed rows", async () => {
    await saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [],
      existingContracts: [],
      existingCosts: [],
      contractDeleteIds: [],
    });
    expect(createCalls).toEqual([]);
    expect(updateCalls).toEqual([]);
  });

  it(
    "UT-ADDCOST-045 a totals update and an UNRELATED contract's delete cascade in the same " +
      "save both complete correctly — they touch disjoint contracts, so they run together",
    async () => {
      rowsByLabel = {
        "list CAPEX comments": [{ vsb_capexcommentsid: "cm1", _vsb_capexcontract_value: DOOMED }],
      };

      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT })], // untouched by DOOMED
        existingContracts: [{
          id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
          isStandardContract: false, initialContractSource: null, distribution: null,
          distributionScheme: null, isEditedFromPcf: false, costType: null,
          depreciation: null, applyVat: null,
        }],
        existingCosts: [{ id: "doomed-cost", contractId: DOOMED, year: 2026, month: 1, cost: 1 }],
        contractDeleteIds: [DOOMED],
      });

      // The totals update ran (for EXISTING_CONTRACT, untouched by the deletion).
      const totalsCall = updateCalls.find((c) => c.entitySetName === "vsb_capexprojectcontracts"
        && "vsb_totalcost" in (c.targets[0] ?? {}));
      expect(totalsCall).toBeDefined();
      // The whole cascade for the UNRELATED doomed contract also completed.
      expect(deleted).toEqual(["comment:cm1", "cost:doomed-cost", `contract:${DOOMED}`]);
    },
  );

  it(
    "UT-ADDCOST-046 a failed delete cascade does not stop the totals update from completing, " +
      "and is reported on its own",
    async () => {
      rowsByLabel = {
        "list CAPEX comments": [{ vsb_capexcommentsid: "cm1", _vsb_capexcontract_value: DOOMED }],
      };
      contractDeleteFails = true;

      await expect(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT })],
        existingContracts: [{
          id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
          isStandardContract: false, initialContractSource: null, distribution: null,
          distributionScheme: null, isEditedFromPcf: false, costType: null,
          depreciation: null, applyVat: null,
        }],
        existingCosts: [],
        contractDeleteIds: [DOOMED],
      })).rejects.toThrow(/Removing one or more deleted contracts failed/);

      // The totals update still went through, even though the cascade failed.
      const totalsCall = updateCalls.find((c) => c.entitySetName === "vsb_capexprojectcontracts"
        && "vsb_totalcost" in (c.targets[0] ?? {}));
      expect(totalsCall).toBeDefined();
    },
  );

  /** The error a save rejected with — and a test failure, not `undefined`, if it resolved. */
  async function rejectionOf(save: Promise<void>): Promise<Error> {
    try {
      await save;
    } catch (error) {
      return error as Error;
    }
    throw new Error("expected the save to fail, but it succeeded");
  }

  const contractA = {
    id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
    isStandardContract: false, initialContractSource: null, distribution: null,
    distributionScheme: null, isEditedFromPcf: false, costType: null,
    depreciation: null, applyVat: null,
  };

  it(
    "UT-ADDCOST-047 a contracts phase that PARTLY succeeds says so plainly — never 'no " +
      "contracts were saved' in the same breath as 'some of it was written'",
    async () => {
      // A new contract (create succeeds) and an existing one (update fails), sent concurrently.
      updateReplies = [{ success: false, error: "denied" }];

      const error = await rejectionOf(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [
          sheetRow({ projectContractId: null, description: "New Contract" }),
          sheetRow({ projectContractId: EXISTING_CONTRACT }),
        ],
        existingContracts: [contractA],
        existingCosts: [],
        contractDeleteIds: [],
      }));

      expect(error.message).toBe(
        "Saving contracts stopped partway through. Some changes may already have been written. " +
        "Reopen this sheet to see the real current state before retrying.",
      );
      expect(error.message).not.toMatch(/no contracts were saved/i);
    },
  );

  it(
    "UT-ADDCOST-048 a failed cost upsert is NOT reported as 'no cost values were written' " +
      "when the cleared-cell deletes running alongside it may have landed",
    async () => {
      // updateCalls: [0] contract (OK), [1] month-1 cost update (FAILS). Month 2 is cleared,
      // so its delete runs concurrently and succeeds.
      updateReplies = [{ success: true }, { success: false, error: "denied" }];

      const error = await rejectionOf(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 300 })],
        existingContracts: [contractA],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
          { id: "cleared-cost", contractId: EXISTING_CONTRACT, year: 2026, month: 2, cost: 50 },
        ],
        contractDeleteIds: [],
      }));

      expect(deleted).toContain("cost:cleared-cost");
      expect(error.message).toMatch(/^Saving cost values stopped partway through\. Contracts were saved\./);
      expect(error.message).not.toMatch(/no cost values were written/);
    },
  );

  /**
   * An existing contract whose stored settings are EXACTLY what `sheetRow()` would write back
   * (Contract A, DevCo, depreciation Yes, VAT Yes, Individual + Absolute, edited-from-PCF, PCF
   * source) — so this save changes nothing about it, and its cost rows may go out EARLY.
   */
  const unchangedContract = {
    id: EXISTING_CONTRACT, name: "Contract A", subaccountId: SUBACCOUNT,
    isStandardContract: false,
    initialContractSource: CHOICE.initialContractSource.pcf,
    distribution: CHOICE.distributionType.individual,
    distributionScheme: CHOICE.distributionScheme.absoluteValues,
    isEditedFromPcf: true,
    costType: CHOICE.costPaidType.devCo,
    depreciation: true, applyVat: true,
  };

  /** Resolves once `predicate` holds, polling the mocks — or fails the test after ~1 s. */
  async function until(predicate: () => boolean) {
    for (let i = 0; i < 100 && !predicate(); i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(predicate()).toBe(true);
  }
  const costUpdateSent = () => updateCalls.some((c) => c.entitySetName === "vsb_capexcosts");

  /** A second existing contract whose VAT setting this save DOES change (stored No, sheet Yes). */
  const CHANGED_CONTRACT = "88888888-7777-8888-9999-aaaaaaaaaaaa";
  const CHANGED_COST = "99999999-7777-8888-9999-aaaaaaaaaaaa";
  const changedContract = { ...unchangedContract, id: CHANGED_CONTRACT, name: "Contract B", applyVat: false };
  const costIdsUpdated = () => updateCalls
    .filter((c) => c.entitySetName === "vsb_capexcosts")
    .flatMap((c) => c.targets.map((t) => t["vsb_capexcostid"]));

  it(
    "UT-ADDCOST-051 cost rows of EVERY existing contract — settings changed or not — are sent " +
      "while the contracts step is still in flight",
    async () => {
      let release: () => void = () => {};
      holdContractUpdate = new Promise((r) => { release = r; });

      const saving = saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [
          sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 }),
          sheetRow({ projectContractId: CHANGED_CONTRACT, description: "Contract B", month1: 60 }),
        ],
        existingContracts: [unchangedContract, changedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
          { id: CHANGED_COST, contractId: CHANGED_CONTRACT, year: 2026, month: 1, cost: 10 },
        ],
        contractDeleteIds: [],
      });

      // Contract B's settings update is being held; both contracts' cost rows go out anyway.
      await until(() => costIdsUpdated().includes(EXISTING_COST)
        && costIdsUpdated().includes(CHANGED_COST));
      release();
      await saving;
    },
  );

  it(
    "UT-ADDCOST-059 the contract-delete cascade runs while the contracts step is still in " +
      "flight, children before parents",
    async () => {
      let release: () => void = () => {};
      holdContractUpdate = new Promise((r) => { release = r; });

      const saving = saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [
          sheetRow({ projectContractId: CHANGED_CONTRACT, description: "Contract B", month1: 60 }),
        ],
        existingContracts: [changedContract],
        existingCosts: [
          { id: CHANGED_COST, contractId: CHANGED_CONTRACT, year: 2026, month: 1, cost: 10 },
          cost("doomed-cost", DOOMED),
        ],
        contractDeleteIds: [DOOMED],
      });

      await until(() => deleted.includes(`contract:${DOOMED}`));
      expect(deleted).toEqual(["cost:doomed-cost", `contract:${DOOMED}`]);
      release();
      await saving;
    },
  );

  it(
    "UT-ADDCOST-056 a contract whose settings don't change is NOT sent a no-op settings update " +
      "— but still gets its total written, so it is updated exactly once by this save",
    async () => {
      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 })],
        existingContracts: [unchangedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      });

      const contractWrites = updateCalls
        .filter((c) => c.entitySetName === "vsb_capexprojectcontracts")
        .flatMap((c) => c.targets)
        .filter((t) => t["vsb_capexprojectcontractid"] === EXISTING_CONTRACT);
      expect(contractWrites).toHaveLength(1);
      expect(contractWrites[0]).toMatchObject({ vsb_totalcost: 250 });
      expect(contractWrites[0]).not.toHaveProperty("vsb_name");
    },
  );

  it(
    "UT-ADDCOST-057 a contract whose settings DO change still gets its settings update, then " +
      "its total",
    async () => {
      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: CHANGED_CONTRACT, description: "Contract B", month1: 60 })],
        existingContracts: [changedContract],
        existingCosts: [],
        contractDeleteIds: [],
      });

      const contractWrites = updateCalls
        .filter((c) => c.entitySetName === "vsb_capexprojectcontracts")
        .flatMap((c) => c.targets);
      expect(contractWrites[0]).toMatchObject({ vsb_capexprojectcontractid: CHANGED_CONTRACT, vsb_applyvat: true });
      expect(contractWrites[1]).toMatchObject({ vsb_capexprojectcontractid: CHANGED_CONTRACT, vsb_totalcost: 60 });
    },
  );

  const totalsCalls = () => updateCalls.filter((c) => "vsb_totalcost" in (c.targets[0] ?? {}));

  it(
    "UT-ADDCOST-062 a total equal to the stored one is not re-sent, and with nothing else to " +
      "write the totals step makes no request",
    async () => {
      // Month 1 moves 100 -> 250, month 2 moves 50 -> -100: the sum stays 150.
      const changedRow = sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 });
      changedRow.months[1] = -100;
      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [changedRow],
        existingContracts: [{ ...unchangedContract, totalCost: 150 }],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
          { id: "feb-cost", contractId: EXISTING_CONTRACT, year: 2026, month: 2, cost: 50 },
        ],
        contractDeleteIds: [],
      });

      expect(costIdsUpdated()).toEqual([EXISTING_COST, "feb-cost"]);
      expect(totalsCalls()).toEqual([]);
    },
  );

  it("UT-ADDCOST-063 a total that differs from the stored one is written", async () => {
    await saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 })],
      existingContracts: [{ ...unchangedContract, totalCost: 100 }],
      existingCosts: [
        { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
      ],
      contractDeleteIds: [],
    });

    expect(totalsCalls().flatMap((c) => c.targets)).toEqual([expect.objectContaining({
      vsb_capexprojectcontractid: EXISTING_CONTRACT, vsb_totalcost: 250,
    })]);
  });

  it("UT-ADDCOST-064 a missing stored total (null) is always written", async () => {
    await saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 100 })],
      existingContracts: [{ ...unchangedContract, totalCost: null }],
      existingCosts: [],
      contractDeleteIds: [],
    });

    expect(totalsCalls().flatMap((c) => c.targets)).toEqual([expect.objectContaining({
      vsb_capexprojectcontractid: EXISTING_CONTRACT, vsb_totalcost: 100,
    })]);
  });

  it(
    "UT-ADDCOST-052 cost rows of a contract whose settings DO change no longer wait for the " +
      "contract update — no plug-in reads the parent contract",
    async () => {
      let release: () => void = () => {};
      holdContractUpdate = new Promise((r) => { release = r; });

      const saving = saveAddCostSheet({
        projectId: PROJECT_ID,
        // VAT flips Yes -> No in this save: a setting change on the parent contract.
        changedRows: [{ ...sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 }), applyVat: "No" }],
        existingContracts: [unchangedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      });

      await until(costUpdateSent); // sent while the contract update is still held
      release();
      await saving;
    },
  );

  it(
    "UT-ADDCOST-053 an early cost-value failure when NOTHING else was written says exactly that, " +
      "and stops the save before totals",
    async () => {
      failUpdate = (set) => set === "vsb_capexcosts";

      const error = await rejectionOf(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 })],
        existingContracts: [unchangedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      }));

      // The only contract is unchanged, so no contract update was sent: nothing was written.
      expect(error.message).toBe("Saving cost values failed — no cost values were written. Please retry.");
      expect(updateCalls.some((c) => "vsb_totalcost" in (c.targets[0] ?? {}))).toBe(false);
    },
  );

  it(
    "UT-ADDCOST-053b an early cost-value failure alongside a contract update that landed says " +
      "the contracts were saved — not that nothing was",
    async () => {
      failUpdate = (set) => set === "vsb_capexcosts";

      const error = await rejectionOf(saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [
          sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 }),
          sheetRow({ projectContractId: CHANGED_CONTRACT, description: "Contract B", month1: 60 }),
        ],
        existingContracts: [unchangedContract, changedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      }));

      expect(error.message).toMatch(/^Saving cost values stopped partway through\. Contracts were saved\./);
      expect(updateCalls.some((c) => "vsb_totalcost" in (c.targets[0] ?? {}))).toBe(false);
    },
  );

  it(
    "UT-ADDCOST-054 the early path still produces the right total, including a cleared cell " +
      "deleted early",
    async () => {
      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 300 })],
        existingContracts: [unchangedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
          { id: "cleared-cost", contractId: EXISTING_CONTRACT, year: 2026, month: 2, cost: 50 },
        ],
        contractDeleteIds: [],
      });

      expect(deleted).toContain("cost:cleared-cost");
      const totals = updateCalls.find((c) => "vsb_totalcost" in (c.targets[0] ?? {}));
      expect(totals?.targets[0]).toMatchObject({
        vsb_capexprojectcontractid: EXISTING_CONTRACT, vsb_totalcost: 300,
      });
    },
  );

  it(
    "UT-ADDCOST-055 a mixed save — one unchanged contract (early) and one brand-new contract " +
      "(late) — writes every cost row exactly once",
    async () => {
      createReplies = [{ success: true, data: { Ids: ["77777777-0000-0000-0000-000000000000"] } }];

      await saveAddCostSheet({
        projectId: PROJECT_ID,
        changedRows: [
          sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 250 }),
          sheetRow({ projectContractId: null, description: "New Contract", month1: 40 }),
        ],
        existingContracts: [unchangedContract],
        existingCosts: [
          { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        ],
        contractDeleteIds: [],
      });

      const costUpdates = updateCalls.filter((c) => c.entitySetName === "vsb_capexcosts")
        .flatMap((c) => c.targets);
      const costCreates = createCalls.filter((c) => c.entitySetName === "vsb_capexcosts")
        .flatMap((c) => c.targets);
      expect(costUpdates).toEqual([expect.objectContaining({ vsb_capexcostid: EXISTING_COST, vsb_cost: 250 })]);
      expect(costCreates).toEqual([expect.objectContaining({
        vsb_cost: 40,
        "vsb_Contract@odata.bind": "/vsb_capexprojectcontracts(77777777-0000-0000-0000-000000000000)",
      })]);
    },
  );

  it("UT-ADDCOST-049 when BOTH cost legs fail, both failures are reported, neither hidden", async () => {
    updateReplies = [{ success: true }, { success: false, error: "denied" }];
    costDeletesFail = true;

    const error = await rejectionOf(saveAddCostSheet({
      projectId: PROJECT_ID,
      changedRows: [sheetRow({ projectContractId: EXISTING_CONTRACT, month1: 300 })],
      existingContracts: [contractA],
      existingCosts: [
        { id: EXISTING_COST, contractId: EXISTING_CONTRACT, year: 2026, month: 1, cost: 100 },
        { id: "cleared-cost", contractId: EXISTING_CONTRACT, year: 2026, month: 2, cost: 50 },
      ],
      contractDeleteIds: [],
    }));

    expect(error.message).toMatch(/Saving cost values/);
    expect(error.message).toMatch(/Removing the cleared cost cells failed/);
  });
});

describe("saveAddCostSheet contract deletion", () => {
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

  it(
    "UT-ADDCOST-034 keeps each contract's children with it when several go at once " +
      "(different contracts run concurrently, so only the WITHIN-contract order is guaranteed)",
    async () => {
      rowsByLabel = {
        "list CAPEX comments": [
          { vsb_capexcommentsid: "cm-a", _vsb_capexcontract_value: DOOMED },
          { vsb_capexcommentsid: "cm-b", _vsb_capexcontract_value: OTHER },
        ],
      };

      await save([DOOMED, OTHER], [cost("cost-a", DOOMED), cost("cost-b", OTHER)]);

      expect(deleted).toHaveLength(6);
      const at = (entry: string) => deleted.indexOf(entry);
      // DOOMED's own three steps, in order, wherever they fall relative to OTHER's.
      expect(at("comment:cm-a")).toBeLessThan(at("cost:cost-a"));
      expect(at("cost:cost-a")).toBeLessThan(at(`contract:${DOOMED}`));
      // OTHER's own three steps, in order.
      expect(at("comment:cm-b")).toBeLessThan(at("cost:cost-b"));
      expect(at("cost:cost-b")).toBeLessThan(at(`contract:${OTHER}`));
    },
  );

  it(
    "UT-ADDCOST-050 deletes in three GLOBAL phases — every comment of every doomed contract " +
      "before ANY cost row, every cost row before ANY contract",
    async () => {
      rowsByLabel = {
        "list CAPEX comments": [
          { vsb_capexcommentsid: "cm-a", _vsb_capexcontract_value: DOOMED },
          { vsb_capexcommentsid: "cm-b", _vsb_capexcontract_value: OTHER },
        ],
      };

      await save(
        [DOOMED, OTHER],
        [cost("cost-a1", DOOMED), cost("cost-a2", DOOMED), cost("cost-b1", OTHER)],
      );

      const kinds = deleted.map((d) => d.split(":")[0]);
      const lastIndexOf = (k: string) => kinds.lastIndexOf(k);
      const firstIndexOf = (k: string) => kinds.indexOf(k);
      expect(lastIndexOf("comment")).toBeLessThan(firstIndexOf("cost"));
      expect(lastIndexOf("cost")).toBeLessThan(firstIndexOf("contract"));
      expect(deleted).toHaveLength(7);
    },
  );

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

  it("UT-ADDCOST-061 a cost row already deleted elsewhere (404) does not fail the cascade", async () => {
    alreadyGone = new Set(["gone-cost"]);
    await save([DOOMED], [cost("gone-cost", DOOMED), cost("live-cost", DOOMED)]);
    expect(deleted).toEqual(["cost:live-cost", `contract:${DOOMED}`]);
  });

  it("UT-ADDCOST-037 still deletes a contract that has no comments", async () => {
    await save([DOOMED], [cost("cost-1", DOOMED)]);
    expect(deleted).toEqual(["cost:cost-1", `contract:${DOOMED}`]);
  });
});
