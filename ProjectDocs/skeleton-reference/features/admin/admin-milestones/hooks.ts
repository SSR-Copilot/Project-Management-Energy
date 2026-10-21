/**
 * Admin Milestones Screen — queries and mutations.
 *
 * Canvas screen: `Admin Milestones Screen` (PM app)
 *   102 controls · 2 259 lines of Power Fx · 43 substantive blocks · band M
 *
 * `Refresh('Milestones Standard Assumptions')` after Save is COMMENTED OUT in the canvas
 * (rule 12), so the accordion grid showed stale values until the screen was revisited.
 * `useSaveMilestones` invalidates `['milestoneAssumptions', countryId]` instead.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { countryRepo, milestoneStandardAssumptionRepo, fabricSyncJobRepo } from "@/data/repos";
import { CHOICE_ADMIN } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import {
  MILESTONE_COL, FABRIC_JOB_COL, ACTIVE_JOB_STATES,
  type AssumptionRow, type CountryRow, type FabricJob, type WritePlan,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

const VALUE_COLUMNS = [
  MILESTONE_COL.cluster1, MILESTONE_COL.cluster2, MILESTONE_COL.cluster3,
  MILESTONE_COL.cluster4, MILESTONE_COL.cluster5, MILESTONE_COL.finalInvestmentDecision,
  MILESTONE_COL.operationalLifetime, MILESTONE_COL.salesStart, MILESTONE_COL.salesEnd,
];

export function toAssumptionRow(r: Record<string, unknown>): AssumptionRow {
  const values: Record<string, number | null> = {};
  for (const c of VALUE_COLUMNS) values[c] = num(r[c]);
  return {
    id: String(r[MILESTONE_COL.id] ?? ""),
    name: String(r[MILESTONE_COL.name] ?? ""),
    technology: num(r[MILESTONE_COL.technology]),
    countryId: str(r[MILESTONE_COL.country]),
    values,
  };
}

export const toCountryRow = (r: Record<string, unknown>): CountryRow => ({
  id: String(r["vsb_countryid"] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  order: num(r["vsb_order"]) ?? 0,
  // `Value(Key)` — the canvas coerces the text key to a number.
  key: r["vsb_key"] === undefined || r["vsb_key"] === null ? null : Number(r["vsb_key"]),
});

export const toFabricJob = (r: Record<string, unknown>): FabricJob => ({
  id: String(r[FABRIC_JOB_COL.id] ?? ""),
  regardingObjectId: str(r[FABRIC_JOB_COL.regardingObject]),
  jobTypeName: str(r[`${FABRIC_JOB_COL.jobType}@OData.Community.Display.V1.FormattedValue`]),
  jobStatus: num(r[FABRIC_JOB_COL.jobStatus]),
});

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

export const milestoneKeys = {
  countries: ["admin", "milestoneCountries"] as const,
  assumptions: (countryId: string) => ["milestoneAssumptions", countryId] as const,
  jobs: ["admin", "fabricMilestoneJobs"] as const,
} as const;

/* ═════════════════════════════════════════════════════════════════════ queries ════ */

/** The accordion axis — the whole `Countries` table, ordered by `Order`. */
export function useMilestoneCountries() {
  const q = useQuery({
    queryKey: milestoneKeys.countries,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await countryRepo.listAll({
        select: ["vsb_countryid", "vsb_name", "vsb_order", "vsb_key"],
        orderBy: [asc("vsb_order")],
      }) as unknown as Record<string, unknown>[]).map(toCountryRow),
  });
  return { countries: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** One country's rows, `$filter`ed on `Country` and `$orderby vsb_technology`. */
export function useCountryAssumptions(countryId: string | null) {
  const q = useQuery({
    queryKey: milestoneKeys.assumptions(countryId ?? "none"),
    enabled: Boolean(countryId),
    queryFn: async () =>
      (await milestoneStandardAssumptionRepo.listAll({
        filter: f.guid(MILESTONE_COL.country, countryId!),
        orderBy: [asc(MILESTONE_COL.technology)],
      })).map(toAssumptionRow),
  });
  return { rows: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/**
 * Rule 14's badge source, polled while any job is live.
 *
 * The three active states are pushed into `$filter`; the job TYPE is matched by name in
 * `isRecalculating` because the type is a lookup whose formatted value comes back with the
 * row. Polling stops as soon as nothing is active.
 */
export function useActiveFabricJobs() {
  const q = useQuery({
    queryKey: milestoneKeys.jobs,
    refetchInterval: (query) =>
      Array.isArray(query.state.data) && query.state.data.length > 0 ? 30_000 : false,
    queryFn: async () =>
      (await fabricSyncJobRepo.listAll({
        filter: f.inList(FABRIC_JOB_COL.jobStatus, [...ACTIVE_JOB_STATES]),
      })).map(toFabricJob),
  });
  return { jobs: q.data ?? [], isLoading: q.isLoading };
}

/** Exported so the badge test can assert the three states are the metadata ones. */
export const ACTIVE_JOB_STATE_VALUES = [
  CHOICE_ADMIN.jobStates.inDelay,
  CHOICE_ADMIN.jobStates.inProgress,
  CHOICE_ADMIN.jobStates.importing,
];

/* ═══════════════════════════════════════════════════════════════════ mutations ════ */

export async function runPlan(plan: WritePlan, source: string): Promise<Result<number>> {
  if (plan.refusedReason) {
    return err(toAppError({ status: 403, message: plan.refusedReason }, source));
  }
  if (plan.writes.length === 0) return ok(0);
  try {
    trace("information", source, { writes: plan.writes.length, log: plan.log });
    await dataClient.batch(plan.writes.map((w) => ({
      op: w.op, entitySet: w.entitySet, id: w.id, data: w.data,
    })));
    return ok(plan.writes.length);
  } catch (e) {
    const appError = toAppError(e, source);
    trace("error", source, { status: appError.status, message: appError.message });
    return err(appError);
  }
}

/** Rule 12's fix — the grid is invalidated, so the accordion never shows stale numbers. */
export function useSaveMilestones() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { plan: WritePlan; countryId: string }) => {
      const res = await runPlan(args.plan, "adminMilestones/save");
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_n, args) => {
      void qc.invalidateQueries({ queryKey: milestoneKeys.assumptions(args.countryId) });
    },
  });
}
