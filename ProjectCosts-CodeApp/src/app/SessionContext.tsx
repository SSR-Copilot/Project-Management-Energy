/**
 * What `App.OnStart` used to establish, done once and shared.
 *
 * The canvas `OnStart` ran ~40 sequential statements before the first screen appeared: five
 * environment-variable lookups, a project lookup, the current user's profile, their teams,
 * their roles, and several empty `Collect(col, Blank())` calls whose only purpose was to give
 * a collection a schema. Two of those five environment variables are free on `IContext`, the
 * schema-priming collections have no analogue, and the rest run in parallel.
 *
 * `projectId` comes from the deep link. There is deliberately NO fallback to a hard-coded
 * project — see `ProjectDocs/app-docs/01-BUGS-FOUND.md` A-2.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { startupFlags } from "./startupFlags";
import { startAppInsights } from "@/appInsights";
import { readSession, readProjectLink, type Session } from "@/platform/powerClient";
import { applyEnvironmentName } from "@/platform/consoleGate";
import { loadEnvironmentVariables, loadProject, type EnvVars, type ProjectLoadScope } from "@/data/project";
import { projectStateLookup } from "@/data/projectStateLookup";
import { qk } from "@/data/keys";
import { localeInfo } from "@/domain/locale";
import type { ProjectContext } from "@/features/cost/contracts/rules";
import { launchPmPath } from "./deepLinks";
import { sessionProjectScope } from "./bootPlan";
import { projectManagementAppUrl } from "./navigation";

export interface AppSession {
  session?: Session;
  envVars: EnvVars;
  project?: ProjectContext;
  /** Undefined when the app was opened without a `projectId` deep-link parameter. */
  projectId?: string;
  /** The BCP-47 tag every `Intl` call in the app uses. */
  locale: string;
  /** The link back to the Project Management canvas app. */
  pmAppUrl?: string;
  loading: boolean;
  /** True when a `projectId` was supplied but no readable project matched it. */
  projectNotFound: boolean;
  projectIdInvalid?: boolean;
  error?: unknown;
}

const SessionCtx = createContext<AppSession | undefined>(undefined);

/*
 * The session, the environment variables and the deep-linked project, as query options: the
 * provider below and the boot prefetch (`app/bootPrefetch.ts`) both build their queries here, so a
 * prefetch lands under exactly the key the provider reads.
 */
export const sessionQueryOptions = () => queryOptions({
  queryKey: qk.session,
  queryFn: readSession,
  // The host context does not change for the life of the page.
  staleTime: Infinity,
  retry: 1,
});

export const environmentVariablesQueryOptions = () => queryOptions({
  queryKey: qk.environmentVariables,
  queryFn: loadEnvironmentVariables,
  staleTime: 15 * 60 * 1000,
});

/**
 * The scope is part of the key (`qk.projectPm` is a child of `qk.project`), so a PM row-only context and a full Cost context never
 * share a cache entry, and a `qk.project(id)` invalidation from a PM save reaches both.
 */
export const sessionProjectQueryOptions = (projectId: string, scope: ProjectLoadScope = "full") => queryOptions({
  queryKey: scope === "pm" ? qk.projectPm(projectId) : qk.project(projectId),
  // React Query reserves undefined for an absent query result; use null for not found.
  // OPT-07d: the cluster state is looked up in the shared `Project States` entry when it can be.
  queryFn: async ({ client }) => (await loadProject(projectId, { scope, stateLookup: projectStateLookup(client) })) ?? null,
  staleTime: 5 * 60 * 1000,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  const sessionQuery = useQuery(sessionQueryOptions());

  const envQuery = useQuery(environmentVariablesQueryOptions());

  // App Insights starts from `vsb_ApplicationInsightsConnectionString`; a failed load turns it off.
  useEffect(() => {
    if (envQuery.isSuccess) {
      // D164: the console gate learns the environment before Application Insights starts (its SDK prints through the same gate).
      // `loadEnvironmentVariables` has already told it; this covers data that arrived another way and costs nothing twice.
      applyEnvironmentName(envQuery.data.vsb_EnvironmentName);
      startAppInsights(envQuery.data.vsb_ApplicationInsightsConnectionString);
    } else if (envQuery.isError) startAppInsights(undefined, envQuery.error);
  }, [envQuery.isSuccess, envQuery.isError, envQuery.data]);

  /*
   * Project Management routes always carry `?projectId=` in the ROUTE (`/project/<screen>?…`),
   * and `/project/general` WITHOUT one is the New Project form. So they read the route only:
   * falling back to a launch parameter, as the cost routes must, would turn Add Project into
   * "edit whatever project this tab was opened with" (20 Oct 2026).
   */
  const pmRoute = location.pathname.startsWith("/project/");
  const projectLink = useMemo(
    () =>
      pmRoute
        ? readProjectLink({}, undefined, location.search)
        : readProjectLink(
            sessionQuery.data?.launchParams ?? {},
            typeof window === "undefined" ? undefined : window.location.search,
            location.search,
          ),
    [pmRoute, sessionQuery.data?.launchParams, location.search],
  );
  // The overview is independent of any stale project parameter on the player URL.
  // Project Management routes (`/project/<screen>?projectId=`) are project-scoped like the cost routes.
  const needsProject = location.pathname === "/" || location.pathname === "/costs" || location.pathname.startsWith("/costs/")
    || location.pathname.startsWith("/project/");
  const projectId = needsProject && projectLink.status === "valid" ? projectLink.projectId : undefined;

  const launchesPmScreen = launchPmPath(
    sessionQuery.data?.launchParams ?? {}, typeof window === "undefined" ? "" : window.location.search,
  ) !== undefined;
  const projectQuery = useQuery({
    ...sessionProjectQueryOptions(projectId ?? "none", sessionProjectScope(location.pathname, launchesPmScreen)),
    enabled: Boolean(projectId) && sessionQuery.isSuccess,
  });

  const value = useMemo<AppSession>(() => {
    const envVars = envQuery.data ?? {};
    return {
      session: sessionQuery.data,
      envVars,
      project: projectQuery.data ?? undefined,
      projectId,
      projectIdInvalid: needsProject && projectLink.status === "invalid",
      locale: localeInfo().tag,
      pmAppUrl: projectManagementAppUrl({
        environmentId: sessionQuery.data?.environmentId,
        projectManagementAppId: envVars.vsb_ProjectManagementAppID,
        tenantId: sessionQuery.data?.tenantId,
      }),
      loading:
        sessionQuery.isLoading ||
        // D119: the environment variables no longer hold the first paint (`startupFlags`).
        (startupFlags.envVarsBlockFirstPaint && envQuery.isLoading) ||
        (Boolean(projectId) && projectQuery.isLoading),
      // `loadProject` resolves to undefined for a project the caller cannot read, which is a
      // legitimate state and not an error.
      projectNotFound:
        Boolean(projectId) && projectQuery.isSuccess && projectQuery.data === null,
      error: sessionQuery.error ?? envQuery.error ?? projectQuery.error ?? undefined,
    };
  }, [
    sessionQuery.data, sessionQuery.isLoading, sessionQuery.error,
    envQuery.data, envQuery.isLoading, envQuery.error,
    projectQuery.data, projectQuery.isLoading, projectQuery.isSuccess, projectQuery.error,
    projectId, projectLink.status, needsProject,
  ]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): AppSession {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/**
 * For screens that cannot work without a project. Returns the project or `undefined`, and
 * the caller renders the corresponding empty state — the canvas app had no such state
 * because it silently substituted a test project instead.
 */
export function useProject(): ProjectContext | undefined {
  return useSession().project;
}
