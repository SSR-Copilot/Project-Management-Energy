/**
 * Project General Milestones Screen — the data layer (connected 19 Oct 2026, D26).
 *
 * The reads live in `data/milestones.ts`; the project states reuse `data/generalData.ts`
 * (`listProjectStates`) and the assumption row reuses `data/costBook.ts`
 * (`loadMilestoneAssumptionValues`). The save is `planSaveMilestones` (`rules.ts`), run in order by
 * `usePlanWrite`: Patch Projects → (FID moved) each `GeneratorTypeInProjects` cost → a second
 * Patch Projects with `'Plant WTG Cost [EUR]'` — the canvas order (Y:352-474).
 *
 * SERVER AUTOMATION the writes fire (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified
 * 19 Oct 2026) — the client never does their work:
 *  - Plugin steps on `vsb_project` Update filtering on `vsb_operationsstartdatecod` (COD shift:
 *    senior-debt repayment rebalancing, balancing-price date sync, negative-price sync),
 *    `vsb_construction` (senior-debt financial-close shift) and `vsb_construction, vsb_enddate,
 *    vsb_operationsstartdatecod` (decommissioning date sync, async). Every save writes those three
 *    columns, as the canvas `Patch` does, so the plugins run on every save.
 *  - No flow: `UpdateTeamsandSPOSite` filters on `vsb_clusterstate` and
 *    `LoadDevexCapexCostTotalCapacityTrigger` on the plant CAPACITY columns — neither is written.
 *    `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers` is missing from the export.
 *  - `ForaProjecttriggerFabricDEVEX/CAPEXrecalculation` and its `Fabric Sync Jobs` insert are
 *    commented out in the canvas (Y:475-501) and are not called (`FABRIC_SYNC_NOTE`).
 *
 * NOT CONNECTED: the default `Project Revenues` seed — its assumptions are the Fabric SQL source
 * `Assumptions Revenues SQL` (D2). `planSaveMilestones` still takes a draft for when it is.
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN, ES_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { listProjectStates } from "@/data/generalData";
import { loadMilestoneAssumptionValues } from "@/data/costBook";
import {
  countIndividualVolumeContracts, countProjectRevenues, isMilestoneRecalculationRunning,
  listProjectGeneratorsForRepricing, loadMilestoneProject, loadPriceInflation,
} from "@/data/milestones";
import { projectSaveErrorText } from "@/features/pm/general-data/rules";
import {
  accumulatedIndex, milestoneLabels,
  type MilestoneAssumptionRow, type MilestoneProject, type ProjectGenerator,
} from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.countries,
  ES.projectStates,
  ES_ADMIN.milestonesStandardAssumptions,
  ES.projectRevenues,
  ES.estimationPriceInflations,
  ES.generatorTypeInProjects,
  ES_PLANT.generators,
  ES.fabricSyncJobs,
  ES.fabricJobTypes,
];

const REFERENCE_STALE = 30 * 60 * 1000;
const out = <T>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NO_LABELS: string[] = [];

/** `gblRecordSelectedProject` with the country's business unit. */
export function useMilestoneProject(projectId: string | undefined): ScreenData<MilestoneProject | null> {
  const q = useQuery({
    queryKey: qk.milestoneProject(projectId ?? ""),
    queryFn: () => loadMilestoneProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** `locRecordMilestoneNames` — the cluster captions (rule 3), from the shared `Project States` read. */
export function useMilestoneLabels(): ScreenData<string[]> {
  const q = useQuery({ queryKey: qk.generalDataProjectStates, queryFn: listProjectStates, staleTime: REFERENCE_STALE });
  return out({ ...q, data: q.data ? milestoneLabels(q.data) : undefined }, NO_LABELS);
}

/** The project's `"average duration [months]"` row — `undefined` → null when there is none. */
export function useMilestoneAssumption(
  countryId: string | null | undefined, technology: number | null | undefined,
): ScreenData<MilestoneAssumptionRow | null> {
  const q = useQuery({
    queryKey: qk.milestoneAssumptionRow(countryId ?? "", technology ?? -1),
    queryFn: async () => (await loadMilestoneAssumptionValues(countryId ?? undefined, technology ?? undefined)) ?? null,
    enabled: Boolean(countryId) && technology !== null && technology !== undefined,
    staleTime: REFERENCE_STALE,
  });
  return out(q, null);
}

/** The COD guard's individual-volume contracts (0 or 1). */
export function useIndividualVolumeContractCount(projectId: string | undefined): ScreenData<number> {
  const q = useQuery({
    queryKey: qk.individualVolumeContracts(projectId ?? ""),
    queryFn: () => countIndividualVolumeContracts(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, 0);
}

/** Any `Project Revenues` row (0 or 1) — the revenue-seed notice. */
export function useRevenueRowCount(projectId: string | undefined): ScreenData<number> {
  const q = useQuery({
    queryKey: qk.projectRevenueCount(projectId ?? ""),
    queryFn: () => countProjectRevenues(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, 0);
}

/** `Icon3.Visible` — a Fabric milestone recalculation is running for the project. */
export function useRecalculationRunning(projectId: string | undefined): ScreenData<boolean> {
  const q = useQuery({
    queryKey: qk.milestoneRecalculationRunning(projectId ?? ""),
    queryFn: () => isMilestoneRecalculationRunning(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, false);
}

/**
 * The FID OnChange's re-pricing inputs, read when the save needs them (the canvas read them on
 * every FID keystroke). `null` when the index cannot be computed (`accumulatedIndex`, D26):
 * the save then leaves the generator costs alone.
 */
export async function loadRepricing(
  projectId: string, fid: string,
): Promise<{ generators: ProjectGenerator[]; index: number } | null> {
  // `Year(FID)` from the date part itself, so no time zone can move it.
  const year = Number(fid.slice(0, 4));
  const [inflation, generators] = await Promise.all([
    loadPriceInflation(year), listProjectGeneratorsForRepricing(projectId),
  ]);
  const index = accumulatedIndex(fid, inflation.current, inflation.previous);
  return index === null ? null : { generators, index };
}

/**
 * Runs the save and refreshes the project here, General Data's copy of it, the session's project
 * header (`gblProjectHeaderData`) and the recalculation notice.
 */
export function useMilestoneWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  return usePlanWrite({
    invalidate: [
      qk.milestoneProject(id), qk.generalDataProject(id), qk.project(id),
      qk.milestoneRecalculationRunning(id),
    ],
    action: "change this project's milestones",
    errorText: projectSaveErrorText,
  });
}
