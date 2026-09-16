/**
 * Project Revenues Screen — queries and mutations.
 *
 * Canvas screen: `Project Revenues Screen` (PM app)
 *   289 controls · 11 769 lines of Power Fx · 122 substantive blocks · band XL
 *
 * `OnVisible` re-read the project, mapped the Italian province to a price region and then
 * pulled the country slice of `Assumptions Revenues SQL` into `locCountryRelatedAssumptions`
 * so that ~12 client-side `LookUp`s could run over it. Here the country slice is one
 * server query with the Italy `or` pushed into the `$filter`, and every `LookUp` is a pure
 * function in `rules.ts`.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `ClearCollect(colProjectRevenueContracts, Filter('Project Revenues', …))` and the
 *    matching balancing-price collect: `useQuery` with an OData `$filter`, never a
 *    materialised table.
 *  - `ForAll(colRevenueHedgeIndividualVolume, Patch(RevenueIndividualHedgeVolumes, …))` —
 *    one write per contract year. Now one `$batch` changeset that also carries the
 *    contract upsert and the `RemoveIf`, so a contract can no longer end up saved with its
 *    volumes deleted (the canvas failure mode).
 *  - The per-month `Sum(Filter('Project Revenues', …))` inside a `ForAll`, one Dataverse
 *    round trip per month of the contract term. `useOverlappingContracts` is one query
 *    with both date bounds and the `ne` on the contract id in the `$filter`.
 *  - `Set(gblRecordSelectedProject, LookUp(Projects, …))` on every visit — that idiom is
 *    `useProjectContext()`.
 *
 * FLOW NOTE — no flow is called from this screen. The one integration is
 * `Assumptions Revenues SQL`, a Fabric/SQL source the canvas reads directly from the
 * client; here it is a repository read like any other. Its `wind` / `pv` columns are still
 * strings, so `assumptionNumber` still performs the locale dance of rule 12 — that
 * disappears the day the endpoint parses server-side.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, projectRevenueFullRepo, balancingPriceRepo, revenueHedgeVolumeRepo,
  assumptionsRevenuesRepo, countryInflationProfileRepo, energyYieldFullRepo,
  currencyRepo, revenueSubaccountRepo,
  type ProjectRow,
} from "@/data/repos";
import { ES_FINANCE, CHOICE_FINANCE, CHOICE_PLANT } from "@/data/entities";
import { qk } from "@/data/queryKeys";
import type { WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { browserLocale } from "@/domain/locale";
import {
  provinceToPriceRegion, assumptionCountries, revenueCurrencyCode,
  type AssumptionRow, type RevenueProject, type Technology, type StandardFlags,
  type StoredRevenueContract, type BalancingPeriod, type OverlappingContract,
  type CountryInflationProfileRow, type RevenueSavePayload, type IndividualVolumeRow,
} from "./rules";

/* ═════════════════════════════════════════════════════════════════ column maps ══ */

/** `Projects` columns this screen reads. Names are from `sol/customizations.xml`. */
export const PROJECT_COL = {
  id: "vsb_projectid",
  projectIdText: "vsb_name",
  projectName: "vsb_projectname",
  country: "_vsb_country_value",
  countryArea: "_vsb_countryarea_value",
  technology: "vsb_technology",
  totalCapacity: "vsb_totalcapacity",
  netYieldP50: "vsb_netyieldp50",
  endDate: "vsb_enddate",
  cod: "vsb_operationsstartdatecod",
  fid: "vsb_finalinvestmentdecision",
  construction: "vsb_construction",
  legallyBindingPermits: "vsb_legallybindingpermits",
  applicationSubmitted: "vsb_applicationsubmitted",
  projectDevelopmentStarted: "vsb_projectdevelopmentstarted",
  feasibilityStudies: "vsb_feasibilitystudies",
  clusterState: "_vsb_clusterstate_value",
  financingOptions: "vsb_financingoptions",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const REVENUE_COL = {
  id: "vsb_projectrevenueid",
  name: "vsb_name",
  project: "_vsb_project_value",
  description: "vsb_description",
  label: "vsb_label",
  currency: "_vsb_currency_value",
  subaccount: "_vsb_subaccount_value",
  tariffPrice: "vsb_tariffprice",
  tariffPriceP90: "vsb_tariffpricep90",
  biddingPrice: "vsb_biddingprice",
  siteQuality: "vsb_sitequality",
  siteQualityP90: "vsb_sitequalityp90",
  correctionFactor: "vsb_correctionfactor",
  correctionFactorP90: "vsb_correctionfactorp90",
  contractStartDate: "vsb_contractstartdate",
  contractEndDate: "vsb_contractenddate",
  contractDurationYears: "vsb_contractdurationyears",
  contractDurationMonths: "vsb_contractdurationmonths",
  hedgeType: "vsb_hedgetype",
  hedgedVolume: "vsb_hedgedvolume",
  fixedContractedMwhPa: "vsb_fixedcontractedmwhpa",
  useInflationProfile: "vsb_useinflationprofile",
  useCountryInflationProfile: "vsb_usecountryinflationprofile",
  inflationProfile: "vsb_inflationprofile",
  inflationStartYear: "vsb_inflationstartyear",
  inflationCountryArea: "vsb_inflationcountryarea",
  considerNegativePrices: "vsb_considernegativeprices",
  negativePriceManualOverride: "vsb_negativepricemanualoverride",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** The fourteen persisted `Is … Standard Assumption?` columns (rule 25). */
export const FLAG_COL: Record<keyof StandardFlags, string> = {
  biddingPrice: "vsb_isbiddingpricestandardassumption",
  contractDurationYears: "vsb_iscontractdurationyearsstandardassumption",
  contractDurationMonths: "vsb_iscontractdurationmonthsstandardassumption",
  contractStartDate: "vsb_iscontractstartdatestandardassumption",
  contractEndDate: "vsb_iscontractenddatestandardassumption",
  tariffPrice: "vsb_istarrifpricestandardassumption",
  tariffPriceP90: "vsb_istarrifpricep90standardassumption",
  useInflationProfile: "vsb_isinflationprofilestandardassumption",
  useCustomInflation: "vsb_isusecustominflationstandardassumption",
  inflationProfileYear: "vsb_isinflationprofileyearstandardassumption",
  customInflationProfile: "vsb_iscustominflationprofilestandardassumption",
  hedgedVolume: "vsb_ishedgedvolumestandardassumption",
  correctionFactor: "vsb_iscorrectionfactorstandardassumption",
  correctionFactorP90: "vsb_iscorrectionfactorp90standardassumption",
};

export const BALANCING_COL = {
  id: "vsb_balancingpriceid",
  name: "vsb_name",
  project: "_vsb_project_value",
  periods: "vsb_periods",
  price: "vsb_balancingpriceeurpln",
  startDate: "vsb_startdatebalancingcontract",
  endDate: "vsb_enddatebalancingcontract",
  durationYears: "vsb_contractdurationyear",
  durationMonths: "vsb_contractdurationmonth",
  shiftOfCod: "vsb_shiftofcoddatemonths",
  referenceCod: "vsb_referencecod",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const HEDGE_VOLUME_COL = {
  id: "vsb_revenueindividualhedgevolumeid",
  name: "vsb_name",
  contract: "_vsb_revenuecontract_value",
  year: "vsb_year",
  startDate: "vsb_startdate",
  endDate: "vsb_enddate",
  value: "vsb_individualcontractedmwhpa",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/* ═════════════════════════════════════════════════════════════════════ mappers ══ */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;
const date = (v: unknown): Date | null => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fv = (r: Record<string, unknown>, col: string): string | null =>
  str(r[`${col}@OData.Community.Display.V1.FormattedValue`]);

/** `Switch(Text(Technology), …)` — the option-set value, decoded once. */
export function toTechnology(v: unknown): Technology {
  if (v === CHOICE_FINANCE.technology.wind) return "Wind";
  if (v === CHOICE_FINANCE.technology.pv) return "PV";
  return "Other";
}

export function toRevenueProject(r: ProjectRow | undefined): RevenueProject | null {
  if (!r) return null;
  const rec = r as unknown as Record<string, unknown>;
  return {
    id: String(rec[PROJECT_COL.id] ?? ""),
    projectIdText: str(rec[PROJECT_COL.projectIdText]),
    projectName: str(rec[PROJECT_COL.projectName]),
    countryName: fv(rec, PROJECT_COL.country),
    // `Country.Country` is the code the inflation profiles key on; the formatted value of
    // the lookup is the NAME, so the code comes off the country reference query.
    countryCode: fv(rec, PROJECT_COL.country),
    technology: toTechnology(rec[PROJECT_COL.technology]),
    areaName: fv(rec, PROJECT_COL.countryArea),
    cod: date(rec[PROJECT_COL.cod]),
    fid: date(rec[PROJECT_COL.fid]),
    construction: date(rec[PROJECT_COL.construction]),
    legallyBindingPermits: date(rec[PROJECT_COL.legallyBindingPermits]),
    applicationSubmitted: date(rec[PROJECT_COL.applicationSubmitted]),
    projectDevelopmentStarted: date(rec[PROJECT_COL.projectDevelopmentStarted]),
    feasibilityStudies: date(rec[PROJECT_COL.feasibilityStudies]),
    netYieldP50: num(rec[PROJECT_COL.netYieldP50]),
    totalCapacity: num(rec[PROJECT_COL.totalCapacity]),
    endDate: date(rec[PROJECT_COL.endDate]),
    clusterStateName: fv(rec, PROJECT_COL.clusterState),
    owningBusinessUnitId: str(rec[PROJECT_COL.owningBusinessUnit]),
  };
}

function toFlags(r: Record<string, unknown>): StandardFlags {
  const out = {} as StandardFlags;
  (Object.keys(FLAG_COL) as (keyof StandardFlags)[]).forEach((k) => {
    out[k] = bool(r[FLAG_COL[k]]);
  });
  return out;
}

export function toRevenueContract(r: Record<string, unknown>): StoredRevenueContract {
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
    contractStartDate: date(r[REVENUE_COL.contractStartDate]),
    contractEndDate: date(r[REVENUE_COL.contractEndDate]),
    contractDurationYears: num(r[REVENUE_COL.contractDurationYears]),
    contractDurationMonths: num(r[REVENUE_COL.contractDurationMonths]),
    hedgeType: num(r[REVENUE_COL.hedgeType]),
    hedgedVolume: num(r[REVENUE_COL.hedgedVolume]),
    fixedContractedMwhPa: num(r[REVENUE_COL.fixedContractedMwhPa]),
    useInflationProfile: bool(r[REVENUE_COL.useInflationProfile]),
    useCountryInflationProfile: bool(r[REVENUE_COL.useCountryInflationProfile]),
    inflationProfile: num(r[REVENUE_COL.inflationProfile]),
    inflationStartYear: num(r[REVENUE_COL.inflationStartYear]),
    considerNegativePrices: bool(r[REVENUE_COL.considerNegativePrices]),
    negativePriceManualOverride: bool(r[REVENUE_COL.negativePriceManualOverride]),
    currencyId: str(r[REVENUE_COL.currency]),
    subaccountId: str(r[REVENUE_COL.subaccount]),
    flags: toFlags(r),
    // Permission rule 15: these come off the server DTO, never from a role name. Until
    // the repository projects the record-level privileges they default to the screen's
    // own `canEdit`, which `Screen.tsx` supplies.
    canEdit: true,
    canDelete: true,
    isFolded: false,
  };
}

export function toBalancingPeriod(r: Record<string, unknown>): BalancingPeriod {
  return {
    id: String(r[BALANCING_COL.id] ?? ""),
    name: str(r[BALANCING_COL.name]) ?? "",
    periods: num(r[BALANCING_COL.periods]) ?? CHOICE_FINANCE.periods.period1,
    price: num(r[BALANCING_COL.price]),
    startDate: date(r[BALANCING_COL.startDate]),
    endDate: date(r[BALANCING_COL.endDate]),
    durationYears: num(r[BALANCING_COL.durationYears]),
    durationMonths: num(r[BALANCING_COL.durationMonths]),
    shiftOfCodMonths: num(r[BALANCING_COL.shiftOfCod]),
    createdOn: str(r["createdon"]) ?? "",
  };
}

export function toAssumptionRow(r: Record<string, unknown>): AssumptionRow {
  return {
    country: str(r["country"]) ?? "",
    valuetype: str(r["valuetype"]) ?? "",
    category: str(r["category"]) ?? "",
    wind: str(r["wind"]),
    pv: str(r["pv"]),
  };
}

/* ═══════════════════════════════════════════════════════════════════ queries ═══ */

const REF_STALE = 30 * 60_000;

/** `Set(gblRecordSelectedProject, LookUp(Projects, …))` in `OnVisible`. */
export function useRevenueProject(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["revenues", "project", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!, Object.values(PROJECT_COL)),
    staleTime: 30_000,
  });
  return {
    project: toRevenueProject(q.data),
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}

/** Rule 2 — the province → price-region map, applied once per project. */
export const useItalyRegion = (project: RevenueProject | null): string | null =>
  useMemo(
    () => (project?.countryName === "Italy" ? provinceToPriceRegion(project.areaName) : null),
    [project?.countryName, project?.areaName],
  );

/**
 * Rule 3 — the country slice of `Assumptions Revenues SQL`. The Italy
 * `Or(country = "Italy", country = locAreaWithRegion)` is pushed into the `$filter`; the
 * canvas pulled the slice client-side and then ran ~12 `LookUp`s over it.
 */
export function useRevenueAssumptions(countryName: string | null, region: string | null) {
  const countries = assumptionCountries(countryName, region);
  const q = useQuery({
    queryKey: ["revenues", "assumptions", countries.join("|")],
    enabled: countries.length > 0,
    queryFn: async () => {
      const rows = await assumptionsRevenuesRepo.listAll({
        filter: f.inList("country", countries),
      });
      return rows.map(toAssumptionRow);
    },
    staleTime: REF_STALE,
  });
  return { rows: q.data ?? [], isLoading: q.isLoading, isError: q.isError, error: q.error };
}

export function useRevenueContracts(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("projectRevenues", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => (await projectRevenueFullRepo.byProject(projectId!)).map(toRevenueContract),
    staleTime: 15_000,
  });
  return { contracts: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

export function useBalancingPrices(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("balancingPrices", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await balancingPriceRepo.byProject(projectId!, { orderBy: [asc("createdon")] }))
        .map(toBalancingPeriod),
    staleTime: 15_000,
  });
  return { periods: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** Rule 27 — the individual volumes of the contract being edited. */
export function useIndividualVolumes(contractId: string | null) {
  const q = useQuery({
    queryKey: ["revenues", "hedgeVolumes", contractId ?? "none"],
    enabled: Boolean(contractId),
    queryFn: async () => {
      const rows = await revenueHedgeVolumeRepo.byProject(contractId!);
      return rows.map((r): IndividualVolumeRow => ({
        year: num(r[HEDGE_VOLUME_COL.year]) ?? 0,
        startDate: date(r[HEDGE_VOLUME_COL.startDate]) ?? new Date(),
        endDate: date(r[HEDGE_VOLUME_COL.endDate]) ?? new Date(),
        value: String(num(r[HEDGE_VOLUME_COL.value]) ?? ""),
        initialState: false,
        recordId: String(r[HEDGE_VOLUME_COL.id] ?? ""),
      })).sort((a, b) => a.year - b.year);
    },
  });
  return { volumes: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Rule 18 — the `Energy Yields` existence test behind `_ProductionExist`:
 * `Status = Active` AND `'Consider Negative Prices' = Yes`. One `$filter`, one row.
 */
export function useNegativePriceProduction(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["revenues", "negativePriceProduction", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await energyYieldFullRepo.list({
        select: ["vsb_energyyieldid"],
        filter: f.and(
          f.guid("_vsb_project_value", projectId!),
          f.eq("statecode", CHOICE_PLANT.status.active),
          f.eq("vsb_considernegativeprices", true),
        ),
        top: 1,
      });
      return rows.rows.length > 0;
    },
    staleTime: 30_000,
  });
  return q.data ?? false;
}

/** Rule 17 — `Country Inflation Profiles`, filtered by country on the server. */
export function useCountryInflationProfiles(countryId: string | null) {
  const q = useQuery({
    queryKey: ["revenues", "inflationProfiles", countryId ?? "none"],
    enabled: Boolean(countryId),
    queryFn: async () => {
      const rows = await countryInflationProfileRepo.listAll({
        filter: f.guid("_vsb_country_value", countryId!),
      });
      return rows.map((r): CountryInflationProfileRow => ({
        countryCode: r._vsb_country_value,
        year: r.vsb_year,
        inflation: r.vsb_inflation,
        area: r.vsb_area,
      }));
    },
    staleTime: REF_STALE,
  });
  return q.data ?? [];
}

/** `colRevenueSubaccounts` — `First(...)` is the default subaccount for a new contract. */
export function useRevenueSubaccount() {
  const q = useQuery({
    queryKey: ["revenues", "subaccounts"],
    queryFn: () => revenueSubaccountRepo.listAll({ orderBy: [asc("vsb_order")] }),
    staleTime: REF_STALE,
  });
  return { subaccount: q.data?.[0] ?? null, isLoading: q.isLoading };
}

/** Source ambiguity 7 — the currency the control default picks. */
export function useRevenueCurrency(countryName: string | null) {
  const code = revenueCurrencyCode(countryName);
  const q = useQuery({
    queryKey: ["revenues", "currency", code],
    queryFn: () => currencyRepo.getOne(f.eq("vsb_currencycode", code)),
    staleTime: REF_STALE,
  });
  return { currency: q.data ?? null, code };
}

/**
 * Rules 22–23 — the contracts that overlap the new term.
 *
 * The canvas evaluates `Sum(Filter('Project Revenues', …))` once per month of the term,
 * client-side, inside a `ForAll`. One query, both bounds and the `ne` in the `$filter`.
 */
export function useOverlappingContracts(
  projectId: string | undefined, start: Date | null, end: Date | null, excludeId: string | null,
) {
  const q = useQuery({
    queryKey: [
      "revenues", "overlap", projectId ?? "none",
      start?.toISOString() ?? "", end?.toISOString() ?? "", excludeId ?? "",
    ],
    enabled: Boolean(projectId && start && end),
    queryFn: async () => {
      const rows = await projectRevenueFullRepo.listAll({
        select: [
          REVENUE_COL.id, REVENUE_COL.contractStartDate, REVENUE_COL.contractEndDate,
          REVENUE_COL.hedgedVolume,
        ],
        filter: f.and(
          f.guid(REVENUE_COL.project, projectId!),
          f.le(REVENUE_COL.contractStartDate, end!.toISOString()),
          f.ge(REVENUE_COL.contractEndDate, start!.toISOString()),
          excludeId ? f.ne(REVENUE_COL.id, excludeId) : undefined,
        ),
      });
      return rows.map((r): OverlappingContract => ({
        id: String(r[REVENUE_COL.id] ?? ""),
        startDate: date(r[REVENUE_COL.contractStartDate]) ?? new Date(0),
        endDate: date(r[REVENUE_COL.contractEndDate]) ?? new Date(0),
        hedgedVolume: num(r[REVENUE_COL.hedgedVolume]) ?? 0,
      }));
    },
  });
  return { contracts: q.data ?? [], isFetching: q.isFetching, refetch: q.refetch };
}

/* ═════════════════════════════════════════════════════════════════ mutations ═══ */

function revenueFields(
  p: RevenueSavePayload, project: RevenueProject, currencyId: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [REVENUE_COL.name]: p.name,
    [REVENUE_COL.description]: p.description,
    [REVENUE_COL.label]: p.label,
    [REVENUE_COL.tariffPrice]: p.tariffPrice,
    [REVENUE_COL.tariffPriceP90]: p.tariffPriceP90,
    [REVENUE_COL.biddingPrice]: p.biddingPrice,
    [REVENUE_COL.siteQuality]: p.siteQuality,
    [REVENUE_COL.siteQualityP90]: p.siteQualityP90,
    [REVENUE_COL.correctionFactor]: p.correctionFactor,
    [REVENUE_COL.correctionFactorP90]: p.correctionFactorP90,
    [REVENUE_COL.contractStartDate]: p.contractStartDate?.toISOString() ?? null,
    [REVENUE_COL.contractEndDate]: p.contractEndDate?.toISOString() ?? null,
    [REVENUE_COL.contractDurationYears]: p.contractDurationYears,
    [REVENUE_COL.contractDurationMonths]: p.contractDurationMonths,
    [REVENUE_COL.hedgeType]: p.hedgeType,
    [REVENUE_COL.hedgedVolume]: p.hedgedVolume,
    [REVENUE_COL.fixedContractedMwhPa]: p.fixedContractedMwhPa,
    [REVENUE_COL.useInflationProfile]: p.useInflationProfile,
    [REVENUE_COL.useCountryInflationProfile]: p.useCountryInflationProfile,
    [REVENUE_COL.inflationProfile]: p.inflationProfile,
    [REVENUE_COL.inflationStartYear]: p.inflationStartYear,
    [REVENUE_COL.considerNegativePrices]: p.considerNegativePrices,
    [REVENUE_COL.negativePriceManualOverride]: p.negativePriceManualOverride,
    [`${REVENUE_COL.project}@odata.bind`]: `/vsb_projects(${project.id})`,
  };
  if (currencyId) out[`${REVENUE_COL.currency}@odata.bind`] = `/vsb_currencies(${currencyId})`;
  if (p.subaccountId) {
    out[`${REVENUE_COL.subaccount}@odata.bind`] = `/vsb_revenuesubaccounts(${p.subaccountId})`;
  }
  (Object.keys(FLAG_COL) as (keyof StandardFlags)[]).forEach((k) => {
    out[FLAG_COL[k]] = p.flags[k];
  });
  return out;
}

/**
 * Rule 24 — the save. ONE `$batch` changeset: the contract upsert, the delete of every
 * existing individual-volume row, and the re-insert. The canvas issues these as separate
 * statements and can leave a contract saved with its volumes deleted.
 */
export function useSaveRevenueContract(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      payload: RevenueSavePayload;
      project: RevenueProject;
      contractId: string | null;
      currencyId: string | null;
      existingVolumeIds: string[];
    }) => {
      const { payload, project, contractId, currencyId, existingVolumeIds } = args;
      const fields = revenueFields(payload, project, currencyId);

      const id = contractId
        ? (await projectRevenueFullRepo.update(contractId, fields), contractId)
        : await projectRevenueFullRepo.create(fields);

      const ops: Omit<WriteOp, "entitySet">[] = [
        ...existingVolumeIds.map((vid) => ({ op: "delete" as const, id: vid })),
        ...payload.individualVolumes.map((v) => ({
          op: "create" as const,
          data: {
            [HEDGE_VOLUME_COL.name]: `${payload.name}-${v.year}`,
            [HEDGE_VOLUME_COL.year]: v.year,
            [HEDGE_VOLUME_COL.startDate]: v.startDate.toISOString(),
            [HEDGE_VOLUME_COL.endDate]: v.endDate.toISOString(),
            [HEDGE_VOLUME_COL.value]: Number(v.value) || 0,
            [`${HEDGE_VOLUME_COL.contract}@odata.bind`]:
              `/${ES_FINANCE.projectRevenues}(${id})`,
          },
        })),
      ];
      if (ops.length > 0) await revenueHedgeVolumeRepo.saveMany(ops);
      trace("information", "Revenue contract saved", { id, volumes: payload.individualVolumes.length });
      return id;
    },
    onError: (e) => trace("error", "Revenue contract save failed", { error: toAppError(e).message }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("projectRevenues", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: ["revenues", "hedgeVolumes"] });
      void qc.invalidateQueries({ queryKey: ["revenues", "overlap"] });
    },
  });
}

/** Rule 31 — deleting a contract cascades to its individual volumes, in one changeset. */
export function useDeleteRevenueContract(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const volumes = await revenueHedgeVolumeRepo.byProject(contractId, {
        select: [HEDGE_VOLUME_COL.id],
      });
      if (volumes.length > 0) {
        await revenueHedgeVolumeRepo.saveMany(
          volumes.map((v) => ({ op: "delete" as const, id: String(v[HEDGE_VOLUME_COL.id] ?? "") })),
        );
      }
      await projectRevenueFullRepo.remove(contractId);
      trace("information", "Revenue contract deleted", { contractId, volumes: volumes.length });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("projectRevenues", projectId ?? "none") });
    },
  });
}

export interface BalancingSaveArgs {
  id: string | null;
  projectId: string;
  name: string;
  periods: number | null;
  price: number;
  startDate: Date | null;
  endDate: Date | null;
  durationYears: number;
  durationMonths: number;
  shiftOfCodMonths: number | null;
}

/** Rule 28 — the balancing-period upsert. */
export function useSaveBalancingPrice(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: BalancingSaveArgs) => {
      const fields: Record<string, unknown> = {
        [BALANCING_COL.name]: a.name,
        [BALANCING_COL.periods]: a.periods,
        [BALANCING_COL.price]: a.price,
        [BALANCING_COL.startDate]: a.startDate?.toISOString() ?? null,
        [BALANCING_COL.endDate]: a.endDate?.toISOString() ?? null,
        [BALANCING_COL.durationYears]: a.durationYears,
        [BALANCING_COL.durationMonths]: a.durationMonths,
        [BALANCING_COL.shiftOfCod]: a.shiftOfCodMonths,
        [`${BALANCING_COL.project}@odata.bind`]: `/vsb_projects(${a.projectId})`,
      };
      return a.id
        ? (await balancingPriceRepo.update(a.id, fields), a.id)
        : balancingPriceRepo.create(fields);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("balancingPrices", projectId ?? "none") });
    },
  });
}

export function useDeleteBalancingPrice(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => balancingPriceRepo.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("balancingPrices", projectId ?? "none") });
    },
  });
}

/** `Language()` — read once, passed explicitly into every rule so the rules stay pure. */
export const useLocale = (): string =>
  useMemo(() => browserLocale(), []);
