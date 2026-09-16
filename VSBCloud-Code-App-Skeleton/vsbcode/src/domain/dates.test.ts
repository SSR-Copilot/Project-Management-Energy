import { describe, it, expect } from "vitest";
import { addMonths, addYears, addYears360, monthsBetween, toMMYY, fromMMYY } from "./dates";

describe("fn_Common date helpers", () => {
  it("UT-DOM-030 DateAddMonths clamps to month end", () => {
    expect(addMonths("2026-01-31", 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
  it("UT-DOM-031 addYears is calendar-correct (DateAddYearsRevamped)", () => {
    expect(addYears("2026-03-15", 1).toISOString().slice(0, 10)).toBe("2027-03-15");
  });
  it("UT-DOM-032 the legacy DateAddYears uses a 360-day year and lands early", () => {
    const legacy = addYears360("2026-03-15", 1).toISOString().slice(0, 10);
    expect(legacy).toBe("2027-03-10");
    expect(legacy).not.toBe("2027-03-15");
  });
  it("UT-DOM-033 fractional years add months then a day remainder", () => {
    expect(addYears("2026-01-01", 1.5).toISOString().slice(0, 10)).toBe("2027-07-01");
  });
  it("UT-DOM-034 monthsBetween floors on incomplete months", () => {
    expect(monthsBetween("2026-01-31", "2026-03-01")).toBe(1);
    expect(monthsBetween("2026-01-01", "2027-01-01")).toBe(12);
  });
  it("UT-DOM-035 MMYY packs and unpacks", () => {
    expect(toMMYY("2031-07-09")).toBe("0731");
    expect(fromMMYY("0731")?.getFullYear()).toBe(2031);
    expect(fromMMYY("1331")).toBeNull();
  });
});
