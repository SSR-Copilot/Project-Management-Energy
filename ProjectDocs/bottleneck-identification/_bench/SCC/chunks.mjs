// Throwaway: which built chunks hold src/features/cost sources, with sizes (MEASURED from dist/ and its source maps).
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
const dir = process.argv[2];
const out = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".js")) continue;
  const mapPath = path.join(dir, f + ".map");
  if (!fs.existsSync(mapPath)) continue;
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const srcs = (map.sources || []).map((s) => s.split(String.fromCharCode(92)).join("/"));
  const cost = srcs.filter((s) => s.includes("src/features/cost/"));
  if (!cost.length) continue;
  const buf = fs.readFileSync(path.join(dir, f));
  out.push({
    f,
    min: (buf.length / 1024).toFixed(1),
    gz: (zlib.gzipSync(buf).length / 1024).toFixed(1),
    costSrc: cost.length,
    areas: [...new Set(cost.map((s) => s.split("src/features/cost/")[1].split("/")[0]))].join(","),
    dataSrc: srcs.filter((s) => s.includes("src/data/")).length,
  });
}
out.sort((a, b) => Number(b.min) - Number(a.min));
console.table(out);
