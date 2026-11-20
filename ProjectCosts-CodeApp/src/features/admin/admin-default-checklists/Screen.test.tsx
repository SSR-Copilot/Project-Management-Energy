// @vitest-environment jsdom
/**
 * Render tests for Check List Settings, with the data module's I/O functions mocked (the
 * pure payload/rule code stays real). Covers the behaviour that only shows up in a rendered
 * screen; the rules themselves are in `rules.test.ts`.
 *
 * Edit, the Completion Date toggle and activate/deactivate are `WritePlan`s now, so their mock
 * boundary is `executePlan` (through `runPlan`) rather than a data-module function: a test that
 * used to assert on `api.updateTask(...)` asserts on the plan's write, and a test that used to
 * reject from the data function rejects with a `PlanError` carrying the same cause. The exact
 * requests of each plan are in `writes.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Button, FluentProvider } from "@fluentui/react-components";
import {
  CheckmarkRegular, DeleteRegular, DismissRegular, DocumentCheckmarkRegular,
} from "@fluentui/react-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn().mockResolvedValue({ success: true, data: [] }),
    retrieveRecordAsync: vi.fn(), createRecordAsync: vi.fn(), updateRecordAsync: vi.fn(),
    deleteRecordAsync: vi.fn(), executeAsync: vi.fn(),
  }),
}));

/** The admin rule (`useAdminAccess`): true unless a test flips it to exercise the read-only screen. */
const access = vi.hoisted(() => ({ admin: true }));
vi.mock("@/app/useCurrentUser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/useCurrentUser")>()),
  useAdminAccess: () => access.admin,
}));

const api = vi.hoisted(() => ({
  loadTabs: vi.fn(),
  loadClusters: vi.fn(),
  loadTasks: vi.fn(),
  loadLockedTaskIds: vi.fn(),
  createTask: vi.fn(),
  softDeleteTask: vi.fn(),
  writeOrders: vi.fn(),
}));

vi.mock("@/data/adminDefaultChecklists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/adminDefaultChecklists")>()),
  ...api,
}));

/** Edit / toggle / status are WritePlans run by `executePlan` (through `runPlan`); `PlanError` and the rest stay real. */
const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

import {
  RenumberAfterDeleteError, TaskCreatedIdUnknownError, TaskStatusNotSetError,
} from "@/data/adminDefaultChecklists";
import { AppToaster, CommandBar, PanelButtons } from "@/components";
import { PlanError } from "@/data/executePlan";
import type { WritePlan } from "@/data/writePlan";
import { DataError, RecordGoneError } from "@/platform/errors";
import { vsbTheme } from "@/theme/fluent";
import { palette } from "@/theme/tokens";
import { FIXTURE_CLUSTERS, FIXTURE_LOCKED, FIXTURE_TABS, FIXTURE_TASKS } from "./fixtures";
import { qk } from "@/data/keys";
import { LOCK_LOADING_TOOLTIP, LOCK_TOOLTIP, LOCK_UNKNOWN_TOOLTIP, REORDER_STALE_MESSAGE } from "./rules";
import CheckListSettingsScreen from "./Screen";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const T1 = "dddddddd-0000-0000-0000-000000000001";
const T2 = "dddddddd-0000-0000-0000-000000000002";
const T3 = "dddddddd-0000-0000-0000-000000000003";

const DE_WIND = "aaaaaaaa-0000-0000-0000-000000000001";
const DE_PV = "aaaaaaaa-0000-0000-0000-000000000002";
const DRAFT = "cccccccc-0000-0000-0000-000000000000";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

let lastClient: QueryClient;

function renderScreen(path = "/admin/default-checklists") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  lastClient = client;
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/default-checklists" element={<><CheckListSettingsScreen /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
        {/* Outcomes are app toasts (useNotify); Providers mounts this in the app. */}
        <AppToaster />
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const user = () => userEvent.setup();

/** Every write of every plan the screen sent to `executePlan`, in order. */
const sentWrites = () => exec.mock.calls.flatMap((c) => (c[0] as WritePlan).writes);
const TASKS_SET = "vsb_projectdefaultchecklistses";
/** What `executePlan` answers for a one-write plan. */
const PLAN_OK = { done: 1, createdIds: [] as string[] };

/**
 * Drawer / dialog content is queried with `hidden: true`. Fluent's tabster modalizer state is
 * global to the jsdom `document`, which every test in this file shares, and after an earlier
 * test it leaves a later surface marked `aria-hidden` (a test-harness artifact: the running app
 * has one provider). The surfaces are still asserted present and their controls clicked.
 */
const PORTAL = { hidden: true } as const;

async function expandDraft(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole("button", { name: "Draft to Cluster 1" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  access.admin = true;
  api.loadTabs.mockResolvedValue(FIXTURE_TABS);
  api.loadClusters.mockResolvedValue(FIXTURE_CLUSTERS);
  api.loadTasks.mockImplementation(async (tabId: string) => FIXTURE_TASKS.filter((t) => t.tabId === tabId));
  api.loadLockedTaskIds.mockResolvedValue(FIXTURE_LOCKED);
  api.createTask.mockResolvedValue("new-id");
  exec.mockResolvedValue(PLAN_OK);
  api.softDeleteTask.mockResolvedValue(undefined);
  api.writeOrders.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("CheckListSettingsScreen", () => {
  it("UT-ADCHK-901 tabs A → Z by name, not by Order (D154, the live canvas); left-most selected by default", async () => {
    renderScreen();
    const tabs = await screen.findAllByRole("tab");
    // Orders are FR Wind 1, DE Wind 2, DK PV 3; the strip still reads DE Wind, DK PV, FR Wind.
    expect(tabs.map((t) => t.getAttribute("value"))).toEqual([DE_WIND, DE_PV, "aaaaaaaa-0000-0000-0000-000000000010"]);
    expect(tabs[1]).toHaveAccessibleName("DK PV");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(api.loadTasks).toHaveBeenCalledWith(DE_WIND));
  });

  it("UT-ADCHK-902 no tabs → empty state and no task or lock query", async () => {
    api.loadTabs.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText("No checklist country/technology combinations are configured")).toBeInTheDocument();
    expect(api.loadTasks).not.toHaveBeenCalled();
    expect(api.loadLockedTaskIds).not.toHaveBeenCalled();
  });

  it("UT-ADCHK-903 shows a clear error (not a crash) when a table is unavailable", async () => {
    api.loadTabs.mockRejectedValue(new DataError("Load checklist country/technology tabs", "Data source not registered"));
    renderScreen();
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("UT-ADCHK-904 clusters start collapsed with mapped captions; expanding shows the cluster's tasks in Order", async () => {
    const u = user();
    renderScreen();
    expect(await screen.findByRole("button", { name: "Criteria After Cluster 6 Entry" })).toBeInTheDocument();
    expect(screen.queryByText("Site identified")).not.toBeInTheDocument();
    await expandDraft(u);
    const rows = await screen.findAllByTestId(/^con_Details_TasksInClusterDefaultChecklist_AdminScreen-/);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]?.textContent)).toEqual([
      "Site identified", "Land lease secured", "Grid request filed",
    ]);
    // Gate Relevance reads Yes/No; long holding text is cut.
    expect(within(rows[1] as HTMLElement).getAllByRole("cell")[2]).toHaveTextContent("Yes");
    expect(within(rows[1] as HTMLElement).getAllByRole("cell")[1]?.textContent).toMatch(/ \.\.\.$/);
  });

  it("UT-ADCHK-905 switching tab updates the URL and shows only that tab's tasks", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    expect(await screen.findByText("Site identified")).toBeInTheDocument();
    await u.click(screen.getByRole("tab", { name: "DK PV" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`?tab=${DE_PV}`));
    await waitFor(() => expect(api.loadTasks).toHaveBeenCalledWith(DE_PV));
    await waitFor(() => expect(screen.queryByText("Site identified")).not.toBeInTheDocument());
  });

  it("UT-ADCHK-906 ?tab= opens that tab", async () => {
    renderScreen(`/admin/default-checklists?tab=${DE_PV}`);
    await waitFor(() => expect(screen.getByRole("tab", { name: "DK PV" })).toHaveAttribute("aria-selected", "true"));
  });

  it("UT-ADCHK-907 a locked row has its four actions disabled with the Project Gate tooltip", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId("con_Details_TasksInClusterDefaultChecklist_AdminScreen-dddddddd-0000-0000-0000-000000000002");
    await waitFor(() => expect(within(row).getByRole("button", { name: "Edit" })).toHaveAttribute("aria-disabled", "true"));
    for (const name of ["Delete", "No", "Active"]) {
      expect(within(row).getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    }
    await u.hover(within(row).getByRole("button", { name: "Edit" }));
    expect((await screen.findAllByText(LOCK_TOOLTIP)).length).toBeGreaterThan(0);
    const free = screen.getByTestId("con_Details_TasksInClusterDefaultChecklist_AdminScreen-dddddddd-0000-0000-0000-000000000001");
    expect(within(free).getByRole("button", { name: "Edit" })).not.toBeDisabled();
    expect(within(free).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("UT-ADCHK-908 Add Task validates the name, and a failed save keeps the panel open with the input and the error", async () => {
    const u = user();
    api.createTask.mockRejectedValue(new DataError("Create checklist item", "Server said no"));
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    expect(await screen.findByText("Add Task", { selector: "h2" })).toBeInTheDocument();
    const save = await screen.findByRole("button", { name: "Save", ...PORTAL });
    expect(save).toBeDisabled();

    const description = await screen.findByRole("textbox", { name: "Description", ...PORTAL });
    await u.type(description, "   ");
    await u.tab();
    expect(await screen.findByText("Value cannot be blank.")).toBeInTheDocument();
    expect(save).toBeDisabled();

    await u.clear(description);
    await u.type(description, " New task ");
    expect(save).not.toBeDisabled();
    await u.click(save);

    expect(await screen.findByText(/Checklist item could not be saved\..*Server said no/)).toBeInTheDocument();
    expect(screen.getByText("Add Task", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Description", ...PORTAL })).toHaveValue(" New task ");
    // Created in the selected tab and the clicked cluster, after the highest visible Order.
    expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({
      clusterId: DRAFT, order: 4,
      tab: expect.objectContaining({ id: DE_WIND }),
      form: expect.objectContaining({ name: " New task ", isActive: false }),
    }));
  });

  it("UT-ADCHK-909 a successful save closes the panel and shows a success message", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    await u.type(await screen.findByRole("textbox", { name: "Description", ...PORTAL }), "Fresh");
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    expect(await screen.findByText("Checklist item was successfully saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Add Task", { selector: "h2" })).not.toBeInTheDocument());
  });

  it("UT-ADCHK-910 a 403 shows the permission message", async () => {
    const u = user();
    exec.mockRejectedValue(new PlanError(0, 1, "completion date changed", new DataError("Update checklist item", "denied", 403)));
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId("con_Details_TasksInClusterDefaultChecklist_AdminScreen-dddddddd-0000-0000-0000-000000000001");
    await waitFor(() => expect(within(row).getByRole("button", { name: "No" })).not.toBeDisabled());
    await u.click(within(row).getByRole("button", { name: "No" }));
    expect(await screen.findByText(/You do not have permission to change checklist items/)).toBeInTheDocument();
    // The clicked row's Completion Date is null, so the plan flips it to true.
    expect(sentWrites()).toEqual([expect.objectContaining({
      op: "update", guarded: true, entitySet: TASKS_SET, id: T1, data: { vsb_iscompletiondate: true },
    })]);
  });

  it("UT-ADCHK-911 the status dialog uses the row's name; confirming deactivates", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId("con_Details_TasksInClusterDefaultChecklist_AdminScreen-dddddddd-0000-0000-0000-000000000001");
    await waitFor(() => expect(within(row).getByRole("button", { name: "Active" })).not.toBeDisabled());
    await u.click(within(row).getByRole("button", { name: "Active" }));
    expect(await screen.findByText('Are you sure that you want to change status of task "Site identified"?')).toBeInTheDocument();
    await u.click(await screen.findByRole("button", { name: "Deactivate", ...PORTAL }));
    await waitFor(() => expect(sentWrites()).toEqual([expect.objectContaining({
      op: "update", guarded: true, entitySet: TASKS_SET, id: "dddddddd-0000-0000-0000-000000000001",
      data: { statecode: 1, statuscode: 2 },
    })]));
  });

  it("UT-ADCHK-912 delete asks with the canvas text and renumbers the later rows", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId("con_Details_TasksInClusterDefaultChecklist_AdminScreen-dddddddd-0000-0000-0000-000000000001");
    await waitFor(() => expect(within(row).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await u.click(within(row).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText('Are you sure that you want to permanently delete task "Site identified"?')).toBeInTheDocument();
    await u.click(within(await screen.findByRole("alertdialog", PORTAL)).getByRole("button", { name: "Delete", ...PORTAL }));
    await waitFor(() => expect(api.softDeleteTask).toHaveBeenCalledWith(
      "dddddddd-0000-0000-0000-000000000001",
      [{ id: "dddddddd-0000-0000-0000-000000000002", order: 1 }, { id: "dddddddd-0000-0000-0000-000000000003", order: 2 }],
    ));
  });

  it("UT-ADCHK-913 reorder with Move up; Save is disabled until the order changes and writes 1-based Orders", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement);
    expect(await screen.findByText("Reoder checklist", { selector: "h2" })).toBeInTheDocument();
    const save = await screen.findByRole("button", { name: "Save", ...PORTAL });
    expect(save).toBeDisabled();
    const last = screen.getByTestId("reorder-item-dddddddd-0000-0000-0000-000000000003");
    await u.click(within(last).getByRole("button", { name: "Move up", ...PORTAL }));
    await u.click(within(screen.getByTestId("reorder-item-dddddddd-0000-0000-0000-000000000003")).getByRole("button", { name: "Move up", ...PORTAL }));
    expect(save).not.toBeDisabled();
    await u.click(save);
    await waitFor(() => expect(api.writeOrders).toHaveBeenCalledWith([
      { id: "dddddddd-0000-0000-0000-000000000003", order: 1 },
      { id: "dddddddd-0000-0000-0000-000000000001", order: 2 },
      { id: "dddddddd-0000-0000-0000-000000000002", order: 3 },
    ]));
    expect(await screen.findByText("New order was successfully saved.")).toBeInTheDocument();
  });

  it("UT-ADCHK-941 reorder by drag-and-drop, as the canvas PowerDragDrop list; Save writes 1-based Orders", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement);
    // `TextCanvas1.Text` (L1542), verbatim.
    expect(await screen.findByText("To reorder drag and drop listed items")).toBeInTheDocument();
    const item = (id: string) => screen.getByTestId(`reorder-item-${id}`);
    for (const id of [T1, T2, T3]) expect(item(id)).toHaveAttribute("draggable", "true");
    // The list carries the canvas control name; rows show the name only, no "1." position (the PowerDragDrop template).
    expect(screen.getByTestId("pcf_ReorderTaskList_AdminScreen").tagName).toBe("OL");
    expect(within(item(T1)).queryByText("1.")).not.toBeInTheDocument();

    // Drag "Site identified" (Order 1) down past the other two.
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(item(T1), { dataTransfer });
    fireEvent.dragOver(item(T2), { dataTransfer });
    fireEvent.dragOver(item(T3), { dataTransfer });
    fireEvent.drop(item(T3), { dataTransfer });
    expect(screen.getAllByTestId(/^reorder-item-/).map((el) => el.getAttribute("data-testid"))).toEqual([
      `reorder-item-${T2}`, `reorder-item-${T3}`, `reorder-item-${T1}`,
    ]);

    const save = screen.getByRole("button", { name: "Save", ...PORTAL });
    expect(save).not.toBeDisabled();
    await u.click(save);
    await waitFor(() => expect(api.writeOrders).toHaveBeenCalledWith([
      { id: T2, order: 1 }, { id: T3, order: 2 }, { id: T1, order: 3 },
    ]));
  });
});

describe("CheckListSettingsScreen — gap closure", () => {
  it("UT-ADCHK-914 while locks load, rows are disabled with a 'checking' tooltip, not the Project Gate text", async () => {
    const u = user();
    const locks = deferred<Set<string>>();
    api.loadLockedTaskIds.mockReturnValue(locks.promise);
    renderScreen();
    await expandDraft(u);
    const free = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    expect(screen.getByText("Checking which items are in use by a Project Gate…")).toBeInTheDocument();
    for (const name of ["Edit", "Delete", "No", "Active"]) {
      expect(within(free).getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    }
    await u.hover(within(free).getByRole("button", { name: "Edit" }));
    expect((await screen.findAllByText(LOCK_LOADING_TOOLTIP)).length).toBeGreaterThan(0);
    expect(screen.queryByText(LOCK_TOOLTIP)).not.toBeInTheDocument();
    await u.unhover(within(free).getByRole("button", { name: "Edit" }));

    locks.resolve(FIXTURE_LOCKED);
    await waitFor(() => expect(within(free).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true"));
    expect(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T2}`)).getByRole("button", { name: "Edit" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Checking which items are in use by a Project Gate…")).not.toBeInTheDocument();
  });

  it("UT-ADCHK-915 lock query error: every row fails closed with the 'could not be checked' tooltip and a Retry", async () => {
    const u = user();
    api.loadLockedTaskIds.mockRejectedValueOnce(new DataError("Load Project Gate checklist approvals", "boom"));
    renderScreen();
    await expandDraft(u);
    const retry = await screen.findByRole("button", { name: "Retry loading Project Gate usage" });
    for (const id of [T1, T2, T3]) {
      expect(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${id}`)).getByRole("button", { name: "Edit" })).toHaveAttribute("aria-disabled", "true");
    }
    await u.hover(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`)).getByRole("button", { name: "Edit" }));
    expect((await screen.findAllByText(LOCK_UNKNOWN_TOOLTIP)).length).toBeGreaterThan(0);
    await u.click(retry);
    await waitFor(() => expect(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`)).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true"));
  });

  it("UT-ADCHK-916 switching tab does not re-query the locks", async () => {
    const u = user();
    renderScreen();
    await waitFor(() => expect(api.loadLockedTaskIds).toHaveBeenCalledTimes(1));
    await u.click(await screen.findByRole("tab", { name: "DK PV" }));
    await waitFor(() => expect(api.loadTasks).toHaveBeenCalledWith(DE_PV));
    expect(api.loadLockedTaskIds).toHaveBeenCalledTimes(1);
  });

  it("UT-ADCHK-917 task query error: an error with Retry; Add Task and Reorder are disabled", async () => {
    const u = user();
    api.loadTasks.mockRejectedValue(new DataError("Load checklist tasks", "nope"));
    renderScreen();
    expect(await screen.findByText(/The checklist tasks could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry loading tasks" })).toBeInTheDocument();
    await expandDraft(u);
    expect(screen.getAllByRole("button", { name: "Add Task" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Reorder" })[0]).toBeDisabled();
  });

  it("UT-ADCHK-918 a create with no id closes the panel, warns, never retries as a create, and refetches", async () => {
    const u = user();
    api.createTask.mockRejectedValue(new TaskCreatedIdUnknownError());
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    const taskReads = api.loadTasks.mock.calls.length;
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    await u.type(await screen.findByRole("textbox", { name: "Description", ...PORTAL }), "Fresh");
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    expect(await screen.findByText(/created but could not be confirmed, so its status may not be set\. Check the list before adding it again, and set Active/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Add Task", { selector: "h2" })).not.toBeInTheDocument());
    expect(api.createTask).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.loadTasks.mock.calls.length).toBeGreaterThan(taskReads));
  });

  it("UT-ADCHK-919 created but status failed: the panel switches to Edit Task and the retry updates, not creates", async () => {
    const u = user();
    api.createTask.mockRejectedValue(new TaskStatusNotSetError("new-id", new Error("status denied")));
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    await u.type(await screen.findByRole("textbox", { name: "Description", ...PORTAL }), "Fresh");
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    expect(await screen.findByText("Edit Task", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText(/its status could not be set/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    // The retry is an EDIT plan on the created row, carrying the typed name. The DE Wind tab has
    // no owning business unit, so the payload built from THAT tab carries no BU bind.
    await waitFor(() => expect(sentWrites()).toEqual([expect.objectContaining({
      op: "update", guarded: true, entitySet: TASKS_SET, id: "new-id",
      data: expect.objectContaining({ vsb_name: "Fresh" }),
    })]));
    expect(sentWrites()[0]?.data).not.toHaveProperty("owningbusinessunit@odata.bind");
    expect(api.createTask).toHaveBeenCalledTimes(1);
  });

  it("UT-ADCHK-920 created but the status write is refused (403): the panel shows the permission text, not 'Save again'", async () => {
    const u = user();
    api.createTask.mockRejectedValue(
      new TaskStatusNotSetError("new-id", new DataError("Update checklist item", "denied", 403)),
    );
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    await u.type(await screen.findByRole("textbox", { name: "Description", ...PORTAL }), "Fresh");
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    expect(await screen.findByText("Edit Task", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText(/You do not have permission to change checklist items/)).toBeInTheDocument();
    expect(screen.queryByText(/Save again to retry/)).not.toBeInTheDocument();
  });

  it("UT-ADCHK-921 Cancel discards typed changes (after the 'Discard changes?' confirmation); reopening Edit shows the stored values", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true"));
    await u.click(within(row).getByRole("button", { name: "Edit" }));
    const box = await screen.findByRole("textbox", { name: "Description", ...PORTAL });
    expect(box).toHaveValue("Site identified");
    await u.type(box, " CHANGED");
    await u.click(screen.getByRole("button", { name: "Cancel", ...PORTAL }));
    // Unsaved input asks first; "Keep editing" keeps the panel and the typed text.
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Keep editing", ...PORTAL }));
    expect(screen.getByRole("textbox", { name: "Description", ...PORTAL })).toHaveValue("Site identified CHANGED");
    await u.click(screen.getByRole("button", { name: "Cancel", ...PORTAL }));
    await u.click(await screen.findByRole("button", { name: "Discard", ...PORTAL }));
    await waitFor(() => expect(screen.queryByText("Edit Task", { selector: "h2" })).not.toBeInTheDocument());
    // PORTAL: the drawer's modalizer can leave the page marked aria-hidden in jsdom (see above).
    await u.click(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`)).getByRole("button", { name: "Edit", ...PORTAL }));
    expect(await screen.findByRole("textbox", { name: "Description", ...PORTAL })).toHaveValue("Site identified");
    expect(exec).not.toHaveBeenCalled();
  });

  it("UT-ADCHK-922 leaving with Reorder open and coming back shows no open panel", async () => {
    const u = user();
    const first = renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement);
    expect(await screen.findByText("Reoder checklist", { selector: "h2" })).toBeInTheDocument();
    first.unmount();
    renderScreen();
    expect(await screen.findByRole("button", { name: "Draft to Cluster 1" })).toBeInTheDocument();
    expect(screen.queryByText("Reoder checklist", { selector: "h2" })).not.toBeInTheDocument();
    expect(screen.queryByText("Site identified")).not.toBeInTheDocument(); // clusters collapsed again
  });

  it("UT-ADCHK-923 a renumber failure warns, and its Reorder button opens the panel for that cluster", async () => {
    const u = user();
    api.softDeleteTask.mockRejectedValue(new RenumberAfterDeleteError(new Error("order write failed")));
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "Delete" })).not.toHaveAttribute("aria-disabled", "true"));
    await u.click(within(row).getByRole("button", { name: "Delete" }));
    await u.click(within(await screen.findByRole("alertdialog", PORTAL)).getByRole("button", { name: "Delete", ...PORTAL }));
    // The warning is an app toast whose action is "Reorder".
    const warning = await screen.findByText(/was deleted, but the order of the remaining items may be out of date/);
    const toast = warning.closest(".fui-Toast") as HTMLElement;
    expect(toast).not.toBeNull();
    await u.click(within(toast).getByRole("button", { name: "Reorder", ...PORTAL }));
    expect(await screen.findByText("Reoder checklist", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByTestId(`reorder-item-${T2}`)).toBeInTheDocument();
  });

  it("UT-ADCHK-924 a refetch that changes the group while Reorder is open disables Save and warns; names stay", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement);
    await screen.findByText("Reoder checklist", { selector: "h2" });
    // Another user deleted task 3; the list refetches while the panel is open.
    api.loadTasks.mockImplementation(async (tabId: string) =>
      FIXTURE_TASKS.filter((t) => t.tabId === tabId && t.id !== T3));
    await lastClient.invalidateQueries({ queryKey: qk.adminChecklistTasks(DE_WIND) });
    expect(await screen.findByText(REORDER_STALE_MESSAGE)).toBeInTheDocument();
    const items = screen.getAllByTestId(/^reorder-item-/);
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.textContent?.replace(/^\d+\./, "").trim()).not.toBe("");
    await u.click(within(screen.getByTestId(`reorder-item-${T3}`)).getByRole("button", { name: "Move up", ...PORTAL }));
    expect(screen.getByRole("button", { name: "Save", ...PORTAL })).toBeDisabled();
    expect(api.writeOrders).not.toHaveBeenCalled();
  });

  it("UT-ADCHK-925 Cancel on a changed Reorder asks 'Discard changes?'; an unchanged one closes at once", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement);
    await screen.findByText("Reoder checklist", { selector: "h2" });
    await u.click(within(screen.getByTestId(`reorder-item-${T3}`)).getByRole("button", { name: "Move up", ...PORTAL }));
    expect(screen.getByTestId("reorder-announcement")).toHaveTextContent("Grid request filed moved to position 2 of 3.");
    await u.click(screen.getByRole("button", { name: "Cancel", ...PORTAL }));
    await u.click(await screen.findByRole("button", { name: "Discard", ...PORTAL }));
    await waitFor(() => expect(screen.queryByText("Reoder checklist", { selector: "h2" })).not.toBeInTheDocument());
    expect(api.writeOrders).not.toHaveBeenCalled();

    await u.click(screen.getAllByRole("button", { name: "Reorder", ...PORTAL })[0] as HTMLElement);
    await screen.findByText("Reoder checklist", { selector: "h2" });
    await u.click(screen.getByRole("button", { name: "Cancel", ...PORTAL }));
    await waitFor(() => expect(screen.queryByText("Reoder checklist", { selector: "h2" })).not.toBeInTheDocument());
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("UT-ADCHK-926 while a save runs the panel's close button is disabled (busy)", async () => {
    const u = user();
    const write = deferred<string>();
    api.createTask.mockReturnValue(write.promise);
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    await u.type(await screen.findByRole("textbox", { name: "Description", ...PORTAL }), "Fresh");
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Close panel", ...PORTAL })).toBeDisabled());
    write.resolve("new-id");
    expect(await screen.findByText("Checklist item was successfully saved.")).toBeInTheDocument();
  });

  it("UT-ADCHK-927 a pending Completion Date write shows a spinner on that row only; no full-screen overlay", async () => {
    const u = user();
    const write = deferred<typeof PLAN_OK>();
    exec.mockReturnValue(write.promise);
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "No" })).not.toBeDisabled());
    await u.click(within(row).getByRole("button", { name: "No" }));
    expect(await within(row).findByText("Saving…")).toBeInTheDocument();
    expect(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T3}`)).queryByText("Saving…")).not.toBeInTheDocument();
    // The rest of the screen stays visible but read-only while the write runs.
    expect(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T3}`)).getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.queryByRole("dialog", PORTAL)).not.toBeInTheDocument();
    write.resolve(PLAN_OK);
    expect(await screen.findByText("Completion Date was successfully changed.")).toBeInTheDocument();
    expect(within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`)).queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("UT-ADCHK-928 the inline write's live region announces useBusyRunner's inlineLabel and goes away after", async () => {
    const u = user();
    const write = deferred<typeof PLAN_OK>();
    exec.mockReturnValue(write.promise);
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "No" })).not.toBeDisabled());
    await u.click(within(row).getByRole("button", { name: "No" }));
    const live = await screen.findByText(/^Completion Date for '.+' will be changed, please wait\.\.\.$/);
    expect(live).toHaveAttribute("role", "status");
    expect(live).toHaveAttribute("aria-live", "polite");
    write.resolve(PLAN_OK);
    expect(await screen.findByText("Completion Date was successfully changed.")).toBeInTheDocument();
    expect(screen.queryByText(/will be changed, please wait/)).not.toBeInTheDocument();
  });

  it("UT-ADCHK-929 each cluster table has its own name; a cut holding text is keyboard-focusable", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await u.click(screen.getByRole("button", { name: "Cluster 1 to Cluster 2" }));
    expect(await screen.findByRole("table", { name: "Draft to Cluster 1 tasks" })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Cluster 1 to Cluster 2 tasks" })).toBeInTheDocument();
    const cut = within(screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T2}`)).getByText(/ \.\.\.$/);
    expect(cut).toHaveAttribute("tabindex", "0");
    expect(cut).not.toHaveAttribute("title");
  });
});

describe("CheckListSettingsScreen — parity round 1", () => {
  it("UT-ADCHK-930 a blank-Order task is listed FIRST in the grid and the Reorder list; deleting it renumbers nothing", async () => {
    const u = user();
    const base = FIXTURE_TASKS.find((t) => t.id === T1);
    if (!base) throw new Error("fixture T1 missing");
    const blank = { ...base, id: "dddddddd-0000-0000-0000-0000000000bb", name: "Unnumbered", order: null };
    api.loadTasks.mockImplementation(async (tabId: string) =>
      [...FIXTURE_TASKS.filter((t) => t.tabId === tabId), ...(tabId === base.tabId ? [blank] : [])]);
    renderScreen();
    await expandDraft(u);
    const rows = await screen.findAllByTestId(/^con_Details_TasksInClusterDefaultChecklist_AdminScreen-/);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]?.textContent)).toEqual([
      "Unnumbered", "Site identified", "Land lease secured", "Grid request filed",
    ]);

    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement);
    await screen.findByText("Reoder checklist", { selector: "h2" });
    expect(screen.getAllByTestId(/^reorder-item-/).map((el) => el.getAttribute("data-testid"))).toEqual([
      `reorder-item-${blank.id}`, `reorder-item-${T1}`, `reorder-item-${T2}`, `reorder-item-${T3}`,
    ]);
    await u.click(screen.getByRole("button", { name: "Cancel", ...PORTAL }));
    await waitFor(() => expect(screen.queryByText("Reoder checklist", { selector: "h2" })).not.toBeInTheDocument());

    const row = screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${blank.id}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "Delete", ...PORTAL })).not.toHaveAttribute("aria-disabled", "true"));
    await u.click(within(row).getByRole("button", { name: "Delete", ...PORTAL }));
    await u.click(within(await screen.findByRole("alertdialog", PORTAL)).getByRole("button", { name: "Delete", ...PORTAL }));
    // The delegated canvas filter `Order > Blank()` (DCS:1742) matches no rows,
    // so only the flag is written; no sibling Order changes.
    await waitFor(() => expect(api.softDeleteTask).toHaveBeenCalledWith(blank.id, []));
    expect(api.softDeleteTask).toHaveBeenCalledTimes(1);
  });

  it("UT-ADCHK-931 opening Reorder does not change the cluster caption's font weight", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u); // selects Draft (semibold)
    await screen.findByText("Site identified");
    await u.click(screen.getByRole("button", { name: "Cluster 1 to Cluster 2" })); // selects Cluster 1
    const draftCaption = screen.getByText("Draft to Cluster 1");
    const cluster1Caption = screen.getByText("Cluster 1 to Cluster 2");
    const draftBefore = draftCaption.className;
    const cluster1Before = cluster1Caption.className;
    expect(draftBefore).not.toBe(cluster1Before); // only the selected one is semibold

    await u.click(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement); // Draft's Reorder
    expect(await screen.findByText("Reoder checklist", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Draft to Cluster 1").className).toBe(draftBefore);
    expect(screen.getByText("Cluster 1 to Cluster 2").className).toBe(cluster1Before);
  });
});

describe("CheckListSettingsScreen — reusable components: visual unifications", () => {
  /** Renders a reference control in its own container, with the same provider. */
  function reference(node: ReactNode, testId: string): HTMLElement {
    const { getByTestId } = render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);
    return getByTestId(testId);
  }

  it("UT-ADCHK-932 every page-bar Retry is a SMALL button (was medium)", async () => {
    api.loadTasks.mockRejectedValue(new DataError("Load checklist tasks", "nope"));
    api.loadLockedTaskIds.mockRejectedValueOnce(new DataError("Load Project Gate checklist approvals", "boom"));
    renderScreen();
    const tasksRetry = await screen.findByRole("button", { name: "Retry loading tasks" });
    const locksRetry = await screen.findByRole("button", { name: "Retry loading Project Gate usage" });
    expect(tasksRetry).toHaveTextContent("Retry");
    const small = reference(<Button size="small" data-testid="ref-small">Retry</Button>, "ref-small");
    const medium = reference(<Button data-testid="ref-medium">Retry</Button>, "ref-medium");
    expect(small.className).not.toBe(medium.className);
    for (const retry of [tasksRetry, locksRetry]) expect(retry.className).toBe(small.className);
  });

  it("UT-ADCHK-933 the cluster load-error Retry is small too", async () => {
    api.loadClusters.mockRejectedValue(new DataError("Load checklist clusters", "nope"));
    renderScreen();
    const clustersRetry = await screen.findByRole("button", { name: "Retry loading clusters" });
    const small = reference(<Button size="small" data-testid="ref-small">Retry</Button>, "ref-small");
    expect(clustersRetry.className).toBe(small.className);
  });

  it("UT-ADCHK-934 the tab load-error Retry is small too, and retries the tabs", async () => {
    const u = user();
    api.loadTabs.mockRejectedValueOnce(new DataError("Load checklist country/technology tabs", "nope"));
    renderScreen();
    const tabsRetry = await screen.findByRole("button", { name: "Retry" });
    const small = reference(<Button size="small" data-testid="ref-small">Retry</Button>, "ref-small");
    expect(tabsRetry.className).toBe(small.className);
    await u.click(tabsRetry);
    expect(await screen.findByRole("tab", { name: "DK PV" })).toBeInTheDocument();
  });

  it("UT-ADCHK-935 a disabled Add Task / Reorder uses the CommandBar canvas greys", async () => {
    const u = user();
    api.loadTasks.mockRejectedValue(new DataError("Load checklist tasks", "nope"));
    renderScreen();
    await screen.findByRole("button", { name: "Retry loading tasks" });
    await expandDraft(u);
    const add = screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement;
    expect(add).toBeDisabled();
    const greyed = reference(
      <CommandBar ariaLabel="ref" onCommand={() => undefined}
        commands={[{ key: "ref", label: "Add Task", icon: "Add", enabled: false }]} />,
      "command-ref",
    );
    const enabled = reference(
      <CommandBar ariaLabel="ref2" onCommand={() => undefined}
        commands={[{ key: "ref2", label: "Add Task", icon: "Add" }]} />,
      "command-ref2",
    );
    expect(greyed.className).not.toBe(enabled.className);
    expect(add.className).toBe(greyed.className);
    expect((screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement).className).toBe(greyed.className);
  });

  it("UT-ADCHK-936 the Add/Edit panel Cancel is the brand-outline PanelButtons Cancel (was secondary)", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    const brand = reference(<PanelButtons look="brand" onSave={() => undefined} cancelTestId="ref-cancel" />, "ref-cancel");
    const secondary = reference(<Button appearance="secondary" data-testid="ref-secondary">Cancel</Button>, "ref-secondary");
    expect(brand.className).not.toBe(secondary.className);

    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    const panel = (await screen.findByText("Add Task", { selector: "h2" })).closest(".canvas-panel") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByRole("button", { name: "Cancel", ...PORTAL }).className).toBe(brand.className);
  });
});

describe("CheckListSettingsScreen — parity round 3", () => {
  it("UT-ADCHK-937 a write to a row deleted meanwhile shows plain text (no table name or GUID) and refreshes the list", async () => {
    const u = user();
    exec.mockRejectedValue(new PlanError(
      0, 1, "checklist item deactivated",
      new RecordGoneError("update checklist item", "vsb_projectdefaultchecklistses", T1),
    ));
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "Active" })).not.toBeDisabled());
    const loadsBefore = api.loadTasks.mock.calls.length;
    await u.click(within(row).getByRole("button", { name: "Active" }));
    await u.click(await screen.findByRole("button", { name: "Deactivate", ...PORTAL }));
    const toast = await screen.findByText(/The status could not be changed\. This item no longer exists/);
    expect(toast).toHaveTextContent("the list has been refreshed");
    expect(toast.textContent).not.toContain(T1);
    expect(toast.textContent).not.toContain("vsb_");
    await waitFor(() => expect(api.loadTasks.mock.calls.length).toBeGreaterThan(loadsBefore));
  });

  it("UT-ADCHK-938 a successful Completion Date toggle refetches the locks (canvas Refresh of approvals, DCS:621)", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "No" })).not.toBeDisabled());
    expect(api.loadLockedTaskIds).toHaveBeenCalledTimes(1);
    await u.click(within(row).getByRole("button", { name: "No" }));
    expect(await screen.findByText("Completion Date was successfully changed.")).toBeInTheDocument();
    await waitFor(() => expect(api.loadLockedTaskIds).toHaveBeenCalledTimes(2));
  });
});

describe("CheckListSettingsScreen — admin access", () => {
  it("UT-ADCHK-939 a non-admin sees the tasks but every command and row action is disabled", async () => {
    access.admin = false;
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    // The rows are not locked, so only the admin rule can be what disables them.
    await waitFor(() => expect(api.loadLockedTaskIds).toHaveBeenCalled());
    expect(screen.getAllByRole("button", { name: "Add Task" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Reorder" })[0]).toBeDisabled();
    for (const name of ["Edit", "Delete", "No", "Active"]) {
      expect(within(row).getByRole("button", { name })).toBeDisabled();
    }
    expect(api.createTask).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("UT-ADCHK-940 an admin gets the same row's commands and actions enabled", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
    await waitFor(() => expect(within(row).getByRole("button", { name: "Edit" })).not.toBeDisabled());
    expect(screen.getAllByRole("button", { name: "Add Task" })[0]).not.toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Reorder" })[0]).not.toBeDisabled();
    for (const name of ["Delete", "No", "Active"]) {
      expect(within(row).getByRole("button", { name })).not.toBeDisabled();
    }
  });
});

describe("CheckListSettingsScreen — canvas parity, 20 Nov 2026 (row icons, Add/Edit form, dialogs)", () => {
  /** `#rrggbb` / `#rgb` → the `rgb(r, g, b)` jsdom reports. */
  const rgb = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
  };
  const pathOf = (root: Element | null | undefined) => root?.querySelector("svg path")?.getAttribute("d") ?? null;
  /** The outline of a Fluent icon, rendered on its own, to compare a button's glyph with. */
  const iconPath = (node: ReactNode) => pathOf(render(<FluentProvider theme={vsbTheme}><span>{node}</span></FluentProvider>).container);
  const iconOf = (button: HTMLElement) => button.querySelector(".fui-Button__icon") as HTMLElement;
  /** The canvas `IconName` of an MDL2 glyph drawn as its own outline (`data-icon-name`, as the canvas DOM carries it). */
  const mdl2Of = (button: HTMLElement) => button.querySelector("svg")?.getAttribute("data-icon-name") ?? null;
  /**
   * The `color` of every plain style rule (no @media, no :hover) whose selector matches `el`, in sheet order.
   * jsdom's `getComputedStyle` ignores selector specificity, so a colour is checked through the rules that match.
   */
  const rulesOn = (el: Element, prop: string): [selector: string, value: string][] => {
    const out: [string, string][] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const value = rule.style.getPropertyValue(prop);
        let hit = false;
        try { hit = el.matches(rule.selectorText); } catch { hit = false; }
        if (hit && value) out.push([rule.selectorText, value]);
      }
    }
    return out;
  };
  const colorRulesOn = (el: Element): string[] => rulesOn(el, "color").map(([, value]) => value);
  /**
   * The value Griffel's atomic classes give `el` itself for `prop`: the last single-class `.f…` rule on it. In a
   * browser the atomic bucket follows Fluent's reset (`.r…`) bucket, so it wins over the reset's base value.
   */
  const atomicValue = (el: Element, prop: string): string | undefined => {
    let value: string | undefined;
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const m = /^\.(f[\w-]+)$/.exec(rule.selectorText);
        const v = rule.style.getPropertyValue(prop);
        if (m && el.classList.contains(m[1] as string) && v) value = v;
      }
    }
    return value;
  };
  const atomicColor = (el: Element) => atomicValue(el, "color");
  const rowOf = (id: string) => screen.getByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${id}`);
  /** T1 with Completion Date on, so the grid shows both the "Yes" and the "No" variant. */
  const withT1Completion = () => api.loadTasks.mockImplementation(async (tabId: string) =>
    FIXTURE_TASKS.filter((t) => t.tabId === tabId).map((t) => (t.id === T1 ? { ...t, isCompletionDate: true } : t)));

  it("UT-ADCHK-942 the Completion Date / Active buttons show the canvas IconName per value, 16 px, in akzent3 / themePrimary", async () => {
    const u = user();
    const glyph = {
      calendarReply: "CalendarReply", calendar: "Calendar",
      deactivateOrders: "DeactivateOrders", activateOrders: iconPath(<DocumentCheckmarkRegular />),
    };
    expect(new Set(Object.values(glyph)).size).toBe(4);
    withT1Completion();
    renderScreen();
    await expandDraft(u);
    await waitFor(() => expect(within(rowOf(T1)).getByRole("button", { name: "Yes" })).not.toHaveAttribute("aria-disabled", "true"));
    const yes = within(rowOf(T1)).getByRole("button", { name: "Yes" });
    const active = within(rowOf(T1)).getByRole("button", { name: "Active" });
    const no = within(rowOf(T3)).getByRole("button", { name: "No" });
    const inactive = within(rowOf(T3)).getByRole("button", { name: "Inactive" });
    // `IconName: If('Is Completion Date', "CalendarReply", "Calendar")`; `If(Status = Active, "DeactivateOrders", "ActivateOrders")`.
    expect(mdl2Of(yes)).toBe(glyph.calendarReply);
    expect(mdl2Of(no)).toBe(glyph.calendar);
    expect(mdl2Of(active)).toBe(glyph.deactivateOrders);
    expect(pathOf(inactive)).toBe(glyph.activateOrders);
    // `FontColor` / `IconColor`: akzent3 for Yes / Active, themePrimary for No / Inactive. The icon sets no colour of
    // its own, so it takes the button's (before the fix the grid's `td span` rule painted it #242424).
    for (const b of [yes, active]) expect(atomicColor(b)).toBe(rgb(palette.akzent3));
    for (const b of [no, inactive]) expect(atomicColor(b)).toBe(rgb(palette.themePrimary));
    for (const b of [yes, no, active, inactive]) expect(colorRulesOn(iconOf(b))).toEqual([]);
    // The cells' own text keeps the measured #242424.
    expect(colorRulesOn(within(rowOf(T1)).getByText("Site identified"))).toContain(rgb("#242424"));
    // No `IconSize` / `FontSize`: Fluent v8's 16 px button icon, 8 px before a 14 px regular label.
    for (const b of [yes, no, active, inactive]) {
      expect(getComputedStyle(iconOf(b)).fontSize).toBe("16px");
      expect(getComputedStyle(iconOf(b)).marginRight).toBe("8px");
      expect(atomicValue(b, "font-size")).toBe("14px");
      expect(atomicValue(b, "font-weight")).toBe("var(--fontWeightRegular)");
    }
    // `ico_ActivateDeactivate_…` keeps the default TextAlignment (Center) in its 90 px; Completion Date sets Left.
    expect(getComputedStyle(active).width).toBe("90px");
    expect(getComputedStyle(active).justifyContent).toBe("center");
    // Gate Relevance is plain text, the column's Yes / No labels.
    expect(within(rowOf(T2)).getAllByRole("cell")[2]).toHaveTextContent(/^Yes$/);
    expect(within(within(rowOf(T2)).getAllByRole("cell")[2] as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("UT-ADCHK-943 a row locked by a Project Gate greys BOTH the flag label (#a19f9d) and its icon (#bbb); a free row keeps its colours", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await waitFor(() => expect(within(rowOf(T1)).getByRole("button", { name: "Active" })).not.toHaveAttribute("aria-disabled", "true"));
    for (const name of ["No", "Active"]) {
      const locked = within(rowOf(T2)).getByRole("button", { name });
      expect(locked).toHaveAttribute("aria-disabled", "true");
      expect(atomicColor(locked)).toBe(rgb("#a19f9d"));
      expect(colorRulesOn(iconOf(locked))).toEqual([rgb("#bbb")]);
    }
    const free = within(rowOf(T1)).getByRole("button", { name: "Active" });
    expect(atomicColor(free)).toBe(rgb(palette.akzent3));
    expect(colorRulesOn(iconOf(free))).toEqual([]);
  });

  it("UT-ADCHK-944 Edit / Delete are the canvas pencil and bin in 34 x 34 boxes with 16 px icons; a locked one is #bbb", async () => {
    const u = user();
    const pencil = "Edit";
    const bin = iconPath(<DeleteRegular />);
    renderScreen();
    await expandDraft(u);
    await waitFor(() => expect(within(rowOf(T1)).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true"));
    const edit = within(rowOf(T1)).getByRole("button", { name: "Edit" });
    const del = within(rowOf(T1)).getByRole("button", { name: "Delete" });
    expect(mdl2Of(edit)).toBe(pencil);
    expect(pathOf(del)).toBe(bin);
    for (const b of [edit, del]) {
      expect(getComputedStyle(b).width).toBe("34px");
      expect(getComputedStyle(b).height).toBe("34px");
      expect(getComputedStyle(iconOf(b)).fontSize).toBe("16px");
      // `IconColor: akzent3` (L503, L537) and nothing else — the grid's `td span` rule used to add #242424.
      expect(colorRulesOn(iconOf(b))).toEqual([rgb(palette.akzent3)]);
    }
    const lockedEdit = within(rowOf(T2)).getByRole("button", { name: "Edit" });
    expect(colorRulesOn(iconOf(lockedEdit))).toContain(rgb("#bbb"));
    expect(colorRulesOn(iconOf(lockedEdit))).not.toContain(rgb(palette.akzent3));
  });

  it("UT-ADCHK-945 Add Task: 'Value cannot be blank.' shows at once (canvas Visible: IsBlank), red akzent5, no icon; '*' before the caption; counters on the caption row", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    await u.click(screen.getAllByRole("button", { name: "Add Task" })[0] as HTMLElement);
    const panel = (await screen.findByText("Add Task", { selector: "h2" })).closest(".canvas-panel") as HTMLElement;
    // Nothing typed, nothing touched: the canvas label is already visible and Save is disabled.
    const message = within(panel).getByText("Value cannot be blank.");
    expect(atomicColor(message)).toBe(rgb(palette.akzent5));
    expect(atomicValue(message, "font-size")).toBe("12px");
    expect(message.querySelector("svg")).toBeNull();
    expect(within(panel).getByRole("button", { name: "Save", ...PORTAL })).toBeDisabled();
    // The `*` (lbl_…_Name_Required, X 5) sits before "Description" (X 20), in the canvas label's red, not bold.
    const star = panel.querySelector(".fui-Label__required") as HTMLElement;
    expect(star).not.toBeNull();
    expect(getComputedStyle(star).order).toBe("-1");
    expect(colorRulesOn(star)).toContain(rgb(palette.akzent5));
    expect(panel.querySelectorAll(".fui-Label__required")).toHaveLength(1); // Holding Description has none
    // Both captions are Semibold (`Weight: Semibold`, L1087, L1182) through a rule that out-ranks canvas.css's
    // `.canvas-panel .fui-Field label { font-weight: 400 }` (0-2-1): at least three classes.
    for (const caption of Array.from(panel.querySelectorAll(".fui-Field__label"))) {
      expect(rulesOn(caption, "font-weight").some(([selector, value]) =>
        value === "var(--fontWeightSemibold)" && (selector.match(/\./g) ?? []).length >= 3)).toBe(true);
    }
    // `lbl_…_Details` ("0/256", RGBA(50,49,48)) on the caption row, not a hint under the box.
    const counters = within(panel).getAllByText("0/256");
    expect(counters).toHaveLength(2);
    for (const c of counters) {
      expect(c.closest(".fui-Field__hint")).toBeNull();
      expect(c.previousElementSibling?.classList.contains("fui-Field")).toBe(true);
      expect(colorRulesOn(c)).toContain(rgb("#323130"));
    }
    // Typing a name clears it, as the canvas label hides.
    await u.type(within(panel).getByRole("textbox", { name: "Description", ...PORTAL }), "A");
    expect(within(panel).queryByText("Value cannot be blank.")).not.toBeInTheDocument();
    expect(within(panel).getByText("1/256")).toBeInTheDocument();
  });

  it("UT-ADCHK-946 the Add / Edit form: Description, Holding Description, then the Gate relevance / Completion Date / Active toggles; Edit seeds them", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    await waitFor(() => expect(within(rowOf(T1)).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true"));
    await u.click(within(rowOf(T1)).getByRole("button", { name: "Edit" }));
    const panel = (await screen.findByText("Edit Task", { selector: "h2" })).closest(".canvas-panel") as HTMLElement;
    const controls = [
      "txt_Admin_Checklist_Form_Fields_Name", "txt_Admin_Checklist_Form_Fields_HoldingDescription",
      "tgl_GateRelevance_ChecklistForm", "tgl_CompletionDate_ChecklistForm", "tgl_Active_ChecklistForm",
    ].map((id) => within(panel).getByTestId(id));
    for (let i = 1; i < controls.length; i += 1) {
      expect((controls[i - 1] as HTMLElement).compareDocumentPosition(controls[i] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(panel).getByRole("textbox", { name: "Description", ...PORTAL })).toHaveValue("Site identified");
    expect(within(panel).getByText("15/256")).toBeInTheDocument();
    expect(within(panel).queryByText("Value cannot be blank.")).not.toBeInTheDocument();
    expect(within(panel).getByRole("switch", { name: "Gate relevance", ...PORTAL })).not.toBeChecked();
    expect(within(panel).getByRole("switch", { name: "Completion Date", ...PORTAL })).not.toBeChecked();
    expect(within(panel).getByRole("switch", { name: "Active", ...PORTAL })).toBeChecked();
    // `con_Admin_Checklist_Form_Fields` has no LayoutGap and the panel body's 20 px is its PaddingTop 20.
    const form = within(panel).getByRole("form", { name: "Edit Task", ...PORTAL });
    expect(getComputedStyle(form).paddingTop).toBe("0px");
    expect(getComputedStyle(form).rowGap).toBe("0px");
  });

  it("UT-ADCHK-947 the delete dialog's Confirm is the canvas blue ✓ (themePrimary, CheckMark, 128 px), not a red bin; Cancel ✕ 96 px", async () => {
    const u = user();
    const tick = iconPath(<CheckmarkRegular />);
    const cross = iconPath(<DismissRegular />);
    renderScreen();
    await expandDraft(u);
    await waitFor(() => expect(within(rowOf(T1)).getByRole("button", { name: "Delete" })).not.toHaveAttribute("aria-disabled", "true"));
    await u.click(within(rowOf(T1)).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", PORTAL);
    expect(within(dialog).getByText("Delete checklist item?")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete", ...PORTAL });
    const cancel = within(dialog).getByRole("button", { name: "Cancel", ...PORTAL });
    expect(getComputedStyle(confirm).backgroundColor).toBe(rgb(palette.themePrimary));
    expect(getComputedStyle(confirm).backgroundColor).not.toBe(rgb(palette.Error));
    expect(getComputedStyle(confirm).color).toBe(rgb(palette.white));
    expect(confirm.style.width).toBe("128px");
    expect(pathOf(confirm)).toBe(tick);
    expect(getComputedStyle(cancel).width).toBe("96px");
    expect(pathOf(cancel)).toBe(cross);
    // The PM `cmp_PopUp_Confirmation` box: Min(490, …) wide.
    expect(getComputedStyle(dialog).width).toBe("490px");
  });

  it("UT-ADCHK-948 the activate / deactivate dialog has the same canvas buttons (blue ✓ 128 px, ✕ 96 px)", async () => {
    const u = user();
    const tick = iconPath(<CheckmarkRegular />);
    renderScreen();
    await expandDraft(u);
    await waitFor(() => expect(within(rowOf(T1)).getByRole("button", { name: "Active" })).not.toHaveAttribute("aria-disabled", "true"));
    await u.click(within(rowOf(T1)).getByRole("button", { name: "Active" }));
    const dialog = await screen.findByRole("alertdialog", PORTAL);
    const confirm = within(dialog).getByRole("button", { name: "Deactivate", ...PORTAL });
    expect(getComputedStyle(confirm).backgroundColor).toBe(rgb(palette.themePrimary));
    expect(confirm.style.width).toBe("128px");
    expect(pathOf(confirm)).toBe(tick);
    expect(getComputedStyle(within(dialog).getByRole("button", { name: "Cancel", ...PORTAL })).width).toBe("96px");
    expect(getComputedStyle(dialog).width).toBe("490px");
  });

  it("UT-ADCHK-949 the cluster Reorder command shows the canvas ItemIconName NumberedList", async () => {
    const u = user();
    const numberedList = "NumberedList";
    renderScreen();
    await expandDraft(u);
    await screen.findByText("Site identified");
    expect(mdl2Of(screen.getAllByRole("button", { name: "Reorder" })[0] as HTMLElement)).toBe(numberedList);
  });
});
