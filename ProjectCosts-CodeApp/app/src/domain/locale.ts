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
 * Salvage a language tag. `en-US@posix` → `en-US`; `de_DE` → `de-DE`; `EN` → `en`.
 * A German user keeps German formatting rather than silently getting American.
 */
export function repairLanguageTag(raw: string | undefined): string {
  if (!raw) return DEFAULT_LOCALE;
  const cleaned = raw.trim().replace(/_/g, "-").split("@")[0] ?? "";
  if (cleaned && isUsable(cleaned)) return cleaned;
  // Fall back to the primary subtag on its own — `de-DE-oddvariant` → `de`.
  const primary = cleaned.split("-")[0];
  if (primary && isUsable(primary)) return primary;
  return DEFAULT_LOCALE;
}

export function localeInfo(raw?: string): LocaleInfo {
  const tag = repairLanguageTag(raw ?? runtimeLanguage());
  const parts = new Intl.NumberFormat(tag).formatToParts(12345.6);
  const decimal = parts.find((p) => p.type === "decimal")?.value;
  const group = parts.find((p) => p.type === "group")?.value ?? "";
  return {
    tag,
    // Only `.` and `,` occur in the locales VSB operates in; anything else is treated as
    // a comma locale, which is what the canvas `Switch` default did.
    decimalSeparator: decimal === "." ? "." : ",",
    groupSeparator: group,
  };
}

function runtimeLanguage(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.language;
}
