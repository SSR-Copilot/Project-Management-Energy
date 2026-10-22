// @vitest-environment jsdom
/**
 * Cache invalidation after Costs settings writes: every mutation hook, on settle,
 * refreshes the screen's own scoped key AND the project cost screens' caches of the same
 * standard-assumption tables (cost book CAPEX standards, Land Lease, OPEX standard contracts),
 * through the shared `invalidateAfterCostsWrite` and the shared `qk` keys.
 *
 * The two DEVEX writes are `WritePlan`s now (D36), so their mock boundary is `@/data/executePlan`
 * (imported with `importOriginal`, so `PlanError` and the refusal class stay real) instead of the
 * data-layer functions; the contract flows are still mocked on `@/data/adminCost`. Nothing about
 * what these tests assert changed.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));
vi.mock("@/platform/telemetry", () => ({ trace: vi.fn() }));
vi.mock("@/data/adminCost", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/adminCost")>();
  return {
    ...real,
    saveOpexPeriod: vi.fn().mockResolvedValue({ id: "o", propagated: 0 }),
    deleteOpexContract: vi.fn().mockResolvedValue(undefined),
    deleteOpexPeriod: vi.fn().mockResolvedValue(undefined),
  };
});

/** A plan either lands (save) or fails after its write was sent (delete), as the old fakes did. */
const planFails = { on: false };
vi.mock("@/data/executePlan", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...real,
    executePlan: vi.fn(async (plan: import("@/data/writePlan").WritePlan) => {
      if (plan.refusedReason) throw new real.PlanRefusedError(plan.refusedReason);
      if (planFails.on) throw new real.PlanError(1, 1, "standard cost deleted", new Error("failed after a write"));
      return { done: 1, createdIds: ["d"] };
    }),
  };
});

import { qk } from "@/data/keys";
import { type DevexWrite, type OpexWrite } from "@/data/adminCost";
import { CONTRACT_TYPE, DevexRuleError, TECHNOLOGY } from "@/domain/costStandards";
import { MSG } from "./constants";
import {
  useDeleteDevexCost, useDeleteOpexContract, useDeleteOpexPeriod, useSaveDevexCost, useSaveOpexPeriod,
} from "./hooks";

const scope = { countryId: "c-1", technology: TECHNOLOGY.wind } as const;
const other = { countryId: "c-2", technology: TECHNOLOGY.pv } as const;
const contract = { ...scope, type: CONTRACT_TYPE.landLease, subaccountId: "s-1" } as const;
/** A valid write: the plan refuses an incomplete one before it reaches the executor (UT-ADCOST-021). */
const devexWrite: DevexWrite = {
  countryId: "c-1", countryName: "Germany", technology: TECHNOLOGY.wind, categoryId: "cat-1",
  subaccountId: "sub-1", subaccountName: "Permits", descriptionInput: "X",
  clusters: [true, false, false, false, false], unit: 952850000, costAmount: 1, comment: "", costPaidBy: 952850001,
};

const PROJECT_CAPEX = ["capex-standard-assumptions", "p-1"];
const PROJECT_LAND_LEASE = ["land-lease-assumptions", "c-1", TECHNOLOGY.wind];
const PROJECT_OPEX = ["opex-assumption-scopes", "c-1", TECHNOLOGY.wind];

function seeded(): QueryClient {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const keys = [
    qk.adminCostDevex(scope), qk.adminCostDevex(other),
    qk.adminCostOpex(scope), qk.adminCostOpex(other),
    PROJECT_CAPEX, PROJECT_LAND_LEASE, PROJECT_OPEX, ["unrelated", "x"],
  ];
  for (const k of keys) client.setQueryData(k, 1);
  return client;
}
const stale = (client: QueryClient, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true;
const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

describe("Invalidation after writes", () => {
  it("UT-ADCOST-801 keeps the local key shapes (shared qk.adminCost*)", () => {
    expect(qk.adminCostDevex(scope)).toEqual(["adminCostDevex", "c-1", TECHNOLOGY.wind]);
    expect(qk.adminCostOpex(undefined)).toEqual(["adminCostOpex", "-", -1]);
  });

  it("UT-ADCOST-802 a DEVEX save refreshes its scope and the project CAPEX standards (cost book) only", async () => {
    const client = seeded();
    const { result } = renderHook(() => useSaveDevexCost(scope, true), { wrapper: wrapper(client) });
    await act(() => result.current.mutateAsync(devexWrite));
    expect(stale(client, qk.adminCostDevex(scope))).toBe(true);
    expect(stale(client, PROJECT_CAPEX)).toBe(true);
    expect(stale(client, qk.adminCostDevex(other))).toBe(false);
    expect(stale(client, qk.adminCostOpex(scope))).toBe(false);
    expect(stale(client, PROJECT_LAND_LEASE)).toBe(false);
    expect(stale(client, ["unrelated", "x"])).toBe(false);
  });

  it("UT-ADCOST-803 a FAILED DEVEX delete still refreshes (invalidate on settle)", async () => {
    const client = seeded();
    planFails.on = true;
    const { result } = renderHook(() => useDeleteDevexCost(scope, true), { wrapper: wrapper(client) });
    try {
      await act(async () => { await expect(result.current.mutateAsync("d")).rejects.toThrow("failed after a write"); });
    } finally {
      planFails.on = false;
    }
    expect(stale(client, qk.adminCostDevex(scope))).toBe(true);
    expect(stale(client, PROJECT_CAPEX)).toBe(true);
  });

  it("UT-ADCOST-805 a refused DEVEX plan reaches the panel as a DevexRuleError, with the sentence the data layer threw", async () => {
    const client = seeded();
    const { result } = renderHook(() => useSaveDevexCost(scope, true), { wrapper: wrapper(client) });
    const error = await act(() => result.current.mutateAsync({ ...devexWrite, subaccountName: " " }).catch((e: unknown) => e));
    expect(error).toBeInstanceOf(DevexRuleError);
    expect((error as Error).message).toBe(MSG.subaccountInactive);

    const noAccess = renderHook(() => useSaveDevexCost(scope, false), { wrapper: wrapper(client) });
    const refused = await act(() => noAccess.result.current.mutateAsync(devexWrite).catch((e: unknown) => e));
    expect((refused as Error).message).toBe(MSG.noPermission);
  });

  it.each([
    ["save", () => useSaveOpexPeriod(scope), {} as OpexWrite],
    ["contract delete", () => useDeleteOpexContract(scope), contract],
    ["period delete", () => useDeleteOpexPeriod(scope), { id: "p", contract }],
  ] as const)("UT-ADCOST-804 a contract %s refreshes its scope and the project Land Lease / OPEX standard contracts", async (_, hook, arg) => {
    const client = seeded();
    const { result } = renderHook(hook as () => { mutateAsync: (a: unknown) => Promise<unknown> }, { wrapper: wrapper(client) });
    await act(() => result.current.mutateAsync(arg));
    expect(stale(client, qk.adminCostOpex(scope))).toBe(true);
    expect(stale(client, PROJECT_LAND_LEASE)).toBe(true);
    expect(stale(client, PROJECT_OPEX)).toBe(true);
    expect(stale(client, qk.adminCostOpex(other))).toBe(false);
    expect(stale(client, qk.adminCostDevex(scope))).toBe(false);
    expect(stale(client, PROJECT_CAPEX)).toBe(false);
  });
});
