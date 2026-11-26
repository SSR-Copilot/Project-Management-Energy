// @vitest-environment jsdom
/**
 * Costs settings hooks: the active and the hidden OPEX rows of a scope are ONE query / ONE read (dvopt AD-09,
 * `ADMIN_SCOPE_READS_ONCE`), and the DEVEX delete marks the project caches its server plug-in changes as stale (AD-11).
 * UT-ADCOST-HOOK-nnn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const data = vi.hoisted(() => ({
  listOpexScopeRows: vi.fn(), listOpexPeriods: vi.fn(), listInactiveOpexRows: vi.fn(),
}));
vi.mock("@/data/adminCost", () => ({
  deleteOpexContract: vi.fn(), deleteOpexPeriod: vi.fn(), listCostCurrencies: vi.fn(), listDevexCosts: vi.fn(),
  listInflationAreas: vi.fn(), listLandLeaseSubaccounts: vi.fn(), listOpexSubaccounts: vi.fn(), loadCapexHierarchy: vi.fn(),
  loadCostPayerDefaults: vi.fn(), saveOpexPeriod: vi.fn(),
  ...data,
}));
const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

import { qk } from "@/data/keys";
import { ADMIN_OPT } from "@/data/adminFlags";
import type { CostTechnology } from "@/domain/costStandards";
import { useDeleteDevexCost, useInactiveOpexRows, useOpexPeriods } from "./hooks";

const SCOPE = { countryId: "00000000-0000-0000-0000-0000000000de", technology: 952850000 as CostTechnology };
const DEFAULTS = { ...ADMIN_OPT };
const ACTIVE = [{ id: "a1" }, { id: "a2" }];
const HIDDEN = [{ id: "h1" }];

function wrapperFor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => {
  Object.assign(ADMIN_OPT, DEFAULTS);
  vi.clearAllMocks();
  data.listOpexScopeRows.mockResolvedValue({ active: ACTIVE, inactive: HIDDEN });
  data.listOpexPeriods.mockResolvedValue(ACTIVE);
  data.listInactiveOpexRows.mockResolvedValue(HIDDEN);
  exec.mockResolvedValue({ done: 1, createdIds: [] });
});
afterEach(() => { cleanup(); Object.assign(ADMIN_OPT, DEFAULTS); });

describe("AD-09 one OPEX query per scope", () => {
  it("UT-ADCOST-HOOK-001 both hooks mounted together make ONE read and each sees its half", async () => {
    const { wrapper } = wrapperFor();
    const { result } = renderHook(() => ({ active: useOpexPeriods(SCOPE), hidden: useInactiveOpexRows(SCOPE) }), { wrapper });
    await waitFor(() => expect(result.current.active.data).toBeDefined());
    await waitFor(() => expect(result.current.hidden.data).toBeDefined());
    expect(data.listOpexScopeRows).toHaveBeenCalledTimes(1);
    expect(data.listOpexPeriods).not.toHaveBeenCalled();
    expect(data.listInactiveOpexRows).not.toHaveBeenCalled();
    expect(result.current.active.data).toEqual(ACTIVE);
    expect(result.current.hidden.data).toEqual(HIDDEN);
  });

  it("UT-ADCOST-HOOK-002 a write's invalidation of qk.adminCostOpex(scope) refreshes both halves with one read", async () => {
    const { client, wrapper } = wrapperFor();
    const { result } = renderHook(() => ({ active: useOpexPeriods(SCOPE), hidden: useInactiveOpexRows(SCOPE) }), { wrapper });
    await waitFor(() => expect(result.current.hidden.data).toBeDefined());
    data.listOpexScopeRows.mockResolvedValue({ active: [{ id: "a3" }], inactive: [] });
    await act(async () => { await client.invalidateQueries({ queryKey: qk.adminCostOpex(SCOPE) }); });
    await waitFor(() => expect(result.current.active.data).toEqual([{ id: "a3" }]));
    expect(result.current.hidden.data).toEqual([]);
    expect(data.listOpexScopeRows).toHaveBeenCalledTimes(2);
  });

  it("UT-ADCOST-HOOK-003 no scope, no read", () => {
    const { wrapper } = wrapperFor();
    renderHook(() => ({ a: useOpexPeriods(undefined), b: useInactiveOpexRows(undefined) }), { wrapper });
    expect(data.listOpexScopeRows).not.toHaveBeenCalled();
  });

  it("UT-ADCOST-HOOK-004 with ADMIN_SCOPE_READS_ONCE off the two old reads run (one each), each under its old query", async () => {
    ADMIN_OPT.ADMIN_SCOPE_READS_ONCE = false;
    const { client, wrapper } = wrapperFor();
    const { result } = renderHook(() => ({ active: useOpexPeriods(SCOPE), hidden: useInactiveOpexRows(SCOPE) }), { wrapper });
    await waitFor(() => expect(result.current.active.data).toEqual(ACTIVE));
    await waitFor(() => expect(result.current.hidden.data).toEqual(HIDDEN));
    expect(data.listOpexScopeRows).not.toHaveBeenCalled();
    expect(data.listOpexPeriods).toHaveBeenCalledTimes(1);
    expect(data.listInactiveOpexRows).toHaveBeenCalledTimes(1);
    expect(client.getQueryState([...qk.adminCostOpex(SCOPE), "inactive"])).toBeDefined();
  });
});

describe("AD-11 DEVEX delete", () => {
  it("UT-ADCOST-HOOK-005 a DEVEX delete marks the project cost book, totals and Add-Costs sheet stale", async () => {
    const { client, wrapper } = wrapperFor();
    const book = ["cost-book", "project-1", 3];
    const sheet = ["add-cost-sheet", "project-1"];
    client.setQueryData(book, { v: 1 });
    client.setQueryData(sheet, { v: 1 });
    const stale = (k: readonly unknown[]) => client.getQueryState(k)?.isInvalidated ?? false;
    const { result } = renderHook(() => useDeleteDevexCost(SCOPE, true), { wrapper });
    await act(() => result.current.mutateAsync("30000000-0000-0000-0000-000000000001"));
    expect(stale(book)).toBe(true);
    expect(stale(sheet)).toBe(true);
  });
});
