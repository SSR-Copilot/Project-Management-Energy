// @vitest-environment jsdom
/**
 * UT-GDATA-OPT-1xx — the General Data cluster-panel save reloads once, at the end (OPT-13).
 * BEFORE (unmodified tree): the cluster-panel job awaited a full reload (project, shareholders, trackings, session project = 4
 * refetches of the mounted queries) and `runSave` then reloaded them again: 2 awaited reloads for one user action.
 * AFTER: the first job only marks the four keys stale (0 refetches); the main save's reload is the one awaited reload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";
import { qk } from "@/data/keys";

vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: vi.fn(async (plan: WritePlan) => ({ done: plan.writes.length, createdIds: [], createdRows: {} })),
}));

import { useGeneralDataWrites } from "./hooks";
import { generalDataReloadKeys } from "./reload";

const PID = "11111111-1111-1111-1111-111111111111";
const plan: WritePlan = { writes: [{ op: "update", entitySet: "vsb_projects", id: PID, data: {}, reason: "x" }], log: [] };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const fetches: string[] = [];
  const keys = generalDataReloadKeys(PID);
  // One mounted (observed) query per key, counting its fetches.
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, fetches, keys, wrapper };
}

afterEach(cleanup);

describe("General Data reload keys (OPT-13)", () => {
  it("UT-GDATA-OPT-101 the list is the four keys the hook always reloaded", () => {
    expect(generalDataReloadKeys(PID).map((k) => JSON.stringify(k))).toEqual(
      [qk.generalDataProject(PID), qk.shareholders(PID), qk.stateTrackings(PID), qk.project(PID)].map((k) => JSON.stringify(k)),
    );
  });

  it("UT-GDATA-OPT-102 a job that is staleOnly on every key refetches nothing; a normal job refetches all four", async () => {
    const { qc, fetches, keys, wrapper } = setup();
    const { result } = renderHook(() => {
      for (const queryKey of keys) {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed-length list
        useQuery({ queryKey, queryFn: async () => { fetches.push(JSON.stringify(queryKey)); return 1; } });
      }
      return useGeneralDataWrites(PID);
    }, { wrapper });
    await waitFor(() => expect(fetches).toHaveLength(4));
    fetches.length = 0;
    await act(async () => { await result.current.run({ progress: "", plan, invalidate: keys, staleOnly: keys }); });
    expect(fetches).toEqual([]);
    for (const queryKey of keys) expect(qc.getQueryState(queryKey)!.isInvalidated).toBe(true);
    await act(async () => { await result.current.run({ progress: "", plan }); });
    expect(fetches).toHaveLength(4);
  });

  it("UT-GDATA-OPT-103 reloadAll (a failed first job) invalidates all four keys for real", async () => {
    const { qc, keys, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useGeneralDataWrites(PID), { wrapper });
    await act(async () => { await result.current.reloadAll(); });
    expect(spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))).toEqual(keys.map((k) => JSON.stringify(k)));
    expect(spy.mock.calls.every((c) => (c[0] as { refetchType?: string }).refetchType === undefined)).toBe(true);
  });
});
