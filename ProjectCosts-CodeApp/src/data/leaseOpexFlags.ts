/**
 * Switches of the Dataverse / network optimisation programme for Land Lease and OPEX (dvopt tasks T-03, T-01, T-02, T-09; findings
 * CB-03, CB-01, CB-02, CB-14). Each one changes request or failure behaviour; each keeps the old path in code, so `false` is the
 * rollback. Treat them like `LEASE_WRITE_PARALLEL` / `OPEX_IMPORT_PARALLEL`: live product decisions, not dead code.
 *
 *  - `GONE_AS_DONE_LEASE_OPEX` (CB-03): a delete answering 404 / `0x80040217` counts as done in the Land Lease and OPEX deletes
 *    (`deleteIfExists`, as Contracts), so a retry after a partial delete is no longer blocked at its first request. `false`: the
 *    404 fails the plan, as before.
 *  - `LEASE_GUARD` / `OPEX_GUARD` (CB-01): a plan that updates existing rows first reads those ids (one read per table per plan,
 *    key only) and refuses with `RecordGoneError`, nothing written, when one is gone (the PATCH is an upsert and would re-create
 *    it, often as an orphan). `false`: the unguarded PATCH, as before.
 *  - `COST_REFRESH_ON_FAILURE` (CB-02): the cost book is refreshed on EVERY outcome of a Land Lease / OPEX write, not only on
 *    success, and the Land Lease standard import decides "already imported" from a fresh server read. `false`: the old
 *    success-only refresh and the cached-book check.
 *  - `STABLE_CREATE_IDS` (CB-14): a header create carries a client-generated id that is kept across a retry of the same save, and
 *    a retried id is read back before it is created again, so a create that landed but looked failed cannot duplicate. `false`:
 *    the server issues the id, as before.
 */
export const GONE_AS_DONE_LEASE_OPEX = true;
export const LEASE_GUARD = true;
export const OPEX_GUARD = true;
export const COST_REFRESH_ON_FAILURE = true;
export const STABLE_CREATE_IDS = false; // integration: off until a DEV check proves the host accepts a client-supplied primary key on a plain create (CB-14)

/**
 * Batch 2 (dvopt T-14, T-21, T-11 adoption). One switch each; `false` restores the previous path, which stays in the code.
 *
 *  - `COST_READS_RETRY` (CA-11, T-14): the four main Cost reads (book, Land Lease book, CAPEX totals, Add Cost sheet) use the app's
 *    read retry (`attempt < 2 && isRetryable`: a transient 5xx / 429 / no-status failure is retried, never a 403 or other 4xx).
 *    `false`: `retry: false`, one failure shows "Cost data is unavailable".
 *  - `LEASE_TIER_WIDER` (CB-07): the Land Lease write tiers let the D118 follower start-date updates share one tier. `false`: one
 *    period write per tier, as D160.
 *  - `OPEX_BOOK_REUSES_CATALOGUE` (CB-08): the OPEX book takes the sub-account names from the cached OPEX catalogue instead of reading
 *    `vsb_opexsubaccounts` again. `false`: the book reads the table itself.
 *  - `OPEX_WRITES_TOGETHER` (CB-09): independent awaits in the OPEX writes start together (the head's child read beside its PATCH;
 *    the import's existence check beside the assumptions read). `false`: one after the other.
 *  - `CONTRACT_LINKS_WITH_PATCH` (CB-11): a Contracts edit reads the contract's DevCo links beside the contract save, not after it.
 *    `false`: after.
 *  - `CONTRACT_KEYS_ONCE` (CB-12): a Contracts create or delete invalidates the payment-target and link reads without refetching the
 *    old id-set key, so each is read once under the new key. `false`: the old key is refetched too.
 *  - `BOP_ASSUMPTIONS_ONE_READ` (CB-13): the Development and Construction BoP standard assumptions are one request. `false`: two.
 *  - `LEASE_LEAN_RELOAD` (CB-15): a Land Lease write reloads the book in the background (not before the save resolves) and leaves the
 *    OPEX book keys alone. `false`: the awaited reload of both, as before.
 *  - `COST_WRITES_POLICY` (T-11 adoption): the single-row writes of Land Lease, OPEX and Contracts go through `sendWithPolicy`
 *    (create: a 429 only; update: 429 and transient; delete: 429 and transient). `false`: the plain call, as before.
 */
export const COST_READS_RETRY = true;
export const LEASE_TIER_WIDER = true;
export const OPEX_BOOK_REUSES_CATALOGUE = true;
export const OPEX_WRITES_TOGETHER = true;
export const CONTRACT_LINKS_WITH_PATCH = true;
export const CONTRACT_KEYS_ONCE = true;
export const BOP_ASSUMPTIONS_ONE_READ = true;
export const LEASE_LEAN_RELOAD = true;
export const COST_WRITES_POLICY = true;
