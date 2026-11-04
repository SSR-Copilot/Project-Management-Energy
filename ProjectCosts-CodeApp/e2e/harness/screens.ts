/**
 * The parity harness: screens, found by folder (D80, plan section 5a "Dynamic screens").
 *
 * A screen is ONE folder `e2e/screens/<slug>/` with a `manifest.ts` that exports `manifest: ScreenManifest`. There is no
 * registry: `listScreens()` reads the folders, `loadManifest(slug)` imports the file and checks it. Nothing here imports a
 * screen's code.
 *
 * Also here, because every lane and the runner need them and they are pure:
 *   DEFAULT_LANES / laneFor / uxLaneFor / layersOfLane   which lane runs which layer for which app
 *   LANE_LAYER_ORDER                                      the order a lane runs its layers (and the lane files' order)
 *   laneKind / laneTarget                                 the app and the project a lane opens
 *   DEFAULT_BUDGETS / budgetFor                           per-lane wall-clock budgets (minutes, plan section 4)
 *   flowTimeoutMs / validationWaitFor / smokeStateOf      per-manifest settings with their defaults
 *   COMMON_ARTEFACTS                                      tool artefacts that hold for every screen
 *   validateManifest                                      the checks `loadManifest` runs, with every problem named
 *
 * There is no default screen: `selectedScreen` (and `env.ts` resolveRunEnv) require `PARITY_SCREEN` and name the screens on
 * disk when it is missing. No Playwright runtime import (types only), so `screens.test.ts` (UT-PHSCR-*) runs it under vitest.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ArtefactRule, Flow, Kind, Lane, Layer, ReadLane, ScreenManifest, UxCheck, ValidationWait } from "./contract";
import { LANES, listScreens, SCREENS_DIR, screenRequired } from "./env";

/** `e2e/screens/` and the screens in it: one definition each, in `env.ts` (which names them when PARITY_SCREEN is missing). */
export { listScreens, SCREENS_DIR, screenRequired };

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/**
 * A state / group / check / flow / step name becomes part of a KNOWN key (`<layer>.<name>[...]`), which `compare.ts`
 * `parseKey` splits at the first `.` or `[`. So a name is letters, digits, `-` and `_` only.
 */
const ENTRY_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

/* ───────────────────────────────────────────────────────────── lanes ── */

/** The layers that run in a browser lane (`static` and `rules` run in vitest, inside `npm run verify`). */
export type BrowserLayer = Exclude<Layer, "static" | "rules">;
export const BROWSER_LAYERS: readonly BrowserLayer[] = ["visual", "ux", "validation", "gates", "flows", "data", "platform"];

/** Which lane runs a layer for each app (plan section 4). A manifest overrides any of them with `lanes`. */
export const DEFAULT_LANES: Readonly<Record<BrowserLayer, { canvas: Lane; code: Lane }>> = {
  visual: { canvas: "canvas-A", code: "code-A" },
  platform: { canvas: "canvas-A", code: "code-A" },
  validation: { canvas: "canvas-B", code: "code-B" },
  gates: { canvas: "canvas-B", code: "code-B" },
  ux: { canvas: "canvas-C", code: "code-A" },
  flows: { canvas: "write-canvas", code: "write-code" },
  data: { canvas: "write-canvas", code: "write-code" },
};

/** Per-lane budgets in minutes (plan section 4). A lane past its budget plus 20 % stops (`session.ts`). */
export const DEFAULT_BUDGETS: Readonly<Record<Lane, number>> = {
  "canvas-A": 15,
  "canvas-B": 18,
  "canvas-C": 10,
  "code-A": 10,
  "code-B": 10,
  "write-canvas": 25,
  "write-code": 12,
};

/** The app a lane drives: `canvas-*` and `write-canvas` the Canvas, the others the code app. */
export function laneKind(lane: Lane): Kind {
  return lane.startsWith("canvas-") || lane === "write-canvas" ? "canvas" : "code";
}

/** The project a lane opens: the write lanes a write project, the others the read project (`env.ts` `requireProjectId`). */
export function laneTarget(lane: Lane): "read" | "write" {
  return lane.startsWith("write-") ? "write" : "read";
}

const isBrowserLayer = (layer: Layer): layer is BrowserLayer => (BROWSER_LAYERS as readonly string[]).includes(layer);

/** The lane that runs `layer` for `kind`: `manifest.lanes` first, else `DEFAULT_LANES`. */
export function laneFor(manifest: Pick<ScreenManifest, "lanes">, layer: Layer, kind: Kind): Lane {
  if (!isBrowserLayer(layer)) throw new Error(`Layer "${layer}" runs in vitest, not in a browser lane`);
  return (manifest.lanes?.[layer] ?? DEFAULT_LANES[layer])[kind];
}

/**
 * The lane of one UX check for `kind`. `check.lane` names ONE app's lane (e.g. `canvas-C` for a hover check), so it
 * overrides only for that app; the other app keeps the layer's lane.
 */
export function uxLaneFor(manifest: Pick<ScreenManifest, "lanes">, check: Pick<UxCheck, "lane">, kind: Kind): Lane {
  return check.lane && laneKind(check.lane) === kind ? check.lane : laneFor(manifest, "ux", kind);
}

/**
 * The order a lane runs its layers: platform last (it reloads and zooms). Playwright runs a project's files one after another
 * in alphabetical order when the project has one worker (`playwright.harness.config.ts` `workers: 1` per lane), so the generic
 * lane files carry this order in their names (`1-visual.lane.ts` ... `6-platform.lane.ts`); UT-PHSCR-007 pins the two together.
 * A screen's own `e2e/screens/<slug>/*.lane.ts` sort after them (their path does); they reset to rest first, and every platform
 * test leaves the screen reopened (or reset) and at 100 % zoom, so they do not depend on running before it.
 */
export const LANE_LAYER_ORDER: readonly Exclude<BrowserLayer, "data">[] = ["visual", "ux", "validation", "gates", "flows", "platform"];

/** The browser layers `lane` runs for this manifest, in the order a lane runs them (`LANE_LAYER_ORDER`). */
export function layersOfLane(manifest: Pick<ScreenManifest, "lanes" | "ux">, lane: Lane): BrowserLayer[] {
  const kind = laneKind(lane);
  return LANE_LAYER_ORDER.filter((layer) => (layer === "ux"
    ? manifest.ux.some((c) => uxLaneFor(manifest, c, kind) === lane)
    : laneFor(manifest, layer, kind) === lane));
}

/** The lane's budget in minutes: `manifest.budgets[lane]`, else `DEFAULT_BUDGETS`. */
export function budgetFor(manifest: Pick<ScreenManifest, "budgets">, lane: Lane): number {
  return manifest.budgets[lane] ?? DEFAULT_BUDGETS[lane];
}

/* ──────────────────────────────────────────────── per-manifest settings ── */

/** A flow test's timeout when its manifest gives none (the old suite: flows 60 min, write 20 min; plan section 4). */
export const DEFAULT_FLOW_TIMEOUT_MIN = 30;
/** The flows lane's cleanup (afterEach) gets this long of its own, also after the flow test timed out. */
export const FLOW_CLEANUP_TIMEOUT_MS = 10 * 60_000;

/** The flow test's timeout in ms: `flow.timeoutMin`, else `DEFAULT_FLOW_TIMEOUT_MIN`. */
export function flowTimeoutMs(flow: Pick<Flow, "timeoutMin">): number {
  return (flow.timeoutMin ?? DEFAULT_FLOW_TIMEOUT_MIN) * 60_000;
}

/** The validation lane's wait after each input for `kind`: `manifest.validationWait`, else "outcome" on the Canvas, "settle" in the code app. */
export function validationWaitFor(manifest: Pick<ScreenManifest, "validationWait">, kind: Kind): ValidationWait {
  const w = manifest.validationWait;
  const given = typeof w === "string" ? w : w?.[kind];
  return given ?? (kind === "canvas" ? "outcome" : "settle");
}

/** The visual state the smoke tier opens for its labels check: `manifest.smokeState`, else the first visual state; null when there is none. */
export function smokeStateOf(manifest: Pick<ScreenManifest, "visual" | "smokeState">): ScreenManifest["visual"][number] | null {
  if (manifest.smokeState !== undefined) return manifest.visual.find((s) => s.name === manifest.smokeState) ?? null;
  return manifest.visual[0] ?? null;
}

/* ──────────────────────────────────────────────────── common artefacts ── */

/** The text and property of a visual diff key `visual.<state>["<text>"].<property>[#n]`, or null for another key form. */
export function visualKeyParts(key: string): { text: string; property: string } | null {
  const m = /^visual\.[^.[]+(\[".*"\])\.([A-Za-z]+)(?:#\d+)?$/.exec(key);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]!) as unknown;
    return Array.isArray(parsed) && typeof parsed[0] === "string" ? { text: parsed[0], property: m[2]! } : null;
  } catch {
    return null;
  }
}

/** Private-use code points (icon fonts), zero-width characters and the BOM: nothing a user reads as text. */
const NOT_TEXT = /[-​-‍⁠﻿\s]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/g;

/**
 * Tool artefacts that hold for every screen; `report.run.ts` adds them to `manifest.artefacts`. Each is narrow on purpose:
 * a rule that matched a real difference would hide it.
 *
 *  common-glyph     A text that is empty once icon-font glyphs (private-use code points), zero-width characters and spaces
 *                   are removed. The Canvas draws its icons as font glyphs, which the text reader captures as "text"; the
 *                   code app draws icons as SVG, which it does not. Any property of such a text is an artefact.
 *  common-asterisk  The required-field "*" when it is missing, extra or paired at another position. The code app draws some
 *                   asterisks with CSS `::before` (Fluent's required label), which no text node carries, so the n-th "*" of
 *                   one app is paired with a different "*" of the other. A style difference of a "*" is NOT covered.
 *
 * A dropdown's selected value is handled where it is captured, not here: the Canvas's modern dropdown is a native
 * `<select>`, whose option text has no box, so `readers.ts` `readVisual` adds the selected option of every visible
 * `<select>` to the Canvas texts. A rule on the diff alone could not tell that value from a real extra text in the code app.
 */
export const COMMON_ARTEFACTS: readonly ArtefactRule[] = [
  {
    id: "common-glyph",
    layer: "visual",
    test: (d) => {
      const p = visualKeyParts(d.key);
      return p !== null && p.text.replace(NOT_TEXT, "") === "";
    },
    reason: "an icon-font glyph or an empty text: the Canvas draws icons as font glyphs, the code app as SVG",
  },
  {
    id: "common-asterisk",
    layer: "visual",
    test: (d) => {
      const p = visualKeyParts(d.key);
      return p !== null && p.text === "*" && ["missing", "extra", "x", "y"].includes(p.property);
    },
    reason: "a required-field asterisk: the code app draws some with CSS ::before, so asterisks pair up differently",
  },
];

/* ─────────────────────────────────────────────────────── finding screens ── */

/**
 * The screen of this run from `PARITY_SCREEN`, which is required: unset, it throws "set PARITY_SCREEN to one of: <screens>"
 * (`screenRequired`, the screens of `dir`). Read at test collection (the lanes declare their tests from the manifest), where
 * `env.ts` `runEnv()` is not used: it writes the run id file. The harness config stops earlier with the same message.
 */
export function selectedScreen(vars: Readonly<Record<string, string | undefined>> = process.env, dir: string = SCREENS_DIR): string {
  const v = vars.PARITY_SCREEN?.trim();
  if (!v) throw new Error(screenRequired(listScreens(dir)));
  if (!SLUG.test(v)) throw new Error(`PARITY_SCREEN must be a lower-case slug such as "land-lease" (got "${v}")`);
  return v;
}

/** Imports `<dir>/<slug>/manifest.ts`, takes its `manifest` export and checks it (`validateManifest`). */
export async function loadManifest(slug: string, dir: string = SCREENS_DIR): Promise<ScreenManifest> {
  if (!SLUG.test(slug)) throw new Error(`Screen slug must be lower-case kebab-case (got "${slug}")`);
  const file = join(dir, slug, "manifest.ts");
  if (!existsSync(file)) {
    const found = listScreens(dir);
    throw new Error(`No manifest for screen "${slug}": expected e2e/screens/${slug}/manifest.ts `
      + `(screens found: ${found.length ? found.join(", ") : "none"})`);
  }
  const mod = (await import(pathToFileURL(file).href)) as { manifest?: unknown };
  if (mod.manifest === undefined) throw new Error(`e2e/screens/${slug}/manifest.ts has no "manifest" export`);
  return validateManifest(slug, mod.manifest);
}

/* ──────────────────────────────────────────────────────────── checking ── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isFn = (v: unknown): v is (...a: unknown[]) => unknown => typeof v === "function";
const LANE_SET = new Set<string>(LANES);

function checkControlRef(p: string[], where: string, v: unknown): void {
  if (!isObj(v)) { p.push(`${where} must be { canvas, code }`); return; }
  if (!isStr(v.canvas)) p.push(`${where}.canvas must be a non-empty string`);
  if (!isStr(v.code)) p.push(`${where}.code must be a non-empty string`);
  if (v.by !== undefined && v.by !== "name" && v.by !== "caption") p.push(`${where}.by must be "name" or "caption"`);
  if (v.codeMatch !== undefined && v.codeMatch !== "exact" && v.codeMatch !== "prefix") p.push(`${where}.codeMatch must be "exact" or "prefix"`);
}

const WAITS: readonly ValidationWait[] = ["settle", "stable", "outcome"];

function checkSettings(p: string[], m: Record<string, unknown>): void {
  const w = m.validationWait;
  if (w !== undefined) {
    const ok = (x: unknown) => x === undefined || WAITS.includes(x as ValidationWait);
    if (typeof w === "string" ? !ok(w) : !(isObj(w) && Object.keys(w).every((k) => k === "canvas" || k === "code") && ok(w.canvas) && ok(w.code))) {
      p.push('validationWait must be "settle" | "stable" | "outcome", or { canvas?, code? } of those');
    }
  }
  const t = m.textWindow;
  if (t !== undefined && !(isObj(t) && [t.minX, t.minY].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0))) {
    p.push("textWindow must be { minX, minY }, two numbers of 0 or more (frame pixels)");
  }
  if (m.smokeState !== undefined) {
    const names = Array.isArray(m.visual) ? m.visual.filter(isObj).map((s) => s.name) : [];
    if (!isStr(m.smokeState) || !names.includes(m.smokeState)) p.push(`smokeState must name a visual state (got ${JSON.stringify(m.smokeState)})`);
  }
}

/** Every entry of `list` has a valid, unique `field` name and the functions `fns`. */
function checkEntries(p: string[], where: string, list: unknown, field: string, fns: string[]): string[] {
  if (!Array.isArray(list)) { p.push(`${where} must be an array`); return []; }
  const names: string[] = [];
  list.forEach((e, i) => {
    if (!isObj(e)) { p.push(`${where}[${i}] must be an object`); return; }
    const name = e[field];
    if (!isStr(name) || !ENTRY_NAME.test(name)) {
      p.push(`${where}[${i}].${field} must be letters, digits, - or _ (got ${JSON.stringify(name)})`);
    } else if (names.includes(name)) {
      p.push(`${where}: ${field} "${name}" is used twice`);
    } else names.push(name);
    for (const fn of fns) if (!isFn(e[fn])) p.push(`${where}[${i}] (${String(name)}).${fn} must be a function`);
  });
  return names;
}

function checkOpen(p: string[], open: unknown): void {
  if (!isObj(open)) { p.push("open must be an object"); return; }
  const need = (keys: string[]) => { for (const k of keys) if (!isStr(open[k])) p.push(`open.${k} must be a non-empty string`); };
  switch (open.app) {
    case "cost": need(["canvasMenu", "codeRoute"]); break;
    case "pm": need(["canvasScreen", "codeRoute"]); break;
    case "admin": need(["leftMenuLabel", "codeRoute"]); break;
    case "custom":
      if (typeof open.projectScoped !== "boolean") p.push("open.projectScoped must be true or false");
      if (!isFn(open.open)) p.push("open.open must be a function (kind, page, projectId) => FrameLocator");
      break;
    default: p.push(`open.app must be "cost", "pm", "admin" or "custom" (got ${JSON.stringify(open.app)})`);
  }
  if (isStr(open.codeRoute) && !open.codeRoute.startsWith("/")) p.push(`open.codeRoute must start with "/" (got "${open.codeRoute}")`);
}

function checkTables(p: string[], tables: unknown): void {
  if (!Array.isArray(tables)) { p.push("tables must be an array (empty for a read-only screen)"); return; }
  const names = new Set<string>();
  tables.forEach((t, i) => {
    const w = `tables[${i}]`;
    if (!isObj(t)) { p.push(`${w} must be an object`); return; }
    for (const k of ["name", "service", "serviceModule", "entitySet", "primaryKey"]) if (!isStr(t[k])) p.push(`${w}.${k} must be a non-empty string`);
    if (isStr(t.name)) { if (names.has(t.name)) p.push(`tables: name "${t.name}" is used twice`); names.add(t.name); }
    if (isStr(t.serviceModule) && !t.serviceModule.startsWith("/src/")) p.push(`${w}.serviceModule must be a dev-server path starting with /src/`);
    if (typeof t.deleteOrder !== "number" || !Number.isFinite(t.deleteOrder)) p.push(`${w}.deleteOrder must be a number`);
    if (t.tagColumn !== undefined && !isStr(t.tagColumn)) p.push(`${w}.tagColumn must be a column name`);
    if (t.projectLookup !== undefined && !isStr(t.projectLookup)) p.push(`${w}.projectLookup must be a column name`);
    if (t.ignoreColumns !== undefined && !(Array.isArray(t.ignoreColumns) && t.ignoreColumns.every(isStr))) p.push(`${w}.ignoreColumns must be an array of column names`);
    if (t.sortKey !== undefined && !(Array.isArray(t.sortKey) && t.sortKey.length > 0 && t.sortKey.every(isStr))) p.push(`${w}.sortKey must be a non-empty array of column names`);
    if (t.parent !== undefined && !(isObj(t.parent) && isStr(t.parent.table) && isStr(t.parent.lookup))) p.push(`${w}.parent must be { table, lookup }`);
  });
  for (const t of tables) {
    if (isObj(t) && isObj(t.parent) && isStr(t.parent.table) && !names.has(t.parent.table)) {
      p.push(`tables: "${String(t.name)}" has parent "${t.parent.table}", which is not in tables`);
    }
  }
}

function checkLanes(p: string[], lanes: unknown): void {
  if (lanes === undefined) return;
  if (!isObj(lanes)) { p.push("lanes must be an object { <layer>: { canvas, code } }"); return; }
  for (const [layer, v] of Object.entries(lanes)) {
    if (!isBrowserLayer(layer as Layer)) { p.push(`lanes.${layer}: not a browser layer (${BROWSER_LAYERS.join(", ")})`); continue; }
    if (!isObj(v)) { p.push(`lanes.${layer} must be { canvas, code }`); continue; }
    const write = layer === "flows" || layer === "data";
    for (const kind of ["canvas", "code"] as const) {
      const lane = v[kind];
      if (typeof lane !== "string" || !LANE_SET.has(lane)) { p.push(`lanes.${layer}.${kind}: unknown lane ${JSON.stringify(lane)}`); continue; }
      if (laneKind(lane as Lane) !== kind) p.push(`lanes.${layer}.${kind}: lane "${lane}" drives the other app`);
      if ((laneTarget(lane as Lane) === "write") !== write) p.push(`lanes.${layer}.${kind}: ${write ? "a write layer needs a write lane" : "a read layer needs a read lane"} (got "${lane}")`);
    }
  }
}

/**
 * Checks a manifest's shape and returns it typed. Throws ONE error naming the screen and every problem found, so a new
 * screen's author fixes them in one pass.
 */
export function validateManifest(slug: string, value: unknown): ScreenManifest {
  const p: string[] = [];
  if (!isObj(value)) throw new Error(`Manifest of screen "${slug}" must be an object (export const manifest: ScreenManifest)`);
  const m = value;
  if (m.slug !== slug) p.push(`slug must equal its folder name "${slug}" (got ${JSON.stringify(m.slug)})`);
  if (!isStr(m.title)) p.push("title must be a non-empty string");
  if (!isObj(m.canvasSource) || (m.canvasSource.app !== "projectcosts" && m.canvasSource.app !== "projectmanagement") || !isStr(m.canvasSource.yaml)) {
    p.push('canvasSource must be { app: "projectcosts" | "projectmanagement", yaml: "<Screen>.pa.yaml" }');
  }
  if (!isStr(m.canvasVersion)) p.push("canvasVersion must be a non-empty string (the canvas solution version)");
  checkOpen(p, m.open);
  checkTables(p, m.tables);

  if (!isObj(m.controls)) p.push("controls must be an object (it may be empty: {})");
  else {
    for (const k of ["save", "cancel", "restMarker"]) if (m.controls[k] !== undefined) checkControlRef(p, `controls.${k}`, m.controls[k]);
    const cmds = m.controls.commands;
    if (cmds !== undefined) {
      if (!isObj(cmds)) p.push("controls.commands must be { <caption>: { canvas, code } }");
      else for (const [caption, ref] of Object.entries(cmds)) checkControlRef(p, `controls.commands[${JSON.stringify(caption)}]`, ref);
    }
  }
  if (!Array.isArray(m.messages) || !m.messages.every(isStr)) p.push("messages must be an array of non-empty strings");

  checkEntries(p, "visual", m.visual, "name", ["steps"]);
  if (Array.isArray(m.visual)) {
    m.visual.forEach((s, i) => {
      if (!isObj(s)) return;
      if (s.needsEnv !== undefined && !isStr(s.needsEnv)) p.push(`visual[${i}].needsEnv must be a variable name`);
      if (s.until !== undefined) checkControlRef(p, `visual[${i}].until`, s.until);
    });
  }
  checkEntries(p, "validation", m.validation, "key", ["baseline"]);
  if (Array.isArray(m.validation)) {
    m.validation.forEach((g, i) => {
      if (!isObj(g)) return;
      if (!isStr(g.field)) p.push(`validation[${i}].field must be a canvas control name`);
      if (g.codeField !== undefined && !isStr(g.codeField)) p.push(`validation[${i}].codeField must be a test id`);
      if (!Array.isArray(g.inputs) || !g.inputs.every((x) => typeof x === "string")) p.push(`validation[${i}].inputs must be an array of strings`);
    });
  }
  checkEntries(p, "gates", m.gates, "name", ["steps"]);
  checkEntries(p, "ux", m.ux, "name", ["run"]);
  if (Array.isArray(m.ux)) {
    m.ux.forEach((c, i) => {
      if (isObj(c) && c.lane !== undefined && (typeof c.lane !== "string" || !LANE_SET.has(c.lane) || laneTarget(c.lane as ReadLane) === "write")) {
        p.push(`ux[${i}].lane must be a read lane (got ${JSON.stringify(c.lane)})`);
      }
    });
  }
  checkEntries(p, "flows", m.flows, "name", ["cleanup"]);
  if (Array.isArray(m.flows)) {
    // `compare.ts` keys flow rows by STEP name, so a step name must be unique across all flows.
    const steps = new Map<string, string>();
    m.flows.forEach((f, i) => {
      if (!isObj(f)) return;
      if (f.timeoutMin !== undefined && !(typeof f.timeoutMin === "number" && f.timeoutMin > 0)) p.push(`flows[${i}].timeoutMin must be a positive number of minutes`);
      const names = checkEntries(p, `flows[${i}].steps`, f.steps, "name", ["run"]);
      for (const n of names) {
        const other = steps.get(n);
        if (other !== undefined && other !== String(f.name)) p.push(`flows: step "${n}" is in "${other}" and "${String(f.name)}"; step names must be unique across flows`);
        steps.set(n, String(f.name));
      }
    });
  }
  if (Array.isArray(m.flows) && m.flows.length > 0 && Array.isArray(m.tables)) {
    if (m.tables.length === 0) p.push("flows need tables: the rows a flow writes are read back by its run tag through `tables`");
    // `data.ts` readByTag starts from the root tables with a tag column; without one a flow's rows are never found.
    else if (!m.tables.some((t) => isObj(t) && t.parent === undefined && isStr(t.tagColumn))) {
      p.push("flows need a root table (no `parent`) with a `tagColumn`: the run tag is found there, and every child table is reached from it");
    }
  }

  checkLanes(p, m.lanes);
  checkSettings(p, m);
  if (!isObj(m.known) || !Object.values(m.known).every((v) => typeof v === "string")) p.push("known must be { <key>: <reason> }");
  if (!Array.isArray(m.artefacts)) p.push("artefacts must be an array (it may be empty)");
  else m.artefacts.forEach((a, i) => { if (!isObj(a) || !isStr(a.id) || !isFn(a.test) || !isStr(a.layer)) p.push(`artefacts[${i}] must be { id, layer, test, reason }`); });
  if (!isObj(m.budgets)) p.push("budgets must be an object (it may be empty: {})");
  else {
    for (const [lane, min] of Object.entries(m.budgets)) {
      if (!LANE_SET.has(lane)) p.push(`budgets: unknown lane "${lane}"`);
      else if (typeof min !== "number" || !(min > 0)) p.push(`budgets.${lane} must be a positive number of minutes`);
    }
  }
  for (const fn of ["fingerprint", "reset", "readValidation", "readGates"]) if (m[fn] !== undefined && !isFn(m[fn])) p.push(`${fn} must be a function`);
  if (m.mutations !== undefined && !Array.isArray(m.mutations)) p.push("mutations must be an array");

  if (p.length) {
    throw new Error(`Manifest of screen "${slug}" (e2e/screens/${slug}/manifest.ts) is invalid:\n - ${p.join("\n - ")}`);
  }
  return value as unknown as ScreenManifest;
}
