/**
 * Rollout switches of the CAPEX / Add Cost from Table network work (dvopt programme, tasks T-06, T-20, T-09 part, T-32 part;
 * findings CA-03, CA-05..CA-09, CA-12, CA-15, CA-16).
 *
 * EVERY switch is its own rollback: setting it to `false` gives back exactly the requests and the failure behaviour the screen had
 * before (the old code path is kept, CONVENTIONS rule 15). Treat each like `PANEL_BULK_SAVE` or `CHECKLIST_BULK`: a live product
 * decision, not dead code. None of them changes a business rule, a canvas string, a write's columns on a first attempt or a
 * flow call; they change WHEN a read starts, WHAT a write reloads afterwards, and what a RETRY of a failed save re-sends.
 * `CAPEX_OPT_ALL_OFF` is today's (pre-dvopt) behaviour, for tests and for a one-line rollback.
 *
 *  - `HOLD_TAB_FOR_DEFERRED_DELETES` (CA-03): the browser asks before the tab is closed while an Add Cost from Table Save's
 *    deferred deletes, or the totals reconcile after them, are pending (`data/pendingDeletes.ts`). A prompt only.
 *  - `CAPEX_PATCH_BOOK` (CA-05): after a paid toggle, a panel save or a panel delete the cached category book is patched from
 *    the rows just written instead of being reloaded whole (`features/cost/costing/capexBookPatch.ts`); a case the patch cannot
 *    prove equal to a reload keeps the reload. OFF: the awaited whole-book reload, as before.
 *  - `ADDCOST_LEAN_REFRESH` (CA-06): after an Add Cost Save the not-displayed whole-project Summary totals are marked stale
 *    (`refetchType: "none"`) instead of being read twice. OFF: `refetchType: "all"`, as before.
 *  - `SPV_MAPPING_SHARED` (CA-08): the SPV/DevCo mapping read is shared and remembered 5 minutes (`data/costBook.ts`).
 *  - `COMMENTS_WITH_PAYMENTS` (CA-09): the category's comment threads are requested in the same wave as its payments
 *    (`data/costBook.ts`, prefetched into the query cache under the key the screen reads), not one wave after the book.
 *  - `COMMENT_DELETES_OVERLAP` (CA-15): the comments panel's deletes run together (4 at a time) before the creates and edits,
 *    which stay in order. OFF: one await after another.
 *  - `WTG_COUNT_STANDARD_ONLY` (CA-16): the active-WTG count is read only when a per-WTG standard contract can use it, and
 *    selects only the column it sums. OFF: read on every CAPEX tab visit.
 *  - `PANEL_STABLE_ID` (CA-07): a new CAPEX contract is created under its client-minted id, and a retry of the same Add keeps
 *    the id of the contract and of its month rows (`data/capexWrites.ts`). OFF: the server chooses the contract id and every
 *    attempt mints new month ids, as before.
 *  - `PANEL_CHANGED_CONTRACT_COLUMNS` (CA-12): a CAPEX Edit sends the contract columns that changed (and the ones the stored line
 *    cannot vouch for) instead of the whole bag. OFF: the whole bag, as before.
 */
export interface CapexOptFlags {
  HOLD_TAB_FOR_DEFERRED_DELETES: boolean;
  CAPEX_PATCH_BOOK: boolean;
  ADDCOST_LEAN_REFRESH: boolean;
  SPV_MAPPING_SHARED: boolean;
  COMMENTS_WITH_PAYMENTS: boolean;
  COMMENT_DELETES_OVERLAP: boolean;
  WTG_COUNT_STANDARD_ONLY: boolean;
  PANEL_STABLE_ID: boolean;
  PANEL_CHANGED_CONTRACT_COLUMNS: boolean;
}

/** The shipped defaults. */
export const CAPEX_OPT_DEFAULTS: Readonly<CapexOptFlags> = Object.freeze({
  HOLD_TAB_FOR_DEFERRED_DELETES: true,
  CAPEX_PATCH_BOOK: true,
  ADDCOST_LEAN_REFRESH: true,
  SPV_MAPPING_SHARED: true,
  COMMENTS_WITH_PAYMENTS: true,
  COMMENT_DELETES_OVERLAP: true,
  WTG_COUNT_STANDARD_ONLY: true,
  PANEL_STABLE_ID: true,
  PANEL_CHANGED_CONTRACT_COLUMNS: true,
});

/** Every switch off: the behaviour before the dvopt work. */
export const CAPEX_OPT_ALL_OFF: Readonly<CapexOptFlags> = Object.freeze({
  HOLD_TAB_FOR_DEFERRED_DELETES: false,
  CAPEX_PATCH_BOOK: false,
  ADDCOST_LEAN_REFRESH: false,
  SPV_MAPPING_SHARED: false,
  COMMENTS_WITH_PAYMENTS: false,
  COMMENT_DELETES_OVERLAP: false,
  WTG_COUNT_STANDARD_ONLY: false,
  PANEL_STABLE_ID: false,
  PANEL_CHANGED_CONTRACT_COLUMNS: false,
});

/** The live values. Read at the call (never captured at import), so a test can flip one. */
export const CAPEX_OPT: CapexOptFlags = { ...CAPEX_OPT_DEFAULTS };

/** For tests: override some switches. Call `resetCapexOptFlags()` afterwards. */
export function setCapexOptFlags(patch: Partial<CapexOptFlags>): void {
  Object.assign(CAPEX_OPT, patch);
}

/** For tests: back to the shipped defaults. */
export function resetCapexOptFlags(): void {
  Object.assign(CAPEX_OPT, CAPEX_OPT_DEFAULTS);
}
