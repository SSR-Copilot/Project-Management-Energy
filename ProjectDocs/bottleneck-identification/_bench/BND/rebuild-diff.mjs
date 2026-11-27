// Throwaway (BND): compare two builds of the SAME commit: which chunk file names (content hashes) changed. usage: node rebuild-diff.mjs <distA> <distB>
import { readdirSync, statSync } from "node:fs"; import { join } from "node:path";
const [a, b] = process.argv.slice(2);
const ls = (d) => new Map(readdirSync(join(d, "assets")).filter((f) => f.endsWith(".js")).map((f) => [f, statSync(join(d, "assets", f)).size]));
const A = ls(a), B = ls(b);
const same = [...A.keys()].filter((f) => B.has(f)); const changed = [...A.keys()].filter((f) => !B.has(f));
const sum = (m, keys) => keys.reduce((t, k) => t + m.get(k), 0);
console.log(`build A: ${A.size} js files, ${sum(A, [...A.keys()])} bytes`);
console.log(`build B: ${B.size} js files`);
console.log(`unchanged names: ${same.length} (${sum(A, same)} bytes)   changed names: ${changed.length} (${sum(A, changed)} bytes)`);
console.log("unchanged examples:", same.slice(0, 6).join(", "));
console.log("changed examples:", changed.slice(0, 8).join(", "));
import { readFileSync } from "node:fs"; import { gzipSync } from "node:zlib";
const gzs = (keys) => keys.reduce((t, k) => t + gzipSync(readFileSync(join(a, "assets", k)), { level: 9 }).length, 0);
console.log(`gzip -9: changed ${gzs(changed)} bytes, unchanged ${gzs(same)} bytes`);
console.log("startup files among changed:", changed.filter((f) => /^(index|fluent|requestLog|odata|keys|tokens|preload-helper|rolldown-runtime)-/.test(f)).join(", "));
