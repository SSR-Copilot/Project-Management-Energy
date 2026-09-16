/**
 * Application root.
 *
 * One React app serves both canvas apps. `/project/*` and `/projects` are the Project
 * Management app; `/costs/*` is the Project Costs app. They share the shell, the theme,
 * the component library and the data layer, which is the main structural gain over two
 * separate canvas apps that duplicated `cmp_Header`, `cmp_Left_Navigation`,
 * `cmp_PopUp_*` and `fn_Numeric` between them.
 */
import { useEffect, useMemo } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { vsbLightTheme, vsbDarkTheme } from "./theme/fluentTheme";
import { useAppStore } from "./store/appStore";
import { useBootstrap } from "./platform/bootstrap";
import { AppShell, AppHeader, LeftNav, LoadingOverlay, ReportErrorPanel, ErrorBoundary } from "./components";
import { PM_NAV, PM_ADMIN_NAV, COST_NAV } from "./domain/navigation";
import { ADMIN_PAGE_TITLE } from "./domain/session";
import { AppRoutes } from "./routes/AppRoutes";
import { PowerProvider } from "./PowerProvider";
import { toAppError, toReportError } from "./platform/errors";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => toAppError(error).isRetryable && count < 2,
    },
    mutations: {
      onError: (error) => {
        const ae = toAppError(error);
        const st = useAppStore.getState();
        st.setLastError(toReportError(ae, st.session.user?.mail ?? "", location.hash));
      },
    },
  },
});

function useResolvedTheme() {
  const pref = useAppStore((s) => s.ui.theme);
  return useMemo(() => {
    if (pref === "dark") return vsbDarkTheme;
    if (pref === "light") return vsbLightTheme;
    const dark = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return dark ? vsbDarkTheme : vsbLightTheme;
  }, [pref]);
}

/**
 * The two screens the build spec names as rendering no chrome of their own: App Loading and
 * Project Main. They get the full viewport width and no rail — the portfolio grid is 13
 * columns wide and a docked 200px rail costs it two of them. Every other route keeps the
 * canvas geometry unchanged.
 */
function isFullWidthRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/projects";
}

function Shell() {
  const loc = useLocation();
  const isCost = loc.pathname.startsWith("/costs");
  const isAdmin = loc.pathname.startsWith("/admin");
  const fullWidth = isFullWidthRoute(loc.pathname);
  const boot = useBootstrap();
  const setUser = useAppStore((s) => s.setUser);
  const setEnv = useAppStore((s) => s.setEnv);

  useEffect(() => {
    if (boot.data) {
      setUser(boot.data.user);
      setEnv(boot.data.env);
    }
  }, [boot.data, setUser, setEnv]);

  // gblAppStarted === boot.isSuccess. The canvas app polled a 500ms timer for this.
  if (boot.isPending) return <LoadingOverlay mode="inline" label="Signing you in…" />;

  return (
    <>
      <AppShell
        header={
          <AppHeader
            appName={isCost ? "Project Costs" : "Project Management"}
            // No rail here, so the hamburger would open an empty drawer.
            showNavButton={!fullWidth}
            // Every screen reached FROM the portfolio list has a back arrow; the list does not.
            showBack={!fullWidth}
            pageTitle={ADMIN_PAGE_TITLE[loc.pathname]}
          />
        }
        bleed={fullWidth}
        rail={
          fullWidth ? undefined : isAdmin ? (
            // The canvas admin screens swap the rail for `LeftAdminNavigationMenu` entirely;
            // they do not show the project rail. No group heading — the two parent rows
            // ("Project Gate", "Standard Assumptions") are the headings.
            <LeftNav items={PM_ADMIN_NAV} groupLabel="" />
          ) : isCost ? (
            <LeftNav items={COST_NAV} groupLabel="Costs" />
          ) : (
            // No `adminItems`: the canvas `LeftNavigationMenu` carries no admin entries, and
            // the admin section is reached only from the user badge.
            <LeftNav
              items={PM_NAV}
              groupLabel="Project"
              showCompletion
              requiresProject
            />
          )
        }
      >
        <ErrorBoundary screenName={loc.pathname}>
          <AppRoutes />
        </ErrorBoundary>
      </AppShell>
      <ReportErrorPanel />
    </>
  );
}

export function App() {
  const theme = useResolvedTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={theme} style={{ height: "100dvh" }}>
        {/* Inside FluentProvider so its own pending state is themed; outside HashRouter so
            the SDK handshake happens once, above the route tree, not per navigation. */}
        <PowerProvider>
          <HashRouter>
            <Routes>
              <Route path="/*" element={<Shell />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </PowerProvider>
      </FluentProvider>
    </QueryClientProvider>
  );
}
