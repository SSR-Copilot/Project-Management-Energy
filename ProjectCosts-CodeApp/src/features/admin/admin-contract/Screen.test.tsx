// @vitest-environment jsdom
/**
 * Render tests for the Contracts settings screen, against a mocked data module: the picker
 * drives the list, Add is disabled at 10, Edit pre-fills and locks used accounts, a failed save
 * keeps the panel open with its input, a failed delete keeps the card, and a missing DevCo
 * table shows an error state instead of crashing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";

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

const api = vi.hoisted(() => ({
  /** The shared `vsb_countries` read (`@/data/countries`) — raw rows. */
  countriesGetAll: vi.fn(),
  listStandardContracts: vi.fn(),
  listContractDevCoRows: vi.fn(),
  getStandardContract: vi.fn(),
  saveStandardContract: vi.fn(),
  deleteStandardContract: vi.fn(),
  listCapexAccounts: vi.fn(),
}));

vi.mock("@/data/adminContract", async () => {
  const actual = await vi.importActual<typeof import("@/data/adminContract")>("@/data/adminContract");
  return {
    ...actual,
    listStandardContracts: api.listStandardContracts,
    listContractDevCoRows: api.listContractDevCoRows,
    getStandardContract: api.getStandardContract,
    saveStandardContract: api.saveStandardContract,
    deleteStandardContract: api.deleteStandardContract,
  };
});

vi.mock("@/data/contracts", () => ({ listCapexAccounts: api.listCapexAccounts }));

/** The admin rule (`useAdminAccess`): Application Administrator or Controller Own Data. */
const access = vi.hoisted(() => ({ admin: true }));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => access.admin }));

vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: { getAll: api.countriesGetAll },
}));

import { vsbTheme } from "@/theme/fluent";
import { appliedRules } from "@/test/appliedRules";
import { AppToaster } from "@/components";
import { ContractSaveError, DevCoTableUnavailableError, OwnershipConflictError } from "@/data/adminContract";
import { DataError, RecordGoneError } from "@/platform/errors";
import { CONTRACT_ALREADY_DELETED_MESSAGE, CONTRACT_GONE_MESSAGE } from "./messages";
import ContractsSettingsScreen from "./Screen";
import { CONTRACT_TYPE, INCOMPLETE_CLOSED_WARNING, TECHNOLOGY } from "./rules";
import {
  FRANCE_ID, GERMANY_ID, contract, fixtureAccounts, fixtureContracts, fixtureCountries, fixtureDevCo,
} from "./fixtures";

const WIND_PATH = `/admin/contract?country=${GERMANY_ID}&tech=${TECHNOLOGY.Wind}`;

/** The router's navigate, captured so a test can simulate back/forward or a URL edit. */
let navigate: NavigateFunction | undefined;
function NavProbe() {
  const nav = useNavigate();
  const location = useLocation();
  useEffect(() => { navigate = nav; }, [nav]);
  return <span data-testid="search">{location.search}</span>;
}

function renderScreen(path = WIND_PATH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        {/* `useNotify()` toasts render into the app toaster (AppShell mounts it in the app). */}
        <AppToaster />
        <MemoryRouter initialEntries={[path]}>
          <NavProbe />
          <Routes>
            <Route path="/admin/contract" element={<ContractsSettingsScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

/** Opens Edit on "Development Contract - Turbine" (owns 10101) and focuses into the drawer. */
async function openTurbineEdit(user: User) {
  await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
  await user.click(screen.getByTestId("btn_Edit_AdminContracts-c-dev"));
  expect(await screen.findByText("Edit Development Contract")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Loading contract...")).not.toBeInTheDocument());
  await user.click(screen.getByRole("textbox", { name: /^Description/, hidden: true }));
}

/**
 * jsdom/tabster keeps a just-opened drawer aria-hidden until focus enters it (a browser focuses
 * the first tabbable element on open); the timing varies under load, so focus it explicitly.
 */
async function focusDrawer(user: User) {
  await user.click(await screen.findByRole("textbox", { name: /^Description/, hidden: true }));
}

/** Opens New Construction and fills a valid form with 10102 selected. */
async function fillNewConstruction(user: User) {
  await user.click(screen.getByRole("button", { name: "Add Construction Contract" }));
  expect(await screen.findByText("New Construction Contract")).toBeInTheDocument();
  await focusDrawer(user);
  await user.type(screen.getByRole("textbox", { name: /^Description/ }), "Cabling");
  await user.type(screen.getByRole("textbox", { name: "Month Difference" }), "4");
  await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses" }));
  await user.click(screen.getByRole("checkbox", { name: "10102 Environmental study" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  access.admin = true;
  api.countriesGetAll.mockResolvedValue({
    success: true,
    data: fixtureCountries.map((c) => ({
      vsb_countryid: c.id, vsb_name: c.name, vsb_isocurrencycode: c.isoCurrencyCode, statecode: 0,
    })),
  });
  api.listStandardContracts.mockResolvedValue(fixtureContracts);
  api.listContractDevCoRows.mockResolvedValue(fixtureDevCo);
  api.listCapexAccounts.mockResolvedValue(fixtureAccounts);
  api.getStandardContract.mockImplementation(async (id: string) => fixtureContracts.find((c) => c.id === id));
});
afterEach(() => {
  cleanup();
  navigate = undefined;
  vi.restoreAllMocks();
});

describe("ContractsSettingsScreen", () => {
  it("UT-ADCONTR-901 starts on the first country / first technology with no URL params, offering only allow-list countries", async () => {
    renderScreen("/admin/contract");
    // PO 2026-10-17 (replaces the earlier no-selection start): the screen opens on Germany / Wind without a click.
    expect(await screen.findByText("Contracts / Germany / Wind")).toBeInTheDocument();
    expect(await screen.findByText("Development Contract - Turbine")).toBeInTheDocument();
    expect(api.listStandardContracts).toHaveBeenCalledWith(GERMANY_ID, TECHNOLOGY.Wind);
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeEnabled();
    expect(screen.queryByText("Select a country and technology")).not.toBeInTheDocument();
    // Display-only default: the URL stays clean until the user's first pick.
    expect(screen.getByTestId("search").textContent).toBe("");
    // Same rail as Costs / Project Gates: the country name is text; its +/- button is the control.
    expect(screen.getByRole("button", { name: "Collapse Germany" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spain/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Spain")).not.toBeInTheDocument();
  });

  it("UT-ADCONTR-902 shows the no-countries empty state, with Add disabled and no contract query, when the list is empty", async () => {
    api.countriesGetAll.mockResolvedValue({ success: true, data: [] });
    renderScreen("/admin/contract");
    expect(await screen.findByText("No countries available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeDisabled();
    expect(api.listStandardContracts).not.toHaveBeenCalled();
  });

  it("UT-ADCONTR-903 a pick pushes ?country&tech and Back returns to the default scope with a clean URL", async () => {
    const user = userEvent.setup();
    renderScreen("/admin/contract");
    await screen.findByText("Contracts / Germany / Wind");
    await user.click(screen.getByRole("button", { name: "Expand France" }));
    await user.click(screen.getByRole("button", { name: "France PV" }));
    expect(await screen.findByText("Contracts / France / PV")).toBeInTheDocument();
    expect(api.listStandardContracts).toHaveBeenCalledWith(FRANCE_ID, TECHNOLOGY.PV);
    expect(screen.getByTestId("search").textContent).toBe(`?country=${FRANCE_ID}&tech=${TECHNOLOGY.PV}`);
    act(() => navigate!(-1));
    expect(await screen.findByText("Contracts / Germany / Wind")).toBeInTheDocument();
    expect(screen.getByTestId("search").textContent).toBe("");
    // No unsaved-changes prompt: nothing was open, and the clean URL resolves to the default.
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("UT-ADCONTR-904 a URL change from the default scope prompts and Keep editing restores it", async () => {
    const user = userEvent.setup();
    renderScreen("/admin/contract");
    await screen.findByText("Development Contract - Turbine");
    await fillNewConstruction(user);
    act(() => navigate!(`/admin/contract?country=${FRANCE_ID}&tech=${TECHNOLOGY.PV}`));
    expect(await screen.findByText(/The country or technology changed while this contract was open/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
    expect(await screen.findByText("Contracts / Germany / Wind")).toBeInTheDocument();
  });

  it("UT-ADCONTR-905 drives the list from the picker", async () => {
    const user = userEvent.setup();
    renderScreen("/admin/contract");
    // The screen opens expanded on the default country, so the pick is one click.
    await user.click(await screen.findByRole("button", { name: "Germany PV" }));
    expect(await screen.findByText("Contracts / Germany / PV")).toBeInTheDocument();
    expect(await screen.findByText("Development Contract - Turbine")).toBeInTheDocument();
    expect(api.listStandardContracts).toHaveBeenCalledWith(GERMANY_ID, TECHNOLOGY.Wind);
    expect(api.listStandardContracts).toHaveBeenCalledWith(GERMANY_ID, TECHNOLOGY.PV);
    // Development sorts before Construction.
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Development Contract - Turbine", "Construction Contract - Grid"]);
  });

  it("UT-ADCONTR-906 disables Add Development at 10 development contracts and keeps Add Construction enabled", async () => {
    api.listStandardContracts.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => contract({ id: `d${i}`, name: `Development Contract - ${i}` })),
    );
    renderScreen();
    await screen.findByText("Development Contract - 0");
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeEnabled();
  });

  it("UT-ADCONTR-907 the Comment textarea renders no rows attribute (TextAreaField rows='auto' = browser default)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Construction Contract" }));
    expect(await screen.findByText("New Construction Contract")).toBeInTheDocument();
    await focusDrawer(user);
    const comment = screen.getByRole("textbox", { name: /^Comment/, hidden: true });
    expect(comment.tagName).toBe("TEXTAREA");
    expect(comment).not.toHaveAttribute("rows");
    // The control-label gate (CONVENTIONS rule 16) requires an explicit aria-label; it repeats the caption, so the name is unchanged.
    expect(comment).toHaveAttribute("aria-label", "Comment");
  });

  it("UT-ADCONTR-908 a failed contracts load shows the fatal state; Retry refetches only that query", async () => {
    const user = userEvent.setup();
    // 403: not retried by the hook's retry rule, so the failure surfaces at once.
    api.listStandardContracts.mockRejectedValue(new DataError("list standard contracts", "denied", 403));
    renderScreen();
    expect(await screen.findByText("Standard contracts could not be loaded")).toBeInTheDocument();
    expect(api.listStandardContracts).toHaveBeenCalledTimes(1);
    api.listStandardContracts.mockResolvedValue(fixtureContracts);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Development Contract - Turbine")).toBeInTheDocument();
    expect(api.countriesGetAll).toHaveBeenCalledTimes(1);
  });

  it("UT-ADCONTR-909 shows the card body with closing reference, margin and DevCo tags", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Construction Contract - Grid" }));
    const card = screen.getByRole("article", { name: "Construction Contract - Grid" });
    expect(within(card).getByText("FID - 3 months")).toBeInTheDocument();
    expect(within(card).getByText("Margin [%]")).toBeInTheDocument();
    expect(within(card).getByText("Other CAPEX :")).toBeInTheDocument();
    expect(within(card).getByText("Insurance")).toBeInTheDocument();
    expect(within(card).getByText("Checked by finance")).toBeInTheDocument();
  });

  it("UT-ADCONTR-910 pre-fills Edit, locks accounts used by another contract and keeps Save disabled until a change", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByTestId("btn_Edit_AdminContracts-c-dev"));
    expect(await screen.findByText("Edit Development Contract")).toBeInTheDocument();
    // jsdom: focus lands on the drawer surface, and tabster keeps the drawer aria-hidden until
    // focus enters a tabbable element inside it (a browser focuses the first one on open).
    const description = screen.getByRole("textbox", { name: /^Description/, hidden: true });
    await user.click(description);
    expect(screen.getByRole("textbox", { name: /^Description/ })).toHaveValue("Turbine");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Expand 20000 Other CAPEX" }));
    const used = screen.getByRole("checkbox", { name: "20101 Insurance" });
    expect(used).toBeChecked();
    expect(used).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses" }));
    expect(screen.getByRole("checkbox", { name: "10101 Grid connection" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "10101 Grid connection" })).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: "10102 Environmental study" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("UT-ADCONTR-911 keeps the panel open with the input when the save fails part-way", { timeout: 20000 }, async () => {
    // Deterministic under machine load: explicit waits, each step's visible outcome awaited
    // before the next, and drawer content queried with `hidden: true` (tabster may mark the
    // drawer aria-hidden while focus moves).
    const T = { timeout: 5000 };
    const H = { hidden: true } as const;
    const user = userEvent.setup();
    api.saveStandardContract.mockRejectedValue(new ContractSaveError("additions", "new-id", new Error("bulk")));
    renderScreen();
    await screen.findByText("Development Contract - Turbine", undefined, T);
    await user.click(screen.getByRole("button", { name: "Add Construction Contract" }));
    expect(await screen.findByText("New Construction Contract", undefined, T)).toBeInTheDocument();

    const description = await screen.findByRole("textbox", { name: /^Description/, ...H }, T);
    await user.click(description);
    await user.type(description, "Cabling");
    await waitFor(() => expect(description).toHaveValue("Cabling"), T);
    const months = screen.getByRole("textbox", { name: "Month Difference", ...H });
    await user.type(months, "123");
    expect(await screen.findByText("Only whole numbers with up to two digits are allowed.", undefined, T)).toBeInTheDocument();
    await user.clear(months);
    await user.type(months, "4");
    await waitFor(() => expect(months).toHaveValue("4"), T);
    await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses", ...H }));
    const used = await screen.findByRole("checkbox", { name: "10101 Grid connection", ...H }, T);
    expect(used).toBeDisabled(); // used by c-dev
    const study = screen.getByRole("checkbox", { name: "10102 Environmental study", ...H });
    await user.click(study);
    await waitFor(() => expect(study).toBeChecked(), T);

    const save = screen.getByRole("button", { name: "Save", ...H });
    await waitFor(() => expect(save).toBeEnabled(), T);
    await user.click(save);

    await waitFor(() => expect(api.saveStandardContract).toHaveBeenCalledTimes(1), T);
    expect((await screen.findAllByText(/some DevCo accounts were not linked/, undefined, T)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText("Please wait, saving...")).not.toBeInTheDocument(), T);
    expect(screen.getByRole("textbox", { name: /^Description/, ...H })).toHaveValue("Cabling");
    // The title stays "New …" until a save fully succeeds; the created parent is
    // remembered, so the retry updates it.
    expect(screen.getByText("New Construction Contract")).toBeInTheDocument();
    expect(api.saveStandardContract.mock.calls[0]![0]).toMatchObject({
      contractType: CONTRACT_TYPE.Construction, countryId: GERMANY_ID, technology: TECHNOLOGY.Wind,
    });
    api.saveStandardContract.mockResolvedValue({ contractId: "new-id" });
    const retry = screen.getByRole("button", { name: "Save", ...H });
    await waitFor(() => expect(retry).toBeEnabled(), T);
    await user.click(retry);
    await waitFor(() => expect(api.saveStandardContract).toHaveBeenCalledTimes(2), T);
    await waitFor(() => expect(screen.queryByText("New Construction Contract")).not.toBeInTheDocument(), T);
    expect(api.saveStandardContract.mock.calls[1]![0]).toMatchObject({ contractId: "new-id" });
  });

  it("UT-ADCONTR-912 asks before discarding unsaved changes", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    await user.type(screen.getByRole("textbox", { name: /^Description/ }), "x");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard", hidden: true }));
    await waitFor(() => expect(screen.queryByText("New Development Contract")).not.toBeInTheDocument());
  });

  it("UT-ADCONTR-913 keeps the card and shows an error when the delete is refused", async () => {
    const user = userEvent.setup();
    api.deleteStandardContract.mockRejectedValue(new DataError("delete BoP standard contract", "plugin refused", 400));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByTestId("btn_Delete_AdminContracts-c-dev"));
    expect(await screen.findByText('Are you sure that you want to permanently delete "Development Contract - Turbine" contract?')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm", hidden: true }));
    expect(await screen.findByText(/The contract could not be deleted/)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Development Contract - Turbine" })).toBeInTheDocument();
  });

  it("UT-ADCONTR-914 deleting a contract another user already deleted (404) is done: notice, no error, list refetched", async () => {
    const user = userEvent.setup();
    api.deleteStandardContract.mockImplementation(async () => {
      api.listStandardContracts.mockResolvedValue(fixtureContracts.filter((c) => c.id !== "c-dev"));
      return { alreadyDeleted: true };
    });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    const reads = api.listStandardContracts.mock.calls.length;
    await user.click(screen.getByTestId("btn_Delete_AdminContracts-c-dev"));
    await user.click(await screen.findByRole("button", { name: "Confirm", hidden: true }));
    expect(await screen.findByText(CONTRACT_ALREADY_DELETED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/may still be in use/)).not.toBeInTheDocument();
    expect(screen.queryByText("Contract deleted")).not.toBeInTheDocument();
    await waitFor(() => expect(api.listStandardContracts.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Development Contract - Turbine" })).not.toBeInTheDocument());
  });

  it("UT-ADCONTR-915 shows an error state, not a crash, when the DevCo link table is unavailable", async () => {
    const user = userEvent.setup();
    api.listContractDevCoRows.mockRejectedValue(new DevCoTableUnavailableError("list"));
    renderScreen();
    expect((await screen.findAllByText(/DevCo account link table is not available/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Expand Development Contract - Turbine" }));
    expect(screen.getByText("DevCo cost links could not be loaded.")).toBeInTheDocument();
  });

  it("UT-ADCONTR-916 shows the empty state for a selection with no contracts", async () => {
    api.listStandardContracts.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText("No standard contracts for Germany / Wind")).toBeInTheDocument();
  });
});

describe("Gap closure", () => {
  it("UT-ADCONTR-917 an ownership conflict removes the account from the selection, locks it, and a retry succeeds", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockImplementationOnce(async () => {
      // Meanwhile another admin linked 10102 to the construction contract.
      api.listContractDevCoRows.mockResolvedValue([
        ...fixtureDevCo, { id: "child-3", contractId: "c-con", accountId: "l3-b", rootAccountId: "root-dev" },
      ]);
      throw new ContractSaveError("check", "c-dev", new OwnershipConflictError(["l3-b"]));
    });
    renderScreen();
    await openTurbineEdit(user);
    await user.type(screen.getByRole("textbox", { name: /^Description/ }), " 2");
    await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses" }));
    await user.click(screen.getByRole("checkbox", { name: "10102 Environmental study" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findAllByText(/Account 10102 was just linked to another standard contract and has been removed/)).length)
      .toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "10102 Environmental study" })).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: "10102 Environmental study" })).toBeChecked();
    expect(screen.getByText("Used")).toBeInTheDocument();

    api.saveStandardContract.mockResolvedValue({ contractId: "c-dev" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(screen.queryByText("Edit Development Contract")).not.toBeInTheDocument());
    expect(api.saveStandardContract.mock.calls[1]![0].form.selectedAccountIds).toEqual(["l3-a"]);
  });

  it("UT-ADCONTR-918 a URL change while a dirty panel is open prompts; Keep editing restores the scope and the save writes it", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockResolvedValue({ contractId: "new-id" });
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await fillNewConstruction(user);

    act(() => navigate!(`/admin/contract?country=${FRANCE_ID}&tech=${TECHNOLOGY.PV}`));
    expect(await screen.findByText(/The country or technology changed while this contract was open/)).toBeInTheDocument();
    // jsdom/tabster: the drawer and dialog toggle aria-hidden as modals stack, so these
    // queries include hidden elements.
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
    expect(await screen.findByText("Contracts / Germany / Wind")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save", hidden: true }));
    await waitFor(() => expect(api.saveStandardContract).toHaveBeenCalledTimes(1));
    expect(api.saveStandardContract.mock.calls[0]![0]).toMatchObject({ countryId: GERMANY_ID, technology: TECHNOLOGY.Wind });
  });

  it("UT-ADCONTR-919 a URL change closes a clean panel, and Discard closes a dirty one", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    expect(await screen.findByText("New Development Contract")).toBeInTheDocument();
    act(() => navigate!(`/admin/contract?country=${FRANCE_ID}&tech=${TECHNOLOGY.Wind}`));
    await waitFor(() => expect(screen.queryByText("New Development Contract")).not.toBeInTheDocument());
    expect(await screen.findByText("Contracts / France / Wind")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    await user.type(screen.getByRole("textbox", { name: /^Description/ }), "x");
    act(() => navigate!(-1));
    await user.click(await screen.findByRole("button", { name: "Discard", hidden: true }));
    await waitFor(() => expect(screen.queryByText("New Development Contract")).not.toBeInTheDocument());
    expect(api.saveStandardContract).not.toHaveBeenCalled();
  });

  it("UT-ADCONTR-920 Cancel after a partially failed new save warns about incomplete links and can keep editing", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockRejectedValue(new ContractSaveError("additions", "new-id", new Error("bulk")));
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await fillNewConstruction(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findAllByText(/some DevCo accounts were not linked/)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText(/The contract was saved, but its DevCo accounts are incomplete/)).toBeInTheDocument();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
    expect(screen.getByText("New Construction Contract")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await user.click(await screen.findByRole("button", { name: "Close anyway", hidden: true }));
    await waitFor(() => expect(screen.queryByText("New Construction Contract")).not.toBeInTheDocument());
    expect(await screen.findByText(INCOMPLETE_CLOSED_WARNING)).toBeInTheDocument();
  });

  it("UT-ADCONTR-921 Edit closes with an error when the DevCo re-read fails", async () => {
    const user = userEvent.setup();
    api.listContractDevCoRows
      .mockResolvedValueOnce(fixtureDevCo)
      .mockRejectedValue(new DevCoTableUnavailableError("list"));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByTestId("btn_Edit_AdminContracts-c-dev"));
    expect(await screen.findByText("The contract cannot be edited: DevCo account links are not available in this app yet."))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Edit Development Contract")).not.toBeInTheDocument());
  });

  it("UT-ADCONTR-922 a 403 on the parent update shows the permission message in the toast and the panel", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockRejectedValue(new ContractSaveError("parent", "c-dev", new DataError("update", "denied", 403)));
    renderScreen();
    await openTurbineEdit(user);
    await user.type(screen.getByRole("textbox", { name: /^Description/ }), " 2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const text = "You do not have permission to save standard contracts. Ask your administrator if you believe you should.";
    await waitFor(() => expect(screen.getAllByText(text)).toHaveLength(2));
    expect(screen.getByText("Edit Development Contract")).toBeInTheDocument();
  });

  it("UT-ADCONTR-923 editing a contract deleted meanwhile shows the message, closes the panel without a prompt, and refetches", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockRejectedValue(new ContractSaveError("parent", "c-dev", new RecordGoneError("update", "vsb_bopcontractsstandardassumptionses", "c-dev")));
    renderScreen();
    await openTurbineEdit(user);
    const reads = api.listStandardContracts.mock.calls.length;
    await user.type(screen.getByRole("textbox", { name: /^Description/ }), " 2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(CONTRACT_GONE_MESSAGE)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Edit Development Contract")).not.toBeInTheDocument());
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save", hidden: true })).not.toBeInTheDocument();
    await waitFor(() => expect(api.listStandardContracts.mock.calls.length).toBeGreaterThan(reads));
    expect(api.saveStandardContract).toHaveBeenCalledTimes(1);
  });

  it("UT-ADCONTR-924 after a save the saved card is expanded and an already expanded card stays expanded", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockImplementation(async () => {
      api.listStandardContracts.mockResolvedValue([
        ...fixtureContracts,
        contract({ id: "c-new", name: "Construction Contract - Cabling", contractType: CONTRACT_TYPE.Construction }),
      ]);
      return { contractId: "c-new" };
    });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Construction Contract - Grid" }));
    await fillNewConstruction(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Collapse Construction Contract - Cabling" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Construction Contract - Grid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Development Contract - Turbine" })).toBeInTheDocument();
  });

  it("UT-ADCONTR-925 a stale/invalid country GUID in the URL falls back to the default scope, leaving the params", async () => {
    renderScreen(`/admin/contract?country=not-a-guid&tech=${TECHNOLOGY.Wind}`);
    expect(await screen.findByText("Contracts / Germany / Wind")).toBeInTheDocument();
    expect(api.listStandardContracts).toHaveBeenCalledWith(GERMANY_ID, TECHNOLOGY.Wind);
    // No cleanup effect: the bad params stay until the user's first pick.
    expect(screen.getByTestId("search").textContent).toBe(`?country=not-a-guid&tech=${TECHNOLOGY.Wind}`);
  });

  it("UT-ADCONTR-926 the range message is locale-formatted and switching Margin Type clears the input", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    const pct = screen.getByRole("textbox", { name: /Margin \[%\]/ });
    await user.type(pct, "100.5");
    expect(await screen.findByText("Please select a value between 0 and 100.0")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Fixed Value" }));
    await user.click(screen.getByRole("radio", { name: "Percentage" }));
    expect(screen.getByRole("textbox", { name: /Margin \[%\]/ })).toHaveValue("");
  });

  it("UT-ADCONTR-927 a partially selected root checkbox is exposed as mixed (native indeterminate)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openTurbineEdit(user);
    const root = screen.getByRole("checkbox", { name: "Select all accounts in 10000 Development Expenses" });
    // Fluent sets the native `indeterminate` state, which browsers expose to AT as aria-checked="mixed".
    expect(root).toBePartiallyChecked();
    expect((root as HTMLInputElement).indeterminate).toBe(true);
  });

  it("UT-ADCONTR-928 an inactive standard contract shows an Inactive badge (kept unfiltered)", async () => {
    api.listStandardContracts.mockResolvedValue([
      fixtureContracts[0]!, { ...fixtureContracts[1]!, stateCode: 1 },
    ]);
    renderScreen();
    const card = await screen.findByRole("article", { name: "Development Contract - Turbine" });
    expect(within(card).getByText("Inactive")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Construction Contract - Grid" })).queryByText("Inactive"))
      .not.toBeInTheDocument();
  });

  it("UT-ADCONTR-929 renders the loading texts with a real ellipsis (no mojibake)", async () => {
    const user = userEvent.setup();
    api.listContractDevCoRows.mockReturnValue(new Promise(() => {}));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    const card = screen.getByRole("article", { name: "Development Contract - Turbine" });
    expect(within(card).getByText("Loading…")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("â€");

    api.listStandardContracts.mockReturnValue(new Promise(() => {}));
    act(() => navigate!(`/admin/contract?country=${FRANCE_ID}&tech=${TECHNOLOGY.Wind}`));
    expect((await screen.findAllByText("Loading contracts…")).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("â€");
  });

  it("UT-ADCONTR-930 a collapsed country stays collapsed when a technology elsewhere is selected", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Collapse Germany" }));
    await user.click(screen.getByRole("button", { name: "Expand France" }));
    await user.click(screen.getByRole("button", { name: "France Wind" }));
    expect(await screen.findByText("Contracts / France / Wind")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Germany" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse France" })).toBeInTheDocument();
  });

  it("UT-ADCONTR-931 narrow layout: keeps the same side-rail picker as Costs and Project Gates (no dropdown pair)", async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      renderScreen("/admin/contract");
      await user.click(await screen.findByRole("button", { name: "Expand France" }));
      expect(screen.queryByRole("combobox", { name: "Country" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "France Wind" }));
      expect(await screen.findByText("Contracts / France / Wind")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

/**
 * Rail-height parity: the picker rail stretches to the row, the content column scrolls. jsdom has no layout,
 * so the applied RULES are asserted, not pixel heights.
 */
describe("ContractsSettingsScreen — picker/rail height parity", () => {
  it("UT-ADCONTR-932 stretches the picker's row and gives the content column the screen's only scroller", async () => {
    renderScreen();
    const picker = await screen.findByRole("navigation", { name: "Country and technology" });
    // The picker's parent (`styles.root`) stretches its children:
    // "Picker | Fixed 200, height = parent".
    expect(appliedRules(picker.parentElement!)["align-items"]).toBe("stretch");
    // …and the content column owns the scroll region (one scroll container).
    const content = picker.nextElementSibling!;
    const rules = appliedRules(content);
    expect(rules["overflow-y"]).toBe("auto");
    expect(rules["min-height"]).toBe("0px"); // `minHeight: "0"`, normalised by cssstyle
  });
});

/**
 * Canvas parity pass (list view and panel parity). jsdom has no layout, so these
 * assert the APPLIED RULES (Griffel atomic classes read off `document.styleSheets`), DOM structure
 * and behaviour, never pixels.
 */
/** Declarations of every nested rule (`.cls descendant`) whose selector hangs off one of `el`'s classes. */
function nestedRules(el: Element, fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = [];
    try { rules = Array.from(sheet.cssRules ?? []); } catch { continue; }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(fragment)) continue;
      const own = Array.from(el.classList).some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(rule.selectorText));
      if (!own) continue;
      for (const prop of Array.from(rule.style)) out[prop] = rule.style.getPropertyValue(prop);
    }
  }
  return out;
}

/**
 * Every value an element's classes declare for `prop` (`appliedRules` keeps one per property, in
 * sheet order, which lets Fluent's `makeResetStyles` rule win over an override in jsdom; in a
 * browser the atomic override wins). Colours are normalised by jsdom to `rgb()`.
 */
function declared(el: Element, ...props: string[]): string[] {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = [];
    try { rules = Array.from(sheet.cssRules ?? []); } catch { continue; }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.startsWith(".")) continue;
      if (!el.classList.contains(rule.selectorText.slice(1))) continue;
      for (const p of props) { const v = rule.style.getPropertyValue(p); if (v) out.push(v); }
    }
  }
  return out;
}

describe("Canvas parity pass: list view", () => {
  it("UT-ADCONTR-933 the DevCo tag container wraps and may shrink (no horizontal scrollbar), header + tags per row", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Construction Contract - Grid" }));
    const group = screen.getByLabelText("Other CAPEX accounts");
    const rules = appliedRules(group);
    expect(rules["display"]).toBe("flex");
    expect(rules["flex-wrap"]).toBe("wrap");
    expect(rules["min-width"]).toBe("0px");
    expect(rules["flex-grow"]).toBe("1");
    const row = group.parentElement!;
    expect(row.firstElementChild).toHaveTextContent("Other CAPEX :");
    expect(appliedRules(row)["display"]).toBe("flex");
    expect(appliedRules(row)["margin-bottom"]).toBe("12px");
    expect(appliedRules(row.firstElementChild!)["flex-shrink"]).toBe("0");
    const tag = within(group).getByText("Insurance").closest(".fui-Tag")!;
    expect(declared(tag, "background-color")).toContain("rgb(237, 235, 233)");
    expect(declared(tag, "max-width")).toContain("100%");
  });

  it("UT-ADCONTR-934 long unbroken values wrap instead of widening the card", async () => {
    const user = userEvent.setup();
    api.listStandardContracts.mockResolvedValue([
      { ...fixtureContracts[0]!, comment: "a".repeat(300), description: "b".repeat(300) },
    ]);
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Construction Contract - Grid" }));
    const comment = screen.getByText("a".repeat(300));
    expect(appliedRules(comment)["overflow-wrap"]).toBe("anywhere");
    expect(declared(comment, "font-weight")).toContain("var(--fontWeightSemibold)");
    expect(appliedRules(screen.getByText("b".repeat(300)))["overflow-wrap"]).toBe("anywhere");
    expect(appliedRules(comment.parentElement!)["min-width"]).toBe("0px");
  });

  it("UT-ADCONTR-935 the Add buttons follow a fixed 250 px label (left aligned), not the right edge", async () => {
    renderScreen();
    const toolbar = await screen.findByRole("toolbar", { name: "Contracts" });
    const title = within(toolbar).getByRole("heading", { level: 2 });
    expect(appliedRules(title)["width"]).toBe("250px");
    expect(appliedRules(title)["margin-right"]).toBe("0px");
    expect(appliedRules(title)["margin-top"]).toBe("0px");
    expect(toolbar.children[1]).toBe(screen.getByRole("button", { name: "Add Development Contract" }));
    expect(toolbar.children[2]).toBe(screen.getByRole("button", { name: "Add Construction Contract" }));
  });

  it("UT-ADCONTR-936 the Apply to All and per-contract Apply bars render disabled and call nothing", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Construction Contract - Grid" }));
    const all = screen.getByRole("button", { name: "Apply to All" });
    expect(all).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(
      "Apply standard contracts to all relevant projects, this will override existing standard assumption contracts",
    )).toBeInTheDocument();
    expect(screen.getByTestId("con_AdminContract_ApplyAll_Inner_Warning_Button")).toHaveStyle({ backgroundColor: "rgba(204, 226, 241, 0.5)" });
    const one = screen.getByTestId("btn_Apply_Individual_AdminContracts-c-con");
    expect(one).toHaveAccessibleName("Apply");
    expect(one).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(
      "Apply standard cost to relevant projects, this will override existing standard assumption contracts",
    )).toBeInTheDocument();
    // No tracking line: its table does not exist, so nothing is rendered.
    expect(screen.queryByText(/Apply was made by/)).not.toBeInTheDocument();
    const reads = api.listStandardContracts.mock.calls.length;
    await user.click(all);
    await user.click(one);
    expect(api.listStandardContracts.mock.calls.length).toBe(reads);
    expect(api.saveStandardContract).not.toHaveBeenCalled();
    expect(api.deleteStandardContract).not.toHaveBeenCalled();
  });

  it("UT-ADCONTR-937 card chrome: blue chevron, 0 left inset, cards touch; fields are 16 px headings over 15 px semibold values", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Construction Contract - Grid" }));
    const card = screen.getByRole("article", { name: "Construction Contract - Grid" });
    const chevron = within(card).getByRole("button", { name: "Collapse Construction Contract - Grid" });
    expect(declared(chevron, "color")).toContain("rgb(0, 120, 212)");
    const header = card.firstElementChild!;
    expect(declared(header, "padding-left")).toEqual(["0px"]);
    expect(declared(header, "border-bottom-color")).toContain("rgb(0, 120, 212)");
    const body = document.getElementById("contract-card-body-c-con")!;
    expect(declared(body, "padding-left")).toEqual(["0px"]);
    expect(declared(body, "padding-bottom")).toEqual(["10px"]);
    expect(declared(card.parentElement!, "row-gap", "gap")).toContain("0px");
    const heading = within(card).getByText("Description");
    expect(appliedRules(heading)["font-size"]).toBe("var(--fontSizeBase400)"); // 16 px
    expect(appliedRules(heading)["min-height"]).toBe("30px");
    const value = within(card).getByText("Grid");
    expect(appliedRules(value)["font-size"]).toBe("15px");
    expect(appliedRules(value)["font-weight"]).toBe("var(--fontWeightSemibold)");
  });
});

describe("Canvas parity pass: panel", () => {
  it("UT-ADCONTR-938 the three radio groups are stacked (no horizontal row class) and the columns split ~360 | rest", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    for (const name of ["Closing Date Reference", "Margin", "Margin Type"]) {
      const group = screen.getByRole("radiogroup", { name });
      expect(group).not.toHaveClass("canvas-radio-row");
      expect(appliedRules(group)["flex-direction"]).not.toBe("row");
    }
    const columns = screen.getByRole("region", { name: "DevCo Cost Form" }).parentElement!.parentElement!;
    const rules = appliedRules(columns);
    expect(rules["grid-template-columns"]).toBe("minmax(0, 360px) minmax(0, 1fr)");
    expect(rules["column-gap"]).toBe("40px");
    // Labels are semibold again inside this panel only (canvas.css forces 400 globally).
    expect(nestedRules(columns, ".fui-Field")["font-weight"]).toBe("var(--fontWeightSemibold)");
  });

  it("UT-ADCONTR-939 Month Difference: 100 px operator, 20 px gap, 160 px number box", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    const sign = screen.getByRole("combobox", { name: "Month Difference" });
    const row = sign.parentElement!.parentElement!;
    expect(declared(row, "column-gap", "gap")).toContain("20px");
    expect(declared(sign.parentElement!, "width")).toContain("100px");
    expect(declared(screen.getByRole("textbox", { name: "Month Difference" }).parentElement!, "width")).toContain("160px");
  });

  it("UT-ADCONTR-940 the Comment counter sits right-aligned in the label row and stays the textbox description", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    const comment = screen.getByRole("textbox", { name: /^Comment/ });
    expect(comment).toHaveAccessibleName("Comment");
    expect(comment).toHaveAccessibleDescription("0/50");
    expect(comment).not.toHaveAttribute("rows");
    const counter = screen.getByText("0/50");
    const label = counter.parentElement!;
    expect(label.tagName).toBe("LABEL");
    const row = appliedRules(label);
    expect(row["justify-content"]).toBe("space-between");
    expect(row["display"]).toBe("flex");
    expect(row["width"]).toBe("100%");
    expect(row["max-width"]).toBe("none");
    expect(row["justify-self"]).toBe("stretch");
    // canvas.css only targets `.fui-Field label` for font-weight; nothing there touches layout.
    expect(Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules ?? []))
      .filter((r) => r instanceof CSSStyleRule && /fui-Field|fui-Label/.test(r.selectorText) && !r.selectorText.startsWith(".f"))
      .every((r) => !(r as CSSStyleRule).style.display && !(r as CSSStyleRule).style.width)).toBe(true);
    await user.type(comment, "  hi  ");
    expect(screen.getByText("2/50")).toBeInTheDocument();
  });

  it("UT-ADCONTR-941 the footer keeps 20 px between Save and Cancel and is 60 px high for this panel", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    // `PanelButtons gap={20}`: Cancel carries the extra 10 px margin on top of the 10 px footer gap.
    expect(declared(screen.getByRole("button", { name: "Cancel" }), "margin-left")).toContain("10px");
    const drawer = document.querySelector(".canvas-panel-full")!;
    expect(nestedRules(drawer, ".canvas-panel-footer")["height"]).toBe("60px");
  });

  it("UT-ADCONTR-942 the panel title bar is 46 px with a 16 px title (ACS:1853, 1875), scoped to this panel", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    await focusDrawer(user);
    const drawer = document.querySelector(".canvas-panel-full")!;
    expect(nestedRules(drawer, ".canvas-panel-header")["height"]).toBe("46px");
    expect(nestedRules(drawer, ".canvas-panel-header h2")["font-size"]).toBe("16px");
  });

  it("UT-ADCONTR-943 tree rows: root checkbox states (partial blue with minus, locked grey), chevrons blue, USED orange with its text intact", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openTurbineEdit(user);
    const mixed = screen.getByRole("checkbox", { name: "Select all accounts in 10000 Development Expenses" });
    expect(mixed).toBePartiallyChecked();
    expect(nestedRules(mixed.parentElement!, "fui-Checkbox__indicator")["background-color"]).toBe("rgb(0, 110, 185)");
    expect(mixed.parentElement!.querySelector("svg")).not.toBeNull();
    const chevron = screen.getByRole("button", { name: "Expand 10000 Development Expenses" });
    expect(declared(chevron, "color")).toContain("rgb(0, 110, 185)");

    const locked = screen.getByRole("checkbox", { name: "Select all accounts in 20000 Other CAPEX" });
    expect(locked).toBeChecked();
    expect(locked).toBeDisabled();
    expect(nestedRules(locked.parentElement!, "fui-Checkbox__indicator")["background-color"]).toBe("rgb(200, 198, 196)");

    await user.click(screen.getByRole("button", { name: "Expand 20000 Other CAPEX" }));
    const used = screen.getByRole("checkbox", { name: "20101 Insurance" });
    expect(used).toBeChecked();
    expect(used).toBeDisabled();
    const usedRules = nestedRules(used.parentElement!, "fui-Checkbox__indicator");
    expect(usedRules["background-color"]).toBe("rgba(238, 148, 12, 0.125)");
    expect(usedRules["color"]).toBe("rgb(238, 148, 12)");
    // The accessible indication survives: description text, "Used" text, tooltip.
    expect(used).toHaveAccessibleDescription("Used by another standard contract");
    expect(screen.getByText("Used")).toBeInTheDocument();
    expect(screen.getByTitle("20101 Insurance (Used by another standard contract)")).toBeInTheDocument();
  });

  it("UT-ADCONTR-944 tree rows: the child checkbox sits at the right, names truncate with an ellipsis and keep the full text in title", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openTurbineEdit(user);
    await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses" }));
    const leaf = screen.getByRole("checkbox", { name: "10102 Environmental study" });
    const label = screen.getByTitle("10102 Environmental study");
    expect(declared(label, "text-overflow")).toContain("ellipsis");
    expect(declared(label, "white-space")).toContain("nowrap");
    expect(declared(label, "font-size")).toContain("11px");
    // `labelPosition="before"`: the input stays first in the DOM (tab order unchanged) and the
    // label precedes the box, so the box is at the row's right end.
    expect(leaf.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const box = leaf.parentElement!.querySelector(".fui-Checkbox__indicator")!;
    expect(label.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Admin access", () => {
  it("UT-ADCONTR-945 an administrator can add, edit and delete", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeEnabled();
    expect(screen.getByTestId("btn_Edit_AdminContracts-c-dev")).toBeEnabled();
    expect(screen.getByTestId("btn_Delete_AdminContracts-c-dev")).toBeEnabled();
  });

  it("UT-ADCONTR-946 a non-administrator sees the contracts but every write command is disabled", async () => {
    access.admin = false;
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeDisabled();
    expect(screen.getByTestId("btn_Edit_AdminContracts-c-dev")).toBeDisabled();
    expect(screen.getByTestId("btn_Delete_AdminContracts-c-dev")).toBeDisabled();
    expect(api.saveStandardContract).not.toHaveBeenCalled();
    expect(api.deleteStandardContract).not.toHaveBeenCalled();
  });
});
