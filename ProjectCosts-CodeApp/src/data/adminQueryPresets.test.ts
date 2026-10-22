/** H8 query presets — the Wave C `FRESH_ON_ENTRY_ONCE` preset next to the two existing ones. */
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { FRESH_ON_ENTRY, FRESH_ON_ENTRY_ONCE, NO_FOCUS_REFETCH } from "./adminQueryPresets";

describe("Query presets (H8)", () => {
  it("UT-ADQPRESET-001 The existing presets are unchanged", () => {
    expect(FRESH_ON_ENTRY).toEqual({ staleTime: 0, refetchOnMount: "always" });
    expect(NO_FOCUS_REFETCH).toEqual({ refetchOnWindowFocus: false });
  });

  it("UT-ADQPRESET-002 FRESH_ON_ENTRY_ONCE equals Check List Settings' old spread-and-override exactly", () => {
    expect(FRESH_ON_ENTRY_ONCE).toEqual({ ...FRESH_ON_ENTRY, ...NO_FOCUS_REFETCH, staleTime: Number.POSITIVE_INFINITY });
  });

  it("UT-ADQPRESET-003 FRESH_ON_ENTRY_ONCE: refetches on a new mount, then stays fresh for further observers", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFn = vi.fn(() => Promise.resolve(["t1"]));
    const opts = { ...FRESH_ON_ENTRY_ONCE, queryKey: ["adminChecklistLocks"], queryFn };
    await client.fetchQuery(opts);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().find({ queryKey: opts.queryKey })!.isStale()).toBe(false);
    // A new observer mounting ("refetchOnMount: always") fetches again even though the data is fresh.
    const observer = new QueryObserver(client, opts);
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    expect(client.getQueryCache().find({ queryKey: opts.queryKey })!.isStale()).toBe(false);
    unsubscribe();
    client.clear();
  });
});
