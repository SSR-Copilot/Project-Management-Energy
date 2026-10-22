/**
 * `@/data/adminCapexAccounts` with mocked generated services and client helpers: what is
 * queried (exact `$filter`s), what is written, in what order, and what happens on failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Options = { select?: string[]; filter?: string; orderBy?: string[]; maxPageSize?: number };

let fetchAllRows: Record<string, unknown[]> = {};
let fetchAllCalls: { label: string; options: Options }[] = [];
let fetchPageRows: Record<string, unknown[]> = {};
let fetchPageCalls: { label: string; options: Options }[] = [];
let deleted: { table: string; id: string }[] = [];
let createCalls: Record<string, unknown>[] = [];
let updateCalls: { id: string; fields: Record<string, unknown> }[] = [];
let bulkCalls: { table: string; primaryKey: string; rows: Record<string, unknown>[] }[] = [];
/** Ids whose `update` should fail. */
let failUpdateFor = new Set<string>();
let failBulk = false;
/** Ids whose `deleteRecord` should fail. */
let failDeleteFor = new Set<string>();
/** Optional per-call override of `fetchAll` (e.g. to evaluate the paid-flag clause). */
let fetchAllFn: ((label: string, options: Options) => unknown[] | undefined) | undefined;
/** The ids the pre-update existence check reports gone, and its calls. */
let goneIds = new Set<string>();
/** Ids that pass the existence check but whose PATCH then 404s (deleted in between). */
let deletedAfterCheck = new Set<string>();
let existsCalls: Options[] = [];
/** A GUID, so the existence check's `guid()` validation accepts the created id. */
const NEW_ID = "00000000-0000-0000-0000-00000000beef";

/**
 * The SDK client slice the shared `updateRecordIfExists` uses (E16). The REAL helper runs against
 * it, so the existence check and the `If-Match: *` 404 mapping are exercised exactly as in the app.
 */
const guardedClient = {
  retrieveMultipleRecordsAsync: async (_table: string, options: Options) => {
    // Upsert guard existence check: every id exists unless the test put it in `goneIds`.
    existsCalls.push(options);
    const id = /^vsb_capexaccountlistid eq (\S+)$/.exec(options.filter ?? "")?.[1] ?? "";
    return { success: true, data: goneIds.has(id) ? [] : [{ vsb_capexaccountlistid: id }] };
  },
  updateRecordAsync: async (_table: string, id: string, fields: Record<string, unknown>) => {
    if (failUpdateFor.has(id)) return { success: false, error: { message: "denied", status: 403 } };
    // SDK 1.5 `If-Match: *`: deleted after the existence check → the PATCH is refused with 404.
    if (deletedAfterCheck.has(id)) return { success: false, error: { message: "Not Found", status: 404 } };
    updateCalls.push({ id, fields });
    return { success: true, data: {} };
  },
};

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    fetchAll: async (label: string, _page: unknown, options: Options) => {
      fetchAllCalls.push({ label, options });
      return fetchAllFn?.(label, options) ?? fetchAllRows[label] ?? [];
    },
    fetchPage: async (label: string, _page: unknown, options: Options) => {
      fetchPageCalls.push({ label, options });
      return fetchPageRows[label] ?? [];
    },
    deleteRecord: async (_op: string, table: string, id: string) => {
      if (failDeleteFor.has(id)) throw new Error(`delete ${id} denied`);
      deleted.push({ table, id });
    },
    updateRecordIfExists: (operation: string, table: string, id: string, fields: Record<string, unknown>) =>
      actual.updateRecordIfExists(operation, table, id, fields, {
        client: () => guardedClient as unknown as import("./client").GuardedUpdateClient,
      }),
  };
});

// Master has no bulk services: multi-row writes go through `updateRowsEach` (per-row, pooled).
vi.mock("./adminRowWrites", async () => {
  const actual = await vi.importActual<typeof import("./adminRowWrites")>("./adminRowWrites");
  return {
    ...actual,
    updateRowsEach: async (_op: string, table: string, primaryKey: string, rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;
      if (failBulk) throw new actual.RowWriteError("per-row write denied", false);
      bulkCalls.push({ table, primaryKey, rows });
    },
  };
});

vi.mock("@/generated/services/Vsb_capexaccountlistsService", () => ({
  Vsb_capexaccountlistsService: {
    getAll: vi.fn(),
    create: async (record: Record<string, unknown>) => {
      createCalls.push(record);
      return { success: true, data: { vsb_capexaccountlistid: NEW_ID } };
    },
    update: async () => { throw new Error("single-row updates go through updateRecordIfExists"); },
    delete: async () => { throw new Error("the generated delete must never be used"); },
  },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: { getAll: vi.fn() },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: { getAll: vi.fn() },
}));

import {
  DeleteBlockedError, DuplicateNumberError, PartialStepError, RecordGoneError,
  cleanUpForecastCosts, createCapexAccount, deactivateCapexAccount,
  deactivateCapexSubaccount, deleteCapexAccount, deleteCapexSubaccount, deleteCostsFilter,
  loadCapexAccountRows, numberExists, PAID_EXCLUSION, saveCapexOrder, zeroCostsFilter,
} from "./adminCapexAccounts";

const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PARENT = G(1);
const ACCOUNT = G(2);
const SUB_A = G(3);
const SUB_B = G(4);

beforeEach(() => {
  fetchAllRows = {}; fetchAllCalls = []; fetchPageRows = {}; fetchPageCalls = [];
  deleted = []; createCalls = []; updateCalls = []; bulkCalls = [];
  failUpdateFor = new Set(); failBulk = false; failDeleteFor = new Set(); fetchAllFn = undefined;
  goneIds = new Set(); existsCalls = []; deletedAfterCheck = new Set();
});

const SUB_C = G(5);

describe("LoadCapexAccountRows", () => {
  it("UT-ADCAPEX-001 Reads every row with no statecode filter and maps it, keeping the number as stored", async () => {
    fetchAllRows["list CAPEX account tree (admin)"] = [
      { vsb_capexaccountlistid: ACCOUNT, vsb_number: " 80000 ", vsb_name: "Land", vsb_order: 3, statecode: 1, _vsb_parentaccount_value: PARENT },
      { vsb_capexaccountlistid: PARENT, vsb_number: "00001", vsb_name: "CAPEX", statecode: 0 },
    ];
    const rows = await loadCapexAccountRows();
    const call = fetchAllCalls[0]!;
    expect(call.options.filter).toBeUndefined();
    expect(call.options.select).toEqual(expect.arrayContaining(["statecode", "_vsb_parentaccount_value", "vsb_order"]));
    expect(rows).toEqual([
      { id: ACCOUNT, number: " 80000 ", name: "Land", order: 3, active: false, parentId: PARENT },
      { id: PARENT, number: "00001", name: "CAPEX", order: null, active: true, parentId: null },
    ]);
  });
});

describe("NumberExists", () => {
  it("UT-ADCAPEX-002 Queries by exact number, any status, one row, quote-escaped", async () => {
    await numberExists("8'0");
    expect(fetchPageCalls[0]!.options).toMatchObject({ filter: "vsb_number eq '8''0'", maxPageSize: 1 });
  });
});

describe("CreateCapexAccount", () => {
  it("UT-ADCAPEX-003 Refuses a duplicate number without POSTing", async () => {
    fetchPageRows["check CAPEX account number"] = [{ vsb_capexaccountlistid: "x" }];
    await expect(createCapexAccount({ parentId: PARENT, number: "80000", name: "Land" }))
      .rejects.toBeInstanceOf(DuplicateNumberError);
    expect(createCalls).toEqual([]);
  });

  it("UT-ADCAPEX-004 Creates under the parent with live max+1 order, trimmed name, then sets Inactive", async () => {
    fetchPageRows["read CAPEX sibling order"] = [{ vsb_order: 4 }];
    const result = await createCapexAccount({ parentId: PARENT, number: "80000_3", name: " Fees " });
    expect(fetchPageCalls[0]!.options.filter).toBe("vsb_number eq '80000_3'");
    expect(fetchPageCalls[1]!.options).toMatchObject({
      filter: `_vsb_parentaccount_value eq ${PARENT}`, orderBy: ["vsb_order desc"], maxPageSize: 1,
    });
    expect(createCalls).toEqual([{
      vsb_name: "Fees", vsb_number: "80000_3", vsb_order: 5,
      "vsb_ParentAccount@odata.bind": `/vsb_capexaccountlists(${PARENT})`,
    }]);
    expect(updateCalls).toEqual([{ id: NEW_ID, fields: { statecode: 1, statuscode: 2 } }]);
    expect(result).toEqual({ id: NEW_ID });
  });

  it("UT-ADCAPEX-005 Stores and checks the number exactly as the caller composed it (a legacy padded parent prefix is kept)", async () => {
    // Canvas CA:1980: `locSelectedAccount.Number & "_" & Trim(suffix)` — the parent number is raw.
    await createCapexAccount({ parentId: PARENT, number: " 80000 _3", name: "Fees" });
    expect(fetchPageCalls[0]!.options.filter).toBe("vsb_number eq ' 80000 _3'");
    expect(createCalls[0]!.vsb_number).toBe(" 80000 _3");
  });

  it("UT-ADCAPEX-006 Starts at order 1 when there are no siblings", async () => {
    await createCapexAccount({ parentId: PARENT, number: "1", name: "A" });
    expect(createCalls[0]!.vsb_order).toBe(1);
  });

  it.each([[-2], [0], [null]])(
    "UT-ADCAPEX-007 PC-1: floors the top sibling order at 0 before adding 1 (top %s → 1), as the canvas Max(…, 0) + 1",
    async (top) => {
      fetchPageRows["read CAPEX sibling order"] = [{ vsb_order: top }];
      await createCapexAccount({ parentId: PARENT, number: "1", name: "A" });
      expect(createCalls[0]!.vsb_order).toBe(1);
    },
  );

  it("UT-ADCAPEX-008 Reports 'created but still Active' when the inactive PATCH fails", async () => {
    failUpdateFor.add(NEW_ID);
    const result = await createCapexAccount({ parentId: PARENT, number: "1", name: "A" });
    expect(result.id).toBe(NEW_ID);
    expect(result.inactiveError).toBeDefined();
  });
});

/*
 * Rename (UT-ADCAPEX-009, 010, 012, 013) and the two activates (014's activate cases, 032, 037)
 * are single guarded PATCHes and have moved to `features/admin/admin-capex-accounts/rules.ts` as
 * `WritePlan`s (D36). Their tests moved WITH them, same ids and same assertions, to
 * `features/admin/admin-capex-accounts/writes.test.ts`, where a wire-equivalence test also pins
 * the requests they send against the ones recorded here before the move.
 */

describe("Upsert guard: no update can recreate a deleted row (SDK 1.3.1 PATCH upserted; 1.5.0 sends If-Match: *)", () => {
  it("UT-ADCAPEX-011 A cascade child deleted between the check and the PATCH is skipped, as before", async () => {
    fetchAllRows["list CAPEX subaccounts to deactivate"] = [SUB_A, SUB_B].map((id) => ({ vsb_capexaccountlistid: id }));
    deletedAfterCheck.add(SUB_A);
    await deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 });
    expect(updateCalls.map((u) => u.id)).toEqual([ACCOUNT, SUB_B]);
  });

  it.each([
    ["deactivate subaccount", () => deactivateCapexSubaccount(ACCOUNT, 2026, 10)],
    ["deactivate account", () => deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 })],
  ])("UT-ADCAPEX-014 %s on a deleted row: RecordGoneError (unwrapped), no PATCH, no clean-up", async (_name, act) => {
    goneIds.add(ACCOUNT);
    const error = await act().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(updateCalls).toEqual([]);
    expect(fetchAllCalls.some((c) => c.label === "list CAPEX contracts for deactivated accounts")).toBe(false);
  });

  it("UT-ADCAPEX-015 Skips (never recreates) a subaccount deleted between the live child read and its PATCH", async () => {
    fetchAllRows["list CAPEX subaccounts to deactivate"] = [SUB_A, SUB_B].map((id) => ({ vsb_capexaccountlistid: id }));
    goneIds.add(SUB_A);
    await deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 });
    expect(updateCalls.map((u) => u.id)).toEqual([ACCOUNT, SUB_B]);
  });

  it("UT-ADCAPEX-016 Does not PATCH a just-created row that vanished; reports it as the inactive step failing", async () => {
    goneIds.add(NEW_ID);
    const result = await createCapexAccount({ parentId: PARENT, number: "1", name: "A" });
    expect(updateCalls).toEqual([]);
    expect(result.inactiveError).toBeInstanceOf(RecordGoneError);
  });
});

describe("SaveCapexOrder", () => {
  it("UT-ADCAPEX-017 Writes the changed rows in one bulk call", async () => {
    await saveCapexOrder([{ id: SUB_A, order: 1 }, { id: SUB_B, order: 2 }]);
    expect(bulkCalls).toEqual([{
      table: "vsb_capexaccountlists", primaryKey: "vsb_capexaccountlistid",
      rows: [{ vsb_capexaccountlistid: SUB_A, vsb_order: 1 }, { vsb_capexaccountlistid: SUB_B, vsb_order: 2 }],
    }]);
  });
});

describe("Deletes", () => {
  it("UT-ADCAPEX-018 Re-checks contracts and refuses a subaccount delete when one exists", async () => {
    fetchPageRows["check CAPEX contracts on account"] = [{ vsb_capexprojectcontractid: "c" }];
    await expect(deleteCapexSubaccount(SUB_A)).rejects.toBeInstanceOf(DeleteBlockedError);
    expect(fetchPageCalls[0]!.options.filter).toBe(`_vsb_account_value eq ${SUB_A}`);
    expect(deleted).toEqual([]);
  });

  it("UT-ADCAPEX-019 Deletes a free subaccount through deleteRecord", async () => {
    await deleteCapexSubaccount(SUB_A);
    expect(deleted).toEqual([{ table: "vsb_capexaccountlists", id: SUB_A }]);
  });

  it("UT-ADCAPEX-020 Refuses an account delete when it has children (any status)", async () => {
    fetchPageRows["check CAPEX account children"] = [{ vsb_capexaccountlistid: SUB_A }];
    await expect(deleteCapexAccount(ACCOUNT)).rejects.toBeInstanceOf(DeleteBlockedError);
    expect(fetchPageCalls[0]!.options.filter).toBe(`_vsb_parentaccount_value eq ${ACCOUNT}`);
    expect(deleted).toEqual([]);
  });

  it("UT-ADCAPEX-021 Refuses an account delete when a contract is booked on the account itself", async () => {
    fetchPageRows["check CAPEX contracts on account"] = [{ vsb_capexprojectcontractid: "c" }];
    await expect(deleteCapexAccount(ACCOUNT)).rejects.toBeInstanceOf(DeleteBlockedError);
    expect(deleted).toEqual([]);
  });

  it("UT-ADCAPEX-022 Deletes a free account", async () => {
    await deleteCapexAccount(ACCOUNT);
    expect(deleted).toEqual([{ table: "vsb_capexaccountlists", id: ACCOUNT }]);
  });
});

describe("Forecast cost clean-up", () => {
  // The audit found the original `vsb_costpaid ne true` wrong: Dataverse `ne` never
  // matches null, so rows with no paid flag escaped the clean-up. Only explicit `true` is spared.
  it("UT-ADCAPEX-023 Builds the exact null-safe filters for Y=2026, M=10, skipping only rows marked paid", () => {
    expect(PAID_EXCLUSION).toBe("(vsb_costpaid eq false) or (vsb_costpaid eq null)");
    expect(zeroCostsFilter([SUB_A], 2026, 10)).toBe(
      `(_vsb_contract_value eq ${SUB_A}) and (vsb_year eq 2026) and (vsb_month gt 10) and ` +
        "((vsb_costpaid eq false) or (vsb_costpaid eq null))",
    );
    expect(deleteCostsFilter([SUB_A], 2026)).toBe(
      `(_vsb_contract_value eq ${SUB_A}) and (vsb_year gt 2026) and ((vsb_costpaid eq false) or (vsb_costpaid eq null))`,
    );
  });

  it("UT-ADCAPEX-024 Zeroes and deletes cost rows whose paid flag is null, and spares only rows marked paid", async () => {
    fetchAllRows["list CAPEX contracts for deactivated accounts"] = [{ vsb_capexprojectcontractid: G(500) }];
    const costs = (prefix: string) => [
      { vsb_capexcostid: `${prefix}-paid`, paid: true },
      { vsb_capexcostid: `${prefix}-unpaid`, paid: false },
      { vsb_capexcostid: `${prefix}-null`, paid: null },
    ];
    // Evaluates the paid clause with Dataverse semantics: `eq null` matches null only,
    // `eq false` matches false only, `ne true` matches false only (never null).
    const matches = (filter: string, paid: boolean | null) =>
      (paid === null && filter.includes("vsb_costpaid eq null")) ||
      (paid === false && (filter.includes("vsb_costpaid eq false") || filter.includes("vsb_costpaid ne true"))) ||
      (paid === true && filter.includes("vsb_costpaid eq true"));
    fetchAllFn = (label, options) => {
      const prefix = label === "list current-year forecast CAPEX costs" ? "z"
        : label === "list future-year forecast CAPEX costs" ? "d" : undefined;
      if (!prefix) return undefined;
      return costs(prefix).filter((c) => matches(options.filter ?? "", c.paid)).map(({ vsb_capexcostid }) => ({ vsb_capexcostid }));
    };

    const result = await cleanUpForecastCosts([SUB_A], 2026, 10);

    expect(bulkCalls[0]!.rows).toEqual([
      { vsb_capexcostid: "z-unpaid", vsb_cost: 0 }, { vsb_capexcostid: "z-null", vsb_cost: 0 },
    ]);
    expect(deleted.map((d) => d.id)).toEqual(["d-unpaid", "d-null"]);
    expect(result).toEqual({ contracts: 1, zeroed: 2, deleted: 2 });
  });

  it("UT-ADCAPEX-025 Across the December/January year boundary, zeroes current-year future months and deletes later years", async () => {
    // 31 Dec 2026: no month is after 12, so nothing is zeroed by the month clause; 2027+ is deleted.
    expect(zeroCostsFilter([SUB_A], 2026, 12)).toContain("(vsb_year eq 2026) and (vsb_month gt 12)");
    expect(deleteCostsFilter([SUB_A], 2026)).toContain("(vsb_year gt 2026)");
    // 1 Jan 2027: Feb–Dec 2027 zeroed, 2028+ deleted.
    expect(zeroCostsFilter([SUB_A], 2027, 1)).toContain("(vsb_year eq 2027) and (vsb_month gt 1)");
    expect(deleteCostsFilter([SUB_A], 2027)).toContain("(vsb_year gt 2027)");

    // Evaluate the filters against cost rows with Dataverse semantics, for both dates.
    const rows = [
      { id: "2026-11", y: 2026, m: 11 }, { id: "2026-12", y: 2026, m: 12 },
      { id: "2027-01", y: 2027, m: 1 }, { id: "2027-02", y: 2027, m: 2 }, { id: "2027-12", y: 2027, m: 12 },
      { id: "2028-01", y: 2028, m: 1 },
    ];
    const evalFilter = (filter: string) => {
      const yEq = /vsb_year eq (\d+)/.exec(filter)?.[1];
      const yGt = /vsb_year gt (\d+)/.exec(filter)?.[1];
      const mGt = /vsb_month gt (\d+)/.exec(filter)?.[1];
      return rows.filter((r) => (yEq === undefined || r.y === Number(yEq))
        && (yGt === undefined || r.y > Number(yGt))
        && (mGt === undefined || r.m > Number(mGt))).map((r) => ({ vsb_capexcostid: r.id }));
    };
    fetchAllRows["list CAPEX contracts for deactivated accounts"] = [{ vsb_capexprojectcontractid: G(500) }];
    fetchAllFn = (label, options) => (label.includes("forecast CAPEX costs") ? evalFilter(options.filter ?? "") : undefined);

    await cleanUpForecastCosts([SUB_A], 2026, 12); // 31 Dec 2026
    expect(bulkCalls).toEqual([]);
    expect(deleted.map((d) => d.id)).toEqual(["2027-01", "2027-02", "2027-12", "2028-01"]);

    bulkCalls = []; deleted = [];
    await cleanUpForecastCosts([SUB_A], 2027, 1); // 1 Jan 2027
    expect(bulkCalls[0]!.rows).toEqual([
      { vsb_capexcostid: "2027-02", vsb_cost: 0 }, { vsb_capexcostid: "2027-12", vsb_cost: 0 },
    ]);
    expect(deleted.map((d) => d.id)).toEqual(["2028-01"]);
  });

  it("UT-ADCAPEX-026 Does nothing when no contract is booked", async () => {
    const result = await cleanUpForecastCosts([SUB_A], 2026, 10);
    expect(result).toEqual({ contracts: 0, zeroed: 0, deleted: 0 });
    expect(fetchAllCalls.map((c) => c.label)).toEqual(["list CAPEX contracts for deactivated accounts"]);
  });

  it("UT-ADCAPEX-027 Chunks ids, zeroes current-year future months in bulk and deletes every later-year row", async () => {
    const accountIds = Array.from({ length: 45 }, (_, i) => G(100 + i));
    fetchAllRows["list CAPEX contracts for deactivated accounts"] = [{ vsb_capexprojectcontractid: G(500) }];
    fetchAllRows["list current-year forecast CAPEX costs"] = [{ vsb_capexcostid: "z1" }];
    fetchAllRows["list future-year forecast CAPEX costs"] = [{ vsb_capexcostid: "d1" }];

    const result = await cleanUpForecastCosts(accountIds, 2026, 10);

    const contractQueries = fetchAllCalls.filter((c) => c.label === "list CAPEX contracts for deactivated accounts");
    expect(contractQueries).toHaveLength(2); // 40 + 5
    expect(contractQueries[0]!.options.filter).toContain(`_vsb_account_value eq ${G(100)}`);
    expect(contractQueries[0]!.options.filter).not.toContain("statecode");
    expect(bulkCalls).toEqual([{ table: "vsb_capexcosts", primaryKey: "vsb_capexcostid", rows: [{ vsb_capexcostid: "z1", vsb_cost: 0 }] }]);
    expect(deleted).toEqual([{ table: "vsb_capexcosts", id: "d1" }]);
    // Two contract chunks each returned the same contract id (mock), so 2 contracts, 1 cost chunk.
    expect(result).toEqual({ contracts: 2, zeroed: 1, deleted: 1 });
  });
});

describe("Status changes", () => {
  const CHILDREN = "list CAPEX subaccounts to deactivate";
  const children = (...ids: string[]) => { fetchAllRows[CHILDREN] = ids.map((id) => ({ vsb_capexaccountlistid: id })); };

  it("UT-ADCAPEX-028 Deactivates the account, its subaccounts (Inactive) and cleans costs for all of them", async () => {
    children(SUB_A, SUB_B);
    await deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 });
    expect(updateCalls).toEqual([
      { id: ACCOUNT, fields: { statecode: 1, statuscode: 2 } },
      { id: SUB_A, fields: { statecode: 1, statuscode: 2 } },
      { id: SUB_B, fields: { statecode: 1, statuscode: 2 } },
    ]);
    const contractQuery = fetchAllCalls.find((c) => c.label === "list CAPEX contracts for deactivated accounts")!;
    for (const id of [ACCOUNT, SUB_A, SUB_B]) expect(contractQuery.options.filter).toContain(id);
  });

  it("UT-ADCAPEX-029 reads the subaccounts live (server-filtered, paged) and includes one added since the tree loaded", async () => {
    // SUB_C was created by another admin after the screen loaded: only the live read knows it.
    children(SUB_A, SUB_C);
    await deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 });
    const childRead = fetchAllCalls[0]!;
    expect(childRead.label).toBe(CHILDREN);
    expect(childRead.options).toEqual({
      select: ["vsb_capexaccountlistid"], filter: `_vsb_parentaccount_value eq ${ACCOUNT}`,
    });
    expect(updateCalls.map((u) => u.id)).toEqual([ACCOUNT, SUB_A, SUB_C]);
    const contractQuery = fetchAllCalls.find((c) => c.label === "list CAPEX contracts for deactivated accounts")!;
    expect(contractQuery.options.filter).toContain(SUB_C);
  });

  it("UT-ADCAPEX-030 a deactivated account with no live children only changes the account", async () => {
    await deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 });
    expect(updateCalls).toEqual([{ id: ACCOUNT, fields: { statecode: 1, statuscode: 2 } }]);
  });

  it("UT-ADCAPEX-031 Reports which steps landed when a later step fails", async () => {
    children(SUB_A, SUB_B);
    failUpdateFor.add(SUB_B);
    const error = await deactivateCapexAccount({ accountId: ACCOUNT, year: 2026, month: 10 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartialStepError);
    expect((error as PartialStepError).failedStep).toBe("Subaccounts set to Inactive");
    expect((error as PartialStepError).completed).toEqual(["Account set to Inactive"]);
    expect(fetchAllCalls.map((c) => c.label)).toEqual([CHILDREN]); // clean-up never started
  });

  it("UT-ADCAPEX-033 Deactivating a subaccount sets it Inactive then cleans its contracts' costs", async () => {
    fetchAllRows["list CAPEX contracts for deactivated accounts"] = [{ vsb_capexprojectcontractid: G(500) }];
    await deactivateCapexSubaccount(SUB_A, 2026, 10);
    expect(updateCalls).toEqual([{ id: SUB_A, fields: { statecode: 1, statuscode: 2 } }]);
    expect(fetchAllCalls.map((c) => c.label)).toEqual([
      "list CAPEX contracts for deactivated accounts",
      "list current-year forecast CAPEX costs",
      "list future-year forecast CAPEX costs",
    ]);
  });

  it("UT-ADCAPEX-034 Reports a failed clean-up after the status landed", async () => {
    fetchAllRows["list CAPEX contracts for deactivated accounts"] = [{ vsb_capexprojectcontractid: G(500) }];
    fetchAllRows["list current-year forecast CAPEX costs"] = [{ vsb_capexcostid: "z1" }];
    failBulk = true;
    const error = await deactivateCapexSubaccount(SUB_A, 2026, 10).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartialStepError);
    expect((error as PartialStepError).completed).toEqual(["Subaccount set to Inactive"]);
    expect((error as PartialStepError).failedStep).toBe("Future-month costs set to 0 (1 row)");
  });

  it("UT-ADCAPEX-035 Reports which sibling subaccounts landed when one of the cascade PATCHes fails", async () => {
    children(SUB_A, SUB_B, SUB_C);
    failUpdateFor.add(SUB_B);
    const error = await deactivateCapexAccount({
      accountId: ACCOUNT, year: 2026, month: 10,
    }).catch((e: unknown) => e) as PartialStepError;
    expect(error).toBeInstanceOf(PartialStepError);
    expect(error.failedStep).toBe("Subaccounts set to Inactive");
    expect(error.completed).toEqual(["Account set to Inactive"]);
    // A and C were in flight with B and landed; the count is final once the pool settles.
    expect(error.detail).toBe("2 of 3 subaccounts were set to Inactive");
    expect(error.cause).toBeDefined();
  });

  it("UT-ADCAPEX-036 Lists the zeroing as completed when a later-year delete fails, with the delete count", async () => {
    fetchAllRows["list CAPEX contracts for deactivated accounts"] = [{ vsb_capexprojectcontractid: G(500) }];
    fetchAllRows["list current-year forecast CAPEX costs"] = [{ vsb_capexcostid: "z1" }];
    fetchAllRows["list future-year forecast CAPEX costs"] = [{ vsb_capexcostid: "d1" }, { vsb_capexcostid: "d2" }];
    failDeleteFor.add("d2");
    const error = await deactivateCapexSubaccount(SUB_A, 2026, 10).catch((e: unknown) => e) as PartialStepError;
    expect(error).toBeInstanceOf(PartialStepError);
    expect(error.failedStep).toBe("Later-year costs deleted (2 rows)");
    expect(error.completed).toEqual(["Subaccount set to Inactive", "Future-month costs set to 0 (1 row)"]);
    expect(error.detail).toBe("1 of 2 later-year cost rows were deleted");
  });
});
