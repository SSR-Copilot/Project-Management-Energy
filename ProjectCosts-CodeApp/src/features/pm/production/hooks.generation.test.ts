/**
 * UT-PROD-OPT-1xx — the one-shot generation uses the project the roll-up read (OPT-24).
 * BEFORE (unmodified tree): `generateIfDue` re-read the project (`loadProductionProject`) although `rollUp` had just read it
 * (UT-PRODBASE-103: 2 project reads in a save that generates). The roll-up writes only yield columns, so the generation plan
 * cannot depend on which of the two reads it gets: proved here by building it from both.
 */
import { describe, expect, it } from "vitest";
import { planStandardContracts, type GenerationInputs } from "./rules";
import type { WritePlan } from "@/data/writePlan";
import { generation, project } from "./productionPlans.testkit";

/** A plan without its `concurrencyGroup` numbers, which come from a module-wide counter (they differ between any two calls). */
const shape = (inputs: GenerationInputs, opts?: { waves?: boolean }): unknown => {
  const plan: WritePlan = planStandardContracts(inputs, opts);
  return { ...plan, writes: plan.writes.map((w) => { const { concurrencyGroup: _g, ...rest } = w as typeof w & { concurrencyGroup?: number }; return rest; }) };
};

describe("planStandardContracts ignores the columns the roll-up writes (OPT-24)", () => {
  it("UT-PROD-OPT-101 the same plan for the project read BEFORE the roll-up and the project read AFTER it", () => {
    const before = generation(3, 12, 2);
    // What the roll-up changes on the project row: the stored yield totals (and nothing the generation uses).
    const after = {
      ...before,
      project: project({
        grossYield: 99_999, windSpeed: 9.5, irradiation: 1100, netYieldP50: 88_000, netYieldP75: 80_000, netYieldP90: 70_000,
      }),
    };
    expect(shape(after)).toEqual(shape(before));
    expect(shape(after, { waves: true })).toEqual(shape(before, { waves: true }));
  });
});
