/**
 * Optimization programme B2, "Cost read path" — sequential WAVES and request counts of the Cost loaders.
 *
 * A request through the host costs about one round trip, so what a load costs is its number of sequential waves (the longest
 * chain of awaited reads), measured here with the wave recorder (`src/test/waveClient.ts`) over a label-keyed fake
 * `fetchAll`. Each test pins what the OLD code did (recorded first, against the unmodified tree) next to what the new code
 * does, so the gain is a number in a test and not a claim. Ids: UT-COSTWAVE-OPT-NNN.
 *
 * Scenarios (fixture: one project with 2 O&M devices, 1 Other OPEX contract, 1 Land Lease contract, 1 CAPEX category with
 * contracts):
 *   OPEX visit            `loadCostBook(project)`             (what the OPEX screen used to call)
 *   OPEX visit, OPEX only `loadCostBook(project, undefined, { scope: "opex" })`
 *   CAPEX tab             `loadCostBook(project, 0)`
 *   Summary tab           chart reads of `loadCapexCategories` + `loadCapexTotals` + `loadCostBook(project, -1)`
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveClient, startedTogether, waveOf, type WaveCall, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({ wave: undefined as unknown as WaveClient }));

vi.mock("./client", () => ({
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
  deleteRecord: async () => undefined,
}));

const { loadCostBook, loadCapexTotals, loadCapexCategories } = await import("./costBook");

const P = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const EURO = "b8b1e37d-1f57-ea11-a811-000d3a4a9d2f";
const OM_SUB = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";
const OTHER_SUB = "71a30faa-b7e1-eddc-a5b5-fc1376f538f5";
const DEV1 = "d1000000-0000-0000-0000-000000000001";
const DEV2 = "d1000000-0000-0000-0000-000000000002";
const LL_SUB = "cfc603b0-d2d0-ee11-9079-000d3abd8704";
const LL_HDR = "6f189e32-3c0a-f011-bae2-6045bd882926";
const CONTRACT = "c0000000-0000-0000-0000-000000000001";
const SUBACC = "a0000000-0000-0000-0000-0000000000a1";
const ACCT = "a0000000-0000-0000-0000-0000000000a0";
const CAT0 = "a0000000-0000-0000-0000-0000000000c0";
const ROOT = "a0000000-0000-0000-0000-0000000000f0";

const CHART = [
  { vsb_capexaccountlistid: ROOT, vsb_number: "00001", vsb_name: "Root" },
  { vsb_capexaccountlistid: CAT0, vsb_number: "10000", vsb_name: "Wind Turbine / Panels", vsb_order: 1, _vsb_parentaccount_value: ROOT },
  { vsb_capexaccountlistid: ACCT, vsb_number: "80000", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: CAT0 },
  { vsb_capexaccountlistid: SUBACC, vsb_number: "80000_0", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: ACCT },
];

const ANSWERS: Record<string, unknown[]> = {
  "list CAPEX accounts": CHART,
  "list CAPEX accounts for the cost book": CHART,
  "list CAPEX account categories": CHART,
  "list SPV/DevCo sub-account mapping": [{ vsb_spvdevcomappingcapexdevexid: "m1", _vsb_namesubaccount_value: SUBACC, vsb_devcospv: 952850001 }],
  "list CAPEX project contracts": [{ vsb_capexprojectcontractid: CONTRACT, _vsb_account_value: SUBACC, vsb_name: "C", _vsb_linkedcluster_value: "s1" }],
  "list CAPEX contract totals": [{ vsb_capexprojectcontractid: CONTRACT, _vsb_account_value: SUBACC }],
  "list CAPEX costs for the cost book": [{ vsb_capexcostid: "k1", _vsb_contract_value: CONTRACT, vsb_year: 2027, vsb_month: 1, vsb_cost: 5 }],
  "sum CAPEX cost rows per contract": [{ _vsb_contract_value: CONTRACT, vsb_cost: 5 }],
  "list project states": [{ vsb_projectstateid: "s1", vsb_name: "Cluster 1", vsb_order: 1 }],
  "list OPEX project costs": [
    { vsb_opexprojectcostid: "o1", vsb_description: "Service A", _vsb_devicetypeinproject_value: DEV1, _vsb_currency_value: EURO, vsb_startdate: "2027-01-01" },
    { vsb_opexprojectcostid: "o2", vsb_description: "Service B", _vsb_devicetypeinproject_value: DEV2, _vsb_currency_value: EURO, vsb_startdate: "2027-01-01" },
    { vsb_opexprojectcostid: "o3", vsb_description: "Insurance", _vsb_subaccount_value: OTHER_SUB, _vsb_currency_value: EURO, vsb_startdate: "2027-01-01" },
  ],
  "list OPEX subaccounts": [{ vsb_opexsubaccountid: OM_SUB, vsb_name: "O&M" }, { vsb_opexsubaccountid: OTHER_SUB, vsb_name: "Insurance" }],
  "list transaction currencies for periods": [{ transactioncurrencyid: EURO, currencyname: "Euro" }],
  "list transaction currencies (Cost reads)": [{ transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR" }],
  "list device types for OPEX periods": [
    { vsb_devicetypesinprojectid: DEV1, vsb_name: "V150" }, { vsb_devicetypesinprojectid: DEV2, vsb_name: "V162" },
  ],
  "list Land Lease subaccounts": [{ vsb_landleasesubaccountid: LL_SUB, vsb_name: "Locations", vsb_order: 1 }],
  "list Land Lease project costs": [{ vsb_landleaseprojectcostid: LL_HDR, _vsb_subaccount_value: LL_SUB, vsb_description: "Lease", _vsb_currency_value: EURO }],
  "list Land Lease periods": [{ vsb_landleaseperiodid: "lp1", _vsb_projectcost_value: LL_HDR, vsb_name: "Lease", vsb_period: 952850000, vsb_startdate: "2027-01-01" }],
  "list Land Lease WTG allocations": [],
  "list transaction currencies for Land Lease": [{ transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR" }],
};

const answer = (label: string): unknown[] => ANSWERS[label] ?? [];
const wave = createWaveClient(answer);
h.wave = wave;


const labels = (calls: readonly WaveCall[]) => calls.map((c) => c.label);
const count = (calls: readonly WaveCall[], re: RegExp) => calls.filter((c) => re.test(c.label)).length;

beforeEach(async () => {
  wave.reset();
  // The shared reads are remembered between loads on purpose; each test starts cold.
  (await import("./capexChart")).invalidateCapexChart();
  (await import("./currencies")).invalidateCurrencies();
});

/**
 * Recorded against the UNMODIFIED tree (b976a96) before B2 changed anything; the numbers are the "OLD" constants below.
 *   OPEX visit (no category)  4 waves, 10 requests (chart; OPEX rows + Land Lease subaccounts/costs; subaccounts + currency +
 *                             Land Lease periods/allocations/currency; device names)
 *   CAPEX tab                 4 waves, 5 requests (chart; payer defaults; contracts; payments + project states)
 *   Summary tab               3 chart reads (categories, totals, book)
 */
const OLD = { opexVisit: { waves: 4, requests: 10 }, capexTab: { waves: 4, requests: 5 }, summaryChartReads: 3 } as const;

describe("OPEX visit: loadCostBook with no category", () => {
  it("UT-COSTWAVE-OPT-001 the OPEX-only scope reads OPEX rows, sub-accounts and currencies at t=0, device names second: 2 waves, 4 requests", async () => {
    const { value, waves, calls } = await wave.run(() => loadCostBook(P, undefined, { scope: "opex" }));
    expect(OLD.opexVisit).toEqual({ waves: 4, requests: 10 });
    expect(waves).toBe(2);
    expect(calls).toHaveLength(4);
    expect(startedTogether(calls, ["list OPEX project costs", "list OPEX subaccounts", "list transaction currencies (Cost reads)"])).toBe(true);
    expect(waveOf(calls, "list device types for OPEX periods")).toBe(1);
    // No chart of accounts, no Land Lease book.
    expect(labels(calls).filter((l) => /CAPEX|Land Lease/.test(l))).toEqual([]);
    expect(value.periods.map((p) => p.mode).sort()).toEqual(["om", "om", "other"]);
    expect(value.accounts).toEqual([]);
    expect(value.lines).toEqual([]);
    expect(value.extraGroups).toEqual({ om: [], other: [], land: [] });
  });

  it("UT-COSTWAVE-OPT-002 the default scope keeps the full book (Land Lease periods and chart), now in 2 waves and 9 requests", async () => {
    const { value, waves, calls } = await wave.run(() => loadCostBook(P));
    expect(waves).toBe(2);
    expect(calls).toHaveLength(9);
    // The chart no longer waits ahead of the periods: it starts with them.
    expect(startedTogether(calls, ["list CAPEX accounts", "list OPEX project costs", "list Land Lease project costs"])).toBe(true);
    expect(value.periods.map((p) => p.mode).sort()).toEqual(["land", "om", "om", "other"]);
    expect(value.accounts.length).toBeGreaterThan(0);
    // One currency read serves the OPEX rows and the Land Lease book.
    expect(count(calls, /transaction currencies/)).toBe(1);
  });

  it("UT-COSTWAVE-OPT-003 the OPEX-only book holds exactly the O&M and Other OPEX periods of the full book (differential)", async () => {
    const full = (await wave.run(() => loadCostBook(P))).value;
    const only = (await wave.run(() => loadCostBook(P, undefined, { scope: "opex" }))).value;
    expect(only.periods).toEqual(full.periods.filter((p) => p.mode !== "land"));
    expect(full.extraGroups.land).toEqual(["Locations"]);
  });

  it("UT-COSTWAVE-OPT-004 a project with no OPEX rows is one wave", async () => {
    const original = ANSWERS["list OPEX project costs"];
    ANSWERS["list OPEX project costs"] = [];
    try {
      const { value, waves } = await wave.run(() => loadCostBook(P, undefined, { scope: "opex" }));
      expect(value.periods).toEqual([]);
      expect(waves).toBe(1);
    } finally {
      ANSWERS["list OPEX project costs"] = original!;
    }
  });
});

describe("CAPEX tab: loadCostBook(project, 0)", () => {
  it("UT-COSTWAVE-OPT-005 payer defaults start with the chart: contracts, then payments: 3 waves instead of 4, same 5 requests", async () => {
    const { value, waves, calls } = await wave.run(() => loadCostBook(P, 0));
    expect(OLD.capexTab).toEqual({ waves: 4, requests: 5 });
    expect(waves).toBe(3);
    expect(calls).toHaveLength(5);
    expect(startedTogether(calls, ["list CAPEX accounts", "list SPV/DevCo sub-account mapping"])).toBe(true);
    expect(waveOf(calls, "list CAPEX project contracts")).toBe(1);
    expect(startedTogether(calls, ["list CAPEX costs for the cost book", "list project states"])).toBe(true);
    expect(value.lines).toHaveLength(1);
    expect(value.lines[0]?.payer).toBe("DevCo");
    expect(value.accounts.find((a) => a.id === SUBACC)?.defaultPayer).toBe("DevCo");
  });

  it("UT-COSTWAVE-OPT-006 the Summary tab starts no payer read; a category with no accounts starts it speculatively and ignores it", async () => {
    const summary = await wave.run(() => loadCostBook(P, -1));
    expect(labels(summary.calls)).toEqual(["list CAPEX accounts"]);
    expect(summary.value.accounts.every((a) => a.defaultPayer === undefined)).toBe(true);
    const empty = await wave.run(() => loadCostBook(P, 4));
    // The chart is remembered from the Summary load, so nothing is waited for: the speculative payer read is started, not awaited.
    expect(labels(empty.calls)).toEqual(["list SPV/DevCo sub-account mapping"]);
    expect(empty.waves).toBe(0);
    expect(empty.value.lines).toEqual([]);
    expect(empty.value.accounts.every((a) => a.defaultPayer === undefined)).toBe(true);
  });

  it("UT-COSTWAVE-OPT-007 the cost rows are read at the 5000 page ceiling, the contracts at the default", async () => {
    const { calls } = await wave.run(() => loadCostBook(P, 0));
    expect(calls.find((c) => c.label === "list CAPEX costs for the cost book")?.maxPageSize).toBe(5000);
    expect(calls.find((c) => c.label === "list CAPEX project contracts")?.maxPageSize).toBeUndefined();
  });

  it("UT-COSTWAVE-OPT-008 the Project States of a linked contract come from the injected loader when one is given", async () => {
    const loadStates = vi.fn(async () => [{ id: "s1", name: "Cluster 1", order: 1 }]);
    const { value, calls } = await wave.run(() => loadCostBook(P, 0, { loadStates }));
    expect(loadStates).toHaveBeenCalledTimes(1);
    expect(labels(calls)).not.toContain("list project states");
    expect(value.lines[0]).toMatchObject({ linkedClusterId: "s1", linkedClusterName: "Cluster 1", linkedClusterOrder: 1 });
    // Without it the table's own read is used, and the line is the same.
    const own = (await wave.run(() => loadCostBook(P, 0))).value;
    expect(own.lines).toEqual(value.lines);
  });
});

describe("Summary tab chart reads", () => {
  it("UT-COSTWAVE-OPT-009 one chart-of-accounts read serves the tab strip, the totals and the book (3 before)", async () => {
    const { calls } = await wave.run(() => Promise.all([loadCapexCategories(), loadCapexTotals(P), loadCostBook(P, -1)]));
    expect(OLD.summaryChartReads).toBe(3);
    expect(count(calls, /^list CAPEX account/)).toBe(1);
  });

  it("UT-COSTWAVE-OPT-010 a later load inside the memo window reads no chart at all; an admin write forgets it", async () => {
    const first = await wave.run(() => loadCostBook(P, 0));
    expect(count(first.calls, /^list CAPEX account/)).toBe(1);
    const second = await wave.run(() => loadCostBook(P, 0));
    expect(count(second.calls, /^list CAPEX account/)).toBe(0);
    // Contracts and payer defaults start at once (chart remembered), then payments: 2 waves where the first load needed 3.
    expect(first.waves).toBe(3);
    expect(second.waves).toBe(2);
    expect(second.value).toEqual(first.value);
    (await import("./capexChart")).invalidateCapexChart();
    const third = await wave.run(() => loadCostBook(P, 0));
    expect(count(third.calls, /^list CAPEX account/)).toBe(1);
  });
});
