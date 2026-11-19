/**
 * D138 (A2): one Entra lookup per person, shared by the Cluster Check List's gate rows and approval settings.
 *
 * The gate rows and the approval settings both resolve the Portfolio Manager's mail, and every cluster visit and every write's
 * reload asked again. One person's answer is now shared for as long as the screen's own queries stay fresh (30 s,
 * `app/Providers.tsx`), so a visit asks Entra once per person. Only a SUCCESSFUL answer is kept (a failed lookup is asked again by
 * the next read, and still loses only that person's mail, D127 §2); the screen's Refresh clears it. The request itself is
 * unchanged: one `getEntraPeople([id])` per person (the Graph-backed table is queried by key only).
 */
import type { Persona } from "./adminGatesApprovals";

/** How long an answer is reused: the `staleTime` of the screen's queries. */
export const PEOPLE_FRESH_MS = 30_000;

type Answer = Promise<Map<string, Persona>>;
const cache = new Map<string, { at: number; answer: Answer }>();

export const resetChecklistPeopleCache = (): void => { cache.clear(); };

/** `ask(id)` is the real lookup; it is called only when no fresh answer for `id` is held. */
export function lookupPersonOnce(id: string, ask: (id: string) => Answer): Answer {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < PEOPLE_FRESH_MS) return hit.answer;
  const entry = { at: Date.now(), answer: ask(id) };
  cache.set(id, entry);
  // A failed lookup must not be remembered.
  entry.answer.catch(() => { if (cache.get(id) === entry) cache.delete(id); });
  return entry.answer;
}
