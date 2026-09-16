import { describe, expect, it } from "vitest";
import {
  parseNumber, isNumeric, isDecimal, isInteger, inRange, numberOrBlank,
  isPercentage, isPercentageCanvasParity,
  isOneDecimalCanvasParity, isTwoDecimalCanvasParity, isThreeDecimalCanvasParity,
  round, sum, orZero,
} from "./numeric";

describe("parseNumber", () => {
  it("UT-NUM-001 parses plain decimals in an en locale", () => {
    expect(parseNumber("1234.56", "en-GB")).toBe(1234.56);
  });

  it("UT-NUM-002 parses comma decimals in a de locale", () => {
    expect(parseNumber("1234,56", "de-DE")).toBe(1234.56);
  });

  it("UT-NUM-003 strips the locale group separator", () => {
    expect(parseNumber("1.234.567,89", "de-DE")).toBe(1234567.89);
    expect(parseNumber("1,234,567.89", "en-GB")).toBe(1234567.89);
  });

  it("UT-NUM-004 returns undefined, not 0, for an empty field", () => {
    // The canvas app relied on Value("") being Blank() and wrote Coalesce(..., 0) wherever
    // zero was meant. Collapsing these would turn "left empty" into "zero".
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("   ")).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
    expect(parseNumber(null)).toBeUndefined();
  });

  it("UT-NUM-005 rejects trailing junk", () => {
    expect(parseNumber("12.34abc", "en-GB")).toBeUndefined();
  });

  it("UT-NUM-006 rejects scientific notation the canvas app never accepted", () => {
    expect(parseNumber("1e5", "en-GB")).toBeUndefined();
  });

  it("UT-NUM-007 accepts an explicit sign", () => {
    expect(parseNumber("-42", "en-GB")).toBe(-42);
    expect(parseNumber("+42", "en-GB")).toBe(42);
  });

  it("UT-NUM-008 survives a malformed language tag instead of throwing", () => {
    // Intl.NumberFormat("en-US@posix") throws; every number on every screen goes through it.
    expect(parseNumber("1234.56", "en-US@posix")).toBe(1234.56);
  });
});

describe("isNumeric", () => {
  it("UT-NUM-009 mirrors parseNumber", () => {
    expect(isNumeric("0", "en-GB")).toBe(true);
    expect(isNumeric("abc", "en-GB")).toBe(false);
  });
});

describe("isDecimal", () => {
  it("UT-NUM-010 is anchored at both ends, matching MatchOptions.Complete", () => {
    // The canvas pattern has a leading ^ and no trailing $, which reads like a prefix match.
    // IsMatch defaults to MatchOptions.Complete, so it never was one.
    expect(isDecimal("12.34abc", { places: 2, locale: "en-GB" })).toBe(false);
  });

  it("UT-NUM-011 enforces the decimal place limit", () => {
    expect(isDecimal("1.23", { places: 2, locale: "en-GB" })).toBe(true);
    expect(isDecimal("1.234", { places: 2, locale: "en-GB" })).toBe(false);
    expect(isDecimal("1.234", { places: 3, locale: "en-GB" })).toBe(true);
  });

  it("UT-NUM-012 accepts a trailing separator with no digits, as the canvas regex did", () => {
    // `(|\.\d{0,2})?` permits zero fractional digits after the separator.
    expect(isDecimal("1.", { places: 2, locale: "en-GB" })).toBe(true);
  });

  it("UT-NUM-013 requires at least one integer digit, as the canvas regex did", () => {
    expect(isDecimal(".5", { places: 2, locale: "en-GB" })).toBe(false);
  });

  it("UT-NUM-014 uses the locale separator", () => {
    expect(isDecimal("1,23", { places: 2, locale: "de-DE" })).toBe(true);
    expect(isDecimal("1.23", { places: 2, locale: "de-DE" })).toBe(false);
  });

  it("UT-NUM-015 gates the sign on allowNegative", () => {
    expect(isDecimal("-1.5", { places: 1, allowNegative: true, locale: "en-GB" })).toBe(true);
    expect(isDecimal("-1.5", { places: 1, allowNegative: false, locale: "en-GB" })).toBe(false);
    expect(isDecimal("+1.5", { places: 1, allowNegative: false, locale: "en-GB" })).toBe(true);
  });
});

describe("canvas parity twins", () => {
  it("UT-NUM-016 reproduces the sign asymmetry between the three canvas checks", () => {
    // SOURCE DEFECT B-2b: IsTwoDecimal accepts `-`, IsOneDecimal and IsThreeDecimal do not.
    expect(isTwoDecimalCanvasParity("-1.25", "en-GB")).toBe(true);
    expect(isOneDecimalCanvasParity("-1.2", "en-GB")).toBe(false);
    expect(isThreeDecimalCanvasParity("-1.234", "en-GB")).toBe(false);
  });

  it("UT-NUM-017 reproduces fn_Percentage.IsPercentage being `=true`", () => {
    // SOURCE DEFECT B-2: the entire canvas component body is `IsPercentage: =true`.
    expect(isPercentageCanvasParity()).toBe(true);
  });
});

describe("isPercentage", () => {
  it("UT-NUM-018 accepts 0 to 100 with at most two decimals", () => {
    expect(isPercentage("0", "en-GB")).toBe(true);
    expect(isPercentage("100", "en-GB")).toBe(true);
    expect(isPercentage("12.75", "en-GB")).toBe(true);
  });

  it("UT-NUM-019 rejects what the canvas version waved through", () => {
    expect(isPercentage("abc", "en-GB")).toBe(false);
    expect(isPercentage("", "en-GB")).toBe(false);
    expect(isPercentage("101", "en-GB")).toBe(false);
    expect(isPercentage("-5", "en-GB")).toBe(false);
    expect(isPercentage("1.234", "en-GB")).toBe(false);
  });
});

describe("isInteger", () => {
  it("UT-NUM-020 rejects anything containing a separator", () => {
    expect(isInteger("42", "en-GB")).toBe(true);
    expect(isInteger("42.0", "en-GB")).toBe(false);
    expect(isInteger("42,0", "en-GB")).toBe(false);
  });
});

describe("inRange", () => {
  it("UT-NUM-021 is inclusive at both bounds", () => {
    expect(inRange("10", 10, 20, "en-GB")).toBe(true);
    expect(inRange("20", 10, 20, "en-GB")).toBe(true);
    expect(inRange("9.99", 10, 20, "en-GB")).toBe(false);
  });

  it("UT-NUM-022 rejects a non-number before comparing", () => {
    expect(inRange("abc", 0, 100, "en-GB")).toBe(false);
  });
});

describe("numberOrBlank", () => {
  it("UT-NUM-023 rounds to two places or returns undefined", () => {
    expect(numberOrBlank("1.239", "en-GB")).toBe(1.24);
    expect(numberOrBlank("", "en-GB")).toBeUndefined();
  });
});

describe("round", () => {
  it("UT-NUM-024 rounds halves away from zero, as Power Fx does", () => {
    // Math.round(-2.5) === -2 in JavaScript; Power Fx Round(-2.5, 0) is -3. Money is
    // involved, so the difference is not academic.
    expect(round(2.5)).toBe(3);
    expect(round(-2.5)).toBe(-3);
    expect(round(-0.5)).toBe(-1);
  });

  it("UT-NUM-025 does not lose a half to binary representation", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(1234.565, 2)).toBe(1234.57);
  });

  it("UT-NUM-026 rounds to the requested places", () => {
    expect(round(1234.5678, 2)).toBe(1234.57);
    expect(round(1234.5678, 0)).toBe(1235);
  });
});

describe("sum and orZero", () => {
  it("UT-NUM-027 skips blanks the way Power Fx Sum does", () => {
    expect(sum(1, undefined, 2, null, 3)).toBe(6);
    expect(sum()).toBe(0);
    expect(sum(undefined, null)).toBe(0);
  });

  it("UT-NUM-028 drops non-finite values rather than propagating NaN", () => {
    expect(sum(1, Number.NaN, 2)).toBe(3);
    expect(sum(1, Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("UT-NUM-029 coalesces to zero", () => {
    expect(orZero(undefined)).toBe(0);
    expect(orZero(Number.NaN)).toBe(0);
    expect(orZero(7)).toBe(7);
  });
});
