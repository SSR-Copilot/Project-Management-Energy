/**
 * Rollout switches of the Stage 3 `small-fixes` workstream (bottleneck programme, 26 Nov 2026: T-D04, T-E05, T-B07, T-E06).
 *
 * EVERY switch is its own rollback: `false` gives back exactly the behaviour the code had before (the old path is kept,
 * CONVENTIONS rule 15). None changes a business rule, a payload, a write order or a visible text. The object is typed as the
 * interface (not `as const`) so a unit test can flip a switch and restore it, as `ADMIN_OPT` does.
 *
 *  - `GATES_TRACE_ONCE` (RND-09, T-D04, default ON): Admin Project Gates traces a failed load (`[VSB] ERROR` line and the
 *    Application Insights event) once per distinct error, from an effect, not once per render of the failed state. OFF: the
 *    trace is written inside render by `userErrorText`, as before.
 *  - `DEFAULT_CHECKLISTS_REFS_PARALLEL` (SAD-02, T-E05, default ON): the Check List Settings' locks and clusters reads start in
 *    the same wave as the tab list (they do not depend on it). OFF: they wait for the tab list (`enabled: hasTabs`), as before.
 *  - `CLEANUP_UNLOAD_GUARD` (SAD-05, T-B07, default ON): the admin CAPEX Accounts forecast clean-up holds the browser's
 *    "leave this page?" prompt while it runs (the shared `holdBeforeUnload` (`components/beforeUnload.ts`)). OFF: no prompt, as before.
 *  - `CAPEX_KEEP_COMMENT_DOTS` (SCC-16, T-E06, default ON): the CAPEX grid keeps the comment dots of the previous category
 *    while the next category's comments load (the comments panel does not: it opts out and keeps its own behaviour). OFF:
 *    the dots disappear on every category change, as before.
 */
export interface SmallFixesFlags {
  GATES_TRACE_ONCE: boolean;
  DEFAULT_CHECKLISTS_REFS_PARALLEL: boolean;
  CLEANUP_UNLOAD_GUARD: boolean;
  CAPEX_KEEP_COMMENT_DOTS: boolean;
}

export const SMALL_FIXES: SmallFixesFlags = {
  GATES_TRACE_ONCE: true,
  DEFAULT_CHECKLISTS_REFS_PARALLEL: true,
  CLEANUP_UNLOAD_GUARD: true,
  CAPEX_KEEP_COMMENT_DOTS: true,
};
