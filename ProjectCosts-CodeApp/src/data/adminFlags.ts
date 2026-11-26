/**
 * Rollout switches of the Application Settings optimisation work (dvopt tasks T-04, T-24, AD-05; findings AD-01, AD-03, AD-05,
 * AD-06, AD-08, AD-09, AD-11, AD-12; plan `22 - Prioritized Implementation Backlog.md`).
 *
 * EVERY switch is its own rollback: `false` gives back exactly the requests and the failure behaviour the screen had before (the
 * old code path is kept, CONVENTIONS rule 15). Treat each like `CHECKLIST_BULK` or `CANVAS_PARITY_DELETION`: a live product
 * decision, not dead code. None of them changes a business rule, a payload, a write order or a visible text; they change how a
 * failed row is retried, how many reads are in flight, what a reload re-reads and which caches a delete marks stale.
 *
 * The object is typed as the interface (not `as const`) so a test can flip a switch and restore it.
 *
 *  - `CLEANUP_RESILIENT` (AD-01, T-04): the CAPEX forecast clean-up retries a throttled / transient row (deletes through
 *    `withDeleteRetry`, the zero PATCH pair up to 3 tries on 429 / 5xx / no status), does not stop at the first failed row and, when
 *    some rows still failed, throws `PartialStepError` with the landed / failed counts and a note that a rerun is safe. OFF: the
 *    fail-fast pools of before (`updateRowsEach`, `countedForEach`), no retry.
 *  - `ADMIN_DELETE_ALREADY_GONE_OK` (AD-05): an admin per-row delete answering 404 / `0x80040217` counts as done (the plan
 *    engine's rule since D157). OFF: such a delete fails the save, as before.
 *  - `ADMIN_HAS_CONTRACTS_POOL` (AD-03): the per-subaccount "has contracts" reads of the CAPEX tree go out at most
 *    `HAS_CONTRACTS_POOL_WIDTH` at a time. OFF: all at once.
 *  - `ADMIN_GATES_NARROW_RELOAD` (AD-06): the Project Gates Active pill reloads only the slice it changed, and a reload that is
 *    already running is not started a second time. OFF: the full dataset chain after every click.
 *  - `ADMIN_NO_REDUNDANT_EXISTS` (AD-08): the second write of a create-then-update pair does not read the row the POST created
 *    a few milliseconds earlier. OFF: the guarded update with its existence read.
 *  - `ADMIN_SCOPE_READS_ONCE` (AD-09, AD-12): the Costs settings read each table once per scope (one read for the active and the
 *    inactive OPEX rows; the CAPEX account hierarchy from the shared chart read). OFF: the separate reads.
 *  - `ADMIN_CASCADE_INVALIDATE` (AD-11): deleting a standard DEVEX cost or a standard BoP contract also marks the project caches
 *    its server plug-in changes as stale. OFF: only the standard-assumption keys, as before.
 */
export interface AdminOptFlags {
  CLEANUP_RESILIENT: boolean;
  ADMIN_DELETE_ALREADY_GONE_OK: boolean;
  ADMIN_HAS_CONTRACTS_POOL: boolean;
  ADMIN_GATES_NARROW_RELOAD: boolean;
  ADMIN_NO_REDUNDANT_EXISTS: boolean;
  ADMIN_SCOPE_READS_ONCE: boolean;
  ADMIN_CASCADE_INVALIDATE: boolean;
}

export const ADMIN_OPT: AdminOptFlags = {
  CLEANUP_RESILIENT: true,
  ADMIN_DELETE_ALREADY_GONE_OK: true,
  ADMIN_HAS_CONTRACTS_POOL: true,
  ADMIN_GATES_NARROW_RELOAD: true,
  ADMIN_NO_REDUNDANT_EXISTS: true,
  ADMIN_SCOPE_READS_ONCE: true,
  ADMIN_CASCADE_INVALIDATE: true,
};

/** Width of the `hasContracts` pool (AD-03). */
export const HAS_CONTRACTS_POOL_WIDTH = 6;
