/** H1 — query health summary (TanStack v5 semantics). */
import { describe, expect, it, vi } from "vitest";
import { computeQueryHealth } from "./useQueryHealth";

const q = (over: Partial<{ isPending: boolean; isError: boolean; data: unknown; error: unknown }> = {}) => ({
  isPending: false, isError: false, data: [] as unknown, error: null as unknown,
  refetch: vi.fn(() => Promise.resolve({} as never)),
  ...over,
});

describe("computeQueryHealth (H1)", () => {
  it("pending → loading", () => {
    expect(computeQueryHealth([q(), q({ isPending: true, data: undefined })]).phase).toBe("loading");
  });

  it("error without data → fatal with the first such error", () => {
    const e1 = new Error("a");
    const h = computeQueryHealth([q(), q({ isError: true, data: undefined, error: e1 }), q({ isError: true, data: undefined, error: new Error("b") })]);
    expect(h.phase).toBe("fatal");
    expect(h.fatalError).toBe(e1);
    expect(h.staleError).toBeUndefined();
  });

  it("error with data → ready with staleError", () => {
    const e = new Error("refetch failed");
    const h = computeQueryHealth([q(), q({ isError: true, data: [1], error: e })]);
    expect(h.phase).toBe("ready");
    expect(h.staleError).toBe(e);
    expect(h.fatalError).toBeUndefined();
  });

  it("loading wins over fatal (pending checked first)", () => {
    expect(computeQueryHealth([q({ isPending: true, data: undefined }), q({ isError: true, data: undefined })]).phase).toBe("loading");
  });

  it("all fine → ready, no errors", () => {
    const h = computeQueryHealth([q(), q()]);
    expect(h).toMatchObject({ phase: "ready" });
    expect(h.fatalError).toBeUndefined();
  });

  it("retryFailed refetches only errored queries; retryAll refetches all", () => {
    const ok = q();
    const bad = q({ isError: true, data: undefined });
    const h = computeQueryHealth([ok, bad]);
    h.retryFailed();
    expect(ok.refetch).not.toHaveBeenCalled();
    expect(bad.refetch).toHaveBeenCalledTimes(1);
    h.retryAll();
    expect(ok.refetch).toHaveBeenCalledTimes(1);
    expect(bad.refetch).toHaveBeenCalledTimes(2);
  });
});

describe("computeQueryHealth Wave C options", () => {
  it("fatalWhen 'any-error': a failed refetch WITH data is fatal; first failing query wins; no staleError", () => {
    const e1 = new Error("refetch failed");
    const e2 = new Error("no data");
    const h = computeQueryHealth([q(), q({ isError: true, data: [1], error: e1 }), q({ isError: true, data: undefined, error: e2 })], { fatalWhen: "any-error" });
    expect(h.phase).toBe("fatal");
    expect(h.fatalError).toBe(e1);
    expect(h.staleError).toBeUndefined();
  });

  it("fatalWhen 'any-error': loading still wins; all fine → ready", () => {
    expect(computeQueryHealth([q({ isPending: true, data: undefined }), q({ isError: true, data: [1] })], { fatalWhen: "any-error" }).phase).toBe("loading");
    expect(computeQueryHealth([q(), q()], { fatalWhen: "any-error" }).phase).toBe("ready");
  });

  it("default options are unchanged by the new parameter", () => {
    const e = new Error("x");
    expect(computeQueryHealth([q({ isError: true, data: [1], error: e })], {})).toMatchObject({ phase: "ready", staleError: e });
  });

  it("loadingWhen 'isLoading': a pending-but-idle (disabled) query is not loading; isLoading is", () => {
    const idle = { ...q({ isPending: true, data: undefined }), isLoading: false };
    const fetching = { ...q({ isPending: true, data: undefined }), isLoading: true };
    expect(computeQueryHealth([idle]).phase).toBe("loading");
    expect(computeQueryHealth([idle], { loadingWhen: "isLoading" }).phase).toBe("ready");
    expect(computeQueryHealth([fetching], { loadingWhen: "isLoading" }).phase).toBe("loading");
    // Without an `isLoading` flag it falls back to `isPending`.
    expect(computeQueryHealth([q({ isPending: true })], { loadingWhen: "isLoading" }).phase).toBe("loading");
  });

  it("matches the screens' old projections (isLoading + data hidden on error) for every flag combination", () => {
    const project = (x: ReturnType<typeof q> & { isLoading: boolean }) => ({ ...x, isPending: x.isLoading, data: x.isError ? undefined : x.data });
    for (const isLoading of [false, true]) for (const isError of [false, true]) for (const data of [undefined, [1]]) {
      const query = { ...q({ isPending: isLoading || data === undefined, isError, data, error: isError ? new Error("e") : null }), isLoading };
      const before = computeQueryHealth([project(query)]);
      const now = computeQueryHealth([query], { fatalWhen: "any-error", loadingWhen: "isLoading" });
      expect({ phase: now.phase, fatalError: now.fatalError, staleError: now.staleError })
        .toEqual({ phase: before.phase, fatalError: before.fatalError, staleError: before.staleError });
    }
  });
});
