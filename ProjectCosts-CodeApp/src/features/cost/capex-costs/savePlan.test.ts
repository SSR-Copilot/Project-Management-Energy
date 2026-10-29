/**
 * `planPanelCostWrites` — the cost-row half of the CAPEX panel's bulk Save (D56).
 *
 * The property that matters most is UT-CAPEXSAVE-012: with `skipUnchanged` off, the plan sends
 * exactly the rows `capexWriteSet` decides, so the bulk path and the per-row path store the same
 * months. Every other case pins one of the two foldings (the relink reset, the unchanged skip).
 */
import { describe, expect, it } from "vitest";
import { paidIdsToReset, paymentDateCommentIds, planPanelCostWrites } from "./savePlan";
import { capexWriteSet } from "./writeSet";
import { COMMENT_TYPE } from "./comments";
import type { Payment } from "../costing/model";
import type { PaymentWrite } from "./rules";

const stored = (id: string, month: number, amount: number, paid = false): Payment =>
  ({ id, year: 2026, month, amount, paid });

function ids() {
  let n = 0;
  return () => `new-${++n}`;
}

const plan = (payments: PaymentWrite[], over: Partial<Parameters<typeof planPanelCostWrites>[0]> = {}) =>
  planPanelCostWrites({ payments, paidIdsToReset: [], skipUnchanged: false, newId: ids(), ...over });

describe("planPanelCostWrites", () => {
  it("UT-CAPEXSAVE-001 a month with no row is a create with a minted id", () => {
    const p = plan([{ year: 2026, month: 1, amount: 100 }, { year: 2026, month: 2, amount: 200 }]);
    expect(p.creates).toEqual([
      { id: "new-1", year: 2026, month: 1, cost: 100 },
      { id: "new-2", year: 2026, month: 2, cost: 200 },
    ]);
    expect(p.updates).toEqual([]);
    expect(p.deletes).toEqual([]);
  });

  it("UT-CAPEXSAVE-002 an existing month is an update carrying vsb_cost", () => {
    const p = plan([{ id: "c1", year: 2026, month: 1, amount: 50 }]);
    expect(p.updates).toEqual([{ id: "c1", cost: 50, resetPaid: false }]);
    expect(p.creates).toEqual([]);
  });

  it("UT-CAPEXSAVE-003 a tombstone with an id is a delete", () => {
    expect(plan([{ id: "c1", year: 2026, month: 1, amount: null }]).deletes).toEqual(["c1"]);
  });

  it("UT-CAPEXSAVE-004 keeps the canvas zero rule: 0 on an empty month writes nothing", () => {
    const p = plan([{ year: 2026, month: 1, amount: 0 }]);
    expect(p).toMatchObject({ creates: [], updates: [], deletes: [] });
  });

  it("UT-CAPEXSAVE-005 keeps the canvas zero rule: 0 on an existing row updates it to 0", () => {
    expect(plan([{ id: "c1", year: 2026, month: 1, amount: 0 }]).updates)
      .toEqual([{ id: "c1", cost: 0, resetPaid: false }]);
  });

  it("UT-CAPEXSAVE-006 skips an existing month whose stored amount already matches", () => {
    const p = plan(
      [{ id: "c1", year: 2026, month: 1, amount: 50 }, { id: "c2", year: 2026, month: 2, amount: 70 }],
      { skipUnchanged: true, stored: [stored("c1", 1, 50), stored("c2", 2, 60)] },
    );
    expect(p.updates).toEqual([{ id: "c2", cost: 70, resetPaid: false }]);
    expect(p.unchanged).toBe(1);
  });

  it("UT-CAPEXSAVE-007 never skips without the stored months", () => {
    const p = plan([{ id: "c1", year: 2026, month: 1, amount: 50 }], { skipUnchanged: true });
    expect(p.updates).toHaveLength(1);
    expect(p.unchanged).toBe(0);
  });

  it("UT-CAPEXSAVE-008 never skips when the switch is off, even with matching stored months", () => {
    const p = plan([{ id: "c1", year: 2026, month: 1, amount: 50 }], { stored: [stored("c1", 1, 50)] });
    expect(p.updates).toEqual([{ id: "c1", cost: 50, resetPaid: false }]);
    expect(p.unchanged).toBe(0);
  });

  it("UT-CAPEXSAVE-009 folds the paid reset into the month's own update (one target per id)", () => {
    const p = plan([{ id: "c1", year: 2026, month: 1, amount: 50 }], { paidIdsToReset: ["c1"] });
    expect(p.updates).toEqual([{ id: "c1", cost: 50, resetPaid: true }]);
    expect(p.paidResets).toBe(1);
  });

  it("UT-CAPEXSAVE-010 a paid, unchanged month is still written, because it must be reset", () => {
    const p = plan([{ id: "c1", year: 2026, month: 1, amount: 50 }], {
      skipUnchanged: true, stored: [stored("c1", 1, 50, true)], paidIdsToReset: ["c1"],
    });
    expect(p.updates).toEqual([{ id: "c1", cost: 50, resetPaid: true }]);
    expect(p.unchanged).toBe(0);
  });

  it("UT-CAPEXSAVE-011 resets a paid month outside the payments; never one being deleted", () => {
    const p = plan([{ id: "c2", year: 2026, month: 2, amount: null }], {
      paidIdsToReset: ["c1", "c2", "c1"],
    });
    expect(p.updates).toEqual([{ id: "c1", resetPaid: true }]);
    expect(p.deletes).toEqual(["c2"]);
    expect(p.paidResets).toBe(1);
  });

  it("UT-CAPEXSAVE-012 with skip off it writes exactly what capexWriteSet decides (400 seeds)", () => {
    // Seeded LCG, so a failure is reproducible from its seed.
    for (let seed = 1; seed <= 400; seed += 1) {
      let s = seed;
      const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
      const payments: PaymentWrite[] = Array.from({ length: 1 + Math.floor(rnd() * 24) }, (_, i) => {
        const r = rnd();
        return {
          id: rnd() < 0.5 ? `c${i}` : undefined,
          year: 2026 + Math.floor(i / 12),
          month: (i % 12) + 1,
          amount: r < 0.2 ? null : r < 0.3 ? 0 : Math.round(r * 1000),
        };
      });
      const expected = capexWriteSet(payments.map((p) => ({
        year: p.year, month: p.month, cost: p.amount, costId: p.id ?? null,
      })));
      const got = plan(payments);
      expect(got.deletes, `seed ${seed}`).toEqual(expected.deletes);
      expect(got.updates.map((u) => [u.id, u.cost]), `seed ${seed}`)
        .toEqual(expected.upserts.filter((u) => u.costId).map((u) => [u.costId, u.cost]));
      expect(got.creates.map((c) => [c.year, c.month, c.cost]), `seed ${seed}`)
        .toEqual(expected.upserts.filter((u) => !u.costId).map((u) => [u.year, u.month, u.cost]));
    }
  });

  it("UT-CAPEXSAVE-014 never skips a 0, even when the stored amount is 0", () => {
    const p = plan([{ id: "c1", year: 2026, month: 1, amount: 0 }], { skipUnchanged: true, stored: [stored("c1", 1, 0)] });
    expect(p.updates).toEqual([{ id: "c1", cost: 0, resetPaid: false }]);
    expect(p.unchanged).toBe(0);
  });

  it("UT-CAPEXSAVE-013 every minted id is distinct and none collides with an update", () => {
    const p = plan([
      { year: 2026, month: 1, amount: 1 }, { year: 2026, month: 2, amount: 2 },
      { id: "c3", year: 2026, month: 3, amount: 3 },
    ], { newId: () => crypto.randomUUID() });
    const all = [...p.creates.map((c) => c.id), ...p.updates.map((u) => u.id)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("paymentDateCommentIds", () => {
  it("UT-CAPEXSAVE-020 keeps only the payment-date comments", () => {
    expect(paymentDateCommentIds([
      { id: "a", commentType: COMMENT_TYPE.general },
      { id: "b", commentType: COMMENT_TYPE.paymentDate },
    ])).toEqual(["b"]);
  });
});

describe("paidIdsToReset", () => {
  it("UT-CAPEXSAVE-021 lists the paid months with an id, only when the reset was accepted", () => {
    const payments = [stored("c1", 1, 5, true), stored("c2", 2, 5, false), { year: 2026, month: 3, amount: 5, paid: true }];
    expect(paidIdsToReset(payments, true)).toEqual(["c1"]);
    expect(paidIdsToReset(payments, false)).toEqual([]);
  });
});
