import { isGuid, normalizeGuid, PROJECT_ID_KEYS } from "@/platform/powerClient";

export const COST_PATHS = [
  "/costs/capex", "/costs/opex/om", "/costs/land-lease",
  "/costs/opex/other", "/costs/contracts", "/costs/add-from-table",
] as const;
export type CostPath = (typeof COST_PATHS)[number];

export function costLocation(path: CostPath, projectId: string) {
  if (!isGuid(projectId)) throw new Error("Select a valid project before opening Costs.");
  return { pathname: path, search: `?${new URLSearchParams({ projectId: normalizeGuid(projectId) })}` };
}

/**
 * A link that opens THIS app in another browser tab, at one of its own routes.
 *
 * The hosted app runs in a frame. Open the SDK's player URL, carrying query parameters
 * for getContext(); a fragment alone on the outer player does not reach the hash router.
 * Locally the browser URL is the application itself, so the fragment works directly.
 *
 * This is the shape the canvas app's cross-app `Launch()` calls had, and the Project Main
 * screen still wants it for `Edit Project` and `Edit Costs` — the project list stays open in
 * its original tab, with its filter, page and selection intact, which is the whole point of
 * opening a second tab rather than navigating.
 */
export function appTabUrl(args: {
  currentUrl: string;
  appUrl?: string;
  /** An internal route, e.g. `/costs/capex` or `/projects/<id>/general`. */
  path: string;
  /** Set where the destination reads a project from the launch parameters. */
  projectId?: string;
}): string {
  const url = new URL(args.appUrl || args.currentUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The application link is not configured correctly.");
  }
  // Retain host parameters such as tenantId; discard old project IDs and list filters.
  const appKeys = new Set([...PROJECT_ID_KEYS, "costscreen", "pmscreen", "q", "sort", "dir", "p"]);
  for (const key of [...url.searchParams.keys()]) {
    if (appKeys.has(key.toLowerCase())) url.searchParams.delete(key);
  }

  let hashSearch = "";
  if (args.projectId) {
    const id = normalizeGuid(args.projectId);
    url.searchParams.set("projectId", id);
    hashSearch = `?${new URLSearchParams({ projectId: id })}`;
  }
  url.hash = `${args.path}${hashSearch}`;
  return url.toString();
}

const DEFAULT_LOCAL_CONNECTION_URL = "http://localhost:8080";

/**
 * Where `appTabUrl` should open a new tab when the SDK gave us no `ctx.app.appUrl`.
 *
 * `ctx.app.appUrl` is only populated for a PUSHED app — it is how `appTabUrl` targets the
 * hosted player instead of the raw iframe asset URL (see its own comment). Under `npm run dev`
 * + `pac code run`, this app is never "pushed"; it is proxied through the connection host on
 * `:8080` behind the player's `…/app/local?_localAppUrl=…&_localConnectionUrl=…` shape (see
 * `ProjectDocs/app-docs/03-STATUS.md`). Without this, a missing `appUrl` falls back to `window.location.href`,
 * which — because the dev server runs INSIDE that player's iframe — is just
 * `http://localhost:3000/…`. Opening that in a new tab reproduces the exact bug this exists to
 * avoid: a tab with no Power context, no user, no data (see `ProjectDocs/app-docs/03-STATUS.md`'s "Do not open
 * `http://localhost:3000` directly").
 *
 * `environmentId` comes from `ctx.app.environmentId`, which IS populated locally (the
 * connection host has to know which environment to proxy). The connection host's own port is
 * not discoverable from inside the app, so it defaults to the documented `:8080` and can be
 * overridden with `VITE_LOCAL_CONNECTION_URL` for a dev session started on a different port.
 * `appOrigin` is `window.location.origin`, read by the caller rather than here, so this stays
 * a pure function like everything else in this file.
 */
export function localPlayUrl(args: { environmentId?: string; appOrigin: string }): string | undefined {
  if (!import.meta.env.DEV || !args.environmentId) return undefined;
  const connectionUrl = import.meta.env.VITE_LOCAL_CONNECTION_URL || DEFAULT_LOCAL_CONNECTION_URL;
  const url = new URL(`https://apps.powerapps.com/play/e/${args.environmentId}/app/local`);
  url.searchParams.set("_localAppUrl", args.appOrigin);
  url.searchParams.set("_localConnectionUrl", connectionUrl);
  return url.toString();
}

/**
 * Resolves the base URL `appTabUrl` should open a new tab against, whichever environment this
 * is running in: `localPlayUrl` for a local dev session, the host-reported `ctx.app.appUrl` for
 * a pushed app (production, or any other real deployment), or neither — in which case
 * `appTabUrl` falls back to the current browser URL itself.
 *
 * The local URL wins under `npm run dev` (20 Oct 2026): the host can report an `appUrl` during a
 * `pac code run` session too, and that URL plays a PUBLISHED app, so Edit Project opened the
 * wrong app instead of this local one. `localPlayUrl` is `undefined` outside dev, so a pushed
 * app still uses the host's URL.
 */
export function resolvePlayAppUrl(args: {
  sessionAppUrl?: string;
  environmentId?: string;
  appOrigin: string;
}): string | undefined {
  return localPlayUrl({ environmentId: args.environmentId, appOrigin: args.appOrigin }) ?? args.sessionAppUrl;
}

/** The Project Management screens a new tab can be launched on. */
export const PM_LAUNCH_PATHS = ["/project/general"] as const;
export type PmLaunchPath = (typeof PM_LAUNCH_PATHS)[number];

/**
 * A project's PM screen in a new tab — `Edit Project`.
 *
 * Like `costAppUrl`: the player strips the fragment before `Landing` sees it, so the screen rides
 * along as the `pmScreen` launch parameter and the project as `projectId`; `Landing` turns the
 * pair into `/project/general?projectId=…`.
 */
export function projectAppUrl(args: {
  currentUrl: string;
  appUrl?: string;
  projectId: string;
  path?: PmLaunchPath;
}): string {
  if (!isGuid(args.projectId)) throw new Error("The project link is invalid.");
  const path = args.path ?? "/project/general";
  const url = new URL(appTabUrl({
    currentUrl: args.currentUrl,
    ...(args.appUrl === undefined ? {} : { appUrl: args.appUrl }),
    path,
    projectId: args.projectId,
  }));
  url.searchParams.set("pmScreen", path);
  return url.toString();
}

/** The `pmScreen` launch parameter, if it names a known PM screen; otherwise `undefined`. */
export function launchPmPath(
  launchParams: Record<string, string>, outerSearch = "",
): PmLaunchPath | undefined {
  const sources = [Object.entries(launchParams), [...new URLSearchParams(outerSearch)]];
  for (const source of sources) {
    const entry = source.find(([key]) => key.toLowerCase() === "pmscreen");
    if (entry) return PM_LAUNCH_PATHS.find((path) => path === entry[1]);
  }
  return undefined;
}

/**
 * The cost module in a new tab.
 *
 * `costLocation` validates the project id first, so an invalid one throws here rather than
 * opening a tab that cannot resolve a project. `costScreen` is carried as a query parameter
 * as well, because the player strips the fragment before `Landing` ever sees it.
 */
export function costAppUrl(args: {
  currentUrl: string;
  appUrl?: string;
  projectId: string;
  path?: CostPath;
}): string {
  const route = costLocation(args.path ?? "/costs/capex", args.projectId);
  const url = new URL(appTabUrl({
    currentUrl: args.currentUrl,
    ...(args.appUrl === undefined ? {} : { appUrl: args.appUrl }),
    path: route.pathname,
    projectId: args.projectId,
  }));
  url.searchParams.set("costScreen", route.pathname);
  return url.toString();
}

/** Only known internal destinations can be selected by a player launch parameter. */
export function launchCostPath(launchParams: Record<string, string>, outerSearch = ""): CostPath {
  const sources = [Object.entries(launchParams), [...new URLSearchParams(outerSearch)]];
  for (const source of sources) {
    const entry = source.find(([key]) => key.toLowerCase() === "costscreen");
    if (entry) return COST_PATHS.find((path) => path === entry[1]) ?? "/costs/capex";
  }
  return "/costs/capex";
}
