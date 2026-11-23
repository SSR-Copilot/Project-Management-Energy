// @vitest-environment jsdom
/**
 * UT-CAPEXCHART-OPT-001..002 — an admin CAPEX account write drops the Cost side's shared chart read (B2, OPT-07c), the moment the
 * write has finished (landed or failed part-way) and before anything refetches, so no Cost read is served the pre-write chart.
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const order: string[] = [];
const chart = vi.hoisted(() => ({ invalidateCapexChart: vi.fn() }));
vi.mock("@/data/capexChart", () => chart);
vi.mock("@/platform/privileges", () => ({ useTablePrivileges: () => ({}) }));

const { useCapexWrite } = await import("./hooks");

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(client, "invalidateQueries").mockImplementation(async () => { order.push("refetch"); });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useCapexWrite(), { wrapper });
}

describe("useCapexWrite", () => {
  it("UT-CAPEXCHART-OPT-001 a landed write drops the shared chart before the screen's refetches", async () => {
    chart.invalidateCapexChart.mockClear();
    order.length = 0;
    chart.invalidateCapexChart.mockImplementation(() => { order.push("chart"); });
    const hook = setup();
    await act(async () => { await hook.result.current.mutateAsync(async () => "done"); });
    expect(chart.invalidateCapexChart).toHaveBeenCalled();
    expect(order[0]).toBe("chart");
    expect(order).toContain("refetch");
  });

  it("UT-CAPEXCHART-OPT-002 a write that failed part-way drops it too (some rows may have changed)", async () => {
    chart.invalidateCapexChart.mockClear();
    const hook = setup();
    await act(async () => {
      await hook.result.current.mutateAsync(async () => { throw new Error("refused after the first row"); }).catch(() => undefined);
    });
    // Once when the write finishes, once more in `invalidateAfterCapexAccountsWrite` (idempotent).
    expect(chart.invalidateCapexChart).toHaveBeenCalledTimes(2);
  });
});
