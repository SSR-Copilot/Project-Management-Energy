/** UT-CONTR-209..210 — the closing-date split of a very large cost set (no RangeError from spreading rows). */
import { describe, expect, it } from "vitest";
import { costsAfterClosing, costsUntilClosing } from "./rules";
import type { CapexCostRow } from "./rules";

describe("closing-date split sums", () => {
  it("UT-CONTR-209 200,000 cost rows are summed without a RangeError", () => {
    const rows: CapexCostRow[] = Array.from({ length: 200_000 }, (_, i) => ({
      contractId: "c", year: i % 2 === 0 ? 2026 : 2028, month: 1, cost: 1,
    }));
    const closingDate = new Date(2027, 5, 30);
    expect(costsUntilClosing({ closingDate, costs: rows })).toBe(100_000);
    expect(costsAfterClosing({ closingDate, costs: rows })).toBe(100_000);
  });

  it("UT-CONTR-210 a blank cost counts as nothing and the month rule of the closing year is unchanged", () => {
    const closingDate = new Date(2026, 2, 15); // March 2026
    const rows: CapexCostRow[] = [
      { contractId: "c", year: 2026, month: 1, cost: 10 },
      { contractId: "c", year: 2026, month: 3, cost: 5 },
      { contractId: "c", year: 2026, month: 4, cost: 7 },
      { contractId: "c", year: 2026, month: 5, cost: undefined },
      { contractId: "c", year: 2027, month: 1, cost: 3 },
    ];
    expect(costsUntilClosing({ closingDate, costs: rows })).toBe(15);
    expect(costsAfterClosing({ closingDate, costs: rows })).toBe(10);
  });
});
