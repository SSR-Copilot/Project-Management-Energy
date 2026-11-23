/**
 * Starts the first screen's chunk and reads at once, from the URL, before React has mounted
 * (D119).
 *
 * Before: session → environment variables (2 round trips) → render → download the screen's chunk →
 * the screen's first reads (and, on a Project Management route, the project's 2 round trips ahead of
 * that), each step waiting for the one before. After: the chunk, the project list's first page
 * (or General Data's project row, lists and children) start together, beside the session.
 *
 * It only warms the cache. The screens read the same keys through the same query options, so a
 * result is picked up when they mount, and a prefetch that fails or is never used costs one wasted
 * request: it is traced and the screen retries on its own. Nothing is written, and no privilege is
 * decided here: every read still runs under the signed-in user.
 */
import type { QueryClient } from "@tanstack/react-query";
import { localeInfo } from "@/domain/locale";
import { ensureInitialized } from "@/platform/powerClient";
import { trace } from "@/platform/telemetry";
import { bootTarget, needsLaunchParams, type BootTarget } from "./bootPlan";
import { generatorsPerf } from "@/data/generatorsPerfFlags";
import {
  COST_SCREEN_LOADERS, PM_SCREEN_LOADERS, loadGeneralDataScreen, loadGeneratorsScreen, loadProjectOverviewScreen,
} from "./screenLoaders";
import { sessionProjectQueryOptions, sessionQueryOptions } from "./SessionContext";
import { startupFlags } from "./startupFlags";

export interface BootEnvironment {
  /** `window.location.hash`. */
  hash: string;
  /** `window.location.search`. */
  search: string;
}

/** Never rejects: a prefetch is an optimisation, and its failure belongs to the screen that retries. */
const quietly = (what: string, work: () => Promise<unknown>): Promise<void> =>
  Promise.resolve().then(work).then(() => undefined, (error: unknown) => trace("warning", `boot prefetch: ${what} failed`, { error }));

export async function prefetchTarget(qc: QueryClient, target: BootTarget): Promise<void> {
  /*
   * OPT-03: every target that names a project also starts the session's project read, the one the route's gate waits on, under the
   * key and scope the SessionProvider reads (a Project Management route reads the row only, the Cost routes the full load). Before,
   * only General Data did. It is a prefetch like the rest: the same key, a failure is traced and the gate's own read retries.
   */
  if (target.kind === "pm-screen" || target.kind === "cost") {
    await quietly("session project", () => qc.prefetchQuery(sessionProjectQueryOptions(target.projectId, target.kind === "cost" ? "full" : "pm")));
    return;
  }

  if (target.kind === "generators") {
    const session = quietly("session project", () => qc.prefetchQuery(sessionProjectQueryOptions(target.projectId, "pm")));
    // D141 (`GENERATORS_PERF.prefetch`): the reads that need only the project id; the rest wait for them inside the screen.
    if (!generatorsPerf().prefetch) { await session; return; }
    await Promise.all([session, quietly("generators", async () => {
      const q = await import("@/features/pm/generators/queries");
      await q.prefetchGenerators(qc, target.projectId);
    })]);
    return;
  }

  if (target.kind === "projects") {
    await quietly("project list", async () => {
      // The screen's own modules, loaded on demand so the entry bundle does not carry them.
      const [queries, rules] = await Promise.all([
        import("@/features/pm/project-main/queries"),
        import("@/features/pm/project-main/rules"),
      ]);
      const criteria = rules.parseCriteria(new URLSearchParams(target.search));
      await Promise.all([
        qc.prefetchQuery(queries.projectPageOptions({
          filter: criteria.filter, sort: criteria.sort, page: criteria.page, locale: localeInfo().tag,
        })),
        qc.prefetchQuery(queries.countriesQueryOptions()),
        qc.prefetchQuery(queries.projectStatesQueryOptions()),
      ]);
    });
    return;
  }

  if (target.kind === "general-data") {
    await quietly("general data", async () => {
      const q = await import("@/features/pm/general-data/queries");
      const { projectId } = target;
      const row = qc.prefetchQuery(q.generalDataProjectQueryOptions(projectId));
      await Promise.all([
        // The header's project (the session's own read), the lists and the children: none needs the row.
        qc.prefetchQuery(sessionProjectQueryOptions(projectId, "pm")),
        qc.prefetchQuery(q.generalDataCountriesQueryOptions()),
        qc.prefetchQuery(q.generalDataProjectStatesQueryOptions()),
        qc.prefetchQuery(q.shareholdersQueryOptions(projectId)),
        qc.prefetchQuery(q.stateTrackingsQueryOptions(projectId)),
        // Only the country's own lists wait for the row, and nothing else waits for them.
        row.then(() => {
          const countryId = qc.getQueryData(q.generalDataProjectQueryOptions(projectId).queryKey)?.countryId;
          if (!countryId) return undefined;
          return Promise.all([
            qc.prefetchQuery(q.generalDataAreasQueryOptions(countryId)),
            qc.prefetchQuery(q.generalDataUtilizationsQueryOptions(countryId)),
          ]);
        }),
      ]);
    });
  }
}

function preloadChunk(target: BootTarget): void {
  const loads = target.kind === "projects" ? [loadProjectOverviewScreen]
    : target.kind === "general-data" ? [loadGeneralDataScreen]
      : target.kind === "generators" ? (generatorsPerf().prefetch ? [loadGeneratorsScreen] : [])
        // OPT-03: the Cost screen or the other Project Management screen the link opens.
        : target.kind === "cost" ? COST_SCREEN_LOADERS[target.path] ?? []
          : target.kind === "pm-screen" ? PM_SCREEN_LOADERS[target.slug] ? [PM_SCREEN_LOADERS[target.slug]!] : [] : [];
  // A chunk that cannot be fetched is the router's problem when it needs it (it shows its error then).
  for (const load of loads) load().catch(() => undefined);
}

/**
 * Called once from `main.tsx`. Returns when the work it started has settled (tests await it); the
 * caller does not, so the first render is never held back.
 */
export async function startBootPrefetch(qc: QueryClient, env: BootEnvironment): Promise<void> {
  if (!startupFlags.bootPrefetch) return;
  try {
    /*
     * The SDK's `setConfig` and `getContext()` must run before the first read, as they do when the
     * session query starts them; this does the same, earlier. It is idempotent: the session query
     * reads the one cached promise, and its result is put under its own key below.
     */
    const context = ensureInitialized();
    void qc.prefetchQuery(sessionQueryOptions());

    let launchParams: Record<string, string> = {};
    if (needsLaunchParams(env.hash)) {
      // The usual way in is no deep link, which lands on the project list: its chunk (small, and
      // cached after the first visit) is worth fetching speculatively. The READS wait for the launch parameters.
      preloadChunk({ kind: "projects", search: "" });
      // `/` leads wherever the host's launch parameters say, so they are needed first. This is the
      // SDK's own start-up promise, already running, not an extra round trip.
      try { launchParams = (await context).app.queryParams ?? {}; } catch { return; }
    }
    const target = bootTarget({ hash: env.hash, windowSearch: env.search, launchParams });
    preloadChunk(target);
    await prefetchTarget(qc, target);
  } catch (error) {
    trace("warning", "boot prefetch could not start", { error });
  }
}
