// Throwaway (BND): per lazy entry, the chunks the browser fetches for it, from Vite's own preload map
// (`__vitePreload(() => import(`./X.js`), __vite__mapDeps([i,...]))`) plus the static-import closure, excluding startup files.
// usage: node closure.mjs <dist>
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const dist = process.argv[2];
const assets = join(dist, "assets");
const files = readdirSync(assets).filter((f) => f.endsWith(".js"));
const code = new Map(files.map((f) => [f, readFileSync(join(assets, f), "utf8")]));
const gzc = new Map();
const size = (f) => { if (!gzc.has(f)) gzc.set(f, gzipSync(Buffer.from(code.get(f)), { level: 9 }).length); return { min: Buffer.byteLength(code.get(f)), gz: gzc.get(f) }; };
const html = readFileSync(join(dist, "index.html"), "utf8");
const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
const staticImports = (f) => { const out = new Set(); for (const m of code.get(f).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) out.add(m[1]); return [...out].filter((x) => code.has(x)); };
function closure(f) { const seen = new Set(); const st = [f]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); for (const d of staticImports(x)) st.push(d); } return seen; }
function depsList(f) { const m = code.get(f).match(/__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=\[([^\]]*)\]/); return m ? [...m[1].matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]) : []; }
const entries = new Map();
for (const f of files) {
  const list = depsList(f);
  for (const m of code.get(f).matchAll(/import\(["`]\.\/([^"`]+\.js)["`]\)(?:,__vite__mapDeps\(\[([\d,]*)\]\))?/g)) {
    const t = m[1]; if (!code.has(t)) continue;
    const e = entries.get(t) ?? { importers: new Set(), preload: new Set() };
    e.importers.add(f);
    if (m[2]) for (const i of m[2].split(",")) if (list[Number(i)] && code.has(list[Number(i)])) e.preload.add(list[Number(i)]);
    entries.set(t, e);
  }
}
const mainSource = (f) => { const mp = join(assets, f + ".map"); if (!existsSync(mp)) return "?"; const m = JSON.parse(readFileSync(mp, "utf8")); const t = new Map(); m.sources.forEach((s, i) => { const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/); const k = nm ? "pkg:" + nm[1] : s.replace(/^(\.\.\/)+/, "").split("/").slice(0, 4).join("/"); t.set(k, (t.get(k) ?? 0) + (m.sourcesContent?.[i]?.length ?? 0)); }); return [...t].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?"; };
const rows = [];
for (const [e, info] of entries) {
  if (startup.has(e)) continue;
  const cl = [...closure(e)].filter((x) => !startup.has(x));
  const pl = [...info.preload].filter((x) => !startup.has(x));
  const union = new Set([...cl, ...pl]);
  const sum = (set) => [...set].reduce((t, x) => { const s = size(x); return { min: t.min + s.min, gz: t.gz + s.gz }; }, { min: 0, gz: 0 });
  rows.push({ e, own: size(e), main: mainSource(e), nu: union.size, un: sum(union), imp: info.importers.size });
}
rows.sort((a, b) => b.un.min - a.un.min);
const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log("entry".padEnd(38), "own.min own.gz | union(preload+static,excl startup): n  min  gz | main source");
for (const r of rows) console.log(r.e.padEnd(38), kb(r.own.min), kb(r.own.gz), "|", String(r.nu).padStart(3), kb(r.un.min), kb(r.un.gz), "|", r.main);
const st = [...startup].reduce((t, f) => { const s = size(f); return { min: t.min + s.min, gz: t.gz + s.gz }; }, { min: 0, gz: 0 });
console.log("STARTUP files", startup.size, "total", kb(st.min), kb(st.gz));
