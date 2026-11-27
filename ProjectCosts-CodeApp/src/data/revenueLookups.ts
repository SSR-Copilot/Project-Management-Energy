import { Vsb_revenuesubaccountsService } from "@/generated/services/Vsb_revenuesubaccountsService";
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import { fetchAll, fetchPage } from "./client";
import { eq } from "./odata";
import { loadAllCurrencies } from "./currencies";

/** `locSelectedRevenueSubaccount: First(colRevenueSubaccounts)` — `Sort('Revenue Subaccounts', Order)` (App.pa.yaml:604-609). */
export async function loadFirstRevenueSubaccount(): Promise<{ id: string; name: string } | null> {
  const rows = await fetchPage(
    "load the revenue subaccount",
    (o) => Vsb_revenuesubaccountsService.getAll(o),
    { select: ["vsb_revenuesubaccountid", "vsb_name"], orderBy: ["vsb_order asc"], top: 1 },
  );
  const r = rows[0];
  return r ? { id: r.vsb_revenuesubaccountid, name: r.vsb_name ?? "" } : null;
}

/**
 * `LookUp(Currencies, 'Currency Code' = <code>)` — through the shared `loadCurrencies` (Land Lease).
 *
 * `onlyThisCode` (D136, the Revenue screen passes it): the server filters on the ISO code, so one small read
 * replaces the whole `transactioncurrencies` table. The same `x.code === code` test then picks the row, so the row
 * found is the one the unfiltered read finds (the filtered rows keep the table's own order). The Milestones screen
 * calls this without the option and is unchanged.
 */
export async function findCurrency(
  code: string, opts: { onlyThisCode?: boolean } = {},
): Promise<{ id: string; name: string } | null> {
  const rows = opts.onlyThisCode
    ? (await fetchAll(
      "find the revenue currency",
      (o) => TransactioncurrenciesService.getAll(o),
      { select: ["transactioncurrencyid", "currencyname", "isocurrencycode"], filter: eq("isocurrencycode", code) },
    )).map((r) => ({ id: r.transactioncurrencyid, name: r.currencyname ?? "", code: r.isocurrencycode ?? "" }))
    : [...(await loadAllCurrencies())];
  const c = rows.find((x) => x.code === code);
  return c ? { id: c.id, name: c.name } : null;
}

