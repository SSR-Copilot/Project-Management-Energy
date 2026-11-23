// @vitest-environment jsdom
/**
 * Render tests for the connected Project Production Screen (D28). `./hooks` is mocked with fixed
 * rows; the save / delete / status requests handed to the write hook are asserted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { PanelButtons } from "@/components";
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import {
  COMMAND_BAR_LABEL, DELETE_DIALOG, PREVENT_LAST_YIELD_DIALOG, PRODUCTION_SCREEN_TEXT, SUMMARY_LABELS, YIELD_COL,
  type EnergyYieldRow, type ProductionProject,
} from "./rules";
import type { SaveYieldRequest } from "./hooks";

const baseProject: ProductionProject = {
  id: "p1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryId: "c1", countryName: "Germany", technology: 952850000,
  totalCapacity: 22.4, endDate: "2055-12-31", cod: "2028-09-01", plantPvCapacity: 5,
  grossYield: 12_000, windSpeed: 7, irradiation: null, netYieldP50: 20_400, netYieldP75: 18_000, netYieldP90: 17_000,
  standardCostCreated: true, owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1",
};

const yieldRow = (over: Partial<EnergyYieldRow>): EnergyYieldRow => ({
  id: "y1", name: "EY-1", description: "North", type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal, allocation: 100, windSpeed: 7, irradiation: null,
  grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10, netYieldP75: 9_512, netYieldP90: 8_893,
  productionAllocation: null, productionLossesP50: false, productionUncertainty: false,
  considerSeasonality: true, considerNegativePrices: false, status: 0, ...over,
});

const state = vi.hoisted(() => ({
  /** `undefined` = New Project mode (no project saved yet). */
  projectId: "p1" as string | undefined,
  project: null as unknown,
  yields: [] as unknown[],
  error: undefined as unknown,
  standard: { seasonality: [] as unknown[], negativePrices: [] as unknown[] },
  standardError: undefined as unknown,
  saveYield: vi.fn(async (_req: unknown) => true),
  deleteYield: vi.fn(async (_row: unknown) => true),
  changeStatus: vi.fn(async (_row: unknown) => true),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: state.projectId, locale: "en-US", loading: false, envVars: {} }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  CAN_EDIT_SELECTED_PROJECT: true,
  useProductionProject: () => ({ ...ok(state.project), error: state.error }),
  useEnergyYields: () => ok(state.yields),
  useRevenueAssumptions: () => ({ ...ok(state.standard), error: state.standardError }),
  useStoredSeasonality: () => ok({ recordId: "s1", months: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 12], standardValuesJson: null }),
  useStoredNegativePrices: () => ok([]),
  useProductionWrites: () => ({
    progress: null, error: null, success: null, clear: () => {},
    saveYield: state.saveYield, deleteYield: state.deleteYield, changeStatus: state.changeStatus,
  }),
}));

import ProductionScreen from "./Screen";

const NORTH = yieldRow({});
const SOUTH = yieldRow({ id: "y2", name: "EY-2", description: "South", type: CHOICE_PRODUCTION.yieldType.pv, status: 1, irradiation: 1100, windSpeed: null });

function renderScreen(project: ProductionProject | null = baseProject, yields: EnergyYieldRow[] = [NORTH, SOUTH]) {
  state.project = project;
  state.yields = yields;
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter><ProductionScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

afterEach(() => {
  cleanup();
  state.saveYield.mockClear();
  state.deleteYield.mockClear();
  state.changeStatus.mockClear();
  state.error = undefined;
  state.projectId = "p1";
  state.standard = { seasonality: [], negativePrices: [] };
  state.standardError = undefined;
});

const bar = () => screen.getByRole("toolbar", { name: COMMAND_BAR_LABEL });
const command = (name: string) => within(bar()).getByRole("button", { name }) as HTMLButtonElement;

describe("Project Production Screen (connected)", () => {
  it("UT-PROD-901 the summary shows the project's stored roll-up with the canvas names", () => {
    renderScreen();
    for (const label of Object.values(SUMMARY_LABELS)) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    const p50 = screen.getByTestId("txt_Production_DisplayProject_Body_Form_NetYield_p50") as HTMLInputElement;
    expect(p50.value).toBe("20,400");
    expect(p50.getAttribute("aria-label")).toBe("txt_Production_DisplayProject_Body_Form_NetYield_p50");
    expect((screen.getByTestId("txt_Production_DisplayProject_Body_Form_Irradation") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
  });

  it("UT-PROD-902 the first yield is pre-selected, so Edit / Delete / Deactivate show", () => {
    renderScreen();
    expect(command("Add Production WTG").disabled).toBe(false);
    expect(command("Edit")).toBeTruthy();
    expect(command("Delete")).toBeTruthy();
    expect(command("Deactivate Production")).toBeTruthy();
    expect(within(bar()).queryByRole("button", { name: "Activate Production" })).toBeNull();
    expect(screen.getAllByTestId("lbl_Production_CardHeader_LabelWithDescription").map((e) => e.textContent))
      .toEqual(["Production - WTG North", "Production - PV South"]);
  });

  it("UT-PROD-903 the page lock disables the whole command bar and hides the list", () => {
    renderScreen({ ...baseProject, endDate: null });
    expect(screen.getByTestId("con_Milestones_Page_LockMessage_2").textContent).toContain("• Milestones");
    expect(command("Add Production WTG").disabled).toBe(true);
    expect(screen.queryByTestId("gal_Production_Items")).toBeNull();
  });

  it("UT-PROD-914 DIVERGENCE (D112): New Project mode shows all five commands of the Canvas bar, disabled", () => {
    state.projectId = undefined;
    renderScreen(null, []);
    expect(screen.getByTestId("con_Milestones_Page_LockMessage_2").textContent).toContain("• Generator");
    expect(within(bar()).getAllByRole("button").map((b) => b.textContent?.trim()))
      .toEqual(["Add Production WTG", "Add Production PV", "Edit", "Delete", "Deactivate Production"]);
    expect(within(bar()).getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // The six roll-up boxes stay, empty.
    expect((screen.getByTestId("txt_Production_DisplayProject_Body_Form_GrossYield") as HTMLInputElement).value).toBe("");
  });

  it("UT-PROD-904 the chevron expands a card with the canvas detail values and labels", () => {
    renderScreen();
    fireEvent.click(screen.getAllByTestId("ico_Production_CardHeader_Down")[0]!);
    const seasonality = screen.getByTestId("txt_ProductionDetails_Seasonality") as HTMLInputElement;
    expect(seasonality.value).toBe("Yes");
    expect(seasonality.getAttribute("aria-label")).toBe("txt_ProductionDetails_Description");
    expect((screen.getByTestId("txt_ProductionDetails_NegaticePricesPV") as HTMLInputElement).value).toBe("No");
    expect((screen.getByTestId("txt_ProductionDetails_GrossYield") as HTMLInputElement).value).toBe("12,000");
  });

  it("UT-PROD-905 Add Production WTG saves the canvas payload as a new yield", async () => {
    renderScreen();
    fireEvent.click(command("Add Production WTG"));
    const description = await screen.findByTestId("txt_ProductionDataWTG_Description");
    fireEvent.change(description, { target: { value: "East" } });
    fireEvent.change(screen.getByTestId("txt_ProductionDataWTG_WindSpeed"), { target: { value: "7.5" } });
    fireEvent.change(screen.getByTestId("txt_ProductionDataWTG_GrossYield"), { target: { value: "10000" } });
    expect((screen.getByTestId("txt_ProductionDataWTG_NetYieldP50") as HTMLInputElement).value).toBe("8,500");
    const save = screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_1") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(state.saveYield).toHaveBeenCalledTimes(1));
    const req = state.saveYield.mock.calls[0]![0] as SaveYieldRequest;
    expect(req.editing).toBeNull();
    expect(req.payload).toMatchObject({
      [YIELD_COL.description]: "East", [YIELD_COL.windSpeed]: 7.5, [YIELD_COL.grossYield]: 10_000,
      [YIELD_COL.totalLosses]: 15, [YIELD_COL.netYieldP50]: 8_500, [YIELD_COL.uncertainty]: 10,
      [YIELD_COL.type]: CHOICE_PRODUCTION.yieldType.wtg, "owningbusinessunit@odata.bind": "/businessunits(bbbbbbbb-0000-0000-0000-0000000000b1)",
    });
    expect(req.seasonality.on).toBe(false);
  });

  it("UT-PROD-905a the Add WTG panel lists Each turbine before Whole plant and keeps the typed Gross Yield", async () => {
    renderScreen();
    fireEvent.click(command("Add Production WTG"));
    const allocation = await screen.findByTestId("rad_ProductionDataWTG_Allocation");
    const radios = within(allocation).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.closest("label, .fui-Radio")?.textContent?.trim())).toEqual(["Each turbine", "Whole plant"]);
    expect(radios.map((r) => r.checked)).toEqual([false, true]);
    const gross = screen.getByTestId("txt_ProductionDataWTG_GrossYield") as HTMLInputElement;
    expect(gross.disabled).toBe(false);
    fireEvent.change(gross, { target: { value: "43" } });
    expect(gross.value).toBe("43");
  });

  it("UT-PROD-905c Uncertainty: empty in 'Input Net Yield p75/p90'; an empty one in 'Input Uncertainty' gives p75 = p90 = p50 (Add and Edit)", async () => {
    const value = (id: string) => (screen.getByTestId(id) as HTMLInputElement).value;
    const radio = (group: string, name: string) => within(screen.getByTestId(group)).getByRole("radio", { name });
    const unc = "txt_ProductionDataWTG_Uncertainty";
    // Add: the radio's `locUncertaintyValue: Blank()` + `Reset(…)` (Y:3551-3560) empties the box both ways.
    renderScreen();
    fireEvent.click(command("Add Production WTG"));
    expect((await screen.findByTestId(unc) as HTMLInputElement).value).toBe("10.0");
    fireEvent.change(screen.getByTestId("txt_ProductionDataWTG_GrossYield"), { target: { value: "12000" } });
    fireEvent.click(radio("rad_ProductionDataWTG_UncertaintyNet", "Input Net Yield p75/p90"));
    expect(value(unc)).toBe("");
    expect((screen.getByTestId(unc) as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(screen.getByTestId("txt_ProductionDataWTG_NetYieldP75"), { target: { value: "9000" } });
    fireEvent.change(screen.getByTestId("txt_ProductionDataWTG_NetYieldP90"), { target: { value: "8000" } });
    expect(value(unc)).toBe("");
    fireEvent.click(radio("rad_ProductionDataWTG_UncertaintyNet", "Input Uncertainty"));
    expect([value(unc), value("txt_ProductionDataWTG_NetYieldP75"), value("txt_ProductionDataWTG_NetYieldP90")]).toEqual(["", "10,200", "10,200"]);
    cleanup();

    // Edit, a p75/p90 yield saved with no uncertainty: the box stays empty (`Text(locUncertaintyValue)`).
    renderScreen(baseProject, [yieldRow({ productionUncertainty: true, uncertainty: null }), SOUTH]);
    fireEvent.click(command("Edit"));
    expect((await screen.findByTestId(unc) as HTMLInputElement).value).toBe("");
    expect(value("txt_ProductionDataWTG_NetYieldP75")).toBe("9,512");
    cleanup();

    // Edit, an "Input Uncertainty" yield whose box is cleared: p75 = p90 = p50, as on Add.
    renderScreen();
    fireEvent.click(command("Edit"));
    fireEvent.change(await screen.findByTestId(unc), { target: { value: "" } });
    expect([value("txt_ProductionDataWTG_NetYieldP75"), value("txt_ProductionDataWTG_NetYieldP90")]).toEqual(["10,200", "10,200"]);
  });

  it("UT-PROD-905b the derived boxes are canvas `DisplayMode.View` — read-only in black text, not disabled", async () => {
    renderScreen();
    fireEvent.click(command("Add Production WTG"));
    const input = async (id: string) => (await screen.findByTestId(id)) as HTMLInputElement;
    // "Input losses" + "Input Uncertainty" (the Add defaults): p50, p75 and p90 are derived.
    for (const id of ["txt_ProductionDataWTG_NetYieldP50", "txt_ProductionDataWTG_NetYieldP75", "txt_ProductionDataWTG_NetYieldP90"]) {
      const el = await input(id);
      expect([el.readOnly, el.disabled]).toEqual([true, false]);
    }
    for (const id of ["txt_ProductionDataWTG_GrossYield", "txt_ProductionDataWTG_TotalLosses", "txt_ProductionDataWTG_Uncertainty"]) {
      const el = await input(id);
      expect([el.readOnly, el.disabled]).toEqual([false, false]);
    }
  });

  it("UT-PROD-906 Edit locks the modes and the assessment, and restores the stored values", async () => {
    renderScreen();
    fireEvent.click(command("Edit"));
    const losses = await screen.findByTestId("rad_ProductionDataWTG_Lossessp50");
    expect((losses as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByTestId("rad_ProductionDataWTG_Assesment") as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByTestId("txt_ProductionDataWTG_GrossYield") as HTMLInputElement).value).toBe("12,000");
    expect(screen.getByTestId("txt_ProductionDataWTG_GrossYield").getAttribute("aria-label")).toBe("txt_ProductionDataWTG_GrossYield");
    // The stored seasonality (8 × 11 + 12) is shown; Fabric read fine, so no warning.
    expect((screen.getByTestId("txt_ProductionSeasonalityYieldWTG_MonthValue-12") as HTMLInputElement).value).toBe("12.0");
    // `txt_…_TotalValue` is the read-only canvas box under "Total Sum [%]", in the Distribution column.
    const total = screen.getByTestId("txt_ProductionSeasonalityWTG_TotalValue") as HTMLInputElement;
    expect(total.value).toBe("100");
    expect(total.readOnly).toBe(true);
    expect(screen.queryByTestId("production-fabric-notice")).toBeNull();
  });

  it("UT-PROD-920 the Fabric standards seed a new yield's seasonality months and negative-price years", async () => {
    state.standard = {
      seasonality: [{ month: 1, pv: 6.5, wtg: 8 }, { month: 2, pv: 7, wtg: 7.5 }],
      negativePrices: [{ year: 2028, pv: 5, wind: 4.6 }],
    };
    renderScreen();
    fireEvent.click(command("Add Production WTG"));
    fireEvent.click(await screen.findByTestId("tgl_ProductionDataWTG_ConsiderSeasonality"));
    expect((await screen.findByTestId("txt_ProductionSeasonalityYieldWTG_MonthValue-1") as HTMLInputElement).value).toBe("8.0");
    expect((screen.getByTestId("txt_ProductionSeasonalityYieldWTG_MonthValue-2") as HTMLInputElement).value).toBe("7.5");
    fireEvent.click(screen.getByTestId("tgl_ProductionDataWTG_ConsiderNegativePrice"));
    // COD 2028-09-01: the curve starts in 2028 and reads the Wind column.
    expect((await screen.findByTestId("txt_ProductionNegativePriceWTG_YearValue-2028") as HTMLInputElement).value).toBe("4.6");
    expect(screen.queryByTestId("production-fabric-notice")).toBeNull();
  });

  it("UT-PROD-921 a failed Fabric read shows the warning once a toggle is on", async () => {
    state.standardError = new Error("no connection");
    renderScreen();
    fireEvent.click(command("Add Production WTG"));
    fireEvent.click(await screen.findByTestId("tgl_ProductionDataWTG_ConsiderSeasonality"));
    expect((await screen.findByTestId("production-fabric-notice")).textContent).toBe(PRODUCTION_SCREEN_TEXT.fabricUnavailable);
  });

  it("UT-PROD-913 a disabled Save is the canvas PowerCAT ActionButton (transparent \"✓ Save\"), not Fluent's grey primary", async () => {
    render(
      <FluentProvider theme={vsbTheme}>
        <PanelButtons onSave={vi.fn()} onCancel={vi.fn()} disabled subtleWhenDisabled saveTestId="reference-subtle-save" />
        <PanelButtons onSave={vi.fn()} onCancel={vi.fn()} disabled saveTestId="reference-primary-save" cancelTestId="reference-cancel" />
      </FluentProvider>,
    );
    const subtle = screen.getByTestId("reference-subtle-save").className;
    const primary = screen.getByTestId("reference-primary-save").className;
    expect(subtle).not.toBe(primary);
    renderScreen();
    for (const [tech, saveId] of [
      ["Add Production WTG", "pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_1"],
      ["Add Production PV", "pcf_btn_GeneratorData_RightPanel_Form_PVModuleType_Buttons_Save"],
    ] as const) {
      fireEvent.click(command(tech));
      // A new yield opens with a blank Description, so Save is disabled.
      const save = await screen.findByTestId(saveId);
      expect(save).toBeDisabled();
      expect(save.className).toBe(subtle);
      fireEvent.click(screen.getByTestId(tech.endsWith("PV") ? "btn_Cancel_ProductionDataPV" : "btn_Cancel_ProductionDataWTG"));
      await waitFor(() => expect(screen.queryByTestId(saveId)).toBeNull());
    }
  });

  it("UT-PROD-907 the panel's Cancel closes at once, without a leave confirmation", async () => {
    renderScreen();
    fireEvent.click(command("Add Production PV"));
    fireEvent.change(await screen.findByTestId("txt_ProductionDataPV_Description"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("btn_Cancel_ProductionDataPV"));
    await waitFor(() => expect(screen.queryByTestId("txt_ProductionDataPV_Description")).toBeNull());
    expect(screen.queryByText("Unsaved data")).toBeNull();
  });

  it("UT-PROD-907a Add PV: Input Irradiation shows 0.0 with an EMPTY Gross; Input Net Yield p50 keeps 0.0 (canvas)", async () => {
    renderScreen();
    fireEvent.click(command("Add Production PV"));
    const allocation = await screen.findByTestId("rad_ProductionDataPV_Allocation");
    fireEvent.click(within(allocation).getByRole("radio", { name: "Input Irradiation" }));
    const irradiation = () => screen.getByTestId("txt_ProductionDataPV_Irradation") as HTMLInputElement;
    const gross = () => screen.getByTestId("txt_ProductionDataPV_GrossYield") as HTMLInputElement;
    expect(irradiation().value).toBe("0.0");
    expect(gross().value).toBe("");
    // Typing derives the gross: plant PV capacity 5 × 1000.
    fireEvent.change(irradiation(), { target: { value: "1000" } });
    expect(gross().value).toBe("5,000");
    // `Reset(txt_ProductionDataPV_Irradation)` puts back `Text(locIrradation)` = "0.0"; the gross is blanked.
    fireEvent.click(within(screen.getByTestId("rad_ProductionDataPV_Lossessp50")).getByRole("radio", { name: "Input Net Yield p50" }));
    expect(irradiation().value).toBe("0.0");
    expect(gross().value).toBe("");
  });

  it("UT-PROD-908 Delete of the last active yield shows the prevent popup, never the confirmation", () => {
    renderScreen({ ...baseProject, netYieldP50: 10_200 }, [NORTH]);
    fireEvent.click(command("Delete"));
    expect(screen.getByText(PREVENT_LAST_YIELD_DIALOG.title)).toBeTruthy();
    expect(screen.getByTestId("icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel_1")).toBeTruthy();
    expect(screen.queryByText(DELETE_DIALOG.title)).toBeNull();
  });

  it("UT-PROD-912 Deactivate of the last active yield shows the same canvas pop-up, and Close only closes it", async () => {
    renderScreen({ ...baseProject, netYieldP50: 10_200 }, [NORTH]);
    fireEvent.click(command("Deactivate Production"));
    const popUp = screen.getByTestId("con_PopUp_Common_Generators_PreventTotalCapacity_Information_1");
    // `Width: =550`, `Height: =220` (Y:9319, Y:9326).
    expect(popUp.style.width).toBe("550px");
    expect(popUp.style.height).toBe("220px");
    expect(within(popUp).getByTestId("txt_PopUp_Common_Generators_PreventTotalCapacity_Title_1").textContent)
      .toBe(PREVENT_LAST_YIELD_DIALOG.title);
    expect(within(popUp).getByTestId("lbl_PopUp_Common_Generators_PreventTotalCapacity_Information_1").textContent)
      .toBe(PREVENT_LAST_YIELD_DIALOG.description);
    expect(screen.queryByText("Are you sure you want to deactivate: North?")).toBeNull();
    fireEvent.click(within(popUp).getByTestId("btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close_1"));
    await waitFor(() => expect(screen.queryByTestId("con_PopUp_Common_Generators_PreventTotalCapacity_Information_1")).toBeNull());
    expect(state.changeStatus).not.toHaveBeenCalled();
    expect(state.deleteYield).not.toHaveBeenCalled();
  });

  it("UT-PROD-909 Delete and Deactivate hand the selected row to the write hook", async () => {
    renderScreen();
    fireEvent.click(command("Delete"));
    expect(await screen.findByText(DELETE_DIALOG.description("North"))).toBeTruthy();
    // The PM `cmp_PopUp_Confirmation`: a 128-wide "✓ Delete" (`Width: =128`, `IconName: ="CheckMark"`).
    const canvasConfirm = () => screen.getByTestId("confirm-dialog-confirm") as HTMLButtonElement;
    expect(canvasConfirm().style.width).toBe("128px");
    expect(canvasConfirm().textContent).toBe("Delete");
    fireEvent.click(canvasConfirm());
    await waitFor(() => expect(state.deleteYield).toHaveBeenCalledWith(NORTH));
    fireEvent.click(command("Deactivate Production"));
    expect(await screen.findByText("Are you sure you want to deactivate: North?")).toBeTruthy();
    expect(canvasConfirm().style.width).toBe("128px");
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.changeStatus).toHaveBeenCalledWith(NORTH));
  });

  it("UT-PROD-910 a failed read shows the load-error state", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(PRODUCTION_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
  });
});
