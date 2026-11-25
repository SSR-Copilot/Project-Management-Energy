/**
 * UT-CENSUS — the request-census tool (`scripts/request-census.mjs`, dvopt T-00) over lines in the exact formats
 * `platform/requestLog.ts` prints (UT-REQLOG-*). The fixtures hold names, counts and timings only.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  chainDepth, parseVsbLines, percentile, summarise, summariseAll, toMarkdown,
} from "../../scripts/request-census.mjs";

const SCRIPT = path.resolve(__dirname, "../../scripts/request-census.mjs");

/** A page load: three reads, a repeated read, a throttled and a failed request, a SLOW one, one action summary. */
const LOAD = [
  "[VSB] HTTP GET vsb_projects?$select=vsb_name&$filter=_vsb_x_value eq 11111111-2222-3333-4444-555555555555 → 200 · 312 ms · 14.2 kB [a1]",
  "[VSB] HTTP GET vsb_capexcosts?$select=vsb_name → 200 · 100 ms · 2.0 kB [a1]",
  "[VSB] HTTP GET vsb_capexcosts?$select=vsb_name → 200 · 120 ms · 2.0 kB [a1]",
  "[VSB] HTTP PATCH vsb_projects(11111111-2222-3333-4444-555555555555) → 429 · 40 ms [a1]",
  "[VSB] HTTP GET vsb_opexprojectcosts?$select=a → 503 · 90 ms [a1]",
  "[VSB] HTTP GET vsb_big?$select=a → 200 · 3500 ms · 1.2 kB · SLOW [a1,a2]",
  "[VSB] DATA read vsb_projects: 14 rows, 312 ms [a1]",
  "[VSB] DATA read vsb_capexcosts: 3 rows, 2 calls, 150 ms in total (average 110 ms, slowest 120 ms) [a1]",
  "[VSB] DATA read vsb_capexcosts: 3 rows, 2 calls, 150 ms in total (average 110 ms, slowest 120 ms) [a1]",
  "[VSB] DATA delete vsb_capexcosts: 40 rows, 40 calls, 20,800 ms in total (average 520 ms, slowest 3,539 ms), 1 FAILED (403) · SLOW [a1]",
  "[VSB] ACTION Load project @ /project/cost: 4100 ms, 6 requests (2 failed), 17 rows — read vsb_projects; read vsb_capexcosts ×2 [a1]",
  "[VSB] ACTION Slow one: 5010 ms, 0 requests, 0 rows · SLOW [a2]",
].join("\n");

describe("UT-CENSUS parseVsbLines", () => {
  it("UT-CENSUS-001 an HTTP line gives method, table, status, ms and ids, and keeps no filter value or id", () => {
    const { entries } = parseVsbLines(LOAD);
    expect(entries[0]).toMatchObject({ type: "http", method: "GET", target: "vsb_projects", status: 200, ms: 312, ids: ["a1"], slow: false });
    expect(entries[3]).toMatchObject({ type: "http", method: "PATCH", target: "vsb_projects", status: 429 });
    expect(entries[5]).toMatchObject({ status: 200, ms: 3500, slow: true, ids: ["a1", "a2"] });
    expect(JSON.stringify(entries)).not.toMatch(/11111111|vsb_name|\$select/);
  });

  it("UT-CENSUS-002 a DATA line gives kind, target, rows, calls, and FAILED / SLOW; a single call has one call", () => {
    const { entries } = parseVsbLines(LOAD);
    const data = entries.filter((e) => e.type === "data");
    expect(data[0]).toMatchObject({ kind: "read", target: "vsb_projects", rows: 14, calls: 1, wallMs: 312, failed: 0 });
    expect(data[1]).toMatchObject({ calls: 2, wallMs: 150, maxMs: 120 });
    expect(data[3]).toMatchObject({ kind: "delete", rows: 40, calls: 40, wallMs: 20800, maxMs: 3539, failed: 1, slow: true });
  });

  it("UT-CENSUS-003 an ACTION summary gives name, ms, requests, failures and rows; SLOW before the ops list is read", () => {
    const { entries } = parseVsbLines(LOAD);
    const actions = entries.filter((e) => e.type === "action");
    expect(actions[0]).toMatchObject({ id: "a1", name: "Load project @ /project/cost", ms: 4100, requests: 6, failed: 2, rows: 17, ok: true, slow: false });
    expect(actions[1]).toMatchObject({ id: "a2", name: "Slow one", ms: 5010, requests: 0, slow: true });
  });

  it("UT-CENSUS-004 FAILED and a note on an ACTION summary are read; a free-form ACTION line is a note", () => {
    const { entries } = parseVsbLines([
      "[VSB] ACTION bad: 12 ms, 0 requests, 0 rows, FAILED [a3]",
      "[VSB] ACTION Mutation @ /x: 90 ms, 1 request, 1 row, cancelled [a4]",
      "[VSB] ACTION Add Cost from Table save: 5 ms",
    ].join("\n"));
    expect(entries[0]).toMatchObject({ type: "action", ok: false });
    expect(entries[1]).toMatchObject({ type: "action", ok: true, note: "cancelled", requests: 1, rows: 1 });
    expect(entries[2]).toMatchObject({ type: "note" });
  });

  it("UT-CENSUS-005 an ERROR line keeps its status and the first words of its message only", () => {
    const { entries } = parseVsbLines("[VSB] ERROR Could not save generators — HTTP 403: privilege missing (request abc) @ /project/generators [a7]");
    expect(entries[0]).toMatchObject({ type: "error", status: 403, message: "Could not save generators", ids: ["a7"] });
    expect(JSON.stringify(entries)).not.toMatch(/privilege|abc/);
  });

  it("UT-CENSUS-006 lines with a console prefix, a level and a timestamp are read; other lines are counted as ignored", () => {
    const parsed = parseVsbLines([
      "10:20:30.250 [warning] [VSB] HTTP PATCH vsb_costs(1) → 403 · 40 ms",
      "app.tsx:12 [VSB] HTTP GET vsb_x → 200 · 5 ms",
      "some other console line",
      "",
      "[VSB] something unknown",
    ].join("\n"));
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({ level: "warn", t: ((10 * 60 + 20) * 60 + 30) * 1000 + 250, status: 403 });
    expect(parsed.entries[1]).toMatchObject({ t: undefined });
    expect(parsed.ignored).toBe(2);
  });

  it("UT-CENSUS-007 retry lines are ACTION lines with a form of try and failed; a summary or a plain note is not", () => {
    const { entries } = parseVsbLines([
      "[VSB] ACTION vsb_capexcosts: delete try 1 of 3 failed (HTTP 429); trying again in 1000 ms",
      "[VSB] ACTION vsb_capexcosts: delete try 2 of 3 failed (no HTTP status, network error); trying again in 2000 ms",
      "[VSB] ACTION Bulk save tries: 5 ms, 1 request, 1 row [a1]",
      "[VSB] ACTION nothing to see here",
    ].join("\n"));
    expect(entries.map((e) => e.type)).toEqual(["retry", "retry", "action", "note"]);
    expect(entries[0]).toMatchObject({ status: 429, waitMs: 1000 });
    expect(entries[1]).toMatchObject({ status: undefined, waitMs: 2000 });
  });

  it("UT-CENSUS-008 scenario markers split the capture; lines before the first marker are the default scenario", () => {
    const parsed = parseVsbLines([
      "[VSB] HTTP GET a → 200 · 1 ms",
      "# scenario: open project",
      "[VSB] HTTP GET b → 200 · 1 ms",
      "=== scenario: save cost ===",
      "[VSB] HTTP GET c → 200 · 1 ms",
      "[VSB] HTTP GET d → 200 · 1 ms",
    ].join("\n"));
    expect(parsed.scenarios).toEqual(["(capture)", "open project", "save cost"]);
    expect(summariseAll(parsed).map((s) => [s.scenario, s.requests.http])).toEqual([["(capture)", 1], ["open project", 1], ["save cost", 2]]);
    expect(summarise(parsed, { scenario: "save cost" }).requests.http).toBe(2);
  });
});

describe("UT-CENSUS summarise", () => {
  const s = summarise(parseVsbLines(LOAD));

  it("UT-CENSUS-010 counts requests by method and status, and data-layer calls by kind apart from them", () => {
    expect(s.requests.http).toBe(6);
    expect(s.requests.byMethod).toEqual({ GET: 5, PATCH: 1 });
    expect(s.requests.byStatus).toEqual({ 200: 4, 429: 1, 503: 1 });
    expect(s.requests.data.byKind.read).toMatchObject({ lines: 3, calls: 5, rows: 20 });
    expect(s.requests.data.byKind.delete).toMatchObject({ calls: 40, failed: 1 });
    expect(s.requests.actionRequestsReported).toBe(6);
  });

  it("UT-CENSUS-011 finds duplicates under one action: the same read twice, the same DATA line twice", () => {
    expect(s.duplicates.http.extra).toBe(1);
    expect(s.duplicates.http.top[0]).toMatchObject({ method: "GET", target: "vsb_capexcosts", count: 2, action: "a1" });
    expect(s.duplicates.data.extra).toBe(1);
    expect(s.duplicates.data.top[0]).toMatchObject({ kind: "read", target: "vsb_capexcosts", rows: 3, count: 2 });
  });

  it("UT-CENSUS-012 the same request under two different actions is not a duplicate", () => {
    const two = summarise(parseVsbLines([
      "[VSB] HTTP GET vsb_x?$select=a → 200 · 5 ms [a1]",
      "[VSB] HTTP GET vsb_x?$select=a → 200 · 5 ms [a2]",
      "[VSB] HTTP GET vsb_x?$select=b → 200 · 5 ms [a2]",
    ].join("\n")));
    expect(two.duplicates.http.extra).toBe(0);
  });

  it("UT-CENSUS-013 total, average, P95 and max of the HTTP durations", () => {
    expect(s.ms).toEqual({ total: 4162, average: 693.7, p95: 3500, max: 3500 });
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 95)).toBe(0);
  });

  it("UT-CENSUS-014 counts SLOW lines per kind, 429, 5xx and 4xx", () => {
    expect(s.slow).toEqual({ http: 1, data: 1, action: 1 });
    expect(s.throttled429).toBe(1);
    expect(s.serverErrors5xx).toBe(1);
    expect(s.clientErrors4xx).toBe(0);
  });

  it("UT-CENSUS-015 retry lines are counted with their status and the wait they state", () => {
    const r = summarise(parseVsbLines([
      "[VSB] ACTION vsb_a: delete try 1 of 3 failed (HTTP 429); trying again in 1000 ms",
      "[VSB] ACTION vsb_a: delete try 2 of 3 failed (HTTP 503); trying again in 2,000 ms",
      "[VSB] ACTION vsb_b: delete try 1 of 3 failed (HTTP 429); trying again in 1000 ms",
    ].join("\n")));
    expect(r.retries).toEqual({ lines: 3, byStatus: { 429: 2, 503: 1 }, waitMs: 4000 });
  });

  it("UT-CENSUS-016 without timestamps the waves are an estimate from the action's elapsed time over the mean request time", () => {
    // a1: 4100 ms elapsed, 5 requests of mean 132 ms observed under it (the 3500 ms one is a1,a2 and counts for a1 too).
    expect(s.waves.method).toBe("elapsed-estimate");
    expect(s.waves.maxPerAction).toBeGreaterThanOrEqual(1);
    expect(s.waves.maxPerAction).toBeLessThanOrEqual(6);
    const a1 = s.actions.find((a) => a.id === "a1");
    expect(a1?.observed).toBe(6);
  });

  it("UT-CENSUS-017 without timestamps or summaries the waves say so instead of guessing", () => {
    const n = summarise(parseVsbLines("[VSB] HTTP GET vsb_x → 200 · 5 ms"));
    expect(n.waves.method).toBe("none");
    expect(n.waves.note).toMatch(/cannot be derived/);
  });

  it("UT-CENSUS-018 with timestamps the waves are the longest chain of requests that start after the previous ended", () => {
    // Line time = end time. Three at once (ends 1.100), then two after them (ends 1.400, 1.450), then one after the first of those.
    const timed = summarise(parseVsbLines([
      "10:00:01.100 [VSB] HTTP GET vsb_a → 200 · 100 ms [a1]",
      "10:00:01.100 [VSB] HTTP GET vsb_b → 200 · 100 ms [a1]",
      "10:00:01.100 [VSB] HTTP GET vsb_c → 200 · 90 ms [a1]",
      "10:00:01.400 [VSB] HTTP GET vsb_d → 200 · 200 ms [a1]",
      "10:00:01.450 [VSB] HTTP GET vsb_e → 200 · 250 ms [a1]",
      "10:00:01.700 [VSB] HTTP GET vsb_f → 200 · 250 ms [a1]",
    ].join("\n")));
    expect(timed.waves).toMatchObject({ method: "timestamps", scenario: 3, maxPerAction: 3 });
    expect(chainDepth([{ start: 0, end: 10 }, { start: 0, end: 10 }, { start: 10, end: 20 }])).toBe(2);
    expect(chainDepth([])).toBe(0);
  });

  it("UT-CENSUS-019 an ERROR line is counted with its status", () => {
    const e = summarise(parseVsbLines("[VSB] ERROR Could not save — HTTP 500: x @ /\n[VSB] ERROR Unhandled error: boom @ /"));
    expect(e.errorLines).toEqual({ count: 2, byStatus: { 500: 1 } });
  });
});

describe("UT-CENSUS output and CLI", () => {
  it("UT-CENSUS-020 the markdown table has one column per scenario and the headline rows", () => {
    const parsed = parseVsbLines("# scenario: one\n[VSB] HTTP GET a → 200 · 10 ms\n# scenario: two\n[VSB] HTTP GET a → 429 · 20 ms");
    const md = toMarkdown(summariseAll(parsed), parsed.ignored);
    expect(md.split("\n")[0]).toBe("| metric | one | two |");
    expect(md).toMatch(/\| HTTP requests \| 1 \| 1 \|/);
    expect(md).toMatch(/\| 429 \| 0 \| 1 \|/);
    expect(md).toMatch(/\| P95 ms \| 10 \| 20 \|/);
  });

  it("UT-CENSUS-021 the CLI prints a table, --json prints JSON, --scenario names an unmarked capture, and no input value leaks", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "census-"));
    try {
      const file = path.join(dir, "capture.txt");
      writeFileSync(file, LOAD, "utf8");
      const table = spawnSync(process.execPath, [SCRIPT, file, "--scenario", "Open project"], { encoding: "utf8" });
      expect(table.status).toBe(0);
      expect(table.stdout.split("\n")[0]).toBe("| metric | Open project |");
      const json = spawnSync(process.execPath, [SCRIPT, file, "--json"], { encoding: "utf8" });
      const out = JSON.parse(json.stdout) as { scenarios: Array<{ requests: { http: number } }> };
      expect(out.scenarios[0]?.requests.http).toBe(6);
      expect(table.stdout + json.stdout).not.toMatch(/11111111|\$select|vsb_name/);
      const bad = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
      expect(bad.status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
