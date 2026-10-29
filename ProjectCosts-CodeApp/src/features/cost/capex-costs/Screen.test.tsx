// @vitest-environment jsdom
/**
 * Layout tests for the DEVEX/CAPEX screen's Add/Edit Costs panel and its toolbar.
 *
 * References, transcribed:
 *   `ProjectDocs/Existing Solution/UI Screenshots/Cost App Landing Screen - Devex Capex Screen - Add Cost Panel.png`
 *   `ProjectDocs/Existing Solution/UI Screenshots/Cost App - Edit Contract - Year Cost Inputs.png`
 *
 * Three client reports live here — "Edit panel opens up but UI is distorted", "Fix UI of Years
 * collapsible gallery in Edit Panel" and "All the Dropdowns should be fixed into correct UI".
 * The decisions themselves are covered by `rules.test.ts` / `panelRules.test.ts`; what this
 * file asserts is that the panel actually puts them on screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import type { CostAccount, CostLine } from "../costing/model";
import type { GridCallback } from "./pcf/ui/GridRenderer";
import { CATEGORY_LABELS, SUMMARY_TAB_NAME } from "./rules";
import { MSG, PAID_CONFIRM_TITLE } from "./panelRules";

const ACCOUNTS: CostAccount[] = [
  { id: "acc-1", number: "80000", name: "Turbine / PV Supply Agreement", category: 0 },
  {
    id: "sub-1", number: "80000_0", name: "Turbine / PV Supply Agreement",
    parentId: "acc-1", category: 0,
  },
];

let lines: CostLine[] = [];
let startClusterNo = 0;
/** `gblSelectedProject.'Cluster State'.Order` — 0 until a test says otherwise. */
let clusterStateOrder: number | undefined = undefined;

/**
 * `loadCapexCategories()` — the tab labels as Dataverse holds them.
 *
 * Defaults to `CATEGORY_LABELS` because that is what VSBCloud_Dev really returns today, so every
 * pre-existing test in this file sees the strip it always saw. `undefined` stands for "the query
 * has not resolved yet".
 */
let capexCategories: string[] | undefined = [...CATEGORY_LABELS];

/**
 * `Project States`, as VSBCloud_Dev really holds them (measured 16 Sep): ten rows, of which
 * only `Order` 1..6 are clusters. Draft/Abandoned/On-hold are here so the `Order in [1..6]`
 * clause in `milestoneOptions` has something to exclude.
 */
const projectStates = [
  { id: "ps-0", name: "Draft", order: 0 },
  { id: "ps-1", name: "Cluster 1", order: 1 },
  { id: "ps-2", name: "Cluster 2", order: 2 },
  { id: "ps-3", name: "Cluster 3", order: 3 },
  { id: "ps-4", name: "Cluster 4", order: 4 },
  { id: "ps-5", name: "Cluster 5", order: 5 },
  { id: "ps-6", name: "Cluster 6", order: 6 },
  { id: "ps-8", name: "Abandoned", order: 8 },
  { id: "ps-9", name: "Inactive/ On-hold", order: 9 },
];

/** `mutateAsync` takes the save args, so `mock.calls` can be asserted against them. */
const saveLine = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(async (_args: { line: CostLine }) => undefined),
  isPending: false,
  error: null,
};
const setPaid = { mutate: vi.fn(), isPending: false, error: null };
const deleteLine = { mutate: vi.fn(), isPending: false, error: null };

/**
 * `saveLine.isPending`, made reactive.
 *
 * `useCapexWrites` is read on every render, so a test that flips this from inside its
 * `mutateAsync` sees the save status line on the re-render the save itself triggers — which is
 * the only way to observe "the panel closed and THEN the status appeared" as one ordering rather
 * than two unrelated assertions. (It was the blocking spinner until D57.)
 */
let savePending = false;
/** `setPaid.isPending` / `deleteLine.isPending`, likewise — the two no-panel writes. */
let paidPending = false;
let deletePending = false;
/** `setPaid.error` — a failed Paid write, for the error banner. */
let paidError: Error | null = null;
/** The props the (mocked) comments panel was last rendered with. */
let commentsPanelProps: { onSavingChange?: (saving: boolean) => void; writeStatus?: boolean } = {};
/** The cost book's first load, and its failure (D57 decision 4a, rule 19). */
let bookLoading = false;
let bookError: Error | null = null;
/** The Summary tab's totals query. */
let totalsLoading = false;

vi.mock("@/features/cost/costing/useCostBook", () => ({
  useCostBook: () => ({
    data: bookLoading ? undefined
      : { accounts: ACCOUNTS, lines, periods: [], extraGroups: { om: [], land: [], other: [] } },
    isLoading: bookLoading, error: bookError, save: { error: null }, projectId: "p1",
  }),
  useCapexTotals: () => ({ data: totalsLoading ? undefined : [], isLoading: totalsLoading }),
  useCapexCategories: () => ({ data: capexCategories }),
  useCapexWrites: () => ({
    setPaid: { ...setPaid, isPending: paidPending, error: paidError },
    deleteLine: { ...deleteLine, isPending: deletePending },
    saveLine: { ...saveLine, isPending: savePending },
  }),
  useStandardAssumptions: () => ({
    assumptions: [], activeWtgCount: 0, totalCapacity: 0,
    countryId: undefined, technology: undefined, isLoading: false,
  }),
  useCapexComments: () => ({ data: [] }),
  /** `Project States` — 1..6 are the clusters; Draft/Abandoned/On-hold are not. */
  useProjectStates: () => ({ data: projectStates }),
  /** No `Milestones Standard Assumptions` row for this fixture's country/technology. */
  useMilestoneDurations: () => ({ data: undefined }),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    project: {
      projectId: "p1", projectIdCode: "P1", projectName: "Wirmighausen",
      isoCurrencyCode: "EUR", startClusterNo, clusterStateOrder,
      startDate: new Date(2015, 0, 20), endDate: new Date(2030, 11, 31),
      milestones: {
        feasibilityStudies: new Date(2015, 0, 1),
        developmentStarted: new Date(2016, 0, 1),
        applicationSubmitted: new Date(2017, 0, 1),
        legallyBindingPermits: new Date(2018, 0, 1),
        construction: new Date(2019, 0, 1),
        operationsStartCod: new Date(2020, 0, 1),
        endDate: new Date(2030, 11, 31),
      },
    },
    projectId: "p1",
  }),
}));

/** The real grid is a hand-rolled PCF renderer; the screen only needs its callback. */
let onAction: GridCallback = () => {};
vi.mock("./PcfGrid", () => ({
  PcfGrid: (props: { onAction: GridCallback }) => {
    onAction = props.onAction;
    return <div data-testid="pcf-grid" />;
  },
}));
vi.mock("./CommentsPanel", () => ({
  CommentsPanel: (props: typeof commentsPanelProps) => { commentsPanelProps = props; return null; },
}));

import CapexCostsScreen from "./Screen";

function mount(entry = "/costs/capex?category=0") {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={[entry]}>
        <CapexCostsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

/** Opens the panel the way the grid's `Add` command does. */
const openAddPanel = () => fireEvent.click(screen.getByTestId("open-add"));

function mountAndOpen() {
  const view = mount();
  // The grid mock records the callback on render; fire it from a throwaway control.
  const button = document.createElement("button");
  button.setAttribute("data-testid", "open-add");
  button.addEventListener("click", () => onAction("Add", "sub-1"));
  document.body.appendChild(button);
  openAddPanel();
  return view;
}

/** The same, through the grid's `Edit` command, so the panel opens on a stored contract. */
function mountAndOpenEdit(lineId: string) {
  const view = mount();
  const button = document.createElement("button");
  button.setAttribute("data-testid", "open-add");
  button.addEventListener("click", () => onAction("Edit", lineId));
  document.body.appendChild(button);
  openAddPanel();
  return view;
}

/** The same, through the grid's `Delete` command, so the confirmation comes up. */
function mountAndDelete(lineId: string) {
  const view = mount();
  const button = document.createElement("button");
  button.setAttribute("data-testid", "open-add");
  button.addEventListener("click", () => onAction("Delete", lineId));
  document.body.appendChild(button);
  openAddPanel();
  return view;
}

/** The `line` the last save was asked to write. */
const savedLine = () => saveLine.mutateAsync.mock.calls[0]?.[0]?.line;

beforeEach(() => {
  lines = [];
  startClusterNo = 0;
  clusterStateOrder = undefined;
  capexCategories = [...CATEGORY_LABELS];
  savePending = false;
  paidPending = false;
  deletePending = false;
  paidError = null;
  commentsPanelProps = {};
  bookLoading = false;
  bookError = null;
  totalsLoading = false;
  vi.clearAllMocks();
  document.querySelectorAll('[data-testid="open-add"]').forEach((n) => n.remove());
});

describe("toolbar dropdowns", () => {
  it("are Fluent comboboxes, not native selects", () => {
    const { container } = mount();
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowCostPaidBy" }))
      .toHaveValue("Show All Cost");
    expect(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowSelectedYear" })).toBeInTheDocument();
  });

  it("changes the payer filter through the dropdown", () => {
    mount();
    fireEvent.click(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowCostPaidBy" }));
    fireEvent.click(screen.getByRole("option", { name: "DevCo" }));
    expect(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowCostPaidBy" })).toHaveValue("DevCo");
  });

  it("opens on today's year, as App.OnStart seeds gblSelectedProjectYear, not the 2015 start", () => {
    // The project starts in 2015 and the window runs to 2030; the canvas opens on
    // `Year(Today())` because the start date is in the past, clamped into that window.
    const expected = Math.min(Math.max(new Date().getFullYear(), 2015), 2030);
    mount();
    expect(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowSelectedYear" }))
      .toHaveValue(String(expected));
  });

  it("disables ◀ at the cost-allowed start year", () => {
    mount();
    fireEvent.click(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowSelectedYear" }));
    fireEvent.click(screen.getByRole("option", { name: "2015" }));
    expect(screen.getByRole("button", { name: "btn_Costs_ProjectCostbtn_ShowPreviousYear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "btn_Costs_ProjectCostbtn_ShowNextYear" })).toBeEnabled();
  });
});

describe("the Add Costs panel — left column", () => {
  it("lays the form out in the canvas' order", () => {
    mountAndOpen();
    expect(screen.getByText("Add Costs - Turbine / PV Supply Agreement")).toBeInTheDocument();
    const labels = [
      "Description", "Distribution", "Equal Distribution", "Total Costs [EUR]",
      "Select Cluster", "Distribution Frequency", "Average Amount per Payment [EUR]",
      "Cost Paid By", "Apply VAT", "Depreciation",
    ];
    // `Equal Distribution` is both a radio option under Distribution and the group below it,
    // so this asserts presence rather than uniqueness.
    for (const label of labels) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  /**
   * `lbl_…_Fields_Label_Asterisk_*` — visible beside Distribution Scheme (`:10545`+), Equal
   * Distribution (`:10664`+), Select Cluster (`:10904`+), Link to Milestone (`:11218`+) and
   * Distribution Frequency (`:11663`+); `Visible: =false` beside Distribution (`:10409`+) and
   * Cost Paid By (`:12053`+). The client's screenshot shows exactly that split.
   */
  it("stars the fields the canvas stars, and only those", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "Individual Distribution" }));
    const starred = [...document.querySelectorAll<HTMLElement>('[data-required="true"]')]
      .map((n) => n.textContent);
    expect(starred).toContain("Distribution Scheme");
    expect(starred).toContain("Link to Milestone");
    expect(starred).toContain("Description");
    expect(starred).not.toContain("Distribution");
    expect(starred).not.toContain("Cost Paid By");
  });

  it("offers the five clusters, all enabled for a greenfield project", () => {
    mountAndOpen();
    for (const name of [
      "Cluster 1: Feasibility Studies", "Cluster 2: Pre-Permitting", "Cluster 3: Permitting",
      "Cluster 4: Pre-Construction", "Cluster 5: Construction",
    ]) {
      expect(screen.getByRole("checkbox", { name })).toBeEnabled();
    }
  });

  it("disables the clusters a project acquired at cluster 3 has already passed", () => {
    startClusterNo = 3;
    mountAndOpen();
    expect(screen.getByRole("checkbox", { name: "Cluster 1: Feasibility Studies" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Cluster 2: Pre-Permitting" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Cluster 3: Permitting" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Cluster 5: Construction" })).toBeEnabled();
  });

  it("uses an MM/YYYY text box for the dates, not a day-precision picker", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "By Start and End Date" }));
    // The panel is a portal, so this looks at the whole document, not the render container.
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0);
    expect(screen.getAllByPlaceholderText("MM/YYYY")).toHaveLength(2);
  });

  it("shows the canvas' MM/YYYY validation message", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "By Start and End Date" }));
    const start = screen.getAllByPlaceholderText("MM/YYYY")[0] as HTMLInputElement;
    fireEvent.change(start, { target: { value: "13/2020" } });
    expect(screen.getByText("Date must be in MM/YYYY format")).toBeInTheDocument();
  });

  it("refuses a total cost outside the country ceiling", () => {
    mountAndOpen();
    fireEvent.change(screen.getByLabelText(/Total Costs/), { target: { value: "900000000" } });
    // Canvas wording: lower bound 0, and no trailing full stop — see `validateTotalCost`.
    expect(screen.getByText("Value must be between 0 and 500,000,000")).toBeInTheDocument();
  });

  it("refuses the reserved word Standard in a description", () => {
    mountAndOpen();
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: "Standard turbine supply" },
    });
    expect(screen.getByText(
      'The term "Standard" is applicable only for system-prefilled contracts.',
    )).toBeInTheDocument();
  });

  it("refuses a duplicate description under the same sub-account", () => {
    lines = [{
      id: "l1", accountId: "sub-1", description: "Gesamt", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "equal",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [1], payments: [], comments: [],
    }];
    mountAndOpen();
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "gesamt" } });
    expect(screen.getByText(
      "There cannot be two contracts with the same name under the same sub-account",
    )).toBeInTheDocument();
  });
});

describe("the Add Costs panel — year gallery", () => {
  it("renders one collapsed row per project year", () => {
    mountAndOpen();
    // 2015 (feasibility) through 2030 (end date).
    expect(screen.getByRole("button", { name: /^2015 Allocated Cost: 0 EUR$/ }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^2030 Allocated Cost: 0 EUR$/ }))
      .toBeInTheDocument();
    // Nothing is expanded, so no month box is on screen.
    expect(screen.queryByLabelText("January 2020")).not.toBeInTheDocument();
  });

  it("expands one year into twelve month + year rows", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("button", { name: /^2020 Allocated Cost/ }));
    expect(screen.getByRole("button", { name: /^2020 Allocated Cost/ }))
      .toHaveAttribute("aria-expanded", "true");
    for (const label of ["January 2020", "June 2020", "December 2020"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Month + year, never a three-letter abbreviation.
    expect(screen.queryByLabelText("Jan")).not.toBeInTheDocument();
  });

  it("keeps only one year open at a time", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("button", { name: /^2020 Allocated Cost/ }));
    fireEvent.click(screen.getByRole("button", { name: /^2021 Allocated Cost/ }));
    expect(screen.queryByLabelText("January 2020")).not.toBeInTheDocument();
    expect(screen.getByLabelText("January 2021")).toBeInTheDocument();
  });

  it("collapses the open year when it is clicked again", () => {
    mountAndOpen();
    const row = () => screen.getByRole("button", { name: /^2020 Allocated Cost/ });
    fireEvent.click(row());
    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "false");
  });

  it("totals the equal distribution into the year it falls in", () => {
    mountAndOpen();
    fireEvent.change(screen.getByLabelText(/Total Costs/), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cluster 1: Feasibility Studies" }));
    // Cluster 1 is 2015-01 → 2015-12, so every cent lands in 2015 and nowhere else.
    expect(screen.getByRole("button", { name: "2015 Allocated Cost: 1200 EUR" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2016 Allocated Cost: 0 EUR" }))
      .toBeInTheDocument();
  });
});

describe("the Link to Milestone dropdown", () => {
  /** `con_…_Form_Link_to_Cluster.Visible` (`CapexScreenCode.txt:11192-11199`). */
  const dropdown = () => screen.queryByRole("combobox", { name: "Link to Milestone" });

  it("is hidden for Equal Distribution By Cluster, which is the panel's default", () => {
    mountAndOpen();
    expect(dropdown()).not.toBeInTheDocument();
  });

  it("appears once Equal Distribution switches to By Start and End Date", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "By Start and End Date" }));
    expect(dropdown()).toBeInTheDocument();
  });

  it("appears for an Individual Distribution", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "Individual Distribution" }));
    expect(dropdown()).toBeInTheDocument();
  });

  it("offers None plus the clusters the project has not reached", () => {
    // `Cluster State` = Cluster 4, Start Cluster 0: `Order > 4 && Order >= Max(1, 0)`.
    clusterStateOrder = 4;
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "Individual Distribution" }));
    fireEvent.click(dropdown() as HTMLElement);
    expect(screen.getAllByRole("option").map((o) => o.textContent))
      .toEqual(["None", "Cluster 5", "Cluster 6"]);
  });

  it("opens on the contract's stored link rather than on None", () => {
    // `DefaultSelectedItems: Coalesce(contract.'Linked Cluster', {vsb_name: "None"})` (`:11239`).
    lines = [{
      id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [], payments: [], comments: [],
      linkedClusterId: "ps-2", linkedClusterName: "Cluster 2", linkedClusterOrder: 2,
    }];
    mountAndOpenEdit("l1");
    expect(dropdown()).toHaveValue("Cluster 2");
  });

  it("stops the save and asks when money sits in another cluster", () => {
    /*
     * `If(locValidCostInContract, If(Or(And(CountRows(Filter(colOtherClusterHavingCost,
     * Order <> Selected.Order)) > 0, locClusterLinkageChanged), …), show the popup, save))`
     * (`CapexScreenCode.txt:17413`). The money is in 2016, i.e. cluster 2, and the link is
     * moving to cluster 3.
     */
    lines = [{
      id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [],
      payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
      comments: [],
    }];
    mountAndOpenEdit("l1");
    fireEvent.click(dropdown() as HTMLElement);
    fireEvent.click(screen.getByRole("option", { name: "Cluster 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Change Cluster Link")).toBeInTheDocument();
    /*
     * ONE message, so the canvas drops the header and the bullet and prints its own tailored
     * sentence — `If(locCount > 1, <header + bullets>, <single statement>)` (`:20008-20024`).
     * This used to assert the BULLET text ("Costs have been entered for Cluster 2 and linked
     * to Cluster 3."), which the canvas only ever shows at two or more.
     */
    expect(screen.getByText(
      "You have entered costs in Cluster 2 and linked them to Cluster 3."
      + " Would you like to proceed?",
    )).toBeInTheDocument();
    expect(screen.queryByText(/following changes\?/)).not.toBeInTheDocument();
    // Nothing is written until the dialog is answered.
    expect(saveLine.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(saveLine.mutateAsync).toHaveBeenCalledTimes(1);
    expect(savedLine()).toMatchObject({
      linkedClusterId: "ps-3", linkedClusterName: "Cluster 3", linkedClusterOrder: 3,
    });
  });

  it("saves straight through when the money is already in the cluster being linked to", () => {
    lines = [{
      id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [],
      payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
      comments: [],
    }];
    mountAndOpenEdit("l1");
    fireEvent.click(dropdown() as HTMLElement);
    // Cluster 2 is 2016-01 → 2016-12 on this fixture's milestone chain.
    fireEvent.click(screen.getByRole("option", { name: "Cluster 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByText("Change Cluster Link")).not.toBeInTheDocument();
    expect(saveLine.mutateAsync).toHaveBeenCalledTimes(1);
  });

  /**
   * `locCostPaidByChanged` is the SECOND arm of the Save gate's `Or`
   * (`CapexScreenCode.txt:17413`), and it stands alone — no cluster has to hold money and the
   * link need not have moved. `locCostPaidByChanged: locInitialCostPaidBy <> Self.Selected.Value`
   * (`:12127`). The client called this out explicitly.
   */
  it("asks when Cost Paid By alone changes, with no relink at all", () => {
    lines = [{
      id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [],
      payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
      comments: [],
    }];
    mountAndOpenEdit("l1");
    fireEvent.click(screen.getByRole("radio", { name: "DevCo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    /*
     * `Title` keys on the message COUNT, not on a pair of flags (`:20127-20170`):
     * `If(locCountOfMessages >= 2, "Confirm Changes", locCostPaidByChanged,
     *     "Change Cost Paid By", And(locClusterLinkageChanged, …), "Change Cluster Link",
     *     locMilestoneRelinkResetNeeded, "Cluster-linked Costs")`.
     */
    expect(screen.getByText("Change Cost Paid By")).toBeInTheDocument();
    // One message → the single-statement form, with 'Cost Paid by' in SINGLE quotes and
    // "influence the liquidity planning", not the bullet's "impact liquidity planning".
    expect(screen.getByText(
      "Are you sure you want to switch the 'Cost Paid by' to DevCo?"
      + " This will influence the liquidity planning and BoP.",
    )).toBeInTheDocument();
    expect(screen.queryByText(/following changes\?/)).not.toBeInTheDocument();
    expect(saveLine.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(savedLine()).toMatchObject({ payer: "DevCo" });
  });

  it("titles the dialog Confirm Changes when the payer AND the link both moved", () => {
    lines = [{
      id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [],
      payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
      comments: [],
    }];
    mountAndOpenEdit("l1");
    fireEvent.click(screen.getByRole("radio", { name: "DevCo" }));
    fireEvent.click(dropdown() as HTMLElement);
    fireEvent.click(screen.getByRole("option", { name: "Cluster 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Confirm Changes")).toBeInTheDocument();
    // Both bullets, in the canvas' order, under the shared opening line.
    expect(screen.getByText(/Are you sure you want to proceed with the following changes\?/))
      .toBeInTheDocument();
    expect(screen.getByText(/Switch the "Cost Paid By" to DevCo/)).toBeInTheDocument();
    expect(screen.getByText(/Costs have been entered for Cluster 2 and linked to Cluster 3/))
      .toBeInTheDocument();
    // `TextConfirmButton` widens to "Confirm All" when both flags are set (`:19929-19935`).
    expect(screen.getByRole("button", { name: "Confirm All" })).toBeInTheDocument();
  });

  it("clears the link when None is picked, without asking", () => {
    // `Selected.Name <> "None"` is the first clause of `locClusterLinkageChanged` (`:11290`),
    // so UNLINKING never raises the dialog.
    lines = [{
      id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
      depreciation: true, vat: true, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
      frequency: 1, clusters: [],
      payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
      comments: [],
      linkedClusterId: "ps-2", linkedClusterName: "Cluster 2", linkedClusterOrder: 2,
    }];
    mountAndOpenEdit("l1");
    fireEvent.click(dropdown() as HTMLElement);
    fireEvent.click(screen.getByRole("option", { name: "None" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByText("Change Cluster Link")).not.toBeInTheDocument();
    expect(savedLine()).toMatchObject({
      linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined,
    });
  });
});

/**
 * An existing INDIVIDUAL contract with one month of money — the shape the client's two
 * reference screenshots were taken on.
 */
const individualContract = (patch: Partial<CostLine> = {}): CostLine => ({
  id: "l1", accountId: "sub-1", description: "New Contract", payer: "SPV",
  depreciation: true, vat: true, standard: false, distribution: "individual",
  equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
  frequency: 1, clusters: [],
  payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
  comments: [],
  ...patch,
});

/**
 * No blocking overlay: no `LoadingOverlay` scrim (`role="dialog" aria-modal aria-busy`), and no
 * Fluent spinner anywhere on the screen.
 */
const expectNoSpinner = () => {
  expect(document.querySelector('[aria-modal="true"][aria-busy="true"]')).toBeNull();
  expect(document.querySelector(".fui-Spinner")).toBeNull();
};

/** The `WriteStatus` line, by its test id. */
const writeStatus = () => screen.queryByTestId("capex-write-status");

/**
 * The save STATUS LINE — the blocking spinner until D57.
 *
 * The status line carries the same verbatim `InformationText` the canvas spinner did, but it
 * blocks nothing; the write commands are greyed instead (decision 2b).
 */
describe("the save status line", () => {
  /**
   * Reference: `Cost App - Loading Spinner Design - Panel Closes and Spinner is shown..png`.
   *
   * Both save branches of the canvas Save button dismiss the panel and raise the spinner in the
   * SAME `UpdateContext` (`CapexScreenCode.txt:17413` — `locIsVisibleRightPanelAddContract:
   * false` alongside `locIsVisiblePopUpSpinner: true`), so the spinner is never drawn over an
   * open panel. Decision 7a keeps that order for the status line that replaced it.
   */
  it("closes the panel before the write, then shows the status line, not an overlay", () => {
    lines = [individualContract()];
    mountAndOpenEdit("l1");
    expect(screen.getByText("Edit Costs - Turbine / PV Supply Agreement")).toBeInTheDocument();

    saveLine.mutateAsync.mockImplementationOnce(() => {
      savePending = true;
      return new Promise<undefined>(() => {});
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByText("Edit Costs - Turbine / PV Supply Agreement"))
      .not.toBeInTheDocument();
    expect(screen.getByText("Please wait, saving the cost...")).toBeInTheDocument();
    expect(writeStatus()).toHaveTextContent("Please wait, saving the cost...");
    expect(writeStatus()).toHaveAttribute("role", "status");
    expectNoSpinner();
  });

  /** The equal-distribution branch says "costs" (plural) — `:17413`, extracted line 1489. */
  it("says 'saving costs...' for an equal distribution", () => {
    mountAndOpen();
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "New Contract" } });
    fireEvent.change(screen.getByLabelText(/Total Costs/), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cluster 1: Feasibility Studies" }));

    saveLine.mutateAsync.mockImplementationOnce(() => {
      savePending = true;
      return new Promise<undefined>(() => {});
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Please wait, saving costs...")).toBeInTheDocument();
  });

  /** `OnConfirm` sets `locIsVisibleRightPanelAddContract: false` too (`:19906-19912`). */
  it("closes the panel when the relink dialog is confirmed, not before", () => {
    lines = [individualContract()];
    mountAndOpenEdit("l1");
    fireEvent.click(screen.getByRole("radio", { name: "DevCo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The dialog is up and the panel is still behind it.
    expect(screen.getByText("Edit Costs - Turbine / PV Supply Agreement")).toBeInTheDocument();

    saveLine.mutateAsync.mockImplementationOnce(() => {
      savePending = true;
      return new Promise<undefined>(() => {});
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.queryByText("Edit Costs - Turbine / PV Supply Agreement"))
      .not.toBeInTheDocument();
    expect(screen.getByText("Please wait, saving the cost...")).toBeInTheDocument();
    expectNoSpinner();
  });
});

/** D57 decision 2b — while a write is pending, only the commands that START a write go grey. */
describe("the write guard (D57)", () => {
  /** Fires one grid action through the recorded `onAction`, from a throwaway control. */
  const fireGrid = (...args: Parameters<GridCallback>) => {
    const button = document.createElement("button");
    button.setAttribute("data-testid", "open-add");
    button.addEventListener("click", () => onAction(...args));
    document.body.appendChild(button);
    fireEvent.click(button);
    button.remove();
  };

  it("UT-CAPEX-NOSPIN-008 ignores Add, Edit and Delete from the grid while a save is pending", () => {
    lines = [individualContract()];
    savePending = true;
    mount();
    fireGrid("Add", "sub-1");
    fireGrid("Edit", "l1");
    fireGrid("Delete", "l1");
    expect(screen.queryByText(/^Add Costs - /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Edit Costs - /)).not.toBeInTheDocument();
    expect(screen.queryByText(MSG.deleteTitle)).not.toBeInTheDocument();
  });

  it("UT-CAPEX-NOSPIN-009 ignores the Paid toggle while a delete is pending, and shows its status", () => {
    lines = [individualContract({
      payments: [{ id: "c1", year: 2016, month: 6, amount: 500, paid: false }],
    })];
    deletePending = true;
    mount();
    fireGrid("SetCostPaidUnpaid", "l1", undefined, { year: 2016, month: 6, paid: true });
    expect(setPaid.mutate).not.toHaveBeenCalled();
    // A delete latches no label of its own, so it falls back to the plural form.
    expect(writeStatus()).toHaveTextContent("Please wait, saving costs...");
    expectNoSpinner();
  });

  it("UT-CAPEX-NOSPIN-010 greys Add Cost from Table while a Paid write is pending, not the filters", () => {
    paidPending = true;
    mount();
    expect(screen.getByRole("button", {
      name: "btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable",
    })).toBeDisabled();
    // Read-only commands stay live.
    expect(screen.getByRole("switch", { name: "tgl_Costs_ProjectCostbtn_ShowEmptyAccounts" }))
      .toBeEnabled();
    expect(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowCostPaidBy" }))
      .toBeEnabled();
    expect(screen.getByRole("button", { name: "btn_Costs_ProjectCostbtn_ShowNextYear" }))
      .toBeEnabled();
    expect(screen.getAllByRole("tab")[0]).toBeEnabled();
  });

  it("UT-CAPEX-NOSPIN-011 acts on the same grid commands once nothing is pending", () => {
    lines = [individualContract()];
    mount();
    expect(writeStatus()).toBeEmptyDOMElement();
    expect(screen.getByRole("button", {
      name: "btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable",
    })).toBeEnabled();
    fireGrid("Delete", "l1");
    expect(screen.getByText(MSG.deleteTitle)).toBeInTheDocument();
  });
});

/** D57 decision 4a — a first load renders the chrome over an empty body, never a spinner. */
describe("the first load (D57)", () => {
  it("UT-CAPEX-NOSPIN-012 renders the tabs and toolbar, write commands greyed, and an empty body", () => {
    bookLoading = true;
    mount();
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", {
      name: "btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable",
    })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "drp_Costs_ProjectCostbtn_ShowSelectedYear" }))
      .toBeEnabled();
    expect(screen.getByTestId("capex-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("pcf-grid")).not.toBeInTheDocument();
    expect(screen.queryByText("Please wait, loading cost ...")).not.toBeInTheDocument();
    expectNoSpinner();
  });

  it("UT-CAPEX-NOSPIN-013 never reads 'Cost data is unavailable' while loading", () => {
    bookLoading = true;
    bookError = new Error("not yet");
    mount();
    expect(screen.queryByText("Cost data is unavailable")).not.toBeInTheDocument();
  });

  it("UT-CAPEX-NOSPIN-014 still shows the load-error state once a load has failed (rule 19)", () => {
    bookError = new Error("403");
    mount();
    expect(screen.getByText("Cost data is unavailable")).toBeInTheDocument();
  });

  it("UT-CAPEX-NOSPIN-015 leaves the Summary empty while its totals load, with no spinner", () => {
    totalsLoading = true;
    mount("/costs/capex");
    expect(screen.getByTestId("capex-summary-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("table", { name: "DEVEX/CAPEX Summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("Please wait, loading data...")).not.toBeInTheDocument();
    expectNoSpinner();
  });

  it("UT-CAPEX-NOSPIN-018 while loading, a pending write still shows its status line", () => {
    bookLoading = true;
    deletePending = true;
    mount();
    expect(screen.getByTestId("capex-loading")).toBeInTheDocument();
    expect(writeStatus()).toHaveTextContent("Please wait, saving costs...");
    expect(writeStatus()).toHaveAttribute("role", "status");
  });

  it("UT-CAPEX-NOSPIN-019 while loading, a failed write still shows its error banner", () => {
    bookLoading = true;
    paidError = new Error("Paid write refused");
    mount();
    expect(screen.getByTestId("capex-loading")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Paid write refused");
  });
});

/** The comments commit on the screen's own status line (D57). */
describe("the comments status line (D57)", () => {
  it("UT-CAPEX-NOSPIN-020 shows 'Saving comments...' from the panel's commit; the panel's own line is off", () => {
    mount();
    expect(commentsPanelProps.writeStatus).toBe(false);
    act(() => commentsPanelProps.onSavingChange?.(true));
    expect(writeStatus()).toHaveTextContent("Saving comments...");
    act(() => commentsPanelProps.onSavingChange?.(false));
    expect(writeStatus()).toBeEmptyDOMElement();
  });

  it("UT-CAPEX-NOSPIN-021 the line survives the panel unmounting: a tab switch into a first load mid-commit", () => {
    const view = mount();
    act(() => commentsPanelProps.onSavingChange?.(true));
    // The loading branch renders no comments panel at all.
    bookLoading = true;
    view.rerender(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter initialEntries={["/costs/capex?category=0"]}><CapexCostsScreen /></MemoryRouter>
      </FluentProvider>,
    );
    expect(screen.getByTestId("capex-loading")).toBeInTheDocument();
    expect(writeStatus()).toHaveTextContent("Saving comments...");
  });
});

describe("the panel footer", () => {
  /**
   * `con_GeneratorData_RightPanel_Form_PvModuleType_Buttons_2` lists Save (`:17345`),
   * Recalculate Allocated Cost (`:17537`) and Cancel (`:17994`) left to right.
   */
  it("carries Save, Recalculate Allocated Cost and Cancel for an individual distribution", () => {
    lines = [individualContract()];
    mountAndOpenEdit("l1");
    const footer = document.querySelector(".canvas-panel-footer") as HTMLElement;
    expect([...footer.querySelectorAll("button")].map((b) => b.textContent))
      .toEqual(["Save", "Recalculate Allocated Cost", "Cancel"]);
  });

  /** `Visible: =DistributionType = 'Individual Distribution'` (`:17992`). */
  it("hides Recalculate Allocated Cost for an equal distribution", () => {
    mountAndOpen();
    expect(screen.queryByRole("button", { name: "Recalculate Allocated Cost" }))
      .not.toBeInTheDocument();
    const footer = document.querySelector(".canvas-panel-footer") as HTMLElement;
    expect([...footer.querySelectorAll("button")].map((b) => b.textContent))
      .toEqual(["Save", "Cancel"]);
  });

  /**
   * `colNewEditPanelCostProcessed` (`:17558-17990`) rounds an absolute month's Save value with
   * `Round(JanUIv, 0)` and drops any box that is not a number — it does not move money between
   * months. The year gallery's `Allocated Cost:` reads the rebuilt collection.
   */
  it("rounds the typed months and refreshes the Allocated Cost figures", () => {
    lines = [individualContract({
      payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
    })];
    mountAndOpenEdit("l1");
    fireEvent.click(screen.getByRole("button", { name: /^2016 Allocated Cost/ }));
    fireEvent.change(screen.getByLabelText("June 2016"), { target: { value: "1250.6" } });
    // The box keeps what was typed; the gallery's own label already rounds for display.
    expect(screen.getByLabelText("June 2016")).toHaveValue(1250.6);

    fireEvent.click(screen.getByRole("button", { name: "Recalculate Allocated Cost" }));
    expect(screen.getByLabelText("June 2016")).toHaveValue(1251);
    expect(screen.getByRole("button", { name: "2016 Allocated Cost: 1251 EUR" }))
      .toBeInTheDocument();
  });

  /** `DisplayMode` (`:17541-17555`) — the save gate is its last clause. */
  it("disables Recalculate Allocated Cost while the form is invalid", () => {
    lines = [individualContract()];
    mountAndOpenEdit("l1");
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Recalculate Allocated Cost" })).toBeDisabled();
  });
});

describe("Distribution and Distribution Scheme on an existing contract", () => {
  /**
   * `=If(Not(locSelectedCostRow.IsContract), DisplayMode.Edit, DisplayMode.View)` on
   * `rad_…_DistributionType_1` (`:10445`) and `rad_…_DistributionScheme_1` (`:10585`).
   */
  it("greys both radio groups, and nothing else", () => {
    lines = [individualContract()];
    mountAndOpenEdit("l1");
    expect(screen.getByRole("radio", { name: "Individual Distribution" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Equal Distribution" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Absolute Values" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "% Values" })).toBeDisabled();
    // The four the screenshot shows still live.
    expect(screen.getByRole("combobox", { name: "Link to Milestone" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "DevCo" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Apply VAT" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Depreciation" })).toBeEnabled();
  });

  /** A NEW cost is not a contract yet, so both groups stay editable. */
  it("leaves them editable when the panel is opened to add a cost", () => {
    mountAndOpen();
    expect(screen.getByRole("radio", { name: "Individual Distribution" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "Individual Distribution" }));
    expect(screen.getByRole("radio", { name: "% Values" })).toBeEnabled();
  });
});

/**
 * Strings and lists transcribed from the canvas rather than invented — CONVENTIONS rule 7 and
 * the tab strip's data source. Decisions recorded in `02-OPEN-DECISIONS.md` D38 §3 and §4.
 */
describe("canvas fidelity of the screen's own copy", () => {
  /**
   * UT-CAPEXS-001 — `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_17.Text` is
   * "Start Date Distribution" and `…_Label_18.Text` is "End Date Distribution". This app had
   * shortened both.
   *
   * The second half is the trap worth pinning: the CAPTION changed, the IDENTITY did not.
   * `CostField` puts `name` on `aria-label` and `data-testid` and `label` in the visible span,
   * so the canvas `AccessibleLabel` the identity gate compares is untouched.
   */
  it("UT-CAPEXS-001 captions the date boxes verbatim without moving their canvas identity", () => {
    mountAndOpen();
    fireEvent.click(screen.getByRole("radio", { name: "By Start and End Date" }));

    expect(screen.getByText("Start Date Distribution")).toBeInTheDocument();
    expect(screen.getByText("End Date Distribution")).toBeInTheDocument();
    // The shortened captions are gone (exact match: "Start Date" ≠ "Start Date Distribution").
    expect(screen.queryByText("Start Date")).not.toBeInTheDocument();
    expect(screen.queryByText("End Date")).not.toBeInTheDocument();

    expect(screen.getByTestId("txt_AddContract_RightPanel_StartDate_1"))
      .toHaveAttribute("aria-label", "txt_AddContract_RightPanel_StartDate_1");
    expect(screen.getByTestId("txt_AddContract_RightPanel_EndDate_1"))
      .toHaveAttribute("aria-label", "txt_AddContract_RightPanel_EndDate_1");
  });

  /**
   * UT-CAPEXS-002 — `cmp_PopUp_SubaccountCostsDeletion_Confirmation`: `Title: ="Delete Contract"`,
   * `TextConfirmButton: ="Confirm"`, `TextCancelButton: ="Cancel"`, and a `Description` that
   * names both the contract and its sub-account, each in `Char(34)` quotes. All four were
   * invented before this.
   */
  it("UT-CAPEXS-002 asks the canvas' delete question, naming the contract and sub-account", () => {
    lines = [individualContract({ description: "Gesamt" })];
    mountAndDelete("l1");

    expect(screen.getByText("Delete Contract")).toBeInTheDocument();
    expect(screen.getByText(
      'Are you sure you want to delete the costs for "Gesamt"'
      + ' of the selected Subaccount "Turbine / PV Supply Agreement"?',
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // The invented wording and the red button are both gone.
    expect(screen.queryByText("Delete Cost")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(deleteLine.mutate).toHaveBeenCalledTimes(1);
  });

  /**
   * UT-CAPEXS-003 — the canvas builds the strip from
   * `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")),
   * "vsb_order")`. A category an admin adds must therefore get a tab, which the hard-coded list
   * could never give it.
   */
  it("UT-CAPEXS-003 builds the tab strip from Dataverse, not from the hard-coded list", () => {
    capexCategories = ["Wind Turbine / Panels", "Development Expenses", "Brand New Category"];
    mount();

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      SUMMARY_TAB_NAME, "Wind Turbine / Panels", "Development Expenses", "Brand New Category",
    ]);
    expect(screen.queryByRole("tab", { name: "Other CAPEX" })).not.toBeInTheDocument();
  });

  /**
   * UT-CAPEXS-004 — `categoryTabs` falls back to `CATEGORY_LABELS` rather than rendering a strip
   * with only Summary on it: a transient query failure must not blank the navigation. Both the
   * resolved-but-empty and the not-yet-resolved cases take that path.
   */
  it("UT-CAPEXS-004 falls back to the built-in categories when the query yields nothing", () => {
    capexCategories = [];
    const { unmount } = mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent))
      .toEqual([SUMMARY_TAB_NAME, ...CATEGORY_LABELS]);
    unmount();

    capexCategories = undefined;
    mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent))
      .toEqual([SUMMARY_TAB_NAME, ...CATEGORY_LABELS]);
  });
});

/**
 * The dialog CARD dimensions, which `cmp_PopUp_Confirmation_New` takes per instance from its
 * `BoxHeight` / `TextHeight` custom properties rather than from the component
 * (`cmp_PopUp_Confirmation_New.pa.yaml:104`, `:167`). `ConfirmDialog` renders both as inline
 * styles, so they are read off the element rather than through Griffel.
 */
describe("confirmation dialog dimensions", () => {
  /** The `DialogSurface` — the white card itself. */
  const surface = () => document.querySelector(".fui-DialogSurface") as HTMLElement;
  /** The description band inside it: the surface's second child, after the 42 px header. */
  const band = () => surface().children[1] as HTMLElement;
  /** Local copy — the one in the Link to Milestone suite is scoped to that `describe`. */
  const milestonePicker = () =>
    screen.queryByRole("combobox", { name: "Link to Milestone" }) as HTMLElement;

  /** An individually-distributed contract with one month of money, as the other tests use. */
  const linkedCost = (patch: Partial<CostLine> = {}): CostLine => ({
    id: "l1", accountId: "sub-1", description: "Linked cost", payer: "SPV",
    depreciation: true, vat: true, standard: false, distribution: "individual",
    equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "",
    frequency: 1, clusters: [],
    payments: [{ year: 2016, month: 6, amount: 500, paid: false }],
    comments: [],
    ...patch,
  });

  /**
   * UT-CAPEXS-005 — ONE message: `BoxHeight` 200, `TextHeight` 60
   * (`Switch(locCount, 1, 200, …)` at `:19906-19936`, `Switch(locCount, 1, 60, …)` at
   * `:20096-20126`). The shortest arm, because the single form carries no header.
   */
  it("UT-CAPEXS-005 sizes the relink dialog 200/60 for a single message", () => {
    lines = [linkedCost()];
    mountAndOpenEdit("l1");
    fireEvent.click(milestonePicker());
    fireEvent.click(screen.getByRole("option", { name: "Cluster 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(surface()).toHaveStyle({ height: "200px" });
    expect(band()).toHaveStyle({ height: "60px" });
  });

  /** UT-CAPEXS-006 — TWO messages: 250 / 120. Payer and link both moved. */
  it("UT-CAPEXS-006 sizes the relink dialog 250/120 for two messages", () => {
    lines = [linkedCost()];
    mountAndOpenEdit("l1");
    fireEvent.click(screen.getByRole("radio", { name: "DevCo" }));
    fireEvent.click(milestonePicker());
    fireEvent.click(screen.getByRole("option", { name: "Cluster 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Confirm Changes")).toBeInTheDocument();
    expect(surface()).toHaveStyle({ height: "250px" });
    expect(band()).toHaveStyle({ height: "120px" });
  });

  /**
   * UT-CAPEXS-007 — the paid-toggle dialog's dimensions are LITERALS on its instance,
   * `BoxHeight: =200` (`:19868`) and `TextHeight: =75` (`:19878`) — note 75, not the 60 the
   * relink dialog uses at one message. It always shows the same single sentence.
   */
  it("UT-CAPEXS-007 sizes the paid-toggle dialog 200/75 from its canvas literals", () => {
    /*
     * The month needs its `vsb_capexcostid`: `resolvePaidTarget` resolves the grid's click back
     * to a cost ROW, and without an id it returns the "no monthly cost row found" error instead,
     * so the dialog never opens. `paidToggleNeedsConfirmation` then needs the contract to be
     * individually distributed AND cluster-linked.
     */
    lines = [linkedCost({
      payments: [{ id: "c1", year: 2016, month: 6, amount: 500, paid: false }],
      linkedClusterId: "ps-2", linkedClusterName: "Cluster 2", linkedClusterOrder: 2,
    })];
    const view = mount();
    const button = document.createElement("button");
    button.setAttribute("data-testid", "open-add");
    button.addEventListener("click", () => onAction(
      "SetCostPaidUnpaid", "l1", undefined, { year: 2016, month: 6, paid: true },
    ));
    document.body.appendChild(button);
    openAddPanel();

    expect(screen.getByText(PAID_CONFIRM_TITLE)).toBeInTheDocument();
    expect(surface()).toHaveStyle({ height: "200px" });
    expect(band()).toHaveStyle({ height: "75px" });
    view.unmount();
  });

  /**
   * UT-CAPEXS-008 — the DELETE dialog passes neither, so it keeps `ConfirmDialog`'s own default.
   * Its canvas card height is the literal `=260` the plain component hard-codes
   * (`cmp_PopUp_Confirmation.pa.yaml:88`), and the plain variant has no `TextHeight` property
   * at all. This is the regression guard: it fails if someone later passes a height to every
   * dialog for consistency's sake.
   */
  it("UT-CAPEXS-008 leaves the delete dialog on the component default", () => {
    lines = [individualContract({ description: "Gesamt" })];
    mountAndDelete("l1");

    expect(screen.getByText(MSG.deleteTitle)).toBeInTheDocument();
    expect(surface().style.height).toBe("");
    expect(band().style.height).toBe("");
  });
});
