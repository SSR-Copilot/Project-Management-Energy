/**
 * The Contracts screen's data wiring: queries, mutations, and the derived account tree.
 *
 * `Contracts Screen.OnVisible` did all of this imperatively, in sequence, into eleven
 * collections, and re-ran the whole thing on every screen visit. Here each piece is a query
 * with its own cache key, so switching to Land Lease and back costs nothing, and a save
 * invalidates only what it actually changed.
 *
 * Every call goes through `costRepository()` rather than `@/data/contracts` directly, so the
 * demo build talks to demo storage and only the live build reaches Dataverse. See
 * `src/data/costRepository.ts`.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, contractInvalidations } from "@/data/keys";
import { costRepository } from "@/data/costRepository";
import type { ContractWrite, PaymentTargetWrite } from "@/data/contracts";
import { loadProjectExtras } from "@/data/project";
import {
  applySelection, applyUsage, buildAccountTree, sortContracts,
  type AccountNode, type BopContract, type ContractType, type PaymentTarget,
} from "./rules";

/* ═════════════════════════════════════════════════════════════════ queries */

export function useContracts(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.contracts(projectId ?? "none"),
    queryFn: async () => sortContracts(await costRepository().listContracts(projectId as string)),
    enabled: Boolean(projectId),
  });
}

/**
 * Payment targets for every contract on the project, in one query.
 *
 * The canvas app bound `gal_..._PaymentTargets.Items` to a `Filter(...)` inside the contract
 * gallery, so it issued one query per rendered card and re-issued them on every re-render.
 */
export function usePaymentTargets(projectId: string | undefined, contracts: BopContract[]) {
  const ids = useMemo(() => contracts.map((c) => c.id), [contracts]);
  const query = useQuery({
    queryKey: [...qk.paymentTargets(projectId ?? "none"), ids.length] as const,
    queryFn: () => costRepository().listPaymentTargets(projectId as string, ids),
    enabled: Boolean(projectId) && ids.length > 0,
  });

  const byContract = useMemo(() => {
    const map = new Map<string, PaymentTarget[]>();
    for (const t of query.data ?? []) {
      const bucket = map.get(t.contractId);
      if (bucket) bucket.push(t);
      else map.set(t.contractId, [t]);
    }
    // `gal_..._PaymentTargets` had no explicit sort; ordering by the text payment date is
    // the closest stable equivalent and at least keeps the list from reshuffling.
    for (const list of map.values()) {
      list.sort((a, b) => (a.paymentDate ?? "").localeCompare(b.paymentDate ?? ""));
    }
    return map;
  }, [query.data]);

  return { ...query, byContract };
}

export function useCapexAccounts() {
  return useQuery({
    queryKey: qk.capexAccounts,
    queryFn: () => costRepository().listCapexAccounts(),
    // The chart of accounts is master data maintained on the Admin screens; it does not
    // change during a costing session.
    staleTime: 30 * 60 * 1000,
  });
}

export function useDevCoCapexContracts(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.devCoCapexContracts(projectId ?? "none"),
    queryFn: () => costRepository().listDevCoCapexContracts(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useDevCoLinks(projectId: string | undefined, contracts: BopContract[]) {
  const ids = useMemo(() => contracts.map((c) => c.id), [contracts]);
  return useQuery({
    queryKey: [...qk.devCoLinks(projectId ?? "none"), ids.length] as const,
    queryFn: () => costRepository().listDevCoLinks(projectId as string, ids),
    enabled: Boolean(projectId) && ids.length > 0,
  });
}

/**
 * The project's monthly DevCo CAPEX cost rows.
 *
 * Contracts recalculation sums these. On the live path the repository returns `[]` because
 * `vsb_capexcosts` is not a declared data source yet; in the demo build they are derived from
 * the same cost book the CAPEX screen edits, so a CAPEX change moves a contract's Plan figures.
 */
export function useCapexCostRows(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.devCoCapexCosts(projectId ?? "none"),
    queryFn: () => costRepository().listCapexCostRows(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useProjectExtras(projectId: string | undefined) {
  return useQuery({
    queryKey: [...qk.project(projectId ?? "none"), "extras"] as const,
    queryFn: () => loadProjectExtras(projectId as string),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The BoP standard assumption whose margin seeds a NEW Development or Construction contract.
 * `cmd_Contracts_CommandBar.OnSelect`, the two `new*Contarct` branches.
 */
export function useBopStandardAssumption(args: {
  countryId?: string;
  technology?: number;
  contractType: ContractType | undefined;
}) {
  const { countryId, technology, contractType } = args;
  return useQuery({
    queryKey: [...qk.bopStandardAssumptions(countryId, technology), contractType] as const,
    queryFn: () =>
      costRepository().findBopStandardAssumption({
        countryId,
        technology,
        contractType: contractType as ContractType,
      }),
    enabled: Boolean(countryId) && technology !== undefined && contractType !== undefined,
    staleTime: 15 * 60 * 1000,
  });
}

/* ═════════════════════════════════════════════════════ the derived tree */

/**
 * The DevCo account picker's tree, with usage and selection applied.
 *
 * This is `colCapexAllAccounts` → `colSelectedConratctWithDevCoCosts`, which the canvas app
 * rebuilt from scratch on every screen visit AND again on every command-bar click.
 */
export function useAccountTree(args: {
  accounts: ReturnType<typeof useCapexAccounts>["data"];
  devCoContracts: ReturnType<typeof useDevCoCapexContracts>["data"];
  devCoLinks: ReturnType<typeof useDevCoLinks>["data"];
  editingContractId: string | undefined;
  selectedAccountIds: readonly string[];
}): AccountNode[] {
  const { accounts, devCoContracts, devCoLinks, editingContractId, selectedAccountIds } = args;
  return useMemo(() => {
    if (!accounts) return [];
    const base = buildAccountTree(accounts, devCoContracts ?? []);
    const withUsage = applyUsage(base, devCoLinks ?? [], editingContractId);
    return applySelection(withUsage, selectedAccountIds);
  }, [accounts, devCoContracts, devCoLinks, editingContractId, selectedAccountIds]);
}

/* ═══════════════════════════════════════════════════════════════ mutations */

export interface SaveContractArgs {
  write: ContractWrite;
  /** The level-3 accounts to link, replacing whatever the contract had. */
  accounts: readonly { id: string; name: string }[];
}

/**
 * Saves the contract and then replaces its DevCo links.
 *
 * NOT A TRANSACTION, and neither was the canvas version: the contract `Patch`, the
 * `RemoveIf` over the old links and the `Patch` of the new ones are separate requests, so an
 * interruption between them leaves the contract saved with the wrong links. The SDK's
 * `DataClient` has no changeset API, so making this atomic needs a Dataverse Custom API.
 * Called out rather than silently inherited — it is on the open-decision list.
 */
export function useSaveContract(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ write, accounts }: SaveContractArgs) => {
      const repo = costRepository();
      const saved = await repo.saveContract(write);
      await repo.replaceDevCoLinks(write.projectId, {
        contractId: saved.id,
        isNewContract: !write.id,
        owningBusinessUnitId: write.owningBusinessUnitId,
        accounts,
      });
      return saved;
    },
    onSuccess: async () => {
      if (!projectId) return;
      await Promise.all(
        contractInvalidations(projectId).map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    },
  });
}

export function useDeleteContract(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => costRepository().deleteContract(projectId as string, id),
    onSuccess: async () => {
      if (!projectId) return;
      await Promise.all(
        contractInvalidations(projectId).map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    },
  });
}

export function useSavePaymentTarget(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (write: PaymentTargetWrite) =>
      costRepository().savePaymentTarget(projectId as string, write),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.paymentTargets(projectId ?? "none") }),
  });
}

export function useDeletePaymentTarget(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      costRepository().deletePaymentTarget(projectId as string, id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.paymentTargets(projectId ?? "none") }),
  });
}
