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
];

/**
 * Console errors, failed requests and HTTP errors collected during a test (the smoke layer, section 4.1).
 * `errors` excludes the benign messages above; `bad` names every response of 400 or more with its URL.
 */
export function watchProblems(page: Page): { errors: string[]; failed: string[]; bad: string[] } {
  const seen = { errors: [] as string[], failed: [] as string[], bad: [] as string[] };
  page.on("console", (m) => {
    if (m.type() === "error" && !BENIGN_CONSOLE.some((re) => re.test(m.text()))) seen.errors.push(m.text());
  });
  page.on("requestfailed", (r) => seen.failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) seen.bad.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  return seen;
}
