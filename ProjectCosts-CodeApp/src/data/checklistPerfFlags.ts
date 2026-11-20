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
 */
export interface ChecklistPerfFlags {
  targetedReload: boolean;
  earlyRows: boolean;
  earlyVisit: boolean;
  prefetchCopy: boolean;
  wideCopy: boolean;
}

/** The switches as shipped. */
export const CHECKLIST_PERF: Readonly<ChecklistPerfFlags> = {
  targetedReload: true,
  earlyRows: true,
  earlyVisit: true,
  prefetchCopy: true,
  wideCopy: true,
};

/** Every switch at its OLD behaviour: today's requests exactly (tests, and the rollback in one line). */
export const CHECKLIST_PERF_ALL_OFF: Readonly<ChecklistPerfFlags> = {
  targetedReload: false, earlyRows: false, earlyVisit: false, prefetchCopy: false, wideCopy: false,
};

let override: Partial<ChecklistPerfFlags> | null = null;

/** The switches in force: the shipped values, then the override a test installed. */
export const checklistPerf = (): Readonly<ChecklistPerfFlags> => ({ ...CHECKLIST_PERF, ...override });

/** Test seam: replaces switches for the rest of the run; `null` restores the shipped values. */
export function setChecklistPerfFlags(next: Partial<ChecklistPerfFlags> | null): void {
  override = next;
}
