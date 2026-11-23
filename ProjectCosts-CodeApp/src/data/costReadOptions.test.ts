/**
 * Optimization programme B2 — read options and shared reads of the Cost loaders other than the cost book (UT-COSTREAD-OPT-NNN):
 * the page-size argument of the narrow cost-row reads (OPT-08a), the server-side filter of the standard assumptions (OPT-08b),
 * the one chart-of-accounts read shared by the Contracts, Add Cost from Table and cost book loaders (OPT-07c), the shared
 * currency table (OPT-07b) and the OPEX catalogue reading the accounts once (OPT-06).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveClient, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({ wave: undefined as unknown as WaveClient }));
vi.mock("./client", () => ({
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
  deleteRecord: async () => undefined,
}));

const { loadAddCostSheetData } = await import("./addCostSheet");
const { listCapexCostRows, listCapexAccounts } = await import("./contracts");
const { loadStandardAssumptions } = await import("./standardContracts");
const { loadCostAccounts, loadCapexCategories, loadProjectStates } = await import("./costBook");
const { listProjectStates } = await import("./generalData");
const { costStates } = await import("./projectStates");
const { loadOpexSubaccounts } = await import("./opexCatalog");
const { loadCurrencies } = await import("./landLease");
const { invalidateCapexChart } = await import("./capexChart");
const { invalidateCurrencies, loadAllCurrencies, loadCurrencyNameMap } = await import("./currencies");

const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ROOT = g(1);
const CAT = g(2);
const ACCT = g(3);
const SUB_A = g(4);
const SUB_B = g(5);

const CHART = [
  { vsb_capexaccountlistid: ROOT, vsb_number: "00001", vsb_name: "Root" },
  { vsb_capexaccountlistid: CAT, vsb_number: "10000", vsb_name: "Wind Turbine / Panels", vsb_order: 1, _vsb_parentaccount_value: ROOT },
  { vsb_capexaccountlistid: ACCT, vsb_number: "80000", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: CAT },
  { vsb_capexaccountlistid: SUB_A, vsb_number: "80000_0", vsb_name: "A", vsb_order: 1, _vsb_parentaccount_value: ACCT },
  { vsb_capexaccountlistid: SUB_B, vsb_number: "80000_1", vsb_name: "B", vsb_order: 2, _vsb_parentaccount_value: ACCT },
];

let answers: Record<string, unknown[] | ((o: Record<string, unknown>) => unknown[])> = {};
const wave = createWaveClient((label, options) => {
  const a = answers[label];
  return typeof a === "function" ? a(options) : (a ?? []);
});
h.wave = wave;

beforeEach(() => {
  wave.reset();
  invalidateCapexChart();
  invalidateCurrencies();
  answers = { "list CAPEX accounts": CHART };
});

/** Runs a read to completion (the recorder holds every answer until `run` releases it). */
const done = async <T,>(work: () => Promise<T>): Promise<T> => (await wave.run(work)).value;
const optionsOf = (label: string) => wave.calls.filter((c) => c.label === label);

describe("OPT-08a: page size on the narrow cost-row reads", () => {
  it("UT-COSTREAD-OPT-001 Add Cost from Table's cost read asks for 5000 per page and nothing else about it changed", async () => {
    answers["list SPV/DevCo sub-account mapping"] = [];
    answers["list Add Cost from Table contracts"] = [{ vsb_capexprojectcontractid: g(20), _vsb_account_value: SUB_A, vsb_name: "C1" }];
    answers["list Add Cost from Table costs"] = [{ vsb_capexcostid: g(30), _vsb_contract_value: g(20), vsb_year: 2027, vsb_month: 1, vsb_cost: 5 }];
    const { value } = await wave.run(() => loadAddCostSheetData(g(99), 0));
    const call = optionsOf("list Add Cost from Table costs")[0]!;
    expect(call.maxPageSize).toBe(5000);
    expect(call.select).toEqual(["vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost"]);
    // Any state (audit, 23 Nov 2026): the canvas cost read has no status clause, so no `statecode` condition is sent.
    expect(call.filter).not.toContain("statecode");
    expect(value.costs).toEqual([{ id: g(30), contractId: g(20), year: 2027, month: 1, cost: 5 }]);
  });

  it("UT-COSTREAD-OPT-002 the Contracts DevCo cost read asks for 5000 per page, and the contracts passed in are not read again (S1-07)", async () => {
    answers["list DevCo CAPEX costs"] = [{ vsb_capexcostid: "k", _vsb_contract_value: g(20), vsb_year: 2027, vsb_month: 2, vsb_cost: 7 }];
    const rows = await done(() => listCapexCostRows(g(99), [{ id: g(20), accountId: SUB_A, totalCost: 1 }]));
    expect(wave.calls.map((c) => c.label)).toEqual(["list DevCo CAPEX costs"]);
    expect(optionsOf("list DevCo CAPEX costs")[0]!.maxPageSize).toBe(5000);
    expect(rows).toEqual([{ contractId: g(20), year: 2027, month: 2, cost: 7 }]);
  });

  it("UT-COSTREAD-OPT-003 without contracts passed in it still reads them first (2 waves), as before", async () => {
    answers["list DevCo CAPEX contracts"] = [{ vsb_capexprojectcontractid: g(20), _vsb_account_value: SUB_A, vsb_totalcost: 1 }];
    answers["list DevCo CAPEX costs"] = [];
    const { waves, calls } = await wave.run(() => listCapexCostRows(g(99)));
    expect(waves).toBe(2);
    expect(calls.map((c) => c.label)).toEqual(["list DevCo CAPEX contracts", "list DevCo CAPEX costs"]);
  });

  it("UT-COSTREAD-OPT-004 an empty contracts list passed in reads nothing", async () => {
    const rows = await listCapexCostRows(g(99), Promise.resolve([]));
    expect(rows).toEqual([]);
    expect(wave.calls).toHaveLength(0);
  });
});

describe("OPT-08b: standard assumptions filtered on the server", () => {
  const row = (n: number, sub: string) => ({
    vsb_devexcapexstandardassumptionsid: g(1000 + n), vsb_description: `d${n}`, _vsb_subaccount_value: sub,
    _vsb_country_value: g(7), vsb_technology: 952850000, vsb_costamount: n, vsb_unit: 952850000, vsb_costpaidby: 952850001,
    vsb_applyvat: true, vsb_depreciation: false,
  });
  /** The whole active table, and a fake server that applies a `_vsb_subaccount_value eq <guid> or …` filter. */
  const table = (subs: string[]) => subs.flatMap((s, i) => [row(i * 2, s), row(i * 2 + 1, s)]);
  const server = (all: ReturnType<typeof table>) => (options: Record<string, unknown>) => {
    const wanted = new Set(String(options.filter ?? "").match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? []);
    return wanted.size === 0 ? all : all.filter((r) => wanted.has(r._vsb_subaccount_value));
  };
  /** The OLD implementation's behaviour, as an oracle: read everything, narrow in JS. */
  const oracleIds = (all: ReturnType<typeof table>, wanted: readonly string[]) =>
    all.filter((r) => r._vsb_subaccount_value && new Set(wanted).has(r._vsb_subaccount_value)).map((r) => r.vsb_devexcapexstandardassumptionsid);

  it("UT-COSTREAD-OPT-005 one chunk: filtered on the sub-accounts and ACTIVE; the same rows in the same order as the whole-table read", async () => {
    const all = table([SUB_A, g(6), SUB_B, g(8)]);
    answers["list CAPEX standard assumptions"] = server(all);
    const { value, waves, calls } = await wave.run(() => loadStandardAssumptions([SUB_A, SUB_B]));
    expect(waves).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.filter).toBe(`((_vsb_subaccount_value eq ${SUB_A}) or (_vsb_subaccount_value eq ${SUB_B})) and (statecode eq 0)`);
    expect(value.map((a) => a.id)).toEqual(oracleIds(all, [SUB_A, SUB_B]));
    expect(value.map((a) => a.id)).toHaveLength(4);
  });

  it("UT-COSTREAD-OPT-006 more than 40 sub-accounts: chunks read in parallel, the union is the whole-table answer", async () => {
    const subs = Array.from({ length: 95 }, (_, i) => g(500 + i));
    const all = table(subs);
    answers["list CAPEX standard assumptions"] = server(all);
    const { value, waves, calls } = await wave.run(() => loadStandardAssumptions(subs));
    expect(calls).toHaveLength(3); // 40 + 40 + 15
    expect(waves).toBe(1);
    expect(new Set(value.map((a) => a.id))).toEqual(new Set(oracleIds(all, subs)));
    expect(value).toHaveLength(190);
  });

  it("UT-COSTREAD-OPT-007 duplicate ids are read once, and an empty list reads nothing", async () => {
    answers["list CAPEX standard assumptions"] = server(table([SUB_A]));
    const { value, calls } = await wave.run(() => loadStandardAssumptions([SUB_A, SUB_A]));
    expect(calls[0]!.filter).toBe(`(_vsb_subaccount_value eq ${SUB_A}) and (statecode eq 0)`);
    expect(value).toHaveLength(2);
    wave.reset();
    expect(await loadStandardAssumptions([])).toEqual([]);
    expect(wave.calls).toHaveLength(0);
  });

  it("UT-COSTREAD-OPT-008 a row the server returns for another sub-account is still dropped by the JS narrowing", async () => {
    answers["list CAPEX standard assumptions"] = table([SUB_A, SUB_B]);
    const { value } = await wave.run(() => loadStandardAssumptions([SUB_A]));
    expect(value.every((a) => a.subaccountId === SUB_A)).toBe(true);
    expect(value).toHaveLength(2);
  });
});

describe("OPT-07c: one chart-of-accounts read for every Cost-side loader", () => {
  it("UT-COSTREAD-OPT-009 the cost book, the tab strip, Add Cost from Table and Contracts share one request", async () => {
    answers["list SPV/DevCo sub-account mapping"] = [];
    const { calls } = await wave.run(() => Promise.all([
      loadCostAccounts(), loadCapexCategories(), listCapexAccounts(), loadAddCostSheetData(g(99), 0),
    ]));
    expect(calls.filter((c) => /^list CAPEX account/.test(c.label))).toHaveLength(1);
    // The union select and order the five views need.
    const chart = calls.find((c) => c.label === "list CAPEX accounts")!;
    expect(chart.select).toEqual(["vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order", "_vsb_parentaccount_value", "vsb_accountcategory"]);
    expect(chart.filter).toBe("statecode eq 0");
  });

  it("UT-COSTREAD-OPT-010 each view returns what its own loader returned (the Contracts rows keep their shape and order)", async () => {
    const accounts = await done(() => listCapexAccounts());
    expect(accounts[0]).toEqual({ id: ROOT, number: "00001", name: "Root", order: undefined, parentId: undefined });
    expect(accounts.map((a) => a.id)).toEqual(CHART.map((r) => r.vsb_capexaccountlistid));
    expect(await done(() => loadCapexCategories())).toEqual(["Wind Turbine / Panels"]);
    expect((await done(() => loadCostAccounts())).map((a) => a.id)).toEqual([ACCT, SUB_A, SUB_B]);
  });

  it("UT-COSTREAD-OPT-011 an admin account write drops the memo: the next read is the post-write chart", async () => {
    await done(() => loadCostAccounts());
    answers["list CAPEX accounts"] = [...CHART, { vsb_capexaccountlistid: g(9), vsb_number: "80000_2", vsb_name: "C", vsb_order: 3, _vsb_parentaccount_value: ACCT }];
    expect(await done(() => loadCostAccounts())).toHaveLength(3); // still the remembered chart inside the window
    const { invalidateAfterCapexAccountsWrite } = await import("./adminInvalidation");
    const client = { invalidateQueries: vi.fn(async () => undefined) } as never;
    await invalidateAfterCapexAccountsWrite(client);
    expect(await done(() => loadCostAccounts())).toHaveLength(4);
  });
});

describe("OPT-07b: one shared currency table", () => {
  it("UT-COSTREAD-OPT-012 the Land Lease dropdown, the name lookup and the books share one unfiltered read", async () => {
    answers["list transaction currencies (Cost reads)"] = [
      { transactioncurrencyid: g(40), currencyname: "Euro", isocurrencycode: "EUR" },
      { transactioncurrencyid: g(41), currencyname: "Old Mark", isocurrencycode: "DEM", statecode: 1 },
    ];
    const { value, calls } = await wave.run(() => Promise.all([
      loadCurrencies(), loadAllCurrencies(), loadCurrencyNameMap([g(40)]), loadCurrencyNameMap([g(41)]),
    ]));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.filter).toBeUndefined(); // deliberately not filtered by statecode
    expect(value[0]).toEqual([{ id: g(40), name: "Euro", code: "EUR" }, { id: g(41), name: "Old Mark", code: "DEM" }]);
    expect(value[2].get(g(40))).toBe("Euro");
    expect(value[3].get(g(41))).toBe("Old Mark"); // a deactivated currency keeps its name
  });

  it("UT-COSTREAD-OPT-013 no ids, no read (a project without periods pays nothing)", async () => {
    expect((await loadCurrencyNameMap([])).size).toBe(0);
    expect(wave.calls).toHaveLength(0);
  });

  it("UT-COSTREAD-OPT-014 loadCurrencies returns a fresh array each time, so a caller sorting it cannot reorder the shared one", async () => {
    answers["list transaction currencies (Cost reads)"] = [
      { transactioncurrencyid: g(40), currencyname: "Zloty", isocurrencycode: "PLN" },
      { transactioncurrencyid: g(41), currencyname: "Euro", isocurrencycode: "EUR" },
    ];
    const first = await done(() => loadCurrencies());
    first.sort((a, b) => a.name.localeCompare(b.name));
    expect((await done(() => loadCurrencies())).map((c) => c.name)).toEqual(["Zloty", "Euro"]);
  });
});

describe("OPT-06: the OPEX catalogue reads the accounts once", () => {
  const accountRows = [{ vsb_opexaccountid: g(60), vsb_name: "Operation & Maintenance", vsb_order: 1 }];
  const subRows = [{ vsb_opexsubaccountid: g(61), vsb_name: "O&M", vsb_order: 1, _vsb_account_value: g(60) }];

  it("UT-COSTREAD-OPT-015 with no accounts passed it reads them itself (the old behaviour, one more request)", async () => {
    answers["list OPEX accounts"] = accountRows;
    answers["list OPEX subaccounts"] = subRows;
    const { value, calls, waves } = await wave.run(() => loadOpexSubaccounts());
    expect(calls.map((c) => c.label).sort()).toEqual(["list OPEX accounts", "list OPEX subaccounts"]);
    expect(waves).toBe(1);
    expect(value[0]!.accountName).toBe("Operation & Maintenance");
  });

  it("UT-COSTREAD-OPT-016 with the accounts' promise passed it reads only the sub-accounts, in the same wave, with the same result", async () => {
    answers["list OPEX accounts"] = accountRows;
    answers["list OPEX subaccounts"] = subRows;
    const own = (await wave.run(() => loadOpexSubaccounts())).value;
    wave.reset();
    const accounts = Promise.resolve([{ id: g(60), name: "Operation & Maintenance", order: 1 }]);
    const { value, calls, waves } = await wave.run(() => loadOpexSubaccounts(accounts));
    expect(calls.map((c) => c.label)).toEqual(["list OPEX subaccounts"]);
    expect(waves).toBe(1);
    expect(value).toEqual(own);
  });
});

describe("OPT-07d: the Cost view of the shared Project States", () => {
  it("UT-COSTREAD-OPT-017 costStates(shared list) equals loadProjectStates() row for row, in the same order, on ties and blank orders (differential)", async () => {
    // The table as the server holds it, in its natural order: ties on `Order`, a blank `Order`, an inactive row.
    const table = [
      { vsb_projectstateid: "a", vsb_name: "Cluster 3", vsb_order: 3, statecode: 0 },
      { vsb_projectstateid: "b", vsb_name: "Cluster 1", vsb_order: 1, statecode: 0 },
      { vsb_projectstateid: "c", vsb_name: "Tie second", vsb_order: 1, statecode: 0 },
      { vsb_projectstateid: "d", vsb_name: "No order", statecode: 0 },
      { vsb_projectstateid: "e", vsb_name: "Retired", vsb_order: 2, statecode: 1 },
      { vsb_projectstateid: "f", vsb_name: "Draft", vsb_order: 0, statecode: 0 },
    ];
    // The old read asks the server for ACTIVE rows only; the shared read asks for all and `costStates` filters.
    answers["list project states"] = (o) => (String(o.filter ?? "").includes("statecode eq 0") ? table.filter((r) => r.statecode === 0) : table);
    const old = await done(() => loadProjectStates());
    const shared = costStates(await done(() => listProjectStates()));
    expect(shared).toEqual(old);
    expect(old.map((s) => s.id)).toEqual(["d", "f", "b", "c", "a"]); // blank Order sorts as 0, ties keep the server's order
  });
});
