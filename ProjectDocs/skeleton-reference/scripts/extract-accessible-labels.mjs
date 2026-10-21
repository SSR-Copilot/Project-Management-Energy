#!/usr/bin/env node
/**
 * extract-accessible-labels.mjs — build the canvas accessibility corpus for the G-A11Y gate.
 *
 *   node scripts/extract-accessible-labels.mjs [--src <dir>...] [--out <file>] [--quiet]
 *
 * WHAT IT READS
 *   The extracted canvas source (`*.pa.yaml` screens plus `Components/*.pa.yaml`) of the
 *   Project Management and Project Costs apps — by default the 1.21.753 export, extracted
 *   beside this package into `Existing Solution/VSBCloud_1.21.753/msapp/<app>/Src`. The package
 *   does not ship it; without it this script exits 2 and writes nothing.
 *   If an `AppCheckerResult.sarif` sits next to a `Src` folder it is read too, for the
 *   controls the canvas App Checker itself flags as `acc-AccessibleLabelNeeded`.
 *
 * WHAT IT WRITES — reference/canvas-accessible-labels.json
 *   One entry per canvas control that sets `AccessibleLabel`. The canvas renders that
 *   property as `aria-label` in the player DOM, which is what Tosca and screen readers key
 *   on. For every entry the corpus records:
 *
 *     control          the control's own canvas name
 *     controlType      e.g. `TextInput@0.0.54`
 *     accessibleLabel  the literal value, or the raw formula when it is not a literal
 *     kind             `control-name` — the value is a canvas control name (Tosca hook)
 *                      `text`         — the value is human text ("Reset", "Month")
 *                      `reference`    — `=<control>.Text`, resolved where it can be
 *                      `formula`      — anything else; caption left to the code app
 *     testId           the string the code app must render as `data-testid`: the
 *                      control's OWN canvas name. Not the AccessibleLabel value — copied
 *                      controls keep the original's value (`cmb_Supplier`,
 *                      `cmb_Supplier_3` and `cmb_Supplier_6` all carry `"cmb_Supplier"`,
 *                      two of them in one panel), so it is not an identity. The control name
 *                      is unique per screen; `accessibleLabel` keeps the canvas value so a
 *                      Tosca module recorded against the canvas can be mapped across.
 *     caption          the string the code app must render as `aria-label`: the human
 *                      caption, NEVER the control name (decision of 14 Oct 2026, recorded in
 *                      docs/G-A11Y.md). Derived, in order, from the control's own
 *                      Text/Label, the best-matching caption label among its siblings, its
 *                      placeholder, and finally a humanised control name.
 *     captionSource    where the caption came from, so a reviewer can go straight back.
 *
 * The YAML is read with a purpose-built indentation scanner — the same strict subset the
 * label extractor relies on (block mappings, `- name:` sequence items, `|`/`|-` block
 * scalars). The repo has no YAML dependency and this script does not add one.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_ROOT = resolve(REPO_ROOT, "../..");
const SOLUTION_DIR = "Existing Solution/VSBCloud_1.21.753/msapp";

const DEFAULT_SOURCES = [
  { app: "pm", dir: join(WORKSPACE_ROOT, SOLUTION_DIR, "projectmanagement/Src") },
  { app: "cost", dir: join(WORKSPACE_ROOT, SOLUTION_DIR, "projectcosts/Src") },
];

/** Prefixes the two canvas apps use for control names. Wider than the label extractor's,
 *  because AccessibleLabel values include `but_`, `circ_`, `rec_`, `ico_`. Brackets and `/`
 *  are legal in a canvas name — `txt_Revenue_BalancingPrice[EUR/MWh]` (Project Revenues). */
export const CONTROL_NAME_RE =
  /^(txt|drp|cmb|pcf|dte|dtp|date|lbl|btn|but|con|tgl|rad|chk|cbx|gal|img|icn|ico|icon|ibut|info|spi|tmr|cmp|shp|htm|slr|frm|circ|rec|psf|tab)_[A-Za-z0-9_[\]/]+$/i;

const CAPTION_CONTROL_RE = /^(Text|Label|ModernText|Classic\/Label)@/;
const NOT_A_CAPTION_NAME_RE = /(ErrorMessage|Asterisk|Requered|Required|_Message_|Tooltip|ToolTip)/i;

/* ───────────────────────────────────────────────────────────── argument parsing ── */

function parseArgs(argv) {
  const out = { sources: [], outFile: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--src") out.sources.push(argv[(i += 1)]);
    else if (a === "--out") out.outFile = argv[(i += 1)];
    else if (a === "--quiet") out.quiet = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────── the YAML scan ── */

function unquote(raw) {
  const s = raw.trim();
  if (s.startsWith("'")) return s.slice(1, s.endsWith("'") ? -1 : undefined).replace(/''/g, "'");
  if (s.startsWith('"')) {
    const body = s.slice(1, s.endsWith('"') && s.length > 1 ? -1 : undefined);
    return body.replace(/\\(.)/g, (_m, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
  }
  return s;
}

/**
 * Parse one `.pa.yaml` into a flat list of controls with parent links.
 * Returns `{ roots: [{ kind, name }], controls: Map<name, node> }` per screen/component.
 */
export function parseCanvasYaml(text) {
  const lines = text.split(/\r?\n/);
  const stack = []; // { key, indent, seq, node? }
  const screens = [];
  let current = null; // { kind, name, controls: [] }

  const nearestControl = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].node) return stack[i].node;
    return null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    // `[`/`]` too: a control named `txt_Revenue_BalancingPrice[EUR/MWh]` must open its own
    // node, or its properties are filed under the previous control (found 14 Oct 2026).
    const m = /^(\s*)(-\s+)?([A-Za-z_][A-Za-z0-9_ .'@\-/[\]]*?):(\s|$)(.*)$/.exec(raw);
    if (!m) continue;
    const indent = m[1].length + (m[2] ? m[2].length : 0);
    const isSeq = Boolean(m[2]);
    const key = m[3].trim().replace(/^'(.*)'$/, "$1");
    let value = m[5] ?? "";
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    if (/^[|>][-+]?\d*\s*$/.test(value.trim())) {
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const l = lines[j];
        if (!l.trim()) { body.push(""); continue; }
        if (l.length - l.trimStart().length <= indent) break;
        body.push(l.trim() === "" ? "" : l);
      }
      i = j - 1;
      value = body.join("\n");
    } else {
      value = value.trim();
      if (value.startsWith('"') || value.startsWith("'")) value = unquote(value);
    }

    // Screen / component roots sit at depth 1 under `Screens:` / `ComponentDefinitions:`.
    if (stack.length === 1 && (stack[0].key === "Screens" || stack[0].key === "ComponentDefinitions") && !isSeq) {
      current = { kind: stack[0].key === "Screens" ? "screen" : "component", name: key, controls: [] };
      screens.push(current);
      const node = { name: key, type: current.kind === "screen" ? "Screen" : "Component", parent: null, props: {}, children: [] };
      current.controls.push(node);
      stack.push({ key, indent, seq: false, node });
      continue;
    }

    if (isSeq && current && stack.length && stack[stack.length - 1].key === "Children") {
      const parent = nearestControl();
      const node = { name: key, type: null, parent: parent ? parent.name : null, props: {}, children: [] };
      if (parent) parent.children.push(node.name);
      current.controls.push(node);
      stack.push({ key, indent, seq: true, node });
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && top.key === "Properties") {
      const owner = nearestControl();
      if (owner) owner.props[key] = value;
      continue;
    }
    if (top && top.node && (key === "Control" || key === "Variant" || key === "ComponentName")) {
      top.node[key === "Control" ? "type" : key === "Variant" ? "variant" : "componentName"] = value;
      continue;
    }
    if (value === "" || value === undefined) stack.push({ key, indent, seq: isSeq });
  }
  return screens;
}

/* ─────────────────────────────────────────────────────────── Power Fx helpers ── */

/** `="Foo"` → `Foo`; anything that is not one bare string literal → null. */
export function literalOf(formula) {
  if (formula === undefined || formula === null) return null;
  const s = String(formula).trim().replace(/^=/, "").trim();
  const m = /^"((?:[^"]|"")*)"$/.exec(s);
  return m ? m[1].replace(/""/g, '"') : null;
}

/** `Number Of Generators` from `txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator`. */
export function humaniseControlName(name) {
  const parts = name.split("_").filter((p) => p && !/^\d+$/.test(p));
  let last = parts[parts.length - 1] ?? name;
  if (parts.length > 1 && /^(Value|Fields?|Content|Input)$/i.test(last)) last = parts[parts.length - 2];
  return last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

const tokensOf = (name) =>
  name.split(/_|(?=[A-Z][a-z])/).map((t) => t.toLowerCase()).filter((t) => t && !/^\d+$/.test(t));

/** Similarity of two control names by shared trailing tokens — the canvas pairs
 *  `txt_X_Fields_NumberOfGenerator_1` with `lbl_X_Fields_NumberOfGenerator_1`. */
function nameAffinity(a, b) {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  let score = 0;
  for (let i = 1; i <= Math.min(ta.length, tb.length); i += 1) {
    if (ta[ta.length - i] === tb[tb.length - i]) score += 1;
    else break;
  }
  const sa = new Set(ta);
  const shared = tb.filter((t) => sa.has(t)).length;
  const suffixA = /_(\d+)$/.exec(a)?.[1] ?? "";
  const suffixB = /_(\d+)$/.exec(b)?.[1] ?? "";
  return score * 10 + shared + (suffixA === suffixB ? 3 : 0);
}

function captionFor(node, byName) {
  for (const p of ["Text", "Label"]) {
    const lit = literalOf(node.props[p]);
    if (lit && lit.trim() && lit.trim() !== "*" && !CONTROL_NAME_RE.test(lit.trim())) {
      return { caption: lit.trim(), source: `${node.name}.${p}` };
    }
  }
  const tryLevel = (parentName) => {
    const parent = byName.get(parentName);
    if (!parent) return null;
    let best = null;
    for (const sib of parent.children) {
      if (sib === node.name) continue;
      const s = byName.get(sib);
      if (!s || !CAPTION_CONTROL_RE.test(s.type ?? "") || NOT_A_CAPTION_NAME_RE.test(s.name)) continue;
      const lit = literalOf(s.props.Text);
      if (!lit || !lit.trim() || lit.trim() === "*") continue;
      const score = nameAffinity(node.name, s.name);
      if (!best || score > best.score) best = { caption: lit.trim(), source: `${s.name}.Text`, score };
    }
    return best;
  };
  const own = node.parent ? tryLevel(node.parent) : null;
  if (own) return { caption: own.caption, source: own.source };
  const grand = node.parent ? byName.get(node.parent)?.parent : null;
  const up = grand ? tryLevel(grand) : null;
  if (up) return { caption: up.caption, source: up.source };
  // Screen-wide: the canvas often keeps the caption label in a sibling container
  // (`con_…_Cluster3` holds `lbl_…_Cluster3` while the picker sits one level over). Only a
  // strong name match counts: at least two trailing name tokens in common.
  let wide = null;
  for (const s of byName.values()) {
    if (s.name === node.name || !CAPTION_CONTROL_RE.test(s.type ?? "") || NOT_A_CAPTION_NAME_RE.test(s.name)) continue;
    const lit = literalOf(s.props.Text);
    if (!lit || !lit.trim() || lit.trim() === "*") continue;
    const score = nameAffinity(node.name, s.name);
    if (score >= 20 && (!wide || score > wide.score)) wide = { caption: lit.trim(), source: `${s.name}.Text`, score };
  }
  if (wide) return { caption: wide.caption, source: wide.source };
  // A date picker's placeholder is the generic "Select a date..." — never a caption.
  const placeholders = /DatePicker/.test(node.type ?? "") ? ["HintText", "Tooltip"] : ["Placeholder", "HintText", "PlaceholderText", "Tooltip"];
  for (const p of placeholders) {
    const lit = literalOf(node.props[p]);
    if (lit && lit.trim() && lit !== "ToolTip") return { caption: lit.trim(), source: `${node.name}.${p}` };
  }
  return { caption: humaniseControlName(node.name), source: "derived-from-name" };
}

/* ─────────────────────────────────────────────────────────────────── extraction ── */

function yamlFilesOf(dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "Components") files.push(...yamlFilesOf(p));
      continue;
    }
    if (name.endsWith(".pa.yaml") && name !== "_EditorState.pa.yaml") files.push(p);
  }
  return files;
}

function checkerMissing(srcDir) {
  const sarif = join(dirname(srcDir), "AppCheckerResult.sarif");
  if (!existsSync(sarif)) return null;
  const d = JSON.parse(readFileSync(sarif, "utf8").replace(/^\uFEFF/, ""));
  const out = {};
  for (const run of d.runs ?? []) {
    for (const r of run.results ?? []) {
      if (r.ruleId !== "acc-AccessibleLabelNeeded") continue;
      const loc = r.locations?.[0]?.logicalLocations?.[0]?.fullyQualifiedName
        ?? r.locations?.[0]?.logicalLocations?.[0]?.name ?? "";
      const [screen, control] = String(loc).split(".");
      if (!screen) continue;
      (out[screen] ??= new Set()).add(control ?? screen);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

export function extract(sources) {
  const entries = [];
  const missingSources = [];
  const filesRead = [];
  const canvasCheckerMissing = {};
  for (const src of sources) {
    if (!existsSync(src.dir)) { missingSources.push(src); continue; }
    const miss = checkerMissing(src.dir);
    if (miss) canvasCheckerMissing[src.app] = miss;
    for (const file of yamlFilesOf(src.dir)) {
      filesRead.push(relative(WORKSPACE_ROOT, file));
      for (const scr of parseCanvasYaml(readFileSync(file, "utf8"))) {
        const byName = new Map(scr.controls.map((c) => [c.name, c]));
        for (const node of scr.controls) {
          if (!("AccessibleLabel" in node.props)) continue;
          const rawValue = String(node.props.AccessibleLabel);
          const lit = literalOf(rawValue);
          let kind;
          let caption;
          let captionSource;
          if (lit !== null) {
            // A control name by prefix, or ANY control's name on this screen (`Icon5`, `Drp_…`).
            if (CONTROL_NAME_RE.test(lit.trim()) || byName.has(lit.trim())) {
              kind = "control-name";
              ({ caption, source: captionSource } = captionFor(node, byName));
            } else if (lit.trim() === "") {
              kind = "text";
              ({ caption, source: captionSource } = captionFor(node, byName));
            } else {
              kind = "text";
              caption = lit.trim();
              captionSource = `${node.name}.AccessibleLabel`;
            }
          } else {
            const ref = /^=\s*([A-Za-z_][A-Za-z0-9_]*)\.Text\s*$/.exec(rawValue.trim());
            if (ref) {
              kind = "reference";
              const target = byName.get(ref[1]);
              const t = target ? literalOf(target.props.Text) : null;
              caption = t ?? null;
              captionSource = t ? `${ref[1]}.Text` : `${ref[1]}.Text (dynamic)`;
            } else {
              kind = "formula";
              caption = null;
              captionSource = "formula — caption owed by the code app";
            }
          }
          entries.push({
            app: src.app,
            screen: scr.name,
            scope: scr.kind,
            control: node.name,
            controlType: node.type ?? (node.componentName ? `component:${node.componentName}` : null),
            accessibleLabel: lit !== null ? lit : rawValue.replace(/^=/, "").trim(),
            kind,
            testId: node.name,
            caption,
            captionSource,
          });
        }
      }
    }
  }
  return { entries, missingSources, filesRead, canvasCheckerMissing };
}

/**
 * The app-side module: `src/a11y/canvasA11y.generated.ts`, one `[testId, caption]` pair per
 * canvas control, keyed by screen then control. `as const`, so `canvasA11y(screen, control)`
 * rejects an invented control name at COMPILE time — G-TYPE enforces it before G-A11Y runs.
 * Deterministic (sorted) so the gate can regenerate and compare byte for byte.
 */
export function renderGeneratedModule(entries) {
  const byScreen = new Map();
  for (const e of entries) {
    if (!byScreen.has(e.screen)) byScreen.set(e.screen, new Map());
    // A control name is unique within a canvas screen; first wins if a component repeats one.
    if (!byScreen.get(e.screen).has(e.control)) byScreen.get(e.screen).set(e.control, e);
  }
  const q = (v) => JSON.stringify(v);
  const lines = [
    "/* GENERATED by scripts/extract-accessible-labels.mjs from the canvas 1.21.753 source.",
    " * Do not edit — re-run `npm run a11y:extract`. G-A11Y fails when this file and",
    " * reference/canvas-accessible-labels.json disagree.",
    " *",
    " * [testId, caption]: render testId as `data-testid` and caption as `aria-label`.",
    " * caption is null where the canvas AccessibleLabel is a formula — the caller supplies it. */",
    "export const CANVAS_A11Y = {",
  ];
  for (const screen of [...byScreen.keys()].sort()) {
    lines.push(`  ${q(screen)}: {`);
    const controls = byScreen.get(screen);
    for (const control of [...controls.keys()].sort()) {
      const e = controls.get(control);
      lines.push(`    ${q(control)}: [${q(e.testId)}, ${q(e.caption)}],`);
    }
    lines.push("  },");
  }
  lines.push("} as const;", "");
  return lines.join("\n");
}

export const GENERATED_MODULE = "src/a11y/canvasA11y.generated.ts";

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = args.sources.length
    ? args.sources.map((d) => {
        const dir = resolve(d);
        const app = /cost/i.test(dir) ? "cost" : "pm";
        return { app, dir };
      })
    : DEFAULT_SOURCES;
  const outFile = resolve(args.outFile ?? join(REPO_ROOT, "reference/canvas-accessible-labels.json"));
  const { entries, missingSources, filesRead, canvasCheckerMissing } = extract(sources);
  // The package does not ship the unpacked canvas source; never overwrite the committed corpus
  // (and the generated module) from a partial read.
  if (missingSources.length) {
    console.error(
      `extract-accessible-labels: canvas source not found — ${missingSources.map((s) => relative(WORKSPACE_ROOT, s.dir)).join(", ")}\n` +
        "  The unpacked 1.21.753 source is not part of the package. Extract the two .msapp files of\n" +
        "  VSBCloud_managed (2).zip into Existing Solution/VSBCloud_1.21.753/msapp/<app>/ (or pass --src).\n" +
        "  Nothing was written.",
    );
    process.exit(2);
  }
  if (entries.length === 0) {
    console.error("extract-accessible-labels: no AccessibleLabel found — check --src");
    process.exit(2);
  }
  const byKind = {};
  const byScreen = {};
  for (const e of entries) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    byScreen[e.screen] = (byScreen[e.screen] ?? 0) + 1;
  }
  const out = {
    $schema: "canvas-accessible-labels/v1",
    generatedBy: "scripts/extract-accessible-labels.mjs",
    solutionVersion: "1.21.753",
    decision:
      "aria-label = caption (human text); data-testid = testId (the control's own canvas name). See docs/G-A11Y.md.",
    sources: sources.map((s) => ({ app: s.app, dir: relative(WORKSPACE_ROOT, s.dir) })),
    missingSources: missingSources.map((s) => ({ app: s.app, dir: relative(WORKSPACE_ROOT, s.dir) })),
    counts: {
      entries: entries.length,
      byApp: entries.reduce((a, e) => ({ ...a, [e.app]: (a[e.app] ?? 0) + 1 }), {}),
      byKind,
      byScreen,
      canvasCheckerAccessibleLabelNeeded: Object.fromEntries(
        Object.entries(canvasCheckerMissing).map(([app, m]) => [
          app,
          Object.values(m).reduce((a, v) => a + v.length, 0),
        ]),
      ),
    },
    files: filesRead,
    entries,
    canvasCheckerMissing,
  };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");
  if (!args.outFile) {
    const mod = join(REPO_ROOT, GENERATED_MODULE);
    mkdirSync(dirname(mod), { recursive: true });
    writeFileSync(mod, renderGeneratedModule(entries));
  }
  if (!args.quiet) {
    console.log(
      `extract-accessible-labels: ${entries.length} AccessibleLabel entries ` +
        `(${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(", ")}) → ${relative(REPO_ROOT, outFile)}`,
    );
    if (missingSources.length) console.log(`  missing sources: ${missingSources.map((s) => s.dir).join(", ")}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
