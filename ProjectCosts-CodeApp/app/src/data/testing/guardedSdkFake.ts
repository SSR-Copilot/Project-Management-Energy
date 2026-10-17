/**
 * TEST-ONLY fake of the `@microsoft/power-apps/data` client, for data modules whose single-row
 * updates go through the shared V-1 guard `updateRecordIfExists` (`../client`).
 *
 * The guard first reads the row by primary key (`<pk> eq <guid>`, `select: [pk]`) and only then
 * PATCHes. This fake answers that existence read — the row exists unless its id is in
 * `guardedSdk.gone` — and records every PATCH that actually reaches the client, so a test can
 * assert "gone → nothing sent" against the real guard rather than a stub of it.
 *
 * Use from a test file:
 *
 *   vi.mock("@microsoft/power-apps/data", async () => (await import("./testing/guardedSdkFake")).sdkModule);
 *   import { guardedSdk, resetGuardedSdk } from "./testing/guardedSdkFake";
 *
 * `onUpdate` lets a test fold PATCHes into its own ordered write log.
 */

export interface GuardedSdkUpdate { table: string; id: string; body: Record<string, unknown> }

export interface GuardedSdkState {
  /** Ids (lower-case GUIDs) the existence read reports as deleted. */
  gone: Set<string>;
  /** Existence reads, in order. */
  reads: { table: string; id: string }[];
  /** PATCHes that reached the client, in order. */
  updates: GuardedSdkUpdate[];
  onUpdate?: (update: GuardedSdkUpdate) => void;
}

export const guardedSdk: GuardedSdkState = { gone: new Set(), reads: [], updates: [] };

export function resetGuardedSdk(): void {
  guardedSdk.gone = new Set();
  guardedSdk.reads = [];
  guardedSdk.updates = [];
  guardedSdk.onUpdate = undefined;
}

const EXISTENCE_FILTER = /^(\w+) eq ([0-9a-f-]{36})$/i;

const client = {
  retrieveMultipleRecordsAsync: async (table: string, options?: { filter?: string }) => {
    const match = EXISTENCE_FILTER.exec(options?.filter ?? "");
    if (!match) return { success: true, data: [] };
    const [, pk, id] = match as unknown as [string, string, string];
    guardedSdk.reads.push({ table, id });
    return { success: true, data: guardedSdk.gone.has(id.toLowerCase()) ? [] : [{ [pk]: id }] };
  },
  updateRecordAsync: async (table: string, id: string, body: Record<string, unknown>) => {
    const update = { table, id, body };
    guardedSdk.updates.push(update);
    guardedSdk.onUpdate?.(update);
    return { success: true, data: {} };
  },
};

/** The module shape `vi.mock("@microsoft/power-apps/data", …)` returns. */
export const sdkModule = { getClient: () => client };
