/**
 * CAPEX Accounts data wiring: the tree query, the lazy "is a contract booked here?" checks, and
 * one write mutation that invalidates everything the screen and the CAPEX cost screens read.
 *
 * Keys: `qk.adminCapexAccounts*` (shared with the invalidation helpers).
 * The admin tree is NOT cached under the shared `qk.capexAccounts`, whose consumers
 * (`features/cost/contracts/hooks.ts`, `features/admin/admin-contract/hooks.ts`) expect active-only
 * cost accounts; that key is invalidated after every write instead by
 * `invalidateAfterCapexAccountsWrite`.
 *
 * Replaces the canvas collections `colCapexAccounts`, `colCapexAccountCategories` and
 * `colCapexProjectContracts`, which `App.OnStart` built once and the screen patched by hand after
 * each write (`Collect` / `UpdateIf` / `Remove` on the collection next to every Dataverse write).
 */
import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { ACCOUNTS_TABLE, hasContracts, loadCapexAccountRows } from "@/data/adminCapexAccounts";
import { invalidateAfterCapexAccountsWrite } from "@/data/adminInvalidation";
import { FRESH_ON_ENTRY } from "@/data/adminQueryPresets";
import { useTablePrivileges, type TablePrivileges } from "@/platform/privileges";
import { buildCapexTree, type ContractCheck } from "./rules";

/** Always read fresh on entry — no dependency on navigation history. */
export function useCapexTree() {
  const query = useQuery({
    ...FRESH_ON_ENTRY,
    queryKey: qk.adminCapexAccountsTree,
    queryFn: loadCapexAccountRows,
  });
  const tree = useMemo(() => (query.data ? buildCapexTree(query.data) : undefined), [query.data]);
  return { ...query, tree };
}

export interface ContractChecks {
  /** id → true/false once answered, `"failed"` when the query errored; missing = loading. */
  checks: Map<string, ContractCheck>;
  /** Re-runs every failed check (the Retry action). */
  retryFailed: () => void;
}

/**
 * Server-side contract check per id (never a cached list — the canvas looked in
 * `colCapexProjectContracts`, a collection built once at app start). Only the ids
 * actually on screen are asked about. A failed check is reported as `"failed"` rather than
 * dropped, so the screen can explain why Delete is unavailable.
 */
export function useHasContracts(ids: readonly string[]): ContractChecks {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.adminCapexHasContracts(id),
      queryFn: () => hasContracts(id),
      staleTime: 30_000,
    })),
  });
  const checks = new Map<string, ContractCheck>();
  ids.forEach((id, i) => {
    const r = results[i];
    if (typeof r?.data === "boolean") checks.set(id, r.data);
    else if (r?.isError) checks.set(id, "failed");
  });
  const retryFailed = () => {
    for (const r of results) if (r.isError) void r.refetch();
  };
  return { checks, retryFailed };
}

/** Server-enforced privileges (all enabled; a 403 becomes `permissionMessage`). */
export function useCapexPrivileges(): TablePrivileges {
  return useTablePrivileges(ACCOUNTS_TABLE);
}

/**
 * Every write of the screen. Invalidation runs on SETTLED, not success: a multi-step write that
 * failed part-way has still changed rows, and the screen must show what is there now.
 * The shared helper refreshes the tree, the chart of accounts, the Costs settings hierarchy and
 * every project cost book / totals / Add-Costs sheet; it uses `allSettled`, so
 * a failed refetch never turns a landed write into a rejected save.
 */
export function useCapexWrite() {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, () => Promise<unknown>>({
    mutationFn: (run) => run(),
    onSettled: () => invalidateAfterCapexAccountsWrite(queryClient),
  });
}
