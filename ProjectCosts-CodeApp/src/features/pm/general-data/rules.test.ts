/**
 * Project General Data Screen — unit tests (UT-GDATA-nnn). Pure functions only.
 * Redeveloped 19 Oct 2026 (D25): ids kept where the case survived; tests that pinned
 * GUIDE-screenshot behaviour now pin the canvas behaviour.
 */
import { describe, it, expect } from "vitest";
import { ES, CHOICE } from "@/data/dataverseNames";
import { isSixDecimal } from "@/domain/powerFxNumeric";
import { TECHNOLOGY_LABEL } from "@/domain/technology";
// The pac-generated choice enums, imported as VALUES in the test only (D25, PO answer 9).
import {
  Vsb_projectsvsb_approvalstates, Vsb_projectsvsb_developmenttype, Vsb_projectsvsb_projecttype,
  Vsb_projectsvsb_spvlegalstructure, Vsb_projectsvsb_startcluster, Vsb_projectsvsb_technology,
} from "@/generated/models/Vsb_projectsModel";
import { Vsb_shareholderentitiiesvsb_shareholderentitiytype } from "@/generated/models/Vsb_shareholderentitiiesModel";
import { Vsb_projectstatetrackingsvsb_approvalclusterstate } from "@/generated/models/Vsb_projectstatetrackingsModel";
import {
  APPROVAL_STATE_DRAFT, MSG, PROJECT_COL, PROJECT_LOOKUP, emptyGeneralDataForm, budgetingRenameMessage,
  validationMessages, requiredFieldsContent, fieldErrors, canSave, isAreaRequired, isTerrainSizeRequired,
  isMunicipalityRequired, municipalitySearchIsSuppressed, applyGermanMunicipality, applyFrenchMunicipality,
  countryOptions, countryDisplayMode, fieldModes, fieldModesCanvas709, ownershipFraction, remainingPct,
  isShareholdingComplete, shareholderPanelErrors, applyShareholderDraft, canSaveShareholderPanel,
  canSaveShareholderPanelCanvasParity, shareholderPanelFull, canAddShareholder,
  planShareholderDelete, isThirdParty, startClusterNo, milestoneImpactNo,
  classifyStartClusterChange, startClusterChanged, milestoneChainErrors, clearSkippedMilestones,
  clusterPanelPatch, clusterPanelVisible, clusterPanelEditable, clusterPanelInfo, canSaveClusterPanel,
  openClusterPanel, applyCalendarAdd, calendarAddVisible, clusterPanelDateIsStandard,
  plannedTrackingRows, shouldCancelGateApproval, startClusterChangeBlocked, saveBlockReason,
  buildProjectPatch, planGeneralDataSave, owningBusinessUnits,
  mapMarker, MAP_DEFAULT, shouldConfirmLeave, AUTO_SKIPPED_COMMENT,
  coordinateMessage, coordinateFormatMessage, terrainRangeMessage, acquisitionPriceShapeMessage,
  shareholdingDescription, deleteShareholderName, deleteShareholderNameCanvasParity,
  isSpvLegalStructureVisible, recordStatusLabel, formatAuditStamp, auditStampParts, isCoordinateValid,
  formatOwnership, coordinateText, toForm, toSnapshot, isFormDirty, onCountryChange, onAreaChange,
  onSpvNameChange, onDevelopmentTypeChange, formLocks, stepLogText, shareholdingFullMessage,
  PROJECT_TYPE_LABEL, SPV_LEGAL_STRUCTURE_LABEL, CLUSTER_STATE_LABEL, START_CLUSTER_OPTIONS,
  SHAREHOLDER_ENTITY_TYPE_LABEL, DEVELOPMENT_TYPE_LABEL,
  taxFactorFallbackMunicipality, taxFactorFallbackMunicipalityCanvasParity,
  planProjectCreate, planSaveFollowUps, createdProjectSnapshot,
  type GeneralDataForm, type GeneralDataRefData, type ProjectSnapshot, type ProjectRow,
  type ShareholdingEntity, type ProjectStateRef, type TrackingRow,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const COUNTRIES = [
  { id: "c-de", name: "Germany", key: "25", besitzerBusinessUnitId: "bu-de", businessUnitId: "bu-de2" },
  { id: "c-fr", name: "France", key: "12", besitzerBusinessUnitId: "bu-fr", businessUnitId: "bu-fr2" },
  { id: "c-pl", name: "Poland", key: "33", besitzerBusinessUnitId: "bu-pl", businessUnitId: "bu-pl2" },
];

const STATES: ProjectStateRef[] = [
  { id: "s-draft", name: "Draft", order: 0, isVisibleOnChecklist: true },
  { id: "s-c1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true },
  { id: "s-c2", name: "Cluster 2", order: 2, isVisibleOnChecklist: true },
  { id: "s-c3", name: "Cluster 3", order: 3, isVisibleOnChecklist: true },
  { id: "s-c4", name: "Cluster 4", order: 4, isVisibleOnChecklist: true },
  { id: "s-c5", name: "Cluster 5", order: 5, isVisibleOnChecklist: true },
  { id: "s-c6", name: "Cluster 6", order: 6, isVisibleOnChecklist: true },
  { id: "s-hidden", name: "Archived", order: 9, isVisibleOnChecklist: false },
];

const ref = (o: Partial<GeneralDataRefData> = {}): GeneralDataRefData => ({
  countries: COUNTRIES, countryIdsWithAreas: ["c-de"], projectStates: STATES,
  environmentName: "Dev", language: "en-US", ...o,
});

/** A form that passes every gate: Poland (no areas, no municipality list, key != 25). */
const form = (o: Partial<GeneralDataForm> = {}): GeneralDataForm => ({
  projectName: "Nordwind", shortName: "NDW", projectType: null,
  managerEntraRowId: "e-1", managerName: "Someone",
  deputyManagerEntraRowId: null, deputyManagerName: null,
  spvName: "", spvCompanyCode: "", spvLegalStructure: null,
  countryId: "c-pl", areaId: null, district: "", municipality: "Poznan",
  municipalityGermany: null, municipalityFrance: null,
  utilizationId: null, terrainSize: "", latitude: "51.284745", longitude: "13.712023",
  taxFactor: "", technology: "Wind",
  developmentType: CHOICE.developmentType.ownDevelopment,
  startCluster: null, acquisitionDate: null, acquisitionPrice: "",
  ...o,
});

const project = (o: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  id: "p-1", projectNumber: "PL-1021", internalProjectId: null, projectName: "Nordwind", originalProjectName: null,
  approvalState: null, statecode: 0, clusterStateId: "s-draft", clusterStateName: "Draft",
  clusterStateOrder: 0, countryId: "c-pl", countryName: "Poland", countryKey: "33",
  besitzerBusinessUnitId: "bu-pl", startCluster: 0, technology: 952850000, shareOfFarmdown: null,
  isStandardShareOfFarmdown: null, standardCostCreated: null,
  projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null,
  applicationSubmitted: null, legallyBindingPermits: null, fid: null,
  construction: null, cod: null,
  ...o,
});

const entity = (o: Partial<ShareholdingEntity> = {}): ShareholdingEntity => ({
  key: "e1", recordId: "sh-1", entityTypeValue: 952850000, customName: "", ownership: 1, ...o,
});

const ctx = (o: {
  f?: Partial<GeneralDataForm>; r?: Partial<GeneralDataRefData>; p?: ProjectSnapshot | null;
  entities?: ShareholdingEntity[];
} = {}) => ({
  form: form(o.f), ref: ref(o.r), project: o.p === undefined ? project() : o.p,
  entities: o.entities ?? [entity()], hasPersistedShareholders: true,
});

const allowAll = { canCreate: true, canEdit: true };
const latMsg = coordinateFormatMessage("lat", "en-US");

/* ═══════════════════════════════════════════════════════════ binding & defaults */

describe("UT-GDATA binding and defaults", () => {
  it("UT-GDATA-002 new project starts blank with Draft defaults", () => {
    expect(emptyGeneralDataForm.projectName).toBe("");
    expect(emptyGeneralDataForm.countryId).toBeNull();
    expect(emptyGeneralDataForm.developmentType).toBe(CHOICE.developmentType.ownDevelopment);
    const patch = buildProjectPatch(form(), ref(), null);
    expect(patch[PROJECT_COL.approvalState]).toBe(APPROVAL_STATE_DRAFT);
    expect(patch["vsb_ClusterState@odata.bind"]).toBe(`/${ES.projectStates}(s-draft)`);
    expect(patch[PROJECT_COL.shareOfFarmdown]).toBe(50);
    expect(patch[PROJECT_COL.isStandardShareOfFarmdown]).toBe(true);
    expect(patch[PROJECT_COL.standardCostCreated]).toBe(false);
  });

  it("UT-GDATA-060 column and navigation names are the verified logical names (D25)", () => {
    expect(PROJECT_COL.name).toBe("vsb_projectname");
    expect(PROJECT_COL.projectNumber).toBe("vsb_name");
    expect(PROJECT_COL.isProjectDevelopmentStd).toBe("vsb_feasibilitystudiesstandardassumption");
    const patch = buildProjectPatch(form({ areaId: "a-1", utilizationId: "u-1", deputyManagerEntraRowId: "e-2" }), ref(), project());
    expect(patch.vsb_projectname).toBe("Nordwind");
    expect(patch.vsb_name).toBeUndefined();
    expect(patch[`${PROJECT_LOOKUP.area}@odata.bind`]).toBe("/vsb_countryareas(a-1)");
    expect(patch["vsb_TerrainUtilizationLookUp@odata.bind"]).toBe("/vsb_customchoicevalues(u-1)");
    expect(patch["vsb_Projectmanager@odata.bind"]).toBe("/aadusers(e-1)");
    expect(patch["vsb_DeputyprojectmanagerEntra@odata.bind"]).toBe("/aadusers(e-2)");
  });

  it("UT-GDATA-061 choice columns are written as option values", () => {
    const patch = buildProjectPatch(form({ projectType: 952850001, technology: "PV" }), ref(), project());
    expect(patch[PROJECT_COL.projectType]).toBe(952850001);
    expect(patch[PROJECT_COL.technology]).toBe(952850001);
    const de = buildProjectPatch(form({ countryId: "c-de", spvLegalStructure: 952850000 }), ref(), project());
    expect(de[PROJECT_COL.spvLegalStructure]).toBe(952850000);
    const pl = buildProjectPatch(form({ spvLegalStructure: 952850000 }), ref(), project());
    expect(pl[PROJECT_COL.spvLegalStructure]).toBeNull();
  });

  it("UT-GDATA-062 Area: nothing picked keeps the existing value (Coalesce), never clears it", () => {
    const patch = buildProjectPatch(form({ areaId: null }), ref(), project());
    expect(`${PROJECT_LOOKUP.area}@odata.bind` in patch).toBe(false);
  });

  it("UT-GDATA-063 the form reads the record's defaults", () => {
    const row: ProjectRow = {
      id: "p-1", projectNumber: "PL-1021", internalProjectId: "INT-1", projectName: "Nordwind",
      originalProjectName: "Nordwind", shortName: "NDW", projectType: 952850000, spvName: "", spvCompanyCode: null,
      spvLegalStructure: null, countryId: "c-de", areaId: "a-1", district: "", municipality: "Dresden",
      utilizationId: null, terrainSize: 12.5, latitude: 51, longitude: 13.7120232, technology: 952850001,
      approvalState: null, statecode: 0, clusterStateId: "s-c2", clusterStateName: "Cluster 2", taxFactor: null,
      owningBusinessUnitId: "bu-de", shareOfFarmdown: null, isStandardShareOfFarmdown: null, standardCostCreated: null,
      developmentType: CHOICE.developmentType.acquiredProject, startCluster: 0, acquisitionDate: "2026-03-01T00:00:00Z",
      acquisitionPrice: 1234567, managerId: "e-1", managerName: "A", deputyManagerId: null, deputyManagerName: null,
      projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
      legallyBindingPermits: null, fid: null, construction: null, cod: null,
      createdByName: null, createdOn: null, modifiedByName: null, modifiedOn: null,
    };
    const f = toForm(row, { countries: COUNTRIES }, "de-DE", "400");
    expect(f.latitude).toBe("51,0");
    expect(f.longitude).toBe("13,712023");
    expect(f.terrainSize).toBe("12,5");
    expect(f.taxFactor).toBe("400");
    expect(f.municipalityGermany).toBe("Dresden");
    expect(f.technology).toBe("PV");
    // Greenfield start cluster shows blank (Y:2581-2596).
    expect(f.startCluster).toBeNull();
    expect(f.acquisitionDate).toBe("2026-03-01");
    expect(f.acquisitionPrice).toBe("1.234.567");
    const snap = toSnapshot(row, { countries: COUNTRIES, projectStates: STATES });
    expect(snap.clusterStateOrder).toBe(2);
    expect(snap.countryKey).toBe("25");
  });

  it("UT-GDATA-064 dirty is derived from the save-relevant fields", () => {
    const base = form();
    expect(isFormDirty(base, base)).toBe(false);
    expect(isFormDirty({ ...base, managerName: "Other" }, base)).toBe(false);
    expect(isFormDirty({ ...base, district: "X" }, base)).toBe(true);
  });

  it("UT-GDATA-065 coordinate text: at least one decimal, the player's separator", () => {
    expect(coordinateText(51, "en-US")).toBe("51.0");
    expect(coordinateText(51.12345678, "en-US")).toBe("51.123457");
    expect(coordinateText(null, "en-US")).toBe("");
  });
});

/* ═══════════════════════════════════════════════════════════════════ validation */

describe("UT-GDATA field validation", () => {
  it("UT-GDATA-003 project name under 3 chars blocks save", () => {
    const c = ctx({ f: { projectName: "ab" } });
    expect(validationMessages(c)).toContain(MSG.projectName);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-004 Budgeting rename must extend the original name", () => {
    const c = ctx({ f: { projectName: "Südwind" }, r: { environmentName: "Budgeting" }, p: project({ originalProjectName: "Nordwind" }) });
    expect(validationMessages(c)).toContain(budgetingRenameMessage("Nordwind"));
  });

  it("UT-GDATA-005 Budgeting rename by appending is accepted", () => {
    const c = ctx({ f: { projectName: "Nordwind II" }, r: { environmentName: "Budgeting" }, p: project({ originalProjectName: "Nordwind" }) });
    expect(validationMessages(c)).not.toContain(budgetingRenameMessage("Nordwind"));
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(true);
  });

  it("UT-GDATA-006 area required only when the country has areas", () => {
    expect(isAreaRequired("c-de", null, ["c-de"])).toBe(true);
    const c = ctx({ f: { countryId: "c-de", municipalityGermany: "Dresden", terrainSize: "12.5" },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }) });
    expect(validationMessages(c)).toContain(MSG.area);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-007 area not required for a country with no areas", () => {
    expect(isAreaRequired("c-pl", "c-pl", ["c-de"])).toBe(false);
    expect(validationMessages(ctx())).not.toContain(MSG.area);
  });

  it("UT-GDATA-008 terrain size required for country key 25", () => {
    expect(isTerrainSizeRequired("25", null)).toBe(true);
    expect(isTerrainSizeRequired("33", "33")).toBe(false);
    const c = ctx({ f: { countryId: "c-de", areaId: "a-1", municipalityGermany: "Dresden", terrainSize: "" },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }) });
    expect(validationMessages(c)).toContain(MSG.inputBlank);
    expect(requiredFieldsContent(c)).toContain(MSG.terrainRequiredFields);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-009 terrain size one-decimal and range enforced (key 25 only)", () => {
    const de = { countryId: "c-de", areaId: "a-1", municipalityGermany: "Dresden" };
    const p = project({ countryId: "c-de", countryName: "Germany", countryKey: "25" });
    expect(validationMessages(ctx({ f: { ...de, terrainSize: "12.34" }, p }))).toContain(MSG.numericOneDecimals);
    expect(validationMessages(ctx({ f: { ...de, terrainSize: "1200.0" }, p }))).toContain(terrainRangeMessage("en-US"));
    expect(terrainRangeMessage("de-DE")).toBe("Please select a value between 0 and 1.000");
    // CORRECTED (D25): outside key 25 the field is hidden and never checked.
    expect(validationMessages(ctx({ f: { terrainSize: "12.34" } }))).toEqual([]);
  });

  it("UT-GDATA-010 latitude accepts 6 decimals, rejects 7", () => {
    expect(isSixDecimal("51.284745", "en-US")).toBe(true);
    expect(isSixDecimal("51.2847451", "en-US")).toBe(false);
  });

  it("UT-GDATA-011 latitude out of range rejected", () => {
    expect(validationMessages(ctx({ f: { latitude: "95.0" } }))).toContain(MSG.latitudeRange);
  });

  it("UT-GDATA-012 longitude range ±180 enforced", () => {
    expect(validationMessages(ctx({ f: { longitude: "-181" } }))).toContain(MSG.longitudeRange);
  });

  it("UT-GDATA-013 decimal separator follows locale", () => {
    expect(isSixDecimal("51,284745", "de-DE")).toBe(true);
    expect(isSixDecimal("51.284745", "de-DE")).toBe(false);
    expect(fieldErrors(ctx({ f: { latitude: "51,284745", longitude: "13,712023" }, r: { language: "de-DE" } })).latitude).toBeUndefined();
  });

  it("UT-GDATA-013b coordinateMessage: canvas texts per axis and language (D25 correction)", () => {
    expect(coordinateMessage("26.919774", "lat")).toBeNull();
    expect(coordinateMessage("75.771319", "lng")).toBeNull();
    expect(coordinateMessage("", "lat")).toBe("Expected decimal degrees field format number ##.######");
    expect(coordinateMessage("", "lng")).toBe("Expected decimal degrees field format number ###.######.");
    expect(coordinateFormatMessage("lat", "de-DE")).toBe("Expected decimal degrees field format number ##,######");
    expect(coordinateMessage("26.9197741", "lat")).toBe(latMsg);
    expect(coordinateMessage("95.000000", "lat")).toBe(MSG.latitudeRange);
    expect(coordinateMessage("-200.000000", "lng")).toBe(MSG.longitudeRange);
  });

  it("UT-GDATA-014 SPV company code shape checked when a value is present", () => {
    expect(validationMessages(ctx({ f: { spvName: "Nordwind SPV", spvCompanyCode: "999" } }))).toContain(MSG.spvCodeShape);
    expect(validationMessages(ctx({ f: { spvName: "Nordwind SPV", spvCompanyCode: "1234" } }))).not.toContain(MSG.spvCodeShape);
  });

  it("UT-GDATA-015 SPV company code is required once SPV Name is set (canvas, D25 correction)", () => {
    const c = ctx({ f: { spvName: "Nordwind SPV", spvCompanyCode: "" } });
    expect(validationMessages(c)).toContain(MSG.spvCodeBlank);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-016 SPV legal structure required only for Germany", () => {
    const fr = ctx({ f: { countryId: "c-fr", municipalityFrance: "Beauce", spvName: "SPV", spvCompanyCode: "1234" },
      p: project({ countryId: "c-fr", countryName: "France", countryKey: "12" }) });
    expect(validationMessages(fr)).not.toContain(MSG.spvLegalStructure);
    expect(canSave({ ...fr, perms: allowAll, isDirty: true })).toBe(true);
    const de = ctx({ f: { countryId: "c-de", areaId: "a-1", terrainSize: "12.5", municipalityGermany: "Dresden", spvName: "SPV", spvCompanyCode: "1234" },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }) });
    expect(validationMessages(de)).toContain(MSG.spvLegalStructure);
  });

  it("UT-GDATA-017 tax factor rejects decimals and >1000", () => {
    expect(validationMessages(ctx({ f: { taxFactor: "12.5" } }))).toContain(MSG.taxFactorShape);
    expect(validationMessages(ctx({ f: { taxFactor: "1500" } }))).toContain(MSG.taxFactorRange);
  });

  it("UT-GDATA-018 municipality required for Germany and France", () => {
    expect(isMunicipalityRequired("Germany")).toBe("germany");
    expect(isMunicipalityRequired("France")).toBe("france");
    expect(isMunicipalityRequired("Poland")).toBeNull();
    expect(validationMessages(ctx({ f: { countryId: "c-de", areaId: "a-1", terrainSize: "12.5", municipalityGermany: null },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }) }))).toContain(MSG.municipalityGermany);
  });

  it("UT-GDATA-019 municipality search suppressed below 3 chars (Len, no trim)", () => {
    expect(municipalitySearchIsSuppressed("pa")).toBe(true);
    expect(municipalitySearchIsSuppressed("par")).toBe(false);
    expect(municipalitySearchIsSuppressed("  pa")).toBe(false);
    // Germany passes the trimmed text, so padding does not count.
    expect(municipalitySearchIsSuppressed("  pa".trim())).toBe(true);
  });

  it("UT-GDATA-020 German municipality sets tax factor; French clears it", () => {
    const patch = applyGermanMunicipality({ municipality: "Dresden", tradetaxrate: 400 });
    expect(patch.taxFactor).toBe("400");
    expect(patch.municipalityGermany).toBe("Dresden");
    expect(applyFrenchMunicipality("Paris")).toEqual({ municipalityFrance: "Paris", taxFactor: "" });
  });

  it("UT-GDATA-035 acquisition price must be a whole number ≤1e9, bound per language", () => {
    const acq = { developmentType: CHOICE.developmentType.acquiredProject, startCluster: 2, acquisitionDate: "2026-01-01" };
    expect(validationMessages(ctx({ f: { ...acq, acquisitionPrice: "1.234.567,89" } }))).toContain(acquisitionPriceShapeMessage("en-US"));
    expect(validationMessages(ctx({ f: { ...acq, acquisitionPrice: "1,234,567" } }))).toEqual([]);
    expect(validationMessages(ctx({ f: { ...acq, acquisitionPrice: "" } }))).toContain(MSG.acquisitionPriceBlank);
    expect(acquisitionPriceShapeMessage("de-DE")).toContain("0 to 1.000.000.000.");
  });

  it("UT-GDATA-066 the Required fields list follows the canvas ibtn order with the 100 % row", () => {
    const c = ctx({ f: { projectName: "", technology: null, latitude: "" }, entities: [entity({ ownership: 0.5 })] });
    expect(requiredFieldsContent(c)).toEqual([MSG.projectName, MSG.technology, latMsg, MSG.shareholdingSumRequired]);
    expect(requiredFieldsContent(ctx())).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════ shareholding entities */

describe("UT-GDATA shareholding entities", () => {
  it("UT-GDATA-021 ownership must total exactly 100 % to save (canvas, D25 correction)", () => {
    const entities = [entity({ key: "a", ownership: 0.5 })];
    const c = ctx({ entities });
    expect(isShareholdingComplete(entities)).toBe(false);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
    expect(canSave({ ...ctx(), perms: allowAll, isDirty: true })).toBe(true);
  });

  it("UT-GDATA-021b Add is disabled once the sum reaches 100 %", () => {
    expect(canAddShareholder([entity({ ownership: 1 })])).toBe(false);
    expect(canAddShareholder([entity({ ownership: 0.4 })])).toBe(true);
  });

  it("UT-GDATA-022 ownership stored as a rounded fraction", () => {
    expect(ownershipFraction(33.33)).toBe(0.3333);
    expect(ownershipFraction("33.33")).toBe(0.3333);
  });

  it("UT-GDATA-023 remaining percentage caps a new entity (canvas range text)", () => {
    const entities = [entity({ key: "a", ownership: 0.7 })];
    expect(remainingPct(entities)).toBe(30);
    const errors = shareholderPanelErrors({ key: "new-1", entityTypeValue: 952850001, customName: "", percent: "40" }, entities);
    expect(errors.percent).toBe("The number 40 must be between 0 and 30.0.");
    expect(remainingPct(entities, "a")).toBe(100);
  });

  it("UT-GDATA-023b SOURCE DEFECT: an out-of-range decimal shows the range, not the shape text", () => {
    const errors = shareholderPanelErrors({ key: "n", entityTypeValue: 952850001, customName: "", percent: "40.5" }, [entity({ ownership: 0.7 })]);
    expect(errors.percent).toBe("The number 40.5 must be between 0 and 30.0.");
    expect(shareholderPanelErrors({ key: "n", entityTypeValue: 1, customName: "", percent: "4.555" }, []).percent).toBe(MSG.shareholdingPercentShape);
    expect(shareholderPanelErrors({ key: "n", entityTypeValue: 1, customName: "", percent: "" }, []).percent).toBe(MSG.inputBlank);
  });

  it("UT-GDATA-024 Custom Name required and stored only for Third Party", () => {
    expect(isThirdParty(CHOICE.shareholderEntityType.thirdParty)).toBe(true);
    const blocked = shareholderPanelErrors({ key: "n", entityTypeValue: CHOICE.shareholderEntityType.thirdParty, customName: " ", percent: "50" }, []);
    expect(blocked.customName).toBe(MSG.inputBlank);
    expect(applyShareholderDraft([], { key: "n", entityTypeValue: 952850000, customName: "ignored", percent: "50" })[0]!.customName).toBe("");
    expect(applyShareholderDraft([], { key: "n2", entityTypeValue: CHOICE.shareholderEntityType.thirdParty, customName: "Stadtwerke", percent: "50" })[0]!.customName).toBe("Stadtwerke");
  });

  it("UT-GDATA-025 at least one shareholding entity required", () => {
    const c = { ...ctx({ entities: [] }), hasPersistedShareholders: false };
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-019b deleting an entity only issues a Dataverse delete when it exists", () => {
    expect(planShareholderDelete(entity({ recordId: "sh-1" })).writes).toEqual([
      { op: "delete", entitySet: ES.shareholderEntityInProjects, id: "sh-1", reason: "delete the shareholding entity" },
    ]);
    expect(planShareholderDelete(entity({ recordId: null })).writes).toHaveLength(0);
    expect(ES.shareholderEntityInProjects).toBe("vsb_shareholderentitiies");
  });

  it("UT-GDATA-067 SOURCE DEFECT: a duplicate entity blocks the panel save (parity twin allows it)", () => {
    const entities = [entity({ key: "a", entityTypeValue: 952850000, ownership: 0.5 })];
    const draft = { key: "n", entityTypeValue: 952850000, customName: "", percent: "50", originalTypeValue: null, dirty: true };
    expect(shareholderPanelErrors(draft, entities).duplicate).toBe(MSG.shareholderAlreadyAdded);
    expect(canSaveShareholderPanel(draft, entities)).toBe(false);
    expect(canSaveShareholderPanelCanvasParity(draft, entities)).toBe(true);
    // Editing the row with its own type is not a duplicate.
    expect(shareholderPanelErrors({ ...draft, key: "a", originalTypeValue: 952850000 }, entities).duplicate).toBeUndefined();
    // Not dirty → disabled.
    expect(canSaveShareholderPanel({ ...draft, entityTypeValue: 952850001, dirty: false }, entities)).toBe(false);
  });

  it("UT-GDATA-068 the panel is 'full' when the sum is 100 % and a new row is added", () => {
    const full = [entity({ ownership: 1 })];
    expect(shareholderPanelFull(full, { key: "n", entityTypeValue: null, customName: "", percent: "" })).toBe(true);
    expect(shareholderPanelFull(full, { key: "e1", entityTypeValue: 952850000, customName: "", percent: "100", originalTypeValue: 952850000 })).toBe(false);
    expect(shareholdingFullMessage(1)).toBe("You have achieved 100%. Please correct your input!.");
  });

  it("UT-GDATA-056 the Description cell and the Ownership format (#0.0# %)", () => {
    expect(shareholdingDescription(entity({ entityTypeValue: CHOICE.shareholderEntityType.thirdParty, customName: "Green Yield One (IPP2)" }))).toBe("Green Yield One (IPP2)");
    expect(shareholdingDescription(entity({ entityTypeValue: 952850018, customName: "" }))).toBe("VSB Holding GmbH");
    expect(formatOwnership(0.5, "en-US")).toBe("50.0 %");
    expect(formatOwnership(0.3333, "de-DE")).toBe("33,33 %");
  });

  it("UT-GDATA-069 SOURCE DEFECT: the delete dialog names the row as the gallery does", () => {
    const thirdParty = entity({ recordId: "sh-1", entityTypeValue: CHOICE.shareholderEntityType.thirdParty, customName: "Stadtwerke" });
    expect(deleteShareholderName(thirdParty)).toBe("Stadtwerke");
    expect(deleteShareholderNameCanvasParity(thirdParty)).toBe("Third Party");
    const unsaved = entity({ recordId: null, entityTypeValue: 952850018, customName: "" });
    expect(deleteShareholderName(unsaved)).toBe("VSB Holding GmbH");
    expect(deleteShareholderNameCanvasParity(unsaved)).toBe("");
  });
});

/* ═══════════════════════════════════════════════════════════════════ permission */

describe("UT-GDATA permissions, display modes and side effects", () => {
  it("UT-GDATA-026 save blocked without edit permission", () => {
    expect(canSave({ ...ctx(), perms: { canCreate: true, canEdit: false }, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-027 new project uses create permission and is not refused (PO 20 Oct, D25)", () => {
    const c = ctx({ p: null });
    expect(canSave({ ...c, perms: { canCreate: true, canEdit: false }, isDirty: true })).toBe(true);
    expect(canSave({ ...c, perms: { canCreate: false, canEdit: true }, isDirty: true })).toBe(false);
    expect(saveBlockReason({ project: null, form: form(), trackings: [], projectStates: STATES })).toBeNull();
    expect(saveBlockReason({ project: project(), form: form(), trackings: [], projectStates: STATES })).toBeNull();
  });

  it("UT-GDATA-027b save blocked when nothing is dirty", () => {
    expect(canSave({ ...ctx(), perms: allowAll, isDirty: false })).toBe(false);
  });

  it("UT-GDATA-028 country list restricted to editable countries", () => {
    expect(countryOptions(COUNTRIES, [{ id: "c-de", name: "Germany" }, { id: "c-fr", name: "France" }], "Germany").map((c) => c.id)).toEqual(["c-de", "c-fr"]);
  });

  it("UT-GDATA-029 country list unrestricted when scope empty", () => {
    expect(countryOptions(COUNTRIES, [], "Germany")).toHaveLength(3);
  });

  it("UT-GDATA-030 country list unrestricted when the project country is out of scope", () => {
    expect(countryOptions(COUNTRIES, [{ id: "c-de", name: "Germany" }], "Poland")).toHaveLength(3);
  });

  it("UT-GDATA-031 country read-only when project Approved", () => {
    expect(countryDisplayMode({ approvalState: CHOICE.approvalState.approved, canCreate: true, countryInScope: true })).toBe("view");
    expect(countryDisplayMode({ approvalState: null, canCreate: true, countryInScope: true })).toBe("edit");
    expect(countryDisplayMode({ approvalState: null, canCreate: true, countryInScope: false })).toBe("view");
  });

  it("UT-GDATA-032 only the area is read-only past Draft (canvas 1.21.753)", () => {
    expect(fieldModes({ clusterStateOrder: 2, environmentName: "Dev" })).toEqual({ projectName: "edit", shortName: "edit", area: "view" });
    expect(fieldModes({ clusterStateOrder: 0, environmentName: "Dev" })).toEqual({ projectName: "edit", shortName: "edit", area: "edit" });
  });

  it("UT-GDATA-058 the 1.21.709 name/short-name lock stays reachable as fieldModesCanvas709", () => {
    expect(fieldModesCanvas709({ clusterStateOrder: 2, environmentName: "Dev" })).toEqual({ projectName: "view", shortName: "view", area: "view" });
    expect(fieldModesCanvas709({ clusterStateOrder: 2, environmentName: "Budgeting" })).toEqual({ projectName: "edit", shortName: "view", area: "view" });
  });

  it("UT-GDATA-070 technology, development type, start cluster and acquisition date locks", () => {
    const acq = form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster: 3 });
    expect(formLocks(acq, project({ clusterStateOrder: 0 }))).toMatchObject({ technology: false, developmentType: false, startCluster: false, acquisitionDate: false });
    expect(formLocks(acq, project({ clusterStateOrder: 1 }))).toMatchObject({ technology: true, developmentType: true, startCluster: true, acquisitionDate: false });
    expect(formLocks(acq, project({ clusterStateOrder: 3 })).acquisitionDate).toBe(true);
    expect(formLocks(form(), project()).startCluster).toBe(true);
    expect(formLocks(form(), project({ approvalState: CHOICE.approvalState.approved })).hideNameAsterisks).toBe(true);
  });

  it("UT-GDATA-071 Country change resets to the record's defaults, tax blank (D25 correction)", () => {
    const base = form({ countryId: "c-de", areaId: "a-1", terrainSize: "10", municipalityGermany: "Dresden", spvLegalStructure: 952850000, taxFactor: "400" });
    const next = onCountryChange({ ...base, terrainSize: "99", spvLegalStructure: null }, base, "c-fr");
    expect(next).toMatchObject({ countryId: "c-fr", terrainSize: "10", spvLegalStructure: 952850000, taxFactor: "", areaId: null, municipalityGermany: null });
    expect(onCountryChange(base, base, "c-de")).toMatchObject({ areaId: "a-1", municipalityGermany: "Dresden" });
    expect(onAreaChange(base, base, "a-2")).toMatchObject({ areaId: "a-2", taxFactor: "", municipalityGermany: null });
  });

  it("UT-GDATA-072 emptying SPV Name resets code and legal structure; Development Type resets acquisition", () => {
    const base = form({ spvName: "S", spvCompanyCode: "1234", spvLegalStructure: 952850001, acquisitionPrice: "5", acquisitionDate: "2026-01-01" });
    expect(onSpvNameChange({ ...base, spvCompanyCode: "9" }, base, "")).toMatchObject({ spvName: "", spvCompanyCode: "1234", spvLegalStructure: 952850001 });
    const dev = onDevelopmentTypeChange({ ...base, acquisitionPrice: "7" }, base, { startCluster: 3 }, CHOICE.developmentType.acquiredProject);
    expect(dev).toMatchObject({ startCluster: 3, acquisitionPrice: "5", acquisitionDate: "2026-01-01" });
    expect(onDevelopmentTypeChange(base, base, { startCluster: 3 }, CHOICE.developmentType.ownDevelopment).startCluster).toBeNull();
  });
});

/* ══════════════════════════════════════════════════ start-cluster classification */

describe("UT-GDATA start-cluster classification and the cluster panel", () => {
  const withDates = (o: Partial<ProjectSnapshot>) => project({
    projectStartDate: "2026-01-01", feasibilityStudies: "2026-06-01",
    projectDevelopmentStarted: "2026-12-01", applicationSubmitted: "2027-06-01",
    legallyBindingPermits: "2028-01-01", fid: "2028-06-01", ...o,
  });
  const acquired = (startCluster: number) => form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster });

  it("UT-GDATA-033 start cluster ignored for Own Development", () => {
    const patch = buildProjectPatch(form({ startCluster: 3 }), ref(), project());
    expect(patch[PROJECT_COL.startCluster]).toBe(CHOICE.clusterState.greenfield);
  });

  it("UT-GDATA-034 acquisition date/price cleared for Own Development", () => {
    const patch = buildProjectPatch(form({ acquisitionDate: "2026-01-01", acquisitionPrice: "1000000" }), ref(), project());
    expect(patch[PROJECT_COL.acquisitionDate]).toBeNull();
    expect(patch[PROJECT_COL.acquisitionPrice]).toBeNull();
  });

  it("UT-GDATA-033b the option-set value IS the cluster number", () => {
    expect(startClusterNo(0)).toBe(0);
    expect(startClusterNo(6)).toBe(6);
    expect(startClusterNo(null)).toBe(0);
    expect(startClusterNo(99)).toBe(0);
    expect(milestoneImpactNo(6)).toBe(5);
    expect(milestoneImpactNo(3)).toBe(3);
  });

  it("UT-GDATA-036 Cluster 5 → Cluster 6 saves directly", () => {
    expect(classifyStartClusterChange({ developmentType: CHOICE.developmentType.acquiredProject, previousCluster: 5, selectedCluster: 6, project: withDates({ startCluster: 5 }) })).toBe("direct-save");
  });

  it("UT-GDATA-037 downward change opens the milestone panel", () => {
    expect(classifyStartClusterChange({ developmentType: CHOICE.developmentType.acquiredProject, previousCluster: 4, selectedCluster: 2, project: withDates({ startCluster: 4 }) })).toBe("panel-downward");
  });

  it("UT-GDATA-038 upward change with nothing to delete saves directly", () => {
    const blank = project({ startCluster: 2, fid: "2028-06-01" });
    expect(classifyStartClusterChange({ developmentType: CHOICE.developmentType.acquiredProject, previousCluster: 2, selectedCluster: 3, project: blank })).toBe("direct-save");
  });

  it("UT-GDATA-038b upward change with something to delete opens the panel", () => {
    expect(classifyStartClusterChange({ developmentType: CHOICE.developmentType.acquiredProject, previousCluster: 2, selectedCluster: 4, project: withDates({ startCluster: 2 }) })).toBe("panel-upward");
  });

  it("UT-GDATA-038c Own Development, Greenfield, equal clusters and no data all save directly", () => {
    const base = { developmentType: CHOICE.developmentType.acquiredProject, previousCluster: 2, selectedCluster: 4, project: withDates({ startCluster: 2 }) };
    expect(classifyStartClusterChange({ ...base, developmentType: CHOICE.developmentType.ownDevelopment })).toBe("direct-save");
    expect(classifyStartClusterChange({ ...base, selectedCluster: 0 })).toBe("direct-save");
    expect(classifyStartClusterChange({ ...base, selectedCluster: 2 })).toBe("direct-save");
    expect(classifyStartClusterChange({ ...base, project: project({ startCluster: 2 }) })).toBe("direct-save");
  });

  it("UT-GDATA-073 'changed' is old <> new by number, not the classifier's answer", () => {
    expect(startClusterChanged(project({ startCluster: 0 }), acquired(3))).toBe(true);
    expect(startClusterChanged(project({ startCluster: 5 }), acquired(6))).toBe(true);
    expect(startClusterChanged(project({ startCluster: 0 }), form())).toBe(false);
    expect(startClusterChanged(project({ startCluster: null }), form())).toBe(false);
  });

  it("UT-GDATA-039 downward panel: rows, editability and ordering errors", () => {
    const panel = openClusterPanel(withDates({ startCluster: 4 }), acquired(2));
    expect(panel.direction).toBe("downward");
    expect(clusterPanelVisible("cluster1", panel)).toBe(false);
    expect(clusterPanelVisible("cluster2", panel)).toBe(true);
    expect(clusterPanelVisible("cluster6", panel)).toBe(true);
    expect(clusterPanelEditable("cluster2", panel)).toBe(true);
    expect(clusterPanelEditable("cluster4", panel)).toBe(false);
    expect(clusterPanelEditable("fid", panel)).toBe(false);
    const bad = { ...panel, dates: { ...panel.dates, cluster3: "2026-11-01" } };
    expect(milestoneChainErrors(bad).cluster3).toBe("Cluster 3 must be later than Cluster 2.");
    expect(canSaveClusterPanel(bad)).toBe(false);
    expect(canSaveClusterPanel(panel)).toBe(true);
    expect(clusterPanelInfo(panel)).toBe("The Start Cluster has been updated from Cluster 4 to Cluster 2. In order to continue with the saving process, the following Milestones must be completed:");
  });

  it("UT-GDATA-039b blank errors only for an editable picker; FID / 5 / 6 never 'blank' (D25 correction)", () => {
    const panel = openClusterPanel(project({ startCluster: 4 }), acquired(2));
    const errors = milestoneChainErrors(panel);
    expect(errors.cluster2).toBe("Cluster 2 date cannot be blank.");
    expect(errors.cluster3).toBe("Cluster 3 date cannot be blank.");
    expect(errors.cluster4).toBeUndefined();
    expect(errors.fid).toBeUndefined();
    expect(errors.cluster5).toBeUndefined();
  });

  it("UT-GDATA-039c the Start text is the canvas one", () => {
    const panel = { ...openClusterPanel(project({ startCluster: 3 }), acquired(3)), newNo: 0 };
    expect(milestoneChainErrors(panel).startDate).toBe("The Project Start Date cannot be empty.");
  });

  it("UT-GDATA-074 upward panel lists only what will be deleted, read-only, Save enabled", () => {
    const panel = openClusterPanel(withDates({ startCluster: 2 }), acquired(4));
    expect(panel.direction).toBe("upward");
    expect(["startDate", "cluster1", "cluster2", "cluster3", "cluster4", "fid"].filter((f) => clusterPanelVisible(f as never, panel)))
      .toEqual(["startDate", "cluster1", "cluster2", "cluster3"]);
    expect(clusterPanelEditable("cluster2", panel)).toBe(false);
    expect(canSaveClusterPanel(panel)).toBe(true);
  });

  it("UT-GDATA-040 the panel patch: skipped dates blank, flags false above / null below the threshold", () => {
    const panel = openClusterPanel(withDates({ startCluster: 2 }), acquired(3));
    const patch = clusterPanelPatch(panel);
    expect(patch[PROJECT_COL.projectStartDate]).toBeNull();
    expect(patch[PROJECT_COL.feasibilityStudies]).toBeNull();
    expect(patch[PROJECT_COL.projectDevelopmentStarted]).toBeNull();
    expect(patch[PROJECT_COL.isProjectDevelopmentStd]).toBe(false);
    expect(patch[PROJECT_COL.applicationSubmitted]).toBe("2027-06-01");
    expect(patch[PROJECT_COL.isApplicationSubmittedStd]).toBeNull();
    // The Milestones screen's variant leaves the flag untouched below the threshold.
    expect(clearSkippedMilestones(panel.dates, 3)[PROJECT_COL.isApplicationSubmittedStd]).toBeUndefined();
  });

  it("UT-GDATA-075 CalendarAdd: Wind/PV only, previous date + average duration, marked standard", () => {
    const panel = { ...openClusterPanel(project({ startCluster: 4, feasibilityStudies: "2026-01-31" }), acquired(1)) };
    expect(calendarAddVisible("cluster2", panel, 952850000)).toBe(true);
    expect(calendarAddVisible("cluster2", panel, 952850003)).toBe(false);
    expect(calendarAddVisible("fid", panel, 952850000)).toBe(false);
    const next = applyCalendarAdd(panel, "cluster2", { cluster1: 1 });
    expect(next.dates.cluster2).toBe("2026-02-28");
    expect(next.standardAssumption.cluster2).toBe(true);
    expect(applyCalendarAdd(panel, "cluster3", { cluster2: 5 })).toBe(panel);
  });

  it("UT-GDATA-908 rule 20: a CalendarAdd date renders as a standard value until the user types one", () => {
    const panel = openClusterPanel(project({ startCluster: 4, feasibilityStudies: "2026-01-31" }), acquired(1));
    expect(clusterPanelDateIsStandard("cluster2", panel)).toBe(false);
    const added = applyCalendarAdd(panel, "cluster2", { cluster1: 1 });
    expect(clusterPanelDateIsStandard("cluster2", added)).toBe(true);
    expect(clusterPanelDateIsStandard("cluster3", added)).toBe(false);
    expect(clusterPanelDateIsStandard("cluster2", { standardAssumption: { ...added.standardAssumption, cluster2: false } })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════ the save orchestration */

describe("UT-GDATA the save plan", () => {
  const plan = (o: Partial<Parameters<typeof planGeneralDataSave>[0]> = {}) => planGeneralDataSave({
    project: project(), form: form(), ref: ref(), trackings: [{ id: "t-draft", clusterStateId: "s-draft", approvalClusterState: 952850001, flowRunId: null }],
    shareholdersDirty: false, entities: [], ...o,
  });

  it("UT-GDATA-041 Patch #1 then Patch #2; Internal Project ID back-filled only when blank", () => {
    const p = plan();
    expect(p.writes.map((w) => w.reason)).toEqual(["save the project data", "set the internal project id and the owning business unit"]);
    expect(p.writes[1]!.data![PROJECT_COL.internalProjectId]).toBe("PL-1021");
    expect(plan({ project: project({ internalProjectId: "LEGACY-7" }) }).writes[1]!.data![PROJECT_COL.internalProjectId]).toBe("LEGACY-7");
  });

  it("UT-GDATA-041b Patch #1 uses Countries.'Besitzer', Patch #2 Countries.'Business Unit'", () => {
    const p = plan({ form: form({ countryId: "c-de" }) });
    expect(p.writes[0]!.data!["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    expect(p.writes[1]!.data!["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de2)");
    expect(owningBusinessUnits(form({ countryId: null }), ref(), project())).toEqual({ patch1: "bu-pl", patch2: "bu-pl" });
  });

  it("UT-GDATA-042 Draft tracking row created when absent", () => {
    const p = plan({ trackings: [] });
    const last = p.writes.at(-1)!;
    expect(last.op).toBe("create");
    expect(last.entitySet).toBe(ES.projectStateTrackings);
    expect(last.data!.vsb_approvalclusterstate).toBe(CHOICE.approvalClusterState.inProgress);
    expect(last.data!["vsb_Project@odata.bind"]).toBe("/vsb_projects(p-1)");
    expect(p.log).toEqual([MSG.stepProjectSaved]);
  });

  it("UT-GDATA-043 existing Draft tracking row not overwritten", () => {
    expect(plan().writes.some((w) => w.entitySet === ES.projectStateTrackings)).toBe(false);
  });

  it("UT-GDATA-044 tracking rebuild marks skipped clusters Completed", () => {
    const rows = plannedTrackingRows(STATES, 3, []);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ clusterStateName: "Draft", approvalClusterState: CHOICE.approvalClusterState.inProgress, comment: null });
    expect(rows[1]).toMatchObject({ clusterStateName: "Cluster 1", approvalClusterState: CHOICE.approvalClusterState.completed, comment: AUTO_SKIPPED_COMMENT });
    expect(rows[2]!.approvalClusterState).toBe(CHOICE.approvalClusterState.completed);
    for (const r of rows.slice(3)) expect(r.approvalClusterState).toBe(CHOICE.approvalClusterState.notStarted);
    expect(rows.some((r) => r.clusterStateName === "Archived")).toBe(false);
  });

  it("UT-GDATA-044b a start-cluster change forces Draft, then rebuilds every tracking in order", () => {
    const p = plan({ form: form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster: 3, acquisitionDate: "2026-01-01", acquisitionPrice: "1" }) });
    expect(p.writes[2]!.data!["vsb_ClusterState@odata.bind"]).toBe(`/${ES.projectStates}(s-draft)`);
    const tracking = p.writes.filter((w) => w.entitySet === ES.projectStateTrackings);
    expect(tracking.filter((w) => w.op === "update")).toHaveLength(1);
    expect(tracking.filter((w) => w.op === "create")).toHaveLength(6);
    expect(tracking[0]!.data).toMatchObject({ vsb_flowrunid: null, vsb_flowapprovalid: null, vsb_clusterstepstate: null, vsb_approvalduedate: null });
    expect(p.log).toEqual([MSG.stepProjectSaved, MSG.stepTrackingRefreshed]);
  });

  it("UT-GDATA-045 a running Draft approval refuses the start-cluster change (no flow call, D25)", () => {
    const trackings: TrackingRow[] = [{ id: "t-draft", clusterStateId: "s-draft", approvalClusterState: CHOICE.approvalClusterState.inProgress, flowRunId: "run-1" }];
    expect(shouldCancelGateApproval(trackings[0])).toBe(true);
    const f = form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster: 3 });
    expect(startClusterChangeBlocked({ project: project(), form: f, trackings, projectStates: STATES })).toBe(true);
    expect(saveBlockReason({ project: project(), form: f, trackings, projectStates: STATES })).toBe(MSG.approvalInProgress);
    expect(plan({ form: f, trackings }).refusedReason).toBe(MSG.approvalInProgress);
    // Without a start-cluster change the same tracking does not block.
    expect(startClusterChangeBlocked({ project: project(), form: form(), trackings, projectStates: STATES })).toBe(false);
  });

  it("UT-GDATA-046 no running approval: the change saves and rebuilds", () => {
    const noRun: TrackingRow[] = [{ id: "t-draft", clusterStateId: "s-draft", approvalClusterState: CHOICE.approvalClusterState.inProgress, flowRunId: null }];
    expect(shouldCancelGateApproval(noRun[0])).toBe(false);
    expect(shouldCancelGateApproval({ ...noRun[0]!, flowRunId: "r", approvalClusterState: CHOICE.approvalClusterState.completed })).toBe(false);
    expect(shouldCancelGateApproval(null)).toBe(false);
  });

  it("UT-GDATA-047 SOURCE DEFECT: an empty project-manager picker refuses the plan", () => {
    expect(plan({ form: form({ managerEntraRowId: null }) }).refusedReason).toBe(MSG.manager);
  });

  it("UT-GDATA-048 shareholders written one per row, after the project, with the owner", () => {
    const entities = [entity({ key: "a", recordId: "sh-a", ownership: 0.4 }), entity({ key: "b", recordId: null, ownership: 0.6 })];
    const p = plan({ shareholdersDirty: true, entities });
    const sh = p.writes.filter((w) => w.entitySet === ES.shareholderEntityInProjects);
    expect(sh.map((w) => w.op)).toEqual(["update", "create"]);
    expect(sh[1]!.data).toMatchObject({ vsb_ownership: 0.6, "vsb_Project@odata.bind": "/vsb_projects(p-1)", "owningbusinessunit@odata.bind": "/businessunits(bu-pl2)" });
    expect(p.log).toContain(MSG.stepShareholdersSaved);
    expect(plan({ entities }).writes.some((w) => w.entitySet === ES.shareholderEntityInProjects)).toBe(false);
  });

  it("UT-GDATA-051 the success text is the canvas Concat", () => {
    expect(stepLogText([MSG.stepProjectSaved, MSG.stepShareholdersSaved])).toBe(
      "Project data was saved/updated successfully. \nProject Shareholder Entitiy was saved/updated successfully. \n",
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════ misc */

describe("UT-GDATA map, navigation and footer", () => {
  it("UT-GDATA-052 leaving with unsaved changes prompts", () => {
    expect(shouldConfirmLeave(true)).toBe(true);
    expect(shouldConfirmLeave(false)).toBe(false);
  });

  it("UT-GDATA-053 map falls back to default coordinates", () => {
    expect(mapMarker({ latitude: "", longitude: "" }, null)).toEqual({ lat: MAP_DEFAULT.lat, lng: MAP_DEFAULT.lng });
    expect(mapMarker({ latitude: "", longitude: "" }, { lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(mapMarker({ latitude: "51.284745", longitude: "13.712023" }, { lat: 1, lng: 2 })).toEqual({ lat: 51.284745, lng: 13.712023 });
  });

  it("UT-GDATA-053b a pin only for a valid coordinate pair", () => {
    expect(isCoordinateValid("", "lat")).toBe(false);
    expect(isCoordinateValid("not-a-number", "lat")).toBe(false);
    expect(isCoordinateValid("26.919774", "lat")).toBe(true);
    expect(isCoordinateValid("999.000000", "lat")).toBe(false);
  });

  it("UT-GDATA-054 SPV Legal Structure is visible for any Germany project", () => {
    expect(isSpvLegalStructureVisible("Germany")).toBe(true);
    expect(isSpvLegalStructureVisible("Poland")).toBe(false);
  });

  it("UT-GDATA-055 the record status label", () => {
    expect(recordStatusLabel(0)).toBe("Active");
    expect(recordStatusLabel(1)).toBe("Inactive");
  });

  it("UT-GDATA-057 the footer audit stamp, three spaces on General Data", () => {
    expect(formatAuditStamp("Shakti Singh Rajput", "2026-09-03T10:49:00Z", "   ")).toMatch(/^Shakti Singh Rajput {3}\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    expect(formatAuditStamp("Shakti Singh Rajput", "2026-09-03T10:49:00Z")).toMatch(/^Shakti Singh Rajput {2}\d/);
    expect(formatAuditStamp(null, null)).toBeNull();
  });

  it("UT-GDATA-083 the footer stamp split into name and date columns joins back to the stamp", () => {
    const parts = auditStampParts("Shakti Singh Rajput", "2026-09-03T10:49:00Z")!;
    expect(parts.name).toBe("Shakti Singh Rajput");
    expect(parts.when).toMatch(/^ {3}\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    expect(parts.name + parts.when).toBe(formatAuditStamp("Shakti Singh Rajput", "2026-09-03T10:49:00Z", "   "));
    expect(auditStampParts(null, null)).toBeNull();
  });
});

/* ═══════════════════════════════════════════ option sets pinned to the schema (D25) */

const keysOf = (o: object): number[] => Object.keys(o).map(Number).sort((a, b) => a - b);

describe("UT-GDATA choice values are the generated Dataverse schema", () => {
  it("UT-GDATA-076 Project Type, SPV Legal Structure, Development Type, Start Cluster, Technology", () => {
    expect(keysOf(PROJECT_TYPE_LABEL)).toEqual(keysOf(Vsb_projectsvsb_projecttype));
    expect(keysOf(SPV_LEGAL_STRUCTURE_LABEL)).toEqual(keysOf(Vsb_projectsvsb_spvlegalstructure));
    expect(keysOf(DEVELOPMENT_TYPE_LABEL)).toEqual(keysOf(Vsb_projectsvsb_developmenttype));
    expect(keysOf(CLUSTER_STATE_LABEL)).toEqual(keysOf(Vsb_projectsvsb_startcluster));
    expect(START_CLUSTER_OPTIONS.every((v) => v in Vsb_projectsvsb_startcluster)).toBe(true);
    expect(keysOf(TECHNOLOGY_LABEL)).toEqual(keysOf(Vsb_projectsvsb_technology));
  });

  it("UT-GDATA-077 Shareholder Entity Types", () => {
    expect(SHAREHOLDER_ENTITY_TYPE_LABEL.map(([v]) => v).sort((a, b) => a - b))
      .toEqual(keysOf(Vsb_shareholderentitiiesvsb_shareholderentitiytype));
    expect(CHOICE.shareholderEntityType.thirdParty in Vsb_shareholderentitiiesvsb_shareholderentitiytype).toBe(true);
  });

  it("UT-GDATA-078 the approval values the save writes exist in the schema", () => {
    expect(APPROVAL_STATE_DRAFT in Vsb_projectsvsb_approvalstates).toBe(true);
    expect(CHOICE.approvalState.approved in Vsb_projectsvsb_approvalstates).toBe(true);
    for (const v of Object.values(CHOICE.approvalClusterState)) {
      expect(v in Vsb_projectstatetrackingsvsb_approvalclusterstate).toBe(true);
    }
  });
});

describe("UT-GDATA tax-factor fallback (D25)", () => {
  const rowOf = (countryId: string) => ({ taxFactor: null, municipality: "Dresden", countryId });

  it("UT-GDATA-079 SOURCE DEFECT: the German trade-tax fallback applies to German projects only", () => {
    expect(taxFactorFallbackMunicipality(rowOf("c-de"), COUNTRIES)).toBe("Dresden");
    expect(taxFactorFallbackMunicipality(rowOf("c-fr"), COUNTRIES)).toBeNull();
    expect(taxFactorFallbackMunicipality(rowOf("c-pl"), COUNTRIES)).toBeNull();
    expect(taxFactorFallbackMunicipality({ ...rowOf("c-de"), taxFactor: 380 }, COUNTRIES)).toBeNull();
    // The canvas looked the German table up for any country.
    expect(taxFactorFallbackMunicipalityCanvasParity(rowOf("c-pl"))).toBe("Dresden");
  });
});

describe("UT-GDATA creating a project (PO 20 Oct 2026, D25)", () => {
  it("UT-GDATA-080 Patch #1 creates the row with the canvas create defaults and no null binds", () => {
    const p = planProjectCreate(form({ countryId: "c-de", areaId: "a-1" }), ref());
    expect(p.refusedReason).toBeUndefined();
    expect(p.writes).toHaveLength(1);
    const w = p.writes[0]!;
    expect(w).toMatchObject({ op: "create", entitySet: ES.projects });
    expect(w.id).toBeUndefined();
    expect(w.data).toMatchObject({
      [PROJECT_COL.approvalState]: APPROVAL_STATE_DRAFT, [PROJECT_COL.shareOfFarmdown]: 50,
      [PROJECT_COL.isStandardShareOfFarmdown]: true, [PROJECT_COL.standardCostCreated]: false,
      [PROJECT_COL.startCluster]: CHOICE.clusterState.greenfield,
      "vsb_ClusterState@odata.bind": "/vsb_projectstates(s-draft)",
      "vsb_CountryArea@odata.bind": "/vsb_countryareas(a-1)",
      "owningbusinessunit@odata.bind": "/businessunits(bu-de)",
    });
    expect(Object.entries(w.data!).filter(([k, v]) => k.endsWith("@odata.bind") && v === null)).toEqual([]);
    expect(p.log).toEqual([MSG.stepProjectSaved]);
    expect(planProjectCreate(form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster: 3 }), ref())
      .writes[0]!.data![PROJECT_COL.startCluster]).toBe(3);
    expect(planProjectCreate(form({ managerEntraRowId: null }), ref()).refusedReason).toBe(MSG.manager);
  });

  it("UT-GDATA-081 the follow-ups on the re-read row: Patch #2 from 'Project ID', shareholders, Draft tracking", () => {
    const reRead = createdProjectSnapshot(project({ id: "p-new", projectNumber: "PL-2001", internalProjectId: null, besitzerBusinessUnitId: "bu-pl", startCluster: 0 }));
    const entities = [entity({ key: "n1", recordId: null, ownership: 1 })];
    const p = planSaveFollowUps({ project: reRead, form: form(), ref: ref(), trackings: [], shareholdersDirty: true, entities });
    expect(p.writes.map((w) => [w.op, w.entitySet])).toEqual([
      ["update", ES.projects], ["create", ES.shareholderEntityInProjects], ["create", ES.projectStateTrackings],
    ]);
    expect(p.writes[0]!.id).toBe("p-new");
    expect(p.writes[0]!.data![PROJECT_COL.internalProjectId]).toBe("PL-2001");
    expect(p.writes[2]!.data!["vsb_Project@odata.bind"]).toBe("/vsb_projects(p-new)");
    expect(p.log).toEqual([MSG.stepShareholdersSaved]);
  });

  it("UT-GDATA-082 an Acquired new project rebuilds every tracking (old start cluster = Greenfield)", () => {
    const reRead = createdProjectSnapshot(project({ id: "p-new", startCluster: 3 }));
    expect(reRead.startCluster).toBe(0);
    const f = form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster: 3, acquisitionDate: "2026-01-01", acquisitionPrice: "1" });
    const p = planSaveFollowUps({ project: reRead, form: f, ref: ref(), trackings: [], shareholdersDirty: false, entities: [] });
    expect(p.writes.filter((w) => w.entitySet === ES.projectStateTrackings && w.op === "create")).toHaveLength(7);
    expect(p.log).toEqual([MSG.stepTrackingRefreshed]);
  });
});
