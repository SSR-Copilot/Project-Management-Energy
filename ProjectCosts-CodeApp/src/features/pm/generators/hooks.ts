/**
 * Project Generators Screen — the data layer (connected 19 Oct 2026, D27).
 *
 * The reads live in `data/generators.ts`; the FID price-inflation rows reuse `data/milestones.ts`
 * (`loadPriceInflation`). Every write is a `WritePlan` from `rules.ts`, run IN ORDER by
 * `usePlanWrite` (`data/executePlan.ts`). A save whose later writes need a value the first one
 * creates (a type's autonumber name, the new turbine ids) runs as two jobs, the second built from
 * the first one's created ids — the canvas' queued `Select(btn_AutomatedFlow_TriggerWork_ForWTG_PV)`
 * and `Select(btn_Trigger_New_AllocateWTGs_To_Land_Lease)` also ran after the main formula.
 *
 * SERVER AUTOMATION the writes fire (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified
 * 19 Oct 2026) — the client never does its work:
 *  - `LoadDevexCapexCostTotalCapacityTrigger` — `vsb_project` Modified on the plant WTG / PV / storage /
 *    hydrogen / substation capacity columns. Every save and delete here writes one of them (the
 *    roll-ups), as the canvas does, so the flow creates its `Fabric Sync Jobs` row on the server.
 *    `'Total Capacity'` is a Dataverse formula column and is re-read, never written.
 *  - No plugin step: none filters on the generator, PV or plant tables, nor on the project's plant
 *    columns. `UpdateTeamsandSPOSite` (`vsb_clusterstate`) is not written.
 *
 * NOT CALLED (product decision D27 — approval flows that send mails / Teams cards are left out):
 * `RequestModulePermission` (the out-of-country "Request permission" save) and
 * `Requestpermissioncancellation` (the cards' Cancel button, and the cancellation the canvas runs
 * before deleting a type whose `FlowRunId` is set — that delete is refused, `EXCLUDED`).
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { useSession } from "@/app/SessionContext";
import { loadPriceInflation } from "@/data/milestones";
import {
  listAllWtgLandLeaseCosts, listGeneratorTypes, listGeneratorsByIds, listInverterTypes, listOrderableGenerators,
  listProjectTurbines, listPvModules, listPvTypes, listSimpleTypes, listSubstructureTypes, loadDeviceCosts,
  findPvUnit, listDeviceTypes, listOpexCostIds, loadGeneratorsProject, loadOpexDependency, loadProjectPlanning,
  listPlantSupplierCatalogue, loadTurbineAllocations, loadTypeName,
  type DeviceCosts, type GeneratorsProjectRow,
} from "@/data/generators";
import {
  accumulatedIndex, toReplaceAllocations,
  type CatalogModel, type GeneratorTypeRow, type LandLeaseCostRow, type PlantFamily, type PlantSupplierOption, type ProjectPlanning,
  type PvModuleOption, type ReplaceInputs, type SimpleTypeRow, type TurbineRow,
} from "./rules";

export type { DeviceCosts, GeneratorsProjectRow };

/** The Dataverse entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.countries,
  ES.projectPlannings,
  ES_PLANT.generators,
  ES_PLANT.generatorTypeInProjects,
  ES_PLANT.generatorInProjects,
  ES_PLANT.pvModuleTypeInProjects,
  ES_PLANT.pvModules,
  ES_PLANT.inverterTypeInProjects,
  ES_PLANT.inverters,
  ES_PLANT.substructureTypeInProjects,
  ES_PLANT.substructures,
  ES_PLANT.storageTypeInProjects,
  ES_PLANT.hydrogenTypeInProjects,
  ES_PLANT.substationTypeInProjects,
  ES_PLANT.deviceTypesInProjects,
  ES.deviceCosts,
  ES.estimationPriceInflations,
  ES_PLANT.landLeaseProjectCosts,
  ES.landLeaseAllocationWtgs,
  ES_PLANT.opexProjectCosts,
];

const REFERENCE_STALE = 30 * 60 * 1000;
const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NONE: never[] = [];

/** `gblRecordSelectedProject` (+ its country) — re-read on every visit, as `OnVisible` does. */
export function useGeneratorsProject(projectId: string | undefined): ScreenData<GeneratorsProjectRow | null> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "project"),
    queryFn: () => loadGeneratorsProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** `locProjectPlanning` — the height limitation. */
export function useProjectPlanning(projectId: string | undefined): ScreenData<ProjectPlanning | null> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "planning"),
    queryFn: () => loadProjectPlanning(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** The orderable catalogue for the type panel (phase-out after FID). */
export function useGeneratorCatalog(fid: string | null | undefined): ScreenData<CatalogModel[]> {
  const q = useQuery({
    queryKey: qk.generatorCatalog(fid ?? ""),
    queryFn: () => listOrderableGenerators(fid ?? null),
    enabled: Boolean(fid),
    staleTime: REFERENCE_STALE,
  });
  return out(q, NONE as CatalogModel[]);
}

/** The `Generator` rows of the project's types, whatever their phase-out. */
export function useGeneratorModels(ids: readonly string[]): ScreenData<CatalogModel[]> {
  const sorted = [...new Set(ids)].sort();
  const q = useQuery({
    queryKey: qk.generatorModels(sorted),
    queryFn: () => listGeneratorsByIds(sorted),
    enabled: sorted.length > 0,
    staleTime: REFERENCE_STALE,
  });
  return out(q, NONE as CatalogModel[]);
}

/**
 * `gblEstimationPriceInflationDirectConstants.AdditionalCost.AccumulatedIndex` (Y:63):
 * `prev + (curr − prev) × Month(FID) / 12`, blanks as 0 (rule 7).
 */
export function useInflationIndex(fid: string | null | undefined): ScreenData<number> {
  const year = fid ? Number(fid.slice(0, 4)) : NaN;
  const month = fid ? Number(fid.slice(5, 7)) : NaN;
  const q = useQuery({
    queryKey: qk.priceInflation(Number.isFinite(year) ? year : 0),
    queryFn: () => loadPriceInflation(year),
    enabled: Number.isFinite(year),
    staleTime: REFERENCE_STALE,
  });
  const index = q.data
    ? accumulatedIndex(q.data.current?.accumulatedIndex, q.data.previous?.accumulatedIndex, Number.isFinite(month) ? month : 0)
    : 0;
  return out({ ...q, data: q.data ? index : undefined }, 0);
}

/** `gblDiviceCoststConstants`. */
export function useDeviceCosts(countryId: string | null | undefined): ScreenData<DeviceCosts> {
  const q = useQuery({
    queryKey: qk.deviceCosts(countryId ?? ""),
    queryFn: () => loadDeviceCosts(countryId ?? null),
    staleTime: REFERENCE_STALE,
  });
  return out(q, { modules: null, inverter: null, mountingFix: null, mountingTracker: null });
}

export function useGeneratorTypes(projectId: string | undefined): ScreenData<GeneratorTypeRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "types"),
    queryFn: () => listGeneratorTypes(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as GeneratorTypeRow[]);
}

/** Every turbine of the project's WTG types (`colGeneratorsInProjectsTemporary`). */
export function useProjectTurbines(projectId: string | undefined, typeIds: readonly string[]): ScreenData<TurbineRow[]> {
  const sorted = [...typeIds].sort();
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "turbines", ...sorted),
    queryFn: () => listProjectTurbines(sorted),
    enabled: Boolean(projectId) && sorted.length > 0,
  });
  return out(q, NONE as TurbineRow[]);
}

/** `colPVModulesSuppliers`. */
export function usePvModuleCatalog(): ScreenData<PvModuleOption[]> {
  const q = useQuery({ queryKey: qk.pvModuleCatalog, queryFn: listPvModules, staleTime: REFERENCE_STALE });
  return out(q, NONE as PvModuleOption[]);
}

/**
 * G9 — the `Inverters` / `Substructures` catalogue for the Add / Edit panels, read only while that panel
 * is open (`enabled`); a failed read is shown in the panel.
 */
export function usePlantSupplierCatalog(kind: "inverter" | "substructure", enabled: boolean): ScreenData<PlantSupplierOption[]> {
  const q = useQuery({
    queryKey: qk.plantSupplierCatalog(kind),
    queryFn: () => listPlantSupplierCatalogue(kind),
    enabled,
    staleTime: REFERENCE_STALE,
  });
  return out(q, NONE as PlantSupplierOption[]);
}

/** The project's PV types, each with its `PVModule.Supplier` joined from the catalogue. */
export function usePvModuleTypes(projectId: string | undefined, modules: readonly PvModuleOption[]): ScreenData<SimpleTypeRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "pv"),
    queryFn: () => listPvTypes(projectId!),
    enabled: Boolean(projectId),
  });
  const supplierOf = new Map(modules.map((m) => [m.id, m.supplier]));
  const data = q.data?.map((r) => ({ ...r, catalogueSupplier: r.catalogueId ? supplierOf.get(r.catalogueId) ?? null : null }));
  return out({ ...q, data }, NONE as SimpleTypeRow[]);
}

export function useInverterTypes(projectId: string | undefined): ScreenData<SimpleTypeRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "inverter"),
    queryFn: () => listInverterTypes(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as SimpleTypeRow[]);
}

export function useSubstructureTypes(projectId: string | undefined): ScreenData<SimpleTypeRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "substructure"),
    queryFn: () => listSubstructureTypes(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as SimpleTypeRow[]);
}

/** BESS / Hydrogen / Substation. */
export function useSimpleTypes(
  family: "storage" | "hydrogen" | "substation", projectId: string | undefined,
): ScreenData<SimpleTypeRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", family),
    queryFn: () => listSimpleTypes(family, projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as SimpleTypeRow[]);
}

/** The AllWTG land-lease costs a new turbine is allocated to (rule 20). */
export function useAllWtgLandLeaseCosts(projectId: string | undefined): ScreenData<LandLeaseCostRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "allWtgCosts"),
    queryFn: () => listAllWtgLandLeaseCosts(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as LandLeaseCostRow[]);
}

/** 1.21.753 — the O&M half of the delete / deactivate guard for the selected WTG or PV type. */
export function useOpexDependency(
  projectId: string | undefined, typeId: string | null | undefined,
): ScreenData<{ hasActiveDeviceType: boolean; hasActiveOpexCost: boolean }> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "opexDependency", typeId ?? ""),
    queryFn: () => loadOpexDependency(projectId!, typeId!),
    enabled: Boolean(projectId) && Boolean(typeId),
  });
  return out(q, { hasActiveDeviceType: false, hasActiveOpexCost: false });
}

/** `User().EntraObjectId`, from the SDK context. */
export function useEntraObjectId(): string | null {
  return useSession().session?.entraObjectId ?? null;
}

/**
 * The privileges the command bar's `ItemEnabled` reads (`gblCurrentUser.CanEditSelectedProject`,
 * `RecordInfo(…, DeletePermission / EditPermission)`). The SDK has no `DataSourceInfo` /
 * `RecordInfo`: they pass, and Dataverse decides (D1, `serverEnforcedProvider`) — a refused write
 * surfaces as the permission message.
 */
export interface GeneratorPermissions {
  canEdit: boolean;
  deletePermission: Partial<Record<PlantFamily, boolean>>;
  editPermission: boolean;
  pvEditPermission: boolean;
}
export const SERVER_DECIDES: GeneratorPermissions = {
  canEdit: true,
  deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  editPermission: true,
  pvEditPermission: true,
};

/** Runs the screen's writes and refreshes the screen, the session's project header and Milestones' copy. */
export function useGeneratorWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  return usePlanWrite({
    invalidate: [qk.generatorsAll(id), qk.project(id), qk.milestoneProject(id), qk.generalDataProject(id)],
    action: "change this project's generators",
  });
}

/* ═══════════════════════════════════════════ reads a write plan needs when it runs ════ */

/** A new WTG / PV type's autonumber name, and its O&M device-type row if one exists already. */
export async function loadNewTypeInputs(family: "wtg" | "pv", typeId: string): Promise<{
  typeName: string; hasDeviceType: boolean; bridgeId: string | null;
}> {
  const [typeName, deviceTypes] = await Promise.all([loadTypeName(family, typeId), listDeviceTypes(typeId)]);
  return { typeName, hasDeviceType: deviceTypes.length > 0, bridgeId: deviceTypes[0]?.id ?? null };
}

/** The PV save's second job: the type's name, its unit (if any) and its device-type row. */
export async function loadPvFollowUpInputs(pvId: string): Promise<{ pvName: string; unitId: string | null; hasDeviceType: boolean }> {
  const [inputs, unitId] = await Promise.all([loadNewTypeInputs("pv", pvId), findPvUnit(pvId)]);
  return { pvName: inputs.typeName, unitId, hasDeviceType: inputs.hasDeviceType };
}

/** The land-lease allocations of some turbines and their costs' allocation counts. */
export const loadAllocations = loadTurbineAllocations;

/** The WTG type delete's inputs: its turbines' allocations, and the O&M costs of its first device type. */
export async function loadTypeDeleteInputs(projectId: string, typeId: string, turbineIds: readonly string[]): Promise<{
  allocations: { id: string; costId: string }[]; countByCost: Record<string, number>; opexCostIds: string[];
}> {
  const [alloc, deviceTypes] = await Promise.all([loadTurbineAllocations(turbineIds), listDeviceTypes(typeId)]);
  const first = deviceTypes[0];
  const opexCostIds = first ? await listOpexCostIds(projectId, first.id) : [];
  return { allocations: alloc.allocations, countByCost: alloc.countByCost, opexCostIds };
}

/**
 * The PV delete's inputs (G2): the type's unit(s), their land-lease allocations with their costs'
 * allocation counts, and the O&M costs of the type's first device-type row.
 */
export async function loadPvDeleteInputs(projectId: string, pvId: string): Promise<{
  unitIds: string[]; allocations: { id: string; costId: string }[]; countByCost: Record<string, number>; opexCostIds: string[];
}> {
  const unitIds = (await listProjectTurbines([pvId])).map((u) => u.id);
  const inputs = await loadTypeDeleteInputs(projectId, pvId, unitIds);
  return { unitIds, ...inputs };
}

/**
 * A replace's T2a "Identify" (G6): the old type's device-type rows and the O&M costs on the first, its
 * units, their land-lease allocations (with each cost's AllWTG flag) and the project's AllWTG costs.
 */
export async function loadReplaceInputs(projectId: string, typeId: string): Promise<ReplaceInputs> {
  const [deviceTypes, units, landLeaseCosts] = await Promise.all([
    listDeviceTypes(typeId), listProjectTurbines([typeId]), listAllWtgLandLeaseCosts(projectId),
  ]);
  const first = deviceTypes[0];
  const [opexCostIds, alloc] = await Promise.all([
    first ? listOpexCostIds(projectId, first.id) : Promise.resolve([] as string[]),
    loadTurbineAllocations(units.map((u) => u.id)),
  ]);
  return {
    bridgeIds: deviceTypes.map((d) => d.id),
    opexCostIds,
    unitIds: units.map((u) => u.id),
    allocations: toReplaceAllocations({
      allocations: alloc.allocations, units, allWtgCostIds: new Set(landLeaseCosts.map((c) => c.id)),
    }),
    landLeaseCosts,
  };
}
