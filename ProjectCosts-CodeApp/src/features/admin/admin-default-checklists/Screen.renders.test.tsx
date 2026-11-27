// @vitest-environment jsdom
/**
 * Render counts of Check List Settings (D162 B5, FE-AD-02 and FE-AD-03). The screen is mounted as in `Screen.test.tsx` (the
 * data module's I/O and `executePlan` mocked) and `probeRender` counts each cluster's `TaskTable` (`TaskTable:<cluster id>`).
 *
 * Before FE-AD-02 the Add / Edit drawer's form lived in the screen, so every keystroke rendered every open cluster's table;
 * before FE-AD-03 opening a confirmation rendered them too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn().mockResolvedValue({ success: true, data: [] }),
    retrieveRecordAsync: vi.fn(), createRecordAsync: vi.fn(), updateRecordAsync: vi.fn(),
    deleteRecordAsync: vi.fn(), executeAsync: vi.fn(),
  }),
}));

vi.mock("@/app/useCurrentUser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/useCurrentUser")>()),
  useAdminAccess: () => true,
}));

const api = vi.hoisted(() => ({
  loadTabs: vi.fn(), loadTasks: vi.fn(), loadLockedTaskIds: vi.fn(),
  createTask: vi.fn(), softDeleteTask: vi.fn(), writeOrders: vi.fn(),
}));
vi.mock("@/data/adminDefaultChecklists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/adminDefaultChecklists")>()),
  ...api,
}));

const states = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/data/projectStatesRead", () => ({ listProjectStates: states.list }));

const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

import { structuralSharingWithDates } from "@/app/queryStructuralSharing";
import { AppToaster } from "@/components";
import type { WritePlan } from "@/data/writePlan";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import { vsbTheme } from "@/theme/fluent";
import { FIXTURE_CLUSTERS, FIXTURE_LOCKED, FIXTURE_TABS, FIXTURE_TASKS } from "./fixtures";
import CheckListSettingsScreen from "./Screen";

const T1 = "dddddddd-0000-0000-0000-000000000001";
/** Drawer and dialog content is queried with `hidden: true` (tabster's modalizer in jsdom, see `Screen.test.tsx`). */
const PORTAL = { hidden: true } as const;

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, structuralSharing: structuralSharingWithDates } } });
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/default-checklists"]}>
          <Routes>
            <Route path="/admin/default-checklists" element={<CheckListSettingsScreen />} />
          </Routes>
        </MemoryRouter>
        <AppToaster />
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

/** Opens the Draft and Cluster 1 accordions and waits until T1's Edit is enabled (the locks have loaded). */
async function openTwoClusters(u: ReturnType<typeof userEvent.setup>) {
  renderScreen();
  for (const cluster of FIXTURE_CLUSTERS.slice(0, 2)) {
    await u.click(within(await screen.findByTestId(`con_Main_DefaultChecklist_AdminScreen-${cluster.id}`)).getAllByRole("button")[0]!);
  }
  const row = await screen.findByTestId(`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${T1}`);
  await screen.findByText("Permit applied");
  await waitFor(() => expect(within(row).getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled", "true"));
  await settle();
  return row;
}

let renders: RenderCounts;

beforeEach(() => {
  vi.clearAllMocks();
  api.loadTabs.mockResolvedValue(FIXTURE_TABS);
  states.list.mockResolvedValue(FIXTURE_CLUSTERS.map((c) => ({
    id: c.id, name: c.name, order: c.order ?? 0, isVisibleOnChecklist: true, clusterDescription: null,
    active: true, orderRaw: c.order, businessUnitId: null,
  })));
  api.loadTasks.mockImplementation(async (tabId: string) => FIXTURE_TASKS.filter((t) => t.tabId === tabId));
  api.loadLockedTaskIds.mockResolvedValue(FIXTURE_LOCKED);
  exec.mockResolvedValue({ done: 1, createdIds: [] });
  renders = countRenders();
});
afterEach(() => {
  renders.stop();
  vi.restoreAllMocks();
});

describe("Check List Settings render counts (FE-AD-02, FE-AD-03)", () => {
  it("UT-ADCHK-FE-001 typing in the Edit drawer renders no task table", { timeout: 20_000 }, async () => {
    const u = userEvent.setup();
    const row = await openTwoClusters(u);
    await u.click(within(row).getByRole("button", { name: "Edit" }));
    const box = await screen.findByRole("textbox", { name: "Description", ...PORTAL });
    await u.click(box);
    await settle();
    renders.reset();
    await u.type(box, " CHANGED");
    expect(box).toHaveValue("Site identified CHANGED");
    await settle();
    expect(renders.ofPrefix("TaskTable:"), JSON.stringify(renders.snapshot())).toBe(0);
  });

  it("UT-ADCHK-FE-002 opening and cancelling the status confirmation renders no task table", { timeout: 20_000 }, async () => {
    const u = userEvent.setup();
    const row = await openTwoClusters(u);
    renders.reset();
    await u.click(within(row).getByRole("button", { name: "Active" }));
    await u.click(await screen.findByRole("button", { name: "Cancel", ...PORTAL }));
    await settle();
    expect(renders.ofPrefix("TaskTable:"), JSON.stringify(renders.snapshot())).toBe(0);
  });

  it("UT-ADCHK-FE-003 Save writes the form typed in the drawer (the drawer hands its own form to the screen)", { timeout: 20_000 }, async () => {
    const u = userEvent.setup();
    const row = await openTwoClusters(u);
    await u.click(within(row).getByRole("button", { name: "Edit" }));
    const box = await screen.findByRole("textbox", { name: "Description", ...PORTAL });
    await u.type(box, " CHANGED");
    await u.click(screen.getByRole("button", { name: "Save", ...PORTAL }));
    await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
    const writes = exec.mock.calls.flatMap((c) => (c[0] as WritePlan).writes);
    expect(writes).toEqual([expect.objectContaining({ op: "update", id: T1, data: expect.objectContaining({ vsb_name: "Site identified CHANGED" }) })]);
  });
});
