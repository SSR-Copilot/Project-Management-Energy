/**
 * H3 — the open side panel of a settings screen, its remount key and its save error.
 *
 * Every screen keeps `{ panel, panelKey, panelError }` and the same open / close steps
 * (CAPEX Accounts `Screen.tsx:148-158`, Check List Settings, Contracts, Costs, Milestones, Project
 * Gates). `open` bumps `key` so the panel remounts with a fresh seed and clears the error; `close`
 * clears both. Screen-specific flags (CAPEX `duplicate`, Contracts `linksIncomplete`) live in `P`
 * or stay local.
 */
import { useCallback, useState } from "react";

export interface PanelState<P> {
  panel: P | null;
  /** Increments on every `open`; pass it as the panel's React `key`. */
  key: number;
  open(p: P): void;
  patch(update: Partial<P> | ((p: P) => P)): void;
  close(): void;
  error: string | undefined;
  setError(message: string | undefined): void;
}

export function usePanelState<P>(): PanelState<P> {
  const [panel, setPanel] = useState<P | null>(null);
  const [key, setKey] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const open = useCallback((p: P) => {
    setError(undefined);
    setKey((k) => k + 1);
    setPanel(p);
  }, []);
  const patch = useCallback((update: Partial<P> | ((p: P) => P)) => {
    setPanel((prev) => {
      if (prev === null) return prev;
      return typeof update === "function" ? (update as (p: P) => P)(prev) : { ...prev, ...update };
    });
  }, []);
  const close = useCallback(() => {
    setPanel(null);
    setError(undefined);
  }, []);

  return { panel, key, open, patch, close, error, setError };
}
