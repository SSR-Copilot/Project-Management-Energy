/**
 * Project Generators Screen — unit tests.
 *
 * IDs are the spec's (`UT-GEN-nnn`). Every rule is tested through the pure function in
 * `rules.ts`, never through a render: band XL, weighted to Calculation as required.
 *
 * COVERAGE. This block used to carry two id lists headed "cases the spec lists that are
 * NOT here". They read as coverage and were not, in both directions: eleven of the thirteen
 * ids they named DO have their own `it()` below, and the two that did not sit on no `it()`
 * in this repo at all — so the lists are gone rather than patched. What is true, without an
 * id list to misread:
 *  - The pure cores of the Integration cases are pinned here under their own ids — the
 *    flow payload shapes, the apply-to-all id set, the cancellation ordering predicate, the
 *    status propagation plan. The HTTP wiring in `hooks.ts` has no test; it needs a mocked
 *    dataClient, not a rule test.
 *  - The predicates behind the Rendering cases are tested directly: `pageLock`,
 *    `permissionStateTone`, `overHeightLimit`. No case here renders a component.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import * as R from "./rules";
import { Vsb_generatorsvsb_countryavailability } from "@/generated/models/Vsb_generatorsModel";
import { Vsb_invertertypeinprojectsvsb_selectedinvertertypes } from "@/generated/models/Vsb_invertertypeinprojectsModel";
import { Vsb_substructuretypeinprojectsvsb_selectedsubstructuretypes } from "@/generated/models/Vsb_substructuretypeinprojectsModel";
import { Vsb_generatortypeinprojectsstatecode, Vsb_generatortypeinprojectsvsb_requestpermissionstate } from "@/generated/models/Vsb_generatortypeinprojectsModel";
import { Vsb_generatorinprojectsstatecode } from "@/generated/models/Vsb_generatorinprojectsModel";
import {
  pageLock, isPageLocked, isAvailableInCountry, isOrderable, buildDisplayName,
  projectCatalog, cascadeOptions, isDummySupplier, resolveModel,
  accumulatedIndex, wtgPriceBand, costPerWtg, generatorTypeTotals,
  pvCosts, inverterCosts, substructureCost,
  turbineIndex, buildTurbineNames, newTurbineHeights, editedTotalHeight,
  recomputeTypeFromChildren, planApplyToAll, pageCount,
  eligibleTypes, plantWtgTotals, plantPvCost, plantPvCapacity, plantStorageCapacity,
  commandBarState, blocksLastCapacity, isLastCapacityGuarded,
  heightLimitExceeded, canOverrideHeightLimit, heightBlocksSave, overHeightLimit,
  countOverHeightLimit,
  maxCostPerWtg, validateTurbineName, validateNumberOfGenerators, numberOfGeneratorsSaveable,
  validateCostPerWtg, validateEffectiveCapacity, validateEffectiveCapacityCanvasParity,
  validateEffectiveHubHeight, otherSupplierValid,
  validateTypeForm, canSaveType, canSaveTurbine,
  permissionStateLabel, permissionStateTone, pvRequestsPermission, pendingPermissionFields,
  buildGeneratorPermissionPayload, buildInverterPermissionPayload,
  buildSubstructurePermissionPayload, buildCancellationPayload, needsPermissionCancellation,
  planTurbineAllocation, isNewAllocationNeeded, planTurbineDeletion, planStatusToggle,
  MSG, GEN_INSTANCE_COL, GEN_TYPE_COL,
  TOTAL_CAPACITY_LABEL, catalogTotalHeight, TYPE_DETAIL_FIELD_LABELS,
  ADD_GENERATOR_LABEL, TURBINE_TABLE_LABELS, GENERATOR_TYPE_SAVED_BANNER,
  PV_PANEL_TITLES, PV_FIELD_LABELS, PV_SUPPLIER_PLACEHOLDER, PV_TYPE_COL,
  validatePvTypeForm, canSavePvType, pvSupplierOptions, buildPvTypeFields,
  GENERATOR_COMMAND_KEYS, capacityGuardReason, opexDependencyMessage, REPLACE_LABELS, REPLACE_MSG,
  replaceGeneratorTitle, replacePvTitle, replaceProgressText, replacePvProgressText,
  replaceSuccessText, replaceErrorText, replaceWtgSaveable, planReplaceLandLease,
  replacePvSaveable, PV_BRIDGE_MISSING, REPLACE_PHASES,
  type CatalogModel, type ProjectedModel, type GeneratorsProject, type GeneratorTypeRow,
  type TurbineRow, type SimpleTypeRow, type TypeFormState, type PvTypeFormState,
} from "./rules";

/* ═══════════════════════════════════════════════════════════════════ fixtures ═══ */

const model = (over: Partial<CatalogModel> = {}): CatalogModel => ({
  id: "g1",
  name: "V150",
  displayName: "Vestas V150-5.6",
  supplier: "Vestas",
  turbineType: "V150",
  hubHeight: 148,
  rotorDiameter: 150,
  specificCapacity: 5.6,
  earliestPhaseout: "2035-01-01",
  countryAvailability: [1, 2],
  foundationCostIncluded: true,
  additionalFoundationCost: 0,
  prices: [1_000_000, 950_000, 900_000, 850_000, 800_000],
  totalHeight: 223,
  ...over,
});

const projected = (over: Partial<ProjectedModel> = {}): ProjectedModel => ({
  ...model(),
  isAvailable: true,
  availability: "available",
  fullDisplayName: "Vestas V150-5.6 - available",
  ...over,
});

const project = (over: Partial<GeneratorsProject> = {}): GeneratorsProject => ({
  id: "p1",
  projectIdText: "DE-0001",
  projectName: "Windpark Nord",
  shortName: "WPN",
  countryId: "c1",
  countryOptionValue: 1,
  isoCurrencyCode: "EUR",
  totalCapacity: 22.4,
  fid: "2030-06-15",
  endDate: "2055-12-31",
  projectStartDate: "2026-01-01",
  projectManagerId: "pm-1",
  projectManagerEmail: "pm@vsb.energy",
  owningBusinessUnitId: "bu-1",
  ...over,
});

const genType = (over: Partial<GeneratorTypeRow> = {}): GeneratorTypeRow => ({
  id: "t1",
  name: "WTG type",
  generatorId: "g1",
  generatorDisplayName: "Vestas V150-5.6",
  numberOfGenerators: 4,
  costPerWtg: 900_000,
  generatorsCost: 3_600_000,
  generatorsCapacity: 22.4,
  requestPermissionState: null,
  flowRunId: null,
  flowApprovalId: null,
  status: CHOICE_PLANT.status.active,
  specificCapacity: 5.6,
  ...over,
});

const turbine = (index: number, over: Partial<TurbineRow> = {}): TurbineRow => ({
  id: `w${index}`,
  name: `WTG WPN_${index}`,
  typeId: "t1",
  index,
  effectiveCapacity: 5.6,
  effectiveHubHeight: null,
  effectiveHubHeightChanged: false,
  foundationPlinth: 0,
  hubHeightExclPlinth: 148,
  totalHeight: 223,
  status: CHOICE_PLANT.status.active,
  ...over,
});

const simple = (over: Partial<SimpleTypeRow> = {}): SimpleTypeRow => ({
  id: "s1",
  name: "Row",
  supplier: "Acme",
  otherSupplier: null,
  capacity: null,
  cost: null,
  moduleLabel: null,
  degradation1stYear: null,
  degradationRemainingYears: null,
  requestPermissionState: null,
  flowRunId: null,
  flowApprovalId: null,
  status: CHOICE_PLANT.status.active,
  ...over,
});

const pvForm = (over: Partial<PvTypeFormState> = {}): PvTypeFormState => ({
  moduleLabel: "JA Solar 550W",
  capacity: "12.50",
  supplier: "JA Solar",
  degradation1stYear: "",
  degradationRemainingYears: "",
  dirty: new Set<string>(),
  ...over,
});

const cmdCtx = (over: {
  canEdit?: boolean;
  project?: GeneratorsProject | null;
  selection?: Partial<Parameters<typeof commandBarState>[0]["selection"]>;
  counts?: Partial<{ storage: number; hydrogen: number; substation: number }>;
  deletePermission?: Parameters<typeof commandBarState>[0]["deletePermission"];
  editPermission?: boolean;
} = {}) => ({
  canEdit: over.canEdit ?? true,
  project: over.project === undefined ? project() : over.project,
  selection: {
    generatorType: null, pvModuleType: null, inverterType: null, substructureType: null,
    storageType: null, hydrogenType: null, substationType: null,
    ...over.selection,
  },
  counts: { storage: 0, hydrogen: 0, substation: 0, ...over.counts },
  deletePermission: over.deletePermission ?? {
    wtg: true, pv: true, inverter: true, substructure: true,
  },
  editPermission: over.editPermission ?? true,
});

/* ══════════════════════════════════════════════════════════════ page lock ════ */

describe("page lock", () => {
  it("UT-GEN-001 lists '• General' when Project ID is blank", () => {
    const p = project({ projectIdText: null });
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(p)).toContain("• General");
  });

  it("UT-GEN-002 lists '• Milestones' when Project Start Date is blank", () => {
    // The banner's own predicate is on End Date; the bullet's is on Start Date. Both
    // blank is the only state where the banner shows AND the Milestones bullet appears.
    const p = project({ endDate: null, projectStartDate: null });
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(p)).toEqual(["• Milestones"]);
  });

  it("is unlocked when both prerequisites are present", () => {
    expect(isPageLocked(project())).toBe(false);
    expect(pageLock(project())).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════ command bar ════ */

describe("command bar", () => {
  it("UT-GEN-003 Add items are disabled without an End Date", () => {
    const st = commandBarState(cmdCtx({ project: project({ endDate: null }) }));
    expect(st.addWTGType.enabled).toBe(false);
    expect(st.addPVType.enabled).toBe(false);
    expect(st.addOthers.enabled).toBe(false);
  });

  it("UT-GEN-004 Delete items require DeletePermission on the concrete row", () => {
    const st = commandBarState(
      cmdCtx({
        selection: { generatorType: genType() },
        deletePermission: { wtg: false },
      }),
    );
    expect(st.deleteGeneratorType.visible).toBe(true);
    expect(st.deleteGeneratorType.enabled).toBe(false);
  });

  it("UT-GEN-005 Deactivate requires a Project Start Date", () => {
    const st = commandBarState(
      cmdCtx({
        project: project({ projectStartDate: null }),
        selection: { generatorType: genType() },
      }),
    );
    expect(st.deactivateGenerator.visible).toBe(true);
    expect(st.deactivateGenerator.enabled).toBe(false);
  });

  it("UT-GEN-032 Add BESS is disabled once a storage row exists", () => {
    const st = commandBarState(cmdCtx({ counts: { storage: 1 } }));
    expect(st.addStorage.enabled).toBe(false);
    const withSelection = commandBarState(
      cmdCtx({ counts: { storage: 1 }, selection: { storageType: simple() } }),
    );
    expect(withSelection.addStorage.enabled).toBe(true);
    expect(withSelection.addStorage.label).toBe("Edit BESS");
  });

  it("SOURCE DEFECT (ambiguity 5): addSubstation ignores CanEditSelectedProject", () => {
    const ctx = cmdCtx({ canEdit: false });
    expect(commandBarState(ctx).addSubstation.enabled).toBe(true);
    expect(commandBarState(ctx).addStorage.enabled).toBe(false);
    // …and the opt-in fix conjoins canEdit like every sibling item.
    expect(
      commandBarState(ctx, { fixSubstationPermission: true }).addSubstation.enabled,
    ).toBe(false);
  });

  it("activate/deactivate visibility follows the type status", () => {
    const active = commandBarState(cmdCtx({ selection: { generatorType: genType() } }));
    expect(active.activateGenerator.visible).toBe(false);
    expect(active.deactivateGenerator.visible).toBe(true);
    const inactive = commandBarState(
      cmdCtx({ selection: { generatorType: genType({ status: CHOICE_PLANT.status.inactive }) } }),
    );
    expect(inactive.activateGenerator.visible).toBe(true);
    expect(inactive.deactivateGenerator.visible).toBe(false);
  });

  it("inverter and substructure Add items ship hidden (ItemVisible: false)", () => {
    const st = commandBarState(cmdCtx());
    expect(st.addInverterType.visible).toBe(false);
    expect(st.addSubstructureType.visible).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════ catalogue ════ */

describe("catalogue", () => {
  it("UT-GEN-006 excludes models phasing out before FID", () => {
    expect(isOrderable(model({ earliestPhaseout: "2029-01-01" }), "2030-06-01")).toBe(false);
    expect(isOrderable(model({ earliestPhaseout: "2031-01-01" }), "2030-06-01")).toBe(true);
  });

  it("UT-GEN-007 is empty when FID is blank", () => {
    expect(projectCatalog([model()], { countryOptionValue: 1, fidDate: undefined })).toEqual([]);
    expect(isOrderable(model(), undefined)).toBe(false);
  });

  it("UT-GEN-008 country availability flag and label suffix", () => {
    const m = model({ countryAvailability: [7, 9] });
    expect(isAvailableInCountry(m, 9)).toBe(true);
    expect(isAvailableInCountry(m, 3)).toBe(false);
    expect(isAvailableInCountry(model({ countryAvailability: [] }), 9)).toBe(false);
    expect(buildDisplayName(m, true)).toBe("Vestas V150-5.6 - available");
    expect(buildDisplayName(m, false)).toBe("Vestas V150-5.6 - not available");
  });

  it("UT-GEN-009 toggle off shows only unavailable models", () => {
    const models: ProjectedModel[] = [
      projected({ id: "a", supplier: "In-1", isAvailable: true }),
      projected({ id: "b", supplier: "In-2", isAvailable: true }),
      projected({ id: "c", supplier: "Out-1", isAvailable: false }),
      projected({ id: "d", supplier: "Out-2", isAvailable: false }),
      projected({ id: "e", supplier: "Out-3", isAvailable: false }),
    ];
    expect(
      cascadeOptions(models, { inCountry: false, supplier: null, turbineType: null }).suppliers,
    ).toEqual(["Out-1", "Out-2", "Out-3"]);
    expect(
      cascadeOptions(models, { inCountry: true, supplier: null, turbineType: null }).suppliers,
    ).toEqual(["In-1", "In-2"]);
  });

  it("UT-GEN-010 the turbine-type cascade narrows the hub-height list", () => {
    const mk = (t: string, h: number) =>
      projected({ id: `${t}-${h}`, supplier: "S", turbineType: t, hubHeight: h });
    const models = [
      mk("T1", 100), mk("T1", 120), mk("T1", 140),
      mk("T2", 90), mk("T2", 110), mk("T2", 130),
    ];
    const afterSupplier = cascadeOptions(models, {
      inCountry: true, supplier: "S", turbineType: null,
    });
    expect(afterSupplier.turbineTypes).toEqual(["T1", "T2"]);
    expect(afterSupplier.hubHeights).toEqual([]);
    const afterType = cascadeOptions(models, {
      inCountry: true, supplier: "S", turbineType: "T1",
    });
    expect(afterType.hubHeights).toEqual([100, 120, 140]);
  });

  it("UT-GEN-011 a Dummy supplier bypasses hub height and takes the first model", () => {
    expect(isDummySupplier("Dummy Nordex")).toBe(true);
    expect(isDummySupplier("Nordex")).toBe(false);
    const models = [
      projected({ id: "d1", supplier: "Dummy X", turbineType: "T", hubHeight: 90 }),
      projected({ id: "d2", supplier: "Dummy X", turbineType: "T", hubHeight: 120 }),
    ];
    // No hub height selected, yet the model resolves — the height predicate is dropped.
    expect(
      resolveModel(models, { supplier: "Dummy X", turbineType: "T", hubHeight: null })?.id,
    ).toBe("d1");
    // A non-Dummy supplier with no height resolves nothing.
    const real = [projected({ supplier: "S", turbineType: "T", hubHeight: 120 })];
    expect(resolveModel(real, { supplier: "S", turbineType: "T", hubHeight: null })).toBeUndefined();
    // …and the `Hubheight` validation row is forced valid for a Dummy supplier.
    const form: TypeFormState = {
      supplier: "Dummy X", turbineType: "T", hubHeight: null, revisedHubHeight: "",
      numberOfGenerators: "2", cost: "900000", dirty: new Set(["supplier"]),
    };
    expect(
      validateTypeForm(form, { isoCurrencyCode: "EUR", derivedCostPerWtg: 1 }).Hubheight,
    ).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════ pricing ════ */

describe("pricing", () => {
  it("UT-GEN-012 cost band for 3 turbines, foundation included", () => {
    const m = model({
      prices: [1_000_000, 950_000, 900_000, 850_000, 800_000],
      foundationCostIncluded: true,
    });
    expect(costPerWtg({ model: m, count: 3, accumulatedIndex: 1.1 })).toBeCloseTo(
      900_000 * 1.1, 6,
    );
  });

  it("UT-GEN-013 the cost band saturates at 5 or more", () => {
    const m = model();
    expect(wtgPriceBand(m, 5)).toBe(800_000);
    expect(wtgPriceBand(m, 9)).toBe(800_000);
    expect(wtgPriceBand(m, 200)).toBe(800_000);
    expect(costPerWtg({ model: m, count: 9, accumulatedIndex: 1 })).toBe(800_000);
    // 1..4 pick their own band.
    expect(wtgPriceBand(m, 1)).toBe(1_000_000);
    expect(wtgPriceBand(m, 4)).toBe(850_000);
    // `Switch` has no arm for 0, so it falls through to the '5 WTG price' default.
    expect(wtgPriceBand(m, 0)).toBe(800_000);
  });

  it("UT-GEN-014 additional foundation cost is added when not included", () => {
    const m = model({ foundationCostIncluded: false, additionalFoundationCost: 50_000 });
    expect(costPerWtg({ model: m, count: 2, accumulatedIndex: 1.1 })).toBeCloseTo(
      (950_000 + 50_000) * 1.1, 6,
    );
  });

  it("UT-GEN-914 M4 canvas behaviour: the foundation cost is added even when 'Foundation cost included' is Yes; the boolean reading is the twin", () => {
    const m = model({ foundationCostIncluded: true, additionalFoundationCost: 50_000 });
    // live (canvas): Text(Yes/No) is never "Yes" → (950 000 + 50 000) × 1.1
    expect(costPerWtg({ model: m, count: 2, accumulatedIndex: 1.1 })).toBeCloseTo((950_000 + 50_000) * 1.1, 6);
    // twin (NOT live): an included foundation adds nothing
    expect(R.costPerWtgBooleanReading({ model: m, count: 2, accumulatedIndex: 1.1 })).toBeCloseTo(950_000 * 1.1, 6);
    expect(R.costPerWtgBooleanReading({ model: { ...m, foundationCostIncluded: false }, count: 2, accumulatedIndex: 1.1 }))
      .toBeCloseTo((950_000 + 50_000) * 1.1, 6);
  });

  it("UT-GEN-015 the accumulated index interpolates on the FID month", () => {
    expect(accumulatedIndex(1.12, 1.0, 6)).toBeCloseTo(1.06, 10);
    expect(accumulatedIndex(1.12, 1.0, 12)).toBeCloseTo(1.12, 10);
    expect(accumulatedIndex(1.12, 1.0, 1)).toBeCloseTo(1.01, 10);
    // Blank rows coerce to 0, as `Value(Blank())` does.
    expect(accumulatedIndex(null, null, 6)).toBe(0);
  });

  it("UT-GEN-016 generator type totals", () => {
    expect(
      generatorTypeTotals({ count: 4, costPerWtg: 900_000, specificCapacity: 5.6 }),
    ).toEqual({ generatorsCost: 3_600_000, generatorsCapacity: 22.4 });
  });

  it("UT-GEN-017 a blank specific capacity counts as 0", () => {
    expect(
      generatorTypeTotals({ count: 3, costPerWtg: 1, specificCapacity: undefined })
        .generatorsCapacity,
    ).toBe(0);
    expect(
      generatorTypeTotals({ count: 3, costPerWtg: 1, specificCapacity: null })
        .generatorsCapacity,
    ).toBe(0);
  });

  it("UT-GEN-029 Plant PV cost sums three families", () => {
    expect(
      plantPvCost({
        pv: [simple({ cost: 100_000 })],
        inverters: [simple({ cost: 40_000 })],
        substructures: [simple({ cost: 25_000 })],
      }),
    ).toBe(165_000);
    expect(plantPvCost({ pv: [], inverters: [], substructures: [] })).toBe(0);
  });

  it("UT-GEN-030 inverter cost per unit derivation", () => {
    expect(
      inverterCosts({ deviceCostInverter: 300, nominalPowerKw: 2_500, numberOfInverters: 4 }),
    ).toEqual({ costPerInverter: 750, typeCost: 3_000 });
  });

  it("PV and substructure device-cost derivations", () => {
    expect(pvCosts({ deviceCostModules: 300, capacityMwp: 12 })).toEqual({
      costPerPower: 300, cost: 3_600,
    });
    expect(
      substructureCost({
        mounting: "Tracker", deviceCostFix: 100, deviceCostTracker: 180,
        plantPvCapacityMwp: 20,
      }),
    ).toBe(3_600);
    expect(
      substructureCost({
        mounting: "Fixed", deviceCostFix: 100, deviceCostTracker: 180, plantPvCapacityMwp: 20,
      }),
    ).toBe(2_000);
    // The canvas `Switch` default arm is 0 (W7, D27) — not the fix rate.
    expect(
      substructureCost({ mounting: null, deviceCostFix: 100, deviceCostTracker: 180, plantPvCapacityMwp: 20 }),
    ).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════ turbines ════ */

describe("turbine instances", () => {
  it("UT-GEN-018 names continue from the max existing index", () => {
    expect(
      buildTurbineNames({
        shortName: "ABC",
        existing: [turbine(1), turbine(2), turbine(7)],
        count: 2,
      }),
    ).toEqual(["WTG ABC_8", "WTG ABC_9"]);
  });

  it("UT-GEN-019 names start at 1 when none exist", () => {
    expect(buildTurbineNames({ shortName: "ABC", existing: [], count: 2 })).toEqual([
      "WTG ABC_1", "WTG ABC_2",
    ]);
  });

  it("the index is the trailing segment after the last underscore", () => {
    expect(turbineIndex("WTG ABC_12")).toBe(12);
    expect(turbineIndex("WTG A_B_3")).toBe(3);
    expect(Number.isNaN(turbineIndex(null))).toBe(true);
  });

  it("UT-GEN-020 new-turbine total height from the catalogue hub height", () => {
    expect(
      newTurbineHeights({
        selectedHeight: 140, typedHubHeight: 999, catalogHubHeight: 140, rotorDiameter: 150,
      }),
    ).toEqual({ totalHeight: 215, hubHeightExclPlinth: 140 });
  });

  it("UT-GEN-020b selectedHeight 0 falls back to the typed revised hub height", () => {
    expect(
      newTurbineHeights({
        selectedHeight: 0, typedHubHeight: 140, catalogHubHeight: 999, rotorDiameter: 150,
      }),
    ).toEqual({ totalHeight: 215, hubHeightExclPlinth: 140 });
  });

  it("UT-GEN-021 an edited turbine's total height includes the plinth", () => {
    expect(
      editedTotalHeight({ hubHeight: 138, foundationPlinth: 2, rotorDiameter: 150 }),
    ).toBe(215);
  });

  it("UT-GEN-034 the type is re-derived from its children", () => {
    const derived = recomputeTypeFromChildren({
      children: [
        { effectiveCapacity: 5.6 }, { effectiveCapacity: 5.6 },
        { effectiveCapacity: 5.6 }, { effectiveCapacity: 4.0 },
      ],
      model: model(),
      accumulatedIndex: 1,
    });
    expect(derived.numberOfGenerators).toBe(4);
    expect(derived.generatorsCapacity).toBeCloseTo(20.8, 10);
    expect(derived.costPerWtg).toBe(850_000);
  });

  it("UT-GEN-039 cost per WTG is forced to 0 at zero turbines", () => {
    const derived = recomputeTypeFromChildren({
      children: [], model: model(), accumulatedIndex: 1.1,
    });
    expect(derived.numberOfGenerators).toBe(0);
    expect(derived.costPerWtg).toBe(0);
    expect(derived.generatorsCost).toBe(0);
    expect(derived.generatorsCapacity).toBe(0);
  });

  it("UT-GEN-033 apply-to-all targets every sibling in one patch set", () => {
    const plan = planApplyToAll({
      siblings: [turbine(1), turbine(2), turbine(3), turbine(4), turbine(5)],
      applyCapacity: true, applyHubHeight: false, applyFoundationPlinth: false,
      effectiveCapacity: 5.9, hubHeight: null, foundationPlinth: null,
    });
    expect(plan?.ids).toEqual(["w1", "w2", "w3", "w4", "w5"]);
    expect(plan?.fields).toEqual({ [GEN_INSTANCE_COL.effectiveCapacity]: 5.9 });
    // Nothing checked ⇒ no bulk update at all.
    expect(
      planApplyToAll({
        siblings: [turbine(1)], applyCapacity: false, applyHubHeight: false,
        applyFoundationPlinth: false, effectiveCapacity: 1, hubHeight: 1,
        foundationPlinth: 1,
      }),
    ).toBeNull();
  });

  it("UT-GEN-053 an empty type still has one page", () => {
    expect(pageCount(0, 30)).toBe(1);
    expect(pageCount(1, 30)).toBe(1);
    expect(pageCount(30, 30)).toBe(1);
    expect(pageCount(31, 30)).toBe(2);
    expect(pageCount(90, 30)).toBe(3);
  });
});

/* ══════════════════════════════════════════════════════════════ roll-ups ════ */

describe("project roll-ups", () => {
  it("UT-GEN-022 the roll-up ignores pending and inactive types", () => {
    const types = [
      genType({
        id: "a", generatorsCapacity: 10, generatorsCost: 1,
        requestPermissionState: CHOICE_PLANT.requestPermissionState.approved,
      }),
      genType({
        id: "b", generatorsCapacity: 5, generatorsCost: 2,
        requestPermissionState: CHOICE_PLANT.requestPermissionState.pending,
      }),
      genType({
        id: "c", generatorsCapacity: 3, generatorsCost: 4,
        requestPermissionState: null, status: CHOICE_PLANT.status.inactive,
      }),
    ];
    expect(plantWtgTotals(types).capacityMW).toBe(10);
    expect(plantWtgTotals(types).costEUR).toBe(1);
    expect(eligibleTypes(types).map((t) => t.id)).toEqual(["a"]);
  });

  it("UT-GEN-023 a blank permission state is included", () => {
    const types = [genType({ requestPermissionState: null, generatorsCapacity: 7 })];
    expect(plantWtgTotals(types).capacityMW).toBe(7);
  });

  it("declined and canceled types are excluded", () => {
    for (const st of [
      CHOICE_PLANT.requestPermissionState.declined,
      CHOICE_PLANT.requestPermissionState.canceled,
    ]) {
      expect(
        plantWtgTotals([genType({ requestPermissionState: st, generatorsCapacity: 9 })])
          .capacityMW,
      ).toBe(0);
    }
  });

  it("UT-GEN-031 the storage roll-up sums its rows", () => {
    expect(
      plantStorageCapacity([simple({ capacity: 5 }), simple({ capacity: 7 })]),
    ).toBe(12);
    expect(plantPvCapacity([simple({ capacity: 3.5 }), simple({ capacity: 1.5 })])).toBe(5);
  });
});

/* ═══════════════════════════════════════════════════ guards and gating ════ */

describe("last-capacity guard", () => {
  it("UT-GEN-035 blocks a type delete that would zero the project's capacity", () => {
    expect(blocksLastCapacity(project({ totalCapacity: 12 }), 12)).toBe(true);
    expect(blocksLastCapacity(project({ totalCapacity: 12 }), 5)).toBe(false);
  });

  it("UT-GEN-036 is not applied to inverter or substructure (ambiguity 6)", () => {
    expect(isLastCapacityGuarded("inverter")).toBe(false);
    expect(isLastCapacityGuarded("substructure")).toBe(false);
    for (const f of ["wtg", "pv", "storage", "hydrogen", "substation"] as const) {
      expect(isLastCapacityGuarded(f)).toBe(true);
    }
  });
});

describe("height limitation", () => {
  it("UT-GEN-044 a non-PM cannot save over the height limit", () => {
    const planning = { isHeightLimitationForWtg: true, heightLimitation: 200 };
    expect(heightLimitExceeded(planning, 215)).toBe(true);
    expect(canOverrideHeightLimit(project(), "someone-else")).toBe(false);
    expect(
      heightBlocksSave({ planning, totalHeight: 215, project: project(), entraObjectId: "x" }),
    ).toBe(true);
    expect(
      canSaveType({
        errors: {
          Supplier: null, TurbineType: null, Hubheight: null, RevisedHubheight: null,
          NumberOfGenerators: null, Cost: null,
        },
        heightBlocked: true,
      }),
    ).toBe(false);
  });

  it("UT-GEN-045 the project manager may override", () => {
    const planning = { isHeightLimitationForWtg: true, heightLimitation: 200 };
    expect(canOverrideHeightLimit(project(), "pm-1")).toBe(true);
    expect(
      heightBlocksSave({ planning, totalHeight: 215, project: project(), entraObjectId: "pm-1" }),
    ).toBe(false);
  });

  it("UT-GEN-046 no gate when the limitation flag is off", () => {
    expect(
      heightLimitExceeded({ isHeightLimitationForWtg: false, heightLimitation: 200 }, 215),
    ).toBe(false);
    expect(
      heightLimitExceeded({ isHeightLimitationForWtg: true, heightLimitation: null }, 215),
    ).toBe(false);
    expect(heightLimitExceeded(null, 215)).toBe(false);
  });

  it("UT-GEN-056 the info icon marks only the over-limit turbines", () => {
    const planning = { isHeightLimitationForWtg: true, heightLimitation: 200 };
    expect(overHeightLimit(planning, 190)).toBe(false);
    expect(overHeightLimit(planning, 210)).toBe(true);
    expect(
      countOverHeightLimit(planning, [turbine(1, { totalHeight: 190 }), turbine(2, { totalHeight: 210 })]),
    ).toBe(1);
    // The row tag/limitation tag do NOT read the flag, only the limit itself.
    expect(overHeightLimit({ isHeightLimitationForWtg: false, heightLimitation: 200 }, 210)).toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════════ validation ════ */

describe("validation", () => {
  it("UT-GEN-047 a duplicate turbine index is rejected", () => {
    expect(
      validateTurbineName("4", { existingIndices: [1, 2, 4], currentIndex: 2 }),
    ).toBe(MSG.turbineNameDuplicate);
    // Keeping your own index is fine.
    expect(
      validateTurbineName("4", { existingIndices: [1, 2, 4], currentIndex: 4 }),
    ).toBeNull();
    // A NEW turbine (currentIndex -1) can never keep an existing index.
    expect(
      validateTurbineName("4", { existingIndices: [4], currentIndex: null }),
    ).toBe(MSG.turbineNameDuplicate);
  });

  it("UT-GEN-048 the turbine name must be a non-zero integer", () => {
    expect(validateTurbineName("0", { existingIndices: [] })).toBe(MSG.turbineNameBlank);
    expect(validateTurbineName("", { existingIndices: [] })).toBe(MSG.turbineNameBlank);
    expect(validateTurbineName("3.5", { existingIndices: [] })).toBe(MSG.turbineNameNumeric);
    expect(validateTurbineName("abc", { existingIndices: [] })).toBe(MSG.turbineNameNumeric);
    expect(validateTurbineName("3", { existingIndices: [] })).toBeNull();
  });

  it("UT-GEN-049 number of generators is range-checked 0…200", () => {
    expect(validateNumberOfGenerators("201")).not.toBeNull();
    expect(validateNumberOfGenerators("200")).toBeNull();
    // `gblAppResx.Numeric` (D27 corrects the turbine-name text the code used).
    expect(validateNumberOfGenerators("4.5")).toBe("Numeric value without decimals");
    // 0 passes the field check but the validation ROW additionally demands > 0.
    expect(validateNumberOfGenerators("0")).toBeNull();
    expect(numberOfGeneratorsSaveable("0")).toBe(false);
    expect(numberOfGeneratorsSaveable("4")).toBe(true);
  });

  it("UT-GEN-050 the cost cap depends on the project currency", () => {
    expect(maxCostPerWtg("EUR")).toBe(15_000_000);
    expect(maxCostPerWtg("USD")).toBe(75_000_000);
    expect(maxCostPerWtg(null)).toBe(75_000_000);
    expect(validateCostPerWtg("60000000", "USD")).toBeNull();
    expect(validateCostPerWtg("60000000", "EUR")).not.toBeNull();
    expect(validateCostPerWtg("900000.123", "EUR")).toBe(MSG.numericTwoDecimals);
    expect(validateCostPerWtg("", "EUR")).toBe(MSG.inputBlank);
  });

  it("UT-GEN-051 Save needs every row valid; the Cost row reads the DERIVED cost (S7, D27)", () => {
    // The hidden Cost field is always "" — it must not block Save (the code's blocking defect).
    const form: TypeFormState = {
      supplier: "Vestas", turbineType: "V150", hubHeight: 148, revisedHubHeight: "",
      numberOfGenerators: "4", cost: "", dirty: new Set<string>(),
    };
    const errors = validateTypeForm(form, { isoCurrencyCode: "EUR", derivedCostPerWtg: 900_000 });
    expect(Object.values(errors).every((e) => e === null)).toBe(true);
    expect(canSaveType({ errors, heightBlocked: false })).toBe(true);
    // A derived cost of 0 (no inflation row, or no price) keeps Save disabled, as `locGeneratorCostsPerWtg > 0`.
    const zero = validateTypeForm(form, { isoCurrencyCode: "EUR", derivedCostPerWtg: 0 });
    expect(canSaveType({ errors: zero, heightBlocked: false })).toBe(false);
  });

  it("UT-GEN-052 effective capacity range-checks ITS OWN input (regression)", () => {
    // Corrected rule: 6.0 exceeds a 5.6 specific capacity.
    expect(validateEffectiveCapacity("6.0", 5.6)).toMatch(/between 0.01 and 5.6/);
    expect(validateEffectiveCapacity("5.6", 5.6)).toBeNull();
    expect(validateEffectiveCapacity("0", 5.6)).not.toBeNull();
    // SOURCE DEFECT (ambiguity 4): the shipped label ranges a Production-screen control,
    // so the same 6.0 passes as long as that unrelated field happens to be in range.
    expect(validateEffectiveCapacityCanvasParity("6.0", 5.6, "3.2")).toBeNull();
  });

  it("effective hub height is two decimals within 1…200", () => {
    expect(validateEffectiveHubHeight("148.25")).toBeNull();
    expect(validateEffectiveHubHeight("148.256")).toBe(MSG.numericTwoDecimals);
    expect(validateEffectiveHubHeight("201")).toBe(MSG.hubHeightRange);
    expect(validateEffectiveHubHeight("0")).toBe(MSG.hubHeightRange);
  });

  it("the 'Other supplier' rows are valid only with a catalogue supplier and no free text", () => {
    expect(otherSupplierValid({ supplier: "Acme", otherSupplier: null })).toBe(true);
    expect(otherSupplierValid({ supplier: "Acme", otherSupplier: "Other Co" })).toBe(false);
    expect(otherSupplierValid({ supplier: null, otherSupplier: null })).toBe(false);
  });

  it("the turbine save gate needs a name, capacity, hub height and one dirty field", () => {
    const base = {
      existingIndices: [1, 2], currentIndex: null as number | null,
      specificCapacity: 5.6, heightBlocked: false,
    };
    expect(
      canSaveTurbine({
        ...base,
        form: {
          nameIndex: "3", effectiveCapacity: "5.6", effectiveHubHeight: "148",
          foundationPlinth: "0", dirty: new Set(["nameIndex"]),
        },
      }),
    ).toBe(true);
    expect(
      canSaveTurbine({
        ...base,
        form: {
          nameIndex: "3", effectiveCapacity: "", effectiveHubHeight: "148",
          foundationPlinth: "", dirty: new Set(["nameIndex"]),
        },
      }),
    ).toBe(false);
    expect(
      canSaveTurbine({
        ...base,
        form: {
          nameIndex: "3", effectiveCapacity: "5.6", effectiveHubHeight: "148",
          foundationPlinth: "", dirty: new Set<string>(),
        },
      }),
    ).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════ permissions ════ */

describe("permissions and flows", () => {
  it("UT-GEN-054 the permission-state chip colours", () => {
    expect(permissionStateTone(CHOICE_PLANT.requestPermissionState.approved)).toBe("success");
    expect(permissionStateTone(CHOICE_PLANT.requestPermissionState.declined)).toBe("error");
    expect(permissionStateTone(CHOICE_PLANT.requestPermissionState.pending)).toBe("warning");
    expect(permissionStateTone(CHOICE_PLANT.requestPermissionState.canceled)).toBe("disabled");
    expect(permissionStateTone(null)).toBe("disabled");
    expect(permissionStateLabel(CHOICE_PLANT.requestPermissionState.pending)).toBe(
      "Permission Pending",
    );
    expect(permissionStateLabel(null)).toBeNull();
  });

  it("UT-GEN-025 the out-of-country generator payload carries ModuleType 952850000", () => {
    const payload = buildGeneratorPermissionPayload(project(), "type-1", "g1");
    expect(payload).toEqual({
      ProjectGuid: "p1",
      ProjectId: "DE-0001",
      ProjectName: "Windpark Nord",
      ShortName: "WPN",
      ProjectManagerEmail: "pm@vsb.energy",
      ModuleType: 952850000,
      GeneratorTypeInProject: "type-1",
      Generator: "g1",
    });
  });

  it("UT-GEN-027 the inverter payload uses ModuleType 952850002", () => {
    const payload = buildInverterPermissionPayload(project(), "inv-1");
    expect(payload.ModuleType).toBe(952850002);
    expect(payload).toHaveProperty("InverterTypeInProject", "inv-1");
    const sub = buildSubstructurePermissionPayload(project(), "sub-1");
    expect(sub.ModuleType).toBe(952850003);
    expect(sub).toHaveProperty("SubstructureTypeInProject", "sub-1");
  });

  it("UT-GEN-028 a PV save never calls the flow", () => {
    // The call site is commented out and short-circuited by `If(true = false, …)`.
    expect(pvRequestsPermission()).toBe(false);
  });

  it("UT-GEN-026 the flow response stamps the pending state", () => {
    expect(pendingPermissionFields({ runId: "r1", approvalId: "a1" })).toEqual({
      [GEN_TYPE_COL.requestPermissionState]: CHOICE_PLANT.requestPermissionState.pending,
      [GEN_TYPE_COL.flowRunId]: "r1",
      [GEN_TYPE_COL.flowApprovalId]: "a1",
    });
  });

  it("UT-GEN-040/041 cancellation is issued only when a flow run is open", () => {
    expect(needsPermissionCancellation({ flowRunId: "run-1" })).toBe(true);
    expect(needsPermissionCancellation({ flowRunId: null })).toBe(false);
    expect(needsPermissionCancellation({ flowRunId: "" })).toBe(false);
    expect(
      buildCancellationPayload("wtg", {
        id: "t1", name: "Vestas V150-5.6", flowRunId: "r1", flowApprovalId: "a1",
      }),
    ).toEqual({
      ModuleTypeGuid: "t1",
      ModuleType: 952850000,
      Name: "Vestas V150-5.6",
      FlowRunId: "r1",
      FlowApprovalId: "a1",
    });
    expect(
      buildCancellationPayload("substructure", {
        id: "s1", name: "x", flowRunId: "r", flowApprovalId: "a",
      }).ModuleType,
    ).toBe(952850003);
  });
});

/* ═══════════════════════════════════════════════════ land lease and status ════ */

describe("land lease allocation and cascades", () => {
  it("UT-GEN-043 allocation targets only AllWTGAllocated = Yes costs", () => {
    const plans = planTurbineAllocation({
      costs: [
        { id: "c1", landOwner: "Meyer", description: "Field A", allWtgAllocated: true },
        { id: "c2", landOwner: "Schmidt", description: "Field B", allWtgAllocated: false },
        { id: "c3", landOwner: "Braun", description: "Field C", allWtgAllocated: false },
      ],
      turbines: [{ id: "w1", name: "WTG WPN_1" }, { id: "w2", name: "WTG WPN_2" }],
    });
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.costId === "c1")).toBe(true);
    expect(plans[0]!.name).toBe("Meyer-Field A-WTG WPN_1");
    expect(plans[1]!.name).toBe("Meyer-Field A-WTG WPN_2");
  });

  it("locNewWtgWillbeAllocated only fires for a NEW entity", () => {
    expect(isNewAllocationNeeded(null)).toBe(true);
    expect(isNewAllocationNeeded(undefined)).toBe(true);
    expect(isNewAllocationNeeded("t1")).toBe(false);
  });

  it("UT-GEN-037 a turbine delete removes the allocation row when siblings exist", () => {
    expect(
      planTurbineDeletion({
        allocations: [{ id: "a1", costId: "c1" }],
        siblingCountByCost: { c1: 3 },
      }),
    ).toEqual([{ kind: "removeAllocation", allocationId: "a1" }]);
  });

  it("UT-GEN-038 a turbine delete removes the parent cost when it is the only WTG", () => {
    expect(
      planTurbineDeletion({
        allocations: [{ id: "a1", costId: "c1" }],
        siblingCountByCost: { c1: 1 },
      }),
    ).toEqual([{ kind: "removeLandLeaseCost", costId: "c1" }]);
  });

  it("UT-GEN-042 a status change propagates to every turbine", () => {
    const plan = planStatusToggle({
      type: genType({ status: CHOICE_PLANT.status.active }),
      turbines: [turbine(1), turbine(2), turbine(3), turbine(4), turbine(5), turbine(6)],
    });
    expect(plan.nextStatus).toBe(CHOICE_PLANT.status.inactive);
    expect(plan.turbineIds).toHaveLength(6);
    const back = planStatusToggle({
      type: genType({ status: CHOICE_PLANT.status.inactive }),
      turbines: [turbine(1)],
    });
    expect(back.nextStatus).toBe(CHOICE_PLANT.status.active);
  });
});

/* ═══════════════════════════════ GUIDE-driven display strings (q07–q11) ══════════ */

describe("GUIDE display strings", () => {
  it("q07 — the summary field label is verbatim", () => {
    expect(TOTAL_CAPACITY_LABEL).toBe("Total Capacity [MW(p)]");
  });

  it("q09 — a model's Total Height is the catalogue `'Total Height'` column (D27, U7)", () => {
    expect(catalogTotalHeight(model({ totalHeight: 199.5 }))).toBe(199.5);
    expect(catalogTotalHeight(null)).toBeNull();
    expect(catalogTotalHeight(model({ totalHeight: null }))).toBeNull();
  });

  it("q09 — the detail grid's seven field labels are verbatim", () => {
    expect(TYPE_DETAIL_FIELD_LABELS).toEqual({
      supplier: "Supplier",
      totalHeight: "Total Height [m]",
      numberOfGenerators: "Number of Generators",
      hubHeight: "Hub Height [m]",
      rotorDiameter: "Rotor Diameter [m]",
      heightLimitation: "Height Limitation [m]",
      generatorsCapacity: "Generators Capacity [MW]",
    });
  });

  it("q09 — the Add Generator link and turbine table labels are verbatim", () => {
    expect(ADD_GENERATOR_LABEL).toBe("+ Add Generator");
    expect(TURBINE_TABLE_LABELS).toEqual({
      wtg: "WTG",
      totalHeight: "Total Height",
      effectiveCapacity: "Effective Generator Capacity [MW]",
    });
  });

  it("q10 — the save-confirmation banner is verbatim", () => {
    expect(GENERATOR_TYPE_SAVED_BANNER).toBe(
      "Generator type was successfully saved for current project!",
    );
  });

  it("q11 — the PV panel's titles, field labels and placeholder are verbatim", () => {
    expect(PV_PANEL_TITLES).toEqual({ add: "Add PV Module Type", edit: "Edit PV Module Type" });
    expect(PV_FIELD_LABELS).toEqual({
      moduleLabel: "Module Label",
      capacity: "Total Module Type Capacity [MWp]",
      supplier: "Supplier",
      degradation1stYear: "Degradation 1st Year [% per annum]",
      degradationRemainingYears: "Degradation Remaining Years [% per annum]",
    });
    expect(PV_SUPPLIER_PLACEHOLDER).toBe("Find supplier");
  });
});

/* ══════════════════════════════════════════════════ PV module type panel (q11) ══ */

describe("PV module type panel", () => {
  const opts = { otherSupplierChosen: false };
  it("q11 — the label error shows once touched and blank; Save needs label, capacity and a module", () => {
    const blank = pvForm({ moduleLabel: "", capacity: "", supplier: null });
    expect(validatePvTypeForm(blank, opts).moduleLabel).toBeNull();
    const touched = pvForm({ moduleLabel: "", dirty: new Set(["moduleLabel"]) });
    expect(validatePvTypeForm(touched, opts).moduleLabel).toBe("Value cannot be blank.");
    expect(canSavePvType(validatePvTypeForm(blank, opts), blank, opts)).toBe(false);
  });

  it("q11 — the Degradation fields are optional", () => {
    const errors = validatePvTypeForm(pvForm(), opts);
    expect(errors.degradation1stYear).toBeNull();
    expect(errors.degradationRemainingYears).toBeNull();
  });

  it("UT-GEN-100 the canvas ranges and texts: capacity 2 dp 0…500, degradations 3 dp 0…100 (S19)", () => {
    const e = validatePvTypeForm(pvForm({
      capacity: "600", degradation1stYear: "150", degradationRemainingYears: "1.2345",
    }), opts);
    expect(e.capacity).toBe("Please select a value between 0 and 500.");
    expect(e.degradation1stYear).toBe("Please select a value between 0 and 100.");
    expect(e.degradationRemainingYears).toBe("Value must be a number with three decimal");
    expect(validatePvTypeForm(pvForm({ capacity: "1.234" }), opts).capacity).toBe("Numeric value with maximum of two decimals");
    expect(validatePvTypeForm(pvForm({ degradation1stYear: "1.2345" }), opts).degradation1stYear)
      .toBe("Numeric value with maximum of three decimals");
  });

  it("q11 — a fully filled form has no errors", () => {
    const errors = validatePvTypeForm(pvForm({ degradation1stYear: "2.5", degradationRemainingYears: "0.5" }), opts);
    expect(Object.values(errors).every((e) => e === null || e === undefined)).toBe(true);
  });

  it("UT-GEN-101 Save has no dirty conjunct; Other Supplier is required only for that module (S20)", () => {
    const f = pvForm({ supplier: "m1" });
    expect(canSavePvType(validatePvTypeForm(f, opts), f, opts)).toBe(true);
    const other = { otherSupplierChosen: true };
    const noText = pvForm({ supplier: "m-other", otherSupplier: "" });
    expect(canSavePvType(validatePvTypeForm(noText, other), noText, other)).toBe(false);
    const withText = pvForm({ supplier: "m-other", otherSupplier: "Acme PV" });
    expect(canSavePvType(validatePvTypeForm(withText, other), withText, other)).toBe(true);
  });

  it("UT-GEN-102 the Supplier options are the PVModules catalogue: no Imported rows, Other Supplier last (D12)", () => {
    expect(pvSupplierOptions([
      { id: "o", displayName: "Other Supplier", supplier: null },
      { id: "a", displayName: "JA Solar 550", supplier: "JA Solar" },
      { id: "i", displayName: "Imported row", supplier: "X" },
      { id: "t", displayName: "Trina 600", supplier: "Trina" },
    ]).map((o) => o.id)).toEqual(["a", "t", "o"]);
  });

  it("UT-GEN-103 buildPvTypeFields writes the PVModule bind and Other Supplier, never vsb_type (W6)", () => {
    const fields = buildPvTypeFields(
      pvForm({ supplier: "m1", capacity: "12.50", degradation1stYear: "2", degradationRemainingYears: "" }),
      { deviceCostModules: 300 },
    );
    expect(fields).toEqual({
      [PV_TYPE_COL.label]: "JA Solar 550W",
      [PV_TYPE_COL.pvModuleBind]: "/vsb_pvmodules(m1)",
      [PV_TYPE_COL.otherSupplier]: null,
      [PV_TYPE_COL.capacity]: 12.5,
      [PV_TYPE_COL.costPerPower]: 300,
      [PV_TYPE_COL.cost]: 300 * 12.5,
      [PV_TYPE_COL.degradation1stYear]: 2,
      [PV_TYPE_COL.degradationRemainingYears]: null,
    });
    expect(Object.keys(fields)).not.toContain("vsb_type");
    // SOURCE DEFECT: the stale other supplier is written only for the "Other Supplier" module.
    expect(buildPvTypeFields(pvForm({ supplier: "m1", otherSupplier: "Old Co" }), { deviceCostModules: 1 })[PV_TYPE_COL.otherSupplier]).toBeNull();
    expect(buildPvTypeFields(pvForm({ supplier: "m1", otherSupplier: "Old Co" }), { deviceCostModules: 1, otherSupplierChosen: true })[PV_TYPE_COL.otherSupplier]).toBe("Old Co");
    expect(R.pvOtherSupplierValueCanvasParity("Old Co")).toBe("Old Co");
  });
});

/* ═════════════════════════════════════ canvas 1.21.753 — Replace and the O&M guard ════ */

describe("canvas 1.21.753 — the command bar gains Replace", () => {
  it("UT-GEN-057 keeps the canvas Items order, Replace right after each Delete", () => {
    const i = (k: string) => GENERATOR_COMMAND_KEYS.indexOf(k as (typeof GENERATOR_COMMAND_KEYS)[number]);
    expect(i("replaceGeneratorType")).toBe(i("deleteGeneratorType") + 1);
    expect(i("replacePVModuleType")).toBe(i("deletePVModuleType") + 1);
  });

  it("UT-GEN-058 Replace is visible with a selection and needs edit rights on the row", () => {
    const none = commandBarState(cmdCtx());
    expect(none.replaceGeneratorType.visible).toBe(false);
    expect(none.replacePVModuleType.visible).toBe(false);

    const sel = commandBarState({
      ...cmdCtx({ selection: { generatorType: genType(), pvModuleType: simple() } }),
      pvEditPermission: true,
    });
    expect(sel.replaceGeneratorType).toEqual({ visible: true, enabled: true, label: "Replace Generator Type" });
    expect(sel.replacePVModuleType).toEqual({ visible: true, enabled: true, label: "Replace PV Module Type" });

    const readOnly = commandBarState({
      ...cmdCtx({ canEdit: false, selection: { generatorType: genType(), pvModuleType: simple() } }),
      pvEditPermission: true,
    });
    expect(readOnly.replaceGeneratorType.enabled).toBe(false);
    expect(readOnly.replacePVModuleType.enabled).toBe(false);

    const noRowRight = commandBarState(cmdCtx({
      editPermission: false, selection: { generatorType: genType(), pvModuleType: simple() },
    }));
    expect(noRowRight.replaceGeneratorType.enabled).toBe(false);
    // `pvEditPermission` absent → false.
    expect(noRowRight.replacePVModuleType.enabled).toBe(false);
  });
});

describe("canvas 1.21.753 — the O&M dependency guard", () => {
  const dep = { rowActive: true, hasActiveDeviceType: true, hasActiveOpexCost: true };

  it("UT-GEN-059 blocks deleting/deactivating a WTG type linked to active O&M costs", () => {
    expect(capacityGuardReason({ family: "wtg", project: project({ totalCapacity: 50 }), capacity: 22.4, ...dep }))
      .toBe("OpexDependency");
    expect(capacityGuardReason({ family: "pv", project: project({ totalCapacity: 50 }), capacity: 10, ...dep }))
      .toBe("OpexDependencyPV");
  });

  it("UT-GEN-060 the last-capacity reason wins when both hold", () => {
    expect(capacityGuardReason({ family: "wtg", project: project({ totalCapacity: 22.4 }), capacity: 22.4, ...dep }))
      .toBe("Capacity");
  });

  it("UT-GEN-061 needs an ACTIVE row, an ACTIVE bridge and an ACTIVE O&M cost", () => {
    const p = project({ totalCapacity: 50 });
    expect(capacityGuardReason({ family: "wtg", project: p, capacity: 1, ...dep, rowActive: false })).toBeNull();
    expect(capacityGuardReason({ family: "wtg", project: p, capacity: 1, ...dep, hasActiveDeviceType: false })).toBeNull();
    expect(capacityGuardReason({ family: "wtg", project: p, capacity: 1, ...dep, hasActiveOpexCost: false })).toBeNull();
  });

  it("UT-GEN-062 only WTG and PV are O&M-guarded; storage keeps the capacity test alone", () => {
    const p = project({ totalCapacity: 50 });
    expect(capacityGuardReason({ family: "storage", project: p, capacity: 1, ...dep })).toBeNull();
    expect(capacityGuardReason({ family: "storage", project: project({ totalCapacity: 1 }), capacity: 1, ...dep }))
      .toBe("Capacity");
    // inverter is not capacity-guarded either (SOURCE DEFECT ambiguity 6, unchanged).
    expect(capacityGuardReason({ family: "inverter", project: project({ totalCapacity: 1 }), capacity: 1, ...dep }))
      .toBeNull();
  });

  it("UT-GEN-063 the two O&M messages are the canvas text, quotes included", () => {
    expect(opexDependencyMessage("OpexDependency", "V162-6.2")).toBe(
      'Generator "V162-6.2" cannot be deleted or deactivated because it is currently linked to O&M costs. Replace the generator, or unlink it from the associated O&M costs first.',
    );
    expect(opexDependencyMessage("OpexDependencyPV", "JA 550")).toBe(
      'PV Module type "JA 550" cannot be deleted because it is currently linked to O&M costs. Replace the PV Module, or unlink it from the associated O&M costs first.',
    );
  });
});

describe("canvas 1.21.753 — Replace Generator Type", () => {
  const form = (over: Partial<Parameters<typeof replaceWtgSaveable>[0]["form"]> = {}) => ({
    supplier: "Vestas", turbineType: "V162-6.2", hubHeight: 169, revisedHubHeight: "", inCountry: true, ...over,
  });

  it("UT-GEN-064 Replace needs supplier, turbine type and a non-zero hub height", () => {
    expect(replaceWtgSaveable({ form: form(), inProgress: false, heightBlocked: false })).toBe(true);
    expect(replaceWtgSaveable({ form: form({ supplier: null }), inProgress: false, heightBlocked: false })).toBe(false);
    expect(replaceWtgSaveable({ form: form({ turbineType: null }), inProgress: false, heightBlocked: false })).toBe(false);
    expect(replaceWtgSaveable({ form: form({ hubHeight: null }), inProgress: false, heightBlocked: false })).toBe(false);
    expect(replaceWtgSaveable({ form: form({ hubHeight: 0 }), inProgress: false, heightBlocked: false })).toBe(false);
  });

  it("UT-GEN-065 the Dummy path takes a revised hub height in 1..200 with two decimals", () => {
    const dummy = form({ supplier: "Dummy Supplier", hubHeight: null });
    expect(replaceWtgSaveable({ form: { ...dummy, revisedHubHeight: "120.50" }, inProgress: false, heightBlocked: false })).toBe(true);
    expect(replaceWtgSaveable({ form: { ...dummy, revisedHubHeight: "0.5" }, inProgress: false, heightBlocked: false })).toBe(false);
    expect(replaceWtgSaveable({ form: { ...dummy, revisedHubHeight: "120.505" }, inProgress: false, heightBlocked: false })).toBe(false);
    expect(replaceWtgSaveable({ form: { ...dummy, revisedHubHeight: "" }, inProgress: false, heightBlocked: false })).toBe(false);
  });

  it("UT-GEN-066 Replace is disabled while a replace runs and over the height limit", () => {
    expect(replaceWtgSaveable({ form: form(), inProgress: true, heightBlocked: false })).toBe(false);
    expect(replaceWtgSaveable({ form: form(), inProgress: false, heightBlocked: true })).toBe(false);
    expect(REPLACE_MSG.inProgress).toBe(
      "A generator replace is already in progress for this type - please wait for it to finish.",
    );
  });

  it("UT-GEN-067 manual allocations move to the new units by position; surplus is removed", () => {
    const plan = planReplaceLandLease({
      allocations: [
        { id: "a3", unitIndex: 3, allWtgAllocated: false },
        { id: "a1", unitIndex: 1, allWtgAllocated: false },
        { id: "a2", unitIndex: 2, allWtgAllocated: false },
        { id: "all1", unitIndex: 1, allWtgAllocated: true },
      ],
      newUnitCount: 2,
    });
    expect(plan.repoint).toEqual([
      { allocationId: "a1", newUnitPosition: 0 },
      { allocationId: "a2", newUnitPosition: 1 },
    ]);
    expect(plan.removeSurplus).toEqual(["a3"]);
    expect(plan.removeAllWtg).toEqual(["all1"]);
    expect(plan.unmatchedCount).toBe(1);
  });

  it("UT-GEN-068 extra new units stay unallocated and nothing is removed", () => {
    const plan = planReplaceLandLease({
      allocations: [{ id: "a1", unitIndex: 7, allWtgAllocated: false }],
      newUnitCount: 4,
    });
    expect(plan.repoint).toEqual([{ allocationId: "a1", newUnitPosition: 0 }]);
    expect(plan.removeSurplus).toEqual([]);
    expect(plan.unmatchedCount).toBe(0);
  });

  it("UT-GEN-069 the panel and progress texts are the canvas strings", () => {
    expect(REPLACE_LABELS.replaceFrom).toBe("Replace from");
    expect(REPLACE_LABELS.replaceTo).toBe("Replace to");
    expect(REPLACE_LABELS.replace).toBe("Replace");
    expect(replaceGeneratorTitle("V150")).toBe("Replace Generator V150");
    expect(replacePvTitle("JA 550")).toBe("Replace JA 550 ");
    expect(replaceProgressText({ inCountry: true, newDisplayName: "V162", oldTurbineType: "V150" }))
      .toBe('Generator "V162" will replace "V150", please wait...');
    expect(replaceProgressText({ inCountry: false, newDisplayName: "V162", oldTurbineType: "V150" }))
      .toBe('Request Permission for "V162" has been sent, please wait...');
    expect(replacePvProgressText("JA 550")).toBe("PV Module 'JA 550' will be replaced, please wait...");
  });

  it("UT-GEN-070 the success note counts the allocations that could not be carried over", () => {
    expect(replaceSuccessText(0)).toBe("Generator type was successfully replaced for current project!");
    expect(replaceSuccessText(2)).toBe(
      "Generator type was successfully replaced for current project! Note: 2 Land Lease allocation(s) from the old type could not be carried over because the new type has fewer units - please review Land Lease allocations for this type.",
    );
    expect(replaceErrorText("wtg", { source: "Patch", message: "boom" }))
      .toBe("Error: Generator type could not be replaced. Internal error: originated on Patch. Message: boom");
  });

  it("UT-GEN-071 the phases are the canvas locReplacePhase values, in order", () => {
    expect([...REPLACE_PHASES]).toEqual(["Identify", "Detach", "Delete", "Add", "AllocateLandLease", "Repoint", "Done"]);
  });
});

describe("canvas 1.21.753 — Replace PV Module Type", () => {
  const f = (over: Partial<Parameters<typeof replacePvSaveable>[0]> = {}) => ({
    moduleLabel: "JA 600", capacity: "12.50", supplier: "JA Solar", otherSupplier: "",
    degradation1stYear: "", degradationRemainingYears: "", ...over,
  });

  it("UT-GEN-072 needs label, capacity 0..500 with two decimals and a supplier", () => {
    expect(replacePvSaveable(f())).toBe(true);
    expect(replacePvSaveable(f({ moduleLabel: "  " }))).toBe(false);
    expect(replacePvSaveable(f({ capacity: "500.01" }))).toBe(false);
    expect(replacePvSaveable(f({ capacity: "1.234" }))).toBe(false);
    expect(replacePvSaveable(f({ supplier: null }))).toBe(false);
  });

  it("UT-GEN-073 Other Supplier is required only for the Other Supplier choice; degradation optional", () => {
    expect(replacePvSaveable(f({ supplier: "Other Supplier" }))).toBe(false);
    expect(replacePvSaveable(f({ supplier: "Other Supplier", otherSupplier: "Acme" }))).toBe(true);
    expect(replacePvSaveable(f({ degradation1stYear: "0.455" }))).toBe(true);
    expect(replacePvSaveable(f({ degradation1stYear: "101" }))).toBe(false);
    expect(PV_BRIDGE_MISSING).toBe("New PV type's bridge was not found; cannot re-link O&M costs.");
    expect(REPLACE_MSG.pvReplaced).toBe("PV Module type was successfully replaced for current project!");
  });
});

/* ═══════════════════════════════ screen captions and command-bar presentation ═══ */

describe("screen captions (Screen.tsx composition rules)", () => {
  it("UT-GEN-074 currency captions fall back to EUR when the country has no ISO code", () => {
    expect(R.isoOrEur("PLN")).toBe("PLN");
    expect(R.isoOrEur(null)).toBe("EUR");
    expect(R.isoOrEur("")).toBe("EUR");
    expect(R.currencyCaption(R.INVERTER_CARD_LABELS.costPerInverter, null)).toBe("Cost per Inverter [EUR]");
    expect(R.currencyCaption(R.SUBSTRUCTURE_CARD_LABELS.substructureCost, "SEK")).toBe("Substructure Cost [SEK]");
  });

  it("UT-GEN-075 the galleries show only once the project has an end date", () => {
    expect(R.isBodyVisible(null)).toBe(false);
    expect(R.isBodyVisible({ endDate: null })).toBe(false);
    expect(R.isBodyVisible({ endDate: "2057-08-29" })).toBe(true);
  });

  it("UT-GEN-076 the type panel's Save reads Request permission only out of country with a supplier", () => {
    expect(R.typeSaveLabel(null, false)).toBe("Save");
    expect(R.typeSaveLabel("Vestas", true)).toBe("Save");
    expect(R.typeSaveLabel("Vestas", false)).toBe("Request permission");
    expect(R.typeFilterMessage(true, "Germany")).toBe("Generators available for Germany");
    expect(R.typeFilterMessage(false, "Germany")).toBe("Generators not available for Germany");
  });

  it("UT-GEN-077 turbine panel title, name prefix and the grid's pager texts", () => {
    expect(R.turbinePanelTitle(null)).toBe("Add Generator");
    expect(R.turbinePanelTitle("WTG ABC_3")).toBe('Edit Generator "WTG ABC_3"');
    expect(R.turbineNamePrefix("ABC")).toBe("WTG ABC_");
    expect(R.generatorsTotalRowsText(1)).toBe("");
    expect(R.generatorsTotalRowsText(31)).toBe("Generators: 31");
    expect(R.paginationText(1, 1)).toBe("");
    expect(R.paginationText(2, 3)).toBe("Page: 2 from 3");
  });

  it("UT-GEN-078 dialog titles and descriptions interpolate the canvas formulas", () => {
    expect(R.changeStatusDialog(CHOICE_PLANT.status.active)).toEqual({ title: "Deactivate WTG?", confirm: "Deactivate" });
    expect(R.changeStatusDialog(CHOICE_PLANT.status.inactive)).toEqual({ title: "Activate WTG?", confirm: "Activate" });
    expect(R.DIALOG_TEXT.deleteBess("B1")).toBe('Are you sure to delete selected BESS Type: "B1"? ');
    expect(R.DIALOG_TEXT.deleteGeneratorType("N163")).toBe(
      "Are you sure to delete the WTG type: N163? All related cost in O&M and Land Lease will be removed.",
    );
    expect(R.inverterPanelTitle(false)).toBe("Add Inverter");
    expect(R.substructurePanelTitle(true)).toBe("Edit Substructure");
  });

  it("UT-GEN-079 command icons follow each Items row's ItemIconName", () => {
    expect(R.generatorCommandIcon("addWTGType", { label: "Add WTG Type" })).toBe("Add");
    expect(R.generatorCommandIcon("addPVType", { label: "Edit PV Module Type" })).toBe("Edit");
    expect(R.generatorCommandIcon("addPVType", { label: "Add PV Module Type" })).toBe("Add");
    expect(R.generatorCommandIcon("addStorage", { label: "BESS" })).toBeNull();
    expect(R.generatorCommandIcon("addStorage", { label: "Edit BESS" })).toBe("Edit");
    expect(R.generatorCommandIcon("deleteHydrogenType", { label: "Delete Hydrogen" })).toBe("Delete");
    expect(R.generatorCommandIcon("activateGenerator", { label: "Activate" })).toBe("ActivateOrders");
    expect(R.generatorCommandIcon("deactivateGenerator", { label: "Deactivate" })).toBe("DeactivateOrders");
    expect(R.generatorCommandIcon("replaceGeneratorType", { label: "Replace Generator Type" })).toBe("Refresh");
    expect(R.generatorCommandIcon("replacePVModuleType", { label: "Replace PV Module Type" })).toBe("Refresh");
  });

  it("UT-GEN-080 BESS / Hydrogen / Substation follow Add Others while unselected", () => {
    const none = R.commandBarOrder({ storage: false, hydrogen: false, substation: false });
    expect(none.length).toBe(R.GENERATOR_COMMAND_KEYS.length);
    const at = none.indexOf("addOthers");
    expect(none.slice(at, at + 4)).toEqual(["addOthers", "addStorage", "addHydrogen", "addSubstation"]);
    const storage = R.commandBarOrder({ storage: true, hydrogen: false, substation: false });
    expect(storage.indexOf("addStorage")).toBeLessThan(storage.indexOf("addOthers"));
  });
});

/* ═══════════════════════════════════════════════════ D27 — connected screen rules ════ */

describe("D27 — option values pinned to the generated schema", () => {
  it("UT-GEN-095 the hard-coded option values match the pac-generated enums", () => {
    expect(R.COUNTRY_AVAILABILITY).toEqual(Vsb_generatorsvsb_countryavailability);
    expect(R.INVERTER_TYPE_LABELS).toEqual(Vsb_invertertypeinprojectsvsb_selectedinvertertypes);
    expect(R.SUBSTRUCTURE_TYPE_LABELS).toEqual(Vsb_substructuretypeinprojectsvsb_selectedsubstructuretypes);
    expect(Vsb_generatortypeinprojectsstatecode[CHOICE_PLANT.status.active as 0]).toBe("Active");
    expect(Vsb_generatortypeinprojectsstatecode[CHOICE_PLANT.status.inactive as 1]).toBe("Inactive");
    expect(Vsb_generatorinprojectsstatecode[CHOICE_PLANT.status.inactive as 1]).toBe("Inactive");
    const rps = Vsb_generatortypeinprojectsvsb_requestpermissionstate;
    expect(rps[CHOICE_PLANT.requestPermissionState.approved]).toBe("RequestApproved");
    expect(rps[CHOICE_PLANT.requestPermissionState.declined]).toBe("RequestDeclined");
    expect(rps[CHOICE_PLANT.requestPermissionState.pending]).toBe("RequestPending");
    expect(rps[CHOICE_PLANT.requestPermissionState.canceled]).toBe("RequestCanceled");
  });

  it("UT-GEN-096 country availability: the country name maps to its option; the canvas substring twin", () => {
    expect(R.countryAvailabilityValue("Germany")).toBe(952850000);
    expect(R.countryAvailabilityValue("Atlantis")).toBeNull();
    expect(R.countryAvailabilityValue(null)).toBeNull();
    const m = model({ countryAvailability: [952850000, 952850006] });
    expect(isAvailableInCountry(m, R.countryAvailabilityValue("Croatia"))).toBe(true);
    // SOURCE DEFECT twin: `Name in Concat(…)` is a substring test.
    expect(R.isAvailableInCountryCanvasParity(m, "Germ")).toBe(true);
    expect(isAvailableInCountry(m, R.countryAvailabilityValue("Germ"))).toBe(false);
    expect(R.multiSelectValues("952850000,952850006")).toEqual([952850000, 952850006]);
    expect(R.multiSelectValues(null)).toEqual([]);
  });
});

describe("D27 — selection, folding and the default row", () => {
  it("UT-GEN-097 one card is selected screen-wide; clicking it again deselects (B2)", () => {
    let sel = R.toggleSelection(null, "wtg", "t1");
    expect(sel).toEqual({ family: "wtg", id: "t1" });
    sel = R.toggleSelection(sel, "pv", "p1");
    expect(sel).toEqual({ family: "pv", id: "p1" });
    expect(R.selectedIn(sel, "wtg", [genType()])).toBeNull();
    expect(R.toggleSelection(sel, "pv", "p1")).toBeNull();
    // addWTGType keeps a BESS/Hydrogen/Substation selection only; addPVType keeps PV / BESS…
    expect(R.selectionAfterAddWtg({ family: "storage", id: "s" })).toEqual({ family: "storage", id: "s" });
    expect(R.selectionAfterAddWtg({ family: "pv", id: "p" })).toBeNull();
    expect(R.selectionAfterAddPv({ family: "pv", id: "p" })).toEqual({ family: "pv", id: "p" });
    expect(R.selectionAfterAddPv({ family: "inverter", id: "i" })).toBeNull();
  });

  it("UT-GEN-098 cards start collapsed; a non-WTG row click also folds (B3)", () => {
    const opened = R.toggleExpanded(new Set(), "t1");
    expect(opened.has("t1")).toBe(true);
    expect(R.toggleExpanded(opened, "t1").has("t1")).toBe(false);
    expect(R.rowClickFolds("wtg")).toBe(false);
    expect(R.rowClickFolds("pv")).toBe(true);
  });

  it("UT-GEN-099 SOURCE DEFECT: expanding a WTG card keeps it selected; the canvas twin deselects it", () => {
    expect(R.wtgFoldSelection(true, "t1")).toEqual({ family: "wtg", id: "t1" });
    expect(R.wtgFoldSelectionCanvasParity(true, "t1")).toBeNull();
    expect(R.wtgFoldSelectionCanvasParity(false, "t1")).toEqual({ family: "wtg", id: "t1" });
  });

  it("UT-GEN-104b btn_SetDefaultSeletected_Item: WTG, then PV, Hydrogen, BESS, Substation (B20)", () => {
    const lists = { wtg: [], pv: [{ id: "p" }], hydrogen: [{ id: "h" }], storage: [{ id: "s" }], substation: [] };
    expect(R.defaultSelection(lists)).toEqual({ family: "pv", id: "p" });
    expect(R.defaultSelection(lists, "p")).toEqual({ family: "hydrogen", id: "h" });
    expect(R.defaultSelection({ wtg: [], pv: [], hydrogen: [], storage: [], substation: [] })).toBeNull();
  });

  it("UT-GEN-105 the pager shows only with more than one page; Add Generator below 200 on an active type", () => {
    expect(R.pagerVisible(30)).toBe(false);
    expect(R.pagerVisible(31)).toBe(true);
    expect(R.pagerVisible(null)).toBe(false);
    expect(R.canAddGenerator(199, CHOICE_PLANT.status.active)).toBe(true);
    expect(R.canAddGenerator(200, CHOICE_PLANT.status.active)).toBe(false);
    expect(R.canAddGenerator(1, CHOICE_PLANT.status.inactive)).toBe(false);
  });
});

describe("D27 — card values and formats", () => {
  it("UT-GEN-106 Text() custom formats", () => {
    expect(R.textFormat(5.6, "#.0#")).toBe("5.6");
    expect(R.textFormat(6, "#.0#")).toBe("6.0");
    expect(R.textFormat(22.4, "#.0")).toBe("22.4");
    expect(R.textFormat(1234567.891, "#,##0.00")).toBe("1,234,567.89");
    expect(R.textFormat(1500, "#,###.00")).toBe("1,500.00");
    expect(R.textFormat(148, "#0.00")).toBe("148.00");
    expect(R.textFormat(5.6, "#0.0#")).toBe("5.6");
    expect(R.textFormat(null, "#0.0#")).toBe("");
    expect(R.textIntOr(148, "#0.0#")).toBe("148");
    expect(R.textIntOr(148.5, "#0.0#")).toBe("148.5");
  });

  it("UT-GEN-107 the WTG card: catalogue Total Height, Dummy hub height from the first turbine (U7)", () => {
    const v = R.wtgCardValues({
      model: model({ hubHeight: 148, rotorDiameter: 150, totalHeight: 223 }),
      type: genType({ numberOfGenerators: 4, generatorsCapacity: 22.4 }),
      firstTurbine: turbine(1, { hubHeightExclPlinth: 140 }), planning: { isHeightLimitationForWtg: true, heightLimitation: 200 },
    });
    expect(v).toEqual({
      supplier: "Vestas", hubHeight: "148", rotorDiameter: "150", totalHeight: "223",
      heightLimitation: "200", numberOfGenerators: "4", generatorsCapacity: "22.4",
    });
    expect(R.wtgCardHubHeight(model({ supplier: "Dummy X", hubHeight: 0 }), turbine(1, { hubHeightExclPlinth: 140.5 }))).toBe("140.5");
  });

  it("UT-GEN-108 the PV / inverter / substructure / BESS cards", () => {
    const pv = R.pvCardValues(simple({ otherSupplier: null, catalogueSupplier: "JA Solar", capacity: 12, degradation1stYear: 0.5, degradationRemainingYears: 1 }));
    expect(pv).toEqual({ supplier: "JA Solar", capacity: "12.0", degradation1stYear: "0.5", degradationRemainingYears: "1" });
    expect(R.cardSupplier(simple({ otherSupplier: "Own Co", catalogueSupplier: "JA Solar" }))).toBe("Own Co");
    const inv = R.inverterCardValues(simple({ typeLabels: ["String", "Central"], costPerInverter: 750, cost: 3000, numberOfInverters: 4, nominalPower: 2500, warranty: 10 }));
    expect(inv.inverterType).toBe("String,Central");
    expect(inv.costPerInverter).toBe("750.00");
    expect(inv.typeCost).toBe("3,000.00");
    expect(R.substructureCardValues(simple({ typeLabels: ["Fixed"], cost: 2000 })).cost).toBe("2,000.00");
    expect(R.substructureCostNoteVisible(0)).toBe(true);
    expect(R.substructureCostNoteVisible(12)).toBe(false);
    expect(R.simpleCardValues("storage", simple({ capacity: 10, energyCapacity: 20, supplier: "Tesla" }))).toEqual(["10.00", "20.00", "Tesla"]);
    expect(R.simpleCardValues("hydrogen", simple({ capacity: 5, supplier: "H" }))).toEqual(["5.0", "H"]);
  });

  it("UT-GEN-109 the Cancel request button visibility; the height popup trims the name (U24, S28)", () => {
    expect(R.cancelRequestVisible("wtg", { flowRunId: "r", flowApprovalId: "a", requestPermissionState: CHOICE_PLANT.requestPermissionState.pending })).toBe(true);
    expect(R.cancelRequestVisible("wtg", { flowRunId: "r", flowApprovalId: "a", requestPermissionState: CHOICE_PLANT.requestPermissionState.approved })).toBe(false);
    expect(R.cancelRequestVisible("pv", { flowRunId: null, flowApprovalId: null, requestPermissionState: CHOICE_PLANT.requestPermissionState.pending })).toBe(true);
    expect(R.cancelRequestVisible("storage", { flowRunId: "r", flowApprovalId: "a", requestPermissionState: null })).toBe(false);
    expect(R.heightPopupTypeName("Vestas V150-5.6")).toBe("Vestas V150-5");
    expect(R.heightPopupTypeName(null)).toBe("");
    expect(R.LAST_CAPACITY_TITLES.delete).toBe("Generator can’t be deleted/deactivated");
    expect(R.LAST_CAPACITY_MESSAGES.deactivate).toBe(
      "Before removing/deactivating the last generator, add/activate another one so that the project's capacity never drops to zero.",
    );
  });
});

describe("D27 — type and turbine panels", () => {
  it("UT-GEN-110 the PM height block ignores the limitation flag; the approval popup needs a limit (S5)", () => {
    const off = { isHeightLimitationForWtg: false, heightLimitation: 200 };
    expect(heightBlocksSave({ planning: off, totalHeight: 215, project: project(), entraObjectId: "x" })).toBe(true);
    expect(heightBlocksSave({ planning: off, totalHeight: 215, project: project(), entraObjectId: "PM-1" })).toBe(false);
    // SOURCE DEFECT twin: with the flag on and NO limit the canvas still asks to approve.
    const noLimit = { isHeightLimitationForWtg: true, heightLimitation: null };
    expect(heightLimitExceeded(noLimit, 150)).toBe(false);
    expect(R.heightLimitExceededCanvasParity(noLimit, 150)).toBe(true);
  });

  it("UT-GEN-111 the turbine panel's PM block reads the STORED total height (S6, Q3)", () => {
    const planning = { isHeightLimitationForWtg: false, heightLimitation: 200 };
    expect(R.turbineHeightBlocksSave({ planning, storedTotalHeight: 215, project: project(), entraObjectId: "x" })).toBe(true);
    expect(R.turbineHeightBlocksSave({ planning, storedTotalHeight: null, project: project(), entraObjectId: "x" })).toBe(false);
  });

  it("UT-GEN-112 the type panel's blank messages show once touched (SOURCE DEFECT); the canvas never shows them", () => {
    expect(R.typeFieldBlankMessage(true, true)).toBe("Value cannot be blank.");
    expect(R.typeFieldBlankMessage(false, true)).toBeNull();
    expect(R.typeFieldBlankMessageCanvasParity(true, true)).toBeNull();
    expect(R.numberOfGeneratorsMessage("")).toBe("Input must not be blank");
    expect(R.numberOfGeneratorsMessage("201")).toBe("Please select a value between 0 and 200.");
  });

  it("UT-GEN-113 a Dummy supplier needs the typed hub height 1…200; a real one a height that is not 0", () => {
    const dummy: TypeFormState = {
      supplier: "Dummy X", turbineType: "T", hubHeight: 0, revisedHubHeight: "", numberOfGenerators: "2",
      cost: "", dirty: new Set(),
    };
    expect(validateTypeForm(dummy, { isoCurrencyCode: "EUR", derivedCostPerWtg: 1 }).RevisedHubheight).not.toBeNull();
    expect(validateTypeForm({ ...dummy, revisedHubHeight: "120" }, { isoCurrencyCode: "EUR", derivedCostPerWtg: 1 }).RevisedHubheight).toBeNull();
    const real = { ...dummy, supplier: "Vestas", hubHeight: 0 };
    expect(validateTypeForm(real, { isoCurrencyCode: "EUR", derivedCostPerWtg: 1 }).RevisedHubheight).not.toBeNull();
  });

  it("UT-GEN-114 the foundation plinth: −100…100, one decimal, not blank (S15)", () => {
    expect(R.validateFoundationPlinth("0")).toBeNull();
    expect(R.validateFoundationPlinth("-100")).toBeNull();
    expect(R.validateFoundationPlinth("99.5")).toBeNull();
    expect(R.validateFoundationPlinth("100.0")).toBeNull();
    expect(R.validateFoundationPlinth("")).toBe("Foundation Plinth needs to be in range -100 to 100 with max 1 decimal");
    expect(R.validateFoundationPlinth("2.55")).not.toBeNull();
    expect(R.validateFoundationPlinth("101")).not.toBeNull();
    expect(R.validateFoundationPlinth("2,5", "de-DE")).toBeNull();
    expect(canSaveTurbine({
      form: { nameIndex: "3", effectiveCapacity: "5.6", effectiveHubHeight: "148", foundationPlinth: "", dirty: new Set(["x"]) },
      existingIndices: [], specificCapacity: 5.6, heightBlocked: false,
    })).toBe(false);
  });

  it("UT-GEN-115 a new turbine: the project-wide next index and the catalogue defaults (S17, B11)", () => {
    expect(R.nextTurbineIndex([turbine(3), turbine(9, { typeId: "other" })])).toBe(10);
    expect(R.nextTurbineIndex([])).toBe(1);
    const f = R.turbineFormDefaults({ turbine: null, model: model({ specificCapacity: 5.6, hubHeight: 148 }), nextIndex: 10 });
    expect(f).toEqual({
      nameIndex: "10", effectiveCapacity: "5.6", effectiveHubHeight: "148.00", foundationPlinth: "0",
      dirty: new Set(["nameIndex"]),
    });
    const e = R.turbineFormDefaults({ turbine: turbine(2, { foundationPlinth: null }), model: model(), nextIndex: 10 });
    expect(e.nameIndex).toBe("2");
    expect(e.foundationPlinth).toBe("0");
    expect(e.dirty.size).toBe(0);
    expect(R.turbinePanelPrefix(turbine(2, { name: "WTG OLD_2" }), "NEW")).toBe("WTG OLD_");
    expect(R.turbinePanelPrefix(null, "NEW")).toBe("WTG NEW_");
    expect(R.turbinePanelTotalHeight({ form: e, storedTotalHeight: 223, rotorDiameter: 150 })).toBe(223);
    expect(R.turbinePanelTotalHeight({ form: { ...e, dirty: new Set(["x"]) }, storedTotalHeight: 223, rotorDiameter: 150 })).toBe(148 + 0 + 75);
  });
});

describe("D27 — BESS / Hydrogen / Substation panels", () => {
  const form = (over: Partial<R.SimpleFormState> = {}): R.SimpleFormState => ({
    label: "BESS 1", capacity: "10", energyCapacity: "20", supplier: "Tesla", dirty: new Set(["label"]), ...over,
  });
  it("UT-GEN-116 the canvas validation and Save gate (S23)", () => {
    expect(R.validateSimpleForm("storage", form({ capacity: "1.234" })).capacity).toBe("Numeric value with maximum of two decimals");
    expect(R.validateSimpleForm("storage", form({ energyCapacity: "20000" })).energyCapacity).toBe("Please select a value between 0 and 10000.");
    expect(R.validateSimpleForm("hydrogen", form({ capacity: "1.25" })).capacity).toBe("Numeric value with maximum of one decimals");
    expect(R.validateSimpleForm("substation", form({ capacity: "1001" })).capacity).toBe("Please select a value between 0 and 1000.");
    expect(R.validateSimpleForm("storage", form({ label: "" })).label).toBe("Value cannot be blank");
    expect(R.canSaveSimple("storage", form())).toBe(true);
    expect(R.canSaveSimple("storage", form({ dirty: new Set() }))).toBe(false);
    expect(R.canSaveSimple("storage", form({ energyCapacity: "" }))).toBe(false);
    expect(R.canSaveSimple("hydrogen", form({ energyCapacity: "" }))).toBe(true);
  });

  it("UT-GEN-117 the panel opens bound to the selected row (B7)", () => {
    expect(R.simpleFormDefaults("storage", simple({ name: "B", capacity: 10, energyCapacity: 20.5, supplier: "T" })))
      .toEqual({ label: "B", capacity: "10.00", energyCapacity: "20.50", supplier: "T", dirty: new Set() });
    expect(R.simpleFormDefaults("hydrogen", null).label).toBe("");
  });
});

describe("D27 — write plans", () => {
  const P = { id: "11111111-1111-1111-1111-111111111111", shortName: "WPN", owningBusinessUnitId: "bu-1" };
  const OBU = "owningbusinessunit@odata.bind";

  it("UT-GEN-118 the WTG type save: type, N turbines (project-wide names), roll-up — in canvas order (W1)", () => {
    const plan = R.planCreateGeneratorType({
      project: P, inCountry: true, model: model({ id: "g1", specificCapacity: 5.6, hubHeight: 148, rotorDiameter: 150 }),
      numberOfGenerators: 2, costPerWtg: 900_000.456, selectedHeight: 148, revisedHubHeight: null,
      existingTypes: [genType({ generatorsCapacity: 10, generatorsCost: 1 })], projectTurbines: [turbine(4)],
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_generatortypeinprojects", "create:vsb_generatorinprojects", "create:vsb_generatorinprojects",
      "update:vsb_projects",
    ]);
    const type = plan.writes[0]!.data!;
    expect(type["vsb_Project@odata.bind"]).toBe(`/vsb_projects(${P.id})`);
    expect(type["vsb_Generator@odata.bind"]).toBe("/vsb_generators(g1)");
    expect(type[GEN_TYPE_COL.costPerWtg]).toBe(900_000.46);
    expect(type[GEN_TYPE_COL.generatorsCost]).toBeCloseTo(1_800_000.92, 6);
    expect(type[OBU]).toBe("/businessunits(bu-1)");
    expect(plan.writes[1]!.data![GEN_INSTANCE_COL.name]).toBe("WTG WPN_5");
    expect(plan.writes[1]!.data!["vsb_ModuleTypeInProjectId_vsb_generatortypeinproject@odata.bind"]).toBe("/vsb_generatortypeinprojects(@created#0)");
    expect(plan.writes[1]!.data![GEN_INSTANCE_COL.totalHeight]).toBe(223);
    expect(plan.writes[3]!.data).toEqual({ vsb_plantwtgcapacity: 10 + 11.2, vsb_plantwtgcost: 1 + 1_800_000.92 });
    // Out of country = the excluded permission flow: refused, nothing sent.
    const refused = R.planCreateGeneratorType({
      project: P, inCountry: false, model: model(), numberOfGenerators: 1, costPerWtg: 1, selectedHeight: 1,
      revisedHubHeight: null, existingTypes: [], projectTurbines: [],
    });
    expect(refused.writes).toHaveLength(0);
    expect(refused.refusedReason).toBe(R.EXCLUDED.permissionRequest);
  });

  it("UT-GEN-119 the type save's second job: the device-type shadow, then the AllWTG allocations", () => {
    const plan = R.planGeneratorTypeFollowUp({
      project: P, typeId: "t9", typeName: "WTG-0042", hasDeviceType: false,
      turbines: [{ id: "w1", name: "WTG WPN_1" }],
      landLeaseCosts: [{ id: "c1", landOwner: "Meyer", description: "A", allWtgAllocated: true }],
    });
    expect(plan.writes[0]!.data).toEqual({
      vsb_name: "WTG-0042", "vsb_TypeInProjectId_vsb_generatortypeinproject@odata.bind": "/vsb_generatortypeinprojects(t9)",
      [OBU]: "/businessunits(bu-1)",
    });
    expect(plan.writes[1]!.data).toEqual({
      vsb_name: "Meyer-A-WTG WPN_1", "vsb_ProjectCost@odata.bind": "/vsb_landleaseprojectcosts(c1)",
      "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(w1)", [OBU]: "/businessunits(bu-1)",
    });
    expect(R.planGeneratorTypeFollowUp({ project: P, typeId: "t9", typeName: "x", hasDeviceType: true, turbines: [], landLeaseCosts: [] }).writes).toHaveLength(0);
  });

  it("UT-GEN-120 the turbine save: turbine, apply-to-all per sibling, type re-band, roll-up, new-turbine allocation (W2)", () => {
    const type = genType({ id: "t1" });
    const siblings = [turbine(1, { foundationPlinth: 2, hubHeightExclPlinth: 148 }), turbine(2, { foundationPlinth: 0 })];
    const plan = R.planSaveTurbine({
      project: P, type, model: model({ rotorDiameter: 150 }), accumulatedIndex: 1, turbine: null,
      typeTurbines: siblings, allTypes: [type],
      form: { nameIndex: "3", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["nameIndex"]) },
      applyAll: { capacity: true, hubHeight: true, plinth: false }, totalHeight: 226,
      landLeaseCosts: [{ id: "c1", landOwner: "M", description: "A", allWtgAllocated: true }],
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_generatorinprojects", "update:vsb_generatorinprojects", "update:vsb_generatorinprojects",
      "update:vsb_generatortypeinprojects", "update:vsb_projects", "create:vsb_landleaseallocationwtgs",
    ]);
    expect(plan.writes[0]!.data![GEN_INSTANCE_COL.name]).toBe("WTG WPN_3");
    // SOURCE DEFECT fix: each sibling keeps ITS OWN plinth in its total (150 + 2 + 75; 150 + 0 + 75).
    expect(plan.writes[1]!.data![GEN_INSTANCE_COL.totalHeight]).toBe(227);
    expect(plan.writes[2]!.data![GEN_INSTANCE_COL.totalHeight]).toBe(225);
    expect(plan.writes[1]!.data![GEN_INSTANCE_COL.effectiveCapacity]).toBe(5);
    // The canvas twin writes the edited turbine's total to every sibling.
    expect(planApplyToAll({
      siblings, applyCapacity: false, applyHubHeight: true, applyFoundationPlinth: false,
      effectiveCapacity: null, hubHeight: 150, foundationPlinth: null, totalHeight: 226,
    })?.fields[GEN_INSTANCE_COL.totalHeight]).toBe(226);
    // Re-band from 3 children: '3 WTG price', capacity 15.
    expect(plan.writes[3]!.data).toEqual({
      vsb_numberofgenerators: 3, vsb_costperwtg: 900_000, vsb_generatorscost: 2_700_000, vsb_generatorscapacity: 15,
    });
    expect(plan.writes[5]!.data!["vsb_GeneratorInProject@odata.bind"]).toBe("/vsb_generatorinprojects(@created#0)");
  });

  it("UT-GEN-121 the turbine delete: allocations by rule 21, the turbine, the type (0 cost at none), roll-up (W3)", () => {
    const type = genType({ id: "t1" });
    const t = turbine(1);
    const plan = R.planDeleteTurbine({
      project: P, type, model: model(), accumulatedIndex: 1, turbine: t, typeTurbines: [t], allTypes: [type],
      allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c2" }], allocationCountByCost: { c1: 2, c2: 1 },
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "delete:vsb_landleaseallocationwtgs:a1", "delete:vsb_landleaseprojectcosts:c2", "delete:vsb_generatorinprojects:w1",
      "update:vsb_generatortypeinprojects:t1", `update:vsb_projects:${P.id}`,
    ]);
    expect(plan.writes[3]!.data).toMatchObject({ vsb_numberofgenerators: 0, vsb_costperwtg: 0, vsb_generatorscost: 0, vsb_generatorscapacity: 0 });
  });

  it("UT-GEN-122 the WTG type delete: land lease of all its turbines (G-05b), O&M costs, the type; refused with an open flow (W4)", () => {
    expect(R.planTypeLandLeaseCleanup({
      allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c1" }, { id: "a3", costId: "c2" }],
      allocationCountByCost: { c1: 2, c2: 3 },
    })).toEqual([
      { kind: "removeLandLeaseCost", costId: "c1" },
      { kind: "removeAllocation", allocationId: "a3" },
    ]);
    const type = genType({ id: "t1" });
    const plan = R.planDeleteGeneratorType({
      project: P, type, allTypes: [type, genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })],
      allocations: [], allocationCountByCost: {}, opexCostIds: ["o1"],
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "delete:vsb_opexprojectcosts", "delete:vsb_generatortypeinprojects", "update:vsb_projects",
    ]);
    expect(plan.writes[2]!.data).toEqual({ vsb_plantwtgcapacity: 3, vsb_plantwtgcost: 4 });
    const open = R.planDeleteGeneratorType({
      project: P, type: genType({ flowRunId: "run" }), allTypes: [], allocations: [], allocationCountByCost: {}, opexCostIds: [],
    });
    expect(open.refusedReason).toBe(R.EXCLUDED.deleteWithOpenRequest);
  });

  it("UT-GEN-123 activate / deactivate: the type, its turbines, the roll-up (W5)", () => {
    const type = genType({ id: "t1", generatorsCapacity: 22.4, generatorsCost: 9 });
    const plan = R.planToggleStatus({ project: P, type, turbines: [turbine(1), turbine(2)], allTypes: [type] });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "update:vsb_generatortypeinprojects", "update:vsb_generatorinprojects", "update:vsb_generatorinprojects", "update:vsb_projects",
    ]);
    expect(plan.writes[0]!.data).toEqual({ statecode: CHOICE_PLANT.status.inactive });
    expect(plan.writes[3]!.data).toEqual({ vsb_plantwtgcapacity: 0, vsb_plantwtgcost: 0 });
  });

  it("UT-GEN-124 the PV save (W6) and its second job; the PV delete re-costs the substructures (W7)", () => {
    const save = R.planSavePvType({
      project: P, pv: null, deviceCostModules: 300, otherSupplierChosen: false,
      form: pvForm({ supplier: "m1", capacity: "10" }),
    });
    expect(save.writes[0]!.op).toBe("create");
    expect(save.writes[0]!.data).toMatchObject({ "vsb_Project@odata.bind": `/vsb_projects(${P.id})`, "vsb_PVModule@odata.bind": "/vsb_pvmodules(m1)", vsb_cost: 3000, [OBU]: "/businessunits(bu-1)" });
    const follow = R.planPvFollowUp({
      project: P, pvId: "pv1", pvName: "PVT-0007", unitId: null, hasDeviceType: false,
      pvRows: [{ capacity: 10, cost: 3000 }], inverters: [{ cost: 100 }], substructures: [{ cost: 50 }],
    });
    expect(follow.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_generatorinprojects", "update:vsb_projects", "create:vsb_devicetypesinprojects",
    ]);
    expect(follow.writes[0]!.data).toMatchObject({ vsb_name: "PVT-0007", "vsb_ModuleTypeInProjectId_vsb_pvmoduletypeinproject@odata.bind": "/vsb_pvmoduletypeinprojects(pv1)" });
    expect(follow.writes[1]!.data).toEqual({ vsb_plantpvcapacitymwp: 10, vsb_plantpvcost: 3150 });
    const pvA = simple({ id: "a", capacity: 10, cost: 3000 });
    const pvB = simple({ id: "b", capacity: 5, cost: 1500 });
    // The canvas body (G2 runs it after the children — UT-GEN-127).
    const del = R.planDeletePvTypeCanvasParity({
      project: P, pv: pvA, pvRows: [pvA, pvB], inverters: [], deviceCostFix: 100, deviceCostTracker: 200,
      substructures: [simple({ id: "s1", typeLabels: ["Tracker"], cost: 1 }), simple({ id: "s2", typeLabels: [], cost: 1 })],
    });
    expect(del.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "delete:vsb_pvmoduletypeinprojects", "update:vsb_projects", "update:vsb_substructuretypeinprojects",
      "update:vsb_substructuretypeinprojects", "update:vsb_projects",
    ]);
    expect(del.writes[1]!.data).toEqual({ vsb_plantpvcapacitymwp: 5 });
    expect(del.writes[2]!.data).toEqual({ vsb_substructurecost: 1000 });
    expect(del.writes[3]!.data).toEqual({ vsb_substructurecost: 0 });
    expect(del.writes[4]!.data).toEqual({ vsb_plantpvcost: 1500 + 1000 });
  });

  it("UT-GEN-125 BESS / Hydrogen / Substation save and delete roll the plant capacity up (W11, W12)", () => {
    const row = simple({ id: "s1", capacity: 4 });
    const save = R.planSaveSimple({
      project: P, family: "storage", row, rows: [row, simple({ id: "s2", capacity: 6 })],
      form: { label: "B", capacity: "10", energyCapacity: "20", supplier: "T", dirty: new Set(["label"]) },
    });
    expect(save.writes[0]).toMatchObject({ op: "update", entitySet: "vsb_storagetypeinprojects", id: "s1" });
    expect(save.writes[0]!.data).toEqual({
      vsb_name: "B", vsb_storagecapacitydec: 10, crc36_energycapacitymwh: 20, vsb_supplier: "T",
      "vsb_Project@odata.bind": `/vsb_projects(${P.id})`, [OBU]: "/businessunits(bu-1)",
    });
    expect(save.writes[1]!.data).toEqual({ vsb_plantstoragecapacity: 16 });
    const del = R.planDeleteSimple({ project: P, family: "substation", row: simple({ id: "x", capacity: 2 }), rows: [simple({ id: "x", capacity: 2 }), simple({ id: "y", capacity: 3 })] });
    expect(del.writes[0]).toMatchObject({ op: "delete", entitySet: "vsb_substationtypeinprojects", id: "x" });
    expect(del.writes[1]!.data).toEqual({ vsb_plantsubstationcapacity: 3 });
  });

  it("UT-GEN-126 the inverter / substructure delete updates Plant PV Cost; refused with an open flow (W10)", () => {
    const inv = simple({ id: "i1", cost: 40 });
    const plan = R.planDeleteInverterOrSubstructure({
      project: P, family: "inverter", row: inv, pv: [simple({ cost: 100 })], inverters: [inv], substructures: [simple({ cost: 5 })],
    });
    expect(plan.writes[0]).toMatchObject({ op: "delete", entitySet: "vsb_invertertypeinprojects", id: "i1" });
    expect(plan.writes[1]!.data).toEqual({ vsb_plantpvcost: 105 });
    expect(R.planDeleteInverterOrSubstructure({
      project: P, family: "substructure", row: simple({ flowRunId: "r" }), pv: [], inverters: [], substructures: [],
    }).refusedReason).toBe(R.EXCLUDED.deleteWithOpenRequest);
  });
});

/* ═════════════════════════════ D27 — PO answers of 20 Oct 2026 (G2, G6, G7, G9) ═══ */

describe("D27 — PO answers: PV delete (G2), PV back-fill (G7)", () => {
  const P = { id: "11111111-1111-1111-1111-111111111111", shortName: "WPN", owningBusinessUnitId: "bu-1" };
  const OBU = "owningbusinessunit@odata.bind";

  it("UT-GEN-127 the PV delete removes its land lease (G1 rule), O&M costs and unit first; the twin keeps the canvas", () => {
    const pvA = simple({ id: "a", capacity: 10, cost: 3000 });
    const pvB = simple({ id: "b", capacity: 5, cost: 1500 });
    const base = { project: P, pv: pvA, pvRows: [pvA, pvB], inverters: [], substructures: [], deviceCostFix: 1, deviceCostTracker: 1 };
    const plan = R.planDeletePvType({
      ...base, unitIds: ["u1"], opexCostIds: ["o1"],
      allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c2" }], allocationCountByCost: { c1: 1, c2: 3 },
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "delete:vsb_landleaseprojectcosts:c1", "delete:vsb_landleaseallocationwtgs:a2", "delete:vsb_opexprojectcosts:o1",
      "delete:vsb_generatorinprojects:u1", "delete:vsb_pvmoduletypeinprojects:a",
      `update:vsb_projects:${P.id}`, `update:vsb_projects:${P.id}`,
    ]);
    expect(plan.writes[5]!.data).toEqual({ vsb_plantpvcapacitymwp: 5 });
    expect(plan.writes[6]!.data).toEqual({ vsb_plantpvcost: 1500 });
    // SOURCE DEFECT twin: the canvas removed only the type (the rest is cascaded or orphaned).
    expect(R.planDeletePvTypeCanvasParity(base).writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "delete:vsb_pvmoduletypeinprojects", "update:vsb_projects", "update:vsb_projects",
    ]);
    const open = R.planDeletePvType({
      ...base, pv: simple({ flowRunId: "run" }), unitIds: ["u1"], opexCostIds: [], allocations: [], allocationCountByCost: {},
    });
    expect(open.refusedReason).toBe(R.EXCLUDED.deleteWithOpenRequest);
    expect(open.writes).toHaveLength(0);
  });

  it("UT-GEN-128 a NEW PV type's unit is back-filled into the AllWTG land-lease costs (G7); an edit is not", () => {
    const costs = [
      { id: "c1", landOwner: "Meyer", description: "A", allWtgAllocated: true },
      { id: "c2", landOwner: "Schulz", description: "B", allWtgAllocated: false },
    ];
    const base = {
      project: P, pvId: "pv1", pvName: "PVT-0007", unitId: null, hasDeviceType: true,
      pvRows: [{ capacity: 10, cost: 3000 }], inverters: [], substructures: [], landLeaseCosts: costs,
    };
    const created = R.planPvFollowUp({ ...base, isNew: true });
    expect(created.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_generatorinprojects", "create:vsb_landleaseallocationwtgs", "update:vsb_projects",
    ]);
    expect(created.writes[1]!.data).toEqual({
      vsb_name: "Meyer-A-PVT-0007", "vsb_ProjectCost@odata.bind": "/vsb_landleaseprojectcosts(c1)",
      "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(@created#0)", [OBU]: "/businessunits(bu-1)",
    });
    expect(R.planPvFollowUp({ ...base, isNew: false }).writes.map((w) => w.entitySet)).toEqual([
      "vsb_generatorinprojects", "vsb_projects",
    ]);
  });
});

describe("D27 G9 — the Inverter and Substructure panels", () => {
  const P = { id: "11111111-1111-1111-1111-111111111111", shortName: "WPN", owningBusinessUnitId: "bu-1" };
  const OBU = "owningbusinessunit@odata.bind";
  const STRING = 952850000;
  const CENTRAL = 952850001;
  const TRACKER = 952850001;
  const inverterForm = (over: Partial<R.InverterFormState> = {}): R.InverterFormState => ({
    label: "INV A", supplierId: "s", otherSupplier: "", inverterTypes: [STRING], warranty: "20",
    numberOfInverters: "10", nominalPower: "250", dirty: new Set(["label"]), ...over,
  });
  const substructureForm = (over: Partial<R.SubstructureFormState> = {}): R.SubstructureFormState => ({
    label: "S1", supplierId: "x", otherSupplier: "", substructureType: TRACKER, dirty: new Set(["label"]), ...over,
  });

  it("UT-GEN-129 Add Inverter / Add Substructure show only with exposeInverterSubstructure (PO-approved DIVERGENCE)", () => {
    expect(commandBarState(cmdCtx()).addInverterType.visible).toBe(false);
    expect(commandBarState(cmdCtx()).addSubstructureType.visible).toBe(false);
    const shown = commandBarState(cmdCtx(), { exposeInverterSubstructure: true });
    expect(shown.addInverterType).toEqual({ visible: true, enabled: true, label: "Add Inverter" });
    expect(shown.addSubstructureType.label).toBe("Add Substructure");
    const edit = commandBarState(cmdCtx({ selection: { inverterType: simple({ id: "i1" }) } }), { exposeInverterSubstructure: true });
    expect(edit.addInverterType.label).toBe("Edit Inverter");
  });

  it("UT-GEN-130 supplier options: the canvas order, FullDisplayName and the Other Supplier row", () => {
    const rows = [
      { id: "o1", supplier: "Other Supplier", typeValues: [] },
      { id: "s", supplier: "SMA", typeValues: [STRING, CENTRAL] },
      { id: "o2", supplier: "Other Supplier", typeValues: [] },
    ];
    expect(R.plantSupplierOptions("inverter", rows).map((r) => r.id)).toEqual(["s", "o1", "o2"]);
    expect(R.plantSupplierOptions("substructure", rows).map((r) => r.id)).toEqual(["s", "o1"]);
    expect(R.plantSupplierDisplayName("inverter", rows[1]!)).toBe("SMA String,Central");
    expect(R.plantSupplierDisplayName("substructure", { id: "x", supplier: "Schletter", typeValues: [TRACKER] })).toBe("Schletter Tracker");
    expect(R.isPlantOtherSupplier("inverter", rows[0])).toBe(true);
    expect(R.isPlantOtherSupplier("inverter", { id: "o3", supplier: "Other Supplier", typeValues: [STRING] })).toBe(false);
    expect(R.isPlantOtherSupplier("inverter", null)).toBe(false);
  });

  it("UT-GEN-131 the inverter error texts are the canvas strings; the Other Supplier label shows (SOURCE DEFECT fix)", () => {
    const e = R.validateInverterForm(inverterForm({ warranty: "1.5", numberOfInverters: "2000000", nominalPower: "1.234" }), { otherSupplierChosen: false });
    expect(e.warranty).toBe("Value must be a integer");
    expect(e.numberOfInverters).toBe("Please select a value between 0 and 1,000,000.0.");
    expect(e.nominalPower).toBe("Numeric value with maximum of two decimals");
    expect(R.validateInverterForm(inverterForm({ warranty: "41" }), { otherSupplierChosen: false }).warranty)
      .toBe("Please select a value between 0 and 40.");
    const other = R.validateInverterForm(inverterForm({ otherSupplier: "", dirty: new Set(["otherSupplier"]) }), { otherSupplierChosen: true });
    expect(other.otherSupplier).toBe("Value cannot be blank.");
    expect(R.plantOtherSupplierErrorCanvasParity({ supplierDirty: true, supplierBlank: false, otherDirty: true, otherBlank: true })).toBe(false);
    const noSupplier = R.validateInverterForm(inverterForm({ supplierId: null, dirty: new Set(["supplier", "otherSupplier"]) }), { otherSupplierChosen: false });
    expect(noSupplier.supplier).toBe("Value cannot be blank.");
    expect(R.validateInverterForm(inverterForm({ inverterTypes: [], dirty: new Set(["inverterTypes"]) }), { otherSupplierChosen: false }).inverterTypes)
      .toBe("Value cannot be blank.");
  });

  it("UT-GEN-132 the inverter Save gate: the canvas lets a shown error through (twin), the fix does not", () => {
    const opts = { otherSupplierChosen: false };
    expect(R.canSaveInverter(inverterForm(), opts)).toBe(true);
    expect(R.canSaveInverterCanvasParity(inverterForm({ warranty: "1.5" }), opts)).toBe(true);
    expect(R.canSaveInverter(inverterForm({ warranty: "1.5" }), opts)).toBe(false);
    expect(R.canSaveInverter(inverterForm({ dirty: new Set() }), opts)).toBe(false);
    expect(R.canSaveInverter(inverterForm({ inverterTypes: [] }), opts)).toBe(false);
    expect(R.canSaveInverter(inverterForm(), { otherSupplierChosen: true })).toBe(false);
    expect(R.plantPanelSaveLabel("")).toBe("Save");
    expect(R.plantPanelSaveLabel("Acme")).toBe("Request permission");
    expect(R.effectiveOtherSupplier("Acme", false)).toBe("");
  });

  it("UT-GEN-133 the inverter save: the canvas Patch payload, then Plant PV Cost; Other Supplier is refused", () => {
    const plan = R.planSaveInverter({
      project: P, row: null, form: inverterForm(), otherSupplierChosen: false, deviceCostInverter: 80,
      pv: [{ cost: 100 }], inverters: [simple({ id: "i0", cost: 5 })], substructures: [{ cost: 7 }],
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual(["create:vsb_invertertypeinprojects", "update:vsb_projects"]);
    expect(plan.writes[0]!.data).toEqual({
      "vsb_Project@odata.bind": `/vsb_projects(${P.id})`, "vsb_Inverter@odata.bind": "/vsb_inverters(s)",
      vsb_inverterlabel: "INV A", vsb_invothersupplier: null, vsb_selectedinvertertypes: String(STRING),
      vsb_inverterwarranty: 20, vsb_numberofinverters: 10, vsb_inverternominalpower: 250,
      vsb_costperinverter: 20, vsb_invertertypecost: 200, [OBU]: "/businessunits(bu-1)",
    });
    expect(plan.writes[1]!.data).toEqual({ vsb_plantpvcost: 100 + 5 + 200 + 7 });
    const edit = R.planSaveInverter({
      project: P, row: simple({ id: "i0", cost: 5 }), form: inverterForm({ inverterTypes: [STRING, CENTRAL] }),
      otherSupplierChosen: false, deviceCostInverter: null, pv: [], inverters: [simple({ id: "i0", cost: 5 })], substructures: [],
    });
    expect(edit.writes[0]).toMatchObject({ op: "update", id: "i0" });
    expect(edit.writes[0]!.data).toMatchObject({ vsb_selectedinvertertypes: `${STRING},${CENTRAL}`, vsb_costperinverter: 0, vsb_invertertypecost: 0 });
    expect(edit.writes[1]!.data).toEqual({ vsb_plantpvcost: 0 });
    expect(R.planSaveInverter({
      project: P, row: null, form: inverterForm({ otherSupplier: "Acme" }), otherSupplierChosen: true, deviceCostInverter: 1,
      pv: [], inverters: [], substructures: [],
    }).refusedReason).toBe(R.EXCLUDED.permissionRequest);
  });

  it("UT-GEN-134 the substructure texts and Save gate; the canvas' inverted type seed is the twin", () => {
    const opts = { otherSupplierChosen: false };
    expect(R.canSaveSubstructure(substructureForm(), opts)).toBe(true);
    expect(R.canSaveSubstructure(substructureForm({ substructureType: null }), opts)).toBe(false);
    // Canvas: an edit of a typed row cannot save until the type is picked again …
    expect(R.canSaveSubstructureCanvasParity(substructureForm(), { ...opts, storedTypeValues: [TRACKER] })).toBe(false);
    expect(R.canSaveSubstructureCanvasParity(substructureForm({ dirty: new Set(["label", "substructureType"]) }), { ...opts, storedTypeValues: [TRACKER] })).toBe(true);
    // … and a new row saves with no type.
    expect(R.canSaveSubstructureCanvasParity(substructureForm({ substructureType: null }), { ...opts, storedTypeValues: [] })).toBe(true);
    const e = R.validateSubstructureForm(substructureForm({ supplierId: null, substructureType: null, dirty: new Set(["supplier", "substructureType"]) }), opts);
    expect(e.supplier).toBe("Supplier must be selected.");
    expect(e.substructureType).toBe("Substructure Type must be selected.");
    expect(R.validateSubstructureForm(substructureForm({ label: " ", dirty: new Set(["label"]) }), opts).label).toBe("Value cannot be blank.");
  });

  it("UT-GEN-135 the substructure save: mounting cost × PV capacity, then Plant PV Cost; the PV-capacity precondition", () => {
    const plan = R.planSaveSubstructure({
      project: P, row: null, form: substructureForm(), otherSupplierChosen: false, deviceCostFix: 100, deviceCostTracker: 200,
      plantPvCapacity: 10, pv: [{ cost: 100 }], inverters: [{ cost: 5 }], substructures: [],
    });
    expect(plan.writes[0]!.data).toEqual({
      "vsb_Project@odata.bind": `/vsb_projects(${P.id})`, "vsb_Substructure@odata.bind": "/vsb_substructures(x)",
      vsb_substrothersupplier: null, vsb_substructurelabel: "S1", vsb_selectedsubstructuretypes: String(TRACKER),
      vsb_substructurecost: 2000, [OBU]: "/businessunits(bu-1)",
    });
    expect(plan.writes[1]!.data).toEqual({ vsb_plantpvcost: 2105 });
    expect(R.substructureNeedsPvCapacity(null)).toBe(true);
    expect(R.substructureNeedsPvCapacity(0)).toBe(true);
    expect(R.substructureNeedsPvCapacity(10)).toBe(false);
    expect(R.SUBSTRUCTURE_MSG.infoText).toBe("Please add the module type first to calculate the cost correctly.");
  });

  it("UT-GEN-136 the panels prefill from the bound row", () => {
    expect(R.inverterFormDefaults(simple({
      label: "INV", catalogueId: "s", otherSupplier: null, typeValues: [CENTRAL], warranty: 20, numberOfInverters: 4, nominalPower: 250,
    }))).toMatchObject({ label: "INV", supplierId: "s", otherSupplier: "", inverterTypes: [CENTRAL], warranty: "20", numberOfInverters: "4", nominalPower: "250.0" });
    expect(R.inverterFormDefaults(null)).toMatchObject({ label: "", supplierId: null, inverterTypes: [], nominalPower: "" });
    expect(R.substructureFormDefaults(simple({ label: "S", catalogueId: "x", typeValues: [STRING, TRACKER] })).substructureType).toBe(STRING);
    expect(R.multiSelectText([])).toBeNull();
  });
});

describe("D27 G6 — Replace Generator / PV Module Type write plans (1.21.753)", () => {
  const P = { id: "11111111-1111-1111-1111-111111111111", shortName: "WPN", owningBusinessUnitId: "bu-1" };
  const inputs = (over: Partial<R.ReplaceInputs> = {}): R.ReplaceInputs => ({
    bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["w1", "w2"], allocations: [], landLeaseCosts: [], ...over,
  });

  it("UT-GEN-137 job 1: detach the O&M costs, delete units, device type and type, then add with the old count", () => {
    const plan = R.planReplaceGeneratorType({
      project: P, oldType: genType({ id: "t1", numberOfGenerators: 2 }), inCountry: true,
      model: model({ id: "g2", specificCapacity: 6, hubHeight: 150, rotorDiameter: 160 }), costPerWtg: 1000,
      selectedHeight: 150, revisedHubHeight: null,
      otherTypes: [genType({ id: "t2", generatorsCapacity: 3, generatorsCost: 4 })], otherTurbines: [turbine(7)], inputs: inputs(),
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "update:vsb_opexprojectcosts:o1", "delete:vsb_generatorinprojects:w1", "delete:vsb_generatorinprojects:w2",
      "delete:vsb_devicetypesinprojects:b1", "delete:vsb_generatortypeinprojects:t1",
      "create:vsb_generatortypeinprojects:", "create:vsb_generatorinprojects:", "create:vsb_generatorinprojects:",
      `update:vsb_projects:${P.id}`,
    ]);
    expect(plan.writes[0]!.data).toEqual({ "vsb_DeviceTypeInProject@odata.bind": null });
    expect(plan.writes[5]!.data).toMatchObject({ "vsb_Generator@odata.bind": "/vsb_generators(g2)", vsb_numberofgenerators: 2 });
    expect(plan.writes[6]!.data![GEN_INSTANCE_COL.name]).toBe("WTG WPN_8");
    expect(plan.writes[8]!.data).toEqual({ vsb_plantwtgcapacity: 15, vsb_plantwtgcost: 2004 });
    const args = {
      project: P, oldType: genType(), inCountry: true, model: model(), costPerWtg: 1, selectedHeight: 1,
      revisedHubHeight: null, otherTypes: [], otherTurbines: [], inputs: inputs(),
    };
    expect(R.planReplaceGeneratorType({ ...args, inCountry: false }).refusedReason).toBe(R.EXCLUDED.permissionRequest);
    expect(R.planReplaceGeneratorType({ ...args, oldType: genType({ flowRunId: "run" }) }).refusedReason).toBe(R.EXCLUDED.replaceWithOpenRequest);
  });

  it("UT-GEN-138 job 2: device type, AllWTG back-fill, allocations moved by position, surplus and old AllWTG removed, O&M re-linked", () => {
    const plan = R.planReplaceGeneratorTypeFollowUp({
      project: P, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId: null,
      newUnits: [{ id: "n1", name: "WTG WPN_8" }, { id: "n2", name: "WTG WPN_9" }],
      inputs: inputs({
        allocations: [
          { id: "m2", unitIndex: 2, allWtgAllocated: false }, { id: "m1", unitIndex: 1, allWtgAllocated: false },
          { id: "m3", unitIndex: 3, allWtgAllocated: false }, { id: "aw", unitIndex: 1, allWtgAllocated: true },
        ],
        landLeaseCosts: [{ id: "c1", landOwner: "M", description: "A", allWtgAllocated: true }],
      }),
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "create:vsb_devicetypesinprojects:", "create:vsb_landleaseallocationwtgs:", "create:vsb_landleaseallocationwtgs:",
      "update:vsb_landleaseallocationwtgs:m1", "update:vsb_landleaseallocationwtgs:m2",
      "delete:vsb_landleaseallocationwtgs:m3", "delete:vsb_landleaseallocationwtgs:aw", "update:vsb_opexprojectcosts:o1",
    ]);
    expect(plan.writes[3]!.data).toEqual({ "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(n1)" });
    expect(plan.writes[4]!.data).toEqual({ "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(n2)" });
    expect(plan.writes[7]!.data).toEqual({ "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(@created#0)" });
    expect(plan.unmatchedCount).toBe(1);
    const existing = R.planReplaceGeneratorTypeFollowUp({
      project: P, newTypeId: "tN", newTypeName: "x", existingBridgeId: "b9", newUnits: [], inputs: inputs(),
    });
    expect(existing.writes.map((w) => w.entitySet)).toEqual(["vsb_opexprojectcosts"]);
    expect(existing.writes[0]!.data).toEqual({ "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(b9)" });
  });

  it("UT-GEN-139 Replace PV: job 1 detaches and deletes, then adds; job 2 makes the unit, moves the land lease, re-links O&M", () => {
    const first = R.planReplacePvType({
      project: P, oldPv: simple({ id: "pvA" }), form: pvForm({ supplier: "m1", capacity: "10" }), deviceCostModules: 300,
      otherSupplierChosen: false, inputs: inputs({ unitIds: ["u1"] }),
    });
    expect(first.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "update:vsb_opexprojectcosts:o1", "delete:vsb_generatorinprojects:u1", "delete:vsb_devicetypesinprojects:b1",
      "delete:vsb_pvmoduletypeinprojects:pvA", "create:vsb_pvmoduletypeinprojects:",
    ]);
    expect(first.writes[4]!.data).toMatchObject({ "vsb_PVModule@odata.bind": "/vsb_pvmodules(m1)", vsb_cost: 3000 });
    expect(R.planReplacePvType({
      project: P, oldPv: simple({ flowRunId: "r" }), form: pvForm(), deviceCostModules: 1, otherSupplierChosen: false, inputs: inputs(),
    }).refusedReason).toBe(R.EXCLUDED.replaceWithOpenRequest);
    const second = R.planReplacePvTypeFollowUp({
      project: P, newPvId: "pvN", newPvName: "PVT-0009", existingBridgeId: null,
      inputs: inputs({
        allocations: [{ id: "m1", unitIndex: 0, allWtgAllocated: false }, { id: "aw", unitIndex: 0, allWtgAllocated: true }],
        landLeaseCosts: [{ id: "c1", landOwner: "M", description: "A", allWtgAllocated: true }],
      }),
      pvRows: [{ capacity: 10, cost: 3000 }], inverters: [{ cost: 1 }], substructures: [{ cost: 2 }],
    });
    expect(second.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "create:vsb_devicetypesinprojects:", "create:vsb_generatorinprojects:", "create:vsb_landleaseallocationwtgs:",
      "update:vsb_landleaseallocationwtgs:m1", "delete:vsb_landleaseallocationwtgs:aw", `update:vsb_projects:${P.id}`,
      "update:vsb_opexprojectcosts:o1",
    ]);
    expect(second.writes[2]!.data!["vsb_GeneratorInProject@odata.bind"]).toBe("/vsb_generatorinprojects(@created#1)");
    expect(second.writes[3]!.data).toEqual({ "vsb_GeneratorInProject@odata.bind": "/vsb_generatorinprojects(@created#1)" });
    expect(second.writes[5]!.data).toEqual({ vsb_plantpvcapacitymwp: 10, vsb_plantpvcost: 3003 });
    expect(second.writes[6]!.data).toEqual({ "vsb_DeviceTypeInProject@odata.bind": "/vsb_devicetypesinprojects(@created#0)" });
  });

  it("UT-GEN-140 the Identify capture keeps each allocation's unit index and its cost's AllWTG flag", () => {
    expect(R.toReplaceAllocations({
      allocations: [{ id: "a1", costId: "c1", turbineId: "w2" }, { id: "a2", costId: "c2", turbineId: "w9" }],
      units: [turbine(2, { id: "w2" })], allWtgCostIds: new Set(["c2"]),
    })).toEqual([
      { id: "a1", unitIndex: 2, allWtgAllocated: false },
      { id: "a2", unitIndex: 0, allWtgAllocated: true },
    ]);
    expect(R.planReplacePvLandLease([
      { id: "m", unitIndex: 0, allWtgAllocated: false }, { id: "a", unitIndex: 0, allWtgAllocated: true },
    ])).toEqual({ repoint: ["m"], removeAllWtg: ["a"] });
  });
});

describe("command bar sub-menu (ItemParentKey)", () => {
  it("UT-GEN-141 BESS / Hydrogen / Substation sit under Add Others until their row is selected; Inverter / Substructure always do", () => {
    const none = { storage: false, hydrogen: false, substation: false };
    expect(R.commandParentKey("addStorage", none)).toBe("addOthers");
    expect(R.commandParentKey("addHydrogen", none)).toBe("addOthers");
    expect(R.commandParentKey("addSubstation", none)).toBe("addOthers");
    expect(R.commandParentKey("addStorage", { ...none, storage: true })).toBeUndefined();
    expect(R.commandParentKey("addHydrogen", { ...none, hydrogen: true })).toBeUndefined();
    expect(R.commandParentKey("addSubstation", { ...none, substation: true })).toBeUndefined();
    // G9 divergence: exposed, but inside the drop-down so the top level stays the canvas one.
    expect(R.commandParentKey("addInverterType", none)).toBe("addOthers");
    expect(R.commandParentKey("addSubstructureType", none)).toBe("addOthers");
    for (const k of ["addWTGType", "addPVType", "addOthers", "deleteGeneratorType", "replaceGeneratorType"] as const) {
      expect(R.commandParentKey(k, none)).toBeUndefined();
    }
  });
});
