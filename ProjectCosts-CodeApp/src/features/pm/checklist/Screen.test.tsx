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
  ARIA, CHECKLIST_COL, MSG, PAGE_LOCK_TITLE, SCREEN_TEXT, TRACKING_COL, UI,
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
  /** useChecklistWrites().progress / .error: what the write hook is showing right now. */
  progress: null as string | null,
  writeError: null as string | null,
  patchRow: vi.fn(async (..._a: unknown[]) => [] as string[]),
  saveTransition: vi.fn(async (_r: unknown, _after?: { onWritten: (ok: boolean) => void }) => [] as string[] | null),
  returnToPrevious: vi.fn(async (_r: unknown) => [] as string[]),
  changeTerminal: vi.fn(async (..._a: unknown[]) => [] as string[]),
  prepareCluster: vi.fn(async (..._a: unknown[]) => [] as string[]),
  refresh: vi.fn(async (_p?: string) => undefined),
  requestApproval: vi.fn(async (_r: unknown) => [] as string[]),
  cancelGateApproval: vi.fn(async (_r: unknown) => [] as string[]),
  cancelChecklistApproval: vi.fn(async (_r: unknown) => [] as string[]),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    projectId: "p1", locale: "en-US", loading: false,
    envVars: { vsb_ProjectManagementAppID: "app-1" }, session: { fullName: "Ada Lovelace" },
  }),
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
    progress: state.progress, error: state.writeError, success: null, clear: () => {},
    backfill: vi.fn(), prepareCluster: state.prepareCluster, patchRow: state.patchRow,
    saveTransition: state.saveTransition, returnToPrevious: state.returnToPrevious,
    changeTerminal: state.changeTerminal, refresh: state.refresh,
    requestApproval: state.requestApproval, cancelGateApproval: state.cancelGateApproval,
    cancelChecklistApproval: state.cancelChecklistApproval,
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
  for (const f of [
    state.patchRow, state.saveTransition, state.returnToPrevious, state.changeTerminal, state.prepareCluster,
    state.requestApproval, state.cancelGateApproval, state.cancelChecklistApproval,
  ]) f.mockClear();
  state.error = undefined;
  state.progress = null;
  state.writeError = null;
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
    // The save popup carries the success text; no green bar afterwards (PO, 3 Nov 2026).
    expect(texts.progress).toBe(MSG.taskChanged);
    expect(texts.success).toBeUndefined();
  });

  it("UT-CHKLST-904 a task with an active approval opens the panel; Request Approval needs a comment, then starts the checklist flow (D81)", async () => {
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
    // `DisplayMode`: the comment error label hides the button's Edit mode (Y:5452) — empty at first.
    expect(request.disabled).toBe(true);
    // The hover text is the selected cluster's name, as on the canvas (PO, 3 Nov 2026).
    expect(request.title).toBe("Draft");
    expect(request.getAttribute("aria-label")).toBe(ARIA.requestApproval);
    fireEvent.change(screen.getByTestId("txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1"), { target: { value: "Go" } });
    await waitFor(() => expect(request.disabled).toBe(false));
    fireEvent.click(request);
    await waitFor(() => expect(state.requestApproval).toHaveBeenCalledTimes(1));
    const req = state.requestApproval.mock.calls[0]![0] as Record<string, unknown>;
    // A formal approval shows the due-date picker, so its default date travels (`If(dtp.Visible, dtp.SelectedDate, Blank())`).
    expect(req).toMatchObject({
      kind: "checklist", checkListDefaultApprovalId: "s1", currentStateId: "ps-0", approvalRequested: true, comment: "Go",
      approvalDueDate: expect.any(String),
    });
    expect((req.row as ChecklistRow).id).toBe("cl-1");
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

  it("UT-CHKLST-907 a running gate approval: Cancel Approval Request starts the cancellation flow with the app id and the user; Reset is hidden (D81)", async () => {
    renderScreen({
      trackings: [trackingRow(0, ACS.completed), trackingRow(1, ACS.completed), trackingRow(2, ACS.inProgress, { flowRunId: "run-1", flowApprovalId: "ap-1", approvalComment: "Ready" })],
      gates: [{ id: "g2", clusterStateId: "ps-2", approvalMode: MODE.formalApproval, gateActive: true, portfolioManagerId: null,
        portfolioManagerMail: "pm@x", defaultApprovals: null, defaultContributors: null, defaultNotifications: null }],
    });
    const cancel = screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_CancelApproval") as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(cancel.title).toBe(UI.cancelApprovalRequestTooltip);
    expect(screen.queryByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1")).toBeNull();
    expect(screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster").textContent)
      .toBe("View Cluster 3 Request History");
    fireEvent.click(cancel);
    await waitFor(() => expect(state.cancelGateApproval).toHaveBeenCalledTimes(1));
    const req = state.cancelGateApproval.mock.calls[0]![0] as { state: { name: string }; comment: string; appId: string; userDisplayName: string; gate: { id: string } | null; previous: { name: string } | null; next: { name: string } | null };
    expect(req.state.name).toBe("Cluster 2");
    expect(req.comment).toBe("Ready");
    expect(req.appId).toBe("app-1");
    expect(req.userDisplayName).toBe("Ada Lovelace");
    expect(req.gate?.id).toBe("g2");
    expect([req.previous?.name, req.next?.name]).toEqual(["Cluster 1", "Cluster 3"]);
  });

  it("UT-CHKLST-907b a running gate approval with no comment keeps Cancel Approval Request disabled (the comment error label)", () => {
    renderScreen({
      trackings: [trackingRow(0, ACS.completed), trackingRow(1, ACS.completed), trackingRow(2, ACS.inProgress, { flowRunId: "run-1" })],
      gates: [{ id: "g2", clusterStateId: "ps-2", approvalMode: MODE.formalApproval, gateActive: true, portfolioManagerId: null,
        portfolioManagerMail: null, defaultApprovals: null, defaultContributors: null, defaultNotifications: null }],
    });
    expect((screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_CancelApproval") as HTMLButtonElement).disabled).toBe(true);
  });

  it("UT-CHKLST-913 the row's ✕ on a pending checklist approval starts the checklist cancellation flow for that row (D81)", async () => {
    renderScreen({
      rows: [task({ approvalChecklistState: ACS.inProgress, flowRunId: "run-1", flowApprovalId: "ap-1" })],
      settings: [{
        id: "s1", projectDefaultChecklistId: "tpl-1", approvalMode: MODE.formalApproval, gateActive: true,
        portfolioManagerMail: "pm@x", defaultApprovers: null, defaultContributors: null, defaultNotifications: null,
      }],
    });
    const x = screen.getByTestId("ico_Checklist_DisplayProject_Body_Content_ListRow_CancelApproval") as HTMLButtonElement;
    expect(x.disabled).toBe(false);
    expect(x.title).toBe(UI.cancelApproval);
    fireEvent.click(x);
    await waitFor(() => expect(state.cancelChecklistApproval).toHaveBeenCalledTimes(1));
    expect((state.cancelChecklistApproval.mock.calls[0]![0] as ChecklistRow).id).toBe("cl-1");
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

  /** Opens the cluster-move panel and returns a `rerender` that keeps the same tree (the write hook is mocked). */
  const openMovePanel = async () => {
    // A comment is required for the Save to be enabled (UT-CHKLST-906).
    const view = renderScreen({ trackings: [trackingRow(0, ACS.inProgress, { approvalComment: "Ready" })] });
    fireEvent.click(screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster"));
    await screen.findByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save");
    const again = () => view.rerender(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter><CheckListScreen /></MemoryRouter>
      </FluentProvider>,
    );
    return again;
  };
  const panelOpen = () => screen.queryByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save") !== null;

  it("UT-CHKLST-914 the write spinner is drawn through a portal, above the open panel, not inside the page (canvas: last control, full screen)", async () => {
    const again = await openMovePanel();
    state.progress = MSG.clusterSaving("Draft");
    again();
    const text = screen.getByText(MSG.clusterSaving("Draft"));
    expect(text.textContent).toBe("Cluster data 'Draft' will be save, please wait...");
    const overlay = text.closest("[aria-busy='true']") as HTMLElement;
    expect(overlay).not.toBeNull();
    // Fluent's Portal mount node (z-index 1000000, where the drawer lives) is a child of <body>, never of the screen's root.
    expect(screen.getByTestId("Project General CheckList Screen").contains(overlay)).toBe(false);
  });

  it("UT-CHKLST-915 while the move is being saved, the open panel's ✕ is disabled and Escape does not close it", async () => {
    const again = await openMovePanel();
    state.progress = MSG.clusterSaving("Draft");
    again();
    const close = screen.getAllByTestId("panel-close")[0] as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    expect(panelOpen()).toBe(true);
  });

  it("UT-CHKLST-916 a failed move closes the panel too (canvas Select(…_Reset) runs after the IfError), so the error is not hidden behind it", async () => {
    state.saveTransition.mockResolvedValueOnce(null as never);
    await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(state.saveTransition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(panelOpen()).toBe(false));
  });

  it("UT-CHKLST-917 a successful move closes the panel as well", async () => {
    await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(state.saveTransition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(panelOpen()).toBe(false));
  });

  /** A saveTransition that reports its writes over, then keeps running (the awaited reload) until `release()`. */
  const heldSave = (ok: boolean) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    state.saveTransition.mockImplementationOnce(async (_r, after) => {
      after?.onWritten(ok);
      await held;
      return ok ? [] : null;
    });
    return release;
  };

  it("UT-CHKLST-919 D106: the panel closes the moment the writes land, while the reload is still running", async () => {
    const release = heldSave(true);
    await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(state.saveTransition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(panelOpen()).toBe(false));
    release();
  });

  it("UT-CHKLST-920 D106: a failed write closes the panel while the reload is still running", async () => {
    const release = heldSave(false);
    await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(panelOpen()).toBe(false));
    release();
  });

  it("UT-CHKLST-921 D106: Save hands the write hook the callback that closes the panel", async () => {
    await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(state.saveTransition).toHaveBeenCalledTimes(1));
    expect(typeof state.saveTransition.mock.calls[0]![1]?.onWritten).toBe("function");
  });

  it("UT-CHKLST-922 D106: the spinner of the reload phase is portalled above the page and the panel is already closed behind it", async () => {
    const release = heldSave(true);
    const again = await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(panelOpen()).toBe(false));
    state.progress = MSG.loading;
    again();
    const overlay = screen.getByText(MSG.loading).closest("[aria-busy='true']") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(screen.getByTestId("Project General CheckList Screen").contains(overlay)).toBe(false);
    expect(panelOpen()).toBe(false);
    release();
  });

  it("UT-CHKLST-918 the write error bar shows in the page once the panel is closed", async () => {
    state.saveTransition.mockResolvedValueOnce(null as never);
    const again = await openMovePanel();
    fireEvent.click(screen.getByTestId("pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"));
    await waitFor(() => expect(panelOpen()).toBe(false));
    state.writeError = "Error: Project Status was updated.  Internal error";
    again();
    expect(screen.getByTestId("checklist-write-error").textContent).toContain("Project Status was updated");
    expect(panelOpen()).toBe(false);
  });
});
