// @vitest-environment jsdom
/**
 * Render tests for the OPEX screen — `Operation & Maintenance` and `Other OPEX Costs`.
 *
 * `opexRules.test.ts` covers the 153 decisions (UT-OPEX-001…099); this file covers the WIRING:
 * that the card shell matches the two gallery screenshots, that each mode's command bar reaches
 * the gate `opexCommands` computes, that row selection TOGGLES, and that the Add/Edit panel
 * renders the canvas' field order and its conditional asterisks.
 *
 * Every hook the screen reaches for is mocked, so the test needs neither a Power Platform host
 * nor a QueryClient.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { vsbTheme } from "@/theme/fluent";
import type { CostBook, CostPeriod } from "@/features/costing/model";
import { DELETE_DIALOG, OPEX_MSG, deleteDialogText } from "./opexRules";

/* ───────────────────────────────────────────────────────────────── fixtures */

const save = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const addStandard = { mutate: vi.fn(), isPending: false };
let book: CostBook | undefined;
let loading = false;
/**
 * `Filter('OPEX & Land Lease Standard Assumptions', Country && Technology && 'Type Of Contract'
 * [&& 'Opex Subaccount'])` — the catalogue the `Add Standard Contract` gate tests against.
 * `hasStandardAssumption` used to be hard-coded `true`.
 */
let assumptionScopes: {
  id: string; typeOfContract: number | null; countryId: string | null;
  technology: number | null; opexSubaccountId: string | null;
}[] = [];

const project = {
  projectId: "p",
  projectIdCode: "P-1",
  projectName: "Wirmighausen",
  countryName: "Germany",
  isoCurrencyCode: "EUR",
  owningBusinessUnitId: "bu-1",
  startDate: new Date(2027, 7, 30, 12),
  endDate: new Date(2057, 7, 29, 12),
  milestones: { operationsStartCod: new Date(2027, 7, 30, 12) },
};

/**
 * `colOpexAccounts` / `colOpexSubaccounts`, as `loadOpexAccounts` / `loadOpexSubaccounts` return
 * them — measured on VSBCloud_Dev, 16 Sep. The screen used to carry these as constants.
 */
const OPEX_ACCOUNTS = [
  { id: "acct-om", name: "Operation & Maintenance", order: 1 },
  { id: "acct-other", name: "Other OPEX Costs", order: 2 },
];
const OPEX_SUBACCOUNTS = [
  { id: "sub-om", name: "Operation & Maintenance", order: 1,
    accountId: "acct-om", accountName: "Operation & Maintenance" },
  ...[
    "Technical Commercial Management Agreement (TCMA)",
    "Environmental and Compensation Meassures",
    "Administration",
    "Insurance",
    "Own Power Consumption",
    "Infrastructure",
    "Municipality",
    "Other",
  ].map((name, i) => ({
    id: `sub-${i}`, name, order: i + 1,
    accountId: "acct-other", accountName: "Other OPEX Costs",
  })),
];

/**
 * `colDeviceTypesInProject` as `loadOpexDeviceTypes` returns it — `[generators, pvModules]`.
 *
 * `displayName` is the resolved `Generator.'Turbine Type'` / PV `Label`, which is what the card
 * header renders; `name` is the device row's `vsb_name`, which is what the cost book groups on
 * and what `resolveDeviceType` resolves a save against. They are deliberately EQUAL in this
 * default fixture so the other cases can keep addressing cards by their group name;
 * UT-OPEXUI-027 makes them differ.
 */
let deviceTypes: [Record<string, unknown>[], Record<string, unknown>[]] = [[], []];

vi.mock("@/features/costing/useCostBook", () => ({
  useCostBook: () => ({ data: book, isLoading: loading, error: null, save, projectId: "p" }),
  useAddStandardContract: () => addStandard,
  useCountryInflationAreas: () => ({ data: ["North", "Centre - North"] }),
  useCountryInflation: () => ({ data: [{ year: 2028, area: "", inflation: 2.1 }] }),
  useOpexCatalog: () => ({
    accounts: OPEX_ACCOUNTS, subaccounts: OPEX_SUBACCOUNTS, isLoading: false,
  }),
  useOpexDeviceTypes: () => ({ data: deviceTypes }),
  useOpexAssumptionScopes: () => ({ data: assumptionScopes }),
}));
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ project, projectId: "p", locale: "en-GB", loading: false }),
}));
vi.mock("@/features/contracts/hooks", () => ({
  useProjectExtras: () => ({ data: { countryId: "country-de", technology: 1 } }),
}));

import OpexScreen from "./OpexScreen";

const period = (
  over: Partial<CostPeriod> & Pick<CostPeriod, "id" | "mode" | "group" | "description">,
): CostPeriod => ({
  startDate: "2027-08-30", years: 5, months: 0, currency: "Euro",
  fixed: 0, revenue: 0, perMwh: 1.4, perMw: 0, perWtg: 67500,
  aggregation: "SUM", frequency: 3, inflation: true, countryInflation: false,
  inflationYear: 2028, inflationPercent: 2, threshold: false, align: false,
  external: true, standard: false, ...over,
});

const makeBook = (periods: CostPeriod[]): CostBook => ({
  accounts: [], lines: [], periods, extraGroups: { om: [], land: [], other: [] },
});

const Harness = ({ children }: { children: ReactNode }) => (
  <FluentProvider theme={vsbTheme}>{children}</FluentProvider>
);

/** The card a title belongs to — several cards are on screen and each owns a toolbar. */
function card(title: string): HTMLElement {
  const section = screen.getByText(title).closest("section");
  if (!section) throw new Error(`No card for "${title}"`);
  return section as HTMLElement;
}

const open = (title: string) => fireEvent.click(screen.getByText(title));

/** The open Add/Edit panel. */
const panel = () => screen.getByRole("dialog");

/** Asserts `needles` appear in this order in `haystack`. */
function expectOrder(haystack: string, needles: readonly string[]) {
  let at = -1;
  for (const needle of needles) {
    const found = haystack.indexOf(needle, at + 1);
    expect(found, `"${needle}" after position ${at}`).toBeGreaterThan(at);
    at = found;
  }
}

/* ─────────────────────────────────────────────────────────────────── tests */

describe("OpexScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loading = false;
    save.isPending = false;
    addStandard.isPending = false;
    // WTG types first, in the matching GENERATOR's `Created On` order; PV types appended.
    deviceTypes = [
      [{ id: "dev-wtg", name: "WTG V150-6.0", typeInProjectId: "gt-1",
        createdOn: "2024-01-01T00:00:00Z", displayName: "WTG V150-6.0" }],
      [{ id: "dev-pv", name: "PV Module A", typeInProjectId: "pt-1",
        createdOn: null, displayName: "PV Module A" }],
    ];
    // Every scope has a catalogue unless a case says otherwise: `typeOfContract` 952850001 is
    // `Opex O&M` and 952850002 is `Opex Other`, measured 16 Sep.
    assumptionScopes = [
      { id: "a-om", typeOfContract: 952850001, countryId: "country-de", technology: 1,
        opexSubaccountId: null },
      ...OPEX_SUBACCOUNTS.filter((s) => s.accountId === "acct-other").map((s) => ({
        id: `a-${s.id}`, typeOfContract: 952850002, countryId: "country-de", technology: 1,
        opexSubaccountId: s.id,
      })),
    ];
    book = makeBook([
      // A two-period O&M chain on a WTG device card. `Left(Name, 3) = "WTG"` is what makes the
      // card a Generator, which is what keeps the EUR/WTG field in the panel.
      period({ id: "om-1", mode: "om", group: "WTG V150-6.0",
        description: "Initialized O&M Contract", periodIndex: 1, contractId: "om-1" }),
      period({ id: "om-2", mode: "om", group: "WTG V150-6.0",
        description: "Initialized O&M Contract - 2", startDate: "2032-08-30",
        parentId: "om-1", contractId: "om-1", periodIndex: 2 }),
      // A PV device card — `deviceTypeList` appends PV types after every WTG type.
      period({ id: "om-3", mode: "om", group: "PV Module A",
        description: "Standard Operation & Maintenance", standard: true,
        countryInflation: true }),
      period({ id: "om-4", mode: "om", group: "PV Module A",
        description: "PV Service", periodIndex: 1, contractId: "om-4" }),
      period({ id: "other-1", mode: "other", group: "Insurance",
        description: "All-Risk Insurance", periodIndex: 1, contractId: "other-1" }),
    ]);
  });

  /* ── the card shell ─────────────────────────────────────────────────── */

  it("UT-OPEXUI-001 renders one O&M card per device, WTG types first, first card open", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);

    const titles = [...document.querySelectorAll("section")]
      .map((s) => s.querySelector("button")?.textContent ?? "");
    expect(titles[0]).toContain("WTG V150-6.0");
    expect(titles[1]).toContain("PV Module A");

    // The leading card is open, the rest are collapsed and their rows are not in the document.
    expect(screen.getByText("Initialized O&M Contract")).toBeInTheDocument();
    expect(screen.queryByText("Standard Operation & Maintenance")).not.toBeInTheDocument();

    open("PV Module A");
    expect(screen.getByText("Standard Operation & Maintenance")).toBeInTheDocument();
  });

  it("UT-OPEXUI-002 renders the Other OPEX sub-accounts in vsb_order, never alphabetically", () => {
    render(<Harness><OpexScreen mode="other" /></Harness>);

    const titles = [...document.querySelectorAll("section")]
      .map((s) => s.querySelector("button")?.textContent ?? "");
    expect(titles).toEqual([
      "Technical Commercial Management Agreement (TCMA)",
      "Environmental and Compensation Meassures",
      "Administration",
      "Insurance",
      "Own Power Consumption",
      "Infrastructure",
      "Municipality",
      "Other",
    ]);
    // A card with no costs still renders — and renders no table, as the reference shows.
    expect(within(card("Technical Commercial Management Agreement (TCMA)"))
      .queryByRole("table")).not.toBeInTheDocument();
  });

  it("UT-OPEXUI-003 shows only this mode's costs", () => {
    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");

    expect(screen.getByText("All-Risk Insurance")).toBeInTheDocument();
    expect(screen.queryByText("Initialized O&M Contract")).not.toBeInTheDocument();
  });

  it("UT-OPEXUI-004 tells the user to add a generator when O&M has no device cards", () => {
    // A project with no device types at all — the cards come from `colDeviceTypesInProject`
    // now, not from whatever device names the cost book happens to mention.
    deviceTypes = [[], []];
    book = makeBook((book?.periods ?? []).filter((p) => p.mode === "other"));
    render(<Harness><OpexScreen mode="om" /></Harness>);

    expect(screen.getByText(OPEX_MSG.noGenerators)).toBeInTheDocument();
    expect(document.querySelector("section")).toBeNull();
  });

  /* ── columns ────────────────────────────────────────────────────────── */

  it("UT-OPEXUI-005 gives O&M the Threshold column and Other OPEX none, with the canvas order", () => {
    const { unmount } = render(<Harness><OpexScreen mode="om" /></Harness>);
    const headers = within(card("WTG V150-6.0")).getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "", "Description", "Start Date", "Duration", "", "End Date", "Currency",
      "Inflation Profile", "Fix Costs p.a. [EUR]", "Share of Revenues [%]",
      "Threshold for EUR/MWh p.a.", "EUR/MWh p.a.", "EUR/MW p.a.", "EUR/WTG p.a.",
      "Aggregation", "Distribution Frequency",
    ]);
    unmount();

    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    expect(within(card("Insurance")).queryByText("Threshold [MWh]")).not.toBeInTheDocument();
    expect(within(card("Insurance")).queryByText(/^Threshold for/)).not.toBeInTheDocument();
  });

  /* ── the command bars ───────────────────────────────────────────────── */

  it("UT-OPEXUI-006 gives O&M four commands and Other OPEX five", () => {
    const { unmount } = render(<Harness><OpexScreen mode="om" /></Harness>);
    const om = within(card("WTG V150-6.0"));
    expect(om.queryByTestId("opex-newOpexProjectCostType")).not.toBeInTheDocument();
    for (const key of ["newOpexProjectCost", "addStandardContract",
      "editOpexProjectCost", "deleteOpexProjectCost"]) {
      expect(om.getByTestId(`opex-${key}`)).toBeInTheDocument();
    }
    unmount();

    render(<Harness><OpexScreen mode="other" /></Harness>);
    const other = within(card("Insurance"));
    open("Insurance");
    expect(other.getByTestId("opex-newOpexProjectCostType")).toBeInTheDocument();
    expect(other.getByText("Add Contract Type")).toBeInTheDocument();
  });

  it("UT-OPEXUI-007 enables Edit and Delete only once this card owns a selection", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    const scope = within(card("WTG V150-6.0"));

    expect(scope.getByTestId("opex-editOpexProjectCost")).toBeDisabled();
    expect(scope.getByTestId("opex-deleteOpexProjectCost")).toBeDisabled();

    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    expect(scope.getByTestId("opex-editOpexProjectCost")).toBeEnabled();
    expect(scope.getByTestId("opex-deleteOpexProjectCost")).toBeEnabled();

    // A card that does not own the selection stays disabled.
    open("PV Module A");
    expect(within(card("PV Module A")).getByTestId("opex-editOpexProjectCost")).toBeDisabled();
  });

  it("UT-OPEXUI-008 O&M requires the chain's LAST period for Add Period; Other OPEX does not", () => {
    const { unmount } = render(<Harness><OpexScreen mode="om" /></Harness>);
    const scope = within(card("WTG V150-6.0"));

    // Nothing selected on a card that already has costs — the canvas' first disjunct fails.
    expect(scope.getByTestId("opex-newOpexProjectCost")).toBeDisabled();

    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    expect(scope.getByTestId("opex-newOpexProjectCost")).toBeDisabled();

    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    expect(scope.getByTestId("opex-newOpexProjectCost")).toBeEnabled();
    unmount();

    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    fireEvent.click(screen.getByTestId("opex-select-other-1"));
    expect(within(card("Insurance")).getByTestId("opex-newOpexProjectCost")).toBeEnabled();
  });

  it("UT-OPEXUI-009 blocks Add Contract Type on the card that owns the selection", () => {
    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    const scope = within(card("Insurance"));

    expect(scope.getByTestId("opex-newOpexProjectCostType")).toBeEnabled();
    fireEvent.click(screen.getByTestId("opex-select-other-1"));
    expect(scope.getByTestId("opex-newOpexProjectCostType")).toBeDisabled();
    // Every OTHER card is still free.
    expect(within(card("Administration")).queryByTestId("opex-newOpexProjectCostType")).toBeNull();
  });

  it("UT-OPEXUI-010 disables Add Standard Contract once the card holds a cost", () => {
    render(<Harness><OpexScreen mode="other" /></Harness>);
    expect(
      within(card("Technical Commercial Management Agreement (TCMA)"))
        .getByTestId("opex-addStandardContract"),
    ).toBeEnabled();

    open("Insurance");
    expect(within(card("Insurance")).getByTestId("opex-addStandardContract")).toBeDisabled();
  });

  /* ── row selection ──────────────────────────────────────────────────── */

  it("UT-OPEXUI-011 toggles the row selection — a second click clears it", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    const scope = within(card("WTG V150-6.0"));

    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    expect(screen.getByTestId("opex-select-om-2")).toBeChecked();
    expect(scope.getByTestId("opex-editOpexProjectCost")).toBeEnabled();

    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    expect(screen.getByTestId("opex-select-om-2")).not.toBeChecked();
    expect(scope.getByTestId("opex-editOpexProjectCost")).toBeDisabled();

    // Selecting a different row moves the selection rather than clearing it.
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    expect(screen.getByTestId("opex-select-om-1")).not.toBeChecked();
    expect(screen.getByTestId("opex-select-om-2")).toBeChecked();
  });

  it("UT-OPEXUI-012 renders an imported standard row italic and in the link colour", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    open("PV Module A");
    const row = screen.getByText("Standard Operation & Maintenance").closest("tr");
    expect(row).not.toBeNull();
    expect(getComputedStyle(row as HTMLElement).fontStyle).toBe("italic");
  });

  /* ── the panel ──────────────────────────────────────────────────────── */

  it("UT-OPEXUI-013 titles the panel the way the canvas header does", () => {
    const { unmount } = render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-newOpexProjectCost"));
    expect(screen.getByText("Add Period - WTG V150-6.0")).toBeInTheDocument();
    unmount();

    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-editOpexProjectCost"));
    expect(screen.getByText("Edit Period - WTG V150-6.0")).toBeInTheDocument();
  });

  it("UT-OPEXUI-014 calls a brand-new Other OPEX chain a Cost Type, not a Period", () => {
    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    fireEvent.click(within(card("Insurance")).getByTestId("opex-newOpexProjectCostType"));
    expect(screen.getByText("Add Cost Type - Insurance")).toBeInTheDocument();
  });

  it("UT-OPEXUI-015 lays the panel out in the canvas' field order", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-newOpexProjectCost"));

    const body = panel().textContent ?? "";
    expectOrder(body, [
      // con_…_Body_ColumnLeft
      "Description", "Start Date", "Duration", "Currency", "Fix Costs p.a. [EUR]",
      "Share of Revenues [%]", "EUR/MWh p.a.", "EUR/MW p.a.", "EUR/WTG p.a.",
      "Aggregation", "Distribution Frequency",
      // con_…_Body_ColumnRight
      "Inflation Profile", "Country Inflation Profile", "Inflation Start Year",
      "Custom Inflation Profile [%]", "Threshold for EUR/MWh p.a.",
      "Align with Project Duration", "External Contract",
    ]);
  });

  it("UT-OPEXUI-016 marks Description required only while adding, and never on an edit", () => {
    const { unmount } = render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    fireEvent.click(within(card("Insurance")).getByTestId("opex-newOpexProjectCostType"));
    expect(within(panel()).getByText("Description").getAttribute("data-required")).toBe("true");
    // `opexFormErrors` reports the blank the canvas' Save gate enforces silently.
    expect(within(panel()).getByText("Value cannot be blank")).toBeInTheDocument();
    unmount();

    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    fireEvent.click(screen.getByTestId("opex-select-other-1"));
    fireEvent.click(within(card("Insurance")).getByTestId("opex-editOpexProjectCost"));
    expect(within(panel()).getByText("Description").getAttribute("data-required"))
      .not.toBe("true");
  });

  it("UT-OPEXUI-017 starts the unconditional asterisks with a *", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-editOpexProjectCost"));

    const scope = within(panel());
    for (const label of ["Start Date", "Duration", "Currency", "Aggregation",
      "Distribution Frequency"]) {
      expect(scope.getByText(label).parentElement?.textContent).toBe(`*${label}`);
    }
  });

  it("UT-OPEXUI-018 offers 0-35 years, 0-11 months and three aggregations including MIN", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-editOpexProjectCost"));

    // Left column, in DOM order: years · months · currency · aggregation · frequency.
    const combos = within(panel()).getAllByRole("combobox");
    expect(combos).toHaveLength(5);

    fireEvent.click(combos[0] as HTMLElement);
    const years = screen.getAllByRole("option").map((o) => o.textContent);
    // `drp_…_DurationYears.Items: ForAll(Sequence(36), …)` — and defect O-11's "0 year".
    expect(years).toHaveLength(36);
    expect(years[0]).toBe("0 year");
    expect(years[1]).toBe("1 years");
    expect(years[35]).toBe("35 years");
    fireEvent.click(combos[0] as HTMLElement);

    fireEvent.click(combos[1] as HTMLElement);
    const months = screen.getAllByRole("option").map((o) => o.textContent);
    expect(months).toHaveLength(12);
    expect(months[1]).toBe("1 month");
    fireEvent.click(combos[1] as HTMLElement);

    // Three options, not two: `Choices('Opex Aggregation')` also has MIN.
    fireEvent.click(combos[3] as HTMLElement);
    expect(screen.getAllByRole("option").map((o) => o.textContent))
      .toEqual(["SUM", "MAX", "MIN"]);
  });

  it("UT-OPEXUI-019 shows the Threshold block in O&M only", () => {
    const { unmount } = render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-editOpexProjectCost"));
    expect(within(panel()).getByTestId("opex-threshold")).toBeInTheDocument();
    unmount();

    render(<Harness><OpexScreen mode="other" /></Harness>);
    open("Insurance");
    fireEvent.click(screen.getByTestId("opex-select-other-1"));
    fireEvent.click(within(card("Insurance")).getByTestId("opex-editOpexProjectCost"));
    expect(within(panel()).queryByTestId("opex-threshold")).not.toBeInTheDocument();
  });

  it("UT-OPEXUI-020 hides EUR/WTG for a device the canvas reads as a PV module", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    open("PV Module A");
    fireEvent.click(screen.getByTestId("opex-select-om-4"));
    fireEvent.click(within(card("PV Module A")).getByTestId("opex-editOpexProjectCost"));

    // `addPeriodRecordType("PV Module A")` is `"PVModule"`, so `showEurPerWtgField` is false.
    const body = panel().textContent ?? "";
    expect(body).toContain("EUR/MW p.a.");
    expect(body).not.toContain("EUR/WTG p.a.");
  });

  it("UT-OPEXUI-021 swaps the inflation control for a read-only country name", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-editOpexProjectCost"));

    expect(within(panel()).getByTestId("opex-inflation-profile")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByTestId("opex-country-inflation"));
    expect(within(panel()).queryByTestId("opex-inflation-profile")).not.toBeInTheDocument();
    expect(within(panel()).getByTestId("opex-inflation-country")).toHaveTextContent("Germany");
  });

  it("UT-OPEXUI-022 seeds Add Period from the period it follows", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-2"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-newOpexProjectCost"));

    // `nextPeriodDescriptionPanel` — "… - 2" becomes "… - 3".
    expect(within(panel()).getByDisplayValue("Initialized O&M Contract - 3"))
      .toBeInTheDocument();
    // `nextStartDate` — the previous period's start plus its whole duration.
    expect(within(panel()).getByTestId("opex-start")).toHaveValue("2037-08-30");
  });

  /* ── delete ─────────────────────────────────────────────────────────── */

  it("UT-OPEXUI-023 asks before deleting, in the canvas' own words", () => {
    render(<Harness><OpexScreen mode="om" /></Harness>);
    fireEvent.click(screen.getByTestId("opex-select-om-1"));
    fireEvent.click(within(card("WTG V150-6.0")).getByTestId("opex-deleteOpexProjectCost"));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(DELETE_DIALOG.title)).toBeInTheDocument();
    // A chain ROOT warns about its periods; `deleteDialogText` follows the parent, not O-3.
    expect(within(dialog).getByText(
      deleteDialogText({ description: "Initialized O&M Contract", parentCostId: null } as never),
    )).toBeInTheDocument();
    expect(save.mutate).not.toHaveBeenCalled();
  });

  /* ── plumbing ───────────────────────────────────────────────────────── */

  it("UT-OPEXUI-024 renders both modes without a Griffel or hook-order failure", () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args); });
    for (const mode of ["om", "other"] as const) {
      const { unmount } = render(<Harness><OpexScreen mode={mode} /></Harness>);
      unmount();
    }
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it("UT-OPEXUI-025 keeps its hooks in order when the book arrives after a loading pass", () => {
    loading = true;
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args); });
    const { rerender } = render(<Harness><OpexScreen mode="om" /></Harness>);
    loading = false;
    rerender(<Harness><OpexScreen mode="om" /></Harness>);
    spy.mockRestore();

    expect(errors).toEqual([]);
    expect(screen.getByText("WTG V150-6.0")).toBeInTheDocument();
  });

  it("UT-OPEXUI-026 hands Add Standard Contract the card and the project's scope", () => {
    render(<Harness><OpexScreen mode="other" /></Harness>);
    fireEvent.click(
      within(card("Technical Commercial Management Agreement (TCMA)"))
        .getByTestId("opex-addStandardContract"),
    );

    expect(addStandard.mutate).toHaveBeenCalledTimes(1);
    expect(addStandard.mutate.mock.calls[0]?.[0]).toMatchObject({
      mode: "other",
      group: "Technical Commercial Management Agreement (TCMA)",
      countryId: "country-de",
      technology: 1,
      codDate: "2027-08-30",
      // `LookUp('Country Inflation Profiles', Country && Year = recCODYear).Inflation` (`:726`) —
      // COD 2027 + 1 = 2028, with NO Area term. This used to be hard-coded `undefined`, so an
      // assumption that says "use the country profile" imported with no percentage at all.
      countryInflationPercent: 2.1,
    });
  });

  /* ── reference data the screen used to transcribe or fake ───────────── */

  it("UT-OPEXUI-027 heads an O&M card with the turbine type, and keys the save on the device name", () => {
    /*
     * `lbl_…_SubaccountName_1.Text` (`:4800-4840`) renders
     * `LookUp(GeneratorTypeInProjects, …).Generator.'Turbine Type'`, NOT the device row's
     * `vsb_name`. The name still has to reach the save, because `resolveDeviceType` resolves a
     * group back to its device by that string, and `Left(Name, 3) = "WTG"` is what keeps the
     * EUR/WTG field on screen.
     */
    deviceTypes = [
      [{ id: "dev-wtg", name: "WTG V150-6.0", typeInProjectId: "gt-1",
        createdOn: "2024-01-01T00:00:00Z", displayName: "V150-6.0 (Vestas)" }],
      [],
    ];
    // An EMPTY card, so `Add Standard Contract` is enabled and its argument is observable.
    book = makeBook([]);
    render(<Harness><OpexScreen mode="om" /></Harness>);

    expect(screen.getByText("V150-6.0 (Vestas)")).toBeInTheDocument();
    expect(screen.queryByText("WTG V150-6.0")).not.toBeInTheDocument();

    const scope = within(screen.getByText("V150-6.0 (Vestas)").closest("section") as HTMLElement);

    // The panel reads the record type off the DEVICE name, so EUR/WTG stays visible.
    fireEvent.click(scope.getByTestId("opex-newOpexProjectCost"));
    expect(within(panel()).getByText("EUR/WTG p.a.")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByText("Cancel"));

    // …and the save/seed commands send the device NAME, which is what `resolveDeviceType` and
    // the cost book's grouping both key on.
    fireEvent.click(scope.getByTestId("opex-addStandardContract"));
    expect(addStandard.mutate.mock.calls[0]?.[0]).toMatchObject({ group: "WTG V150-6.0" });
  });

  it("UT-OPEXUI-028 orders the O&M cards by the generator's Created On, then the PV types", () => {
    // `Sort(…, CreatedOnGenerator.'Created On', Ascending)` (`:68-109`). The cards used to be
    // synthesised from the cost book's group names, so they came out in Description order.
    deviceTypes = [
      [
        { id: "d2", name: "WTG B", typeInProjectId: "t2",
          createdOn: "2025-06-01T00:00:00Z", displayName: "WTG B" },
        { id: "d1", name: "WTG A", typeInProjectId: "t1",
          createdOn: "2023-01-01T00:00:00Z", displayName: "WTG A" },
      ],
      [{ id: "d3", name: "PV X", typeInProjectId: "t3", createdOn: null, displayName: "PV X" }],
    ];
    book = makeBook([]);
    render(<Harness><OpexScreen mode="om" /></Harness>);

    const titles = [...document.querySelectorAll("section")]
      .map((s) => s.querySelector("button")?.textContent ?? "");
    expect(titles[0]).toContain("WTG A");
    expect(titles[1]).toContain("WTG B");
    expect(titles[2]).toContain("PV X");
  });

  it("UT-OPEXUI-029 keeps a card for a device the project no longer lists", () => {
    // A cost row whose device has gone is the silent-drop failure this codebase has had once:
    // its card stays so the row is still visible and deletable.
    deviceTypes = [[], []];
    render(<Harness><OpexScreen mode="om" /></Harness>);
    expect(screen.getByText("WTG V150-6.0")).toBeInTheDocument();
  });

  it("UT-OPEXUI-030 disables Add Standard Contract where the scope has no assumption", () => {
    // `hasStandardAssumption` was hard-coded `true`, so the command was offered everywhere and
    // a scope with no catalogue failed at the server with an inline error instead.
    const TCMA = "Technical Commercial Management Agreement (TCMA)";
    // With a catalogue behind it, an EMPTY card offers the command …
    const first = render(<Harness><OpexScreen mode="other" /></Harness>);
    expect(within(card(TCMA)).getByTestId("opex-addStandardContract")).toBeEnabled();
    first.unmount();

    // … and without one it does not.
    assumptionScopes = [];
    const second = render(<Harness><OpexScreen mode="other" /></Harness>);
    expect(within(card(TCMA)).getByTestId("opex-addStandardContract")).toBeDisabled();
    second.unmount();

    // Scoped by SUB-ACCOUNT on Other OPEX: a catalogue for Insurance does not enable TCMA.
    assumptionScopes = [{
      id: "a", typeOfContract: 952850002, countryId: "country-de", technology: 1,
      opexSubaccountId: OPEX_SUBACCOUNTS.find((s) => s.name === "Insurance")?.id ?? null,
    }];
    render(<Harness><OpexScreen mode="other" /></Harness>);
    expect(within(card(TCMA)).getByTestId("opex-addStandardContract")).toBeDisabled();
  });

  it("UT-OPEXUI-031 renders Italy's zone in the panel's read-only country profile text", () => {
    /*
     * `"Italy - " & Substitute(gblAreaWithRegion, "Italy_", "")` (`:7869-7927`).
     * `gblAreaWithRegion` comes from `App.OnStart`'s Italy-only `Switch` over the project's
     * `Area/State/Province`, which `loadProject` never selected — so an Italian project rendered
     * `"Italy - "` with an empty zone. Measured 16 Sep: Zingariello (`de5aade5-…`) is Puglia,
     * which the switch maps to `Italy_South`.
     */
    project.countryName = "Italy";
    (project as { areaStateProvince?: string }).areaStateProvince = "Puglia";
    deviceTypes = [
      [{ id: "dev-wtg", name: "WTG V150-6.0", typeInProjectId: "gt-1",
        createdOn: "2024-01-01T00:00:00Z", displayName: "WTG V150-6.0" }],
      [],
    ];
    book = makeBook([
      period({ id: "om-9", mode: "om", group: "WTG V150-6.0", description: "Service",
        periodIndex: 1, contractId: "om-9", inflation: true, countryInflation: true }),
    ]);
    try {
      render(<Harness><OpexScreen mode="om" /></Harness>);
      fireEvent.click(screen.getByTestId("opex-select-om-9"));
      fireEvent.click(
        within(card("WTG V150-6.0")).getByTestId("opex-editOpexProjectCost"),
      );
      expect(within(panel()).getByTestId("opex-inflation-country"))
        .toHaveTextContent("Italy - South");
    } finally {
      project.countryName = "Germany";
      delete (project as { areaStateProvince?: string }).areaStateProvince;
    }
  });
});
