/**
 * D159 (audit finding 10): the month-clamping `addMonths` and the date-text helper each have ONE definition now.
 */
import { describe, expect, it } from "vitest";
import { addMonths } from "@/domain/dates";
import { dateOnlyOf } from "@/data/odata";
import * as opex from "@/features/cost/periods/opexRules";
import { addMonths as leaseAddMonths } from "@/features/cost/periods/landLeaseRules";

describe("UT-DATESHARED one definition per date helper", () => {
  it("UT-DATESHARED-001 the OPEX rules re-export the shared addMonths instead of a copy", () => {
    expect(opex.addMonths).toBe(addMonths);
  });

  it("UT-DATESHARED-002 Land Lease's text-in text-out addMonths clamps to the end of the month, leap years included", () => {
    expect(leaseAddMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(leaseAddMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(leaseAddMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(leaseAddMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(leaseAddMonths("not a date", 1)).toBe("");
  });

  it("UT-DATESHARED-003 dateOnlyOf keeps the first ten characters of a date text and nothing else", () => {
    expect(dateOnlyOf("2026-11-23T00:00:00Z")).toBe("2026-11-23");
    expect(dateOnlyOf("2026-11-23")).toBe("2026-11-23");
    expect(dateOnlyOf("2026-11")).toBeNull();
    expect(dateOnlyOf(null)).toBeNull();
    expect(dateOnlyOf(20261123)).toBeNull();
  });
});
