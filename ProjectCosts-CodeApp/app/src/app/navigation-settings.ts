/**
 * Application Settings navigation, transcribed from `App.Formulas` → `LeftAdminNavigationMenu`
 * (`App.pa.yaml:311-421`) in the Project Management canvas app.
 *
 * Two group headers with no target screen ("Project Gate", "Standard Assumptions") and six
 * destinations. Every entry shares `ItemVisible: Or(IsApplicationAdministrator,
 * IsControllerOwnData)`; that gate is applied to the whole section by `SettingsGate` in
 * `routes.tsx`, so items here are all visible. The two commented-out "Approval Settings"
 * entries in the canvas source (`App.pa.yaml:342-365`) are not carried over.
 */
import type { NavItem } from "./navigation";

export const SETTINGS_PATHS = {
  checklists: "/settings/checklists",
  gates: "/settings/gates",
  capexAccounts: "/settings/capex-accounts",
  milestones: "/settings/milestones",
  costs: "/settings/costs",
  contracts: "/settings/contracts",
} as const;

/** The header's "Application Settings" item navigates to 'Admin Project Default Checklists Screen'. */
export const SETTINGS_HOME = SETTINGS_PATHS.checklists;

export const SETTINGS_NAV_ITEMS: NavItem[] = [
  { key: "GatesKey", label: "Project Gate", icon: "checklist", enabled: true, visible: true },
  {
    key: "GatesSettingKey", label: "Check List Settings", icon: "checklist",
    path: SETTINGS_PATHS.checklists, parentKey: "GatesKey", enabled: true, visible: true,
  },
  {
    key: "GatesApprovalsKey", label: "Project Gates", icon: "gates",
    path: SETTINGS_PATHS.gates, parentKey: "GatesKey", enabled: true, visible: true,
  },
  {
    key: "CAPEX AccountsKey", label: "CAPEX Accounts", icon: "accounts",
    path: SETTINGS_PATHS.capexAccounts, parentKey: "GatesKey", enabled: true, visible: true,
  },
  { key: "StandardAssumptionsKey", label: "Standard Assumptions", icon: "currency", enabled: true, visible: true },
  {
    key: "MilestonesSettingsKey", label: "Milestones", icon: "calendar",
    path: SETTINGS_PATHS.milestones, parentKey: "StandardAssumptionsKey", enabled: true, visible: true,
  },
  {
    key: "CostSettingKey", label: "Costs", icon: "currency",
    path: SETTINGS_PATHS.costs, parentKey: "StandardAssumptionsKey", enabled: true, visible: true,
  },
  {
    key: "ContractSettingKey", label: "Contracts", icon: "contract",
    path: SETTINGS_PATHS.contracts, parentKey: "StandardAssumptionsKey", enabled: true, visible: true,
  },
];

/** Both groups start open, so every settings screen is one click away. */
export const SETTINGS_OPEN_GROUPS = ["GatesKey", "StandardAssumptionsKey"] as const;

export const isSettingsPath = (pathname: string): boolean =>
  pathname === "/settings" || pathname.startsWith("/settings/");

export function activeSettingsNavKey(pathname: string): string | undefined {
  return SETTINGS_NAV_ITEMS.find((i) => i.path && pathname.startsWith(i.path))?.key;
}

/**
 * The header title per settings screen. Each is the rail label, except where the canvas header
 * says something else: Check List Settings passes a dummy project named "Checklist settings" to
 * `cmp_Header` (DCS:87-95, 03-shared-components-and-layout §1.2).
 */
const PAGE_TITLE_OVERRIDES: Partial<Record<string, string>> = {
  [SETTINGS_PATHS.checklists]: "Checklist settings",
};

export const SETTINGS_PAGE_TITLES: Readonly<Record<string, string>> = Object.fromEntries(
  SETTINGS_NAV_ITEMS
    .filter((i): i is NavItem & { path: string } => Boolean(i.path))
    .map((i) => [i.path, PAGE_TITLE_OVERRIDES[i.path] ?? i.label]),
);

/** The header title for a settings path, or undefined outside the six settings screens. */
export function settingsPageTitle(pathname: string): string | undefined {
  const item = SETTINGS_NAV_ITEMS.find((i) => i.path && pathname.startsWith(i.path));
  return item?.path ? SETTINGS_PAGE_TITLES[item.path] : undefined;
}

/** `document.title` on a settings screen. */
export const settingsDocumentTitle = (pageTitle: string): string => `${pageTitle} · Application Settings`;
