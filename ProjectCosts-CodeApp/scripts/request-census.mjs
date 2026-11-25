#!/usr/bin/env node
/**
 * Request census (dvopt T-00): turns a capture of the app's `[VSB]` console lines into the numbers that decide the network work
 * (requests by kind, duplicates, waves, ms, SLOW, 429 / 5xx, retries).
 *
 *   node scripts/request-census.mjs <capture.txt> [--scenario name] [--json]
 *
 * Plain Node, no dependencies. It READS the capture and prints; it writes nothing. It never keeps or prints a row value: of an HTTP
 * line it keeps the method, the table (entity set), the status, the duration and a short hash of the request shape (for duplicate
 * detection); of a DATA line the kind, table and counts; of an ACTION line its name and counts; of an ERROR line only the status
 * and the first words of its message. The logger itself never writes a value (`platform/requestLog.ts`), this adds a second guard.
 *
 * INPUT. Any text that contains the logger's lines: a DevTools "Save as…" of the console, a Playwright console dump, a copy and
 * paste. A line may carry anything before `[VSB]` (a level such as `[warning]`, a source location, a timestamp); the parser takes
 * from `[VSB] ` on. A leading timestamp (ISO `2026-11-25T10:20:30.123Z` or clock `10:20:30.123`) is used when present.
 * Scenario markers (a line `# scenario: <name>` or `=== scenario: <name> ===`) start a named scenario; lines before the first
 * marker belong to the scenario `(capture)`.
 *
 * LINE FORMATS (from `requestLog.ts`, UT-REQLOG-*):
 *   [VSB] HTTP GET vsb_projects?$select=… → 200 · 312 ms · 14.2 kB [· SLOW] [ [a7,a8]]
 *   [VSB] DATA read vsb_x: 3 rows[, 3 pages], 40 calls, 3,100 ms in total (average 77 ms, slowest 300 ms)[, 2 FAILED (…)][ · SLOW][ [a7]]
 *   [VSB] ACTION <name>: 640 ms, 4 requests (1 failed), 14 rows[, FAILED][, note][ · SLOW][ — read vsb_x ×3; …] [a7]
 *   [VSB] ACTION <free text>                         (retry warnings, bulk summaries, …)
 *   [VSB] ERROR <message> — <cause> @ <route>[ · last actions: …][ [a7]]
 *
 * WHAT THE LOG DOES AND DOES NOT SAY.
 *  - An HTTP / DATA line is printed when the call ENDS; it carries the duration but no start time. The action id tag (`[a7]`) lists
 *    the actions open at the time of the line, and an action owns every request made while it is open (overlapping actions both
 *    count the requests made meanwhile: "a trace, not an invoice"). So requests are attributed to the FIRST id of the tag.
 *  - HTTP lines are the real requests. DATA lines are the data layer's view of the same requests (one line per kind and table, summed),
 *    so they are reported apart and never added to the request count.
 *  - WAVES (sequential depth). With timestamps on the lines, the end time of a request is the line's time and its start is
 *    end - ms: the depth is the longest chain of requests where each starts after the previous one ended (method `timestamps`).
 *    Without timestamps the order of lines is the only ordering, and overlap cannot be seen. Then each action's waves are
 *    ESTIMATED as its elapsed time (from its ACTION summary) divided by the mean HTTP duration of its requests, clamped to 1..requests
 *    (method `elapsed-estimate`); an action with no summary or no requests has no estimate (`none`). The estimate is a guide for
 *    "one wave or ten", not a measurement: confirm a suspect with timestamps (Chrome DevTools → Settings → Console → "Show timestamps").
 *  - RETRIES. The `core` agent's retry lines are ACTION lines that are not summaries and contain both a form of "try" (`try`,
 *    `tries`, `trying`) and "failed". The match is deliberately conservative (it can miss a differently worded line, and it
 *    can match a bulk line that mentions both); the count is a lower bound of the real retry lines, reported with the HTTP status
 *    and wait the line states.
 *  - Duplicates. HTTP: the same method and request shape (a hash of the path and query, ids normalised) more than once under one
 *    action. DATA: the same kind, table and row count more than once under one action. Reported as the number of EXTRA repeats.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DEFAULT_SCENARIO = "(capture)";
const NO_ACTION = "(no action)";

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const toInt = (text) => Number(String(text).replace(/,/g, ""));

/** FNV-1a, 32 bit, hex: enough to tell two request shapes apart without keeping the request. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The table a request path names: `vsb_projects(<guid>)?…` → `vsb_projects`; an `api/data/vN/` prefix is dropped. */
function tableOf(path) {
  const bare = path.replace(/^\/+/, "").replace(/^api\/data\/v\d+(\.\d+)?\//i, "");
  return bare.split(/[?(/]/)[0] || "(unknown)";
}

/** A leading timestamp in `prefix` as milliseconds (clock time of day, or epoch for an ISO date), or undefined. */
function timeOf(prefix) {
  const iso = /(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?(Z)?/.exec(prefix);
  if (iso) {
    const ms = Number((iso[5] ?? "0").padEnd(3, "0"));
    return Date.UTC(+iso[1].slice(0, 4), +iso[1].slice(5, 7) - 1, +iso[1].slice(8, 10), +iso[2], +iso[3], +iso[4], ms);
  }
  const clock = /(?:^|[^\d:])(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?(?![\d:])/.exec(prefix);
  if (clock) return ((+clock[1] * 60 + +clock[2]) * 60 + +clock[3]) * 1000 + Number((clock[4] ?? "0").padEnd(3, "0"));
  return undefined;
}

const levelOf = (prefix) => {
  const m = /\[(info|log|warn|warning|error|debug)\]/i.exec(prefix);
  if (!m) return undefined;
  const l = m[1].toLowerCase();
  return l === "warning" ? "warn" : l === "log" ? "info" : l;
};

/** ` [a7]` / ` [a7,a8]` at the end of a line. */
function takeIds(body) {
  const m = /\s\[(a\d+(?:,a\d+)*)\]\s*$/.exec(body);
  return m ? { ids: m[1].split(","), rest: body.slice(0, m.index) } : { ids: [], rest: body };
}

const SCENARIO_MARK = /^\s*(?:#\s*scenario:\s*|=+\s*scenario:\s*)(.+?)\s*=*\s*$/i;

/**
 * Parses a capture. Returns `{ entries, ignored, scenarios }`; `entries` are in arrival order, each with `seq`, `scenario`, `type`
 * (`http` | `data` | `action` | `retry` | `note` | `error`), the fields of its kind (see `requestLog.ts`), `ids`, `slow`, and `t`
 * (ms) when the line had a timestamp. `ignored` counts lines that are not `[VSB]` lines. No row value is kept.
 */
export function parseVsbLines(text) {
  const entries = [];
  const scenarios = [];
  let scenario = DEFAULT_SCENARIO;
  let ignored = 0;
  let seq = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const mark = SCENARIO_MARK.exec(raw);
    if (mark) {
      scenario = mark[1].trim();
      if (!scenarios.includes(scenario)) scenarios.push(scenario);
      continue;
    }
    const at = raw.indexOf("[VSB] ");
    if (at < 0) {
      if (raw.trim()) ignored += 1;
      continue;
    }
    const prefix = raw.slice(0, at);
    const body = raw.slice(at + "[VSB] ".length).trimEnd();
    const base = { seq: seq += 1, scenario, t: timeOf(prefix), level: levelOf(prefix), slow: false, ids: [] };
    const entry = parseBody(body, base);
    if (!entry) {
      ignored += 1;
      seq -= 1;
      continue;
    }
    if (!scenarios.includes(scenario)) scenarios.push(scenario);
    entries.push(entry);
  }
  return { entries, ignored, scenarios };
}

function parseBody(body, base) {
  const { ids, rest: r0 } = takeIds(body);
  const slow = / · SLOW$/.test(r0);
  const rest = slow ? r0.replace(/ · SLOW$/, "") : r0;
  const common = { ...base, ids, slow };

  let m = /^HTTP (\S+) (.*) → (\d{3}) · (\d+(?:\.\d+)?) ms(?: · [\d.,]+ (?:kB|B))?$/.exec(rest)
    ?? /^HTTP (\S+) (.*) → (\d{3}) · (\d+(?:\.\d+)?) ms/.exec(rest);
  if (m) {
    const url = m[2].replace(GUID, "<id>");
    return { ...common, type: "http", method: m[1].toUpperCase(), target: tableOf(url), sig: hash(`${m[1]} ${url}`), status: +m[3], ms: Number(m[4]) };
  }

  m = /^DATA (\w+) (.+?): ([\d,]+) rows?(?:, ([\d,]+) pages)?, (.*)$/.exec(rest);
  if (m) {
    const tail = m[5];
    const failed = /(?:^|, )(\d+) FAILED/.exec(tail);
    const many = /^([\d,]+) calls, ([\d,]+) ms in total \(average ([\d,]+) ms, slowest ([\d,]+) ms\)/.exec(tail);
    const one = /^([\d,]+) ms/.exec(tail);
    if (!many && !one) return null;
    const calls = many ? toInt(many[1]) : 1;
    const wallMs = many ? toInt(many[2]) : toInt(one[1]);
    const avgMs = many ? toInt(many[3]) : wallMs;
    return {
      ...common, type: "data", kind: m[1], target: m[2], rows: toInt(m[3]), pages: m[4] ? toInt(m[4]) : undefined,
      calls, wallMs, sumMs: avgMs * calls, maxMs: many ? toInt(many[4]) : wallMs, failed: failed ? +failed[1] : 0,
    };
  }

  m = /^ERROR (.*)$/.exec(rest);
  if (m) {
    const status = /HTTP (\d{3})/.exec(m[1]);
    // Only the human part (before " — ") and a status are kept: the cause text can carry server wording.
    return { ...common, type: "error", status: status ? +status[1] : undefined, message: m[1].split(" — ")[0].replace(GUID, "<id>").slice(0, 60) };
  }

  m = /^ACTION (.*)$/.exec(rest);
  if (m) {
    // A summary prints ` · SLOW` before its ` — ops` list, a free-form line (retry, bulk) anywhere or at the end.
    const actionSlow = slow || / · SLOW(?: — |$)/.test(m[1]);
    const text = m[1].replace(/ · SLOW(?= — |$)/, "");
    const s = /^(.+?): (\d+) ms, (\d+) requests?(?: \((\d+) failed\))?, ([\d,]+) rows?(, FAILED)?(?:, ([^—·]*?))?(?: — (.*))?$/.exec(text);
    if (s && ids.length === 1) {
      return {
        ...common, slow: actionSlow, type: "action", id: ids[0], name: s[1], ms: +s[2], requests: +s[3], failed: s[4] ? +s[4] : 0, rows: toInt(s[5]),
        ok: !s[6], note: s[7] || undefined,
      };
    }
    if (/\btr(?:y|ies|ying)\b/i.test(text) && /\bfailed\b/i.test(text)) {
      const st = /HTTP (\d{3})/.exec(text);
      const wait = /\bin (\d[\d,]*) ms/.exec(text);
      return { ...common, type: "retry", status: st ? +st[1] : undefined, waitMs: wait ? toInt(wait[1]) : undefined };
    }
    return { ...common, type: "note" };
  }
  return null;
}

/** Nearest-rank percentile of a numeric list (0 for an empty list). */
export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Longest chain of requests where each starts after the previous ended; `items` are `{ start, end }`. */
export function chainDepth(items, toleranceMs = 1) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const depth = new Array(sorted.length).fill(1);
  let best = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (sorted[j].end <= sorted[i].start + toleranceMs && depth[j] + 1 > depth[i]) depth[i] = depth[j] + 1;
    }
    if (depth[i] > best) best = depth[i];
  }
  return best;
}

const owner = (e) => e.ids[0] ?? NO_ACTION;

function extraRepeats(map) {
  let extra = 0;
  const top = [];
  for (const [key, v] of map) {
    if (v.count > 1) {
      extra += v.count - 1;
      top.push({ ...v.label, action: key.split("|", 1)[0], count: v.count });
    }
  }
  top.sort((a, b) => b.count - a.count);
  return { extra, top: top.slice(0, 10) };
}

/**
 * Summarises the entries of ONE scenario (`opts.scenario`; without it every entry, named `(capture)`). Returns plain JSON-able data.
 */
export function summarise(parsed, opts = {}) {
  const name = opts.scenario ?? DEFAULT_SCENARIO;
  const entries = parsed.entries.filter((e) => opts.scenario === undefined || e.scenario === opts.scenario);
  const http = entries.filter((e) => e.type === "http");
  const data = entries.filter((e) => e.type === "data");
  const actions = entries.filter((e) => e.type === "action");
  const retries = entries.filter((e) => e.type === "retry");
  const errors = entries.filter((e) => e.type === "error");

  const byMethod = {};
  for (const e of http) byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
  const byStatus = {};
  for (const e of http) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  const dataByKind = {};
  for (const e of data) {
    const k = (dataByKind[e.kind] ??= { lines: 0, calls: 0, rows: 0, failed: 0 });
    k.lines += 1;
    k.calls += e.calls;
    k.rows += e.rows;
    k.failed += e.failed;
  }
  const readsByTable = {};
  for (const e of http) if (e.method === "GET") readsByTable[e.target] = (readsByTable[e.target] ?? 0) + 1;

  // Duplicates.
  const httpSeen = new Map();
  for (const e of http) {
    const key = `${owner(e)}|${e.method}|${e.sig}`;
    const v = httpSeen.get(key) ?? { count: 0, label: { method: e.method, target: e.target } };
    v.count += 1;
    httpSeen.set(key, v);
  }
  const dataSeen = new Map();
  for (const e of data) {
    const key = `${owner(e)}|${e.kind}|${e.target}|${e.rows}`;
    const v = dataSeen.get(key) ?? { count: 0, label: { kind: e.kind, target: e.target, rows: e.rows } };
    v.count += 1;
    dataSeen.set(key, v);
  }

  // Timings.
  const httpMs = http.map((e) => e.ms);
  const totalMs = httpMs.reduce((a, b) => a + b, 0);

  // Waves.
  const withTime = http.filter((e) => e.t !== undefined);
  const perAction = new Map();
  for (const a of actions) perAction.set(a.id, { id: a.id, name: a.name, ms: a.ms, requests: a.requests, observed: 0, httpMs: 0, ok: a.ok, failed: a.failed });
  for (const e of http) {
    const a = perAction.get(e.ids[0]);
    if (a) {
      a.observed += 1;
      a.httpMs += e.ms;
    }
  }
  let waves;
  if (withTime.length > 0 && withTime.length === http.length) {
    const items = http.map((e) => ({ start: e.t - e.ms, end: e.t, action: owner(e) }));
    const per = {};
    for (const act of new Set(items.map((i) => i.action))) per[act] = chainDepth(items.filter((i) => i.action === act));
    for (const a of perAction.values()) a.waves = per[a.id];
    waves = { method: "timestamps", scenario: chainDepth(items), maxPerAction: Math.max(0, ...Object.values(per)) };
  } else {
    let max = 0;
    let sum = 0;
    let estimated = 0;
    for (const a of perAction.values()) {
      if (a.observed > 0) {
        const mean = a.httpMs / a.observed;
        a.waves = Math.min(a.observed, Math.max(1, Math.round(a.ms / Math.max(1, mean))));
        max = Math.max(max, a.waves);
        sum += a.waves;
        estimated += 1;
      }
    }
    waves = estimated > 0
      ? { method: "elapsed-estimate", maxPerAction: max, sumPerAction: sum }
      : { method: "none", note: "no timestamps and no action summary with requests: sequential depth cannot be derived" };
  }

  const retryStatuses = {};
  for (const r of retries) {
    const k = r.status === undefined ? "none" : String(r.status);
    retryStatuses[k] = (retryStatuses[k] ?? 0) + 1;
  }
  const count = (pred) => http.filter(pred).length;
  const r429 = count((e) => e.status === 429);
  const r5xx = count((e) => e.status >= 500 && e.status <= 599);

  return {
    scenario: name,
    lines: entries.length,
    requests: {
      http: http.length,
      byMethod,
      byStatus,
      readsByTable,
      data: { lines: data.length, byKind: dataByKind },
      actionSummaries: actions.length,
      actionRequestsReported: actions.reduce((n, a) => n + a.requests, 0),
    },
    duplicates: { http: extraRepeats(httpSeen), data: extraRepeats(dataSeen) },
    waves,
    ms: {
      total: Math.round(totalMs),
      average: http.length ? round1(totalMs / http.length) : 0,
      p95: Math.round(percentile(httpMs, 95)),
      max: Math.round(Math.max(0, ...httpMs)),
    },
    slow: { http: count((e) => e.slow), data: data.filter((e) => e.slow).length, action: actions.filter((e) => e.slow).length },
    throttled429: r429,
    serverErrors5xx: r5xx,
    clientErrors4xx: count((e) => e.status >= 400 && e.status <= 499 && e.status !== 429),
    retries: { lines: retries.length, byStatus: retryStatuses, waitMs: retries.reduce((n, r) => n + (r.waitMs ?? 0), 0) },
    errorLines: { count: errors.length, byStatus: errors.reduce((o, e) => (e.status ? { ...o, [e.status]: (o[e.status] ?? 0) + 1 } : o), {}) },
    actions: [...perAction.values()],
  };
}

/** One summary per scenario marker in the capture (or one for the whole capture); `names` limits it to those scenarios. */
export function summariseAll(parsed, names) {
  const wanted = names?.length ? names : parsed.scenarios.filter((s) => parsed.entries.some((e) => e.scenario === s));
  return wanted.map((s) => summarise(parsed, { scenario: s }));
}

const entriesText = (o) => Object.entries(o).map(([k, v]) => `${k} ${typeof v === "object" ? v.calls : v}`).join(", ") || "none";

/** A markdown table: one column per scenario. */
export function toMarkdown(summaries, ignored = 0) {
  const cols = summaries.map((s) => s.scenario);
  const rows = [
    ["HTTP requests", (s) => s.requests.http],
    ["by method", (s) => entriesText(s.requests.byMethod)],
    ["data-layer calls by kind (not added)", (s) => entriesText(s.requests.data.byKind)],
    ["duplicate HTTP requests (extra repeats)", (s) => s.duplicates.http.extra],
    ["duplicate DATA lines (extra repeats)", (s) => s.duplicates.data.extra],
    ["waves", (s) => (s.waves.method === "none" ? "n/a" : `${s.waves.scenario ?? s.waves.maxPerAction} (${s.waves.method}${s.waves.method === "timestamps" ? "" : ", max per action"})`)],
    ["total ms (sum of requests)", (s) => s.ms.total],
    ["average ms", (s) => s.ms.average],
    ["P95 ms", (s) => s.ms.p95],
    ["max ms", (s) => s.ms.max],
    ["SLOW (http / data / action)", (s) => `${s.slow.http} / ${s.slow.data} / ${s.slow.action}`],
    ["429", (s) => s.throttled429],
    ["5xx", (s) => s.serverErrors5xx],
    ["retry lines", (s) => s.retries.lines],
    ["ERROR lines", (s) => s.errorLines.count],
  ];
  const out = [`| metric | ${cols.join(" | ")} |`, `| --- | ${cols.map(() => "---").join(" | ")} |`];
  for (const [label, f] of rows) out.push(`| ${label} | ${summaries.map(f).join(" | ")} |`);
  if (ignored) out.push("", `${ignored} line(s) were not [VSB] lines and were ignored.`);
  return out.join("\n");
}

function main(argv) {
  const args = [];
  const names = [];
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--scenario") names.push(argv[(i += 1)] ?? "");
    else args.push(argv[i]);
  }
  if (args.length !== 1) {
    process.stderr.write("usage: node scripts/request-census.mjs <capture.txt> [--scenario name] [--json]\n");
    return 2;
  }
  let text;
  try {
    text = readFileSync(args[0], "utf8");
  } catch (e) {
    process.stderr.write(`cannot read ${args[0]}: ${e.code ?? e.message}\n`);
    return 2;
  }
  const parsed = parseVsbLines(text);
  let summaries;
  if (names.length === 1 && !parsed.scenarios.includes(names[0])) {
    // No marker of that name: the whole capture is that scenario.
    summaries = [{ ...summarise(parsed), scenario: names[0] }];
  } else {
    summaries = summariseAll(parsed, names);
    if (!summaries.length) summaries = [summarise(parsed)];
  }
  if (json) process.stdout.write(`${JSON.stringify({ ignoredLines: parsed.ignored, scenarios: summaries }, null, 2)}\n`);
  else process.stdout.write(`${toMarkdown(summaries, parsed.ignored)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
