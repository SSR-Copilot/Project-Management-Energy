// @vitest-environment jsdom
/**
 * The Revenue hooks' read trims (D136): the project load takes the project states from the cache General Data
 * shares, and the currency read waits for the project and asks for one ISO code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { qk } from "@/data/keys";

const m = vi.hoisted(() => ({
  loadRevenueProject: vi.fn(),
  findCurrency: vi.fn(),
  listProjectStates: vi.fn(),
}));

vi.mock("@/data/revenues", () => ({
  loadRevenueProject: m.loadRevenueProject,
  hasNegativePriceProduction: vi.fn(), listBalancingPrices: vi.fn(), listIndividualVolumeIds: vi.fn(),
  listIndividualVolumes: vi.fn(), listOverlappingContracts: vi.fn(), listRevenueAssumptionRows: vi.fn(),
  listRevenueContracts: vi.fn(), listRevenueCountryInflation: vi.fn(),
}));
// BND-03/04/06 (T-E01/T-E02): the currency lookup, the first revenue sub-account and the shared project states each moved to their own module.
vi.mock("@/data/revenueLookups", () => ({ findCurrency: m.findCurrency, loadFirstRevenueSubaccount: vi.fn() }));
vi.mock("@/data/projectStatesRead", () => ({ listProjectStates: m.listProjectStates }));

import { useRevenueCurrency, useRevenueProject } from "./hooks";

const STATES = [{ id: "cs-3", order: 3 }, { id: "cs-4", order: 4 }];

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  m.loadRevenueProject.mockReset(); m.findCurrency.mockReset(); m.listProjectStates.mockReset();
  m.listProjectStates.mockResolvedValue(STATES);
  // The real loader reads the states through the function it is given; this stand-in does the same.
  m.loadRevenueProject.mockImplementation(async (_id: string, readStates: () => Promise<unknown>) => {
    await readStates();
    return { id: "p1" };
  });
});

describe("UT-REVPERF useRevenueProject", () => {
  it("UT-REVPERF-060 a project reload does not read the project states again: they come from the shared cache", async () => {
    const qc = newClient();
    const { result } = renderHook(() => useRevenueProject("p1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toEqual({ id: "p1" }));
    expect(m.listProjectStates).toHaveBeenCalledTimes(1);
    await qc.invalidateQueries({ queryKey: qk.revenuesAll("p1") });
    await qc.invalidateQueries({ queryKey: qk.revenuesAll("p1") });
    expect(m.loadRevenueProject).toHaveBeenCalledTimes(3); // the project row IS re-read each time ...
    expect(m.listProjectStates).toHaveBeenCalledTimes(1); // ... the whole states table is not
  });

  it("UT-REVPERF-061 the states sit under General Data's own key, so both screens share one read", async () => {
    const qc = newClient();
    const { result } = renderHook(() => useRevenueProject("p1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(qc.getQueryData(qk.generalDataProjectStates)).toEqual(STATES);
    // General Data opened first: Revenue reads nothing.
    const warm = newClient();
    warm.setQueryData(qk.generalDataProjectStates, STATES);
    m.listProjectStates.mockClear();
    const second = renderHook(() => useRevenueProject("p1"), { wrapper: wrap(warm) });
    await waitFor(() => expect(second.result.current.data).not.toBeNull());
    expect(m.listProjectStates).not.toHaveBeenCalled();
  });

  it("UT-REVPERF-062 the states are outside the keys a write reloads, so a Save never refetches them", async () => {
    const qc = newClient();
    const { result } = renderHook(() => useRevenueProject("p1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await qc.invalidateQueries({ queryKey: qk.revenues("p1", "contracts") });
    expect(m.listProjectStates).toHaveBeenCalledTimes(1);
    expect(m.loadRevenueProject).toHaveBeenCalledTimes(1);
  });

  it("UT-REVPERF-063 a failed states read fails the project load, as before (the error reaches the screen's load-error state)", async () => {
    m.listProjectStates.mockRejectedValue(new Error("states 500"));
    const { result } = renderHook(() => useRevenueProject("p1"), { wrapper: wrap(newClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
  });

  it("UT-REVPERF-064 no project id: nothing is read", () => {
    renderHook(() => useRevenueProject(undefined), { wrapper: wrap(newClient()) });
    expect(m.loadRevenueProject).not.toHaveBeenCalled();
    expect(m.listProjectStates).not.toHaveBeenCalled();
  });
});

describe("UT-REVPERF useRevenueCurrency", () => {
  it("UT-REVPERF-070 it waits for the project: nothing is read while disabled, and then one filtered read for the right code", async () => {
    m.findCurrency.mockResolvedValue({ id: "cur-pln", name: "Zloty" });
    const qc = newClient();
    const { result, rerender } = renderHook(
      ({ country, enabled }: { country: string | null; enabled: boolean }) => useRevenueCurrency(country, enabled),
      { wrapper: wrap(qc), initialProps: { country: null as string | null, enabled: false } },
    );
    expect(m.findCurrency).not.toHaveBeenCalled(); // before: the "EUR" default was read here, for nothing
    rerender({ country: "Poland", enabled: true });
    await waitFor(() => expect(result.current.data).toEqual({ id: "cur-pln", name: "Zloty" }));
    expect(m.findCurrency).toHaveBeenCalledTimes(1);
    expect(m.findCurrency).toHaveBeenCalledWith("PLN", { onlyThisCode: true });
  });

  it("UT-REVPERF-071 a project with no country still reads the default code once (enabled follows the project, not the country)", async () => {
    m.findCurrency.mockResolvedValue({ id: "cur-eur", name: "Euro" });
    const { result } = renderHook(() => useRevenueCurrency(null, true), { wrapper: wrap(newClient()) });
    await waitFor(() => expect(result.current.data).toEqual({ id: "cur-eur", name: "Euro" }));
    expect(m.findCurrency).toHaveBeenCalledWith("EUR", { onlyThisCode: true });
  });

  it("UT-REVPERF-072 the default is enabled, so a caller that passes no flag behaves as before", async () => {
    m.findCurrency.mockResolvedValue(null);
    renderHook(() => useRevenueCurrency("Germany"), { wrapper: wrap(newClient()) });
    await waitFor(() => expect(m.findCurrency).toHaveBeenCalledTimes(1));
    expect(m.findCurrency).toHaveBeenCalledWith("EUR", { onlyThisCode: true });
  });
});
