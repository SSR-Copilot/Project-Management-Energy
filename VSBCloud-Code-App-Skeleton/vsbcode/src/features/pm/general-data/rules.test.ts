/**
 * Project General Data Screen — unit tests.
 * IDs are the spec's (UT-GDATA-nnn). Pure functions only: no rendering, no mocking
 * beyond the input records.
 */
import { describe, it, expect } from "vitest";
import { ES, CHOICE } from "@/data/entities";
import { isSixDecimal } from "@/domain/numeric";
import {
  APPROVAL_STATE_DRAFT, MSG, PROJECT_COL, budgetingRenameMessage,
  validationMessages, canSave, isAreaRequired, isTerrainSizeRequired,
  isMunicipalityRequired, franceSearchIsSuppressed, applyGermanMunicipality,
  countryOptions, countryDisplayMode, fieldModes, ownershipFraction, remainingPct,
  isShareholdingComplete, shareholderPanelErrors, applyShareholderDraft,
  planShareholderDelete, isThirdParty, startClusterNo, milestoneImpactNo,
  classifyStartClusterChange, milestoneChainErrors, clearSkippedMilestones,
  plannedTrackingRows, shouldCancelGateApproval, buildProjectPatch, planSaveCleanup,
  mapMarker, MAP_DEFAULT, shouldConfirmLeave, AUTO_SKIPPED_COMMENT,
  coordinateMessage, shareholdingSumWarning, shareholdingDescription,
  isSpvLegalStructureVisible, recordStatusLabel, formatAuditStamp, isCoordinateValid,
  type GeneralDataForm, type GeneralDataRefData, type ProjectSnapshot,
  type ShareholdingEntity, type ProjectStateRef, type TrackingRow,
} from "./rules";
import { toForm, saveGeneralData } from "./hooks";

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
  countries: COUNTRIES,
  countryIdsWithAreas: ["c-de"],
  projectStates: STATES,
  environmentName: "Dev",
  language: "en-US",
  ...o,
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
  id: "p-1", projectNumber: "PL-1021", internalProjectId: null, originalProjectName: null,
  approvalState: null, statecode: 0, clusterStateId: "s-draft", clusterStateName: "Draft",
  clusterStateOrder: 0, countryId: "c-pl", countryName: "Poland", countryKey: "33",
  besitzerBusinessUnitId: "bu-pl", startCluster: 0, shareOfFarmdown: null,
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
  f?: Partial<GeneralDataForm>;
  r?: Partial<GeneralDataRefData>;
  p?: ProjectSnapshot | null;
  entities?: ShareholdingEntity[];
} = {}) => ({
  form: form(o.f),
  ref: ref(o.r),
  project: o.p === undefined ? project() : o.p,
  entities: o.entities ?? [entity()],
  hasPersistedShareholders: true,
});

const allowAll = { canCreate: true, canEdit: true };

/* ═══════════════════════════════════════════════════════════ binding & defaults */

describe("UT-GDATA binding and defaults", () => {
  it("UT-GDATA-001 form binds every project field on load", () => {
    const bound = toForm({
      vsb_projectid: "p-1", vsb_name: "Nordwind", vsb_internalprojectid: "PL-1021",
      vsb_technology: "Wind", vsb_totalcapacity: 42, vsb_plantwtgcapacity: 40,
      vsb_plantwtgcost: 1, vsb_projectstartdate: null, vsb_netyieldp50: 1,
      vsb_finalinvestmentdecision: null, _vsb_country_value: "c-de", _vsb_clusterstate_value: "s-draft",
      statecode: 0, modifiedon: "2026-01-01",
      vsb_shortname: "NDW", _vsb_projectmanager_value: "e-1",
      _vsb_countryarea_value: "a-1", vsb_latitude: 51.284745, vsb_longitude: 13.712023,
      vsb_taxfactor: 400, vsb_developmenttype: CHOICE.developmentType.acquiredProject,
      "_vsb_country_value@OData.Community.Display.V1.FormattedValue": "Germany",
    });
    expect(bound.projectName).toBe("Nordwind");
    expect(bound.shortName).toBe("NDW");
    expect(bound.managerEntraRowId).toBe("e-1");
    expect(bound.countryId).toBe("c-de");
    expect(bound.areaId).toBe("a-1");
    expect(bound.latitude).toBe("51.284745");
    expect(bound.longitude).toBe("13.712023");
    expect(bound.technology).toBe("Wind");
    expect(bound.developmentType).toBe(CHOICE.developmentType.acquiredProject);
    expect(bound.taxFactor).toBe("400");
  });

  it("UT-GDATA-002 new project starts blank with Draft defaults", () => {
    const bound = toForm(undefined);
    expect(bound.projectName).toBe("");
    expect(bound.countryId).toBeNull();
    // GUIDE p10 — "Development Type" already reads "Own Development" on a brand-new form.
    expect(bound.developmentType).toBe(CHOICE.developmentType.ownDevelopment);

    const patch = buildProjectPatch(form(), ref(), null);
    expect(patch[PROJECT_COL.approvalState]).toBe(APPROVAL_STATE_DRAFT);
    expect(patch["vsb_ClusterState@odata.bind"]).toBe(`/${ES.projectStates}(s-draft)`);
    expect(patch[PROJECT_COL.shareOfFarmdown]).toBe(50);
    expect(patch[PROJECT_COL.isStandardShareOfFarmdown]).toBe(true);
    expect(patch[PROJECT_COL.standardCostCreated]).toBe(false);
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
    const c = ctx({
      f: { projectName: "Südwind" },
      r: { environmentName: "Budgeting" },
      p: project({ originalProjectName: "Nordwind" }),
    });
    expect(validationMessages(c)).toContain(budgetingRenameMessage("Nordwind"));
  });

  it("UT-GDATA-005 Budgeting rename by appending is accepted", () => {
    const c = ctx({
      f: { projectName: "Nordwind II" },
      r: { environmentName: "Budgeting" },
      p: project({ originalProjectName: "Nordwind" }),
    });
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
    const c = ctx({
      f: { countryId: "c-de", areaId: "a-1", municipalityGermany: "Dresden", terrainSize: "" },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }),
    });
    expect(validationMessages(c)).toContain(MSG.inputBlank);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-009 terrain size one-decimal and range enforced", () => {
    expect(validationMessages(ctx({ f: { terrainSize: "12.34" } })))
      .toContain(MSG.numericOneDecimals);
    expect(validationMessages(ctx({ f: { terrainSize: "1200.0" } })))
      .toContain(MSG.terrainRange);
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
    // …and the validator uses the language it is handed, not the browser's.
    expect(validationMessages(ctx({
      f: { latitude: "51,284745", longitude: "13,712023" }, r: { language: "de-DE" },
    }))).not.toContain(MSG.coordinateFormat);
  });

  it("UT-GDATA-013b coordinateMessage: guide's exact valid pair and its format errors", () => {
    // GUIDE p13 — the exact values the saved record ends up with.
    expect(coordinateMessage("26.919774", "lat")).toBeNull();
    expect(coordinateMessage("75.771319", "lng")).toBeNull();
    // GUIDE p12 — blank shows the FORMAT message, not a generic "required" one.
    expect(coordinateMessage("", "lat")).toBe(MSG.coordinateFormat);
    expect(coordinateMessage("", "lng")).toBe(MSG.coordinateFormat);
    // Seven decimal places is malformed, not merely out of range.
    expect(coordinateMessage("26.9197741", "lat")).toBe(MSG.coordinateFormat);
    // Well-formed but out of range gets the range message instead.
    expect(coordinateMessage("95.000000", "lat")).toBe(MSG.latitudeRange);
    expect(coordinateMessage("-200.000000", "lng")).toBe(MSG.longitudeRange);
  });

  it("UT-GDATA-014 SPV company code shape checked only when a value is present", () => {
    expect(validationMessages(ctx({ f: { spvName: "Nordwind SPV", spvCompanyCode: "999" } })))
      .toContain(MSG.spvCodeShape);
    expect(validationMessages(ctx({ f: { spvName: "Nordwind SPV", spvCompanyCode: "1234" } })))
      .not.toContain(MSG.spvCodeShape);
  });

  it("UT-GDATA-015 SPV company code is never a blocking requirement (GUIDE p14: no such control)", () => {
    // The real Basic Information section has no SPV Company Code field — requiring it
    // would leave no way to satisfy the requirement, so a blank code with an SPV name
    // present must not push a message or block Save.
    const c = ctx({ f: { spvName: "Nordwind SPV", spvCompanyCode: "" } });
    expect(validationMessages(c)).not.toContain(MSG.spvCodeBlank);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(true);
  });

  it("UT-GDATA-016 SPV legal structure required only for Germany", () => {
    const fr = ctx({
      f: { countryId: "c-fr", municipalityFrance: "Beauce", spvName: "SPV", spvCompanyCode: "1234" },
      p: project({ countryId: "c-fr", countryName: "France", countryKey: "12" }),
    });
    expect(validationMessages(fr)).not.toContain(MSG.spvLegalStructure);
    expect(canSave({ ...fr, perms: allowAll, isDirty: true })).toBe(true);

    const de = ctx({
      f: { countryId: "c-de", areaId: "a-1", terrainSize: "12.5",
           municipalityGermany: "Dresden", spvName: "SPV", spvCompanyCode: "1234" },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }),
    });
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
    expect(validationMessages(ctx({
      f: { countryId: "c-de", areaId: "a-1", terrainSize: "12.5", municipalityGermany: null },
      p: project({ countryId: "c-de", countryName: "Germany", countryKey: "25" }),
    }))).toContain(MSG.municipalityGermany);
  });

  it("UT-GDATA-019 French municipality search suppressed below 3 chars", () => {
    expect(franceSearchIsSuppressed("pa")).toBe(true);
    expect(franceSearchIsSuppressed("  pa  ")).toBe(true);
    expect(franceSearchIsSuppressed("par")).toBe(false);
  });

  it("UT-GDATA-020 German municipality sets tax factor from trade tax rate", () => {
    const patch = applyGermanMunicipality({ municipality: "Dresden", tradetaxrate: 400 });
    expect(patch.taxFactor).toBe("400");
    expect(patch.municipalityGermany).toBe("Dresden");
  });

  it("UT-GDATA-035 acquisition price must be a whole number ≤1e9", () => {
    const c = ctx({ f: {
      developmentType: CHOICE.developmentType.acquiredProject,
      startCluster: 0, acquisitionDate: "2026-01-01", acquisitionPrice: "1.234.567,89",
    } });
    expect(validationMessages(c)).toContain(MSG.acquisitionPriceShape);
    expect(validationMessages(ctx({ f: {
      developmentType: CHOICE.developmentType.acquiredProject,
      startCluster: 0, acquisitionDate: "2026-01-01", acquisitionPrice: "",
    } }))).toContain(MSG.acquisitionPriceBlank);
  });
});

/* ═══════════════════════════════════════════════════════ shareholding entities */

describe("UT-GDATA shareholding entities", () => {
  it("UT-GDATA-021 ownership below 100 % is a warning, not a save-blocking error (GUIDE p13)", () => {
    // p13 saves the record with a single 50 % row — Save must stay enabled.
    const entities = [entity({ key: "a", ownership: 0.5 })];
    const c = ctx({ entities });
    expect(isShareholdingComplete(entities)).toBe(false);
    expect(shareholdingSumWarning(entities)).toBe(MSG.shareholdingSum);
    expect(validationMessages(c)).not.toContain(MSG.shareholdingSum);
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(true);
  });

  it("UT-GDATA-021b the warning clears at exactly 100 %, and an empty table has none to warn about", () => {
    const full = [entity({ key: "a", ownership: 1 })];
    expect(shareholdingSumWarning(full)).toBeNull();
    expect(shareholdingSumWarning([])).toBeNull();
  });

  it("UT-GDATA-022 ownership stored as a rounded fraction", () => {
    expect(ownershipFraction(33.33)).toBe(0.3333);
    expect(ownershipFraction("33.33")).toBe(0.3333);
  });

  it("UT-GDATA-023 remaining percentage caps a new entity", () => {
    const entities = [entity({ key: "a", ownership: 0.7 })];
    expect(remainingPct(entities)).toBe(30);
    const errors = shareholderPanelErrors(
      { key: "new-1", entityTypeValue: 952850000, customName: "", percent: "40" }, entities,
    );
    expect(errors.some((e) => e.includes("between 0.1 and 30"))).toBe(true);
    // Editing the existing row gets its own share back.
    expect(remainingPct(entities, "a")).toBe(100);
  });

  it("UT-GDATA-024 Custom Name required and stored only for Third Party", () => {
    expect(isThirdParty(CHOICE.shareholderEntityType.thirdParty)).toBe(true);
    const blocked = shareholderPanelErrors(
      { key: "n", entityTypeValue: CHOICE.shareholderEntityType.thirdParty,
        customName: "", percent: "50" }, [],
    );
    expect(blocked).toContain(MSG.shareholdingCustomName);

    const next = applyShareholderDraft([], {
      key: "n", entityTypeValue: 952850000, customName: "ignored", percent: "50",
    });
    expect(next[0].customName).toBe("");

    const third = applyShareholderDraft([], {
      key: "n2", entityTypeValue: CHOICE.shareholderEntityType.thirdParty,
      customName: "Stadtwerke", percent: "50",
    });
    expect(third[0].customName).toBe("Stadtwerke");
  });

  it("UT-GDATA-025 at least one shareholding entity required", () => {
    const c = { ...ctx({ entities: [] }), hasPersistedShareholders: false };
    expect(canSave({ ...c, perms: allowAll, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-019b deleting an entity only issues a Dataverse delete when it exists", () => {
    const persisted = planShareholderDelete([entity({ key: "a", recordId: "sh-1" })], "a");
    expect(persisted.entities).toHaveLength(0);
    expect(persisted.writes).toEqual([
      { op: "delete", entitySet: ES.shareholderEntityInProjects, id: "sh-1" },
    ]);

    const local = planShareholderDelete([entity({ key: "b", recordId: null })], "b");
    expect(local.writes).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════ permission */

describe("UT-GDATA permissions and display modes", () => {
  it("UT-GDATA-026 save blocked without edit permission", () => {
    const c = ctx();
    expect(canSave({ ...c, perms: { canCreate: true, canEdit: false }, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-027 new project uses create permission instead", () => {
    const c = ctx({ p: null });
    expect(canSave({ ...c, perms: { canCreate: true, canEdit: false }, isDirty: true })).toBe(true);
    expect(canSave({ ...c, perms: { canCreate: false, canEdit: true }, isDirty: true })).toBe(false);
  });

  it("UT-GDATA-027b save blocked when nothing is dirty", () => {
    expect(canSave({ ...ctx(), perms: allowAll, isDirty: false })).toBe(false);
  });

  it("UT-GDATA-028 country list restricted to editable countries", () => {
    const opts = countryOptions(COUNTRIES, [
      { id: "c-de", name: "Germany" }, { id: "c-fr", name: "France" },
    ], "Germany");
    expect(opts.map((c) => c.id)).toEqual(["c-de", "c-fr"]);
  });

  it("UT-GDATA-029 country list unrestricted when scope empty", () => {
    expect(countryOptions(COUNTRIES, [], "Germany")).toHaveLength(3);
  });

  it("UT-GDATA-030 country list unrestricted when the project country is out of scope", () => {
    const opts = countryOptions(COUNTRIES, [{ id: "c-de", name: "Germany" }], "Poland");
    expect(opts).toHaveLength(3);
  });

  it("UT-GDATA-031 country read-only when project Approved", () => {
    expect(countryDisplayMode({
      approvalState: CHOICE.approvalState.approved, canCreate: true, countryInScope: true,
    })).toBe("view");
    expect(countryDisplayMode({
      approvalState: null, canCreate: true, countryInScope: true,
    })).toBe("edit");
    expect(countryDisplayMode({
      approvalState: null, canCreate: true, countryInScope: false,
    })).toBe("view");
  });

  it("UT-GDATA-032 name and area read-only past Draft", () => {
    expect(fieldModes({ clusterStateOrder: 2, environmentName: "Dev" }))
      .toEqual({ projectName: "view", area: "view" });
    expect(fieldModes({ clusterStateOrder: 2, environmentName: "Budgeting" }))
      .toEqual({ projectName: "edit", area: "view" });
    expect(fieldModes({ clusterStateOrder: 0, environmentName: "Dev" }))
      .toEqual({ projectName: "edit", area: "edit" });
  });
});

/* ══════════════════════════════════════════════════ start-cluster classification */

describe("UT-GDATA start-cluster classification", () => {
  const withDates = (o: Partial<ProjectSnapshot>) => project({
    projectStartDate: "2026-01-01", feasibilityStudies: "2026-06-01",
    projectDevelopmentStarted: "2026-12-01", applicationSubmitted: "2027-06-01",
    legallyBindingPermits: "2028-01-01", fid: "2028-06-01", ...o,
  });

  it("UT-GDATA-033 start cluster ignored for Own Development", () => {
    const patch = buildProjectPatch(
      form({ developmentType: CHOICE.developmentType.ownDevelopment, startCluster: 3 }),
      ref(), project(),
    );
    expect(patch[PROJECT_COL.startCluster]).toBe(CHOICE.clusterState.greenfield);
  });

  it("UT-GDATA-034 acquisition date/price cleared for Own Development", () => {
    const patch = buildProjectPatch(
      form({
        developmentType: CHOICE.developmentType.ownDevelopment,
        acquisitionDate: "2026-01-01", acquisitionPrice: "1000000",
      }),
      ref(), project(),
    );
    expect(patch[PROJECT_COL.acquisitionDate]).toBeNull();
    expect(patch[PROJECT_COL.acquisitionPrice]).toBeNull();
  });

  it("UT-GDATA-033b the option-set value IS the cluster number", () => {
    expect(startClusterNo(0)).toBe(0);
    expect(startClusterNo(6)).toBe(6);
    expect(startClusterNo(null)).toBe(0);
    expect(startClusterNo(99)).toBe(0);
    expect(milestoneImpactNo(6)).toBe(5);
    expect(milestoneImpactNo(5)).toBe(5);
    expect(milestoneImpactNo(3)).toBe(3);
  });

  it("UT-GDATA-036 Cluster 5 → Cluster 6 saves directly", () => {
    expect(classifyStartClusterChange({
      developmentType: CHOICE.developmentType.acquiredProject,
      previousCluster: 5, selectedCluster: 6, project: withDates({ startCluster: 5 }),
    })).toBe("direct-save");
  });

  it("UT-GDATA-037 downward change opens the milestone panel", () => {
    expect(classifyStartClusterChange({
      developmentType: CHOICE.developmentType.acquiredProject,
      previousCluster: 4, selectedCluster: 1, project: withDates({ startCluster: 4 }),
    })).toBe("panel-downward");
  });

  it("UT-GDATA-038 upward change with nothing to delete saves directly", () => {
    const blank = project({
      startCluster: 1, projectStartDate: null, feasibilityStudies: null,
      projectDevelopmentStarted: null, applicationSubmitted: null,
      legallyBindingPermits: null, fid: "2028-06-01",
    });
    expect(classifyStartClusterChange({
      developmentType: CHOICE.developmentType.acquiredProject,
      previousCluster: 1, selectedCluster: 3, project: blank,
    })).toBe("direct-save");
  });

  it("UT-GDATA-038b upward change with something to delete opens the panel", () => {
    expect(classifyStartClusterChange({
      developmentType: CHOICE.developmentType.acquiredProject,
      previousCluster: 1, selectedCluster: 3, project: withDates({ startCluster: 1 }),
    })).toBe("panel-upward");
  });

  it("UT-GDATA-038c Own Development, Greenfield, equal clusters and no data all save directly", () => {
    const base = {
      developmentType: CHOICE.developmentType.acquiredProject,
      previousCluster: 1, selectedCluster: 4, project: withDates({ startCluster: 1 }),
    };
    expect(classifyStartClusterChange({
      ...base, developmentType: CHOICE.developmentType.ownDevelopment,
    })).toBe("direct-save");
    expect(classifyStartClusterChange({ ...base, selectedCluster: 0 })).toBe("direct-save");
    expect(classifyStartClusterChange({ ...base, selectedCluster: 1 })).toBe("direct-save");
    expect(classifyStartClusterChange({ ...base, project: project({ startCluster: 1 }) }))
      .toBe("direct-save");
  });

  it("UT-GDATA-039 milestone chain must be strictly increasing", () => {
    const errors = milestoneChainErrors({
      startDate: "2026-01-01", cluster1: "2026-06-01", cluster2: "2026-06-01",
      cluster3: "2027-01-01", cluster4: "2027-06-01", fid: "2028-01-01",
      cluster5: "2028-06-01", cluster6: "2029-01-01",
    }, 0);
    expect(errors.cluster2).toBe("Cluster 2 must be later than Cluster 1.");
    expect(errors.cluster3).toBeUndefined();
  });

  it("UT-GDATA-039b a visible milestone may not be blank", () => {
    const errors = milestoneChainErrors({
      startDate: null, cluster1: null, cluster2: null, cluster3: null, cluster4: null,
      fid: null, cluster5: null, cluster6: null,
    }, 0);
    expect(errors.startDate).toBe("Project Start date cannot be blank.");
    expect(errors.fid).toBe("Final Investment Decision date cannot be blank.");
  });

  it("UT-GDATA-039c milestones the new start cluster skips are not validated", () => {
    const errors = milestoneChainErrors({
      startDate: null, cluster1: null, cluster2: null, cluster3: "2027-01-01",
      cluster4: "2027-06-01", fid: "2028-01-01", cluster5: "2028-06-01", cluster6: "2029-01-01",
    }, 3);
    expect(errors.startDate).toBeUndefined();
    expect(errors.cluster1).toBeUndefined();
    expect(errors.cluster2).toBeUndefined();
    expect(errors.cluster3).toBeUndefined();
  });

  it("UT-GDATA-040 skipped milestones and their flags are cleared", () => {
    const patch = clearSkippedMilestones({
      startDate: "2026-01-01", cluster1: "2026-06-01", cluster2: "2026-12-01",
      cluster3: "2027-06-01", cluster4: "2028-01-01",
    }, 3);
    expect(patch[PROJECT_COL.projectStartDate]).toBeNull();
    expect(patch[PROJECT_COL.feasibilityStudies]).toBeNull();
    expect(patch[PROJECT_COL.projectDevelopmentStarted]).toBeNull();
    expect(patch[PROJECT_COL.isProjectDevelopmentStd]).toBe(false);
    expect(patch[PROJECT_COL.applicationSubmitted]).toBe("2027-06-01");
    expect(patch[PROJECT_COL.isApplicationSubmittedStd]).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════ the save orchestration */

describe("UT-GDATA the save orchestration", () => {
  const saved = project({
    id: "p-1", projectNumber: "PL-1021", internalProjectId: null,
    besitzerBusinessUnitId: "bu-pl",
  });

  const plan = (o: Partial<Parameters<typeof planSaveCleanup>[0]> = {}) => planSaveCleanup({
    saved, form: form(), ref: ref(), startClusterChanged: false, newStartClusterNo: 0,
    trackings: [], shareholdersDirty: false, entities: [], repriceGenerators: false,
    generators: [], ...o,
  });

  it("UT-GDATA-041 Internal Project ID back-filled only when blank", () => {
    const blank = plan();
    const update = blank.writes.find((w) => w.entitySet === ES.projects)!;
    expect(update.data![PROJECT_COL.internalProjectId]).toBe("PL-1021");

    const filled = plan({ saved: project({ internalProjectId: "LEGACY-7" }) });
    const update2 = filled.writes.find((w) => w.entitySet === ES.projects)!;
    expect(update2.data![PROJECT_COL.internalProjectId]).toBe("LEGACY-7");
  });

  it("UT-GDATA-041b Patch #2 uses Countries.'Business Unit', not '.Besitzer'", () => {
    const p = plan({ form: form({ countryId: "c-de" }) });
    const update = p.writes.find((w) => w.entitySet === ES.projects)!;
    // Patch #1 uses besitzerBusinessUnitId (bu-de); the cleanup patch uses businessUnitId.
    expect(update.data!["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de2)");
    const patch1 = buildProjectPatch(form({ countryId: "c-de" }), ref(), saved);
    expect(patch1["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
  });

  it("UT-GDATA-042 Draft tracking row created when absent", () => {
    const p = plan();
    const step = p.steps.find((s) => s.kind === "ensure-draft-tracking");
    expect(step).toBeDefined();
    expect(step!.writes).toHaveLength(1);
    expect(step!.writes[0].op).toBe("create");
    expect(step!.writes[0].data!["vsb_approvalclusterstate"])
      .toBe(CHOICE.approvalClusterState.inProgress);
  });

  it("UT-GDATA-043 existing Draft tracking row not overwritten", () => {
    const trackings: TrackingRow[] = [
      { id: "t-draft", clusterStateId: "s-draft", approvalClusterState: 952850001, flowRunId: null },
    ];
    const p = plan({ trackings });
    expect(p.steps.some((s) => s.kind === "ensure-draft-tracking")).toBe(false);
  });

  it("UT-GDATA-044 tracking rebuild marks skipped clusters Completed", () => {
    const rows = plannedTrackingRows(STATES, 3, []);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      clusterStateName: "Draft",
      approvalClusterState: CHOICE.approvalClusterState.inProgress,
      comment: null,
    });
    expect(rows[1]).toMatchObject({
      clusterStateName: "Cluster 1",
      approvalClusterState: CHOICE.approvalClusterState.completed,
      comment: AUTO_SKIPPED_COMMENT,
    });
    expect(rows[2].approvalClusterState).toBe(CHOICE.approvalClusterState.completed);
    for (const r of rows.slice(3)) {
      expect(r.approvalClusterState).toBe(CHOICE.approvalClusterState.notStarted);
      expect(r.comment).toBeNull();
    }
    // The hidden, non-checklist state is excluded.
    expect(rows.some((r) => r.clusterStateName === "Archived")).toBe(false);
  });

  it("UT-GDATA-044b the rebuild reuses existing tracking rows instead of duplicating", () => {
    const trackings: TrackingRow[] = [
      { id: "t-draft", clusterStateId: "s-draft", approvalClusterState: 952850001, flowRunId: null },
    ];
    const p = plan({ startClusterChanged: true, newStartClusterNo: 3, trackings });
    const step = p.steps.find((s) => s.kind === "rebuild-trackings")!;
    expect(step.writes.filter((w) => w.op === "update")).toHaveLength(1);
    expect(step.writes.filter((w) => w.op === "create")).toHaveLength(6);
    // Rule 33 also forces the project's Cluster State back to Draft.
    const projectWrite = p.writes.find((w) => w.entitySet === ES.projects)!;
    expect(projectWrite.data!["vsb_ClusterState@odata.bind"]).toBe(`/${ES.projectStates}(s-draft)`);
  });

  it("UT-GDATA-045 gate cancellation is planned when a Draft approval is running", () => {
    const trackings: TrackingRow[] = [{
      id: "t-draft", clusterStateId: "s-draft",
      approvalClusterState: CHOICE.approvalClusterState.inProgress, flowRunId: "run-1",
    }];
    expect(shouldCancelGateApproval(trackings[0])).toBe(true);
    const p = plan({ startClusterChanged: true, newStartClusterNo: 3, trackings });
    expect(p.flowCalls).toEqual([{ name: "cancelGateApproval", stateTrackingId: "t-draft" }]);
    // Ordering: the cancellation step precedes the rebuild step.
    const kinds = p.steps.map((s) => s.kind);
    expect(kinds.indexOf("cancel-gate-approval")).toBeLessThan(kinds.indexOf("rebuild-trackings"));
  });

  it("UT-GDATA-046 gate cancellation skipped without a running approval", () => {
    const noRun: TrackingRow[] = [{
      id: "t-draft", clusterStateId: "s-draft",
      approvalClusterState: CHOICE.approvalClusterState.inProgress, flowRunId: null,
    }];
    expect(shouldCancelGateApproval(noRun[0])).toBe(false);
    const p = plan({ startClusterChanged: true, newStartClusterNo: 2, trackings: noRun });
    expect(p.flowCalls).toHaveLength(0);
    // …but the tracking rebuild still runs.
    expect(p.steps.some((s) => s.kind === "rebuild-trackings")).toBe(true);

    const notInProgress: TrackingRow[] = [{
      id: "t-draft", clusterStateId: "s-draft",
      approvalClusterState: CHOICE.approvalClusterState.completed, flowRunId: "run-1",
    }];
    expect(shouldCancelGateApproval(notInProgress[0])).toBe(false);
    expect(shouldCancelGateApproval(null)).toBe(false);
  });

  it("UT-GDATA-048 shareholders flushed in one batch", () => {
    const entities = [
      entity({ key: "a", recordId: "sh-a", ownership: 0.4 }),
      entity({ key: "b", recordId: null, ownership: 0.3 }),
      entity({ key: "c", recordId: "sh-c", ownership: 0.3 }),
    ];
    const p = plan({ shareholdersDirty: true, entities });
    const step = p.steps.find((s) => s.kind === "flush-shareholders")!;
    expect(step.writes).toHaveLength(3);
    expect(step.writes.every((w) => w.entitySet === ES.shareholderEntityInProjects)).toBe(true);
    // All three land in one plan, so the caller issues one batch, not three round trips.
    expect(p.writes.filter((w) => w.entitySet === ES.shareholderEntityInProjects)).toHaveLength(3);
  });

  it("UT-GDATA-048b removed shareholders are deleted in the same batch", () => {
    const p = plan({ shareholdersDirty: true, entities: [], removedShareholderIds: ["sh-x"] });
    const step = p.steps.find((s) => s.kind === "flush-shareholders")!;
    expect(step.writes).toEqual([
      { op: "delete", entitySet: ES.shareholderEntityInProjects, id: "sh-x" },
    ]);
  });

  it("UT-GDATA-049 plant cost recomputed from the generators", () => {
    const p = plan({
      repriceGenerators: true,
      generators: [
        { id: "g1", generatorsCost: 10 },
        { id: "g2", generatorsCost: 20 },
        { id: "g3", generatorsCost: 30 },
      ],
    });
    const projectWrite = p.writes.find((w) => w.entitySet === ES.projects)!;
    expect(projectWrite.data![PROJECT_COL.plantWtgCost]).toBe(60);
    expect(p.writes.filter((w) => w.entitySet === ES.generatorTypeInProjects)).toHaveLength(3);
  });

  it("UT-GDATA-050 save failure surfaces the error and never issues a write", async () => {
    // The manager guard runs before any request, so this needs no network stub.
    const res = await saveGeneralData({
      form: form({ managerEntraRowId: null }),
      ref: ref(), project: project(), startClusterChanged: false, newStartClusterNo: 0,
      trackings: [], shareholdersDirty: false, entities: [], repriceGenerators: false,
      generators: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe(MSG.manager);
  });

  it("UT-GDATA-051 step log matches the canvas notification text", () => {
    const p = plan({
      shareholdersDirty: true,
      entities: [entity()],
      repriceGenerators: true,
      generators: [{ id: "g1", generatorsCost: 10 }],
      startClusterChanged: true,
      newStartClusterNo: 2,
    });
    expect(p.log).toContain("Project data was saved/updated successfully.");
    expect(p.log).toContain("Project start cluster tracking was refreshed successfully.");
    expect(p.log).toContain("Project Shareholder Entitiy was saved/updated successfully.");
    expect(p.log).toContain("Plant WTG Cost (WTG's: 1), was recalculated and updated successfully.");
  });

  it("UT-GDATA-051b every planned write appears exactly once in plan.writes", () => {
    const p = plan({
      startClusterChanged: true, newStartClusterNo: 2,
      shareholdersDirty: true, entities: [entity()],
      repriceGenerators: true, generators: [{ id: "g1", generatorsCost: 5 }],
    });
    expect(p.writes).toHaveLength(p.steps.flatMap((s) => s.writes).length);
    // Exactly one Projects write — the canvas issued three sequential ones.
    expect(p.writes.filter((w) => w.entitySet === ES.projects)).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════ misc */

describe("UT-GDATA map and navigation", () => {
  it("UT-GDATA-052 leaving with unsaved changes prompts", () => {
    expect(shouldConfirmLeave(true)).toBe(true);
    expect(shouldConfirmLeave(false)).toBe(false);
  });

  it("UT-GDATA-053 map falls back to default coordinates", () => {
    expect(mapMarker({ latitude: "", longitude: "" }, null))
      .toEqual({ lat: MAP_DEFAULT.lat, lng: MAP_DEFAULT.lng });
    expect(mapMarker({ latitude: "", longitude: "" }, { lat: 1, lng: 2 }))
      .toEqual({ lat: 1, lng: 2 });
    expect(mapMarker({ latitude: "51.284745", longitude: "13.712023" }, { lat: 1, lng: 2 }))
      .toEqual({ lat: 51.284745, lng: 13.712023 });
  });

  it("UT-GDATA-053b a pin only ever renders for a genuinely valid coordinate pair", () => {
    // Defensive per the screen guide — never throws, and blank/malformed never yields a pin.
    expect(isCoordinateValid("", "lat")).toBe(false);
    expect(isCoordinateValid("not-a-number", "lat")).toBe(false);
    expect(isCoordinateValid("26.919774", "lat")).toBe(true);
    expect(isCoordinateValid("75.771319", "lng")).toBe(true);
    expect(isCoordinateValid("999.000000", "lat")).toBe(false);
  });
});

describe("UT-GDATA header, footer and section-visibility corrections (screenshots)", () => {
  it("UT-GDATA-054 SPV Legal Structure is visible for any Germany project, SPV Name or not", () => {
    // GUIDE p14: the saved record shows the field with SPV Name still blank.
    expect(isSpvLegalStructureVisible("Germany")).toBe(true);
    expect(isSpvLegalStructureVisible("Poland")).toBe(false);
    expect(isSpvLegalStructureVisible(null)).toBe(false);
  });

  it("UT-GDATA-055 the header status subtitle reads Dataverse's active/inactive statecode", () => {
    expect(recordStatusLabel(0)).toBe("Active");
    expect(recordStatusLabel(1)).toBe("Inactive");
    expect(recordStatusLabel(null)).toBe("Active");
    expect(recordStatusLabel(undefined)).toBe("Active");
  });

  it("UT-GDATA-056 the shareholding table's Description column (GUIDE p13)", () => {
    expect(shareholdingDescription(entity({
      entityTypeValue: CHOICE.shareholderEntityType.thirdParty, customName: "Green Yield One (IPP2)",
    }))).toBe("Green Yield One (IPP2)");
    expect(shareholdingDescription(entity({
      entityTypeValue: 952850000, customName: "", entityTypeName: "VSB Group",
    }))).toBe("VSB Group");
  });

  it("UT-GDATA-057 the footer's audit stamp, GUIDE p14's exact shape", () => {
    expect(formatAuditStamp("Shakti Singh Rajput", "2026-09-03T10:49:00Z"))
      .toMatch(/^Shakti Singh Rajput {2}\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    // Unsaved record: renders the footer's own ".." placeholder, not a formatted stamp.
    expect(formatAuditStamp(null, null)).toBeNull();
    expect(formatAuditStamp("Shakti Singh Rajput", null)).toBeNull();
    expect(formatAuditStamp(null, "2026-09-03T10:49:00Z")).toBeNull();
  });
});
