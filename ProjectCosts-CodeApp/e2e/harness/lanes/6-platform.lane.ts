/**
 * Generic lane, platform layer (D80): `landlease.codeapp.spec.ts` E2E-LANDLEASE-001…006 made screen-agnostic, for
 * `PARITY_SCREEN`. Read-only. Code app tests carry `@smoke` too (the smoke tier runs exactly these, `runPlan.mjs`).
 *
 * Code app (default lane code-A):
 *   load        a reload with no console error, failed call or HTTP error >= 400 (the host's own errors excepted, as
 *               `lib/ui.ts` watchProblems lists them), on the screen's route
 *   vsb-log     the `[VSB] ACTION Load` and `[VSB] DATA read` lines of that load, the `[VSB] HTTP GET` line POLLED up to
 *               30 s (it arrives late, CA-28), and no GUID outside an HTTP line (CONVENTIONS rule 23)
 *   labels      every visible control at rest has an aria-label and a data-testid (rule 16; every visual state is
 *               checked by the visual lane)
 *   labels-open the same in the manifest's smoke state (`smokeState`, else the first visual state; Land Lease: one card
 *               open, as E2E-LANDLEASE-003), then reset: so the smoke tier, which runs only these `@smoke` tests, keeps
 *               the old 001–006 set
 *   ids         test ids built from a display value: RECORDED as a fact, not failed (rule 16 review list)
 *   refresh     a browser refresh lands on the same route and project where a launch parameter carries the screen
 *               (`openers.ts` refreshKeepsScreen); elsewhere the result is recorded and the screen reopened
 *   zoom        at 75 %, 100 % and 125 % no sideways page scroll and the rest marker still shows
 * Canvas (default lane canvas-A):
 *   refresh     recorded only (the player restarts the app on its start screen); the screen is reopened after
 *
 * The describe runs in default mode, not serial: these checks are independent, and one failing must not skip the rest.
 * This file runs LAST in its lane (`screens.ts` LANE_LAYER_ORDER); each test still leaves the screen reloaded or reset and
 * at 100 % zoom, so a screen's own lane file that runs after it starts from a usable screen.
 */
import { expect } from "@playwright/test";
import type { AppHandle } from "../contract";
import { pressSignIn } from "../../lib/parity";
import { collectTexts } from "../../lib/texts";
import { watchProblems } from "../../lib/ui";
import { isProjectScoped, refreshKeepsScreen } from "../openers";
import { codeRoute, displayValueTestIds, locate, routePath, unlabelledControls } from "../readers";
import { laneFor, smokeStateOf } from "../screens";
import { settle } from "../waits";
import { collectManifest, KINDS, kindSkip, laneCase, laneDescribe } from "./common";

const manifest = await collectManifest();
const open = manifest.open;
const expectedRoute = open.app === "custom" ? null : routePath(open.codeRoute);
const smokeState = smokeStateOf(manifest);

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ACTION_LOAD = /^\[VSB\] ACTION Load .*: \d+ ms, \d+ requests?, .*\[a\d+\]$/;

/** The `[VSB]` console lines of a page since its first use here (one listener per page). */
const vsbLines = new WeakMap<object, string[]>();
function vsbLog(app: AppHandle): string[] {
  let lines = vsbLines.get(app.page);
  if (!lines) {
    const list: string[] = [];
    app.page.on("console", (m) => { if (m.text().startsWith("[VSB] ")) list.push(m.text()); });
    vsbLines.set(app.page, list);
    lines = list;
  }
  return lines;
}
/** Whether this worker's page has had a reload watched by `vsbLog` (the load check does it; a fresh worker has not). */
const watchedLoad = new WeakSet<object>();

/** Where the code app is: its route (no query) and the project title in its header (null on a screen without one). */
async function whereCode(app: AppHandle): Promise<{ route: string; title: string | null }> {
  const t = app.frame.locator(".canvas-project-title").first();
  const title = (await t.count()) ? (await t.innerText()).trim() : null;
  return { route: routePath(codeRoute(app.page)), title };
}

/** After `page.reload()`: wait until the app is back (pressing the player's "Sign in" if it asks), then settle. */
async function backAfterRefresh(app: AppHandle): Promise<void> {
  const ready = app.kind === "code"
    ? () => app.frame.getByTestId("header-user").isVisible().catch(() => false)
    : async () => (await app.frame.locator("[data-control-name]").count().catch(() => 0)) > 20;
  for (let i = 0; i < 30 && !(await ready()); i++) {
    await pressSignIn(app.page);
    await app.page.waitForTimeout(3000);
  }
  // 90 s, as a first open (`session.ts` FIRST_SETTLE_MS): a refresh reloads everything (live run 14: over 60 s once).
  await settle(app, { timeoutMs: 90_000 });
}

/** Something that shows only when the screen is there: the rest marker, else the first command, else any text. */
async function screenShows(app: AppHandle): Promise<boolean> {
  const ref = manifest.controls.restMarker ?? Object.values(manifest.controls.commands ?? {})[0];
  if (ref) return locate(app, ref).isVisible().catch(() => false);
  return (await collectTexts(app.frame, manifest.textWindow)).length > 0;
}

/** Why the smoke state's labels check does not run, or null. */
function smokeStateSkip(): string | null {
  if (!smokeState) return "the manifest has no visual state to open";
  if (smokeState.needsEnv && !process.env[smokeState.needsEnv]?.trim()) return `${smokeState.needsEnv} is not set (smoke state "${smokeState.name}")`;
  return null;
}

for (const kind of KINDS) {
  const lane = laneFor(manifest, "platform", kind);
  const tags = kind === "code" ? `@smoke @${lane}` : `@${lane}`;
  laneDescribe(manifest, "platform", kind, () => {
    if (kind === "code") {
      const c1 = laneCase(kind, `platform: the screen loads with no console errors, failed calls or HTTP errors ${tags}`, kindSkip(kind));
      c1.declare(...c1.args, c1.body(async ({ app, record }) => {
        vsbLog(app);
        const seen = watchProblems(app.page);
        await app.reload();
        watchedLoad.add(app.page);
        const route = routePath(codeRoute(app.page));
        record("platform", "load", { route, errors: seen.errors, failed: seen.failed, bad: seen.bad, hostOnly: seen.benign });
        if (expectedRoute) expect(route, "the code app's route").toBe(expectedRoute);
        expect(seen.errors, "console errors").toEqual([]);
        expect(seen.failed, "failed requests").toEqual([]);
        expect(seen.bad, "HTTP responses of 400 or more").toEqual([]);
      }));

      const c2 = laneCase(kind, `platform: the [VSB] request log records the load (CONVENTIONS rule 23) ${tags}`, kindSkip(kind));
      c2.declare(...c2.args, c2.body(async ({ app, record }) => {
        const lines = vsbLog(app);
        // A fresh worker (after a failure) has not watched a load yet: reload once with the listener on.
        if (!watchedLoad.has(app.page)) { await app.reload(); watchedLoad.add(app.page); }
        await expect.poll(() => lines.filter((l) => ACTION_LOAD.test(l)).length, { message: "an ACTION Load line", timeout: 15_000 }).toBeGreaterThan(0);
        // The host pushes the SDK's networkRequest metrics in batches, after the load's ACTION line (CA-28).
        const http = await expect.poll(() => lines.some((l) => l.startsWith("[VSB] HTTP GET ")), { message: "an HTTP GET line", timeout: 30_000 })
          .toBe(true).then(() => true, () => false);
        // Counts and names only: no record id in a DATA or ACTION line (a URL's $filter may carry the project id).
        const idsOutsideHttp = lines.filter((l) => !l.startsWith("[VSB] HTTP ") && GUID.test(l)).map((l) => l.replace(GUID, "<guid>").slice(0, 200));
        const data = lines.filter((l) => l.startsWith("[VSB] DATA read ")).length;
        record("platform", "vsb-log", { action: lines.filter((l) => ACTION_LOAD.test(l)).length, data, http, idsOutsideHttp });
        expect(data, "a [VSB] DATA read line").toBeGreaterThan(0);
        expect(http, "a [VSB] HTTP GET line within 30 s").toBe(true);
        expect(idsOutsideHttp, "ids outside HTTP lines").toEqual([]);
      }));

      const c3 = laneCase(kind, `platform: every visible control at rest has an aria-label and a data-testid (rule 16) ${tags}`, kindSkip(kind));
      c3.declare(...c3.args, c3.body(async ({ app, record }) => {
        await app.reset();
        const missing = await unlabelledControls(app.frame);
        record("platform", "labels-at-rest", missing);
        expect(missing).toEqual([]);
      }));

      const c3b = laneCase(kind, `platform: every visible control has an aria-label and a data-testid in the state "${smokeState?.name ?? "-"}" (rule 16) ${tags}`,
        kindSkip(kind) ?? smokeStateSkip());
      c3b.declare(...c3b.args, c3b.body(async ({ app, record }) => {
        const state = smokeState!;
        await app.reset();
        let missing: string[];
        try {
          await state.steps(app);
          await settle(app);
          missing = await unlabelledControls(app.frame);
        } finally {
          await app.reset();
        }
        record("platform", `labels-smoke-${state.name}`, missing);
        expect(missing, `controls without aria-label or data-testid in "${state.name}"`).toEqual([]);
      }));

      const c4 = laneCase(kind, `platform: test ids built from a display value are recorded (rule 16) ${tags}`, kindSkip(kind));
      c4.declare(...c4.args, c4.body(async ({ app, record }) => {
        await app.reset();
        const ids = await displayValueTestIds(app.frame);
        record("platform", "display-value-test-ids", ids);
        if (ids.length) console.log(`[harness] ${manifest.slug}: ${ids.length} test id(s) look built from a display value: ${ids.slice(0, 10).join(", ")}`);
      }));

      const c5 = laneCase(kind, `platform: a browser refresh keeps the screen and the project where a deep link carries it ${tags}`, kindSkip(kind));
      c5.declare(...c5.args, c5.body(async ({ app, record }) => {
        await app.reset();
        const keeps = refreshKeepsScreen(open);
        const before = await whereCode(app);
        await app.page.reload();
        await backAfterRefresh(app);
        const after = await whereCode(app);
        record("platform", "refresh", { keeps, before, after });
        if (!keeps) {
          await app.reload();
          return;
        }
        expect(before.route, "route before the refresh").toBe(expectedRoute ?? before.route);
        // E2E-LANDLEASE-005: a project-scoped screen shows its project's title (not just the same empty header twice).
        if (isProjectScoped(manifest)) expect(before.title, "the project title in the header").toBeTruthy();
        expect(after, "route and project title after a browser refresh").toEqual(before);
      }));

      const c6 = laneCase(kind, `platform: at 75 %, 100 % and 125 % zoom the screen fits and still shows ${tags}`, kindSkip(kind));
      c6.declare(...c6.args, c6.body(async ({ app, record }) => {
        await app.reset();
        const results: { zoom: string; sideways: boolean; shows: boolean }[] = [];
        const html = app.frame.locator("html");
        try {
          for (const zoom of ["0.75", "1", "1.25"]) {
            await html.evaluate((h, z) => { (h as HTMLElement).style.zoom = z; }, zoom);
            await settle(app);
            results.push({ zoom, sideways: await html.evaluate((h) => h.scrollWidth > h.clientWidth + 1), shows: await screenShows(app) });
          }
        } finally {
          await html.evaluate((h) => { (h as HTMLElement).style.zoom = ""; }).catch(() => {});
        }
        record("platform", "zoom", results);
        expect(results.filter((r) => r.sideways || !r.shows), "zoom levels with a sideways scroll or the screen gone").toEqual([]);
      }));
    } else {
      const c7 = laneCase(kind, `platform: a browser refresh of the Canvas (recorded) ${tags}`, kindSkip(kind));
      c7.declare(...c7.args, c7.body(async ({ app, record }) => {
        await app.reset();
        const before = { shows: await screenShows(app) };
        await app.page.reload();
        await backAfterRefresh(app);
        const after = { shows: await screenShows(app), controls: await app.frame.locator("[data-control-name]").count().catch(() => 0) };
        // Its own key: the code app's `refresh` fact has another shape and meaning (a launch parameter keeps the screen),
        // so the two are never compared with each other (`compare.ts`: a one-app platform fact is evidence only).
        record("platform", "canvas-refresh", { before, after });
        await app.reload();
      }));
    }
  }, "default");
}
