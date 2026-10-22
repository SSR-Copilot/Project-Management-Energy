/**
 * Reorder helpers shared by CAPEX Accounts and Check List Settings.
 *
 * Both screens write 1-based `vsb_order` values and only for the rows whose order changed.
 * Their two `moveItem`s had different signatures
 * (`(list, from, to)` vs `(items, index, ±1)`); both are here.
 */

/** Position base for order writes: existing data is 1-based on both tables. */
export const ORDER_BASE = 1;

/** Moves `list[from]` to index `to`, returning a new array. Out-of-range moves return a copy. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** Moves the item at `index` by `delta` (−1 up, +1 down) — Check List Settings' signature. */
export function moveBy<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  return moveItem(list, index, index + delta);
}

export interface OrderPatch { id: string; order: number }

/**
 * `order = position + base` for the rows whose stored order differs, given the rows in their
 * NEW order (CAPEX `reorderDiff`). A `null` stored order always counts as changed.
 */
export function reorderDiff(
  itemsInNewOrder: readonly { id: string; order: number | null }[], base = ORDER_BASE,
): OrderPatch[] {
  const out: OrderPatch[] = [];
  itemsInNewOrder.forEach((item, index) => {
    const position = index + base;
    if (item.order !== position) out.push({ id: item.id, order: position });
  });
  return out;
}

/**
 * The same, given the CURRENT rows and the new id order (Check List Settings `reorderPatch`).
 * Ids not in `current` are ignored (their position still counts).
 */
export function reorderPatch(
  current: readonly { id: string; order: number | null }[], newOrder: readonly string[], base = ORDER_BASE,
): OrderPatch[] {
  const before = new Map(current.map((r) => [r.id, r.order]));
  const out: OrderPatch[] = [];
  newOrder.forEach((id, index) => {
    if (!before.has(id)) return;
    const position = index + base;
    if (before.get(id) !== position) out.push({ id, order: position });
  });
  return out;
}

/** An id, or a row that carries one. */
type IdLike = { id: string } | string;
const idOf = (x: IdLike | undefined): string | undefined => (typeof x === "string" ? x : x?.id);

/**
 * True when the two id sequences differ (the Save button's enabled state). E10: accepts rows
 * with an `id` or plain id strings (Check List Settings compares id lists).
 */
export function orderChanged(before: readonly IdLike[], after: readonly IdLike[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((item, i) => idOf(item) !== idOf(after[i]));
}

/**
 * E10: the order for a new row appended after `orders` — `max(0, …orders) + 1`, with a missing
 * order counted as 0 (CAPEX `rules.ts:173-175`; Check List Settings once it drops its `toDelete`
 * rows first).
 */
export function nextOrder(orders: readonly (number | null | undefined)[]): number {
  return Math.max(0, ...orders.map((o) => o ?? 0)) + 1;
}

/** The live-region text after a move. Check List Settings ends it with "."; CAPEX did not. */
export function moveAnnouncement(label: string, position: number, total: number, period = true): string {
  return `${label} moved to position ${position} of ${total}${period ? "." : ""}`;
}
