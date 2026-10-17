// @vitest-environment jsdom
/**
 * Cache invalidation after Costs settings writes (AC-7, DR-10): every mutation hook, on settle,
 * refreshes the screen's own scoped key AND the project cost screens' caches of the same
 * standard-assumption tables (cost book CAPEX standards, Land Lease, OPEX standard contracts),
 * through the shared `invalidateAfterCostsWrite` (M4) and the shared `qk` keys (M3).
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));
vi.mock("@/platform/telemetry", () => ({ trace: vi.fn() }));
vi.mock("@/data/settings/costs", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/settings/costs")>();
  return {
    ...real,
    saveDevexCost: vi.fn().mockResolvedValue({ id: "d" }),
    deleteDevexCost: vi.fn().mockRejectedValue(new Error("failed after a write")),
    saveOpexPeriod: vi.fn().mockResolvedValue({ id: "o", propagated: 0 }),
    deleteOpexContract: vi.fn().mockResolvedValue(undefined),
    deleteOpexPeriod: vi.fn().mockResolvedValue(undefined),
  };
});

import { qk } from "@/data/keys";
import { CONTRACT_TYPE, TECHNOLOGY, type DevexWrite, type OpexWrite } from "@/data/settings/costs";
import {
  useDeleteDevexCost, useDeleteOpexContract, useDeleteOpexPeriod, useSaveDevexCost, useSaveOpexPeriod,
} from "./hooks";

const scope = { countryId: "c-1", technology: TECHNOLOGY.wind } as const;
const other = { countryId: "c-2", technology: TECHNOLOGY.pv } as const;
const contract = { ...scope, type: CONTRACT_TYPE.landLease, subaccountId: "s-1" } as const;

const PROJECT_CAPEX = ["capex-standard-assumptions", "p-1"];
const PROJECT_LAND_LEASE = ["land-lease-assumptions", "c-1", TECHNOLOGY.wind];
const PROJECT_OPEX = ["opex-assumption-scopes", "c-1", TECHNOLOGY.wind];

function seeded(): QueryClient {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const keys = [
    qk.settings.costs.devex(scope), qk.settings.costs.devex(other),
    qk.settings.costs.opex(scope), qk.settings.costs.opex(other),
    PROJECT_CAPEX, PROJECT_LAND_LEASE, PROJECT_OPEX, ["unrelated", "x"],
  ];
  for (const k of keys) client.setQueryData(k, 1);
  return client;
}
const stale = (client: QueryClient, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true;
const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

describe("invalidation after writes (AC-7)", () => {
  it("keeps the local key shapes (shared qk.settings.costs)", () => {
    expect(qk.settings.costs.devex(scope)).toEqual(["settings-costs", "devex", "c-1", TECHNOLOGY.wind]);
    expect(qk.settings.costs.opex(undefined)).toEqual(["settings-costs", "opex", "-", -1]);
  });

  it("a DEVEX save refreshes its scope and the project CAPEX standards (cost book) only", async () => {
    const client = seeded();
    const { result } = renderHook(() => useSaveDevexCost(scope), { wrapper: wrapper(client) });
    await act(() => result.current.mutateAsync({} as DevexWrite));
    expect(stale(client, qk.settings.costs.devex(scope))).toBe(true);
    expect(stale(client, PROJECT_CAPEX)).toBe(true);
    expect(stale(client, qk.settings.costs.devex(other))).toBe(false);
    expect(stale(client, qk.settings.costs.opex(scope))).toBe(false);
    expect(stale(client, PROJECT_LAND_LEASE)).toBe(false);
    expect(stale(client, ["unrelated", "x"])).toBe(false);
  });

  it("a FAILED DEVEX delete still refreshes (invalidate on settle)", async () => {
    const client = seeded();
    const { result } = renderHook(() => useDeleteDevexCost(scope), { wrapper: wrapper(client) });
    await act(async () => { await expect(result.current.mutateAsync("d")).rejects.toThrow(); });
    expect(stale(client, qk.settings.costs.devex(scope))).toBe(true);
    expect(stale(client, PROJECT_CAPEX)).toBe(true);
  });

  it.each([
    ["save", () => useSaveOpexPeriod(scope), {} as OpexWrite],
    ["contract delete", () => useDeleteOpexContract(scope), contract],
    ["period delete", () => useDeleteOpexPeriod(scope), { id: "p", contract }],
  ] as const)("a contract %s refreshes its scope and the project Land Lease / OPEX standard contracts", async (_, hook, arg) => {
    const client = seeded();
    const { result } = renderHook(hook as () => { mutateAsync: (a: unknown) => Promise<unknown> }, { wrapper: wrapper(client) });
    await act(() => result.current.mutateAsync(arg));
    expect(stale(client, qk.settings.costs.opex(scope))).toBe(true);
    expect(stale(client, PROJECT_LAND_LEASE)).toBe(true);
    expect(stale(client, PROJECT_OPEX)).toBe(true);
    expect(stale(client, qk.settings.costs.opex(other))).toBe(false);
    expect(stale(client, qk.settings.costs.devex(scope))).toBe(false);
    expect(stale(client, PROJECT_CAPEX)).toBe(false);
  });
});
