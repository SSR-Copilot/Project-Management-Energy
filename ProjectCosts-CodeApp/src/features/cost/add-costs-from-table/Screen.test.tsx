// @vitest-environment jsdom
/**
 * Add Cost from Table — the Save's retry and reload wiring (F-A, F1).
 *
 * After a save that failed (and may have partly landed) the screen keeps its pre-save snapshot
 * on purpose, so the retry-id cache survives. The retry must therefore NOT be diffed against
 * that snapshot: it sends every current row and asks the data layer to re-read before planning.
 * A successful save or a fresh load returns to the diff. And Save stays greyed while the sheet
 * reloads.
 *
 * The pure halves are in `./saveRetry`; the render tests pin that the screen wires them. The
 * data hooks and the session are mocked, and the grid is a stub that reports the grid it is
 * handed (the real `react-spreadsheet` grid is covered in `spreadsheet/SpreadSheet.test.tsx`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import type { AddCostSheetData } from "@/data/addCostSheet";
import { CHOICE, rowIdentity, type ExistingContract, type SheetRow } from "./rules";
import { saveButtonDisabled, saveRequestRows } from "./saveRetry";
import type { SheetGrid } from "./spreadsheet/SpreadSheet";

/* ── the doubles ──────────────────────────────────────────────────────────── */

interface SheetState { data: AddCostSheetData | undefined; isFetching: boolean }
let sheet: SheetState;
const refetch = vi.fn(async () => undefined);
const mutateAsync = vi.fn(async (_args: unknown) => undefined);
let reportGrid: ((g: SheetGrid) => void) | null = null;
let lastGrid: SheetGrid | null = null;

// One stable session object: the screen re-hydrates the grid whenever `project` changes identity.
vi.mock("@/app/SessionContext", () => {
  const session = {
    projectId: "p-1",
    project: {
      projectId: "p-1",
      projectName: "Wirmighausen",
      startDate: new Date(2026, 0, 1),
      acquisitionDate: null,
      startClusterNo: 0,
      milestones: { operationsStartCod: new Date(2026, 5, 1) },
    },
    loading: false,
  };
  return { useSession: () => session };
});

vi.mock("@/features/cost/costing/useCostBook", () => ({
  useAddCostSheet: () => ({
    data: sheet.data, isFetching: sheet.isFetching, isLoading: false, error: null, refetch,
  }),
  useSaveAddCostSheet: () => ({ mutateAsync, isPending: false, error: null, reset: () => undefined }),
}));

vi.mock("./spreadsheet/SpreadSheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./spreadsheet/SpreadSheet")>();
  return {
    ...actual,
    // Reports the grid it is handed once, as the real grid does on mount; `reportGrid` plays an edit.
    // Keyed on `data` only: the screen hands a new `onDataChange` on every render.
    SpreadSheetComp: ({ data, onDataChange }: { data: SheetGrid; onDataChange: (g: SheetGrid) => void }) => {
      reportGrid = onDataChange;
      useEffect(() => {
        lastGrid = data;
        onDataChange(data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [data]);
      return null;
    },
  };
});

import AddCostsFromTableScreen from "./Screen";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

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

/** The grid with the contract's January 2026 cell set to `value`, as a user edit. */
const editJanuary = (value: string) => {
  const grid = lastGrid!.map((row) => row.map((c) => (c ? { ...c } : c))) as SheetGrid;
  const r = grid.findIndex((row) => row[2]?.value === "My Cost");
  expect(r).toBeGreaterThan(0);
  grid[r]![6] = { ...grid[r]![6], value };
  act(() => reportGrid!(grid));
};

const saveButton = () => screen.getByTestId("pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save");
const clickSave = async () => { await act(async () => { fireEvent.click(saveButton()); }); };
const sentArgs = (call: number) => mutateAsync.mock.calls[call]![0] as {
  changedRows: SheetRow[]; refreshBeforePlan?: boolean;
};
const sentJanuary = (call: number) => sentArgs(call).changedRows
  .filter((r) => r.projectContractId === "c-1" && r.year === 2026).map((r) => r.months[0]);

const renderScreen = () => render(
  <MemoryRouter initialEntries={["/costs/add-from-table?category=1"]}><AddCostsFromTableScreen /></MemoryRouter>,
);

beforeEach(() => {
  sheet = { data: freshData(), isFetching: false };
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  refetch.mockClear();
  reportGrid = null;
  lastGrid = null;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/* ── the pure halves ──────────────────────────────────────────────────────── */

describe("saveRetry (pure)", () => {
  const row = (id: string): SheetRow => ({
    rowId: id, accountNumber: "80000_0", accountName: "Turbine", description: id, year: 2026,
    costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes", months: new Array(12).fill(1),
    subAccountId: "sub-1", projectContractId: id,
  });
  const a = row("a"); const b = row("b"); const orphan = row("o");

  it("UT-ADDCOST-100 after a failed save, the rows it sent are re-sent with the new diff and orphans, with refreshBeforePlan", () => {
    // `b` was sent by the failed attempt and now diffs as unchanged (its cell was set back).
    const out = saveRequestRows({
      changed: [a], orphanCleanup: [orphan], currentRows: [a, b], sentBefore: new Set([rowIdentity(b)]),
    });
    expect(out.changedRows).toEqual([a, b, orphan]);
    expect(out.refreshBeforePlan).toBe(true);
    expect(out.sentIdentities).toEqual([rowIdentity(a), rowIdentity(b), rowIdentity(orphan)]);
  });

  it("UT-ADDCOST-101 otherwise only the diff and the orphans are sent, without refreshBeforePlan", () => {
    const out = saveRequestRows({ changed: [a], orphanCleanup: [orphan], currentRows: [a, b], sentBefore: new Set() });
    expect(out.changedRows).toEqual([a, orphan]);
    expect(out.refreshBeforePlan).toBe(false);
  });

  it("UT-ADDCOST-107 a retry never re-sends rows no failed attempt sent (E4 M1: untouched contracts stay untouched)", () => {
    const c = row("c");
    const out = saveRequestRows({
      changed: [], orphanCleanup: [], currentRows: [a, b, c], sentBefore: new Set([rowIdentity(a)]),
    });
    // `b` and `c` were never sent: re-sending them would force Individual/Absolute on their contracts.
    expect(out.changedRows).toEqual([a]);
  });

  it("UT-ADDCOST-108 a row in both the diff and the failed set is sent once", () => {
    const out = saveRequestRows({
      changed: [a], orphanCleanup: [], currentRows: [a], sentBefore: new Set([rowIdentity(a)]),
    });
    expect(out.changedRows).toEqual([a]);
  });

  it("UT-ADDCOST-102 Save is disabled while the sheet is fetching, and for the other two reasons", () => {
    expect(saveButtonDisabled({ canSave: true, isPending: false, isFetching: false })).toBe(false);
    expect(saveButtonDisabled({ canSave: true, isPending: false, isFetching: true })).toBe(true);
    expect(saveButtonDisabled({ canSave: true, isPending: true, isFetching: false })).toBe(true);
    expect(saveButtonDisabled({ canSave: false, isPending: false, isFetching: false })).toBe(true);
  });
});

/* ── the screen's wiring ──────────────────────────────────────────────────── */

describe("Add Cost from Table Save wiring", () => {
  it("UT-ADDCOST-103 Save is disabled while the sheet is fetching, and enabled once it settles", () => {
    sheet.isFetching = true;
    const view = renderScreen();
    expect(saveButton()).toHaveProperty("disabled", true);
    sheet.isFetching = false;
    view.rerender(
      <MemoryRouter initialEntries={["/costs/add-from-table?category=1"]}><AddCostsFromTableScreen /></MemoryRouter>,
    );
    expect(saveButton()).toHaveProperty("disabled", false);
  });

  it("UT-ADDCOST-104 a reverted cell is re-sent after a failed save (F-A), with refreshBeforePlan", async () => {
    renderScreen();
    editJanuary("200");
    mutateAsync.mockRejectedValueOnce(new Error("partly landed"));
    await clickSave();
    expect(sentJanuary(0)).toEqual([200]);
    expect(sentArgs(0).refreshBeforePlan).toBe(false);

    // Jan back to the snapshot's 100 — Dataverse may hold 200 from the failed attempt.
    editJanuary("100");
    await clickSave();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(sentJanuary(1)).toEqual([100]);
    expect(sentArgs(1).refreshBeforePlan).toBe(true);
  });

  it("UT-ADDCOST-105 after a successful save the diff is used again", async () => {
    renderScreen();
    editJanuary("200");
    mutateAsync.mockRejectedValueOnce(new Error("failed"));
    await clickSave();
    await clickSave(); // the retry, which succeeds: the row the failed attempt sent goes again
    expect(sentArgs(1).refreshBeforePlan).toBe(true);
    expect(sentJanuary(1)).toEqual([200]);
    // The success cleared the failed-attempt set: the third save is a plain diff again (the mock
    // does not reload the snapshot, so January still differs from it; the app navigates away).
    await clickSave();
    expect(sentArgs(2).refreshBeforePlan).toBe(false);
    expect(sentJanuary(2)).toEqual([200]);
  });

  it("UT-ADDCOST-106 after a fresh sheet load the diff is used again", async () => {
    const view = renderScreen();
    editJanuary("200");
    mutateAsync.mockRejectedValueOnce(new Error("failed"));
    await clickSave();
    sheet.data = freshData(); // a refetch lands: a new snapshot of what is stored
    view.rerender(
      <MemoryRouter initialEntries={["/costs/add-from-table?category=1"]}><AddCostsFromTableScreen /></MemoryRouter>,
    );
    await clickSave();
    expect(sentArgs(1).refreshBeforePlan).toBe(false);
    expect(sentArgs(1).changedRows).toEqual([]);
  });
});
