// @vitest-environment jsdom
/**
 * OPT-29 (B8): `useMediaQuery`'s `subscribe` is stable per query, so React keeps the `matchMedia` listener across re-renders. The OLD hook is
 * copied here as the oracle: with it every re-render removed and re-added the listener.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { useMediaQuery } from "./useMediaQuery";

function installMatchMedia() {
  const listeners = new Set<() => void>();
  const stats = { added: 0, removed: 0, matches: false };
  window.matchMedia = ((query: string) => ({
    matches: stats.matches, media: query,
    addEventListener: (_t: string, l: () => void) => { stats.added += 1; listeners.add(l); },
    removeEventListener: (_t: string, l: () => void) => { stats.removed += 1; listeners.delete(l); },
  })) as unknown as typeof window.matchMedia;
  return { stats, fire: () => listeners.forEach((l) => l()), live: () => listeners.size };
}

/** The old hook, verbatim: a new `subscribe` closure on every render. */
function useOldMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; });

describe("useMediaQuery subscribes once per query (OPT-29)", () => {
  it("UT-MEDIAQUERY-OPT-001 five re-renders add the listener once (OLD: once per render)", () => {
    const old = installMatchMedia();
    const oldHook = renderHook(() => useOldMediaQuery("(max-width: 959px)"));
    for (let i = 0; i < 5; i++) oldHook.rerender();
    expect(old.stats.added).toBeGreaterThan(1);
    oldHook.unmount();

    const neu = installMatchMedia();
    const { result, rerender, unmount } = renderHook(() => useMediaQuery("(max-width: 959px)"));
    for (let i = 0; i < 5; i++) rerender();
    expect(neu.stats.added).toBe(1);
    expect(neu.stats.removed).toBe(0);
    expect(result.current).toBe(false);
    unmount();
    expect(neu.stats.removed).toBe(1);
    expect(neu.live()).toBe(0);
  });

  it("UT-MEDIAQUERY-OPT-002 a change still updates the value, and a new query re-subscribes", () => {
    const m = installMatchMedia();
    const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), { initialProps: { q: "(max-width: 959px)" } });
    expect(result.current).toBe(false);
    m.stats.matches = true;
    act(() => m.fire());
    expect(result.current).toBe(true);
    rerender({ q: "(max-width: 600px)" });
    expect(m.stats.added).toBe(2);
    expect(m.stats.removed).toBe(1);
  });

  it("UT-MEDIAQUERY-OPT-003 without matchMedia it reports false and subscribes to nothing", () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    const { result, unmount } = renderHook(() => useMediaQuery("(max-width: 959px)"));
    expect(result.current).toBe(false);
    expect(() => unmount()).not.toThrow();
    vi.restoreAllMocks();
  });
});
