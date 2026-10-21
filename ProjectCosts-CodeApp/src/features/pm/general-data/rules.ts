/**
 * Project General Data Screen — business rules (redeveloped and connected 19 Oct 2026, D25).
 *
 * Canvas screen: `Project General Data Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml`
 * (solution 1.21.709; `Y:n` below is a line of that file). The same screen is the New Project
 * screen when no project is selected.
 *
 * Everything in this file is pure: no React, no network. `Screen.tsx` and `hooks.ts` call it;
 * `rules.test.ts` tests it directly.
 *
 * NOT PORTED, on purpose:
 *  - `pcf_btn_…_Save_2` / `pcf_btn_…_Reset_3` (hidden, `Visible: =false`, never selected).
 *  - The generator re-price branch of `btn_GeneralData_Save_Actual` (Y:740-769): its flag
 *    `locNeedPlantCostsRecalculation` is never set true, so the branch never runs (D25).
 *  - `locIsUserInControllingGroup` (set Y:161, never read) and `locSubTechnologyVisibility`
 *    (set, never read on this screen).
 *  - The gate-approval cancellation flow call in `btn_General_CancelActiveDraftGateApproval…`
 *    (Y:211-403). Flows that send mails / Teams cards are left out (product decision, D25);
 *    see `startClusterChangeBlocked`.
 */
import {
  parseNumber, isInteger, isOneDecimal, isTwoDecimal, isSixDecimal, inRange, pfxRound,
  isBlank, decimalSeparator, formatInteger, type Lang,
} from "@/domain/powerFxNumeric";
import { addMonths } from "@/domain/dates";
import { dateOnly } from "@/data/odata";
import { ES, CHOICE, TERRAIN_SIZE_COUNTRY_KEY } from "@/data/dataverseNames";
import type { PlannedWrite, WritePlan } from "@/data/writePlan";
import { refusePlan } from "@/data/writePlan";
import type { CountryScope } from "@/domain/session";
import { TECHNOLOGY_LABEL, technologyValue } from "@/domain/technology";

/* ════════════════════════════════════════════════════════════ column names ════ */

/**
 * `Projects` (`vsb_project`) columns this screen and the Milestones screen use. Every name is
 * verified against `ProjectDocs/reference/dataverse-attributes.json` and the generated
 * `src/generated/models/Vsb_projectsModel.ts` (19 Oct 2026).
 *
 * CORRECTED (D25): `name` was `vsb_name` — that is 'Project ID'; 'Project Name' is
 * `vsb_projectname`. `projectNumber` ('Project ID') was `vsb_internalprojectid`. The canvas
 * 'Is 2-Project development Standard Assumption ?' is `vsb_feasibilitystudiesstandardassumption`
 * (its solution label is still "1-Feasibility studies Standard Assumption ?";
 * `References/DataSources.json` carries the renamed display name).
 */
export const PROJECT_COL = {
  id: "vsb_projectid",
  name: "vsb_projectname",
  originalProjectName: "vsb_originalprojectname",
  shortName: "vsb_shortname",
  /** 'Project ID' — the human-readable identifier Dataverse assigns on create. */
  projectNumber: "vsb_name",
  internalProjectId: "vsb_internalprojectid",
  projectType: "vsb_projecttype",
  district: "vsb_district",
  municipality: "vsb_municipality",
  terrainSize: "vsb_terrainsize",
  latitude: "vsb_latitude",
  longitude: "vsb_longitude",
  technology: "vsb_technology",
  approvalState: "vsb_approvalstates",
  spvName: "vsb_spvname",
  spvCompanyCode: "vsb_spvcompanycode",
  spvLegalStructure: "vsb_spvlegalstructure",
  taxFactor: "vsb_taxfactor",
  shareOfFarmdown: "vsb_shareoffarmdown",
  isStandardShareOfFarmdown: "vsb_isstandardshareoffarmdown",
  standardCostCreated: "vsb_standardcostcreated",
  developmentType: "vsb_developmenttype",
  startCluster: "vsb_startcluster",
  acquisitionDate: "vsb_acquisitiondate",
  acquisitionPrice: "vsb_acquisitionprice",
  plantWtgCost: "vsb_plantwtgcost",
  totalCapacity: "vsb_totalcapacity",
  netYieldP50: "vsb_netyieldp50",

  /* the milestone date chain — shared with features/pm/milestones */
  projectStartDate: "vsb_projectstartdate",
  feasibilityStudies: "vsb_feasibilitystudies",
  projectDevelopmentStarted: "vsb_projectdevelopmentstarted",
  applicationSubmitted: "vsb_applicationsubmitted",
  legallyBindingPermits: "vsb_legallybindingpermits",
  fid: "vsb_finalinvestmentdecision",
  construction: "vsb_construction",
  cod: "vsb_operationsstartdatecod",
  endDate: "vsb_enddate",
  salesStartDate: "vsb_salesstartdate",
  salesCompleted: "vsb_salescompleted",
  operationalLifetime: "vsb_operationallifetime",

  /* the "Is ... Standard Assumption?" flags */
  isProjectDevelopmentStd: "vsb_feasibilitystudiesstandardassumption",
  isApplicationSubmittedStd: "vsb_is3applicationsubmittedstandardassumption",
  isLegallyBindingPermitsStd: "vsb_is4legallybindingpermitsstandardassumption",
  isFidStd: "vsb_isfinalinvestmentdecisionstandardassumption",
  isConstructionStd: "vsb_is5constructionstandardassumption",
  isCodStd: "vsb_isoperationsstartdatecodstandardassumption",
  isEndDateStd: "vsb_isenddatestandardassumption",
  isSalesStartStd: "vsb_issalesstartdatestandardassumption",
  isSalesCompletedStd: "vsb_issalescompletiondatestandardassumption",
} as const;

/**
 * Lookup navigation properties, written as `<Nav>@odata.bind`. Spelled exactly as the
 * generated model spells them (D25: `area`, `utilization`, `projectManager` and
 * `deputyProjectManager` named non-existent properties before).
 */
export const PROJECT_LOOKUP = {
  country: "vsb_Country",
  area: "vsb_CountryArea",
  clusterState: "vsb_ClusterState",
  utilization: "vsb_TerrainUtilizationLookUp",
  projectManager: "vsb_Projectmanager",
  deputyProjectManager: "vsb_DeputyprojectmanagerEntra",
} as const;

/** `Project State Trackings` (`vsb_projectstatetracking`) — generated model. */
export const TRACKING_COL = {
  approvalClusterState: "vsb_approvalclusterstate",
  clusterStepState: "vsb_clusterstepstate",
  approvalDueDate: "vsb_approvalduedate",
  approvalComment: "vsb_approvalcomment",
  flowRunId: "vsb_flowrunid",
  flowApprovalId: "vsb_flowapprovalid",
  project: "vsb_Project",
  clusterState: "vsb_ClusterState",
} as const;

/** `ShareholderEntityInProjects` = `vsb_shareholderentitiy` (entity set `vsb_shareholderentitiies`). */
export const SHAREHOLDER_COL = {
  id: "vsb_shareholderentitiyid",
  name: "vsb_name",
  entityType: "vsb_shareholderentitiytype",
  customName: "vsb_customname",
  ownership: "vsb_ownership",
  project: "vsb_Project",
} as const;

/** The owner bind key the live screens use (`OwningBusinessUnit@odata.bind`, lowercase). */
const OBU = "owningbusinessunit@odata.bind";

/** `<nav>@odata.bind` — null clears the lookup, which is what `Blank()` did. */
export function bind(nav: string, entitySet: string, id: string | null | undefined) {
  return { [`${nav}@odata.bind`]: id ? `/${entitySet}(${id})` : null };
}

const obu = (id: string | null | undefined) => ({ [OBU]: id ? `/businessunits(${id})` : null });

/* ═══════════════════════════════════════════════════════════ option labels ════ */

/**
 * Choice labels, transcribed from the solution's option sets (`customizations.xml`,
 * solution 1.21.709). The value is what is written; the label is what the dropdown shows.
 * The screen adds the record's own FormattedValue when a live value is not listed here.
 */
/** `Choices('Project Type')` — `vsb_projecttype`. */
export const PROJECT_TYPE_LABEL: Record<number, string> = {
  952850000: "Only operating company",
  952850001: "Only infrastructure",
  952850002: "Operating company with infrastructure",
};

/** `Choices('SPV Legal Structure (Projects)')` — `vsb_project_vsb_spvlegalstructure`. */
export const SPV_LEGAL_STRUCTURE_LABEL: Record<number, string> = {
  952850000: "GmbH",
  952850001: "GmbH & Co. KG",
};

/** `Choices('Cluster States')` — `vsb_clusterstates` (the value is the cluster number). */
export const CLUSTER_STATE_LABEL: Record<number, string> = {
  0: "Greenfield", 1: "Cluster 1", 2: "Cluster 2", 3: "Cluster 3",
  4: "Cluster 4", 5: "Cluster 5", 6: "Cluster 6",
};

/**
 * `drp_…_ClusterChange.Items` — `Filter(Choices('Cluster States'),
 * Not(Value in ['Cluster States'.Greenfield, 'Cluster States'.'Cluster 1']))` (Y:2607-2616).
 */
export const START_CLUSTER_OPTIONS: readonly number[] = [2, 3, 4, 5, 6];

/** `Choices('Shareholder Entitiy Types')` — `vsb_shareholderentitiytypes`, in option-set order. */
export const SHAREHOLDER_ENTITY_TYPE_LABEL: ReadonlyArray<readonly [number, string]> = [
  [952850011, "Erste Windparkverwaltungs UG"],
  [952850000, "Green Yield One (IPP2)"],
  [952850010, "VSB Beteiligung GmbH"],
  [952850006, "VSB Energia Verde Italia S.R.L"],
  [952850008, "VSB Energie Odnawialne Polska Sp. z o.o."],
  [952850007, "VSB Energie Verde Romania SRL"],
  [952850003, "VSB Énergies Nouvelles SARL"],
  [952850019, "VSB Energy GmbH & Co. KG"],
  [952850018, "VSB Holding GmbH"],
  [952850004, "VSB Neue Energien Deutschland GmbH"],
  [952850009, "VSB Nuevas Energias Espana S.L."],
  [952850001, "VSB Obnovljiva Energija Hrvatska d.o.o"],
  [952850005, "VSB Renewable Energy Hellas L.L.C."],
  [952850015, "VSB Service GmbH"],
  [952850002, "VSB Uusiutuva Energia Suomi Oy"],
  [952850013, "WSB Erste Verwaltungs GmbH"],
  [952850016, "WSB Netzbetriebs GmbH"],
  [952850014, "WSB Windkraft Verwaltungs- und Beteiligungs GmbH"],
  [952850012, "Zweite Windparkverwaltungs GmbH"],
  [952850020, "Total Energies"],
  [952850017, "Third Party"],
];

export const shareholderTypeLabel = (value: number | null | undefined): string =>
  SHAREHOLDER_ENTITY_TYPE_LABEL.find(([v]) => v === value)?.[1] ?? "";

/**
 * The two `'Development Type'` option labels (`Choices('Development Type')`, Y:2458).
 */
export const DEVELOPMENT_TYPE_LABEL: Record<number, string> = {
  [CHOICE.developmentType.acquiredProject]: "Acquired Project",
  [CHOICE.developmentType.ownDevelopment]: "Own Development",
};

/** `Filter(Choices(Technology), Text(Value) <> "Hybrid")` — the Technology dropdown (Y:1922). */
export const TECHNOLOGY_OPTIONS: readonly string[] =
  Object.values(TECHNOLOGY_LABEL).filter((t) => t !== "Hybrid");

/* ════════════════════════════════════════════════════════════════ messages ════ */

/** Every message the screen can show. Canvas texts are verbatim; NEW ones say so. */
export const MSG = {
  /** `lbl_…_ProjectName_ErrorMessage.Text` (first branch) — verbatim. */
  projectName: "Project name should have at least 3 letters.",
  /** `lbl_…_ShortName_ErrorMessage.Text` — verbatim. */
  shortName: "Project short name should have at least 3 letters.",
  /** `lbl_…_TechnologyTab_Content_Technology_ErrMessage.Text` — verbatim. */
  technology: "The Technology cannot be blank.",
  /** `lbl_…_TechnologyTab_Content_ProjectDevelopment_ErrMessage.Text` — verbatim. */
  developmentType: "The Development Type cannot be blank.",
  /** `lbl_…_Manager_ErrMessage.Text` — verbatim. */
  manager: "The project manager cannot be blank.",
  /** `lbl_…_Country_ErrorMessage.Text` — verbatim. */
  country: "Country cannot be blank.",
  /** `lbl_…_Area_ErrorMessage.Text` — verbatim. */
  area: "Area/State/Province cannot be blank.",
  /** `lbl_…_ClusterChange_ErrorMessage.Text` — verbatim. */
  startCluster: "Start Cluster cannot be blank.",
  /** `lbl_…_AcquisitionDate_ErrorMessage.Text` — verbatim. */
  acquisitionDate: "Acquisition date cannot be blank.",
  /** `lbl_…_AcquisitionDate_ErrorMessage_1.Text` (blank branch) — verbatim. */
  acquisitionPriceBlank: "Acquisition Price should not be blank.",
  /** `lbl_…_SPVCompanyCode_ErrMessage.Text` (blank branch) — verbatim. */
  spvCodeBlank: "SPV Company Code cannot be blank.",
  /** `lbl_…_SPVCompanyCode_ErrMessage.Text` (range branch) — verbatim. */
  spvCodeShape: "SPV Company Code is expected in #### format with Numeric values.",
  /** `lbl_…_SPVLegalStructure_ErrMessage.Text` — verbatim. */
  spvLegalStructure: "Please select the legal structure of SPV",
  /** `lbl_…_Tax_Factor_ErrorMessage.Text` (shape branch) — verbatim. */
  taxFactorShape: "Tax factor should be a numeric value without decimal.",
  /** `lbl_…_Tax_Factor_ErrorMessage.Text` (range branch) — verbatim. */
  taxFactorRange: "Tax factor should not be greater than 1000.",
  /** `gblAppResx.InputBlank` (`App.pa.yaml` A:1633) — verbatim. */
  inputBlank: "Input must not be blank",
  /** `gblAppResx.NumericOneDecimals` (`App.pa.yaml` A:1629) — verbatim. */
  numericOneDecimals: "Numeric value with maximum of one decimals",
  /**
   * `ibtn_…_Requered_Fileds.Content` — the terrain row's literal, which differs from the field's
   * own error label (Y:5884) — verbatim.
   */
  terrainRequiredFields: "Terrain Size must be numeric value with maximum of one decimal",
  /** `lbl_…_Latitude_ErrMessage.Text` (range branch) — verbatim. */
  latitudeRange: "The number decimal degrees must be between -90 and 90.",
  /** `lbl_…_Longitude_ErrMessage.Text` (range branch) — verbatim. */
  longitudeRange: "The number decimal degrees must be between -180 and 180.",
  /** `ibtn_…_Requered_Fileds.Content` (Germany row, Y:5907) — verbatim canvas text. */
  municipalityGermany: "Municipality is required for German Projects",
  /** `ibtn_…_Requered_Fileds.Content` (France row, Y:5914) — verbatim canvas text. */
  municipalityFrance: "Municipality is required for France Projects",
  /** `lbl_AdminContract_Last_Apply_All_Tracking_1.Text` — the info banner, verbatim. */
  shareholdingSum: "Shareholding entity ownership sum must be 100%",
  /** `ibtn_…_Requered_Fileds.Content` (`Sum(...) <> 1` row) — verbatim. */
  shareholdingSumRequired: "Shareholding entity ownership sum has to be 100 %",
  /** `lbl_…_Percentage_ErrorMessage.Text` (shape branch) — verbatim. */
  shareholdingPercentShape: "Percentage must be number with two decimal place.",
  /** `lbl_ShareholderEntity_Error_GeneralTab.Text` — verbatim. */
  shareholderAlreadyAdded: "Shareholder Entity already added to this project!",

  /* ── Notify / saving-dialog texts ─────────────────────────────────────────── */
  /** `btn_GeneralData_Save_Actual.OnSelect` `locGeneralDataSavingDialogText` (Y:414) — verbatim. */
  savingProject: "The project is being saved, please wait..",
  /** `but_ClusterChange_RightPanel_Footer_Save.OnSelect` (Y:7100) — verbatim. */
  savingCluster: "Saving cluster milestone changes, please wait...",
  /** `cmp_GeneralData_PopUp_ConfirmationDeleteShareholdingEntity.OnConfirm` success Notify — verbatim. */
  shareholderDeleted: "Shareholding Entities was successfully deleted.",
  /** The canvas step log lines (`colProcessingSteps`) — verbatim. */
  stepProjectSaved: "Project data was saved/updated successfully.",
  stepTrackingRefreshed: "Project start cluster tracking was refreshed successfully.",
  stepShareholdersSaved: "Project Shareholder Entitiy was saved/updated successfully.",

  /* ── NEW — not canvas text: the two paths this app does not run (D25) ───────── */
  /**
   * NEW — the create succeeded but the new row could not be read back (it carries the autonumber
   * 'Project ID' that Patch #2 needs). Creating a project is in scope since PO 20 Oct 2026 (D25).
   */
  createReadBackFailed: "The project was created, but it could not be read back to finish the save.",
  /**
   * NEW — a start-cluster change would cancel a running Draft gate approval through
   * `PerformRequestofGateApprovalCancellation`, which sends mails / Teams cards (left out, D25).
   */
  approvalInProgress: "The Draft gate approval of this project is in progress. Changing the Start Cluster would cancel it, which this app cannot do yet. Use the Project Management app for this change.",
} as const;

/** `$"Keep ""{original}"" - you can only add to the end."` (Y:1238). */
export const budgetingRenameMessage = (original: string) =>
  `Keep "${original}" - you can only add to the end.`;

/**
 * `lbl_…_Latitude_ErrMessage.Text` / `lbl_…_Longitude_ErrMessage.Text` (format branch, Y:4144,
 * Y:4261). The two axes differ on the canvas and BOTH differences are kept: latitude is
 * `##<sep>######` with no closing period, longitude `###<sep>######.`; `<sep>` is "." for an
 * `en` language and "," for every other.
 *
 * CORRECTED (D25): the code used one GUIDE-screenshot text, `###.######.`, for both axes and
 * every language.
 */
export function coordinateFormatMessage(axis: "lat" | "lng", language: Lang): string {
  const sep = decimalSeparator(language);
  return axis === "lat"
    ? `Expected decimal degrees field format number ##${sep}######`
    : `Expected decimal degrees field format number ###${sep}######.`;
}

/**
 * `lbl_…_TerrainSize_ErrorMessage.Text` (range branch) —
 * `$"Please select a value between 0 and {Text(1000, "###,###")}"`; the group separator follows
 * the player's language.
 */
export const terrainRangeMessage = (language: Lang): string =>
  `Please select a value between 0 and ${formatInteger(1000, language)}`;

/**
 * `lbl_…_AcquisitionDate_ErrorMessage_1.Text` (shape branch) — the bound is
 * `Text(1000000000, "#,###,###,###", Language())`.
 */
export const acquisitionPriceShapeMessage = (language: Lang): string =>
  `The cost needs to be a whole number, without any decimal places, in the range of 0 to ${formatInteger(1_000_000_000, language)}.`;

/**
 * `lbl_…_Percentage_ErrorMessage.Text` (range branch) —
 * `$"The number {input} must be between 0 and {Text(remaining, "#0.0#")}."`.
 */
export const shareholdingRangeMessage = (input: string, remaining: number, language: Lang): string =>
  `The number ${input} must be between 0 and ${formatHashZeroDotZeroHash(remaining, language)}.`;

/**
 * `lbl_…_Percentage_ErrorMessage_1.Text` — `$"You have achieved {Round(Sum,4)*100}%. Please
 * correct your input!."`, shown only while the sum is exactly 100.
 */
export const shareholdingFullMessage = (sumFraction: number): string =>
  `You have achieved ${pfxRound(pfxRound(sumFraction, 4) * 100, 4)}%. Please correct your input!.`;

/**
 * `"Error: Project could not be saved. " & "Internal error: originated on " & FirstError.Source
 * & ". Message: " & FirstError.Message & …` (Y:824-827). The code app has no `FirstError.Source`;
 * the failing table is named instead.
 */
export const projectSaveErrorText = (detail: string): string =>
  `Error: Project could not be saved. Internal error: originated on ${ES.projects}. Message: ${detail}`;

/** `"Error: Shareholding Entities could not be deleted. " & "Internal error: originated on " & …`. */
export const shareholderDeleteErrorText = (detail: string): string =>
  `Error: Shareholding Entities could not be deleted. Internal error: originated on ${ES.shareholderEntityInProjects}. Message: ${detail}`;

/** `"Error: Cluster milestone changes could not be saved. " & FirstError.Message` (Y:7200). */
export const clusterSaveErrorText = (detail: string): string =>
  `Error: Cluster milestone changes could not be saved. ${detail}`;

/** `Concat(colProcessingSteps, $"{Value} {Char(10)}")` — the success Notify (Y:816-823). */
export const stepLogText = (log: readonly string[]): string =>
  log.map((l) => `${l} \n`).join("");

/* ═════════════════════════════════════════════════════════════ number formats ════ */

/** `Text(n, "#0.0#")` — at least one, at most two decimals, the player's separator. */
export function formatHashZeroDotZeroHash(n: number, language: Lang): string {
  const fixed = pfxRound(n, 2);
  let s = fixed.toFixed(2);
  if (s.endsWith("0")) s = s.slice(0, -1);
  return s.replace(".", decimalSeparator(language));
}

/** `Text(Value(own * 100), "#0.0# %")` — the gallery's Ownership cell (Y:4750). */
export const formatOwnership = (fraction: number, language: Lang): string =>
  `${formatHashZeroDotZeroHash(fraction * 100, language)} %`;

/**
 * `Text(Round(locChangedLatitude, 6), "#0.0#######")` — the Latitude / Longitude default
 * (Y:4155-4175). At least one decimal, no grouping, the player's decimal separator.
 */
export function coordinateText(value: number | null | undefined, language: Lang): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const r = pfxRound(value, 6);
  let s = String(r);
  if (!s.includes(".")) s = `${s}.0`;
  return s.replace(".", decimalSeparator(language));
}

/* ═════════════════════════════════════════════════════════════════ the form ════ */

export interface GeneralDataForm {
  projectName: string;
  shortName: string;
  /** `vsb_projecttype` option value. */
  projectType: number | null;
  /** The aaduser id (`'A unique identifer for Microsoft Entra ID'`) of the picked persona. */
  managerEntraRowId: string | null;
  managerName: string | null;
  deputyManagerEntraRowId: string | null;
  deputyManagerName: string | null;
  spvName: string;
  spvCompanyCode: string;
  /** `vsb_spvlegalstructure` option value. */
  spvLegalStructure: number | null;
  countryId: string | null;
  areaId: string | null;
  district: string;
  /** Free-text municipality — used for every country except Germany and France. */
  municipality: string;
  /** `cmb_…_Municipality_Germany.Selected.municipality` */
  municipalityGermany: string | null;
  /** `cmb_…_Municipality_France_1.Selected.Municipality` */
  municipalityFrance: string | null;
  utilizationId: string | null;
  terrainSize: string;
  latitude: string;
  longitude: string;
  taxFactor: string;
  /** The technology LABEL ("Wind"); `technologyValue` turns it back into the option value. */
  technology: string | null;
  developmentType: number | null;
  /** 0..6 — only meaningful for an Acquired Project. */
  startCluster: number | null;
  /** `YYYY-MM-DD` */
  acquisitionDate: string | null;
  acquisitionPrice: string;
}

export const emptyGeneralDataForm: GeneralDataForm = {
  projectName: "", shortName: "", projectType: null,
  managerEntraRowId: null, managerName: null,
  deputyManagerEntraRowId: null, deputyManagerName: null,
  spvName: "", spvCompanyCode: "", spvLegalStructure: null,
  countryId: null, areaId: null, district: "", municipality: "",
  municipalityGermany: null, municipalityFrance: null,
  utilizationId: null, terrainSize: "", latitude: "", longitude: "", taxFactor: "",
  technology: null,
  // `drp_…_ProjectDevelopment.DefaultSelectedItems` — 'Own Development' when blank (Y:2440-2450).
  developmentType: CHOICE.developmentType.ownDevelopment,
  startCluster: null,
  acquisitionDate: null, acquisitionPrice: "",
};

export interface CountryRef {
  id: string;
  name: string;
  /** `Countries.Key` (`vsb_title`) — the raw key the terrain-size rule tests against `"25"`. */
  key: string | null;
  /** `Countries.'Besitzer (Unternehmenseinheit)'` (`owningbusinessunit`) — used by Patch #1. */
  besitzerBusinessUnitId?: string | null;
  /** `Countries.'Business Unit'` (`vsb_businessunit`) — used by Patch #2. */
  businessUnitId?: string | null;
}

export interface ProjectStateRef {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
  clusterDescription?: string | null;
}

export interface GeneralDataRefData {
  countries: CountryRef[];
  /** Country ids known to have at least one `CountryAreas` row. */
  countryIdsWithAreas: string[];
  projectStates: ProjectStateRef[];
  /** `gblEnvironmentName` — "Budgeting" unlocks the project-name rules. */
  environmentName: string;
  language: Lang;
}

/** The persisted `Projects` row, as read (raw values, no formatting). */
export interface ProjectRow {
  id: string;
  /** 'Project ID' (`vsb_name`) */
  projectNumber: string | null;
  internalProjectId: string | null;
  projectName: string | null;
  originalProjectName: string | null;
  shortName: string | null;
  projectType: number | null;
  spvName: string | null;
  spvCompanyCode: number | null;
  spvLegalStructure: number | null;
  countryId: string | null;
  areaId: string | null;
  district: string | null;
  municipality: string | null;
  utilizationId: string | null;
  terrainSize: number | null;
  latitude: number | null;
  longitude: number | null;
  technology: number | null;
  approvalState: number | null;
  statecode: number | null;
  clusterStateId: string | null;
  clusterStateName: string | null;
  taxFactor: number | null;
  owningBusinessUnitId: string | null;
  shareOfFarmdown: number | null;
  isStandardShareOfFarmdown: boolean | null;
  standardCostCreated: boolean | null;
  developmentType: number | null;
  startCluster: number | null;
  acquisitionDate: string | null;
  acquisitionPrice: number | null;
  managerId: string | null;
  managerName: string | null;
  deputyManagerId: string | null;
  deputyManagerName: string | null;
  projectStartDate: string | null;
  feasibilityStudies: string | null;
  projectDevelopmentStarted: string | null;
  applicationSubmitted: string | null;
  legallyBindingPermits: string | null;
  fid: string | null;
  construction: string | null;
  cod: string | null;
  createdByName: string | null;
  createdOn: string | null;
  modifiedByName: string | null;
  modifiedOn: string | null;
}

/** The persisted project, in the shape the rules need. */
export interface ProjectSnapshot {
  id: string | null;
  /** 'Project ID' */
  projectNumber: string | null;
  internalProjectId: string | null;
  /** `'Project Name'` as stored — the Budgeting rule requires it non-blank. */
  projectName?: string | null;
  /** `'Original Project Name'` — what a Budgeting rename must start with. */
  originalProjectName: string | null;
  approvalState: number | null;
  /** Dataverse's active/inactive `statecode` — distinct from the cluster-state workflow. */
  statecode: number | null;
  clusterStateId: string | null;
  clusterStateName: string | null;
  clusterStateOrder: number | null;
  countryId: string | null;
  countryName: string | null;
  countryKey: string | null;
  /** `'Besitzer (Unternehmenseinheit)'` — the project's owning business unit. */
  besitzerBusinessUnitId: string | null;
  startCluster: number | null;
  /** The project's own `Technology` option value (the CalendarAdd lookups use it). */
  technology?: number | null;
  shareOfFarmdown: number | null;
  isStandardShareOfFarmdown: boolean | null;
  standardCostCreated: boolean | null;
  /** The eight dates the Start-Cluster classifier and the cluster panel look at. */
  projectStartDate: string | null;
  feasibilityStudies: string | null;
  projectDevelopmentStarted: string | null;
  applicationSubmitted: string | null;
  legallyBindingPermits: string | null;
  fid: string | null;
  construction: string | null;
  cod: string | null;
}

/** `gblRecordSelectedProject` in the shape the rules use. */
export function toSnapshot(row: ProjectRow, ref: Pick<GeneralDataRefData, "countries" | "projectStates">): ProjectSnapshot {
  const country = ref.countries.find((c) => c.id === row.countryId);
  const state = ref.projectStates.find((s) => s.id === row.clusterStateId);
  return {
    id: row.id,
    projectNumber: row.projectNumber,
    internalProjectId: row.internalProjectId,
    projectName: row.projectName,
    originalProjectName: row.originalProjectName,
    approvalState: row.approvalState,
    statecode: row.statecode,
    clusterStateId: row.clusterStateId,
    clusterStateName: state?.name ?? row.clusterStateName,
    clusterStateOrder: state ? state.order : null,
    countryId: row.countryId,
    countryName: country?.name ?? null,
    countryKey: country?.key ?? null,
    besitzerBusinessUnitId: row.owningBusinessUnitId,
    startCluster: row.startCluster,
    technology: row.technology,
    shareOfFarmdown: row.shareOfFarmdown,
    isStandardShareOfFarmdown: row.isStandardShareOfFarmdown,
    standardCostCreated: row.standardCostCreated,
    projectStartDate: row.projectStartDate,
    feasibilityStudies: row.feasibilityStudies,
    projectDevelopmentStarted: row.projectDevelopmentStarted,
    applicationSubmitted: row.applicationSubmitted,
    legallyBindingPermits: row.legallyBindingPermits,
    fid: row.fid,
    construction: row.construction,
    cod: row.cod,
  };
}

/**
 * Every control's `Default` / `DefaultSelectedItems`, from the record (B1, Y:20-203):
 *  - Project ID shows `'Internal Project ID'` (Y:1164);
 *  - Latitude / Longitude are `Text(Round(x, 6), "#0.0#######")`;
 *  - Acquisition Price is `Text(price, "###,###,###,###,###", Language())`;
 *  - Tax Factor is `locTaxFactorPercentage = Coalesce('Tax Factor [%]', Value(LookUp(
 *    colAssumptionsGermanyTaxSQL, municipality = project.Municipality, tradetaxrate)))` —
 *    `fallbackTaxRate` is that lookup, done by the caller, and applied for a German project only
 *    (SOURCE DEFECT fixed, see `taxFactorFallbackMunicipality`);
 *  - Start Cluster is blank for Own Development and for a Greenfield start (Y:2581-2596).
 */
export function toForm(
  row: ProjectRow,
  ref: Pick<GeneralDataRefData, "countries">,
  language: Lang,
  fallbackTaxRate?: string | number | null,
): GeneralDataForm {
  const countryName = ref.countries.find((c) => c.id === row.countryId)?.name ?? null;
  const developmentType = row.developmentType ?? CHOICE.developmentType.ownDevelopment;
  const acquired = developmentType === CHOICE.developmentType.acquiredProject;
  const fallback = typeof fallbackTaxRate === "number"
    ? fallbackTaxRate : parseNumber(fallbackTaxRate ?? "", language);
  const tax = row.taxFactor ?? (countryName !== "Germany" || Number.isNaN(fallback) ? null : fallback);
  return {
    projectName: row.projectName ?? "",
    shortName: row.shortName ?? "",
    projectType: row.projectType,
    managerEntraRowId: row.managerId,
    managerName: row.managerName,
    deputyManagerEntraRowId: row.deputyManagerId,
    deputyManagerName: row.deputyManagerName,
    spvName: row.spvName ?? "",
    spvCompanyCode: row.spvCompanyCode === null ? "" : String(row.spvCompanyCode),
    spvLegalStructure: row.spvLegalStructure,
    countryId: row.countryId,
    areaId: row.areaId,
    district: row.district ?? "",
    municipality: row.municipality ?? "",
    municipalityGermany: countryName === "Germany" && !isBlank(row.municipality) ? row.municipality : null,
    municipalityFrance: countryName === "France" && !isBlank(row.municipality) ? row.municipality : null,
    utilizationId: row.utilizationId,
    terrainSize: row.terrainSize === null ? "" : String(row.terrainSize).replace(".", decimalSeparator(language)),
    latitude: coordinateText(row.latitude, language),
    longitude: coordinateText(row.longitude, language),
    taxFactor: tax === null ? "" : String(tax),
    technology: row.technology === null ? null : TECHNOLOGY_LABEL[row.technology] ?? null,
    developmentType,
    startCluster: acquired && row.startCluster !== null && row.startCluster !== 0 ? row.startCluster : null,
    acquisitionDate: row.acquisitionDate ? row.acquisitionDate.slice(0, 10) : null,
    acquisitionPrice: row.acquisitionPrice === null ? "" : formatInteger(row.acquisitionPrice, language),
  };
}

/**
 * Which municipality the Tax Factor default is looked up by — or null for no lookup.
 *
 * SOURCE DEFECT (`OnVisible`, Y:187-200): the canvas looks the project's municipality up in the
 * GERMAN trade-tax table whatever the project's country, so a non-German project whose municipality
 * shares a German name got that German rate as its tax factor on the next save. Only the German
 * table carries a rate (`vsb_tradetaxrate`; the French one is a municipality list), so the fix
 * (PO decision 19 Oct, D25) looks the rate up for a German project only; France keeps the canvas
 * behaviour (a French pick clears the tax %) and other countries are manual entry.
 * `taxFactorFallbackMunicipalityCanvasParity` keeps the canvas rule.
 */
export function taxFactorFallbackMunicipality(
  row: Pick<ProjectRow, "taxFactor" | "municipality" | "countryId">,
  countries: readonly CountryRef[],
): string | null {
  const germany = countries.find((c) => c.id === row.countryId)?.name === "Germany";
  return germany ? taxFactorFallbackMunicipalityCanvasParity(row) : null;
}

/** The canvas rule: any country with a blank tax factor and a municipality. */
export const taxFactorFallbackMunicipalityCanvasParity = (
  row: Pick<ProjectRow, "taxFactor" | "municipality">,
): string | null => (row.taxFactor === null && !isBlank(row.municipality) ? row.municipality : null);

/** The fields a save writes — names and mails of the pickers are display only. */
const DIRTY_FIELDS: readonly (keyof GeneralDataForm)[] = [
  "projectName", "shortName", "projectType", "managerEntraRowId", "deputyManagerEntraRowId",
  "spvName", "spvCompanyCode", "spvLegalStructure", "countryId", "areaId", "district",
  "municipality", "municipalityGermany", "municipalityFrance", "utilizationId", "terrainSize",
  "latitude", "longitude", "taxFactor", "technology", "developmentType", "startCluster",
  "acquisitionDate", "acquisitionPrice",
];

/**
 * `locIsGeneralFormDirty`. The canvas sets it from each field's `OnChange` when the value differs
 * from the record and never clears it on a revert; here it is derived, so typing a value back
 * makes the form clean again (DIVERGENCE, D25 — the save it allows is the same save).
 */
export function isFormDirty(form: GeneralDataForm, baseline: GeneralDataForm): boolean {
  return DIRTY_FIELDS.some((k) => (form[k] ?? null) !== (baseline[k] ?? null));
}

/* ═════════════════════════════════════════════════════════════ field side effects ════ */

/**
 * `drp_…_Country.OnChange` (Y:3207-3218) — `Reset` restores each control's DEFAULT, which is
 * the record's value: Terrain Size, the French municipality and SPV Legal Structure go back to
 * the project's; Tax Factor goes blank (`locTaxFactorPercentage: Blank()`).
 *
 * CORRECTED (D25): the old rule blanked all of them. The Area and the German municipality are
 * scoped to the country (`Filter(CountryAreas, Country = selected)`, the German list by
 * `state`), so they keep the record's value only while the record's country is selected.
 */
export function onCountryChange(form: GeneralDataForm, baseline: GeneralDataForm, countryId: string | null): GeneralDataForm {
  const same = countryId === baseline.countryId;
  return {
    ...form,
    countryId,
    terrainSize: baseline.terrainSize,
    municipalityFrance: baseline.municipalityFrance,
    spvLegalStructure: baseline.spvLegalStructure,
    taxFactor: "",
    areaId: same ? baseline.areaId : null,
    municipalityGermany: same ? baseline.municipalityGermany : null,
  };
}

/**
 * `drp_…_Area.OnChange` (Y:3371-3380) — Tax Factor goes blank. The German list is filtered by
 * the area's state, so its selection only survives on the record's own area.
 */
export function onAreaChange(form: GeneralDataForm, baseline: GeneralDataForm, areaId: string | null): GeneralDataForm {
  return {
    ...form,
    areaId,
    taxFactor: "",
    municipalityGermany: areaId === baseline.areaId ? baseline.municipalityGermany : null,
  };
}

/**
 * `txt_…_SPVName.OnChange` (Y:1511-1520) — emptying the SPV name resets SPV Company Code and
 * SPV Legal Structure to their defaults (the record's values).
 */
export function onSpvNameChange(form: GeneralDataForm, baseline: GeneralDataForm, spvName: string): GeneralDataForm {
  if (spvName.length > 0) return { ...form, spvName };
  return {
    ...form, spvName,
    spvCompanyCode: baseline.spvCompanyCode,
    spvLegalStructure: baseline.spvLegalStructure,
  };
}

/**
 * `drp_…_ProjectDevelopment.OnChange` (Y:2459) — resets Start Cluster, Acquisition Date and
 * Acquisition Price to their defaults. Start Cluster's default depends on the NEW type: blank
 * for Own Development, else the record's start cluster unless it is Greenfield.
 */
export function onDevelopmentTypeChange(
  form: GeneralDataForm,
  baseline: GeneralDataForm,
  snapshot: Pick<ProjectSnapshot, "startCluster"> | null,
  developmentType: number | null,
): GeneralDataForm {
  const acquired = developmentType === CHOICE.developmentType.acquiredProject;
  const sc = snapshot?.startCluster ?? null;
  return {
    ...form,
    developmentType,
    startCluster: acquired && sc !== null && sc !== 0 ? sc : null,
    acquisitionDate: baseline.acquisitionDate,
    acquisitionPrice: baseline.acquisitionPrice,
  };
}

/**
 * `cmb_…_Municipality_Germany.OnChange` (Y:3652) — the pick sets `locMunicipality` and copies its
 * trade-tax rate into Tax Factor (`Value(Selected.tradetaxrate)`).
 */
export function applyGermanMunicipality(
  municipality: { municipality: string; tradetaxrate: string | number | null },
  language: Lang = "en-US",
): Partial<GeneralDataForm> {
  const rate = typeof municipality.tradetaxrate === "number"
    ? municipality.tradetaxrate
    : parseNumber(municipality.tradetaxrate ?? "", language);
  return {
    municipalityGermany: municipality.municipality,
    taxFactor: Number.isNaN(rate) ? "" : String(rate),
  };
}

/** `cmb_…_Municipality_France_1.OnChange` (Y:3693-3709) — the pick clears the tax factor. */
export const applyFrenchMunicipality = (municipality: string): Partial<GeneralDataForm> =>
  ({ municipalityFrance: municipality, taxFactor: "" });

/* ══════════════════════════════════════════════════ shareholding entities ════ */

export interface ShareholdingEntity {
  /** Client-side key; stable across edits so `remainingPct` can exclude the row. */
  key: string;
  /** Dataverse id, absent for a row that has never been written. */
  recordId?: string | null;
  entityTypeValue: number | null;
  customName: string;
  /** Stored as a FRACTION: 33.33 % is 0.3333. */
  ownership: number;
}

/** `'Ownership [%]': Round(Value(pct) / 100, 4)` (Y:6872). */
export function ownershipFraction(pct: number | string, language: Lang = "en-US"): number {
  const n = typeof pct === "number" ? pct : parseNumber(pct, language);
  return Number.isNaN(n) ? NaN : pfxRound(n / 100, 4);
}

export const shareholdingSum = (entities: ShareholdingEntity[]): number =>
  pfxRound(entities.reduce((a, e) => a + (e.ownership || 0), 0), 4);

/** `Sum(colShareholdingEntities, 'Ownership [%]') = 1` — a Save gate (Y:5079-5082). */
export const isShareholdingComplete = (entities: ShareholdingEntity[]): boolean =>
  shareholdingSum(entities) === 1;

/** `btn_general_data_shareholding_entity_add_new.DisplayMode: If(Sum < 1, Edit, Disabled)` (Y:4533). */
export const canAddShareholder = (entities: ShareholdingEntity[]): boolean =>
  shareholdingSum(entities) < 1;

/**
 * `varSumEntitiesPercent: Round(1 - (Sum(all) - editing.'Ownership [%]'), 4) * 100` — how much a
 * new or edited entity may claim.
 */
export function remainingPct(entities: ShareholdingEntity[], editingKey?: string | null): number {
  const editing = editingKey ? entities.find((e) => e.key === editingKey) : undefined;
  const others = shareholdingSum(entities) - (editing?.ownership ?? 0);
  // `0.3 * 100` is 30.000000000000004 in IEEE 754; Power Fx decimals have no such tail.
  return pfxRound(pfxRound(1 - others, 4) * 100, 4);
}

/** `'Custom Name'` is shown, required and stored only for Third Party. */
export const isThirdParty = (entityTypeValue: number | null | undefined): boolean =>
  entityTypeValue === CHOICE.shareholderEntityType.thirdParty;

/**
 * The gallery's Description cell: `If(Not(IsBlank(ThisItem.'Custom Name')), ThisItem.'Custom
 * Name', ThisItem.'Shareholder Entitiy Type')` (Y:4767).
 */
export function shareholdingDescription(e: ShareholdingEntity): string {
  return !isBlank(e.customName) ? e.customName : shareholderTypeLabel(e.entityTypeValue);
}

/**
 * SOURCE DEFECT (`cmp_GeneralData_PopUp_ConfirmationDeleteShareholdingEntity.Description`,
 * Y:8735): `If(Not(IsBlank(Name)), Text(type), 'Custom Name')` names a saved row by its TYPE
 * (so a Third Party row reads "Third Party", not its name) and an unsaved non-Third-Party row by
 * its blank custom name (`'…'`). Fixed: the dialog names the row as the gallery does.
 */
export const deleteShareholderName = (e: ShareholdingEntity): string => shareholdingDescription(e);

/** The canvas original of `deleteShareholderName`, kept for the decision record (D25). */
export const deleteShareholderNameCanvasParity = (e: ShareholdingEntity): string =>
  e.recordId ? shareholderTypeLabel(e.entityTypeValue) : e.customName;

export interface ShareholderDraft {
  key: string;
  recordId?: string | null;
  entityTypeValue: number | null;
  customName: string;
  /** As typed, in percent. */
  percent: string;
  /** The type of the row being edited — `locShareholdingEntity.'Shareholder Entitiy Type'`. */
  originalTypeValue?: number | null;
  /** `locIShareholdingEntityFormDirty` */
  dirty?: boolean;
}

export interface ShareholderPanelErrors {
  /** `lbl_ShareholderEntity_Error_GeneralTab` */
  duplicate?: string;
  /** `lbl_…_CustomName_ErrorMessage` */
  customName?: string;
  /** `lbl_…_Percentage_ErrorMessage` */
  percent?: string;
}

/**
 * The entity and ownership containers are hidden while the sum is already 100 % and a NEW row is
 * being added; `lbl_…_Percentage_ErrorMessage_1` shows instead (Y:6308-6324, Y:6747-6779).
 */
export const shareholderPanelFull = (entities: ShareholdingEntity[], draft: ShareholderDraft): boolean =>
  shareholdingSum(entities) >= 1 && (draft.originalTypeValue ?? null) === null;

/** The shareholding panel's messages, as the canvas labels show them. */
export function shareholderPanelErrors(
  draft: ShareholderDraft,
  entities: ShareholdingEntity[],
  language: Lang = "en-US",
): ShareholderPanelErrors {
  const out: ShareholderPanelErrors = {};
  // `Selected.Value in colShareholdingEntities.'Shareholder Entitiy Type' && Selected.Value <> loc…Type`
  if (
    draft.entityTypeValue !== null
    && draft.entityTypeValue !== (draft.originalTypeValue ?? null)
    && entities.some((e) => e.entityTypeValue === draft.entityTypeValue)
  ) {
    out.duplicate = MSG.shareholderAlreadyAdded;
  }
  // CORRECTED (D25): the canvas text is `gblAppResx.InputBlank`, shown only for Third Party.
  if (isThirdParty(draft.entityTypeValue) && isBlank(draft.customName.trim())) {
    out.customName = MSG.inputBlank;
  }
  const max = remainingPct(entities, draft.key);
  if (isBlank(draft.percent)) {
    out.percent = MSG.inputBlank;
  } else if (!isTwoDecimal(draft.percent, language)) {
    out.percent = MSG.shareholdingPercentShape;
  } else if (!inRange(draft.percent, 0.1, max, language)) {
    /*
     * SOURCE DEFECT (Y:6624-6660): the label's Text tests `Or(Not(IsInteger), Not(IsOneDecimal),
     * Not(IsTwoDecimal))`, which is true for any non-integer such as "12.5", while its Visible
     * shows the label only when the value is out of range — so an out-of-range "12.5" showed
     * "Percentage must be number with two decimal place." instead of the range. Fixed: the shape
     * text only for a malformed value, the range text for an out-of-range one.
     */
    out.percent = shareholdingRangeMessage(draft.percent, max, language);
  }
  return out;
}

/**
 * `pcf_btn_…_ShareholdingEntity_Form_Buttons_Save.DisplayMode` (Y:6810-6828): panel dirty, a type
 * picked, a custom name for Third Party, a percentage, and no percentage error.
 *
 * SOURCE DEFECT: the canvas gate ignores `lbl_ShareholderEntity_Error_GeneralTab`, so the same
 * entity could be added twice although the panel said "already added". Fixed: a duplicate blocks
 * the save. `canSaveShareholderPanelCanvasParity` keeps the canvas gate.
 */
export function canSaveShareholderPanel(
  draft: ShareholderDraft, entities: ShareholdingEntity[], language: Lang = "en-US",
): boolean {
  return canSaveShareholderPanelCanvasParity(draft, entities, language)
    && !shareholderPanelErrors(draft, entities, language).duplicate;
}

export function canSaveShareholderPanelCanvasParity(
  draft: ShareholderDraft, entities: ShareholdingEntity[], language: Lang = "en-US",
): boolean {
  const e = shareholderPanelErrors(draft, entities, language);
  return Boolean(draft.dirty)
    && draft.entityTypeValue !== null
    && (!isThirdParty(draft.entityTypeValue) || (!isBlank(draft.customName.trim()) && !e.customName))
    && !isBlank(draft.percent.trim())
    && !e.percent;
}

/**
 * Panel Save → the collection row (`Patch(colShareholdingEntities, …)`, Y:6846-6874). Custom Name is
 * kept only for Third Party.
 */
export function applyShareholderDraft(
  entities: ShareholdingEntity[],
  draft: ShareholderDraft,
  language: Lang = "en-US",
): ShareholdingEntity[] {
  const row: ShareholdingEntity = {
    key: draft.key,
    recordId: draft.recordId ?? null,
    entityTypeValue: draft.entityTypeValue,
    customName: isThirdParty(draft.entityTypeValue) ? draft.customName : "",
    ownership: ownershipFraction(draft.percent, language),
  };
  const i = entities.findIndex((e) => e.key === draft.key);
  if (i < 0) return [...entities, row];
  const next = [...entities];
  next[i] = row;
  return next;
}

/** The panel's percentage default: `Value('Ownership [%]') * 100` in the player's language. */
export const ownershipInputText = (fraction: number, language: Lang): string =>
  String(pfxRound(fraction * 100, 4)).replace(".", decimalSeparator(language));

/**
 * The delete confirmation (Y:8739): `Remove(colShareholdingEntities, row)` and, when the row
 * exists in Dataverse, `Remove(ShareholderEntityInProjects, …)` AT ONCE — not on Save.
 */
export function planShareholderDelete(entity: ShareholdingEntity): WritePlan {
  return {
    writes: entity.recordId
      ? [{
        op: "delete", entitySet: ES.shareholderEntityInProjects, id: entity.recordId,
        reason: "delete the shareholding entity",
      }]
      : [],
    log: [],
  };
}

/* ═══════════════════════════════════════════════════════ conditional fields ════ */

/**
 * `'Approval States'.Draft` — the option set's initial value. `dataverseNames.ts` names the same
 * value `notStarted`; the canvas calls it Draft on this screen.
 */
export const APPROVAL_STATE_DRAFT = CHOICE.approvalState.notStarted;

/** `vsb_startcluster` numbers its own options 0..6, so the canvas `Switch` is an identity map. */
export function startClusterNo(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return value >= 0 && value <= 6 ? value : 0;
}

/** "Cluster 5 and Cluster 6 have same milestone impact" — clamp at 5. */
export const milestoneImpactNo = (n: number): number => Math.min(n, 5);

/** The acquisition row only exists for an Acquired Project (Y:2514, Y:2554). */
export const isAcquisitionRowVisible = (developmentType: number | null | undefined): boolean =>
  developmentType === CHOICE.developmentType.acquiredProject;

/** Area is required only when the current or the selected country has areas (Y:3324). */
export function isAreaRequired(
  selectedCountryId: string | null | undefined,
  projectCountryId: string | null | undefined,
  countryIdsWithAreas: string[],
): boolean {
  return countryIdsWithAreas.some((id) => id === selectedCountryId || id === projectCountryId);
}

/** Terrain Size is shown and mandatory for country `Key = "25"` (Y:3975, Y:5063-5070). */
export function isTerrainSizeRequired(
  selectedCountryKey: string | null | undefined,
  projectCountryKey: string | null | undefined,
): boolean {
  return selectedCountryKey === TERRAIN_SIZE_COUNTRY_KEY
    || projectCountryKey === TERRAIN_SIZE_COUNTRY_KEY;
}

/** Germany and France must pick from their municipality list (Y:5110-5121). */
export function isMunicipalityRequired(countryName: string | null | undefined):
  "germany" | "france" | null {
  if (countryName === "Germany") return "germany";
  if (countryName === "France") return "france";
  return null;
}

export type MunicipalityMode = "germany" | "france" | "text";
export const municipalityMode = (countryName: string | null | undefined): MunicipalityMode =>
  countryName === "Germany" ? "germany" : countryName === "France" ? "france" : "text";

/**
 * The French list is empty below three characters
 * (`If(Len(Self.SearchText) < 3, Filter(colAssumptionsFranceSQL, false), …)`, Y:3673).
 */
export const franceSearchIsSuppressed = (searchText: string): boolean =>
  searchText.length < 3;

/** SPV legal structure is required only for Germany with an SPV name present (Y:1631-1639). */
export const isSpvLegalStructureRequired = (
  countryName: string | null | undefined,
  spvName: string,
): boolean => countryName === "Germany" && spvName !== "";

/** `con_…_SPVLegalStructure.Visible: Country = "Germany"` (Y:1578). */
export const isSpvLegalStructureVisible = (countryName: string | null | undefined): boolean =>
  countryName === "Germany";

/** `con_…_SPVCompanyCode.Visible: Len(SPV Name) <> 0` (Y:1689). */
export const isSpvCompanyCodeVisible = (spvName: string): boolean => spvName.length !== 0;

/* ═══════════════════════════════════════════════════════════ display modes ════ */

export type FieldMode = "edit" | "view";

/**
 * `drp_…_Country.Items` (Y:3180-3206) — scoped to the caller's editable countries UNLESS the scope
 * is empty or the project's own country falls outside it.
 */
export function countryOptions(
  all: CountryRef[],
  editable: CountryScope[],
  projectCountryName: string | null | undefined,
): CountryRef[] {
  if (!editable.length) return all;
  if (projectCountryName && !editable.some((c) => c.name === projectCountryName)) return all;
  return all.filter((c) => editable.some((e) => e.id === c.id));
}

/** `drp_…_Country.DisplayMode` (Y:3153-3179). */
export function countryDisplayMode(args: {
  approvalState: number | null;
  canCreate: boolean;
  countryInScope: boolean;
}): FieldMode {
  if (args.approvalState === CHOICE.approvalState.approved) return "view";
  if (!args.canCreate) return "view";
  if (!args.countryInScope) return "view";
  return "edit";
}

/**
 * Which of Name, Short Name and Area lock once the project is past Draft.
 *
 * CANVAS 1.21.753 DELTA (`ProjectDocs/app-docs/1.21.753-REQUIRED-CHANGES.md` V2): Project Name and
 * Short Name no longer lock; Area still does. The 1.21.709 rule on disk (Y:1269-1283, Y:1397-1402)
 * is kept as `fieldModesCanvas709` so the change stays reversible.
 */
export function fieldModes(args: {
  clusterStateOrder: number | null;
  environmentName: string;
}): { projectName: FieldMode; shortName: FieldMode; area: FieldMode } {
  const advanced = (args.clusterStateOrder ?? 0) >= 1;
  return { projectName: "edit", shortName: "edit", area: advanced ? "view" : "edit" };
}

/** The 1.21.709 rule, before the delta above. Not used by the screen. */
export function fieldModesCanvas709(args: {
  clusterStateOrder: number | null;
  environmentName: string;
}): { projectName: FieldMode; shortName: FieldMode; area: FieldMode } {
  const advanced = (args.clusterStateOrder ?? 0) >= 1;
  return {
    projectName: args.environmentName === "Budgeting" ? "edit" : advanced ? "view" : "edit",
    shortName: advanced ? "view" : "edit",
    area: advanced ? "view" : "edit",
  };
}

/** The other state-dependent locks of the form. */
export interface FormLocks {
  /** `drp_…_Technology.DisplayMode: If(Order >= 1, View, Edit)` (Y:1916-1921). */
  technology: boolean;
  /** `drp_…_ProjectDevelopment.DisplayMode: If(Coalesce(Order, 0) > 0, Disabled, Edit)` (Y:2451-2457). */
  developmentType: boolean;
  /** `drp_…_ClusterChange.DisplayMode`: not Acquired, or Order > 0 (Y:2597-2606). */
  startCluster: boolean;
  /** `dte_…_Acquisition_Date.DisplayMode` (Y:2787-2818). */
  acquisitionDate: boolean;
  /** `lbl_…_ProjectName_Requered` / `…_ShortName_Requered` hidden when Approved (Y:1348, Y:1467). */
  hideNameAsterisks: boolean;
}

export function formLocks(form: GeneralDataForm, project: ProjectSnapshot | null): FormLocks {
  const order = project?.clusterStateOrder ?? 0;
  const acquired = isAcquisitionRowVisible(form.developmentType);
  return {
    technology: order >= 1,
    developmentType: order > 0,
    startCluster: !acquired || order > 0,
    acquisitionDate: !acquired || (form.startCluster !== null && order >= startClusterNo(form.startCluster)),
    hideNameAsterisks: project?.approvalState === CHOICE.approvalState.approved,
  };
}

/* ════════════════════════════════════════════════════════════════ the map ════ */

export const MAP_DEFAULT = { lat: 51.28474541372019, lng: 13.712023258608735 } as const;

/**
 * `Coalesce(locChangedLatitude2, Location.Latitude, "51.28474541372019")` (Y:4365-4417). Kept for
 * the map control, which this app does not have yet (documented gap, D25).
 */
export function mapMarker(
  form: Pick<GeneralDataForm, "latitude" | "longitude">,
  geolocation?: { lat: number; lng: number } | null,
  language: Lang = "en-US",
): { lat: number; lng: number } {
  const lat = parseNumber(form.latitude, language);
  const lng = parseNumber(form.longitude, language);
  return {
    lat: !Number.isNaN(lat) ? lat : geolocation?.lat ?? MAP_DEFAULT.lat,
    lng: !Number.isNaN(lng) ? lng : geolocation?.lng ?? MAP_DEFAULT.lng,
  };
}

/**
 * The Latitude / Longitude error label (Y:4144-4145, Y:4261-4276): not six-decimal (blank
 * included) → the axis's format text; else out of range → the range text.
 */
export function coordinateMessage(
  raw: string,
  axis: "lat" | "lng",
  language: Lang = "en-US",
): string | null {
  if (!isSixDecimal(raw, language)) return coordinateFormatMessage(axis, language);
  const [min, max] = axis === "lat" ? [-90, 90] : [-180, 180];
  if (!inRange(raw, min, max, language)) {
    return axis === "lat" ? MSG.latitudeRange : MSG.longitudeRange;
  }
  return null;
}

/** A coordinate pair a map could pin. */
export function isCoordinateValid(raw: string, axis: "lat" | "lng", language: Lang = "en-US"): boolean {
  return coordinateMessage(raw, axis, language) === null;
}

/* ═════════════════════════════════════════════════════════════ validation ════ */

export interface ValidationContext {
  form: GeneralDataForm;
  ref: GeneralDataRefData;
  project: ProjectSnapshot | null;
  entities: ShareholdingEntity[];
  /** True when at least one row exists in `ShareholderEntityInProjects` for the project. */
  hasPersistedShareholders?: boolean;
}

export type FieldKey =
  | "projectName" | "shortName" | "manager" | "country" | "technology" | "area"
  | "terrainSize" | "latitude" | "longitude" | "spvCompanyCode" | "spvLegalStructure"
  | "municipalityGermany" | "municipalityFrance" | "taxFactor" | "startCluster"
  | "developmentType" | "acquisitionDate" | "acquisitionPrice";

/** The order `ibtn_…_Requered_Fileds.Content` lists the messages in (Y:5850-5945). */
const REQUIRED_FIELDS_ORDER: readonly FieldKey[] = [
  "projectName", "shortName", "manager", "country", "technology", "area", "terrainSize",
  "latitude", "longitude", "spvCompanyCode", "spvLegalStructure", "municipalityGermany",
  "municipalityFrance", "taxFactor", "startCluster", "developmentType", "acquisitionDate",
  "acquisitionPrice",
];

const countryOf = (ctx: ValidationContext): CountryRef | undefined =>
  ctx.ref.countries.find((c) => c.id === (ctx.form.countryId ?? ctx.project?.countryId));

/** Every error label that is currently visible, keyed by field, with the label's text. */
export function fieldErrors(ctx: ValidationContext): Partial<Record<FieldKey, string>> {
  const { form, ref, project } = ctx;
  const lang = ref.language;
  const out: Partial<Record<FieldKey, string>> = {};
  const country = countryOf(ctx);

  /* project name (Y:1230-1258) */
  const name = form.projectName.trim();
  const original = project?.originalProjectName ?? null;
  if (isBlank(name) || name.length < 3) {
    out.projectName = MSG.projectName;
  } else if (
    ref.environmentName === "Budgeting"
    && !isBlank(project?.projectName ?? null)
    && !form.projectName.startsWith(original ?? "")
  ) {
    out.projectName = budgetingRenameMessage(original ?? "");
  }

  const short = form.shortName.trim();
  if (isBlank(short) || short.length < 3) out.shortName = MSG.shortName;
  if (isBlank(form.managerEntraRowId)) out.manager = MSG.manager;
  if (isBlank(form.countryId)) out.country = MSG.country;
  if (isBlank(form.technology)) out.technology = MSG.technology;
  if (isAreaRequired(form.countryId, project?.countryId, ref.countryIdsWithAreas) && isBlank(form.areaId)) {
    out.area = MSG.area;
  }

  /* terrain size — shown and checked only for country key "25" (Y:3991-4030) */
  if (isTerrainSizeRequired(country?.key, project?.countryKey)) {
    if (isBlank(form.terrainSize)) out.terrainSize = MSG.inputBlank;
    else if (!isOneDecimal(form.terrainSize, lang)) out.terrainSize = MSG.numericOneDecimals;
    else if (!inRange(form.terrainSize, 0.1, 1000, lang)) out.terrainSize = terrainRangeMessage(lang);
  }

  const lat = coordinateMessage(form.latitude, "lat", lang);
  if (lat) out.latitude = lat;
  const lng = coordinateMessage(form.longitude, "lng", lang);
  if (lng) out.longitude = lng;

  /*
   * SPV Company Code (Y:1787-1829): blank while an SPV name is set, or a value outside
   * 1000..9999. CORRECTED (D25): the blank check had been dropped on the strength of a GUIDE
   * screenshot; the control exists on the canvas and on this screen, and the canvas blocks Save.
   */
  if (form.spvName.length !== 0 && form.spvCompanyCode.length === 0) out.spvCompanyCode = MSG.spvCodeBlank;
  else if (form.spvCompanyCode.length !== 0 && !inRange(form.spvCompanyCode, 1000, 9999, lang)) {
    out.spvCompanyCode = MSG.spvCodeShape;
  }
  if (isSpvLegalStructureRequired(country?.name, form.spvName) && form.spvLegalStructure === null) {
    out.spvLegalStructure = MSG.spvLegalStructure;
  }

  const muni = isMunicipalityRequired(country?.name);
  if (muni === "germany" && isBlank(form.municipalityGermany)) out.municipalityGermany = MSG.municipalityGermany;
  if (muni === "france" && isBlank(form.municipalityFrance)) out.municipalityFrance = MSG.municipalityFrance;

  /* tax factor — integer 0..1000 (Y:3748-3816) */
  if (!isBlank(form.taxFactor)) {
    if (!isInteger(form.taxFactor, lang)) out.taxFactor = MSG.taxFactorShape;
    else if (!inRange(form.taxFactor, 0, 1000, lang)) out.taxFactor = MSG.taxFactorRange;
  }

  /* start cluster + acquisition — only while the acquisition row is visible */
  if (isAcquisitionRowVisible(form.developmentType)) {
    if (form.startCluster === null) out.startCluster = MSG.startCluster;
    if (isBlank(form.acquisitionDate)) out.acquisitionDate = MSG.acquisitionDate;
    // `fn_Numeric_With_Separtors.IsInteger` / `.InRange` — the grouped text, separators stripped.
    if (isBlank(form.acquisitionPrice.trim())) {
      out.acquisitionPrice = MSG.acquisitionPriceBlank;
    } else if (
      !isInteger(form.acquisitionPrice.trim().split(groupSeparatorOf(lang)).join(""), lang)
      || !inRange(form.acquisitionPrice, 0, 1_000_000_000, lang)
    ) {
      out.acquisitionPrice = acquisitionPriceShapeMessage(lang);
    }
  }
  if (form.developmentType === null) out.developmentType = MSG.developmentType;

  return out;
}

/** The group separator the price field is formatted with (`Text(price, "###,###", Language())`). */
const groupSeparatorOf = (lang: Lang): string => (decimalSeparator(lang) === "." ? "," : ".");

/** Every visible error label's text, in the canvas `ibtn` order. */
export function validationMessages(ctx: ValidationContext): string[] {
  const errors = fieldErrors(ctx);
  return REQUIRED_FIELDS_ORDER.flatMap((k) => (errors[k] ? [errors[k]!] : []));
}

/**
 * `ibtn_…_Requered_Fileds.Content` (Y:5850-5945): the same list, with the terrain row's own text
 * and the 100 % row after Longitude. Empty → the "Required fields" hint is hidden.
 */
export function requiredFieldsContent(ctx: ValidationContext): string[] {
  const errors = fieldErrors(ctx);
  const out: string[] = [];
  for (const k of REQUIRED_FIELDS_ORDER) {
    if (errors[k]) out.push(k === "terrainSize" ? MSG.terrainRequiredFields : errors[k]!);
    if (k === "longitude" && !isShareholdingComplete(ctx.entities)) out.push(MSG.shareholdingSumRequired);
  }
  return out;
}

export interface SavePermissions {
  /** `DataSourceInfo(Projects, CreatePermission)` — server-derived. */
  canCreate: boolean;
  /** `RecordInfo(gblRecordSelectedProject, EditPermission)` — server-derived. */
  canEdit: boolean;
}

/**
 * `pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save.DisplayMode` (Y:5021-5128).
 *
 * CORRECTED (D25): the 100 % ownership gate (`Sum(colShareholdingEntities, 'Ownership [%]') = 1`)
 * is back. It had been turned into a warning on the strength of a GUIDE screenshot.
 */
export function canSave(ctx: ValidationContext & {
  perms: SavePermissions;
  isDirty: boolean;
}): boolean {
  const { perms, isDirty, project, entities, form } = ctx;
  const permitted = project?.id ? perms.canEdit : perms.canCreate;
  if (!permitted || !isDirty) return false;
  if (isBlank(form.projectName.trim()) || isBlank(form.shortName.trim())) return false;
  if (isBlank(form.technology) || isBlank(form.managerEntraRowId)) return false;
  if (isBlank(form.latitude.trim()) || isBlank(form.longitude.trim())) return false;
  if (entities.length === 0 && !ctx.hasPersistedShareholders) return false;
  if (!isShareholdingComplete(entities)) return false;
  return validationMessages(ctx).length === 0;
}

/* ══════════════════════════════════════════════ start-cluster classification ════ */

export type StartClusterChange = "direct-save" | "panel-upward" | "panel-downward";

/** `varHasAnyMilestoneData` — is there any milestone date at all? */
export function hasAnyMilestoneData(p: ProjectSnapshot | null): boolean {
  if (!p) return false;
  return [
    p.projectStartDate, p.feasibilityStudies, p.projectDevelopmentStarted,
    p.applicationSubmitted, p.legallyBindingPermits, p.fid, p.construction, p.cod,
  ].some((d) => !isBlank(d));
}

/** `varHasAnyMilestoneToDelete` — would the new start cluster blank anything? */
export function hasAnyMilestoneToDelete(p: ProjectSnapshot | null, newNo: number): boolean {
  if (!p) return false;
  return (
    (newNo >= 1 && !isBlank(p.projectStartDate))
    || (newNo >= 2 && !isBlank(p.feasibilityStudies))
    || (newNo >= 3 && !isBlank(p.projectDevelopmentStarted))
    || (newNo >= 4 && !isBlank(p.applicationSubmitted))
    || (newNo >= 5 && !isBlank(p.legallyBindingPermits))
  );
}

/** `varNewCluster` — the selected start cluster for Acquired, else Greenfield (Y:5182-5189). */
export const newStartClusterNo = (developmentType: number | null, selectedCluster: number | null): number =>
  developmentType === CHOICE.developmentType.acquiredProject ? startClusterNo(selectedCluster) : 0;

/**
 * `pcf_btn_…_Save.OnSelect` (Y:5132-5291) — save directly or open the cluster-change panel.
 */
export function classifyStartClusterChange(args: {
  developmentType: number | null;
  /** The project's current `Start Cluster`, blank meaning Greenfield. */
  previousCluster: number | null;
  /** The dropdown's selection. */
  selectedCluster: number | null;
  project: ProjectSnapshot | null;
}): StartClusterChange {
  const { developmentType, previousCluster, selectedCluster, project } = args;
  const previousNo = startClusterNo(previousCluster);
  const newNo = newStartClusterNo(developmentType, selectedCluster);

  if (developmentType === CHOICE.developmentType.ownDevelopment) return "direct-save";
  if (newNo === 0) return "direct-save";
  if (previousNo === newNo) return "direct-save";
  const prevImpact = milestoneImpactNo(previousNo);
  const newImpact = milestoneImpactNo(newNo);
  if (prevImpact === newImpact) return "direct-save";
  if (!hasAnyMilestoneData(project)) return "direct-save";
  if (newImpact > prevImpact && !hasAnyMilestoneToDelete(project, newNo)) return "direct-save";
  return newImpact > prevImpact ? "panel-upward" : "panel-downward";
}

/**
 * `locGeneralSaveStartClusterChanged` (Y:423-510) — `old <> new` by cluster NUMBER. This, not the
 * classifier, decides whether the tracking rebuild runs: a change that saves directly still
 * rebuilds.
 */
export const startClusterChanged = (
  project: Pick<ProjectSnapshot, "startCluster"> | null,
  form: Pick<GeneralDataForm, "developmentType" | "startCluster">,
): boolean =>
  startClusterNo(project?.startCluster ?? null) !== newStartClusterNo(form.developmentType, form.startCluster);

/* ═════════════════════════════════════════════════════════ save gating (D25) ════ */

export interface TrackingRow {
  id: string;
  clusterStateId: string;
  approvalClusterState: number | null;
  flowRunId: string | null;
}

/**
 * `btn_General_CancelActiveDraftGateApproval…` step 1 (Y:279-322) — the cancellation flow runs
 * only when the Draft tracking row has a `FlowRunId` AND is `In Progress`.
 */
export function shouldCancelGateApproval(draftTracking: TrackingRow | null | undefined): boolean {
  if (!draftTracking) return false;
  if (isBlank(draftTracking.flowRunId)) return false;
  return draftTracking.approvalClusterState === CHOICE.approvalClusterState.inProgress;
}

/**
 * DECISION (D25, product owner): `PerformRequestofGateApprovalCancellation` sends mails / Teams
 * cards, so this app does not call it. Rebuilding the trackings without it would blank the
 * running approval's `FlowRunId` and leave the approval alive in Outlook/Teams with nothing
 * pointing at it. So a start-cluster change is REFUSED exactly when the canvas would have called
 * the flow; every other start-cluster change saves and rebuilds as the canvas does.
 */
export function startClusterChangeBlocked(args: {
  project: ProjectSnapshot | null;
  form: GeneralDataForm;
  trackings: TrackingRow[];
  projectStates: ProjectStateRef[];
}): boolean {
  if (!args.project?.id || !startClusterChanged(args.project, args.form)) return false;
  const draft = args.projectStates.find((s) => s.name === "Draft");
  const draftTracking = draft ? args.trackings.find((t) => t.clusterStateId === draft.id) : undefined;
  return shouldCancelGateApproval(draftTracking);
}

/** Why Save is off although the canvas would allow it — or null. */
export function saveBlockReason(args: {
  project: ProjectSnapshot | null;
  form: GeneralDataForm;
  trackings: TrackingRow[];
  projectStates: ProjectStateRef[];
}): string | null {
  if (startClusterChangeBlocked(args)) return MSG.approvalInProgress;
  return null;
}

/* ══════════════════════════════════════════ the cluster-change milestone panel ════ */

export interface ClusterPanelDates {
  startDate: string | null;
  cluster1: string | null;
  cluster2: string | null;
  cluster3: string | null;
  cluster4: string | null;
  fid: string | null;
  cluster5: string | null;
  cluster6: string | null;
}

export type ClusterPanelField = keyof ClusterPanelDates;

export const CLUSTER_PANEL_FIELDS: readonly ClusterPanelField[] = [
  "startDate", "cluster1", "cluster2", "cluster3", "cluster4", "fid", "cluster5", "cluster6",
];

/** The cluster number a panel row stands for (Start = 0, FID sits between 4 and 5). */
const FIELD_NO: Record<ClusterPanelField, number> = {
  startDate: 0, cluster1: 1, cluster2: 2, cluster3: 3, cluster4: 4, fid: 4.5, cluster5: 5, cluster6: 6,
};

export interface ClusterPanelState {
  previousNo: number;
  newNo: number;
  direction: "upward" | "downward";
  dates: ClusterPanelDates;
  /** `locCluster<n>DateStandardAssumption` — set by the CalendarAdd buttons (display only). */
  standardAssumption: Partial<Record<ClusterPanelField, boolean>>;
}

/** The panel's seed (`pcf_btn_…_Save.OnSelect`, Y:5295-5322). */
export function openClusterPanel(project: ProjectSnapshot, form: GeneralDataForm): ClusterPanelState {
  const previousNo = startClusterNo(project.startCluster);
  const newNo = newStartClusterNo(form.developmentType, form.startCluster);
  return {
    previousNo, newNo,
    direction: milestoneImpactNo(newNo) > milestoneImpactNo(previousNo) ? "upward" : "downward",
    dates: {
      startDate: project.projectStartDate, cluster1: project.feasibilityStudies,
      cluster2: project.projectDevelopmentStarted, cluster3: project.applicationSubmitted,
      cluster4: project.legallyBindingPermits, fid: project.fid,
      cluster5: project.construction, cluster6: project.cod,
    },
    standardAssumption: {},
  };
}

/**
 * `con_Milestones_…_<Field>_1.Visible` (Y:7351-7355 …). Upward: a row shows when the new cluster
 * deletes it and it has a date — a read-only list of what will go. Downward: Start when the new
 * cluster is Greenfield, Cluster i when `new <= i`, FID / Cluster 5 / Cluster 6 always.
 */
export function clusterPanelVisible(field: ClusterPanelField, panel: ClusterPanelState): boolean {
  const n = FIELD_NO[field];
  if (panel.direction === "upward") {
    if (n > 4) return false;
    return panel.newNo > n && !isBlank(panel.dates[field]);
  }
  if (n > 4) return true;
  return panel.newNo <= n;
}

/**
 * `dtp_Milestones_…_<Field>_1.DisplayMode` (Y:7392-7399 …): editable only on a downward move, for
 * `new <= i < previous`. FID, Cluster 5 and Cluster 6 are always Disabled.
 */
export function clusterPanelEditable(field: ClusterPanelField, panel: ClusterPanelState): boolean {
  const n = FIELD_NO[field];
  if (panel.direction !== "downward" || n > 4) return false;
  return panel.newNo <= n && panel.previousNo > n;
}

const asTime = (d: string | null): number | null => {
  if (isBlank(d)) return null;
  const t = new Date(d!).getTime();
  return Number.isNaN(t) ? null : t;
};

const BLANK_TEXT: Record<ClusterPanelField, string> = {
  /** `lbl_…_StartDate_ErrorMessage_1.Text` (Y:7423) — verbatim. */
  startDate: "The Project Start Date cannot be empty.",
  cluster1: "Cluster 1 date cannot be blank.",
  cluster2: "Cluster 2 date cannot be blank.",
  cluster3: "Cluster 3 date cannot be blank.",
  cluster4: "Cluster 4 date cannot be blank.",
  fid: "Final Investment Decision date cannot be blank.",
  cluster5: "Cluster 5 date cannot be blank.",
  cluster6: "Cluster 6 date cannot be blank.",
};

/** The ordering texts and which row each is compared with (Y:7530 …, Y:8591). */
const ORDER_CHECK: Partial<Record<ClusterPanelField, { prev: ClusterPanelField; text: string; when?: (newNo: number) => boolean }>> = {
  cluster1: { prev: "startDate", text: "Cluster 1 must be later than Project Start.", when: (n) => n === 0 },
  cluster2: { prev: "cluster1", text: "Cluster 2 must be later than Cluster 1.", when: (n) => n <= 1 },
  cluster3: { prev: "cluster2", text: "Cluster 3 must be later than Cluster 2.", when: (n) => n <= 2 },
  cluster4: { prev: "cluster3", text: "Cluster 4 must be later than Cluster 3.", when: (n) => n <= 3 },
  fid: { prev: "cluster4", text: "Final Investment Decision must be later than Cluster 4.", when: (n) => n <= 4 },
  cluster5: { prev: "fid", text: "Cluster 5 must be later than Final Investment Decision." },
  cluster6: { prev: "cluster5", text: "Cluster 6 must be later than Cluster 5." },
};

/**
 * The panel's error labels (Y:7410-8600). Shown only on a downward move and for a visible row:
 * "cannot be blank" only while the picker is editable; "must be later than" when both dates are
 * set and the previous row is in play.
 *
 * CORRECTED (D25): FID, Cluster 5 and Cluster 6 are read-only on the canvas, so a blank one never
 * errors (it blocked every downward change for a project without those dates); the Start text is
 * "The Project Start Date cannot be empty.".
 */
export function milestoneChainErrors(panel: ClusterPanelState): Partial<Record<ClusterPanelField, string>> {
  const out: Partial<Record<ClusterPanelField, string>> = {};
  if (panel.direction !== "downward") return out;
  for (const field of CLUSTER_PANEL_FIELDS) {
    if (!clusterPanelVisible(field, panel)) continue;
    const value = panel.dates[field];
    if (isBlank(value)) {
      if (clusterPanelEditable(field, panel)) out[field] = BLANK_TEXT[field];
      continue;
    }
    const check = ORDER_CHECK[field];
    if (!check || (check.when && !check.when(panel.newNo))) continue;
    const a = asTime(value);
    const b = asTime(panel.dates[check.prev]);
    if (a !== null && b !== null && a <= b) out[field] = check.text;
  }
  return out;
}

/** `but_ClusterChange_RightPanel_Footer_Save.DisplayMode` (Y:7019-7036). */
export const canSaveClusterPanel = (panel: ClusterPanelState): boolean =>
  panel.direction !== "downward" || Object.keys(milestoneChainErrors(panel)).length === 0;

/** `lbl_ClusterChange_RightPanel_Info.Text` (Y:7315-7327). */
export function clusterPanelInfo(panel: ClusterPanelState): string {
  const from = CLUSTER_STATE_LABEL[panel.previousNo] ?? "";
  const to = CLUSTER_STATE_LABEL[panel.newNo] ?? "";
  return panel.direction === "downward"
    ? `The Start Cluster has been updated from ${from} to ${to}. In order to continue with the saving process, the following Milestones must be completed:`
    : `The Start Cluster has been updated from ${from} to ${to}. In order to continue with the saving process, the following Milestones will be deleted:`;
}

/**
 * The CalendarAdd buttons `but_Milestones_…_Cluster2_1` / `_3_1` / `_4_1` (Y:7623-7670, …):
 * visible on a downward move while the row's picker is editable and the PROJECT's technology is
 * Wind or PV; enabled once the previous row has a date. (The FID / Cluster 5 / Cluster 6 buttons
 * sit beside always-disabled pickers, so they never show.)
 */
export const CALENDAR_ADD_SOURCE: Partial<Record<ClusterPanelField, { prev: ClusterPanelField; duration: "cluster1" | "cluster2" | "cluster3" }>> = {
  cluster2: { prev: "cluster1", duration: "cluster1" },
  cluster3: { prev: "cluster2", duration: "cluster2" },
  cluster4: { prev: "cluster3", duration: "cluster3" },
};

export function calendarAddVisible(field: ClusterPanelField, panel: ClusterPanelState, projectTechnology: number | null | undefined): boolean {
  const wpv = projectTechnology === technologyValue("Wind") || projectTechnology === technologyValue("PV");
  return Boolean(CALENDAR_ADD_SOURCE[field]) && clusterPanelEditable(field, panel) && wpv;
}

/**
 * The button's `OnSelect`: `DateAddMonths(previous picker, First(Filter(colMilestonesAssumptions,
 * Name = "average duration [months]", Country = project.Country, Technology = project.Technology)).
 * 'Cluster n')`, then mark the date as a standard assumption (the picker turns themePrimary).
 */
export function applyCalendarAdd(
  panel: ClusterPanelState,
  field: ClusterPanelField,
  durations: Partial<Record<"cluster1" | "cluster2" | "cluster3", number>> | undefined,
): ClusterPanelState {
  const src = CALENDAR_ADD_SOURCE[field];
  const from = src ? panel.dates[src.prev] : null;
  if (!src || isBlank(from)) return panel;
  const months = Math.trunc(durations?.[src.duration] ?? 0);
  return {
    ...panel,
    dates: { ...panel.dates, [field]: dateOnly(addMonths(from!, months)) },
    standardAssumption: { ...panel.standardAssumption, [field]: true },
  };
}

/**
 * `dtp_Milestones_DisplayProject_Body_General_Content_<Cluster2…6|FiD>_1` —
 * `FontColor: =If(locCluster<n>DateStandardAssumption, ColorValue(gblAppTheme.palette.themePrimary))`
 * and `FontItalic: =locCluster<n>DateStandardAssumption` (`locFidDateStandardAssumption` for FiD).
 * The flag is set by the CalendarAdd buttons and cleared by a typed date (CONVENTIONS rule 20).
 */
export const clusterPanelDateIsStandard = (field: ClusterPanelField, panel: Pick<ClusterPanelState, "standardAssumption">): boolean =>
  panel.standardAssumption[field] === true;

/**
 * Milestones rule 17 — blank the milestones the start cluster skips and clear their "Standard
 * Assumption?" flags. Used by `features/pm/milestones`; General Data's own panel writes the exact
 * canvas payload instead (`clusterPanelPatch`), because the two canvas formulas differ on the flags.
 */
export function clearSkippedMilestones(
  dates: Pick<ClusterPanelDates, "startDate" | "cluster1" | "cluster2" | "cluster3" | "cluster4">,
  startClusterNo: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    [PROJECT_COL.projectStartDate]: startClusterNo >= 1 ? null : dates.startDate,
    [PROJECT_COL.feasibilityStudies]: startClusterNo >= 2 ? null : dates.cluster1,
    [PROJECT_COL.projectDevelopmentStarted]: startClusterNo >= 3 ? null : dates.cluster2,
    [PROJECT_COL.applicationSubmitted]: startClusterNo >= 4 ? null : dates.cluster3,
    [PROJECT_COL.legallyBindingPermits]: startClusterNo >= 5 ? null : dates.cluster4,
  };
  if (startClusterNo >= 3) patch[PROJECT_COL.isProjectDevelopmentStd] = false;
  if (startClusterNo >= 4) patch[PROJECT_COL.isApplicationSubmittedStd] = false;
  if (startClusterNo >= 5) patch[PROJECT_COL.isLegallyBindingPermitsStd] = false;
  return patch;
}

/**
 * `but_ClusterChange_RightPanel_Footer_Save.OnSelect` (Y:7096-7206), the live formula: the five
 * dates and three flags exactly as written. `'Is n-… Std'': If(new >= k, false)` is `false` above
 * the threshold and `Blank()` (null) below it — the canvas clears the flag either way.
 */
export function clusterPanelPatch(panel: ClusterPanelState): Record<string, unknown> {
  const n = panel.newNo;
  const d = panel.dates;
  return {
    [PROJECT_COL.projectStartDate]: n >= 1 ? null : d.startDate,
    [PROJECT_COL.feasibilityStudies]: n >= 2 ? null : d.cluster1,
    [PROJECT_COL.projectDevelopmentStarted]: n >= 3 ? null : d.cluster2,
    [PROJECT_COL.isProjectDevelopmentStd]: n >= 3 ? false : null,
    [PROJECT_COL.applicationSubmitted]: n >= 4 ? null : d.cluster3,
    [PROJECT_COL.isApplicationSubmittedStd]: n >= 4 ? false : null,
    [PROJECT_COL.legallyBindingPermits]: n >= 5 ? null : d.cluster4,
    [PROJECT_COL.isLegallyBindingPermitsStd]: n >= 5 ? false : null,
  };
}

export function planClusterPanelSave(projectId: string, panel: ClusterPanelState): WritePlan {
  return {
    writes: [{
      op: "update", entitySet: ES.projects, id: projectId, data: clusterPanelPatch(panel),
      reason: "save the cluster milestone changes",
    }],
    log: [],
  };
}

/* ═══════════════════════════════════════════════════════════ tracking rebuild ════ */

/** `varAutoSkippedComment` (Y:217) — verbatim. */
export const AUTO_SKIPPED_COMMENT =
  "Automatically completed because this project starts at a later cluster.";

const CHECKLIST_CLUSTER_NO: Record<string, number> = {
  Draft: 0, "Cluster 1": 1, "Cluster 2": 2, "Cluster 3": 3,
  "Cluster 4": 4, "Cluster 5": 5, "Cluster 6": 6,
};

export interface PlannedTrackingRow {
  clusterStateId: string;
  clusterStateName: string;
  clusterNo: number;
  approvalClusterState: number;
  comment: string | null;
  existingTrackingId: string | null;
}

/**
 * Step 3 of the hidden subroutine (Y:333-399) — one `Project State Trackings` row per checklist
 * cluster: Draft → In Progress; clusters strictly between 0 and the new start cluster →
 * Completed with the auto-skip comment; the rest → Not Started.
 */
export function plannedTrackingRows(
  states: ProjectStateRef[],
  newStartClusterNo: number,
  existing: TrackingRow[] = [],
): PlannedTrackingRow[] {
  return states
    .filter((s) => s.isVisibleOnChecklist && s.name in CHECKLIST_CLUSTER_NO)
    .map((s) => {
      const clusterNo = CHECKLIST_CLUSTER_NO[s.name]!;
      const skipped = clusterNo > 0 && clusterNo < newStartClusterNo;
      return {
        clusterStateId: s.id,
        clusterStateName: s.name,
        clusterNo,
        approvalClusterState:
          s.name === "Draft" ? CHOICE.approvalClusterState.inProgress
          : skipped ? CHOICE.approvalClusterState.completed
          : CHOICE.approvalClusterState.notStarted,
        comment: skipped ? AUTO_SKIPPED_COMMENT : null,
        existingTrackingId: existing.find((t) => t.clusterStateId === s.id)?.id ?? null,
      };
    })
    .sort((a, b) => a.clusterNo - b.clusterNo);
}

/* ══════════════════════════════════════════════════════════════ the project patch ════ */

const numericOf = (raw: string, lang: Lang): number | null => {
  if (isBlank(raw)) return null;
  const n = parseNumber(raw, lang);
  return Number.isNaN(n) ? null : n;
};

/** The two owning-business-unit values the save writes (Patch #1, then Patch #2). */
export function owningBusinessUnits(
  form: GeneralDataForm, ref: GeneralDataRefData, project: ProjectSnapshot | null,
): { patch1: string | null; patch2: string | null } {
  const country = ref.countries.find((c) => c.id === form.countryId);
  // `Coalesce(Country.Selected.'Besitzer (Unternehmenseinheit)', project.'Besitzer …')`
  const patch1 = country?.besitzerBusinessUnitId ?? project?.besitzerBusinessUnitId ?? null;
  // `Coalesce(Country.Selected.'Business Unit', project.'Besitzer …')` — project as re-read after Patch #1.
  const patch2 = country?.businessUnitId ?? patch1;
  return { patch1, patch2 };
}

/**
 * Patch #1 — `Patch(Projects, If(IsBlank(project), Defaults(Projects), project), {…})`
 * (Y:516-627). The field payload; the save plan decides create vs update.
 */
export function buildProjectPatch(
  form: GeneralDataForm,
  ref: GeneralDataRefData,
  project: ProjectSnapshot | null,
): Record<string, unknown> {
  const lang = ref.language;
  const country = ref.countries.find((c) => c.id === form.countryId);
  const countryName = country?.name ?? null;
  const acquired = isAcquisitionRowVisible(form.developmentType);
  const draftState = ref.projectStates.find((s) => s.name === "Draft");

  const municipality =
    countryName === "Germany" ? form.municipalityGermany
    : countryName === "France" ? form.municipalityFrance
    : form.municipality;

  return {
    [PROJECT_COL.name]: form.projectName,
    ...bind(PROJECT_LOOKUP.projectManager, ES.aadUsers, form.managerEntraRowId),
    // 'Deputy Project Manager': If(Not(IsBlank(First(picker))), LookUp(…), Blank())
    ...bind(PROJECT_LOOKUP.deputyProjectManager, ES.aadUsers, form.deputyManagerEntraRowId),
    [PROJECT_COL.spvName]: form.spvName,
    [PROJECT_COL.shortName]: form.shortName,
    [PROJECT_COL.projectType]: form.projectType,
    // Country: Coalesce(drp.Selected, project.Country)
    ...bind(PROJECT_LOOKUP.country, ES.countries, form.countryId ?? project?.countryId),
    /*
     * 'Area/State/Province': Coalesce(drp_Area.Selected, project.'Area/State/Province').
     * The Area dropdown always has a selection of the selected country's areas when it has any,
     * so "nothing picked" only happens for a country without areas — then the existing value is
     * kept, as the canvas keeps it. A bind to null would clear it.
     */
    ...(form.areaId ? bind(PROJECT_LOOKUP.area, ES.countryAreas, form.areaId) : {}),
    [PROJECT_COL.district]: form.district,
    [PROJECT_COL.municipality]: municipality,
    ...bind(PROJECT_LOOKUP.utilization, ES.customChoiceValues, form.utilizationId),
    [PROJECT_COL.terrainSize]: numericOf(form.terrainSize, lang),
    [PROJECT_COL.latitude]: numericOf(form.latitude, lang),
    [PROJECT_COL.longitude]: numericOf(form.longitude, lang),
    // The option-set integer; a label would be a 400 against a choice column.
    [PROJECT_COL.technology]: technologyValue(form.technology),
    // 'Approval States': If(IsBlank(existing), 'Approval States'.Draft, existing)
    [PROJECT_COL.approvalState]: project?.approvalState ?? APPROVAL_STATE_DRAFT,
    // 'SPV Company Code': If(Len(SPVName) = 0, Blank(), Value(code))
    [PROJECT_COL.spvCompanyCode]: form.spvName.length === 0 ? null : numericOf(form.spvCompanyCode, lang),
    // 'SPV Legal Structure' is only stored for Germany.
    [PROJECT_COL.spvLegalStructure]: countryName === "Germany" ? form.spvLegalStructure : null,
    // 'Cluster State': Coalesce(existing, LookUp('Project States', Name = "Draft"))
    ...bind(PROJECT_LOOKUP.clusterState, ES.projectStates, project?.clusterStateId ?? draftState?.id ?? null),
    [PROJECT_COL.taxFactor]: numericOf(form.taxFactor, lang),
    ...obu(owningBusinessUnits(form, ref, project).patch1),
    [PROJECT_COL.shareOfFarmdown]: project?.shareOfFarmdown ?? 50,
    [PROJECT_COL.isStandardShareOfFarmdown]: project?.isStandardShareOfFarmdown ?? true,
    [PROJECT_COL.standardCostCreated]: project?.standardCostCreated ?? false,
    [PROJECT_COL.developmentType]: form.developmentType,
    // 'Start Cluster': If(Acquired, drp.Selected.Value, 'Cluster States'.Greenfield)
    [PROJECT_COL.startCluster]: acquired ? form.startCluster : CHOICE.clusterState.greenfield,
    [PROJECT_COL.acquisitionDate]: acquired ? form.acquisitionDate : null,
    // fn_Numeric_With_Separtors.toNumber(text) — the grouped text back to a number.
    [PROJECT_COL.acquisitionPrice]: acquired ? numericOf(form.acquisitionPrice, lang) : null,
  };
}

/**
 * SOURCE DEFECT (Y:528-534, and the identical pattern in the Team save):
 *   'Project Manager': LookUp('Microsoft Entra IDs', Or(IsBlank(First(picker.SelectedPeople)), <id match>))
 * When the picker is empty, `Or(true, …)` matches the FIRST Entra row, so an empty picker would
 * assign an arbitrary person. The Save DisplayMode normally prevents it; `planGeneralDataSave`
 * refuses the plan as well.
 */
export function assertManagerSelected(form: GeneralDataForm): string | null {
  return isBlank(form.managerEntraRowId) ? MSG.manager : null;
}

/* ═══════════════════════════════════════════════════════ the save orchestration ════ */

export interface SaveContext {
  /**
   * The project as read. For a NEW project: the row re-read after Patch #1's create, with
   * `startCluster` set to the pre-save value (blank → Greenfield), as the canvas compares it.
   */
  project: ProjectSnapshot;
  form: GeneralDataForm;
  ref: GeneralDataRefData;
  /** `Project State Trackings` of the project. */
  trackings: TrackingRow[];
  /** `locNeedShareholdingEntitiesUpdate` */
  shareholdersDirty: boolean;
  entities: ShareholdingEntity[];
}

/**
 * `btn_GeneralData_Save_Actual.OnSelect` (Y:406-899) as ONE ordered write plan, in the canvas's
 * write order (server flows and plugins fire per write):
 *   1. Patch #1 — the form fields (`buildProjectPatch`).
 *   2. Patch #2 — `'Internal Project ID'` back-filled from `'Project ID'` when blank, and the owning
 *      business unit from `Countries.'Business Unit'`.
 *   3. When the start cluster changed (`old <> new`): `Patch(Projects, {'Cluster State': Draft,
 *      Besitzer})`, then one tracking row per checklist cluster (create or update). The
 *      cancellation flow is NOT called (`startClusterChangeBlocked` refuses the case).
 *   4. When the entities changed: one create / update per entity.
 *   5. When the project has no Draft tracking row: create it, In Progress.
 *
 * NOT TRANSACTIONAL (no changeset on the SDK): a failure stops the plan and the message says how
 * many writes had already been sent.
 */
export function planGeneralDataSave(ctx: SaveContext): WritePlan {
  const { project, form, ref, trackings } = ctx;
  const manager = assertManagerSelected(form);
  if (manager) return refusePlan(manager);
  if (startClusterChangeBlocked({ project, form, trackings, projectStates: ref.projectStates })) {
    return refusePlan(MSG.approvalInProgress);
  }
  const rest = planSaveFollowUps(ctx);
  return {
    writes: [{
      op: "update", entitySet: ES.projects, id: project.id!,
      data: buildProjectPatch(form, ref, project), reason: "save the project data",
    }, ...rest.writes],
    log: [MSG.stepProjectSaved, ...rest.log],
  };
}

/**
 * Patch #1 for a NEW project — `Patch(Projects, Defaults(Projects), {…})` (Y:516-627), PO decision
 * 20 Oct 2026 (D25: creating a project is in scope). `buildProjectPatch(form, ref, null)` supplies
 * the create-only defaults of the canvas `Coalesce`s: Approval States Draft, Cluster State Draft,
 * Share of Farmdown 50, Is Standard Share of Farmdown Yes, Standard Cost Created No, the owner from
 * `Countries.'Besitzer (Unternehmenseinheit)'`, Start Cluster Greenfield unless Acquired.
 *
 * A create cannot carry `<nav>@odata.bind: null` (an empty lookup is simply left out), so those keys
 * are dropped. The server-side flow `CreatingTeamsandSPOSite-ProjectCreation` fires on this create;
 * the client does none of its work.
 */
export function planProjectCreate(form: GeneralDataForm, ref: GeneralDataRefData): WritePlan {
  const manager = assertManagerSelected(form);
  if (manager) return refusePlan(manager);
  const data = Object.fromEntries(
    Object.entries(buildProjectPatch(form, ref, null))
      .filter(([k, v]) => !(k.endsWith("@odata.bind") && v === null)),
  );
  return {
    writes: [{ op: "create", entitySet: ES.projects, data, reason: "create the project" }],
    log: [MSG.stepProjectSaved],
  };
}

/**
 * The snapshot the follow-up writes of a NEW project are planned from: the re-read row, with the
 * pre-save start cluster (`Coalesce(blank, Greenfield)` = 0) so `old <> new` is the canvas test.
 */
export const createdProjectSnapshot = (reRead: ProjectSnapshot): ProjectSnapshot =>
  ({ ...reRead, startCluster: CHOICE.clusterState.greenfield });

/**
 * Everything `btn_GeneralData_Save_Actual` writes after Patch #1 (steps 2-5 above). An edit runs it
 * inside `planGeneralDataSave`; a create runs it after the create and the re-read, because Patch #2
 * needs the autonumber 'Project ID' (`vsb_name`) Dataverse assigned.
 */
export function planSaveFollowUps(ctx: SaveContext): WritePlan {
  const { project, form, ref, trackings } = ctx;
  const projectId = project.id!;
  const writes: PlannedWrite[] = [];
  const log: string[] = [];
  const { patch2: ownerBu } = owningBusinessUnits(form, ref, project);
  const draftState = ref.projectStates.find((s) => s.name === "Draft");

  writes.push({
    op: "update", entitySet: ES.projects, id: projectId,
    data: {
      [PROJECT_COL.internalProjectId]: isBlank(project.internalProjectId) ? project.projectNumber : project.internalProjectId,
      ...obu(ownerBu),
    },
    reason: "set the internal project id and the owning business unit",
  });

  const changed = startClusterChanged(project, form);
  if (changed) {
    writes.push({
      op: "update", entitySet: ES.projects, id: projectId,
      data: { ...bind(PROJECT_LOOKUP.clusterState, ES.projectStates, draftState?.id ?? null), ...obu(ownerBu) },
      reason: "set the project's cluster state back to Draft",
    });
    for (const row of plannedTrackingRows(ref.projectStates, newStartClusterNo(form.developmentType, form.startCluster), trackings)) {
      const data: Record<string, unknown> = {
        ...bind(TRACKING_COL.project, ES.projects, projectId),
        ...bind(TRACKING_COL.clusterState, ES.projectStates, row.clusterStateId),
        [TRACKING_COL.approvalClusterState]: row.approvalClusterState,
        [TRACKING_COL.clusterStepState]: null,
        [TRACKING_COL.approvalDueDate]: null,
        [TRACKING_COL.flowRunId]: null,
        [TRACKING_COL.flowApprovalId]: null,
        [TRACKING_COL.approvalComment]: row.comment,
        ...obu(ownerBu),
      };
      writes.push(row.existingTrackingId
        ? { op: "update", entitySet: ES.projectStateTrackings, id: row.existingTrackingId, data, reason: `rebuild the ${row.clusterStateName} tracking` }
        : { op: "create", entitySet: ES.projectStateTrackings, data, reason: `create the ${row.clusterStateName} tracking` });
    }
    log.push(MSG.stepTrackingRefreshed);
  }

  if (ctx.shareholdersDirty) {
    for (const e of ctx.entities) {
      const data: Record<string, unknown> = {
        [SHAREHOLDER_COL.entityType]: e.entityTypeValue,
        ...bind(SHAREHOLDER_COL.project, ES.projects, projectId),
        [SHAREHOLDER_COL.customName]: isBlank(e.customName) ? null : e.customName,
        [SHAREHOLDER_COL.ownership]: e.ownership,
        ...obu(ownerBu),
      };
      writes.push(e.recordId
        ? { op: "update", entitySet: ES.shareholderEntityInProjects, id: e.recordId, data, reason: "save a shareholding entity" }
        : { op: "create", entitySet: ES.shareholderEntityInProjects, data, reason: "create a shareholding entity" });
    }
    log.push(MSG.stepShareholdersSaved);
  }

  // Ensure the Draft tracking exists (Y:775-815). After a rebuild it already does.
  const draftExists = draftState ? trackings.some((t) => t.clusterStateId === draftState.id) : true;
  if (draftState && !draftExists && !changed) {
    writes.push({
      op: "create", entitySet: ES.projectStateTrackings,
      data: {
        ...bind(TRACKING_COL.project, ES.projects, projectId),
        ...bind(TRACKING_COL.clusterState, ES.projectStates, draftState.id),
        [TRACKING_COL.approvalComment]: null,
        [TRACKING_COL.approvalDueDate]: null,
        [TRACKING_COL.approvalClusterState]: CHOICE.approvalClusterState.inProgress,
        ...obu(ownerBu),
      },
      reason: "create the Draft tracking",
    });
  }

  return { writes, log };
}

/* ═════════════════════════════════════════════════════════════════ misc rules ════ */

/**
 * The footer's "Created By" / "Modified By" value — `$"{'Erstellt von'.'Full Name'}   {Text(
 * 'Erstellt am', "dd.mm.yyyy HH:mm", Language())}"` (Y:6132, Y:6044). General Data joins with
 * THREE spaces (`gap`); Milestones uses the default two.
 */
export function formatAuditStamp(name: string | null, timestamp: string | null, gap = "  "): string | null {
  if (isBlank(name) || isBlank(timestamp)) return null;
  const d = new Date(timestamp!);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${name}${gap}${date} ${time}`;
}

/**
 * The same stamp split for the footer's layout (20 Oct 2026, D25): the canvas label is one
 * right-aligned string, the name and the date are shown in their own columns here. `when` keeps
 * the leading gap, so `name + when` is exactly `formatAuditStamp`.
 */
export function auditStampParts(name: string | null, timestamp: string | null, gap = "   "): { name: string; when: string } | null {
  const stamp = formatAuditStamp(name, timestamp, gap);
  if (stamp === null || name === null) return null;
  return { name, when: stamp.slice(name.length) };
}

/** `GUIDE p14` — the header's status subtitle reads Dataverse's active/inactive state. */
export const recordStatusLabel = (statecode: number | null | undefined): string =>
  statecode === 0 || statecode === null || statecode === undefined ? "Active" : "Inactive";

/* ═══════════════════════════════════════════════════════ screen captions ════ */

/**
 * Every caption the screen renders, transcribed from `Project General Data Screen.pa.yaml` (and,
 * for the New Project title, the shared `cmp_Header`). Each entry names the canvas control.
 */
export const GD_LABELS = {
  /** `cmp_Header` → `con_cmp_Header_HeaderText.Text` when `gblProjectHeaderData` is blank. */
  newProject: "New Project",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_Label.Text` */
  general: "General",
  /** `lbl_…_Basic_Informations.Text` */
  basicInformation: "Basic Information",
  /** `lbl_…_ProjectID.Text` */
  projectId: "Project ID",
  /** `lbl_…_ProjectName.Text` */
  projectName: "Project Name",
  /** `lbl_…_ShortName.Text` */
  shortName: "Short Name",
  /** `lbl_…_SPVName.Text` */
  spvName: "SPV Name",
  /** `lbl_…_SPVLegalStructure.Text` */
  spvLegalStructure: "SPV Legal Structure",
  /** `lbl_…_SPVCompanyCode.Text` */
  spvCompanyCode: "SPV Company Code",
  /** `lbl_…_TechnologyTab_Content_Technology.Text` */
  technology: "Technology",
  /** `lbl_…_ProjectType.Text` */
  projectType: "Project Type",
  /** `lbl_…_Manager.Text` */
  projectManager: "Project Manager",
  /** `pcf_…_Manager_PeoplePicker.HintText` */
  projectManagerHint: "Select for project manager",
  /** `pcf_…_Manager_PeoplePicker.Tooltip` */
  projectManagerTooltip: "Search for project manager",
  /** `lbl_…_Deputy_Manager.Text` */
  deputyProjectManager: "Deputy Project Manager",
  /** `pcf_…_Deputy_Manager_PeoplePicker.HintText` */
  deputyProjectManagerHint: "Select for deputy project manager",
  /** `pcf_…_Deputy_Manager_PeoplePicker.Tooltip` */
  deputyProjectManagerTooltip: "Search for deputy project manager",
  /** `lbl_…_TechnologyTab_Content_ProjectDevelopment.Text` */
  developmentType: "Development Type",
  /** `lbl_…_Basic_Aquisition_Details.Text` */
  acquisitionInformation: "Acquisition Information",
  /** `lbl_…_ClusterChange.Text` */
  startCluster: "Start Cluster",
  /** `lbl_…_ClusterChange_2.Text` */
  acquisitionDate: "Acquisition Date",
  /** `lbl_…_Basic_Placement.Text` */
  placement: "Placement",
  /** `lbl_…_Country.Text` */
  country: "Country",
  /** `lbl_…_Area.Text` */
  area: "Area/State/Province/Voivodeship",
  /** `lbl_…_District.Text` */
  district: "District",
  /** `lbl_…_Municipality.Text` */
  municipality: "Municipality",
  /** `cmb_…_Municipality_Germany.InputTextPlaceholder` / `…_France_1` */
  municipalityPlaceholder: "Type 3 or more letters to Search...",
  /** `lbl_…_Tax_Factor.Text` */
  taxFactor: "Tax Factor [%]",
  /** `lbl_con_…_TerrainUt.Text` */
  terrainUtilization: "Terrain Utilization",
  /** `lbl_…_TerrainSize.Text` */
  terrainSize: "Terrain Size [ha]",
  /** `lbl_…_Latitude.Text` */
  latitude: "Latitude",
  /** `lbl_…_Longitude.Text` */
  longitude: "Longitude",
  /** `lbl_…_Basic_Shareholding_Entities.Text` */
  shareholdingEntity: "Shareholding Entity",
  /** `btn_general_data_shareholding_entity_add_new.Text` */
  add: "Add",
  /** `btn_general_data_shareholding_entity_Edit.Text` */
  edit: "Edit",
  /** `btn_general_data_shareholding_entity_Delete.Text` */
  delete: "Delete",
  /** `lbl_…_ShareholdingEntities.Text` */
  columnDescription: "Description",
  /** `lbl_…_Percentage.Text` */
  columnOwnership: "Ownership",
  /** `lbl_…_Percentage_2.Text` */
  columnActions: "Actions",
  /** `pcf_btn_…_Buttons_Reset.Text` */
  cancel: "Cancel",
  /** `pcf_btn_…_Buttons_Save.Text` */
  save: "Save",
  /** `lbl_…_ProjectName_ErrorMessage_2.Text` */
  requiredFields: "Required fields",
  /** `lbl_…_Content_Editor.Text` */
  modifiedBy: "Modified By:",
  /** `lbl_…_Content_Creator.Text` */
  createdBy: "Created By:",
  /** `lbl_con_GeneralData_RightPanel_ShareholdingEntity_FormHeader.Text` */
  shareholderPanelTitle: "Shareholding Entities",
  /** `lbl_…_InpForm_BodyForm_EntityName.Text` */
  shareholderEntity: "Shareholder Entity",
  /** `lbl_…_InpForm_BodyForm_CustomName.Text` */
  customShareholderEntity: "Custom Shareholder Entity",
  /** `lbl_…_InpForm_BodyForm_Percentage.Text` */
  ownershipPercent: "Ownership [%]",
  /** `lbl_ClusterChange_RightPanel_Header_Title.Text` */
  clusterChange: "Cluster Change",
  /** `ico_ClusterChange_RightPanel_Header_Close.AccessibleLabel` */
  closeClusterChange: "Close Cluster Change panel",
  /** `lbl_Milestones_…_StartDate_1.Text` */
  projectStart: "Project Start",
  /** `lbl_Milestones_…_FiD_1.Text` */
  finalInvestmentDecision: "Final Investment Decision",
  /** `dtp_Milestones_…_StartDate_1.Placeholder` */
  startDatePlaceholder: "Select a project start date...",
  /** `dtp_Milestones_…_Cluster1_1.Placeholder` (and every other panel picker) */
  datePlaceholder: "Select a date...",
} as const;

/**
 * `lbl_…_ClusterChange_3.Text` — `If(Country.Selected.Name = "Poland", "Acquisition Price [PLN]",
 * "Acquisition Price [EUR]")`.
 */
export const acquisitionPriceLabel = (countryName: string | null | undefined): string =>
  countryName === "Poland" ? "Acquisition Price [PLN]" : "Acquisition Price [EUR]";

/** `cmp_GeneralData_PopUp_ConfirmationDeleteShareholdingEntity` — Title and button texts. */
export const DELETE_SHAREHOLDER_DIALOG = {
  title: "Delete Shareholding Entity?",
  confirm: "Confirm",
  cancel: "Cancel",
} as const;

/** `$"Are you sure that you want to delete '{…}'?"` */
export const deleteShareholderDescription = (name: string): string =>
  `Are you sure that you want to delete '${name}'?`;

/**
 * `cmp_PopUp_Leave_GeneralData_Confirmation` (Title / Description / ConfirmButtonText /
 * CancelButtonText, verbatim) — rendered by the shared `UnsavedChangesGuard` (D35, PO X1).
 */
export const LEAVE_DIALOG = {
  title: "Unsaved data",
  description: "You have unsaved data. Do you really want to leave current form without saving?",
  confirm: "Yes",
  cancel: "Cancel",
} as const;

/** `shouldConfirmLeave` — `If(locIsGeneralFormDirty, <dialog>, <navigate>)` (Y:915-1001). */
export const shouldConfirmLeave = (isDirty: boolean): boolean => isDirty;

/** `cmp_GeneralData_Map_PopUp_ConfirmationChangeLocation` — kept for the map (documented gap, D25). */
export const LOCATION_DIALOG = {
  title: "Project Location Confirmation",
  description: "Are you sure that you want to change the project location?",
  confirm: "Confirm",
  cancel: "Cancel",
} as const;
