#!/usr/bin/env node
/**
 * Parity manifest generator (D80, plan section 6): drafts `e2e/screens/<slug>/manifest.draft.ts` and
 * `ProjectDocs/app-docs/e2e/RULEMAP-<slug>.draft.md` from ANY canvas screen's `.pa.yaml`.
 *
 * Usage (from ProjectCosts-CodeApp/):
 *   node scripts/gen-parity-manifest.mjs "<Screen>.pa.yaml" [--app projectcosts|projectmanagement] [--slug <slug>]
 *        [--out-dir e2e/screens] [--rulemap-dir ../ProjectDocs/app-docs/e2e] [--canvas-version 1.21.709] [--date YYYY-MM-DD]
 *   The file is looked up in `ProjectDocs/_extracted/msapp/<app>/Src/` (both apps when `--app` is not given), or taken as a path.
 *
 * What it reads (the YAML through `scripts/lib/paYaml.mjs`, the same reader as the canvas-identity gate):
 *   - every control: name, type, AccessibleLabel, Text, Tooltip, and the LIVE Visible / DisplayMode (commented-out formulas
 *     are skipped, CONVENTIONS rule 10);
 *   - text inputs and their `*_ErrorMessage_*` labels with the verbatim message texts; hint / warning labels; `Notify` texts;
 *   - dropdowns + Items, toggles + Label, buttons and command-bar items + captions and gates (ItemEnabled / ItemVisible);
 *   - panels (`con_*RightPanel*`), confirmation dialogs (`cmp_*PopUp_Confirmation*`), galleries;
 *   - Patch / Remove / RemoveIf / Collect / UpdateIf / SubmitForm targets, mapped from their canvas display names to logical
 *     names and entity sets (`References/DataSources.json` of the canvas app, `ProjectDocs/reference/dataverse-*.json`) and to
 *     the generated services in `src/generated/services/`;
 *   - the screen's left-menu entry (`App.pa.yaml` `*NavigationMenu`) and the code app's route for it (`src/app/navigation.ts`);
 *   - the code app's `data-testid`s in the feature folder that `check-canvas-identities.mjs` MODULES maps to the screen.
 *
 * It never writes `manifest.ts`: a draft is reviewed and completed by hand (TODO markers), then saved as `manifest.ts`.
 * The pure part (`extractScreen`, `buildManifestDraft`, `buildRuleMap`) is tested in `src/test/genParityManifest.test.ts`
 * (UT-GENPARITY-*); `loadContext` / `generate` read the disk.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODULES } from "./check-canvas-identities.mjs";
import { fxCalls, fxLiteral, fxName, fxRecord, fxStrings, liveFormula, maskFx, oneLine, parsePaYaml } from "./lib/paYaml.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(APP, "..");
const MSAPP = path.join(WORKSPACE, "ProjectDocs/_extracted/msapp");
const REFERENCE = path.join(WORKSPACE, "ProjectDocs/reference");

/** The standard validation probe list (plan section 2; the same inputs in both apps). */
export const PROBE_INPUTS = ["abc", "-1", "0", "1", "1.5", "1,5", "0.555", "1e3", " ", "", "1."];

/** The canvas solution on disk (`ProjectDocs/_extracted`, see `src/test/canvasIdentities.test.ts`). */
const DEFAULT_CANVAS_VERSION = "1.21.709";

const WRITE_FNS = ["Patch", "Remove", "RemoveIf", "Collect", "ClearCollect", "UpdateIf", "SubmitForm"];

/* ─────────────────────────────────────────────────────────── helpers ── */

export function kebab(s) {
  return String(s)
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** `lbl_X_Description_ErrorMessage_1` -> `X_Description`; `txt_X_Description_1` -> `X_Description`. */
const baseOfInput = (n) => n.replace(/^[a-z]+_/, "").replace(/(_\d+)+$/, "");
const baseOfError = (n) => n.replace(/^[a-z]+_/, "").replace(/_?ErrorMessage.*$/i, "");

const typeOf = (c) => c.type.replace(/@.*/, "");
function family(c) {
  const t = typeOf(c);
  if (/^(TextInput|ModernTextInput|Classic\/TextInput|NumberInput|ModernNumberInput)$/.test(t)) return "input";
  if (/DatePicker$/.test(t)) return "date";
  if (/^(DropDown|ModernDropdown|Classic\/DropDown|ComboBox|ModernCombobox|Classic\/ComboBox|DropDownDataField|ComboBoxDataField)$/.test(t)) return "dropdown";
  if (/^(Toggle|Classic\/Toggle|CheckBox|Checkbox|Classic\/CheckBox|ModernCheckbox)$/.test(t)) return "toggle";
  if (/Radio/.test(t)) return "radio";
  if (/^(Button|Classic\/Button|ModernButton|InfoButton|ModernInformationButton)$/.test(t)) return "button";
  if (/^(Classic\/Icon|Icon|Image)$/.test(t)) return c.props.OnSelect ? "button" : "icon";
  if (/^(Label|Text|ModernText|HtmlViewer)$/.test(t)) return "label";
  if (t === "Gallery") return "gallery";
  if (t === "GroupContainer") return "container";
  if (t === "Timer") return "timer";
  if (t === "CodeComponent") {
    if (c.componentName === "cat_PowerCAT.CommandBar") return "commandbar";
    if (c.componentName === "cat_PowerCAT.Icon" || c.props.OnSelect || c.props.OnChange) return "button";
    return "pcf";
  }
  if (t === "CanvasComponent") return /PopUp_Confirmation/i.test(c.componentName ?? "") ? "dialog" : "component";
  return "other";
}

const live = (c, k) => (c.props[k] ? liveFormula(c.props[k].value) : null);
/** A string literal that reads as a message: words, not a `Text(…, "##")` / date format pattern or a blank. */
const isMessage = (s) => /[A-Za-z]{2,}/.test(s) && !/^[#0.,%dmyhsDMYHS:/\- ]+$/.test(s.trim());
const lineOf = (c, k) => c.props[k]?.line ?? c.line;
/** Visible / DisplayMode values that say nothing (the default). */
const TRIVIAL = new Set(["true", "DisplayMode.Edit", ""]);

/* ─────────────────────────────────────────────────────── extraction ── */

/**
 * Everything the drafts need from one screen's YAML text. Pure (no disk, no context).
 * Each item carries `line` (1-based, the `PA:<line>` the rule maps cite).
 */
export function extractScreen(text) {
  const { screen, controls } = parsePaYaml(text);
  const fam = new Map(controls.map((c) => [c.name, family(c)]));
  const byName = new Map(controls.map((c) => [c.name, c]));
  const inPanel = (c) => c.ancestors.some((a) => /RightPanel/.test(a)) || /RightPanel/.test(c.name);

  const inputs = controls.filter((c) => fam.get(c.name) === "input" || fam.get(c.name) === "date");
  const inputByBase = new Map(inputs.map((c) => [baseOfInput(c.name), c]));

  /* error labels -> their input and verbatim texts */
  const errorLabels = controls
    .filter((c) => fam.get(c.name) === "label" && /ErrorMessage/i.test(c.name))
    .map((c) => {
      const text = live(c, "Text") ?? "";
      const strings = fxStrings(text);
      let input = inputByBase.get(baseOfError(c.name)) ?? null;
      if (!input) {
        const refs = `${live(c, "Visible") ?? ""}\n${text}`;
        input = inputs.find((i) => new RegExp(`\\b${i.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(refs)) ?? null;
      }
      return {
        name: c.name, line: c.line, input: input?.name ?? null,
        text, textLine: lineOf(c, "Text"), visible: live(c, "Visible") ?? "", visibleLine: lineOf(c, "Visible"),
        messages: strings.filter((s) => s.holes === 0 && isMessage(s.value)).map((s) => s.value),
        templates: strings.filter((s) => s.holes > 0 && isMessage(s.value)).map((s) => s.value),
      };
    });

  /* messages: error labels, hint / warning labels, Notify texts (verbatim, first occurrence order) */
  const messages = [];
  const addMessage = (text, source, line) => {
    if (!text || !text.trim() || messages.some((m) => m.text === text)) return;
    messages.push({ text, source, line });
  };
  for (const e of errorLabels) for (const m of e.messages) addMessage(m, `${e.name}.Text`, e.textLine);
  for (const c of controls) {
    if (fam.get(c.name) !== "label" || /ErrorMessage/i.test(c.name) || !/_(Hint|Warning)/i.test(c.name)) continue;
    const prop = c.props.HtmlText ? "HtmlText" : "Text";
    for (const s of fxStrings(live(c, prop) ?? "")) {
      if (s.holes || !isMessage(s.value)) continue;
      addMessage(prop === "HtmlText" ? s.value.replace(/<[^>]+>/g, "") : s.value, `${c.name}.${prop}${prop === "HtmlText" ? " (markup stripped)" : ""}`, lineOf(c, prop));
    }
  }
  const notifies = [];
  const owners = [{ name: screen?.name ?? "screen", props: screen?.props ?? {}, line: 1 }, ...controls];
  for (const o of owners) {
    for (const [k, p] of Object.entries(o.props)) {
      if (!/^On/.test(k)) continue;
      for (const call of fxCalls(liveFormula(p.value), ["Notify"])) {
        const lit = fxStrings(call.args[0] ?? "")[0];
        if (!lit) continue;
        const whole = fxLiteral(`=${call.args[0]}`);
        notifies.push({ control: o.name, property: k, line: p.line, text: whole ?? oneLine(call.args[0]), literal: whole !== null });
        // Only a Notify whose whole text is one literal is a verbatim message; `"Error: " & FirstError.Message` is not.
        if (whole !== null && isMessage(whole)) addMessage(whole, `${o.name}.${k} Notify`, p.line);
      }
    }
  }

  /* command bars and their items */
  const commandBars = controls.filter((c) => fam.get(c.name) === "commandbar").map((c) => {
    const items = [];
    const table = fxCalls(live(c, "Items") ?? "", ["Table"])[0];
    for (const rec of table?.args ?? []) {
      const fields = Object.fromEntries((fxRecord(rec) ?? []).map((f) => [f.name, f.value]));
      if (!fields.ItemKey && !fields.ItemDisplayName) continue;
      const caption = fxLiteral(`=${fields.ItemDisplayName ?? ""}`);
      items.push({
        key: fxLiteral(`=${fields.ItemKey ?? ""}`) ?? oneLine(fields.ItemKey ?? ""),
        caption: caption ?? oneLine(fields.ItemDisplayName ?? ""), captionIsFormula: caption === null,
        enabled: oneLine(fields.ItemEnabled ?? ""), visible: oneLine(fields.ItemVisible ?? ""),
      });
    }
    return { name: c.name, line: c.line, itemsLine: lineOf(c, "Items"), items, onSelect: live(c, "OnSelect") ?? "", onSelectLine: lineOf(c, "OnSelect"), inPanel: inPanel(c) };
  });

  const caption = (c) => fxLiteral(c.props.Text?.value ?? "") ?? fxLiteral(c.props.Tooltip?.value ?? "") ?? null;
  const buttons = controls.filter((c) => fam.get(c.name) === "button").map((c) => ({
    name: c.name, line: c.line, type: typeOf(c), caption: caption(c), inPanel: inPanel(c),
    onSelect: live(c, "OnSelect") ?? live(c, "OnChange") ?? "", onSelectLine: lineOf(c, c.props.OnSelect ? "OnSelect" : "OnChange"),
    displayMode: live(c, "DisplayMode") ?? "", visible: live(c, "Visible") ?? "",
  }));

  const dropdowns = controls.filter((c) => fam.get(c.name) === "dropdown").map((c) => ({
    name: c.name, line: c.line, type: typeOf(c), items: live(c, "Items") ?? "", itemsLine: lineOf(c, "Items"),
    defaultSelected: live(c, "DefaultSelectedItems") ?? live(c, "Default") ?? "", onChange: live(c, "OnChange") ?? "",
  }));
  const toggles = controls.filter((c) => fam.get(c.name) === "toggle" || fam.get(c.name) === "radio").map((c) => ({
    name: c.name, line: c.line, type: typeOf(c),
    label: fxLiteral(c.props.Label?.value ?? c.props.Text?.value ?? "") ?? (live(c, "Label") ?? live(c, "Text") ?? ""),
    checked: live(c, "Checked") ?? live(c, "Default") ?? live(c, "Value") ?? "", onChange: live(c, "OnChange") ?? live(c, "OnCheck") ?? "",
  }));

  const topOf = (re, f) => controls.filter((c) => f(c) && re.test(c.name) && !c.ancestors.some((a) => re.test(a) && f(byName.get(a) ?? c)));
  const panels = topOf(/RightPanel/, (c) => fam.get(c.name) === "container").map((c) => ({
    name: c.name, line: c.line, visible: live(c, "Visible") ?? "",
    save: controls.find((d) => d.ancestors.includes(c.name) && /_Save(_\d+)?$/i.test(d.name))?.name ?? null,
    cancel: controls.find((d) => d.ancestors.includes(c.name) && /_Cancel(_\d+)?$/i.test(d.name))?.name ?? null,
  }));
  const dialogs = controls.filter((c) => fam.get(c.name) === "dialog").map((c) => ({
    name: c.name, line: c.line, title: fxLiteral(c.props.Title?.value ?? "") ?? (live(c, "Title") ?? ""),
    description: live(c, "Description") ?? "", visible: live(c, "Visible") ?? "", onConfirm: live(c, "OnConfirm") ?? "", onConfirmLine: lineOf(c, "OnConfirm"),
  }));
  const galleries = controls.filter((c) => fam.get(c.name) === "gallery" && !c.ancestors.some((a) => fam.get(a) === "gallery")).map((c) => ({
    name: c.name, line: c.line, items: live(c, "Items") ?? "", itemsLine: lineOf(c, "Items"),
  }));
  const timers = controls.filter((c) => fam.get(c.name) === "timer").map((c) => ({ name: c.name, line: c.line, onTimerEnd: live(c, "OnTimerEnd") ?? "", start: live(c, "Start") ?? "" }));

  /* writes: every call of a write function, with the record fields it writes */
  const writes = [];
  for (const o of owners) {
    for (const [k, p] of Object.entries(o.props)) {
      const f = liveFormula(p.value);
      if (!/(Patch|Remove|RemoveIf|Collect|ClearCollect|UpdateIf|SubmitForm)\s*\(/.test(maskFx(f))) continue;
      for (const call of fxCalls(f, WRITE_FNS)) {
        const target = fxName(call.args[0] ?? "");
        const columns = [...new Set(call.args.slice(1).flatMap((a) => (fxRecord(a) ?? []).map((r) => r.name)))];
        writes.push({ control: o.name, property: k, line: p.line, fn: call.fn, target, columns });
      }
    }
  }

  const accessible = controls.filter((c) => c.props.AccessibleLabel).map((c) => {
    const lit = c.props.AccessibleLabel.raw.match(/^="((?:[^"]|"")*)"$/);
    return { name: c.name, line: lineOf(c, "AccessibleLabel"), label: lit ? lit[1].replace(/""/g, '"') : null, formula: lit ? null : oneLine(liveFormula(c.props.AccessibleLabel.value)) };
  });
  const tooltips = controls.filter((c) => c.props.Tooltip && liveFormula(c.props.Tooltip.value)).map((c) => {
    const formula = oneLine(liveFormula(c.props.Tooltip.value));
    // `Self.Text` on a label with a literal Text hovers that text.
    const lit = fxLiteral(c.props.Tooltip.value) ?? (formula === "Self.Text" && c.props.Text ? fxLiteral(c.props.Text.value) : null);
    return { name: c.name, line: lineOf(c, "Tooltip"), tooltip: lit, formula: lit === null ? formula : null };
  }).filter((t) => t.tooltip !== "");
  const visibility = [];
  for (const c of controls) {
    for (const k of ["Visible", "DisplayMode"]) {
      const v = live(c, k);
      if (v === null || TRIVIAL.has(v)) continue;
      visibility.push({ name: c.name, family: fam.get(c.name), property: k, line: lineOf(c, k), formula: v });
    }
  }
  const screenEvents = Object.entries(screen?.props ?? {}).filter(([k]) => /^On/.test(k)).map(([k, p]) => ({ property: k, line: p.line, formula: liveFormula(p.value) }));

  return {
    screenName: screen?.name ?? "?", controlCount: controls.length,
    controls: controls.map((c) => ({
      name: c.name, type: c.type, family: fam.get(c.name), line: c.line, parent: c.parent,
      accessibleLabel: accessible.find((a) => a.name === c.name)?.label ?? null,
      text: c.props.Text ? (fxLiteral(c.props.Text.value) ?? null) : null,
      tooltip: c.props.Tooltip ? (fxLiteral(c.props.Tooltip.value) ?? null) : null,
      visible: c.props.Visible ? (live(c, "Visible") ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "" : null,
      displayMode: c.props.DisplayMode ? (live(c, "DisplayMode") ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "" : null,
    })),
    inputs: inputs.map((c) => ({
      name: c.name, line: c.line, type: typeOf(c), family: fam.get(c.name), errorLabels: errorLabels.filter((e) => e.input === c.name).map((e) => e.name),
      placeholder: fxLiteral(c.props.Placeholder?.value ?? c.props.HintText?.value ?? ""), onChange: live(c, "OnChange") ?? "",
    })),
    errorLabels, messages, notifies, commandBars, buttons, dropdowns, toggles, panels, dialogs, galleries, timers, writes,
    accessible, tooltips, visibility, screenEvents,
  };
}

/* ────────────────────────────────────────────────────────── context ── */

/** The code app's `data-testid` values (literal ids and literal prefixes) in a set of files' text. */
export function testIdsIn(texts) {
  const ids = new Set();
  const re = /(?:data-testid|testId|saveTestId|cancelTestId|closeTestId|toggleTestId|testIdPrefix|name)=(?:"([^"]+)"|\{\s*["'`]([^"'`$]+))/g;
  for (const t of texts) for (let m = re.exec(t); m; m = re.exec(t)) ids.add((m[1] ?? m[2]).replace(/-$/, ""));
  return ids;
}

/** The canvas left-menu tables of `App.pa.yaml`: `[{ menu, key, caption, target }]`. */
export function canvasNavFrom(appYamlText) {
  const { screen } = parsePaYaml(appYamlText);
  const out = [];
  for (const p of Object.values(screen?.props ?? {})) {
    const f = liveFormula(p.value);
    const m = maskFx(f);
    const re = /(\w*NavigationMenu\w*)\s*=\s*Table\s*\(/g;
    for (let hit = re.exec(m); hit; hit = re.exec(m)) {
      const call = fxCalls(f.slice(hit.index + hit[0].indexOf("Table")), ["Table"])[0];
      for (const rec of call?.args ?? []) {
        const r = Object.fromEntries((fxRecord(rec) ?? []).map((x) => [x.name, x.value]));
        if (!r.ItemKey) continue;
        out.push({ menu: hit[1], key: fxName(r.ItemKey), caption: fxName(r.ItemDisplayName ?? ""), target: r.TargetScreen ? fxName(r.TargetScreen) : null });
      }
    }
  }
  return out;
}

/** `key -> path` of the code app's nav items (`src/app/navigation.ts`). */
export function codeNavFrom(navigationTs) {
  const out = new Map();
  const segs = navigationTs.split(/key:\s*"/).slice(1);
  for (const s of segs) {
    const key = s.slice(0, s.indexOf('"'));
    const obj = s.slice(0, s.indexOf("}") < 0 ? s.length : s.indexOf("}"));
    const p = /path:\s*"([^"]+)"/.exec(obj);
    if (p && !out.has(key)) out.set(key, p[1]);
  }
  return out;
}

function walk(dir, keep, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (n === "node_modules" || n === "generated") continue;
    if (fs.statSync(p).isDirectory()) walk(p, keep, out); else if (keep(p)) out.push(p);
  }
  return out;
}

/** Everything outside the YAML that the drafts use, read from disk. */
export function loadContext({ app, screenName, root = APP }) {
  const rel = (p) => path.relative(root, p).split(path.sep).join("/");
  const dataSources = new Map();
  const dsFile = path.join(MSAPP, app, "References/DataSources.json");
  if (fs.existsSync(dsFile)) {
    for (const d of JSON.parse(fs.readFileSync(dsFile, "utf8")).DataSources ?? []) {
      if (d.Type === "NativeCDSDataSourceInfo") dataSources.set(d.Name, { logicalName: d.LogicalName, entitySet: d.EntitySetName });
    }
  }
  const entities = new Map();
  for (const e of JSON.parse(fs.readFileSync(path.join(REFERENCE, "dataverse-entities.json"), "utf8")).entities ?? []) entities.set(e.logicalName, e);
  const attributes = new Map();
  for (const e of Object.values(JSON.parse(fs.readFileSync(path.join(REFERENCE, "dataverse-attributes.json"), "utf8")).entities ?? {})) attributes.set(e.logicalName, e.attributes ?? {});
  const services = new Map();
  const svcDir = path.join(root, "src/generated/services");
  if (fs.existsSync(svcDir)) {
    for (const f of fs.readdirSync(svcDir).filter((n) => n.endsWith(".ts"))) {
      const t = fs.readFileSync(path.join(svcDir, f), "utf8");
      const ds = /dataSourceName\s*=\s*'([^']+)'/.exec(t);
      const cls = /export class (\w+)/.exec(t);
      if (ds && cls) services.set(ds[1], { service: cls[1], module: `/src/generated/services/${f}` });
    }
  }
  const appYaml = path.join(MSAPP, app, "Src/App.pa.yaml");
  const canvasNav = fs.existsSync(appYaml) ? canvasNavFrom(fs.readFileSync(appYaml, "utf8")) : [];
  const navTs = path.join(root, "src/app/navigation.ts");
  const codeNav = fs.existsSync(navTs) ? codeNavFrom(fs.readFileSync(navTs, "utf8")) : new Map();
  const fragments = MODULES.filter(([, a, screens]) => a === app && screens.includes(screenName)).map(([frag]) => frag);
  const codeFiles = walk(path.join(root, "src"), (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx")).filter((p) => fragments.some((fr) => rel(p).startsWith(fr)));
  const codeIds = testIdsIn(codeFiles.map((f) => fs.readFileSync(f, "utf8")));
  return { app, dataSources, entities, attributes, services, canvasNav, codeNav, fragments, codeFiles: codeFiles.map(rel), codeIds };
}

/* ───────────────────────────────────────────────────────── resolving ── */

const OWNER_LOOKUPS = /^(createdby|modifiedby|createdonbehalfby|modifiedonbehalfby|ownerid|owninguser|owningteam|owningbusinessunit|transactioncurrencyid)$/;

/** The written Dataverse tables as TableSpec drafts (children first), plus the writes that went to collections. */
export function resolveTables(model, ctx) {
  const tables = new Map();
  const collections = new Set();
  for (const w of model.writes) {
    const ds = ctx.dataSources.get(w.target);
    // Not a Dataverse table: a collection, or an expression target such as `Patch(Last(FirstN(…)), …)`.
    if (!ds) { collections.add(trimTo(oneLine(w.target), 60)); continue; }
    const t = tables.get(w.target) ?? {
      display: w.target, logicalName: ds.logicalName, entitySet: ds.entitySet, name: kebab(w.target),
      primaryKey: ctx.entities.get(ds.logicalName)?.primaryIdAttribute ?? `${ds.logicalName}id`,
      service: ctx.services.get(ds.entitySet)?.service ?? null, serviceModule: ctx.services.get(ds.entitySet)?.module ?? null,
      ops: new Set(), columns: new Map(), sources: [],
    };
    t.ops.add(w.fn);
    t.sources.push(`${w.control}.${w.property} (PA:${w.line}) ${w.fn}`);
    const attrs = ctx.attributes.get(ds.logicalName) ?? {};
    for (const col of w.columns) {
      if (t.columns.has(col)) continue;
      const hit = Object.entries(attrs).find(([, a]) => a.displayName === col) ?? Object.entries(attrs).find(([, a]) => a.displayName?.toLowerCase() === col.toLowerCase());
      t.columns.set(col, hit ? { logical: hit[0], type: hit[1].type } : null);
    }
    tables.set(w.target, t);
  }
  const list = [...tables.values()];
  for (const t of list) {
    const attrs = ctx.attributes.get(t.logicalName) ?? {};
    const lookups = Object.entries(attrs).filter(([n, a]) => a.type === "lookup" && !OWNER_LOOKUPS.test(n));
    const project = lookups.find(([, a]) => a.displayName === "Project");
    t.projectLookup = project ? `_${project[0]}_value` : null;
    t.parent = null;
    for (const [n] of lookups) {
      const core = n.replace(/^[a-z0-9]+_/, "");
      const p = list.find((o) => o !== t && core.length > 3 && o.logicalName.endsWith(core));
      if (p) { t.parent = { table: p.name, lookup: `_${n}_value` }; break; }
    }
    const written = [...t.columns.values()].filter(Boolean).map((c) => c.logical);
    const str = (n) => attrs[n] && /^(nvarchar|string|memo)$/.test(attrs[n].type);
    t.tagColumn = t.parent ? null : (["vsb_description", "vsb_name"].find((n) => str(n) && written.includes(n)) ?? (str("vsb_name") ? "vsb_name" : null));
  }
  const depth = (t, seen = new Set()) => {
    const kids = list.filter((o) => o.parent?.table === t.name && !seen.has(o.name));
    return kids.length ? 1 + Math.max(...kids.map((k) => depth(k, new Set([...seen, t.name])))) : 1;
  };
  for (const t of list) t.deleteOrder = depth(t);
  list.sort((a, b) => a.deleteOrder - b.deleteOrder || a.name.localeCompare(b.name));
  return { tables: list, collections: [...collections].sort() };
}

/** The OpenSpec draft for the screen: `{ spec, note }` (`note` says what is a guess). */
export function resolveOpen(model, ctx) {
  const entries = ctx.canvasNav.filter((e) => e.target === model.screenName);
  const first = entries[0];
  const route = first ? ctx.codeNav.get(first.key) ?? null : null;
  const others = entries.slice(1).map((e) => `"${e.caption.trim()}" (${e.key}${ctx.codeNav.get(e.key) ? ` -> ${ctx.codeNav.get(e.key)}` : ""})`);
  const note = [
    first ? `left-menu entry ${first.key} ("${first.caption}") in ${first.menu}` : "TODO: no left-menu entry targets this screen in App.pa.yaml",
    route ? `code route from src/app/navigation.ts` : "TODO: code route not found in src/app/navigation.ts",
    ...(others.length ? [`TODO: other menu entries open the same canvas screen: ${others.join(", ")}`] : []),
  ];
  const codeRoute = route ?? "TODO";
  if (ctx.app === "projectcosts") return { spec: { app: "cost", canvasMenu: first ? first.caption.trim() : "TODO", codeRoute }, note };
  if ((first && /Admin/i.test(first.menu)) || (!first && /^Admin\b/.test(model.screenName))) {
    return { spec: { app: "admin", leftMenuLabel: first ? first.caption.trim() : "TODO", codeRoute }, note };
  }
  return { spec: { app: "pm", canvasScreen: model.screenName, codeRoute }, note };
}

/** The code test id for a canvas control: the canvas name when the feature folder uses it, else `null`. */
function codeIdOf(ctx, name) {
  if (ctx.codeIds.has(name)) return name;
  for (const id of ctx.codeIds) if (id.startsWith(`${name}-`)) return name;
  return null;
}

/* ─────────────────────────────────────────────────────── the drafts ── */

const S = (v) => JSON.stringify(v);
const trimTo = (s, n) => (s.length > n ? `${s.slice(0, n)} … (trimmed)` : s);
const comment = (s) => oneLine(s).replace(/\*\//g, "* /");

/**
 * Kebab keys from canvas names, by their distinctive last part (`txt_…_BodyContent_DueDate2_1` -> `due-date2`); a clash
 * takes the part before it too (`new-edit-cost-description`), then a number.
 */
function uniqueKeys(names) {
  const used = new Map();
  return names.map((n) => {
    const parts = String(n).replace(/^[a-z]+_/, "").replace(/(_\d+)+$/, "").split("_").filter(Boolean);
    let k = kebab(parts[parts.length - 1] ?? n);
    for (let i = parts.length - 2; used.has(k) && i >= 0; i--) k = kebab(`${parts[i]}-${k}`);
    let final = k;
    for (let n2 = 2; used.has(final); n2++) final = `${k}-${n2}`;
    used.set(final, n);
    return final;
  });
}

/** The commands the gates layer reads: command-bar items by caption; without a bar, the buttons outside panels. */
function commandsOf(model, ctx) {
  const out = [];
  const seen = new Set();
  for (const bar of model.commandBars.filter((b) => !b.inPanel)) {
    for (const it of bar.items) {
      if (seen.has(it.caption)) continue;
      seen.add(it.caption);
      out.push({ caption: it.caption, ref: { canvas: it.caption, code: it.caption, by: "caption" }, note: `${bar.name} item ${it.key} (PA:${bar.itemsLine})${it.captionIsFormula ? "; TODO: the caption is a formula" : ""}`, enabled: it.enabled, visible: it.visible });
    }
  }
  if (!out.length) {
    for (const b of model.buttons.filter((x) => !x.inPanel && x.caption)) {
      if (seen.has(b.caption)) continue;
      seen.add(b.caption);
      const code = codeIdOf(ctx, b.name);
      out.push({ caption: b.caption, ref: { canvas: b.name, code: code ?? b.name }, note: `${b.name} (PA:${b.line})${code ? "" : "; TODO: no such data-testid in the feature folder"}`, enabled: b.displayMode, visible: b.visible });
    }
  }
  return out;
}

const needsSelection = (formula) => /Selected|IsBlank\(\s*loc/i.test(formula ?? "");

/** The `manifest.draft.ts` text. */
export function buildManifestDraft(model, ctx, opts) {
  const { slug, title, yaml, canvasVersion = DEFAULT_CANVAS_VERSION, date = "" } = opts;
  const { tables, collections } = resolveTables(model, ctx);
  const open = resolveOpen(model, ctx);
  const commands = commandsOf(model, ctx);
  const ref = (name) => {
    const code = codeIdOf(ctx, name);
    return { text: `{ canvas: ${S(name)}, code: ${S(code ?? name)} }`, todo: code ? "" : ` // TODO: no data-testid ${S(name)} in ${ctx.fragments.join(", ") || "a mapped feature folder"}` };
  };
  const L = [];
  const src = `ProjectDocs/_extracted/msapp/${ctx.app}/Src/${yaml}`;
  L.push("/**");
  L.push(` * DRAFT parity manifest: ${title} (\`e2e/harness/contract.ts\`, ScreenManifest).`);
  L.push(" *");
  L.push(` * Generated by \`node scripts/gen-parity-manifest.mjs ${S(yaml)} --app ${ctx.app} --slug ${slug}\`${date ? ` on ${date}` : ""} from`);
  L.push(` * \`${src}\` (${model.controlCount} controls). Rule map draft: \`ProjectDocs/app-docs/e2e/RULEMAP-${slug}.draft.md\`.`);
  L.push(` * Code app files whose test ids were matched: ${ctx.codeFiles.length ? ctx.codeFiles.map((f) => `\`${f}\``).join(", ") : "none (TODO: add the feature folder to MODULES in scripts/check-canvas-identities.mjs)"}.`);
  L.push(" *");
  L.push(" * The harness loads only `manifest.ts`. Review every TODO, write the steps the generator cannot know (how a panel or a");
  L.push(" * card is reached, each validation baseline, the write flows), then save this file as `manifest.ts` beside it. A step");
  L.push(" * left as `todo(...)` throws when it runs, so an unfinished state fails loudly instead of recording nothing. Running the");
  L.push(" * generator again overwrites this draft, never `manifest.ts`.");
  L.push(" */");
  L.push('import { existsSync, readFileSync } from "node:fs";');
  L.push('import { fileURLToPath } from "node:url";');
  L.push('import type { AppHandle, ScreenManifest } from "../../harness/contract";');
  L.push("");
  L.push("/** A step the generator could not write: it throws, naming what to fill in. */");
  L.push(`const todo = (what: string) => async (_app: AppHandle): Promise<void> => {`);
  L.push(`  throw new Error(\`TODO (${slug} manifest draft): \${what}\`);`);
  L.push("};");
  L.push("");
  L.push("/** No step: the state is the screen at rest. */");
  L.push("const atRest = async (_app: AppHandle): Promise<void> => {};");
  L.push("");
  const validated = model.inputs.filter((i) => i.errorLabels.length && i.family === "input");
  if (validated.length) {
    L.push("/** The standard validation probe list: the same inputs, in this order, in both apps. */");
    L.push(`const PROBES = ${S(PROBE_INPUTS)};`);
    L.push("");
  }
  L.push("/** The mutation proof's source edits (`scripts/parity-mutate.mjs`), kept in `mutations.json` beside this file. */");
  L.push('const MUTATIONS_FILE = fileURLToPath(new URL("./mutations.json", import.meta.url));');
  L.push('const mutations: ScreenManifest["mutations"] = existsSync(MUTATIONS_FILE) ? JSON.parse(readFileSync(MUTATIONS_FILE, "utf8")) : [];');
  L.push("");
  L.push("/** Every canvas control with an `AccessibleLabel`: [canvas name, code test id, the label verbatim, or null when it is a formula]. */");
  L.push("const ACCESSIBLE: readonly (readonly [string, string, string | null])[] = [");
  for (const a of model.accessible) {
    const code = codeIdOf(ctx, a.name);
    L.push(`  [${S(a.name)}, ${S(code ?? a.name)}, ${S(a.label)}], // PA:${a.line}${a.formula !== null ? ` formula: ${trimTo(comment(a.formula), 100)}` : ""}${code ? "" : "; TODO: code test id"}`);
  }
  L.push("];");
  L.push("");
  L.push("/** Every canvas control with a `Tooltip`: [canvas name, code test id, the hover text verbatim, or null when it is a formula]. */");
  L.push("const HOVER: readonly (readonly [string, string, string | null])[] = [");
  for (const t of model.tooltips) {
    const code = codeIdOf(ctx, t.name);
    L.push(`  [${S(t.name)}, ${S(code ?? t.name)}, ${S(t.tooltip)}], // PA:${t.line}${t.formula !== null ? ` formula: ${trimTo(comment(t.formula), 100)}` : ""}${code ? "" : "; TODO: code test id"}`);
  }
  L.push("];");
  L.push("");
  L.push("/** The aria-label each listed control renders (null when it is not on screen). Equal in both apps when the names are right. */");
  L.push("async function accessibleNames(app: AppHandle): Promise<Record<string, string | null>> {");
  L.push("  const out: Record<string, string | null> = {};");
  L.push("  for (const [canvas, code] of ACCESSIBLE) {");
  L.push("    const el = app.kind === \"canvas\" ? app.frame.locator(`[data-control-name='${canvas}']`).first() : app.frame.getByTestId(code).first();");
  L.push("    if ((await el.count()) === 0) { out[canvas] = null; continue; }");
  L.push("    const own = await el.getAttribute(\"aria-label\", { timeout: 2_000 }).catch(() => null);");
  L.push("    const inner = el.locator(\"[aria-label]\").first();");
  L.push("    out[canvas] = own ?? ((await inner.count()) > 0 ? await inner.getAttribute(\"aria-label\", { timeout: 2_000 }).catch(() => null) : null);");
  L.push("  }");
  L.push("  return out;");
  L.push("}");
  L.push("");
  L.push("export const manifest: ScreenManifest = {");
  L.push(`  slug: ${S(slug)},`);
  L.push(`  title: ${S(title)},`);
  L.push(`  canvasSource: { app: ${S(ctx.app)}, yaml: ${S(yaml)} },`);
  L.push(`  canvasVersion: ${S(canvasVersion)},`);
  for (const n of open.note) L.push(`  // open: ${n}`);
  L.push(`  open: ${openText(open.spec)},`);
  L.push("");
  L.push(`  // Tables the screen writes (Patch / Remove / RemoveIf / Collect / UpdateIf on a Dataverse table). Children first.`);
  if (collections.length) L.push(`  // Collections also written (not Dataverse, no TableSpec): ${collections.join(", ")}.`);
  L.push("  tables: [");
  for (const t of tables) {
    L.push(`    // ${t.display} (${t.logicalName}): ${[...t.ops].join(", ")} in ${t.sources.slice(0, 4).join("; ")}${t.sources.length > 4 ? `; +${t.sources.length - 4} more` : ""}`);
    const cols = [...t.columns.entries()].map(([d, c]) => (c ? `${c.logical}` : `${d}?`));
    if (cols.length) L.push(`    // columns written: ${cols.join(", ")}`);
    L.push("    {");
    L.push(`      name: ${S(t.name)},`);
    L.push(`      service: ${S(t.service ?? "TODO")},${t.service ? "" : " // TODO: no generated service for this entity set (pac code add-data-source)"}`);
    L.push(`      serviceModule: ${S(t.serviceModule ?? "TODO")},`);
    L.push(`      entitySet: ${S(t.entitySet)},`);
    L.push(`      primaryKey: ${S(t.primaryKey)},`);
    if (t.tagColumn) L.push(`      tagColumn: ${S(t.tagColumn)}, // TODO: confirm the string column the write flows type the PW-<run> tag into`);
    else if (!t.parent) L.push(`      // tagColumn: TODO (no string column found)`);
    if (t.parent) L.push(`      parent: { table: ${S(t.parent.table)}, lookup: ${S(t.parent.lookup)} }, // TODO: confirm (guessed from the lookup's name)`);
    if (t.projectLookup) L.push(`      projectLookup: ${S(t.projectLookup)},`);
    L.push(`      deleteOrder: ${t.deleteOrder},`);
    L.push("    },");
  }
  L.push("  ],");
  L.push("");
  const panel = model.panels.find((p) => p.save) ?? model.panels[0];
  L.push("  controls: {");
  if (panel?.save) { const r = ref(panel.save); L.push(`    save: ${r.text},${r.todo} // ${panel.name}`); }
  else L.push("    // save: TODO (no *_Save control inside a RightPanel container)");
  if (panel?.cancel) { const r = ref(panel.cancel); L.push(`    cancel: ${r.text},${r.todo}`); }
  else L.push("    // cancel: TODO (no *_Cancel control inside a RightPanel container)");
  const otherPanels = model.panels.filter((p) => p !== panel && (p.save || p.cancel));
  if (otherPanels.length) L.push(`    // TODO: more panels with their own Save / Cancel: ${otherPanels.map((p) => `${p.name} (${p.save ?? "-"} / ${p.cancel ?? "-"})`).join(", ")}`);
  if (model.galleries[0]) { const r = ref(model.galleries[0].name); L.push(`    restMarker: ${r.text}, // TODO: confirm a control visible only at rest${r.todo ? "; and its code test id" : ""}`); }
  else L.push("    // restMarker: TODO");
  L.push("    commands: {");
  for (const c of commands) L.push(`      ${S(c.caption)}: ${refText(c.ref)}, // ${c.note}`);
  L.push("    },");
  L.push("  },");
  L.push("");
  L.push("  // Verbatim: the *_ErrorMessage_* labels, hint / warning labels and Notify texts, in source order.");
  L.push("  messages: [");
  for (const m of model.messages) L.push(`    ${S(m.text)}, // ${m.source} (PA:${m.line})`);
  L.push("  ],");
  const templates = model.errorLabels.flatMap((e) => e.templates.map((t) => `${e.name}: ${t}`));
  if (templates.length) L.push(`  // TODO: messages with interpolated parts (not listed above): ${templates.map((t) => comment(t)).join(" | ")}`);
  L.push("");
  const stateNames = uniqueKeys([...model.panels.map((p) => p.name), ...model.galleries.map((g) => g.name), ...model.dialogs.map((d) => d.name)]);
  let si = 0;
  L.push("  visual: [");
  L.push('    { name: "default", steps: atRest },');
  for (const p of model.panels) L.push(`    { name: ${S(`panel-${stateNames[si++]}`)}, steps: todo(${S(`open ${p.name} (Visible: ${trimTo(oneLine(p.visible), 80)})`)}) }, // PA:${p.line}`);
  for (const g of model.galleries) L.push(`    { name: ${S(`gallery-${stateNames[si++]}`)}, steps: todo(${S(`open (unfold / select) one item of ${g.name}`)}) }, // PA:${g.line}`);
  for (const d of model.dialogs) L.push(`    { name: ${S(`dialog-${stateNames[si++]}`)}, steps: todo(${S(`show ${d.name} (Visible: ${trimTo(oneLine(d.visible), 80)}); never confirm it in a read lane`)}) }, // PA:${d.line}`);
  L.push("  ],");
  L.push("");
  const keys = uniqueKeys(validated.map((i) => i.name));
  L.push("  // One group per text input with an error label; every probe input is typed into the field, in order.");
  const dated = model.inputs.filter((i) => i.errorLabels.length && i.family !== "input");
  if (dated.length) L.push(`  // Date pickers with an error label (no probe list; TODO a group of their own if needed): ${dated.map((i) => `${i.name} (${i.errorLabels.join(", ")})`).join(", ")}`);
  L.push("  validation: [");
  validated.forEach((inp, k) => {
    const code = codeIdOf(ctx, inp.name);
    const msgs = model.errorLabels.filter((e) => e.input === inp.name).flatMap((e) => e.messages);
    L.push(`    // ${inp.name} (PA:${inp.line}), ${inp.errorLabels.join(", ")}: ${msgs.map((m) => S(m)).join(" / ") || "TODO (formula texts)"}`);
    L.push(`    { key: ${S(keys[k])}, field: ${S(inp.name)},${code ? "" : ` codeField: ${S(inp.name)} /* TODO: the code app's test id */,`} baseline: todo(${S(`open the panel holding ${inp.name} and reach a state where only this field decides the messages and Save`)}), inputs: PROBES },`);
  });
  const unvalidated = model.inputs.filter((i) => !i.errorLabels.length && i.family === "input").map((i) => i.name);
  if (unvalidated.length) L.push(`    // Inputs without an error label (no group): ${unvalidated.join(", ")}`);
  L.push("  ],");
  L.push("");
  L.push("  // `rest` reads every command at rest; a command whose gate needs a selection gets its own state.");
  L.push("  gates: [");
  L.push('    { name: "rest", steps: atRest },');
  const gateNames = new Set();
  for (const c of commands.filter((x) => needsSelection(x.enabled))) {
    let n = `select-for-${kebab(c.caption)}`;
    for (let i = 2; gateNames.has(n); i++) n = `select-for-${kebab(c.caption)}-${i}`;
    gateNames.add(n);
    L.push(`    { name: ${S(n)}, steps: todo(${S(`select what "${c.caption}" needs (enabled: ${trimTo(oneLine(c.enabled), 100)})`)}) },`);
  }
  L.push("  ],");
  L.push("");
  L.push("  ux: [");
  L.push('    { name: "accessible-names", run: accessibleNames },');
  L.push(`    // HOVER lists ${model.tooltips.length} hover texts; reading a tooltip needs a hover per control.`);
  L.push('    { name: "hover-texts", lane: "canvas-C", run: async (app: AppHandle) => { await todo(`hover each of the ${HOVER.length} HOVER controls and read its tooltip`)(app); return null; } },');
  L.push("  ],");
  L.push("");
  L.push(`  // TODO: one Flow per write path (create, edit, delete), see the rule map's section F (${model.writes.filter((w) => ctx.dataSources.has(w.target)).length} Dataverse writes).`);
  L.push("  flows: [],");
  L.push("  known: {},");
  L.push("  artefacts: [],");
  L.push("  budgets: {},");
  L.push("  mutations,");
  L.push("};");
  L.push("");
  return L.join("\n");
}

function refText(r) {
  return `{ canvas: ${S(r.canvas)}, code: ${S(r.code)}${r.by ? `, by: ${S(r.by)}` : ""} }`;
}
function openText(o) {
  if (o.app === "cost") return `{ app: "cost", canvasMenu: ${S(o.canvasMenu)}, codeRoute: ${S(o.codeRoute)} }`;
  if (o.app === "admin") return `{ app: "admin", leftMenuLabel: ${S(o.leftMenuLabel)}, codeRoute: ${S(o.codeRoute)} }`;
  return `{ app: "pm", canvasScreen: ${S(o.canvasScreen)}, codeRoute: ${S(o.codeRoute)} }`;
}

/* ───────────────────────────────────────────────────────── rule map ── */

const md = (s, n = 260) => {
  const t = trimTo(oneLine(s ?? ""), n).replace(/\|/g, "\\|");
  if (!t) return "(none)";
  return t.includes("`") ? `\`\` ${t} \`\`` : `\`${t}\``;
};

/** The `RULEMAP-<slug>.draft.md` text, in the shape of `RULEMAP-land-lease.md`. */
export function buildRuleMap(model, ctx, opts) {
  const { slug, title, yaml, date = "" } = opts;
  const { tables, collections } = resolveTables(model, ctx);
  const open = resolveOpen(model, ctx);
  const L = [];
  const rows = [];
  const section = (letter, heading, items) => {
    L.push(`### ${letter}. ${heading}`, "");
    if (!items.length) { L.push("None in the YAML.", ""); return; }
    L.push("| # | Canvas control.property | Live Power Fx | Code-app function | UT | Playwright | Status |", "|---|---|---|---|---|---|---|");
    items.forEach((r, k) => { rows.push(r); L.push(`| ${letter}${k + 1} | ${r.where} | ${r.fx} | TODO | TODO | TODO | TODO${r.note ? `: ${r.note}` : ""} |`); });
    L.push("");
  };
  L.push(`# Rule map draft: ${title} (Power Fx vs code app TypeScript)`, "");
  L.push(`**Draft**, generated by \`node scripts/gen-parity-manifest.mjs ${S(yaml)} --app ${ctx.app} --slug ${slug}\`${date ? ` on ${date}` : ""}. Every`);
  L.push("code, UT and Playwright column is TODO: fill each by reading the code app, then merge the rows into `RULEMAP-" + slug + ".md`");
  L.push("(or rename this file to it when there is none). Running the generator again overwrites this draft.");
  L.push("Shape follows `RULEMAP-land-lease.md`.", "");
  L.push("**Sources**");
  L.push(`- Canvas (ground truth): \`ProjectDocs/_extracted/msapp/${ctx.app}/Src/${yaml}\` (${model.controlCount} controls). Cited \`PA:<line>\`.`);
  L.push(`- Opened by: ${open.spec.app === "cost" ? `the Cost app's left menu "${open.spec.canvasMenu}"` : open.spec.app === "admin" ? `Application Settings, "${open.spec.leftMenuLabel}"` : `the PM app, screen "${open.spec.canvasScreen}"`}; code route \`${open.spec.codeRoute}\`.`);
  L.push(`- Code app files matched for test ids: ${ctx.codeFiles.length ? ctx.codeFiles.map((f) => `\`${f}\``).join(", ") : "none (TODO)"}.`);
  L.push(`- Manifest draft: \`ProjectCosts-CodeApp/e2e/screens/${slug}/manifest.draft.ts\`.`, "");
  L.push("**Method:** the YAML was read with `scripts/lib/paYaml.mjs`. Every formula below is the live one: `/* */` and `//`");
  L.push("comments are removed first (CONVENTIONS rule 10). Long formulas are collapsed to one line and trimmed.", "");
  L.push(`**Counts:** ${model.controlCount} controls · ${model.inputs.length} inputs (${model.inputs.filter((i) => i.errorLabels.length).length} with an error label) · ${model.messages.length} messages · ${model.commandBars.reduce((n, b) => n + b.items.length, 0)} command-bar items · ${model.buttons.length} buttons · ${tables.length} Dataverse tables written.`, "");
  L.push("---", "", "## 1. Rule rows", "");

  section("A", "Load, galleries and timers", [
    ...model.screenEvents.map((e) => ({ where: `\`${model.screenName}.${e.property}\` (PA:${e.line})`, fx: md(e.formula) })),
    ...model.galleries.map((g) => ({ where: `\`${g.name}.Items\` (PA:${g.itemsLine})`, fx: md(g.items) })),
    ...model.timers.map((t) => ({ where: `\`${t.name}.OnTimerEnd\` (PA:${t.line})`, fx: md(t.onTimerEnd), note: `Start: ${md(t.start, 60)}` })),
  ]);
  section("B", "Commands and gates", [
    ...model.commandBars.flatMap((b) => [
      ...b.items.flatMap((it) => [
        { where: `\`${b.name}\` item \`${it.key}\` "${it.caption.replace(/\|/g, "\\|")}" ItemEnabled (PA:${b.itemsLine})`, fx: md(it.enabled || "true") },
        ...(it.visible ? [{ where: `\`${b.name}\` item \`${it.key}\` ItemVisible (PA:${b.itemsLine})`, fx: md(it.visible) }] : []),
      ]),
      ...(b.onSelect ? [{ where: `\`${b.name}.OnSelect\` (PA:${b.onSelectLine})`, fx: md(b.onSelect, 400) }] : []),
    ]),
    ...model.buttons.flatMap((b) => [
      ...(b.onSelect ? [{ where: `\`${b.name}\`${b.caption ? ` "${b.caption.replace(/\|/g, "\\|")}"` : ""} OnSelect (PA:${b.onSelectLine})`, fx: md(b.onSelect) }] : []),
      ...(b.displayMode && !TRIVIAL.has(b.displayMode) ? [{ where: `\`${b.name}.DisplayMode\``, fx: md(b.displayMode) }] : []),
    ]),
  ]);
  section("C", "Validation (inputs and their error labels)", model.errorLabels.flatMap((e) => [
    { where: `\`${e.name}.Visible\` (PA:${e.visibleLine}) for \`${e.input ?? "TODO: input not found"}\``, fx: md(e.visible) },
    { where: `\`${e.name}.Text\` (PA:${e.textLine})`, fx: md(e.text), note: e.messages.length ? `verbatim: ${e.messages.map((m) => `"${m.replace(/\|/g, "\\|")}"`).join(" / ")}` : "" },
  ]));
  section("D", "Dropdowns, toggles and other fields", [
    ...model.dropdowns.flatMap((d) => [
      { where: `\`${d.name}.Items\` (PA:${d.itemsLine})`, fx: md(d.items) },
      ...(d.defaultSelected ? [{ where: `\`${d.name}\` default`, fx: md(d.defaultSelected) }] : []),
      ...(d.onChange ? [{ where: `\`${d.name}.OnChange\``, fx: md(d.onChange) }] : []),
    ]),
    ...model.toggles.flatMap((t) => [
      { where: `\`${t.name}\` (${t.type}, PA:${t.line}) label "${String(t.label).replace(/\|/g, "\\|")}"`, fx: md(t.checked || "(no default)") },
      ...(t.onChange ? [{ where: `\`${t.name}.OnChange\``, fx: md(t.onChange) }] : []),
    ]),
    ...model.inputs.filter((i) => i.onChange).map((i) => ({ where: `\`${i.name}.OnChange\` (PA:${i.line})`, fx: md(i.onChange) })),
  ]);
  section("E", "Visible and DisplayMode (live formulas)", model.visibility
    .filter((v) => !["button", "commandbar"].includes(v.family) && !/ErrorMessage/i.test(v.name))
    .map((v) => ({ where: `\`${v.name}.${v.property}\` (PA:${v.line})`, fx: md(v.formula) })));
  section("F", "Writes", model.writes.map((w) => {
    const t = tables.find((x) => x.display === w.target);
    const where = `\`${w.control}.${w.property}\` (PA:${w.line}) ${w.fn}`;
    if (!t) return { where, fx: md(`${w.fn}(${w.target}, …)`), note: "collection, not Dataverse" };
    const cols = w.columns.map((c) => { const m = t.columns.get(c); return m ? `${c} = ${m.logical}` : `${c} = TODO`; }).join(", ");
    return { where, fx: md(`${w.fn}('${w.target}', …)`), note: `\`${t.logicalName}\` / \`${t.entitySet}\` / ${t.service ? `\`${t.service}\`` : "no generated service"}${cols ? `; columns: ${cols.replace(/\|/g, "\\|")}` : ""}` };
  }));
  section("G", "Accessible labels and hover texts", [
    ...model.accessible.map((a) => ({ where: `\`${a.name}.AccessibleLabel\` (PA:${a.line})`, fx: a.label !== null ? md(`"${a.label}"`) : md(a.formula), note: codeIdOf(ctx, a.name) ? "" : "no code data-testid with this name" })),
    ...model.tooltips.map((t) => ({ where: `\`${t.name}.Tooltip\` (PA:${t.line})`, fx: t.tooltip !== null ? md(`"${t.tooltip}"`) : md(t.formula) })),
  ]);
  section("H", "Confirmation dialogs", model.dialogs.flatMap((d) => [
    { where: `\`${d.name}\` Title / Description (PA:${d.line})`, fx: md(`${d.title} · ${d.description}`) },
    { where: `\`${d.name}.OnConfirm\` (PA:${d.onConfirmLine})`, fx: md(d.onConfirm, 400) },
  ]));

  L.push("## 2. Verbatim messages", "");
  if (model.messages.length) for (const m of model.messages) L.push(`- "${m.text}" (\`${m.source}\`, PA:${m.line})`);
  else L.push("None found.");
  L.push("", "## 3. Tables written", "");
  if (tables.length) {
    L.push("| Canvas name | Logical name | Entity set | Generated service | Primary key | Parent (guess) | Project lookup | Delete order |", "|---|---|---|---|---|---|---|---|");
    for (const t of tables) L.push(`| ${t.display} | \`${t.logicalName}\` | \`${t.entitySet}\` | ${t.service ? `\`${t.service}\`` : "TODO"} | \`${t.primaryKey}\` | ${t.parent ? `${t.parent.table} via \`${t.parent.lookup}\`` : "none"} | ${t.projectLookup ? `\`${t.projectLookup}\`` : "none"} | ${t.deleteOrder} |`);
  } else L.push("None (a read-only screen).");
  if (collections.length) L.push("", `Collections written (client-side only): ${collections.map((c) => `\`${c}\``).join(", ")}.`);
  L.push("", "## 4. Open points (TODO)", "");
  L.push("- Fill the code-app function, UT and Playwright columns; set each Status (Matched / Missing in code / Extra in code / Divergent, marked / Divergent, unmarked / Not testable).");
  L.push("- Check every hidden control, `Select()` subroutine and `fn_*` component the screen calls (CONVENTIONS, Before every build, item 2): the generator lists formulas, it does not follow them.");
  L.push("- Check the server-side flows and plugins the writes trigger (`ProjectDocs/migration-plans/04-flow-inventory.md`).");
  L.push("");
  return L.join("\n");
}

/* ─────────────────────────────────────────────────────────────── CLI ── */

/** Resolves the YAML argument to `{ file, app, yaml }`. */
export function locateYaml(arg, app) {
  const name = arg.endsWith(".pa.yaml") ? arg : `${arg}.pa.yaml`;
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    const abs = path.resolve(arg);
    const a = app ?? (/[\\/]projectmanagement[\\/]/.test(abs) ? "projectmanagement" : "projectcosts");
    return { file: abs, app: a, yaml: path.basename(abs) };
  }
  for (const a of app ? [app] : ["projectcosts", "projectmanagement"]) {
    const f = path.join(MSAPP, a, "Src", name);
    if (fs.existsSync(f)) return { file: f, app: a, yaml: name };
  }
  throw new Error(`canvas screen not found: ${arg} (looked in ${MSAPP}/${app ?? "{projectcosts,projectmanagement}"}/Src)`);
}

/** Reads the screen, writes both drafts, returns their paths and the counts. */
export function generate({ yaml: arg, app, slug, outDir = path.join(APP, "e2e/screens"), rulemapDir = path.join(WORKSPACE, "ProjectDocs/app-docs/e2e"), canvasVersion, date, root = APP }) {
  const loc = locateYaml(arg, app);
  const model = extractScreen(fs.readFileSync(loc.file, "utf8"));
  const ctx = loadContext({ app: loc.app, screenName: model.screenName, root });
  const nav = ctx.canvasNav.find((e) => e.target === model.screenName);
  const theSlug = slug ?? kebab(model.screenName.replace(/\s+Screen$/i, ""));
  const title = nav ? nav.caption.trim() : model.screenName.replace(/\s+Screen$/i, "");
  const opts = { slug: theSlug, title, yaml: loc.yaml, canvasVersion, date };
  const manifestFile = path.join(outDir, theSlug, "manifest.draft.ts");
  const ruleMapFile = path.join(rulemapDir, `RULEMAP-${theSlug}.draft.md`);
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.mkdirSync(rulemapDir, { recursive: true });
  fs.writeFileSync(manifestFile, buildManifestDraft(model, ctx, opts));
  fs.writeFileSync(ruleMapFile, buildRuleMap(model, ctx, opts));
  return {
    manifestFile, ruleMapFile, slug: theSlug, app: loc.app,
    counts: {
      controls: model.controlCount, inputs: model.inputs.length, errorLabels: model.errorLabels.length, messages: model.messages.length,
      commands: commandsOf(model, ctx).length, tables: resolveTables(model, ctx).tables.length, codeIds: ctx.codeIds.size,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
  const app = opt("--app");
  const slug = opt("--slug");
  const outDir = opt("--out-dir");
  const rulemapDir = opt("--rulemap-dir");
  const canvasVersion = opt("--canvas-version");
  const date = opt("--date") ?? new Date().toISOString().slice(0, 10);
  const yaml = argv.find((a) => !a.startsWith("--"));
  if (!yaml || (app && !["projectcosts", "projectmanagement"].includes(app))) {
    console.error('usage: node scripts/gen-parity-manifest.mjs "<Screen>.pa.yaml" [--app projectcosts|projectmanagement] [--slug <slug>] [--out-dir e2e/screens] [--rulemap-dir <dir>] [--canvas-version x.y.z] [--date YYYY-MM-DD]');
    process.exit(2);
  }
  try {
    const r = generate({ yaml, app, slug, outDir: outDir && path.resolve(outDir), rulemapDir: rulemapDir && path.resolve(rulemapDir), canvasVersion, date });
    console.log(`parity manifest draft (${r.app}, ${r.slug}):`);
    console.log(`  ${path.relative(process.cwd(), r.manifestFile)}`);
    console.log(`  ${path.relative(process.cwd(), r.ruleMapFile)}`);
    console.log(`  ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
