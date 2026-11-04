/**
 * The parity harness: waiting for an app to be idle (D80, plan section 2).
 *
 * The old `waitForStable` polled the whole page's text until it stopped changing, 700 ms a poll: the biggest single loss of
 * time in the old suite. `settle` asks the app instead:
 *
 *   code app: `window.__vsbIdle()` (no query or mutation in flight, no overlay). The app exposes it only when localStorage
 *             `__vsbE2E` is "1", which `enableCodeHook` sets on the app's own origin before any of its scripts run. Polled
 *             every 100 ms; idle on two reads in a row. When the hook is missing (an older build), it warns once and falls
 *             back to `waitForStable`.
 *   canvas  : the player has no such hook, so the busy indicators and busy messages are watched (`busyNow` in `lib/appFrame.ts`,
 *             the same rule `waitForStable` uses, without its text-node walk). Polled every 150 ms; clean on two reads in a row.
 *
 * Either way `until` (when given) must be visible too, and the wait throws after `timeoutMs` (default 30 s) naming the app
 * and what was still busy.
 */
import type { BrowserContext, Locator } from "@playwright/test";
import { busyNow, waitForStable } from "../lib/appFrame";
import type { AppHandle } from "./contract";

/** The code app's origin as `pac code run` serves it (`power.config.json` localAppUrl). */
const CODE_ORIGIN = "http://localhost:3000";

/**
 * Turns on the code app's test hook for every page of `context`: on the app's origin only (the play page and the Canvas
 * player never see the flag), localStorage `__vsbE2E` = "1" before the app's scripts run. Call before the first navigation.
 */
export async function enableCodeHook(context: BrowserContext): Promise<void> {
  await context.addInitScript((origin) => {
    if (location.origin !== origin) return;
    try {
      localStorage.setItem("__vsbE2E", "1");
    } catch {
      // Storage blocked (a sandboxed frame): the app then has no hook and settle falls back.
    }
  }, CODE_ORIGIN);
}

export interface SettleOptions {
  /** A locator that must also be visible (the target control of the step). */
  until?: Locator;
  timeoutMs?: number;
}

let warnedMissingHook = false;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const visible = async (l?: Locator): Promise<boolean> => (l ? l.isVisible().catch(() => false) : true);

/** "idle" | "busy" | "missing" (the app has no hook) | "unreadable" (the frame is navigating or gone). */
type HookRead = "idle" | "busy" | "missing" | "unreadable";

async function readHook(app: Pick<AppHandle, "frame">): Promise<HookRead> {
  return app.frame.locator("body").evaluate(() => {
    const f = (window as unknown as { __vsbIdle?: () => boolean }).__vsbIdle;
    if (typeof f !== "function") return "missing" as const;
    return f() ? ("idle" as const) : ("busy" as const);
  }).catch(() => "unreadable" as const);
}

/** Waits until the app is idle (see the file header). Throws after `timeoutMs` naming the app and what was still busy. */
export async function settle(app: Pick<AppHandle, "kind" | "page" | "frame">, opts: SettleOptions = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  let clean = 0;
  let missing = 0;
  let still = "nothing read yet";

  while (Date.now() < deadline) {
    if (app.kind === "code") {
      const r = await readHook(app);
      // The hook is defined at module start; "missing" on three reads in a row (about 300 ms) means this build has none,
      // not that the app is still booting.
      missing = r === "missing" ? missing + 1 : 0;
      if (missing >= 3) {
        if (!warnedMissingHook) {
          warnedMissingHook = true;
          console.warn("[harness] __vsbIdle missing, falling back");
        }
        await waitForStable(app.page, app.frame, { pollMs: 300, timeoutMs: Math.max(1000, deadline - Date.now()) });
        if (opts.until) await opts.until.waitFor({ state: "visible", timeout: Math.max(1000, deadline - Date.now()) });
        return;
      }
      still = r === "idle" ? "" : r === "busy" ? "__vsbIdle() is false (a query, mutation or overlay)" : `hook ${r}`;
    } else {
      const busy = await busyNow(app.frame).catch(() => "frame unreadable");
      still = busy ?? "";
    }
    if (!still && !(await visible(opts.until))) still = `target not visible (${String(opts.until)})`;

    clean = still ? 0 : clean + 1;
    if (clean >= 2) return;
    await sleep(app.kind === "code" ? 100 : 150);
  }
  // The code app names what keeps it busy (`window.__vsbBusy`, labels and counts only), so a timeout says which query hung.
  const detail = app.kind === "code"
    ? await app.frame.locator("body").evaluate(() => {
      const f = (window as unknown as { __vsbBusy?: () => unknown }).__vsbBusy;
      return typeof f === "function" ? JSON.stringify(f()) : "";
    }).catch(() => "")
    : "";
  throw new Error(`settle(${app.kind}): still busy after ${timeoutMs} ms: ${still}${detail ? ` ${detail}` : ""}`);
}
