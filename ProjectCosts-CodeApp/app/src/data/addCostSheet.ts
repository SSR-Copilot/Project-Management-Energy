/**
 * Add Cost from Table — the read and write side against Dataverse.
 *
 * The read half assembles exactly what `buildInitialSheet` (in
 * `src/features/add-costs-from-table/rules.ts`) needs to hydrate the sheet: the category's
 * sub-accounts, their existing `vsb_capexprojectcontracts` rows (with the two fields
 * `loadCostLines` in `costBook.ts` does not fetch — `vsb_initialcontractsource` and
 * `vsb_iseditedfrompcf` — because the DEVEX/CAPEX grid never needed them, and this screen's
 * `contractUpserts` does), and every `vsb_capexcosts` row under those contracts, for EVERY
 * year — not just the sheet's visible range, because `planContractDeletions`' past-cost guard
 * has to see history outside that range too.
 *
 * The write half follows `src/data/capexWrites.ts`'s ordering convention: contract writes
 * first, then cost writes, cost deletes, contract-total recompute, and contract deletes last
 * (a delete removes the contract's own comments, then its cost rows, then the contract, so an
 * interrupted save cannot orphan a comment or a cost row pointing at a deleted contract — the
 * same order `deleteCostLine` in `capexWrites.ts` uses). It is NOT transactional, for
 * the same reason `capexWrites.ts` is not: the SDK exposes create/update/delete per record and
 * no changeset.
 */
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { unwrap } from "@/platform/errors";
import { fetchAll } from "./client";
import { ACTIVE, and, chunk, lookupEq, lookupIn } from "./odata";
import { loadCostAccounts, loadPayerDefaults } from "./costBook";
import { deleteComment, loadComments } from "./comments";
import { planDeleteContract } from "@/features/capex-costs/rules";
import {
  contractUpserts, costWrites, recomputeContractTotal,
  type ContractUpsert, type ExistingContract, type ExistingCost, type SheetRow,
} from "@/features/add-costs-from-table/rules";

const bind = (entitySet: string, id: string) => `/${entitySet}(${id})`;

/** Option sets arrive as a number or as its string form depending on the column. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/* ══════════════════════════════════════════════════════════════════ the read ══ */

export interface AddCostSheetSubaccount { id: string; number: string; name: string }

/**
 * One ACCOUNT (chart level 2) with the SUB-accounts (level 3) hanging off it, in chart order.
 *
 * The sheet is not a flat list of sub-accounts: the canvas builds `colAllGroupedAccounts` as
 * account row -> its sub-account rows -> each sub-account's contracts
 * (`CapexScreenCode.txt:1200-1260`), so the grid needs the hierarchy, not just the leaves.
 */
export interface AddCostSheetAccount extends AddCostSheetSubaccount {
  subaccounts: AddCostSheetSubaccount[];
}

export interface AddCostSheetData {
  /** The category's ACCOUNTS, each carrying its own sub-accounts — what the grid is laid out from. */
  accounts: AddCostSheetAccount[];
  /** The same sub-accounts, flattened — what `buildInitialSheet`/`resolveRow` match against. */
  subaccounts: AddCostSheetSubaccount[];
  contracts: ExistingContract[];
  costs: ExistingCost[];
  /** Sub-account id -> "DevCo" | "SPV". */
  payerDefaults: Map<string, string>;
}

const CONTRACT_SELECT = [
  "vsb_capexprojectcontractid", "_vsb_account_value", "vsb_name",
  "vsb_costtype", "vsb_depreciation", "vsb_applyvat", "vsb_isstandardcontract",
  "vsb_distribution", "vsb_distributionscheme", "vsb_initialcontractsource",
  "vsb_iseditedfrompcf",
];

export async function loadAddCostSheetData(
  projectId: string,
  category: number,
): Promise<AddCostSheetData> {
  const chart = await loadCostAccounts();
  const inCategory = chart.filter((a) => a.category === category);
  // `loadCostAccounts` returns level 2 (accounts, no `parentId`) and level 3 (sub-accounts)
  // interleaved and already in chart order, so a single pass preserves that order.
  const named = ({ id, number, name }: { id: string; number: string; name: string }) =>
    ({ id, number, name });
  const subaccounts: AddCostSheetSubaccount[] = inCategory.filter((a) => a.parentId).map(named);
  const accounts: AddCostSheetAccount[] = inCategory
    .filter((a) => !a.parentId)
    .map((a) => ({
      ...named(a),
      subaccounts: inCategory.filter((s) => s.parentId === a.id).map(named),
    }));

  if (subaccounts.length === 0) {
    return { accounts, subaccounts: [], contracts: [], costs: [], payerDefaults: new Map() };
  }

  const subIds = subaccounts.map((s) => s.id);
  const [payerDefaults, contractBatches] = await Promise.all([
    loadPayerDefaults(),
    Promise.all(
      chunk(subIds).map((ids) =>
        fetchAll(
          "list Add Cost from Table contracts",
          (o) => Vsb_capexprojectcontractsService.getAll(o),
          {
            select: CONTRACT_SELECT,
            filter: and(lookupEq("vsb_project", projectId), lookupIn("vsb_account", ids), ACTIVE),
          },
        ),
      ),
    ),
  ]);

  const rawContracts = contractBatches.flat();
  const contracts: ExistingContract[] = rawContracts.map((c) => ({
    id: c.vsb_capexprojectcontractid,
    name: c.vsb_name ?? "",
    subaccountId: c._vsb_account_value ?? null,
    isStandardContract: c.vsb_isstandardcontract === true,
    initialContractSource: numberOf(c.vsb_initialcontractsource) ?? null,
    distribution: numberOf(c.vsb_distribution) ?? null,
    distributionScheme: numberOf(c.vsb_distributionscheme) ?? null,
    isEditedFromPcf: c.vsb_iseditedfrompcf === true,
    costType: numberOf(c.vsb_costtype) ?? null,
    depreciation: c.vsb_depreciation === true ? true : c.vsb_depreciation === false ? false : null,
    applyVat: c.vsb_applyvat === true ? true : c.vsb_applyvat === false ? false : null,
  }));

  const contractIds = contracts.map((c) => c.id);
  const costBatches = contractIds.length === 0 ? [] : await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "list Add Cost from Table costs",
        (o) => Vsb_capexcostsService.getAll(o),
        {
          select: ["vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost"],
          filter: and(lookupIn("vsb_contract", ids), ACTIVE),
        },
      ),
    ),
  );

  const costs: ExistingCost[] = costBatches.flat().map((r) => ({
    id: r.vsb_capexcostid,
    contractId: r._vsb_contract_value ?? "",
    year: Number(r.vsb_year ?? 0),
    month: Number(numberOf(r.vsb_month) ?? 0),
    cost: r.vsb_cost ?? null,
  }));

  return { accounts, subaccounts, contracts, costs, payerDefaults };
}

/* ═════════════════════════════════════════════════════════════════ the write ══ */

export interface SaveAddCostSheetArgs {
  projectId: string;
  owningBusinessUnitId?: string;
  /** `diffRows(rows, originalRows)` — only what actually changed. */
  changedRows: SheetRow[];
  existingContracts: ExistingContract[];
  /** Every existing cost row for every contract in the category — not just this sheet's years. */
  existingCosts: ExistingCost[];
  /** `planContractDeletions(...).deleteIds`. */
  contractDeleteIds: string[];
}

function contractPayload(u: ContractUpsert) {
  return {
    vsb_name: u.name,
    vsb_applyvat: u.applyVat,
    vsb_depreciation: u.depreciation,
    vsb_costtype: u.costType,
    vsb_distribution: u.distribution,
    vsb_distributionscheme: u.distributionScheme,
    vsb_iseditedfrompcf: u.isEditedFromPcf,
    vsb_initialcontractsource: u.initialContractSource,
  };
}

/**
 * Writes a diffed sheet: contract upserts, then cost upserts, then cost deletes, then the
 * touched contracts' totals, then contract deletes (their cost rows first).
 *
 * A new contract has no id until the create round-trips, so `contractUpserts`' `contractId:
 * null` rows are created here FIRST and the resulting ids are threaded back onto the changed
 * rows (keyed by `subaccountId|description`, which is exactly how `contractUpserts` groups
 * them) before `costWrites` runs — otherwise every cost row under a brand-new contract would
 * have nothing to bind to.
 */
export async function saveAddCostSheet(args: SaveAddCostSheetArgs): Promise<void> {
  const { projectId, owningBusinessUnitId, changedRows, existingContracts, existingCosts } = args;

  const upserts = contractUpserts(changedRows, existingContracts);
  const resolvedIdByGroup = new Map<string, string>();

  for (const u of upserts) {
    const groupKey = `${u.subaccountId}|${u.name}`;
    if (u.contractId) {
      unwrap(
        await Vsb_capexprojectcontractsService.update(u.contractId, contractPayload(u) as never),
        "update CAPEX contract",
      );
      resolvedIdByGroup.set(groupKey, u.contractId);
    } else {
      const created = unwrap(
        await Vsb_capexprojectcontractsService.create({
          ...contractPayload(u),
          "vsb_Project@odata.bind": bind("vsb_projects", projectId),
          "vsb_Account@odata.bind": bind("vsb_capexaccountlists", u.subaccountId ?? ""),
          ...(owningBusinessUnitId
            ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
            : {}),
        } as never),
        "create CAPEX contract",
      );
      resolvedIdByGroup.set(groupKey, created.vsb_capexprojectcontractid);
    }
  }

  const resolvedRows = changedRows.map((r) => (
    r.projectContractId
      ? r
      : { ...r, projectContractId: resolvedIdByGroup.get(`${r.subAccountId}|${r.description}`) ?? null }
  ));

  const plan = costWrites(resolvedRows, existingCosts);

  for (const u of plan.upserts) {
    if (u.costId) {
      unwrap(await Vsb_capexcostsService.update(u.costId, { vsb_cost: u.cost }), "update CAPEX cost");
    } else if (u.contractId) {
      unwrap(
        await Vsb_capexcostsService.create({
          vsb_cost: u.cost,
          vsb_year: u.year,
          vsb_month: u.month,
          "vsb_Contract@odata.bind": bind("vsb_capexprojectcontracts", u.contractId),
          ...(owningBusinessUnitId
            ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
            : {}),
        } as never),
        "create CAPEX cost",
      );
    }
  }

  // Deletes before the total recompute below, so the sum reflects the sheet's final state.
  for (const costId of plan.deletes) {
    await Vsb_capexcostsService.delete(costId);
  }

  const touchedContractIds = new Set<string>([
    ...resolvedIdByGroup.values(),
    ...upserts.map((u) => u.contractId).filter((id): id is string => id !== null),
  ]);
  for (const contractId of touchedContractIds) {
    const merged = new Map<string, number>();
    for (const c of existingCosts) {
      if (c.contractId === contractId) merged.set(`${c.year}-${c.month}`, c.cost ?? 0);
    }
    for (const u of plan.upserts) {
      if (u.contractId === contractId) merged.set(`${u.year}-${u.month}`, u.cost);
    }
    for (const deletedId of plan.deletes) {
      const original = existingCosts.find((c) => c.id === deletedId);
      if (original && original.contractId === contractId) merged.delete(`${original.year}-${original.month}`);
    }
    const total = recomputeContractTotal([...merged.values()].map((cost) => ({ cost })));
    await Vsb_capexprojectcontractsService.update(contractId, { vsb_totalcost: total } as never);
  }

  /*
   * Deletes last, CHILDREN BEFORE PARENTS: comments, then cost rows, then the contract.
   *
   * The comment half was missing here exactly as it was in `deleteCostLine`
   * (`capexWrites.ts`) before it was fixed — the canvas runs `RemoveIf('Capex Comments', …)` as
   * part of contract deletion, and without it every contract this sheet removed left its whole
   * thread behind: invisible in the app, and counted by the next `loadComments` for any contract
   * that reused the id.
   *
   * A `vsb_capexcomments` row points at BOTH the contract (`vsb_CapexContract`) and, for a
   * payment-date comment, the month's cost row (`vsb_CapexCost`), so it is a child of both and
   * has to go before either — hence comments first, not merely "before the contract".
   *
   * One `loadComments` for ALL the doomed contracts rather than one per contract: it already
   * chunks its `lookupIn` at 40 ids, and this screen can delete a whole category's worth at once.
   * It is hoisted out of the loop so the single round trip happens before any delete does.
   */
  if (args.contractDeleteIds.length > 0) {
    const comments = await loadComments(args.contractDeleteIds);
    const flattened = comments.map((c) => ({ id: c.id, contractId: c.contractId ?? "" }));
    for (const contractId of args.contractDeleteIds) {
      const plan = planDeleteContract(contractId, flattened);
      for (const commentId of plan.commentIds) await deleteComment(commentId);
      for (const c of existingCosts.filter((c) => c.contractId === contractId)) {
        await Vsb_capexcostsService.delete(c.id);
      }
      await Vsb_capexprojectcontractsService.delete(plan.contractId);
    }
  }
}
