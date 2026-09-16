// @vitest-environment jsdom
/**
 * Render tests for the Land Lease screen.
 *
 * `landLeaseRules.test.ts` covers the 169 decisions (UT-LAND-001..129); this file covers the
 * WIRING — that the right rule reaches the right control. Every assertion here is one the
 * merged `Screen.tsx` would have failed, or one the canvas screenshots show directly.
 *
 * The data hooks are mocked rather than the Power Platform host:
 * `@/features/costing/useCostBook` is the screen's only data dependency (the Land Lease queries
 * moved behind `costRepository` into `@/data/landLease`), and stubbing it keeps the test about
 * composition.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("@/features/contracts/hooks", () => ({
  useProjectExtras: () => ({
    data: { countryId: "33333333-3333-3333-3333-333333333333", technology },
    isLoading: false,
  }),
}));

vi.mock("@/features/costing/useCostBook", () => ({
  useLeaseBook: () => ({ data: book, isLoading: loading, error: null }),
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

import LandLeaseScreen from "./LandLeaseScreen";

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

  it("UT-LLUI-006 offers Add Period only on the LAST period of a contract", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");

    fireEvent.click(screen.getByTestId("lease-select-p1"));
    expect(within(card("Locations")).getByTestId("lease-newLandLeasePeriodKey")).toBeDisabled();

    fireEvent.click(screen.getByTestId("lease-select-p2"));
    expect(within(card("Locations")).getByTestId("lease-newLandLeasePeriodKey")).toBeEnabled();
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
    expect(screen.getByTestId("lease-start")).toHaveValue("2027-08-30");
    // A new contract may edit the header, so the reset icon is offered.
    expect(screen.getByTestId("lease-reset-start")).toBeInTheDocument();
  });

  it("UT-LLUI-009 disables the header section on a period that does not own it", () => {
    render(<Harness><LandLeaseScreen /></Harness>);
    openCard("Locations");
    fireEvent.click(screen.getByTestId("lease-select-p2"));
    fireEvent.click(within(card("Locations")).getByTestId("lease-EditLandLeasePeriodKey"));

    // `headerEditable` — Period 2 cannot rewrite the contract, so Secured, the inflation
    // toggle and the start date are all disabled, and the reset icon is gone entirely.
    expect(screen.getByTestId("lease-secured")).toBeDisabled();
    expect(screen.getByTestId("lease-inflation")).toBeDisabled();
    expect(screen.getByTestId("lease-start")).toBeDisabled();
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
});
