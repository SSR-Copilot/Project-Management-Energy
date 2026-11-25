/**
 * FE-AD-07 (D162): the active-only CAPEX account read moved out of `./contracts`. It is the shared chart read mapped to
 * `AccountRow`s, and `listCapexAccounts()` (no options) in `./contracts` returns exactly the same rows from it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

const chart = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./capexChart", () => ({ loadCapexChartRows: chart.load, invalidateCapexChart: vi.fn() }));

import { listActiveCapexAccounts, toAccountRow } from "./capexAccounts";
import { listCapexAccounts } from "./contracts";

const ROWS = [
  { vsb_capexaccountlistid: "a1", vsb_number: "10000", vsb_name: "Development Expenses", vsb_order: 1, _vsb_parentaccount_value: null },
  { vsb_capexaccountlistid: "a2", vsb_number: null, vsb_name: "Turbines", vsb_order: 3, _vsb_parentaccount_value: "a1" },
];

beforeEach(() => {
  chart.load.mockReset();
  chart.load.mockResolvedValue(ROWS);
});

describe("capexAccounts (FE-AD-07)", () => {
  it("UT-CAPEXACC-FE-001 maps the shared chart rows to AccountRows (a null number becomes empty), in the chart's order", async () => {
    expect(await listActiveCapexAccounts()).toEqual([
      { id: "a1", number: "10000", name: "Development Expenses", order: 1, parentId: null },
      { id: "a2", number: "", name: "Turbines", order: 3, parentId: "a1" },
    ]);
    expect(chart.load).toHaveBeenCalledTimes(1);
  });

  it("UT-CAPEXACC-FE-002 listCapexAccounts() in data/contracts answers its default call from the same read, with the same rows", async () => {
    const viaContracts = await listCapexAccounts();
    expect(viaContracts).toEqual(await listActiveCapexAccounts());
    expect(viaContracts).toEqual(ROWS.map((r) => toAccountRow(r as never)));
  });
});
