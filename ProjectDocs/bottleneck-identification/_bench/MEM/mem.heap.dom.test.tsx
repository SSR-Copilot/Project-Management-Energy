// @vitest-environment jsdom
/**
 * MEM audit (throwaway): heap retained across mount/unmount cycles of the REAL Add Cost grid (react-spreadsheet) on a
 * typical (~33,000 cell) sheet, forced GC between cycles. A leak shows as a heap that keeps climbing cycle after cycle.
 * jsdom has no layout, so the row/column window is the fallback window (rowWindow.ts): the DOM part is NOT representative of a browser;
 * the JS-side model, the grids and the closures are.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import v8 from "node:v8";
import { createElement as h } from "react";
import { describe, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { buildInitialSheet, type ExistingContract, type ExistingCost } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/rules";
import { sheetRowsToGrid, type SheetAccountGroup } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/spreadsheet/adapter";
import { SpreadSheetComp } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/spreadsheet/SpreadSheet";

const OUT = "C:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectDocs/bottleneck-identification/_bench/MEM/mem.heap.dom.results.txt";
writeFileSync(OUT, "");
const out = (s: string) => appendFileSync(OUT, s + "\n");
v8.setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;
const heap = (): number => { gc(); gc(); return process.memoryUsage().heapUsed; };
const mb = (n: number) => (n / 1048576).toFixed(2);

function fixture() {
  const years = Array.from({ length: 10 }, (_, i) => 2020 + i);
  const accounts: SheetAccountGroup[] = [];
  const contracts: ExistingContract[] = [];
  const costs: ExistingCost[] = [];
  for (let a = 0; a < 20; a++) {
    const number = String(80000 + a);
    const subs = Array.from({ length: 3 }, (_, s) => ({ id: `sub-${a}-${s}`, number: `${number}_${s}`, name: `Account ${a}` }));
    accounts.push({ id: `acc-${a}`, number, name: `Account ${a}`, subaccounts: subs });
    for (const sub of subs) for (let k = 0; k < 3; k++) {
      const id = `c-${sub.id}-${k}`;
      contracts.push({ id, name: `Contract ${k} of ${sub.number}`, subaccountId: sub.id, isStandardContract: false, initialContractSource: null, distribution: null,
        distributionScheme: null, isEditedFromPcf: false, costType: 952850001, depreciation: true, applyVat: false } as ExistingContract);
      for (const year of years) for (let m = 1; m <= 12; m++) costs.push({ id: `k-${id}-${year}-${m}`, contractId: id, year, month: m, cost: 1000 + m } as ExistingCost);
    }
  }
  const subaccounts = accounts.flatMap((x) => x.subaccounts);
  const rows = buildInitialSheet({ subaccounts, contracts, costs, currentYear: 2025 });
  return sheetRowsToGrid(rows, accounts, years);
}

describe("MEM heap across mount/unmount of the Add Cost grid", () => {
  it("jsdom control: heap of N plain table cells", { timeout: 120000 }, () => {
    const before = heap();
    const table = document.createElement("table");
    document.body.appendChild(table);
    for (let r = 0; r < 56; r++) { const tr = document.createElement("tr"); for (let c = 0; c < 127; c++) { const td = document.createElement("td"); td.className = "Spreadsheet__cell"; td.setAttribute("tabindex", "0"); const div = document.createElement("div"); div.className = "Spreadsheet__data-viewer"; div.textContent = "1000"; td.appendChild(div); tr.appendChild(td); } table.appendChild(tr); }
    const after = heap();
    out(`control: ${56 * 127} td + ${56 * 127} div plain jsdom elements = ${mb(after - before)} MB`);
    table.remove();
  });

  it("10 cycles", { timeout: 280000 }, async () => {
    const grid = fixture();
    out(`grid ${grid.length} rows x ${grid[0]?.length} cols = ${grid.length * (grid[0]?.length ?? 0)} cells (held by the test the whole time)`);
    const baseline = heap();
    out(`baseline heap (grid held, nothing mounted): ${mb(baseline)} MB`);
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const view = render(h(SpreadSheetComp as never, { data: grid, onDataChange: () => undefined, addRowToken: 0, deleteRowToken: 0, copyTableToken: 0 }));
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      const nodes = document.querySelectorAll("*").length;
      const tds = document.querySelectorAll("td").length;
      const mounted = heap();
      if (i === 0) out(`mounted DOM: ${nodes} elements, ${tds} td`);
      view.unmount();
      cleanup();
      await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
      const after = heap();
      samples.push(after - baseline);
      out(`cycle ${i + 1}: while mounted ${mb(mounted - baseline)} MB above baseline | after unmount ${mb(after - baseline)} MB above baseline`);
    }
    out(`growth cycle 3 -> cycle 10 after unmount: ${mb((samples[9] ?? 0) - (samples[2] ?? 0))} MB`);
  });
});
