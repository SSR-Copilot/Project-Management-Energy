/**
 * D138 (A2): one Entra lookup per person, shared by the Cluster Check List's gate rows and approval settings.
 *
 * The gate rows and the approval settings both resolve the Portfolio Manager's mail, and every cluster visit and every write's
 * reload asked again. One person's answer is now shared for 30 s (the screen's own `staleTime`, `app/Providers.tsx`), or, with D156's
 * `longPeopleCache` (the shipped setting), for 30 minutes, so a visit asks Entra once per person. Only a SUCCESSFUL answer is kept (a failed lookup is asked again by
 * the next read, and still loses only that person's mail, D127 §2); the screen's Refresh clears it. The request itself is
 * unchanged: one `getEntraPeople([id])` per person (the Graph-backed table is queried by key only).
 *
 * PB-16: the per-person cache itself now lives ONCE in `data/personCache.ts` (`lookupPersonShared`), shared with the Team screen and
 * General Data (switch `ONE_PERSON_CACHE`); this file keeps what is the Check List's own: its TTL (`freshMs`), the rule that an empty
 * answer is kept, and the scope-row memo.
 */
import type { Persona } from "./adminGatesApprovals";
import { checklistPerf } from "./checklistPerfFlags";
import { lookupPersonShared, resetPersonCacheFor } from "./personCache";

/** How long an answer is reused with `longPeopleCache` OFF: the `staleTime` of the screen's queries. */
export const PEOPLE_FRESH_MS = 30_000;

/**
 * D156 (`longPeopleCache`, default ON): how long an answer is reused. A Portfolio Manager's mail almost never changes, and every
 * lookup sits on the path to a usable screen (the gates' before the loader ends, the approval settings' before the row actions are
 * known), so a visit older than 30 seconds paid for it again. The screen's Refresh still clears the cache.
 */
export const PEOPLE_FRESH_LONG_MS = 30 * 60_000;

const freshMs = (): number => (checklistPerf().longPeopleCache ? PEOPLE_FRESH_LONG_MS : PEOPLE_FRESH_MS);

type Answer = Promise<Map<string, Persona>>;

/**
 * OPT-24 (S4-13, optimization programme B6): the scope row's id (`findScopeCountryTechId`: the "Checklist Country And Technology" row of
 * a country and technology) is kept for the same window as the people answers. It is read before EVERY copy of the templates and
 * changes only when an admin creates or deletes that scope row. `false` gives back one read per call. Only a found id is kept (a
 * missing scope is asked again, so a scope an admin adds is seen at once); a failed read is not kept. DIVERGENCE (timing only): a scope
 * row deleted and re-created within the window is seen at the next Refresh or after the window. The key is `country|technology`.
 */
export const SCOPE_ID_MEMO = true;
const scopeCache = new Map<string, { at: number; answer: Promise<string | null> }>();

export function lookupScopeOnce(key: string, ask: () => Promise<string | null>): Promise<string | null> {
  if (!SCOPE_ID_MEMO) return ask();
  const hit = scopeCache.get(key);
  if (hit && Date.now() - hit.at < freshMs()) return hit.answer;
  const entry = { at: Date.now(), answer: ask() };
  scopeCache.set(key, entry);
  const forget = () => { if (scopeCache.get(key) === entry) scopeCache.delete(key); };
  entry.answer.then((id) => { if (id === null) forget(); }, forget);
  return entry.answer;
}

/** Clears the people answers AND the scope ids (the command bar's Refresh, and every test's start). */
export const resetChecklistPeopleCache = (): void => { resetPersonCacheFor("checklist"); scopeCache.clear(); };

/** `ask(id)` is the real lookup; it is called only when no fresh answer for `id` is held. */
export function lookupPersonOnce(id: string, ask: (id: string) => Answer): Answer {
  // Same rules as before: this screen's TTL, an empty answer is kept, a failure is not.
  return lookupPersonShared("checklist", id, ask, { ttlMs: freshMs(), keepEmpty: true });
}
