import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MilestoneProject, RevenueAssumptionRow } from "./rules";

const m = vi.hoisted(() => ({
  countProjectRevenues: vi.fn(async (_id: string) => 0),
  listRevenueAssumptions: vi.fn(async (_country: string): Promise<RevenueAssumptionRow[]> => []),
  findCurrency: vi.fn(async (_code: string) => ({ id: "cur-eur", name: "Euro" })),
  loadFirstRevenueSubaccount: vi.fn(async () => ({ id: "sub-1", name: "Revenues" })),
}));
vi.mock("@/data/milestones", () => ({
  countProjectRevenues: m.countProjectRevenues, listRevenueAssumptions: m.listRevenueAssumptions,
}));
vi.mock("@/data/revenues", () => ({
  findCurrency: m.findCurrency, loadFirstRevenueSubaccount: m.loadFirstRevenueSubaccount,
}));

import { loadRevenueSeed } from "./hooks";

const PROJECT: MilestoneProject = {
  id: "p-1", name: "Nordwind", projectNumber: "DE-1021", clusterStateName: "Draft",
  countryId: "c-de", countryName: "Germany", countryBusinessUnitId: "bu-de", areaName: "Sachsen",
  technology: "Wind", technologyValue: 952850000, startCluster: 0, acquisitionDate: null,
  shareOfFarmdown: 50, isStandardShareOfFarmdown: true,
  dates: {
    StartDate: "2026-01-01", FeasibilityStudies: "2026-06-01", ProjectDevelopmentStarted: "2026-12-01",
    ApplicationSubmitted: "2027-06-01", LegallyBindingPermits: "2028-01-01",
    FinalInvestmentDecision: "2028-06-01", Construction: "2029-01-01", OperationsStartDate: "2030-01-01",
    EndDate: "2059-12-31", SalesStartDate: "2031-01-01", StartCompleted: "2031-06-01",
  },
  standardAssumption: {},
  createdByName: null, createdOn: null, modifiedByName: null, modifiedOn: null,
};

const GERMANY: RevenueAssumptionRow[] = [
  { country: "Germany", valuetype: "revenuetype", category: null, pv: "fit", wind: "fit" },
  { country: "Germany", valuetype: "contractdurationyear", category: null, pv: "20", wind: "20" },
  { country: "Germany", valuetype: "contractdurationmonth", category: null, pv: "0", wind: "0" },
  { country: "Germany", valuetype: "price", category: "2030", pv: "70", wind: "80" },
];

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear();
  m.countProjectRevenues.mockResolvedValue(0);
  m.listRevenueAssumptions.mockResolvedValue(GERMANY);
});

describe("loadRevenueSeed (Fabric SQL connected, 28 Oct 2026)", () => {
  it("UT-MSTONE-SEED-001 a Draft project with no contract seeds one from the Fabric rows, EUR and the first subaccount", async () => {
    const seed = await loadRevenueSeed(PROJECT, PROJECT.dates);
    expect(m.listRevenueAssumptions).toHaveBeenCalledWith("Germany");
    expect(m.findCurrency).toHaveBeenCalledWith("EUR");
    expect(seed.fabricFailed).toBe(false);
    expect(seed.draft?.derived.description).toBe("Standard EEG Germany");
    expect(seed.draft?.derived.price).toBe(80);
    expect(seed.draft?.derived.contractEnd).toBe("2049-12-31");
    expect(seed.draft?.data["vsb_Currency@odata.bind"]).toBe("/transactioncurrencies(cur-eur)");
    expect(seed.draft?.data["vsb_Subaccount@odata.bind"]).toContain("(sub-1)");
    expect(seed.draft?.data["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
  });

  it("UT-MSTONE-SEED-002 nothing is read from Fabric outside Draft / Cluster 1 or when a contract exists", async () => {
    expect((await loadRevenueSeed({ ...PROJECT, clusterStateName: "Cluster 2" }, PROJECT.dates)).draft).toBeNull();
    expect(m.countProjectRevenues).not.toHaveBeenCalled();
    m.countProjectRevenues.mockResolvedValue(1);
    expect((await loadRevenueSeed(PROJECT, PROJECT.dates)).draft).toBeNull();
    expect(m.listRevenueAssumptions).not.toHaveBeenCalled();
  });

  it("UT-MSTONE-SEED-003 a failed Fabric read skips the seed and reports it, without failing", async () => {
    m.listRevenueAssumptions.mockRejectedValue(new Error("no connection"));
    expect(await loadRevenueSeed(PROJECT, PROJECT.dates)).toEqual({ draft: null, fabricFailed: true });
  });

  it("UT-MSTONE-SEED-004 a country without a business unit leaves the owner to Dataverse", async () => {
    const seed = await loadRevenueSeed({ ...PROJECT, countryBusinessUnitId: null }, PROJECT.dates);
    expect(seed.draft && "owningbusinessunit@odata.bind" in seed.draft.data).toBe(false);
  });
});