// Throwaway (BND): list every non-startup chunk in a lazy entry's static closure, with min/gzip and main source.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const [dist, entry] = process.argv.slice(2); const assets = join(dist, "assets");
const html = readFileSync(join(dist, "index.html"), "utf8");
const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
const read = (f) => readFileSync(join(assets, f), "utf8");
const seen = new Set(); const st = [entry];
while (st.length) { const x = st.pop(); if (seen.has(x) || startup.has(x)) continue; seen.add(x); for (const m of read(x).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) if (existsSync(join(assets, m[1]))) st.push(m[1]); }
const main = (f) => { const mp = join(assets, f + ".map"); if (!existsSync(mp)) return "?"; const m = JSON.parse(readFileSync(mp, "utf8")); const t = new Map(); m.sources.forEach((s, i) => { const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/); const k = nm ? "pkg:" + nm[1] : s.replace(/^(\.\.\/)+/, "").split("/").slice(0, 4).join("/"); t.set(k, (t.get(k) ?? 0) + (m.sourcesContent?.[i]?.length ?? 0)); }); return [...t].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?"; };
const rows = [...seen].map((f) => { const b = Buffer.from(read(f)); return [f, b.length, gzipSync(b, { level: 9 }).length, main(f)]; }).sort((a, b) => b[1] - a[1]);
for (const r of rows) console.log(String((r[1] / 1024).toFixed(1)).padStart(7), String((r[2] / 1024).toFixed(1)).padStart(7), r[0].padEnd(42), r[3]);
