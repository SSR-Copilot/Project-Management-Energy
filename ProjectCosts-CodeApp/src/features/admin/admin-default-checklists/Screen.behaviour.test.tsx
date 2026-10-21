// @vitest-environment jsdom
/**
 * Behaviour tests for the Admin Project Default Checklists Screen with rows on screen.
 *
 * `hooks.ts` is mocked with fixed rows (no Dataverse), so these tests exercise the composition
 * the canvas defines: the gate captions, select vs fold, the hidden Reset button's behaviour on
 * close, the new-task defaults, the reorder panel, and which write plans the screen hands to
 * `useChecklistWrites().run` (the plans themselves are unit-tested in `rules.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_ADMIN } from "@/data/dataverseNames";
import { LABELS } from "./rules";
import AdminDefaultChecklistsScreen from "./Screen";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ locale: "en-GB", loading: false }),
}));

vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const run = vi.fn(async () => ["new-id"]);

vi.mock("./hooks", () => {
  const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
  const task = (id: string, name: string, order: number) => ({
    id, name, order, holdingTaskDescription: null, gateRelevance: false, isCompletionDate: false,
    toDelete: false, countryTechId: "sc-1", clusterStateId: "g-draft", status: 0,
  });
  return {
    TABLES: ["vsb_projectdefaultchecklistses"],
    useChecklistScopes: () => ok([
      { id: "sc-1", name: "Germany Wind", order: "1", countryId: "de", technology: 1, owningBusinessUnitId: "bu-1" },
    ]),
    useChecklistGates: () => ok([
      { id: "g-c1", name: "Cluster 1", order: 2, isVisibleOnChecklist: true },
      { id: "g-draft", name: "Draft", order: 1, isVisibleOnChecklist: true },
    ]),
    useScopeTasks: (_scope: string | null, gate: string | null) =>
      ok(gate === "g-draft" ? [task("t-1", "Permit", 1), task("t-2", "Grid study", 2)] : []),
    useBlockingApprovals: () => ok(new Set<string>()),
    useChecklistWrites: () => ({ run, progress: null, error: null, success: null, clear: () => undefined }),
    highestTaskOrder: async () => 2,
  };
});

function renderScreen() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <AdminDefaultChecklistsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

beforeEach(() => run.mockClear());

describe("AdminDefaultChecklistsScreen (with rows)", () => {
  it("UT-ADCHK-906 gate headers show the canvas captions for the stored names, in order", () => {
    renderScreen();
    const heads = screen.getAllByTestId("btn_Select_DefaultChecklist_AdminScreen").map((b) => b.textContent);
    expect(heads).toEqual(["Draft to Cluster 1", "Cluster 1 to Cluster 2"]);
  });

  it("UT-ADCHK-907 btn_Select selects without unfolding; the chevron unfolds and selects", async () => {
    const user = userEvent.setup();
    renderScreen();
    const [draft] = screen.getAllByTestId("btn_Select_DefaultChecklist_AdminScreen");
    await user.click(draft!);
    expect(draft).toHaveAttribute("aria-pressed", "true");
    // Still folded: every gate starts folded and btn_Select does not fold.
    expect(screen.queryByText("Permit")).not.toBeInTheDocument();

    const [down] = screen.getAllByTestId("ico_Down_DefaultChecklist_AdminScreen");
    await user.click(down!);
    expect(screen.getByText("Permit")).toBeInTheDocument();
    expect(screen.getByTestId("ico_Up_DefaultChecklist_AdminScreen")).toHaveAttribute("aria-label", LABELS.collapse);
  });

  it("UT-ADCHK-908 a new task opens Inactive, and Cancel resets every field (hidden Reset button)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("ico_Down_DefaultChecklist_AdminScreen")[0]!);
    await user.click(screen.getByRole("button", { name: LABELS.addTask }));
    const active = screen.getByTestId("tgl_Active_ChecklistForm");
    expect(active).not.toBeChecked();

    const description = within(screen.getByTestId("txt_Admin_Checklist_Form_Fields_Name")).queryByRole("textbox")
      ?? screen.getByTestId("txt_Admin_Checklist_Form_Fields_Name");
    await user.type(description, "Typed");
    await user.click(screen.getByTestId("tgl_GateRelevance_ChecklistForm"));
    await user.click(screen.getByTestId("pcf_but_Admin_Admin_Checklist_Form_Buttons_Cancel"));

    // The panel closes with a transition; the page behind it is aria-hidden until it finishes.
    await user.click(await screen.findByRole("button", { name: LABELS.addTask }, { timeout: 5000 }));
    const again = within(screen.getByTestId("txt_Admin_Checklist_Form_Fields_Name")).queryByRole("textbox")
      ?? screen.getByTestId("txt_Admin_Checklist_Form_Fields_Name");
    expect(again).toHaveValue("");
    expect(screen.getByTestId("tgl_GateRelevance_ChecklistForm")).not.toBeChecked();
  });

  it("UT-ADCHK-909 the reorder panel reorders with Move up / Move down", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("ico_Down_DefaultChecklist_AdminScreen")[0]!);
    await user.click(screen.getByRole("button", { name: LABELS.reorder }));
    // The panel re-renders while it opens, so re-query the list each time rather than hold it.
    // `hidden: true`: under a loaded full run the panel can still be in its opening transition,
    // when its content is outside the accessibility tree, and the rows were found in the DOM
    // but not by role (the same fix as the 004/005/006 dialog lookups).
    const names = () => within(screen.getByTestId("pcf_ReorderTaskList_AdminScreen"))
      .getAllByRole("listitem", { hidden: true }).map((li) => li.textContent);
    await waitFor(() => expect(names()).toEqual(["Permit", "Grid study"]), { timeout: 10000 });

    expect(screen.getByTestId("default-checklists-reorder-up-t-1")).toBeDisabled();
    await user.click(screen.getByTestId("default-checklists-reorder-down-t-1"));
    await waitFor(() => expect(names()).toEqual(["Grid study", "Permit"]), { timeout: 10000 });
  }, 30_000);

  it("UT-ADCHK-910 Reorder carries the canvas NumberedList icon and rows show the activation icon", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("ico_Down_DefaultChecklist_AdminScreen")[0]!);
    expect(screen.getByRole("button", { name: LABELS.reorder }).querySelector("svg")).not.toBeNull();
    const activate = screen.getAllByTestId("ico_ActivateDeactivate_TasksInClusterDefaultChecklist_AdminScreen")[0]!;
    expect(activate).toHaveTextContent(LABELS.statusActive);
    expect(activate.querySelector("svg")).not.toBeNull();
    expect(CHOICE_ADMIN.status.active).toBe(0);
  });

  it("UT-ADCHK-911 Save of a new task sends the flow-safe create-then-update plan", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("ico_Down_DefaultChecklist_AdminScreen")[0]!);
    await user.click(screen.getByRole("button", { name: LABELS.addTask }));
    const description = within(screen.getByTestId("txt_Admin_Checklist_Form_Fields_Name")).queryByRole("textbox")
      ?? screen.getByTestId("txt_Admin_Checklist_Form_Fields_Name");
    await user.type(description, "New task");
    await user.click(screen.getByTestId("pcf_but_Admin_Checklist_Form_Buttons_Save"));
    expect(run).toHaveBeenCalledTimes(1);
    const job = (run.mock.calls[0] as unknown as [{ progress: string; plan: () => Promise<{ writes: { op: string; id?: string; data?: Record<string, unknown> }[] }> }])[0];
    expect(job.progress).toBe("Checklist item 'New task' will be saved, please wait...");
    const plan = await job.plan();
    expect(plan.writes.map((w) => w.op)).toEqual(["create", "update"]);
    expect(plan.writes[0]!.data!.vsb_order).toBe(3);          // highest (2) + 1, read at save time
    expect(plan.writes[1]!.id).toBe("@created");
    expect(plan.writes[1]!.data!.statecode).toBe(1);          // new tasks start Inactive
  });

  it("UT-ADCHK-912 Delete is a soft delete plus renumbering of the later rows", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getAllByTestId("ico_Down_DefaultChecklist_AdminScreen")[0]!);
    await user.click(screen.getAllByTestId("ico_Delete_TasksInClusterDefaultChecklist_AdminScreen")[0]!);
    // The row icons are also named "Delete"; take the confirmation dialog's own button.
    const confirm = await screen.findByTestId("confirm-dialog-confirm", {}, { timeout: 5000 });
    expect(confirm).toHaveTextContent(LABELS.deleteConfirm);
    await user.click(confirm);
    const job = (run.mock.calls[0] as unknown as [{ progress: string; plan: { writes: { op: string; id: string; data: Record<string, unknown> }[] } }])[0];
    expect(job.progress).toBe("Deleting item 'Permit', please wait...");
    expect(job.plan.writes).toEqual([
      expect.objectContaining({ op: "update", id: "t-1", data: { vsb_todelete: true } }),
      expect.objectContaining({ op: "update", id: "t-2", data: { vsb_order: 1 } }),
    ]);
    expect(job.plan.writes.some((w) => w.op === "delete")).toBe(false);
  });
});
