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
import { CHOICE_PLANT } from "@/data/entities";
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
  TOTAL_CAPACITY_LABEL, catalogTotalHeight, typeSummaryTooltip, TYPE_DETAIL_FIELD_LABELS,
  ADD_GENERATOR_LABEL, TURBINE_TABLE_LABELS, GENERATOR_TYPE_SAVED_BANNER,
  PV_PANEL_TITLES, PV_FIELD_LABELS, PV_SUPPLIER_PLACEHOLDER, PV_TYPE_COL,
  validatePvTypeForm, canSavePvType, pvSupplierOptions, buildPvTypeFields,
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
        mounting: "tracker", deviceCostFix: 100, deviceCostTracker: 180,
        plantPvCapacityMwp: 20,
      }),
    ).toBe(3_600);
    expect(
      substructureCost({
        mounting: "fix", deviceCostFix: 100, deviceCostTracker: 180, plantPvCapacityMwp: 20,
      }),
    ).toBe(2_000);
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
        dirty: new Set(["cost"]),
        numberOfGenerators: "4",
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
    expect(validateNumberOfGenerators("4.5")).toBe(MSG.turbineNameNumeric);
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

  it("UT-GEN-051 Save stays disabled until something is dirty", () => {
    const clean: TypeFormState = {
      supplier: "Vestas", turbineType: "V150", hubHeight: 148, revisedHubHeight: "",
      numberOfGenerators: "4", cost: "900000", dirty: new Set<string>(),
    };
    const errors = validateTypeForm(clean, {
      isoCurrencyCode: "EUR", derivedCostPerWtg: 900_000,
    });
    expect(Object.values(errors).every((e) => e === null)).toBe(true);
    expect(
      canSaveType({
        errors, dirty: clean.dirty, numberOfGenerators: clean.numberOfGenerators,
        heightBlocked: false,
      }),
    ).toBe(false);
    expect(
      canSaveType({
        errors, dirty: new Set(["cost"]), numberOfGenerators: "4", heightBlocked: false,
      }),
    ).toBe(true);
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
    expect(plans[0].name).toBe("Meyer-Field A-WTG WPN_1");
    expect(plans[1].name).toBe("Meyer-Field A-WTG WPN_2");
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

  it("q09 — a catalogue model's Total Height is hub height + ½ rotor diameter", () => {
    expect(catalogTotalHeight(model({ hubHeight: 118, rotorDiameter: 163 }))).toBe(199.5);
    expect(catalogTotalHeight(null)).toBe(0);
    expect(catalogTotalHeight(model({ hubHeight: null, rotorDiameter: null }))).toBe(0);
  });

  it("q08 — the hover tooltip is verbatim, including the trailing separator", () => {
    expect(
      typeSummaryTooltip({
        supplier: "Nordex", typeLabel: "N163-6.8", hubHeight: 118, totalHeight: 199.5,
      }),
    ).toBe("Nordex | N163-6.8 MW | 118m Hub Height | 200m Total Height |");
  });

  it("q08 — the tooltip tolerates missing data", () => {
    expect(
      typeSummaryTooltip({
        supplier: null, typeLabel: null, hubHeight: null, totalHeight: null,
      }),
    ).toBe(" |  MW | 0m Hub Height | 0m Total Height |");
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
  it("q11 — Module Label, Capacity and Supplier are required", () => {
    const errors = validatePvTypeForm(
      pvForm({ moduleLabel: "", capacity: "", supplier: null }),
    );
    expect(errors.moduleLabel).toBe(MSG.inputBlank);
    expect(errors.capacity).toBe(MSG.inputBlank);
    expect(errors.supplier).toBe(MSG.inputBlank);
  });

  it("q11 — the Degradation fields are optional", () => {
    const errors = validatePvTypeForm(pvForm());
    expect(errors.degradation1stYear).toBeNull();
    expect(errors.degradationRemainingYears).toBeNull();
  });

  it("q11 — an entered Degradation value must be a percentage", () => {
    const errors = validatePvTypeForm(
      pvForm({ degradation1stYear: "150", degradationRemainingYears: "-5" }),
    );
    expect(errors.degradation1stYear).toBe(MSG.percentageRange);
    expect(errors.degradationRemainingYears).toBe(MSG.percentageRange);
  });

  it("q11 — a fully filled form has no errors", () => {
    const errors = validatePvTypeForm(
      pvForm({ degradation1stYear: "2.5", degradationRemainingYears: "0.5" }),
    );
    expect(Object.values(errors).every((e) => e === null)).toBe(true);
  });

  it("canSavePvType gates on dirty AND valid, like the WTG type panel", () => {
    const errors = validatePvTypeForm(pvForm());
    expect(canSavePvType(errors, new Set())).toBe(false);
    expect(canSavePvType(errors, new Set(["moduleLabel"]))).toBe(true);
    const invalid = validatePvTypeForm(pvForm({ moduleLabel: "" }));
    expect(canSavePvType(invalid, new Set(["moduleLabel"]))).toBe(false);
  });

  it("pvSupplierOptions dedupes and sorts the project's existing PV suppliers", () => {
    expect(
      pvSupplierOptions([
        simple({ supplier: "JA Solar" }),
        simple({ supplier: "Trina Solar" }),
        simple({ supplier: "JA Solar" }),
        simple({ supplier: null }),
      ]),
    ).toEqual(["JA Solar", "Trina Solar"]);
  });

  it("buildPvTypeFields maps the panel to vsb_PvModuleTypeInProject columns", () => {
    const fields = buildPvTypeFields(
      pvForm({ capacity: "12.50", degradation1stYear: "2", degradationRemainingYears: "" }),
      { deviceCostModules: 300 },
    );
    expect(fields).toEqual({
      [PV_TYPE_COL.label]: "JA Solar 550W",
      [PV_TYPE_COL.supplier]: "JA Solar",
      [PV_TYPE_COL.capacity]: 12.5,
      [PV_TYPE_COL.costPerPower]: 300,
      [PV_TYPE_COL.cost]: 300 * 12.5,
      [PV_TYPE_COL.degradation1stYear]: 2,
      [PV_TYPE_COL.degradationRemainingYears]: null,
    });
  });
});
