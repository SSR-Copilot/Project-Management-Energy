/**
 * Admin CAPEX Accounts — the Dataverse reads behind `features/admin/admin-capex-accounts`.
 *
 * Unlike `listCapexAccounts` (contracts) and `loadCostAccounts` (cost book), which read ACTIVE
 * accounts only for costing, the admin screen maintains the chart of accounts and so needs every
 * row, active or not, with its status.
 *
 * No flow and no plugin step is registered on `vsb_capexaccountlist`, `vsb_capexprojectcontract`
 * or `vsb_capexcost` (ProjectDocs/migration-plans/04-flow-inventory.md, verified 19 Oct 2026), so
 * the writes here have no server-side side effects beyond the rows themselves.
 */
import { Vsb_capexaccountlistsService } from "@/generated/services/Vsb_capexaccountlistsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import type {
  CapexAccount, CapexContractRef, CapexCostRow, CostCascadeWindow,
} from "@/features/admin/admin-capex-accounts/rules";
import { fetchAll, fetchPage } from "./client";
import { and, chunk, eq, gt, idIn, notNull, or } from "./odata";

/** `ClearCollect(colCapexAccounts, 'CAPEX Account Lists')` — the whole chart, any status. */
export async function listAllCapexAccounts(): Promise<CapexAccount[]> {
  const rows = await fetchAll(
    "list the CAPEX chart of accounts",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: [
        "vsb_capexaccountlistid", "vsb_name", "vsb_number", "vsb_order",
        "_vsb_parentaccount_value", "_owningbusinessunit_value", "statecode",
      ],
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_capexaccountlistid,
    name: r.vsb_name ?? "",
    number: r.vsb_number ?? "",
    order: r.vsb_order ?? 0,
    parentId: r._vsb_parentaccount_value ?? null,
    status: Number(r.statecode ?? 0),
    owningBusinessUnitId: r._owningbusinessunit_value ?? null,
  }));
}

/** `CAPEX Project Contracts` — only the id and the account each one references (delete gating). */
export async function listCapexContractRefs(): Promise<CapexContractRef[]> {
  const rows = await fetchAll(
    "list CAPEX project contracts by account",
    (o) => Vsb_capexprojectcontractsService.getAll(o),
    {
      select: ["vsb_capexprojectcontractid", "_vsb_account_value"],
      filter: notNull("_vsb_account_value"),
    },
  );
  return rows.map((r) => ({
    id: r.vsb_capexprojectcontractid,
    accountId: r._vsb_account_value ?? null,
  }));
}

/**
 * The cascade's candidate cost rows: for the given contracts, this year's months after the
 * current one, and every later year — `costCascadeWindow(today)`. `vsb_month` is the system
 * option set `yearlymonth_options`, valued 1–12 (generated model), so `vsb_month gt N` is the
 * canvas `Month > Month(Today())`. Read in chunks so the `$filter` stays within URL limits.
 */
export async function listCascadeCosts(
  contractIds: readonly string[],
  window: CostCascadeWindow,
): Promise<CapexCostRow[]> {
  if (contractIds.length === 0) return [];
  const windowFilter = or(
    gt("vsb_year", window.deleteYearsAfter),
    and(eq("vsb_year", window.zeroYear), gt("vsb_month", window.zeroMonthExclusive)),
  );
  const batches = await Promise.all(chunk(contractIds).map((ids) =>
    fetchAll(
      "list forecast CAPEX costs for deactivation",
      (o) => Vsb_capexcostsService.getAll(o),
      {
        select: ["vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost"],
        filter: and(idIn("_vsb_contract_value", ids), windowFilter),
      },
    )));
  return batches.flat().map((r) => ({
    id: r.vsb_capexcostid,
    contractId: r._vsb_contract_value ?? null,
    year: Number(r.vsb_year ?? 0),
    month: Number(r.vsb_month ?? 0),
    cost: r.vsb_cost ?? null,
  }));
}

/**
 * The canvas uniqueness test `LookUp('CAPEX Account Lists', Number = <n>)`, asked of the SERVER
 * just before a create — the cached tree can be stale if someone else added the number meanwhile.
 */
export async function capexNumberExists(number: string): Promise<boolean> {
  const rows = await fetchPage(
    "check whether a CAPEX account number is in use",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    { select: ["vsb_capexaccountlistid"], filter: eq("vsb_number", number), top: 1 },
  );
  return rows.length > 0;
}
