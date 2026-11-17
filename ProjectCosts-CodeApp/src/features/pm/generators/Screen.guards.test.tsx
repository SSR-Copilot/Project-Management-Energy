// @vitest-environment jsdom
/**
 * UT-GEN-1240.. — the Generators review fixes as the Screen shows them (D121): F1 (the O&M guard waits for its read),
 * F3 (actions wait while the turbines / index / device costs settle), F4 (one write job at a time), F6 (no business unit: the
 * create is refused), F7 (a failed refresh keeps the screen), F9 (pager, Total Height box, degradation prefill, PV unit
 * back-fill, one screen per project). `./hooks` is mocked with rows the tests can change, as `Screen.test.tsx` does; `run`
 * hands back the job so its plan can be read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import {
  GUARD_READ_MSG, OWNING_BU_MSG,
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
const turbine = (i: number, over: Partial<TurbineRow> = {}): TurbineRow => ({
  id: `w${i}`, name: `WTG WPN_${i}`, typeId: "t1", index: i, effectiveCapacity: 5.6, effectiveHubHeight: null,
  effectiveHubHeightChanged: false, foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status: 0, ...over,
});
const row = (over: Partial<SimpleTypeRow>): SimpleTypeRow => ({
  id: "r", name: null, supplier: null, otherSupplier: null, capacity: null, cost: null, moduleLabel: null,
  degradation1stYear: null, degradationRemainingYears: null, requestPermissionState: null, flowRunId: null,
  flowApprovalId: null, status: 0, ...over,
});
const PV = row({
  id: "pv1", name: "PVT-0001", moduleLabel: "JA 550", catalogueId: "m1", catalogueSupplier: "JA Solar", capacity: 10, cost: 3000,
  degradation1stYear: 0.125, degradationRemainingYears: 0.4,
});
const BESS = row({ id: "s1", name: "BESS North", supplier: "Tesla", capacity: 5, energyCapacity: 10 });

type Job = {
  progress: string;
  plan: WritePlan | (() => Promise<WritePlan>);
  then?: (first: { done: number; createdIds: string[] }) => Promise<WritePlan | null | undefined>;
};
interface Read { data?: unknown; isLoading?: boolean; error?: unknown; hasData?: boolean; placeholder?: boolean }

const state = vi.hoisted(() => ({
  projectId: "11111111-1111-1111-1111-111111111111",
  project: null as unknown,
  projectRead: {} as Record<string, unknown>,
  opexWtg: {} as Record<string, unknown>,
  opexPv: {} as Record<string, unknown>,
  turbines: null as unknown,
  turbinesRead: {} as Record<string, unknown>,
  deviceRead: {} as Record<string, unknown>,
  types: null as unknown,
  allWtg: [] as unknown[],
  /** When set, `run` waits for this promise before it resolves (a job in flight). */
  hold: null as Promise<void> | null,
  run: vi.fn(async (job: unknown) => {
    const st = state as unknown as { hold: Promise<void> | null };
    if (st.hold) await st.hold;
    const plan = (job as { plan: unknown }).plan;
    if (typeof plan === "function") await (plan as () => Promise<unknown>)();
    return ["new-1"] as string[];
  }),
  flows: { request: vi.fn(async () => ({ runid: "r", approvalid: "a" })), cancel: vi.fn(async () => {}), cancelIfOpen: vi.fn(async () => {}) },
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: state.projectId, locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));

const ok = <T,>(data: T, over: Read = {}) => ({ data, isLoading: false, error: undefined, connected: true, hasData: true, placeholder: false, ...over });
vi.mock("./hooks", () => ({
  SERVER_DECIDES: {
    canEdit: true, editPermission: true, pvEditPermission: true,
    deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  },
  useGeneratorsProject: () => ok(state.project, state.projectRead as Read),
  useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
  useGeneratorTypes: () => ok((state.types as GeneratorTypeRow[] | null) ?? [TYPE]),
  useModulePermissionFlows: () => state.flows,
  useGeneratorModels: () => ok([MODEL]),
  useGeneratorCatalog: () => ok([MODEL]),
  useInflationIndex: () => ok(1),
  useDeviceCosts: () => ok({ modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }, state.deviceRead as Read),
  useProjectTurbines: () => ok((state.turbines as TurbineRow[] | null) ?? [turbine(1), turbine(2)], state.turbinesRead as Read),
  usePvModuleCatalog: () => ok([{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }]),
  usePvModuleTypes: () => ok([PV]),
  useInverterTypes: () => ok([]),
  useSubstructureTypes: () => ok([]),
  useSimpleTypes: (family: string) => ok(family === "storage" ? [BESS] : []),
  useAllWtgLandLeaseCosts: () => ok(state.allWtg),
  useOpexDependency: (_p: string | undefined, typeId: string | null | undefined) =>
    ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }, (typeId === "pv1" ? state.opexPv : state.opexWtg) as Read),
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
  state.projectId = PROJECT_ID;
  state.projectRead = {};
  state.opexWtg = {};
  state.opexPv = {};
  state.turbines = null;
  state.turbinesRead = {};
  state.deviceRead = {};
  state.types = null;
  state.allWtg = [];
  state.hold = null;
});

const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar" });
const command = (name: string) => within(commandBar()).getByRole("button", { name }) as HTMLButtonElement;
const jobAt = (i: number): Job => (state.run.mock.calls[i] as unknown as [Job])[0];
const planOf = async (job: Job): Promise<WritePlan> => (typeof job.plan === "function" ? job.plan() : job.plan);
const selectWtg = () => fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_GeneratorTypes-select-t1"));
const selectPv = () => fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_PvModule-select-pv1"));

describe("F1 — Delete / Deactivate wait for the O&M dependency read", () => {
  it("UT-GEN-1240 while the read is pending Delete Generator Type is disabled with the checking text, and a click opens nothing", async () => {
    state.opexWtg = { isLoading: true, hasData: false };
    renderScreen();
    selectWtg();
    const del = await within(commandBar()).findByRole("button", { name: "Delete Generator Type" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.getAttribute("title")).toBe(GUARD_READ_MSG.opexChecking);
    fireEvent.click(del);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("generators-opex-unavailable")).toBeNull();
  });

  it("UT-GEN-1241 a failed read keeps Delete and Deactivate off and says so in a banner (it used to read as 'no dependency')", async () => {
    state.opexWtg = { error: new Error("503"), hasData: false };
    renderScreen();
    selectWtg();
    const del = await within(commandBar()).findByRole("button", { name: "Delete Generator Type" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.getAttribute("title")).toBe(GUARD_READ_MSG.opexFailed);
    const banner = screen.getByTestId("generators-opex-unavailable");
    expect(banner.getAttribute("aria-label")).toBe("generators-opex-unavailable");
    expect(banner.textContent).toContain(GUARD_READ_MSG.opexFailed);
    fireEvent.click(del);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(state.run).not.toHaveBeenCalled();
  });

  it("UT-GEN-1242 a known answer opens the confirmation as before (no dependency), and the PV delete is held on its own read", async () => {
    renderScreen();
    selectWtg();
    const del = await within(commandBar()).findByRole("button", { name: "Delete Generator Type" }) as HTMLButtonElement;
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    expect(await screen.findByRole("button", { name: "Delete" })).toBeTruthy();
    cleanup();

    state.opexPv = { isLoading: true, hasData: false };
    renderScreen();
    selectPv();
    const pvDel = await within(commandBar()).findByRole("button", { name: "Delete PV Module Type" }) as HTMLButtonElement;
    expect(pvDel.disabled).toBe(true);
    expect(pvDel.getAttribute("title")).toBe(GUARD_READ_MSG.opexChecking);
    // Replace PV does not depend on the O&M read.
    expect((within(commandBar()).getByRole("button", { name: "Replace PV Module Type" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("UT-GEN-1243 a known active dependency still opens the information popup (the guard itself is unchanged)", async () => {
    state.opexWtg = { data: { hasActiveDeviceType: true, hasActiveOpexCost: true } };
    renderScreen();
    selectWtg();
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Delete Generator Type" }));
    expect(await screen.findByText(/is currently linked to O&M costs/)).toBeTruthy();
    expect(state.run).not.toHaveBeenCalled();
  });
});

describe("F3 — actions wait while the data they build rows from settles", () => {
  it("UT-GEN-1244 turbines still showing the previous type set (placeholder) disable the command bar, with the reason as tooltip", () => {
    state.turbinesRead = { placeholder: true };
    renderScreen();
    for (const b of within(commandBar()).getAllByRole("button")) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute("title")).toBe(GUARD_READ_MSG.settling);
    }
  });

  it("UT-GEN-1245 the first read of the device costs holds the actions too; once settled they are back", () => {
    state.deviceRead = { isLoading: true, hasData: false };
    const first = renderScreen();
    expect(command("Add WTG Type").disabled).toBe(true);
    first.unmount();
    state.deviceRead = {};
    renderScreen();
    expect(command("Add WTG Type").disabled).toBe(false);
  });

  it("UT-GEN-1246 the turbine Edit / Delete icons wait as well", () => {
    state.turbinesRead = { placeholder: true };
    renderScreen();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    expect((screen.getByTestId("generators-turbine-edit-w1") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("generators-turbine-delete-w1") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("F4 — one write job at a time", () => {
  async function openBessPanel(select = true) {
    if (select) selectBess();
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Edit BESS" }));
    const label = await screen.findByTestId("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel") as HTMLInputElement;
    fireEvent.change(label, { target: { value: "BESS South" } });
    const save = screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Storage_Buttons_Save_2") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    return save;
  }
  const selectBess = () => fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_Storage_1-select-s1"));

  it("UT-GEN-1247 a second click on Save while the first job runs starts no second job", async () => {
    let release: () => void = () => {};
    state.hold = new Promise<void>((resolve) => { release = resolve; });
    renderScreen();
    const save = await openBessPanel();
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(save);
    expect(state.run).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(state.run.mock.results.length).toBe(1));
    await state.run.mock.results[0]!.value;
  });

  it("UT-GEN-1248 once the job has finished, the next Save starts a new one", async () => {
    renderScreen();
    const save = await openBessPanel();
    fireEvent.click(save);
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    await state.run.mock.results[0]!.value;
    await Promise.resolve();
    // Open the panel again and save a second time.
    const again = await openBessPanel(false);
    fireEvent.click(again);
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
  });

  it("UT-GEN-1249 a delete confirmed while a save is still running starts no second job (the ref guard, not the render, is what stops it)", async () => {
    let release: () => void = () => {};
    state.hold = new Promise<void>((resolve) => { release = resolve; });
    renderScreen();
    const save = await openBessPanel();
    fireEvent.click(save);
    expect(state.run).toHaveBeenCalledTimes(1);
    // The mocked writes never report a progress, so the screen offers the commands again: Delete BESS reaches `run`.
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Delete BESS" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await Promise.resolve();
    expect(state.run).toHaveBeenCalledTimes(1);
    release();
    await state.run.mock.results[0]!.value;
    // Once the first job has finished the guard is open again.
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Delete BESS" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
  });
});

describe("F6 — a project without a business unit cannot create rows", () => {
  it("UT-GEN-1250 saving a new PV type is refused with the business-unit message, nothing to write", async () => {
    renderScreen({ ...baseProject, owningBusinessUnitId: null });
    fireEvent.click(command("Add PV Module Type"));
    fireEvent.change(await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"), { target: { value: "JA 600" } });
    fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"));
    fireEvent.click(await screen.findByRole("option", { name: "JA Solar 550" }));
    const save = screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    const plan = await planOf(jobAt(0));
    expect(plan.refusedReason).toBe(OWNING_BU_MSG.missing);
    expect(plan.writes).toEqual([]);
  });
});

describe("F7 — a failed refresh keeps the screen", () => {
  it("UT-GEN-1251 a failed query that still has data shows a banner and the screen stays (the empty state is for an error with no data)", () => {
    state.projectRead = { error: new Error("refresh failed"), hasData: true };
    renderScreen();
    const banner = screen.getByTestId("generators-data-unavailable");
    expect(banner.getAttribute("aria-label")).toBe("generators-data-unavailable");
    expect(banner.textContent).toContain(GUARD_READ_MSG.refreshFailed);
    expect(screen.queryByText("The generator data could not be loaded")).toBeNull();
    expect(screen.getByText("V150")).toBeTruthy();
    expect(command("Add WTG Type").disabled).toBe(false);
  });

  it("UT-GEN-1252 a failed query with NO data still shows the empty state and no banner (rule 19)", () => {
    state.projectRead = { error: new Error("403"), hasData: false };
    renderScreen();
    expect(screen.getByText("The generator data could not be loaded")).toBeTruthy();
    expect(screen.queryByTestId("generators-data-unavailable")).toBeNull();
  });
});

describe("F9 — small fixes", () => {
  it("UT-GEN-1253 the pager counts the loaded turbines: a stored count of 250 over two rows shows no pager", () => {
    state.types = [{ ...TYPE, numberOfGenerators: 250 }];
    renderScreen();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    expect(screen.queryByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageRight-t1")).toBeNull();
  });

  it("UT-GEN-1254 205 loaded turbines page (30 per page: page 1 from 7) even when the stored count says 2", () => {
    state.turbines = Array.from({ length: 205 }, (_, i) => turbine(i + 1));
    renderScreen();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    expect(screen.getByText("Page: 1 from 7")).toBeTruthy();
    expect(screen.getByText("Generators: 205")).toBeTruthy();
  });

  it("UT-GEN-1255 the Total Height box shows 130.4, not the float 130.39999999999998", async () => {
    state.turbines = [turbine(1, { totalHeight: 130.39999999999998 }), turbine(2)];
    renderScreen();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    fireEvent.click(screen.getByTestId("generators-turbine-edit-w1"));
    const box = await screen.findByTestId("txt_GeneratorData_RightPanel_Form_Fields_Total_Height") as HTMLInputElement;
    expect(box.value).toBe("130.4");
  });

  it("UT-GEN-1256 Edit PV opens with Degradation 1st Year 0.125 (three decimals), not 0.13", async () => {
    renderScreen();
    selectPv();
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Edit PV Module Type" }));
    const box = await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear") as HTMLInputElement;
    expect(box.value).toBe("0.125");
  });

  it("UT-GEN-1257 editing a PV type that has no unit creates the unit AND back-fills the AllWTG land-lease costs", async () => {
    state.allWtg = [{ id: "c1", landOwner: "M", description: "A", allWtgAllocated: true }];
    renderScreen();
    selectPv();
    fireEvent.click(await within(commandBar()).findByRole("button", { name: "Edit PV Module Type" }));
    const label = await screen.findByTestId("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label") as HTMLInputElement;
    fireEvent.change(label, { target: { value: "JA 600" } });
    const save = screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    const follow = await jobAt(0).then!({ done: 1, createdIds: [] });
    // `loadPvFollowUpInputs` (mocked) found no unit: the follow-up creates it and allocates it.
    expect(follow!.writes.some((w) => w.op === "create" && w.entitySet === "vsb_generatorinprojects")).toBe(true);
    expect(follow!.writes.some((w) => (w.op === "create" || w.op === "createMany") && w.entitySet === "vsb_landleaseallocationwtgs")).toBe(true);
  });

  it("UT-GEN-1258 one screen per project: switching the project drops an open panel and the selection", async () => {
    const view = renderScreen();
    fireEvent.click(command("Add WTG Type"));
    expect(await screen.findByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save")).toBeTruthy();
    selectWtg();
    state.projectId = "22222222-2222-2222-2222-222222222222";
    view.rerender(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter><GeneratorsScreen /></MemoryRouter>
      </FluentProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save")).toBeNull());
    expect(within(commandBar()).queryByRole("button", { name: "Delete Generator Type" })).toBeNull();
  });
});
