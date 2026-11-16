/**
 * Switches of the Generators delete-hardening programme
 * (ProjectDocs/app-docs/GENERATORS-DELETE-HARDENING-PLAN.md, DEL-1).
 *
 *  - `tieredDeletes`: the live behaviour since 16 Nov 2026. Deletes of leaf rows run 16 at a time and deletes whose
 *    cascade locks child rows run 4 at a time (`LEAF_DELETE_CONCURRENCY` / `CASCADE_DELETE_CONCURRENCY`). `false`
 *    means one group at limit 8, the shape before the tiers. It has been `true` from the start, so it is the one
 *    switch that is already on.
 *  - `verifyDeletes`: read a `confirm` delete back after it was sent (`data/verifyGone.ts`). Off until its DEV check.
 *  - `parentOrder`: delete rows that share a parent one after another (`serialKey`). Off until a timed DEV test.
 *  - `guardedUpdates`: Generators updates that must not re-create a deleted row use the guarded form. Off until
 *    its DEV check.
 *
 * The other three become `true` only AFTER their own check on DEV has passed, as a one-line change in its own
 * commit with the result recorded in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (the same rule as
 * `GENERATORS_BULK`). Setting one back to `false` is the rollback. No rollout policy beyond that: no
 * per-user or per-environment switch. Treat each like `CANVAS_PARITY_DELETION`, a live product decision.
 *
 * The object is typed as the interface (not `as const`) so a caller or a test can pass overrides
 * (`DeleteFlagOverrides`) without a cast. The names and the shape are a contract other work packages import.
 */
export interface GeneratorsDeleteFlags {
  tieredDeletes: boolean;
  verifyDeletes: boolean;
  parentOrder: boolean;
  guardedUpdates: boolean;
}

/** A partial set of the flags, merged over `GENERATORS_DELETE` by whoever accepts overrides. */
export type DeleteFlagOverrides = Partial<GeneratorsDeleteFlags>;

export const GENERATORS_DELETE: GeneratorsDeleteFlags = {
  tieredDeletes: true,
  verifyDeletes: false,
  parentOrder: false,
  guardedUpdates: false,
};
