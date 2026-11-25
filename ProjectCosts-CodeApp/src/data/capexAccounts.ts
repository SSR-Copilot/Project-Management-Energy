/**
 * The ACTIVE CAPEX chart of accounts as `AccountRow`s: the shared chart read (`./capexChart`) mapped for the account trees.
 *
 * Moved out of `./contracts` (D162 B5, FE-AD-07): Application Settings → Contracts needs only this read, and importing it from
 * `./contracts` loaded the whole Cost Contracts data module (its rules and four more services) into the admin screen's chunk.
 * `listCapexAccounts()` in `./contracts` still answers its default (active-only) call from here, so its importers are unchanged.
 */
import type { Vsb_capexaccountlists } from "@/generated/models/Vsb_capexaccountlistsModel";
import type { AccountRow } from "@/features/cost/contracts/rules";
import { loadCapexChartRows } from "./capexChart";

export function toAccountRow(row: Vsb_capexaccountlists): AccountRow {
  return {
    id: row.vsb_capexaccountlistid,
    number: row.vsb_number ?? "",
    name: row.vsb_name,
    order: row.vsb_order,
    parentId: row._vsb_parentaccount_value,
  };
}

/**
 * `ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')`, active rows only (CONTR-057), in `vsb_number` order: the
 * one shared chart read (B2, OPT-07c), dropped after any admin account write.
 */
export async function listActiveCapexAccounts(): Promise<AccountRow[]> {
  return (await loadCapexChartRows()).map(toAccountRow);
}
