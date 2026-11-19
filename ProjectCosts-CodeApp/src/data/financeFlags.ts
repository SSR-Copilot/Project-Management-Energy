/**
 * Rollout switches of the Finance screen performance work (D137; ProjectDocs/app-docs/02-OPEN-DECISIONS.md).
 *
 * EVERY switch is its own rollback: setting one to `false` gives back exactly the requests the screen sent before the
 * change (the old code path is kept, CONVENTIONS rule 15). Treat each like `BULK_SAVE` or `CANVAS_PARITY_DELETION`: a
 * live product decision, not dead code.
 *
 *  - `parallelReads`: the inputs read no longer waits for the categories (the row's `Order` is attached once both are
 *    in), the CAPEX cost chunks are read together, and the project-state list is cached like the other reference data.
 *  - `lazyReads`: the CAPEX total and the active turbine count are read only while a card or panel that shows them is
 *    open (they feed the Equity and the Decommissioning cards, which start folded).
 *  - `targetedReload`: a write reloads only the reads it can change (see `reloadKeys` in `features/pm/finance/perf.ts`),
 *    not the whole screen.
 *  - `concurrentWrites`: independent rows of one save go out together (`together()`, the canvas `Concurrent`), and the
 *    visit seeds are one job, not six jobs with six reloads.
 *  - `bulkSchedules`: the repayment schedule and the step-up margins of a tranche Save go through `CreateMultiple` /
 *    `UpdateMultiple` once a table has `BULK_MIN_ROWS` rows. OFF until the live probe on DEV has passed (rule 5 of
 *    this work: nothing here may write to an environment), like every `GENERATORS_BULK` flag; flipping it is a one-line
 *    change with the DEV result recorded in `02-OPEN-DECISIONS.md`.
 */
export interface FinancePerfFlags {
  parallelReads: boolean;
  lazyReads: boolean;
  targetedReload: boolean;
  concurrentWrites: boolean;
  bulkSchedules: boolean;
}

const DEFAULTS: Readonly<FinancePerfFlags> = {
  parallelReads: true,
  lazyReads: true,
  targetedReload: true,
  concurrentWrites: true,
  bulkSchedules: false,
};

/** Every switch off: today's requests exactly (tests, and the rollback in one line). */
export const FINANCE_PERF_ALL_OFF: Readonly<FinancePerfFlags> = {
  parallelReads: false, lazyReads: false, targetedReload: false, concurrentWrites: false, bulkSchedules: false,
};

let override: Partial<FinancePerfFlags> | null = null;

/** The switches in force: the defaults, then the override a test installed. */
export const financePerf = (): Readonly<FinancePerfFlags> => ({ ...DEFAULTS, ...override });

/** Test seam: replaces switches for the rest of the run; `null` restores the defaults. */
export function setFinancePerfFlags(next: Partial<FinancePerfFlags> | null): void {
  override = next;
}

/**
 * The smallest number of rows of ONE table in a tranche Save for which a bulk request is used instead of one request
 * per row. A bulk update also reads the ids first (one guard read per 40), so below this the per-row `together()` group
 * is as fast and does not depend on `CreateMultiple` / `UpdateMultiple`.
 */
export const BULK_MIN_ROWS = 5;
