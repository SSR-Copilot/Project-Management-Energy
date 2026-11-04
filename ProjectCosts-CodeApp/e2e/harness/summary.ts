/**
 * The run summary (D80, phase 3): lane timings against their budgets, the classed differences, what was not captured.
 *
 * PURE and screen-agnostic: no Playwright, no file system. `report.run.ts` writes `summary.json` (`buildSummary`) and
 * `summary.md` (`renderSummary`); `run.mjs` writes the index page of a multi-screen batch (`renderIndex`).
 * Pinned by `summary.test.ts` (UT-PHSUM-*).
 */
import type { ClassedDiff, DiffClass, LaneSummary, Mode, RunSummary, TestTiming, Tier } from "./contract";

/** The order the classes are reviewed in (plan section 5): what needs a decision first. */
export const CLASS_ORDER: readonly DiffClass[] = ["new", "stale", "not-captured", "known", "artefact"];

/** A lane over its budget by more than this factor is reported over budget (plan section 4: budget plus 20 %). */
export const BUDGET_TOLERANCE = 1.2;

/** The plan's target for one full run, review included. */
export const HOUR_MS = 60 * 60_000;

/** Longest canvas / code value in a summary table cell. */
export const VALUE_MAX = 80;

/** A test that failed and then passed on its re-run: reported flaky, never passed (plan section 5). */
export interface FlakyTest { lane: string; title: string }

/** `RunSummary` plus the flaky tests by name (the contract's `LaneSummary` only counts them). */
export interface HarnessSummary extends RunSummary { flaky: FlakyTest[] }

export interface SummaryInput {
  screen: string;
  runId: string;
  mode: Mode;
  tier: Tier;
  startedAt: string;
  wallClockMs: number;
  timings: TestTiming[];
  /** Minutes per lane (`screens.ts` `budgetFor`). A lane with no budget (or 0) has `budgetMs` 0 and is never over budget. */
  budgets: Record<string, number>;
  diffs: ClassedDiff[];
  notCaptured: string[];
}

/** Playwright's statuses: passed, failed, timedOut, interrupted, skipped. */
const passed = (status: string) => status === "passed";
const notRun = (status: string) => status === "skipped";

/**
 * Lanes from the test timings. A test is one (lane, title); its attempts are its timings, one per retry. A lane's time is
 * the sum of all its attempts (re-runs included: they ran on the lane's budget too).
 */
export function laneSummaries(timings: TestTiming[], budgets: Record<string, number>): { lanes: LaneSummary[]; flaky: FlakyTest[] } {
  const byLane = new Map<string, Map<string, TestTiming[]>>();
  for (const t of timings) {
    const tests = byLane.get(t.lane) ?? new Map<string, TestTiming[]>();
    tests.set(t.title, [...(tests.get(t.title) ?? []), t]);
    byLane.set(t.lane, tests);
  }
  const lanes: LaneSummary[] = [];
  const flaky: FlakyTest[] = [];
  for (const [lane, tests] of [...byLane].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let failed = 0;
    let flakyN = 0;
    let ms = 0;
    for (const [title, attempts] of tests) {
      attempts.sort((a, b) => a.retry - b.retry);
      ms += attempts.reduce((n, a) => n + (Number.isFinite(a.ms) ? a.ms : 0), 0);
      const first = attempts.find((a) => a.retry === 0);
      const rerun = attempts.find((a) => a.retry === 1);
      const last = attempts[attempts.length - 1]!;
      if (first && !passed(first.status) && !notRun(first.status) && rerun && passed(rerun.status)) { flakyN++; flaky.push({ lane, title }); }
      else if (!passed(last.status) && !notRun(last.status)) failed++;
    }
    const minutes = budgets[lane] ?? 0;
    const budgetMs = minutes > 0 ? minutes * 60_000 : 0;
    lanes.push({ lane, tests: tests.size, failed, flaky: flakyN, ms, budgetMs, overBudget: budgetMs > 0 && ms > budgetMs * BUDGET_TOLERANCE });
  }
  return { lanes, flaky };
}

export function buildSummary(input: SummaryInput): HarnessSummary {
  const { lanes, flaky } = laneSummaries(input.timings, input.budgets);
  const counts = Object.fromEntries(CLASS_ORDER.map((c) => [c, 0])) as Record<DiffClass, number>;
  for (const d of input.diffs) counts[d.cls]++;
  return {
    screen: input.screen,
    runId: input.runId,
    mode: input.mode,
    tier: input.tier,
    startedAt: input.startedAt,
    wallClockMs: input.wallClockMs,
    lanes,
    counts,
    diffs: input.diffs,
    notCaptured: input.notCaptured,
    flaky,
  };
}

/* ──────────────────────────────────────────────────────────── markdown ── */

/** `12 min 5 s`. */
export function minutes(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** A value as one table cell: a string as it is, anything else as JSON; at most `max` characters, pipes escaped, one line. */
export function cell(value: unknown, max = VALUE_MAX): string {
  const s = value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value) ?? "";
  const flat = s.replace(/\r?\n/g, " ");
  const short = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return short.replace(/\|/g, "\\|");
}

const HEADINGS: Record<DiffClass, string> = {
  "new": "New differences (need a decision)",
  "stale": "Stale known differences (remove them from the manifest)",
  "not-captured": "Not captured by both apps",
  "known": "Known differences (accepted)",
  "artefact": "Tool artefacts (not app differences)",
};

const overLanes = (s: RunSummary) => s.lanes.filter((l) => l.overBudget).map((l) => l.lane);

export function renderSummary(s: RunSummary & { flaky?: FlakyTest[] }): string {
  const out: string[] = [];
  const hour = s.wallClockMs <= HOUR_MS ? "within the hour" : "**over the hour**";
  out.push(`# Parity run: ${s.screen}`, "");
  out.push(`- Run: ${s.runId}`);
  out.push(`- Mode: ${s.mode}, tier: ${s.tier}`);
  out.push(`- Started: ${s.startedAt}`);
  out.push(`- Wall clock: ${minutes(s.wallClockMs)} of 60 min (${hour})`);
  const over = overLanes(s);
  if (over.length) out.push(`- Lanes over budget: ${over.join(", ")}`);
  out.push("");

  out.push("## Lanes", "");
  out.push("| Lane | Tests | Failed | Flaky | Time | Budget | Over budget |", "|---|---|---|---|---|---|---|");
  for (const l of s.lanes) {
    out.push(`| ${cell(l.lane)} | ${l.tests} | ${l.failed} | ${l.flaky} | ${minutes(l.ms)} | ${l.budgetMs ? minutes(l.budgetMs) : "none"} | ${l.overBudget ? "**yes**" : "no"} |`);
  }
  if (!s.lanes.length) out.push("| (no timings recorded) | | | | | | |");
  out.push("");

  out.push("## Counts", "");
  out.push("| Class | Count |", "|---|---|");
  for (const c of CLASS_ORDER) out.push(`| ${c} | ${s.counts[c] ?? 0} |`);
  out.push("");

  for (const c of CLASS_ORDER) {
    const rows = s.diffs.filter((d) => d.cls === c);
    out.push(`## ${HEADINGS[c]}`, "");
    if (!rows.length) { out.push("None.", ""); continue; }
    out.push("| Key | Canvas | Code app | Note |", "|---|---|---|---|");
    for (const d of rows) out.push(`| ${cell(d.key, 300)} | ${cell(d.canvas)} | ${cell(d.code)} | ${cell(d.note ?? "", 300)} |`);
    out.push("");
  }

  out.push("## Manifest entries not recorded by both apps", "");
  if (!s.notCaptured.length) out.push("None.");
  else for (const n of s.notCaptured) out.push(`- ${n}`);
  out.push("");

  out.push("## Flaky tests (passed only on the re-run)", "");
  const flaky = s.flaky ?? [];
  if (!flaky.length) out.push("None.");
  else for (const f of flaky) out.push(`- ${f.lane}: ${f.title}`);
  out.push("");
  return out.join("\n");
}

/**
 * The index page of a multi-screen batch (`run.mjs --screen a,b`): one row per screen run. `link` gives each run's
 * `summary.md` relative to where the index is written; the default suits an index in `e2e/runs/`.
 */
export function renderIndex(summaries: (RunSummary & { flaky?: FlakyTest[] })[], link: (s: RunSummary) => string = (s) => `${s.runId}/summary.md`): string {
  const out: string[] = ["# Parity runs", ""];
  if (!summaries.length) { out.push("No runs.", ""); return out.join("\n"); }
  const total = summaries.reduce((n, s) => n + s.wallClockMs, 0);
  out.push(`- Screens: ${summaries.length}`, `- Wall clock, all screens: ${minutes(total)}`, "");
  out.push(
    "| Screen | Run | Mode | Tier | Wall clock | Within the hour | New | Stale | Not captured | Known | Artefact | Flaky | Lanes over budget |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const s of summaries) {
    const c = (k: DiffClass) => s.counts[k] ?? 0;
    const flaky = s.flaky?.length ?? s.lanes.reduce((n, l) => n + l.flaky, 0);
    const over = overLanes(s);
    out.push(`| [${cell(s.screen)}](${link(s)}) | ${cell(s.runId)} | ${s.mode} | ${s.tier} | ${minutes(s.wallClockMs)} | ${s.wallClockMs <= HOUR_MS ? "yes" : "**no**"} | ${c("new")} | ${c("stale")} | ${c("not-captured")} | ${c("known")} | ${c("artefact")} | ${flaky} | ${over.length ? cell(over.join(", ")) : "none"} |`);
  }
  out.push("");
  return out.join("\n");
}
