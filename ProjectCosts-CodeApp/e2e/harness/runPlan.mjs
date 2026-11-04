/**
 * The parity runner's pure part (D80): argument parsing, the screen list, the Playwright projects per phase, the re-run
 * list, the exit code and the index page. `run.mjs` does the file system and the child processes; everything that decides
 * something is here, pinned by `runPlan.test.ts` (UT-PHRUN-*). Plain JavaScript, so `node e2e/harness/run.mjs` needs no
 * TypeScript loader; the types are in `runPlan.d.mts`.
 *
 * Screen-agnostic: a screen is any folder `e2e/screens/<slug>/` holding `manifest.ts` (plan section 5a). Nothing here names
 * a screen, and there is no default one: `--screen`, else `PARITY_SCREEN`, is required (as in `env.ts`).
 */

export const MODES = ["full", "compare"];
export const TIERS = ["smoke", "read", "full"];
export const CANVAS_READ_LANES = ["canvas-A", "canvas-B", "canvas-C"];
export const CODE_READ_LANES = ["code-A", "code-B"];
/** Each screen has one hour (plan section 1). */
export const SCREEN_DEADLINE_MS = 60 * 60_000;
/** Phase 3 runs even after the deadline (the report must always be written); it gets this long. */
export const REPORT_ALLOWANCE_MS = 5 * 60_000;
export const PLAYWRIGHT_CONFIG = "e2e/harness/playwright.harness.config.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const USAGE = `Usage: node e2e/harness/run.mjs --screen <slug>|a,b|all [--mode full|compare] [--tier smoke|read|full] [--lanes N] [--no-rerun]

  --screen   one screen, a comma list, or "all" (every e2e/screens/<slug>/manifest.ts); else PARITY_SCREEN. Required:
             there is no default screen
  --mode     full (both apps; default) or compare (code app only, against the cached Canvas reference)
  --tier     smoke (code app platform checks), read (phase 1) or full (phases 1 and 2; default)
  --lanes    read lanes at once, 1 to 20 (PARITY_LANES; default 5)
  --no-rerun skip the re-run pass of failed tests

Project ids come only from the environment: PARITY_READ_PROJECT_ID, and optionally
PARITY_WRITE_PROJECT_CANVAS + PARITY_WRITE_PROJECT_CODE (write lanes beside the read lanes).`;

/**
 * The error text when no screen is given: the same rule and words as `env.ts` screenRequired, for the runner's two ways to
 * name a screen (pinned together by UT-PHRUN-025).
 */
export function screenRequiredMessage(available) {
  return `set PARITY_SCREEN (or --screen) to one of: ${available.length ? [...available].sort().join(", ") : "(no e2e/screens/<slug>/manifest.ts yet)"}`;
}

/**
 * The command line. Accepts `--flag value` and `--flag=value`. Throws with the usage on an unknown flag or a bad value.
 * `defaults.screen` is `PARITY_SCREEN` when set. No screen at all leaves `screens` empty; `resolveScreens` then names the
 * screens on disk.
 */
export function parseArgs(argv, defaults = {}) {
  const out = {
    screens: defaults.screen?.trim() || "",
    mode: "full",
    tier: "full",
    lanes: undefined,
    rerun: true,
    help: false,
  };
  const args = [...argv];
  const value = (flag, inline) => {
    const v = inline ?? args.shift();
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value\n\n${USAGE}`);
    return v.trim();
  };
  while (args.length) {
    const raw = args.shift();
    const eq = raw.indexOf("=");
    const flag = raw.startsWith("--") && eq > 0 ? raw.slice(0, eq) : raw;
    const inline = raw.startsWith("--") && eq > 0 ? raw.slice(eq + 1) : undefined;
    switch (flag) {
      case "--screen": out.screens = value(flag, inline); break;
      case "--mode": out.mode = value(flag, inline); break;
      case "--tier": out.tier = value(flag, inline); break;
      case "--lanes": {
        const v = value(flag, inline);
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error(`--lanes must be a whole number from 1 to 20 (got "${v}")`);
        out.lanes = n;
        break;
      }
      case "--no-rerun": out.rerun = false; break;
      case "--help": case "-h": out.help = true; break;
      default: throw new Error(`Unknown argument "${raw}"\n\n${USAGE}`);
    }
  }
  if (!MODES.includes(out.mode)) throw new Error(`--mode must be one of ${MODES.join(" | ")} (got "${out.mode}")`);
  if (!TIERS.includes(out.tier)) throw new Error(`--tier must be one of ${TIERS.join(" | ")} (got "${out.tier}")`);
  return out;
}

/** The screens on disk: folder names under `e2e/screens/` that hold a `manifest.ts` (a `manifest.draft.ts` is not one). */
export function screensFromListing(listing) {
  return listing
    .filter((d) => SLUG.test(d.name) && d.files.includes("manifest.ts"))
    .map((d) => d.name)
    .sort();
}

/**
 * `--screen` against the screens on disk: "all", one slug or a comma list (order kept, duplicates dropped). No screen at all
 * (no `--screen`, no `PARITY_SCREEN`) throws `screenRequiredMessage`.
 */
export function resolveScreens(spec, available) {
  const have = [...available].sort();
  if (!spec.trim()) throw new Error(screenRequiredMessage(have));
  if (spec.trim() === "all") {
    if (!have.length) throw new Error("--screen all: no screen has e2e/screens/<slug>/manifest.ts yet");
    return have;
  }
  const wanted = [...new Set(spec.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!wanted.length) throw new Error("--screen is empty");
  const unknown = wanted.filter((s) => !have.includes(s));
  if (unknown.length) {
    throw new Error(`No manifest for screen(s) ${unknown.map((s) => `"${s}"`).join(", ")} (e2e/screens/<slug>/manifest.ts). On disk: ${have.length ? have.join(", ") : "none"}`);
  }
  return wanted;
}

const readVar = (vars, name) => {
  const v = vars[name]?.trim();
  return v ? v : undefined;
};

/**
 * Whether the write lanes run beside the read lanes: both write projects set, different from each other and from the read
 * project. The same rule as `env.ts` `resolveRunEnv` (`runPlan.test.ts` pins the two together); an invalid id counts as unset
 * here, and preflight reports it by name.
 */
export function writesInParallel(vars) {
  const id = (name) => {
    const v = readVar(vars, name);
    return v && GUID.test(v) ? v.toLowerCase() : undefined;
  };
  const read = id("PARITY_READ_PROJECT_ID");
  const canvas = id("PARITY_WRITE_PROJECT_CANVAS");
  const code = id("PARITY_WRITE_PROJECT_CODE");
  return read !== undefined && canvas !== undefined && code !== undefined && canvas !== code && canvas !== read && code !== read;
}

/**
 * Why the run cannot start, naming the variable, never a value; null when it can. Only a project variable that is SET but is
 * not a GUID stops the batch here. A missing read project does not: whether a screen needs one is in its manifest (`open`),
 * which plain Node cannot import, so each screen's preflight checks it first (`env.ts` `requireProjectId`, before any page
 * opens) and an Application Settings screen runs without one.
 */
export function projectVarsProblem(vars) {
  for (const name of ["PARITY_READ_PROJECT_ID", "PARITY_WRITE_PROJECT_CANVAS", "PARITY_WRITE_PROJECT_CODE"]) {
    const v = readVar(vars, name);
    if (v !== undefined && !GUID.test(v)) return `${name} is set but is not a GUID`;
  }
  return null;
}

/**
 * The test project is asked for at the start of EVERY run (user requirement, 3 Nov 2026): it is never stored in a file and
 * never defaulted from an earlier run. `run.mjs` asks on an interactive terminal; a non-interactive run (CI, a tool shell)
 * takes the environment variables instead. These helpers are the pure part of that prompt.
 */
export const PROJECT_PROMPTS = [
  { name: "PARITY_READ_PROJECT_ID", question: "Test project id (GUID; Enter = none, for a screen without a project)" },
  { name: "PARITY_WRITE_PROJECT_CANVAS", question: "Write project for the Canvas (Enter = the test project)" },
  { name: "PARITY_WRITE_PROJECT_CODE", question: "Write project for the code app (Enter = the test project)" },
];

/** A project id for the console: the first and last 4 characters only. */
export function maskId(id) {
  return id && id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : "(none)";
}

/**
 * One prompt answer: `{ value }` (a lower-case GUID, or undefined for "none"), or `{ error }` to ask again. Braces from a
 * copy-paste are accepted. An empty answer means none for the read project and "the read project" for a write project.
 */
export function readProjectAnswer(answer, { name, readProject }) {
  const raw = String(answer ?? "").trim().replace(/^\{|\}$/g, "");
  if (raw === "") {
    return { value: name === "PARITY_READ_PROJECT_ID" ? undefined : readProject };
  }
  if (!GUID.test(raw)) return { error: "that is not a GUID (8-4-4-4-12 hex digits); try again" };
  return { value: raw.toLowerCase() };
}

/** Whether a read project is set (`run.mjs` prints a note when not: project-scoped screens will stop at their preflight). */
export function hasReadProject(vars) {
  return readVar(vars, "PARITY_READ_PROJECT_ID") !== undefined;
}

const projectArgs = (projects) => projects.flatMap((p) => ["--project", p]);

/**
 * The phases of one screen run, in order. Each has a `name` (also `PARITY_PHASE`, the output folder), a `label` to print,
 * its Playwright `projects` and extra `args`. The re-run phase's list of tests is only known at run time (`rerunArgs`).
 *
 *   smoke tier     phase1: preflight + code-A, `--grep @smoke` (code app platform checks; no write lanes)
 *   read lanes     full mode: canvas-A/B/C + code-A/B; compare mode: code-A/B
 *   write lanes    full mode: write-canvas + write-code; compare mode: write-code (tier full only)
 *   parallel       tier full and both sandbox projects set: the write lanes join phase 1; else phase 2, `--no-deps`
 *   rerun          unless --no-rerun: the failed tests of phases 1 and 2, once, `PARITY_RERUN=1`
 *   report         `--project report --no-deps`, always
 */
export function phasePlan({ mode, tier, parallel, rerun }) {
  const phases = [];
  if (tier === "smoke") {
    phases.push({ name: "phase1", label: "phase 1 (preflight + code app smoke)", projects: ["preflight", "code-A"], args: ["--grep", "@smoke"] });
  } else {
    const readLanes = mode === "full" ? [...CANVAS_READ_LANES, ...CODE_READ_LANES] : [...CODE_READ_LANES];
    const writeLanes = tier === "full" ? (mode === "full" ? ["write-canvas", "write-code"] : ["write-code"]) : [];
    const besides = parallel && writeLanes.length > 0;
    phases.push({
      name: "phase1",
      label: besides ? "phase 1 (preflight + read lanes + write lanes)" : "phase 1 (preflight + read lanes)",
      projects: ["preflight", ...readLanes, ...(besides ? writeLanes : [])],
      args: [],
    });
    if (writeLanes.length && !besides) {
      phases.push({ name: "phase2", label: "phase 2 (write lanes)", projects: writeLanes, args: ["--no-deps"] });
    }
  }
  if (rerun) {
    const ran = phases.flatMap((p) => p.projects).filter((p) => p !== "preflight");
    const grep = tier === "smoke" ? ["--grep", "@smoke"] : [];
    phases.push({ name: "rerun", label: "re-run pass (failed tests, once)", projects: ran, args: [...grep, "--no-deps"], rerun: true });
  }
  phases.push({ name: "report", label: "phase 3 (report)", projects: ["report"], args: ["--no-deps"], report: true });
  return phases;
}

/**
 * The failed test ids of the phases so far, from Playwright's last-run files (`{ status, failedTests: string[] }`, written
 * at `PLAYWRIGHT_LAST_RUN_OUTPUT_FILE`). Unreadable entries are skipped. Order kept, duplicates dropped.
 */
export function mergeFailed(lastRuns) {
  const ids = [];
  for (const r of lastRuns) {
    const list = r && Array.isArray(r.failedTests) ? r.failedTests : [];
    for (const id of list) if (typeof id === "string" && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Whether the preflight failed, from `timings.json` after phase 1: no preflight timing at all (Playwright never got to it,
 * e.g. a config or import error), or its last attempt did not pass.
 */
export function preflightFailed(timings) {
  const pre = (Array.isArray(timings) ? timings : []).filter((t) => t && t.lane === "preflight");
  if (!pre.length) return true;
  return pre[pre.length - 1].status !== "passed";
}

/**
 * How long a phase may run: the report always gets `REPORT_ALLOWANCE_MS`; any other phase gets what is left of the screen's
 * deadline, and 0 (skip it) when nothing is left.
 */
export function phaseTimeout(phase, nowMs, deadlineMs) {
  if (phase.report) return REPORT_ALLOWANCE_MS;
  return Math.max(0, deadlineMs - nowMs);
}

/** The Playwright arguments of one phase (after `npx playwright test`). `lastFailedFile` only for the re-run phase. */
export function playwrightArgs(phase, { config = PLAYWRIGHT_CONFIG, lastFailedFile } = {}) {
  const extra = phase.rerun ? ["--last-failed", "--last-failed-file", lastFailedFile] : [];
  if (phase.rerun && !lastFailedFile) throw new Error("playwrightArgs: the re-run phase needs lastFailedFile");
  return ["playwright", "test", "--config", config, ...projectArgs(phase.projects), ...phase.args, ...extra];
}

/**
 * One argument for a `shell: true` command line (cmd.exe or sh): as it is when it holds only safe characters, else in double
 * quotes. A double quote, `%`, `!` or `$` cannot be passed safely through both shells and throws.
 */
export function shellArg(arg) {
  const s = String(arg);
  if (/["%!$`]/.test(s)) throw new Error(`shellArg: this argument cannot be passed safely through a shell (${s})`);
  return /^[A-Za-z0-9_@+:./\\-]+$/.test(s) ? s : `"${s}"`;
}

/** The whole command line (`spawn(line, { shell: true })`; Node 24 warns about an args array with `shell: true`). */
export function commandLine(command, args) {
  return [command, ...args].map(shellArg).join(" ");
}

/** Local time as YYYYMMDD-HHmm: the same form as `env.ts` `newRunId` (pinned together in `runPlan.test.ts`). */
export function newRunId(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

/** The batch run id: `base` (YYYYMMDD-HHmm), else `base-2`, `base-3`, ... until no folder under `e2e/runs/` has the name. */
export function uniqueRunId(base, existingNames) {
  const taken = (id) => existingNames.some((n) => n === id || n.startsWith(`${id}_`));
  if (!taken(base)) return base;
  for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * One screen's run folder, relative to `e2e/runs/`: `<batch>/<slug>`. Every screen of a batch shares the batch id as its
 * `PARITY_RUN_ID`; `env.ts` `resolveRunEnv` puts each screen in its own `<runId>/<screen>` folder (pinned together in
 * `runPlan.test.ts`), so facts, timings and summaries never mix.
 */
export function screenRunPath(batchId, slug) {
  return `${batchId}/${slug}`;
}

/** Where `e2e/runs/<batch>/index.md` links a screen's summary. */
export function summaryLink(slug) {
  return `${slug}/summary.md`;
}

/** `12 min 5 s`, as `summary.ts` `minutes` prints it. */
export function elapsed(ms) {
  const s = Math.round(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/**
 * One screen's verdict. A screen fails when: its preflight failed, it hit its deadline, it has no summary (the report did not
 * run or failed), a lane has a failed test (`LaneSummary.failed` already leaves out flaky tests), or it has new or stale
 * differences. Returns { ok, reasons[] }.
 */
export function screenVerdict(result) {
  const reasons = [];
  const s = result.summary;
  if (result.preflightFailed) reasons.push("preflight failed");
  if (result.timedOut) reasons.push("deadline reached (60 min)");
  if (!s) reasons.push("no summary.json (the report did not run)");
  else {
    const failed = (s.lanes ?? []).reduce((n, l) => n + (l.failed ?? 0), 0);
    const nw = s.counts?.new ?? 0;
    const stale = s.counts?.stale ?? 0;
    if (failed > 0) reasons.push(`${failed} failed test(s)`);
    if (nw + stale > 0) reasons.push(`${nw} new + ${stale} stale difference(s)`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** 1 when any screen fails (`screenVerdict`), else 0. No screens: 1. */
export function exitCode(results) {
  if (!results.length) return 1;
  return results.every((r) => screenVerdict(r).ok) ? 0 : 1;
}

const cellText = (s) => String(s).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

/**
 * The runner's part of `e2e/runs/<batch>/index.md`: per screen its verdict, wall clock (the runner's own clock, report
 * included), test counts and the time of each phase. `renderIndex` from `summary.ts` adds the difference table below it
 * when it can be imported from plain Node.
 */
export function renderRunTable(batchId, results) {
  const out = [`# Parity batch ${batchId}`, ""];
  out.push("| Screen | Result | Wall clock | Tests | Failed | Flaky | New | Stale | Phases | Summary |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const v = screenVerdict(r);
    const s = r.summary;
    const lanes = s?.lanes ?? [];
    const n = (k) => lanes.reduce((t, l) => t + (l[k] ?? 0), 0);
    const phases = (r.phases ?? []).map((p) => `${p.name} ${elapsed(p.ms)}${p.skipped ? " (skipped)" : ""}`).join(", ");
    const link = s ? `[summary.md](${summaryLink(r.screen)})` : "none";
    out.push(`| ${cellText(r.screen)} | ${v.ok ? "pass" : `**FAIL**: ${cellText(v.reasons.join("; "))}`} | ${elapsed(r.wallClockMs ?? 0)} | ${s ? n("tests") : ""} | ${s ? n("failed") : ""} | ${s ? n("flaky") : ""} | ${s?.counts?.new ?? ""} | ${s?.counts?.stale ?? ""} | ${cellText(phases)} | ${link} |`);
  }
  if (!results.length) out.push("| (no screens ran) | | | | | | | | | |");
  out.push("");
  return out.join("\n");
}
