// Throwaway (SCC): CPU of the CAPEX grid's pure pipeline at several volumes. Node, not a browser: it times the data work only,
// NOT the DOM rebuild of GridRenderer.render. Median of 7 runs after 2 warm-up runs.
import { it } from "vitest";
import { gridRows } from "@/features/cost/capex-costs/gridRows";
// @ts-expect-error vendored JS
import { DatasetParser } from "@/features/cost/capex-costs/pcf/services/DatasetParser.js";

function fixture(contracts: number, monthsPerContract: number) {
  const accounts: any[] = [];
  const subs = Math.max(10, Math.ceil(contracts / 10));
  accounts.push({ id: "acc-0", number: "1", name: "A", category: 0 });
  for (let s = 0; s < subs; s++) accounts.push({ id: `sub-${s}`, number: `1_${s}`, name: `S${s}`, parentId: "acc-0", category: 0 });
  const lines: any[] = [];
  for (let c = 0; c < contracts; c++) {
    const payments = [];
    for (let m = 0; m < monthsPerContract; m++) payments.push({ id: `p-${c}-${m}`, year: 2020 + Math.floor(m / 12), month: 1 + (m % 12), amount: 1000 + m, paid: m % 3 === 0 });
    lines.push({ id: `c-${c}`, accountId: `sub-${c % subs}`, description: `Contract ${c}`, payer: "SPV", costTypePayer: "SPV", depreciation: true, vat: false, standard: false,
      distribution: "individual", equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1, clusters: [], payments, comments: [], totalCost: 100000 });
  }
  return { accounts, lines };
}
function dataset(rows: any[]) {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return { loading: false, columns: keys.map((name) => ({ name })), sortedRecordIds: rows.map((r) => String(r.RowId)),
    records: Object.fromEntries(rows.map((row) => [String(row.RowId), { getValue: (k: string) => row[k], getFormattedValue: (k: string) => String(row[k] ?? "") }])) };
}
const med = (xs: number[]) => xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)] as number;
const time = (f: () => unknown) => { const s = performance.now(); f(); return performance.now() - s; };
it("grid pipeline", () => {
  for (const [contracts, months] of [[12, 58], [300, 120], [1000, 120], [3000, 120]] as const) {
    const { accounts, lines } = fixture(contracts, months);
    let rows: any[] = []; let ds: any = null;
    const a: number[] = [], b: number[] = [], c: number[] = [];
    for (let i = 0; i < 9; i++) {
      const ta = time(() => { rows = gridRows(accounts, lines, 2026, new Map()); });
      const tb = time(() => { ds = dataset(rows); });
      const tc = time(() => DatasetParser.parseDatasetToTree(ds));
      if (i >= 2) { a.push(ta); b.push(tb); c.push(tc); }
    }
    console.log(`SCC grid: ${contracts} contracts x ${months} months = ${contracts * months} cost rows | gridRows ${med(a).toFixed(1)} ms | dataset ${med(b).toFixed(1)} ms | parseDatasetToTree ${med(c).toFixed(1)} ms | flat rows ${rows.length}`);
  }
});
