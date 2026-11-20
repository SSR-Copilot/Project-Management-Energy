/**
 * D143: the ids of ONE family's expanded cards, as a set that keeps its identity until a card of that family folds or unfolds.
 * The screen keeps a single `expanded` set for every family; handing that whole set to each memoized section would re-render all
 * seven whenever any card folds. The subset is keyed on the joined ids (ids are GUIDs, so "|" cannot occur in one).
 */
import { useMemo } from "react";

export function useExpandedIds(expanded: ReadonlySet<string>, rows: readonly { id: string }[]): ReadonlySet<string> {
  const key = rows.filter((r) => expanded.has(r.id)).map((r) => r.id).join("|");
  return useMemo(() => new Set(key === "" ? [] : key.split("|")), [key]);
}
