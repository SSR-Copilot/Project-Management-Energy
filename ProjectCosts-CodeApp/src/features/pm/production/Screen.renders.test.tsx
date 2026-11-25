// @vitest-environment jsdom
/**
 * Production panel: what a keystroke re-renders (D162 B4, FE-P2-03). `./hooks` is mocked with fixed rows, as in
 * `Screen.test.tsx`; the counts come from the `probeRender` seam (`src/test/renderCounts.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import { COMMAND_BAR_LABEL, type EnergyYieldRow, type ProductionProject } from "./rules";

const project: ProductionProject = {
  id: "p1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryId: "c1", countryName: "Germany", technology: 952850000,
  totalCapacity: 22.4, endDate: "2055-12-31", cod: "2028-09-01", plantPvCapacity: 5,
  grossYield: 12_000, windSpeed: 7, irradiation: null, netYieldP50: 20_400, netYieldP75: 18_000, netYieldP90: 17_000,
  standardCostCreated: true, owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1",
};
const yields: EnergyYieldRow[] = [{
  id: "y1", name: "EY-1", description: "North", type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal, allocation: 100, windSpeed: 7, irradiation: null,
  grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10, netYieldP75: 9_512, netYieldP90: 8_893,
  productionAllocation: null, productionLossesP50: false, productionUncertainty: false,
  considerSeasonality: true, considerNegativePrices: false, status: 0,
}];
const standard = {
  seasonality: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pv: 8, wtg: i === 11 ? 12 : 8 })),
  negativePrices: Array.from({ length: 15 }, (_, i) => ({ year: 2028 + i, pv: 5, wind: 4.6 })),
};
const storedSeason = { recordId: "s1", months: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 12], standardValuesJson: null };
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p1", locale: "en-US", loading: false, envVars: {} }),
}));
vi.mock("./hooks", () => ({
  CAN_EDIT_SELECTED_PROJECT: true,
  useProductionProject: () => ok(project),
  useEnergyYields: () => ok(yields),
  useRevenueAssumptions: () => ok(standard),
  useStoredSeasonality: () => ok(storedSeason),
  useStoredNegativePrices: () => ok([]),
  useProductionWrites: () => ({
    progress: null, error: null, success: null, clear: () => {},
    saveYield: async () => true, deleteYield: async () => true, changeStatus: async () => true,
  }),
}));

import ProductionScreen from "./Screen";

const bar = () => screen.getByRole("toolbar", { name: COMMAND_BAR_LABEL });
const command = (name: string) => within(bar()).getByRole("button", { name }) as HTMLButtonElement;
const box = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;

let renders: RenderCounts;
beforeEach(() => { renders = countRenders(); });
afterEach(() => { renders.stop(); cleanup(); });

async function openAddWtgWithBothLists() {
  render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter><ProductionScreen /></MemoryRouter>
    </FluentProvider>,
  );
  fireEvent.click(command("Add Production WTG"));
  fireEvent.click(await screen.findByTestId("tgl_ProductionDataWTG_ConsiderSeasonality"));
  fireEvent.click(screen.getByTestId("tgl_ProductionDataWTG_ConsiderNegativePrice"));
  await screen.findByTestId("txt_ProductionNegativePriceWTG_YearValue-2042");
  expect(screen.getAllByTestId(/^txt_ProductionSeasonalityYieldWTG_MonthValue-/)).toHaveLength(12);
}

describe("UT-PROD-FE Production renders per keystroke (D162 B4, FE-P2-03)", () => {
  it("UT-PROD-FE-001 a keystroke in another panel field renders no month row and no negative-price row", async () => {
    await openAddWtgWithBothLists();
    renders.reset();
    fireEvent.change(box("txt_ProductionDataWTG_Description"), { target: { value: "E" } });
    fireEvent.change(box("txt_ProductionDataWTG_Description"), { target: { value: "Ea" } });
    expect(box("txt_ProductionDataWTG_Description").value).toBe("Ea");
    expect(renders.ofPrefix("ProductionSeasonRow:")).toBe(0);
    expect(renders.ofPrefix("ProductionNegativeRow:")).toBe(0);
  });

  it("UT-PROD-FE-002 a month edit renders every row once (all lose the standard flag), then only the edited row", async () => {
    await openAddWtgWithBothLists();
    renders.reset();
    fireEvent.change(box("txt_ProductionSeasonalityYieldWTG_MonthValue-3"), { target: { value: "9" } });
    expect(renders.ofPrefix("ProductionSeasonRow:")).toBe(12);
    renders.reset();
    fireEvent.change(box("txt_ProductionSeasonalityYieldWTG_MonthValue-3"), { target: { value: "9.5" } });
    expect(box("txt_ProductionSeasonalityYieldWTG_MonthValue-3").value).toBe("9.5");
    expect(renders.ofPrefix("ProductionSeasonRow:")).toBe(1);
    expect(renders.of("ProductionSeasonRow:3")).toBe(1);
    expect(renders.ofPrefix("ProductionNegativeRow:")).toBe(0);
    // The total follows the typed value: 10 x 8 + 9.5 + 12 = 101.5.
    expect(box("txt_ProductionSeasonalityWTG_TotalValue").value).toBe("101.5");
  });

  it("UT-PROD-FE-003 a negative-price edit and its reset render only that year's row", async () => {
    await openAddWtgWithBothLists();
    renders.reset();
    fireEvent.change(box("txt_ProductionNegativePriceWTG_YearValue-2030"), { target: { value: "7" } });
    expect(box("txt_ProductionNegativePriceWTG_YearValue-2030").value).toBe("7");
    expect(renders.ofPrefix("ProductionNegativeRow:")).toBe(1);
    expect(renders.of("ProductionNegativeRow:2030")).toBe(1);
    renders.reset();
    fireEvent.click(screen.getByTestId("ico_ProductionNegativePriceWTG_YearValueReset-2030"));
    expect(box("txt_ProductionNegativePriceWTG_YearValue-2030").value).toBe("4.6");
    expect(renders.ofPrefix("ProductionNegativeRow:")).toBe(1);
    expect(renders.ofPrefix("ProductionSeasonRow:")).toBe(0);
  });
});
