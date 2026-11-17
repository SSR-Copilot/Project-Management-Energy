// @vitest-environment jsdom
/**
 * UT-GEN-1270.. — the Screen with the REAL `useGeneratorWrites` / `usePlanWrite` (generators fix F8, GT-2; and the F2 message end to end).
 * `Screen.test.tsx` mocks `./hooks` whole and `Screen.rollback.test.tsx` / `Screen.delete.test.tsx` re-implement the write hook, so no
 * Screen test saw what `usePlanWrite` really shows: the error text built from a failed plan, the second-job message, the refresh of
 * the four cache keys. Only `executePlan` (the SDK seam) and the reads are stubbed here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { PARTLY_SAVED_NOTE } from "@/data/usePlanWrite";
import { WRITE_ERROR, type CatalogModel, type GeneratorTypeRow, type SimpleTypeRow, type TurbineRow } from "./rules";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const baseProject = {
  id: PROJECT_ID, projectIdText: "DE-0001", projectName: "Windpark Nord", shortName: "WPN",
  countryId: "c-de", countryName: "Germany", countryOptionValue: 952850000, isoCurrencyCode: "EUR",
  totalCapacity: 30, fid: "2028-06-01", endDate: "2055-12-31", projectStartDate: "2026-01-01",
  projectManagerId: "pm-1", projectManagerEmail: null, owningBusinessUnitId: "bu-1", plantPvCapacity: 10,
  plantWtgCapacity: 20, plantStorageCapacity: 5, plantHydrogenCapacity: 0, plantSubstationCapacity: 0,
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
const BESS = row({ id: "s1", name: "BESS North", supplier: "Tesla", capacity: 5, energyCapacity: 10 });

const h = vi.hoisted(() => ({
  queue: [] as (() => unknown)[],
  followUp: { fail: false },
  flows: { request: vi.fn(async () => ({ runid: "r", approvalid: "a" })), cancel: vi.fn(async () => {}), cancelIfOpen: vi.fn(async () => {}) },
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return { ...mod, executePlan: vi.fn(async () => h.queue.shift()!()) };
});
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "11111111-1111-1111-1111-111111111111", locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true, hasData: true, placeholder: false });
vi.mock("./hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks")>();
  return {
    SERVER_DECIDES: actual.SERVER_DECIDES,
    // The REAL write hook (usePlanWrite with the screen's four cache keys); everything else is a fixed read.
    useGeneratorWrites: actual.useGeneratorWrites,
    useGeneratorsProject: () => ok(baseProject),
    useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
    useGeneratorTypes: () => ok([TYPE]),
    useModulePermissionFlows: () => h.flows,
    useGeneratorModels: () => ok([MODEL]),
    useGeneratorCatalog: () => ok([MODEL]),
    useInflationIndex: () => ok(1),
    useDeviceCosts: () => ok({ modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }),
    useProjectTurbines: () => ok([turbine(1), turbine(2)]),
    usePvModuleCatalog: () => ok([{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }]),
    usePvModuleTypes: () => ok([PV]),
    useInverterTypes: () => ok([]),
    useSubstructureTypes: () => ok([]),
    useSimpleTypes: (family: string) => ok(family === "storage" ? [BESS] : []),
    useAllWtgLandLeaseCosts: () => ok([]),
    useOpexDependency: () => ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
    useEntraObjectId: () => "pm-1",
    loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
    loadPvFollowUpInputs: async () => {
      if (h.followUp.fail) throw new Error("the device-type read failed");
      return { pvName: "PVT-0002", unitId: null, hasDeviceType: true };
    },
    loadAllocations: async () => ({ allocations: [], countByCost: {} }),
    loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
    loadPvDeleteInputs: async () => ({ unitIds: [], allocations: [], countByCost: {}, opexCostIds: [] }),
    loadReplaceInputs: async () => ({ bridgeIds: [], opexCostIds: [], unitIds: [], allocations: [], landLeaseCosts: [] }),
    usePlantSupplierCatalog: () => ok([]),
  };
});

import { PlanError } from "@/data/executePlan";
import GeneratorsScreen from "./Screen";

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const view = render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={qc}><MemoryRouter><GeneratorsScreen /></MemoryRouter></QueryClientProvider>
    </FluentProvider>,
  );
  return { ...view, spy };
}

afterEach(() => { cleanup(); h.queue = []; h.followUp.fail = false; });

const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar" });

describe("a failed delete, with the real write hook", () => {
  it("UT-GEN-1270 Delete BESS that the server refuses shows the canvas error text with the cause and refreshes the four cache keys", async () => {
    h.queue = [() => { throw new PlanError(0, 2, "delete the BESS type", new Error("HTTP 409 Conflict")); }];
    const { spy } = renderScreen();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_Storage_1-select-s1"));
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Delete BESS" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const banner = await screen.findByTestId("generators-write-error");
    expect(banner.textContent).toContain(WRITE_ERROR.storageDelete("“delete the BESS type” failed: HTTP 409 Conflict."));
    expect(banner.textContent).toContain("HTTP 409 Conflict");
    await waitFor(() => expect(spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey)).toEqual([
      qk.generatorsAll(PROJECT_ID), qk.project(PROJECT_ID), qk.milestoneProject(PROJECT_ID), qk.generalDataProject(PROJECT_ID),
    ]));
    // The screen is still usable: the delete is offered again.
    expect((within(commandBar()).getByRole("button", { name: "Delete BESS" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("a PV save whose second step fails (F2), with the real write hook", () => {
  it("UT-GEN-1271 the user is told the PV type WAS saved and not to add it again", async () => {
    h.followUp.fail = true;
    h.queue = [() => ({ done: 1, createdIds: ["pv-new"], createdRows: {}, landed: [{ entitySet: "vsb_pvmoduletypeinprojects", id: "pv-new" }], deleted: [], maybeLanded: [] })];
    renderScreen();
    fireEvent.click(within(commandBar()).getByRole("button", { name: "Add PV Module Type" }));
    fireEvent.change(await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"), { target: { value: "JA 600" } });
    fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"));
    fireEvent.click(await screen.findByRole("option", { name: "JA Solar 550" }));
    const save = screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    const banner = await screen.findByTestId("generators-write-error");
    expect(banner.textContent).toContain("the device-type read failed");
    expect(banner.textContent).toContain("1 of 1 changes had already been saved");
    expect(banner.textContent).toContain(PARTLY_SAVED_NOTE);
  });
});
