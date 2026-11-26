// @vitest-environment jsdom
/**
 * UT-REFRESHFAIL-001..008 — the Land Lease and OPEX write hooks refresh the cost book on EVERY outcome (dvopt T-02, CB-02).
 *
 * Five writers: Land Lease save, delete and standard import (all `useLeaseWrites`), OPEX save (`useCostBook().save`) and OPEX standard
 * import (`useAddStandardContract`). A write that fails part-way has still written the steps before the failed one, so the cached book
 * must be re-read; a stale book is what let a second "Add Standard Contract" click create a second standard header.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CostPeriod } from "./model";

const emptyBook = { accounts: [], lines: [], periods: [] as CostPeriod[], extraGroups: { om: [], land: [], other: [] } };
const repo = {
  getCostBook: vi.fn(async (..._args: unknown[]) => emptyBook),
  applyLeaseWrites: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ createdIds: {} })),
  savePeriod: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
  deletePeriod: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
  addStandardContract: vi.fn(async (..._args: unknown[]): Promise<unknown> => []),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));

const flags = vi.hoisted(() => ({ refresh: true }));
vi.mock("@/data/leaseOpexFlags", () => ({
  get COST_REFRESH_ON_FAILURE() { return flags.refresh; },
}));

const { useLeaseWrites, useCostBook, useAddStandardContract, leaseBookKey } = await import("./useCostBook");
const { LeaseStepsError } = await import("@/features/cost/periods/landLeaseRules");

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const keys = () => invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown[] }).queryKey));
  return { client, wrapper, keys };
}

const LEASE = JSON.stringify(leaseBookKey("p-1"));
const BOOK = JSON.stringify(["cost-book", "p-1", "none"]);
const DEVICES = JSON.stringify(["opex-device-types", "p-1"]);
const PERIOD = { id: "x1", mode: "om", description: "d" } as unknown as CostPeriod;

beforeEach(() => {
  flags.refresh = true;
  Object.values(repo).forEach((fn) => fn.mockClear());
  repo.applyLeaseWrites.mockImplementation(async () => ({ createdIds: {} }));
  repo.savePeriod.mockImplementation(async () => ({}));
  repo.addStandardContract.mockImplementation(async () => []);
});

describe("Land Lease writes (save, delete, import)", () => {
  it("UT-REFRESHFAIL-001 a plain failure (a delete or an import is not run with independentSteps) refreshes the Land Lease and cost books", async () => {
    repo.applyLeaseWrites.mockRejectedValue(new Error("period create failed"));
    const { wrapper, keys } = setup();
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]).catch(() => undefined); });
    expect(keys()).toEqual([LEASE, BOOK]);
  });

  it("UT-REFRESHFAIL-002 a panel Save that fails by steps (LeaseStepsError) still refreshes, as before", async () => {
    repo.applyLeaseWrites.mockRejectedValue(new LeaseStepsError([{ step: "period", message: "x", httpResponse: "" }]));
    const { wrapper, keys } = setup();
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ writes: [], independentSteps: true }).catch(() => undefined); });
    expect(keys()).toEqual([LEASE, BOOK]);
  });

  it("UT-REFRESHFAIL-003 a success refreshes the same two keys (unchanged)", async () => {
    const { wrapper, keys } = setup();
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]); });
    expect(keys()).toEqual([LEASE, BOOK]);
  });

  it("UT-REFRESHFAIL-004 COST_REFRESH_ON_FAILURE off: a plain failure refreshes nothing, a LeaseStepsError still does (the old behaviour)", async () => {
    flags.refresh = false;
    repo.applyLeaseWrites.mockRejectedValueOnce(new Error("period create failed"));
    const { wrapper, keys } = setup();
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]).catch(() => undefined); });
    expect(keys()).toEqual([]);
    repo.applyLeaseWrites.mockRejectedValueOnce(new LeaseStepsError([{ step: "period", message: "x", httpResponse: "" }]));
    await act(async () => { await hook.result.current.mutateAsync([]).catch(() => undefined); });
    expect(keys()).toEqual([LEASE, BOOK]);
  });
});

describe("OPEX save", () => {
  it("UT-REFRESHFAIL-005 a save that fails part-way re-reads the book it was run from (and patches nothing into the cache)", async () => {
    const { client, wrapper, keys } = setup();
    const hook = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const loaded = client.getQueryData(["cost-book", "p-1", "none", "opex"]);
    repo.savePeriod.mockRejectedValue(new Error("the siblings read failed"));
    await act(async () => {
      await hook.result.current.save.mutateAsync({ ...emptyBook, periods: [PERIOD] }).catch(() => undefined);
    });
    expect(keys()).toEqual([JSON.stringify(["cost-book", "p-1", "none", "opex"])]);
    await waitFor(() => expect(repo.getCostBook).toHaveBeenCalledTimes(2));
    expect(client.getQueryData(["cost-book", "p-1", "none", "opex"])).toEqual(loaded);
  });

  it("UT-REFRESHFAIL-006 off: a failed save refreshes nothing (the old behaviour)", async () => {
    flags.refresh = false;
    const { wrapper, keys } = setup();
    const hook = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    repo.savePeriod.mockRejectedValue(new Error("x"));
    await act(async () => {
      await hook.result.current.save.mutateAsync({ ...emptyBook, periods: [PERIOD] }).catch(() => undefined);
    });
    expect(keys()).toEqual([]);
  });
});

describe("OPEX standard import", () => {
  const ARGS = { mode: "om", group: "WTG", codDate: "2027-01-01" } as unknown as Parameters<ReturnType<typeof useAddStandardContract>["mutateAsync"]>[0];

  it("UT-REFRESHFAIL-007 a chain that fails part-way refreshes the cost book and, for O&M, the device cards", async () => {
    repo.addStandardContract.mockRejectedValue(new Error("create a standard OPEX period failed"));
    const { wrapper, keys } = setup();
    const hook = renderHook(() => useAddStandardContract(), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync(ARGS).catch(() => undefined); });
    expect(keys()).toEqual([BOOK, DEVICES]);
  });

  it("UT-REFRESHFAIL-008 an Other OPEX import failure refreshes the book only; off, nothing", async () => {
    repo.addStandardContract.mockRejectedValue(new Error("x"));
    const other = { ...ARGS, mode: "other" } as typeof ARGS;
    const a = setup();
    const hookA = renderHook(() => useAddStandardContract(), { wrapper: a.wrapper });
    await act(async () => { await hookA.result.current.mutateAsync(other).catch(() => undefined); });
    expect(a.keys()).toEqual([BOOK]);
    flags.refresh = false;
    const b = setup();
    const hookB = renderHook(() => useAddStandardContract(), { wrapper: b.wrapper });
    await act(async () => { await hookB.result.current.mutateAsync(other).catch(() => undefined); });
    expect(b.keys()).toEqual([]);
  });
});
