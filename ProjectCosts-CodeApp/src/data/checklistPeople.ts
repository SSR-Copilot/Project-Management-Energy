/**
 * D138 (A2): one Entra lookup per person, shared by the Cluster Check List's gate rows and approval settings.
 *
 * The gate rows and the approval settings both resolve the Portfolio Manager's mail, and every cluster visit and every write's
 * reload asked again. One person's answer is now shared for 30 s (the screen's own `staleTime`, `app/Providers.tsx`), or, with D156's
 * `longPeopleCache` (the shipped setting), for 30 minutes, so a visit asks Entra once per person. Only a SUCCESSFUL answer is kept (a failed lookup is asked again by
 * the next read, and still loses only that person's mail, D127 §2); the screen's Refresh clears it. The request itself is
 * unchanged: one `getEntraPeople([id])` per person (the Graph-backed table is queried by key only).
 */
import type { Persona } from "./adminGatesApprovals";
import { checklistPerf } from "./checklistPerfFlags";

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
const cache = new Map<string, { at: number; answer: Answer }>();

export const resetChecklistPeopleCache = (): void => { cache.clear(); };

/** `ask(id)` is the real lookup; it is called only when no fresh answer for `id` is held. */
export function lookupPersonOnce(id: string, ask: (id: string) => Answer): Answer {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < freshMs()) return hit.answer;
  const entry = { at: Date.now(), answer: ask(id) };
  cache.set(id, entry);
  // A failed lookup must not be remembered.
  entry.answer.catch(() => { if (cache.get(id) === entry) cache.delete(id); });
  return entry.answer;
}
