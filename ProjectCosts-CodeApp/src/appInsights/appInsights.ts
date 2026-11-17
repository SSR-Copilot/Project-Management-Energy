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
import { rootCauseDetail } from "@/platform/errors";
import { logAction } from "@/platform/requestLog";
import { addSink, trace, type Severity, type TraceEntry } from "@/platform/telemetry";
import { cspAdvice, discardMeaning, isIngestionBlocked, parseConnectionString } from "./diagnostics";
import { routeName, stripQuery, stripUrlQueries, toEventPayload } from "./sanitize";
import { screenName } from "./screenNames";

/**
 * The Dataverse environment variable the connection string comes from (`ENV_VAR_NAMES` in `data/project.ts`;
 * not imported from there so this module does not pull the generated services in).
 */
const ENV_VAR = "vsb_ApplicationInsightsConnectionString";
/** Console prefix of every line below: filter the console for `Application Insights`. */
const LOG = "Application Insights";
/** Discard lines printed before one summary line; a dead endpoint would otherwise print one per batch. */
const MAX_DISCARD_LINES = 3;

/** `undefined` = waiting for the connection string (or for the SDK to download); `null` = off; otherwise running. */
let client: ApplicationInsights | null | undefined;
/** True while the SDK chunk is downloading, so a second `startAppInsights` call does not start it again. */
let starting = false;
/** True when `client === null` only because the environment variables could not be read (a later success may still start it). */
let offAfterFailedRead = false;
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

/** The reason an environment-variable read failed, as one console-safe sentence. */
function loadFailureText(error: unknown): string {
  const text = rootCauseDetail(error) ?? (error instanceof Error ? error.message : String(error));
  return stripUrlQueries(text).slice(0, 300);
}

/**
 * Console-only reporting of what the SDK does with the connection string (D122). These lines
 * deliberately do NOT go through `trace()`: that feeds this module's own sink and would send the
 * connection string back out as telemetry.
 *  - the first batch the server accepts, and every batch it refuses (with the HTTP status, which tells
 *    CSP / network (0) from auth (401/403) from a bad key (400));
 *  - the browser's own Content Security Policy refusal of the ingestion host, once.
 * O(1) per event: two counters and one flag.
 */
function watchDelivery(ai: ApplicationInsights, ingestionOrigin: string): void {
  let acceptedLogged = false;
  let discardLines = 0;
  let cspLogged = false;
  try {
    const core = ai.core;
    // Optional on the SDK's core type: say so instead of silently reporting nothing.
    if (!core.addNotificationListener) throw new Error("this SDK build has no notification listener");
    core.addNotificationListener({
      eventsSent: (events) => {
        if (acceptedLogged) return;
        acceptedLogged = true;
        logAction(`${LOG} OK: ${ingestionOrigin} accepted the first ${events.length} item(s); telemetry is flowing`);
      },
      eventsDiscarded: (events, _reason, statusCode) => {
        discardLines += 1;
        if (discardLines > MAX_DISCARD_LINES) {
          if (discardLines === MAX_DISCARD_LINES + 1) logAction(`${LOG} FAILED: further discards are not logged`, "warn");
          return;
        }
        logAction(`${LOG} FAILED: ${events.length} item(s) not delivered to ${ingestionOrigin} (status ${statusCode ?? 0}): ${discardMeaning(statusCode)}`, "warn");
      },
    });
  } catch (e) {
    logAction(`${LOG}: delivery reporting is not available (${loadFailureText(e)})`, "warn");
  }
  if (typeof document === "undefined") return;
  document.addEventListener("securitypolicyviolation", (event) => {
    if (cspLogged || !isIngestionBlocked(event, ingestionOrigin)) return;
    cspLogged = true;
    logAction(
      `${LOG} BLOCKED by the Content Security Policy (${event.effectiveDirective}, ${event.blockedURI}): ${cspAdvice(ingestionOrigin)}`,
      "warn",
    );
  });
}

/**
 * Starts the SDK with the environment variable's value and sends what was queued; an empty value
 * switches telemetry off and drops the queue. Only the first call counts. Called from
 * `SessionProvider` once the environment variables have loaded (or failed to; `loadError` is then the
 * reason). Prints the connection string in use and the state (on, or off and why) to the console.
 */
export function startAppInsights(connectionString: string | undefined, loadError?: unknown): void {
  // Only the first real answer counts, except that "off because the read failed" is not an answer: the
  // query refetches (focus, remount), and a later success must be able to start telemetry.
  if ((client !== undefined && !offAfterFailedRead) || starting) return;
  offAfterFailedRead = false;
  const trimmed = connectionString?.trim();
  if (!trimmed) {
    pending = [];
    client = null;
    offAfterFailedRead = loadError !== undefined;
    logAction(
      loadError !== undefined
        ? `${LOG} OFF: the environment variable ${ENV_VAR} could not be read (${loadFailureText(loadError)}). ` +
          "Check that the signed-in user's security role can read Environment Variable Definition and Environment Variable Value."
        : `${LOG} OFF: the environment variable ${ENV_VAR} is empty or missing in this environment ` +
          "(no value row and no default value, or the value was not deployed).",
      "warn",
    );
    return;
  }
  const info = parseConnectionString(trimmed);
  // The full value is printed on request of the product owner (17 Nov 2026): it is a connection string, not a secret credential for reading data.
  logAction(`${LOG} connection string in use (environment variable ${ENV_VAR}): ${trimmed}`);
  logAction(
    `${LOG} sends to ${info.ingestionOrigin} · app id ${info.applicationId ?? "(none)"} · live ${info.liveEndpoint ?? "(none)"} · ` +
      `if a Content Security Policy is enforced, ${cspAdvice(info.ingestionOrigin)}`,
  );
  if (info.problems.length) logAction(`${LOG} connection string problem: ${info.problems.join("; ")}`, "warn");
  const ingestionOrigin = info.ingestionOrigin;
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
            connectionString: trimmed,
            enableAutoRouteTracking: true,
            disableAjaxTracking: true,
            disableFetchTracking: true,
            // The SDK's own warnings and errors (e.g. "Failed to send telemetry.") reach the console too.
            loggingLevelConsole: 2,
          },
        });
        ai.loadAppInsights();
        watchDelivery(ai, ingestionOrigin);
        ai.addTelemetryInitializer(scrub);
        ai.trackPageView();
        client = ai;
        logAction(`${LOG} ON: SDK started, ${pending.length} item(s) queued from before the connection string was known`);
      } catch (e) {
        // A bad connection string must not stop the app: telemetry just stays off.
        client = null;
        pending = [];
        logAction(`${LOG} OFF: the SDK did not start (${loadFailureText(e)})`, "warn");
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
      logAction(`${LOG} OFF: the SDK chunk could not be downloaded (${loadFailureText(e)}); a Content Security Policy script-src, a network block or being offline are the usual causes`, "warn");
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
  offAfterFailedRead = false;
  started = Promise.resolve();
  pending = [];
  removeSink?.();
  removeSink = undefined;
}
