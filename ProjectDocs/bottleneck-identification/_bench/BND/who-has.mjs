// Throwaway (BND): which lazy Screen entries statically reach a given chunk. usage: node who-has.mjs <dist> <chunk.js>
import { readFileSync, readdirSync, existsSync } from "node:fs"; import { join } from "node:path";
const [dist, target] = process.argv.slice(2); const assets = join(dist, "assets");
const html = readFileSync(join(dist, "index.html"), "utf8");
const startup = new Set([...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
const files = readdirSync(assets).filter((f) => f.endsWith(".js")); const code = new Map(files.map((f) => [f, readFileSync(join(assets, f), "utf8")]));
const si = (f) => [...code.get(f).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]).filter((x) => code.has(x));
const reach = (e) => { const seen = new Set(); const st = [e]; while (st.length) { const x = st.pop(); if (seen.has(x) || startup.has(x)) continue; seen.add(x); si(x).forEach((d) => st.push(d)); } return seen; };
const main = (f) => { const mp = join(assets, f + ".map"); if (!existsSync(mp)) return "?"; const m = JSON.parse(readFileSync(mp, "utf8")); const t = new Map(); m.sources.forEach((s, i) => { if (!s.includes("src/")) return; const k = s.replace(/^(\.\.\/)+/, "").split("/").slice(0, 4).join("/"); t.set(k, (t.get(k) ?? 0) + (m.sourcesContent?.[i]?.length ?? 0)); }); return [...t].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?"; };
const hits = files.filter((f) => /^Screen-/.test(f) && reach(f).has(target)).map((f) => `${f} (${main(f)})`);
console.log(target, "reached by", hits.length, "of", files.filter((f) => /^Screen-/.test(f)).length, "Screen entries"); hits.forEach((h) => console.log("  ", h));
