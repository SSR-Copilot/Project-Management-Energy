import { beforeEach, describe, expect, it, vi } from "vitest";

const getAll = vi.fn();
vi.mock("@/generated/services/AssumptionsRevenueService", () => ({
  AssumptionsRevenueService: { getAll: (o: unknown) => getAll(o) },
}));

import { listRevenueAssumptions } from "./milestones";

beforeEach(() => getAll.mockReset());

describe("listRevenueAssumptions (Fabric SQL, 28 Oct 2026)", () => {
  it("UT-MSTONE-DATA-001 reads the country's rows with a $select and maps blanks to null", async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [{ id: "1", uid: "u1", country: "Germany", valuetype: "revenuetype", pv: "fit" }],
    });
    const rows = await listRevenueAssumptions("Germany");
    const options = getAll.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options["select"]).toEqual(["country", "valuetype", "category", "pv", "wind"]);
    expect(options["filter"]).toBe("country eq 'Germany'");
    expect(rows).toEqual([{ country: "Germany", valuetype: "revenuetype", category: null, pv: "fit", wind: null }]);
  });

  it("UT-MSTONE-DATA-002 Italy reads every Italy* row and drops anything outside the slice", async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [
        { country: "Italy", valuetype: "revenuetype", pv: "ppa" },
        { country: "Italy_North", valuetype: "price", category: "2030", pv: "60" },
        { country: "Germany", valuetype: "price", category: "2030", pv: "70" },
      ],
    });
    const rows = await listRevenueAssumptions("Italy");
    expect((getAll.mock.calls[0]?.[0] as Record<string, unknown>)["filter"]).toBe("startswith(country,'Italy')");
    expect(rows.map((r) => r.country)).toEqual(["Italy", "Italy_North"]);
  });

  it("UT-MSTONE-DATA-003 a failed Fabric read throws", async () => {
    getAll.mockResolvedValueOnce({ success: false, error: new Error("no connection") });
    await expect(listRevenueAssumptions("Germany")).rejects.toThrow();
  });
});