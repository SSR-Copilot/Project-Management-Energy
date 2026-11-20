/**
 * Running a screen's `WritePlan` from React: progress text while it runs, a clear message when it
 * is refused or fails, an optional success text, and the cache keys to refresh afterwards.
 *
 * Shared by the admin screens (Default Checklists, CAPEX Accounts, …) so each screen only decides
 * WHAT to write (`rules.ts`) and which canvas texts to show.
 *
 * LANDED ROWS (rollback record, Generators bulk programme 9.3): the hook returns `lastLanded()`, a function
 * that reads the rows the MOST RECENT `run()` created, as `LandedRow[]` (`{ entitySet, id }`, in landing order,
 * single and bulk creates, the job's `then` plan included). It is reset when a `run()` starts and set when the
 * job settles, whether it succeeded or failed part-way, so a caller that gets `null` back from `run()` can read
 * what to delete:
 *
 *     const ids = await run(job);
 *     if (ids === null) await rollback(lastLanded());
 *
 * It is a ref read, not state: it never re-renders. `run()`'s own result and every message are unchanged.
 *
 * Two more records, same lifecycle (reset when `run()` starts, set when the job settles, ref reads, merged across
 * the first plan, the `then` plan and the failing `PlanError`; review fix F2):
 *  - `lastMaybeLanded()`: row ids of a failed `createMany` step that are NOT confirmed landed (they may or may not
 *    exist: an ambiguous failure such as a network error or timeout). Deleting one must treat 404 as "already
 *    gone". A row confirmed in `lastLanded()` never appears here.
 *  - `lastDeleted()`: rows whose `delete` write succeeded (404 = gone included), in plan order, also after a
 *    part-way failure, so a screen can name only the real leftovers after a failed rollback.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { isRecordGone, RECORD_GONE_TEXT } from "@/platform/errors";
import { permissionMessage } from "@/platform/privileges";
import { BulkRowsGoneError } from "./bulkBackend";
import {
  executePlan, PlanError, PlanRefusedError, type LandedRow, type PlanFailure, type PlanResult,
} from "./executePlan";
import { changeCount, type WritePlan } from "./writePlan";

/** One write: a ready plan, or a function that reads what it needs and returns the plan. */
export interface PlanJob {
  /** The canvas progress text (`locSpinnerInformationText` / `locAdminLoadingDialogText`). */
  progress: string;
  /**
   * The canvas success text, if the canvas had one. A function receives the plan that ran — for
   * a canvas text built from the steps the plan contains (PM Milestones' `colProcessingSteps`).
   */
  success?: string | ((plan: WritePlan) => string);
  /** This job's canvas error text, when it differs from the screen's default. */
  errorText?: (detail: string) => string;
  /**
   * For a job whose plan runs several INDEPENDENT writes at once and whose canvas names each failure on its own (the
   * Finance visit seeds, one `IfError` → `Notify` each). Called with every failure of the failing step; a string
   * replaces the whole message, `null` falls back to the default one. Optional; no other caller sets it.
   */
  failureText?: (failures: readonly PlanFailure[]) => string | null;
  plan: WritePlan | (() => Promise<WritePlan>);
  /**
   * A second step in the SAME job, after the plan's writes (D81): the canvas sequences `Patch → Flow.Run → Patch`
   * call the cloud flow here, with the first plan's result (the id a create returned), and return the writes that
   * follow — the `runid`-gated write-back, the audit note — or null when nothing follows. It may change the progress
   * text. One progress, one error, one refresh for the whole sequence. A failure in it is reported like a failed
   * write, and the first plan's writes stay, which is the canvas's own (non-transactional) order.
   */
  then?: (first: PlanResult, ctl: { setProgress: (text: string) => void }) => Promise<WritePlan | null | undefined>;
  /**
   * Called once the job's writes are over, `ok` false when they were refused or failed, BEFORE the awaited reload of the screen's
   * data starts. A panel closes here, so the reload runs behind a closed panel (the canvas closes it with `Select(…_Reset)`, then
   * `Navigate`s and refreshes). Optional; no other caller sets it.
   */
  onWritten?: (ok: boolean) => void;
  /** The spinner text for the reload that follows the writes (the canvas's next pop-up, "Loading, please wait..."). */
  reloadProgress?: string;
  /**
   * The cache keys this job refreshes afterwards, INSTEAD of the hook's `invalidate` list. Optional; no caller sets it
   * except the PM Checklist, whose cluster visit must not refetch the states, the gates and the Entra lookups it never changes.
   */
  invalidate?: readonly QueryKey[];
  /**
   * A subset of `invalidate` (compared by key) that is only MARKED STALE after the writes (`refetchType: "none"`): no request is
   * sent for it now; a screen that mounts the query later refetches it, as it does after any invalidation. Optional; no caller sets
   * it except the Generators screen with `GENERATORS_PERF.trimReload` on (D144).
   */
  staleOnly?: readonly QueryKey[];
  /**
   * Shows the job's result in the screen's cached rows BEFORE the writes run (Generators status toggle, D143), and returns the
   * rollback that puts the exact previous rows back. The hook calls the rollback when the writes end without success (a refusal,
   * a failure, a part-way stop, a "rows gone" refusal), before `onWritten(false)`; on success the cached rows stay until the reload
   * that follows replaces them. A throw from this function is ignored: the result is cosmetic and the save goes on without it.
   * Optional; no caller sets it except the Generators screen with its switch on.
   */
  optimistic?: (qc: QueryClient) => Promise<(() => void) | void> | (() => void) | void;
}

/**
 * A job's SECOND step (the `then` plan or the flow call in `then`) failed after the first plan's writes had landed
 * (generators fix F2). `done` / `total` already include the first plan, so "N of M changes had already been saved"
 * is true for the whole job, and the message says the saved rows exist so the user does not press Add again.
 *
 * DIVERGENCE: the canvas shows its generic error here and says nothing about the type that was already created
 * (D121 §1).
 */
export class PartlySavedJobError extends PlanError {
  readonly firstPlanSaved = true;
}

/** NEW TEXT (D121 §1): said after a job whose first writes stayed. */
export const PARTLY_SAVED_NOTE =
  "The saved rows stay: do not repeat the action. The screen shows them once it has reloaded.";

/** The message for a refused or failed write — permission first, then how far a plan got. */
export function writeErrorMessage(error: unknown, action: string, prefix?: (detail: string) => string): string {
  const denied = permissionMessage(error, action);
  if (denied) return denied;
  // Only a guarded update can raise this (no PM plan sets `guarded`), so PM texts are unchanged.
  if (isRecordGone(error)) return prefix ? prefix(RECORD_GONE_TEXT) : RECORD_GONE_TEXT;
  // A bulk update found rows gone (Generators bulk programme): its own message, like the gone row above.
  if (error instanceof BulkRowsGoneError) return prefix ? prefix(error.message) : error.message;
  if (error instanceof PlanError && error.rowsGone) {
    // Rows can be gone MID-plan (a status toggle flips its type before a later step's guard fails): say what was saved.
    let gone = error.cause instanceof BulkRowsGoneError ? error.cause.message : error.message;
    if (error.done > 0) gone = `${gone} ${error.done} of ${error.total} changes had already been saved.`;
    if (error instanceof PartlySavedJobError) gone = `${gone} ${PARTLY_SAVED_NOTE}`;
    return prefix ? prefix(gone) : gone;
  }
  let detail = error instanceof Error ? error.message : String(error);
  if (error instanceof PlanError) {
    const sent = error.done > 0 ? ` ${error.done} of ${error.total} changes had already been saved.` : "";
    const note = error instanceof PartlySavedJobError ? ` ${PARTLY_SAVED_NOTE}` : "";
    detail = `“${error.failedReason}” failed: ${error.message}.${sent}${note}`;
  }
  return prefix ? prefix(detail) : detail;
}

/** `PlanResult.landed`, tolerating an `executePlan` stand-in (a screen test mock) that predates the field. */
const landedOf = (r: PlanResult): readonly LandedRow[] => (r.landed as LandedRow[] | undefined) ?? [];
/** `PlanResult.deleted` / `PlanResult.maybeLanded`, tolerated the same way. */
const deletedOf = (r: PlanResult): readonly LandedRow[] => (r.deleted as LandedRow[] | undefined) ?? [];
const maybeLandedOf = (r: PlanResult): readonly LandedRow[] => (r.maybeLanded as LandedRow[] | undefined) ?? [];

const rowKey = (r: LandedRow): string => `${r.entitySet}|${r.id.toLowerCase()}`;
/** `rows` minus the ones in `confirmed` (a confirmed-landed row never counts as maybe-landed). */
const withoutRows = (rows: readonly LandedRow[], confirmed: readonly LandedRow[]): LandedRow[] => {
  const known = new Set(confirmed.map(rowKey));
  return rows.filter((r) => !known.has(rowKey(r)));
};

export function usePlanWrite(opts: {
  /** Refreshed after every write, successful or not. */
  invalidate: readonly QueryKey[];
  /** For the permission message: "You do not have permission to <action>." */
  action: string;
  /** Wraps the failure detail in the screen's canvas error text, when it has one. */
  errorText?: (detail: string) => string;
  /**
   * `"await"` (default): a job ends — its progress closes, `run` resolves — once the screen's data has been
   * reloaded. `"background"` (save performance, 6 Nov 2026): it ends as soon as the writes have landed and the
   * reload runs behind it; `refreshing` is true until that reload finishes, so a screen can hold back actions
   * that would read the old data.
   */
  refresh?: "await" | "background";
}) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Background reloads still running (two quick jobs can overlap). */
  const pendingRefreshes = useRef(0);
  /** Rows the most recent `run()` created (see the file header). */
  const landedRef = useRef<LandedRow[]>([]);
  /** Not-confirmed rows of a failed createMany of the most recent `run()` (see the file header). */
  const maybeLandedRef = useRef<LandedRow[]>([]);
  /** Rows the most recent `run()` deleted (see the file header). */
  const deletedRef = useRef<LandedRow[]>([]);

  const mutation = useMutation({
    mutationFn: async (job: PlanJob) => {
      // The writes are over (landed or failed) once the body settles, BEFORE `onSettled` reloads the screen's data:
      // tell the caller (it closes its panel) and switch the spinner text to the reload's (D106).
      let ok = false;
      let rollback: (() => void) | undefined;
      if (job.optimistic) {
        try { rollback = (await job.optimistic(qc)) ?? undefined; } catch { rollback = undefined; }
      }
      try {
        const result = await runJob(job);
        ok = true;
        return result;
      } finally {
        if (!ok) rollback?.();
        job.onWritten?.(ok);
        if (job.reloadProgress) setProgress(job.reloadProgress);
      }
    },
    onSettled: (_data, _error, job) => {
      const stale = new Set((job?.staleOnly ?? []).map((key) => JSON.stringify(key)));
      const reload = Promise.all((job?.invalidate ?? opts.invalidate).map((queryKey) =>
        qc.invalidateQueries(stale.has(JSON.stringify(queryKey)) ? { queryKey, refetchType: "none" } : { queryKey })));
      if (opts.refresh !== "background") return reload;
      pendingRefreshes.current += 1;
      setRefreshing(true);
      void reload.catch(() => undefined).finally(() => {
        pendingRefreshes.current -= 1;
        if (pendingRefreshes.current === 0) setRefreshing(false);
      });
      return undefined;
    },
  });

  async function runJob(job: PlanJob) {
    const landed: LandedRow[] = [];
    const maybeLanded: LandedRow[] = [];
    const deleted: LandedRow[] = [];
    /** True once the thrown PlanError already carries the first plan's rows (they are merged above). */
    let carriesFirstPlan = false;
    try {
      const plan = typeof job.plan === "function" ? await job.plan() : job.plan;
      const first = await executePlan(plan, job.progress);
      landed.push(...landedOf(first));
      maybeLanded.push(...maybeLandedOf(first));
      deleted.push(...deletedOf(first));
      if (!job.then) return { ...first, plan };
      let next: WritePlan | null | undefined;
      try {
        next = await job.then(first, { setProgress });
      } catch (e) {
        // F2: a failure of the follow-up step (a flow call) after the first plan landed must say so: a plain Error would
        // read as "nothing was saved" and the user would press Add again.
        if (first.done > 0 && !(e instanceof PlanError)) {
          throw new PartlySavedJobError(first.done, first.done, job.progress, e);
        }
        throw e;
      }
      if (!next) return { ...first, plan };
      let second: PlanResult;
      try {
        second = await executePlan(next, job.progress);
      } catch (e) {
        // A fail-closed refusal of the SECOND plan sent nothing, but the first plan's writes stay: report them
        // like any part-way stop ("N of M changes had already been saved") instead of "nothing was saved".
        if (e instanceof PlanRefusedError && first.done > 0) {
          carriesFirstPlan = true;
          throw new PartlySavedJobError(
            first.done, first.done + next.writes.reduce((n, w) => n + changeCount(w), 0), job.progress, e,
            [...first.createdIds], [...landedOf(first)],
            { maybeLanded: [...maybeLandedOf(first)], deleted: [...deletedOf(first)] },
          );
        }
        // F2: the second plan stopped part-way: the counts cover the whole job. The error carries the SECOND plan's rows
        // only (the catch below merges them; the first plan's are already collected above).
        if (e instanceof PlanError && first.done > 0) {
          throw new PartlySavedJobError(
            first.done + e.done, first.done + e.total, e.failedReason, e.cause,
            [...first.createdIds, ...e.createdIds], [...e.landed],
            { maybeLanded: [...e.maybeLanded], deleted: [...e.deleted], failures: e.failures },
          );
        }
        throw e;
      }
      landed.push(...landedOf(second));
      maybeLanded.push(...maybeLandedOf(second));
      deleted.push(...deletedOf(second));
      return {
        done: first.done + second.done,
        createdIds: [...first.createdIds, ...second.createdIds],
        createdRows: { ...first.createdRows, ...second.createdRows },
        landed: [...landed],
        deleted: [...deleted],
        maybeLanded: [],
        plan,
      };
    } catch (e) {
      // A part-way failure still tells the caller what landed (the first plan's rows were pushed above).
      if (e instanceof PlanError && !carriesFirstPlan) {
        landed.push(...(e.landed as readonly LandedRow[] | undefined ?? []));
        maybeLanded.push(...(e.maybeLanded as readonly LandedRow[] | undefined ?? []));
        deleted.push(...(e.deleted as readonly LandedRow[] | undefined ?? []));
      }
      throw e;
    } finally {
      landedRef.current = landed;
      maybeLandedRef.current = withoutRows(maybeLanded, landed);
      deletedRef.current = deleted;
    }
  }

  /** Runs one job; resolves to the created ids, or null when it was refused or failed. */
  const run = async (job: PlanJob): Promise<string[] | null> => {
    setError(null);
    setSuccess(null);
    landedRef.current = [];
    maybeLandedRef.current = [];
    deletedRef.current = [];
    setProgress(job.progress);
    try {
      const result = await mutation.mutateAsync(job);
      if (job.success) setSuccess(typeof job.success === "function" ? job.success(result.plan) : job.success);
      return result.createdIds;
    } catch (e) {
      const own = e instanceof PlanError && job.failureText ? job.failureText(e.failures) : null;
      setError(own ?? writeErrorMessage(e, opts.action, job.errorText ?? opts.errorText));
      return null;
    } finally {
      setProgress(null);
    }
  };

  // Stable across renders, so a screen can clear the messages from a timer effect.
  const clear = useCallback(() => { setError(null); setSuccess(null); }, []);
  /** The rows the most recent `run()` created (also after a failure): see the file header. */
  const lastLanded = useCallback((): readonly LandedRow[] => landedRef.current, []);
  /** Rows of a failed createMany that may or may not exist (also after a failure): see the file header. */
  const lastMaybeLanded = useCallback((): readonly LandedRow[] => maybeLandedRef.current, []);
  /** Rows the most recent `run()` deleted (also after a failure): see the file header. */
  const lastDeleted = useCallback((): readonly LandedRow[] => deletedRef.current, []);
  return { run, progress, error, success, clear, refreshing, lastLanded, lastMaybeLanded, lastDeleted };
}
