/**
 * `src/data/settings/contracts.ts` with mocked services: the exact select/filter strings
 * (DR-2, DR-4, DR-12), paging without truncation, the DR-8 phase order and payloads with
 * typed partial failures, and DR-9 error propagation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let saGetAllOptions: unknown[] = [];
let saRows: unknown[] = [];
let saCreateResult: { success: boolean; data?: unknown; error?: unknown } = { success: true, data: { vsb_bopcontractsstandardassumptionsid: "new-id" } };
let saUpdateResult: { success: boolean; data?: unknown; error?: unknown } = { success: true, data: {} };
const saPayloads: unknown[] = [];
let deleteFails: boolean | "gone" = false;
/** V-1: contract ids the guarded update's existence check reports as deleted. */
let goneContracts = new Set<string>();

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn().mockResolvedValue({ success: true, data: [] }),
    createRecordAsync: vi.fn(),
    deleteRecordAsync: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  }),
}));

vi.mock("@/generated/services/Vsb_bopcontractsstandardassumptionsesService", () => ({
  Vsb_bopcontractsstandardassumptionsesService: {
    getAll: async (o: unknown) => { saGetAllOptions.push(o); return { success: true, data: saRows }; },
    get: async () => ({ success: true, data: { vsb_bopcontractsstandardassumptionsid: "x", vsb_name: "n" } }),
    create: async (p: unknown) => { calls.push("parent:create"); saPayloads.push(p); return saCreateResult; },
    update: async () => { throw new Error("the unguarded service update must never be called (V-1)"); },
  },
}));

const countryGetAllOptions: unknown[] = [];
vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: {
    getAll: async (o: unknown) => {
      countryGetAllOptions.push(o);
      return {
        success: true,
        data: [
          { vsb_countryid: "g", vsb_name: "Germany", vsb_isocurrencycode: "EUR", statecode: 0 },
          { vsb_countryid: "f", vsb_name: null, vsb_isocurrencycode: null, statecode: 0 },
          { vsb_countryid: "p", vsb_name: "Poland", vsb_isocurrencycode: "PLN", statecode: 1 },
        ],
      };
    },
  },
}));

vi.mock("@/data/client", async () => {
  const actual = await vi.importActual<typeof import("@/data/client")>("@/data/client");
  return {
    ...actual,
    // V-1: the guarded update (contract tested in `client.updateRecordIfExists.test.ts`).
    updateRecordIfExists: async (op: string, table: string, id: string, p: unknown) => {
      const { RecordGoneError, unwrap } = await import("@/platform/errors");
      if (goneContracts.has(id)) throw new RecordGoneError(op, table, id);
      calls.push(`parent:update:${id}`);
      saPayloads.push(p);
      return unwrap(saUpdateResult as never, op);
    },
    deleteRecord: async (_op: string, table: string, id: string) => {
      if (deleteFails) {
        const { DataError } = await import("@/platform/errors");
        throw new DataError("delete", "refused by plugin", deleteFails === "gone" ? 404 : 400);
      }
      calls.push(`delete:${table}:${id}`);
    },
  };
});

import {
  ContractSaveError, DevCoTableUnavailableError, OwnershipConflictError, contractFilter, createDevCoRepository,
  deleteStandardContract, devCoFilter, listStandardContracts, saveStandardContract,
  type DevCoClient, type DevCoCreate, type DevCoRepository,
} from "./contracts";
import { BulkWriteError } from "@/data/bulkWrite";
import { activeOnly, listCountries } from "@/data/countries";
import { CONTRACT_COUNTRY_RULE, pickerCountries } from "@/domain/countryPicker";
import { DataError, RecordGoneError } from "@/platform/errors";
import { initialForm, type DevCoRow } from "@/features/settings/contracts/rules";

const C = "11111111-1111-1111-1111-111111111111";
const WIND = 952850000;

/** A fake repository recording the phase calls. */
function fakeRepo(scope: DevCoRow[], opts: { createFails?: boolean; removeFails?: boolean; listFails?: boolean } = {}) {
  const created: DevCoCreate[] = [];
  const removed: string[] = [];
  const repo: DevCoRepository = {
    isAvailable: () => true,
    listByScope: async () => {
      calls.push("scope");
      if (opts.listFails) throw new DevCoTableUnavailableError("list");
      return scope;
    },
    createMany: async (rows) => {
      calls.push(`create:${rows.length}`);
      if (opts.createFails) throw new BulkWriteError("bulk refused", false);
      created.push(...rows);
      return rows.map((_, i) => `n${i}`);
    },
    remove: async (id) => {
      calls.push(`remove:${id}`);
      if (opts.removeFails) throw new DataError("remove", "no", 500);
      removed.push(id);
    },
  };
  return { repo, created, removed };
}

const accounts = new Map([
  ["a", { number: "10101", name: "Grid connection" }],
  ["b", { number: "10102", name: "Study" }],
  ["c", { number: "20101", name: "Insurance" }],
]);

function input(overrides: Partial<Parameters<typeof saveStandardContract>[0]> = {}) {
  return {
    contractType: 952850001, countryId: C, technology: WIND, lang: "en-US", accounts,
    form: { ...initialForm(undefined, [], "en-US"), description: "Turbine", monthText: "3", selectedAccountIds: ["a", "b"] },
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  saPayloads.length = 0;
  saGetAllOptions = [];
  saRows = [];
  deleteFails = false;
  saCreateResult = { success: true, data: { vsb_bopcontractsstandardassumptionsid: "new-id" } };
  saUpdateResult = { success: true, data: {} };
  goneContracts = new Set();
});

describe("reads (DR-2, DR-4, DR-12)", () => {
  it("lists contracts with the exact select, filter and order", async () => {
    await listStandardContracts(C, WIND);
    expect(saGetAllOptions[0]).toMatchObject({
      select: [
        "vsb_bopcontractsstandardassumptionsid", "vsb_name", "vsb_description", "_vsb_country_value",
        "vsb_technology", "vsb_contracttypes", "vsb_closingdatereference", "vsb_monthdifference",
        "vsb_margin", "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue", "vsb_comment",
        "statecode",
      ],
      filter: `(_vsb_country_value eq ${C}) and (vsb_technology eq ${WIND})`,
      orderBy: ["vsb_contracttypes asc", "vsb_name asc"],
    });
    expect(contractFilter(C, WIND)).toContain("_vsb_country_value");
  });

  it("maps the closing-reference choice label for an unknown code (parity r2, NG-4)", async () => {
    saRows = [
      {
        vsb_bopcontractsstandardassumptionsid: "u", vsb_name: "n", vsb_closingdatereference: 952850009,
        "vsb_closingdatereference@OData.Community.Display.V1.FormattedValue": "Cluster 6",
      },
      { vsb_bopcontractsstandardassumptionsid: "v", vsb_name: "m", vsb_closingdatereference: 952850001 },
    ];
    const [unknown, known] = await listStandardContracts(C, WIND);
    expect(unknown).toMatchObject({ closingRef: 952850009, closingRefText: "Cluster 6" });
    expect(known!.closingRefText).toBeUndefined();
  });

  it("filters DevCo children through the parent contract lookup", () => {
    expect(devCoFilter(C, WIND)).toBe(
      `(vsb_BoPContractStandardAssumption/_vsb_country_value eq ${C}) and (vsb_BoPContractStandardAssumption/vsb_technology eq ${WIND})`,
    );
  });

  it("pages DevCo rows past 500 without truncation, always with a filter", async () => {
    const page = (n: number, offset: number) => Array.from({ length: n }, (_, i) => ({
      vsb_bopcontractsstandardassumptiondevcocostsid: `r${offset + i}`,
      _vsb_bopcontractstandardassumption_value: "p", _vsb_capexaccount_value: `a${offset + i}`,
    }));
    const seen: { filter?: string; select?: string[]; skipToken?: string }[] = [];
    const client: DevCoClient = {
      retrieveMultipleRecordsAsync: (async (_table: string, o?: { filter?: string; select?: string[]; skipToken?: string }) => {
        seen.push(o ?? {});
        return o?.skipToken
          ? { success: true, data: page(120, 500) }
          : { success: true, data: page(500, 0), skipToken: "next" };
      }) as unknown as DevCoClient["retrieveMultipleRecordsAsync"],
      createRecordAsync: vi.fn() as unknown as DevCoClient["createRecordAsync"],
    };
    const repo = createDevCoRepository({ client: () => client, isRegistered: () => true });
    const rows = await repo.listByScope(C, WIND);
    expect(rows).toHaveLength(620);
    expect(seen).toHaveLength(2);
    for (const o of seen) {
      expect(o.filter).toBe(devCoFilter(C, WIND));
      expect(o.select).toEqual([
        "vsb_bopcontractsstandardassumptiondevcocostsid", "_vsb_bopcontractstandardassumption_value",
        "_vsb_capexaccount_value", "_vsb_rootcapexaccount_value",
      ]);
    }
  });

  it("reports an unregistered DevCo table as a typed error, not a crash", async () => {
    const repo = createDevCoRepository({ client: () => { throw new Error("must not be called"); }, isRegistered: () => false });
    expect(repo.isAvailable()).toBe(false);
    await expect(repo.listByScope(C, WIND)).rejects.toBeInstanceOf(DevCoTableUnavailableError);
    await expect(repo.remove("x")).rejects.toBeInstanceOf(DevCoTableUnavailableError);
  });

  it("turns a failed page into a DataError", async () => {
    const client = {
      retrieveMultipleRecordsAsync: async () => ({ success: false, data: [], error: { message: "boom", status: 500 } }),
      createRecordAsync: vi.fn(),
    } as unknown as DevCoClient;
    const repo = createDevCoRepository({ client: () => client, isRegistered: () => true });
    await expect(repo.listByScope(C, WIND)).rejects.toBeInstanceOf(DataError);
  });

  it("unlinks through the shared rawTable: deleteRecordAsync by entity set; a throw becomes a DataError", async () => {
    const deleteRecordAsync = vi.fn().mockResolvedValue({ success: true, data: undefined });
    const ok = createDevCoRepository({
      client: () => ({ retrieveMultipleRecordsAsync: vi.fn(), createRecordAsync: vi.fn(), deleteRecordAsync } as unknown as DevCoClient),
      isRegistered: () => true,
    });
    await ok.remove("k1");
    expect(deleteRecordAsync).toHaveBeenCalledWith("vsb_bopcontractsstandardassumptiondevcocostses", "k1");

    const failing = createDevCoRepository({
      client: () => ({
        retrieveMultipleRecordsAsync: vi.fn(), createRecordAsync: vi.fn(),
        deleteRecordAsync: vi.fn().mockRejectedValue(new Error("sdk threw")),
      } as unknown as DevCoClient),
      isRegistered: () => true,
    });
    await expect(failing.remove("k1")).rejects.toBeInstanceOf(DataError);
  });

  it("falls back to per-row creates when CreateMultiple is refused, never sending the root account", async () => {
    const createRecordAsync = vi.fn().mockImplementation(async () => ({ success: true, data: { vsb_bopcontractsstandardassumptiondevcocostsid: "row" } }));
    const repo = createDevCoRepository({
      client: () => ({ retrieveMultipleRecordsAsync: vi.fn(), createRecordAsync } as unknown as DevCoClient),
      isRegistered: () => true,
      bulkCreate: async () => { throw new BulkWriteError("not enabled", false); },
    });
    const ids = await repo.createMany([{
      vsb_name: "1-a", "vsb_BoPContractStandardAssumption@odata.bind": "/x(1)",
      "vsb_CAPEXAccount@odata.bind": "/y(1)", "crc36_Country@odata.bind": "/z(1)", crc36_technology: WIND,
    }]);
    expect(ids).toEqual(["row"]);
    const sent = createRecordAsync.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(sent).some((k) => k.toLowerCase().includes("rootcapexaccount"))).toBe(false);
  });
});

describe("saveStandardContract (DR-8)", () => {
  it("creates a new contract: check, parent, zero removals, additions", async () => {
    const { repo, created } = fakeRepo([{ id: "o1", contractId: "other", accountId: "c" }]);
    const result = await saveStandardContract(input(), repo);
    expect(result).toEqual({ contractId: "new-id" });
    expect(calls).toEqual(["scope", "parent:create", "create:2"]);
    expect(created[0]).toEqual({
      vsb_name: "10101-Grid connection",
      "vsb_BoPContractStandardAssumption@odata.bind": "/vsb_bopcontractsstandardassumptionses(new-id)",
      "vsb_CAPEXAccount@odata.bind": "/vsb_capexaccountlists(a)",
      "crc36_Country@odata.bind": `/vsb_countries(${C})`,
      crc36_technology: WIND,
    });
    expect(saPayloads[0]).toMatchObject({
      vsb_name: "Development Contract - Turbine", vsb_margin: false,
      vsb_margintype: null, vsb_marginpercentage: null, vsb_marginfixedvalue: null,
    });
  });

  it("edits: removes only this contract's deselected children, then adds", async () => {
    const { repo, removed, created } = fakeRepo([
      { id: "k1", contractId: "me", accountId: "a" },
      { id: "k3", contractId: "me", accountId: "c" },
      { id: "o1", contractId: "other", accountId: "x" },
    ]);
    await saveStandardContract(input({ contractId: "me" }), repo);
    expect(calls).toEqual(["scope", "parent:update:me", "remove:k3", "create:1"]);
    expect(removed).toEqual(["k3"]);
    expect(created.map((r) => r["vsb_CAPEXAccount@odata.bind"])).toEqual(["/vsb_capexaccountlists(b)"]);
  });

  it("never deletes an existing link to an inactive (hidden) CAPEX account on save (parity r2, NG-5)", async () => {
    // "h" is not in the active-only tree, but the panel keeps it in the selection.
    const { repo, removed, created } = fakeRepo([
      { id: "k-h", contractId: "me", accountId: "h" },
      { id: "k1", contractId: "me", accountId: "a" },
    ]);
    const form = { ...input().form, selectedAccountIds: ["a", "h"] };
    await saveStandardContract(input({ contractId: "me", form }), repo);
    expect(removed).toEqual([]);
    expect(created).toEqual([]);
    expect(calls).toEqual(["scope", "parent:update:me", "create:0"]);
  });

  it("refuses an account just linked to another contract, before writing anything (D-23)", async () => {
    const { repo } = fakeRepo([{ id: "o1", contractId: "other", accountId: "a" }]);
    const error = await saveStandardContract(input(), repo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractSaveError);
    expect((error as ContractSaveError).phase).toBe("check");
    expect((error as ContractSaveError).cause).toBeInstanceOf(OwnershipConflictError);
    expect(calls).toEqual(["scope"]);
  });

  it("fails the check phase when the DevCo table is unavailable", async () => {
    const { repo } = fakeRepo([], { listFails: true });
    const error = (await saveStandardContract(input(), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("check");
    expect(error.cause).toBeInstanceOf(DevCoTableUnavailableError);
  });

  it("reports a parent failure with no contract id", async () => {
    saCreateResult = { success: false, error: { message: "denied", status: 403 } };
    const { repo } = fakeRepo([]);
    const error = (await saveStandardContract(input(), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("parent");
    expect(error.contractId).toBeUndefined();
    expect((error.cause as DataError).isForbidden).toBe(true);
  });

  it("returns a typed partial failure on removals, carrying the contract id", async () => {
    const { repo } = fakeRepo([{ id: "k3", contractId: "me", accountId: "c" }], { removeFails: true });
    const error = (await saveStandardContract(input({ contractId: "me" }), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("removals");
    expect(error.contractId).toBe("me");
    expect(error.parentSaved).toBe(true);
  });

  it("returns a typed partial failure on additions; a retry re-sends only the missing links", async () => {
    const failing = fakeRepo([], { createFails: true });
    const error = (await saveStandardContract(input(), failing.repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("additions");
    expect(error.contractId).toBe("new-id");

    // Retry: the parent now exists and one link landed meanwhile.
    calls.length = 0;
    const retry = fakeRepo([{ id: "k1", contractId: "new-id", accountId: "a" }]);
    await saveStandardContract(input({ contractId: error.contractId }), retry.repo);
    expect(calls).toEqual(["scope", "parent:update:new-id", "create:1"]);
    expect(retry.created.map((r) => r["vsb_CAPEXAccount@odata.bind"])).toEqual(["/vsb_capexaccountlists(b)"]);
  });
});

describe("gap closure (08-gap-analysis G-6)", () => {
  it("DR-3: the shared countries read gives the picker active rows with ISO currency, nulls mapped", async () => {
    // Batch 2b: the screen's own `listPickerCountries` was replaced by `@/data/countries`
    // (`useActiveCountries` = `activeOnly` over one read) and `pickerCountries(…, CONTRACT_COUNTRY_RULE)`.
    countryGetAllOptions.length = 0;
    const active = activeOnly(await listCountries());
    expect((countryGetAllOptions[0] as { select: string[] }).select)
      .toEqual(expect.arrayContaining(["vsb_countryid", "vsb_name", "vsb_isocurrencycode", "statecode"]));
    expect(active.map(({ id, name, isoCurrencyCode }) => ({ id, name, isoCurrencyCode }))).toEqual([
      { id: "g", name: "Germany", isoCurrencyCode: "EUR" },
      { id: "f", name: "", isoCurrencyCode: undefined },
    ]);
    // The inactive Poland row never reaches the Contracts allow-list.
    expect(pickerCountries(active, CONTRACT_COUNTRY_RULE).map((c) => c.name)).toEqual(["Germany"]);
  });

  it("DR-12: the SA list and the SADC scope read never go out without a non-empty filter", async () => {
    await listStandardContracts(C, WIND);
    const saFilter = (saGetAllOptions[0] as { filter?: string }).filter;
    expect(typeof saFilter).toBe("string");
    expect(saFilter!.length).toBeGreaterThan(0);

    const seen: { filter?: string }[] = [];
    const client = {
      retrieveMultipleRecordsAsync: async (_t: string, o?: { filter?: string }) => { seen.push(o ?? {}); return { success: true, data: [] }; },
      createRecordAsync: vi.fn(),
    } as unknown as DevCoClient;
    await createDevCoRepository({ client: () => client, isRegistered: () => true }).listByScope(C, WIND);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.filter && seen[0]!.filter.length).toBeGreaterThan(0);
  });

  it("FR-1: a 403 on the parent UPDATE is a forbidden DataError carried by the parent phase", async () => {
    saUpdateResult = { success: false, error: { message: "denied", status: 403 } };
    const { repo } = fakeRepo([]);
    const error = (await saveStandardContract(input({ contractId: "me" }), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("parent");
    expect(error.contractId).toBe("me");
    expect(error.cause).toBeInstanceOf(DataError);
    expect((error.cause as DataError).isForbidden).toBe(true);
    expect(calls).toEqual(["scope", "parent:update:me"]);
  });
});

describe("V-1 upsert guard (S1)", () => {
  it("editing a contract deleted meanwhile fails the parent phase with RecordGoneError and writes nothing", async () => {
    goneContracts.add("me");
    const { repo } = fakeRepo([{ id: "k3", contractId: "me", accountId: "c" }]);
    const error = (await saveStandardContract(input({ contractId: "me" }), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error).toBeInstanceOf(ContractSaveError);
    expect(error.phase).toBe("parent");
    expect(error.cause).toBeInstanceOf(RecordGoneError);
    expect(calls).toEqual(["scope"]);
    expect(saPayloads).toEqual([]);
  });
});

describe("deleteStandardContract (DR-9)", () => {
  it("deletes the parent only — children cascade on the server", async () => {
    await expect(deleteStandardContract("c1")).resolves.toEqual({ alreadyDeleted: false });
    expect(calls).toEqual(["delete:vsb_bopcontractsstandardassumptionses:c1"]);
  });

  it("propagates a refusal as a DataError", async () => {
    deleteFails = true;
    await expect(deleteStandardContract("c1")).rejects.toBeInstanceOf(DataError);
  });

  it("treats a 404 (already deleted by another user) as done (parity r3, R3-1)", async () => {
    deleteFails = "gone";
    await expect(deleteStandardContract("c1")).resolves.toEqual({ alreadyDeleted: true });
  });
});
