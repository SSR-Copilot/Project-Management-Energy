/**
 * T-C03 (E2 of the entry-prefetch design): one lookup from a route path to what starts early for it, so the boot and the
 * in-app intent triggers call the same loaders and the same prefetchers (`pmScreenPrefetch.ts`, `costScreenPrefetch.ts`), and there is
 * no second list of what each screen reads.
 *
 * The loaders are the plain `import()` functions of `screenLoaders.ts` (cheap to hold: a chunk is only fetched when one is called).
 * The prefetchers are loaded on demand, so this module adds no screen code to the start-up bundle. Nothing here reads a flag or
 * the network by itself: the callers decide (`intentPrefetch.ts`).
 */
import type { QueryClient } from "@tanstack/react-query";
import { COST_PATHS, type CostPath } from "./deepLinks";
import { PM_BOOT_SLUGS, type PmBootSlug } from "./bootPlan";
import { ADMIN_SCREEN_LOADERS, COST_SCREEN_LOADERS, PM_SCREEN_LOADERS } from "./screenLoaders";

type Loader = () => Promise<unknown>;

export interface ScreenPlan {
  /** The chunk(s) the route renders. */
  loaders: readonly Loader[];
  /** Starts the screen's own first reads under the keys it reads; absent when the screen has none to start early (Administration, General Data, Generators). */
  prefetch?: (qc: QueryClient, projectId: string) => Promise<unknown>;
  /** Too large to start on a guess: a hover must never start it (the boot prefetch does, because there the link names the screen). */
  heavy: boolean;
}

/**
 * The CAPEX Summary's totals read every cost row of the project; the Add Cost from Table sheet reads up to 15,000 rows. A rail entry
 * of `/costs/capex` carries no category, so it opens the Summary: never started on intent (E4).
 */
export const HEAVY_COST_PATHS: ReadonlySet<string> = new Set<CostPath>(["/costs/capex", "/costs/add-from-table"]);

export function screenPlanFor(path: string): ScreenPlan | undefined {
  if ((COST_PATHS as readonly string[]).includes(path)) {
    const costPath = path as CostPath;
    return {
      loaders: COST_SCREEN_LOADERS[costPath] ?? [],
      prefetch: async (qc, projectId) => {
        const { prefetchCostScreenReads } = await import("./costScreenPrefetch");
        await prefetchCostScreenReads(qc, costPath, projectId, { mode: "intent" });
      },
      heavy: HEAVY_COST_PATHS.has(costPath),
    };
  }

  if (path.startsWith("/project/")) {
    const slug = path.slice("/project/".length);
    const loader = PM_SCREEN_LOADERS[slug];
    if (!loader) return undefined;
    const hasReads = (PM_BOOT_SLUGS as readonly string[]).includes(slug);
    return {
      loaders: [loader],
      ...(hasReads
        ? {
          prefetch: async (qc: QueryClient, projectId: string) => {
            const { prefetchPmScreenReads } = await import("./pmScreenPrefetch");
            await prefetchPmScreenReads(qc, slug as PmBootSlug, projectId);
          },
        }
        : {}),
      heavy: false,
    };
  }

  const admin = ADMIN_SCREEN_LOADERS[path];
  return admin ? { loaders: [admin], heavy: false } : undefined;
}
