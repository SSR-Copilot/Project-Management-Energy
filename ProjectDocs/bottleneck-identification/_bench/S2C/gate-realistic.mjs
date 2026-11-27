// S2C: the CMP-04 gate against a trivial head-pointer FIFO pool of the same width (24), tasks of fixed wall time (a request stand-in).
// Differences between the two columns isolate the gate's own scheduling cost from timer granularity (Windows timers are ~16 ms coarse).
import { createRequestGate } from "../../../../ProjectCosts-CodeApp/src/data/concurrency.ts";
const taskMs = Number(process.argv[2] ?? 5);
const task = () => new Promise((r) => setTimeout(r, taskMs));
function simplePool(limit) {            // O(1) per task: array + head index
  const q = []; let head = 0, active = 0;
  const pump = () => { while (active < limit && head < q.length) { const s = q[head++]; active++; s(); } if (head > 1024 && head * 2 > q.length) { q.splice(0, head); head = 0; } };
  return (fn) => new Promise((res, rej) => { q.push(() => fn().then((v) => { active--; pump(); res(v); }, (e) => { active--; pump(); rej(e); })); pump(); });
}
async function timed(label, n, submit) {
  let last = performance.now(), maxGap = 0;
  const iv = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 1);
  const t = performance.now();
  await Promise.all(Array.from({ length: n }, () => submit(task)));
  const total = performance.now() - t; clearInterval(iv);
  console.log(`${label.padEnd(10)} n=${String(n).padStart(6)} taskMs=${taskMs} total ${total.toFixed(0).padStart(6)} ms  longest loop gap ${maxGap.toFixed(1)} ms`);
}
for (const n of [500, 3500, 15000]) {
  const gate = createRequestGate({ ceiling: 40, writeLane: 24 });
  await timed("gate", n, (f) => gate.runWrite(f));
  const pool = simplePool(24);
  await timed("simple", n, (f) => pool(f));
}
