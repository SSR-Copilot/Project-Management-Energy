/**
 * Rollout switch of the General Data request savings (Dataverse optimization programme, finding PB-15, task T-23). The old path is
 * kept in code (CONVENTIONS rule 15): `false` gives back exactly the requests the screen had before.
 *
 *  - `GD_CANCEL_REUSES_CACHE` (default ON): the gate-cancellation step of a start-cluster change (`cancelDraftGateApprovalIfRunning`,
 *    D81) takes the project's gate settings and their Portfolio Managers' Entra data from the query cache the Cluster Check List keeps
 *    them in (`qk.checklistGates(country, technology)`, its `staleTime` honoured: `fetchQuery` without an override uses the app's
 *    default), and reads them only when no fresh entry is held, instead of always reading the gate rows and Entra again. The cancellation
 *    FLOW call, its payload and its place in the save are untouched. DIVERGENCE (freshness only): gate admin settings can be as old as
 *    the Check List's own reads of them. The entry is the Check List's own only when its `scopedGates` switch is on; with it off the
 *    step reads, as before. OFF: always read.
 */
export const GD_CANCEL_REUSES_CACHE = true;

let override: boolean | null = null;

/** The switch in force: the shipped value, then the override a test installed. */
export const gdCancelReusesCache = (): boolean => override ?? GD_CANCEL_REUSES_CACHE;

/** Test seam: replaces the switch for the rest of the run; `null` restores the shipped value. */
export function setGdCancelReusesCache(next: boolean | null): void {
  override = next;
}
