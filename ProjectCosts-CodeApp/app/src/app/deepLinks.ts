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
 * The hosted app runs in a frame. Open the SDK's player URL, carrying query parameters
 * for getContext(); a fragment alone on the outer player does not reach HashRouter.
 * Locally the browser URL is the application itself, so the fragment works directly.
 */
export function costAppUrl(args: {
  currentUrl: string;
  appUrl?: string;
  projectId: string;
  path?: CostPath;
}): string {
  const route = costLocation(args.path ?? "/costs/capex", args.projectId);
  const url = new URL(args.appUrl || args.currentUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The application link is not configured correctly.");
  }
  // Retain host parameters such as tenantId; discard old project IDs and list filters.
  const appKeys = new Set([...PROJECT_ID_KEYS, "costscreen", "q", "sort", "dir", "p"]);
  for (const key of [...url.searchParams.keys()]) {
    if (appKeys.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.set("projectId", normalizeGuid(args.projectId));
  url.searchParams.set("costScreen", route.pathname);
  url.hash = `${route.pathname}${route.search}`;
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
