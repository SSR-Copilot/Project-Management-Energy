/**
 * `data/settings/milestones.ts` against mocked generated services — DR-1, DR-2, DR-4, FR-8.
 * Ids: UT-MSDATA-nnn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let fetchCalls: { label: string; options: Record<string, unknown> }[] = [];
let rowsByLabel: Record<string, unknown[]> = {};

vi.mock("../client", async (importOriginal) => ({
  // The real `updateRecordIfExists` (V-1) runs against the fake SDK client below.
  ...(await importOriginal<typeof import("../client")>()),
  fetchAll: async (label: string, _page: unknown, options: Record<string, unknown>) => {
    fetchCalls.push({ label, options });
    return rowsByLabel[label] ?? [];
  },
}));

/** V-1: ids the pre-update existence check reports as deleted. */
let gone = new Set<string>();
const update = vi.fn();
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: async (_table: string, options: { filter?: string; select?: string[] }) => {
      const key = /^(\w+) eq ([0-9a-f-]{36})$/.exec(options?.filter ?? "");
      if (!key || options.select?.length !== 1) return { success: false, error: { message: "unexpected read" } };
      return { success: true, data: gone.has(key[2]!) ? [] : [{ [key[1]!]: key[2] }] };
    },
    updateRecordAsync: (...args: unknown[]) => update(...args),
  }),
}));

const updateMultiple = vi.fn();
vi.mock("../bulkWrite", async (importOriginal) => ({
  // The real shared `bulkWithFallback` (E15) runs; only the bulk request itself is faked.
  ...(await importOriginal<typeof import("../bulkWrite")>()),
  updateMultiple: (...args: unknown[]) => updateMultiple(...args),
}));

vi.mock("@/generated/services/Vsb_milestonesstandardassumptionsesService", () => ({
  Vsb_milestonesstandardassumptionsesService: {
    getAll: vi.fn(),
    update: vi.fn(() => { throw new Error("the unguarded service update must never be called (V-1)"); }),
    create: vi.fn(() => { throw new Error("create must never be called"); }),
    delete: vi.fn(() => { throw new Error("delete must never be called"); }),
  },
}));
import {
  MSA_ENTITY_SET, MSA_ODATA_TYPE, MSA_SELECT,
  listMilestoneAssumptions, saveMilestonePatches,
  type MilestonePatch,
} from "./milestones";
import { DataError, RecordGoneError } from "@/platform/errors";

beforeEach(() => {
  fetchCalls = [];
  rowsByLabel = {};
  updateMultiple.mockReset();
  update.mockReset();
  gone = new Set();
});

describe("reads", () => {
  // UT-MSDATA-001 (countries) moved with the read itself to the shared `data/countries.test.ts`
  // (M6); the screen maps the shared rows with `toMilestoneCountries` (rules.test.ts UT-MS-003).

  it("UT-MSDATA-002 assumptions: one query for all countries, mapped columns (DR-2)", async () => {
    rowsByLabel["list milestone standard assumptions"] = [{
      vsb_milestonesstandardassumptionsid: "r1",
      vsb_name: "average duration [months]",
      _vsb_country_value: "c1",
      vsb_technology: 952850000,
      vsb_cluster1: 12, vsb_finalinvestmentdecision: null, vsb_salesduration: 24,
    }];
    const rows = await listMilestoneAssumptions();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.options).toMatchObject({ select: MSA_SELECT, filter: "statecode eq 0" });
    expect(fetchCalls[0]?.options["filter"]).not.toContain("_vsb_country_value");
    // DR-3: "first row of a kind" is stable — ordered by creation, then id (gap T9).
    expect(fetchCalls[0]?.options["orderBy"]).toEqual(["createdon asc", "vsb_milestonesstandardassumptionsid asc"]);
    expect(MSA_SELECT).toContain("vsb_salesduration");
    expect(MSA_SELECT).not.toContain("vsb_salesend");
    expect(rows[0]).toMatchObject({
      id: "r1", countryId: "c1", technology: 952850000,
      values: { cluster1: 12, fid: undefined, salesEnd: 24, cluster5: undefined },
    });
  });
});

describe("saveMilestonePatches (DR-4, FR-8)", () => {
  // GUIDs: the guarded per-row fallback (V-1) validates the id.
  const R_M = "10000000-0000-0000-0000-00000000000a";
  const R_S = "10000000-0000-0000-0000-00000000000b";
  const durations: MilestonePatch = { id: R_M, changes: { vsb_cluster1: 13 }, label: "Wind – Cluster Durations" };
  const rates: MilestonePatch = { id: R_S, changes: { vsb_cluster1: 0.55 }, label: "Wind – Success Rates" };

  it("UT-MSDATA-010 sends nothing when there is nothing to save", async () => {
    await expect(saveMilestonePatches([{ ...durations, changes: {} }])).resolves.toEqual({ saved: [], failed: [] });
    expect(updateMultiple).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("UT-MSDATA-011 one UpdateMultiple with only the changed columns (AC-8a)", async () => {
    updateMultiple.mockResolvedValue(undefined);
    const outcome = await saveMilestonePatches([durations, rates]);
    expect(updateMultiple).toHaveBeenCalledTimes(1);
    expect(updateMultiple).toHaveBeenCalledWith(MSA_ENTITY_SET, MSA_ODATA_TYPE, [
      { vsb_milestonesstandardassumptionsid: R_M, vsb_cluster1: 13 },
      { vsb_milestonesstandardassumptionsid: R_S, vsb_cluster1: 0.55 },
    ]);
    expect(update).not.toHaveBeenCalled();
    expect(outcome).toEqual({ saved: [durations, rates], failed: [] });
  });

  it("UT-MSDATA-012 a refused bulk write falls back per row and reports which rows failed (AC-8d)", async () => {
    updateMultiple.mockRejectedValue(new Error("bulk write failed"));
    update.mockImplementation(async (_table: string, id: string) => (id === R_M
      ? { success: false, error: { message: "Value out of range", status: 400 } }
      : { success: true, data: {} }));
    const outcome = await saveMilestonePatches([durations, rates]);
    expect(update).toHaveBeenCalledWith(MSA_ENTITY_SET, R_M, { vsb_cluster1: 13 });
    expect(update).toHaveBeenCalledWith(MSA_ENTITY_SET, R_S, { vsb_cluster1: 0.55 });
    expect(outcome.saved).toEqual([rates]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.patch).toBe(durations);
    expect(outcome.failed[0]?.error).toBeInstanceOf(DataError);
  });

  it("UT-MSDATA-014 a per-row update that REJECTS is reported as failed, not thrown (gap T9)", async () => {
    updateMultiple.mockRejectedValue(new Error("bulk write failed"));
    update.mockImplementation(async (_table: string, id: string) => {
      if (id === R_M) throw new Error("connection reset");
      return { success: true, data: {} };
    });
    const outcome = await saveMilestonePatches([durations, rates]);
    expect(outcome.saved).toEqual([rates]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.patch).toBe(durations);
    expect(outcome.failed[0]?.error).toBeInstanceOf(DataError);
    expect(String(outcome.failed[0]!.error)).toMatch(/connection reset/);
  });

  it("UT-MSDATA-015 V-1 (S5): the per-row fallback never recreates a deleted row — gone row fails with RecordGoneError, nothing sent for it", async () => {
    updateMultiple.mockRejectedValue(new Error("bulk write failed: entity does not exist"));
    gone.add(R_M);
    update.mockResolvedValue({ success: true, data: {} });
    const outcome = await saveMilestonePatches([durations, rates]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(MSA_ENTITY_SET, R_S, { vsb_cluster1: 0.55 });
    expect(outcome.saved).toEqual([rates]);
    expect(outcome.failed[0]?.patch).toBe(durations);
    expect(outcome.failed[0]?.error).toBeInstanceOf(RecordGoneError);
  });

  it("UT-MSDATA-013 a 403 surfaces as a forbidden DataError (FR-1 AC-1b)", async () => {
    updateMultiple.mockRejectedValue(new Error("bulk write failed"));
    update.mockResolvedValue({ success: false, error: { message: "denied", status: 403 } });
    const outcome = await saveMilestonePatches([durations]);
    const error = outcome.failed[0]?.error as DataError;
    expect(error.isForbidden).toBe(true);
    expect(outcome.saved).toEqual([]);
  });
});
