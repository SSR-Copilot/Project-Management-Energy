/**
 * T-C03: the app frame's one call for the rail's intent prefetch. Deliberately tiny: the listeners, the dwell and what an intent starts are
 * in `intentPrefetch.ts` / `intentStart.ts`, loaded on demand after the first render, so the start-up bundle does not carry them.
 * With both intent switches OFF nothing is loaded and no listener is registered.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { entryPrefetch } from "@/data/entryPrefetchFlags";

export function useRailIntentPrefetch(projectId: string | undefined, pathname: string): void {
  const qc = useQueryClient();
  useEffect(() => {
    const flags = entryPrefetch();
    if (!flags.intentChunks && !flags.intentData) return undefined;
    let cancelled = false;
    let detach: (() => void) | undefined;
    import("./intentPrefetch").then((m) => {
      if (!cancelled) detach = m.attachRailIntent(qc, projectId, pathname);
    }).catch(() => undefined);
    return () => { cancelled = true; detach?.(); };
  }, [qc, projectId, pathname]);
}
