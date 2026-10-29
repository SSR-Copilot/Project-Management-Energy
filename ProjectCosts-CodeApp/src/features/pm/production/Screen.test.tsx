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
  standardCostCreated: true, owningBusinessUnitId: "bu-1",
};

const yieldRow = (over: Partial<EnergyYieldRow>): EnergyYieldRow => ({
  id: "y1", name: "EY-1", description: "North", type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal, allocation: 100, windSpeed: 7, irradiation: null,
  grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10, netYieldP75: 9_512, netYieldP90: 8_893,
  productionAllocation: null, productionLossesP50: false, productionUncertainty: false,
  considerSeasonality: true, considerNegativePrices: false, status: 0, ...over,
});

const state = vi.hoisted(() => ({
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
  useSession: () => ({ projectId: "p1", locale: "en-US", loading: false, envVars: {} }),
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
      [YIELD_COL.type]: CHOICE_PRODUCTION.yieldType.wtg, "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
    expect(req.seasonality.on).toBe(false);
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

  it("UT-PROD-907 the panel's Cancel closes at once, without a leave confirmation", async () => {
    renderScreen();
    fireEvent.click(command("Add Production PV"));
    fireEvent.change(await screen.findByTestId("txt_ProductionDataPV_Description"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("btn_Cancel_ProductionDataPV"));
    await waitFor(() => expect(screen.queryByTestId("txt_ProductionDataPV_Description")).toBeNull());
    expect(screen.queryByText("Unsaved data")).toBeNull();
  });

  it("UT-PROD-908 Delete of the last active yield shows the prevent popup, never the confirmation", () => {
    renderScreen({ ...baseProject, netYieldP50: 10_200 }, [NORTH]);
    fireEvent.click(command("Delete"));
    expect(screen.getByText(PREVENT_LAST_YIELD_DIALOG.title)).toBeTruthy();
    expect(screen.getByTestId("icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel_1")).toBeTruthy();
    expect(screen.queryByText(DELETE_DIALOG.title)).toBeNull();
  });

  it("UT-PROD-909 Delete and Deactivate hand the selected row to the write hook", async () => {
    renderScreen();
    fireEvent.click(command("Delete"));
    expect(await screen.findByText(DELETE_DIALOG.description("North"))).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.deleteYield).toHaveBeenCalledWith(NORTH));
    fireEvent.click(command("Deactivate Production"));
    expect(await screen.findByText("Are you sure you want to deactivate: North?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.changeStatus).toHaveBeenCalledWith(NORTH));
  });

  it("UT-PROD-910 a failed read shows the load-error state", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(PRODUCTION_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
  });
});
