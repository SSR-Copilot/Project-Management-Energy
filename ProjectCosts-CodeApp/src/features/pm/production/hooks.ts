/**
 * Project Production Screen — the data layer (connected 19 Oct 2026, D28).
 *
 * The reads live in `data/production.ts` (which reuses `data/generators.ts` and `data/landLease.ts`).
 * Every write is a `WritePlan` from `rules.ts`, run IN ORDER by `usePlanWrite`. Each write path is
 * the canvas sequence of steps:
 *   1. the action itself — the yield save (`planSaveYield`), delete (`planDeleteYield`) or status
 *      change (`planStatusChange`), each ending with the revenue negative-price sync;
 *   2. "Recalc" part 1 (`Select(btn_Load_StandardContracts_For_Project)`): the project roll-up from
 *      the yields as they now are (`planRollUp`) — the `then` step of job 1 since D108;
 *   3. "Recalc" part 2, only when `shouldGenerate` on the new p50: the standard Land Lease / Other OPEX
 *      / O&M contracts and the four CAPEX flags (`planStandardContracts`) — its own job.
 * Each plan is built when its step starts, from a fresh read — the canvas `Refresh`es before each step.
 *
 * SERVER AUTOMATION the writes fire (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified
 * 19 Oct 2026) — the client never does its work:
 *  - Plugin steps on `vsb_project` Update: `vsb_initialp50trigger` (InitialP50StandardCapexContractCreate,
 *    async), `vsb_capexstandardcontractscreated, vsb_capexstandardcostscreated, vsb_initialp50trigger`
 *    (InitialP50StandardBOPContractsCreate, async) and `vsb_capexstandardcontractscreated`
 *    (InitialCapexCostsCreate, async) — all three from the flag write of job 3.
 *  - No flow: `LoadDevexCapexCostTotalCapacityTrigger` filters on the plant capacity columns and
 *    `UpdateTeamsandSPOSite` on `vsb_clusterstate`; neither is written. No plugin or flow filters on
 *    the energy-yield, seasonality, negative-price, revenue or the generated cost tables.
 *  - NOT CALLED: `SynchroniseRecalculationCapexStandardCost` — commented out in the canvas (Y:9062).
 *
 * `Assumptions Revenues SQL` (Fabric SQL, D54) — `useRevenueAssumptions` reads the country's standard
 * seasonality and negative prices (connected 28 Oct 2026). When the read fails the standards stay
 * blank and the panel says so; the yield can still be saved with typed values.
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN, ES_FINANCE, ES_PLANT, ES_PRODUCTION } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  listEnergyYields, listProjectRevenues, listStandardRevenueAssumptions, listStoredNegativePrices,
  loadGenerationInputs, loadProductionProject, loadStoredSeasonality,
} from "@/data/production";
import {
  PRODUCTION_SCREEN_TEXT, UI, planDeleteYield, planRollUp, planSaveYield, planStandardContracts, planStatusChange,
  projectYieldTotals, shouldGenerate,
  type EnergyYieldRow, type NegativePriceRow, type ProductionProject, type SeasonalityRow,
  type StandardNegativePriceRow, type StandardSeasonalityRow, type StoredNegativePrice, type StoredSeasonality,
} from "./rules";

/** Every Dataverse entity set the screen reads or writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES_PRODUCTION.energyYields,
  ES_PRODUCTION.seasonalityValues,
  ES_PRODUCTION.negativePrices,
  ES_FINANCE.projectRevenues,
  ES_PLANT.generatorTypeInProjects,
  ES_PLANT.pvModuleTypeInProjects,
  ES_PLANT.generatorInProjects,
  ES_PLANT.deviceTypesInProjects,
  ES_PLANT.opexSubaccounts,
  ES_ADMIN.opexLandLeaseStandardAssumptions,
  ES_PLANT.landLeaseProjectCosts,
  ES.landLeasePeriods,
  ES.landLeaseAllocationWtgs,
  ES_PLANT.opexProjectCosts,
  ES.countryInflationProfiles,
];

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NONE: never[] = [];

/** `gblRecordSelectedProject` — re-read on every visit, as `OnVisible` does. */
export function useProductionProject(projectId: string | undefined): ScreenData<ProductionProject | null> {
  const q = useQuery({
    queryKey: qk.production(projectId ?? "", "project"),
    queryFn: () => loadProductionProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** `colEnergyYieldsInProject`. */
export function useEnergyYields(projectId: string | undefined): ScreenData<EnergyYieldRow[]> {
  const q = useQuery({
    queryKey: qk.production(projectId ?? "", "yields"),
    queryFn: () => listEnergyYields(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as EnergyYieldRow[]);
}

export interface StandardAssumptions {
  seasonality: StandardSeasonalityRow[];
  negativePrices: StandardNegativePriceRow[];
}

const NO_STANDARDS: StandardAssumptions = { seasonality: [], negativePrices: [] };

/** `colStandardSeasonalityYeild` / `colStandardNegativePricePV` — the project country's Fabric SQL rows. */
export function useRevenueAssumptions(countryName: string | null | undefined): ScreenData<StandardAssumptions> {
  const q = useQuery({
    queryKey: qk.production("", "standardAssumptions", countryName ?? ""),
    queryFn: () => listStandardRevenueAssumptions(countryName!),
    enabled: Boolean(countryName),
    staleTime: 30 * 60 * 1000,
  });
  return out(q, NO_STANDARDS);
}

/** The edited yield's stored seasonality row (`locSelected{WTG|PV}SeasonalityYieldRecord`). */
export function useStoredSeasonality(projectId: string | undefined, energyYieldId: string | null): ScreenData<StoredSeasonality | null> {
  const q = useQuery({
    queryKey: qk.production(projectId ?? "", "seasonality", energyYieldId ?? ""),
    queryFn: () => loadStoredSeasonality(energyYieldId!),
    enabled: Boolean(projectId) && Boolean(energyYieldId),
  });
  return out(q, null);
}

/** The edited yield's stored negative prices. */
export function useStoredNegativePrices(projectId: string | undefined, energyYieldId: string | null): ScreenData<StoredNegativePrice[]> {
  const q = useQuery({
    queryKey: qk.production(projectId ?? "", "negativePrices", energyYieldId ?? ""),
    queryFn: () => listStoredNegativePrices(energyYieldId!),
    enabled: Boolean(projectId) && Boolean(energyYieldId),
  });
  return out(q, NONE as StoredNegativePrice[]);
}

/**
 * `gblCurrentUser.CanEditSelectedProject = DataSourceInfo(Projects, CreatePermission) ∧
 * RecordInfo(project, EditPermission)`. The SDK has neither: it passes, and Dataverse decides (D1,
 * `serverEnforcedProvider`) — a refused write surfaces as the permission message.
 */
export const CAN_EDIT_SELECTED_PROJECT = true;

/** What the screen passes for a save; the hook adds the fresh yields, revenues and stored rows. */
export interface SaveYieldRequest {
  editing: EnergyYieldRow | null;
  payload: Record<string, unknown>;
  project: Pick<ProductionProject, "owningBusinessUnitId">;
  seasonality: { on: boolean; rows: readonly SeasonalityRow[] };
  negativePrices: { on: boolean; rows: readonly NegativePriceRow[] };
}

/**
 * Runs the screen's writes and the "Recalc" that follows each, then refreshes the screen and the project's other views.
 *
 * Save performance (6 Nov 2026, D108) — the same writes, in fewer waits:
 *  - the roll-up (Recalc part 1) is the `then` step of the action's own job, still from a fresh read of
 *    the yields and the project, so the screen is no longer reloaded (and awaited) between the two;
 *  - the screen reloads BEHIND the closed progress dialog (`refresh: "background"`, as Generators); the
 *    Screen holds its commands back while `refreshing`, so nothing acts on the old rows;
 *  - the plans send their independent writes together (`rules.ts`, `together`).
 * The one-shot standard-contract generation (Recalc part 2) stays its own job, with its own progress text.
 */
export function useProductionWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  const w = usePlanWrite({
    invalidate: [qk.productionAll(id), qk.project(id), qk.milestoneProject(id), qk.generalDataProject(id)],
    action: "change this project's energy yields",
    refresh: "background",
  });

  /**
   * `btn_Load_StandardContracts_For_Project.OnSelect` (Y:8014-9119), part 1 — the roll-up, from the yields
   * and the project as they are AFTER the action's writes (the canvas `Refresh`es first). `seen` keeps what
   * part 2 decides on.
   */
  type Seen = { next: { netYieldP50: number; standardCostCreated: boolean } | null };
  const rollUp = (seen: Seen) => async () => {
    const [yields, project] = await Promise.all([listEnergyYields(id), loadProductionProject(id)]);
    if (!project) throw new Error("The project could not be read.");
    seen.next = { netYieldP50: projectYieldTotals(yields).netP50, standardCostCreated: project.standardCostCreated };
    return planRollUp(id, yields);
  };

  /** Part 2: the one-shot generation, only when `shouldGenerate` on the new p50. */
  const generateIfDue = async (seen: Seen): Promise<boolean> => {
    if (seen.next === null || !shouldGenerate(seen.next)) return true;
    const generated = await w.run({
      progress: UI.loadingStandardContracts,
      plan: async () => {
        const project = await loadProductionProject(id);
        if (!project) throw new Error("The project could not be read.");
        return planStandardContracts(await loadGenerationInputs(project));
      },
    });
    return generated !== null;
  };

  const saveYield = async (req: SaveYieldRequest): Promise<boolean> => {
    const seen: Seen = { next: null };
    const done = await w.run({
      progress: UI.saving,
      errorText: (d) => `${PRODUCTION_SCREEN_TEXT.saveError}: ${d}`,
      then: rollUp(seen),
      plan: async () => {
        const editingId = req.editing?.id ?? null;
        const [yields, revenues, stored, storedNegative] = await Promise.all([
          listEnergyYields(id), listProjectRevenues(id),
          editingId ? loadStoredSeasonality(editingId) : Promise.resolve(null),
          editingId ? listStoredNegativePrices(editingId) : Promise.resolve([] as StoredNegativePrice[]),
        ]);
        return planSaveYield({
          editing: req.editing, payload: req.payload, project: req.project,
          seasonality: { ...req.seasonality, storedId: stored?.recordId ?? null },
          negativePrices: { ...req.negativePrices, stored: storedNegative },
          yields, revenues,
        });
      },
    });
    return done !== null && (await generateIfDue(seen));
  };

  const deleteYield = async (row: EnergyYieldRow): Promise<boolean> => {
    const seen: Seen = { next: null };
    const done = await w.run({
      progress: UI.saving,
      then: rollUp(seen),
      plan: async () => {
        const [yields, revenues] = await Promise.all([listEnergyYields(id), listProjectRevenues(id)]);
        return planDeleteYield({ row: yields.find((y) => y.id === row.id) ?? row, yields, revenues });
      },
    });
    return done !== null && (await generateIfDue(seen));
  };

  const changeStatus = async (row: EnergyYieldRow): Promise<boolean> => {
    const seen: Seen = { next: null };
    const done = await w.run({
      progress: UI.saving,
      then: rollUp(seen),
      plan: async () => {
        const [yields, revenues] = await Promise.all([listEnergyYields(id), listProjectRevenues(id)]);
        return planStatusChange({ row: yields.find((y) => y.id === row.id) ?? row, yields, revenues });
      },
    });
    return done !== null && (await generateIfDue(seen));
  };

  return {
    progress: w.progress, error: w.error, success: w.success, clear: w.clear,
    /** The background reload after a write is still running: the rows on screen may be the old ones. */
    refreshing: w.refreshing,
    saveYield, deleteYield, changeStatus,
  };
}
