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

/**
 * Which rule seeds the Add Revenue Contract panel's standard price (Bidding Price, Tariff / Price p50 and p90) (D155).
 *
 *  - `"yearCurve"` (default): the unified rule of `domain/priceCurve.ts`. The curve's row for the COD year if there is
 *    one, otherwise the row whose YEAR is nearest (equally near: the higher price), independent of row order. The
 *    Milestones screen's default revenue uses the same function.
 *  - `"canvasParity"`: the 1.21.753 canvas as shipped (SOURCE DEFECT 1 and 1.21.753-1, D-record of 17 Nov 2026). Outside
 *    Italy the exact-year lookup cannot match and the fallback compares the COD year with the PRICES, so the answer is the
 *    LAST row of the table, in whatever order Fabric returned it. A German wind project with COD 2034 got the 2025 row (52)
 *    where the table has a 2034 row (60). Kept reachable as the rollback; flag it to the product owner before using it.
 */
export type PriceLookupMode = "yearCurve" | "canvasParity";

export const REVENUE_PRICE: { lookup: PriceLookupMode } = {
  lookup: "yearCurve",
};
