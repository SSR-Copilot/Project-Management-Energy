#!/usr/bin/env node
/**
 * Control-label gate — every interactive UI control carries an explicit `aria-label` (or
 * `aria-labelledby`) AND a `data-testid`.
 *
 * Why: Tosca identifies this app's controls by `AriaLabel` / `data-testid`
 * (`ProjectDocs/migration-plans/09-tosca-automation-conventions.md`). Implicit `<label>` wrapping is
 * invisible to its scanner, and an unlabelled control is only reachable by XPath/position,
 * which breaks on the next layout change. Testing Library's accessible-name computation DOES
 * walk implicit labels, so the unit suite cannot catch this — hence a static gate, enforced by
 * `src/test/controlLabels.test.ts` (part of `npx vitest run`).
 *
 * Interactive controls: native `button` / `input` / `select` / `textarea`, `a`/`NavLink` that
 * navigate or act, any lower-case element with an `onClick`, and the Fluent v9 / app primitives
 * in `CONTROLS`. Native and Fluent controls need the attributes themselves; the app primitives in
 * `PRIMITIVE_PROPS` render the control and set the attributes from the props listed there, so a
 * call site passes when it supplies those props. A JSX spread is trusted only when its name says
 * it carries the attributes (`a11y`, `attrs`, `testid`, `aria`).
 *
 * Reported:
 *   - missing   — the control lacks aria-label and/or data-testid (FAILS the gate);
 *   - duplicate — the same literal data-testid on two controls in one file (FAILS unless the two
 *                 are mutually exclusive branches; then add `control-labels-ignore` on one);
 *   - warning   — an aria-label computed from an expression that is not a string literal or a
 *                 caption constant/prop (convention rule 2: labels come from configuration, never
 *                 bound data). Printed with --warnings; review, they do not fail the gate.
 *
 * Exemption: `// control-labels-ignore: <reason>` (or `{/* control-labels-ignore: <reason> *\/}`)
 * on the element's line or up to two lines above it. The reason is printed in the report.
 *
 * Usage (from app/):  node scripts/check-control-labels.mjs [--warnings] [--json]
 *   exit 0 = clean; exit 1 = missing labels or duplicate test ids.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(APP, "package.json"))("typescript");

/** Interactive components by tag name. Lower-case = native HTML element. */
export const CONTROLS = new Set([
  "button", "input", "select", "textarea",
  "Button", "ToggleButton", "CompoundButton", "MenuButton", "SplitButton", "ToolbarButton",
  "ToolbarToggleButton", "Input", "Textarea", "Dropdown", "Combobox", "Checkbox", "Radio",
  "Switch", "Slider", "SpinButton", "Tab", "MenuItem", "MenuItemCheckbox", "MenuItemRadio",
  "DatePicker", "SearchBox",
  "CostField", "CostSelect", "Choices", "TextField", "TextAreaField", "NumericField",
  "PanelExtraButton", "TaggedDateField", "DateField", "DateInput", "ChoiceField",
]);

/**
 * App primitives: the props a call site must pass for the primitive to render `aria-label` and
 * `data-testid` (see `components/Fields.tsx`, `components/CanvasFields.tsx`).
 */
export const PRIMITIVE_PROPS = {
  CostField: { label: ["label", "name"], testid: ["name"] },
  Choices: { label: ["label", "name"], testid: ["name"] },
  CostSelect: { label: ["label"], testid: ["testId"] },
  TextField: { label: ["label"], testid: ["testId"] },
  TextAreaField: { label: ["label"], testid: ["testId"] },
  NumericField: { label: ["label"], testid: ["testId"] },
  PanelExtraButton: { label: ["label"], testid: ["testId"] },
  TaggedDateField: { label: ["name"], testid: ["name"] },
  DateField: { label: ["label", "name", "ariaLabel"], testid: ["name", "testId"] },
  DateInput: { label: ["name", "ariaLabel"], testid: ["name", "testId"] },
  ChoiceField: { label: ["label", "ariaLabel"], testid: ["testId"] },
};

const LINK_LIKE = new Set(["a", "NavLink", "Link"]);
const TRUSTED_SPREAD = /a11y|attrs|testid|aria/i;
const LABEL_ATTRS = ["aria-label", "aria-labelledby"];
const TESTID_ATTR = "data-testid";
const CAPTION_EXPR = /^[A-Z][A-Za-z0-9_]*(.[A-Za-z0-9_]+|[)|^(MSG|[A-Z_]*LABELS?|[A-Z_]*MSG|[A-Z_]*TEXT|[A-Z_]*CAPTIONS?|UI|DIALOG\w*|FIELD_\w+)\b|\b(label|caption|title|text|ariaLabel|confirmText|cancelText|saveLabel|cancelLabel|confirmLabel)\b/;

function walk(dir) {
  return fs.readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (n === "generated" || n === "node_modules") return [];
    return fs.statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function defaultFiles() {
  return walk(path.join(APP, "src")).filter((f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f));
}

function tagName(node) {
  const t = node.tagName;
  if (ts.isIdentifier(t)) return t.text;
  if (ts.isPropertyAccessExpression(t)) return t.name.text;
  return t.getText();
}

function attrsOf(node) {
  const named = new Map();
  const spreads = [];
  for (const p of node.attributes.properties) {
    if (ts.isJsxAttribute(p)) named.set(p.name.getText(), p);
    else if (ts.isJsxSpreadAttribute(p)) spreads.push(p.expression.getText());
  }
  return { named, spreads };
}

function ignoredReason(lines, line) {
  for (const l of [lines[line - 1], lines[line - 2], lines[line - 3]]) {
    const m = l && l.match(/control-labels-ignore:\s*(.+?)\s*(\*\/|$)/);
    if (m) return m[1];
  }
  return undefined;
}

export function scan(files = defaultFiles()) {
  const findings = [];
  const warnings = [];
  const ignored = [];
  const duplicates = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rel = path.relative(APP, file).split(path.sep).join("/");
    const seenIds = new Map();
    const visit = (n) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = tagName(n);
        const { named, spreads } = attrsOf(n);
        const hidden = tag === "input" && named.get("type")?.initializer?.getText() === '"hidden"';
        // A CostField with JSX children renders no control of its own: the child IS the control
        // and is checked itself (CostField only wraps it with the caption).
        const wrapsChild = tag === "CostField" && ts.isJsxOpeningElement(n) &&
          n.parent.children.some((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
        const interactive = !hidden && !wrapsChild && (
          CONTROLS.has(tag) ||
          (LINK_LIKE.has(tag) && (named.has("href") || named.has("to") || named.has("onClick"))) ||
          (named.has("onClick") && /^[a-z]/.test(tag)));
        if (interactive) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          const trusted = spreads.some((s) => TRUSTED_SPREAD.test(s));
          const prim = PRIMITIVE_PROPS[tag];
          const labelProps = prim ? prim.label : LABEL_ATTRS;
          const testidProps = prim ? prim.testid : [TESTID_ATTR];
          const missing = [];
          if (!trusted && !labelProps.some((a) => named.has(a))) missing.push(prim ? `aria-label (pass ${labelProps.join("/")})` : "aria-label");
          if (!trusted && !testidProps.some((a) => named.has(a))) missing.push(prim ? `data-testid (pass ${testidProps.join("/")})` : "data-testid");
          const why = ignoredReason(lines, line);
          if (missing.length) {
            if (why) ignored.push({ file: rel, line, tag, reason: why });
            else findings.push({ file: rel, line, tag, missing });
          }
          const tidAttr = named.get(prim ? prim.testid[0] : TESTID_ATTR)?.initializer;
          if (tidAttr && ts.isStringLiteral(tidAttr) && !why) {
            if (!seenIds.has(tidAttr.text)) seenIds.set(tidAttr.text, []);
            seenIds.get(tidAttr.text).push(line);
          }
          const init = named.get("aria-label")?.initializer;
          if (init && ts.isJsxExpression(init) && init.expression) {
            const e = init.expression;
            const literal = ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
            const exprText = e.getText(sf);
            if (!literal && !CAPTION_EXPR.test(exprText)) warnings.push({ file: rel, line, tag, ariaLabel: exprText });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    for (const [id, at] of seenIds) if (at.length > 1) duplicates.push({ file: rel, id, lines: at });
  }
  return { findings, warnings, ignored, duplicates };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = scan();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    for (const f of r.findings) console.log(`${f.file}:${f.line}  <${f.tag}>  missing ${f.missing.join(" + ")}`);
    for (const d of r.duplicates) console.log(`DUPLICATE ${d.file}  data-testid="${d.id}" on lines ${d.lines.join(", ")}`);
    if (process.argv.includes("--warnings")) {
      for (const w of r.warnings) console.log(`WARN ${w.file}:${w.line}  <${w.tag}>  aria-label={${w.ariaLabel}}`);
    }
    for (const i of r.ignored) console.log(`IGNORED ${i.file}:${i.line}  <${i.tag}>  ${i.reason}`);
    console.log(`\ncontrol-labels: ${r.findings.length} missing, ${r.duplicates.length} duplicate test ids, ${r.warnings.length} aria-label warnings, ${r.ignored.length} ignored`);
  }
  process.exit(r.findings.length || r.duplicates.length ? 1 : 0);
}
