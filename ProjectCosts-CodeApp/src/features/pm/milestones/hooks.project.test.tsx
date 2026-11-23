// @vitest-environment jsdom
/**
 * UT-MSTONE-OPT-1xx — `useMilestoneProject` takes the country's business unit from the cached countries list (OPT-07a).
 * BEFORE: every load and every save reload = 2 requests in sequence (project, then the country row).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { qk } from "@/data/keys";

const s = vi.hoisted(() => ({
  log: [] as string[],
  countries: vi.fn(async () => [] as unknown[]),
  options: [] as unknown[],
}));

vi.mock("@/data/generalData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/generalData")>()),
  listGeneralDataCountries: () => { s.log.push("list countries"); return s.countries(); },
}));
vi.mock("@/data/milestones", () => ({
  loadMilestoneProject: vi.fn(async (_id: string, options?: { businessUnitOf?: (c: string) => Promise<string | null | undefined> }) => {
    s.log.push("project");
    const bu = options?.businessUnitOf ? await options.businessUnitOf("c-de") : undefined;
    s.log.push(`bu=${String(bu)}`);
    return { id: "p-1", countryBusinessUnitId: bu ?? null };
  }),
}));

import { useMilestoneProject } from "./hooks";

const PID = "11111111-1111-1111-1111-111111111111";
const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

afterEach(() => { cleanup(); s.log.length = 0; s.countries.mockReset(); });

describe("useMilestoneProject (OPT-07a)", () => {
  it("UT-MSTONE-OPT-101 cold: the countries list starts together with the project read and answers the business unit", async () => {
    s.countries.mockResolvedValue([{ id: "c-de", name: "Germany", key: null, besitzerBusinessUnitId: null, businessUnitId: "bu-de" }]);
    const { result } = renderHook(() => useMilestoneProject(PID), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.data?.id).toBe("p-1"));
    expect(s.log.slice(0, 2).sort()).toEqual(["list countries", "project"]);
    expect(result.current.data?.countryBusinessUnitId).toBe("bu-de");
  });

  it("UT-MSTONE-OPT-102 warm: the cached list is reused, a reload reads no countries", async () => {
    const qc = client();
    qc.setQueryData(qk.generalDataCountries, [{ id: "c-de", name: "Germany", key: null, besitzerBusinessUnitId: null, businessUnitId: "bu-de" }]);
    const { result } = renderHook(() => useMilestoneProject(PID), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.id).toBe("p-1"));
    expect(s.log).not.toContain("list countries");
    expect(result.current.data?.countryBusinessUnitId).toBe("bu-de");
  });

  it("UT-MSTONE-OPT-103 a failed list does not fail the screen: the loader is told 'unknown' and reads the country itself", async () => {
    s.countries.mockRejectedValue(new Error("countries down"));
    const { result } = renderHook(() => useMilestoneProject(PID), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.data?.id).toBe("p-1"));
    expect(s.log).toContain("bu=undefined");
    expect(result.current.error).toBeUndefined();
  });

  it("UT-MSTONE-OPT-104 a country the list lacks is 'unknown' (undefined), a country with no business unit is null", async () => {
    s.countries.mockResolvedValue([{ id: "c-de", name: "Germany", key: null, besitzerBusinessUnitId: null, businessUnitId: null }]);
    const { result } = renderHook(() => useMilestoneProject(PID), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.data?.id).toBe("p-1"));
    expect(s.log).toContain("bu=null");
  });

  const country = (businessUnitId: string) => [{ id: "c-de", name: "Germany", key: null, besitzerBusinessUnitId: null, businessUnitId }];
  const MIN = 60_000;

  it("UT-MSTONE-OPT-901 a cached list 29 minutes old is still fresh: no countries read, the cached business unit is used", async () => {
    s.countries.mockResolvedValue(country("new"));
    const qc = client();
    qc.setQueryData(qk.generalDataCountries, country("old"), { updatedAt: Date.now() - 29 * MIN });
    const { result } = renderHook(() => useMilestoneProject(PID), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.id).toBe("p-1"));
    expect(s.log).not.toContain("list countries");
    expect(result.current.data?.countryBusinessUnitId).toBe("old");
  });

  it("UT-MSTONE-OPT-902 a cached list 31 minutes old is STALE: one fresh countries read, and the loader gets the fresh business unit", async () => {
    s.countries.mockResolvedValue(country("new"));
    const qc = client();
    qc.setQueryData(qk.generalDataCountries, country("old"), { updatedAt: Date.now() - 31 * MIN });
    const { result } = renderHook(() => useMilestoneProject(PID), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.id).toBe("p-1"));
    expect(s.log.filter((x) => x === "list countries")).toHaveLength(1);
    expect(s.log).toContain("bu=new");
    expect(result.current.data?.countryBusinessUnitId).toBe("new");
  });
});
