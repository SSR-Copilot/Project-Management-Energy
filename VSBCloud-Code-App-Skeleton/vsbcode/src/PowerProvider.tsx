/**
 * PowerProvider — the initialisation gate `pac code push` expects to find at the app root.
 *
 * This *hoists* existing behaviour rather than adding new. `setConfig` + `getContext` are
 * already called today, but lazily and from deep inside the router:
 *
 *   useBootstrap() → bootstrap() → readEnvironment() → ensureInitialized()
 *
 * which means the first Dataverse call races the SDK handshake. Doing it here puts it above
 * the render tree, where it belongs, and gives the toolchain the file it looks for.
 *
 * In mock mode this is a pass-through, deliberately. `readEnvironment()` short-circuits to a
 * canned Demo User and `getContext()` is never reached, so `npm run dev` must keep working
 * with no environment attached — calling `ensureInitialized()` there would hang on a
 * handshake that has nothing to talk to.
 */
import { useEffect, useState, type ReactNode } from "react";
import { dataMode, ensureInitialized } from "@/platform/powerClient";
import { LoadingOverlay } from "@/components";
import { toAppError } from "@/platform/errors";

export interface PowerProviderProps {
  children: ReactNode;
}

type InitState =
  | { phase: "ready" }
  | { phase: "pending" }
  | { phase: "failed"; message: string };

export function PowerProvider({ children }: PowerProviderProps) {
  // Mock mode is ready on the first render — no effect, no flash of the overlay.
  const [state, setState] = useState<InitState>(() =>
    dataMode === "mock" ? { phase: "ready" } : { phase: "pending" },
  );

  useEffect(() => {
    if (dataMode === "mock") return;
    let cancelled = false;
    ensureInitialized().then(
      () => { if (!cancelled) setState({ phase: "ready" }); },
      (e: unknown) => {
        if (!cancelled) setState({ phase: "failed", message: toAppError(e).message });
      },
    );
    return () => { cancelled = true; };
  }, []);

  if (state.phase === "pending") {
    return <LoadingOverlay mode="inline" label="Connecting to Power Platform…" />;
  }

  if (state.phase === "failed") {
    // No retry button: `ensureInitialized` clears its cached promise on rejection, so a
    // reload is the only honest recovery — the host page itself may not be an app frame.
    return (
      <LoadingOverlay
        mode="inline"
        label={`Could not reach the Power Platform host. ${state.message}`}
      />
    );
  }

  return <>{children}</>;
}
