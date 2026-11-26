/**
 * UT-MSTONE-DVOPT-1xx — PB-12, the generators' price-ladder reads (`listProjectGeneratorsForRepricing`).
 * BEFORE: one read per 40 generator ids, one after the other. NOW (`MILESTONES_REPRICE_TOGETHER`): the chunks are read side by side
 * (the existing pool of 8); the result is the same rows in the same order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ inFlight: 0, peak: 0, ladderCalls: 0 }));

vi.mock("./client", () => ({
  fetchPage: async () => [],
  fetchAll: async (label: string, _fn: unknown, opts: { filter?: string }) => {
    if (label === "list the project's generator types") {
      return Array.from({ length: 90 }, (_, i) => ({
        vsb_generatortypeinprojectid: `t-${i}`, _vsb_generator_value: `g-${i}`, vsb_numberofgenerators: i + 1, vsb_generatorscost: 5,
      }));
    }
    if (label === "load the generator price ladders") {
      h.ladderCalls += 1;
      h.inFlight += 1; h.peak = Math.max(h.peak, h.inFlight);
      await new Promise((r) => setTimeout(r, 5));
      h.inFlight -= 1;
      // one ladder row per id named in this chunk's filter
      return [...(opts.filter ?? "").matchAll(/g-(\d+)/g)].map((m) => ({
        vsb_generatorid: `g-${m[1]}`, vsb_wtgprice: Number(m[1]), vsb_wtgprice2: null, vsb_wtgprice3: null, vsb_wtgprice4: null,
        vsb_wtgprice5: null, vsb_additionalfoundationcost: 1, vsb_foundationcostincluded: true,
      }));
    }
    return [];
  },
}));
// `idIn` / `guid` format real GUIDs; the ids here are plain labels, so keep the filter readable for the fake above.
vi.mock("./odata", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./odata")>();
  return { ...mod, idIn: (_c: string, ids: readonly string[]) => ids.join(","), lookupEq: () => "p" };
});

import { listProjectGeneratorsForRepricing } from "./milestones";
import { setMilestonesRepriceTogether } from "@/features/pm/milestones/milestonesPerfFlags";

beforeEach(() => { h.inFlight = 0; h.peak = 0; h.ladderCalls = 0; });
afterEach(() => { setMilestonesRepriceTogether(null); });

describe("UT-MSTONE-DVOPT PB-12 the price-ladder reads", () => {
  it("UT-MSTONE-DVOPT-101 ON: three chunks of 40 ids are read side by side (peak 3), one request each", async () => {
    const out = await listProjectGeneratorsForRepricing("p");
    expect(h.ladderCalls).toBe(3);
    expect(h.peak).toBe(3);
    expect(out).toHaveLength(90);
  });

  it("UT-MSTONE-DVOPT-102 OFF: one after the other (peak 1), same number of requests", async () => {
    setMilestonesRepriceTogether(false);
    await listProjectGeneratorsForRepricing("p");
    expect(h.ladderCalls).toBe(3);
    expect(h.peak).toBe(1);
  });

  it("UT-MSTONE-DVOPT-103 differential: ON and OFF return the same generators, in the same order, with the same ladders", async () => {
    const on = await listProjectGeneratorsForRepricing("p");
    setMilestonesRepriceTogether(false);
    const off = await listProjectGeneratorsForRepricing("p");
    expect(off).toEqual(on);
    expect(on[0]!.wtgPrices[0]).toBe(0);
    expect(on[89]!.wtgPrices[0]).toBe(89);
  });
});
