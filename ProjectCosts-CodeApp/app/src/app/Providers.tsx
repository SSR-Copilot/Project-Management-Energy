import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components";
import { vsbTheme } from "@/theme/fluent";
import { isRetryable } from "@/platform/errors";
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

export function Providers({ children }: { children: ReactNode }) {
  return (
    <FluentProvider theme={vsbTheme} style={{ height: "100%" }}>
      <QueryClientProvider client={queryClient}>
        {/*
          HashRouter, not BrowserRouter, and deliberately.

          A published code app is served from a path the Power Platform host owns, and we do
          not control its rewrite rules — so a BrowserRouter deep link like
          `/costs/contracts` would 404 on reload or on a shared link. `vite.config.ts` also
          sets `base: "./"` for the same reason (absolute `/assets/...` URLs 404 under a
          sub-path), and relative asset URLs only resolve consistently if the path never
          deepens. Hash routing satisfies both. Routes become `#/costs/contracts`.
        */}
        <HashRouter>
          <ErrorBoundary>
            <SessionProvider>{children}</SessionProvider>
          </ErrorBoundary>
        </HashRouter>
      </QueryClientProvider>
    </FluentProvider>
  );
}
