// @vitest-environment jsdom
/**
 * Layout tests for the DEVEX/CAPEX screen's Add/Edit Costs panel and its toolbar.
 *
 * References, transcribed:
 *   `Existing Solution/UI Screenshots/Cost App Landing Screen - Devex Capex Screen - Add Cost Panel.png`
 *   `Existing Solution/UI Screenshots/Cost App - Edit Contract - Year Cost Inputs.png`
 *
 * Three client reports live here — "Edit panel opens up but UI is distorted", "Fix UI of Years
 * collapsible gallery in Edit Panel" and "All the Dropdowns should be fixed into correct UI".
 * The decisions themselves are covered by `rules.test.ts` / `panelRules.test.ts`; what this
 * file asserts is that the panel actually puts them on screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import type { CostAccount, CostLine } from "../costing/model";
import type { GridCallback } from "./pcf/ui/GridRenderer";

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
 * `mutateAsync` sees the save spinner on the re-render the save itself triggers — which is the
 * only way to observe "the panel closed and THEN the spinner appeared" as one ordering rather
 * than two unrelated assertions.
 */
let savePending = false;

vi.mock("@/features/costing/useCostBook", () => ({
  useCostBook: () => ({
    data: { accounts: ACCOUNTS, lines, periods: [], extraGroups: { om: [], land: [], other: [] } },
    isLoading: false, error: null, save: { error: null }, projectId: "p1",
  }),
  useCapexTotals: () => ({ data: [], isLoading: false }),
  useCapexWrites: () => ({
    setPaid, deleteLine, saveLine: { ...saveLine, isPending: savePending },
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
vi.mock("./CommentsPanel", () => ({ CommentsPanel: () => null }));

import CapexCostsScreen from "./Screen";

function mount() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={["/costs/capex?category=0"]}>
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

/** The `line` the last save was asked to write. */
const savedLine = () => saveLine.mutateAsync.mock.calls[0]?.[0]?.line;

beforeEach(() => {
  lines = [];
  startClusterNo = 0;
  clusterStateOrder = undefined;
  savePending = false;
  vi.clearAllMocks();
  document.querySelectorAll('[data-testid="open-add"]').forEach((n) => n.remove());
});

describe("toolbar dropdowns", () => {
  it("are Fluent comboboxes, not native selects", () => {
    const { container } = mount();
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: "Cost paid by filter" }))
      .toHaveValue("Show All Cost");
    expect(screen.getByRole("combobox", { name: "Cost year" })).toBeInTheDocument();
  });

  it("changes the payer filter through the dropdown", () => {
    mount();
    fireEvent.click(screen.getByRole("combobox", { name: "Cost paid by filter" }));
    fireEvent.click(screen.getByRole("option", { name: "DevCo" }));
    expect(screen.getByRole("combobox", { name: "Cost paid by filter" })).toHaveValue("DevCo");
  });

  it("opens on the cost-allowed start year rather than today's", () => {
    // The project starts in 2015 and the window runs to 2030; `Year(Today())` is neither.
    expect(new Date().getFullYear()).not.toBe(2015);
    mount();
    expect(screen.getByRole("combobox", { name: "Cost year" })).toHaveValue("2015");
  });

  it("disables ◀ at the cost-allowed start year", () => {
    mount();
    expect(screen.getByRole("button", { name: "Previous year" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next year" })).toBeEnabled();
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
    expect(screen.getByText("Value must be between 1 and 500,000,000.")).toBeInTheDocument();
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
    expect(screen.getByText(
      /Costs have been entered for Cluster 2 and linked to Cluster 3\./,
    )).toBeInTheDocument();
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

    // `Title: =If(locCostPaidByChanged && …, "Confirm Changes", locCostPaidByChanged,
    //             "Change Cost Paid By", "Change Cluster Link")` (`:19941-19964`).
    expect(screen.getByText("Change Cost Paid By")).toBeInTheDocument();
    expect(screen.getByText(
      /Switch the "Cost Paid By" to DevCo\. This will impact liquidity planning and BoP\./,
    )).toBeInTheDocument();
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

describe("the save spinner", () => {
  /**
   * Reference: `Cost App - Loading Spinner Design - Panel Closes and Spinner is shown..png`.
   *
   * Both save branches of the canvas Save button dismiss the panel and raise the spinner in the
   * SAME `UpdateContext` (`CapexScreenCode.txt:17413` — `locIsVisibleRightPanelAddContract:
   * false` alongside `locIsVisiblePopUpSpinner: true`), so the spinner is never drawn over an
   * open panel. This used to await the write first and close afterwards.
   */
  it("closes the panel before the write, then shows the spinner over the grid", () => {
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
