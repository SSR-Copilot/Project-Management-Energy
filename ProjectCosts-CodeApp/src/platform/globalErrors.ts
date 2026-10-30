/**
 * Errors nobody caught: a script error outside React and a rejected promise nobody awaited.
 * React render errors are caught by `ErrorBoundary`, which already traces them as critical.
 *
 * Both go through `trace("critical", …)`, so they land in the trace buffer AND print one
 * `[VSB] ERROR … · last actions: …` console line with the route and the last actions that ran
 * (`platform/requestLog.ts`). Installed once, from `main.tsx`.
 */
import { trace } from "./telemetry";

let installed = false;

export function installGlobalErrorLog(target: Pick<Window, "addEventListener"> = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener("error", (event: ErrorEvent) => {
    trace("critical", `Unhandled error: ${event.message || "script error"}`, event.error);
  });
  target.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    const text = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "rejected promise";
    trace("critical", `Unhandled promise rejection: ${text}`, reason);
  });
}

/** For tests: allow `installGlobalErrorLog` to run again. */
export function resetGlobalErrorLog(): void {
  installed = false;
}
