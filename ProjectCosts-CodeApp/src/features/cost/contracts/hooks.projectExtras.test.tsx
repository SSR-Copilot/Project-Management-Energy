// @vitest-environment jsdom
/**
 * OPT-02 (B8): `useProjectExtras` derives the country id and technology from the session project, with no second read of
 * `vsb_projects`. OLD: one `load project extras` request per Cost screen (and the country-inflation / assumption reads waited for it).
 * Ids: UT-PROJEXTRAS-OPT-020 and up.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ProjectContext } from "./rules";

const h = vi.hoisted(() => ({ project: undefined as unknown, extrasCalls: 0 }));

vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ project: h.project }) }));
vi.mock("@/data/project", () => ({
  loadProjectExtras: async () => { h.extrasCalls += 1; return { countryId: "fallback-country", technology: 7 }; },
}));
vi.mock("@/data/costRepository", () => ({ costRepository: () => ({}) }));

const { useProjectExtras } = await import("./hooks");

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
const project = (over: Partial<ProjectContext>): ProjectContext => ({ projectId: "p1", projectIdCode: "1", projectName: "N", ...over });

describe("useProjectExtras (OPT-02)", () => {
  it("UT-PROJEXTRAS-OPT-020 the session project is the one asked for: derived at once, 0 project reads (OLD 1)", async () => {
    h.extrasCalls = 0;
    h.project = project({ countryId: "c-1", technology: 952850000 });
    const { result } = renderHook(() => useProjectExtras("p1"), { wrapper: wrapper() });
    expect(result.current).toEqual({ data: { countryId: "c-1", technology: 952850000 }, isLoading: false, error: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.extrasCalls).toBe(0);
  });

  it("UT-PROJEXTRAS-OPT-021 a project without a country or technology derives undefined values, still with no read", async () => {
    h.extrasCalls = 0;
    h.project = project({});
    const { result } = renderHook(() => useProjectExtras("p1"), { wrapper: wrapper() });
    expect(result.current.data).toEqual({ countryId: undefined, technology: undefined });
    expect(result.current.isLoading).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.extrasCalls).toBe(0);
  });

  it("UT-PROJEXTRAS-OPT-022 the data object keeps its identity across renders while the two values do not change", () => {
    h.project = project({ countryId: "c-1", technology: 1 });
    const { result, rerender } = renderHook(() => useProjectExtras("p1"), { wrapper: wrapper() });
    const first = result.current.data;
    rerender();
    expect(result.current.data).toBe(first);
  });

  it("UT-PROJEXTRAS-OPT-023 the session holds another project, or none: the old single-row read answers (nothing is derived wrongly)", async () => {
    for (const session of [project({ projectId: "other", countryId: "wrong" }), undefined]) {
      h.extrasCalls = 0;
      h.project = session;
      const { result } = renderHook(() => useProjectExtras("p1"), { wrapper: wrapper() });
      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.data).toEqual({ countryId: "fallback-country", technology: 7 }));
      expect(h.extrasCalls).toBe(1);
    }
  });

  it("UT-PROJEXTRAS-OPT-024 no project id: no read and no data", async () => {
    h.extrasCalls = 0;
    h.project = project({ countryId: "c-1" });
    const { result } = renderHook(() => useProjectExtras(undefined), { wrapper: wrapper() });
    expect(result.current.data).toBeUndefined();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.extrasCalls).toBe(0);
  });
});
