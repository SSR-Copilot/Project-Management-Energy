/**
 * Project Revenues Screen — the data layer (connected 20 Oct 2026, D33).
 *
 * READS (`data/revenues.ts`, every one server-filtered with a `$select`):
 *  - the project (`gblRecordSelectedProject`, re-read on every visit as `OnVisible` does), with its
 *    cluster state's `Order` (the balancing gate);
 *  - `colProjectRevenueContracts` / `colProjectBalancingPriceContracts` — the project's revenue
 *    contracts and balancing prices, sorted by `'Created On'`;
 *  - the edited contract's `RevenueIndividualHedgeVolumes`;
 *  - `_ProductionExist` — an active energy yield with "Consider Negative Prices";
 *  - `First(colRevenueSubaccounts)`, the contract currency (`transactioncurrencies`) and the
 *    project country's `Country Inflation Profiles`;
 *  - at Save time, the contracts overlapping the new term (the hedge 100 % check).
 *
 * FABRIC SQL (connected 29 Oct 2026): `Assumptions Revenues SQL` (`[dbo].[AssumptionsRevenue]`,
 * D54) is read only, by `useRevenueAssumptions`, for the project country's slice; the standard-
 * assumption engine derives the type, description, dates, durations, price, inflation and hedged
 * volume from it.
 *
 * WRITES — `WritePlan`s from `rules.ts`, run in order by `usePlanWrite`:
 *  - contract Save: the contract upsert, then the deletion of its stored individual volumes, then
 *    (Individual Volumes) one create per year — the canvas order. Owner = the project's business unit.
 *  - contract Delete: the contract only; its volumes go with it (`CascadeDelete: Cascade`).
 *  - balancing Save / Delete: one write each.
 *
 * SERVER AUTOMATION (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified 19 Oct 2026):
 *  - plugin step "Balancing-price period date sync" on `vsb_balancingprice` Create (filtering
 *    `vsb_name, vsb_project`) and Update (`vsb_shiftofcoddatemonths`): it computes the period's
 *    start and end dates. The canvas `Patch` writes neither date, and neither does this app; the
 *    Save writes `vsb_shiftofcoddatemonths` on every update (blank for later periods), as the canvas.
 *  - NO flow is triggered by `vsb_projectrevenue`, `vsb_revenueindividualhedgevolume` or
 *    `vsb_balancingprice`, and the screen writes no `vsb_projects` column. The canvas calls no
 *    flow (no `.Run(`); nothing is left out for a flow, and no Apply control exists here (D20).
 *
 * PERMISSIONS: `CanEditSelectedProject` and `RecordInfo(…, Edit/DeletePermission)` have no SDK
 * equivalent (D1): they pass and Dataverse refuses what the user may not do.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ES, ES_FINANCE, ES_PRODUCTION } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  listIndividualVolumeIds, listIndividualVolumes, listOverlappingContracts, type StoredVolume,
} from "@/data/revenues";
import {
  balancingPricesQueryOptions, negativePriceProductionQueryOptions, revenueAssumptionsQueryOptions, revenueContractsQueryOptions,
  revenueCurrencyQueryOptions, revenueInflationQueryOptions, revenueProjectQueryOptions, revenueSubaccountQueryOptions,
} from "./queries";
import {
  provinceToPriceRegion,
  type AssumptionRow, type BalancingPeriod, type CountryInflationProfileRow, type RevenueProject,
  type StoredRevenueContract,
} from "./rules";

/** The Dataverse entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.projectStates,
  ES_FINANCE.projectRevenues,
  ES_FINANCE.balancingPrices,
  ES_FINANCE.revenueIndividualHedgeVolumes,
  ES_PRODUCTION.energyYields,
  ES.countryInflationProfiles,
  ES.revenueSubaccounts,
  ES.currencies,
];

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

/**
 * `Set(gblRecordSelectedProject, LookUp(Projects, …))` (`OnVisible`).
 *
 * The project states (the cluster state's `Order`, the balancing gate) are read through the SAME cache entry General
 * Data uses (`qk.generalDataProjectStates`, `listProjectStates`, 30 minutes), so a project (re)load, which also
 * happens on every window focus, no longer re-reads the whole table: one request instead of two (D136).
 * The entry sits outside `["pmRevenues", …]`, so a write's reload does not refetch it either.
 */
export function useRevenueProject(projectId: string | undefined): ScreenData<RevenueProject | null> {
  const qc = useQueryClient();
  const q = useQuery({ ...revenueProjectQueryOptions(qc, projectId), enabled: Boolean(projectId) });
  return out<RevenueProject | null>(q, null);
}

/** Rule 2 — the province → price-region map, applied once per project. Pure, no I/O. */
export const useItalyRegion = (project: RevenueProject | null): string | null =>
  (project?.countryName === "Italy" ? provinceToPriceRegion(project.areaName) : null);

/** Rule 3 — `Assumptions Revenues SQL` (Fabric SQL, read only) for the project's country. */
export function useRevenueAssumptions(countryName: string | null): ScreenData<AssumptionRow[]> {
  const q = useQuery({ ...revenueAssumptionsQueryOptions(countryName), enabled: Boolean(countryName) });
  return out<AssumptionRow[]>(q, []);
}

/** `colProjectRevenueContracts`. */
export function useRevenueContracts(projectId: string | undefined): ScreenData<StoredRevenueContract[]> {
  const q = useQuery({ ...revenueContractsQueryOptions(projectId), enabled: Boolean(projectId) });
  return out<StoredRevenueContract[]>(q, []);
}

/** `colProjectBalancingPriceContracts`. */
export function useBalancingPrices(projectId: string | undefined): ScreenData<BalancingPeriod[]> {
  const q = useQuery({ ...balancingPricesQueryOptions(projectId), enabled: Boolean(projectId) });
  return out<BalancingPeriod[]>(q, []);
}

/** Rule 27 — the stored individual volumes of the contract being edited. */
export function useIndividualVolumes(
  projectId: string | undefined, contractId: string | null,
): ScreenData<StoredVolume[]> {
  const q = useQuery({
    queryKey: qk.revenues(projectId ?? "", "volumes", contractId ?? "-"),
    queryFn: () => listIndividualVolumes(contractId!),
    enabled: Boolean(projectId && contractId),
  });
  return out<StoredVolume[]>(q, []);
}

/** Rule 18 — `_ProductionExist`. */
export function useNegativePriceProduction(projectId: string | undefined): ScreenData<boolean> {
  const q = useQuery({ ...negativePriceProductionQueryOptions(projectId), enabled: Boolean(projectId) });
  return out(q, false);
}

/** Rule 17 — `Country Inflation Profiles` for the project's country. */
export function useCountryInflationProfiles(countryId: string | null): ScreenData<CountryInflationProfileRow[]> {
  const q = useQuery({ ...revenueInflationQueryOptions(countryId), enabled: Boolean(countryId) });
  return out<CountryInflationProfileRow[]>(q, []);
}

/** `First(colRevenueSubaccounts)` — the subaccount of every contract. */
export function useRevenueSubaccount(): ScreenData<{ id: string; name: string } | null> {
  const q = useQuery(revenueSubaccountQueryOptions());
  return out<{ id: string; name: string } | null>(q, null);
}

/**
 * `drp_…_Currency_1` — `LookUp(Currencies, 'Currency Code' = "PLN" | "EUR")` (source ambiguity 7).
 *
 * D136: it waits for the project (`enabled`), so the "EUR" default is no longer read first and then the
 * "PLN" code of a Polish project read again, and it asks the server for that one ISO code instead of the whole table.
 * A project with no country still reads the default code once: `enabled` follows the project, not the country.
 */
export function useRevenueCurrency(
  countryName: string | null, enabled = true,
): ScreenData<{ id: string; name: string } | null> {
  const q = useQuery({ ...revenueCurrencyQueryOptions(countryName), enabled });
  return out<{ id: string; name: string } | null>(q, null);
}

/** Rules 22–23 — read at Save time, as the canvas `Filter` inside the save formula. */
export const fetchOverlappingContracts = listOverlappingContracts;

/** `RemoveIf(RevenueIndividualHedgeVolumes, …)` — the ids, read when a contract Save starts. */
export const fetchIndividualVolumeIds = listIndividualVolumeIds;

/** Runs the Save / Delete jobs from `rules.ts` and re-reads everything the screen shows. */
export function useRevenueWrites(projectId: string | undefined) {
  return usePlanWrite({
    invalidate: [qk.revenuesAll(projectId ?? "")],
    action: "change this project's revenues",
  });
}
