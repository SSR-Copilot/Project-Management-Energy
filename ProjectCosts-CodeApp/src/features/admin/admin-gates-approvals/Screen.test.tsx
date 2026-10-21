// @vitest-environment jsdom
/**
 * Render and behaviour tests for the Admin Project Gates Approvals Screen, with `hooks.ts` mocked
 * by fixed rows (no Dataverse). `rules.test.ts` covers the rules; this file covers the
 * composition: canvas captions and test ids, and the write job handed to `run`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { GATE_TABLE_COLUMNS, SCREEN_LABELS } from "./rules";
import AdminGatesApprovalsScreen from "./Screen";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ locale: "en-GB", loading: false }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const run = vi.fn(async () => []);

vi.mock("./hooks", () => {
  const ok = <V,>(data: V) => ({ data, isLoading: false, error: undefined, connected: true });
  const people = (n: number, prefix: string) => JSON.stringify(Array.from({ length: n }, (_, i) => ({
    PersonaKey: `${prefix}${i}`, PersonaName: `Person ${prefix}${i}`, PersonaRole: `${prefix}${i}@vsb.energy`,
  })));
  const pm = { id: "pm-obj", displayName: "Pat Manager", mail: "pat@vsb.energy" };
  return {
    TABLES: [],
    useGateCountries: () => ok([
      { id: "fr", name: "France" }, { id: "de", name: "Germany" }, { id: "es", name: "Spain" },
    ]),
    useGateStates: () => ok([
      { id: "s0", name: "Draft", order: 0, isVisibleOnChecklist: true, owningBusinessUnitId: "bu" },
      { id: "s1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true, owningBusinessUnitId: "bu" },
      { id: "s2", name: "Cluster 2", order: 2, isVisibleOnChecklist: true, owningBusinessUnitId: "bu" },
    ]),
    useGateApprovals: () => ok([{
      id: "a1", name: "Cluster 1 to Cluster 2", approvalMode: 952850000, gateActive: true,
      clusterStateId: "s1", countryId: "de", technology: 952850000, portfolioManagerId: "pm-row",
      defaultApprovals: people(2, "ap"), defaultContributors: people(5, "co"), defaultNotifications: null,
    }]),
    useScopeCountryTechId: () => ok("ct-de-wind"),
    useChecklistItems: () => ok([
      { id: "t1", name: "Permit", order: 1, countryTechId: "ct-de-wind", clusterStateId: "s1" },
      { id: "t2", name: "Grid", order: 2, countryTechId: "ct-de-wind", clusterStateId: "s1" },
    ]),
    useChecklistApprovals: () => ok([{
      id: "c1", name: "Permit", approvalMode: 952850002, gateActive: false, projectDefaultChecklistId: "t1",
      portfolioManagerId: null, defaultApprovers: null, defaultContributors: null,
      defaultNotifications: people(1, "no"),
    }]),
    usePeopleSearch: (term: string) => ok(term ? [
      { id: "co0", displayName: "Person co0", mail: "co0@vsb.energy" },
      { id: "new", displayName: "New Person", mail: "new@vsb.energy" },
    ] : []),
    usePortfolioManagerPersonas: () => ok((id: string | null) => (id === "pm-row" ? pm : null)),
    useGateWrites: () => ({ run, progress: null, error: null, success: null, clear: () => undefined }),
  };
});

function renderScreen() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <AdminGatesApprovalsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

type Job = { progress: string; success?: string; plan: { writes: { op: string; entitySet: string; id?: string; data?: Record<string, unknown> }[] } };
const lastJob = (): Job => (run.mock.calls.at(-1) as unknown as [Job])[0];

beforeEach(() => run.mockClear());

describe("AdminGatesApprovalsScreen (connected)", () => {
  it("UT-ADGATE-901 renders the title, the rail without Spain, the headline and no not-connected notice", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: SCREEN_LABELS.pageTitle })).toBeInTheDocument();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    const rail = screen.getByTestId("cmp_Admin_ProjectGates_NestedCountryTechnologyPicker");
    expect(within(rail).getAllByRole("button").map((b) => b.getAttribute("aria-label")))
      .toEqual(["Germany", "Wind", "PV", "France"]);
    expect(screen.getByTestId("lbl_Admin_ProjectGates_Approvals_Headline").textContent)
      .toBe("Project Gates | Germany | Wind");
  });

  it("UT-ADGATE-902 the table: headers, gate descriptions, collapsed counts and the check-list row", () => {
    renderScreen();
    const table = screen.getByTestId("gal_Admin_ProjectGates_DefaultApprovals_Clusters");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([...GATE_TABLE_COLUMNS]);
    const text = table.textContent ?? "";
    expect(text).toContain("Draft to Cluster 1");
    expect(text).toContain("Cluster 1 to Cluster 2");
    expect(text).toContain("5 Contributors");
    expect(text).toContain("Pat Manager");
    expect(text).toContain("Permit");
    expect(screen.getAllByTestId("but_Admin_ProjectGatest_Approvals_Row_Edit_3")).toHaveLength(3);
  });

  it("UT-ADGATE-903 collapsing a gate hides its check-list rows but keeps Add Task", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse"));
    expect(screen.getByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse")).toHaveTextContent("+");
    expect(screen.queryByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Edit")).toBeNull();
    expect(screen.getAllByTestId("but_Admin_ProjectGatest_Approvals_Row_Edit_3")).toHaveLength(3);
  });

  it("UT-ADGATE-904 the check-list status chip flips vsb_gateisactive with no dialog", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_ToggleStatus"));
    expect(run).toHaveBeenCalledTimes(1);
    expect(lastJob().plan.writes).toEqual([expect.objectContaining({ op: "update", id: "c1", data: { vsb_gateisactive: true } })]);
  });

  it("UT-ADGATE-905 the gate status chip toggles with no confirmation", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_ToggleStauts"));
    expect(run).toHaveBeenCalledTimes(1);
    expect(lastJob().plan.writes).toEqual([expect.objectContaining({ id: "a1", data: { vsb_gateactive: false } })]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("UT-ADGATE-906 editing a gate and saving sends the canvas progress text and the gate payload", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit")[1]!);
    expect(await screen.findByText("Edit Approvers", {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save")).toBeEnabled());
    await user.click(screen.getByTestId("pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save"));
    expect(run).toHaveBeenCalledTimes(1);
    const job = lastJob();
    expect(job.progress).toBe("Approvals data for Project Gates | Germany | Wind\nGate: 'Cluster 1 to Cluster 2' will be saved, please wait...");
    expect(job.success).toBe("Approvals was successfully saved.");
    expect(job.plan.writes[0]).toEqual(expect.objectContaining({ op: "update", id: "a1" }));
    expect(job.plan.writes[0]!.data).toEqual(expect.objectContaining({
      vsb_name: "Cluster 1 to Cluster 2",
      "vsb_Approvalparticipant1@odata.bind": "/aadusers(pm-obj)",
      "owningbusinessunit@odata.bind": "/businessunits(bu)",
    }));
  });

  it("UT-ADGATE-907 the Approvers picker caps at 5, hides selected people and removes one", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit")[1]!);
    const input = await screen.findByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2", {}, { timeout: 5000 });
    expect(input).toHaveAttribute("title", "Select Contributors");
    await user.type(input, "pe");
    // "co0" is already a contributor, so only the new person is suggested.
    expect(await screen.findByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2-suggestion-new", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2-suggestion-co0")).toBeNull();
    await user.click(screen.getByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2-remove-co0"));
    expect(screen.queryByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2-remove-co0")).toBeNull();
    // The Portfolio Manager picker holds one person and is full.
    expect(screen.getByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger")).toBeDisabled();
  });

  it("UT-ADGATE-908 Add Task opens 'Add Approvers' with the first unapproved template and saves a create", async () => {
    const user = userEvent.setup();
    renderScreen();
    const addTasks = screen.getAllByTestId("but_Admin_ProjectGatest_Approvals_Row_Edit_3");
    await user.click(addTasks[1]!);
    expect(await screen.findByText("Add Approvers", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId("drp_Admin_ProjectGates_Approvals_Form_Fields_State_1")).toHaveTextContent("Grid");
    expect(screen.queryByTestId("btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval")).toBeNull();
    const notif = screen.getByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications");
    await user.type(notif, "ne");
    await user.click(await screen.findByTestId("pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications-suggestion-new", {}, { timeout: 5000 }));
    await user.click(screen.getByTestId("pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save"));
    const job = lastJob();
    expect(job.progress).toBe("Approvals data for Project Gates | Germany | Wind\nCheck List: 'Grid' will be saved, please wait...");
    expect(job.plan.writes[0]).toEqual(expect.objectContaining({ op: "create", entitySet: "vsb_checklistdefaultapprovalses" }));
    expect(job.plan.writes[0]!.data).toEqual(expect.objectContaining({
      vsb_name: "Grid", vsb_gateisactive: false,
      "vsb_ProjectDefaultCheckListId@odata.bind": "/vsb_projectdefaultchecklistses(t2)",
    }));
  });

  it("UT-ADGATE-909 delete shows the canvas dialog text and sends the canvas progress text", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Delete"));
    const dialog = await screen.findByRole("alertdialog", { hidden: true }, { timeout: 5000 });
    expect(within(dialog).getByText("Delete Check List Approval Item?")).toBeInTheDocument();
    expect(dialog.textContent).toContain("Check List Item: 'Permit'");
    expect(dialog.textContent).toContain("Cluster 1 to Cluster 2");
    await user.click(await within(dialog).findByRole("button", { name: "Delete", hidden: true }, { timeout: 10_000 }));
    const job = lastJob();
    expect(job.progress).toBe("Approval item for Project Gates | Germany | Wind\nCheck List: 'Permit' being deleted, please wait...");
    expect(job.plan.writes).toEqual([expect.objectContaining({ op: "delete", id: "c1" })]);
  });
});
