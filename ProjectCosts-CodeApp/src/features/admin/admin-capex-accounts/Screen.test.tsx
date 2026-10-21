// @vitest-environment jsdom
/**
 * Render and behaviour tests for the Admin CAPEX Accounts screen, with `hooks.ts` mocked by fixed
 * rows (no Dataverse). Writes are asserted at the hook boundary: which job — progress text and
 * plan — the screen hands to `useCapexWrites().run`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CAPEX_SCREEN_TEXT as T, CAPEX_TOOLBAR_LABELS } from "./rules";
import AdminCapexAccountsScreen from "./Screen";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ project: undefined, projectId: undefined, locale: "en-GB", loading: false }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const run = vi.fn(async () => ["new-acc"]);

vi.mock("./hooks", () => {
  const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
  const a = (id: string, number: string, name: string, parentId: string | null, order: number, status = 0) =>
    ({ id, number, name, parentId, order, status, owningBusinessUnitId: null });
  return {
    TABLES: [],
    useCapexTree: () => ok([
      a("root", "00001", "Root", null, 0),
      a("cat1", "10001", "Development", "root", 1),
      a("acc1", "80000", "Turbine Supply", "cat1", 1),
      a("acc2", "80001", "Grid", "cat1", 2),
      a("sub1", "80000_01", "Rotor", "acc1", 1),
    ]),
    useCapexContracts: () => ok([]),
    useCapexPrivileges: () => ok({ canCreate: true, canWrite: true, canDelete: true }),
    useCapexWrites: () => ({ run, progress: null, error: null, success: null, clear: () => undefined }),
    checkedSavePlan: vi.fn(),
    cascadeDeactivatePlan: vi.fn(),
  };
});

function renderScreen() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <AdminCapexAccountsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

beforeEach(() => run.mockClear());

describe("Admin CAPEX Accounts screen", () => {
  it("UT-ADCAPEX-901 renders the canvas heading, the category tab and its accounts", () => {
    renderScreen();
    expect(screen.getByText(T.title)).toBeTruthy();
    expect(screen.getByTestId("capex-accounts-category-cat1")).toHaveTextContent("Development");
    expect(screen.getAllByTestId("con_Account_AccountCard")).toHaveLength(2);
  });

  it("UT-ADCAPEX-902 commands are enabled once connected; Reorder counts the category's accounts", () => {
    renderScreen();
    for (const key of ["reorder", "new"]) {
      expect((screen.getByTestId(`command-${key}`) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.getByRole("button", { name: CAPEX_TOOLBAR_LABELS.reorder }).querySelector("svg")).not.toBeNull();
  });

  it("UT-ADCAPEX-903 a second click on the selected card deselects it", async () => {
    const user = userEvent.setup();
    renderScreen();
    const [header] = screen.getAllByTestId("btn_Account_AccountCardHeader");
    await user.click(header!);
    expect(header).toHaveAttribute("aria-pressed", "true");
    await user.click(header!);
    expect(header).toHaveAttribute("aria-pressed", "false");
  });

  it("UT-ADCAPEX-904 New clears the selection and keeps the Category dropdown disabled", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("btn_Account_AccountCardHeader")[0]!);
    await user.click(screen.getByTestId("command-new"));
    expect(screen.getByTestId("drp_Account_RightPanel_NewEditAccount_BodyContent_Category")).toBeDisabled();
    expect(screen.getByTestId("txt_Account_RightPanel_NewEditAccount_BodyContent_Name")).toHaveAttribute("maxlength", "55");
  });

  it("UT-ADCAPEX-905 the subaccount prefix shows for New only", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("ico_Account_AccountCard_Down")[0]!);
    await user.click(screen.getByTestId("command-newSubaccount"));
    expect(screen.getByTestId("lbl_Account_RightPanel_NewEditSubaccount_BodyContent_AccountNumberAsPrefix"))
      .toHaveTextContent("80000_");
    await user.click(screen.getByTestId("pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Cancel"));
    await user.click(await screen.findByTestId("capex-accounts-subaccount-edit-sub1", {}, { timeout: 5000 }));
    expect(screen.queryByTestId("lbl_Account_RightPanel_NewEditSubaccount_BodyContent_AccountNumberAsPrefix"))
      .toBeNull();
  });

  it("UT-ADCAPEX-906 the ordering panel lists the category's accounts by name and saves the order", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("command-reorder"));
    // The panel re-renders while it opens, so re-query the list each time rather than hold it.
    // `hidden: true`: under a loaded full run the panel can still be in its opening transition
    // (content outside the accessibility tree), the same fix as UT-ADCHK-909.
    const names = () => within(screen.getByTestId("pcf_Account_RightPanel_Ordering_BodyContent_Accounts"))
      .getAllByRole("listitem", { hidden: true }).map((li) => li.textContent);
    await waitFor(() => expect(names()).toEqual(["Turbine Supply", "Grid"]), { timeout: 10000 });
    await user.click(screen.getByTestId("capex-accounts-order-down-acc1"));
    await user.click(screen.getByTestId("pcf_Account_RightPanel_Ordering_BodyButtons_Save"));
    expect(run).toHaveBeenCalledTimes(1);
    const job = (run.mock.calls[0] as unknown as [{ progress: string; plan: { writes: { id: string; data: unknown }[] } }])[0];
    expect(job.progress).toBe(T.savingOrder);
    expect(job.plan.writes).toEqual([
      expect.objectContaining({ id: "acc2", data: { vsb_order: 1 } }),
      expect.objectContaining({ id: "acc1", data: { vsb_order: 2 } }),
    ]);
  }, 30_000);
});
