/**
 * Opex Costs Screen — queries and mutations, shared by both rail modes.
 *
 * Canvas screen: `Opex Costs Screen` (Project Costs app)
 *   230 controls · 8 147 lines of Power Fx · 65 substantive blocks · band L
 *
 * `listProjectCosts(projectId)` is ONE `$filter`. The canvas materialised every
 * `Opex Project Costs` row into `colOpexProjectCosts` and re-filtered it inside each
 * gallery — the delegation workaround this replaces.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  opexAccountRepo, costOpexSubaccountRepo, opexProjectCostFullRepo,
  deviceTypeInProjectRepo, generatorTypeInProjectRepo, pvModuleTypeInProjectRepo,
  opexLandLeaseAssumptionRepo, countryInflationProfileRepo,
} from "@/data/repos";
import { dataClient, type WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { ES_COST } from "@/data/entities";
import {
  deviceTypeList,
  type OpexAccount, type OpexSubaccount, type OpexCost, type DeviceTypeInProject,
  type OpexAssumption, type OpexMode,
} from "./rules";

/* ══════════════════════════════════════════════════════════════════ columns ════ */

export const OPEX_COST_COL = {
  id: "vsb_opexprojectcostid", name: "vsb_name", description: "vsb_description",
  project: "_vsb_project_value", subaccount: "_vsb_subaccount_value",
  device: "_vsb_devicetypeinproject_value", parent: "_vsb_parentcost_value",
  startDate: "vsb_startdate", years: "vsb_opexprojectdurationyears",
  months: "vsb_opexprojectdurationmonths", currency: "_vsb_currency_value",
  fixCosts: "vsb_fixcosts", percentOfRevenues: "vsb_ofrevenues",
  eurMwh: "vsb_eurmwh", eurMw: "vsb_eurmw", eurWtg: "vsb_eurwtg",
  aggregation: "vsb_aggregation", frequency: "vsb_distributionfrequency",
  threshold: "vsb_threshold", thresholdType: "vsb_thresholdtype",
  thresholdIndividual: "vsb_thresholdindividual",
  useInflation: "vsb_useinflationprofile",
  useCountryInflation: "vsb_usecountryinflationprofile",
  inflationProfile: "vsb_inflationprofile", inflationStartYear: "vsb_inflationstartyear",
  inflationCountryArea: "vsb_inflationcountryarea",
  alignWithProjectDuration: "vsb_alignwithprojectduration",
  externalContract: "vsb_externalcontract",
  isStandard: "vsb_isstandardcontract",
  isStartDateStandard: "vsb_isstartdatestandardassumption",
} as const;

const SUB_COL = {
  id: "vsb_opexsubaccountid", name: "vsb_name", order: "vsb_order",
  account: "_vsb_account_value",
} as const;

const ASSUMPTION_COL = {
  id: "vsb_opexlandleasestandardassumptionsid", period: "vsb_period",
  type: "vsb_typeofcontract", country: "_vsb_country_value", technology: "vsb_technology",
  opexSubaccount: "_vsb_opexsubaccount_value", description: "vsb_description",
  years: "vsb_durationinyears", months: "vsb_durationinmonths",
} as const;

/* ══════════════════════════════════════════════════════════════════ mappers ════ */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;

export const toOpexAccount = (r: Record<string, unknown>): OpexAccount => ({
  id: String(r.vsb_opexaccountid ?? ""),
  name: String(r.vsb_name ?? ""),
  order: num(r.vsb_order) ?? 0,
});

export const toOpexSubaccount = (r: Record<string, unknown>): OpexSubaccount => ({
  id: String(r[SUB_COL.id] ?? ""),
  name: String(r[SUB_COL.name] ?? ""),
  order: num(r[SUB_COL.order]) ?? 0,
  accountId: str(r[SUB_COL.account]),
  accountName: str(r[`${SUB_COL.account}@OData.Community.Display.V1.FormattedValue`]),
});

export const toOpexCost = (r: Record<string, unknown>): OpexCost => ({
  id: String(r[OPEX_COST_COL.id] ?? ""),
  name: String(r[OPEX_COST_COL.name] ?? ""),
  description: String(r[OPEX_COST_COL.description] ?? ""),
  parentCostId: str(r[OPEX_COST_COL.parent]),
  subaccountId: str(r[OPEX_COST_COL.subaccount]),
  deviceTypeInProjectId: str(r[OPEX_COST_COL.device]),
  startDate: str(r[OPEX_COST_COL.startDate]),
  durationYears: num(r[OPEX_COST_COL.years]),
  durationMonths: num(r[OPEX_COST_COL.months]),
  currencyId: str(r[OPEX_COST_COL.currency]),
  fixCosts: num(r[OPEX_COST_COL.fixCosts]),
  percentOfRevenues: num(r[OPEX_COST_COL.percentOfRevenues]),
  eurPerMwh: num(r[OPEX_COST_COL.eurMwh]),
  eurPerMw: num(r[OPEX_COST_COL.eurMw]),
  eurPerWtg: num(r[OPEX_COST_COL.eurWtg]),
  aggregation: num(r[OPEX_COST_COL.aggregation]),
  distributionFrequency: num(r[OPEX_COST_COL.frequency]),
  threshold: bool(r[OPEX_COST_COL.threshold]),
  thresholdType: num(r[OPEX_COST_COL.thresholdType]),
  thresholdIndividual: num(r[OPEX_COST_COL.thresholdIndividual]),
  useInflationProfile: bool(r[OPEX_COST_COL.useInflation]),
  useCountryInflationProfile: bool(r[OPEX_COST_COL.useCountryInflation]),
  inflationProfile: num(r[OPEX_COST_COL.inflationProfile]),
  inflationStartYear: num(r[OPEX_COST_COL.inflationStartYear]),
  inflationCountryArea: num(r[OPEX_COST_COL.inflationCountryArea]),
  alignWithProjectDuration: bool(r[OPEX_COST_COL.alignWithProjectDuration]),
  externalContract: bool(r[OPEX_COST_COL.externalContract]),
  isStandardContract: bool(r[OPEX_COST_COL.isStandard]),
  isStartDateStandardAssumption: bool(r[OPEX_COST_COL.isStartDateStandard]),
});

export const toAssumption = (r: Record<string, unknown>): OpexAssumption => ({
  id: String(r[ASSUMPTION_COL.id] ?? ""),
  period: num(r[ASSUMPTION_COL.period]) ?? 0,
  durationYears: num(r[ASSUMPTION_COL.years]),
  durationMonths: num(r[ASSUMPTION_COL.months]),
  typeOfContract: num(r[ASSUMPTION_COL.type]),
  countryId: str(r[ASSUMPTION_COL.country]),
  technology: str(r[`${ASSUMPTION_COL.technology}@OData.Community.Display.V1.FormattedValue`]),
  opexSubaccountId: str(r[ASSUMPTION_COL.opexSubaccount]),
  description: String(r[ASSUMPTION_COL.description] ?? ""),
  fixCosts: num(r.vsb_fixcosts),
  percentOfRevenues: num(r.vsb_ofrevenues),
  eurPerMwh: num(r.vsb_eurmwh),
  eurPerMw: num(r.vsb_eurmw),
  eurPerWtg: num(r.vsb_eurwtg),
  aggregation: num(r.vsb_aggregation),
  distributionFrequency: num(r.vsb_distributionfrequency),
  threshold: bool(r.vsb_threshold),
  thresholdType: num(r.vsb_thresholdtype),
  thresholdIndividual: num(r.vsb_thresholdindividual),
  useInflationProfile: bool(r.vsb_useinflationprofile),
  useCountryInflationProfile: bool(r.vsb_usecountryinflationprofile),
  inflationProfile: num(r.vsb_inflationprofile),
  inflationCountryArea: num(r.vsb_inflationcountryarea),
  alignWithProjectDuration: bool(r.vsb_alignwithprojectduration),
  externalContract: bool(r.vsb_externalcontract),
});

/* ═══════════════════════════════════════════════════════════════ query keys ════ */

export const opexKeys = {
  all: (projectId: string) => ["opex", projectId] as const,
  accounts: ["opex", "accounts"] as const,
  subaccounts: ["opex", "subaccounts"] as const,
  costs: (projectId: string) => ["opex", projectId, "costs"] as const,
  devices: (projectId: string) => ["opex", projectId, "devices"] as const,
  assumptions: (mode: OpexMode, countryId: string | null) =>
    ["opex", "assumptions", mode, countryId ?? ""] as const,
  inflation: (countryId: string | null, year: number | null) =>
    ["opex", "inflation", countryId ?? "", year ?? 0] as const,
} as const;

/* ══════════════════════════════════════════════════════════════════ queries ════ */

export function useOpexAccounts() {
  const q = useQuery({
    queryKey: opexKeys.accounts,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await opexAccountRepo.listAll({ orderBy: [asc("vsb_order")] }))
        .map((r) => toOpexAccount(r as unknown as Record<string, unknown>)),
  });
  return { accounts: q.data ?? [], isLoading: q.isLoading };
}

/** In Other mode the sub-account list is filtered on the parent account's name. */
export function useOpexSubaccounts() {
  const q = useQuery({
    queryKey: opexKeys.subaccounts,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await costOpexSubaccountRepo.listAll({ orderBy: [asc(SUB_COL.order)] }))
        .map(toOpexSubaccount),
  });
  return { subaccounts: q.data ?? [], isLoading: q.isLoading };
}

/** One `$filter` for every cost row of the project — see the file header. */
export function useOpexCosts(projectId: string | undefined) {
  const q = useQuery({
    queryKey: opexKeys.costs(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await opexProjectCostFullRepo.byProject(projectId!)).map(toOpexCost),
  });
  return { costs: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** O&M mode only: the device types in the project (WTG types then PV module types). */
export function useDeviceTypes(projectId: string | undefined, mode: OpexMode) {
  const q = useQuery({
    queryKey: opexKeys.devices(projectId ?? ""),
    enabled: Boolean(projectId) && mode === "om",
    queryFn: async () => {
      const [devices, generators, pvTypes] = await Promise.all([
        deviceTypeInProjectRepo.listAll(),
        generatorTypeInProjectRepo.byProject(projectId!),
        pvModuleTypeInProjectRepo.byProject(projectId!),
      ]);
      const genIds = new Set(generators.map((g) => String(g.vsb_generatortypeinprojectid)));
      const pvIds = new Set(pvTypes.map((p) => String(p.vsb_pvmoduletypeinprojectid)));
      const createdOn = new Map(
        generators.map((g) => [
          String(g.vsb_generatortypeinprojectid), str(g.createdon),
        ]),
      );

      const shape = (r: Record<string, unknown>) => ({
        id: String(r.vsb_devicetypesinprojectid ?? ""),
        name: String(r.vsb_name ?? ""),
        typeInProjectId: str(r._vsb_typeinprojectid_value),
        createdOn: createdOn.get(String(r._vsb_typeinprojectid_value ?? "")) ?? null,
      });

      const mine = devices.filter((d) => {
        const t = String(d._vsb_typeinprojectid_value ?? "");
        return genIds.has(t) || pvIds.has(t);
      });
      return deviceTypeList(
        mine.filter((d) => genIds.has(String(d._vsb_typeinprojectid_value ?? ""))).map(shape),
        mine.filter((d) => pvIds.has(String(d._vsb_typeinprojectid_value ?? ""))).map(shape),
      );
    },
  });
  return { devices: (q.data ?? []) as DeviceTypeInProject[], isLoading: q.isLoading };
}

/** `OPEX & Land Lease Standard Assumptions`, scoped by country. Reference data. */
export function useOpexAssumptions(mode: OpexMode, countryId: string | null | undefined) {
  const q = useQuery({
    queryKey: opexKeys.assumptions(mode, countryId ?? null),
    enabled: Boolean(countryId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await opexLandLeaseAssumptionRepo.listAll({
        filter: f.guid(ASSUMPTION_COL.country, countryId!),
      })).map(toAssumption),
  });
  return { assumptions: q.data ?? [], isLoading: q.isLoading };
}

/** The country inflation for COD year + 1 (rule 10). */
export function useCountryInflation(countryId: string | null, year: number | null) {
  const q = useQuery({
    queryKey: opexKeys.inflation(countryId, year),
    enabled: Boolean(countryId) && year !== null,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const row = await countryInflationProfileRepo.getOne(
        f.and(f.guid("_vsb_country_value", countryId!), f.eq("vsb_year", year!)) ?? "",
      );
      return row?.vsb_inflation ?? null;
    },
  });
  return q.data ?? null;
}

/* ════════════════════════════════════════════════════════════════ mutations ════ */

/**
 * Every OPEX write is ONE `$batch` — the cost upsert plus rule 12's child cascade, or the
 * whole chain's delete. The canvas issues N+1 requests through `ForAll(… Patch(…))`.
 */
export function useOpexBatch(projectId: string | undefined, source: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (writes: WriteOp[]) => {
      if (writes.length === 0) return 0;
      try {
        trace("information", source, { writes: writes.length });
        await dataClient.batch(writes);
        return writes.length;
      } catch (e) {
        const err = toAppError(e, source);
        trace("error", source, { status: err.status, message: err.message });
        throw err;
      }
    },
    onSuccess: () => {
      if (projectId) void qc.invalidateQueries({ queryKey: opexKeys.all(projectId) });
    },
  });
}

export const OPEX_ENTITY = { cost: ES_COST.opexProjectCosts } as const;

/** Convenience: the costs of one scope, memoised. */
export function useScopedCosts(
  costs: OpexCost[],
  mode: OpexMode,
  scopeId: string | null,
): OpexCost[] {
  return useMemo(() => {
    if (!scopeId) return [];
    return mode === "om"
      ? costs.filter((c) => c.deviceTypeInProjectId === scopeId)
      : costs.filter((c) => c.subaccountId === scopeId);
  }, [costs, mode, scopeId]);
}
