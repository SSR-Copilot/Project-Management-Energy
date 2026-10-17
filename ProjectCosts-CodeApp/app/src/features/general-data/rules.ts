/**
 * Project General Data — every business rule as a pure function. No React, no network.
 *
 * Canvas source: `Project General Data Screen.pa.yaml` (PGDS). Full analysis in
 * `codeapp-knowledge-base/screens/project-general-data-screen/`; this file implements
 * `03-behaviour/01-display-modes-and-visibility.md` (editability) and
 * `03-behaviour/03-validations.md` (validation, Save gate, Notify messages) — read those before
 * changing a rule here, and keep the `PGDS:<line>` citations next to whatever they justify.
 *
 * SCOPE (Phase 1 — see `06-code-app-requirements/01-build-requirements.md`): Basic Information,
 * Acquisition Details, Placement and Shareholding Entities. The Cluster Change panel (Section 5
 * of the validations file: milestone re-entry, gate-approval cancellation, state-tracking
 * rebuild) is OUT of scope here and is a visible "not available yet" affordance on the Start
 * Cluster field instead of a silent omission — see `Screen.tsx`.
 *
 * DEVIATIONS FROM THE CANVAS, each flagged where it applies:
 *   - Ownership must sum to 100% WITHIN A SMALL TOLERANCE, not exact floating equality
 *     (`SOURCE DEFECT` noted in the validations file itself: four quarters stored as
 *     `Round(x/100,4)` are not guaranteed to re-sum to exactly 1 in floating point).
 *   - Shareholding-entity delete is by id. The canvas matched by Name (03-validations.md does
 *     not cover this directly; see `04-data/02-operations-performed.md` and
 *     `06-code-app-requirements/02-canvas-defects-and-decisions.md`, D-DATA-1).
 *   - The "Budgeting environment" exception to the Project Name edit-lock, and the
 *     `StartsWith(Original Project Name)` rule for that same environment, are NOT implemented —
 *     this build has no signal for which environment it is running in at the point this file is
 *     evaluated. Documented in `02-canvas-defects-and-decisions.md` as an open decision.
 */
import {
  parseNumber, isDecimal, isInteger, inRange, round, sum as sumNumbers,
} from "@/domain/numeric";
import type { GeneralDataProject, ShareholderEntity, Lookup } from "@/data/generalData";
import { Vsb_projectsvsb_developmenttype } from "@/generated/models/Vsb_projectsModel";
import { Vsb_shareholderentitiiesvsb_shareholderentitiytype } from "@/generated/models/Vsb_shareholderentitiiesModel";

/* ═══════════════════════════════════════════════════════════════════ labels ══ */

/** Field labels, verbatim from the canvas captions — `02-user-interface/01-…-control-tree.md`. */
export const LABELS = {
  projectName: "Project Name",
  shortName: "Short Name",
  originalProjectName: "Original Project Name",
  developmentType: "Development Type",
  technology: "Technology",
  subTechnology1: "Sub Technology 1",
  subTechnology2: "Sub Technology 2",
  subTechnology3: "Sub Technology 3",
  startCluster: "Start Cluster",
  country: "Country",
  countryArea: "Area/State/Province",
  projectManager: "Project Manager",
  deputyProjectManager: "Deputy Project Manager",
  projectStartDate: "Project Start Date",
  acquisitionDate: "Acquisition Date",
  acquisitionPrice: "Acquisition Price",
  bidPrice: "Bid Price",
  ownershipType: "Ownership Type",
  ownerPercentage: "Owner Percentage",
  shareOfFarmdown: "Share of Farmdown",
  financingOptions: "Financing Options",
  municipality: "Municipality",
  district: "District",
  latitude: "Latitude",
  longitude: "Longitude",
  terrainSize: "Terrain Size",
  terrainUtilization: "Terrain Utilization",
  taxFactor: "Tax Factor",
  spvName: "SPV Name",
  spvLegalStructure: "SPV Legal Structure",
  spvCompanyCode: "SPV Company Code",
  shareholderName: "Shareholder Entity",
  customName: "Custom Name",
  ownership: "Ownership %",
} as const;

/** Validation messages, verbatim — `03-behaviour/03-validations.md`. */
export const MSG = {
  /** PGDS:1217 */
  projectNameTooShort: "Project name should have at least 3 letters.",
  /** PGDS:1368 */
  shortNameTooShort: "Project short name should have at least 3 letters.",
  /** PGDS:1888 */
  technologyRequired: "The Technology cannot be blank.",
  /** PGDS:2417 */
  developmentTypeRequired: "The Development Type cannot be blank.",
  /** PGDS:2081 */
  projectManagerRequired: "The project manager cannot be blank.",
  /** PGDS:3121 */
  countryRequired: "Country cannot be blank.",
  /** PGDS:3310 */
  areaRequired: "Area/State/Province cannot be blank.",
  /** PGDS:3978, blank branch — `gblAppResx.InputBlank`, App:1633. */
  inputBlank: "Input must not be blank",
  /** PGDS:3991 — `gblAppResx.NumericOneDecimals`, App:1629. */
  numericOneDecimal: "Numeric value with maximum of one decimals",
  terrainSizeRange: (max: number) => `Please select a value between 0 and ${max.toLocaleString("en-US")}`,
  /** PGDS:3752 */
  taxFactorNotInteger: "Tax factor should be a numeric value without decimal.",
  /** PGDS:3803 */
  taxFactorRange: "Tax factor should not be greater than 1000.",
  /** PGDS:4130 — the separator is culture-dependent in the canvas; fixed to "." here. */
  latitudeFormat: "Expected decimal degrees field format number ##.######",
  /** PGDS:4145 */
  latitudeRange: "The number decimal degrees must be between -90 and 90.",
  /** PGDS:4247 */
  longitudeFormat: "Expected decimal degrees field format number ###.######.",
  /** PGDS:4262 */
  longitudeRange: "The number decimal degrees must be between -180 and 180.",
  /** PGDS:2661 */
  startClusterRequired: "Start Cluster cannot be blank.",
  /** PGDS:2748 */
  acquisitionDateRequired: "Acquisition date cannot be blank.",
  /** PGDS:2884 */
  acquisitionPriceBlank: "Acquisition Price should not be blank.",
  acquisitionPriceRange: (max: number) =>
    `The cost needs to be a whole number, without any decimal places, in the range of 0 to ${max.toLocaleString("en-US")}.`,
  /** 03-validations.md §3 — SPV Legal Structure is required once SPV Name is populated, for a
   *  German project. */
  spvLegalStructureRequired: "SPV Legal Structure cannot be blank.",
  /** 03-validations.md §3 — SPV Company Code: required alongside SPV Name, integer 1000-9999. */
  spvCompanyCodeRequired: "SPV Company Code cannot be blank.",
  spvCompanyCodeNotInteger: "SPV Company Code should be a numeric value without decimal.",
  spvCompanyCodeRange: "SPV Company Code must be between 1000 and 9999.",
  /** PGDS:6441 */
  customNameRequired: "Input must not be blank",
  ownershipRangeMessage: (value: number, maxPercent: number) =>
    `The number ${value} must be between 0 and ${maxPercent.toFixed(2)}.`,
  /** PGDS:6734 — `varSumEntities` is the rounded percentage sum. */
  ownershipAlreadyFull: (sumPercent: number) =>
    `You have achieved ${sumPercent}%. Please correct your input!.`,
  /** NEW — no canvas equivalent: shown when the total is neither under nor exactly 100%. */
  ownershipMustTotal100: "Shareholding ownership must total exactly 100% before saving.",
  /** PGDS:816 */
  saveSuccess: "Project saved successfully.",
  /** PGDS:824, simplified — the raw Dataverse error text is not shown to the user (see the
   *  `data/addCostSheet.ts` precedent for why: it is logged, not surfaced). */
  saveFailed: "Project could not be saved. Please try again.",
} as const;

export type GeneralDataMode = "create" | "edit" | "read-only";

/* ═══════════════════════════════════════════════════ editability (Section 1) ══ */

export interface EditabilityContext {
  /** `undefined` for a project not yet saved. */
  clusterStateOrder: number | null;
  approvalState: number | null;
  /** Server-reported write permission — see `@/platform/privileges`. Optimistic by design; the
   *  server is the real enforcement point (same model `addCostSheet.ts` and the rest of this
   *  app use). */
  canWrite: boolean;
  isNew: boolean;
}

/**
 * `02-display-modes-and-visibility.md`'s primary lock rule: once a project has moved past the
 * first cluster (`Coalesce('Cluster State'.Order, 0) >= 1`), Name/Short Name/Technology/Area/
 * Development Type/Start Cluster and the acquisition fields lock. A brand-new, unsaved project
 * is always fully editable.
 */
export function isPastFirstCluster(ctx: EditabilityContext): boolean {
  if (ctx.isNew) return false;
  return (ctx.clusterStateOrder ?? 0) >= 1;
}

/** Core identity/acquisition fields — locked once the project has advanced past Cluster 0. */
export function canEditCoreFields(ctx: EditabilityContext): boolean {
  return ctx.canWrite && !isPastFirstCluster(ctx);
}

/**
 * Fields that stay editable regardless of cluster progress (Placement, Shareholding, and the
 * free-text identity fields the canvas never locked): gated only on write permission.
 */
export function canEditGeneralFields(ctx: EditabilityContext): boolean {
  return ctx.canWrite;
}

/** PGDS: Approved projects lock Country (and hide the required-field asterisks). */
export function canEditCountry(ctx: EditabilityContext): boolean {
  const APPROVED = 952850002;
  if (ctx.approvalState === APPROVED) return false;
  return canEditCoreFields(ctx);
}

export function requiredMarkersHidden(ctx: EditabilityContext): boolean {
  const APPROVED = 952850002;
  return ctx.approvalState === APPROVED;
}

/* ═════════════════════════════════════════════════════ validation (Section 3-4) ══ */

export interface FieldErrors {
  projectName?: string;
  shortName?: string;
  technology?: string;
  developmentType?: string;
  projectManager?: string;
  country?: string;
  countryArea?: string;
  startCluster?: string;
  acquisitionDate?: string;
  acquisitionPrice?: string;
  terrainSize?: string;
  terrainUtilization?: string;
  taxFactor?: string;
  latitude?: string;
  longitude?: string;
  municipality?: string;
  spvLegalStructure?: string;
  spvCompanyCode?: string;
}

export interface ShareholderFieldErrors {
  shareholderType?: string;
  customName?: string;
  ownership?: string;
}

/**
 * Option VALUES the validation gates key on — never the label text. Until the SDK 1.5 / `pa` CLI
 * 1.2.0 regeneration these were found by label in the generated choice map, which silently fell
 * back to the literal whenever the label changed ("AcquiredProject" → "Acquired Project").
 * `optionValue` only checks the value still exists in the generated model.
 */
function optionValue(map: Record<number, string>, value: number): number {
  if (!(value in map)) throw new Error(`Choice value ${value} is missing from the generated model`);
  return value;
}
/** `vsb_developmenttype` "Acquired Project". */
export const DEV_TYPE_ACQUIRED = optionValue(Vsb_projectsvsb_developmenttype, 952850000);
/** `vsb_shareholderentitiytype` "Third Party". */
export const SHAREHOLDER_TYPE_THIRD_PARTY = optionValue(Vsb_shareholderentitiiesvsb_shareholderentitiytype, 952850017);

export interface ValidationInput {
  project: GeneralDataProject;
  countryAreas: Lookup[];
  countryName: string | undefined;
}

/** Whether Terrain Size and the Germany-specific tax rule apply — by country NAME, not the
 *  canvas's magic option key "25" (`02-canvas-defects-and-decisions.md`, D-DATA-3: the canvas
 *  checks both; this build standardises on the name, which is the portable signal). */
function isGermany(countryName: string | undefined): boolean {
  return countryName === "Germany";
}
function isFrance(countryName: string | undefined): boolean {
  return countryName === "France";
}

/** Decimal-degree format, up to six decimal places — `isDecimal` tops out at three places. */
const SIX_DECIMAL_DEGREES = /^[+-]?\d+(?:\.\d{0,6})?$/;
function isSixDecimalDegrees(value: number): boolean {
  return SIX_DECIMAL_DEGREES.test(String(value));
}

export function validateProject(input: ValidationInput): FieldErrors {
  const { project: p, countryAreas, countryName } = input;
  const errors: FieldErrors = {};

  if (p.projectName.trim().length < 3) errors.projectName = MSG.projectNameTooShort;
  if (p.shortName.trim().length < 3) errors.shortName = MSG.shortNameTooShort;
  if (p.technology === null) errors.technology = MSG.technologyRequired;
  if (p.developmentType === null) errors.developmentType = MSG.developmentTypeRequired;
  if (!p.projectManagerId) errors.projectManager = MSG.projectManagerRequired;
  if (!p.countryId) errors.country = MSG.countryRequired;
  if (p.countryId && countryAreas.length > 0 && !p.countryAreaId) {
    errors.countryArea = MSG.areaRequired;
  }

  // Start Cluster is required only for Acquired Project (PGDS:2661 — the canvas requires field
  // only when Development Type = Acquired Project, not for any non-Own-Development type).
  if (p.developmentType === DEV_TYPE_ACQUIRED && p.startCluster === null) {
    errors.startCluster = MSG.startClusterRequired;
  }

  // Acquisition Date/Price required only for Acquired projects (03-validations §3; the price's
  // own gate is inferred from the section being conditionally shown for Acquired projects — see
  // this file's header comment).
  if (p.developmentType === DEV_TYPE_ACQUIRED) {
    if (!p.acquisitionDate) errors.acquisitionDate = MSG.acquisitionDateRequired;
    if (p.acquisitionPrice === null) {
      errors.acquisitionPrice = MSG.acquisitionPriceBlank;
    } else if (!inRange(String(p.acquisitionPrice), 0, 1_000_000_000)) {
      errors.acquisitionPrice = MSG.acquisitionPriceRange(1_000_000_000);
    }
  }

  // Terrain Size required only for Germany; one-decimal, 0.1-1000 (03-validations §3).
  if (isGermany(countryName)) {
    if (p.terrainSize === null) {
      errors.terrainSize = MSG.inputBlank;
    } else if (!isDecimal(String(p.terrainSize), { places: 1 })) {
      errors.terrainSize = MSG.numericOneDecimal;
    } else if (!inRange(String(p.terrainSize), 0.1, 1000)) {
      errors.terrainSize = MSG.terrainSizeRange(1000);
    }
  }

  // Tax Factor validated only for Germany, and only when a value has been provided (PGDS:3752–3803).
  if (isGermany(countryName) && p.taxFactor !== null) {
    if (!Number.isInteger(p.taxFactor)) errors.taxFactor = MSG.taxFactorNotInteger;
    else if (p.taxFactor < 0 || p.taxFactor > 1000) errors.taxFactor = MSG.taxFactorRange;
  }

  // Latitude/Longitude required, six-decimal, in range (03-validations §3). `domain/numeric.ts`'s
  // `isDecimal` only supports up to 3 decimal places, so six-decimal-degree format is checked
  // with a dedicated regex here instead.
  if (p.latitude === null) {
    errors.latitude = MSG.inputBlank;
  } else if (!isSixDecimalDegrees(p.latitude)) {
    errors.latitude = MSG.latitudeFormat;
  } else if (!inRange(String(p.latitude), -90, 90)) {
    errors.latitude = MSG.latitudeRange;
  }
  if (p.longitude === null) {
    errors.longitude = MSG.inputBlank;
  } else if (!isSixDecimalDegrees(p.longitude)) {
    errors.longitude = MSG.longitudeFormat;
  } else if (!inRange(String(p.longitude), -180, 180)) {
    errors.longitude = MSG.longitudeRange;
  }

  // Municipality required for Germany or France (03-validations §6, items 11).
  if ((isGermany(countryName) || isFrance(countryName)) && !p.municipality.trim()) {
    errors.municipality = MSG.inputBlank;
  }

  // SPV Legal Structure/Company Code: only required once an SPV Name has been entered, and only
  // for Germany (03-validations §3).
  if (p.spvName.trim() && isGermany(countryName)) {
    if (p.spvLegalStructure === null) errors.spvLegalStructure = MSG.spvLegalStructureRequired;
  }
  if (p.spvName.trim()) {
    if (p.spvCompanyCode === null) {
      errors.spvCompanyCode = MSG.spvCompanyCodeRequired;
    } else if (!isInteger(String(p.spvCompanyCode))) {
      errors.spvCompanyCode = MSG.spvCompanyCodeNotInteger;
    } else if (!inRange(String(p.spvCompanyCode), 1000, 9999)) {
      errors.spvCompanyCode = MSG.spvCompanyCodeRange;
    }
  }

  return errors;
}

/** The fraction (0-1) a shareholder row may still claim, excluding its own current value. */
export function remainingOwnership(rows: readonly ShareholderEntity[], excludeIndex: number): number {
  const others = rows.filter((_, i) => i !== excludeIndex);
  const used = sumNumbers(...others.map((r) => r.ownership ?? 0));
  return Math.max(0, round(1 - used, 4));
}

export function validateShareholder(
  row: ShareholderEntity,
  rows: readonly ShareholderEntity[],
  index: number,
): ShareholderFieldErrors {
  const errors: ShareholderFieldErrors = {};
  if (row.shareholderType === null) errors.shareholderType = MSG.inputBlank;
  if (row.shareholderType === SHAREHOLDER_TYPE_THIRD_PARTY && !row.customName.trim()) {
    errors.customName = MSG.customNameRequired;
  }
  const remaining = remainingOwnership(rows, index);
  if (row.ownership === null) {
    errors.ownership = MSG.inputBlank;
  } else if (!isDecimal(String(row.ownership * 100), { places: 2 })) {
    errors.ownership = "Percentage must be a number with two decimal places.";
  } else if (row.ownership <= 0 || round(row.ownership, 4) > round(remaining, 4)) {
    errors.ownership = MSG.ownershipRangeMessage(
      Number((row.ownership * 100).toFixed(2)), Number((remaining * 100).toFixed(2)),
    );
  }
  return errors;
}

/**
 * The 100%-total rule, with a small floating-point tolerance — `SOURCE DEFECT` fixed: the
 * canvas's `Sum(...) = 1` is exact equality over values stored as `Round(x/100, 4)`, which the
 * validations file itself flags as able to miss 1.0 by a rounding hair. `0.0005` is one part in
 * two thousand, far tighter than the UI's own two-decimal-percent display, so no real input is
 * newly accepted — only a result that LOOKS like 100.00% because of accumulated float error.
 */
export function ownershipTotalIsValid(rows: readonly ShareholderEntity[]): boolean {
  if (rows.length === 0) return false;
  const total = sumNumbers(...rows.map((r) => r.ownership ?? 0));
  return Math.abs(total - 1) < 0.0005;
}

export function ownershipTotalPercent(rows: readonly ShareholderEntity[]): number {
  return Math.round(sumNumbers(...rows.map((r) => r.ownership ?? 0)) * 10000) / 100;
}

/* ═══════════════════════════════════════════════════════════ the Save gate (§6) ══ */

export interface SaveGateInput {
  project: GeneralDataProject;
  shareholders: ShareholderEntity[];
  fieldErrors: FieldErrors;
  isDirty: boolean;
  canWrite: boolean;
}

/**
 * `03-validations.md` Section 6 — every condition the canvas `And(...)`s into the Save button's
 * `DisplayMode`, as one pure predicate instead of two drifted ~100-line copies
 * (`pcf_..._Save` and the dead `_Save_2`).
 */
export function canSave(input: SaveGateInput): boolean {
  const { shareholders, fieldErrors, isDirty, canWrite } = input;
  if (!canWrite || !isDirty) return false;
  if (Object.values(fieldErrors).some((e) => e !== undefined)) return false;
  if (shareholders.length === 0) return false;
  if (!ownershipTotalIsValid(shareholders)) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════ shareholder write plan ══ */

/** What changed in the shareholding list since it was loaded — a pure diff, no network. */
export function planShareholderChanges(
  original: readonly ShareholderEntity[],
  current: readonly ShareholderEntity[],
): { deletedIds: string[] } {
  const currentIds = new Set(current.map((r) => r.id).filter((id): id is string => id !== null));
  const deletedIds = original
    .map((r) => r.id)
    .filter((id): id is string => id !== null && !currentIds.has(id));
  return { deletedIds };
}

/** A fresh, empty shareholder row for the "Add" action. */
export function newShareholder(): ShareholderEntity {
  return { id: null, name: "", customName: "", ownership: null, shareholderType: null };
}

/* ══════════════════════════════════════════════════════════════════ small helpers ══ */

/** Numeric text field <-> `number | null`, used by every numeric input on this screen. */
export function parseNumericField(text: string): number | null {
  const value = parseNumber(text);
  return value === undefined ? null : value;
}
export function formatNumericField(value: number | null): string {
  return value === null ? "" : String(value);
}

export type { GeneralDataProject, ShareholderEntity, Lookup };
