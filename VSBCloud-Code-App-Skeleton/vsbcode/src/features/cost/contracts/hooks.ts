/**
 * Contracts Screen — queries and mutations.
 *
 * Canvas screen: `Contracts Screen` (Project Costs app)
 *   243 controls · 6 713 lines of Power Fx · 80 substantive blocks · band XL
 *
 * `Assumptions BoP Contracts` is the app's ONLY connected (Fabric/SQL) source. It is
 * reference data, so it is cached with a long `staleTime`, and a failure must NOT block the
 * panel — the query degrades to an empty list, which `fabricMarginDefaults` reads as
 * "no defaults", exactly as the canvas' blank `LookUp` did.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  costCapexAccountRepo, costCapexContractRepo, costCapexCostRepo,
  costBopContractRepo, bopPaymentTargetRepo, costBopDevCoCostRepo, bopAssumptionsRepo,
} from "@/data/repos";
import { dataClient, type WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { ES_COST, CHOICE_COST } from "@/data/entities";
import {
  type CapexAccountRow, type DevCoCapexContract, type CapexCostForContract,
  type BopContract, type PaymentTarget, type DevCoCostJoin, type BopAssumption,
} from "./rules";

/* ══════════════════════════════════════════════════════════════════ columns ════ */

export const BOP_COL = {
  id: "vsb_bopprojectscontractsid", name: "vsb_name", description: "vsb_description",
  project: "_vsb_project_value", contractTypes: "vsb_contracttypes",
  closingDate: "vsb_closingdate",
  untilType: "vsb_costsuntilclosingdate", untilPlan: "vsb_costsuntilclosingdateplan",
  untilActual: "vsb_costsuntilclosingdateactual",
  afterType: "vsb_costsafterclosingdate", afterPlan: "vsb_costsafterclosingdateplan",
  afterActual: "vsb_costsafterclosingdateactual",
  totalType: "vsb_totalcoststype", totalCalculated: "vsb_totalcostscalculated",
  totalOverwrite: "vsb_totalcostsoverwrite",
  margin: "vsb_margin", marginType: "vsb_margintype",
  marginPercentage: "vsb_marginpercentage", marginFixedValue: "vsb_marginfixedvalue",
  totalOfContract: "vsb_totalcostofcontract",
  isMarginStandard: "vsb_ismarginstandardassumption",
  isStandard: "vsb_isstandardcontract",
  standardAssumption: "_vsb_bopstandardassumptioncontract_value",
} as const;

export const TARGET_COL = {
  id: "vsb_bopcontractspaymenttargetsid", name: "vsb_name",
  description: "vsb_description", note: "vsb_note",
  contract: "_vsb_bopprojectcontract_value", paymentDate: "vsb_paymentdate",
  totalCostsContract: "vsb_totalcostscontract",
} as const;

export const JOIN_COL = {
  id: "vsb_bopcontractsdevcocostsid", name: "vsb_name",
  contract: "_vsb_bopcontract_value", account: "_vsb_account_value",
} as const;

/* ══════════════════════════════════════════════════════════════════ mappers ════ */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;

export const toAccountRow = (r: Record<string, unknown>): CapexAccountRow => ({
  id: String(r.vsb_capexaccountlistid ?? ""),
  name: String(r.vsb_name ?? ""),
  number: String(r.vsb_number ?? ""),
  order: num(r.vsb_order) ?? 0,
  parentId: str(r._vsb_parentaccount_value),
});

export const toDevCoCapexContract = (r: Record<string, unknown>): DevCoCapexContract => ({
  id: String(r.vsb_capexprojectcontractid ?? ""),
  accountId: str(r._vsb_account_value),
  totalCost: num(r.vsb_totalcost),
  costType: num(r.vsb_costtype),
});

export const toBopContract = (r: Record<string, unknown>): BopContract => ({
  id: String(r[BOP_COL.id] ?? ""),
  name: String(r[BOP_COL.name] ?? ""),
  description: String(r[BOP_COL.description] ?? ""),
  contractType: num(r[BOP_COL.contractTypes]),
  closingDate: str(r[BOP_COL.closingDate]),
  costsUntilClosingType: num(r[BOP_COL.untilType]),
  costsUntilClosingPlan: num(r[BOP_COL.untilPlan]),
  costsUntilClosingActual: num(r[BOP_COL.untilActual]),
  costsAfterClosingType: num(r[BOP_COL.afterType]),
  costsAfterClosingPlan: num(r[BOP_COL.afterPlan]),
  costsAfterClosingActual: num(r[BOP_COL.afterActual]),
  totalCostsType: num(r[BOP_COL.totalType]),
  totalCostsCalculated: num(r[BOP_COL.totalCalculated]),
  totalCostsOverwrite: num(r[BOP_COL.totalOverwrite]),
  margin: bool(r[BOP_COL.margin]),
  marginType: num(r[BOP_COL.marginType]),
  marginPercentage: num(r[BOP_COL.marginPercentage]),
  marginFixedValue: num(r[BOP_COL.marginFixedValue]),
  totalCostOfContract: num(r[BOP_COL.totalOfContract]),
  isMarginStandardAssumption: bool(r[BOP_COL.isMarginStandard]),
  isFolded: true,
});

export const toPaymentTarget = (r: Record<string, unknown>): PaymentTarget => ({
  id: String(r[TARGET_COL.id] ?? ""),
  name: String(r[TARGET_COL.name] ?? ""),
  description: String(r[TARGET_COL.description] ?? ""),
  note: str(r[TARGET_COL.note]),
  contractId: str(r[TARGET_COL.contract]),
  paymentDate: str(r[TARGET_COL.paymentDate]),
  totalCostsContract: num(r[TARGET_COL.totalCostsContract]),
});

export const toDevCoJoin = (r: Record<string, unknown>): DevCoCostJoin => ({
  id: String(r[JOIN_COL.id] ?? ""),
  contractId: str(r[JOIN_COL.contract]),
  accountId: str(r[JOIN_COL.account]),
});

/* ═══════════════════════════════════════════════════════════════ query keys ════ */

export const bopKeys = {
  all: (projectId: string) => ["bop", projectId] as const,
  contracts: (projectId: string) => ["bop", projectId, "contracts"] as const,
  targets: (projectId: string) => ["bop", projectId, "targets"] as const,
  devco: (projectId: string) => ["bop", "devco", projectId] as const,
  accountTree: ["bop", "accountTree"] as const,
  capexContracts: (projectId: string) => ["capexCosts", "devco", projectId] as const,
  capexCosts: (projectId: string) => ["capexCosts", "devcoRows", projectId] as const,
  assumptions: (country: string | null, technology: string | null) =>
    ["bopAssumptions", country ?? "", technology ?? ""] as const,
} as const;

/* ══════════════════════════════════════════════════════════════════ queries ════ */

/** The CAPEX account rows the picker needs — Active only, ordered. */
export function useCapexAccountRows() {
  const q = useQuery({
    queryKey: bopKeys.accountTree,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await costCapexAccountRepo.listAll({
        filter: f.eq("statecode", CHOICE_COST.status.active),
        orderBy: [asc("vsb_order")],
      })).map(toAccountRow),
  });
  return { accounts: q.data ?? [], isLoading: q.isLoading };
}

/** `colBoPCapexProjectContracts` — DevCo-paid `CAPEX Project Contracts` only (rule 5). */
export function useDevCoCapexContracts(projectId: string | undefined) {
  const q = useQuery({
    queryKey: bopKeys.capexContracts(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await costCapexContractRepo.listAll({
        filter: f.and(
          f.guid("_vsb_project_value", projectId!),
          f.eq("vsb_costtype", CHOICE_COST.costPaidType.devCo),
        ),
      })).map(toDevCoCapexContract),
  });
  return { capexContracts: q.data ?? [], isLoading: q.isLoading };
}

/** The cost rows of those contracts, with the account and cost type carried along. */
export function useDevCoCapexCosts(
  projectId: string | undefined,
  capexContracts: DevCoCapexContract[],
) {
  const ids = capexContracts.map((c) => c.id);
  const q = useQuery({
    queryKey: [...bopKeys.capexCosts(projectId ?? ""), ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const byContract = new Map(capexContracts.map((c) => [c.id, c]));
      const rows = await costCapexCostRepo.listAll({
        filter: f.inList("_vsb_contract_value", ids),
      });
      return rows.map((r): CapexCostForContract => {
        const contractId = str(r._vsb_contract_value) ?? "";
        const parent = byContract.get(contractId);
        return {
          contractId,
          accountId: parent?.accountId ?? null,
          year: num(r.vsb_year) ?? 0,
          month: num(r.vsb_month) ?? 0,
          cost: num(r.vsb_cost) ?? 0,
          costType: parent?.costType ?? null,
        };
      });
    },
  });
  return { costs: q.data ?? [], isLoading: q.isLoading };
}

export function useBopContracts(projectId: string | undefined) {
  const q = useQuery({
    queryKey: bopKeys.contracts(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: async () => (await costBopContractRepo.byProject(projectId!)).map(toBopContract),
  });
  const contracts = q.data ?? [];
  const ids = contracts.map((c) => c.id);

  const targetsQ = useQuery({
    queryKey: [...bopKeys.targets(projectId ?? ""), ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await bopPaymentTargetRepo.listAll({
        filter: f.inList(TARGET_COL.contract, ids),
      })).map(toPaymentTarget),
  });

  const joinsQ = useQuery({
    queryKey: [...bopKeys.devco(projectId ?? ""), ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await costBopDevCoCostRepo.listAll({
        filter: f.inList(JOIN_COL.contract, ids),
      })).map(toDevCoJoin),
  });

  return {
    contracts,
    targets: targetsQ.data ?? [],
    joins: joinsQ.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * `Assumptions BoP Contracts` — reference data from Fabric.
 *
 * A failure returns an EMPTY list rather than throwing: the margin block simply has no
 * default and the panel still opens (UT-CONTR-055 @ut-ref spec case; no `it()` carries this
 * id in this repo — the Fabric-unavailable path is only reachable through this query and the
 * query has no test). `isUnavailable` lets the screen log a non-blocking warning.
 */
export function useBopAssumptions(
  countryName: string | null | undefined,
  technology: string | null | undefined,
) {
  const q = useQuery({
    queryKey: bopKeys.assumptions(countryName ?? null, technology ?? null),
    enabled: Boolean(countryName),
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<BopAssumption[]> => {
      try {
        const rows = await bopAssumptionsRepo.listAll({
          filter: f.and(
            f.eq("countryname", countryName!),
            technology ? f.eq("technology", technology) : undefined,
          ),
        });
        return rows satisfies BopAssumption[];
      } catch (e) {
        trace("warning", "contracts/fabricAssumptions", {
          message: toAppError(e, "contracts/fabricAssumptions").message,
        });
        return [];
      }
    },
  });
  return {
    assumptions: q.data ?? [],
    isUnavailable: q.isError || (q.isFetched && (q.data ?? []).length === 0),
    isLoading: q.isLoading,
  };
}

/* ════════════════════════════════════════════════════════════════ mutations ════ */

/** One `$batch` per operation — the contract upsert plus the DevCo-cost replacement. */
export function useBopBatch(projectId: string | undefined, source: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (writes: WriteOp[]) => {
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
      if (projectId) void qc.invalidateQueries({ queryKey: bopKeys.all(projectId) });
    },
  });
}

export const BOP_ENTITY = {
  contract: ES_COST.bopProjectsContracts,
  target: ES_COST.bopContractsPaymentTargets,
  join: ES_COST.bopContractsDevCoCosts,
} as const;
