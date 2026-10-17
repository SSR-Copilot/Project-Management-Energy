/**
 * react-query cache keys, in one place so an invalidation cannot miss a consumer.
 *
 * Everything project-scoped carries the project id, because the Cost app is opened per
 * project via a deep link and switching projects must not show the previous one's rows.
 */

/** A settings Country + Technology selection, as the settings screens key their scoped reads. */
export interface SettingsScope {
  countryId: string;
  technology: number;
}

/**
 * Application Settings keys (`qk.settings.*`).
 *
 * Each factory returns EXACTLY the key the screen builds locally today (checked against
 * `features/settings/<slug>/hooks.ts` and `data/settings/contracts.ts`), so a screen can swap its
 * local key object for these without its cache entries, tests or cross-screen invalidations
 * changing. Normalising them under one `["settings", "<slug>", …]` root is deliberately a later,
 * one-file change here, once every screen reads its keys from this object.
 */
const COSTS_ROOT = "settings-costs";
const checklistsAll = ["settings", "checklist-settings"] as const;
const capexAccountsAll = ["settings", "capex-accounts"] as const;

const settings = {
  /** `features/settings/checklist-settings/hooks.ts` `checklistKeys`. */
  checklists: {
    all: checklistsAll,
    tabs: () => [...checklistsAll, "tabs"] as const,
    clusters: () => [...checklistsAll, "clusters"] as const,
    /** Prefix of every tab's task list. */
    tasksAll: () => [...checklistsAll, "tasks"] as const,
    tasks: (tabId: string | null) => [...checklistsAll, "tasks", tabId ?? ""] as const,
    locks: () => [...checklistsAll, "locks"] as const,
  },
  /**
   * `features/settings/project-gates/hooks.ts` `pgKeys`. `dataset` takes the numeric technology
   * code (the screen's `TECH[techKey]`), which is what the local key stores.
   */
  gates: {
    countries: () => ["projectGates:countries"] as const,
    states: () => ["projectGates:states"] as const,
    /** Prefix of every Country + Technology dataset (and of the disabled `"none"` key). */
    datasetAll: () => ["projectGates"] as const,
    dataset: (countryId: string, technology: number) => ["projectGates", countryId, technology] as const,
    /** The placeholder key used while no context is selected. */
    datasetNone: () => ["projectGates", "none"] as const,
    people: (term: string) => ["projectGates:people", term.trim().toLowerCase()] as const,
  },
  /** `features/settings/capex-accounts/hooks.ts` `capexAdminKeys`. */
  capexAccounts: {
    all: capexAccountsAll,
    tree: ["settings", "capex-accounts", "tree"] as const,
    hasContracts: (id: string) => ["settings", "capex-accounts", "has-contracts", id] as const,
  },
  /** `features/settings/milestones/hooks.ts` `milestoneKeys`. */
  milestones: {
    countries: ["milestoneCountries"] as const,
    assumptions: ["milestoneStandardAssumptions"] as const,
  },
  /** `features/settings/costs/hooks.ts` `costsKeys`. */
  costs: {
    all: [COSTS_ROOT] as const,
    countries: [COSTS_ROOT, "countries"] as const,
    hierarchy: [COSTS_ROOT, "capex-hierarchy"] as const,
    landLeaseSubaccounts: [COSTS_ROOT, "land-lease-subaccounts"] as const,
    opexSubaccounts: [COSTS_ROOT, "opex-subaccounts"] as const,
    currencies: [COSTS_ROOT, "currencies"] as const,
    payerDefaults: [COSTS_ROOT, "payer-defaults"] as const,
    inflationAreas: (countryId: string) => [COSTS_ROOT, "inflation-areas", countryId] as const,
    /** Prefix of every scope's standard (DEVEX) cost list. */
    devexAll: () => [COSTS_ROOT, "devex"] as const,
    devex: (scope: SettingsScope | undefined) =>
      [COSTS_ROOT, "devex", scope?.countryId ?? "-", scope?.technology ?? -1] as const,
    /** Prefix of every scope's standard OPEX / Land Lease period list. */
    opexAll: () => [COSTS_ROOT, "opex"] as const,
    opex: (scope: SettingsScope | undefined) =>
      [COSTS_ROOT, "opex", scope?.countryId ?? "-", scope?.technology ?? -1] as const,
  },
  /** `data/settings/contracts.ts` `contractSettingsKeys`. */
  contracts: {
    countries: ["settings-contracts-countries"] as const,
    /** Prefix of every scope's standard-contract list. */
    listAll: () => ["settings-contracts"] as const,
    list: (countryId: string, technology: number) => ["settings-contracts", countryId, technology] as const,
    /** Prefix of every scope's DevCo rows. */
    devCoAll: () => ["settings-contract-devco"] as const,
    devCo: (countryId: string, technology: number) => ["settings-contract-devco", countryId, technology] as const,
    /** Prefix of every single-contract read. */
    recordAll: () => ["settings-contract"] as const,
    record: (id: string) => ["settings-contract", id] as const,
  },
} as const;

/**
 * Prefixes of the PROJECT-side caches that read tables Application Settings writes. The values
 * are the literals `features/costing/useCostBook.ts` and `features/contracts/hooks.ts` build today
 * (unchanged); naming them here lets the settings invalidation helpers be checked by the compiler
 * instead of matching strings by hand.
 */
const standards = {
  /** `["capex-standard-assumptions", key]` — DEVEX/CAPEX standard costs (`useCostBook.ts`). */
  capexStandardAssumptions: ["capex-standard-assumptions"] as const,
  /** `["land-lease-assumptions", country, tech]` — Land Lease standard periods. */
  landLeaseAssumptions: ["land-lease-assumptions"] as const,
  /** `["opex-assumption-scopes", country, tech]` — OPEX standard-contract catalogue. */
  opexAssumptionScopes: ["opex-assumption-scopes"] as const,
  /** `["capex-milestone-durations", country, tech]` — cluster durations (Milestones table). */
  capexMilestoneDurations: ["capex-milestone-durations"] as const,
  /** Every BoP standard-contract margin seed; `qk.bopStandardAssumptions(c, t)` narrows it. */
  bopStandardAssumptionsAll: ["bopStandardAssumptions"] as const,
  /** `["cost-book", projectId, category]` — every project's cost book (account names, costs). */
  costBook: ["cost-book"] as const,
  /** `["capex-totals", projectId]` — DEVEX/CAPEX summary totals. */
  capexTotals: ["capex-totals"] as const,
  /** `["add-cost-sheet", projectId, category]` — the Add Costs from Table sheet. */
  addCostSheet: ["add-cost-sheet"] as const,
} as const;

export const qk = {
  session: ["session"] as const,
  environmentVariables: ["environmentVariables"] as const,
  /** The header badge's user and roles (`loadCurrentUser`), one entry per session user. */
  currentUser: (entraObjectId: string | undefined) => ["current-user", entraObjectId ?? ""] as const,

  project: (projectId: string) => ["project", projectId] as const,
  projectCountry: (countryId: string) => ["projectCountry", countryId] as const,

  capexAccounts: ["capexAccounts"] as const,

  contracts: (projectId: string) => ["contracts", projectId] as const,
  paymentTargets: (projectId: string) => ["paymentTargets", projectId] as const,
  devCoLinks: (projectId: string) => ["devCoLinks", projectId] as const,
  devCoCapexContracts: (projectId: string) => ["devCoCapexContracts", projectId] as const,
  devCoCapexCosts: (projectId: string) => ["devCoCapexCosts", projectId] as const,
  bopStandardAssumptions: (countryId: string | undefined, technology: number | undefined) =>
    ["bopStandardAssumptions", countryId ?? "-", technology ?? -1] as const,

  generalData: (projectId: string | undefined) => ["generalData", projectId ?? "new"] as const,
  countryAreas: (countryId: string | undefined) => ["countryAreas", countryId ?? "-"] as const,
  projectManagerSearch: (term: string) => ["projectManagerSearch", term] as const,
  terrainUtilizationChoices: (countryId: string | null | undefined) =>
    ["terrainUtilizationChoices", countryId ?? "-"] as const,

  /**
   * The ONE `vsb_countries` reference read shared by the settings screens (`data/countries.ts`,
   * M6). Every country, active and inactive; consumers narrow it with `select`. Deliberately not
   * under `["countries"]`, which the project overview uses for its own read.
   */
  countries: {
    all: ["reference-countries"] as const,
  },

  settings,
  standards,
} as const;

/** Everything that a contract save can affect. */
export function contractInvalidations(projectId: string) {
  return [
    qk.contracts(projectId),
    qk.paymentTargets(projectId),
    qk.devCoLinks(projectId),
  ];
}
