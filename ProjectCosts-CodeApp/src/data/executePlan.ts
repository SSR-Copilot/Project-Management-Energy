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
 * `landedIds` contributes nothing to `landed`.
 *
 * MAYBE-LANDED ROWS (review fix F2): a failed `createMany` step may have created rows the backend cannot confirm
 * (a network error, a timeout or a 500 can fail a request after Dataverse processed it; `retryDelay` in
 * `generatorsBulk.ts` never retries those for that reason). The row ids are pre-generated, so on any failure of
 * a createMany step, other than a fail-closed refusal (nothing sent), every row id of that step that is NOT
 * confirmed landed is reported as `PlanError.maybeLanded` (`PlanResult.maybeLanded` is always empty). A row
 * is never in both `landed` and `maybeLanded`. A rollback that deletes a maybe-landed row MUST treat 404 as
 * "already gone" (as `unwrapDelete` does): the row may never have existed. No bisection is done to find out.
 *
 * DELETED ROWS (review fix F2): `PlanResult.deleted` / `PlanError.deleted` list the rows whose `delete` write
 * succeeded (an already-gone 404 counts as deleted), in plan order, also on a part-way failure, so a screen can
 * name only the real leftovers after a failed rollback.
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
 *
 * HARDENED DELETES (Generators delete hardening, DEL-2 and DEL-4; OPT-IN per write, `PlannedWrite.hardened`; every
 * other delete is exactly as before, `unwrapDelete` included). A hardened delete:
 *  - is retried up to 3 tries in all on 429, 503 with Retry-After, 500, 504 and a network error (`withDeleteRetry`,
 *    one `[VSB] ACTION` warn line per retry); a delete is idempotent, so retrying an ambiguous failure is safe;
 *  - treats ONLY HTTP 404 or the code 0x80040217 as "gone" (`unwrapDeleteStrict`); the free text "does not exist" fails;
 *  - has every row that answered "gone" read back after its step (`verifyGone`, one read per 40 ids) and, with
 *    `confirm: true` and `GENERATORS_DELETE.verifyDeletes`, every row it deleted too. A row still present stops the
 *    plan with `PlanError` whose cause is a `DeleteNotConfirmedError` (count and entity set, never ids); such a row
 *    is NOT in `deleted`, and `done` does not count it. A step is one sequential write, or one concurrent run.
 *    A read that fails is treated the same way (unconfirmed), never as "gone".
 * Inside a concurrent group, writes with the same `serialKey` run strictly one after another and other keys in
 * parallel (the group's limit still bounds the requests in flight); `together(…, { stopOnFailure: true })` starts no
 * new write after the first failure. `PlanError.failures` lists every failure a run saw, in plan order.
 */
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { isRecordGone, unwrap, unwrapDelete, unwrapDeleteStrict } from "@/platform/errors";
import { logAction, logData } from "@/platform/requestLog";
import { invalidatePageTokens, updateRecordIfExists, type GuardedUpdateClient } from "./client";
import {
  BulkBackendValidationError, BulkBatchError, BulkRowsGoneError, getBulkBackend, type BulkRow,
} from "./bulkBackend";
import { createGate, createSerialRunner, WRITE_CONCURRENCY } from "./concurrency";
import { GENERATORS_DELETE, type DeleteFlagOverrides, type GeneratorsDeleteFlags } from "./generatorsDeleteFlags";
import { ownerBindGuard, ownerBindProblem } from "./ownerBindGuard";
import { withDeleteRetry } from "./retry";
import { DeleteNotConfirmedError, verifyGone, type VerifyClient } from "./verifyGone";
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
  /** Rows whose `delete` write succeeded (404 = already gone included), in plan order. */
  deleted: LandedRow[];
  /** Always empty on success: a createMany step that succeeded confirmed all its rows (see `PlanError.maybeLanded`). */
  maybeLanded: LandedRow[];
}

/** One failed write of a step: the write's `reason` and what it threw. */
export interface PlanFailure {
  reason: string;
  cause: unknown;
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
  /**
   * Row ids of a FAILED createMany step that are not confirmed landed: they may or may not exist (see the file
   * header). Never overlaps `landed`. Deleting one must treat 404 as gone.
   */
  readonly maybeLanded: readonly LandedRow[];
  /** Rows whose `delete` write succeeded before the failure (404 = already gone included), in plan order. */
  readonly deleted: readonly LandedRow[];
  /**
   * Every failure the failing step saw, in plan order (a concurrent run lets its other writes finish and reports
   * all of them). The first one is `failedReason` / `cause`. A single failure gives one entry.
   */
  readonly failures: readonly PlanFailure[];

  constructor(
    done: number, total: number, failedReason: string, cause: unknown, createdIds: readonly string[] = [],
    landed: readonly LandedRow[] = [],
    extra: { maybeLanded?: readonly LandedRow[]; deleted?: readonly LandedRow[]; failures?: readonly PlanFailure[] } = {},
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PlanError";
    this.done = done;
    this.total = total;
    this.failedReason = failedReason;
    this.cause = cause;
    this.createdIds = createdIds;
    this.landed = landed;
    this.maybeLanded = extra.maybeLanded ?? [];
    this.deleted = extra.deleted ?? [];
    this.failures = extra.failures ?? [{ reason: failedReason, cause }];
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

/** The id a single write targets, with `CREATED_ROW_ID` / `createdRowRef` resolved against `createdIds`. */
function targetIdOf(write: WritePlan["writes"][number], createdIds: readonly string[]): string | undefined {
  return write.id === CREATED_ROW_ID
    ? createdIds[createdIds.length - 1]
    : write.id === undefined ? undefined : resolveRefs(write.id, createdIds);
}

/** A row of a hardened delete that must be read back once its step is over (see the file header). */
interface PendingConfirm {
  entitySet: string;
  id: string;
  reason: string;
}

/** What a hardened delete needs from its run: the flags in force and the list that collects rows to read back. */
interface DeleteContext {
  flags: GeneratorsDeleteFlags;
  pending: PendingConfirm[];
}

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
  /** Hardened deletes only: the flags and the rows to read back. Absent = the flags' defaults and nothing is collected. */
  deleteContext?: DeleteContext,
): Promise<string | undefined> {
  if (write.guarded && write.op !== "update") {
    throw new Error("only an update can be guarded (guarded: true on a create or delete is a bug in the plan)");
  }
  if ((write.hardened || write.confirm) && write.op !== "delete") {
    throw new Error("only a delete can be hardened or confirmed (hardened / confirm on another operation is a bug in the plan)");
  }
  const id = targetIdOf(write, createdIds);
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
  if (write.hardened) {
    // Bounded retry (a delete is idempotent) and a strict "gone"; the read-back happens after the step.
    const outcome = await withDeleteRetry(
      async () => unwrapDeleteStrict(await client.deleteRecordAsync(write.entitySet, id!), label),
      { log: (line) => logAction(`${write.entitySet}: ${line}`, "warn") },
    );
    logged();
    invalidatePageTokens(write.entitySet);
    const flags = deleteContext?.flags ?? GENERATORS_DELETE;
    if (deleteContext && (outcome === "gone" || (write.confirm === true && flags.verifyDeletes))) {
      deleteContext.pending.push({ entitySet: write.entitySet, id: id!, reason: write.reason });
    }
    return undefined;
  }
  // Already gone counts as deleted (`unwrapDelete`).
  unwrapDelete(await client.deleteRecordAsync(write.entitySet, id!), label);
  logged();
  invalidatePageTokens(write.entitySet);
  return undefined;
}

/** Throws (before anything is sent) for a bulk step that is marked concurrent / guarded or has no rows array. */
function assertPlanShape(writes: readonly PlannedWrite[]): void {
  for (const w of writes) {
    if ((w.hardened || w.confirm) && w.op !== "delete") {
      throw new Error(`"${w.reason}": only a delete can be hardened or confirmed (programmer error in the plan)`);
    }
    if (!isBulkWrite(w)) continue;
    if (w.concurrent) {
      throw new Error(`"${w.reason}": a bulk operation (${w.op}) cannot be part of a together() group (programmer error in the plan)`);
    }
    if (w.guarded) throw new Error(`"${w.reason}": guarded does not apply to a bulk operation (updateMany is always guarded by the backend)`);
    if (!Array.isArray(w.rows)) throw new Error(`"${w.reason}": a bulk operation needs its rows (programmer error in the plan)`);
  }
}

/**
 * Runs one bulk step. Pushes what landed into `createdIds` / `landed`; resolves to the number of rows that landed.
 * `stepIds` receives the step's resolved row ids as soon as they are known (before anything is sent), so a failure
 * can name the rows it cannot confirm.
 */
async function sendBulk(
  write: PlannedWrite, operation: string, createdIds: string[], landed: LandedRow[], stepIds: string[],
): Promise<number> {
  const rows = write.rows ?? [];
  if (rows.length === 0) return 0;
  const resolved: BulkRow[] = rows.map((r) => ({
    id: resolveRefs(r.id, createdIds),
    data: resolveData(r.data as Record<string, unknown>, createdIds),
  }));
  stepIds.push(...resolved.map((r) => r.id));
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

/** Optional settings of a run; nothing here changes a plan that sets no hardened delete. */
export interface ExecutePlanOptions {
  /** Overrides of `GENERATORS_DELETE` for this run (tests, a caller that decided differently). */
  deleteFlags?: DeleteFlagOverrides;
}

/** A write of a concurrent group that was never started because `stopOnFailure` had tripped. */
const NOT_STARTED = Symbol("not started");

const rowKeyOf = (r: { entitySet: string; id: string }): string => `${r.entitySet}|${r.id.toLowerCase()}`;

export async function executePlan(
  plan: WritePlan,
  operation: string,
  client: PlanClient & Partial<GuardedPlanClient> = getClient(dataSourcesInfo),
  options: ExecutePlanOptions = {},
): Promise<PlanResult> {
  if (plan.refusedReason) throw new PlanRefusedError(plan.refusedReason);

  const writes = plan.writes;
  assertPlanShape(writes);
  // D158 (CONVENTIONS rule 4): a project-scoped create without the owning-business-unit bind is refused BEFORE anything is sent.
  if (ownerBindGuard().refuseCreateWithoutOwner) {
    const noOwner = ownerBindProblem(writes);
    if (noOwner) throw new PlanRefusedError(noOwner);
  }
  const flags: GeneratorsDeleteFlags = { ...GENERATORS_DELETE, ...options.deleteFlags };
  const total = writes.reduce((n, w) => n + changeCount(w), 0);
  const createdIds: string[] = [];
  const createdRows: Record<string, Readonly<Record<string, unknown>>> = {};
  const landed: LandedRow[] = [];
  const deleted: LandedRow[] = [];
  const extra = (maybeLanded: readonly LandedRow[] = [], failures?: readonly PlanFailure[]) =>
    ({ maybeLanded, deleted: [...deleted], ...(failures ? { failures } : {}) });
  let done = 0;

  /**
   * Reads the rows of a step's hardened deletes back (see the file header). A row still present, or one that could
   * not be read, leaves `deleted` and `done`. Resolves to the failure that must stop the plan, or undefined.
   * A definite "still present" is preferred over a failed read as the reported cause.
   */
  const confirmDeletes = async (pending: readonly PendingConfirm[]): Promise<PlanFailure | undefined> => {
    if (pending.length === 0) return undefined;
    const byEntity = new Map<string, PendingConfirm[]>();
    for (const p of pending) {
      const list = byEntity.get(p.entitySet) ?? [];
      list.push(p);
      byEntity.set(p.entitySet, list);
    }
    const stillPresent: PendingConfirm[] = [];
    const unreadable: PendingConfirm[] = [];
    let readFailure: unknown;
    for (const [entitySet, items] of byEntity) {
      try {
        if (typeof client.retrieveMultipleRecordsAsync !== "function") {
          throw new Error(`${operation}: this client cannot read rows, so a hardened delete cannot be confirmed`);
        }
        const present = new Set(
          (await verifyGone(client as VerifyClient, entitySet, items.map((i) => i.id))).map((id) => id.toLowerCase()),
        );
        stillPresent.push(...items.filter((i) => present.has(i.id.toLowerCase())));
      } catch (error) {
        readFailure ??= error;
        unreadable.push(...items);
      }
    }
    const unconfirmed = new Set([...stillPresent, ...unreadable].map(rowKeyOf));
    for (let k = deleted.length - 1; k >= 0; k -= 1) {
      if (unconfirmed.has(rowKeyOf(deleted[k]!))) {
        deleted.splice(k, 1);
        done -= 1;
      }
    }
    if (stillPresent.length > 0) {
      const sets = [...new Set(stillPresent.map((p) => p.entitySet))];
      return { reason: stillPresent[0]!.reason, cause: new DeleteNotConfirmedError(sets.join(", "), stillPresent.length) };
    }
    if (unreadable.length > 0) return { reason: unreadable[0]!.reason, cause: readFailure };
    return undefined;
  };
  for (let i = 0; i < writes.length;) {
    const write = writes[i]!;
    if (isBulkWrite(write)) {
      const stepIds: string[] = [];
      try {
        done += await sendBulk(write, operation, createdIds, landed, stepIds);
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
        // A refusal of the rows or a missing-rows guard sent nothing; any other failure of a createMany is ambiguous.
        const nothingSent = cause instanceof BulkBackendValidationError || cause instanceof BulkRowsGoneError;
        const confirmed = new Set(landed.map((r) => `${r.entitySet}|${r.id.toLowerCase()}`));
        const maybe = write.op === "createMany" && !nothingSent
          ? stepIds.filter((id) => !confirmed.has(`${write.entitySet}|${id.toLowerCase()}`))
            .map((id) => ({ entitySet: write.entitySet, id }))
          : [];
        throw new PlanError(done, total, write.reason, cause, [...createdIds], [...landed], extra(maybe));
      }
      i += 1;
      continue;
    }
    if (!write.concurrent) {
      const pending: PendingConfirm[] = [];
      try {
        const newId = await sendWrite(write, operation, client, createdIds, createdRows, { flags, pending });
        if (newId !== undefined) {
          createdIds.push(newId);
          landed.push({ entitySet: write.entitySet, id: newId });
        }
        if (write.op === "delete") {
          const goneId = targetIdOf(write, createdIds);
          if (goneId) deleted.push({ entitySet: write.entitySet, id: goneId });
        }
        done += 1;
      } catch (cause) {
        throw new PlanError(done, total, write.reason, cause, [...createdIds], [...landed], extra());
      }
      const unconfirmed = await confirmDeletes(pending);
      if (unconfirmed) {
        throw new PlanError(done, total, unconfirmed.reason, unconfirmed.cause, [...createdIds], [...landed], extra());
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
    const serial = createSerialRunner();
    const stopOnFailure = run.some((w) => w.stopOnFailure);
    let stopped = false;
    const pendingOf = run.map((): PendingConfirm[] => []);
    // `serial` waits OUTSIDE the gate (a write queued behind its key holds no slot); no key = straight into the gate.
    const settled = await Promise.allSettled(run.map((w, k) => serial(w.serialKey, () => gate(async () => {
      if (stopOnFailure && stopped) return NOT_STARTED;
      try {
        return await sendWrite(w, operation, client, before, createdRows, { flags, pending: pendingOf[k]! });
      } catch (error) {
        stopped = true;
        throw error;
      }
    }))));
    const failures: PlanFailure[] = [];
    settled.forEach((s, k) => {
      if (s.status === "fulfilled") {
        if (s.value === NOT_STARTED) return;
        if (s.value !== undefined) {
          createdIds.push(s.value);
          landed.push({ entitySet: run[k]!.entitySet, id: s.value });
        }
        if (run[k]!.op === "delete") {
          const goneId = targetIdOf(run[k]!, before);
          if (goneId) deleted.push({ entitySet: run[k]!.entitySet, id: goneId });
        }
        done += 1;
      } else {
        failures.push({ reason: run[k]!.reason, cause: s.reason });
      }
    });
    // Read the run's hardened deletes back BEFORE reporting, so `deleted` and `done` are true either way.
    const unconfirmed = await confirmDeletes(pendingOf.flat());
    // Every write of the run was sent (unless `stopOnFailure` held the rest back); `done` counts the ones that
    // landed, and nothing after the run is sent — the same "N of M changes had already been saved" a sequential
    // stop reports. A write failure is reported before an unconfirmed delete.
    const first = failures[0];
    if (first) {
      if (unconfirmed) failures.push(unconfirmed);
      throw new PlanError(done, total, first.reason, first.cause, [...createdIds], [...landed], extra([], failures));
    }
    if (unconfirmed) {
      throw new PlanError(done, total, unconfirmed.reason, unconfirmed.cause, [...createdIds], [...landed], extra());
    }
    i = end;
  }
  return { done, createdIds, createdRows, landed, deleted, maybeLanded: [] };
}
