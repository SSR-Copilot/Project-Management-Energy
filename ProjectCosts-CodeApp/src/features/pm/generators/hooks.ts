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
 * FLOWS (D97, 5 Nov 2026; `ProjectDocs/app-docs/16-PM-FLOWS-IN-THE-CODE-APP.md` §5) — called through
 * `data/flows.ts` by `useModulePermissionFlows`, inside the same `usePlanWrite` job as the writes around them:
 *  - `RequestModulePermission`: the out-of-country WTG type save and replace, and the inverter / substructure
 *    save with an Other Supplier — after the row is written (the plan skips the roll-up on that path);
 *  - `Requestpermissioncancellation`: the cards' Cancel, and before deleting or replacing a type whose
 *    `FlowRunId` is set.
 * Both flows write the type row's request fields themselves; the app refreshes, it does not patch them.
 * Before D97 these controls were visible and disabled (D27: the flows send mails / Teams cards).
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ES, ES_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { generatorCatalogueCache } from "@/data/generatorCatalogueCache";
import { generatorsPerf } from "@/data/generatorsPerfFlags";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { useSession } from "@/app/SessionContext";
import { loadPriceInflation } from "@/data/milestones";
import { cancelModulePermission, requestModulePermission, type FlowApprovalResult } from "@/data/flows";
import {
  listAllWtgLandLeaseCosts, listGeneratorsByIds, listOrderableGenerators,
  listProjectTurbines, loadDeviceCosts,
  findPvUnit, listDeviceTypes, listOpexCostIdsForBridges, loadOpexDependency,
  listPlantSupplierCatalogue, loadTurbineAllocations, loadTypeName,
  type DeviceCosts, type GeneratorsProjectRow,
} from "@/data/generators";
import {
  generatorTypesQueryOptions, generatorsProjectQueryOptions, inverterTypesQueryOptions, projectPlanningQueryOptions,
  pvModuleCatalogQueryOptions, pvTypesQueryOptions, REFERENCE_STALE, simpleTypesQueryOptions, substructureTypesQueryOptions,
  turbinesByProjectQueryOptions,
} from "./queries";
import {
  accumulatedIndex, cancellationPayloadFor, needsPermissionCancellation, PERMISSION_MSG, toReplaceAllocations,
  type CatalogModel, type GeneratorTypeRow, type LandLeaseCostRow, type ModulePermissionPayload, type PermissionFamily,
  type PlantFamily, type PlantSupplierOption, type ProjectPlanning,
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

/**
 * `ScreenData` plus what the Screen needs to tell "no answer yet" from "an empty answer" (generators fixes F1, F3, F7):
 * - `hasData`: the query has data (possibly of a previous refresh), so a failed refetch need not blank the screen;
 * - `placeholder`: the data shown is the PREVIOUS key's (`placeholderData: keepPreviousData`) while the new key loads.
 */
export type ReadResult<T> = ScreenData<T> & { hasData?: boolean; placeholder?: boolean };

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown; isPlaceholderData?: boolean }, empty: T): ReadResult<T> =>
  ({
    data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true,
    hasData: q.data !== undefined, placeholder: q.isPlaceholderData === true,
  });

const NONE: never[] = [];

/** `gblRecordSelectedProject` (+ its country) — re-read on every visit, as `OnVisible` does. */
export function useGeneratorsProject(projectId: string | undefined): ReadResult<GeneratorsProjectRow | null> {
  // Key and function: `./queries.ts`, shared with the prefetch (D141).
  const q = useQuery({ ...generatorsProjectQueryOptions(projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, null);
}

/** `locProjectPlanning` — the height limitation. */
export function useProjectPlanning(projectId: string | undefined): ReadResult<ProjectPlanning | null> {
  const q = useQuery({ ...projectPlanningQueryOptions(projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, null);
}

/**
 * The orderable catalogue for the type panel (phase-out after FID). `enabled` (default true): the screen reads it only while a
 * panel that uses it is open (`loadGate.ts`, D141).
 *
 * D142 (`GENERATORS_PERF.persistCatalogue`, default OFF): the rows are kept in IndexedDB across sessions
 * (`data/generatorCatalogueCache.ts`: version key, 12 h maximum age, never anything personal). With the switch ON, a stored copy
 * is put into the query cache at once (stale-while-revalidate) while the normal read runs and REPLACES it; every successful
 * read refreshes the stored copy. Until that read has answered, the seeded rows count as "not known yet" (`hasData` false,
 * `isLoading` while the read runs), so the screen holds the writes back exactly as it does for a read that has not landed: a price from a
 * stale catalogue is shown, never saved. Any storage failure behaves as an empty cache (`persistedReference.ts`). OFF: the
 * code below the `persist` checks does not run, and the hook is what it was.
 */
export function useGeneratorCatalog(fid: string | null | undefined, enabled = true): ReadResult<CatalogModel[]> {
  const persist = generatorsPerf().persistCatalogue;
  const qc = useQueryClient();
  const key = qk.generatorCatalog(fid ?? "");
  const active = Boolean(fid) && enabled;
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const rows = await listOrderableGenerators(fid ?? null);
      if (persist && fid) void generatorCatalogueCache().write(fid, rows);
      return rows;
    },
    enabled: active,
    staleTime: REFERENCE_STALE,
  });
  useEffect(() => {
    if (!persist || !active || !fid) return;
    let cancelled = false;
    void generatorCatalogueCache().read(fid).then((hit) => {
      // The server may have answered first: its rows win, a cached copy never overwrites them.
      if (cancelled || !hit || qc.getQueryData(key) !== undefined) return;
      // `updatedAt: 0` marks the rows as seeded (and as stale, so the read that is already running is not skipped).
      qc.setQueryData(key, hit.data, { updatedAt: 0 });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is derived from `fid`; `qc` is stable
  }, [persist, active, fid, qc]);
  const result = out(q, NONE as CatalogModel[]);
  const seeded = persist && q.data !== undefined && q.dataUpdatedAt === 0;
  return seeded ? { ...result, isLoading: q.isFetching, hasData: false } : result;
}

/** The `Generator` rows of the project's types, whatever their phase-out. */
export function useGeneratorModels(ids: readonly string[]): ReadResult<CatalogModel[]> {
  // D143: memoized, so the key's id list keeps its identity while `ids` does (the screen passes a memoized list).
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const q = useQuery({
    queryKey: qk.generatorModels(sorted),
    queryFn: () => listGeneratorsByIds(sorted),
    enabled: sorted.length > 0,
    staleTime: REFERENCE_STALE,
    // F3: a save that adds or removes a type changes the key; keep the previous models until the new set has loaded.
    placeholderData: keepPreviousData,
  });
  return out(q, NONE as CatalogModel[]);
}

/**
 * `gblEstimationPriceInflationDirectConstants.AdditionalCost.AccumulatedIndex` (Y:63):
 * `prev + (curr − prev) × Month(FID) / 12`, blanks as 0 (rule 7).
 */
export function useInflationIndex(fid: string | null | undefined, enabled = true): ReadResult<number> {
  const year = fid ? Number(fid.slice(0, 4)) : NaN;
  const month = fid ? Number(fid.slice(5, 7)) : NaN;
  const q = useQuery({
    queryKey: qk.priceInflation(Number.isFinite(year) ? year : 0),
    queryFn: () => loadPriceInflation(year),
    enabled: Number.isFinite(year) && enabled,
    staleTime: REFERENCE_STALE,
  });
  const index = q.data
    ? accumulatedIndex(q.data.current?.accumulatedIndex, q.data.previous?.accumulatedIndex, Number.isFinite(month) ? month : 0)
    : 0;
  return out({ ...q, data: q.data ? index : undefined }, 0);
}

/** `gblDiviceCoststConstants`. `enabled` (default true): see `useGeneratorCatalog`. */
export function useDeviceCosts(countryId: string | null | undefined, enabled = true): ReadResult<DeviceCosts> {
  const q = useQuery({
    queryKey: qk.deviceCosts(countryId ?? ""),
    queryFn: () => loadDeviceCosts(countryId ?? null),
    staleTime: REFERENCE_STALE,
    enabled,
  });
  return out(q, { modules: null, inverter: null, mountingFix: null, mountingTracker: null });
}

export function useGeneratorTypes(projectId: string | undefined): ReadResult<GeneratorTypeRow[]> {
  const q = useQuery({ ...generatorTypesQueryOptions(projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, NONE as GeneratorTypeRow[]);
}

/** Every turbine of the project's WTG types (`colGeneratorsInProjectsTemporary`). */
export function useProjectTurbines(projectId: string | undefined, typeIds: readonly string[]): ReadResult<TurbineRow[]> {
  const sorted = useMemo(() => [...typeIds].sort(), [typeIds]);
  // D142 (`GENERATORS_PERF.readsByProject`, default OFF): read by the project, not by the type ids, so the turbines do not wait for
  // the types. The old read below stays exactly as it was; both go through the same `useQuery`, so the hook count is the same.
  const byProject = generatorsPerf().readsByProject;
  const q = useQuery({
    ...(byProject ? turbinesByProjectQueryOptions(projectId ?? "") : {
      queryKey: qk.generators(projectId ?? "", "turbines", ...sorted),
      queryFn: () => listProjectTurbines(sorted),
    }),
    enabled: Boolean(projectId) && (byProject || sorted.length > 0),
    // F3: the key embeds the type ids, so a save that adds or removes a type changes it; keep the previous turbines
    // (flagged `placeholder`) until the new set has loaded, so the list never blinks empty and the actions wait. Another
    // project's turbines are never kept (the key's second part is the project id).
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === projectId ? previous : undefined),
  });
  return out(q, NONE as TurbineRow[]);
}

/** `colPVModulesSuppliers`. */
export function usePvModuleCatalog(): ReadResult<PvModuleOption[]> {
  const q = useQuery(pvModuleCatalogQueryOptions());
  return out(q, NONE as PvModuleOption[]);
}

/**
 * G9 — the `Inverters` / `Substructures` catalogue for the Add / Edit panels, read only while that panel
 * is open (`enabled`); a failed read is shown in the panel.
 */
export function usePlantSupplierCatalog(kind: "inverter" | "substructure", enabled: boolean): ReadResult<PlantSupplierOption[]> {
  const q = useQuery({
    queryKey: qk.plantSupplierCatalog(kind),
    queryFn: () => listPlantSupplierCatalogue(kind),
    enabled,
    staleTime: REFERENCE_STALE,
  });
  return out(q, NONE as PlantSupplierOption[]);
}

/** The project's PV types, each with its `PVModule.Supplier` joined from the catalogue. */
export function usePvModuleTypes(projectId: string | undefined, modules: readonly PvModuleOption[]): ReadResult<SimpleTypeRow[]> {
  const q = useQuery({ ...pvTypesQueryOptions(projectId ?? ""), enabled: Boolean(projectId) });
  // D143: joined once per (rows, catalogue), so the PV section gets the same array until one of them changes.
  const data = useMemo(() => {
    const supplierOf = new Map(modules.map((m) => [m.id, m.supplier]));
    return q.data?.map((r) => ({ ...r, catalogueSupplier: r.catalogueId ? supplierOf.get(r.catalogueId) ?? null : null }));
  }, [q.data, modules]);
  return out({ ...q, data }, NONE as SimpleTypeRow[]);
}

export function useInverterTypes(projectId: string | undefined): ReadResult<SimpleTypeRow[]> {
  const q = useQuery({ ...inverterTypesQueryOptions(projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, NONE as SimpleTypeRow[]);
}

export function useSubstructureTypes(projectId: string | undefined): ReadResult<SimpleTypeRow[]> {
  const q = useQuery({ ...substructureTypesQueryOptions(projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, NONE as SimpleTypeRow[]);
}

/** BESS / Hydrogen / Substation. */
export function useSimpleTypes(
  family: "storage" | "hydrogen" | "substation", projectId: string | undefined,
): ReadResult<SimpleTypeRow[]> {
  const q = useQuery({ ...simpleTypesQueryOptions(family, projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, NONE as SimpleTypeRow[]);
}

/** The AllWTG land-lease costs a new turbine is allocated to (rule 20). `enabled` (default true): see `useGeneratorCatalog`. */
export function useAllWtgLandLeaseCosts(projectId: string | undefined, enabled = true): ReadResult<LandLeaseCostRow[]> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "allWtgCosts"),
    queryFn: () => listAllWtgLandLeaseCosts(projectId!),
    enabled: Boolean(projectId) && enabled,
  });
  return out(q, NONE as LandLeaseCostRow[]);
}

/** 1.21.753 — the O&M half of the delete / deactivate guard for the selected WTG or PV type. */
export function useOpexDependency(
  projectId: string | undefined, typeId: string | null | undefined,
): ReadResult<{ hasActiveDeviceType: boolean; hasActiveOpexCost: boolean }> {
  const q = useQuery({
    queryKey: qk.generators(projectId ?? "", "opexDependency", typeId ?? ""),
    queryFn: () => loadOpexDependency(projectId!, typeId!),
    enabled: Boolean(projectId) && Boolean(typeId),
  });
  // F1: `data` falls back to "no dependency" while the read is pending or failed; the Screen must read `hasData` (is it KNOWN?)
  // before it trusts that fallback.
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

/**
 * Runs the screen's writes and refreshes the screen, the session's project header and Milestones' copy.
 * Save performance (6 Nov 2026): the progress dialog closes once the writes have landed and the screen
 * reloads behind it (`refresh: "background"`); the Screen holds its actions back while `refreshing`.
 *
 * D141 (`GENERATORS_PERF.targetedReload`): the list below is the DEFAULT, "everything", and what a job gets when it carries no
 * reload kind (the rollback jobs, and every job while the switch is off). A save names its kind (`reload.ts`, `withReload`)
 * and refreshes only the queries that kind can change, through the job's own `invalidate`.
 */
export function useGeneratorWrites(projectId: string | undefined) {
  const id = projectId ?? "";
  return usePlanWrite({
    invalidate: [qk.generatorsAll(id), qk.project(id), qk.milestoneProject(id), qk.generalDataProject(id)],
    action: "change this project's generators",
    refresh: "background",
  });
}

/** A row a permission cancellation can be sent for (any of the four families). */
export type PermissionRow = Pick<SimpleTypeRow, "id" | "flowRunId" | "flowApprovalId">
  & Partial<Pick<GeneratorTypeRow, "generatorDisplayName">> & Partial<Pick<SimpleTypeRow, "moduleLabel" | "label">>;

/**
 * The two module-permission flows with the inputs every canvas call passes (D97): `User().Email` (the signed-in
 * user's principal name), `gblProjectManagmentAppID` (`vsb_ProjectManagementAppID`) and, for the request,
 * `gblPrimarilyApprovalGroupID` (`vsb_PrimarilyApprovalGroupID`). A blank input throws a clear message
 * (`PERMISSION_MSG.setupMissing`) instead of sending a blank the flow would reject. Called from a job's `plan` /
 * `then`, so a failure is the job's error.
 */
export function useModulePermissionFlows() {
  const { session, envVars } = useSession();
  const need = (value: string | null | undefined, what: string): string => {
    if (!value || !value.trim()) throw new Error(PERMISSION_MSG.setupMissing(what));
    return value;
  };
  const requesterEmail = () => need(session?.userPrincipalName, "your e-mail address");
  const appId = () => need(envVars.vsb_ProjectManagementAppID, "the environment variable vsb_ProjectManagementAppID");

  /** `RequestModulePermission.Run(…)` for a type row the plan has just written. */
  const request = (project: ModulePermissionPayload): Promise<FlowApprovalResult> => requestModulePermission({
    requesterEmail: requesterEmail(),
    approvalGroupId: need(envVars.vsb_PrimarilyApprovalGroupID, "the environment variable vsb_PrimarilyApprovalGroupID"),
    appId: appId(),
    project,
  });

  /** `Requestpermissioncancellation.Run(…)` for one row. */
  const cancel = (family: PermissionFamily, row: PermissionRow): Promise<void> => cancelModulePermission({
    requesterEmail: requesterEmail(), appId: appId(), module: cancellationPayloadFor(family, row),
  });

  /** The canvas `If(Not(IsBlank(<row>.FlowRunId)), Requestpermissioncancellation.Run(…))` before a delete / replace. */
  const cancelIfOpen = async (family: PermissionFamily, row: PermissionRow): Promise<void> => {
    if (needsPermissionCancellation(row)) await cancel(family, row);
  };

  return { request, cancel, cancelIfOpen };
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

/**
 * The WTG type delete's inputs: its turbines' allocations, and the O&M costs of ALL its device-type rows
 * (DEL-3, S7), with their chain members. `opexCostIds` keeps its shape: one de-duplicated id list.
 *
 * DIVERGENCE: the canvas follows only the first bridge row (`First(<type>.DeviceTypesInProjects)`, Y:65), so the O&M costs of any
 * further bridge row are left behind. This app takes ALL the bridge rows (D116; delete hardening plan claim 2, scenario S7).
 */
export async function loadTypeDeleteInputs(projectId: string, typeId: string, turbineIds: readonly string[]): Promise<{
  allocations: { id: string; costId: string }[]; countByCost: Record<string, number>; opexCostIds: string[];
}> {
  const [alloc, deviceTypes] = await Promise.all([loadTurbineAllocations(turbineIds), listDeviceTypes(typeId)]);
  const opexCostIds = await listOpexCostIdsForBridges(projectId, deviceTypes.map((d) => d.id));
  return { allocations: alloc.allocations, countByCost: alloc.countByCost, opexCostIds };
}

/**
 * The PV delete's inputs (G2): the type's unit(s), their land-lease allocations with their costs'
 * allocation counts, and the O&M costs of ALL the type's device-type rows (DEL-3).
 *
 * DIVERGENCE: the canvas follows only the first bridge row (`First(<type>.DeviceTypesInProjects)`, Y:65), so the O&M costs of any
 * further bridge row are left behind. This app takes ALL the bridge rows (D116; delete hardening plan claim 2, scenario S7).
 */
export async function loadPvDeleteInputs(projectId: string, pvId: string): Promise<{
  unitIds: string[]; allocations: { id: string; costId: string }[]; countByCost: Record<string, number>; opexCostIds: string[];
}> {
  const unitIds = (await listProjectTurbines([pvId])).map((u) => u.id);
  const inputs = await loadTypeDeleteInputs(projectId, pvId, unitIds);
  return { unitIds, ...inputs };
}

/**
 * A replace's T2a "Identify" (G6): the old type's device-type rows and the O&M costs on ALL of them (DEL-3), its
 * units, their land-lease allocations (with each cost's AllWTG flag) and the project's AllWTG costs.
 *
 * DIVERGENCE: the canvas follows only the first bridge row (`First(<type>.DeviceTypesInProjects)`, Y:65), so the O&M costs of any
 * further bridge row are left behind. This app takes ALL the bridge rows (D116; delete hardening plan claim 2, scenario S7).
 */
export async function loadReplaceInputs(projectId: string, typeId: string): Promise<ReplaceInputs> {
  const [deviceTypes, units, landLeaseCosts] = await Promise.all([
    listDeviceTypes(typeId), listProjectTurbines([typeId]), listAllWtgLandLeaseCosts(projectId),
  ]);
  const [opexCostIds, alloc] = await Promise.all([
    listOpexCostIdsForBridges(projectId, deviceTypes.map((d) => d.id)),
    loadTurbineAllocations(units.map((u) => u.id)),
  ]);
  return {
    bridgeIds: deviceTypes.map((d) => d.id),
    opexCostIds,
    unitIds: units.map((u) => u.id),
    allocations: toReplaceAllocations({
      allocations: alloc.allocations, units, allWtgCostIds: new Set(landLeaseCosts.map((c) => c.id)),
      // DEL-4: each allocation keeps its land-lease cost id, the `serialKey` of its delete (rules.ts reads it only when
      // `GENERATORS_DELETE.parentOrder` is on; nothing else reads the rows).
      keepCostIds: true,
    }),
    landLeaseCosts,
  };
}
