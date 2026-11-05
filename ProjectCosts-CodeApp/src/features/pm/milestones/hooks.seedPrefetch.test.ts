// @vitest-environment jsdom
/**
 * PM Milestones save performance (5 Nov 2026): the default revenue seed's reads run together, and
 * are read ahead when the screen opens, so the save does not wait for Fabric SQL. Same reads, same
 * gate (a fresh count first; no Fabric read for a project with a contract), same outcome.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MilestoneProject, RevenueAssumptionRow } from "./rules";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

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

import { loadRevenueSeed, loadRevenueSeedInputs, useRevenueSeedInputsLoader } from "./hooks";

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

const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear();
  m.countProjectRevenues.mockResolvedValue(0);
  m.listRevenueAssumptions.mockResolvedValue(GERMANY);
  m.findCurrency.mockResolvedValue({ id: "cur-eur", name: "Euro" });
  m.loadFirstRevenueSubaccount.mockResolvedValue({ id: "sub-1", name: "Revenues" });
});

describe("the seed's reads run together and are read ahead (save performance, 5 Nov 2026)", () => {
  it("UT-MSTONE-SEED-005 the Fabric, EUR and subaccount reads all start before any of them answers", async () => {
    let release: (rows: RevenueAssumptionRow[]) => void = () => {};
    m.listRevenueAssumptions.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = loadRevenueSeedInputs("Germany");
    await Promise.resolve();
    expect(m.findCurrency).toHaveBeenCalledWith("EUR");
    expect(m.loadFirstRevenueSubaccount).toHaveBeenCalled();
    release(GERMANY);
    await expect(pending).resolves.toEqual({ assumptions: GERMANY, currencyId: "cur-eur", subaccountId: "sub-1" });
  });

  it("UT-MSTONE-SEED-006 a Fabric failure still wins (fabricFailed); a currency failure alone still fails the save", async () => {
    m.listRevenueAssumptions.mockRejectedValueOnce(new Error("no connection"));
    m.findCurrency.mockRejectedValueOnce(new Error("403"));
    expect(await loadRevenueSeed(PROJECT, PROJECT.dates)).toEqual({ draft: null, fabricFailed: true });

    m.findCurrency.mockRejectedValueOnce(new Error("403"));
    await expect(loadRevenueSeed(PROJECT, PROJECT.dates)).rejects.toThrow("403");
  });

  it("UT-MSTONE-SEED-007 the injected loader is used after the fresh count, and never when a contract exists", async () => {
    const loader = vi.fn(async () => ({ assumptions: GERMANY, currencyId: "cur-eur", subaccountId: "sub-1" }));
    const seed = await loadRevenueSeed(PROJECT, PROJECT.dates, loader);
    expect(m.countProjectRevenues).toHaveBeenCalledWith("p-1");
    expect(loader).toHaveBeenCalledWith("Germany");
    expect(m.listRevenueAssumptions).not.toHaveBeenCalled();
    expect(seed.draft?.derived.price).toBe(80);

    loader.mockClear();
    m.countProjectRevenues.mockResolvedValue(1);
    expect((await loadRevenueSeed(PROJECT, PROJECT.dates, loader)).draft).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it("UT-MSTONE-SEED-008 a Draft project with no contract is read ahead; the save's loader answers from the cache", async () => {
    const client = newClient();
    const { result } = renderHook(() => useRevenueSeedInputsLoader(PROJECT), { wrapper: wrapper(client) });
    await waitFor(() => expect(m.listRevenueAssumptions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(m.loadFirstRevenueSubaccount).toHaveBeenCalledTimes(1));
    const inputs = await result.current("Germany");
    expect(inputs.assumptions).toEqual(GERMANY);
    // No second Fabric read: the save used what the screen read when it opened.
    expect(m.listRevenueAssumptions).toHaveBeenCalledTimes(1);
  });

  it("UT-MSTONE-SEED-009 nothing is read ahead past Cluster 1, nor from Fabric when a contract exists", async () => {
    renderHook(() => useRevenueSeedInputsLoader({ ...PROJECT, clusterStateName: "Cluster 2" }), { wrapper: wrapper(newClient()) });
    await new Promise((r) => setTimeout(r, 20));
    expect(m.countProjectRevenues).not.toHaveBeenCalled();
    expect(m.listRevenueAssumptions).not.toHaveBeenCalled();

    m.countProjectRevenues.mockResolvedValue(1);
    renderHook(() => useRevenueSeedInputsLoader(PROJECT), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(m.countProjectRevenues).toHaveBeenCalledWith("p-1"));
    await new Promise((r) => setTimeout(r, 20));
    expect(m.listRevenueAssumptions).not.toHaveBeenCalled();
  });
});
