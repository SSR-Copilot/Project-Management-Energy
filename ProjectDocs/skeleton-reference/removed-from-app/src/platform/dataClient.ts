/**
 * The one place Dataverse is touched.
 *
 * Rules encoded here, each replacing a canvas workaround:
 *  - `select` is mandatory. The canvas apps pulled whole rows; that is what made the
 *    galleries slow.
 *  - Paging follows the SDK's `skipToken` instead of the canvas 2,000-row
 *    `ForAll(Sequence(...))` batch loops (App Loading Screen) and the 30-at-a-time
 *    generator paging.
 *  - Multi-row writes go through `batch()`, which fans out under a concurrency gate
 *    instead of one request per row inside a `ForAll`. Dataverse service protection
 *    allows 6,000 requests / 5 min / user and 52 concurrent connections; a 500-row
 *    `ForAll` breaches that.
 *  - 429/503 are retried with jittered backoff honouring `Retry-After`.
 */
import { dataMode, powerClient } from "./powerClient";
import { AppError, toAppError } from "./errors";
import { mockFetch } from "@/data/mock/mockBackend";
import type { IOperationOptions } from "@microsoft/power-apps/data";

export interface Query {
  /** Columns to project. Required — see the rules above. */
  select: string[];
  /** OData `$filter`. Build it with the helpers in `odata.ts`. */
  filter?: string;
  /** `$orderby`, e.g. `["createdon desc"]`. */
  orderBy?: string[];
  /** Page size. Dataverse caps at 5,000. */
  top?: number;
  skip?: number;
  /** Ask Dataverse for the total count (the platform caps the answer at 5,000). */
  count?: boolean;
  /** Follow the skip token until exhausted. Off by default — page deliberately. */
  all?: boolean;
  maxPageSize?: number;
}

export interface Page<T> {
  rows: T[];
  skipToken?: string;
  totalCount?: number;
}

export interface WriteOp {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
}

const MAX_RETRIES = 4;
const jitter = (ms: number) => ms * (0.7 + Math.random() * 0.6);

async function withRetry<T>(fn: () => Promise<T>, source: string): Promise<T> {
  let last: AppError | undefined;
  for (let attemptNo = 0; attemptNo <= MAX_RETRIES; attemptNo++) {
    try {
      return await fn();
    } catch (e) {
      const ae = toAppError(e, source);
      if (!ae.isRetryable || attemptNo === MAX_RETRIES) throw ae;
      last = ae;
      await new Promise((r) => setTimeout(r, ae.retryAfterMs ?? jitter(2 ** attemptNo * 400)));
    }
  }
  throw last ?? new AppError("unknown", "retry exhausted", { source });
}

/** Concurrency gate — stays well inside the 52-connection service-protection limit. */
class Gate {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
const gate = new Gate(16);

function toOptions(q: Query, skipToken?: string): IOperationOptions {
  return {
    select: q.select,
    filter: q.filter,
    orderBy: q.orderBy,
    top: q.top,
    skip: q.skip,
    count: q.count,
    maxPageSize: q.maxPageSize,
    skipToken,
  };
}

function qs(q: Query, skipToken?: string): string {
  const p = new URLSearchParams();
  p.set("$select", q.select.join(","));
  if (q.filter) p.set("$filter", q.filter);
  if (q.orderBy?.length) p.set("$orderby", q.orderBy.join(","));
  if (q.top) p.set("$top", String(q.top));
  // `$skip` and `$count` used to be dropped here while `toOptions` (the live path) sent both,
  // so server-side paging silently returned page 1 forever in mock mode.
  if (q.skip) p.set("$skip", String(q.skip));
  if (q.count) p.set("$count", "true");
  if (skipToken) p.set("$skiptoken", skipToken);
  return p.toString();
}

/** Unwrap the SDK's IOperationResult, turning `success: false` into an AppError. */
function unwrap<T>(res: { success: boolean; data: T; error?: unknown }, source: string): T {
  if (!res.success) throw toAppError(res.error ?? new Error("operation failed"), source);
  return res.data;
}

export const dataClient = {
  async list<T>(entitySet: string, q: Query): Promise<Page<T>> {
    return gate.run(() =>
      withRetry(async () => {
        if (dataMode === "mock") {
          const r = await mockFetch<{ value: T[]; "@odata.count"?: number }>(
            `${entitySet}?${qs(q)}`,
          );
          return { rows: r.value ?? [], totalCount: r["@odata.count"] };
        }

        const client = powerClient();
        const first = await client.retrieveMultipleRecordsAsync<T>(entitySet, toOptions(q));
        let rows = unwrap(first, entitySet) ?? [];
        let token = first.skipToken;

        if (q.all) {
          // Replaces the canvas 2,000-row batch loops. Guard-railed so a mis-scoped
          // filter cannot walk an entire table.
          let guard = 0;
          while (token && guard++ < 40) {
            const page = await client.retrieveMultipleRecordsAsync<T>(
              entitySet, toOptions(q, token),
            );
            rows = rows.concat(unwrap(page, entitySet) ?? []);
            token = page.skipToken;
          }
          token = undefined;
        }
        return { rows, skipToken: token, totalCount: first.count };
      }, entitySet),
    );
  },

  async getById<T>(entitySet: string, id: string, select: string[]): Promise<T | undefined> {
    return gate.run(() =>
      withRetry(async () => {
        if (dataMode === "mock") {
          try {
            return await mockFetch<T>(`${entitySet}(${id})?$select=${select.join(",")}`);
          } catch (e) {
            if (toAppError(e).status === 404) return undefined;
            throw e;
          }
        }
        try {
          const res = await powerClient().retrieveRecordAsync<T>(entitySet, id, { select });
          return unwrap(res, entitySet);
        } catch (e) {
          if (toAppError(e, entitySet).status === 404) return undefined;
          throw e;
        }
      }, entitySet),
    );
  },

  /** `LookUp(T, predicate)` — first match only, projected. */
  async getOne<T>(entitySet: string, q: Omit<Query, "top">): Promise<T | undefined> {
    const page = await this.list<T>(entitySet, { ...q, top: 1 });
    return page.rows[0];
  },

  async create(entitySet: string, data: Record<string, unknown>): Promise<string> {
    return gate.run(() =>
      withRetry(async () => {
        if (dataMode === "mock") {
          const created = await mockFetch<Record<string, unknown>>(entitySet, {
            method: "POST", body: JSON.stringify(data),
          });
          const key = Object.keys(created ?? {}).find((k) => k.endsWith("id"));
          return String(key ? created[key] : "");
        }
        const res = await powerClient().createRecordAsync<
          Record<string, unknown>, Record<string, unknown>
        >(entitySet, data);
        const created = unwrap(res, entitySet) ?? {};
        const key = Object.keys(created).find((k) => k.endsWith("id"));
        return String(key ? created[key] : "");
      }, entitySet),
    );
  },

  async update(entitySet: string, id: string, data: Record<string, unknown>): Promise<void> {
    return gate.run(() =>
      withRetry(async () => {
        if (dataMode === "mock") {
          await mockFetch<void>(`${entitySet}(${id})`, {
            method: "PATCH", body: JSON.stringify(data),
          });
          return;
        }
        unwrap(
          await powerClient().updateRecordAsync<Record<string, unknown>, unknown>(entitySet, id, data),
          entitySet,
        );
      }, entitySet),
    );
  },

  async remove(entitySet: string, id: string): Promise<void> {
    return gate.run(() =>
      withRetry(async () => {
        if (dataMode === "mock") {
          await mockFetch<void>(`${entitySet}(${id})`, { method: "DELETE" });
          return;
        }
        unwrap(await powerClient().deleteRecordAsync(entitySet, id), entitySet);
      }, entitySet),
    );
  },

  /**
   * Replaces every `ForAll(..., Patch(...))` in the canvas apps.
   *
   * The SDK does not expose an OData `$batch` primitive, so this fans the writes out
   * under the concurrency gate in chunks. The important property is preserved: the number
   * of in-flight requests is bounded, which is what the canvas `ForAll` never did.
   */
  async batch(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return;
    const CHUNK = 12;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const chunk = ops.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map((o) =>
          o.op === "create" ? this.create(o.entitySet, o.data ?? {})
          : o.op === "update" ? this.update(o.entitySet, o.id!, o.data ?? {})
          : this.remove(o.entitySet, o.id!),
        ),
      );
    }
  },

  /** Bound or unbound Dataverse custom API — the target for the three flows we replace. */
  async callAction<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
    return gate.run(() =>
      withRetry(async () => {
        if (dataMode === "mock") {
          await new Promise((r) => setTimeout(r, 200));
          return { ok: true } as T;
        }
        const res = await powerClient().executeAsync<Record<string, unknown>, T>({
          dataverseRequest: {
            methodType: "POST",
            endpoint: name,
            payload: params,
          } as never,
        });
        return unwrap(res, name);
      }, name),
    );
  },
};

export type DataClient = typeof dataClient;
