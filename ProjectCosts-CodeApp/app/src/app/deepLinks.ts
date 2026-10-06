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
 * for getContext(); a fragment alone on the outer player does not reach HashRouter.
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
  const appKeys = new Set([...PROJECT_ID_KEYS, "costscreen", "q", "sort", "dir", "p"]);
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
