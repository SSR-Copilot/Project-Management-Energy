import { beforeEach, describe, expect, it, vi } from "vitest";

const getAll = vi.fn();
vi.mock("@/generated/services/AssumptionsRevenueService", () => ({
  AssumptionsRevenueService: { getAll: (o: unknown) => getAll(o) },
}));

import { listStandardRevenueAssumptions } from "./production";

beforeEach(() => getAll.mockReset());

describe("listStandardRevenueAssumptions (Fabric SQL, 28 Oct 2026)", () => {
  it("UT-PROD-DATA-001 reads the country's seasonality and negative-price rows and parses them", async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [
        { country: "Germany", valuetype: "seasonality", category: "1", pv: "0.065", wind: "0.08" },
        { country: "Germany", valuetype: "negativeprices", category: "2028", pv: "0.05", wind: "0.0456" },
        { country: "France", valuetype: "seasonality", category: "1", pv: "0.5", wind: "0.5" },
      ],
    });
    const out = await listStandardRevenueAssumptions("Germany");
    const options = getAll.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options["select"]).toEqual(["country", "valuetype", "category", "pv", "wind"]);
    expect(options["filter"]).toContain("country eq 'Germany'");
    expect(options["filter"]).toContain("valuetype eq 'seasonality'");
    expect(options["filter"]).toContain("valuetype eq 'negativeprices'");
    expect(out.seasonality).toHaveLength(1);
    expect(out.seasonality[0]!.wtg).toBeCloseTo(8, 10);
    expect(out.negativePrices).toEqual([{ year: 2028, pv: 5, wind: 4.6 }]);
  });

  it("UT-PROD-DATA-002 a failed Fabric read throws", async () => {
    getAll.mockResolvedValueOnce({ success: false, error: new Error("no connection") });
    await expect(listStandardRevenueAssumptions("Germany")).rejects.toThrow();
  });
});