/**
 * Runs a `WritePlan` (from a screen's `rules.ts`) against Dataverse, one write at a time, IN
 * THE PLAN'S ORDER.
 *
 * Order matters and is never changed here: server-side flows and plugins fire on each write
 * (`ProjectDocs/migration-plans/04-flow-inventory.md`), so a plan reproduces the canvas's own
 * sequence — e.g. Admin Default Checklists' create-then-update, which is what carries a task's
 * status into the project checklists.
 *
 * NOT TRANSACTIONAL. The SDK has no changeset, so a plan can half-apply. A failure stops the run
 * and throws `PlanError`, which says how many writes had already been sent, so the screen can
 * tell the user exactly what happened instead of claiming nothing changed.
 *
 * `CREATED_ROW_ID` in a write's `id` is replaced by the id of the most recent create in the same
 * plan (the canvas pattern `Patch(Defaults(T), …)` followed by `UpdateIf(T, id = <new>, …)`).
 * `createdRowRef(n)` — in the `id` or inside a string value of `data`, such as a bind — is
 * replaced by the id of the plan's n-th create (a parent row its children are bound to).
 *
 * A write with `guarded: true` (an `update` only) first reads the row by primary key and, when it
 * is gone, sends nothing and fails with `RecordGoneError` — the SDK 1.3.1 PATCH is an upsert, so
 * this read is what stops it recreating a row another user deleted. The guard is
 * `updateRecordIfExists` (`data/client.ts`), not a second copy. No PM plan sets `guarded`.
 *
 * OPT-IN PARALLEL RUNS (save performance, 5 Nov 2026): consecutive writes marked `concurrent` are
 * sent together and awaited as one step; the plan's order holds between steps. A plan uses it only
 * for independent rows (no server automation depends on their relative order); a write in a run
 * sees the ids created before the run, never one created inside it. A failure in a run lets its
 * other writes finish, then stops the plan with `PlanError` (`done` = the writes that landed).
 * Plans that mark nothing run exactly as before. Pinned by UT-PLAN-032..035. A run holds at most
 * `WRITE_CONCURRENCY` (8) requests in flight (6 Nov 2026): a WTG type's turbines can number 200, and
 * Dataverse cuts a user off at 52 concurrent requests with no retry on the write path (`concurrency.ts`).
 *
 * TIERED GROUPS (Generators bulk programme, 1B): `together(writes, { limit })` gives a group its own in-flight
 * limit (default 8). Each `together()` call is its own group (`concurrencyGroup`): a run is the consecutive
 * concurrent writes of ONE group (hand-built `concurrent` writes without a group merge as before), with its own
 * gate. Adjacent groups never merge and run one after the other, so the limit is per run, never summed.
 *
 * BULK STEPS (plan 2.1): a `createMany` / `updateMany` write is ONE step in plan order, sent through
 * `getBulkBackend()` (`data/bulkBackend.ts`; the backend logs each request, so the engine adds no `[VSB]` line).
 * `createdRowRef` placeholders are substituted per row (in `data` string values and in the row `id`) from the
 * ids created by EARLIER steps; the created ids are appended to `createdIds` in row order; the page-token cache
 * of the entity set is invalidated once per bulk step. A bulk step inside a `together()` group (or marked
 * `concurrent` / `guarded`) is a programmer error and throws BEFORE anything is sent. Counting is per ROW for
 * bulk steps: `done` / `total` of `PlanResult` and `PlanError` are rows (a single write counts 1), so the
 * "N of M changes had already been saved" sentence stays true. Failures: `BulkBatchError` -> `PlanError` (done
 * grows by the rows that landed); `BulkRowsGoneError` -> `PlanError` whose `rowsGone` is true;
 * `BulkBackendValidationError` -> `PlanRefusedError` when nothing at all had landed yet, else `PlanError`.
 *
 * LANDED ROWS (rollback record, plan 9.3): `PlanResult.landed` / `PlanError.landed` list every row a create
 * made (single or bulk) as `{ entitySet, id }`, in landing order. A bulk create whose failure reports no
 * `landedIds` contributes nothing (the ids are unknown to the engine; the caller pre-generated them).
 *
 * DIVERGENCE (no canvas equivalent; P-1 stale skip tokens): every write Dataverse ACCEPTS drops
 * the cached `countedPage` walks for its table via `invalidatePageTokens(write.entitySet)`. A
 * paging cookie encodes the last row's sort key and primary key, so once a create, an update of a
 * sortable column (name, total capacity, start date, milestone dates) or a delete changes the row
 * set, the cached tokens point at the wrong rows — and a cookie minted against a larger set can
 * point past the end of the current one, which Dataverse answers with an EMPTY page. The canvas
 * app has no paging cache, so there is nothing to reproduce; this only keeps the code app's own
 * cache honest. It lives HERE, not in each feature, because every PM/admin/cost write that goes
 * through a WritePlan passes this point (nine `vsb_projects` writes alone), and a per-call-site
 * invalidation is exactly the copy CONVENTIONS rule 17 forbids — the one a new screen forgets.
 * It runs for EVERY entity set, not just `vsb_projects`: any table may be paged by `countedPage`
 * later, and invalidating a table nobody pages is a cheap no-op (a scan of a small Map).
 * It runs only once the server has accepted the write, so a failed, refused or guarded-gone step
 * keeps a cache that is still correct. Pinned by UT-PLAN-025..031.
 */
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { isRecordGone, unwrap, unwrapDelete } from "@/platform/errors";
import { logData } from "@/platform/requestLog";
import { invalidatePageTokens, updateRecordIfExists, type GuardedUpdateClient } from "./client";
import {
  BulkBackendValidationError, BulkBatchError, BulkRowsGoneError, getBulkBackend, type BulkRow,
} from "./bulkBackend";
import { createGate, WRITE_CONCURRENCY } from "./concurrency";
import { changeCount, CREATED_ROW_ID, isBulkWrite, type PlannedWrite, type WritePlan } from "./writePlan";

/** A row a create made: kept so a failed save can be rolled back (delete these, last first). The exact shape is a contract. */
export interface LandedRow {
  entitySet: string;
  id: string;
}

/** The three SDK calls a plan needs — the `getClient` shape, narrowed so tests can stub it. */
export interface PlanClient {
  createRecordAsync: ReturnType<typeof getClient>["createRecordAsync"];
  updateRecordAsync: ReturnType<typeof getClient>["updateRecordAsync"];
  deleteRecordAsync: ReturnType<typeof getClient>["deleteRecordAsync"];
}

/**
 * What a plan with `guarded` writes needs from the client: the three SDK calls plus the read the
 * guard makes. The real `getClient` result has it; `executePlan` fails closed when a stub lacks it.
 */
export type GuardedPlanClient = PlanClient & Pick<GuardedUpdateClient, "retrieveMultipleRecordsAsync">;

export interface PlanResult {
  /** Changes sent successfully: one per single write, one per ROW of a bulk step. */
  done: number;
  /** The ids returned by the plan's creates, in order. */
  createdIds: string[];
  /**
   * Each created row as Dataverse returned it, by id (6 Nov 2026). The SDK sends every create with
   * `Prefer: return=representation` (`runtimeDataClient._mergePreferHeaders`, `@microsoft/power-apps` 1.3.1),
   * so server-generated columns — an autonumber `vsb_name` — arrive with the create and need no read-back.
   */
  createdRows: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Every row the plan's creates made (single and bulk), in landing order. */
  landed: LandedRow[];
}

/** A plan that stopped part-way. `done` writes were sent before `failedReason` failed. */
export class PlanError extends Error {
  readonly done: number;
  readonly total: number;
  readonly failedReason: string;
  override readonly cause: unknown;
  /** Ids the plan's creates returned BEFORE the failure (rows that exist although the plan failed). */
  readonly createdIds: readonly string[];
  /** Every row that landed BEFORE the failure (single and bulk creates), in landing order: what a rollback deletes. */
  readonly landed: readonly LandedRow[];

  constructor(
    done: number, total: number, failedReason: string, cause: unknown, createdIds: readonly string[] = [],
    landed: readonly LandedRow[] = [],
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PlanError";
    this.done = done;
    this.total = total;
    this.failedReason = failedReason;
    this.cause = cause;
    this.createdIds = createdIds;
    this.landed = landed;
  }

  /** True when a bulk update found some of its rows gone (nothing was sent for that step). */
  get rowsGone(): boolean {
    let current: unknown = this.cause;
    for (let depth = 0; depth < 5 && current; depth += 1) {
      if (current instanceof BulkRowsGoneError) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  }

  /** True when the failed write was a guarded update whose row was gone (nothing was sent for it). */
  get gone(): boolean {
    return isRecordGone(this.cause);
  }
}

/** The plan was refused (`refusePlan`): NOTHING was sent. Same message as the plain `Error` it replaces. */
export class PlanRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PlanRefusedError";
  }
}

/** A create succeeded but Dataverse returned no id, so later writes could not refer to the new row. */
export class CreatedIdMissingError extends Error {
  constructor(label: string) {
    super(`${label}: the create returned no id`);
    this.name = "CreatedIdMissingError";
  }
}

const CREATED_REF = /@created#(\d+)/g;

/**
 * Replaces every `createdRowRef(n)` in `value` with the n-th created id.
 *
 * KNOWN HAZARD (pre-existing, deliberately left as is): this is applied to EVERY string value of
 * a write's `data`, so free text a user typed that happens to contain `@created#<n>` would be
 * rewritten, or throw "refers to created row" when no such create ran. A plan that carries
 * free-text fields must not rely on this being impossible.
 */
function resolveRefs(value: string, createdIds: readonly string[]): string {
  return value.replace(CREATED_REF, (_, n: string) => {
    const id = createdIds[Number(n)];
    if (!id) throw new Error(`a write refers to created row ${n}, but that create has not run`);
    return id;
  });
}

function resolveData(
  data: Record<string, unknown> | undefined, createdIds: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = typeof v === "string" ? resolveRefs(v, createdIds) : v;
  }
  return out;
}

const primaryKeyOf = (entitySet: string): string => {
  const info = (dataSourcesInfo as Record<string, { primaryKey?: string } | undefined>)[entitySet];
  if (!info?.primaryKey) {
    throw new Error(
      `Table "${entitySet}" is not registered in this app — run \`pac code add-data-source\` for it.`,
    );
  }
  return info.primaryKey;
};

/**
 * Sends one write and resolves to the id it created (a create) or `undefined`. `createdIds` are the
 * ids created by the plan's EARLIER steps, for `CREATED_ROW_ID` and `createdRowRef(n)`.
 */
async function sendWrite(
  write: WritePlan["writes"][number],
  operation: string,
  client: PlanClient & Partial<GuardedPlanClient>,
  createdIds: readonly string[],
  /** Collects each created row (as returned) by its id — `PlanResult.createdRows`. */
  createdRows?: Record<string, Readonly<Record<string, unknown>>>,
): Promise<string | undefined> {
  if (write.guarded && write.op !== "update") {
    throw new Error("only an update can be guarded (guarded: true on a create or delete is a bug in the plan)");
  }
  const id = write.id === CREATED_ROW_ID
    ? createdIds[createdIds.length - 1]
    : write.id === undefined ? undefined : resolveRefs(write.id, createdIds);
  if (write.id === CREATED_ROW_ID && !id) {
    throw new Error("a write refers to a created row, but no create preceded it");
  }
  const kind = write.op;
  if (kind === "createMany" || kind === "updateMany") {
    throw new Error(`"${write.reason}": a bulk operation is not a single write (programmer error in the plan)`);
  }
  const data = resolveData(write.data, createdIds);
  const label = write.label ?? `${operation}: ${write.reason}`;
  const t0 = performance.now();
  /** One DATA line per write (a guarded update logs itself inside `updateRecordIfExists`). */
  const logged = () => logData({ kind, target: write.entitySet, rows: 1, ms: performance.now() - t0, ok: true });
  if (write.op === "create") {
    const key = primaryKeyOf(write.entitySet);
    const row = unwrap(
      await client.createRecordAsync<Record<string, unknown>, Record<string, unknown>>(
        write.entitySet, data,
      ),
      label,
    );
    // The row exists from here on, even if the id check below fails the step.
    invalidatePageTokens(write.entitySet);
    const newId = row?.[key];
    if (typeof newId !== "string" || !newId) throw new CreatedIdMissingError(label);
    if (createdRows && row) createdRows[newId] = row;
    logged();
    return newId;
  }
  if (write.op === "update" && write.guarded === true) {
    const primaryKey = primaryKeyOf(write.entitySet);
    if (typeof client.retrieveMultipleRecordsAsync !== "function") {
      throw new Error(`${label}: this client cannot read rows, so a guarded update is refused rather than sent unguarded`);
    }
    const guardClient = client as GuardedPlanClient;
    await updateRecordIfExists(label, write.entitySet, id!, data, {
      primaryKey,
      client: () => guardClient as unknown as GuardedUpdateClient,
    });
    // Reached only when the PATCH was accepted. A gone row (RecordGoneError, from the read
    // or a 404 PATCH) throws above with nothing sent, so it is NOT this plan's mutation and
    // the cache is left alone; another user's delete is outside what this cache can track.
    invalidatePageTokens(write.entitySet);
    return undefined;
  }
  if (write.op === "update") {
    primaryKeyOf(write.entitySet);
    unwrap(
      await client.updateRecordAsync<Record<string, unknown>, Record<string, unknown>>(
        write.entitySet, id!, data,
      ),
      label,
    );
    logged();
    invalidatePageTokens(write.entitySet);
    return undefined;
  }
  primaryKeyOf(write.entitySet);
  // Already gone counts as deleted (`unwrapDelete`).
  unwrapDelete(await client.deleteRecordAsync(write.entitySet, id!), label);
  logged();
  invalidatePageTokens(write.entitySet);
  return undefined;
}

/** Throws (before anything is sent) for a bulk step that is marked concurrent / guarded or has no rows array. */
function assertPlanShape(writes: readonly PlannedWrite[]): void {
  for (const w of writes) {
    if (!isBulkWrite(w)) continue;
    if (w.concurrent) {
      throw new Error(`"${w.reason}": a bulk operation (${w.op}) cannot be part of a together() group (programmer error in the plan)`);
    }
    if (w.guarded) throw new Error(`"${w.reason}": guarded does not apply to a bulk operation (updateMany is always guarded by the backend)`);
    if (!Array.isArray(w.rows)) throw new Error(`"${w.reason}": a bulk operation needs its rows (programmer error in the plan)`);
  }
}

/** Runs one bulk step. Pushes what landed into `createdIds` / `landed`; resolves to the number of rows that landed. */
async function sendBulk(
  write: PlannedWrite, operation: string, createdIds: string[], landed: LandedRow[],
): Promise<number> {
  const rows = write.rows ?? [];
  if (rows.length === 0) return 0;
  const resolved: BulkRow[] = rows.map((r) => ({
    id: resolveRefs(r.id, createdIds),
    data: resolveData(r.data as Record<string, unknown>, createdIds),
  }));
  const backend = getBulkBackend();
  const label = write.label ?? `${operation}: ${write.reason}`;
  if (write.op === "createMany") {
    const result = await backend.createMany(write.entitySet, resolved, { label });
    invalidatePageTokens(write.entitySet);
    for (const id of result.ids) {
      createdIds.push(id);
      landed.push({ entitySet: write.entitySet, id });
    }
    if (result.ids.length !== rows.length || result.ids.some((id) => typeof id !== "string" || !id)) {
      throw new CreatedIdMissingError(label);
    }
    return rows.length;
  }
  await backend.updateMany(write.entitySet, resolved, { label });
  invalidatePageTokens(write.entitySet);
  return rows.length;
}

export async function executePlan(
  plan: WritePlan,
  operation: string,
  client: PlanClient & Partial<GuardedPlanClient> = getClient(dataSourcesInfo),
): Promise<PlanResult> {
  if (plan.refusedReason) throw new PlanRefusedError(plan.refusedReason);

  const writes = plan.writes;
  assertPlanShape(writes);
  const total = writes.reduce((n, w) => n + changeCount(w), 0);
  const createdIds: string[] = [];
  const createdRows: Record<string, Readonly<Record<string, unknown>>> = {};
  const landed: LandedRow[] = [];
  let done = 0;
  for (let i = 0; i < writes.length;) {
    const write = writes[i]!;
    if (isBulkWrite(write)) {
      try {
        done += await sendBulk(write, operation, createdIds, landed);
      } catch (cause) {
        if (cause instanceof BulkBatchError) {
          done += cause.rowsLanded;
          if (cause.rowsLanded > 0) invalidatePageTokens(write.entitySet);
          if (write.op === "createMany") {
            for (const id of cause.landedIds) {
              createdIds.push(id);
              landed.push({ entitySet: write.entitySet, id });
            }
          }
        }
        // Nothing at all reached Dataverse and the backend refused the rows (fail closed): a refusal, not a part-way stop.
        if (cause instanceof BulkBackendValidationError && done === 0 && landed.length === 0) {
          throw new PlanRefusedError(cause.message);
        }
        throw new PlanError(done, total, write.reason, cause, [...createdIds], [...landed]);
      }
      i += 1;
      continue;
    }
    if (!write.concurrent) {
      try {
        const newId = await sendWrite(write, operation, client, createdIds, createdRows);
        if (newId !== undefined) {
          createdIds.push(newId);
          landed.push({ entitySet: write.entitySet, id: newId });
        }
        done += 1;
      } catch (cause) {
        throw new PlanError(done, total, write.reason, cause, [...createdIds], [...landed]);
      }
      i += 1;
      continue;
    }
    // A run of consecutive `concurrent` writes with the same limit: sent together, awaited as one step. Each one
    // sees the ids created BEFORE the run; the run's own creates join `createdIds` in plan order.
    const limit = write.concurrencyLimit ?? WRITE_CONCURRENCY;
    let end = i;
    while (
      end < writes.length && writes[end]!.concurrent && writes[end]!.concurrencyGroup === write.concurrencyGroup
      && (writes[end]!.concurrencyLimit ?? WRITE_CONCURRENCY) === limit
    ) end += 1;
    const run = writes.slice(i, end);
    const before = [...createdIds];
    const gate = createGate(limit);
    const settled = await Promise.allSettled(run.map((w) => gate(() => sendWrite(w, operation, client, before, createdRows))));
    let failure: { reason: string; cause: unknown } | undefined;
    settled.forEach((s, k) => {
      if (s.status === "fulfilled") {
        if (s.value !== undefined) {
          createdIds.push(s.value);
          landed.push({ entitySet: run[k]!.entitySet, id: s.value });
        }
        done += 1;
      } else if (!failure) {
        failure = { reason: run[k]!.reason, cause: s.reason };
      }
    });
    // Every write of the run was sent; `done` counts the ones that landed, and nothing after the
    // run is sent — the same "N of M changes had already been saved" a sequential stop reports.
    if (failure) throw new PlanError(done, total, failure.reason, failure.cause, [...createdIds], [...landed]);
    i = end;
  }
  return { done, createdIds, createdRows, landed };
}
