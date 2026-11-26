/**
 * PB-05 (`PLANNING_CREATE_ONCE`): the once-per-project guard of Planning's `OnVisible` seeds.
 *
 * The seeds create rows (the planning row, one acquisition status per type) from inside query functions. A query function
 * can run more than once: a retry, a focus refetch, a remount after `gcTime`, and the planning row and the acquisition
 * statuses each run their own. The guard makes the creation a step of its own:
 *
 *  - one run per key (`<kind>:<projectId>`) in flight at a time; a second caller waits for it and reports what it did;
 *  - the step re-reads what it is about to create right before creating (the caller's `step` does the existence re-check);
 *  - after a create that succeeded, no second create for the key in this page load. A row the user cannot read looks absent
 *    to every later read; without this memory every visit would create another one (PB-05).
 *
 * A refused create (traced and swallowed, as the canvas `Patch` has no `IfError`) is NOT remembered, so a later visit tries
 * again exactly as before. Nothing here decides WHAT is created, for whom, or what a user without read access gets: that stays
 * `planEnsurePlanning` / `planAquisitionSeed` in `rules.ts`.
 *
 * Module state, not React state: a second `useQuery` observer, a retry and a remount all meet the same map.
 */

/** What the guarded step reports: it created (or tried to create) rows, or it found nothing to create. */
export type SeedStepResult = "created" | "refused" | "none";

/** What a caller learns: the step ran (here or in the call it joined), or an earlier create in this page load already did the job. */
export type SeedOnceResult = SeedStepResult | "done";

const inflight = new Map<string, Promise<SeedStepResult>>();
const created = new Set<string>();

/** For tests: forget every key. */
export function resetSeedOnce(): void {
  inflight.clear();
  created.clear();
}

export async function seedOnce(key: string, step: () => Promise<SeedStepResult>): Promise<SeedOnceResult> {
  if (created.has(key)) return "done";
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    try {
      const result = await step();
      if (result === "created") created.add(key);
      return result;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
