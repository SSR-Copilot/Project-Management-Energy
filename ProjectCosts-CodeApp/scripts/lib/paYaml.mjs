/**
 * Canvas `.pa.yaml` reading, shared by the scripts that read the canvas source
 * (`ProjectDocs/_extracted/msapp/<app>/Src/*.pa.yaml`):
 *   - `check-canvas-identities.mjs` (the control index: name, type, literal AccessibleLabel);
 *   - `gen-parity-manifest.mjs` (every control with its properties, for the parity manifest drafts).
 *
 * The canvas YAML is a narrow, regular subset of YAML, so it is read line by line, not with a YAML library:
 *   - a control is `- <name>:` followed on the next line by `Control: <Type>@<version>`;
 *   - its `Properties:` block holds one `Key: value` per property, where the value is a plain scalar (`=1`),
 *     a double- or single-quoted scalar (`"=If(\n  a\n)"`) or a block scalar (`|-`, `|`, `|+`, `>-`);
 *   - `Children:` holds the child controls.
 * Power Fx helpers (comments, string literals, top-level splitting, calls) are here too, so the readers agree on
 * what is a live formula (CONVENTIONS rule 10: a commented-out formula is never ported).
 */
import fs from "node:fs";

/* ───────────────────────────────────────────────────────────── YAML ── */

const CONTROL_HEADER = /^(\s*)- (.+?):\s*$/;
/**
 * The narrower header the canvas-identity gate has always used: a control whose name holds another character (`/`, `[`,
 * `]`, e.g. `txt_Revenue_BalancingPrice[EUR/MWh]`) is not seen as a control, so its properties count for the control
 * before it. Kept so that gate's findings do not change (`canvasControlIndex`).
 */
const LEGACY_CONTROL_HEADER = /^(\s*)- ([A-Za-z0-9_'.\- ]+?):\s*$/;
const NEXT_IS_CONTROL = /^\s*Control:\s*/;
const PROP_LINE = /^(\s*)([A-Za-z_][A-Za-z0-9_.]*):(?:\s(.*))?$/;
const HEADER_FIELD = /^\s*(Control|Variant|ComponentName|ComponentLibraryUniqueName|MetadataKey|Layout|IsLocked):\s*(.*)$/;

const indentOf = (line) => line.length - line.trimStart().length;
const unquoteName = (s) => s.replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");

/** Decodes a YAML double-quoted scalar body (without the quotes). */
function decodeDouble(body) {
  return body.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_m, e) => {
    switch (e[0]) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "0": return "\0";
      case "x": case "u": case "U": return String.fromCodePoint(parseInt(e.slice(1), 16));
      default: return e; // \" \\ \/ and anything else: the character itself
    }
  });
}

/** Folds the lines of a multi-line flow scalar (YAML: a line break is a space, an empty line a newline). */
function foldFlow(lines) {
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const t = i === 0 ? lines[i].trimEnd() : lines[i].trim();
    if (i === 0) { out = t; continue; }
    out += t === "" ? "\n" : (out.endsWith("\n") ? "" : " ") + t;
  }
  return out;
}

/**
 * Reads the value of the property on `lines[i]` (already matched by PROP_LINE with `keyIndent` and `rest`).
 * Returns `{ raw, value, end }`: `raw` is the text after `Key:` on the key's own line, exactly as written; `end` is the
 * index of the first line after the value.
 */
function readValue(lines, i, keyIndent, rest) {
  const raw = (rest ?? "").trim();
  // Block scalar: |, |-, |+, >, >-, with an optional indentation indicator.
  const block = /^([|>])([+-]?)(\d?)([+-]?)\s*(#.*)?$/.exec(raw);
  if (block) {
    const folded = block[1] === ">";
    const chomp = block[2] || block[4] || "";
    let j = i + 1;
    const body = [];
    while (j < lines.length && (lines[j].trim() === "" || indentOf(lines[j]) > keyIndent)) body.push(lines[j++]);
    // Trailing blank lines belong to the value only for chomping; the scan stops at the next key either way.
    const firstText = body.find((l) => l.trim() !== "");
    const ind = block[3] ? keyIndent + Number(block[3]) : (firstText ? indentOf(firstText) : keyIndent + 2);
    let text;
    const stripped = body.map((l) => (l.trim() === "" ? "" : l.slice(ind)));
    if (folded) {
      text = "";
      for (const l of stripped) text += l === "" ? "\n" : (text === "" || text.endsWith("\n") ? "" : " ") + l;
    } else {
      text = stripped.join("\n");
    }
    if (chomp === "+") text = stripped.length ? text + "\n" : text;
    else if (chomp === "-") text = text.replace(/\n+$/, "");
    else text = text.replace(/\n+$/, "") + (text.trim() ? "\n" : "");
    return { raw, value: text, end: j };
  }
  if (raw.startsWith('"') || raw.startsWith("'")) {
    const q = raw[0];
    const closes = (s, from) => {
      for (let k = from; k < s.length; k++) {
        if (q === '"' && s[k] === "\\") { k++; continue; }
        if (s[k] === q) {
          if (q === "'" && s[k + 1] === "'") { k++; continue; }
          return k;
        }
      }
      return -1;
    };
    const parts = [raw.slice(1)];
    let j = i + 1;
    let at = closes(parts[0], 0);
    while (at < 0 && j < lines.length) {
      parts.push(lines[j++]);
      at = closes(parts[parts.length - 1], 0);
    }
    if (at >= 0) parts[parts.length - 1] = parts[parts.length - 1].slice(0, at);
    const joined = parts.length === 1 ? parts[0] : foldFlow(parts);
    const value = q === '"' ? decodeDouble(joined) : joined.replace(/''/g, "'");
    return { raw, value, end: j };
  }
  // Plain scalar, possibly continued on more-indented lines that are not keys.
  let j = i + 1;
  const parts = [raw];
  while (j < lines.length && lines[j].trim() !== "" && indentOf(lines[j]) > keyIndent && !PROP_LINE.test(lines[j]) && !CONTROL_HEADER.test(lines[j])) {
    parts.push(lines[j++]);
  }
  return { raw, value: parts.length === 1 ? raw : foldFlow(parts), end: j };
}

/**
 * Parses one `.pa.yaml` file's text.
 * Returns `{ screen, controls }`:
 *   screen   `{ name, props }` — the screen (or component, or `App`) and its own properties;
 *   controls in source order: `{ name, type, typeHead, variant, componentName, indent, line, parent, ancestors, props }`,
 *            `type` as written (`TextInput@0.0.54`), `typeHead` the leading `[A-Za-z_]+` (`Classic` for `Classic/Icon`),
 *            `props` Name -> `{ raw, value, line }` (1-based line of the key).
 * `legacyNames: true` reads control headers as the canvas-identity gate always has (see LEGACY_CONTROL_HEADER).
 */
export function parsePaYaml(text, { legacyNames = false } = {}) {
  const headerRe = legacyNames ? LEGACY_CONTROL_HEADER : CONTROL_HEADER;
  const lines = text.split(/\r?\n/);
  const controls = [];
  const stack = []; // { indent, ctl }
  let top = null;
  let screen = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const topKey = /^([^\s#][^:]*):\s*$/.exec(line);
    if (topKey) { top = unquoteName(topKey[1]); if (!["Screens", "ComponentDefinitions"].includes(top) && !screen) screen = { name: top, props: {} }; continue; }
    if (!screen && (top === "Screens" || top === "ComponentDefinitions")) {
      const second = /^ {2}([^\s#][^:]*):\s*$/.exec(line);
      if (second) { screen = { name: unquoteName(second[1]), props: {} }; continue; }
    }
    const header = headerRe.exec(line);
    if (header && NEXT_IS_CONTROL.test(lines[i + 1] ?? "")) {
      const indent = header[1].length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const name = header[2].replace(/^'|'$/g, "");
      const parent = stack.length ? stack[stack.length - 1].ctl : null;
      const type = (lines[i + 1].match(/Control:\s*(\S+)/) || [])[1] ?? "?";
      const ctl = {
        name, type, typeHead: (lines[i + 1].match(/Control:\s*([A-Za-z_]+)/) || [])[1] ?? "?",
        variant: undefined, componentName: undefined, indent, line: i + 1,
        parent: parent ? parent.name : null, ancestors: parent ? [...parent.ancestors, parent.name] : [], props: {},
      };
      controls.push(ctl);
      stack.push({ indent, ctl });
      continue;
    }
    const owner = () => [...stack].reverse().find((s) => s.indent < indentOf(line))?.ctl ?? null;
    const hf = HEADER_FIELD.exec(line);
    if (hf) {
      const o = owner();
      if (o && hf[1] === "Variant") o.variant = hf[2].trim();
      if (o && hf[1] === "ComponentName") o.componentName = hf[2].trim();
      continue;
    }
    if (/^\s*Properties:\s*$/.test(line)) {
      const pIndent = indentOf(line);
      const target = owner() ?? screen;
      let j = i + 1;
      let keyIndent = -1;
      while (j < lines.length) {
        const l = lines[j];
        if (!l.trim()) { j++; continue; }
        const ind = indentOf(l);
        if (ind <= pIndent) break;
        const pm = PROP_LINE.exec(l);
        if (keyIndent < 0) keyIndent = ind;
        if (!pm || ind !== keyIndent) { j++; continue; }
        const v = readValue(lines, j, ind, pm[3]);
        if (target) target.props[pm[2]] = { raw: v.raw, value: v.value, line: j + 1 };
        j = v.end;
      }
      i = j - 1;
      continue;
    }
  }
  return { screen, controls };
}

/**
 * The control index `check-canvas-identities.mjs` uses: name -> `{ name, type, screen, accessibleLabel, file }`.
 * `type` is the leading `[A-Za-z_]+` of `Control:`; `accessibleLabel` is the literal text when the YAML value is a plain
 * `="…"` (with `""` unescaped), else `{ formula: <raw YAML text> }`. A later control of the same name replaces an earlier one.
 */
export function canvasControlIndex(text, file, screen) {
  const out = new Map();
  for (const c of parsePaYaml(text, { legacyNames: true }).controls) {
    const entry = { name: c.name, type: c.typeHead, screen, accessibleLabel: undefined, file };
    const al = c.props.AccessibleLabel;
    if (al) {
      const lit = al.raw.match(/^="((?:[^"]|"")*)"$/);
      entry.accessibleLabel = lit ? lit[1].replace(/""/g, '"') : { formula: al.raw };
    }
    out.set(c.name, entry);
  }
  return out;
}

/** `canvasControlIndex` of a file on disk. */
export function readCanvasIndex(file, screen) {
  return canvasControlIndex(fs.readFileSync(file, "utf8"), file, screen);
}

/* ─────────────────────────────────────────────────────────── Power Fx ── */

/** Reads a Power Fx string literal starting at `start` (`"` or `$"`). Returns `{ end, value, interpolated, holes }`. */
function readFxString(src, start) {
  const interpolated = src[start] === "$";
  let i = start + (interpolated ? 2 : 1);
  let value = "";
  let holes = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      if (src[i + 1] === '"') { value += '"'; i += 2; continue; }
      i++;
      return { end: i, value, interpolated, holes };
    }
    if (interpolated && c === "{") {
      if (src[i + 1] === "{") { value += "{"; i += 2; continue; }
      i = skipHole(src, i + 1);
      value += "{…}";
      holes++;
      continue;
    }
    if (interpolated && c === "}" && src[i + 1] === "}") { value += "}"; i += 2; continue; }
    value += c;
    i++;
  }
  return { end: i, value, interpolated, holes };
}

function skipHole(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || (c === "$" && src[i + 1] === '"')) { i = readFxString(src, i).end; continue; }
    if (c === "'") { i = skipQuotedName(src, i); continue; }
    if (c === "{") depth++;
    else if (c === "}") { if (depth === 0) return i + 1; depth--; }
    i++;
  }
  return i;
}

function skipQuotedName(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "'") { if (src[j + 1] === "'") { j += 2; continue; } return j + 1; }
    j++;
  }
  return j;
}

/**
 * Splits Power Fx into tokens: `{ kind: "code" | "string" | "comment", text, start }`; a string token also has
 * `value` (unescaped, holes shown as `{…}`), `interpolated` and `holes`. Single-quoted names stay inside code.
 */
export function scanFx(src) {
  const out = [];
  let i = 0;
  let codeStart = 0;
  const flush = (to) => { if (to > codeStart) out.push({ kind: "code", text: src.slice(codeStart, to), start: codeStart }); };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      flush(i);
      let j = src.indexOf("\n", i);
      if (j < 0) j = src.length;
      out.push({ kind: "comment", text: src.slice(i, j), start: i });
      i = codeStart = j;
      continue;
    }
    if (c === "/" && n === "*") {
      flush(i);
      const close = src.indexOf("*/", i + 2);
      const j = close < 0 ? src.length : close + 2;
      out.push({ kind: "comment", text: src.slice(i, j), start: i });
      i = codeStart = j;
      continue;
    }
    if (c === '"' || (c === "$" && n === '"')) {
      flush(i);
      const r = readFxString(src, i);
      out.push({ kind: "string", text: src.slice(i, r.end), start: i, value: r.value, interpolated: r.interpolated, holes: r.holes });
      i = codeStart = r.end;
      continue;
    }
    if (c === "'") { i = skipQuotedName(src, i); continue; }
    i++;
  }
  flush(src.length);
  return out;
}

/** The formula without its comments (`//`, `/* *\/`); strings are kept as written. */
export function stripFxComments(src) {
  return scanFx(src).filter((t) => t.kind !== "comment").map((t) => t.text).join("");
}

/** A property value as its live formula: the leading `=` removed, comments removed, trimmed. */
export function liveFormula(value) {
  if (value === undefined || value === null) return "";
  const s = String(value).replace(/^\s*=/, "");
  return stripFxComments(s).trim();
}

/** The live formula on one line (whitespace runs collapsed). */
export function oneLine(formula) {
  return String(formula ?? "").replace(/\s+/g, " ").trim();
}

/** The first non-empty line of the live formula. */
export function firstLiveLine(value) {
  return liveFormula(value).split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

/** The string literals of a live formula (top level and inside calls; not the ones inside `{…}` holes). */
export function fxStrings(formula) {
  return scanFx(formula).filter((t) => t.kind === "string").map((t) => ({ value: t.value, interpolated: t.interpolated, holes: t.holes, start: t.start }));
}

/** When the whole live formula is one string literal without holes, its text; otherwise `null`. */
export function fxLiteral(value) {
  const live = liveFormula(value);
  const toks = scanFx(live).filter((t) => !(t.kind === "code" && !t.text.trim()));
  return toks.length === 1 && toks[0].kind === "string" && toks[0].holes === 0 ? toks[0].value : null;
}

/** `src` with every string body and quoted name blanked (same length), so a regex or a bracket count never sees inside one. */
export function maskFx(src) {
  let out = "";
  for (const t of scanFx(src)) {
    if (t.kind === "string") out += t.text[0] === "$" ? '$"' + " ".repeat(Math.max(0, t.text.length - 3)) + (t.text.length >= 3 ? '"' : "") : '"' + " ".repeat(Math.max(0, t.text.length - 2)) + (t.text.length >= 2 ? '"' : "");
    else if (t.kind === "comment") out += " ".repeat(t.text.length);
    else out += t.text.replace(/'(?:[^']|'')*'/g, (m) => "'" + "_".repeat(m.length - 2) + "'");
  }
  return out;
}

/** Splits `src` on `sep` at bracket depth 0, outside strings and quoted names. */
export function splitTopLevel(src, sep = ",") {
  const m = maskFx(src);
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === sep && depth === 0) { parts.push(src.slice(from, i)); from = i + 1; }
  }
  parts.push(src.slice(from));
  return parts.map((p) => p.trim()).filter((p, k, all) => p !== "" || all.length > 1);
}

/** The calls of `fns` in a live formula: `[{ fn, args, start }]`, `args` split at the top level. */
export function fxCalls(formula, fns) {
  const m = maskFx(formula);
  const re = new RegExp(`(?<![A-Za-z0-9_.'])(${fns.join("|")})\\s*\\(`, "g");
  const out = [];
  for (let hit = re.exec(m); hit; hit = re.exec(m)) {
    const open = hit.index + hit[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let k = open; k < m.length; k++) {
      if (m[k] === "(" || m[k] === "{" || m[k] === "[") depth++;
      else if (m[k] === ")" || m[k] === "}" || m[k] === "]") { depth--; if (depth === 0) { close = k; break; } }
    }
    if (close < 0) continue;
    out.push({ fn: hit[1], args: splitTopLevel(formula.slice(open + 1, close)), start: hit.index });
  }
  return out;
}

/** The fields of a Power Fx record literal `{ A: x, 'B c': y }` as `[{ name, value }]`; `null` when `src` is not one. */
export function fxRecord(src) {
  const s = String(src).trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  return splitTopLevel(s.slice(1, -1)).map((f) => {
    const m = maskFx(f);
    const colon = m.indexOf(":");
    if (colon < 0) return { name: f.trim(), value: "" };
    return { name: unquoteName(f.slice(0, colon).trim()), value: f.slice(colon + 1).trim() };
  }).filter((f) => f.name);
}

/** A Power Fx name: `'Land Lease Periods'` -> `Land Lease Periods`; a string literal -> its text; anything else trimmed. */
export function fxName(src) {
  const s = String(src).trim();
  if (/^'(?:[^']|'')*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  if (/^"(?:[^"]|"")*"$/.test(s)) return s.slice(1, -1).replace(/""/g, '"');
  return s;
}
