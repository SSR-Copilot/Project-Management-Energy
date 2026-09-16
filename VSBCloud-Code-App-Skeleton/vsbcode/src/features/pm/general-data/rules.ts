/**
 * Project General Data Screen — business rules.
 *
 * Canvas screen: `Project General Data Screen` (PM app)
 *   311 controls · 7 438 lines of Power Fx · 88 substantive blocks · band XL
 *
 * Everything in this file is pure: no React, no network. `Screen.tsx` and `hooks.ts`
 * call it; `rules.test.ts` tests it directly.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `pcf_btn_..._Save_2` and its 334-line `OnChange` (rule 40) — a second, older save
 *    control whose DisplayMode is the same rule with the Development-Type/Start-Cluster/
 *    Acquisition clauses commented out. Only `btn_GeneralData_Save_Actual` is ported.
 *  - The five verbatim copies of the seven-arm `Switch(cluster, Greenfield, 0, ...)`.
 *    `vsb_startcluster` numbers its own options 0..6, so the Switch is an identity map
 *    (`startClusterNo` below).
 *  - `colMapLocation` (a one-row collection holding lat/lng so a map control could bind
 *    to it) — the marker reads the form directly through `mapMarker`.
 *  - `colProcessingSteps` as a collection — the step log is the return value of
 *    `planSaveCleanup`, not mutable app state.
 */
import {
  parseNumber, isNumeric, isInteger, isOneDecimal, isTwoDecimal, isSixDecimal,
  inRange, pfxRound, isBlank, type Lang,
} from "@/domain/numeric";
import { ES, CHOICE, TERRAIN_SIZE_COUNTRY_KEY } from "@/data/entities";
import type { WriteOp } from "@/platform/dataClient";
import type { CountryScope } from "@/domain/session";
import { technologyValue } from "@/domain/technology";

/* ════════════════════════════════════════════════════════════ column names ════ */

/**
 * `Projects` columns this screen and the Milestones screen write.
 *
 * Hand-derived from the canvas display names using the solution's `vsb_` +
 * lowercase-no-space convention. Verify against the metadata endpoint before
 * production — the display names are stable, the logical names are inferred.
 */
export const PROJECT_COL = {
  name: "vsb_name",
  shortName: "vsb_shortname",
  /** 'Project ID' — the human-readable identifier Dataverse assigns on create. */
  projectNumber: "vsb_internalprojectid",
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

  /* the milestone date chain — shared with features/milestones */
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
  isProjectDevelopmentStd: "vsb_is2projectdevelopmentstandardassumption",
  isApplicationSubmittedStd: "vsb_is3applicationsubmittedstandardassumption",
  isLegallyBindingPermitsStd: "vsb_is4legallybindingpermitsstandardassumption",
  isFidStd: "vsb_isfinalinvestmentdecisionstandardassumption",
  isConstructionStd: "vsb_is5constructionstandardassumption",
  isCodStd: "vsb_isoperationsstartdatecodstandardassumption",
  isEndDateStd: "vsb_isenddatestandardassumption",
  isSalesStartStd: "vsb_issalesstartdatestandardassumption",
  isSalesCompletedStd: "vsb_issalescompletiondatestandardassumption",
} as const;

/** Lookup navigation properties. Dataverse writes them as `<Nav>@odata.bind`. */
export const PROJECT_LOOKUP = {
  country: "vsb_Country",
  area: "vsb_AreaStateProvince",
  clusterState: "vsb_ClusterState",
  utilization: "vsb_Utilization",
  projectManager: "vsb_ProjectManager",
  deputyProjectManager: "vsb_DeputyProjectManager",
} as const;

export const TRACKING_COL = {
  approvalClusterState: "vsb_approvalclusterstate",
  clusterStepState: "vsb_clusterstepstate",
  approvalDueDate: "vsb_approvalduedate",
  approvalComment: "vsb_approvalcomment",
  flowRunId: "vsb_flowrunid",
  flowApprovalId: "vsb_flowapprovalid",
} as const;

export const SHAREHOLDER_COL = {
  entityType: "vsb_shareholderentitiytype",
  customName: "vsb_customname",
  ownership: "vsb_ownership",
} as const;

/** `<nav>@odata.bind` — null clears the lookup, which is what `Blank()` did. */
export function bind(nav: string, entitySet: string, id: string | null | undefined) {
  return { [`${nav}@odata.bind`]: id ? `/${entitySet}(${id})` : null };
}

/* ════════════════════════════════════════════════════════════════ messages ════ */

/** Every message the screen can show, in the order `ibtn_..._Requered_Fileds` lists them. */
export const MSG = {
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_ProjectName_ErrorMessage.Text` —
   * verbatim.
   */
  projectName: "Project name should have at least 3 letters.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_ShortName_ErrorMessage.Text` —
   * verbatim.
   */
  shortName: "Project short name should have at least 3 letters.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_TechnologyTab_Content_Technology_ErrMessage.Text` —
   * verbatim.
   */
  technology: "The Technology cannot be blank.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_TechnologyTab_Content_ProjectDevelopment_ErrMessage.Text`
   * — verbatim.
   */
  developmentType: "The Development Type cannot be blank.",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_Manager_ErrMessage.Text` — verbatim. */
  manager: "The project manager cannot be blank.",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_Country_ErrorMessage.Text` — verbatim. */
  country: "Country cannot be blank.",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_Area_ErrorMessage.Text` — verbatim. */
  area: "Area/State/Province cannot be blank.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_ClusterChange_ErrorMessage.Text` —
   * verbatim.
   */
  startCluster: "Start Cluster cannot be blank.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_AcquisitionDate_ErrorMessage.Text` —
   * verbatim.
   */
  acquisitionDate: "Acquisition date cannot be blank.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_AcquisitionDate_ErrorMessage_1.Text` —
   * verbatim.
   */
  acquisitionPriceBlank: "Acquisition Price should not be blank.",
  /**
   * INTERPOLATED — canvas
   * `lbl_GeneralData_DisplayProject_Body_General_Content_AcquisitionDate_ErrorMessage_1.Text`
   * builds this from "The cost needs to be a whole number, without any decimal places, in the
   * range of 0 to " + the formatted bound.
   */
  acquisitionPriceShape:
    "The cost needs to be a whole number, without any decimal places, in the range of 0 to 1,000,000,000.",
  /**
   * GUIDE p14: Basic Information has no SPV Company Code control, so it can no longer be
   * a save-blocking requirement — there would be no way to satisfy it. The constant and
   * its shape check stay (defensive, for a value that arrives from elsewhere), the
   * blank-required push is gone. See `validationMessages`.
   */
  /**
   * `lbl_GeneralData_DisplayProject_Body_TechnologyTab_Content_SPVCompanyCode_ErrMessage.Text`
   * — verbatim.
   */
  spvCodeBlank: "SPV Company Code cannot be blank.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_TechnologyTab_Content_SPVCompanyCode_ErrMessage.Text`
   * — verbatim.
   */
  spvCodeShape: "SPV Company Code is expected in #### format with Numeric values.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_TechnologyTab_Content_SPVLegalStructure_ErrMessage.Text`
   * — verbatim.
   */
  spvLegalStructure: "Please select the legal structure of SPV",
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_Tax_Factor_ErrorMessage.Text` —
   * verbatim.
   */
  taxFactorShape: "Tax factor should be a numeric value without decimal.",
  /**
   * `lbl_GeneralData_DisplayProject_Body_General_Content_Tax_Factor_ErrorMessage.Text` —
   * verbatim.
   */
  taxFactorRange: "Tax factor should not be greater than 1000.",
  /** gblAppResx.InputBlank */
  /**
   * `lbl_Contracts_RightPanel_NewEdit_PaymentTarget_Description_ErrorMessage.Text` (`Contracts
   * Screen`) — verbatim.
   */
  inputBlank: "Input must not be blank",
  /** gblAppResx.NumericOneDecimals */
  /**
   * `lbl_Contracts_Payment_Targets_RightPanel_TotalCosts_ErrorMessage.Text` (`Contracts
   * Screen`) — verbatim.
   */
  numericOneDecimals: "Numeric value with maximum of one decimals",
  /**
   * INTERPOLATED — canvas
   * `lbl_GeneralData_DisplayProject_Body_General_Content_TerrainSize_ErrorMessage.Text` builds
   * this from "Please select a value between 0 and " + the formatted bound.
   */
  terrainRange: "Please select a value between 0 and 1,000",
  /**
   * GUIDE p12: verbatim, and identical for both axes — a blank Latitude/Longitude shows
   * this FORMAT message, not a generic "required" message, and it is a real period at the
   * end and three digits before the point on both fields (the field previously read
   * `##.######` for latitude with no closing period — wrong on both counts).
   */
  /**
   * INTERPOLATED — canvas
   * `lbl_GeneralData_DisplayProject_Body_General_Content_Latitude_ErrMessage.Text` builds this
   * from "Expected decimal degrees field format number ##" + the decimal separator and places.
   */
  coordinateFormat: "Expected decimal degrees field format number ###.######.",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_Latitude_ErrMessage.Text` — verbatim. */
  latitudeRange: "The number decimal degrees must be between -90 and 90.",
  /** `lbl_GeneralData_DisplayProject_Body_General_Content_Longitude_ErrMessage.Text` — verbatim. */
  longitudeRange: "The number decimal degrees must be between -180 and 180.",
  /**
   * NEW — no canvas equivalent: the code app makes Municipality mandatory for German projects
   * and says so; the canvas only reddened the field
   */
  municipalityGermany: "Municipality is required for German Projects",
  /**
   * NEW — no canvas equivalent: the code app makes Municipality mandatory for French projects
   * and says so; the canvas only reddened the field
   */
  municipalityFrance: "Municipality is required for France Projects",
  /** GUIDE p13: the informational banner's exact text — no trailing period, "100%" not "100 %". */
  /** `lbl_AdminContract_Last_Apply_All_Tracking_1.Text` — verbatim. */
  shareholdingSum: "Shareholding entity ownership sum must be 100%",
  /**
   * `lbl_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_Percentage_ErrorMessage.Text`
   * — verbatim.
   */
  shareholdingPercentShape: "Percentage must be number with two decimal place.",
  /**
   * INTERPOLATED — canvas
   * `lbl_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_Percentage_ErrorMessage_1.Text`
   * builds this from "You have achieved " + the total + "%. Please correct your input!."
   */
  shareholdingFull: "You have achieved 100%. Please correct your input!.",
  /**
   * NEW — no canvas equivalent: the code app requires a custom name for a Third Party
   * shareholder; the canvas saved a blank one
   */
  shareholdingCustomName: "Custom name is required for a Third Party entity.",
} as const;

/** `$"Keep ""{original}"" - you can only add to the end."` (rule 11). */
export const budgetingRenameMessage = (original: string) =>
  `Keep "${original}" - you can only add to the end.`;

/* ═════════════════════════════════════════════════════════════════ the form ════ */

export interface GeneralDataForm {
  projectName: string;
  shortName: string;
  projectType: string | null;
  /** `'A unique identifer for Microsoft Entra ID'` of the picked persona. */
  managerEntraRowId: string | null;
  /** GUIDE p12: the picker renders a chip with the person's name — carried alongside the id. */
  managerName: string | null;
  deputyManagerEntraRowId: string | null;
  deputyManagerName: string | null;
  spvName: string;
  spvCompanyCode: string;
  spvLegalStructure: string | null;
  countryId: string | null;
  areaId: string | null;
  district: string;
  /** Free-text municipality — used for every country except Germany and France. */
  municipality: string;
  /** `cmb_..._Municipality_Germany.Selected.municipality` */
  municipalityGermany: string | null;
  /** `cmb_..._Municipality_France_1.Selected.Municipality` */
  municipalityFrance: string | null;
  utilizationId: string | null;
  terrainSize: string;
  latitude: string;
  longitude: string;
  taxFactor: string;
  technology: string | null;
  developmentType: number | null;
  /** 0..6 — only meaningful for an Acquired Project (rule 25). */
  startCluster: number | null;
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
  // GUIDE p10 — a brand-new record already shows "Own Development" selected, not blank.
  developmentType: CHOICE.developmentType.ownDevelopment,
  startCluster: null,
  acquisitionDate: null, acquisitionPrice: "",
};

export interface CountryRef {
  id: string;
  name: string;
  /** `Countries.Key` — the raw key the terrain-size rule tests against `"25"`. */
  key: string | null;
  /** `Countries.'Besitzer (Unternehmenseinheit)'` — used by Patch #1. */
  besitzerBusinessUnitId?: string | null;
  /** `Countries.'Business Unit'` — used by Patch #2. Two columns, one target. */
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
  /** Country ids that have at least one `CountryAreas` row (rule 8). */
  countryIdsWithAreas: string[];
  projectStates: ProjectStateRef[];
  /** `gblEnvironmentName` — "Budgeting" unlocks the project-name rules. */
  environmentName: string;
  language: Lang;
}

/** The persisted project, in the shape the rules need. */
export interface ProjectSnapshot {
  id: string | null;
  /** 'Project ID' */
  projectNumber: string | null;
  internalProjectId: string | null;
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
  besitzerBusinessUnitId: string | null;
  startCluster: number | null;
  shareOfFarmdown: number | null;
  isStandardShareOfFarmdown: boolean | null;
  standardCostCreated: boolean | null;
  /** The eight dates the Start-Cluster classifier looks at. */
  projectStartDate: string | null;
  feasibilityStudies: string | null;
  projectDevelopmentStarted: string | null;
  applicationSubmitted: string | null;
  legallyBindingPermits: string | null;
  fid: string | null;
  construction: string | null;
  cod: string | null;
}

/* ══════════════════════════════════════════════════ shareholding entities ════ */

export interface ShareholdingEntity {
  /** Client-side key; stable across edits so `remainingPct` can exclude the row. */
  key: string;
  /** Dataverse id, absent for a row that has never been written. */
  recordId?: string | null;
  entityTypeValue: number | null;
  entityTypeName?: string | null;
  customName: string;
  /** Stored as a FRACTION (rule 16): 33.33 % is 0.3333. */
  ownership: number;
}

/** `'Ownership [%]': Round(Value(pct) / 100, 4)` (rule 16). */
export function ownershipFraction(pct: number | string, language: Lang = "en-US"): number {
  const n = typeof pct === "number" ? pct : parseNumber(pct, language);
  return Number.isNaN(n) ? NaN : pfxRound(n / 100, 4);
}

export const shareholdingSum = (entities: ShareholdingEntity[]): number =>
  pfxRound(entities.reduce((a, e) => a + (e.ownership || 0), 0), 4);

/** `Sum(colShareholdingEntities, 'Ownership [%]') = 1` (rule 16). */
export const isShareholdingComplete = (entities: ShareholdingEntity[]): boolean =>
  shareholdingSum(entities) === 1;

/**
 * `varSumEntitiesPercent: Round((1 - (Sum(all) - editing.'Ownership [%]')), 4) * 100`
 * (rule 17) — how much a new or edited entity is allowed to claim.
 */
export function remainingPct(entities: ShareholdingEntity[], editingKey?: string | null): number {
  const editing = editingKey ? entities.find((e) => e.key === editingKey) : undefined;
  const others = shareholdingSum(entities) - (editing?.ownership ?? 0);
  // The canvas is `Round(1 - others, 4) * 100`. The product is rounded again because
  // `0.3 * 100` is 30.000000000000004 in IEEE 754, and a range message reading
  // "between 0.1 and 30.000000000000004" is a bug the source never had to face.
  return pfxRound(pfxRound(1 - others, 4) * 100, 4);
}

/** `'Custom Name'` is required and stored only for Third Party (rule 18). */
export const isThirdParty = (entityTypeValue: number | null | undefined): boolean =>
  entityTypeValue === CHOICE.shareholderEntityType.thirdParty;

/**
 * GUIDE p13 — the table's "Description" column. The one captured row reads a Third
 * Party's custom name verbatim ("Green Yield One (IPP2)"); a VSB Group / Co-investor row
 * has no custom name to show, so it falls back to the entity type's own label.
 */
export function shareholdingDescription(e: ShareholdingEntity): string {
  if (isThirdParty(e.entityTypeValue) && !isBlank(e.customName.trim())) return e.customName;
  return e.entityTypeName ?? "—";
}

export interface ShareholderDraft {
  key: string;
  recordId?: string | null;
  entityTypeValue: number | null;
  customName: string;
  /** As typed, in percent. */
  percent: string;
}

/** The shareholding panel's own save gate — name and percentage errors. */
export function shareholderPanelErrors(
  draft: ShareholderDraft,
  entities: ShareholdingEntity[],
  language: Lang = "en-US",
): string[] {
  const out: string[] = [];
  if (draft.entityTypeValue === null) out.push(MSG.inputBlank);
  if (isThirdParty(draft.entityTypeValue) && isBlank(draft.customName.trim())) {
    out.push(MSG.shareholdingCustomName);
  }
  const max = remainingPct(entities, draft.key);
  if (isBlank(draft.percent)) {
    out.push(MSG.inputBlank);
  } else if (!isTwoDecimal(draft.percent, language)) {
    out.push(MSG.shareholdingPercentShape);
  } else if (max <= 0) {
    out.push(MSG.shareholdingFull);
  } else if (!inRange(draft.percent, 0.1, max, language)) {
    out.push(`Please select a value between 0.1 and ${max}`);
  }
  return out;
}

/** Panel save → the collection row. `Custom Name` is dropped unless Third Party (rule 18). */
export function applyShareholderDraft(
  entities: ShareholdingEntity[],
  draft: ShareholderDraft,
  language: Lang = "en-US",
): ShareholdingEntity[] {
  const row: ShareholdingEntity = {
    key: draft.key,
    recordId: draft.recordId ?? null,
    entityTypeValue: draft.entityTypeValue,
    customName: isThirdParty(draft.entityTypeValue) ? draft.customName.trim() : "",
    ownership: ownershipFraction(draft.percent, language),
  };
  const i = entities.findIndex((e) => e.key === draft.key);
  if (i < 0) return [...entities, row];
  const next = [...entities];
  next[i] = row;
  return next;
}

/**
 * Rule 19 — deleting an entity removes it from the collection and, only if it already
 * exists in Dataverse, from `ShareholderEntityInProjects` too.
 */
export function planShareholderDelete(
  entities: ShareholdingEntity[],
  key: string,
): { entities: ShareholdingEntity[]; writes: WriteOp[] } {
  const victim = entities.find((e) => e.key === key);
  return {
    entities: entities.filter((e) => e.key !== key),
    writes: victim?.recordId
      ? [{ op: "delete", entitySet: ES.shareholderEntityInProjects, id: victim.recordId }]
      : [],
  };
}

/* ═══════════════════════════════════════════════════════ conditional fields ════ */

/**
 * `'Approval States'.Draft` — the option set's initial value. `entities.ts` names the same
 * value `notStarted`; the canvas calls it Draft on this screen. One value, two labels.
 */
export const APPROVAL_STATE_DRAFT = CHOICE.approvalState.notStarted;

/** `vsb_startcluster` numbers its own options 0..6, so this is an identity map. */
export function startClusterNo(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return value >= 0 && value <= 6 ? value : 0;
}

/** "Cluster 5 and Cluster 6 have same milestone impact" — clamp at 5 (rule 26). */
export const milestoneImpactNo = (n: number): number => Math.min(n, 5);

/** Rule 2 — the sub-technology block only exists for Hybrid. */
export const isSubTechnologyVisible = (technology: string | null | undefined): boolean =>
  !isBlank(technology) && technology === "Hybrid";

/** Rule 24 — the acquisition row only exists for an Acquired Project. */
export const isAcquisitionRowVisible = (developmentType: number | null | undefined): boolean =>
  developmentType === CHOICE.developmentType.acquiredProject;

/** Rule 8 — Area is required only when the chosen country actually has areas. */
export function isAreaRequired(
  selectedCountryId: string | null | undefined,
  projectCountryId: string | null | undefined,
  countryIdsWithAreas: string[],
): boolean {
  return countryIdsWithAreas.some((id) => id === selectedCountryId || id === projectCountryId);
}

/**
 * Rule 23 / save gate — Terrain Size is mandatory for country `Key = "25"`.
 *
 * The canvas hard-codes the raw key. It is kept as the key rather than resolved to a
 * country name because the key is what the source compares, and the `Countries` rows
 * in the export do not make the mapping unambiguous.
 */
export function isTerrainSizeRequired(
  selectedCountryKey: string | null | undefined,
  projectCountryKey: string | null | undefined,
): boolean {
  return selectedCountryKey === TERRAIN_SIZE_COUNTRY_KEY
    || projectCountryKey === TERRAIN_SIZE_COUNTRY_KEY;
}

/** Rule 12 / save gate — Germany and France must pick from their municipality list. */
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
 * Rule 12 — the French list is suppressed below three characters
 * (`If(Len(Self.SearchText) < 3, Filter(colAssumptionsFranceSQL, false), ...)`).
 */
export const franceSearchIsSuppressed = (searchText: string): boolean =>
  searchText.trim().length < 3;

/** Rule 21 — SPV legal structure is required only for Germany with an SPV name present. */
export const isSpvLegalStructureRequired = (
  countryName: string | null | undefined,
  spvName: string,
): boolean => countryName === "Germany" && !isBlank(spvName.trim());

/**
 * GUIDE p14 — the field is VISIBLE for any Germany project, whether or not SPV Name is
 * filled (the saved record shows it with SPV Name still blank). Visibility and
 * requiredness are different questions: `isSpvLegalStructureRequired` still gates the
 * save message, this only gates whether the control is on the form at all.
 */
export const isSpvLegalStructureVisible = (countryName: string | null | undefined): boolean =>
  countryName === "Germany";

/** GUIDE p14 — the header's status subtitle reads Dataverse's active/inactive state. */
export const recordStatusLabel = (statecode: number | null | undefined): string =>
  statecode === 0 || statecode === null || statecode === undefined ? "Active" : "Inactive";

/* ═══════════════════════════════════════════════════════════ display modes ════ */

export type FieldMode = "edit" | "view";

/**
 * Rule 5 — the Country dropdown is scoped to the caller's editable countries UNLESS the
 * scope is empty or the project's own country falls outside it.
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

/** Rule 6 — Country is read-only once Approved, without create permission, or out of scope. */
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

/** Rules 9 and 10 — Name and Area lock once the project has advanced past Draft. */
export function fieldModes(args: {
  clusterStateOrder: number | null;
  environmentName: string;
}): { projectName: FieldMode; area: FieldMode } {
  const advanced = (args.clusterStateOrder ?? 0) >= 1;
  return {
    projectName: args.environmentName === "Budgeting" ? "edit" : advanced ? "view" : "edit",
    area: advanced ? "view" : "edit",
  };
}

/* ════════════════════════════════════════════════════════════════ the map ════ */

export const MAP_DEFAULT = { lat: 51.28474541372019, lng: 13.712023258608735 } as const;

/**
 * Rule 15 — `Coalesce(locChangedLatitude2, Location.Latitude, "51.28474541372019")`.
 * The device location is passed in rather than read, so this stays pure.
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
 * GUIDE p12 — Latitude/Longitude message, eager and format-first: a blank field shows the
 * SAME "decimal degrees" format message as a malformed one (the canvas does not show a
 * separate "required" message here), and only a well-formed value gets range-checked.
 */
export function coordinateMessage(
  raw: string,
  axis: "lat" | "lng",
  language: Lang = "en-US",
): string | null {
  if (isBlank(raw.trim())) return MSG.coordinateFormat;
  if (!isSixDecimal(raw, language)) return MSG.coordinateFormat;
  const [min, max] = axis === "lat" ? [-90, 90] : [-180, 180];
  if (!inRange(raw, min, max, language)) {
    return axis === "lat" ? MSG.latitudeRange : MSG.longitudeRange;
  }
  return null;
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

const countryOf = (ctx: ValidationContext): CountryRef | undefined =>
  ctx.ref.countries.find((c) => c.id === (ctx.form.countryId ?? ctx.project?.countryId));

/**
 * `ibtn_GeneralData_..._Requered_Fileds.Content` — every currently-visible message,
 * concatenated in the canvas's order. Also the primary test target for `canSave`.
 */
export function validationMessages(ctx: ValidationContext): string[] {
  const { form, ref, project } = ctx;
  const lang = ref.language;
  const out: string[] = [];
  const country = countryOf(ctx);

  /* project name */
  const name = form.projectName.trim();
  if (isBlank(name) || name.length < 3) out.push(MSG.projectName);
  // Rule 11 — in Budgeting a renamed project may only be EXTENDED.
  const original = project?.originalProjectName ?? null;
  if (
    ref.environmentName === "Budgeting"
    && !isBlank(original)
    && !form.projectName.startsWith(original!)
  ) {
    out.push(budgetingRenameMessage(original!));
  }

  /* short name, technology, manager, development type */
  if (isBlank(form.shortName.trim()) || form.shortName.trim().length < 3) out.push(MSG.shortName);
  if (isBlank(form.technology)) out.push(MSG.technology);
  if (isBlank(form.managerEntraRowId)) out.push(MSG.manager);
  if (form.developmentType === null) out.push(MSG.developmentType);

  /* start cluster + acquisition — only while the acquisition row is visible (rule 24) */
  if (isAcquisitionRowVisible(form.developmentType)) {
    if (form.startCluster === null) out.push(MSG.startCluster);
    if (isBlank(form.acquisitionDate)) out.push(MSG.acquisitionDate);
    if (isBlank(form.acquisitionPrice)) {
      out.push(MSG.acquisitionPriceBlank);
    } else if (
      !isInteger(form.acquisitionPrice, lang)
      || !inRange(form.acquisitionPrice, 0, 1_000_000_000, lang)
    ) {
      out.push(MSG.acquisitionPriceShape);
    }
  }

  /* country and area */
  if (isBlank(form.countryId) && isBlank(project?.countryId)) out.push(MSG.country);
  if (
    isAreaRequired(form.countryId, project?.countryId, ref.countryIdsWithAreas)
    && isBlank(form.areaId)
  ) {
    out.push(MSG.area);
  }

  /* terrain size — mandatory only for country key "25" */
  if (isTerrainSizeRequired(country?.key, project?.countryKey)) {
    if (isBlank(form.terrainSize)) out.push(MSG.inputBlank);
  }
  if (!isBlank(form.terrainSize)) {
    if (!isOneDecimal(form.terrainSize, lang)) out.push(MSG.numericOneDecimals);
    else if (!inRange(form.terrainSize, 0.1, 1000, lang)) out.push(MSG.terrainRange);
  }

  /* latitude / longitude — 6 decimals, culture-aware, range-checked (rule 14) */
  const latMessage = coordinateMessage(form.latitude, "lat", lang);
  if (latMessage) out.push(latMessage);
  const lngMessage = coordinateMessage(form.longitude, "lng", lang);
  if (lngMessage) out.push(lngMessage);

  /*
   * SPV block (rules 20, 21). GUIDE p14: Basic Information has no SPV Company Code
   * control, so it can no longer be required — there is no field left for anyone to fill
   * it in. The shape check stays as a defensive guard for a value arriving from
   * elsewhere; only the blank-required push is gone.
   */
  if (!isBlank(form.spvCompanyCode) && !inRange(form.spvCompanyCode, 1000, 9999, lang)) {
    out.push(MSG.spvCodeShape);
  }
  if (isSpvLegalStructureRequired(country?.name, form.spvName) && isBlank(form.spvLegalStructure)) {
    out.push(MSG.spvLegalStructure);
  }

  /* tax factor — integer 0..1000 (rule 22) */
  if (!isBlank(form.taxFactor)) {
    if (!isInteger(form.taxFactor, lang)) out.push(MSG.taxFactorShape);
    else if (!inRange(form.taxFactor, 0, 1000, lang)) out.push(MSG.taxFactorRange);
  }

  /* municipality (rule 12 + save gate) */
  const muni = isMunicipalityRequired(country?.name);
  if (muni === "germany" && isBlank(form.municipalityGermany)) out.push(MSG.municipalityGermany);
  if (muni === "france" && isBlank(form.municipalityFrance)) out.push(MSG.municipalityFrance);

  // Rule 16 REVISED — GUIDE p13: the walkthrough saves with a single 50 % row and Save was
  // never blocked by the sum. The 100 % total is guidance (`shareholdingSumWarning`,
  // rendered as the ever-present info banner), not a save-blocking message.

  return out;
}

/**
 * GUIDE p13 — the informational banner's companion: non-blocking, so `canSave` never
 * reads it. `null` once the sum is exactly 100 %, or while the table is empty (the
 * "at least one entity" gate below covers that case with its own message).
 */
export function shareholdingSumWarning(entities: ShareholdingEntity[]): string | null {
  return entities.length > 0 && !isShareholdingComplete(entities) ? MSG.shareholdingSum : null;
}

export interface SavePermissions {
  /** `DataSourceInfo(Projects, CreatePermission)` — server-derived. */
  canCreate: boolean;
  /** `RecordInfo(gblRecordSelectedProject, EditPermission)` — server-derived. */
  canEdit: boolean;
}

/**
 * `pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save.DisplayMode`, in one function.
 *
 * Permission comes from the server (CONVENTIONS rule 4): a new project needs create
 * permission, an existing one needs edit permission on the record.
 */
export function canSave(ctx: ValidationContext & {
  perms: SavePermissions;
  isDirty: boolean;
}): boolean {
  const { perms, isDirty, project, entities } = ctx;

  const permitted = project?.id ? perms.canEdit : perms.canCreate;
  if (!permitted) return false;
  if (!isDirty) return false;

  // At least one shareholding entity must exist, in the collection or in Dataverse.
  if (entities.length === 0 && !ctx.hasPersistedShareholders) return false;
  // Rule 16 REVISED — GUIDE p13: the 100 % total is a warning (`shareholdingSumWarning`),
  // not a save gate. The obvious port of the canvas rule blocks Save here; it must not.

  return validationMessages(ctx).length === 0;
}

/* ══════════════════════════════════════════════ start-cluster classification ════ */

export type StartClusterChange = "direct-save" | "panel-upward" | "panel-downward";

/** `varHasAnyMilestoneData` (rule 26) — is there any milestone date at all? */
export function hasAnyMilestoneData(p: ProjectSnapshot | null): boolean {
  if (!p) return false;
  return [
    p.projectStartDate, p.feasibilityStudies, p.projectDevelopmentStarted,
    p.applicationSubmitted, p.legallyBindingPermits, p.fid, p.construction, p.cod,
  ].some((d) => !isBlank(d));
}

/** `varHasAnyMilestoneToDelete` (rule 26) — would the new start cluster blank anything? */
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

/**
 * Rule 26 — classify a Start-Cluster change before saving.
 *
 * The save proceeds directly when the type is Own Development, the new cluster is
 * Greenfield, old = new, the CLAMPED impacts are equal (Cluster 5 <-> Cluster 6), there
 * is no milestone data at all, or the move is upward but nothing would be deleted.
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
  const newNo = developmentType === CHOICE.developmentType.acquiredProject
    ? startClusterNo(selectedCluster)
    : CHOICE.clusterState.greenfield;

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

export type ClusterPanelField =
  | "startDate" | "cluster1" | "cluster2" | "cluster3" | "cluster4"
  | "fid" | "cluster5" | "cluster6";

/**
 * Which rows the panel shows for a given new start cluster. Cluster i is visible while
 * `locNewStartClusterNo <= i`; FID, Cluster 5 and Cluster 6 are always visible.
 */
export function clusterPanelVisibleFields(newStartClusterNo: number): ClusterPanelField[] {
  const out: ClusterPanelField[] = [];
  if (newStartClusterNo <= 0) out.push("startDate");
  if (newStartClusterNo <= 1) out.push("cluster1");
  if (newStartClusterNo <= 2) out.push("cluster2");
  if (newStartClusterNo <= 3) out.push("cluster3");
  if (newStartClusterNo <= 4) out.push("cluster4");
  out.push("fid", "cluster5", "cluster6");
  return out;
}

const asTime = (d: string | null): number | null => {
  if (isBlank(d)) return null;
  const t = new Date(d!).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Rule 28 — the panel's milestone dates are strictly increasing and each is required
 * while visible. One entry per field that currently fails.
 */
export function milestoneChainErrors(
  dates: ClusterPanelDates,
  newStartClusterNo: number,
): Partial<Record<ClusterPanelField, string>> {
  const visible = new Set(clusterPanelVisibleFields(newStartClusterNo));
  const out: Partial<Record<ClusterPanelField, string>> = {};

  const check = (
    field: ClusterPanelField,
    label: string,
    value: string | null,
    prev: { field: ClusterPanelField; label: string; value: string | null } | null,
  ) => {
    if (!visible.has(field)) return;
    if (isBlank(value)) {
      out[field] = `${label} date cannot be blank.`;
      return;
    }
    if (!prev || !visible.has(prev.field)) return;
    const a = asTime(value);
    const b = asTime(prev.value);
    if (a !== null && b !== null && a <= b) {
      out[field] = `${label} must be later than ${prev.label}.`;
    }
  };

  check("startDate", "Project Start", dates.startDate, null);
  check("cluster1", "Cluster 1", dates.cluster1,
    { field: "startDate", label: "Project Start", value: dates.startDate });
  check("cluster2", "Cluster 2", dates.cluster2,
    { field: "cluster1", label: "Cluster 1", value: dates.cluster1 });
  check("cluster3", "Cluster 3", dates.cluster3,
    { field: "cluster2", label: "Cluster 2", value: dates.cluster2 });
  check("cluster4", "Cluster 4", dates.cluster4,
    { field: "cluster3", label: "Cluster 3", value: dates.cluster3 });
  check("fid", "Final Investment Decision", dates.fid,
    { field: "cluster4", label: "Cluster 4", value: dates.cluster4 });
  check("cluster5", "Cluster 5", dates.cluster5,
    { field: "fid", label: "Final Investment Decision", value: dates.fid });
  check("cluster6", "Cluster 6", dates.cluster6,
    { field: "cluster5", label: "Cluster 5", value: dates.cluster5 });

  return out;
}

/** The panel's save button — disabled while any error is present and the move is downward. */
export function canSaveClusterPanel(args: {
  dates: ClusterPanelDates;
  newStartClusterNo: number;
  isDownward: boolean;
}): boolean {
  if (!args.isDownward) return true;
  return Object.keys(milestoneChainErrors(args.dates, args.newStartClusterNo)).length === 0;
}

/**
 * Rule 29 / Milestones rule 17 — blank the milestones the start cluster skips and clear
 * their "Standard Assumption?" flags. THE SAME RULE IN TWO PLACES: General Data's
 * cluster-change panel and the Milestones save both apply it, so it lives here once and
 * features/milestones imports it.
 *
 * The canvas writes `If(cond, false)`, which evaluates to `Blank()` when the condition is
 * false and therefore blanks the flag. Here the flag is simply left untouched when the
 * threshold is not reached — same observable effect, one fewer write.
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

/* ═══════════════════════════════════════════════════════════ tracking rebuild ════ */

export const AUTO_SKIPPED_COMMENT =
  "Automatically completed because this project starts at a later cluster.";

const CHECKLIST_CLUSTER_NO: Record<string, number> = {
  Draft: 0, "Cluster 1": 1, "Cluster 2": 2, "Cluster 3": 3,
  "Cluster 4": 4, "Cluster 5": 5, "Cluster 6": 6,
};

export interface TrackingRow {
  id: string;
  clusterStateId: string;
  approvalClusterState: number | null;
  flowRunId: string | null;
}

export interface PlannedTrackingRow {
  clusterStateId: string;
  clusterStateName: string;
  clusterNo: number;
  approvalClusterState: number;
  comment: string | null;
  existingTrackingId: string | null;
}

/**
 * Rule 33 step 3 — one `Project State Trackings` row per checklist cluster:
 * Draft → In Progress; clusters strictly between 0 and the new start cluster →
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
      const clusterNo = CHECKLIST_CLUSTER_NO[s.name];
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

/**
 * Rule 33 step 1 — the gate approval is cancelled only when the Draft tracking row has a
 * live `FlowRunId` AND is `In Progress`.
 */
export function shouldCancelGateApproval(draftTracking: TrackingRow | null | undefined): boolean {
  if (!draftTracking) return false;
  if (isBlank(draftTracking.flowRunId)) return false;
  return draftTracking.approvalClusterState === CHOICE.approvalClusterState.inProgress;
}

/* ══════════════════════════════════════════════════════════════ the project patch ════ */

/**
 * Patch #1 (rule 31) — `Patch(Projects, If(IsBlank(project), Defaults(Projects), project), {...})`.
 *
 * Returns just the field payload; `hooks.ts` decides create vs update.
 */
export function buildProjectPatch(
  form: GeneralDataForm,
  ref: GeneralDataRefData,
  project: ProjectSnapshot | null,
): Record<string, unknown> {
  const lang = ref.language;
  const country = ref.countries.find((c) => c.id === form.countryId);
  const countryName = country?.name ?? project?.countryName ?? null;
  const acquired = isAcquisitionRowVisible(form.developmentType);
  const draftState = ref.projectStates.find((s) => s.name === "Draft");

  const municipality =
    countryName === "Germany" ? form.municipalityGermany
    : countryName === "France" ? form.municipalityFrance
    : form.municipality;

  const numeric = (raw: string): number | null => {
    if (isBlank(raw)) return null;
    const n = parseNumber(raw, lang);
    return Number.isNaN(n) ? null : n;
  };

  return {
    [PROJECT_COL.name]: form.projectName,
    [PROJECT_COL.shortName]: form.shortName,
    [PROJECT_COL.projectType]: form.projectType,
    [PROJECT_COL.district]: form.district,
    [PROJECT_COL.municipality]: municipality,
    [PROJECT_COL.terrainSize]: numeric(form.terrainSize),
    [PROJECT_COL.latitude]: numeric(form.latitude),
    [PROJECT_COL.longitude]: numeric(form.longitude),
    // Back to the option-set integer. Writing the label would be a 400 against a choice
    // column in live Dataverse; `technologyValue` returns null for an unrecognised label,
    // which `validateGeneralData` has already rejected as blank before a save can reach here.
    [PROJECT_COL.technology]: technologyValue(form.technology),
    [PROJECT_COL.taxFactor]: numeric(form.taxFactor),

    // 'Approval States': If(IsBlank(existing), 'Approval States'.Draft, existing)
    [PROJECT_COL.approvalState]: project?.approvalState ?? APPROVAL_STATE_DRAFT,

    [PROJECT_COL.spvName]: form.spvName,
    // 'SPV Company Code': If(Len(SPVName) = 0, Blank(), Value(code))
    [PROJECT_COL.spvCompanyCode]:
      form.spvName.length === 0 ? null : numeric(form.spvCompanyCode),
    // 'SPV Legal Structure' is only stored for Germany.
    [PROJECT_COL.spvLegalStructure]:
      countryName === "Germany" ? form.spvLegalStructure : null,

    [PROJECT_COL.shareOfFarmdown]: project?.shareOfFarmdown ?? 50,
    [PROJECT_COL.isStandardShareOfFarmdown]: project?.isStandardShareOfFarmdown ?? true,
    [PROJECT_COL.standardCostCreated]: project?.standardCostCreated ?? false,

    [PROJECT_COL.developmentType]: form.developmentType,
    // Rule 25 — Start Cluster is only meaningful for an Acquired Project.
    [PROJECT_COL.startCluster]: acquired
      ? startClusterNo(form.startCluster)
      : CHOICE.clusterState.greenfield,
    [PROJECT_COL.acquisitionDate]: acquired ? form.acquisitionDate : null,
    [PROJECT_COL.acquisitionPrice]: acquired ? numeric(form.acquisitionPrice) : null,

    ...bind(PROJECT_LOOKUP.country, ES.countries, form.countryId ?? project?.countryId),
    ...bind(PROJECT_LOOKUP.area, ES.countryAreas, form.areaId),
    ...bind(PROJECT_LOOKUP.utilization, ES.customChoiceValues, form.utilizationId),
    ...bind(PROJECT_LOOKUP.projectManager, ES.microsoftEntraIds, form.managerEntraRowId),
    ...bind(
      PROJECT_LOOKUP.deputyProjectManager, ES.microsoftEntraIds, form.deputyManagerEntraRowId,
    ),
    // 'Cluster State': Coalesce(existing, LookUp('Project States', Name = "Draft"))
    ...bind(
      PROJECT_LOOKUP.clusterState, ES.projectStates,
      project?.clusterStateId ?? draftState?.id ?? null,
    ),
    // Patch #1 uses Countries.'Besitzer (Unternehmenseinheit)'; Patch #2 uses
    // Countries.'Business Unit'. Two different columns feeding the same target (rule 32).
    "owningbusinessunit@odata.bind":
      (country?.besitzerBusinessUnitId ?? project?.besitzerBusinessUnitId)
        ? `/businessunits(${country?.besitzerBusinessUnitId ?? project?.besitzerBusinessUnitId})`
        : null,
  };
}

/**
 * SOURCE DEFECT (rule 31, and the identical pattern in the Team save):
 *   'Project Manager': LookUp('Microsoft Entra IDs',
 *       Or(IsBlank(First(picker.SelectedPeople)), <id match>))
 * When the picker is empty, `Or(true, ...)` matches the FIRST Entra row, so an empty
 * picker silently assigns an arbitrary person as project manager. The save button's
 * DisplayMode normally prevents it, but the guard is in the UI only.
 *
 * `assertManagerSelected` closes the hole in the mutation layer.
 */
export function assertManagerSelected(form: GeneralDataForm): string | null {
  return isBlank(form.managerEntraRowId) ? MSG.manager : null;
}

/* ═══════════════════════════════════════════════════════ the save orchestration ════ */

export type SaveStepKind =
  | "patch-project"
  | "cancel-gate-approval"
  | "rebuild-trackings"
  | "flush-shareholders"
  | "reprice-generators"
  | "ensure-draft-tracking";

export interface SaveStep {
  kind: SaveStepKind;
  /** The `colProcessingSteps` line this step contributes on success. */
  log: string | null;
  writes: WriteOp[];
  /** Flow to call before this step's writes are issued. */
  flow?: { name: "cancelGateApproval"; stateTrackingId: string };
}

export interface SavePlan {
  steps: SaveStep[];
  /** Every write in the plan, in step order — hand straight to one batch. */
  writes: WriteOp[];
  /** `colProcessingSteps` — the running log the canvas concatenated into one Notify. */
  log: string[];
  flowCalls: NonNullable<SaveStep["flow"]>[];
}

export interface GeneratorRow {
  id: string;
  /** `'Generators Cost'` after any re-pricing. */
  generatorsCost: number;
}

export interface SaveCleanupContext {
  /** The project AFTER Patch #1, re-read so `Project ID` is populated. */
  saved: ProjectSnapshot;
  form: GeneralDataForm;
  ref: GeneralDataRefData;
  /** True when the classifier said the start cluster actually moved. */
  startClusterChanged: boolean;
  newStartClusterNo: number;
  /** `Project State Trackings` rows the screen already read for this project. */
  trackings: TrackingRow[];
  /** `locNeedShareholdingEntitiesUpdate` */
  shareholdersDirty: boolean;
  entities: ShareholdingEntity[];
  /** Rule 19 — entities removed in the panel that already existed in Dataverse. */
  removedShareholderIds?: string[];
  /** `locNeedPlantCostsRecalculation` */
  repriceGenerators: boolean;
  generators: GeneratorRow[];
}

/**
 * The 463-line `btn_GeneralData_Save_Actual.OnSelect` cleanup, as an ordered list of steps.
 *
 * `hooks.ts` has already done the two sequential parts that cannot be batched, because
 * both need a server round trip before the next value is known:
 *   1. Patch #1 — create or update `Projects` (`buildProjectPatch`).
 *   2. Re-read the row so Dataverse has assigned `Project ID`.
 *
 * Everything after that is planned here and issued as ONE batch. The canvas's explicit
 * ordering comment is honoured: cleanup runs only after the project save succeeds.
 *
 * The three separate `Patch(Projects, ...)` calls the canvas makes after the re-read
 * (Patch #2's id back-fill, the force-back-to-Draft, and the plant-cost update) are
 * MERGED into one `update` on the same row. Three sequential PATCHes to one record is
 * three round trips and three sets of row-change webhooks for no benefit.
 */
export function planSaveCleanup(ctx: SaveCleanupContext): SavePlan {
  const { saved, form, ref, trackings } = ctx;
  const steps: SaveStep[] = [];
  const projectId = saved.id!;
  const country = ref.countries.find((c) => c.id === (form.countryId ?? saved.countryId));

  /* ---- step 1: the merged Projects patch ------------------------------------- */
  const projectPatch: Record<string, unknown> = {
    // Rule 32 — back-fill the internal id ONLY when it is blank.
    [PROJECT_COL.internalProjectId]:
      isBlank(saved.internalProjectId) ? saved.projectNumber : saved.internalProjectId,
    // Rule 32 — Patch #2 reads Countries.'Business Unit', not '.Besitzer (...)'.
    "owningbusinessunit@odata.bind":
      (country?.businessUnitId ?? saved.besitzerBusinessUnitId)
        ? `/businessunits(${country?.businessUnitId ?? saved.besitzerBusinessUnitId})`
        : null,
  };

  const draftState = ref.projectStates.find((s) => s.name === "Draft");
  if (ctx.startClusterChanged && draftState) {
    // Rule 33 step 2 — force the project's Cluster State back to Draft.
    Object.assign(projectPatch, bind(PROJECT_LOOKUP.clusterState, ES.projectStates, draftState.id));
  }

  const plantCost = ctx.repriceGenerators
    ? pfxRound(ctx.generators.reduce((a, g) => a + (g.generatorsCost || 0), 0), 2)
    : null;
  if (plantCost !== null) {
    // Rule 35 — 'Plant WTG Cost [EUR]': Sum(colProjectGenerators, 'Generators Cost')
    projectPatch[PROJECT_COL.plantWtgCost] = plantCost;
  }

  steps.push({
    kind: "patch-project",
    log: "Project data was saved/updated successfully.",
    writes: [{ op: "update", entitySet: ES.projects, id: projectId, data: projectPatch }],
  });

  /* ---- step 2: gate-approval cancellation + tracking rebuild ------------------ */
  if (ctx.startClusterChanged) {
    const draftTracking = draftState
      ? trackings.find((t) => t.clusterStateId === draftState.id) ?? null
      : null;

    if (shouldCancelGateApproval(draftTracking)) {
      steps.push({
        kind: "cancel-gate-approval",
        log: null,
        writes: [],
        flow: { name: "cancelGateApproval", stateTrackingId: draftTracking!.id },
      });
    }

    const planned = plannedTrackingRows(ref.projectStates, ctx.newStartClusterNo, trackings);
    steps.push({
      kind: "rebuild-trackings",
      log: "Project start cluster tracking was refreshed successfully.",
      writes: planned.map((row) => {
        const data: Record<string, unknown> = {
          [TRACKING_COL.approvalClusterState]: row.approvalClusterState,
          [TRACKING_COL.clusterStepState]: null,
          [TRACKING_COL.approvalDueDate]: null,
          [TRACKING_COL.flowRunId]: null,
          [TRACKING_COL.flowApprovalId]: null,
          [TRACKING_COL.approvalComment]: row.comment,
          ...bind("vsb_Project", ES.projects, projectId),
          ...bind("vsb_ClusterState", ES.projectStates, row.clusterStateId),
          "owningbusinessunit@odata.bind": saved.besitzerBusinessUnitId
            ? `/businessunits(${saved.besitzerBusinessUnitId})` : null,
        };
        return row.existingTrackingId
          ? { op: "update" as const, entitySet: ES.projectStateTrackings, id: row.existingTrackingId, data }
          : { op: "create" as const, entitySet: ES.projectStateTrackings, data };
      }),
    });
  }

  /* ---- step 3: shareholder flush --------------------------------------------- */
  const removed = ctx.removedShareholderIds ?? [];
  if (ctx.shareholdersDirty || removed.length > 0) {
    const deletes: WriteOp[] = removed.map((id) => ({
      op: "delete", entitySet: ES.shareholderEntityInProjects, id,
    }));
    steps.push({
      kind: "flush-shareholders",
      log: "Project Shareholder Entitiy was saved/updated successfully.",
      // Rule 34 is a ForAll-of-Patch — one round trip per row. Here it is one batch.
      writes: [...deletes, ...ctx.entities.map((e) => {
        const data: Record<string, unknown> = {
          [SHAREHOLDER_COL.entityType]: e.entityTypeValue,
          [SHAREHOLDER_COL.customName]: isThirdParty(e.entityTypeValue) ? e.customName : null,
          [SHAREHOLDER_COL.ownership]: e.ownership,
          ...bind("vsb_Project", ES.projects, projectId),
          "owningbusinessunit@odata.bind": saved.besitzerBusinessUnitId
            ? `/businessunits(${saved.besitzerBusinessUnitId})` : null,
        };
        return e.recordId
          ? { op: "update" as const, entitySet: ES.shareholderEntityInProjects, id: e.recordId, data }
          : { op: "create" as const, entitySet: ES.shareholderEntityInProjects, data };
      })],
    });
  }

  /* ---- step 4: generator re-pricing ------------------------------------------ */
  if (ctx.repriceGenerators) {
    steps.push({
      kind: "reprice-generators",
      log: `Plant WTG Cost (WTG's: ${ctx.generators.length}), was recalculated and updated successfully.`,
      writes: ctx.generators.map((g) => ({
        op: "update" as const,
        entitySet: ES.generatorTypeInProjects,
        id: g.id,
        data: { vsb_totalcosteur: g.generatorsCost },
      })),
    });
  }

  /* ---- step 5: the Draft tracking guarantee ---------------------------------- */
  // Rule 36 — a Draft row must exist at the end of EVERY save. If the rebuild above ran it
  // has already been written, and if one already existed it is not overwritten.
  const draftExists = draftState
    ? trackings.some((t) => t.clusterStateId === draftState.id)
    : false;
  if (draftState && !draftExists && !ctx.startClusterChanged) {
    steps.push({
      kind: "ensure-draft-tracking",
      log: "Draft approval tracking was created.",
      writes: [{
        op: "create",
        entitySet: ES.projectStateTrackings,
        data: {
          [TRACKING_COL.approvalClusterState]: CHOICE.approvalClusterState.inProgress,
          [TRACKING_COL.approvalComment]: null,
          [TRACKING_COL.approvalDueDate]: null,
          ...bind("vsb_Project", ES.projects, projectId),
          ...bind("vsb_ClusterState", ES.projectStates, draftState.id),
          "owningbusinessunit@odata.bind": saved.besitzerBusinessUnitId
            ? `/businessunits(${saved.besitzerBusinessUnitId})` : null,
        },
      }],
    });
  }

  return {
    steps,
    writes: steps.flatMap((s) => s.writes),
    log: steps.map((s) => s.log).filter((l): l is string => l !== null),
    flowCalls: steps.map((s) => s.flow).filter((f): f is NonNullable<SaveStep["flow"]> => !!f),
  };
}

/* ═════════════════════════════════════════════════════════════════ misc rules ════ */

/**
 * Rule 3 — Controlling membership is the union of the caller's roles containing
 * `gblTextControllingSecurityRoleName`, set in App.OnStart to
 * "VSB - Functional Approval Confirmation".
 */
/** `App.gblTextControllingSecurityRoleName` — the App.OnStart global, verbatim. */
export const CONTROLLING_ROLE_NAME = "VSB - Functional Approval Confirmation";
export const isUserInControllingGroup = (roleNames: string[]): boolean =>
  roleNames.includes(CONTROLLING_ROLE_NAME);

/**
 * Rule 13 — picking a German municipality copies its trade-tax rate into Tax Factor.
 * Returns the form patch so the caller does not have to know the field names.
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

/** Rule 7 — changing Country resets terrain size, French municipality, SPV structure, tax. */
export function onCountryChange(form: GeneralDataForm): GeneralDataForm {
  return {
    ...form,
    terrainSize: "",
    municipalityFrance: null,
    municipalityGermany: null,
    spvLegalStructure: null,
    taxFactor: "",
    areaId: null,
  };
}

/**
 * Rule 39 — leaving the screen with unsaved changes is intercepted:
 * `If(locIsGeneralFormDirty, UpdateContext({locLeaveGeneralDataConfirmationDialog: true}),
 *     <navigate>)`.
 */
export const shouldConfirmLeave = (isDirty: boolean): boolean => isDirty;

/** Latitude/longitude field validity, exposed for the inputs (rule 14). */
export function isCoordinateValid(
  raw: string,
  axis: "lat" | "lng",
  language: Lang = "en-US",
): boolean {
  if (isBlank(raw.trim())) return false;
  if (!isSixDecimal(raw, language)) return false;
  return axis === "lat"
    ? inRange(raw, -90, 90, language)
    : inRange(raw, -180, 180, language);
}

/** Exported so the tests can assert the numeric helpers are actually the shared ones. */
export const numericHelpers = { isNumeric, isInteger, isOneDecimal, isTwoDecimal, isSixDecimal };

/**
 * GUIDE p14 — `RecordFooter`'s "Created By" / "Modified By" line, e.g.
 * `"Shakti Singh Rajput  03.09.2026 10:49"`. `null` in and `null` out, which is what
 * renders the footer's own "..' placeholder for an unsaved record.
 *
 * The name is whoever the caller passes in, not read here — `_createdby_value` /
 * `_modifiedby_value` are not on `SELECT.projectFull` (`src/data/entities.ts`, outside
 * this feature's remit), so the caller currently has only the signed-in user's name to
 * offer. See the screen-level report for the data-layer gap this stands in for.
 */
export function formatAuditStamp(name: string | null, timestamp: string | null): string | null {
  if (isBlank(name) || isBlank(timestamp)) return null;
  const d = new Date(timestamp!);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${name}  ${date} ${time}`;
}
