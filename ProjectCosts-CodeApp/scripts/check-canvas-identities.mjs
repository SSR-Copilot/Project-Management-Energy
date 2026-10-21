#!/usr/bin/env node
/**
 * Canvas-identity validator — checks each UI control's `data-testid` / `aria-label` against the
 * canvas control it claims to be, per feature module.
 *
 * `check-control-labels.mjs` proves every control HAS both attributes. This proves they are
 * RIGHT, against the canvas source (`ProjectDocs/_extracted/msapp/<app>/Src/<Screen>.pa.yaml` + `Components/`):
 *
 *   C1 unknown   — a canvas-style `data-testid` (`btn_…`, `txt_…`, …) that no control in the
 *                  feature's canvas screen (or the shared components) is named — a typo or an
 *                  invented name. Tosca would never find it.
 *   C2 foreign   — the name exists, but only on ANOTHER screen. Usually a copy-paste.
 *   C3 type      — the canvas control's type does not match the JSX control (a `Toggle` rendered
 *                  as a `Button`, a `TextInput` as a `Dropdown`, …).
 *   C4 label     — the canvas control sets a literal `AccessibleLabel` and the JSX `aria-label` is
 *                  a different literal. Canvas `AccessibleLabel` is what the canvas app rendered as
 *                  `aria-label`, i.e. what existing Tosca modules recorded (the "Reversed"
 *                  decision in ProjectDocs/migration-plans/09-tosca-automation-conventions.md).
 *   C5 unverified— `AccessibleLabel` is set but the JSX `aria-label` is an expression; reported for
 *                  review, not failed.
 *
 * Kebab-case ids (`contracts-add-target-…`, no underscore) are derived ids, not canvas names, and
 * are only counted. Repeating-row suffixes (`` `${name}-${row.id}` ``) are stripped before lookup.
 * Exempt an element with `// canvas-identity-ignore: <reason>` on its line or up to two above.
 *
 * Usage (from app/): node scripts/check-canvas-identities.mjs [--json] [--module <path-fragment>]
 *   exit 1 when any C1–C4 finding exists.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MSAPP = path.resolve(APP, "../ProjectDocs/_extracted/msapp");
const ts = createRequire(path.join(APP, "package.json"))("typescript");

/** Feature file/folder → canvas app + screen file(s). First match wins. */
export const MODULES = [
  ["src/features/cost/capex-costs/", "projectcosts", ["Capex Costs Screen"]],
  ["src/features/cost/contracts/", "projectcosts", ["Contracts Screen"]],
  ["src/features/cost/periods/OpexScreen", "projectcosts", ["Opex Costs Screen"]],
  ["src/features/cost/periods/LandLeaseScreen", "projectcosts", ["Land Lease Costs Screen"]],
  ["src/features/cost/add-costs-from-table/", "projectcosts", ["Add Costs from Table"]],
  ["src/features/pm/project-main/", "projectmanagement", ["Project Main Screen"]],
  ["src/features/pm/general-data/", "projectmanagement", ["Project General Data Screen"]],
  ["src/features/pm/milestones/", "projectmanagement", ["Project General Milestones Screen"]],
  ["src/features/pm/generators/", "projectmanagement", ["Project Generators Screen"]],
  ["src/features/pm/production/", "projectmanagement", ["Project Production Screen"]],
  ["src/features/pm/checklist/", "projectmanagement", ["Project General CheckList Screen"]],
  ["src/features/pm/team/", "projectmanagement", ["Project General Team Screen"]],
  ["src/features/pm/planning/", "projectmanagement", ["Project Planning Screen"]],
  ["src/features/pm/grid-operator/", "projectmanagement", ["Grid Operator Screen"]],
  ["src/features/pm/revenues/", "projectmanagement", ["Project Revenues Screen"]],
  ["src/features/pm/finance/", "projectmanagement", ["Project Finance Screen"]],
  ["src/features/admin/admin-capex-accounts/", "projectmanagement", ["Admin CAPEX Accounts"]],
  ["src/features/admin/admin-contract/", "projectmanagement", ["Admin Contract Screen"]],
  ["src/features/admin/admin-cost/", "projectmanagement", ["Admin Cost Screen"]],
  ["src/features/admin/admin-milestones/", "projectmanagement", ["Admin Milestones Screen"]],
  ["src/features/admin/admin-default-checklists/", "projectmanagement", ["Admin Project Default Checklists Screen"]],
  ["src/features/admin/admin-gates-approvals/", "projectmanagement", ["Admin Project Gates Approvals Screen"]],
  ["src/features/shared/report-problem/", "both", []],
  ["src/components/", "both", []],
];

/** Canvas control type (without @version) → JSX tags it may legitimately be rendered as. */
const TYPE_FAMILY = {
  Button: ["button", "Button", "ToolbarButton", "MenuItem", "CompoundButton", "Link", "a", "NavLink", "PanelExtraButton", "OneTimePaymentToggle"],
  Classic_Button: ["button", "Button", "ToolbarButton"],
  Icon: ["button", "Button", "ToolbarButton"],
  Image: ["button", "Button", "input"],
  Toggle: ["Switch", "input", "Checkbox", "ToggleButton", "Button", "button", "OneTimePaymentToggle"],
  Classic_Toggle: ["Switch", "input", "Checkbox"],
  Checkbox: ["Checkbox", "input", "Switch"],
  Classic_CheckBox: ["Checkbox", "input"],
  ModernDropdown: ["Dropdown", "select", "CostSelect", "Combobox", "ChoiceField"],
  Classic_DropDown: ["Dropdown", "select", "CostSelect", "Combobox", "ChoiceField"],
  ComboBox: ["SelectChoice", "Combobox", "Dropdown", "Input", "input", "CostSelect"],
  Classic_ComboBox: ["Combobox", "Dropdown", "Input", "input"],
  ModernTextInput: ["ReadOnlyField", "Input", "input", "textarea", "Textarea", "CostField", "TextField", "TextAreaField", "NumericField", "SpinButton"],
  Classic_TextInput: ["ReadOnlyField", "Input", "input", "textarea", "Textarea", "CostField", "TextField", "TextAreaField", "NumericField"],
  TextInput: ["ReadOnlyField", "Input", "input", "textarea", "Textarea", "CostField", "TextField", "TextAreaField", "NumericField"],
  ModernNumberInput: ["Input", "input", "CostField", "NumericField", "SpinButton"],
  NumberInput: ["Input", "input", "CostField", "NumericField", "SpinButton"],
  ModernDatePicker: ["DateBox", "DatePicker", "input", "Input", "CostField", "TaggedDateField", "DateField", "DateInput"],
  Classic_DatePicker: ["DateBox", "DatePicker", "input", "Input", "CostField", "TaggedDateField", "DateField", "DateInput"],
  DatePicker: ["DateBox", "DatePicker", "input", "Input", "CostField", "TaggedDateField", "DateField", "DateInput"],
  ModernRadio: ["RadioChoice", "Choices", "Radio", "input", "RadioGroup"],
  Classic_Radio: ["RadioChoice", "Choices", "Radio", "input", "RadioGroup"],
  Radio: ["RadioChoice", "Choices", "Radio", "input", "RadioGroup"],
  ModernTabList: ["Tab", "TabList", "Button", "button"],
  TabList: ["Tab", "TabList", "Button", "button"],
  Slider: ["Slider", "input"],
  Rectangle: ["button", "tr", "div", "Button"],
  Label: ["Text", "button", "Button", "tr", "div", "span"],
  Text: ["Text", "button", "Button", "tr", "div", "span"],
};
/** Canvas types that are layout/containers — a JSX control pointing at one is reported as C3. */
/** JSX tags that are controls (anything else is layout and may carry a container's name). */
const INTERACTIVE_TAGS = new Set(["button", "Button", "input", "select", "textarea", "Input", "Textarea", "Dropdown", "Combobox", "Checkbox", "Radio", "Switch", "Tab", "MenuItem", "DatePicker", "CostField", "Choices", "CostSelect", "TextField", "NumericField", "TextAreaField", "TaggedDateField", "DateField", "DateInput", "ChoiceField"]);
const CONTAINER = /^(GroupContainer|Gallery|Group|Container|Screen|Component|DataTable|Form|Card|TypedDataCard)/;

// ---------------------------------------------------------------- canvas index
function parseCanvasFile(file, screen) {
  const out = new Map();
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const stack = []; // {indent, name}
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- ([A-Za-z0-9_'.\- ]+?):\s*$/);
    if (m && /^\s*Control:\s*/.test(lines[i + 1] ?? "")) {
      const indent = m[1].length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const name = m[2].replace(/^'|'$/g, "");
      const type = (lines[i + 1].match(/Control:\s*([A-Za-z_]+)/) || [])[1] ?? "?";
      out.set(name, { name, type, screen, accessibleLabel: undefined, file });
      stack.push({ indent, name });
      continue;
    }
    const al = lines[i].match(/^(\s*)AccessibleLabel:\s*(.*)$/);
    if (al && stack.length) {
      const owner = [...stack].reverse().find((s) => s.indent < al[1].length);
      if (owner) {
        const raw = al[2].trim();
        const lit = raw.match(/^="((?:[^"]|"")*)"$/);
        out.get(owner.name).accessibleLabel = lit ? lit[1].replace(/""/g, '"') : { formula: raw };
      }
    }
  }
  return out;
}

const canvasCache = new Map();
function canvasIndex(app) {
  if (canvasCache.has(app)) return canvasCache.get(app);
  const screens = new Map(); // screen -> Map(name -> ctl)
  const all = new Map();      // name -> ctl[]
  for (const a of app === "both" ? ["projectcosts", "projectmanagement"] : [app]) {
    const src = path.join(MSAPP, a, "Src");
    const files = [
      ...fs.readdirSync(src).filter((f) => f.endsWith(".pa.yaml")).map((f) => [path.join(src, f), f.replace(/\.pa\.yaml$/, "")]),
      ...fs.readdirSync(path.join(src, "Components")).map((f) => [path.join(src, "Components", f), `Components/${f.replace(/\.pa\.yaml$/, "")}`]),
    ];
    for (const [f, screen] of files) {
      const idx = parseCanvasFile(f, `${a}/${screen}`);
      screens.set(`${a}/${screen}`, idx);
      for (const [n, c] of idx) (all.get(n) ?? all.set(n, []).get(n)).push(c);
    }
  }
  const r = { screens, all };
  canvasCache.set(app, r);
  return r;
}

// ---------------------------------------------------------------- JSX side
const CANVAS_NAME = /^(btn|but|txt|lbl|drp|cmb|cbx|rad|tgl|chk|chb|ico|img|dte|dtp|tab|pcf|gal|con|cnt|icon|icn|tog|sld|spn|num|htm|InfoButton|Label|Button|Checkbox|Toggle|Image|Icon|modern|Text)[A-Za-z0-9]*_?/;
const TESTID_PROPS = ["data-testid", "name", "testId", "saveTestId", "cancelTestId"];
/**
 * Primitives that put their `name` prop on BOTH `data-testid` and `aria-label`
 * (`aria-label={name ?? label}` in CostField/Choices, `aria-label={name}` in TaggedDateField),
 * so `name` is the canvas identity and the aria-label check compares the name itself.
 */
const NAME_PRIMITIVES = ["CostField", "Choices", "TaggedDateField", "DateField", "DateInput"];
/**
 * Primitives that take the canvas `AccessibleLabel` as an `ariaLabel` PROP (rendered as
 * `aria-label`), so the C4 check reads that prop when no `aria-label` attribute is written.
 * A NAME_PRIMITIVE given `ariaLabel` is checked against it instead of its name.
 */
const ARIA_PROP_PRIMITIVES = ["DateField", "DateInput", "ChoiceField"];

function staticPrefix(init, sf) {
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return e.head.text.replace(/[-_]+$/, "") || undefined;
  }
  return undefined;
}

function moduleFor(rel) {
  return MODULES.find(([frag]) => rel.startsWith(frag));
}

export function validate({ only } = {}) {
  const files = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (n === "generated" || n === "node_modules") continue;
      if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) files.push(p);
    }
  };
  walk(path.join(APP, "src"));
  const findings = [];
  const stats = new Map(); // module -> {canvas, derived, verified}
  for (const file of files) {
    const rel = path.relative(APP, file).split(path.sep).join("/");
    if (only && !rel.includes(only)) continue;
    const mod = moduleFor(rel);
    if (!mod) continue;
    const [frag, app, screenNames] = mod;
    const { screens, all } = canvasIndex(app);
    const own = screenNames.length
      ? screenNames.map((s) => screens.get(`${app}/${s}`)).filter(Boolean)
      : [...screens.entries()].filter(([k]) => k.includes("/Components/") || k.endsWith("/App")).map(([, v]) => v);
    const shared = [...screens.entries()].filter(([k]) => k.includes("/Components/")).map(([, v]) => v);
    const st = stats.get(frag) ?? stats.set(frag, { canvas: 0, derived: 0, verified: 0, labelChecked: 0 }).get(frag);
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = ts.isIdentifier(n.tagName) ? n.tagName.text : n.tagName.getText(sf);
        const attrs = new Map();
        for (const p of n.attributes.properties) if (ts.isJsxAttribute(p)) attrs.set(p.name.getText(sf), p.initializer);
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        const ignored = [lines[line - 1], lines[line - 2], lines[line - 3]].some((l) => l && /canvas-identity-ignore:/.test(l));
        for (const prop of TESTID_PROPS) {
          if (!attrs.has(prop)) continue;
          if (prop === "name" && !NAME_PRIMITIVES.includes(tag)) continue;
          const init0 = attrs.get(prop);
          const composed = init0 && ts.isJsxExpression(init0) && init0.expression && ts.isTemplateExpression(init0.expression);
          const id = staticPrefix(init0, sf);
          if (!id) continue;
          if (!CANVAS_NAME.test(id) || !id.includes("_")) { st.derived++; continue; }
          st.canvas++;
          if (ignored) continue;
          const findIn = (m) => m.get(id) ?? (composed ? [...m.values()].find((c) => c.name.startsWith(id)) : undefined);
          const local = own.map(findIn).find(Boolean) ?? shared.map(findIn).find(Boolean);
          const anywhere = all.get(id) ?? (composed ? [...all.entries()].filter(([k]) => k.startsWith(id)).map(([, v]) => v[0]) : undefined);
          if (composed && local) { st.verified++; continue; }   // a composed name: existence of the family is what can be proven
          const at = `${rel}:${line}`;
          if (!local && (!anywhere || anywhere.length === 0)) { findings.push({ code: "C1", at, tag, id, msg: `no canvas control named "${id}" (typo or invented)` }); continue; }
          if (!local) { findings.push({ code: "C2", at, tag, id, msg: `"${id}" exists only on ${anywhere.map((c) => c.screen).join(", ")}` }); continue; }
          st.verified++;
          const fam = TYPE_FAMILY[local.type.replace(/_?\d.*$/, "")] ?? TYPE_FAMILY[local.type];
          // the panel Save/Cancel props are rendered as <Button> inside PanelButtons
          const jsxTag = ["saveTestId", "cancelTestId"].includes(prop) ? "Button" : tag;
          if (CONTAINER.test(local.type)) {
            if (INTERACTIVE_TAGS.has(jsxTag) && !["button", "Button"].includes(jsxTag)) findings.push({ code: "C3", at, tag: jsxTag, id, msg: `canvas "${id}" is a ${local.type}, rendered as <${jsxTag}>` });
          } else if (fam && !fam.includes(jsxTag)) {
            findings.push({ code: "C3", at, tag: jsxTag, id, msg: `canvas "${id}" is a ${local.type}, rendered as <${jsxTag}>` });
          }
          const canvasAl = local.accessibleLabel;
          if (typeof canvasAl === "string" && canvasAl.trim() && !["saveTestId", "cancelTestId"].includes(prop)) {
            st.labelChecked++;
            const ariaProp = ARIA_PROP_PRIMITIVES.includes(tag) && !attrs.has("aria-label") && attrs.has("ariaLabel");
            const alInit = ariaProp ? attrs.get("ariaLabel") : attrs.get("aria-label");
            const alLit = staticPrefix(alInit, sf);
            const isTemplate = alInit && ts.isJsxExpression(alInit) && alInit.expression && !ts.isStringLiteral(alInit.expression) && !ts.isNoSubstitutionTemplateLiteral(alInit.expression);
            if (NAME_PRIMITIVES.includes(tag) && !ariaProp) {
              // these render aria-label={name ?? label} — the name IS the canvas name
              if (canvasAl !== id) findings.push({ code: "C4", at, tag, id, msg: `canvas AccessibleLabel is "${canvasAl}" but ${tag} renders aria-label="${id}" (its name)` });
            } else if (isTemplate) {
              findings.push({ code: "C5", at, tag, id, msg: `canvas AccessibleLabel is "${canvasAl}", aria-label is an expression (${alInit.expression.getText(sf).slice(0, 60)})` });
            } else if (alLit !== undefined && alLit !== canvasAl) {
              findings.push({ code: "C4", at, tag, id, msg: `canvas AccessibleLabel is "${canvasAl}" but aria-label="${alLit}"` });
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { findings, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--module");
  const { findings, stats } = validate({ only: i > 0 ? process.argv[i + 1] : undefined });
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ findings, stats: Object.fromEntries(stats) }, null, 2)); }
  else {
    for (const f of findings) console.log(`${f.code} ${f.at}  <${f.tag}>  ${f.msg}`);
    console.log("\nper module: canvas-named ids (verified on own screen) · derived ids · AccessibleLabels compared");
    for (const [m, s] of stats) console.log(`  ${m.padEnd(46)} ${String(s.canvas).padStart(4)} (${s.verified} verified) · ${String(s.derived).padStart(3)} · ${s.labelChecked}`);
    const by = (c) => findings.filter((f) => f.code === c).length;
    console.log(`\ncanvas-identities: C1 unknown ${by("C1")}, C2 foreign ${by("C2")}, C3 type ${by("C3")}, C4 label ${by("C4")}, C5 unverified ${by("C5")}`);
  }
  process.exit(findings.some((f) => f.code !== "C5") ? 1 : 0);
}
