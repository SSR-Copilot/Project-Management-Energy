/**
 * Test-only idle hook for the Playwright parity harness (D80).
 *
 * The harness needs one reliable answer to "has the app finished loading and saving?" instead of
 * guessing with fixed waits. When, and only when, the browser's `localStorage` carries
 * `__vsbE2E = "1"` (the harness sets it with an init script before the app loads), this defines
 * `window.__vsbIdle()`, which is true when:
 *   - no TanStack query is fetching,
 *   - no mutation is pending, and
 *   - no element marked `data-vsb-busy="true"` is in the page (`components/LoadingOverlay.tsx`).
 *
 * `window.__vsbBusy()` says what is still in flight (counts, and each fetching query's label), so a harness timeout can
 * name it (live run 14, 4 Nov 2026: the app stayed busy 30-60 s and nothing said why).
 *
 * For a normal user the flag is absent, so nothing is defined and nothing is logged: the hook has
 * no effect on the app. The flag is read once, when the hook is installed (`app/Providers.tsx`, at
 * module load), so it must be set before the app's script runs.
 */
import type { QueryClient } from "@tanstack/react-query";
import { logAction } from "./requestLog";

/** The `localStorage` key and value that switch the hook on. */
export const E2E_FLAG_KEY = "__vsbE2E";
export const E2E_FLAG_ON = "1";

/** The selector for an element that means "the app is still busy". */
export const BUSY_SELECTOR = '[data-vsb-busy="true"]';

/** What `__vsbBusy()` reports: counts, and the first key part of each fetching query (a label, never an id or a value). */
export interface BusyReport { fetching: number; mutating: number; overlay: boolean; queries: string[] }

declare global {
  interface Window {
    /** Defined only in an E2E run (`__vsbE2E = "1"`): true when the app has nothing in flight. */
    __vsbIdle?: () => boolean;
    /** Defined only in an E2E run: what keeps the app busy, for the harness's timeout message. */
    __vsbBusy?: () => BusyReport;
  }
}

/** A query key's first part when it is a string label (e.g. "environmentVariables"), else "?". Ids are never returned. */
export function queryLabel(key: readonly unknown[]): string {
  const first = key[0];
  return typeof first === "string" && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(first) ? first : "?";
}

/** True when the E2E flag is set. Storage can throw (private window, blocked site data): then false. */
function flagIsSet(win: Window): boolean {
  try {
    return win.localStorage.getItem(E2E_FLAG_KEY) === E2E_FLAG_ON;
  } catch {
    return false;
  }
}

const noop = (): void => undefined;

/**
 * Installs `window.__vsbIdle` when the E2E flag is set; otherwise does nothing.
 * Returns an uninstall function (a no-op when nothing was installed).
 *
 * `win` defaults to the global `window` when there is one, so importing the app in a node test
 * environment does not throw.
 */
export function installE2EHook(
  client: QueryClient,
  win: Window | undefined = typeof window !== "undefined" ? window : undefined,
): () => void {
  if (!win || !flagIsSet(win)) return noop;

  const idle = (): boolean =>
    client.isFetching() === 0 && client.isMutating() === 0 && !win.document.querySelector(BUSY_SELECTOR);
  const busy = (): BusyReport => ({
    fetching: client.isFetching(),
    mutating: client.isMutating(),
    overlay: !!win.document.querySelector(BUSY_SELECTOR),
    queries: client.getQueryCache().findAll({ fetchStatus: "fetching" }).map((q) => queryLabel(q.queryKey)),
  });
  win.__vsbIdle = idle;
  win.__vsbBusy = busy;
  logAction("e2e hook enabled");

  return () => {
    // Only remove our own functions, not ones a later install put in their place.
    if (win.__vsbIdle === idle) delete win.__vsbIdle;
    if (win.__vsbBusy === busy) delete win.__vsbBusy;
  };
}
