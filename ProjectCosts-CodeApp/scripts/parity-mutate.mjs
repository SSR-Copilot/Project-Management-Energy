#!/usr/bin/env node
/**
 * The mutation proof (D80, plan section 5): known source edits a parity run must report, for ANY screen.
 *
 * Usage (from ProjectCosts-CodeApp/):
 *   node scripts/parity-mutate.mjs apply  --screen <slug>          apply e2e/screens/<slug>/mutations.json
 *                                          [--dry-run]               run every check, write nothing
 *   node scripts/parity-mutate.mjs revert [--screen <slug>]        restore every file byte for byte, then forget the state
 *   node scripts/parity-mutate.mjs status [--screen <slug>]        what is applied now (exit 0 either way)
 *   node scripts/parity-mutate.mjs check  --screen <slug> <runDir> [--baseline <runDir>]
 *        reads <runDir>/summary.json: each mutation must have a "new" difference whose key matches its `expectKey`
 *        (with --baseline, a key that was already "new" in the baseline run does not count). Exit 1 when one is missed.
 *   `--screen` defaults to $PARITY_SCREEN.
 *
 * `mutations.json` is an array of `{ id, layer, file, find, replace, expectKey }` (the shape of `ScreenManifest.mutations`
 * in `e2e/harness/contract.ts`; a manifest reads the same file). `file` is relative to ProjectCosts-CodeApp/, `find` must
 * occur EXACTLY once in it, `expectKey` is a RegExp source matched against the summary's difference keys.
 *
 * Safety:
 *   - apply refuses when a target file has uncommitted changes (`git status --porcelain -- <file>`), when a find is missing
 *     or found twice, or when any mutation set is already applied: nothing is written then;
 *   - the originals (base64) and their sha256 are saved in `e2e/parity-out/.parity-mutations.json` (git-ignored) BEFORE
 *     the first file is written, so a revert is always possible;
 *   - revert writes the original bytes back and checks their sha256; a file changed since apply (neither the original nor
 *     the mutated hash) is refused and the state is kept.
 * Tested in `src/test/parityMutate.test.ts` (UT-PMUT-*) on temporary folders (`root`, `isDirty` injected).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STATE_FILE = "e2e/parity-out/.parity-mutations.json";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function count(text, find) {
  if (!find) return 0;
  let n = 0;
  for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + find.length)) n++;
  return n;
}

/** `git status --porcelain -- <file>` is not empty (modified, staged, untracked or deleted). */
export function gitDirty(root, rel) {
  const out = execFileSync("git", ["status", "--porcelain", "--", rel], { cwd: root, encoding: "utf8" });
  return out.trim() !== "";
}

const statePath = (root) => path.join(root, STATE_FILE);

export function readState(root = APP) {
  const p = statePath(root);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

/** The screen's mutation list, validated for shape. */
export function loadMutations(screen, root = APP) {
  if (!screen) throw new Error("no screen: pass --screen <slug> or set PARITY_SCREEN");
  const file = path.join(root, "e2e/screens", screen, "mutations.json");
  if (!fs.existsSync(file)) throw new Error(`no mutation set: ${path.relative(root, file)}`);
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(list) || !list.length) throw new Error(`${path.relative(root, file)}: expected a non-empty array`);
  const ids = new Set();
  for (const [k, m] of list.entries()) {
    for (const f of ["id", "layer", "file", "find", "replace", "expectKey"]) {
      if (typeof m?.[f] !== "string" || (f !== "replace" && !m[f])) throw new Error(`mutation #${k + 1}: "${f}" must be a non-empty string`);
    }
    if (ids.has(m.id)) throw new Error(`mutation id "${m.id}" is listed twice`);
    ids.add(m.id);
    if (m.find === m.replace) throw new Error(`mutation "${m.id}": replace equals find`);
    new RegExp(m.expectKey); // throws on a bad pattern
  }
  return list;
}

/**
 * Applies a screen's mutation set. All checks run before any write; on a refusal nothing changes.
 * Returns `{ applied: [{ id, file }] }`; throws `Error` with every problem listed.
 */
export function apply({ screen, root = APP, isDirty = (rel) => gitDirty(root, rel), now = () => new Date().toISOString(), dryRun = false }) {
  const current = readState(root);
  if (current) throw new Error(`a mutation set is already applied (${current.screen}, ${current.mutations.length} edits, ${current.appliedAt}); run revert first`);
  const list = loadMutations(screen, root);
  const problems = [];
  const files = new Map(); // rel -> { original: Buffer, text: string }
  for (const m of list) {
    const rel = m.file.split(path.sep).join("/");
    const abs = path.join(root, rel);
    if (!files.has(rel)) {
      if (!fs.existsSync(abs)) { problems.push(`${m.id}: ${rel} does not exist`); continue; }
      let dirty;
      try { dirty = isDirty(rel); } catch (e) { problems.push(`${m.id}: cannot check git status of ${rel} (${e?.message ?? e})`); continue; }
      if (dirty) { problems.push(`${m.id}: ${rel} has uncommitted changes; commit or stash them first`); continue; }
      const original = fs.readFileSync(abs);
      files.set(rel, { original, text: original.toString("utf8") });
    }
    const f = files.get(rel);
    const n = count(f.text, m.find);
    if (n !== 1) { problems.push(`${m.id}: the find text occurs ${n} times in ${rel} (must be exactly once): ${JSON.stringify(m.find)}`); continue; }
    f.text = f.text.replace(m.find, () => m.replace);
  }
  if (problems.length) throw new Error(`refused, nothing changed:\n  ${problems.join("\n  ")}`);
  if (dryRun) return { applied: [], planned: list.map((m) => ({ id: m.id, file: m.file })) };
  const state = {
    screen, appliedAt: now(),
    mutations: list.map((m) => ({ id: m.id, layer: m.layer, file: m.file, expectKey: m.expectKey })),
    files: [...files.entries()].map(([rel, f]) => {
      const mutated = Buffer.from(f.text, "utf8");
      return { file: rel, originalSha256: sha256(f.original), mutatedSha256: sha256(mutated), original: f.original.toString("base64") };
    }),
  };
  fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
  fs.writeFileSync(statePath(root), JSON.stringify(state, null, 2));
  for (const [rel, f] of files) fs.writeFileSync(path.join(root, rel), Buffer.from(f.text, "utf8"));
  return { applied: list.map((m) => ({ id: m.id, file: m.file })) };
}

/** Restores every mutated file byte for byte and deletes the state. Returns `{ restored, screen }`; `restored: []` when none was applied. */
export function revert({ root = APP, screen } = {}) {
  const state = readState(root);
  if (!state) return { restored: [], screen: null };
  if (screen && state.screen !== screen) throw new Error(`the applied set is "${state.screen}", not "${screen}"`);
  const problems = [];
  const restored = [];
  for (const f of state.files) {
    const abs = path.join(root, f.file);
    const original = Buffer.from(f.original, "base64");
    if (sha256(original) !== f.originalSha256) { problems.push(`${f.file}: the saved original is corrupt (hash mismatch)`); continue; }
    const now = fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : null;
    if (now !== f.mutatedSha256 && now !== f.originalSha256) { problems.push(`${f.file}: changed since apply; restore it by hand from ${STATE_FILE}`); continue; }
    if (now !== f.originalSha256) fs.writeFileSync(abs, original);
    if (sha256(fs.readFileSync(abs)) !== f.originalSha256) { problems.push(`${f.file}: restored bytes do not match the original hash`); continue; }
    restored.push(f.file);
  }
  if (problems.length) throw new Error(`revert incomplete, state kept in ${STATE_FILE}:\n  ${problems.join("\n  ")}`);
  fs.rmSync(statePath(root));
  return { restored, screen: state.screen };
}

/** What is applied: `null`, or `{ screen, appliedAt, mutations, files: [{ file, state: "mutated" | "original" | "changed" }] }`. */
export function status({ root = APP } = {}) {
  const state = readState(root);
  if (!state) return null;
  return {
    screen: state.screen, appliedAt: state.appliedAt, mutations: state.mutations,
    files: state.files.map((f) => {
      const abs = path.join(root, f.file);
      const h = fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : null;
      return { file: f.file, state: h === f.mutatedSha256 ? "mutated" : h === f.originalSha256 ? "original" : "changed" };
    }),
  };
}

const newKeys = (summary) => (summary.diffs ?? []).filter((d) => d.cls === "new").map((d) => d.key);

/**
 * Per mutation: the run's "new" difference keys matching `expectKey` (minus keys already "new" in the baseline run).
 * Returns `{ results: [{ id, layer, found, keys }], missed, warnings }`.
 */
export function check({ screen, runDir, baselineDir, root = APP }) {
  const list = loadMutations(screen, root);
  const read = (dir) => {
    const f = path.join(path.resolve(root, dir), "summary.json");
    if (!fs.existsSync(f)) throw new Error(`no summary.json in ${dir}`);
    return JSON.parse(fs.readFileSync(f, "utf8"));
  };
  const summary = read(runDir);
  const warnings = [];
  if (summary.screen && summary.screen !== screen) warnings.push(`the run is for screen "${summary.screen}", not "${screen}"`);
  const state = readState(root);
  if (state && summary.startedAt && Date.parse(summary.startedAt) < Date.parse(state.appliedAt)) warnings.push(`the run started (${summary.startedAt}) before the mutations were applied (${state.appliedAt})`);
  const before = new Set(baselineDir ? newKeys(read(baselineDir)) : []);
  const keys = newKeys(summary).filter((k) => !before.has(k));
  const results = list.map((m) => {
    const re = new RegExp(m.expectKey);
    const hits = keys.filter((k) => re.test(k));
    return { id: m.id, layer: m.layer, found: hits.length > 0, keys: hits };
  });
  return { results, missed: results.filter((r) => !r.found).map((r) => r.id), warnings };
}

/* ─────────────────────────────────────────────────────────────── CLI ── */

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
  const explicitScreen = opt("--screen");
  const screen = explicitScreen ?? process.env.PARITY_SCREEN;
  const baselineDir = opt("--baseline");
  const [cmd, runDir] = argv;
  try {
    if (cmd === "apply" && argv.includes("--dry-run")) {
      const r = apply({ screen, dryRun: true });
      console.log(`dry run: all ${r.planned.length} mutations of ${screen} apply cleanly (nothing written)`);
    } else if (cmd === "apply") {
      const r = apply({ screen });
      console.log(`applied ${r.applied.length} mutations (${screen}):`);
      for (const a of r.applied) console.log(`  ${a.id.padEnd(16)} ${a.file}`);
      console.log("run the parity suite, then: node scripts/parity-mutate.mjs revert");
    } else if (cmd === "revert") {
      // Only an explicit --screen narrows a revert; PARITY_SCREEN never blocks restoring the sources.
      const r = revert({ screen: explicitScreen });
      console.log(r.screen ? `reverted ${r.screen}: ${r.restored.length} files restored byte for byte` : "nothing applied");
    } else if (cmd === "status") {
      const s = status();
      if (!s) console.log("mutations applied: none");
      else {
        console.log(`mutations applied: ${s.screen} (${s.mutations.length}, since ${s.appliedAt})`);
        for (const m of s.mutations) console.log(`  ${m.id.padEnd(16)} ${m.layer.padEnd(10)} ${m.file}`);
        for (const f of s.files) console.log(`  file ${f.state.padEnd(8)} ${f.file}`);
      }
    } else if (cmd === "check") {
      if (!runDir) throw new Error("usage: check --screen <slug> <runDir> [--baseline <runDir>]");
      const r = check({ screen, runDir, baselineDir });
      for (const w of r.warnings) console.log(`warning: ${w}`);
      for (const x of r.results) console.log(`  ${x.found ? "found " : "MISSED"} ${x.id.padEnd(16)} ${x.layer.padEnd(10)} ${x.keys.slice(0, 3).join(", ")}${x.keys.length > 3 ? ` (+${x.keys.length - 3})` : ""}`);
      console.log(`mutation proof: ${r.results.length - r.missed.length} of ${r.results.length} reported`);
      process.exit(r.missed.length ? 1 : 0);
    } else {
      console.error("usage: node scripts/parity-mutate.mjs apply|revert|status|check [--screen <slug>] [<runDir>] [--baseline <runDir>]");
      process.exit(2);
    }
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
