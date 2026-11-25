/**
 * PA-02 (dvopt T-05): `./financeBulk.ts` registers the default bulk backend as well as the schedule tables.
 *
 * A FRESH module graph (`vi.resetModules`) that loads neither `./generators.ts` nor `./checklistBulk.ts`: before the fix the
 * default factory was null, `getBulkBackend()` threw at the bulk step, and a tranche Save that had already written the tranche
 * (and the small sets) ended half-applied. Only the SDK edge is faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ create: [] as { es: string; n: number }[] }));

vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: { CreateMultiple: async (es: string, t: unknown[]) => { sent.create.push({ es, n: t.length }); return { success: true, data: {} }; } },
}));
vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: { UpdateMultiple: async () => ({ success: true, data: {} }) },
}));
const rowService = { create: async () => ({ success: true, data: {} }), update: async () => ({ success: true, data: {} }), getAll: async () => ({ success: true, data: [] }) };
vi.mock("@/generated/services/Vsb_financinginputsrepaymentamountsService", () => ({ Vsb_financinginputsrepaymentamountsService: rowService }));
vi.mock("@/generated/services/Vsb_financinginputstepupmarginsesService", () => ({ Vsb_financinginputstepupmarginsesService: rowService }));

beforeEach(() => { sent.create.length = 0; vi.resetModules(); });

const client = { createRecordAsync: vi.fn(), updateRecordAsync: vi.fn(), deleteRecordAsync: vi.fn() };

describe("UT-FINBULKREG Finance registers the default bulk backend (PA-02)", () => {
  it("UT-FINBULKREG-001 a fresh graph with only financeBulk loaded has a default bulk backend", async () => {
    const { getBulkBackend } = await import("./bulkBackend");
    expect(() => getBulkBackend()).toThrow(/No bulk backend is installed/);
    await import("./financeBulk");
    expect(() => getBulkBackend()).not.toThrow();
  });

  it("UT-FINBULKREG-002 a plan with a createMany step on a Finance table runs through the registered backend (no throw after earlier writes)", async () => {
    await import("./financeBulk");
    const { ES_FINANCE } = await import("./dataverseNames");
    const { createMany } = await import("./writePlan");
    const { executePlan } = await import("./executePlan");
    const { OWNING_BU_BIND } = await import("./odata");
    const rows = [1, 2, 3].map((n) => ({ id: `00000000-0000-0000-0000-00000000000${n}`, data: { vsb_name: `r${n}`, [OWNING_BU_BIND]: "/businessunits(b1)" } }));
    const result = await executePlan(
      { writes: [createMany(ES_FINANCE.financingInputsRepaymentAmounts, rows, "repayment schedule")], log: [] },
      "test", client as never,
    );
    expect(result.done).toBe(3);
    expect(sent.create).toEqual([{ es: ES_FINANCE.financingInputsRepaymentAmounts, n: 3 }]);
  });

  it("UT-FINBULKREG-003 financeBulk imports neither generators nor the Generators screen module (no cycle)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./financeBulk.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "\.\/generators"/);
  });
});
