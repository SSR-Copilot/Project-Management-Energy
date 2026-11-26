// @vitest-environment jsdom
/**
 * UT-GENWARM-LAZY-* — PA-11 / PB-09 (`GENERATORS_WARMUP_LAZY`): the Generators warm-up on intent.
 *
 * OFF (the default) is today's behaviour: the warm-up starts `GENERATORS_WARMUP_DELAY_MS` after a Project Management screen opens
 * (`generatorsWarmup.test.tsx`, UT-GENPERF-06x, stays as it is). ON: it starts when the person hovers or focuses the Generators
 * entry of the rail, or after `GENERATORS_WARMUP_IDLE_MS` on the screen; once per project; cancelled by leaving.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const spies = vi.hoisted(() => ({ chunk: vi.fn(async () => ({})), prefetch: vi.fn(async (_qc: unknown, _id: string) => undefined) }));
vi.mock("./screenLoaders", () => ({ loadGeneratorsScreen: spies.chunk }));
vi.mock("@/features/pm/generators/queries", () => ({ prefetchGenerators: spies.prefetch }));

import { resetBootDvopt, setBootDvoptForTests } from "@/data/bootDvoptFlags";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import {
  GENERATORS_NAV_TEST_ID, GENERATORS_WARMUP_DELAY_MS, GENERATORS_WARMUP_IDLE_MS, isGeneratorsIntentTarget,
  resetGeneratorsWarmup, useGeneratorsWarmup,
} from "./generatorsWarmup";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

let rail: HTMLElement;
let other: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  spies.chunk.mockClear();
  spies.prefetch.mockClear();
  resetGeneratorsWarmup();
  resetBootDvopt();
  setBootDvoptForTests({ generatorsWarmupLazy: true });
  rail = document.createElement("button");
  rail.setAttribute("data-testid", GENERATORS_NAV_TEST_ID);
  const icon = document.createElement("span");
  rail.appendChild(icon);
  other = document.createElement("button");
  other.setAttribute("data-testid", "rail-PlanningKey");
  document.body.append(rail, other);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  resetBootDvopt();
  setGeneratorsPerfFlags(null);
});

const hover = (el: Element) => el.dispatchEvent(new Event("pointerover", { bubbles: true }));
const focus = (el: Element) => el.dispatchEvent(new Event("focusin", { bubbles: true }));

describe("the intent target", () => {
  it("UT-GENWARM-LAZY-001 the Generators rail entry and anything inside it count; other entries and nothing do not", () => {
    expect(isGeneratorsIntentTarget(rail)).toBe(true);
    expect(isGeneratorsIntentTarget(rail.firstChild)).toBe(true);
    expect(isGeneratorsIntentTarget(other)).toBe(false);
    expect(isGeneratorsIntentTarget(null)).toBe(false);
    expect(isGeneratorsIntentTarget(document)).toBe(false);
  });
});

describe("GENERATORS_WARMUP_LAZY on", () => {
  it("UT-GENWARM-LAZY-010 nothing starts after the normal delay", async () => {
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_DELAY_MS + 100);
    expect(spies.chunk).not.toHaveBeenCalled();
    expect(spies.prefetch).not.toHaveBeenCalled();
  });

  it("UT-GENWARM-LAZY-011 hovering the Generators entry starts the chunk and the reads at once, once", async () => {
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    hover(other);
    await vi.advanceTimersByTimeAsync(10);
    expect(spies.prefetch).not.toHaveBeenCalled(); // another entry is no intent
    hover(rail.firstChild as Element);
    await vi.advanceTimersByTimeAsync(10);
    hover(rail);
    focus(rail);
    await vi.advanceTimersByTimeAsync(10);
    expect(spies.chunk).toHaveBeenCalledTimes(1);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
    expect(spies.prefetch.mock.calls[0]![1]).toBe(ID);
  });

  it("UT-GENWARM-LAZY-012 focusing the entry (keyboard) is intent too", async () => {
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    focus(rail);
    await vi.advanceTimersByTimeAsync(10);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
  });

  it("UT-GENWARM-LAZY-013 with no intent the warm-up still starts after the idle delay, not before", async () => {
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_IDLE_MS - 100);
    expect(spies.prefetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(spies.chunk).toHaveBeenCalledTimes(1);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
  });

  it("UT-GENWARM-LAZY-014 leaving cancels both the idle timer and the listeners", async () => {
    const { unmount } = renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    unmount();
    hover(rail);
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_IDLE_MS + 100);
    expect(spies.prefetch).not.toHaveBeenCalled();
  });

  it("UT-GENWARM-LAZY-015 once per project: after an intent start a move to another screen and a second hover start nothing", async () => {
    const { rerender } = renderHook(({ path }: { path: string }) => useGeneratorsWarmup(ID, path), { wrapper, initialProps: { path: "/project/general" } });
    hover(rail);
    await vi.advanceTimersByTimeAsync(10);
    rerender({ path: "/project/milestones" });
    hover(rail);
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_IDLE_MS + 100);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
  });

  it("UT-GENWARM-LAZY-016 the Generators screen itself, no project and the D141 prefetch switch off never start it, intent or not", async () => {
    renderHook(() => useGeneratorsWarmup(ID, "/project/generators"), { wrapper });
    renderHook(() => useGeneratorsWarmup(undefined, "/project/general"), { wrapper });
    setGeneratorsPerfFlags({ prefetch: false });
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    hover(rail);
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_IDLE_MS + 100);
    expect(spies.prefetch).not.toHaveBeenCalled();
  });
});

describe("GENERATORS_WARMUP_LAZY off (the default)", () => {
  it("UT-GENWARM-LAZY-020 today's behaviour exactly: it starts after the normal delay, with no listener on the rail", async () => {
    setBootDvoptForTests({ generatorsWarmupLazy: false });
    renderHook(() => useGeneratorsWarmup(ID, "/project/general"), { wrapper });
    await vi.advanceTimersByTimeAsync(GENERATORS_WARMUP_DELAY_MS - 100);
    expect(spies.prefetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
  });

  it("UT-GENWARM-LAZY-021 the shipped default is OFF", async () => {
    resetBootDvopt();
    const { bootDvopt } = await import("@/data/bootDvoptFlags");
    expect(bootDvopt().generatorsWarmupLazy).toBe(false);
  });
});
