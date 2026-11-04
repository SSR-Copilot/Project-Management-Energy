/**
 * UT-PHREP: the parity harness reporter (`reporter.ts`, D80): one timing per finished test in `<runDir>/timings.json`.
 * Node only, a temp directory as the run folder.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestCase, TestResult } from "@playwright/test/reporter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import HarnessReporter, { timingOf } from "./reporter";

const fakeTest = (project: string, path: string[], tags: string[] = []) => ({
  titlePath: () => ["", project, ...path],
  tags,
  parent: { project: () => ({ name: project }) },
});
const res = (status: TestResult["status"], duration = 1234.4, retry = 0) => ({ status, duration, retry });

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "phrep-")); });
afterEach(() => {
  delete process.env.PARITY_RERUN;
  rmSync(dir, { recursive: true, force: true });
});

describe("timingOf", () => {
  it("UT-PHREP-001 lane from the @tag, title without the project, file with forward slashes", () => {
    const t = timingOf(fakeTest("code-A", ["harness\\lanes\\visual.lane.ts", "visual @code-A", "default state"]), res("passed"), false);
    expect(t).toEqual({ lane: "code-A", title: "harness/lanes/visual.lane.ts › visual @code-A › default state", status: "passed", ms: 1234, retry: 0 });
  });

  it("UT-PHREP-002 a tag given as the tag option counts; without a tag the lane is the project name", () => {
    expect(timingOf(fakeTest("canvas-B", ["x.lane.ts", "gates"], ["@canvas-B"]), res("failed"), false).lane).toBe("canvas-B");
    expect(timingOf(fakeTest("preflight", ["harness/preflight.setup.ts", "preflight"]), res("passed"), false).lane).toBe("preflight");
  });

  it("UT-PHREP-003 the re-run pass records retry 1, so the summary can tell a flaky test from a failed one", () => {
    expect(timingOf(fakeTest("code-B", ["f.ts", "t @code-B"]), res("passed"), true).retry).toBe(1);
    expect(timingOf(fakeTest("code-B", ["f.ts", "t @code-B"]), res("passed", 1, 2), false).retry).toBe(2);
  });
});

describe("HarnessReporter", () => {
  it("UT-PHREP-004 appends to the timings of earlier phases and rewrites the file after every test", () => {
    const file = join(dir, "timings.json");
    writeFileSync(file, JSON.stringify([{ lane: "preflight", title: "p", status: "passed", ms: 1, retry: 0 }]));
    const r = new HarnessReporter({ runDir: dir });
    r.onTestEnd(fakeTest("code-A", ["f.ts", "a @code-A"]) as unknown as TestCase, res("passed") as TestResult);
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(2);
    r.onTestEnd(fakeTest("code-A", ["f.ts", "b @code-A"]) as unknown as TestCase, res("failed") as TestResult);
    const all = JSON.parse(readFileSync(file, "utf8")) as { title: string; status: string }[];
    expect(all.map((t) => t.status)).toEqual(["passed", "passed", "failed"]);
    expect(all[2]!.title).toBe("f.ts › b @code-A");
  });

  it("UT-PHREP-005 PARITY_RERUN=1 marks every timing of the process as retry 1; a malformed file starts over", () => {
    writeFileSync(join(dir, "timings.json"), "{ half a file");
    process.env.PARITY_RERUN = "1";
    const r = new HarnessReporter({ runDir: dir });
    r.onTestEnd(fakeTest("write-code", ["f.ts", "flow @write-code"]) as unknown as TestCase, res("passed") as TestResult);
    expect(JSON.parse(readFileSync(join(dir, "timings.json"), "utf8"))).toEqual([
      { lane: "write-code", title: "f.ts › flow @write-code", status: "passed", ms: 1234, retry: 1 },
    ]);
  });

  it("UT-PHREP-006 needs the run folder from the config and prints nothing itself", () => {
    expect(() => new HarnessReporter({})).toThrow(/must pass \{ runDir \}/);
    expect(new HarnessReporter({ runDir: dir }).printsToStdio()).toBe(false);
  });
});
