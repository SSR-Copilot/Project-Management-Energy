// Throwaway: attribute OUTPUT bytes of a minified chunk to source files by decoding the source map's VLQ mappings.
// usage: node map-bytes.mjs <dist> <chunk.js> [top] [--pkg]
import { readFileSync } from "node:fs";
import { join } from "node:path";
const [dist, chunk, topArg] = process.argv.slice(2);
const top = Number(topArg ?? 20);
const byPkg = process.argv.includes("--pkg");
const code = readFileSync(join(dist, "assets", chunk), "utf8");
const map = JSON.parse(readFileSync(join(dist, "assets", chunk + ".map"), "utf8"));
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const lut = new Map([...B64].map((c, i) => [c, i]));
function vlq(str) { const out = []; let shift = 0, val = 0; for (const ch of str) { const d = lut.get(ch); val += (d & 31) << shift; if (d & 32) shift += 5; else { out.push(val & 1 ? -(val >> 1) : val >> 1); val = 0; shift = 0; } } return out; }
const lines = code.split("\n");
const totals = new Map();
let src = 0;
const mlines = map.mappings.split(";");
for (let li = 0; li < mlines.length; li++) {
  const segs = mlines[li] ? mlines[li].split(",") : [];
  let col = 0; const lineLen = (lines[li] ?? "").length; const pts = [];
  for (const s of segs) { const f = vlq(s); col += f[0]; if (f.length >= 4) { src += f[1]; pts.push([col, src]); } else pts.push([col, -1]); }
  for (let i = 0; i < pts.length; i++) {
    const end = i + 1 < pts.length ? pts[i + 1][0] : lineLen; const len = end - pts[i][0];
    if (pts[i][1] < 0) { totals.set("(unmapped)", (totals.get("(unmapped)") ?? 0) + len); continue; }
    const s = map.sources[pts[i][1]];
    const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/);
    const key = nm ? "pkg:" + nm[1] : s.replace(/^(\.\.\/)+/, "").split("/").slice(0, byPkg ? 3 : 6).join("/");
    totals.set(key, (totals.get(key) ?? 0) + len);
  }
}
const arr = [...totals].sort((a, b) => b[1] - a[1]); const sum = arr.reduce((t, [, v]) => t + v, 0);
console.log(chunk, "total output chars:", sum);
for (const [k, v] of arr.slice(0, top)) console.log(String(v).padStart(9), (100 * v / sum).toFixed(1).padStart(5) + "%", k);
