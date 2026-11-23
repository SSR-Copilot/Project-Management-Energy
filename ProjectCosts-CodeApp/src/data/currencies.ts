/**
 * The `transactioncurrencies` table, read once for the Cost reads (optimization programme B2, OPT-07b, read side).
 *
 * `costBook.loadCurrencyNames` (every OPEX and Land Lease book load) and `landLease.loadCurrencies` / `loadCurrencyNames`
 * (`loadLeaseBook`, and again for the Land Lease screen's dropdown) each read the WHOLE table, with two different selects, and
 * the Land Lease name helper ignored the ids it was given. Both now take their view of this one read: the union of the columns
 * (`id`, `name`, `code`), shared while it runs and remembered for `CURRENCIES_MEMO_MS`. Nothing in the app writes this table.
 *
 * Deliberately UNFILTERED by `statecode`, as both readers were: a period that points at a currency somebody has since
 * deactivated still shows the name it was saved with, not an empty cell. The save-time lookup (`periodWrites.resolveCurrencyId`)
 * is deliberately ACTIVE-only: since B3 (OPT-11) it takes the ACTIVE view of this same read (`loadActiveCurrencies`, the rows whose
 * `statecode` is 0) instead of a request of its own.
 */
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import { fetchAll } from "./client";
import { sharedRead } from "./sharedRead";

/** One `Currencies` row, as the panel's disabled dropdown and the grid's column need it. */
export interface CurrencyRow {
  id: string;
  /** `Currency Name` — "Euro", the dropdown's display field (`LL:2770`). */
  name: string;
  /** `Currency Code` — "EUR", what `defaultCurrencyCode` returns. */
  code: string;
}

/** How long the table is reused (ms). `0` = no memo, only in-flight sharing. */
const CURRENCIES_MEMO_MS = 5 * 60_000;

interface CurrencyViews {
  all: readonly CurrencyRow[];
  /** `statecode = 0` only (a row without the column counts as active): what the OPEX save-time currency lookup used to ask the server for. */
  active: readonly CurrencyRow[];
}

const currencies = sharedRead<CurrencyViews>(
  async () => {
    const rows = await fetchAll(
      "list transaction currencies (Cost reads)",
      (o) => TransactioncurrenciesService.getAll(o),
      { select: ["transactioncurrencyid", "currencyname", "isocurrencycode", "statecode"] },
    );
    const all: CurrencyRow[] = [];
    const active: CurrencyRow[] = [];
    for (const r of rows) {
      const row = { id: r.transactioncurrencyid, name: r.currencyname ?? "", code: r.isocurrencycode ?? "" };
      all.push(row);
      if ((r.statecode ?? 0) === 0) active.push(row);
    }
    return { all, active };
  },
  CURRENCIES_MEMO_MS,
);

/** Every currency, active or not. Shared: do not mutate the result. */
export async function loadAllCurrencies(): Promise<readonly CurrencyRow[]> {
  return (await currencies.get()).all;
}

/** The ACTIVE currencies, from the same shared read (OPT-11). Shared: do not mutate the result. */
export async function loadActiveCurrencies(): Promise<readonly CurrencyRow[]> {
  return (await currencies.get()).active;
}

/** `transactioncurrencyid` -> `currencyname`; empty (and no read) when nothing references a currency. */
export async function loadCurrencyNameMap(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  return new Map((await loadAllCurrencies()).map((c) => [c.id, c.name]));
}

/** Drops the memo (tests, and a future in-app currency edit). */
export function invalidateCurrencies(): void {
  currencies.invalidate();
}
