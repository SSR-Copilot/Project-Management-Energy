/**
 * A page view's friendly name, taken from the menus (`app/navigation.ts`) so it reads as the user
 * sees it. The section goes first because labels repeat across menus ("Milestones" is a Project
 * screen and an Admin screen, "Contracts" a Costs screen and an Admin one).
 */
import { ADMIN_NAV_ITEMS, NAV_ITEMS, PM_NAV_ITEMS, type NavItem } from "@/app/navigation";

/** Routes the menus do not list. */
const EXTRA: Record<string, string> = {
  "/": "Start",
  "/costs": "Costs",
  "/costs/add-from-table": "Costs - Add Cost from Table",
};

function section(path: string): string | undefined {
  if (path.startsWith("/costs/")) return "Costs";
  if (path.startsWith("/project/")) return "Project";
  if (path.startsWith("/admin/")) return "Admin";
  return undefined;
}

const NAMES = new Map<string, string>(Object.entries(EXTRA));
for (const item of [...NAV_ITEMS, ...PM_NAV_ITEMS, ...ADMIN_NAV_ITEMS] as NavItem[]) {
  if (!item.path || NAMES.has(item.path)) continue;
  const prefix = section(item.path);
  NAMES.set(item.path, prefix ? `${prefix} - ${item.label}` : item.label);
}

/** `/project/milestones` → "Project - Milestones"; a route no menu lists keeps its path. */
export function screenName(route: string): string {
  return NAMES.get(route) ?? route;
}
