#!/usr/bin/env node
/**
 * Bundle report (D162 B0). Reads a built `dist/` and prints:
 *  - STARTUP: the entry script plus every `modulepreload` in `index.html` (what the browser fetches before any screen chunk),
 *    minified and gzip bytes;
 *  - the largest chunks, each named by the source folder that contributes most of its bytes (from the source map, when present).
 *
 * Usage (after `npm run build`):  node scripts/bundle-report.mjs [distDir] [--top N] [--json]
 * Not part of `verify`: it is the before/after measure for `ProjectDocs/app-docs/frontend-optimization/09`.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith("--")) ?? "dist";
const top = Number(args[args.indexOf("--top") + 1]) || 15;
const asJson = args.includes("--json");

export function startupFiles(html) {
  return [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
}

/** The source folder (or npm package) contributing most source characters to a chunk; a label, not a measurement. */
export function mainSource(mapJson) {
  const totals = new Map();
  mapJson.sources.forEach((s, i) => {
    const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/);
    const key = nm ? nm[1] : s.replace(/^(\.\.\/)+/, "").split("/").slice(0, 4).join("/");
    totals.set(key, (totals.get(key) ?? 0) + (mapJson.sourcesContent?.[i]?.length ?? 0));
  });
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
}

function main() {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const size = (rel) => {
    const buf = readFileSync(join(dist, rel));
    return { min: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  };
  const start = startupFiles(html).map((f) => ({ file: f, ...size(f) }));
  const startup = start.reduce((t, f) => ({ min: t.min + f.min, gzip: t.gzip + f.gzip }), { min: 0, gzip: 0 });
  const chunks = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js")).map((f) => {
    const rel = `assets/${f}`;
    const map = join(dist, `${rel}.map`);
    return { file: rel, ...size(rel), main: existsSync(map) ? mainSource(JSON.parse(readFileSync(map, "utf8"))) : "?" };
  }).sort((a, b) => b.min - a.min);
  if (asJson) { console.log(JSON.stringify({ startup, startupFiles: start, chunks }, null, 2)); return; }
  const kb = (n) => (n / 1024).toFixed(1).padStart(8);
  console.log(`STARTUP ${start.length} files: ${kb(startup.min)} kB min ${kb(startup.gzip)} kB gzip`);
  for (const f of start) console.log(`  ${kb(f.min)} ${kb(f.gzip)}  ${f.file}`);
  console.log(`\nLARGEST ${top} of ${chunks.length} chunks (min, gzip, main source):`);
  for (const c of chunks.slice(0, top)) console.log(`  ${kb(c.min)} ${kb(c.gzip)}  ${c.file}  <- ${c.main}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/bundle-report.mjs")) main();
