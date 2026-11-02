/**
 * P0.1 — the one timeline mark inside the bulk save: `saveAddCostSheetBulk`'s `upsert` records the
 * client timeline's first write request (`features/cost/costing/saveTimeline.ts`), and only while
 * the save line has not printed (a background reconcile's upsert is not this Save's first request).
 *
 * The orchestrator and the transport are doubles here: the wiring is all this pins. The real graph
 * has its own suites (`addCostSheet.bulk.test.ts`, `addCostSheetBulk.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavePlanDeps } from "./addCostSheetBulk";

/** What the double orchestrator does with the deps the save hands it. */
let script: (deps: SavePlanDeps) => Promise<void>;
let reconcileLater: ((deps: SavePlanDeps) => Promise<void>) | null = null;

vi.mock("./addCostSheetBulk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./addCostSheetBulk")>();
  return {
    ...actual,
    executeSavePlan: async (_plan: unknown, deps: SavePlanDeps) => {
      await script(deps);
      const later = reconcileLater;
      return {
        requests: { total: 1 },
        // A background promise: the save returns first, then this runs a task later (the
        // reconcile's upsert follows network answers, never the same tick).
        ...(later ? {
          background: new Promise((r) => setTimeout(r, 0)).then(() => later(deps)).then(() => ({ requests: 1 })),
        } : {}),
      };
    },
  };
});
vi.mock("./bulkSend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bulkSend")>();
  return { ...actual, upsertRowsByAction: vi.fn(async () => ({ requests: 1 })) };
});

import { saveAddCostSheetBulk } from "./addCostSheet";
import { CAPEX_CONTRACTS } from "./addCostSheetBulk";
import { addCostSaveTimeline } from "@/features/cost/costing/saveTimeline";

const args = () => ({
  projectId: "p-1", changedRows: [], existingContracts: [], existingCosts: [], contractDeleteIds: [],
});

describe("saveAddCostSheetBulk — the client timeline's first-request mark (P0.1)", () => {
  let lines: string[];
  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { lines.push(String(t)); });
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
    addCostSaveTimeline.cancel();
    reconcileLater = null;
  });
  afterEach(() => {
    addCostSaveTimeline.cancel();
    vi.restoreAllMocks();
  });
  const clientLine = () => lines.find((l) => l.startsWith("Add Cost from Table client:"));

  it("UT-ACPERF-040 the first upsert marks the first request; a later one of the same Save does not move it", async () => {
    addCostSaveTimeline.begin(performance.now());
    script = async (deps) => {
      await deps.upsert(CAPEX_CONTRACTS, [{ id: "c-1" } as never], "upsert contracts");
      await new Promise((r) => setTimeout(r, 30));
      await deps.upsert(CAPEX_CONTRACTS, [{ id: "c-2" } as never], "upsert contracts");
    };
    await saveAddCostSheetBulk(args());
    addCostSaveTimeline.mark("resolved");
    addCostSaveTimeline.mark("returned");
    addCostSaveTimeline.end("stayed");
    // Marked at the FIRST upsert: well before the 30 ms the second one waited for.
    expect(clientLine()).toMatch(/^Add Cost from Table client: click→first request (\d+) ms/);
    const first = Number(/click→first request (\d+) ms/.exec(clientLine()!)![1]);
    expect(first).toBeLessThan(25);
  });

  it("UT-ACPERF-041 no upsert before the save returned: no first request, even when the background reconcile upserts", async () => {
    addCostSaveTimeline.begin(performance.now());
    script = async () => undefined; // a delete-only Save: nothing upserted before the return
    reconcileLater = async (deps) => { await deps.upsert(CAPEX_CONTRACTS, [{ id: "c-1" } as never], "reconcile totals"); };
    const result = await saveAddCostSheetBulk(args());
    await result.background;
    addCostSaveTimeline.mark("resolved");
    addCostSaveTimeline.mark("returned");
    addCostSaveTimeline.end("stayed");
    expect(clientLine()).toMatch(/^Add Cost from Table client: click→resolved \d+ ms \(no write request recorded\)/);
  });
});
