/**
 * Running a screen's `WritePlan` from React: progress text while it runs, a clear message when it
 * is refused or fails, an optional success text, and the cache keys to refresh afterwards.
 *
 * Shared by the admin screens (Default Checklists, CAPEX Accounts, …) so each screen only decides
 * WHAT to write (`rules.ts`) and which canvas texts to show.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { isRecordGone, RECORD_GONE_TEXT } from "@/platform/errors";
import { permissionMessage } from "@/platform/privileges";
import { executePlan, PlanError, type PlanResult } from "./executePlan";
import type { WritePlan } from "./writePlan";

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
  plan: WritePlan | (() => Promise<WritePlan>);
  /**
   * A second step in the SAME job, after the plan's writes (D81): the canvas sequences `Patch → Flow.Run → Patch`
   * call the cloud flow here, with the first plan's result (the id a create returned), and return the writes that
   * follow — the `runid`-gated write-back, the audit note — or null when nothing follows. It may change the progress
   * text. One progress, one error, one refresh for the whole sequence. A failure in it is reported like a failed
   * write, and the first plan's writes stay, which is the canvas's own (non-transactional) order.
   */
  then?: (first: PlanResult, ctl: { setProgress: (text: string) => void }) => Promise<WritePlan | null | undefined>;
}

/** The message for a refused or failed write — permission first, then how far a plan got. */
export function writeErrorMessage(error: unknown, action: string, prefix?: (detail: string) => string): string {
  const denied = permissionMessage(error, action);
  if (denied) return denied;
  // Only a guarded update can raise this (no PM plan sets `guarded`), so PM texts are unchanged.
  if (isRecordGone(error)) return prefix ? prefix(RECORD_GONE_TEXT) : RECORD_GONE_TEXT;
  let detail = error instanceof Error ? error.message : String(error);
  if (error instanceof PlanError) {
    const sent = error.done > 0 ? ` ${error.done} of ${error.total} changes had already been saved.` : "";
    detail = `“${error.failedReason}” failed: ${error.message}.${sent}`;
  }
  return prefix ? prefix(detail) : detail;
}

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

  const mutation = useMutation({
    mutationFn: async (job: PlanJob) => {
      const plan = typeof job.plan === "function" ? await job.plan() : job.plan;
      const first = await executePlan(plan, job.progress);
      if (!job.then) return { ...first, plan };
      const next = await job.then(first, { setProgress });
      if (!next) return { ...first, plan };
      const second = await executePlan(next, job.progress);
      return {
        done: first.done + second.done,
        createdIds: [...first.createdIds, ...second.createdIds],
        createdRows: { ...first.createdRows, ...second.createdRows },
        plan,
      };
    },
    onSettled: () => {
      const reload = Promise.all(opts.invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
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

  /** Runs one job; resolves to the created ids, or null when it was refused or failed. */
  const run = async (job: PlanJob): Promise<string[] | null> => {
    setError(null);
    setSuccess(null);
    setProgress(job.progress);
    try {
      const result = await mutation.mutateAsync(job);
      if (job.success) setSuccess(typeof job.success === "function" ? job.success(result.plan) : job.success);
      return result.createdIds;
    } catch (e) {
      setError(writeErrorMessage(e, opts.action, job.errorText ?? opts.errorText));
      return null;
    } finally {
      setProgress(null);
    }
  };

  // Stable across renders, so a screen can clear the messages from a timer effect.
  const clear = useCallback(() => { setError(null); setSuccess(null); }, []);
  return { run, progress, error, success, clear, refreshing };
}
