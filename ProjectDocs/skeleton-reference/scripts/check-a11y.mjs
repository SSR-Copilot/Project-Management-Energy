#!/usr/bin/env node
/**
 * check-a11y.mjs — the G-A11Y gate. `node scripts/check-a11y.mjs [--strict] [--update-baseline]`.
 * No network. Exit 0 = clean, 1 = findings, 2 = the gate itself broke.
 *
 * THE RULE IT ENFORCES (docs/G-A11Y.md)
 *   Every canvas control that sets `AccessibleLabel` has a code-app counterpart that renders
 *   `aria-label` = the human caption and `data-testid` = the canvas control name, wired
 *   through `a11yFor(screen)(control)` / `canvasA11y(screen, control)` from `src/a11y`.
 *   The canvas renders AccessibleLabel as `aria-label`; Tosca and screen readers key on it.
 *
 * FIVE CHECKS
 *   1. corpus-stale     reference/canvas-accessible-labels.json no longer matches the canvas
 *                       source it names (re-extracted in memory when the source is present;
 *                       reported as skipped, loudly, when it is not).
 *   2. module-stale     src/a11y/canvasA11y.generated.ts disagrees with the corpus.
 *   3. control-name-label  an `aria-label` literal that IS a canvas control name
 *                       (`aria-label="txt_…"`). The 14 Oct 2026 decision puts the name on
 *                       `data-testid` and the caption on `aria-label`; a screen reader must
 *                       never announce `cmb_Supplier_3`.
 *   4. unknown-control  an `a11y("…")` / `canvasA11y(S, "…")` naming a control the corpus does
 *                       not have for that screen. `tsc` catches this too; the gate makes the
 *                       message readable.
 *   5. unwired          a corpus control with no `a11y(...)` reference. Fails only when it is
 *                       NOT in reference/a11y-baseline.json — the baseline is a to-do list
 *                       of owed wiring, exactly like the label and ownership baselines. A
 *                       baseline entry that is now wired, or no longer in the corpus, FAILS as
 *                       stale so the list cannot rot.
 *
 *   --strict            baselined entries fail too (the phase-exit question).
 *   --update-baseline   rewrite the baseline from the current unwired set, preserving each
 *                       surviving entry's `owner` and `reason`. Never to turn a red build green.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { extract, renderGeneratedModule, GENERATED_MODULE, CONTROL_NAME_RE } from "./extract-accessible-labels.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = resolve(ROOT, "../..");
const CORPUS = join(ROOT, "reference/canvas-accessible-labels.json");
const BASELINE = join(ROOT, "reference/a11y-baseline.json");

const args = new Set(process.argv.slice(2));
for (const a of args) {
  if (!["--strict", "--update-baseline"].includes(a)) {
    console.error(`check-a11y: unknown argument ${a}`);
    process.exit(2);
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.endsWith("canvasA11y.generated.ts")) out.push(p);
  }
  return out;
}

/** canvas screen → feature folder, from buildPlan.ts (`slug` + `canvasScreen` on one entry). */
function screenFolders() {
  const plan = readFileSync(join(ROOT, "src/app/buildPlan.ts"), "utf8");
  const map = new Map();
  const re = /slug:\s*"([^"]+)"[\s\S]{0,200}?canvasScreen:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(plan))) {
    const slug = m[1];
    for (const phase of ["admin", "pm", "cost"]) {
      const dir = join(ROOT, "src/features", phase, slug);
      if (existsSync(dir)) map.set(m[2], relative(ROOT, dir));
    }
  }
  return map;
}

const findings = [];
const add = (kind, msg) => findings.push({ kind, msg });

let corpus;
try {
  corpus = JSON.parse(readFileSync(CORPUS, "utf8"));
} catch (e) {
  console.error(`check-a11y: cannot read ${relative(ROOT, CORPUS)} — run \`npm run a11y:extract\` (${e.message})`);
  process.exit(2);
}
const entries = corpus.entries;

/* 1 · the corpus against the source */
const sources = (corpus.sources ?? []).map((s) => ({ app: s.app, dir: resolve(WORKSPACE, s.dir) }));
const present = sources.filter((s) => existsSync(s.dir));
let corpusCheck = "skipped (canvas source not present)";
if (present.length === sources.length && sources.length > 0) {
  const fresh = extract(sources).entries;
  const a = JSON.stringify(fresh);
  const b = JSON.stringify(entries);
  if (a !== b) add("corpus-stale", "reference/canvas-accessible-labels.json differs from the canvas source — run `npm run a11y:extract` and review the diff");
  corpusCheck = a === b ? "fresh" : "STALE";
}

/* 2 · the generated module against the corpus */
const modPath = join(ROOT, GENERATED_MODULE);
const modText = existsSync(modPath) ? readFileSync(modPath, "utf8") : "";
if (modText !== renderGeneratedModule(entries)) {
  add("module-stale", `${GENERATED_MODULE} disagrees with the corpus — run \`npm run a11y:extract\``);
}

/* 3 + 4 · the source scan */
const byScreen = new Map();
for (const e of entries) {
  if (!byScreen.has(e.screen)) byScreen.set(e.screen, new Map());
  byScreen.get(e.screen).set(e.control, e);
}
const wired = new Set();
const files = walk(join(ROOT, "src"));
/** Comments out — a usage example in a doc comment is not a wiring. */
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

for (const file of files) {
  const text = stripComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file);

  for (const m of text.matchAll(/aria-label=(?:"([^"]+)"|\{\s*"([^"]+)"\s*\})/g)) {
    const v = (m[1] ?? m[2]).trim();
    if (CONTROL_NAME_RE.test(v)) add("control-name-label", `${rel}: aria-label="${v}" is a canvas control name — put it on data-testid via a11y(...), and the caption on aria-label`);
  }

  const bound = [...text.matchAll(/a11yFor\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
  const calls = [
    ...[...text.matchAll(/canvasA11y\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)].map((m) => ({ screen: m[1], control: m[2] })),
    ...(bound.length === 1
      ? [...text.matchAll(/\ba11y\(\s*"([^"]+)"/g)].map((m) => ({ screen: bound[0], control: m[1] }))
      : []),
  ];
  // A control-name literal in a file bound to that screen is a deliberate reference too —
  // e.g. an `as const satisfies CanvasA11yControl<S>[]` list indexed by row (checkboxes 1..5).
  if (bound.length === 1 && byScreen.has(bound[0])) {
    for (const m of text.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/g)) {
      if (byScreen.get(bound[0]).has(m[1])) calls.push({ screen: bound[0], control: m[1] });
    }
  }
  if (bound.length > 1) add("unknown-control", `${rel}: binds a11yFor() to ${bound.length} screens — bind one per file so calls resolve unambiguously`);
  for (const c of calls) {
    const controls = byScreen.get(c.screen);
    if (!controls) { add("unknown-control", `${rel}: screen "${c.screen}" is not in the corpus`); continue; }
    if (!controls.has(c.control)) { add("unknown-control", `${rel}: "${c.control}" has no AccessibleLabel on "${c.screen}"`); continue; }
    wired.add(`${c.screen}::${c.control}`);
  }
}

/* 5 · coverage against the baseline */
const folders = screenFolders();
const inScope = entries.filter((e) => folders.has(e.screen) || e.scope === "component");
// A component both apps ship (cmp_Header) appears once per app in the corpus — one key here.
const unwired = [...new Set(
  inScope.filter((e) => !wired.has(`${e.screen}::${e.control}`)).map((e) => `${e.screen}::${e.control}`),
)];
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { entries: [] };
const base = new Map(baseline.entries.map((b) => [b.key, b]));
for (const b of baseline.entries) {
  if (!b.owner || !b.reason) add("baseline-invalid", `baseline entry ${b.key} needs an owner and a reason`);
}

if (args.has("--update-baseline")) {
  const next = unwired.sort().map((key) => base.get(key) ?? {
    key, owner: "a11y-wiring", reason: "no code-app control wired to this canvas control yet",
  });
  writeFileSync(BASELINE, JSON.stringify({
    $schema: "a11y-baseline/v1",
    note: "Owed G-A11Y wiring: canvas controls with an AccessibleLabel and no a11y(...) reference yet. A to-do list, not a permission — see docs/G-A11Y.md.",
    entries: next,
  }, null, 1) + "\n");
  console.log(`check-a11y: baseline rewritten — ${next.length} entries`);
  process.exit(0);
}

const unwiredSet = new Set(unwired);
for (const key of unwired) {
  if (!base.has(key)) add("unwired", `[NEW] ${key} — no code-app control is wired to it (a11y("${key.split("::")[1]}"))`);
  else if (args.has("--strict")) add("unwired", `[BASELINED] ${key}`);
}
for (const key of base.keys()) {
  if (!unwiredSet.has(key)) add("baseline-stale", `${key} is in the baseline but is now wired or no longer in the corpus — drop it with --update-baseline`);
}

/* the report */
const rows = [];
for (const [screen, controls] of [...byScreen.entries()].sort()) {
  const scope = folders.get(screen) ?? (screen.startsWith("cmp_") ? "src/components" : "(no feature)");
  const total = controls.size;
  const w = [...controls.keys()].filter((c) => wired.has(`${screen}::${c}`)).length;
  rows.push([screen, scope, total, w]);
}
console.log("G-A11Y — canvas AccessibleLabel → code-app aria-label (caption) + data-testid (canvas name)");
console.log(`  corpus  ${entries.length} controls, solution ${corpus.solutionVersion ?? "?"}; source check: ${corpusCheck}`);
console.log("  screen                                    controls  wired");
for (const [screen, , total, w] of rows) console.log(`  ${screen.padEnd(42)}${String(total).padStart(8)}${String(w).padStart(7)}`);
const wiredCount = rows.reduce((a, r) => a + r[3], 0);
const uniqueControls = rows.reduce((a, r) => a + r[2], 0);
console.log(`  total wired ${wiredCount} / ${uniqueControls} distinct controls (${entries.length} corpus entries; a component both apps ship counts once); baselined (owed) ${base.size}`);

if (findings.length) {
  for (const f of findings) console.log(`  [${f.kind}] ${f.msg}`);
  const fails = findings.length;
  console.log(`\nG-A11Y FAIL: ${fails} finding(s)`);
  process.exit(1);
}
console.log(`\nG-A11Y: 0 new — ${wiredCount} wired, ${base.size} baselined`);
