/**
 * Structured telemetry. Preserves the canvas apps' `Trace(..., TraceSeverity.X)`
 * semantics — App.OnStart traces user teams, roles and editable countries at
 * Information, and every IfError branch traces at Critical.
 */
export type Severity = "information" | "warning" | "error" | "critical";

export interface TraceEvent {
  severity: Severity;
  message: string;
  screen?: string;
  data?: Record<string, unknown>;
  at: string;
}

const buffer: TraceEvent[] = [];
const MAX = 300;

export function trace(severity: Severity, message: string, data?: Record<string, unknown>) {
  const ev: TraceEvent = { severity, message, data, at: new Date().toISOString() };
  buffer.push(ev);
  if (buffer.length > MAX) buffer.shift();
  if (import.meta.env.DEV) {
    const fn = severity === "critical" || severity === "error" ? console.error
      : severity === "warning" ? console.warn : console.info;
    fn(`[${severity}] ${message}`, data ?? "");
  }
}

export const recentTraces = () => [...buffer];

/** Simple performance marks, so the Core Web Vitals targets are measurable in-app. */
export function measure<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const ms = performance.now() - t0;
    if (ms > 200) trace("warning", `slow: ${label}`, { ms: Math.round(ms) });
  }
}
