/**
 * The shape a `rules.ts` write plan takes: what to create, update or delete, decided purely.
 *
 * Rules decide WHAT to write (CONVENTIONS rule 5 — "write-payload shaping" is a rule); the
 * screen's data layer decides HOW, through the generated service and `data/client.ts`
 * (`unwrap`, `deleteRecord`). There is no transactional changeset on the SDK
 * (KNOWN-RISKS), so a multi-op plan can half-apply — the data layer must report which ops ran.
 */
export interface WriteOp {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  /**
   * `update` only. true = read the row by primary key first (`updateRecordIfExists`); when it is
   * gone, send NOTHING and fail with `RecordGoneError`, so the SDK 1.3.1 PATCH-is-an-upsert
   * behaviour can never recreate a row another user deleted. Unset (every PM plan) = a plain PATCH.
   */
  guarded?: boolean;
}

/** One write in a plan, with why it exists — shown in the confirm dialog and in telemetry. */
export interface PlannedWrite extends WriteOp {
  reason: string;
  /**
   * Verbatim text for the failure's operation name. Default `${operation}: ${reason}`; a screen
   * whose error texts are pinned (e.g. "update gate active") sets it so they stay word for word.
   */
  label?: string;
}

/** An `update` that never upserts: see `WriteOp.guarded`. */
export const guardedUpdate = (
  entitySet: string,
  id: string,
  data: Record<string, unknown>,
  reason: string,
  label?: string,
): PlannedWrite => ({
  op: "update", entitySet, id, data, reason, guarded: true, ...(label ? { label } : {}),
});

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  /** Set when the plan was refused; `writes` is then empty and NOTHING is sent. */
  refusedReason?: string;
}

/**
 * Placeholder id for "the row the most recent create in this plan made". `data/executePlan.ts`
 * substitutes the id the create returned before sending the write that carries it.
 */
export const CREATED_ROW_ID = "@created";

/**
 * Placeholder for "the row the plan's `index`-th create made" (0-based), for a write that must
 * point at a parent created earlier in the same plan while other creates come in between — e.g.
 * Admin Contract's children, each bound with `/<set>(@created#0)`. `data/executePlan.ts`
 * substitutes it in a write's `id` and inside any string value of its `data`.
 */
export const createdRowRef = (index: number): string => `@created#${index}`;

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });

export const refusePlan = (reason: string): WritePlan =>
  ({ writes: [], log: [], refusedReason: reason });
