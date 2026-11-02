// @vitest-environment jsdom
/**
 * Add Cost from Table — the Save's client-path trims and timeline, as wired by the screen (WS-E,
 * P0.1). The prepare line goes out AFTER the Save's request was started, the screen ends the client
 * timeline the right way on each outcome, and nothing of it can fail a Save.
 *
 * Same doubles as `Screen.test.tsx` (session, hooks and a stub grid), kept apart so this file's ids
 * (UT-ACPERF-) never collide with that one's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import type { AddCostSheetData } from "@/data/addCostSheet";
import { CHOICE, type ExistingContract } from "./rules";
import type { SheetGrid } from "./spreadsheet/SpreadSheet";
import { PAINT_TIMEOUT_MS, addCostSaveTimeline } from "@/features/cost/costing/saveTimeline";

let sheet: AddCostSheetData;
const mutateAsync = vi.fn(async (_args: unknown) => undefined);
let reportGrid: ((g: SheetGrid) => void) | null = null;
let lastGrid: SheetGrid | null = null;

vi.mock("@/app/SessionContext", () => {
  const session = {
    projectId: "p-1",
    project: {
      projectId: "p-1", projectName: "Wirmighausen", startDate: new Date(2026, 0, 1), acquisitionDate: null,
      startClusterNo: 0, milestones: { operationsStartCod: new Date(2026, 5, 1) },
    },
    loading: false,
  };
  return { useSession: () => session };
});
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
  grid[r]![6] = { ...grid[r]![6], value };
  act(() => reportGrid!(grid));
};
const renderScreen = () => render(
  <MemoryRouter initialEntries={["/costs/add-from-table?category=1"]}><AddCostsFromTableScreen /></MemoryRouter>,
);
const clickSave = () => fireEvent.click(screen.getByTestId("pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save"));
/** Lets the deferred prepare log's task and the screen's continuation run. */
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };

let lines: string[];
beforeEach(() => {
  sheet = freshData();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  reportGrid = null;
  lastGrid = null;
  lines = [];
  vi.spyOn(console, "info").mockImplementation((t: unknown) => { lines.push(String(t)); });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
  vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
  vi.spyOn(console, "table").mockImplementation(() => undefined);
  addCostSaveTimeline.cancel();
});
afterEach(() => {
  addCostSaveTimeline.cancel();
  vi.restoreAllMocks();
});
const prepareLines = () => lines.filter((l) => l.startsWith("Add Cost from Table prepare:"));
const clientLines = () => lines.filter((l) => l.startsWith("Add Cost from Table client:"));

describe("Add Cost from Table Save — client path (WS-E, P0.1)", () => {
  it("UT-ACPERF-030 the prepare line prints after the Save was started, before it resolves, with the same content", async () => {
    renderScreen();
    editJanuary("200");
    let atSend: string[] | null = null;
    let resolve!: () => void;
    mutateAsync.mockImplementationOnce(() => {
      atSend = [...lines];
      addCostSaveTimeline.mark("firstWrite"); // the data layer's mark, played by the double
      return new Promise<undefined>((res) => { resolve = () => res(undefined); });
    });
    await act(async () => { clickSave(); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // Nothing of the prepare log had printed when the save started.
    expect(atSend!.filter((l) => l.startsWith("Add Cost from Table prepare:"))).toEqual([]);
    await settle();
    // One task later it has, while the save is still running; same wording as before WS-E.
    expect(prepareLines()).toHaveLength(1);
    expect(prepareLines()[0]).toMatch(/^Add Cost from Table prepare: [\d.,]+ ms \(round-trip check .*; [\d,]+ rows?\)$/);
    await act(async () => { resolve(); });
    expect(prepareLines()).toHaveLength(1);
  });

  it("UT-ACPERF-031 a successful Save that navigates ends its timeline on the CAPEX paint, not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      renderScreen();
      editJanuary("200");
      mutateAsync.mockImplementationOnce(async () => {
        addCostSaveTimeline.mark("firstWrite");
        addCostSaveTimeline.mark("resolved");
        return undefined;
      });
      await act(async () => { clickSave(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(20); });
      expect(clientLines()).toEqual([]); // navigated; waiting for the DEVEX/CAPEX grid
      addCostSaveTimeline.capexShown();
      await act(async () => { await vi.advanceTimersByTimeAsync(20); });
      expect(clientLines()).toHaveLength(1);
      expect(clientLines()[0]).toMatch(/^Add Cost from Table client: click→first request \d+ ms \(prepare [\d.]+ ms, then [\d.]+ ms\), first request→resolved \d+ ms, resolve→CAPEX painted \d+ ms/);
      expect(clientLines()[0]).toMatch(/; prepare log [\d.]+ ms, after the first request$/);
      await act(async () => { await vi.advanceTimersByTimeAsync(PAINT_TIMEOUT_MS); });
      expect(clientLines()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("UT-ACPERF-032 a failed Save still fails as before, and prints its timeline as failed, after the prepare line", async () => {
    renderScreen();
    editJanuary("200");
    mutateAsync.mockRejectedValueOnce(new Error("HTTP 403"));
    await act(async () => { clickSave(); });
    await settle();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(clientLines()).toHaveLength(1);
    expect(clientLines()[0]).toMatch(/^Add Cost from Table client: click→failed \d+ ms \(no write request recorded; prepare [\d.]+ ms\)/);
    const order = lines.map((l) => (l.startsWith("Add Cost from Table prepare:") ? "prepare"
      : l.startsWith("Add Cost from Table save failed:") ? "screen failure"
        : l.startsWith("Add Cost from Table client:") ? "client" : "")).filter(Boolean);
    expect(order).toEqual(["prepare", "screen failure", "client"]);
  });

  it("UT-ACPERF-033 a throwing console never reaches the Save: it is sent and no error shows", async () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("console broke"); });
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => { throw new Error("console broke"); });
    renderScreen();
    editJanuary("200");
    await act(async () => { clickSave(); });
    await settle();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });
});
