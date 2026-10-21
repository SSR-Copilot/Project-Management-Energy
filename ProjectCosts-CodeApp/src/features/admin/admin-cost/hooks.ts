/**
 * Admin Cost Screen — the data layer (connected 19 Oct 2026, D24).
 *
 * Canvas screen: `Admin Cost Screen` (PM app). Every table was already registered; the reads live
 * in `data/adminCost.ts`:
 *
 *   useCostCountries()            `vsb_countries` — the rail.
 *   useCostAccountChart()         `vsb_capexaccountlists` — the whole chart (shared key with Admin
 *                                 CAPEX Accounts); categories and subaccounts are derived in rules.
 *   useOpexSubaccounts()          `vsb_opexsubaccounts` + `vsb_opexaccounts` (Account.Order).
 *   useLandLeaseSubaccounts()     `vsb_landleasesubaccounts`.
 *   useOpexAssumptions(scope)     `vsb_opexlandleasestandardassumptionses` of the scope.
 *   useDevexCosts(scope)          `vsb_devexcapexstandardassumptionses` of the scope.
 *   useSpvDevCoMapping()          `vsb_spvdevcomappingcapexdevexes` — Cost Paid By's default.
 *   useInflationAreas(countryId)  `vsb_countryinflationprofiles` — the Area dropdown.
 *   useCostCurrencies()           `transactioncurrencies` — the preset EUR / PLN currency.
 *
 * WRITES — the plans from `rules.ts` run through `usePlanWrite`. FLOWS AND PLUGINS
 * (04-flow-inventory.md, verified 19 Oct 2026): deleting a DEVEX/CAPEX standard cost fires
 * `VSB_CapexAssumptionDeletion` (pre-validation), which deletes every project's CAPEX contracts
 * and costs built from it. Nothing fires on the OPEX & Land Lease table. No flow is called
 * (Apply is out of scope, D20).
 *
 * After a write: this screen's two families are refreshed, and so is the Cost CAPEX screen's
 * standard-assumption read, which comes from the same DEVEX/CAPEX table.
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN, ES_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { listAllCapexAccounts } from "@/data/adminCapexAccounts";
import {
  listCostCountries, listCostCurrencies, listDevexCosts, listInflationAreas, listLandLeaseSubaccounts,
  listOpexAssumptions, listOpexSubaccounts, listSpvDevCoMapping,
} from "@/data/adminCost";
import type {
  CapexAccount, CostScope, CountryRef, CurrencyRef, DevexCost, OpexPeriodRow, OpexSubaccount,
  SpvDevCoMapping,
} from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.countries,
  ES_ADMIN.capexAccountLists,
  ES_PLANT.opexSubaccounts,
  ES_PLANT.landLeaseSubaccounts,
  ES_ADMIN.opexLandLeaseStandardAssumptions,
  ES_ADMIN.devexCapexStandardAssumptions,
  ES_ADMIN.opexAccounts,
  ES_ADMIN.spvDevCoMapping,
  ES.countryInflationProfiles,
  ES.currencies,
];

/** Reference data — edited rarely. */
const STALE_MS = 5 * 60 * 1000;
const NONE = <T,>(): T[] => [];
const NO_COUNTRIES: CountryRef[] = NONE();
const NO_ACCOUNTS: CapexAccount[] = NONE();
const NO_SUBACCOUNTS: OpexSubaccount[] = NONE();
const NO_ROWS: OpexPeriodRow[] = NONE();
const NO_COSTS: DevexCost[] = NONE();
const NO_MAPPING: SpvDevCoMapping[] = NONE();
const NO_AREAS: string[] = NONE();
const NO_CURRENCIES: CurrencyRef[] = NONE();

function asScreenData<T>(
  q: { data: T | undefined; isLoading: boolean; error: unknown }, empty: T,
): ScreenData<T> {
  return { data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

export function useCostCountries(): ScreenData<CountryRef[]> {
  return asScreenData(
    useQuery({ queryKey: qk.costCountries, queryFn: listCostCountries, staleTime: 30 * 60 * 1000 }),
    NO_COUNTRIES,
  );
}

export function useCostAccountChart(): ScreenData<CapexAccount[]> {
  return asScreenData(
    useQuery({ queryKey: qk.adminCapexAccounts, queryFn: listAllCapexAccounts, staleTime: STALE_MS }),
    NO_ACCOUNTS,
  );
}

export function useOpexSubaccounts(): ScreenData<OpexSubaccount[]> {
  return asScreenData(
    useQuery({ queryKey: qk.costOpexSubaccounts, queryFn: listOpexSubaccounts, staleTime: STALE_MS }),
    NO_SUBACCOUNTS,
  );
}

export function useLandLeaseSubaccounts(): ScreenData<OpexSubaccount[]> {
  return asScreenData(
    useQuery({ queryKey: qk.costLandLeaseSubaccounts, queryFn: listLandLeaseSubaccounts, staleTime: STALE_MS }),
    NO_SUBACCOUNTS,
  );
}

export function useOpexAssumptions(scope: CostScope): ScreenData<OpexPeriodRow[]> {
  const { countryId, technologyValue: tech } = scope;
  return asScreenData(useQuery({
    queryKey: qk.costOpexAssumptions(countryId ?? "", tech ?? -1),
    queryFn: () => listOpexAssumptions(countryId!, tech!),
    enabled: countryId !== null && tech !== null,
  }), NO_ROWS);
}

export function useDevexCosts(scope: CostScope): ScreenData<DevexCost[]> {
  const { countryId, technologyValue: tech } = scope;
  return asScreenData(useQuery({
    queryKey: qk.costDevexCosts(countryId ?? "", tech ?? -1),
    queryFn: () => listDevexCosts(countryId!, tech!),
    enabled: countryId !== null && tech !== null,
  }), NO_COSTS);
}

export function useSpvDevCoMapping(): ScreenData<SpvDevCoMapping[]> {
  return asScreenData(
    useQuery({ queryKey: qk.costSpvMapping, queryFn: listSpvDevCoMapping, staleTime: STALE_MS }),
    NO_MAPPING,
  );
}

export function useInflationAreas(countryId: string | null): ScreenData<string[]> {
  return asScreenData(useQuery({
    queryKey: qk.costInflationAreas(countryId ?? ""),
    queryFn: () => listInflationAreas(countryId!),
    enabled: countryId !== null,
    staleTime: STALE_MS,
  }), NO_AREAS);
}

export function useCostCurrencies(): ScreenData<CurrencyRef[]> {
  return asScreenData(
    useQuery({ queryKey: qk.costCurrencies, queryFn: listCostCurrencies, staleTime: 30 * 60 * 1000 }),
    NO_CURRENCIES,
  );
}

/** Runs this screen's write plans and refreshes what they change. */
export function useCostWrites() {
  return usePlanWrite({
    invalidate: [qk.costOpexAssumptionsAll, qk.costDevexCostsAll, qk.capexStandardAssumptionsAll],
    action: "change the standard costs",
  });
}
