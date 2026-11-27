// Throwaway (BND): route -> lazy entry map, cold first-visit bytes (startup + lazy union via Vite preload map + static closure).
import { readFileSync, readdirSync } from "node:fs"; import { join } from "node:path"; import { gzipSync } from "node:zlib";
const dist = process.argv[2]; const assets = join(dist, "assets");
const files = readdirSync(assets).filter((f) => f.endsWith(".js")); const code = new Map(files.map((f) => [f, readFileSync(join(assets, f), "utf8")]));
const html = readFileSync(join(dist, "index.html"), "utf8");
const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
const gz = new Map(); const sz = (f) => { if (!gz.has(f)) gz.set(f, gzipSync(Buffer.from(code.get(f)), { level: 9 }).length); return [Buffer.byteLength(code.get(f)), gz.get(f)]; };
const si = (f) => [...code.get(f).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]).filter((x) => code.has(x));
const deps = (f) => { const m = code.get(f).match(/__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=\[([^\]]*)\]/); return m ? [...m[1].matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]) : []; };
// preload set per entry from the index chunk's dynamic imports (call-site map)
const idx = files.find((f) => f.startsWith("index-")); const list = deps(idx); const pre = new Map();
for (const m of code.get(idx).matchAll(/import\(["`]\.\/([^"`]+\.js)["`]\)(?:,__vite__mapDeps\(\[([\d,]*)\]\))?/g)) if (m[2]) pre.set(m[1], m[2].split(",").map((i) => list[Number(i)]).filter((x) => x && code.has(x)));
const closure = (es) => { const seen = new Set(); const st = [...es]; while (st.length) { const x = st.pop(); if (seen.has(x) || startup.has(x)) continue; seen.add(x); si(x).forEach((d) => st.push(d)); } return seen; };
const routes = [
  ["/projects (landing)", ["Screen-BgDMkne6.js"]], ["/project/general", ["Screen-DuQPl2yM.js"]], ["/project/milestones", ["Screen-m5F1Lqbr.js"]],
  ["/project/generators", ["Screen-B-1GCA0X.js"]], ["/project/production", ["Screen-CRiFdCfH.js"]], ["/project/checklist", ["Screen-Ok0eTbgG.js"]],
  ["/project/team", ["Screen-D5Qd_ZEW.js"]], ["/project/planning", ["Screen-Dn2K28V6.js"]], ["/project/grid-operator", ["Screen-Dfbh8eqR.js"]],
  ["/project/revenues", ["Screen-QXbxUotO.js"]], ["/project/finance", ["Screen-DpubSrou.js"]],
  ["/costs/capex", ["Screen-ni7tS4J9.js"]], ["/costs/contracts", ["Screen-afgntddX.js"]], ["/costs/opex/*", ["Screen-CkMzW0UK.js"]], ["/costs/land-lease", ["Screen-fxvg--mG.js"]],
  ["/costs/add-from-table (CAPEX + sheet)", ["Screen-ni7tS4J9.js", "Screen-DjBqOuyo.js"]],
  ["/admin/default-checklists", ["Screen-8Bf0Dqoc.js"]], ["/admin/gates-approvals", ["Screen-Dgwg0-Cx.js"]], ["/admin/capex-accounts", ["Screen-MdqRc4Pr.js"]],
  ["/admin/milestones", ["Screen-D5QLiMEH.js"]], ["/admin/cost", ["Screen-D-tfb6nZ.js"]], ["/admin/contract", ["Screen-BCiAxgJ7.js"]],
];
const st = [...startup].reduce((t, f) => { const [a, b] = sz(f); return [t[0] + a, t[1] + b]; }, [0, 0]);
console.log("| Route | Lazy entry | Entry own KiB min | Lazy files | Lazy KiB min | Lazy KiB gz | Cold total KiB min | Cold total KiB gz |");
for (const [name, es] of routes) {
  const set = closure(es); for (const e of es) for (const p of pre.get(e) ?? []) if (!startup.has(p)) set.add(p);
  const [a, b] = [...set].reduce((t, f) => { const [x, y] = sz(f); return [t[0] + x, t[1] + y]; }, [0, 0]);
  const own = es.map((e) => sz(e)[0]).reduce((x, y) => x + y, 0);
  const k = (n) => (n / 1024).toFixed(1);
  console.log(`| ${name} | ${es.join(" + ")} | ${k(own)} | ${set.size} | ${k(a)} | ${k(b)} | ${k(a + st[0])} | ${k(b + st[1])} |`);
}
console.log("startup KiB min/gz", (st[0] / 1024).toFixed(1), (st[1] / 1024).toFixed(1));
