// Throwaway (BND): V8 parse+compile time (NOT evaluation, NOT browser) of the startup JS files, using vm.SourceTextModule.
// usage: node --experimental-vm-modules parse-time.mjs <dist> [runs]
import vm from "node:vm"; import { readFileSync } from "node:fs"; import { join } from "node:path";
const dist = process.argv[2]; const runs = Number(process.argv[3] ?? 15);
const html = readFileSync(join(dist, "index.html"), "utf8");
const files = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
let totalMed = 0;
for (const f of files.concat(process.argv.slice(4))) {
  const code = readFileSync(join(dist, "assets", f), "utf8"); const t = []; let first = 0;
  for (let i = 0; i < runs; i++) { const s = performance.now(); new vm.SourceTextModule(code, { identifier: f + i }); t.push(performance.now() - s); if (i === 0) first = t[0]; }
  t.sort((a, b) => a - b); const med = t[Math.floor(t.length / 2)]; if (files.includes(f)) totalMed += med;
  console.log(f.padEnd(40), (code.length / 1024).toFixed(1).padStart(8), "KiB  median", med.toFixed(2).padStart(7), "ms  min", t[0].toFixed(2), "ms first-run", first.toFixed(2), "ms");
}
console.log("startup files median sum:", totalMed.toFixed(1), "ms");
