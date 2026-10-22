import { describe, expect, it } from "vitest";
import {
  checkDecimalInput, decimalSeparatorFor, formatEditValue, formatFixed, formatStoredPercent, inRangeInput, isMaxDecimals,
  inRangeNumberInput, parseDecimalInput, parseNumberInput, toLatinDigits,
} from "./numberInput";

describe("DecimalSeparatorFor", () => {
  it("UT-NUMINPUT-001 Language rule: en → '.', everything else → ',' (canvas fn_Numeric / Contracts)", () => {
    expect(decimalSeparatorFor("en-GB", "language")).toBe(".");
    expect(decimalSeparatorFor("de-DE", "language")).toBe(",");
    expect(decimalSeparatorFor("de-CH", "language")).toBe(",");
    expect(decimalSeparatorFor(undefined, "language")).toBe(",");
  });
  it("UT-NUMINPUT-002 Intl rule: what Intl formats (Costs / numeric.ts)", () => {
    expect(decimalSeparatorFor("en-US", "intl")).toBe(".");
    expect(decimalSeparatorFor("de-DE", "intl")).toBe(",");
    // The two rules disagree here — the open decision.
    expect(decimalSeparatorFor("de-CH", "intl")).toBe(".");
  });
});

describe("ToLatinDigits", () => {
  it("UT-NUMINPUT-003 Converts Arabic-Indic, Persian, Devanagari and full-width digits", () => {
    expect(toLatinDigits("١٢٫٥")).toBe("12٫5");
    expect(toLatinDigits("۳۴")).toBe("34");
    expect(toLatinDigits("५६")).toBe("56");
    expect(toLatinDigits("７８")).toBe("78");
    expect(toLatinDigits("9.5")).toBe("9.5");
  });
});

describe("IsMaxDecimals", () => {
  it("UT-NUMINPUT-004 Contracts isNDecimal: digits, optional separator + 1..n decimals, no sign, no trailing separator", () => {
    const one = { places: 1, separator: "." as const };
    expect(isMaxDecimals("12", one)).toBe(true);
    expect(isMaxDecimals(" 12.5 ", one)).toBe(true);
    expect(isMaxDecimals("12.55", one)).toBe(false);
    expect(isMaxDecimals("12.", one)).toBe(false);
    expect(isMaxDecimals("-1", one)).toBe(false);
    expect(isMaxDecimals("12,5", one)).toBe(false);
    expect(isMaxDecimals("12,5", { places: 1, separator: "," })).toBe(true);
    expect(isMaxDecimals("", one)).toBe(false);
    expect(isMaxDecimals(undefined, one)).toBe(false);
  });
  it("UT-NUMINPUT-005 Milestones success rate: both separators, trailing separator allowed", () => {
    const opts = { places: 2, separator: "both" as const, allowTrailingSeparator: true };
    expect(isMaxDecimals("0.25", opts)).toBe(true);
    expect(isMaxDecimals("0,25", opts)).toBe(true);
    expect(isMaxDecimals("1.", opts)).toBe(true);
    expect(isMaxDecimals("0.255", opts)).toBe(false);
  });
  it("UT-NUMINPUT-006 Whole numbers, optional sign, native digits", () => {
    expect(isMaxDecimals("42", { places: 0, separator: "." })).toBe(true);
    expect(isMaxDecimals("4.2", { places: 0, separator: "." })).toBe(false);
    expect(isMaxDecimals("-4.2", { places: 1, separator: ".", allowSign: true })).toBe(true);
    expect(isMaxDecimals("٤٢", { places: 0, separator: "." })).toBe(true);
  });
});

describe("ParseDecimalInput / inRangeInput", () => {
  it("UT-NUMINPUT-007 Parses with the field separator and normalises -0", () => {
    expect(parseDecimalInput("12,5", ",")).toBe(12.5);
    expect(parseDecimalInput("12.5", ".")).toBe(12.5);
    expect(parseDecimalInput("12,5", ".")).toBeUndefined();
    expect(parseDecimalInput("0,5", "both")).toBe(0.5);
    expect(Object.is(parseDecimalInput("-0", "."), 0)).toBe(true);
    expect(parseDecimalInput("1e3", ".")).toBeUndefined();
    expect(parseDecimalInput("1,000.5", ".")).toBeUndefined();
    expect(parseDecimalInput(" ", ".")).toBeUndefined();
    expect(parseDecimalInput(null, ".")).toBeUndefined();
  });
  it("UT-NUMINPUT-008 Keeps Contracts' lenient '.' in a ',' field (validation rejects it first)", () => {
    expect(parseDecimalInput("1.5", ",")).toBe(1.5);
  });
  it("UT-NUMINPUT-009 InRangeInput is inclusive", () => {
    expect(inRangeInput("100", 0, 100, ".")).toBe(true);
    expect(inRangeInput("100,1", 0, 100, ",")).toBe(false);
    expect(inRangeInput("x", 0, 100, ".")).toBe(false);
  });
});

describe(" trailing decimal separator", () => {
  it("UT-NUMINPUT-010 ParseDecimalInput (Milestones / Contracts) already reads '1.' and '1,' as 1 — unchanged", () => {
    expect(parseDecimalInput("1.", ".")).toBe(1);
    expect(parseDecimalInput("1,", ",")).toBe(1);
    expect(parseDecimalInput("1,", "both")).toBe(1);
    expect(inRangeInput("1.", 0, 10, ".")).toBe(true);
  });
  it("UT-NUMINPUT-011 ParseNumberInput reads a trailing locale separator as the whole number (canvas Value('1.') = 1)", () => {
    expect(parseNumberInput("1.", "en-US")).toBe(1);
    expect(parseNumberInput(" 12. ", "en-US")).toBe(12);
    expect(parseNumberInput("1,", "de-DE")).toBe(1);
    expect(parseNumberInput("-5.", "en-US")).toBe(-5);
    expect(parseNumberInput("1.000,", "de-DE")).toBe(1000);
  });
  it("UT-NUMINPUT-012 ParseNumberInput otherwise behaves like parseNumber", () => {
    expect(parseNumberInput("1234.56", "en-US")).toBe(1234.56);
    expect(parseNumberInput("1,234.5", "en-US")).toBe(1234.5);
    expect(parseNumberInput("1234,56", "de-DE")).toBe(1234.56);
    expect(parseNumberInput("1,", "en-US")).toBe(1); // "," is grouping in en-US, as before
    expect(parseNumberInput("", "en-US")).toBeUndefined();
    expect(parseNumberInput(null, "en-US")).toBeUndefined();
    expect(parseNumberInput("abc", "en-US")).toBeUndefined();
    expect(parseNumberInput("1e5", "en-US")).toBeUndefined();
  });
  it("UT-NUMINPUT-013 ParseNumberInput still rejects malformed trailing separators", () => {
    expect(parseNumberInput(".", "en-US")).toBeUndefined();
    expect(parseNumberInput("1..", "en-US")).toBeUndefined();
    expect(parseNumberInput("1.5.", "en-US")).toBeUndefined();
    expect(parseNumberInput("1,5,", "de-DE")).toBeUndefined();
  });
  it("UT-NUMINPUT-014 InRangeNumberInput: an in-range '1.' is in range (no misleading range error)", () => {
    expect(inRangeNumberInput("1.", 0, 10, "en-US")).toBe(true);
    expect(inRangeNumberInput("100.", 0, 100, "en-US")).toBe(true);
    expect(inRangeNumberInput("101.", 0, 100, "en-US")).toBe(false);
    expect(inRangeNumberInput("1,", 0, 10, "de-DE")).toBe(true);
  });
});

describe("Formatting", () => {
  it("UT-NUMINPUT-015 FormatEditValue: field separator, Latin digits, no grouping", () => {
    expect(formatEditValue(1234.5, ",")).toBe("1234,5");
    expect(formatEditValue(1234.5, ".")).toBe("1234.5");
    expect(formatEditValue(0.1234567, ".")).toBe("0.123457");
    expect(formatEditValue(undefined, ".")).toBe("");
  });
  it("UT-NUMINPUT-016 FormatFixed: locale grouping and fixed decimals (Contracts formatMax)", () => {
    expect(formatFixed(1_000_000_000, 2, "en-US")).toBe("1,000,000,000.00");
    expect(formatFixed(100, 1, "en-US")).toBe("100.0");
  });
  it("UT-NUMINPUT-017 FormatStoredPercent shows the stored value, never ×100", () => {
    expect(formatStoredPercent(5, 2)).toBe("5.00 %");
    expect(formatStoredPercent(2, 1)).toBe("2.0 %");
    expect(formatStoredPercent(0.5, 1)).toBe("0.5 %");
    expect(formatStoredPercent(undefined, 2)).toBe("");
  });
});

/**
 * E11 — table-driven, mirroring the Milestones (`milestones/rules.test.ts` validateDuration /
 * validateSuccessRate) and Contracts (`contracts/rules.test.ts` isNDecimal / inRange / month)
 * cases. Each screen maps the kind to its own message.
 */
describe("CheckDecimalInput (E11)", () => {
  const EN = "en-GB";
  const DE = "de-DE";
  const duration = (t: string, max: number) => checkDecimalInput(t, { maxDecimals: 0, separator: "both", max });
  const rate = (t: string) => checkDecimalInput(t, { maxDecimals: 2, separator: "both", min: 0, max: 1, allowTrailingSeparator: true });
  const co = (t: string, n: number, lang: string, max = 100) =>
    checkDecimalInput(t, { maxDecimals: n, separator: "language", lang, min: 0, max });
  const month = (t: string) => checkDecimalInput(t, { maxDecimals: 0, separator: "language", lang: EN, digitsOnly: /^\d{1,2}$/ });

  it("UT-NUMINPUT-018 Milestones durations (^\\d+$, max column)", () => {
    expect(duration("12", 100)).toEqual({ kind: "ok", value: 12 });
    expect(duration("0", 100)).toEqual({ kind: "ok", value: 0 });
    expect(duration(" 6 ", 100)).toEqual({ kind: "ok", value: 6 });
    for (const bad of ["12.5", "12,5", "-1", "+3", "", "abc", "1e2"]) expect(duration(bad, 100).kind).not.toBe("ok");
    expect(duration("100", 100).kind).toBe("ok");
    expect(duration("101", 100).kind).toBe("range");
    expect(duration("101", 1000).kind).toBe("ok");
    expect(duration("1001", 1000).kind).toBe("range");
    expect(duration("", 100).kind).toBe("blank");
  });

  it("UT-NUMINPUT-019 Milestones success rates (both separators, 2 decimals, [0,1], trailing separator ok)", () => {
    expect(rate("0,85")).toEqual({ kind: "ok", value: 0.85 });
    expect(rate("0.85")).toEqual({ kind: "ok", value: 0.85 });
    expect(rate("1")).toEqual({ kind: "ok", value: 1 });
    expect(rate("0")).toEqual({ kind: "ok", value: 0 });
    expect(rate("1.")).toEqual({ kind: "ok", value: 1 });
    for (const bad of ["0.855", "0,855", "1.2", "-0.1", "+0.5", "", " ", ".5", "abc"]) expect(rate(bad).kind).not.toBe("ok");
    expect(rate("0.855").kind).toBe("decimals");
    expect(rate("1.2").kind).toBe("range");
    expect(rate(" ").kind).toBe("blank");
    expect(rate("abc").kind).toBe("format");
  });

  it("UT-NUMINPUT-020 Contracts margins (UI-language separator, no sign, no trailing separator)", () => {
    expect(co("12.3", 1, EN).kind).toBe("ok");
    expect(co("12.34", 1, EN).kind).toBe("decimals");
    expect(co("12,3", 1, EN).kind).toBe("format");
    expect(co("12,3", 1, DE)).toEqual({ kind: "ok", value: 12.3 });
    expect(co("12.34", 2, EN).kind).toBe("ok");
    expect(co("12.", 1, EN).kind).not.toBe("ok");
    expect(co("+5", 1, EN).kind).toBe("format");
    expect(co("-0", 1, EN).kind).toBe("format");
    expect(co("12,", 2, DE).kind).not.toBe("ok");
    expect(co("5", 1, EN)).toEqual({ kind: "ok", value: 5 });
    expect(co("100", 1, EN).kind).toBe("ok");
    expect(co("100.1", 1, EN).kind).toBe("range");
    expect(co("1000000000.01", 2, EN, 1_000_000_000).kind).toBe("range");
    expect(co("", 1, EN).kind).toBe("blank");
  });

  it("UT-NUMINPUT-021 Contracts month (digitsOnly ^\\d{1,2}$ on the raw text)", () => {
    expect(month("12")).toEqual({ kind: "ok", value: 12 });
    expect(month("0")).toEqual({ kind: "ok", value: 0 });
    expect(month("123").kind).toBe("format");
    expect(month("ab").kind).toBe("format");
    expect(month(" 1").kind).toBe("format");
    expect(month("  ").kind).toBe("blank");
  });
});
