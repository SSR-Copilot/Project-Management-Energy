/**
 * UT-PHRUN: the parity runner's pure part (`runPlan.mjs`, D80). Node only; fake GUIDs only. No process is started.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newRunId as envNewRunId, resolveRunEnv, screenRequired } from "./env";
import {
  commandLine, elapsed, exitCode, mergeFailed, newRunId, parseArgs, phasePlan, phaseTimeout, playwrightArgs, preflightFailed,
  hasReadProject, projectVarsProblem, renderRunTable, REPORT_ALLOWANCE_MS, resolveScreens, screenRequiredMessage, screenRunPath,
  screensFromListing, screenVerdict, shellArg, summaryLink, uniqueRunId, writesInParallel, type ScreenResult,
  maskId, PROJECT_PROMPTS, readProjectAnswer,
} from "./runPlan.mjs";

describe("the per-run project prompt (asked every run, never stored)", () => {
  const G = "00000000-0000-4000-8000-0000000000AB";
  it("UT-PHRUN-027 asks for the test project, then both write projects, in that order", () => {
    expect(PROJECT_PROMPTS.map((p) => p.name)).toEqual([
      "PARITY_READ_PROJECT_ID", "PARITY_WRITE_PROJECT_CANVAS", "PARITY_WRITE_PROJECT_CODE",
    ]);
  });
  it("UT-PHRUN-028 a GUID answer is kept, lower-cased, braces stripped; anything else asks again", () => {
    expect(readProjectAnswer(` {${G}} `, { name: "PARITY_READ_PROJECT_ID", readProject: undefined }))
      .toEqual({ value: G.toLowerCase() });
    expect(readProjectAnswer("not-a-guid", { name: "PARITY_READ_PROJECT_ID", readProject: undefined }).error)
      .toMatch(/not a GUID/);
  });
  it("UT-PHRUN-029 Enter: no project for the read prompt, the read project for a write prompt", () => {
    expect(readProjectAnswer("", { name: "PARITY_READ_PROJECT_ID", readProject: undefined })).toEqual({ value: undefined });
    expect(readProjectAnswer("", { name: "PARITY_WRITE_PROJECT_CODE", readProject: "x-read" })).toEqual({ value: "x-read" });
  });
  it("UT-PHRUN-030 the console shows a project id masked", () => {
    expect(maskId(G.toLowerCase())).toBe("0000…00ab");
    expect(maskId(undefined)).toBe("(none)");
  });
});

const READ = "00000000-0000-4000-8000-000000000001";
const CANVAS_W = "00000000-0000-4000-8000-000000000002";
const CODE_W = "00000000-0000-4000-8000-000000000003";

const projectsOf = (p: { projects: string[] }) => p.projects.join(" ");
const okSummary = { lanes: [{ lane: "code-A", tests: 4, failed: 0, flaky: 1 }], counts: { new: 0, stale: 0, known: 2 } };

describe("parseArgs", () => {
  it("UT-PHRUN-001 defaults: PARITY_SCREEN, no default screen (empty), full mode, full tier, re-run on", () => {
    expect(parseArgs([])).toEqual({ screens: "", mode: "full", tier: "full", lanes: undefined, rerun: true, help: false });
    expect(parseArgs([], { screen: "opex" }).screens).toBe("opex");
    expect(parseArgs(["--screen", "land-lease"], { screen: "opex" }).screens).toBe("land-lease");
  });

  it("UT-PHRUN-002 every flag, in both the spaced and the = form", () => {
    expect(parseArgs(["--screen", "a,b", "--mode", "compare", "--tier=smoke", "--lanes=3", "--no-rerun"]))
      .toEqual({ screens: "a,b", mode: "compare", tier: "smoke", lanes: 3, rerun: false, help: false });
    expect(parseArgs(["--screen=all"]).screens).toBe("all");
  });

  it("UT-PHRUN-003 rejects an unknown flag, a bad mode / tier, lanes out of 1..20 and a missing value", () => {
    expect(() => parseArgs(["--fast"])).toThrow(/Unknown argument "--fast"/);
    expect(() => parseArgs(["--mode", "quick"])).toThrow(/--mode must be one of full \| compare/);
    expect(() => parseArgs(["--tier", "all"])).toThrow(/--tier must be one of/);
    expect(() => parseArgs(["--lanes", "0"])).toThrow(/--lanes must be a whole number/);
    expect(() => parseArgs(["--lanes", "2.5"])).toThrow(/--lanes/);
    expect(() => parseArgs(["--screen"])).toThrow(/--screen needs a value/);
    expect(() => parseArgs(["--screen", "--mode"])).toThrow(/--screen needs a value/);
  });
});

describe("screens", () => {
  it("UT-PHRUN-004 a screen is a slug folder holding manifest.ts; a draft manifest or a bad name is not one", () => {
    const listing = [
      { name: "opex", files: ["manifest.ts", "opex.lane.ts"] },
      { name: "land-lease", files: ["manifest.ts"] },
      { name: "draft-only", files: ["manifest.draft.ts"] },
      { name: "Bad_Name", files: ["manifest.ts"] },
    ];
    expect(screensFromListing(listing)).toEqual(["land-lease", "opex"]);
  });

  it("UT-PHRUN-005 --screen all, one, a comma list (order kept, duplicates dropped)", () => {
    const have = ["opex", "land-lease", "milestones"];
    expect(resolveScreens("all", have)).toEqual(["land-lease", "milestones", "opex"]);
    expect(resolveScreens("opex", have)).toEqual(["opex"]);
    expect(resolveScreens(" opex , land-lease,opex ", have)).toEqual(["opex", "land-lease"]);
  });

  it("UT-PHRUN-006 an unknown screen names itself and what is on disk; all with no screens fails", () => {
    expect(() => resolveScreens("capex,opex", ["opex"])).toThrow(/No manifest for screen\(s\) "capex".*On disk: opex/);
    expect(() => resolveScreens("all", [])).toThrow(/no screen has e2e\/screens/);
    expect(() => resolveScreens(" , ", ["opex"])).toThrow(/--screen is empty/);
  });
});

describe("project variables", () => {
  it("UT-PHRUN-007 writesInParallel agrees with env.ts resolveRunEnv on every combination", () => {
    const values = [undefined, READ, CANVAS_W, CODE_W];
    for (const r of [READ, undefined]) {
      for (const c of values) {
        for (const d of values) {
          const vars = { PARITY_RUN_ID: "r1", PARITY_SCREEN: "demo", PARITY_READ_PROJECT_ID: r ?? READ, PARITY_WRITE_PROJECT_CANVAS: c, PARITY_WRITE_PROJECT_CODE: d };
          expect(writesInParallel(vars), JSON.stringify({ c, d })).toBe(resolveRunEnv(vars, "unused-root").writesInParallel);
        }
      }
    }
    expect(writesInParallel({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: CANVAS_W, PARITY_WRITE_PROJECT_CODE: CODE_W })).toBe(true);
  });

  it("UT-PHRUN-008 a project variable that is set but not a GUID stops the run naming the variable only; none set does not", () => {
    // No read project: a screen without a project (admin) runs; a project-scoped screen stops at its own preflight.
    expect(projectVarsProblem({})).toBeNull();
    expect(hasReadProject({})).toBe(false);
    const bad = projectVarsProblem({ PARITY_READ_PROJECT_ID: "not-a-guid-secret" });
    expect(bad).toMatch(/PARITY_READ_PROJECT_ID is set but is not a GUID/);
    expect(bad).not.toContain("secret");
    expect(projectVarsProblem({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CODE: "x" })).toMatch(/PARITY_WRITE_PROJECT_CODE is set but/);
    expect(projectVarsProblem({ PARITY_READ_PROJECT_ID: READ })).toBeNull();
    expect(hasReadProject({ PARITY_READ_PROJECT_ID: READ })).toBe(true);
  });

  it("UT-PHRUN-026 the harness reads no screen-named variable: LANDLEASE_PROJECT_ID (the old specs') is ignored", () => {
    expect(hasReadProject({ LANDLEASE_PROJECT_ID: READ })).toBe(false);
    expect(projectVarsProblem({ LANDLEASE_PROJECT_ID: "not-a-guid" })).toBeNull();
    expect(writesInParallel({ LANDLEASE_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: CANVAS_W, PARITY_WRITE_PROJECT_CODE: CODE_W })).toBe(false);
    expect(resolveRunEnv({ PARITY_RUN_ID: "r1", PARITY_SCREEN: "demo", LANDLEASE_PROJECT_ID: READ }, "unused-root").readProjectId).toBe("");
  });
});

describe("phasePlan", () => {
  it("UT-PHRUN-009 full mode, full tier, shared project: read lanes, then write lanes --no-deps, re-run, report", () => {
    const p = phasePlan({ mode: "full", tier: "full", parallel: false, rerun: true });
    expect(p.map((x) => x.name)).toEqual(["phase1", "phase2", "rerun", "report"]);
    expect(projectsOf(p[0]!)).toBe("preflight canvas-A canvas-B canvas-C code-A code-B");
    expect(p[1]).toMatchObject({ projects: ["write-canvas", "write-code"], args: ["--no-deps"] });
    expect(projectsOf(p[2]!)).toBe("canvas-A canvas-B canvas-C code-A code-B write-canvas write-code");
    expect(p[3]).toMatchObject({ projects: ["report"], args: ["--no-deps"], report: true });
  });

  it("UT-PHRUN-010 sandbox projects set: the write lanes join phase 1 and there is no phase 2", () => {
    const p = phasePlan({ mode: "full", tier: "full", parallel: true, rerun: false });
    expect(p.map((x) => x.name)).toEqual(["phase1", "report"]);
    expect(projectsOf(p[0]!)).toBe("preflight canvas-A canvas-B canvas-C code-A code-B write-canvas write-code");
  });

  it("UT-PHRUN-011 compare mode records the code app only: code lanes, write-code", () => {
    const p = phasePlan({ mode: "compare", tier: "full", parallel: false, rerun: true });
    expect(projectsOf(p[0]!)).toBe("preflight code-A code-B");
    expect(p[1]!.projects).toEqual(["write-code"]);
    expect(p[2]!.projects).toEqual(["code-A", "code-B", "write-code"]);
  });

  it("UT-PHRUN-012 read tier: no write lanes even with sandbox projects", () => {
    const p = phasePlan({ mode: "full", tier: "read", parallel: true, rerun: false });
    expect(p.map((x) => x.name)).toEqual(["phase1", "report"]);
    expect(p[0]!.projects).not.toContain("write-canvas");
  });

  it("UT-PHRUN-013 smoke tier: preflight + code-A with --grep @smoke; the re-run keeps the grep", () => {
    const p = phasePlan({ mode: "full", tier: "smoke", parallel: true, rerun: true });
    expect(p.map((x) => x.name)).toEqual(["phase1", "rerun", "report"]);
    expect(p[0]).toMatchObject({ projects: ["preflight", "code-A"], args: ["--grep", "@smoke"] });
    expect(p[1]).toMatchObject({ projects: ["code-A"], args: ["--grep", "@smoke", "--no-deps"], rerun: true });
  });
});

describe("re-run and command lines", () => {
  it("UT-PHRUN-014 mergeFailed joins the phases' failed ids, once each, skipping unreadable files", () => {
    expect(mergeFailed([{ status: "failed", failedTests: ["a", "b"] }, null, { failedTests: ["b", "c", 7] }, { status: "passed" }]))
      .toEqual(["a", "b", "c"]);
    expect(mergeFailed([])).toEqual([]);
  });

  it("UT-PHRUN-015 playwrightArgs: config, one --project per project, the phase args, --last-failed for the re-run", () => {
    const [, , rerun] = phasePlan({ mode: "compare", tier: "full", parallel: false, rerun: true });
    expect(playwrightArgs(phasePlan({ mode: "compare", tier: "read", parallel: false, rerun: false })[0]!))
      .toEqual(["playwright", "test", "--config", "e2e/harness/playwright.harness.config.ts", "--project", "preflight", "--project", "code-A", "--project", "code-B"]);
    expect(playwrightArgs(rerun!, { lastFailedFile: "e2e/runs/r1/last-run.rerun.json" }).slice(-6))
      .toEqual(["--project", "write-code", "--no-deps", "--last-failed", "--last-failed-file", "e2e/runs/r1/last-run.rerun.json"]);
    expect(() => playwrightArgs(rerun!)).toThrow(/needs lastFailedFile/);
  });

  it("UT-PHRUN-016 shell arguments: safe ones bare, spaces quoted, shell-expanding characters refused", () => {
    expect(shellArg("@smoke")).toBe("@smoke");
    expect(shellArg("e2e/runs/r1/x.json")).toBe("e2e/runs/r1/x.json");
    expect(shellArg("a b")).toBe('"a b"');
    expect(shellArg("a,b=c")).toBe('"a,b=c"');
    for (const bad of ['a"b', "%PATH%", "!x!", "$HOME", "`x`"]) expect(() => shellArg(bad)).toThrow(/cannot be passed safely/);
    expect(commandLine("npx", ["playwright", "test", "--grep", "@smoke"])).toBe("npx playwright test --grep @smoke");
  });

  it("UT-PHRUN-017 preflightFailed: no preflight timing, or its last attempt not passed", () => {
    expect(preflightFailed(null)).toBe(true);
    expect(preflightFailed([{ lane: "code-A", status: "passed" }])).toBe(true);
    expect(preflightFailed([{ lane: "preflight", status: "failed" }])).toBe(true);
    expect(preflightFailed([{ lane: "preflight", status: "timedOut" }, { lane: "preflight", status: "passed" }])).toBe(false);
  });

  it("UT-PHRUN-018 phaseTimeout: what is left of the deadline, 0 past it; the report always gets its allowance", () => {
    expect(phaseTimeout({}, 1_000, 61_000)).toBe(60_000);
    expect(phaseTimeout({}, 70_000, 61_000)).toBe(0);
    expect(phaseTimeout({ report: true }, 70_000, 61_000)).toBe(REPORT_ALLOWANCE_MS);
  });
});

describe("run ids", () => {
  it("UT-PHRUN-019 newRunId is env.ts newRunId (local YYYYMMDD-HHmm)", () => {
    const now = new Date(2026, 10, 3, 9, 5);
    expect(newRunId(now)).toBe("20261103-0905");
    expect(newRunId(now)).toBe(envNewRunId(now));
  });

  it("UT-PHRUN-020 uniqueRunId skips ids already used by a folder or a screen folder of a batch", () => {
    expect(uniqueRunId("20261103-0905", [])).toBe("20261103-0905");
    expect(uniqueRunId("20261103-0905", ["20261103-0905"])).toBe("20261103-0905-2");
    expect(uniqueRunId("20261103-0905", ["20261103-0905_opex", "20261103-0905-2"])).toBe("20261103-0905-3");
    expect(uniqueRunId("20261103-0905", ["20261103-09051", "latest.json"])).toBe("20261103-0905");
  });

  it("UT-PHRUN-021 every screen of a batch shares the batch id and runs in <batch>/<slug>, the folder env.ts uses", () => {
    expect(screenRunPath("b1", "opex")).toBe("b1/opex");
    expect(summaryLink("opex")).toBe("opex/summary.md");
    const env = resolveRunEnv({ PARITY_RUN_ID: "20261103-0905", PARITY_SCREEN: "land-lease" }, "r");
    expect(env.runId).toBe("20261103-0905");
    expect(env.runDir.split(/[\\/]/).slice(-4).join("/")).toBe(`e2e/runs/${screenRunPath("20261103-0905", "land-lease")}`);
  });
});

describe("no default screen", () => {
  it("UT-PHRUN-025 no screen given: the runner and env.ts both refuse, naming the same screens on disk (one rule in JS and TS)", () => {
    const root = mkdtempSync(join(tmpdir(), "phrun-"));
    try {
      for (const s of ["opex", "land-lease"]) {
        mkdirSync(join(root, "e2e", "screens", s), { recursive: true });
        writeFileSync(join(root, "e2e", "screens", s, "manifest.ts"), "export {}");
      }
      const have = screensFromListing([{ name: "opex", files: ["manifest.ts"] }, { name: "land-lease", files: ["manifest.ts"] }]);
      expect(() => resolveScreens(parseArgs([]).screens, have)).toThrow("set PARITY_SCREEN (or --screen) to one of: land-lease, opex");
      expect(() => resolveScreens("  ", have)).toThrow(screenRequiredMessage(have));
      expect(() => resolveRunEnv({ PARITY_RUN_ID: "r1" }, root)).toThrow("set PARITY_SCREEN to one of: land-lease, opex");
      // The same rule and the same list in both: only the runner adds its own flag.
      expect(screenRequiredMessage(have).replace(" (or --screen)", "")).toBe(screenRequired(have));
      expect(screenRequiredMessage([])).toMatch(/one of: \(no e2e\/screens\/<slug>\/manifest\.ts yet\)$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("verdict, exit code and index", () => {
  const result = (over: Partial<ScreenResult>): ScreenResult => ({ screen: "opex", runId: "b1", summary: okSummary, ...over });

  it("UT-PHRUN-022 a clean screen passes; flaky tests and known differences do not fail it", () => {
    expect(screenVerdict(result({}))).toEqual({ ok: true, reasons: [] });
    expect(exitCode([result({})])).toBe(0);
  });

  it("UT-PHRUN-023 new or stale differences, a failed test, a failed preflight, the deadline or no summary fail it", () => {
    expect(screenVerdict(result({ summary: { ...okSummary, counts: { new: 1, stale: 0 } } })).reasons).toEqual(["1 new + 0 stale difference(s)"]);
    expect(screenVerdict(result({ summary: { ...okSummary, counts: { new: 0, stale: 2 } } })).ok).toBe(false);
    expect(screenVerdict(result({ summary: { lanes: [{ failed: 2 }], counts: {} } })).reasons).toEqual(["2 failed test(s)"]);
    expect(screenVerdict(result({ preflightFailed: true })).reasons).toContain("preflight failed");
    expect(screenVerdict(result({ timedOut: true })).reasons).toContain("deadline reached (60 min)");
    expect(screenVerdict(result({ summary: null })).reasons).toContain("no summary.json (the report did not run)");
    expect(exitCode([result({}), result({ summary: null })])).toBe(1);
    expect(exitCode([])).toBe(1);
  });

  it("UT-PHRUN-024 the index has one row per screen with its verdict, times, counts and summary link", () => {
    const md = renderRunTable("b1", [
      result({ runId: "b1", wallClockMs: 61_000, phases: [{ name: "phase1", ms: 60_000 }, { name: "rerun", ms: 0, skipped: true }] }),
      result({ screen: "land-lease", runId: "b1", summary: null, preflightFailed: true }),
    ]);
    expect(md).toContain("# Parity batch b1");
    expect(md).toContain("| opex | pass | 1 min 1 s | 4 | 0 | 1 | 0 | 0 | phase1 1 min 0 s, rerun 0 min 0 s (skipped) | [summary.md](opex/summary.md) |");
    expect(md).toMatch(/\| land-lease \| \*\*FAIL\*\*: preflight failed; no summary.json \(the report did not run\) \|.*\| none \|/);
    expect(elapsed(3_725_000)).toBe("62 min 5 s");
  });
});
