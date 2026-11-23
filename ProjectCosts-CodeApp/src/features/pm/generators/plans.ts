/**
 * Project Generators Screen - the write plans of a type's Save, Delete and the turbine grid.
 *
 * Split out of `rules.ts` by job (D159, audit finding 7). `rules.ts` re-exports this file, so every import of `@/features/pm/generators/rules` is unchanged.
 */
import { type BulkRow } from "@/data/bulkBackend";
import { CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, WIDE_GROUP_CONCURRENCY } from "@/data/concurrency";
import { CHOICE_PLANT, ES, ES_PLANT } from "@/data/dataverseNames";
import { type DeleteFlagOverrides, GENERATORS_DELETE, type GeneratorsDeleteFlags } from "@/data/generatorsDeleteFlags";
import { GENERATORS_BULK } from "@/data/generatorsBulkFlags";
import { type GeneratorsPerfFlags, generatorsPerf } from "@/data/generatorsPerfFlags";
import { type Lang, pfxRound } from "@/domain/powerFxNumeric";
import { OWNING_BU_BIND, bind } from "@/data/odata";
import { type PlannedWrite, type WritePlan, createMany, createdRowRef, hardenedDelete, refusePlan, together, updateMany } from "@/data/writePlan";
import { newRowId } from "@/data/newRowId";
import { type CatalogModel, GEN_INSTANCE_COL, GEN_TYPE_COL, type GeneratorTypeRow, type GeneratorsProject, type LandLeaseCostRow, PROJECT_PLANT_COL, type TurbineDeletionStep, type TurbineFormState, type TurbineRow, buildTurbineNames, editedTotalHeight, generatorTypeTotals, newTurbineHeights, planStatusToggle, planTurbineAllocation, planTurbineDeletion, plantWtgTotals, recomputeTypeFromChildren, requiresPermissionRequest, valueOrNull } from "./rulesCore";

/* ═══════════════════════════════════════════════════════════ D27 — write plans ════ */

/**
 * The write form of the owner — lower-case `owningbusinessunit` (CONVENTIONS rule 4), from the shared key and bind of
 * `data/odata.ts` (rule 17). Not `owningBusinessUnitBind`: that one validates the id as a GUID, and this folder's tests
 * use ids such as "bu-1"; the output is the same for a real id.
 */
export const owner = (businessUnitId: string | null | undefined): Record<string, unknown> =>
  businessUnitId ? { [OWNING_BU_BIND]: bind("businessunits", businessUnitId) } : {};

/**
 * NEW TEXT (generators fix F6, D121 §5): a create without the owning business unit never errors, the row just
 * becomes invisible to a business-unit-scoped colleague (CONVENTIONS rule 4). The canvas patched the project's own unit and had
 * no such refusal.
 */
export const OWNING_BU_MSG = {
  missing:
    "This project has no business unit, so nothing was saved: a new row without one would be invisible to other users. Ask an administrator to set the project's business unit.",
} as const;

/**
 * F6 — a plan that CREATES rows is refused, with nothing sent, when the project's owning business unit is blank. A plan with
 * no create (an edit, a delete, a roll-up) passes as it was. DIVERGENCE (D121 §5): before, the create went out
 * without the bind.
 */
export function requireOwningBusinessUnit<T extends WritePlan>(plan: T, businessUnitId: string | null | undefined): T {
  if (plan.refusedReason !== undefined || (businessUnitId ?? "").trim() !== "") return plan;
  // A refusal keeps the plan's extra fields (a follow-up's `unmatchedCount`) and drops its writes.
  return plan.writes.some((w) => w.op === "create" || w.op === "createMany")
    ? { ...plan, ...refusePlan(OWNING_BU_MSG.missing) }
    : plan;
}
export const ref = (entitySet: string, id: string): string => `/${entitySet}(${id})`;

/** Navigation properties of the binds the screen writes (`customizations.xml` relationships). */
export const PLANT_BIND = {
  project: "vsb_Project@odata.bind",
  generator: "vsb_Generator@odata.bind",
  /** `vsb_ModuleTypeInProjectId` is polymorphic: one navigation property per target table. */
  moduleTypeWtg: "vsb_ModuleTypeInProjectId_vsb_generatortypeinproject@odata.bind",
  moduleTypePv: "vsb_ModuleTypeInProjectId_vsb_pvmoduletypeinproject@odata.bind",
  deviceTypeWtg: "vsb_TypeInProjectId_vsb_generatortypeinproject@odata.bind",
  deviceTypePv: "vsb_TypeInProjectId_vsb_pvmoduletypeinproject@odata.bind",
  projectCost: "vsb_ProjectCost@odata.bind",
  generatorInProject: "vsb_GeneratorInProject@odata.bind",
  /** `InverterTypeInProjects.Inverter` / `SubstructureTypeInProjects.Substructure` — the catalogue rows (G9). */
  inverter: "vsb_Inverter@odata.bind",
  substructure: "vsb_Substructure@odata.bind",
  /** `'Opex Project Costs'.DeviceTypeInProject` — the O&M bridge a replace re-links (G6). */
  deviceTypeInProject: "vsb_DeviceTypeInProject@odata.bind",
} as const;

/** The project fields a plan needs. */
export type PlanProject = Pick<GeneratorsProject, "id" | "shortName" | "owningBusinessUnitId">;

export const upd = (entitySet: string, id: string, data: Record<string, unknown>, reason: string): PlannedWrite =>
  ({ op: "update", entitySet, id, data, reason });
export const ins = (entitySet: string, data: Record<string, unknown>, reason: string): PlannedWrite =>
  ({ op: "create", entitySet, data, reason });
/**
 * Every Generators delete is a HARDENED delete (delete hardening plan DEL-2, `hardenedDelete` in `data/writePlan.ts`): the
 * engine retries it a bounded number of times and only counts 404 / `0x80040217` as "already gone". `confirm` marks the
 * deletes of rows whose survival would matter most (types, land-lease costs, units): read back when
 * `GENERATORS_DELETE.verifyDeletes` is on. `serialKey` orders deletes that share a parent row (DEL-4).
 */
export const del = (entitySet: string, id: string, reason: string, o: { confirm?: boolean; serialKey?: string } = {}): PlannedWrite =>
  hardenedDelete(entitySet, id, reason, o);

/*
 * Tiered deletes (Generators bulk programme, plan §9.4, work package R2 phase 1B; flag `GENERATORS_DELETE.tieredDeletes`
 * since the delete hardening plan DEL-1: ON, the default, is the tiers below; OFF is ONE plain `together()` group at the
 * default limit, the shape before the tiers).
 * Each call is its own `together()` group (`data/writePlan.ts`), so groups never overlap: one finishes before the
 * next starts, children before parents, the project roll-up last.
 *  - LEAF (16 in flight, `LEAF_DELETE_CONCURRENCY`): rows nothing hangs off: land-lease allocations, O&M costs, units,
 *    device-type bridge rows, turbines deleted one by one.
 *  - CASCADE (4 in flight, `CASCADE_DELETE_CONCURRENCY`): land-lease costs and types, whose cascade locks and updates
 *    child rows (D51: 6-11 s per request when cascades overlapped).
 * Starting values; the timed DEV test (plan §9.4) sets the final numbers.
 */
export const leafDeletes = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  deleteFlagOn(opts, "tieredDeletes") ? together(writes, { limit: LEAF_DELETE_CONCURRENCY }) : together(writes);
export const cascadeDeletes = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  deleteFlagOn(opts, "tieredDeletes") ? together(writes, { limit: CASCADE_DELETE_CONCURRENCY }) : together(writes);
/**
 * Delete steps that were plain one-by-one steps before 1B (bridge rows, units, types): a tier only matters for two or
 * more requests, so a single delete stays the plain sequential step it always was (the plan shape the screen pins).
 */
export const leafDeletesIfMany = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (writes.length > 1 ? leafDeletes(writes, opts) : writes);
export const cascadeDeletesIfMany = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (writes.length > 1 ? cascadeDeletes(writes, opts) : writes);

/**
 * The land-lease clean-up steps of a turbine / type delete, as plan writes: the leaf rows and the cascading costs apart.
 * DEL-4 (flag `parentOrder`): with it on, an allocation delete carries `serialKey = <its land-lease cost id>` (looked up in
 * `costOf`, allocation id -> cost id), so two deletes on one cost never run together; off, no key. The cost delete confirms.
 */
export function landLeaseCleanupWrites(
  steps: readonly TurbineDeletionStep[], reasons: { allocation: string; cost: string },
  costOf: ReadonlyMap<string, string>, opts?: PlanBulkOptions,
): { allocations: PlannedWrite[]; costs: PlannedWrite[] } {
  const allocations: PlannedWrite[] = [];
  const costs: PlannedWrite[] = [];
  for (const step of steps) {
    if (step.kind === "removeAllocation") allocations.push(allocationDelete(step.allocationId, reasons.allocation, costOf, opts));
    else costs.push(del(ES_PLANT.landLeaseProjectCosts, step.costId, reasons.cost, { confirm: true }));
  }
  return { allocations, costs };
}

/** One land-lease allocation delete; with `parentOrder` on and its cost known it carries `serialKey = <cost id>` (DEL-4). */
export const allocationDelete = (id: string, reason: string, costOf: ReadonlyMap<string, string>, opts: PlanBulkOptions | undefined): PlannedWrite => {
  const cost = deleteFlagOn(opts, "parentOrder") ? costOf.get(id) : undefined;
  return del(ES.landLeaseAllocationWtgs, id, reason, cost ? { serialKey: cost } : {});
};

/** Allocation id -> its land-lease cost id, for the `serialKey` of an allocation delete. */
export const costByAllocation = (allocations: readonly { id: string; costId?: string }[]): Map<string, string> =>
  new Map(allocations.flatMap((a) => (a.costId ? [[a.id, a.costId] as const] : [])));

/**
 * Optional last parameter of the plan builders that have a bulk path (Generators bulk programme, work package R2).
 * A bulk path is used ONLY when its flag is on: `(opts.bulk.X ?? GENERATORS_BULK.X) === true`, so no caller has to
 * change (a screen passes nothing, a test passes `{ bulk: { allocations: true }, newId }`). With every flag off (the
 * default) a plan is EXACTLY today's plan. Row ids come from `opts.newId`, else `newRowId`: the single sanctioned
 * impure default of `rules.ts` (`data/newRowId.ts`).
 */
export interface PlanBulkOptions {
  /** Per-flag overrides of `GENERATORS_BULK` (same keys; `true` allowed, which the `as const` defaults cannot say). */
  bulk?: { [K in keyof typeof GENERATORS_BULK]?: boolean };
  /**
   * Per-flag overrides of `GENERATORS_DELETE` (delete hardening plan): `tieredDeletes` (DEL-1), `parentOrder` (DEL-4),
   * `guardedUpdates` (DEL-7a). A flag is read as `opts.delete?.X ?? GENERATORS_DELETE.X`. `verifyDeletes` is an engine
   * flag (`ExecutePlanOptions.deleteFlags`); the plans do not read it.
   */
  delete?: DeleteFlagOverrides;
  /**
   * Per-switch overrides of `GENERATORS_PERF` for the save-latency switches (D144): `relaneWrites`, `replaceLanes`,
   * `wideGroups`. A switch is read as `opts.perf?.X ?? generatorsPerf().X`; the golden-master tests build the same plan
   * with all three off (today's plan) and on.
   */
  perf?: Partial<Pick<GeneratorsPerfFlags, "relaneWrites" | "replaceLanes" | "wideGroups">>;
  /** Source of the pre-generated row ids of bulk creates. Tests inject a counter. */
  newId?: () => string;
}

/** D144: a save-latency switch (`opts.perf` first, else the shipped / test-installed `GENERATORS_PERF`). */
export const perfOn = (opts: PlanBulkOptions | undefined, flag: "relaneWrites" | "replaceLanes" | "wideGroups"): boolean =>
  (opts?.perf?.[flag] ?? generatorsPerf()[flag]) === true;

/**
 * One parallel group of the Generators plans at its DEFAULT limit: 8 (`WRITE_CONCURRENCY`) with `wideGroups` off, 16
 * (`WIDE_GROUP_CONCURRENCY`) with it on (D144). The delete tiers (`leafDeletes`, `cascadeDeletes`) keep their own limits.
 */
export const group = (writes: readonly PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (perfOn(opts, "wideGroups") ? together(writes, { limit: WIDE_GROUP_CONCURRENCY }) : together(writes));

/** One WAVE (D144): nothing is a plain step, one write stays a plain step, two or more are ONE parallel group. */
export const wave = (writes: readonly PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (writes.length > 1 ? group(writes, opts) : [...writes]);

export const bulkOn =(opts: PlanBulkOptions | undefined, flag: keyof typeof GENERATORS_BULK): boolean =>
  (opts?.bulk?.[flag] ?? GENERATORS_BULK[flag]) === true;
function deleteFlagOn(opts: PlanBulkOptions | undefined, flag: keyof GeneratorsDeleteFlags): boolean {
  return (opts?.delete?.[flag] ?? GENERATORS_DELETE[flag]) === true;
}
/** DEL-7(a): the write as a guarded update when `guardedUpdates` is on (never re-creates a row another user deleted), else as is. */
export const guardedIf = (w: PlannedWrite, opts: PlanBulkOptions | undefined): PlannedWrite =>
  (deleteFlagOn(opts, "guardedUpdates") ? { ...w, guarded: true } : w);
/** Bulk update rows without a repeated id (the first wins): `UpdateMultiple` refuses a duplicate (plan §3 phase 3, item 5). */
export const uniqueRows = (rows: readonly BulkRow[]): BulkRow[] => {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};
const rowIdSource = (opts: PlanBulkOptions | undefined): (() => string) => opts?.newId ?? newRowId;

/*
 * Save performance (6 Nov 2026): `together` (`data/writePlan.ts`) marks writes that depend on nothing but
 * rows created BEFORE them (a type's turbines, the roll-up, the land-lease allocations, the apply-to-all
 * patches) so `executePlan` sends them 8 at a time. No server automation orders these rows: the only
 * project-level trigger (`LoadDevexCapexCostTotalCapacityTrigger`) fires on the roll-up alone.
 */

/** `Patch(Projects, …, {'Plant WTG Capacity [MW]', 'Plant WTG Cost [EUR]'})` over the eligible types (rule 14). */
export function projectWtgRollup(
  projectId: string,
  types: Pick<GeneratorTypeRow, "requestPermissionState" | "status" | "generatorsCapacity" | "generatorsCost">[],
): PlannedWrite {
  const t = plantWtgTotals(types);
  return upd(ES.projects, projectId, {
    [PROJECT_PLANT_COL.plantWtgCapacity]: t.capacityMW,
    [PROJECT_PLANT_COL.plantWtgCost]: t.costEUR,
  }, "the project's Plant WTG Capacity / Cost");
}

/** The new / edited turbine rows the AllWTG land-lease costs are allocated to (`btn_Trigger_New_AllocateWTGs_To_Land_Lease`). */
export function allocationCreates(args: {
  costs: LandLeaseCostRow[];
  turbines: { id: string; name: string | null }[];
  owningBusinessUnitId: string | null | undefined;
}): PlannedWrite[] {
  return planTurbineAllocation({ costs: args.costs, turbines: args.turbines }).map((a) =>
    ins(ES.landLeaseAllocationWtgs, {
      vsb_name: a.name,
      [PLANT_BIND.projectCost]: ref(ES_PLANT.landLeaseProjectCosts, a.costId),
      [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, a.generatorInProjectId),
      ...owner(args.owningBusinessUnitId),
    }, `allocate land-lease cost to ${a.name}`));
}

/**
 * The land-lease allocation rows as ONE bulk create (plan §3 phase 2, flag `GENERATORS_BULK.allocations`): the same rows
 * `allocationCreates` makes one by one, in the same order (cost-major, then turbine), each with a pre-generated id
 * (`newId`, plan §2.5) and the same data, owning-business-unit bind included (CONVENTIONS rule 4; the backend fails
 * closed without it). A turbine id may be a `createdRowRef` placeholder; the engine resolves it per row.
 */
function allocationRows(args: Parameters<typeof allocationCreates>[0], newId: () => string): BulkRow[] {
  return planTurbineAllocation({ costs: args.costs, turbines: args.turbines }).map((a) => ({
    id: newId(),
    data: {
      vsb_name: a.name,
      [PLANT_BIND.projectCost]: ref(ES_PLANT.landLeaseProjectCosts, a.costId),
      [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, a.generatorInProjectId),
      ...owner(args.owningBusinessUnitId),
    },
  }));
}

/**
 * The allocation creates of a plan, as plan steps.
 *  - flag off: today's single creates, as ONE `together()` group (default limit);
 *  - flag on:  ONE `createMany` step (no step at all when there is nothing to allocate), never inside a group.
 * DIVERGENCE: plan §3 phase 2 / §9.7: N x L single creates become one bulk request; a chunk lands whole or not at all
 * (plan §2.4). The off path is today's plan, kept as the rollback (CONVENTIONS rule 15).
 */
export function allocationStep(args: Parameters<typeof allocationCreates>[0], opts: PlanBulkOptions | undefined): PlannedWrite[] {
  if (!bulkOn(opts, "allocations")) return group(allocationCreates(args), opts);
  const rows = allocationRows(args, rowIdSource(opts));
  return rows.length > 0 ? [createMany(ES.landLeaseAllocationWtgs, rows, "the land-lease allocations of the new turbines")] : [];
}

/**
 * The WTG type save, first job (`pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.OnChange`, Y:15214):
 *  1. `Patch(GeneratorTypeInProjects, Defaults, {Project, Generator, 'Number of Generators',
 *     'Cost per WTG' = Value(Text(locGeneratorCostsPerWtg, "#0.00")), 'Generators Cost' = n × cost,
 *     'Generators Capacity' = n × 'Specific Capacity', OBU})` — D27 adds the 2-decimal rounding;
 *  2. N × `Patch(GeneratorInProjects, Defaults, {Name "WTG <Short>_<max + i>" (max over the whole
 *     project), ModuleTypeInProject, 'Effective Capacity' = 'Specific Capacity', OBU, 'Total Height',
 *     'Hub Height excl. Foundation Plinth [m]'})`;
 *  3. in country: the project roll-up over the eligible types, the new one included. Out of country
 *     (`Not(tgl_…_Filter_Country.Checked)`, Y:15214 / Y:16514): no roll-up — the screen runs
 *     `RequestModulePermission` for the new type instead (D97), and the flow rolls the type up itself
 *     once it is approved ("For requested generators SUM will be calculated in flow").
 * The queued `Select`s (the `DeviceTypesInProjects` shadow, the AllWTG allocations) are the second
 * job, `planGeneratorTypeFollowUp`: they need the type's autonumber name and the new turbine ids. The
 * canvas runs them on both paths.
 */
function planCreateGeneratorTypeUnchecked(args: {
  project: PlanProject;
  inCountry: boolean;
  model: Pick<CatalogModel, "id" | "specificCapacity" | "hubHeight" | "rotorDiameter">;
  numberOfGenerators: number;
  /** `locGeneratorCostsPerWtg`, unrounded. */
  costPerWtg: number;
  /** `cmb_Supplier_2.Selected.Height` (0 = use the typed revised height). */
  selectedHeight: number;
  revisedHubHeight: number | null;
  existingTypes: GeneratorTypeRow[];
  projectTurbines: Pick<TurbineRow, "index">[];
  /**
   * D144 (`relaneWrites`; Replace passes `replaceLanes`): true = the in-country roll-up is NOT appended to the plan but handed
   * back as `deferredRollup`, for the follow-up plan to write in its one wave (`planGeneratorTypeFollowUp({ rollup })`). The
   * write is the same one; only the wave it is sent in changes. Unset = the switch of `opts`.
   */
  deferRollup?: boolean;
}, opts?: PlanBulkOptions): CreateTypePlan {
  const n = args.numberOfGenerators;
  const cost = pfxRound(args.costPerWtg, 2);
  const totals = generatorTypeTotals({ count: n, costPerWtg: cost, specificCapacity: args.model.specificCapacity });
  const heights = newTurbineHeights({
    selectedHeight: args.selectedHeight, typedHubHeight: args.revisedHubHeight,
    catalogHubHeight: args.model.hubHeight, rotorDiameter: args.model.rotorDiameter,
  });
  const names = buildTurbineNames({ shortName: args.project.shortName, existing: args.projectTurbines, count: n });
  /** One turbine row's data: the same for a single create and for a bulk row (the bind resolves to the type created first). */
  const turbineData = (name: string): Record<string, unknown> => ({
    [GEN_INSTANCE_COL.name]: name,
    [PLANT_BIND.moduleTypeWtg]: ref(ES_PLANT.generatorTypeInProjects, createdRowRef(0)),
    [GEN_INSTANCE_COL.effectiveCapacity]: args.model.specificCapacity ?? null,
    ...owner(args.project.owningBusinessUnitId),
    [GEN_INSTANCE_COL.totalHeight]: heights.totalHeight,
    [GEN_INSTANCE_COL.hubHeightExclPlinth]: heights.hubHeightExclPlinth,
  });
  const typeCreate = ins(ES_PLANT.generatorTypeInProjects, {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    [PLANT_BIND.generator]: ref(ES_PLANT.generators, args.model.id),
    [GEN_TYPE_COL.numberOfGenerators]: n,
    [GEN_TYPE_COL.costPerWtg]: cost,
    [GEN_TYPE_COL.generatorsCost]: totals.generatorsCost,
    [GEN_TYPE_COL.generatorsCapacity]: totals.generatorsCapacity,
    ...owner(args.project.owningBusinessUnitId),
  }, "the generator type");
  // The type is ALWAYS created first, as a single request (its autonumber name comes back in the response and feeds the
  // device-type row, plan §2.5); every turbine binds to it via `createdRowRef(0)`.
  let turbines: PlannedWrite[];
  if (bulkOn(opts, "turbines")) {
    // DIVERGENCE (plan §3 phase 4; flag `turbines`): the N turbines are ONE `createMany` with pre-generated ids instead of
    // N single creates in a parallel run. The engine returns `createdIds` in row order, so the screen's contract is
    // unchanged: [the type, then the turbines in `names` order]. No step at all for 0 turbines; never inside a group.
    const newId = rowIdSource(opts);
    const rows: BulkRow[] = names.map((name) => ({ id: newId(), data: turbineData(name) }));
    turbines = rows.length > 0 ? [createMany(ES_PLANT.generatorInProjects, rows, "the new generator type's turbines")] : [];
  } else {
    // Today: the turbines go together; the roll-up last.
    turbines = group(names.map((name) => ins(ES_PLANT.generatorInProjects, turbineData(name), `turbine ${name}`)), opts);
  }
  const writes: PlannedWrite[] = [typeCreate, ...turbines];
  if (requiresPermissionRequest(args.inCountry)) return { writes, log: [`Generator type with ${n} turbines`] };
  // After every turbine, as in the canvas: `LoadDevexCapexCostTotalCapacityTrigger` fires on these project
  // columns, and a failed turbine stops the plan before the project totals change.
  const rollup = projectWtgRollup(args.project.id, [
    ...args.existingTypes,
    { requestPermissionState: null, status: CHOICE_PLANT.status.active,
      generatorsCapacity: totals.generatorsCapacity, generatorsCost: totals.generatorsCost },
  ]);
  // D144: with the switch on the roll-up is sent in the follow-up plan's wave (beside the device-type row and the
  // allocations), still AFTER every turbine and exactly once; the plan hands it back instead of ending with it.
  if (args.deferRollup ?? perfOn(opts, "relaneWrites")) {
    return { writes, log: [`Generator type with ${n} turbines`], deferredRollup: rollup };
  }
  writes.push(rollup);
  return { writes, log: [`Generator type with ${n} turbines`] };
}

/** A plan that may hand its project roll-up to the follow-up plan (D144, `relaneWrites` / `replaceLanes`). */
export interface CreateTypePlan extends WritePlan {
  deferredRollup?: PlannedWrite;
}

/** `planCreateGeneratorType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planCreateGeneratorType = (...a: Parameters<typeof planCreateGeneratorTypeUnchecked>): ReturnType<typeof planCreateGeneratorTypeUnchecked> =>
  requireOwningBusinessUnit(planCreateGeneratorTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The second job of a new WTG / PV type — `btn_AutomatedFlow_TriggerWork_ForWTG_PV.OnSelect` (Y:65):
 * when no `DeviceTypesInProjects` row points at the type yet, `Patch(DeviceTypesInProjects,
 * Defaults, {Name: <type>.vsb_name, TypeInProject: <type>, 'Owning Business Unit'})`.
 */
export function deviceTypeShadow(args: {
  family: "wtg" | "pv";
  typeId: string;
  typeName: string;
  owningBusinessUnitId: string | null | undefined;
}): PlannedWrite {
  return ins(ES_PLANT.deviceTypesInProjects, {
    vsb_name: args.typeName,
    [args.family === "wtg" ? PLANT_BIND.deviceTypeWtg : PLANT_BIND.deviceTypePv]:
      ref(args.family === "wtg" ? ES_PLANT.generatorTypeInProjects : ES_PLANT.pvModuleTypeInProjects, args.typeId),
    ...owner(args.owningBusinessUnitId),
  }, "the O&M device-type row");
}

/**
 * The WTG type save, second job: the device-type shadow (when absent), then — the type being new —
 * `btn_Trigger_New_AllocateWTGs_To_Land_Lease` (Y:17510): every `AllWTGAllocated = Yes` land-lease
 * cost × every new turbine, `{Name: 'Land Owner' & "-" & Description & "-" & <turbine>.Name,
 * 'Project Cost', 'Generator In Project', OBU}` (rule 20).
 */
function planGeneratorTypeFollowUpUnchecked(args: {
  project: PlanProject;
  typeId: string;
  typeName: string;
  hasDeviceType: boolean;
  turbines: { id: string; name: string | null }[];
  landLeaseCosts: LandLeaseCostRow[];
  /**
   * D144 (`relaneWrites`): the project roll-up `planCreateGeneratorType` handed back (`deferredRollup`). It joins the device-type
   * row and the allocations in this plan's ONE wave. Unset (out of country, or the switch off) = today's plan.
   */
  rollup?: PlannedWrite;
}, opts?: PlanBulkOptions): WritePlan {
  const writes: PlannedWrite[] = [];
  if (!args.hasDeviceType) {
    writes.push(deviceTypeShadow({
      family: "wtg", typeId: args.typeId, typeName: args.typeName,
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    }));
  }
  const allocation = {
    costs: args.landLeaseCosts, turbines: args.turbines, owningBusinessUnitId: args.project.owningBusinessUnitId,
  };
  if (bulkOn(opts, "allocations")) {
    // DIVERGENCE (plan §3 phase 2): the allocations are ONE `createMany` step. A bulk step is never part of a group,
    // so the device-type row is a plain create before it (it has no allocation to wait for, and no one to wait for it).
    // D144: the roll-up, when handed over, shares the device-type row's wave (a lone write stays a plain step).
    return { writes: [...wave([...writes, ...(args.rollup ? [args.rollup] : [])], opts), ...allocationStep(allocation, opts)], log: [] };
  }
  writes.push(...allocationCreates(allocation));
  // The device-type row and the allocations bind only to rows that already exist: one parallel run. D144: and the roll-up
  // (after the turbines it sums, which this plan's caller created first) in the same run.
  if (args.rollup) writes.push(args.rollup);
  return { writes: group(writes, opts), log: [] };
}

/** `planGeneratorTypeFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planGeneratorTypeFollowUp = (...a: Parameters<typeof planGeneratorTypeFollowUpUnchecked>): ReturnType<typeof planGeneratorTypeFollowUpUnchecked> =>
  requireOwningBusinessUnit(planGeneratorTypeFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * Sibling total heights after an apply-to-all. SOURCE DEFECT (D27): the canvas `UpdateIf` writes the
 * EDITED turbine's `'Total Height'` to every turbine of the type (Y:11727/11755), so a sibling with
 * another plinth (or, for the plinth patch, another hub height) got a wrong total. Each sibling
 * now gets its own: hub height + plinth + ½ rotor, with the applied value replacing its own.
 * `planApplyToAll` (with `totalHeight`) keeps the canvas write (UT-GEN-104).
 */
export function siblingTotalHeight(args: {
  sibling: Pick<TurbineRow, "hubHeightExclPlinth" | "foundationPlinth">;
  applyHubHeight: boolean;
  applyFoundationPlinth: boolean;
  hubHeight: number | null;
  foundationPlinth: number | null;
  rotorDiameter: number | null | undefined;
}): number {
  return editedTotalHeight({
    hubHeight: args.applyHubHeight ? args.hubHeight : args.sibling.hubHeightExclPlinth,
    foundationPlinth: args.applyFoundationPlinth ? args.foundationPlinth : args.sibling.foundationPlinth,
    rotorDiameter: args.rotorDiameter,
  });
}

/**
 * The turbine save (`pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save.OnChange`, Y:11631), in
 * the canvas order:
 *  1. `Patch(GeneratorInProjects, <turbine or Defaults>, {Name "WTG <Short Name>_<n>", ModuleTypeInProject,
 *     'Effective Capacity', 'Hub Height excl. Foundation Plinth [m]', OBU, 'Foundation Plinth [m]',
 *     'Total Height'})`;
 *  2. the apply-to-all patches over the type's other turbines (capacity; hub height; plinth — merged
 *     into one update per turbine; each carries OBU, as the canvas `UpdateIf`s do);
 *  3. the type re-derived from its turbines (count, `'Cost per WTG'` re-banded unrounded, cost,
 *     capacity = Σ effective capacity) — rules 13/21;
 *  4. the project roll-up;
 *  5. a NEW turbine is allocated to every AllWTG land-lease cost (`btn_Trigger_New_Allocate…`).
 */
function planSaveTurbineUnchecked(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost" | "rotorDiameter"> | null;
  accumulatedIndex: number;
  turbine: TurbineRow | null;
  /** Every turbine of the type, the edited one included. */
  typeTurbines: TurbineRow[];
  allTypes: GeneratorTypeRow[];
  form: TurbineFormState;
  applyAll: { capacity: boolean; hubHeight: boolean; plinth: boolean };
  /** `Value(txt_…Total_Height.Value)`. */
  totalHeight: number | null;
  landLeaseCosts: LandLeaseCostRow[];
  /** The user's language. Required: every box of the panel is typed in it. */
  lang: Lang;
}, opts?: PlanBulkOptions): WritePlan {
  const { lang } = args;
  const name = `WTG ${args.project.shortName ?? ""}_${args.form.nameIndex.trim()}`;
  const capacity = valueOrNull(args.form.effectiveCapacity, lang);
  const hub = valueOrNull(args.form.effectiveHubHeight, lang);
  const plinth = valueOrNull(args.form.foundationPlinth, lang);
  const obu = owner(args.project.owningBusinessUnitId);
  const turbineData = {
    [GEN_INSTANCE_COL.name]: name,
    [PLANT_BIND.moduleTypeWtg]: ref(ES_PLANT.generatorTypeInProjects, args.type.id),
    [GEN_INSTANCE_COL.effectiveCapacity]: capacity,
    [GEN_INSTANCE_COL.hubHeightExclPlinth]: hub,
    ...obu,
    [GEN_INSTANCE_COL.foundationPlinth]: plinth,
    [GEN_INSTANCE_COL.totalHeight]: args.totalHeight,
  };
  const writes: PlannedWrite[] = [args.turbine
    ? upd(ES_PLANT.generatorInProjects, args.turbine.id, turbineData, `turbine ${name}`)
    : ins(ES_PLANT.generatorInProjects, turbineData, `turbine ${name}`)];
  /** Save performance: steps 2 and 5 are independent rows, each sent as one parallel run (`together`). */
  const applyAll: PlannedWrite[] = [];

  // 2. apply-to-all, and the children as they will be after the save.
  const others = args.typeTurbines.filter((t) => t.id !== args.turbine?.id);
  const after: Pick<TurbineRow, "effectiveCapacity">[] = [{ effectiveCapacity: capacity }];
  for (const s of others) {
    const patch: Record<string, unknown> = {};
    if (args.applyAll.capacity) patch[GEN_INSTANCE_COL.effectiveCapacity] = capacity;
    if (args.applyAll.hubHeight) patch[GEN_INSTANCE_COL.hubHeightExclPlinth] = hub;
    if (args.applyAll.plinth) patch[GEN_INSTANCE_COL.foundationPlinth] = plinth;
    if (args.applyAll.hubHeight || args.applyAll.plinth) {
      patch[GEN_INSTANCE_COL.totalHeight] = siblingTotalHeight({
        sibling: s, applyHubHeight: args.applyAll.hubHeight, applyFoundationPlinth: args.applyAll.plinth,
        hubHeight: hub, foundationPlinth: plinth, rotorDiameter: args.model?.rotorDiameter,
      });
    }
    if (Object.keys(patch).length > 0) {
      applyAll.push(upd(ES_PLANT.generatorInProjects, s.id, { ...patch, ...obu }, `apply to all: ${s.name ?? s.id}`));
    }
    after.push({ effectiveCapacity: args.applyAll.capacity ? capacity : s.effectiveCapacity });
  }

  // 3. the type from its children.
  const re = recomputeTypeFromChildren({ children: after, model: args.model, accumulatedIndex: args.accumulatedIndex });
  const typeFields = {
    [GEN_TYPE_COL.numberOfGenerators]: re.numberOfGenerators,
    [GEN_TYPE_COL.costPerWtg]: re.costPerWtg,
    [GEN_TYPE_COL.generatorsCost]: re.generatorsCost,
    [GEN_TYPE_COL.generatorsCapacity]: re.generatorsCapacity,
  };
  // D144 (`relaneWrites`), a NEW turbine only: after the turbine create, the sibling patches, the type totals, the roll-up and
  // the allocations are ONE wave. None needs a row another of them writes: the totals and the roll-up come from the form and the
  // rows read before the save, and the allocations bind only to the turbine step 1 created. An edit keeps today's order.
  const relane = !args.turbine && perfOn(opts, "relaneWrites");
  const typeWrite = guardedIf(upd(ES_PLANT.generatorTypeInProjects, args.type.id, typeFields, "the generator type's totals"), opts);
  const rollupWrite = projectWtgRollup(args.project.id, args.allTypes.map((t) => t.id === args.type.id
    ? { ...t, generatorsCapacity: re.generatorsCapacity, generatorsCost: re.generatorsCost } : t));
  if (relane) {
    const lane: PlannedWrite[] = [];
    if (bulkOn(opts, "applyAll") && applyAll.length > 0) {
      writes.push(updateMany(
        ES_PLANT.generatorInProjects, uniqueRows(applyAll.map((w) => ({ id: w.id!, data: w.data! }))), "apply to all: the type's other turbines",
      ));
    } else {
      lane.push(...applyAll.map((w) => guardedIf(w, opts)));
    }
    lane.push(typeWrite, rollupWrite);
    const allocationArgs = {
      costs: args.landLeaseCosts, turbines: [{ id: createdRowRef(0), name }],
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    };
    const bulkAllocations = bulkOn(opts, "allocations");
    if (!bulkAllocations) lane.push(...allocationCreates(allocationArgs));
    writes.push(...wave(lane, opts), ...(bulkAllocations ? allocationStep(allocationArgs, opts) : []));
    return { writes, log: [name] };
  }
  if (bulkOn(opts, "applyAll") && applyAll.length > 0) {
    // DIVERGENCE (plan §3 phase 3, §9.5; flag `applyAll`): the sibling patches are ONE `updateMany` step with today's
    // per-row payloads (each sibling's own total height, the owning-business-unit bind as today's single updates carry
    // it; the backend lets bind keys through on update). The backend's guarded read refuses the WHOLE step, sending
    // nothing, when a sibling is gone (`BulkRowsGoneError`: the user reloads).
    writes.push(updateMany(
      ES_PLANT.generatorInProjects, uniqueRows(applyAll.map((w) => ({ id: w.id!, data: w.data! }))), "apply to all: the type's other turbines",
    ));
  } else {
    // DEL-7(a): flag `guardedUpdates`: a sibling another user deleted is never re-created by the PATCH (the bulk form is guarded already).
    writes.push(...group(applyAll.map((w) => guardedIf(w, opts)), opts));
  }
  writes.push(typeWrite);

  // 4. the roll-up with the re-derived type.
  writes.push(rollupWrite);

  // 5. a new turbine's AllWTG allocations — bound to the row step 1 created.
  if (!args.turbine) {
    // Flag `allocations`: one `createMany` instead of the parallel run (plan §3 phase 2); the order is unchanged.
    writes.push(...allocationStep({
      costs: args.landLeaseCosts, turbines: [{ id: createdRowRef(0), name }],
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    }, opts));
  }
  // Canvas order between the steps: turbine → apply-to-all (parallel) → type totals → roll-up → allocations
  // (parallel). Only rows inside one step go together, so the project trigger and a failure stop as before.
  return { writes, log: [name] };
}

/** `planSaveTurbine` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveTurbine = (...a: Parameters<typeof planSaveTurbineUnchecked>): ReturnType<typeof planSaveTurbineUnchecked> =>
  requireOwningBusinessUnit(planSaveTurbineUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The turbine delete (`cmp_…ConfirmationDeleteGeneratorInProject.OnConfirm`, Y:15799): per allocation
 * of the turbine, remove the allocation when its cost has more than one, else remove the land-lease
 * cost (rule 21); `Remove(GeneratorInProjects)`; re-band the type from the remaining turbines
 * (`Project`, count, `'Cost per WTG'` 0 at zero turbines, cost, capacity, OBU); the roll-up.
 */
export function planDeleteTurbine(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost"> | null;
  accumulatedIndex: number;
  turbine: TurbineRow;
  typeTurbines: TurbineRow[];
  allTypes: GeneratorTypeRow[];
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
}, opts?: PlanBulkOptions): WritePlan {
  // Save performance (6 Nov 2026): the land-lease clean-up rows are independent; the turbine, the type totals and the
  // roll-up follow one by one, in the canvas order. Tiers (plan §9.4, phase 1B): the allocations are one leaf group (16),
  // then the land-lease costs one cascade group (4); each a group of its own, in that order.
  const cleanup = landLeaseCleanupWrites(planTurbineDeletion({
    allocations: args.allocations, siblingCountByCost: args.allocationCountByCost,
  }), { allocation: "the turbine's land-lease allocation", cost: "the turbine's land-lease cost" }, costByAllocation(args.allocations), opts);
  const writes: PlannedWrite[] = [...leafDeletes(cleanup.allocations, opts), ...cascadeDeletes(cleanup.costs, opts)];
  writes.push(del(ES_PLANT.generatorInProjects, args.turbine.id, `turbine ${args.turbine.name ?? ""}`));
  const remaining = args.typeTurbines.filter((t) => t.id !== args.turbine.id);
  const re = recomputeTypeFromChildren({ children: remaining, model: args.model, accumulatedIndex: args.accumulatedIndex });
  // DEL-7(a): flag `guardedUpdates`: when another user deleted the type meanwhile, this PATCH must not re-create it (S8).
  writes.push(guardedIf(upd(ES_PLANT.generatorTypeInProjects, args.type.id, {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    [GEN_TYPE_COL.numberOfGenerators]: re.numberOfGenerators,
    [GEN_TYPE_COL.costPerWtg]: re.costPerWtg,
    [GEN_TYPE_COL.generatorsCost]: re.generatorsCost,
    [GEN_TYPE_COL.generatorsCapacity]: re.generatorsCapacity,
    ...owner(args.project.owningBusinessUnitId),
  }, "the generator type's totals"), opts));
  writes.push(projectWtgRollup(args.project.id, args.allTypes.map((t) => t.id === args.type.id
    ? { ...t, generatorsCapacity: re.generatorsCapacity, generatorsCost: re.generatorsCost } : t)));
  return { writes, log: [] };
}

/**
 * Which land-lease rows a WTG type delete removes. G-05b (1.21.753) / SOURCE DEFECT (D27): the
 * 1.21.709 canvas filters the allocations by `locSelectedGeneratorInProject` — one turbine, usually
 * BLANK — so a type delete removed none of its own land-lease costs (and with a blank turbine it
 * matched allocations that have no turbine). Here every allocation of the type's turbines follows
 * the turbine-delete rule: the land-lease cost goes when all of its allocations belong to this
 * type, otherwise only this type's allocations go.
 */
export function planTypeLandLeaseCleanup(args: {
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
}): TurbineDeletionStep[] {
  const byCost = new Map<string, string[]>();
  for (const a of args.allocations) byCost.set(a.costId, [...(byCost.get(a.costId) ?? []), a.id]);
  const steps: TurbineDeletionStep[] = [];
  for (const [costId, ids] of byCost) {
    if ((args.allocationCountByCost[costId] ?? 0) > ids.length) {
      for (const id of ids) steps.push({ kind: "removeAllocation", allocationId: id });
    } else {
      steps.push({ kind: "removeLandLeaseCost", costId });
    }
  }
  return steps;
}

/**
 * The WTG type delete (`cmp_…ConfirmationDeleteGeneratorType.OnConfirm`, Y:15626): the land-lease
 * clean-up (`planTypeLandLeaseCleanup`), the `'Opex Project Costs'` of the type's `DeviceTypesInProjects` rows (the canvas
 * reads the first; DEL-3: the loader passes every bridge row's costs and their chain members), `Remove(GeneratorTypeInProjects)`,
 * the roll-up over the rest. A type
 * with an open permission flow (`needsPermissionCancellation`) gets `Requestpermissioncancellation`
 * first — the screen runs it before this plan (D97; the canvas runs it between the O&M deletes and the
 * `Remove`, so a failed cancellation there left the type without its costs).
 */
export function planDeleteGeneratorType(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  allTypes: GeneratorTypeRow[];
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
  opexCostIds: string[];
}, opts?: PlanBulkOptions): WritePlan {
  // Save performance (6 Nov 2026): the land-lease clean-up and the O&M cost deletes are independent rows; the type
  // delete and the roll-up follow one by one, in the canvas order. Tiers (plan §9.4, phase 1B): the allocation and O&M
  // deletes are one leaf group (16), then the land-lease cost deletes one cascade group (4). They were one mixed group.
  const cleanup = landLeaseCleanupWrites(planTypeLandLeaseCleanup(args),
    { allocation: "a land-lease allocation of the type", cost: "a land-lease cost of the type" }, costByAllocation(args.allocations), opts);
  const writes: PlannedWrite[] = [
    ...leafDeletes([
      ...cleanup.allocations,
      // DEL-4 scope: O&M head/period ordering is NOT handled here. The loader (`listOpexCostIdsForBridges`) returns plain ids
      // (heads, then chain members) with no parent information, so these deletes carry no `serialKey`; only allocations do.
      ...args.opexCostIds.map((id) => del(ES_PLANT.opexProjectCosts, id, "an O&M cost of the type")),
    ], opts),
    ...cascadeDeletes(cleanup.costs, opts),
  ];
  writes.push(del(ES_PLANT.generatorTypeInProjects, args.type.id, "the generator type", { confirm: true }));
  writes.push(projectWtgRollup(args.project.id, args.allTypes.filter((t) => t.id !== args.type.id)));
  return { writes, log: [] };
}

/**
 * Activate / Deactivate (`cmp_…ConfirmationChangeStatus.OnConfirm`, Y:16145): the type's `Status`,
 * then every turbine of the type (`Patch(GeneratorInProjects, ShowColumns(col, GeneratorInProject,
 * Status))`), then the roll-up — the toggled type counts only when it becomes Active (rule 23).
 */
export function planToggleStatus(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  turbines: Pick<TurbineRow, "id">[];
  allTypes: GeneratorTypeRow[];
}, opts?: PlanBulkOptions): WritePlan {
  const p = planStatusToggle({ type: args.type, turbines: args.turbines });
  // DEL-7(a): flag `guardedUpdates`: a type another user deleted is not re-created by the status PATCH.
  const typeUpdate = guardedIf(upd(ES_PLANT.generatorTypeInProjects, p.typeId, { statecode: p.nextStatus }, "the generator type's status"), opts);
  const rollup = projectWtgRollup(args.project.id, args.allTypes.map((t) => t.id === p.typeId ? { ...t, status: p.nextStatus } : t));
  if (bulkOn(opts, "status")) {
    // DIVERGENCE (plan §3 phase 3, §9.5; flag `status`): the N turbine `statecode` updates are ONE `updateMany` step. The
    // backend guards it: when a turbine is gone it sends nothing and the step fails with `BulkRowsGoneError`, so a row
    // another user deleted is never re-created (SDK PATCH is an upsert). Order unchanged: the type first, the turbines,
    // the roll-up last. A repeated id is dropped here (a duplicate in `UpdateMultiple` is refused).
    const rows = uniqueRows(p.turbineIds.map((id) => ({ id, data: { statecode: p.nextStatus } })));
    return {
      writes: [typeUpdate, ...(rows.length > 0 ? [updateMany(ES_PLANT.generatorInProjects, rows, "the turbines' status")] : []), rollup],
      log: [],
    };
  }
  const turbineUpdates = p.turbineIds.map((id) => upd(ES_PLANT.generatorInProjects, id, { statecode: p.nextStatus }, "a turbine's status"));
  if (perfOn(opts, "relaneWrites")) {
    // D144 (`relaneWrites`): the type's status update and the turbines' `statecode` updates are independent rows (each sets
    // the same next status; no one reads another's result): ONE wave, then the roll-up last, as before. A lone type update
    // (no turbines) stays a plain step.
    return { writes: [...wave([typeUpdate, ...turbineUpdates], opts), rollup], log: [] };
  }
  const writes: PlannedWrite[] = [
    typeUpdate,
    // Save performance (phase 1, 16 Nov 2026): the turbines' `statecode` updates are independent rows, sent as one
    // parallel run (`together`, 8 at a time; 16 with `wideGroups`). Order unchanged: the type first, the turbine group, the
    // roll-up last. Tier: these are UPDATES (`statecode`), not deletes, so the group keeps the default limit; the delete
    // tiers (plan §9.4) do not apply.
    ...group(turbineUpdates, opts),
    rollup,
  ];
  return { writes, log: [] };
}
