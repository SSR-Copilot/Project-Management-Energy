// @vitest-environment jsdom
/**
 * UT-GENPERF-051.. — the Generators prefetch (D141, `GENERATORS_PERF.prefetch`) and the lazy hooks: which reads the prefetch
 * starts, that they land under the keys the screen's own hooks read (so the screen finds them and asks no second time), that the
 * reads which need another read first are NOT started, and that the four lazy hooks stay silent until `enabled`.
 * `@/data/generators` is replaced by recording fakes; the query client and the hooks are real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { calls, rec } = vi.hoisted(() => {
  const calls = { list: [] as string[], fail: null as string | null };
  const rec = <T,>(name: string, value: T) => vi.fn(async (..._args: unknown[]): Promise<T> => {
    calls.list.push(name);
    if (calls.fail === name) throw new Error("boom");
    return value;
  });
  return { calls, rec };
});
vi.mock("@/data/generators", () => ({
  loadGeneratorsProject: rec("project", { id: "p", fid: "2028-06-01", countryId: "c-de" }),
  loadProjectPlanning: rec("planning", { isHeightLimitationForWtg: false, heightLimitation: null }),
  listGeneratorTypes: rec("types", [{ id: "t1", generatorId: "g1" }]),
  listPvModules: rec("pvCatalogue", []),
  listPvTypes: rec("pv", []),
  listInverterTypes: rec("inverter", []),
  listSubstructureTypes: rec("substructure", []),
  listSimpleTypes: vi.fn(async (family: string) => { calls.list.push(`simple:${family}`); return []; }),
  listProjectTurbines: rec("turbines", []),
  listGeneratorsByIds: rec("models", []),
  listOrderableGenerators: rec("catalog", []),
  loadDeviceCosts: rec("device", { modules: null, inverter: null, mountingFix: null, mountingTracker: null }),
  listAllWtgLandLeaseCosts: rec("allWtg", []),
  listPlantSupplierCatalogue: rec("plantCatalogue", []),
  loadOpexDependency: rec("opex", { hasActiveDeviceType: false, hasActiveOpexCost: false }),
  loadTypeName: rec("typeName", ""), listDeviceTypes: rec("deviceTypes", []), findPvUnit: rec("pvUnit", null),
  listOpexCostIdsForBridges: rec("opexIds", []), loadTurbineAllocations: rec("allocations", { allocations: [], countByCost: {} }),
}));
vi.mock("@/data/milestones", () => ({ loadPriceInflation: rec("priceInflation", { current: null, previous: null }) }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ session: undefined, envVars: {} }) }));
vi.mock("@/data/flows", () => ({ requestModulePermission: vi.fn(), cancelModulePermission: vi.fn() }));

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@/platform/requestLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/requestLog")>()),
  logAction: (message: string) => { logged.lines.push(message); },
}));

import { qk } from "@/data/keys";
import { PREFETCHED_READS, prefetchGenerators } from "./queries";
import {
  useAllWtgLandLeaseCosts, useDeviceCosts, useGeneratorCatalog, useGeneratorTypes, useGeneratorsProject,
  useInflationIndex, useInverterTypes, useProjectPlanning, usePvModuleCatalog, usePvModuleTypes, useSimpleTypes,
  useSubstructureTypes,
} from "./hooks";

const PID = "11111111-1111-1111-1111-111111111111";
/** The app's own defaults (`app/Providers.tsx`): a 30 s stale time, so a prefetched read is not asked for again on mount. */
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  calls.list.length = 0;
  calls.fail = null;
  logged.lines.length = 0;
});

describe("prefetchGenerators", () => {
  it("UT-GENPERF-051 starts the ten reads that need only the project id (or nothing), and nothing that needs another read first", async () => {
    await prefetchGenerators(client(), PID);
    expect([...calls.list].sort()).toEqual([
      "inverter", "planning", "project", "pv", "pvCatalogue", "simple:hydrogen", "simple:storage", "simple:substation",
      "substructure", "types",
    ]);
    expect(calls.list).toHaveLength(PREFETCHED_READS);
    for (const dependent of ["turbines", "models", "catalog", "device", "priceInflation", "allWtg"]) expect(calls.list).not.toContain(dependent);
  });

  it("UT-GENPERF-052 each result lands under the key the screen's hook reads: mounting the hooks asks for nothing again", async () => {
    const qc = client();
    await prefetchGenerators(qc, PID);
    calls.list.length = 0;
    const wrapper = wrap(qc);
    const { result } = renderHook(() => ({
      project: useGeneratorsProject(PID), planning: useProjectPlanning(PID), types: useGeneratorTypes(PID),
      catalogue: usePvModuleCatalog(), pv: usePvModuleTypes(PID, []), inverter: useInverterTypes(PID),
      substructure: useSubstructureTypes(PID), storage: useSimpleTypes("storage", PID), hydrogen: useSimpleTypes("hydrogen", PID),
      substation: useSimpleTypes("substation", PID),
    }), { wrapper });
    await waitFor(() => expect(result.current.types.hasData).toBe(true));
    for (const read of Object.values(result.current)) expect(read.hasData).toBe(true);
    expect(calls.list).toEqual([]);
    for (const key of [
      qk.generators(PID, "project"), qk.generators(PID, "planning"), qk.generators(PID, "types"), qk.pvModuleCatalog,
      qk.generators(PID, "pv"), qk.generators(PID, "inverter"), qk.generators(PID, "substructure"),
      qk.generators(PID, "storage"), qk.generators(PID, "hydrogen"), qk.generators(PID, "substation"),
    ]) expect(qc.getQueryData(key)).toBeDefined();
  });

  it("UT-GENPERF-053 it is traced with one ACTION line that carries a count and no id", async () => {
    await prefetchGenerators(client(), PID);
    expect(logged.lines).toEqual([`Generators prefetch: ${PREFETCHED_READS} independent reads started`]);
    expect(logged.lines.join(" ")).not.toContain(PID);
  });

  it("UT-GENPERF-054 a read that fails never rejects the prefetch and leaves no data, so the screen's own hook retries", async () => {
    calls.fail = "types";
    const qc = client();
    await expect(prefetchGenerators(qc, PID)).resolves.toBeUndefined();
    expect(qc.getQueryData(qk.generators(PID, "types"))).toBeUndefined();
    calls.fail = null;
    calls.list.length = 0;
    const { result } = renderHook(() => useGeneratorTypes(PID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(calls.list).toEqual(["types"]);
  });
});

describe("the lazy hooks", () => {
  it("UT-GENPERF-055 catalogue, price index, device costs and AllWTG costs do not read while disabled, and read once when enabled", async () => {
    const qc = client();
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => ({
      catalog: useGeneratorCatalog("2028-06-01", on), index: useInflationIndex("2028-06-01", on),
      device: useDeviceCosts("c-de", on), allWtg: useAllWtgLandLeaseCosts(PID, on),
    }), { wrapper: wrap(qc), initialProps: { on: false } });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.list).toEqual([]);
    for (const read of Object.values(result.current)) expect(read.hasData).toBe(false);
    rerender({ on: true });
    await waitFor(() => expect(result.current.device.hasData).toBe(true));
    await waitFor(() => expect(result.current.allWtg.hasData).toBe(true));
    expect([...calls.list].sort()).toEqual(["allWtg", "catalog", "device", "priceInflation"]);
  });

  it("UT-GENPERF-056 the default is enabled: a caller that passes nothing (the other screens, an old call) reads at once", async () => {
    const qc = client();
    const { result } = renderHook(() => ({ catalog: useGeneratorCatalog("2028-06-01"), device: useDeviceCosts("c-de") }), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.device.hasData).toBe(true));
    expect([...calls.list].sort()).toEqual(["catalog", "device"]);
  });
});
