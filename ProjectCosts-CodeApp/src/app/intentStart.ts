/**
 * T-C03: what happens when an intent is shown on a rail entry: the screen's chunk (`INTENT_PREFETCH_CHUNKS`) and, behind
 * `INTENT_PREFETCH_DATA` (OFF), its first reads. Loaded on demand by `intentPrefetch.ts` (the rail's listeners, which sit in the start-up
 * bundle), so this module, `screenPrefetch.ts` and the logging they need add nothing to the start-up closure. The bounds are described in
 * `intentPrefetch.ts`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { entryPrefetch } from "@/data/entryPrefetchFlags";
import { actionLog } from "@/platform/requestLog";
import { trace } from "@/platform/telemetry";
import { screenPlanFor } from "./screenPrefetch";

/** How many screens may be prefetched at once; a further intent is dropped. */
export const INTENT_MAX_IN_FLIGHT = 4;
/** One data start per project and screen within this window. */
export const INTENT_DEDUPE_MS = 30_000;

export type IntentTrigger = "hover" | "focus" | "press";

const startedAt = new Map<string, number>();
let inFlight = 0;

/** For tests: forget the dedupe window and the in-flight count. */
export function resetIntentPrefetch(): void {
  startedAt.clear();
  inFlight = 0;
}

/** Pure: may a data prefetch start now? (the dedupe window, the page being hidden and the bound on screens in flight) */
export function mayStartIntentData(input: {
  now: number; lastStartedAt: number | undefined; hidden: boolean; inFlight: number;
}): boolean {
  if (input.hidden) return false;
  if (input.inFlight >= INTENT_MAX_IN_FLIGHT) return false;
  return input.lastStartedAt === undefined || input.now - input.lastStartedAt >= INTENT_DEDUPE_MS;
}

/** Starts what the switches allow for the screen at `path`. Never throws. */
export function startScreenIntent(
  qc: QueryClient, path: string, projectId: string | undefined, trigger: IntentTrigger,
  clock: { now: () => number; hidden: () => boolean } = {
    now: () => Date.now(), hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
  },
): void {
  const plan = screenPlanFor(path);
  if (!plan) return;
  const flags = entryPrefetch();
  // A chunk that cannot be fetched is the router's problem when it needs it.
  if (flags.intentChunks) for (const load of plan.loaders) load().catch(() => undefined);

  if (!flags.intentData || !plan.prefetch || plan.heavy || !projectId) return;
  const key = `${projectId}|${path}`;
  if (!mayStartIntentData({ now: clock.now(), lastStartedAt: startedAt.get(key), hidden: clock.hidden(), inFlight })) return;
  startedAt.set(key, clock.now());
  inFlight += 1;
  const prefetch = plan.prefetch;
  actionLog(`prefetch ${trigger} ${path}`, () => prefetch(qc, projectId))
    .catch((error: unknown) => trace("warning", `intent prefetch of ${path} failed`, { error }))
    .finally(() => { inFlight -= 1; });
}
