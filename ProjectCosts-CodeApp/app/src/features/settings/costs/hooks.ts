/**
 * Costs settings — TanStack Query hooks over `@/data/settings/costs`.
 *
 * Keys are the shared `qk.settings.costs.*` (DR-10, M3); countries are the shared `vsb_countries`
 * read (M6). After every write `invalidateAfterCostsWrite` (M4) refreshes the screen's own scoped
 * list plus the keys under which the PROJECT cost screens cache the same standard-assumption
 * tables, so a project opened afterwards does not see stale standards (AC-7).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trace } from "@/platform/telemetry";
import { qk } from "@/data/keys";
import { useActiveCountries } from "@/data/countries";
import { invalidateAfterCostsWrite } from "@/data/settings/invalidation";
import {
  deleteDevexCost, deleteOpexContract, deleteOpexPeriod, listCostCurrencies,
  listDevexCosts, listInactiveOpexRows, listInflationAreas, listLandLeaseSubaccounts, listOpexPeriods, listOpexSubaccounts,
  loadCapexHierarchy, loadCostPayerDefaults, saveDevexCost, saveOpexPeriod,
  type ContractScope, type CostScope, type DevexWrite, type OpexWrite,
} from "@/data/settings/costs";

const REFERENCE_STALE_MS = 30 * 60_000;
const costsKeys = qk.settings.costs;

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

/** R-5 — active countries (DR-13), from the shared read; order / exclusions are picker rules. */
export function useCostCountries() {
  return useActiveCountries();
}
export function useCapexHierarchy() {
  return useQuery({ queryKey: costsKeys.hierarchy, queryFn: loadCapexHierarchy, staleTime: REFERENCE_STALE_MS });
}
export function useLandLeaseSubaccounts() {
  return useQuery({ queryKey: costsKeys.landLeaseSubaccounts, queryFn: listLandLeaseSubaccounts, staleTime: REFERENCE_STALE_MS });
}
export function useOpexSubaccounts() {
  return useQuery({ queryKey: costsKeys.opexSubaccounts, queryFn: listOpexSubaccounts, staleTime: REFERENCE_STALE_MS });
}
export function useCostCurrencies() {
  return useQuery({ queryKey: costsKeys.currencies, queryFn: listCostCurrencies, staleTime: REFERENCE_STALE_MS });
}
export function useCostPayerDefaults() {
  return useQuery({ queryKey: costsKeys.payerDefaults, queryFn: loadCostPayerDefaults, staleTime: REFERENCE_STALE_MS });
}
/** R-16 — only read when the Area field can show (Italy). */
export function useInflationAreas(countryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: costsKeys.inflationAreas(countryId ?? "-"),
    queryFn: () => listInflationAreas(countryId as string),
    enabled: enabled && Boolean(countryId),
    staleTime: REFERENCE_STALE_MS,
  });
}
/** FR-3 — re-queried per scope; expanding a picker country does not change the scope. */
export function useDevexCosts(scope: CostScope | undefined) {
  return useQuery({
    queryKey: costsKeys.devex(scope),
    queryFn: () => listDevexCosts(scope as CostScope),
    enabled: Boolean(scope),
  });
}
export function useOpexPeriods(scope: CostScope | undefined) {
  return useQuery({
    queryKey: costsKeys.opex(scope),
    queryFn: () => listOpexPeriods(scope as CostScope),
    enabled: Boolean(scope),
  });
}

/**
 * Parity r2 R2-5 — the scope's hidden (not active) contract rows. Keyed UNDER `opex(scope)`, so
 * every Costs / OPEX write's invalidation of that key (prefix match) refreshes it too.
 */
export function useInactiveOpexRows(scope: CostScope | undefined) {
  return useQuery({
    queryKey: [...costsKeys.opex(scope), "inactive"] as const,
    queryFn: () => listInactiveOpexRows(scope as CostScope),
    enabled: Boolean(scope),
  });
}

/* ══════════════════════════════════════════════════════════════════ writes ══ */

const report = (operation: string) => (error: unknown) => {
  trace("error", `Costs settings: ${operation} failed`, error);
};

/**
 * Every mutation invalidates on SETTLE, not only on success: several of these are multi-step
 * and a failure can follow a write that already landed.
 */
export function useSaveDevexCost(scope: CostScope | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (w: DevexWrite) => saveDevexCost(w),
    onError: report("save standard cost"),
    onSettled: () => (scope ? invalidateAfterCostsWrite(client, "devex", scope) : undefined),
  });
}

export function useDeleteDevexCost(scope: CostScope | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDevexCost(id),
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
