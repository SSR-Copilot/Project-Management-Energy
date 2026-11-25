// @vitest-environment jsdom
/**
 * Cluster Check List: what a keystroke in a panel re-renders (D162 B4, FE-P1-03). `./hooks` is mocked with stable data, as
 * in `Screen.perf.test.tsx`; the counts come from the `probeRender` seam (`src/test/renderCounts.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import type { ChecklistProject, ChecklistRow, ProjectStateRef, TrackingRow } from "./rules";

const ACS = CHOICE_PROCESS.approvalClusterState;
const NAMES = ["Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"];
const STATES: ProjectStateRef[] = NAMES.map((name, i) => ({ id: `ps-${i}`, name, order: i, isVisibleOnChecklist: true, clusterDescription: null }));
const PROJECT: ChecklistProject = {
  id: "p1", projectName: "Windpark Nord", projectNumber: "DE-0001", startCluster: 0, clusterStateId: "ps-0", clusterStateName: "Draft",
  approvalState: null, countryId: "c1", technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: "bu-1", totalCapacity: 20, netYieldP50: 1000,
  milestones: {
    projectStartDate: "2026-01-01", feasibilityStudies: "2026-03-01", projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};
const TRACKINGS: TrackingRow[] = [{
  id: "t-0", name: "Draft", clusterStateId: "ps-0", clusterStateName: "Draft", approvalClusterState: ACS.inProgress, clusterStepState: null,
  approvalComment: null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
} as TrackingRow];
const ROWS: ChecklistRow[] = Array.from({ length: 40 }, (_, i) => ({
  id: `cl-${i}`, title: `Task ${i}`, clusterStateId: "ps-0", gateRelevance: true, holdingDescription: "All plots", isCompletionDate: i === 0,
  completionDate: null, taskState: CHOICE_PROCESS.taskState.none, approvalChecklistState: null, note: null, sort: i,
  projectDefaultChecklistId: `tpl-${i}`, flowRunId: null, flowApprovalId: null,
} as ChecklistRow));
const GATES: never[] = [];
const SETTINGS: never[] = [];
const EMPTY: never[] = [];

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p1", locale: "en-US", loading: false, envVars: {}, session: { fullName: "Ada" } }),
}));
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
const SEQUENCE = { states: STATES, trackings: TRACKINGS, gates: GATES };
vi.mock("./hooks", () => ({
  useChecklistProject: () => ({ ...ok(PROJECT), isFetching: false }),
  useClusterSequence: () => ({ ...ok(SEQUENCE), isFetching: false }),
  useClusterChecklist: () => ok(ROWS),
  useChecklistApprovalSettings: () => ok(SETTINGS),
  useHistory: () => ok(EMPTY),
  useChecklistOrchestration: () => ({ restart: () => {} }),
  // A new object (and new functions) per render, as the real write hook returns.
  useChecklistWrites: () => ({
    progress: null, error: null, success: null, clear: () => {}, backfill: vi.fn(), prepareCluster: vi.fn(), patchRow: vi.fn(),
    saveTransition: vi.fn(), returnToPrevious: vi.fn(), changeTerminal: vi.fn(), refresh: vi.fn(), requestApproval: vi.fn(),
    cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
  }),
}));
import CheckListScreen from "./Screen";

let renders: RenderCounts;
beforeEach(() => { renders = countRenders(); });
afterEach(() => { renders.stop(); cleanup(); });

const renderScreen = () => render(<FluentProvider theme={vsbTheme}><MemoryRouter><CheckListScreen /></MemoryRouter></FluentProvider>);

describe("UT-CHK-FE Check List renders per keystroke (D162 B4, FE-P1-03)", () => {
  it("UT-CHK-FE-001 a keystroke in the cluster panel's comment renders neither the task table nor the stepper", async () => {
    renderScreen();
    expect(renders.of("ChecklistTaskTable")).toBeGreaterThan(0);
    expect(renders.of("ProjectStates")).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster"));
    const box = await screen.findByTestId("txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1");
    renders.reset();
    for (let i = 1; i <= 3; i += 1) fireEvent.change(box, { target: { value: "x".repeat(i) } });
    expect((box as HTMLTextAreaElement).value).toBe("xxx");
    expect(renders.of("ChecklistTaskTable")).toBe(0);
    expect(renders.of("ProjectStates")).toBe(0);
  });

  it("UT-CHK-FE-002 the table still follows its own state: the holding toggle and the date editor render it", async () => {
    renderScreen();
    renders.reset();
    fireEvent.click(screen.getByTestId("ico_Checklist_DisplayProject_Body_Content_OverviewHeader_HoldingText_Visibility"));
    expect(renders.of("ChecklistTaskTable")).toBe(1);
    expect(renders.of("ProjectStates")).toBe(0);
    renders.reset();
    fireEvent.click(screen.getByTestId("but_Checklist_DisplayProject_Body_Content_ListRow_CompletionDate"));
    expect(await screen.findByTestId("date_con_Checklist_DisplayProject_Body_Content_CompletionDate")).toBeTruthy();
    expect(renders.of("ChecklistTaskTable")).toBe(1);
  });
});
