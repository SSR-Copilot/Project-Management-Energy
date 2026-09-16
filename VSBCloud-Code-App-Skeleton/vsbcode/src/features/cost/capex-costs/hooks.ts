/**
 * Capex Costs Screen — queries, privileges and mutations.
 *
 * Canvas screen: `Capex Costs Screen` (Project Costs app)
 *   355 controls · 22 286 lines of Power Fx · 180 substantive blocks · band XL
 *
 * The canvas rebuilt the grid through a seven-step collection chain inside
 * `btn_Capex_Cost_Refresh_Capex_Cost_Code` (accounts → sub-accounts → contracts → costs →
 * reference → grouped → optimised) and re-ran the whole thing after every write via
 * `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`. That is replaced by TWO server
 * queries per category — contracts for the category's sub-accounts, and `CAPEX Costs` for
 * those contracts in the selected year — plus `invalidateQueries(['capex', projectId])`.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  costCapexAccountRepo, costCapexContractRepo, costCapexCostRepo, capexCommentRepo,
  devexCapexAssumptionRepo, generatorTypeInProjectRepo,
} from "@/data/repos";
import { dataClient, type WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { ES_COST, CHOICE_COST, CAPEX_ROOT_NUMBER } from "@/data/entities";
import { privileges } from "@/platform/privileges";
import {
  MSG, activeWtgCount,
  type CapexAccountNode, type CapexContract, type CapexCostRow, type CapexComment,
  type DevexCapexAssumption, type CapexPrivileges,
} from "./rules";

/* ══════════════════════════════════════════════════════════════════ columns ════ */

export const ACCOUNT_COL = {
  id: "vsb_capexaccountlistid", name: "vsb_name", number: "vsb_number",
  order: "vsb_order", parent: "_vsb_parentaccount_value", statecode: "statecode",
} as const;

export const CONTRACT_COL = {
  id: "vsb_capexprojectcontractid", name: "vsb_name", description: "vsb_description",
  project: "_vsb_project_value", account: "_vsb_account_value", totalCost: "vsb_totalcost",
  costType: "vsb_costtype", applyVat: "vsb_applyvat", depreciation: "vsb_depreciation",
  distribution: "vsb_distribution", scheme: "vsb_distributionscheme",
  frequency: "vsb_distributionfrequency", averagePayment: "vsb_averagepayment",
  linkedCluster: "_vsb_linkedcluster_value", byClusterJson: "vsb_byclusterjson",
  byStartEndJson: "vsb_bystartenddatejson", isStandard: "vsb_isstandardcontract",
  standardAssumption: "_vsb_capexstandardassumptioncontract_value",
  initialSource: "vsb_initialcontractsource", isEditedFromPcf: "vsb_iseditedfrompcf",
} as const;

export const COST_COL = {
  id: "vsb_capexcostid", name: "vsb_name", contract: "_vsb_contract_value",
  year: "vsb_year", month: "vsb_month", cost: "vsb_cost", paid: "vsb_costpaid",
} as const;

export const COMMENT_COL = {
  id: "vsb_capexcommentsid", name: "vsb_name", comment: "vsb_comment",
  type: "vsb_commenttype", contract: "_vsb_capexcontract_value",
  cost: "_vsb_capexcost_value", parent: "_vsb_parentcomment_value",
  root: "_vsb_rootcomment_value", resolved: "vsb_resolved",
  resolvedBy: "_vsb_resolvedby_value", createdOn: "createdon",
  createdBy: "_createdby_value",
} as const;

export const ASSUMPTION_COL = {
  id: "vsb_devexcapexstandardassumptionsid", description: "vsb_description",
  subaccount: "_vsb_subaccount_value", country: "_vsb_country_value",
  technology: "vsb_technology", costAmount: "vsb_costamount", unit: "vsb_unit",
  costPaidBy: "vsb_costpaidby", frequency: "vsb_distributionfrequency",
  applyVat: "vsb_applyvat", depreciation: "vsb_depreciation",
  cluster: (n: number) => `vsb_cluster${n}`,
} as const;

/* ══════════════════════════════════════════════════════════════════ mappers ════ */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;

export const toAccount = (r: Record<string, unknown>): CapexAccountNode => ({
  id: String(r[ACCOUNT_COL.id] ?? ""),
  name: String(r[ACCOUNT_COL.name] ?? ""),
  number: String(r[ACCOUNT_COL.number] ?? ""),
  order: num(r[ACCOUNT_COL.order]) ?? 0,
  parentId: str(r[ACCOUNT_COL.parent]),
  status: num(r[ACCOUNT_COL.statecode]) ?? 0,
});

export const toContract = (r: Record<string, unknown>): CapexContract => ({
  id: String(r[CONTRACT_COL.id] ?? ""),
  name: String(r[CONTRACT_COL.name] ?? ""),
  description: str(r[CONTRACT_COL.description]),
  subaccountId: str(r[CONTRACT_COL.account]),
  totalCost: num(r[CONTRACT_COL.totalCost]),
  costType: num(r[CONTRACT_COL.costType]),
  distribution: num(r[CONTRACT_COL.distribution]),
  distributionScheme: num(r[CONTRACT_COL.scheme]),
  distributionFrequency: num(r[CONTRACT_COL.frequency]),
  linkedClusterOrder: num(
    r[`${CONTRACT_COL.linkedCluster}@OData.Community.Display.V1.FormattedValue`],
  ),
  byClusterJson: str(r[CONTRACT_COL.byClusterJson]),
  byStartEndDateJson: str(r[CONTRACT_COL.byStartEndJson]),
  isStandardContract: bool(r[CONTRACT_COL.isStandard]),
  standardAssumptionId: str(r[CONTRACT_COL.standardAssumption]),
});

export const toCostRow = (r: Record<string, unknown>): CapexCostRow => ({
  id: String(r[COST_COL.id] ?? ""),
  contractId: str(r[COST_COL.contract]) ?? "",
  year: num(r[COST_COL.year]) ?? 0,
  month: (r[COST_COL.month] as string | number | null) ?? 0,
  cost: num(r[COST_COL.cost]),
  isPaid: bool(r[COST_COL.paid]),
});

export const toComment = (r: Record<string, unknown>): CapexComment => ({
  id: String(r[COMMENT_COL.id] ?? ""),
  text: String(r[COMMENT_COL.comment] ?? ""),
  contractId: str(r[COMMENT_COL.contract]),
  costId: str(r[COMMENT_COL.cost]),
  parentId: str(r[COMMENT_COL.parent]),
  rootId: str(r[COMMENT_COL.root]),
  commentType: num(r[COMMENT_COL.type]) ?? CHOICE_COST.capexCommentType.generalComment,
  resolved: bool(r[COMMENT_COL.resolved]),
  resolvedById: str(r[COMMENT_COL.resolvedBy]),
  createdOn: String(r[COMMENT_COL.createdOn] ?? ""),
  createdById: str(r[COMMENT_COL.createdBy]),
});

export const toAssumption = (r: Record<string, unknown>): DevexCapexAssumption => ({
  id: String(r[ASSUMPTION_COL.id] ?? ""),
  description: String(r[ASSUMPTION_COL.description] ?? ""),
  subaccountId: str(r[ASSUMPTION_COL.subaccount]),
  countryId: str(r[ASSUMPTION_COL.country]),
  technology: str(r[`${ASSUMPTION_COL.technology}@OData.Community.Display.V1.FormattedValue`])
    ?? (num(r[ASSUMPTION_COL.technology]) !== null ? String(r[ASSUMPTION_COL.technology]) : null),
  costAmount: num(r[ASSUMPTION_COL.costAmount]),
  unit: num(r[ASSUMPTION_COL.unit]),
  costPaidBy: num(r[ASSUMPTION_COL.costPaidBy]),
  distributionFrequency: num(r[ASSUMPTION_COL.frequency]),
  applyVat: bool(r[ASSUMPTION_COL.applyVat]),
  depreciation: bool(r[ASSUMPTION_COL.depreciation]),
  clusters: [1, 2, 3, 4, 5].map((n) => bool(r[ASSUMPTION_COL.cluster(n)])),
});

/* ═══════════════════════════════════════════════════════════════ query keys ════ */

export const capexCostKeys = {
  all: (projectId: string) => ["capex", projectId] as const,
  tree: ["capex", "accounts"] as const,
  contracts: (projectId: string, categoryId: string | null) =>
    ["capex", projectId, "contracts", categoryId ?? "summary"] as const,
  costs: (projectId: string, categoryId: string | null, year: number) =>
    ["capex", projectId, "costs", categoryId ?? "summary", year] as const,
  comments: (projectId: string, contractId: string | null) =>
    ["capex", projectId, "comments", contractId ?? "none"] as const,
  assumptions: (countryId: string | null) => ["capex", "assumptions", countryId ?? ""] as const,
  wtg: (projectId: string) => ["capex", projectId, "wtgCount"] as const,
} as const;

/* ══════════════════════════════════════════════════════════════════ queries ════ */

/**
 * The whole ACTIVE account tree, once. It is small (three levels of a chart of accounts)
 * and shared by every category, so a single long-lived key beats a per-category fetch.
 * Only `statecode = Active` rows are loaded — the canvas' `Status = Active` filter.
 */
export function useCapexAccountTree() {
  const q = useQuery({
    queryKey: capexCostKeys.tree,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await costCapexAccountRepo.listAll({
        filter: f.eq(ACCOUNT_COL.statecode, CHOICE_COST.status.active),
        orderBy: [asc(ACCOUNT_COL.order)],
      })).map(toAccount),
  });
  /*
   * `q.data` directly, not `q.data ?? []`.
   *
   * The `?? []` allocated a NEW empty array on every render while the query was pending or
   * errored, so the memo below it re-ran every render and handed its consumers a new object
   * each time. TanStack Query keeps `q.data` referentially stable between fetches, so
   * depending on it and defaulting INSIDE the callback gives the memo a stable dependency.
   */
  const accounts = useMemo(() => q.data ?? [], [q.data]);

  return useMemo(() => {
    const root = accounts.find((a) => a.number === CAPEX_ROOT_NUMBER) ?? null;
    const categories = root ? accounts.filter((a) => a.parentId === root.id) : [];
    const categoryIds = new Set(categories.map((c) => c.id));
    const level2 = accounts.filter((a) => a.parentId !== null && categoryIds.has(a.parentId));
    const level2Ids = new Set(level2.map((a) => a.id));
    const level3 = accounts.filter((a) => a.parentId !== null && level2Ids.has(a.parentId));
    return {
      accounts, categories, level2, level3,
      isLoading: q.isLoading, isError: q.isError,
    };
  }, [accounts, q.isLoading, q.isError]);
}

/** Query 1 of 2 — the contracts of a category's sub-accounts, server-filtered. */
export function useCapexContracts(
  projectId: string | undefined,
  categoryId: string | null,
  subaccountIds: string[],
) {
  const q = useQuery({
    queryKey: capexCostKeys.contracts(projectId ?? "", categoryId),
    enabled: Boolean(projectId) && subaccountIds.length > 0,
    queryFn: async () =>
      (await costCapexContractRepo.listAll({
        filter: f.and(
          f.guid(CONTRACT_COL.project, projectId!),
          f.inList(CONTRACT_COL.account, subaccountIds),
        ),
      })).map(toContract),
  });
  return { contracts: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/**
 * Query 2 of 2 — the cost rows of those contracts.
 *
 * The grid needs the SELECTED YEAR only, but `contractTotals` (rule 9) needs every year, so
 * this fetches the contracts' whole cost set once and the grid filters by year in
 * `flattenCosts`. That is one request instead of two and still never fetches a table to
 * filter it: the `$filter` is on the contract id list.
 */
export function useCapexCosts(
  projectId: string | undefined,
  categoryId: string | null,
  contractIds: string[],
  year: number,
) {
  const q = useQuery({
    queryKey: capexCostKeys.costs(projectId ?? "", categoryId, year),
    enabled: Boolean(projectId) && contractIds.length > 0,
    queryFn: async () =>
      (await costCapexCostRepo.listAll({
        filter: f.inList(COST_COL.contract, contractIds),
      })).map(toCostRow),
  });
  return { costs: q.data ?? [], isLoading: q.isLoading };
}

/** The comment threads of the contracts on screen. */
export function useCapexComments(projectId: string | undefined, contractIds: string[]) {
  const q = useQuery({
    queryKey: capexCostKeys.comments(projectId ?? "", contractIds.join(",") || null),
    enabled: Boolean(projectId) && contractIds.length > 0,
    queryFn: async () =>
      (await capexCommentRepo.listAll({
        filter: f.inList(COMMENT_COL.contract, contractIds),
        orderBy: [asc(COMMENT_COL.createdOn)],
      })).map(toComment),
  });
  return { comments: q.data ?? [], isLoading: q.isLoading };
}

/** `Devex/Capex Standard Assumptions` for the project's country. Reference data. */
export function useDevexCapexAssumptions(countryId: string | null | undefined) {
  const q = useQuery({
    queryKey: capexCostKeys.assumptions(countryId ?? null),
    enabled: Boolean(countryId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await devexCapexAssumptionRepo.listAll({
        filter: f.guid(ASSUMPTION_COL.country, countryId!),
      })).map(toAssumption),
  });
  return { assumptions: q.data ?? [], isLoading: q.isLoading };
}

/** Rule 15's EUR/WTG multiplier. */
export function useActiveWtgCount(projectId: string | undefined) {
  const q = useQuery({
    queryKey: capexCostKeys.wtg(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await generatorTypeInProjectRepo.byProject(projectId!);
      return activeWtgCount(rows.map((r) => ({
        count: num(r.vsb_count),
        status: num(r.statecode) ?? 0,
      })));
    },
  });
  return q.data ?? 0;
}

/**
 * `DataSourceInfo('CAPEX Costs', CreatePermission / DeletePermission)`.
 *
 * Table privileges belong to the server. The SDK privilege endpoint is not wired in this
 * build, so this degrades to the project's own edit right — which is what the server will
 * enforce anyway. Never re-derive a privilege from a role name.
 */
export function useCapexPrivileges(canEdit: boolean): CapexPrivileges {
  const user = useAppStore((s) => s.session.user);
  return useMemo(() => {
    /*
     * `user` is the CACHE KEY, not an input. `privileges.forTable` answers from the
     * session-scoped cache `platform/bootstrap` filled for this user, so the memo has to
     * recompute when the identity changes and never otherwise. Referencing it explicitly
     * keeps that intent visible to the exhaustive-deps rule and to the next reader.
     */
    void user;
    /*
     * `canEdit` is the project-scope answer — `RecordInfo(project, EditPermission)`, which
     * the Cost app's canvas never computed at all. It is necessary but not sufficient: the
     * caller also has to hold the table privilege.
     *
     * Delete used to fall back to `user.isApplicationAdministrator`, a role name standing in
     * for a privilege. It is the table's own Delete privilege that decides, and deleting a
     * contract destroys its cost history, so both must hold.
     */
    const contracts = privileges.forTable(ES_COST.capexProjectContracts);
    return {
      canCreateCost: canEdit && contracts.canCreate,
      canDeleteCost: canEdit && contracts.canDelete,
    };
  }, [canEdit, user]);
}

/* ════════════════════════════════════════════════════════════════ mutations ════ */

export type CapexWrite = WriteOp;

/**
 * Every Capex write is ONE `$batch`. The canvas issued a `Patch` per row inside `ForAll`
 * and a `Remove` per row after it, which is a delegation workaround, not a requirement.
 */
export function useCapexBatch(projectId: string | undefined, source: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (writes: CapexWrite[]) => {
      if (writes.length === 0) return 0;
      try {
        trace("information", source, { writes: writes.length });
        await dataClient.batch(writes);
        return writes.length;
      } catch (e) {
        const err = toAppError(e, source);
        trace("error", source, { status: err.status, message: err.message });
        throw err;
      }
    },
    onSuccess: () => {
      if (projectId) void qc.invalidateQueries({ queryKey: capexCostKeys.all(projectId) });
    },
  });
}

/** The user-facing message rule 17 of the implementation steps asks for. */
export const capexSaveErrorMessage = MSG.saveFailed;

/** Entity sets, so the Screen never spells a table name itself. */
export const CAPEX_ENTITY = {
  contract: ES_COST.capexProjectContracts,
  cost: ES_COST.capexCosts,
  comment: ES_COST.capexComments,
} as const;
