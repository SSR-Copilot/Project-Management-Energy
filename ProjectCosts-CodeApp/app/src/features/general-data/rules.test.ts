import { describe, expect, it } from "vitest";
import { newGeneralDataProject, type ShareholderEntity } from "@/data/generalData";
import {
  canEditCoreFields, canEditCountry, canSave, isPastFirstCluster, newShareholder,
  ownershipTotalIsValid, ownershipTotalPercent, planShareholderChanges, remainingOwnership,
  requiredMarkersHidden, validateProject, validateShareholder,
} from "./rules";

const APPROVED = 952850002;
const DEV_TYPE_OWN = 952850001;
const DEV_TYPE_ACQUIRED = 952850000;
const SHAREHOLDER_THIRD_PARTY = 952850017;

function shareholder(overrides: Partial<ShareholderEntity> = {}): ShareholderEntity {
  return { id: null, name: "Entity", customName: "", ownership: 0.5, shareholderType: 1, ...overrides };
}

describe("isPastFirstCluster / editability", () => {
  it("a brand-new project is always editable", () => {
    expect(isPastFirstCluster({ isNew: true, clusterStateOrder: 5, approvalState: null, canWrite: true })).toBe(false);
  });

  it("locks core fields once cluster order reaches 1", () => {
    const ctx = { isNew: false, clusterStateOrder: 1, approvalState: null, canWrite: true };
    expect(isPastFirstCluster(ctx)).toBe(true);
    expect(canEditCoreFields(ctx)).toBe(false);
  });

  it("treats a missing cluster order as 0 (editable)", () => {
    const ctx = { isNew: false, clusterStateOrder: null, approvalState: null, canWrite: true };
    expect(canEditCoreFields(ctx)).toBe(true);
  });

  it("locks Country once the project is Approved, even at cluster 0", () => {
    const ctx = { isNew: false, clusterStateOrder: 0, approvalState: APPROVED, canWrite: true };
    expect(canEditCountry(ctx)).toBe(false);
    expect(requiredMarkersHidden(ctx)).toBe(true);
  });

  it("denies all edits when the server reports no write access", () => {
    const ctx = { isNew: false, clusterStateOrder: 0, approvalState: null, canWrite: false };
    expect(canEditCoreFields(ctx)).toBe(false);
  });
});

describe("validateProject — required fields", () => {
  it("flags a too-short project/short name", () => {
    const p = { ...newGeneralDataProject(), projectName: "Ab", shortName: "Xy" };
    const errors = validateProject({ project: p, countryAreas: [], countryName: undefined });
    expect(errors.projectName).toMatch(/at least 3 letters/);
    expect(errors.shortName).toMatch(/at least 3 letters/);
  });

  it("requires technology, development type, project manager and country", () => {
    // newGeneralDataProject() now defaults developmentType to OWN_DEVELOPMENT (canvas default);
    // pass null explicitly to exercise the "blank" validation path.
    const p = { ...newGeneralDataProject(), developmentType: null };
    const errors = validateProject({ project: p, countryAreas: [], countryName: undefined });
    expect(errors.technology).toBeDefined();
    expect(errors.developmentType).toBeDefined();
    expect(errors.projectManager).toBeDefined();
    expect(errors.country).toBeDefined();
  });

  it("requires Area only when the selected country has areas", () => {
    const base = { ...newGeneralDataProject(), countryId: "c1", latitude: 1, longitude: 1, municipality: "x" };
    const withAreas = validateProject({ project: base, countryAreas: [{ id: "a1", name: "Area" }], countryName: undefined });
    expect(withAreas.countryArea).toBeDefined();

    const withoutAreas = validateProject({ project: base, countryAreas: [], countryName: undefined });
    expect(withoutAreas.countryArea).toBeUndefined();
  });

  it("requires Start Cluster unless Development Type is Own Development", () => {
    const acquired = { ...newGeneralDataProject(), developmentType: DEV_TYPE_ACQUIRED };
    expect(validateProject({ project: acquired, countryAreas: [], countryName: undefined }).startCluster).toBeDefined();

    const own = { ...newGeneralDataProject(), developmentType: DEV_TYPE_OWN };
    expect(validateProject({ project: own, countryAreas: [], countryName: undefined }).startCluster).toBeUndefined();
  });

  it("requires Acquisition Date and a bounded, whole-number Acquisition Price for Acquired projects", () => {
    const p = { ...newGeneralDataProject(), developmentType: DEV_TYPE_ACQUIRED };
    const errors = validateProject({ project: p, countryAreas: [], countryName: undefined });
    expect(errors.acquisitionDate).toBeDefined();
    expect(errors.acquisitionPrice).toBeDefined();

    const tooHigh = { ...p, acquisitionDate: "2026-01-01", acquisitionPrice: 2_000_000_000 };
    expect(validateProject({ project: tooHigh, countryAreas: [], countryName: undefined }).acquisitionPrice).toMatch(/whole number/);

    const valid = { ...p, acquisitionDate: "2026-01-01", acquisitionPrice: 500 };
    expect(validateProject({ project: valid, countryAreas: [], countryName: undefined }).acquisitionPrice).toBeUndefined();
  });

  it("requires Terrain Size, one decimal, 0.1-1000, only for Germany", () => {
    const base = newGeneralDataProject();
    expect(validateProject({ project: base, countryAreas: [], countryName: "France" }).terrainSize).toBeUndefined();
    expect(validateProject({ project: base, countryAreas: [], countryName: "Germany" }).terrainSize).toBeDefined();

    const tooPrecise = { ...base, terrainSize: 1.23 };
    // Not representable with one decimal, so the format check fails even though it is in range.
    expect(validateProject({ project: tooPrecise, countryAreas: [], countryName: "Germany" }).terrainSize).toMatch(/one decimals/);

    const outOfRange = { ...base, terrainSize: 2000 };
    expect(validateProject({ project: outOfRange, countryAreas: [], countryName: "Germany" }).terrainSize).toMatch(/between 0/);

    const valid = { ...base, terrainSize: 500.5 };
    expect(validateProject({ project: valid, countryAreas: [], countryName: "Germany" }).terrainSize).toBeUndefined();
  });

  it("requires Latitude/Longitude as six-decimal degrees within range", () => {
    const base = newGeneralDataProject();
    expect(validateProject({ project: base, countryAreas: [], countryName: undefined }).latitude).toBeDefined();

    const outOfRange = { ...base, latitude: 120, longitude: 10 };
    expect(validateProject({ project: outOfRange, countryAreas: [], countryName: undefined }).latitude).toMatch(/between -90 and 90/);

    const valid = { ...base, latitude: 52.123456, longitude: -1.5 };
    const errors = validateProject({ project: valid, countryAreas: [], countryName: undefined });
    expect(errors.latitude).toBeUndefined();
    expect(errors.longitude).toBeUndefined();
  });

  it("requires Municipality for Germany and France only", () => {
    const base = { ...newGeneralDataProject(), latitude: 1, longitude: 1 };
    expect(validateProject({ project: base, countryAreas: [], countryName: "Germany" }).municipality).toBeDefined();
    expect(validateProject({ project: base, countryAreas: [], countryName: "Spain" }).municipality).toBeUndefined();
  });

  it("requires SPV Legal Structure and Company Code once an SPV Name is entered", () => {
    const base = { ...newGeneralDataProject(), latitude: 1, longitude: 1, spvName: "Acme SPV" };
    const germanyErrors = validateProject({ project: base, countryAreas: [], countryName: "Germany" });
    expect(germanyErrors.spvLegalStructure).toBeDefined();
    expect(germanyErrors.spvCompanyCode).toBeDefined();

    // Outside Germany, Legal Structure is not required, but Company Code still is.
    const elsewhere = validateProject({ project: base, countryAreas: [], countryName: "France" });
    expect(elsewhere.spvLegalStructure).toBeUndefined();
    expect(elsewhere.spvCompanyCode).toBeDefined();

    const outOfRange = { ...base, spvCompanyCode: 99 };
    expect(validateProject({ project: outOfRange, countryAreas: [], countryName: "France" }).spvCompanyCode).toMatch(/between 1000/);

    const valid = { ...base, spvLegalStructure: 1, spvCompanyCode: 4321 };
    const validErrors = validateProject({ project: valid, countryAreas: [], countryName: "Germany" });
    expect(validErrors.spvLegalStructure).toBeUndefined();
    expect(validErrors.spvCompanyCode).toBeUndefined();
  });

  it("does not require SPV fields when SPV Name is blank", () => {
    const base = { ...newGeneralDataProject(), latitude: 1, longitude: 1 };
    const errors = validateProject({ project: base, countryAreas: [], countryName: "Germany" });
    expect(errors.spvLegalStructure).toBeUndefined();
    expect(errors.spvCompanyCode).toBeUndefined();
  });
});

describe("shareholding entities", () => {
  it("computes the remaining ownership fraction excluding the row itself", () => {
    const rows = [shareholder({ ownership: 0.3 }), shareholder({ ownership: 0.4 })];
    expect(remainingOwnership(rows, 0)).toBeCloseTo(0.6, 4);
    expect(remainingOwnership(rows, 1)).toBeCloseTo(0.7, 4);
  });

  it("requires Custom Name only for the Third Party shareholder type", () => {
    const rows = [shareholder({ shareholderType: SHAREHOLDER_THIRD_PARTY, customName: "" })];
    expect(validateShareholder(rows[0]!, rows, 0).customName).toBeDefined();

    const named = [shareholder({ shareholderType: SHAREHOLDER_THIRD_PARTY, customName: "Acme" })];
    expect(validateShareholder(named[0]!, named, 0).customName).toBeUndefined();

    const other = [shareholder({ shareholderType: 1, customName: "" })];
    expect(validateShareholder(other[0]!, other, 0).customName).toBeUndefined();
  });

  it("rejects an ownership percentage that would exceed what remains", () => {
    const rows = [shareholder({ ownership: 0.6 }), shareholder({ ownership: 0.6 })];
    expect(validateShareholder(rows[1]!, rows, 1).ownership).toMatch(/must be between/);
  });

  it("rejects a zero or negative ownership percentage", () => {
    const rows = [shareholder({ ownership: 0 })];
    expect(validateShareholder(rows[0]!, rows, 0).ownership).toBeDefined();
  });

  it("totals ownership across rows, tolerating tiny floating-point drift (SOURCE DEFECT fix)", () => {
    const rows = [
      shareholder({ ownership: 0.3333 }), shareholder({ ownership: 0.3333 }),
      shareholder({ ownership: 0.3334 }),
    ];
    expect(ownershipTotalIsValid(rows)).toBe(true);
    expect(ownershipTotalPercent(rows)).toBeCloseTo(100, 1);
  });

  it("rejects a total that is meaningfully short of 100%", () => {
    const rows = [shareholder({ ownership: 0.5 })];
    expect(ownershipTotalIsValid(rows)).toBe(false);
  });

  it("rejects an empty shareholder list", () => {
    expect(ownershipTotalIsValid([])).toBe(false);
  });

  it("plans deletes for ids dropped from the current list, and nothing for unsaved rows", () => {
    const original = [shareholder({ id: "s1" }), shareholder({ id: "s2" })];
    const current = [shareholder({ id: "s1" }), newShareholder()];
    expect(planShareholderChanges(original, current).deletedIds).toEqual(["s2"]);
  });

  it("newShareholder starts blank", () => {
    const row = newShareholder();
    expect(row).toEqual({ id: null, name: "", customName: "", ownership: null, shareholderType: null });
  });
});

describe("canSave", () => {
  const validRows = [shareholder({ ownership: 1 })];

  it("is false when there are no unsaved changes", () => {
    expect(canSave({
      project: newGeneralDataProject(), shareholders: validRows, fieldErrors: {},
      isDirty: false, canWrite: true,
    })).toBe(false);
  });

  it("is false without write permission", () => {
    expect(canSave({
      project: newGeneralDataProject(), shareholders: validRows, fieldErrors: {},
      isDirty: true, canWrite: false,
    })).toBe(false);
  });

  it("is false when any field has a validation error", () => {
    expect(canSave({
      project: newGeneralDataProject(), shareholders: validRows,
      fieldErrors: { projectName: "too short" }, isDirty: true, canWrite: true,
    })).toBe(false);
  });

  it("is false when there are no shareholding entities, or they do not total 100%", () => {
    expect(canSave({
      project: newGeneralDataProject(), shareholders: [], fieldErrors: {},
      isDirty: true, canWrite: true,
    })).toBe(false);
    expect(canSave({
      project: newGeneralDataProject(), shareholders: [shareholder({ ownership: 0.5 })],
      fieldErrors: {}, isDirty: true, canWrite: true,
    })).toBe(false);
  });

  it("is true once every gate is satisfied", () => {
    expect(canSave({
      project: newGeneralDataProject(), shareholders: validRows, fieldErrors: {},
      isDirty: true, canWrite: true,
    })).toBe(true);
  });
});
