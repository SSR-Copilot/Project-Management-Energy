// @vitest-environment jsdom
/**
 * Render counts of Application Settings → Contracts (D162 B5, FE-AD-05). The screen is mounted as in `Screen.test.tsx` (the
 * data module mocked) and `probeRender` counts the cards (`ContractCard:<id>`) and the panel's account tree (`DevCoCostForm`).
 *
 * The panel's form lives in the screen, so every keystroke renders the screen. Before FE-AD-05 that rendered every card and the
 * DevCo tree (with a new selected-id set) too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn().mockResolvedValue({ success: true, data: [] }),
    retrieveRecordAsync: vi.fn().mockResolvedValue({ success: true, data: {} }),
    createRecordAsync: vi.fn(), updateRecordAsync: vi.fn(), deleteRecordAsync: vi.fn(), executeAsync: vi.fn(),
  }),
}));

const api = vi.hoisted(() => ({
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
vi.mock("@/data/capexAccounts", () => ({ listActiveCapexAccounts: api.listCapexAccounts }));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: { getAll: api.countriesGetAll } }));

import { structuralSharingWithDates } from "@/app/queryStructuralSharing";
import { AppToaster } from "@/components";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import { vsbTheme } from "@/theme/fluent";
import ContractsSettingsScreen from "./Screen";
import { TECHNOLOGY } from "./rules";
import { GERMANY_ID, fixtureAccounts, fixtureContracts, fixtureCountries, fixtureDevCo } from "./fixtures";

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, structuralSharing: structuralSharingWithDates } } });
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <AppToaster />
        <MemoryRouter initialEntries={[`/admin/contract?country=${GERMANY_ID}&tech=${TECHNOLOGY.Wind}`]}>
          <Routes>
            <Route path="/admin/contract" element={<ContractsSettingsScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

let renders: RenderCounts;

beforeEach(() => {
  vi.clearAllMocks();
  api.countriesGetAll.mockResolvedValue({
    success: true,
    data: fixtureCountries.map((c) => ({ vsb_countryid: c.id, vsb_name: c.name, vsb_isocurrencycode: c.isoCurrencyCode, statecode: 0 })),
  });
  api.listStandardContracts.mockResolvedValue(fixtureContracts);
  api.listContractDevCoRows.mockResolvedValue(fixtureDevCo);
  api.listCapexAccounts.mockResolvedValue(fixtureAccounts);
  api.getStandardContract.mockImplementation(async (id: string) => fixtureContracts.find((c) => c.id === id));
  renders = countRenders();
});
afterEach(() => {
  renders.stop();
  cleanup();
  vi.restoreAllMocks();
});

describe("Contracts settings render counts (FE-AD-05)", () => {
  it("UT-ADCONTR-FE-003 typing in the Edit panel renders no contract card and not the DevCo account tree", { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Expand Development Contract - Turbine" }));
    await user.click(screen.getByTestId("btn_Edit_AdminContracts-c-dev"));
    expect(await screen.findByText("Edit Development Contract")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading contract...")).not.toBeInTheDocument());
    const box = screen.getByRole("textbox", { name: /^Description/, hidden: true });
    await user.click(box);
    await settle();
    renders.reset();
    await user.type(box, "abcde");
    await settle();
    const counts = JSON.stringify(renders.snapshot());
    expect(renders.ofPrefix("ContractCard:"), counts).toBe(0);
    expect(renders.of("DevCoCostForm"), counts).toBe(0);
  });

  it("UT-ADCONTR-FE-004 checking an account renders the DevCo tree, not the cards; expanding a card renders that card only", { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Development Contract - Turbine");
    await settle();
    renders.reset();
    await user.click(screen.getByRole("button", { name: "Expand Development Contract - Turbine" }));
    await settle();
    expect(renders.ofPrefix("ContractCard:") - renders.of("ContractCard:c-dev"), JSON.stringify(renders.snapshot())).toBe(0);
    expect(renders.of("ContractCard:c-dev")).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Add Construction Contract" }));
    expect(await screen.findByText("New Construction Contract")).toBeInTheDocument();
    await user.click(await screen.findByRole("textbox", { name: /^Description/, hidden: true }));
    await user.click(screen.getByRole("button", { name: "Expand 10000 Development Expenses", hidden: true }));
    await settle();
    renders.reset();
    await user.click(screen.getByRole("checkbox", { name: "10102 Environmental study", hidden: true }));
    await settle();
    expect(screen.getByRole("checkbox", { name: "10102 Environmental study", hidden: true })).toBeChecked();
    expect(renders.of("DevCoCostForm")).toBeGreaterThan(0);
    expect(renders.ofPrefix("ContractCard:"), JSON.stringify(renders.snapshot())).toBe(0);
  });
});
