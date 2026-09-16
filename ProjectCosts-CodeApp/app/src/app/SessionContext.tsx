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
 * project — see `docs/01-BUGS-FOUND.md` A-2.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { readSession, readProjectLink, type Session } from "@/platform/powerClient";
import { loadEnvironmentVariables, loadProject, type EnvVars } from "@/data/project";
import { qk } from "@/data/keys";
import { localeInfo } from "@/domain/locale";
import type { ProjectContext } from "@/features/contracts/rules";
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  const sessionQuery = useQuery({
    queryKey: qk.session,
    queryFn: readSession,
    // The host context does not change for the life of the page.
    staleTime: Infinity,
    retry: 1,
  });

  const envQuery = useQuery({
    queryKey: qk.environmentVariables,
    queryFn: loadEnvironmentVariables,
    staleTime: 15 * 60 * 1000,
  });

  const projectLink = useMemo(
    () =>
      readProjectLink(
        sessionQuery.data?.launchParams ?? {},
        typeof window === "undefined" ? undefined : window.location.search,
        location.search,
      ),
    [sessionQuery.data?.launchParams, location.search],
  );
  // The overview is independent of any stale project parameter on the player URL.
  const needsProject = location.pathname === "/" || location.pathname === "/costs" || location.pathname.startsWith("/costs/");
  const projectId = needsProject && projectLink.status === "valid" ? projectLink.projectId : undefined;

  const projectQuery = useQuery({
    queryKey: qk.project(projectId ?? "none"),
    // React Query reserves undefined for an absent query result; use null for not found.
    queryFn: async () => (await loadProject(projectId as string)) ?? null,
    enabled: Boolean(projectId) && sessionQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
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
        envQuery.isLoading ||
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
