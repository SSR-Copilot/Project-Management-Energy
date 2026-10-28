#!/usr/bin/env node
/**
 * Data-source gate — `.power/` (pac output, git-ignored) matches what the app needs.
 *
 * Why: every generated service looks its table up by name at RUNTIME
 * (`getClient(dataSourcesInfo)` + `dataSourceName = '<entity set>'`), so a table missing from
 * `.power/schemas/appschemas/dataSourcesInfo.ts` type-checks, builds and passes the unit suite,
 * then fails the first time a screen reads it. `pac code add-data-source` is known to drop
 * previously registered tables (CONVENTIONS rule 9), and `.power/` is absent on every fresh
 * checkout, so this runs first in `npm run verify` and before every `pac code push`.
 *
 * Checks:
 *   - `.power/schemas/appschemas/dataSourcesInfo.ts` exists;
 *   - every `power.config.json` data source has an entry there and a `<key>.Schema.json`;
 *   - every `src/generated/services/*Service.ts` `dataSourceName` has an entry there.
 *
 * Fix: from app/, `pac code add-data-source -a dataverse -t <logicalName>` for each missing
 * table (pac profile on VSBCloud_Dev), diffing `dataSourcesInfo.ts` after each one.
 *
 * Usage (from app/):  node scripts/check-power-sources.mjs
 *   exit 0 = clean; exit 1 = `.power/` missing or out of step.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INFO = path.join(APP, ".power/schemas/appschemas/dataSourcesInfo.ts");
const SCHEMAS = path.join(APP, ".power/schemas/dataverse");
const SERVICES = path.join(APP, "src/generated/services");

export function checkPowerSources() {
  const problems = [];
  if (!fs.existsSync(INFO)) {
    return { registered: 0, problems: [".power/ is missing — regenerate it with pac code add-data-source (see header)"] };
  }
  const info = fs.readFileSync(INFO, "utf8");
  const registered = new Set([...info.matchAll(/^ {2}"([^"]+)": \{/gm)].map((m) => m[1]));

  const config = JSON.parse(fs.readFileSync(path.join(APP, "power.config.json"), "utf8"));
  const sources = config.databaseReferences?.["default.cds"]?.dataSources ?? {};
  for (const [key, { entitySetName, logicalName }] of Object.entries(sources)) {
    // `pa app add dataverse-api` registers a bound operation (CreateMultiple, UpdateMultiple,
    // UpsertMultiple) against an `environment_<id>` entry whose entity set is "Environment". It is
    // not a table and has no schema, but the host routes the operation through it: removing it
    // was followed by HTTP 501 from UpsertMultiple (D51, 27 Oct 2026). Accept it.
    if (entitySetName === "Environment" && key.startsWith("environment_")) continue;
    if (!registered.has(entitySetName)) problems.push(`${logicalName}: not in dataSourcesInfo.ts`);
    if (!fs.existsSync(path.join(SCHEMAS, `${key}.Schema.json`))) problems.push(`${logicalName}: no ${key}.Schema.json`);
  }
  for (const file of fs.readdirSync(SERVICES).filter((f) => f.endsWith("Service.ts"))) {
    const m = /dataSourceName = '([^']+)'/.exec(fs.readFileSync(path.join(SERVICES, file), "utf8"));
    if (m && !registered.has(m[1])) problems.push(`${file}: '${m[1]}' not in dataSourcesInfo.ts`);
  }
  return { registered: registered.size, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = checkPowerSources();
  for (const p of r.problems) console.error(`  ✗ ${p}`);
  console.log(`power-sources: ${r.registered} registered, ${r.problems.length} problems`);
  process.exit(r.problems.length ? 1 : 0);
}
