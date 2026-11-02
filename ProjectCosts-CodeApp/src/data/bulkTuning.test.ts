/**
 * The WS-A chunk tuning of the bulk writes (`BULK_TUNING` in `./bulkSend.ts`): the legacy twin is
 * today's numbers exactly, the split per row count under both tunings, the 501 fallback's refused
 * request count, and the in-flight ceiling of the shared write gate.
 *
 * The bulk services are faked; nothing here reaches the SDK.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IOperationResult } from "@microsoft/power-apps/data";
import type { BulkTableInfo, BulkUpsertTransport, UpsertTarget } from "./bulkTypes";

/** Each bulk call waits for `hold` (when set) so a test can count what is in flight. */
let hold: Promise<void> | null = null;
let notImplemented = false;
let inFlight = 0;
let peakInFlight = 0;
const bulkCalls: { action: string; rows: number }[] = [];
const rowUpdates: string[] = [];

const bulk = (action: string) => async (_set: string, targets: readonly unknown[]) => {
  bulkCalls.push({ action, rows: targets.length });
  inFlight += 1;
  peakInFlight = Math.max(peakInFlight, inFlight);
  try {
    if (hold) await hold;
    await Promise.resolve();
    if (notImplemented) {
      const { DataError } = await import("@/platform/errors");
      throw new DataError("bulk", "not implemented", 501);
    }
    return { success: true, data: {} };
  } finally {
    inFlight -= 1;
  }
};

vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: { CreateMultiple: bulk("create") },
}));
vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: { UpdateMultiple: bulk("update") },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => ({ success: true, data: [] }),
    update: async (id: string) => { rowUpdates.push(id); return { success: true, data: {} }; },
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => ({ success: true, data: [] }),
    update: async (id: string) => { rowUpdates.push(id); return { success: true, data: {} }; },
  },
}));

const {
  BULK_PARALLEL_CHUNKS, BULK_TUNING, CONTRACT_DELETE_LIMIT, COST_DELETE_LIMIT, LEGACY_BULK_TUNING,
  SAVE_REQUEST_LIMIT, TUNED_BULK_TUNING, TUNED_CHUNKING, bulkChunkOptions, bulkRequestCount,
  createRequestMeter, resetBulkWriteAvailability, selectBulkTuning, upsertRowsByAction,
} = await import("./bulkSend");
const { DEFAULT_BULK_CHUNK, MIN_PARALLEL_CHUNK, upsertMultiple } = await import("./bulkWrites");
const { CAPEX_CONTRACTS, CAPEX_COSTS } = await import("./addCostSheetBulk");
type Tuning = typeof BULK_TUNING;

afterEach(() => {
  hold = null;
  notImplemented = false;
  inFlight = 0;
  peakInFlight = 0;
  bulkCalls.length = 0;
  rowUpdates.length = 0;
  resetBulkWriteAvailability();
  vi.restoreAllMocks();
});

const TABLE: BulkTableInfo = {
  entitySetName: "vsb_capexcosts", logicalName: "vsb_capexcost", primaryKey: "vsb_capexcostid",
};
const guid = (prefix: string, i: number) => `${prefix}0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const targets = (n: number, isNew: boolean, prefix = "a"): UpsertTarget[] =>
  Array.from({ length: n }, (_, i) => ({ id: guid(prefix, i), isNew, fields: { vsb_cost: i } }));

/** The chunk sizes `upsertMultiple` actually sends for `n` rows under `tuning`. */
async function sentSizes(n: number, tuning: Tuning): Promise<number[]> {
  const sizes: number[] = [];
  const transport: BulkUpsertTransport = async (_set, t) => {
    sizes.push(t.length);
    return { success: true, data: {} } as IOperationResult<unknown>;
  };
  const result = await upsertMultiple(TABLE, targets(n, false), transport, bulkChunkOptions(tuning));
  expect(result).toEqual({ requests: sizes.length, rows: n });
  return sizes;
}

const times = (count: number, size: number) => new Array<number>(count).fill(size);

describe("the tuning set", () => {
  it("UT-BULKCHUNK-001 LEGACY_BULK_TUNING is today's numbers exactly (25 / 4 / 500 / 16)", () => {
    expect(LEGACY_BULK_TUNING).toEqual({ minChunk: 25, parallel: 4, maxChunk: 500, writeGate: 16 });
    expect(LEGACY_BULK_TUNING.minChunk).toBe(MIN_PARALLEL_CHUNK);
    expect(LEGACY_BULK_TUNING.maxChunk).toBe(DEFAULT_BULK_CHUNK);
    expect(Object.isFrozen(LEGACY_BULK_TUNING)).toBe(true);
  });

  it("UT-BULKCHUNK-002 the PROVISIONAL tuning is in force: 10 / 8 / 500 / 24, and every derived constant follows it", () => {
    expect(TUNED_BULK_TUNING).toEqual({ minChunk: 10, parallel: 8, maxChunk: 500, writeGate: 24 });
    expect(Object.isFrozen(TUNED_BULK_TUNING)).toBe(true);
    expect(TUNED_CHUNKING).toBe(true);
    expect(BULK_TUNING).toBe(TUNED_BULK_TUNING);
    expect(BULK_PARALLEL_CHUNKS).toBe(8);
    expect(SAVE_REQUEST_LIMIT).toBe(24);
    expect(bulkChunkOptions()).toEqual({ parallel: 8, chunkSize: 500, minChunk: 10 });
  });

  it("UT-BULKCHUNK-003 the flag's two halves: true selects the tuned set, false restores the legacy set", () => {
    expect(selectBulkTuning(true)).toBe(TUNED_BULK_TUNING);
    expect(selectBulkTuning(false)).toBe(LEGACY_BULK_TUNING);
    expect(bulkChunkOptions(selectBulkTuning(false))).toEqual({ parallel: 4, chunkSize: 500, minChunk: 25 });
  });

  it("UT-BULKCHUNK-004 the module gates stay under Dataverse's 52 per user under either tuning, panel deletes included", () => {
    const PANEL_DELETE_LIMIT = 4; // `capexWrites.ts`, not exported
    for (const t of [LEGACY_BULK_TUNING, TUNED_BULK_TUNING]) {
      expect(t.writeGate + CONTRACT_DELETE_LIMIT + COST_DELETE_LIMIT + PANEL_DELETE_LIMIT).toBeLessThanOrEqual(52);
    }
    expect(SAVE_REQUEST_LIMIT + CONTRACT_DELETE_LIMIT + COST_DELETE_LIMIT).toBe(32);
  });
});

describe("chunk sizes and request counts per group", () => {
  // [id, rows, legacy chunks, tuned chunks]
  it.each<[string, number, number[], number[]]>([
    ["UT-BULKCHUNK-010", 1, [1], [1]],
    ["UT-BULKCHUNK-011", 9, [9], [9]],
    ["UT-BULKCHUNK-012", 10, [10], [10]],
    ["UT-BULKCHUNK-013", 19, [19], [19]],
    ["UT-BULKCHUNK-014", 20, [20], [10, 10]],
    ["UT-BULKCHUNK-015", 24, [24], [10, 10, 4]],
    ["UT-BULKCHUNK-016", 49, [49], [10, 10, 10, 10, 9]],
    ["UT-BULKCHUNK-017", 60, [25, 25, 10], times(6, 10)],
    ["UT-BULKCHUNK-018", 96, [25, 25, 25, 21], times(8, 12)],
    ["UT-BULKCHUNK-019", 500, times(4, 125), [...times(7, 63), 59]],
    ["UT-BULKCHUNK-020", 2000, times(4, 500), times(8, 250)],
    ["UT-BULKCHUNK-021", 3500, times(7, 500), [...times(7, 438), 434]],
  ])("%s %i rows → legacy %j, tuned %j", async (_id, n, legacy, tuned) => {
    expect(await sentSizes(n, LEGACY_BULK_TUNING)).toEqual(legacy);
    expect(await sentSizes(n, TUNED_BULK_TUNING)).toEqual(tuned);
    expect(bulkRequestCount(n, LEGACY_BULK_TUNING)).toBe(legacy.length);
    expect(bulkRequestCount(n, TUNED_BULK_TUNING)).toBe(tuned.length);
  });

  it("UT-BULKCHUNK-022 bulkRequestCount: 0 rows is 0 requests; a sequential tuning (parallel 1) is one per maxChunk", () => {
    expect(bulkRequestCount(0)).toBe(0);
    const sequential = { ...LEGACY_BULK_TUNING, parallel: 1 };
    expect(bulkRequestCount(1001, sequential)).toBe(3);
    expect(bulkRequestCount(60, sequential)).toBe(1);
  });

  it("UT-BULKCHUNK-023 no tuned chunk is above maxChunk, and no split chunk but the last is below minChunk (20…4,000 rows)", () => {
    const { minChunk, parallel, chunkSize } = bulkChunkOptions(TUNED_BULK_TUNING);
    for (let n = 2 * minChunk; n <= 4000; n += 37) {
      const requests = bulkRequestCount(n, TUNED_BULK_TUNING);
      const size = Math.ceil(n / requests);
      expect(size).toBeLessThanOrEqual(chunkSize);
      expect(size).toBeGreaterThanOrEqual(minChunk);
      expect(requests).toBeLessThanOrEqual(parallel);
    }
  });
});

describe("through the bulk sender (`upsertRowsByAction`, the shared write gate)", () => {
  it("UT-BULKCHUNK-030 a 96-row group goes out as the tuned 8 requests of 12, all at once", async () => {
    let release: () => void = () => undefined;
    hold = new Promise<void>((r) => { release = r; });
    const run = upsertRowsByAction(CAPEX_COSTS, targets(96, true), "upsert costs");
    await vi.waitFor(() => expect(bulkCalls).toHaveLength(8));
    expect(inFlight).toBe(8);
    release();
    await expect(run).resolves.toEqual({ requests: 8 });
    expect(bulkCalls.map((c) => c.rows)).toEqual(times(8, 12));
  });

  it("UT-BULKCHUNK-031 peak in flight never exceeds SAVE_REQUEST_LIMIT, even when the groups ask for more", async () => {
    let release: () => void = () => undefined;
    hold = new Promise<void>((r) => { release = r; });
    const meter = createRequestMeter();
    // 3,500 costs (create 1,750 ‖ update 1,750: 8 + 8 requests of 219), 200 contracts (create 100
    // ‖ update 100: 8 + 8 of 13) and 400 more costs (8 of 50) ask for 40 slots at once.
    const runs = [
      upsertRowsByAction(CAPEX_COSTS, [...targets(1750, true, "a"), ...targets(1750, false, "b")], "costs", undefined, { meter }),
      upsertRowsByAction(CAPEX_CONTRACTS, [...targets(100, true, "c"), ...targets(100, false, "d")], "contracts", undefined, { meter }),
      upsertRowsByAction(CAPEX_COSTS, targets(400, true, "e"), "stage B", undefined, { meter }),
    ];
    const asked = bulkRequestCount(1750) * 2 + bulkRequestCount(100) * 2 + bulkRequestCount(400);
    expect(asked).toBeGreaterThan(SAVE_REQUEST_LIMIT);
    await vi.waitFor(() => expect(bulkCalls).toHaveLength(SAVE_REQUEST_LIMIT));
    // Give a leaking gate every chance to let one more through.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(bulkCalls).toHaveLength(SAVE_REQUEST_LIMIT);
    expect(inFlight).toBe(SAVE_REQUEST_LIMIT);
    release();
    await Promise.all(runs);
    expect(bulkCalls).toHaveLength(asked);
    expect(peakInFlight).toBe(SAVE_REQUEST_LIMIT);
    expect(meter.peak).toBe(SAVE_REQUEST_LIMIT);
    expect(meter.sharedPeak).toBeLessThanOrEqual(SAVE_REQUEST_LIMIT);
    expect(meter.count).toBe(asked);
  });

  it("UT-BULKCHUNK-032 a 501 on every tuned chunk falls back per row, and every refused request is counted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    notImplemented = true;
    const result = await upsertRowsByAction(CAPEX_COSTS, targets(120, true), "upsert costs");
    // 120 rows → 8 parallel chunks of 15, all refused with 501, then 120 per-row PATCHes.
    expect(bulkCalls.map((c) => c.rows)).toEqual(times(8, 15));
    expect(rowUpdates).toHaveLength(120);
    expect(result).toEqual({ requests: 8 + 120 });
  });

  it("UT-BULKCHUNK-033 a 501 on a group too small to split counts its one refused request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    notImplemented = true;
    const result = await upsertRowsByAction(CAPEX_COSTS, targets(19, true), "upsert costs");
    expect(bulkCalls.map((c) => c.rows)).toEqual([19]);
    expect(result).toEqual({ requests: 1 + 19 });
  });
});
