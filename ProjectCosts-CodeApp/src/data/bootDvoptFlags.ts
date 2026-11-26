/**
 * Rollout switches of the boot / Project Management network work (DV optimisation programme, group `boot`).
 *
 * EVERY switch is its own rollback: setting one to its OLD value gives back exactly the requests and the behaviour
 * the code had before (the old path is kept, CONVENTIONS rule 15). Treat each like `startupFlags` or `GENERATORS_PERF`: a live
 * decision, not dead code. The object is mutable on purpose, so a unit test can flip a switch and pin both halves; app code
 * only reads it (through `bootDvopt()`).
 *
 *  - `BOOT_PREFETCH_SCREEN_READS` (PB-03, default ON): a deep link to a Project Management screen (Check List, Team, Planning,
 *    Grid Operator, Milestones) also starts that screen's own first reads in the boot prefetch (`app/pmScreenPrefetch.ts`), under
 *    the keys the screen reads, instead of after the session project and the gate. OFF: only the session project, as before.
 *  - `COUNTRIES_ONE_KEY` (PB-06, default ON): the Project Overview's country list and the signed-in user's country-to-business-unit
 *    map are views of the one `vsb_countries` read under `qk.adminCountries` (`data/countries.ts`). OFF: each keeps its own read.
 *  - `CURRENT_USER_BY_ENTRA` (PB-07, default OFF, NOT IMPLEMENTED): declared so the owner finds the whole set here. The filter
 *    `systemuserroles_association/any(o:o/azureactivedirectoryobjectid eq <entraId>)` could not be proven from the repo (the
 *    column exists on `systemuser` and is filtered at the top level, but no lambda over it exists, and the reference JSON does not
 *    list it); see the notes of the group. Nothing reads this switch.
 *  - `ENV_VARS_TOGETHER` (PB-08, default ON): the environment-variable values are read at the same time as the definitions
 *    (filtered through the definition's schema name), not after them. A values read that the server refuses falls back to the
 *    old sequential read, so the result is the same. OFF: definitions first, then the values by definition id, as before.
 *  - `PM_PROJECT_ROW_SHARED` (PB-10, default ON): Planning and Grid Operator read the project row under ONE key
 *    (`qk.planning(id, "project")`), so a move between them inside the stale time reads it once. OFF: two keys, as before.
 *  - `PLANNING_CREATE_ONCE` (PB-05, default ON): the Planning `OnVisible` seeds (the planning row, the acquisition statuses) run
 *    through a once-per-project guard (`features/pm/planning/seedOnce.ts`): one in flight per project, an existence re-check
 *    right before the create, and no second create after one succeeded in this page load. OFF: the seeds run in every
 *    query-function run, as before.
 *  - `GENERATORS_WARMUP_LAZY` (PA-11 / PB-09, default OFF = today's behaviour): the 10-13 Generators reads that start 1.5 s
 *    after any Project Management screen opens start only after the user shows intent (hover or focus on the Generators entry
 *    of the navigation) or after a longer idle delay (`GENERATORS_WARMUP_IDLE_MS`). The owner decides after a measured capture.
 */
export const BOOT_PREFETCH_SCREEN_READS = true;
export const COUNTRIES_ONE_KEY = true;
export const CURRENT_USER_BY_ENTRA = false;
export const ENV_VARS_TOGETHER = true;
export const PM_PROJECT_ROW_SHARED = true;
export const PLANNING_CREATE_ONCE = true;
export const GENERATORS_WARMUP_LAZY = false;

export interface BootDvoptFlags {
  prefetchScreenReads: boolean;
  countriesOneKey: boolean;
  currentUserByEntra: boolean;
  envVarsTogether: boolean;
  pmProjectRowShared: boolean;
  planningCreateOnce: boolean;
  generatorsWarmupLazy: boolean;
}

const DEFAULTS: BootDvoptFlags = {
  prefetchScreenReads: BOOT_PREFETCH_SCREEN_READS,
  countriesOneKey: COUNTRIES_ONE_KEY,
  currentUserByEntra: CURRENT_USER_BY_ENTRA,
  envVarsTogether: ENV_VARS_TOGETHER,
  pmProjectRowShared: PM_PROJECT_ROW_SHARED,
  planningCreateOnce: PLANNING_CREATE_ONCE,
  generatorsWarmupLazy: GENERATORS_WARMUP_LAZY,
};

let current: BootDvoptFlags = { ...DEFAULTS };

/** The switches as they are now. */
export const bootDvopt = (): Readonly<BootDvoptFlags> => current;

/** For tests: change some switches; `resetBootDvopt()` restores the defaults. */
export function setBootDvoptForTests(patch: Partial<BootDvoptFlags>): void {
  current = { ...current, ...patch };
}
export function resetBootDvopt(): void {
  current = { ...DEFAULTS };
}
