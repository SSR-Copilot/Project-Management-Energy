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
import {
  CheckmarkRegular, DismissRegular,
} from "@fluentui/react-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { FIXTURE_ROWS, IDS } from "./fixtures";
import { ADMIN_OPT } from "@/data/adminFlags";

const ADMIN_OPT_DEFAULTS = { ...ADMIN_OPT };

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
import { AppToaster, ConfirmDialog, FormPanel } from "@/components";
import { qk } from "@/data/keys";
import { ERROR_HINT } from "@/platform/userMessage";
import { appliedRules } from "@/test/appliedRules";
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
  afterEach(() => { vi.clearAllMocks(); Object.assign(ADMIN_OPT, ADMIN_OPT_DEFAULTS); });

  it("UT-ADCAPEX-901 renders one tab per category in order, first selected", async () => {
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
  });

  it("UT-ADCAPEX-902 lists the category's accounts collapsed, and drives the command bar from the selection", async () => {
    const user = await openDevelopmentTab();
    expect(screen.queryByTestId("subaccount-row-80000_1")).not.toBeInTheDocument();
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount")).toBeDisabled();
    expect(screen.queryByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount")).not.toBeInTheDocument();
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-orderAccounts")).toBeEnabled();

    const land = screen.getByRole("button", { name: "Select account 80000 - Land" });
    await user.click(land);
    expect(land).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount")).toBeEnabled();
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount")).toBeInTheDocument();
    expect(screen.queryByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-activateAccount")).not.toBeInTheDocument();
    // Land has subaccounts → no Delete.
    expect(screen.queryByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount")).not.toBeInTheDocument();

    await user.click(land);
    expect(land).toHaveAttribute("aria-pressed", "false");
  });

  it("UT-ADCAPEX-903 expands a card to its subaccounts with the per-row actions of §2.1", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    const row = await screen.findByTestId("subaccount-row-80000_2");
    expect(within(row).getByText("Inactive")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Activate" })).toBeInTheDocument();
    // Delete appears once the server-side contract check answers "none".
    expect(await within(row).findByRole("button", { name: "Delete" })).toBeInTheDocument();
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
    expect(within(row).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-905 opens New Account with Save disabled and the digits-only message", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    // Fluent's drawer motion never finishes in jsdom, so its content stays visibility-hidden to
    // the role query; `hidden: true` reaches it (same workaround as checklist-settings' tests).
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeDisabled();
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "12a");
    expect(await screen.findByText("Account number must contain numbers only.")).toBeInTheDocument();
    expect(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number")).toHaveValue("12a");
    const category = screen.getByTestId("drp_Account_RightPanel_NewEditAccount_BodyContent_Category");
    expect(category).toBeDisabled();
    expect(category).toHaveTextContent("Development Expenses");
  });

  it("UT-ADCAPEX-906 deletes a free account after confirmation, re-checking the guards first", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(await screen.findByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount"));
    expect(await screen.findByText(
      'Are you sure that you want to permanently delete "Permits" account?',
    )).toBeInTheDocument();
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
    await user.click(await screen.findByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount"));
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
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount"));
    expect(await screen.findByText("Edit Account")).toBeInTheDocument();
    client.failTreeLoad = true;
    await act(async () => { await queryClient.refetchQueries({ queryKey: qk.adminCapexAccountsTree }); });
    expect(await screen.findByText(/could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByText("Edit Account")).toBeInTheDocument();
    expect(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name")).toHaveValue("Land");
  });

  it("UT-ADCAPEX-911 close and Escape are ignored while a save runs, and a later failure is shown in the panel", async () => {
    const pending = deferred<unknown>();
    client.createRecordAsync.mockReturnValue(pending.promise);
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "12345");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Test");
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
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());

    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Draft");
    await user.click(hiddenButton("Cancel"));
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await user.click(hiddenButton("Keep editing"));
    await waitFor(() => expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument());
    expect(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name")).toHaveValue("Draft");
    expect(client.createRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-913 Edit stays Edit when the row vanishes in a refetch; Save is blocked and nothing is created", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount"));
    expect(await screen.findByText("Edit Account")).toBeInTheDocument();

    client.rows = toRaw(FIXTURE_ROWS.filter((r) => r.id !== IDS.permits));
    await act(async () => { await queryClient.refetchQueries({ queryKey: qk.adminCapexAccountsTree }); });

    expect(await screen.findByText(GONE.account)).toBeInTheDocument();
    expect(screen.getByText("Edit Account")).toBeInTheDocument();
    expect(screen.queryByText("New Account")).not.toBeInTheDocument();
    expect(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number")).toBeDisabled();
    expect(hiddenButton("Save")).toBeDisabled();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-914 an Edit save updates the frozen record by id", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount"));
    const name = await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name");
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
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "80000");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Land again");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(MSG.accountExists)).toBeInTheDocument();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(screen.getByText("New Account")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-916 New Subaccount shows the account prefix and POSTs the composed, trimmed number", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByTestId(`pcf_Account_AccountCardBody_SubAccountsCommandBar-${IDS.land}-newSubaccount`));
    expect(await screen.findByText("New Subaccount")).toBeInTheDocument();
    expect(screen.getByText("80000_")).toBeInTheDocument();
    // The prefix is a separate label OUTSIDE the input box (`lbl_…_AccountNumberAsPrefix`, CA:1687-1717), sitting
    // on the input's row; the input is pushed right by the canvas 9 px per character.
    const prefixLabel = screen.getByTestId("lbl_Account_RightPanel_NewEditSubaccount_BodyContent_AccountNumberAsPrefix");
    expect(prefixLabel.closest(".fui-Input")).toBeNull();
    const numberBlock = prefixLabel.parentElement as HTMLElement;
    expect(numberBlock.style.getPropertyValue("--prefix-w")).toBe(`${"80000_".length * 9}px`);
    expect(getComputedStyle(prefixLabel).position).toBe("absolute");
    // The disabled Main Account box is white with a grey outline (modern TextInput disabled, CA:1611), unlike the
    // editable grey-filled inputs.
    const mainAccount = screen.getByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_AccountName");
    expect(mainAccount).toBeDisabled();
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"), " 4 ");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name"), "Extra");
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
    await user.click(await screen.findByTestId(`pcf_Account_AccountCardBody_SubAccountsCommandBar-${IDS.land}-newSubaccount`));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"), "4");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name"), "Extra");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(/was created but is still Active/)).toBeInTheDocument();
  });

  it("UT-ADCAPEX-918 Edit subaccount: the panel shows the full number read-only and renames by id", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await within(await screen.findByTestId("subaccount-row-80000_1")).findByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit Subaccount")).toBeInTheDocument();
    expect(screen.getByDisplayValue("80000_1")).toBeDisabled();
    const name = screen.getByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name");
    await user.clear(name);
    await user.type(name, "Substation B");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expectPatched(IDS.land1, { vsb_name: "Substation B" }));
  });

  it("UT-ADCAPEX-919 keyboard reorder keeps focus, announces, saves only moved rows and clears the selection", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-orderAccounts"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();

    // The rows carry the canvas template, the name only (`<p><b>{{vsb_name}}</b></p>`, CA:2165).
    await user.click(hiddenButton("Move Permits up"));
    expect(screen.getByTestId("reorder-announcement")).toHaveTextContent("Permits moved to position 1 of 2");
    // Permits is now first, so its Up button is disabled: focus moved to its Down button.
    await waitFor(() => expect(hiddenButton("Move Permits down")).toHaveFocus());
    expect(hiddenButton("Move Permits up")).toBeDisabled();

    await user.click(hiddenButton("Save"));
    // No bulk services (doc 09 §1): each changed row is one guarded PATCH (existence read by
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

  it("UT-ADCAPEX-920 deactivating an account shows the right dialog, PATCHes the cascade, then cleans costs in the background (null-safe reads) and invalidates the cost screens", async () => {
    client.contracts = [{ vsb_capexprojectcontractid: "00000000-0000-0000-0000-000000005000" }];
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount"));
    expect(await screen.findByText("Deactivate Account?")).toBeInTheDocument();
    await user.click(dialogButton("Deactivate"));

    // The dialog's work is the status change; the clean-up follows under a progress toast.
    expect(await screen.findByText("Account and its subaccounts deactivated.")).toBeInTheDocument();
    for (const id of [IDS.land, IDS.land1, IDS.land2, IDS.land3]) {
      expectPatched(id, { statecode: 1, statuscode: 2 });
    }
    expect(await screen.findByText("Forecast costs cleaned up: 0 rows set to 0, 0 rows deleted.")).toBeInTheDocument();
    expect(screen.queryByTestId("capex-forecast-cleanup")).not.toBeInTheDocument();
    const costReads = client.retrieveMultipleRecordsAsync.mock.calls.filter(([t]) => t === "vsb_capexcosts");
    expect(costReads).toHaveLength(2);
    for (const [, options] of costReads) {
      expect((options as { filter: string }).filter).toContain("((vsb_costpaid eq false) or (vsb_costpaid eq null))");
    }
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    // The shared helper also refreshes the Costs settings hierarchy (bug fix) and the
    // Add-Costs sheet. The tree key, not the screen prefix: the per-row contract checks are not refetched.
    for (const key of [
      qk.adminCapexAccountsTree, qk.capexAccounts, ["cost-book"], ["capex-totals"],
      qk.adminCostHierarchy, ["add-cost-sheet"],
    ]) {
      expect(keys).toContain(JSON.stringify(key));
    }
    expect(keys).not.toContain(JSON.stringify(qk.adminCapexAccounts));
  });

  it("UT-ADCAPEX-940 a clean-up that fails after the status landed is reported as a toast; the dialog is already closed", async () => {
    client.contracts = [{ vsb_capexprojectcontractid: "00000000-0000-0000-0000-000000005000" }];
    const base = client.retrieveMultipleRecordsAsync.getMockImplementation()!;
    client.retrieveMultipleRecordsAsync.mockImplementation(async (table: string, options: { filter?: string }) => (
      table === "vsb_capexcosts"
        ? { success: true, data: [{ vsb_capexcostid: "00000000-0000-0000-0000-00000000c057" }] }
        : base(table, options)));
    client.deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "denied", status: 500 } });
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount"));
    await user.click(dialogButton("Deactivate"));

    expect(await screen.findByText("Account and its subaccounts deactivated.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Deactivate Account?")).not.toBeInTheDocument());
    const failure = await screen.findByText(/Could not clean up the forecast costs/);
    expect(failure).toHaveTextContent("Failed step: Later-year costs deleted (1 row).");
    expect(failure).toHaveTextContent("Already completed: Future-month costs set to 0 (1 row).");
    expect(screen.queryByTestId("capex-forecast-cleanup")).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-921 a partial cascade failure is reported with what landed, and the dialog stays open with an alert", async () => {
    client.updateRecordAsync.mockImplementation(async (_t: string, id: string) => (id === IDS.land2
      ? { success: false, error: { message: "denied", status: 500 } }
      : { success: true, data: {} }));
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80000 - Land" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount"));
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
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount"));
    await user.click(dialogButton("Deactivate"));
    expect(await screen.findByText("Account and its subaccounts deactivated.")).toBeInTheDocument();
    expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
      "vsb_capexaccountlists", expect.objectContaining({ filter: `_vsb_parentaccount_value eq ${IDS.land}` }),
    );
    for (const id of [IDS.land1, IDS.land2, IDS.land3, late]) {
      expectPatched(id, { statecode: 1, statuscode: 2 });
    }
    // The background clean-up ran for the account and every live child (no contracts booked here).
    expect(await screen.findByText("No forecast costs to clean up: no contracts are booked on it.")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-923 a failed contract check shows account Delete disabled with an explanation and Retry", async () => {
    client.failContracts = true;
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    expect(await screen.findByText(CONTRACT_CHECK_FAILED.account)).toBeInTheDocument();
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount")).toBeDisabled();

    client.failContracts = false;
    await user.click(screen.getByRole("button", { name: "Retry check" }));
    await waitFor(() => expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount")).toBeEnabled());
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
    await user.click(await within(await screen.findByTestId("subaccount-row-80000_2")).findByRole("button", { name: "Activate" }));
    expect(await screen.findByText("Activate Subaccount?")).toBeInTheDocument();
    await user.click(dialogButton("Activate"));
    await waitFor(() => expectPatched(IDS.land2, { statecode: 0, statuscode: 1 }));
    expect(await screen.findByText("Subaccount activated.")).toBeInTheDocument();
    expect(client.retrieveMultipleRecordsAsync.mock.calls.some(([t]) => t === "vsb_capexcosts")).toBe(false);

    // The activate dialog closes and the tree refetches here. Wait for the dialog to unmount,
    // then wait for the row action; `hidden`: the closing dialog's modalizer may still mark the
    // page aria-hidden for a tick in jsdom.
    await waitFor(() => expect(screen.queryByText("Activate Subaccount?")).not.toBeInTheDocument(), { timeout: 5000 });
    const substation = await screen.findByTestId("subaccount-row-80000_1", {}, { timeout: 5000 });
    await user.click(await within(substation).findByRole(
      "button", { name: "Deactivate", hidden: true }, { timeout: 5000 },
    ));
    expect(await screen.findByText("Deactivate Subaccount?")).toBeInTheDocument();
    await user.click(dialogButton("Deactivate"));
    await waitFor(() => expectPatched(IDS.land1, { statecode: 1, statuscode: 2 }));
    expect(await screen.findByText("Subaccount deactivated.")).toBeInTheDocument();
    expect(await screen.findByText("No forecast costs to clean up: no contracts are booked on it.")).toBeInTheDocument();
  }, 20_000); // two dialog round-trips; room for the explicit 5 s waits under a loaded run

  it("UT-ADCAPEX-926 changing tab clears the selection; expansion survives a write and refetch", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await screen.findByTestId("subaccount-row-80000_1");
    await user.click(await within(await screen.findByTestId("subaccount-row-80000_2")).findByRole("button", { name: "Activate" }));
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
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount")).toBeDisabled();
  });

  /* ── selection, create and record-gone behaviour ── */

  it("UT-ADCAPEX-927 New clears the selected account (CA:334-340), so after Cancel no account is selected", async () => {
    const user = await openDevelopmentTab();
    const permits = screen.getByRole("button", { name: "Select account 80010 - Permits" });
    await user.click(permits);
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount")).toBeEnabled();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());
    expect(hiddenButton("Select account 80010 - Permits")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount")).toBeDisabled();
    expect(screen.queryByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-activateAccount")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deactivateAccount")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount")).not.toBeInTheDocument();
  });

  it("UT-ADCAPEX-928 create after New trims only the typed number and PATCHes the new row Inactive after its existence check", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), " 80020 ");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Roads");
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
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount"));
    const name = await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name");
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
    await user.click(await within(await screen.findByTestId("subaccount-row-80000_2")).findByRole("button", { name: "Activate" }));
    client.gone.add(IDS.land2);
    await user.click(dialogButton("Activate"));
    const alert = await screen.findByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent(GONE_STATUS.subaccount);
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  /* ── a created row deleted before its Inactive step ── */

  it("UT-ADCAPEX-931 a new account deleted before its Inactive step is reported as gone, not 'still Active', and is not selected (existence read, ADMIN_NO_REDUNDANT_EXISTS off)", async () => {
    ADMIN_OPT.ADMIN_NO_REDUNDANT_EXISTS = false;
    client.gone.add(NEW_ID); // deleted by someone else between the POST and the Inactive PATCH
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "80020");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Roads");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText('Account "Roads" was created but has since been deleted by someone else.')).toBeInTheDocument();
    expect(screen.queryByText(/still Active/)).not.toBeInTheDocument();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-editAccount")).toBeDisabled();
  });

  it("UT-ADCAPEX-931b AD-08 (QA-06): the documented residual, with no existence read the Inactive PATCH is sent once and is NOT mapped to RecordGone (an update without If-Match is an upsert, it never answers 404)", async () => {
    // The row was deleted by someone else between the POST and the PATCH. With ADMIN_NO_REDUNDANT_EXISTS ON (default) nothing reads
    // the row first, and on SDK 1.3.1 a PATCH without If-Match re-creates it (holding only the status columns), so the host answers
    // success: the screen cannot know. This test pins that residual honestly (DEC-7 class); it does not claim a "gone" message.
    client.gone.add(NEW_ID);
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "80020");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Roads");
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText('Account "Roads" created as Inactive.')).toBeInTheDocument();
    expect(screen.queryByText('Account "Roads" was created but has since been deleted by someone else.')).not.toBeInTheDocument();
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(1);
    expectPatched(NEW_ID, { statecode: 1, statuscode: 2 });
    const existenceReadsOfNew = client.retrieveMultipleRecordsAsync.mock.calls.filter(
      (c: unknown[]) => (c[1] as { filter?: string } | undefined)?.filter === `vsb_capexaccountlistid eq ${NEW_ID}`,
    );
    expect(existenceReadsOfNew).toHaveLength(0);
  });

  it("UT-ADCAPEX-932 a new subaccount deleted before its Inactive step is reported as gone, not 'still Active' (existence read, ADMIN_NO_REDUNDANT_EXISTS off)", async () => {
    ADMIN_OPT.ADMIN_NO_REDUNDANT_EXISTS = false;
    client.gone.add(NEW_ID);
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    await user.click(await screen.findByTestId(`pcf_Account_AccountCardBody_SubAccountsCommandBar-${IDS.land}-newSubaccount`));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"), "4");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name"), "Extra");
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

    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    checkFooter();
    await user.click(hiddenButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("New Account")).not.toBeInTheDocument());

    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-orderAccounts"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    checkFooter();
  });

  it("UT-ADCAPEX-934 the reorder panel is the shared ReorderPanel (Save always on, hint, inline list, clean Cancel closes)", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-orderAccounts"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    // CA:2245-2246: Save is enabled before any move.
    expect(hiddenButton("Save")).not.toBeDisabled();
    expect(screen.getByText("To reorder drag and drop listed items")).toBeInTheDocument();
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
    await user.click(await screen.findByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount"));
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

  /* ── the admin rule (`useAdminAccess`): a non-admin's writes are refused ── */

  it("UT-ADCAPEX-936 non-admin: saving a new account is refused with the scope message, nothing is sent and the panel stays open", async () => {
    access.admin = false;
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "80020");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Roads");
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
    await user.click(await screen.findByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount"));
    await user.click(dialogButton("Confirm"));
    const dialog = screen.getByRole("alertdialog", { hidden: true });
    expect(await within(dialog).findByRole("alert", { hidden: true })).toHaveTextContent(OUT_OF_SCOPE);
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-938 non-admin: saving a reorder is refused even when nothing moved, and nothing is sent", async () => {
    access.admin = false;
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-orderAccounts"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    await user.click(hiddenButton("Save"));
    expect(await screen.findByText(OUT_OF_SCOPE)).toBeInTheDocument();
    expect(screen.getByText("'Capex Accounts' order")).toBeInTheDocument();
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-ADCAPEX-939 admin: the same save is sent as usual", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    await user.type(await screen.findByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "80020");
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name"), "Roads");
    await user.click(hiddenButton("Save"));
    await waitFor(() => expect(client.createRecordAsync).toHaveBeenCalled());
    expect(screen.queryByText(OUT_OF_SCOPE)).not.toBeInTheDocument();
  });

  /* ── canvas parity pass, 20 Nov 2026 ── */

  it("UT-ADCAPEX-947 the account commands carry the canvas ItemIconNames and the header the canvas radio image", async () => {
    const dismiss = "DeactivateOrders";
    const checkmark = "ActivateOrders";
    const list = "NumberedList";
    const user = await openDevelopmentTab();
    const bar = "pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar";
    // "NumberedList" (CA:208).
    expect(screen.getByTestId(`${bar}-orderAccounts`).querySelector("svg")?.getAttribute("data-icon-name")).toBe(list);

    const land = screen.getByRole("button", { name: "Select account 80000 - Land" });
    // "CircleEmpty": one black ring; "CircleDotBlue": the ring and a #006eb9 dot.
    expect(land.querySelectorAll("circle")).toHaveLength(1);
    expect(land.querySelector("circle")).toHaveAttribute("stroke", "black");
    await user.click(land);
    expect(land.querySelectorAll("circle")).toHaveLength(2);
    expect(land.querySelectorAll("circle")[1]).toHaveAttribute("fill", "#006eb9");
    // "DeactivateOrders" for an Active account (CA:257).
    expect(screen.getByTestId(`${bar}-deactivateAccount`).querySelector("svg")?.getAttribute("data-icon-name")).toBe(dismiss);

    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    // "ActivateOrders" for an Inactive account (CA:244).
    expect(screen.getByTestId(`${bar}-activateAccount`).querySelector("svg")?.getAttribute("data-icon-name")).toBe(checkmark);
  });

  it("UT-ADCAPEX-948 the subaccount grid: canvas status icons per state, Reorder subaccounts always on, no invented empty line", async () => {
    const dismiss = "DeactivateOrders";
    const checkmark = "ActivateOrders";
    const list = "NumberedList";
    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Expand account 80000 - Land" }));
    const grid = "pcf_Account_AccountCardBody_SubAccounts";
    // "icon:DeactivateOrders" on an Active row, "icon:ActivateOrders" on an Inactive one (CA:546-568).
    expect((await screen.findByTestId(`${grid}-ChangeStatusIcon-${IDS.land1}`)).querySelector("svg")?.getAttribute("data-icon-name")).toBe(dismiss);
    expect(screen.getByTestId(`${grid}-ChangeStatusIcon-${IDS.land2}`).querySelector("svg")?.getAttribute("data-icon-name")).toBe(checkmark);
    // "icon:Edit" (CA:538-548) is the MDL2 pencil, drawn as the em: a 15 px glyph (`ColImageWidth: 15`). Edit and the
    // status icon and Delete are black (the user, 21 and 23 Nov 2026).
    const edit = screen.getByTestId(`${grid}-EditIcon-${IDS.land1}`);
    const pencil = edit.querySelector("svg") as SVGElement;
    expect(pencil.getAttribute("data-icon-name")).toBe("Edit");
    expect(pencil.getAttribute("viewBox")).toBe("0 0 2048 2048");
    // The colour and the no-hover rules live on the row-actions container (`iconBlack`), as nested rules on the
    // icon slot and the button; read them off the stylesheet for that container's classes.
    const rulesFor = (button: HTMLElement) => {
      // The button's parent is the `RowActions` container that carries the screen's `icon` / `iconBlack` classes.
      const classes = Array.from((button.parentElement as HTMLElement).classList);
      return Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules ?? [])).map((r) => r.cssText)
        .filter((t) => classes.some((c) => t.includes(`.${c} `) || t.includes(`.${c}:`)));
    };
    const editRules = rulesFor(edit);
    expect(editRules.some((t) => t.includes(".fui-Button__icon") && /color: (#0b0b0b|rgb\(11, 11, 11\))/.test(t) && !t.includes(":hover"))).toBe(true);
    expect(editRules.some((t) => t.includes(":hover") && t.includes("background-color: transparent"))).toBe(true);
    const statusRules = rulesFor(screen.getByTestId(`${grid}-ChangeStatusIcon-${IDS.land1}`));
    expect(statusRules.some((t) => t.includes(".fui-Button__icon") && /color: (#0b0b0b|rgb\(11, 11, 11\))/.test(t))).toBe(true);
    const deleteRules = rulesFor(screen.getByTestId(`${grid}-DeleteIcon-${IDS.land1}`));
    expect(deleteRules.some((t) => t.includes(".fui-Button__icon") && /color: (#0b0b0b|rgb\(11, 11, 11\))/.test(t) && !t.includes(":hover"))).toBe(true);
    // `HeaderVisible: =false`: no column headers.
    expect(screen.queryAllByRole("columnheader", { hidden: true })).toHaveLength(0);

    // Permits has no subaccounts: Reorder subaccounts is still enabled (D19) and no "No subaccounts yet." line.
    await user.click(screen.getByRole("button", { name: "Expand account 80010 - Permits" }));
    const reorder = await screen.findByTestId(`pcf_Account_AccountCardBody_SubAccountsCommandBar-${IDS.permits}-orderSubaccounts`);
    expect(reorder).toBeEnabled();
    expect(reorder.querySelector("svg")?.getAttribute("data-icon-name")).toBe(list);
    expect(screen.queryByText("No subaccounts yet.")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${grid}-${IDS.permits}`)).not.toBeInTheDocument();
    await user.click(reorder);
    expect(await screen.findByText("Subaccounts order")).toBeInTheDocument();
  });

  it("UT-ADCAPEX-949 every confirmation is the canvas pop-up: themePrimary CheckMark Confirm 128 wide, deletes included (no red)", async () => {
    // Reference classes (jsdom computes no Griffel styles, so compare the atomic class lists).
    const reference = (destructive: boolean) => {
      const { unmount } = render(
        <Harness>
          <ConfirmDialog
            open title="Reference" description="d" confirmText="Confirm" confirmWidth={128}
            classicPopUp darkScrim destructive={destructive} onConfirm={() => {}} onCancel={() => {}}
          />
        </Harness>,
      );
      const classes = {
        confirm: screen.getByTestId("confirm-dialog-confirm").className,
        cancel: screen.getByTestId("confirm-dialog-cancel").className,
        confirmPath: pathIn(screen.getByTestId("confirm-dialog-confirm")),
      };
      unmount();
      return classes;
    };
    const canvas = reference(false);
    const red = reference(true);
    expect(canvas.confirm).not.toBe(red.confirm);

    const user = await openDevelopmentTab();
    await user.click(screen.getByRole("button", { name: "Select account 80010 - Permits" }));
    await user.click(await screen.findByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-deleteAccount"));
    expect(await screen.findByText("Delete Account?")).toBeInTheDocument();
    const confirm = screen.getByTestId("confirm-dialog-confirm");
    expect(confirm.className).toBe(canvas.confirm);
    expect(confirm).toHaveStyle({ width: "128px" });
    expect(confirm).toHaveTextContent("Confirm");
    expect(pathIn(confirm)).toBe(iconPath(<CheckmarkRegular />));
    expect(pathIn(confirm)).toBe(canvas.confirmPath);
    const cancel = screen.getByTestId("confirm-dialog-cancel");
    expect(cancel.className).toBe(canvas.cancel);
    expect(cancel).toHaveTextContent("Cancel");
    expect(pathIn(cancel)).toBe(iconPath(<DismissRegular />));
    await user.click(dialogButton("Cancel"));
    await waitFor(() => expect(screen.queryByText("Delete Account?")).not.toBeInTheDocument());

    // A subaccount delete is the same button.
    await user.click(hiddenButton("Expand account 80000 - Land"));
    const row = await screen.findByTestId("subaccount-row-80000_1");
    await user.click(await within(row).findByRole("button", { name: "Delete", hidden: true }));
    expect(await screen.findByText("Delete Subaccount?")).toBeInTheDocument();
    expect(screen.getByText('Are you sure that you want to permanently delete "Substation" subaccount?')).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog-confirm").className).toBe(canvas.confirm);
  });

  it("UT-ADCAPEX-950 the account panel fields: a disabled Category dropdown, no counter under Name, no message for a blank name", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    const category = screen.getByTestId("drp_Account_RightPanel_NewEditAccount_BodyContent_Category");
    expect(category).toHaveAttribute("role", "combobox");
    expect(category).toBeDisabled();
    expect(category).toHaveAttribute("aria-label", "Category");
    const name = screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name");
    expect(name).toHaveAttribute("maxLength", "55");
    await user.type(name, "Roads");
    expect(screen.queryByText("5/55")).not.toBeInTheDocument();
    await user.clear(name);
    expect(screen.queryByText(MSG.nameRequired)).not.toBeInTheDocument();
    expect(hiddenButton("Save")).toBeDisabled();
    // Digits only (SOURCE DEFECT fix kept, D153): a sign, which the canvas let through, shows the message.
    await user.type(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Number"), "-5");
    expect(screen.getByText(MSG.accountNotNumeric)).toBeInTheDocument();
    // Captions are Semibold (canvas `Weight: Semibold`) through a rule that out-ranks canvas.css's regular weight;
    // jsdom resolves descendant selectors, so the computed style shows what the browser applies.
    const nameLabel = name.closest(".fui-Field")!.querySelector("label") as HTMLElement;
    expect(getComputedStyle(nameLabel).fontWeight).toMatch(/^(600|semibold|var\(--fontWeightSemibold\))$/);
    // The disabled Category dropdown is a white box with a grey outline (modern DropDown, CA:1074-1083), not the
    // panel's filled grey input.
    const dropdown = category.closest(".fui-Dropdown") as HTMLElement;
    expect(getComputedStyle(dropdown).backgroundColor).toMatch(/var\(--colorNeutralBackground1\)|rgb\(255, 255, 255\)|#fff/i);
  });

  it("UT-ADCAPEX-953 the account form starts at the panel's own 20 px padding and lays each field in a 70 px block (CA:1049, 1063)", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount"));
    expect(await screen.findByText("New Account")).toBeInTheDocument();
    const category = screen.getByTestId("drp_Account_RightPanel_NewEditAccount_BodyContent_Category");
    const field = category.closest(".fui-Field") as HTMLElement;
    const form = field.parentElement as HTMLElement;
    const formRules = appliedRules(form);
    // No second top padding on top of `.canvas-panel-body`'s 20 px, and no gap between the 70 px blocks.
    expect(formRules["padding-top"]).toBeUndefined();
    expect(formRules["row-gap"]).toMatch(/^0(px)?$/);
    // Every atomic class on the form resolves "& .fui-Field" → min-height 70px; read it off the stylesheet rules.
    const sheetText = Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules ?? []))
      .map((r) => r.cssText).filter((t) => Array.from(form.classList).some((c) => t.includes(`.${c} `)));
    expect(sheetText.some((t) => t.includes(".fui-Field") && t.includes("min-height: 70px"))).toBe(true);
    expect(sheetText.some((t) => t.includes(".fui-Field__label") && t.includes("padding-bottom: 5px"))).toBe(true);
  });

  it("UT-ADCAPEX-951 the reorder panel lists names only, draggable, under the verbatim canvas hint", async () => {
    const user = await openDevelopmentTab();
    await user.click(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-orderAccounts"));
    expect(await screen.findByText("'Capex Accounts' order")).toBeInTheDocument();
    expect(screen.getByText("To reorder drag and drop listed items")).toBeInTheDocument();
    const land = screen.getByTestId("reorder-item-80000");
    const permits = screen.getByTestId("reorder-item-80010");
    expect(land).toHaveTextContent(/^Land$/);
    expect(permits).toHaveTextContent(/^Permits$/);
    expect(land).toHaveAttribute("draggable", "true");
    // The category's accounts, by Order (CA:2166-2181).
    const items = within(screen.getByRole("list", { name: "Accounts in order", hidden: true })).getAllByRole("listitem", { hidden: true });
    expect(items.map((li) => li.textContent)).toEqual(["Land", "Permits"]);
  });

  it("UT-ADCAPEX-952 a category without accounts shows nothing under the command bar (gallery Visible: AllItemsCount>0)", async () => {
    renderScreen();
    expect(await screen.findAllByRole("tab")).toHaveLength(6);
    expect(screen.getByTestId("pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar-newAccount")).toBeEnabled();
    expect(screen.queryByText("No accounts in this category")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gal_Account_Accounts")).not.toBeInTheDocument();
  });
});

/** The `d` of the first `<path>` an element draws (Fluent icons are one-path SVGs). */
function pathIn(el: Element): string | null {
  return el.querySelector("path")?.getAttribute("d") ?? null;
}

/** The `d` of a Fluent icon, rendered on its own. */
function iconPath(icon: ReactElement): string | null {
  const { container, unmount } = render(icon);
  const d = pathIn(container);
  unmount();
  return d;
}
