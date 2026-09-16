/**
 * Cluster timeline and year window — stage 2.1.
 *
 * The behaviour that matters here is what happens when the data is INCOMPLETE. Real projects
 * have gaps in the milestone chain, and the canvas' `Month()`/`Year()` of a blank date is 0,
 * which would file a cost in year 0.
 */
import { describe, expect, it } from "vitest";
import {
  SENTINEL_YEAR, canGoNextYear, canGoPreviousYear, clampSelectedYear, clusterBoundaries,
  clusterDurations, costAllowedStart, navigationWindow, projectPeriods, synthesiseClusterDates,
  type MilestoneDurations,
} from "./clusters";
import type { ProjectMilestones } from "../contracts/rules";

const d = (iso: string) => new Date(`${iso}T12:00:00`);

/** A fully populated chain: every cluster boundary known. */
const fullChain: ProjectMilestones = {
  feasibilityStudies: d("2015-03-01"),
  developmentStarted: d("2017-06-01"),
  applicationSubmitted: d("2019-09-01"),
  legallyBindingPermits: d("2022-01-01"),
  construction: d("2025-04-01"),
  operationsStartCod: d("2026-08-01"),
  endDate: d("2046-08-01"),
};

describe("clusterDurations", () => {
  it("UT-CLU-001 chains the six clusters from the project's milestones", () => {
    const clusters = clusterDurations(fullChain);
    expect(clusters).toHaveLength(6);
    expect(clusters[0]).toEqual({
      order: 1, name: "Cluster 1",
      startYear: 2015, startMonth: 3, endYear: 2017, endMonth: 6,
    });
    // Each cluster starts where the previous ended.
    for (let i = 1; i < clusters.length; i += 1) {
      expect(clusters[i]?.startYear).toBe(clusters[i - 1]?.endYear);
      expect(clusters[i]?.startMonth).toBe(clusters[i - 1]?.endMonth);
    }
  });

  it("UT-CLU-002 ends cluster 6 at the project end date", () => {
    expect(clusterDurations(fullChain).at(-1)).toMatchObject({
      order: 6, endYear: 2046, endMonth: 8,
    });
  });

  it("UT-CLU-003 omits a cluster whose boundary is missing, rather than dating it to year 0", () => {
    // This is the whole reason the function is defensive: `Year(Blank())` is 0 in Power Fx.
    const gap: ProjectMilestones = { ...fullChain, applicationSubmitted: undefined };
    const orders = clusterDurations(gap).map((c) => c.order);
    // Clusters 2 and 3 both need `applicationSubmitted`.
    expect(orders).toEqual([1, 4, 5, 6]);
  });

  it("UT-CLU-004 ignores the year-1 sentinel", () => {
    const sentinel: ProjectMilestones = { ...fullChain, feasibilityStudies: d("0001-01-01") };
    expect(clusterDurations(sentinel).map((c) => c.order)).not.toContain(1);
  });

  it("UT-CLU-005 returns nothing when the project has no milestones at all", () => {
    expect(clusterDurations(undefined)).toEqual([]);
    expect(clusterDurations({})).toEqual([]);
  });
});

describe("clusterBoundaries", () => {
  it("UT-CLU-006 gives seven boundaries for six clusters", () => {
    const bounds = clusterBoundaries(fullChain);
    expect(bounds).toHaveLength(7);
    expect(bounds[0]).toBe("2015-03-01");
    expect(bounds[6]).toBe("2046-08-01");
  });

  it("UT-CLU-007 leaves a missing boundary undefined so the panel can skip its cluster", () => {
    const bounds = clusterBoundaries({ ...fullChain, construction: undefined });
    expect(bounds[4]).toBeUndefined();
    expect(bounds[3]).toBe("2022-01-01");
  });
});

describe("costAllowedStart", () => {
  const today = d("2026-06-15");

  it("UT-CLU-008 uses the acquisition date when the project started past Greenfield", () => {
    const start = costAllowedStart(
      { acquisitionDate: d("2019-07-04"), startDate: d("2015-01-01") }, 3, today,
    );
    expect(start.year).toBe(2019);
    expect(start.date.getMonth()).toBe(0); // January
  });

  it("UT-CLU-009 uses the project start date for a Greenfield project", () => {
    const start = costAllowedStart(
      { acquisitionDate: d("2019-07-04"), startDate: d("2015-01-01") }, 0, today,
    );
    expect(start.year).toBe(2015);
  });

  it("UT-CLU-010 falls back to the other date when the preferred one is missing", () => {
    expect(costAllowedStart({ acquisitionDate: undefined, startDate: d("2015-01-01") }, 3, today)
      .year).toBe(2015);
  });

  it("UT-CLU-011 falls back to today when the project has neither", () => {
    expect(costAllowedStart({}, 0, today).year).toBe(2026);
  });

  it("UT-CLU-012 treats a sentinel year as absent", () => {
    // Note `new Date(1, 0, 1)` is 1901, not year 1 — the two-digit-year mapping. A real
    // Dataverse sentinel arrives as an ISO string, so the fixture has to be one too.
    expect(costAllowedStart({ startDate: d("0001-01-01") }, 0, today).year).toBe(2026);
    expect(SENTINEL_YEAR).toBe(1900);
  });
});

describe("navigationWindow", () => {
  const today = d("2026-06-15");
  const project = {
    acquisitionDate: d("2019-07-04"),
    endDate: d("2046-08-01"),
    milestones: fullChain,
  };

  it("UT-CLU-013 spans the earliest start to the latest end", () => {
    const window = navigationWindow(project, clusterDurations(fullChain), 2015, 2026, today);
    expect(window.min).toBe(2015);
    expect(window.max).toBe(2046);
  });

  it("UT-CLU-014 keeps a selected year outside the window reachable", () => {
    // A cost already booked in 2050 must not become unreachable by the stepper.
    const window = navigationWindow(project, clusterDurations(fullChain), 2015, 2050, today);
    expect(window.max).toBe(2050);
  });

  it("UT-CLU-015 falls back to today when nothing is known", () => {
    const window = navigationWindow({}, [], Number.NaN, null, today);
    expect(window).toEqual({ min: 2026, max: 2026 });
  });

  it("UT-CLU-016 never returns an inverted window", () => {
    const window = navigationWindow(
      { acquisitionDate: d("2040-01-01") }, [], 2040, 2010, today,
    );
    expect(window.max).toBeGreaterThanOrEqual(window.min);
  });
});

describe("the stepper", () => {
  it("UT-CLU-017 clamps a year into the window", () => {
    expect(clampSelectedYear(2010, 2015, 2030)).toBe(2015);
    expect(clampSelectedYear(2040, 2015, 2030)).toBe(2030);
    expect(clampSelectedYear(2020, 2015, 2030)).toBe(2020);
  });

  it("UT-CLU-018 disables the arrows at the ends", () => {
    expect(canGoPreviousYear(2015, 2015)).toBe(false);
    expect(canGoPreviousYear(2016, 2015)).toBe(true);
    expect(canGoNextYear(2030, 2030)).toBe(false);
    expect(canGoNextYear(2029, 2030)).toBe(true);
  });

  it("UT-CLU-019 lists every year in the window", () => {
    expect(projectPeriods(2024, 2026)).toEqual([2024, 2025, 2026]);
    expect(projectPeriods(2026, 2026)).toEqual([2026]);
  });

  it("UT-CLU-020 returns nothing for an impossible window", () => {
    expect(projectPeriods(2030, 2020)).toEqual([]);
    expect(projectPeriods(Number.NaN, 2020)).toEqual([]);
  });
});

/* ═══════════════════════════════════════════ synthesised cluster dates ══ */

/**
 * `synthesiseClusterDates` — audit G5.
 *
 * A project ACQUIRED beyond Greenfield has no milestone rows for the clusters it never went
 * through, so `clusterDurations` dropped them and they vanished from the cluster picker, from
 * `navigationWindow` and from `buildStandardOptions`. The canvas back-computes them from
 * `Milestones Standard Assumptions` (`CapexScreenCode.txt:18138-18356`).
 *
 * The durations below are powers of two so that every assertion pins down exactly which columns
 * went into it — 63 months can only be 32+16+8+4+2+1, and the 24 in the cluster-4 step can only
 * be `Cluster 4` + `Final Investment Decision`. That last one is the point of the shape: there
 * are six duration columns for five chain steps because FID sits inside the 4-to-5 step.
 */
describe("synthesiseClusterDates", () => {
  const POWERS: MilestoneDurations = {
    cluster1: 1, cluster2: 2, cluster3: 4, cluster4: 8, finalInvestmentDecision: 16, cluster5: 32,
  };

  /** `YYYY-MM` — the only precision `clusterDurations` and `clusterBoundaries` ever read. */
  const ym = (date: Date | undefined) =>
    date === undefined
      ? undefined
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const chain = (m: ProjectMilestones) => [
    ym(m.feasibilityStudies), ym(m.developmentStarted), ym(m.applicationSubmitted),
    ym(m.legallyBindingPermits), ym(m.construction), ym(m.operationsStartCod),
  ];

  it("UT-CLU-021 leaves a Greenfield project's milestones completely alone", () => {
    // `If(varStartClusterNo = 0, gblSelectedProject.'N-...', ...)` on every cluster — no
    // arithmetic reaches a project that started at the beginning.
    const out = synthesiseClusterDates(
      { startClusterNo: 0, acquisitionDate: d("2020-01-01"), milestones: fullChain },
      POWERS,
    );
    expect(out).toEqual(fullChain);
  });

  it("UT-CLU-022 walks backwards through the whole chain for a project acquired at cluster 6", () => {
    // C1 = ref - (d5 + dFID + d4 + d3 + d2 + d1) = 63 months; then 62, 60, 56 as each cluster is
    // peeled off. `-56` rather than `-40` is what proves FID is inside the 4-to-5 step.
    const out = synthesiseClusterDates(
      {
        startClusterNo: 6,
        acquisitionDate: d("2029-06-01"),
        milestones: { operationsStartCod: d("2030-01-15"), construction: d("2029-11-15") },
      },
      POWERS,
    );
    expect(chain(out)).toEqual([
      "2024-10", "2024-11", "2025-01", "2025-05",
      // Cluster 5 is NEVER synthesised — "Use actual project value only" (`:18344`).
      "2029-11",
      // Cluster 6 IS the start cluster, so it is the reference date itself.
      "2030-01",
    ]);
  });

  it("UT-CLU-023 stops the chain at the start cluster for a project acquired at cluster 5", () => {
    const out = synthesiseClusterDates(
      {
        startClusterNo: 5,
        milestones: { construction: d("2030-01-15"), operationsStartCod: d("2031-07-15") },
      },
      POWERS,
    );
    // 31 = dFID + d4 + d3 + d2 + d1, then 30, 28, 24.
    expect(chain(out)).toEqual([
      "2027-06", "2027-07", "2027-09", "2028-01", "2030-01", "2031-07",
    ]);
  });

  it("UT-CLU-024 uses the reference date for the start cluster itself — except cluster 1", () => {
    // `varC2Date`..`varC4Date` all end `If(varStartClusterNo = N, varStartReferenceDate,
    // milestone)`, so a blank milestone at the start cluster falls through to the acquisition
    // date ...
    const atThree = synthesiseClusterDates(
      { startClusterNo: 3, acquisitionDate: d("2026-01-10"), milestones: {} },
      POWERS,
    );
    expect(ym(atThree.applicationSubmitted)).toBe("2026-01");

    // ... but `varC1Date`'s last branch is a BARE `'1-Feasibility studies'` (`:18248`), with no
    // reference-date arm at all. Transcribed, not tidied: the two differ only right here.
    const atOne = synthesiseClusterDates(
      { startClusterNo: 1, acquisitionDate: d("2026-01-10"), milestones: {} },
      POWERS,
    );
    expect(atOne.feasibilityStudies).toBeUndefined();
  });

  it("UT-CLU-025 keeps the project's own milestones for every cluster it has really reached", () => {
    const out = synthesiseClusterDates(
      {
        startClusterNo: 3,
        milestones: {
          applicationSubmitted: d("2026-01-10"),
          legallyBindingPermits: d("2027-05-01"),
          construction: d("2029-03-01"),
          operationsStartCod: d("2030-09-01"),
        },
      },
      POWERS,
    );
    // Clusters 4, 5 and 6 are real dates on the row; only 1 and 2 are computed.
    expect(chain(out).slice(3)).toEqual(["2027-05", "2029-03", "2030-09"]);
    expect(chain(out).slice(0, 3)).toEqual(["2025-10", "2025-11", "2026-01"]);
  });

  it("UT-CLU-026 collapses the chain onto the reference date when no assumption row matches", () => {
    // `Coalesce(varMilestoneDurations.'Cluster N', 0)` — every DateAdd shifts by nothing. The
    // clusters are zero-length but PRESENT, which is the whole difference from dropping them.
    const out = synthesiseClusterDates(
      { startClusterNo: 4, milestones: { legallyBindingPermits: d("2028-03-01") } },
      undefined,
    );
    expect(chain(out).slice(0, 4)).toEqual(["2028-03", "2028-03", "2028-03", "2028-03"]);
  });

  it("UT-CLU-027 falls back to the acquisition date when the start cluster's milestone is blank", () => {
    // Every arm of `varStartReferenceDate` is `Coalesce(milestone, 'Acquisition date')`.
    const out = synthesiseClusterDates(
      { startClusterNo: 2, acquisitionDate: d("2026-05-13"), milestones: {} },
      POWERS,
    );
    expect(ym(out.developmentStarted)).toBe("2026-05");
    expect(ym(out.feasibilityStudies)).toBe("2026-04"); // one month back — d1 = 1
  });

  it("UT-CLU-028 synthesises nothing at all when there is no reference date to hang off", () => {
    const out = synthesiseClusterDates({ startClusterNo: 4, milestones: {} }, POWERS);
    expect(chain(out).slice(0, 3)).toEqual([undefined, undefined, undefined]);
  });

  it("UT-CLU-029 passes the project end date through — it is not in the canvas' block", () => {
    const out = synthesiseClusterDates(
      { startClusterNo: 5, endDate: d("2061-06-26"), milestones: { construction: d("2030-01-15") } },
      POWERS,
    );
    expect(ym(out.endDate)).toBe("2061-06");
  });

  it("UT-CLU-030 recovers cluster 1 on VSBCloud_Dev's 'germany wind' (10007334)", () => {
    /*
     * The live project this gap is verifiable against, measured 16 Sep
     * (`9d885156-af4e-f111-bec6-70a8a5575472`): Start Cluster = Cluster 2, Germany, Wind, with
     * `1-Feasibility studies`, `2-Project development started` and `3-Application submitted` all
     * EMPTY. Germany/Wind durations are `cluster1: 17` ...
     * (`94cd9dcb-8123-ef11-840a-000d3aab6b54`).
     *
     * Before: `clusterDurations` gives [4, 5, 6]. After: cluster 1 comes back, spanning the 17
     * months the assumption says feasibility takes and ending at the acquisition date. Clusters 2
     * and 3 stay missing and SHOULD — `3-Application submitted` is blank and is neither the start
     * cluster nor behind it, so the canvas has nothing to compute it from either.
     */
    const germanyWind: MilestoneDurations = {
      cluster1: 17, cluster2: 18, cluster3: 30, cluster4: 6, cluster5: 12,
      finalInvestmentDecision: 12,
    };
    const project = {
      startClusterNo: 2,
      acquisitionDate: d("2026-05-13"),
      endDate: d("2061-06-26"),
      milestones: {
        legallyBindingPermits: d("2027-01-01"),
        construction: d("2030-05-27"),
        operationsStartCod: d("2031-05-27"),
        endDate: d("2061-06-26"),
      },
    };

    expect(clusterDurations(project.milestones).map((c) => c.order)).toEqual([4, 5, 6]);

    const synthesised = synthesiseClusterDates(project, germanyWind);
    const clusters = clusterDurations(synthesised);
    expect(clusters.map((c) => c.order)).toEqual([1, 4, 5, 6]);
    expect(clusters[0]).toEqual({
      order: 1, name: "Cluster 1",
      startYear: 2024, startMonth: 12, endYear: 2026, endMonth: 5,
    });
    // And the boundary array the Add/Edit panel distributes across gains its first entry.
    expect(clusterBoundaries(synthesised)[0]).toBe("2024-12-01");
  });
});
