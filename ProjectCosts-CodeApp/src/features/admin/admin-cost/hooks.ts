/**
 * Costs settings — TanStack Query hooks over `@/data/adminCost`.
 *
 * Keys are the shared `qk.adminCost*`; countries are the shared `vsb_countries`
 * read. After every write `invalidateAfterCostsWrite` refreshes the screen's own scoped
 * list plus the keys under which the PROJECT cost screens cache the same standard-assumption
 * tables, so a project opened afterwards does not see stale standards.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trace } from "@/platform/telemetry";
import { qk } from "@/data/keys";
import { useActiveCountries } from "@/data/countries";
import { invalidateAfterCostsWrite } from "@/data/adminInvalidation";
import {
  deleteOpexContract, deleteOpexPeriod, listCostCurrencies,
  listDevexCosts, listInactiveOpexRows, listInflationAreas, listLandLeaseSubaccounts, listOpexPeriods, listOpexSubaccounts,
  loadCapexHierarchy, loadCostPayerDefaults, saveOpexPeriod,
  type ContractScope, type CostScope, type DevexWrite, type OpexWrite,
} from "@/data/adminCost";
import { CreatedIdMissingError, PlanRefusedError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import { DevexRuleError } from "@/domain/costStandards";
import type { WritePlan } from "@/data/writePlan";
import { planDeleteDevexCost, planSaveDevexCost } from "./rules";

const REFERENCE_STALE_MS = 30 * 60_000;

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

/** Active countries, from the shared read; order / exclusions are picker rules. */
export function useCostCountries() {
  return useActiveCountries();
}
export function useCapexHierarchy() {
  return useQuery({ queryKey: qk.adminCostHierarchy, queryFn: loadCapexHierarchy, staleTime: REFERENCE_STALE_MS });
}
export function useLandLeaseSubaccounts() {
  return useQuery({ queryKey: qk.adminCostLandLeaseSubaccounts, queryFn: listLandLeaseSubaccounts, staleTime: REFERENCE_STALE_MS });
}
export function useOpexSubaccounts() {
  return useQuery({ queryKey: qk.adminCostOpexSubaccounts, queryFn: listOpexSubaccounts, staleTime: REFERENCE_STALE_MS });
}
export function useCostCurrencies() {
  return useQuery({ queryKey: qk.adminCostCurrencies, queryFn: listCostCurrencies, staleTime: REFERENCE_STALE_MS });
}
export function useCostPayerDefaults() {
  return useQuery({ queryKey: qk.adminCostPayerDefaults, queryFn: loadCostPayerDefaults, staleTime: REFERENCE_STALE_MS });
}
/** Only read when the Area field can show (Italy). */
export function useInflationAreas(countryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.adminCostInflationAreas(countryId ?? "-"),
    queryFn: () => listInflationAreas(countryId as string),
    enabled: enabled && Boolean(countryId),
    staleTime: REFERENCE_STALE_MS,
  });
}
/** Re-queried per scope; expanding a picker country does not change the scope. */
export function useDevexCosts(scope: CostScope | undefined) {
  return useQuery({
    queryKey: qk.adminCostDevex(scope),
    queryFn: () => listDevexCosts(scope as CostScope),
    enabled: Boolean(scope),
  });
}
export function useOpexPeriods(scope: CostScope | undefined) {
  return useQuery({
    queryKey: qk.adminCostOpex(scope),
    queryFn: () => listOpexPeriods(scope as CostScope),
    enabled: Boolean(scope),
  });
}

/**
 * The scope's hidden (not active) contract rows. Keyed UNDER `opex(scope)`, so
 * every Costs / OPEX write's invalidation of that key (prefix match) refreshes it too.
 */
export function useInactiveOpexRows(scope: CostScope | undefined) {
  return useQuery({
    queryKey: [...qk.adminCostOpex(scope), "inactive"] as const,
    queryFn: () => listInactiveOpexRows(scope as CostScope),
    enabled: Boolean(scope),
  });
}

/* ══════════════════════════════════════════════════════════════════ writes ══ */

const report = (operation: string) => (error: unknown) => {
  trace("error", `Costs settings: ${operation} failed`, error);
};

/**
 * A refused plan carries a sentence written for the user (`MSG.subaccountInactive`, and the
 * screen-unreachable `MSG.noPermission`). `saveDevexCost` used to throw exactly that as a
 * `DevexRuleError`, which `errorText` prints verbatim, so the refusal is turned back into one
 * rather than reaching the panel through the generic `userErrorText` path. Every other failure is
 * rethrown by `runPlan` as the failed write's OWN error (`RecordGoneError`, `DataError`), so the
 * screen's branches and texts are unchanged.
 */
async function runDevexPlan(plan: WritePlan, operation: string): Promise<string[]> {
  try {
    return (await runPlan(plan, operation)).createdIds;
  } catch (error) {
    if (error instanceof PlanRefusedError) throw new DevexRuleError(error.message);
    throw error;
  }
}

/**
 * Every mutation invalidates on SETTLE, not only on success: several of these are multi-step
 * and a failure can follow a write that already landed.
 *
 * The two DEVEX writes are `WritePlan`s from `./rules` (D36); only the `mutationFn` changed.
 * `canEdit` is `useAdminAccess()`, passed by the screen; a plan built without it refuses.
 */
export function useSaveDevexCost(scope: CostScope | undefined, canEdit: boolean) {
  const client = useQueryClient();
  return useMutation({
    /** Resolves to the saved row's id ("" when a create answered without one, as it always has). */
    mutationFn: async (w: DevexWrite): Promise<string> => {
      try {
        const createdIds = await runDevexPlan(planSaveDevexCost(w, { canEdit }), "save standard cost");
        return w.id ?? createdIds[0] ?? "";
      } catch (error) {
        if (error instanceof CreatedIdMissingError) return w.id ?? "";
        throw error;
      }
    },
    onError: report("save standard cost"),
    onSettled: () => (scope ? invalidateAfterCostsWrite(client, "devex", scope) : undefined),
  });
}

export function useDeleteDevexCost(scope: CostScope | undefined, canEdit: boolean) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await runDevexPlan(planDeleteDevexCost(id, { canEdit }), "delete standard cost"); },
    onError: report("delete standard cost"),
    onSettled: () => (scope ? invalidateAfterCostsWrite(client, "devex", scope) : undefined),
  });
}

export function useSaveOpexPeriod(scope: CostScope | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (w: OpexWrite) => saveOpexPeriod(w),
    onError: report("save standard contract"),
    onSettled: () => (scope ? invalidateAfterCostsWrite(client, "opex", scope) : undefined),
  });
}

export function useDeleteOpexContract(scope: CostScope | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (c: ContractScope) => deleteOpexContract(c),
    onError: report("delete standard contract"),
    onSettled: () => (scope ? invalidateAfterCostsWrite(client, "opex", scope) : undefined),
  });
}

export function useDeleteOpexPeriod(scope: CostScope | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; contract: ContractScope }) => deleteOpexPeriod(args.id, args.contract),
    onError: report("delete standard contract period"),
    onSettled: () => (scope ? invalidateAfterCostsWrite(client, "opex", scope) : undefined),
  });
}
