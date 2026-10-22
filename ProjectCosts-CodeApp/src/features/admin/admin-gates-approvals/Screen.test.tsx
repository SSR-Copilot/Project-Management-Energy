// @vitest-environment jsdom
/**
 * Project Gates screen — render smoke test and the behaviours only a mounted screen can show:
 * open/cancel writes nothing, no stale state between editors, the delete confirmation names the
 * clicked row, a failed toggle reverts, a failed save keeps the panel and the input, a missing
 * table degrades gracefully, and a user without admin access gets a read-only screen.
 * The repository (reads) and `executePlan` (writes) are mocked; the repository's own I/O is covered
 * by `@/data/adminGatesApprovals.test.ts` and the exact requests of each write by `writes.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/*
 * Determinism under load: every findBy / waitFor in this file waits up to 5 s instead of the
 * 1 s default (Fluent drawers/dialogs mount through portals and motion, which is slow on a
 * busy worker), and each test gets a generous overall budget.
 */
configure({ asyncUtilTimeout: 5000 });
const TEST_TIMEOUT = 20_000;
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const repo = vi.hoisted(() => ({
  listProjectStates: vi.fn(),
  loadDataset: vi.fn(),
  searchPeople: vi.fn(),
  resolvePeople: vi.fn(),
}));

vi.mock("@/data/adminGatesApprovals", () => ({ projectGatesRepository: repo }));

/** The writes are WritePlans run by `executePlan` (through `runPlan`); `PlanError` and the rest stay real. */
const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

/** Admin access is the one rule the header and rail use; each test sets it through `access.admin`. */
const access = vi.hoisted(() => ({ admin: true }));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => access.admin }));

/** Countries come from the shared `@/data/countries` read, which calls the generated service. */
const countriesService = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: countriesService }));

import { vsbTheme } from "@/theme/fluent";
import { appliedRules } from "@/test/appliedRules";
import { AppToaster, RowActions } from "@/components";
import { EditRegular } from "@fluentui/react-icons";
import { PlanError } from "@/data/executePlan";
import type { WritePlan } from "@/data/writePlan";
import { DataError } from "@/platform/errors";
import { ERROR_HINT } from "@/platform/userMessage";
import {
  FIXTURE_APPROVALS, FIXTURE_CHECKLISTS, FIXTURE_COUNTRIES, FIXTURE_COUNTRY_ROWS, FIXTURE_STATES, FIXTURE_TEMPLATES, fixtureDataset,
  HIDDEN_CHECKLISTS, person,
} from "./fixtures";
import { GATE_BLANK_MESSAGE } from "./rules";
import ProjectGatesSettingsScreen from "./Screen";

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        {/* Toasts go through the shared `useNotify` → `<AppToaster />` (mounted by AppShell in the app). */}
        <AppToaster />
        {children}
      </QueryClientProvider>
    </FluentProvider>
  );
}

const renderScreen = () => render(<Harness><ProjectGatesSettingsScreen /></Harness>);
const noWrites = () => expect(exec).not.toHaveBeenCalled();
/** Every write of every plan the screen sent to `executePlan`, in order. */
const sentWrites = () => exec.mock.calls.flatMap((c) => (c[0] as WritePlan).writes);
const TASK_APPROVALS = "vsb_checklistdefaultapprovalses";
const GATE_TEMPLATES = "vsb_projectdefaultapprovalses";
/** The text of the element(s) an element's `aria-describedby` points at (the disabled-reason tooltip). */
const describedText = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "")
  .split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");

/*
 * The grid's controls carry their canvas control names as `data-testid` (CONVENTIONS rule 16),
 * suffixed with the row's stable id: a gate row's `Project States` id, a task row's approval id.
 * Their aria-labels are the bare canvas captions ("Edit", "Delete", "Add Task", "-" / "+"), so a
 * row's control is found by its test id.
 */
const stateIdOf = (order: number) => FIXTURE_STATES.find((s) => s.order === order)!.id;
const TASK_ID = FIXTURE_APPROVALS[0]!.id;
const gateRow = (order: number) => screen.getByTestId(`con_Admin_ProjectGates_DefaultClusterApproval_Item-${stateIdOf(order)}`);
const gateEdit = (order: number) => screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit-${stateIdOf(order)}`);
const gateCollapse = (order: number) => screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse-${stateIdOf(order)}`);
const addTask = (order: number) => screen.getByTestId(`but_Admin_ProjectGatest_Approvals_Row_Edit_3-${stateIdOf(order)}`);
const taskEdit = () => screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Edit-${TASK_ID}`);
const taskDelete = () => screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Delete-${TASK_ID}`);

beforeEach(() => {
  vi.clearAllMocks();
  access.admin = true;
  countriesService.getAll.mockResolvedValue({ success: true, data: FIXTURE_COUNTRY_ROWS });
  repo.listProjectStates.mockResolvedValue(FIXTURE_STATES);
  repo.loadDataset.mockResolvedValue(fixtureDataset());
  repo.searchPeople.mockResolvedValue([]);
  exec.mockReset();
  exec.mockResolvedValue({ done: 1, createdIds: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  // Explicit unmount so no drawer/dialog portal or tabster state survives into the next test.
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ProjectGatesSettingsScreen", { timeout: TEST_TIMEOUT }, () => {
  it("UT-ADGATE-901 renders Germany / Wind by default with one row per visible gate; Spain is not offered", async () => {
    renderScreen();
    expect(await screen.findByText("Project Gates | Germany | Wind")).toBeInTheDocument();
    expect(await screen.findByText("Draft to Cluster 1")).toBeInTheDocument();
    for (let o = 0; o < 6; o += 1) expect(gateRow(o)).toBeInTheDocument();
    expect(screen.queryByTestId(`con_Admin_ProjectGates_DefaultClusterApproval_Item-${stateIdOf(6)}`)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spain" })).not.toBeInTheDocument();
    expect(screen.getByText("4 Approvers")).toBeInTheDocument();
    expect(screen.getByText("Grid connection request")).toBeInTheDocument();
    expect(repo.loadDataset).toHaveBeenCalledWith(FIXTURE_COUNTRIES[1]!.id, 952850000);
  });

  it("UT-ADGATE-902 selecting France → PV reloads for that context", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(screen.getByRole("button", { name: "Expand France technologies" }));
    fireEvent.click(screen.getByRole("button", { name: "France PV" }));
    expect(await screen.findByText("Project Gates | France | PV")).toBeInTheDocument();
    await waitFor(() => expect(repo.loadDataset).toHaveBeenCalledWith(FIXTURE_COUNTRIES[0]!.id, 952850001));
  });

  it("UT-ADGATE-903 opening a placeholder gate and cancelling writes nothing", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(2));
    expect(await screen.findByText("Add Approvers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // Notifications required
    expect(screen.getByRole("button", { name: "Reset Gate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Add Approvers")).not.toBeInTheDocument());
    noWrites();
  });

  it("UT-ADGATE-904 Add Task opens a fresh form for THAT gate and Cancel writes nothing", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(addTask(1));
    expect(await screen.findByText("Add Approvers")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Check List" })).toHaveTextContent("Land lease signed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Add Approvers")).not.toBeInTheDocument());
    noWrites();
    // Cluster 3 has no check list task without an approval. Disabled-focusable (aria-disabled).
    expect(addTask(3)).toHaveAttribute("aria-disabled", "true");
    expect(addTask(2)).toBeEnabled();
    expect(addTask(2)).not.toHaveAttribute("aria-disabled");
  });

  it("UT-ADGATE-905 no stale state: gate editor, cancel, then a task editor shows only the task's data", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(1));
    expect(await screen.findByText("Edit Approvers")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Project Status" })).toHaveValue("Cluster 1 to Cluster 2");
    expect(within(screen.getByLabelText("Selected Portfolio Manager")).getByText(person(1).name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Wait until the gate editor is fully gone before opening the next one.
    await waitFor(() => {
      expect(screen.queryByText("Edit Approvers")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset Gate" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Selected Portfolio Manager")).not.toBeInTheDocument();
    });

    fireEvent.click(taskEdit());
    expect(await screen.findByText("Edit Approvers")).toBeInTheDocument();
    /*
     * `hidden: true`: in jsdom, Fluent's modalizer from the drawer that just closed can leave the
     * NEW drawer's portal marked aria-hidden for a while, which hides it from default role
     * queries depending on timing. Same role + name assertions, independent of that state.
     */
    const all = { hidden: true } as const;
    const local = await screen.findByRole("radio", { name: "Local Approval", ...all });
    expect(local).toBeChecked();
    expect(screen.queryByRole("button", { name: "Reset Gate", ...all })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Portfolio Manager", ...all })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Selected Approvers")).getByText(person(8).name)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Gate active", ...all })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Check List", ...all })).toBeDisabled();
    noWrites();
  });

  it("UT-ADGATE-906 the delete confirmation names the clicked row, and Delete issues one delete", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(taskDelete());
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete Check List Approval Item?")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Germany - Wind");
    expect(dialog).toHaveTextContent("Cluster 1 to Cluster 2");
    expect(dialog).toHaveTextContent("Check List Item: 'Grid connection request'");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
    expect(sentWrites()).toEqual([expect.objectContaining({ op: "delete", entitySet: TASK_APPROVALS, id: "60000000-0000-0000-0000-000000000001" })]);
  });

  it("UT-ADGATE-907 a failed toggle reverts the pill and shows an error", async () => {
    exec.mockRejectedValue(new PlanError(0, 1, "check-list approval activated", new DataError("update", "denied", 403)));
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    const pill = screen.getByRole("button", { name: /Task Grid connection request: Inactive/ });
    fireEvent.click(pill);
    await waitFor(() => expect(sentWrites()).toEqual([
      expect.objectContaining({ op: "update", entitySet: TASK_APPROVALS, id: "60000000-0000-0000-0000-000000000001", data: { vsb_gateisactive: true } }),
    ]));
    expect(await screen.findByText(/do not have permission to change the status/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Task Grid connection request: Inactive/ })).toBeEnabled());
  });

  it("UT-ADGATE-908 the Draft gate and placeholder pills are locked", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    expect(screen.getByRole("button", { name: /Gate Draft to Cluster 1: Active \(cannot be changed here\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Gate Cluster 2 to Cluster 3: Inactive \(cannot be changed here\)/ })).toBeDisabled();
  });

  it("UT-ADGATE-909 a failed save keeps the panel open with the input and a readable error", async () => {
    exec.mockRejectedValue(new PlanError(0, 1, "gate approval updated", new DataError("update gate approval template", "Server busy", 500)));
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(0));
    await screen.findByText("Edit Approvers");
    fireEvent.click(screen.getByRole("radio", { name: "Local Approval" }));
    // Local requires Approvers — Save disabled until satisfied, so go back to a valid mode.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Only Notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Not saved")).toBeInTheDocument();
    // Shared wording: lead + hint; the raw server text ("Server busy") is traced, not shown.
    expect(screen.getByText(`Could not save the approvals. ${ERROR_HINT.server}`)).toBeInTheDocument();
    expect(screen.queryByText(/Server busy/)).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Selected Notifications")).getByText(person(7).name)).toBeInTheDocument();
    expect(screen.getByText("Edit Approvers")).toBeInTheDocument();
    expect(exec).toHaveBeenCalledTimes(1);
    expect(sentWrites()[0]).toMatchObject({ op: "update", entitySet: GATE_TEMPLATES, id: "40000000-0000-0000-0000-000000000002" });
    expect(sentWrites()[0]!.data).toMatchObject({ vsb_gateactive: true, vsb_approvalmodecode: 952850002 });
  });

  it("UT-ADGATE-910 Reset Gate asks for confirmation first, then issues one reset", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(1));
    fireEvent.click(await screen.findByRole("button", { name: "Reset Gate" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove all cluster gate participants");
    expect(exec).not.toHaveBeenCalled();
    // `findByRole`, not `getByRole`: under load tabster marks the alert dialog `aria-hidden` for a moment while it takes over from the open panel.
    fireEvent.click(await within(dialog).findByRole("button", { name: "Reset Gate" }));
    await waitFor(() => expect(sentWrites()).toEqual([
      expect.objectContaining({ op: "update", entitySet: GATE_TEMPLATES, id: "40000000-0000-0000-0000-000000000001", data: expect.objectContaining({ vsb_gateactive: false }) }),
    ]));
  });

  it("UT-ADGATE-911 a missing checklist table shows a warning, not a crash; gates still render", async () => {
    repo.loadDataset.mockResolvedValue(fixtureDataset({
      checklists: [], approvals: [],
      checklistError: "The table 'Check List Default Approvals' (vsb_checklistdefaultapprovalses) could not be read.",
    }));
    renderScreen();
    expect(await screen.findByText("Check list task approvals are unavailable")).toBeInTheDocument();
    expect(gateRow(1)).toBeInTheDocument();
    // Disabled-focusable (aria-disabled) with the reason as a tooltip.
    expect(addTask(1)).toHaveAttribute("aria-disabled", "true");
  });

  /* ─────────────────────────────────────────── shared components binding ── */

  it("UT-ADGATE-912 a disabled Add Task is keyboard-reachable, explains why in a tooltip (no native title) and does nothing", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    const add = addTask(3);
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).not.toBeDisabled(); // focusable: no native `disabled`
    expect(add).not.toHaveAttribute("title");
    add.focus();
    expect(add).toHaveFocus();
    await waitFor(() => expect(describedText(add)).toBe("Every check list task of this gate already has an approval."));
    fireEvent.click(add);
    expect(screen.queryByText("Add Approvers")).not.toBeInTheDocument();
    noWrites();
  });

  it("UT-ADGATE-913 without check list tasks the Add Task reason says they are unavailable", async () => {
    repo.loadDataset.mockResolvedValue(fixtureDataset({ checklists: [], approvals: [], checklistError: "Unreadable." }));
    renderScreen();
    await screen.findByText("Check list task approvals are unavailable");
    const add = addTask(1);
    add.focus();
    await waitFor(() => expect(describedText(add)).toBe("Check list tasks are not available."));
  });

  it("UT-ADGATE-914 the delete overlay shows the multi-line canvas text with its line break", async () => {
    let finish: () => void = () => {};
    exec.mockReturnValue(new Promise((resolve) => { finish = () => resolve({ done: 1, createdIds: [] }); }));
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(taskDelete());
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const label = await screen.findByText(/being deleted, please wait/);
    expect(label.textContent).toBe(
      "Approval item for Project Gates | Germany | Wind\nCheck List: 'Grid connection request' being deleted, please wait...",
    );
    expect(label).toHaveStyle({ whiteSpace: "pre-line" });
    finish();
    await waitFor(() => expect(screen.queryByText(/being deleted, please wait/)).not.toBeInTheDocument());
  });

  /* ─────────────────────────────────────────── keyboard access and edge cases ── */

  it("UT-ADGATE-915 Esc in the people search closes the suggestions, not the drawer; ArrowDown + Enter adds", async () => {
    const anna = { entraId: "30000000-0000-0000-0000-0000000000aa", name: "Anna Müller", mail: "anna@vsb.energy" };
    repo.searchPeople.mockResolvedValue([anna]);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    await user.click(gateEdit(0));
    await screen.findByText("Edit Approvers");
    const all = { hidden: true } as const;
    const input = await screen.findByRole("combobox", { name: "Notifications", ...all });
    await user.click(input);
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Suggested Notifications", ...all });
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    // The (inline) listbox stays mounted while the input has focus, but it is collapsed.
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByText("Edit Approvers")).toBeInTheDocument();
    expect(input).toHaveFocus();
    // Keyboard only: reopen with typing, ArrowDown, Enter.
    await user.keyboard("ü");
    await screen.findByRole("listbox", { name: "Suggested Notifications", ...all });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await within(screen.getByLabelText("Selected Notifications")).findByText("Anna Müller")).toBeInTheDocument();
    noWrites();
  });

  it("UT-ADGATE-916 inactive and 'To Delete' tasks are neither nested rows nor Add Task options", async () => {
    const hiddenApprovals = HIDDEN_CHECKLISTS.map((c, i) => ({ ...FIXTURE_APPROVALS[0]!, id: `6000000${i}-0000-0000-0000-000000000009`, checklistId: c.id }));
    repo.loadDataset.mockResolvedValue(fixtureDataset({
      checklists: [...FIXTURE_CHECKLISTS, ...HIDDEN_CHECKLISTS, { ...HIDDEN_CHECKLISTS[0]!, id: "50000000-0000-0000-0000-000000000006", name: "Inactive free task" }],
      approvals: [...FIXTURE_APPROVALS, ...hiddenApprovals],
    }));
    renderScreen();
    await screen.findByText("Grid connection request");
    expect(screen.queryByText("Inactive task")).not.toBeInTheDocument();
    expect(screen.queryByText("Soft-deleted task")).not.toBeInTheDocument();
    fireEvent.click(addTask(1));
    await screen.findByText("Add Approvers");
    const all = { hidden: true } as const;
    fireEvent.click(screen.getByRole("combobox", { name: "Check List", ...all }));
    const options = await screen.findAllByRole("option", all);
    expect(options.map((o) => o.textContent)).toEqual(["Land lease signed"]);
  });

  it("UT-ADGATE-917 under a gate whose next state is terminal, task approvals can still be saved; the gate cannot", async () => {
    repo.listProjectStates.mockResolvedValue(
      FIXTURE_STATES.map((s) => (s.order === 2 ? { ...s, name: "Abandoned", visibleOnChecklist: false } : s)),
    );
    renderScreen();
    await screen.findByText("Grid connection request");
    fireEvent.click(taskEdit());
    await screen.findByText("Edit Approvers");
    const all = { hidden: true } as const;
    expect(screen.getByRole("textbox", { name: "Project Status", ...all })).toHaveValue("Cluster 1 to Cluster 2");
    expect(screen.queryByText(GATE_BLANK_MESSAGE)).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save", ...all });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
    expect(sentWrites()[0]).toMatchObject({ op: "update", entitySet: TASK_APPROVALS });
    await waitFor(() => expect(screen.queryByText("Edit Approvers")).not.toBeInTheDocument());

    fireEvent.click(gateEdit(1));
    await screen.findByText("Edit Approvers");
    expect(await screen.findByText(GATE_BLANK_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save", ...all })).toBeDisabled();
  });

  it("UT-ADGATE-918 collapse is per country × technology and survives a refetch", async () => {
    renderScreen();
    await screen.findByText("Grid connection request");
    expect(gateCollapse(1)).toHaveAttribute("aria-label", "-");
    fireEvent.click(gateCollapse(1));
    expect(screen.queryByText("Grid connection request")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand France technologies" }));
    fireEvent.click(screen.getByRole("button", { name: "France PV" }));
    expect(await screen.findByText("Project Gates | France | PV")).toBeInTheDocument();
    expect(await screen.findByText("Grid connection request")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Germany Wind" }));
    expect(await screen.findByText("Project Gates | Germany | Wind")).toBeInTheDocument();
    await waitFor(() => expect(gateCollapse(1)).toHaveAttribute("aria-label", "+"));
    expect(screen.queryByText("Grid connection request")).not.toBeInTheDocument();

    // A refetch (here: after a task toggle elsewhere would invalidate) keeps the collapsed gate.
    const calls = repo.loadDataset.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Gate Cluster 1 to Cluster 2: Active\. Click/ }));
    await waitFor(() => expect(repo.loadDataset.mock.calls.length).toBeGreaterThan(calls));
    expect(gateCollapse(1)).toHaveAttribute("aria-label", "+");
  });

  it("UT-ADGATE-919 a successful gate create is one POST, closes the panel and confirms", async () => {
    exec.mockResolvedValue({ done: 1, createdIds: ["40000000-0000-0000-0000-000000000099"] });
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(2));
    await screen.findByText("Add Approvers");
    // Satisfy "Notifications required" with the picker.
    repo.searchPeople.mockResolvedValue([person(5)]);
    const user = userEvent.setup();
    const all = { hidden: true } as const;
    await user.click(screen.getByRole("combobox", { name: "Notifications", ...all }));
    await user.keyboard("pe");
    await screen.findByRole("listbox", { name: "Suggested Notifications", ...all });
    await user.keyboard("{ArrowDown}{Enter}");
    const save = screen.getByRole("button", { name: "Save", ...all });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
    expect(sentWrites()[0]).toMatchObject({ op: "create", entitySet: GATE_TEMPLATES });
    expect(sentWrites()[0]!.id).toBeUndefined();
    expect(sentWrites()[0]!.data).toMatchObject({
      vsb_name: "Cluster 2 to Cluster 3", statecode: 0,
      vsb_defaultnotifications: JSON.stringify([{ PersonaKey: person(5).entraId, PersonaName: person(5).name, PersonaRole: person(5).mail }]),
    });
    await waitFor(() => expect(screen.queryByText("Add Approvers")).not.toBeInTheDocument());
    expect(await screen.findByText("Approvals for 'Cluster 2 to Cluster 3' were saved.")).toBeInTheDocument();
  });

  it("UT-ADGATE-920 the mode switch shows / hides the people fields", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(0));
    await screen.findByText("Edit Approvers");
    const all = { hidden: true } as const;
    const searchBox = (label: string) => screen.queryByRole("combobox", { name: label, ...all });
    expect(searchBox("Portfolio Manager")).not.toBeInTheDocument();
    expect(searchBox("Approvers")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Formal Approval", ...all }));
    expect(searchBox("Portfolio Manager")).toBeInTheDocument();
    expect(searchBox("Contributors")).toBeInTheDocument();
    expect(searchBox("Approvers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Local Approval", ...all }));
    expect(searchBox("Portfolio Manager")).not.toBeInTheDocument();
    expect(searchBox("Contributors")).not.toBeInTheDocument();
    expect(searchBox("Approvers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save", ...all })).toBeDisabled(); // approvers required
    noWrites();
  });

  it("UT-ADGATE-921 Cancel after an edit asks 'Discard changes?'; Discard closes without writing", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(0));
    await screen.findByText("Edit Approvers");
    const all = { hidden: true } as const;
    fireEvent.click(screen.getByRole("radio", { name: "Formal Approval", ...all }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel", ...all }));
    const dialog = await screen.findByRole("alertdialog", all);
    expect(dialog).toHaveTextContent("Discard changes?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard", ...all }));
    await waitFor(() => expect(screen.queryByText("Edit Approvers")).not.toBeInTheDocument());
    noWrites();
  });

  it("UT-ADGATE-922 a 403 on save shows the permission text in the panel", async () => {
    exec.mockRejectedValue(new PlanError(0, 1, "gate approval updated", new DataError("update gate approval template", "denied", 403)));
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(0));
    await screen.findByText("Edit Approvers");
    fireEvent.click(screen.getByRole("button", { name: "Save", hidden: true }));
    expect(await screen.findByText(/do not have permission to save the approvals/)).toBeInTheDocument();
    expect(screen.getByText("Edit Approvers")).toBeInTheDocument();
  });

  /* ─────────────────────────────────────────────────────── canvas parity ── */

  it("UT-ADGATE-923 ';' task notifications, '[]' pill clickable, last visible gate saves vsb_name ' '", async () => {
    const asJson = (ns: number[]) =>
      JSON.stringify(ns.map((n) => ({ PersonaKey: person(n).entraId, PersonaName: person(n).name, PersonaRole: person(n).mail })));
    // Visible states 0..5 only: Cluster 5 is the highest visible state (PGAS:2705-2717).
    repo.listProjectStates.mockResolvedValue(FIXTURE_STATES.map((s) => (s.order === 6 ? { ...s, visibleOnChecklist: false } : s)));
    const gate5 = {
      ...FIXTURE_TEMPLATES[1]!, id: "40000000-0000-0000-0000-000000000005", name: " ", stateId: FIXTURE_STATES[5]!.id,
      gateActive: false, contributors: "[]", notifications: asJson([7]),
    };
    // A legacy "[]" with no other participant — the canvas IsBlank test keeps the pill editable.
    const legacy = { ...gate5, id: "40000000-0000-0000-0000-000000000004", stateId: FIXTURE_STATES[4]!.id, notifications: null };
    repo.loadDataset.mockResolvedValue(fixtureDataset({
      templates: [...FIXTURE_TEMPLATES, gate5, legacy],
      approvals: [{ ...FIXTURE_APPROVALS[0]!, notifications: asJson([9, 10]) }],
    }));
    renderScreen();
    await screen.findByText("Grid connection request");

    // "(mail);" after every listed notification but the last (PGAS:1398-1402).
    const taskRow = screen.getByTestId(`cnt_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item-${TASK_ID}`);
    expect(within(taskRow).getByText(`(${person(9).mail});`)).toBeInTheDocument();
    expect(within(taskRow).getByText(`(${person(10).mail})`)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Gate Cluster 4 to Cluster 5: Inactive\. Click/ })).toBeEnabled();

    // The last visible gate: no label, no blank-gate message, Save enabled, vsb_name " ".
    fireEvent.click(gateEdit(5));
    await screen.findByText("Edit Approvers");
    const all = { hidden: true } as const;
    expect(screen.getByRole("textbox", { name: "Project Status", ...all })).toHaveValue("");
    expect(screen.queryByText(GATE_BLANK_MESSAGE)).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save", ...all });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
    expect(sentWrites()[0]).toMatchObject({ op: "update", entitySet: GATE_TEMPLATES, id: gate5.id });
    expect(sentWrites()[0]!.data).toMatchObject({ vsb_name: " " });
  });

  it("UT-ADGATE-924 the Portfolio Manager picker shows the canvas hint 'Select Portfolio Manager' (PGAS:3085)", async () => {
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(0));
    await screen.findByText("Edit Approvers");
    const all = { hidden: true } as const;
    fireEvent.click(screen.getByRole("radio", { name: "Formal Approval", ...all }));
    expect(screen.getByRole("combobox", { name: "Portfolio Manager", ...all })).toHaveAttribute("placeholder", "Select Portfolio Manager");
    noWrites();
  });

  it("UT-ADGATE-925 a failed load shows an error state with a retry", async () => {
    repo.loadDataset.mockRejectedValue(new DataError("list gate approval templates", "offline", 503));
    renderScreen();
    expect(await screen.findByText("Gate approvals could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("UT-ADGATE-926 a failed REFETCH over cached data still shows the error state", async () => {
    renderScreen();
    await screen.findByText("Grid connection request");
    repo.loadDataset.mockRejectedValue(new DataError("list gate approval templates", "offline", 503));
    // A successful toggle invalidates the dataset; that refetch fails while the old data is cached.
    fireEvent.click(screen.getByRole("button", { name: /Gate Cluster 1 to Cluster 2: Active\. Click/ }));
    expect(await screen.findByText("Gate approvals could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Grid connection request")).not.toBeInTheDocument();
  });

  it("UT-ADGATE-927 the Gate field is the shared ReadOnlyField (disabled, error wired) and task-row icons use RowActions gap 4", async () => {
    repo.listProjectStates.mockResolvedValue(
      FIXTURE_STATES.map((s) => (s.order === 2 ? { ...s, name: "Abandoned", visibleOnChecklist: false } : s)),
    );
    const reference = render(
      <FluentProvider theme={vsbTheme}>
        <RowActions tooltip="always" tone="brand" gap={4} actions={[{ key: "edit", icon: <EditRegular />, label: "ref", testId: "ref", onClick: () => {} }]} />
      </FluentProvider>,
    );
    const gap4Class = screen.getByTestId("ref").parentElement!.className;
    reference.unmount();

    renderScreen();
    await screen.findByText("Grid connection request");
    const taskEditButton = taskEdit();
    expect(taskEditButton.parentElement!.className).toBe(gap4Class);

    fireEvent.click(gateEdit(1));
    await screen.findByText("Edit Approvers");
    const gate = screen.getByRole("textbox", { name: "Project Status", hidden: true });
    expect(gate).toBeDisabled();
    expect(gate).toHaveAttribute("readonly");
    expect(gate).toHaveAttribute("aria-invalid", "true");
    expect(describedText(gate)).toContain(GATE_BLANK_MESSAGE);
  });
});

/**
 * Rail-height parity. jsdom has no layout,
 * so the applied RULES are asserted, not pixel heights.
 */
describe("ProjectGatesSettingsScreen — picker/rail height parity", () => {
  it("UT-ADGATE-928 stretches the picker's row and keeps the scroller on the content section", async () => {
    renderScreen();
    const picker = await screen.findByRole("navigation", { name: "Country and technology" });
    expect(appliedRules(picker.parentElement!)["align-items"]).toBe("stretch");
    // Avoid nested scroll regions: the content section scrolls.
    expect(appliedRules(screen.getByRole("region", { name: "Project gate approvals" }))["overflow-y"]).toBe("auto");
    const column = appliedRules(picker);
    expect(column["align-self"]).toBe("stretch");
    expect(column["overflow-y"]).not.toBe("auto");
  });
});

/**
 * Admin access (`useAdminAccess`): an administrator edits normally (every test above); a user
 * without it can read the screen and the editor, but every control that writes is disabled.
 */
describe("ProjectGatesSettingsScreen — admin access", { timeout: TEST_TIMEOUT }, () => {
  const all = { hidden: true } as const;

  it("UT-ADGATE-929 an administrator has every write control enabled", async () => {
    renderScreen();
    await screen.findByText("Grid connection request");
    expect(addTask(1)).toBeEnabled();
    expect(taskDelete()).toBeEnabled();
    expect(screen.getByRole("button", { name: /Gate Cluster 1 to Cluster 2: Active\. Click/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Task Grid connection request: Inactive\. Click/ })).toBeEnabled();
    fireEvent.click(gateEdit(1));
    await screen.findByText("Edit Approvers");
    expect(screen.getByRole("button", { name: "Reset Gate", ...all })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Local Approval", ...all })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Gate active", ...all })).toBeEnabled();
  });

  it("UT-ADGATE-930 without admin access the grid is read-only: pills, Add Task and Delete are disabled", async () => {
    access.admin = false;
    renderScreen();
    await screen.findByText("Grid connection request");
    expect(addTask(1)).toHaveAttribute("aria-disabled", "true");
    expect(addTask(2)).toHaveAttribute("aria-disabled", "true");
    expect(taskDelete()).toBeDisabled();
    expect(screen.getByRole("button", { name: /Gate Cluster 1 to Cluster 2: Active \(cannot be changed here\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Task Grid connection request: Inactive \(cannot be changed here\)/ })).toBeDisabled();
    // Reading stays possible: the Edit buttons still open the panel.
    expect(gateEdit(1)).toBeEnabled();
    expect(taskEdit()).toBeEnabled();
    fireEvent.click(addTask(1));
    fireEvent.click(screen.getByRole("button", { name: /Task Grid connection request: Inactive/ }));
    expect(screen.queryByText("Add Approvers")).not.toBeInTheDocument();
    noWrites();
  });

  it("UT-ADGATE-931 the Add Task reason for a user without admin access is the permission text", async () => {
    access.admin = false;
    renderScreen();
    await screen.findByText("Grid connection request");
    const add = addTask(1);
    add.focus();
    await waitFor(() => expect(describedText(add)).toBe("You do not have permission to change the default approvals."));
  });

  it("UT-ADGATE-932 without admin access the gate editor opens read-only: Save, Reset Gate and every field are disabled", async () => {
    access.admin = false;
    renderScreen();
    await screen.findByText("Draft to Cluster 1");
    fireEvent.click(gateEdit(1));
    expect(await screen.findByText("Edit Approvers")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Selected Portfolio Manager")).getByText(person(1).name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save", ...all })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Gate", ...all })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Formal Approval", ...all })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Gate active", ...all })).toBeDisabled();
    for (const label of ["Contributors", "Approvers", "Notifications"]) {
      expect(screen.getByRole("combobox", { name: label, ...all })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: "Cancel", ...all }));
    await waitFor(() => expect(screen.queryByText("Edit Approvers")).not.toBeInTheDocument());
    noWrites();
  });

  it("UT-ADGATE-933 without admin access the task editor opens read-only: the Check List and Save are disabled", async () => {
    access.admin = false;
    renderScreen();
    await screen.findByText("Grid connection request");
    fireEvent.click(taskEdit());
    expect(await screen.findByText("Edit Approvers")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Check List", ...all })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Local Approval", ...all })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save", ...all })).toBeDisabled();
    noWrites();
  });
});
