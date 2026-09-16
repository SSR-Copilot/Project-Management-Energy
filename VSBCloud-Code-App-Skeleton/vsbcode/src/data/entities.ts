/**
 * Dataverse entity sets and column names for the tables the 23 screens actually touch.
 *
 * Logical names follow the `vsb_` publisher prefix used throughout the solution. Generate
 * the full typed surface for all 119 declared tables from the metadata endpoint before
 * production — see Stage 0 step 4 of the build sequence. This file is the hand-written
 * subset needed to make the screens run.
 */

export const ES = {
  projects: "vsb_projects",
  countries: "vsb_countries",
  projectStates: "vsb_projectstates",
  clusterStates: "vsb_clusterstates",
  projectStateTrackings: "vsb_projectstatetrackings",
  projectStateTrackingNotes: "vsb_projectstatetrackingnotes",
  projectMembers: "vsb_projectmembers",
  projectChecklists: "vsb_projectchecklists",
  projectDefaultChecklists: "vsb_projectdefaultchecklists",
  projectDefaultApprovals: "vsb_projectdefaultapprovals",
  checkListDefaultApprovals: "vsb_checklistdefaultapprovals",
  checklistCountryAndTechnologies: "vsb_checklistcountryandtechnologies",
  projectPlannings: "vsb_projectplannings",
  permits: "vsb_permits",
  aquisitionStatuses: "vsb_aquisitionstatuses",
  aquisitionTypes: "vsb_aquisitiontypes",
  gridOperators: "vsb_gridoperators",
  generatorTypeInProjects: "vsb_generatortypeinprojects",
  generatorInProjects: "vsb_generatorinprojects",
  generatorTypes: "vsb_generatortypes",
  substructureTypesInProjects: "vsb_substructuretypesinprojects",
  deviceTypesInProjects: "vsb_devicetypesinprojects",
  energyYields: "vsb_energyyields",
  estimationPriceInflations: "vsb_estimationpriceinflations",
  projectRevenues: "vsb_projectrevenues",
  balancingPrices: "vsb_balancingprices",
  negativePrices: "vsb_negativeprices",
  seasonalityValues: "vsb_seasonalityvalues",
  financingInputs: "vsb_financinginputs",
  financingInputsRepaymentAmounts: "vsb_financinginputsrepaymentamounts",
  capexCosts: "vsb_capexcosts",
  capexAccountLists: "vsb_capexaccountlists",
  capexProjectContracts: "vsb_capexprojectcontracts",
  capexComments: "vsb_capexcomments",
  opexProjectCosts: "vsb_opexprojectcosts",
  opexLandLeaseStandardAssumptions: "vsb_opexlandleasestandardassumptions",
  landLeaseProjectCosts: "vsb_landleaseprojectcosts",
  landLeasePeriods: "vsb_landleaseperiods",
  landLeaseAllocationWtgs: "vsb_landleaseallocationwtgs",
  bopProjectsContracts: "vsb_bopprojectscontracts",
  bopContractsStandardAssumptions: "vsb_bopcontractsstandardassumptions",
  contractTypes: "vsb_contracttypes",
  milestones: "vsb_milestones",
  fabricSyncJobs: "vsb_fabricsyncjobs",
  applyAndApplyAllTrackings: "vsb_applyandapplyalltrackings",
  environmentVariableValues: "environmentvariablevalues",
  environmentVariableDefinitions: "environmentvariabledefinitions",
  users: "systemusers",
  teams: "teams",
  roles: "roles",

  /* ------------------------------------------------------------------ appended
   * Added for Project General Data / Milestones / Team. Append-only: nothing
   * above this marker was changed.
   *
   * Logical names follow the same `vsb_` + lowercase-no-space plural convention as
   * the block above. Confirm each against the metadata endpoint before production —
   * these are hand-derived from the canvas data-source display names.
   */
  shareholderEntityInProjects: "vsb_shareholderentityinprojects",
  countryAreas: "vsb_countryareas",
  customChoiceValues: "vsb_customchoicevalues",
  /** `Microsoft Entra IDs` — the people-picker source on General Data and Team. */
  microsoftEntraIds: "vsb_microsoftentraids",
  milestonesStandardAssumptions: "vsb_milestonesstandardassumptions",
  projectMemberDescriptions: "vsb_projectmemberdescriptions",
  currencies: "vsb_currencies",
  revenueSubaccounts: "vsb_revenuesubaccounts",
  /**
   * `Assumptions Revenues SQL` is a SQL Server connection in the canvas app, not
   * Dataverse. The solution also ships Dataverse mirrors of the two local-tax tables
   * (`Assumptions Local Tax Germanies` / `Frances`), so the revenue assumptions are
   * assumed to be mirrored the same way. If they are not, this entity set must be
   * replaced by a custom connector call — the seed logic in
   * features/milestones/rules.ts is pure and does not care where the rows come from.
   */
  assumptionsRevenues: "vsb_assumptionsrevenues",
  assumptionsLocalTaxGermanies: "vsb_assumptionslocaltaxgermanies",
  assumptionsLocalTaxFrances: "vsb_assumptionslocaltaxfrances",
} as const;

export type EntitySet = (typeof ES)[keyof typeof ES];

/** Column projections. Never query without one — see dataClient rules. */
export const SELECT = {
  projectList: [
    "vsb_projectid", "vsb_name", "vsb_projectname", "vsb_internalprojectid", "vsb_technology",
    "vsb_totalcapacity", "vsb_plantwtgcapacity", "vsb_plantwtgcost",
    "vsb_projectstartdate", "vsb_netyieldp50", "vsb_finalinvestmentdecision",
    "_vsb_country_value", "_vsb_clusterstate_value", "statecode", "modifiedon",
  ],
  projectFull: [
    "vsb_projectid", "vsb_name", "vsb_projectname", "vsb_internalprojectid", "vsb_technology",
    "vsb_totalcapacity", "vsb_plantwtgcapacity", "vsb_plantwtgcost",
    "vsb_projectstartdate", "vsb_netyieldp50", "vsb_finalinvestmentdecision", "vsb_operationsstartdatecod",
    // `vsb_federalstate`, `vsb_postalcode` and `vsb_salesend` used to be listed here and do
    // NOT exist on vsb_Project — a `$select` naming a missing column is a hard 400, so this
    // projection could never have worked live. Nothing read them.
    "vsb_municipality", "vsb_district", "vsb_latitude",
    "vsb_longitude", "vsb_financingoptions", "vsb_salescompleted", "vsb_salesstartdate",
    "_vsb_country_value", "_vsb_clusterstate_value", "_vsb_projectmanager_value",
    "_owningbusinessunit_value", "statecode", "createdon", "modifiedon",
    // GUIDE p14/p15: the record editors print "Created By: <name>  <stamp>" and
    // "Modified By: <name>  <stamp>" in their footer, and p15 shows the modifier is often
    // the flow service account rather than a person — so the name has to be read, not
    // assumed to be the signed-in user. These two are system lookups present on every
    // Dataverse table, so widening the projection with them carries none of the risk the
    // note above describes for custom columns.
    "_createdby_value", "_modifiedby_value",
  ],

  /**
   * The Project Main Screen's portfolio grid — 13 visible columns plus the fields its
   * command gates and its cost-module lock branch on.
   *
   * A separate projection rather than a widening of `projectList`, because `projectList` is
   * `projectRepo`'s default select and therefore the projection of ~20 other call sites.
   *
   * Every name here was verified against <entity Name="vsb_Project"> in the solution
   * export's customizations.xml. Six were wrong before that check and are corrected; see the
   * note on PROJECT_MAIN_COL_UNVERIFIED in features/project-main/rules.ts for the list.
   *
   * Every read of this projection goes through `PROJECT_MAIN_COL`, so no mapper, filter
   * builder or test holds a column literal.
   */
  projectMain: [
    "vsb_projectid",
    "vsb_projectname",
    // The auto-numbered primary column. Selected because the canvas reads it as the
    // fallback seed for 'Internal Project ID'; it is not shown anywhere.
    "vsb_name",
    "vsb_shortname",
    "vsb_internalprojectid",
    "vsb_technology",
    "vsb_totalcapacity",
    "vsb_weightedmw", // canvas `WeightedMW` / the grid's `loc_wMW` — confirmed
    "vsb_approvalstates",
    "vsb_sposharepointurl", // confirmed
    "vsb_spoteamsurl", // confirmed
    // costModuleLock inputs — not grid columns
    "vsb_projectstartdate",
    "vsb_netyieldp50",
    // the five "dd.mm.yyyy" milestone columns
    "vsb_feasibilitystudies",
    "vsb_projectdevelopmentstarted",
    "vsb_applicationsubmitted",
    "vsb_legallybindingpermits",
    "vsb_construction",
    "_vsb_country_value",
    "_vsb_countryarea_value",
    "_vsb_clusterstate_value",
    "_vsb_projectmanager_value",
    "statecode",
    "modifiedon",
  ],
} as const;

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
  /** `Hedging Type` — the COD guard counts `Individual Volumes` contracts. */
  hedgingType: { individualVolumes: 952850001 },
  /** `Positions` on `Project Members` — 17 values; these two are branched on. */
  position: { projectManager: 952850006, deputyProjectManager: 952850007 },
  yesNo: { yes: 1, no: 0 },
} as const;

/** The `Countries.Key` value the terrain-size rule hard-codes (General Data rule 23). */
export const TERRAIN_SIZE_COUNTRY_KEY = "25";

/* ============================================================================ appended
 * Batch B — Project General CheckList Screen, Project Planning Screen, Grid Operator
 * Screen. Append-only: nothing above this marker was changed or reordered.
 *
 * Unlike the hand-derived block above, every name here was READ OUT of the solution
 * export (`sol/customizations.xml`) — entity `<EntitySetName>`, attribute
 * `<LogicalName>` and global `<optionset>` option values. Where a name here disagrees
 * with one above, this one is the metadata truth and the divergence is called out.
 * ========================================================================== */

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

/**
 * Option-set values for Batch B, transcribed from the global `<optionset>` definitions.
 *
 * `CHOICE.approvalClusterState` above stops at Completed; the CheckList screen branches
 * on all eight values, so the full set is repeated here rather than mutated in place.
 */
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

/* ============================================================================ appended
 * Batch C — Project Generators Screen and Project Production Screen.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * Every entity-set name and column here was READ OUT of `sol/customizations.xml`
 * (`<EntitySetName>`, attribute `PhysicalName`, global `<optionset>` option values), not
 * derived from a canvas display name. Where a name here disagrees with one above, this
 * one is the metadata truth and the divergence is called out on the constant.
 * ========================================================================== */

/**
 * Entity sets for the seven "type in project" plant catalogues and their satellites.
 *
 * `ES.substructureTypesInProjects` above is `vsb_substructuretypesinprojects`; the real
 * set is `vsb_substructuretypeinprojects` (singular `type`). `ES_PLANT` is authoritative.
 */
export const ES_PLANT = {
  /** `Generators` — the WTG model catalogue. */
  generators: "vsb_generators",
  generatorTypeInProjects: "vsb_generatortypeinprojects",
  generatorInProjects: "vsb_generatorinprojects",
  pvModuleTypeInProjects: "vsb_pvmoduletypeinprojects",
  inverterTypeInProjects: "vsb_invertertypeinprojects",
  /** NOT `…typesinprojects` — see the note on ES_PLANT. */
  substructureTypeInProjects: "vsb_substructuretypeinprojects",
  storageTypeInProjects: "vsb_storagetypeinprojects",
  hydrogenTypeInProjects: "vsb_hydrogentypeinprojects",
  substationTypeInProjects: "vsb_substationtypeinprojects",
  deviceTypesInProjects: "vsb_devicetypesinprojects",
  /** `Device Costs` — `gblDiviceCoststConstants` (Modules / Inverter / Mounting …). */
  deviceCosts: "vsb_devicecosts",
  landLeaseAllocationWtgs: "vsb_landleaseallocationwtgs",
  landLeaseProjectCosts: "vsb_landleaseprojectcosts",
  landLeasePeriods: "vsb_landleaseperiods",
  landLeaseSubaccounts: "vsb_landleasesubaccounts",
  opexProjectCosts: "vsb_opexprojectcosts",
  opexSubaccounts: "vsb_opexsubaccounts",
  estimationPriceInflations: "vsb_estimationpriceinflations",
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
  energyYields: "vsb_energyyields",
  /** Shared by WTG and PV. Legacy name. */
  seasonalityValues: "vsb_pvseasonalityvalueses",
  /** Shared by WTG and PV. Legacy name. */
  negativePrices: "vsb_pvnegativepriceses",
  projectRevenues: "vsb_projectrevenues",
  opexLandLeaseStandardAssumptions: "vsb_opexlandleasestandardassumptionses",
  countryInflationProfiles: "vsb_countryinflationprofiles",
} as const;

/** Option-set values for Batch C, transcribed from the global `<optionset>` definitions. */
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

/* ============================================================================ appended
 * Batch D — Project Revenues Screen and Project Finance Screen.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * Every entity-set name, attribute logical name and option-set value in this block was
 * READ OUT of the solution export (`sol/customizations.xml`): entity `<EntitySetName>`,
 * attribute `<LogicalName>`, global `<optionset Name="…">` option values and the
 * `statecode` `<states>` block. Nothing here is derived from a canvas display name.
 * ========================================================================== */

/** Entity sets for the revenue and financing tables. */
export const ES_FINANCE = {
  projectRevenues: "vsb_projectrevenues",
  balancingPrices: "vsb_balancingprices",
  /** One row per contract year of an `Individual Volumes` hedge. */
  revenueIndividualHedgeVolumes: "vsb_revenueindividualhedgevolumes",
  financingInputs: "vsb_financinginputs",
  financingInputsRepaymentAmounts: "vsb_financinginputsrepaymentamounts",
  /** NOTE the double plural — entity `vsb_FinancingInputStepUpmargins`. */
  financingInputStepUpMargins: "vsb_financinginputstepupmarginses",
  financingCategories: "vsb_financingcategories",
  /**
   * The three Fabric/SQL sources the Finance screen reads directly from the client
   * (`Assumptions Debt SQL`, `Assumptions Banks SQL`, `AssumptionsKfWTrancheSQL`).
   * They are NOT Dataverse tables in the canvas solution. Like `ES.assumptionsRevenues`
   * these names assume the same Dataverse-mirror treatment the two local-tax tables got;
   * if the mirror does not exist they must be replaced by a custom-connector call. The
   * rules in `features/finance/rules.ts` are pure and do not care where rows come from.
   */
  assumptionsDebt: "vsb_assumptionsdebts",
  assumptionsBanks: "vsb_assumptionsbanks",
  assumptionsKfwTranches: "vsb_assumptionskfwtranches",
} as const;

/**
 * Option-set values for Batch D.
 *
 * `Status` on `Financing Inputs` and `Project Revenues` is `statecode`, not a custom
 * picklist: the state block is `0 = Active`, `1 = Inactive`, which is what
 * `'Status (Financing Inputs)'.Active` / `.Inactive` resolve to.
 */
export const CHOICE_FINANCE = {
  /** `Revenue Labels` — the contract type dropdown. There is no CfD *label*; see note. */
  revenueLabel: { fit: 952850000, ppa: 952850001 },
  /** `Hedging Type` — NOTE the 1/2/3 values, not the 952850000 band. */
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
  /** The `1 = Yes / 0 = No` two-option booleans on `Financing Inputs`. */
  yesNo: { yes: 1, no: 0 },
  /**
   * `'DSRA/DSRF Original Status Active?'` is the ONE flag on `Financing Inputs` that is
   * a 952850000-band picklist rather than a 1/0 two-option boolean. Do not fold it into
   * `yesNo` — a `1` written here is not `Yes`.
   */
  dsraOriginalStatusActive: { yes: 952850000, no: 952850001 },
  /** `IsFolded (Financing Inputs)` — labels are the strings `"true"` / `"false"`. */
  isFolded: { true: 1, false: 0 },
} as const;

/* ============================================================================ appended
 * Batch E — the six Project Management ADMIN / master-data screens
 * (Admin Project Default Checklists, Admin Project Gates Approvals, Admin CAPEX
 * Accounts, Admin Milestones, Admin Cost, Admin Contract).
 * Append-only: nothing above this marker was changed or reordered.
 *
 * These screens edit MASTER DATA, not a project. They are not project-scoped and they
 * never call `useProjectContext()`.
 * ========================================================================== */

/**
 * Entity sets the admin screens write that no earlier batch declared.
 *
 * The `…es` double plural is the same Dataverse pluralisation trap `ES_PROCESS` documents:
 * an entity whose logical name already ends in `s` gets a second `es`. Confirm each
 * against the metadata endpoint before production.
 */
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
  /** `CAPEX Project Contracts` — the delete-enablement test. */
  capexProjectContracts: "vsb_capexprojectcontracts",
  /** `Opex Subaccounts` / `Land Lease Subaccounts` — the Add-Contract-Type menus. */
  opexSubaccounts: "vsb_opexsubaccounts",
  landLeaseSubaccounts: "vsb_landleasesubaccounts",
  /** `Fabric Sync Jobs` + its two reference tables. Read-only in the shipped app. */
  fabricSyncJobs: "vsb_fabricsyncjobs",
  fabricJobTypes: "vsb_fabricjobtypes",
  jobStates: "vsb_jobstates",
  /** `Checklist Country And Technologies` — the checklists/gates scope axis. */
  checklistCountryAndTechnologies: "vsb_checklistcountryandtechnologies",
  /** `Country Inflation Profiles` — the OPEX panel's area-profile dropdown. */
  countryInflationProfiles: "vsb_countryinflationprofiles",
} as const;

/**
 * Option-set values for Batch E.
 *
 * `CHOICE_PRODUCTION.typeOfContract` already carries the five `Type Of Contract` values
 * the OPEX family keys on; they are re-exported here under the name the admin formulas
 * use (`'Contract Types'`) so the admin code reads like the Power Fx it replaces.
 */
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
  /** `Thresholds` — only `Individual` is branched on. */
  thresholdType: { individual: 952850000, portfolio: 952850001 },
  /** `'BoP Contract Types'` — the two ten-contract families. */
  bopContractTypes: { development: 952850000, construction: 952850001 },
  /** `'Contract Margin Type'`. */
  contractMarginType: { percentage: 952850000, fixedValue: 952850001 },
  /** `'Margin (BoP Contracts Standard Assumptions)'` — a Yes/No two-option boolean. */
  margin: { yes: true, no: false },
  /** `'Cost Unit'` — the DEVEX/CAPEX unit dropdown. */
  costUnit: {
    eur: 952850000, eurPerMw: 952850001, eurPerWtg: 952850002,
    pln: 952850003, plnPerMw: 952850004, plnPerWtg: 952850005,
  },
  /** `'Cost paid type'` — everything except None is offered. */
  costPaidType: { none: 952850000, spv: 952850001, devCo: 952850002, shared: 952850003 },
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

/* ============================================================================ appended
 * Batch F — the five PROJECT COSTS app screens (Capex Costs, Opex Costs in both rail
 * modes, Land Lease Costs, Contracts, Add Costs from Table).
 * Append-only: nothing above this marker was changed or reordered.
 *
 * Every entity-set name, attribute logical name and option-set value in this block was
 * READ OUT of the solution export (`sol/customizations.xml`): entity `<EntitySetName>`,
 * attribute `<LogicalName>` and global `<optionset Name="…">` option values. Where a name
 * or value here disagrees with an earlier block, THIS one is the metadata truth and the
 * divergence is called out on the constant.
 * ========================================================================== */

/**
 * Entity sets for the Project Costs app.
 *
 * Three of these correct earlier hand-derived guesses — the Dataverse "entity name already
 * ends in s, so pluralise it again" trap that `ES_PROCESS` documents:
 *   · `ES.capexComments` = `vsb_capexcomments`         → really `vsb_capexcommentses`
 *   · `ES.bopProjectsContracts` = `vsb_bopprojectscontracts`
 *                                                      → really `vsb_bopprojectscontractses`
 *   · `ES.opexLandLeaseStandardAssumptions` (no `es`)  → see `ES_ADMIN`, which is right.
 * The wrong spellings would 404; use `ES_COST`.
 */
export const ES_COST = {
  /** `CAPEX Account Lists` — the three-level chart of accounts. */
  capexAccountLists: "vsb_capexaccountlists",
  /** `CAPEX Project Contracts` — one row per cost line under a sub-account. */
  capexProjectContracts: "vsb_capexprojectcontracts",
  /** `CAPEX Costs` — one row per (contract, year, month). */
  capexCosts: "vsb_capexcosts",
  /** `Capex Comments` — the threaded comment table. NOTE the double plural. */
  capexComments: "vsb_capexcommentses",
  /** `Devex/Capex Standard Assumptions` — the standard-contract catalogue. */
  devexCapexStandardAssumptions: "vsb_devexcapexstandardassumptionses",
  /** `Milestones Standard Assumptions` — the synthesised cluster durations. */
  milestonesStandardAssumptions: "vsb_milestonesstandardassumptionses",
  /** `SPVDevCo Mapping Capex Devexes` — default DevCo/SPV per sub-account. */
  spvDevCoMappingCapexDevexes: "vsb_spvdevcomappingcapexdevexes",

  /** `Opex Accounts` — two rows; O&M is first by `Order`, Other OPEX last. */
  opexAccounts: "vsb_opexaccounts",
  opexSubaccounts: "vsb_opexsubaccounts",
  opexProjectCosts: "vsb_opexprojectcosts",

  landLeaseSubaccounts: "vsb_landleasesubaccounts",
  landLeaseProjectCosts: "vsb_landleaseprojectcosts",
  landLeasePeriods: "vsb_landleaseperiods",
  landLeaseAllocationWtgs: "vsb_landleaseallocationwtgs",

  /** `BoP Projects Contracts` — the BoP contract rows. NOTE the double plural. */
  bopProjectsContracts: "vsb_bopprojectscontractses",
  /** `BoP Contracts Payment Targets` — percentage milestones under a contract. */
  bopContractsPaymentTargets: "vsb_bopcontractspaymenttargetses",
  /** `BoP Contracts DevCo Costs` — the contract↔level-3-CAPEX-account join. */
  bopContractsDevCoCosts: "vsb_bopcontractsdevcocostses",
  /**
   * `Assumptions BoP Contracts` — the app's ONLY connected source (Fabric/SQL), read by
   * the Contracts screen for margin defaults. It is not a Dataverse table in the canvas
   * solution; this name assumes the same Dataverse-mirror treatment `ES.assumptionsRevenues`
   * and `ES_FINANCE.assumptionsDebt` got. If the mirror does not exist it must be replaced
   * by a connected-source call — `features/contracts/rules.ts` is pure and does not care
   * where the rows come from.
   */
  assumptionsBopContracts: "vsb_assumptionsbopcontracts",

  countryInflationProfiles: "vsb_countryinflationprofiles",
  clusterStates: "vsb_clusterstates",
} as const;

/**
 * Option-set values for the Project Costs app.
 *
 * TWO CORRECTIONS to `CHOICE_ADMIN`, both read out of the global `<optionset>` blocks:
 *  · `CHOICE_ADMIN.costPaidType` has `spv: 952850001, devCo: 952850002` and an invented
 *    `shared`. The `Cost paid type` set is `None 952850000, DevCo 952850001, SPV 952850002`
 *    and has no Shared. The two are SWAPPED — writing `CHOICE_ADMIN.costPaidType.devCo`
 *    on a `CAPEX Project Contracts` row stores SPV.
 *  · `CHOICE_ADMIN.bopContractTypes` has `development: 952850000, construction: 952850001`.
 *    The `BoP Contract Types` set is `None 952850000, Development 952850001,
 *    Construction 952850002, Project Rights 952850003`.
 * The admin screens are not mine to change; `CHOICE_COST` is what the cost screens use.
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
