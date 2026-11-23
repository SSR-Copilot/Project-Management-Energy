/**
 * OPT-31 (B8): the `dateOnly` copies re-inlined in the Cost rules, and the three `day()` Date Only parsers, are
 * identical to the shared ones. The OLD bodies are copied here as oracles and compared over an edge table
 * before any copy was deleted. Kept after the copies went: it still pins the shared helpers.
 */
import { describe, expect, it } from "vitest";
import { dateOnly, localDayOf } from "./dates";
import { dateOnly as dateOnlyViaOdata } from "@/data/odata";

/* ── the old bodies, verbatim ── */
const oldOdata = (value: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};
const oldCapexRules = (end: Date) => `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
const oldModel = (start: Date) => `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
const oldLandLeaseToIso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const oldLandLeaseScreenIsoDay = (value: Date | undefined): string | null => {
  if (!value || Number.isNaN(value.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
};
const oldOpexRulesA = (start: Date) => `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${
  String(start.getDate()).padStart(2, "0")}`;
const oldOpexScreenIso = (date: Date | null): string => (date === null ? "" : [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-"));

function edgeDates(): Date[] {
  const out: Date[] = [];
  const times: [number, number, number, number][] = [[0, 0, 0, 0], [12, 0, 0, 0], [23, 59, 59, 999]];
  for (let y = 1999; y <= 2100; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 28, 29, 30, 31]) {
        for (const [h, mi, s, ms] of times) out.push(new Date(y, m - 1, d, h, mi, s, ms));
      }
    }
  }
  // Local DST boundaries (Europe / US) and their neighbours, at every time of day.
  for (const [y, m, d] of [[2026, 3, 29], [2026, 10, 25], [2026, 3, 8], [2026, 11, 1], [2026, 3, 28], [2026, 10, 24], [2027, 3, 28], [2027, 10, 31]] as const) {
    for (const [h, mi, s, ms] of times) out.push(new Date(y, m - 1, d, h, mi, s, ms));
    out.push(new Date(y, m - 1, d, 2, 30, 0, 0), new Date(y, m - 1, d, 1, 59, 59, 999), new Date(y, m - 1, d, 3, 0, 0, 0));
  }
  // Years outside 1000..9999 and the epoch.
  for (const y of [5, 99, 999, 1000, 9999, 10000, 275760]) { const x = new Date(2000, 0, 1); x.setFullYear(y); out.push(x); }
  out.push(new Date(0), new Date(8.64e15), new Date(-8.64e15), new Date(Number.NaN));
  return out;
}

describe("OPT-31 dateOnly: every inlined copy equals the shared one", () => {
  it("UT-DATES-OPT-001 shared dateOnly equals all seven old bodies over the edge table", () => {
    const dates = edgeDates();
    expect(dates.length).toBeGreaterThan(18000);
    for (const x of dates) {
      const want = oldOdata(x);
      expect(dateOnly(x)).toBe(want);
      expect(dateOnlyViaOdata(x)).toBe(want);
      expect(oldCapexRules(x)).toBe(want);
      expect(oldModel(x)).toBe(want);
      expect(oldLandLeaseToIso(x)).toBe(want);
      expect(oldOpexRulesA(x)).toBe(want);
      expect(oldOpexScreenIso(x)).toBe(want);
    }
  });

  it("UT-DATES-OPT-002 the guarded variants differ ONLY by their null guard, which stays at the call site", () => {
    for (const x of edgeDates()) {
      const guarded = oldLandLeaseScreenIsoDay(x);
      expect(guarded).toBe(Number.isNaN(x.getTime()) ? null : dateOnly(x));
    }
    expect(oldLandLeaseScreenIsoDay(undefined)).toBeNull();
    expect(oldOpexScreenIso(null)).toBe("");
  });

  it("UT-DATES-OPT-003 local midnight, noon and 23:59:59.999 are the same calendar day (rule 18)", () => {
    expect(dateOnly(new Date(2026, 8, 18, 0, 0, 0, 0))).toBe("2026-09-18");
    expect(dateOnly(new Date(2026, 8, 18, 12))).toBe("2026-09-18");
    expect(dateOnly(new Date(2026, 8, 18, 23, 59, 59, 999))).toBe("2026-09-18");
    expect(dateOnly(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

/* ── the three old day() parsers, verbatim ── */
const oldRevenuesDay = (v: unknown): Date | null => {
  if (typeof v !== "string" || v.length < 10) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const oldFinanceRawDay = (v: unknown): Date | null => {
  if (typeof v !== "string" || v.length < 10) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const oldFinanceScreenDay = (v: unknown): Date | null => {
  if (typeof v !== "string" || v.length < 10) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const same = (a: Date | null, b: Date | null) => (a === null ? b === null : b !== null && Object.is(a.getTime(), b.getTime()));

describe("OPT-31 Date Only text parsers", () => {
  const values: unknown[] = [
    "2026-03-29", "2026-10-25", "2026-03-29T00:00:00Z", "2026-03-29T23:59:59.999Z", "2026-01-01", "2026-12-31",
    "2026-02-29", "2026-02-31", "2026-04-31", "2026-00-10", "2026-01-00", "0000-01-01", "0000-00-00",
    "2026-13-01", "2026-12-32", "2026-99-99", "0001-01-01", "0099-12-31", "9999-12-31",
    "2026/01/01", "2026-1-1", "2026-1-01xx", "abcdefghij", "          ", "2026-ab-01", "-2026-01-0", "2026-01-01 extra",
    "", "2026", "2026-01-0", 20260101, null, undefined, true, {}, [], new Date(2026, 0, 1), Number.NaN,
  ];
  it("UT-DATES-OPT-004 localDayOf equals the three old parsers incl. zero parts and out-of-range months/days", () => {
    for (const v of values) {
      const want = oldRevenuesDay(v);
      expect(same(localDayOf(v), want), `value ${String(v)}`).toBe(true);
      expect(same(oldFinanceRawDay(v), want), `rawDay ${String(v)}`).toBe(true);
      expect(same(oldFinanceScreenDay(v), want), `day ${String(v)}`).toBe(true);
    }
    for (let y = 1999; y <= 2100; y++) for (let m = 0; m <= 13; m++) for (const d of [0, 1, 28, 29, 30, 31, 32]) {
      const text = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      expect(same(localDayOf(text), oldRevenuesDay(text)), text).toBe(true);
    }
  });
  it("UT-DATES-OPT-005 localDayOf returns a LOCAL day, and rolls an out-of-range day over exactly as the old copies did", () => {
    const x = localDayOf("2026-03-29T23:59:59Z");
    expect([x?.getFullYear(), x?.getMonth(), x?.getDate(), x?.getHours()]).toEqual([2026, 2, 29, 0]);
    const rolled = localDayOf("2026-02-31");
    expect([rolled?.getMonth(), rolled?.getDate()]).toEqual([2, 3]);
  });
});
