/**
 * UT-CONTR-239..247 — the Contracts screen's REAL read functions (`data/contracts.ts`) against a mocked SDK client.
 *
 * The screen tests mock `./hooks` and the hook tests mock the repository, so until now nothing ran these queries:
 * their `$filter`, `$select`, chunking and row mapping. The SDK's `retrieveMultipleRecordsAsync(table, options)` is
 * the one seam mocked here; `fetchAll`, `odata.ts` and the row mappers are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  createRecordAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
}));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => client }));

import { COST_TYPE, CONTRACT_TYPE } from "@/features/cost/contracts/rules";
import {
  findBopStandardAssumption, listCapexAccounts, listCapexCostRows, listContracts, listDevCoCapexContracts,
  listDevCoLinks, listPaymentTargets,
} from "./contracts";

const PROJECT = "11111111-1111-1111-1111-111111111111";
/** A valid GUID that differs per `n`. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown[]) => ({ success: true, data });

interface Call { table: string; options: { select?: string[]; filter?: string; orderBy?: string[]; top?: number } }
const calls = (table?: string): Call[] =>
  (client.retrieveMultipleRecordsAsync.mock.calls as [string, Call["options"] | undefined][])
    .map(([t, o]) => ({ table: t, options: o ?? {} }))
    .filter((c) => table === undefined || c.table === table);

/** Answers every read of a table with the rows given for it (one page). */
function answer(rows: Record<string, unknown[]>) {
  client.retrieveMultipleRecordsAsync.mockImplementation(async (table: string) => ok(rows[table] ?? []));
}

beforeEach(() => { client.retrieveMultipleRecordsAsync.mockReset(); });

describe("listContracts", () => {
  it("UT-CONTR-239 filters the project's ACTIVE contracts on the server, selects columns, and maps the rows", async () => {
    answer({
      vsb_bopprojectscontractses: [{
        vsb_bopprojectscontractsid: id(1), vsb_name: "BoP-P-1-Grid", vsb_description: "Grid",
        vsb_contracttypes: CONTRACT_TYPE.Construction, vsb_closingdate: "2026-09-18",
        vsb_margin: true, vsb_margintype: 952850001, vsb_isstandardcontract: true,
      }],
    });
    const rows = await listContracts(PROJECT);
    const [call] = calls("vsb_bopprojectscontractses");
    expect(calls()).toHaveLength(1);
    expect(call!.options.filter).toBe(`(_vsb_project_value eq ${PROJECT}) and (statecode eq 0)`);
    expect(call!.options.select).toContain("vsb_bopprojectscontractsid");
    expect(call!.options.select).toContain("vsb_totalcostofcontract");
    expect(call!.options.select).not.toContain("statecode");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: id(1), description: "Grid", contractType: CONTRACT_TYPE.Construction, margin: true,
      marginType: 952850001, isStandardContract: true, isMarginStandardAssumption: false,
    });
    // A date-only value keeps its calendar day (no UTC shift).
    const closing = rows[0]!.closingDate!;
    expect([closing.getFullYear(), closing.getMonth(), closing.getDate()]).toEqual([2026, 8, 18]);
  });
});

describe("listPaymentTargets", () => {
  it("UT-CONTR-240 asks for nothing when there are no contracts", async () => {
    expect(await listPaymentTargets(PROJECT, [])).toEqual([]);
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTR-241 reads 85 contracts in chunks of 40, filters by lookup, selects createdon, and maps the rows", async () => {
    const ids = Array.from({ length: 85 }, (_, i) => id(i + 1));
    answer({
      vsb_bopcontractspaymenttargetses: [{
        vsb_bopcontractspaymenttargetsid: id(900), _vsb_bopprojectcontract_value: id(1),
        createdon: "2026-01-02T03:04:05Z", vsb_description: "Period 1", vsb_paymentdate: "01/2027",
        vsb_totalcostscontract: 25, vsb_note: "n",
      }],
    });
    const rows = await listPaymentTargets(PROJECT, ids);
    const sent = calls("vsb_bopcontractspaymenttargetses");
    expect(sent).toHaveLength(3);
    expect(sent.map((c) => (c.options.filter!.match(/_vsb_bopprojectcontract_value eq/g) ?? []).length)).toEqual([40, 40, 5]);
    for (const c of sent) {
      expect(c.options.select).toContain("createdon");
      expect(c.options.select).toContain("_vsb_bopprojectcontract_value");
      expect(c.options.filter!.endsWith("and (statecode eq 0)")).toBe(true);
    }
    // Every id is asked about exactly once.
    const allFilters = sent.map((c) => c.options.filter).join(" ");
    for (const contractId of ids) expect(allFilters.split(contractId)).toHaveLength(2);
    expect(rows).toHaveLength(3); // the same canned page for each of the three chunks
    expect(rows[0]).toMatchObject({
      id: id(900), contractId: id(1), createdOn: "2026-01-02T03:04:05Z", description: "Period 1",
      paymentDate: "01/2027", totalCostsContract: 25, note: "n",
    });
  });
});

describe("listDevCoLinks", () => {
  it("UT-CONTR-242 drops a link row whose account is blank, chunks by 40 and asks for nothing without contracts", async () => {
    expect(await listDevCoLinks([])).toEqual([]);
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    answer({
      vsb_bopcontractsdevcocostses: [
        { vsb_bopcontractsdevcocostsid: id(10), _vsb_account_value: id(20), _vsb_bopcontract_value: id(1) },
        { vsb_bopcontractsdevcocostsid: id(11), _vsb_account_value: null, _vsb_bopcontract_value: id(1) },
        { vsb_bopcontractsdevcocostsid: id(12), _vsb_bopcontract_value: id(1) },
      ],
    });
    const links = await listDevCoLinks(Array.from({ length: 41 }, (_, i) => id(i + 1)));
    expect(calls("vsb_bopcontractsdevcocostses")).toHaveLength(2);
    expect(links.filter((l) => l.id === id(10))).toHaveLength(2); // the one valid row, once per chunk
    expect(links.every((l) => l.accountId === id(20))).toBe(true);
    expect(links.some((l) => l.id === id(11) || l.id === id(12))).toBe(false);
  });
});

describe("listCapexCostRows and listDevCoCapexContracts (two hops)", () => {
  it("UT-CONTR-243 hop one reads the project's ACTIVE DevCo CAPEX contracts, hop two their cost rows in chunks of 40", async () => {
    const contracts = Array.from({ length: 45 }, (_, i) => ({
      vsb_capexprojectcontractid: id(i + 1), _vsb_account_value: id(500 + i), vsb_totalcost: 10,
    }));
    answer({
      vsb_capexprojectcontracts: contracts,
      vsb_capexcosts: [{ vsb_capexcostid: id(800), _vsb_contract_value: id(1), vsb_year: "2027", vsb_month: 3, vsb_cost: 12.5 }],
    });
    const rows = await listCapexCostRows(PROJECT);
    const hop1 = calls("vsb_capexprojectcontracts");
    const hop2 = calls("vsb_capexcosts");
    expect(hop1).toHaveLength(1);
    expect(hop1[0]!.options.filter).toBe(
      `(_vsb_project_value eq ${PROJECT}) and (vsb_costtype eq ${COST_TYPE.DevCo}) and (statecode eq 0)`,
    );
    expect(hop2).toHaveLength(2);
    expect(hop2.map((c) => (c.options.filter!.match(/_vsb_contract_value eq/g) ?? []).length)).toEqual([40, 5]);
    expect(hop2[0]!.options.select).toEqual(["vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost"]);
    // The first hop finished before the second started.
    expect(calls()[0]!.table).toBe("vsb_capexprojectcontracts");
    expect(rows[0]).toEqual({ contractId: id(1), year: 2027, month: 3, cost: 12.5 });
  });

  it("UT-CONTR-244 no DevCo CAPEX contract: no second hop and no rows; the contracts map account and total", async () => {
    answer({});
    expect(await listCapexCostRows(PROJECT)).toEqual([]);
    expect(calls("vsb_capexcosts")).toHaveLength(0);

    client.retrieveMultipleRecordsAsync.mockReset();
    answer({ vsb_capexprojectcontracts: [{ vsb_capexprojectcontractid: id(1), _vsb_account_value: id(2), vsb_totalcost: 7 }] });
    expect(await listDevCoCapexContracts(PROJECT)).toEqual([{ id: id(1), accountId: id(2), totalCost: 7 }]);
  });
});

describe("listCapexAccounts", () => {
  it("UT-CONTR-245 reads the ACTIVE chart of accounts ordered by number with the six columns the tree needs", async () => {
    answer({
      vsb_capexaccountlists: [{
        vsb_capexaccountlistid: id(1), vsb_number: null, vsb_name: "Turbines", vsb_order: 3, _vsb_parentaccount_value: id(9),
      }],
    });
    const rows = await listCapexAccounts();
    const [call] = calls("vsb_capexaccountlists");
    expect(call!.options.filter).toBe("statecode eq 0");
    expect(call!.options.orderBy).toEqual(["vsb_number asc"]);
    expect(call!.options.select).toEqual([
      "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order", "_vsb_parentaccount_value", "vsb_accountcategory",
    ]);
    expect(rows).toEqual([{ id: id(1), number: "", name: "Turbines", order: 3, parentId: id(9) }]);
  });

  it("UT-CONTR-245b includeInactive reads every state (no status filter), as the canvas chart of accounts for the DevCo picker", async () => {
    answer({ vsb_capexaccountlists: [{ vsb_capexaccountlistid: id(1), vsb_number: "81005_0", vsb_name: "Land Survey", statecode: 1 }] });
    const rows = await listCapexAccounts({ includeInactive: true });
    const [call] = calls("vsb_capexaccountlists");
    expect(call!.options.filter).toBeUndefined();
    expect(call!.options.orderBy).toEqual(["vsb_number asc"]);
    expect(rows.map((r) => r.number)).toEqual(["81005_0"]);
  });
});

describe("findBopStandardAssumption", () => {
  const base = { countryId: id(5), technology: 1, contractType: CONTRACT_TYPE.Development };

  it("UT-CONTR-246 without a country or a technology it answers undefined and sends no request", async () => {
    expect(await findBopStandardAssumption({ ...base, countryId: undefined })).toBeUndefined();
    expect(await findBopStandardAssumption({ ...base, technology: undefined })).toBeUndefined();
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTR-247 technology 0 is a value, not unknown; the read is ACTIVE, ordered oldest first, top 1", async () => {
    answer({
      vsb_bopcontractsstandardassumptionses: [
        { vsb_bopcontractsstandardassumptionsid: id(1) }, { vsb_bopcontractsstandardassumptionsid: id(2) },
      ],
    });
    const found = await findBopStandardAssumption({ ...base, technology: 0 });
    const [call] = calls("vsb_bopcontractsstandardassumptionses");
    expect(call!.options.filter).toBe(
      `(_vsb_country_value eq ${id(5)}) and (vsb_technology eq 0) and (vsb_contracttypes eq ${CONTRACT_TYPE.Development}) and (statecode eq 0)`,
    );
    expect(call!.options.orderBy).toEqual(["createdon asc"]);
    expect(call!.options.top).toBe(1);
    expect(found).toMatchObject({ vsb_bopcontractsstandardassumptionsid: id(1) });
  });
});
