// usage: node who-imports.mjs <dist> <chunkPrefix> : which chunks import it statically (and dynamically), with main source
import { readFileSync, readdirSync, existsSync } from "node:fs"; import { join } from "node:path";
const [dist, pref] = process.argv.slice(2); const assets = join(dist, "assets");
const files = readdirSync(assets).filter((f) => f.endsWith(".js")); const tgt = files.find((f) => f.startsWith(pref));
const main = (f) => { const mp = join(assets, f + ".map"); if (!existsSync(mp)) return "?"; const m = JSON.parse(readFileSync(mp, "utf8")); const t = new Map(); m.sources.forEach((s, i) => { if (!s.includes("src/")) return; const k = s.replace(/^(\.\.\/)+/, "").replace(/^app\//,""); t.set(k, (t.get(k) ?? 0) + (m.sourcesContent?.[i]?.length ?? 0)); }); return [...t].sort((a, b) => b[1] - a[1]).slice(0,3).map((x) => x[0].replace("src/", "")).join(", "); };
console.log("target", tgt);
for (const f of files) { const c = readFileSync(join(assets, f), "utf8"); const st = new RegExp(`(?:from|^import)\s*"\./${tgt.replace(/[.]/g, "\.")}"`, "m").test(c); const dy = c.includes(`import("./${tgt}")`); if (st || dy) console.log(st ? "STATIC " : "dynamic", f.padEnd(34), main(f)); }
