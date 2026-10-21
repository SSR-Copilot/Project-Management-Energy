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
 * `Assumptions Revenues SQL` is a Fabric SQL source (D2/D26/D28) and is NOT read here.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_projectrevenuesService } from "@/generated/services/Vsb_projectrevenuesService";
import { Vsb_balancingpricesService } from "@/generated/services/Vsb_balancingpricesService";
import { Vsb_revenueindividualhedgevolumesService } from "@/generated/services/Vsb_revenueindividualhedgevolumesService";
import { Vsb_revenuesubaccountsService } from "@/generated/services/Vsb_revenuesubaccountsService";
import { Vsb_energyyieldsService } from "@/generated/services/Vsb_energyyieldsService";
import {
  BALANCING_COL, FLAG_COL, HEDGE_VOLUME_COL, PROJECT_COL, REVENUE_COL, ALL_STANDARD_FLAG_KEYS,
  type BalancingPeriod, type CountryInflationProfileRow, type IndividualVolumeRow,
  type OverlappingContract, type RevenueProject, type StandardFlags, type StoredRevenueContract,
  type Technology,
} from "@/features/pm/revenues/rules";
import { CHOICE_FINANCE } from "./dataverseNames";
import { fetchAll, fetchPage } from "./client";
import { ACTIVE, and, dateOnly, eq, geDate, guid, leDate, lookupEq, numberOf } from "./odata";
import { listProjectStates } from "./generalData";
import { loadCountryInflation, loadCurrencies } from "./landLease";

type Raw = Record<string, unknown>;
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;
const bool = (v: unknown): boolean => v === true || v === 1;
const formatted = (r: Raw, col: string): string | null => str(r[`${col}@OData.Community.Display.V1.FormattedValue`]);

/** A Date Only value (`yyyy-mm-dd…`) as a LOCAL calendar day (rule 18). Shared with `data/finance.ts`. */
export function day(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 10) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** `Switch(Technology, Wind, …, PV, …)` — the option-set value, decoded once. */
export function toTechnology(v: unknown): Technology {
  if (v === CHOICE_FINANCE.technology.wind) return "Wind";
  if (v === CHOICE_FINANCE.technology.pv) return "PV";
  return "Other";
}

/** The project columns `RevenueProject` is built from. Finance adds `vsb_financingoptions` (D34). */
export const PROJECT_SELECT = Object.values(PROJECT_COL);

/**
 * `Set(gblRecordSelectedProject, LookUp(Projects, …))` (`OnVisible`, L31-37), with the cluster
 * state's `Order` (`'Cluster State'.Order`, the balancing gate) from `Project States`.
 */
export async function loadRevenueProject(projectId: string): Promise<RevenueProject | null> {
  const [rows, states] = await Promise.all([
    fetchPage(
      "load the project",
      (o) => Vsb_projectsService.getAll(o),
      { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
    ),
    listProjectStates(),
  ]);
  const r = raw(rows)[0];
  return r ? toRevenueProject(r, states) : null;
}

/** One `vsb_projects` row (read with `PROJECT_SELECT`) as the `RevenueProject` the PM screens share. */
export function toRevenueProject(r: Raw, states: readonly { id: string; order: number | null }[]): RevenueProject {
  const clusterId = str(r[PROJECT_COL.clusterState]);
  const countryId = str(r[PROJECT_COL.country]);
  return {
    id: String(r[PROJECT_COL.id]),
    projectIdText: str(r[PROJECT_COL.projectIdText]),
    projectName: str(r[PROJECT_COL.projectName]),
    countryName: formatted(r, PROJECT_COL.country),
    countryCode: countryId,
    technology: toTechnology(r[PROJECT_COL.technology]),
    areaName: formatted(r, PROJECT_COL.countryArea),
    cod: day(r[PROJECT_COL.cod]),
    fid: day(r[PROJECT_COL.fid]),
    construction: day(r[PROJECT_COL.construction]),
    legallyBindingPermits: day(r[PROJECT_COL.legallyBindingPermits]),
    applicationSubmitted: day(r[PROJECT_COL.applicationSubmitted]),
    projectDevelopmentStarted: day(r[PROJECT_COL.projectDevelopmentStarted]),
    feasibilityStudies: day(r[PROJECT_COL.feasibilityStudies]),
    netYieldP50: num(r[PROJECT_COL.netYieldP50]),
    totalCapacity: num(r[PROJECT_COL.totalCapacity]),
    endDate: day(r[PROJECT_COL.endDate]),
    clusterStateName: formatted(r, PROJECT_COL.clusterState),
    owningBusinessUnitId: str(r[PROJECT_COL.owningBusinessUnit]),
    clusterStateOrder: clusterId ? states.find((s) => s.id === clusterId)?.order ?? null : null,
  };
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

/** `locSelectedRevenueSubaccount: First(colRevenueSubaccounts)` — `Sort('Revenue Subaccounts', Order)` (App.pa.yaml:604-609). */
export async function loadFirstRevenueSubaccount(): Promise<{ id: string; name: string } | null> {
  const rows = await fetchPage(
    "load the revenue subaccount",
    (o) => Vsb_revenuesubaccountsService.getAll(o),
    { select: ["vsb_revenuesubaccountid", "vsb_name"], orderBy: ["vsb_order asc"], top: 1 },
  );
  const r = rows[0];
  return r ? { id: r.vsb_revenuesubaccountid, name: r.vsb_name ?? "" } : null;
}

/** `LookUp(Currencies, 'Currency Code' = <code>)` — through the shared `loadCurrencies` (Land Lease). */
export async function findCurrency(code: string): Promise<{ id: string; name: string } | null> {
  const c = (await loadCurrencies()).find((x) => x.code === code);
  return c ? { id: c.id, name: c.name } : null;
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
