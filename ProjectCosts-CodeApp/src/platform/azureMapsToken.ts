/**
 * The Azure Maps SAS token for the Project General Data map (D25, Azure Maps integration 6 Nov 2026;
 * `ProjectDocs/app-docs/18-AZURE-MAPS-IN-THE-CODE-APP.md`).
 *
 * A SAS token lives at most 24 hours, so nothing is stored in the app or its build: the token comes at runtime from the
 * solution flow "Get Azure Maps SAS Token" (`data/flows.ts`, `getAzureMapsSasToken`). The flow calls Azure Resource
 * Manager `listSas` on the Maps account through the service account's connection, signed by the account's managed
 * identity. Subscription, resource group, account, identity and lifetime are the flow's environment variables
 * (`vsb_AzureMaps*`), so the app holds no Azure value at all and users need no Azure rights.
 *
 *   - One flow call per token lifetime per browser: the token is cached in memory and `localStorage` (reloads and new
 *     tabs reuse it). It is read-only, rate-limited and short-lived, so that is acceptable (Xebia test S1/S2, 2 Nov 2026).
 *   - A background refresh fetches a new one `REFRESH_MARGIN_MS` before expiry, so no map request waits for the flow.
 *   - Parallel requests share one flow call.
 *   - `invalidateAzureMapsToken` (after a 401/403 from Azure Maps) drops it; the next request fetches a new one.
 *   - A failure is a `MapTokenError` with a `kind` the map turns into one plain sentence (`MAP_MESSAGES`); for
 *     `RETRY_AFTER_FAILURE_MS` every request gets the same error without a new flow run, so panning a broken map does
 *     not start a flow run per tile.
 *
 * The token itself is never logged: the flow call is a `[VSB] DATA execute flow …` line with its time only (rule 23);
 * a failure is one `[VSB] ERROR Azure Maps token …` line with the flow's error code and message.
 */
import { getAzureMapsSasToken } from "@/data/flows";
import { logError } from "./requestLog";

export const REFRESH_MARGIN_MS = 10 * 60 * 1000;
export const RETRY_AFTER_FAILURE_MS = 60 * 1000;
/** Used when neither the token's `exp` nor the flow's `expiresutc` can be read. */
const FALLBACK_LIFETIME_MS = 60 * 60 * 1000;
const STORE_KEY = "vsb-azure-maps-sas";

/**
 * Why the map cannot load:
 *   notAuthorized  the service account may not call `listSas` (ARM 403 `AuthorizationFailed`): the role is missing
 *   notConfigured  a `vsb_AzureMaps*` value names no such subscription / group / account / identity (ARM 400 / 404)
 *   unavailable    the flow or Azure did not answer (502 / 503 / 504, a timeout, the network)
 *   accessDenied   Azure Maps refused the token itself (a tile 401 / 403)
 *   unknown        anything else
 */
export type MapErrorKind = "notAuthorized" | "notConfigured" | "unavailable" | "accessDenied" | "unknown";

export class MapTokenError extends Error {
  readonly kind: MapErrorKind;
  constructor(kind: MapErrorKind, message: string) {
    super(message);
    this.name = "MapTokenError";
    this.kind = kind;
  }
}

/**
 * The flow's `errorcode` (`Failed_steps`): the ARM error code (e.g. `AuthorizationFailed`), else the run error
 * (`InvalidTemplate` when a `vsb_AzureMaps*` value cannot be used, `ActionTimedOut`), else the step's status code.
 */
export function kindOfFlowErrorCode(code: string): MapErrorKind {
  if (/AuthorizationFailed|Forbidden|Unauthorized|^40[13]$/i.test(code)) return "notAuthorized";
  if (/NotFound|InvalidSubscriptionId|InvalidResource|LinkedInvalidPropertyId|InvalidTemplate|BadRequest|^40[04]$/i.test(code)) return "notConfigured";
  if (/^50[234]$|Time[dD]?Out|Timeout|ServiceUnavailable|BadGateway/i.test(code)) return "unavailable";
  return "unknown";
}

/** A failed flow call (the SDK's `DataError`): no answer at all, or an error the flow did not catch. */
function kindOfCallFailure(message: string): MapErrorKind {
  if (/\b50[234]\b|NoResponse|BadGateway|GatewayTimeout|timed? ?out|Failed to fetch|NetworkError|network/i.test(message)) return "unavailable";
  if (/AuthorizationFailed|\b403\b|forbidden/i.test(message)) return "notAuthorized";
  return "unknown";
}

let lastFailure: MapTokenError | null = null;
let failedAt = 0;

/** The kind of an error the map reported: ours (from the flow) when there is one, else the SDK's own (tiles). */
export function mapErrorKind(error: unknown): MapErrorKind {
  if (error instanceof MapTokenError) return error.kind;
  if (lastFailure) return lastFailure.kind;
  const message = error instanceof Error ? error.message : String(error);
  if (/\b40[13]\b|unauthori[sz]ed|forbidden/i.test(message)) return "accessDenied";
  return kindOfCallFailure(message);
}

/** Azure Maps SAS tokens are JWTs: read `exp` when present. */
export function tokenExpiry(token: string): number | null {
  const body = token.replace(/^jwt-sas\s+/i, "").split(".")[1];
  if (!body) return null;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

interface Cached {
  token: string;
  expiresAt: number;
}

const readStore = (): Cached | null => {
  try {
    const c = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Cached | null;
    return c && typeof c.token === "string" && typeof c.expiresAt === "number" ? c : null;
  } catch {
    return null;
  }
};

let cached: Cached | null = null;
let loaded = false;
let inFlight: Promise<string> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const fresh = (c: Cached | null): c is Cached => !!c && c.expiresAt - Date.now() > REFRESH_MARGIN_MS;

function store(c: Cached | null): void {
  cached = c;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  // A minute before the margin, so no map request waits for the flow. A token already inside the margin gets no
  // timer: the next request fetches a new one, and a flow that keeps answering short-lived tokens never loops.
  const due = c ? c.expiresAt - REFRESH_MARGIN_MS - Date.now() - 60_000 : 0;
  if (c && due > 0) {
    refreshTimer = setTimeout(() => { cached = null; void azureMapsToken().catch(() => undefined); }, due);
  }
  try {
    if (c) localStorage.setItem(STORE_KEY, JSON.stringify(c));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // Storage blocked: the memory cache still works for this page.
  }
}

async function fetchToken(): Promise<string> {
  let result;
  try {
    result = await getAzureMapsSasToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MapTokenError(kindOfCallFailure(message), message);
  }
  if (result.errorcode) {
    throw new MapTokenError(kindOfFlowErrorCode(result.errorcode), `${result.errorcode}: ${result.errormessage ?? ""}`);
  }
  if (!result.sastoken) throw new MapTokenError("unknown", 'The flow "Get Azure Maps SAS Token" returned no "sastoken"');
  const fromFlow = result.expiresutc ? Date.parse(result.expiresutc) : Number.NaN;
  store({
    token: result.sastoken,
    expiresAt: tokenExpiry(result.sastoken) ?? (Number.isNaN(fromFlow) ? Date.now() + FALLBACK_LIFETIME_MS : fromFlow),
  });
  return result.sastoken;
}

/** The token for the Azure Maps SDK's `getToken` callback. Never runs two flow calls at once. */
export function azureMapsToken(): Promise<string> {
  if (!loaded) {
    loaded = true;
    const restored = readStore();
    if (fresh(restored)) store(restored);
  }
  if (fresh(cached)) return Promise.resolve(cached.token);
  if (inFlight) return inFlight;
  if (lastFailure && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return Promise.reject(lastFailure);
  inFlight = fetchToken()
    .then((token) => { lastFailure = null; return token; })
    .catch((error: unknown) => {
      store(null);
      lastFailure = error instanceof MapTokenError ? error : new MapTokenError("unknown", String(error));
      failedAt = Date.now();
      logError("Azure Maps token", `${lastFailure.kind} — ${lastFailure.message}`);
      throw lastFailure;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Drop the cached token (Azure Maps answered 401/403) so the next request fetches a new one. */
export function invalidateAzureMapsToken(): void {
  loaded = true;
  store(null);
}

/** Tests only: forget the module state. */
export function resetAzureMapsTokenForTests(): void {
  loaded = false;
  inFlight = null;
  lastFailure = null;
  failedAt = 0;
  store(null);
}
