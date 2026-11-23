/**
 * The loaders of the two screens the app usually opens on, as named functions.
 *
 * `routes.tsx` wraps them in `lazy()`; `bootPrefetch.ts` calls them at once, so the screen's chunk
 * downloads beside the session and the first reads instead of after them (D119). The
 * module system returns the same promise for both, so nothing is fetched twice.
 */
export const loadProjectOverviewScreen = () => import("@/features/pm/project-main/Screen");
export const loadGeneralDataScreen = () => import("@/features/pm/general-data/Screen");
/** The Generators screen: `bootPrefetch.ts` and `generatorsWarmup.ts` start its chunk before the route needs it (D141). */
export const loadGeneratorsScreen = () => import("@/features/pm/generators/Screen");

/*
 * OPT-03 (B5b): every other screen's loader too, so a deep link to any of them starts its chunk beside the session
 * (`bootPrefetch.ts`), and `routes.tsx` wraps the same functions in `lazy()` (the module system returns the same promise to both).
 */
export const loadContractsScreen = () => import("@/features/cost/contracts/Screen");
export const loadCapexCostsScreen = () => import("@/features/cost/capex-costs/Screen");
export const loadOpexCostsScreen = () => import("@/features/cost/opex-costs/Screen");
export const loadLandLeaseScreen = () => import("@/features/cost/land-lease/Screen");
export const loadAddCostsFromTableScreen = () => import("@/features/cost/add-costs-from-table/Screen");

export const loadMilestonesScreen = () => import("@/features/pm/milestones/Screen");
export const loadProductionScreen = () => import("@/features/pm/production/Screen");
export const loadCheckListScreen = () => import("@/features/pm/checklist/Screen");
export const loadTeamScreen = () => import("@/features/pm/team/Screen");
export const loadPlanningScreen = () => import("@/features/pm/planning/Screen");
export const loadGridOperatorScreen = () => import("@/features/pm/grid-operator/Screen");
export const loadRevenuesScreen = () => import("@/features/pm/revenues/Screen");
export const loadFinanceScreen = () => import("@/features/pm/finance/Screen");

/** The chunks a Cost route renders (`add-from-table` is a panel over the CAPEX screen, so both). */
export const COST_SCREEN_LOADERS: Record<string, readonly (() => Promise<unknown>)[]> = {
  "/costs/capex": [loadCapexCostsScreen],
  "/costs/opex/om": [loadOpexCostsScreen],
  "/costs/opex/other": [loadOpexCostsScreen],
  "/costs/land-lease": [loadLandLeaseScreen],
  "/costs/contracts": [loadContractsScreen],
  "/costs/add-from-table": [loadCapexCostsScreen, loadAddCostsFromTableScreen],
};

/** The chunk of a Project Management screen, by its route slug (`/project/<slug>`). General Data and Generators are started by their own targets. */
export const PM_SCREEN_LOADERS: Record<string, () => Promise<unknown>> = {
  general: loadGeneralDataScreen,
  generators: loadGeneratorsScreen,
  milestones: loadMilestonesScreen,
  production: loadProductionScreen,
  checklist: loadCheckListScreen,
  team: loadTeamScreen,
  planning: loadPlanningScreen,
  "grid-operator": loadGridOperatorScreen,
  revenues: loadRevenuesScreen,
  finance: loadFinanceScreen,
};
