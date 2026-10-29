/**
 * The readable console log of the two Dataverse bulk saves (D59): Add Cost from Table's Save
 * (`./addCostSheet.ts`) and the DEVEX/CAPEX Add/Edit Cost panel's Save and Delete
 * (`./capexWrites.ts`).
 *
 * SHAPE. Every event prints ONE summary line through `console.info` first: greppable, short enough
 * to paste into a support ticket, and in the one unit `formatMs` (exact ms with a thousands
 * separator). Below it come collapsed groups (`console.groupCollapsed`) with the detail: tables
 * through `console.table`, durations in the readable `formatRequestDuration` form. A console
 * without groups or tables gets the same content as indented plain lines.
 *
 * PURE BUILDERS, ONE EMITTER. Everything here except `emitSaveLog` is pure: no console, no clock,
 * no React. `emitSaveLog` never throws; logging must not turn a successful save into a failure,
 * or a background outcome into a rejection.
 *
 * WHAT IS NEVER PRINTED READABLY: record ids and record names (D59 decision 3). Counts only. Error
 * messages pass `messageOf`, which replaces every GUID with `<id>`. The one exception is the raw
 * error object, kept for support in its own collapsed "Raw error (for support)" group, exactly as
 * the screen's `console.error` printed it before.
 *
 * The duration formats are `formatMs` / `formatRequestDuration` in `./bulkSend.ts`, never a copy
 * (CONVENTIONS rule 17).
 */
import {
  SAVE_REQUEST_LIMIT, formatMs, formatRequestDuration, type RequestMeter, type UpsertGroupReport,
} from "./bulkSend";

/** Rows shown per table; the rest are summarised in an `… and N more` line. */
export const MAX_TABLE_ROWS = 50;
/** Longest error message printed; the rest is cut and marked with `...`. */
export const MAX_MESSAGE = 300;
/** Deepest `cause` followed in an error chain. */
const MAX_CHAIN = 8;
/** Dataverse messages often embed row ids; they are replaced, so no id reaches a readable line. */
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export type SaveLogRow = Record<string, string | number>;

export interface SaveLogSection {
  title: string;
  lines: readonly string[];
  table?: readonly SaveLogRow[];
  /** Printed as it is through `console.error` (the raw error group only). */
  raw?: unknown;
}

export interface SaveLogReport {
  summary: string;
  sections: readonly SaveLogSection[];
}

/** `1 request`, `2 requests`; `1 row`, `3 rows`. Counts get a thousands separator. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** An error, or any thrown value, as one short line with every GUID replaced. Never throws. */
export function messageOf(error: unknown): string {
  let text: string;
  try {
    // A plain `{ message }` object (the SDK's `IOperationResult.error`, the innermost cause of a
    // refused write) is read by its message, not printed as `[object Object]`.
    const plain = typeof error === "object" && error !== null && !(error instanceof Error)
      ? (error as { message?: unknown }).message : undefined;
    text = error instanceof Error ? error.message : typeof error === "string" ? error
      : typeof plain === "string" ? plain : String(error);
  } catch {
    text = "unreadable error";
  }
  text = text.replace(GUID, "<id>").replace(/\s+/g, " ").trim();
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}...` : text;
}

/** An error's name, or the type of a thrown non-error; never throws. */
function nameOf(error: unknown): string {
  try {
    if (error instanceof Error) return error.name;
    // The SDK's plain `{ message, status }` refusal: name it for what it is.
    if (typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string") {
      return "Dataverse error";
    }
    return typeof error;
  } catch {
    return "unknown";
  }
}

/** The HTTP status an error carries (`DataError.status`), if any; never throws. */
function statusOf(error: unknown): number | undefined {
  try {
    const status = (error as { status?: unknown } | null)?.status;
    return typeof status === "number" ? status : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The error and its `cause` chain, one readable line each, outermost first:
 * `SavePlanError: Save failed in phase 2 …`, `DataError (HTTP 403): …`. Never throws.
 */
export function errorChainLines(error: unknown): string[] {
  const lines: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CHAIN && current !== undefined && current !== null; depth += 1) {
    const status = statusOf(current);
    lines.push(`${depth === 0 ? "" : "caused by "}${nameOf(current)}${status === undefined ? "" : ` (HTTP ${status})`}: ${messageOf(current)}`);
    try {
      current = (current as { cause?: unknown }).cause;
    } catch {
      break;
    }
  }
  return lines;
}

/** The innermost error message of a chain, readable; for a one-line summary. Never throws. */
export function rootMessageOf(error: unknown): string {
  const chain = errorChainLines(error);
  const last = chain[chain.length - 1] ?? messageOf(error);
  return last.replace(/^caused by /, "");
}

/** One timed step of a save, for the steps table. */
export interface SaveLogStep {
  label: string;
  /** When it started, from the start of the save (ms). */
  startMs?: number;
  /** How long it took (ms); absent when it did not run (deferred, skipped). */
  ms?: number;
  requests?: number;
  /** How it went out, e.g. `create 1 bulk [1.4 s]`; readable form. */
  detail?: string;
  status: "ok" | "failed" | "deferred" | "skipped";
}

/** The steps by start time, the ones without a start last; stable otherwise. */
export function inStartOrder<T extends { startMs?: number }>(steps: readonly T[]): T[] {
  return steps
    .map((step, i) => ({ step, i }))
    .sort((a, b) => (a.step.startMs ?? Infinity) - (b.step.startMs ?? Infinity) || a.i - b.i)
    .map(({ step }) => step);
}

const RESULT_TEXT: Record<SaveLogStep["status"], string> = {
  ok: "ok", failed: "FAILED", deferred: "in the background", skipped: "not sent",
};

/** At most `MAX_TABLE_ROWS` rows, plus an `… and N more` line. */
function capped(rows: readonly SaveLogRow[], what: string): { table: SaveLogRow[]; more: string[] } {
  if (rows.length <= MAX_TABLE_ROWS) return { table: [...rows], more: [] };
  return { table: rows.slice(0, MAX_TABLE_ROWS), more: [`… and ${rows.length - MAX_TABLE_ROWS} more ${what}`] };
}

/** The steps table, in start order. */
export function stepsSection(steps: readonly SaveLogStep[], title = "Steps (start order)"): SaveLogSection {
  const rows = inStartOrder(steps).map((s): SaveLogRow => ({
    Step: s.label,
    Started: s.startMs === undefined ? "–" : formatRequestDuration(s.startMs),
    Took: s.ms === undefined ? "–" : formatRequestDuration(s.ms),
    Requests: s.requests === undefined ? "–" : s.requests,
    How: s.detail || "–",
    Result: RESULT_TEXT[s.status],
  }));
  const { table, more } = capped(rows, "steps");
  return { title, lines: more, table };
}

/**
 * One upsert's groups for a steps table's "How" column, readable (D59, shared by both saves):
 * `create 12 rows: 1 request, bulk [1.4 s]; update 3 rows: FAILED, per-row after 501`, then each
 * non-empty `extras` entry (e.g. `2 unchanged skipped`), all joined with `; `. `nothing to send`
 * when there is neither.
 */
export function groupsText(groups: readonly UpsertGroupReport[], extras: readonly string[] = []): string {
  return [
    ...groups.map((g) => `${g.action} ${plural(g.rows, "row")}: `
      + `${g.failed ? "FAILED" : plural(g.requests ?? 0, "request")}, ${g.path}`
      + (g.durations.length > 0 ? ` [${g.durations.map(formatRequestDuration).join(", ")}]` : "")),
    ...extras.filter((e) => e !== ""),
  ].join("; ") || "nothing to send";
}

/** `avg 380 ms max 1,200 ms` of a meter, in exact ms. */
function averageMs(meter: RequestMeter): number {
  return meter.count === 0 ? 0 : meter.totalMs / meter.count;
}

/**
 * The summary line's gate tail: `gate peak 4/16, req avg 1,240 ms max 1,900 ms`. The peak and the
 * averages are THIS save's write requests only (D59 decision 4); when the shared gate held more at
 * once (other work writing), `, shared gate peak 6/16` follows.
 */
export function gateTail(meter: RequestMeter): string {
  return `gate peak ${meter.peak}/${SAVE_REQUEST_LIMIT}, `
    + `req avg ${formatMs(averageMs(meter))} max ${formatMs(meter.maxMs)}`
    + (meter.sharedPeak > meter.peak ? `, shared gate peak ${meter.sharedPeak}/${SAVE_REQUEST_LIMIT}` : "");
}

/**
 * The "Requests" group: the write requests a meter counted, in words. `extra` lines are appended.
 * `subject` names whose requests they are (default `this save`; e.g. `the background reconcile`).
 */
export function requestsSection(
  meter: RequestMeter, extra: readonly string[] = [], subject = "this save",
): SaveLogSection {
  const lines = [
    `Write requests of ${subject}: ${meter.count.toLocaleString("en-US")}; at most ${meter.peak} of ${SAVE_REQUEST_LIMIT} in flight at once`,
    meter.count === 0
      ? "Time per write request: none sent"
      : `Time per write request (inside the gate, queueing excluded): average ${formatRequestDuration(averageMs(meter))}, slowest ${formatRequestDuration(meter.maxMs)}`,
    ...(meter.sharedPeak > meter.peak
      ? [`Shared write gate: up to ${meter.sharedPeak} of ${SAVE_REQUEST_LIMIT} in flight, other work included`]
      : []),
    ...extra,
  ];
  return { title: "Requests", lines };
}

/** The "Failure" group: which steps completed and failed, and the error chain, readable. */
export function failureSection(error: unknown, steps: readonly SaveLogStep[] = [], extra: readonly string[] = []): SaveLogSection {
  const ordered = inStartOrder(steps);
  const done = ordered.filter((s) => s.status === "ok").map((s) => s.label);
  const failed = ordered.filter((s) => s.status === "failed").map((s) => s.label);
  const notSent = ordered.filter((s) => s.status === "skipped").map((s) => s.label);
  const lines = [
    ...(steps.length === 0 ? [] : [
      `Steps completed: ${done.length > 0 ? done.join("; ") : "none"}`,
      `Steps failed: ${failed.length > 0 ? failed.join("; ") : "none recorded (see the error)"}`,
      ...(notSent.length > 0 ? [`Not sent: ${notSent.join("; ")}`] : []),
    ]),
    ...extra,
    ...errorChainLines(error).map((line, i) => (i === 0 ? `Error: ${line}` : `  ${line}`)),
  ];
  return { title: "Failure", lines };
}

/** The raw error object for support: printed as it is, in its own collapsed group. */
export function rawErrorSection(error: unknown): SaveLogSection {
  return { title: "Raw error (for support)", lines: [], raw: error };
}

type ConsoleLike = Partial<Pick<Console, "info" | "error" | "groupCollapsed" | "groupEnd" | "table">>;

/**
 * Prints the report: the summary through `console.info`, then each section as a collapsed group
 * (lines through `console.info`, the table through `console.table`, a raw error through
 * `console.error`). Without the group / table methods everything goes out as indented plain lines.
 * Never throws. Pass a BUILDER (`() => report`) wherever building the report could in principle
 * throw on a save path: it is then built inside this guard too.
 */
export function emitSaveLog(input: SaveLogReport | (() => SaveLogReport)): void {
  try {
    const report = typeof input === "function" ? input() : input;
    const c: ConsoleLike = console;
    const info = (text: string): void => { if (typeof c.info === "function") c.info(text); };
    info(report.summary);
    for (const section of report.sections) {
      let grouped = false;
      try {
        if (typeof c.groupCollapsed === "function" && typeof c.groupEnd === "function") {
          c.groupCollapsed(section.title);
          grouped = true;
        } else {
          info(`  ${section.title}:`);
        }
        for (const line of section.lines) info(grouped ? line : `    ${line}`);
        if (section.table && section.table.length > 0) {
          if (typeof c.table === "function") c.table(section.table);
          else for (const row of section.table) info(`    ${Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(" | ")}`);
        }
        if ("raw" in section && typeof c.error === "function") c.error(section.raw);
      } catch {
        // A console that throws must not stop the rest of the report, or the save.
      } finally {
        if (grouped) {
          try { c.groupEnd?.(); } catch { /* ignored */ }
        }
      }
    }
  } catch {
    // Logging must never fail the save.
  }
}
