// SYNTHETIC data. Times the app's global structural-sharing default (app/queryStructuralSharing.ts)
// on a refetch whose rows are all unchanged (the common case: tab return after stale time).
import { structuralSharingWithDates } from "../../../../ProjectCosts-CodeApp/src/app/queryStructuralSharing.ts";
import { replaceEqualDeep } from "../../../../ProjectCosts-CodeApp/node_modules/@tanstack/query-core/build/modern/utils.js";

function makeLines(nContracts, perContract, withDates) {
  const lines = [];
  for (let c = 0; c < nContracts; c++) {
    const payments = [];
    for (let k = 0; k < perContract; k++) payments.push({ id: `p-${c}-${k}`, year: 2020 + (k >> 4), month: 1 + (k % 12), amount: 1000 + k, paid: k % 3 === 0 });
    lines.push({ id: `c-${c}`, accountId: `a-${c % 50}`, description: `Contract ${c}`, payer: "SPV", depreciation: true, vat: false, standard: false,
      distribution: "equal", clusters: [1, 2, 3], payments, comments: [], totalCost: 5e5,
      startDate: withDates ? new Date(2026, 0, 1) : undefined, endDate: withDates ? new Date(2030, 0, 1) : undefined });
  }
  return lines;
}
function time(label, fn, n = 7) {
  fn(); const xs = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); }
  xs.sort((a, b) => a - b);
  console.log(label.padEnd(70), "median", xs[xs.length >> 1].toFixed(1), "ms  min", xs[0].toFixed(1), "max", xs[xs.length - 1].toFixed(1));
}
for (const [nC, per] of [[300, 200], [500, 200], [1500, 10]]) {
  const total = nC * per;
  for (const withDates of [false, true]) {
    const a = makeLines(nC, per, withDates), b = makeLines(nC, per, withDates);
    time(`app structuralSharingWithDates ${nC} contracts x ${per} payments (${total} payment objs, dates=${withDates}) unchanged`, () => structuralSharingWithDates(a, b));
    time(`tanstack replaceEqualDeep      ${nC} contracts x ${per} payments (${total} payment objs, dates=${withDates}) unchanged`, () => replaceEqualDeep(a, b));
  }
}
