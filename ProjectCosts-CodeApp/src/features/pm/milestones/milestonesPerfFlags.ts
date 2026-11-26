/**
 * Rollout switch of the Milestones re-pricing speed-up (Dataverse optimization programme, finding PB-12, task T-23).
 * The old path is kept in code (CONVENTIONS rule 15): `false` gives back exactly the requests the screen had before.
 *
 *  - `MILESTONES_REPRICE_TOGETHER` (default ON): when the FID moved,
 *    (a) the save's generator-type updates (`vsb_generatortypeinprojects`, one PATCH per type) are ONE concurrent group, 8 at a time, with
 *        the plant-cost PATCH of the project still AFTER the group (it does not read their results: the sum is computed in the client);
 *        no new update starts after the first failure (`stopOnFailure`), so a failure still stops the save before the plant-cost PATCH;
 *    (b) the generators' price-ladder reads (one read per 40 generator ids) run side by side instead of one after the other.
 *    No flow or plugin is listed on `vsb_generatortypeinproject` updates (`04-flow-inventory.md`). Same rows, same payloads, same result.
 *    OFF: the updates and the chunk reads run one after the other, as before.
 */
export const MILESTONES_REPRICE_TOGETHER = true;

let override: boolean | null = null;

/** The switch in force: the shipped value, then the override a test installed. */
export const milestonesRepriceTogether = (): boolean => override ?? MILESTONES_REPRICE_TOGETHER;

/** Test seam: replaces the switch for the rest of the run; `null` restores the shipped value. */
export function setMilestonesRepriceTogether(next: boolean | null): void {
  override = next;
}
