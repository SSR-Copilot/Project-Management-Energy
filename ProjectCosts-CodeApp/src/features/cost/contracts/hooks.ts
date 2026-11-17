/**
 * The Contracts screen's data wiring: queries, mutations, and the derived account tree.
 *
 * `Contracts Screen.OnVisible` did all of this imperatively, in sequence, into eleven
 * collections, and re-ran the whole thing on every screen visit. Here each piece is a query
 * with its own cache key, so switching to Land Lease and back costs nothing, and a save
 * invalidates only what it actually changed.
 *
 * Every call goes through `costRepository()` (`src/data/costRepository.ts`), the one implementation that reads and
 * writes Dataverse, rather than `@/data/contracts` directly, so a test can replace the whole data layer in one place.
 * There is no demo build any more.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, contractInvalidations } from "@/data/keys";
import { costRepository } from "@/data/costRepository";
import { ContractLinksError, type ContractWrite, type PaymentTargetWrite } from "@/data/contracts";
import { loadProjectExtras } from "@/data/project";
import { costWriteKey } from "@/domain/writeGuard";
import {
  CONTRACT_TYPE, applySelection, applyUsage, buildAccountTree, sortContracts, sortPaymentTargets,
  type AccountNode, type BopContract, type ContractType, type PaymentTarget,
} from "./rules";

/* ═════════════════════════════════════════════════════════════════ queries */

/**
 * The canvas re-reads `colBoPContracts` on EVERY visit (`OnVisible`, `:59`; `OnHidden` clears it, `:15`),
 * so the three project-scoped reads below are always stale on mount (CONTR-010): a quick return shows
 * what was saved elsewhere. `refetchOnMount: "always"` keeps the cached rows on screen meanwhile.
 */
const REREAD_ON_VISIT = { staleTime: 0, refetchOnMount: "always" } as const;

export function useContracts(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.contracts(projectId ?? "none"),
    queryFn: async () => sortContracts(await costRepository().listContracts(projectId as string)),
    enabled: Boolean(projectId),
    ...REREAD_ON_VISIT,
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
    ...REREAD_ON_VISIT,
  });

  const byContract = useMemo(() => {
    const map = new Map<string, PaymentTarget[]>();
    for (const t of query.data ?? []) {
      const bucket = map.get(t.contractId);
      if (bucket) bucket.push(t);
      else map.set(t.contractId, [t]);
    }
    // `gal_..._PaymentTargets.Items`: `Sort(Filter(...), 'Created On', SortOrder.Ascending)` (`:1627`).
    for (const [id, list] of map) map.set(id, sortPaymentTargets(list));
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
    ...REREAD_ON_VISIT,
  });
}

/**
 * The project's monthly DevCo CAPEX cost rows.
 *
 * Contracts recalculation sums these: the monthly `vsb_capexcosts` rows of the project's DevCo CAPEX contracts, read in
 * two hops (`listCapexCostRows`: the DevCo CAPEX contracts, then their cost rows in chunks). The screen waits for this
 * read before it opens a form (`queriesReady`, D120 §4), because a form calculated against no rows would
 * save zero totals.
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
  /**
   * The level-3 account ids of the picker's tree (D120 §2, N1). A stored link to an account that is not in
   * the tree (an inactive account) could not be seen or unticked, so the save leaves it alone instead of removing it.
   */
  visibleAccountIds?: readonly string[];
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
    // CA-15: counted by `useCostWriteInFlight` even after the Contracts screen is gone.
    mutationKey: costWriteKey(projectId, "contracts"),
    mutationFn: async ({ write, accounts, visibleAccountIds }: SaveContractArgs) => {
      const repo = costRepository();
      const saved = await repo.saveContract(write);
      // The Project Rights Save writes no DevCo rows and removes none (`:3744-3801`).
      if (write.contractType !== CONTRACT_TYPE.ProjectRights) {
        try {
          await repo.replaceDevCoLinks(write.projectId, {
            contractId: saved.id,
            isNewContract: !write.id,
            owningBusinessUnitId: write.owningBusinessUnitId,
            accounts,
            visibleAccountIds,
          });
        } catch (error) {
          // The contract row exists now. Say so, with its id, so the screen retries it as an UPDATE (no duplicate).
          throw new ContractLinksError(saved.id, error);
        }
      }
      return saved;
    },
    // `onSettled`, not `onSuccess`: a save that fails after the contract row landed (its links did not) has still
    // changed Dataverse, and the list must show what is really there (D100 retest note: no onError invalidation).
    onSettled: () => invalidateContractCaches(queryClient, projectId),
  });
}

export function useDeleteContract(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: costWriteKey(projectId, "contracts"), // CA-15
    mutationFn: (id: string) => costRepository().deleteContract(projectId as string, id),
    onSettled: () => invalidateContractCaches(queryClient, projectId),
  });
}

export function useSavePaymentTarget(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: costWriteKey(projectId, "contracts"), // CA-15
    mutationFn: (write: PaymentTargetWrite) =>
      costRepository().savePaymentTarget(projectId as string, write),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: qk.paymentTargets(projectId ?? "none") }),
  });
}

export function useDeletePaymentTarget(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: costWriteKey(projectId, "contracts"), // CA-15
    mutationFn: (id: string) =>
      costRepository().deletePaymentTarget(projectId as string, id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: qk.paymentTargets(projectId ?? "none") }),
  });
}

/** Refetches everything a contract write can change; resolves when the refetches are done. */
async function invalidateContractCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string | undefined,
): Promise<void> {
  if (!projectId) return;
  await Promise.all(
    contractInvalidations(projectId).map((key) => queryClient.invalidateQueries({ queryKey: key })),
  );
}
