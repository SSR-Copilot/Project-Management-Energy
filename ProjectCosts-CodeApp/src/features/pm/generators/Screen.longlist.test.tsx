// @vitest-environment jsdom
/**
 * UT-GENPERF-350.. — the long turbine list (D143, item 8a): an expanded WTG card with many turbines carries `content-visibility: auto`
 * and nothing else about the list changes (every row, button and test id is still in the DOM). `./hooks` is mocked, as in the other
 * Screen tests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { LONG_TURBINE_LIST_ROWS, isLongTurbineList } from "./sections/longList";
import type { CatalogModel, GeneratorTypeRow, TurbineRow } from "./rules";

const baseProject = {
  id: "11111111-1111-1111-1111-111111111111", projectIdText: "DE-0001", projectName: "Windpark Nord", shortName: "WPN",
  countryId: "c-de", countryName: "Germany", countryOptionValue: 952850000, isoCurrencyCode: "EUR",
  totalCapacity: 30, fid: "2028-06-01", endDate: "2055-12-31", projectStartDate: "2026-01-01",
  projectManagerId: "pm-1", projectManagerEmail: null, owningBusinessUnitId: "bu-1", plantPvCapacity: 10,
  plantWtgCapacity: 20, plantStorageCapacity: 0, plantHydrogenCapacity: 0, plantSubstationCapacity: 0,
};
const MODEL: CatalogModel = {
  id: "g1", name: "V150", displayName: "Vestas V150-5.6 - available", supplier: "Vestas", turbineType: "V150",
  hubHeight: 148, rotorDiameter: 150, specificCapacity: 5.6, totalHeight: 223, earliestPhaseout: "2035-01-01",
  countryAvailability: [952850000], foundationCostIncluded: true, additionalFoundationCost: 0,
  prices: [1_000_000, 950_000, 900_000, 850_000, 800_000],
};
const type = (id: string): GeneratorTypeRow => ({
  id, name: id, generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 2,
  costPerWtg: 950_000, generatorsCost: 1_900_000, generatorsCapacity: 11.2, requestPermissionState: null,
  flowRunId: null, flowApprovalId: null, status: CHOICE_PLANT.status.active, specificCapacity: null,
});
const turbine = (typeId: string, i: number): TurbineRow => ({
  id: `${typeId}-w${i}`, name: `WTG WPN_${i}`, typeId, index: i, effectiveCapacity: 5.6, effectiveHubHeight: null,
  effectiveHubHeightChanged: false, foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status: 0,
});

const state = vi.hoisted(() => ({ types: [] as unknown[], turbines: [] as unknown[] }));
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "11111111-1111-1111-1111-111111111111", locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true, hasData: true, placeholder: false });
vi.mock("./hooks", () => ({
  SERVER_DECIDES: {
    canEdit: true, editPermission: true, pvEditPermission: true,
    deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  },
  useGeneratorsProject: () => ok(baseProject),
  useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
  useGeneratorTypes: () => ok(state.types),
  useModulePermissionFlows: () => ({ request: async () => ({}), cancel: async () => {}, cancelIfOpen: async () => {} }),
  useGeneratorModels: () => ok([MODEL]),
  useGeneratorCatalog: () => ok([MODEL]),
  useInflationIndex: () => ok(1),
  useDeviceCosts: () => ok({ modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }),
  useProjectTurbines: () => ok(state.turbines),
  usePvModuleCatalog: () => ok([]),
  usePvModuleTypes: () => ok([]),
  useInverterTypes: () => ok([]),
  useSubstructureTypes: () => ok([]),
  useSimpleTypes: () => ok([]),
  useAllWtgLandLeaseCosts: () => ok([]),
  useOpexDependency: () => ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
  useEntraObjectId: () => "pm-1",
  useGeneratorWrites: () => ({ run: async () => ["x"], progress: null, error: null, success: null, clear: () => {}, refreshing: false }),
  loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
  loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
  loadAllocations: async () => ({ allocations: [], countByCost: {} }),
  loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
  loadPvDeleteInputs: async () => ({ unitIds: [], allocations: [], countByCost: {}, opexCostIds: [] }),
  loadReplaceInputs: async () => ({ bridgeIds: [], opexCostIds: [], unitIds: [], allocations: [], landLeaseCosts: [] }),
  usePlantSupplierCatalog: () => ok([]),
}));

import GeneratorsScreen from "./Screen";

afterEach(() => cleanup());

const tree = () => (
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><GeneratorsScreen /></MemoryRouter>
  </FluentProvider>
);

/** Every CSS rule text in the document that sets `content-visibility`, so a card's classes can be matched against it. */
const contentVisibilityRules = (): string[] =>
  [...document.styleSheets].flatMap((s) => [...s.cssRules]).map((r) => r.cssText).filter((t) => t.includes("content-visibility"));

const cardOf = (typeId: string) => screen.getByTestId(`gal_Generators_DisplayProject_Body_Form_GeneratorTypes-select-${typeId}`).closest('[role="listitem"]')!;
const hasContentVisibility = (el: Element) => {
  const rules = contentVisibilityRules();
  return [...el.classList].some((c) => rules.some((r) => r.includes(`.${c}`)));
};

describe("long turbine lists (D143, item 8a)", () => {
  it("UT-GENPERF-350 a list is long from LONG_TURBINE_LIST_ROWS rows up (pure rule)", () => {
    expect(isLongTurbineList(LONG_TURBINE_LIST_ROWS - 1)).toBe(false);
    expect(isLongTurbineList(LONG_TURBINE_LIST_ROWS)).toBe(true);
    expect(isLongTurbineList(30)).toBe(true);
    expect(isLongTurbineList(0)).toBe(false);
  });

  it("UT-GENPERF-351 an EXPANDED card with a long list carries content-visibility; a short list, and a folded card, do not", () => {
    state.types = [type("long"), type("short")];
    state.turbines = [
      ...Array.from({ length: 12 }, (_, i) => turbine("long", i + 1)),
      ...Array.from({ length: 3 }, (_, i) => turbine("short", i + 1)),
    ];
    render(tree());
    // Folded: even the long list's card is a plain card (nothing to skip, and the header must always paint).
    expect(hasContentVisibility(cardOf("long"))).toBe(false);
    const downs = screen.getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down");
    fireEvent.click(downs[0]!);
    fireEvent.click(screen.getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down")[0]!);
    expect(hasContentVisibility(cardOf("long"))).toBe(true);
    expect(hasContentVisibility(cardOf("short"))).toBe(false);
  });

  it("UT-GENPERF-352 the long list is still all there: every row, its edit and delete buttons and test ids, with no windowing", () => {
    state.types = [type("long")];
    state.turbines = Array.from({ length: 30 }, (_, i) => turbine("long", i + 1));
    render(tree());
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    for (const i of [1, 15, 30]) {
      expect(screen.getByTestId(`generators-turbine-edit-long-w${i}`)).toBeTruthy();
      expect(screen.getByTestId(`generators-turbine-delete-long-w${i}`)).toBeTruthy();
    }
    expect(screen.getAllByTestId(/^generators-turbine-edit-/)).toHaveLength(30);
    // Rows are plain table rows, reachable by role and by keyboard focus.
    const edit = screen.getByTestId("generators-turbine-edit-long-w15") as HTMLButtonElement;
    edit.focus();
    expect(document.activeElement).toBe(edit);
  });
});
