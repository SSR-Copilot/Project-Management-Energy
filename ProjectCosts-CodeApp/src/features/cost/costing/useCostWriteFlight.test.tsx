// @vitest-environment jsdom
/**
 * CA-15 — a Cost write that outlives the screen which started it.
 *
 * A real `QueryClient`, because the defect lives in TanStack's observer model: a screen re-opened
 * mid-write gets a FRESH `useMutation` observer whose `isPending` is false, while the write it
 * started on the earlier visit is still running in the shared mutation cache.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { COST_WRITE_MSG, costWriteKey } from "@/domain/writeGuard";

const notifyError = vi.fn();
vi.mock("@/components/useNotify", () => ({
  useNotify: () => ({ error: notifyError, success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismissAll: vi.fn() }),
}));

const { useCostWriteInFlight, useWriteFailureReport } = await import("./useCostWriteFlight");

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** A write that settles only when the test says so. */
function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (e: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

afterEach(() => notifyError.mockReset());

describe("useCostWriteInFlight (CA-15)", () => {
  it("UT-COSTFLIGHT-001 a write started on a screen that has since unmounted still counts", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = wrapperFor(client);
    const write = deferred();
    // The screen that starts the write…
    const first = renderHook(() => useMutation({
      mutationKey: [...costWriteKey("p-1", "land-lease")], mutationFn: () => write.promise,
    }), { wrapper });
    act(() => { first.result.current.mutate(); });
    first.unmount();

    // …and the same screen re-opened: its own observer reads idle, the flag does not.
    const reopened = renderHook(() => ({
      own: useMutation({ mutationKey: [...costWriteKey("p-1", "land-lease")], mutationFn: async () => undefined }),
      inFlight: useCostWriteInFlight("p-1"),
    }), { wrapper });
    await vi.waitFor(() => expect(reopened.result.current.inFlight).toBe(true));
    expect(reopened.result.current.own.isPending).toBe(false);

    await act(async () => { write.resolve(); });
    await vi.waitFor(() => expect(reopened.result.current.inFlight).toBe(false));
  });

  it("UT-COSTFLIGHT-002 any family of the project counts; another project's write does not", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = wrapperFor(client);
    const other = deferred();
    const capex = deferred();
    const hook = renderHook(() => ({
      otherProject: useMutation({ mutationKey: [...costWriteKey("p-2", "contracts")], mutationFn: () => other.promise }),
      capex: useMutation({ mutationKey: [...costWriteKey("p-1", "capex")], mutationFn: () => capex.promise }),
      unkeyed: useMutation({ mutationFn: () => new Promise<void>(() => undefined) }),
      inFlight: useCostWriteInFlight("p-1"),
    }), { wrapper });

    act(() => { hook.result.current.otherProject.mutate(); hook.result.current.unkeyed.mutate(); });
    await vi.waitFor(() => expect(hook.result.current.otherProject.isPending).toBe(true));
    expect(hook.result.current.inFlight).toBe(false);

    act(() => { hook.result.current.capex.mutate(); });
    await vi.waitFor(() => expect(hook.result.current.inFlight).toBe(true));
    await act(async () => { capex.resolve(); other.resolve(); });
    await vi.waitFor(() => expect(hook.result.current.inFlight).toBe(false));
  });
});

describe("useWriteFailureReport (CA-15)", () => {
  it("UT-COSTFLIGHT-003 while the screen is mounted the text goes to its banner, not a toast", () => {
    const { result } = renderHook(() => useWriteFailureReport("Land Lease"));
    const banner = vi.fn();
    result.current("Error: could not be saved. 403", banner);
    expect(banner).toHaveBeenCalledWith("Error: could not be saved. 403");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("UT-COSTFLIGHT-004 once the screen has unmounted the same text becomes the error toast", () => {
    const { result, unmount } = renderHook(() => useWriteFailureReport("Land Lease"));
    const report = result.current;
    unmount();
    const banner = vi.fn();
    report("Error: could not be saved. 403", banner);
    expect(banner).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith(
      COST_WRITE_MSG.failedAfterLeaving("Land Lease"), { detail: "Error: could not be saved. 403" },
    );
  });

  it("UT-COSTFLIGHT-005 with no screen surface it toasts even while mounted (the comments Save)", () => {
    const { result } = renderHook(() => useWriteFailureReport("DEVEX/CAPEX comments"));
    result.current("refused");
    expect(notifyError).toHaveBeenCalledWith(
      "A change on the DEVEX/CAPEX comments screen could not be saved.", { detail: "refused" },
    );
  });

  it("UT-COSTFLIGHT-006 a toaster that throws does not escape the caller's catch", () => {
    notifyError.mockImplementationOnce(() => { throw new Error("no toaster"); });
    const { result } = renderHook(() => useWriteFailureReport("Contracts"));
    expect(() => result.current("x")).not.toThrow();
  });

  it("UT-COSTFLIGHT-007 a write that fails after its screen unmounted is reported through the hook-level onError", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const write = deferred();
    const screen = renderHook(() => {
      const report = useWriteFailureReport("O&M");
      return useMutation({
        mutationKey: [...costWriteKey("p-1", "periods")],
        mutationFn: () => write.promise,
        onError: (e: Error) => report(e.message, () => undefined),
      });
    }, { wrapper: wrapperFor(client) });
    act(() => { screen.result.current.mutate(); });
    screen.unmount();
    await act(async () => { write.reject(new Error("HTTP 500")); });
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith(
      COST_WRITE_MSG.failedAfterLeaving("O&M"), { detail: "HTTP 500" },
    ));
  });
});
