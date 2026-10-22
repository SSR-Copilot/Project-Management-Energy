// @vitest-environment jsdom
/**
 * Render smoke + interaction tests for the CAPEX Accounts screen against a mocked Power Apps
 * data client (the generated services and `deleteRecord` all go through `getClient`). Business
 * rules are covered in `rules.test.ts`; the data layer in `src/data/adminCapexAccounts.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FIXTURE_ROWS, IDS } from "./fixtures";

const client = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  contracts: [] as Record<string, unknown>[],
  retrieveMultipleRecordsAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  createRecordAsync: vi.fn(),
  executeAsync: vi.fn(),
  /** When true, the unfiltered tree load fails (a failed background refetch). */
  failTreeLoad: false,
  /** When true, every contract check (`hasContracts`) fails. */
  failContracts: false,
  /** Ids the pre-update existence check reports as deleted on the server. */
  gone: new Set<string>(),
}));

/** The admin rule (`useAdminAccess`): true = administrator, false = every write is refused. */
const access = vi.hoisted(() => ({ admin: true }));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => access.admin }));

/** Id the mocked POST hands back (a GUID: the existence check validates it). */
const NEW_ID = "00000000-0000-0000-0000-00000000beef";

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: client.retrieveMultipleRecordsAsync,
    retrieveRecordAsync: vi.fn().mockResolvedValue({ success: true, data: {} }),
    createRecordAsync: client.createRecordAsync,
    updateRecordAsync: client.updateRecordAsync,
    deleteRecordAsync: client.deleteRecordAsync,
    executeAsync: client.executeAsync,
  }),
}));

import { vsbTheme } from "@/theme/fluent";
import { AppToaster, FormPanel } from "@/components";
import { qk } from "@/data/keys";
import { ERROR_HINT } from "@/platform/userMessage";
import CAPEXAccountsSettingsScreen from "./Screen";
import { CONTRACT_CHECK_FAILED, GONE, GONE_STATUS, MSG, OUT_OF_SCOPE } from "./rules";

function toRaw(rows: typeof FIXTURE_ROWS) {
  return rows.map((r) => ({
    vsb_capexaccountlistid: r.id, vsb_number: r.number, vsb_name: r.name, vsb_order: r.order ?? undefined,
    statecode: r.active ? 0 : 1, _vsb_parentaccount_value: r.parentId ?? undefined,
  }));
}

let queryClient: QueryClient;

function Harness({ children }: { children: ReactNode }) {
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={queryClient}>{children}<AppToaster /></QueryClientProvider>
    </FluentProvider>
  );
}

const renderScreen = () => render(<Harness><CAPEXAccountsSettingsScreen /></Harness>);

async function openDevelopmentTab() {
  const user = userEvent.setup();
  renderScreen();
  await user.click(await screen.findByRole("tab", { name: "Development Expenses" }));
  await screen.findByRole("button", { name: "Select account 80000 - Land" });
  return user;
}

/** Number of unfiltered tree loads so far. */
const treeLoads = () => client.retrieveMultipleRecordsAsync.mock.calls
  .filter(([table, options]) => table === "vsb_capexaccountlists" && !(options as { filter?: string })?.filter).length;

/** A promise the test settles by hand (a write that is still running). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/**
 * One single-row PATCH of `vsb_capexaccountlists`, checked argument for argument. A 4th
 * `partitionId` is only meaningful for elastic tables, so this screen never sets it — it must be
 * `undefined`. (The PATCH goes through the shared
 * `updateRecordIfExists`, which calls `updateRecordAsync(table, id, fields)` and so omits the 4th
 * argument the generated service used to pass as `undefined`; the assertion is unchanged.)
 */
function expectPatched(id: string, payload: Record<string, unknown>) {
  const calls = client.updateRecordAsync.mock.calls.map((c) => c.slice(0, 3));
  expect(calls).toContainEqual(["vsb_capexaccountlists", id, payload]);
  for (const c of client.updateRecordAsync.mock.calls) if (c[1] === id) expect(c[3]).toBeUndefined();
}

const hiddenButton = (name: string | RegExp) => screen.getByRole("button", { name, hidden: true });

/** A button inside the open confirmation dialog (the command bar has same-named buttons). */
function dialogButton(name: string) {
  const dialog = screen.queryByRole("alertdialog", { hidden: true }) ?? screen.getByRole("dialog", { hidden: true });
  return within(dialog).getByRole("button", { name, hidden: true });
}

describe("CAPEXAccountsSettingsScreen", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.rows = toRaw(FIXTURE_ROWS);
    client.contracts = [];
    client.failTreeLoad = false;
    client.failContracts = false;
    client.gone = new Set();
    access.admin = true;
    client.retrieveMultipleRecordsAsync.mockImplementation(async (table: string, options: { filter?: string }) => {
      if (table === "vsb_capexaccountlists") {
        // The existence check before every single-row PATCH filters on the primary key.
        const byId = /^vsb_capexaccountlistid eq (\S+)$/.exec(options?.filter ?? "")?.[1];
        if (byId) {
          const known = byId === NEW_ID || client.rows.some((r) => r.vsb_capexaccountlistid === byId);
          return { success: true, data: known && !client.gone.has(byId) ? [{ vsb_capexaccountlistid: byId }] : [] };
        }
        // The live subaccount read at deactivation filters on the parent lookup.
        const parent = /^_vsb_parentaccount_value eq (\S+)$/.exec(options?.filter ?? "")?.[1];
        if (parent) return { success: true, data: client.rows.filter((r) => r._vsb_parentaccount_value === parent) };
        // Other existence checks (numberExists) carry a filter.
        if (options?.filter) return { success: true, data: [] };
        if (client.failTreeLoad) return { success: false, error: { message: "network down", status: 503 } };
        return { success: true, data: client.rows };
      }
      if (table === "vsb_capexprojectcontracts") {
        if (client.failContracts) return { success: false, error: { message: "timeout", status: 503 } };
        return { success: true, data: client.contracts };
      }
      return { success: true, data: [] };
    });
    client.deleteRecordAsync.mockResolvedValue({ success: true, data: undefined });
    client.updateRecordAsync.mockResolvedValue({ success: true, data: {} });
    client.createRecordAsync.mockResolvedValue({ success: true, data: { vsb_capexaccountlistid: NEW_ID } });
    client.executeAsync.mockResolvedValue({ success: true, data: undefined });
  });
  afterEach(() => vi.clearAllMocks());

  it("UT-ADCAPEX-901 renders one tab per category in order, first selected, with an empty state for a category without accounts", async () => {
    renderScreen();
    const tabs = await screen.findAllByRole("tab");
    const names = [
      "Wind Turbine/Panels", "Development Expenses", "Construction Expenses",
      "Overleveraging", "Substation/Grid Connection", "Other CAPEX",
    ];
    expect(tabs).toHaveLength(names.length);
    // Fluent renders a hidden "reserve space" copy of a non-selected tab's label, so compare
    // each tab's text by prefix rather than verbatim.
    tabs.forEach((t, i) => expect(t.textContent?.startsWith(names[i]!)).toBe(true));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("No accounts in this category")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-902 lists the category's accounts collapsed, and drives the command bar from the selection", async () => {
    const user = await openDevelopmentTab();
    expect(screen.queryByTestId("subaccount-row-80000_1")).not.toBeInTheDocument();
    expect(screen.getByTestId("command-edit")).toBeDisabled();
    expect(screen.queryByTestId("command-deactivate")).not.toBeInTheDocument();
    expect(screen.getByTestId("command-reorder")).toBeEnabled();

    const land = screen.getByRole("button", { name: "Select account 80000 - Land" });
    await user.click(land);
    expect(land).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("command-edit")).toBeEnabled();
    expect(screen.getByTestId("command-deactivate")).toBeInTheDocument();
    expect(screen.queryByTestId("command-activate")).not.toBeInTheDocument();
    // Land has subaccounts → no Delete.
    expect(screen.queryByTestId("command-delete")).not.toBeInTheDocument();

    await user.click(land);
    expect(land).toHaveAttribute("aria-pressed", "false");
  });

  it("UT-ADCAPEX-903 expands a card to its subaccounts with the per-row actions of §2.1", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    const row = await screen.findByTestId("subaccount-row-80000_2");
    expect(within(row).getByText("Inactive")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Activate subaccount 80000_2 - Cable" })).toBeInTheDocument();
    // Delete appears once the server-side contract check answers "none".
    expect(await within(row).findByRole("button", { name: "Delete subaccount 80000_2 - Cable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select account 80000 - Land" })).toHaveAttribute("aria-pressed", "true");
  });

  it("UT-ADCAPEX-904 hides subaccount Delete when a contract is booked on it", async () => {
    client.contracts = [{ vsb_capexprojectcontractid: "c1" }];
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    const row = await screen.findByTestId("subaccount-row-80000_1");
    await waitFor(() => expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
      "vsb_capexprojectcontracts", expect.anything(),
    ));
    expect(within(row).queryByRole("button", { name: /Delete subaccount/ })).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-905 opens New Account with Save disabled and the digits-only message", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    // Fluent's drawer motion never finishes in jsdom, so its content stays visibility-hidden to
    // the role query; `hidden: true` reaches it (same workaround as checklist-settings' tests).
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeDisabled();
    await user.type(screen.getByTestId("account-number"), "12a");
    expect(await screen.findByText("Account number must contain numbers only.")).toBeInTheDocument();
    expect(screen.getByTestId("account-number")).toHaveValue("12a");
    expect(screen.getByDisplayValue("Development Expenses")).toBeDisabled();
  });

  it("UT-ADCAPEX-906 deletes a free account after confirmation, re-checking the guards first", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(await screen.findByTestId("command-delete"));
    expect(await screen.findByText('Are you sure that you want to permanently delete "Permits" account?')).toBeInTheDocument();
    // Dialog motion: see the drawer note above.
    await user.click(screen.getByRole("button", { name: "Confirm", hidden: true }));
    await waitFor(() => expect(client.deleteRecordAsync).toHaveBeenCalledWith("vsb_capexaccountlists", IDS.permits));
    expect(await screen.findByText("Account deleted.")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-907 shows an explicit state when the root 00001 is missing", async () => {
    client.rows = toRaw(FIXTURE_ROWS.filter((r) => r.number !== "00001"));
    renderScreen();
    expect(await screen.findByText("CAPEX account tree not found")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-908 shows a permission message when the load is refused", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: false, error: { message: "no", status: 403 } });
    renderScreen();
    expect(await screen.findByText(/You do not have permission to read CAPEX accounts/)).toBeInTheDocument();
  });

  /* ── load, refetch and panel behaviour ── */

  it("UT-ADCAPEX-909 a failed refetch after a write keeps the screen and the notice, shows a warning and Retry refetches", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(await screen.findByTestId("command-delete"));
    client.failTreeLoad = true; // the post-write invalidation refetch fails
    await user.click(hiddenButton("Confirm"));

    expect(await screen.findByText("Account deleted.")).toBeInTheDocument();
    expect(await screen.findByText(/The CAPEX account list could not be refreshed/)).toBeInTheDocument();
    // `hidden`: the closing dialog's modalizer may still mark the page aria-hidden for a tick in jsdom.
    expect(hiddenButton("Select account 80000 - Land")).toBeInTheDocument();
    expect(screen.queryByText("CAPEX accounts could not be loaded")).not.toBeInTheDocument();

    client.failTreeLoad = false;
    const before = treeLoads();
    await user.click(hiddenButton("Retry"));
    await waitFor(() => expect(treeLoads()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText(/could not be refreshed/)).not.toBeInTheDocument());
  });

  it("UT-ADCAPEX-910 a failed background refetch does not unmount an open panel", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("command-edit"));
    expect(await screen.findByText("Edit Account")).toBeInTheDocument();
    client.failTreeLoad = true;
    await act(async () => { await queryClient.refetchQueries({ queryKey: qk.adminCapexAccountsTree }); });
    expect(await screen.findByText(/could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByText("Edit Account")).toBeInTheDocument();
    expect(screen.getByTestId("account-name")).toHaveValue("Land");
  });

  it("UT-ADCAPEX-911 close and Escape are ignored while a save runs, and a later failure is shown in the panel", async () => {
    const pending = deferred<unknown>();
    client.createRecordAsync.mockReturnValue(pending.promise);
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    await user.type(screen.getByTestId("account-number"), "12345");
    await user.type(screen.getByTestId("account-name"), "Test");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expect(client.createRecordAsync).toHaveBeenCalled());
    // Busy overlay label while the write runs.
    expect(screen.getAllByText("Saving Account...").length).toBeGreaterThan(0);

    await user.click(hiddenButton("Close panel"));
    await user.keyboard("{Escape}");
    expect(screen.getByText("New Account")).toBeInTheDocument();

    await act(async () => { pending.resolve({ success: false, error: { message: "boom", status: 500 } }); });
    // Shared error text — a 500 carries the "service had a problem" hint.
    expect(await screen.findByText(`Could not create the account. ${ERROR_HINT.server}`)).toBeInTheDocument();
    expect(screen.getByText("New Account")).toBeInTheDocument();
    // Once idle, the panel can be closed again — the typed input is unsaved, so it asks first.
    await user.click(hiddenButton("Close panel"));
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await user.click(hiddenButton("Discard"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());
  });

  it("UT-ADCAPEX-912 Cancel on a dirty panel asks before discarding; Keep editing keeps the input; a clean panel closes at once", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());

    await user.click(screen.getByTestId("command-new"));
    await user.type(await screen.findByTestId("account-name"), "Draft");
    await user.click(hiddenButton("Cancel"));
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await user.click(hiddenButton("Keep editing"));
    await waitFor(() => expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument());
    expect(screen.getByTestId("account-name")).toHaveValue("Draft");
    expect(client.createRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-913 Edit stays Edit when the row vanishes in a refetch; Save is blocked and nothing is created", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("command-edit"));
    expect(await screen.findByText("Edit Account")).toBeInTheDocument();

    client.rows = toRaw(FIXTURE_ROWS.filter((r) => r.id !== IDS.permits));
    await act(async () => { await queryClient.refetchQueries({ queryKey: qk.adminCapexAccountsTree }); });

    expect(await screen.findByText(GONE.account)).toBeInTheDocument();
    expect(screen.getByText("Edit Account")).toBeInTheDocument();
    expect(screen.queryByText("New Account")).not.toBeInTheDocument();
    expect(screen.getByTestId("account-number")).toBeDisabled();
    expect(hiddenButton("Save")).toBeDisabled();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-914 an Edit save updates the frozen record by id", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("command-edit"));
    const name = await screen.findByTestId("account-name");
    await user.clear(name);
    await user.type(name, "Permits 2");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expectPatched(IDS.permits, { vsb_name: "Permits 2" }));
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(await screen.findByText('Account "Permits 2" saved.')).toBeInTheDocument();
  });

  it("UT-ADCAPEX-915 a duplicate number shows the inline message and does not POST", async () => {
    client.retrieveMultipleRecordsAsync.mockImplementation(async (table: string, options: { filter?: string }) => {
      if (table === "vsb_capexaccountlists") {
        if (options?.filter?.startsWith("vsb_number eq")) return { success: true, data: [{ vsb_capexaccountlistid: "dup" }] };
        if (options?.filter) return { success: true, data: [] };
        return { success: true, data: client.rows };
      }
      return { success: true, data: [] };
    });
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    await user.type(screen.getByTestId("account-number"), "80000");
    await user.type(screen.getByTestId("account-name"), "Land again");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(MSG.accountExists)).toBeInTheDocument();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(screen.getByText("New Account")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-916 New Subaccount shows the account prefix and POSTs the composed, trimmed number", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByTestId("command-add-subaccount"));
    expect(await screen.findByText("New Subaccount")).toBeInTheDocument();
    expect(screen.getByText("80000_")).toBeInTheDocument();
    await user.type(screen.getByTestId("subaccount-number"), " 4 ");
    await user.type(screen.getByTestId("subaccount-name"), "Extra");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expect(client.createRecordAsync).toHaveBeenCalledWith(
      "vsb_capexaccountlists",
      expect.objectContaining({ vsb_number: "80000_4", vsb_name: "Extra", "vsb_ParentAccount@odata.bind": `/vsb_capexaccountlists(${IDS.land})` }),
    ));
    expect(await screen.findByText('Subaccount "Extra" created as Inactive.')).toBeInTheDocument();
  });

  it("UT-ADCAPEX-917 warns when a new subaccount was created but is still Active", async () => {
    client.updateRecordAsync.mockResolvedValue({ success: false, error: { message: "denied", status: 500 } });
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByTestId("command-add-subaccount"));
    await user.type(await screen.findByTestId("subaccount-number"), "4");
    await user.type(screen.getByTestId("subaccount-name"), "Extra");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(/was created but is still Active/)).toBeInTheDocument();
  });

  it("UT-ADCAPEX-918 Edit subaccount: the panel shows the full number read-only and renames by id", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByRole("button", { name: "Edit subaccount 80000_1 - Substation" }));
    expect(await screen.findByText("Edit Subaccount")).toBeInTheDocument();
    expect(screen.getByDisplayValue("80000_1")).toBeDisabled();
    const name = screen.getByTestId("subaccount-name");
    await user.clear(name);
    await user.type(name, "Substation B");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expectPatched(IDS.land1, { vsb_name: "Substation B" }));
  });

  it("UT-ADCAPEX-919 keyboard reorder keeps focus, announces, saves only moved rows and clears the selection", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("command-reorder"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();

    await user.click(hiddenButton("Move 80010 - Permits up"));
    expect(screen.getByTestId("reorder-announcement")).toHaveTextContent("80010 - Permits moved to position 1 of 2");
    // Permits is now first, so its Up button is disabled: focus moved to its Down button.
    await waitFor(() => expect(hiddenButton("Move 80010 - Permits down")).toHaveFocus());
    expect(hiddenButton("Move 80010 - Permits up")).toBeDisabled();

    await user.click(hiddenButton("Save"));
    // Master has no bulk services: each changed row is one guarded PATCH (existence read by
    // primary key, then `updateRecordAsync`), never an `UpdateMultiple` execute.
    await waitFor(() => {
      expectPatched(IDS.permits, { vsb_order: 1 });
      expectPatched(IDS.land, { vsb_order: 2 });
    });
    for (const id of [IDS.permits, IDS.land]) {
      expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
        "vsb_capexaccountlists",
        expect.objectContaining({ filter: `vsb_capexaccountlistid eq ${id}`, select: ["vsb_capexaccountlistid"] }),
      );
    }
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(2);
    expect(client.executeAsync).not.toHaveBeenCalled();
    expect(await screen.findByText("New order saved.")).toBeInTheDocument();
    // `hidden`: the drawer's modalizer may still mark the page aria-hidden for a tick in jsdom.
    await waitFor(() => expect(hiddenButton("Select account 80000 - Land")).toHaveAttribute("aria-pressed", "false"));
  });

  it("UT-ADCAPEX-920 deactivating an account shows the right dialog, PATCHes the cascade, reads costs null-safely and invalidates the cost screens", async () => {
    client.contracts = [{ vsb_capexprojectcontractid: "00000000-0000-0000-0000-000000005000" }];
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("command-deactivate"));
    expect(await screen.findByText("Deactivate Account?")).toBeInTheDocument();
    await user.click(dialogButton("Deactivate"));

    expect(await screen.findByText("Account and its subaccounts deactivated; forecast costs cleaned up.")).toBeInTheDocument();
    for (const id of [IDS.land, IDS.land1, IDS.land2, IDS.land3]) {
      expectPatched(id, { statecode: 1, statuscode: 2 });
    }
    const costReads = client.retrieveMultipleRecordsAsync.mock.calls.filter(([t]) => t === "vsb_capexcosts");
    expect(costReads).toHaveLength(2);
    for (const [, options] of costReads) {
      expect((options as { filter: string }).filter).toContain("((vsb_costpaid eq false) or (vsb_costpaid eq null))");
    }
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    // The shared helper also refreshes the Costs settings hierarchy (bug fix) and the
    // Add-Costs sheet.
    for (const key of [
      qk.adminCapexAccounts, qk.capexAccounts, ["cost-book"], ["capex-totals"],
      qk.adminCostHierarchy, ["add-cost-sheet"],
    ]) {
      expect(keys).toContain(JSON.stringify(key));
    }
  });

  it("UT-ADCAPEX-921 a partial cascade failure is reported with what landed, and the dialog stays open with an alert", async () => {
    client.updateRecordAsync.mockImplementation(async (_t: string, id: string) => (id === IDS.land2
      ? { success: false, error: { message: "denied", status: 500 } }
      : { success: true, data: {} }));
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("command-deactivate"));
    await user.click(dialogButton("Deactivate"));
    const alert = await screen.findByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent("Failed step: Subaccounts set to Inactive.");
    expect(alert).toHaveTextContent("Within this step: 2 of 3 subaccounts were set to Inactive.");
    expect(alert).toHaveTextContent("Already completed: Account set to Inactive.");
    expect(screen.getByText("Deactivate Account?")).toBeInTheDocument();
  });

  /* ── live reads, contract checks and status dialogs ── */

  it("UT-ADCAPEX-922 deactivation reads the subaccounts live, so one added after the tree loaded is deactivated too", async () => {
    const user = await openDevelopmentTab();
    // Another admin adds a subaccount; the screen's cached tree does not know it.
    const late = "00000000-0000-0000-0000-000000001003";
    client.rows = [...client.rows, {
      vsb_capexaccountlistid: late, vsb_number: "80000_9", vsb_name: "Late", vsb_order: 9,
      statecode: 0, _vsb_parentaccount_value: IDS.land,
    }];
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("command-deactivate"));
    await user.click(dialogButton("Deactivate"));
    expect(await screen.findByText("Account and its subaccounts deactivated; forecast costs cleaned up.")).toBeInTheDocument();
    expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
      "vsb_capexaccountlists", expect.objectContaining({ filter: `_vsb_parentaccount_value eq ${IDS.land}` }),
    );
    for (const id of [IDS.land1, IDS.land2, IDS.land3, late]) {
      expectPatched(id, { statecode: 1, statuscode: 2 });
    }
  });

  it("UT-ADCAPEX-923 a failed contract check shows account Delete disabled with an explanation and Retry", async () => {
    client.failContracts = true;
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    expect(await screen.findByText(CONTRACT_CHECK_FAILED.account)).toBeInTheDocument();
    expect(screen.getByTestId("command-delete")).toBeDisabled();

    client.failContracts = false;
    await user.click(screen.getByRole("button", { name: "Retry check" }));
    await waitFor(() => expect(screen.getByTestId("command-delete")).toBeEnabled());
    expect(screen.queryByText(CONTRACT_CHECK_FAILED.account)).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-924 a failed contract check shows the subaccount Delete icon disabled with a tooltip, not hidden", async () => {
    client.failContracts = true;
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    const row = await screen.findByTestId("subaccount-row-80000_1");
    const del = await within(row).findByTestId("delete-unavailable-80000_1");
    expect(del).toHaveAttribute("aria-disabled", "true");
    await user.hover(del);
    expect((await screen.findAllByText(CONTRACT_CHECK_FAILED.subaccount)).length).toBeGreaterThan(0);
    await user.unhover(del);
    await user.click(del);
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete Subaccount?")).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-925 subaccount status dialogs are keyed on the subaccount; activate changes status only", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByRole("button", { name: "Activate subaccount 80000_2 - Cable" }));
    expect(await screen.findByText("Activate Subaccount?")).toBeInTheDocument();
    await user.click(dialogButton("Activate"));
    await waitFor(() => expectPatched(IDS.land2, { statecode: 0, statuscode: 1 }));
    expect(await screen.findByText("Subaccount activated.")).toBeInTheDocument();
    expect(client.retrieveMultipleRecordsAsync.mock.calls.some(([t]) => t === "vsb_capexcosts")).toBe(false);

    // The activate dialog closes and the tree refetches here. Wait for the dialog to unmount,
    // then wait for the row action; `hidden`: the closing dialog's modalizer may still mark the
    // page aria-hidden for a tick in jsdom.
    await waitFor(() => expect(screen.queryByText("Activate Subaccount?")).not.toBeInTheDocument(), { timeout: 5000 });
    await user.click(await screen.findByRole(
      "button", { name: "Deactivate subaccount 80000_1 - Substation", hidden: true }, { timeout: 5000 },
    ));
    expect(await screen.findByText("Deactivate Subaccount?")).toBeInTheDocument();
    await user.click(dialogButton("Deactivate"));
    await waitFor(() => expectPatched(IDS.land1, { statecode: 1, statuscode: 2 }));
    expect(await screen.findByText("Subaccount deactivated; forecast costs cleaned up.")).toBeInTheDocument();
  }, 20_000); // two dialog round-trips; room for the explicit 5 s waits under a loaded run

  it("UT-ADCAPEX-926 changing tab clears the selection; expansion survives a write and refetch", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await screen.findByTestId("subaccount-row-80000_1");
    await user.click(await screen.findByRole("button", { name: "Activate subaccount 80000_2 - Cable" }));
    await user.click(dialogButton("Activate"));
    expect(await screen.findByText("Subaccount activated.")).toBeInTheDocument();
    await waitFor(() => expect(treeLoads()).toBeGreaterThanOrEqual(2));
    expect(screen.getByTestId("subaccount-row-80000_1")).toBeInTheDocument();

    // Wait for the confirm dialog to unmount before querying by role.
    await waitFor(() => expect(screen.queryByText("Activate Subaccount?")).not.toBeInTheDocument(), { timeout: 5000 });
    expect(await screen.findByRole("button", { name: "Select account 80000 - Land" }, { timeout: 5000 }))
      .toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("tab", { name: /Wind Turbine/ }));
    await user.click(screen.getByRole("tab", { name: /Development Expenses/ }));
    expect(screen.getByRole("button", { name: "Select account 80000 - Land" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("command-edit")).toBeDisabled();
  });

  /* ── selection, create and record-gone behaviour ── */

  it("UT-ADCAPEX-927 New clears the selected account (CA:334-340), so after Cancel no account is selected", async () => {
    const user = await openDevelopmentTab();
    const permits = screen.getByRole("button", { name: "Select account 80010 - Permits" });
    await user.click(permits);
    expect(screen.getByTestId("command-edit")).toBeEnabled();
    await user.click(screen.getByTestId("command-new"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());
    expect(hiddenButton("Select account 80010 - Permits")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("command-edit")).toBeDisabled();
    expect(screen.queryByTestId("command-activate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("command-deactivate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("command-delete")).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-928 create after New trims only the typed number and PATCHes the new row Inactive after its existence check", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("command-new"));
    await user.type(await screen.findByTestId("account-number"), " 80020 ");
    await user.type(screen.getByTestId("account-name"), "Roads");
    await user.click(hiddenButton("Save"));
    // CA:1436 trims the typed number.
    await waitFor(() => expect(client.createRecordAsync).toHaveBeenCalledWith(
      "vsb_capexaccountlists", expect.objectContaining({ vsb_number: "80020" }),
    ));
    expect(await screen.findByText('Account "Roads" created as Inactive.')).toBeInTheDocument();
    expectPatched(NEW_ID, { statecode: 1, statuscode: 2 });
  });

  it("UT-ADCAPEX-929 renaming a row deleted on the server after the last refetch shows GONE and sends no PATCH (no upsert)", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("command-edit"));
    const name = await screen.findByTestId("account-name");
    await user.clear(name);
    await user.type(name, "Permits 2");
    client.gone.add(IDS.permits); // deleted by another admin; the cached tree still has it
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(GONE.account)).toBeInTheDocument();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Edit Account")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-930 activating a subaccount deleted on the server shows the gone text in the dialog and sends no PATCH", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByRole("button", { name: "Activate subaccount 80000_2 - Cable" }));
    client.gone.add(IDS.land2);
    await user.click(dialogButton("Activate"));
    const alert = await screen.findByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent(GONE_STATUS.subaccount);
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  /* ── a created row deleted before its Inactive step ── */

  it("UT-ADCAPEX-931 a new account deleted before its Inactive step is reported as gone, not 'still Active', and is not selected", async () => {
    client.gone.add(NEW_ID); // deleted by someone else between the POST and the Inactive PATCH
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    await user.type(await screen.findByTestId("account-number"), "80020");
    await user.type(screen.getByTestId("account-name"), "Roads");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText('Account "Roads" was created but has since been deleted by someone else.')).toBeInTheDocument();
    expect(screen.queryByText(/still Active/)).not.toBeInTheDocument();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());
    expect(screen.getByTestId("command-edit")).toBeDisabled();
  });

  it("UT-ADCAPEX-932 a new subaccount deleted before its Inactive step is reported as gone, not 'still Active'", async () => {
    client.gone.add(NEW_ID);
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByTestId("command-add-subaccount"));
    await user.type(await screen.findByTestId("subaccount-number"), "4");
    await user.type(screen.getByTestId("subaccount-name"), "Extra");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText('Subaccount "Extra" was created but has since been deleted by someone else.')).toBeInTheDocument();
    expect(screen.queryByText(/still Active/)).not.toBeInTheDocument();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  /* ── shared panel footer, reorder panel and confirm dialog ── */

  it("UT-ADCAPEX-933 every panel footer is the shared PanelButtons (no nested band) with CAPEX's 20 px button gap", async () => {
    // Reference classes of the shared footer (jsdom computes no Griffel styles, so compare the
    // atomic class lists): brand-outline Cancel with gap 20 vs the default gap 10.
    const reference = (gap: 10 | 20) => {
      const { unmount } = render(
        <Harness>
          <FormPanel open title="Reference" width="narrow" onDismiss={() => {}} actions={{ onSave: () => {}, canSave: true, gap }}>
            body
          </FormPanel>
        </Harness>,
      );
      const classes = { cancel: hiddenButton("Cancel").className };
      unmount();
      return classes;
    };
    const gap20 = reference(20);
    const gap10 = reference(10);
    expect(gap20.cancel).not.toBe(gap10.cancel);

    const user = await openDevelopmentTab();
    const checkFooter = () => {
      const save = hiddenButton("Save");
      const cancel = hiddenButton("Cancel");
      const footer = save.parentElement!;
      // The buttons sit directly in FormPanel's footer band: the old nested 14 px padded row is gone.
      expect(footer).toHaveClass("canvas-panel-footer");
      expect(cancel.parentElement).toBe(footer);
      // Brand-outline Cancel with gap 20 (CAX:1440 / CAX:2302), exactly the shared footer's classes.
      expect(cancel.className).toBe(gap20.cancel);
    };

    await user.click(screen.getByTestId("command-new"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    checkFooter();
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());

    await user.click(screen.getByTestId("command-reorder"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    checkFooter();
  });

  it("UT-ADCAPEX-934 the reorder panel is the shared ReorderPanel (Save always on, hint, inline list, clean Cancel closes)", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-reorder"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    // CA:2245-2246: Save is enabled before any move.
    expect(hiddenButton("Save")).not.toBeDisabled();
    expect(screen.getByText("To reorder drag and drop listed items, or use the move up / move down buttons.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Accounts in order", hidden: true })).toBeInTheDocument();
    // Unmoved: not dirty, so Cancel closes without the discard prompt.
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("'Capex Accounts' order")).not.toBeInTheDocument());
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-935 a failed confirm shows a role=alert error bar in the dialog (description unchanged) and ✕ is locked while it runs", async () => {
    const pending = deferred<unknown>();
    client.deleteRecordAsync.mockReturnValue(pending.promise);
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(await screen.findByTestId("command-delete"));
    const description = 'Are you sure that you want to permanently delete "Permits" account?';
    expect(await screen.findByText(description)).toBeInTheDocument();
    await user.click(dialogButton("Confirm"));
    await waitFor(() => expect(client.deleteRecordAsync).toHaveBeenCalled());
    expect(dialogButton("Close")).toBeDisabled();

    await act(async () => { pending.resolve({ success: false, error: { message: "boom", status: 500 } }); });
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    const alert = await within(dialog).findByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent(`Could not delete the account. ${ERROR_HINT.server}`);
    // The description is no longer extended with the error text after a blank line.
    expect(within(dialog).getByText(description).textContent).toBe(description);
    expect(dialogButton("Close")).toBeEnabled();
  });

  /* ── the admin rule (master's `useAdminAccess`): a non-admin's writes are refused ── */

  it("UT-ADCAPEX-936 non-admin: saving a new account is refused with the scope message, nothing is sent and the panel stays open", async () => {
    access.admin = false;
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    await user.type(await screen.findByTestId("account-number"), "80020");
    await user.type(screen.getByTestId("account-name"), "Roads");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(OUT_OF_SCOPE)).toBeInTheDocument();
    expect(screen.getByText("New Account")).toBeInTheDocument();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-937 non-admin: a confirmed delete or status change is refused inside the dialog and sends nothing", async () => {
    access.admin = false;
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(await screen.findByTestId("command-delete"));
    await user.click(dialogButton("Confirm"));
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    expect(await within(dialog).findByRole("alert", { hidden: true })).toHaveTextContent(OUT_OF_SCOPE);
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-938 non-admin: saving a reorder is refused even when nothing moved, and nothing is sent", async () => {
    access.admin = false;
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-reorder"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(OUT_OF_SCOPE)).toBeInTheDocument();
    expect(screen.getByText("'Capex Accounts' order")).toBeInTheDocument();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-939 admin: the same save is sent as usual", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("command-new"));
    await user.type(await screen.findByTestId("account-number"), "80020");
    await user.type(screen.getByTestId("account-name"), "Roads");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expect(client.createRecordAsync).toHaveBeenCalled());
    expect(screen.queryByText(OUT_OF_SCOPE)).not.toBeInTheDocument();
  });
});
