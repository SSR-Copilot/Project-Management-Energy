/** Pure helper behind `ReorderList` (kept apart so the component file exports only components). */

/** Moves `ids[from]` to position `to`, returning a new array (unchanged when out of range). */
export function moveItem(ids: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return [...ids];
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
