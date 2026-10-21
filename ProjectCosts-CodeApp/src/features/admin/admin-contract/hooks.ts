/**
 * Admin Contract Screen — the data layer (connected 19 Oct 2026, D23).
 *
 * Canvas screen: `Admin Contract Screen` (PM app). `vsb_bopcontractsstandardassumptiondevcocosts`
 * was registered for it; the reads live in `data/adminContract.ts`:
 *
 *   useContractCountries()        `vsb_countries` — the rail and the card's ISO currency code.
 *   useContractAccountTree()      `vsb_capexaccountlists` — the whole chart (shared with Admin
 *                                 CAPEX Accounts, same key); the tree is `buildContractAccountTree`.
 *   useBopContracts(scope)        `vsb_bopcontractsstandardassumptionses` for the country × technology.
 *   useDevCoCosts(contractIds)    `vsb_bopcontractsstandardassumptiondevcocostses` of those contracts.
 *
 * WRITES — `planSaveContract` (parent create/update, released children deleted, new children
 * created, in the canvas order) and `planDeleteContract` (the parent only) run through
 * `usePlanWrite`. FLOWS AND PLUGINS (04-flow-inventory.md, verified 19 Oct 2026):
 *  - each DevCo-cost create fires `DevCoCostRootCapexPlugin` (pre-operation), which sets
 *    `vsb_rootcapexaccount` — the client does not write it;
 *  - a contract delete fires `VSB.BoPContractAssumptionDeletion` (pre-validation), which removes
 *    its template DevCo costs and every project's `vsb_bopcontractsdevcocosts` and
 *    `vsb_bopprojectscontracts` built from it; the DevCo costs also cascade;
 *  - no flow fires (the Apply sync flow is commented out in the canvas and out of scope, D20).
 *
 * After a write: this screen's contracts and DevCo costs are refreshed, and so is the Cost
 * Contracts screen's standard-assumption lookup (`bopStandardAssumptions`), which reads the same
 * table.
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { listAllCapexAccounts } from "@/data/adminCapexAccounts";
import { listBopContracts, listContractCountries, listDevCoCosts } from "@/data/adminContract";
import {
  MSG, type BopContract, type CapexAccount, type ContractCountry, type ContractScope, type DevCoCost,
} from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.countries,
  ES_ADMIN.capexAccountLists,
  ES_ADMIN.bopContractsStandardAssumptions,
  ES_ADMIN.bopDevCoCosts,
];

/** Reference data — edited rarely. */
const STALE_MS = 5 * 60 * 1000;
const NO_COUNTRIES: ContractCountry[] = [];
const NO_ACCOUNTS: CapexAccount[] = [];
const NO_CONTRACTS: BopContract[] = [];
const NO_COSTS: DevCoCost[] = [];

function asScreenData<T>(
  q: { data: T | undefined; isLoading: boolean; error: unknown }, empty: T,
): ScreenData<T> {
  return { data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** The countries the picker column offers. */
export function useContractCountries(): ScreenData<ContractCountry[]> {
  return asScreenData(
    useQuery({ queryKey: qk.contractCountries, queryFn: listContractCountries, staleTime: 30 * 60 * 1000 }),
    NO_COUNTRIES,
  );
}

/** The flat `CAPEX Account Lists` table the DevCo Cost Form tree is built from. */
export function useContractAccountTree(): ScreenData<CapexAccount[]> {
  return asScreenData(
    useQuery({ queryKey: qk.adminCapexAccounts, queryFn: listAllCapexAccounts, staleTime: STALE_MS }),
    NO_ACCOUNTS,
  );
}

/** The scope's `BoP Contracts Standard Assumptions`. */
export function useBopContracts(scope: ContractScope): ScreenData<BopContract[]> {
  const countryId = scope.countryId;
  const tech = scope.technologyValue;
  return asScreenData(useQuery({
    queryKey: qk.bopContracts(countryId ?? "", tech ?? -1),
    queryFn: () => listBopContracts(countryId!, tech!),
    enabled: countryId !== null && tech !== null,
  }), NO_CONTRACTS);
}

/** The DevCo costs of those contracts. */
export function useDevCoCosts(contractIds: readonly string[]): ScreenData<DevCoCost[]> {
  return asScreenData(useQuery({
    queryKey: qk.bopDevCoCosts(contractIds),
    queryFn: () => listDevCoCosts(contractIds),
    enabled: contractIds.length > 0,
  }), NO_COSTS);
}

/** Runs this screen's write plans and refreshes what they change. */
export function useContractWrites() {
  return usePlanWrite({
    invalidate: [qk.bopContractsAll, qk.bopDevCoCostsAll, qk.bopStandardAssumptionsAll],
    action: "change the BoP standard contracts",
    errorText: MSG.saveError,
  });
}
