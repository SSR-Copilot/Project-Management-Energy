/**
 * The left rail, transcribed from `App.Formulas` → `LeftNavigationMenu`.
 *
 * The canvas app carried seven entries. Two are not real destinations:
 *   - `OpexCostsKey` ("OPEX") has NO `TargetScreen` — its own target is commented out, so it
 *     is a parent group that expands rather than navigating.
 *   - `TotalCostsSummary` ("Total Summary") ships `ItemEnabled: false, ItemVisible: false`.
 *     It is kept here, hidden, so its absence is a decision rather than an omission.
 *
 * Note `ItemDisplayName: " DEVEX/CAPEX"` has a LEADING SPACE in the canvas source. The
 * screenshots show it rendered flush with the other labels, so the space is an authoring
 * slip; it is dropped here and recorded rather than reproduced.
 *
 * Two rail items point at the SAME canvas screen (`Opex Costs Screen`): "Operation &
 * Maintenance" and "Other OPEX Costs". That screen switched behaviour on the selected key,
 * which is why the route carries a `mode`.
 */
export interface NavItem {
  key: string;
  label: string;
  /**
   * Mapped to a Fluent v9 icon in `LeftNav`. The keys track `LeftNavigationMenu.ItemIconName`
   * in `App.pa.yaml`, which is a Fabric icon set:
   *
   *   capex    -> ReadingModeSolid      (DEVEX/CAPEX)
   *   opex     -> PageEdit              (the OPEX group; the rail draws a chevron for it)
   *   document -> PageEdit              (O&M, Land Lease, Other OPEX Costs)
   *   contract -> TextDocumentShared    (Contracts — NOT the same icon as its siblings)
   *   currency -> AllCurrency           (Total Summary, hidden)
   */
  icon: "projects" | "capex" | "opex" | "document" | "contract" | "currency";
  path?: string;
  parentKey?: string;
  enabled: boolean;
  visible: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    /**
     * Retained as a route key, hidden to match the Canvas Cost rail. The overview stays
     * open in its original browser tab when Costs launches.
     */
    key: "ProjectsKey",
    label: "Projects",
    icon: "projects",
    path: "/projects",
    enabled: true,
    visible: false,
  },
  {
    key: "DevexCapexCostsKey",
    label: "DEVEX/CAPEX",
    icon: "capex",
    path: "/costs/capex",
    enabled: true,
    visible: true,
  },
  {
    // No TargetScreen in the canvas source: a group header, not a destination.
    key: "OpexCostsKey",
    label: "OPEX",
    icon: "opex",
    enabled: true,
    visible: true,
  },
  {
    key: "O&MKey",
    label: "Operation & Maintenance",
    icon: "document",
    path: "/costs/opex/om",
    parentKey: "OpexCostsKey",
    enabled: true,
    visible: true,
  },
  {
    key: "LandLeaseKey",
    label: "Land Lease",
    icon: "document",
    path: "/costs/land-lease",
    parentKey: "OpexCostsKey",
    enabled: true,
    visible: true,
  },
  {
    key: "OtherOpexCostsKey",
    label: "Other OPEX Costs",
    icon: "document",
    path: "/costs/opex/other",
    parentKey: "OpexCostsKey",
    enabled: true,
    visible: true,
  },
  {
    key: "ContractsKey",
    label: "Contracts",
    icon: "contract",
    path: "/costs/contracts",
    enabled: true,
    visible: true,
  },
  {
    // ItemEnabled: false, ItemVisible: false in the canvas source.
    key: "TotalCostsSummary",
    label: "Total Summary",
    icon: "currency",
    enabled: false,
    visible: false,
  },
];

/** Which rail item a path belongs to, so the rail highlights correctly on a deep link. */
export function activeNavKey(pathname: string): string | undefined {
  const exact = NAV_ITEMS.find((i) => i.path === pathname);
  if (exact) return exact.key;
  // The landing route renders the overview, so the rail must highlight Projects there too.
  if (pathname === "/" || pathname === "") return "ProjectsKey";
  // `/costs/add-from-table` is reached from the DEVEX/CAPEX screen and belongs to it.
  if (pathname.startsWith("/costs/add-from-table")) return "DevexCapexCostsKey";
  return NAV_ITEMS.find((i) => i.path && pathname.startsWith(i.path))?.key;
}

/** The group a rail item sits under, for keeping the right group expanded. */
export function parentOf(key: string | undefined): string | undefined {
  return NAV_ITEMS.find((i) => i.key === key)?.parentKey;
}

/**
 * The return link to the Project Management canvas app.
 *
 * Transcribed from `App.OnStart`:
 *   `"https://apps.powerapps.com/play/e/" & gblEnvironmentID & "/a/" &
 *    gblProjectManagementAppID & "?tenantId=" & gblTenantID`
 *
 * PM stays on canvas for this phase, so this URL shape has to keep working exactly.
 */
export function projectManagementAppUrl(args: {
  environmentId: string | undefined;
  projectManagementAppId: string | undefined;
  tenantId: string | undefined;
}): string | undefined {
  const { environmentId, projectManagementAppId, tenantId } = args;
  if (!environmentId || !projectManagementAppId) return undefined;
  const base = `https://apps.powerapps.com/play/e/${environmentId}/a/${projectManagementAppId}`;
  return tenantId ? `${base}?tenantId=${tenantId}` : base;
}
