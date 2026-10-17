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
 * Two stale-data bugs from the shared audit (05-gap-analysis.md M4) are closed here:
 *   - a standard-contract save now refreshes the project Contracts margin seed
 *     (`qk.bopStandardAssumptions`, cached 15 min by `features/contracts/hooks.ts`);
 *   - a CAPEX account write now refreshes the Costs settings account hierarchy
 *     (`qk.settings.costs.hierarchy`, cached 30 min).
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
    qk.settings.capexAccounts.all,
    qk.capexAccounts,
    qk.settings.costs.hierarchy,
    qk.standards.costBook,
    qk.standards.capexTotals,
    qk.standards.addCostSheet,
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
 * `vsb_milestonesstandardassumptionses`. Read by: the Milestones settings grid and the project
 * CAPEX cluster timeline (`useMilestoneDurations`, every country/technology it has cached).
 */
export function milestonesWriteKeys(): QueryKey[] {
  return [qk.settings.milestones.assumptions, qk.standards.capexMilestoneDurations];
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
      scope ? qk.settings.costs.devex(scope) : qk.settings.costs.devexAll(),
      qk.standards.capexStandardAssumptions,
    ];
  }
  return [
    scope ? qk.settings.costs.opex(scope) : qk.settings.costs.opexAll(),
    qk.standards.landLeaseAssumptions,
    qk.standards.opexAssumptionScopes,
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
      qk.settings.contracts.listAll(),
      qk.settings.contracts.devCoAll(),
      qk.settings.contracts.recordAll(),
      qk.standards.bopStandardAssumptionsAll,
    ];
  }
  return [
    qk.settings.contracts.list(scope.countryId, scope.technology),
    qk.settings.contracts.devCo(scope.countryId, scope.technology),
    qk.settings.contracts.recordAll(),
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
 * (project-gates audit B3). Without a scope every dataset is refreshed.
 */
export function gatesWriteKeys(scope?: SettingsScope): QueryKey[] {
  return [
    scope
      ? qk.settings.gates.dataset(scope.countryId, scope.technology)
      : qk.settings.gates.datasetAll(),
    qk.settings.checklists.locks(),
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
    tabId === undefined ? qk.settings.checklists.tasksAll() : qk.settings.checklists.tasks(tabId),
    qk.settings.gates.datasetAll(),
  ];
}

export function invalidateAfterChecklistsWrite(client: QueryClient, tabId?: string | null): Promise<void> {
  return invalidateAll(client, checklistsWriteKeys(tabId));
}
