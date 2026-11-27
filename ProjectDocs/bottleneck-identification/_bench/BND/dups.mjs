// Throwaway (BND): duplicate sources across chunks, nested duplicate package paths, per-package totals across all of dist.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dist = process.argv[2]; const assets = join(dist, "assets");
const maps = readdirSync(assets).filter((f) => f.endsWith(".js.map"));
const where = new Map(); const pkgPaths = new Map(); const pkgTot = new Map();
for (const f of maps) {
  const m = JSON.parse(readFileSync(join(assets, f), "utf8"));
  m.sources.forEach((s, i) => {
    const norm = s.replace(/^(\.\.\/)+/, "");
    (where.get(norm) ?? where.set(norm, new Set()).get(norm)).add(f.replace(".map", ""));
    const mm = norm.match(/^(.*?node_modules\/)((@[^/]+\/)?[^/]+)\//);
    if (mm) {
      const name = mm[2];
      (pkgPaths.get(name) ?? pkgPaths.set(name, new Set()).get(name)).add(mm[1] + name);
      pkgTot.set(name, (pkgTot.get(name) ?? 0) + 0);
    }
  });
}
let dupFiles = 0; const dupList = [];
for (const [s, set] of where) if (set.size > 1) { dupFiles++; dupList.push([s, [...set]]); }
console.log("sources total:", where.size, "appearing in >1 chunk:", dupFiles);
for (const [s, set] of dupList.slice(0, 25)) console.log("  ", s.slice(-90), set.length);
console.log("\npackages with >1 install path:");
for (const [n, set] of pkgPaths) if (set.size > 1) console.log("  ", n, [...set]);
console.log("\nunique packages:", pkgPaths.size);
