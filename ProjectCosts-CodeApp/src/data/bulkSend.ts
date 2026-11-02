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
 *  - `RequestMeter`: one save's gated write requests (count, durations, peaks), for its log (D59).
 *  - `formatMs` / `formatRequestDuration`: the save logs' two duration formats.
 *  - `existingIds`: which ids of the two tables still exist (the per-row guard, phase 0, the 404
 *    read-back).
 *  - `deepInsertContracts` (WS-B, Add Cost from Table only, behind `DEEP_INSERT_NEW_CONTRACTS`):
 *    new contracts created with their cost rows nested, one POST each, and its per-tab flags.
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
import {
  BulkValidationError, BulkWriteError, DEFAULT_BULK_CHUNK, MIN_PARALLEL_CHUNK, parallelChunkSize, toUpsertTargets, upsertMultiple,
} from "./bulkWrites";
import type {
  BulkTableInfo, BulkUpsertTransport, DeepInsertGroup, ExistingIdsReader, UpsertTarget,
} from "./bulkTypes";
import { CAPEX_CONTRACTS, CAPEX_COSTS } from "./addCostSheetBulk";

/**
 * How the bulk writes of a save are cut into requests and how many may be in flight. ONE set, so
 * the split (`sendGroup`), the refused-request count after a 501 (`refusedBulkRequests`) and the
 * write gate (`saveGate`) can never disagree.
 *  - `minChunk`: the smallest chunk a split makes; a group under 2 × this stays one request.
 *  - `parallel`: chunks per group sent at once (`upsertMultiple`'s `parallel`).
 *  - `maxChunk`: the largest chunk; above `parallel × maxChunk` rows a group is one request per
 *    `maxChunk` rows (`parallelChunkSize`).
 *  - `writeGate`: write requests in flight at once across every save (`SAVE_REQUEST_LIMIT`).
 */
export interface BulkTuning {
  readonly minChunk: number;
  readonly parallel: number;
  readonly maxChunk: number;
  readonly writeGate: number;
}

/**
 * The numbers before the WS-A tuning (D51 §11.14–§11.16), exactly: a group under 50 rows is one
 * request, 50–2,000 rows are at most 4 chunks of at least 25, above that one request per 500 rows;
 * every write passes one gate of 16. `TUNED_CHUNKING = false` restores them.
 */
export const LEGACY_BULK_TUNING: BulkTuning = Object.freeze({
  minChunk: MIN_PARALLEL_CHUNK, parallel: 4, maxChunk: DEFAULT_BULK_CHUNK, writeGate: 16,
});

/**
 * PROVISIONAL until the live probe (request time against rows per request, D51 P0.2) has run on
 * DEV. Every number below is inferred from the two §11.16 saves, not measured per request.
 *
 * MODEL. One bulk request takes `a + b × rows`: `a` ≈ 0.5 s is the fixed host and server cost (the
 * smallest request ever measured took 556 ms), and the server processes a request's rows one
 * after another. The §11.16 logs give each request's time but not its rows, so `b` comes from the
 * totals: the 60-row save's two cost requests took (1.6 − 0.5) + (1.3 − 0.5) = 1.9 s of row time
 * for 60 rows, b ≈ 32 ms; the 96-row save's three cost requests (1.9 + 1.2 + 0.556 − 3 × 0.5 =
 * 2.16 s) give b ≈ 22 ms. So b ≈ 22–32 ms per row, about 27 ms. Chunks sent together overlap, so a
 * group of `n` rows split into chunks of `c` takes about `a + b × c` while the gate has room.
 *  - `minChunk` 10: the row share of a chunk, `b × c`, should stay at about half of `a` or less;
 *    below that each halving of `c` saves under 0.14 s and doubles the requests. a / (2b) =
 *    0.5 / 0.054 ≈ 9.3, so 10 (8–11 over the range of b). A 10-row chunk is ≈ 0.77 s, against
 *    ≈ 1.8 s for one 49-row request today. A group under 20 rows stays one request, so a 1-month
 *    edit is still one request.
 *  - `parallel` 8: with chunks of 10, 8 reaches 80 rows at the 10-row floor, which covers the
 *    measured saves (25–50 rows per group); a 500-row group is 8 × 63 rows (≈ 2.2 s, against 4 × 125
 *    ≈ 3.9 s). A save runs up to 4 groups at once (contract create and update, the existing
 *    contracts' cost create and update), so 8 per group can already ask for 32 slots: more per
 *    group only queues behind the gate.
 *  - `maxChunk` 500, unchanged: with `parallel` 8 it binds only above 4,000 rows per group, past
 *    the 3,500-row sheet this was sized for. Inside Microsoft's 100–1,000 guidance.
 *  - `writeGate` 24 (was 16): binds only on large saves. Modelled, with FIFO queueing: a 1,000-row
 *    save 3.4 s at 16 → 2.4 s at 24, a 3,500-row save 8.1 s → 6.4 s; 20 gives 2.7 s and 6.4 s, 32
 *    gives no more than 24. Peak in flight: 24 writes + 4 contract cascades + 4 cost deletes = 32,
 *    36 with the CAPEX panel's own delete gate of 4 (`capexWrites.ts`), under Dataverse's 52 per
 *    user and leaving 16 for reads (the phase-0 and 404 read-backs are not gated).
 *
 * EXPECTED (inferred, not measured): the 60-row save on existing contracts goes from 1,607 ms to
 * about 0.82–0.87 s: its cost groups become 10-row chunks (≈ 0.82 s) and the 865 ms contract update,
 * one request while it has under 20 rows, becomes the critical path. The 96-row save with new
 * contracts stays at about 1.9 s: its critical path is the contract `CreateMultiple` (1.4 s for a
 * few rows) THEN the new contracts' costs (556 ms), and neither has enough rows to split.
 *
 * UNVERIFIED until the probe: that 8+ requests on one table in parallel keep `a` and `b` (server
 * locks on a shared parent contract, the browser's connections per host and the org's degree of
 * parallelism could each serialise them), and that 24 in flight raises no 429s.
 */
export const TUNED_BULK_TUNING: BulkTuning = Object.freeze({
  minChunk: 10, parallel: 8, maxChunk: 500, writeGate: 24,
});

/**
 * Rollback for the WS-A chunk tuning: `false` restores `LEGACY_BULK_TUNING` exactly (split, chunk
 * sizes, write gate). Treat it like `BULK_SAVE`: a live decision, PROVISIONAL until measured.
 */
export const TUNED_CHUNKING = true;

/** The tuning a value of `TUNED_CHUNKING` selects. Pure, so the rollback half is testable. */
export function selectBulkTuning(tuned: boolean): BulkTuning {
  return tuned ? TUNED_BULK_TUNING : LEGACY_BULK_TUNING;
}

/** The tuning in force (`TUNED_CHUNKING`). Every number below derives from it. */
export const BULK_TUNING: BulkTuning = selectBulkTuning(TUNED_CHUNKING);

/**
 * Bulk requests per upsert group sent AT ONCE (`upsertMultiple`'s `parallel`): `BULK_TUNING.parallel`.
 *
 * Microsoft's bulk guidance is to send bulk messages in parallel: the server processes the rows
 * of ONE request in sequence, so a group split into N requests sent together finishes in about
 * `a + b × n / N` instead of `a + b × n` (see `TUNED_BULK_TUNING`). It cannot overload Dataverse:
 * every bulk request still passes the shared `saveGate`, which caps the write requests in flight
 * at `SAVE_REQUEST_LIMIT`. A group under 2 × `BULK_TUNING.minChunk` rows stays one request; up to
 * `parallel × maxChunk` rows it is at most `parallel` requests; a bigger group is one request per
 * `maxChunk` rows, all sent at once (`parallelChunkSize`). The 501 fallback still holds: when every
 * parallel request answers 501, `upsertMultiple` throws a `BulkWriteError` with 0 committed, as the
 * sequential path does.
 */
export const BULK_PARALLEL_CHUNKS = BULK_TUNING.parallel;

/**
 * `upsertMultiple`'s chunking options for one bulk group under `tuning` (default the one in force).
 * The ONE place a group's split is derived from a tuning, so `sendGroup` and `refusedBulkRequests`
 * cannot disagree.
 */
export function bulkChunkOptions(
  tuning: BulkTuning = BULK_TUNING,
): { parallel: number; chunkSize: number; minChunk: number } {
  return { parallel: tuning.parallel, chunkSize: tuning.maxChunk, minChunk: tuning.minChunk };
}

/**
 * How many requests a bulk group of `rowCount` rows is sent as under `tuning`: one when it does not
 * split (or fits one sequential chunk), else one per parallel chunk. Pure; mirrors `upsertMultiple`.
 */
export function bulkRequestCount(rowCount: number, tuning: BulkTuning = BULK_TUNING): number {
  if (rowCount <= 0) return 0;
  const { parallel, chunkSize, minChunk } = bulkChunkOptions(tuning);
  const parallelRequests = Math.ceil(rowCount / parallelChunkSize(rowCount, parallel, chunkSize, minChunk));
  return parallel > 1 && parallelRequests > 1 ? parallelRequests : Math.ceil(rowCount / chunkSize);
}

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
function bulkTransport(
  action: BulkAction, onDuration?: (ms: number) => void, meter?: RequestMeter,
): BulkUpsertTransport {
  return action === "create"
    ? (es, targets) => gated(() => CreateMultipleService.CreateMultiple(es, [...targets]), onDuration, meter)
    : (es, targets) => gated(() => UpdateMultipleService.UpdateMultiple(es, [...targets]), onDuration, meter);
}

/**
 * One request's duration for the log: `980 ms` under a second, else seconds with one decimal
 * (`10.7 s`), so a slow, contended request stands out. The readable form, used in the save logs'
 * collapsed groups (D59).
 */
export function formatRequestDuration(ms: number): string {
  const rounded = Math.round(ms);
  return rounded < 1000 ? `${rounded} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Exact whole milliseconds with an en-US thousands separator (`1,916 ms`): the one unit of the
 * save logs' one-line summaries (D59), so a pasted line compares directly with the D51/D56
 * measurement tables. `digits` (default 0) keeps decimals, e.g. the sub-millisecond prepare steps
 * (`4.2 ms`). The one definition (CONVENTIONS rule 17); never format a log duration inline.
 */
export function formatMs(ms: number, digits = 0): string {
  if (!Number.isFinite(ms)) return "n/a";
  const value = digits === 0 ? Math.round(ms) : ms;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ms`;
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

/** A per-tab flag in `sessionStorage`; false when storage is blocked. */
function readSessionFlag(key: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, "1");
  } catch {
    // Storage blocked (private window, policy): the in-memory flag still covers this page.
  }
}

function readBulk501(action: BulkAction): boolean {
  return readSessionFlag(BULK_501_KEY[action]);
}

function rememberBulk501(action: BulkAction): void {
  bulkUnavailable[action] = true;
  writeSessionFlag(BULK_501_KEY[action]);
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
 *
 * `BULK_TUNING.writeGate`: 24 with `TUNED_CHUNKING` (PROVISIONAL, see `TUNED_BULK_TUNING`), 16
 * before it.
 */
export const SAVE_REQUEST_LIMIT = BULK_TUNING.writeGate;
// Not exported (D59): every caller writes through `upsertRowsByAction` or `gatedWrite`, which
// also count the request on that save's `RequestMeter`.
const saveGate = createGate(SAVE_REQUEST_LIMIT);

/**
 * Contract deletes have their OWN small gate, outside `saveGate`. Each one is a server-side
 * cascade (measured 5.2 s for one contract, D51 §11.14) and they may run on in the background
 * after Save returns (`DEFER_CONTRACT_DELETES`). Inside the shared gate, 16 slow cascades would
 * hold every slot and stall the upserts — cancelling the deferral — and would leak into the next
 * save's gate peak and request stats. Peak in flight is therefore `SAVE_REQUEST_LIMIT` (writes,
 * 24; 16 before the WS-A tuning) + 4 (cascades), well under Dataverse's 52-per-user limit.
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
 * Peak in flight is therefore `SAVE_REQUEST_LIMIT` (writes) + 4 (contract cascades) + 4 (cost
 * deletes) = 32 with the WS-A tuning (24 before it, with 16 writes), under Dataverse's 52-per-user
 * limit; the CAPEX panel's own delete gate of 4 makes 36. Not counted in a `RequestMeter` either: the log's gate peak
 * and request stats describe the writes only; the delete counts are their own log entries.
 */
export const COST_DELETE_LIMIT = 4;
export const costDeleteGate = createGate(COST_DELETE_LIMIT);

/**
 * ONE save's gated write requests, for its log (D59, measurement only: nothing here changes
 * scheduling). Each save makes its own (`createRequestMeter`) and passes it down
 * (`upsertRowsByAction`'s `opts.meter`, `gatedWrite`), so its statistics never include another
 * save's writes or an earlier save's background reconcile (D56 §7), which a module-wide counter
 * did.
 *  - `count` / `totalMs` / `maxMs`: this save's finished write requests, timed inside the gate
 *    (queueing excluded).
 *  - `peak`: the most of THIS save's write requests in flight at once.
 *  - `sharedPeak`: the most write requests in flight on the shared `saveGate`, all callers
 *    together, seen each time one of this save's requests took a slot. Above `peak` only when
 *    other work (another save's background reconcile, the CAPEX panel) wrote at the same time.
 */
export interface RequestMeter {
  count: number;
  totalMs: number;
  maxMs: number;
  inFlight: number;
  peak: number;
  sharedPeak: number;
}

export function createRequestMeter(): RequestMeter {
  return { count: 0, totalMs: 0, maxMs: 0, inFlight: 0, peak: 0, sharedPeak: 0 };
}

/**
 * `saveGate(task)`, timing the task once it holds a slot. Every write request of a save (never a
 * delete) goes through here. `onDuration` also receives that one request's duration (the bulk
 * requests' per-request entries in the save line); `meter`, when given, counts it for that save.
 */
function gated<T>(task: () => Promise<T>, onDuration?: (ms: number) => void, meter?: RequestMeter): Promise<T> {
  return saveGate(async () => {
    const t0 = performance.now();
    if (meter) {
      meter.inFlight += 1;
      if (meter.inFlight > meter.peak) meter.peak = meter.inFlight;
      const shared = saveGate.inFlight();
      if (shared > meter.sharedPeak) meter.sharedPeak = shared;
    }
    try {
      return await task();
    } finally {
      const ms = performance.now() - t0;
      if (meter) {
        meter.inFlight -= 1;
        meter.count += 1;
        meter.totalMs += ms;
        if (ms > meter.maxMs) meter.maxMs = ms;
      }
      onDuration?.(ms);
    }
  });
}

/**
 * A single write request outside `upsertRowsByAction` (the CAPEX panel's contract create or
 * update) through the shared `saveGate`, counted on that save's `meter`. Same slot as before.
 */
export function gatedWrite<T>(task: () => Promise<T>, meter?: RequestMeter): Promise<T> {
  return gated(task, undefined, meter);
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
  table: BulkTableInfo, rows: readonly UpsertTarget[], label: string, guard = false, meter?: RequestMeter,
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
    unwrap((await gated(() => send(row.id, row.fields), undefined, meter)) as Parameters<typeof unwrap>[0], label);
  }, ROW_WRITE_CONCURRENCY);
  return { requests: checks + rows.length };
}

/**
 * How one action's group of rows actually went out, for the save's timing log. `deep insert`: new
 * contracts created with their cost rows nested, one POST each (`deepInsertContracts`).
 */
type GroupPath = "bulk" | "per-row after 501" | "per-row since an earlier 501" | "deep insert";

/**
 * One action's group, for the log: its path, and on the bulk path each bulk request's own server
 * duration in completion order (`gated`, queueing excluded).
 */
interface GroupTrack { path?: GroupPath; durations?: number[] }

/**
 * `bulk [980 ms, 10,740 ms]` on the bulk path (one entry per request, exact ms: the one-line
 * summary's unit, D59); the path alone otherwise.
 */
function groupPathText(track: GroupTrack): string {
  const path = track.path ?? "bulk";
  const durations = path === "bulk" || path === "deep insert" ? track.durations ?? [] : [];
  return durations.length === 0 ? path : `${path} [${durations.map((ms) => formatMs(ms)).join(", ")}]`;
}

/**
 * One action's group as it went, for the save logs' collapsed groups (D59): the structured twin
 * of the summary text `upsertRowsByAction` reports.
 */
export interface UpsertGroupReport {
  action: BulkAction;
  rows: number;
  /** Requests sent; absent when the group failed (a failing group's count is not known). */
  requests?: number;
  failed: boolean;
  path: GroupPath;
  /** Each bulk request's own server time, in completion order (bulk path only). */
  durations: readonly number[];
}

/**
 * One action's group: the bulk message first, per-row upserts when that action answers 501 on
 * its first chunk (nothing was written then, so the fallback is safe). Any other refusal, or a
 * 501 after a chunk landed, propagates unchanged. The refused 501 request counts as a request.
 * `guardPerRowUpdates`: the update group's per-row path re-checks its ids first (`upsertEachRow`).
 */
async function sendGroup(
  action: BulkAction, table: BulkTableInfo, rows: readonly UpsertTarget[], label: string,
  track: GroupTrack, guardPerRowUpdates = false, meter?: RequestMeter,
): Promise<number> {
  if (rows.length === 0) return 0;
  const groupLabel = `${label} (${action})`;
  const guard = action === "update" && guardPerRowUpdates;
  if (bulkUnavailable[action]) {
    // Reached in a skipped-verify save only when another operation of THIS save set the flag.
    track.path = "per-row since an earlier 501";
    return (await upsertEachRow(table, rows, groupLabel, guard, meter)).requests;
  }
  track.path = "bulk";
  const durations: number[] = (track.durations = []);
  try {
    // Parallel chunks (`BULK_TUNING`): each one still passes `saveGate` through
    // `bulkTransport`, so the save's in-flight cap is unchanged.
    return (await upsertMultiple(table, rows, bulkTransport(action, (ms) => { durations.push(ms); }, meter), {
      label: groupLabel, ...bulkChunkOptions(),
    })).requests;
  } catch (error) {
    if (!isBulkNotImplemented(error)) throw error;
    rememberBulk501(action);
    console.warn(bulk501WarningLine(BULK_ACTION_NAME[action], groupLabel, rows.length));
  }
  track.path = "per-row after 501";
  return refusedBulkRequests(rows.length) + (await upsertEachRow(table, rows, groupLabel, guard, meter)).requests;
}

/**
 * The 501 warning (D59: the original text, then what happens next, in plain words). Shared by both
 * saves. Pure, so the text is pinned by a test.
 */
export function bulk501WarningLine(actionName: string, groupLabel: string, rows: number): string {
  return `${actionName} answered 501 Not Implemented; ${groupLabel} continues row by row. `
    + `Nothing of it was written by the refused request; ${rows.toLocaleString("en-US")} `
    + `${rows === 1 ? "row goes" : "rows go"} out as one PATCH each, and this tab keeps sending `
    + `${actionName} rows one by one while its session flag is set (until the tab closes).`;
}

/**
 * How many bulk requests a group of `rowCount` rows sent before its 501 fallback: every parallel
 * chunk when the group was split (all of them answered 501, or it would not have fallen back),
 * else the one sequential first chunk (a 501 there stops the group).
 */
function refusedBulkRequests(rowCount: number): number {
  return BULK_TUNING.parallel > 1 ? Math.max(1, bulkRequestCount(rowCount)) : 1;
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
 *   orchestrator reads "counts unknown" as "may have committed" and reconciles cautiously. When
 *   the create group's outcome is exact, the error (`GroupsWriteError`) also carries its
 *   `landedIds`, so the new rows that landed are reconciled and the others left out;
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
  report?: (summary: string, groups: readonly UpsertGroupReport[]) => void,
  opts: { guardPerRowUpdates?: boolean; meter?: RequestMeter } = {},
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
      action, table, groups[action], label, tracks[action], opts.guardPerRowUpdates === true, opts.meter,
    )),
  );

  const reports: UpsertGroupReport[] = [];
  actions.forEach((action, i) => {
    if (groups[action].length === 0) return;
    const s = settled[i] as PromiseSettledResult<number>;
    const track = tracks[action];
    const path = track.path ?? "bulk";
    reports.push({
      action, rows: groups[action].length, failed: s.status === "rejected", path,
      durations: path === "bulk" ? [...(track.durations ?? [])] : [],
      ...(s.status === "fulfilled" ? { requests: s.value } : {}),
    });
  });
  report?.(reports
    .map((g) => (g.failed
      ? `${g.action} failed ${groupPathText(tracks[g.action])}`
      : `${g.action} ${g.requests} req ${groupPathText(tracks[g.action])}`))
    .join(", ") || "nothing to send", reports);

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
  const createIndex = actions.indexOf("create");
  const wrapped = new GroupsWriteError(
    operation, first.reason, dataStatus(first.reason),
    groupLandedIds(groups.create, settled[createIndex] as PromiseSettledResult<number>),
  );
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
 * `upsertRowsByAction`'s error when BOTH groups had rows and one or both failed: a plain `DataError`
 * (no `rowsCommitted` / `chunksCommitted`: neither group is a prefix of the phase's rows), plus
 * `landedIds` when the CREATE group's outcome is exact (`groupLandedIds`). The orchestrator reads it
 * as "these new rows landed, every other new row did not"; existing rows outside it stay unknown
 * and are reconciled by force, as before (review fix, D75). `name` stays `DataError`.
 */
class GroupsWriteError extends DataError {
  readonly landedIds?: readonly string[];

  constructor(operation: string, cause: unknown, status: number | undefined, landedIds?: readonly string[]) {
    super(operation, cause, status);
    if (landedIds) this.landedIds = landedIds;
  }
}

/**
 * Which rows of one action's group landed, when that is known exactly: all of them when it
 * succeeded; a `BulkPartialWriteError`'s `landedIds` (each parallel chunk is all-or-nothing); the
 * `rowsCommitted` prefix of a `BulkWriteError` (the group is in input order). Undefined otherwise
 * (a per-row failure, no counts).
 */
function groupLandedIds(
  rows: readonly UpsertTarget[], outcome: PromiseSettledResult<number>,
): readonly string[] | undefined {
  if (outcome.status === "fulfilled") return rows.map((r) => r.id);
  const reason = outcome.reason as { landedIds?: unknown; rowsCommitted?: unknown } | null;
  if (typeof reason !== "object" || reason === null) return undefined;
  if (Array.isArray(reason.landedIds)) return reason.landedIds as string[];
  if (typeof reason.rowsCommitted === "number") return rows.slice(0, reason.rowsCommitted).map((r) => r.id);
  return undefined;
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

/* ═══════════════════════════════════════════════════════ deep insert (WS-B) ══ */

/**
 * The contract → cost one-to-many navigation property, on the contract side: relationship
 * `vsb_capexcost_Contract_vsb_capexprojectcontract` (Cascade delete), its referenced-role
 * `NavigationPropertyName` in `ProjectDocs/_extracted/VSBCloud/customizations.xml`. The
 * referencing role is `vsb_Contract`, the bind a new cost row carries (`vsb_Contract@odata.bind`).
 */
export const CONTRACT_COSTS_NAV = "vsb_capexcost_Contract_vsb_capexprojectcontract";

/** The cost row's contract bind; inside a deep insert the parent links the row instead. */
const COST_CONTRACT_BIND = "vsb_Contract@odata.bind";

/**
 * The body of one deep-insert POST to `vsb_capexprojectcontracts` (Microsoft Learn, "Create a
 * table row using the Web API", section "Create related table rows in one operation"): the
 * contract's own fields and client-minted id, and its new cost rows as an array under
 * `CONTRACT_COSTS_NAV`, each with its own fields (owning-BU bind included, rule 4) and id. No
 * `@odata.type`: a plain create addresses its entity set by URL. Pure.
 */
export function deepInsertBody(group: DeepInsertGroup): Record<string, unknown> {
  return {
    ...group.contract.fields,
    [CAPEX_CONTRACTS.primaryKey]: group.contract.id,
    [CONTRACT_COSTS_NAV]: group.costs.map((c) => ({ ...c.fields, [CAPEX_COSTS.primaryKey]: c.id })),
  };
}

/**
 * The deep-insert route's two per-tab flags (`sessionStorage`, like the 501 flags):
 *  - `unavailable`: a deep insert failed in this tab (refused, or its nested rows did not land).
 *    Later saves take the CreateMultiple path at once, so a route that refuses the nested payload
 *    can never block a retry.
 *  - `confirmed`: a deep insert in this tab landed AND its nested cost rows were read back. Until
 *    then each deep insert reads its nested ids back (`deepInsertContracts`), because a host that
 *    dropped the nested array would create the contract without its costs and answer success.
 */
const DEEP_INSERT_KEY = {
  unavailable: "vsb.addCostSheet.deepInsertUnavailable",
  confirmed: "vsb.addCostSheet.deepInsertConfirmed",
} as const;

const deepInsertState = {
  unavailable: readSessionFlag(DEEP_INSERT_KEY.unavailable),
  confirmed: readSessionFlag(DEEP_INSERT_KEY.confirmed),
};

/** Whether this tab may still try the deep-insert route (no deep insert failed in it). */
export function isDeepInsertAvailable(): boolean {
  return !deepInsertState.unavailable;
}

/** Test seam: forget both deep-insert flags. */
export function resetDeepInsertState(): void {
  for (const key of ["unavailable", "confirmed"] as const) {
    deepInsertState[key] = false;
    try {
      globalThis.sessionStorage?.removeItem(DEEP_INSERT_KEY[key]);
    } catch {
      // See `writeSessionFlag`.
    }
  }
}

function rememberDeepInsert(key: keyof typeof DEEP_INSERT_KEY): void {
  deepInsertState[key] = true;
  writeSessionFlag(DEEP_INSERT_KEY[key]);
}

/**
 * Some deep-insert POSTs failed, or their nested rows did not land. Each POST is ONE atomic
 * operation (Microsoft: deep insert "succeeds or fails entirely"), so the contracts are exact:
 * `landedIds` were created (with their cost rows, unless `childrenMissing`), `failedIds` were not.
 *
 * DELIBERATELY no `rowsCommitted` / `chunksCommitted`: the orchestrator reads those as "this prefix
 * of the rows landed", and parallel POSTs are not a prefix. It reads `landedIds` instead.
 * `cause` is the first failure in input order; `causes` every failure, the read-back's last.
 */
export class DeepInsertError extends Error {
  readonly label: string;
  readonly landedIds: readonly string[];
  readonly failedIds: readonly string[];
  /** The nested cost rows of a landed contract were not found (or could not be read) afterwards. */
  readonly childrenMissing: boolean;
  readonly causes: readonly unknown[];
  /** `Error.cause` exists on the base type, hence the modifier. */
  override readonly cause: unknown;

  constructor(
    label: string, landedIds: readonly string[], failedIds: readonly string[], childrenMissing: boolean,
    causes: readonly unknown[],
  ) {
    const first = causes[0];
    const detail = first instanceof Error ? first.message : String(first);
    super(
      `${label}: ${failedIds.length} deep insert(s) failed, ${landedIds.length} contract(s) were created`
        + `${childrenMissing ? " but their cost rows were not all found" : ""}. First failure: ${detail}`,
    );
    this.name = "DeepInsertError";
    this.label = label;
    this.landedIds = landedIds;
    this.failedIds = failedIds;
    this.childrenMissing = childrenMissing;
    this.causes = causes;
    this.cause = first;
  }
}

/**
 * Checks a deep insert's groups before anything is sent (0 committed, `BulkValidationError`):
 * the same id and reserved-key checks as a bulk upsert, for the contracts and for every nested
 * row; only NEW rows; no nested array or contract bind already in the fields.
 */
function validateDeepInsert(groups: readonly DeepInsertGroup[], label: string): void {
  toUpsertTargets(CAPEX_CONTRACTS, groups.map((g) => g.contract), label);
  toUpsertTargets(CAPEX_COSTS, groups.flatMap((g) => g.costs), label);
  const refuse = (table: BulkTableInfo, reason: string) => new BulkValidationError(label, table.entitySetName, reason);
  for (const { contract, costs } of groups) {
    if (!contract.isNew) throw refuse(CAPEX_CONTRACTS, `contract ${contract.id} is not new; only a create can carry nested rows.`);
    if (Object.prototype.hasOwnProperty.call(contract.fields, CONTRACT_COSTS_NAV)) {
      throw refuse(CAPEX_CONTRACTS, `contract ${contract.id} sets "${CONTRACT_COSTS_NAV}" in fields; the sender adds it itself.`);
    }
    for (const cost of costs) {
      if (!cost.isNew) throw refuse(CAPEX_COSTS, `cost row ${cost.id} is not new; only a create can be nested.`);
      if (Object.prototype.hasOwnProperty.call(cost.fields, COST_CONTRACT_BIND)) {
        throw refuse(CAPEX_COSTS, `cost row ${cost.id} still sets "${COST_CONTRACT_BIND}"; a nested row is linked by its parent.`);
      }
    }
  }
}

/**
 * WS-B: creates each NEW contract together with its new cost rows, one deep-insert POST per
 * contract (`Vsb_capexprojectcontractsService.create`; the SDK sends the body as it is, JSON, with
 * `Prefer: return=representation`), all POSTs at once, each through the shared `saveGate` and
 * counted on `opts.meter`. `CreateMultiple` is not used for them: its `Targets` are "records of the
 * same type", and Microsoft documents deep insert for a single create only.
 *
 * READ-BACK. Until a deep insert has been confirmed in this tab, the nested cost ids of the
 * contracts that landed are read back once (`existingIds`, one read per `CHUNK` ids, counted in
 * `requests`). All found: the tab is confirmed and later saves skip the read. Any missing, or the
 * read failed: a `DeepInsertError` with `childrenMissing`, so the orchestrator reconciles those
 * contracts' totals instead of trusting them.
 *
 * FAILURE. Every POST is awaited (`allSettled`), then any failure throws `DeepInsertError` (exact
 * `landedIds`), and the tab is flagged `unavailable`, so the retry takes the CreateMultiple path.
 * `report` receives the log summary and group, also on failure. Returns the requests sent.
 */
export async function deepInsertContracts(
  groups: readonly DeepInsertGroup[], label: string,
  report?: (summary: string, groups: readonly UpsertGroupReport[]) => void,
  opts: { meter?: RequestMeter } = {},
): Promise<{ requests: number }> {
  if (groups.length === 0) return { requests: 0 };
  const groupLabel = `${label} (deep insert)`;
  validateDeepInsert(groups, groupLabel);
  const track: GroupTrack = { path: "deep insert", durations: [] };
  const durations = track.durations as number[];
  const settled = await Promise.allSettled(groups.map((group) => gated(
    async () => unwrap(await Vsb_capexprojectcontractsService.create(deepInsertBody(group) as never), groupLabel),
    (ms) => { durations.push(ms); }, opts.meter,
  )));
  const landed = groups.filter((_, i) => settled[i]?.status === "fulfilled");
  const failedIds = groups.filter((_, i) => settled[i]?.status !== "fulfilled").map((g) => g.contract.id);
  const causes: unknown[] = settled.flatMap((s) => (s.status === "rejected" ? [s.reason as unknown] : []));
  let requests = groups.length;
  let childrenMissing = false;

  const nested = landed.flatMap((g) => g.costs.map((c) => c.id));
  if (!deepInsertState.confirmed && nested.length > 0) {
    requests += chunk(nested).length;
    try {
      const found = await existingIds(CAPEX_COSTS, nested);
      const missing = nested.filter((id) => !found.has(id.toLowerCase())).length;
      if (missing > 0) {
        childrenMissing = true;
        causes.push(new DataError(
          `${groupLabel}: ${missing} of ${nested.length} nested cost row(s) were not found after their contract was created`,
        ));
      } else if (causes.length === 0) {
        rememberDeepInsert("confirmed");
      }
    } catch (readError) {
      childrenMissing = true;
      causes.push(new DataError(`${groupLabel}: the nested cost rows could not be read back`, readError));
    }
  }

  const failed = causes.length > 0;
  report?.(
    `create ${failed ? "failed" : `${requests} req`} ${groupPathText(track)}`,
    [{
      action: "create", rows: groups.length + groups.reduce((n, g) => n + g.costs.length, 0),
      failed, path: "deep insert", durations: [...durations], ...(failed ? {} : { requests }),
    }],
  );
  if (!failed) return { requests };
  rememberDeepInsert("unavailable");
  throw new DeepInsertError(groupLabel, landed.map((g) => g.contract.id), failedIds, childrenMissing, causes);
}
