// @vitest-environment jsdom
/**
 * CA-31 (D162, FE-C1-02): an unchanged session project refetched while the sheet is open must not re-hydrate the grid.
 *
 * `ProjectContext` holds `Date`s, so a refetch hands the screen a NEW but equal `project` object (on window focus after the 5-minute
 * stale time, or after any `qk.project` invalidation). The sheet's `loaded` memo depended on that identity, so it rebuilt the sheet
 * from the server snapshot, the grid was re-seeded and the user's unsaved edits were gone. A real change of the project's dates
 * (a different first or last year) must still rebuild.
 *
 * Same doubles as `Screen.perf.test.tsx` (session, hooks and a stub grid); own ids (UT-ACIDENT-).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import type { AddCostSheetData } from "@/data/addCostSheet";
import { CHOICE, type ExistingContract } from "./rules";
import type { SheetGrid } from "./spreadsheet/SpreadSheet";
import { addCostSaveTimeline } from "@/features/cost/costing/saveTimeline";

const project = (startYear = 2026, codYear = 2026) => ({
  projectId: "p-1", projectName: "Wirmighausen", startDate: new Date(startYear, 0, 1), acquisitionDate: null,
  startClusterNo: 0, milestones: { operationsStartCod: new Date(codYear, 5, 1) },
});
const session = { projectId: "p-1", project: project(), loading: false };

let sheet: AddCostSheetData;
const mutateAsync = vi.fn(async (_args: unknown) => undefined);
let reportGrid: ((g: SheetGrid) => void) | null = null;
let lastGrid: SheetGrid | null = null;
let seeded = 0;

vi.mock("@/app/SessionContext", () => ({ useSession: () => session }));
vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));
vi.mock("@/features/cost/costing/useCostBook", () => ({
  useAddCostSheet: () => ({ data: sheet, isFetching: false, isLoading: false, error: null, refetch: async () => undefined }),
  useSaveAddCostSheet: () => ({ mutateAsync, isPending: false, error: null, reset: () => undefined }),
}));
vi.mock("./spreadsheet/SpreadSheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./spreadsheet/SpreadSheet")>();
  return {
    ...actual,
    // The real grid re-seeds itself (dropping its edits) exactly when this `data` reference changes (`SpreadSheet.tsx`, `seededFrom`).
    SpreadSheetComp: ({ data, onDataChange }: { data: SheetGrid; onDataChange: (g: SheetGrid) => void }) => {
      reportGrid = onDataChange;
      useEffect(() => {
        seeded += 1;
        lastGrid = data;
        onDataChange(data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [data]);
      return null;
    },
  };
});

import AddCostsFromTableScreen from "./Screen";

const SUB = { id: "sub-1", number: "80000_0", name: "Turbine" };
const contract: ExistingContract = {
  id: "c-1", name: "My Cost", subaccountId: "sub-1", isStandardContract: false,
  initialContractSource: CHOICE.initialContractSource.pcf, distribution: CHOICE.distributionType.individual,
  distributionScheme: CHOICE.distributionScheme.absoluteValues, isEditedFromPcf: true,
  costType: CHOICE.costPaidType.devCo, depreciation: true, applyVat: true, totalCost: 150,
};
const freshData = (): AddCostSheetData => ({
  accounts: [{ id: "acc-1", number: "80000", name: "Turbines", subaccounts: [SUB] }],
  subaccounts: [SUB],
  contracts: [contract],
  costs: [
    { id: "k-jan", contractId: "c-1", year: 2026, month: 1, cost: 100 },
    { id: "k-feb", contractId: "c-1", year: 2026, month: 2, cost: 50 },
  ],
  payerDefaults: new Map(),
});

const ui = () => <MemoryRouter initialEntries={["/costs/add-from-table?category=1"]}><AddCostsFromTableScreen /></MemoryRouter>;
const editJanuary = (value: string) => {
  const grid = lastGrid!.map((row) => row.map((c) => (c ? { ...c } : c))) as SheetGrid;
  const r = grid.findIndex((row) => row[2]?.value === "My Cost");
  grid[r]![6] = { ...grid[r]![6], value };
  act(() => reportGrid!(grid));
};

beforeEach(() => {
  sheet = freshData();
  session.project = project();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  reportGrid = null;
  lastGrid = null;
  seeded = 0;
  for (const m of ["info", "error", "groupCollapsed", "groupEnd", "table"] as const) {
    vi.spyOn(console, m).mockImplementation(() => undefined);
  }
  addCostSaveTimeline.cancel();
});
afterEach(() => {
  addCostSaveTimeline.cancel();
  vi.restoreAllMocks();
});

describe("Add Cost from Table — an equal project refetch keeps the sheet (CA-31, FE-C1-02)", () => {
  it("UT-ACIDENT-001 a new but equal project object does not re-seed the grid", () => {
    const view = render(ui());
    expect(seeded).toBe(1);
    const before = lastGrid;
    session.project = project(); // what a refetch hands over: same values, new object, new Dates
    view.rerender(ui());
    expect(seeded).toBe(1);
    expect(lastGrid).toBe(before);
  });

  it("UT-ACIDENT-002 an unsaved edit survives the refetch and is what Save sends", async () => {
    const view = render(ui());
    editJanuary("200");
    session.project = project();
    view.rerender(ui());
    await act(async () => {
      fireEvent.click(screen.getByTestId("pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save"));
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mutateAsync.mock.calls[0]![0])).toContain("200");
  });

  it("UT-ACIDENT-003 a real change of the project's years still rebuilds the sheet", () => {
    const view = render(ui());
    expect(seeded).toBe(1);
    session.project = project(2026, 2028); // a later COD extends the sheet's year range
    view.rerender(ui());
    expect(seeded).toBe(2);
  });
});
