/**
 * dvopt T-20 on the data layer: CA-08 (the SPV/DevCo mapping is read once and remembered), CA-09 (the contract ids are handed out
 * before the payments are read) and CA-16 (the active-WTG count selects only the column it sums).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Call { label: string; options?: { select?: string[] } }
let calls: Call[] = [];
let failMapping = false;
const SUB = "a0000000-0000-0000-0000-0000000000a1";
const CONTRACT = "c0000000-0000-0000-0000-000000000001";
const CONTRACT_2 = "c0000000-0000-0000-0000-000000000002";
const P = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const ROOT = "a0000000-0000-0000-0000-0000000000f0";
const CAT0 = "a0000000-0000-0000-0000-0000000000c0";
const ACCT = "a0000000-0000-0000-0000-0000000000a0";
const CHART = [
  { vsb_capexaccountlistid: ROOT, vsb_number: "00001", vsb_name: "Root" },
  { vsb_capexaccountlistid: CAT0, vsb_number: "10000", vsb_name: "Wind Turbine / Panels", vsb_order: 1, _vsb_parentaccount_value: ROOT },
  { vsb_capexaccountlistid: ACCT, vsb_number: "80000", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: CAT0 },
  { vsb_capexaccountlistid: SUB, vsb_number: "80000_0", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: ACCT },
];

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options?: Call["options"]) => {
    calls.push({ label, options });
    if (label === "list SPV/DevCo sub-account mapping") {
      if (failMapping) throw new Error("mapping read failed");
      return [{ vsb_spvdevcomappingcapexdevexid: "m1", _vsb_namesubaccount_value: SUB, vsb_devcospv: 952850001 }];
    }
    if (label === "list CAPEX accounts") return CHART;
    if (label === "list CAPEX project contracts") {
      return [
        { vsb_capexprojectcontractid: CONTRACT, _vsb_account_value: SUB, vsb_name: "C1" },
        { vsb_capexprojectcontractid: CONTRACT_2, _vsb_account_value: SUB, vsb_name: "C2" },
      ];
    }
    if (label === "list CAPEX costs for the cost book") return [];
    if (label === "list generator types in project") return [{ vsb_generatortypeinprojectid: "g", vsb_numberofgenerators: 3 }];
    return [];
  },
  deleteRecord: async () => undefined,
}));

const { loadCostBook, loadPayerDefaults, invalidatePayerDefaults } = await import("./costBook");
const { loadActiveWtgCount } = await import("./standardContracts");
const { setCapexOptFlags, resetCapexOptFlags } = await import("./capexOptFlags");
const { invalidateCapexChart } = await import("./capexChart");

const mappingReads = () => calls.filter((c) => c.label === "list SPV/DevCo sub-account mapping").length;

beforeEach(() => {
  calls = [];
  failMapping = false;
  invalidatePayerDefaults();
  invalidateCapexChart();
});
afterEach(() => resetCapexOptFlags());

describe("CA-08 the SPV/DevCo mapping is shared and remembered", () => {
  it("UT-SPVMAP-001 two book loads read the mapping once; the payer default still reaches the line", async () => {
    const first = await loadCostBook(P, 0);
    const second = await loadCostBook(P, 0);
    expect(mappingReads()).toBe(1);
    expect(first.lines[0]?.payer).toBe("DevCo");
    expect(second.lines).toEqual(first.lines);
    expect(second.accounts.find((a) => a.id === SUB)?.defaultPayer).toBe("DevCo");
  });

  it("UT-SPVMAP-002 simultaneous loads (a tab switch beside a refetch) share one read", async () => {
    await Promise.all([loadPayerDefaults(), loadPayerDefaults(), loadCostBook(P, 0)]);
    expect(mappingReads()).toBe(1);
  });

  it("UT-SPVMAP-003 invalidatePayerDefaults makes the next load read again", async () => {
    await loadPayerDefaults();
    invalidatePayerDefaults();
    await loadPayerDefaults();
    expect(mappingReads()).toBe(2);
  });

  it("UT-SPVMAP-004 a failed read is not remembered: the next load reads again", async () => {
    failMapping = true;
    await expect(loadPayerDefaults()).rejects.toThrow("mapping read failed");
    failMapping = false;
    await expect(loadPayerDefaults()).resolves.toBeInstanceOf(Map);
    expect(mappingReads()).toBe(2);
  });

  it("UT-SPVMAP-005 with SPV_MAPPING_SHARED off every load reads the table, as before", async () => {
    setCapexOptFlags({ SPV_MAPPING_SHARED: false });
    await loadCostBook(P, 0);
    await loadCostBook(P, 0);
    expect(mappingReads()).toBe(2);
  });
});

describe("CA-09 the contract ids are handed out before the payments are read", () => {
  it("UT-COMMENTWAVE-001 onContracts is called with every contract id after the contracts and BEFORE the payments request", async () => {
    const seen: string[][] = [];
    const book = await loadCostBook(P, 0, {
      onContracts: (ids) => { seen.push(ids); calls.push({ label: "onContracts" }); },
    });
    expect(seen).toEqual([[CONTRACT, CONTRACT_2]]);
    const order = calls.map((c) => c.label);
    expect(order.indexOf("onContracts")).toBeGreaterThan(order.indexOf("list CAPEX project contracts"));
    expect(order.indexOf("onContracts")).toBeLessThan(order.indexOf("list CAPEX costs for the cost book"));
    expect(book.lines).toHaveLength(2);
  });

  it("UT-COMMENTWAVE-002 a throwing callback never fails the book", async () => {
    const book = await loadCostBook(P, 0, { onContracts: () => { throw new Error("warm-up broke"); } });
    expect(book.lines).toHaveLength(2);
  });

  it("UT-COMMENTWAVE-003 the Summary tab, the period screens and a category with no contracts never call it", async () => {
    const onContracts = vi.fn();
    await loadCostBook(P, -1, { onContracts });
    await loadCostBook(P, undefined, { onContracts });
    expect(onContracts).not.toHaveBeenCalled();
  });

  it("UT-COMMENTWAVE-004 the book itself is the same with and without the callback", async () => {
    const plain = await loadCostBook(P, 0);
    invalidatePayerDefaults();
    const warmed = await loadCostBook(P, 0, { onContracts: () => undefined });
    expect(warmed).toEqual(plain);
  });
});

describe("CA-16 the active-WTG count", () => {
  it("UT-WTGCOUNT-001 selects the id and the column it sums, not statecode; the count is the same", async () => {
    expect(await loadActiveWtgCount(P)).toBe(3);
    expect(calls.find((c) => c.label === "list generator types in project")?.options?.select)
      .toEqual(["vsb_generatortypeinprojectid", "vsb_numberofgenerators"]);
  });

  it("UT-WTGCOUNT-002 with WTG_COUNT_STANDARD_ONLY off statecode is selected as before", async () => {
    setCapexOptFlags({ WTG_COUNT_STANDARD_ONLY: false });
    await loadActiveWtgCount(P);
    expect(calls.find((c) => c.label === "list generator types in project")?.options?.select)
      .toEqual(["vsb_generatortypeinprojectid", "vsb_numberofgenerators", "statecode"]);
  });
});
