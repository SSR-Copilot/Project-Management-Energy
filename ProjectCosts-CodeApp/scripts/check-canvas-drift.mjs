#!/usr/bin/env node
/**
 * Canvas drift report (GD-004) — what changed between the canvas source the identity gate reads
 * (`ProjectDocs/_extracted/msapp/<app>/Src`, solution 1.21.709) and a newer copy of the same app, for instance a
 * freshly downloaded and unpacked live app.
 *
 * `check-canvas-identities.mjs` only knows the on-disk copy, so a control renamed or relabelled since then is invisible
 * to it. This tool compares two trees file by file (every screen and `Components/` file) and reports:
 *   (a) control names added or removed          -> identity drift, FAILS (exit 1);
 *   (b) a changed literal `AccessibleLabel`     -> identity drift, FAILS (exit 1);
 *   (c) a changed control type or version (`ModernTextInput@1.1.1` -> `@1.1.2`) -> reported, fails only with `--strict`;
 *   (d) a changed live formula in a watched property (`DisplayMode`, `Visible`, `Items`, `OnSelect`, `OnChange`,
 *       `Default`, `Text`) -> reported, fails only with `--strict`.
 * Formulas are compared as live formulas: comments removed and whitespace collapsed, so a re-indent or a comment edit is
 * not drift (a whitespace run inside a string literal is collapsed too; that cannot hide a real change in a caption).
 *
 * Usage (from app/): node scripts/check-canvas-drift.mjs <liveDir> [--base <dir>] [--app <name>] [--json] [--strict]
 *   <liveDir>  the newer copy. It may be the `Src` folder itself, a folder holding `Src`, or one holding `src/Src`.
 *              There is NO default and no private path is ever read: pass it explicitly. A folder that does not exist
 *              prints a SKIPPED line and exits 0, so a run without a download is a visible skip, never a silent pass.
 *   --base     the older copy (default `ProjectDocs/_extracted/msapp/<app>/Src`; same three layouts).
 *   --app      `projectmanagement` (default) or `projectcosts`; only picks the default `--base`.
 * Exit: 1 on (a)/(b) (and on (c)/(d) with `--strict`), 2 on a usage error, else 0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePaYaml, scanFx } from "./lib/paYaml.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WATCHED_PROPERTIES = ["DisplayMode", "Visible", "Items", "OnSelect", "OnChange", "Default", "Text"];

/** `<dir>`, `<dir>/Src` or `<dir>/src/Src`, whichever holds `.pa.yaml` files; null when none does. */
export function resolveSrcDir(dir) {
  for (const cand of [dir, path.join(dir, "Src"), path.join(dir, "src", "Src")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isDirectory() && fs.readdirSync(cand).some((f) => f.endsWith(".pa.yaml"))) return cand;
  }
  return null;
}

/** Every screen and component file of a `Src` folder: `Map<"Screen" | "Components/x", absolute path>`. */
function listFiles(src) {
  const out = new Map();
  const add = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".pa.yaml") || f === "_EditorState.pa.yaml") continue;
      out.set(`${prefix}${f.replace(/\.pa\.yaml$/, "")}`, path.join(dir, f));
    }
  };
  add(src, "");
  add(path.join(src, "Components"), "Components/");
  return out;
}

/**
 * A property value as a comparable live formula: comments removed, string literals kept exactly, and in the code between
 * them every whitespace run collapsed to one space and dropped next to a symbol, so `If(
 a,
 b
)` equals `If(a, b)`.
 */
export function normalFormula(raw) {
  if (raw === undefined || raw === null) return "";
  const squeeze = (code) => code.replace(/\s+/g, " ").replace(/ ?([^\w ]) ?/g, "$1");
  let out = "";
  let run = ""; // the code between two string literals, comments removed, so a comment cannot split a whitespace run
  for (const t of scanFx(String(raw).replace(/^\s*=/, ""))) {
    if (t.kind === "string") { out += squeeze(run) + t.text; run = ""; } else if (t.kind === "code") run += t.text;
  }
  return (out + squeeze(run)).trim();
}

const normal = normalFormula;
const versionOf = (type) => (type.includes("@") ? type.slice(type.indexOf("@") + 1) : "");
const headOf = (type) => (type.includes("@") ? type.slice(0, type.indexOf("@")) : type);

/** name -> { type, label, props }; a later control of the same name replaces an earlier one, as the gate's index does. */
function indexFile(file) {
  const out = new Map();
  for (const c of parsePaYaml(fs.readFileSync(file, "utf8")).controls) {
    const props = {};
    for (const k of WATCHED_PROPERTIES) if (c.props[k]) props[k] = normal(c.props[k].value);
    out.set(c.name, { type: c.type, label: c.props.AccessibleLabel ? normal(c.props.AccessibleLabel.value) : null, props });
  }
  return out;
}

/**
 * Compares two `Src` folders. Returns the findings per category, each `{ file, control, ... }`.
 * `filesAdded` / `filesRemoved` list whole screens or components that exist on one side only (their controls are also
 * reported under `controlsAdded` / `controlsRemoved`).
 */
export function compareCanvasTrees(baseSrc, liveSrc) {
  const base = listFiles(baseSrc);
  const live = listFiles(liveSrc);
  const r = {
    filesAdded: [], filesRemoved: [], controlsAdded: [], controlsRemoved: [],
    labelChanges: [], versionChanges: [], typeChanges: [], formulaChanges: [],
  };
  for (const f of live.keys()) if (!base.has(f)) r.filesAdded.push(f);
  for (const f of base.keys()) if (!live.has(f)) r.filesRemoved.push(f);
  for (const f of new Set([...base.keys(), ...live.keys()])) {
    const a = base.has(f) ? indexFile(base.get(f)) : new Map();
    const b = live.has(f) ? indexFile(live.get(f)) : new Map();
    for (const [name, c] of b) if (!a.has(name)) r.controlsAdded.push({ file: f, control: name, type: c.type });
    for (const [name, c] of a) if (!b.has(name)) r.controlsRemoved.push({ file: f, control: name, type: c.type });
    for (const [name, ca] of a) {
      const cb = b.get(name);
      if (!cb) continue;
      if (ca.label !== cb.label) r.labelChanges.push({ file: f, control: name, from: ca.label, to: cb.label });
      if (ca.type !== cb.type) {
        const entry = { file: f, control: name, from: ca.type, to: cb.type };
        (headOf(ca.type) === headOf(cb.type) && versionOf(ca.type) !== versionOf(cb.type) ? r.versionChanges : r.typeChanges).push(entry);
      }
      for (const k of WATCHED_PROPERTIES) {
        if ((ca.props[k] ?? "") !== (cb.props[k] ?? "")) {
          r.formulaChanges.push({ file: f, control: name, property: k, from: ca.props[k] ?? null, to: cb.props[k] ?? null });
        }
      }
    }
  }
  return r;
}

/** Identity drift always fails; type/version and formula drift only with `strict`. */
export function driftFails(report, { strict = false } = {}) {
  const identity = report.controlsAdded.length + report.controlsRemoved.length + report.labelChanges.length;
  const soft = report.versionChanges.length + report.typeChanges.length + report.formulaChanges.length;
  return identity > 0 || (strict && soft > 0);
}

const clip = (s, n = 90) => (s === null ? "(none)" : s.length > n ? `${s.slice(0, n)}...` : s);

function printReport(report, { strict, log }) {
  const section = (title, rows, line) => {
    log(`\n${title}: ${rows.length}`);
    for (const row of rows.slice(0, 40)) log(`  ${line(row)}`);
    if (rows.length > 40) log(`  ... and ${rows.length - 40} more (use --json for the full list)`);
  };
  log("Canvas drift (identity changes fail; type/version and formula changes are reported" + (strict ? " and fail under --strict)" : ")"));
  section("Files only in the live copy", report.filesAdded, (f) => f);
  section("Files only in the base copy", report.filesRemoved, (f) => f);
  section("(a) Controls added", report.controlsAdded, (c) => `${c.file}: ${c.control} (${c.type})`);
  section("(a) Controls removed", report.controlsRemoved, (c) => `${c.file}: ${c.control} (${c.type})`);
  section("(b) AccessibleLabel changed", report.labelChanges, (c) => `${c.file}: ${c.control}: ${clip(c.from)} -> ${clip(c.to)}`);
  section("(c) Control version changed", report.versionChanges, (c) => `${c.file}: ${c.control}: ${c.from} -> ${c.to}`);
  section("(c) Control type changed", report.typeChanges, (c) => `${c.file}: ${c.control}: ${c.from} -> ${c.to}`);
  section("(d) Watched formula changed", report.formulaChanges, (c) => `${c.file}: ${c.control}.${c.property}: ${clip(c.from)} -> ${clip(c.to)}`);
}

/** The CLI, as a function so a test can run it without a child process. Returns the exit code. */
export function main(argv, { log = console.log, err = console.error } = {}) {
  const valueOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--base", "--app"].includes(argv[i - 1])));
  const liveArg = positional[0];
  if (!liveArg) {
    err("usage: node scripts/check-canvas-drift.mjs <liveDir> [--base <dir>] [--app projectmanagement|projectcosts] [--json] [--strict]");
    return 2;
  }
  const app = valueOf("--app") ?? "projectmanagement";
  const baseArg = valueOf("--base") ?? path.resolve(APP, "../ProjectDocs/_extracted/msapp", app);
  const liveSrc = fs.existsSync(liveArg) ? resolveSrcDir(path.resolve(liveArg)) : null;
  if (!liveSrc) { log(`SKIPPED: no canvas source (.pa.yaml files) at "${liveArg}"; nothing was compared.`); return 0; }
  const baseSrc = fs.existsSync(baseArg) ? resolveSrcDir(path.resolve(baseArg)) : null;
  if (!baseSrc) { log(`SKIPPED: no base canvas source at "${baseArg}"; nothing was compared.`); return 0; }
  const report = compareCanvasTrees(baseSrc, liveSrc);
  const strict = argv.includes("--strict");
  if (argv.includes("--json")) log(JSON.stringify(report, null, 2)); else printReport(report, { strict, log });
  return driftFails(report, { strict }) ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
