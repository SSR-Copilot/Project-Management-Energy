// @vitest-environment jsdom
/**
 * Render tests for the Milestones settings screen. The data module is mocked; business
 * rules are covered in `rules.test.ts`.
 *
 * The screen renders directly at `/admin/milestones`. The admin rule (`useAdminAccess`) is mocked
 * through `adminAccess`: an admin by default, a non-admin where a test says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    session: { entraObjectId: "11111111-1111-1111-1111-111111111111" },
    loading: false,
  }),
}));

const adminAccess = vi.hoisted(() => ({ value: true }));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => adminAccess.value }));

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

/*
 * Countries come from the shared reference read (`data/countries.ts`); its generated service
 * is mocked so the real `useActiveCountries` (active filter, shared key) runs. `listCountries`
 * returns `MilestoneCountry` fixtures, turned into raw `vsb_countries` rows here.
 */
const listCountries = vi.fn();
vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: {
    getAll: async () => ({
      success: true,
      data: ((await listCountries()) as MilestoneCountry[]).map((c) => ({
        vsb_countryid: c.id, vsb_name: c.name, vsb_title: c.key, statecode: 0,
      })),
    }),
  },
}));

const listMilestoneAssumptions = vi.fn();
const saveMilestonePatches = vi.fn();
vi.mock("@/data/adminMilestones", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/adminMilestones")>()),
  listMilestoneAssumptions: () => listMilestoneAssumptions(),
  saveMilestonePatches: (p: unknown) => saveMilestonePatches(p),
}));

import { vsbTheme } from "@/theme/fluent";
import { AppToaster } from "@/components";
import { qk } from "@/data/keys";
import { DataError, RecordGoneError } from "@/platform/errors";
import { ERROR_HINT } from "@/platform/userMessage";
import type { MilestoneAssumption, MilestoneCountry, MilestonePatch } from "@/data/adminMilestones";
import MilestonesSettingsScreen from "./Screen";
import { FIXTURE_ASSUMPTIONS, FIXTURE_COUNTRIES } from "./fixtures";
import { MSG } from "./constants";

let client: QueryClient;

/** `AppShell` mounts `<AppToaster />` in the app; the harness does it so save toasts render. */
function Harness({ children }: { children: ReactNode }) {
  return (
    <FluentProvider theme={vsbTheme}>
      <AppToaster />
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/milestones"]}>
          <Routes>
            <Route path="/admin/milestones" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>
  );
}

const renderScreen = () => render(<Harness><MilestonesSettingsScreen /></Harness>);

/** Fresh copies so a test can "persist" values without leaking into the next one. */
let stored: MilestoneAssumption[];

function applyPatches(patches: MilestonePatch[]) {
  const columnToField: Record<string, keyof MilestoneAssumption["values"]> = {
    vsb_cluster1: "cluster1", vsb_cluster2: "cluster2", vsb_salesduration: "salesEnd",
  };
  stored = stored.map((r) => {
    const p = patches.find((x) => x.id === r.id);
    if (!p) return r;
    const values = { ...r.values };
    for (const [col, v] of Object.entries(p.changes)) values[columnToField[col]!] = v;
    return { ...r, values };
  });
}

async function openGermanyEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Germany/ }));
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await screen.findByText("Edit Milestones for Germany");

}

/*
 * Fluent's overlay Drawer is modal: in jsdom (no Web Animations) it and the page behind it can
 * stay `aria-hidden` after the motion, so panel queries pass `hidden: true`. The accessible names
 * asserted are still the real ones.
 */
const windCluster1 = () => screen.getByRole("textbox", { name: "Wind Cluster 1 duration in months", hidden: true });
const saveButton = () => screen.getByRole("button", { name: "Save", hidden: true });

beforeEach(() => {
  adminAccess.value = true;
  client =new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  stored = FIXTURE_ASSUMPTIONS.map((r) => ({ ...r, values: { ...r.values } }));
  listCountries.mockImplementation(async () => FIXTURE_COUNTRIES);
  listMilestoneAssumptions.mockImplementation(async () => stored);
  saveMilestonePatches.mockReset();
});
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("MilestonesSettingsScreen", () => {
  it("UT-ADMILE-901 AC-2a/2b: countries in key order, every section collapsed", async () => {
    renderScreen();
    await screen.findByRole("button", { name: /Germany/ });
    const headers = screen.getAllByRole("button", { name: /France|Germany|Poland|Spain/ });
    expect(headers.map((h) => h.textContent)).toEqual(["France", "Germany", "Poland", "Spain"]);
    for (const h of headers) expect(h).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply All" })).not.toBeInTheDocument();
  });

  it("UT-ADMILE-902 DR-2 / AC-4: expanding many sections makes no further request; toggling twice collapses", async () => {
    const user = userEvent.setup();
    renderScreen();
    for (const name of ["France", "Germany", "Poland", "Spain"]) {
      await user.click(await screen.findByRole("button", { name: new RegExp(name) }));
    }
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getByText("No milestone assumptions are stored for Poland.")).toBeInTheDocument();
    const germany = screen.getByRole("button", { name: /Germany/ });
    await user.click(germany);
    expect(germany).toHaveAttribute("aria-expanded", "false");
    expect(listMilestoneAssumptions).toHaveBeenCalledTimes(1);
    expect(listCountries).toHaveBeenCalledTimes(1);
  });

  it("UT-ADMILE-903 FR-3: the grid shows Wind before PV with the canvas cell rules", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    const table = await screen.findByRole("table", { name: /Germany/ });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Wind");
    expect(rows[2]).toHaveTextContent("PV");
    expect(screen.getByTestId("cell-952850001-fid")).toHaveTextContent("-1");
    expect(screen.getByTestId("cell-952850000-salesEnd")).toHaveTextContent("24-");
  });

  it("UT-ADMILE-904 AC-5a / AC-7a / AC-7b: Edit opens the panel; Save follows the dirty and validity gate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    // 9 duration inputs + 4 success inputs, for each of Wind and PV.
    expect(screen.getAllByRole("textbox", { hidden: true })).toHaveLength(26);
    expect(saveButton()).toBeDisabled();

    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    expect(saveButton()).toBeEnabled();

    await user.clear(windCluster1());
    await user.type(windCluster1(), "12");
    expect(saveButton()).toBeDisabled();

    await user.clear(windCluster1());
    await user.type(windCluster1(), "12.5");
    expect(screen.getByText(MSG.durationInvalid)).toBeInTheDocument();
    expect(windCluster1()).toHaveAttribute("aria-invalid", "true");
    expect(saveButton()).toBeDisabled();
  });

  it("UT-ADMILE-905 AC-8a / AC-8c: Save sends only changed columns, closes, refreshes and invalidates the shared keys", async () => {
    const user = userEvent.setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => {
      applyPatches(patches);
      return { saved: patches, failed: [] };
    });
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    await user.clear(screen.getByRole("textbox", { name: "Wind Cluster 1 success rate", hidden: true }));
    await user.type(screen.getByRole("textbox", { name: "Wind Cluster 1 success rate", hidden: true }), "0.55");
    await user.click(saveButton());

    expect(await screen.findByText(MSG.saved)).toBeInTheDocument();
    expect(saveMilestonePatches).toHaveBeenCalledWith([
      { id: "de-wind-m", changes: { vsb_cluster1: 13 }, label: "Wind – Cluster Durations" },
      { id: "de-wind-s", changes: { vsb_cluster1: 0.55 }, label: "Wind – Success Rates" },
    ]);
    await waitFor(() => expect(screen.queryByText("Edit Milestones for Germany")).not.toBeInTheDocument(), { timeout: 3000 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["adminMilestoneAssumptions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["capex-milestone-durations"] });
    expect(screen.getByTestId("cell-952850000-cluster1")).toHaveTextContent("130.55");
  });

  it("UT-ADMILE-906 AC-8b: editing Sales End writes vsb_salesduration", async () => {
    const user = userEvent.setup();
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => ({ saved: patches, failed: [] }));
    renderScreen();
    await openGermanyEditor(user);
    const salesEnd = screen.getByRole("textbox", { name: "Wind Sales End duration in months", hidden: true });
    await user.clear(salesEnd);
    await user.type(salesEnd, "30");
    await user.click(saveButton());
    await screen.findByText(MSG.saved);
    expect(saveMilestonePatches.mock.calls[0]?.[0]).toEqual([
      { id: "de-wind-m", changes: { vsb_salesduration: 30 }, label: "Wind – Cluster Durations" },
    ]);
  });

  it("UT-ADMILE-907 AC-8d: a partial failure keeps the panel and draft and names the failed row", async () => {
    const user = userEvent.setup();
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => {
      const [first, ...rest] = patches;
      applyPatches(rest);
      return { saved: rest, failed: [{ patch: first, error: new DataError("save", "Value out of range", 400) }] };
    });
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    const pvRate = screen.getByRole("textbox", { name: "PV Cluster 1 success rate", hidden: true });
    await user.clear(pvRate);
    await user.type(pvRate, "0.5");
    await user.click(saveButton());

    const message = await screen.findByText(/Not saved: Wind – Cluster Durations\. Saved: PV – Success Rates\./);
    expect(message.textContent).toContain(MSG.saveFailed);
    // The shared hint replaces the raw server text.
    expect(message.textContent).toContain(ERROR_HINT.retry);
    expect(message.textContent).not.toContain("Value out of range");
    expect(screen.getByText("Edit Milestones for Germany")).toBeInTheDocument();
    expect(windCluster1()).toHaveValue("13");
    expect(screen.getByTestId("cell-952850001-cluster1")).toHaveTextContent("60.5");
  });

  it("UT-ADMILE-908 V-1 (S5): a row deleted meanwhile shows the 'no longer exists' hint and refreshes the grid", async () => {
    const user = userEvent.setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => ({
      saved: [],
      failed: patches.map((patch) => ({ patch, error: new RecordGoneError("save", "vsb_milestonesstandardassumptionses", patch.id) })),
    }));
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    await user.click(saveButton());
    const message = await screen.findByText(/Not saved: Wind – Cluster Durations\./);
    expect(message.textContent).toContain(ERROR_HINT.notFound);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["adminMilestoneAssumptions"] }));
  });

  it("UT-ADMILE-909 AC-1b: a 403 shows the permission message and keeps the draft", async () => {
    const user = userEvent.setup();
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => ({
      saved: [], failed: patches.map((patch) => ({ patch, error: new DataError("save", "denied", 403) })),
    }));
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    await user.click(saveButton());
    expect(await screen.findByText(/You do not have permission to save milestone assumptions/)).toBeInTheDocument();
    expect(windCluster1()).toHaveValue("13");
    expect(screen.getByText("Edit Milestones for Germany")).toBeInTheDocument();
  });

  it("UT-ADMILE-910 AC-9: Cancel on a dirty draft asks first; discarding restores the stored values", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "99");
    await user.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await user.click(await screen.findByRole("button", { name: "Discard", hidden: true }));
    await waitFor(() => expect(screen.queryByText("Edit Milestones for Germany")).not.toBeInTheDocument(), { timeout: 3000 });

    await user.click(await screen.findByRole("button", { name: "Edit", hidden: true }));
    await screen.findByRole("textbox", { name: "Wind Cluster 1 duration in months", hidden: true }, { timeout: 3000 });
    expect(windCluster1()).toHaveValue("12");
    expect(saveMilestonePatches).not.toHaveBeenCalled();
  });

  it("UT-ADMILE-911 AC-C1c: shows a retryable error state when the FIRST read fails", async () => {
    listMilestoneAssumptions.mockRejectedValue(new Error("network down"));
    renderScreen();
    expect(await screen.findByText("Milestone assumptions could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(MSG.staleData))).not.toBeInTheDocument();
  });
});

/* ═════════════════════════════════════════════════════════════ gap closure ══ */

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const discardDialog = async () => {
  const title = await screen.findByText("Discard changes?");
  return within(title.closest("[role='dialog'], [role='alertdialog']") as HTMLElement);
};

describe("MilestonesSettingsScreen — gap closure (08-gap-analysis)", () => {
  it("UT-ADMILE-912 AC-C1a / B2: a failed refetch on Edit keeps the list, does not open the panel and says why", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    listMilestoneAssumptions.mockRejectedValueOnce(new Error("network blip"));
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByText(new RegExp(MSG.editRefetchFailed))).toBeInTheDocument();
    expect(screen.queryByText("Edit Milestones for Germany")).not.toBeInTheDocument();
    expect(screen.queryByText("Milestone assumptions could not be loaded")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Germany/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Germany/ })).toBeInTheDocument();
    // The cached rows are flagged as possibly out of date, with Retry.
    expect(screen.getByText(new RegExp(MSG.staleData))).toBeInTheDocument();
  });

  it("UT-ADMILE-084 (V2): the out-of-date bar's Retry is the shared small button; the Edit error bar is a dismissable alert", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    listMilestoneAssumptions.mockRejectedValueOnce(new Error("network blip"));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByText(new RegExp(MSG.staleData));

    const editAlert = screen.getByRole("alert");
    expect(editAlert).toHaveTextContent(MSG.editRefetchFailed);

    // Reference buttons rendered with the same theme: Fluent's atomic classes are deterministic.
    render(
      <FluentProvider theme={vsbTheme}>
        <Button size="small">Ref small</Button>
        <Button>Ref medium</Button>
      </FluentProvider>,
    );
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry.className).toBe(screen.getByRole("button", { name: "Ref small" }).className);
    expect(retry.className).not.toBe(screen.getByRole("button", { name: "Ref medium" }).className);

    await user.click(within(editAlert).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(new RegExp(MSG.editRefetchFailed))).not.toBeInTheDocument();
  });

  it("UT-ADMILE-913 AC-C1b / B1: a failed refetch after a save keeps the list, shows success and an out-of-date warning with Retry", async () => {
    const user = userEvent.setup();
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => {
      applyPatches(patches);
      listMilestoneAssumptions.mockRejectedValueOnce(new Error("refresh failed"));
      return { saved: patches, failed: [] };
    });
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    await user.click(saveButton());

    expect(await screen.findByText(MSG.saved)).toBeInTheDocument();
    expect(await screen.findByText(new RegExp(MSG.staleData))).toBeInTheDocument();
    expect(screen.queryByText("Milestone assumptions could not be loaded")).not.toBeInTheDocument();
    // `hidden: true`: jsdom can leave the page aria-hidden after the modal drawer (see above).
    expect(screen.getByRole("button", { name: /Germany/, hidden: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry", hidden: true }));
    await waitFor(() => expect(screen.queryByText(new RegExp(MSG.staleData))).not.toBeInTheDocument());
    expect(screen.getByTestId("cell-952850000-cluster1")).toHaveTextContent("13");
  });

  it("UT-ADMILE-914 T3 / DR-5: Edit refetches before the panel opens, behind a loading overlay", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    expect(listMilestoneAssumptions).toHaveBeenCalledTimes(1);
    const pending = deferred<MilestoneAssumption[]>();
    listMilestoneAssumptions.mockImplementationOnce(() => pending.promise);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByText("Loading current values…")).toBeInTheDocument();
    expect(listMilestoneAssumptions).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Edit Milestones for Germany")).not.toBeInTheDocument();

    pending.resolve(stored.map((r) => (r.id === "de-wind-m" ? { ...r, values: { ...r.values, cluster1: 14 } } : r)));
    await screen.findByText("Edit Milestones for Germany");
    // The editor starts from the REFETCHED value, not the cached 12.
    expect(windCluster1()).toHaveValue("14");
  });

  it("UT-ADMILE-915 T1: X and Escape on a dirty draft ask first; cancelling the dialog keeps the draft", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "77");

    await user.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    await user.click((await discardDialog()).getByRole("button", { name: "Cancel", hidden: true }));
    await waitFor(() => expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument());
    expect(screen.getByText("Edit Milestones for Germany")).toBeInTheDocument();
    expect(windCluster1()).toHaveValue("77");

    windCluster1().focus();
    await user.keyboard("{Escape}");
    await discardDialog();
    expect(windCluster1()).toHaveValue("77");
    expect(saveMilestonePatches).not.toHaveBeenCalled();
  });

  it("UT-ADMILE-916 T2: Cancel on a clean draft closes without a dialog", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    await user.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await waitFor(() => expect(screen.queryByText("Edit Milestones for Germany")).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("UT-ADMILE-917 T4 / DR-3: the duplicate-row warning renders in the section and in the panel", async () => {
    const user = userEvent.setup();
    stored.push({ ...stored.find((r) => r.id === "de-wind-m")!, id: "de-wind-m-dup" });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    expect(screen.getByText(/Duplicate assumption rows exist for Wind \(Cluster Durations\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit Milestones for Germany");
    expect(screen.getAllByText(/Duplicate assumption rows exist/, { exact: false })).toHaveLength(2);
  });

  it("UT-ADMILE-918 T5: 'No countries found' for an empty list", async () => {
    listCountries.mockImplementation(async () => []);
    renderScreen();
    expect(await screen.findByText("No countries found")).toBeInTheDocument();
  });

  it("UT-ADMILE-919 T5: Edit is disabled for a country with no rows", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Poland/ }));
    expect(screen.getByText("No milestone assumptions are stored for Poland.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  it("UT-ADMILE-920 T6 / AC-6c: 101 is over the Cluster bound but valid for Sales Start", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    const cluster2 = screen.getByRole("textbox", { name: "Wind Cluster 2 duration in months", hidden: true });
    await user.clear(cluster2);
    await user.type(cluster2, "101");
    expect(screen.getByText("Enter a value of at most 100 months")).toBeInTheDocument();
    expect(cluster2).toHaveAttribute("aria-invalid", "true");
    expect(saveButton()).toBeDisabled();

    await user.clear(cluster2);
    await user.type(cluster2, "18");
    const salesStart = screen.getByRole("textbox", { name: "Wind Sales Start duration in months", hidden: true });
    await user.clear(salesStart);
    await user.type(salesStart, "101");
    expect(screen.queryByText("Enter a value of at most 100 months")).not.toBeInTheDocument();
    expect(salesStart).toHaveAttribute("aria-invalid", "false");
    expect(saveButton()).toBeEnabled();
  });

  it("UT-ADMILE-921 T7 / FR-8 / B8: the save overlay names the country, sits outside the page tree, and locks the panel", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ saved: MilestonePatch[]; failed: never[] }>();
    saveMilestonePatches.mockImplementation(() => pending.promise);
    const { container } = renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    await user.click(saveButton());

    const label = await screen.findByText(MSG.saving("Germany"));
    // The page has no h1 any more (the header names it): the render container is the page tree.
    expect(container.contains(label)).toBe(false);
    expect(saveButton()).toBeDisabled();
    expect(windCluster1()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel", hidden: true })).toBeDisabled();

    pending.resolve({ saved: [], failed: [] });
    await waitFor(() => expect(screen.queryByText(MSG.saving("Germany"))).not.toBeInTheDocument());
  });

  it("UT-ADMILE-922 T8: an outright save failure shows the canvas prefix and reason and keeps the draft", async () => {
    const user = userEvent.setup();
    saveMilestonePatches.mockRejectedValue(new Error("service unavailable"));
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    await user.click(saveButton());
    // The canvas prefix plus the shared hint; the raw error text is not shown.
    expect(await screen.findByText(`${MSG.saveFailed} ${ERROR_HINT.retry}`)).toBeInTheDocument();
    expect(screen.queryByText(/service unavailable/)).not.toBeInTheDocument();
    expect(screen.getByText("Edit Milestones for Germany")).toBeInTheDocument();
    expect(windCluster1()).toHaveValue("13");
    expect(saveButton()).toBeEnabled();
  });

  it("UT-ADMILE-923 T10: a de-DE user sees '0,75' prefilled and '0,8' saves 0.8", async () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("de-DE");
    const user = userEvent.setup();
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => ({ saved: patches, failed: [] }));
    renderScreen();
    await openGermanyEditor(user);
    expect(screen.getByRole("textbox", { name: "Wind Cluster 3 success rate", hidden: true })).toHaveValue("0,75");
    const rate = screen.getByRole("textbox", { name: "Wind Cluster 1 success rate", hidden: true });
    expect(rate).toHaveValue("0,5");
    await user.clear(rate);
    await user.type(rate, "0,8");
    await user.click(saveButton());
    await screen.findByText(MSG.saved);
    expect(saveMilestonePatches.mock.calls[0]?.[0]).toEqual([
      { id: "de-wind-s", changes: { vsb_cluster1: 0.8 }, label: "Wind – Success Rates" },
    ]);
  });

  it("UT-ADMILE-924 T11 / B6: beforeunload is guarded only while a touched draft is open, and sets returnValue", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    const unloadAdds = () => add.mock.calls.filter(([type]) => type === "beforeunload");
    expect(unloadAdds()).toHaveLength(0);

    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    expect(unloadAdds()).toHaveLength(1);
    const handler = unloadAdds()[0]![1] as (e: BeforeUnloadEvent) => void;
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");

    await user.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await user.click((await discardDialog()).getByRole("button", { name: "Discard", hidden: true }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("beforeunload", handler));
  });

  it("UT-ADMILE-925 C-5 / B4: an explicit 0 can be stored over a blank prefilled-as-0 field", async () => {
    const user = userEvent.setup();
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => ({ saved: patches, failed: [] }));
    renderScreen();
    await openGermanyEditor(user);
    const pvSalesStart = screen.getByRole("textbox", { name: "PV Sales Start duration in months", hidden: true });
    expect(pvSalesStart).toHaveValue("");
    expect(pvSalesStart).toHaveAttribute("placeholder", "0");
    expect(saveButton()).toBeDisabled();
    await user.type(pvSalesStart, "0");
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());
    await screen.findByText(MSG.saved);
    expect(saveMilestonePatches.mock.calls[0]?.[0]).toEqual([
      { id: "de-pv-m", changes: { vsb_salesstart: 0 }, label: "PV – Cluster Durations" },
    ]);
  });

  it("UT-ADMILE-926 B7: the panel and draft survive the edited country dropping out of a refetched list", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    await user.clear(windCluster1());
    await user.type(windCluster1(), "13");
    listCountries.mockImplementation(async () => FIXTURE_COUNTRIES.filter((c) => c.name !== "Germany"));
    await client.invalidateQueries({ queryKey: qk.adminCountries });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Germany/, hidden: true })).not.toBeInTheDocument());
    expect(screen.getByText("Edit Milestones for Germany")).toBeInTheDocument();
    expect(windCluster1()).toHaveValue("13");
  });
});

/* ══════════════════════════════════════════════════════════ admin gate ══ */

describe("MilestonesSettingsScreen — admin gate (`useAdminAccess`)", () => {
  it("UT-ADMILE-930 an admin gets an enabled Edit command that opens the panel", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit Milestones for Germany")).toBeInTheDocument();
    expect(windCluster1()).toBeEnabled();
  });

  it("UT-ADMILE-931 a non-admin sees the grid but Edit is disabled and no panel opens", async () => {
    adminAccess.value = false;
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    expect(await screen.findByRole("table", { name: /Germany/ })).toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit).toBeDisabled();
    await user.click(edit);
    expect(screen.queryByText("Edit Milestones for Germany")).not.toBeInTheDocument();
    expect(saveMilestonePatches).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════ canvas parity ══ */

describe("MilestonesSettingsScreen — canvas parity", () => {
  it("UT-ADMILE-927 GAP-1: the success-rate heading is the canvas text with a plain hyphen (AMS:1928)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openGermanyEditor(user);
    expect(screen.getByText("Cluster Probabilities - Success Rate [-]")).toBeInTheDocument();
    expect(screen.getByText("Cluster Durations [months]")).toBeInTheDocument();
  });

  it("UT-ADMILE-928 GAP-3: a blank-Technology row is its own row with an empty label and is editable and saved", async () => {
    const user = userEvent.setup();
    stored = [
      ...stored,
      { id: "de-none-m", name: "average duration [months]", countryId: stored[0]!.countryId, technology: undefined,
        values: { ...stored[0]!.values, cluster1: 5 } },
    ];
    saveMilestonePatches.mockImplementation(async (patches: MilestonePatch[]) => ({ saved: patches, failed: [] }));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Germany/ }));
    const table = await screen.findByRole("table", { name: /Germany/ });
    const rows = within(table).getAllByRole("row");
    // Header, then the blank-Technology row first (Power Fx sorts blanks first), then Wind, PV.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getAllByRole("cell")[0]).toHaveTextContent(/^$/);
    expect(screen.getByTestId("cell-none-cluster1")).toHaveTextContent("5-");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit Milestones for Germany");
    const input = screen.getByRole("textbox", { name: "No technology Cluster 1 duration in months", hidden: true });
    await user.clear(input);
    await user.type(input, "7");
    await user.click(saveButton());
    await screen.findByText(MSG.saved);
    expect(saveMilestonePatches.mock.calls[0]?.[0]).toEqual([
      { id: "de-none-m", changes: { vsb_cluster1: 7 }, label: "No technology – Cluster Durations" },
    ]);
  });
});
