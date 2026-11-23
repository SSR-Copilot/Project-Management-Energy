// @vitest-environment jsdom
/**
 * Render tests for the Revenue screen's performance changes (D136): each of the four write jobs names the data
 * it reloads, and a keystroke in the panel no longer rebuilds every contract card. `./hooks` is mocked with fixed rows,
 * as in `Screen.test.tsx`; `./rules` is real, with `contractCardFields` wrapped in a spy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import type { PlanJob } from "@/data/usePlanWrite";
import type { BalancingPeriod, RevenueProject, StandardFlags, StoredRevenueContract } from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);

const project: RevenueProject = {
  id: "p-1", projectIdText: "FR-0001", projectName: "Parc Sud", countryName: "France", countryCode: "c-fr",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: null, construction: null,
  legallyBindingPermits: null, applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000f2", clusterStateOrder: 4,
};
const noFlags: StandardFlags = {
  biddingPrice: false, contractDurationYears: false, contractDurationMonths: false,
  contractStartDate: false, contractEndDate: false, tariffPrice: false, tariffPriceP90: false,
  useInflationProfile: false, useCustomInflation: false, inflationProfileYear: false,
  customInflationProfile: false, hedgedVolume: false, correctionFactor: false, correctionFactorP90: false,
};
const contract = (id: string): StoredRevenueContract => ({
  id, name: `Parc Sud-PPA-PPA France ${id}`, description: "PPA France",
  label: CHOICE_FINANCE.revenueLabel.ppa, tariffPrice: 65, tariffPriceP90: 65, biddingPrice: 0,
  siteQuality: 0, siteQualityP90: 0, correctionFactor: 0, correctionFactorP90: 0,
  contractStartDate: d("2028-01-01"), contractEndDate: d("2042-12-31"),
  contractDurationYears: 15, contractDurationMonths: 0,
  hedgeType: CHOICE_FINANCE.hedgingType.hedgedVolumePercent, hedgedVolume: 70, fixedContractedMwhPa: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: 0, inflationStartYear: 0,
  inflationCountryArea: null, considerNegativePrices: false, negativePriceManualOverride: false,
  currencyId: "cur-eur", currencyName: "Euro", subaccountId: "sub-1", flags: noFlags,
  createdOn: "2026-01-01T00:00:00Z", canEdit: true, canDelete: true, isFolded: false,
});
const period = (over: Partial<BalancingPeriod> = {}): BalancingPeriod => ({
  id: "b-1", name: "Balancing Price 1", periods: CHOICE_FINANCE.periods.period1, price: 5,
  startDate: d("2028-04-01"), endDate: d("2029-03-31"), durationYears: 1, durationMonths: 0,
  shiftOfCodMonths: 3, createdOn: "2026-01-01T00:00:00Z", ...over,
});

const state = { contracts: [] as StoredRevenueContract[], periods: [] as BalancingPeriod[] };
const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_projectrevenues"],
  useRevenueProject: () => ok(project),
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
  fetchOverlappingContracts: async () => [],
  fetchIndividualVolumeIds: async () => ["v-old"],
}));
vi.mock("./rules", async (importOriginal) => {
  const real = await importOriginal<typeof import("./rules")>();
  return { ...real, contractCardFields: vi.fn(real.contractCardFields) };
});

import ProjectRevenuesScreen from "./Screen";
import { CONTRACT_CARD_CONTROL, contractCardFields } from "./rules";

const cardFieldsSpy = vi.mocked(contractCardFields);
const renderScreen = (path = "/project/revenues") => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter initialEntries={[path]}><ProjectRevenuesScreen /></MemoryRouter>
  </FluentProvider>,
);
const button = (testId: string) => screen.getByTestId(testId) as HTMLButtonElement;
const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const BAR = (id: string) => `pcf_ProjectRevenues_Content_ContractCommandBar_3-${id}`;
const CONTRACT_KEYS = [["pmRevenues", "p-1", "contracts"], ["pmRevenues", "p-1", "volumes"]];
const BALANCING_KEYS = [["pmRevenues", "p-1", "balancing"]];
const editEnabled = (id: string) => waitFor(() => {
  const b = button(`${BAR(id)}-editRevenueContract`);
  expect(b.disabled).toBe(false);
  return b;
});

beforeEach(() => {
  state.contracts = [contract("r-1")];
  state.periods = [];
  run.mockClear();
  cardFieldsSpy.mockClear();
});

describe("UT-REVPERF Screen — what each write reloads", () => {
  it("UT-REVPERF-080 a contract Save reloads the contracts and volumes only", async () => {
    renderScreen();
    fireEvent.click(await editEnabled("r-1"));
    expect(await screen.findByText("Edit Revenue Contract")).toBeTruthy();
    fireEvent.change(input("txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_1"), { target: { value: "66.50" } });
    fireEvent.click(await waitFor(() => {
      const b = button("pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1");
      expect(b.disabled).toBe(false);
      return b;
    }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]![0].progress).toBe("Please wait, saving...");
    expect(run.mock.calls[0]![0].invalidate).toEqual(CONTRACT_KEYS);
  });

  it("UT-REVPERF-081 a contract Delete reloads the contracts and volumes only", async () => {
    renderScreen();
    fireEvent.click(await waitFor(() => {
      const b = button(`${BAR("r-1")}-deleteRevenueContract`);
      expect(b.disabled).toBe(false);
      return b;
    }));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]![0].progress).toBe("Deleting Contract...");
    expect(run.mock.calls[0]![0].invalidate).toEqual(CONTRACT_KEYS);
  });

  it("UT-REVPERF-082 a balancing Delete reloads the balancing prices only", async () => {
    state.periods = [period(), period({ id: "b-2", name: "Balancing Price 2", createdOn: "2026-02-01T00:00:00Z", shiftOfCodMonths: null })];
    renderScreen("/project/revenues?tab=Balancing%20Price");
    fireEvent.click(button("con_Main_Project_Overview_Header_SuitBar_CommandBar_1-b-2-deleteProject"));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]![0].progress).toBe("Please wait, deleting...");
    expect(run.mock.calls[0]![0].invalidate).toEqual(BALANCING_KEYS);
  });

  it("UT-REVPERF-083 a balancing Save reloads the balancing prices only", async () => {
    renderScreen("/project/revenues?tab=Balancing%20Price");
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
    expect(run.mock.calls[0]![0].invalidate).toEqual(BALANCING_KEYS);
  });
});

describe("UT-REVPERF Screen — contract cards and the panel", () => {
  it("UT-REVPERF-084 typing in the panel does not rebuild the contract cards", async () => {
    state.contracts = [contract("r-1"), contract("r-2"), contract("r-3")];
    renderScreen();
    await waitFor(() => expect(screen.getAllByTestId(/^txt_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_/).length).toBeGreaterThan(0));
    fireEvent.click(await editEnabled("r-1"));
    expect(await screen.findByText("Edit Revenue Contract")).toBeTruthy();
    const afterOpen = cardFieldsSpy.mock.calls.length;
    expect(afterOpen).toBeGreaterThanOrEqual(3); // each card built its fields at least once
    const tariff = input("txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_1");
    for (const v of ["6", "66", "66.5", "66.50"]) fireEvent.change(tariff, { target: { value: v } });
    expect(tariff.value).toBe("66.50"); // the panel did re-render with every keystroke ...
    expect(cardFieldsSpy.mock.calls.length).toBe(afterOpen); // ... and no card was rebuilt
  });

  it("UT-REVPERF-085 the cards still show every field, with the same test ids and labels, after the extraction", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId(`${CONTRACT_CARD_CONTROL.card}-r-1`)).toBeTruthy());
    const fields = cardFieldsSpy.mock.results.at(-1)!.value as { values: { control: string; accessibleLabel: string; text: string }[] }[];
    const values = fields.flatMap((f) => f.values);
    expect(values.length).toBeGreaterThan(5);
    for (const v of values) {
      const el = screen.getByTestId(`${v.control}-r-1`) as HTMLInputElement;
      expect(el.getAttribute("aria-label")).toBe(v.accessibleLabel);
      expect(el.value).toBe(v.text);
      expect(el.readOnly).toBe(true);
    }
  });

  it("UT-REVPERF-086 a changed contract list does rebuild the cards (the memo keys on the row)", async () => {
    const view = renderScreen();
    await waitFor(() => expect(cardFieldsSpy.mock.calls.length).toBeGreaterThan(0));
    cardFieldsSpy.mockClear();
    state.contracts = [{ ...contract("r-1"), tariffPrice: 70, tariffPriceP90: 70 }];
    view.rerender(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter initialEntries={["/project/revenues"]}><ProjectRevenuesScreen /></MemoryRouter>
      </FluentProvider>,
    );
    await waitFor(() => expect(cardFieldsSpy.mock.calls.length).toBeGreaterThan(0));
  });
});
