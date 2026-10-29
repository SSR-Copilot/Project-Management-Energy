// @vitest-environment jsdom
/**
 * Render tests for the Land Lease screen.
 *
 * `landLeaseRules.test.ts` covers the 169 decisions (UT-LAND-001..129); this file covers the
 * WIRING — that the right rule reaches the right control. Every assertion here is one the
 * merged `Screen.tsx` would have failed, or one the canvas screenshots show directly.
 *
 * The data hooks are mocked rather than the Power Platform host:
 * `@/features/cost/costing/useCostBook` is the screen's only data dependency (the Land Lease queries
 * moved behind `costRepository` into `@/data/landLease`), and stubbing it keeps the test about
 * composition.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { vsbTheme } from "@/theme/fluent";
import {
  LAND_LEASE_AGGREGATION, LAND_LEASE_PERIOD, LAND_LEASE_SECURED, TECHNOLOGY,
  type LeaseCostRow, type LeasePeriodRow,
} from "./landLeaseRules";
import type { LeaseBook } from "@/data/landLease";

/* ── the doubles ──────────────────────────────────────────────────────────── */

let book: LeaseBook;
let technology: number | undefined = TECHNOLOGY.wind;
let loading = false;
let loadError: Error | null = null;
const mutateAsync = vi.fn(async (_writes: unknown[]) => ({ createdIds: {} }));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    projectId: "11111111-1111-1111-1111-111111111111",
    project: {
      projectId: "11111111-1111-1111-1111-111111111111",
      projectName: "Wirmighausen",
      countryName: "Germany",
      isoCurrencyCode: "EUR",
      owningBusinessUnitId: "22222222-2222-2222-2222-222222222222",
      milestones: { operationsStartCod: new Date("2027-08-30T12:00:00") },
    },
    locale: "en-GB",
    envVars: {},
    loading: false,
    projectNotFound: false,
  }),
}));

vi.mock("@/features/cost/contracts/hooks", () => ({
  useProjectExtras: () => ({
    data: { countryId: "33333333-3333-3333-3333-333333333333", technology },
    isLoading: false,
  }),
}));

vi.mock("@/features/cost/costing/useCostBook", () => ({
  useLeaseBook: () => ({ data: book, isLoading: loading, error: loadError }),
  useLeaseGenerators: () => ({
    data: [
      { id: "g1", label: "WTG 111_1 - Active", name: "WTG 111_1", order: 1, kind: "wtg" },
      { id: "g2", label: "WTG 111_2 - Active", name: "WTG 111_2", order: 2, kind: "wtg" },
    ],
  }),
  useCurrencies: () => ({ data: [{ id: "c1", name: "Euro", code: "EUR" }] }),
  useCountryInflation: () => ({ data: [{ year: 2028, area: "", inflation: 2 }] }),
  useLeaseAssumptions: () => ({ data: [] }),
  useLeaseWrites: () => ({ mutateAsync, isPending: false }),
}));

/** CA-15 — the project-wide "Cost write in flight" flag and the failure reporter. */
let writeInFlight = false;
const reportFailure = vi.fn((text: string, show?: (t: string) => void) => { show?.(text); });
vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => writeInFlight,
  useWriteFailureReport: () => reportFailure,
}));

import LandLeaseScreen from "./LandLeaseScreen";
import { COST_WRITE_MSG } from "@/domain/writeGuard";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const SUBACCOUNTS = [
  { id: "sa-1", name: "Locations", order: 1 },
  { id: "sa-2", name: "Distance and Rotor Overfly Areas", order: 2 },
  { id: "sa-3", name: "Permanent Access Routes & Crane Pads", order: 3 },
  { id: "sa-4", name: "Cabling and Overhead Lines", order: 4 },
  { id: "sa-5", name: "Substation / Transfer Station", order: 5 },
  { id: "sa-6", name: "Compansation and Replacement Measures", order: 6 },
  { id: "sa-7", name: "Temporary Areas", order: 7 },
  { id: "sa-8", name: "Leaseholders", order: 8 },
  { id: "sa-9", name: "Other", order: 9 },
];

const cost = (over: Partial<LeaseCostRow> & Pick<LeaseCostRow, "id">): LeaseCostRow => ({
  name: "Wirmighausen-Locations-Parcel 12/4",
  description: "Parcel 12/4",
  subaccountId: "sa-1",
  landOwner: "Schmidt",
  currencyId: "c1",
  currencyName: "Euro",
  secured: LAND_LEASE_SECURED.yes,
  allWtgAllocated: false,
  isStandardContract: false,
  isStartDateStandardAssumption: false,
  amountOneTimePayment: null,
  amountOneTimePayment2: null,
  amountOneTimePayment3: null,
  dueDateOneTimePayment: null,
  dueDateOneTimePayment2: null,
  dueDateOneTimePayment3: null,
  useInflationProfile: false,
  useCountryInflationProfile: false,
  inflationProfile: null,
  inflationCountryArea: null,
  inflationStartYear: null,
  createdOn: "2025-01-01",
  ...over,
});

const period = (over: Partial<LeasePeriodRow> & Pick<LeasePeriodRow, "id">): LeasePeriodRow => ({
  name: "Parcel 12/4",
  projectCostId: "cost-1",
  period: LAND_LEASE_PERIOD.period1,
  startDate: "2027-08-30",
  durationYears: 1,
  durationMonths: 0,
  fixedCosts: 1000,
  percentOfRevenues: 20,
  eurPerMwh: null,
  eurPerMw: null,
  eurPerWtg: null,
  aggregation: LAND_LEASE_AGGREGATION.sum,
  distributionFrequency: 3,
  ...over,
});

const Harness = ({ children }: { children: ReactNode }) => (
  <FluentProvider theme={vsbTheme}>{children}</FluentProvider>
);

/** A card's `<section>`, so a toolbar assertion is scoped to one of the nine. */
function card(name: string): HTMLElement {
  const section = screen.getByText(name).closest("section");
  if (!section) throw new Error(`No card for "${name}"`);
  return section as HTMLElement;
}

const openCard = (name: string) => fireEvent.click(screen.getByText(name));

describe("LandLeaseScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loading = false;
    loadError = null;
    writeInFlight = false;
    technology = TECHNOLOGY.wind;
    book = {
      subaccounts: SUBACCOUNTS,
      costs: [cost({ id: "cost-1" })],
      periods: [
        period({ id: "p1" }),
        period({
          id: "p2", name: "Parcel 12/4 - 2", period: LAND_LEASE_PERIOD.period2,
          startDate: "2028-08-30", fixedCosts: 1200, percentOfRevenues: null,
        }),
      ],
      allocations: [],
    };
  });

  it("UT-LLUI-001 renders the nine sub-account cards, all folded", () => {
    render(<Harness><LandLeaseScreen /></Harness>);

    for (const s of SUBACCOUNTS) expect(screen.getByText(s.name)).toBeInTheDocument();
    // `AddColumns('Land Lease Subaccounts', IsFolded, true)` — every card starts COLLAPSED, so
    // no row and no command bar is in the document until one is opened.
    expect(screen.queryByText("Parcel 12/4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lease-newLandLeasePeriodKey")).not.toBeInTheDocument();

    openCard("Locations");
    expect(screen.getByText("Parcel 12/4")).toBeInTheDocument();
  });

  it("UT-LLUI-002 renders the canvas column set, in order, and NOT the OPEX extras", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    const headers = within(card("Locations"))
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "", "Description", "Start Date", "Duration", "", "End Date", "Currency",
      "Inflation Profile", "Fix Costs p.a. [EUR]", "Share of Revenues [%]", "EUR/MWh p.a.",
      "EUR/MW p.a.", "EUR/WTG p.a.", "Aggregation", "Secured", "Allocation", "OTP",
    ]);
    // The two columns the merged screen wrongly gave Land Lease.
    expect(screen.queryByText("Threshold for EUR/MWh p.a.")).not.toBeInTheDocument();
    expect(within(card("Locations")).queryByRole("columnheader", { name: "Distribution Frequency" }))
      .not.toBeInTheDocument();
  });

  it("UT-LLUI-003 renders the cells the merged screen got wrong", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    const rows = within(card("Locations")).getAllByRole("row");
    const period1 = rows[1] as HTMLElement;
    const cells = within(period1).getAllByRole("cell").map((td) => td.textContent);

    // `Secured` is the HEADER's choice — not `standard ? "Yes" : ""`.
    expect(cells).toContain("Yes");
    // Durations never singularise in the grid: `1 years`, not `1 year`.
    expect(cells).toContain("1 years");
    expect(cells).toContain("0 months");
    // Non-scaling percent: a stored 20.00 renders `20.00 %`.
    expect(cells).toContain("20.00 %");
    // `formatFixCosts` groups and drops the decimals.
    expect(cells).toContain("1,000");
    // A NULL rate is blank, and `End Date` is start + duration - 1 day, `dd.mm.yy`.
    expect(cells).toContain("29.08.28");
  });

  it("UT-LLUI-004 gates the five commands, in canvas order", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    const bar = card("Locations");

    expect(
      within(bar).getAllByRole("button")
        .filter((b) => /^lease-[A-Za-z]+LandLease/.test(b.getAttribute("data-testid") ?? ""))
        .map((b) => b.textContent),
    ).toEqual([
      "Add Contract Type", "Add Period", "Add Standard Contract", "Edit", "Delete",
    ]);

    // Nothing selected: Edit and Delete are off, Add Contract Type is on.
    expect(within(bar).getByTestId("lease-EditLandLeasePeriodKey")).toBeDisabled();
    expect(within(bar).getByTestId("lease-deleteLandLeasePeriodKey")).toBeDisabled();
    expect(within(bar).getByTestId("lease-newLandLeaseContractKey")).toBeEnabled();
    // No assumption matches this country/technology, so the import stays off.
    expect(within(bar).getByTestId("lease-AddLandLeaseStandardContractKey")).toBeDisabled();
  });

  it("UT-LLUI-005 selects a row, and clicking it again deselects", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    fireEvent.click(screen.getByTestId("lease-select-p1"));
    expect(screen.getByTestId("lease-select-p1")).toBeChecked();
    expect(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey")).toBeEnabled();

    // `btn_…_TransparentButton_2.OnSelect` — the same row deselects.
    fireEvent.click(screen.getByTestId("lease-select-p1"));
    expect(screen.getByTestId("lease-select-p1")).not.toBeChecked();
    expect(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey")).toBeDisabled();
  });

  it("UT-LLUI-006 offers Add Period on every period, following the contract's LAST one (27 Oct 2026)", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    fireEvent.click(screen.getByTestId("lease-select-p2"));
    expect(within(card("Locations")).getByTestId("lease-newLandLeasePeriodKey")).toBeEnabled();

    fireEvent.click(screen.getByTestId("lease-select-p1"));
    expect(within(card("Locations")).getByTestId("lease-newLandLeasePeriodKey")).toBeEnabled();

    // Period 1 is selected, but the new period continues from Period 2.
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeasePeriodKey"));
    expect(screen.getByDisplayValue("Parcel 12/4 - 3")).toBeInTheDocument();
  });

  it("UT-LLUI-007 titles the panel 'Edit Contract' on Period 1 and 'Edit Period' after it", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    fireEvent.click(screen.getByTestId("lease-select-p1"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));
    expect(screen.getByText("Edit Contract - Locations")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close panel"));

    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));
    expect(screen.getByText("Edit Period - Locations")).toBeInTheDocument();
  });

  it("UT-LLUI-008 titles a brand-new contract 'Add Contract' and prefills the project COD", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey"));

    expect(screen.getByText("Add Contract - Locations")).toBeInTheDocument();
    // `dte_…_StartDate_1.Format: LongAbbreviated` — the canvas date picker's text, not ISO.
    expect(screen.getByTestId("lease-start")).toHaveValue("Mon, Aug 30, 2027");
    // A new contract may edit the header, so the reset icon is offered.
    expect(screen.getByTestId("lease-reset-start")).toBeInTheDocument();
  });

  it("UT-LLUI-009 disables the header section on a period that does not own it", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));

    // `headerEditable` — Period 2 cannot rewrite the contract, so Secured and the inflation
    // toggle are disabled, and the reset icon is gone entirely. The start date is the PERIOD's
    // own and stays editable: `dte_…_StartDate_1` sets no `DisplayMode` (LL:2336).
    expect(screen.getByTestId("lease-secured")).toBeDisabled();
    expect(screen.getByTestId("lease-inflation")).toBeDisabled();
    expect(screen.getByTestId("lease-start")).not.toBeDisabled();
    expect(screen.queryByTestId("lease-reset-start")).not.toBeInTheDocument();
    // The period's own fields stay editable.
    expect(screen.getByTestId("lease-frequency")).not.toBeDisabled();
  });

  it("UT-LLUI-010 hides BOTH allocation controls for a non-PV/Wind technology", () => {
    technology = TECHNOLOGY.wind;
    const wind = render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey"));
    expect(screen.getByTestId("lease-all-wtg")).toBeInTheDocument();
    expect(screen.getByTestId("lease-allocation")).toBeInTheDocument();
    wind.unmount();

    technology = TECHNOLOGY.bess;
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey"));
    expect(screen.queryByTestId("lease-all-wtg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lease-allocation")).not.toBeInTheDocument();
  });

  it("UT-LLUI-011 asks 'Delete Land Lease?' on Period 1 and 'Delete Period?' after it", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-deleteLandLeasePeriodKey"));
    let dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete Period?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Period 2 expense in the "Parcel 12\/4 - 2"/))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Cancel"));

    fireEvent.click(screen.getByTestId("lease-select-p1"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-deleteLandLeasePeriodKey"));
    dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete Land Lease?")).toBeInTheDocument();
    expect(within(dialog).getByText(/and all related Periods\?/)).toBeInTheDocument();
    // Nothing is written until the confirm is pressed.
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("UT-LLUI-012 deletes a Period-1 contract children-first on confirm", async () => {
    book.allocations = [
      { id: "a1", projectCostId: "cost-1", generatorInProjectId: "g1" },
    ];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p1"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-deleteLandLeasePeriodKey"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Delete"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect((mutateAsync.mock.calls[0] as unknown as [unknown[]])[0]).toEqual([
      { op: "delete", entitySet: "vsb_landleaseallocationwtgs", id: "a1" },
      { op: "delete", entitySet: "vsb_landleaseperiods", id: "p1" },
      { op: "delete", entitySet: "vsb_landleaseperiods", id: "p2" },
      { op: "delete", entitySet: "vsb_landleaseprojectcosts", id: "cost-1" },
    ]);
  });

  it("UT-LLUI-013 blocks Save until the form satisfies the canvas gate", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey"));

    // Blank description plus no commercial figure — the hint is the visible half of the block.
    expect(screen.getByText("Please fill in at least one commercial figure")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("UT-LLUI-014 refuses a description containing the reserved word 'standard'", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey"));

    // The Description box is the only one with the canvas' 55-character `MaxLength`.
    const description = document.querySelector('input[maxlength="55"]') as HTMLInputElement;
    fireEvent.change(description, { target: { value: "Non-standard lease" } });
    expect(
      screen.getByText('The term "Standard" is applicable only for system-prefilled contracts.'),
    ).toBeInTheDocument();
  });

  it("UT-LLUI-015 renders without a Griffel or hook-order failure, loading or loaded", () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args); });
    loading = true;
    const { rerender, unmount } = render(<Harness><LandLeaseScreen /></Harness>);
    loading = false;
    rerender(<Harness><LandLeaseScreen /></Harness>);
    expect(screen.getByText("Locations")).toBeInTheDocument();
    unmount();
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it("UT-LLUI-016 says the data is unavailable when the lease book fails to load", () => {
    // Before this, a failed read rendered nine empty cards — indistinguishable from no leases.
    loadError = new Error("503");
    render(<Harness><LandLeaseScreen /></Harness>);
    expect(screen.getByText("Cost data is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Locations")).not.toBeInTheDocument();
  });

  /* ── D57: no spinner; a status line and a write guard instead ────────── */

  const WRITE_COMMAND_IDS = [
    "lease-newLandLeaseContractKey", "lease-newLandLeasePeriodKey",
    "lease-AddLandLeaseStandardContractKey", "lease-EditLandLeasePeriodKey",
    "lease-deleteLandLeasePeriodKey",
  ];
  const writeCommands = (name: string) =>
    WRITE_COMMAND_IDS.map((id) => within(card(name)).getByTestId(id));

  /** D59: the blocking write spinner is the only `role="dialog"` once the panel has closed. */
  const expectBlocking = (text: string) => {
    const overlay = screen.getByTestId("land-lease-write-status");
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    expect(overlay).toHaveTextContent(text);
    expect(overlay.querySelector(".fui-Spinner")).not.toBeNull();
    expect(screen.getAllByRole("dialog")).toEqual([overlay]);
  };
  const expectIdle = () => {
    const status = screen.getByTestId("land-lease-write-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toBeEmptyDOMElement();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  };

  it("UT-LEASE-NOSPIN-005 the first load renders a busy page with the inline spinner: no error, no rows", () => {
    loading = true;
    render(<Harness><LandLeaseScreen /></Harness>);

    const inline = screen.getByTestId("land-lease-loading");
    expect(inline).toHaveAttribute("role", "status");
    expect(inline).toHaveAttribute("aria-busy", "true");
    expect(inline.querySelector(".fui-Spinner")).not.toBeNull();
    expect(inline).toHaveTextContent("Loading Land Lease…");
    expect(screen.queryByText("Cost data is unavailable")).not.toBeInTheDocument();
    // Nothing from the book shows until the load has finished.
    expect(screen.queryByText("Locations")).not.toBeInTheDocument();
    expect(screen.queryByText("Parcel 12/4")).not.toBeInTheDocument();
    expectIdle();
  });

  it("UT-LEASE-NOSPIN-006 a delete shows its canvas text on the blocking spinner and guards the writes", async () => {
    let finish: () => void = () => {};
    mutateAsync.mockImplementationOnce(
      () => new Promise((r) => { finish = () => r({ createdIds: {} }); }),
    );
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p1"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-deleteLandLeasePeriodKey"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Delete"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // The dialog closed first; the blocking spinner names the write, verbatim.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expectBlocking("Deleting Land Lease cost...");
    expect(screen.getByRole("status")).toHaveTextContent("Deleting Land Lease cost...");
    // Every write command is off; selecting a row and folding a card are not.
    for (const c of writeCommands("Locations")) expect(c).toBeDisabled();
    expect(screen.getByTestId("lease-select-p2")).toBeEnabled();
    expect(screen.getByTestId("leasecard-Other")).toBeEnabled();

    await act(async () => { finish(); });
    expectIdle();
    expect(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey")).toBeEnabled();
  });

  it("UT-LEASE-NOSPIN-007 a panel save closes the panel first, then shows the blocking spinner", async () => {
    let finish: () => void = () => {};
    mutateAsync.mockImplementationOnce(
      () => new Promise((r) => { finish = () => r({ createdIds: {} }); }),
    );
    // A wind contract needs an allocation before its Save gate opens.
    book.costs = [cost({ id: "cost-1", allWtgAllocated: true })];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // The panel is gone: the spinner is the only dialog left.
    expectBlocking("Saving Land Lease Contract...");
    for (const c of writeCommands("Locations")) expect(c).toBeDisabled();
    // A second click on a guarded command starts nothing.
    fireEvent.click(within(card("Locations")).getByTestId("lease-newLandLeaseContractKey"));
    expectBlocking("Saving Land Lease Contract...");

    await act(async () => { finish(); });
    expectIdle();
  });

  it("UT-LEASE-BUSY-001 the blocking spinner stays up through other clicks and goes only when the write resolves", async () => {
    let finish: () => void = () => {};
    mutateAsync.mockImplementationOnce(
      () => new Promise((r) => { finish = () => r({ createdIds: {} }); }),
    );
    book.costs = [cost({ id: "cost-1", allWtgAllocated: true })];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expectBlocking("Saving Land Lease Contract...");
    // Selecting, folding a card and a guarded click do not dismiss it.
    fireEvent.click(screen.getByTestId("lease-select-p1"));
    fireEvent.click(screen.getByTestId("leasecard-Other"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-deleteLandLeasePeriodKey"));
    expectBlocking("Saving Land Lease Contract...");
    await act(async () => { finish(); });
    expectIdle();
  });

  it("UT-LEASE-BUSY-002 the blocking spinner also goes when the write REJECTS, and the error banner shows", async () => {
    let fail: (e: Error) => void = () => {};
    mutateAsync.mockImplementationOnce(
      () => new Promise((_r, reject) => { fail = reject; }),
    );
    book.costs = [cost({ id: "cost-1", allWtgAllocated: true })];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expectBlocking("Saving Land Lease Contract...");
    await act(async () => { fail(new Error("HTTP 403")); });
    expectIdle();
    expect(screen.getByText("HTTP 403", { exact: false })).toBeInTheDocument();
  });
  /* ── CA-15 / CA-17: writes that outlive the screen, selection made mid-write ─ */

  /** Holds the next write open; returns the function that lets it succeed. */
  const holdNextWrite = () => {
    let finish: () => void = () => {};
    mutateAsync.mockImplementationOnce(
      () => new Promise((r) => { finish = () => r({ createdIds: {} }); }),
    );
    return async () => { await act(async () => { finish(); }); };
  };
  /** Edit Period 2 and press Save (a wind contract needs its allocation for the gate). */
  const editP2 = () => {
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));
  };
  const clickSave = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const saveP2 = () => { editP2(); clickSave(); };

  it("UT-LEASE-FLIGHT-001 a Cost write in flight from another screen greys every command and says so", () => {
    writeInFlight = true;
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p1"));
    for (const c of writeCommands("Locations")) expect(c).toBeDisabled();
    expect(screen.getByTestId("land-lease-write-status"))
      .toHaveTextContent(COST_WRITE_MSG.writeRunningElsewhere);
    // Selecting stays live.
    expect(screen.getByTestId("lease-select-p1")).toBeChecked();
  });

  it("UT-LEASE-FLIGHT-002 a failed save goes through the reporter with the screen's own text", async () => {
    mutateAsync.mockImplementationOnce(async () => { throw new Error("HTTP 403"); });
    book.costs = [cost({ id: "cost-1", allWtgAllocated: true })];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    editP2();
    await act(async () => { clickSave(); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledTimes(1);
    const text = reportFailure.mock.calls[0]?.[0] as string;
    expect(text).toContain("HTTP 403");
    // Mounted: the reporter put the same text on the screen's banner.
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
  });

  it("UT-LEASE-SEL-010 a row selected while a save runs is still selected when it ends", async () => {
    const finish = holdNextWrite();
    book.costs = [cost({ id: "cost-1", allWtgAllocated: true })];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    saveP2();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("lease-select-p1"));
    expect(screen.getByTestId("lease-select-p1")).toBeChecked();
    await finish();
    expect(screen.getByTestId("lease-select-p1")).toBeChecked();
  });

  it("UT-LEASE-SEL-011 the selection the save started with is still cleared (LL:5895)", async () => {
    const finish = holdNextWrite();
    book.costs = [cost({ id: "cost-1", allWtgAllocated: true })];
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    saveP2();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("lease-select-p2")).toBeChecked();
    await finish();
    expect(screen.getByTestId("lease-select-p2")).not.toBeChecked();
  });

  it("UT-LEASE-SEL-012 mid-delete: a row of another contract is kept, a row of the deleted one is not", async () => {
    book.costs = [cost({ id: "cost-1" }), cost({ id: "cost-2", description: "Parcel 9", name: "Wirmighausen-Locations-Parcel 9" })];
    book.periods = [...book.periods, period({ id: "p3", projectCostId: "cost-2", name: "Parcel 9" })];
    const deleteP1 = () => {
      fireEvent.click(screen.getByTestId("lease-select-p1"));
      fireEvent.click(within(card("Locations")).getByTestId("lease-deleteLandLeasePeriodKey"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Delete"));
      // The delete really started (and is held open by `holdNextWrite`).
      expect(screen.getByTestId("land-lease-write-status")).toHaveTextContent("Deleting Land Lease cost...");
    };

    let finish = holdNextWrite();
    const view = render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    deleteP1();
    fireEvent.click(screen.getByTestId("lease-select-p3"));
    await finish();
    expect(screen.getByTestId("lease-select-p3")).toBeChecked();
    view.unmount();

    finish = holdNextWrite();
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    deleteP1();
    // Period 2 belongs to the contract the delete removes.
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    await finish();
    expect(screen.getByTestId("lease-select-p2")).not.toBeChecked();
  });
});
