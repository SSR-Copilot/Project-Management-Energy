// @vitest-environment jsdom
/**
 * UT-TEAM-OPT-1xx — the Team hooks (optimization programme B5a, OPT-13 / OPT-14 / OPT-19).
 * The data layer is faked; the invalidations, the read counts and the search calls are recorded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { qk } from "@/data/keys";
import type { WritePlan } from "@/data/writePlan";

const s = vi.hoisted(() => ({
  descriptionReads: 0,
  memberReads: 0,
  search: [] as string[],
  executed: 0,
}));

vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: vi.fn(async (plan: WritePlan) => { s.executed += 1; return { done: plan.writes.length, createdIds: [], createdRows: {} }; }),
}));
vi.mock("@/data/adminGatesApprovals", () => ({
  searchEntraPeople: vi.fn(async (term: string) => { s.search.push(term); return []; }),
  getEntraPeople: vi.fn(async () => new Map()),
}));
vi.mock("@/data/team", () => ({
  loadTeamProject: vi.fn(async () => null),
  listMemberDescriptions: vi.fn(async () => { s.descriptionReads += 1; return [{ id: "d-1", name: "Properties", description: "Site lead" }]; }),
  listTeamMembers: vi.fn(async (_id: string, descriptions?: unknown) => {
    s.memberReads += 1;
    if (descriptions === undefined) s.descriptionReads += 1; // the loader's own read when nothing is handed over
    else await descriptions;
    return [];
  }),
}));

import { useMemberDescriptions, useMemberSearch, useProjectMembers, useTeamWrites } from "./hooks";

const PID = "11111111-1111-1111-1111-111111111111";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidated: unknown[] = [];
  const real = qc.invalidateQueries.bind(qc);
  vi.spyOn(qc, "invalidateQueries").mockImplementation((f?: unknown, o?: unknown) => {
    invalidated.push((f as { queryKey: unknown }).queryKey);
    return real(f as never, o as never);
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, invalidated, wrapper };
}

afterEach(() => { cleanup(); s.descriptionReads = 0; s.memberReads = 0; s.search = []; s.executed = 0; });

describe("Team write reload (OPT-13)", () => {
  it("UT-TEAM-OPT-101 a save or delete refreshes the members only (BEFORE: qk.teamAll, i.e. project + members, and Entra)", async () => {
    const { invalidated, wrapper } = setup();
    const { result } = renderHook(() => useTeamWrites(PID), { wrapper });
    await act(async () => { await result.current.run({ progress: "", plan: { writes: [{ op: "delete", entitySet: "vsb_projectmembers", id: "m-1", reason: "x" }], log: [] } }); });
    expect(invalidated).toEqual([qk.team(PID, "members")]);
  });
});

describe("Team reads per visit (OPT-14)", () => {
  it("UT-TEAM-OPT-102 one visit reads the descriptions table once and the save reload does not read it again", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ m: useProjectMembers(PID), d: useMemberDescriptions() }), { wrapper });
    await waitFor(() => expect(result.current.m.isLoading || result.current.d.isLoading).toBe(false));
    expect(s.memberReads).toBe(1);
    expect(s.descriptionReads).toBe(1); // BEFORE: 2 (one in listTeamMembers, one in useMemberDescriptions)
  });
});

describe("Team member search (OPT-19)", () => {
  it("UT-TEAM-OPT-103 typing 'm', 'ma', 'max' within the pause searches once, for 'max' (BEFORE: three searches)", async () => {
    const { wrapper } = setup();
    const { rerender } = renderHook(({ term }) => useMemberSearch(term), { wrapper, initialProps: { term: "" } });
    rerender({ term: "m" }); rerender({ term: "ma" }); rerender({ term: "max" });
    expect(s.search).toEqual([]);
    await waitFor(() => expect(s.search).toEqual(["max"]), { timeout: 2000 });
  });
});
