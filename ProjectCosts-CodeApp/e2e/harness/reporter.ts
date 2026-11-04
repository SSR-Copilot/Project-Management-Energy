/**
 * The parity harness reporter (D80): appends one `TestTiming` per finished test to `<runDir>/timings.json`.
 *
 * - `lane` is the test's `@<lane>` tag (`laneOfTitle` on its title path and tags), else its project's name (`preflight`,
 *   `report`).
 * - `title` is the title path without the project: file (forward slashes), describes, test title, joined by " › ". The
 *   same test therefore has the same title in phase 1, phase 2 and the re-run pass, which `summary.ts` relies on to tell a
 *   flaky test (failed, then passed on the re-run) from a failed one.
 * - `retry` is 1 in run.mjs's re-run pass (`PARITY_RERUN=1`), else Playwright's own retry number (0: the harness has
 *   `retries: 0`).
 *
 * The file is rewritten after EVERY test (temp file + rename), not only at the end, so a phase that run.mjs kills at its
 * deadline still leaves the timings of every test that finished. One Playwright process writes at a time: the phases run
 * one after the other. The run directory comes from the config (`{ runDir }` reporter option), not from the environment.
 * No project id is ever written: titles and project names only.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import type { TestTiming } from "./contract";
import { laneOfTitle } from "./env";

/** The timing of one finished attempt (pure; pinned by `reporter.test.ts`, UT-PHREP-*). */
export function timingOf(
  test: Pick<TestCase, "titlePath" | "tags"> & { parent: { project(): { name: string } | undefined } },
  result: Pick<TestResult, "status" | "duration" | "retry">,
  rerun: boolean,
): TestTiming {
  const project = test.parent.project()?.name ?? "";
  const parts = test.titlePath().filter((s) => s !== "");
  if (parts[0] === project) parts.shift();
  if (parts.length) parts[0] = parts[0]!.replace(/\\/g, "/");
  const lane = laneOfTitle([...test.titlePath(), ...(test.tags ?? [])].join(" ")) ?? (project || "unknown");
  return { lane, title: parts.join(" › "), status: result.status, ms: Math.round(result.duration), retry: rerun ? 1 : result.retry };
}

function readTimings(file: string): TestTiming[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as TestTiming[]) : [];
  } catch {
    return []; // a malformed file from a killed run: start over rather than fail the phase
  }
}

export default class HarnessReporter implements Reporter {
  private readonly file: string;
  private readonly rerun = process.env.PARITY_RERUN === "1";
  private timings: TestTiming[] | undefined;

  constructor(options: { runDir?: string } = {}) {
    if (!options.runDir) throw new Error("reporter.ts: the config must pass { runDir }");
    this.file = join(options.runDir, "timings.json");
  }

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Read once per process: earlier phases' timings are kept, this phase's are added.
    this.timings ??= readTimings(this.file);
    this.timings.push(timingOf(test, result, this.rerun));
    this.flush();
  }

  onEnd(_result: FullResult): void {
    if (this.timings) this.flush();
  }

  private flush(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.timings ?? [], null, 1)}\n`, "utf8");
    renameSync(tmp, this.file);
  }
}
