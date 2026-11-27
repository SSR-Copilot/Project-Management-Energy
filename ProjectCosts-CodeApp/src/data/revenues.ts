/**
 * PM Revenues — the Dataverse reads behind `features/pm/revenues` (connected 20 Oct 2026, D33).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Three tables
 * were registered for this screen with `pac code add-data-source`, one at a time (74 → 77):
 * `vsb_balancingprice`, `vsb_revenueindividualhedgevolume` and `vsb_revenuesubaccount`.
 * `vsb_projectrevenue` (D26), `vsb_energyyield` (D28), `vsb_countryinflationprofile`,
 * `vsb_projectstate`, `vsb_project` and `transactioncurrencies` were already registered; the
 * currencies, inflation profiles and cluster states are read through the existing loaders
 * (`data/landLease.ts`, `data/generalData.ts`), not copied.
 *
 * `Assumptions Revenues SQL` is a Fabric SQL source (`[dbo].[AssumptionsRevenue]`, D54), read only
 * through the Milestones loader (`listRevenueAssumptions`, the same country slice), not copied
 * (connected 29 Oct 2026).
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_projectrevenuesService } from "@/generated/services/Vsb_projectrevenuesService";
import { Vsb_balancingpricesService } from "@/generated/services/Vsb_balancingpricesService";
import { Vsb_revenueindividualhedgevolumesService } from "@/generated/services/Vsb_revenueindividualhedgevolumesService";
import { Vsb_energyyieldsService } from "@/generated/services/Vsb_energyyieldsService";
import {
  BALANCING_COL, FLAG_COL, HEDGE_VOLUME_COL, PROJECT_COL, REVENUE_COL, ALL_STANDARD_FLAG_KEYS,
  type AssumptionRow, type BalancingPeriod, type CountryInflationProfileRow, type IndividualVolumeRow,
  type OverlappingContract, type RevenueProject, type StandardFlags, type StoredRevenueContract,
} from "@/features/pm/revenues/rules";
import { CHOICE_FINANCE } from "./dataverseNames";
import { localDayOf } from "@/domain/dates";
import { fetchAll, fetchPage } from "./client";
import { ACTIVE, and, dateOnly, eq, geDate, guid, leDate, lookupEq } from "./odata";
import { rowStr as str, rowNum as num } from "./rowValues";
import { listProjectStates } from "./projectStatesRead";
import { loadCountryInflation } from "./countryInflation";
import { listRevenueAssumptions } from "./milestones";
// The project-row mapper the PM screens share: moved to `./pmProjectRow` (FE-P2-05, D162) so Finance reads it without this
// module; re-exported, so every importer of these names from here is unchanged.
import { PROJECT_SELECT, formatted, toRevenueProject, toTechnology } from "./pmProjectRow";
export { PROJECT_SELECT, toRevenueProject, toTechnology };

type Raw = Record<string, unknown>;
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];
const bool = (v: unknown): boolean => v === true || v === 1;

/** A Date Only value (`yyyy-mm-dd…`) as a LOCAL calendar day (rule 18). Shared with `data/finance.ts`. */
export const day = localDayOf; // OPT-31 (B8): the one definition is `domain/dates.localDayOf` (UT-DATES-OPT-004)

/**
 * `Set(gblRecordSelectedProject, LookUp(Projects, …))` (`OnVisible`, L31-37), with the cluster
 * state's `Order` (`'Cluster State'.Order`, the balancing gate) from `Project States`.
 */
export async function loadRevenueProject(
  projectId: string,
  /**
   * Where the project states come from. Defaults to a direct read; the screen's hook passes a read through the shared
   * 30-minute `qk.generalDataProjectStates` cache, so a project (re)load no longer reads the whole table again
   * (D136). Still read in parallel with the project row.
   */
  readStates: () => Promise<readonly { id: string; order: number | null }[]> = listProjectStates,
): Promise<RevenueProject | null> {
  const [rows, states] = await Promise.all([
    fetchPage(
      "load the project",
      (o) => Vsb_projectsService.getAll(o),
      { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
    ),
    readStates(),
  ]);
  const r = raw(rows)[0];
  return r ? toRevenueProject(r, states) : null;
}

const REVENUE_SELECT = [...Object.values(REVENUE_COL), ...ALL_STANDARD_FLAG_KEYS.map((k) => FLAG_COL[k])];

function toFlags(r: Raw): StandardFlags {
  const out = {} as StandardFlags;
  ALL_STANDARD_FLAG_KEYS.forEach((k) => { out[k] = bool(r[FLAG_COL[k]]); });
  return out;
}

function toContract(r: Raw): StoredRevenueContract {
  return {
    id: String(r[REVENUE_COL.id] ?? ""),
    name: str(r[REVENUE_COL.name]) ?? "",
    description: str(r[REVENUE_COL.description]) ?? "",
    label: num(r[REVENUE_COL.label]),
    tariffPrice: num(r[REVENUE_COL.tariffPrice]),
    tariffPriceP90: num(r[REVENUE_COL.tariffPriceP90]),
    biddingPrice: num(r[REVENUE_COL.biddingPrice]),
    siteQuality: num(r[REVENUE_COL.siteQuality]),
    siteQualityP90: num(r[REVENUE_COL.siteQualityP90]),
    correctionFactor: num(r[REVENUE_COL.correctionFactor]),
    correctionFactorP90: num(r[REVENUE_COL.correctionFactorP90]),
    contractStartDate: day(r[REVENUE_COL.contractStartDate]),
    contractEndDate: day(r[REVENUE_COL.contractEndDate]),
    contractDurationYears: num(r[REVENUE_COL.contractDurationYears]),
    contractDurationMonths: num(r[REVENUE_COL.contractDurationMonths]),
    hedgeType: num(r[REVENUE_COL.hedgeType]),
    hedgedVolume: num(r[REVENUE_COL.hedgedVolume]),
    fixedContractedMwhPa: num(r[REVENUE_COL.fixedContractedMwhPa]),
    useInflationProfile: bool(r[REVENUE_COL.useInflationProfile]),
    useCountryInflationProfile: bool(r[REVENUE_COL.useCountryInflationProfile]),
    inflationProfile: num(r[REVENUE_COL.inflationProfile]),
    inflationStartYear: num(r[REVENUE_COL.inflationStartYear]),
    inflationCountryArea: str(r[REVENUE_COL.inflationCountryArea]),
    considerNegativePrices: bool(r[REVENUE_COL.considerNegativePrices]),
    negativePriceManualOverride: bool(r[REVENUE_COL.negativePriceManualOverride]),
    currencyId: str(r[REVENUE_COL.currency]),
    currencyName: formatted(r, REVENUE_COL.currency),
    subaccountId: str(r[REVENUE_COL.subaccount]),
    flags: toFlags(r),
    createdOn: str(r[REVENUE_COL.createdOn]) ?? "",
    // `RecordInfo(…, EditPermission / DeletePermission)` has no SDK equivalent (D1): it passes and
    // Dataverse refuses what the user may not do.
    canEdit: true,
    canDelete: true,
    isFolded: false,
  };
}

/** `colProjectRevenueContracts` = `Filter('Project Revenues', Project = …)`, gallery sort `'Created On'` (L77-87, L819). */
export async function listRevenueContracts(projectId: string): Promise<StoredRevenueContract[]> {
  const rows = raw(await fetchAll(
    "load the project's revenue contracts",
    (o) => Vsb_projectrevenuesService.getAll(o),
    { select: REVENUE_SELECT, filter: lookupEq("vsb_project", projectId), orderBy: [`${REVENUE_COL.createdOn} asc`] },
  ));
  return rows.map(toContract);
}

const BALANCING_SELECT = Object.values(BALANCING_COL);

/** `colProjectBalancingPriceContracts` = `Filter('Balancing Prices', Project = …)`, sort `'Created On'` (L88-94, L3257). */
export async function listBalancingPrices(projectId: string): Promise<BalancingPeriod[]> {
  const rows = raw(await fetchAll(
    "load the project's balancing prices",
    (o) => Vsb_balancingpricesService.getAll(o),
    { select: BALANCING_SELECT, filter: lookupEq("vsb_project", projectId), orderBy: [`${BALANCING_COL.createdOn} asc`] },
  ));
  return rows.map((r) => ({
    id: String(r[BALANCING_COL.id] ?? ""),
    name: str(r[BALANCING_COL.name]) ?? "",
    periods: num(r[BALANCING_COL.periods]) ?? CHOICE_FINANCE.periods.period1,
    price: num(r[BALANCING_COL.price]),
    startDate: day(r[BALANCING_COL.startDate]),
    endDate: day(r[BALANCING_COL.endDate]),
    durationYears: num(r[BALANCING_COL.durationYears]),
    durationMonths: num(r[BALANCING_COL.durationMonths]),
    shiftOfCodMonths: num(r[BALANCING_COL.shiftOfCod]),
    createdOn: str(r[BALANCING_COL.createdOn]) ?? "",
  }));
}

/** A stored individual volume, with its row id (the Save deletes them first). */
export interface StoredVolume extends IndividualVolumeRow { recordId: string }

/**
 * `Filter(RevenueIndividualHedgeVolumes, RevenueContract = <contract>)` (Edit, L1468-1497), each
 * `{Year, StartDate, EndDate, VolumeValue, InitialState: false}`, sorted by year.
 */
export async function listIndividualVolumes(contractId: string): Promise<StoredVolume[]> {
  const rows = raw(await fetchAll(
    "load the contract's individual hedge volumes",
    (o) => Vsb_revenueindividualhedgevolumesService.getAll(o),
    { select: Object.values(HEDGE_VOLUME_COL), filter: lookupEq("vsb_revenuecontract", contractId) },
  ));
  return rows
    .map((r) => {
      const value = num(r[HEDGE_VOLUME_COL.value]);
      const start = day(r[HEDGE_VOLUME_COL.startDate]);
      const end = day(r[HEDGE_VOLUME_COL.endDate]);
      const year = num(r[HEDGE_VOLUME_COL.year]) ?? start?.getFullYear() ?? 0;
      return {
        recordId: String(r[HEDGE_VOLUME_COL.id]),
        year,
        startDate: start ?? new Date(year, 0, 1),
        endDate: end ?? new Date(year, 11, 31),
        value: value === null ? "" : String(value),
        initialState: false,
      };
    })
    .sort((a, b) => a.year - b.year);
}

/** The ids alone — read when a Save starts (`RemoveIf(RevenueIndividualHedgeVolumes, …)`). */
export async function listIndividualVolumeIds(contractId: string): Promise<string[]> {
  const rows = raw(await fetchAll(
    "load the contract's individual hedge volumes",
    (o) => Vsb_revenueindividualhedgevolumesService.getAll(o),
    { select: [HEDGE_VOLUME_COL.id], filter: lookupEq("vsb_revenuecontract", contractId) },
  ));
  return rows.map((r) => String(r[HEDGE_VOLUME_COL.id]));
}

/**
 * `_ProjectRelatedEnergyYield` / `_ProductionExist`: `!IsEmpty(Filter('Energy Yields', Project = …,
 * 'Consider Negative Prices' = Yes, Status = Active))` (L1007-1016, L6912-6921). One row is enough.
 */
export async function hasNegativePriceProduction(projectId: string): Promise<boolean> {
  const rows = await fetchPage(
    "check the project's energy yields",
    (o) => Vsb_energyyieldsService.getAll(o),
    {
      select: ["vsb_energyyieldid"],
      filter: and(lookupEq("vsb_project", projectId), eq("vsb_considernegativeprices", true), ACTIVE),
      top: 1,
    },
  );
  return rows.length > 0;
}

/**
 * `locCountryRelatedAssumptions` (Add L729-742, Edit L978-991) — the project country's slice of
 * `Assumptions Revenues SQL` (an Italian project reads every `Italy*` row, 1.21.753), through the
 * Milestones loader. A blank `category` is "" here, as the canvas `category = …` comparisons see it.
 */
export async function listRevenueAssumptionRows(countryName: string): Promise<AssumptionRow[]> {
  return (await listRevenueAssumptions(countryName)).map((r) => ({
    country: r.country, valuetype: r.valuetype, category: r.category ?? "", wind: r.wind, pv: r.pv,
  }));
}

/**
 * `'Country Inflation Profiles'` for `Country.Country = <project country>` — through the shared
 * `loadCountryInflation` (Land Lease), each row tagged with that country's key.
 */
export async function listRevenueCountryInflation(countryId: string): Promise<CountryInflationProfileRow[]> {
  return (await loadCountryInflation(countryId)).map((r) => ({
    countryCode: countryId,
    year: r.year,
    inflation: r.inflation,
    area: r.area === "" ? null : r.area,
  }));
}

/**
 * `varAllContractsInTimeframe` (L4740-4787): `Filter('Project Revenues', Project = …, 'Contract
 * Start Date' <= <new end>, 'Contract End Date' >= <new start>, 'Project Revenue' <> <edited>)`.
 */
export async function listOverlappingContracts(
  projectId: string, start: Date, end: Date, excludeId: string | null,
): Promise<OverlappingContract[]> {
  const rows = raw(await fetchAll(
    "check the hedged volume of the project's contracts",
    (o) => Vsb_projectrevenuesService.getAll(o),
    {
      select: [REVENUE_COL.id, REVENUE_COL.contractStartDate, REVENUE_COL.contractEndDate, REVENUE_COL.hedgedVolume],
      filter: and(
        lookupEq("vsb_project", projectId),
        leDate(REVENUE_COL.contractStartDate, dateOnly(end)),
        geDate(REVENUE_COL.contractEndDate, dateOnly(start)),
        excludeId ? `${REVENUE_COL.id} ne ${guid(excludeId)}` : undefined,
      ),
    },
  ));
  return rows.flatMap((r) => {
    const s = day(r[REVENUE_COL.contractStartDate]);
    const e = day(r[REVENUE_COL.contractEndDate]);
    return s && e ? [{ id: String(r[REVENUE_COL.id]), startDate: s, endDate: e, hedgedVolume: num(r[REVENUE_COL.hedgedVolume]) ?? 0 }] : [];
  });
}
