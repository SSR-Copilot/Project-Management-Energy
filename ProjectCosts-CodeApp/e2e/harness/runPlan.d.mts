/** Types of `runPlan.mjs` (the parity runner's pure part, D80). Keep in step with that file; `runPlan.test.ts` uses both. */
import type { LaneSummary, Mode, Tier } from "./contract";

export declare const MODES: readonly Mode[];
export declare const TIERS: readonly Tier[];
export declare const CANVAS_READ_LANES: readonly string[];
export declare const CODE_READ_LANES: readonly string[];
export declare const SCREEN_DEADLINE_MS: number;
export declare const REPORT_ALLOWANCE_MS: number;
export declare const PLAYWRIGHT_CONFIG: string;
export declare const USAGE: string;

export interface RunArgs { screens: string; mode: Mode; tier: Tier; lanes: number | undefined; rerun: boolean; help: boolean }
export declare function parseArgs(argv: readonly string[], defaults?: { screen?: string }): RunArgs;

export declare function screenRequiredMessage(available: readonly string[]): string;
export declare function screensFromListing(listing: readonly { name: string; files: readonly string[] }[]): string[];
export declare function resolveScreens(spec: string, available: readonly string[]): string[];

type Vars = Readonly<Record<string, string | undefined>>;
export declare function writesInParallel(vars: Vars): boolean;
export declare function projectVarsProblem(vars: Vars): string | null;
export declare function hasReadProject(vars: Vars): boolean;

export interface Phase {
  name: "phase1" | "phase2" | "rerun" | "report";
  label: string;
  projects: string[];
  args: string[];
  rerun?: boolean;
  report?: boolean;
}
export declare function phasePlan(o: { mode: Mode; tier: Tier; parallel: boolean; rerun: boolean }): Phase[];
export declare function mergeFailed(lastRuns: readonly unknown[]): string[];
export declare function preflightFailed(timings: unknown): boolean;
export declare function phaseTimeout(phase: Pick<Phase, "report">, nowMs: number, deadlineMs: number): number;
export declare function playwrightArgs(phase: Phase, o?: { config?: string; lastFailedFile?: string }): string[];
export declare function shellArg(arg: string): string;
export declare function commandLine(command: string, args: readonly string[]): string;

export declare function newRunId(now?: Date): string;
export declare function uniqueRunId(base: string, existingNames: readonly string[]): string;
export declare function screenRunPath(batchId: string, slug: string): string;
export declare function summaryLink(slug: string): string;
export declare function elapsed(ms: number): string;

export interface PhaseTime { name: string; ms: number; skipped?: boolean; exitCode?: number | null }
export interface ScreenResult {
  screen: string;
  runId: string;
  wallClockMs?: number;
  preflightFailed?: boolean;
  timedOut?: boolean;
  phases?: PhaseTime[];
  summary: { lanes?: Partial<LaneSummary>[]; counts?: Partial<Record<string, number>> } | null;
}
export declare function screenVerdict(result: ScreenResult): { ok: boolean; reasons: string[] };
export declare function exitCode(results: readonly ScreenResult[]): 0 | 1;
export declare function renderRunTable(batchId: string, results: readonly ScreenResult[]): string;

/** The per-run project prompt (`run.mjs` askProjects): asked every run, never stored. */
export declare const PROJECT_PROMPTS: readonly { name: string; question: string }[];
export declare function maskId(id: string | undefined): string;
export declare function readProjectAnswer(
  answer: string | undefined,
  ctx: { name: string; readProject: string | undefined },
): { value: string | undefined; error?: undefined } | { error: string; value?: undefined };
