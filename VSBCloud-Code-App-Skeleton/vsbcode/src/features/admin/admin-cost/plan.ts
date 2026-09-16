/**
 * Admin Cost Screen — the write-plan shape, shared by the two cost families.
 *
 * A plan is what the pure rules RETURN instead of performing; `hooks.ts` hands it to one
 * `dataClient.batch`. That is the seam that removes the canvas's `Patch` chains, in which
 * a failure between two waves left a contract half-saved.
 */
export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  /** Why this write exists — shown in the confirm dialog and recorded in telemetry. */
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  /** Set when the plan was refused; `writes` is then empty and NOTHING is sent. */
  refusedReason?: string;
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });

export const refusePlan = (reason: string): WritePlan =>
  ({ writes: [], log: [], refusedReason: reason });
