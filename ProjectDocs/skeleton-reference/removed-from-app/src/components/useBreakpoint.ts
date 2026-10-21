/** Reactive breakpoint state. New — the canvas apps were fixed-width. */
import { useSyncExternalStore } from "react";
import { breakpoints } from "@/theme/tokens";

const queries = {
  belowMd: `(max-width: ${breakpoints.md - 1}px)`,
  belowLg: `(max-width: ${breakpoints.lg - 1}px)`,
  belowXl: `(max-width: ${breakpoints.xl - 1}px)`,
  atLeastMd: `(min-width: ${breakpoints.md}px)`,
  atLeastLg: `(min-width: ${breakpoints.lg}px)`,
  atLeastXl: `(min-width: ${breakpoints.xl}px)`,
  touch: "(hover: none) and (pointer: coarse)",
} as const;

type Key = keyof typeof queries;
export type Breakpoints = Record<Key, boolean>;

const keys = Object.keys(queries) as Key[];
let snapshot: Breakpoints = compute();
const listeners = new Set<() => void>();

function compute(): Breakpoints {
  const out = {} as Breakpoints;
  for (const k of keys) {
    out[k] = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(queries[k]).matches
      : k === "atLeastMd" || k === "atLeastLg" || k === "atLeastXl";
  }
  return out;
}

function refresh() {
  const next = compute();
  if (keys.some((k) => next[k] !== snapshot[k])) {
    snapshot = next;
    listeners.forEach((l) => l());
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1 && typeof window !== "undefined" && window.matchMedia) {
    for (const k of keys) window.matchMedia(queries[k]).addEventListener("change", refresh);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && typeof window !== "undefined" && window.matchMedia) {
      for (const k of keys) window.matchMedia(queries[k]).removeEventListener("change", refresh);
    }
  };
}

export function useBreakpoint(): Breakpoints {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
