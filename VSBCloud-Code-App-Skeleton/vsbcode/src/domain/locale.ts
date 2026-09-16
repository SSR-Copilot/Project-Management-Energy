/**
 * The browser's language tag, made safe to hand to `Intl`.
 *
 * `navigator.language` is not guaranteed to be a well-formed BCP 47 tag. A host with no
 * `LANG` set reports `en-US@posix`, and `new Intl.NumberFormat("en-US@posix")` throws
 * `RangeError: Invalid language tag`. Every number and date on every screen goes through
 * `Intl`, so one bad tag does not degrade formatting — it takes the whole app to the error
 * boundary before a single screen renders.
 *
 * This was found by the scenario walk on a machine with no locale configured: all 31 steps
 * rendered the error boundary and not one of the failures was the application's own. A user
 * on an unusual host would have seen exactly the same thing.
 *
 * The canvas app had no equivalent problem because `Language()` returns a tag the platform
 * produced. Reading the tag from the browser is new in this rebuild, so the validation is too.
 */

/** The fallback. Matches the canvas default and is a tag `Intl` always accepts. */
export const DEFAULT_LOCALE = "en-US";

/**
 * `true` if `Intl` will accept the tag.
 *
 * Asking `Intl` is the only reliable test: the accepted grammar is the runtime's, not a
 * regular expression's, and a tag that passes a hand-written pattern can still be rejected.
 */
export function isUsableLocale(tag: string | undefined | null): boolean {
  if (!tag) return false;
  try {
    // Both, because they do not accept identical inputs in every runtime.
    new Intl.NumberFormat(tag);
    new Intl.DateTimeFormat(tag);
    return true;
  } catch {
    return false;
  }
}

/**
 * The tag, repaired if it can be and replaced if it cannot.
 *
 * `en-US@posix` and `de_DE.UTF-8` both carry a usable language and region in front of the
 * part that breaks `Intl`, so the first attempt is to keep the user's actual language by
 * trimming at the first `@`, `.` or `_` and re-testing. Only a tag that fails even then falls
 * back to `en-US` — a German user should not silently get American number formatting because
 * their shell exports a POSIX suffix.
 */
export function normaliseLocale(tag: string | undefined | null): string {
  if (isUsableLocale(tag)) return tag as string;
  if (tag) {
    const trimmed = tag.split(/[@.]/)[0].replace(/_/g, "-").trim();
    if (trimmed && trimmed !== tag && isUsableLocale(trimmed)) return trimmed;
  }
  return DEFAULT_LOCALE;
}

/** The browser's locale, normalised. Safe to hand straight to `Intl`. */
export const browserLocale = (): string =>
  normaliseLocale(typeof navigator !== "undefined" ? navigator.language : DEFAULT_LOCALE);
