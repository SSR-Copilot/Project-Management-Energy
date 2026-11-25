/**
 * What leaves the browser. Dataverse request URLs carry `$filter` values (project names, ids,
 * mails) and the hash routes carry `?projectId=`, so every query string is dropped before a
 * URL reaches Application Insights. No user identity is attached either (SDK defaults only).
 */

function cutQuery(part: string): string {
  const q = part.indexOf("?");
  return q < 0 ? part : part.slice(0, q);
}

/** `https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$filter=…` → without the query; a hash route's query too. */
export function stripQuery(url: string): string {
  const hash = url.indexOf("#");
  if (hash < 0) return cutQuery(url);
  return cutQuery(url.slice(0, hash)) + cutQuery(url.slice(hash));
}

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A page view's name: the hash route (`/project/milestones`), not `document.title`, which is
 * "Project Costs" on every screen. Query dropped; an id in the path becomes `:id`, so one screen
 * stays one row in the Azure reports.
 */
export function routeName(url: string): string {
  const hash = url.indexOf("#");
  const route = hash < 0 ? "" : cutQuery(url.slice(hash + 1));
  return (route || "/").replace(GUID, ":id");
}

const URL_WITH_QUERY = /(https?:\/\/[^\s?#]+)(#[^\s?]*)?\?[^\s#]*/g;

/** The same, for URLs inside free text (trace messages such as `GET <url> → 404`). */
export function stripUrlQueries(text: string): string {
  return text.replace(URL_WITH_QUERY, (_m, base: string, hash?: string) => base + (hash ?? ""));
}

/** The shape `ApplicationInsights.trackDependencyData` takes (`IDependencyTelemetry`), without importing the SDK (D119). */
export interface DependencyPayload {
  id: string;
  name: string;
  /** The query-less URL: the `data` column of the `dependencies` table. */
  data: string;
  /** The host called; the `target` column, which the Application Map groups by. */
  target?: string;
  type: string;
  duration: number;
  responseCode: number;
  success: boolean;
  properties?: Record<string, string>;
}

/** The platform's per-request metric (`NetworkRequestMetricData`); `statusCode` is optional here because the host has sent it undefined (D122). */
export interface NetworkRequestData {
  url: string;
  method: string;
  statusCode?: number;
  duration: number;
  responseSize?: number;
}

/** A unique id for one dependency row; the SDK requires one and uses it to correlate. Random, never derived from data. */
function dependencyId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
  return Date.now().toString(16) + Math.random().toString(16).slice(2);
}

/**
 * One `networkRequest` metric as a dependency, so a Dataverse call shows in Performance, Failures and the
 * Application Map (the `dependencies` table), which a custom event never reaches. The SDK's own request
 * tracking cannot see these calls: the host makes them and reports them back.
 *  - `name`: `METHOD /path` with ids replaced by `:id`, so `vsb_projects(<guid>)` is one row per entity set;
 *  - `data`: the URL without its query (rule: no `$filter` values leave the browser);
 *  - `target`: the host, when the URL is absolute;
 *  - `success`: false only on a 4xx/5xx; an undefined status (seen on DEV) counts as success with code 0,
 *    so the Failures blade shows real refusals, not unknowns.
 */
export function toDependency(data: NetworkRequestData, id: string = dependencyId()): DependencyPayload {
  const url = stripQuery(data.url);
  let target: string | undefined;
  let path = url;
  try {
    const u = new URL(url);
    target = u.host;
    path = u.pathname;
  } catch {
    // A relative URL: no host, the whole value is the path.
  }
  const statusCode = typeof data.statusCode === "number" ? data.statusCode : 0;
  const payload: DependencyPayload = {
    id,
    name: `${data.method} ${path.replace(GUID, ":id")}`,
    data: url,
    type: "HTTP",
    duration: data.duration,
    responseCode: statusCode,
    success: statusCode < 400,
  };
  if (target) payload.target = target;
  if (data.responseSize !== undefined) payload.properties = { responseSize: String(data.responseSize) };
  return payload;
}

/**
 * A platform metric's `data` as an App Insights event: numbers become `customMeasurements`
 * (`duration`, `timeToAppInteractive` — what the Microsoft sample queries read), everything
 * else `customDimensions`, with `url` stripped of its query.
 */
export function toEventPayload(data: object): {
  properties: Record<string, string>;
  measurements: Record<string, number>;
} {
  const properties: Record<string, string> = {};
  const measurements: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "number") measurements[key] = value;
    else properties[key] = key === "url" && typeof value === "string" ? stripQuery(value) : String(value);
  }
  return { properties, measurements };
}
