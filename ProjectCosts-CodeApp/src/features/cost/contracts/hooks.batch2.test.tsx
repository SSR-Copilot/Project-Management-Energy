// @vitest-environment jsdom
/**
 * dvopt batch 2 — the Contracts screen's hooks.
 *
 *  - UT-CONTRHOOK-001..006 (CB-11, `CONTRACT_LINKS_WITH_PATCH`): an edit reads the contract's links beside the contract save.
 *  - UT-CONTRHOOK-010..015 (CB-12, `CONTRACT_KEYS_ONCE`): a create or delete reads payment targets and links once.
 *  - UT-CONTRHOOK-020..025 (CB-13, `BOP_ASSUMPTIONS_ONE_READ`): the two BoP standard assumptions are one request.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataError, RecordGoneError } from "@/platform/errors";
import type { ContractWrite } from "@/data/contracts";
import { CONTRACT_TYPE, type BopContract } from "./rules";

const repo = {
  listContracts: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  listPaymentTargets: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  listDevCoLinks: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  saveContract: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ id: "c-1" })),
  replaceDevCoLinks: vi.fn(async (..._a: unknown[]): Promise<void> => undefined),
  deleteContract: vi.fn(async (..._a: unknown[]): Promise<void> => undefined),
  findBopStandardAssumption: vi.fn(async (..._a: unknown[]): Promise<unknown> => undefined),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
const pair = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/data/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/contracts")>()),
  findBopStandardAssumptions: (...a: unknown[]) => pair.read(...a),
}));
const flags = vi.hoisted(() => ({ links: true, keys: true, bop: true }));
vi.mock("@/data/leaseOpexFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/leaseOpexFlags")>()),
  get CONTRACT_LINKS_WITH_PATCH() { return flags.links; },
  get CONTRACT_KEYS_ONCE() { return flags.keys; },
  get BOP_ASSUMPTIONS_ONE_READ() { return flags.bop; },
}));

const { useSaveContract, useDeleteContract, useContracts, usePaymentTargets, useDevCoLinks, useBopStandardAssumption } = await import("./hooks");

const PROJECT = "11111111-1111-1111-1111-111111111111";
const write = (over: Partial<ContractWrite> = {}) =>
  ({ projectId: PROJECT, contractType: CONTRACT_TYPE.Development, ...over }) as ContractWrite;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  /** The invalidations as `[first key part, refetchType]`. */
  const calls = () => invalidate.mock.calls.map(([f]) => [(f as { queryKey: unknown[] }).queryKey[0], (f as { refetchType?: string }).refetchType ?? "active"]);
  return { client, wrapper, calls };
}

beforeEach(() => {
  flags.links = true; flags.keys = true; flags.bop = true;
  Object.values(repo).forEach((fn) => fn.mockReset());
  pair.read.mockReset();
  repo.listContracts.mockResolvedValue([]);
  repo.listPaymentTargets.mockResolvedValue([]);
  repo.listDevCoLinks.mockResolvedValue([]);
  repo.saveContract.mockResolvedValue({ id: "c-1" });
  repo.replaceDevCoLinks.mockResolvedValue(undefined);
  repo.deleteContract.mockResolvedValue(undefined);
});

describe("CB-11 an edit reads the stored links beside the contract save", () => {
  it("UT-CONTRHOOK-001 the links read STARTS before the contract save answers, and its promise is what replaceDevCoLinks gets", async () => {
    let release!: () => void;
    repo.saveContract.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ id: "c-1" }); }));
    const links = [{ id: "l-1", accountId: "a-1", contractId: "c-1" }];
    repo.listDevCoLinks.mockResolvedValue(links);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    let done!: Promise<unknown>;
    act(() => { done = result.current.mutateAsync({ write: write({ id: "c-1" }), accounts: [] }); });
    await waitFor(() => expect(repo.saveContract).toHaveBeenCalledTimes(1));
    expect(repo.listDevCoLinks).toHaveBeenCalledTimes(1); // started while the save is still pending
    expect(repo.listDevCoLinks).toHaveBeenCalledWith(PROJECT, ["c-1"]);
    expect(repo.replaceDevCoLinks).not.toHaveBeenCalled();
    await act(async () => { release(); await done; });
    const args = repo.replaceDevCoLinks.mock.calls[0]![1] as { existingLinks?: Promise<unknown>; isNewContract: boolean };
    expect(args.isNewContract).toBe(false);
    await expect(args.existingLinks).resolves.toEqual(links);
  });

  it("UT-CONTRHOOK-002 a CREATE reads no links and passes none (nothing is stored yet)", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync({ write: write(), accounts: [] }); });
    expect(repo.listDevCoLinks).not.toHaveBeenCalled();
    const args = repo.replaceDevCoLinks.mock.calls[0]![1] as Record<string, unknown>;
    expect(args).not.toHaveProperty("existingLinks");
    expect(args["isNewContract"]).toBe(true);
  });

  it("UT-CONTRHOOK-003 a Project Rights edit writes no links, so it reads none", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync({ write: write({ id: "c-1", contractType: CONTRACT_TYPE.ProjectRights }), accounts: [] }); });
    expect(repo.listDevCoLinks).not.toHaveBeenCalled();
    expect(repo.replaceDevCoLinks).not.toHaveBeenCalled();
  });

  it("UT-CONTRHOOK-004 the switch off: the links are read inside replaceDevCoLinks, after the save (no early read, no argument)", async () => {
    flags.links = false;
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync({ write: write({ id: "c-1" }), accounts: [] }); });
    expect(repo.listDevCoLinks).not.toHaveBeenCalled();
    expect(repo.replaceDevCoLinks.mock.calls[0]![1]).not.toHaveProperty("existingLinks");
  });

  it("UT-CONTRHOOK-005 a refused save (the contract was deleted) ends with that error; the early links read, even a failing one, is not reported", async () => {
    repo.saveContract.mockRejectedValue(new RecordGoneError("update BoP contract", "vsb_bopprojectscontractses", "c-1"));
    repo.listDevCoLinks.mockRejectedValue(new DataError("list DevCo cost links", "boom", 500));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    let caught: unknown;
    await act(async () => { await result.current.mutateAsync({ write: write({ id: "c-1" }), accounts: [] }).catch((e) => { caught = e; }); });
    expect(caught).toBeInstanceOf(RecordGoneError);
    expect(repo.replaceDevCoLinks).not.toHaveBeenCalled();
  });

  it("UT-CONTRHOOK-006 a failing early links read after a good save surfaces where the links are replaced (the same ContractLinksError wrap)", async () => {
    const failure = new DataError("list DevCo cost links", "boom", 500);
    repo.listDevCoLinks.mockRejectedValue(failure);
    // The real `replaceDevCoLinks` awaits `existingLinks`; this double does the same.
    repo.replaceDevCoLinks.mockImplementation(async (_p: unknown, a: unknown) => { await (a as { existingLinks: Promise<unknown> }).existingLinks; });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    let caught: unknown;
    await act(async () => { await result.current.mutateAsync({ write: write({ id: "c-1" }), accounts: [] }).catch((e) => { caught = e; }); });
    expect((caught as Error).name).toBe("ContractLinksError");
    expect((caught as { contractId: string }).contractId).toBe("c-1");
  });
});

describe("CB-12 a create or delete reads the payment targets and links once", () => {
  it("UT-CONTRHOOK-010 a DELETE refetches the contracts and only MARKS the payment targets and links stale", async () => {
    const { wrapper, calls } = setup();
    const { result } = renderHook(() => useDeleteContract(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync("c-1"); });
    expect(calls()).toEqual([["contracts", "active"], ["paymentTargets", "none"], ["devCoLinks", "none"]]);
  });

  it("UT-CONTRHOOK-011 a CREATE refetches the contracts and only marks the links stale; an EDIT refetches both (its ids do not change)", async () => {
    const { wrapper, calls } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync({ write: write(), accounts: [] }); });
    expect(calls()).toEqual([["contracts", "active"], ["devCoLinks", "none"]]);
    await act(async () => { await result.current.mutateAsync({ write: write({ id: "c-1" }), accounts: [] }); });
    expect(calls().slice(2)).toEqual([["contracts", "active"], ["devCoLinks", "active"]]);
  });

  it("UT-CONTRHOOK-012 the switch off: every cache is refetched, as before", async () => {
    flags.keys = false;
    const { wrapper, calls } = setup();
    const del = renderHook(() => useDeleteContract(PROJECT), { wrapper });
    await act(async () => { await del.result.current.mutateAsync("c-1"); });
    expect(calls()).toEqual([["contracts", "active"], ["paymentTargets", "active"], ["devCoLinks", "active"]]);
  });

  /** The three project reads mounted together, as the screen does, then one delete that leaves one contract. */
  async function deleteScenario() {
    const two = [{ id: "c-1" }, { id: "c-2" }] as unknown as BopContract[];
    const one = [{ id: "c-2" }] as unknown as BopContract[];
    repo.listContracts.mockResolvedValueOnce(two).mockResolvedValue(one);
    const { wrapper } = setup();
    const { result } = renderHook(() => {
      const contracts = useContracts(PROJECT);
      const list = (contracts.data ?? []) as BopContract[];
      return { contracts, targets: usePaymentTargets(PROJECT, list), links: useDevCoLinks(PROJECT, list), del: useDeleteContract(PROJECT) };
    }, { wrapper });
    await waitFor(() => expect(result.current.links.isSuccess && result.current.targets.isSuccess).toBe(true));
    expect(repo.listPaymentTargets).toHaveBeenCalledTimes(1);
    expect(repo.listDevCoLinks).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.del.mutateAsync("c-1"); });
    await waitFor(() => expect(repo.listPaymentTargets).toHaveBeenLastCalledWith(PROJECT, ["c-2"]));
    await waitFor(() => expect(result.current.links.isSuccess && result.current.targets.isSuccess).toBe(true));
    return result;
  }

  it("UT-CONTRHOOK-013 after a delete the targets and links are read ONCE more, for the remaining contracts (on)", async () => {
    await deleteScenario();
    expect(repo.listPaymentTargets).toHaveBeenCalledTimes(2);
    expect(repo.listDevCoLinks).toHaveBeenCalledTimes(2);
    expect(repo.listPaymentTargets.mock.calls.map((c) => c[1])).toEqual([["c-1", "c-2"], ["c-2"]]);
  });

  it("UT-CONTRHOOK-014 off: the old id-set key is refetched first, so the targets and links are read twice after the delete", async () => {
    flags.keys = false;
    await deleteScenario();
    expect(repo.listPaymentTargets.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(repo.listDevCoLinks.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("UT-CONTRHOOK-015 a delete that FAILS leaves the shown targets and links in place (nothing refetched, nothing lost)", async () => {
    repo.deleteContract.mockRejectedValue(new DataError("delete BoP contract", "refused", 403));
    repo.listContracts.mockResolvedValue([{ id: "c-1" }] as unknown[]);
    const { wrapper } = setup();
    const { result } = renderHook(() => {
      const contracts = useContracts(PROJECT);
      const list = (contracts.data ?? []) as BopContract[];
      return { targets: usePaymentTargets(PROJECT, list), del: useDeleteContract(PROJECT) };
    }, { wrapper });
    await waitFor(() => expect(result.current.targets.isSuccess).toBe(true));
    await act(async () => { await result.current.del.mutateAsync("c-1").catch(() => undefined); });
    expect(result.current.targets.isSuccess).toBe(true);
    expect(repo.listPaymentTargets).toHaveBeenCalledTimes(1);
  });
});

describe("CB-13 the two BoP standard assumptions are one request", () => {
  const dev: { vsb_bopcontractsstandardassumptionsid: string; vsb_contracttypes: number } = { vsb_bopcontractsstandardassumptionsid: "dev-1", vsb_contracttypes: CONTRACT_TYPE.Development };
  const con: { vsb_bopcontractsstandardassumptionsid: string; vsb_contracttypes: number } = { vsb_bopcontractsstandardassumptionsid: "con-1", vsb_contracttypes: CONTRACT_TYPE.Construction };
  const mapOf = (...entries: [number, unknown][]) => new Map<number, unknown>(entries);
  const both = () => renderHook(() => ({
    development: useBopStandardAssumption({ countryId: "country-1", technology: 1, contractType: CONTRACT_TYPE.Development }),
    construction: useBopStandardAssumption({ countryId: "country-1", technology: 1, contractType: CONTRACT_TYPE.Construction }),
  }), { wrapper: setup().wrapper });

  it("UT-CONTRHOOK-020 both hooks of the screen share ONE read and each gets its own row", async () => {
    pair.read.mockResolvedValue(mapOf([CONTRACT_TYPE.Development, dev], [CONTRACT_TYPE.Construction, con]));
    const { result } = both();
    await waitFor(() => expect(result.current.development.isSuccess && result.current.construction.isSuccess).toBe(true));
    expect(pair.read).toHaveBeenCalledTimes(1);
    expect(pair.read).toHaveBeenCalledWith({ countryId: "country-1", technology: 1 });
    expect(result.current.development.data).toBe(dev);
    expect(result.current.construction.data).toBe(con);
    expect(repo.findBopStandardAssumption).not.toHaveBeenCalled();
  });

  it("UT-CONTRHOOK-021 a type with no row answers undefined (the Reset-to-standard button stays disabled), the other still has its row", async () => {
    pair.read.mockResolvedValue(mapOf([CONTRACT_TYPE.Development, dev]));
    const { result } = both();
    await waitFor(() => expect(result.current.development.isSuccess && result.current.construction.isSuccess).toBe(true));
    expect(result.current.development.data).toBe(dev);
    expect(result.current.construction.data).toBeUndefined();
  });

  it("UT-CONTRHOOK-022 the switch off: one read per type through the repository, as before", async () => {
    flags.bop = false;
    repo.findBopStandardAssumption.mockImplementation(async (q: unknown) => ((q as { contractType: number }).contractType === CONTRACT_TYPE.Development ? dev : con));
    const { result } = both();
    await waitFor(() => expect(result.current.development.isSuccess && result.current.construction.isSuccess).toBe(true));
    expect(repo.findBopStandardAssumption).toHaveBeenCalledTimes(2);
    expect(pair.read).not.toHaveBeenCalled();
    expect(result.current.development.data).toBe(dev);
    expect(result.current.construction.data).toBe(con);
  });

  it("UT-CONTRHOOK-023 no country or technology yet: nothing is read (the hooks stay disabled)", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useBopStandardAssumption({ countryId: undefined, technology: undefined, contractType: CONTRACT_TYPE.Development }), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(pair.read).not.toHaveBeenCalled();
  });

  it("UT-CONTRHOOK-024 the Admin Contract invalidation by the (country, technology) prefix still refreshes the shared read, once", async () => {
    pair.read.mockResolvedValue(mapOf([CONTRACT_TYPE.Development, dev], [CONTRACT_TYPE.Construction, con]));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => ({
      development: useBopStandardAssumption({ countryId: "country-1", technology: 1, contractType: CONTRACT_TYPE.Development }),
      construction: useBopStandardAssumption({ countryId: "country-1", technology: 1, contractType: CONTRACT_TYPE.Construction }),
    }), { wrapper });
    await waitFor(() => expect(result.current.construction.isSuccess).toBe(true));
    pair.read.mockClear();
    await act(async () => { await client.invalidateQueries({ queryKey: ["bopStandardAssumptions", "country-1", 1] }); });
    expect(pair.read).toHaveBeenCalledTimes(1);
  });
});
