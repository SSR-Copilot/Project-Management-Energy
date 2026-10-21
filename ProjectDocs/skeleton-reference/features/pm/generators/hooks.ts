/**
 * Project Generators Screen — queries and mutations.
 *
 * Canvas screen: `Project Generators Screen` (PM app)
 *   642 controls · 15 931 lines of Power Fx · 190 substantive blocks · band XL
 *
 * `OnVisible` ran a `Concurrent(...)` of eleven `ClearCollect`s, one of which was
 * `ClearCollect(colGenerators, Generators)` — the ENTIRE model catalogue pulled to the
 * client and then re-filtered twice. Here every collection becomes a filtered `useQuery`
 * with a server `$filter`, and every `ForAll(..., Patch(...))` becomes one `$batch`.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colGeneratorTypesPagging` (see rules.ts). The turbine grid pages on the server.
 *  - `ForAll(colTemporaryGeneratorList, Patch(GeneratorInProjects, Defaults(...), {...}))`
 *    — N HTTP round-trips per save; now one `saveMany`.
 *  - `UpdateIf(GeneratorInProjects, ThisRecord in varFilteredGenerators, {...})` for the
 *    apply-to-all checkboxes — now one batched PATCH set.
 *  - The `Set(gblRecordSelectedProject, Patch(Projects, ...))` re-read after every save;
 *    TanStack invalidation covers it.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, countryRepo, generatorCatalogRepo, generatorTypeInProjectFullRepo,
  generatorInProjectFullRepo, pvModuleTypeInProjectRepo, inverterTypeInProjectRepo,
  substructureTypeInProjectRepo, storageTypeInProjectRepo, hydrogenTypeInProjectRepo,
  substationTypeInProjectRepo, deviceTypeInProjectRepo, deviceCostRepo,
  landLeaseAllocationRepo, landLeaseCostFullRepo, opexProjectCostFullRepo,
  estimationPriceInflationRepo, projectPlanningFullRepo,
  type ProjectRow,
} from "@/data/repos";
import { ES_PLANT, CHOICE_PLANT } from "@/data/entities";
import { qk } from "@/data/queryKeys";
import { dataClient, type WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, type AppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { requestModulePermission, cancelModulePermission } from "@/flows/flowClient";
import {
  GENERATOR_COL, GEN_TYPE_COL, GEN_INSTANCE_COL, PLANT_LOOKUP, PROJECT_PLANT_COL,
  DEVICE_TYPE, GENERATORS_PAGE_SIZE,
  accumulatedIndex, costPerWtg, generatorTypeTotals, buildTurbineNames, newTurbineHeights,
  turbineIndex, plantWtgTotals, plantPvCost, plantPvCapacity, plantStorageCapacity,
  plantHydrogenCapacity, plantSubstationCapacity, planTurbineAllocation, planApplyToAll,
  planStatusToggle, planTurbineDeletion, pendingPermissionFields,
  buildGeneratorPermissionPayload, buildInverterPermissionPayload,
  buildSubstructurePermissionPayload, buildCancellationPayload,
  needsPermissionCancellation, recomputeTypeFromChildren, planReplaceLandLease,
  buildPvTypeFields, PV_BRIDGE_MISSING,
  SAVE_ERROR_PREFIX,
  type CatalogModel, type ProjectedModel, type GeneratorsProject, type GeneratorTypeRow,
  type TurbineRow, type SimpleTypeRow, type ProjectPlanning, type LandLeaseCostRow,
  type PlantFamily, type ReplacePvForm, type ReplaceAllocation,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;
const state = (v: unknown): number => (typeof v === "number" ? v : CHOICE_PLANT.status.active);

const REF_STALE = 30 * 60_000;

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export function toGeneratorsProject(
  r: ProjectRow | undefined,
  country: { isoCurrencyCode: string | null; optionValue: number | null } | null,
): GeneratorsProject | null {
  if (!r) return null;
  return {
    id: r.vsb_projectid,
    projectIdText: str(r[PROJECT_PLANT_COL.projectIdText]),
    projectName: str(r[PROJECT_PLANT_COL.projectName]),
    shortName: str(r[PROJECT_PLANT_COL.shortName]),
    countryId: r._vsb_country_value,
    countryOptionValue: country?.optionValue ?? null,
    isoCurrencyCode: country?.isoCurrencyCode ?? null,
    totalCapacity: r.vsb_totalcapacity,
    fid: str(r[PROJECT_PLANT_COL.fid]),
    endDate: str(r[PROJECT_PLANT_COL.endDate]),
    projectStartDate: r.vsb_projectstartdate,
    projectManagerId: str(r[PROJECT_PLANT_COL.projectManager]),
    projectManagerEmail: str(
      r[`${PROJECT_PLANT_COL.projectManager}@OData.Community.Display.V1.FormattedValue`],
    ),
    owningBusinessUnitId: str(r[PROJECT_PLANT_COL.owningBusinessUnit]),
  };
}

/**
 * The `vsb_countryavailability` multi-select comes back as a comma-separated string of
 * option values. The canvas turned it into a string with `Concat` and used `in`; we parse
 * it into numbers once, here.
 */
function parseMultiSelect(v: unknown): number[] {
  if (typeof v === "number") return [v];
  if (typeof v !== "string" || v === "") return [];
  return v.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
}

export function toCatalogModel(r: Record<string, unknown>): CatalogModel {
  return {
    id: String(r[GENERATOR_COL.id] ?? ""),
    name: str(r[GENERATOR_COL.name]),
    displayName: str(r[GENERATOR_COL.displayName]),
    supplier: str(r[GENERATOR_COL.supplier]),
    turbineType: str(r[GENERATOR_COL.turbineType]),
    hubHeight: num(r[GENERATOR_COL.hubHeight]),
    rotorDiameter: num(r[GENERATOR_COL.rotorDiameter]),
    specificCapacity: num(r[GENERATOR_COL.specificCapacity]),
    earliestPhaseout: str(r[GENERATOR_COL.earliestPhaseout]),
    countryAvailability: parseMultiSelect(r[GENERATOR_COL.countryAvailability]),
    foundationCostIncluded: bool(r[GENERATOR_COL.foundationCostIncluded]),
    additionalFoundationCost: num(r[GENERATOR_COL.additionalFoundationCost]),
    prices: [
      num(r[GENERATOR_COL.price1]), num(r[GENERATOR_COL.price2]),
      num(r[GENERATOR_COL.price3]), num(r[GENERATOR_COL.price4]),
      num(r[GENERATOR_COL.price5]),
    ],
  };
}

export function toGeneratorTypeRow(r: Record<string, unknown>): GeneratorTypeRow {
  return {
    id: String(r[GEN_TYPE_COL.id] ?? ""),
    name: str(r[GEN_TYPE_COL.name]),
    generatorId: str(r[GEN_TYPE_COL.generator]),
    generatorDisplayName: str(
      r[`${GEN_TYPE_COL.generator}@OData.Community.Display.V1.FormattedValue`],
    ),
    numberOfGenerators: num(r[GEN_TYPE_COL.numberOfGenerators]),
    costPerWtg: num(r[GEN_TYPE_COL.costPerWtg]),
    generatorsCost: num(r[GEN_TYPE_COL.generatorsCost]),
    generatorsCapacity: num(r[GEN_TYPE_COL.generatorsCapacity]),
    requestPermissionState: num(r[GEN_TYPE_COL.requestPermissionState]),
    flowRunId: str(r[GEN_TYPE_COL.flowRunId]),
    flowApprovalId: str(r[GEN_TYPE_COL.flowApprovalId]),
    status: state(r["statecode"]),
    specificCapacity: null,
  };
}

export function toTurbineRow(r: Record<string, unknown>): TurbineRow {
  const name = str(r[GEN_INSTANCE_COL.name]);
  return {
    id: String(r[GEN_INSTANCE_COL.id] ?? ""),
    name,
    typeId: str(r[GEN_INSTANCE_COL.moduleTypeInProject]),
    index: turbineIndex(name),
    effectiveCapacity: num(r[GEN_INSTANCE_COL.effectiveCapacity]),
    effectiveHubHeight: num(r[GEN_INSTANCE_COL.effectiveHubHeight]),
    effectiveHubHeightChanged: bool(r[GEN_INSTANCE_COL.effectiveHubHeightChanged]),
    foundationPlinth: num(r[GEN_INSTANCE_COL.foundationPlinth]),
    hubHeightExclPlinth: num(r[GEN_INSTANCE_COL.hubHeightExclPlinth]),
    totalHeight: num(r[GEN_INSTANCE_COL.totalHeight]),
    status: state(r["statecode"]),
  };
}

/** One mapper for the six non-WTG families; the column names differ per table. */
function makeSimpleMapper(cols: {
  id: string; name: string; supplier?: string; otherSupplier?: string;
  capacity?: string; cost?: string; permission?: string;
  moduleLabel?: string; degradation1stYear?: string; degradationRemainingYears?: string;
}) {
  return (r: Record<string, unknown>): SimpleTypeRow => ({
    id: String(r[cols.id] ?? ""),
    name: str(r[cols.name]),
    supplier: cols.supplier ? str(r[cols.supplier]) : null,
    otherSupplier: cols.otherSupplier ? str(r[cols.otherSupplier]) : null,
    capacity: cols.capacity ? num(r[cols.capacity]) : null,
    cost: cols.cost ? num(r[cols.cost]) : null,
    // GUIDE q11 — PV-only fields; every other family leaves these null.
    moduleLabel: cols.moduleLabel ? str(r[cols.moduleLabel]) : null,
    degradation1stYear: cols.degradation1stYear ? num(r[cols.degradation1stYear]) : null,
    degradationRemainingYears:
      cols.degradationRemainingYears ? num(r[cols.degradationRemainingYears]) : null,
    requestPermissionState: cols.permission ? num(r[cols.permission]) : null,
    flowRunId: str(r["vsb_flowrunid"]),
    flowApprovalId: str(r["vsb_flowapprovalid"]),
    status: state(r["statecode"]),
  });
}

export const toPvRow = makeSimpleMapper({
  id: "vsb_pvmoduletypeinprojectid", name: "vsb_name", supplier: "vsb_type",
  otherSupplier: "vsb_othersupplier", capacity: "vsb_capacity", cost: "vsb_cost",
  moduleLabel: "vsb_label",
  degradation1stYear: "vsb_degradation1styear",
  degradationRemainingYears: "vsb_degradationremainingyears",
  permission: "vsb_requestpermissionstate",
});
export const toInverterRow = makeSimpleMapper({
  id: "vsb_invertertypeinprojectid", name: "vsb_name", supplier: "vsb_inverterlabel",
  otherSupplier: "vsb_invothersupplier", cost: "vsb_invertertypecost",
  permission: "vsb_requestpermissionstate",
});
export const toSubstructureRow = makeSimpleMapper({
  id: "vsb_substructuretypeinprojectid", name: "vsb_name",
  supplier: "vsb_substructurelabel", otherSupplier: "vsb_substrothersupplier",
  cost: "vsb_substructurecost", permission: "vsb_requestpermissionstate",
});
export const toStorageRow = makeSimpleMapper({
  id: "vsb_storagetypeinprojectid", name: "vsb_name", supplier: "vsb_supplier",
  capacity: "vsb_storagecapacitydec",
});
export const toHydrogenRow = makeSimpleMapper({
  id: "vsb_hydrogentypeinprojectid", name: "vsb_name", supplier: "vsb_supplier",
  capacity: "vsb_hydrogencapacitydec",
});
export const toSubstationRow = makeSimpleMapper({
  id: "vsb_substationtypeinprojectid", name: "vsb_name", supplier: "vsb_supplier",
  capacity: "vsb_substationcapacitydec",
});

/* ═══════════════════════════════════════════════════════════════════ queries ════ */

export function useGeneratorsProject(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["generators", "project", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const record = await projectFullRepo.getById(projectId!, [
        PROJECT_PLANT_COL.id, PROJECT_PLANT_COL.projectIdText, PROJECT_PLANT_COL.projectName,
        PROJECT_PLANT_COL.shortName, PROJECT_PLANT_COL.country, PROJECT_PLANT_COL.technology,
        PROJECT_PLANT_COL.totalCapacity, PROJECT_PLANT_COL.fid, PROJECT_PLANT_COL.endDate,
        PROJECT_PLANT_COL.projectStartDate, PROJECT_PLANT_COL.projectManager,
        PROJECT_PLANT_COL.owningBusinessUnit, PROJECT_PLANT_COL.plantPvCapacity,
      ]);
      let country: { isoCurrencyCode: string | null; optionValue: number | null } | null = null;
      const countryId = record?._vsb_country_value;
      if (countryId) {
        const c = await countryRepo.getById(countryId, [
          "vsb_countryid", "vsb_name", "vsb_code", "vsb_isocurrencycode", "vsb_optionvalue",
        ]).catch(() => undefined);
        const raw = c as Record<string, unknown> | undefined;
        country = {
          isoCurrencyCode: str(raw?.["vsb_isocurrencycode"]),
          optionValue: num(raw?.["vsb_optionvalue"]),
        };
      }
      return { record, country };
    },
    staleTime: 30_000,
  });
  return {
    project: toGeneratorsProject(q.data?.record, q.data?.country ?? null),
    /** Read-only on this screen; the substructure cost derivation needs it. */
    plantPvCapacity: num(q.data?.record?.[PROJECT_PLANT_COL.plantPvCapacity]),
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/** `locProjectPlanning` — the height limitation the save gate reads. */
export function useProjectPlanning(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["generators", "planning", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await projectPlanningFullRepo.byProject(projectId!, {
        select: [
          "vsb_projectplanningid", "vsb_isheightlimitationforwtg", "vsb_heightlimitationm",
        ],
      });
      return rows[0];
    },
    staleTime: 60_000,
  });
  const planning: ProjectPlanning | null = q.data
    ? {
        isHeightLimitationForWtg: bool(q.data["vsb_isheightlimitationforwtg"]),
        heightLimitation: num(q.data["vsb_heightlimitationm"]),
      }
    : null;
  return { planning, isLoading: q.isLoading };
}

/**
 * Rules 1–2 as ONE server query.
 *
 * Replaces `ClearCollect(colGenerators, Generators)` plus the two client-side passes over
 * it. The FID guard is pushed into `$filter`; the availability flag is computed in
 * `projectCatalog` because it needs the project's country and Dataverse cannot filter a
 * multi-select membership cheaply.
 */
export function useGeneratorCatalog(project: GeneratorsProject | null) {
  const fid = project?.fid ?? null;
  const q = useQuery({
    queryKey: ["generators", "catalog", fid ?? "none"],
    enabled: Boolean(fid),
    queryFn: async () => {
      const rows = await generatorCatalogRepo.listAll({
        filter: f.and(
          f.gt(GENERATOR_COL.earliestPhaseout, `${new Date(fid!).toISOString()}`),
          f.eq("statecode", CHOICE_PLANT.status.active),
        ),
        orderBy: [asc(GENERATOR_COL.displayName)],
      });
      return rows.map(toCatalogModel);
    },
    staleTime: REF_STALE,
  });

  const models: ProjectedModel[] = useMemo(() => {
    if (!q.data || !project) return [];
    // The `$filter` above already applied rule 1; `projectCatalog` re-applies it (cheap,
    // and it keeps the rule testable in one place) and adds the availability flag.
    return q.data
      .filter((m) => Boolean(m.earliestPhaseout))
      .map((m) => {
        const isAvailable =
          project.countryOptionValue !== null &&
          m.countryAvailability.includes(project.countryOptionValue);
        return {
          ...m,
          isAvailable,
          availability: isAvailable ? "available" : "not available",
          fullDisplayName: `${m.displayName ?? m.name ?? ""} - ${
            isAvailable ? "available" : "not available"
          }`,
        };
      });
  }, [q.data, project]);

  return { models, isLoading: q.isLoading, isError: q.isError };
}

/** `Estimation Price Inflations` for FID year and FID year − 1 (rule 7). */
export function useInflationIndex(project: GeneratorsProject | null) {
  const fid = project?.fid ?? null;
  const year = fid ? new Date(fid).getFullYear() : null;
  const month = fid ? new Date(fid).getMonth() + 1 : null;
  const q = useQuery({
    queryKey: ["generators", "inflation", year ?? 0],
    enabled: year !== null,
    queryFn: async () => {
      const rows = await estimationPriceInflationRepo.listAll({
        filter: f.inList("vsb_fidyear", [year!, year! - 1]),
      });
      return rows;
    },
    staleTime: REF_STALE,
  });
  const current = q.data?.find((r) => r.vsb_fidyear === year);
  const previous = q.data?.find((r) => r.vsb_fidyear === (year ?? 0) - 1);
  const index = accumulatedIndex(
    current?.vsb_accumulatedpriceescalationindex,
    previous?.vsb_accumulatedpriceescalationindex,
    month,
  );
  return { accumulatedIndex: index, isLoading: q.isLoading };
}

/** `colDeviceCosts` → `gblDiviceCoststConstants`, scoped to the project's country. */
export function useDeviceCosts(countryId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["generators", "deviceCosts", countryId ?? "none"],
    enabled: Boolean(countryId),
    queryFn: () =>
      deviceCostRepo.listAll({ filter: f.guid("_vsb_country_value", countryId!) }),
    staleTime: REF_STALE,
  });
  const byType = (t: string) =>
    num(q.data?.find((r) => str(r["vsb_devicetype"]) === t)?.["vsb_devicecostcurrency"]);
  return {
    modules: byType(DEVICE_TYPE.modules),
    inverter: byType(DEVICE_TYPE.inverter),
    mountingFix: byType(DEVICE_TYPE.mountingFix),
    mountingTracker: byType(DEVICE_TYPE.mountingTracker),
    isLoading: q.isLoading,
  };
}

export function useGeneratorTypes(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("generatorTypes", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await generatorTypeInProjectFullRepo.byProject(projectId!)).map(toGeneratorTypeRow),
    staleTime: 15_000,
  });
  return { types: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/**
 * The turbines of the currently expanded types.
 *
 * The canvas held ALL turbines of ALL types in `colGeneratorsInProjectsTemporary` and
 * paged the display client-side. Here the query is scoped to the type ids on screen and
 * capped at the old page size; TanStack owns the cache.
 */
export function useTurbines(typeIds: string[]) {
  const key = typeIds.slice().sort().join(",");
  const q = useQuery({
    queryKey: ["generators", "turbines", key],
    enabled: typeIds.length > 0,
    queryFn: async () => {
      const rows = await generatorInProjectFullRepo.listAll({
        filter: f.inList(GEN_INSTANCE_COL.moduleTypeInProject, typeIds),
        orderBy: [asc(GEN_INSTANCE_COL.name)],
        maxPageSize: GENERATORS_PAGE_SIZE,
      });
      return rows.map(toTurbineRow);
    },
    staleTime: 15_000,
  });
  const byType = useMemo(() => {
    const m = new Map<string, TurbineRow[]>();
    for (const t of q.data ?? []) {
      const list = m.get(t.typeId ?? "") ?? [];
      list.push(t);
      m.set(t.typeId ?? "", list);
    }
    for (const list of m.values()) list.sort((a, b) => a.index - b.index);
    return m;
  }, [q.data]);
  return { turbines: q.data ?? [], byType, isLoading: q.isLoading };
}

function useSimpleFamily<T>(
  family: string,
  projectId: string | undefined,
  load: (id: string) => Promise<Record<string, unknown>[]>,
  map: (r: Record<string, unknown>) => T,
) {
  const q = useQuery({
    queryKey: qk.child(family, projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => (await load(projectId!)).map(map),
    staleTime: 15_000,
  });
  return { rows: (q.data ?? []) as T[], isLoading: q.isLoading };
}

export const usePvModuleTypes = (id: string | undefined) =>
  useSimpleFamily("pvTypes", id, (p) => pvModuleTypeInProjectRepo.byProject(p), toPvRow);
export const useInverterTypes = (id: string | undefined) =>
  useSimpleFamily("inverterTypes", id, (p) => inverterTypeInProjectRepo.byProject(p), toInverterRow);
export const useSubstructureTypes = (id: string | undefined) =>
  useSimpleFamily("substructureTypes", id, (p) => substructureTypeInProjectRepo.byProject(p), toSubstructureRow);
export const useStorageTypes = (id: string | undefined) =>
  useSimpleFamily("storageTypes", id, (p) => storageTypeInProjectRepo.byProject(p), toStorageRow);
export const useHydrogenTypes = (id: string | undefined) =>
  useSimpleFamily("hydrogenTypes", id, (p) => hydrogenTypeInProjectRepo.byProject(p), toHydrogenRow);
export const useSubstationTypes = (id: string | undefined) =>
  useSimpleFamily("substationTypes", id, (p) => substationTypeInProjectRepo.byProject(p), toSubstationRow);

/** Rule 20's source set — land-lease costs flagged `AllWTGAllocated = Yes`. */
export function useAllocatableLandLeaseCosts(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["generators", "landLeaseAllocatable", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await landLeaseCostFullRepo.byProject(projectId!, {
        filter: f.eq("vsb_allwtgallocated", true),
      });
      return rows.map<LandLeaseCostRow>((r) => ({
        id: String(r["vsb_landleaseprojectcostid"] ?? ""),
        landOwner: str(r["vsb_landowner"]),
        description: str(r["vsb_description"]),
        allWtgAllocated: bool(r["vsb_allwtgallocated"]),
      }));
    },
    staleTime: 60_000,
  });
  return { costs: q.data ?? [], isLoading: q.isLoading };
}

/* ═════════════════════════════════════════════════════════════════ mutations ════ */

interface RollUpArgs {
  projectId: string;
  types: GeneratorTypeRow[];
}

/** Rule 14 — the WTG roll-up, as a write op rather than a `Patch` side effect. */
function wtgRollUpOp(args: RollUpArgs): WriteOp {
  const totals = plantWtgTotals(args.types);
  return {
    op: "update",
    entitySet: "vsb_projects",
    id: args.projectId,
    data: {
      [PROJECT_PLANT_COL.plantWtgCapacity]: totals.capacityMW,
      [PROJECT_PLANT_COL.plantWtgCost]: totals.costEUR,
    },
  };
}

export interface SaveGeneratorTypePayload {
  project: GeneratorsProject;
  /** Existing type row when editing, `null` when adding. */
  existing: GeneratorTypeRow | null;
  model: ProjectedModel;
  count: number;
  costPerWtgValue: number;
  /** `cmb_Supplier_2.Selected.Height` — 0 for the Dummy-supplier path. */
  selectedHeight: number;
  typedHubHeight: number | null;
  /** `tgl_btn_…_Filter_Country.Checked` — true means in-country, direct save. */
  inCountry: boolean;
  /** Every type in the project, for the roll-up. */
  allTypes: GeneratorTypeRow[];
  existingTurbines: TurbineRow[];
  allocatableCosts: LandLeaseCostRow[];
}

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.OnChange`, collapsed.
 *
 * The canvas body is ~300 lines and appears THREE times (the button plus two
 * height-limitation `OnConfirm` copies). One implementation; the height override is a
 * flag on the call, not a duplicate body.
 *
 * Ordering matters and is preserved: upsert the type, create the turbines, upsert the
 * DeviceTypesInProjects shadow row, then EITHER patch `Projects` (in-country) OR call the
 * flow (out-of-country) — never both. Rule 15: the roll-up is deliberately skipped on the
 * request path because the flow owns it.
 */
export function useSaveGeneratorType() {
  const qc = useQueryClient();
  return useMutation<
    { typeId: string; requested: boolean }, AppError, SaveGeneratorTypePayload
  >({
    mutationFn: async (p) => {
      try {
        return await persistGeneratorType(p);
      } catch (e) {
        throw toAppError(e, SAVE_ERROR_PREFIX);
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "turbines"] });
      void qc.invalidateQueries({ queryKey: qk.projects.one(p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

/**
 * The body of the Save, shared by `useSaveGeneratorType` and — since canvas 1.21.753 — by
 * `useReplaceGeneratorType`, whose T2d ADD is "an adapted body of
 * pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.OnChange, always against Defaults()".
 * Throws; the callers wrap the error with their own prefix.
 */
export async function persistGeneratorType(
  p: SaveGeneratorTypePayload,
): Promise<{ typeId: string; requested: boolean }> {
        const totals = generatorTypeTotals({
          count: p.count,
          costPerWtg: p.costPerWtgValue,
          specificCapacity: p.model.specificCapacity,
        });

        const typeFields: Record<string, unknown> = {
          [`${PLANT_LOOKUP.project}@odata.bind`]: `/vsb_projects(${p.project.id})`,
          [`${PLANT_LOOKUP.generator}@odata.bind`]: `/${ES_PLANT.generators}(${p.model.id})`,
          [GEN_TYPE_COL.numberOfGenerators]: p.count,
          [GEN_TYPE_COL.costPerWtg]: p.costPerWtgValue,
          [GEN_TYPE_COL.generatorsCost]: totals.generatorsCost,
          [GEN_TYPE_COL.generatorsCapacity]: totals.generatorsCapacity,
        };
        if (p.project.owningBusinessUnitId) {
          typeFields[`${PLANT_LOOKUP.owningBusinessUnit}@odata.bind`] =
            `/businessunits(${p.project.owningBusinessUnitId})`;
        }

        const typeId = p.existing
          ? (await generatorTypeInProjectFullRepo.update(p.existing.id, typeFields), p.existing.id)
          : await generatorTypeInProjectFullRepo.create(typeFields);

        trace("information", `G001: Patch GeneratorType => ${typeId}`);

        /* Rule 9 + 10 — materialise the turbines in ONE batch. */
        const names = buildTurbineNames({
          shortName: p.project.shortName,
          existing: p.existingTurbines,
          count: p.count,
        });
        const heights = newTurbineHeights({
          selectedHeight: p.selectedHeight,
          typedHubHeight: p.typedHubHeight,
          catalogHubHeight: p.model.hubHeight,
          rotorDiameter: p.model.rotorDiameter,
        });
        const turbineOps: Omit<WriteOp, "entitySet">[] = names.map((name) => ({
          op: "create",
          data: {
            [GEN_INSTANCE_COL.name]: name,
            [`${PLANT_LOOKUP.moduleTypeInProject}@odata.bind`]:
              `/${ES_PLANT.generatorTypeInProjects}(${typeId})`,
            [GEN_INSTANCE_COL.effectiveCapacity]: p.model.specificCapacity ?? 0,
            [GEN_INSTANCE_COL.totalHeight]: heights.totalHeight,
            [GEN_INSTANCE_COL.hubHeightExclPlinth]: heights.hubHeightExclPlinth,
            // SOURCE DEFECT (ambiguity 7): the canvas writes for 'Effective Hub Height'
            // and 'Effective Hub Height Changed' are commented out here. Not resurrected —
            // the grid tag that reads them is therefore inert, as in the canvas.
            ...(p.project.owningBusinessUnitId
              ? {
                  [`${PLANT_LOOKUP.owningBusinessUnit}@odata.bind`]:
                    `/businessunits(${p.project.owningBusinessUnitId})`,
                }
              : {}),
          },
        }));
        if (turbineOps.length > 0) {
          await generatorInProjectFullRepo.saveMany(turbineOps);
        }

        /* Rule 19 — the DeviceTypesInProjects shadow row, once per type. */
        const shadow = await deviceTypeInProjectRepo.getOne(
          f.guid("_vsb_typeinprojectid_value", typeId)!,
          ["vsb_devicetypesinprojectid"],
        );
        if (!shadow) {
          await deviceTypeInProjectRepo.create({
            "vsb_name": p.model.displayName ?? p.model.name ?? "",
            [`${PLANT_LOOKUP.typeInProject}@odata.bind`]:
              `/${ES_PLANT.generatorTypeInProjects}(${typeId})`,
            ...(p.project.owningBusinessUnitId
              ? {
                  [`${PLANT_LOOKUP.owningBusinessUnit}@odata.bind`]:
                    `/businessunits(${p.project.owningBusinessUnitId})`,
                }
              : {}),
          });
        }

        /* Rule 20 — auto-allocate the NEW turbines into land lease. */
        if (!p.existing && p.allocatableCosts.length > 0 && names.length > 0) {
          const created = await generatorInProjectFullRepo.listAll({
            filter: f.and(
              f.guid(GEN_INSTANCE_COL.moduleTypeInProject, typeId),
              f.inList(GEN_INSTANCE_COL.name, names),
            ),
            select: [GEN_INSTANCE_COL.id, GEN_INSTANCE_COL.name],
          });
          const plans = planTurbineAllocation({
            costs: p.allocatableCosts,
            turbines: created.map((r) => ({
              id: String(r[GEN_INSTANCE_COL.id] ?? ""),
              name: str(r[GEN_INSTANCE_COL.name]),
            })),
          });
          if (plans.length > 0) {
            await landLeaseAllocationRepo.saveMany(
              plans.map((a) => ({
                op: "create" as const,
                data: {
                  "vsb_name": a.name,
                  [`${PLANT_LOOKUP.projectCost}@odata.bind`]:
                    `/${ES_PLANT.landLeaseProjectCosts}(${a.costId})`,
                  [`${PLANT_LOOKUP.generatorInProject}@odata.bind`]:
                    `/${ES_PLANT.generatorInProjects}(${a.generatorInProjectId})`,
                },
              })),
            );
          }
        }

        /* Rules 14–15 — roll up, or request permission. Never both. */
        if (p.inCountry) {
          const next: GeneratorTypeRow[] = p.existing
            ? p.allTypes.map((t) =>
                t.id === typeId
                  ? { ...t, generatorsCapacity: totals.generatorsCapacity, generatorsCost: totals.generatorsCost }
                  : t,
              )
            : [
                ...p.allTypes,
                {
                  id: typeId, name: null, generatorId: p.model.id,
                  generatorDisplayName: p.model.displayName,
                  numberOfGenerators: p.count, costPerWtg: p.costPerWtgValue,
                  generatorsCost: totals.generatorsCost,
                  generatorsCapacity: totals.generatorsCapacity,
                  requestPermissionState: null, flowRunId: null, flowApprovalId: null,
                  status: CHOICE_PLANT.status.active, specificCapacity: p.model.specificCapacity,
                },
              ];
          await dataClient.batch([wtgRollUpOp({ projectId: p.project.id, types: next })]);
          return { typeId, requested: false };
        }

        const payload = buildGeneratorPermissionPayload(p.project, typeId, p.model.id);
        const flow = await requestModulePermission({
          projectId: p.project.id,
          moduleType: String(payload.ModuleType),
          generatorTypeInProjectId: typeId,
          justification: JSON.stringify(payload),
        });
        await generatorTypeInProjectFullRepo.update(
          typeId,
          pendingPermissionFields({
            runId: (flow as { runId?: string }).runId ?? "",
            approvalId: flow.approvalId,
          }),
        );
        return { typeId, requested: true };
}

export interface SaveTurbinePayload {
  project: GeneratorsProject;
  type: GeneratorTypeRow;
  model: ProjectedModel | null;
  accumulatedIndex: number;
  /** Existing turbine when editing, `null` when adding one. */
  existing: TurbineRow | null;
  nameIndex: string;
  effectiveCapacity: number;
  hubHeight: number;
  foundationPlinth: number;
  applyCapacityToAll: boolean;
  applyHubHeightToAll: boolean;
  applyPlinthToAll: boolean;
  siblings: TurbineRow[];
  allTypes: GeneratorTypeRow[];
  allocatableCosts: LandLeaseCostRow[];
}

/**
 * `pcf_btn_…_Generator_Buttons_Save.OnChange` — one turbine, plus the three apply-to-all
 * bulk updates (rule 12), plus the type re-derivation from its children (rule 13).
 */
export function useSaveTurbine() {
  const qc = useQueryClient();
  return useMutation<{ turbineId: string }, AppError, SaveTurbinePayload>({
    mutationFn: async (p) => {
      try {
        const totalHeight =
          p.hubHeight + p.foundationPlinth + 0.5 * (p.model?.rotorDiameter ?? 0);
        const fields: Record<string, unknown> = {
          [GEN_INSTANCE_COL.name]: `WTG ${p.project.shortName ?? ""}_${p.nameIndex}`,
          [GEN_INSTANCE_COL.effectiveCapacity]: p.effectiveCapacity,
          [GEN_INSTANCE_COL.hubHeightExclPlinth]: p.hubHeight,
          [GEN_INSTANCE_COL.foundationPlinth]: p.foundationPlinth,
          [GEN_INSTANCE_COL.totalHeight]: totalHeight,
        };
        let turbineId: string;
        if (p.existing) {
          await generatorInProjectFullRepo.update(p.existing.id, fields);
          turbineId = p.existing.id;
        } else {
          turbineId = await generatorInProjectFullRepo.create({
            ...fields,
            [`${PLANT_LOOKUP.moduleTypeInProject}@odata.bind`]:
              `/${ES_PLANT.generatorTypeInProjects}(${p.type.id})`,
            ...(p.project.owningBusinessUnitId
              ? {
                  [`${PLANT_LOOKUP.owningBusinessUnit}@odata.bind`]:
                    `/businessunits(${p.project.owningBusinessUnitId})`,
                }
              : {}),
          });
        }

        /* Rule 12 — one batched PATCH set, not an `UpdateIf` loop. */
        const bulk = planApplyToAll({
          siblings: p.siblings.filter((s) => s.id !== turbineId),
          applyCapacity: p.applyCapacityToAll,
          applyHubHeight: p.applyHubHeightToAll,
          applyFoundationPlinth: p.applyPlinthToAll,
          effectiveCapacity: p.effectiveCapacity,
          hubHeight: p.hubHeight,
          foundationPlinth: p.foundationPlinth,
        });
        if (bulk && bulk.ids.length > 0) {
          await generatorInProjectFullRepo.saveMany(
            bulk.ids.map((id) => ({ op: "update" as const, id, data: bulk.fields })),
          );
        }

        /* Rule 20 — a NEW single turbine is auto-allocated too. */
        if (!p.existing && p.allocatableCosts.length > 0) {
          const plans = planTurbineAllocation({
            costs: p.allocatableCosts,
            turbines: [{ id: turbineId, name: String(fields[GEN_INSTANCE_COL.name]) }],
          });
          if (plans.length > 0) {
            await landLeaseAllocationRepo.saveMany(
              plans.map((a) => ({
                op: "create" as const,
                data: {
                  "vsb_name": a.name,
                  [`${PLANT_LOOKUP.projectCost}@odata.bind`]:
                    `/${ES_PLANT.landLeaseProjectCosts}(${a.costId})`,
                  [`${PLANT_LOOKUP.generatorInProject}@odata.bind`]:
                    `/${ES_PLANT.generatorInProjects}(${a.generatorInProjectId})`,
                },
              })),
            );
          }
        }

        /* Rule 13 — re-derive the type FROM ITS CHILDREN, not from the form. */
        const children = await generatorInProjectFullRepo.listAll({
          filter: f.guid(GEN_INSTANCE_COL.moduleTypeInProject, p.type.id),
          select: [GEN_INSTANCE_COL.id, GEN_INSTANCE_COL.effectiveCapacity],
        });
        const derived = recomputeTypeFromChildren({
          children: children.map((c) => ({
            effectiveCapacity: num(c[GEN_INSTANCE_COL.effectiveCapacity]),
          })),
          model: p.model,
          accumulatedIndex: p.accumulatedIndex,
        });
        await generatorTypeInProjectFullRepo.update(p.type.id, {
          [GEN_TYPE_COL.numberOfGenerators]: derived.numberOfGenerators,
          [GEN_TYPE_COL.generatorsCapacity]: derived.generatorsCapacity,
          [GEN_TYPE_COL.costPerWtg]: derived.costPerWtg,
          [GEN_TYPE_COL.generatorsCost]: derived.generatorsCost,
        });

        const next = p.allTypes.map((t) =>
          t.id === p.type.id
            ? {
                ...t,
                generatorsCapacity: derived.generatorsCapacity,
                generatorsCost: derived.generatorsCost,
              }
            : t,
        );
        await dataClient.batch([wtgRollUpOp({ projectId: p.project.id, types: next })]);
        return { turbineId };
      } catch (e) {
        throw toAppError(e, SAVE_ERROR_PREFIX);
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: ["generators", "turbines"] });
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

export interface DeleteTurbinePayload {
  project: GeneratorsProject;
  type: GeneratorTypeRow;
  turbine: TurbineRow;
  model: ProjectedModel | null;
  accumulatedIndex: number;
  allTypes: GeneratorTypeRow[];
}

/** Rule 21 — the conditional land-lease cascade, then rule 13's re-derivation. */
export function useDeleteTurbine() {
  const qc = useQueryClient();
  return useMutation<void, AppError, DeleteTurbinePayload>({
    mutationFn: async (p) => {
      try {
        const mine = await landLeaseAllocationRepo.listAll({
          filter: f.guid("_vsb_generatorinproject_value", p.turbine.id),
          select: ["vsb_landleaseallocationwtgid", "_vsb_projectcost_value"],
        });
        const allocations = mine.map((a) => ({
          id: String(a["vsb_landleaseallocationwtgid"] ?? ""),
          costId: String(a["_vsb_projectcost_value"] ?? ""),
        }));
        const siblingCountByCost: Record<string, number> = {};
        for (const costId of new Set(allocations.map((a) => a.costId))) {
          const rows = await landLeaseAllocationRepo.listAll({
            filter: f.guid("_vsb_projectcost_value", costId),
            select: ["vsb_landleaseallocationwtgid"],
          });
          siblingCountByCost[costId] = rows.length;
        }
        for (const step of planTurbineDeletion({ allocations, siblingCountByCost })) {
          if (step.kind === "removeAllocation") {
            await landLeaseAllocationRepo.remove(step.allocationId);
          } else {
            await landLeaseCostFullRepo.remove(step.costId);
          }
        }

        await generatorInProjectFullRepo.remove(p.turbine.id);

        const children = await generatorInProjectFullRepo.listAll({
          filter: f.guid(GEN_INSTANCE_COL.moduleTypeInProject, p.type.id),
          select: [GEN_INSTANCE_COL.id, GEN_INSTANCE_COL.effectiveCapacity],
        });
        const derived = recomputeTypeFromChildren({
          children: children.map((c) => ({
            effectiveCapacity: num(c[GEN_INSTANCE_COL.effectiveCapacity]),
          })),
          model: p.model,
          accumulatedIndex: p.accumulatedIndex,
        });
        await generatorTypeInProjectFullRepo.update(p.type.id, {
          [GEN_TYPE_COL.numberOfGenerators]: derived.numberOfGenerators,
          [GEN_TYPE_COL.generatorsCapacity]: derived.generatorsCapacity,
          [GEN_TYPE_COL.costPerWtg]: derived.costPerWtg,
          [GEN_TYPE_COL.generatorsCost]: derived.generatorsCost,
        });
        const next = p.allTypes.map((t) =>
          t.id === p.type.id
            ? {
                ...t,
                generatorsCapacity: derived.generatorsCapacity,
                generatorsCost: derived.generatorsCost,
              }
            : t,
        );
        await dataClient.batch([wtgRollUpOp({ projectId: p.project.id, types: next })]);
      } catch (e) {
        throw toAppError(e, "Turbine could not be deleted");
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: ["generators", "turbines"] });
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

export interface DeleteGeneratorTypePayload {
  project: GeneratorsProject;
  type: GeneratorTypeRow;
  allTypes: GeneratorTypeRow[];
}

/**
 * Rule 22 — deleting a generator type also deletes its OPEX costs and cancels any open
 * approval.
 *
 * SOURCE DEFECT (ambiguity 10): the canvas fires `Requestpermissioncancellation.Run(...)`
 * and then `Remove(...)` with no error handling between them, so a failed cancellation
 * still deletes the row and orphans the approval. Here the cancellation is AWAITED first
 * and a failure aborts the delete. That is a deliberate divergence.
 */
export function useDeleteGeneratorType() {
  const qc = useQueryClient();
  return useMutation<void, AppError, DeleteGeneratorTypePayload>({
    mutationFn: async (p) => {
      try {
        if (needsPermissionCancellation({ flowRunId: p.type.flowRunId })) {
          const payload = buildCancellationPayload("wtg", {
            id: p.type.id, name: p.type.generatorDisplayName,
            flowRunId: p.type.flowRunId, flowApprovalId: p.type.flowApprovalId,
          });
          trace("information", "cancel module permission", { ...payload });
          await cancelModulePermission({ permissionRequestId: p.type.id });
        }

        const shadow = await deviceTypeInProjectRepo.getOne(
          f.guid("_vsb_typeinprojectid_value", p.type.id)!,
          ["vsb_devicetypesinprojectid"],
        );
        if (shadow) {
          const shadowId = String(shadow["vsb_devicetypesinprojectid"] ?? "");
          const opex = await opexProjectCostFullRepo.byProject(p.project.id, {
            filter: f.guid("_vsb_devicetypeinproject_value", shadowId),
            select: ["vsb_opexprojectcostid"],
          });
          if (opex.length > 0) {
            await opexProjectCostFullRepo.saveMany(
              opex.map((o) => ({
                op: "delete" as const,
                id: String(o["vsb_opexprojectcostid"] ?? ""),
              })),
            );
          }
        }

        // 1.21.753 — `WTGsToDelete: Filter('Land Lease Allocation WTGS', 'Generator In
        // Project'.GeneratorInProject in varTypeUnitIds)`: the allocations of EVERY unit of
        // the type go, not only those of the turbine row that happened to be selected.
        await removeUnitAllocations(await unitIdsOfType(p.type.id));

        await generatorTypeInProjectFullRepo.remove(p.type.id);

        const next = p.allTypes.filter((t) => t.id !== p.type.id);
        await dataClient.batch([wtgRollUpOp({ projectId: p.project.id, types: next })]);
      } catch (e) {
        throw toAppError(e, "Generator type could not be deleted");
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "turbines"] });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

export interface ToggleTypeStatusPayload {
  project: GeneratorsProject;
  type: GeneratorTypeRow;
  turbines: TurbineRow[];
  allTypes: GeneratorTypeRow[];
}

/** Rule 23 — propagate the type status to every turbine, then recompute the roll-up. */
export function useToggleTypeStatus() {
  const qc = useQueryClient();
  return useMutation<void, AppError, ToggleTypeStatusPayload>({
    mutationFn: async (p) => {
      try {
        const plan = planStatusToggle({ type: p.type, turbines: p.turbines });
        const ops: WriteOp[] = [
          {
            op: "update", entitySet: ES_PLANT.generatorTypeInProjects, id: plan.typeId,
            data: { statecode: plan.nextStatus },
          },
          ...plan.turbineIds.map<WriteOp>((id) => ({
            op: "update", entitySet: ES_PLANT.generatorInProjects, id,
            data: { statecode: plan.nextStatus },
          })),
        ];
        const next = p.allTypes.map((t) =>
          t.id === plan.typeId ? { ...t, status: plan.nextStatus } : t,
        );
        ops.push(wtgRollUpOp({ projectId: p.project.id, types: next }));
        await dataClient.batch(ops);
      } catch (e) {
        throw toAppError(e, "Generator status could not be changed");
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "turbines"] });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

/* ────────────────────────────────────────────────────────── the six other families */

export interface SaveSimpleTypePayload {
  family: Exclude<PlantFamily, "wtg">;
  project: GeneratorsProject;
  existingId: string | null;
  fields: Record<string, unknown>;
  /** Out-of-country inverter/substructure saves go to the flow instead of the roll-up. */
  requestPermission: boolean;
  rollUp: Record<string, unknown> | null;
  /**
   * PV CREATE only — the `AllWTGAllocated = Yes` land-lease costs to backfill for the new
   * module's unit (1.21.753: `If(varIsNewPvModule, …; Select(btn_Trigger_New_AllocateWTGs_To_Land_Lease))`).
   * Ignored on an edit, exactly as the canvas gates it on `varIsNewPvModule`.
   */
  pvAllocatableCosts?: LandLeaseCostRow[];
}

const FAMILY_REPO = {
  pv: pvModuleTypeInProjectRepo,
  inverter: inverterTypeInProjectRepo,
  substructure: substructureTypeInProjectRepo,
  storage: storageTypeInProjectRepo,
  hydrogen: hydrogenTypeInProjectRepo,
  substation: substationTypeInProjectRepo,
} as const;

const FAMILY_QUERY = {
  pv: "pvTypes", inverter: "inverterTypes", substructure: "substructureTypes",
  storage: "storageTypes", hydrogen: "hydrogenTypes", substation: "substationTypes",
} as const;

/**
 * Rules 16–18 — the six single-family saves. Every one of them is the same shape:
 * upsert the row, then either patch the project roll-up or (inverter/substructure only)
 * fire the permission flow.
 *
 * Rule (Flows): the PV request-permission call site is commented out in the canvas and
 * short-circuited by `If(true = false, …)`, so a PV save ALWAYS rolls up. `pvRequestsPermission`
 * in rules.ts is the single place that records it.
 */
export function useSaveSimpleType() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, AppError, SaveSimpleTypePayload>({
    mutationFn: async (p) => {
      try {
        const repo = FAMILY_REPO[p.family];
        const fields: Record<string, unknown> = {
          ...p.fields,
          [`${PLANT_LOOKUP.project}@odata.bind`]: `/vsb_projects(${p.project.id})`,
          ...(p.project.owningBusinessUnitId
            ? {
                [`${PLANT_LOOKUP.owningBusinessUnit}@odata.bind`]:
                  `/businessunits(${p.project.owningBusinessUnitId})`,
              }
            : {}),
        };
        const id = p.existingId
          ? (await repo.update(p.existingId, fields), p.existingId)
          : await repo.create(fields);

        if (p.requestPermission && (p.family === "inverter" || p.family === "substructure")) {
          const payload =
            p.family === "inverter"
              ? buildInverterPermissionPayload(p.project, id)
              : buildSubstructurePermissionPayload(p.project, id);
          const flow = await requestModulePermission({
            projectId: p.project.id,
            moduleType: String(payload.ModuleType),
            justification: JSON.stringify(payload),
          });
          await repo.update(id, {
            "vsb_requestpermissionstate": CHOICE_PLANT.requestPermissionState.pending,
            "vsb_flowrunid": (flow as { runId?: string }).runId ?? "",
            "vsb_flowapprovalid": flow.approvalId,
          });
          return { id };
        }

        // A new PV module gets its DeviceTypesInProjects bridge and its one GeneratorInProjects
        // unit (`Select(btn_AutomatedFlow_TriggerWork_ForWTG_PV)` then
        // `Patch(GeneratorInProjects, Defaults(…), {Name, ModuleTypeInProject, …})`), and —
        // 1.21.753 — the unit is backfilled into every AllWTGAllocated=Yes land-lease cost.
        if (p.family === "pv" && !p.existingId) {
          await createPvBridgeAndUnit(p.project, id, String(p.fields["vsb_label"] ?? ""), p.pvAllocatableCosts ?? []);
        }

        if (p.rollUp) {
          await dataClient.batch([
            { op: "update", entitySet: "vsb_projects", id: p.project.id, data: p.rollUp },
          ]);
        }
        return { id };
      } catch (e) {
        throw toAppError(e, `${p.family} type could not be saved`);
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child(FAMILY_QUERY[p.family], p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

export interface DeleteSimpleTypePayload {
  family: Exclude<PlantFamily, "wtg">;
  project: GeneratorsProject;
  row: SimpleTypeRow;
  rollUp: Record<string, unknown> | null;
}

export function useDeleteSimpleType() {
  const qc = useQueryClient();
  return useMutation<void, AppError, DeleteSimpleTypePayload>({
    mutationFn: async (p) => {
      try {
        if (
          (p.family === "pv" || p.family === "inverter" || p.family === "substructure") &&
          needsPermissionCancellation(p.row)
        ) {
          trace("information", "cancel module permission", {
            ...buildCancellationPayload(p.family, p.row),
          });
          await cancelModulePermission({ permissionRequestId: p.row.id });
        }
        await FAMILY_REPO[p.family].remove(p.row.id);
        if (p.rollUp) {
          await dataClient.batch([
            { op: "update", entitySet: "vsb_projects", id: p.project.id, data: p.rollUp },
          ]);
        }
      } catch (e) {
        throw toAppError(e, `${p.family} type could not be deleted`);
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child(FAMILY_QUERY[p.family], p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators", "project", p.project.id] });
    },
  });
}

/** The roll-up payloads the six families send, so the Screen does not build them inline. */
export function buildFamilyRollUp(args: {
  family: Exclude<PlantFamily, "wtg">;
  pv: SimpleTypeRow[];
  inverters: SimpleTypeRow[];
  substructures: SimpleTypeRow[];
  storage: SimpleTypeRow[];
  hydrogen: SimpleTypeRow[];
  substation: SimpleTypeRow[];
}): Record<string, unknown> | null {
  switch (args.family) {
    case "pv":
    case "inverter":
    case "substructure":
      return {
        [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.pv),
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({
          pv: args.pv, inverters: args.inverters, substructures: args.substructures,
        }),
      };
    case "storage":
      return { [PROJECT_PLANT_COL.plantStorageCapacity]: plantStorageCapacity(args.storage) };
    case "hydrogen":
      return { [PROJECT_PLANT_COL.plantHydrogenCapacity]: plantHydrogenCapacity(args.hydrogen) };
    case "substation":
      return {
        [PROJECT_PLANT_COL.plantSubstationCapacity]: plantSubstationCapacity(args.substation),
      };
  }
}

/** `User().EntraObjectId` — the height-limitation override compares against it. */
export function useEntraObjectId(): string | null {
  return useAppStore((s) => s.session.user?.id ?? null);
}

/** Rule 6 — the derived cost per WTG the panel shows while the user types. */
export function useDerivedCostPerWtg(
  model: ProjectedModel | null,
  count: number,
  index: number,
): number {
  return useMemo(
    () => (model ? costPerWtg({ model, count, accumulatedIndex: index }) : 0),
    [model, count, index],
  );
}

/* ═════════════════════════════════════ canvas 1.21.753 — O&M dependency & Replace ════ */

const OBU = (project: GeneratorsProject): Record<string, unknown> =>
  project.owningBusinessUnitId
    ? { [`${PLANT_LOOKUP.owningBusinessUnit}@odata.bind`]: `/businessunits(${project.owningBusinessUnitId})` }
    : {};

/** The `DeviceTypesInProjects` bridge of a type; `activeOnly` adds `Status = Active`. */
async function bridgeIdOf(typeId: string, activeOnly = false): Promise<string | null> {
  const row = await deviceTypeInProjectRepo.getOne(
    f.and(f.guid("_vsb_typeinprojectid_value", typeId), activeOnly ? f.eq("statecode", 0) : undefined)!,
    ["vsb_devicetypesinprojectid"],
  );
  return row ? String(row["vsb_devicetypesinprojectid"] ?? "") || null : null;
}

async function opexIdsOnBridge(projectId: string, bridgeId: string, activeOnly = false): Promise<string[]> {
  const rows = await opexProjectCostFullRepo.byProject(projectId, {
    filter: f.and(f.guid("_vsb_devicetypeinproject_value", bridgeId), activeOnly ? f.eq("statecode", 0) : undefined),
    select: ["vsb_opexprojectcostid"],
  });
  return rows.map((r) => String(r["vsb_opexprojectcostid"] ?? "")).filter(Boolean);
}

async function unitIdsOfType(typeId: string): Promise<string[]> {
  const units = await generatorInProjectFullRepo.listAll({
    filter: f.guid(GEN_INSTANCE_COL.moduleTypeInProject, typeId),
    select: [GEN_INSTANCE_COL.id],
  });
  return units.map((u) => String(u[GEN_INSTANCE_COL.id] ?? "")).filter(Boolean);
}

async function removeUnitAllocations(unitIds: string[]): Promise<void> {
  if (unitIds.length === 0) return;
  const allocs = await landLeaseAllocationRepo.listAll({
    filter: f.inList("_vsb_generatorinproject_value", unitIds),
    select: ["vsb_landleaseallocationwtgid"],
  });
  if (allocs.length > 0) {
    await landLeaseAllocationRepo.saveMany(
      allocs.map((a) => ({ op: "delete" as const, id: String(a["vsb_landleaseallocationwtgid"] ?? "") })),
    );
  }
}

/**
 * The `_opexDep` half of the 1.21.753 delete/deactivate gate: an ACTIVE bridge for the type
 * AND at least one ACTIVE `Opex Project Costs` row of this project on it. The row's own
 * `Status = Active` is the caller's (it already holds the row).
 */
export async function readOpexDependency(projectId: string, typeId: string): Promise<{
  hasActiveDeviceType: boolean;
  hasActiveOpexCost: boolean;
}> {
  const bridge = await bridgeIdOf(typeId, true);
  if (!bridge) return { hasActiveDeviceType: false, hasActiveOpexCost: false };
  return { hasActiveDeviceType: true, hasActiveOpexCost: (await opexIdsOnBridge(projectId, bridge, true)).length > 0 };
}

/** The selected WTG type's and PV module type's O&M dependency, kept warm for the guard. */
export function useOpexDependency(projectId: string | undefined, typeId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["generators", "opexDependency", projectId ?? "none", typeId ?? "none"],
    enabled: Boolean(projectId && typeId),
    queryFn: () => readOpexDependency(projectId!, typeId!),
    staleTime: 15_000,
  });
  return q.data ?? { hasActiveDeviceType: false, hasActiveOpexCost: false };
}

/** Old-unit allocations, as T2a captures them: id, the unit's index, and the cost's AllWTG flag. */
async function captureAllocations(projectId: string, typeId: string): Promise<ReplaceAllocation[]> {
  const units = await generatorInProjectFullRepo.listAll({
    filter: f.guid(GEN_INSTANCE_COL.moduleTypeInProject, typeId),
    select: [GEN_INSTANCE_COL.id, GEN_INSTANCE_COL.name],
  });
  if (units.length === 0) return [];
  const indexById = new Map(units.map((u) => [String(u[GEN_INSTANCE_COL.id] ?? ""), turbineIndex(str(u[GEN_INSTANCE_COL.name]))]));
  const allocs = await landLeaseAllocationRepo.listAll({
    filter: f.inList("_vsb_generatorinproject_value", [...indexById.keys()]),
    select: ["vsb_landleaseallocationwtgid", "_vsb_generatorinproject_value", "_vsb_projectcost_value"],
  });
  if (allocs.length === 0) return [];
  const costIds = [...new Set(allocs.map((a) => String(a["_vsb_projectcost_value"] ?? "")).filter(Boolean))];
  const costs = costIds.length
    ? await landLeaseCostFullRepo.byProject(projectId, {
        filter: f.inList("vsb_landleaseprojectcostid", costIds),
        select: ["vsb_landleaseprojectcostid", "vsb_allwtgallocated"],
      })
    : [];
  const allWtg = new Set(costs.filter((c) => bool(c["vsb_allwtgallocated"])).map((c) => String(c["vsb_landleaseprojectcostid"])));
  return allocs.map((a) => ({
    id: String(a["vsb_landleaseallocationwtgid"] ?? ""),
    unitIndex: indexById.get(String(a["_vsb_generatorinproject_value"] ?? "")) ?? 0,
    allWtgAllocated: allWtg.has(String(a["_vsb_projectcost_value"] ?? "")),
  }));
}

/** T2f — the captured O&M costs onto a bridge (or off it, with `null`). One batch. */
async function pointOpexAt(opexIds: string[], bridgeId: string | null): Promise<void> {
  if (opexIds.length === 0) return;
  await opexProjectCostFullRepo.saveMany(opexIds.map((id) => ({
    op: "update" as const,
    id,
    data: { "vsb_DeviceTypeInProject@odata.bind": bridgeId ? `/${ES_PLANT.deviceTypesInProjects}(${bridgeId})` : null },
  })));
}

/** T2c clean-up the platform's cascade does live: the old units and the old bridge. */
async function removeUnitsAndBridge(typeId: string): Promise<void> {
  const units = await unitIdsOfType(typeId);
  if (units.length) await generatorInProjectFullRepo.saveMany(units.map((id) => ({ op: "delete" as const, id })));
  const bridge = await bridgeIdOf(typeId);
  if (bridge) await deviceTypeInProjectRepo.remove(bridge);
}

async function createPvBridgeAndUnit(
  project: GeneratorsProject, pvTypeId: string, label: string, allocatable: LandLeaseCostRow[],
): Promise<{ unitId: string; bridgeId: string }> {
  const created = await pvModuleTypeInProjectRepo.getById(pvTypeId);
  const typeName = str((created as Record<string, unknown> | undefined)?.["vsb_name"]) ?? label;
  const bridgeId = await deviceTypeInProjectRepo.create({
    "vsb_name": label,
    [`${PLANT_LOOKUP.typeInProject}@odata.bind`]: `/${ES_PLANT.pvModuleTypeInProjects}(${pvTypeId})`,
    ...OBU(project),
  });
  const unitId = await generatorInProjectFullRepo.create({
    [GEN_INSTANCE_COL.name]: typeName,
    [`${PLANT_LOOKUP.moduleTypeInProject}@odata.bind`]: `/${ES_PLANT.pvModuleTypeInProjects}(${pvTypeId})`,
    ...OBU(project),
  });
  const plans = planTurbineAllocation({ costs: allocatable, turbines: [{ id: unitId, name: typeName }] });
  if (plans.length) {
    await landLeaseAllocationRepo.saveMany(plans.map((a) => ({
      op: "create" as const,
      data: {
        ...OBU(project),
        "vsb_name": a.name,
        [`${PLANT_LOOKUP.projectCost}@odata.bind`]: `/${ES_PLANT.landLeaseProjectCosts}(${a.costId})`,
        [`${PLANT_LOOKUP.generatorInProject}@odata.bind`]: `/${ES_PLANT.generatorInProjects}(${a.generatorInProjectId})`,
      },
    })));
  }
  return { unitId, bridgeId };
}

export interface ReplaceGeneratorTypePayload extends Omit<SaveGeneratorTypePayload, "existing" | "existingTurbines"> {
  oldType: GeneratorTypeRow;
  /** Turbines of every OTHER type — the new names continue after their highest index. */
  otherTurbines: TurbineRow[];
  onPhase?: (phase: string) => void;
}

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.OnChange` — Replace Generator Type
 * (canvas 1.21.753). Phases, in the canvas order and under its names:
 *
 *   Identify  capture the old type's O&M costs and its units' land-lease allocations (T2a)
 *   Detach    blank the O&M costs' DeviceTypeInProject so the delete cannot take them (T2b)
 *   Delete    cancel a pending permission, remove the old type (T2c) — and, since mock mode
 *             has no cascade, its units and bridge explicitly
 *   Add       the ordinary Save body against Defaults() (T2d), which creates the units, the
 *             bridge (T2e) and the AllWTGAllocated=Yes backfill (T2g), then rolls up or
 *             requests permission
 *   AllocateLandLease  manual allocations re-pointed by POSITION, surplus removed (T2h);
 *             the old units' AllWTG rows removed by id (T2i)
 *   Repoint   the captured O&M costs onto the new bridge (T2f)
 *
 * SOURCE DEFECT (1.21.753-2): the canvas T2c also removes the allocations of
 * `locSelectedGeneratorInProject` — the TURBINE row selected at the time — which T2a has
 * already captured for re-pointing, so with a turbine selected T2h patches deleted rows and
 * the whole replace errors half-way. Not reproduced: those allocations are re-pointed.
 *
 * `batch` is not transactional (CONVENTIONS rule 3) — this is the multi-step write the
 * custom-API backlog in `solution/customapi/` exists for.
 *
 * The body of `useReplaceGeneratorType`, exported for the mock-backend test. Throws.
 */
export async function replaceGeneratorTypeImpl(
  p: ReplaceGeneratorTypePayload,
): Promise<{ typeId: string; requested: boolean; unmatchedCount: number }> {
  const phase = (name: string) => { p.onPhase?.(name); trace("information", `R: ${name}`, { typeId: p.oldType.id }); };
  phase("Identify");
  const oldBridge = await bridgeIdOf(p.oldType.id);
  const opexIds = oldBridge ? await opexIdsOnBridge(p.project.id, oldBridge) : [];
  const allocations = await captureAllocations(p.project.id, p.oldType.id);

  phase("Detach");
  await pointOpexAt(opexIds, null);

  phase("Delete");
  if (needsPermissionCancellation({ flowRunId: p.oldType.flowRunId })) {
    await cancelModulePermission({ permissionRequestId: p.oldType.id });
  }
  await removeUnitsAndBridge(p.oldType.id);
  await generatorTypeInProjectFullRepo.remove(p.oldType.id);

  phase("Add");
  const added = await persistGeneratorType({
    ...p,
    existing: null,
    existingTurbines: p.otherTurbines,
    allTypes: p.allTypes.filter((t) => t.id !== p.oldType.id),
  });

  phase("AllocateLandLease");
  const newUnits = await generatorInProjectFullRepo.listAll({
    filter: f.guid(GEN_INSTANCE_COL.moduleTypeInProject, added.typeId),
    select: [GEN_INSTANCE_COL.id, GEN_INSTANCE_COL.name],
  });
  const ordered = newUnits
    .map((u) => ({ id: String(u[GEN_INSTANCE_COL.id] ?? ""), index: turbineIndex(str(u[GEN_INSTANCE_COL.name])) }))
    .sort((a, b) => a.index - b.index);
  const plan = planReplaceLandLease({ allocations, newUnitCount: ordered.length });
  const ops: Omit<WriteOp, "entitySet">[] = [
    ...plan.repoint.map((r) => ({
      op: "update" as const,
      id: r.allocationId,
      data: { [`${PLANT_LOOKUP.generatorInProject}@odata.bind`]: `/${ES_PLANT.generatorInProjects}(${ordered[r.newUnitPosition]!.id})` },
    })),
    ...[...plan.removeSurplus, ...plan.removeAllWtg].map((id) => ({ op: "delete" as const, id })),
  ];
  if (ops.length) await landLeaseAllocationRepo.saveMany(ops);

  phase("Repoint");
  await pointOpexAt(opexIds, await bridgeIdOf(added.typeId));

  phase("Done");
  return { ...added, unmatchedCount: plan.unmatchedCount };
}

export function useReplaceGeneratorType() {
  const qc = useQueryClient();
  return useMutation<
    { typeId: string; requested: boolean; unmatchedCount: number }, AppError, ReplaceGeneratorTypePayload
  >({
    mutationFn: async (p) => {
      try {
        return await replaceGeneratorTypeImpl(p);
      } catch (e) {
        throw toAppError(e, "Generator type could not be replaced");
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("generatorTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators"] });
      void qc.invalidateQueries({ queryKey: qk.projects.one(p.project.id) });
    },
  });
}

export interface ReplacePvModuleTypePayload {
  project: GeneratorsProject;
  oldPv: SimpleTypeRow;
  form: ReplacePvForm;
  deviceCostModules: number | null;
  /** The roll-up AFTER the replace (old row out, new row in). */
  rollUp: Record<string, unknown> | null;
  allocatableCosts: LandLeaseCostRow[];
  onPhase?: (phase: string) => void;
}

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2.OnChange` — Replace PV
 * Module Type (canvas 1.21.753). Same phases as the WTG replace, with a PV module's single
 * unit: every manual allocation of the old unit moves to the new one, the old AllWTG rows go,
 * and the O&M costs are re-pointed — with the canvas's hardening that a missing new bridge
 * is an ERROR, not a silent blank lookup (`PV_BRIDGE_MISSING`).
 */
/** The body of `useReplacePvModuleType`, exported for the mock-backend test. Throws. */
export async function replacePvModuleTypeImpl(p: ReplacePvModuleTypePayload): Promise<{ id: string }> {
  const phase = (name: string) => { p.onPhase?.(name); trace("information", `RPV: ${name}`, { typeId: p.oldPv.id }); };
  phase("Identify");
  const oldBridge = await bridgeIdOf(p.oldPv.id);
  const opexIds = oldBridge ? await opexIdsOnBridge(p.project.id, oldBridge) : [];
  const allocations = await captureAllocations(p.project.id, p.oldPv.id);

  phase("Detach");
  await pointOpexAt(opexIds, null);

  phase("Delete");
  if (needsPermissionCancellation(p.oldPv)) {
    await cancelModulePermission({ permissionRequestId: p.oldPv.id });
  }
  await removeUnitsAndBridge(p.oldPv.id);
  await pvModuleTypeInProjectRepo.remove(p.oldPv.id);

  phase("Add");
  const fields = buildPvTypeFields(
    { ...p.form, supplier: p.form.supplier },
    { deviceCostModules: p.deviceCostModules },
  );
  const id = await pvModuleTypeInProjectRepo.create({
    ...fields,
    "vsb_othersupplier": p.form.otherSupplier || null,
    [`${PLANT_LOOKUP.project}@odata.bind`]: `/vsb_projects(${p.project.id})`,
    ...OBU(p.project),
  });

  phase("AllocateLandLease");
  const { unitId, bridgeId } = await createPvBridgeAndUnit(p.project, id, p.form.moduleLabel, p.allocatableCosts);
  const manual = allocations.filter((a) => !a.allWtgAllocated);
  const ops: Omit<WriteOp, "entitySet">[] = [
    ...manual.map((a) => ({
      op: "update" as const,
      id: a.id,
      data: { [`${PLANT_LOOKUP.generatorInProject}@odata.bind`]: `/${ES_PLANT.generatorInProjects}(${unitId})` },
    })),
    ...allocations.filter((a) => a.allWtgAllocated).map((a) => ({ op: "delete" as const, id: a.id })),
  ];
  if (ops.length) await landLeaseAllocationRepo.saveMany(ops);

  if (p.rollUp) {
    await dataClient.batch([{ op: "update", entitySet: "vsb_projects", id: p.project.id, data: p.rollUp }]);
  }

  phase("Repoint");
  if (opexIds.length > 0 && !bridgeId) throw new Error(PV_BRIDGE_MISSING);
  await pointOpexAt(opexIds, bridgeId);

  phase("Done");
  return { id };
}

export function useReplacePvModuleType() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, AppError, ReplacePvModuleTypePayload>({
    mutationFn: async (p) => {
      try {
        return await replacePvModuleTypeImpl(p);
      } catch (e) {
        throw toAppError(e, "PV Module type could not be replaced");
      }
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("pvTypes", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["generators"] });
      void qc.invalidateQueries({ queryKey: qk.projects.one(p.project.id) });
    },
  });
}

