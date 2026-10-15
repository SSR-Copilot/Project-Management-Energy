/**
 * `UpsertMultiple`/`UpdateMultiple`, reached through the CLI-generated services rather than the
 * SDK's per-record create/update/delete.
 *
 * `DataClient.executeAsync` (the hand-written part of `@microsoft/power-apps`) accepts exactly
 * two actions — `getEntityMetadata` and `customapi` — and rejects everything else, bulk messages
 * included; that is a fact read out of the installed package, not an assumption. The Power Apps
 * CLI (`pa app add dataverse-api --api-name UpsertMultiple`, run once, interactively, against
 * `VSBCloud_Dev`) is a SEPARATE tool from the app's own SDK: it reads the operation's definition
 * from Dataverse's `$metadata` at generation time and writes `generated/services/
 * UpsertMultipleService.ts`, which itself calls back into `executeAsync`'s `customapi` case —
 * the one case the SDK already supports — with the request shaped the way that case expects.
 * Nothing about the RUNNING app's authentication changes: it uses the same Dataverse connection
 * every other read and write here already does. The CLI login was needed only once, to generate
 * these three files; it is not needed again unless a fourth bulk action is added later.
 *
 * `CreateMultiple`, `UpdateMultiple` and `UpsertMultiple` are bound to the TABLE, not to a
 * record (Dataverse's own metadata: `BindingType: collection`, bound to `crmbaseentity`) — so
 * the generated services take the entity set name as their first argument and work for every
 * table, not just one.
 *
 * Every `Targets` entry needs `@odata.type` naming its table — Dataverse's own `CreateMultiple`
 * documentation marks this REQUIRED on every item — which `withType` stamps on here so callers
 * never have to remember it per row.
 *
 * NEW ROWS GO THROUGH `CreateMultiple`, NEVER `UpsertMultiple` WITH A CLIENT-CHOSEN ID. Every
 * example Dataverse documents for `CreateMultiple` lets the server assign the id and hands it
 * back in `Ids` (in input order) — it never shows a primary key set inside a `Targets` item.
 * `UpsertMultiple`-by-primary-key for a row Dataverse has never seen was this module's FIRST
 * design, and the first live save against `VSBCloud_Dev` failed on exactly that phase (every
 * row in it new). That is circumstantial, not confirmed — the real Dataverse error was not
 * captured — but it is also the one part of the original design with no Dataverse-documented
 * example behind it, so it is not kept as the default any more. `createMultiple` follows the
 * documented shape exactly: no id in the body, ids read back from `Ids`.
 * `UpdateMultiple`-by-primary-key is a DIFFERENT, unambiguous case: an update has nothing else
 * that could address which row to change, so every documented example sets the primary key on
 * every row, same as this module does for rows that are not new.
 *
 * `createAndUpdateMultiple` is the shape every caller with a mixed new/existing set actually
 * wants: it splits the rows by whether they already carry an id, sends the new ones through
 * `CreateMultiple` (dropping any id a caller mistakenly included — see its own comment) and the
 * rest through `UpdateMultiple`, and hands back the NEW rows' server-assigned ids zipped back
 * to the caller's original new-row order, so a caller can thread them into a later phase
 * exactly the way the old per-row `create()` calls' responses used to be threaded.
 *
 * `UpsertMultiple` is kept here, tested, and exported — it is Dataverse's documented tool for
 * a row whose existence the caller genuinely does not know (an external id, an alternate key),
 * which is a real use this app may have elsewhere. It is no longer used for a row this app
 * itself just decided to create, which is the one case `createMultiple` covers more safely.
 *
 * FAILURE IS ALL-OR-NOTHING PER CHUNK. Dataverse's bulk messages are not transactional on
 * standard tables (only elastic tables get per-item results — none of these are elastic): one
 * bad row fails every row sent in the same request. Rows are still split into chunks of
 * `BULK_CHUNK_SIZE`, sent one chunk after another, because a single sheet save can carry several
 * hundred rows and an unbounded payload risks the platform's message-size and time limits. That
 * means a later chunk's failure can follow an earlier chunk's real, already-committed write —
 * `BulkWriteError.partial` is true exactly then, so a caller's error message can say so honestly
 * instead of claiming nothing was saved when something was.
 */
import { CreateMultipleService } from "@/generated/services/CreateMultipleService";
import { UpdateMultipleService } from "@/generated/services/UpdateMultipleService";
import { UpsertMultipleService } from "@/generated/services/UpsertMultipleService";

/**
 * Rows per `Targets` array sent in one request. Chosen well under Dataverse's documented
 * request-size and processing-time limits for bulk messages on standard tables, with no
 * measured ceiling of its own behind it — if a save ever needs to move faster, raise this only
 * alongside evidence (from a real environment) of how large a single chunk can safely be.
 */
export const BULK_CHUNK_SIZE = 200;

function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function withType(row: Record<string, unknown>, odataType: string): Record<string, unknown> {
  return { ...row, "@odata.type": `Microsoft.Dynamics.CRM.${odataType}` };
}

/**
 * Thrown by every function below on a failed chunk. `.cause` carries whatever Dataverse detail
 * the SDK returned, for logging — it is deliberately NOT part of `.message`, because callers
 * build the end-user-facing message themselves from `.partial` (see the module comment).
 */
export class BulkWriteError extends Error {
  override readonly cause?: unknown;
  /** True when an earlier chunk of the SAME call already wrote successfully. */
  readonly partial: boolean;

  constructor(cause: unknown, partial: boolean) {
    super("bulk write failed");
    this.name = "BulkWriteError";
    this.cause = cause;
    this.partial = partial;
  }
}

/**
 * The end-user message deliberately never carries the raw Dataverse detail (see `BulkWriteError`
 * above) — but that must not mean the detail is lost. It goes to the console, with the exact
 * payload that failed, so a failure is diagnosable from the browser's console without needing
 * the Network tab, and without exposing Dataverse's raw error text to the saving-costs screen.
 */
function logChunkFailure(
  entitySetName: string, chunkIndex: number, chunkCount: number,
  targets: Record<string, unknown>[], error: unknown,
) {
  // eslint-disable-next-line no-console -- deliberate: the one place this detail is surfaced.
  console.error(
    `Bulk write to "${entitySetName}" failed on chunk ${chunkIndex + 1} of ${chunkCount} ` +
    `(${targets.length} row(s) in this chunk).`,
    { entitySetName, chunkIndex, chunkCount, targets, error },
  );
}

async function runChunks(
  entitySetName: string,
  rows: readonly Record<string, unknown>[],
  run: (chunk: Record<string, unknown>[]) => Promise<{ success: boolean; error?: unknown }>,
): Promise<void> {
  const chunks = chunkRows(rows, BULK_CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- each chunk must land before the next is sent.
    const result = await run(chunks[i] as Record<string, unknown>[]);
    if (!result.success) {
      logChunkFailure(entitySetName, i, chunks.length, chunks[i] as Record<string, unknown>[], result.error);
      throw new BulkWriteError(result.error, i > 0);
    }
  }
}

/**
 * Create-or-update every row in `rows`, addressed by the primary key each row already carries
 * (an existing id updates that record, a fresh id creates one). A no-op on an empty list, so
 * callers never need their own length check first.
 */
export async function upsertMultiple(
  entitySetName: string,
  odataType: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  await runChunks(
    entitySetName,
    rows.map((r) => withType(r, odataType)),
    (chunk) => UpsertMultipleService.UpsertMultiple(entitySetName, chunk),
  );
}

/** Updates every row in `rows`, each of which must already carry its primary key. */
export async function updateMultiple(
  entitySetName: string,
  odataType: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  await runChunks(
    entitySetName,
    rows.map((r) => withType(r, odataType)),
    (chunk) => UpdateMultipleService.UpdateMultiple(entitySetName, chunk),
  );
}

/**
 * Creates every row in `rows` and returns the server-assigned ids, in input order. Any id a
 * caller put in a row is DROPPED first — `CreateMultiple`'s documented shape has no id in the
 * body, and a stray one here most likely means a row that belongs in `createAndUpdateMultiple`
 * instead.
 */
export async function createMultiple(
  entitySetName: string,
  odataType: string,
  rows: readonly Record<string, unknown>[],
  primaryKeyField?: string,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const withoutId = (row: Record<string, unknown>) => {
    if (!primaryKeyField) return row;
    const { [primaryKeyField]: _dropped, ...rest } = row;
    return rest;
  };
  const ids: string[] = [];
  const chunks = chunkRows(rows.map((r) => withType(withoutId(r), odataType)), BULK_CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i] as Record<string, unknown>[];
    // eslint-disable-next-line no-await-in-loop -- each chunk must land before the next is sent.
    const result = await CreateMultipleService.CreateMultiple(entitySetName, chunk);
    if (!result.success) {
      logChunkFailure(entitySetName, i, chunks.length, chunk, result.error);
      throw new BulkWriteError(result.error, ids.length > 0);
    }
    const data = result.data as { Ids?: string[] } | null | undefined;
    ids.push(...(data?.Ids ?? []));
  }
  return ids;
}

/** One phase's split outcome: the new rows' server-assigned ids, zipped to their caller order. */
export interface CreateAndUpdateResult {
  /** Index-for-index with the `rows` the caller passed in that had no `primaryKeyField` value. */
  createdIds: string[];
}

/**
 * The shape a mixed new/existing phase actually wants: new rows (no value in `primaryKeyField`)
 * go through `createMultiple`; the rest go through `updateMultiple`. The two calls touch
 * DISJOINT rows — nothing an update changes can affect a create, and nothing a create returns
 * (`createdIds`) is needed by the update — so they run CONCURRENTLY, not one after the other.
 * This is the main saving over the previous sequential version: every caller with a genuine mix
 * of new and existing rows (which is the ordinary case for this screen) now pays for the slower
 * of the two calls, not both.
 *
 * `rows` must already carry `primaryKeyField` on every EXISTING row (the value `updateMultiple`
 * addresses it by); a new row may omit it, carry `null`, or carry a placeholder — anything
 * falsy is treated as "new" and is never sent to Dataverse as this row's id.
 *
 * FAILURE, now that the two calls are concurrent, needs both outcomes read together — not just
 * "which one threw" — because the other one may have already written real rows while this one
 * failed. The three facts a caller needs stay exactly what `bulkStepError` in `addCostSheet.ts`
 * already expects: whether anything is known to have been written (`.partial`), and the cause.
 */
export async function createAndUpdateMultiple(
  entitySetName: string,
  odataType: string,
  rows: readonly Record<string, unknown>[],
  primaryKeyField: string,
): Promise<CreateAndUpdateResult> {
  const newRows = rows.filter((r) => !r[primaryKeyField]);
  const existingRows = rows.filter((r) => Boolean(r[primaryKeyField]));

  const [created, updated] = await Promise.allSettled([
    createMultiple(entitySetName, odataType, newRows, primaryKeyField),
    updateMultiple(entitySetName, odataType, existingRows),
  ]);

  if (created.status === "fulfilled" && updated.status === "fulfilled") {
    return { createdIds: created.value };
  }

  // Something was written if the call that DID succeed actually had rows of its OWN to act on
  // (not the failing call's rows — the two are disjoint), or if either failing call's OWN chunk
  // history already says an earlier chunk of itself landed.
  const partial =
    (created.status === "fulfilled" && updated.status === "rejected" && newRows.length > 0) ||
    (updated.status === "fulfilled" && created.status === "rejected" && existingRows.length > 0) ||
    (created.status === "rejected" && created.reason instanceof BulkWriteError && created.reason.partial) ||
    (updated.status === "rejected" && updated.reason instanceof BulkWriteError && updated.reason.partial);

  const causes = [
    created.status === "rejected" ? created.reason : undefined,
    updated.status === "rejected" ? updated.reason : undefined,
  ].filter((c) => c !== undefined);

  throw new BulkWriteError(causes.length === 1 ? causes[0] : causes, partial);
}
