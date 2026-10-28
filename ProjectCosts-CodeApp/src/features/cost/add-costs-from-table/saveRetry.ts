/**
 * Add Cost from Table — the two Save decisions the screen used to make inline.
 *
 * No canvas equivalent: the canvas has no bulk save that can half-land, and no reload in
 * flight while its Save is pressed. Pure (rule 5), so the screen only wires them.
 */
import { rowIdentity, type SheetRow } from "./rules";

/**
 * Save is greyed while the sheet is invalid or unwritable (`canSave`), while a save runs, and
 * while the sheet reloads (`isFetching`). The last one matters: a save planned against the
 * pre-save snapshot (after a save that stayed on screen, or on re-entry with stale cached data)
 * would issue fresh ids for cells that already exist and create them a second time.
 */
export function saveButtonDisabled(s: { canSave: boolean; isPending: boolean; isFetching: boolean }): boolean {
  return !s.canSave || s.isPending || s.isFetching;
}

/**
 * What a Save sends as `changedRows`, whether the data layer must re-read before planning, and
 * which row identities this attempt sends (the screen keeps them if the attempt fails).
 *
 * Normally that is the diff against the loaded snapshot plus the orphan clean-up. After a failed
 * save, the rows THAT attempt sent (`sentBefore`, by `rowIdentity`) may have landed, so for them
 * the snapshot no longer matches Dataverse: a cell set back to its snapshot value diffs as
 * unchanged and would never be written. The retry therefore re-sends exactly those rows (as they
 * are now), plus the new diff and the orphan clean-up, and asks the data layer to re-read the
 * contracts and costs (`refreshBeforePlan`) so the planner compares against what is stored.
 *
 * NOT every row: `contractUpserts` forces Individual / Absolute Values / "edited from PCF" on any
 * contract it receives, so re-sending rows the user never touched would rewrite those contracts
 * (E4 finding M1) — the canvas only writes rows that changed.
 */
export function saveRequestRows(args: {
  changed: readonly SheetRow[];
  orphanCleanup: readonly SheetRow[];
  currentRows: readonly SheetRow[];
  sentBefore: ReadonlySet<string>;
}): { changedRows: SheetRow[]; refreshBeforePlan: boolean; sentIdentities: string[] } {
  const refreshBeforePlan = args.sentBefore.size > 0;
  const changedIds = new Set(args.changed.map(rowIdentity));
  const resend = refreshBeforePlan
    ? args.currentRows.filter((r) => {
      const id = rowIdentity(r);
      return args.sentBefore.has(id) && !changedIds.has(id);
    })
    : [];
  const changedRows = [...args.changed, ...resend, ...args.orphanCleanup];
  return { changedRows, refreshBeforePlan, sentIdentities: changedRows.map(rowIdentity) };
}
