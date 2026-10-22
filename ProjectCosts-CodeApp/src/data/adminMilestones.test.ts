/**
 * `data/adminMilestones.ts` against mocked generated services.
 * Ids: UT-MSDATA-nnn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let fetchCalls: { label: string; options: Record<string, unknown> }[] = [];
let rowsByLabel: Record<string, unknown[]> = {};

vi.mock("./client", async (importOriginal) => ({
  // The real `updateRecordIfExists` runs against the fake SDK client below.
  ...(await importOriginal<typeof import("./client")>()),
  fetchAll: async (label: string, _page: unknown, options: Record<string, unknown>) => {
    fetchCalls.push({ label, options });
    return rowsByLabel[label] ?? [];
  },
}));

/** Ids the pre-update existence check reports as deleted. */
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


vi.mock("@/generated/services/Vsb_milestonesstandardassumptionsesService", () => ({
  Vsb_milestonesstandardassumptionsesService: {
    getAll: vi.fn(),
    update: vi.fn(() => { throw new Error("the unguarded service update must never be called (upsert guard)"); }),
    create: vi.fn(() => { throw new Error("create must never be called"); }),
    delete: vi.fn(() => { throw new Error("delete must never be called"); }),
  },
}));
import {
  MSA_ENTITY_SET, MSA_SELECT,
  listMilestoneAssumptions, saveMilestonePatches,
  type MilestonePatch,
} from "./adminMilestones";
import { DataError, RecordGoneError } from "@/platform/errors";

beforeEach(() => {
  fetchCalls = [];
  rowsByLabel = {};
  update.mockReset();
  gone = new Set();
});

describe("Reads", () => {
  // UT-MSDATA-001 (countries) moved with the read itself to the shared `data/countries.test.ts`
  // the screen maps the shared rows with `toMilestoneCountries` (rules.test.ts UT-ADMILE-085).

  it("UT-MSDATA-002 assumptions: one query for all countries, mapped columns", async () => {
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
    // "first row of a kind" is stable — ordered by creation, then id.
    expect(fetchCalls[0]?.options["orderBy"]).toEqual(["createdon asc", "vsb_milestonesstandardassumptionsid asc"]);
    expect(MSA_SELECT).toContain("vsb_salesduration");
    expect(MSA_SELECT).not.toContain("vsb_salesend");
    expect(rows[0]).toMatchObject({
      id: "r1", countryId: "c1", technology: 952850000,
      values: { cluster1: 12, fid: undefined, salesEnd: 24, cluster5: undefined },
    });
  });
});

describe("SaveMilestonePatches", () => {
  // GUIDs: the guarded per-row fallback validates the id.
  const R_M = "10000000-0000-0000-0000-00000000000a";
  const R_S = "10000000-0000-0000-0000-00000000000b";
  const durations: MilestonePatch = { id: R_M, changes: { vsb_cluster1: 13 }, label: "Wind – Cluster Durations" };
  const rates: MilestonePatch = { id: R_S, changes: { vsb_cluster1: 0.55 }, label: "Wind – Success Rates" };

  it("UT-MSDATA-010 sends nothing when there is nothing to save", async () => {
    await expect(saveMilestonePatches([{ ...durations, changes: {} }])).resolves.toEqual({ saved: [], failed: [] });
    expect(update).not.toHaveBeenCalled();
  });

  it("UT-MSDATA-011 one guarded update per changed row, only the changed columns (master has no bulk services)", async () => {
    update.mockResolvedValue({ success: true, data: {} });
    const outcome = await saveMilestonePatches([durations, rates]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(MSA_ENTITY_SET, R_M, { vsb_cluster1: 13 });
    expect(update).toHaveBeenCalledWith(MSA_ENTITY_SET, R_S, { vsb_cluster1: 0.55 });
    expect(outcome).toEqual({ saved: [durations, rates], failed: [] });
  });

  it("UT-MSDATA-012 a refused row is reported as failed while the others save", async () => {
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

  it("UT-MSDATA-014 a per-row update that REJECTS is reported as failed, not thrown", async () => {
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

  it("UT-MSDATA-015 the per-row save never recreates a deleted row — gone row fails with RecordGoneError, nothing sent for it", async () => {
    gone.add(R_M);
    update.mockResolvedValue({ success: true, data: {} });
    const outcome = await saveMilestonePatches([durations, rates]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(MSA_ENTITY_SET, R_S, { vsb_cluster1: 0.55 });
    expect(outcome.saved).toEqual([rates]);
    expect(outcome.failed[0]?.patch).toBe(durations);
    expect(outcome.failed[0]?.error).toBeInstanceOf(RecordGoneError);
  });

  it("UT-MSDATA-013 a 403 surfaces as a forbidden DataError", async () => {
    update.mockResolvedValue({ success: false, error: { message: "denied", status: 403 } });
    const outcome = await saveMilestonePatches([durations]);
    const error = outcome.failed[0]?.error as DataError;
    expect(error.isForbidden).toBe(true);
    expect(outcome.saved).toEqual([]);
  });
});
