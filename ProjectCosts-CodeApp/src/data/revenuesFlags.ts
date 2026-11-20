/**
 * Switch of the PM Revenue screen's save-performance work (D136).
 *
 *  - `parallelVolumeWrites`: a contract Save sends the contract write first, then deletes the contract's stored
 *    individual hedge volumes as ONE concurrent group (16 at a time, `LEAF_DELETE_CONCURRENCY`), then creates the new
 *    volumes as ONE concurrent group (8 at a time, `WRITE_CONCURRENCY`). The canvas order holds between the steps
 *    (contract, then every delete, then every create); only the rows inside a step run together. No flow or plugin
 *    fires on `vsb_projectrevenue` or `vsb_revenueindividualhedgevolume`
 *    (`ProjectDocs/migration-plans/04-flow-inventory.md`), so the relative order of rows inside a step does not matter.
 *    `false` is the previous behaviour: one request after another (CONVENTIONS rule 15: the old path stays reachable).
 *
 *    DIVERGENCE (no canvas equivalent, same trade as the Production screen's `together()` writes): when one row of a
 *    group fails, the other rows of that group are still sent, and the Save then stops. Before, the rows after the
 *    failed one were never sent. The message still says how many changes had been saved ("N of M").
 *
 *  - `wideCreateGroup` (D146): the group of NEW volumes goes out 16 wide (`WIDE_GROUP_CONCURRENCY`, as the Production
 *    Save since D145 and the Generators groups since D144) instead of 8 (`WRITE_CONCURRENCY`). It only changes how many
 *    rows of the create group are in flight at once: the order of the three steps, the rows, the payloads and the
 *    failure semantics of a group are those of `parallelVolumeWrites`. 12 volumes: 2 waves become 1; 36: 5 become 3.
 *    Only read when `parallelVolumeWrites` is on. `false` is exactly the D136 plan (8 wide).
 *
 * The object is typed as the interface so a test can pass overrides without a cast. Treat it like
 * `CANVAS_PARITY_DELETION`: a live product decision. Setting it back to `false` is the rollback.
 */
export interface RevenuePerfFlags {
  parallelVolumeWrites: boolean;
  wideCreateGroup: boolean;
}

/** A partial set of the flags, merged over `REVENUE_PERF` by whoever accepts overrides. */
export type RevenuePerfOverrides = Partial<RevenuePerfFlags>;

export const REVENUE_PERF: RevenuePerfFlags = {
  parallelVolumeWrites: true,
  wideCreateGroup: true,
};
