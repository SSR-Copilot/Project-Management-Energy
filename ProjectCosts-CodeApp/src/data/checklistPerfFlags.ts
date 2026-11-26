/**
 * Rollout switches of the Cluster Check List performance work (D150; ProjectDocs/app-docs/02-OPEN-DECISIONS.md).
 *
 * EVERY switch is its own rollback: setting one to `false` gives back exactly the requests and the timing the screen had before
 * (the old code path is kept, CONVENTIONS rule 15). Treat each like `CHECKLIST_BULK`, `BULK_SAVE` or `CANVAS_PARITY_DELETION`: a live
 * product decision, not dead code. `CHECKLIST_PERF_ALL_OFF` gives today's behaviour for tests and for a one-line rollback.
 * None of them changes a write, its order, its payload, a text or a flow call: they change WHEN a read starts, WHAT a write
 * reloads afterwards and how many creates of one group are in flight.
 *
 *  - `targetedReload` (default ON): a job whose plan writes ONLY `vsb_projectchecklists` rows (a row's Complete, In Progress,
 *    date or comment patch; the copy of the templates into a cluster whose tracking already exists) reloads the cluster's rows and
 *    nothing else. No server automation fires on that table (`04-flow-inventory.md`), so the project, the trackings, the approval
 *    settings and the session project cannot have changed. Every other job (anything that writes a tracking, a note or the project,
 *    and every flow job) keeps the full list. OFF: every job reloads `checklistWriteKeys`, as before.
 *  - `earlyRows` (default ON): the selected cluster's rows are read as soon as the project, the states and the trackings have
 *    answered, in parallel with the gates and their Entra lookups, which the cluster does not depend on. The screen still shows
 *    the loader until the gates have answered (D127 §1 is unchanged). DIVERGENCE (timing only): the read starts earlier.
 *  - `earlyVisit` (default ON): the visit's own work (the Draft back-fill, then the copy of the templates) starts once the project,
 *    the states and the trackings have settled instead of after the gates and their Entra lookups as well. Neither reads the gates.
 *    DIVERGENCE (timing only): a first visit's writes can run while the loader still shows.
 *  - `prefetchCopy` (default ON): the copy of the templates reads less in a row. The cluster's templates are kept in the query cache
 *    (30 s, like the screen's reads) and the approval settings of those templates are read WHILE the copy writes, so the reload after
 *    it finds them (they are keyed by the rows' template ids, which are the templates'). A "Move to next cluster" also warms the templates of the
 *    next cluster during its own sequential writes (one count read, and two reads when that cluster has no rows yet), so the visit
 *    that follows it starts from them (the settings are read by that visit's copy: the Move's own reload invalidates them). Read-only and speculative: a failed warm-up changes nothing, the visit reads again. The count
 *    that decides whether to copy stays a fresh read (D138). DIVERGENCE (timing only): up to three extra reads per Move.
 *    OFF: the templates and the settings are read when the visit and the reload ask, as before.
 *  - `wideCopy` (default ON): the template creates of a first visit are one group sixteen wide instead of eight (the
 *    `WIDE_GROUP_CONCURRENCY` of Production, D145, and Generators, D144). Same rows, same payloads.
 *
 * D156 — the reference reads (what no write of this screen changes: the project states, the gate settings, the approval
 * settings and the Portfolio Managers' mails from Entra). They are read the same way, they are only kept and shared differently:
 *  - `longPeopleCache` (default ON): an Entra answer is reused for 30 MINUTES (`PEOPLE_FRESH_LONG_MS`), not 30 seconds. The gate
 *    rows and the approval settings each wait for the Entra lookup of their Portfolio Managers (the loader waits for the gates'; the
 *    row actions that depend on the approval mode wait for the settings'), so every visit older than 30 seconds paid two extra
 *    round trips for a mail that almost never changes. The command bar's Refresh still clears the cache. DIVERGENCE (timing only):
 *    a mail changed in Entra is picked up at the next Refresh, or after 30 minutes. OFF: 30 seconds.
 *  - `scopedGates` (default ON): the gate settings are cached by country and technology, which is all they depend on, instead of
 *    per project, so opening another project of the same country and technology does not read them (and their Entra mails) again.
 *    The full Refresh re-reads them. OFF: one cache entry per project.
 *  - `sharedStates` (default ON): the project states come from the 30-minute cache the other Project Management screens share
 *    (`qk.generalDataProjectStates`, already prefetched at start-up) instead of being read again on every visit. The canvas reads
 *    them once per session (App.OnStart). The full Refresh re-reads them. OFF: a read per project and visit (30 s).
 *  - `quietFocus` (default ON): the reference reads above are not refetched when the browser window regains focus. The project,
 *    the trackings and the rows still are (they carry what a second user changes). OFF: every stale query refetches on focus.
 *
 * D158 — not a speed switch, a BEHAVIOUR one (it lives here because the Check List's switches do):
 *  - `completeCopy` (default ON): a visit to a cluster that has checklist rows but is MISSING some of its templates completes the copy,
 *    for the missing templates only. The canvas copies only when the cluster has no row at all, so a copy that stopped part-way (a
 *    throttled or failed create, D150's wider groups) left a cluster with a few tasks that no later visit ever finished. It applies only
 *    to a cluster nobody has worked on (no row has a task state, a comment or an approval state) and that is not Completed, so a template
 *    an admin adds later never reaches a project's work in progress. DIVERGENCE from the canvas (product owner, 23 Nov 2026: "Fix #3").
 *    OFF: the canvas rule (copy only into an empty cluster).
 *
 * Dataverse optimization programme (PB-13, PB-14; task blocks T-23, T-01). Each has its named constant and its field:
 *  - `trackingsOnce` = `CHECKLIST_TRACKINGS_ONCE` (default ON, PB-13): `prepareCluster` (the visit's ensure-tracking and copy) reuses the
 *    trackings the screen's own query read a moment ago (at most `TRACKINGS_REUSE_MS`, 2 s, old; not invalidated; not refetching)
 *    instead of listing them again. Every WRITE job keeps its own fresh read (C6; Move, Reset, Request, Cancel). DIVERGENCE (timing
 *    only): D127 C5's "fresh read first" is satisfied by a read made up to 2 s earlier. A write invalidates the query, so the next visit
 *    reads again. OFF: a second list read per cluster visit, as before.
 *  - `backfillGuard` = `CHECKLIST_BACKFILL_GUARD` (default ON, PB-14): before the Draft back-fill PATCHes existing trackings, one key-only
 *    read asks which of them still exist, and only those are written (creates stay creates), so a tracking deleted since the list was
 *    read is not brought back as an orphan (no project, no owning business unit). The seven independent writes then go out as ONE
 *    concurrent group instead of one after the other (only the Draft row is In Progress, the one value `SynchroniseProjectState` acts on).
 *    Same rows, same payloads, same flow triggers. OFF: the sequential, unguarded upserts, as before.
 */
export const CHECKLIST_TRACKINGS_ONCE = true;
export const CHECKLIST_BACKFILL_GUARD = true;
/** PB-13: how old the screen's trackings query data may be for `prepareCluster` to reuse it. */
export const TRACKINGS_REUSE_MS = 2_000;

export interface ChecklistPerfFlags {
  targetedReload: boolean;
  earlyRows: boolean;
  earlyVisit: boolean;
  prefetchCopy: boolean;
  wideCopy: boolean;
  longPeopleCache: boolean;
  scopedGates: boolean;
  sharedStates: boolean;
  quietFocus: boolean;
  completeCopy: boolean;
  trackingsOnce: boolean;
  backfillGuard: boolean;
}

/** The switches as shipped. */
export const CHECKLIST_PERF: Readonly<ChecklistPerfFlags> = {
  targetedReload: true,
  earlyRows: true,
  earlyVisit: true,
  prefetchCopy: true,
  wideCopy: true,
  longPeopleCache: true,
  scopedGates: true,
  sharedStates: true,
  quietFocus: true,
  completeCopy: true,
  trackingsOnce: CHECKLIST_TRACKINGS_ONCE,
  backfillGuard: CHECKLIST_BACKFILL_GUARD,
};

/** Every switch at its OLD behaviour: today's requests exactly (tests, and the rollback in one line). */
export const CHECKLIST_PERF_ALL_OFF: Readonly<ChecklistPerfFlags> = {
  targetedReload: false, earlyRows: false, earlyVisit: false, prefetchCopy: false, wideCopy: false,
  longPeopleCache: false, scopedGates: false, sharedStates: false, quietFocus: false, completeCopy: false,
  trackingsOnce: false, backfillGuard: false,
};

let override: Partial<ChecklistPerfFlags> | null = null;

/** The switches in force: the shipped values, then the override a test installed. */
export const checklistPerf = (): Readonly<ChecklistPerfFlags> => ({ ...CHECKLIST_PERF, ...override });

/** Test seam: replaces switches for the rest of the run; `null` restores the shipped values. */
export function setChecklistPerfFlags(next: Partial<ChecklistPerfFlags> | null): void {
  override = next;
}
