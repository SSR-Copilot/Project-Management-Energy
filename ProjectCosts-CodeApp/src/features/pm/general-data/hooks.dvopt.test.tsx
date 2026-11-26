// @vitest-environment jsdom
/**
 * UT-GDDVOPT-NNN — Dataverse optimization programme on the General Data hooks:
 *  - PB-15 `GD_CANCEL_REUSES_CACHE`: the Draft gate-approval cancellation takes the gates from the Check List's cached query;
 *  - PB-16 `ONE_PERSON_CACHE`: `useEntraPeople` goes through the per-person Entra cache Team and the Check List share.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  gates: vi.fn(async (_p: unknown) => [{ id: "g-1" }] as unknown[]),
  cancel: vi.fn(async (_a: unknown) => undefined),
  entra: vi.fn(async (ids: readonly string[]) => new Map(ids.map((i) => [i, { id: i, displayName: `N-${i}`, mail: `${i}@x` }]))),
  payloadGates: [] as unknown[],
}));
vi.mock("@/data/checklist", () => ({ listChecklistGates: h.gates }));
vi.mock("@/data/flows", () => ({ cancelGateApproval: h.cancel }));
vi.mock("@/data/adminGatesApprovals", () => ({ searchEntraPeople: vi.fn(async () => []), getEntraPeople: h.entra }));
vi.mock("./rules", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./rules")>();
  return {
    ...mod,
    startClusterChanged: () => true,
    draftTrackingOf: () => ({ id: "t" }),
    shouldCancelGateApproval: () => true,
    draftGateCancellationPayload: (a: { gates: unknown[] }) => { h.payloadGates = a.gates; return { projectId: "p" }; },
  };
});

import { qk } from "@/data/keys";
import { resetPersonCache, setOnePersonCache } from "@/data/personCache";
import { setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import { cancelDraftGateApprovalIfRunning, useEntraPeople } from "./hooks";
import { setGdCancelReusesCache } from "./gdPerfFlags";

const args = (queryClient?: QueryClient) => ({
  project: { countryId: "c-de", technology: 1 } as never,
  form: {} as never, projectStates: [], trackings: [], appId: "app", ...(queryClient ? { queryClient } : {}),
});
let qc: QueryClient;
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  resetPersonCache();
  for (const f of [h.gates, h.cancel, h.entra]) f.mockClear();
});
afterEach(() => { cleanup(); setGdCancelReusesCache(null); setChecklistPerfFlags(null); setOnePersonCache(null); });

describe("UT-GDDVOPT PB-15 the cancellation step reuses the Check List's gates", () => {
  it("UT-GDDVOPT-001 a fresh Check List gate entry: NO gate read; the flow is still called with that entry's gates", async () => {
    qc.setQueryData(qk.checklistGates("c-de", 1), [{ id: "cached" }]);
    await cancelDraftGateApprovalIfRunning(args(qc));
    expect(h.gates).not.toHaveBeenCalled();
    expect(h.payloadGates).toEqual([{ id: "cached" }]);
    expect(h.cancel).toHaveBeenCalledTimes(1); // the flow call itself is untouched
  });

  it("UT-GDDVOPT-002 nothing cached: one read, stored under the Check List's key (the Check List then finds it)", async () => {
    await cancelDraftGateApprovalIfRunning(args(qc));
    expect(h.gates).toHaveBeenCalledTimes(1);
    expect(h.gates).toHaveBeenCalledWith({ countryId: "c-de", technology: 1 });
    expect(qc.getQueryData(qk.checklistGates("c-de", 1))).toEqual([{ id: "g-1" }]);
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it("UT-GDDVOPT-003 a STALE entry (older than the default staleTime) is read again; so is an invalidated one", async () => {
    qc.setQueryData(qk.checklistGates("c-de", 1), [{ id: "cached" }], { updatedAt: Date.now() - 31_000 });
    await cancelDraftGateApprovalIfRunning(args(qc));
    expect(h.gates).toHaveBeenCalledTimes(1);
    await qc.invalidateQueries({ queryKey: qk.checklistGatesAll });
    await cancelDraftGateApprovalIfRunning(args(qc));
    expect(h.gates).toHaveBeenCalledTimes(2);
  });

  it("UT-GDDVOPT-004 the switch OFF, no client, or the Check List's `scopedGates` OFF: always read (the old path)", async () => {
    qc.setQueryData(qk.checklistGates("c-de", 1), [{ id: "cached" }]);
    setGdCancelReusesCache(false);
    await cancelDraftGateApprovalIfRunning(args(qc));
    expect(h.gates).toHaveBeenCalledTimes(1);
    setGdCancelReusesCache(null);
    await cancelDraftGateApprovalIfRunning(args());
    expect(h.gates).toHaveBeenCalledTimes(2);
    setChecklistPerfFlags({ scopedGates: false });
    await cancelDraftGateApprovalIfRunning(args(qc));
    expect(h.gates).toHaveBeenCalledTimes(3);
  });

  it("UT-GDDVOPT-005 failure injection: a failed gate read is swallowed and logged as before (the save goes on), the flow is not called", async () => {
    h.gates.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(cancelDraftGateApprovalIfRunning(args(qc))).resolves.toBeUndefined();
    expect(h.cancel).not.toHaveBeenCalled();
  });
});

describe("UT-GDDVOPT PB-16 useEntraPeople goes through the shared per-person cache", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

  it("UT-GDDVOPT-010 two readers of the same person (another query key) ask Entra ONCE per person; the answer shape is the same Map", async () => {
    const a = renderHook(() => useEntraPeople(["a", "b"]), { wrapper });
    await waitFor(() => expect(a.result.current.data.size).toBe(2));
    expect(h.entra).toHaveBeenCalledTimes(2); // one request per person, as getEntraPeople always did
    const b = renderHook(() => useEntraPeople(["b", "a", "c"]), { wrapper });
    await waitFor(() => expect(b.result.current.data.size).toBe(3));
    expect(h.entra.mock.calls.map((c) => c[0])).toEqual([["a"], ["b"], ["c"]]); // only "c" is new
    expect(b.result.current.data.get("a")).toEqual({ id: "a", displayName: "N-a", mail: "a@x" });
  });

  it("UT-GDDVOPT-011 the switch OFF: the old uncached `getEntraPeople(ids)` call, one request for the whole list", async () => {
    setOnePersonCache(false);
    const a = renderHook(() => useEntraPeople(["a", "b"]), { wrapper });
    await waitFor(() => expect(a.result.current.data.size).toBe(2));
    expect(h.entra).toHaveBeenCalledTimes(1);
    expect(h.entra).toHaveBeenCalledWith(["a", "b"]);
  });

  it("UT-GDDVOPT-012 failure injection: one failed person rejects the whole read (as getEntraPeople), and is not remembered", async () => {
    h.entra.mockImplementationOnce(async () => { throw new Error("HTTP 503"); });
    const a = renderHook(() => useEntraPeople(["a"]), { wrapper });
    await waitFor(() => expect(a.result.current.error).toBeTruthy());
    qc.clear();
    const b = renderHook(() => useEntraPeople(["a"]), { wrapper });
    await waitFor(() => expect(b.result.current.data.size).toBe(1));
    expect(h.entra).toHaveBeenCalledTimes(2);
  });
});
