// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { BUSY_SELECTOR, E2E_FLAG_KEY, installE2EHook, queryLabel } from "./e2eHook";
import { resetRequestLog } from "./requestLog";

let info: ReturnType<typeof vi.spyOn>;
let client: QueryClient;
let uninstall: (() => void) | undefined;

const lines = (spy: ReturnType<typeof vi.spyOn>): string[] => spy.mock.calls.map((c: unknown[]) => String(c[0]));

/** A promise the test settles by hand, so a query or mutation stays in flight as long as needed. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  resetRequestLog();
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  window.localStorage.clear();
  delete window.__vsbIdle;
  delete window.__vsbBusy;
  uninstall = undefined;
});

afterEach(() => {
  uninstall?.();
  client.clear();
  document.body.innerHTML = "";
  window.localStorage.clear();
  delete window.__vsbIdle;
  vi.restoreAllMocks();
});

describe("installE2EHook (D80, test-only idle hook)", () => {
  it("UT-E2EHOOK-001 Without the flag: no __vsbIdle and no console line", () => {
    uninstall = installE2EHook(client, window);
    expect(window.__vsbIdle).toBeUndefined();
    expect(lines(info).filter((l) => l.includes("e2e hook"))).toHaveLength(0);
  });

  it("UT-E2EHOOK-002 A flag other than \"1\" leaves it disabled", () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "true");
    uninstall = installE2EHook(client, window);
    expect(window.__vsbIdle).toBeUndefined();
  });

  it("UT-E2EHOOK-003 With the flag and nothing in flight: __vsbIdle() is true", () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    uninstall = installE2EHook(client, window);
    expect(typeof window.__vsbIdle).toBe("function");
    expect(window.__vsbIdle?.()).toBe(true);
  });

  it("UT-E2EHOOK-004 False while a query is fetching, true again once it settles", async () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    uninstall = installE2EHook(client, window);
    const d = deferred<number>();
    const fetching = client.fetchQuery({ queryKey: ["e2e-hook"], queryFn: () => d.promise });
    expect(window.__vsbIdle?.()).toBe(false);
    d.resolve(1);
    await fetching;
    expect(window.__vsbIdle?.()).toBe(true);
  });

  it("UT-E2EHOOK-005 False while a mutation is pending, true again once it settles", async () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    uninstall = installE2EHook(client, window);
    const d = deferred<number>();
    const observer = new MutationObserver(client, { mutationFn: () => d.promise });
    const pending = observer.mutate();
    expect(window.__vsbIdle?.()).toBe(false);
    d.resolve(1);
    await pending;
    expect(window.__vsbIdle?.()).toBe(true);
  });

  it("UT-E2EHOOK-006 False while an element marked data-vsb-busy=\"true\" is in the page", () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    uninstall = installE2EHook(client, window);
    const busy = document.createElement("div");
    busy.setAttribute("data-vsb-busy", "true");
    document.body.appendChild(busy);
    expect(document.querySelector(BUSY_SELECTOR)).toBe(busy);
    expect(window.__vsbIdle?.()).toBe(false);
    busy.remove();
    expect(window.__vsbIdle?.()).toBe(true);
  });

  it("UT-E2EHOOK-007 Storage that throws: disabled, and install does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage blocked");
    });
    expect(() => { uninstall = installE2EHook(client, window); }).not.toThrow();
    expect(window.__vsbIdle).toBeUndefined();
    expect(() => uninstall?.()).not.toThrow();
  });

  it("UT-E2EHOOK-008 The uninstall function removes __vsbIdle", () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    const off = installE2EHook(client, window);
    expect(window.__vsbIdle).toBeDefined();
    off();
    expect(window.__vsbIdle).toBeUndefined();
    expect("__vsbIdle" in window).toBe(false);
  });

  it("UT-E2EHOOK-009 Uninstall leaves a later install's function in place", () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    const first = installE2EHook(client, window);
    const second = installE2EHook(new QueryClient(), window);
    const current = window.__vsbIdle;
    first();
    expect(window.__vsbIdle).toBe(current);
    second();
    expect(window.__vsbIdle).toBeUndefined();
  });

  it("UT-E2EHOOK-010 Enabled: exactly one [VSB] ACTION console line", () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    uninstall = installE2EHook(client, window);
    const hookLines = lines(info).filter((l) => l.includes("e2e hook"));
    expect(hookLines).toEqual(["[VSB] ACTION e2e hook enabled"]);
  });

  it("UT-E2EHOOK-011 No global window (a node environment): disabled, no throw", () => {
    const realWindow = window;
    realWindow.localStorage.setItem(E2E_FLAG_KEY, "1");
    // The default `win` argument reads the global `window`; without one the hook must stay off.
    vi.stubGlobal("window", undefined);
    try {
      expect(() => installE2EHook(client)()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(realWindow.__vsbIdle).toBeUndefined();
    expect(lines(info).filter((l) => l.includes("e2e hook"))).toHaveLength(0);
  });

  it("UT-E2EHOOK-012 __vsbBusy names what is in flight: counts and each fetching query's label, never an id", async () => {
    window.localStorage.setItem(E2E_FLAG_KEY, "1");
    uninstall = installE2EHook(client, window);
    expect(window.__vsbBusy?.()).toEqual({ fetching: 0, mutating: 0, overlay: false, queries: [] });
    const d = deferred<number>();
    const fetching = client.fetchQuery({ queryKey: ["landLeaseCosts", "0f8e9a2c-1b2c-4d5e-8f90-123456789abc"], queryFn: () => d.promise });
    expect(window.__vsbBusy?.()).toEqual({ fetching: 1, mutating: 0, overlay: false, queries: ["landLeaseCosts"] });
    d.resolve(1);
    await fetching;
    expect(window.__vsbBusy?.().queries).toEqual([]);
    expect(queryLabel(["0f8e9a2c-1b2c-4d5e-8f90-123456789abc"])).toBe("?");
    expect(queryLabel([{ id: 1 }])).toBe("?");
    uninstall();
    expect(window.__vsbBusy).toBeUndefined();
  });
});