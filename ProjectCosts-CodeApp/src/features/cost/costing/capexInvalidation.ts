/**
 * Which cached reads a DEVEX/CAPEX write must refresh (optimization programme B2, OPT-12).
 *
 * Every CAPEX write used to invalidate the same five keys and the panel waited for all of them: marking one month paid (the
 * grid's most frequent write) reloaded the book, the Summary totals, both DevCo reads AND every comment thread, none of which
 * the paid flag can change. Each job now names exactly the reads that SHOW what it wrote:
 *
 *   paid          one `vsb_capexcosts.vsb_costpaid` (and, on the cluster-linked confirm, the contract's Linked Cluster). The
 *                 cost book shows both. The totals sum `vsb_cost`, the DevCo reads select contract totals and cost amounts, the
 *                 comments are another table: none of them reads the flag or the link.
 *   save          the contract and its month rows (D90: a relink keeps payment-date comments, nothing touches the comment table).
 *   save-deleted  the same, when the save also deleted month rows: a payment-date comment points at its month's cost row
 *                 (`vsb_CapexCost`), so the threads are re-read as before (a deleted row may release or drop the link).
 *   delete        the whole line: `deleteCostLine` deletes the line's comments first, so the threads change.
 *   failed        a save or delete that failed part-way may have landed anything: everything, as before.
 *
 * Pure, so the lists are tested without React (UT-CAPEXINV-*). The comment panel's own writes touch only
 * `vsb_capexcomments` and refresh only `["capex-comments"]` (`useCommentWrites`).
 */
import type { QueryKey } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { capexWriteSet, type CostRowInput } from "@/features/cost/capex-costs/writeSet";

export type CapexWriteJob = "paid" | "save" | "save-deleted" | "delete" | "failed";

/** The month rows of a panel save, as `saveCostLine` hands them to `capexWriteSet`. */
export function monthRowsOfSave(
  payments: readonly { id?: string; year: number; month: number; amount: number | null }[],
): CostRowInput[] {
  return payments.map((p) => ({
    year: p.year,
    month: p.month,
    cost: p.amount === null || p.amount === undefined ? null : p.amount,
    costId: p.id ?? null,
  }));
}

/** True when saving these months deletes at least one existing month row (a cleared month that had a row). */
export function savedMonthsDeleteRows(
  payments: readonly { id?: string; year: number; month: number; amount: number | null }[],
): boolean {
  return capexWriteSet(monthRowsOfSave(payments)).deletes.length > 0;
}

export const COMMENTS_KEY = ["capex-comments"] as const;

/** The query keys to invalidate for one CAPEX write. `writtenOn` is the category the write was made on. */
export function capexWriteInvalidations(
  projectId: string | undefined,
  writtenOn: number | undefined,
  job: CapexWriteJob,
): QueryKey[] {
  const book: QueryKey = ["cost-book", projectId, writtenOn ?? "none"];
  if (job === "paid") return [book];
  const keys: QueryKey[] = [
    book,
    ["capex-totals", projectId],
    qk.devCoCapexContracts(projectId ?? "none"),
    qk.devCoCapexCosts(projectId ?? "none"),
  ];
  return job === "save" ? keys : [...keys, COMMENTS_KEY];
}
