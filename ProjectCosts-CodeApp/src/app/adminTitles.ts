/**
 * The title each Application Settings (admin) screen shows in the shell header, next to the back
 * arrow: the `Project.Name` its canvas screen passes to `cmp_Header`
 * (`Admin Project Default Checklists Screen.pa.yaml:90`, `Admin Project Gates Approvals Screen.pa.yaml:179`,
 * `Admin CAPEX Accounts.pa.yaml:82`, `Admin Milestones Screen.pa.yaml:90`, `Admin Cost Screen.pa.yaml:546`,
 * `Admin Contract Screen.pa.yaml:345`) — verbatim. Pure, so the mapping is tested without a router.
 */
export const ADMIN_PAGE_TITLES: Readonly<Record<string, string>> = {
  "/admin/default-checklists": "Checklist settings",
  "/admin/gates-approvals": "Project Gates",
  "/admin/capex-accounts": "CAPEX Accounts",
  "/admin/milestones": "Milestones",
  "/admin/cost": "Costs",
  "/admin/contract": "Contracts",
};

/** The header title for `pathname`, or `undefined` off the admin screens. A trailing slash is ignored. */
export function adminPageTitle(pathname: string): string | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ADMIN_PAGE_TITLES[path];
}
