// SYNTHETIC. gridRows() (capex-costs/gridRows.ts, bundled with rolldown into gridRows.bundle.mjs) on a category-sized book.
import { gridRows } from "./gridRows.bundle.mjs";
function book(nAcc, subs, contractsPerSub, payments) {
  const accounts = [], lines = [];
  for (let a = 0; a < nAcc; a++) {
    accounts.push({ id: `a${a}`, number: `${80000 + a}`, name: `Account ${a}`, category: 0 });
    for (let s = 0; s < subs; s++) {
      const sid = `s${a}_${s}`;
      accounts.push({ id: sid, number: `${80000 + a}_${s}`, name: `Account ${a}`, category: 0, parentId: `a${a}` });
      for (let c = 0; c < contractsPerSub; c++) {
        const ps = [];
        for (let k = 0; k < payments; k++) ps.push({ id: `p${sid}${c}${k}`, year: 2022 + (k >> 4), month: 1 + (k % 12), amount: 1000 + k, paid: k % 3 === 0 });
        lines.push({ id: `c${sid}_${c}`, accountId: sid, description: `Contract ${c} ${sid}`, payer: "SPV", costTypePayer: "SPV", depreciation: true, vat: false, standard: c % 3 === 0,
          distribution: "equal", distributionScheme: "absolute", equalMode: "cluster", frequency: 1, clusters: [1, 2], payments: ps, comments: [], totalCost: 1e6 });
      }
    }
  }
  return { accounts, lines };
}
function time(label, fn, n = 9) { fn(); const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); } xs.sort((a, b) => a - b); console.log(label.padEnd(86), "median", xs[xs.length >> 1].toFixed(1), "ms  min", xs[0].toFixed(1), "max", xs[xs.length - 1].toFixed(1)); }
for (const [a, s, c, p] of [[10, 3, 3, 150], [30, 3, 5, 200], [30, 3, 12, 200]]) {
  const b = book(a, s, c, p);
  time(`gridRows ${b.accounts.length} accounts, ${b.lines.length} lines x ${p} payments (${b.lines.length * p} payments)`, () => gridRows(b.accounts, b.lines, 2026));
}
