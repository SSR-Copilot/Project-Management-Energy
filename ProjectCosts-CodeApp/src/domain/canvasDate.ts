/**
 * The input text of a canvas date picker, by its `Format` (modern controls sweep, 20 Oct 2026).
 *
 * The PM canvas screens use two picker controls, and each control's `Format` decides the text in
 * its box:
 *  - `ModernDatePicker@1.0.1` with no `Format` set shows the LONG date, "Tuesday, January 20, 2015"
 *    (`DateTimeFormat.LongDate`) — e.g. Milestones' Project Start and Cluster 3;
 *  - `DatePicker@0.0.46` with no `Format` set, or `'DatePickerCanvas.Format'.LongAbbreviated`,
 *    shows "Tue, Jan 19, 2016";
 *  - a literal `Format: ="dd.mm.yyyy"` (Finance's decommissioning dates, the Revenues contract
 *    dates) shows "19.01.2016" — `mm` is the month in a date format.
 *
 * Pure: no `Date.now()`, the locale is passed in. The weekday and the day come from the LOCAL
 * calendar date (CONVENTIONS rule 18); a stored value is parsed from its `YYYY-MM-DD` part.
 */
import { dateFormat } from "./locale";

/** A canvas date picker `Format`. */
export type CanvasDateFormat = "LongDate" | "LongAbbreviated" | "dd.mm.yyyy";

/** `ModernDatePicker@1.0.1` with no `Format` — the long date. */
export const MODERN_DATE_PICKER_FORMAT: CanvasDateFormat = "LongDate";
/** `DatePicker@0.0.46` with no `Format` — `'DatePickerCanvas.Format'.LongAbbreviated`. */
export const DATE_PICKER_FORMAT: CanvasDateFormat = "LongAbbreviated";

const pad = (n: number) => String(n).padStart(2, "0");

/** The text a canvas picker with `format` shows for `date`; "" for no (or an invalid) date. */
export function formatCanvasDate(date: Date | null | undefined, format: CanvasDateFormat, locale = "en-US"): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  switch (format) {
    case "dd.mm.yyyy":
      return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
    case "LongDate":
      return dateFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
    case "LongAbbreviated":
      return dateFormat(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date);
  }
}

/** A stored date (`YYYY-MM-DD`, or a date-time whose first ten characters are one) as a local-midnight `Date`. */
export function dateFromIso(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/**
 * Typed text back to a local date (`IsEditable: true`): `dd.mm.yyyy` (also `d.m.yyyy`), ISO
 * `YYYY-MM-DD`, or the long / abbreviated text the picker shows. Null when it is not a date.
 */
export function parseCanvasDate(text: string): Date | null {
  const t = text.trim();
  if (!t) return null;
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (dotted) {
    const [day, month, year] = [Number(dotted[1]), Number(dotted[2]), Number(dotted[3])];
    const d = new Date(year, month - 1, day);
    return d.getMonth() === month - 1 && d.getDate() === day ? d : null;
  }
  const iso = dateFromIso(t);
  if (iso) return iso;
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}
