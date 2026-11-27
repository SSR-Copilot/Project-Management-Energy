// SYNTHETIC: N writes submitted at once to a gate (ceiling 40 / lane 24, the app's values) whose tasks finish on a macrotask.
import { createRequestGate } from "../../../../ProjectCosts-CodeApp/src/data/concurrency.ts";
async function run(n, mixReads) {
  const gate = createRequestGate({ ceiling: 40, writeLane: 24 });
  const t = performance.now();
  const ps = [];
  for (let i = 0; i < n; i++) {
    const read = mixReads && i % 4 === 0;
    ps.push((read ? gate.runRead : gate.runWrite)(() => new Promise((r) => setImmediate(r))));
  }
  const submit = performance.now() - t;
  await Promise.all(ps);
  return { submit, total: performance.now() - t };
}
for (const n of [500, 3500, 15000]) {
  for (const mix of [false, true]) {
    const r = await run(n, mix);
    console.log(`gate n=${String(n).padStart(6)} reads-mixed=${mix}  submit-loop ${r.submit.toFixed(1)} ms  total ${r.total.toFixed(1)} ms  (${(r.total / n * 1000).toFixed(1)} us/task incl. setImmediate)`);
  }
}
