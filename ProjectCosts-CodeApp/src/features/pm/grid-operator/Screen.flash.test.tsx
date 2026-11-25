// @vitest-environment jsdom
/**
 * Grid Operator: the success bar after a Save (D162 B4, FE-P2-08). It shows the job's own success text, goes after one
 * second, and its timer is cleared when the screen goes first (no `setFlash` on an unmounted screen).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import type { PlanJob } from "@/data/usePlanWrite";
import { BUTTON_CONTROL, FIELD_CONTROL, SAVE_SUCCESS, type GridOperatorProject, type GridOperatorRecord } from "./rules";

const project: GridOperatorProject = {
  id: "p-1", projectNumber: "DE-1021", endDate: "2059-12-31", projectStartDate: "2026-01-01",
  totalCapacity: 42.5, netYieldP50: 112400, clusterStateName: "Cluster 2", owningBusinessUnitId: "bu-de",
};
const record: GridOperatorRecord = {
  id: "g-1", operator: "Netze BW GmbH", voltageLevel: 110, expansionRequired: 952850000,
  expansionDetails: "New bay", substationConstructionRequired: 952850001, substationOperator: "VSB",
  lengthInternal: 1.5, diameterInternal: 12.5, lengthExternal: 8.5, diameterExternal: 240,
};
const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);
/** What the write hook reports as its last success text (the Screen must not read it from a stale render). */
const writeState = { success: null as string | null };

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_projects", "vsb_gridoperators"],
  GRID_OPERATOR_CAN_EDIT: true,
  useGridOperatorProject: () => ({ data: project, isLoading: false, error: undefined, connected: true }),
  useGridOperator: () => ({ data: record, isLoading: false, error: undefined, connected: true }),
  useGridOperatorWrites: () => ({ run, progress: null, error: null, success: writeState.success, clear: () => {} }),
}));

import GridOperatorScreen from "./Screen";

const renderScreen = () => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter initialEntries={["/project/grid-operator"]}><GridOperatorScreen /></MemoryRouter>
  </FluentProvider>,
);

async function editAndSave() {
  fireEvent.change(screen.getByTestId(FIELD_CONTROL.operator), { target: { value: "TenneT" } });
  const save = await waitFor(() => {
    const b = screen.getByTestId(BUTTON_CONTROL.save) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    return b;
  });
  fireEvent.click(save);
  return screen.findByTestId("grid-operator-write-success");
}

let setSpy: MockInstance<typeof window.setTimeout>;
let clearSpy: MockInstance<typeof window.clearTimeout>;
beforeEach(() => {
  run.mockClear();
  writeState.success = null;
  setSpy = vi.spyOn(window, "setTimeout");
  clearSpy = vi.spyOn(window, "clearTimeout");
});
afterEach(() => { setSpy.mockRestore(); clearSpy.mockRestore(); cleanup(); });

/** The ids of the one-second timers armed since the spy started. */
const flashTimers = () => setSpy.mock.calls
  .map((call, i) => ({ delay: call[1], id: setSpy.mock.results[i]?.value as number }))
  .filter((t) => t.delay === 1000)
  .map((t) => t.id);

describe("UT-GRIDOP-FE success bar (D162 B4, FE-P2-08)", () => {
  it("UT-GRIDOP-FE-001 a Save shows the job's success text, which goes after one second", async () => {
    // A stale success text from an earlier render must not be what the bar shows.
    writeState.success = "stale text";
    renderScreen();
    const bar = await editAndSave();
    expect(bar.textContent).toBe(SAVE_SUCCESS);
    expect(flashTimers()).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("grid-operator-write-success")).toBeNull(), { timeout: 2000 });
  });

  it("UT-GRIDOP-FE-002 leaving the screen while the bar shows clears its timer", async () => {
    const { unmount } = renderScreen();
    await editAndSave();
    const [timer] = flashTimers();
    expect(timer).toBeDefined();
    unmount();
    expect(clearSpy.mock.calls.some(([id]) => id === timer)).toBe(true);
  });
});
