/**
 * Project Production Screen — the data layer (connected 19 Oct 2026, D28).
 *
 * The reads live in `data/production.ts` (which reuses `data/generators.ts` and `data/landLease.ts`).
 * Every write is a `WritePlan` from `rules.ts`, run IN ORDER by `usePlanWrite`. Each write path is
 * the canvas sequence of jobs:
 *   1. the action itself — the yield save (`planSaveYield`), delete (`planDeleteYield`) or status
 *      change (`planStatusChange`), each ending with the revenue negative-price sync;
 *   2. "Recalc" part 1 (`Select(btn_Load_StandardContracts_For_Project)`): the project roll-up from
 *      the yields as they now are (`planRollUp`);
 *   3. "Recalc" part 2, only when `shouldGenerate` on the new p50: the standard Land Lease / Other OPEX
 *      / O&M contracts and the four CAPEX flags (`planStandardContracts`).
 * Each plan is built when its job starts, from a fresh read — the canvas `Refresh`es before each step.
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

/** Runs the screen's writes and the "Recalc" that follows each, then refreshes the screen and the project's other views. */
export function useProductionWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  const w = usePlanWrite({
    invalidate: [qk.productionAll(id), qk.project(id), qk.milestoneProject(id), qk.generalDataProject(id)],
    action: "change this project's energy yields",
  });

  /** `btn_Load_StandardContracts_For_Project.OnSelect` (Y:8014-9119): the roll-up, then the one-shot generation. */
  const recalculate = async (): Promise<boolean> => {
    const seen: { next: { netYieldP50: number; standardCostCreated: boolean } | null } = { next: null };
    const rolled = await w.run({
      progress: UI.saving,
      plan: async () => {
        const [yields, project] = await Promise.all([listEnergyYields(id), loadProductionProject(id)]);
        if (!project) throw new Error("The project could not be read.");
        seen.next = { netYieldP50: projectYieldTotals(yields).netP50, standardCostCreated: project.standardCostCreated };
        return planRollUp(id, yields);
      },
    });
    if (rolled === null || seen.next === null || !shouldGenerate(seen.next)) return rolled !== null;
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
    const done = await w.run({
      progress: UI.saving,
      errorText: (d) => `${PRODUCTION_SCREEN_TEXT.saveError}: ${d}`,
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
    return done !== null && (await recalculate());
  };

  const deleteYield = async (row: EnergyYieldRow): Promise<boolean> => {
    const done = await w.run({
      progress: UI.saving,
      plan: async () => {
        const [yields, revenues] = await Promise.all([listEnergyYields(id), listProjectRevenues(id)]);
        return planDeleteYield({ row: yields.find((y) => y.id === row.id) ?? row, yields, revenues });
      },
    });
    return done !== null && (await recalculate());
  };

  const changeStatus = async (row: EnergyYieldRow): Promise<boolean> => {
    const done = await w.run({
      progress: UI.saving,
      plan: async () => {
        const [yields, revenues] = await Promise.all([listEnergyYields(id), listProjectRevenues(id)]);
        return planStatusChange({ row: yields.find((y) => y.id === row.id) ?? row, yields, revenues });
      },
    });
    return done !== null && (await recalculate());
  };

  return { progress: w.progress, error: w.error, success: w.success, clear: w.clear, saveYield, deleteYield, changeStatus };
}
