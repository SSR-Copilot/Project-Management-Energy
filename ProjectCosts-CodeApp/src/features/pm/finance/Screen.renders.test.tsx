// @vitest-environment jsdom
/**
 * Finance screen: what a panel keystroke re-renders (D162 B4, FE-P2-01 / FE-P2-02 / FE-P2-09). `./hooks` is mocked with
 * fixed rows, as in `Screen.test.tsx`; the counts come from the `probeRender` seam (`src/test/renderCounts.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import { setFinancePerfFlags } from "@/data/financeFlags";
import type { PlanJob } from "@/data/usePlanWrite";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import { INPUT_COL, type FinanceProject, type FinancingCategory, type FinancingInputRow } from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);

const project: FinanceProject = {
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
];
const input = (id: string, order: number, raw: Record<string, unknown>): FinancingInputRow => ({
  id, name: id, categoryId: `c${order}`, categoryOrder: order, uniqueKeyString: null,
  status: CHOICE_FINANCE.status.active, raw, canEdit: true, canDelete: true,
});
const YEARS = 12;
const inputs: FinancingInputRow[] = [
  input("eq", 1, { [INPUT_COL.freeEquity]: CHOICE_FINANCE.freeEquity.percentage, [INPUT_COL.freeEquityValue]: 10 }),
  input("vat", 2, { [INPUT_COL.baseRate]: CHOICE_FINANCE.baseRate.euribor3M, [INPUT_COL.bankMargin]: 1.5 }),
  input("t1", 3, {
    [INPUT_COL.trancheStatus]: CHOICE_FINANCE.trancheStatus.termSheet, [INPUT_COL.isFolded]: false, [INPUT_COL.hedging]: 80,
    [INPUT_COL.trackStatusActive]: true, [INPUT_COL.repaymentProfile]: CHOICE_FINANCE.repaymentProfile.individual,
    [INPUT_COL.tenorDurationYear]: YEARS, [INPUT_COL.tenorDurationMonth]: 0,
    [INPUT_COL.startRepaymentYear]: 1, [INPUT_COL.startRepaymentMonth]: 0,
  }),
  input("dsra", 4, { [INPUT_COL.typeDsraDsrf]: CHOICE_FINANCE.dsraDsrfType.dsra, [INPUT_COL.margin]: 1.25 }),
  input("dec", 5, { [INPUT_COL.costsOfDecommissioning]: CHOICE_FINANCE.costsOfDecommissioning.total, [INPUT_COL.costsOfDecommissioningValue]: 800000 }),
];
const repayments = Array.from({ length: YEARS }, (_, i) => ({ id: `r${i}`, financingInputId: "t1", year: 2029 + i, amount: 100 + i }));

const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
const NO_BANKS: never[] = [];
const NO_DEBT = { data: { debt: [], decommissioning: [], dsra: [] }, isLoading: false, error: undefined, connected: false };

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_financinginputs"],
  useFinanceProject: () => ok(project),
  useFinancingCategories: () => ok(categories),
  useDebtAssumptions: () => NO_DEBT,
  // The same empty list on every render, as `useBanks` returns it with no rows (UT-FIN-FE-005).
  useBanks: () => ({ data: NO_BANKS, isLoading: false, error: undefined, connected: false }),
  useKfwTranches: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useFinancingInputs: () => ({ ...ok(inputs), fresh: true }),
  useRepaymentAmounts: () => ok(repayments),
  useStepUpMargins: () => ok([]),
  useTotalDevexCapex: () => ok(1000),
  useActiveTurbineCount: () => ok(5),
  // A new object per render, as `usePlanWrite` returns (FE-P2-09).
  useFinanceWrites: () => ({ run, progress: null, error: null, success: null, clear: () => {} }),
  fetchTrancheDuplicates: async () => [],
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
const repaymentInputs = () => screen.queryAllByTestId("txt_SeniorDebtData_RepaymentAmount") as HTMLInputElement[];

let renders: RenderCounts;
beforeEach(() => {
  setFinancePerfFlags(null);
  run.mockClear();
  renders = countRenders();
});
afterEach(() => { renders.stop(); cleanup(); });

async function openTranche() {
  renderScreen();
  unfold("c3");
  fireEvent.click(within(card("c3")).getAllByTestId("btn_FinancingInput_DisplayProject_Body_Form_SeniorDebt_CardHeader_RowTransparent")[0]!);
  fireEvent.click(await screen.findByRole("button", { name: "Edit Tranche" }));
  await waitFor(() => expect(repaymentInputs()).toHaveLength(YEARS));
}

describe("UT-FIN-FE Finance renders per keystroke (D162 B4)", () => {
  it("UT-FIN-FE-001 an Equity panel keystroke does not re-render the category gallery (FE-P2-01)", async () => {
    renderScreen();
    unfold("c3");
    unfold("c1");
    fireEvent.click(within(card("c1")).getByRole("button", { name: "Edit Equity" }));
    const field = await screen.findByTestId("txt_EquityData_FreeEquityEUR");
    renders.reset();
    fireEvent.change(field, { target: { value: "12" } });
    fireEvent.change(field, { target: { value: "12.5" } });
    expect((field as HTMLInputElement).value).toBe("12.5");
    expect(renders.of("FinanceCards")).toBe(0);
  });

  it("UT-FIN-FE-002 a repayment keystroke renders only its own row, and the other rows keep their values (FE-P2-02)", async () => {
    await openTranche();
    renders.reset();
    fireEvent.change(repaymentInputs()[3]!, { target: { value: "999" } });
    expect(repaymentInputs()[3]!.value).toBe("999");
    expect(repaymentInputs().map((x) => x.value).filter((_, i) => i !== 3)).toEqual(
      repayments.filter((_, i) => i !== 3).map((r) => String(r.amount)));
    expect(renders.ofPrefix("FinanceRepaymentRow:")).toBe(1);
    expect(renders.of("FinanceRepaymentRow:2032")).toBe(1);
    expect(renders.of("FinanceCards")).toBe(0);
  });

  it("UT-FIN-FE-003 a repayment edit still validates its own row: the canvas message under that row only, cleared by a valid amount", async () => {
    await openTranche();
    const message = /value must be numeric in range 0 to .* without decimal place\./;
    expect(screen.queryAllByText(message)).toHaveLength(0);
    fireEvent.change(repaymentInputs()[0]!, { target: { value: "1.5" } });
    fireEvent.change(repaymentInputs()[1]!, { target: { value: "600" } });
    expect(screen.queryAllByText(message)).toHaveLength(1);
    fireEvent.change(repaymentInputs()[0]!, { target: { value: "500" } });
    expect(screen.queryAllByText(message)).toHaveLength(0);
    expect(repaymentInputs().slice(0, 2).map((x) => x.value)).toEqual(["500", "600"]);
  });

  it("UT-FIN-FE-004 the visit effect runs once per changed dependency, not after every keystroke (FE-P2-09)", async () => {
    renderScreen();
    await waitFor(() => expect(renders.of("FinanceSeedEffect")).toBeGreaterThan(0));
    unfold("c1");
    fireEvent.click(within(card("c1")).getByRole("button", { name: "Edit Equity" }));
    const field = await screen.findByTestId("txt_EquityData_FreeEquityEUR");
    renders.reset();
    for (const v of ["1", "12", "12.5"]) fireEvent.change(field, { target: { value: v } });
    expect(renders.of("FinanceSeedEffect")).toBe(0);
    // Every input exists and the option is set: the visit wrote nothing, before or after the keystrokes.
    expect(run).not.toHaveBeenCalled();
  });
});
