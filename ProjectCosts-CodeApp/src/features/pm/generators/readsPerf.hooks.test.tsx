// @vitest-environment jsdom
/**
 * UT-GENPERF-270.. — the hooks behind `GENERATORS_PERF.readsByProject` and `GENERATORS_PERF.persistCatalogue` (D142), both
 * halves of each switch: the turbines read by the project (key, enabling, the prefetch) or by the type ids; the orderable
 * catalogue shown from the stored copy at once and replaced by the server's rows, or read as before. `@/data/generators` and
 * the stored cache are replaced by fakes; the query client and the hooks are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { calls, answers } = vi.hoisted(() => ({
  calls: { list: [] as string[] },
  answers: {
    catalogue: [] as unknown[], catalogueDelay: 0, catalogueFails: false, turbines: [] as unknown[], turbinesByProject: [] as unknown[],
  },
}));
vi.mock("@/data/generators", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/generators")>()),
  listOrderableGenerators: vi.fn(async () => {
    calls.list.push("catalog");
    await new Promise((r) => setTimeout(r, answers.catalogueDelay));
    if (answers.catalogueFails) throw new Error("server down");
    return answers.catalogue;
  }),
  listProjectTurbines: vi.fn(async (typeIds: string[]) => { calls.list.push(`turbines:${typeIds.length}`); return answers.turbines; }),
  listProjectTurbinesByProject: vi.fn(async () => { calls.list.push("turbinesByProject"); return answers.turbinesByProject; }),
  loadGeneratorsProject: vi.fn(async () => null), loadProjectPlanning: vi.fn(async () => null), listGeneratorTypes: vi.fn(async () => []),
  listPvModules: vi.fn(async () => []), listPvTypes: vi.fn(async () => []), listInverterTypes: vi.fn(async () => []),
  listSubstructureTypes: vi.fn(async () => []), listSimpleTypes: vi.fn(async () => []),
}));
vi.mock("@/data/milestones", () => ({ loadPriceInflation: vi.fn() }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ session: undefined, envVars: {} }) }));
vi.mock("@/data/flows", () => ({ requestModulePermission: vi.fn(), cancelModulePermission: vi.fn() }));

const stored = vi.hoisted(() => ({
  entry: null as null | { data: unknown[] }, reads: 0, writes: [] as unknown[][], throwOnRead: false,
}));
vi.mock("@/data/generatorCatalogueCache", () => ({
  generatorCatalogueCache: () => ({
    read: vi.fn(async () => {
      stored.reads += 1;
      if (stored.throwOnRead) throw new Error("must not escape");
      return stored.entry ? { data: stored.entry.data, savedAt: 1, ageMs: 1 } : null;
    }),
    write: vi.fn(async (...args: unknown[]) => { stored.writes.push(args); }),
    remove: vi.fn(async () => undefined),
  }),
}));

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@/platform/requestLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/requestLog")>()),
  logAction: (message: string) => { logged.lines.push(message); },
}));

import { qk } from "@/data/keys";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { useGeneratorCatalog, useProjectTurbines } from "./hooks";
import { PREFETCHED_READS, prefetchGenerators, turbinesByProjectQueryOptions } from "./queries";
import { familyKeys } from "./reload";

const PID = "11111111-1111-1111-1111-111111111111";
const FID = "2028-06-01";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const model = (id: string) => ({ id, name: id, displayName: id, prices: [1, null, null, null, null], countryAvailability: [] });
const turbine = (id: string) => ({ id, name: "WTG_1", typeId: "t1", index: 1 });

beforeEach(() => {
  calls.list.length = 0; logged.lines.length = 0;
  answers.catalogue = []; answers.catalogueDelay = 0; answers.catalogueFails = false; answers.turbines = []; answers.turbinesByProject = [];
  stored.entry = null; stored.reads = 0; stored.writes = []; stored.throwOnRead = false;
});
afterEach(() => setGeneratorsPerfFlags(null));

describe("readsByProject: the turbines hook", () => {
  it("UT-GENPERF-270 OFF: the turbines wait for the type ids and are read by them (key and request as before)", async () => {
    setGeneratorsPerfFlags({ readsByProject: false });
    answers.turbines = [turbine("a")];
    const qc = client();
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useProjectTurbines(PID, ids), { wrapper: wrap(qc), initialProps: { ids: [] as string[] } });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.list).toEqual([]);
    rerender({ ids: ["t2", "t1"] });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(calls.list).toEqual(["turbines:2"]);
    expect(qc.getQueryData(qk.generators(PID, "turbines", "t1", "t2"))).toEqual([turbine("a")]);
  });

  it("UT-GENPERF-271 ON: the turbines are read by the project at once, with no type ids, under a key of the turbines family", async () => {
    setGeneratorsPerfFlags({ readsByProject: true });
    answers.turbinesByProject = [turbine("b")];
    const qc = client();
    const { result } = renderHook(() => useProjectTurbines(PID, []), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(result.current.data).toEqual([turbine("b")]);
    expect(calls.list).toEqual(["turbinesByProject"]);
    const key = qk.generators(PID, "turbines", "byProject");
    expect(qc.getQueryData(key)).toEqual([turbine("b")]);
    // A reload of the `turbines` family (reload.ts) reaches it: the family key is a prefix of the new key.
    const [family] = familyKeys(PID, "turbines");
    expect(key.slice(0, family!.length)).toEqual([...family!]);
  });

  it("UT-GENPERF-272 ON: a changed type set does not change the key, so the turbines are not read again for it", async () => {
    setGeneratorsPerfFlags({ readsByProject: true });
    const qc = client();
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useProjectTurbines(PID, ids), { wrapper: wrap(qc), initialProps: { ids: ["t1"] } });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    rerender({ ids: ["t1", "t2"] });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.list).toEqual(["turbinesByProject"]);
  });

  it("UT-GENPERF-273 ON: no project, no read", async () => {
    setGeneratorsPerfFlags({ readsByProject: true });
    renderHook(() => useProjectTurbines(undefined, []), { wrapper: wrap(client()) });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.list).toEqual([]);
  });
});

describe("readsByProject: the prefetch", () => {
  it("UT-GENPERF-274 OFF: the prefetch does not start the turbines and says ten reads", async () => {
    setGeneratorsPerfFlags({ readsByProject: false });
    await prefetchGenerators(client(), PID);
    expect(calls.list).not.toContain("turbinesByProject");
    expect(logged.lines).toEqual([`Generators prefetch: ${PREFETCHED_READS} independent reads started`]);
  });

  it("UT-GENPERF-275 ON: the turbines are prefetched with the others, land where the hook reads, and the line counts one more", async () => {
    setGeneratorsPerfFlags({ readsByProject: true });
    answers.turbinesByProject = [turbine("c")];
    const qc = client();
    await prefetchGenerators(qc, PID);
    expect(calls.list).toContain("turbinesByProject");
    expect(qc.getQueryData(turbinesByProjectQueryOptions(PID).queryKey)).toEqual([turbine("c")]);
    expect(logged.lines).toEqual([`Generators prefetch: ${PREFETCHED_READS + 1} independent reads started`]);
    calls.list.length = 0;
    const { result } = renderHook(() => useProjectTurbines(PID, []), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(calls.list).toEqual([]);
  });
});

describe("persistCatalogue: the catalogue hook", () => {
  it("UT-GENPERF-280 OFF: the stored copy is never read or written; the hook is the plain read", async () => {
    setGeneratorsPerfFlags({ persistCatalogue: false });
    stored.entry = { data: [model("old")] };
    answers.catalogue = [model("fresh")];
    const { result } = renderHook(() => useGeneratorCatalog(FID), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(result.current.data).toEqual([model("fresh")]);
    expect(stored.reads).toBe(0);
    expect(stored.writes).toEqual([]);
  });

  it("UT-GENPERF-281 ON: the stored rows show at once, count as not yet known, and the server's rows replace them and are saved", async () => {
    setGeneratorsPerfFlags({ persistCatalogue: true });
    stored.entry = { data: [model("old")] };
    answers.catalogue = [model("fresh")];
    answers.catalogueDelay = 120;
    const qc = client();
    const { result } = renderHook(() => useGeneratorCatalog(FID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toEqual([model("old")]));
    // Shown, but the writes must wait: not known, still being re-read.
    expect(result.current.hasData).toBe(false);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual([model("fresh")]));
    expect(result.current.hasData).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(calls.list).toEqual(["catalog"]);
    expect(stored.writes).toEqual([[FID, [model("fresh")]]]);
  });

  it("UT-GENPERF-282 ON: the server answering before the stored copy wins; the copy never overwrites it", async () => {
    setGeneratorsPerfFlags({ persistCatalogue: true });
    answers.catalogue = [model("fresh")];
    const qc = client();
    qc.setQueryData(qk.generatorCatalog(FID), [model("already")]);
    stored.entry = { data: [model("old")] };
    const { result } = renderHook(() => useGeneratorCatalog(FID), { wrapper: wrap(qc) });
    await waitFor(() => expect(stored.reads).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.data).not.toEqual([model("old")]);
  });

  it("UT-GENPERF-283 ON: nothing stored (or storage failing) is the plain read, and a throwing read never reaches the screen", async () => {
    setGeneratorsPerfFlags({ persistCatalogue: true });
    answers.catalogue = [model("fresh")];
    const first = renderHook(() => useGeneratorCatalog(FID), { wrapper: wrap(client()) });
    await waitFor(() => expect(first.result.current.data).toEqual([model("fresh")]));
    expect(first.result.current.hasData).toBe(true);

    stored.throwOnRead = true;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const second = renderHook(() => useGeneratorCatalog(FID), { wrapper: wrap(client()) });
    await waitFor(() => expect(second.result.current.data).toEqual([model("fresh")]));
    process.off("unhandledRejection", unhandled);
    expect(second.result.current.hasData).toBe(true);
  });

  it("UT-GENPERF-284 ON: a failed re-read after a stored copy was shown is a load error with the writes held back, not a quiet stale catalogue", async () => {
    setGeneratorsPerfFlags({ persistCatalogue: true });
    stored.entry = { data: [model("old")] };
    answers.catalogueFails = true;
    answers.catalogueDelay = 60;
    const { result } = renderHook(() => useGeneratorCatalog(FID), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.hasData).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(stored.writes).toEqual([]);
  });

  it("UT-GENPERF-285 ON: disabled (no panel open) reads neither the server nor the stored copy; enabling does both", async () => {
    setGeneratorsPerfFlags({ persistCatalogue: true });
    stored.entry = { data: [model("old")] };
    answers.catalogue = [model("fresh")];
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useGeneratorCatalog(FID, on), { wrapper: wrap(client()), initialProps: { on: false } });
    await new Promise((r) => setTimeout(r, 30));
    expect(stored.reads).toBe(0);
    expect(calls.list).toEqual([]);
    rerender({ on: true });
    await waitFor(() => expect(result.current.data).toEqual([model("fresh")]));
    expect(stored.reads).toBe(1);
  });

  it("UT-GENPERF-286 the switch ships OFF", async () => {
    const { GENERATORS_PERF } = await import("@/data/generatorsPerfFlags");
    expect(GENERATORS_PERF.persistCatalogue).toBe(false);
  });
});
