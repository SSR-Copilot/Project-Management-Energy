/**
 * The one gate in front of every console line the app prints (D163, 25 Nov 2026).
 *
 * The request log (`requestLog.ts`), the bulk-save reports (`data/saveLog.ts`) and the Application Insights
 * start-up lines all print through here, and the Application Insights SDK's own console output is switched
 * off through `consoleIsOpen()`. The rule, from the product owner:
 *
 *   `vsb_EnvironmentName` = `Prod`  →  NOTHING is printed to the browser console, on any screen, for any
 *   operation. Every other environment prints exactly what it printed before.
 *
 * The environment variable is read from Dataverse, so the answer is not known during the first moments of a
 * page load. Three states, and a line that arrives in the first one is never lost for a non-Prod environment
 * and never printed for Prod:
 *
 *   `unknown`  Lines are HELD in memory (at most `HELD_MAX`, oldest dropped first). Nothing is printed.
 *   `open`     The variable was read and is not `Prod` (including a variable that does not exist): the held
 *              lines are printed once, in their original order, and every later line is printed at once.
 *   `closed`   The variable is `Prod`: the held lines are discarded and every later line is dropped.
 *              `closed` is final for the page: a later read cannot reopen it.
 *
 * If the variable cannot be read at all (a failed request), the state stays `unknown`, so nothing is printed
 * until a read succeeds. That is deliberate: without the answer the app cannot tell Prod from any other
 * environment, and the rule is that Prod never prints.
 *
 * This module imports nothing, so every logger can use it without an import cycle. It only decides WHETHER a
 * console call happens; the text of every line is unchanged. The in-memory trace buffer behind "Report a
 * problem" and the Application Insights telemetry are not console output and are not affected.
 */

/** The `vsb_EnvironmentName` value of the production environment, compared case-insensitively after trimming. */
export const PRODUCTION_ENVIRONMENT_NAME = "prod";

/** Lines held while the environment is unknown; the oldest are dropped beyond this. */
export const HELD_MAX = 1000;

export type ConsoleMethod = "info" | "warn" | "error" | "groupCollapsed" | "groupEnd" | "table";

type GateState = "unknown" | "open" | "closed";

interface HeldCall {
  method: ConsoleMethod;
  args: unknown[];
}

/*
 * Under Vitest (`MODE === "test"`) the gate starts open, so the many tests that read what a logger printed need no
 * setup. The gate's own tests call `resetConsoleGate()` to start from `unknown`. Vite replaces the comparison by
 * `false` in a build.
 */
let state: GateState = import.meta.env.MODE === "test" ? "open" : "unknown";
let held: HeldCall[] = [];

/** True for the production environment's name: `Prod`, in any letter case, with surrounding spaces ignored. */
export function isProductionEnvironment(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === PRODUCTION_ENVIRONMENT_NAME;
}

/** Calls the real console method at once. Never throws: logging must not break the app. */
function print(method: ConsoleMethod, args: unknown[]): void {
  try {
    const fn = (console as unknown as Partial<Record<ConsoleMethod, (...a: unknown[]) => void>>)[method];
    if (typeof fn === "function") fn.apply(console, args);
  } catch {
    // A console that throws must not stop the app, or the rest of a held report.
  }
}

/**
 * Tells the gate what `vsb_EnvironmentName` is, once the environment variables have been read (also with the
 * variable missing: pass `undefined`). `Prod` closes the gate for good and drops what was held; anything else
 * opens it and prints what was held, oldest first. Safe to call again with the same answer.
 */
export function applyEnvironmentName(name: string | null | undefined): void {
  if (isProductionEnvironment(name)) {
    state = "closed";
    held = [];
    return;
  }
  if (state !== "unknown") return; // `closed` is final, `open` has nothing left to print
  state = "open";
  const pending = held;
  held = [];
  for (const call of pending) print(call.method, call.args);
}

/** The only way the app prints to the console: printed now, held, or dropped, as the state says. */
export function consoleOutput(method: ConsoleMethod, ...args: unknown[]): void {
  if (state === "open") {
    print(method, args);
    return;
  }
  if (state === "closed") return;
  held.push({ method, args });
  if (held.length > HELD_MAX) held.splice(0, held.length - HELD_MAX);
}

/**
 * True once the environment is known and is not Prod. For a third party that prints on its own (the
 * Application Insights SDK): while the answer is unknown it is false, so such a library stays quiet.
 */
export const consoleIsOpen = (): boolean => state === "open";

/** For tests: back to "environment not known yet" with nothing held. */
export function resetConsoleGate(): void {
  state = "unknown";
  held = [];
}

/** For tests: back to the test default, open. */
export function openConsoleGateForTests(): void {
  state = "open";
  held = [];
}

/** For tests: how many lines are waiting for the environment to be known. */
export const heldLineCount = (): number => held.length;
