// @vitest-environment jsdom
/**
 * The one `Project States` cache entry (D159, audit finding 5): the shared read, the three views of it, and the four
 * screens' hooks sharing one request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);
const svc = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({ Vsb_projectstatesService: svc }));

import { listProjectStates } from "@/data/generalData";
import { qk } from "@/data/keys";
import { adminStates, costStates, overviewStates, projectStatesQueryOptions } from "@/data/projectStates";
import { useProjectStates as useAdminStates } from "@/features/admin/admin-gates-approvals/hooks";
import { useProjectStates as useCostStates } from "@/features/cost/costing/useCostBook";
import { useProjectStates as useGeneralDataStates } from "@/features/pm/general-data/hooks";
import { useProjectStates as useOverviewStates } from "@/features/pm/project-main/hooks";

const ROWS = [
  { vsb_projectstateid: "s2", vsb_name: "Cluster 2", vsb_order: 2, vsb_isvisibleonchecklist: true, vsb_clusterdescription: "Two", statecode: 0, _owningbusinessunit_value: "bu-2" },
  { vsb_projectstateid: "s0", vsb_name: "Draft", vsb_order: 0, vsb_isvisibleonchecklist: true, vsb_clusterdescription: null, statecode: 0, _owningbusinessunit_value: "bu-0" },
  { vsb_projectstateid: "sx", vsb_name: "Retired", vsb_order: 9, vsb_isvisibleonchecklist: false, statecode: 1, _owningbusinessunit_value: null },
  { vsb_projectstateid: "sn", vsb_name: "No order", vsb_order: null, vsb_isvisibleonchecklist: false, statecode: 0, _owningbusinessunit_value: null },
];

beforeEach(() => {
  svc.getAll.mockReset();
  svc.getAll.mockResolvedValue({ success: true, data: ROWS });
});

describe("UT-PSTATES the shared read and its views", () => {
  it("UT-PSTATES-001 one read of the seven columns it needs, with no statecode filter, so the inactive states are in the list", async () => {
    const all = await listProjectStates();
    expect(svc.getAll).toHaveBeenCalledTimes(1);
    const options = svc.getAll.mock.calls[0]![0] as { select: string[]; filter?: string };
    expect(options.select).toEqual([
      "vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "vsb_clusterdescription", "statecode", "_owningbusinessunit_value",
    ]);
    expect(options.filter).toBeUndefined();
    expect(all.map((s) => s.id)).toEqual(["s0", "sn", "s2", "sx"]);   // sorted by Order, a missing Order read as 0 (as General Data always did), ties in read order
    expect(all.find((s) => s.id === "sx")).toMatchObject({ active: false, orderRaw: 9, businessUnitId: null });
    expect(all.find((s) => s.id === "sn")).toMatchObject({ order: 0, orderRaw: null });
  });

  it("UT-PSTATES-002 Project Overview's view: the active states only, the stored Order (null stays null)", async () => {
    expect(overviewStates(await listProjectStates())).toEqual([
      { id: "s0", name: "Draft", order: 0 }, { id: "sn", name: "No order", order: null }, { id: "s2", name: "Cluster 2", order: 2 },
    ]);
  });

  it("UT-PSTATES-003 the Cost screens' view: the active states, Order as a number", async () => {
    expect(costStates(await listProjectStates())).toEqual([
      { id: "s0", name: "Draft", order: 0 }, { id: "sn", name: "No order", order: 0 }, { id: "s2", name: "Cluster 2", order: 2 },
    ]);
  });

  it("UT-PSTATES-004 the Admin gate screen's view: every state, the raw Order and the business unit", async () => {
    const admin = adminStates(await listProjectStates());
    expect(admin).toHaveLength(4);
    expect(admin.find((s) => s.id === "sn")).toEqual({ id: "sn", name: "No order", order: null, visibleOnChecklist: false, businessUnitId: null });
    expect(admin.find((s) => s.id === "s2")).toEqual({ id: "s2", name: "Cluster 2", order: 2, visibleOnChecklist: true, businessUnitId: "bu-2" });
  });

  it("UT-PSTATES-005 the entry sits under General Data's key and is fresh for 30 minutes", () => {
    const o = projectStatesQueryOptions();
    expect(o.queryKey).toBe(qk.generalDataProjectStates);
    expect(o.staleTime).toBe(30 * 60 * 1000);
  });
});

describe("UT-PSTATES the screens share one request", () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

  it("UT-PSTATES-006 Overview, the Cost screens, the Admin gate screen and General Data read the table once, each seeing its own view", async () => {
    const qc = client();
    const { result } = renderHook(() => ({
      overview: useOverviewStates(), cost: useCostStates(), admin: useAdminStates(), generalData: useGeneralDataStates(),
    }), { wrapper: wrap(qc) });
    await waitFor(() => {
      expect(result.current.overview.data).toBeDefined();
      expect(result.current.cost.data).toBeDefined();
      expect(result.current.admin.data).toBeDefined();
      expect(result.current.generalData.data.length).toBeGreaterThan(0);
    });
    expect(svc.getAll).toHaveBeenCalledTimes(1);
    expect(result.current.overview.data).toHaveLength(3);
    expect(result.current.cost.data).toHaveLength(3);
    expect(result.current.admin.data).toHaveLength(4);
    expect(result.current.generalData.data).toHaveLength(4);
  });

  it("UT-PSTATES-007 opening a second screen later reads nothing while the entry is fresh", async () => {
    const qc = client();
    const first = renderHook(() => useOverviewStates(), { wrapper: wrap(qc) });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    const second = renderHook(() => useAdminStates(), { wrapper: wrap(qc) });
    await waitFor(() => expect(second.result.current.data).toHaveLength(4));
    expect(svc.getAll).toHaveBeenCalledTimes(1);
  });
});
