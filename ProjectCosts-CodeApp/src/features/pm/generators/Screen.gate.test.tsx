// @vitest-environment jsdom
/**
 * UT-GENPERF-040.. — the split load gate as the Generators Screen shows it (D141, `GENERATORS_PERF.gateByList`).
 * `./hooks` is mocked, as in `Screen.guards.test.tsx`; the four lazy hooks record the `enabled` they were given and answer
 * "no answer yet" until a test says they have landed. `run` is a stub that returns the job.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import type { WritePlan } from "@/data/writePlan";
import { GENERATORS_SCREEN_TEXT, type CatalogModel, type GeneratorTypeRow, type SimpleTypeRow, type TurbineRow } from "./rules";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const baseProject = {
  id: PROJECT_ID, projectIdText: "DE-0001", projectName: "Windpark Nord", shortName: "WPN",
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

type LazyName = "catalog" | "index" | "device" | "allWtg";
const state = vi.hoisted(() => ({
  /** The `enabled` each lazy hook was last given. */
  enabled: { catalog: undefined, index: undefined, device: undefined, allWtg: undefined } as Record<string, boolean | undefined>,
  /** The lazy reads that have landed (an enabled read answers with data) — or, with `forced`, answer loading / failed. */
  landed: { catalog: false, index: false, device: false, allWtg: false } as Record<string, boolean>,
  /** A read that answers loading (or failed) whatever `enabled` says: the screen's reaction to it is the test. */
  forced: {} as Record<string, "loading" | "failed" | undefined>,
  run: vi.fn(async (job: unknown) => {
    const plan = (job as { plan: unknown }).plan;
    if (typeof plan === "function") await (plan as () => Promise<unknown>)();
    return ["new-1"] as string[];
  }),
  flows: { request: vi.fn(async () => ({ runid: "r", approvalid: "a" })), cancel: vi.fn(async () => {}), cancelIfOpen: vi.fn(async () => {}) },
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "11111111-1111-1111-1111-111111111111", locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true, hasData: true, placeholder: false });
/** What a lazy hook answers: nothing while disabled, data once landed, or the forced state. */
function lazy<T>(name: string, enabled: boolean | undefined, loaded: T, empty: T) {
  state.enabled[name] = enabled;
  const forced = state.forced[name];
  if (forced === "loading") return { data: empty, isLoading: true, error: undefined, connected: true, hasData: false, placeholder: false };
  if (forced === "failed") return { data: empty, isLoading: false, error: new Error("boom"), connected: true, hasData: false, placeholder: false };
  if (enabled !== false && state.landed[name]) return ok(loaded);
  return { data: empty, isLoading: false, error: undefined, connected: true, hasData: false, placeholder: false };
}
vi.mock("./hooks", () => ({
  SERVER_DECIDES: {
    canEdit: true, editPermission: true, pvEditPermission: true,
    deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  },
  useGeneratorsProject: () => ok(baseProject),
  useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
  useGeneratorTypes: () => ok([TYPE]),
  useModulePermissionFlows: () => state.flows,
  useGeneratorModels: () => ok([MODEL]),
  useGeneratorCatalog: (_fid: unknown, enabled?: boolean) => lazy("catalog", enabled, [MODEL], []),
  useInflationIndex: (_fid: unknown, enabled?: boolean) => lazy("index", enabled, 1, 0),
  useDeviceCosts: (_c: unknown, enabled?: boolean) =>
    lazy("device", enabled, { modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }, { modules: null, inverter: null, mountingFix: null, mountingTracker: null }),
  useProjectTurbines: () => ok([turbine(1), turbine(2)]),
  usePvModuleCatalog: () => ok([{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }]),
  usePvModuleTypes: () => ok([PV]),
  useInverterTypes: () => ok([]),
  useSubstructureTypes: () => ok([]),
  useSimpleTypes: () => ok([]),
  useAllWtgLandLeaseCosts: (_p: unknown, enabled?: boolean) => lazy("allWtg", enabled, [], []),
  useOpexDependency: () => ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
  useEntraObjectId: () => "pm-1",
  useGeneratorWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {} }),
  loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
  loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
  loadAllocations: async () => ({ allocations: [], countByCost: {} }),
  loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
  loadPvDeleteInputs: async () => ({ unitIds: ["u1"], allocations: [], countByCost: {}, opexCostIds: ["o1"] }),
  loadReplaceInputs: async () => ({ bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["w1", "w2"], allocations: [], landLeaseCosts: [] }),
  usePlantSupplierCatalog: () => ok([]),
}));

import GeneratorsScreen from "./Screen";

const tree = () => (
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><GeneratorsScreen /></MemoryRouter>
  </FluentProvider>
);

beforeEach(() => {
  state.enabled = { catalog: undefined, index: undefined, device: undefined, allWtg: undefined };
  state.landed = { catalog: false, index: false, device: false, allWtg: false };
  state.forced = {};
});
afterEach(() => {
  cleanup();
  setGeneratorsPerfFlags(null);
  state.run.mockClear();
});

const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar" });
const command = (name: string) => within(commandBar()).getByRole("button", { name }) as HTMLButtonElement;
const busy = () => document.querySelector("[data-vsb-busy]");
const lazyEnabled = (): Record<LazyName, boolean | undefined> => ({
  catalog: state.enabled.catalog, index: state.enabled.index, device: state.enabled.device, allWtg: state.enabled.allWtg,
});

describe("the split load gate (D141)", () => {
  it("UT-GENPERF-040 first view: the list shows with the four lazy reads switched off — no overlay, the commands on", async () => {
    render(tree());
    expect(lazyEnabled()).toEqual({ catalog: false, index: false, device: false, allWtg: false });
    expect(screen.getByText("V150")).toBeTruthy();
    expect(busy()).toBeNull();
    expect(command("Add WTG Type").disabled).toBe(false);
    expect(screen.queryByText(GENERATORS_SCREEN_TEXT.loadFailedTitle)).toBeNull();
  });

  it("UT-GENPERF-041 Add WTG Type switches on the catalogue, the price index and the AllWTG costs — not the device costs", async () => {
    render(tree());
    fireEvent.click(command("Add WTG Type"));
    await screen.findByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save");
    expect(lazyEnabled()).toEqual({ catalog: true, index: true, device: false, allWtg: true });
  });

  it("UT-GENPERF-042 Add PV Module Type switches on the device costs and the AllWTG costs, and its Save waits until the device costs have landed (F3)", async () => {
    const view = render(tree());
    fireEvent.click(command("Add PV Module Type"));
    expect(lazyEnabled()).toEqual({ catalog: false, index: false, device: true, allWtg: true });
    fireEvent.change(await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"), { target: { value: "JA 600" } });
    fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"));
    fireEvent.click(await screen.findByRole("option", { name: "JA Solar 550" }));
    const save = () => screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save") as HTMLButtonElement;
    // The form is valid, but the device costs the plan multiplies have not answered: nothing may be built from them.
    expect(save().disabled).toBe(true);
    state.landed.device = true;
    state.landed.allWtg = true;
    view.rerender(tree());
    await waitFor(() => expect(save().disabled).toBe(false));
  });

  it("UT-GENPERF-043 a lazy read that is loading does NOT hold the list: the command stays on and no overlay shows", async () => {
    state.forced.catalog = "loading";
    render(tree());
    expect(busy()).toBeNull();
    expect(command("Add WTG Type").disabled).toBe(false);
  });

  it("UT-GENPERF-044 with the switch OFF the same loading read gates the whole screen again (overlay, commands off) and all four reads are enabled", async () => {
    setGeneratorsPerfFlags({ gateByList: false });
    state.forced.catalog = "loading";
    render(tree());
    expect(lazyEnabled()).toEqual({ catalog: true, index: true, device: true, allWtg: true });
    expect(busy()).not.toBeNull();
    expect(command("Add WTG Type").disabled).toBe(true);
  });

  it("UT-GENPERF-045 a lazy read that was started and failed is a load error, as before (the screen is not built on it)", async () => {
    const view = render(tree());
    fireEvent.click(command("Add PV Module Type"));
    await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label");
    state.forced.device = "failed";
    view.rerender(tree());
    expect(await screen.findByText(GENERATORS_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
  });

  it("UT-GENPERF-046 Delete Generator: the confirmation stays open until the price index has landed, then deletes", async () => {
    const view = render(tree());
    fireEvent.click(screen.getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down")[0]!);
    fireEvent.click(await screen.findByTestId("generators-turbine-delete-w1"));
    // The dialog opened and switched the index read on; it has not answered.
    expect(state.enabled.index).toBe(true);
    const confirm = await screen.findByTestId("confirm-dialog-confirm");
    fireEvent.click(confirm);
    expect(state.run).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog-confirm")).not.toBeNull();
    state.landed.index = true;
    view.rerender(tree());
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    const job = (state.run.mock.calls[0] as unknown as [{ plan: () => Promise<WritePlan> }])[0];
    expect((await job.plan()).writes.map((w) => w.entitySet)).toContain("vsb_generatorinprojects");
  });

  it("UT-GENPERF-047 with the switch OFF the confirmation is not held (every read gated the screen before it opened)", async () => {
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    state.landed = { catalog: true, index: true, device: true, allWtg: true };
    render(tree());
    fireEvent.click(screen.getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down")[0]!);
    fireEvent.click(await screen.findByTestId("generators-turbine-delete-w1"));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  });

  it("UT-GENPERF-048 every save the screen runs carries its reload kind: a BESS-less project's status toggle reloads the toggle's queries", async () => {
    state.landed = { catalog: true, index: true, device: true, allWtg: true };
    render(tree());
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_GeneratorTypes-select-t1"));
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Deactivate" }));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    const job = (state.run.mock.calls[0] as unknown as [{ invalidate?: unknown[]; reload?: unknown }])[0];
    expect(job.reload).toBeUndefined();
    expect(job.invalidate).toHaveLength(6);
    expect(JSON.stringify(job.invalidate)).toContain('"turbines"');
    expect(JSON.stringify(job.invalidate)).not.toContain('"pv"');
  });
});
