// @vitest-environment jsdom
/**
 * Render smoke tests for the Costs settings screen — the failures type-checking cannot catch
 * (a conditional hook, a Griffel shorthand, a Fluent component with the wrong props), plus the
 * main interactions on fixture data. Rules are covered in `rules.test.ts`, I/O in
 * `data/adminCost.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
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

/** The admin gate (master's `useAdminAccess`); a non-admin keeps the data but loses every write. */
const access = { admin: true };
vi.mock("@/app/useCurrentUser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/useCurrentUser")>()),
  useAdminAccess: () => access.admin,
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
import { appliedPseudoRules, appliedRules } from "@/test/appliedRules";
import { AppToaster, useStandardListboxStyles, useStandardValueClass } from "@/components";
import { CONTRACT_TYPE, ContractDeleteError, OpexFollowUpError } from "@/domain/costStandards";
import { DataError } from "@/platform/errors";
import { palette } from "@/theme/tokens";
import * as fx from "./fixtures";
import { CLUSTER_LABELS, COST_PAID_BY_OPTIONS, MSG } from "./constants";
import CostsSettingsScreen from "./Screen";

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <FluentProvider theme={vsbTheme}>
      {/* Outcomes are `useNotify` toasts; `AppShell` mounts the toaster in the app. */}
      <AppToaster />
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </FluentProvider>
  );
}

const isDisabled = (el: HTMLElement) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
const openSection = (title: string) => fireEvent.click(screen.getByRole("button", { name: title }));

/**
 * The shared standard-assumption classes (rule 20), as `standardValue.test.tsx` reads them: Griffel merges
 * classes (dropping the sequence hash), so an element "carries" a style when it has every atomic class of it.
 */
const atoms = (cls: string) => cls.split(" ").filter((c) => c && !c.startsWith("___"));
const carries = (el: Element | null | undefined, cls: string) => !!el && atoms(cls).every((a) => el.className.split(" ").includes(a));
function standardClasses() {
  const { result } = renderHook(() => ({ value: useStandardValueClass(), listbox: useStandardListboxStyles() }), { wrapper: Harness });
  return {
    blueItalic: result.current.value("standard") as string,
    italic: result.current.value("italic") as string,
    listbox: result.current.listbox.standard,
  };
}
/** cssstyle normalises a hex colour to `rgb(…)`; accept both spellings. */
const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
/**
 * EVERY value the element's atomic classes declare for `prop` (whitespace stripped). `appliedRules` keeps the
 * last one in sheet order, which for a Fluent slot that also sets the property is Fluent's token, not ours.
 */
function declaredValues(el: Element, prop: string): string[] {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = [];
    try { rules = Array.from(sheet.cssRules ?? []); } catch { continue; }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.startsWith(".")) continue;
      if (!el.classList.contains(rule.selectorText.slice(1))) continue;
      const v = rule.style.getPropertyValue(prop);
      if (v) out.push(v.replace(/\s/g, ""));
    }
  }
  return out;
}

/*
 * Row controls are named by their canvas caption ("Edit", "+", "Add Period" …, CONVENTIONS rule
 * 16), so a specific row's control is found by its canvas `data-testid` + the row's stable id.
 */
/** The fixture Land Lease contract's key (its sub-account id), its Period 1 and Period 2 row ids. */
const LL_CONTRACT = fx.FX_LAND_LEASE_SUBACCOUNTS[0]?.id as string;
const LL_P1 = fx.FX_OPEX_PERIODS[0]?.id as string;
const LL_P2 = fx.FX_OPEX_PERIODS[1]?.id as string;
/** The fixture DEVEX category "Development Expenses". */
const DEVEX_CATEGORY = fx.fxDevexCost().categoryId as string;
const T = {
  addPeriod: (contract: string) => `btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod-${contract}`,
  contractFold: (contract: string) => `Button2_1-${contract}`,
  editContract: (row: string) => `btn_ICON_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Edit-${row}`,
  editPeriod: (row: string) => `btn_ICON_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Edit_1-${row}`,
  deleteContract: (row: string) => `ico_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Delete-${row}`,
  deletePeriod: (row: string) => `ico_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Delete_1-${row}`,
  devexFold: (category: string) => `Button2_2-${category}`,
  devexEdit: (cost: string) => `btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_Edit-${cost}`,
  addContractType: (section: string) => `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar-${section}`,
  sectionApply: (section: string) => `btn_Admin_Cost_Landlease_ApplyToLandlease-${section}`,
};

describe("CostsSettingsScreen", () => {
  beforeEach(() => {
    useFixtures.on = true; access.admin = true; mutateAsync.mockReset();
    delete overrides.devex; delete overrides.opex; delete overrides.countries; delete overrides.inactive;
    delete overrides.currenciesError;
  });
  afterEach(() => vi.clearAllMocks());

  it("UT-ADCOST-901 renders the picker, breadcrumb and four collapsed sections", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toBeInTheDocument();
    for (const title of ["DEVEX/CAPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs"]) {
      expect(screen.getByRole("button", { name: title })).toHaveAttribute("aria-expanded", "false");
    }
    const picker = screen.getByRole("navigation", { name: "Country and technology" });
    expect(within(picker).queryByText("Spain")).not.toBeInTheDocument();
  });

  it("UT-ADCOST-902 switches scope from the picker", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Poland" }));
    fireEvent.click(screen.getByRole("button", { name: "Poland PV" }));
    expect(screen.getByText("Standard Assumptions / Costs / Poland / PV")).toBeInTheDocument();
    openSection("Land Lease");
    expect(screen.getByText("Fix Costs p.a. [PLN]")).toBeInTheDocument();
  });

  it("UT-ADCOST-903 shows the Land Lease contract with numeric period order and an enabled Add Period", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    expect(within(table).getByText("COD + 7 Years 6 Months")).toBeInTheDocument();
    expect(within(table).getByTestId(T.addPeriod(LL_CONTRACT))).not.toHaveAttribute("aria-disabled", "true");
    // Delete on Period 1 and on the last period only.
    expect(within(table).getAllByRole("button", { name: /^Delete / })).toHaveLength(2);
  });

  it("UT-ADCOST-904 the enabled Add Period keeps its 'Add a period after Period N' description tooltip (DisabledReason enabledTooltip)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    const add = within(table).getByTestId(T.addPeriod(LL_CONTRACT));
    expect(add).not.toBeDisabled();
    expect(add).not.toHaveAttribute("aria-disabled", "true");
    add.focus();
    expect(await screen.findByText(/^Add a period after Period \d+$/)).toBeInTheDocument();
    expect(add.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("UT-ADCOST-905 opens the DEVEX tree, folds categories, and opens Add Cost with Save disabled", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    expect(screen.getByText("Wind Turbine / Panels")).toBeInTheDocument();
    expect(screen.queryByText("1,234,567 EUR/MW(p)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(T.devexFold(DEVEX_CATEGORY)));
    expect(screen.getByText("1,234,567 EUR/MW(p)")).toBeInTheDocument();
    expect(screen.getAllByText("1,3,5").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const dialog = await screen.findByRole("dialog", { name: /Add Cost/ });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByText("0/55")).toBeInTheDocument();
  });

  it("UT-ADCOST-945 DEVEX rows draw the canvas comment image ('Frame 3' with a red dot when a comment exists, 'Frame 3 (1)' otherwise, 23 px) and the connector at X 16 / 15 (ACS:4236-4276, 4400-4455)", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByTestId(T.devexFold(DEVEX_CATEGORY)));
    const buttons = screen.getAllByTestId(/^img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment-/);
    expect(buttons.length).toBeGreaterThan(1);
    const glyphs = buttons.map((b) => b.querySelector("svg") as SVGElement);
    for (const g of glyphs) {
      expect(g.getAttribute("width")).toBe("23");
      expect(g.getAttribute("viewBox")).toBe("0 0 31 27");
      expect(g.querySelectorAll("path").length).toBe(2);
    }
    const withComment = glyphs.filter((g) => g.getAttribute("data-icon-name") === "Frame 3");
    const without = glyphs.filter((g) => g.getAttribute("data-icon-name") === "Frame 3 (1)");
    expect(withComment.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
    for (const g of withComment) expect(g.querySelector("circle")?.getAttribute("fill")).toBe("#FC3E3E");
    for (const g of without) expect(g.querySelector("circle")).toBeNull();
    // The tree connector lives on the first cell of each child row: vertical line at 16 px, elbow from 15 px.
    const firstCell = buttons[0]!.closest("tr")!.querySelector("td") as HTMLElement;
    expect(appliedPseudoRules(firstCell, "::before")["left"]).toBe("16px");
    const elbow = appliedPseudoRules(firstCell, "::after");
    expect(elbow["left"]).toBe("15px");
    expect(elbow["width"]).toBe("15px");
  });

  it("UT-ADCOST-946 the Action column lays out as the canvas: 120 px, no cell padding, a 23 px comment button, then 32 px Edit and Delete 10 px apart (ACS:3649-3680, 4236-4365)", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByTestId(T.devexFold(DEVEX_CATEGORY)));
    const comment = screen.getAllByTestId(/^img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment-/)[0] as HTMLElement;
    expect(appliedRules(comment)["width"]).toBe("23px");
    const cell = comment.closest("td") as HTMLElement;
    expect(appliedRules(cell)["padding-left"]).toMatch(/^0(px)?$/);
    const flex = comment.closest("div") as HTMLElement;
    expect(appliedRules(flex)["width"]).toBe("120px");
    expect(appliedRules(flex)["justify-content"]).toBe("space-between");
    const edit = screen.getAllByTestId(/^btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_Edit-/)[0] as HTMLElement;
    const actions = edit.parentElement as HTMLElement;
    expect(appliedRules(actions)["column-gap"]).toBe("10px");
    const nested = Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules ?? [])).map((r) => r.cssText)
      .filter((t) => Array.from(actions.classList).some((c) => t.includes(`.${c} `)));
    expect(nested.some((t) => t.includes("button") && t.includes("width: 32px"))).toBe(true);
    expect(nested.some((t) => t.includes(".fui-Button__icon") && t.includes("font-size: 16px"))).toBe(true);
  });

  it("UT-ADCOST-906 opens Edit Period with the inflation block read-only", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period : Land Lease WTG/ });
    expect(within(dialog).getByRole("switch", { name: "Inflation Profile" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("UT-ADCOST-907 asks before deleting a contract with the exact text", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.deleteContract(LL_P1)));
    expect(await screen.findByText('Are you sure you want to delete the "Standard LL Land Lease WTG" contract and all related periods?')).toBeInTheDocument();
  });

  it("UT-ADCOST-908 keeps the panel open and shows a clean error when a save fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Server busy"));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await within(dialog).findByText("The standard contract could not be saved. Server busy.")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" })).toHaveValue("99");
  });

  it("UT-ADCOST-909 asks before discarding edits on Cancel; an untouched panel closes directly", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    let dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Edit Period/ })).not.toBeInTheDocument());

    // jsdom: tabster can leave a stale `aria-hidden` after the first drawer closes (06 §5.3).
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
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

  it("UT-ADCOST-910 draws no Apply to All bar and no per-section Apply strip (D67)", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    const sections = [
      { title: "DEVEX/CAPEX", key: "devex" }, { title: "Operation & Maintenance", key: "oAndM" },
      { title: "Land Lease", key: "landLease" }, { title: "Other OPEX Costs", key: "other" },
    ];
    for (const s of sections) openSection(s.title);
    expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
    for (const s of sections) expect(screen.queryByTestId(T.sectionApply(s.key))).not.toBeInTheDocument();
    expect(screen.queryByText(/^Apply standard cost/)).not.toBeInTheDocument();
  });

  it("UT-ADCOST-911 closes the panel and says exactly what did not happen when a follow-up step fails", async () => {
    mutateAsync.mockRejectedValueOnce(new OpexFollowUpError("Period 1 was saved, but its contract-level values could not be copied to the later periods.", "id", null));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editContract(LL_P1)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await screen.findByText("Period 1 was saved, but its contract-level values could not be copied to the later periods.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Edit Contract/ })).not.toBeInTheDocument());
  });

  it("UT-ADCOST-912 shows the partial-delete notice with the counts and any flag inconsistency", async () => {
    mutateAsync.mockRejectedValueOnce(new ContractDeleteError(1, 2, new Error("x"), "No period is marked as last; Period 1 should be."));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.deleteContract(LL_P1)));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(
      "The contract could not be deleted. 1 of 2 row(s) were deleted before the failure; the remaining rows were not deleted. Reload and try again. The last-period flags are inconsistent: No period is marked as last; Period 1 should be.",
    )).toBeInTheDocument();
  });

  it("UT-ADCOST-913 maps a 403 on save to the permission message", async () => {
    mutateAsync.mockRejectedValueOnce(new DataError("update", { message: "denied" }, 403));
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await within(dialog).findByText(/permission to save standard contracts/)).toBeInTheDocument();
  });

  it("UT-ADCOST-914 re-expands the saved contract after a save", async () => {
    mutateAsync.mockResolvedValueOnce({ id: "x", propagated: 0 });
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.contractFold(LL_CONTRACT)));
    expect(screen.queryByText("Standard LL Land Lease WTG - 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(T.editContract(LL_P1)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    expect(await screen.findByText(MSG.contractSaved)).toBeInTheDocument();
    expect(screen.getByText("Standard LL Land Lease WTG - 2")).toBeInTheDocument();
  });

  it("UT-ADCOST-915 Italy: the Area is prefilled from the country area, required, and offered from the country's profiles", async () => {
    overrides.opex = [fx.fxPeriod({ id: "it-om", type: CONTRACT_TYPE.oAndM, description: "Standard O&M Italy", landLeaseSubaccountId: undefined, opexSubaccountId: fx.FX_OPEX_SUBACCOUNTS[0]?.id, useCountryInflation: true, inflationProfile: undefined, inflationArea: undefined, externalContract: true, isLastPeriodFlag: true })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Italy" }));
    fireEvent.click(screen.getByRole("button", { name: "Italy Wind" }));
    openSection("Operation & Maintenance");
    fireEvent.click(screen.getByTestId(T.editContract("it-om")));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [EUR]" }), { target: { value: "99" } });
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Area" }));
    fireEvent.click(await screen.findByRole("option", { name: "South" }));
    await waitFor(() => expect(save).not.toBeDisabled());
  });

  it("UT-ADCOST-916 Poland: drawer labels and units use PLN", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Poland" }));
    fireEvent.click(screen.getByRole("button", { name: "Poland Wind" }));
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    expect(within(dialog).getByRole("textbox", { name: "Fix Costs p.a. [PLN]" })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "PLN/MWh p.a." })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Currency" })).toHaveValue("Zloty");
  });

  it("UT-ADCOST-917 Poland: the DEVEX drawer defaults to the PLN unit", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    fireEvent.click(screen.getByRole("button", { name: "Expand Poland" }));
    fireEvent.click(screen.getByRole("button", { name: "Poland Wind" }));
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const devex = await screen.findByRole("dialog", { name: /Add Cost/ });
    expect(await within(devex).findByRole("textbox", { name: "Cost [PLN]" })).toBeInTheDocument();
  });

  it("UT-ADCOST-918 editing a DEVEX cost whose sub-account is inactive blocks Save with a clear message", async () => {
    overrides.devex = [fx.fxDevexCost({ id: "inactive", descriptionInput: "Old fee", description: "Standard Old permit - Old fee", subaccountId: "deactivated-sub" })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByTestId(T.devexFold(DEVEX_CATEGORY)));
    fireEvent.click(screen.getByTestId(T.devexEdit("inactive")));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cost : Standard Old permit - Old fee" });
    expect(within(dialog).getByText(MSG.subaccountInactive)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Description" }), { target: { value: "New fee" } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCOST-919 offers no Delete on a contract row without a sub-account", () => {
    overrides.opex = [fx.fxPeriod({ id: "orphan", description: "Orphan row", landLeaseSubaccountId: undefined })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const del = screen.getByTestId(T.deleteContract("orphan"));
    expect(del).toBeDisabled();
  });

  it("UT-ADCOST-920 a country without canvas technologies is listed as the canvas lists it, but no Wind/PV can be picked for it", () => {
    // The old expectation "Austria is not listed" encoded the allow-list workaround;
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

  it("UT-ADCOST-921 only non-configured countries → no scope, nothing can be created", () => {
    overrides.countries = [{ id: "at", name: "Austria", active: true }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("No countries found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Cost" })).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCOST-922 shows the Period-1 +/- toggle on a single-period contract; collapsing hides Add Period", () => {
    overrides.opex = [fx.fxPeriod({ id: "single", description: "Single period contract", isLastPeriodFlag: true })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    // The single-period contract's key is its (default) Land Lease sub-account.
    const toggle = screen.getByTestId(T.contractFold(LL_CONTRACT));
    expect(toggle).toHaveTextContent("-");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(T.addPeriod(LL_CONTRACT))).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId(T.contractFold(LL_CONTRACT))).toHaveTextContent("+");
    expect(screen.getByTestId(T.contractFold(LL_CONTRACT))).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(T.addPeriod(LL_CONTRACT))).not.toBeInTheDocument();
  });

  it("UT-ADCOST-923 a contract whose sub-account was deactivated opens with the stored sub-account name in the title", async () => {
    overrides.opex = [fx.fxPeriod({ id: "old", description: "Standard LL Old lease", landLeaseSubaccountId: "deactivated-ll", subaccountLabel: "Old lease", isLastPeriodFlag: true })];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editContract("old")));
    expect(await screen.findByRole("dialog", { name: "Edit Contract : Old lease" })).toBeInTheDocument();
  });

  it("UT-ADCOST-924 hidden inactive rows disable Add Period and Delete Period with an explanation; Delete Contract stays", async () => {
    const sub = fx.FX_LAND_LEASE_SUBACCOUNTS[0]?.id;
    overrides.inactive = [{ id: "p3", type: CONTRACT_TYPE.landLease, period: 3, landLeaseSubaccountId: sub, opexSubaccountId: undefined }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    const add = within(table).getByTestId(T.addPeriod(LL_CONTRACT));
    expect(add).toHaveAttribute("aria-disabled", "true");
    const delTail = within(table).getByTestId(T.deletePeriod(LL_P2));
    expect(delTail).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(delTail);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // The reason is shown as the button's tooltip (never a dead-end error after a click).
    fireEvent.pointerEnter(delTail);
    expect((await screen.findAllByText(MSG.inactivePeriods([3]))).length).toBeGreaterThan(0);
    const delHead = within(table).getByTestId(T.deleteContract(LL_P1));
    expect(delHead).not.toHaveAttribute("aria-disabled", "true");
    expect(delHead).not.toBeDisabled();
  });

  it("UT-ADCOST-925 inactive rows of ANOTHER contract do not block this one", () => {
    overrides.inactive = [{ id: "x", type: CONTRACT_TYPE.landLease, period: 2, landLeaseSubaccountId: "other-sub", opexSubaccountId: undefined }];
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    expect(screen.getByTestId(T.addPeriod(LL_CONTRACT))).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId(T.deletePeriod(LL_P2))).not.toHaveAttribute("aria-disabled", "true");
  });

  /* ── Shared components binding — the visual unifications ── */

  it("UT-ADCOST-926 both drawers use the shared footer — Save and Cancel sit directly in the panel footer band", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const devex = await screen.findByRole("dialog", { name: /Add Cost/ });
    const band = devex.querySelector(".canvas-panel-footer");
    expect(band).not.toBeNull();
    const buttons = [...(band?.children ?? [])].filter((el) => el.tagName === "BUTTON").map((el) => el.getAttribute("aria-label"));
    expect(buttons).toEqual(["Save", "Cancel"]);
  });

  it("UT-ADCOST-927 the period drawer footer has no hint while the commercial figures are valid", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    const band = dialog.querySelector(".canvas-panel-footer");
    expect(band?.querySelectorAll("button")).toHaveLength(2);
    expect(within(dialog).queryByText(MSG.commercialHint)).not.toBeInTheDocument();
  });

  it("UT-ADCOST-928 Cost Paid By opts into the horizontal panel radio row", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const devex = await screen.findByRole("dialog", { name: /Add Cost/ });
    expect(within(devex).getByRole("radiogroup", { name: "Cost Paid By" })).toHaveClass("canvas-radio-row");
  });

  it("UT-ADCOST-929 the breadcrumb band announces scope changes politely", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toHaveAttribute("aria-live", "polite");
  });

  it("UT-ADCOST-930 the period drawer's computed values are read-only, not disabled", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editPeriod(LL_P2)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Period/ });
    for (const name of ["Description", "Start Date", "Currency"]) {
      const box = within(dialog).getByRole("textbox", { name });
      expect(box).toHaveAttribute("readonly");
      expect(box).toHaveAttribute("aria-readonly", "true");
      expect(box).not.toBeDisabled();
    }
  });

  it("UT-ADCOST-931 a failed reference REFRESH keeps the screen and shows a warning bar with Retry", () => {
    overrides.currenciesError = new Error("Network down");
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(screen.getByText("Standard Assumptions / Costs / Germany / Wind")).toBeInTheDocument();
    expect(screen.getByText(/could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("UT-ADCOST-935 admin: Add Cost, Add Contract Type, Edit, Delete and Add Period are all enabled", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    openSection("Land Lease");
    expect(screen.getByRole("button", { name: "Add Cost" })).not.toHaveAttribute("aria-disabled", "true");
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    expect(within(table).getByTestId(T.editPeriod(LL_P2))).not.toBeDisabled();
    expect(within(table).getByTestId(T.deleteContract(LL_P1))).not.toBeDisabled();
    expect(within(table).getByTestId(T.addPeriod(LL_CONTRACT))).not.toHaveAttribute("aria-disabled", "true");
  });

  it("UT-ADCOST-936 non-admin: the data shows but Add Cost, Add Contract Type, Edit, Delete and Add Period are disabled", async () => {
    access.admin = false;
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    openSection("Land Lease");
    expect(isDisabled(screen.getByRole("button", { name: "Add Cost" }))).toBe(true);
    expect(screen.getByTestId(T.devexFold(DEVEX_CATEGORY))).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Land Lease standard contracts" });
    expect(within(table).getByText("COD + 7 Years 6 Months")).toBeInTheDocument();
    for (const testId of [T.editPeriod(LL_P2), T.deleteContract(LL_P1), T.deletePeriod(LL_P2)]) {
      const button = within(table).getByTestId(testId);
      expect(isDisabled(button)).toBe(true);
    }
    expect(isDisabled(within(table).getByTestId(T.addPeriod(LL_CONTRACT)))).toBe(true);
    // The Add Contract Type menu opens, but every sub-account item is disabled.
    fireEvent.click(screen.getByTestId(T.addContractType("landLease")));
    const items = await screen.findAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(isDisabled(item)).toBe(true);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCOST-937 the DEVEX panel lists the five clusters one per line (D85)", async () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const dialog = await screen.findByRole("dialog", { name: /Add Cost/ });
    const list = within(dialog).getByRole("group", { name: "Select Cluster" });
    // Fluent's Checkbox is inline-flex: in a plain block the short labels ran on (Cluster 2 and 3 on one line).
    const css = appliedRules(list);
    expect(css["display"]).toBe("flex");
    expect(css["flex-direction"]).toBe("column");
    expect(within(list).getAllByRole("checkbox")).toHaveLength(5);
  });

  /* ── Rule 20: the canvas FontColor / FontItalic pair, per control, through the ONE shared style ── */

  it("UT-ADCOST-942 DEVEX panel: blue italic on Description, clusters, Category, Sub-Account, Unit (box and open list), Cost; italic only on Distribution Frequency, Cost Paid By, Comment; plain Apply VAT / Depreciation", async () => {
    const cls = standardClasses();
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("DEVEX/CAPEX");
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));
    const dialog = await screen.findByRole("dialog", { name: /Add Cost/ });
    const root = (testId: string) => within(dialog).getByTestId(testId).parentElement;
    // `txt_…_Description` (ACS:9861-62) and `txt_…_Cost` (ACS:10674-75): the class sits on the Fluent root around the input.
    expect(carries(root("txt_AdminCost_RightPanel_Form_AddCost_Fields_Description"), cls.blueItalic)).toBe(true);
    expect(carries(root("txt_AdminCost_RightPanel_Form_AddCost_Fields_Cost"), cls.blueItalic)).toBe(true);
    // `chk_AdminCost_RightPanel_SelectCluster1…5` (ACS:9953-10032): the pair is on each label.
    for (const label of CLUSTER_LABELS) expect(carries(within(dialog).getByText(label), cls.blueItalic), label).toBe(true);
    // `cmb_…_Category` (ACS:10211-12) / `cmb_…_Subaccount` (ACS:10348-49): the combobox root.
    expect(carries(root("cmb_AdminCost_RightPanel_Form_AddCost_Fields_Category"), cls.blueItalic)).toBe(true);
    expect(carries(root("cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount"), cls.blueItalic)).toBe(true);
    // Italic ONLY (no colour): `cmb_…_Distribution_Frequency` (ACS:10085), `rad_…_Cost_Paid_By` (ACS:10509), `txt_…_Comment` (ACS:10750).
    const frequency = root("cmb_AdminCost_RightPanel_Form_AddCost_Fields_Distribution_Frequency");
    expect(carries(frequency, cls.italic)).toBe(true);
    expect(carries(frequency, cls.blueItalic)).toBe(false);
    for (const o of COST_PAID_BY_OPTIONS) {
      const label = within(dialog).getByText(o.label);
      expect(carries(label, cls.italic), o.label).toBe(true);
      expect(carries(label, cls.blueItalic), o.label).toBe(false);
    }
    const comment = root("txt_AdminCost_RightPanel_Form_AddCost_Fields_Comment");
    expect(carries(comment, cls.italic)).toBe(true);
    expect(carries(comment, cls.blueItalic)).toBe(false);
    // Plain: `chk_…_ApplyVat` / `chk_…_Depreciation` (`FontColor: =gblAppColors.Label.Color`, ACS:10152 / 10164).
    for (const label of ["Apply VAT", "Depreciation"]) {
      expect(carries(within(dialog).getByText(label), cls.italic), label).toBe(false);
      expect(carries(within(dialog).getByText(label), cls.blueItalic), label).toBe(false);
    }
    // `cmb_…_Unit` (ACS:10563-64): the box AND its open list (a canvas ComboBox styles every option).
    const unit = within(dialog).getByTestId("cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit");
    expect(carries(unit.parentElement, cls.blueItalic)).toBe(true);
    fireEvent.click(unit);
    const list = await screen.findByRole("listbox");
    expect(carries(list, cls.listbox)).toBe(true);
    expect(within(list).getAllByRole("option").length).toBeGreaterThan(0);
    // Every styled control keeps its canvas identity.
    for (const id of [
      "txt_AdminCost_RightPanel_Form_AddCost_Fields_Description", "cmb_AdminCost_RightPanel_Form_AddCost_Fields_Category",
      "cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount", "cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit",
      "txt_AdminCost_RightPanel_Form_AddCost_Fields_Cost", "txt_AdminCost_RightPanel_Form_AddCost_Fields_Comment",
    ]) expect(within(dialog).getByTestId(id).getAttribute("aria-label"), id).toBeTruthy();
  });

  it("UT-ADCOST-943 period panel: blue italic on Description, Start Date, the money figures, Inflation Start Year and Inflation Profile; plain Currency and dropdowns; no Description asterisk", async () => {
    const cls = standardClasses();
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.editContract(LL_P1)));
    const dialog = await screen.findByRole("dialog", { name: /Edit Contract/ });
    const root = (testId: string) => within(dialog).getByTestId(testId).parentElement;
    // `txt_…_Description_1` (ACS:5092-93), `txt_…_StartDate` (ACS:5315-16).
    expect(carries(root("txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1"), cls.blueItalic)).toBe(true);
    expect(carries(root("txt_LandLease_RightPanel_NewEditCost_BodyContent_StartDate"), cls.blueItalic)).toBe(true);
    // `drp_…_Currency_1` (ACS:5578): no FontColor / FontItalic — plain (it was wrongly blue italic).
    const currency = root("drp_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1");
    expect(carries(currency, cls.blueItalic)).toBe(false);
    expect(carries(currency, cls.italic)).toBe(false);
    // The five money figures (ACS:5807-6338).
    for (const id of ["FixedCosts_1", "PercentOfRevenues_1", "EuroMWh_1", "EuroMW_1", "EuroWTG_1"]) {
      expect(carries(root(`txt_LandLease_RightPanel_NewEditPeriod_BodyContent_${id}`), cls.blueItalic), id).toBe(true);
    }
    // The dropdowns stay plain (`BasePaletteColor` only).
    for (const id of [
      "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1", "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1",
      "drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1",
    ]) {
      const drop = within(dialog).getByTestId(id);
      expect(carries(drop, cls.blueItalic) || carries(drop.parentElement, cls.blueItalic), id).toBe(false);
    }
    // Inflation on (Period 1 edits it): `txt_…_InflationStartYear_1` (ACS:7189-90) and `txt_…_InflationProfile_1` (ACS:7506-07).
    const inflation = within(dialog).getByRole("switch", { name: "Inflation Profile" }) as HTMLInputElement;
    if (!inflation.checked) fireEvent.click(inflation);
    expect(carries(root("txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationStartYear_1"), cls.blueItalic)).toBe(true);
    expect(carries(root("txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1"), cls.blueItalic)).toBe(true);
    // `lbl_…_DescriptionAsterisk_1.Visible: =//IsBlank(…)` (ACS:5192) is commented out: no required mark on Description.
    const descriptionLabel = within(dialog).getByText("Description", { selector: "label" });
    expect(descriptionLabel.querySelector(".fui-Label__required")).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Description" })).not.toBeRequired();
  });

  it("UT-ADCOST-944 the delete dialog is the canvas cmp_PopUp_Confirmation: themePrimary Confirm with a CheckMark (128 px), Cancel with an ✕ (96 px), a 490 px box on the dark scrim — not a red button", () => {
    render(<Harness><CostsSettingsScreen /></Harness>);
    openSection("Land Lease");
    fireEvent.click(screen.getByTestId(T.deleteContract(LL_P1)));
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByTestId("confirm-dialog-confirm");
    const cancel = within(dialog).getByTestId("confirm-dialog-cancel");
    expect(confirm).toHaveTextContent("Confirm");
    expect(confirm).toHaveAttribute("aria-label", "Confirm");
    expect(confirm.style.width).toBe("128px");
    expect(confirm.querySelector("svg")).not.toBeNull();
    const confirmCss = appliedRules(confirm);
    expect([palette.themePrimary.toLowerCase(), rgb(palette.themePrimary)]).toContain(confirmCss["background-color"]?.toLowerCase());
    expect([palette.Error.toLowerCase(), rgb(palette.Error)]).not.toContain(confirmCss["background-color"]?.toLowerCase());
    expect([palette.white.toLowerCase(), rgb(palette.white), "white"]).toContain(confirmCss["color"]?.toLowerCase());
    expect(cancel).toHaveTextContent("Cancel");
    expect(cancel).toHaveAttribute("aria-label", "Cancel");
    expect(cancel.querySelector("svg")).not.toBeNull();
    expect(appliedRules(cancel)["width"]).toBe("96px");
    // `con_PopUpConfirmation_Body.Width: =Min(490, …)`; the scrim `RGBA(0, 0, 0, 0.7)`.
    expect(appliedRules(dialog)["width"]).toBe("490px");
    const backdrop = document.querySelector(".fui-DialogSurface__backdrop");
    expect(backdrop).not.toBeNull();
    expect(declaredValues(backdrop as Element, "background-color")).toContain("rgba(0,0,0,0.7)");
    fireEvent.click(cancel);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCOST-932 shows the empty state when no countries load (real data path)", async () => {
    useFixtures.on = false;
    render(<Harness><CostsSettingsScreen /></Harness>);
    expect(await screen.findByText("No countries found")).toBeInTheDocument();
  });
});

/**
 * Rail-height parity. jsdom has no layout,
 * so the applied RULES are asserted, not pixel heights.
 */
describe("CostsSettingsScreen — picker/rail height parity", () => {
  beforeEach(() => { useFixtures.on = true; });

  it("UT-ADCOST-933 fills the body row instead of hugging it, and scrolls the right column, not the picker", () => {
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

  it("UT-ADCOST-934 keeps every country of a long list reachable in the DOM", () => {
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
