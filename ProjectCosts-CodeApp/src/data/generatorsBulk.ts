/**
 * The real `BulkBackend` (contract: `./bulkBackend.ts`) for the Generators tables: native
 * `CreateMultiple` / `UpdateMultiple` through the shared write gate, with fail-closed validation,
 * a guarded update, exact failure counts, a per-action 501 fallback and a `Retry-After`-aware
 * retry of 429. Decisions: ProjectDocs/app-docs/GENERATORS-BULK-IMPLEMENTATION-PLAN.md §2.2-2.6, §9.5, §9.7.
 *
 * What is reused, not copied (CONVENTIONS rule 17): the target shape, id and reserved-key checks,
 * the tuned splitter, sequential/parallel failure accounting (`upsertMultiple`, `./bulkWrites.ts`),
 * the write gate, the `[VSB] DATA` line of one bulk request and the 501 session flags
 * (`./bulkSend.ts`), `chunk` / `idIn` (`./odata.ts`) and `fetchAll` (`./client.ts`).
 *
 * Writes are never retried as a whole: see `retryDelay` for the one case that is.
 */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { CreateMultipleService } from "@/generated/services/CreateMultipleService";
import { UpdateMultipleService } from "@/generated/services/UpdateMultipleService";
import { Vsb_generatorinprojectsService } from "@/generated/services/Vsb_generatorinprojectsService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { Vsb_landleaseallocationwtgsService } from "@/generated/services/Vsb_landleaseallocationwtgsService";
import { Vsb_opexprojectcostsService } from "@/generated/services/Vsb_opexprojectcostsService";
import { Vsb_pvmoduletypeinprojectsService } from "@/generated/services/Vsb_pvmoduletypeinprojectsService";
import { DataError, unwrap } from "@/platform/errors";
import { logAction, loggedCall } from "@/platform/requestLog";
import { fetchAll } from "./client";
import { forEachLimit } from "./concurrency";
import { ES_PLANT } from "./dataverseNames";
import { chunk, idIn, OWNING_BU_BIND } from "./odata";
import {
  BulkPartialWriteError, BulkValidationError, BulkWriteError, parallelChunkSize, upsertMultiple,
} from "./bulkWrites";
import {
  bulkChunkOptions, gatedWrite, loggedBulkRequest, readSessionFlag, writeSessionFlag,
} from "./bulkSend";
import type { BulkAction } from "./bulkSend";
import type { BulkBackend, BulkCallOptions, BulkCreateResult, BulkRow, BulkUpdateResult } from "./bulkBackend";
import type { BulkTableInfo, UpsertTarget } from "./bulkTypes";
import { BulkBackendValidationError, BulkBatchError, BulkRowsGoneError } from "./bulkTypes";

/* ═══════════════════════════════════════════════════════ table registry ══ */

type Service = {
  create(record: never): Promise<unknown>;
  update(id: string, fields: never): Promise<unknown>;
  getAll(options?: never): Promise<unknown>;
};

/** One table the backend may write: its names, what it may do, and its per-row service. */
export interface GeneratorsTable extends BulkTableInfo {
  /** `createMany` is allowed (`false`: update-only table). */
  readonly creates: boolean;
  readonly service: Service;
}

const table = (
  entitySetName: string, logicalName: string, primaryKey: string, creates: boolean, service: unknown,
): GeneratorsTable => ({ entitySetName, logicalName, primaryKey, creates, service: service as Service });

/**
 * The tables of the Generators programme, keyed by entity set. Names are from
 * `ProjectDocs/reference/dataverse-entities.json`, entity sets from `./dataverseNames.ts`, and the
 * primary keys agree with `.power/schemas/appschemas/dataSourcesInfo.ts`. Any other entity set is
 * refused (`BulkBackendValidationError`): the backend writes nothing it does not know.
 */
export const GENERATORS_TABLES: Readonly<Record<string, GeneratorsTable>> = Object.freeze(
  Object.fromEntries([
    table("vsb_landleaseallocationwtgs", "vsb_landleaseallocationwtg", "vsb_landleaseallocationwtgid", true,
      Vsb_landleaseallocationwtgsService),
    table(ES_PLANT.generatorInProjects, "vsb_generatorinproject", "vsb_generatorinprojectid", true,
      Vsb_generatorinprojectsService),
    table(ES_PLANT.opexProjectCosts, "vsb_opexprojectcost", "vsb_opexprojectcostid", false,
      Vsb_opexprojectcostsService),
    table(ES_PLANT.generatorTypeInProjects, "vsb_generatortypeinproject", "vsb_generatortypeinprojectid", false,
      Vsb_generatortypeinprojectsService),
    table(ES_PLANT.pvModuleTypeInProjects, "vsb_pvmoduletypeinproject", "vsb_pvmoduletypeinprojectid", false,
      Vsb_pvmoduletypeinprojectsService),
  ].map((t) => [t.entitySetName, t])),
);

function tableFor(entitySet: string): GeneratorsTable {
  const found = Object.prototype.hasOwnProperty.call(GENERATORS_TABLES, entitySet)
    ? GENERATORS_TABLES[entitySet] : undefined;
  if (!found) {
    throw new BulkBackendValidationError(`"${entitySet}" is not a table the Generators bulk backend writes; nothing was sent.`);
  }
  return found;
}

/* ════════════════════════════════════════════════════════════ tuning ══ */

/** Test seams and overrides of the chunking of this path; the default is the tuned `BULK_TUNING`. */
export interface GeneratorsChunking {
  /** Largest rows per request (`BULK_TUNING.maxChunk`, 500). */
  chunkSize?: number;
  /** Requests of one call sent at once; 1 = strictly one after another (exact prefix counts). */
  parallel?: number;
  /** Smallest chunk a parallel split makes (`BULK_TUNING.minChunk`, 10). */
  minChunk?: number;
}

let chunkingOverride: GeneratorsChunking | null = null;

/** Overrides this path's chunking (tests, or a measured tuning); `null` restores the tuned default. */
export function setGeneratorsBulkChunking(next: GeneratorsChunking | null): void {
  chunkingOverride = next;
}

/** Waits `ms`; injected in tests so a retry never sleeps for real. */
export type Sleeper = (ms: number) => Promise<void>;
const realSleep: Sleeper = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
let sleeperOverride: Sleeper | null = null;

export function setGeneratorsBulkSleeper(next: Sleeper | null): void {
  sleeperOverride = next;
}

export interface GeneratorsBulkOptions extends GeneratorsChunking {
  sleep?: Sleeper;
}

/** Tries per bulk request (the first plus two retries) and the longest single wait. */
export const MAX_BULK_TRIES = 3;
export const MAX_RETRY_WAIT_MS = 30_000;

/* ══════════════════════════════════════════════════════════ retry ══ */

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  const status = e["status"] ?? e["statusCode"];
  return typeof status === "number" ? status : undefined;
}

function headerOf(error: unknown, name: string): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { headers?: unknown; response?: { headers?: unknown }; retryAfter?: unknown };
  if (name === "retry-after" && typeof e.retryAfter === "number") return String(e.retryAfter);
  for (const headers of [e.headers, e.response?.headers]) {
    if (!headers || typeof headers !== "object") continue;
    const getter = (headers as { get?: unknown }).get;
    if (typeof getter === "function") {
      const value = (getter as (n: string) => unknown).call(headers, name);
      if (typeof value === "string") return value;
    } else {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name && (typeof value === "string" || typeof value === "number")) return String(value);
      }
    }
  }
  return undefined;
}

/**
 * The `Retry-After` header of a failed request in milliseconds (seconds, or an HTTP date), or
 * undefined when absent or unreadable. Pure given `now`.
 */
export function retryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  const raw = headerOf(error, "retry-after")?.trim();
  if (!raw) return undefined;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/**
 * How long to wait before the next try of a bulk request that failed, or undefined for "do not
 * retry". `attempt` is the number of tries made so far.
 *
 * REASONING. Re-sending a write is only safe when the server certainly did not process it, and a
 * bulk request is never idempotent here (a repeated `CreateMultiple` of ids that landed fails, a
 * repeated `UpdateMultiple` can overwrite a newer edit). So:
 *  - 429 (service protection) is answered BEFORE the request is processed: retry, waiting the
 *    `Retry-After` header (default 1 s x attempt), at most `MAX_RETRY_WAIT_MS`;
 *  - 503 only when it carries a `Retry-After` (the platform's explicit "not processed, come
 *    back" signal); a bare 503 may be a gateway that dropped the reply after processing;
 *  - every other status (4xx, 500, 501, a network failure without a status) is NEVER retried, as
 *    the request may have partly landed or can never succeed. 501 has its own per-row fallback.
 */
export function retryDelay(error: unknown, attempt: number, now: number = Date.now()): number | undefined {
  if (attempt >= MAX_BULK_TRIES) return undefined;
  const status = statusOf(error);
  const header = retryAfterMs(error, now);
  if (status !== 429 && !(status === 503 && header !== undefined)) return undefined;
  return Math.min(header ?? 1000 * attempt, MAX_RETRY_WAIT_MS);
}

/* ═══════════════════════════════════════════════════════ 501 flags ══ */

/** Own key names (not Add Cost's): a 501 there says nothing about these routes. */
const FLAG_KEY: Readonly<Record<BulkAction, string>> = {
  create: "vsb.generators.createMultiple501",
  update: "vsb.generators.updateMultiple501",
};
const ACTION_NAME: Readonly<Record<BulkAction, string>> = { create: "CreateMultiple", update: "UpdateMultiple" };
const perRow501: Record<BulkAction, boolean> = {
  create: readSessionFlag(FLAG_KEY.create),
  update: readSessionFlag(FLAG_KEY.update),
};

/** Test seam: forget every 501 seen in this tab (memory and `sessionStorage`). */
export function resetGeneratorsBulkAvailability(): void {
  for (const action of ["create", "update"] as const) {
    perRow501[action] = false;
    try {
      globalThis.sessionStorage?.removeItem(FLAG_KEY[action]);
    } catch {
      // Storage blocked: the in-memory flag was the only one.
    }
  }
}

/** Whether `action` goes row by row in this tab (it answered 501 earlier). */
export function isGeneratorsBulkPerRow(action: BulkAction): boolean {
  return perRow501[action];
}

/** The 501 warning line; pure. Names the verb of the per-row path (POST for create, PATCH for update). */
export function generatorsBulk501Line(action: BulkAction, label: string, rows: number): string {
  const name = ACTION_NAME[action];
  return `${name} answered 501 Not Implemented; ${label} continues row by row. Nothing of it was written by the `
    + `refused request; ${rows.toLocaleString("en-US")} ${rows === 1 ? "row goes" : "rows go"} out as one `
    + `${action === "create" ? "POST" : "PATCH"} each, and this tab keeps sending ${name} rows one by one while its `
    + `session flag is set (until the tab closes).`;
}

/** A 501 on the FIRST chunk (nothing landed): the same test as Add Cost's `isBulkNotImplemented`. */
function isNotImplemented(error: unknown): boolean {
  if (!(error instanceof BulkWriteError) || error.chunksCommitted !== 0) return false;
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof DataError && current.status === 501) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════ validation ══ */

const RESERVED = ["@odata.type", "@odata.id"] as const;

/**
 * Fail-closed checks over ALL rows before anything is sent: an empty id, an id twice
 * (case-insensitive: Dataverse compares GUIDs so, and UpdateMultiple silently ignores a duplicate),
 * a reserved key in `data` (`@odata.type`, `@odata.id`, the primary key) and, for a create, a row
 * without `owningbusinessunit@odata.bind` (rule 4: omitting it never errors, the row just becomes
 * invisible to a business-unit-scoped colleague).
 */
function validate(t: GeneratorsTable, rows: readonly BulkRow[], action: BulkAction, label: string): void {
  const refuse = (reason: string) => new BulkBackendValidationError(`${label}: ${t.entitySetName}: ${reason} Nothing was sent.`);
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (typeof row.id !== "string" || row.id.trim() === "") throw refuse(`row ${index} has no id.`);
    const key = row.id.toLowerCase();
    if (seen.has(key)) throw refuse(`row ${index} repeats an id of an earlier row.`);
    seen.add(key);
    for (const name of [t.primaryKey, ...RESERVED]) {
      if (Object.prototype.hasOwnProperty.call(row.data, name)) {
        throw refuse(`row ${index} sets "${name}" in data; the backend adds that key itself.`);
      }
    }
    if (action === "create") {
      const bind = row.data[OWNING_BU_BIND];
      if (typeof bind !== "string" || bind.trim() === "") {
        throw refuse(`row ${index} has no "${OWNING_BU_BIND}" (CONVENTIONS rule 4).`);
      }
    }
  });
}

const toTargets = (rows: readonly BulkRow[]): UpsertTarget[] =>
  rows.map((r) => ({ id: r.id, isNew: false, fields: r.data }));

/* ═══════════════════════════════════════════════════════ errors ══ */

const detailOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * `upsertMultiple`'s outcome as the contract's `BulkBatchError`: exact `rowsLanded`. Sequential:
 * the committed prefix (`BulkWriteError.rowsCommitted`). Parallel: the rows of the chunks that
 * landed (`BulkPartialWriteError.landedIds`, a set), or 0 when every chunk failed.
 */
function toBatchError(error: unknown, ids: readonly string[], label: string): unknown {
  if (error instanceof BulkValidationError) return new BulkBackendValidationError(`${error.message} Nothing was sent.`);
  const total = ids.length;
  if (error instanceof BulkWriteError) {
    return new BulkBatchError(
      `${label}: ${error.rowsCommitted} of ${total} row(s) were saved before the failure. ${detailOf(error.cause)}`,
      { rowsLanded: error.rowsCommitted, rowsTotal: total, landedIds: ids.slice(0, error.rowsCommitted), cause: error.cause },
    );
  }
  if (error instanceof BulkPartialWriteError) {
    return new BulkBatchError(
      `${label}: ${error.landedIds.length} of ${total} row(s) were saved before the failure. ${detailOf(error.cause)}`,
      { rowsLanded: error.landedIds.length, rowsTotal: total, landedIds: error.landedIds, cause: error.cause },
    );
  }
  return error;
}

/* ═════════════════════════════════════════════════════════ sending ══ */

/** Chunking in force: the override, else the tuned default. */
function chunkingFor(options: GeneratorsChunking): { parallel: number; chunkSize: number; minChunk: number } {
  const base = bulkChunkOptions();
  const o = { ...chunkingOverride, ...options };
  return {
    parallel: o.parallel ?? base.parallel,
    chunkSize: o.chunkSize ?? base.chunkSize,
    minChunk: o.minChunk ?? base.minChunk,
  };
}

/**
 * The gated transport of one bulk action: each ATTEMPT takes a slot of the shared write gate, logs
 * one `[VSB] DATA <kind> <entityset>` entry and counts as a request. The wait between attempts
 * happens OUTSIDE the gate, so a throttled request never holds a slot while it sleeps.
 */
function bulkTransport(action: BulkAction, sleep: Sleeper, counter: { sent: number }) {
  const send = action === "create"
    ? (es: string, targets: Record<string, unknown>[]) => CreateMultipleService.CreateMultiple(es, targets)
    : (es: string, targets: Record<string, unknown>[]) => UpdateMultipleService.UpdateMultiple(es, targets);
  return async (es: string, targets: readonly Record<string, unknown>[]): Promise<IOperationResult<unknown>> => {
    for (let attempt = 1; ; attempt += 1) {
      counter.sent += 1;
      let outcome: { result: IOperationResult<unknown> } | { thrown: unknown };
      try {
        const result = await gatedWrite(() => loggedBulkRequest(action, es, targets.length, () => send(es, [...targets])));
        outcome = { result };
      } catch (thrown) {
        outcome = { thrown };
      }
      const failure = "thrown" in outcome ? outcome.thrown
        : outcome.result?.success === false ? outcome.result.error : undefined;
      const wait = "thrown" in outcome || outcome.result?.success === false ? retryDelay(failure, attempt) : undefined;
      if (wait === undefined) {
        if ("thrown" in outcome) throw outcome.thrown;
        return outcome.result;
      }
      await sleep(wait);
    }
  };
}

/** Chunks sent through `upsertMultiple`'s own accounting; returns the bulk requests it made. */
async function sendBulk(
  t: GeneratorsTable, action: BulkAction, rows: readonly BulkRow[], label: string,
  sleep: Sleeper, chunking: GeneratorsChunking, counter: { sent: number },
): Promise<void> {
  await upsertMultiple(t, toTargets(rows), bulkTransport(action, sleep, counter), {
    label: `${label} (${action})`, ...chunkingFor(chunking),
  });
}

/**
 * Row by row after a 501: one request each through the gate, each logged. Not atomic, so every row
 * is counted: a failure stops the rows not yet started, and the error carries the exact number
 * that landed. `send` returns the SDK result of one row.
 */
async function sendPerRow(
  t: GeneratorsTable, action: BulkAction, rows: readonly BulkRow[], label: string,
  send: (row: BulkRow) => Promise<unknown>, counter: { sent: number },
): Promise<void> {
  const landed = new Set<string>();
  let failure: { cause: unknown } | undefined;
  await forEachLimit(rows, async (row) => {
    if (failure) return;
    counter.sent += 1;
    try {
      await gatedWrite(() => loggedCall(action, t.entitySetName,
        async () => unwrap(await send(row) as IOperationResult<unknown>, `${label} (${action})`), () => 1));
      landed.add(row.id);
    } catch (cause) {
      failure ??= { cause };
    }
  }, 16);
  if (!failure) return;
  const ids = rows.map((r) => r.id).filter((id) => landed.has(id));
  throw new BulkBatchError(
    `${label}: ${ids.length} of ${rows.length} row(s) were saved before the failure. ${detailOf(failure.cause)}`,
    { rowsLanded: ids.length, rowsTotal: rows.length, landedIds: ids, cause: failure.cause },
  );
}

/** Which of `ids` still exist, read by id in chunks of 40 with only the primary key selected. */
async function readExisting(t: GeneratorsTable, ids: readonly string[], label: string): Promise<Set<string>> {
  const found = new Set<string>();
  await forEachLimit(chunk(ids), async (batch) => {
    const rows = await fetchAll<Record<string, unknown>>(
      `check existing ${t.entitySetName} (${label})`, (o) => t.service.getAll(o as never) as never,
      { select: [t.primaryKey], filter: idIn(t.primaryKey, batch) },
    );
    for (const row of rows) {
      const id = row[t.primaryKey];
      if (typeof id === "string") found.add(id.toLowerCase());
    }
  }, 8);
  return found;
}

/* ════════════════════════════════════════════════════════ backend ══ */

/**
 * The Generators bulk backend. Installed as the default by `getBulkBackend()` (`./bulkBackend.ts`);
 * `options` (chunking, sleeper) are for tests.
 *
 * `requests` counts every HTTP request sent: bulk attempts (a retried 429 and a refused 501 request
 * count), per-row writes after a 501, and for an update the existence reads of its guard.
 */
export function createGeneratorsBulkBackend(options: GeneratorsBulkOptions = {}): BulkBackend {
  const sleeper = (): Sleeper => options.sleep ?? sleeperOverride ?? realSleep;

  return {
    async createMany(entitySet: string, rows: readonly BulkRow[], opts: BulkCallOptions = {}): Promise<BulkCreateResult> {
      const t = tableFor(entitySet);
      const label = opts.label ?? `create ${t.logicalName}`;
      if (!t.creates) {
        throw new BulkBackendValidationError(`${label}: ${entitySet} is update-only for the Generators bulk backend. Nothing was sent.`);
      }
      validate(t, rows, "create", label);
      const ids = rows.map((r) => r.id);
      if (rows.length === 0) return { ids, requests: 0 };

      const counter = { sent: 0 };
      const perRow = (target: readonly BulkRow[]) => sendPerRow(t, "create", target, label, (row) =>
        t.service.create({ ...row.data, [t.primaryKey]: row.id } as never), counter);

      if (perRow501.create) {
        await perRow(rows);
        return { ids, requests: counter.sent };
      }
      try {
        await sendBulk(t, "create", rows, label, sleeper(), options, counter);
      } catch (error) {
        if (!isNotImplemented(error)) throw toBatchError(error, ids, label);
        perRow501.create = true;
        writeSessionFlag(FLAG_KEY.create);
        logAction(generatorsBulk501Line("create", label, rows.length), "warn");
        await perRow(rows);
      }
      return { ids, requests: counter.sent };
    },

    async updateMany(entitySet: string, rows: readonly BulkRow[], opts: BulkCallOptions = {}): Promise<BulkUpdateResult> {
      const t = tableFor(entitySet);
      const label = opts.label ?? `update ${t.logicalName}`;
      validate(t, rows, "update", label);
      if (rows.length === 0) return { requests: 0 };

      // GUARD (plan §9.5): UpdateMultiple on a missing id fails the request, and a per-row PATCH
      // without If-Match would RE-CREATE it. So nothing is sent unless every row still exists.
      const ids = rows.map((r) => r.id);
      const found = await readExisting(t, ids, label);
      const missing = ids.filter((id) => !found.has(id.toLowerCase()));
      if (missing.length > 0) throw new BulkRowsGoneError(missing);

      const counter = { sent: chunk(ids).length };
      // The guard above is the read the per-row PATCH needs; no second read.
      const perRow = (target: readonly BulkRow[]) => sendPerRow(t, "update", target, label, (row) =>
        t.service.update(row.id, row.data as never), counter);

      if (perRow501.update) {
        await perRow(rows);
        return { requests: counter.sent };
      }
      try {
        await sendBulk(t, "update", rows, label, sleeper(), options, counter);
      } catch (error) {
        if (!isNotImplemented(error)) throw toBatchError(error, ids, label);
        perRow501.update = true;
        writeSessionFlag(FLAG_KEY.update);
        logAction(generatorsBulk501Line("update", label, rows.length), "warn");
        await perRow(rows);
      }
      return { requests: counter.sent };
    },
  };
}

/** How many bulk requests `rowCount` rows are cut into under the chunking in force. Pure. */
export function generatorsBulkRequestCount(rowCount: number, chunking: GeneratorsChunking = {}): number {
  if (rowCount <= 0) return 0;
  const { parallel, chunkSize, minChunk } = chunkingFor(chunking);
  if (parallel > 1) {
    const size = parallelChunkSize(rowCount, parallel, chunkSize, minChunk);
    const parallelRequests = Math.ceil(rowCount / size);
    if (parallelRequests > 1) return parallelRequests;
  }
  return Math.ceil(rowCount / chunkSize);
}
