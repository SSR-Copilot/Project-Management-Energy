// @vitest-environment jsdom
/**
 * Render tests for the connected Project General CheckList Screen (D29). `./hooks` is mocked with
 * fixed rows; the write requests handed to the write hook are asserted, and the excluded approval
 * controls are checked visible-but-disabled.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import {
  ARIA, CHECKLIST_COL, EXCLUDED, MSG, PAGE_LOCK_TITLE, SCREEN_TEXT, TRACKING_COL, UI,
  type ChecklistApprovalSetting, type ChecklistProject, type ChecklistRow, type GateSetting,
  type ProjectStateRef, type TrackingRow,
} from "./rules";

const ACS = CHOICE_PROCESS.approvalClusterState;
const TASK = CHOICE_PROCESS.taskState;
const MODE = CHOICE_PROCESS.approvalMode;

const NAMES = ["Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"];
const STATES: ProjectStateRef[] = [
  ...NAMES.map((name, i) => ({ id: `ps-${i}`, name, order: i, isVisibleOnChecklist: true, clusterDescription: null })),
  { id: "ps-ab", name: "Abandoned", order: 90, isVisibleOnChecklist: false, clusterDescription: null },
  { id: "ps-in", name: "Inactive/ On-hold", order: 91, isVisibleOnChecklist: false, clusterDescription: null },
];

const baseProject: ChecklistProject = {
  id: "p1", projectName: "Windpark Nord", projectNumber: "DE-0001", startCluster: 0,
  clusterStateId: "ps-0", clusterStateName: "Draft", approvalState: null, countryId: "c1",
  technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: "bu-1", totalCapacity: 20, netYieldP50: 1000,
  milestones: {
    projectStartDate: "2026-01-01", feasibilityStudies: "2026-03-01", projectDevelopmentStarted: null,
    applicationSubmitted: null, legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};

const trackingRow = (i: number, s: number, over: Partial<TrackingRow> = {}): TrackingRow => ({
  id: `t-${i}`, name: NAMES[i]!, clusterStateId: `ps-${i}`, clusterStateName: NAMES[i]!, approvalClusterState: s,
  clusterStepState: null, approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null, ...over,
});

const task = (over: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: "cl-1", title: "Land secured", clusterStateId: "ps-0", gateRelevance: true, holdingDescription: "All plots",
  isCompletionDate: false, completionDate: null, taskState: TASK.none, approvalChecklistState: null, note: null,
  sort: 1, projectDefaultChecklistId: "tpl-1", flowRunId: null, flowApprovalId: null, ...over,
});

const state = vi.hoisted(() => ({
  project: null as unknown,
  trackings: [] as unknown[],
  gates: [] as unknown[],
  rows: [] as unknown[],
  settings: [] as unknown[],
  error: undefined as unknown,
  patchRow: vi.fn(async (..._a: unknown[]) => [] as string[]),
  saveTransition: vi.fn(async (_r: unknown) => [] as string[]),
  returnToPrevious: vi.fn(async (_r: unknown) => [] as string[]),
  changeTerminal: vi.fn(async (..._a: unknown[]) => [] as string[]),
  prepareCluster: vi.fn(async (..._a: unknown[]) => [] as string[]),
  refresh: vi.fn(async (_p?: string) => undefined),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p1", locale: "en-US", loading: false, envVars: {} }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  useChecklistProject: () => ({ ...ok(state.project), error: state.error }),
  useClusterSequence: () => ({ ...ok({ states: STATES, trackings: state.trackings, gates: state.gates }), isFetching: false }),
  useClusterChecklist: () => ok(state.rows),
  useChecklistApprovalSettings: () => ok(state.settings),
  useHistory: () => ok([]),
  useChecklistOrchestration: () => ({ restart: () => {} }),
  useChecklistWrites: () => ({
    progress: null, error: null, success: null, clear: () => {},
    backfill: vi.fn(), prepareCluster: state.prepareCluster, patchRow: state.patchRow,
    saveTransition: state.saveTransition, returnToPrevious: state.returnToPrevious,
    changeTerminal: state.changeTerminal, refresh: state.refresh,
  }),
}));

import CheckListScreen from "./Screen";

function renderScreen(opts: {
  project?: ChecklistProject; trackings?: TrackingRow[]; gates?: GateSetting[];
  rows?: ChecklistRow[]; settings?: ChecklistApprovalSetting[];
} = {}) {
  state.project = opts.project ?? baseProject;
  state.trackings = opts.trackings ?? [trackingRow(0, ACS.inProgress)];
  state.gates = opts.gates ?? [];
  state.rows = opts.rows ?? [task()];
  state.settings = opts.settings ?? [];
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter><CheckListScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

afterEach(() => {
  cleanup();
  for (const f of [state.patchRow, state.saveTransition, state.returnToPrevious, state.changeTerminal, state.prepareCluster]) f.mockClear();
  state.error = undefined;
});

describe("Project General CheckList Screen (connected)", () => {
  it("UT-CHKLST-901 renders the stepper, the canvas captions and no not-connected notice", () => {
    renderScreen();
    expect(screen.getByTestId("Project General CheckList Screen")).toBeTruthy();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.getByTestId("lbl_Checklist_DisplayProject_Body_Content_Title").textContent).toBe("Draft Checklist");
    for (const header of Object.values(UI.header)) {
      expect(screen.getByRole("columnheader", { name: new RegExp(header) })).toBeTruthy();
    }
    expect(screen.getByTestId("cmp_CheckList_Project_States").children).toHaveLength(7);
    const next = screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster");
    expect(next.textContent).toBe("Move to Cluster 1");
    expect(next.getAttribute("aria-label")).toBe(ARIA.nextCluster);
    // PO, 20 Oct 2026: the one refresh is the icon at the top right; no "Refresh" command bar.
    expect(screen.queryByRole("toolbar", { name: ARIA.commandBar })).toBeNull();
    expect(screen.getByTestId("but_Project_States_CheckList_Refresh")).toBeTruthy();
  });

  it("UT-CHKLST-902 the page lock lists its sections and disables the commands", () => {
    renderScreen({ project: { ...baseProject, projectNumber: null, netYieldP50: 0 } });
    const lock = screen.getByTestId("con_Milestones_Page_LockMessage_3");
    expect(within(lock).getByText(PAGE_LOCK_TITLE)).toBeTruthy();
    expect(screen.getByTestId("lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_11").textContent).toBe("• General");
    expect(screen.getByTestId("lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_14").textContent).toBe("• Production");
    expect((screen.getByTestId("but_Project_States_CheckList_Refresh") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("but_Checklist_DisplayProject_Body_Content_ListRow_Complete") as HTMLButtonElement).disabled).toBe(true);
  });

  it("UT-CHKLST-903 Complete on a task without an approval patches it straight to Completed", () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("but_Checklist_DisplayProject_Body_Content_ListRow_Complete"));
    expect(state.patchRow).toHaveBeenCalledTimes(1);
    const [rowArg, data, texts] = state.patchRow.mock.calls[0] as [ChecklistRow, Record<string, unknown>, { progress: string; success: string }];
    expect(rowArg.id).toBe("cl-1");
    expect(data).toEqual({ [CHECKLIST_COL.taskState]: TASK.completed });
    expect(texts.progress).toBe(MSG.taskChanging("Land secured"));
    expect(texts.success).toBe(MSG.taskChanged);
  });

  it("UT-CHKLST-904 a task with an active approval opens the panel; Request Approval is visible but disabled", async () => {
    renderScreen({ settings: [{
      id: "s1", projectDefaultChecklistId: "tpl-1", approvalMode: MODE.formalApproval, gateActive: true,
      portfolioManagerMail: "pm@x", defaultApprovers: null, defaultContributors: null, defaultNotifications: null,
    }] });
    const button = screen.getByTestId("but_Checklist_DisplayProject_Body_Content_ListRow_Complete");
    expect(button.textContent).toBe("Approval");
    fireEvent.click(button);
    expect(state.patchRow).not.toHaveBeenCalled();
    expect(await screen.findByText("Request Check List completion approval")).toBeTruthy();
    const request = await screen.findByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_RequestApproval") as HTMLButtonElement;
    expect(request.disabled).toBe(true);
    expect(request.title).toBe(EXCLUDED.requestApproval);
    expect(request.getAttribute("aria-label")).toBe(ARIA.requestApproval);
    // SOURCE DEFECT fix: no Save in Checklist Completion mode.
    expect(screen.queryByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save")).toBeNull();
  });

  it("UT-CHKLST-905 In Progress toggles the task and resets its approval state", () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("but_Checklist_DisplayProject_Body_Content_ListRow_InProgress"));
    const [, data] = state.patchRow.mock.calls[0] as [ChecklistRow, Record<string, unknown>];
    expect(data).toEqual({ [CHECKLIST_COL.taskState]: TASK.inProgress, [CHECKLIST_COL.approvalChecklistState]: ACS.notStarted });
  });

  it("UT-CHKLST-906 the ungated move: the panel Save sends the transition with the tracking's comment", async () => {
    renderScreen({ trackings: [trackingRow(0, ACS.inProgress, { approvalComment: "Ready" })] });
    fireEvent.click(screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster"));
    expect(await screen.findByText("Cluster Movement to Cluster 1")).toBeTruthy();
    const save = await screen.findByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save");
    expect(save.getAttribute("aria-label")).toBe(ARIA.save);
    expect(screen.getByTestId("txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1").getAttribute("aria-label")).toBe(ARIA.comment);
    fireEvent.click(save);
    await waitFor(() => expect(state.saveTransition).toHaveBeenCalledTimes(1));
    const req = state.saveTransition.mock.calls[0]![0] as { state: { name: string }; next: { name: string }; comment: string; approvalDueDate: string | null };
    expect(req.state.name).toBe("Draft");
    expect(req.next.name).toBe("Cluster 1");
    expect(req.comment).toBe("Ready");
    expect(req.approvalDueDate).toBeNull();
  });

  it("UT-CHKLST-907 a running gate approval: Cancel Approval Request is visible but disabled, Reset is hidden", () => {
    renderScreen({
      trackings: [trackingRow(0, ACS.completed), trackingRow(1, ACS.completed), trackingRow(2, ACS.inProgress, { flowRunId: "run-1" })],
      gates: [{ id: "g2", clusterStateId: "ps-2", approvalMode: MODE.formalApproval, gateActive: true, portfolioManagerId: null,
        portfolioManagerMail: null, defaultApprovals: null, defaultContributors: null, defaultNotifications: null }],
    });
    const cancel = screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_CancelApproval") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.title).toBe(EXCLUDED.cancelGateApproval);
    expect(screen.queryByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1")).toBeNull();
    expect(screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster").textContent)
      .toBe("View Cluster 3 Request History");
  });

  it("UT-CHKLST-908 Reset to … sits in the main bar and confirms before returning", async () => {
    renderScreen({ trackings: [trackingRow(0, ACS.completed), trackingRow(1, ACS.completed), trackingRow(2, ACS.inProgress)] });
    const reset = screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1");
    expect(reset.textContent).toBe("Reset to Cluster 1");
    expect(reset.getAttribute("aria-label")).toBe(ARIA.returnToPrevious);
    fireEvent.click(reset);
    expect(await screen.findByText('Do you really want to return to "Cluster 1"?')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI.yes }));
    await waitFor(() => expect(state.returnToPrevious).toHaveBeenCalledTimes(1));
    const req = state.returnToPrevious.mock.calls[0]![0] as { state: { name: string }; previous: { name: string } };
    expect([req.state.name, req.previous.name]).toEqual(["Cluster 2", "Cluster 1"]);
  });

  it("UT-CHKLST-909 Abandon stages the Abandoned state and confirms", async () => {
    renderScreen();
    const abandon = screen.getByTestId(ARIA.abandon);
    expect(abandon.getAttribute("aria-label")).toBe(ARIA.abandon);
    fireEvent.click(abandon);
    expect(await screen.findByText('Do you really want to change Cluster State to "Abandoned"?')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI.yes }));
    await waitFor(() => expect(state.changeTerminal).toHaveBeenCalledTimes(1));
    const staging = state.changeTerminal.mock.calls[0]![1] as { approvalClusterState: number; targetClusterStateId: string };
    expect(staging).toMatchObject({ approvalClusterState: ACS.abandoned, targetClusterStateId: "ps-ab" });
  });

  it("UT-CHKLST-910 another technology shows only the tip", () => {
    renderScreen({ project: { ...baseProject, technology: CHOICE_PROCESS.technology.bess } });
    expect(screen.getByText(UI.technologyTip)).toBeTruthy();
    expect(screen.queryByTestId("gal_Checklist_DisplayProject_Body_General_Content")).toBeNull();
    expect(screen.queryByTestId("lbl_Checklist_DisplayProject_Body_Content_Title")).toBeNull();
  });

  it("UT-CHKLST-911 the comment form saves the trimmed note on the task", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("ico_Checklist_DisplayProject_Body_Content_ListRow_Comments"));
    const box = await screen.findByTestId("txt_CheckList_RightPanel_BodyForm_Comments");
    fireEvent.change(box, { target: { value: "  waiting on DSO  " } });
    fireEvent.click(await screen.findByTestId("pcf_btn_CheckList_RightPanel_Checklist_Form_Buttons_Save"));
    await waitFor(() => expect(state.patchRow).toHaveBeenCalledTimes(1));
    const [, data] = state.patchRow.mock.calls[0] as [ChecklistRow, Record<string, unknown>];
    expect(data).toEqual({ [CHECKLIST_COL.comments]: "waiting on DSO" });
  });

  it("UT-CHKLST-912 a failed read shows the load-error state (rule 19)", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
    expect(TRACKING_COL.id).toBe("vsb_projectstatetrackingid");
  });
});
