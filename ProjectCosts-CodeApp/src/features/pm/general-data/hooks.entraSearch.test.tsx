// @vitest-environment jsdom
/**
 * GD-024: the Manager / Deputy search waits for a pause in typing (UT-GDATA-113).
 * `searchEntraPeople` is mocked; the real timers run (the pause is 250 ms).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const search = vi.hoisted(() => vi.fn(async (_term: string) => [{ id: "e-9", displayName: "Max Planner", mail: "m@x" }]));
vi.mock("@/data/adminGatesApprovals", () => ({
  searchEntraPeople: search,
  getEntraPeople: vi.fn(async () => new Map()),
}));

import { ENTRA_SEARCH_DEBOUNCE_MS, useEntraSearch } from "./hooks";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

afterEach(() => { cleanup(); search.mockClear(); });

describe("UT-GDATA useEntraSearch", () => {
  it("UT-GDATA-113 typing 'm', 'ma', 'max' within the pause issues one call with 'max'; a blank box issues none", async () => {
    expect(ENTRA_SEARCH_DEBOUNCE_MS).toBe(250);
    const { result, rerender } = renderHook(({ term }) => useEntraSearch(term), { wrapper, initialProps: { term: "" } });
    rerender({ term: "m" });
    rerender({ term: "ma" });
    rerender({ term: "max" });
    // Nothing went out while the user was still typing.
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(search).toHaveBeenCalledWith("max");
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    // A blank (or whitespace-only) box searches nothing, and at once.
    rerender({ term: "  " });
    await new Promise((r) => setTimeout(r, ENTRA_SEARCH_DEBOUNCE_MS + 150));
    expect(search).toHaveBeenCalledTimes(1);
  });
});
