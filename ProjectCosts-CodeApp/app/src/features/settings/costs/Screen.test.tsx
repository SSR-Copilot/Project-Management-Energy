// @vitest-environment jsdom
/**
 * Render smoke tests for the Costs settings screen — the failures type-checking cannot catch
 * (a conditional hook, a Griffel shorthand, a Fluent component with the wrong props), plus the
 * main interactions on fixture data. Rules are covered in `rules.test.ts`, I/O in
 * `data/settings/costs.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn().mockResolvedValue({ success: true, data: [] }),
    retrieveRecordAsync: vi.fn().mockResolvedValue({ success: true, data: {} }),
    createRecordAsync: vi.fn(),
    updateRecordAsync: vi.fn(),
    deleteRecordAsync: vi.fn(),
    executeAsync: vi.fn(),
  }),
}));

/** When true the hooks module answers with fixtures; otherwise the real hooks run (empty client). */
const useFixtures = { on: true };
const mutateAsync = vi.fn();
/** Per-test data overrides for the fixture hooks. */
const overrides: { devex?: unknown[]; opex?: unknown[]; countries?: unknown[]; inactive?: unknown[]; currenciesError?: Error } = {};

vi.mock("./hooks", async (importOriginal) => {
  const real = await importOriginal<typeof import("./hooks")>();
  const fx = await import("./fixtures");
  const q = <T,>(data: T, error: Error | null = null) => ({
    data, isLoading: false, isPending: false, isError: error !== null, error, refetch: vi.fn(),
  });
  const m = () => ({ mutateAsync, isPending: false });
  const pick = <K extends keyof typeof real>(key: K, fake: unknown) =>
    ((...args: unknown[]) => (useFixtures.on ? (typeof fake === "function" ? (fake as (...a: unknown[]) => unknown)(...args) : fake) : (real[key] as (...a: unknown[]) => unknown)(...args))) as (typeof real)[K];
  return {
    ...real,
    useCostCountries: pick("useCostCountries", () => q(overrides.countries ?? fx.FX_COUNTRIES)),
    useCapexHierarchy: pick("useCapexHierarchy", () => q(fx.FX_HIERARCHY)),
    useLandLeaseSubaccounts: pick("useLandLeaseSubaccounts", () => q(fx.FX_LAND_LEASE_SUBACCOUNTS)),
    useOpexSubaccounts: pick("useOpexSubaccounts", () => q(fx.FX_OPEX_SUBACCOUNTS)),
    useCostCurrencies: pick("useCostCurrencies", () => q(fx.FX_CURRENCIES, overrides.currenciesError ?? null)),
    useCostPayerDefaults: pick("useCostPayerDefaults", () => q(fx.FX_PAYER_DEFAULTS)),
    useInflationAreas: pick("useInflationAreas", () => q(["Centre - North", "South"])),
    useDevexCosts: pick("useDevexCosts", () => q(overrides.devex ?? fx.FX_DEVEX_COSTS)),
    useOpexPeriods: pick("useOpexPeriods", () => q(overrides.opex ?? fx.FX_OPEX_PERIODS)),
    useInactiveOpexRows: pick("useInactiveOpexRows", () => q(overrides.inactive ?? [])),
    useSaveDevexCost: pick("useSaveDevexCost", m),
    useDeleteDevexCost: pick("useDeleteDevexCost", m),
    useSaveOpexPeriod: pick("useSaveOpexPeriod", m),
    useDeleteOpexContract: pick("useDeleteOpexContract", m),
    useDeleteOpexPeriod: pick("useDeleteOpexPeriod", m),
  };
});

import { vsbTheme } from "@/theme/fluent";
import { appliedRules } from "@/test/appliedRules";
import { AppToaster } from "@/components";
import { CONTRACT_TYPE, ContractDeleteError, OpexFollowUpError } from "@/data/settings/costs";
import { DataError } from "@/platform/errors";
import * as fx from "./fixtures";
import { MSG } from "./constants";
import CostsSettingsScreen from "./Screen";

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <FluentProvider theme={vsbTheme}>
      {/* Outcomes are `useNotify` toasts (M5); `AppShell` mounts the toaster in the app. */}
      <AppToaster />
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </FluentProvider>
  );
}

const openSection = (title: string) => fireEvent.click(screen.getByRole("button", { name: title }));

describe("CostsSettingsScreen", () => {
  beforeEach(() => {
    useFixtures.on = true; mutateAsync.mockReset();
    delete overrides.devex; delete overrides.opex; delete overrides.countries; delete overrides.inactive;
    delete overrides.currenciesError;
  });
  afterEach(() => vi.clearAllMocks());

  it("renders the picker, breadcrumb and four collapsed sections (FR-2..FR-4)", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toBeInTheDocument();
    for (const title of ["DEVEX/CAPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs"]) {
      expect(screen.getByRole("button", { name: title })).toHaveAttribute("aria-expanded", "false");
    }
    const picker = screen.getByRole("navigation", { name: "Country and technology" });
    expect(within(picker).queryByText("Spain")).not.toBeInTheDocument();
  });

  it("switches scope from the picker (FR-3, FR-5)", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Poland" }));
    fireEvent.click(screen.getByRole("button", { name: "Poland PV" }));
    expect(screen.getByText("Standard Assumptions / Costs / Poland / PV")).toBeInTheDocument();
    openSection("Land Lease");
    expect(screen.getByText("Fix Costs p.a. [PLN]")).toBeInTheDocument();
  });

  it("shows the Land Lease contract with numeric period order and an enabled Add Period", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    expect(within(table).getByText("COD + 7 Years 6 Months")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Add Period to Standard LL Land Lease WTG" })).not.toHaveAttribute("aria-disabled", "true");
    // Delete on Period 1 and on the last period only.
    expect(within(table).getAllByRole("button", { name: /^Delete / })).toHaveLength(2);
  });

  it("Wave C: the enabled Add Period keeps its 'Add a period after Period N' description tooltip (DisabledReason enabledTooltip)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    const add = within(table).getByRole("button", { name: "Add Period to Standard LL Land Lease WTG" });
    expect(add).not.toBeDisabled();
    expect(add).not.toHaveAttribute("aria-disabled", "true");
    add.focus();
    expect(await screen.findByText(/^Add a period after Period \d+$/)).toBeInTheDocument();
    expect(add.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("opens the DEVEX tree, folds categories, and opens Add Cost with Save disabled (FR-7, FR-9, FR-11)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    expect(screen.getByText("Wind Turbine / Panels")).toBeInTheDocument();
    expect(screen.queryByText("1,234,567 EUR/MW(p)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show the Development Expenses costs" }));
    expect(screen.getByText("1,234,567 EUR/MW(p)")).toBeInTheDocument();
    expect(screen.getAllByText("1,3,5").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const dialog = await screen.findByRole("dialog", { name: /Add Cost/ });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByText("0/55")).toBeInTheDocument();
  });

  it("opens Edit Period with the inflation block read-only (FR-21)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period : Land Lease WTG/ });
    expect(within(dialog).getByRole("switch", { name: "Inflation Profile" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks before deleting a contract with the exact text (FR-27)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Delete Standard LL Land Lease WTG" }));
    expect(await screen.findByText('Are you sure you want to delete the "Standard LL Land Lease WTG" contract and all related periods?')).toBeInTheDocument();
  });

  it("keeps the panel open and shows a clean error when a save fails (AC-5)", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Server busy"));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await within(dialog).findByText("The standard contract could not be saved. Server busy.")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" })).toHaveValue("99");
  });

  it("asks before discarding edits on Cancel; an untouched panel closes directly (M7)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    let dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Edit Period/ })).not.toBeInTheDocument());

    // jsdom: tabster can leave a stale `aria-hidden` after the first drawer closes (06 §5.3).
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2", hidden: true }));
    dialog = await screen.findByRole("dialog", { name: /Edit Period/, hidden: true });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]", hidden: true }), { target: { value: "99" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", hidden: true }));
    const confirm = await screen.findByRole("alertdialog", { name: "Discard changes?", hidden: true });
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep editing", hidden: true }));
    expect(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]", hidden: true })).toHaveValue("99");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", hidden: true }));
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Discard changes?", hidden: true })).getByRole("button", { name: "Discard", hidden: true }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Edit Period/, hidden: true })).not.toBeInTheDocument());
  });

  it("draws Apply to All and each section's Apply disabled with the canvas info text; clicking writes nothing (FR-30)", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    const all = screen.getByRole("button", { name: "Apply to All" });
    expect(all).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(all);
    const titles = ["DEVEX/CAPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs"];
    for (const t of titles) openSection(t);
    for (const t of titles) {
      const apply = screen.getByRole("button", { name: `Apply (${t})` });
      expect(apply).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(apply);
    }
    expect(screen.getAllByText(MSG.applyInfo)).toHaveLength(5);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("closes the panel and says exactly what did not happen when a follow-up step fails", async () => {
    mutateAsync.mockRejectedValueOnce(new OpexFollowUpError("Period 1 was saved, but its contract-level values could not be copied to the later periods.", "id", null));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await screen.findByText("Period 1 was saved, but its contract-level values could not be copied to the later periods.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Edit Contract/ })).not.toBeInTheDocument());
  });

  it("shows the partial-delete notice with the counts and any flag inconsistency (FR-27, B-4)", async () => {
    mutateAsync.mockRejectedValueOnce(new ContractDeleteError(1, 2, new Error("x"), "No period is marked as last; Period 1 should be."));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Delete Standard LL Land Lease WTG" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(
      "The contract could not be deleted. 1 of 2 row(s) were deleted before the failure; the remaining rows were not deleted. Reload and try again. The last-period flags are inconsistent: No period is marked as last; Period 1 should be.",
    )).toBeInTheDocument();
  });

  it("maps a 403 on save to the permission message (FR-33)", async () => {
    mutateAsync.mockRejectedValueOnce(new DataError("update", { message: "denied" }, 403));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await within(dialog).findByText(/permission to save standard contracts/)).toBeInTheDocument();
  });

  it("re-expands the saved contract after a save (FR-17, FR-26)", async () => {
    mutateAsync.mockResolvedValueOnce({ id: "x", propagated: 0 });
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Hide the periods of Standard LL Land Lease WTG" }));
    expect(screen.queryByText("Standard LL Land Lease WTG - 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await screen.findByText(MSG.contractSaved)).toBeInTheDocument();
    expect(screen.getByText("Standard LL Land Lease WTG - 2")).toBeInTheDocument();
  });

  it("Italy: the Area is prefilled from the country area, required, and offered from the country's profiles (B-10)", async () => {
    overrides.opex = [fx.fxPeriod({ id: "it-om", type: CONTRACT_TYPE.oAndM, description: "Standard O&M Italy", landLeaseSubaccountId: undefined, opexSubaccountId: fx.FX_OPEX_SUBACCOUNTS[0]?.id, useCountryInflation: true, inflationProfile: undefined, inflationArea: undefined, externalContract: true, isLastPeriodFlag: true })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Italy" }));
    fireEvent.click(screen.getByRole("button", { name: "Italy Wind" }));
    openSection("Operation & Maintenance");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard O&M Italy" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Area" }));
    fireEvent.click(await screen.findByRole("option", { name: "South" }));
    await waitFor(() => expect(save).not.toBeDisabled());
  });

  it("Poland: drawer labels and units use PLN", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Poland" }));
    fireEvent.click(screen.getByRole("button", { name: "Poland Wind" }));
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    expect(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [PLN]" })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "PLN/MWh p.a." })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Currency" })).toHaveValue("Zloty");
  });

  it("Poland: the DEVEX drawer defaults to the PLN unit", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Poland" }));
    fireEvent.click(screen.getByRole("button", { name: "Poland Wind" }));
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const devex = await screen.findByRole("dialog", { name: /Add Cost/ });
    expect(await within(devex).findByRole("textbox", { name: "Cost [PLN]" })).toBeInTheDocument();
  });

  it("editing a DEVEX cost whose sub-account is inactive blocks Save with a clear message (B-2)", async () => {
    overrides.devex = [fx.fxDevexCost({ id: "inactive", descriptionInput: "Old fee", description: "Standard Old permit - Old fee", subaccountId: "deactivated-sub" })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Show the Development Expenses costs" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Old fee" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cost : Standard Old permit - Old fee" });
    expect(within(dialog).getByText(MSG.subaccountInactive)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Description" }), { target: { value: "New fee" } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("offers no Delete on a contract row without a sub-account (B-3)", () => {
    overrides.opex = [fx.fxPeriod({ id: "orphan", description: "Orphan row", landLeaseSubaccountId: undefined })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const del = screen.getByRole("button", { name: "Delete Orphan row" });
    expect(del).toBeDisabled();
  });

  it("GAP-1 / V5: a country without canvas technologies is listed as the canvas lists it, but no Wind/PV can be picked for it", () => {
    // V5 (R-5): the old expectation "Austria is not listed" encoded the allow-list workaround;
    // the canvas deny-list lists it after the six, with no technology children.
    overrides.countries = [...fx.FX_COUNTRIES, { id: "at", name: "Austria", active: true }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    const picker = screen.getByRole("navigation", { name: "Country and technology" });
    expect(within(picker).getAllByRole("listitem").at(-1)).toHaveTextContent("Austria");
    expect(within(picker).getByText("Croatia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand Austria" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Austria (Wind|PV)$/ })).not.toBeInTheDocument();
    // Clicking the listed name selects nothing: the scope stays Germany / Wind.
    fireEvent.click(within(picker).getByText("Austria"));
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toBeInTheDocument();
    expect(screen.queryByText(/Standard Assumptions \/ Costs \/ Austria/)).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("GAP-1: only non-configured countries → no scope, nothing can be created", () => {
    overrides.countries = [{ id: "at", name: "Austria", active: true }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("No countries found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Cost" })).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("GAP-2: shows the Period-1 +/- toggle on a single-period contract; collapsing hides Add Period", () => {
    overrides.opex = [fx.fxPeriod({ id: "single", description: "Single period contract", isLastPeriodFlag: true })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const toggle = screen.getByRole("button", { name: "Hide the periods of Single period contract" });
    expect(toggle).toHaveTextContent("-");
    expect(screen.getByRole("button", { name: "Add Period to Single period contract" })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show the periods of Single period contract" })).toHaveTextContent("+");
    expect(screen.queryByRole("button", { name: "Add Period to Single period contract" })).not.toBeInTheDocument();
  });

  it("R2-4: a contract whose sub-account was deactivated opens with the stored sub-account name in the title", async () => {
    overrides.opex = [fx.fxPeriod({ id: "old", description: "Standard LL Old lease", landLeaseSubaccountId: "deactivated-ll", subaccountLabel: "Old lease", isLastPeriodFlag: true })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Old lease" }));
    expect(await screen.findByRole("dialog", { name: "Edit Contract : Old lease" })).toBeInTheDocument();
  });

  it("R2-5: hidden inactive rows disable Add Period and Delete Period with an explanation; Delete Contract stays", async () => {
    const sub = fx.FX_LAND_LEASE_SUBACCOUNTS[0]?.id;
    overrides.inactive = [{ id: "p3", type: CONTRACT_TYPE.landLease, period: 3, landLeaseSubaccountId: sub, opexSubaccountId: undefined }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    const add = within(table).getByRole("button", { name: "Add Period to Standard LL Land Lease WTG" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    const delTail = within(table).getByRole("button", { name: "Delete Standard LL Land Lease WTG - 2" });
    expect(delTail).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(delTail);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // The reason is shown as the button's tooltip (never a dead-end error after a click).
    fireEvent.pointerEnter(delTail);
    expect((await screen.findAllByText(MSG.inactivePeriods([3]))).length).toBeGreaterThan(0);
    const delHead = within(table).getByRole("button", { name: "Delete Standard LL Land Lease WTG" });
    expect(delHead).not.toHaveAttribute("aria-disabled", "true");
    expect(delHead).not.toBeDisabled();
  });

  it("R2-5: inactive rows of ANOTHER contract do not block this one", () => {
    overrides.inactive = [{ id: "x", type: CONTRACT_TYPE.landLease, period: 2, landLeaseSubaccountId: "other-sub", opexSubaccountId: undefined }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    expect(screen.getByRole("button", { name: "Add Period to Standard LL Land Lease WTG" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Delete Standard LL Land Lease WTG - 2" })).not.toHaveAttribute("aria-disabled", "true");
  });

  /* ── Reusable components binding (Wave B) — the visual unifications ── */

  it("V1: both drawers use the shared footer — Save and Cancel sit directly in the panel footer band", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const devex = await screen.findByRole("dialog", { name: /Add Cost/ });
    const band = devex.querySelector(".canvas-panel-footer");
    expect(band).not.toBeNull();
    const buttons = [...(band?.children ?? [])].filter((el) => el.tagName === "BUTTON").map((el) => el.getAttribute("aria-label"));
    expect(buttons).toEqual(["Save", "Cancel"]);
  });

  it("V1: the period drawer footer has no hint while the commercial figures are valid", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    const band = dialog.querySelector(".canvas-panel-footer");
    expect(band?.querySelectorAll("button")).toHaveLength(2);
    expect(within(dialog).queryByText(MSG.commercialHint)).not.toBeInTheDocument();
  });

  it("V4: Cost Paid By opts into the horizontal panel radio row", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const devex = await screen.findByRole("dialog", { name: /Add Cost/ });
    expect(within(devex).getByRole("radiogroup", { name: "Cost Paid By" })).toHaveClass("canvas-radio-row");
  });

  it("C9: the breadcrumb band announces scope changes politely", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toHaveAttribute("aria-live", "polite");
  });

  it("E5: the period drawer's computed values are read-only, not disabled", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByRole("button", { name: "Edit Standard LL Land Lease WTG - 2" }));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    for (const name of ["Description", "Start Date", "Currency"]) {
      const box = within(dialog).getByRole("textbox", { name });
      expect(box).toHaveAttribute("readonly");
      expect(box).toHaveAttribute("aria-readonly", "true");
      expect(box).not.toBeDisabled();
    }
  });

  it("H1: a failed reference REFRESH keeps the screen and shows a warning bar with Retry", () => {
    overrides.currenciesError = new Error("Network down");
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toBeInTheDocument();
    expect(screen.getByText(/could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the empty state when no countries load (real data path)", async () => {
    useFixtures.on = false;
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(await screen.findByText("No countries found")).toBeInTheDocument();
  });
});

/**
 * Rail-height parity (work order 13-reusable-components/09, Option 4). jsdom has no layout,
 * so the applied RULES are asserted, not pixel heights.
 */
describe("CostsSettingsScreen — picker/rail height parity", () => {
  beforeEach(() => { useFixtures.on = true; });

  it("fills the body row instead of hugging it, and scrolls the right column, not the picker", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    const picker = screen.getByRole("navigation", { name: "Country and technology" });
    // `styles.body` was `align-items: flex-start`, which made the picker unable to stretch.
    const body = appliedRules(picker.parentElement!);
    expect(body["align-items"]).toBe("stretch");
    expect(body["flex-grow"]).toBe("1");
    expect(body["min-height"]).toBe("0px"); // `minHeight: "0"`, normalised by cssstyle
    // The right-hand card owns the scroll region.
    const right = appliedRules(screen.getByRole("region", { name: "Standard cost assumptions" }));
    expect(right["overflow-y"]).toBe("auto");
    expect(right["min-height"]).toBe("0px");
  });

  it("keeps every country of a long list reachable in the DOM", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    const picker = screen.getByRole("navigation", { name: "Country and technology" });
    const rows = within(picker).getAllByRole("listitem").filter((li) => li.parentElement?.parentElement === picker);
    expect(rows.length).toBeGreaterThan(0);
    // Nothing is clipped away: the picker itself never scrolls and sets no height.
    const column = appliedRules(picker);
    expect(column["overflow-y"]).not.toBe("auto");
    expect(column["height"]).toBeUndefined();
  });
});
