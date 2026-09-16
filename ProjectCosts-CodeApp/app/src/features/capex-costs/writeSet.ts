/**
 * What a save does to the twelve month cells of a contract.
 *
 * Ported from `docs/VSBCloud-Harness-Plan.md` §19, which reproduces the canvas rule from
 * `btn_SaveCost_Execute____.OnChange` (1,896 lines) as a pure function:
 *
 *   Patch('CAPEX Costs', ForAll(Filter(colCapexFinalDataToPatch,
 *       And(Not(IsBlank(Cost)),
 *           Or(Cost <> 0, Not(IsBlank('CAPEX Cost'.'CAPEX Cost')))))))   // <- existing row, allow 0
 *   ClearCollect(colCapexToDelete,
 *       Filter(colCapexFinalDataToPatch, IsBlank(Cost) && !IsBlank('CAPEX Cost'.'CAPEX Cost')))
 *   ForAll(colCapexToDelete As D, Remove('CAPEX Costs', D.'CAPEX Cost'))
 *
 * This is not a naive upsert, and the three cases are the whole point:
 *
 *   cost = null, has id    ->  DELETE the row. Clearing a month removes its cost.
 *   cost = null, no id     ->  nothing. An empty month that never existed stays absent.
 *   cost = 0,    no id     ->  nothing. Typing 0 into an empty month does not create a row.
 *   cost = 0,    has id    ->  UPDATE to 0. An existing row may legitimately become zero.
 *   cost != 0              ->  UPSERT.
 *
 * The distinction matters downstream: the grid renders a month with no row differently from one
 * holding a real value, and a contract's total is the sum of the rows that exist.
 */

export interface CostRowInput {
  year: number;
  month: number;
  /** `null` means the month box was cleared. `0` means a zero was typed. */
  cost: number | null;
  /** The `vsb_capexcostid` of the existing row, or `null` when the month has none. */
  costId: string | null;
}

export interface CapexWriteSet {
  upserts: { year: number; month: number; cost: number; costId: string | null }[];
  deletes: string[];
}

export function capexWriteSet(rows: readonly CostRowInput[]): CapexWriteSet {
  const upserts: CapexWriteSet["upserts"] = [];
  const deletes: string[] = [];

  for (const r of rows) {
    if (r.cost === null || r.cost === undefined || Number.isNaN(r.cost)) {
      // A cleared month deletes its row — and does nothing at all if there was none.
      if (r.costId) deletes.push(r.costId);
      continue;
    }
    if (r.cost !== 0 || r.costId) {
      upserts.push({ year: r.year, month: r.month, cost: r.cost, costId: r.costId });
    }
  }

  return { upserts, deletes };
}
