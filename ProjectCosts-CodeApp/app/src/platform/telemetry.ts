/**
 * Replaces the canvas `Trace(...)` calls and `App.OnError`.
 *
 * The canvas app captured every error into `gblReportError` and then *commented out* the
 * `Notify` that told the user — see `App.OnError` — while the panel that was supposed to
 * file the report has its flow call commented out too. So today a Dataverse fault is
 * completely silent. This buffer keeps the capture (the report panel needs it) and the UI
 * layer is responsible for actually saying something.
 */
export type Severity = "information" | "warning" | "error" | "critical";

export interface TraceEntry {
  severity: Severity;
  message: string;
  at: string;
  detail?: unknown;
}

/** Ring buffer. Bounded so a render loop cannot exhaust memory. */
const MAX_ENTRIES = 200;
const entries: TraceEntry[] = [];
const listeners = new Set<() => void>();

export function trace(severity: Severity, message: string, detail?: unknown): void {
  entries.push({ severity, message, at: new Date().toISOString(), detail });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const l of listeners) l();
}

export function traces(): readonly TraceEntry[] {
  return entries;
}

/** The most recent error, which is what the "Report a problem" panel pre-fills from. */
export function lastError(): TraceEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && (e.severity === "error" || e.severity === "critical")) return e;
  }
  return undefined;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearTraces(): void {
  entries.length = 0;
  for (const l of listeners) l();
}
