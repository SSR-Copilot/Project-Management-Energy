/**
 * TEST-ONLY fake of the `@microsoft/power-apps/data` client, for data modules whose single-row
 * updates go through the shared guard `updateRecordIfExists` (`@/data/client`).
 *
 * The guard first reads the row by primary key (`<pk> eq <guid>`, `select: [pk]`) and only then
 * PATCHes. This fake answers that existence read — the row exists unless its id is in
 * `guardedSdk.gone` — and records every PATCH that actually reaches the client, so a test can
 * assert "gone → nothing sent" against the real guard rather than a stub of it.
 *
 * It also answers `createRecordAsync` / `deleteRecordAsync` (so a `WritePlan` can be run through
 * `executePlan` against it) and keeps `guardedSdk.log`: EVERY request in order, with its method,
 * entity set, id and body. That log is what a wire-equivalence test compares between the old
 * data-layer function and the plan that replaced it.
 *
 * Use from a test file:
 *
 *   vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);
 *   import { guardedSdk, resetGuardedSdk } from "@/test/guardedSdkFake";
 *
 * `onUpdate` lets a test fold PATCHes into its own ordered write log.
 */
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export interface GuardedSdkUpdate { table: string; id: string; body: Record<string, unknown> }

/** One request as it reached the client. `read` is the guard's existence read (`id` = the row asked about). */
export interface GuardedSdkRequest {
  method: "read" | "create" | "update" | "delete";
  table: string;
  id?: string;
  body?: Record<string, unknown>;
}

export interface GuardedSdkState {
  /** Ids (lower-case GUIDs) the existence read reports as deleted. */
  gone: Set<string>;
  /** Existence reads, in order. */
  reads: { table: string; id: string }[];
  /** PATCHes that reached the client, in order. */
  updates: GuardedSdkUpdate[];
  /** Every request, in order: reads, creates, PATCHes and deletes. */
  log: GuardedSdkRequest[];
  /** The id `createRecordAsync` answers with (under the table's primary-key column). */
  createdId: string;
  /** When set, create / PATCH / delete answer `success: false` with this HTTP status (reads still work). */
  writeFails?: number;
  onUpdate?: (update: GuardedSdkUpdate) => void;
}

export const NEW_ROW_ID = "00000000-0000-0000-0000-00000000c001";

export const guardedSdk: GuardedSdkState = { gone: new Set(), reads: [], updates: [], log: [], createdId: NEW_ROW_ID };

export function resetGuardedSdk(): void {
  guardedSdk.gone = new Set();
  guardedSdk.reads = [];
  guardedSdk.updates = [];
  guardedSdk.log = [];
  guardedSdk.createdId = NEW_ROW_ID;
  guardedSdk.writeFails = undefined;
  guardedSdk.onUpdate = undefined;
}

const EXISTENCE_FILTER = /^(\w+) eq ([0-9a-f-]{36})$/i;

const primaryKeyOf = (table: string): string =>
  (dataSourcesInfo as Record<string, { primaryKey?: string } | undefined>)[table]?.primaryKey ?? "id";

const refused = () => ({
  success: false as const,
  data: undefined,
  error: Object.assign(new Error(`HTTP ${guardedSdk.writeFails}`), { status: guardedSdk.writeFails }),
});

const client = {
  retrieveMultipleRecordsAsync: async (table: string, options?: { filter?: string }) => {
    const match = EXISTENCE_FILTER.exec(options?.filter ?? "");
    if (!match) return { success: true, data: [] };
    const [, pk, id] = match as unknown as [string, string, string];
    guardedSdk.reads.push({ table, id });
    guardedSdk.log.push({ method: "read", table, id });
    return { success: true, data: guardedSdk.gone.has(id.toLowerCase()) ? [] : [{ [pk]: id }] };
  },
  createRecordAsync: async (table: string, body: Record<string, unknown>) => {
    guardedSdk.log.push({ method: "create", table, body });
    if (guardedSdk.writeFails) return refused();
    return { success: true, data: { [primaryKeyOf(table)]: guardedSdk.createdId } };
  },
  updateRecordAsync: async (table: string, id: string, body: Record<string, unknown>) => {
    const update = { table, id, body };
    guardedSdk.updates.push(update);
    guardedSdk.log.push({ method: "update", table, id, body });
    guardedSdk.onUpdate?.(update);
    if (guardedSdk.writeFails) return refused();
    return { success: true, data: {} };
  },
  deleteRecordAsync: async (table: string, id: string) => {
    guardedSdk.log.push({ method: "delete", table, id });
    if (guardedSdk.writeFails) return refused();
    return { success: true, data: undefined };
  },
};

/** The module shape `vi.mock("@microsoft/power-apps/data", …)` returns. */
export const sdkModule = { getClient: () => client };
