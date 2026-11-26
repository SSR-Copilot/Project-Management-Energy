/**
 * The DEVEX/CAPEX category book as a successful PANEL write left it (dvopt T-20, CA-05, `CAPEX_PATCH_BOOK`).
 *
 * A paid toggle, a panel Save and a panel Delete used to reload the WHOLE category book (payer defaults, every contract chunk,
 * every payment chunk) to show one changed month, and the spinner waited for it (D56 §5). The Add Cost from Table Save already
 * patches the cached book from what it wrote (`./savedSheetPatch`); this is the same for the three panel writes.
 *
 * EQUALITY WITH A RELOAD. Every value is what `loadCostLines` (`data/costBook.ts`) would map from the stored row after the write,
 * derived through the same functions where there is a mapping (`contractLabel`, `parseByClusterJson`, `parseStartEndJson`,
 * `resolveEqualMode` over the JSON the write itself produces), and carried over from the cached line for what the write does not
 * touch. `capexBookPatch.test.ts` proves it against the real loader for the same server rows. Where equality cannot be proven the
 * function returns `null` and the caller reloads, exactly as before:
 *  - the line (or the payment) the write names is not in the cached book;
 *  - an amount or the contract total is not an integer: the stored column has its own precision and may round it;
 *  - a NEW line whose description ties with another line of its sub-account: the grid keeps fetch order among equal descriptions
 *    and the server decides where a new row is fetched;
 *  - a NEW line outside this book's category, or a linked cluster whose name or order the line does not carry.
 *
 * Pure (CONVENTIONS rule 5): no React, no network, no clock. Server side effects of these writes are none (no flow or plug-in
 * reads these tables on a write, `ProjectDocs/migration-plans/04-flow-inventory.md`); a change another user made meanwhile shows at
 * the book's next stale refetch (30 s, window focus), as it does after any other write.
 */
import type { PanelSaveWritten } from "@/data/capexWrites";
import { contractLabel } from "@/data/costBook";
import {
  byClusterJson, parseByClusterJson, parseStartEndJson, resolveEqualMode, startEndJson,
} from "@/features/cost/capex-costs/rules";
import type { CostBook, CostLine, Payment } from "./model";

/** `loadPayments`' order. */
const byYearMonth = (a: Payment, b: Payment) => a.year - b.year || a.month - b.month;

const same = (a: string | undefined, b: string | undefined) => a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

const isWhole = (n: number | undefined) => n === undefined || (Number.isFinite(n) && Number.isInteger(n));

function indexOfLine(book: CostBook, id: string): number {
  return book.lines.findIndex((l) => same(l.id, id));
}

/** `book` with line `index` replaced; a new book object, the other lines keep their identity. */
function withLine(book: CostBook, index: number, line: CostLine): CostBook {
  const lines = book.lines.slice();
  lines[index] = line;
  return { ...book, lines };
}

/* ═════════════════════════════════════════════════════════════ paid toggle ══ */

export interface PaidPatch {
  lineId: string;
  costId: string;
  paid: boolean;
  /** The cluster-linked confirm: the contract's Linked Cluster was cleared first. */
  clearLinkedCluster?: boolean;
}

/**
 * One month marked paid or unpaid (and, on the cluster-linked confirm, the contract's Linked Cluster cleared). Writes exactly two
 * things, `vsb_costpaid` on the cost row and the lookup on the contract; the book shows both and nothing else changes.
 */
export function patchBookPaid(book: CostBook, write: PaidPatch): CostBook | null {
  const at = indexOfLine(book, write.lineId);
  if (at < 0) return null;
  const line = book.lines[at] as CostLine;
  const paymentAt = line.payments.findIndex((p) => same(p.id, write.costId));
  if (paymentAt < 0) return null;
  let next = line;
  if ((line.payments[paymentAt] as Payment).paid !== write.paid) {
    const payments = line.payments.slice();
    payments[paymentAt] = { ...(payments[paymentAt] as Payment), paid: write.paid };
    next = { ...next, payments };
  }
  if (write.clearLinkedCluster
    && (next.linkedClusterId !== undefined || next.linkedClusterName !== undefined || next.linkedClusterOrder !== undefined)) {
    const { linkedClusterId: _id, linkedClusterName: _name, linkedClusterOrder: _order, ...rest } = next;
    next = rest;
  }
  return next === line ? book : withLine(book, at, next);
}

/* ═════════════════════════════════════════════════════════════ panel save ══ */

export interface SavePatch {
  /** The line as the panel saved it (`SaveCostLineArgs.line`, with the stored total already applied). */
  line: CostLine;
  accountId: string;
  isNew: boolean;
  written: PanelSaveWritten;
}

/** The months of a saved line: the cached ones with this save's creates, updates and deletes applied. */
function savedPayments(previous: readonly Payment[], written: PanelSaveWritten): Payment[] | null {
  const gone = new Set(written.deletedIds.map((id) => id.toLowerCase()));
  const updates = new Map(written.updated.map((u) => [u.id.toLowerCase(), u] as const));
  const next: Payment[] = [];
  for (const p of previous) {
    const id = p.id?.toLowerCase();
    if (id !== undefined && gone.has(id)) continue;
    const u = id === undefined ? undefined : updates.get(id);
    if (!u) { next.push(p); continue; }
    next.push({
      ...p,
      ...(u.cost === undefined ? {} : { amount: u.cost }),
      ...(u.resetPaid ? { paid: false } : {}),
    });
  }
  // An update of a month the cached book does not hold: its year, month and paid flag are unknown.
  for (const u of written.updated) {
    if (!previous.some((p) => same(p.id, u.id))) return null;
  }
  // A create means the panel held no row for that cell; one cost row per contract-year-month, so a cached payment still sitting on
  // it is stale (another user's row since deleted, say) and is replaced, as `savedSheetPatch` does.
  const cells = new Set(written.created.map((c) => `${c.year}|${c.month}`));
  const kept = cells.size === 0 ? next : next.filter((p) => !cells.has(`${p.year}|${p.month}`));
  for (const c of written.created) {
    kept.push({ id: c.id, year: c.year, month: c.month, amount: c.cost, paid: false });
  }
  return kept.sort(byYearMonth);
}

/**
 * A panel Save (Add or Edit): the contract columns the write sets and its month rows.
 *
 * `distribution: "individual"` writes neither JSON column (`contractPayload`), so a stored line keeps the cluster and date fields it
 * has; an equal one writes both, and they are read back through the same parsers the loader uses.
 */
export function patchBookSaved(book: CostBook, save: SavePatch, category: number): CostBook | null {
  const { line, written, isNew } = save;
  if (!isWhole(line.totalCost) || written.created.some((c) => !isWhole(c.cost)) || written.updated.some((u) => !isWhole(u.cost))) {
    return null;
  }
  const at = indexOfLine(book, written.contractId);
  if (isNew ? at >= 0 : at < 0) return null;
  const previous = isNew ? undefined : (book.lines[at] as CostLine);
  if (isNew && !book.accounts.some((a) => a.category === category && same(a.id, save.accountId))) return null;

  const payments = savedPayments(previous?.payments ?? [], written);
  if (!payments) return null;

  let clusters: number[];
  let startDate: string;
  let endDate: string;
  let equalMode: CostLine["equalMode"];
  if (line.distribution === "equal") {
    clusters = parseByClusterJson(byClusterJson(line.equalMode === "cluster" ? line.clusters : []));
    ({ startDate, endDate } = parseStartEndJson(line.equalMode === "dates" ? startEndJson(line.startDate, line.endDate) : startEndJson("", "")));
    equalMode = resolveEqualMode(clusters, startDate, endDate);
  } else if (previous) {
    ({ clusters, startDate, endDate, equalMode } = previous);
  } else {
    clusters = parseByClusterJson(null);
    ({ startDate, endDate } = parseStartEndJson(null));
    equalMode = resolveEqualMode(clusters, startDate, endDate);
  }

  const linked = line.linkedClusterId !== undefined;
  if (linked && (line.linkedClusterName === undefined || line.linkedClusterOrder === undefined)) return null;

  const totalCost = line.totalCost !== undefined ? line.totalCost : previous?.totalCost;
  const patched: CostLine = {
    id: written.contractId,
    accountId: isNew ? save.accountId : (previous as CostLine).accountId,
    description: contractLabel(line.description, line.description),
    payer: line.payer,
    costTypePayer: line.payer,
    depreciation: line.depreciation,
    vat: line.vat,
    standard: line.standard,
    standardAssumptionId: isNew ? (line.standardAssumptionId || undefined) : previous?.standardAssumptionId,
    distribution: line.distribution,
    distributionScheme: line.distributionScheme,
    equalMode,
    startDate,
    endDate,
    frequency: line.frequency,
    clusters,
    payments,
    comments: [],
    totalCost,
    editedFromSpreadsheet: isNew ? false : previous?.editedFromSpreadsheet === true,
    linkedClusterId: linked ? line.linkedClusterId : undefined,
    linkedClusterName: linked ? line.linkedClusterName : undefined,
    linkedClusterOrder: linked ? line.linkedClusterOrder : undefined,
  };

  if (!isNew) return withLine(book, at, patched);

  // A new line goes to the end; the grid sorts a sub-account's lines by description and keeps FETCH order among equal ones, which
  // a patch cannot know. A tie is therefore left to the reload.
  const ties = book.lines.some((l) => l.accountId === patched.accountId && l.description.localeCompare(patched.description) === 0);
  if (ties) return null;
  return { ...book, lines: [...book.lines, patched] };
}

/* ═════════════════════════════════════════════════════════════ panel delete ══ */

/** The line (with its comments and month rows, all deleted by `deleteCostLine`) leaves the book. */
export function patchBookDeleted(book: CostBook, lineId: string): CostBook | null {
  const at = indexOfLine(book, lineId);
  if (at < 0) return null;
  return { ...book, lines: book.lines.filter((_, i) => i !== at) };
}
