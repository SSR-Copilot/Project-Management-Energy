import { describe, it, expect } from "vitest";
import * as n from "./numeric";

describe("fn_Numeric — locale", () => {
  it("UT-DOM-001 en uses dot as decimal separator", () => {
    expect(n.decimalSeparator("en-US")).toBe(".");
    expect(n.decimalSeparator("de-DE")).toBe(",");
  });
  it("UT-DOM-002 parses per culture", () => {
    expect(n.parseNumber("1234.5", "en-US")).toBe(1234.5);
    expect(n.parseNumber("1.234,5", "de-DE")).toBe(1234.5);
    expect(n.parseNumber("1,234.5", "en-US")).toBe(1234.5);
  });
  it("UT-DOM-003 non-numeric yields NaN, not 0", () => {
    expect(Number.isNaN(n.parseNumber("abc"))).toBe(true);
    expect(Number.isNaN(n.parseNumber(""))).toBe(true);
    expect(n.isNumeric("abc")).toBe(false);
  });
});

describe("fn_Numeric.InRange / InRangeAbs", () => {
  it("UT-DOM-004 inclusive bounds", () => {
    expect(n.inRange("100", 100, 200)).toBe(true);
    expect(n.inRange("200", 100, 200)).toBe(true);
    expect(n.inRange("99.99", 100, 200)).toBe(false);
  });
  it("UT-DOM-005 non-numeric is false, never an error", () => {
    expect(n.inRange("x", 0, 10)).toBe(false);
  });
  it("UT-DOM-006 InRangeAbs accepts negatives inside the range", () => {
    expect(n.inRangeAbs("-1.5", -5, 10)).toBe(true);
    expect(n.inRangeAbs("-6", -5, 10)).toBe(false);
  });
});

describe("fn_Numeric.IsInteger and decimals", () => {
  it("UT-DOM-007 integer rejects any separator", () => {
    expect(n.isInteger("125")).toBe(true);
    expect(n.isInteger("125.0")).toBe(false);
    expect(n.isInteger("125,0")).toBe(false);
  });
  it("UT-DOM-008 decimal places honoured per locale", () => {
    expect(n.isTwoDecimal("12.34", "en-US")).toBe(true);
    expect(n.isTwoDecimal("12.345", "en-US")).toBe(false);
    expect(n.isTwoDecimal("12,34", "de-DE")).toBe(true);
    expect(n.isSixDecimal("0.123456", "en-US")).toBe(true);
  });
  it("UT-DOM-009 anchored: trailing junk is rejected (canvas bug fixed)", () => {
    expect(n.isTwoDecimal("12.34abc", "en-US")).toBe(false);
    expect(n.isDecimalWithPlaces("12.34abc", 2, "en-US", true)).toBe(true); // canvas parity
  });
});

describe("percentage and currency", () => {
  it("UT-DOM-010 isPercentage bounds 0..100", () => {
    expect(n.isPercentage("0")).toBe(true);
    expect(n.isPercentage("100")).toBe(true);
    expect(n.isPercentage("100.1")).toBe(false);
    expect(n.isPercentage("-1")).toBe(false);
  });
  it("UT-DOM-011 canvas fn_Percentage.IsPercentage is unconditionally true", () => {
    expect(n.isPercentageCanvasParity()).toBe(true);
  });
  it("UT-DOM-012 currency allows up to two decimals", () => {
    expect(n.isValidCurrency("1000.50")).toBe(true);
    expect(n.isValidCurrency("1000.505")).toBe(false);
    expect(n.isValidCurrency("-5")).toBe(false);
  });
});

describe("rounding", () => {
  it("UT-DOM-013 Power Fx rounds half away from zero", () => {
    expect(n.pfxRound(2.5)).toBe(3);
    expect(n.pfxRound(-2.5)).toBe(-3);
    expect(Math.round(-2.5)).toBe(-2); // JS differs — this is why pfxRound exists
  });
  it("UT-DOM-014 roundUp/roundDown match RoundUp/RoundDown", () => {
    expect(n.roundUp(4.0001, 0)).toBe(5);
    expect(n.roundDown(4.9999, 0)).toBe(4);
    expect(n.roundDown(-4.1, 0)).toBe(-4);
  });
});

describe("blank handling", () => {
  it("UT-DOM-015 IsBlank treats empty string as blank", () => {
    expect(n.isBlank("")).toBe(true);
    expect(n.isBlank(0)).toBe(false);
  });
  it("UT-DOM-016 Coalesce skips blanks", () => {
    expect(n.coalesce(undefined, "", "x")).toBe("x");
    expect(n.coalesce<number>(undefined, 0)).toBe(0);
  });
});
