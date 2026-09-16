/**
 * Project General Milestones Screen — queries and mutations.
 *
 * Canvas screen: `Project General Milestones Screen` (PM app)
 *   137 controls · 4 288 lines of Power Fx · 45 substantive blocks · band L
 *
 * `colMilestonesAssumptions` was a whole-table `ClearCollect` in `App.OnStart`; here it is
 * one filtered row with a long `staleTime`. `Filter('Project Revenues', ...)` for the COD
 * guard becomes a server-side `$count`, not a materialised collection.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, projectStateRepo, milestoneAssumptionRepo,
  estimationPriceInflationRepo, assumptionsRevenuesRepo, currencyRepo,
  revenueSubaccountRepo, projectRevenueRepo, generatorTypeInProjectRepo,
  generatorTypeRepo, type ProjectRow,
} from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { ES, CHOICE } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { technologyLabel, technologyValue } from "@/domain/technology";
import { useAppStore } from "@/store/appStore";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  AVERAGE_DURATION_MONTHS, accumulatedIndex, repriceGenerators,
  needsPlantCostRecalculation, buildDefaultRevenue, planSaveMilestones, milestoneLabels,
  type MilestoneProject, type MilestoneAssumptionRow, type MilestoneDates,
  type MilestonesForm, type PriceInflationRow, type ProjectGenerator,
  type RevenueAssumptionRow, type ProjectRevenueDraft, type MilestoneSavePlan,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/* ─────────────────────────────────────────────────────────────────── mapping */

export function toMilestoneProject(r: ProjectRow | undefined): MilestoneProject | null {
  if (!r) return null;
  const dates: MilestoneDates = {
    StartDate: str(r[PROJECT_COL.projectStartDate]),
    FeasibilityStudies: str(r[PROJECT_COL.feasibilityStudies]),
    ProjectDevelopmentStarted: str(r[PROJECT_COL.projectDevelopmentStarted]),
    ApplicationSubmitted: str(r[PROJECT_COL.applicationSubmitted]),
    LegallyBindingPermits: str(r[PROJECT_COL.legallyBindingPermits]),
    FinalInvestmentDecision: str(r[PROJECT_COL.fid]),
    Construction: str(r[PROJECT_COL.construction]),
    OperationsStartDate: str(r[PROJECT_COL.cod]),
    EndDate: str(r[PROJECT_COL.endDate]),
    SalesStartDate: str(r[PROJECT_COL.salesStartDate]),
    StartCompleted: str(r[PROJECT_COL.salesCompleted]),
  };
  return {
    id: r.vsb_projectid,
    name: r.vsb_name,
    projectNumber: r.vsb_internalprojectid,
    clusterStateName:
      str(r["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"]),
    countryId: r._vsb_country_value,
    countryName: str(r["_vsb_country_value@OData.Community.Display.V1.FormattedValue"]),
    countryBusinessUnitId: str(r["_owningbusinessunit_value"]),
    areaName: str(r["_vsb_countryarea_value@OData.Community.Display.V1.FormattedValue"]),
    // `MilestoneProject.technology` is a LABEL — `rules.ts` branches on `=== "PV"` and
    // `=== "Wind"` in six places. `vsb_technology` is a choice, so reading the column straight
    // into it made every one of those comparisons false. Resolve it here.
    technology:
      technologyLabel(
        r.vsb_technology,
        r["vsb_technology@OData.Community.Display.V1.FormattedValue"],
      ) || null,
    startCluster: num(r[PROJECT_COL.startCluster]),
    acquisitionDate: str(r[PROJECT_COL.acquisitionDate]),
    shareOfFarmdown: num(r[PROJECT_COL.shareOfFarmdown]),
    isStandardShareOfFarmdown: bool(r[PROJECT_COL.isStandardShareOfFarmdown]),
    createdOn: str(r["createdon"]),
    modifiedOn: str(r.modifiedon),
    dates,
    standardAssumption: {
      ProjectDevelopmentStarted: r[PROJECT_COL.isProjectDevelopmentStd] === true,
      ApplicationSubmitted: r[PROJECT_COL.isApplicationSubmittedStd] === true,
      LegallyBindingPermits: r[PROJECT_COL.isLegallyBindingPermitsStd] === true,
      FinalInvestmentDecision: r[PROJECT_COL.isFidStd] === true,
      Construction: r[PROJECT_COL.isConstructionStd] === true,
      OperationsStartDate: r[PROJECT_COL.isCodStd] === true,
      EndDate: r[PROJECT_COL.isEndDateStd] === true,
      SalesStartDate: r[PROJECT_COL.isSalesStartStd] === true,
      StartCompleted: r[PROJECT_COL.isSalesCompletedStd] === true,
    },
  };
}

/* ────────────────────────────────────────────────────────── reference queries */

const REF_STALE = 30 * 60_000;

/**
 * Rule 10 — the single `Milestones Standard Assumptions` row for the project's country and
 * technology, `Name = "average duration [months]"`. Filtered on the server; the canvas
 * pulled the whole table into `colMilestonesAssumptions` on app start.
 */
export function useMilestoneAssumption(countryId: string | null, technology: string | null) {
  // The caller holds a label; `vsb_technology` on the assumptions table is the same choice as
  // on Projects, so the comparison has to be against the integer. Comparing the label was a
  // filter that quietly matched nothing.
  const techValue = technologyValue(technology);
  return useQuery({
    queryKey: ["ref", "milestoneAssumption", countryId ?? "", techValue ?? ""] as const,
    enabled: Boolean(countryId && techValue !== null),
    staleTime: REF_STALE,
    queryFn: async (): Promise<MilestoneAssumptionRow | null> => {
      const row = await milestoneAssumptionRepo.getOne(
        f.and(
          f.eq("vsb_name", AVERAGE_DURATION_MONTHS),
          f.guid("_vsb_country_value", countryId!),
          f.eq("vsb_technology", techValue!),
        )!,
      );
      if (!row) return null;
      return {
        cluster1: num(row["vsb_cluster1"]),
        cluster2: num(row["vsb_cluster2"]),
        cluster3: num(row["vsb_cluster3"]),
        cluster4: num(row["vsb_cluster4"]),
        cluster5: num(row["vsb_cluster5"]),
        cluster6: num(row["vsb_cluster6"]),
      };
    },
  });
}

/** Rule 3 — milestone labels from `Project States`, sorted numerically (defect fixed). */
export function useMilestoneLabels() {
  const q = useQuery({
    queryKey: ["ref", "projectStates"] as const,
    queryFn: () => projectStateRepo.listAll({ orderBy: [asc("vsb_order")] }),
    staleTime: REF_STALE,
  });
  const labels = useMemo(() => milestoneLabels((q.data ?? []).map((r) => ({
    name: String(r["vsb_name"] ?? ""),
    order: num(r["vsb_order"]) ?? 0,
    isVisibleOnChecklist: r["vsb_isvisibleonchecklist"] === true,
    clusterDescription: str(r["vsb_clusterdescription"]),
  }))), [q.data]);
  return { labels, isLoading: q.isLoading };
}

/**
 * Rule 16's guard — `CountRows(Filter('Project Revenues', 'Hedge Type' = Individual
 * Volumes, Project = …, 'Is Contract Start Date Standard Assumption?' = Yes))`.
 * Answered by the server with `$count`, never by pulling the rows.
 */
export function useIndividualVolumeContractCount(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.child("projectRevenues.individualVolumes", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<number> => {
      const page = await dataClient.list<Record<string, unknown>>(ES.projectRevenues, {
        select: ["vsb_projectrevenueid"],
        filter: f.and(
          f.guid("_vsb_project_value", projectId!),
          f.eq("vsb_hedgetype", CHOICE.hedgingType.individualVolumes),
          f.eq("vsb_iscontractstartdatestandardassumption", true),
        ),
        count: true,
        top: 1,
      });
      return page.totalCount ?? page.rows.length;
    },
  });
}

/** Rule 20's gate — how many `Project Revenues` rows the project already has. */
export function useRevenueRowCount(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.child("projectRevenues.count", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<number> => {
      const page = await projectRevenueRepo.list({
        filter: f.guid("_vsb_project_value", projectId!),
        select: ["vsb_projectrevenueid"],
        count: true,
        top: 1,
      });
      return page.totalCount ?? page.rows.length;
    },
  });
}

/** Rules 21–28 — the country's `Assumptions Revenues SQL` rows. */
export function useRevenueAssumptions(countryName: string | null) {
  return useQuery({
    queryKey: ["ref", "assumptionsRevenues", countryName ?? ""] as const,
    enabled: Boolean(countryName),
    staleTime: REF_STALE,
    queryFn: async (): Promise<RevenueAssumptionRow[]> => {
      const rows = await assumptionsRevenuesRepo.listAll({
        filter: f.eq("country", countryName!),
      });
      return rows.map((r) => ({
        country: String(r["country"] ?? ""),
        valuetype: String(r["valuetype"] ?? ""),
        category: str(r["category"]),
        pv: r["pv"] === null || r["pv"] === undefined ? null : String(r["pv"]),
        wind: r["wind"] === null || r["wind"] === undefined ? null : String(r["wind"]),
      }));
    },
  });
}

export function useRevenueSeedRefs() {
  const currency = useQuery({
    queryKey: ["ref", "currency", "EUR"] as const,
    staleTime: REF_STALE,
    queryFn: () => currencyRepo.getOne(f.eq("vsb_currencycode", "EUR")),
  });
  const subaccount = useQuery({
    queryKey: ["ref", "revenueSubaccounts"] as const,
    staleTime: REF_STALE,
    queryFn: () => revenueSubaccountRepo.listAll({ orderBy: [asc("vsb_order")] }),
  });
  return {
    currencyId: currency.data?.vsb_currencyid ?? null,
    subaccountId: subaccount.data?.[0]?.vsb_revenuesubaccountid ?? null,
  };
}

/* ────────────────────────────────────────────────── the FID-driven re-pricing */

/**
 * Rule 13 — the project's generators, joined to their `Generators` price ladder so
 * `repriceGenerators` can run without another round trip per row.
 */
export function useProjectGeneratorsForRepricing(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.child("generatorTypeInProjects.repricing", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectGenerator[]> => {
      const rows = await generatorTypeInProjectRepo.byProject(projectId!);
      const typeIds = [...new Set(
        rows.map((r) => str(r["_vsb_generatortype_value"])).filter((x): x is string => !!x),
      )];
      const types = typeIds.length
        ? await generatorTypeRepo.listAll({ filter: f.inList("vsb_generatortypeid", typeIds) })
        : [];
      const byId = new Map(types.map((t) => [String(t["vsb_generatortypeid"]), t]));

      return rows.map((r) => {
        const t = byId.get(str(r["_vsb_generatortype_value"]) ?? "") ?? {};
        return {
          id: String(r["vsb_generatortypeinprojectid"]),
          count: num(r["vsb_count"]) ?? 0,
          wtgPrices: [
            num(t["vsb_price1wtg"]), num(t["vsb_price2wtg"]), num(t["vsb_price3wtg"]),
            num(t["vsb_price4wtg"]), num(t["vsb_price5wtg"]),
          ],
          additionalFoundationCost: num(t["vsb_additionalfoundationcost"]),
          foundationCostIncluded: t["vsb_foundationcostincluded"] === true,
          generatorsCost: num(r["vsb_totalcosteur"]) ?? 0,
        };
      });
    },
  });
}

/** `Estimation Price Inflations` rows for `Year(FID)` and `Year(FID) - 1`. */
export function usePriceInflation(fid: string | null) {
  const year = fid ? new Date(fid).getFullYear() : null;
  return useQuery({
    queryKey: ["ref", "priceInflation", year ?? 0] as const,
    enabled: year !== null && Number.isFinite(year),
    staleTime: REF_STALE,
    queryFn: async (): Promise<{ current: PriceInflationRow | null; previous: PriceInflationRow | null }> => {
      const rows = await estimationPriceInflationRepo.listAll({
        filter: f.inList("vsb_fidyear", [year!, year! - 1]),
      });
      const map = (y: number): PriceInflationRow | null => {
        const r = rows.find((x) => x.vsb_fidyear === y);
        return r ? {
          fidYear: r.vsb_fidyear,
          annualIndex: r.vsb_annualpriceescalationindex,
          accumulatedIndex: r.vsb_accumulatedpriceescalationindex,
        } : null;
      };
      return { current: map(year!), previous: map(year! - 1) };
    },
  });
}

/**
 * Rule 13 as a callable — returns the re-priced generators and the recalculation flag.
 * Pure inputs in, pure outputs out; the queries above supply the inputs.
 */
export function computeFidRepricing(args: {
  storedFid: string | null;
  selectedFid: string | null;
  generators: ProjectGenerator[];
  inflation: { current: PriceInflationRow | null; previous: PriceInflationRow | null };
}): { needsPlantCostRecalculation: boolean; generators: ProjectGenerator[]; index: number } {
  const needed = needsPlantCostRecalculation(args.storedFid, args.selectedFid);
  if (!needed) {
    return { needsPlantCostRecalculation: false, generators: args.generators, index: 1 };
  }
  const index = accumulatedIndex(args.selectedFid, args.inflation.current, args.inflation.previous);
  // The canvas logged every intermediate value into `colLogs` and rendered it into a
  // dialog. Structured telemetry instead — same information, not in the user's face.
  trace("information", "milestones/fid re-pricing", {
    storedFid: args.storedFid, selectedFid: args.selectedFid, index,
    generators: args.generators.length,
  });
  return {
    needsPlantCostRecalculation: true,
    generators: repriceGenerators(args.generators, index),
    index,
  };
}

/* ─────────────────────────────────────────────────────────────── the save call */

export interface SaveMilestonesArgs {
  project: MilestoneProject;
  form: MilestonesForm;
  repricedGenerators: ProjectGenerator[] | null;
  revenueDraft: ProjectRevenueDraft | null;
  language: string;
}

export interface SaveMilestonesOutcome {
  projectId: string;
  steps: string[];
  plan: MilestoneSavePlan;
}

export async function saveMilestones(
  args: SaveMilestonesArgs,
): Promise<Result<SaveMilestonesOutcome>> {
  if (!args.project.id) {
    return err(toAppError(
      { status: 400, message: "The project must be saved on General Data first." },
      "milestones/save",
    ));
  }
  try {
    const plan = planSaveMilestones({
      project: args.project,
      form: args.form,
      repricedGenerators: args.repricedGenerators,
      revenueDraft: args.revenueDraft,
      language: args.language,
    });
    // One bounded fan-out for every write in the plan. `repo.saveMany` is this with the
    // entity set pinned; the plan spans Projects, GeneratorTypeInProjects and
    // Project Revenues, so it uses the shared primitive.
    await dataClient.batch(plan.writes);
    return ok({ projectId: args.project.id, steps: plan.log, plan });
  } catch (e) {
    return err(toAppError(e, "milestones/save"));
  }
}

export function useSaveMilestones() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveMilestonesArgs) => {
      const res = await saveMilestones(args);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: qk.projects.one(out.projectId) });
      void qc.invalidateQueries({ queryKey: qk.child("projectRevenues.count", out.projectId) });
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypeInProjects.repricing", out.projectId) });
    },
  });
}

/** Everything the screen needs, assembled. */
export function useMilestonesData(projectId: string | undefined) {
  const user = useAppStore((s) => s.session.user);
  const project = useQuery({
    queryKey: qk.projects.one(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!),
  });
  const record = useMemo(() => toMilestoneProject(project.data), [project.data]);
  return {
    project: record,
    language: user?.language ?? "en-US",
    isLoading: project.isLoading,
  };
}

/**
 * Rule 20's seed, assembled from the queries above. Returns `null` whenever the seed must
 * not run — the decision itself is `buildDefaultRevenue`, which is pure.
 */
export function useDefaultRevenueDraft(
  project: MilestoneProject | null,
  dates: MilestoneDates,
): ProjectRevenueDraft | null {
  const assumptions = useRevenueAssumptions(project?.countryName ?? null);
  const count = useRevenueRowCount(project?.id ?? undefined);
  const refs = useRevenueSeedRefs();

  return useMemo(() => {
    if (!project || count.data === undefined || !assumptions.data) return null;
    return buildDefaultRevenue({
      project,
      dates,
      assumptions: assumptions.data,
      existingRevenueCount: count.data,
      currencyId: refs.currencyId,
      subaccountId: refs.subaccountId,
      owningBusinessUnitId: project.countryBusinessUnitId,
    });
  }, [project, dates, assumptions.data, count.data, refs.currencyId, refs.subaccountId]);
}
