import { describe, expect, it } from "vitest";
import { priceForYearOnCurve, type PricePoint } from "./priceCurve";

/**
 * The German wind / PV standard price curve of the QA report (23 Nov 2026), in the ORDER Fabric returned it:
 * 2030 first and 2026, 2025 last. Wind is 60 from 2027 to 2035 and 52 for 2025 and 2026; PV is 47 throughout.
 * Before D155 the Revenues panel took the LAST row in this order (2025 = 52) for a COD in 2034.
 */
const DE_ORDER = [2030, 2029, 2033, 2034, 2035, 2031, 2032, 2027, 2028, 2026, 2025];
const windOf = (y: number) => (y <= 2026 ? 52 : 60);
const DE_WIND: PricePoint[] = DE_ORDER.map((year) => ({ year, price: windOf(year) }));
const DE_PV: PricePoint[] = DE_ORDER.map((year) => ({ year, price: 47 }));

const pt = (year: number, price: number): PricePoint => ({ year, price });

/** Every ordering of `items` (Heap's algorithm), for the order-independence proof. */
function permutations<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  const a = [...items];
  const rec = (n: number) => {
    if (n === 1) { out.push([...a]); return; }
    for (let i = 0; i < n; i++) {
      rec(n - 1);
      const j = n % 2 === 0 ? i : 0;
      [a[n - 1], a[j]] = [a[j]!, a[n - 1]!];
    }
  };
  rec(a.length);
  return out;
}

describe("priceForYearOnCurve — the unified price-curve rule (D155)", () => {
  it("UT-PRICECURVE-001 the COD year's own row wins: a 2034 COD reads the 2034 row (60), not the last row of the table (52)", () => {
    expect(priceForYearOnCurve(DE_WIND, 2034)).toBe(60);
    expect(priceForYearOnCurve(DE_WIND, 2027)).toBe(60);
    expect(priceForYearOnCurve(DE_WIND, 2026)).toBe(52);
    expect(priceForYearOnCurve(DE_WIND, 2025)).toBe(52);
  });

  it("UT-PRICECURVE-002 the same exact-year rule on the PV column", () => {
    expect(priceForYearOnCurve(DE_PV, 2034)).toBe(47);
  });

  it("UT-PRICECURVE-003 before the first year the first year's price, after the last year the last year's price, whatever the row order", () => {
    // 2020 is nearest to 2025 (52). 2040 is nearest to 2035 (60): NOT the 2025 row that happens to be last in the table.
    expect(priceForYearOnCurve(DE_WIND, 2020)).toBe(52);
    expect(priceForYearOnCurve(DE_WIND, 2040)).toBe(60);
    expect(priceForYearOnCurve(DE_WIND, 2036)).toBe(60);
  });

  it("UT-PRICECURVE-004 inside a gap the closer side wins, measured in YEARS", () => {
    const gapped = [pt(2025, 50), pt(2031, 90)];
    expect(priceForYearOnCurve(gapped, 2026)).toBe(50);
    expect(priceForYearOnCurve(gapped, 2030)).toBe(90);
  });

  it("UT-PRICECURVE-005 two years equally near: the higher price wins, whichever side it is on (the canvas's secondary sort)", () => {
    expect(priceForYearOnCurve([pt(2025, 50), pt(2031, 90)], 2028)).toBe(90);
    expect(priceForYearOnCurve([pt(2025, 90), pt(2031, 50)], 2028)).toBe(90);
    expect(priceForYearOnCurve([pt(2031, 90), pt(2025, 50)], 2028)).toBe(90);
  });

  it("UT-PRICECURVE-006 the answer does not depend on the order of the rows (all 120 orderings of five years, COD 2020 to 2040)", () => {
    const base = [pt(2026, 55), pt(2027, 60), pt(2029, 70), pt(2030, 75), pt(2033, 40)];
    for (let cod = 2020; cod <= 2040; cod++) {
      const expected = priceForYearOnCurve(base, cod);
      expect(expected, `COD ${cod}`).not.toBeNull();
      for (const order of permutations(base)) {
        expect(priceForYearOnCurve(order, cod)).toBe(expected);
      }
    }
  });

  it("UT-PRICECURVE-007 an exact row with a blank price answers null, as the canvas shows a blank", () => {
    expect(priceForYearOnCurve([pt(2034, NaN), pt(2033, 60)], 2034)).toBeNull();
  });

  it("UT-PRICECURVE-008 a row with no usable price is never the nearest row", () => {
    expect(priceForYearOnCurve([pt(2033, NaN), pt(2031, 58)], 2034)).toBe(58);
    expect(priceForYearOnCurve([pt(2033, NaN), pt(2035, NaN)], 2034)).toBeNull();
  });

  it("UT-PRICECURVE-009 an empty curve, rows without a year and a COD that is not a number answer null", () => {
    expect(priceForYearOnCurve([], 2034)).toBeNull();
    expect(priceForYearOnCurve([pt(NaN, 60)], 2034)).toBeNull();
    expect(priceForYearOnCurve(DE_WIND, NaN)).toBeNull();
  });

  it("UT-PRICECURVE-010 rows without a year are ignored, the others still answer", () => {
    expect(priceForYearOnCurve([pt(NaN, 999), pt(2030, 60)], 2034)).toBe(60);
  });

  it("UT-PRICECURVE-011 a year that appears twice (a data error) uses the first of them, as the canvas LookUp does", () => {
    expect(priceForYearOnCurve([pt(2034, 61), pt(2034, 99)], 2034)).toBe(61);
  });
});
