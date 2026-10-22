/**
 * `src/data/adminContract.ts` with mocked services: the exact select/filter strings,
 * paging without truncation, the save phase order and payloads with
 * typed partial failures, and delete error propagation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let saGetAllOptions: unknown[] = [];
let saRows: unknown[] = [];
let saCreateResult: { success: boolean; data?: unknown; error?: unknown } = { success: true, data: { vsb_bopcontractsstandardassumptionsid: "new-id" } };
let saUpdateResult: { success: boolean; data?: unknown; error?: unknown } = { success: true, data: {} };
const saPayloads: unknown[] = [];
let deleteFails: boolean | "gone" = false;
/** Contract ids the guarded update's existence check reports as deleted. */
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
    update: async () => { throw new Error("the unguarded service update must never be called (upsert guard)"); },
  },
}));

/** SADC (`vsb_bopcontractsstandardassumptiondevcocostses`) generated service, driven per test. */
let devCoGetAll: (o: { filter?: string; select?: string[]; skipToken?: string }) => Promise<unknown> = async () => ({ success: true, data: [] });
let devCoCreate: (row: Record<string, unknown>) => Promise<unknown> = async () => ({ success: true, data: {} });
vi.mock("@/generated/services/Vsb_bopcontractsstandardassumptiondevcocostsesService", () => ({
  Vsb_bopcontractsstandardassumptiondevcocostsesService: {
    getAll: (o: { filter?: string; select?: string[]; skipToken?: string }) => devCoGetAll(o),
    create: (row: Record<string, unknown>) => devCoCreate(row),
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
    // the guarded update (contract tested in `client.updateRecordIfExists.test.ts`).
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
  type DevCoCreate, type DevCoRepository,
} from "./adminContract";
import { activeOnly, listCountries } from "@/data/countries";
import { CONTRACT_COUNTRY_RULE, pickerCountries } from "@/domain/countryPicker";
import { DataError, RecordGoneError } from "@/platform/errors";
import { initialForm, type DevCoRow } from "@/domain/contractStandards";

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
      if (opts.createFails) throw new DataError("link DevCo accounts", "refused", 500);
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
  devCoGetAll = async () => ({ success: true, data: [] });
  devCoCreate = async () => ({ success: true, data: {} });
});

describe("Reads", () => {
  it("UT-ADCONTR-001 Lists contracts with the exact select, filter and order", async () => {
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

  it("UT-ADCONTR-002 Maps the closing-reference choice label for an unknown code", async () => {
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

  it("UT-ADCONTR-003 Filters DevCo children through the parent contract lookup", () => {
    expect(devCoFilter(C, WIND)).toBe(
      `(vsb_BoPContractStandardAssumption/_vsb_country_value eq ${C}) and (vsb_BoPContractStandardAssumption/vsb_technology eq ${WIND})`,
    );
  });

  it("UT-ADCONTR-004 Pages DevCo rows past 500 without truncation, always with a filter", async () => {
    const page = (n: number, offset: number) => Array.from({ length: n }, (_, i) => ({
      vsb_bopcontractsstandardassumptiondevcocostsid: `r${offset + i}`,
      _vsb_bopcontractstandardassumption_value: "p", _vsb_capexaccount_value: `a${offset + i}`,
    }));
    const seen: { filter?: string; select?: string[]; skipToken?: string }[] = [];
    devCoGetAll = async (o) => {
      seen.push(o);
      return o.skipToken
        ? { success: true, data: page(120, 500) }
        : { success: true, data: page(500, 0), skipToken: "next" };
    };
    const repo = createDevCoRepository({ isRegistered: () => true });
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

  it("UT-ADCONTR-005 Reports an unregistered DevCo table as a typed error, not a crash", async () => {
    devCoGetAll = async () => { throw new Error("must not be called"); };
    const repo = createDevCoRepository({ isRegistered: () => false });
    expect(repo.isAvailable()).toBe(false);
    await expect(repo.listByScope(C, WIND)).rejects.toBeInstanceOf(DevCoTableUnavailableError);
    await expect(repo.remove("x")).rejects.toBeInstanceOf(DevCoTableUnavailableError);
  });

  it("UT-ADCONTR-006 Turns a failed page into a DataError", async () => {
    devCoGetAll = async () => ({ success: false, data: [], error: { message: "boom", status: 500 } });
    const repo = createDevCoRepository({ isRegistered: () => true });
    await expect(repo.listByScope(C, WIND)).rejects.toBeInstanceOf(DataError);
  });

  it("UT-ADCONTR-007 Turns a THROWN page read into a DataError naming the entity set", async () => {
    devCoGetAll = async () => { throw new Error("sdk threw"); };
    const repo = createDevCoRepository({ isRegistered: () => true });
    const error = await repo.listByScope(C, WIND).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toBe("read vsb_bopcontractsstandardassumptiondevcocostses");
  });

  it("UT-ADCONTR-008 Unlinks through deleteRecord by entity set; a refusal is a DataError", async () => {
    const repo = createDevCoRepository({ isRegistered: () => true });
    await repo.remove("k1");
    expect(calls).toEqual(["delete:vsb_bopcontractsstandardassumptiondevcocostses:k1"]);

    deleteFails = true;
    await expect(repo.remove("k1")).rejects.toBeInstanceOf(DataError);
  });

  it("UT-ADCONTR-009 Creates one row per link (no bulk services on master), never sending the root account", async () => {
    const sentRows: Record<string, unknown>[] = [];
    devCoCreate = async (row) => {
      sentRows.push(row);
      return { success: true, data: { vsb_bopcontractsstandardassumptiondevcocostsid: "row" } };
    };
    const repo = createDevCoRepository({ isRegistered: () => true });
    const ids = await repo.createMany([{
      vsb_name: "1-a", "vsb_BoPContractStandardAssumption@odata.bind": "/x(1)",
      "vsb_CAPEXAccount@odata.bind": "/y(1)", "crc36_Country@odata.bind": "/z(1)", crc36_technology: WIND,
    }]);
    expect(ids).toEqual(["row"]);
    expect(Object.keys(sentRows[0]!).some((k) => k.toLowerCase().includes("rootcapexaccount"))).toBe(false);
  });
});

describe("SaveStandardContract", () => {
  it("UT-ADCONTR-010 Creates a new contract: check, parent, zero removals, additions", async () => {
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

  it("UT-ADCONTR-011 Edits: removes only this contract's deselected children, then adds", async () => {
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

  it("UT-ADCONTR-012 Never deletes an existing link to an inactive (hidden) CAPEX account on save", async () => {
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

  it("UT-ADCONTR-013 Refuses an account just linked to another contract, before writing anything", async () => {
    const { repo } = fakeRepo([{ id: "o1", contractId: "other", accountId: "a" }]);
    const error = await saveStandardContract(input(), repo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContractSaveError);
    expect((error as ContractSaveError).phase).toBe("check");
    expect((error as ContractSaveError).cause).toBeInstanceOf(OwnershipConflictError);
    expect(calls).toEqual(["scope"]);
  });

  it("UT-ADCONTR-014 Fails the check phase when the DevCo table is unavailable", async () => {
    const { repo } = fakeRepo([], { listFails: true });
    const error = (await saveStandardContract(input(), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("check");
    expect(error.cause).toBeInstanceOf(DevCoTableUnavailableError);
  });

  it("UT-ADCONTR-015 Reports a parent failure with no contract id", async () => {
    saCreateResult = { success: false, error: { message: "denied", status: 403 } };
    const { repo } = fakeRepo([]);
    const error = (await saveStandardContract(input(), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("parent");
    expect(error.contractId).toBeUndefined();
    expect((error.cause as DataError).isForbidden).toBe(true);
  });

  it("UT-ADCONTR-016 Returns a typed partial failure on removals, carrying the contract id", async () => {
    const { repo } = fakeRepo([{ id: "k3", contractId: "me", accountId: "c" }], { removeFails: true });
    const error = (await saveStandardContract(input({ contractId: "me" }), repo).catch((e: unknown) => e)) as ContractSaveError;
    expect(error.phase).toBe("removals");
    expect(error.contractId).toBe("me");
    expect(error.parentSaved).toBe(true);
  });

  it("UT-ADCONTR-017 Returns a typed partial failure on additions; a retry re-sends only the missing links", async () => {
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

describe("Gap closure (08-gap-analysis)", () => {
  it("UT-ADCONTR-018 The shared countries read gives the picker active rows with ISO currency, nulls mapped", async () => {
    // The screen's own `listPickerCountries` was replaced by `@/data/countries`
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

  it("UT-ADCONTR-019 The SA list and the SADC scope read never go out without a non-empty filter", async () => {
    await listStandardContracts(C, WIND);
    const saFilter = (saGetAllOptions[0] as { filter?: string }).filter;
    expect(typeof saFilter).toBe("string");
    expect(saFilter!.length).toBeGreaterThan(0);

    const seen: { filter?: string }[] = [];
    devCoGetAll = async (o) => { seen.push(o); return { success: true, data: [] }; };
    await createDevCoRepository({ isRegistered: () => true }).listByScope(C, WIND);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.filter && seen[0]!.filter.length).toBeGreaterThan(0);
  });

  it("UT-ADCONTR-020 A 403 on the parent UPDATE is a forbidden DataError carried by the parent phase", async () => {
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

describe("Upsert guard upsert guard", () => {
  it("UT-ADCONTR-021 Editing a contract deleted meanwhile fails the parent phase with RecordGoneError and writes nothing", async () => {
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

describe("DeleteStandardContract", () => {
  it("UT-ADCONTR-022 Deletes the parent only — children cascade on the server", async () => {
    await expect(deleteStandardContract("c1")).resolves.toEqual({ alreadyDeleted: false });
    expect(calls).toEqual(["delete:vsb_bopcontractsstandardassumptionses:c1"]);
  });

  it("UT-ADCONTR-023 Propagates a refusal as a DataError", async () => {
    deleteFails = true;
    await expect(deleteStandardContract("c1")).rejects.toBeInstanceOf(DataError);
  });

  it("UT-ADCONTR-024 Treats a 404 (already deleted by another user) as done", async () => {
    deleteFails = "gone";
    await expect(deleteStandardContract("c1")).resolves.toEqual({ alreadyDeleted: true });
  });
});
