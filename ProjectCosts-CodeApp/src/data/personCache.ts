/**
 * OPT-14: one Entra lookup per person, remembered for 30 minutes, shared by the screens that resolve a person lookup
 * (`aaduser`) to a display name and mail (today: the Team screen).
 *
 * Before, every Team load (and every reload after a save or delete) fired one `getEntraPeople([id])` per unique member at
 * once, uncached: a team of 20 was 20 requests per load and per save. Now:
 *  - an answer is reused for `PERSON_CACHE_MS` (in-flight lookups are shared too, so two readers asking together send one
 *    request);
 *  - only a SUCCESSFUL answer is remembered, a failed lookup is asked again by the next read (the per-person failure
 *    isolation of `data/team.ts` is unchanged: one failure loses that person's name only);
 *  - the lookups run at most `PERSON_LOOKUP_CONCURRENCY` at a time, so a large team cannot flood the host.
 *
 * DIVERGENCE (D160, freshness): before, a display name or mail changed in Entra showed on the next Team load; now it can be up
 * to `PERSON_CACHE_MS` old (same trade as the Check List's D156 `longPeopleCache`). SWITCH: `PERSON_CACHE_MS = 0` restores
 * a lookup per person on every load (no remembering, no sharing); `PERSON_LOOKUP_CONCURRENCY` bounds the width either way.
 *
 * PB-16 (`ONE_PERSON_CACHE`, default ON; Dataverse optimization programme, T-23): this file is now the ONE implementation of the
 * per-person Entra cache, for the Team screen (`lookupPersonCached` / `lookupPeopleCached`), the Cluster Check List
 * (`data/checklistPeople.ts` calls `lookupPersonShared` with its own TTL and its own "empty answers are kept" rule) and General Data's
 * pickers (`lookupPeopleAll`). All three ask Entra the same way (`getEntraPeople([id])`), so with the switch ON they SHARE the stored
 * answers: a manager looked up on General Data is not looked up again on Team or on the Check List. Every caller keeps its own TTL
 * (Team 30 minutes `PERSON_CACHE_MS`; Check List 30 s, or 30 minutes with D156 `longPeopleCache`) and its own result shape: an entry is
 * reused only while it is younger than the CALLER's TTL, and an empty answer (no directory row) is reused only by a caller that keeps
 * empty answers (the Check List does, Team and General Data do not). The Check List's Refresh clears the shared answers (so Team
 * reads Entra again too: a freshness gain, never a loss). SWITCH `ONE_PERSON_CACHE = false`: Team and Check List each keep their own
 * store, exactly as before this change, and General Data reads Entra uncached through its query, as before.
 */
import type { Persona } from "./adminGatesApprovals";
import { mapLimit } from "./concurrency";

/** How long one person's answer is reused, in ms. `0` switches the cache off (every load asks Entra again). */
export const PERSON_CACHE_MS = 30 * 60_000;

/** Entra lookups in flight at once. */
export const PERSON_LOOKUP_CONCURRENCY = 6;

/** PB-16: one store for Team, the Check List and General Data (`true`), or one store per screen as before (`false`). */
export const ONE_PERSON_CACHE = true;
let oneOverride: boolean | null = null;
/** TEST SEAM: overrides `ONE_PERSON_CACHE` (`null` restores it). */
export const setOnePersonCache = (on: boolean | null): void => { oneOverride = on; };
export const onePersonCache = (): boolean => oneOverride ?? ONE_PERSON_CACHE;

type Answer = Promise<Map<string, Persona>>;
interface Entry { at: number; answer: Answer; /** Set once the answer is known: the directory had no row for this person. */ empty?: boolean }
type Store = Map<string, Entry>;
export type PersonCacheOwner = "team" | "checklist";

const sharedStore: Store = new Map();
const ownStores: Record<PersonCacheOwner, Store> = { team: new Map(), checklist: new Map() };
const storeFor = (owner: PersonCacheOwner): Store => (onePersonCache() ? sharedStore : ownStores[owner]);

let ttlOverride: number | null = null;
/** TEST SEAM: overrides `PERSON_CACHE_MS` (`null` restores it). */
export const setPersonCacheMs = (ms: number | null): void => { ttlOverride = ms; };
const ttl = (): number => ttlOverride ?? PERSON_CACHE_MS;

/** Forgets every remembered answer, in every store (tests, and a reload that must see Entra again). */
export const resetPersonCache = (): void => { sharedStore.clear(); ownStores.team.clear(); ownStores.checklist.clear(); };

/** Forgets the answers `owner` reads (the Check List's Refresh): its own store, or, with `ONE_PERSON_CACHE`, the shared one. */
export const resetPersonCacheFor = (owner: PersonCacheOwner): void => { storeFor(owner).clear(); };

/**
 * THE per-person lookup: the held answer when it is younger than `ttlMs` (or still in flight) and usable for this caller, else `ask(id)`.
 * Only a success is kept; an EMPTY answer (no directory row) is kept only when `keepEmpty`, and an entry known to be empty is not
 * reused by a caller that does not keep them, so a member added a moment ago never shows a blank name for the whole window.
 * `ttlMs <= 0` neither reads nor stores.
 */
export function lookupPersonShared(
  owner: PersonCacheOwner, id: string, ask: (id: string) => Answer, opts: { ttlMs: number; keepEmpty: boolean },
): Answer {
  const window = opts.ttlMs;
  const store = storeFor(owner);
  const hit = window > 0 ? store.get(id) : undefined;
  if (hit && Date.now() - hit.at < window && (opts.keepEmpty || hit.empty !== true)) return hit.answer;
  const entry: Entry = { at: Date.now(), answer: ask(id) };
  if (window > 0) {
    store.set(id, entry);
    entry.answer.then(
      (found) => {
        entry.empty = found.size === 0;
        if (entry.empty && !opts.keepEmpty && store.get(id) === entry) store.delete(id);
      },
      () => { if (store.get(id) === entry) store.delete(id); },
    );
  }
  return entry.answer;
}

/** One person's lookup for the Team screen: the held answer when it is fresh (or still in flight), else `ask(id)`. Only a success is kept. */
export function lookupPersonCached(id: string, ask: (id: string) => Answer): Answer {
  return lookupPersonShared("team", id, ask, { ttlMs: ttl(), keepEmpty: false });
}

/**
 * The unique `ids`, each looked up through the cache, `PERSON_LOOKUP_CONCURRENCY` at a time. One result per unique id, in
 * first-seen order; a rejected lookup is returned as such (never thrown), so the caller isolates failures per person.
 */
export async function lookupPeopleCached(
  ids: readonly string[], ask: (id: string) => Answer,
): Promise<{ id: string; result: PromiseSettledResult<Map<string, Persona>> }[]> {
  const unique = [...new Set(ids)];
  return mapLimit(unique, async (id) => {
    const [result] = await Promise.allSettled([lookupPersonCached(id, ask)]);
    return { id, result: result! };
  }, PERSON_LOOKUP_CONCURRENCY);
}

/**
 * General Data's pickers (PB-16): the same people answers as `getEntraPeople(ids)` (one merged map), each person through the cache.
 * Like `getEntraPeople` it REJECTS when one lookup fails (the first failure in input order), so the screen's error handling is unchanged.
 */
export async function lookupPeopleAll(ids: readonly string[], ask: (id: string) => Answer): Promise<Map<string, Persona>> {
  const answers = await lookupPeopleCached(ids, ask);
  const out = new Map<string, Persona>();
  for (const { result } of answers) {
    if (result.status === "rejected") throw result.reason;
    result.value.forEach((v, k) => out.set(k, v));
  }
  return out;
}
