/**
 * One locator vocabulary for both apps (E2E-PARITY-PROMPT.md section 3).
 *
 * The code app runs in an iframe on the play page, so both apps are reached through a frame locator.
 * In the code app every control has `data-testid` = the canvas control name (CONVENTIONS rule 16).
 * The canvas player renders the same control as an element with `data-control-name`, inside the
 * player's iframe. So a scenario says `byControl(app, "btn_Edit_AdminContracts")` once.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";

export type Target = "codeapp" | "canvas";

/** The surface that holds the app: the page itself (code app) or the canvas player's frame. */
export interface AppSurface {
  target: Target;
  page: Page;
  root: Page | FrameLocator;
}

export function surface(page: Page, target: Target): AppSurface {
  if (target === "canvas") {
    return { target, page, root: page.frameLocator("iframe[name='fullscreen-app-host'], iframe#fullscreen-app-host") };
  }
  // The play page hosts the app in an iframe whose src is the local dev server (`_localAppUrl`).
  return { target, page, root: page.frameLocator("iframe[src*='localhost:3000']") };
}

/** A control by its canvas name; `suffix` is the row id the code app appends on repeating rows. */
export function byControl(app: AppSurface, name: string, suffix?: string): Locator {
  if (app.target === "canvas") return app.root.locator(`[data-control-name="${name}"]`).first();
  return app.root.getByTestId(suffix ? `${name}-${suffix}` : name);
}

/** The canvas player is slow to paint: wait until the app frame has controls and no spinner. */
export async function waitForReady(app: AppSurface): Promise<void> {
  if (app.target === "canvas") {
    await app.root.locator("[data-control-name]").first().waitFor({ state: "visible", timeout: 90_000 });
    return;
  }
  // The landing page (Project Overview) has no left rail by design, so wait for the header's user menu.
  // The player may first stop at "Sign in required" (the session is already saved); press its button.
  const ready = app.root.getByTestId("header-user");
  for (let i = 0; i < 15 && !(await ready.isVisible().catch(() => false)); i++) {
    for (const frame of app.page.frames()) {
      const signIn = frame.getByRole("button", { name: "Sign in", exact: true });
      if (await signIn.count().catch(() => 0)) await signIn.first().click({ timeout: 2000 }).catch(() => {});
    }
    await app.page.waitForTimeout(3000);
  }
  await ready.waitFor({ state: "visible", timeout: 30_000 });
}

/** Console messages that are not defects of the app, each with its reason. */
const BENIGN_CONSOLE = [
  // Fluent UI's keyboard helper logs this in development under React StrictMode's double mount; it does not occur in a build.
  /Keyborg instance .* is being disposed incorrectly/,
  // The generic text of a failed load; the URL of the failing response is collected separately (`bad`).
  /^Failed to load resource: the server responded with a status of/,
  // The same for a network-level failure (no response at all); its URL is collected separately (`failed`).
  /^Failed to load resource: net::/,
];

/** Requests that fail at network level and belong to the Microsoft 365 player, not to the app (first seen 2 Nov 2026). */
const BENIGN_FAILED: { re: RegExp; why: string }[] = [
  { re: /^GET https:\/\/config\.fp\.measure\.office\.com\//, why: "the player's Office telemetry config; TLS name mismatch on this network" },
];

/**
 * HTTP errors that come from the Power Apps player / host, not from the app's own calls (first seen on the Land Lease run,
 * 2 Nov 2026). Each is matched narrowly by URL and kept in `benign` so it is still reported, just not as an app failure.
 */
const BENIGN_HTTP: { re: RegExp; why: string }[] = [
  { re: /^403 GET https:\/\/[^/]+\.environment\.api\.powerplatform\.com\/powerapps\/apps\/local\/permissions/, why: "player's permission check for a locally played app (pac code run)" },
  { re: /^404 GET https:\/\/graph\.microsoft\.com\/v1\.0\/users\/[^/]+\/photo\/\$value/, why: "the signed-in user has no profile photo" },
  { re: /^404 POST https:\/\/[^/]+\.environment\.api\.powerplatform\.com\/powerapps\/apis\/shared_sql\/connections\/[^/]+\/usages/, why: "host's connection-usage report for the Fabric SQL connection (D54), not an app read" },
];

/**
 * Console errors, failed requests and HTTP errors collected during a test (the smoke layer, section 4.1).
 * `errors` excludes the benign messages above; `bad` names every response of 400 or more with its URL, except the host's own
 * (`BENIGN_HTTP`), which go to `benign` with their reason.
 */
export function watchProblems(page: Page): { errors: string[]; failed: string[]; bad: string[]; benign: string[] } {
  const seen = { errors: [] as string[], failed: [] as string[], bad: [] as string[], benign: [] as string[] };
  page.on("console", (m) => {
    if (m.type() === "error" && !BENIGN_CONSOLE.some((re) => re.test(m.text()))) seen.errors.push(m.text());
  });
  page.on("requestfailed", (r) => {
    const line = `${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`;
    const host = BENIGN_FAILED.find((b) => b.re.test(line));
    if (host) seen.benign.push(`${line.slice(0, 140)} (${host.why})`); else seen.failed.push(line);
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const line = `${r.status()} ${r.request().method()} ${r.url()}`;
    const host = BENIGN_HTTP.find((b) => b.re.test(line));
    if (host) seen.benign.push(`${line.slice(0, 140)} (${host.why})`); else seen.bad.push(line);
  });
  return seen;
}
