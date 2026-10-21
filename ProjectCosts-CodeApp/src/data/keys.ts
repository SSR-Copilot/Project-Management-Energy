/**
 * react-query cache keys, in one place so an invalidation cannot miss a consumer.
 *
 * Everything project-scoped carries the project id, because the Cost app is opened per
 * project via a deep link and switching projects must not show the previous one's rows.
 */
export const qk = {
  session: ["session"] as const,
  environmentVariables: ["environmentVariables"] as const,

  project: (projectId: string) => ["project", projectId] as const,
  projectCountry: (countryId: string) => ["projectCountry", countryId] as const,

  capexAccounts: ["capexAccounts"] as const,
  /** Admin CAPEX Accounts: the whole chart, any status, and the contract references. */
  adminCapexAccounts: ["adminCapexAccounts"] as const,
  adminCapexContractRefs: ["adminCapexContractRefs"] as const,
  /** Admin Default Checklists: scopes, gates, one gate's tasks, and their approval locks. */
  checklistScopes: ["checklistScopes"] as const,
  checklistGates: ["checklistGates"] as const,
  checklistTasks: (scopeId: string, gateId: string) => ["checklistTasks", scopeId, gateId] as const,
  checklistTaskLocks: (taskIds: readonly string[]) => ["checklistTaskLocks", ...taskIds] as const,
  /** Prefix keys, for invalidating every scope/gate at once. */
  checklistTasksAll: ["checklistTasks"] as const,
  checklistTaskLocksAll: ["checklistTaskLocks"] as const,
  /** Admin Milestones: the country axis and one country's assumptions. */
  milestoneCountries: ["milestoneCountries"] as const,
  milestoneAssumptions: (countryId: string) => ["milestoneAssumptions", countryId] as const,
  milestoneAssumptionsAll: ["milestoneAssumptions"] as const,
  /** Admin Gates Approvals: the rail, the states, one scope's rows, and the Entra lookups. */
  gateCountries: ["gateCountries"] as const,
  gateStates: ["gateStates"] as const,
  gateApprovals: (countryId: string, technology: number) => ["gateApprovals", countryId, technology] as const,
  gateApprovalsAll: ["gateApprovals"] as const,
  gateScopeCountryTech: (countryId: string, technology: number) => ["gateScopeCountryTech", countryId, technology] as const,
  gateChecklistItems: (countryTechId: string) => ["gateChecklistItems", countryTechId] as const,
  gateChecklistApprovals: (itemIds: readonly string[]) => ["gateChecklistApprovals", ...itemIds] as const,
  gateChecklistApprovalsAll: ["gateChecklistApprovals"] as const,
  /** Admin Contract: the rail, one scope's BoP standard contracts, and their DevCo costs. */
  contractCountries: ["contractCountries"] as const,
  bopContracts: (countryId: string, technology: number) => ["bopContracts", countryId, technology] as const,
  bopContractsAll: ["bopContracts"] as const,
  bopDevCoCosts: (contractIds: readonly string[]) => ["bopDevCoCosts", ...contractIds] as const,
  bopDevCoCostsAll: ["bopDevCoCosts"] as const,
  /** Admin Cost: the rail, the subaccount lists, one scope's standard costs, and the lookups. */
  costCountries: ["costCountries"] as const,
  costOpexSubaccounts: ["costOpexSubaccounts"] as const,
  costLandLeaseSubaccounts: ["costLandLeaseSubaccounts"] as const,
  costOpexAssumptions: (countryId: string, technology: number) => ["costOpexAssumptions", countryId, technology] as const,
  costOpexAssumptionsAll: ["costOpexAssumptions"] as const,
  costDevexCosts: (countryId: string, technology: number) => ["costDevexCosts", countryId, technology] as const,
  costDevexCostsAll: ["costDevexCosts"] as const,
  costSpvMapping: ["costSpvMapping"] as const,
  costInflationAreas: (countryId: string) => ["costInflationAreas", countryId] as const,
  costCurrencies: ["costCurrencies"] as const,
  /** Prefix key of the Cost CAPEX screen's standard-assumption read (`useCostBook`). */
  capexStandardAssumptionsAll: ["capex-standard-assumptions"] as const,
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
  entraPeopleAll: ["entraPeople"] as const,

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
