/**
 * The parity harness for Application Settings screens (E2E-PARITY-PROMPT.md, section 5).
 *
 * Both apps name every control the same way (the code app uses the Canvas control name as `data-testid`, CONVENTIONS rule 16), so one
 * fact list per app can be diffed control by control: text, text style, size, and which controls exist at all.
 *
 *   canvas  : `[data-control-name]`           (inside the player's iframe)
 *   code app: `[data-testid]`                  (inside the play page's iframe); a repeated row appends `-<id>` to the canvas name
 *
 * Canvas runs first; the code app is compared with what the Canvas run found (standing order, 29 Oct 2026).
 */
import { expect, type FrameLocator, type Locator, type Page, test } from "@playwright/test";

export const CANVAS_FRAME = "iframe[name='fullscreen-app-host'], iframe#fullscreen-app-host";
export const CODE_FRAME = "iframe[src*='localhost:3000']";
// From the environment like the other projects (`playwright.config.ts`); the defaults are the VSBCloud_Dev apps.
export const CANVAS_PM_URL = process.env.CANVAS_URL ?? "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/67054ad6-e70b-4738-a3e6-125384fe2b4b?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1";
export const CODE_URL = process.env.CODEAPP_URL ?? "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local?_localAppUrl=http://localhost:3000&_localConnectionUrl=http://localhost:8080";

export interface Fact {
  name: string;
  /** 0-based position among controls with the same name. */
  i: number;
  x: number; y: number; w: number; h: number;
  text: string;
  fontSize: string | null; fontWeight: string | null; color: string | null; background: string | null;
}

export interface Diff { name: string; property: string; canvas: unknown; code: unknown }

/** Presses the player's "Sign in" button wherever it shows (the session is there; the player still asks). Also used by the harness preflight. */
export async function pressSignIn(page: Page): Promise<void> {
  for (const f of page.frames()) {
    const b = f.getByRole("button", { name: "Sign in", exact: true });
    if (await b.count().catch(() => 0)) await b.first().click({ timeout: 2000 }).catch(() => {});
  }
}

/** `base` with `params` set as query parameters (launch parameters for the player). */
export function withParams(base: string, params: Record<string, string> = {}): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Opens the Canvas Project Management app and waits until its controls are on screen. `params` are launch parameters
 * (`projectid` opens a project on General Data, as the App Loading Screen's `Param("projectid")` reads it).
 */
export async function openCanvas(page: Page, params?: Record<string, string>): Promise<FrameLocator> {
  await page.goto(withParams(CANVAS_PM_URL, params));
  const app = page.frameLocator(CANVAS_FRAME);
  for (let i = 0; i < 45; i++) {
    if ((await app.locator("[data-control-name]").count().catch(() => 0)) > 20) break;
    await pressSignIn(page);
    await page.waitForTimeout(4000);
  }
  await expect(app.locator("[data-control-name='cml_Main_User_Badge']").first()).toBeVisible({ timeout: 60_000 });
  return app;
}

/**
 * Opens the code app (local build through `pac code run`) and waits for its header. `params` are launch parameters
 * (`pmScreen` + `projectId` is the Edit Project deep link, `src/app/deepLinks.ts` `projectAppUrl`).
 */
export async function openCode(page: Page, params?: Record<string, string>): Promise<FrameLocator> {
  await page.goto(withParams(CODE_URL, params));
  const app = page.frameLocator(CODE_FRAME);
  for (let i = 0; i < 15 && !(await app.getByTestId("header-user").isVisible().catch(() => false)); i++) {
    await pressSignIn(page);
    await page.waitForTimeout(3000);
  }
  await app.getByTestId("header-user").waitFor({ state: "visible", timeout: 30_000 });
  return app;
}

/**
 * The item only the Application Settings left menu has (`App.pa.yaml` `LeftAdminNavigationMenu`, line 322). The project menu
 * (`LeftNavigationMenu`, line 157) is drawn by the same `pcf_Left_Navigation_Menu` control and shares captions with it
 * ("Milestones" at lines 173 and 387), so a menu counts as the settings menu only while it shows this item.
 */
export const SETTINGS_MENU_MARKER = "Check List Settings";

/**
 * Application Settings in each app: the user menu entry, then the left menu item. Every lookup is scoped to the menu that
 * holds `SETTINGS_MENU_MARKER`, so a project-menu item with the same caption is never clicked: on a project screen the
 * settings are opened first, and it throws, naming the label, when no settings menu shows after that.
 */
export async function openSettingsScreen(kind: "canvas" | "code", app: FrameLocator, leftMenuLabel: string): Promise<void> {
  const marker = (scope: FrameLocator | Locator) => scope.getByText(SETTINGS_MENU_MARKER, { exact: true });
  if (kind === "canvas") {
    // Scoped to the left menu (other controls on the screens carry the same words, "Costs", "Contracts"), and to the one
    // that is the settings menu (the project menu has "Milestones" and "General" too). A `has` locator must come from the
    // same frame locator (Playwright drops the shared frame part and matches it inside the menu).
    const menu = app.locator("[data-control-name=pcf_Left_Navigation_Menu]").filter({ has: marker(app) }).first();
    if (!(await marker(menu).first().isVisible().catch(() => false))) {
      await app.locator("[data-control-name=cml_Main_User_Badge]").first().click();
      await app.getByRole("menuitem", { name: "Application Settings" }).click();
      await marker(menu).first().waitFor({ timeout: 60_000 }).catch(() => {
        throw new Error(`openSettingsScreen: no Application Settings menu (with "${SETTINGS_MENU_MARKER}") shows; not clicking "${leftMenuLabel}", which the project menu may also have`);
      });
    }
    await menu.getByText(leftMenuLabel, { exact: true }).first().click();
  } else {
    const nav = app.getByRole("navigation").filter({ has: marker(app) }).first();
    if (!(await marker(nav).first().isVisible().catch(() => false))) {
      await app.getByTestId("header-user").click();
      await app.getByTestId("header-user-app-settings").click();
    }
    await marker(nav).first().waitFor({ timeout: 30_000 }).catch(() => {
      throw new Error(`openSettingsScreen: no Application Settings navigation (with "${SETTINGS_MENU_MARKER}") shows; not clicking "${leftMenuLabel}", which the project menu may also have`);
    });
    if ((await nav.getByText(leftMenuLabel, { exact: true }).count()) === 0) await nav.getByText("Standard Assumptions", { exact: true }).click();
    await nav.getByText(leftMenuLabel, { exact: true }).click();
  }
}

/** Every visible named control of the current screen, with what can be compared. */
export async function collectFacts(app: FrameLocator, kind: "canvas" | "code"): Promise<Fact[]> {
  const attr = kind === "canvas" ? "data-control-name" : "data-testid";
  return app.locator(`[${attr}]`).evaluateAll((els, a) => {
    const seen = new Map<string, number>();
    const out: unknown[] = [];
    for (const e of els) {
      const name = e.getAttribute(a as string) ?? "";
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const i = seen.get(name) ?? 0;
      seen.set(name, i + 1);
      const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      const textEl = walker.nextNode()?.parentElement ?? null;
      const cs = textEl ? getComputedStyle(textEl) : null;
      const own = getComputedStyle(e);
      out.push({
        name, i, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        text: ((e as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        fontSize: cs?.fontSize ?? null, fontWeight: cs?.fontWeight ?? null, color: cs?.color ?? null,
        background: own.backgroundColor,
      });
    }
    return out;
  }, attr) as Promise<Fact[]>;
}

const LEAF = /^(lbl_|lb_|txt_|btn_|ico_|icn_|drp_|cmb_|tab_|chk_|tgl_|rad_|dte_|pcf_btn_|pcf_but_|img_|info_)/;
const isLeaf = (name: string): boolean => LEAF.test(name);

/** Controls of the code app that belong to canvas control `name`: the exact name, or `name-<row id>`. */
const codeMatches = (code: Fact[], name: string): Fact[] => code.filter((f) => f.name === name || f.name.startsWith(`${name}-`));

export interface CompareResult { diffs: Diff[]; missing: string[]; extra: string[]; compared: number }

/**
 * Canvas facts are the reference. A leaf control present in both is compared on text, text style and size; a Canvas control with no
 * code counterpart is `missing`; a code control whose canvas name does not exist is `extra` (new in the code app, to be explained).
 */
export function compareFacts(canvas: Fact[], code: Fact[], tolerance = 4): CompareResult {
  const diffs: Diff[] = [];
  const missing: string[] = [];
  let compared = 0;
  const names = [...new Set(canvas.map((f) => f.name))];
  const matchedCode = new Set<Fact>();
  for (const name of names) {
    const cv = canvas.filter((f) => f.name === name);
    const cd = codeMatches(code, name);
    cd.forEach((f) => matchedCode.add(f));
    if (cd.length === 0) { missing.push(name); continue; }
    if (!isLeaf(name)) continue;
    const pairs = Math.min(cv.length, cd.length, 3);
    for (let k = 0; k < pairs; k++) {
      const a = cv[k]!;
      const b = cd[k]!;
      compared++;
      const near = (x: number, y: number) => Math.abs(x - y) <= tolerance;
      const label = pairs > 1 || cv.length > 1 ? `${name}[${k}]` : name;
      if (a.text !== b.text && (a.text || b.text)) diffs.push({ name: label, property: "text", canvas: a.text, code: b.text });
      if (a.text && b.text) {
        if (a.fontSize !== b.fontSize) diffs.push({ name: label, property: "fontSize", canvas: a.fontSize, code: b.fontSize });
        if (a.fontWeight !== b.fontWeight) diffs.push({ name: label, property: "fontWeight", canvas: a.fontWeight, code: b.fontWeight });
      }
      if (!near(a.w, b.w)) diffs.push({ name: label, property: "width", canvas: a.w, code: b.w });
      if (!near(a.h, b.h)) diffs.push({ name: label, property: "height", canvas: a.h, code: b.h });
    }
    if (cv.length !== cd.length) diffs.push({ name, property: "count", canvas: cv.length, code: cd.length });
  }
  const canvasNames = new Set(names);
  const extra = [...new Set(code.filter((f) => !matchedCode.has(f)).map((f) => f.name.replace(/-[0-9a-f-]{8,}$/i, "")))]
    .filter((n) => ![...canvasNames].some((c) => n === c || n.startsWith(`${c}-`)));
  return { diffs, missing, extra, compared };
}

export async function shot(page: Page, path: string): Promise<void> {
  await page.screenshot({ path }).catch(() => {});
}

export { expect, test };
export type { Locator };
