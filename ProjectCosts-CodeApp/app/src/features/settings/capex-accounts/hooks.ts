/**
 * CAPEX Accounts data wiring: the tree query, the lazy "is a contract booked here?" checks, and
 * one write mutation that invalidates everything the screen and the CAPEX cost screens read.
 *
 * Keys: `qk.settings.capexAccounts` (shared, same literals the screen used to build locally).
 * The admin tree is NOT cached under the shared `qk.capexAccounts`, whose consumer
 * (`features/contracts/hooks.ts`) expects active-only cost accounts; that key is invalidated after
 * every write instead (FR-14 AC-14.3) by `invalidateAfterCapexAccountsWrite`.
 */
import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { ACCOUNTS_TABLE, hasContracts, loadCapexAccountRows } from "@/data/settings/capex-accounts";
import { invalidateAfterCapexAccountsWrite } from "@/data/settings/invalidation";
import { FRESH_ON_ENTRY } from "@/data/settings/queryPresets";
import { useTablePrivileges, type TablePrivileges } from "@/platform/privileges";
import { buildCapexTree, type ContractCheck } from "./rules";

const keys = qk.settings.capexAccounts;

/** DR-1 / FR-2 AC-2.4: always read fresh on entry — no dependency on navigation history. */
export function useCapexTree() {
  const query = useQuery({
    ...FRESH_ON_ENTRY,
    queryKey: keys.tree,
    queryFn: loadCapexAccountRows,
  });
  const tree = useMemo(() => (query.data ? buildCapexTree(query.data) : undefined), [query.data]);
  return { ...query, tree };
}

export interface ContractChecks {
  /** id → true/false once answered, `"failed"` when the query errored (G10); missing = loading. */
  checks: Map<string, ContractCheck>;
  /** Re-runs every failed check (G10 Retry). */
  retryFailed: () => void;
}

/**
 * Server-side contract check per id (D-DEL-2: never a cached, truncated list). Only the ids
 * actually on screen are asked about. A failed check is reported as `"failed"` rather than
 * dropped, so the screen can explain why Delete is unavailable (gap G10 / B7).
 */
export function useHasContracts(ids: readonly string[]): ContractChecks {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: keys.hasContracts(id),
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

/** D-PERM-1: server-enforced (all enabled; a 403 becomes `permissionMessage`). Shared E13. */
export function useCapexPrivileges(): TablePrivileges {
  return useTablePrivileges(ACCOUNTS_TABLE);
}

/**
 * Every write of the screen. Invalidation runs on SETTLED, not success: a multi-step write that
 * failed part-way has still changed rows (AC-12.3), and the screen must show what is there now.
 * The shared helper refreshes the tree, the chart of accounts, the Costs settings hierarchy and
 * every project cost book / totals / Add-Costs sheet (AC-14.3, gap G6); it uses `allSettled`, so
 * a failed refetch never turns a landed write into a rejected save (gap G2).
 */
export function useCapexWrite() {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, () => Promise<unknown>>({
    mutationFn: (run) => run(),
    onSettled: () => invalidateAfterCapexAccountsWrite(queryClient),
  });
}
