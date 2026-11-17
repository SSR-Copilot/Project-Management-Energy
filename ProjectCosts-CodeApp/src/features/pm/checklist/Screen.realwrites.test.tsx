// @vitest-environment jsdom
/**
 * UT-CHKLST-937.. — the Project General CheckList Screen with its REAL hooks (checklist analysis C11, CT-1 / CT-2). `Screen.test.tsx`
 * mocks `./hooks` whole, which is the shape that hid the approval bypass and the blank screen after a failed refresh. Here the
 * screen, `hooks.ts`, TanStack Query, `usePlanWrite`, `rules.ts` and the plans are real; only the Dataverse loaders, the flows and
 * `executePlan` (the sender) are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  project: vi.fn<(id: string) => Promise<unknown>>(),
  states: vi.fn<() => Promise<unknown[]>>(),
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  gates: vi.fn<(p: unknown) => Promise<unknown[]>>(),
  rows: vi.fn<(id: string, state: string) => Promise<unknown[]>>(),
  settings: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
  count: vi.fn<(id: string, state: string) => Promise<number>>(),
  history: vi.fn<(d: unknown) => Promise<unknown[]>>(),
  sent: [] as WritePlan[],
  sendError: null as Error | null,
}));
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    projectId: "p1", locale: "en-US", loading: false, envVars: { vsb_ProjectManagementAppID: "app-1" }, session: { fullName: "Ada Lovelace" },
  }),
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan) => {
      if (plan.refusedReason) throw new mod.PlanRefusedError(plan.refusedReason);
      h.sent.push(plan);
      if (h.sendError) throw new mod.PlanError(0, plan.writes.length, plan.writes[0]?.reason ?? "write", h.sendError);
      return { done: plan.writes.length, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] };
    }),
  };
});
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));
vi.mock("@/data/checklist", () => ({
  loadChecklistProject: (id: string) => h.project(id),
  listChecklistProjectStates: () => h.states(),
  listChecklistTrackings: (id: string) => h.trackings(id),
  listChecklistGates: (p: unknown) => h.gates(p),
  listClusterChecklist: (id: string, s: string) => h.rows(id, s),
  listChecklistApprovalSettings: (ids: readonly string[]) => h.settings(ids),
  countClusterChecklistRows: (id: string, s: string) => h.count(id, s),
  listClusterTemplates: vi.fn(async () => []),
  listHistory: (d: unknown) => h.history(d),
}));

import CheckListScreen from "./Screen";
import {
  READ_GATE_MSG, UI, type ChecklistApprovalSetting, type ChecklistProject, type ChecklistRow, type ProjectStateRef, type TrackingRow,
} from "./rules";
import { executePlan } from "@/data/executePlan";

const ACS = CHOICE_PROCESS.approvalClusterState;
const NAMES = ["Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"];
const STATES: ProjectStateRef[] = NAMES.map((name, i) => ({ id: `ps-${i}`, name, order: i, isVisibleOnChecklist: true, clusterDescription: null }));
const PROJECT: ChecklistProject = {
  id: "p1", projectName: "Windpark Nord", projectNumber: "DE-0001", startCluster: 0, clusterStateId: "ps-0", clusterStateName: "Draft",
  approvalState: null, countryId: "c1", technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: "bu-1", totalCapacity: 20,
  netYieldP50: 1000,
  milestones: {
    projectStartDate: "2026-01-01", feasibilityStudies: "2026-03-01", projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};
const TRACKING: TrackingRow = {
  id: "t-0", name: "Draft", clusterStateId: "ps-0", clusterStateName: "Draft", approvalClusterState: ACS.inProgress,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
};
const TASK: ChecklistRow = {
  id: "cl-1", title: "Land secured", clusterStateId: "ps-0", gateRelevance: true, holdingDescription: "All plots", isCompletionDate: false,
  completionDate: null, taskState: CHOICE_PROCESS.taskState.none, approvalChecklistState: null, note: null, sort: 1,
  projectDefaultChecklistId: "tpl-1", flowRunId: null, flowApprovalId: null,
};
const FORMAL: ChecklistApprovalSetting = {
  id: "s1", projectDefaultChecklistId: "tpl-1", approvalMode: CHOICE_PROCESS.approvalMode.formalApproval, gateActive: true,
  portfolioManagerMail: null, defaultApprovers: null, defaultContributors: null, defaultNotifications: null,
};
const COMPLETE = "but_Checklist_DisplayProject_Body_Content_ListRow_Complete";

function mountScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FluentProvider theme={vsbTheme}><MemoryRouter><CheckListScreen /></MemoryRouter></FluentProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.sent = [];
  h.sendError = null;
  vi.mocked(executePlan).mockClear();
  h.project.mockResolvedValue(PROJECT);
  h.states.mockResolvedValue(STATES);
  h.trackings.mockResolvedValue([TRACKING]);
  h.gates.mockResolvedValue([]);
  h.rows.mockResolvedValue([TASK]);
  h.settings.mockResolvedValue([]);
  h.count.mockResolvedValue(1);
  h.history.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Project General CheckList Screen with its real hooks", () => {
  it("UT-CHKLST-937 the first load shows a loader until the project is read, and the Wind project never shows the technology tip", async () => {
    let release: (p: ChecklistProject) => void = () => {};
    h.project.mockReturnValue(new Promise<ChecklistProject>((resolve) => { release = resolve; }));
    mountScreen();
    expect(await screen.findByTestId("checklist-loading")).toBeTruthy();
    expect(screen.queryByText(UI.technologyTip)).toBeNull();
    expect(screen.queryByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeNull();
    release(PROJECT);
    expect(await screen.findByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeTruthy();
    expect(screen.queryByTestId("checklist-loading")).toBeNull();
    expect(screen.queryByText(UI.technologyTip)).toBeNull();
    expect(screen.getByTestId("lbl_Checklist_DisplayProject_Body_Content_Title").textContent).toBe("Draft Checklist");
  });

  it("UT-CHKLST-938 C1 end to end: Complete stays off while the approval settings are in flight, then follows them (an approval task opens the panel and writes nothing)", async () => {
    let release: (s: ChecklistApprovalSetting[]) => void = () => {};
    h.settings.mockReturnValue(new Promise<ChecklistApprovalSetting[]>((resolve) => { release = resolve; }));
    mountScreen();
    const button = (await screen.findByTestId(COMPLETE)) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(executePlan).not.toHaveBeenCalled();
    release([FORMAL]);
    await waitFor(() => expect((screen.getByTestId(COMPLETE) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByTestId(COMPLETE).textContent).toBe("Approval");
    fireEvent.click(screen.getByTestId(COMPLETE));
    expect(await screen.findByText("Request Check List completion approval")).toBeTruthy();
    expect(executePlan).not.toHaveBeenCalled();
  });

  it("UT-CHKLST-939 C1 end to end: when the approval settings cannot be read the banner shows, Complete stays off and nothing is written", async () => {
    h.settings.mockRejectedValue(new Error("403 Forbidden"));
    mountScreen();
    expect((await screen.findByTestId("checklist-approvals-unavailable")).textContent).toContain(READ_GATE_MSG.approvalsFailed);
    const button = screen.getByTestId(COMPLETE) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(executePlan).not.toHaveBeenCalled();
    // The rest of the screen is still there.
    expect(screen.getByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeTruthy();
  });

  it("UT-CHKLST-940 a task without an approval completes through the real write hook: one guarded update, then the screen reloads", async () => {
    mountScreen();
    // The button is re-created when the settings arrive (its tooltip wrapper goes away), so it is looked up again.
    await screen.findByTestId(COMPLETE);
    await waitFor(() => expect((screen.getByTestId(COMPLETE) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId(COMPLETE));
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(h.sent[0]!.writes).toHaveLength(1);
    expect(h.sent[0]!.writes[0]).toMatchObject({ op: "update", id: "cl-1", guarded: true, data: { vsb_taskstate: CHOICE_PROCESS.taskState.completed } });
    // The reload after the write re-read the rows.
    await waitFor(() => expect(h.rows.mock.calls.length).toBeGreaterThan(1));
  });

  it("UT-CHKLST-941 a failed write shows the canvas error text with the cause, keeps the screen and re-enables the buttons", async () => {
    h.sendError = new Error("HTTP 403");
    mountScreen();
    // The button is re-created when the settings arrive (its tooltip wrapper goes away), so it is looked up again.
    await screen.findByTestId(COMPLETE);
    await waitFor(() => expect((screen.getByTestId(COMPLETE) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId(COMPLETE));
    const bar = await screen.findByTestId("checklist-write-error");
    expect(bar.textContent).toContain("Task state could not be changed");
    expect(bar.textContent).toContain("HTTP 403");
    expect(screen.getByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeTruthy();
    await waitFor(() => expect((screen.getByTestId(COMPLETE) as HTMLButtonElement).disabled).toBe(false));
  });

  it("UT-CHKLST-942 the usual visit writes nothing: no plan is sent and no blocking overlay opens (C5)", async () => {
    mountScreen();
    await screen.findByTestId(COMPLETE);
    await waitFor(() => expect(h.count).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(executePlan).not.toHaveBeenCalled();
    expect(document.querySelector("[role='dialog'][aria-busy='true']")).toBeNull();
    // A visit does not refetch the states or the gates: each was read once.
    expect(h.states).toHaveBeenCalledTimes(1);
    expect(h.gates).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKLST-943 a failed first read of the checklist is the error page with a working Refresh; the data then loads", async () => {
    h.rows.mockRejectedValueOnce(new Error("503"));
    mountScreen();
    expect(await screen.findByText("Checklist data is unavailable")).toBeTruthy();
    fireEvent.click(screen.getByTestId("empty-state-action"));
    expect(await screen.findByTestId(COMPLETE)).toBeTruthy();
    expect(screen.queryByText("Checklist data is unavailable")).toBeNull();
  });

  it("UT-CHKLST-944 a failed REFRESH of a screen that has its data keeps the screen and shows the banner (C4)", async () => {
    mountScreen();
    await screen.findByTestId(COMPLETE);
    h.trackings.mockRejectedValue(new Error("network"));
    fireEvent.click(screen.getByTestId("but_Project_States_CheckList_Refresh"));
    expect((await screen.findByTestId("checklist-data-unavailable")).textContent).toContain(READ_GATE_MSG.refreshFailed);
    expect(screen.getByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeTruthy();
    expect(screen.queryByText("Checklist data is unavailable")).toBeNull();
  });
});
