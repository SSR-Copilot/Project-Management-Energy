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
import { isRecordGone, unwrap } from "@/platform/errors";
import { invalidatePageTokens, updateRecordIfExists, type GuardedUpdateClient } from "./client";
import { CREATED_ROW_ID, type WritePlan } from "./writePlan";

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
  /** Writes sent successfully. */
  done: number;
  /** The ids returned by the plan's creates, in order. */
  createdIds: string[];
}

/** A plan that stopped part-way. `done` writes were sent before `failedReason` failed. */
export class PlanError extends Error {
  readonly done: number;
  readonly total: number;
  readonly failedReason: string;
  override readonly cause: unknown;
  /** Ids the plan's creates returned BEFORE the failure (rows that exist although the plan failed). */
  readonly createdIds: readonly string[];

  constructor(
    done: number, total: number, failedReason: string, cause: unknown, createdIds: readonly string[] = [],
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PlanError";
    this.done = done;
    this.total = total;
    this.failedReason = failedReason;
    this.cause = cause;
    this.createdIds = createdIds;
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

export async function executePlan(
  plan: WritePlan,
  operation: string,
  client: PlanClient & Partial<GuardedPlanClient> = getClient(dataSourcesInfo),
): Promise<PlanResult> {
  if (plan.refusedReason) throw new PlanRefusedError(plan.refusedReason);

  const createdIds: string[] = [];
  let done = 0;
  for (const write of plan.writes) {
    try {
      if (write.guarded && write.op !== "update") {
        throw new Error("only an update can be guarded (guarded: true on a create or delete is a bug in the plan)");
      }
      const id = write.id === CREATED_ROW_ID
        ? createdIds[createdIds.length - 1]
        : write.id === undefined ? undefined : resolveRefs(write.id, createdIds);
      if (write.id === CREATED_ROW_ID && !id) {
        throw new Error("a write refers to a created row, but no create preceded it");
      }
      const data = resolveData(write.data, createdIds);
      const label = write.label ?? `${operation}: ${write.reason}`;
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
        createdIds.push(newId);
      } else if (write.op === "update" && write.guarded === true) {
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
      } else if (write.op === "update") {
        primaryKeyOf(write.entitySet);
        unwrap(
          await client.updateRecordAsync<Record<string, unknown>, Record<string, unknown>>(
            write.entitySet, id!, data,
          ),
          label,
        );
        invalidatePageTokens(write.entitySet);
      } else {
        primaryKeyOf(write.entitySet);
        unwrap(await client.deleteRecordAsync(write.entitySet, id!), label);
        invalidatePageTokens(write.entitySet);
      }
      done += 1;
    } catch (cause) {
      throw new PlanError(done, plan.writes.length, write.reason, cause, [...createdIds]);
    }
  }
  return { done, createdIds };
}
