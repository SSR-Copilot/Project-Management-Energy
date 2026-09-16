/** Concrete repositories for the tables the 23 screens touch. */
import { makeRepository } from "./repository";
import { ES, ES_PROCESS, ES_PLANT, ES_PRODUCTION, SELECT } from "./entities";

export interface ProjectRow {
  vsb_projectid: string;
  vsb_name: string;
  vsb_internalprojectid: string | null;
  /**
   * A Dataverse *choice*, so this is the integer `952850000` (Wind) … `952850006`, not a
   * label. It used to be declared `string | null`, which was simply untrue — see the note in
   * `features/checklist/hooks.ts` that had to work around it. Read it through
   * `technologyLabel()` to display and compare it as a number to filter.
   */
  vsb_technology: number | string | null;
  vsb_totalcapacity: number | null;
  vsb_plantwtgcapacity: number | null;
  vsb_plantwtgcost: number | null;
  vsb_projectstartdate: string | null;
  vsb_netyieldp50: number | null;
  vsb_finalinvestmentdecision: string | null;
  vsb_operationsstartdatecod?: string | null;
  vsb_municipality?: string | null;
  vsb_financingoptions?: string | null;
  _vsb_country_value: string | null;
  _vsb_clusterstate_value: string | null;
  statecode: number;
  modifiedon: string;
  [k: string]: unknown;
}

export const projectRepo = makeRepository<ProjectRow>(ES.projects, [...SELECT.projectList], {
  projectLookup: "vsb_projectid",
});
export const projectFullRepo = makeRepository<ProjectRow>(ES.projects, [...SELECT.projectFull]);

export const countryRepo = makeRepository<{ vsb_countryid: string; vsb_name: string; vsb_code: string }>(
  ES.countries, ["vsb_countryid", "vsb_name", "vsb_code"],
);
export const clusterStateRepo = makeRepository<{ vsb_clusterstateid: string; vsb_name: string; vsb_order: number }>(
  ES.clusterStates, ["vsb_clusterstateid", "vsb_name", "vsb_order"],
);
export const milestoneRepo = makeRepository<{ vsb_milestoneid: string; vsb_name: string; vsb_order: number }>(
  ES.milestones, ["vsb_milestoneid", "vsb_name", "vsb_order"],
);
export const contractTypeRepo = makeRepository<{ vsb_contracttypeid: string; vsb_name: string }>(
  ES.contractTypes, ["vsb_contracttypeid", "vsb_name"],
);

export const generatorTypeRepo = makeRepository<Record<string, unknown>>(ES.generatorTypes, [
  "vsb_generatortypeid", "vsb_name", "vsb_shortname", "vsb_ratedcapacitymw", "vsb_hubheightm",
  "vsb_rotordiameterm", "vsb_manufacturer", "vsb_earliestphaseout", "vsb_isavailable",
  "vsb_price1wtg", "vsb_price2wtg", "vsb_price3wtg", "vsb_price4wtg", "vsb_price5wtg", "statecode",
]);
export const generatorTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES.generatorTypeInProjects, [
    "vsb_generatortypeinprojectid", "_vsb_project_value", "_vsb_generatortype_value",
    "vsb_count", "vsb_ratedcapacitymw", "vsb_totalcapacitymw", "vsb_costpergeneratoreur",
    "vsb_totalcosteur", "vsb_hubheightm", "vsb_permissionstate", "statecode",
  ],
);
export const generatorInProjectRepo = makeRepository<Record<string, unknown>>(
  ES.generatorInProjects, [
    "vsb_generatorinprojectid", "_vsb_project_value", "vsb_name",
    "_vsb_generatortypeinproject_value", "vsb_latitude", "vsb_longitude", "statecode",
  ],
);
export const energyYieldRepo = makeRepository<Record<string, unknown>>(ES.energyYields, [
  "vsb_energyyieldid", "_vsb_project_value", "vsb_name", "vsb_netyieldp50", "vsb_uncertainty",
  "vsb_netyieldp75", "vsb_netyieldp90", "vsb_isactive", "vsb_assessor", "vsb_assessmentdate", "statecode",
]);
export const projectRevenueRepo = makeRepository<Record<string, unknown>>(ES.projectRevenues, [
  "vsb_projectrevenueid", "_vsb_project_value", "vsb_revenuetype", "vsb_priceeurpermwh",
  "vsb_durationyears", "vsb_inflationpercent", "vsb_isstandardassumption", "vsb_hedgingmode", "statecode",
]);
export const financingInputRepo = makeRepository<Record<string, unknown>>(ES.financingInputs, [
  "vsb_financinginputid", "_vsb_project_value", "vsb_name", "vsb_amounteur",
  "vsb_marginpercent", "vsb_tenoryears", "vsb_isstandardassumption", "statecode",
]);
export const capexCostRepo = makeRepository<Record<string, unknown>>(ES.capexCosts, [
  "vsb_capexcostid", "_vsb_project_value", "_vsb_capexaccount_value", "vsb_accountcode",
  "vsb_year", "vsb_amounteur", "vsb_isstandardassumption", "vsb_distributionfrequency", "statecode",
]);
export const capexAccountRepo = makeRepository<Record<string, unknown>>(ES.capexAccountLists, [
  "vsb_capexaccountlistid", "vsb_accountcode", "vsb_name", "vsb_parentcode", "vsb_order", "statecode",
]);
export const opexProjectCostRepo = makeRepository<Record<string, unknown>>(ES.opexProjectCosts, [
  "vsb_opexprojectcostid", "_vsb_project_value", "vsb_name", "vsb_accountname",
  "vsb_amounteurperyear", "vsb_escalationpercent", "vsb_isstandardassumption", "statecode",
]);
export const landLeaseCostRepo = makeRepository<Record<string, unknown>>(ES.landLeaseProjectCosts, [
  "vsb_landleaseprojectcostid", "_vsb_project_value", "vsb_name", "vsb_amounteurperyear",
  "vsb_escalationpercent", "statecode",
]);
export const capexProjectContractRepo = makeRepository<Record<string, unknown>>(ES.capexProjectContracts, [
  "vsb_capexprojectcontractid", "_vsb_project_value", "vsb_name", "_vsb_contracttype_value",
  "vsb_amounteur", "vsb_marginpercent", "vsb_hasmargin", "statecode",
]);
export const projectChecklistRepo = makeRepository<Record<string, unknown>>(ES.projectChecklists, [
  "vsb_projectchecklistid", "_vsb_project_value", "vsb_name", "vsb_gaterelevance",
  "vsb_approvalstate", "vsb_order", "statecode",
]);
export const projectStateTrackingRepo = makeRepository<Record<string, unknown>>(ES.projectStateTrackings, [
  "vsb_projectstatetrackingid", "_vsb_project_value", "_vsb_clusterstate_value",
  "vsb_approvalstate", "vsb_order", "statecode",
]);
export const projectMemberRepo = makeRepository<Record<string, unknown>>(ES.projectMembers, [
  "vsb_projectmemberid", "_vsb_project_value", "_vsb_user_value", "vsb_role", "vsb_comment", "statecode",
]);
export const projectPlanningRepo = makeRepository<Record<string, unknown>>(ES.projectPlannings, [
  "vsb_projectplanningid", "_vsb_project_value", "vsb_heightlimitm", "vsb_securedpercent",
  "vsb_terrainsizeha", "statecode",
]);
export const gridOperatorRepo = makeRepository<Record<string, unknown>>(ES.gridOperators, [
  "vsb_gridoperatorid", "_vsb_project_value", "vsb_name", "vsb_connectionvoltagekv",
  "vsb_gridexpansionrequired", "vsb_connectionpoint", "vsb_applicationdate", "statecode",
]);

/* ============================================================================ appended
 * Repositories for Project General Data, Project General Milestones and Project
 * General Team. Append-only: nothing above this marker was changed.
 *
 * Untyped tables return `Record<string, unknown>` per CONVENTIONS rule 10; each
 * feature narrows with a local interface and a mapper.
 * ========================================================================== */

/** `ShareholderEntityInProjects` — General Data's right panel (rules 4, 16–19, 34). */
export const shareholderEntityInProjectRepo = makeRepository<Record<string, unknown>>(
  ES.shareholderEntityInProjects, [
    "vsb_shareholderentityinprojectid", "_vsb_project_value", "vsb_shareholderentitiytype",
    "vsb_customname", "vsb_ownership", "_owningbusinessunit_value", "statecode",
  ],
);

/**
 * `Project States` — the checklist cluster rows. Drives the tracking rebuild
 * (General Data rule 33) and the milestone labels (Milestones rule 3).
 */
export const projectStateRepo = makeRepository<Record<string, unknown>>(ES.projectStates, [
  "vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist",
  "vsb_clusterdescription", "statecode",
]);

/** `Project Default Approvals` — the gate record feeding the cancellation payload. */
export const projectDefaultApprovalRepo = makeRepository<Record<string, unknown>>(
  ES.projectDefaultApprovals, [
    "vsb_projectdefaultapprovalid", "_vsb_clusterstate_value", "_vsb_portfoliomanager_value",
    "statecode",
  ],
);

/** `CountryAreas` — Area/State/Province, and the "does this country have areas?" test. */
export const countryAreaRepo = makeRepository<{
  vsb_countryareaid: string; vsb_name: string; _vsb_country_value: string;
}>(ES.countryAreas, ["vsb_countryareaid", "vsb_name", "_vsb_country_value"]);

/** `Custom Choice Values` — the terrain `Utilization` lookup. */
export const customChoiceValueRepo = makeRepository<{
  vsb_customchoicevalueid: string; vsb_name: string; vsb_category: string | null;
}>(ES.customChoiceValues, ["vsb_customchoicevalueid", "vsb_name", "vsb_category"]);

/**
 * `Microsoft Entra IDs` — the people-picker source. Searched on four columns and
 * filtered to enabled accounts (Team rule 12); the key is
 * `'A unique identifer for Microsoft Entra ID'`.
 */
export const entraIdRepo = makeRepository<Record<string, unknown>>(ES.microsoftEntraIds, [
  "vsb_microsoftentraidid", "vsb_entraid", "vsb_displayname", "vsb_givenname",
  "vsb_surname", "vsb_mail", "vsb_accountenabled",
]);

/** `Milestones Standard Assumptions` — average duration in months per cluster. */
export const milestoneAssumptionRepo = makeRepository<Record<string, unknown>>(
  ES.milestonesStandardAssumptions, [
    "vsb_milestonesstandardassumptionid", "vsb_name", "_vsb_country_value", "vsb_technology",
    "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5", "vsb_cluster6",
  ],
);

/** `Estimation Price Inflations` — the FID-driven generator re-price (Milestones rule 13). */
export const estimationPriceInflationRepo = makeRepository<{
  vsb_estimationpriceinflationid: string;
  vsb_fidyear: number;
  vsb_annualpriceescalationindex: number | null;
  vsb_accumulatedpriceescalationindex: number | null;
}>(ES.estimationPriceInflations, [
  "vsb_estimationpriceinflationid", "vsb_fidyear",
  "vsb_annualpriceescalationindex", "vsb_accumulatedpriceescalationindex",
]);

/**
 * `Assumptions Revenues SQL` — the country/technology revenue seed values.
 * Columns are the SQL ones the canvas reads: country / valuetype / category / pv / wind.
 */
export const assumptionsRevenuesRepo = makeRepository<Record<string, unknown>>(
  ES.assumptionsRevenues, ["country", "valuetype", "category", "pv", "wind"],
);

/** `Currencies` — `LookUp(Currencies, 'Currency Code' = "EUR")` for the revenue seed. */
export const currencyRepo = makeRepository<{
  vsb_currencyid: string; vsb_name: string; vsb_currencycode: string;
}>(ES.currencies, ["vsb_currencyid", "vsb_name", "vsb_currencycode"]);

/** `Revenue Subaccounts` — `First(colRevenueSubaccounts)` on the seeded contract. */
export const revenueSubaccountRepo = makeRepository<{
  vsb_revenuesubaccountid: string; vsb_name: string; vsb_order: number | null;
}>(ES.revenueSubaccounts, ["vsb_revenuesubaccountid", "vsb_name", "vsb_order"]);

/**
 * `Project Member Descriptions` — the Team panel's description dropdown.
 * Long `staleTime` at the call site: this is reference data.
 */
export const projectMemberDescriptionRepo = makeRepository<{
  vsb_projectmemberdescriptionid: string; vsb_description: string; vsb_order: number | null;
}>(ES.projectMemberDescriptions, [
  "vsb_projectmemberdescriptionid", "vsb_description", "vsb_order",
]);

/**
 * `Project Members` with the columns the Team screen actually renders.
 *
 * `projectMemberRepo` above stays as it is (append-only). This one expands the
 * `Member` and `Project Member Description` lookups so the grid can show the display
 * name and the description without an N+1.
 *
 * The legacy `Position` choice is READ (rule 4 falls back to its label for rows created
 * before the switch) but never WRITTEN — the canvas commented the write out in rule 14.
 * See `buildMemberPayload` in features/team/rules.ts.
 */
export const projectMemberFullRepo = makeRepository<Record<string, unknown>>(ES.projectMembers, [
  "vsb_projectmemberid", "_vsb_project_value", "_vsb_member_value",
  "_vsb_projectmemberdescription_value", "vsb_position", "vsb_comment", "vsb_name",
  "_owningbusinessunit_value", "statecode",
]);

/* ============================================================================ appended
 * Batch B — Project General CheckList, Project Planning, Grid Operator.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * Every column list below is the metadata truth read out of `sol/customizations.xml`
 * rather than a guess at the canvas display name. Three repositories above
 * (`projectChecklistRepo`, `projectStateTrackingRepo`, `projectPlanningRepo`,
 * `gridOperatorRepo`) project columns that do not exist on those tables; they are left
 * untouched and superseded by the `…FullRepo` versions here.
 *
 * Note the lookup shape difference: `Grid Operators` and `Aquisition Statuses` hold the
 * project on `vsb_projectid` (OData `_vsb_projectid_value`, bind `vsb_ProjectId`), while
 * `Project Checklists`, `Project State Trackings` and `Project Plannings` use
 * `vsb_project` (`_vsb_project_value`, bind `vsb_Project`). `makeRepository`'s
 * `projectLookup` option carries that difference.
 * ========================================================================== */

/** `Project State Trackings` — one row per project × cluster state (CheckList). */
export const projectStateTrackingFullRepo = makeRepository<Record<string, unknown>>(
  ES.projectStateTrackings, [
    "vsb_projectstatetrackingid", "vsb_name", "_vsb_project_value", "_vsb_clusterstate_value",
    "vsb_approvalclusterstate", "vsb_clusterstepstate", "vsb_approvalcomment",
    "vsb_approvalduedate", "vsb_flowrunid", "vsb_flowapprovalid",
    "vsb_gatemeetingcompleted", "vsb_lasttriggeredapprovalmode",
    "vsb_lasttriggeredapprovalpersonas", "_owningbusinessunit_value", "statecode",
  ],
);

/** `Project Checklists` — the per-project checklist tasks (CheckList). */
export const projectChecklistFullRepo = makeRepository<Record<string, unknown>>(
  ES.projectChecklists, [
    "vsb_projectchecklistid", "vsb_name", "_vsb_project_value", "_vsb_clusterstate_value",
    "vsb_approvalcheckliststate", "vsb_approvalstepstatecode", "vsb_approvalcomment",
    "vsb_approvalduedate", "vsb_comments", "vsb_completiondate", "vsb_flowrunid",
    "vsb_flowapprovalid", "vsb_gaterelevance", "vsb_gatemeetingcompleted",
    "vsb_holdingtaskdescription", "vsb_iscompletiondate", "vsb_order",
    "vsb_projectdefaultchecklist", "vsb_taskstate", "_owningbusinessunit_value", "statecode",
  ],
);

/** `Project State Tracking Notes` — the cluster-action audit trail. */
export const projectStateTrackingNoteRepo = makeRepository<Record<string, unknown>>(
  ES.projectStateTrackingNotes, [
    "vsb_projectstatetrackingnoteid", "vsb_name", "_vsb_projectstatetracking_value",
    "vsb_comment", "vsb_note", "vsb_notetype", "vsb_approvalinfo",
    "_owningbusinessunit_value", "createdon",
  ],
);

/** `Project Checklist Tracking Note` — the checklist-approval audit trail. */
export const projectChecklistTrackingNoteRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.projectChecklistTrackingNotes, [
    "vsb_projectchecklisttrackingnoteid", "vsb_name", "_vsb_projectchecklist_value",
    "vsb_comment", "vsb_note", "vsb_notetype", "_owningbusinessunit_value", "createdon",
  ],
);

/** `Project Default Checklists` — the checklist templates the materialisation copies. */
export const projectDefaultChecklistRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.projectDefaultChecklists, [
    "vsb_projectdefaultchecklistsid", "vsb_name", "_vsb_clusterstate_value",
    "_vsb_associatedcountryandtechnology_value", "vsb_comments", "vsb_gaterelevance",
    "vsb_holdingtaskdescription", "vsb_iscompletiondate", "vsb_order", "vsb_todelete",
    "statecode",
  ],
);

/**
 * `Project Default Approvals` — the GATE settings per cluster state.
 *
 * `projectDefaultApprovalRepo` above points at `vsb_projectdefaultapprovals`, which is
 * not the entity set name, and projects `_vsb_portfoliomanager_value`, which is not the
 * lookup's logical name (it is `vsb_approvalparticipant1`, display name
 * "Portfolio Manager"). Both are corrected here.
 */
export const projectDefaultApprovalsFullRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.projectDefaultApprovals, [
    "vsb_projectdefaultapprovalsid", "vsb_name", "_vsb_clusterstate_value",
    "_vsb_approvalscountry_value", "_vsb_approvalparticipant1_value", "vsb_technologycode",
    "vsb_approvalmodecode", "vsb_gateactive", "vsb_defaultapprovals",
    "vsb_defaultcontributors", "vsb_defaultnotifications", "statecode",
  ],
);

/** `Check List Default Approvals` — the per-checklist approval settings. */
export const checkListDefaultApprovalRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.checkListDefaultApprovals, [
    "vsb_checklistdefaultapprovalsid", "vsb_name", "_vsb_projectdefaultchecklistid_value",
    "_vsb_portfoliomanagerid_value", "vsb_approvalmodecode", "vsb_gateisactive",
    "vsb_defaultapprovers", "vsb_defaultcontributors", "vsb_defaultnotifications",
    "statecode",
  ],
);

/** `Checklist Country And Technology` — the template's country/technology pairing. */
export const checklistCountryAndTechnologyRepo = makeRepository<Record<string, unknown>>(
  ES.checklistCountryAndTechnologies, [
    "vsb_checklistcountryandtechnologyid", "vsb_name", "_vsb_country_value",
    "vsb_technology", "vsb_order",
  ],
);

/** `Project Plannings` — the single Planning form record. */
export const projectPlanningFullRepo = makeRepository<Record<string, unknown>>(
  ES.projectPlannings, [
    "vsb_projectplanningid", "vsb_name", "_vsb_project_value", "vsb_cooperation",
    "vsb_cooperationpartner", "vsb_cooperationdetails", "_vsb_legalplanninglookup_value",
    "vsb_planningbasiscategory", "_vsb_permitprocedurelookup_value",
    "vsb_planningbasisdetails", "vsb_repowering", "vsb_securedaccess",
    "vsb_repoweringdetails", "vsb_isheightlimitationforwtg", "vsb_heightlimitationm",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Permits` — the Planning General tab's sub-grid. Scoped by `Project Planning`. */
export const permitRepo = makeRepository<Record<string, unknown>>(
  ES.permits, [
    "vsb_permitid", "vsb_name", "_vsb_projectplanning_value", "vsb_submissiondate",
    "vsb_submissiondatetype", "vsb_approvaldate", "vsb_approvaldatetype",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_projectplanning_value" },
);

/** `Aquisition Statuses` — one row per acquisition type per project. */
export const aquisitionStatusRepo = makeRepository<Record<string, unknown>>(
  ES.aquisitionStatuses, [
    "vsb_aquisitionstatusid", "vsb_name", "_vsb_projectid_value",
    "_vsb_aquisitionstatustype_value", "vsb_secured", "vsb_required",
    "vsb_aquisitionstatuspercentage", "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_projectid_value" },
);

/** `Aquisition Types` — the reference template list, split by `Type`. */
export const aquisitionTypeRepo = makeRepository<Record<string, unknown>>(
  ES.aquisitionTypes, [
    "vsb_aquisitiontypeid", "vsb_name", "vsb_type", "vsb_order", "vsb_statusname",
    "statecode",
  ],
);

/**
 * `Grid Operators` — the single Grid Operator record per project.
 *
 * `gridOperatorRepo` above projects `vsb_connectionvoltagekv`, `vsb_gridexpansionrequired`,
 * `vsb_connectionpoint` and `vsb_applicationdate`; none of those columns exist. The real
 * eleven writable columns are below.
 */
export const gridOperatorFullRepo = makeRepository<Record<string, unknown>>(
  ES.gridOperators, [
    "vsb_gridoperatorid", "vsb_name", "_vsb_projectid_value", "vsb_operator",
    "vsb_voltagelevel", "vsb_expansionrequired", "vsb_expansiondetails",
    "vsb_substationconstructionrequired", "vsb_substationoperator",
    "vsb_lengthinternalcabeling", "vsb_diameterinternalcabeling",
    "vsb_lengthexternalcabeling", "vsb_diameterexternalcabeling",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_projectid_value" },
);

/**
 * `Custom Choice Values` with the columns the Planning pickers need.
 *
 * `customChoiceValueRepo` above projects `vsb_name` and `vsb_category`, neither of which
 * exists on the table — the label is `vsb_value` and the discriminator is `vsb_fieldname`.
 */
export const customChoiceValueFullRepo = makeRepository<{
  vsb_customchoicevalueid: string;
  vsb_value: string | null;
  vsb_fieldname: string | null;
  vsb_order: number | null;
  _vsb_country_value: string | null;
}>(ES.customChoiceValues, [
  "vsb_customchoicevalueid", "vsb_value", "vsb_fieldname", "vsb_order", "_vsb_country_value",
]);

/* ============================================================================ appended
 * Batch C — Project Generators Screen, Project Production Screen.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * Column lists are the metadata truth from `sol/customizations.xml`. Four repositories
 * above project columns that do not exist on their tables and are superseded here:
 *   generatorTypeRepo            (vsb_generatortypes is not the WTG catalogue at all —
 *                                 the catalogue is `Generators` / vsb_generators)
 *   generatorTypeInProjectRepo   (vsb_count / vsb_totalcosteur / vsb_permissionstate …)
 *   generatorInProjectRepo       (vsb_latitude / vsb_longitude …)
 *   energyYieldRepo              (vsb_isactive / vsb_assessor / vsb_assessmentdate …)
 * They are left untouched; use the `…FullRepo` / plant repositories below.
 *
 * `ProjectRow` above also mis-names two roll-up columns: the real ones are
 * `vsb_plantwtgcapacity` and `vsb_plantwtgcost`, without the unit suffixes. Both screens
 * write through `PROJECT_PLANT_COL` in their own rules.ts, which carries the real names.
 * ========================================================================== */

/** `Generators` — the WTG model catalogue that feeds the three cascading comboboxes. */
export const generatorCatalogRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.generators, [
    "vsb_generatorid", "vsb_name", "vsb_displayname", "vsb_supplier", "vsb_turbinetype",
    "vsb_hubheight", "vsb_rotordiameter", "vsb_specificcapacity", "vsb_totalheight",
    "vsb_earliestphaseout", "vsb_countryavailability", "vsb_foundationcostincluded",
    "vsb_additionalfoundationcost", "vsb_wtgprice", "vsb_wtgprice2", "vsb_wtgprice3",
    "vsb_wtgprice4", "vsb_wtgprice5", "statecode",
  ],
);

/** `GeneratorTypeInProjects` — the WTG type row that owns N turbines. */
export const generatorTypeInProjectFullRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.generatorTypeInProjects, [
    "vsb_generatortypeinprojectid", "vsb_name", "_vsb_project_value", "_vsb_generator_value",
    "vsb_numberofgenerators", "vsb_costperwtg", "vsb_generatorscost", "vsb_generatorscapacity",
    "vsb_requestpermissionstate", "vsb_flowrunid", "vsb_flowapprovalid",
    "_owningbusinessunit_value", "statecode",
  ],
);

/**
 * `GeneratorInProjects` — one row per physical turbine.
 *
 * The parent lookup is `vsb_ModuleTypeInProjectId`, not a project lookup: turbines hang
 * off the TYPE, and the project is reached through it. `byProject` is therefore not
 * usable here; query by `_vsb_moduletypeinprojectid_value` in the type's id list.
 */
export const generatorInProjectFullRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.generatorInProjects, [
    "vsb_generatorinprojectid", "vsb_name", "_vsb_moduletypeinprojectid_value",
    "vsb_effectivecapacity", "vsb_effectivehubheight", "vsb_effectivehubheightchanged",
    "vsb_foundationplinthm", "vsb_hubheightexclfoundationplinthm", "vsb_totalheight",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_moduletypeinprojectid_value" },
);

export const pvModuleTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.pvModuleTypeInProjects, [
    "vsb_pvmoduletypeinprojectid", "vsb_name", "_vsb_project_value", "_vsb_pvmodule_value",
    "vsb_label", "vsb_type", "vsb_othersupplier", "vsb_numberofmodules", "vsb_modulepower",
    "vsb_size", "vsb_capacity", "vsb_costperpower", "vsb_cost", "vsb_warranty",
    "vsb_degradation1styear", "vsb_degradationremainingyears",
    "vsb_requestpermissionstate", "vsb_flowrunid", "vsb_flowapprovalid",
    "_owningbusinessunit_value", "statecode",
  ],
);

export const inverterTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.inverterTypeInProjects, [
    "vsb_invertertypeinprojectid", "vsb_name", "_vsb_project_value", "_vsb_inverter_value",
    "vsb_inverterlabel", "vsb_invothersupplier", "vsb_selectedinvertertypes",
    "vsb_numberofinverters", "vsb_inverternominalpower", "vsb_costperinverter",
    "vsb_invertertypecost", "vsb_inverterwarranty",
    "vsb_requestpermissionstate", "vsb_flowrunid", "vsb_flowapprovalid",
    "_owningbusinessunit_value", "statecode",
  ],
);

export const substructureTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.substructureTypeInProjects, [
    "vsb_substructuretypeinprojectid", "vsb_name", "_vsb_project_value",
    "_vsb_substructure_value", "vsb_substructurelabel", "vsb_substrothersupplier",
    "vsb_selectedsubstructuretypes", "vsb_nominalpower", "vsb_substructurecost",
    "vsb_requestpermissionstate", "vsb_flowrunid", "vsb_flowapprovalid",
    "_owningbusinessunit_value", "statecode",
  ],
);

export const storageTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.storageTypeInProjects, [
    "vsb_storagetypeinprojectid", "vsb_name", "_vsb_project_value", "_vsb_storage_value",
    "vsb_storagetype", "vsb_supplier", "vsb_storagecapacitydec", "crc36_energycapacitymwh",
    "_owningbusinessunit_value", "statecode",
  ],
);

export const hydrogenTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.hydrogenTypeInProjects, [
    "vsb_hydrogentypeinprojectid", "vsb_name", "_vsb_project_value", "_vsb_hydrogen_value",
    "vsb_hydrogentype", "vsb_supplier", "vsb_hydrogencapacitydec",
    "_owningbusinessunit_value", "statecode",
  ],
);

export const substationTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.substationTypeInProjects, [
    "vsb_substationtypeinprojectid", "vsb_name", "_vsb_project_value",
    "_vsb_substation_value", "vsb_substationtype", "vsb_supplier",
    "vsb_substationcapacitydec", "_owningbusinessunit_value", "statecode",
  ],
);

/** `DeviceTypesInProjects` — the shadow row created once per WTG/PV type (rule 19). */
export const deviceTypeInProjectRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.deviceTypesInProjects, [
    "vsb_devicetypesinprojectid", "vsb_name", "_vsb_typeinprojectid_value",
    "_owningbusinessunit_value",
  ],
  { projectLookup: "_vsb_typeinprojectid_value" },
);

/** `Device Costs` — country-scoped EUR/MWp rates for PV, inverter and mounting. */
export const deviceCostRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.deviceCosts, [
    "vsb_devicecostid", "vsb_name", "vsb_devicetype", "vsb_devicecostcurrency",
    "_vsb_country_value", "statecode",
  ],
);

/** `Land Lease Allocation WTGS` — the turbine↔land-lease-cost join. */
export const landLeaseAllocationRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.landLeaseAllocationWtgs, [
    "vsb_landleaseallocationwtgid", "vsb_name", "_vsb_projectcost_value",
    "_vsb_generatorinproject_value", "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_projectcost_value" },
);

/** `Land Lease Project Costs` with the columns the standard-contract generator writes. */
export const landLeaseCostFullRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.landLeaseProjectCosts, [
    "vsb_landleaseprojectcostid", "vsb_name", "_vsb_project_value", "_vsb_subaccount_value",
    "vsb_description", "vsb_landowner", "_vsb_currency_value", "vsb_secured",
    "vsb_allwtgallocated", "vsb_isstandardcontract", "vsb_isstartdatestandardassumption",
    "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
    "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
    "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile",
    "vsb_inflationcountryarea", "vsb_inflationstartyear",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Land Lease Periods` — the Period 2+ children of a land-lease cost. */
export const landLeasePeriodRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.landLeasePeriods, [
    "vsb_landleaseperiodid", "vsb_name", "_vsb_projectcost_value", "vsb_period",
    "vsb_startdate", "vsb_fixedcosts", "vsb_aggregation", "vsb_eurmw", "vsb_eurmwh",
    "vsb_eurwtg", "vsb_ofrevenues", "vsb_distributionfrequency",
    "vsb_landleasedurationyears", "vsb_landleasedurationmonths",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_projectcost_value" },
);

/** `Opex Project Costs` with the columns the O&M standard-contract generator writes. */
export const opexProjectCostFullRepo = makeRepository<Record<string, unknown>>(
  ES_PLANT.opexProjectCosts, [
    "vsb_opexprojectcostid", "vsb_name", "_vsb_project_value", "_vsb_subaccount_value",
    "_vsb_devicetypeinproject_value", "_vsb_parentcost_value", "vsb_description",
    "vsb_startdate", "vsb_opexprojectdurationyears", "vsb_opexprojectdurationmonths",
    "_vsb_currency_value", "vsb_fixcosts", "vsb_ofrevenues", "vsb_threshold",
    "vsb_thresholdtype", "vsb_thresholdindividual", "vsb_eurmw", "vsb_eurmwh", "vsb_eurwtg",
    "vsb_aggregation", "vsb_useinflationprofile", "vsb_usecountryinflationprofile",
    "vsb_inflationprofile", "vsb_inflationstartyear", "vsb_inflationcountryarea",
    "vsb_distributionfrequency", "vsb_alignwithprojectduration",
    "vsb_isstartdatestandardassumption", "vsb_isstandardcontract", "vsb_externalcontract",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Opex Subaccounts` — `LookUp(…, Name = "Operation & Maintenance")`. */
export const opexSubaccountRepo = makeRepository<{
  vsb_opexsubaccountid: string; vsb_name: string; vsb_number: string | null;
  vsb_order: number | null;
}>(ES_PLANT.opexSubaccounts, [
  "vsb_opexsubaccountid", "vsb_name", "vsb_number", "vsb_order",
]);

/* ------------------------------------------------------------------- production */

/** `Energy Yields` — one row per assessment. */
export const energyYieldFullRepo = makeRepository<Record<string, unknown>>(
  ES_PRODUCTION.energyYields, [
    "vsb_energyyieldid", "vsb_name", "_vsb_project_value", "vsb_description", "vsb_type",
    "vsb_energyyieldassessment", "vsb_allocation", "vsb_windspeedathubheight",
    "vsb_irradiationkwhkwp", "vsb_grossyieldmwh", "vsb_totallosses", "vsb_netyieldp50mwh",
    "vsb_uncertainty", "vsb_netyieldp75mwh", "vsb_netyieldp90mwh",
    "vsb_productionallocation", "vsb_productionlossesp50",
    "vsb_productionuncertaintyp75andp90", "vsb_considerseasonality",
    "vsb_considernegativeprices", "_owningbusinessunit_value", "statecode",
  ],
);

/**
 * `PV Seasonality Values` — the 12-month profile.
 *
 * DELIBERATELY NOT named `pvSeasonalityRepo`: the WTG save path writes this same table
 * with the same `vsb_PVEnergyYield` lookup. The table name is legacy; the discriminator
 * is the parent yield's `vsb_type` (source ambiguity 3).
 */
export const seasonalityRepo = makeRepository<Record<string, unknown>>(
  ES_PRODUCTION.seasonalityValues, [
    "vsb_pvseasonalityvaluesid", "vsb_name", "_vsb_pvenergyyield_value",
    "vsb_january", "vsb_february", "vsb_march", "vsb_april", "vsb_may", "vsb_june",
    "vsb_july", "vsb_august", "vsb_september", "vsb_october", "vsb_november",
    "vsb_december", "vsb_standardvaluesjson", "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_pvenergyyield_value" },
);

/** `PV Negative Prices` — 15 rows per yield. Shared with WTG; see `seasonalityRepo`. */
export const negativePriceRepo = makeRepository<Record<string, unknown>>(
  ES_PRODUCTION.negativePrices, [
    "vsb_pvnegativepricesid", "vsb_name", "_vsb_pvenergyyield_value", "vsb_year",
    "vsb_netyieldp50reduction", "vsb_isstandardvalue", "_owningbusinessunit_value",
    "statecode",
  ],
  { projectLookup: "_vsb_pvenergyyield_value" },
);

/** `Project Revenues` — only the two negative-price columns are touched from Production. */
export const projectRevenueNegativePriceRepo = makeRepository<Record<string, unknown>>(
  ES_PRODUCTION.projectRevenues, [
    "vsb_projectrevenueid", "vsb_name", "_vsb_project_value", "vsb_description",
    "vsb_considernegativeprices", "vsb_negativepricemanualoverride", "statecode",
  ],
);

/** `OPEX & Land Lease Standard Assumptions` — the standard-contract source. */
export const opexLandLeaseAssumptionRepo = makeRepository<Record<string, unknown>>(
  ES_PRODUCTION.opexLandLeaseStandardAssumptions, [
    "vsb_opexlandleasestandardassumptionsid", "vsb_name", "vsb_description",
    "_vsb_country_value", "vsb_technology", "vsb_typeofcontract", "vsb_period",
    "_vsb_landleasesubaccount_value", "_vsb_opexsubaccount_value", "_vsb_currency_value",
    "vsb_secured", "vsb_allwtgallocated", "vsb_fixcosts", "vsb_ofrevenues",
    "vsb_eurmw", "vsb_eurmwh", "vsb_eurwtg", "vsb_aggregation",
    "vsb_durationinyears", "vsb_durationinmonths", "vsb_distributionfrequency",
    "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
    "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
    "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile",
    "vsb_inflationcountryarea", "vsb_alignwithprojectduration", "vsb_externalcontract",
    "vsb_threshold", "vsb_thresholdtype", "vsb_thresholdindividual", "vsb_order",
    "statecode",
  ],
);

/** `Country Inflation Profiles` — inflation by country × year (rules 19–20). */
export const countryInflationProfileRepo = makeRepository<{
  vsb_countryinflationprofileid: string;
  _vsb_country_value: string | null;
  vsb_year: number | null;
  vsb_inflation: number | null;
  vsb_area: string | null;
}>(ES_PRODUCTION.countryInflationProfiles, [
  "vsb_countryinflationprofileid", "_vsb_country_value", "vsb_year", "vsb_inflation",
  "vsb_area",
]);

/* ============================================================================ appended
 * Batch D — Project Revenues Screen and Project Finance Screen.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * Column lists are the `<LogicalName>` values read out of `sol/customizations.xml`, so
 * every projection below is exact. Untyped tables return `Record<string, unknown>` per
 * CONVENTIONS rule 10; each feature narrows with a local interface and a mapper.
 * ========================================================================== */

import { ES_FINANCE } from "./entities";

/* -------------------------------------------------------------------- revenues */

/**
 * `Project Revenues` — the full 58-column contract row.
 *
 * `projectRevenueRepo` above projects a seven-column subset that predates this screen and
 * is missing every standard-assumption flag; the Revenues screen needs all fourteen, so
 * it uses this repository instead. Both are kept: the short one is a list projection.
 */
export const projectRevenueFullRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.projectRevenues, [
    "vsb_projectrevenueid", "vsb_name", "_vsb_project_value", "vsb_description",
    "vsb_label", "_vsb_currency_value", "_vsb_subaccount_value",
    "vsb_tariffprice", "vsb_tariffpricep90", "vsb_biddingprice",
    "vsb_sitequality", "vsb_sitequalityp90", "vsb_correctionfactor",
    "vsb_correctionfactorp90", "vsb_contractstartdate", "vsb_contractenddate",
    "vsb_contractdurationyears", "vsb_contractdurationmonths",
    "vsb_hedgetype", "vsb_hedgedvolume", "vsb_fixedcontractedmwhpa",
    "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile",
    "vsb_inflationstartyear", "vsb_inflationcountryarea",
    "vsb_considernegativeprices", "vsb_negativepricemanualoverride",
    "vsb_isbiddingpricestandardassumption",
    "vsb_iscontractdurationyearsstandardassumption",
    "vsb_iscontractdurationmonthsstandardassumption",
    "vsb_iscontractstartdatestandardassumption",
    "vsb_iscontractenddatestandardassumption",
    "vsb_istarrifpricestandardassumption", "vsb_istarrifpricep90standardassumption",
    "vsb_isinflationprofilestandardassumption",
    "vsb_isusecustominflationstandardassumption",
    "vsb_isinflationprofileyearstandardassumption",
    "vsb_iscustominflationprofilestandardassumption",
    "vsb_ishedgedvolumestandardassumption",
    "vsb_iscorrectionfactorstandardassumption",
    "vsb_iscorrectionfactorp90standardassumption",
    "_owningbusinessunit_value", "createdon", "statecode",
  ],
);

/** `Balancing Prices` — the chronological period chain. */
export const balancingPriceRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.balancingPrices, [
    "vsb_balancingpriceid", "vsb_name", "_vsb_project_value", "vsb_periods",
    "vsb_balancingpriceeurpln", "vsb_startdatebalancingcontract",
    "vsb_enddatebalancingcontract", "vsb_contractdurationyear",
    "vsb_contractdurationmonth", "vsb_shiftofcoddatemonths", "vsb_referencecod",
    "_owningbusinessunit_value", "createdon", "statecode",
  ],
);

/** `RevenueIndividualHedgeVolumes` — one row per contract year. */
export const revenueHedgeVolumeRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.revenueIndividualHedgeVolumes, [
    "vsb_revenueindividualhedgevolumeid", "vsb_name", "_vsb_revenuecontract_value",
    "vsb_year", "vsb_startdate", "vsb_enddate", "vsb_individualcontractedmwhpa",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_revenuecontract_value" },
);

/* --------------------------------------------------------------------- finance */

/** `Financing Categories` — the six cards, ordered by `vsb_order`. */
export const financingCategoryRepo = makeRepository<{
  vsb_financingcategoryid: string; vsb_name: string; vsb_order: number | null;
}>(ES_FINANCE.financingCategories, [
  "vsb_financingcategoryid", "vsb_name", "vsb_order",
]);

/**
 * `Financing Inputs` — all 87 columns matter to this screen except the audit set.
 *
 * `financingInputRepo` above projects seven columns that predate the screen; it cannot
 * carry a senior-debt tranche. This is the projection the Finance screen uses.
 */
export const financingInputFullRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.financingInputs, [
    "vsb_financinginputid", "vsb_name", "_vsb_project_value",
    "_vsb_financingcategory_value", "vsb_uniquekeystring", "vsb_isfolded",
    "vsb_freeequity", "vsb_freeequityvalue", "vsb_shareholderloanvalue",
    "vsb_baserate", "vsb_bankmargin", "vsb_vatfacilityamount",
    "vsb_vatfacilityamountvalue", "vsb_isdeactivatedbybutton",
    "vsb_tranchestatus", "vsb_bank", "vsb_otherbankname", "vsb_kfwtranche",
    "vsb_kfwtranchevalue", "vsb_financialclose", "vsb_tenordurationyear",
    "vsb_tenordurationmonth", "vsb_drawdown", "vsb_gearing", "vsb_fixedamount",
    "vsb_fixedamountvalue", "vsb_repaymentprofile", "vsb_startrepaymentyear",
    "vsb_startrepaymentmonth", "vsb_frequencyofrepayment", "vsb_hedging",
    "vsb_upfrontfee", "vsb_upfrontfeevalue", "vsb_commitmentfee",
    "vsb_commitmentfeevalue", "vsb_commitmentfeeperiodyear",
    "vsb_commitmentfeeperiodmonth", "vsb_swapmargin", "vsb_swaprate",
    "vsb_bankrate", "vsb_bankmarginconstructionphase",
    "vsb_bankmarginoperationalphase", "vsb_fixedinterestrateyear",
    "vsb_fixedinterestratemonth", "vsb_swapafterfixedperiod", "vsb_stepupbankmargin",
    "vsb_spotcurvedebtsizing", "vsb_energyyielddebtsizing",
    "vsb_dscrcontracted", "vsb_dscrcontracteddecimal",
    "vsb_dscruncontracted", "vsb_dscruncontracteddecimal",
    "vsb_trackstatusactive", "vsb_seniordebtstandardassumptionjson",
    "vsb_typedsradrsf", "vsb_margin", "vsb_percentageoffuturedebtservice",
    "vsb_durationoffuturedebtservicemmyy", "vsb_endofdebtservicesavings",
    "vsb_dsradsrforiginalstatusactive", "vsb_dsradrsfstandardassumptionsjson",
    "vsb_costsofdecommissioning", "vsb_costsofdecommissioningvalue",
    "vsb_costofguarantee", "vsb_dateofissue", "vsb_dateofexpiry",
    "vsb_startdateofsaving", "vsb_durationofsaving",
    "vsb_decommissioningstandardassumptionjson", "vsb_isstandardvalue",
    "_owningbusinessunit_value", "createdon", "statecode",
  ],
);

/** `Financing Inputs Repayment Amounts` — one row per year of an Individual profile. */
export const repaymentAmountRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.financingInputsRepaymentAmounts, [
    "vsb_financinginputsrepaymentamountid", "vsb_name", "_vsb_project_value",
    "_vsb_financinginput_value", "_vsb_financingcategory_value",
    "vsb_repaymentyear", "vsb_repaymentamount",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Financing Input Step Up margins` — the duration-encoded margin schedule. */
export const stepUpMarginRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.financingInputStepUpMargins, [
    "vsb_financinginputstepupmarginsid", "vsb_name", "_vsb_project_value",
    "_vsb_financinginput_value", "_vsb_financingcategory_value",
    "vsb_order", "vsb_startyear", "vsb_duration", "vsb_margin",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Assumptions Debt SQL` — `{country, debttype, category, wind, pv}`. */
export const assumptionsDebtRepo = makeRepository<Record<string, unknown>>(
  ES_FINANCE.assumptionsDebt, ["country", "debttype", "category", "wind", "pv"],
);

/** `Assumptions Banks SQL` — reference data, cached with a long staleTime. */
export const assumptionsBankRepo = makeRepository<{ id: string; bankname: string }>(
  ES_FINANCE.assumptionsBanks, ["id", "bankname"],
);

/** `AssumptionsKfWTrancheSQL` — one string column, `10 / 2 / 10`-shaped. */
export const assumptionsKfwRepo = makeRepository<{
  loantenor_repayfreeperiod_ratefixing: string;
}>(ES_FINANCE.assumptionsKfwTranches, ["loantenor_repayfreeperiod_ratefixing"]);

/* ============================================================================ appended
 * Batch E — repositories for the six Project Management ADMIN / master-data screens.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * These tables are NOT project-scoped, so none of them declares a `projectLookup`;
 * `byProject` is meaningless on them and is never called. Every list goes out with a
 * server-side `$filter` on the country / technology / contract-type scope — the canvas
 * `ClearCollect(col, <whole table>)` habit is what made these screens slow.
 *
 * NAME COLLISIONS: `projectDefaultChecklistRepo`, `checkListDefaultApprovalRepo`,
 * `opexSubaccountRepo`, `opexLandLeaseAssumptionRepo` and `entraIdRepo` already exist
 * above with the projections the PROJECT screens need. The admin screens need a wider
 * projection of the same tables, so these carry an `admin` prefix rather than widening
 * somebody else's select. Every column name shared with the earlier blocks was aligned to
 * THEIR spelling, because those were read out of `sol/customizations.xml`; the extra
 * columns here are hand-derived from the canvas display names and must be confirmed
 * against the metadata endpoint before production.
 * ========================================================================== */

// Appended import — ES-module imports are hoisted, so this is legal here and keeps the
// block append-only: the existing import statement at the top of the file is untouched.
import { ES_ADMIN } from "./entities";

/** `Checklist Country And Technologies` — the checklists/gates scope axis. */
export const checklistCountryTechRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.checklistCountryAndTechnologies, [
    "vsb_checklistcountryandtechnologyid", "vsb_name", "vsb_order",
    "_vsb_country_value", "vsb_technology", "_owningbusinessunit_value", "statecode",
  ],
);

/** `Project Default Checklists` — the per-scope default task list. */
export const adminDefaultChecklistRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.projectDefaultChecklists, [
    "vsb_projectdefaultchecklistsid", "vsb_name", "vsb_order",
    "vsb_holdingtaskdescription", "vsb_gaterelevance", "vsb_iscompletiondate",
    "vsb_todelete", "_vsb_associatedcountryandtechnology_value",
    "_vsb_clusterstate_value", "_owningbusinessunit_value", "statecode", "statuscode",
  ],
);

/** `Check List Default Approvals` — the checklist-level approval rows. */
export const adminCheckListDefaultApprovalRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.checkListDefaultApprovals, [
    "vsb_checklistdefaultapprovalsid", "vsb_name", "vsb_approvalmodecode",
    "vsb_gateisactive", "_vsb_projectdefaultchecklistid_value",
    "_vsb_portfoliomanagerid_value",
    "vsb_defaultapprovers", "vsb_defaultcontributors", "vsb_defaultnotifications",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Project Default Approvals` — the GATE-level approval rows (note `Default Approvals`). */
export const adminProjectDefaultApprovalRepo = makeRepository<Record<string, unknown>>(
  ES_PROCESS.projectDefaultApprovals, [
    "vsb_projectdefaultapprovalsid", "vsb_name", "vsb_approvalmodecode",
    "vsb_gateactive", "_vsb_clusterstate_value", "_vsb_approvalscountry_value",
    "vsb_technologycode", "_vsb_approvalparticipant1_value",
    "vsb_defaultapprovals", "vsb_defaultcontributors",
    "vsb_defaultnotifications", "_owningbusinessunit_value", "statecode",
  ],
);

/** `CAPEX Account Lists` — the two-level self-referencing chart of accounts. */
export const capexAccountListRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.capexAccountLists, [
    "vsb_capexaccountlistid", "vsb_name", "vsb_number", "vsb_order",
    "_vsb_parentaccount_value", "_owningbusinessunit_value", "statecode",
  ],
);

/** `CAPEX Costs` — the rows the deactivation cascade zeroes and deletes. */
export const adminCapexCostRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.capexCosts, [
    "vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost",
    "statecode",
  ],
);

/** `CAPEX Project Contracts` — read-only here; it decides whether an account may be deleted. */
export const adminCapexProjectContractRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.capexProjectContracts, [
    "vsb_capexprojectcontractid", "vsb_name", "_vsb_account_value", "statecode",
  ],
);

/** `Milestones Standard Assumptions` — two rows per country × technology. */
export const milestoneStandardAssumptionRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.milestonesStandardAssumptions, [
    "vsb_milestonesstandardassumptionid", "vsb_name", "vsb_technology",
    "_vsb_country_value", "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4",
    "vsb_cluster5", "vsb_finalinvestmentdecision", "vsb_operationallifetime",
    "vsb_salesstart", "vsb_salesend", "_owningbusinessunit_value", "statecode",
  ],
);

/** `OPEX & Land Lease Standard Assumptions` — the three OPEX families, ten periods each. */
export const adminOpexLandLeaseAssumptionRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.opexLandLeaseStandardAssumptions, [
    "vsb_opexlandleasestandardassumptionsid", "vsb_name", "vsb_description",
    "_vsb_country_value", "vsb_technology", "vsb_typeofcontract", "vsb_period",
    "_vsb_opexsubaccount_value", "_vsb_landleasesubaccount_value",
    "vsb_islastperiod", "vsb_iscollapsed",
    "vsb_eurmwh", "vsb_eurmw", "vsb_eurwtg", "vsb_fixcosts", "vsb_ofrevenues",
    "vsb_aggregation", "vsb_distributionfrequency",
    "vsb_durationinyears", "vsb_durationinmonths",
    "vsb_thresholdindividual", "vsb_threshold", "vsb_thresholdtype",
    "vsb_alignwithprojectduration", "vsb_inflationarea", "vsb_inflationcountryarea",
    "vsb_inflationprofile", "vsb_useinflationprofile", "vsb_usecountryinflationprofile",
    "vsb_inflationstartyearstring", "vsb_allwtgallocated", "vsb_secured",
    "vsb_amountonetimepayment", "vsb_duedateonetimepayment",
    "vsb_amountonetimepayment2", "vsb_duedateonetimepayment2",
    "vsb_amountonetimepayment3", "vsb_duedateonetimepayment3",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Devex/Capex Standard Assumptions` — one row per scope × subaccount × description. */
export const devexCapexAssumptionRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.devexCapexStandardAssumptions, [
    "vsb_devexcapexstandardassumptionsid", "vsb_name", "vsb_description",
    "vsb_descriptioninput", "vsb_costamount", "vsb_unit", "vsb_costpaidby",
    "vsb_comment", "vsb_technology", "_vsb_country_value",
    "_vsb_category_value", "_vsb_subaccount_value", "vsb_distributionfrequency",
    "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `BoP Contracts Standard Assumptions` — up to ten per type per scope. */
export const bopContractRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.bopContractsStandardAssumptions, [
    "vsb_bopcontractsstandardassumptionid", "vsb_name", "vsb_description",
    "_vsb_country_value", "vsb_technology", "vsb_contracttypes",
    "vsb_closingdatereference", "vsb_monthdifference",
    "vsb_margin", "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue",
    "vsb_comment", "_owningbusinessunit_value", "statecode",
  ],
);

/** `BoP Contracts Standard Assumption DevCo Costs` — the CAPEX subaccounts a contract owns. */
export const bopDevCoCostRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.bopDevCoCosts, [
    "vsb_bopcontractsstandardassumptiondevcocostid", "vsb_name",
    "_vsb_bopcontractstandardassumption_value", "_vsb_capexaccount_value",
    "_vsb_rootcapexaccount_value", "_vsb_country_value", "vsb_technology",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `Apply and Apply All Trackings` — one row per (country, technology, contract type, action). */
export const applyTrackingRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.applyAndApplyAllTrackings, [
    "vsb_applyandapplyalltrackingid", "vsb_name", "_vsb_country_value", "vsb_technology",
    "vsb_action", "vsb_appliedbyemail", "vsb_appliedbyfullname", "vsb_contracttype",
    "_vsb_bopstandardcontract_value", "modifiedon", "_modifiedby_value", "statecode",
  ],
);

/** `Fabric Sync Jobs` — READ ONLY in the shipped app; every write site is commented out. */
export const fabricSyncJobRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.fabricSyncJobs, [
    "vsb_fabricsyncjobid", "vsb_name", "vsb_regardingobject", "_vsb_jobtype_value",
    "vsb_jobstatus", "vsb_costtype", "_vsb_country_value", "vsb_technology",
    "modifiedon", "statecode",
  ],
);

/** `Opex Subaccounts` — split into O&M and Other OPEX by a name/order heuristic. */
export const adminOpexSubaccountRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.opexSubaccounts, [
    "vsb_opexsubaccountid", "vsb_name", "vsb_order", "_vsb_account_value", "statecode",
  ],
);

/** `Land Lease Subaccounts`. */
export const landLeaseSubaccountRepo = makeRepository<Record<string, unknown>>(
  ES_ADMIN.landLeaseSubaccounts, [
    "vsb_landleasesubaccountid", "vsb_name", "vsb_order", "_vsb_account_value", "statecode",
  ],
);

/** `Microsoft Entra IDs` — the people picker behind the gate-approval panel. */
export const adminEntraIdRepo = makeRepository<Record<string, unknown>>(
  ES.microsoftEntraIds, [
    "vsb_microsoftentraidid", "vsb_entraid", "vsb_displayname",
    "vsb_givenname", "vsb_surname", "vsb_mail", "vsb_accountenabled", "statecode",
  ],
);

/* ============================================================================ appended
 * Batch F — repositories for the five PROJECT COSTS app screens.
 * Append-only: nothing above this marker was changed or reordered.
 *
 * NAME COLLISIONS with earlier blocks are resolved with a `cost` prefix, per the batch
 * rules: `bopContractRepo` / `bopDevCoCostRepo` above are the ADMIN *standard assumption*
 * tables, not the project-level BoP tables this app writes; `opexSubaccountRepo` and
 * `capexAccountListRepo` above carry projections that are too narrow here.
 *
 * Every projection is metadata-verified against `sol/customizations.xml`.
 * ========================================================================== */

// Appended import — ES-module imports are hoisted, so this is legal here and keeps the
// block append-only.
import { ES_COST } from "./entities";

/* ------------------------------------------------------------------- capex costs */

/** `CAPEX Account Lists` with the columns the cost tree needs (adds `vsb_accountcategory`). */
export const costCapexAccountRepo = makeRepository<Record<string, unknown>>(
  ES_COST.capexAccountLists, [
    "vsb_capexaccountlistid", "vsb_name", "vsb_number", "vsb_order",
    "vsb_accountcategory", "_vsb_parentaccount_value",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `CAPEX Project Contracts` — the full projection the Capex grid and panel need. */
export const costCapexContractRepo = makeRepository<Record<string, unknown>>(
  ES_COST.capexProjectContracts, [
    "vsb_capexprojectcontractid", "vsb_name", "vsb_description", "_vsb_project_value",
    "_vsb_account_value", "vsb_totalcost", "vsb_costtype", "vsb_applyvat",
    "vsb_depreciation", "vsb_distribution", "vsb_distributionscheme",
    "vsb_distributionfrequency", "vsb_averagepayment", "_vsb_linkedcluster_value",
    "vsb_byclusterjson", "vsb_bystartenddatejson", "vsb_isstandardcontract",
    "_vsb_capexstandardassumptioncontract_value", "vsb_initialcontractsource",
    "vsb_iseditedfrompcf", "vsb_autoid", "_owningbusinessunit_value", "statecode",
  ],
);

/** `CAPEX Costs` — one row per (contract, year, month). */
export const costCapexCostRepo = makeRepository<Record<string, unknown>>(
  ES_COST.capexCosts, [
    "vsb_capexcostid", "vsb_name", "_vsb_contract_value", "vsb_year", "vsb_month",
    "vsb_cost", "vsb_costpaid", "_vsb_capexcontractstandardassumption_value",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_contract_value" },
);

/** `Capex Comments` — the threaded comment table (`vsb_capexcommentses`). */
export const capexCommentRepo = makeRepository<Record<string, unknown>>(
  ES_COST.capexComments, [
    "vsb_capexcommentsid", "vsb_name", "vsb_comment", "vsb_commenttype",
    "_vsb_capexcontract_value", "_vsb_capexcost_value", "_vsb_parentcomment_value",
    "_vsb_rootcomment_value", "vsb_resolved", "_vsb_resolvedby_value",
    "createdon", "_createdby_value", "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_capexcontract_value" },
);

/** `SPVDevCo Mapping Capex Devexes` — the default DevCo/SPV per sub-account. */
export const spvDevCoMappingRepo = makeRepository<Record<string, unknown>>(
  ES_COST.spvDevCoMappingCapexDevexes, [
    "vsb_spvdevcomappingcapexdevexid", "vsb_accountnumber", "vsb_devcospv",
    "_vsb_namesubaccount_value", "vsb_relatedaccountname", "vsb_order", "statecode",
  ],
);

/* ------------------------------------------------------------------------- opex */

/** `Opex Accounts` — two rows. O&M mode takes the first by `Order`, Other OPEX the last. */
export const opexAccountRepo = makeRepository<{
  vsb_opexaccountid: string; vsb_name: string; vsb_number: string | null;
  vsb_order: number | null; statecode: number;
}>(ES_COST.opexAccounts, [
  "vsb_opexaccountid", "vsb_name", "vsb_number", "vsb_order", "statecode",
]);

/**
 * `Opex Subaccounts` WITH its parent account lookup.
 * `opexSubaccountRepo` above omits `_vsb_account_value`, and the Other-OPEX gallery filters
 * on exactly that (`Account.Name = "Other OPEX Costs"`).
 */
export const costOpexSubaccountRepo = makeRepository<Record<string, unknown>>(
  ES_COST.opexSubaccounts, [
    "vsb_opexsubaccountid", "vsb_name", "vsb_number", "vsb_order",
    "_vsb_account_value", "vsb_costtype", "statecode",
  ],
);

/* ------------------------------------------------------------------- bop contracts */

/** `BoP Projects Contracts` — the project-level BoP contract rows (double plural set). */
export const costBopContractRepo = makeRepository<Record<string, unknown>>(
  ES_COST.bopProjectsContracts, [
    "vsb_bopprojectscontractsid", "vsb_name", "vsb_description", "_vsb_project_value",
    "vsb_contracttypes", "vsb_closingdate",
    "vsb_costsuntilclosingdate", "vsb_costsuntilclosingdateplan",
    "vsb_costsuntilclosingdateactual",
    "vsb_costsafterclosingdate", "vsb_costsafterclosingdateplan",
    "vsb_costsafterclosingdateactual",
    "vsb_totalcoststype", "vsb_totalcostscalculated", "vsb_totalcostsoverwrite",
    "vsb_margin", "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue",
    "vsb_totalcostofcontract", "vsb_ismarginstandardassumption", "vsb_isstandardcontract",
    "_vsb_bopstandardassumptioncontract_value", "vsb_comment",
    "_owningbusinessunit_value", "statecode",
  ],
);

/** `BoP Contracts Payment Targets` — `'Payment Date'` is stored as TEXT (`MM/YYYY`). */
export const bopPaymentTargetRepo = makeRepository<Record<string, unknown>>(
  ES_COST.bopContractsPaymentTargets, [
    "vsb_bopcontractspaymenttargetsid", "vsb_name", "vsb_description", "vsb_note",
    "_vsb_bopprojectcontract_value", "vsb_paymentdate", "vsb_totalcostscontract",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_bopprojectcontract_value" },
);

/** `BoP Contracts DevCo Costs` — the contract↔level-3-account join. */
export const costBopDevCoCostRepo = makeRepository<Record<string, unknown>>(
  ES_COST.bopContractsDevCoCosts, [
    "vsb_bopcontractsdevcocostsid", "vsb_name", "_vsb_bopcontract_value",
    "_vsb_account_value", "_vsb_bopcontractstandardassumption_value",
    "_owningbusinessunit_value", "statecode",
  ],
  { projectLookup: "_vsb_bopcontract_value" },
);

/**
 * `Assumptions BoP Contracts` — the app's only CONNECTED (Fabric/SQL) source, read-only.
 *
 * Its columns are lower-case SQL names, not `vsb_` Dataverse ones. Cache it with a long
 * `staleTime`: it is reference data, and the Contracts panel must degrade to a blank margin
 * default rather than block when the source is unavailable.
 */
export const bopAssumptionsRepo = makeRepository<{
  countryname: string | null;
  technology: string | null;
  contracttype: string | null;
  margin: boolean | null;
  margintype: string | null;
  marginvalue: number | null;
}>(ES_COST.assumptionsBopContracts, [
  "countryname", "technology", "contracttype", "margin", "margintype", "marginvalue",
]);
