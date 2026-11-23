/**
 * The one `'Project States'` cache entry (D159, audit finding 5).
 *
 * Seven screens need these ten rows. They used to read the table through four different functions under four different cache
 * keys, so opening Project Overview and then General Data read it twice, and each key went stale on its own clock. Now there is
 * one read (`listProjectStates`, `data/generalData.ts`), one key (`qk.generalDataProjectStates`) and one freshness, and each
 * screen takes its own view of the list through the pure functions below, so what a screen shows is exactly what it showed
 * before: Project Overview and the Cost screens list the ACTIVE states only, the Admin gate screen lists every state with
 * its raw `Order`, General Data, the Check List, Revenues and Milestones list every state.
 *
 * No React in this file: `app/bootPrefetch.ts` imports it.
 */
import { queryOptions } from "@tanstack/react-query";
import { listProjectStates, type SharedProjectState } from "./generalData";
import { qk } from "./keys";
import type { ProjectState as AdminProjectState } from "./adminGatesApprovals";
import type { ProjectState as CostProjectState } from "./costBook";

/** How long the list counts as fresh: global master data that changes a few times a year. */
export const PROJECT_STATES_STALE = 30 * 60 * 1000;

/** Key, function and freshness together, so a prefetch lands exactly where every screen reads. */
export const projectStatesQueryOptions = () => queryOptions({
  queryKey: qk.generalDataProjectStates,
  queryFn: listProjectStates,
  staleTime: PROJECT_STATES_STALE,
});

/** Project Overview's Status filter (`cbx_..._Filter_Status.Items = Sort('Project States', Order)`): active states, `Order` as stored. */
export function overviewStates(rows: readonly SharedProjectState[]): { id: string; name: string; order: number | null }[] {
  return rows.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, order: s.orderRaw }));
}

/** The Cost screens' "Link to Milestone" list: active states in `Order`, a missing `Order` read as 0. */
export function costStates(rows: readonly SharedProjectState[]): CostProjectState[] {
  return rows.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, order: s.order }));
}

/** The Admin gate screen's list: every state, a missing `Order` kept as null, with the business unit copied onto saved templates. */
export function adminStates(rows: readonly SharedProjectState[]): AdminProjectState[] {
  return rows.map((s) => ({
    id: s.id, name: s.name, order: s.orderRaw, visibleOnChecklist: s.isVisibleOnChecklist, businessUnitId: s.businessUnitId,
  }));
}
