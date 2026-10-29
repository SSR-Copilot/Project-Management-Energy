/**
 * CA-15 — the Cost write state that outlives the screen which started the write.
 *
 * D57 removed the pop-up scrim that also covered the rail and the header, so a user can now leave
 * a Cost screen while its write still runs. Two things then went wrong, and these hooks close
 * them:
 *  - a screen re-opened mid-write got a fresh mutation observer, so its guard read "nothing
 *    pending" and a second write could start on the same rows. `useCostWriteInFlight` counts every
 *    Cost write of the project in the `QueryClient`'s mutation cache, which outlives every route;
 *  - the write's error banner belonged to the screen that was left, so a failure showed nowhere.
 *    `useWriteFailureReport` sends it to the screen while the screen is mounted, and to the
 *    app-wide error toast once it is gone.
 *
 * The decisions are pure and tested in `@/domain/writeGuard`; this file is only the wiring.
 */
import { useCallback, useEffect, useRef } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { useNotify } from "@/components/useNotify";
import {
  costWriteKey, leftScreenFailureToast, writeFailureSurface, type CostScreenName,
} from "@/domain/writeGuard";

/** True while any Cost write of `projectId` is pending, whichever screen (or visit) started it. */
export function useCostWriteInFlight(projectId: string | undefined): boolean {
  return useIsMutating({ mutationKey: [...costWriteKey(projectId)] }) > 0;
}

/**
 * `report(text, showOnScreen)` for a failed Cost write. `text` is the screen's OWN error text
 * (what its banner says). While the calling screen is mounted, `showOnScreen(text)` shows it
 * there; once the screen has unmounted (or when no `showOnScreen` is given) it becomes an error
 * toast naming `screen`. Never throws: it is called from `catch` blocks.
 *
 * The returned function reads the mounted flag when it is CALLED, so an `await` that settles
 * after the user left still reports to the toast.
 */
export function useWriteFailureReport(screen: CostScreenName) {
  // `<AppToaster />` is mounted once by `app/Providers.tsx`, so this still shows after the screen
  // that owns the hook has gone (the same reason `useSaveAddCostSheet` keeps its own `notify`).
  const notify = useNotify();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useCallback((text: string, showOnScreen?: (text: string) => void) => {
    const surface = writeFailureSurface({
      screenMounted: mounted.current, hasScreenSurface: showOnScreen !== undefined,
    });
    try {
      if (surface === "screen" && showOnScreen) { showOnScreen(text); return; }
      const toast = leftScreenFailureToast(screen, text);
      notify.error(toast.message, { detail: toast.detail });
    } catch {
      // A failed report must not turn the caller's `catch` into an unhandled rejection.
    }
  }, [notify, screen]);
}
