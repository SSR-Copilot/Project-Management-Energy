// @vitest-environment jsdom
/**
 * UT-GENPERF-061.. — the Generators warm-up (D141, `GENERATORS_PERF.prefetch`): once a project's Project Management screen has been
 * open for `GENERATORS_WARMUP_DELAY_MS`, the Generators chunk and its independent reads start, once per project; never on the
 * Generators screen itself, never without a project, never with the switch off, and leaving the screen cancels it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const spies = vi.hoisted(() => ({ chunk: vi.fn(async () => ({})), prefetch: vi.fn(async (_qc: unknown, _id: string) => undefined) }));
vi.mock("./screenLoaders", () => ({ loadGeneratorsScreen: spies.chunk }));
vi.mock("@/features/pm/generators/queries", () => ({ prefetchGenerators: spies.prefetch }));

import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import {
  GENERATORS_WARMUP_DELAY_MS, resetGeneratorsWarmup, shouldWarmGenerators, useGeneratorsWarmup,
} from "./generatorsWarmup";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

beforeEach(() => {
  vi.useFakeTimers();
  spies.chunk.mockClear();
  spies.prefetch.mockClear();
  resetGeneratorsWarmup();
});
afterEach(() => {
  vi.useRealTimers();
  setGeneratorsPerfFlags(null);
});

const flush = async () => { await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_DELAY_MS + 10); };

describe("shouldWarmGenerators", () => {
  it("UT-GENPERF-061 warm only with the switch on, a project, a screen other than Generators, and not twice", () => {
    const base = { projectId: ID, pathname: "/project/general", prefetch: true, alreadyWarmed: false };
    expect(shouldWarmGenerators(base)).toBe(true);
    expect(shouldWarmGenerators({ ...base, prefetch: false })).toBe(false);
    expect(shouldWarmGenerators({ ...base, projectId: undefined })).toBe(false);
    expect(shouldWarmGenerators({ ...base, pathname: "/project/generators" })).toBe(false);
    expect(shouldWarmGenerators({ ...base, alreadyWarmed: true })).toBe(false);
  });
});

describe("useGeneratorsWarmup", () => {
  it("UT-GENPERF-062 starts the chunk and the reads after the delay, not before", async () => {
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_DELAY_MS - 100);
    expect(spies.prefetch).not.toHaveBeenCalled();
    await flush();
    expect(spies.chunk).toHaveBeenCalledTimes(1);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
    expect(spies.prefetch.mock.calls[0]![1]).toBe(ID);
  });

  it("UT-GENPERF-063 once per project: moving to another Project Management screen of the same project does not start it again", async () => {
    const { rerender } = renderHook(({ path }: { path: string }) => useGeneratorsWarmup(ID, path), { wrapper, initialProps: { path: "/project/general" } });
    await flush();
    rerender({ path: "/project/milestones" });
    await flush();
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
  });

  it("UT-GENPERF-064 leaving before the delay cancels it; the Generators screen, no project and the switch off never start it", async () => {
    const first = renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    first.unmount();
    await flush();
    expect(spies.prefetch).not.toHaveBeenCalled();
    renderHook(() => useGeneratorsWarmup(ID, "/project/generators"), { wrapper });
    renderHook(() => useGeneratorsWarmup(undefined, "/project/general"), { wrapper });
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    await flush();
    expect(spies.prefetch).not.toHaveBeenCalled();
    expect(spies.chunk).not.toHaveBeenCalled();
  });
});
