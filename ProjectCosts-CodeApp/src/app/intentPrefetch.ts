/**
 * T-C03 (BND-17, SPA-09): the in-app intent prefetch. Hovering or keyboard-focusing an entry of the navigation rail for a short moment
 * (or pressing it) starts that screen early:
 *
 *  - its CHUNK (`INTENT_PREFETCH_CHUNKS`, default ON): a static download, no Dataverse request. The Administration screens (which have no
 *    boot reads) and every other screen get it through `screenLoaders.ts`, the same promise the router's `lazy()` awaits;
 *  - its first READS (`INTENT_PREFETCH_DATA`, default OFF: the owner has not approved the extra Dataverse traffic), through the same
 *    prefetchers the boot uses (`screenPrefetch.ts`), so key and function are the screen's own. Bounded and traced:
 *      - only after a real hover or focus that lasts `INTENT_DWELL_MS` (a mouse sweeping over the rail starts nothing), or a press;
 *      - at most `INTENT_MAX_IN_FLIGHT` screens being prefetched at once (a further intent is dropped, never queued);
 *      - one start per project and screen within `INTENT_DEDUPE_MS`, so hovering back and forth does not re-read;
 *      - never while the page is hidden, never without a project, never the screen the user is already on;
 *      - never the heavy reads (the CAPEX Summary's totals, the Add Cost sheet): `HEAVY_COST_PATHS`;
 *      - one `[VSB] ACTION prefetch <trigger> <path>` line per start (`actionLog`, CONVENTIONS rule 23), with its requests and time,
 *        so the hit rate (does the click follow inside the screen's `staleTime`?) is measured, not assumed.
 *
 * It writes nothing and decides no privilege: a prefetch runs under the user's own rights and a failed one is the screen's to retry.
 * The document delegation is `generatorsWarmup.ts`'s (`listenOnDocument`, `railEntryOf`), not a second copy.
 */
import type { QueryClient } from "@tanstack/react-query";
import { entryPrefetch } from "@/data/entryPrefetchFlags";
import { listenOnDocument, railEntryOf } from "./generatorsWarmup";
import { startScreenIntent, type IntentTrigger } from "./intentStart";

/** How long the pointer or the focus stays on a rail entry before it counts as intent. */
export const INTENT_DWELL_MS = 150;

/**
 * Registers the rail's listeners (called from `useRailIntent.ts` once this module has loaded) and returns the cleanup. `pathname` is the
 * screen the user is on (its own entry starts nothing). With both intent switches OFF it registers no listener at all.
 */
export function attachRailIntent(qc: QueryClient, projectId: string | undefined, pathname: string): () => void {
  {
    const flags = entryPrefetch();
    if (!flags.intentChunks && !flags.intentData) return () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waitingFor: Element | null = null;
    const cancel = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      waitingFor = null;
    };
    const pathOf = (entry: Element | null) => entry?.getAttribute("data-nav-path") ?? undefined;
    const dwell = (trigger: IntentTrigger) => (event: Event) => {
      const entry = railEntryOf(event.target);
      const path = pathOf(entry);
      if (!entry || !path || path === pathname) return;
      // The pointer moving between the entry's own icon and label is still the same hover.
      if (entry === waitingFor) return;
      cancel();
      waitingFor = entry;
      timer = setTimeout(() => { cancel(); startScreenIntent(qc, path, projectId, trigger); }, INTENT_DWELL_MS);
    };
    const leave = (event: Event) => {
      const entry = railEntryOf(event.target);
      if (!entry) return;
      const next = (event as { relatedTarget?: EventTarget | null }).relatedTarget ?? null;
      if (next && railEntryOf(next) === entry) return;
      cancel();
    };
    const press = (event: Event) => {
      const path = pathOf(railEntryOf(event.target));
      if (!path || path === pathname) return;
      cancel();
      startScreenIntent(qc, path, projectId, "press");
    };
    const stops = [
      listenOnDocument(["pointerover"], dwell("hover")),
      listenOnDocument(["focusin"], dwell("focus")),
      listenOnDocument(["pointerout", "focusout"], leave),
      listenOnDocument(["pointerdown"], press),
    ];
    return () => { cancel(); for (const stop of stops) stop(); };
  }
}
