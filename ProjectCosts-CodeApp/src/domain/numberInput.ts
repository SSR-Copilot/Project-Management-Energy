/**
 * Numeric INPUT helpers for the settings editors: decimal-separator rules, Latin digits,
 * "at most n decimals" validation, parsing, edit-text formatting and stored-percent display.
 *
 * Built from the best of the screens, on top of `domain/numeric.ts` / `domain/locale.ts`
 * (which stay the app-wide parsing core):
 *   - Contracts (`contracts/rules.ts` `decimalSeparator`, `isNDecimal`, `parseLocaleNumber`,
 *     `inRange`, `formatLocaleNumber`, `formatMax`)
 *   - Milestones (`validateSuccessRate` accepts "." AND ","; `editText` / `formatValue` via
 *     `Intl` with Latin digits and no grouping)
 * Costs (`fmtStoredPercent`: the stored value IS the percent — 5 → "5.00 %")
 *
 * OPEN PRODUCT DECISION — the separator rule. Contracts takes it from the UI language PREFIX
 * (`en` → ".", anything else → ","; the canvas `fn_Numeric` rule), while Costs / `numeric.ts`
 * take it from `Intl` (`localeInfo`). They disagree for e.g. `de-CH` and `en-ZA`. Both are
 * available here (`SeparatorRule`); each screen keeps its current rule until the PO picks one.
 */
import { localeInfo, numberFormat } from "./locale";
import { parseNumber } from "./numeric";

/** `"language"` = the canvas / Contracts rule; `"intl"` = `localeInfo` (Costs, `numeric.ts`). */
export type SeparatorRule = "language" | "intl";

/** The decimal separator for a UI language under a rule. */
export function decimalSeparatorFor(lang: string | undefined, rule: SeparatorRule = "intl"): "." | "," {
  if (rule === "language") return (lang ?? "").toLowerCase().split("-")[0] === "en" ? "." : ",";
  return localeInfo(lang).decimalSeparator;
}

/** What a field accepts as the decimal separator. `"both"` is Milestones' success-rate rule. */
export type AcceptedSeparator = "." | "," | "both";

/**
 * Native digits (Arabic-Indic, Extended Arabic-Indic / Persian, Devanagari, full-width) to
 * ASCII, so a value typed with a non-Latin keyboard or pasted from such a locale parses.
 */
export function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९０-９]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0xff10) return String(code - 0xff10);
    if (code >= 0x0966) return String(code - 0x0966);
    if (code >= 0x06f0) return String(code - 0x06f0);
    return String(code - 0x0660);
  });
}

export interface MaxDecimalsOptions {
  /** Maximum digits after the separator (0 = whole numbers only). */
  places: number;
  separator: AcceptedSeparator;
  /** Leading "-" / "+" allowed. Default false (margins, rates and costs are never negative). */
  allowSign?: boolean;
  /** "1." accepted (canvas `fn_Numeric`, Milestones). Default false. */
  allowTrailingSeparator?: boolean;
}

function sepClass(separator: AcceptedSeparator): string {
  if (separator === "both") return "[.,]";
  return separator === "." ? "\\." : ",";
}

/**
 * Digits, then optionally the separator and up to `places` decimals. Surrounding whitespace is
 * ignored; native digits are accepted. No grouping separators.
 */
export function isMaxDecimals(text: string | null | undefined, options: MaxDecimalsOptions): boolean {
  if (text === null || text === undefined) return false;
  const t = toLatinDigits(text.trim());
  if (t === "") return false;
  const sign = options.allowSign ? "[+-]?" : "";
  if (options.places <= 0) return new RegExp(`^${sign}\\d+$`).test(t);
  const min = options.allowTrailingSeparator ? 0 : 1;
  return new RegExp(`^${sign}\\d+(?:${sepClass(options.separator)}\\d{${min},${options.places}})?$`).test(t);
}

/**
 * The number in `text`, or `undefined`. Accepts the given separator (or both), native digits,
 * an optional sign and a trailing separator; rejects grouping, exponents and anything else.
 * Validate with `isMaxDecimals` first — parsing is deliberately lenient about "." (Contracts).
 * `-0` becomes `0`.
 */
export function parseDecimalInput(text: string | null | undefined, separator: AcceptedSeparator): number | undefined {
  if (text === null || text === undefined) return undefined;
  let t = toLatinDigits(text.trim());
  if (t === "") return undefined;
  // Contracts parity: in a "," field a "." also parses (validation, not parsing, rejects it).
  if (separator === "," || separator === "both") t = t.replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d*)?$/.test(t)) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n === 0 ? 0 : n;
}

/**
 * Locale-aware `Value(text)` for the settings editors that follow `numeric.ts` (`Intl`
 * separator, grouping allowed — Costs): `parseNumber`, plus a TRAILING decimal separator
 * ("1." / "1,") read as the whole number, as Power Fx `Value("1.")` = 1 and the canvas
 * `IsTwoDecimal` / `IsOneDecimal` (`\d{0,n}` fraction) accepted it. Without this,
 * "1." passed the decimals check and then failed `inRange` with a misleading range message.
 * Only one trailing separator after a digit is dropped; "1..", "." and "1.5." stay invalid.
 */
export function parseNumberInput(text: string | null | undefined, locale?: string): number | undefined {
  if (text === null || text === undefined) return undefined;
  const t = text.trim();
  const { decimalSeparator } = localeInfo(locale);
  const stripped = t.length > 1 && t.endsWith(decimalSeparator) && /\d/.test(t.charAt(t.length - 2))
    ? t.slice(0, -1)
    : t;
  // "1.5." would become "1.5" — refuse a value that already carries the separator.
  if (stripped !== t && stripped.includes(decimalSeparator)) return undefined;
  const n = parseNumber(stripped, locale);
  return n === 0 ? 0 : n;
}

/** `parseNumberInput` AND `min <= n <= max` (both inclusive). */
export function inRangeNumberInput(
  text: string | null | undefined, min: number, max: number, locale?: string,
): boolean {
  const n = parseNumberInput(text, locale);
  return n !== undefined && n >= min && n <= max;
}

/** Parsed AND `min <= n <= max` (both inclusive). */
export function inRangeInput(
  text: string | null | undefined, min: number, max: number, separator: AcceptedSeparator,
): boolean {
  const n = parseDecimalInput(text, separator);
  return n !== undefined && n >= min && n <= max;
}

/**
 * A stored number as the text an edit field is pre-filled with: the field's separator, Latin
 * digits, no grouping, at most `maxFractionDigits` decimals (Milestones `editText`). `""` for
 * no value.
 */
export function formatEditValue(
  value: number | null | undefined, separator: "." | ",", maxFractionDigits = 6,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const text = numberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits, useGrouping: false, numberingSystem: "latn",
  }).format(value);
  return separator === "," ? text.replace(".", ",") : text;
}

/** A fixed-decimals number in the user's locale: the "max" in a range message. */
export function formatFixed(value: number, decimals: number, locale?: string): string {
  return numberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/**
 * A stored percentage AS STORED (5 → "5.00 %", never ×100, as the project screens'
 * `formatRevenuePercent` do). `en-US` grouping by default, as the canvas `Text(n, "#,##0.00 %")`
 * rendered with the app language. `""` for no value.
 */
export function formatStoredPercent(value: number | null | undefined, decimals: number, locale = "en-US"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return `${formatFixed(value, decimals, locale)} %`;
}

/* ═══════════════════════════════════════════════ E11 checkDecimalInput (Wave A) ══ */

/**
 * The outcome of checking a typed number. Screens map each `kind` to their OWN message, so no
 * text changes when a screen adopts this:
 *   blank     nothing but whitespace
 *   format    not a number in the accepted shape (letters, sign, grouping, wrong separator,
 *             or `digitsOnly` failed)
 *   decimals  a well-formed number with more than `maxDecimals` decimals
 *   range     outside `[min, max]` (both inclusive)
 */
export type DecimalCheck =
  | { kind: "ok"; value: number } | { kind: "blank" } | { kind: "format" }
  | { kind: "decimals" } | { kind: "range" };

export interface DecimalCheckOptions {
  /** 0 = whole numbers only. */
  maxDecimals: number;
  min?: number;
  max?: number;
  /** `"language"` = Contracts (UI-language prefix), `"intl"` = `localeInfo`, `"both"` = "." or "," (Milestones rates). */
  separator: SeparatorRule | "both";
  lang?: string;
  /** "1." accepted (Milestones). Default false. */
  allowTrailingSeparator?: boolean;
  /**
   * Replaces the decimals check with a pattern tested on the RAW text (Contracts month
   * `^\d{1,2}$`). A failure is `format`; a match is read with `Number`.
   */
  digitsOnly?: RegExp;
}

/**
 * One validator for the settings number fields (Milestones `validateDuration` /
 * `validateSuccessRate`, Contracts `validateForm` month / margin), built on `isMaxDecimals`,
 * `parseDecimalInput` and `decimalSeparatorFor`, so it accepts exactly what they accept.
 */
export function checkDecimalInput(text: string, opts: DecimalCheckOptions): DecimalCheck {
  if (text.trim() === "") return { kind: "blank" };
  let value: number | undefined;
  if (opts.digitsOnly) {
    if (!opts.digitsOnly.test(text)) return { kind: "format" };
    value = Number(text.trim());
    if (!Number.isFinite(value)) return { kind: "format" };
  } else {
    const separator: AcceptedSeparator = opts.separator === "both"
      ? "both"
      : decimalSeparatorFor(opts.lang, opts.separator);
    const shape = { separator, allowTrailingSeparator: opts.allowTrailingSeparator === true };
    if (!isMaxDecimals(text, { ...shape, places: opts.maxDecimals })) {
      // Well-formed with more decimals → "decimals"; anything else → "format".
      const wellFormed = opts.maxDecimals > 0
        ? isMaxDecimals(text, { ...shape, places: 64 })
        : isMaxDecimals(text, { ...shape, places: 64 }) && /[.,]/.test(text);
      return { kind: wellFormed ? "decimals" : "format" };
    }
    value = parseDecimalInput(text, separator);
    if (value === undefined) return { kind: "format" };
  }
  if ((opts.min !== undefined && value < opts.min) || (opts.max !== undefined && value > opts.max)) {
    return { kind: "range" };
  }
  return { kind: "ok", value: value === 0 ? 0 : value };
}
