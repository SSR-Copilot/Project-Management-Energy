/**
 * Navigation items and helpers for Project Management screens.
 *
 * PM screens use route path params (/projects/:projectId/…) rather than the query-param
 * pattern the Cost rail uses, so link resolution is handled here by `pmNavHref` rather than
 * in `LeftNav`'s `costLocation` call.
 *
 * Adding a future PM screen: append an entry to `PM_NAV_ITEMS` and extend `activePmNavKey`
 * with its path pattern. No changes to `PmLeftNav` or `AppShell` are required.
 */
import type { NavItem } from "./navigation";

export const PM_NAV_ITEMS: NavItem[] = [
  {
    key: "PmGeneralDataKey",
    label: "General Data",
    icon: "document",
    path: "/projects/:projectId/general",
    enabled: true,
    visible: true,
  },
];

/** Which PM rail item a pathname belongs to, so the rail highlights correctly on a deep link. */
export function activePmNavKey(pathname: string): string | undefined {
  if (pathname === "/projects/new" || /^\/projects\/[^/]+\/general/.test(pathname)) {
    return "PmGeneralDataKey";
  }
  return undefined;
}

/**
 * Build the real href for a PM nav item, substituting the :projectId path param.
 *
 * When no projectId is available (the new-project form at /projects/new), the fallback keeps
 * the user on the same screen — General Data IS the new-project route.
 */
export function pmNavHref(item: NavItem, projectId: string | undefined): string {
  if (!item.path) return "#";
  if (projectId) return item.path.replace(":projectId", projectId);
  return "/projects/new";
}
