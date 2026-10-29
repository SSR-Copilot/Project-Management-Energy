/**
 * The bulk-write SENDER shared by the two CAPEX saves that write `vsb_capexprojectcontracts` and
 * `vsb_capexcosts` in bulk: Add Cost from Table's Save (`saveAddCostSheetBulk` in
 * `./addCostSheet.ts`) and the CAPEX Add/Edit Cost panel's save (`./capexWrites.ts`). Moved here
 * out of `./addCostSheet.ts` unchanged (CONVENTIONS rule 17: one definition, reused, never
 * copied); what stays there is specific to the sheet save (the upsert-verify decision, the delete
 * pools, the 404 read-back and the save orchestration and its log).
 *
 * What lives here:
 *  - `upsertRowsByAction`: one upsert group split into `CreateMultiple` (new rows) and
 *    `UpdateMultiple` (existing rows), sent in parallel, each falling back to per-row PATCHes when
 *    its action answers 501 on its first chunk (`sendGroup`, `upsertEachRow`).
 *  - The per-action 501 flags, kept for the session in `sessionStorage`
 *    (`vsb.addCostSheet.createMultiple501` / `vsb.addCostSheet.updateMultiple501`; the key names
 *    keep their Add Cost from Table prefix, so a flag set before the move still counts).
 *  - The MODULE gates: `saveGate` (every write request, `SAVE_REQUEST_LIMIT`), `contractDeleteGate`
 *    and `costDeleteGate` (`CONTRACT_DELETE_LIMIT`, `COST_DELETE_LIMIT`). They exist ONCE, here, so
 *    both saves and their background work share the same caps under Dataverse's 52-per-user
 *    service-protection limit.
 *  - `requestStats`: the gated write requests' durations, read by the save log.
 *  - `existingIds`: which ids of the two tables still exist (the per-row guard, phase 0, the 404
 *    read-back).
 *
 * Nothing here plans rows or decides what a save writes; callers pass `UpsertTarget`s already
 * shaped by their own planner.
 */
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { CreateMultipleService } from "@/generated/services/CreateMultipleService";
import { UpdateMultipleService } from "@/generated/services/UpdateMultipleService";
import { DataError, RecordGoneError, unwrap } from "@/platform/errors";
import { fetchAll } from "./client";
import { chunk, idIn } from "./odata";
import { DELETE_CONCURRENCY, createGate, forEachLimit } from "./concurrency";
import { BulkWriteError, parallelChunkSize, toUpsertTargets, upsertMultiple } from "./bulkWrites";
import type { BulkTableInfo, BulkUpsertTransport, ExistingIdsReader, UpsertTarget } from "./bulkTypes";
import { CAPEX_CONTRACTS, CAPEX_COSTS } from "./addCostSheetBulk";

/**
 * Bulk requests per upsert group sent AT ONCE (`upsertMultiple`'s `parallel`).
 *
 * Microsoft's bulk guidance is to send bulk messages in parallel: the server processes the rows
 * of ONE request in sequence (D51 §11 measured a 1,000-row `CreateMultiple` of costs at
 * ~3.3 s), so a big group split into 4 requests sent together finishes in about a quarter of the
 * time. It cannot overload Dataverse: every bulk request still passes the shared `saveGate`, which
 * caps the write requests in flight at `SAVE_REQUEST_LIMIT`. A group under 50 rows stays one
 * request (`MIN_PARALLEL_CHUNK`). "4" holds up to 4 × 500 = 2,000 rows; a bigger group is one
 * request per 500 rows, all sent at once (`parallelChunkSize`). The 501 fallback still holds: when every parallel request answers
 * 501, `upsertMultiple` throws a `BulkWriteError` with 0 committed, as the sequential path does.
 */
export const BULK_PARALLEL_CHUNKS = 4;

/** Every row of one id batch of `table`, primary key only. The two tables the bulk save writes. */
async function idRows(table: BulkTableInfo, batch: readonly string[]): Promise<readonly object[]> {
  const options = { select: [table.primaryKey], filter: idIn(table.primaryKey, batch) };
  const label = `check existing ${table.entitySetName}`;
  if (table.entitySetName === CAPEX_CONTRACTS.entitySetName) {
    return fetchAll(label, (o) => Vsb_capexprojectcontractsService.getAll(o), options);
  }
  if (table.entitySetName === CAPEX_COSTS.entitySetName) {
    return fetchAll(label, (o) => Vsb_capexcostsService.getAll(o), options);
  }
  throw new Error(`existingIds: no reader for ${table.entitySetName}`);
}

/**
 * Which of `ids` still exist in `table` — the bulk save's phase-0 check (`SavePlanDeps.existingIds`).
 *
 * A server read with `$select` = the primary key only (rule 1), the ids filtered on the server in
 * `chunk` batches of `CHUNK` (rule 2), every page through `fetchAll`, which unwraps (rule 3). No
 * state filter: an inactive row still exists, and an upsert of it updates rather than re-creates.
 * Ids come back lower-cased so the caller can match case-insensitively.
 */
export const existingIds: ExistingIdsReader = async (table, ids) => {
  const batches = await Promise.all(chunk(ids).map((batch) => idRows(table, batch)));
  const found = new Set<string>();
  for (const row of batches.flat()) {
    const id = (row as Record<string, unknown>)[table.primaryKey];
    if (typeof id === "string") found.add(id.toLowerCase());
  }
  return found;
};

/** The two bulk actions an upsert phase is split into (`upsertRowsByAction`). */
export type BulkAction = "create" | "update";

/**
 * The gated transport of one bulk action. `onDuration` receives each request's own server time,
 * measured inside the gate (from the moment it holds a slot, so queueing is excluded), for the
 * per-request durations in the save line.
 */
function bulkTransport(action: BulkAction, onDuration?: (ms: number) => void): BulkUpsertTransport {
  return action === "create"
    ? (es, targets) => gated(() => CreateMultipleService.CreateMultiple(es, [...targets]), onDuration)
    : (es, targets) => gated(() => UpdateMultipleService.UpdateMultiple(es, [...targets]), onDuration);
}

/**
 * One request's duration for the log: `980 ms` under a second, else seconds with one decimal
 * (`10.7 s`), so a slow, contended request stands out in the save line.
 */
export function formatRequestDuration(ms: number): string {
  const rounded = Math.round(ms);
  return rounded < 1000 ? `${rounded} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const BULK_ACTION_NAME: Readonly<Record<BulkAction, string>> = {
  create: "CreateMultiple",
  update: "UpdateMultiple",
};

/**
 * Set PER ACTION for the rest of the session once that action is refused with HTTP 501 Not
 * Implemented (`UpsertMultiple` did that against VSBCloud_Dev, 27 Oct 2026, D51): later phases
 * and saves then send that action's rows per row straight away instead of paying for a refused
 * request first. A 501 on one action says nothing about the other, so each has its own flag.
 */
const BULK_501_KEY: Readonly<Record<BulkAction, string>> = {
  create: "vsb.addCostSheet.createMultiple501",
  update: "vsb.addCostSheet.updateMultiple501",
};

/** The flag the retired `UpsertMultiple` path wrote; only ever removed now. */
const RETIRED_UPSERT_501_KEY = "vsb.addCostSheet.upsertMultiple501";

/** Also kept in `sessionStorage`, so a page reload does not pay for the refused request again. */
const bulkUnavailable: Record<BulkAction, boolean> = {
  create: readBulk501("create"),
  update: readBulk501("update"),
};

/**
 * Whether `action` is flagged per-row for this session (it answered 501 earlier). Read-only
 * access for a caller's decisions, e.g. Add Cost from Table's `skipUpsertVerify`.
 */
export function isBulkUnavailable(action: BulkAction): boolean {
  return bulkUnavailable[action];
}

function readBulk501(action: BulkAction): boolean {
  try {
    return globalThis.sessionStorage?.getItem(BULK_501_KEY[action]) === "1";
  } catch {
    return false;
  }
}

function rememberBulk501(action: BulkAction): void {
  bulkUnavailable[action] = true;
  try {
    globalThis.sessionStorage?.setItem(BULK_501_KEY[action], "1");
  } catch {
    // Storage blocked (private window, policy): the in-memory flag still covers this page.
  }
}

/** Test seam: forget every 501 seen earlier in the session, for both actions. */
export function resetBulkWriteAvailability(): void {
  for (const action of ["create", "update"] as const) {
    bulkUnavailable[action] = false;
    try {
      globalThis.sessionStorage?.removeItem(BULK_501_KEY[action]);
    } catch {
      // See `rememberBulk501`.
    }
  }
  try {
    globalThis.sessionStorage?.removeItem(RETIRED_UPSERT_501_KEY);
  } catch {
    // See `rememberBulk501`.
  }
}

/**
 * Per-row fallback writes in flight at once. Dataverse allows 52 concurrent requests per user
 * (service protection); 16 matches `DELETE_CONCURRENCY` and halves the round trips of the old 8.
 */
const ROW_WRITE_CONCURRENCY = DELETE_CONCURRENCY;

/**
 * One ceiling for EVERY write request of a save — bulk calls and per-row upserts (deletes have
 * their own gates, `contractDeleteGate` and `costDeleteGate`). The
 * orchestrator runs up to five operations at once, each with its own pool of 16, which could put
 * ~100 requests in flight, past Dataverse's 52-per-user service-protection limit; writes are not
 * retried on 429. One module gate serves every save: two Saves never overlap (the button is
 * disabled while one runs), and the one write an earlier save can still send in the background
 * (the reconcile after a failed deferred cost delete) passes this same gate, so the cap holds
 * across them. The deferred deletes themselves run on their own module gates, which every save
 * and its background share in the same way. The CAPEX panel save passes the same gates.
 */
export const SAVE_REQUEST_LIMIT = 16;
export const saveGate = createGate(SAVE_REQUEST_LIMIT);

/**
 * Contract deletes have their OWN small gate, outside `saveGate`. Each one is a server-side
 * cascade (measured 5.2 s for one contract, D51 §11.14) and they may run on in the background
 * after Save returns (`DEFER_CONTRACT_DELETES`). Inside the shared gate, 16 slow cascades would
 * hold every slot and stall the upserts — cancelling the deferral — and would leak into the next
 * save's gate peak and request stats. Peak in flight is therefore 16 (writes) + 4 (cascades), well
 * under Dataverse's 52-per-user limit.
 */
export const CONTRACT_DELETE_LIMIT = 4;
export const contractDeleteGate = createGate(CONTRACT_DELETE_LIMIT);

/**
 * Cost deletes (cleared cells, phase 3 and 3') have their OWN gate too, outside `saveGate`.
 *
 * Measured on DEV, 27 Oct (D51 §11.15): 16 per-row cost deletes went through `saveGate` with a
 * pool of `DELETE_CONCURRENCY` (16). They took all 16 slots at t = 0 (`gate peak 16/16`), so
 * every upsert queued about 4 s behind them: the contract upsert finished at 4.7 s and the save at
 * 7.3 s, with the server load pushing each request to about 3 s (`req avg 2971 ms`). With 4
 * slots of their own the deletes can never delay a write.
 *
 * Peak in flight is therefore 16 (writes) + 4 (contract cascades) + 4 (cost deletes) = 24, well
 * under Dataverse's 52-per-user limit. Not counted in `requestStats` either: the log's gate peak
 * and request stats describe the writes only; the delete counts are their own log entries.
 */
export const COST_DELETE_LIMIT = 4;
export const costDeleteGate = createGate(COST_DELETE_LIMIT);

/** Duration of the gated requests of the current save (time inside the gate, not queueing), for the log. */
const stats = { count: 0, totalMs: 0, maxMs: 0 };

/** Read-only view of `stats` for the save log; only `gated` and `resetRequestStats` change it. */
export const requestStats: Readonly<typeof stats> = stats;

export function resetRequestStats(): void {
  stats.count = 0;
  stats.totalMs = 0;
  stats.maxMs = 0;
}

/**
 * `saveGate(task)`, timing the task once it holds a slot. Every write request of a save (never a
 * delete) goes through here. `onDuration` also receives that one request's duration (the bulk
 * requests' per-request entries in the save line).
 */
function gated<T>(task: () => Promise<T>, onDuration?: (ms: number) => void): Promise<T> {
  return saveGate(async () => {
    const t0 = performance.now();
    try {
      return await task();
    } finally {
      const ms = performance.now() - t0;
      stats.count += 1;
      stats.totalMs += ms;
      if (ms > stats.maxMs) stats.maxMs = ms;
      onDuration?.(ms);
    }
  });
}

/**
 * A 501 on the FIRST chunk: the bulk action itself is not available on this route, and nothing
 * was written (each chunk is all-or-nothing), so falling back to per-row upserts is safe. Any
 * other failure, or a 501 after a chunk landed, is a real error and is rethrown.
 */
function isBulkNotImplemented(error: unknown): boolean {
  if (!(error instanceof BulkWriteError) || error.chunksCommitted !== 0) return false;
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof DataError && current.status === 501) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

const ROW_UPSERT: Readonly<Record<string, (id: string, fields: Readonly<Record<string, unknown>>) => Promise<unknown>>> = {
  [CAPEX_CONTRACTS.entitySetName]: async (id, fields) =>
    Vsb_capexprojectcontractsService.update(id, fields as never),
  [CAPEX_COSTS.entitySetName]: async (id, fields) => Vsb_capexcostsService.update(id, fields as never),
};

/**
 * The same plan rows as one PATCH `<set>(<id>)` each. The SDK sends no `If-Match`, so Dataverse
 * treats each as an UPSERT: it creates the row with the planner's id when absent and updates it
 * otherwise, which keeps the stable retry ids (D51 §3a) and the phase-0 existence check valid.
 * Not atomic: a failure throws a plain `DataError` without commit counts, which the orchestrator
 * treats as "may have committed" and reconciles cautiously.
 *
 * GUARD (`guard: true`, only for UPDATE rows of a save whose phase-0 upsert verify was skipped,
 * `skipUpsertVerify`): nothing has proved those rows still exist, and a PATCH would re-create one
 * another user deleted since the sheet loaded. So their ids are read back first (`existingIds`,
 * one read per `CHUNK` ids, counted as requests). If ANY is missing, NONE of the group is sent: a
 * `BulkWriteError` with 0 committed is thrown, its cause a `RecordGoneError` naming the first
 * missing id — the same "deleted by someone else, nothing of it written" meaning as phase 0's
 * `RowsGoneError`, reported through the orchestrator's `SavePlanError` (other operations of the
 * save may have landed by then, so it cannot be the zero-write `RowsGoneError` itself).
 */
async function upsertEachRow(
  table: BulkTableInfo, rows: readonly UpsertTarget[], label: string, guard = false,
): Promise<{ requests: number }> {
  const send = ROW_UPSERT[table.entitySetName];
  if (!send) throw new Error(`${label}: no per-row upsert for ${table.entitySetName}`);
  let checks = 0;
  if (guard && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const found = await existingIds(table, ids);
    checks = chunk(ids).length;
    const missing = rows.filter((r) => !found.has(r.id.toLowerCase()));
    const first = missing[0];
    if (first) {
      throw new BulkWriteError(label, table.entitySetName, 0, 0, 0, new RecordGoneError(
        `${label}: ${missing.length} of ${rows.length} row(s) no longer exist; the per-row fallback did not re-create them`,
        table.entitySetName, first.id,
      ));
    }
  }
  await forEachLimit(rows, async (row) => {
    unwrap((await gated(() => send(row.id, row.fields))) as Parameters<typeof unwrap>[0], label);
  }, ROW_WRITE_CONCURRENCY);
  return { requests: checks + rows.length };
}

/** How one action's group of rows actually went out, for the save's timing log. */
type GroupPath = "bulk" | "per-row after 501" | "per-row since an earlier 501";

/**
 * One action's group, for the log: its path, and on the bulk path each bulk request's own server
 * duration in completion order (`gated`, queueing excluded).
 */
interface GroupTrack { path?: GroupPath; durations?: number[] }

/** `bulk [980 ms, 10.7 s]` on the bulk path (one entry per request); the path alone otherwise. */
function groupPathText(track: GroupTrack): string {
  const path = track.path ?? "bulk";
  const durations = path === "bulk" ? track.durations ?? [] : [];
  return durations.length === 0 ? path : `${path} [${durations.map(formatRequestDuration).join(", ")}]`;
}

/**
 * One action's group: the bulk message first, per-row upserts when that action answers 501 on
 * its first chunk (nothing was written then, so the fallback is safe). Any other refusal, or a
 * 501 after a chunk landed, propagates unchanged. The refused 501 request counts as a request.
 * `guardPerRowUpdates`: the update group's per-row path re-checks its ids first (`upsertEachRow`).
 */
async function sendGroup(
  action: BulkAction, table: BulkTableInfo, rows: readonly UpsertTarget[], label: string,
  track: GroupTrack, guardPerRowUpdates = false,
): Promise<number> {
  if (rows.length === 0) return 0;
  const groupLabel = `${label} (${action})`;
  const guard = action === "update" && guardPerRowUpdates;
  if (bulkUnavailable[action]) {
    // Reached in a skipped-verify save only when another operation of THIS save set the flag.
    track.path = "per-row since an earlier 501";
    return (await upsertEachRow(table, rows, groupLabel, guard)).requests;
  }
  track.path = "bulk";
  const durations: number[] = (track.durations = []);
  try {
    // Parallel chunks (`BULK_PARALLEL_CHUNKS`): each one still passes `saveGate` through
    // `bulkTransport`, so the save's in-flight cap is unchanged.
    return (await upsertMultiple(table, rows, bulkTransport(action, (ms) => { durations.push(ms); }), {
      label: groupLabel, parallel: BULK_PARALLEL_CHUNKS,
    })).requests;
  } catch (error) {
    if (!isBulkNotImplemented(error)) throw error;
    rememberBulk501(action);
    console.warn(`${BULK_ACTION_NAME[action]} answered 501 Not Implemented; ${groupLabel} continues row by row.`);
  }
  track.path = "per-row after 501";
  return refusedBulkRequests(rows.length) + (await upsertEachRow(table, rows, groupLabel, guard)).requests;
}

/**
 * How many bulk requests a group of `rowCount` rows sent before its 501 fallback: every parallel
 * chunk when the group was split (all of them answered 501, or it would not have fallen back),
 * else the one sequential first chunk.
 */
function refusedBulkRequests(rowCount: number): number {
  const parallelRequests = Math.ceil(rowCount / parallelChunkSize(rowCount, BULK_PARALLEL_CHUNKS));
  return parallelRequests > 1 ? parallelRequests : 1;
}

/** The innermost `DataError` status in an error's `cause` chain, if any. */
function dataStatus(error: unknown): number | undefined {
  let status: number | undefined;
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof DataError && current.status !== undefined) status = current.status;
    current = (current as { cause?: unknown }).cause;
  }
  return status;
}

/**
 * The Save's upsert adapter (`SavePlanDeps.upsert`; the CAPEX panel save calls it too): Microsoft's
 * bulk guidance is that Upsert is
 * slower than Create or Update and that a caller who knows whether a record exists should say so.
 * The planner knows, per row (`UpsertTarget.isNew`), and the orchestrator's phase-0 check turns
 * a "new" id that already exists into `isNew: false`, so `CreateMultiple` never gets an id that
 * exists. So the rows are split, in input order, into `creates` and `updates`, and the two
 * groups go out IN PARALLEL — one `CreateMultiple` / `UpdateMultiple` request per 500 rows each
 * (`upsertMultiple` chunks, validates and unwraps). `UpsertMultiple` is no longer used: it
 * answered 501 against VSBCloud_Dev (D51).
 *
 * VALIDATION first, over ALL the rows, before either group sends anything: a duplicate id across
 * the two groups, an empty id or a reserved key throws `BulkValidationError` (0 committed).
 *
 * 501 FALLBACK PER ACTION: see `sendGroup`. One action's 501 leaves the other on its bulk path.
 *
 * FAILURE. Both groups are awaited to the end (`allSettled`) before anything is thrown, so no
 * request is still in flight when the orchestrator starts reconciling. Then:
 * - only one group had rows: its own error is rethrown unchanged. That group IS `rows` in input
 *   order, so a `BulkWriteError`'s `rowsCommitted` still means "this prefix of `rows` landed";
 * - both groups had rows: neither group's rows are a prefix of `rows` (creates and updates
 *   interleave in the input), so no commit count can keep that meaning. The adapter throws a
 *   plain `DataError` with NO `rowsCommitted` / `chunksCommitted`, its `cause` the first failure
 *   (create before update) and its `status` that failure's innermost Dataverse status. The
 *   orchestrator reads "counts unknown" as "may have committed" and reconciles cautiously;
 * - EXCEPT both groups failed and each error reports 0 rows committed: then nothing of `rows`
 *   landed, and the adapter throws a `BulkWriteError` with 0 committed (its `cause` that same
 *   `DataError`), so the orchestrator neither says "some of your changes were already saved"
 *   nor treats this phase as possibly landed (L2 / F5).
 *
 * `requests` is the sum of both groups. `report` receives the per-action summary for the log,
 * also on failure. `opts.guardPerRowUpdates` is set when this save skipped the phase-0 upsert
 * verify: see `upsertEachRow`'s guard.
 */
export async function upsertRowsByAction(
  table: BulkTableInfo, rows: readonly UpsertTarget[], label: string,
  report?: (summary: string) => void, opts: { guardPerRowUpdates?: boolean } = {},
): Promise<{ requests: number }> {
  toUpsertTargets(table, rows, label);
  const groups: Record<BulkAction, readonly UpsertTarget[]> = {
    create: rows.filter((r) => r.isNew),
    update: rows.filter((r) => !r.isNew),
  };
  const tracks: Record<BulkAction, GroupTrack> = { create: {}, update: {} };
  const actions = ["create", "update"] as const;
  const settled = await Promise.allSettled(
    actions.map((action) => sendGroup(
      action, table, groups[action], label, tracks[action], opts.guardPerRowUpdates === true,
    )),
  );

  report?.(actions
    .map((action, i) => {
      if (groups[action].length === 0) return null;
      const s = settled[i] as PromiseSettledResult<number>;
      return s.status === "fulfilled"
        ? `${action} ${s.value} req ${groupPathText(tracks[action])}`
        : `${action} failed ${groupPathText(tracks[action])}`;
    })
    .filter((part): part is string => part !== null)
    .join(", ") || "nothing to send");

  const failed = actions.flatMap((action, i) => {
    const s = settled[i] as PromiseSettledResult<number>;
    return s.status === "rejected" ? [{ action, reason: s.reason as unknown }] : [];
  });
  const [first, second] = failed;
  if (!first) {
    return { requests: settled.reduce((n, s) => n + (s.status === "fulfilled" ? s.value : 0), 0) };
  }
  if (groups.create.length === 0 || groups.update.length === 0) throw first.reason;

  const detail = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));
  const other: BulkAction = first.action === "create" ? "update" : "create";
  const operation = second
    ? `${label}: both the create and the update group failed (update: ${detail(second.reason)})`
    : `${label}: the ${first.action} group failed while the ${other} group (${groups[other].length} row(s)) was saved`;
  const wrapped = new DataError(operation, first.reason, dataStatus(first.reason));
  // L2 / F5: both groups failed and BOTH report exactly 0 rows committed (a refused single
  // request, a 501 on every chunk, the per-row guard), so nothing of `rows` landed and 0 is a
  // true prefix count of them. Say so — a `BulkWriteError` with 0 committed around the same
  // detail — instead of the count-less error, which the orchestrator must read as "may have
  // committed". Any group that fulfilled, or reports rows, or reports no counts at all (a
  // per-row failure, a partial parallel split) keeps the count-less error below.
  if (second && reportsNothingCommitted(first.reason) && reportsNothingCommitted(second.reason)) {
    throw new BulkWriteError(label, table.entitySetName, 0, 0, 0, wrapped);
  }
  throw wrapped;
}

/**
 * The error says, with counts, that its group committed nothing: `rowsCommitted` is 0 and
 * `chunksCommitted` (when present) is 0. `BulkWriteError` / `BulkValidationError` carry them; a
 * plain or `BulkPartialWriteError` does not, and so never qualifies.
 */
function reportsNothingCommitted(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { rowsCommitted, chunksCommitted } = error as { rowsCommitted?: unknown; chunksCommitted?: unknown };
  return rowsCommitted === 0 && (chunksCommitted === undefined || chunksCommitted === 0);
}
