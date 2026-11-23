/**
 * The CAPEX chart of accounts, read once for the whole Cost side (optimization programme B2, OPT-07c).
 *
 * Five Cost loaders used to read `vsb_capexaccountlists` each on its own and with no cache: `loadCostAccounts` (every cost
 * book, every category tab, every post-save refetch), `loadCapexCategories` (the tab strip), `loadCapexTotals` (the Summary tab),
 * the Add Cost from Table sheet and the Contracts screen's `listCapexAccounts`. The Summary tab alone made three identical
 * reads. They now take their view of this one read: the ACTIVE rows, with the union of the columns the five need, ordered by
 * `vsb_number` (the Contracts screen's order; the other loaders sort the rows themselves by `vsb_order` then `vsb_number`).
 *
 * FRESHNESS. The read is shared while it runs and remembered for `CAPEX_CHART_MEMO_MS` (30 s, the app's default stale time). Any
 * write to a CAPEX account in this session drops the memo: the Application Settings screens call `invalidateCapexChart()` from
 * their write path (`data/adminInvalidation.ts`, `invalidateAfterCapexAccountsWrite`, and the save mutation itself), so the Cost
 * screens never show a chart older than the last admin edit made in the same tab. Another user's edit shows within 30 s, which
 * is inside the staleness the Cost screens' own queries already allow. Set `CAPEX_CHART_MEMO_MS = 0` to keep only the
 * coalescing of simultaneous reads.
 *
 * NOT used by the Application Settings loaders (`adminCapexAccounts.ts`, `adminCost.ts`): they show inactive rows and are
 * deliberately read fresh on entry.
 */
import { Vsb_capexaccountlistsService } from "@/generated/services/Vsb_capexaccountlistsService";
import type { Vsb_capexaccountlists } from "@/generated/models/Vsb_capexaccountlistsModel";
import { fetchAll } from "./client";
import { ACTIVE } from "./odata";
import { sharedRead } from "./sharedRead";

/** How long a chart read is reused (ms). `0` = no memo, only in-flight sharing. */
const CAPEX_CHART_MEMO_MS = 30_000;

/** The union of the columns the five Cost-side views read. */
const CHART_SELECT = [
  "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order",
  "_vsb_parentaccount_value", "vsb_accountcategory",
];

const chart = sharedRead<readonly Vsb_capexaccountlists[]>(
  () => fetchAll(
    "list CAPEX accounts",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    { select: CHART_SELECT, filter: ACTIVE, orderBy: ["vsb_number asc"] },
  ),
  CAPEX_CHART_MEMO_MS,
);

/** Every ACTIVE chart row, in `vsb_number` order. Shared: do not mutate the result. */
export function loadCapexChartRows(): Promise<readonly Vsb_capexaccountlists[]> {
  return chart.get();
}

/** Call after ANY write to `vsb_capexaccountlists` (create, rename, reorder, status change). */
export function invalidateCapexChart(): void {
  chart.invalidate();
}
