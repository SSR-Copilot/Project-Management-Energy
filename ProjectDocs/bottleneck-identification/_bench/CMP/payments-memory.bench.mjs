// SYNTHETIC. Heap held by cost-book payments shaped like costBook.ts loadPayments() output ({id, year, month, amount, paid}).
// Ids come from JSON.parse (flat strings, as from an SDK response); the parsed source is released before the final reading.
function guid(i) { const h = (n, l) => n.toString(16).padStart(l, "0"); return `${h(i, 8)}-${h(i & 0xffff, 4)}-4${h(i & 0xfff, 3)}-a${h(i & 0xfff, 3)}-${h(i * 7919, 12)}`; }
function heap() { global.gc(); global.gc(); return process.memoryUsage().heapUsed; }
for (const n of [60000, 100000, 300000]) {
  const json = JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: guid(i) })));
  const before = heap();
  let arr = (() => { const src = JSON.parse(json); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = { id: src[i].id, year: 2022 + (i % 10), month: 1 + (i % 12), amount: 1000 + i, paid: i % 3 === 0 }; return out; })();
  const after = heap();
  console.log(`payments=${n}  retained heap +${((after - before) / 1048576).toFixed(1)} MiB (${((after - before) / n).toFixed(0)} bytes/payment, source JSON object tree released)`);
  arr = null;
}
