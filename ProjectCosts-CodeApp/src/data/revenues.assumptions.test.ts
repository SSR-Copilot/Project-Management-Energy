import { beforeEach, describe, expect, it, vi } from "vitest";

const getAll = vi.fn();
vi.mock("@/generated/services/AssumptionsRevenueService", () => ({
  AssumptionsRevenueService: { getAll: (o: unknown) => getAll(o) },
}));

import { listRevenueAssumptionRows } from "./revenues";

beforeEach(() => getAll.mockReset());

describe("listRevenueAssumptionRows (Fabric SQL, 29 Oct 2026)", () => {
  it("UT-REV-DATA-001 reads the country's slice through the Milestones loader; a blank category is \"\"", async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [
        { country: "Germany", valuetype: "revenuetype", pv: "fit", wind: "fit" },
        { country: "Germany", valuetype: "price", category: "2030", pv: "60.5", wind: "70" },
      ],
    });
    const rows = await listRevenueAssumptionRows("Germany");
    const options = getAll.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options["select"]).toEqual(["country", "valuetype", "category", "pv", "wind"]);
    expect(options["filter"]).toBe("country eq 'Germany'");
    expect(rows).toEqual([
      { country: "Germany", valuetype: "revenuetype", category: "", wind: "fit", pv: "fit" },
      { country: "Germany", valuetype: "price", category: "2030", wind: "70", pv: "60.5" },
    ]);
  });

  it("UT-REV-DATA-002 Italy reads every Italy* row (1.21.753)", async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [
        { country: "Italy", valuetype: "revenuetype", wind: "ppa" },
        { country: "Italy_North", valuetype: "price", category: "2030", wind: "74.88" },
        { country: "France", valuetype: "price", category: "2030", wind: "65" },
      ],
    });
    const rows = await listRevenueAssumptionRows("Italy");
    const options = getAll.mock.calls[0]![0] as Record<string, unknown>;
    expect(options["filter"]).toBe("startswith(country,'Italy')");
    expect(rows.map((r) => r.country)).toEqual(["Italy", "Italy_North"]);
  });
});
