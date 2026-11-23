/**
 * Answers a project-state lookup from the shared `'Project States'` cache entry (OPT-07d, B5b).
 *
 * The data layer has no query client, so the hook or the query function hands one in (`queryFn: ({ client }) => …`). The shared list
 * (`data/projectStates.ts`, 30 min, one key for every screen) is read through `fetchQuery`: a cached list younger than its 30 minutes
 * answers at once, an older or missing one is fetched once and shared. `projectStates` is imported on demand so the entry bundle does not
 * carry `data/generalData.ts` for it.
 *
 * Returns the stored `Order` (`orderRaw`, null when blank) and the name, or `undefined` for an id the list does not hold; the callers
 * (`loadProject`, `loadProjectStateOrder`) then read that one row themselves, exactly as they did before.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { ProjectStateLookup } from "./project";

export function projectStateLookup(client: QueryClient): ProjectStateLookup {
  return async (stateId) => {
    const { projectStatesQueryOptions } = await import("./projectStates");
    const rows = await client.fetchQuery(projectStatesQueryOptions());
    const row = rows.find((s) => s.id === stateId);
    return row ? { name: row.name, orderRaw: row.orderRaw } : undefined;
  };
}
