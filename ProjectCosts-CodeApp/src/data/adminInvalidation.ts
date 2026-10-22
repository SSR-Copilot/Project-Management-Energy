/**
 * Cross-screen cache invalidation for Application Settings — one helper per table group.
 *
 * A settings write changes rows that OTHER screens cache: other settings screens, and the
 * project cost/contract screens that seed from the standards. Each helper below refreshes every
 * cache that reads the tables its group writes, so a screen calls ONE function after a write
 * instead of keeping its own (incomplete) list. The key lists are exported separately so tests
 * — and a screen that wants to optimistically update one of them — can see exactly what is hit.
 *
 * Every helper uses `Promise.allSettled`: a refetch that fails must not turn a write that already
 * landed into a rejected save; the query's own error state reports the refetch failure.
 *
 * Two stale-data bugs are closed here:
 *   - a standard-contract save now refreshes the project Contracts margin seed
 *     (`qk.bopStandardAssumptions`, cached 15 min by `features/contracts/hooks.ts`);
 *   - a CAPEX account write now refreshes the Costs settings account hierarchy
 *     (`qk.adminCostHierarchy`, cached 30 min).
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { qk, type SettingsScope } from "@/data/keys";

async function invalidateAll(client: QueryClient, keys: readonly QueryKey[]): Promise<void> {
  await Promise.allSettled(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/* ═══════════════════════════════════════════════════════ CAPEX accounts ══ */

/**
 * `vsb_capexaccountlists`. Read by: the CAPEX Accounts tree, the shared chart of accounts
 * (project Contracts and Contracts settings), the Costs settings account hierarchy, and every
 * project cost book / totals / Add-Costs sheet (account names, status, and the costs the
 * deactivation clean-up changes).
 */
export function capexAccountsWriteKeys(): QueryKey[] {
  return [
    qk.adminCapexAccounts,
    qk.capexAccounts,
    qk.adminCostHierarchy,
    qk.costBookAll,
    qk.capexTotalsAll,
    qk.addCostSheetAll,
    // The deactivation clean-up zeroes/deletes `vsb_capexcosts`, which the project Contracts
    // screen reads live for its DevCo CAPEX rows (and the contract totals derived from them).
    // Prefixes of `qk.devCoCapexCosts(projectId)` / `qk.devCoCapexContracts(projectId)`.
    [qk.devCoCapexCosts("")[0]],
    [qk.devCoCapexContracts("")[0]],
  ];
}

export function invalidateAfterCapexAccountsWrite(client: QueryClient): Promise<void> {
  return invalidateAll(client, capexAccountsWriteKeys());
}

/* ═══════════════════════════════════════════════════════════ Milestones ══ */

/**
 * `vsb_milestonesstandardassumptionses`. Read by: the Milestones settings grid, the project
 * CAPEX cluster timeline (`useMilestoneDurations`, every country/technology it has cached) and, on
 * master, the PM screens' reads of the same table (PM Milestones `qk.milestoneAssumptionRow`, under
 * the `qk.milestoneAssumptionsAll` prefix, and PM General Data `qk.milestoneDurations`).
 */
export function milestonesWriteKeys(): QueryKey[] {
  return [
    qk.adminMilestoneAssumptions,
    qk.capexMilestoneDurationsAll,
    qk.milestoneAssumptionsAll,
    [qk.milestoneDurations("", 0)[0]],
  ];
}

export function invalidateAfterMilestonesWrite(client: QueryClient): Promise<void> {
  return invalidateAll(client, milestonesWriteKeys());
}

/* ════════════════════════════════════════════════════════════════ Costs ══ */

/** Which Costs settings table group was written. */
export type StandardCostKind = "devex" | "opex";

/**
 * `vsb_devexcapexstandardassumptionses` ("devex") or `vsb_opexlandleasestandardassumptionses`
 * ("opex", which also backs Land Lease). Read by: the Costs settings lists for the scope, and the
 * project screens' standard-assumption caches. Without a scope every scope's list is refreshed.
 */
export function costsWriteKeys(kind: StandardCostKind, scope?: SettingsScope): QueryKey[] {
  if (kind === "devex") {
    return [
      scope ? qk.adminCostDevex(scope) : qk.adminCostDevexAll,
      qk.capexStandardAssumptionsAll,
    ];
  }
  return [
    scope ? qk.adminCostOpex(scope) : qk.adminCostOpexAll,
    qk.landLeaseAssumptionsAll,
    qk.opexAssumptionScopesAll,
  ];
}

export function invalidateAfterCostsWrite(
  client: QueryClient,
  kind: StandardCostKind,
  scope?: SettingsScope,
): Promise<void> {
  return invalidateAll(client, costsWriteKeys(kind, scope));
}

/* ════════════════════════════════════════════════════════════ Contracts ══ */

/**
 * `vsb_bopcontractsstandardassumptionses` and its DevCo children. Read by: the Contracts settings
 * list, DevCo rows and single-record reads, and the project Contracts margin seed
 * (`useBopStandardAssumption`, keyed `[...qk.bopStandardAssumptions(c, t), contractType]`, so the
 * (c, t) key is a prefix of every contract type's entry). Without a scope everything is refreshed.
 */
export function contractsWriteKeys(scope?: SettingsScope): QueryKey[] {
  if (!scope) {
    return [
      qk.adminContractListAll,
      qk.adminContractDevCoAll,
      qk.adminContractRecordAll,
      qk.bopStandardAssumptionsAll,
    ];
  }
  return [
    qk.adminContractList(scope.countryId, scope.technology),
    qk.adminContractDevCo(scope.countryId, scope.technology),
    qk.adminContractRecordAll,
    qk.bopStandardAssumptions(scope.countryId, scope.technology),
  ];
}

export function invalidateAfterContractsWrite(client: QueryClient, scope?: SettingsScope): Promise<void> {
  return invalidateAll(client, contractsWriteKeys(scope));
}

/* ════════════════════════════════════════════════════════ Project Gates ══ */

/**
 * `vsb_projectdefaultapprovalses` (gates) and `vsb_checklistdefaultapprovalses` (task approvals).
 * Read by: the Project Gates dataset for the scope, and Check List Settings' `locks` query
 * (`staleTime: Infinity`), because an approval's mode decides whether a checklist task is locked
 * (a known stale-data case). Without a scope every dataset is refreshed.
 */
export function gatesWriteKeys(scope?: SettingsScope): QueryKey[] {
  return [
    scope
      ? qk.adminGateDataset(scope.countryId, scope.technology)
      : qk.adminGateDatasetAll,
    qk.adminChecklistLocks,
  ];
}

export function invalidateAfterGatesWrite(client: QueryClient, scope?: SettingsScope): Promise<void> {
  return invalidateAll(client, gatesWriteKeys(scope));
}

/* ═══════════════════════════════════════════════════ Check List Settings ══ */

/**
 * `vsb_projectdefaultchecklistses`. Read by: Check List Settings' task list for the tab (every
 * tab without one), and every Project Gates dataset, which nests the checklist tasks and offers
 * them in Add Task (a tab is not a country/technology, so all datasets are refreshed).
 */
export function checklistsWriteKeys(tabId?: string | null): QueryKey[] {
  return [
    tabId === undefined ? qk.adminChecklistTasksAll : qk.adminChecklistTasks(tabId),
    qk.adminGateDatasetAll,
  ];
}

export function invalidateAfterChecklistsWrite(client: QueryClient, tabId?: string | null): Promise<void> {
  return invalidateAll(client, checklistsWriteKeys(tabId));
}
