/**
 * Equal distribution — the canvas' exact integer arithmetic.
 *
 * Ported from the skeleton's `capex-costs/rules.ts` rules 18–19, which transcribe the Power Fx
 * from the Add/Edit Costs panel. This REPLACES `distribute()` in `features/costing/model.ts`
 * for CAPEX, which worked in cents and disagreed with the canvas on every figure:
 *
 *     distribute(1000, 3 payments)            -> [333.33, 333.33, 333.34]
 *     equalDistributionAmounts(1000, 3)       -> [333, 333, 334]
 *
 * The canvas rounds DOWN to whole currency units and puts the entire remainder on the final
 * payment. It is deliberately not a "spread the remainder" algorithm, and `Average Amount per
 * Payment` stores the rounded-down base rather than the true mean.
 */
import { roundDown } from "@/domain/numeric";

export interface SchedulePoint {
  year: number;
  month: number;
}

/**
 * Rule 18 — which months get a payment.
 *
 *   numPayments = RoundDown(Max((ey-sy)*12 + (em-sm), 0) / Coalesce(freq,1), 0) + 1
 *   Year_i      = sy + RoundDown((sm - 1 + (i-1)*freq) / 12, 0)
 *   Month_i     = Mod(sm - 1 + (i-1)*freq, 12) + 1
 *
 * A blank or non-positive frequency is monthly — `Coalesce(freq, 1)` in the canvas. An end
 * before the start yields a single payment, not zero, because the span is clamped at 0 and the
 * count is `+ 1`.
 */
export function distributionSchedule(range: {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  frequency: number | null;
}): SchedulePoint[] {
  const freq = range.frequency && range.frequency > 0 ? range.frequency : 1;
  const span = Math.max(
    (range.endYear - range.startYear) * 12 + (range.endMonth - range.startMonth),
    0,
  );
  const numPayments = roundDown(span / freq, 0) + 1;
  return Array.from({ length: numPayments }, (_, i) => {
    const offset = range.startMonth - 1 + i * freq;
    return {
      year: range.startYear + roundDown(offset / 12, 0),
      month: (offset % 12) + 1,
    };
  });
}

/**
 * Rule 19 — equal amounts, whole remainder on the final payment.
 *
 * `averagePayment` is `RoundDown(total / n, 0)` — the figure the canvas shows in "Average
 * Amount per Payment", which is the base and not the mean. With 1000 over 3 the average reads
 * 333 while the payments are 333, 333 and 334.
 */
export function equalDistributionAmounts(
  total: number,
  numPayments: number,
): { amounts: number[]; averagePayment: number } {
  if (numPayments <= 0) return { amounts: [], averagePayment: 0 };
  const base = roundDown(total / numPayments, 0);
  const amounts = Array.from({ length: numPayments }, (_, i) =>
    i === numPayments - 1 ? total - base * (numPayments - 1) : base);
  return { amounts, averagePayment: base };
}
