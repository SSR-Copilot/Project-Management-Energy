#!/usr/bin/env node
/**
 * G-MATRIX — the security matrix is internally consistent, and its unfinished business is
 * visible rather than latent.
 *
 * `src/security/matrix.json` is the single source of truth for role security: the app reads
 * it through `src/platform/privileges.ts` and `solution/security/apply-roles.mjs` writes it
 * into Dataverse. Because two consumers depend on the same file, a malformed entry is not a
 * typo — it is a privilege that the client believes in and the server has never heard of, or
 * the reverse.
 *
 * WHAT THIS FAILS ON (exit 1):
 *   - a table missing a required field, or carrying a `kind` that is not one of the five;
 *   - a duplicate `entitySet`, `logicalName`, or alias — two tables answering to one spelling
 *     means one of them silently never receives a privilege;
 *   - an alias that is also some table's canonical `entitySet`;
 *   - a grant naming a role or a table that does not exist, or a depth that is not one of the
 *     five names;
 *   - a write privilege granted on a `readOnly` table (the mask in `security/index.ts` would
 *     drop it at runtime, so the file and the behaviour would disagree);
 *   - a `projectData` table without `requiresOwningBusinessUnit`, or a non-`projectData`
 *     table with it;
 *   - a `masterData` table whose `ownedByScreen` is not an `admin-*` screen.
 *
 * WHAT IT REPORTS WITHOUT FAILING: unverified logical names, and the spelling conflicts.
 * Both are `pac code add-data-source` work that cannot be done until the package is connected
 * to an environment, and this package ships deliberately unconnected. `--strict` turns them
 * into failures, which is what a Phase exit gate wants once an environment exists.
 *
 * USAGE
 *   node scripts/check-matrix.mjs                 report + consistency gate
 *   node scripts/check-matrix.mjs --strict        also fail on unverified names and conflicts
 *   node scripts/check-matrix.mjs --unverified    list only the unverified logical names
 *   node scripts/check-matrix.mjs --json          machine-readable
 *
 * EXIT CODES  0 consistent · 1 inconsistent (or strict findings) · 2 bad usage
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = ["masterData", "projectData", "reference", "platform", "connected"];
const DEPTHS = ["none", "user", "businessUnit", "parentChildBusinessUnit", "organization"];
const WRITES = ["create", "write", "delete"];
const REQUIRED = ["entitySet", "logicalName", "displayName", "kind", "ownership", "phase", "ownedByScreen", "isMasterData"];

const argv = process.argv.slice(2);
for (const a of argv) {
  if (a === "--help" || a === "-h") { console.log(readFileSync(new URL(import.meta.url)).toString().split("*/")[0]); process.exit(0); }
  if (!["--strict", "--unverified", "--json"].includes(a)) {
    console.error(`unknown argument ${a} — the gate takes --strict, --unverified and --json`);
    process.exit(2);
  }
}
const strict = argv.includes("--strict");
const asJson = argv.includes("--json");
const onlyUnverified = argv.includes("--unverified");

const m = JSON.parse(readFileSync(join(ROOT, "src/security/matrix.json"), "utf8"));
const tables = Object.entries(m.tables);
const errors = [];
const bad = (msg) => errors.push(msg);

/* ─────────────────────────────────────────────────────────── table integrity ─── */
const seenSet = new Map();
const seenLogical = new Map();
for (const [key, t] of tables) {
  for (const f of REQUIRED) {
    if (t[f] === undefined || t[f] === null || t[f] === "") bad(`${key}: missing ${f}`);
  }
  if (!KINDS.includes(t.kind)) bad(`${key}: kind "${t.kind}" is not one of ${KINDS.join(", ")}`);
  if (!["user", "organization"].includes(t.ownership)) bad(`${key}: ownership "${t.ownership}"`);
  if (![1, 2, 3].includes(t.phase)) bad(`${key}: phase ${t.phase}`);

  if (seenSet.has(t.entitySet)) bad(`entitySet ${t.entitySet} is on both ${seenSet.get(t.entitySet)} and ${key}`);
  seenSet.set(t.entitySet, key);
  if (seenLogical.has(t.logicalName)) bad(`logicalName ${t.logicalName} is on both ${seenLogical.get(t.logicalName)} and ${key}`);
  seenLogical.set(t.logicalName, key);

  const isMaster = t.kind !== "projectData";
  if (Boolean(t.isMasterData) !== isMaster) {
    bad(`${key}: isMasterData ${t.isMasterData} disagrees with kind ${t.kind} — isMasterData picks the grant default, so this hands the wrong one`);
  }
  const shouldReadOnly = ["reference", "platform", "connected"].includes(t.kind);
  if (Boolean(t.readOnly) !== shouldReadOnly) {
    bad(`${key}: readOnly ${Boolean(t.readOnly)} disagrees with kind ${t.kind}`);
  }
  const needsBu = t.kind === "projectData";
  if (Boolean(t.requiresOwningBusinessUnit) !== needsBu) {
    bad(`${key}: requiresOwningBusinessUnit ${Boolean(t.requiresOwningBusinessUnit)} disagrees with kind ${t.kind} — a BU-scoped role breaks silently when a create omits it`);
  }
  if (t.kind === "masterData" && !/^admin-[a-z-]+$/.test(t.ownedByScreen)) {
    bad(`${key}: master data must be owned by an admin-* screen, not "${t.ownedByScreen}"`);
  }
  if (t.kind === "platform" && t.ownedByScreen !== "-") {
    bad(`${key}: a platform table is owned by no screen; ownedByScreen should be "-"`);
  }
}

/* ─────────────────────────────────────────────────────────────────── aliases ─── */
const aliasOwner = new Map();
for (const [key, t] of tables) {
  for (const a of t.entitySetAliases ?? []) {
    if (seenSet.has(a)) bad(`alias ${a} on ${key} is also the canonical entitySet of ${seenSet.get(a)}`);
    if (aliasOwner.has(a)) bad(`alias ${a} is on both ${aliasOwner.get(a)} and ${key}`);
    aliasOwner.set(a, key);
  }
}
const conflictAliases = new Set((m.spellingConflicts ?? []).map((c) => c.alias));
for (const a of aliasOwner.keys()) {
  if (!conflictAliases.has(a)) bad(`alias ${a} is not recorded in spellingConflicts — an undocumented alias is an unexplained spelling`);
}
for (const c of m.spellingConflicts ?? []) {
  if (!aliasOwner.has(c.alias)) bad(`spellingConflicts names ${c.alias} but no table carries it as an alias`);
  if (!seenSet.has(c.canonical)) bad(`spellingConflicts names canonical ${c.canonical} which is no table's entitySet`);
}

/* ──────────────────────────────────────────────────────────────────── grants ─── */
for (const [role, g] of Object.entries(m.grants)) {
  if (!m.roles[role]) bad(`grants has role "${role}" which is not in roles`);
  for (const [tk, grant] of Object.entries(g)) {
    if (tk !== "_masterData" && tk !== "_projectData" && !m.tables[tk]) {
      bad(`${role}: override for "${tk}" which is not a table`);
      continue;
    }
    for (const [priv, depth] of Object.entries(grant)) {
      if (!m.privileges.includes(priv)) bad(`${role}/${tk}: "${priv}" is not a privilege`);
      if (!DEPTHS.includes(depth)) bad(`${role}/${tk}: depth "${depth}" is not one of ${DEPTHS.join(", ")}`);
    }
    if (tk !== "_masterData" && tk !== "_projectData" && m.tables[tk]?.readOnly) {
      for (const w of WRITES) {
        if (grant[w] && grant[w] !== "none") {
          bad(`${role}/${tk}: grants ${w} on a readOnly table — the mask in security/index.ts drops it, so the file claims a privilege the runtime denies`);
        }
      }
    }
  }
}
for (const role of Object.keys(m.roles)) {
  if (!m.grants[role]) bad(`role "${role}" has no grants`);
}

/* ───────────────────────────────────────────────────────────── soft findings ─── */
const unverified = tables.filter(([, t]) => t.verified !== true).map(([k, t]) => ({ key: k, entitySet: t.entitySet, logicalName: t.logicalName, kind: t.kind }));
const conflicts = m.spellingConflicts ?? [];
const byKind = Object.fromEntries(KINDS.map((k) => [k, tables.filter(([, t]) => t.kind === k).length]));

if (onlyUnverified) {
  for (const u of unverified) console.log(`${u.entitySet}  ->  ${u.logicalName}   (${u.kind})`);
  process.exit(0);
}
if (asJson) {
  console.log(JSON.stringify({ tables: tables.length, byKind, errors, unverified, conflicts }, null, 2));
  process.exit(errors.length > 0 || (strict && (unverified.length || conflicts.length)) ? 1 : 0);
}

console.log(`G-MATRIX  ${tables.length} tables  ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
console.log(`          matrix version ${m.version}, ${Object.keys(m.roles).length} roles`);

if (errors.length > 0) {
  console.log("");
  for (const e of errors) console.log(`  [ERROR] ${e}`);
}

if (unverified.length > 0) {
  console.log("");
  console.log(`  ${unverified.length} logical names were DERIVED by de-pluralising the entity set and never checked.`);
  console.log("  A wrong logical name makes every privilege name wrong: apply-roles.mjs writes");
  console.log("  privileges that do not exist and forTable() denies a table the user can write.");
  console.log("  Fix: pac code add-data-source per table, then set verified: true.");
  console.log("  List them with --unverified.");
}
if (conflicts.length > 0) {
  console.log("");
  console.log(`  ${conflicts.length} tables are declared twice in src/data/entities.ts under different plurals:`);
  for (const c of conflicts) console.log(`    ${c.canonical}   (also declared as ${c.alias})`);
  console.log("  Both spellings resolve to one table today. The metadata endpoint settles which is real.");
}

const strictFail = strict && (unverified.length > 0 || conflicts.length > 0);
if (errors.length === 0 && !strictFail) {
  console.log("");
  console.log(`G-MATRIX PASS — consistent. ${unverified.length} unverified names, ${conflicts.length} spelling conflicts to settle on connecting.`);
  process.exit(0);
}
console.log("");
console.log(`G-MATRIX FAIL — ${errors.length} error(s)${strictFail ? `, and --strict counts ${unverified.length} unverified + ${conflicts.length} conflicts as failures` : ""}.`);
process.exit(1);
