import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";
const dist = process.argv[2];
const assets = path.join(dist, "assets");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.(?:js|css))"/g)].map(m => m[1]));
function deps(f, seen = new Set()) {
  if (seen.has(f)) return seen; seen.add(f);
  const p = path.join(assets, f); if (!fs.existsSync(p) || !f.endsWith(".js")) return seen;
  const src = fs.readFileSync(p, "utf8");
  // static imports: import ... from"./x.js" / import"./x.js" (not dynamic import( ))
  for (const m of src.matchAll(/(?:^|[;}\n])\s*(?:import|export)\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) deps(m[1], seen);
  return seen;
}
const size = (f) => { const b = fs.readFileSync(path.join(assets, f)); return [b.length, zlib.gzipSync(b).length]; };
let startRaw = 0, startGz = 0;
const st = new Set(); for (const f of startup) deps(f, st);
for (const f of st) { const [r,g] = size(f); startRaw += r; startGz += g; }
console.log("startup files (static closure):", st.size, "raw", startRaw, "gzip", startGz);
for (const f of process.argv.slice(3)) {
  const d = deps(f); let r0=0,g0=0, own=0, ownG=0;
  for (const x of d) if (!st.has(x)) { const [r,g] = size(x); r0+=r; g0+=g; }
  const [r,g]=size(f);
  console.log(f, "own raw/gz", r, g, "| extra over startup raw/gz", r0, g0, "| total gz", startGz+g0);
}
if (process.env.LIST) {
  const d = deps(process.env.LIST);
  const rows = [...d].filter(x => !st.has(x)).map(x => ({ x, gz: size(x)[1] })).sort((a,b)=>b.gz-a.gz);
  for (const r of rows) console.log("  ", r.x, r.gz);
}
