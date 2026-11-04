/**
 * The parity harness preflight: the pure checks (D80, plan section 1 "Preflight"). `preflight.setup.ts` runs them against
 * the live servers and browsers; they live here so vitest can pin them (`preflightChecks.test.ts`, UT-PHPRE-*) without
 * loading Playwright's test runner. Screen-agnostic: nothing here names a screen.
 *
 * No message here contains a project id (messages end up in reports): variable names, URLs of the local servers, and
 * fingerprint keys and values (row counts and timestamps) only.
 */
import type { Kind, Mode, Tier } from "./contract";
import type { ReferenceMeta } from "./store";

/** The local servers the code app needs: Vite (`npm run dev`) and the connection host (`pac code run`). */
export const LOCAL_SERVERS: readonly string[] = ["http://localhost:3000", "http://localhost:8080"];
export const SERVER_HINT = "start npm run dev and pac code run --appUrl http://localhost:3000";
export const SERVER_TIMEOUT_MS = 5_000;

/** Within this time a stale session must be reported (plan section 5, "Sessions"). */
export const SESSION_TIMEOUT_MS = 45_000;
/**
 * A valid session also passes through login.microsoftonline.com (the SSO round trip), but only for a moment. A page that
 * stays there this long, or shows a sign-in field, has an expired session.
 */
export const LOGIN_DWELL_MS = 10_000;

/** The servers that did not answer, as one error message, or null when all answered. Any HTTP status counts as an answer. */
export async function serverProblem(
  fetchFn: (url: string, init: { signal: AbortSignal }) => Promise<unknown>,
  urls: readonly string[] = LOCAL_SERVERS,
  timeoutMs = SERVER_TIMEOUT_MS,
): Promise<string | null> {
  const down: string[] = [];
  await Promise.all(urls.map(async (url) => {
    try {
      await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      down.push(url);
    }
  }));
  if (!down.length) return null;
  down.sort();
  return `${down.join(" and ")} did not answer within ${timeoutMs / 1000} s: ${SERVER_HINT}`;
}

/** True for a Microsoft sign-in page URL. */
export function isLoginUrl(url: string): boolean {
  try {
    return /(^|\.)login\.(microsoftonline|live|windows)\.(com|net)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The message for an expired or missing saved session of one app. */
export function sessionMessage(kind: Kind, why: string): string {
  const script = kind === "code" ? "e2e:auth:codeapp" : "e2e:auth:canvas";
  return `The saved ${kind === "code" ? "code app" : "Canvas"} session is not valid (${why}): run npm run ${script}`;
}

/**
 * Whether a page on the sign-in host counts as "session expired" yet: a sign-in field is showing, it has stayed on the host
 * for `LOGIN_DWELL_MS`, or the session deadline has passed while it is there.
 */
export function loginVerdict(s: { onLogin: boolean; promptVisible: boolean; onLoginSinceMs: number | null; nowMs: number; startedMs: number }): boolean {
  if (!s.onLogin) return false;
  if (s.promptVisible) return true;
  if (s.onLoginSinceMs !== null && s.nowMs - s.onLoginSinceMs >= LOGIN_DWELL_MS) return true;
  return s.nowMs - s.startedMs >= SESSION_TIMEOUT_MS;
}

/** The canvas app a screen's sign-in check opens: the Cost canvas for Cost screens, the PM canvas for everything else. */
export function canvasAppFor(app: "cost" | "pm" | "admin" | "custom"): "cost" | "pm" {
  return app === "cost" ? "cost" : "pm";
}

/** Whether preflight checks the Canvas session: not when the run records the code app only (compare mode, smoke tier). */
export function needsCanvas(mode: Mode, tier: Tier): boolean {
  return mode === "full" && tier !== "smoke";
}

/** Whether a compare run must have a matching cached Canvas reference. A smoke run compares nothing with the Canvas. */
export function needsReference(mode: Mode, tier: Tier): boolean {
  return mode === "compare" && tier !== "smoke";
}

/** The keys whose values differ between two fingerprints, as `key: reference -> now`, sorted by key. */
export function fingerprintDiff(reference: Record<string, number | string>, now: Record<string, number | string>): string[] {
  const keys = [...new Set([...Object.keys(reference), ...Object.keys(now)])].sort();
  const show = (v: number | string | undefined) => (v === undefined ? "(none)" : JSON.stringify(v));
  return keys.filter((k) => reference[k] !== now[k]).map((k) => `${k}: ${show(reference[k])} -> ${show(now[k])}`);
}

const RERECORD = "re-record the Canvas: PARITY_MODE=full";

/**
 * Why the cached Canvas reference cannot be used for a compare run, or null when it can. Without `fingerprint`, only its
 * presence is checked (preflight does that first, before any browser starts).
 */
export function referenceProblem(
  screen: string,
  meta: ReferenceMeta | null,
  canvasVersion: string,
  fingerprint?: Record<string, number | string>,
): string | null {
  if (!meta) return `No cached Canvas reference for "${screen}" (e2e/reference/${screen}/meta.json): ${RERECORD}`;
  if (meta.canvasVersion !== canvasVersion) {
    return `The cached Canvas reference for "${screen}" was recorded against canvas ${meta.canvasVersion}, the manifest says ${canvasVersion}: ${RERECORD}`;
  }
  if (fingerprint) {
    const diff = fingerprintDiff(meta.fingerprint, fingerprint);
    if (diff.length) return `The data changed since the cached Canvas reference for "${screen}" was recorded (${diff.join("; ")}): ${RERECORD}`;
  }
  return null;
}

/** `PARITY_STARTED_AT` from run.mjs when it is a valid ISO time, else the one already in run.json, else `now`. */
export function startedAtOf(fromEnv: string | undefined, fromRunJson: unknown, now: Date): string {
  const ok = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
  if (ok(fromEnv)) return new Date(fromEnv).toISOString();
  if (ok(fromRunJson)) return fromRunJson;
  return now.toISOString();
}
