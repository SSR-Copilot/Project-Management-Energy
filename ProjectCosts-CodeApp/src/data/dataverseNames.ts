/**
 * Dataverse names the Administration and Project Management rules depend on: entity sets,
 * option-set (choice) values and the fixed row keys the canvas formulas compare against.
 *
 * ProjectCosts-CodeApp concept (README "Conventions", ProjectDocs/instructions/MIGRATION-STRATEGY.md step 3):
 * names resolve through `ProjectDocs/reference/dataverse-entities.json` /
 * `dataverse-attributes.json`, and a table is only READ once it is registered with
 * `pac code add-data-source` (its generated service in `src/generated/` is then used through
 * `data/client.ts`). Nothing here performs I/O; this module is constants only.
 *
 * Entity sets: 43 verified against the reference, 1 corrected to it,
 * 3 not in the reference (marked UNVERIFIED below).
 * Column lists (`$select`) are deliberately NOT here: each screen's data layer declares its
 * own when it is connected.
 */

export const ES = {
  checklistCountryAndTechnologies: "vsb_checklistcountryandtechnologies",
  /** Corrected to ProjectDocs/reference/dataverse-entities.json (logical `vsb_projectmembers`); was "vsb_projectmembers". */
  projectMembers: "vsb_projectmemberses",
  fabricSyncJobs: "vsb_fabricsyncjobs",
  /** `Fabric Job Types` — registered 19 Oct 2026 (D26) for the `'Job Type'.Name` filter. */
  fabricJobTypes: "vsb_fabricjobtypes",
  capexProjectContracts: "vsb_capexprojectcontracts",
  countryInflationProfiles: "vsb_countryinflationprofiles",
  estimationPriceInflations: "vsb_estimationpriceinflations",
  landLeasePeriods: "vsb_landleaseperiods",
  landLeaseAllocationWtgs: "vsb_landleaseallocationwtgs",
  deviceCosts: "vsb_devicecosts",
  projects: "vsb_projects",
  countries: "vsb_countries",
  projectStates: "vsb_projectstates",
  projectStateTrackings: "vsb_projectstatetrackings",
  projectStateTrackingNotes: "vsb_projectstatetrackingnotes",
  projectChecklists: "vsb_projectchecklists",
  projectPlannings: "vsb_projectplannings",
  permits: "vsb_permits",
  aquisitionStatuses: "vsb_aquisitionstatuses",
  aquisitionTypes: "vsb_aquisitiontypes",
  gridOperators: "vsb_gridoperators",
  generatorTypeInProjects: "vsb_generatortypeinprojects",
  projectRevenues: "vsb_projectrevenues",
  /**
   * The canvas `ShareholderEntityInProjects` = entity `vsb_shareholderentitiy`, entity set
   * `vsb_shareholderentitiies`. VERIFIED with `pac code add-data-source` (19 Oct 2026, D25); it
   * was the unverified "vsb_shareholderentityinprojects".
   */
  shareholderEntityInProjects: "vsb_shareholderentitiies",
  countryAreas: "vsb_countryareas",
  customChoiceValues: "vsb_customchoicevalues",
  /** `Microsoft Entra IDs` — the people-picker source on General Data and Team. */
  /** UNVERIFIED — not in ProjectDocs/reference/dataverse-entities.json; confirm with `pac code add-data-source`. */
  microsoftEntraIds: "vsb_microsoftentraids",
  /**
   * `'Microsoft Entra IDs'` as REGISTERED: the virtual table `aaduser`, entity set `aadusers`
   * (`power.config.json` key `microsoftentraids`). Used by Admin Gates Approvals (D22); the
   * not-yet-connected screens above still name `microsoftEntraIds`.
   */
  aadUsers: "aadusers",
  /** Corrected to ProjectDocs/reference/dataverse-entities.json (logical `vsb_projectmemberdescriptions`); was "vsb_projectmemberdescriptions". */
  projectMemberDescriptions: "vsb_projectmemberdescriptionses",
  /**
   * The canvas `Currencies` data source is the SYSTEM table `transactioncurrencies`
   * (`References/DataSources.json`; registered in `power.config.json`). Corrected 19 Oct 2026
   * (D24); it was the unverified "vsb_currencies".
   */
  currencies: "transactioncurrencies",
  revenueSubaccounts: "vsb_revenuesubaccounts",
  assumptionsLocalTaxGermanies: "vsb_assumptionslocaltaxgermanies",
  assumptionsLocalTaxFrances: "vsb_assumptionslocaltaxfrances",
} as const;

export type EntitySet = (typeof ES)[keyof typeof ES];

/** Option-set values referenced by the screens. */
export const CHOICE = {
  approvalState: {
    notStarted: 952850000,
    inProgress: 952850001,
    approved: 952850002,
    rejected: 952850003,
    cancelled: 952850004,
  },
  statecode: { active: 0, inactive: 1 },

  /* ------------------------------------------------------------------ appended */

  /**
   * `Approval Cluster States` — written by the Start-Cluster tracking rebuild on
   * General Data (rule 33) and by PerformRequestofGateApprovalCancellation, which
   * sets `vsb_approvalclusterstate` to 952850001.
   */
  approvalClusterState: {
    notStarted: 952850000,
    inProgress: 952850001,
    completed: 952850002,
  },
  /** `Development Type` — the two values quoted in the General Data spec. */
  developmentType: {
    acquiredProject: 952850000,
    ownDevelopment: 952850001,
  },
  /**
   * `Cluster States` (`vsb_startcluster`). The option-set value IS the cluster
   * number, so the seven-arm `Switch` the canvas repeats five times is an identity
   * map — see `startClusterNo` in features/general-data/rules.ts.
   */
  clusterState: {
    greenfield: 0, cluster1: 1, cluster2: 2, cluster3: 3,
    cluster4: 4, cluster5: 5, cluster6: 6,
  },
  /** `Shareholder Entitiy Types` — only Third Party is branched on. */
  shareholderEntityType: { thirdParty: 952850017 },
  /** `Revenue Labels` — used by the default `Project Revenues` seed. */
  revenueLabel: { fit: 952850000, ppa: 952850001 },
  /*
   * `Hedging Type` lives in `CHOICE_FINANCE.hedgingType` (1 / 2 / 3, pinned to the generated
   * `Vsb_projectrevenuesvsb_hedgetype` by UT-REV-120). The copy that stood here said
   * `individualVolumes: 952850001`, which is no value of that option set; it had no remaining
   * user and was removed (D33).
   */
  /** `Positions` on `Project Members` — 17 values; these two are branched on. */
  position: { projectManager: 952850006, deputyProjectManager: 952850007 },
  yesNo: { yes: 1, no: 0 },
} as const;

/** The `Countries.Key` value the terrain-size rule hard-codes (General Data rule 23). */
export const TERRAIN_SIZE_COUNTRY_KEY = "25";

/**
 * Entity sets whose real names differ from, or are missing from, `ES` above.
 *
 * The three `…es`-suffixed sets are the ones the canvas data sources hide behind their
 * display names: Dataverse pluralised entities that already end in `s` a second time.
 * `ES.projectDefaultChecklists` / `.projectDefaultApprovals` / `.checkListDefaultApprovals`
 * above are missing that suffix and would 404; use these instead.
 */
export const ES_PROCESS = {
  /** `Project Default Checklists` — entity `vsb_ProjectDefaultChecklists`. */
  projectDefaultChecklists: "vsb_projectdefaultchecklistses",
  /** `Project Default Approvals` — entity `vsb_ProjectDefaultApprovals` (the gate rows). */
  projectDefaultApprovals: "vsb_projectdefaultapprovalses",
  /** `Check List Default Approvals` — entity `vsb_CheckListDefaultApprovals`. */
  checkListDefaultApprovals: "vsb_checklistdefaultapprovalses",
  /** `Project Checklist Tracking Note` — the per-checklist audit note. */
  projectChecklistTrackingNotes: "vsb_projectchecklisttrackingnotes",
} as const;

export const CHOICE_PROCESS = {
  /** `Approval Cluster States` (`vsb_approvalclusterstates`) — all eight values. */
  approvalClusterState: {
    notStarted: 952850000,
    inProgress: 952850001,
    completed: 952850002,
    rejected: 952850003,
    requestCanceled: 952850004,
    abandoned: 952850005,
    /** Label is `Inactive/ On-hold`. */
    inactive: 952850006,
    canceling: 952850007,
  },
  /**
   * `Task State` (`vsb_taskstate`). NOTE the gap: In Progress is 952850002, not
   * 952850001 — the option set has no 952850001 at all.
   */
  taskState: {
    none: 952850000,
    inProgress: 952850002,
    completed: 952850003,
  },
  /** `Approval Cluster Step State` (`vsb_approvalclusterstepstate`). */
  clusterStepState: {
    portfolioManager: 952850000,
    controllingManager: 952850001,
    approvals: 952850002,
    none: 952850003,
  },
  /** `Approval Mode` (`vsb_approvalmode`) — drives the row icon and the panel shape. */
  approvalMode: {
    formalApproval: 952850000,
    localApproval: 952850001,
    onlyNotifications: 952850002,
  },
  /** `Note Type` (`vsb_notetype`) on both tracking-note tables. */
  noteType: {
    none: 952850000,
    checklistItem: 952850001,
    shortTable: 952850002,
  },
  /**
   * The Yes/No/Unknown shape shared verbatim by `Cooperation`, `Repowering`,
   * `Grid Expansion Required` and `Substation construction required`.
   */
  yesNoUnknown: {
    yes: 952850000,
    no: 952850001,
    unknown: 952850002,
  },
  /** `Aquisition Status Types` (`vsb_aquisitionstatustypes`). */
  aquisitionType: {
    /** `LLAs in personam` — `gblAppConstants.AquisitionStatus.UnderLawOfObligationId`. */
    inPersonam: 952850000,
    /** `LLAs in rem` — `gblAppConstants.AquisitionStatus.InRemId`. */
    inRem: 952850001,
  },
  /** `Permit Date Type` (`vsb_permitdatetype`). */
  permitDateType: {
    plan: 952850000,
    actual: 952850001,
  },
  /** `Planning Basis Category` (`vsb_planningbasiscategory`). */
  planningBasisCategory: {
    exists: 952850000,
    partial: 952850001,
    none: 952850002,
  },
  /** `Technology` (`vsb_technology`) — the checklist template filter. */
  technology: {
    wind: 952850000, pv: 952850001, hybrid: 952850002, bess: 952850003,
    hydrogen: 952850004, hydro: 952850005, substation: 952850006,
  },
} as const;

/** `gblAppConstants.DefaultMaxLength` / `.DefaultLongMaxLength`. */
export const TEXT_MAX_LENGTH = { default: 55, long: 300 } as const;

/**
 * Entity sets for the seven "type in project" plant catalogues and their satellites.
 *
 * `ES.substructureTypesInProjects` above is `vsb_substructuretypesinprojects`; the real
 * set is `vsb_substructuretypeinprojects` (singular `type`). `ES_PLANT` is authoritative.
 */
export const ES_PLANT = {
  inverterTypeInProjects: "vsb_invertertypeinprojects",
  substructureTypeInProjects: "vsb_substructuretypeinprojects",
  storageTypeInProjects: "vsb_storagetypeinprojects",
  hydrogenTypeInProjects: "vsb_hydrogentypeinprojects",
  substationTypeInProjects: "vsb_substationtypeinprojects",
  /** `Generators` — the WTG model catalogue. */
  generators: "vsb_generators",
  generatorTypeInProjects: "vsb_generatortypeinprojects",
  generatorInProjects: "vsb_generatorinprojects",
  pvModuleTypeInProjects: "vsb_pvmoduletypeinprojects",
  deviceTypesInProjects: "vsb_devicetypesinprojects",
  landLeaseProjectCosts: "vsb_landleaseprojectcosts",
  landLeaseSubaccounts: "vsb_landleasesubaccounts",
  opexProjectCosts: "vsb_opexprojectcosts",
  opexSubaccounts: "vsb_opexsubaccounts",
  /** `PVModules` / `Inverters` / `Substructures` — the supplier catalogues (registered 19 Oct 2026, D27). */
  pvModules: "vsb_pvmodules",
  inverters: "vsb_inverters",
  substructures: "vsb_substructures",
} as const;

/**
 * Entity sets for the Production screen.
 *
 * `PV Seasonality Values` and `PV Negative Prices` are NOT PV-only: the WTG save path
 * writes the same two tables with the same `vsb_PVEnergyYield` lookup (source ambiguity
 * 3). The only discriminator is the parent `Energy Yields.Type`. One repository each,
 * named without the `pv` prefix — see `seasonalityRepo` / `negativePriceRepo`.
 */
export const ES_PRODUCTION = {
  seasonalityValues: "vsb_pvseasonalityvalueses",
  negativePrices: "vsb_pvnegativepriceses",
  energyYields: "vsb_energyyields",
} as const;

export const CHOICE_PLANT = {
  /**
   * `vsb_requestpermissionstate` — `gblAppConstants.RequestPermission`.
   * The metadata labels read "Request Approved/Declined/Pending/Canceled"; the canvas
   * constant names say "Permission…". Same four values.
   */
  requestPermissionState: {
    approved: 952850000,
    declined: 952850001,
    pending: 952850002,
    canceled: 952850003,
  },
  /** `gblAppConstants.ModuleType` — the `RequestModulePermission` discriminator. */
  moduleType: {
    generator: 952850000,
    pvModule: 952850001,
    inverter: 952850002,
    substructure: 952850003,
  },
  /** `statecode` on every `…TypeInProject` and on `GeneratorInProjects`. */
  status: { active: 0, inactive: 1 },
} as const;

/** Option-set values the Production screen branches on. */
export const CHOICE_PRODUCTION = {
  /** `vsb_yieldtype` — note the non-standard 100/200 values. */
  yieldType: { wtg: 100, pv: 200 },
  /** `vsb_yieldassessment`. */
  yieldAssessment: { internal: 200, external: 300 },
  /** `vsb_yieldallocation`. */
  yieldAllocation: { wholePlant: 100, eachTurbine: 200 },
  /**
   * The three radio pairs are two-option BOOLEAN columns, not picklists:
   *   vsb_productionallocation             1 = Input Gross Yield, 0 = Input Irradation
   *   vsb_productionlossesp50              1 = Input Net Yield p50, 0 = Input losses
   *   vsb_productionuncertaintyp75andp90   1 = Input Net Yield p75/p90, 0 = Input Uncertainty
   * The label "Input Irradation" is misspelled in the option set; reproduce the VALUE.
   */
  productionAllocation: { inputIrradiation: false, inputGrossYield: true },
  productionLossesP50: { inputLosses: false, inputNetYieldP50: true },
  productionUncertainty: { inputUncertainty: false, inputNetYieldP75P90: true },
  /** `vsb_opexlandleaseperiod` — the assumptions side (10 periods). */
  opexLandLeasePeriod: {
    period1: 952850000, period2: 952850001, period3: 952850002, period4: 952850003,
    period5: 952850004, period6: 952850005, period7: 952850006, period8: 952850007,
    period9: 952850008, period10: 952850009,
  },
  /** `vsb_landleaseperiod` — the child side (9 periods; there is no Period 10). */
  landLeasePeriod: {
    period1: 952850000, period2: 952850001, period3: 952850002, period4: 952850003,
    period5: 952850004, period6: 952850005, period7: 952850006, period8: 952850007,
    period9: 952850008,
  },
  /** `vsb_typeofcontract` — note BoP's out-of-band value. */
  typeOfContract: {
    landlease: 952850000, opexOandM: 952850001, opexOther: 952850002,
    devexCapex: 952850003, bop: 128470001,
  },
  /** `vsb_opexaggregation` and `vsb_landleaseaggregation` share the same three values. */
  aggregation: { sum: 952850000, max: 952850001, min: 952850002 },
  /** `vsb_landleasesecured` — NOT the 1/0 two-option used by the assumptions table. */
  landLeaseSecured: { yes: 952850000, no: 952850001 },
} as const;

/** The `Opex Subaccounts.Name` the O&M generator looks up by literal string. */
export const OANDM_SUBACCOUNT_NAME = "Operation & Maintenance";

/** Entity sets for the revenue and financing tables. */
export const ES_FINANCE = {
  financingInputsRepaymentAmounts: "vsb_financinginputsrepaymentamounts",
  financingInputStepUpMargins: "vsb_financinginputstepupmarginses",
  balancingPrices: "vsb_balancingprices",
  revenueIndividualHedgeVolumes: "vsb_revenueindividualhedgevolumes",
  projectRevenues: "vsb_projectrevenues",
  financingInputs: "vsb_financinginputs",
  financingCategories: "vsb_financingcategories",
} as const;

export const CHOICE_FINANCE = {
  /** `Revenue Labels` — the contract type dropdown. There is no CfD *label*; see note. */
  revenueLabel: { fit: 952850000, ppa: 952850001 },
  /**
   * `Hedging Type` (`vsb_hedgetype`) — NOTE the 1/2/3 values, not the 952850000 band. Pinned to
   * the generated `Vsb_projectrevenuesvsb_hedgetype` by UT-REV-120 (D33).
   */
  hedgingType: {
    hedgedVolumePercent: 1,
    fixedVolumePerYear: 2,
    individualVolumes: 3,
  },
  /** `Periods` — the ten balancing-price periods. */
  periods: {
    period1: 952850000, period2: 952850001, period3: 952850002, period4: 952850003,
    period5: 952850004, period6: 952850005, period7: 952850006, period8: 952850007,
    period9: 952850008, period10: 952850009,
  },
  /** `Financing Options` on `Projects`. */
  financingOptions: { allEquity: 952850000, debtFinancing: 952850001 },
  /** `Senior Debt Tranche Status ` — note the trailing space in the option-set name. */
  trancheStatus: {
    standardAssumption: 952850000, termSheet: 952850001, creditAgreement: 952850002,
  },
  /** `Gearing Options` */
  gearing: { debtSizing: 952850000, fixedAmount: 952850001 },
  /** `Upfront Fee` */
  upfrontFee: { percentageOfDebt: 952850000, fixed: 952850001 },
  /** `Fixed Amount Options` */
  fixedAmount: { percentOfCapex: 952850000, fixedValue: 952850001 },
  /** `Free Equity Options` */
  freeEquity: { percentage: 952850000, fixedValue: 952850001 },
  /** `VAT Facility Amount Options` */
  vatFacilityAmount: { calculated: 952850000, individual: 952850001 },
  /** `Drawdown Options` */
  drawdown: { equityFirst: 952850000, proRata: 952850001 },
  /** `Commitment Fee Options` */
  commitmentFee: { percentageOfMargin: 952850000, percentage: 952850001 },
  /** `Repayment Profile` — NOTE Straight Line is 0, DSCR Sculpted 1, Individual 2. */
  repaymentProfile: {
    straightLine: 952850000, dscrSculpted: 952850001, individual: 952850002,
  },
  /** `Spot Curve Options` — NOTE Average sits BETWEEN Low and Central. */
  spotCurve: {
    lowCurve: 952850000, averageLowCentralCurve: 952850001, centralCurve: 952850002,
  },
  /** `Energy Yield (Debt Sizing)` */
  energyYieldDebtSizing: { p50: 952850000, p75: 952850001, p90: 952850002 },
  /** `Base Rate Options` */
  baseRate: {
    euribor1M: 952850000, euribor3M: 952850001, euribor6M: 952850002,
    wibor1M: 952850003, wibor3M: 952850004, wibor6M: 952850005,
  },
  /** `Type (DSRA/DSRF)` — NOTE DSRF is 0 and DSRA is 1. */
  dsraDsrfType: { dsrf: 952850000, dsra: 952850001 },
  /** `Costs of Decommissioning` — NOTE Per Turbine is 0 and Total is 1. */
  costsOfDecommissioning: { perTurbine: 952850000, total: 952850001 },
  /** `Technology` on `Projects`. */
  technology: {
    wind: 952850000, pv: 952850001, hybrid: 952850002, bess: 952850003,
    hydrogen: 952850004, hydro: 952850005, substation: 952850006,
  },
  /**
   * `statecode` on `Financing Inputs` / `Project Revenues` —
   * `'Status (Financing Inputs)'.Active` / `.Inactive`.
   */
  status: { active: 0, inactive: 1 },
  /**
   * The two-option booleans on `Financing Inputs` (`Is Deactivated By Button`, `KfW Tranche`,
   * `Track Status Active?`, `Step Up Bank Margin`, `Swap After Fixed Period`). The Web API
   * returns and takes them as `true` / `false` — the generated `Vsb_financinginputsBase` types them
   * `boolean`. Corrected 20 Oct 2026 (D34): this was `1` / `0`, which no row ever carried, so every
   * comparison read "No". Pinned to the generated model by UT-FIN-200.
   */
  yesNo: { yes: true, no: false },
  /**
   * `'DSRA/DSRF Original Status Active?'` is the ONE flag on `Financing Inputs` that is
   * a 952850000-band picklist rather than a 1/0 two-option boolean. Do not fold it into
   * `yesNo` — a `1` written here is not `Yes`.
   */
  dsraOriginalStatusActive: { yes: 952850000, no: 952850001 },
  /** `IsFolded (Financing Inputs)` — a two-option boolean (labels `"true"` / `"false"`); see `yesNo` (D34). */
  isFolded: { true: true, false: false },
} as const;

export const ES_ADMIN = {
  /** `Devex/Capex Standard Assumptions` — Admin Cost Screen, DEVEX/CAPEX family. */
  devexCapexStandardAssumptions: "vsb_devexcapexstandardassumptionses",
  /** `OPEX & Land Lease Standard Assumptions` — the three OPEX families. */
  opexLandLeaseStandardAssumptions: "vsb_opexlandleasestandardassumptionses",
  /** `BoP Contracts Standard Assumptions` — Admin Contract Screen parent rows. */
  bopContractsStandardAssumptions: "vsb_bopcontractsstandardassumptionses",
  /** `BoP Contracts Standard Assumption DevCo Costs` — the owned CAPEX subaccounts. */
  bopDevCoCosts: "vsb_bopcontractsstandardassumptiondevcocostses",
  /** `Apply and Apply All Trackings` — the audit row every Apply writes. */
  applyAndApplyAllTrackings: "vsb_applyandapplyalltrackings",
  /** `Milestones Standard Assumptions` — Admin Milestones Screen. */
  milestonesStandardAssumptions: "vsb_milestonesstandardassumptionses",
  /** `CAPEX Account Lists` — the self-referencing chart of accounts. */
  capexAccountLists: "vsb_capexaccountlists",
  /** `CAPEX Costs` — the deactivation cascade's victim. */
  capexCosts: "vsb_capexcosts",
  /** `Opex Accounts` — Admin Cost reads `Account.Order` for the O&M split. */
  opexAccounts: "vsb_opexaccounts",
  /** `SPVDevCo Mapping Capex Devexes` — Admin Cost's Cost Paid By default. */
  spvDevCoMapping: "vsb_spvdevcomappingcapexdevexes",
} as const;

export const CHOICE_ADMIN = {
  /** `'Contract Types'` — the four cost families plus BoP. Note BoP's out-of-band value. */
  contractTypes: {
    landlease: 952850000, opexOandM: 952850001, opexOther: 952850002,
    devexCapex: 952850003, bop: 128470001,
  },
  /**
   * `'Cost Type'` as `SynchronizeStandardAssumptionCosts` receives it — a STRING carrying
   * the option-set number. That is a serialisation accident at the call site, not a
   * contract; the custom-API replacement takes the enum. Kept so the wrapper can be
   * called exactly as the canvas would have.
   */
  costTypeWireValue: {
    landlease: "952850000", opexOandM: "952850001",
    opexOther: "952850002", devexCapex: "952850003",
  },
  /** `'Action? (Apply and Apply All Trackings)'`. */
  applyAction: { apply: 952850000, applyAll: 952850001 },
  /** `'Status (Project Default Checklists)'` and `'Status Reason (…)'` — statecode pairs. */
  status: { active: 0, inactive: 1 },
  statusReason: { active: 1, inactive: 2 },
  /** `'Status (CAPEX Account Lists)'`. */
  capexAccountStatus: { active: 0, inactive: 1 },
  /** `'IsLastPeriod? (OPEX & Land Lease Standard Assumptions)'` — a two-option boolean. */
  isLastPeriod: { yes: true, no: false },
  /** `'Secured (OPEX & Land Lease Standard Assumptions)'` — a two-option boolean. */
  secured: { yes: true, no: false },
  /** `Thresholds` (`vsb_thresholds`). Corrected 19 Oct 2026 (D24): there is no Portfolio value. */
  thresholdType: { netYieldP75: 952850000, netYieldP90: 952850001, individual: 952850002 },
  /**
   * `'BoP Contract Types'` (global set `vsb_contracttypes`). Corrected 19 Oct 2026 (D23): the
   * values were shifted down by one (`development: 952850000`, which is None).
   */
  bopContractTypes: {
    none: 952850000, development: 952850001,
    construction: 952850002, projectRights: 952850003,
  },
  /** `'Contract Margin Type'`. */
  contractMarginType: { percentage: 952850000, fixedValue: 952850001 },
  /** `'Margin (BoP Contracts Standard Assumptions)'` — a Yes/No two-option boolean. */
  margin: { yes: true, no: false },
  /** `'Cost Unit'` — the DEVEX/CAPEX unit dropdown. */
  costUnit: {
    eur: 952850000, eurPerMw: 952850001, eurPerWtg: 952850002,
    pln: 952850003, plnPerMw: 952850004, plnPerWtg: 952850005,
  },
  /**
   * `'Cost paid type'` (`vsb_costpaidtype`). Corrected 19 Oct 2026 (D24): DevCo and SPV were
   * swapped and an invented `shared` was listed.
   */
  costPaidType: { none: 952850000, devCo: 952850001, spv: 952850002 },
  /** `'Job States'` — the three states the recalculating badge reads. */
  jobStates: {
    dirty: 952850000, inProgress: 952850001, inDelay: 952850002,
    importing: 952850003, done: 952850004,
  },
  /** `Technology` — same seven values as CHOICE_PROCESS.technology, repeated for clarity. */
  technology: {
    wind: 952850000, pv: 952850001, hybrid: 952850002, bess: 952850003,
    hydrogen: 952850004, hydro: 952850005, substation: 952850006,
  },
} as const;

/**
 * Magic CAPEX account numbers that appear as literals in the admin formulas.
 *  · `"00001"` — the root whose children are the cost CATEGORIES.
 *  · `"10005"` — a second root, used only by the CAPEX Accounts command bar's
 *    reorder-enablement count.
 *  · `"10006"` — excluded by the Admin Contract screen's tree builder.
 */
export const CAPEX_ROOT_NUMBER = "00001";

export const CAPEX_SECOND_ROOT_NUMBER = "10005";

export const CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER = "10006";

/**
 * The two magic `Name` discriminators on `Milestones Standard Assumptions`. There is no
 * flag column — the row's NAME is the type.
 */
export const MILESTONE_ROW_NAME = {
  duration: "average duration [months]",
  successRate: "success rate [-]",
} as const;

/**
 * Option-set values for the Project Costs app.
 *
 * `CHOICE_ADMIN.costPaidType`, `.thresholdType` (D24) and `.bopContractTypes` (D23) used to be
 * wrong; all three were corrected on 19 Oct 2026 from the global `<optionset>` blocks.
 * `CHOICE_COST` is what the cost screens use.
 */
export const CHOICE_COST = {
  /** `Distribution Type` — note Equal sorts FIRST. */
  distributionType: { equal: 952850000, individual: 952850001 },
  /** `Distribution Scheme`. */
  distributionScheme: { percentValues: 952850000, absoluteValues: 952850001 },
  /** `Cost paid type` on `CAPEX Project Contracts.'Cost Type'`. See the note above. */
  costPaidType: { none: 952850000, devCo: 952850001, spv: 952850002 },
  /** `Cost Unit` on `Devex/Capex Standard Assumptions`. */
  costUnit: {
    eur: 952850000, eurPerMw: 952850001, eurPerWtg: 952850002,
    pln: 952850003, plnPerMw: 952850004, plnPerWtg: 952850005,
  },
  /** `Initial Contract Source` — NOTE the out-of-band 5-digit values. */
  initialContractSource: { pcf: 95285, powerapps: 95289 },
  /** `Capex Comment Type` — NOTE the 1/2 values, not the 952850000 band. */
  capexCommentType: { generalComment: 1, commentsToPaymentDate: 2 },
  /** `BoP Contract Types`. See the note above. */
  bopContractTypes: {
    none: 952850000, development: 952850001,
    construction: 952850002, projectRights: 952850003,
  },
  /** `Total Costs Type [EUR]`. */
  totalCostsType: { none: 952850000, calculated: 952850001, overwrite: 952850002 },
  /** `Closing Date Type` — the Plan/Actual radio on both cost halves. */
  closingDateType: { none: 952850000, plan: 952850001, actual: 952850002 },
  /** `Contract Margin Type`. */
  contractMarginType: { percentage: 952850000, fixedValue: 952850001 },
  /** `Land Lease Period` — nine values; there is no Period 10 on the child table. */
  landLeasePeriod: {
    period1: 952850000, period2: 952850001, period3: 952850002, period4: 952850003,
    period5: 952850004, period6: 952850005, period7: 952850006, period8: 952850007,
    period9: 952850008,
  },
  /** `Opex & Land Lease Period` — TEN values on the assumptions side. */
  opexLandLeasePeriod: {
    period1: 952850000, period2: 952850001, period3: 952850002, period4: 952850003,
    period5: 952850004, period6: 952850005, period7: 952850006, period8: 952850007,
    period9: 952850008, period10: 952850009,
  },
  /** `Opex Aggregation` and `Land Lease Aggregation` share these three values. */
  aggregation: { sum: 952850000, max: 952850001, min: 952850002 },
  /** `Land Lease Secured` — a picklist, NOT the 1/0 boolean the assumptions table uses. */
  landLeaseSecured: { yes: 952850000, no: 952850001 },
  /** `Thresholds` — the OPEX threshold type. Only `individual` is branched on. */
  thresholdType: { netYieldP75: 952850000, netYieldP90: 952850001, individual: 952850002 },
  /** `Type Of Contract` — the standard-assumption family discriminator. */
  typeOfContract: {
    landlease: 952850000, opexOandM: 952850001, opexOther: 952850002,
    devexCapex: 952850003, bop: 128470001,
  },
  /**
   * The Yes/No columns on these tables are Dataverse `bit`s — booleans, not picklists.
   * `CAPEX Project Contracts.'Is Standard Contract?'` is labelled `Ja`/`Nein` (German
   * labels on an English solution); the VALUE is still 1/0.
   */
  bit: { yes: true, no: false },
  /** `statecode` on every cost table. */
  status: { active: 0, inactive: 1 },
} as const;

/**
 * `Month` on `CAPEX Costs` is the out-of-box global set `yearlymonth_options`, which is not
 * carried in `customizations.xml` (it ships with the platform). Its values are the month
 * numbers 1–12, which is also what the canvas' `[@Month].January`…`.December` resolve to.
 * Confirm against the metadata endpoint before production.
 */
export const CAPEX_MONTH_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * `colDistributionFrequency` (Cost `App.Formulas`) — five rows, IDs 1–5.
 * NOTE that the ID is not the value: ID 4 → 6 months, ID 5 → 12 months. The Opex screen
 * does not use the named formula; it redeclares these same five rows inline as
 * `locColDistributionFrequency` in its `OnVisible`.
 */
export const DISTRIBUTION_FREQUENCY: readonly { id: number; value: number; label: string }[] = [
  { id: 1, value: 1, label: "1 month" },
  { id: 2, value: 2, label: "2 months" },
  { id: 3, value: 3, label: "3 months" },
  { id: 4, value: 6, label: "6 months" },
  { id: 5, value: 12, label: "12 months" },
];

/**
 * DEAD CODE, DELIBERATELY NOT PORTED.
 *
 * `DefaultProjectCostsMarginValue = 10` is declared in the Cost app's `App.Formulas` and is
 * referenced by NO control anywhere in `Src/`. `'Capex Project Cost Margins'` appears only
 * inside commented-out lines (`//locSelectedProjectCostsMargin:LookUp('Capex Project Cost
 * Margins',…)`). There is no live CAPEX margin feature: the only margin in the app is the
 * BoP contract margin on the Contracts screen, whose defaults come from the Fabric source
 * `Assumptions BoP Contracts`.
 *
 * These constants exist so a future reader can grep for the names and find this note
 * instead of re-implementing a feature that was never shipped. If a CAPEX margin is wanted
 * it is a NEW requirement, not a port. Nothing in `src/features/*` reads them.
 */
export const DEAD_CAPEX_MARGIN = {
  /** `App.Formulas: DefaultProjectCostsMarginValue = 10` — never referenced. */
  defaultProjectCostsMarginValue: 10,
  /** `'Capex Project Cost Margins'` — every reference is commented out. */
  tableDisplayName: "Capex Project Cost Margins",
  isDead: true,
} as const;

/** The literal `Opex Accounts.Name` / `Opex Subaccounts.Name` the Opex screen compares. */
export const OPEX_MODE_NAMES = {
  oandm: "Operation & Maintenance",
  other: "Other OPEX Costs",
} as const;

/** `Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging"))` — hidden everywhere. */
export const OVERLEVERAGING = "Overleveraging";

/** The synthetic tab `App.OnStart` prepends to `colCapexAccountCategoriesNew`. */
export const CAPEX_SUMMARY_TAB_NAME = "DEVEX/CAPEX Summary";

/**
 * The checklist tables shared by Check List Settings and Project Gates (entity sets), plus the
 * business-unit set the owning-BU bind points at. Pure names: the rules of both screens use them
 * to build `@odata.bind` payloads, so they live here and not in the SDK-touching data module.
 */
export const CHECKLIST_ENTITY_SETS = {
  tasks: "vsb_projectdefaultchecklistses",
  headers: "vsb_checklistcountryandtechnologies",
  approvals: "vsb_checklistdefaultapprovalses",
  clusters: "vsb_projectstates",
  businessUnits: "businessunits",
} as const;
