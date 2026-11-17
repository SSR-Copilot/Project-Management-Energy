/**
 * The period start-date chain, across Land Lease, Other OPEX and Operation & Maintenance.
 *
 * Invariant (product owner, 17 Nov 2026): every period AFTER the first starts the day after the
 * previous period ends (`previous start + duration`, i.e. `previous end + 1 day`), and its Start
 * Date picker is disabled. IDs are `UT-PCHAIN-nnn`.
 *
 * The OPEX half pins what the shared OPEX screen already does (Other OPEX and O&M run the same
 * code); the Land Lease half is the fix (D118).
 */
import { describe, expect, it } from "vitest";
import {
  LAND_LEASE_PERIOD, LEASE_ENTITY_SET, LEASE_PERIOD_COL, emptyLandLeaseForm, headerEditable,
  leasePeriodEnd, planFollowingLeaseStarts, planLeaseSave, startDateEditable,
  type LeaseCostRow, type LeasePeriodRow, type LeaseProjectContext,
} from "./landLeaseRules";
import {
  nextStartDate, panelFieldModes, periodEndDate, planFollowingPeriodStarts, ymd,
  type PanelContext,
} from "./opexRules";

const lease = (over: Partial<LeasePeriodRow> & { id: string }): LeasePeriodRow => ({
  name: `Owner - ${over.id}`, projectCostId: "c1", period: LAND_LEASE_PERIOD.period1,
  startDate: null, durationYears: 5, durationMonths: 0, fixedCosts: 1, percentOfRevenues: null,
  eurPerMwh: null, eurPerMw: null, eurPerWtg: null, aggregation: null, distributionFrequency: null,
  ...over,
});

/** The screenshot chain: Period 1 starts 01.05.29 and runs 5 years, then 5, then 5, then 15. */
const chain = (): LeasePeriodRow[] => [
  lease({ id: "p1", period: LAND_LEASE_PERIOD.period1, startDate: "2029-05-01", durationYears: 5 }),
  lease({ id: "p2", period: LAND_LEASE_PERIOD.period2, startDate: "2034-05-01", durationYears: 5 }),
  lease({ id: "p3", period: LAND_LEASE_PERIOD.period3, startDate: "2039-05-01", durationYears: 5 }),
  lease({ id: "p4", period: LAND_LEASE_PERIOD.period4, startDate: "2044-05-01", durationYears: 15 }),
];

describe("Land Lease — start dates after Period 1 follow the previous period's end + 1 day", () => {
  it("UT-PCHAIN-001 the start date picker is editable only on Period 1 or a brand-new contract", () => {
    const p = chain();
    expect(startDateEditable(p[0], { id: "c1" })).toBe(true);
    expect(startDateEditable(p[1], { id: "c1" })).toBe(false);
    expect(startDateEditable(p[3], { id: "c1" })).toBe(false);
    // Add Period on an existing contract: cost present, no period yet.
    expect(startDateEditable(null, { id: "c1" })).toBe(false);
    // New Contract: no cost at all.
    expect(startDateEditable(null, null)).toBe(true);
  });

  it("UT-PCHAIN-002 the picker gate is the same predicate as the header gate on a period row", () => {
    const p = chain();
    expect(startDateEditable(p[1], { id: "c1" })).toBe(headerEditable(p[1], { id: "c1" }));
  });

  it("UT-PCHAIN-003 lengthening Period 1 moves every following start so each is the previous end + 1", () => {
    const p = chain();
    const plan = planFollowingLeaseStarts({
      periods: p,
      saved: { id: "p1", startDate: "2029-05-01", durationYears: 6, durationMonths: 0 },
    });
    expect(plan).toEqual([
      { id: "p2", startDate: "2035-05-01" },
      { id: "p3", startDate: "2040-05-01" },
      { id: "p4", startDate: "2045-05-01" },
    ]);
  });

  it("UT-PCHAIN-004 a following period that already starts right writes nothing", () => {
    expect(planFollowingLeaseStarts({
      periods: chain(),
      saved: { id: "p1", startDate: "2029-05-01", durationYears: 5, durationMonths: 0 },
    })).toEqual([]);
  });

  it("UT-PCHAIN-005 the screenshot case: a stored start equal to the previous END is moved to END + 1", () => {
    // Kerzendorf, OPTIMIZED - 2 stored 30.04.34 although OPTIMIZED ends 30.04.34.
    const broken = chain();
    broken[1] = lease({ ...broken[1]!, startDate: "2034-04-30" });
    broken[2] = lease({ ...broken[2]!, startDate: "2039-04-30" });
    expect(leasePeriodEnd(broken[0]!)).toBe("2034-04-30");
    const plan = planFollowingLeaseStarts({
      periods: broken,
      saved: { id: "p1", startDate: "2029-05-01", durationYears: 5, durationMonths: 0 },
    });
    expect(plan).toEqual([
      { id: "p2", startDate: "2034-05-01" },
      { id: "p3", startDate: "2039-05-01" },
    ]);
  });

  it("UT-PCHAIN-006 editing a middle period re-chains only the periods after it, by Period number", () => {
    const shuffled = [chain()[3]!, chain()[1]!, chain()[0]!, chain()[2]!];
    const plan = planFollowingLeaseStarts({
      periods: shuffled,
      saved: { id: "p2", startDate: "2034-05-01", durationYears: 3, durationMonths: 6 },
    });
    expect(plan).toEqual([
      { id: "p3", startDate: "2037-11-01" },
      { id: "p4", startDate: "2042-11-01" },
    ]);
  });

  it("UT-PCHAIN-007 the last period, or an unknown or start-less period, has nothing to re-chain", () => {
    expect(planFollowingLeaseStarts({
      periods: chain(), saved: { id: "p4", startDate: "2044-05-01", durationYears: 1, durationMonths: 0 },
    })).toEqual([]);
    expect(planFollowingLeaseStarts({
      periods: chain(), saved: { id: "zzz", startDate: "2029-05-01", durationYears: 1, durationMonths: 0 },
    })).toEqual([]);
    expect(planFollowingLeaseStarts({
      periods: chain(), saved: { id: "p1", startDate: null, durationYears: 1, durationMonths: 0 },
    })).toEqual([]);
  });

  it("UT-PCHAIN-008 month-end clamping matches the grid's End Date + 1 (31 Jan + 1 month)", () => {
    const p = [
      lease({ id: "a", period: LAND_LEASE_PERIOD.period1, startDate: "2030-01-31", durationYears: 0, durationMonths: 1 }),
      lease({ id: "b", period: LAND_LEASE_PERIOD.period2, startDate: "2030-03-01", durationYears: 1, durationMonths: 0 }),
    ];
    const plan = planFollowingLeaseStarts({
      periods: p, saved: { id: "a", startDate: "2030-01-31", durationYears: 0, durationMonths: 1 },
    });
    expect(plan).toEqual([{ id: "b", startDate: "2030-02-28" }]);
  });

  const saveArgs = (saved: { id: string; period: number; durationYears: number }) => {
    const ctx = { projectId: "pr", projectName: "P", owningBusinessUnitId: "bu" } as LeaseProjectContext;
    const periods = chain();
    return {
      form: {
        ...emptyLandLeaseForm(ctx), startDate: "2029-05-01",
        durationYears: saved.durationYears, durationMonths: 0, fixedCosts: "1",
      },
      ctx, subaccountId: "s", subaccountName: "S",
      selectedCost: { id: "c1" } as LeaseCostRow,
      selectedPeriod: periods.find((x) => x.id === saved.id)!,
      parentPeriod: null, existingAllocations: [], generators: [], panelState: "Edit" as const,
      contractPeriods: periods,
    };
  };

  it("UT-PCHAIN-009 the Edit Period 1 save plan appends one period update per following period", () => {
    const plan = planLeaseSave(saveArgs({ id: "p1", period: 1, durationYears: 6 }));
    const rechain = plan.writes.filter((w) =>
      w.op === "update" && w.entitySet === LEASE_ENTITY_SET.period && w.id !== "p1");
    expect(rechain.map((w) => (w as { id: string }).id)).toEqual(["p2", "p3", "p4"]);
    expect(rechain.map((w) => (w as { payload: Record<string, unknown> }).payload)).toEqual([
      { [LEASE_PERIOD_COL.startDate]: "2035-05-01" },
      { [LEASE_PERIOD_COL.startDate]: "2040-05-01" },
      { [LEASE_PERIOD_COL.startDate]: "2045-05-01" },
    ]);
    // The saved period itself is written before its followers.
    const ids = plan.writes.filter((w) => w.entitySet === LEASE_ENTITY_SET.period)
      .map((w) => (w as { id?: string }).id);
    expect(ids[0]).toBe("p1");
  });

  it("UT-PCHAIN-010 an unchanged save writes no re-chain, and an Add Period never re-chains", () => {
    const same = planLeaseSave(saveArgs({ id: "p1", period: 1, durationYears: 5 }));
    expect(same.writes.filter((w) => w.entitySet === LEASE_ENTITY_SET.period)).toHaveLength(1);

    const add = planLeaseSave({
      ...saveArgs({ id: "p1", period: 1, durationYears: 6 }),
      selectedPeriod: null, parentPeriod: chain()[3]!, panelState: "New",
    });
    expect(add.writes.filter((w) => w.entitySet === LEASE_ENTITY_SET.period)).toHaveLength(1);
  });

  it("UT-PCHAIN-011 without the contract's periods the plan is unchanged (older callers)", () => {
    const { contractPeriods: _drop, ...rest } = saveArgs({ id: "p1", period: 1, durationYears: 6 });
    const plan = planLeaseSave(rest);
    expect(plan.writes.filter((w) => w.entitySet === LEASE_ENTITY_SET.period)).toHaveLength(1);
  });
});

describe("OPEX (Other OPEX and Operation & Maintenance share one screen) — pinned as already correct", () => {
  it("UT-PCHAIN-020 Add Period proposes the previous end + 1 day", () => {
    const prev = { startDate: "2029-05-01", durationYears: 5, durationMonths: 0 };
    const start = nextStartDate(prev, null)!;
    const end = periodEndDate(prev)!;
    expect(ymd(end)).toBe("2034/04/30");
    expect(ymd(start)).toBe("2034/05/01");
    const dayAfterEnd = new Date(end.getTime());
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    expect(ymd(start)).toBe(ymd(dayAfterEnd));
  });

  it("UT-PCHAIN-021 the Start Date picker is disabled on a follow-on period and enabled on a root", () => {
    const ctxOf = (selectedParent: string | null): PanelContext => ({
      selected: { parentCostId: selectedParent } as never,
      parent: selectedParent === null ? null : ({ id: selectedParent } as never),
    } as unknown as PanelContext);
    const form = { eurPerMwh: "", useCountryInflationProfile: false };
    expect(panelFieldModes(ctxOf("root"), form).startDate).toBe("disabled");
    expect(panelFieldModes(ctxOf(null), form).startDate).toBe("edit");
  });

  const orow = (id: string, startDate: string, years: number) =>
    ({ id, startDate, durationYears: years, durationMonths: 0 });

  it("UT-PCHAIN-023 an UNCHANGED save of an earlier period repairs a drifted chain (the QA WTG-2613 shape)", () => {
    // Stored by hand before D98: 30.04.34 / 30.04.39 / 30.04.44 instead of 01.05.34 / 39 / 44.
    const drifted = [
      orow("p1", "2029-05-01", 5), orow("p2", "2034-04-30", 5),
      orow("p3", "2039-04-30", 5), orow("p4", "2044-04-30", 15),
    ];
    const same = orow("p1", "2029-05-01", 5);
    expect(planFollowingPeriodStarts({ chain: drifted, saved: same, previous: same })).toEqual([
      { id: "p2", startDate: "2034-05-01" },
      { id: "p3", startDate: "2039-05-01" },
      { id: "p4", startDate: "2044-05-01" },
    ]);
  });

  it("UT-PCHAIN-024 an unchanged save of an aligned chain writes nothing, and a new period never plans", () => {
    const aligned = [
      orow("p1", "2029-05-01", 5), orow("p2", "2034-05-01", 5), orow("p3", "2039-05-01", 5),
    ];
    const same = orow("p1", "2029-05-01", 5);
    expect(planFollowingPeriodStarts({ chain: aligned, saved: same, previous: same })).toEqual([]);
    expect(planFollowingPeriodStarts({ chain: aligned, saved: same, previous: null })).toEqual([]);
  });

  it("UT-PCHAIN-025 the repair only reaches periods AFTER the saved one, and only the drifted ones", () => {
    const mixed = [
      orow("p1", "2029-05-01", 5), orow("p2", "2034-04-30", 5), orow("p3", "2039-04-30", 5),
    ];
    const p2 = orow("p2", "2034-04-30", 5);
    // Saving p2 keeps its own stored start; p3 follows it (30.04.34 + 5 y = 30.04.39), already consistent.
    expect(planFollowingPeriodStarts({ chain: mixed, saved: p2, previous: p2 })).toEqual([]);
    // Saving p1 repairs p2 and p3; nothing before p1.
    const p1 = orow("p1", "2029-05-01", 5);
    expect(planFollowingPeriodStarts({ chain: mixed, saved: p1, previous: p1 }).map((s) => s.id))
      .toEqual(["p2", "p3"]);
  });

  it("UT-PCHAIN-022 saving a period re-chains the following ones to end + 1 (the screenshot chain)", () => {
    const row = (id: string, startDate: string, years: number) =>
      ({ id, startDate, durationYears: years, durationMonths: 0 });
    const plan = planFollowingPeriodStarts({
      chain: [row("p1", "2029-05-01", 5), row("p2", "2034-04-30", 5), row("p3", "2039-04-30", 5)],
      saved: row("p1", "2029-05-01", 6),
      previous: row("p1", "2029-05-01", 5),
    });
    expect(plan).toEqual([
      { id: "p2", startDate: "2035-05-01" },
      { id: "p3", startDate: "2040-05-01" },
    ]);
  });
});
