// @vitest-environment jsdom
/**
 * UT-GENPERF-330.. — render counts of the split Generators Screen (D143, item 7). Each family section is a memoized component
 * (`sections/`) that reports its renders through `sectionRenderProbe`; a change to ONE family's data, selection or folding, or a
 * keystroke in a panel, must not re-render the others. `./hooks` is mocked, as in `Screen.gate.test.tsx`, with stable row arrays
 * per family, so a "query update" is a new array for that family only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { sectionRenderProbe } from "./sections/renderProbe";
import type { CatalogModel, GeneratorTypeRow, SimpleTypeRow, TurbineRow } from "./rules";

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
const TYPE: GeneratorTypeRow = {
  id: "t1", name: "WTG-0001", generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 2,
  costPerWtg: 950_000, generatorsCost: 1_900_000, generatorsCapacity: 11.2, requestPermissionState: null,
  flowRunId: null, flowApprovalId: null, status: CHOICE_PLANT.status.active, specificCapacity: null,
};
const turbine = (i: number): TurbineRow => ({
  id: `w${i}`, name: `WTG WPN_${i}`, typeId: "t1", index: i, effectiveCapacity: 5.6, effectiveHubHeight: null,
  effectiveHubHeightChanged: false, foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status: 0,
});
const row = (over: Partial<SimpleTypeRow>): SimpleTypeRow => ({
  id: "r", name: null, supplier: null, otherSupplier: null, capacity: null, cost: null, moduleLabel: null,
  degradation1stYear: null, degradationRemainingYears: null, requestPermissionState: null, flowRunId: null,
  flowApprovalId: null, status: 0, ...over,
});
const PV = row({ id: "pv1", name: "PVT-0001", moduleLabel: "JA 550", catalogueId: "m1", catalogueSupplier: "JA Solar", capacity: 10, cost: 3000 });
const INVERTER = row({ id: "i1", name: "INV-0001", supplier: "SMA" });
const SUBSTRUCTURE = row({ id: "ss1", name: "SUB-0001", supplier: "Gamesa" });
const BESS = row({ id: "s1", name: "BESS North", supplier: "Tesla", capacity: 5, energyCapacity: 10 });
const H2 = row({ id: "h1", name: "H2 East", supplier: "Nel", capacity: 2 });
const SUBST = row({ id: "su1", name: "Substation West", supplier: "ABB", capacity: 3 });

const data = vi.hoisted(() => ({
  types: [] as unknown[], turbines: [] as unknown[], pv: [] as unknown[], inverter: [] as unknown[], substructure: [] as unknown[],
  storage: [] as unknown[], hydrogen: [] as unknown[], substation: [] as unknown[],
}));
const SESSION = vi.hoisted(() => ({
  projectId: "11111111-1111-1111-1111-111111111111", locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" },
}));
vi.mock("@/app/SessionContext", () => ({ useSession: () => SESSION }));

const ok = <T,>(d: T) => ({ data: d, isLoading: false, error: undefined, connected: true, hasData: true, placeholder: false });
const STABLE = vi.hoisted(() => ({
  planning: { isHeightLimitationForWtg: false, heightLimitation: null },
  device: { modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 },
  opex: { hasActiveDeviceType: false, hasActiveOpexCost: false },
  flows: { request: async () => ({}), cancel: async () => {}, cancelIfOpen: async () => {} },
  empty: [] as unknown[],
}));
vi.mock("./hooks", () => ({
  SERVER_DECIDES: {
    canEdit: true, editPermission: true, pvEditPermission: true,
    deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  },
  useGeneratorsProject: () => ok(PROJECT_ROW),
  useProjectPlanning: () => ok(STABLE.planning),
  useGeneratorTypes: () => ok(data.types),
  useModulePermissionFlows: () => STABLE.flows,
  useGeneratorModels: () => ok(MODELS),
  useGeneratorCatalog: () => ok(MODELS),
  useInflationIndex: () => ok(1),
  useDeviceCosts: () => ok(STABLE.device),
  useProjectTurbines: () => ok(data.turbines),
  usePvModuleCatalog: () => ok(PV_CATALOGUE),
  usePvModuleTypes: () => ok(data.pv),
  useInverterTypes: () => ok(data.inverter),
  useSubstructureTypes: () => ok(data.substructure),
  useSimpleTypes: (family: string) => ok(family === "storage" ? data.storage : family === "hydrogen" ? data.hydrogen : data.substation),
  useAllWtgLandLeaseCosts: () => ok(STABLE.empty),
  useOpexDependency: () => ok(STABLE.opex),
  useEntraObjectId: () => "pm-1",
  useGeneratorWrites: () => WRITES,
  loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
  loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
  loadAllocations: async () => ({ allocations: [], countByCost: {} }),
  loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
  loadPvDeleteInputs: async () => ({ unitIds: [], allocations: [], countByCost: {}, opexCostIds: [] }),
  loadReplaceInputs: async () => ({ bridgeIds: [], opexCostIds: [], unitIds: [], allocations: [], landLeaseCosts: [] }),
  usePlantSupplierCatalog: () => ok(STABLE.empty),
}));
// Constants the mock factory reads lazily (hoisted mocks cannot close over later `const`s, so they are looked up at call time).
const PROJECT_ROW = baseProject;
const MODELS = [MODEL];
const PV_CATALOGUE = [{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }];
const WRITES = { run: vi.fn(async () => ["x"] as string[]), progress: null, error: null, success: null, clear: () => {}, refreshing: false };

import GeneratorsScreen from "./Screen";

const tree = () => (
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><GeneratorsScreen /></MemoryRouter>
  </FluentProvider>
);

const NAMES = ["wtg", "pv", "inverter", "substructure", "storage", "hydrogen", "substation"] as const;
type Counts = Record<(typeof NAMES)[number], number>;
let counts: Counts;
const snapshot = (): Counts => ({ ...counts });
/** The sections whose render count moved since `before`. */
const moved = (before: Counts) => NAMES.filter((n) => counts[n] !== before[n]);

beforeEach(() => {
  data.types = [TYPE];
  data.turbines = [turbine(1), turbine(2)];
  data.pv = [PV];
  data.inverter = [INVERTER];
  data.substructure = [SUBSTRUCTURE];
  data.storage = [BESS];
  data.hydrogen = [H2];
  data.substation = [SUBST];
  counts = { wtg: 0, pv: 0, inverter: 0, substructure: 0, storage: 0, hydrogen: 0, substation: 0 };
  sectionRenderProbe.current = (name) => { counts[name as keyof Counts] += 1; };
});
afterEach(() => {
  cleanup();
  sectionRenderProbe.current = null;
});

describe("the family sections re-render only for their own data (D143)", () => {
  it("UT-GENPERF-330 the first render draws each of the seven sections, and nothing draws them twice for the same data", async () => {
    const { rerender } = render(tree());
    expect(NAMES.map((n) => counts[n]).every((c) => c >= 1)).toBe(true);
    const before = snapshot();
    // The screen re-renders (a new element) with no data change: every memoized section skips.
    rerender(tree());
    expect(moved(before)).toEqual([]);
  });

  it("UT-GENPERF-331 an update of the storage query re-renders the storage section only", () => {
    const { rerender } = render(tree());
    const before = snapshot();
    data.storage = [BESS, row({ id: "s2", name: "BESS South", supplier: "Fluence", capacity: 7, energyCapacity: 14 })];
    rerender(tree());
    expect(moved(before)).toEqual(["storage"]);
    expect(screen.getByText("BESS South")).toBeTruthy();
  });

  it("UT-GENPERF-332 an update of the PV query re-renders the PV section only", () => {
    const { rerender } = render(tree());
    const before = snapshot();
    data.pv = [PV, row({ id: "pv2", name: "PVT-0002", moduleLabel: "Trina 600", capacity: 12, cost: 3600 })];
    rerender(tree());
    expect(moved(before)).toEqual(["pv"]);
    expect(screen.getByText("Trina 600")).toBeTruthy();
  });

  it("UT-GENPERF-333 an update of the inverter, substructure, hydrogen or substation query moves only its own section", () => {
    const { rerender } = render(tree());
    for (const [key, name] of [["inverter", "inverter"], ["substructure", "substructure"], ["hydrogen", "hydrogen"], ["substation", "substation"]] as const) {
      const before = snapshot();
      data[key] = [...(data[key] as SimpleTypeRow[]), row({ id: `${key}-2`, name: `${key}-two` })];
      rerender(tree());
      expect(moved(before)).toEqual([name]);
    }
  });

  it("UT-GENPERF-334 an update of the turbines or the types re-renders the WTG section only", () => {
    const { rerender } = render(tree());
    let before = snapshot();
    data.turbines = [turbine(1), turbine(2), turbine(3)];
    rerender(tree());
    expect(moved(before)).toEqual(["wtg"]);
    before = snapshot();
    data.types = [{ ...TYPE, numberOfGenerators: 3 }];
    rerender(tree());
    expect(moved(before)).toEqual(["wtg"]);
  });

  it("UT-GENPERF-335 selecting or folding a card re-renders the section of its family only", async () => {
    render(tree());
    let before = snapshot();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_PvModule-select-pv1"));
    await waitFor(() => expect(within(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_PvModule")).getByText("JA Solar")).toBeTruthy());
    expect(moved(before)).toEqual(["pv"]);
    before = snapshot();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_Storage_Down_1"));
    await waitFor(() => expect(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_Storage_Up_1")).toBeTruthy());
    // The storage card opens and takes the selection; the PV card loses it: exactly those two sections move.
    expect(moved(before)).toEqual(["pv", "storage"]);
  });

  it("UT-GENPERF-336 opening a panel and typing in it re-render no section", async () => {
    render(tree());
    const bar = screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar" });
    fireEvent.click(within(bar).getByRole("button", { name: "Add PV Module Type" }));
    const label = await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label");
    // The panel opened (selection untouched by Add PV with none selected): from here every keystroke is panel state only.
    const before = snapshot();
    fireEvent.change(label, { target: { value: "JA 600" } });
    fireEvent.change(label, { target: { value: "JA 6000" } });
    expect((label as HTMLInputElement).value).toBe("JA 6000");
    expect(moved(before)).toEqual([]);
  });
});
