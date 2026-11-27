// SYNTHETIC dataset in the exact flat-row shape gridRows() emits (keys copied from gridRows.ts);
// times the vendored PCF parser DatasetParser.parseDatasetToTree, which GridRenderer.render() runs on EVERY repaint.
import { DatasetParser } from "../../../../ProjectCosts-CodeApp/src/features/cost/capex-costs/pcf/services/DatasetParser.js";
function rows(nAcc, subPerAcc, contractsPerSub) {
  const out = [];
  for (let a = 0; a < nAcc; a++) {
    const money = (r) => { r.TotalCost = 1e6; r.ActualCost = 2e5; r.PlannedCost = 8e5; for (let i = 1; i <= 12; i++) r[`M${i}`] = 1000 * i; return r; };
    out.push(money({ RowId: `acc-${a}`, ParentId: "", Type: "account", Number: `${80000 + a}`, Name: `Account ${a}` }));
    for (let s = 0; s < subPerAcc; s++) {
      const sid = `sub-${a}-${s}`;
      out.push(money({ RowId: sid, ParentId: `acc-${a}`, Type: "subaccount", Number: `${80000 + a}_${s}`, Name: `Account ${a}` }));
      for (let c = 0; c < contractsPerSub; c++) {
        const r = money({ RowId: `c-${sid}-${c}`, ParentId: sid, Type: "contract", Number: "", Name: `Contract ${c} of ${sid}`, SubLabel: "[SPV]", CostPaidBy: "SPV",
          IsStandardContract: c % 2 === 0, DistributionType: "Equal Distribution", HasComments: c % 5 === 0, CommentTooltip: c % 5 === 0 ? "note" : "" });
        for (let i = 1; i <= 12; i++) { r[`M${i}Paid`] = i % 2 === 0; r[`M${i}HasComments`] = false; r[`M${i}CommentTooltip`] = ""; }
        out.push(r);
      }
    }
  }
  return out;
}
function dataset(rs) {
  const keys = [...new Set(rs.flatMap(Object.keys))];
  return { loading: false, columns: keys.map((name) => ({ name })), sortedRecordIds: rs.map((r) => String(r.RowId)),
    records: Object.fromEntries(rs.map((row) => [String(row.RowId), { getValue: (k) => row[k], getFormattedValue: (k) => String(row[k] ?? "") }])) };
}
function time(label, fn, n = 9) { fn(); const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); } xs.sort((a, b) => a - b); console.log(label.padEnd(78), "median", xs[xs.length >> 1].toFixed(1), "ms  min", xs[0].toFixed(1), "max", xs[xs.length - 1].toFixed(1)); }
for (const [a, s, c] of [[6, 3, 4], [30, 3, 5], [30, 3, 12], [100, 3, 5]]) {
  const rs = rows(a, s, c), ds = dataset(rs);
  time(`parseDatasetToTree ${rs.length} records (${a} acc x ${s} sub x ${c} contracts), ${ds.columns.length} columns`, () => DatasetParser.parseDatasetToTree(ds));
}
