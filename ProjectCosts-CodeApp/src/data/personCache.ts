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
 * Neutral on purpose: `data/checklistPeople.ts` (Check List, its own 30 s / 30 min flag) is NOT touched and not shared.
 */
import type { Persona } from "./adminGatesApprovals";
import { mapLimit } from "./concurrency";

/** How long one person's answer is reused, in ms. `0` switches the cache off (every load asks Entra again). */
export const PERSON_CACHE_MS = 30 * 60_000;

/** Entra lookups in flight at once. */
export const PERSON_LOOKUP_CONCURRENCY = 6;

type Answer = Promise<Map<string, Persona>>;
const cache = new Map<string, { at: number; answer: Answer }>();

let ttlOverride: number | null = null;
/** TEST SEAM: overrides `PERSON_CACHE_MS` (`null` restores it). */
export const setPersonCacheMs = (ms: number | null): void => { ttlOverride = ms; };
const ttl = (): number => ttlOverride ?? PERSON_CACHE_MS;

/** Forgets every remembered answer (tests, and a reload that must see Entra again). */
export const resetPersonCache = (): void => { cache.clear(); };

/** One person's lookup: the held answer when it is fresh (or still in flight), else `ask(id)`. Only a success is kept. */
export function lookupPersonCached(id: string, ask: (id: string) => Answer): Answer {
  const window = ttl();
  const hit = window > 0 ? cache.get(id) : undefined;
  if (hit && Date.now() - hit.at < window) return hit.answer;
  const entry = { at: Date.now(), answer: ask(id) };
  if (window > 0) {
    cache.set(id, entry);
    // A failure is not kept, and neither is an EMPTY answer (the directory had no row for this person yet): a member added a
    // moment ago must not show a blank name for the whole window.
    entry.answer.then(
      (found) => { if (found.size === 0 && cache.get(id) === entry) cache.delete(id); },
      () => { if (cache.get(id) === entry) cache.delete(id); },
    );
  }
  return entry.answer;
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
