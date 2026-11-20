/**
 * Starts the Generators screen early once a project's Project Management screen is open (D141,
 * `GENERATORS_PERF.prefetch`).
 *
 * The Generators screen is a separate chunk, and its first reads (the project, the types, the six other families)
 * start only after that chunk has downloaded and the screen has mounted. A person who has chosen a project and
 * opened its General Data, Milestones, ... screen very often goes to Generators next, so a moment after such a screen is
 * up (`GENERATORS_WARMUP_DELAY_MS`, so the screen the person is on is not slowed) the chunk and the reads that need only
 * the project id start (`features/pm/generators/queries.ts`, the same keys the screen reads). Once per project and page load.
 *
 * It only warms the cache: nothing is written and no privilege is decided. A failed prefetch is retried by the screen.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { generatorsPerf } from "@/data/generatorsPerfFlags";
import { trace } from "@/platform/telemetry";
import { loadGeneratorsScreen } from "./screenLoaders";

/** How long a Project Management screen is open before the Generators screen is started behind it. */
export const GENERATORS_WARMUP_DELAY_MS = 1500;

const GENERATORS_PATH = "/project/generators";

/** Projects already warmed in this page load. */
const warmed = new Set<string>();

/**
 * Pure: should the warm-up be scheduled? Not on the Generators screen itself (its own hooks read), not without a
 * project, not twice for one project, and not with the switch off.
 */
export function shouldWarmGenerators(input: {
  projectId: string | undefined; pathname: string; prefetch: boolean; alreadyWarmed: boolean;
}): boolean {
  return input.prefetch && Boolean(input.projectId) && input.pathname !== GENERATORS_PATH && !input.alreadyWarmed;
}

/** For tests: forget which projects were warmed. */
export const resetGeneratorsWarmup = (): void => warmed.clear();

export function useGeneratorsWarmup(projectId: string | undefined, pathname: string): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId || !shouldWarmGenerators({
      projectId, pathname, prefetch: generatorsPerf().prefetch, alreadyWarmed: warmed.has(projectId),
    })) return undefined;
    const timer = setTimeout(() => {
      warmed.add(projectId);
      // A chunk that cannot be fetched is the router's problem when it needs it.
      loadGeneratorsScreen().catch(() => undefined);
      import("@/features/pm/generators/queries")
        .then((q) => q.prefetchGenerators(qc, projectId))
        .catch((error: unknown) => trace("warning", "generators prefetch failed", { error }));
    }, GENERATORS_WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [qc, projectId, pathname]);
}
