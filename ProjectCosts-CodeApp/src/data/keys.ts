/**
 * react-query cache keys, in one place so an invalidation cannot miss a consumer.
 *
 * Everything project-scoped carries the project id, because the Cost app is opened per
 * project via a deep link and switching projects must not show the previous one's rows.
 */

/** A settings Country + Technology selection, as the Application Settings screens key their scoped reads. */
export interface SettingsScope {
  countryId: string;
  technology: number;
}

export const qk = {
  session: ["session"] as const,
  environmentVariables: ["environmentVariables"] as const,

  project: (projectId: string) => ["project", projectId] as const,
  projectCountry: (countryId: string) => ["projectCountry", countryId] as const,

  capexAccounts: ["capexAccounts"] as const,
  /*
   * Application Settings (`/admin/*`) keys, flat and camelCase like the rest of `qk`. A key with a
   * `...All` twin is a prefix of it, so one invalidation refreshes every scope.
   */
  /**
   * The ONE `vsb_countries` read shared by the settings screens (`data/countries.ts`): every country,
   * active or not; consumers narrow it with `select`. Not under `["countries"]`, which Project Main
   * uses for its own read.
   */
  adminCountries: ["adminCountries"] as const,
  /** Admin CAPEX Accounts: the whole chart (prefix of the two below), its tree, and one account's contract check. */
  adminCapexAccounts: ["adminCapexAccounts"] as const,
  adminCapexAccountsTree: ["adminCapexAccounts", "tree"] as const,
  adminCapexHasContracts: (id: string) => ["adminCapexAccounts", "has-contracts", id] as const,
  /** Admin Default Checklists: tabs, clusters, a tab's tasks and the approval locks. */
  adminChecklistTabs: ["adminChecklistTabs"] as const,
  adminChecklistClusters: ["adminChecklistClusters"] as const,
  /** Prefix of every tab's task list. */
  adminChecklistTasksAll: ["adminChecklistTasks"] as const,
  adminChecklistTasks: (tabId: string | null) => ["adminChecklistTasks", tabId ?? ""] as const,
  adminChecklistLocks: ["adminChecklistLocks"] as const,
  /** Admin Gates & Approvals: the states, one Country + Technology dataset, the placeholder key and the Entra lookup. */
  adminGateStates: ["adminGateStates"] as const,
  /** Prefix of every dataset (and of the disabled `adminGateDatasetNone`). */
  adminGateDatasetAll: ["adminGateDataset"] as const,
  adminGateDataset: (countryId: string, technology: number) => ["adminGateDataset", countryId, technology] as const,
  /** The placeholder key used while no context is selected. */
  adminGateDatasetNone: ["adminGateDataset", "none"] as const,
  adminGatePeople: (term: string) => ["adminGatePeople", term.trim().toLowerCase()] as const,
  /** Admin Milestones: the assumption rows of every country. */
  adminMilestoneAssumptions: ["adminMilestoneAssumptions"] as const,
  /** Admin Cost: the account hierarchy, the subaccount lists, the lookups and one scope's standard costs. */
  adminCostHierarchy: ["adminCostHierarchy"] as const,
  adminCostLandLeaseSubaccounts: ["adminCostLandLeaseSubaccounts"] as const,
  adminCostOpexSubaccounts: ["adminCostOpexSubaccounts"] as const,
  adminCostCurrencies: ["adminCostCurrencies"] as const,
  adminCostPayerDefaults: ["adminCostPayerDefaults"] as const,
  adminCostInflationAreas: (countryId: string) => ["adminCostInflationAreas", countryId] as const,
  /** Prefix of every scope's standard (DEVEX) cost list. */
  adminCostDevexAll: ["adminCostDevex"] as const,
  adminCostDevex: (scope: SettingsScope | undefined) =>
    ["adminCostDevex", scope?.countryId ?? "-", scope?.technology ?? -1] as const,
  /** Prefix of every scope's standard OPEX / Land Lease period list. */
  adminCostOpexAll: ["adminCostOpex"] as const,
  adminCostOpex: (scope: SettingsScope | undefined) =>
    ["adminCostOpex", scope?.countryId ?? "-", scope?.technology ?? -1] as const,
  /** Admin Contract: one scope's standard contracts and DevCo rows, and a single-contract read (each with its prefix). */
  adminContractListAll: ["adminContractList"] as const,
  adminContractList: (countryId: string, technology: number) => ["adminContractList", countryId, technology] as const,
  adminContractDevCoAll: ["adminContractDevCo"] as const,
  adminContractDevCo: (countryId: string, technology: number) => ["adminContractDevCo", countryId, technology] as const,
  adminContractRecordAll: ["adminContractRecord"] as const,
  adminContractRecord: (id: string) => ["adminContractRecord", id] as const,
  /*
   * Prefixes of the PROJECT-side caches that read tables Application Settings writes. The values are
   * the literals `features/cost/costing/useCostBook.ts` builds today; naming them here lets the
   * settings invalidation helpers (`data/adminInvalidation.ts`) be checked by the compiler.
   */
  /** `["capex-standard-assumptions", key]` — DEVEX/CAPEX standard costs. */
  capexStandardAssumptionsAll: ["capex-standard-assumptions"] as const,
  /** `["land-lease-assumptions", country, tech]` — Land Lease standard periods. */
  landLeaseAssumptionsAll: ["land-lease-assumptions"] as const,
  /** `["opex-assumption-scopes", country, tech]` — OPEX standard-contract catalogue. */
  opexAssumptionScopesAll: ["opex-assumption-scopes"] as const,
  /** `["capex-milestone-durations", country, tech]` — cluster durations (Milestones table). */
  capexMilestoneDurationsAll: ["capex-milestone-durations"] as const,
  /** `["cost-book", projectId, category]` — every project's cost book (account names, costs). */
  costBookAll: ["cost-book"] as const,
  /** `["capex-totals", projectId]` — DEVEX/CAPEX summary totals. */
  capexTotalsAll: ["capex-totals"] as const,
  /** `["add-cost-sheet", projectId, category]` — the Add Costs from Table sheet. */
  addCostSheetAll: ["add-cost-sheet"] as const,
  /** Prefix key of the Admin Milestones assumptions (PM Milestones' row key sits under it). */
  milestoneAssumptionsAll: ["milestoneAssumptions"] as const,
  /** PM General Data (D25): the project row, its reference data and its child rows. */
  generalDataProject: (projectId: string) => ["generalDataProject", projectId] as const,
  generalDataCountries: ["generalDataCountries"] as const,
  generalDataAreas: (countryId: string) => ["generalDataAreas", countryId] as const,
  generalDataProjectStates: ["generalDataProjectStates"] as const,
  generalDataUtilizations: (countryId: string) => ["generalDataUtilizations", countryId] as const,
  shareholders: (projectId: string) => ["shareholders", projectId] as const,
  stateTrackings: (projectId: string) => ["stateTrackings", projectId] as const,
  germanMunicipalities: (area: string, term: string) => ["germanMunicipalities", area, term] as const,
  frenchMunicipalities: (term: string) => ["frenchMunicipalities", term] as const,
  germanTradeTaxRate: (municipality: string) => ["germanTradeTaxRate", municipality] as const,
  milestoneDurations: (countryId: string, technology: number) => ["milestoneDurations", countryId, technology] as const,
  /** PM Milestones (D26). The assumption row sits under the Admin Milestones prefix, so an admin save refreshes it. */
  milestoneProject: (projectId: string) => ["milestoneProject", projectId] as const,
  milestoneAssumptionRow: (countryId: string, technology: number) =>
    ["milestoneAssumptions", countryId, "row", technology] as const,
  individualVolumeContracts: (projectId: string) => ["individualVolumeContracts", projectId] as const,
  projectRevenueCount: (projectId: string) => ["projectRevenueCount", projectId] as const,
  milestoneRecalculationRunning: (projectId: string) => ["milestoneRecalculationRunning", projectId] as const,
  /** PM Generators (D27). Everything project-scoped sits under `generatorsAll(projectId)`, so one invalidation refreshes the screen. */
  generatorsAll: (projectId: string) => ["generators", projectId] as const,
  generators: (projectId: string, part: string, ...rest: readonly (string | number)[]) =>
    ["generators", projectId, part, ...rest] as const,
  /** PM Production (D28). Everything project-scoped sits under `productionAll(projectId)`. */
  productionAll: (projectId: string) => ["production", projectId] as const,
  production: (projectId: string, part: string, ...rest: readonly (string | number)[]) =>
    ["production", projectId, part, ...rest] as const,
  /** PM Checklist (D29). Everything project-scoped sits under `checklistAll(projectId)`. */
  checklistAll: (projectId: string) => ["pmChecklist", projectId] as const,
  checklist: (projectId: string, part: string, ...rest: readonly (string | number)[]) =>
    ["pmChecklist", projectId, part, ...rest] as const,
  /** PM Team (D30). Everything project-scoped sits under `teamAll(projectId)`. */
  teamAll: (projectId: string) => ["pmTeam", projectId] as const,
  team: (projectId: string, part: string) => ["pmTeam", projectId, part] as const,
  teamMemberDescriptions: ["teamMemberDescriptions"] as const,
  /** PM Planning (D31). Everything project-scoped sits under `planningAll(projectId)`. */
  planningAll: (projectId: string) => ["pmPlanning", projectId] as const,
  planning: (projectId: string, part: string, ...rest: readonly string[]) => ["pmPlanning", projectId, part, ...rest] as const,
  aquisitionTypes: ["aquisitionTypes"] as const,
  /** PM Grid Operator (D32). Everything project-scoped sits under `gridOperatorAll(projectId)`. */
  gridOperatorAll: (projectId: string) => ["pmGridOperator", projectId] as const,
  gridOperator: (projectId: string, part: string) => ["pmGridOperator", projectId, part] as const,
  /** PM Revenues (D33). Everything project-scoped sits under `revenuesAll(projectId)`. */
  revenuesAll: (projectId: string) => ["pmRevenues", projectId] as const,
  revenues: (projectId: string, ...part: readonly (string | number)[]) => ["pmRevenues", projectId, ...part] as const,
  /** PM Revenues reference data (subaccount, currencies, cluster states, inflation profiles). */
  revenuesReference: (part: string, id = "-") => ["pmRevenuesReference", part, id] as const,
  /** PM Finance (D34). Everything project-scoped sits under `financeAll(projectId)`. */
  financeAll: (projectId: string) => ["pmFinance", projectId] as const,
  finance: (projectId: string, ...part: readonly (string | number)[]) => ["pmFinance", projectId, ...part] as const,
  /** PM Finance reference data (the six Financing Categories). */
  financeReference: (part: string) => ["pmFinanceReference", part] as const,
  planningChoices: (fieldName: string, countryId: string | null) => ["planningChoices", fieldName, countryId ?? "-"] as const,
  generatorCatalog: (fid: string) => ["generatorCatalog", fid] as const,
  generatorModels: (ids: readonly string[]) => ["generatorModels", ...ids] as const,
  pvModuleCatalog: ["pvModuleCatalog"] as const,
  /** PM Generators G9 — the `Inverters` / `Substructures` supplier catalogues. */
  plantSupplierCatalog: (kind: "inverter" | "substructure") => ["plantSupplierCatalog", kind] as const,
  deviceCosts: (countryId: string) => ["deviceCosts", countryId] as const,
  priceInflation: (fidYear: number) => ["priceInflation", fidYear] as const,
  entraPeopleSearch: (term: string) => ["entraPeopleSearch", term] as const,
  entraPeople: (ids: readonly string[]) => ["entraPeople", ...ids] as const,

  contracts: (projectId: string) => ["contracts", projectId] as const,
  paymentTargets: (projectId: string) => ["paymentTargets", projectId] as const,
  devCoLinks: (projectId: string) => ["devCoLinks", projectId] as const,
  devCoCapexContracts: (projectId: string) => ["devCoCapexContracts", projectId] as const,
  devCoCapexCosts: (projectId: string) => ["devCoCapexCosts", projectId] as const,
  bopStandardAssumptions: (countryId: string | undefined, technology: number | undefined) =>
    ["bopStandardAssumptions", countryId ?? "-", technology ?? -1] as const,
  /** Prefix key: refreshed when Admin Contract changes a BoP standard contract. */
  bopStandardAssumptionsAll: ["bopStandardAssumptions"] as const,
} as const;

/** Everything that a contract save can affect. */
export function contractInvalidations(projectId: string) {
  return [
    qk.contracts(projectId),
    qk.paymentTargets(projectId),
    qk.devCoLinks(projectId),
  ];
}
