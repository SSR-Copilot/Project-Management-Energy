import { describe, it, expect } from "vitest";
import { p75, p90, NOT_COMPUTABLE, uncertaintyFrom, calculateUncertaintyCanvasParity, Z } from "./yieldStats";

describe("fn_Calculate_P75_P90", () => {
  it("UT-DOM-020 p75 applies the -0.674490 z-score and rounds to 0dp", () => {
    // 10000 + (-0.674490 * (10000 * 0.10)) = 10000 - 674.49 = 9325.51 -> 9326
    expect(p75("10000", "0.10")).toBe(9326);
  });
  it("UT-DOM-021 p90 applies the -1.281551 z-score", () => {
    // 10000 - 1281.551 = 8718.449 -> 8718
    expect(p90("10000", "0.10")).toBe(8718);
  });
  it("UT-DOM-022 p90 is always at or below p75 for positive uncertainty", () => {
    expect(p90("5000", "0.08")).toBeLessThan(p75("5000", "0.08"));
  });
  it("UT-DOM-023 zero uncertainty returns p50 unchanged", () => {
    expect(p75("1234", "0")).toBe(1234);
    expect(p90("1234", "0")).toBe(1234);
  });
  it("UT-DOM-024 non-numeric input returns the -1 sentinel", () => {
    expect(p75("abc", "0.1")).toBe(NOT_COMPUTABLE);
    expect(p90("1000", "")).toBe(NOT_COMPUTABLE);
  });
  it("UT-DOM-025 z-scores match the source constants exactly", () => {
    expect(Z.p75).toBe(-0.674490);
    expect(Z.p90).toBe(-1.281551);
  });
});

describe("uncertainty inverse", () => {
  it("UT-DOM-026 round-trips p75 back to the uncertainty it came from", () => {
    const u = 0.12, p50v = 8000;
    const measured = p75(String(p50v), String(u));
    expect(uncertaintyFrom(p50v, { p75: measured })).toBeCloseTo(u, 3);
  });
  it("UT-DOM-027 returns null when p50 is zero or absent", () => {
    expect(uncertaintyFrom(0, { p75: 100 })).toBeNull();
    expect(uncertaintyFrom(1000, {})).toBeNull();
  });
  it("UT-DOM-028 the shipped canvas formula is dimensionally wrong (documented)", () => {
    // p50 - (p75/p50)*0.674490 ~= 10000 - 0.629 = 9999.4, not an uncertainty at all.
    expect(calculateUncertaintyCanvasParity(10000, 9326)).toBeCloseTo(9999.4, 1);
  });
});
