import { useSyncExternalStore } from "react";

/**
 * `window.matchMedia(query).matches`, kept live. Replaces Contracts' local `useNarrow`
 * (`contracts/Screen.tsx`). Without `matchMedia` (old jsdom, SSR) it reports `false`, which is
 * the wide layout — the same fallback the local hook had.
 */
export function useMediaQuery(query: string): boolean {
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

/** Below 960 px the settings picker becomes a dropdown pair (Contracts 03-responsive-layout §3). */
export const NARROW_PICKER_QUERY = "(max-width: 959px)";
