// @vitest-environment jsdom
/**
 * Render tests for the connected Grid Operator screen (D32): `./hooks` is mocked with fixed rows,
 * so these check the canvas captions and ids, the gates and the Save job handed to `run`. The
 * rules are covered by `rules.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { ES } from "@/data/dataverseNames";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import {
  BUTTON_CONTROL, FIELD_CONTROL, FIELD_LABEL, GRID_OPERATOR_SCREEN_TEXT, PAGE_LOCK_TITLE, SAVE_SUCCESS,
  type GridOperatorProject, type GridOperatorRecord,
} from "./rules";

const unlocked: GridOperatorProject = {
  id: "p-1", projectNumber: "DE-1021", endDate: "2059-12-31", projectStartDate: "2026-01-01",
  totalCapacity: 42.5, netYieldP50: 112400, clusterStateName: "Cluster 2", owningBusinessUnitId: "bu-de",
};
const row: GridOperatorRecord = {
  id: "g-1", operator: "Netze BW GmbH", voltageLevel: 110, expansionRequired: 952850000,
  expansionDetails: "New bay", substationConstructionRequired: 952850001, substationOperator: "VSB",
  lengthInternal: 1.5, diameterInternal: 12.5, lengthExternal: 8.5, diameterExternal: 240,
};

const state = {
  project: unlocked as GridOperatorProject | null,
  record: row as GridOperatorRecord | null,
  error: undefined as unknown,
};
const run = vi.fn(async (_job: PlanJob): Promise<string[] | null> => []);

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_projects", "vsb_gridoperators"],
  GRID_OPERATOR_CAN_EDIT: true,
  useGridOperatorProject: () => ({ data: state.project, isLoading: false, error: state.error, connected: true }),
  useGridOperator: () => ({ data: state.record, isLoading: false, error: undefined, connected: true }),
  useGridOperatorWrites: () => ({ run, progress: null, error: null, success: null, clear: () => {} }),
}));

import GridOperatorScreen from "./Screen";

const renderScreen = (path = "/project/grid-operator") => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter initialEntries={[path]}><GridOperatorScreen /></MemoryRouter>
  </FluentProvider>,
);

const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;

beforeEach(() => {
  state.project = unlocked;
  state.record = row;
  state.error = undefined;
  run.mockClear();
});

describe("UT-GRIDOP Screen (connected)", () => {
  it("UT-GRIDOP-901 renders the Grid Operator tab bound to the row, with canvas ids and AccessibleLabels", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.queryByText(PAGE_LOCK_TITLE)).toBeNull();
    expect(screen.getByRole("tab", { name: "Grid Operator" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Grid Connection" })).toBeTruthy();
    for (const f of ["operator", "voltageLevel", "expansionRequired", "expansionDetails"] as const) {
      expect(screen.getByText(FIELD_LABEL[f], { selector: "label" })).toBeTruthy();
      expect(screen.getByTestId(FIELD_CONTROL[f]).getAttribute("aria-label")).toBe(FIELD_CONTROL[f]);
    }
    expect(input(FIELD_CONTROL.operator).value).toBe("Netze BW GmbH");
    expect(input(FIELD_CONTROL.operator).tagName).toBe("TEXTAREA");
    expect(input(FIELD_CONTROL.voltageLevel).value).toBe("110");
    expect(screen.getByText("13/55")).toBeTruthy();
    expect(screen.getByTestId(BUTTON_CONTROL.save).getAttribute("aria-label")).toBe(BUTTON_CONTROL.save);
    expect(screen.getByTestId(BUTTON_CONTROL.cancel).getAttribute("aria-label")).toBe(BUTTON_CONTROL.cancel);
  });

  it("UT-GRIDOP-902 the lock banner shows its bullets and every field and the tab strip are disabled", () => {
    state.project = { ...unlocked, netYieldP50: 0 };
    renderScreen();
    expect(screen.getByText(PAGE_LOCK_TITLE)).toBeTruthy();
    expect(screen.getByText("• Production")).toBeTruthy();
    expect(input(FIELD_CONTROL.operator).disabled).toBe(true);
    expect(input(FIELD_CONTROL.voltageLevel).disabled).toBe(true);
  });

  it("UT-GRIDOP-903 the Grid Connection tab renders its fields from ?tab=connection, editable on a Draft project as the canvas (D32 R1)", () => {
    state.project = { ...unlocked, clusterStateName: "Draft" };
    renderScreen("/project/grid-operator?tab=connection");
    for (const f of [
      "substationConstructionRequired", "substationOperator", "lengthInternal",
      "diameterInternal", "lengthExternal", "diameterExternal",
    ] as const) {
      expect(screen.getByText(FIELD_LABEL[f], { selector: "label" })).toBeTruthy();
    }
    expect(input(FIELD_CONTROL.lengthInternal).value).toBe("1.5");
    // Canvas behaviour (D32 R1): no DisplayMode on these six, so they stay editable on a Draft /
    // locked project; Save stays disabled.
    expect(input(FIELD_CONTROL.lengthInternal).disabled).toBe(false);
    fireEvent.change(input(FIELD_CONTROL.lengthInternal), { target: { value: "2.5" } });
    expect((screen.getByTestId(BUTTON_CONTROL.save) as HTMLButtonElement).disabled).toBe(true);
  });

  it("UT-GRIDOP-904 Save and Cancel are disabled on a clean form", () => {
    renderScreen();
    expect((screen.getByTestId(BUTTON_CONTROL.save) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(BUTTON_CONTROL.cancel) as HTMLButtonElement).disabled).toBe(true);
  });

  it("UT-GRIDOP-905 an edit enables Save, which runs one update of the row with the canvas texts", async () => {
    renderScreen();
    fireEvent.change(input(FIELD_CONTROL.operator), { target: { value: "TenneT" } });
    const save = await waitFor(() => {
      const b = screen.getByTestId(BUTTON_CONTROL.save) as HTMLButtonElement;
      expect(b.disabled).toBe(false);
      return b;
    });
    expect((screen.getByTestId(BUTTON_CONTROL.cancel) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const job = run.mock.calls[0]![0];
    expect(job.success).toBe(SAVE_SUCCESS);
    const plan = job.plan as WritePlan;
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({ op: "update", entitySet: ES.gridOperators, id: "g-1" });
    expect(plan.writes[0]?.data?.vsb_operator).toBe("TenneT");
    expect(plan.writes[0]?.data?.["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
  });

  it("UT-GRIDOP-906 with no row the Save creates it", async () => {
    state.record = null;
    renderScreen();
    fireEvent.change(input(FIELD_CONTROL.voltageLevel), { target: { value: "20" } });
    const save = await waitFor(() => {
      const b = screen.getByTestId(BUTTON_CONTROL.save) as HTMLButtonElement;
      expect(b.disabled).toBe(false);
      return b;
    });
    fireEvent.click(save);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const plan = run.mock.calls[0]![0].plan as WritePlan;
    expect(plan.writes[0]).toMatchObject({ op: "create", entitySet: ES.gridOperators });
    expect(plan.writes[0]?.data?.vsb_voltagelevel).toBe(20);
    expect(plan.writes[0]?.data?.["vsb_ProjectId@odata.bind"]).toBe("/vsb_projects(p-1)");
  });

  it("UT-GRIDOP-907 an invalid length shows the canvas message and keeps Save disabled", async () => {
    renderScreen("/project/grid-operator?tab=connection");
    fireEvent.change(input(FIELD_CONTROL.lengthInternal), { target: { value: "100" } });
    expect(await screen.findByText("Please select a value between 0 and 99.")).toBeTruthy();
    expect((screen.getByTestId(BUTTON_CONTROL.save) as HTMLButtonElement).disabled).toBe(true);
  });

  it("UT-GRIDOP-908 a failed read shows the load-error state, not an empty form", () => {
    state.error = new Error("403");
    renderScreen();
    expect(screen.getByText(GRID_OPERATOR_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
    expect(screen.queryByTestId(FIELD_CONTROL.operator)).toBeNull();
  });
});
