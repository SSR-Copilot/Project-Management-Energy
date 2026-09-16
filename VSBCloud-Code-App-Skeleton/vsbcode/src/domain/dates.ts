/**
 * Translation of the date helpers in `fn_Common`.
 *
 * DEVIATION FROM SOURCE: `fn_Common.DateAddYears` is
 *   DateAdd(candidate, Trunc(addition * 12 * 30), TimeUnit.Days)
 * i.e. a 360-day year, so "+1 year" lands five or six days early. The source also ships
 * `DateAddYearsRevamped`, which is calendar-correct. `addYears` below implements the
 * revamped behaviour; `addYears360` reproduces the legacy one for parity tests.
 */
import { roundDown, pfxRound } from "./numeric";

const d = (x: Date | string) => (x instanceof Date ? new Date(x.getTime()) : new Date(x));

export function addDays(date: Date | string, days: number): Date {
  const r = d(date);
  r.setDate(r.getDate() + days);
  return r;
}

/** `fn_Common.DateAddMonths` */
export function addMonths(date: Date | string, months: number): Date {
  const r = d(date);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

/** `fn_Common.DateAddYearsRevamped` — whole years, then months, then a day remainder. */
export function addYears(date: Date | string, years: number): Date {
  const whole = roundDown(years, 0);
  const frac = years - whole;
  const months = roundDown(frac * 12, 0);
  const remaining = frac * 12 - months;
  const afterYM = addMonths(addMonths(date, whole * 12), months);
  const daysInMonth = new Date(afterYM.getFullYear(), afterYM.getMonth() + 1, 0).getDate();
  return addDays(afterYM, pfxRound(remaining * daysInMonth, 0));
}

/** `fn_Common.DateAddYears` as shipped — 360-day year. Parity only. */
export function addYears360(date: Date | string, years: number): Date {
  return addDays(date, Math.trunc(years * 12 * 30));
}

/** Whole months between two dates, floor — used by the milestone chain. */
export function monthsBetween(from: Date | string, to: Date | string): number {
  const a = d(from), b = d(to);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return m;
}

/** MMYY packing used by the decommissioning fields on Project Finance. */
export const toMMYY = (date: Date | string) => {
  const x = d(date);
  return `${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getFullYear() % 100).padStart(2, "0")}`;
};

export function fromMMYY(mmyy: string): Date | null {
  if (!/^\d{4}$/.test(mmyy)) return null;
  const mm = Number(mmyy.slice(0, 2)), yy = Number(mmyy.slice(2));
  if (mm < 1 || mm > 12) return null;
  return new Date(2000 + yy, mm - 1, 1);
}

export const startOfYear = (y: number) => new Date(y, 0, 1);
export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Format a date the way the canvas apps do in tables. */
export function formatDate(value: Date | string | null | undefined, locale = "en-GB"): string {
  if (!value) return "";
  const x = d(value);
  return Number.isNaN(x.getTime())
    ? ""
    : x.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}
