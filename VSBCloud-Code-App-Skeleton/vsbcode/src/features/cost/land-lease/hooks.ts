/**
 * Land Lease Costs Screen — queries and mutations.
 *
 * Canvas screen: `Land Lease Costs Screen` (Project Costs app)
 *   201 controls · 6 169 lines of Power Fx · 61 substantive blocks · band L
 *
 * The canvas `OnVisible` ran a four-branch `Concurrent(...)` and loaded the periods with
 * `Filter('Land Lease Periods', 'Project Cost'.'Land Lease Project Cost' in
 * colLandLeaseProjectCosts…)` — a client-side join over a materialised collection. Here the
 * periods come back with one `$filter` on the parent cost ids that the project query
 * already produced, so nothing is fetched to be filtered in the browser.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  landLeaseSubaccountRepo, landLeaseCostFullRepo, landLeasePeriodRepo,
  landLeaseAllocationRepo, generatorInProjectFullRepo, opexLandLeaseAssumptionRepo,
  countryInflationProfileRepo,
} from "@/data/repos";
import { dataClient, type WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { ES_COST, CHOICE_COST } from "@/data/entities";
import {
  orderedSubaccounts, generatorOptions,
  type LandLeaseSubaccount, type LandLeaseCost, type LandLeasePeriod,
  type AllocationRow, type LandLeaseAssumption, type GeneratorOption,
} from "./rules";

/* ══════════════════════════════════════════════════════════════════ columns ════ */

export const LEASE_COST_COL = {
  id: "vsb_landleaseprojectcostid", name: "vsb_name", description: "vsb_description",
  project: "_vsb_project_value", subaccount: "_vsb_subaccount_value",
  landOwner: "vsb_landowner", currency: "_vsb_currency_value", secured: "vsb_secured",
  allWtg: "vsb_allwtgallocated", isStandard: "vsb_isstandardcontract",
  isStartDateStandard: "vsb_isstartdatestandardassumption",
  amount: "vsb_amountonetimepayment", amount2: "vsb_amountonetimepayment2",
  amount3: "vsb_amountonetimepayment3", dueDate: "vsb_duedateonetimepayment",
  dueDate2: "vsb_duedateonetimepayment2", dueDate3: "vsb_duedateonetimepayment3",
  useInflation: "vsb_useinflationprofile",
  useCountryInflation: "vsb_usecountryinflationprofile",
  inflationProfile: "vsb_inflationprofile",
  inflationCountryArea: "vsb_inflationcountryarea",
  inflationStartYear: "vsb_inflationstartyear",
} as const;

export const LEASE_PERIOD_COL = {
  id: "vsb_landleaseperiodid", name: "vsb_name", cost: "_vsb_projectcost_value",
  period: "vsb_period", startDate: "vsb_startdate", fixedCosts: "vsb_fixedcosts",
  aggregation: "vsb_aggregation", eurMw: "vsb_eurmw", eurMwh: "vsb_eurmwh",
  eurWtg: "vsb_eurwtg", percentOfRevenues: "vsb_ofrevenues",
  frequency: "vsb_distributionfrequency",
  years: "vsb_landleasedurationyears", months: "vsb_landleasedurationmonths",
} as const;

export const LEASE_ALLOC_COL = {
  id: "vsb_landleaseallocationwtgid", name: "vsb_name",
  cost: "_vsb_projectcost_value", generator: "_vsb_generatorinproject_value",
} as const;

/* ══════════════════════════════════════════════════════════════════ mappers ════ */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;

export const toSubaccount = (r: Record<string, unknown>) => ({
  id: String(r.vsb_landleasesubaccountid ?? ""),
  name: String(r.vsb_name ?? ""),
  order: num(r.vsb_order) ?? 0,
});

export const toLeaseCost = (r: Record<string, unknown>): LandLeaseCost => ({
  id: String(r[LEASE_COST_COL.id] ?? ""),
  name: String(r[LEASE_COST_COL.name] ?? ""),
  description: String(r[LEASE_COST_COL.description] ?? ""),
  subaccountId: str(r[LEASE_COST_COL.subaccount]),
  landOwner: str(r[LEASE_COST_COL.landOwner]),
  currencyId: str(r[LEASE_COST_COL.currency]),
  secured: num(r[LEASE_COST_COL.secured]),
  allWtgAllocated: bool(r[LEASE_COST_COL.allWtg]),
  isStandardContract: bool(r[LEASE_COST_COL.isStandard]),
  isStartDateStandardAssumption: bool(r[LEASE_COST_COL.isStartDateStandard]),
  amountOneTimePayment: num(r[LEASE_COST_COL.amount]),
  amountOneTimePayment2: num(r[LEASE_COST_COL.amount2]),
  amountOneTimePayment3: num(r[LEASE_COST_COL.amount3]),
  dueDateOneTimePayment: str(r[LEASE_COST_COL.dueDate]),
  dueDateOneTimePayment2: str(r[LEASE_COST_COL.dueDate2]),
  dueDateOneTimePayment3: str(r[LEASE_COST_COL.dueDate3]),
  useInflationProfile: bool(r[LEASE_COST_COL.useInflation]),
  useCountryInflationProfile: bool(r[LEASE_COST_COL.useCountryInflation]),
  inflationProfile: num(r[LEASE_COST_COL.inflationProfile]),
  inflationCountryArea: num(r[LEASE_COST_COL.inflationCountryArea]),
  inflationStartYear: num(r[LEASE_COST_COL.inflationStartYear]),
});

export const toLeasePeriod = (r: Record<string, unknown>): LandLeasePeriod => ({
  id: String(r[LEASE_PERIOD_COL.id] ?? ""),
  name: String(r[LEASE_PERIOD_COL.name] ?? ""),
  projectCostId: str(r[LEASE_PERIOD_COL.cost]),
  period: num(r[LEASE_PERIOD_COL.period]),
  startDate: str(r[LEASE_PERIOD_COL.startDate]),
  durationYears: num(r[LEASE_PERIOD_COL.years]),
  durationMonths: num(r[LEASE_PERIOD_COL.months]),
  fixedCosts: num(r[LEASE_PERIOD_COL.fixedCosts]),
  percentOfRevenues: num(r[LEASE_PERIOD_COL.percentOfRevenues]),
  eurPerMwh: num(r[LEASE_PERIOD_COL.eurMwh]),
  eurPerMw: num(r[LEASE_PERIOD_COL.eurMw]),
  eurPerWtg: num(r[LEASE_PERIOD_COL.eurWtg]),
  aggregation: num(r[LEASE_PERIOD_COL.aggregation]),
  distributionFrequency: num(r[LEASE_PERIOD_COL.frequency]),
});

export const toAllocation = (r: Record<string, unknown>): AllocationRow => ({
  id: String(r[LEASE_ALLOC_COL.id] ?? ""),
  projectCostId: str(r[LEASE_ALLOC_COL.cost]),
  generatorInProjectId: str(r[LEASE_ALLOC_COL.generator]),
});

export const toLeaseAssumption = (r: Record<string, unknown>): LandLeaseAssumption => ({
  id: String(r.vsb_opexlandleasestandardassumptionsid ?? ""),
  period: num(r.vsb_period) ?? 0,
  description: String(r.vsb_description ?? ""),
  durationYears: num(r.vsb_durationinyears),
  durationMonths: num(r.vsb_durationinmonths),
  aggregation: num(r.vsb_aggregation),
  secured: bool(r.vsb_secured),
  allWtgAllocated: bool(r.vsb_allwtgallocated),
  fixCosts: num(r.vsb_fixcosts),
  percentOfRevenues: num(r.vsb_ofrevenues),
  eurPerMwh: num(r.vsb_eurmwh),
  eurPerMw: num(r.vsb_eurmw),
  eurPerWtg: num(r.vsb_eurwtg),
  amountOneTimePayment: num(r.vsb_amountonetimepayment),
  amountOneTimePayment2: num(r.vsb_amountonetimepayment2),
  amountOneTimePayment3: num(r.vsb_amountonetimepayment3),
  distributionFrequency: num(r.vsb_distributionfrequency),
  useInflationProfile: bool(r.vsb_useinflationprofile),
  useCountryInflationProfile: bool(r.vsb_usecountryinflationprofile),
  inflationProfile: num(r.vsb_inflationprofile),
});

/* ═══════════════════════════════════════════════════════════════ query keys ════ */

export const leaseKeys = {
  all: (projectId: string) => ["landLease", projectId] as const,
  subaccounts: ["landLease", "subaccounts"] as const,
  costs: (projectId: string) => ["landLease", projectId, "costs"] as const,
  periods: (projectId: string) => ["landLease", projectId, "periods"] as const,
  allocations: (projectId: string) => ["landLease", projectId, "allocations"] as const,
  generators: (projectId: string) => ["landLease", projectId, "generators"] as const,
  assumptions: (countryId: string | null) =>
    ["landLease", "assumptions", countryId ?? ""] as const,
  inflation: (countryId: string | null, year: number | null) =>
    ["landLease", "inflation", countryId ?? "", year ?? 0] as const,
} as const;

/* ══════════════════════════════════════════════════════════════════ queries ════ */

export function useLeaseSubaccounts() {
  const q = useQuery({
    queryKey: leaseKeys.subaccounts,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      orderedSubaccounts(
        (await landLeaseSubaccountRepo.listAll({ orderBy: [asc("vsb_order")] }))
          .map(toSubaccount),
      ),
  });
  return { subaccounts: (q.data ?? []) as LandLeaseSubaccount[], isLoading: q.isLoading };
}

/** The costs and their periods — the periods filtered by the cost ids, server-side. */
export function useLeaseContracts(projectId: string | undefined) {
  const costsQ = useQuery({
    queryKey: leaseKeys.costs(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: async () => (await landLeaseCostFullRepo.byProject(projectId!)).map(toLeaseCost),
  });
  const costIds = (costsQ.data ?? []).map((c) => c.id);

  const periodsQ = useQuery({
    queryKey: [...leaseKeys.periods(projectId ?? ""), costIds.join(",")],
    enabled: costIds.length > 0,
    queryFn: async () =>
      (await landLeasePeriodRepo.listAll({
        filter: f.inList(LEASE_PERIOD_COL.cost, costIds),
      })).map(toLeasePeriod),
  });

  const allocationsQ = useQuery({
    queryKey: [...leaseKeys.allocations(projectId ?? ""), costIds.join(",")],
    enabled: costIds.length > 0,
    queryFn: async () =>
      (await landLeaseAllocationRepo.listAll({
        filter: f.inList(LEASE_ALLOC_COL.cost, costIds),
      })).map(toAllocation),
  });

  return {
    costs: costsQ.data ?? [],
    periods: periodsQ.data ?? [],
    allocations: allocationsQ.data ?? [],
    isLoading: costsQ.isLoading || periodsQ.isLoading,
  };
}

/** The WTG / PV picker list (rule: generators labelled `name - status`, PV by label). */
export function useGeneratorOptions(projectId: string | undefined) {
  const q = useQuery({
    queryKey: leaseKeys.generators(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await generatorInProjectFullRepo.byProject(projectId!);
      return generatorOptions(
        rows.map((r) => ({
          id: String(r.vsb_generatorinprojectid ?? ""),
          name: String(r.vsb_name ?? ""),
          status: num(r.statecode) === CHOICE_COST.status.active ? "Active" : "Inactive",
        })),
        [],
      );
    },
  });
  return { generators: (q.data ?? []) as GeneratorOption[], isLoading: q.isLoading };
}

/** `OPEX & Land Lease Standard Assumptions` of type `'Contract Types'.Landlease`. */
export function useLeaseAssumptions(countryId: string | null | undefined) {
  const q = useQuery({
    queryKey: leaseKeys.assumptions(countryId ?? null),
    enabled: Boolean(countryId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await opexLandLeaseAssumptionRepo.listAll({
        filter: f.and(
          f.guid("_vsb_country_value", countryId!),
          f.eq("vsb_typeofcontract", CHOICE_COST.typeOfContract.landlease),
        ),
      })).map(toLeaseAssumption),
  });
  return { assumptions: q.data ?? [], isLoading: q.isLoading };
}

export function useCountryInflation(countryId: string | null, year: number | null) {
  const q = useQuery({
    queryKey: leaseKeys.inflation(countryId, year),
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
 * One `$batch` per operation: the cost upsert (only when rule 2 permits), the allocation
 * diff and the period upsert; or, for a Period-1 delete, the allocations, the periods and
 * the cost together.
 */
export function useLeaseBatch(projectId: string | undefined, source: string) {
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
    // Rule 20 — after every save both collections reload and the selection clears.
    onSuccess: () => {
      if (projectId) void qc.invalidateQueries({ queryKey: leaseKeys.all(projectId) });
    },
  });
}

export const LEASE_ENTITY = {
  cost: ES_COST.landLeaseProjectCosts,
  period: ES_COST.landLeasePeriods,
  allocation: ES_COST.landLeaseAllocationWtgs,
} as const;
