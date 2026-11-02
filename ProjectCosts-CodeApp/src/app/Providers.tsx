import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashRouter, RouterProvider, useRouteError } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { AppToaster, ErrorBoundary } from "@/components";
import { vsbTheme } from "@/theme/fluent";
import { isRetryable } from "@/platform/errors";
import { attachQueryLog } from "./queryLog";
import { SessionProvider } from "./SessionContext";

/**
 * One query client for the app.
 *
 * `retry` deliberately does NOT retry a 403. The canvas app had no retry at all, so a
 * transient 500 looked like missing data; but retrying a permission refusal three times
 * just delays the message the user needs to see.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (attempt, error) => attempt < 2 && isRetryable(error),
      staleTime: 30 * 1000,
      // The Cost app is opened per project from a deep link and left open; refetching on
      // window focus is what keeps a second user's changes from being overwritten blindly.
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

// Every load and save prints one `[VSB] ACTION` summary line in the console (`app/queryLog.ts`).
attachQueryLog(queryClient);

/**
 * The app's router: a HASH data router.
 *
 * Hash routing, not browser routing, and deliberately. A published code app is served from a
 * path the Power Platform host owns, and we do not control its rewrite rules — so a browser-
 * history deep link like `/costs/contracts` would 404 on reload or on a shared link.
 * `vite.config.ts` also sets `base: "./"` for the same reason (absolute `/assets/...` URLs 404
 * under a sub-path), and relative asset URLs only resolve consistently if the path never
 * deepens. Hash routing satisfies both. Routes are `#/costs/contracts`, exactly as before.
 *
 * A DATA router (`createHashRouter` + `RouterProvider`, 20 Oct 2026), not `<HashRouter>`, because
 * only a data router supports `useBlocker` — which the shared unsaved-changes leave guard
 * (`components/UnsavedChangesGuard.tsx`, PO X1) needs. The route table is unchanged: it stays in
 * `app/routes.tsx` as `<Routes>` (lazy screens, `Suspense`, the gates) and is mounted under ONE
 * splat route here — React Router's documented first step for moving to `RouterProvider`, which
 * keeps every route, deep link and relative link behaving as it did under `<HashRouter>`.
 *
 * The element order inside the route is the old one: ErrorBoundary > SessionProvider > the app.
 * `errorElement` reuses the same boundary for anything React Router itself catches (it would
 * otherwise render its own development error page).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [router] = useState(() => createHashRouter([{
    path: "*",
    element: (
      <ErrorBoundary>
        <SessionProvider>{children}</SessionProvider>
      </ErrorBoundary>
    ),
    errorElement: <RouteError />,
  }]));
  return (
    <FluentProvider theme={vsbTheme} style={{ height: "100%" }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {/* The one toast region for `useNotify()` (the Application Settings screens' save notices). */}
        <AppToaster />
      </QueryClientProvider>
    </FluentProvider>
  );
}

/** A render error React Router caught before `ErrorBoundary` could: re-thrown into the boundary. */
function RouteError(): ReactNode {
  return <ErrorBoundary><Rethrow /></ErrorBoundary>;
}

function Rethrow(): ReactNode {
  const error = useRouteError();
  throw error instanceof Error ? error : new Error(String(error));
}
