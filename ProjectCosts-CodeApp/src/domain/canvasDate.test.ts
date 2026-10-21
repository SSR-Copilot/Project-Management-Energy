import { describe, it, expect } from "vitest";
import { dateFromIso, formatCanvasDate, parseCanvasDate } from "./canvasDate";

describe("canvas date picker text (modern controls sweep)", () => {
  it("UT-CDATE-001 ModernDatePicker default is the long date", () => {
    expect(formatCanvasDate(new Date(2015, 0, 20), "LongDate", "en-US")).toBe("Tuesday, January 20, 2015");
  });
  it("UT-CDATE-002 DatePicker@0.0.46 default is LongAbbreviated", () => {
    expect(formatCanvasDate(new Date(2016, 0, 19), "LongAbbreviated", "en-US")).toBe("Tue, Jan 19, 2016");
  });
  it("UT-CDATE-003 a literal dd.mm.yyyy format pads day and month", () => {
    expect(formatCanvasDate(new Date(2026, 2, 5), "dd.mm.yyyy")).toBe("05.03.2026");
  });
  it("UT-CDATE-004 no or an invalid date is blank", () => {
    expect(formatCanvasDate(null, "LongDate")).toBe("");
    expect(formatCanvasDate(new Date(Number.NaN), "dd.mm.yyyy")).toBe("");
  });
  it("UT-CDATE-005 a stored value is read from its local YYYY-MM-DD part (rule 18)", () => {
    const d = dateFromIso("2026-10-19T00:00:00Z");
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate()]).toEqual([2026, 9, 19]);
    expect(dateFromIso("")).toBeNull();
    expect(dateFromIso("2026-02-30")).toBeNull();
  });
  it("UT-CDATE-006 typed text parses dotted, ISO and the shown text", () => {
    const parts = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);
    expect(parts(parseCanvasDate("19.10.2026"))).toEqual([2026, 10, 19]);
    expect(parts(parseCanvasDate("2026-10-19"))).toEqual([2026, 10, 19]);
    expect(parts(parseCanvasDate("Tue, Jan 19, 2016"))).toEqual([2016, 1, 19]);
    expect(parts(parseCanvasDate("Tuesday, January 20, 2015"))).toEqual([2015, 1, 20]);
    expect(parseCanvasDate("31.02.2026")).toBeNull();
    expect(parseCanvasDate("not a date")).toBeNull();
    expect(parseCanvasDate("  ")).toBeNull();
  });
});
