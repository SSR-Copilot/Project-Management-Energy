// @vitest-environment jsdom
/**
 * UT-CHKPERF-030.. — what the Cluster Check List re-computes when the user types in the panel's comment box (A1, D138).
 * The two cluster sequences and the stepper cards used to be rebuilt on EVERY render, so every keystroke re-ran them. Counted on the
 * real `Screen.tsx` with `./hooks` mocked to stable data (as `Screen.test.tsx` does). BASELINE (dbc412d): every keystroke = +1 build of
 * each sequence.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
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
  id: `cl-${i}`, title: `Task ${i}`, clusterStateId: "ps-0", gateRelevance: true, holdingDescription: "All plots", isCompletionDate: false,
  completionDate: null, taskState: CHOICE_PROCESS.taskState.none, approvalChecklistState: null, note: null, sort: i,
  projectDefaultChecklistId: `tpl-${i}`, flowRunId: null, flowApprovalId: null,
} as ChecklistRow));
const GATES: never[] = [];
const SETTINGS: never[] = [];
const EMPTY: never[] = [];

const counts = vi.hoisted(() => ({ operational: 0, display: 0, indexes: 0 }));
vi.mock("./rules", async (importOriginal) => {
  const m = await importOriginal<typeof import("./rules")>();
  return {
    ...m,
    buildOperationalSequence: (...a: Parameters<typeof m.buildOperationalSequence>) => { counts.operational += 1; return m.buildOperationalSequence(...a); },
    buildDisplaySequence: (...a: Parameters<typeof m.buildDisplaySequence>) => { counts.display += 1; return m.buildDisplaySequence(...a); },
    ...("approvalIndexes" in m
      ? { approvalIndexes: (...a: Parameters<typeof m.approvalIndexes>) => { counts.indexes += 1; return m.approvalIndexes(...a); } }
      : {}),
  };
});
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
  useChecklistWrites: () => ({
    progress: null, error: null, success: null, clear: () => {}, backfill: vi.fn(), prepareCluster: vi.fn(), patchRow: vi.fn(),
    saveTransition: vi.fn(), returnToPrevious: vi.fn(), changeTerminal: vi.fn(), refresh: vi.fn(), requestApproval: vi.fn(),
    cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
  }),
}));
import CheckListScreen from "./Screen";

afterEach(() => { cleanup(); counts.operational = 0; counts.display = 0; counts.indexes = 0; });

describe("Cluster Check List — typing in the panel comment (A1)", () => {
  it("UT-CHKPERF-030 ten keystrokes in the comment box do not rebuild the sequences or the approval indexes", async () => {
    render(<FluentProvider theme={vsbTheme}><MemoryRouter><CheckListScreen /></MemoryRouter></FluentProvider>);
    fireEvent.click(screen.getByTestId("pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster"));
    const box = await screen.findByTestId("txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1");
    const before = { ...counts };
    for (let i = 1; i <= 10; i += 1) fireEvent.change(box, { target: { value: "x".repeat(i) } });
    expect((box as HTMLTextAreaElement).value).toBe("xxxxxxxxxx");
    expect(counts.operational - before.operational).toBe(0);
    expect(counts.display - before.display).toBe(0);
    expect(counts.indexes - before.indexes).toBe(0);
  });

  it("UT-CHKPERF-031 the first paint builds each sequence once", () => {
    render(<FluentProvider theme={vsbTheme}><MemoryRouter><CheckListScreen /></MemoryRouter></FluentProvider>);
    expect(counts.operational).toBe(1);
    expect(counts.display).toBe(1);
  });
});
