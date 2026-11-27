/**
 * MEM audit (throwaway): retained heap of the Add Cost from Table data copies, MEASURED with a forced GC.
 * Copies the Screen holds at once: query data (contracts + costs), loadedRows, grid, roundTripped, originalRows (= roundTripped),
 * currentRows (a second array after the first edit). react-spreadsheet's own model is NOT included (see mem.leak.test.tsx for DOM).
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import v8 from "node:v8";
import { describe, it } from "vitest";
import { buildInitialSheet, type ExistingContract, type ExistingCost } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/rules";
import {
  outputRowsToSheetRows, sheetRowsToGrid, type SheetAccountGroup,
} from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/spreadsheet/adapter";
import { gridToJson } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/spreadsheet/SpreadSheet";

const OUT = "C:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectDocs/bottleneck-identification/_bench/MEM/mem.heap.results.txt";
writeFileSync(OUT, "");
const out = (s: string) => appendFileSync(OUT, s + "\n");

v8.setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;
const heap = (): number => { gc(); gc(); return process.memoryUsage().heapUsed; };
const mb = (n: number) => (n / 1048576).toFixed(1);

interface Fx { accounts: SheetAccountGroup[]; subaccounts: { id: string; number: string; name: string }[]; contracts: ExistingContract[]; costs: ExistingCost[]; years: number[]; }
function build(o: { accounts: number; subs: number; contractsPerSub: number; years: number }): Fx {
  const years = Array.from({ length: o.years }, (_, i) => 2020 + i);
  const accounts: SheetAccountGroup[] = [];
  const contracts: ExistingContract[] = [];
  const costs: ExistingCost[] = [];
  for (let a = 0; a < o.accounts; a++) {
    const number = String(80000 + a);
    const subs = Array.from({ length: o.subs }, (_, s) => ({ id: `sub-${a}-${s}`, number: `${number}_${s}`, name: `Account ${a}` }));
    accounts.push({ id: `acc-${a}`, number, name: `Account ${a}`, subaccounts: subs });
    for (const sub of subs) {
      for (let k = 0; k < o.contractsPerSub; k++) {
        const id = `c-${sub.id}-${k}`;
        contracts.push({ id, name: `Contract ${k} of ${sub.number}`, subaccountId: sub.id, isStandardContract: false, initialContractSource: null, distribution: null,
          distributionScheme: null, isEditedFromPcf: false, costType: k % 2 === 0 ? 952850001 : 952850002, depreciation: true, applyVat: k % 3 === 0 } as ExistingContract);
        for (const year of years) for (let m = 1; m <= 12; m++) {
          costs.push({ id: `k-${id}-${year}-${m}`, contractId: id, year, month: m, cost: 1000 + m } as ExistingCost);
        }
      }
    }
  }
  return { accounts, subaccounts: accounts.flatMap((x) => x.subaccounts), contracts, costs, years };
}

function measure(label: string, o: Parameters<typeof build>[0]) {
  const base = heap();
  const fx = build(o);
  const afterQuery = heap();
  const loadedRows = buildInitialSheet({ subaccounts: fx.subaccounts, contracts: fx.contracts, costs: fx.costs, currentYear: 2025 });
  const afterRows = heap();
  const grid = sheetRowsToGrid(loadedRows, fx.accounts, fx.years);
  const afterGrid = heap();
  const roundTripped = outputRowsToSheetRows(gridToJson(grid, String(fx.years[0])), fx.subaccounts, fx.contracts);
  const afterRound = heap();
  const currentRows = outputRowsToSheetRows(gridToJson(grid, String(fx.years[0])), fx.subaccounts, fx.contracts);
  const afterCurrent = heap();
  const cells = grid.length * (grid[0]?.length ?? 0);
  out(`${label}: ${fx.accounts.length} accounts, ${fx.contracts.length} contracts, ${fx.costs.length} cost rows, grid ${grid.length} rows x ${grid[0]?.length} cols = ${cells} cells, loadedRows ${loadedRows.length}, roundTripped ${roundTripped.length}`);
  out(`  retained MB (forced GC): query data ${mb(afterQuery - base)} | + loadedRows ${mb(afterRows - afterQuery)} | + grid ${mb(afterGrid - afterRows)} | + roundTripped ${mb(afterRound - afterGrid)} | + currentRows ${mb(afterCurrent - afterRound)} | TOTAL ${mb(afterCurrent - base)}`);
  // keep references alive until here, then drop them and measure what is left
  void [fx, loadedRows, grid, roundTripped, currentRows];
}

describe("MEM heap of the Add Cost data copies", () => {
  it("typical (about 28,000 cells) and the D51 stress size", { timeout: 300000 }, () => {
    measure("TYPICAL", { accounts: 20, subs: 3, contractsPerSub: 3, years: 10 });
    measure("LARGE", { accounts: 100, subs: 3, contractsPerSub: 5, years: 10 });
  });
});
