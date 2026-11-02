/**
 * The request log: what the app asked Dataverse for, how long it took and how many rows came back.
 *
 * Everything goes to the browser console (DevTools → Console, filter `[VSB]`), in every build; there
 * is no switch (product owner, 29 Oct 2026). Three kinds of line share one prefix:
 *
 *   [VSB] HTTP   GET vsb_projects?$select=… → 200 · 312 ms · 14.2 kB     every request the SDK sends, from any screen
 *   [VSB] DATA   delete vsb_costs: 40 rows, 40 calls, 3,100 ms in total …  data-layer calls of one kind and table, summed, with their row count
 *   [VSB] ACTION Mutation @ /project/generators: 640 ms, 4 requests …     one user action or page load, summarised
 *
 * The HTTP line is fed by the SDK's own `networkRequest` metric (`platform/powerClient.ts`), so no
 * call site can be missed. The DATA lines come from the shared helpers in `data/client.ts` and
 * `data/executePlan.ts`; the ACTION lines from the query / mutation caches (`app/Providers.tsx`) and
 * from `actionLog` for a flow of one's own.
 *
 * Only counts, names and timings are logged — never a row's values, so nothing personal reaches the console.
 *
 * Troubleshooting aids (D74):
 *   - Every ACTION has a short id (`a7`); the HTTP and DATA lines made while it was open end with `[a7]`, so one save can be followed
 *     through all its requests. (Overlapping actions list every open id: `[a7,a8]`.)
 *   - A request over `SLOW_REQUEST_MS`, an action over `SLOW_ACTION_MS` and a batch whose slowest call is over the request limit print as a
 *     warning ending `· SLOW`: filter the console for `SLOW`.
 *   - `[VSB] ERROR …` lines (`logError`, fed by `platform/telemetry.ts`) carry the root cause, the route, and for an unhandled crash
 *     the last actions.
 *
 * Attribution: an ACTION owns every request that starts while it is open. Two actions that overlap
 * both count the requests made meanwhile; the numbers are a trace, not an invoice.
 */
import type { Metric } from "@microsoft/power-apps/telemetry";

export const LOG_PREFIX = "[VSB]";

type NetworkData = Extract<Metric, { type: "networkRequest" }>["data"];

export type DataKind = "read" | "create" | "update" | "delete" | "execute";

export interface DataCall {
  kind: DataKind;
  /** The table or the data-layer operation name, e.g. `vsb_projects` or `Load project list`. */
  target: string;
  /** Rows read, written or deleted by the call. */
  rows?: number;
  /** Pages walked, for a read that followed a skip token. */
  pages?: number;
  ms: number;
  ok: boolean;
  /** Short failure text, only when `ok` is false. */
  error?: string;
}

interface Scope {
  id: string;
  name: string;
  started: number;
  requests: number;
  failed: number;
  httpMs: number;
  rows: number;
  ops: Map<string, number>;
}

const scopes = new Set<Scope>();
let sequence = 0;

/** A request slower than this, or an action slower than this, is flagged `SLOW`. */
export const SLOW_REQUEST_MS = 3000;
export const SLOW_ACTION_MS = 5000;

/** The last few actions that ended, newest last, for the context of an unhandled error. */
const RECENT_MAX = 5;
const recent: string[] = [];
export function recentActions(): readonly string[] {
  return recent;
}

/** ` [a7]` for the open action, ` [a7,a8]` for overlapping ones, nothing outside any action. */
const idTag = (): string => (scopes.size ? ` [${[...scopes].map((s) => s.id).join(",")}]` : "");

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

const round = (n: number): number => Math.round(n);

/** `1,234` for a count, `12.3 kB` for a size. */
const kb = (bytes: number): string => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`);

/** A request URL without the host, the long `$select` list cut so a line stays readable. */
export function shortUrl(url: string, max = 180): string {
  let text = url;
  try {
    const u = new URL(url, "https://host.invalid");
    text = decodeURIComponent(`${u.pathname}${u.search}`).replace(/^\/(api\/data\/v\d+(\.\d+)?\/)?/, "");
  } catch {
    // An unparsable URL is logged as it came.
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const emit = (level: "info" | "warn" | "error", line: string): void => {
  try {
    console[level](line);
  } catch {
    // Logging must never break the app.
  }
};

/** One line per request the SDK sent. A 4xx/5xx is a warning. */
export function logHttp(d: NetworkData): void {
  for (const s of scopes) {
    s.requests += 1;
    s.httpMs += d.duration;
    if (d.statusCode >= 400) s.failed += 1;
  }
  const size = d.responseSize !== undefined ? ` · ${kb(d.responseSize)}` : "";
  const slow = d.duration >= SLOW_REQUEST_MS;
  emit(
    d.statusCode >= 400 || slow ? "warn" : "info",
    `${LOG_PREFIX} HTTP ${d.method} ${shortUrl(d.url)} → ${d.statusCode} · ${round(d.duration)} ms${size}${slow ? " · SLOW" : ""}${idTag()}`,
  );
}

interface Batch {
  kind: DataKind;
  target: string;
  calls: number;
  failed: number;
  rows: number;
  pages: number;
  sumMs: number;
  maxMs: number;
  firstStart: number;
  lastEnd: number;
  lastError?: string;
  /** Ids of the actions that were open while the calls ran. */
  ids: Set<string>;
}

/** Calls of one kind on one target that finish within this quiet gap are printed as one line. */
export const DATA_BATCH_GAP_MS = 300;
/** A batch is printed at the latest this long after its first call, however busy the target stays. */
export const DATA_BATCH_MAX_MS = 2000;

const batches = new Map<string, Batch>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const num = (n: number): string => round(n).toLocaleString("en-US");

function batchLine(b: Batch): { level: "info" | "warn"; line: string } {
  const rows = `${num(b.rows)} row${b.rows === 1 ? "" : "s"}`;
  const pages = b.pages > b.calls ? `, ${b.pages} pages` : "";
  const wall = b.lastEnd - b.firstStart;
  const time = b.calls === 1
    ? `${num(b.sumMs)} ms`
    : `${num(b.calls)} calls, ${num(wall)} ms in total (average ${num(b.sumMs / b.calls)} ms, slowest ${num(b.maxMs)} ms)`;
  const failed = b.failed ? `, ${b.failed} FAILED${b.lastError ? ` (${b.lastError})` : ""}` : "";
  const slow = b.maxMs >= SLOW_REQUEST_MS;
  const tag = b.ids.size ? ` [${[...b.ids].join(",")}]` : "";
  return {
    level: b.failed || slow ? "warn" : "info",
    line: `${LOG_PREFIX} DATA ${b.kind} ${b.target}: ${rows}${pages}, ${time}${failed}${slow ? " · SLOW" : ""}${tag}`,
  };
}

/** Prints every pending DATA batch now (an action closing does this, so its lines come first). */
export function flushDataLog(): void {
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
  const pending = [...batches.values()];
  batches.clear();
  for (const b of pending) {
    const { level, line } = batchLine(b);
    emit(level, line);
  }
}

/**
 * One DATA line per kind and table, however many calls it took: 40 single-row deletes of one table
 * print as "40 rows, 40 calls, … ms in total (average, slowest)". The line appears once the table
 * has been quiet for a moment, or when the surrounding action ends.
 */
export function logData(call: DataCall): void {
  const rows = call.rows ?? 0;
  for (const s of scopes) {
    s.rows += rows;
    const key = `${call.kind} ${call.target}`;
    s.ops.set(key, (s.ops.get(key) ?? 0) + 1);
  }
  const end = now();
  const key = `${call.kind} ${call.target}`;
  const b = batches.get(key) ?? {
    kind: call.kind, target: call.target, calls: 0, failed: 0, rows: 0, pages: 0,
    sumMs: 0, maxMs: 0, firstStart: end - call.ms, lastEnd: end, ids: new Set<string>(),
  };
  for (const s of scopes) b.ids.add(s.id);
  b.calls += 1;
  b.rows += rows;
  b.pages += call.pages ?? 1;
  b.sumMs += call.ms;
  b.maxMs = Math.max(b.maxMs, call.ms);
  b.firstStart = Math.min(b.firstStart, end - call.ms);
  b.lastEnd = end;
  if (!call.ok) {
    b.failed += 1;
    if (call.error) b.lastError = call.error;
  }
  batches.set(key, b);
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  const oldest = Math.min(...[...batches.values()].map((x) => x.firstStart));
  flushTimer = setTimeout(flushDataLog, end - oldest >= DATA_BATCH_MAX_MS ? 0 : DATA_BATCH_GAP_MS);
}

const routeOf = (): string => {
  try {
    return window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  } catch {
    return "/";
  }
};

/**
 * One ERROR line: what failed, its root cause (status, server text, request id), the route, and with
 * `context` (an unhandled crash) the last actions that ran. Counts and names only, no row values.
 * Not for expected outcomes: the caller (`trace`) decides what is an error.
 */
export function logError(message: string, cause?: string, context = false): void {
  const where = ` @ ${routeOf()}`;
  const last = context && recent.length ? ` · last actions: ${recent.join(" → ")}` : "";
  emit("error", `${LOG_PREFIX} ERROR ${message}${cause ? ` — ${cause}` : ""}${where}${last}${idTag()}`);
}

/** A free-form ACTION line (the Add Cost from Table save keeps its own wording behind this prefix). */
export function logAction(message: string): void {
  emit("info", `${LOG_PREFIX} ACTION ${message}`);
}

const MAX_OPS_SHOWN = 6;

function summary(s: Scope, ok: boolean): string {
  const ops = [...s.ops].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
  const shown = ops.slice(0, MAX_OPS_SHOWN).join("; ") + (ops.length > MAX_OPS_SHOWN ? `; +${ops.length - MAX_OPS_SHOWN} more` : "");
  const elapsed = now() - s.started;
  return `${s.name}: ${round(elapsed)} ms, ${s.requests} request${s.requests === 1 ? "" : "s"}`
    + `${s.failed ? ` (${s.failed} failed)` : ""}, ${s.rows} row${s.rows === 1 ? "" : "s"}`
    + `${ok ? "" : ", FAILED"}${elapsed >= SLOW_ACTION_MS ? " · SLOW" : ""}${shown ? ` — ${shown}` : ""} [${s.id}]`;
}

/** Opens an ACTION. `end(ok)` prints its summary line; calling it twice prints once. */
export function beginAction(name: string): (ok: boolean) => void {
  sequence += 1;
  const scope: Scope = { id: `a${sequence}`, name, started: now(), requests: 0, failed: 0, httpMs: 0, rows: 0, ops: new Map() };
  scopes.add(scope);
  let done = false;
  return (ok) => {
    if (done) return;
    done = true;
    flushDataLog();
    scopes.delete(scope);
    const slow = now() - scope.started >= SLOW_ACTION_MS;
    recent.push(`${scope.name} ${ok ? "ok" : "FAILED"}`);
    if (recent.length > RECENT_MAX) recent.shift();
    emit(ok && !slow ? "info" : "warn", `${LOG_PREFIX} ACTION ${summary(scope, ok)}`);
  };
}

/** Runs `fn` as one ACTION: its requests and rows are summarised in one line when it settles. */
export async function actionLog<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const end = beginAction(name);
  try {
    const result = await fn();
    end(true);
    return result;
  } catch (error) {
    end(false);
    throw error;
  }
}

/**
 * Times a data-layer call and logs it. `rowsOf` turns the result into a row count; without it the
 * call is logged with no count (a write of one row passes `() => 1`).
 */
export async function loggedCall<T>(
  kind: DataKind, target: string, call: () => Promise<T>, rowsOf?: (result: T) => number | undefined,
): Promise<T> {
  const t0 = now();
  try {
    const result = await call();
    const rows = rowsOf?.(result);
    logData({ kind, target, ...(rows !== undefined ? { rows } : {}), ms: now() - t0, ok: true });
    return result;
  } catch (error) {
    logData({ kind, target, ms: now() - t0, ok: false, error: error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120) });
    throw error;
  }
}

/** For tests: forget any open action. */
export function resetRequestLog(): void {
  scopes.clear();
  sequence = 0;
  recent.length = 0;
  batches.clear();
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
}
