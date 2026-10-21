/**
 * Translation of `fn_Numeric` and `fn_Numeric_With_Separtors` (PM) and `fn_Numeric`
 * (Cost), plus `fn_Percentage` and `fn_Common.IsValidCurrency`.
 *
 * The canvas versions are locale-aware: every decimal check branches on
 * `Lower(First(Split(Language(),"-")).Value)` and uses `.` for `"en"`, `,` otherwise.
 * That behaviour is preserved via an explicit `lang` argument so it is testable, rather
 * than reading a global.
 *
 * DEVIATIONS FROM SOURCE (deliberate, see Defects and open questions):
 *  - The Cost app's `fn_Numeric` decimal regexes are unanchored, so `"12.34abc"`
 *    validates. Ours are anchored. Set `looseTail: true` to reproduce the canvas bug
 *    if strict parity is required.
 *  - `fn_Percentage.IsPercentage` is literally `=true` in the source. `isPercentage`
 *    here actually validates; `isPercentageCanvasParity` reproduces the original.
 */

export type Lang = string;

/** `Lower(First(Split(Language(),"-")).Value)` */
export function langRoot(language: Lang): string {
  return (language.split("-")[0] ?? "").toLowerCase();
}

/** Decimal separator the canvas app would use for a language. */
export function decimalSeparator(language: Lang): "." | "," {
  return langRoot(language) === "en" ? "." : ",";
}

/**
 * `Value(candidate)` / `Value(candidate, culture)`.
 * Returns NaN where Power Fx would return an error.
 */
export function parseNumber(candidate: string | number | null | undefined, language: Lang = "en-US"): number {
  if (candidate === null || candidate === undefined) return NaN;
  if (typeof candidate === "number") return candidate;
  const raw = candidate.trim();
  if (raw === "") return NaN;
  const sep = decimalSeparator(language);
  // Strip the thousands separator, normalise the decimal separator.
  const normalised =
    sep === "."
      ? raw.replace(/,/g, "")
      : raw.replace(/\./g, "").replace(/,/g, ".");
  if (!/^[+-]?\d*(\.\d+)?$/.test(normalised)) return NaN;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : NaN;
}

/** `IsNumeric(candidate)` */
export function isNumeric(candidate: string | number | null | undefined, language: Lang = "en-US"): boolean {
  return !Number.isNaN(parseNumber(candidate, language));
}

/** `fn_Numeric.InRange` — `And(IsNumeric(c), Value(c) >= min, Value(c) <= max)` */
export function inRange(candidate: string, min: number, max: number, language: Lang = "en-US"): boolean {
  const v = parseNumber(candidate, language);
  if (Number.isNaN(v)) return false;
  return v >= min && v <= max;
}

/** `fn_Numeric.InRangeAbs` — `IfError(With({v: Value(c)}, v>=min And v<=max), false)` */
export function inRangeAbs(candidate: string, min: number, max: number, language: Lang = "en-US"): boolean {
  return inRange(candidate, min, max, language);
}

/** `fn_Numeric.InRangeCulture` */
export function inRangeCulture(candidate: string, min: number, max: number, culture: Lang): boolean {
  return inRange(candidate, min, max, culture);
}

/** `fn_Numeric.IsInteger` — numeric AND contains neither `.` nor `,` */
export function isInteger(candidate: string, language: Lang = "en-US"): boolean {
  return isNumeric(candidate, language) && !/[.,]/.test(candidate);
}

const decimalRx = (places: number, sep: "." | ",", anchoredTail: boolean) =>
  new RegExp(
    `^[+-]?\\d+(?:${sep === "." ? "\\." : ","}\\d{0,${places}})?${anchoredTail ? "$" : ""}`,
  );

/**
 * `fn_Numeric.IsOneDecimal` / `IsTwoDecimal` / `IsThreeDecimal` / `IsSixDecimal`.
 * @param looseTail reproduce the Cost app's unanchored regex (see DEVIATIONS)
 */
export function isDecimalWithPlaces(
  candidate: string,
  places: 1 | 2 | 3 | 6,
  language: Lang = "en-US",
  looseTail = false,
): boolean {
  return decimalRx(places, decimalSeparator(language), !looseTail).test(candidate);
}

export const isOneDecimal = (c: string, l?: Lang) => isDecimalWithPlaces(c, 1, l);
export const isTwoDecimal = (c: string, l?: Lang) => isDecimalWithPlaces(c, 2, l);
export const isThreeDecimal = (c: string, l?: Lang) => isDecimalWithPlaces(c, 3, l);
export const isSixDecimal = (c: string, l?: Lang) => isDecimalWithPlaces(c, 6, l);

/** `fn_Common.IsValidCurrency` — up to two decimal places, optional leading `+`. */
export function isValidCurrency(candidate: string, language: Lang = "en-US"): boolean {
  const sep = decimalSeparator(language);
  return new RegExp(`^\\+?\\d+(?:${sep === "." ? "\\." : ","}\\d{0,2})?$`).test(candidate);
}

/** A real percentage check: numeric and 0..100 inclusive. */
export function isPercentage(candidate: string, language: Lang = "en-US"): boolean {
  return inRange(candidate, 0, 100, language);
}

/**
 * `fn_Percentage.IsPercentage` as shipped — the source property body is `=true`.
 * Kept so a parity test can assert the canvas behaviour explicitly.
 */
export function isPercentageCanvasParity(): boolean {
  return true;
}

/**
 * `fn_Numeric_With_Separtors` — group digits for display.
 * German/most-European grouping uses `.` for thousands and `,` for decimals.
 */
export function formatWithSeparators(
  value: number | null | undefined,
  language: Lang = "en-US",
  places = 2,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(value);
}

export function formatInteger(value: number | null | undefined, language: Lang = "en-US"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
}

/** `Round(x, places)` — Power Fx rounds half away from zero, unlike JS Math.round. */
export function pfxRound(x: number, places = 0): number {
  if (!Number.isFinite(x)) return NaN;
  const m = 10 ** places;
  const v = x * m;
  const r = v < 0 ? -Math.round(-v) : Math.round(v);
  return r / m;
}

/** `RoundDown` / `RoundUp` */
export const roundDown = (x: number, places = 0) => {
  const m = 10 ** places;
  return (x < 0 ? Math.ceil(x * m) : Math.floor(x * m)) / m;
};
export const roundUp = (x: number, places = 0) => {
  const m = 10 ** places;
  return (x < 0 ? Math.floor(x * m) : Math.ceil(x * m)) / m;
};

/** `Coalesce(a, b, ...)` — first value that is neither blank nor error. */
export function coalesce<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) {
    if (v !== null && v !== undefined && (v as unknown) !== "") return v;
  }
  return undefined;
}

/** `IsBlank(x)` — Power Fx treats "" as blank. */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}
