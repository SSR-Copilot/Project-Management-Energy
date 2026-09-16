#!/usr/bin/env node
/**
 * extract-canvas-labels.mjs — build the canvas label corpus for the G-LABEL gate.
 *
 *   node scripts/extract-canvas-labels.mjs [--src <dir>...] [--out <file>] [--quiet]
 *
 * Reads the extracted canvas source (`*.pa.yaml` screens plus `Components/*.pa.yaml`)
 * of the two source apps and writes `reference/canvas-labels.json`: every literal
 * user-visible string that the canvas puts on screen, keyed by screen, control and
 * property so a reviewer can go straight back to the source.
 *
 * DEFAULT SOURCES
 *   /home/claude/vsb/pm/Src     (Project Management app)
 *   /home/claude/vsb/cost/Src   (Project Costs app)
 * Override with --src; missing directories are reported and skipped.
 *
 * WHAT COUNTS AS A LABEL PROPERTY
 *   Text · HintText · Tooltip · Title · Label · ItemText · PlaceholderText
 * on any control, on any screen, and on any component instance. Inside a
 * `ComponentDefinitions` block the same names are also read from
 * `CustomProperties.<Name>.Default`, because that default IS the shipped string when
 * an instance does not override it (e.g. `cmp_PopUp_Confirmation.CancelButtonText`
 * is not in the list, but `…Title.Default` is the popup's title).
 *
 * HOW STRINGS ARE PULLED OUT OF POWER FX
 *   The property value is a Power Fx expression, not a string. It is tokenised:
 *     - `"…"` string literals (with `""` as an escaped quote) are taken whole;
 *     - `$"…{expr}…"` interpolated strings contribute each literal TEXT SEGMENT
 *       between the holes, and the holes are parsed recursively so that
 *       `$"{If(x,"Deactivate","Activate")} checklist item?"` yields "Deactivate",
 *       "Activate" and " checklist item?";
 *     - `//` and block comments are stripped first, so commented-out strings do not
 *       enter the corpus.
 *   Segment strings keep their leading/trailing spaces — that is what the canvas
 *   concatenates — and are recorded with `kind: "segment"`.
 *
 * WHAT IS EXCLUDED (and why)
 *   - control names: /^(txt|drp|cmb|pcf|dte|lbl|btn|con|tgl|rad|chk|gal|img|icn|tmr|
 *     cmp|shp|htm|slr|frm)_/ — these are `Self`/control references written as strings
 *     in a few properties, never shown to a user;
 *   - bare numbers (`42`, `-3.5`, `1,5`);
 *   - the literal `*` (the required-field asterisk drawn as its own label);
 *   - the literal `ToolTip` (a property-name string used as a map key);
 *   - empty and whitespace-only strings (nothing is visible).
 *   Everything else is kept, including strings that a human would call data rather
 *   than a label (state names, colour hexes). The gate compares text, so a few
 *   non-labels in the corpus cost nothing; silently dropping real labels would.
 *
 * FOUR AUXILIARY INDEXES (merged into the lookup index, NOT counted in the totals — see
 * each function's own comment): the `App.OnStart` message resources (`gblAppResx.*` and
 * scalar globals), record-field literals (`<control>.<Property>.<Field>`), the display
 * properties this app really uses that are not in the list above (`Description`,
 * `ConfirmButtonText`, `CancelButtonText`, `Placeholder`, `InputTextPlaceholder`,
 * `Header`), and prose literals built inside `On…` behaviour formulas. Keeping them out
 * of the totals is deliberate: the seven-property counts stay comparable with an
 * independent pass over the same property set.
 *
 * The YAML is read with a purpose-built indentation scanner rather than a YAML
 * library: `.pa.yaml` is a strict subset (block mappings, `- name:` sequence items,
 * `|`/`|-` block scalars) and the repo has no YAML dependency. Long formulas may be
 * one physical line or a block scalar; both are handled.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LABEL_PROPERTIES = [
  "Text",
  "HintText",
  "Tooltip",
  "Title",
  "Label",
  "ItemText",
  "PlaceholderText",
];
const LABEL_PROPERTY_SET = new Set(LABEL_PROPERTIES);

/**
 * AUXILIARY display properties. The seven names above are the brief's list; these are the
 * properties this app actually uses for the same job, and the corpus would be wrong
 * without them:
 *   Description        the BODY text of every `cmp_PopUp_Confirmation` instance
 *   ConfirmButtonText  / CancelButtonText — the dialog's two button captions
 *   Placeholder / InputTextPlaceholder — the app's placeholder properties (`PlaceholderText`
 *                      is in the brief's list but does not occur in this source at all)
 *   Header             one card header
 * They are collected into `auxProperties`, merged into the lookup index, and reported
 * separately so the seven-property totals stay comparable with an independent pass.
 */
const AUX_PROPERTIES = [
  "Description",
  "ConfirmButtonText",
  "CancelButtonText",
  "Placeholder",
  "InputTextPlaceholder",
  "Header",
];
const AUX_PROPERTY_SET = new Set(AUX_PROPERTIES);

const CONTROL_NAME_RE =
  /^(txt|drp|cmb|pcf|dte|lbl|btn|con|tgl|rad|chk|gal|img|icn|tmr|cmp|shp|htm|slr|frm)_/;
const BARE_NUMBER_RE = /^[+-]?[0-9]+([.,][0-9]+)?$/;

const DEFAULT_SOURCES = [
  { app: "pm", dir: "/home/claude/vsb/pm/Src" },
  { app: "cost", dir: "/home/claude/vsb/cost/Src" },
];

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

/** Unescape a YAML single- or double-quoted flow scalar into its real text. */
function unquoteYamlScalar(raw) {
  const s = raw.trim();
  if (s.startsWith("'")) {
    const body = s.slice(1, s.endsWith("'") ? -1 : undefined);
    return body.replace(/''/g, "'");
  }
  const body = s.slice(1, s.endsWith('"') && s.length > 1 ? -1 : undefined);
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "\\") {
      out += body[i];
      continue;
    }
    const c = body[(i += 1)];
    if (c === "n") out += "\n";
    else if (c === "t") out += "\t";
    else if (c === "r") out += "\r";
    else if (c === "0") out += "\0";
    else if (c === "u") {
      out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (c === "x") {
      out += String.fromCharCode(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
    } else out += c; // \\ \" \/ and anything else
  }
  return out;
}

/**
 * Walk a `.pa.yaml` file and hand every scalar mapping entry to `onEntry` with the
 * stack of enclosing keys.
 *
 * `stack` entries are `{ key, indent, seq }` where `seq` marks a `- key:` item —
 * which in `.pa.yaml` is always a control (the items of a `Children:` sequence).
 */
function scanYaml(text, onEntry) {
  const lines = text.split(/\r?\n/);
  const stack = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;

    const m = /^(\s*)(-\s+)?([A-Za-z_][A-Za-z0-9_ .'@\-/]*?):(\s|$)(.*)$/.exec(raw);
    if (!m) continue;
    const indentOfKey = m[1].length + (m[2] ? m[2].length : 0);
    const isSeq = Boolean(m[2]);
    const key = m[3].trim().replace(/^'(.*)'$/, "$1");
    let value = m[5] ?? "";

    while (stack.length && stack[stack.length - 1].indent >= indentOfKey) stack.pop();

    // Block scalar: gather the indented body that follows.
    if (/^[|>][-+]?\d*\s*$/.test(value.trim())) {
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const l = lines[j];
        if (!l.trim()) {
          body.push("");
          continue;
        }
        const ind = l.length - l.trimStart().length;
        if (ind <= indentOfKey) break;
        body.push(l);
      }
      i = j - 1;
      value = body.join("\n");
      onEntry(stack, key, value, indentOfKey, i + 1);
      continue;
    }

    // YAML flow scalar: `Text: "=If(\n  … \"Poland\" …)"` — a 1 000-line formula on one
    // physical line, with \n and \" as two-character escapes. Unescape before parsing.
    const flow = value.trim();
    if (flow.startsWith('"') || flow.startsWith("'")) {
      onEntry(stack, key, unquoteYamlScalar(flow), indentOfKey, i + 1);
      continue;
    }

    if (value.trim() === "") {
      // A nested mapping (or an empty value). Push and keep walking.
      stack.push({ key, indent: indentOfKey, seq: isSeq });
      continue;
    }
    onEntry(stack, key, value, indentOfKey, i + 1);
    // A key with an inline value can still be a parent in .pa.yaml? It cannot.
  }
}

/* ────────────────────────────────────────────────── Power Fx literal extraction ── */

/** Strip `//` line comments and `/* … *\/` blocks that are outside string literals. */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      // copy the whole string literal, honouring "" escapes
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') {
          out += '""';
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Collect every string literal and every interpolated text segment in a Power Fx
 * expression, in source order. Returns `[{ text, kind }]` with kind
 * `"literal"` | `"segment"`.
 */
function extractFxStrings(expression) {
  const src = stripComments(expression);
  const found = [];
  let i = 0;

  function readPlainString() {
    // src[i] === '"'
    i += 1;
    let buf = "";
    while (i < src.length) {
      if (src[i] === '"') {
        if (src[i + 1] === '"') {
          buf += '"';
          i += 2;
          continue;
        }
        i += 1;
        return buf;
      }
      buf += src[i];
      i += 1;
    }
    return buf;
  }

  function readInterpolated() {
    // src[i] === '$' and src[i+1] === '"'
    i += 2;
    let buf = "";
    const segments = [];
    while (i < src.length) {
      const c = src[i];
      if (c === '"') {
        if (src[i + 1] === '"') {
          buf += '"';
          i += 2;
          continue;
        }
        i += 1;
        break;
      }
      if (c === "{") {
        if (src[i + 1] === "{") {
          buf += "{";
          i += 2;
          continue;
        }
        segments.push(buf);
        buf = "";
        // Consume the hole, recursing into it so nested literals are captured.
        i += 1;
        const start = i;
        let depth = 1;
        while (i < src.length && depth > 0) {
          const d = src[i];
          if (d === '"') {
            readPlainString();
            continue;
          }
          if (d === "$" && src[i + 1] === '"') {
            readInterpolated();
            continue;
          }
          if (d === "{") depth += 1;
          else if (d === "}") depth -= 1;
          i += 1;
        }
        const hole = src.slice(start, Math.max(start, i - 1));
        for (const nested of extractFxStrings(hole)) found.push(nested);
        continue;
      }
      if (c === "}" && src[i + 1] === "}") {
        buf += "}";
        i += 2;
        continue;
      }
      buf += c;
      i += 1;
    }
    segments.push(buf);
    for (const s of segments) found.push({ text: s, kind: "segment" });
  }

  while (i < src.length) {
    const c = src[i];
    if (c === "$" && src[i + 1] === '"') {
      readInterpolated();
      continue;
    }
    if (c === '"') {
      const t = readPlainString();
      found.push({ text: t, kind: "literal" });
      continue;
    }
    i += 1;
  }
  return found;
}

/* ─────────────────────────────────────────────────── app-level message resources ── */

/**
 * `App.OnStart` keeps two kinds of shipped string that no control property holds:
 *
 *   Set(gblAppResx, {NumericOneDecimals: "Numeric value with maximum of one decimals", …})
 *   Set(gblTextControllingSecurityRoleName, "VSB - Functional Approval Confirmation")
 *
 * The first is the app's message resource table — several code-app `MSG` entries cite it
 * by name — and the second is a scalar global. Both are collected here as
 * `<global>.<Field>` and `App.<global>` and merged into the lookup index, but they are
 * NOT counted in the label-property totals: they are not one of the seven properties.
 */
function extractResourceGlobals(text) {
  const src = stripComments(text);
  const out = [];
  const re = /\bSet\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    // Read the balanced argument list.
    let depth = 1;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '"') {
        i += 1;
        while (i < src.length) {
          if (src[i] === '"' && src[i + 1] === '"') {
            i += 2;
            continue;
          }
          if (src[i] === '"') break;
          i += 1;
        }
      } else if (c === "(" || c === "{") depth += 1;
      else if (c === ")" || c === "}") depth -= 1;
      i += 1;
    }
    const args = src.slice(start, i - 1);
    const comma = topLevelComma(args);
    if (comma < 0) continue;
    const name = args.slice(0, comma).trim();
    if (!/^gbl[A-Za-z0-9_]*$/.test(name)) continue;
    const value = args.slice(comma + 1).trim();

    const scalar = /^"((?:[^"]|"")*)"$/.exec(value);
    if (scalar) {
      out.push({ control: "App", property: name, text: scalar[1].replace(/""/g, '"') });
      continue;
    }
    if (!value.startsWith("{") || !value.endsWith("}")) continue;
    const body = value.slice(1, -1);
    const fields = [...body.matchAll(/([A-Za-z_][\w]*)\s*:\s*"((?:[^"]|"")*)"\s*(?:,|$)/g)];
    if (!fields.length) continue;
    // A resource table is a record whose every field is a plain string literal.
    const fieldCount = topLevelFieldCount(body);
    if (fieldCount !== fields.length) continue;
    for (const f of fields) {
      out.push({ control: name, property: f[1], text: f[2].replace(/""/g, '"') });
    }
  }
  return out;
}

function topLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '"') {
      i += 1;
      while (i < s.length && s[i] !== '"') i += 1;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth += 1;
    else if (c === ")" || c === "}" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) return i;
  }
  return -1;
}

function topLevelFieldCount(body) {
  let depth = 0;
  let n = body.trim() ? 1 : 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '"') {
      i += 1;
      while (i < body.length && body[i] !== '"') i += 1;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth += 1;
    else if (c === ")" || c === "}" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) n += 1;
  }
  return n;
}

/* ────────────────────────────────────────────────── behaviour-formula messages ── */

/**
 * Toasts, spinner texts and dialog bodies that a BEHAVIOUR formula builds:
 *
 *   OnSelect: … Notify("Hedged Volume exceeds 100% in total in a specific timeframe.", …)
 *   OnChange: … UpdateContext({locSpinnerInformationText: "Please wait, saving costs..."})
 *
 * Every `On…` property is tokenised like a label property, and the PROSE literals — two
 * or more words with a letter in them — are indexed under `<control>.<On…Property>`.
 * Single words are dropped: in a behaviour formula they are column names, choice names
 * and format masks, not messages. Uncounted, like the other auxiliary sources.
 */
function isProse(text) {
  return /[A-Za-z]/.test(text) && /\S\s\S/.test(text.trim());
}

/* ─────────────────────────────────────────────── record-field message literals ── */

/**
 * Some shipped strings are never written on a label property: the canvas builds a
 * validation table and displays its rows, so the text lives in a RECORD FIELD inside a
 * behaviour formula —
 *
 *   ForAll(colDuplicateSubaccounts As Current, …, {Comment: " is duplicated. …"})
 *   Table({TabName: "Grid Operator", …}, {TabName: "Grid Connection", …})
 *
 * Those are collected from EVERY property of a control (not just the seven label
 * properties) whenever the field name is one a user reads, and recorded as
 * `<control>.<Property>.<Field>` so a provenance comment can cite them. Like the
 * App.OnStart resources they are merged into the lookup index but are NOT counted in the
 * label-property totals.
 */
const MESSAGE_FIELDS = [
  "Comment",
  "Category",
  "Message",
  "ErrorMessage",
  "ValidationMessage",
  "Description",
  "Title",
  "TabName",
  "ItemDisplayName",
  "DisplayName",
  "Header",
  "Caption",
  "Label",
  "Placeholder",
  "HintText",
  "Tooltip",
];
const MESSAGE_FIELD_RE = new RegExp(
  // an exact name from the list, or any identifier ending in one of them
  // (`locSpinnerInformationText`, `locLongOperationDialogText`)
  `\\b((?:[A-Za-z_][\\w]*?)?(?:${MESSAGE_FIELDS.join("|")}))\\s*:\\s*"((?:[^"]|"")*)"`,
  "g",
);

function extractRecordFields(expression) {
  const out = [];
  for (const m of stripComments(expression).matchAll(MESSAGE_FIELD_RE)) {
    out.push({ field: m[1], text: m[2].replace(/""/g, '"') });
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────────── filtering ── */

function isExcluded(text) {
  if (text.trim() === "") return "empty";
  if (CONTROL_NAME_RE.test(text.trim())) return "control-name";
  if (BARE_NUMBER_RE.test(text.trim())) return "bare-number";
  if (text.trim() === "*") return "asterisk";
  if (text.trim() === "ToolTip") return "tooltip-key";
  return null;
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

/** Screen + nearest control for an entry, or null if it is not inside a control. */
function controlContext(stack, _key) {
  const root = stack[0]?.key;
  if (root !== "Screens" && root !== "ComponentDefinitions") return null;
  const screen = stack[1]?.key;
  if (!screen) return null;
  const parent = stack[stack.length - 1];
  if (!parent || parent.key !== "Properties") return null;
  for (let i = stack.length - 1; i >= 2; i -= 1) {
    if (stack[i].seq) return { screen, control: stack[i].key };
  }
  return { screen, control: screen };
}

/** Work out screen / control / property for one scalar entry, or null if not a label. */
function classify(stack, key) {
  // Root container: Screens: | ComponentDefinitions:
  const root = stack[0]?.key;
  if (root !== "Screens" && root !== "ComponentDefinitions") return null;
  const screen = stack[1]?.key;
  if (!screen) return null;

  // The nearest sequence item is the control; component-definition roots have none.
  let control = null;
  for (let i = stack.length - 1; i >= 2; i -= 1) {
    if (stack[i].seq) {
      control = stack[i].key;
      break;
    }
  }

  // Case A — a property inside a control's (or a screen's) `Properties:` block.
  const parent = stack[stack.length - 1];
  if (parent && parent.key === "Properties" && LABEL_PROPERTY_SET.has(key)) {
    return {
      screen,
      control: control ?? screen,
      property: key,
      scope: control ? "control" : "screen",
    };
  }
  if (parent && parent.key === "Properties" && AUX_PROPERTY_SET.has(key)) {
    return {
      screen,
      control: control ?? screen,
      property: key,
      scope: "aux",
      aux: true,
    };
  }

  // Case B — `ComponentDefinitions.<cmp>.CustomProperties.<Name>.Default`.
  if (
    root === "ComponentDefinitions" &&
    key === "Default" &&
    stack.length >= 4 &&
    stack[2]?.key === "CustomProperties" &&
    (LABEL_PROPERTY_SET.has(stack[3]?.key) || AUX_PROPERTY_SET.has(stack[3]?.key))
  ) {
    return {
      screen,
      control: screen,
      property: `${stack[3].key}.Default`,
      scope: "component-default",
      aux: !LABEL_PROPERTY_SET.has(stack[3].key),
    };
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = args.sources.length
    ? args.sources.map((d) => ({ app: basename(resolve(d, "..")), dir: resolve(d) }))
    : DEFAULT_SOURCES;
  const outFile = resolve(args.outFile ?? join(REPO_ROOT, "reference/canvas-labels.json"));

  const entries = [];
  const resources = [];
  const recordFields = [];
  const auxProperties = [];
  const behaviourLiterals = {};
  const behaviourScreens = {};
  const excluded = { empty: 0, "control-name": 0, "bare-number": 0, asterisk: 0, "tooltip-key": 0 };
  const filesRead = [];
  const missing = [];

  for (const src of sources) {
    let files;
    try {
      files = yamlFilesOf(src.dir);
    } catch {
      missing.push(src.dir);
      continue;
    }
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      let kept = 0;
      scanYaml(text, (stack, key, value, _indent, line) => {
        const where = classify(stack, key);
        if (!where) {
          // Not a label property — but a behaviour formula can still carry shipped text
          // in a record field. Collect those separately.
          const ctx = controlContext(stack, key);
          if (!ctx) return;
          if (/^On[A-Z]/.test(key)) {
            const k = `${ctx.control}.${key}`;
            behaviourScreens[k] = `${src.app}::${ctx.screen}`;
            for (const { text: s2 } of extractFxStrings(value.replace(/^\s*=/, ""))) {
              if (!isProse(s2) || isExcluded(s2)) continue;
              (behaviourLiterals[k] ??= []).push(s2);
            }
          }
          for (const rf of extractRecordFields(value.replace(/^\s*=/, ""))) {
            if (isExcluded(rf.text)) continue;
            const k = `${ctx.control}.${key}.${rf.field}`;
            if (recordFields.some((x) => x.key === k && x.text === rf.text)) continue;
            recordFields.push({
              app: src.app,
              file: basename(file),
              screen: ctx.screen,
              control: ctx.control,
              property: `${key}.${rf.field}`,
              key: k,
              line,
              text: rf.text,
            });
          }
          return;
        }
        const expr = value.replace(/^\s*=/, "");
        for (const { text: s, kind } of extractFxStrings(expr)) {
          const reason = isExcluded(s);
          if (reason) {
            excluded[reason] += 1;
            continue;
          }
          if (where.aux) {
            auxProperties.push({
              app: src.app,
              file: basename(file),
              screen: where.screen,
              control: where.control,
              property: where.property,
              scope: where.scope,
              kind,
              line,
              text: s,
            });
            continue;
          }
          kept += 1;
          entries.push({
            app: src.app,
            file: basename(file),
            screen: where.screen,
            control: where.control,
            property: where.property,
            scope: where.scope,
            kind,
            line,
            text: s,
          });
        }
      });
      for (const r of extractResourceGlobals(text)) {
        if (isExcluded(r.text)) continue;
        if (resources.some((x) => x.control === r.control && x.property === r.property && x.text === r.text))
          continue;
        resources.push({ app: src.app, file: basename(file), ...r });
      }
      filesRead.push({ file: basename(file), app: src.app, labels: kept });
    }
  }

  /* Indexes the gate uses. */
  const byControlProperty = {};
  for (const e of entries) {
    const k = `${e.control}.${e.property}`;
    (byControlProperty[k] ??= []).push(e.text);
  }
  for (const r of [...resources, ...recordFields, ...auxProperties]) {
    const k = `${r.control}.${r.property}`;
    (byControlProperty[k] ??= []).push(r.text);
  }
  for (const [k, list] of Object.entries(behaviourLiterals)) {
    behaviourLiterals[k] = [...new Set(list)];
    (byControlProperty[k] ??= []).push(...behaviourLiterals[k]);
  }
  for (const k of Object.keys(byControlProperty)) {
    byControlProperty[k] = [...new Set(byControlProperty[k])];
  }

  const byText = {};
  for (const e of [
    ...entries,
    ...resources,
    ...recordFields,
    ...auxProperties,
    ...Object.entries(behaviourLiterals).flatMap(([k, list]) =>
      list.map((t) => ({ text: t, control: k.split(".")[0], property: k.split(".")[1] })),
    ),
  ]) {
    const k = `${e.control}.${e.property}`;
    const list = (byText[e.text] ??= []);
    if (!list.includes(k)) list.push(k);
  }

  const distinct = [...new Set(entries.map((e) => e.text))];
  const counts = {
    occurrences: entries.length,
    distinct: distinct.length,
    distinctOver40Chars: distinct.filter((t) => t.length > 40).length,
    controlsWithLabels: new Set(entries.map((e) => `${e.app}/${e.screen}/${e.control}`)).size,
    screens: new Set(entries.map((e) => `${e.app}/${e.screen}`)).size,
    byProperty: LABEL_PROPERTIES.reduce((acc, p) => {
      acc[p] = entries.filter((e) => e.property === p || e.property === `${p}.Default`).length;
      return acc;
    }, {}),
    byKind: {
      literal: entries.filter((e) => e.kind === "literal").length,
      segment: entries.filter((e) => e.kind === "segment").length,
    },
    excluded,
    resourceGlobals: resources.length,
    recordFieldLiterals: recordFields.length,
    auxPropertyLiterals: auxProperties.length,
    auxPropertyDistinct: new Set(auxProperties.map((a) => a.text)).size,
    behaviourProperties: Object.keys(behaviourLiterals).length,
    behaviourLiterals: Object.values(behaviourLiterals).reduce((n, l) => n + l.length, 0),
    recordFieldDistinct: new Set(recordFields.map((r) => r.text)).size,
  };

  const payload = {
    $schema: "canvas-labels/1",
    generatedBy: "scripts/extract-canvas-labels.mjs",
    labelProperties: LABEL_PROPERTIES,
    exclusions: {
      controlNamePattern: CONTROL_NAME_RE.source,
      bareNumbers: true,
      literals: ["*", "ToolTip", "(empty / whitespace-only)"],
    },
    sources: sources.map((s) => ({ app: s.app, dir: s.dir })),
    missingSources: missing,
    counts,
    files: filesRead,
    resources,
    recordFields,
    auxProperties,
    behaviourLiterals,
    behaviourScreens,
    byControlProperty,
    byText,
    entries,
  };

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  if (!args.quiet) {
    const rel = outFile.startsWith(REPO_ROOT) ? outFile.slice(REPO_ROOT.length + 1) : outFile;
    console.log(`canvas label corpus → ${rel}`);
    console.log(`  files read              ${filesRead.length}`);
    console.log(`  screens/components      ${counts.screens}`);
    console.log(`  label occurrences       ${counts.occurrences}`);
    console.log(`  distinct strings        ${counts.distinct}`);
    console.log(`  distinct > 40 chars     ${counts.distinctOver40Chars}`);
    console.log(`  App.OnStart resources   ${resources.length} (not counted above)`);
    console.log(`  record-field literals   ${recordFields.length} (not counted above)`);
    console.log(
      `  aux-property literals   ${auxProperties.length} (not counted above; ${AUX_PROPERTIES.join(", ")})`,
    );
    console.log(
      `  behaviour-formula prose ${counts.behaviourLiterals} in ${counts.behaviourProperties} On… properties (not counted above)`,
    );
    console.log(
      `  excluded                ${Object.entries(excluded)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`,
    );
    if (missing.length) console.log(`  MISSING SOURCES         ${missing.join(", ")}`);
  }
}

main();
