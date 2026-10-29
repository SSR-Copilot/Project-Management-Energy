/**
 * The DEVEX/CAPEX Add/Edit Cost panel's Save, reduced to the cost-row writes it sends (D56).
 *
 * `capexWriteSet` (`./writeSet.ts`) stays the ONE place the canvas's "a typed zero is not a blank"
 * rule lives; this module only turns its result into the shape the bulk path sends: `CreateMultiple`
 * targets for new months, `UpdateMultiple` targets for existing ones, and per-record deletes.
 *
 * Two things are folded in here that the per-row path (`saveCostLineLegacy` in
 * `data/capexWrites.ts`) sends as separate requests:
 *
 *  - THE RELINK PAID RESET. The canvas' relink `OnConfirm` runs
 *    `UpdateIf('CAPEX Costs', Contract = <this> && 'Cost Paid' = true, {'Cost Paid': false})`
 *    (`CapexScreenCode.txt:19906-19925`) BEFORE the Save patches the months. `UpdateMultiple`
 *    refuses the same id twice in one request, so a paid month that is also being re-costed gets
 *    ONE target carrying both `vsb_cost` and `vsb_costpaid: false`. The row ends exactly where the
 *    reset-then-patch order leaves it. A paid month that is being DELETED gets no reset: the
 *    per-row path resets it and then deletes it, and either way the row is gone.
 *
 *  - DIVERGENCE (D56 §3, `SKIP_UNCHANGED_COSTS` in `data/capexWrites.ts`): an existing month
 *    whose stored amount already equals the new one is not written at all. The canvas individual
 *    branch patches every non-blank month (`:1120`); its equal branch skips the cost rows entirely
 *    unless the schedule changed (`locChangedByDate`, …, D38 §6 L-6). The rows that end up in
 *    Dataverse are the same AS LONG AS the cached book the panel opened with matches Dataverse;
 *    a month another user changed since then keeps their value (D56 §3). A 0 is never skipped.
 *    With `skipUnchanged: false` the plan is exactly today's set of writes.
 *
 * Pure: no React, no SDK, no clock. `newId` is injected (the executor passes `crypto.randomUUID`),
 * so a new month's `vsb_capexcostid` is minted on the client, exactly as Add Cost from Table's
 * `CreateMultiple` targets are (D51 §3a).
 */
import { COMMENT_TYPE } from "./comments";
import type { PaymentWrite } from "./rules";
import { capexWriteSet } from "./writeSet";
import type { Payment } from "../costing/model";

/** A month that has no row yet. `id` is the client-minted `vsb_capexcostid`. */
export interface PanelCostCreate { id: string; year: number; month: number; cost: number }

/**
 * An existing month row. `cost` is absent only for a paid month the relink reset clears without
 * re-costing it (the month is outside this save's `payments`).
 */
export interface PanelCostUpdate { id: string; cost?: number; resetPaid: boolean }

export interface PanelCostPlan {
  creates: PanelCostCreate[];
  updates: PanelCostUpdate[];
  deletes: string[];
  /** Existing months not written because the stored amount already matches (`skipUnchanged`). */
  unchanged: number;
  /** Paid months the relink reset clears (inside `updates`). */
  paidResets: number;
}

export interface PlanPanelCostWritesInput {
  /** `reconcilePayments(stored, proposed)` — the proposed months plus a tombstone per dropped one. */
  payments: readonly PaymentWrite[];
  /**
   * The months the contract had when the panel opened (`storedLine.payments`). Only read for
   * `skipUnchanged`; without it nothing is skipped.
   */
  stored?: readonly Payment[];
  /** Cost ids to set unpaid — the relink reset, or empty. */
  paidIdsToReset: readonly string[];
  skipUnchanged: boolean;
  newId: () => string;
}

export function planPanelCostWrites(input: PlanPanelCostWritesInput): PanelCostPlan {
  const set = capexWriteSet(input.payments.map((p) => ({
    year: p.year,
    month: p.month,
    cost: p.amount === null || p.amount === undefined ? null : p.amount,
    costId: p.id ?? null,
  })));

  const storedAmount = new Map<string, number>();
  if (input.skipUnchanged) {
    for (const p of input.stored ?? []) if (p.id) storedAmount.set(p.id, p.amount);
  }
  const reset = new Set(input.paidIdsToReset);
  const deleted = new Set(set.deletes);

  const creates: PanelCostCreate[] = [];
  const updates: PanelCostUpdate[] = [];
  const covered = new Set<string>();
  let unchanged = 0;
  let paidResets = 0;

  for (const u of set.upserts) {
    if (!u.costId) {
      creates.push({ id: input.newId(), year: u.year, month: u.month, cost: u.cost });
      continue;
    }
    covered.add(u.costId);
    const resetPaid = reset.has(u.costId);
    // Never a 0: the book reads a stored null `vsb_cost` as 0 (`costBook.ts` `amount: … ?? 0`),
    // so "stored 0" may really be a blank row that the canvas zero rule must update to 0.
    if (!resetPaid && u.cost !== 0 && storedAmount.get(u.costId) === u.cost) {
      unchanged += 1;
      continue;
    }
    if (resetPaid) paidResets += 1;
    updates.push({ id: u.costId, cost: u.cost, resetPaid });
  }

  for (const id of input.paidIdsToReset) {
    if (covered.has(id) || deleted.has(id)) continue;
    covered.add(id);
    paidResets += 1;
    updates.push({ id, resetPaid: true });
  }

  return { creates, updates, deletes: set.deletes, unchanged, paidResets };
}

/**
 * The comments the relink reset removes: `RemoveIf('Capex Comments', 'Capex Contract' = <this>
 * && 'Comment Type' = 'Capex Comment Type'.'Comments to payment date')` (`:19906-19925`). The
 * caller has already narrowed the read to this contract.
 */
export function paymentDateCommentIds(
  comments: readonly { id: string; commentType: number }[],
): string[] {
  return comments.filter((c) => c.commentType === COMMENT_TYPE.paymentDate).map((c) => c.id);
}

/** The paid months a relink reset clears: `'Cost Paid' = true` rows that have an id. */
export function paidIdsToReset(payments: readonly Payment[], reset: boolean): string[] {
  if (!reset) return [];
  return payments.filter((p) => p.paid && p.id).map((p) => p.id as string);
}
