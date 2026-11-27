// Throwaway (BND): attribute OUTPUT chars of every chunk in dist to package / app area (source-map VLQ decode); print totals.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dist = process.argv[2]; const assets = join(dist, "assets");
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; const lut = new Map([...B64].map((c, i) => [c, i]));
function vlq(str) { const out = []; let shift = 0, val = 0; for (const ch of str) { const d = lut.get(ch); val += (d & 31) << shift; if (d & 32) shift += 5; else { out.push(val & 1 ? -(val >> 1) : val >> 1); val = 0; shift = 0; } } return out; }
const totals = new Map(); let grand = 0;
for (const f of readdirSync(assets).filter((x) => x.endsWith(".js"))) {
  const code = readFileSync(join(assets, f), "utf8"); let map; try { map = JSON.parse(readFileSync(join(assets, f + ".map"), "utf8")); } catch { continue; }
  const lines = code.split("\n"); let src = 0; const ml = map.mappings.split(";");
  for (let li = 0; li < ml.length; li++) {
    const segs = ml[li] ? ml[li].split(",") : []; let col = 0; const len = (lines[li] ?? "").length; const pts = [];
    for (const s of segs) { const fl = vlq(s); col += fl[0]; if (fl.length >= 4) { src += fl[1]; pts.push([col, src]); } else pts.push([col, -1]); }
    for (let i = 0; i < pts.length; i++) {
      const end = i + 1 < pts.length ? pts[i + 1][0] : len; const n = end - pts[i][0]; grand += n;
      let key = "(unmapped)";
      if (pts[i][1] >= 0) { const s = map.sources[pts[i][1]].replace(/^(\.\.\/)+/, ""); const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/); key = nm ? (nm[1].startsWith("@fluentui") || nm[1].startsWith("@griffel") || nm[1] === "tabster" || nm[1] === "keyborg" ? "FLUENT-FAMILY" : "pkg:" + nm[1]) : s.startsWith("src/generated") || s.startsWith(".power") ? "src/generated+.power" : s.split("/").slice(0, 3).join("/"); }
      totals.set(key, (totals.get(key) ?? 0) + n);
    }
  }
}
const arr = [...totals].sort((a, b) => b[1] - a[1]);
console.log("total output chars all chunks:", grand);
for (const [k, v] of arr.slice(0, 40)) console.log(String(v).padStart(9), (100 * v / grand).toFixed(1).padStart(5) + "%", k);
