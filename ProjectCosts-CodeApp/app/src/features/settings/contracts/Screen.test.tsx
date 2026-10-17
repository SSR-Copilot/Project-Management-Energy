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
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";

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
  /** The shared `vsb_countries` read (`@/data/countries`, batch 2b) — raw rows. */
  countriesGetAll: vi.fn(),
  listStandardContracts: vi.fn(),
  listContractDevCoRows: vi.fn(),
  getStandardContract: vi.fn(),
  saveStandardContract: vi.fn(),
  deleteStandardContract: vi.fn(),
  listCapexAccounts: vi.fn(),
}));

vi.mock("@/data/settings/contracts", async () => {
  const actual = await vi.importActual<typeof import("@/data/settings/contracts")>("@/data/settings/contracts");
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

vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: { getAll: api.countriesGetAll },
}));

import { vsbTheme } from "@/theme/fluent";
import { AppToaster } from "@/components";
import { ContractSaveError, DevCoTableUnavailableError, OwnershipConflictError } from "@/data/settings/contracts";
import { DataError, RecordGoneError } from "@/platform/errors";
import { CONTRACT_ALREADY_DELETED_MESSAGE, CONTRACT_GONE_MESSAGE } from "./messages";
import ContractsSettingsScreen from "./Screen";
import { CONTRACT_TYPE, INCOMPLETE_CLOSED_WARNING, TECHNOLOGY } from "./rules";
import {
  FRANCE_ID, GERMANY_ID, contract, fixtureAccounts, fixtureContracts, fixtureCountries, fixtureDevCo,
} from "./fixtures";

const WIND_PATH = `/settings/contracts?country=${GERMANY_ID}&tech=${TECHNOLOGY.Wind}`;

/** The router's navigate, captured so a test can simulate back/forward or a URL edit (B-2). */
let navigate: NavigateFunction | undefined;
function NavProbe() {
  const nav = useNavigate();
  useEffect(() => { navigate = nav; }, [nav]);
  return null;
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
            <Route path="/settings/contracts" element={<ContractsSettingsScreen />} />
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
  await user.click(screen.getByRole("button", { name: "Edit Development Contract - Turbine" }));
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
  await user.type(screen.getByLabelText("Months"), "4");
  await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses" }));
  await user.click(screen.getByRole("checkbox", { name: "10102 Environmental study" }));
}

beforeEach(() => {
  vi.clearAllMocks();
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
  it("starts on an explicit empty state with the Add buttons disabled, offering only allow-list countries", async () => {
    renderScreen("/settings/contracts");
    expect(await screen.findByText("Select a country and technology")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeDisabled();
    // Same rail as Costs / Project Gates: the country name is text; its +/- button is the control.
    expect(screen.getByRole("button", { name: "Expand Germany" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spain/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Spain")).not.toBeInTheDocument();
    expect(api.listStandardContracts).not.toHaveBeenCalled();
  });

  it("drives the list from the picker", async () => {
    const user = userEvent.setup();
    renderScreen("/settings/contracts");
    await user.click(await screen.findByRole("button", { name: "Expand Germany" }));
    await user.click(screen.getByRole("button", { name: "Germany Wind" }));
    expect(await screen.findByText("Contracts / Germany / Wind")).toBeInTheDocument();
    expect(await screen.findByText("Development Contract - Turbine")).toBeInTheDocument();
    expect(api.listStandardContracts).toHaveBeenCalledWith(GERMANY_ID, TECHNOLOGY.Wind);
    // Development sorts before Construction.
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Development Contract - Turbine", "Construction Contract - Grid"]);
  });

  it("disables Add Development at 10 development contracts and keeps Add Construction enabled", async () => {
    api.listStandardContracts.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => contract({ id: `d${i}`, name: `Development Contract - ${i}` })),
    );
    renderScreen();
    await screen.findByText("Development Contract - 0");
    expect(screen.getByRole("button", { name: "Add Development Contract" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Add Construction Contract" })).toBeEnabled();
  });

  it("Wave C: the Comment textarea renders no rows attribute (TextAreaField rows='auto' = browser default)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Construction Contract" }));
    expect(await screen.findByText("New Construction Contract")).toBeInTheDocument();
    await focusDrawer(user);
    const comment = screen.getByRole("textbox", { name: /^Comment/, hidden: true });
    expect(comment.tagName).toBe("TEXTAREA");
    expect(comment).not.toHaveAttribute("rows");
    expect(comment).not.toHaveAttribute("aria-label");
  });

  it("Wave C (H1 options): a failed contracts load shows the fatal state; Retry refetches only that query", async () => {
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

  it("shows the card body with closing reference, margin and DevCo tags", async () => {
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

  it("pre-fills Edit, locks accounts used by another contract and keeps Save disabled until a change", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByRole("button", { name: "Edit Development Contract - Turbine" }));
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

  it("keeps the panel open with the input when the save fails part-way", { timeout: 20000 }, async () => {
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
    const months = screen.getByRole("textbox", { name: "Months", ...H });
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
    // B-3: the title stays "New …" until a save fully succeeds; the created parent is
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

  it("asks before discarding unsaved changes", async () => {
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

  it("keeps the card and shows an error when the delete is refused", async () => {
    const user = userEvent.setup();
    api.deleteStandardContract.mockRejectedValue(new DataError("delete BoP standard contract", "plugin refused", 400));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByRole("button", { name: "Delete Development Contract - Turbine" }));
    expect(await screen.findByText('Are you sure that you want to permanently delete "Development Contract - Turbine" contract?')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm", hidden: true }));
    expect(await screen.findByText(/The contract could not be deleted/)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Development Contract - Turbine" })).toBeInTheDocument();
  });

  it("R3-1: deleting a contract another user already deleted (404) is done: notice, no error, list refetched", async () => {
    const user = userEvent.setup();
    api.deleteStandardContract.mockImplementation(async () => {
      api.listStandardContracts.mockResolvedValue(fixtureContracts.filter((c) => c.id !== "c-dev"));
      return { alreadyDeleted: true };
    });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    const reads = api.listStandardContracts.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Delete Development Contract - Turbine" }));
    await user.click(await screen.findByRole("button", { name: "Confirm", hidden: true }));
    expect(await screen.findByText(CONTRACT_ALREADY_DELETED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/may still be in use/)).not.toBeInTheDocument();
    expect(screen.queryByText("Contract deleted")).not.toBeInTheDocument();
    await waitFor(() => expect(api.listStandardContracts.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Development Contract - Turbine" })).not.toBeInTheDocument());
  });

  it("shows an error state, not a crash, when the DevCo link table is unavailable", async () => {
    const user = userEvent.setup();
    api.listContractDevCoRows.mockRejectedValue(new DevCoTableUnavailableError("list"));
    renderScreen();
    expect((await screen.findAllByText(/DevCo account link table is not available/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Expand Development Contract - Turbine" }));
    expect(screen.getByText("DevCo cost links could not be loaded.")).toBeInTheDocument();
  });

  it("shows the empty state for a selection with no contracts", async () => {
    api.listStandardContracts.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText("No standard contracts for Germany / Wind")).toBeInTheDocument();
  });
});

describe("gap closure (08-gap-analysis)", () => {
  it("B-1: an ownership conflict removes the account from the selection, locks it, and a retry succeeds", async () => {
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

  it("B-2: a URL change while a dirty panel is open prompts; Keep editing restores the scope and the save writes it", async () => {
    const user = userEvent.setup();
    api.saveStandardContract.mockResolvedValue({ contractId: "new-id" });
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await fillNewConstruction(user);

    act(() => navigate!(`/settings/contracts?country=${FRANCE_ID}&tech=${TECHNOLOGY.PV}`));
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

  it("B-2: a URL change closes a clean panel, and Discard closes a dirty one", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await user.click(screen.getByRole("button", { name: "Add Development Contract" }));
    expect(await screen.findByText("New Development Contract")).toBeInTheDocument();
    act(() => navigate!(`/settings/contracts?country=${FRANCE_ID}&tech=${TECHNOLOGY.Wind}`));
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

  it("B-3: Cancel after a partially failed new save warns about incomplete links and can keep editing", async () => {
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

  it("B-4: Edit closes with an error when the DevCo re-read fails", async () => {
    const user = userEvent.setup();
    api.listContractDevCoRows
      .mockResolvedValueOnce(fixtureDevCo)
      .mockRejectedValue(new DevCoTableUnavailableError("list"));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByRole("button", { name: "Edit Development Contract - Turbine" }));
    expect(await screen.findByText("The contract cannot be edited: DevCo account links are not available in this app yet."))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Edit Development Contract")).not.toBeInTheDocument());
  });

  it("FR-1: a 403 on the parent update shows the permission message in the toast and the panel", async () => {
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

  it("V-1 / R3-2: editing a contract deleted meanwhile shows the message, closes the panel without a prompt, and refetches", async () => {
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

  it("FR-5: after a save the saved card is expanded and an already expanded card stays expanded", async () => {
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

  it("FR-2: an invalid country GUID in the URL falls back to the empty state", async () => {
    renderScreen(`/settings/contracts?country=not-a-guid&tech=${TECHNOLOGY.Wind}`);
    expect(await screen.findByText("Select a country and technology")).toBeInTheDocument();
    expect(api.listStandardContracts).not.toHaveBeenCalled();
  });

  it("FR-13: the range message is locale-formatted and switching Margin Type clears the input", async () => {
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

  it("FR-22: a partially selected root checkbox is exposed as mixed (native indeterminate)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openTurbineEdit(user);
    const root = screen.getByRole("checkbox", { name: "Select all accounts in 10000 Development Expenses" });
    // Fluent sets the native `indeterminate` state, which browsers expose to AT as aria-checked="mixed".
    expect(root).toBePartiallyChecked();
    expect((root as HTMLInputElement).indeterminate).toBe(true);
  });

  it("G-5: an inactive standard contract shows an Inactive badge (DR-2 kept unfiltered)", async () => {
    api.listStandardContracts.mockResolvedValue([
      fixtureContracts[0]!, { ...fixtureContracts[1]!, stateCode: 1 },
    ]);
    renderScreen();
    const card = await screen.findByRole("article", { name: "Development Contract - Turbine" });
    expect(within(card).getByText("Inactive")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Construction Contract - Grid" })).queryByText("Inactive"))
      .not.toBeInTheDocument();
  });

  it("renders the loading texts with a real ellipsis (no mojibake)", async () => {
    const user = userEvent.setup();
    api.listContractDevCoRows.mockReturnValue(new Promise(() => {}));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    const card = screen.getByRole("article", { name: "Development Contract - Turbine" });
    expect(within(card).getByText("Loading…")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("â€");

    api.listStandardContracts.mockReturnValue(new Promise(() => {}));
    act(() => navigate!(`/settings/contracts?country=${FRANCE_ID}&tech=${TECHNOLOGY.Wind}`));
    expect((await screen.findAllByText("Loading contracts…")).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("â€");
  });

  it("B-6: a collapsed country stays collapsed when a technology elsewhere is selected", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Collapse Germany" }));
    await user.click(screen.getByRole("button", { name: "Expand France" }));
    await user.click(screen.getByRole("button", { name: "France Wind" }));
    expect(await screen.findByText("Contracts / France / Wind")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Germany" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse France" })).toBeInTheDocument();
  });

  it("narrow layout: keeps the same side-rail picker as Costs and Project Gates (no dropdown pair)", async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      renderScreen("/settings/contracts");
      await user.click(await screen.findByRole("button", { name: "Expand France" }));
      expect(screen.queryByRole("combobox", { name: "Country" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "France Wind" }));
      expect(await screen.findByText("Contracts / France / Wind")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});
