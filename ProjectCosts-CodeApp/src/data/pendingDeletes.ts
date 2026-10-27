/**
 * Rows whose delete was DEFERRED by an Add Cost from Table Save and has not settled yet
 * (`DEFER_CONTRACT_DELETES` / `DEFER_COST_DELETES` in `./addCostSheet.ts`, D51 §11.14–§11.16,
 * §11.19).
 *
 * WHY. The Save resolves before those deletes land, and the DEVEX/CAPEX screen reloads its book
 * at that moment. Dataverse still holds the rows, so without this registry the deleted contracts
 * and cleared cells came back on screen until the background settled (5–20 s on DEV, CA-13).
 * Every CAPEX read made while an id is registered leaves that row out.
 *
 * LIFETIME. The hook (`useSaveAddCostSheet`) adds the ids when the Save resolves, BEFORE it
 * invalidates the CAPEX queries, and releases them when the background settles, success OR
 * failure, BEFORE it invalidates them again. After a failure the rows still exist, so they must
 * show again; the failure toast tells the user why. Every change to the registry is therefore
 * followed by an invalidation, which is why a read only needs the snapshot taken when it starts.
 *
 * Ids are compared lower-cased (Dataverse GUIDs are case-insensitive). Reference-counted, so two
 * saves that defer the same id (a retry while the first background is still running) keep it
 * hidden until both settled.
 */
import type { CostBook } from "@/features/cost/costing/model";

/** Always LOWER-CASED ids (`snapshot` makes them so); the filters lower-case the row side. */
export interface PendingDeleteIds {
  contractIds: ReadonlySet<string>;
  costIds: ReadonlySet<string>;
}

interface PendingDeletesRegistry {
  /** Registers the ids; the returned function releases exactly them, once (later calls do nothing). */
  add(ids: { contractIds?: readonly string[]; costIds?: readonly string[] }): () => void;
  /** The ids registered right now (lower-cased), as a copy. */
  snapshot(): PendingDeleteIds;
}

export const NO_PENDING_DELETES: PendingDeleteIds = Object.freeze({
  contractIds: new Set<string>(),
  costIds: new Set<string>(),
});

export function createPendingDeletes(): PendingDeletesRegistry {
  const contracts = new Map<string, number>();
  const costs = new Map<string, number>();
  const bump = (into: Map<string, number>, ids: readonly string[], by: 1 | -1) => {
    for (const raw of ids) {
      const id = raw.toLowerCase();
      const next = (into.get(id) ?? 0) + by;
      if (next > 0) into.set(id, next); else into.delete(id);
    }
  };
  return {
    add({ contractIds = [], costIds = [] }) {
      const c = [...contractIds];
      const k = [...costIds];
      bump(contracts, c, 1);
      bump(costs, k, 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        bump(contracts, c, -1);
        bump(costs, k, -1);
      };
    },
    snapshot() {
      if (contracts.size === 0 && costs.size === 0) return NO_PENDING_DELETES;
      return { contractIds: new Set(contracts.keys()), costIds: new Set(costs.keys()) };
    },
  };
}

/** The app's one registry: every Save and every CAPEX read share it. */
export const pendingDeletes: PendingDeletesRegistry = createPendingDeletes();

const isPending = (set: ReadonlySet<string>, id: string | undefined): boolean =>
  id !== undefined && set.size > 0 && set.has(id.toLowerCase());

/**
 * The cost book without the pending rows: a pending contract's line goes, and so does a pending
 * cost id among a line's `payments`. Pure; returns `book` itself when nothing is pending or
 * nothing matched, so an unaffected read keeps its identity.
 */
export function excludePendingFromBook(book: CostBook, pending: PendingDeleteIds): CostBook {
  if (pending.contractIds.size === 0 && pending.costIds.size === 0) return book;
  let changed = false;
  const lines: CostBook["lines"] = [];
  for (const line of book.lines) {
    if (isPending(pending.contractIds, line.id)) { changed = true; continue; }
    if (pending.costIds.size > 0 && line.payments.some((p) => isPending(pending.costIds, p.id))) {
      changed = true;
      lines.push({ ...line, payments: line.payments.filter((p) => !isPending(pending.costIds, p.id)) });
      continue;
    }
    lines.push(line);
  }
  return changed ? { ...book, lines } : book;
}

/**
 * The Add Cost from Table sheet's source rows without the pending ones: a pending contract, its
 * cost rows, and every pending cost row. Used when the sheet reloads while a previous Save's
 * deletes still run (the `blockedByPastCosts` branch stays on the screen and refetches). Pure;
 * returns `data` itself when nothing matched.
 */
export function excludePendingFromSheet<
  T extends { contracts: readonly { id: string }[]; costs: readonly { id: string; contractId: string }[] },
>(data: T, pending: PendingDeleteIds): T {
  if (pending.contractIds.size === 0 && pending.costIds.size === 0) return data;
  const contracts = data.contracts.filter((c) => !isPending(pending.contractIds, c.id));
  const costs = excludePendingCosts(data.costs, pending);
  if (contracts.length === data.contracts.length && costs === data.costs) return data;
  return { ...data, contracts, costs };
}

/**
 * Cost rows without the pending ones: a row under a pending contract, or a pending row itself.
 * Pure; returns `costs` itself when nothing matched.
 */
export function excludePendingCosts<T extends { id: string; contractId: string }>(
  costs: readonly T[], pending: PendingDeleteIds,
): readonly T[] {
  if (pending.contractIds.size === 0 && pending.costIds.size === 0) return costs;
  const kept = costs.filter((c) =>
    !isPending(pending.contractIds, c.contractId) && !isPending(pending.costIds, c.id));
  return kept.length === costs.length ? costs : kept;
}

/**
 * `pending` minus the given ids (lower-cased like the registry). The Save's own reconcile reads
 * with this: its OWN deferred deletes are still registered while its background reconcile runs,
 * and a row whose own delete FAILED still exists and must be summed.
 */
export function pendingExcept(
  pending: PendingDeleteIds, own: { contractIds: readonly string[]; costIds: readonly string[] },
): PendingDeleteIds {
  if (pending.contractIds.size === 0 && pending.costIds.size === 0) return pending;
  const minus = (set: ReadonlySet<string>, ids: readonly string[]) => {
    const out = new Set(set);
    for (const id of ids) out.delete(id.toLowerCase());
    return out;
  };
  return { contractIds: minus(pending.contractIds, own.contractIds), costIds: minus(pending.costIds, own.costIds) };
}

/** Whether a contract or cost id is pending — for loaders that filter rows themselves. */
export function isPendingContract(pending: PendingDeleteIds, id: string | undefined): boolean {
  return isPending(pending.contractIds, id);
}

export function isPendingCost(pending: PendingDeleteIds, id: string | undefined): boolean {
  return isPending(pending.costIds, id);
}
