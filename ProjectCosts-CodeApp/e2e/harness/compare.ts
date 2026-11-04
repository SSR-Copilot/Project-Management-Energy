/**
 * The offline comparison of one run (D80, phase 3): the facts each app recorded, Canvas against code app, classed.
 *
 * PURE and screen-agnostic: no Playwright runtime, no file system, no globals, no screen code. `report.run.ts` reads the fact
 * files and passes them in with the screen's manifest; `compare.test.ts` (UT-PHCMP-*) pins every key form and every class.
 * `compareTexts` comes from `lib/texts.ts`, whose only Playwright import is a type import (erased at runtime), so it is reused
 * as it is (CONVENTIONS rule 17).
 *
 * Keys follow the KNOWN key form of `lib/known.ts`, `<layer>.<entry>[<detail>].<property>`, the detail written with
 * `JSON.stringify` (a text or an input keeps its quotes and escapes, exactly as `landlease.validation.parity.spec.ts` builds
 * them for `noteDiff`):
 *   visual      visual.<state>["<text>"].<fontSize|fontWeight|color|x|y>   and  .missing / .extra (a second hit: `#2`, ...)
 *   validation  validation.<group>["<input>"].messages / .save               (the old spec's form: `.messages`, plural)
 *   gates       gates.<state>["<command>"].enabled
 *   ux          ux.<check>.value for a value that is not an object of fields (a list, a text, a number, null), and
 *               ux.<check>.<path> for one that is in both apps: ONE key per leaf field (the old gates spec's per-field
 *               keys, e.g. `edit.texts.<k>`, `saveGate.empty`), the path its field names joined with "." (a name that is
 *               not letters, digits, - or _ is written `["<name>"]`); a list is a leaf, compared whole
 *   flows       flows.<flow>.<step>["<table>"].count  and  flows.<flow>.<step>["<table>"][<row index>].<column>
 *   any other   <layer>.<key>.value  (static, rules, platform, and a `data` fact that is not row-shaped)
 *
 * The fact file shapes each layer accepts (a recorder may write ONE entry per file or a map of entries):
 *   visual      key <state>,            data TextFact[]
 *   validation  key <group>,            data { <input>: { messages, save } }        or a map { <group>: { ... } }
 *   gates       key <state>,            data { <command>: boolean }                 or a map { <state>: { ... } }
 *   ux          key <check>,            data any JSON                               or a map { <check>: value } (key not a check)
 *   flows/data  key <flow>.<step>,      data { <table>: row[] }                     or key <flow>, data { <step>: { <table>: row[] } }
 *               (a bare <step> key is placed under the one manifest flow that has that step)
 *   other       key <key>,              data any JSON, compared by deep equality
 *
 * Classes:
 *   not-captured  an entry (fact, validation input) one app recorded and the other did not: nothing to compare. Not for the
 *                 `platform` layer: its checks are one app's own assertions (load errors, the [VSB] log, labels, zoom), whose
 *                 verdict is the lane test's result; a platform fact recorded by one app only is evidence, not a gap. A
 *                 platform fact recorded by both apps under one key is compared like any other layer.
 *   known         the key is in `manifest.known`; note = its reason
 *   artefact      an `ArtefactRule` of the diff's layer matches (`manifest.artefacts`, then `extraArtefacts`); note = its reason
 *   new           everything else
 *   stale         a `manifest.known` key that produced no difference although it was looked at: its entry was recorded by
 *                 both apps, or its layer was recorded by both apps and the entry is neither in the manifest nor recorded
 *                 (a renamed or removed entry), or the key is not a harness key form at all (it can never match)
 * `notCaptured` lists the manifest's states, groups, checks and flow steps that were not recorded by both apps.
 */
import type {
  ArtefactRule, ClassedDiff, FactFile, Kind, Layer, ScreenManifest, ValidationOutcome, VisualFacts,
} from "./contract";
import { compareTexts } from "../lib/texts";

export type CompareManifest = Pick<ScreenManifest, "known" | "artefacts" | "visual" | "validation" | "gates" | "ux" | "flows">;

export interface CompareInput {
  manifest: CompareManifest;
  canvas: FactFile[];
  code: FactFile[];
  /** Harness-wide artefact rules (`screens.ts` `COMMON_ARTEFACTS`), tried after the screen's own. */
  extraArtefacts?: readonly ArtefactRule[];
  /** The run's environment (for `VisualState.needsEnv`); the caller passes `process.env`. */
  env?: Record<string, string | undefined>;
}

export interface CompareResult { diffs: ClassedDiff[]; notCaptured: string[] }

type RawDiff = Omit<ClassedDiff, "cls">;

/** JSON with object keys sorted, so two equal values always print the same (deep equality by text). */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  }) ?? "undefined";
}

const same = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

/** `detail` as the KNOWN key form writes it: `["text"]`. */
const q = (s: string): string => `[${JSON.stringify(s)}]`;

/** The key `noteDiff` gets for one validation input in `landlease.validation.parity.spec.ts` (`${key}.messages` / `.save`). */
export function validationKey(group: string, input: string, property: "messages" | "save"): string {
  return `validation.${group}${q(input)}.${property}`;
}

/* ─────────────────────────────────────────────────────────── families ── */

/**
 * A family is one key prefix with one comparison. The five KNOWN families have their own comparison; every other layer is
 * compared generically. `flows` takes the row-shaped facts of the `flows` and the `data` layer (the diff keeps its layer).
 */
type Family = "visual" | "validation" | "gates" | "ux" | "flows" | "static" | "rules" | "platform" | "data";
const FAMILIES: readonly Family[] = ["visual", "validation", "gates", "ux", "flows", "static", "rules", "platform", "data"];
const isFamily = (s: string): s is Family => (FAMILIES as readonly string[]).includes(s);

interface Entry { layer: Layer; data: unknown }
/** One app's entries per family: entry name -> payload. */
type Side = Record<Family, Map<string, Entry>>;

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isOutcome = (v: unknown): v is ValidationOutcome => isPlain(v) && Array.isArray(v.messages) && typeof v.save === "boolean";
/** `{ <table>: row[] }`. */
const isTables = (v: unknown): v is Record<string, Record<string, unknown>[]> => isPlain(v) && Object.values(v).every(Array.isArray);

function sideOf(files: FactFile[], manifest: CompareManifest): Side {
  const side = Object.fromEntries(FAMILIES.map((f) => [f, new Map<string, Entry>()])) as Side;
  const uxNames = new Set(manifest.ux.map((u) => u.name));
  /** A bare step name -> `<flow>.<step>` when exactly one manifest flow has that step. */
  const stepOwner = new Map<string, string | null>();
  for (const flow of manifest.flows) {
    for (const st of flow.steps) stepOwner.set(st.name, stepOwner.has(st.name) ? null : flow.name);
  }
  const flowStep = (key: string): string => {
    if (key.includes(".")) return key;
    const owner = stepOwner.get(key);
    return owner ? `${owner}.${key}` : key;
  };
  const put = (family: Family, name: string, layer: Layer, data: unknown) => side[family].set(name, { layer, data });
  const many = (family: Family, layer: Layer, d: Record<string, unknown>) => { for (const [k, v] of Object.entries(d)) put(family, k, layer, v); };

  for (const f of files) {
    const d = f.data;
    switch (f.layer) {
      case "visual": put("visual", f.key, "visual", d); break;
      case "validation":
        if (isPlain(d) && !Object.values(d).every(isOutcome) && Object.values(d).every(isPlain)) many("validation", "validation", d);
        else put("validation", f.key, "validation", d);
        break;
      case "gates":
        if (isPlain(d) && !Object.values(d).every((v) => typeof v === "boolean") && Object.values(d).every(isPlain)) many("gates", "gates", d);
        else put("gates", f.key, "gates", d);
        break;
      case "ux":
        if (!uxNames.has(f.key) && isPlain(d)) many("ux", "ux", d);
        else put("ux", f.key, "ux", d);
        break;
      case "flows":
      case "data":
        if (isTables(d)) put("flows", flowStep(f.key), f.layer, d);
        else if (isPlain(d) && Object.values(d).every(isTables)) for (const [step, tables] of Object.entries(d)) put("flows", `${f.key}.${step}`, f.layer, tables);
        else put(f.layer === "flows" ? "flows" : "data", f.key, f.layer, d);
        break;
      default: put(f.layer, f.key, f.layer, d); break;
    }
  }
  return side;
}

/* ────────────────────────────────────────────────────────── per family ── */

function visualDiffs(state: string, canvasData: unknown, codeData: unknown): RawDiff[] {
  const canvas = (Array.isArray(canvasData) ? canvasData : []) as VisualFacts;
  const code = (Array.isArray(codeData) ? codeData : []) as VisualFacts;
  const out: RawDiff[] = [];
  const r = compareTexts(canvas, code);
  // The same words can occur twice in a state; a second difference of the same key gets `#2`, `#3` on its property.
  const seen = new Map<string, number>();
  const push = (key: string, c: unknown, k: unknown) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push({ key: n === 1 ? key : `${key}#${n}`, layer: "visual", canvas: c, code: k });
  };
  for (const d of r.diffs) push(`visual.${state}${q(d.text)}.${d.property}`, d.canvas, d.code);
  const counted = (list: string[]) => {
    const m = new Map<string, number>();
    for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  };
  const shown = (t: string, n: number) => (n === 1 ? t : `${t} (x${n})`);
  for (const [t, n] of counted(r.missingInCode)) push(`visual.${state}${q(t)}.missing`, shown(t, n), null);
  for (const [t, n] of counted(r.extraInCode)) push(`visual.${state}${q(t)}.extra`, null, shown(t, n));
  return out;
}

function validationDiffs(group: string, canvasData: unknown, codeData: unknown): { diffs: RawDiff[]; oneSided: RawDiff[] } {
  const canvas = (isPlain(canvasData) ? canvasData : {}) as Record<string, ValidationOutcome | undefined>;
  const code = (isPlain(codeData) ? codeData : {}) as Record<string, ValidationOutcome | undefined>;
  const diffs: RawDiff[] = [];
  const oneSided: RawDiff[] = [];
  for (const input of [...new Set([...Object.keys(canvas), ...Object.keys(code)])]) {
    const a = canvas[input];
    const b = code[input];
    if (!a || !b) {
      const has: Kind = a ? "canvas" : "code";
      oneSided.push({ key: `validation.${group}${q(input)}`, layer: "validation", canvas: a ?? null, code: b ?? null, note: `input recorded by ${one(has)} only` });
      continue;
    }
    // The recorders sort the messages; sorting again keeps the comparison independent of the order they were read in.
    const am = [...(a.messages ?? [])].sort();
    const bm = [...(b.messages ?? [])].sort();
    if (!same(am, bm)) diffs.push({ key: validationKey(group, input, "messages"), layer: "validation", canvas: am, code: bm });
    if (a.save !== b.save) diffs.push({ key: validationKey(group, input, "save"), layer: "validation", canvas: a.save, code: b.save });
  }
  return { diffs, oneSided };
}

function gateDiffs(state: string, canvasData: unknown, codeData: unknown): RawDiff[] {
  const canvas = (isPlain(canvasData) ? canvasData : {}) as Record<string, boolean | undefined>;
  const code = (isPlain(codeData) ? codeData : {}) as Record<string, boolean | undefined>;
  const out: RawDiff[] = [];
  // A command one app does not show at all is an app difference (null on that side), not a capture gap.
  for (const cmd of [...new Set([...Object.keys(canvas), ...Object.keys(code)])]) {
    const a = canvas[cmd] ?? null;
    const b = code[cmd] ?? null;
    if (a !== b) out.push({ key: `gates.${state}${q(cmd)}.enabled`, layer: "gates", canvas: a, code: b });
  }
  return out;
}

/** One path segment of a ux key: `.<name>` for letters, digits, - and _, else `["<name>"]` (JSON, as the other key forms). */
const segment = (name: string): string => (/^[A-Za-z0-9_-]+$/.test(name) ? `.${name}` : q(name));

/** The leaves of a plain object, path -> value (a list or a scalar is a leaf; an empty object is no leaf). */
function leaves(v: Record<string, unknown>, path = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, x] of Object.entries(v)) {
    const p = `${path}${segment(k)}`;
    if (isPlain(x)) for (const [pp, xx] of leaves(x, p)) out.set(pp, xx);
    else out.set(p, x);
  }
  return out;
}

/**
 * One ux check: per leaf field when BOTH apps recorded an object of fields (a field one app lacks is null there), else the
 * whole value as `.value`. So one wrong Edit-panel text is one key, as in the old gates spec, not the whole panel.
 */
function uxDiffs(check: string, canvasData: unknown, codeData: unknown): RawDiff[] {
  if (!isPlain(canvasData) || !isPlain(codeData)) {
    return same(canvasData, codeData) ? [] : [{ key: `ux.${check}.value`, layer: "ux", canvas: canvasData, code: codeData }];
  }
  const a = leaves(canvasData);
  const b = leaves(codeData);
  const out: RawDiff[] = [];
  for (const path of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const ca = a.has(path) ? a.get(path) : null;
    const cb = b.has(path) ? b.get(path) : null;
    if (!same(ca, cb)) out.push({ key: `ux.${check}${path}`, layer: "ux", canvas: ca ?? null, code: cb ?? null });
  }
  return out;
}

function rowDiffs(step: string, layer: Layer, canvasData: unknown, codeData: unknown): RawDiff[] {
  const canvas = (isPlain(canvasData) ? canvasData : {}) as Record<string, Record<string, unknown>[] | undefined>;
  const code = (isPlain(codeData) ? codeData : {}) as Record<string, Record<string, unknown>[] | undefined>;
  const out: RawDiff[] = [];
  // A table missing on one side counts as no rows there: the recorder may leave out an empty table.
  for (const table of [...new Set([...Object.keys(canvas), ...Object.keys(code)])]) {
    const a = canvas[table] ?? [];
    const b = code[table] ?? [];
    if (a.length !== b.length) out.push({ key: `flows.${step}${q(table)}.count`, layer, canvas: a.length, code: b.length });
    // Rows are compared by index (the recorder sorts and masks them); rows beyond the shorter side are covered by `.count`.
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const ra = a[i] ?? {};
      const rb = b[i] ?? {};
      for (const col of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
        if (!same(ra[col], rb[col])) out.push({ key: `flows.${step}${q(table)}[${i}].${col}`, layer, canvas: ra[col] ?? null, code: rb[col] ?? null });
      }
    }
  }
  return out;
}

/* ──────────────────────────────────────────────────────────── the run ── */

function one(k: Kind): string {
  return k === "canvas" ? "the Canvas" : "the code app";
}

/** True when `key` belongs to `entry` of `family`: `<family>.<entry>` followed by nothing, `.`, `[` or `#`. */
function keyOfEntry(key: string, family: string, entry: string): boolean {
  const head = `${family}.${entry}`;
  if (!key.startsWith(head)) return false;
  const next = key.charAt(head.length);
  return next === "" || next === "." || next === "[" || next === "#";
}

export function compareRun(input: CompareInput): CompareResult {
  const { manifest, env = {} } = input;
  const canvas = sideOf(input.canvas, manifest);
  const code = sideOf(input.code, manifest);
  const raw: RawDiff[] = [];
  const oneSided: RawDiff[] = [];
  /** Entries recorded by both apps, per family: only inside these can a known key be judged stale. */
  const both = Object.fromEntries(FAMILIES.map((f) => [f, new Set<string>()])) as Record<Family, Set<string>>;

  for (const family of FAMILIES) {
    const a = canvas[family];
    const b = code[family];
    for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const ea = a.get(name);
      const eb = b.get(name);
      if (!ea || !eb) {
        if (family === "platform") continue; // one app's own check: the lane test is its verdict (see the header)
        const has: Kind = ea ? "canvas" : "code";
        const layer = (ea ?? eb)!.layer;
        oneSided.push({ key: `${family}.${name}`, layer, canvas: ea ? "recorded" : null, code: eb ? "recorded" : null, note: `recorded by ${one(has)} only` });
        continue;
      }
      both[family].add(name);
      switch (family) {
        case "visual": raw.push(...visualDiffs(name, ea.data, eb.data)); break;
        case "validation": {
          const r = validationDiffs(name, ea.data, eb.data);
          raw.push(...r.diffs);
          oneSided.push(...r.oneSided);
          break;
        }
        case "gates": raw.push(...gateDiffs(name, ea.data, eb.data)); break;
        case "ux": raw.push(...uxDiffs(name, ea.data, eb.data)); break;
        case "flows":
          if (isTables(ea.data) && isTables(eb.data)) { raw.push(...rowDiffs(name, ea.layer, ea.data, eb.data)); break; }
          if (!same(ea.data, eb.data)) raw.push({ key: `${family}.${name}.value`, layer: ea.layer, canvas: ea.data, code: eb.data });
          break;
        // Every other layer: the whole value, deep.
        default: if (!same(ea.data, eb.data)) raw.push({ key: `${family}.${name}.value`, layer: ea.layer, canvas: ea.data, code: eb.data }); break;
      }
    }
  }

  /* What the manifest lists that was not recorded by both apps. */
  const notCaptured: string[] = [];
  const listed = Object.fromEntries(FAMILIES.map((f) => [f, new Set<string>()])) as Record<Family, Set<string>>;
  const report = (family: Family, name: string, needsEnv?: string) => {
    listed[family].add(name);
    const has = { canvas: canvas[family].has(name), code: code[family].has(name) };
    if (has.canvas && has.code) return;
    if (needsEnv && !env[needsEnv]?.trim()) notCaptured.push(`${family}.${name}: skipped: ${needsEnv} not set`);
    else if (!has.canvas && !has.code) notCaptured.push(`${family}.${name}: recorded by neither app`);
    else notCaptured.push(`${family}.${name}: recorded by ${one(has.canvas ? "canvas" : "code")} only`);
  };
  for (const s of manifest.visual) report("visual", s.name, s.needsEnv);
  for (const g of manifest.validation) report("validation", g.key);
  for (const g of manifest.gates) report("gates", g.name);
  for (const u of manifest.ux) report("ux", u.name);
  for (const flow of manifest.flows) for (const st of flow.steps) report("flows", `${flow.name}.${st.name}`);

  /* Classing. */
  const artefacts = [...manifest.artefacts, ...(input.extraArtefacts ?? [])];
  const diffs: ClassedDiff[] = oneSided.map((d) => ({ ...d, cls: "not-captured" as const }));
  const produced = new Set<string>();
  for (const d of raw) {
    produced.add(d.key);
    const reason = manifest.known[d.key];
    if (reason !== undefined) { diffs.push({ ...d, cls: "known", note: reason }); continue; }
    const rule = artefacts.find((a) => a.layer === d.layer && a.test(d));
    if (rule) { diffs.push({ ...d, cls: "artefact", note: `${rule.id}: ${rule.reason}` }); continue; }
    diffs.push({ ...d, cls: "new" });
  }

  for (const [key, reason] of Object.entries(manifest.known)) {
    if (produced.has(key)) continue;
    const prefix = /^([a-z]+)[.[]/.exec(key)?.[1] ?? "";
    if (!isFamily(prefix)) {
      // Not a key this harness produces (e.g. an old spec's `cards` or `hover.rowTitle`): it can never match.
      diffs.push({ key, layer: "static", cls: "stale", canvas: null, code: null, note: `${reason} (not a harness key form; it can never match)` });
      continue;
    }
    const layer: Layer = prefix;
    if ([...both[prefix]].some((e) => keyOfEntry(key, prefix, e))) {
      diffs.push({ key, layer, cls: "stale", canvas: null, code: null, note: `${reason} (no longer occurs)` });
      continue;
    }
    // Its entry is listed in the manifest or was recorded by one app: the run did not look, so it is not judged (notCaptured says why).
    const looked = (e: string) => keyOfEntry(key, prefix, e);
    if ([...listed[prefix]].some(looked) || [...canvas[prefix].keys(), ...code[prefix].keys()].some(looked)) continue;
    // The layer was recorded by both apps but this entry exists nowhere: a renamed or removed state, group, check or step.
    if (canvas[prefix].size > 0 && code[prefix].size > 0) {
      diffs.push({ key, layer, cls: "stale", canvas: null, code: null, note: `${reason} (its entry is neither in the manifest nor recorded)` });
    }
  }
  return { diffs, notCaptured };
}
