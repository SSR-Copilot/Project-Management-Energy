/**
 * Locale handling, which the canvas app did by hand and got subtly wrong.
 *
 * `fn_Numeric` branches on `Lower(First(Split(Language(), "-")).Value)`: `"en"` means the
 * decimal separator is `.`, and *every other language* means it is `,`. The Save handler then
 * parses with `Value(txt.Value, gblCurrentUser.Lang)`. Both are locale-dependent, so the same
 * keystrokes mean different numbers to a German and an English user — which is correct
 * behaviour, but it has to be preserved deliberately rather than by accident.
 *
 * `Intl` also throws on a malformed language tag, and `navigator.language` is not guaranteed
 * well-formed (a host with no `LANG` can report `en-US@posix`). Every number and date in this
 * app goes through `Intl`, so one bad tag would blank the whole screen. `resolveLocale`
 * repairs the tag where it can and only falls back when nothing is salvageable.
 */

/** What the canvas app's fallback branch assumed: comma decimals. */
const DEFAULT_LOCALE = "de-DE";

export interface LocaleInfo {
  tag: string;
  decimalSeparator: "." | ",";
  groupSeparator: string;
}

function isUsable(tag: string): boolean {
  try {
    new Intl.NumberFormat(tag);
    return true;
  } catch {
    return false;
  }
}

/**
 * Both functions below are pure — the same tag always resolves the same way — but each one
 * constructs an `Intl.NumberFormat`, which costs ~80 µs. They sit under `parseNumber` /
 * `isDecimal`, i.e. under every keystroke in every numeric field and every cell of a pasted
 * sheet, so the answers are memoised. The key set is tiny in practice: the host language plus
 * the handful of literal tags the rules files pass.
 *
 * The cap exists only so a caller feeding unbounded distinct tags cannot grow the map without
 * limit; it is never reached by this app's call sites.
 */
const MAX_CACHED_LOCALES = 64;
/** Cache key for "no tag at all" — `|` is not legal in a BCP-47 tag, so it cannot collide. */
const NO_TAG = "|none|";
const repairedTags = new Map<string, string>();
const localeInfos = new Map<string, LocaleInfo>();

/**
 * Salvage a language tag. `en-US@posix` → `en-US`; `de_DE` → `de-DE`; `EN` → `en`.
 * A German user keeps German formatting rather than silently getting American.
 */
export function repairLanguageTag(raw: string | undefined): string {
  if (!raw) return DEFAULT_LOCALE;
  const cached = repairedTags.get(raw);
  if (cached !== undefined) return cached;
  const cleaned = raw.trim().replace(/_/g, "-").split("@")[0] ?? "";
  let resolved: string;
  if (cleaned && isUsable(cleaned)) {
    resolved = cleaned;
  } else {
    // Fall back to the primary subtag on its own — `de-DE-oddvariant` → `de`.
    const primary = cleaned.split("-")[0];
    resolved = primary && isUsable(primary) ? primary : DEFAULT_LOCALE;
  }
  if (repairedTags.size >= MAX_CACHED_LOCALES) repairedTags.clear();
  repairedTags.set(raw, resolved);
  return resolved;
}

export function localeInfo(raw?: string): LocaleInfo {
  /*
   * Keyed on the RAW argument, before repair, so that the `undefined` case still re-reads
   * `navigator.language` on every call and a host that changed it is not served a stale
   * answer. `|` cannot occur in a language tag, so the sentinel cannot collide with one.
   */
  const key = raw ?? runtimeLanguage() ?? NO_TAG;
  const cached = localeInfos.get(key);
  if (cached !== undefined) return cached;

  const tag = repairLanguageTag(raw ?? runtimeLanguage());
  const parts = new Intl.NumberFormat(tag).formatToParts(12345.6);
  const decimal = parts.find((p) => p.type === "decimal")?.value;
  const group = parts.find((p) => p.type === "group")?.value ?? "";
  // Frozen because it is now shared between callers rather than built fresh for each.
  const info: LocaleInfo = Object.freeze({
    tag,
    // Only `.` and `,` occur in the locales VSB operates in; anything else is treated as
    // a comma locale, which is what the canvas `Switch` default did.
    decimalSeparator: decimal === "." ? "." : ",",
    groupSeparator: group,
  });
  if (localeInfos.size >= MAX_CACHED_LOCALES) localeInfos.clear();
  localeInfos.set(key, info);
  return info;
}

function runtimeLanguage(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.language;
}

/* ------------------------------------------------------- formatter reuse */

const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * A shared `Intl.NumberFormat` for a (locale, options) pair.
 *
 * Constructing one costs ~80 µs; calling `.format()` on an existing one costs ~1.5 µs. The
 * rules files format every money cell of every row through these, so the formatters are
 * pooled rather than rebuilt. An `Intl.NumberFormat` holds no per-call state, so sharing one
 * between callers is safe and the output is byte-identical.
 *
 * The key is the options object as written at the call site. Two call sites spelling the same
 * options in a different order simply get an entry each — a miss is never a wrong answer.
 */
export function numberFormat(
  locale: string | readonly string[] | undefined,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}|${options === undefined ? "" : JSON.stringify(options)}`;
  const cached = numberFormats.get(key);
  if (cached !== undefined) return cached;
  // Constructed BEFORE the cache write so a tag `Intl` rejects throws exactly as it does
  // today rather than poisoning the pool.
  const format = new Intl.NumberFormat(locale as string | string[] | undefined, options);
  if (numberFormats.size >= MAX_CACHED_LOCALES) numberFormats.clear();
  numberFormats.set(key, format);
  return format;
}

/**
 * A canvas range message `$"… between 0 and {Text(max, "#,###.0#")}."` in the given language (D117): the maximum with
 * the language's grouping and one decimal ("1.000.000.000,0" in German). `enMessage` is the English text the code keeps
 * as its reference ("…1,000,000,000.0."); only its number is replaced. No locale means the browser's, as the Cost
 * screens read their boxes.
 */
export function rangeMessageFor(enMessage: string, max: number, locale?: string): string {
  const shown = canvasNumberText(max, locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return enMessage.replace(/\d{1,3}(?:,\d{3})*\.0(?!\d)/, shown);
}

/**
 * Power Fx `Text(n, "#,###.0#")` in a language (D117): the PATTERN decides where the separators go — groups of three
 * digits, whatever the language — and the language only decides which characters they are ("1.234.567,5" in German,
 * "1 234 567,5" in French, "1,234,567.5" in English). `Intl` with the full locale is not the same: en-IN groups in lakhs
 * ("12,34,567"). No locale means the browser's, as the Cost screens read their boxes.
 */
export function canvasNumberText(
  value: number, locale: string | undefined,
  options: Pick<Intl.NumberFormatOptions, "minimumFractionDigits" | "maximumFractionDigits" | "useGrouping">,
): string {
  const { decimalSeparator, groupSeparator } = localeInfo(locale);
  const en = numberFormat("en-US", options).format(value);
  return en.replace(/[.,]/g, (c) => (c === "." ? decimalSeparator : groupSeparator));
}

const collators = new Map<string, Intl.Collator>();

/**
 * A shared `Intl.Collator` for a (locale, options) pair (OPT-29, B8). `a.localeCompare(b, locale, options)` is specified as
 * `new Intl.Collator(locale, options).compare(a, b)`, and an engine builds a collator on every call that passes a locale or options
 * (a sort of n rows makes about n log n of them). `collator(locale, options).compare` gives the same order from one pooled instance.
 * Both arguments are strings here, as at every call site; `localeCompare` would throw on a missing receiver where `compare` would not.
 */
export function collator(locale: string | undefined, options?: Intl.CollatorOptions): Intl.Collator {
  const key = `${locale}|${options === undefined ? "" : JSON.stringify(options)}`;
  const cached = collators.get(key);
  if (cached !== undefined) return cached;
  const made = new Intl.Collator(locale, options);
  if (collators.size >= MAX_CACHED_LOCALES) collators.clear();
  collators.set(key, made);
  return made;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * The same pooling for dates. `Date.prototype.toLocaleDateString(locale, options)` builds one
 * of these on every call — ~205 µs against ~6 µs for `.format()` on an existing one — and the
 * card lists call it once per row.
 */
export function dateFormat(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = dateFormats.get(key);
  if (cached !== undefined) return cached;
  const format = new Intl.DateTimeFormat(locale, options);
  if (dateFormats.size >= MAX_CACHED_LOCALES) dateFormats.clear();
  dateFormats.set(key, format);
  return format;
}
