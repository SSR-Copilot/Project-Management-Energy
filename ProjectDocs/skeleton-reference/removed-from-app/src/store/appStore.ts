/**
 * Global state — the replacement for the canvas apps' 75 `gbl*` variables.
 *
 * Only genuinely cross-screen state lives here. Everything the canvas kept in
 * `UpdateContext({loc...})` is screen-local `useState` in the feature, and everything it
 * kept in a `col*` collection is a TanStack Query cache entry. Mapping:
 *
 *   gblCurrentUser              -> session.user
 *   gblRecordSelectedProject    -> project.selected
 *   gblRecordSelectedProjectCountry -> project.country
 *   gblProjectHeaderData        -> derived selector, not stored
 *   gblLeftNavigationSelected   -> ui.selectedNavKey
 *   gblLeftNavigationMenuIsExpanded -> ui.navExpanded
 *   gblShowReportProblemPanel   -> ui.reportPanelOpen
 *   gblReportError              -> ui.lastError
 *   gblAppStarted               -> bootstrap query isSuccess (not stored)
 *   gblAppTheme / Sizes / Styles / Constants -> theme/tokens.ts (static)
 */
import { create } from "zustand";
import type { CurrentUser } from "@/domain/session";
import { technologyLabel } from "@/domain/technology";
import type { SelectedProject } from "@/domain/navigation";
import type { ReportErrorRecord } from "@/platform/errors";

export interface EnvBadge {
  appVersion: string;
  environmentName: string;
  infoCenterUrl: string;
  pmAppUrl: string;
  costAppUrl: string;
}

export interface ProjectHeaderData {
  id: string;
  name: string;
  technology: string;
  capacity: number | null;
  status: string;
  approval: string;
}

interface AppState {
  session: {
    user: CurrentUser | null;
    env: EnvBadge | null;
  };
  project: {
    selected: SelectedProject | null;
    country: { id: string; name: string } | null;
    /** gblSelectedProjectYear */
    selectedYear: number;
  };
  ui: {
    navExpanded: boolean;
    selectedNavKey: string;
    reportPanelOpen: boolean;
    lastError: ReportErrorRecord | null;
    /** Mobile nav drawer, new — the canvas app had no small-screen layout. */
    mobileNavOpen: boolean;
    theme: "light" | "dark" | "system";
  };

  setUser: (u: CurrentUser | null) => void;
  patchUser: (p: Partial<CurrentUser>) => void;
  setEnv: (e: EnvBadge) => void;
  selectProject: (p: SelectedProject | null, country?: { id: string; name: string } | null) => void;
  clearProject: () => void;
  setSelectedYear: (y: number) => void;
  setNavExpanded: (v: boolean) => void;
  toggleNav: () => void;
  setSelectedNavKey: (k: string) => void;
  setMobileNavOpen: (v: boolean) => void;
  openReportPanel: (e?: ReportErrorRecord) => void;
  closeReportPanel: () => void;
  setLastError: (e: ReportErrorRecord | null) => void;
  setTheme: (t: "light" | "dark" | "system") => void;
}

const THEME_KEY = "vsbcloud.theme";

/** One-level structural comparison — enough for the flat records held in this store. */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k],
  );
}

function readStoredTheme(): "light" | "dark" | "system" {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  session: { user: null, env: null },
  project: { selected: null, country: null, selectedYear: new Date().getFullYear() },
  ui: {
    navExpanded: true, // gblLeftNavigationMenuIsExpanded = true in App.OnStart
    selectedNavKey: "",
    reportPanelOpen: false,
    lastError: null,
    mobileNavOpen: false,
    theme: readStoredTheme(),
  },

  setUser: (user) => set((s) => ({ session: { ...s.session, user } })),
  patchUser: (p) =>
    set((s) => {
      const cur = s.session.user;
      if (!cur) return s;
      const changed = (Object.keys(p) as (keyof typeof p)[]).some((k) => cur[k] !== p[k]);
      if (!changed) return s;
      return { session: { ...s.session, user: { ...cur, ...p } } };
    }),
  setEnv: (env) => set((s) => ({ session: { ...s.session, env } })),

  selectProject: (selected, country) =>
    set((s) => {
      // A store write with structurally identical data would re-render every subscriber
      // for nothing, and re-entrant effects would loop. Compare before writing.
      const same =
        shallowEqual(s.project.selected, selected) &&
        (country === undefined || shallowEqual(s.project.country, country));
      if (same) return s;
      return { project: { ...s.project, selected, country: country ?? s.project.country } };
    }),
  clearProject: () => set((s) => ({ project: { ...s.project, selected: null, country: null } })),
  setSelectedYear: (selectedYear) => set((s) => ({ project: { ...s.project, selectedYear } })),

  setNavExpanded: (navExpanded) => set((s) => ({ ui: { ...s.ui, navExpanded } })),
  toggleNav: () => set((s) => ({ ui: { ...s.ui, navExpanded: !s.ui.navExpanded } })),
  setSelectedNavKey: (selectedNavKey) => set((s) => ({ ui: { ...s.ui, selectedNavKey } })),
  setMobileNavOpen: (mobileNavOpen) => set((s) => ({ ui: { ...s.ui, mobileNavOpen } })),

  openReportPanel: (e) =>
    set((s) => ({ ui: { ...s.ui, reportPanelOpen: true, lastError: e ?? s.ui.lastError } })),
  closeReportPanel: () => set((s) => ({ ui: { ...s.ui, reportPanelOpen: false } })),
  setLastError: (lastError) => set((s) => ({ ui: { ...s.ui, lastError } })),

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private mode — ignore */
    }
    set((s) => ({ ui: { ...s.ui, theme } }));
    void get();
  },
}));

/**
 * `gblProjectHeaderData` — derived, never stored.
 *
 * Memoised on the source record. A zustand selector that builds a fresh object on every
 * call never compares equal under `useSyncExternalStore`, which renders forever
 * (React error #185). The cache below keeps one result per project record identity.
 */
let headerCacheKey: SelectedProject | null = null;
let headerCacheValue: ProjectHeaderData | null = null;

export function selectProjectHeader(s: AppState): ProjectHeaderData | null {
  const p = s.project.selected;
  if (p === headerCacheKey) return headerCacheValue;
  headerCacheKey = p;
  headerCacheValue = p
    ? {
        id: p.projectNumber ?? "",
        name: p.name ?? "",
        // `project.selected.technology` holds the RAW choice value, because three screens
        // filter on it. Resolving the label here is what keeps "952850000" out of the header.
        technology: technologyLabel(p.technology),
        capacity: p.plantWtgCapacityMw ?? null,
        status: p.clusterStateName ?? "",
        approval: "",
      }
    : null;
  return headerCacheValue;
}

export const useCurrentUser = () => useAppStore((s) => s.session.user);
export const useSelectedProject = () => useAppStore((s) => s.project.selected);
export const useProjectHeader = () => useAppStore(selectProjectHeader);
