/**
 * The parity harness: opening any screen in either app from its manifest's `open` (D80, plan section 5a).
 *
 *   cost    canvas: the Cost canvas app with `&projectId=`, then the left menu (`lib/appFrame.ts` openCanvasCost)
 *           code  : the play URL with `costScreen` + `projectId`, the Edit Costs deep link (`lib/appFrame.ts` openCodeCost)
 *   pm      canvas: the Project Management canvas app with `&projectid=` (its App Loading Screen reads
 *                   `Param("projectid")` and lands on General Data), then the screen's left-menu item; for General Data
 *                   itself, a wait until that screen shows (`PM_GENERAL_MARKER`), as the other screens wait for their item
 *           code  : the play URL with `pmScreen=/project/general` + `projectId`, the Edit Project deep link
 *                   (`src/app/deepLinks.ts` projectAppUrl; `Landing` accepts only `/project/general` there, CONVENTIONS
 *                   rule 12), then an in-app hash navigation to `codeRoute?projectId=` (the app uses a hash router)
 *   admin   both  : `lib/parity.ts` openCanvas / openCode, then openSettingsScreen(leftMenuLabel)
 *   custom  the manifest's own `open.open(kind, page, projectId)`
 *
 * No screen code here: only the four app shapes. `projectId` is null for a screen without a project.
 */
import type { FrameLocator, Page } from "@playwright/test";
import type { Kind, OpenSpec, ScreenManifest } from "./contract";
import { opensWithProject } from "./env";
import { openCanvasCost, openCodeCost } from "../lib/appFrame";
import { openCanvas, openCode, openSettingsScreen } from "../lib/parity";
import { locate } from "./readers";

/**
 * The Project Management canvas app's left menu: screen name -> menu caption (`App.pa.yaml`, `LeftNavigationMenu`,
 * `TargetScreen` -> `ItemDisplayName`, canvas source 1.21.709). A manifest's `canvasScreen` may be either.
 */
export const PM_CANVAS_MENU: Readonly<Record<string, string>> = {
  "Project General Data Screen": "General",
  "Project General Milestones Screen": "Milestones",
  "Project Generators Screen": "Generator",
  "Project Production Screen": "Production",
  "Project General CheckList Screen": "Cluster Check List",
  "Project General Team Screen": "Project Team",
  "Project Planning Screen": "Planning",
  "Grid Operator Screen": "Grid Operator",
  "Project Revenues Screen": "Revenue",
  "Project Finance Screen": "Financing",
};

/** The screen a PM deep link lands on in each app: the canvas's General Data, the code app's `/project/general`. */
export const PM_LANDING = { canvasLabel: "General", codeRoute: "/project/general" } as const;

/**
 * A control that shows only once the canvas is ON General Data: the screen's outer container
 * (`Project General Data Screen.pa.yaml` line 890, `con_GeneralData_DisplayProject`, App.Width x App.Height, no `Visible`).
 * The App Loading Screen shows the header badge too, so the badge alone does not say the app has moved on.
 */
export const PM_GENERAL_MARKER = "con_GeneralData_DisplayProject";
/** The PM canvas can take a while to leave its App Loading Screen (it reads the project and the user's roles). */
const PM_LANDING_TIMEOUT_MS = 120_000;

/** The left-menu caption for a PM `canvasScreen` (a screen name from `PM_CANVAS_MENU`, or already a caption). */
export function pmMenuLabel(canvasScreen: string): string {
  return PM_CANVAS_MENU[canvasScreen] ?? canvasScreen;
}

/** The code app's hash for a project-scoped PM route: `#/project/<screen>?projectId=<id>`. */
export function pmCodeHash(codeRoute: string, projectId: string): string {
  return `#${codeRoute}?${new URLSearchParams({ projectId })}`;
}

/**
 * Whether a browser refresh of the code app lands on the same screen: the player strips the fragment, so only a launch
 * parameter survives it. `cost` (costScreen) does; `pm` only for `/project/general` (`Landing` accepts no other pmScreen);
 * `admin` and `custom` land on the project list (the Canvas, too, starts on its start screen).
 */
export function refreshKeepsScreen(open: OpenSpec): boolean {
  if (open.app === "cost") return true;
  if (open.app === "pm") return open.codeRoute === PM_LANDING.codeRoute;
  return false;
}

/** Whether the screen needs a project (`cost`, `pm`; `custom` says so itself). The same answer as `env.ts` `opensWithProject`. */
export function isProjectScoped(manifest: Pick<ScreenManifest, "open">): boolean {
  return opensWithProject(manifest.open);
}

const needProject = (manifest: Pick<ScreenManifest, "slug">, projectId: string | null): string => {
  if (!projectId) throw new Error(`Screen "${manifest.slug}" is project-scoped but no project id was given`);
  return projectId;
};

async function openPm(kind: Kind, page: Page, open: Extract<OpenSpec, { app: "pm" }>, projectId: string): Promise<FrameLocator> {
  if (kind === "canvas") {
    const app = await openCanvas(page, { projectid: projectId });
    const label = pmMenuLabel(open.canvasScreen);
    // Wait until the loading screen has handed over to General Data: every PM screen is reached from there.
    await app.locator(`[data-control-name='${PM_GENERAL_MARKER}']`).first().waitFor({ state: "visible", timeout: PM_LANDING_TIMEOUT_MS });
    if (label !== PM_LANDING.canvasLabel) {
      // Scoped to the left menu, as `openSettingsScreen` does: other controls carry the same words.
      const item = app.locator("[data-control-name=pcf_Left_Navigation_Menu]").first().getByText(label, { exact: true }).first();
      await item.waitFor({ state: "visible", timeout: 60_000 });
      await item.click();
    }
    return app;
  }
  const app = await openCode(page, { pmScreen: PM_LANDING.codeRoute, projectId });
  if (open.codeRoute !== PM_LANDING.codeRoute) {
    await app.locator("body").evaluate((_b, hash) => { window.location.hash = hash; }, pmCodeHash(open.codeRoute, projectId));
  }
  return app;
}

/**
 * Opens the manifest's screen in one app on `page` and returns the app's frame. The caller (`session.ts`) settles it.
 * Throws when a project-scoped screen gets no project id.
 */
export async function openScreen(kind: Kind, page: Page, manifest: Pick<ScreenManifest, "slug" | "open">, projectId: string | null): Promise<FrameLocator> {
  const open = manifest.open;
  switch (open.app) {
    case "cost": {
      const id = needProject(manifest, projectId);
      return kind === "canvas" ? openCanvasCost(page, id, open.canvasMenu) : openCodeCost(page, id, open.codeRoute);
    }
    case "pm":
      return openPm(kind, page, open, needProject(manifest, projectId));
    case "admin": {
      const app = kind === "canvas" ? await openCanvas(page) : await openCode(page);
      await openSettingsScreen(kind, app, open.leftMenuLabel);
      return app;
    }
    case "custom":
      return open.open(kind, page, open.projectScoped ? needProject(manifest, projectId) : null);
  }
}

/** How long a freshly opened screen gets to show its rest marker (the Canvas player is the slower of the two). */
export const READY_TIMEOUT_MS: Record<Kind, number> = { canvas: 120_000, code: 90_000 };
/** How many times `openScreenReady` opens a screen before it gives up. */
export const OPEN_ATTEMPTS = 3;

/**
 * `openScreen`, then wait until the screen is REALLY there: its `controls.restMarker` is visible. Without this a lane
 * recorded the Canvas's start screen (CAPEX) as Land Lease's "default" state, and a code-app page looked idle before its
 * queries had even started (live run 3 Nov 2026). One retry: the first open of five sessions at once can time out.
 * A screen without a rest marker gets no extra wait (the caller settles it).
 */
export async function openScreenReady(
  kind: Kind, page: Page, manifest: Pick<ScreenManifest, "slug" | "open" | "controls">, projectId: string | null,
): Promise<FrameLocator> {
  // Three opens: the Power Apps player itself is sometimes slow to serve either app (runs 11, 14, 15 on 4 Nov 2026: a
  // Canvas stuck on "Fetching your app", a code app whose header did not show within 75 s, twice in a row).
  let last: unknown;
  for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
    if (page.isClosed()) break;
    try {
      const frame = await openScreen(kind, page, manifest, projectId);
      const marker = manifest.controls.restMarker;
      if (marker) await locate({ kind, frame }, marker).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS[kind] });
      return frame;
    } catch (e) {
      last = e;
      if (attempt < OPEN_ATTEMPTS) console.warn(`[harness] ${manifest.slug} ${kind}: the screen was not ready (${String(e).split("\n")[0]}); opening it again`);
    }
  }
  throw new Error(`${manifest.slug}: ${kind === "canvas" ? "the Canvas" : "the code app"} did not show the screen's rest marker after ${OPEN_ATTEMPTS} opens: ${String(last).split("\n")[0]}`);
}
