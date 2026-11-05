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
 * The default `Project Revenues` seed (connected 28 Oct 2026): `loadRevenueSeed` reads the Fabric
 * SQL source `Assumptions Revenues SQL` (D54) when the save starts, as the canvas did inside its
 * save formula. A failed Fabric read does not stop the milestone save; the seed is skipped and
 * the screen says so.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ES, ES_ADMIN, ES_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { listProjectStates } from "@/data/generalData";
import { loadMilestoneAssumptionValues } from "@/data/costBook";
import {
  countIndividualVolumeContracts, countProjectRevenues, isMilestoneRecalculationRunning,
  listProjectGeneratorsForRepricing, listRevenueAssumptions, loadMilestoneProject, loadPriceInflation,
} from "@/data/milestones";
import { findCurrency, loadFirstRevenueSubaccount } from "@/data/revenues";
import { projectSaveErrorText } from "@/features/pm/general-data/rules";
import {
  accumulatedIndex, buildDefaultRevenue, milestoneLabels, revenueSeedWouldRun,
  type MilestoneAssumptionRow, type MilestoneDates, type MilestoneProject, type ProjectGenerator,
  type ProjectRevenueDraft, type RevenueAssumptionRow,
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
  ES.currencies,
  ES.revenueSubaccounts,
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

/** What the save seeds; `fabricFailed` when `Assumptions Revenues SQL` could not be read. */
export interface RevenueSeed {
  draft: ProjectRevenueDraft | null;
  fabricFailed: boolean;
}

/** The three reads behind the seed: the country's assumptions (Fabric SQL), EUR and the first subaccount. */
export interface RevenueSeedInputs {
  assumptions: RevenueAssumptionRow[];
  currencyId: string | null;
  subaccountId: string | null;
}

/** The Fabric read failed: the seed is skipped and the screen says so; the milestone save goes on. */
export class FabricReadError extends Error {
  readonly reason: unknown;
  constructor(reason: unknown) {
    super("the revenue assumptions could not be read from Fabric SQL");
    this.name = "FabricReadError";
    this.reason = reason;
  }
}

/**
 * The seed's three reads at once instead of one after the other (save performance, 5 Nov 2026).
 * Same reads, same outcome: a failed Fabric read is a `FabricReadError` (→ `fabricFailed`) and is
 * checked first, so it still wins over a currency or subaccount failure (those used to be skipped
 * after a Fabric failure); a currency or subaccount failure still fails the save.
 */
export async function loadRevenueSeedInputs(countryName: string): Promise<RevenueSeedInputs> {
  const [fabric, currency, subaccount] = await Promise.allSettled([
    listRevenueAssumptions(countryName), findCurrency("EUR"), loadFirstRevenueSubaccount(),
  ]);
  if (fabric.status === "rejected") throw new FabricReadError(fabric.reason);
  if (currency.status === "rejected") throw currency.reason;
  if (subaccount.status === "rejected") throw subaccount.reason;
  return {
    assumptions: fabric.value,
    currencyId: currency.value?.id ?? null,
    subaccountId: subaccount.value?.id ?? null,
  };
}

/**
 * The default revenue contract (rules 20-28, Y:509-1129), read when the save starts. The gate is
 * checked first with a fresh `Project Revenues` count, so nothing is read from Fabric for a
 * project that already has a contract. `Currency: LookUp(Currencies, 'Currency Code' = "EUR")`
 * (Y:771-774) and `Subaccount: First(colRevenueSubaccounts)` (Y:1022).
 *
 * `loadInputs` defaults to the parallel reads above; the screen passes the cached loader of
 * `useRevenueSeedInputsLoader`, which answers from the inputs read when the screen opened.
 */
export async function loadRevenueSeed(
  project: MilestoneProject,
  dates: MilestoneDates,
  loadInputs: (countryName: string) => Promise<RevenueSeedInputs> = loadRevenueSeedInputs,
): Promise<RevenueSeed> {
  const none: RevenueSeed = { draft: null, fabricFailed: false };
  if (!project.id || !project.countryName || !revenueSeedWouldRun(project, 0)) return none;
  const existingRevenueCount = await countProjectRevenues(project.id);
  if (existingRevenueCount !== 0) return none;
  let inputs: RevenueSeedInputs;
  try {
    inputs = await loadInputs(project.countryName);
  } catch (error) {
    if (error instanceof FabricReadError) return { draft: null, fabricFailed: true };
    throw error;
  }
  return {
    draft: buildDefaultRevenue({
      project, dates, assumptions: inputs.assumptions, existingRevenueCount,
      currencyId: inputs.currencyId,
      subaccountId: inputs.subaccountId,
      // `gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` (Y:1089), which the save has
      // just set to the country's business unit (rule 18).
      owningBusinessUnitId: project.countryBusinessUnitId,
    }),
    fabricFailed: false,
  };
}

/**
 * Reads the seed's inputs when the screen opens, so the save finds them in the cache instead of
 * waiting for Fabric SQL (save performance, 5 Nov 2026). Only while the canvas seed would run:
 * Draft / Cluster 1 AND no contract yet (one cheap count, the gate the save re-checks fresh), so a
 * project that already has a contract never reads Fabric. The inputs are reference data, kept as
 * long as the assumption row (`REFERENCE_STALE`); a failed or expired read is simply done again at
 * save time. Returns the loader `loadRevenueSeed` takes.
 */
export function useRevenueSeedInputsLoader(project: MilestoneProject | null | undefined) {
  const qc = useQueryClient();
  const projectId = project?.id ?? "";
  const country = project?.countryName ?? "";
  const wouldRun = Boolean(project && projectId && country && revenueSeedWouldRun(project, 0));
  const count = useQuery({
    queryKey: qk.projectRevenueCount(projectId),
    queryFn: () => countProjectRevenues(projectId),
    enabled: wouldRun,
  });
  useQuery({
    queryKey: qk.milestoneRevenueSeedInputs(country),
    queryFn: () => loadRevenueSeedInputs(country),
    enabled: wouldRun && count.data === 0,
    staleTime: REFERENCE_STALE,
    retry: false,
  });
  return useCallback(
    (countryName: string) => qc.fetchQuery({
      queryKey: qk.milestoneRevenueSeedInputs(countryName),
      queryFn: () => loadRevenueSeedInputs(countryName),
      staleTime: REFERENCE_STALE,
      retry: false,
    }),
    [qc],
  );
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
      qk.milestoneRecalculationRunning(id), qk.projectRevenueCount(id), qk.revenuesAll(id),
    ],
    action: "change this project's milestones",
    errorText: projectSaveErrorText,
  });
}
