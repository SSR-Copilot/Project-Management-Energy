// Throwaway: per-chunk source contribution (from source map, approximated by sourcesContent length) and static imports graph.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dist = process.argv[2];
const chunk = process.argv[3];
const top = Number(process.argv[4] ?? 25);
const map = JSON.parse(readFileSync(join(dist, "assets", chunk + ".map"), "utf8"));
const tot = new Map();
map.sources.forEach((s, i) => {
  const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/);
  const key = nm ? "pkg:" + nm[1] : s.replace(/^(\.\.\/)+/, "").split("/").slice(0, 5).join("/");
  tot.set(key, (tot.get(key) ?? 0) + (map.sourcesContent?.[i]?.length ?? 0));
});
const arr = [...tot].sort((a, b) => b[1] - a[1]);
const sum = arr.reduce((t, [, v]) => t + v, 0);
console.log(chunk, "sources:", map.sources.length, "sourceChars:", sum);
for (const [k, v] of arr.slice(0, top)) console.log(String(v).padStart(9), k);
