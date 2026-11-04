/**
 * The parity harness: the fact store (D80, contract `FactFile`).
 *
 * Every lane records what it saw as JSON facts; nothing compares inside a lane. Screen-agnostic: the screen is only the
 * slug in `env.screen`. Layout (`<runDir>` = `e2e/runs/<runId>/<screen>`, `env.ts`):
 *
 *   <runDir>/facts/<kind>/<layer>/<file>.json          one FactFile per state / group / flow step
 *   <runDir>/run.json                                  run metadata (preflight, phases)
 *   e2e/reference/<screen>/facts/canvas/<layer>/...    the cached Canvas reference (`compare` mode reads it)
 *   e2e/reference/<screen>/meta.json                   { canvasVersion, fingerprint, recordedAt, runId }
 *
 * The old flat `e2e/reference/*.json` files of the earlier specs are left alone; the per-screen folders sit beside them.
 * `<file>` is the key made safe for a file name (`factFileName`); the original key is kept inside the JSON, and readers
 * use that, never the file name.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FactFile, Kind, Layer, RunEnv } from "./contract";
import { REPO_ROOT } from "./env";

const LAYERS: readonly Layer[] = ["static", "rules", "visual", "ux", "validation", "gates", "flows", "data", "platform"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Windows device names that cannot be file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

export interface ReferenceMeta {
  canvasVersion: string;
  fingerprint: Record<string, number | string>;
  recordedAt: string;
  runId: string;
}

/**
 * A key as a safe file name (without `.json`). A key that is already safe (letters, digits, `.`, `_`, `-`; at most 100
 * characters; not a Windows device name; no leading dot) is used as it is. Any other key is cleaned AND gets an 8-character
 * hash of the original appended, so two keys that clean to the same text (`a/b`, `a:b`) never share a file.
 */
export function factFileName(key: string): string {
  if (/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/.test(key) && !RESERVED.test(key) && !key.endsWith(".")) return key;
  const hash = createHash("sha1").update(key, "utf8").digest("hex").slice(0, 8);
  const clean = key.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+|[._]+$/g, "").slice(0, 80);
  return `${clean || "key"}-${hash}`;
}

let tmpSeq = 0;
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Writes JSON through a temp file and a rename, so a reader never sees half a file. On Windows a rename onto a file another
 * process has open fails with EPERM / EBUSY for a moment (a reader, an indexer, OneDrive), so it is retried a few times.
 */
function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${tmpSeq++}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        rmSync(tmp, { force: true });
        throw e;
      }
      pause(50 * (attempt + 1));
    }
  }
}

function assertLayer(layer: string): asserts layer is Layer {
  if (!(LAYERS as readonly string[]).includes(layer)) throw new Error(`Unknown parity layer "${layer}" (one of ${LAYERS.join(", ")})`);
}

/** Records one fact: `<runDir>/facts/<kind>/<layer>/<file>.json`. Returns the file's path. Overwrites the same key. */
export function writeFact(env: RunEnv, kind: Kind, layer: Layer, key: string, data: unknown): string {
  assertLayer(layer);
  if (!key) throw new Error("writeFact: the key is empty");
  const fact: FactFile = { screen: env.screen, kind, layer, key, recordedAt: new Date().toISOString(), data };
  const path = join(env.runDir, "facts", kind, layer, `${factFileName(key)}.json`);
  writeJsonAtomic(path, fact);
  return path;
}

/**
 * The facts of one app under `dir` (a run directory or a reference directory: both hold `facts/<kind>/<layer>/`), for one
 * layer or all of them. Sorted by layer, then key, so a report is stable. A missing folder gives []; a malformed file throws
 * with its path (a broken recording must not read as "nothing recorded").
 */
export function readFacts(dir: string, kind: Kind, layer?: Layer): FactFile[] {
  if (layer !== undefined) assertLayer(layer);
  const out: FactFile[] = [];
  for (const l of layer ? [layer] : LAYERS) {
    const folder = join(dir, "facts", kind, l);
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) {
      if (!name.endsWith(".json")) continue; // skips leftover `.tmp` files
      const path = join(folder, name);
      try {
        out.push(JSON.parse(readFileSync(path, "utf8")) as FactFile);
      } catch (e) {
        throw new Error(`Malformed fact file ${path}: ${(e as Error).message}`);
      }
    }
  }
  return out.sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** `e2e/reference/<screen>/` (the per-screen layout). `root` is for tests; it defaults to the code repo. */
export function referenceDir(screen: string, root: string = REPO_ROOT): string {
  if (!SLUG.test(screen)) throw new Error(`Screen slug must be lower-case kebab-case (got "${screen}")`);
  return join(root, "e2e", "reference", screen);
}

/** The cached Canvas reference's meta.json, or null when there is no reference (or it is unreadable). */
export function readReferenceMeta(screen: string, root: string = REPO_ROOT): ReferenceMeta | null {
  const path = join(referenceDir(screen, root), "meta.json");
  try {
    const m = JSON.parse(readFileSync(path, "utf8")) as Partial<ReferenceMeta>;
    if (typeof m.canvasVersion !== "string" || typeof m.runId !== "string" || typeof m.recordedAt !== "string"
      || typeof m.fingerprint !== "object" || m.fingerprint === null) return null;
    return m as ReferenceMeta;
  } catch {
    return null;
  }
}

/**
 * Makes this run's Canvas facts the cached reference, and meta.json records the canvas version and data fingerprint it was
 * recorded against. Throws (and changes nothing) when the run recorded no Canvas facts. Returns the reference directory.
 *
 * Per layer: each layer this run recorded replaces that layer of the reference; a layer the run did not record (the flows of
 * a `read`-tier run) is kept, so a read run never throws away the Canvas rows of an earlier full run. When the canvas version
 * changes, the whole reference is replaced: facts of an older canvas must not survive beside the new ones.
 */
export function promoteReference(
  env: RunEnv, canvasVersion: string, fingerprint: Record<string, number | string>, root: string = REPO_ROOT,
): string {
  const from = join(env.runDir, "facts", "canvas");
  const recorded = existsSync(from) ? readFacts(env.runDir, "canvas") : [];
  if (recorded.length === 0) {
    throw new Error(`promoteReference: run ${env.runId} recorded no Canvas facts (${from})`);
  }
  const ref = referenceDir(env.screen, root);
  const to = join(ref, "facts", "canvas");
  const sameCanvas = readReferenceMeta(env.screen, root)?.canvasVersion === canvasVersion;
  if (!sameCanvas) rmSync(to, { recursive: true, force: true });
  for (const layer of new Set(recorded.map((f) => f.layer))) {
    const layerTo = join(to, layer);
    rmSync(layerTo, { recursive: true, force: true });
    mkdirSync(dirname(layerTo), { recursive: true });
    cpSync(join(from, layer), layerTo, { recursive: true, filter: (src) => !src.endsWith(".tmp") });
  }
  const meta: ReferenceMeta = { canvasVersion, fingerprint, recordedAt: new Date().toISOString(), runId: env.runId };
  writeJsonAtomic(join(ref, "meta.json"), meta);
  return ref;
}

/** `<runDir>/run.json`, or null when it does not exist yet. */
export function runJson<T = Record<string, unknown>>(env: RunEnv): T | null {
  const path = join(env.runDir, "run.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * When `lane` started in this Playwright invocation (`runner` = the runner process's pid, a worker's `process.ppid`): read from
 * `<runDir>/lanes/<lane>.clock.json`, or started at `now` and written there. Kept in a file so a lane's clock survives a worker
 * restart after a failure; a file from another invocation (the re-run pass) or a malformed one is replaced.
 */
export function laneStartedAt(runDir: string, lane: string, runner: number, now: number = Date.now()): number {
  const file = join(runDir, "lanes", `${factFileName(lane)}.clock.json`);
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as { startedAt?: unknown; runner?: unknown };
    if (c.runner === runner && typeof c.startedAt === "number") return c.startedAt;
  } catch {
    // missing or malformed: a new clock
  }
  writeJsonAtomic(file, { lane, runner, startedAt: now });
  return now;
}

/** Writes `<runDir>/run.json` (replaces it; read it with `runJson` first to merge). Returns the path. */
export function writeRunJson(env: RunEnv, data: unknown): string {
  const path = join(env.runDir, "run.json");
  writeJsonAtomic(path, data);
  return path;
}
