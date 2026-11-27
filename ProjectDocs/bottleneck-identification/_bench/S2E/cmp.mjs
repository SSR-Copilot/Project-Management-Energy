// Throwaway (S2E): per-screen first-load closure (preload map + static imports, excl. startup) and startup size for a dist dir,
// keyed by the Screen.tsx source file inside each lazy entry. usage: node cmp.mjs <distA> [<distB> ...]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
function analyse(dist) {
  const assets = join(dist, "assets");
  const files = readdirSync(assets).filter((f) => f.endsWith(".js"));
  const code = new Map(files.map((f) => [f, readFileSync(join(assets, f), "utf8")]));
  const sz = new Map();
  const size = (f) => { if (!sz.has(f)) sz.set(f, { min: Buffer.byteLength(code.get(f)), gz: gzipSync(Buffer.from(code.get(f)), { level: 9 }).length }); return sz.get(f); };
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
  const si = (f) => [...new Set([...code.get(f).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]))].filter((x) => code.has(x));
  const depsList = (f) => { const m = code.get(f).match(/__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=\[([^\]]*)\]/); return m ? [...m[1].matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]) : []; };
  const pre = new Map();
  for (const f of files) { const list = depsList(f); for (const m of code.get(f).matchAll(/import\(["`]\.\/([^"`]+\.js)["`]\)(?:,__vite__mapDeps\(\[([\d,]*)\]\))?/g)) { const t = m[1]; if (!code.has(t)) continue; const s = pre.get(t) ?? new Set(); if (m[2]) for (const i of m[2].split(",")) if (list[+i] && code.has(list[+i])) s.add(list[+i]); pre.set(t, s); } }
  const closure = (e) => { const seen = new Set(); const st = [e]; while (st.length) { const x = st.pop(); if (seen.has(x) || startup.has(x)) continue; seen.add(x); si(x).forEach((d) => st.push(d)); } return seen; };
  const key = (f) => { const mp = join(assets, f + ".map"); if (!existsSync(mp)) return null; const m = JSON.parse(readFileSync(mp, "utf8")); const s = m.sources.find((x) => /features\/[^/]+\/[^/]+\/Screen\.tsx$/.test(x)); return s ? s.match(/features\/([^/]+\/[^/]+)\/Screen\.tsx$/)[1] : null; };
  const out = {};
  for (const f of files) { const k = key(f); if (!k || !pre.has(f)) continue; const u = new Set([...closure(f), ...[...pre.get(f)].filter((x) => !startup.has(x))]); let min = 0, gz = 0; for (const x of u) { min += size(x).min; gz += size(x).gz; } out[k] = { n: u.size, min, gz }; }
  let smin = 0, sgz = 0; for (const f of startup) { smin += size(f).min; sgz += size(f).gz; }
  return { out, startup: { n: startup.size, min: smin, gz: sgz }, files: files.length };
}
const dists = process.argv.slice(2);
const res = dists.map(analyse);
const kb = (n) => (n / 1024).toFixed(1);
console.log("startup:", res.map((r, i) => `${dists[i].split(/[\/]/).pop()}: ${r.startup.n} files ${kb(r.startup.min)} min / ${kb(r.startup.gz)} gz`).join(" | "), "| JS files:", res.map((r) => r.files).join(" / "));
const keys = [...new Set(res.flatMap((r) => Object.keys(r.out)))].sort();
console.log("screen".padEnd(44), res.map((_, i) => `[${i}] n   min    gz`.padStart(22)).join(""), "   d.gz(last-first)");
for (const k of keys) { const row = res.map((r) => r.out[k]); const f = row[0], l = row[row.length - 1]; console.log(k.padEnd(44), row.map((x) => (x ? `${String(x.n).padStart(3)} ${kb(x.min).padStart(7)} ${kb(x.gz).padStart(6)}` : "-").padStart(22)).join(""), f && l ? `   ${kb(l.gz - f.gz).padStart(6)}` : ""); }
