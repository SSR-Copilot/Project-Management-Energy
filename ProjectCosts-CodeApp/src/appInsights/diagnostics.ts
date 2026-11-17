/**
 * Pure helpers for the Application Insights console lines (`appInsights.ts`): no SDK, no DOM, no
 * globals, so each decision is a plain function with a test (CONVENTIONS rule 5).
 *
 * Why this exists (D122): in DEV telemetry arrived and in QA it did not, and nothing in the
 * console said why. The usual QA-only causes are a Content Security Policy that blocks the ingestion
 * host (Microsoft's code-app default is `connect-src 'none'`), an ingestion endpoint that refuses the
 * request, or a connection string that is empty, wrapped in quotes or from the wrong resource.
 */

/** What the SDK sends to when the connection string carries no `IngestionEndpoint`. */
export const DEFAULT_INGESTION_ORIGIN = "https://dc.services.visualstudio.com";

export interface ConnectionStringInfo {
  instrumentationKey?: string;
  ingestionEndpoint?: string;
  liveEndpoint?: string;
  applicationId?: string;
  /** Where telemetry is POSTed: the `IngestionEndpoint`'s origin, else the SDK default. This is the host a CSP must allow. */
  ingestionOrigin: string;
  /** Why the value is probably wrong; empty when it looks fine. */
  problems: string[];
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `https` origin of `url`, or `undefined` when it is not an absolute https URL. */
function httpsOrigin(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

/** `Key=value;Key=value` into its fields, keys lower-cased; one pass, no regex backtracking. */
function fieldsOf(raw: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) fields.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  return fields;
}

/** Reads the connection string the way the SDK does, and says what is wrong with it. Never throws. */
export function parseConnectionString(raw: string): ConnectionStringInfo {
  const fields = fieldsOf(raw);
  const instrumentationKey = fields.get("instrumentationkey") || undefined;
  const ingestionEndpoint = fields.get("ingestionendpoint") || undefined;
  const problems: string[] = [];

  if (/^["']|["']$/.test(raw)) problems.push("the value is wrapped in quotes (remove them in the environment variable)");
  if (!instrumentationKey) problems.push("no InstrumentationKey");
  else if (!GUID.test(instrumentationKey)) problems.push("the InstrumentationKey is not a GUID");

  let ingestionOrigin = DEFAULT_INGESTION_ORIGIN;
  if (ingestionEndpoint) {
    const origin = httpsOrigin(ingestionEndpoint);
    if (origin) ingestionOrigin = origin;
    else problems.push("the IngestionEndpoint is not an https URL, so the SDK default host is assumed");
  }

  return {
    instrumentationKey,
    ingestionEndpoint,
    liveEndpoint: fields.get("liveendpoint") || undefined,
    applicationId: fields.get("applicationid") || undefined,
    ingestionOrigin,
    problems,
  };
}

/** The minimal shape of a `SecurityPolicyViolationEvent` this module reads (so tests need no DOM). */
export interface CspViolation {
  blockedURI: string;
  effectiveDirective: string;
}

/** True when `violation` is the browser refusing to send to the ingestion host (XHR, fetch and beacon all fall under `connect-src`). */
export function isIngestionBlocked(violation: CspViolation, ingestionOrigin: string): boolean {
  return (
    violation.effectiveDirective.startsWith("connect-src") &&
    violation.blockedURI.toLowerCase().startsWith(ingestionOrigin.toLowerCase())
  );
}

/** What an HTTP status the SDK reports for a discarded batch most likely means; `0` is "no reply reached the browser". */
export function discardMeaning(statusCode: number | undefined): string {
  if (statusCode === undefined || statusCode === 0) {
    return "no reply reached the browser: blocked by the Content Security Policy, a firewall or proxy, an ad blocker, or offline";
  }
  if (statusCode === 400) return "rejected as a bad request: check the InstrumentationKey and the resource";
  if (statusCode === 401 || statusCode === 403) {
    return "refused: the Application Insights resource may have Local Authentication disabled, which the browser SDK cannot satisfy";
  }
  if (statusCode === 404) return "endpoint not found: check the IngestionEndpoint";
  return `HTTP ${statusCode}`;
}

/** Where the Content Security Policy for code apps is set, and what to add to it. */
export function cspAdvice(ingestionOrigin: string): string {
  return (
    `add ${ingestionOrigin} to connect-src in Power Platform admin center > Environments > <this environment> > ` +
    "Settings > Product > Privacy + Security > Content security policy > App (a change can take a few minutes)"
  );
}
