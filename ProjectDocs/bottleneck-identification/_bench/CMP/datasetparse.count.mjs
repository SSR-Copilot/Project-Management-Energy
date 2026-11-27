// SYNTHETIC. Counts the record probes (getValue/getFormattedValue) one parseDatasetToTree issues, by wrapping the dataset's own record accessors.
import { DatasetParser } from "../../../../ProjectCosts-CodeApp/src/features/cost/capex-costs/pcf/services/DatasetParser.js";
const money = (r) => { r.TotalCost = 1e6; r.ActualCost = 2e5; r.PlannedCost = 8e5; for (let i = 1; i <= 12; i++) r[`M${i}`] = 1000 * i; return r; };
const rows = [];
rows.push(money({ RowId: "acc", ParentId: "", Type: "account", Number: "80000", Name: "A" }));
rows.push(money({ RowId: "sub", ParentId: "acc", Type: "subaccount", Number: "80000_0", Name: "A" }));
for (let c = 0; c < 100; c++) { const r = money({ RowId: `c${c}`, ParentId: "sub", Type: "contract", Number: "", Name: `C${c}`, SubLabel: "[SPV]", CostPaidBy: "SPV", IsStandardContract: false, DistributionType: "Equal Distribution", HasComments: false, CommentTooltip: "" });
  for (let i = 1; i <= 12; i++) { r[`M${i}Paid`] = i % 2 === 0; r[`M${i}HasComments`] = false; r[`M${i}CommentTooltip`] = ""; } rows.push(r); }
let gets = 0, fmts = 0;
const keys = [...new Set(rows.flatMap(Object.keys))];
const ds = { loading: false, columns: keys.map((name) => ({ name })), sortedRecordIds: rows.map((r) => r.RowId),
  records: Object.fromEntries(rows.map((row) => [row.RowId, { getValue: (k) => { gets++; return row[k]; }, getFormattedValue: (k) => { fmts++; return String(row[k] ?? ""); } }])) };
DatasetParser.parseDatasetToTree(ds);
console.log(`records=${rows.length} (100 contracts)  getValue calls=${gets}  getFormattedValue calls=${fmts}  per contract: ${(gets / 100).toFixed(0)} + ${(fmts / 100).toFixed(0)}`);
