// @vitest-environment jsdom
/**
 * WS-F — the Add Cost from Table screen's half of the background Save (`BACKGROUND_SAVE`).
 *
 * Flag ON: the Save navigates back to DEVEX/CAPEX before it resolves, sends `background: true`,
 * reports a later failure to the toast (the sheet is gone), ignores a second click, and a sheet
 * opened while a background Save runs stays locked until it settles. Flag OFF: the Save waits and
 * sends exactly what it sent before. The hook half (lock, status, unload guard, refetch) is
 * `costing/useSaveAddCostSheet.background.test.tsx`.
 *
 * Same doubles as `Screen.test.tsx`; the flag is flipped through a getter on the mocked module.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AddCostSheetData } from "@/data/addCostSheet";
import { toSaveFailure } from "@/data/addCostSheet";
import { CHOICE, saveFailureText, type ExistingContract } from "./rules";
import type { SheetGrid } from "./spreadsheet/SpreadSheet";

/* ── the doubles ─────────────────────────────────────────────────────────── */

const flags = vi.hoisted(() => ({ background: false }));
let sheetData: AddCostSheetData;
const mutateAsync = vi.fn(async (_args: unknown) => undefined as unknown);
const reportFailure = vi.fn((text: string, show?: (t: string) => void) => { show?.(text); });
let reportGrid: ((g: SheetGrid) => void) | null = null;
let lastGrid: SheetGrid | null = null;

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
vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => reportFailure,
}));
vi.mock("@/features/cost/costing/useCostBook", () => ({
  useAddCostSheet: () => ({
    data: sheetData, isFetching: false, isLoading: false, error: null, refetch: async () => undefined,
  }),
  useSaveAddCostSheet: () => ({ mutateAsync, isPending: false, error: null, reset: () => undefined }),
}));
vi.mock("@/features/cost/costing/backgroundSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cost/costing/backgroundSave")>();
  return { ...actual, get BACKGROUND_SAVE() { return flags.background; } };
});
vi.mock("./spreadsheet/SpreadSheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./spreadsheet/SpreadSheet")>();
  return {
    ...actual,
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
const { beginBackgroundSave } = await import("@/features/cost/costing/backgroundSave");

/* ── fixtures ────────────────────────────────────────────────────────────── */

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

const editJanuary = (value: string) => {
  const grid = lastGrid!.map((row) => row.map((c) => (c ? { ...c } : c))) as SheetGrid;
  const r = grid.findIndex((row) => row[2]?.value === "My Cost");
  expect(r).toBeGreaterThan(0);
  grid[r]![6] = { ...grid[r]![6], value };
  act(() => reportGrid!(grid));
};

const SAVE = "pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save";
const onCapex = () => screen.queryByTestId("capex-route") !== null;
const onSheet = () => screen.queryByTestId(SAVE) !== null;

const renderApp = () => render(
  <MemoryRouter initialEntries={["/costs/add-from-table?category=1"]}>
    <Routes>
      <Route path="/costs/add-from-table" element={<AddCostsFromTableScreen />} />
      <Route path="/costs/capex" element={<div data-testid="capex-route" />} />
    </Routes>
  </MemoryRouter>,
);

/** A Save whose promise the test settles. */
const pendingSave = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  mutateAsync.mockImplementationOnce(() => new Promise((res, rej) => {
    resolve = () => res(undefined);
    reject = rej;
  }));
  return { resolve: () => resolve(), reject: (e: Error) => reject(e) };
};

beforeEach(() => {
  flags.background = false;
  sheetData = freshData();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  reportFailure.mockClear();
  reportGrid = null;
  lastGrid = null;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
  vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
  vi.spyOn(console, "table").mockImplementation(() => undefined);
});

/* ── flag ON ─────────────────────────────────────────────────────────────── */

describe("Add Cost from Table — background Save ON (WS-F)", () => {
  beforeEach(() => { flags.background = true; });

  it("UT-ACBG-030 navigates to DEVEX/CAPEX before the Save resolves, and sends background: true", async () => {
    const save = pendingSave();
    renderApp();
    editJanuary("200");
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect((mutateAsync.mock.calls[0]![0] as { background?: boolean }).background).toBe(true);
    expect(onCapex()).toBe(true);
    expect(onSheet()).toBe(false);
    await act(async () => { save.resolve(); });
    expect(onCapex()).toBe(true);
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("UT-ACBG-031 a failure after leaving goes to the error toast with the mapped failure text", async () => {
    const save = pendingSave();
    renderApp();
    editJanuary("200");
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    const error = new Error("HTTP 403");
    await act(async () => { save.reject(error); });
    expect(reportFailure).toHaveBeenCalledTimes(1);
    // No on-screen surface: `useWriteFailureReport` then always raises the toast.
    expect(reportFailure).toHaveBeenCalledWith(saveFailureText(toSaveFailure(error)), undefined);
  });

  it("UT-ACBG-032 a second click before the navigation commits starts no second Save", async () => {
    pendingSave();
    renderApp();
    editJanuary("200");
    await act(async () => {
      const button = screen.getByTestId(SAVE);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-ACBG-033 a sheet opened while a background Save runs is locked, and unlocks when it settles", () => {
    const handle = beginBackgroundSave("p-1", {
      notify: { progress: () => () => undefined, success: () => undefined }, holdUnload: () => () => undefined,
    });
    try {
      renderApp();
      expect(screen.getByTestId("btn_AddRow_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable")).toHaveProperty("disabled", true);
      expect(screen.getByTestId("pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Cancel")).toHaveProperty("disabled", true);
      expect(screen.getByTestId("add-costs-grid").hasAttribute("inert")).toBe(true);
      act(() => handle.settle("saved"));
      expect(screen.getByTestId("btn_AddRow_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable")).toHaveProperty("disabled", false);
      expect(screen.getByTestId("add-costs-grid").hasAttribute("inert")).toBe(false);
    } finally {
      handle.settle("failed");
    }
  });
});

/* ── flag OFF: exactly as before ─────────────────────────────────────────── */

describe("Add Cost from Table — background Save OFF (default)", () => {
  it("UT-ACBG-040 the Save waits on the sheet and navigates only once it resolves", async () => {
    const save = pendingSave();
    renderApp();
    editJanuary("200");
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    expect(onSheet()).toBe(true);
    expect(onCapex()).toBe(false);
    await act(async () => { save.resolve(); });
    expect(onCapex()).toBe(true);
  });

  it("UT-ACBG-041 the Save sends exactly the arguments it sent before (no `background` key)", async () => {
    renderApp();
    editJanuary("200");
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    expect(Object.keys(mutateAsync.mock.calls[0]![0] as object).sort()).toEqual([
      "changedRows", "contractDeleteIds", "existingContracts", "existingCosts", "idCache", "refreshBeforePlan",
    ]);
  });

  it("UT-ACBG-042 a failure stays on the sheet and goes to its banner (the screen surface is passed)", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("HTTP 403"));
    renderApp();
    editJanuary("200");
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    expect(onSheet()).toBe(true);
    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(typeof reportFailure.mock.calls[0]![1]).toBe("function");
    expect(screen.getByText(saveFailureText(toSaveFailure(new Error("HTTP 403"))))).toBeTruthy();
  });

  it("UT-ACBG-043 a failed Save can be retried from the same sheet (no hand-off guard), with refreshBeforePlan", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("partly landed"));
    renderApp();
    editJanuary("200");
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    await act(async () => { fireEvent.click(screen.getByTestId(SAVE)); });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect((mutateAsync.mock.calls[1]![0] as { refreshBeforePlan: boolean }).refreshBeforePlan).toBe(true);
  });
});
