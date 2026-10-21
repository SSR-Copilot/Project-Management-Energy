/**
 * The `fn_Numeric` and `fn_Percentage` canvas components, as pure TypeScript.
 *
 * Canvas source: `Src/Components/fn_Numeric.pa.yaml`, `Src/Components/fn_Percentage.pa.yaml`.
 * Both were behaviour-only components with output functions and no UI, so they become plain
 * functions with no React involvement.
 *
 * PARITY NOTES — read before changing anything here:
 *
 * 1. `IsMatch` in Power Fx defaults to `MatchOptions.Complete`, i.e. the pattern is anchored
 *    at BOTH ends. The canvas regexes carry a leading `^` and no trailing `$`, which reads
 *    like a prefix match but is not one: `"12.34abc"` was already rejected. These ports are
 *    anchored to match that.
 *
 * 2. SOURCE DEFECT (B-2) — `fn_Percentage.IsPercentage` is literally `=true`. Every
 *    percentage input in the Cost app therefore validates, including `"abc"` and `""`.
 *    `isPercentage` below actually validates. This is a DIVERGENCE: input the canvas app
 *    accepted is now rejected. Flagged for sign-off; `isPercentageCanvasParity` preserves
 *    the original for a bug-for-bug comparison.
 *
 * 3. SOURCE DEFECT (B-2b) — the canvas decimal checks disagree about sign.
 *    `IsTwoDecimal` uses `^((\+|-?)?\d+(|\.\d{0,2})?)` and accepts a leading `-`;
 *    `IsOneDecimal` and `IsThreeDecimal` use `^((\+?)?...)` and accept only `+`. So the same
 *    negative number passes two-decimal validation and fails one- and three-decimal
 *    validation. `allowNegative` makes the choice explicit at every call site instead;
 *    the canvas asymmetry is reproduced by `*CanvasParity` below.
 */
import { localeInfo } from "./locale";

/* ------------------------------------------------------------------ parsing */

/**
 * Locale-aware equivalent of Power Fx `Value(text, language)`.
 *
 * Returns `undefined` rather than `NaN` or `0` for anything unparseable, because the canvas
 * app's `Value("")` is `Blank()` and `Coalesce(Blank(), 0)` was written explicitly wherever
 * zero was meant. Collapsing the two here would silently turn "field left empty" into "0".
 */
export function parseNumber(text: string | null | undefined, locale?: string): number | undefined {
  if (text === null || text === undefined) return undefined;
  const trimmed = text.trim();
  if (trimmed === "") return undefined;

  const { decimalSeparator, groupSeparator } = localeInfo(locale);
  let normalized = trimmed;
  if (groupSeparator) normalized = normalized.split(groupSeparator).join("");
  // Non-breaking and narrow no-break spaces are group separators in several locales and
  // survive a copy-paste from Excel.
  normalized = normalized.replace(/[  \s]/g, "");
  if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  // Reject anything that is not a plain decimal after normalising; `Number("1e5")` would
  // otherwise accept scientific notation the canvas app never did.
  if (!/^[+-]?\d*\.?\d+$/.test(normalized)) return undefined;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Power Fx `IsNumeric`. */
export function isNumeric(text: string | null | undefined, locale?: string): boolean {
  return parseNumber(text, locale) !== undefined;
}

/* -------------------------------------------------------------- validators */

export interface DecimalOptions {
  /** Maximum digits after the separator. `fn_Numeric` shipped 1, 2 and 3. */
  places: 0 | 1 | 2 | 3;
  /** See PARITY NOTE 3 — the canvas answer differed per function. */
  allowNegative?: boolean;
  locale?: string;
}

/**
 * The compiled patterns, by source. There are at most sixteen — two separators × four
 * `places` × two signs — but each `new RegExp` would otherwise be built and compiled afresh
 * on every keystroke of every numeric field. None carries `g` or `y`, so there is no
 * `lastIndex` to leak between callers and one instance is safely shared.
 */
const decimalPatterns = new Map<string, RegExp>();

function decimalPattern(source: string): RegExp {
  let pattern = decimalPatterns.get(source);
  if (pattern === undefined) {
    pattern = new RegExp(source);
    decimalPatterns.set(source, pattern);
  }
  return pattern;
}

/**
 * `fn_Numeric.IsOneDecimal` / `IsTwoDecimal` / `IsThreeDecimal`, unified.
 *
 * The canvas pattern `^((\+|-?)?\d+(|\.\d{0,2})?)` allows a bare sign, requires at least one
 * integer digit, and makes the fractional part optional with *zero to n* digits — so `"1."`
 * matched. That is reproduced exactly.
 */
export function isDecimal(text: string | null | undefined, options: DecimalOptions): boolean {
  if (text === null || text === undefined) return false;
  const candidate = text.trim();
  if (candidate === "") return false;

  const { decimalSeparator } = localeInfo(options.locale);
  const sep = decimalSeparator === "." ? "\\." : ",";
  const sign = options.allowNegative ? "[+-]?" : "\\+?";
  const frac = options.places === 0 ? "" : `(?:${sep}\\d{0,${options.places}})?`;
  return decimalPattern(`^${sign}\\d+${frac}$`).test(candidate);
}

/** `fn_Numeric.IsInteger` — numeric AND containing no `.` or `,`. */
export function isInteger(text: string | null | undefined, locale?: string): boolean {
  if (text === null || text === undefined) return false;
  if (/[.,]/.test(text)) return false;
  return isNumeric(text, locale);
}

/** `fn_Numeric.InRange` — numeric AND `min <= value <= max`, both inclusive. */
export function inRange(
  text: string | null | undefined,
  min: number,
  max: number,
  locale?: string,
): boolean {
  const value = parseNumber(text, locale);
  return value !== undefined && value >= min && value <= max;
}

/**
 * `fn_Numeric.IsNumberOrBlank` — note this one returned a NUMBER, not a boolean, despite the
 * name: `Round(Value(trim(candidate)), 2)` or `Blank()`. Call sites used it as a coercion.
 */
export function numberOrBlank(
  text: string | null | undefined,
  locale?: string,
): number | undefined {
  const value = parseNumber(text, locale);
  return value === undefined ? undefined : round(value, 2);
}

/**
 * What `fn_Percentage.IsPercentage` should have been: a number, at most two decimals,
 * between 0 and 100 inclusive.
 *
 * SOURCE DEFECT (B-2) — the canvas implementation is `=true`. The 0–100 bound is an
 * assumption drawn from the call sites (contract margin percentage), NOT from the canvas
 * code, which has no bound at all. If margins above 100 % are legitimate, widen it here.
 */
export function isPercentage(text: string | null | undefined, locale?: string): boolean {
  if (!isDecimal(text, { places: 2, allowNegative: false, locale })) return false;
  return inRange(text, 0, 100, locale);
}

/** Bug-for-bug twin of the canvas `fn_Percentage.IsPercentage`. Kept for parity testing. */
export function isPercentageCanvasParity(): boolean {
  return true;
}

/** Bug-for-bug twins of the canvas sign asymmetry. See PARITY NOTE 3. */
export function isOneDecimalCanvasParity(text: string | null | undefined, locale?: string) {
  return isDecimal(text, { places: 1, allowNegative: false, locale });
}
export function isTwoDecimalCanvasParity(text: string | null | undefined, locale?: string) {
  return isDecimal(text, { places: 2, allowNegative: true, locale });
}
export function isThreeDecimalCanvasParity(text: string | null | undefined, locale?: string) {
  return isDecimal(text, { places: 3, allowNegative: false, locale });
}

/* --------------------------------------------------------------- arithmetic */

/**
 * Power Fx `Round` is half-away-from-zero. JavaScript `Math.round` is half-up, so it
 * disagrees on every negative half (`Math.round(-2.5) === -2`, Power Fx gives `-3`).
 * Money is involved, so this matters.
 */
export function round(value: number, places = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  const scaled = value * factor;
  // The epsilon nudge stops 1.005 * 100 === 100.49999999999999 from rounding down.
  const corrected = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return corrected / factor;
}

/** `Sum(a, b, ...)` in Power Fx skips `Blank()`; `undefined + 1` in JS is `NaN`. */
export function sum(...values: (number | undefined | null)[]): number {
  let total = 0;
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) total += v;
  return total;
}

/** `Coalesce(value, 0)`, which the canvas app wrote out longhand dozens of times. */
export function orZero(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Power Fx `RoundDown` / `RoundUp` — toward zero and away from it.
 *
 * Distinct from `round()` above, which is half-away-from-zero. The CAPEX distribution rules
 * depend on `RoundDown`: the payment count is `RoundDown(span / freq, 0) + 1` and the equal
 * amount is `RoundDown(total / n, 0)`, so substituting `Math.round` changes every figure.
 */
export const roundDown = (x: number, places = 0): number => {
  const m = 10 ** places;
  return (x < 0 ? Math.ceil(x * m) : Math.floor(x * m)) / m;
};

export const roundUp = (x: number, places = 0): number => {
  const m = 10 ** places;
  return (x < 0 ? Math.floor(x * m) : Math.ceil(x * m)) / m;
};
