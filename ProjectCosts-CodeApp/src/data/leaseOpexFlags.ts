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
