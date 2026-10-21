/**
 * Equal distribution — ported with the skeleton's own expectations.
 *
 * Case ids in brackets are the skeleton's (`capex-costs/rules.test.ts`), kept so the two can be
 * cross-checked. The figures are the canvas', not ours: `1000 / 3` is `[333, 333, 334]`, not
 * `[333.33, 333.33, 333.34]`.
 */
import { describe, expect, it } from "vitest";
import { distributionSchedule, equalDistributionAmounts } from "./distribution";
import { distribute } from "../costing/model";

describe("distributionSchedule", () => {
  it("UT-DIST-001 a 3-month frequency over one year gives four payments [UT-CAPEX-014]", () => {
    expect(distributionSchedule({
      startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 12, frequency: 3,
    })).toEqual([
      { year: 2025, month: 1 }, { year: 2025, month: 4 },
      { year: 2025, month: 7 }, { year: 2025, month: 10 },
    ]);
  });

  it("UT-DIST-002 the schedule wraps across a year boundary [UT-CAPEX-015]", () => {
    expect(distributionSchedule({
      startYear: 2025, startMonth: 11, endYear: 2026, endMonth: 4, frequency: 2,
    })).toEqual([
      { year: 2025, month: 11 }, { year: 2026, month: 1 }, { year: 2026, month: 3 },
    ]);
  });

  it("UT-DIST-003 a single-month range still yields one payment [UT-CAPEX-017]", () => {
    expect(distributionSchedule({
      startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 6, frequency: 12,
    })).toEqual([{ year: 2025, month: 6 }]);
  });

  it("UT-DIST-004 a blank frequency is monthly", () => {
    // `Coalesce(freq, 1)` — a null frequency must not divide by zero or yield one payment.
    expect(distributionSchedule({
      startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 3, frequency: null,
    })).toHaveLength(3);
  });

  it("UT-DIST-005 an end before the start clamps to one payment, not zero", () => {
    // `Max(span, 0)` then `+ 1`. Returning an empty schedule would silently drop the cost.
    expect(distributionSchedule({
      startYear: 2026, startMonth: 5, endYear: 2025, endMonth: 1, frequency: 1,
    })).toEqual([{ year: 2026, month: 5 }]);
  });

  it("UT-DIST-006 every month is in 1-12 across a long span", () => {
    const schedule = distributionSchedule({
      startYear: 2015, startMonth: 7, endYear: 2030, endMonth: 12, frequency: 1,
    });
    expect(schedule).toHaveLength(186);
    for (const p of schedule) {
      expect(p.month).toBeGreaterThanOrEqual(1);
      expect(p.month).toBeLessThanOrEqual(12);
    }
    expect(schedule.at(-1)).toEqual({ year: 2030, month: 12 });
  });
});

describe("equalDistributionAmounts", () => {
  it("UT-DIST-007 the whole remainder lands on the last payment [UT-CAPEX-016]", () => {
    const r = equalDistributionAmounts(1000, 3);
    expect(r.amounts).toEqual([333, 333, 334]);
    expect(r.averagePayment).toBe(333);
  });

  it("UT-DIST-008 a single payment takes the full total [UT-CAPEX-017]", () => {
    expect(equalDistributionAmounts(1000, 1).amounts).toEqual([1000]);
  });

  it("UT-DIST-009 the amounts always sum to the total exactly", () => {
    for (const [total, n] of [[1000, 3], [100, 7], [19700000, 12], [1, 3]] as const) {
      const { amounts } = equalDistributionAmounts(total, n);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("UT-DIST-010 averagePayment is the rounded-down base, not the true mean", () => {
    // The canvas stores `RoundDown(total / n, 0)`. The mean of [333,333,334] is 333.33; the
    // panel shows 333.
    expect(equalDistributionAmounts(1000, 3).averagePayment).toBe(333);
  });

  it("UT-DIST-011 no payments yields nothing rather than dividing by zero", () => {
    expect(equalDistributionAmounts(1000, 0)).toEqual({ amounts: [], averagePayment: 0 });
  });

  it("UT-DIST-012 differs from the cents-based distribute() it replaces", () => {
    // Pinning the divergence deliberately: if someone reverts CAPEX to `distribute()`, this
    // fails and says why. `distribute` splits to cents; the canvas works in whole units.
    const canvas = equalDistributionAmounts(1000, 3).amounts;
    const cents = distribute(1000, "2025-01-01", "2025-03-31", 1).map((p) => p.amount);

    expect(canvas).toEqual([333, 333, 334]);
    expect(cents).toEqual([333.33, 333.33, 333.34]);
    expect(canvas).not.toEqual(cents);
  });
});
