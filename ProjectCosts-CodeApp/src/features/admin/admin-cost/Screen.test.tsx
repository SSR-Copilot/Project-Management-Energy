// @vitest-environment jsdom
/**
 * Render and behaviour tests for the connected Admin Cost Screen, with `hooks.ts` mocked by fixed
 * rows (no Dataverse). `rules.test.ts` covers the rules; this file covers the composition: canvas
 * captions and test ids, and the write job handed to `run`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { COST_CATEGORIES, DEVEX_COLUMN_HEADERS, MSG } from "./rules";
import AdminCostScreen from "./Screen";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ locale: "en-GB", loading: false }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const run = vi.fn(async () => ["new"]);

vi.mock("./hooks", () => {
  const ok = <V,>(data: V) => ({ data, isLoading: false, error: undefined, connected: true });
  const a = (id: string, number: string, name: string, parentId: string | null, order = 1) =>
    ({ id, number, name, parentId, order, status: 0, owningBusinessUnitId: null });
  const opex = (o: Record<string, unknown>) => ({
    id: "h", description: "Standard LL Locations", startDateString: "Cluster 6: Operation", countryId: "de",
    technology: 952850000, typeOfContract: 952850000, period: 952850000, opexSubaccountId: null,
    landLeaseSubaccountId: "ll1", currencyId: "eur", currencyName: "Euro", isLastPeriod: true, isCollapsed: false,
    fixCosts: 1500, percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null, aggregation: 952850000,
    distributionFrequency: 12, durationYears: 5, durationMonths: 0, secured: false, allWtgAllocated: true,
    externalContract: null, useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
    inflationArea: null, inflationCountryArea: null, amount1: null, dueDate1: null, amount2: null, dueDate2: null,
    amount3: null, dueDate3: null, threshold: false, thresholdType: null, thresholdIndividual: null,
    alignWithProjectDuration: false, ...o,
  });
  return {
    TABLES: [],
    useCostCountries: () => ok([{ id: "fr", name: "France" }, { id: "de", name: "Germany" }, { id: "es", name: "Spain" }]),
    useCostAccountChart: () => ok([
      a("root", "00001", "Root", null),
      a("cat1", "10000", "Development Expenses", "root"),
      a("a1", "10001", "Permits", "cat1"),
      a("s1", "10001_01", "Permit fees", "a1"),
    ]),
    useOpexSubaccounts: () => ok([]),
    useLandLeaseSubaccounts: () => ok([
      { id: "ll1", name: "Locations", order: 1, accountOrder: null },
      { id: "ll2", name: "Other", order: 2, accountOrder: null },
    ]),
    useOpexAssumptions: () => ok([opex({})]),
    useDevexCosts: () => ok([{
      id: "dc1", description: "Standard Permit fees - x", descriptionInput: "x", costAmount: 10000, unit: 952850000,
      costPaidBy: 952850001, comment: null, technology: 952850000, countryId: "de", categoryId: "cat1",
      subaccountId: "s1", clusters: [true, false, false, false, false],
    }]),
    useSpvDevCoMapping: () => ok([]),
    useInflationAreas: () => ok([]),
    useCostCurrencies: () => ok([{ id: "eur", code: "EUR", name: "Euro" }]),
    useCostWrites: () => ({ run, progress: null, error: null, success: null, clear: () => undefined }),
  };
});

const renderScreen = () => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter>
      <AdminCostScreen />
    </MemoryRouter>
  </FluentProvider>,
);

type Job = { progress: string; plan: { writes: { op: string; id?: string; data?: Record<string, unknown> }[] } };
const lastJob = (): Job => (run.mock.calls.at(-1) as unknown as [Job])[0];
const openCard = async (name: string) => {
  const card = screen.getByRole("region", { name });
  await userEvent.click(within(card).getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_2"));
  return card;
};

beforeEach(() => run.mockClear());

describe("Admin Cost Screen (connected)", () => {
  it("UT-ADCOST-901 renders the title, the Germany / Wind breadcrumb and no not-connected notice", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.getByTestId("Label1").textContent).toBe("Standard Assumptions / Costs / Germany / Wind");
    expect(screen.queryByRole("button", { name: "Spain" })).toBeNull();
  });

  it("UT-ADCOST-902 the four cards render in canvas order, folded; Apply is not rendered (D20)", () => {
    renderScreen();
    expect(screen.getAllByTestId("Label1_2").map((b) => b.textContent)).toEqual(COST_CATEGORIES.map((c) => c.category));
    expect(screen.getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_2")).toHaveLength(4);
    expect(screen.queryByText("Apply to All")).toBeNull();
    expect(screen.queryByTestId("btn_Admin_Cost_Landlease_ApplyToLandlease")).toBeNull();
  });

  it("UT-ADCOST-905 the DEVEX/CAPEX card: headers, a folded category, then its cost", async () => {
    renderScreen();
    const card = await openCard("DEVEX/CAPEX");
    for (const h of DEVEX_COLUMN_HEADERS.filter(Boolean)) expect(within(card).getAllByText(h).length).toBeGreaterThan(0);
    expect(within(card).queryByText("Permit fees - 10001_01")).toBeNull();
    await userEvent.click(within(card).getByTestId("Button2_2"));
    expect(within(card).getByText("Permit fees - 10001_01")).toBeTruthy();
    expect(within(card).getByText("10,000 EUR")).toBeTruthy();
  });

  it("UT-ADCOST-904 deleting a DEVEX cost sends one delete with the canvas progress text", async () => {
    renderScreen();
    const card = await openCard("DEVEX/CAPEX");
    await userEvent.click(within(card).getByTestId("Button2_2"));
    await userEvent.click(within(card).getByTestId("btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_delete"));
    expect(await screen.findByText('Are you sure you want to delete the "Standard Permit fees - x" cost?')).toBeTruthy();
    // `hidden: true`: in jsdom tabster's modalizer can leave the dialog surface `aria-hidden`.
    await userEvent.click(await screen.findByRole("button", { name: "Confirm", hidden: true }, { timeout: 10_000 }));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(lastJob().progress).toBe(MSG.deleting);
    expect(lastJob().plan.writes.map((w) => `${w.op} ${w.id}`)).toEqual(["delete dc1"]);
  });

  it("UT-ADCOST-906 the Land Lease card: Secured / Allocation / OTP headers, the period row, Add Period", async () => {
    renderScreen();
    const card = await openCard("Land Lease");
    expect(within(card).getByText("Secured")).toBeTruthy();
    expect(within(card).getByText("Allocation")).toBeTruthy();
    expect(within(card).getByText("OTP")).toBeTruthy();
    expect(within(card).getByText("Standard LL Locations")).toBeTruthy();
    expect(within(card).getByText("COD + 5 Years 0 Months")).toBeTruthy();
    expect(within(card).getByTestId("btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod")).toBeTruthy();
  });

  it("UT-ADCOST-907 Add Period opens the derived panel and saves a Period 2 plus the tail flag", async () => {
    renderScreen();
    const card = await openCard("Land Lease");
    await userEvent.click(within(card).getByTestId("btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod"));
    expect(await screen.findByText("Add Period : Locations")).toBeTruthy();
    const desc = screen.getByTestId("txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1") as HTMLInputElement;
    expect(desc.value).toBe("Standard LL Locations - 2");
    expect((screen.getByTestId("txt_LandLease_RightPanel_NewEditCost_BodyContent_StartDate") as HTMLInputElement).value)
      .toBe("COD + 5 Years 0 Months");
    await userEvent.type(screen.getByTestId("txt_LandLease_RightPanel_NewEditPeriod_BodyContent_FixedCosts_1"), "250");
    await userEvent.click(screen.getByTestId("drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1"));
    await userEvent.click(await screen.findByRole("option", { name: "2 years" }));
    await userEvent.click(screen.getByTestId("drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1"));
    await userEvent.click(await screen.findByRole("option", { name: "12 Months" }));
    const save = screen.getByTestId("pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    await userEvent.click(save);
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(lastJob().progress).toBe('Please wait, saving "Standard LL Locations - 2"...');
    expect(lastJob().plan.writes.map((w) => `${w.op} ${w.id ?? ""}`.trim())).toEqual(["create", "update h"]);
    expect(lastJob().plan.writes[0]!.data).toMatchObject({ vsb_period: 952850001, vsb_fixcosts: 250, vsb_durationinyears: 2 });
  }, 30_000);

  it("UT-ADCOST-908 the Add Contract Type menu disables a subaccount that already has a contract", async () => {
    renderScreen();
    const card = await openCard("Land Lease");
    await userEvent.click(within(card).getByTestId("cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar"));
    const used = await screen.findByTestId("cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar-ll1");
    const free = screen.getByTestId("cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar-ll2");
    expect(used.getAttribute("aria-disabled")).toBe("true");
    expect(free.getAttribute("aria-disabled")).not.toBe("true");
  });
});
