/**
 * The one place that talks to the Power Apps code-app host.
 *
 * `getContext()` is the replacement for the canvas app's `User()`, `Param()` and the
 * `vsb_TenantID` / `vsb_EnvironmentID` environment-variable lookups it did in `OnStart` —
 * all three arrive on `IContext` without a Dataverse round trip.
 *
 * Everything reaches Dataverse under the SIGNED-IN USER's security context, which is the
 * property the canvas app relied on and must not change: the canvas app never enforced row
 * security itself (`DataSourceInfo` / `RecordInfo` only *report* privileges the platform has
 * already applied), so this rebuild inherits exactly the same model.
 */
import { setConfig, getContext, type IContext } from "@microsoft/power-apps/app";
import type { Metric } from "@microsoft/power-apps/telemetry";
import { trace } from "./telemetry";

let contextPromise: Promise<IContext> | undefined;

/**
 * Idempotent: configures the SDK once and caches the context promise.
 *
 * `ILogger` in `@microsoft/power-apps` 1.3.1 declares exactly ONE optional member,
 * `logMetric(value: Metric)`. There is no `logInfo` / `logWarning` / `logError` hook — a
 * config object carrying those has to be cast to get past the compiler, and the callbacks
 * are then never invoked. So the two metrics the SDK does emit (`sessionLoadSummary`,
 * `networkRequest`) are what we forward, and application-level tracing stays ours.
 */
export function ensureInitialized(): Promise<IContext> {
  if (!contextPromise) {
    setConfig({
      logger: {
        logMetric: (metric: Metric) => {
          if (metric.type === "sessionLoadSummary") {
            const d = metric.data;
            trace(
              d.successfulAppLaunch ? "information" : "error",
              `app load ${d.appLoadResult}` +
                (d.timeToAppInteractive ? ` in ${Math.round(d.timeToAppInteractive)} ms` : "") +
                (d.appLoadNonOptimalReason ? ` (${d.appLoadNonOptimalReason})` : ""),
              d,
            );
            return;
          }
          const d = metric.data;
          // Only the failures are worth a buffer slot; a healthy app makes hundreds of these.
          if (d.statusCode >= 400) {
            trace("error", `${d.method} ${d.url} → ${d.statusCode} (${d.duration} ms)`, d);
          }
        },
      },
    });
    contextPromise = getContext().catch((e: unknown) => {
      // Do not cache the rejection — a transient host failure should be retryable.
      contextPromise = undefined;
      throw e;
    });
  }
  return contextPromise;
}

export interface Session {
  environmentId: string;
  appId: string;
  tenantId?: string;
  entraObjectId?: string;
  userPrincipalName?: string;
  fullName?: string;
  dataverseOrgUrl?: string;
  appUrl?: string;
  /** The code-app equivalent of `Param(...)`. */
  launchParams: Record<string, string>;
}

export async function readSession(): Promise<Session> {
  const ctx = await ensureInitialized();
  return {
    environmentId: ctx.app.environmentId,
    appId: ctx.app.appId,
    tenantId: ctx.user.tenantId,
    entraObjectId: ctx.user.objectId,
    userPrincipalName: ctx.user.userPrincipalName,
    fullName: ctx.user.fullName,
    dataverseOrgUrl: ctx.app.dataverseOrgUrl,
    appUrl: ctx.app.appUrl,
    launchParams: ctx.app.queryParams ?? {},
  };
}

/**
 * Launch parameters, merged with the browser query string.
 *
 * The canvas app read `Param("projectId")` — note the capital I. Deep links are typed by
 * humans and pasted between apps, so this matches case-insensitively and accepts the
 * spellings actually in circulation. The browser query string is consulted too, so a deep
 * link works under `npm run dev` where there is no host to populate `queryParams`.
 *
 * What is deliberately NOT ported: the canvas fallback to
 * `GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2")` when no id is supplied. That silently
 * opened one specific test project for editing. Here, no id is an explicit empty state.
 */
export const PROJECT_ID_KEYS = ["projectid", "project_id", "projectguid", "id"];

export type ProjectLink =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; projectId: string };

/** An explicit route choice wins over the original host launch. Invalid IDs never fall
 * back to a different project from a lower-priority source. */
export function readProjectLink(
  launchParams: Record<string, string>,
  outerSearch?: string,
  routeSearch?: string,
): ProjectLink {
  const sources = [
    [...new URLSearchParams(routeSearch)],
    Object.entries(launchParams),
    [...new URLSearchParams(outerSearch)],
  ];
  for (const entries of sources) {
    const source = new Map(entries.map(([key, value]) => [key.toLowerCase(), value]));
    const values = PROJECT_ID_KEYS.filter((key) => source.has(key))
      .map((key) => source.get(key)!.trim());
    if (values.length === 0) continue;
    if (values.some((value) => !isGuid(value))) return { status: "invalid" };
    const ids = new Set(values.map(normalizeGuid));
    if (ids.size !== 1) return { status: "invalid" };
    return { status: "valid", projectId: normalizeGuid(values[0]!) };
  }
  return { status: "missing" };
}

export function readProjectId(
  launchParams: Record<string, string>,
  ...searches: (string | undefined)[]
): string | undefined {
  const link = readProjectLink(launchParams, searches[0], searches[1]);
  return link.status === "valid" ? link.projectId : undefined;
}

const GUID_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\})$/i;

export function isGuid(value: string): boolean {
  return GUID_RE.test(value);
}

/** Dataverse accepts a bare GUID; strip the braces a copy-paste from Studio adds. */
export function normalizeGuid(value: string): string {
  return value.replace(/^\{|\}$/g, "").toLowerCase();
}
