/**
 * The DEVEX/CAPEX book as a successful Add Cost from Table Save left it — the optimistic patch
 * the hook writes into the cache before the screen navigates back (D51 §11.19, CA-13).
 *
 * DIVERGENCE: the canvas reloads its collections when it returns to the CAPEX screen and shows
 * what that reload returns. This app shows the saved state at once, patched from what the Save
 * applied (`SavedSheetChanges`), and confirms it with a refetch that starts at save time; deleted
 * rows whose delete is still running in the background stay hidden from that refetch
 * (`data/pendingDeletes.ts`).
 *
 * Pure (CONVENTIONS rule 5). Every value written comes from the Save itself or from what
 * `loadCostLines` (`data/costBook.ts`) would map for the same stored row. Where that cannot be
 * derived exactly, the patch leaves the line to the refetch rather than invent a value:
 *  - an EXISTING contract's `description` is not touched: the book shows `vsb_description ??
 *    vsb_name` and the sheet writes only `vsb_name`;
 *  - an existing contract's account is not touched (the sheet binds it on a create only);
 *  - a cost UPDATE whose row is not in the cached book is skipped: its `paid` flag is unknown;
 *  - a contract the cached book does not hold is added only when this Save created it, and only
 *    under a sub-account of this book's category.
 */
import type { SavedContract, SavedCost, SavedSheetChanges } from "@/data/bulkTypes";
import { parseByClusterJson, parseStartEndJson, resolveEqualMode } from "@/features/cost/capex-costs/rules";
import type { CostBook, CostLine, Payment } from "./model";

/** `loadPayments`' order. */
const byYearMonth = (a: Payment, b: Payment) => a.year - b.year || a.month - b.month;

/** The payments of one line with this save's cells applied (`null` = unchanged). */
function patchPayments(
  payments: readonly Payment[], costs: readonly SavedCost[], deleted: ReadonlySet<string>,
): Payment[] | null {
  let changed = false;
  const next = payments.filter((p) => {
    const gone = p.id !== undefined && deleted.has(p.id.toLowerCase());
    if (gone) changed = true;
    return !gone;
  });
  // Indexed once (no scan per cell): position by id.
  const at = new Map<string, number>();
  next.forEach((p, i) => { if (p.id !== undefined) at.set(p.id.toLowerCase(), i); });
  const created: Payment[] = [];
  const createdCells = new Set<string>();
  for (const cost of costs) {
    const i = at.get(cost.id.toLowerCase());
    if (i !== undefined) {
      const p = next[i] as Payment;
      if (p.amount !== cost.amount || p.year !== cost.year || p.month !== cost.month) {
        next[i] = { ...p, year: cost.year, month: cost.month, amount: cost.amount };
        changed = true;
      }
      continue;
    }
    if (!cost.isNew) continue; // an update of a row this book never saw: `paid` is unknown
    created.push({ id: cost.id, year: cost.year, month: cost.month, amount: cost.amount, paid: false });
    createdCells.add(`${cost.year}|${cost.month}`);
  }
  if (created.length === 0) return changed ? next.sort(byYearMonth) : null;
  // A create means the sheet held no row for that cell; one cost row per contract-year-month,
  // so a cached payment still sitting on that cell is stale and is replaced.
  const kept = next.filter((p) => !createdCells.has(`${p.year}|${p.month}`));
  return [...kept, ...created].sort(byYearMonth);
}

/** A contract this Save created, mapped as `loadCostLines` maps the stored row. */
function newLine(contract: SavedContract, costs: readonly SavedCost[]): CostLine | null {
  const c = contract.columns;
  if (!c || c.subaccountId === null) return null;
  // The sheet writes neither JSON column; `loadCostLines` reads a blank one as these.
  const clusters = parseByClusterJson(null);
  const { startDate, endDate } = parseStartEndJson(null);
  return {
    id: contract.id,
    accountId: c.subaccountId,
    // `contractLabel(vsb_description, vsb_name)`; a created contract has no description.
    description: c.name.trim(),
    payer: c.payer,
    depreciation: c.depreciation,
    vat: c.vat,
    // Not written by the sheet: the column's default (No) — confirmed by the refetch.
    standard: false,
    distribution: c.distribution,
    distributionScheme: c.distributionScheme,
    equalMode: resolveEqualMode(clusters, startDate, endDate),
    startDate,
    endDate,
    // `vsb_distributionfrequency ?? 1`; the sheet does not write it.
    frequency: 1,
    clusters,
    payments: costs.filter((k) => k.isNew)
      .map((k) => ({ id: k.id, year: k.year, month: k.month, amount: k.amount, paid: false }))
      .sort(byYearMonth),
    comments: [],
    totalCost: contract.totalCost,
  };
}

/**
 * `book` with `changes` applied: deleted contracts and cost rows removed, written cells updated
 * or added, contract totals and written columns updated, created contracts added. Returns `book`
 * itself when nothing in it changes. See the module note for what is left to the refetch.
 *
 * `category` is the DEVEX/CAPEX tab the book was loaded for (its query key's last part): a
 * created contract is added only under a sub-account of that category.
 */
export function applySavedSheetToBook(book: CostBook, changes: SavedSheetChanges, category: number): CostBook {
  const deletedContracts = new Set(changes.deletedContractIds.map((id) => id.toLowerCase()));
  const deletedCosts = new Set(changes.deletedCostIds.map((id) => id.toLowerCase()));
  const contractById = new Map(changes.contracts.map((c) => [c.id.toLowerCase(), c] as const));
  const costsByContract = new Map<string, SavedCost[]>();
  for (const cost of changes.costs) {
    const key = cost.contractId.toLowerCase();
    const bucket = costsByContract.get(key);
    if (bucket) bucket.push(cost); else costsByContract.set(key, [cost]);
  }

  let changed = false;
  const seen = new Set<string>();
  const lines: CostLine[] = [];
  for (const line of book.lines) {
    const key = line.id.toLowerCase();
    seen.add(key);
    if (deletedContracts.has(key)) { changed = true; continue; }
    const contract = contractById.get(key);
    const payments = patchPayments(line.payments, costsByContract.get(key) ?? [], deletedCosts);
    let next = line;
    if (payments) next = { ...next, payments };
    if (contract && next.totalCost !== contract.totalCost) next = { ...next, totalCost: contract.totalCost };
    const c = contract?.columns;
    if (c && (next.payer !== c.payer || next.depreciation !== c.depreciation || next.vat !== c.vat
      || next.distribution !== c.distribution || next.distributionScheme !== c.distributionScheme)) {
      next = {
        ...next, payer: c.payer, depreciation: c.depreciation, vat: c.vat,
        distribution: c.distribution, distributionScheme: c.distributionScheme,
      };
    }
    if (next !== line) changed = true;
    lines.push(next);
  }

  // `book.accounts` is the WHOLE chart (`loadCostBook` loads every account), so membership alone
  // would accept any known sub-account; only those of this book's category qualify.
  const inBook = new Set(book.accounts.filter((a) => a.category === category).map((a) => a.id.toLowerCase()));
  for (const contract of changes.contracts) {
    const key = contract.id.toLowerCase();
    if (!contract.isNew || seen.has(key) || deletedContracts.has(key)) continue;
    const subaccount = contract.columns?.subaccountId;
    if (!subaccount || !inBook.has(subaccount.toLowerCase())) continue;
    const line = newLine(contract, costsByContract.get(key) ?? []);
    if (line) { lines.push(line); changed = true; }
  }
  return changed ? { ...book, lines } : book;
}
