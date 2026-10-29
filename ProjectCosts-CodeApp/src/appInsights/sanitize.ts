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
