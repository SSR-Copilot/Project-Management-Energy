// @vitest-environment jsdom
/**
 * Render tests for the connected Project Finance Screen (D34): `./hooks` is mocked with fixed rows,
 * so these check the canvas captions and ids, the gates and the write jobs handed to `run`. The
 * rules are covered by `rules.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useStandardListboxStyles, useStandardValueStyles } from "@/components/standardValue";
import { useCanvasListStyles } from "@/components/ChoiceField";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import { setFinancePerfFlags } from "@/data/financeFlags";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import {
  DEFAULT_DECOMMISSIONING_FLAGS, DEFAULT_DSRA_FLAGS, DEFAULT_VAT_FLAGS, FINANCE_SCREEN_TEXT, FIN_LABEL, INPUT_COL, MSG, SPINNER,
  financialCloseBoxText,
  type FinanceProject, type FinancingCategory, type FinancingInputRow,
} from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);

const baseProject: FinanceProject = {
  id: "p-1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryName: "Germany", countryCode: "c-de",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: null, construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"), applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1", clusterStateOrder: 4,
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

/** The `useDebtAssumptions` result: not connected by default (the cases written before Fabric). */
const NO_DEBT = { data: { debt: [], decommissioning: [], dsra: [] }, isLoading: false, error: undefined as unknown, connected: false };
const state = {
  /** `undefined` = New Project mode (no project saved yet). */
  projectId: "p-1" as string | undefined,
  project: baseProject as FinanceProject | null,
  inputs: inputs as FinancingInputRow[],
  /** `useFinancingInputs().fresh`: false while only an earlier visit's cached rows are in. */
  inputsFresh: true,
  error: undefined as unknown,
  debt: NO_DEBT,
  repayments: [] as { id: string; financingInputId: string; year: number; amount: number }[],
};
const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);
const duplicates = vi.fn(async (_key: string): Promise<string[]> => []);
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: state.projectId, locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_financinginputs"],
  useFinanceProject: () => ({ data: state.project, isLoading: false, error: state.error, connected: true }),
  useFinancingCategories: () => ok(categories),
  useDebtAssumptions: () => state.debt,
  useBanks: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useKfwTranches: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useFinancingInputs: () => ({ ...ok(state.inputs), fresh: state.inputsFresh }),
  useRepaymentAmounts: () => ok(state.repayments),
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
  // D137: every switch is at its default. The three seed tests below that pin the one-job-per-seed
  // structure run on the legacy path (`concurrentWrites` off), which still exists; their twins for the grouped path
  // are UT-FINPERF-201..203.
  setFinancePerfFlags(null);
  state.projectId = "p-1";
  state.project = baseProject;
  state.inputs = inputs;
  state.inputsFresh = true;
  state.error = undefined;
  state.debt = NO_DEBT;
  state.repayments = [];
  run.mockClear();
  duplicates.mockClear();
});

describe("UT-FIN Screen (connected)", () => {
  it("UT-FIN-901 renders the five category cards folded and no not-connected or Fabric notice", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.queryByTestId("finance-assumptions-not-connected")).toBeNull();
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

  it("UT-FIN-922 New Project mode: locked, and Financing Options shows Debt Financing (Coalesce, D112) with no write", async () => {
    state.projectId = undefined;
    state.project = null;
    state.inputs = [];
    renderScreen();
    expect(screen.getByTestId("con_Milestones_Page_LockMessage_8").textContent).toContain("• Change the project status from Draft");
    const radio = screen.getByTestId("rad_ProjectFinance_FinancingOptions");
    const debt = within(radio).getByLabelText("Debt Financing") as HTMLInputElement;
    expect(debt.checked).toBe(true);
    expect(debt.disabled).toBe(true);
    expect((within(radio).getByLabelText("All Equity") as HTMLInputElement).checked).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(run).not.toHaveBeenCalled();
  });

  it("UT-FIN-923 a saved project shows no choice until its row is read, never the default first", () => {
    state.project = null;
    renderScreen();
    const radio = screen.getByTestId("rad_ProjectFinance_FinancingOptions");
    expect(within(radio).getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
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
    setFinancePerfFlags({ concurrentWrites: false });
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

  it("UT-FIN-916 a return visit does not seed from the cached rows; it waits for its own read", async () => {
    // The cache predates the seeds made on the last visit: every input looks missing.
    state.project = { ...baseProject, id: "p-1" };
    state.inputs = [];
    state.inputsFresh = false;
    const view = renderScreen();
    await new Promise((r) => setTimeout(r, 0));
    expect(run).not.toHaveBeenCalled();
    // This visit's read lands with the rows already there: nothing to create.
    state.inputs = inputs;
    state.inputsFresh = true;
    view.rerender(
      <FluentProvider theme={vsbTheme}><MemoryRouter><ProjectFinanceScreen /></MemoryRouter></FluentProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(run).not.toHaveBeenCalled();
  });

  it("UT-FIN-914 Fabric connected: the visit waits for the debt rows, then seeds every missing input", async () => {
    setFinancePerfFlags({ concurrentWrites: false });
    state.project = { ...baseProject, id: "p-1", financingOptions: null };
    state.inputs = [];
    state.debt = { ...NO_DEBT, isLoading: true, connected: true };
    const view = renderScreen();
    await new Promise((r) => setTimeout(r, 0));
    // Still loading: nothing is written (no Fabric seed from an empty row set).
    expect(run).not.toHaveBeenCalled();
    state.debt = { ...NO_DEBT, isLoading: false, connected: true };
    view.rerender(
      <FluentProvider theme={vsbTheme}><MemoryRouter><ProjectFinanceScreen /></MemoryRouter></FluentProvider>,
    );
    await waitFor(() => expect(run.mock.calls.length).toBeGreaterThan(3));
    const names = (await Promise.all(run.mock.calls.map(([job]) => planOf(job))))
      .slice(1).map((p) => p.writes[0]!.data?.vsb_name);
    expect(names).toEqual(expect.arrayContaining(["Windpark Nord-Equity", "Windpark Nord-VAT-Financing"]));
    expect(names.length).toBeGreaterThan(2);
  });

  it("UT-FIN-915 a failed Fabric debt read keeps the Fabric-built seeds withheld (Equity and VAT only)", async () => {
    setFinancePerfFlags({ concurrentWrites: false });
    state.project = { ...baseProject, id: "p-1", financingOptions: null };
    state.inputs = [];
    state.debt = { ...NO_DEBT, connected: true, error: new Error("Fabric unreachable") };
    renderScreen();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    const plans = await Promise.all(run.mock.calls.map(([job]) => planOf(job)));
    expect(plans.slice(1).map((p) => p.writes[0]!.data?.vsb_name)).toEqual(["Windpark Nord-Equity", "Windpark Nord-VAT-Financing"]);
  });

  /* D137: the same visits on the default path, where the option patch and every seed are ONE job. */

  it("UT-FINPERF-201 on visit: the option patch and the Equity and VAT seeds are ONE concurrent job with one targeted reload", async () => {
    state.project = { ...baseProject, id: "p-1", financingOptions: null };
    state.inputs = [];
    renderScreen();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const job = lastJob();
    const plan = await planOf(job);
    expect(plan.writes.map((w) => w.data?.vsb_financingoptions ?? w.data?.vsb_name)).toEqual([
      CHOICE_FINANCE.financingOptions.debtFinancing, "Windpark Nord-Equity", "Windpark Nord-VAT-Financing",
    ]);
    expect(plan.writes.every((w) => w.concurrent === true && !w.stopOnFailure)).toBe(true);
    expect(new Set(plan.writes.map((w) => w.concurrencyGroup)).size).toBe(1);
    // The option patch changes the project row, so the project and the inputs reload; nothing else.
    expect(job.invalidate).toEqual([["pmFinance", "p-1", "project"], ["pmFinance", "p-1", "inputs"]]);
  });

  it("UT-FINPERF-202 Fabric connected: the visit seeds every missing input in ONE job (the option patch + 5 seeds)", async () => {
    state.project = { ...baseProject, id: "p-1", financingOptions: null };
    state.inputs = [];
    state.debt = { ...NO_DEBT, isLoading: true, connected: true };
    const view = renderScreen();
    await new Promise((r) => setTimeout(r, 0));
    expect(run).not.toHaveBeenCalled();
    state.debt = { ...NO_DEBT, isLoading: false, connected: true };
    view.rerender(
      <FluentProvider theme={vsbTheme}><MemoryRouter><ProjectFinanceScreen /></MemoryRouter></FluentProvider>,
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const plan = await planOf(lastJob());
    expect(plan.writes).toHaveLength(6);
    expect(plan.writes.slice(1).map((w) => w.reason)).toEqual(expect.arrayContaining([
      "create the Equity financing input", "create the VAT-Financing financing input", "create the Senior Debt financing input",
    ]));
  });

  it("UT-FINPERF-203 a failed Fabric debt read: ONE job with the option patch and the two seeds that do not need it; no option patch when it is set", async () => {
    state.project = { ...baseProject, id: "p-1", financingOptions: null };
    state.inputs = [];
    state.debt = { ...NO_DEBT, connected: true, error: new Error("Fabric unreachable") };
    const view = renderScreen();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect((await planOf(lastJob())).writes.slice(1).map((w) => w.data?.vsb_name)).toEqual(["Windpark Nord-Equity", "Windpark Nord-VAT-Financing"]);
    view.unmount();
    run.mockClear();
    // The option is already set: no project write, the inputs alone reload.
    state.project = { ...baseProject, id: "p-1" };
    renderScreen();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(lastJob().invalidate).toEqual([["pmFinance", "p-1", "inputs"]]);
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

  it("UT-FIN-906a a Fixed Value above the Total CAPEX shows the canvas message under the box and keeps Save off", async () => {
    renderScreen();
    unfold("c1");
    fireEvent.click(within(card("c1")).getByRole("button", { name: "Edit Equity" }));
    await screen.findByTestId("txt_EquityData_FreeEquityEUR");
    fireEvent.click(within(screen.getByTestId("rad_EquityData_FreeEquity")).getByRole("radio", { name: "Fixed Value" }));
    const field = screen.getByTestId("txt_EquityData_FreeEquityEUR");
    // `useTotalDevexCapex` is mocked at 1000.
    fireEvent.change(field, { target: { value: "2000" } });
    expect(await screen.findByText(MSG.freeEquityAboveCapex)).toBeTruthy();
    expect((screen.getByTestId("pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: "1000" } });
    await waitFor(() => expect(screen.queryByText(MSG.freeEquityAboveCapex)).toBeNull());
  });

  it("UT-FIN-906b a standard `cmb_` combo is blue italic in its box AND its open list (DSRA, Decommissioning, VAT)", async () => {
    // The shared classes (Griffel atomic names, `f…`): the box's on the Dropdown root, the list's on the listbox.
    const atomic = (cls: string) => cls.split(" ").filter((c) => /^f/.test(c));
    const box = atomic(renderHook(() => useStandardValueStyles()).result.current.standard);
    const list = atomic(renderHook(() => useStandardListboxStyles()).result.current.standard);
    const has = (el: Element, classes: string[]) => classes.every((c) => el.classList.contains(c));
    // `data-testid` lands on the Dropdown's button; the className on its root, the button's parent.
    const boxIsStandard = (testId: string) => has(screen.getByTestId(testId).parentElement!, box);
    const listIsStandard = async (testId: string) => {
      fireEvent.click(screen.getByTestId(testId));
      const open = await screen.findByRole("listbox");
      const result = has(open, list);
      fireEvent.keyDown(screen.getByTestId(testId), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
      return result;
    };
    const allTrue = (flags: object) => JSON.stringify([Object.fromEntries(Object.keys(flags).map((k) => [k, true]))]);
    state.inputs = inputs.map((r) => r.id === "dsra"
      ? { ...r, raw: { ...r.raw, [INPUT_COL.dsraStandardAssumptionsJson]: allTrue(DEFAULT_DSRA_FLAGS), [INPUT_COL.durationOfFutureDebtServiceMmyy]: "0001" } }
      : r.id === "dec" ? { ...r, raw: { ...r.raw, [INPUT_COL.decommissioningStandardAssumptionJson]: allTrue(DEFAULT_DECOMMISSIONING_FLAGS) } }
        : r.id === "vat" ? { ...r, raw: { ...r.raw, [INPUT_COL.isStandardValue]: allTrue(DEFAULT_VAT_FLAGS) } } : r);
    const { unmount } = renderScreen();

    // DSRA: Duration of Future Debt Service (`FontColor` / `FontItalic`, Y:16534-16588); Base Rate has none.
    unfold("c4");
    fireEvent.click(screen.getByTestId("con_DSRA_DSRF_Data_Edit"));
    const durYY = "cmb_DSRA_DRSFData_Duration_of_furture_debt_service_YY";
    await screen.findByTestId(durYY);
    expect([boxIsStandard(durYY), boxIsStandard("cmb_DSRA_DRSFData_Duration_of_furture_debt_service_MM")]).toEqual([true, true]);
    expect(await listIsStandard(durYY)).toBe(true);
    expect(boxIsStandard("drp_DSRA_DRSFData_Base_Rate")).toBe(false);
    expect(await listIsStandard("drp_DSRA_DRSFData_Base_Rate")).toBe(false);
    // A pick clears the flag (`OnChange: …locIsStandardDurationoffuturedebtservice: false`): box and list go plain.
    fireEvent.click(screen.getByTestId(durYY));
    fireEvent.click(await screen.findByRole("option", { name: "2 years" }));
    await waitFor(() => expect(boxIsStandard(durYY)).toBe(false));
    expect(await listIsStandard(durYY)).toBe(false);
    unmount();

    // Decommissioning: Duration of Saving (Y:14913-14949).
    renderScreen();
    unfold("c5");
    fireEvent.click(within(card("c5")).getByRole("button", { name: "Edit Decommissioning Costs" }));
    const savYY = "cmb_DecommissioningData_Duration_of_Saving_YY_1";
    await screen.findByTestId(savYY);
    expect([boxIsStandard(savYY), boxIsStandard("cmb_DecommissioningData_Duration_of_Saving_MM_1")]).toEqual([true, true]);
    expect(await listIsStandard("cmb_DecommissioningData_Duration_of_Saving_MM_1")).toBe(true);
  });

  it("UT-FIN-906c VAT-Financing: a standard Base Rate is blue italic in its box and its open list (Y:8250-8251)", async () => {
    const atomic = (cls: string) => cls.split(" ").filter((c) => /^f/.test(c));
    const box = atomic(renderHook(() => useStandardValueStyles()).result.current.standard);
    const list = atomic(renderHook(() => useStandardListboxStyles()).result.current.standard);
    state.inputs = inputs.map((r) => r.id === "vat"
      ? { ...r, raw: { ...r.raw, [INPUT_COL.isStandardValue]: '[{"locIsStandardBaseRate":true,"locIsStandardBankMargin":true}]' } } : r);
    renderScreen();
    unfold("c2");
    // Order 2's command reads "Edit Tranche" (`Switch(Order, 1, "Equity", 2, "Tranche", Name)`), as its panel title.
    fireEvent.click(within(card("c2")).getByRole("button", { name: "Edit Tranche" }));
    const baseRate = await screen.findByTestId("cmb_VATFinancingData_BaseRate");
    expect(box.every((c) => baseRate.parentElement!.classList.contains(c))).toBe(true);
    fireEvent.click(baseRate);
    const open = await screen.findByRole("listbox");
    expect(list.every((c) => open.classList.contains(c))).toBe(true);
  });

  it("UT-FIN-924 a `drp_` dropdown (DropDown@0.0.45) opens the canvas list, as ChoiceField; a `cmb_` combo keeps Fluent's", async () => {
    // The shared class (Griffel atomic names, `f…`) the other PM screens' dropdowns put on their listbox.
    const atomic = (cls: string) => cls.split(" ").filter((c) => /^f/.test(c));
    const canvas = atomic(renderHook(() => useCanvasListStyles()).result.current.canvasList);
    expect(canvas.length).toBeGreaterThan(0);
    const opensCanvasList = async (testId: string) => {
      fireEvent.click(screen.getByTestId(testId));
      const open = await screen.findByRole("listbox");
      const result = canvas.every((c) => open.classList.contains(c));
      fireEvent.keyDown(screen.getByTestId(testId), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
      return result;
    };
    const { unmount } = renderScreen();
    unfold("c3");
    fireEvent.click(screen.getByTestId("command-AddFinanceInput"));
    fireEvent.click(await screen.findByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.termSheet}`));
    for (const id of [
      "Drp_SeniorDebtData_Tenor_YY", "drp_SeniorDebtData_Tenor_MM",
      "Drp_SeniorDebtData_StartRepayment_YY", "Drp_SeniorDebtData_StartRepayment_MM",
      "Drp_SeniorDebtData_Commitment_Fee_Free_Period_YY", "Drp_SeniorDebtData_Commitment_Fee_Free_Period_MM",
      "drp_SeniorDebt_Data_Frequency_Of_Repayment",
    ]) {
      expect([id, await opensCanvasList(id)]).toEqual([id, true]);
    }
    unmount();

    renderScreen();
    unfold("c4");
    fireEvent.click(screen.getByTestId("con_DSRA_DSRF_Data_Edit"));
    await screen.findByTestId("drp_DSRA_DRSFData_Base_Rate");
    expect(await opensCanvasList("drp_DSRA_DRSFData_Base_Rate")).toBe(true);
    expect(await opensCanvasList("cmb_DSRA_DRSFData_Duration_of_furture_debt_service_YY")).toBe(false);
  });

  it("UT-FIN-920 the narrow panels carry the canvas layout hooks: rows, 245-px boxes, Reload icons beside the box (D110)", async () => {
    renderScreen();
    unfold("c1");
    fireEvent.click(within(card("c1")).getByRole("button", { name: "Edit Equity" }));
    await screen.findByTestId("txt_EquityData_FreeEquityEUR");
    const panel = document.querySelector(".canvas-panel")!;
    expect([...panel.classList]).toEqual(expect.arrayContaining(["finance-form", "finance-form-equity", "finance-canvas-panel"]));
    const reset = screen.getByTestId("but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2");
    expect(reset.classList.contains("finance-reset")).toBe(true);
    expect(reset.parentElement!.classList.contains("finance-row")).toBe(true);
  });

  it("UT-FIN-921 an Edit panel opens with Save off, and a change turns it on (D111)", async () => {
    renderScreen();
    unfold("c1");
    fireEvent.click(within(card("c1")).getByRole("button", { name: "Edit Equity" }));
    const field = await screen.findByTestId("txt_EquityData_FreeEquityEUR") as HTMLInputElement;
    const save = screen.getByTestId("pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "12" } });
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.change(field, { target: { value: "10" } });
    // Typing the stored 10 back clears its standard flag, which the Save would write: still a change.
    await waitFor(() => expect(save.disabled).toBe(false));
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

  it("UT-FIN-927 Financial Close shows no weekday on the tranche card or in Edit Tranche (bug 15290, D147)", async () => {
    const WEEKDAY = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/;
    // 1 September 2033 is a Thursday: the canvas card reads "Thursday, 1 September 2033" in en-GB.
    state.inputs = inputs.map((i) => (i.id === "t1" || i.id === "t2")
      ? input(i.id, 3, { ...i.raw, [INPUT_COL.financialClose]: "2033-09-01" })
      : i);
    renderScreen();
    unfold("c3");
    // Unfolding the category folds every tranche (`toggleCategoryFold`); open t1 again.
    fireEvent.click(within(card("c3")).getAllByTestId("ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Down")[0]!);
    // t1's card shows the long date without the weekday (the session language is en-GB).
    const cardText = (screen.getByTestId("txt_SeniorDebt_Data_Display_Card_FinancialClose") as HTMLInputElement).value;
    expect(cardText).toBe("1 September 2033");
    // Edit t2 (Term Sheet): the date box shows the short date without the weekday.
    fireEvent.click(within(card("c3")).getAllByTestId("btn_FinancingInput_DisplayProject_Body_Form_SeniorDebt_CardHeader_RowTransparent")[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tranche" }));
    const box = (await screen.findByTestId("dte_SeniorDebt_Data_Financial_Close")) as HTMLInputElement;
    expect(box.value).toBe(financialCloseBoxText(d("2033-09-01"), "en-GB"));
    expect(box.value).toContain("2033");
    expect(box.value).not.toMatch(WEEKDAY);
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
    // Standard Assumption: Drawdown, Energy Yield, Spot Curve, Gearing and Repayment Profile are `DisplayMode.View`
    // — not changeable, and drawn GREY like the Disabled radios, as the live canvas draws them (17 Nov 2026).
    const pro = (await screen.findByTestId(`rad_SeniorDebt_Data_Drawdown-${CHOICE_FINANCE.drawdown.proRata}`)) as HTMLInputElement;
    const wasChecked = pro.checked;
    fireEvent.click(pro);
    expect(pro.checked).toBe(wasChecked);
    for (const group of ["rad_SeniorDebt_Data_Drawdown", "rad_SeniorDebt_Data_EnergyYield", "rad_SeniorDebt_Data_SpotCurve",
      "rad_SeniorDebtData_Gearing", "rad_SeniorDebt_Data_RepaymentProfile"]) {
      const fieldset = screen.getByTestId(group) as HTMLFieldSetElement;
      expect(fieldset.getAttribute("aria-readonly")).toBe("true");
      expect([...fieldset.querySelectorAll("input")].every((i) => i.disabled)).toBe(true);
    }
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.termSheet}`));
    // Term Sheet: the same groups are `DisplayMode.Edit` again — black and changeable.
    expect(pro.disabled).toBe(false);
    expect(screen.getByTestId("rad_SeniorDebt_Data_Drawdown").getAttribute("aria-readonly")).toBeNull();
    fireEvent.click(screen.getByTestId(`rad_SeniorDebtData_Gearing-${CHOICE_FINANCE.gearing.fixedAmount}`));
    expect(screen.getByTestId("rad_SeniorDebt_Fixed_Amount_Options")).toBeTruthy();
    expect(screen.queryByTestId("txt_SeniorDebtData_FixedAmountValue")).toBeNull();
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Fixed_Amount_Options-${CHOICE_FINANCE.fixedAmount.fixedValue}`));
    expect(screen.getByTestId("txt_SeniorDebtData_FixedAmountValue")).toBeTruthy();
  });

  it("UT-FIN-913a Add / Remove Step-Up Period show with the toggle off, on every status, disabled; Add sits above Remove (Y:13132-13291)", async () => {
    renderScreen();
    unfold("c3");
    fireEvent.click(screen.getByTestId("command-AddFinanceInput"));
    const add = () => screen.getByTestId("btn_SeniorDebt_BankMargin_Add_StepUp_Period_1") as HTMLButtonElement;
    const remove = () => screen.getByTestId("btn_SeniorDebt_BankMargin_Remove_StepUp_LastPeriod") as HTMLButtonElement;
    await screen.findByTestId("btn_SeniorDebt_BankMargin_Add_StepUp_Period_1");
    for (const status of [CHOICE_FINANCE.trancheStatus.standardAssumption, CHOICE_FINANCE.trancheStatus.termSheet]) {
      if (status !== CHOICE_FINANCE.trancheStatus.standardAssumption) {
        fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Data_TrancheStatus-${status}`));
      }
      expect((screen.getByTestId("tgl_SeniorDebtData_Step_Up_Bank_Margin") as HTMLInputElement).checked).toBe(false);
      expect([add().disabled, remove().disabled]).toEqual([true, true]);
      expect(add().compareDocumentPosition(remove()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The duration warning needs the toggle on (`… && tgl_SeniorDebtData_Step_Up_Bank_Margin.Checked`).
      expect(screen.queryByText(MSG.stepUpDuration)).toBeNull();
    }
  });

  it("UT-FIN-913b a step-up row is the canvas row: `*` on the year caption, Margin not required, its message under the row (Y:12986-13131)", async () => {
    renderScreen();
    unfold("c3");
    fireEvent.click(screen.getByTestId("command-AddFinanceInput"));
    fireEvent.click(await screen.findByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.termSheet}`));
    await pick("drp_SeniorDebtData_Fixed_Interest_Rate_YY", "4 years");
    await pick("drp_SeniorDebtData_Fixed_Interest_Rate_MM", "0 month");
    fireEvent.click(screen.getByTestId("tgl_SeniorDebtData_Step_Up_Bank_Margin"));
    const row = await screen.findByTestId("con_SeniorDebtData_StepUp_Bank_Margin");
    expect(within(row).getByText("Year 1 to")).toBeTruthy();
    expect(within(row).getByText("*")).toBeTruthy();
    const margin = within(row).getByTestId("txt_SeniorDebtData_StepUp_Bank_Margin_Percentage");
    const marginField = margin.closest(".fui-Field")!;
    expect(marginField.querySelector(".fui-Label__required")).toBeNull();
    // A new row is not valid yet: the one-line message sits in the row, not under the Margin box.
    expect(within(row).getByText(MSG.stepUpMargin)).toBeTruthy();
    expect(marginField.textContent).not.toContain(MSG.stepUpMargin);
    // The row covers 1 year of the 4-year FIR: the orange duration warning shows under the buttons.
    expect(screen.getByText(MSG.stepUpDuration)).toBeTruthy();
    fireEvent.change(margin, { target: { value: "1.25" } });
    await waitFor(() => expect(within(row).queryByText(MSG.stepUpMargin)).toBeNull());
  });
});

/** Picks one option of a Fluent dropdown by its canvas control name and visible option text. */
const pick = async (testId: string, optionName: string) => {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
};
const repaymentInputs = () => screen.queryAllByTestId("txt_SeniorDebtData_RepaymentAmount") as HTMLInputElement[];

describe("UT-FIN Individual repayment schedule (Repayment Durations)", () => {
  const openAddTermSheetIndividual = async () => {
    renderScreen();
    unfold("c3");
    fireEvent.click(screen.getByTestId("command-AddFinanceInput"));
    fireEvent.click(await screen.findByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.termSheet}`));
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Data_RepaymentProfile-${CHOICE_FINANCE.repaymentProfile.individual}`));
  };

  it("UT-FIN-916 Add, Term Sheet, Individual: choosing only the YEARS of Tenor and Start Repayment shows the yearly amount rows (the months default to 0 as in the canvas)", async () => {
    await openAddTermSheetIndividual();
    expect(repaymentInputs()).toHaveLength(0);
    await pick("Drp_SeniorDebtData_Tenor_YY", "10 years");
    await pick("Drp_SeniorDebtData_StartRepayment_YY", "1 year");
    // COD 2028-01-01: start 2029, end 2038 -> ten rows, the canvas "<Year> - Repayment Amount [EUR]".
    expect(repaymentInputs()).toHaveLength(10);
    expect(screen.getByText("2029 - Repayment Amount [EUR]")).toBeTruthy();
    expect(screen.getByText("2038 - Repayment Amount [EUR]")).toBeTruthy();
    // The month dropdowns show the canvas default 0 (`If(Not(IsBlank(<YY>.Selected.Value)), 0)`).
    expect((screen.getByTestId("drp_SeniorDebtData_Tenor_MM") as HTMLInputElement).value).toBe("0 month");
  });

  it("UT-FIN-919 Add, Term Sheet: choosing only the YEARS of Commitment Fee Free Period and Fixed Interest Rate shows month 0 (canvas `If(Not(IsBlank(<YY>.Selected.Value)), 0)`, Y:12245, Y:12863)", async () => {
    await openAddTermSheetIndividual();
    expect((screen.getByTestId("Drp_SeniorDebtData_Commitment_Fee_Free_Period_MM") as HTMLInputElement).value).not.toBe("0 month");
    await pick("Drp_SeniorDebtData_Commitment_Fee_Free_Period_YY", "1 year");
    expect((screen.getByTestId("Drp_SeniorDebtData_Commitment_Fee_Free_Period_MM") as HTMLInputElement).value).toBe("0 month");
    await pick("drp_SeniorDebtData_Fixed_Interest_Rate_YY", "5 years");
    expect((screen.getByTestId("drp_SeniorDebtData_Fixed_Interest_Rate_MM") as HTMLInputElement).value).toBe("0 month");
  });

  it("UT-FIN-917 Add: changing Term Sheet to Credit Agreement keeps the typed Individual schedule (canvas third OnChange branch does not Clear it)", async () => {
    await openAddTermSheetIndividual();
    await pick("Drp_SeniorDebtData_Tenor_YY", "10 years");
    await pick("drp_SeniorDebtData_Tenor_MM", "0 month");
    await pick("Drp_SeniorDebtData_StartRepayment_YY", "1 year");
    await pick("Drp_SeniorDebtData_StartRepayment_MM", "0 month");
    expect(repaymentInputs()).toHaveLength(10);
    fireEvent.change(repaymentInputs()[0]!, { target: { value: "1000" } });
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.creditAgreement}`));
    expect(repaymentInputs()).toHaveLength(10);
    expect(repaymentInputs()[0]!.value).toBe("1000");
  });

  it("UT-FIN-918 Edit a stored Term Sheet / Individual tranche: its stored amounts show, and Term Sheet to Credit Agreement keeps them", async () => {
    state.inputs = inputs.map((i) => i.id !== "t2" ? i : input("t2", 3, {
      ...i.raw, [INPUT_COL.repaymentProfile]: CHOICE_FINANCE.repaymentProfile.individual,
      [INPUT_COL.tenorDurationYear]: 3, [INPUT_COL.tenorDurationMonth]: 0,
      [INPUT_COL.startRepaymentYear]: 1, [INPUT_COL.startRepaymentMonth]: 0,
    }));
    state.repayments = [
      { id: "r1", financingInputId: "t2", year: 2029, amount: 100 },
      { id: "r2", financingInputId: "t2", year: 2030, amount: 200 },
      { id: "r3", financingInputId: "t2", year: 2031, amount: 300 },
    ];
    renderScreen();
    unfold("c3");
    fireEvent.click(within(card("c3")).getAllByTestId("btn_FinancingInput_DisplayProject_Body_Form_SeniorDebt_CardHeader_RowTransparent")[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tranche" }));
    await waitFor(() => expect(repaymentInputs()).toHaveLength(3));
    expect(repaymentInputs().map((x) => x.value)).toEqual(["100", "200", "300"]);
    fireEvent.click(screen.getByTestId(`rad_SeniorDebt_Data_TrancheStatus-${CHOICE_FINANCE.trancheStatus.creditAgreement}`));
    expect(repaymentInputs().map((x) => x.value)).toEqual(["100", "200", "300"]);
  });
});
