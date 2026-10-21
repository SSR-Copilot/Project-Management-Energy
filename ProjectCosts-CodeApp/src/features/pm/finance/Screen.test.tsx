// @vitest-environment jsdom
/**
 * Render tests for the connected Project Finance Screen (D34): `./hooks` is mocked with fixed rows,
 * so these check the canvas captions and ids, the gates and the write jobs handed to `run`. The
 * rules are covered by `rules.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import {
  FINANCE_SCREEN_TEXT, FIN_LABEL, INPUT_COL, MSG, SPINNER,
  type FinanceProject, type FinancingCategory, type FinancingInputRow,
} from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);

const baseProject: FinanceProject = {
  id: "p-1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryName: "Germany", countryCode: "c-de",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: null, construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"), applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bu-1", clusterStateOrder: 4,
  financingOptions: CHOICE_FINANCE.financingOptions.debtFinancing,
};

const categories: FinancingCategory[] = [
  { id: "c1", name: "Equity", order: 1 },
  { id: "c2", name: "VAT-Financing", order: 2 },
  { id: "c3", name: "Senior Debt", order: 3 },
  { id: "c4", name: "DSRA/DSRF", order: 4 },
  { id: "c5", name: "Decommissioning Costs", order: 5 },
  { id: "c6", name: "Cash Sweep", order: 6 },
];

const input = (id: string, order: number, raw: Record<string, unknown>, status: number = CHOICE_FINANCE.status.active): FinancingInputRow => ({
  id, name: id, categoryId: `c${order}`, categoryOrder: order, uniqueKeyString: null, status, raw,
  canEdit: true, canDelete: true,
});

const inputs: FinancingInputRow[] = [
  input("eq", 1, { [INPUT_COL.freeEquity]: CHOICE_FINANCE.freeEquity.percentage, [INPUT_COL.freeEquityValue]: 10,
    [INPUT_COL.isStandardValue]: '[{"locIsStandardFreeEquity":true,"locIsStandardShareholderLoan":true}]' }),
  input("vat", 2, { [INPUT_COL.baseRate]: CHOICE_FINANCE.baseRate.euribor3M, [INPUT_COL.bankMargin]: 1.5,
    [INPUT_COL.vatFacilityAmount]: CHOICE_FINANCE.vatFacilityAmount.calculated, [INPUT_COL.isDeactivatedByButton]: null }),
  input("t1", 3, { [INPUT_COL.trancheStatus]: CHOICE_FINANCE.trancheStatus.standardAssumption, [INPUT_COL.isFolded]: false,
    [INPUT_COL.hedging]: 80, [INPUT_COL.trackStatusActive]: true }),
  input("t2", 3, { [INPUT_COL.trancheStatus]: CHOICE_FINANCE.trancheStatus.termSheet, [INPUT_COL.bank]: "other-id-123",
    [INPUT_COL.otherBankName]: "Landesbank", [INPUT_COL.isFolded]: true, [INPUT_COL.trackStatusActive]: true }),
  input("dsra", 4, { [INPUT_COL.typeDsraDsrf]: CHOICE_FINANCE.dsraDsrfType.dsra, [INPUT_COL.margin]: 1.25,
    [INPUT_COL.dsraOriginalStatusActive]: CHOICE_FINANCE.dsraOriginalStatusActive.yes }),
  input("dec", 5, { [INPUT_COL.costsOfDecommissioning]: CHOICE_FINANCE.costsOfDecommissioning.total,
    [INPUT_COL.costsOfDecommissioningValue]: 800000, [INPUT_COL.costOfGuarantee]: 1.2,
    [INPUT_COL.dateOfIssue]: "2027-03-01", [INPUT_COL.startDateOfSaving]: "2028-01-01",
    [INPUT_COL.dateOfExpiry]: "2055-12-31", [INPUT_COL.durationOfSaving]: "0015" }),
];

const state = {
  project: baseProject as FinanceProject | null,
  inputs: inputs as FinancingInputRow[],
  error: undefined as unknown,
};
const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);
const duplicates = vi.fn(async (_key: string): Promise<string[]> => []);
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_financinginputs"],
  useFinanceProject: () => ({ data: state.project, isLoading: false, error: state.error, connected: true }),
  useFinancingCategories: () => ok(categories),
  useDebtAssumptions: () => ({ data: { debt: [], decommissioning: [], dsra: [] }, isLoading: false, error: undefined, connected: false }),
  useBanks: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useKfwTranches: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useFinancingInputs: () => ok(state.inputs),
  useRepaymentAmounts: () => ok([]),
  useStepUpMargins: () => ok([]),
  useTotalDevexCapex: () => ok(1000),
  useActiveTurbineCount: () => ok(5),
  useFinanceWrites: () => ({ run, progress: null, error: null, success: null, clear: () => {} }),
  fetchTrancheDuplicates: (key: string) => duplicates(key),
}));

import ProjectFinanceScreen from "./Screen";

const renderScreen = () => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><ProjectFinanceScreen /></MemoryRouter>
  </FluentProvider>,
);

const card = (categoryId: string) => screen.getByTestId(`con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card-${categoryId}`);
const unfold = (categoryId: string) =>
  fireEvent.click(within(card(categoryId)).getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_1")[0]!);
const planOf = async (job: PlanJob): Promise<WritePlan> => (typeof job.plan === "function" ? job.plan() : job.plan);
const lastJob = (): PlanJob => run.mock.calls.at(-1)![0];

beforeEach(() => {
  state.project = baseProject;
  state.inputs = inputs;
  state.error = undefined;
  run.mockClear();
  duplicates.mockClear();
});

describe("UT-FIN Screen (connected)", () => {
  it("UT-FIN-901 renders the five category cards folded, the Fabric notice and no not-connected notice", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.getByTestId("finance-assumptions-not-connected").textContent).toBe(FINANCE_SCREEN_TEXT.assumptionsNotConnected);
    for (const id of ["c1", "c2", "c3", "c4", "c5"]) expect(card(id)).toBeTruthy();
    expect(screen.queryByTestId("con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card-c6")).toBeNull();
    // B9 — every card starts folded: no body.
    expect(screen.queryByTestId("txt_EquityData_FreeEquityEUR_1")).toBeNull();
    const radio = screen.getByTestId("rad_ProjectFinance_FinancingOptions");
    expect(radio.getAttribute("aria-label")).toBe("rad_ProjectFinance_FinancingOptions");
    expect((within(radio).getByLabelText("Debt Financing") as HTMLInputElement).checked).toBe(true);
    expect((within(radio).getByLabelText("All Equity") as HTMLInputElement).disabled).toBe(false);
  });

  it("UT-FIN-902 an unfolded card shows the canvas fields, formats and command-bar names", () => {
    renderScreen();
    unfold("c1");
    expect(within(card("c1")).getByTestId("txt_EquityData_FreeEquityEUR_1").getAttribute("aria-label")).toBe("txt_EquityData_FreeEquityEUR_1");
    expect(within(card("c1")).getByRole("toolbar").getAttribute("aria-label")).toBe("pcf_ProjectRevenues_Content_ContractCommandBar_2");
    expect(within(card("c1")).getByRole("button", { name: "Edit Equity" })).toBeTruthy();
    unfold("c3");
    expect(within(card("c3")).getByRole("toolbar").getAttribute("aria-label")).toBe("pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar");
    // Toggling the category folds every tranche of it (Y:7161); a tranche's own Down icon unfolds it.
    expect(within(card("c3")).queryByTestId("txt_SeniorDebt_Data_Display_Card_Hedging")).toBeNull();
    fireEvent.click(within(card("c3")).getAllByTestId("ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Down")[0]!);
    expect(within(card("c3")).getAllByTestId("txt_SeniorDebt_Data_Display_Card_Hedging")).toHaveLength(1);
    expect((within(card("c3")).getAllByTestId("txt_SeniorDebt_Data_Display_Card_Hedging")[0] as HTMLInputElement).value).toBe("80.0");
    expect(within(card("c3")).getByText("Term Sheet - *Landesbank*")).toBeTruthy();
  });

  it("UT-FIN-903 a Draft project hides the gallery, disables the options and shows the Draft bullet", () => {
    state.project = { ...baseProject, clusterStateName: "Draft" };
    renderScreen();
    expect(screen.queryByTestId("con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card-c1")).toBeNull();
    expect(screen.getByTestId("con_Milestones_Page_LockMessage_8").textContent).toContain("• Change the project status from Draft");
    expect((within(screen.getByTestId("rad_ProjectFinance_FinancingOptions")).getByLabelText("All Equity") as HTMLInputElement).disabled).toBe(true);
  });

  it("UT-FIN-904 the financing option writes the project and the cascade, with the canvas spinner", async () => {
    renderScreen();
    fireEvent.click(within(screen.getByTestId("rad_ProjectFinance_FinancingOptions")).getByLabelText("All Equity"));
    await waitFor(() => expect(run).toHaveBeenCalled());
    const job = lastJob();
    expect(job.progress).toBe(SPINNER.saving);
    const plan = await planOf(job);
    expect(plan.writes.map((w) => w.id)).toEqual(["p-1", "vat", "t1", "t2", "dsra"]);
  });

  it("UT-FIN-905 on visit: no write when every input exists and the option is set; Equity and VAT seeds otherwise", async () => {
    renderScreen();
    await new Promise((r) => setTimeout(r, 0));
    expect(run).not.toHaveBeenCalled();
    run.mockClear();
    state.project = { ...baseProject, id: "p-1", financingOptions: null };
    state.inputs = [];
    renderScreen();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    const plans = await Promise.all(run.mock.calls.map(([job]) => planOf(job)));
    expect(plans[0]!.writes[0]!.data).toEqual({ vsb_financingoptions: CHOICE_FINANCE.financingOptions.debtFinancing });
    expect(plans.slice(1).map((p) => p.writes[0]!.data?.vsb_name)).toEqual(["Windpark Nord-Equity", "Windpark Nord-VAT-Financing"]);
  });

  it("UT-FIN-906 the Equity panel saves with the canvas spinner and the edited flags", async () => {
    renderScreen();
    unfold("c1");
    fireEvent.click(within(card("c1")).getByRole("button", { name: "Edit Equity" }));
    const field = await screen.findByTestId("txt_EquityData_FreeEquityEUR");
    expect(field.getAttribute("aria-label")).toBe("txt_EquityData_FreeEquityEUR");
    expect(screen.getByTestId("ico_EditEquity_RightPanel_BodyHeaderCancel")).toBeTruthy();
    fireEvent.change(field, { target: { value: "12.5" } });
    const save = screen.getByTestId("pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save") as HTMLButtonElement;
    expect(save.getAttribute("aria-label")).toBe("pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save");
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(lastJob().progress).toBe(SPINNER.equity);
    const data = (await planOf(lastJob())).writes[0]!.data!;
    expect(data).toMatchObject({ vsb_freeequityvalue: 12.5, vsb_shareholderloanvalue: 87.5 });
    expect(data.vsb_isstandardvalue).toBe('[{"locIsStandardFreeEquity":false,"locIsStandardShareholderLoan":false}]');
  });

  it("UT-FIN-907 the tranche Deactivate dialog writes the toggle with the canvas error text", async () => {
    renderScreen();
    unfold("c3");
    fireEvent.click(within(card("c3")).getAllByTestId("btn_FinancingInput_DisplayProject_Body_Form_SeniorDebt_CardHeader_RowTransparent")[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate Tranche" }));
    expect(await screen.findByText("Deactivate Trache")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: FIN_LABEL.confirm }));
    await waitFor(() => expect(run).toHaveBeenCalled());
    const job = lastJob();
    expect(job.errorText!("x")).toBe("x : Error Occured while Tranche Status change");
    expect((await planOf(job)).writes[0]).toMatchObject({
      id: "t2", data: { statecode: 1, statuscode: 2, vsb_trackstatusactive: false, vsb_isdeactivatedbybutton: true },
    });
  });

  it("UT-FIN-908 the Decommissioning panel shows the canvas date validation", async () => {
    renderScreen();
    unfold("c5");
    fireEvent.click(within(card("c5")).getByRole("button", { name: "Edit Decommissioning Costs" }));
    const issue = await screen.findByTestId("dte_DecommissioningData_Date_of_Issue_1");
    expect(screen.getByTestId("Icon5")).toBeTruthy();
    // `Format: ="dd.mm.yyyy"` — the box shows the canvas text; a typed date commits on leaving it.
    fireEvent.change(issue, { target: { value: "01.01.2025" } });
    fireEvent.blur(issue);
    expect((issue as HTMLInputElement).value).toBe("01.01.2025");
    expect(await screen.findByText(MSG.dateOfIssueBeforeCluster4)).toBeTruthy();
    expect((screen.getByTestId("pcf_btn_GeneralData_RightPanel_Decommissioning_Form_Buttons_Save_1") as HTMLButtonElement).disabled).toBe(true);
    // The SQL-standard resets stay disabled while Fabric SQL is unconnected; the project-date resets work.
    expect((screen.getByTestId("ico_DecommissioningData_Cost_of_Decommisioning_Reset_to_Standard") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("ico_DecommissioningData_Date_of_Issue_Reset_to_Standard_1"));
    await waitFor(() => expect(screen.queryByText(MSG.dateOfIssueBeforeCluster4)).toBeNull());
  });

  it("UT-FIN-909 the DSRA/DSRF toggle runs with the canvas spinner", async () => {
    renderScreen();
    unfold("c4");
    fireEvent.click(screen.getByTestId("con_DSRA_DSRF_Data_Deactivate"));
    expect(await screen.findByText("Deactivate DSRA/DSRF...")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: FIN_LABEL.confirm }));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(lastJob().progress).toBe("Please wait, deactivating DSRA/DSRF...");
  });

  it("UT-FIN-910 a failed read shows the load-error state (rule 19)", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(FINANCE_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
    expect(screen.queryByTestId("rad_ProjectFinance_FinancingOptions")).toBeNull();
  });

  it("UT-FIN-913 Add Tranche: View-mode radios do not change, and the Fixed Amount value shows only once an option is picked (audit 21 Oct 2026)", async () => {
    renderScreen();
    unfold("c3");
    fireEvent.click(screen.getByTestId("command-AddFinanceInput"));
    // Standard Assumption: Drawdown is `DisplayMode.View` — not greyed, not changeable.
    const pro = (await screen.findByTestId(`rad_SeniorDebt_Data_Drawdown-${CHOICE_FINANCE.drawdown.proRata}`)) as HTMLInputElement;
    const wasChecked = pro.checked;
    fireEvent.click(pro);
    expect(pro.checked).toBe(wasChecked);
    expect(pro.disabled).toBe(false);
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.termSheet}`));
    fireEvent.click(screen.getByTestId(`rad_SeniorDebtData_Gearing-${CHOICE_FINANCE.gearing.fixedAmount}`));
    expect(screen.getByTestId("rad_SeniorDebt_Fixed_Amount_Options")).toBeTruthy();
    expect(screen.queryByTestId("txt_SeniorDebtData_FixedAmountValue")).toBeNull();
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Fixed_Amount_Options-${CHOICE_FINANCE.fixedAmount.fixedValue}`));
    expect(screen.getByTestId("txt_SeniorDebtData_FixedAmountValue")).toBeTruthy();
  });
});
