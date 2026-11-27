// Throwaway (S2E): the source modules (src/ and package) inside one screen's first-load union, with source chars. usage: node modules.mjs <dist> <feature/slug> [minChars]
import { readFileSync, readdirSync, existsSync } from "node:fs"; import { join } from "node:path";
const [dist, want, minC = "3000"] = process.argv.slice(2); const assets = join(dist, "assets");
const files = readdirSync(assets).filter((f) => f.endsWith(".js")); const code = new Map(files.map((f) => [f, readFileSync(join(assets, f), "utf8")]));
const html = readFileSync(join(dist, "index.html"), "utf8"); const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
const si = (f) => [...new Set([...code.get(f).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]))].filter((x) => code.has(x));
const depsList = (f) => { const m = code.get(f).match(/__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=\[([^\]]*)\]/); return m ? [...m[1].matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]) : []; };
const pre = new Map(); for (const f of files) { const list = depsList(f); for (const m of code.get(f).matchAll(/import\(["`]\.\/([^"`]+\.js)["`]\)(?:,__vite__mapDeps\(\[([\d,]*)\]\))?/g)) { const t = m[1]; if (!code.has(t)) continue; const s = pre.get(t) ?? new Set(); if (m[2]) for (const i of m[2].split(",")) if (list[+i] && code.has(list[+i])) s.add(list[+i]); pre.set(t, s); } }
const srcs = (f) => { const mp = join(assets, f + ".map"); return existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")) : null; };
const entry = files.find((f) => { const m = srcs(f); return m && pre.has(f) && m.sources.some((x) => x.endsWith("features/" + want + "/Screen.tsx")); });
const seen = new Set(); const st = [entry, ...(pre.get(entry) ?? [])]; while (st.length) { const x = st.pop(); if (seen.has(x) || startup.has(x)) continue; seen.add(x); si(x).forEach((d) => st.push(d)); }
const rows = []; for (const f of seen) { const m = srcs(f); if (!m) continue; m.sources.forEach((s, i) => { const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/); const k = nm ? "pkg:" + nm[1] : s.replace(/^(\.\.\/)+/, "").replace(/^app\//, ""); rows.push([f, k, m.sourcesContent?.[i]?.length ?? 0]); }); }
const agg = new Map(); for (const [f, k, n] of rows) { const a = agg.get(k) ?? { n: 0, f }; a.n += n; agg.set(k, a); }
console.log(want, "entry", entry, "chunks", seen.size);
for (const [k, a] of [...agg].sort((x, y) => y[1].n - x[1].n)) if (a.n >= +minC) console.log(String(a.n).padStart(7), a.f.padEnd(34), k);
