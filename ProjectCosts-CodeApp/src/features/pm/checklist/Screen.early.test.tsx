// @vitest-environment jsdom
/**
 * UT-CHKPERF-080.. — the Cluster Check List screen with its REAL hooks while the gates are still on their way (D150: `earlyRows`,
 * `earlyVisit`). The gates (and their Entra lookups) are held back by a promise the test releases, so nothing here depends on timing:
 * with the switches on the cluster's rows are read and the visit's own work starts BEFORE the gates answer; the screen still shows only
 * the loader until they do (D127 §1); with the switches off, nothing starts until they have answered, as before.
 * Same stubs as `Screen.realwrites.test.tsx`: the loaders, the flows and `executePlan` (the sender).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import { CHECKLIST_PERF_ALL_OFF, setChecklistPerfFlags } from "@/data/checklistPerfFlags";

const h = vi.hoisted(() => ({
  project: vi.fn<(id: string) => Promise<unknown>>(),
  states: vi.fn<() => Promise<unknown[]>>(),
  trackings: vi.fn<(id: string) => Promise<unknown[]>>(),
  gates: vi.fn<(p: unknown) => Promise<unknown[]>>(),
  rows: vi.fn<(id: string, state: string) => Promise<unknown[]>>(),
  settings: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
  count: vi.fn<(id: string, state: string) => Promise<number>>(),
  templates: vi.fn<(p: unknown, state: string) => Promise<unknown[]>>(),
  history: vi.fn<(d: unknown) => Promise<unknown[]>>(),
  sent: [] as WritePlan[],
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
  listClusterTemplates: (p: unknown, s: string) => h.templates(p, s),
  listHistory: (d: unknown) => h.history(d),
}));

import CheckListScreen from "./Screen";
import type { ChecklistProject, ChecklistRow, ProjectStateRef, TrackingRow } from "./rules";

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
const COMPLETE = "but_Checklist_DisplayProject_Body_Content_ListRow_Complete";
const STEPPER = "cmp_CheckList_Project_States";

/** The gates stay pending until `release()`. */
let releaseGates: () => void = () => {};
const holdGates = () => { h.gates.mockReturnValue(new Promise<unknown[]>((resolve) => { releaseGates = () => resolve([]); })); };

function mountScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FluentProvider theme={vsbTheme}><MemoryRouter><CheckListScreen /></MemoryRouter></FluentProvider>
    </QueryClientProvider>,
  );
}
const settle = () => new Promise<void>((r) => { setTimeout(r, 60); });

beforeEach(() => {
  h.sent = [];
  h.project.mockResolvedValue(PROJECT);
  h.states.mockResolvedValue(STATES);
  h.trackings.mockResolvedValue([TRACKING]);
  h.rows.mockResolvedValue([TASK]);
  h.settings.mockResolvedValue([]);
  h.count.mockResolvedValue(1);
  h.templates.mockResolvedValue([]);
  h.history.mockResolvedValue([]);
  holdGates();
});
afterEach(() => { cleanup(); setChecklistPerfFlags(null); vi.clearAllMocks(); });

describe("the screen while the gates are still on their way (earlyRows, earlyVisit)", () => {
  it("UT-CHKPERF-080 the cluster's rows are read BEFORE the gates answer, and the screen still shows only the loader until they do (D127 §1)", async () => {
    mountScreen();
    await waitFor(() => expect(h.rows).toHaveBeenCalledWith("p1", "ps-0"));
    await settle();
    expect(h.gates).toHaveBeenCalled();
    expect(screen.getByTestId("checklist-loading")).toBeTruthy();
    // Nothing derived from the early data is drawn: an empty stepper (the screen builds no steps while loading), no task rows, no cluster actions.
    expect(screen.queryByTestId(STEPPER)?.children.length ?? 0).toBe(0);
    expect(screen.queryAllByTestId(COMPLETE)).toHaveLength(0);
    expect(screen.queryByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeNull();

    releaseGates();
    await waitFor(() => expect(screen.queryByTestId("checklist-loading")).toBeNull());
    expect(screen.getByTestId(STEPPER).children).toHaveLength(7);
    await waitFor(() => expect((screen.getAllByTestId(COMPLETE)[0] as HTMLButtonElement).disabled).toBe(false));
    // The rows were read once, for the same cluster the screen then selected: no second read when the gates arrived.
    expect(h.rows).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKPERF-081 with earlyRows off the rows wait for the gates, as before", async () => {
    setChecklistPerfFlags({ ...CHECKLIST_PERF_ALL_OFF });
    mountScreen();
    await waitFor(() => expect(h.gates).toHaveBeenCalled());
    await settle();
    expect(h.rows).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
    releaseGates();
    await waitFor(() => expect(h.rows).toHaveBeenCalledWith("p1", "ps-0"));
    expect(await screen.findByTestId(STEPPER)).toBeTruthy();
  });

  it("UT-CHKPERF-082 the visit's own check (the rows count) starts without the gates, and a usual visit still writes nothing", async () => {
    mountScreen();
    await waitFor(() => expect(h.count).toHaveBeenCalledWith("p1", "ps-0"));
    expect(screen.getByTestId("checklist-loading")).toBeTruthy();
    releaseGates();
    await screen.findByTestId(STEPPER);
    await settle();
    expect(h.sent).toEqual([]);
    expect(h.count).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[role='dialog'][aria-busy='true']")).toBeNull();
  });

  it("UT-CHKPERF-083 a first visit copies the templates without waiting for the gates, with the same writes (the tracking exists: the checklist rows only)", async () => {
    h.rows.mockResolvedValue([]);
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([
      { id: "tpl-1", name: "A", clusterStateId: "ps-0", gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: 1 },
      { id: "tpl-2", name: "B", clusterStateId: "ps-0", gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: 2 },
    ]);
    mountScreen();
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(screen.getByTestId("checklist-loading")).toBeTruthy(); // the gates have still not answered
    expect(h.sent[0]!.writes.map((w) => w.op)).toEqual(["create", "create"]);
    expect(h.sent[0]!.writes.every((w) => w.concurrencyLimit === 16)).toBe(true);
    releaseGates();
    await screen.findByTestId(STEPPER);
    await settle();
    // `current` replaced the early entry for the same cluster: the visit did not run twice.
    expect(h.sent).toHaveLength(1);
    expect(h.count).toHaveBeenCalledTimes(1);
    expect(h.templates).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKPERF-084 with the switches off a first visit starts its writes only after the gates, at the old width", async () => {
    setChecklistPerfFlags({ ...CHECKLIST_PERF_ALL_OFF });
    h.rows.mockResolvedValue([]);
    h.count.mockResolvedValue(0);
    h.templates.mockResolvedValue([
      { id: "tpl-1", name: "A", clusterStateId: "ps-0", gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: 1 },
    ]);
    mountScreen();
    await waitFor(() => expect(h.gates).toHaveBeenCalled());
    await settle();
    expect(h.sent).toEqual([]);
    releaseGates();
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(h.sent[0]!.writes.every((w) => w.concurrencyLimit === undefined)).toBe(true);
  });

  it("UT-CHKPERF-086 the Draft back-fill of a project that starts later also starts without the gates, runs once, and the visit that follows it does not run twice", async () => {
    h.project.mockResolvedValue({ ...PROJECT, startCluster: 2 });
    mountScreen();
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(screen.getByTestId("checklist-loading")).toBeTruthy(); // the gates have still not answered
    expect(h.sent[0]!.writes.some((w) => w.entitySet === "vsb_projectstatetrackings")).toBe(true);
    releaseGates();
    await screen.findByTestId(STEPPER);
    await settle();
    expect(h.sent).toHaveLength(1);
    expect(h.count.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("UT-CHKPERF-085 a failed gates read still ends in the same error state, and the early rows do not hide it", async () => {
    h.gates.mockReset();
    h.gates.mockRejectedValue(new Error("503"));
    mountScreen();
    expect(await screen.findByText("Checklist data is unavailable")).toBeTruthy();
  });
});
