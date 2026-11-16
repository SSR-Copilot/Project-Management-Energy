import type { BulkRow } from "./bulkBackend";

/**
 * The shape a `rules.ts` write plan takes: what to create, update or delete, decided purely.
 *
 * Rules decide WHAT to write (CONVENTIONS rule 5 — "write-payload shaping" is a rule); the
 * screen's data layer decides HOW, through the generated service and `data/client.ts`
 * (`unwrap`, `deleteRecord`). There is no transactional changeset on the SDK
 * (KNOWN-RISKS), so a multi-op plan can half-apply — the data layer must report which ops ran.
 */
export interface WriteOp {
  /**
   * `createMany` / `updateMany` are BULK operations (Generators bulk programme, plan 2.1): one step that
   * carries `rows` and goes through the bulk backend (`data/bulkBackend.ts`). They have no `id` / `data`
   * of their own, cannot be `guarded` (an `updateMany` is always guarded by the backend) and can never be
   * part of a `together()` group.
   */
  op: "create" | "update" | "delete" | "createMany" | "updateMany";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  /** `createMany` / `updateMany` only: the rows. Create rows carry a client-generated `id`; update rows the existing key. */
  rows?: readonly BulkRow[];
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
  /**
   * Opt-in (save performance, 5 Nov 2026): consecutive `concurrent` writes are sent together and
   * awaited as one step (`data/executePlan.ts`). Only for independent rows whose relative order no
   * server automation depends on; such a write sees the ids created BEFORE its run, never inside it.
   */
  concurrent?: boolean;
  /**
   * Only meaningful with `concurrent`: how many writes of this group may be in flight at once. Unset =
   * `WRITE_CONCURRENCY` (8). Set through `together(writes, { limit })`; see `LEAF_DELETE_CONCURRENCY` and
   * `CASCADE_DELETE_CONCURRENCY` in `data/concurrency.ts` for the two tiers deletes use.
   */
  concurrencyLimit?: number;
  /**
   * Set by `together()`: the id of the group this write belongs to. Writes of different groups never share a run,
   * so two adjacent `together()` calls are two groups that run one after the other, each with its own limit. A
   * hand-built `concurrent` write without it merges with its neighbours as before (UT-PLAN-032..036).
   */
  concurrencyGroup?: number;
  /**
   * `delete` only (Generators delete hardening, DEL-2). true = the engine sends this delete with a bounded retry
   * (`withDeleteRetry`: 429, 503 with Retry-After, 500, 504, network) and a STRICT gone-check
   * (`unwrapDeleteStrict`: only 404 or `0x80040217` counts as gone, never the free text "does not exist"), and reads
   * every row that answered "gone" back (`verifyGone`). Unset (every existing caller) = the plain delete, unchanged.
   */
  hardened?: boolean;
  /**
   * `delete` only, with `hardened`: also read the row back after a SUCCESSFUL delete, when
   * `GENERATORS_DELETE.verifyDeletes` is on. A row still present fails the plan with `DeleteNotConfirmedError`.
   */
  confirm?: boolean;
  /**
   * Inside a `together()` group: writes with the same non-empty `serialKey` run strictly one after another, in plan
   * order (for example the deletes that share a parent row); different keys run in parallel up to the group's limit;
   * no key = as before. Ignored outside a concurrent group.
   */
  serialKey?: string;
  /** Set by `together(…, { stopOnFailure: true })` on every write of the group; see `TogetherOptions.stopOnFailure`. */
  stopOnFailure?: boolean;
}

let groupCounter = 0;

/** True for a `createMany` / `updateMany` step (one bulk request sequence, counted per row). */
export const isBulkWrite = (w: Pick<WriteOp, "op">): boolean => w.op === "createMany" || w.op === "updateMany";

/** How many changes a step counts for: its rows for a bulk step, otherwise 1. */
export const changeCount = (w: WriteOp): number => (isBulkWrite(w) ? (w.rows?.length ?? 0) : 1);

export interface TogetherOptions {
  /**
   * In-flight limit of THIS group (default `WRITE_CONCURRENCY`, 8). Each group has its own gate, and
   * `executePlan` runs groups one after the other, so the limit is a per-group ceiling, not a shared one:
   * a caller must never run two groups at the same time.
   */
  limit?: number;
  /**
   * true = after the first failure of the group no NEW write is started (writes already in flight finish, and the
   * group still reports every failure it saw; `deleted` and `landed` stay complete for the writes that ran). The
   * writes never started are not counted as done. Default false: every write is sent, as before (`allSettled`).
   */
  stopOnFailure?: boolean;
}

/**
 * Marks writes `concurrent` (save performance): `executePlan` sends them together, 8 at a time (or
 * `opts.limit`), instead of one round trip each. Only for writes that depend on nothing but rows created
 * BEFORE them and whose relative order no server automation depends on.
 *
 * A bulk operation (`createMany` / `updateMany`) cannot be in a group: this throws, as a programmer error.
 * EACH CALL IS ITS OWN GROUP (`concurrencyGroup`): adjacent `together()` calls never merge, whatever their limits;
 * a group finishes before the next one starts.
 */
export const together = (writes: readonly PlannedWrite[], opts?: TogetherOptions): PlannedWrite[] => {
  const limit = opts?.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`together(): the limit must be a whole number of at least 1 (got ${String(limit)})`);
  }
  groupCounter += 1;
  const group = groupCounter;
  return writes.map((w) => {
    if (isBulkWrite(w)) {
      throw new Error(`together(): "${w.reason}" is a bulk operation (${w.op}); a bulk operation is its own plan step and cannot be part of a concurrent group`);
    }
    return {
      ...w, concurrent: true, concurrencyGroup: group,
      ...(limit === undefined ? {} : { concurrencyLimit: limit }),
      ...(opts?.stopOnFailure ? { stopOnFailure: true } : {}),
    };
  });
};

/**
 * A `delete` with the hardened engine path (bounded retry, strict gone-check, read-back of gone rows): see
 * `PlannedWrite.hardened`. `confirm` also reads a successfully deleted row back (when `verifyDeletes` is on);
 * `serialKey` orders it inside a `together()` group.
 */
export const hardenedDelete = (
  entitySet: string,
  id: string,
  reason: string,
  o: { confirm?: boolean; serialKey?: string } = {},
): PlannedWrite => ({
  op: "delete", entitySet, id, reason, hardened: true,
  ...(o.confirm ? { confirm: true } : {}),
  ...(o.serialKey ? { serialKey: o.serialKey } : {}),
});

/** A bulk create: one plan step, ids pre-generated by the caller (`rows[i].id`), landed ids appended to `createdIds` in row order. */
export const createMany = (
  entitySet: string, rows: readonly BulkRow[], reason: string, label?: string,
): PlannedWrite => ({ op: "createMany", entitySet, rows, reason, ...(label ? { label } : {}) });

/** A bulk update (guarded by the backend: nothing is sent when a row is gone). */
export const updateMany = (
  entitySet: string, rows: readonly BulkRow[], reason: string, label?: string,
): PlannedWrite => ({ op: "updateMany", entitySet, rows, reason, ...(label ? { label } : {}) });

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
