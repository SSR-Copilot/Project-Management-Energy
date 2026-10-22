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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Button, FluentProvider } from "@fluentui/react-components";
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
  it("UT-ADCHK-901 tabs in numeric Order, left-most selected by default", async () => {
    renderScreen();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("value"))).toEqual([DE_WIND, DE_PV, "aaaaaaaa-0000-0000-0000-000000000010"]);
    expect(tabs[1]).toHaveAccessibleName("DE PV");
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
    await u.click(screen.getByRole("tab", { name: "DE PV" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`?tab=${DE_PV}`));
    await waitFor(() => expect(api.loadTasks).toHaveBeenCalledWith(DE_PV));
    await waitFor(() => expect(screen.queryByText("Site identified")).not.toBeInTheDocument());
  });

  it("UT-ADCHK-906 ?tab= opens that tab", async () => {
    renderScreen(`/admin/default-checklists?tab=${DE_PV}`);
    await waitFor(() => expect(screen.getByRole("tab", { name: "DE PV" })).toHaveAttribute("aria-selected", "true"));
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

  it("UT-ADCHK-912 delete explains the soft delete and renumbers the later rows", async () => {
    const u = user();
    renderScreen();
    await expandDraft(u);
    const row = await screen.findByTestId("con_Details_TasksInClusterDefaultChecklist_AdminScreen-dddddddd-0000-0000-0000-000000000001");
    await waitFor(() => expect(within(row).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await u.click(within(row).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/synchronisation process then removes it/)).toBeInTheDocument();
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
    await u.click(await screen.findByRole("tab", { name: "DE PV" }));
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
    expect(await screen.findByRole("tab", { name: "DE PV" })).toBeInTheDocument();
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
