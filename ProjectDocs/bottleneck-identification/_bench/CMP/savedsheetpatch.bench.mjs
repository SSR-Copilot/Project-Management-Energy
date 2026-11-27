// SYNTHETIC. applySavedSheetToBook (costing/savedSheetPatch.ts, bundled) run after an Add Cost from Table Save on the cached CAPEX book.
import { applySavedSheetToBook } from "./savedSheetPatch.bundle.mjs";
function book(nLines, nPay) {
  const lines = [];
  for (let c = 0; c < nLines; c++) {
    const payments = [];
    for (let k = 0; k < nPay; k++) payments.push({ id: `P${c}-${k}`, year: 2022 + (k >> 4), month: 1 + (k % 12), amount: 1000 + k, paid: false });
    lines.push({ id: `C${c}`, accountId: `S${c % 90}`, description: `d${c}`, payer: "SPV", depreciation: true, vat: false, standard: false, distribution: "equal", distributionScheme: "absolute",
      equalMode: "cluster", frequency: 1, clusters: [], payments, comments: [], totalCost: 1e6 });
  }
  return { accounts: Array.from({ length: 90 }, (_, i) => ({ id: `S${i}`, category: 0 })), lines };
}
function time(label, fn, n = 9) { fn(); const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); } xs.sort((a, b) => a - b); console.log(label.padEnd(88), "median", xs[xs.length >> 1].toFixed(1), "ms  min", xs[0].toFixed(1), "max", xs[xs.length - 1].toFixed(1)); }
for (const [nL, nP, changedCosts, deletedContracts] of [[500, 200, 0, 0], [500, 200, 3487, 40], [1500, 200, 3487, 40]]) {
  const b = book(nL, nP);
  const costs = [];
  for (let i = 0; i < changedCosts; i++) { const c = i % nL; costs.push({ id: `P${c}-${i % nP}`, contractId: `C${c}`, year: 2022 + ((i % nP) >> 4), month: 1 + ((i % nP) % 12), amount: 5 + i, isNew: false }); }
  const changes = { contracts: [], costs, deletedContractIds: Array.from({ length: deletedContracts }, (_, i) => `C${i}`), deletedCostIds: [] };
  time(`applySavedSheetToBook lines=${nL} payments/line=${nP} (${nL * nP} payments) changedCosts=${changedCosts} deletedContracts=${deletedContracts}`, () => applySavedSheetToBook(b, changes, 0));
}
