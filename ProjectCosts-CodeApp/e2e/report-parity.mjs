/**
 * Prints the differences found by the Application Settings parity run, per screen and state, from e2e/results/parity/*.diff.json.
 *
 *   node e2e/report-parity.mjs              all screens
 *   node e2e/report-parity.mjs gates        one screen (the key used in appsettings.parity.spec.ts)
 */
import { readdirSync, readFileSync } from "node:fs";

const DIR = "e2e/parity-out";
const only = process.argv[2];
const files = readdirSync(DIR).filter((f) => f.endsWith(".diff.json") && (!only || f.startsWith(`${only}.`))).sort();

for (const f of files) {
  const d = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
  console.log(`\n=== ${f.replace(".diff.json", "")}: matched ${d.matched}, differences ${d.diffs.length}, only in Canvas ${d.missingInCode.length}, only in code app ${d.extraInCode.length}`);
  const byProp = new Map();
  for (const x of d.diffs) byProp.set(x.property, [...(byProp.get(x.property) ?? []), x]);
  for (const [prop, list] of byProp) {
    console.log(`  -- ${prop} (${list.length})`);
    for (const x of list.slice(0, 14)) console.log(`     "${String(x.text).slice(0, 48)}"  canvas=${JSON.stringify(x.canvas)}  code=${JSON.stringify(x.code)}`);
    if (list.length > 14) console.log(`     ... ${list.length - 14} more`);
  }
  const uniq = (a) => [...new Set(a)];
  if (d.missingInCode.length) console.log(`  -- only in Canvas: ${uniq(d.missingInCode).slice(0, 30).map((t) => JSON.stringify(t.slice(0, 40))).join(", ")}`);
  if (d.extraInCode.length) console.log(`  -- only in code app: ${uniq(d.extraInCode).slice(0, 30).map((t) => JSON.stringify(t.slice(0, 40))).join(", ")}`);
}
