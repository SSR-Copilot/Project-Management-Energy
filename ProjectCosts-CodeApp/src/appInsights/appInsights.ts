/**
 * Azure Application Insights for the code app.
 *
 * The connection string is the Dataverse environment variable
 * `vsb_ApplicationInsightsConnectionString` (`data/project.ts`), so each environment can point at its
 * own resource; empty or missing = telemetry off. It arrives only after the environment variables
 * load, while the platform's `sessionLoadSummary` and the first errors come earlier, so those wait in
 * a bounded queue and are sent (or dropped) once `startAppInsights` knows the answer.
 *
 * Sends, once started:
 *  - the platform metrics `setConfig({ logger })` receives (`sessionLoadSummary`, `networkRequest`)
 *    as custom events, as in Microsoft's guide;
 *  - every `trace()` entry (`platform/telemetry.ts`) as a trace, or an exception when it carries an
 *    `Error`;
 *  - page views on each hash-route change, named after the screen.
 * The SDK's own fetch / XHR tracking is off: the platform's `networkRequest` metric already covers
 * every Dataverse call, and the SDK would record full query URLs.
 */
import type { ApplicationInsights, ITelemetryItem } from "@microsoft/applicationinsights-web";
import type { Metric } from "@microsoft/power-apps/telemetry";
import { addSink, trace, type Severity, type TraceEntry } from "@/platform/telemetry";
import { routeName, stripQuery, stripUrlQueries, toEventPayload } from "./sanitize";
import { screenName } from "./screenNames";

/** `undefined` = waiting for the connection string (or for the SDK to download); `null` = off; otherwise running. */
let client: ApplicationInsights | null | undefined;
/** True while the SDK chunk is downloading, so a second `startAppInsights` call does not start it again. */
let starting = false;
/** Settles when the last start has finished (or failed); `startAppInsights` itself returns at once. */
let started: Promise<void> = Promise.resolve();
/** What arrived before the connection string; bounded so a slow start cannot grow it forever. */
const MAX_PENDING = 100;
let pending: Array<(ai: ApplicationInsights) => void> = [];
let removeSink: (() => void) | undefined;

/*
 * The SDK's `SeverityLevel` values (Verbose 0, Information 1, Warning 2, Error 3, Critical 4) as plain
 * numbers: importing the enum would pull the whole SDK into the entry bundle (D119), and
 * the SDK is now fetched only when telemetry is on.
 */
const SEVERITY: Record<Severity, number> = {
  information: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

/**
 * Every outgoing item: page views get their screen's menu name, and the query is stripped from
 * every URL-bearing field.
 */
function scrub(item: ITelemetryItem): void {
  const data = item.baseData;
  if (!data) return;
  if (item.baseType === "PageviewData") {
    data.name = screenName(routeName(typeof data.uri === "string" ? data.uri : window.location.href));
  }
  for (const key of ["uri", "refUri", "url"]) {
    const value: unknown = data[key];
    if (typeof value === "string") data[key] = stripQuery(value);
  }
}

/** Sends now when running, queues while waiting, drops when off. Never throws. */
function send(action: (ai: ApplicationInsights) => void): void {
  if (client === null) return;
  if (client === undefined) {
    if (pending.length < MAX_PENDING) pending.push(action);
    return;
  }
  try { action(client); } catch { /* telemetry never breaks the app */ }
}

/**
 * Starts collecting `trace()` entries right away (queued until `startAppInsights`). Called once from
 * `ensureInitialized` (`platform/powerClient.ts`).
 */
export function listenForTraces(): void {
  removeSink ??= addSink(trackTraceEntry);
}

/**
 * Starts the SDK with the environment variable's value and sends what was queued; an empty value
 * switches telemetry off and drops the queue. Only the first call counts. Called from
 * `SessionProvider` once the environment variables have loaded (or failed to).
 */
export function startAppInsights(connectionString: string | undefined): void {
  if (client !== undefined || starting) return;
  if (!connectionString?.trim()) {
    pending = [];
    client = null;
    return;
  }
  /*
   * D119: the SDK (about 1 MB of source, most of the entry bundle's `components` chunk)
   * is fetched here, once, instead of being part of every page load. What arrives while it downloads
   * queues exactly as it queued before the connection string was known, and is sent when it starts.
   */
  starting = true;
  started = import("@microsoft/applicationinsights-web").then(
    ({ ApplicationInsights: Sdk }) => {
      try {
        const ai = new Sdk({
          config: {
            connectionString: connectionString.trim(),
            enableAutoRouteTracking: true,
            disableAjaxTracking: true,
            disableFetchTracking: true,
          },
        });
        ai.loadAppInsights();
        ai.addTelemetryInitializer(scrub);
        ai.trackPageView();
        client = ai;
      } catch (e) {
        // A bad connection string must not stop the app: telemetry just stays off.
        client = null;
        pending = [];
        trace("warning", "Application Insights did not start", e);
        return;
      }
      const queued = pending;
      pending = [];
      for (const action of queued) send(action);
    },
    (e: unknown) => {
      // The chunk could not be fetched (offline, blocked): same answer, telemetry off.
      client = null;
      pending = [];
      trace("warning", "Application Insights did not load", e);
    },
  ).finally(() => { starting = false; });
}

/** Settles when `startAppInsights` has finished starting the SDK (or failed to). For tests. */
export const appInsightsStarted = (): Promise<void> => started;

/** A platform metric (`sessionLoadSummary` / `networkRequest`) as a custom event of that name. */
export function trackMetric(metric: Metric): void {
  const payload = { name: metric.type, ...toEventPayload(metric.data) };
  send((ai) => ai.trackEvent(payload));
}

/** One `trace()` entry: an exception when it carries an `Error` and is an error, else a trace. */
export function trackTraceEntry(entry: TraceEntry): void {
  const severityLevel = SEVERITY[entry.severity];
  const message = stripUrlQueries(entry.message);
  const failed = entry.severity === "error" || entry.severity === "critical";
  if (failed && entry.detail instanceof Error) {
    const exception = new Error(stripUrlQueries(entry.detail.message));
    exception.name = entry.detail.name;
    if (entry.detail.stack) exception.stack = stripUrlQueries(entry.detail.stack);
    send((ai) => ai.trackException({ exception, severityLevel }, { message }));
    return;
  }
  send((ai) => ai.trackTrace({ message, severityLevel }));
}

/** Test-only: back to "waiting for the connection string", queue and trace listener cleared. */
export function resetAppInsightsForTests(): void {
  client = undefined;
  starting = false;
  started = Promise.resolve();
  pending = [];
  removeSink?.();
  removeSink = undefined;
}
