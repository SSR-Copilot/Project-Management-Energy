// @vitest-environment jsdom
/**
 * Render tests for the connected Project Revenues Screen (D33): `./hooks` is mocked with fixed rows,
 * so these check the canvas captions and ids, the gates and the write jobs handed to `run`. The
 * rules are covered by `rules.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import {
  DIALOG, PAGE_LOCK_TITLE, REVENUE_SCREEN_TEXT, SCREEN_LABEL,
  type BalancingPeriod, type OverlappingContract, type RevenueProject, type StandardFlags,
  type StoredRevenueContract,
} from "./rules";


const d = (s: string) => new Date(`${s}T00:00:00`);

const baseProject: RevenueProject = {
  id: "p-1", projectIdText: "FR-0001", projectName: "Parc Sud", countryName: "France", countryCode: "c-fr",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: null, construction: null,
  legallyBindingPermits: null, applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bu-fr", clusterStateOrder: 4,
};

const noFlags: StandardFlags = {
  biddingPrice: false, contractDurationYears: false, contractDurationMonths: false,
  contractStartDate: false, contractEndDate: false, tariffPrice: false, tariffPriceP90: false,
  useInflationProfile: false, useCustomInflation: false, inflationProfileYear: false,
  customInflationProfile: false, hedgedVolume: false, correctionFactor: false, correctionFactorP90: false,
};

const contract: StoredRevenueContract = {
  id: "r-1", name: "Parc Sud-PPA-PPA France", description: "PPA France",
  label: CHOICE_FINANCE.revenueLabel.ppa, tariffPrice: 65, tariffPriceP90: 65, biddingPrice: 0,
  siteQuality: 0, siteQualityP90: 0, correctionFactor: 0, correctionFactorP90: 0,
  contractStartDate: d("2028-01-01"), contractEndDate: d("2042-12-31"),
  contractDurationYears: 15, contractDurationMonths: 0,
  hedgeType: CHOICE_FINANCE.hedgingType.hedgedVolumePercent, hedgedVolume: 70, fixedContractedMwhPa: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: 0, inflationStartYear: 0,
  inflationCountryArea: null, considerNegativePrices: false, negativePriceManualOverride: false,
  currencyId: "cur-eur", currencyName: "Euro", subaccountId: "sub-1", flags: noFlags,
  createdOn: "2026-01-01T00:00:00Z", canEdit: true, canDelete: true, isFolded: false,
};

const period = (over: Partial<BalancingPeriod> = {}): BalancingPeriod => ({
  id: "b-1", name: "Balancing Price 1", periods: CHOICE_FINANCE.periods.period1, price: 5,
  startDate: d("2028-04-01"), endDate: d("2029-03-31"), durationYears: 1, durationMonths: 0,
  shiftOfCodMonths: 3, createdOn: "2026-01-01T00:00:00Z", ...over,
});

const state = {
  project: baseProject as RevenueProject | null,
  contracts: [contract] as StoredRevenueContract[],
  periods: [] as BalancingPeriod[],
  overlap: [] as OverlappingContract[],
  error: undefined as unknown,
};
const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);
const fetchVolumeIds = vi.fn(async () => ["v-old"]);
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_projectrevenues"],
  useRevenueProject: () => ({ data: state.project, isLoading: false, error: state.error, connected: true }),
  useItalyRegion: () => null,
  useRevenueAssumptions: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useRevenueContracts: () => ok(state.contracts),
  useBalancingPrices: () => ok(state.periods),
  useIndividualVolumes: () => ok([]),
  useNegativePriceProduction: () => ok(false),
  useRevenueSubaccount: () => ok({ id: "sub-1", name: "Revenues" }),
  useRevenueCurrency: () => ok({ id: "cur-eur", name: "Euro" }),
  useCountryInflationProfiles: () => ok([]),
  useRevenueWrites: () => ({ run, progress: null, error: null, success: null, clear: () => {} }),
  fetchOverlappingContracts: async () => state.overlap,
  fetchIndividualVolumeIds: () => fetchVolumeIds(),
}));

import ProjectRevenuesScreen from "./Screen";

const renderScreen = (path = "/project/revenues") => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter initialEntries={[path]}><ProjectRevenuesScreen /></MemoryRouter>
  </FluentProvider>,
);

const button = (testId: string) => screen.getByTestId(testId) as HTMLButtonElement;
const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const planOf = async (job: PlanJob): Promise<WritePlan> => (typeof job.plan === "function" ? job.plan() : job.plan);

beforeEach(() => {
  state.project = baseProject;
  state.contracts = [contract];
  state.periods = [];
  state.overlap = [];
  state.error = undefined;
  run.mockClear();
  fetchVolumeIds.mockClear();
});

const HDR = "lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_";
const FLD = "txt_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_";
const BAR = "pcf_ProjectRevenues_Content_ContractCommandBar_3-r-1";

describe("UT-REV Screen (connected)", () => {
  it("UT-REV-901 renders the heading, tabs and the contract grid in the canvas formats", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.getByText(SCREEN_LABEL.heading, { selector: "h1" })).toBeTruthy();
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("tab_ProjectRevenue_DisplayProjectBodyRightContent");
    expect(screen.getByRole("tab", { name: "Contracted Revenue" })).toBeTruthy();
    expect(button("btn_Revenue_AddContract").getAttribute("aria-label")).toBe("btn_Revenue_AddContract");
    expect(button("btn_Revenue_AddContract").textContent).toBe(SCREEN_LABEL.addContract);
    // The canvas card gallery (D33 V6): one card, its header and the field tiles in canvas formats.
    expect(screen.queryByRole("table", { name: "Contracted Revenue" })).toBeNull();
    expect(screen.getByTestId(`${HDR}LabelWithDescription_1-r-1`).textContent).toBe("PPA - PPA France");
    expect(input(`${FLD}Currency_1-r-1`).value).toBe("Euro");
    expect(input(`${FLD}Currency_1-r-1`).getAttribute("aria-label")).toBe(`${FLD}Currency_1`);
    expect(input(`${FLD}ContractStartDate_1-r-1`).value).toBe("01.01.2028");
    expect(input(`${FLD}ContractDurationYears_1-r-1`).value).toBe("15 years");
    expect(input(`${FLD}ContractDurationMonths_1-r-1`).value).toBe("0 month");
    expect(input(`${FLD}HedgedVolume_1-r-1`).value).toBe("70 %");
    expect(input(`${FLD}HedgedVolume_2-r-1`).value).toBe("Hedged Volume [%]");
    expect(input(`${FLD}HedgedVolume_2-r-1`).getAttribute("aria-label")).toBe(`${FLD}HedgedVolume_1`);
    expect(input(`${FLD}TarifPrice_1-r-1`).value).toBe("65.00");
    expect(screen.getByTestId(`lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_TarifPrice_1-r-1`).textContent)
      .toBe("Tariff / Price  [EUR/MWh]");
    // France, PPA: no German FiT tiles.
    expect(screen.queryByTestId(`${FLD}BiddingPrice_1-r-1`)).toBeNull();
    expect(screen.queryByText(PAGE_LOCK_TITLE)).toBeNull();
  });

  it("UT-REV-902 a locked page shows the canvas banner; tabs and commands are disabled but the grid stays", () => {
    state.project = { ...baseProject, netYieldP50: 0, clusterStateName: "Draft" };
    renderScreen("/project/revenues?tab=Balancing%20Price");
    expect(screen.getByText(PAGE_LOCK_TITLE)).toBeTruthy();
    expect(screen.getByText("• Production")).toBeTruthy();
    expect(screen.getByText("• Change the project status from Draft")).toBeTruthy();
    expect(button("btn_Revenue_AddContract").disabled).toBe(true);
    expect(screen.getByRole("tab", { name: "Balancing Price" }).hasAttribute("disabled")
      || screen.getByRole("tab", { name: "Balancing Price" }).getAttribute("aria-disabled") === "true").toBe(true);
    // The default tab shows while the tabs are disabled; the contracts stay visible (S3).
    expect(screen.getByTestId("gal_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_1")).toBeTruthy();
  });

  it("UT-REV-903 Add Contract opens with an empty Type, the Fabric notice and Save disabled", async () => {
    renderScreen();
    fireEvent.click(button("btn_Revenue_AddContract"));
    expect(await screen.findByText("Add Revenue Contract")).toBeTruthy();
    expect(screen.getByTestId("revenues-assumptions-not-connected").textContent).toContain(REVENUE_SCREEN_TEXT.assumptionsNotConnected);
    const type = screen.getByTestId("drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Label_1");
    expect(type.getAttribute("aria-label")).toBe("drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Label_1");
    expect(type.textContent).toBe("");
    expect(input("txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Description_1").getAttribute("aria-label"))
      .toBe("txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Description_1");
    expect(input("drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Currency_1").value).toBe("Euro");
    expect(button("pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1").disabled).toBe(true);
  });

  it("UT-REV-904 Edit → change → Save runs the contract job: update, then the stored volumes deleted", async () => {
    renderScreen();
    fireEvent.click(await waitFor(() => {
      const b = button(`${BAR}-editRevenueContract`);
      expect(b.disabled).toBe(false);
      return b;
    }));
    expect(await screen.findByText("Edit Revenue Contract")).toBeTruthy();
    fireEvent.change(input("txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_1"), { target: { value: "66.50" } });
    const save = await waitFor(() => {
      const b = button("pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1");
      expect(b.disabled).toBe(false);
      return b;
    });
    fireEvent.click(save);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const job = run.mock.calls[0]![0];
    expect(job.progress).toBe("Please wait, saving...");
    const plan = await planOf(job);
    expect(fetchVolumeIds).toHaveBeenCalled();
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}:${w.id ?? ""}`)).toEqual([
      "update:vsb_projectrevenues:r-1",
      "delete:vsb_revenueindividualhedgevolumes:v-old",
    ]);
    expect(plan.writes[0]!.data).toMatchObject({
      vsb_tariffprice: 66.5, vsb_tariffpricep90: 66.5, vsb_hedgedvolume: 70,
      "owningbusinessunit@odata.bind": "/businessunits(bu-fr)",
    });
  });

  it("UT-REV-905 a hedged volume above 100 % in a month shows the info pop-up and saves nothing", async () => {
    state.overlap = [{ id: "r-9", startDate: d("2030-01-01"), endDate: d("2030-06-30"), hedgedVolume: 50 }];
    renderScreen();
    fireEvent.click(await waitFor(() => {
      const b = button(`${BAR}-editRevenueContract`);
      expect(b.disabled).toBe(false);
      return b;
    }));
    fireEvent.change(await screen.findByTestId("txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgedVolume_1"), { target: { value: "60" } });
    fireEvent.click(await waitFor(() => {
      const b = button("pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1");
      expect(b.disabled).toBe(false);
      return b;
    }));
    expect(await screen.findByText(DIALOG.hedgeOver100Title)).toBeTruthy();
    expect(screen.getByText(/From 01\.2030 to 06\.2030\./)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });

  it("UT-REV-906 Delete asks first, then runs one delete of the contract", async () => {
    renderScreen();
    fireEvent.click(await waitFor(() => {
      const b = button(`${BAR}-deleteRevenueContract`);
      expect(b.disabled).toBe(false);
      return b;
    }));
    expect(await screen.findByText(DIALOG.deleteContractTitle)).toBeTruthy();
    expect(screen.getByText('Are you sure you want to delete revenue contract "PPA-PPA France"?')).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const job = run.mock.calls[0]![0];
    expect(job.progress).toBe("Deleting Contract...");
    expect((await planOf(job)).writes).toEqual([
      { op: "delete", entitySet: "vsb_projectrevenues", id: "r-1", reason: "delete the revenue contract" },
    ]);
  });

  it("UT-REV-907 Balancing Price below Cluster 4: the canvas message and Add disabled", () => {
    state.project = { ...baseProject, clusterStateOrder: 3 };
    renderScreen("/project/revenues?tab=Balancing%20Price");
    expect(screen.getByText(SCREEN_LABEL.balancingClusterGate)).toBeTruthy();
    expect(button("btn_Revenue_AddBlancing_Price").disabled).toBe(true);
    expect(screen.queryByTestId("con_ProjectBalancing_Price_Grid")).toBeNull();
  });

  it("UT-REV-908 Add Balancing Price creates the first period with the shift and the project's owner", async () => {
    renderScreen("/project/revenues?tab=Balancing%20Price");
    expect(screen.getByText(SCREEN_LABEL.balancingEmptyInfo)).toBeTruthy();
    fireEvent.click(button("btn_Revenue_AddBlancing_Price"));
    expect(await screen.findByText("Add balancing price")).toBeTruthy();
    fireEvent.change(input("txt_BalancingPrice_ShiftOfCODDate"), { target: { value: "3" } });
    fireEvent.change(input("txt_Revenue_BalancingPrice[EUR/MWh]"), { target: { value: "4.5" } });
    fireEvent.click(await waitFor(() => {
      const b = button("pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_2");
      expect(b.disabled).toBe(false);
      return b;
    }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const plan = await planOf(run.mock.calls[0]![0]);
    expect(plan.writes[0]).toMatchObject({ op: "create", entitySet: "vsb_balancingprices" });
    expect(plan.writes[0]!.data).toMatchObject({
      vsb_name: "Balancing Price 1", vsb_shiftofcoddatemonths: 3, vsb_balancingpriceeurpln: 4.5,
      vsb_contractdurationyear: 0, vsb_contractdurationmonth: 1,
      "owningbusinessunit@odata.bind": "/businessunits(bu-fr)",
    });
  });

  it("UT-REV-909 only the newest balancing period can be edited or deleted; Delete runs one delete", async () => {
    state.periods = [period(), period({ id: "b-2", name: "Balancing Price 2", createdOn: "2026-02-01T00:00:00Z", shiftOfCodMonths: null })];
    renderScreen("/project/revenues?tab=Balancing%20Price");
    expect(button("con_Main_Project_Overview_Header_SuitBar_CommandBar_1-b-1-editProject").disabled).toBe(true);
    expect(button("con_Main_Project_Overview_Header_SuitBar_CommandBar_1-b-2-editProject").disabled).toBe(false);
    expect(screen.getAllByText("01.04.2028")).toHaveLength(2);
    fireEvent.click(button("con_Main_Project_Overview_Header_SuitBar_CommandBar_1-b-2-deleteProject"));
    expect(await screen.findByText('Are you sure you want to delete "Balancing Price 2"?')).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const job = run.mock.calls[0]![0];
    expect(job.progress).toBe("Please wait, deleting...");
    expect((await planOf(job)).writes[0]).toMatchObject({ op: "delete", entitySet: "vsb_balancingprices", id: "b-2" });
  });

  it("UT-REV-911 each card folds and unfolds with its chevrons; the folded card hides its bar and fields", async () => {
    renderScreen();
    const up = button("ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_1-r-1");
    expect(up.getAttribute("aria-label")).toBe("ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_1");
    expect(screen.getByTestId(`${BAR}-editRevenueContract`)).toBeTruthy();
    fireEvent.click(up);
    const down = await screen.findByTestId("ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_2-r-1");
    expect(down.getAttribute("aria-label")).toBe("ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_2");
    expect(screen.queryByTestId(`${BAR}-editRevenueContract`)).toBeNull();
    expect(screen.queryByTestId(`${FLD}Currency_1-r-1`)).toBeNull();
    // the header (Label - Description) stays
    expect(screen.getByTestId(`${HDR}LabelWithDescription_1-r-1`)).toBeTruthy();
    fireEvent.click(down);
    expect(await screen.findByTestId(`${BAR}-editRevenueContract`)).toBeTruthy();
  });

  it("UT-REV-912 a locked page disables the cards' chevrons and Edit / Delete; the cards stay", () => {
    state.project = { ...baseProject, clusterStateName: "Draft" };
    renderScreen();
    expect(button(`${BAR}-editRevenueContract`).disabled).toBe(true);
    expect(button(`${BAR}-deleteRevenueContract`).disabled).toBe(true);
    expect(button("ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_1-r-1").disabled).toBe(true);
    expect(input(`${FLD}Currency_1-r-1`).value).toBe("Euro");
  });

  it("UT-REV-916 the contract panel: two sections, one Contract Duration caption, the country toggle only with inflation on", async () => {
    renderScreen();
    fireEvent.click(button("btn_Revenue_AddContract"));
    expect(await screen.findByText("Add Revenue Contract")).toBeTruthy();
    const left = screen.getByTestId("con_ProjectRevenues_RightPanel_LeftSection_NewEditCost_BodyContent");
    expect(screen.getByTestId("con_ProjectRevenues_RightPanel_RightSection_NewEditCost_BodyContent")).toBeTruthy();
    expect(Array.from(left.querySelectorAll("label")).filter((l) => l.textContent?.includes("Contract Duration"))).toHaveLength(1);
    expect(screen.getByTestId("drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractDuration_Years_1")).toBeTruthy();
    expect(screen.getByTestId("drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractDuration_Months_1")).toBeTruthy();
    expect(screen.queryByTestId("tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1")).toBeNull();
    fireEvent.click(screen.getByTestId("tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1"));
    expect(await screen.findByTestId("tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1")).toBeTruthy();
  });

  it("UT-REV-910 a failed read shows the load-error state, not an empty grid", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(REVENUE_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
    expect(screen.queryByTestId("gal_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_1")).toBeNull();
  });
});
