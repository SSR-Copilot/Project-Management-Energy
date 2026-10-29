// @vitest-environment jsdom
/**
 * Render tests for the connected Project Generators Screen (D27). `./hooks` is mocked with fixed
 * rows; the write jobs handed to `run` are asserted, including the plans they build.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import {
  EXCLUDED, GENERATOR_TYPE_SAVED_BANNER, PV_MSG, REPLACE_MSG, WRITE_MSG,
  type CatalogModel, type GeneratorTypeRow, type SimpleTypeRow, type TurbineRow,
} from "./rules";

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
const BESS = row({ id: "s1", name: "BESS North", supplier: "Tesla", capacity: 5, energyCapacity: 10 });

type Job = { progress: string; success?: string | ((p: WritePlan) => string); plan: WritePlan | (() => Promise<WritePlan>) };

const state = vi.hoisted(() => ({
  project: null as unknown,
  error: undefined as unknown,
  // Builds the job's plan, as `usePlanWrite` does before it runs it (a replace reads its inputs there).
  run: vi.fn(async (job: unknown) => {
    const plan = (job as { plan: unknown }).plan;
    if (typeof plan === "function") await (plan as () => Promise<unknown>)();
    return ["new-type", "nw1", "nw2"] as string[];
  }),
  loadNewTypeInputs: vi.fn(async () => ({ typeName: "WTG-0099", hasDeviceType: false })),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "11111111-1111-1111-1111-111111111111", locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  SERVER_DECIDES: {
    canEdit: true, editPermission: true, pvEditPermission: true,
    deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  },
  useGeneratorsProject: () => ({ ...ok(state.project), error: state.error }),
  useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
  useGeneratorTypes: () => ok([TYPE]),
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
  useGeneratorWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {} }),
  loadNewTypeInputs: state.loadNewTypeInputs,
  loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
  loadAllocations: async () => ({ allocations: [], countByCost: {} }),
  loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
  loadPvDeleteInputs: async () => ({ unitIds: ["u1"], allocations: [], countByCost: {}, opexCostIds: ["o1"] }),
  loadReplaceInputs: async () => ({ bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["w1", "w2"], allocations: [], landLeaseCosts: [] }),
  usePlantSupplierCatalog: (kind: string) => ok(kind === "inverter"
    ? [{ id: "inv1", supplier: "SMA", typeValues: [952850000] }]
    : [{ id: "sub1", supplier: "Schletter", typeValues: [952850001] }]),
}));

import GeneratorsScreen from "./Screen";

function renderScreen(project: Record<string, unknown> = baseProject) {
  state.project = project;
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter><GeneratorsScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

afterEach(() => {
  cleanup();
  state.run.mockClear();
  state.loadNewTypeInputs.mockClear();
  state.error = undefined;
});

const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar" });
const command = (name: string) => within(commandBar()).getByRole("button", { name }) as HTMLButtonElement;

const jobAt = (i: number): Job => (state.run.mock.calls[i] as unknown as [Job])[0];
const planOf = async (job: Job): Promise<WritePlan> => (typeof job.plan === "function" ? job.plan() : job.plan);

async function pick(testId: string, option: string) {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("UT-GEN Screen (connected, D27)", () => {
  it("UT-GEN-901 renders the connected screen: no notice, the canvas commands and AccessibleLabels", async () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    const labels = within(commandBar()).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    // The canvas top level; BESS / Hydrogen / Substation are `ItemParentKey: "addOthers"` while
    // nothing of theirs is selected. Add Inverter / Add Substructure are `ItemVisible: false` (G9 withdrawn).
    expect(labels).toEqual(["Add WTG Type", "Add PV Module Type", "Add Others"]);
    fireEvent.click(command("Add Others"));
    const items = (await screen.findAllByRole("menuitem")).map((m) => m.getAttribute("aria-label"));
    expect(items).toEqual(["BESS", "Hydrogen", "Substation"]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(command("Add WTG Type").disabled).toBe(false);
    expect(screen.getByTestId("txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity").getAttribute("aria-label"))
      .toBe("txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity");
    expect(screen.getByText("V150")).toBeTruthy();
    expect(screen.getByText("JA 550")).toBeTruthy();
    expect(screen.getByText("BESS North")).toBeTruthy();
  });

  it("UT-GEN-902 cards start collapsed; one card is selected screen-wide; a PV click also expands it", async () => {
    renderScreen();
    // Collapsed: the WTG detail values and the turbine grid are not shown.
    expect(screen.queryByText("Vestas")).toBeNull();
    expect(screen.queryByTestId("pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList")).toBeNull();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    expect(await screen.findByTestId("pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList")).toBeTruthy();
    expect(screen.getByText("Vestas")).toBeTruthy();
    expect(screen.getByText("223")).toBeTruthy();
    expect(command("Delete Generator Type")).toBeTruthy();
    // Selecting the PV row deselects the WTG type and expands the PV card.
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_PvModule-select-pv1"));
    await waitFor(() => expect(within(commandBar()).queryByRole("button", { name: "Delete Generator Type" })).toBeNull());
    expect(command("Edit PV Module Type")).toBeTruthy();
    expect(screen.getByText("JA Solar")).toBeTruthy();
  });

  it("UT-GEN-903 Add WTG Type saves the type, its turbines and the roll-up, then the follow-up job", async () => {
    renderScreen();
    fireEvent.click(command("Add WTG Type"));
    const save = await screen.findByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save");
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("cmb_Supplier").getAttribute("aria-label")).toBe("cmb_Supplier");
    await pick("cmb_Supplier", "Vestas");
    await pick("cmb_Supplier_1", "V150");
    await pick("cmb_Supplier_2", "148");
    fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator"), { target: { value: "2" } });
    await waitFor(() => expect((screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
    const first = jobAt(0);
    expect(first.progress).toBe('Generator "Vestas V150-5.6 - available" will be saved, please wait...');
    const plan = await planOf(first);
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_generatortypeinprojects", "create:vsb_generatorinprojects", "create:vsb_generatorinprojects",
      "update:vsb_projects",
    ]);
    // Names continue from the PROJECT-wide max index (2).
    expect(plan.writes[1]!.data!.vsb_name).toBe("WTG WPN_3");
    expect(plan.writes[0]!.data!.vsb_costperwtg).toBe(950_000);
    const second = jobAt(1);
    expect(second.success).toBe(GENERATOR_TYPE_SAVED_BANNER);
    const follow = await planOf(second);
    expect(state.loadNewTypeInputs).toHaveBeenCalledWith("wtg", "new-type");
    expect(follow.writes[0]!.data!.vsb_name).toBe("WTG-0099");
  });

  it("UT-GEN-904 out of country the Save reads Request permission and stays disabled (excluded flow)", async () => {
    renderScreen();
    fireEvent.click(command("Add WTG Type"));
    fireEvent.click(await screen.findByTestId("tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"));
    await waitFor(() => expect(screen.getByText("Generators not available for Germany")).toBeTruthy());
    const save = screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.getAttribute("title")).toBe(EXCLUDED.permissionRequest);
  });

  it("UT-GEN-905 Add Others does nothing; Delete BESS deletes the row and rolls the capacity up", async () => {
    renderScreen();
    fireEvent.click(command("Add Others"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_Storage_1-select-s1"));
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Delete BESS" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const job = jobAt(0);
    expect(job.success).toBe(WRITE_MSG.storageDeleted);
    const plan = await planOf(job);
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual(["delete:vsb_storagetypeinprojects", "update:vsb_projects"]);
    expect(plan.writes[1]!.data).toEqual({ vsb_plantstoragecapacity: 0 });
  });

  it("UT-GEN-906 the BESS panel opens bound to the selected row; Save needs a change", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_Storage_1-select-s1"));
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Edit BESS" }));
    const label = await screen.findByTestId("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel") as HTMLInputElement;
    expect(label.value).toBe("BESS North");
    expect(label.getAttribute("aria-label")).toBe("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel");
    const save = () => screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Storage_Buttons_Save_2") as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    fireEvent.change(label, { target: { value: "BESS South" } });
    await waitFor(() => expect(save().disabled).toBe(false));
    fireEvent.click(save());
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    expect(jobAt(0).progress).toBe("BESS South will be saved. Please waiting...");
    const plan = await planOf(jobAt(0));
    expect(plan.writes[0]).toMatchObject({ op: "update", entitySet: "vsb_storagetypeinprojects", id: "s1" });
  });

  it("UT-GEN-907 a locked project disables the command bar and hides the galleries", () => {
    renderScreen({ ...baseProject, endDate: null });
    expect(screen.getByTestId("con_Milestones_Page_LockMessage_1")).toBeTruthy();
    for (const b of within(commandBar()).getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("gal_Generators_DisplayProject_Body_Form_GeneratorTypes")).toBeNull();
  });

  it("UT-GEN-908 a failed read renders the load-error state (rule 19)", () => {
    state.error = new Error("403");
    renderScreen();
    expect(screen.getByText("The generator data could not be loaded")).toBeTruthy();
  });

  it("UT-GEN-909 Replace Generator Type (G6, 1.21.753): Detach / Delete / Add, then the land lease and O&M re-link", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_GeneratorTypes-select-t1"));
    const replace = await within(commandBar()).findByRole("button", { name: "Replace Generator Type" }) as HTMLButtonElement;
    expect(replace.disabled).toBe(false);
    fireEvent.click(replace);
    const save = () => screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1") as HTMLButtonElement;
    await waitFor(() => expect(save().disabled).toBe(true));
    expect(screen.getByText("Replace from")).toBeTruthy();
    expect((screen.getByTestId("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_1") as HTMLInputElement).value).toBe("2");
    expect(screen.getByTestId("cmb_Supplier_3").getAttribute("aria-label")).toBe("cmb_Supplier");
    await pick("cmb_Supplier_3", "Vestas");
    await pick("cmb_Supplier_4", "V150");
    await pick("cmb_Supplier_5", "148");
    await waitFor(() => expect(save().disabled).toBe(false));
    fireEvent.click(save());
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
    const first = jobAt(0);
    expect(first.progress).toBe('Generator "Vestas V150-5.6 - available" will replace "V150", please wait...');
    const plan = await planOf(first);
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "update:vsb_opexprojectcosts", "delete:vsb_generatorinprojects", "delete:vsb_generatorinprojects",
      "delete:vsb_devicetypesinprojects", "delete:vsb_generatortypeinprojects",
      "create:vsb_generatortypeinprojects", "create:vsb_generatorinprojects", "create:vsb_generatorinprojects",
      "update:vsb_projects",
    ]);
    // The old turbines are gone, so the new names start again at 1.
    expect(plan.writes[6]!.data!.vsb_name).toBe("WTG WPN_1");
    const second = jobAt(1);
    const follow = await planOf(second);
    expect(follow.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_devicetypesinprojects", "update:vsb_opexprojectcosts",
    ]);
    expect(typeof second.success === "function" ? second.success(follow) : second.success).toBe(REPLACE_MSG.wtgReplaced);
  });

  it("UT-GEN-910 Add Inverter / Add Substructure are not offered (canvas `ItemVisible: false`, G9 withdrawn)", async () => {
    renderScreen();
    fireEvent.click(command("Add Others"));
    const items = (await screen.findAllByRole("menuitem")).map((m) => m.getAttribute("aria-label"));
    expect(items).not.toContain("Add Inverter");
    expect(items).not.toContain("Add Substructure");
  });

  it("UT-GEN-912 the PV delete removes the O&M costs and the PV unit before the type (G2)", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_PvModule-select-pv1"));
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Delete PV Module Type" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const job = jobAt(0);
    expect(job.success).toBe(PV_MSG.deleted);
    const plan = await planOf(job);
    expect(plan.writes.slice(0, 3).map((w) => `${w.op}:${w.entitySet}:${w.id}`)).toEqual([
      "delete:vsb_opexprojectcosts:o1", "delete:vsb_generatorinprojects:u1", "delete:vsb_pvmoduletypeinprojects:pv1",
    ]);
  });

  it("UT-GEN-913 Replace PV Module Type (G6): the Replace from / to form runs both jobs", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_PvModule-select-pv1"));
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Replace PV Module Type" }));
    const save = () => screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2") as HTMLButtonElement;
    expect((await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_1") as HTMLInputElement).value).toBe("JA 550");
    fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_2"), { target: { value: "JA 600" } });
    fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_2"), { target: { value: "12" } });
    await pick("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_2", "JA Solar 550");
    await waitFor(() => expect(save().disabled).toBe(false));
    fireEvent.click(save());
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
    expect(jobAt(0).progress).toBe("PV Module 'JA 600' will be replaced, please wait...");
    const plan = await planOf(jobAt(0));
    expect(plan.writes.at(-1)).toMatchObject({ op: "create", entitySet: "vsb_pvmoduletypeinprojects" });
    expect(jobAt(1).success).toBe(REPLACE_MSG.pvReplaced);
    const follow = await planOf(jobAt(1));
    expect(follow.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_devicetypesinprojects", "create:vsb_generatorinprojects", "update:vsb_projects", "update:vsb_opexprojectcosts",
    ]);
  });
});
