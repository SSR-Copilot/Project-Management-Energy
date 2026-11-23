/**
 * OPT-26 (B4, D160) - the OPEX row warnings are computed once per card instead of once per row.
 *
 * The replaced per-row path is still reachable (`toOpexRow` without `warnings`), so it is the oracle: every row of
 * generated cards must carry the same `warnAlignment` and cells either way, including the reproduced O&M defect O-4b
 * (one answer for every row of a device card). The recompute counts are comparator calls (`localeCompare`), which
 * do not depend on the machine.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPEX_AGGREGATION, cardAlignWarnings, costsInScope, otherAlignWarningVisible, omAlignWarningVisible, toOpexRow,
  type OpexCost, type OpexMode,
} from "./opexRules";

const project = {
  countryName: "Germany", areaStateProvince: null, projectStartDate: "2027-01-01", endDate: "2037-12-31",
};

const base = (o: Partial<OpexCost>): OpexCost => ({
  id: "p", name: "N", description: "D", parentCostId: null, subaccountId: "sub", deviceTypeInProjectId: "dev",
  startDate: "2027-01-01", durationYears: 5, durationMonths: 0, currencyId: "eur", currencyName: "Euro", fixCosts: 1,
  percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null, aggregation: OPEX_AGGREGATION.sum,
  distributionFrequency: 12, threshold: false, thresholdType: null, thresholdIndividual: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null, inflationStartYear: null,
  inflationCountryArea: null, alignWithProjectDuration: false, externalContract: false, isStandardContract: false,
  isStartDateStandardAssumption: false, createdOn: "2026-01-01T00:00:00Z", ...o,
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** A card of `k` costs: chains of one root and some periods, ties on start date and name, a grandchild, an orphan parent. */
function card(seed: number, k: number): OpexCost[] {
  const r = rng(seed); const int = (n: number) => Math.floor(r() * n);
  const costs: OpexCost[] = [];
  for (let i = 0; i < k; i++) {
    const roll = r();
    const parent = costs.length === 0 || roll < 0.25 ? null
      : roll < 0.9 ? costs[int(costs.length)]!.id // a root OR a period: grandchildren happen
        : "missing-parent";
    costs.push(base({
      id: `c${i}`, name: `Name ${int(4)}`, description: `Desc ${int(3)}`, parentCostId: parent,
      startDate: r() < 0.05 ? null : ["2027-01-01", "2027-06-01", "2032-01-01", "2032-01-01", "2037-01-01"][int(5)]!,
      durationYears: [1, 5, 10, 5][int(4)]!, durationMonths: [0, 0, 6][int(3)]!,
      alignWithProjectDuration: r() < 0.6,
    }));
  }
  return costs;
}

const rowsOld = (mode: OpexMode, cardCosts: OpexCost[]) =>
  cardCosts.map((cost) => toOpexRow({ cost, mode, selectedId: null, project, cardCosts }));
const rowsNew = (mode: OpexMode, cardCosts: OpexCost[]) => {
  const warnings = cardAlignWarnings(mode, cardCosts, project);
  return cardCosts.map((cost) => toOpexRow({ cost, mode, selectedId: null, project, cardCosts, warnings }));
};

afterEach(() => vi.restoreAllMocks());

describe("OPT-26 cardAlignWarnings (differential against the per-row computation)", () => {
  it("UT-OPEX-OPT-001 every row of 600 generated Other-OPEX cards gets the same warning and cells", () => {
    let warned = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const costs = card(seed, 1 + (seed % 24));
      const o = rowsOld("other", costs); const n = rowsNew("other", costs);
      expect(n, `seed ${seed}`).toEqual(o);
      warned += o.filter((x) => x.warnAlignment).length;
    }
    expect(warned).toBeGreaterThan(50); // the generated data really exercises the warning
  });

  it("UT-OPEX-OPT-002 every row of 600 generated O&M cards gets the same warning (defect O-4b: one answer per card)", () => {
    let warned = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const costs = card(seed + 7000, 1 + (seed % 24));
      const o = rowsOld("om", costs); const n = rowsNew("om", costs);
      expect(n, `seed ${seed}`).toEqual(o);
      expect(new Set(n.map((x) => x.warnAlignment)).size).toBe(1); // O-4b: the same icon on every row
      warned += o.filter((x) => x.warnAlignment).length;
    }
    expect(warned).toBeGreaterThan(50);
  });

  it("UT-OPEX-OPT-003 the O-4b card: the offending LAST row decides for ALL rows, as before", () => {
    const costs = [
      base({ id: "a", description: "A", startDate: "2027-01-01", durationYears: 10, durationMonths: 11, alignWithProjectDuration: true }),
      base({ id: "b", description: "B", startDate: "2027-06-01", durationYears: 1, alignWithProjectDuration: true }),
    ];
    const warnings = cardAlignWarnings("om", costs, project);
    expect(costs.map((c) => warnings(c))).toEqual([true, true]);
    expect(omAlignWarningVisible(costs, project)).toBe(true);
  });

  it("UT-OPEX-OPT-004 the helper agrees with otherAlignWarningVisible row by row, ties included", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const costs = card(seed + 20000, 2 + (seed % 15));
      const warnings = cardAlignWarnings("other", costs, project);
      for (const c of costs) expect(warnings(c), `seed ${seed} ${c.id}`).toBe(otherAlignWarningVisible(c, costs, project));
    }
  });
});

describe("OPT-26 recompute counts (comparator calls, k = 40 rows)", () => {
  /** `localeCompare` calls while building the rows of one card. */
  function compares(build: () => unknown): number {
    const spy = vi.spyOn(String.prototype, "localeCompare");
    build();
    const n = spy.mock.calls.length;
    spy.mockRestore();
    return n;
  }

  it("UT-OPEX-OPT-005 O&M: the card is sorted once, not once per row", () => {
    const costs = costsInScope(card(99, 40).map((c) => ({ ...c, deviceTypeInProjectId: "dev" })), "om", "dev");
    const before = compares(() => rowsOld("om", costs));
    const after = compares(() => rowsNew("om", costs));
    // Measured: before >= 40 sorts of 40 rows each; after = ONE such sort.
    expect(after).toBeLessThan(before / 20);
    expect(after).toBeLessThan(400);
  });

  it("UT-OPEX-OPT-006 Other OPEX: one pass over the card, not a filter + sort per row", () => {
    // One cost type with 39 later periods: the worst case for the per-row chain filter + sort.
    const costs = Array.from({ length: 40 }, (_, i) => base({
      id: `c${i}`, name: `N ${i}`, parentCostId: i === 0 ? null : "c0", startDate: `20${27 + (i % 10)}-0${1 + (i % 9)}-01`,
    }));
    const before = compares(() => rowsOld("other", costs));
    const after = compares(() => rowsNew("other", costs));
    expect(after).toBeLessThan(before / 5);
    expect(after).toBeLessThanOrEqual(2 * 40); // at most two comparisons per cost (its own chain and the chain it heads)
  });
});
