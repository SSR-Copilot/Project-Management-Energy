/**
 * Admin Contract Screen — queries and mutations.
 *
 * Canvas screen: `Admin Contract Screen` (PM app)
 *   145 controls · 3 985 lines of Power Fx · 43 substantive blocks · band M
 *
 * `OnVisible` (279 lines) opens with a `Concurrent(...)` of FIVE loads, four of which pull
 * WHOLE TABLES with no country or technology filter (rule 1). Here there are three scoped
 * queries — `['bopContracts', scope]`, `['bopDevCoCosts', scope]`, `['capexTree']` — plus
 * one tracking query filtered server-side by scope.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  countryRepo, capexAccountListRepo, bopContractRepo, bopDevCoCostRepo, applyTrackingRepo,
} from "@/data/repos";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { CAPEX_ACCOUNT_COL } from "@/features/admin/admin-capex-accounts/rules";
import { APPLY_TRACKING_COL, type ApplyTrackingRow } from "@/features/admin/admin-cost/rules";
import {
  BOP_CONTRACT_COL, DEVCO_COST_COL, BOP_CONTRACT_ENTITY_SET,
  buildContractAccountTree,
  type BopContract, type DevCoCost, type ContractScope, type CapexAccount, type WritePlan,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export const toCapexAccount = (r: Record<string, unknown>): CapexAccount => ({
  id: String(r[CAPEX_ACCOUNT_COL.id] ?? ""),
  name: String(r[CAPEX_ACCOUNT_COL.name] ?? ""),
  number: String(r[CAPEX_ACCOUNT_COL.number] ?? ""),
  order: num(r[CAPEX_ACCOUNT_COL.order]) ?? 0,
  parentId: str(r[CAPEX_ACCOUNT_COL.parentAccount]),
  status: num(r[CAPEX_ACCOUNT_COL.statecode]) ?? 0,
  owningBusinessUnitId: str(r[CAPEX_ACCOUNT_COL.owningBusinessUnit]),
});

export const toBopContract = (r: Record<string, unknown>): BopContract => ({
  id: String(r[BOP_CONTRACT_COL.id] ?? ""),
  name: str(r[BOP_CONTRACT_COL.name]),
  description: str(r[BOP_CONTRACT_COL.description]),
  countryId: str(r[BOP_CONTRACT_COL.country]),
  technology: num(r[BOP_CONTRACT_COL.technology]),
  contractType: num(r[BOP_CONTRACT_COL.contractTypes]),
  closingDateReference: num(r[BOP_CONTRACT_COL.closingDateReference]),
  monthDifference: num(r[BOP_CONTRACT_COL.monthDifference]),
  margin: r[BOP_CONTRACT_COL.margin] === true,
  marginType: num(r[BOP_CONTRACT_COL.marginType]),
  marginPercentage: num(r[BOP_CONTRACT_COL.marginPercentage]),
  marginFixedValue: num(r[BOP_CONTRACT_COL.marginFixedValue]),
  comment: str(r[BOP_CONTRACT_COL.comment]),
});

/**
 * Rule 1/2's replacement — ONE query returns everything the card needs, including the
 * root-account name the `HtmlViewer` used to read from a second full-table collection.
 */
export const toDevCoCost = (r: Record<string, unknown>): DevCoCost => ({
  id: String(r[DEVCO_COST_COL.id] ?? ""),
  contractId: str(r[DEVCO_COST_COL.contract]),
  capexAccountId: str(r[DEVCO_COST_COL.capexAccount]),
  rootAccountId: str(r[DEVCO_COST_COL.rootCapexAccount]),
  rootAccountName: str(
    r[`${DEVCO_COST_COL.rootCapexAccount}@OData.Community.Display.V1.FormattedValue`],
  ),
  categoryName: str(
    r[`${DEVCO_COST_COL.capexAccount}@OData.Community.Display.V1.FormattedValue`],
  ),
});

export const toApplyTracking = (r: Record<string, unknown>): ApplyTrackingRow => ({
  id: String(r[APPLY_TRACKING_COL.id] ?? ""),
  countryId: str(r[APPLY_TRACKING_COL.country]),
  technology: num(r[APPLY_TRACKING_COL.technology]),
  action: num(r[APPLY_TRACKING_COL.action]),
  contractType: num(r[APPLY_TRACKING_COL.contractType]),
  bopStandardContractId: str(r[APPLY_TRACKING_COL.bopStandardContract]),
  modifiedOn: str(r[APPLY_TRACKING_COL.modifiedOn]),
  modifiedByName: str(
    r[`${APPLY_TRACKING_COL.modifiedBy}@OData.Community.Display.V1.FormattedValue`],
  ),
});

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

const key = (s: ContractScope) => `${s.countryId ?? "none"}:${s.technology ?? "none"}`;

export const contractKeys = {
  countries: ["admin", "contractCountries"] as const,
  capexTree: ["capexTree"] as const,
  contracts: (s: ContractScope) => ["bopContracts", key(s)] as const,
  devCoCosts: (s: ContractScope) => ["bopDevCoCosts", key(s)] as const,
  applyTracking: (s: ContractScope) => ["applyTracking", key(s)] as const,
} as const;

/* ═════════════════════════════════════════════════════════════════════ queries ════ */

export function useContractCountries() {
  const q = useQuery({
    queryKey: contractKeys.countries,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await countryRepo.listAll({ orderBy: [asc("vsb_name")] }))
        .map((r) => ({ id: r.vsb_countryid, name: r.vsb_name })),
  });
  return { countries: q.data ?? [], isLoading: q.isLoading };
}

/** Shared with Admin CAPEX Accounts — one key, one fetch, one tree builder. */
export function useContractAccountTree() {
  const q = useQuery({
    queryKey: contractKeys.capexTree,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await capexAccountListRepo.listAll({ orderBy: [asc(CAPEX_ACCOUNT_COL.order)] }))
        .map(toCapexAccount),
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
  return {
    accounts,
    tree: useMemo(() => buildContractAccountTree(accounts), [accounts]),
    isLoading: q.isLoading,
  };
}

export function useBopContracts(scope: ContractScope) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: contractKeys.contracts(scope),
    enabled,
    queryFn: async () =>
      (await bopContractRepo.listAll({
        filter: f.and(
          f.guid(BOP_CONTRACT_COL.country, scope.countryId!),
          f.eq(BOP_CONTRACT_COL.technology, scope.technologyValue!),
        ),
        orderBy: [asc(BOP_CONTRACT_COL.contractTypes), asc(BOP_CONTRACT_COL.name)],
      })).map(toBopContract),
  });
  return { contracts: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

export function useDevCoCosts(scope: ContractScope) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: contractKeys.devCoCosts(scope),
    enabled,
    queryFn: async () =>
      (await bopDevCoCostRepo.listAll({
        filter: f.and(
          f.guid(DEVCO_COST_COL.country, scope.countryId!),
          f.eq(DEVCO_COST_COL.technology, scope.technologyValue!),
        ),
      })).map(toDevCoCost),
  });
  return { costs: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Rule 21's fix at the data layer too: the tracking query takes THIS screen's scope as a
 * parameter. Nothing reads the Cost screen's picker.
 */
export function useContractApplyTracking(scope: ContractScope) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: contractKeys.applyTracking(scope),
    enabled,
    queryFn: async () =>
      (await applyTrackingRepo.listAll({
        filter: f.and(
          f.guid(APPLY_TRACKING_COL.country, scope.countryId!),
          f.eq(APPLY_TRACKING_COL.technology, scope.technologyValue!),
        ),
      })).map(toApplyTracking),
  });
  return { rows: q.data ?? [], isLoading: q.isLoading };
}

/* ═══════════════════════════════════════════════════════════════════ mutations ════ */

export async function runPlan(plan: WritePlan, source: string): Promise<Result<number>> {
  if (plan.refusedReason) {
    return err(toAppError({ status: 403, message: plan.refusedReason }, source));
  }
  if (plan.writes.length === 0) return ok(0);
  try {
    trace("information", source, { writes: plan.writes.length, log: plan.log });
    await dataClient.batch(plan.writes.map((w) => ({
      op: w.op, entitySet: w.entitySet, id: w.id, data: w.data,
    })));
    return ok(plan.writes.length);
  } catch (e) {
    const appError = toAppError(e, source);
    trace("error", source, { status: appError.status, message: appError.message });
    return err(appError);
  }
}

/**
 * A CREATE needs its new id before the children can bind to it, so a new contract is one
 * POST followed by one batch of children. An EDIT is a single batch. Either way the canvas
 * `Patch` → `RemoveIf` → bulk `Patch` → two `Refresh`es → local `Collect` sequence (rule
 * 17) collapses to at most two round-trips and no local collection is patched.
 */
export function useSaveContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      plan: WritePlan;
      scope: ContractScope;
      /** True when the plan's first write is the contract CREATE. */
      isCreate: boolean;
    }) => {
      if (args.plan.refusedReason) {
        throw toAppError({ status: 403, message: args.plan.refusedReason }, "adminContract/save");
      }
      if (!args.isCreate) {
        const res = await runPlan(args.plan, "adminContract/save");
        if (!res.ok) throw res.error;
        return res.value;
      }
      const [contractWrite, ...children] = args.plan.writes;
      const contractId = await dataClient.create(
        BOP_CONTRACT_ENTITY_SET, contractWrite.data ?? {},
      );
      if (children.length === 0) return 1;
      // Re-bind the children to the id the create returned.
      const bound = children.map((w) => ({
        ...w,
        data: w.data
          ? { ...w.data, "vsb_BoPContractStandardAssumption@odata.bind":
              `/${BOP_CONTRACT_ENTITY_SET}(${contractId})` }
          : w.data,
      }));
      const res = await runPlan(
        { writes: bound, log: args.plan.log }, "adminContract/saveChildren",
      );
      if (!res.ok) throw res.error;
      return res.value + 1;
    },
    onSuccess: (_n, args) => {
      // Rule 17's local `Collect`/`UpdateIf` replaced by invalidation, so the card can
      // never show a stale contract or a blank account name.
      void qc.invalidateQueries({ queryKey: contractKeys.contracts(args.scope) });
      void qc.invalidateQueries({ queryKey: contractKeys.devCoCosts(args.scope) });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { plan: WritePlan; scope: ContractScope }) => {
      const res = await runPlan(args.plan, "adminContract/delete");
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_n, args) => {
      void qc.invalidateQueries({ queryKey: contractKeys.contracts(args.scope) });
      void qc.invalidateQueries({ queryKey: contractKeys.devCoCosts(args.scope) });
    },
  });
}
