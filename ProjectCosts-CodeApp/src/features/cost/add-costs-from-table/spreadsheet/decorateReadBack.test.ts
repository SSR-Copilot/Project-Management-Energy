/**
 * D162 (FE-C1-04, review note 3): the screen no longer reads back the grid's first report after a load, because that report is
 * `decorateGrid(loaded.grid)` and decorating must not change what reads back. This pins that claim directly: on a sheet with
 * header, account, standard, historical, empty and multi-year rows, the decorated grid reads back exactly as `roundTripped`.
 */
import { describe, expect, it } from "vitest";
import { buildInitialSheet, CHOICE, sheetYearRange, type ExistingContract } from "../rules";
import { outputRowsToSheetRows, sheetRowsToGrid } from "./adapter";
import { decorateGrid, gridToJson } from "./SpreadSheet";

const SUBS = [
  { id: "sub-1", number: "80000_0", name: "Turbine" },
  { id: "sub-2", number: "80000_1", name: "Foundation" },
  { id: "sub-3", number: "81000_0", name: "Grid" },
];
const base: Omit<ExistingContract, "id" | "name" | "subaccountId" | "isStandardContract" | "totalCost"> = {
  initialContractSource: CHOICE.initialContractSource.pcf, distribution: CHOICE.distributionType.individual,
  distributionScheme: CHOICE.distributionScheme.absoluteValues, isEditedFromPcf: true,
  costType: CHOICE.costPaidType.devCo, depreciation: true, applyVat: true,
};
const CONTRACTS: ExistingContract[] = [
  { ...base, id: "c-1", name: "My Cost", subaccountId: "sub-1", isStandardContract: false, totalCost: 150 },
  { ...base, id: "c-2", name: "Standard Foundation", subaccountId: "sub-2", isStandardContract: true, totalCost: 900 },
  { ...base, id: "c-3", name: "Old Grid Study", subaccountId: "sub-3", isStandardContract: false, totalCost: 40 },
];
const COSTS = [
  { id: "k-1", contractId: "c-1", year: 2026, month: 1, cost: 100 },
  { id: "k-2", contractId: "c-1", year: 2027, month: 12, cost: 50 },
  { id: "k-3", contractId: "c-2", year: 2026, month: 6, cost: 900 },
  { id: "k-4", contractId: "c-3", year: 2024, month: 3, cost: 40 },
];

describe("a decorated grid reads back unchanged (D162, FE-C1-04)", () => {
  it("UT-ADDCOST-FE-010 decorateGrid changes nothing the read-back sees", () => {
    const years = sheetYearRange(2024, 2028);
    const rows = buildInitialSheet({ subaccounts: SUBS, contracts: CONTRACTS, costs: COSTS, currentYear: 2026, payerDefaults: new Map() });
    const grid = sheetRowsToGrid(rows, [
      { id: "acc-1", number: "80000", name: "Turbines", subaccounts: [SUBS[0]!, SUBS[1]!] },
      { id: "acc-2", number: "81000", name: "Grid", subaccounts: [SUBS[2]!] },
    ], years.years);
    const readBack = (g: typeof grid) => outputRowsToSheetRows(gridToJson(g, String(years.start)), SUBS, CONTRACTS);
    const roundTripped = readBack(grid);
    expect(roundTripped.length).toBeGreaterThan(3);
    expect(readBack(decorateGrid(grid))).toEqual(roundTripped);
  });
});
