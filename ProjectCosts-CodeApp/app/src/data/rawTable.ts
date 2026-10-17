/**
 * Access to a Dataverse table that has NO `pac`-generated service yet (M9, gap C3).
 *
 * Three copies of this plumbing existed: `checklist-settings.ts` (`guarded` + `pageOf`),
 * `project-gates.ts` (`guarded` + `rawPage`) and `contracts.ts` (DevCo `guarded`). This is the
 * one shared version:
 *
 *   - Goes through `getClient(dataSourcesInfo)` by entity-set name, like `client.ts`
 *     `deleteRecord` (generated files must never be hand-written).
 *   - BOTH failure shapes become a `DataError`: `success: false` (via `unwrap`) and a THROWN
 *     error (an unregistered table can make the SDK throw before any request is sent).
 *   - `page` returns the SDK page result UNCHANGED, `skipToken` included, so `fetchAll` keeps
 *     following it past 500 rows (Checklist gap B-1: rebuilding `{success, data}` dropped the
 *     token and cut the lock set at 500 rows).
 *
 * When `pac code add-data-source` generates the service, the callers (e.g.
 * `data/settings/checklistTables.ts`) swap `rawTable(…)` for `Vsb_…Service` in their own file.
 */
import { getClient } from "@microsoft/power-apps/data";
import type { IOperationOptions, IOperationResult } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { DataError } from "@/platform/errors";
import { fetchAll, guardedCall, updateRecordIfExists, type FetchAllOptions } from "./client";

export { guardedCall };

/** The subset of the SDK client this module uses (injectable for tests). */
export interface RawClient {
  retrieveMultipleRecordsAsync<T>(table: string, options?: IOperationOptions): Promise<IOperationResult<T[]>>;
  createRecordAsync<TIn, TOut>(table: string, record: TIn): Promise<IOperationResult<TOut>>;
  updateRecordAsync<TIn, TOut>(table: string, id: string, record: TIn): Promise<IOperationResult<TOut>>;
  deleteRecordAsync(table: string, id: string): Promise<IOperationResult<unknown>>;
}

export const defaultRawClient = (): RawClient => getClient(dataSourcesInfo) as unknown as RawClient;

export interface RawTable<TRow> {
  readonly entitySet: string;
  /** One SDK page, unchanged (for `fetchAll`). A throw becomes `DataError("read <set>")`. */
  page(options: IOperationOptions): Promise<IOperationResult<TRow[]>>;
  /** Every page. `operation` defaults to `read <entitySet>` (Project Gates' wording). */
  list(options: FetchAllOptions, operation?: string): Promise<TRow[]>;
  create<TIn>(record: TIn, operation?: string): Promise<TRow>;
  /**
   * Guarded PATCH (V-1, `updateRecordIfExists`): the row is read by primary key first and a
   * deleted row raises `RecordGoneError` with NOTHING sent — the SDK PATCH would otherwise upsert
   * (recreate) it. Needs the table's primary key: `primaryKey` below, or the generated
   * `dataSourcesInfo` entry; with neither, the update is refused.
   */
  update<TIn>(id: string, changed: TIn, operation?: string): Promise<void>;
  remove(id: string, operation?: string): Promise<void>;
}

/**
 * @param primaryKey the table's primary-key column, used by the guarded `update`. Optional for a
 *   registered data source (read from `dataSourcesInfo`), required for an unregistered one.
 */
export function rawTable<TRow>(
  entitySet: string,
  client: () => RawClient = defaultRawClient,
  primaryKey?: string,
): RawTable<TRow> {
  const readOp = `read ${entitySet}`;
  return {
    entitySet,
    async page(options) {
      try {
        return await client().retrieveMultipleRecordsAsync<TRow>(entitySet, options);
      } catch (error) {
        throw error instanceof DataError ? error : new DataError(readOp, error);
      }
    },
    list(options, operation = readOp) {
      return fetchAll<TRow>(operation, (o) => this.page(o), options);
    },
    create(record, operation = `create ${entitySet}`) {
      return guardedCall(operation, () => client().createRecordAsync(entitySet, record) as Promise<IOperationResult<TRow>>);
    },
    async update(id, changed, operation = `update ${entitySet}`) {
      await updateRecordIfExists(operation, entitySet, id, changed, {
        ...(primaryKey ? { primaryKey } : {}),
        client,
      });
    },
    async remove(id, operation = `delete ${entitySet}`) {
      await guardedCall(operation, () => client().deleteRecordAsync(entitySet, id));
    },
  };
}
