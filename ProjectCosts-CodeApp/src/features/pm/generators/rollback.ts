/**
 * Project Generators Screen - the rollback of a failed create save and what a failed delete job did and did not remove.
 *
 * Split out of `rules.ts` by job (D159, audit finding 7). `rules.ts` re-exports this file, so every import of `@/features/pm/generators/rules` is unchanged.
 */
import { CREATED_ROW_ID, type PlannedWrite, type WritePlan, createdRowRef, emptyPlan, refusePlan } from "@/data/writePlan";
import { ES, ES_PLANT } from "@/data/dataverseNames";
import { type LandedRow } from "@/data/executePlan";
import { type Lang } from "@/domain/powerFxNumeric";
import { GEN_INSTANCE_COL, type GeneratorTypeRow, type LandLeaseCostRow, PROJECT_PLANT_COL, type PvTypeFormState, type SimpleTypeRow, buildPvTypeFields, plantPvCapacity, plantPvCost, substructureCost, sumCapacity, valueOrNull } from "./rulesCore";
import { PLANT_BIND, type PlanBulkOptions, type PlanProject, allocationCreates, allocationStep, bulkOn, cascadeDeletes, cascadeDeletesIfMany, costByAllocation, del, deviceTypeShadow, group, ins, landLeaseCleanupWrites, leafDeletes, leafDeletesIfMany, owner, perfOn, planTypeLandLeaseCleanup, projectWtgRollup, ref, requireOwningBusinessUnit, upd, wave } from "./plans";
import { type SimpleCapacityFamily, type SimpleFormState } from "./display";

/* ═══════════════════════════════════════════ rollback of a failed create save (plan §9.3) ════ */

/**
 * One row a plan wrote or deleted, as the write executor reports it (`PlanResult` / `PlanError` `.landed`, `.deleted`,
 * `.maybeLanded`). The same type as the executor's `LandedRow` (DEL-5: unified), kept under its name here for the callers.
 */
export type LandedRowRef = LandedRow;

/** The identity of a row in a landed / deleted list: entity set + id, case-insensitive (a GUID may come back in either case). */
const landedKey = (row: LandedRowRef): string => `${row.entitySet.toLowerCase()}|${row.id.toLowerCase()}`;

/**
 * The rows of `landed` that are NOT in `deleted` (DEL-5, `PlanError.deleted` of a rollback or a delete job), in the order
 * of `landed`. Match is by entity set and id, case-insensitive. A pure list difference: what a retry still has to remove.
 */
export function remainingRows(landed: readonly LandedRowRef[], deleted: readonly LandedRowRef[]): LandedRowRef[] {
  const gone = new Set(deleted.map(landedKey));
  return landed.filter((row) => !gone.has(landedKey(row)));
}

/**
 * Every delete write of a plan, in plan order, as `{ entitySet, id }` (DEL-5): what a delete job attempted, to set against
 * `PlanError.deleted`. A delete whose id is a placeholder (`@created…`) or empty is skipped: it names no real row.
 */
export function plannedDeleteRows(plan: WritePlan): LandedRowRef[] {
  const rows: LandedRowRef[] = [];
  for (const w of plan.writes) {
    if (w.op !== "delete" || !w.id || w.id.startsWith(CREATED_ROW_ID)) continue;
    rows.push({ entitySet: w.entitySet, id: w.id });
  }
  return rows;
}

/** The landed rows by family. A PV type's unit is a turbine row (`vsb_generatorinprojects`) too. */
export interface LandedGroups {
  allocations: LandedRowRef[];
  bridgeRows: LandedRowRef[];
  turbines: LandedRowRef[];
  types: LandedRowRef[];
  pvTypes: LandedRowRef[];
  others: LandedRowRef[];
}

/** Sorts what a failed save wrote into its families, keeping the landing order inside each. */
export function groupLandedRows(landed: readonly LandedRowRef[]): LandedGroups {
  const g: LandedGroups = { allocations: [], bridgeRows: [], turbines: [], types: [], pvTypes: [], others: [] };
  for (const row of landed) {
    switch (row.entitySet) {
      case ES.landLeaseAllocationWtgs: g.allocations.push(row); break;
      case ES_PLANT.deviceTypesInProjects: g.bridgeRows.push(row); break;
      case ES_PLANT.generatorInProjects: g.turbines.push(row); break;
      case ES_PLANT.generatorTypeInProjects: g.types.push(row); break;
      case ES_PLANT.pvModuleTypeInProjects: g.pvTypes.push(row); break;
      default: g.others.push(row);
    }
  }
  return g;
}

/**
 * Which saves are rolled back when they fail part-way (plan §9.3): A, Add WTG type; B, an out-of-country type
 * whose Request Module Permission flow fails to start. Every other save keeps today's behaviour. NEW — no
 * canvas equivalent (DIVERGENCE, plan §9.3).
 */
export type RollbackScenario =
  | "addWtgType" | "outOfCountryApprovalFailed"
  | "addPvType" | "addTurbine" | "editTurbine" | "applyToAll"
  | "replaceGeneratorType" | "replacePvType" | "deleteGeneratorType" | "deletePvType"
  | "toggleStatus" | "saveSimple" | "saveInverter" | "saveSubstructure";

export const rollbackApplies = (scenario: RollbackScenario): boolean =>
  scenario === "addWtgType" || scenario === "outOfCountryApprovalFailed";

/** The roll-back delete of one landed row. A 404 counts as already gone in the executor (`unwrapDelete`). */
const undo = (row: LandedRowRef, what: string, confirm = false): PlannedWrite =>
  del(row.entitySet, row.id, `undo: ${what}`, confirm ? { confirm: true } : {});

/**
 * Deletes what a failed create save landed, children before parents (plan §9.3):
 *  1. the allocations (one parallel run; deleting a turbine only unlinks them, so they go explicitly),
 *  2. the device-type bridge rows,
 *  3. the turbines (one parallel run; the type's cascade would remove them, deleted so a refusal shows),
 *  4. the type(s),
 *  5. any other landed row (unknown family: after its possible parents),
 *  6. only when `rollupRan`, the project roll-up recomputed WITHOUT the deleted type, last.
 * Nothing landed -> an empty plan. The roll-up uses `remainingTypes` (the project's types without the new one;
 * a type listed in `landed` is dropped from it as well) for a WTG type, or `remainingPv` for a PV type.
 *
 * DEL-5: `maybeLanded` (`PlanError.maybeLanded`: rows of a failed `createMany` the backend could not confirm) are undone
 * too, de-duplicated against `landed` and ordered by the same families. The engine counts a 404 on a delete as already gone,
 * so a row that never existed is harmless; `describeLeftovers` must NOT be given them as certainly landed.
 */
export function planRollbackCreate(args: {
  project: PlanProject;
  landed: readonly LandedRowRef[];
  maybeLanded?: readonly LandedRowRef[];
  rollupRan: boolean;
  remainingTypes: (Pick<GeneratorTypeRow, "requestPermissionState" | "status" | "generatorsCapacity" | "generatorsCost"> & { id?: string })[];
  remainingPv?: {
    pv: Pick<SimpleTypeRow, "capacity" | "cost">[];
    inverters: Pick<SimpleTypeRow, "cost">[];
    substructures: Pick<SimpleTypeRow, "cost">[];
  };
}, opts?: PlanBulkOptions): WritePlan {
  const seen = new Set<string>();
  const toUndo = [...args.landed, ...(args.maybeLanded ?? [])].filter((r) => {
    if (!r.id) return false;
    const key = landedKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const g = groupLandedRows(toUndo);
  const total = g.allocations.length + g.bridgeRows.length + g.turbines.length + g.types.length + g.pvTypes.length + g.others.length;
  if (total === 0) return emptyPlan();
  const writes: PlannedWrite[] = [
    // Tiers (plan §9.4, phase 1B): allocations, bridge rows and turbines are leaf groups (16 in flight; each its own
    // group, so they run one after the other); the types are the cascade tier (4), because a type's delete locks and
    // updates its children. A single bridge row or type stays a plain one-by-one step.
    // No `serialKey` on the allocations: a landed row carries no parent id (only entity set and id), so the cost is unknown here.
    ...leafDeletes(g.allocations.map((r) => undo(r, "a land-lease allocation of the new type")), opts),
    ...leafDeletesIfMany(g.bridgeRows.map((r) => undo(r, "the new type's device-type row")), opts),
    ...leafDeletes(g.turbines.map((r) => undo(r, "a turbine of the new type")), opts),
    ...cascadeDeletesIfMany([
      ...g.types.map((r) => undo(r, "the new generator type", true)),
      ...g.pvTypes.map((r) => undo(r, "the new PV module type", true)),
    ], opts),
    ...g.others.map((r) => undo(r, "a row the failed save created")),
  ];
  if (args.rollupRan) {
    if (g.pvTypes.length > 0) {
      if (!args.remainingPv) return refusePlan("The PV roll-up needs the remaining PV rows.");
      writes.push(upd(ES.projects, args.project.id, {
        [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.remainingPv.pv),
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.remainingPv.pv, inverters: args.remainingPv.inverters, substructures: args.remainingPv.substructures }),
      }, "the project's Plant PV Capacity / Cost, without the undone type"));
    } else {
      const gone = new Set(g.types.map((r) => r.id));
      writes.push(projectWtgRollup(args.project.id, args.remainingTypes.filter((t) => !(t.id && gone.has(t.id)))));
    }
  }
  return { writes, log: [`Undo of ${total} landed rows`] };
}

/** What a failed rollback left behind, counted. `types` counts landed type rows (generator or PV). */
export interface RollbackLeftovers {
  typeName?: string;
  types: number;
  turbines: number;
  allocations: number;
  bridgeRows: number;
  /** Rows of an unknown entity set (the named kinds below are not counted here). */
  other: number;
  /** Inverter, substructure, BESS, hydrogen and substation rows, with their nouns; absent when there are none (review F3 item 3). */
  otherKinds?: { one: string; many: string; count: number }[];
  total: number;
}

/** Counts the rows to clean up. `names.typeName` is the type's name (an autonumber the screen reads back). */
export function describeLeftovers(landed: readonly LandedRowRef[], names: { typeName?: string | null }): RollbackLeftovers {
  const g = groupLandedRows(landed.filter((r) => r.id));
  const types = g.types.length + g.pvTypes.length;
  const kinds = splitOtherKinds(g.others);
  return {
    ...(names.typeName && types > 0 ? { typeName: names.typeName } : {}),
    types,
    turbines: g.turbines.length,
    allocations: g.allocations.length,
    bridgeRows: g.bridgeRows.length,
    other: kinds.unknown,
    ...(kinds.named.length > 0 ? { otherKinds: kinds.named } : {}),
    total: types + g.turbines.length + g.allocations.length + g.bridgeRows.length + g.others.length,
  };
}

const countOf = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Readable nouns for the type rows a failed save or delete can leave that have no family of their own in `groupLandedRows`
 * (review F3 item 3), keyed by entity set, in the order they are listed. Only an unknown set is called "other row".
 * NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5).
 */
const OTHER_KIND_NOUNS: readonly { set: string; one: string; many: string }[] = [
  { set: ES_PLANT.inverterTypeInProjects, one: "inverter type", many: "inverter types" },
  { set: ES_PLANT.substructureTypeInProjects, one: "substructure type", many: "substructure types" },
  { set: ES_PLANT.storageTypeInProjects, one: "BESS row", many: "BESS rows" },
  { set: ES_PLANT.hydrogenTypeInProjects, one: "hydrogen row", many: "hydrogen rows" },
  { set: ES_PLANT.substationTypeInProjects, one: "substation row", many: "substation rows" },
];

/** The rows of `others` split into the named kinds (in `OTHER_KIND_NOUNS` order, empty kinds left out) and the unknown rest. */
function splitOtherKinds(others: readonly LandedRowRef[]): { named: { one: string; many: string; count: number }[]; unknown: number } {
  const named = OTHER_KIND_NOUNS
    .map((k) => ({ one: k.one, many: k.many, count: others.filter((r) => r.entitySet.toLowerCase() === k.set).length }))
    .filter((k) => k.count > 0);
  return { named, unknown: others.length - named.reduce((sum, k) => sum + k.count, 0) };
}

/** The text of a failed rollback: says exactly what is left. Turbines and allocations are always listed. */
export function leftoversMessage(d: RollbackLeftovers): string {
  const parts: string[] = [];
  if (d.types > 0) parts.push(d.typeName ? `generator type "${d.typeName}"` : countOf(d.types, "generator type", "generator types"));
  parts.push(countOf(d.turbines, "generator", "generators"));
  parts.push(countOf(d.allocations, "land-lease allocation", "land-lease allocations"));
  if (d.bridgeRows > 0) parts.push(countOf(d.bridgeRows, "device-type row", "device-type rows"));
  for (const k of d.otherKinds ?? []) parts.push(countOf(k.count, k.one, k.many));
  if (d.other > 0) parts.push(countOf(d.other, "other row", "other rows"));
  return `This save failed and could not be fully undone. Left behind: ${parts.join(", ")}. Press ${ROLLBACK_MSG.retryButton} to remove them.`;
}

/** The roll-back texts. All three are NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
export const ROLLBACK_MSG = {
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
  undone: "This save failed and was undone. Nothing was kept.",
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
  leftover: (d: RollbackLeftovers): string => leftoversMessage(d),
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
  retryButton: "Retry cleanup",
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). The progress text of the rollback job (DEL-5: moved here from `Screen.tsx`, same wording). */
  progress: "Undoing the failed save, please wait...",
  /**
   * NEW — no canvas equivalent (DIVERGENCE, plan §9.3, review finding 3c). Shown when a failed save should have been rolled
   * back but the project is not loaded any more, so no rollback plan can be built (DEL-5: moved here, same wording).
   */
  noProject: "The failed save could not be undone automatically. Reload the page and check the generator types.",
  /**
   * NEW — no canvas equivalent (DIVERGENCE, plan §9.3). Shown when a failed save's rollback removed every generator row but the
   * project roll-up (its last write) failed, so nothing is left to retry (DEL-5; review F3 item 4: moved here from `Screen.tsx`, same wording).
   */
  totalsFailed:
    "The generator rows of the failed save were removed, but the project totals could not be updated. Reload the page and check the generator totals.",
  /**
   * NEW — no canvas equivalent (DIVERGENCE, plan §9.3). Shown when no row is certainly left, but some rows of a failed bulk
   * create may exist (`maybeLanded`): the Retry cleanup button stays (review F3 item 4).
   */
  maybeLeft: `Some rows of the failed save may not have been removed. Press Retry cleanup to check and remove them.`,
} as const;

/** The longest rollback error detail shown beside the leftover message (the bar must stay readable). */
export const ROLLBACK_DETAIL_MAX = 240;

/* ═══════════════════ what a failed delete job did and did not remove (delete hardening plan DEL-5) ════ */

/**
 * The texts of a delete that failed part-way. NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5): the canvas
 * shows one error and says nothing about what was already removed. A delete cannot be undone, so the user finishes it.
 * Shape: `Removed: 1 generator type, 12 generators. Not removed: 3 land-lease allocations. Press Delete again to finish.`
 */
export const DELETE_PARTIAL_MSG = {
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). */
  removed: "Removed:",
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). */
  notRemoved: "Not removed:",
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). */
  pressAgain: "Press Delete again to finish.",
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). A half with no parts is left out. */
  text: (removed: readonly string[], notRemoved: readonly string[]): string => [
    ...(removed.length > 0 ? [`${DELETE_PARTIAL_MSG.removed} ${removed.join(", ")}.`] : []),
    ...(notRemoved.length > 0 ? [`${DELETE_PARTIAL_MSG.notRemoved} ${notRemoved.join(", ")}.`] : []),
    DELETE_PARTIAL_MSG.pressAgain,
  ].join(" "),
} as const;

/** The rows of one half of the partial-delete text, counted per family in a fixed order (types first). */
function deleteFamilyParts(rows: readonly LandedRowRef[], typeName: string | null | undefined): string[] {
  const g = groupLandedRows(rows.filter((r) => r.id));
  const setOf = (r: LandedRowRef): string => r.entitySet.toLowerCase();
  const costs = g.others.filter((r) => setOf(r) === ES_PLANT.landLeaseProjectCosts);
  const opex = g.others.filter((r) => setOf(r) === ES_PLANT.opexProjectCosts);
  const rest = g.others.filter((r) => setOf(r) !== ES_PLANT.landLeaseProjectCosts && setOf(r) !== ES_PLANT.opexProjectCosts);
  const kinds = splitOtherKinds(rest);
  const other = kinds.unknown;
  const named = (n: number, one: string, many: string, kind: string): string =>
    (typeName && n === 1 ? `${kind} "${typeName}"` : countOf(n, one, many));
  const parts: [number, string][] = [
    [g.types.length, named(g.types.length, "generator type", "generator types", "generator type")],
    [g.pvTypes.length, named(g.pvTypes.length, "PV module type", "PV module types", "PV module type")],
    [g.turbines.length, countOf(g.turbines.length, "generator", "generators")],
    [g.allocations.length, countOf(g.allocations.length, "land-lease allocation", "land-lease allocations")],
    [costs.length, countOf(costs.length, "land-lease cost", "land-lease costs")],
    [opex.length, countOf(opex.length, "O&M cost", "O&M costs")],
    [g.bridgeRows.length, countOf(g.bridgeRows.length, "device-type row", "device-type rows")],
    ...kinds.named.map((k): [number, string] => [k.count, countOf(k.count, k.one, k.many)]),
    [other, countOf(other, "other row", "other rows")],
  ];
  return parts.filter(([n]) => n > 0).map(([, text]) => text);
}

/**
 * What a delete job that failed part-way removed and did not remove (DEL-5). `attempted` is `plannedDeleteRows(plan)`,
 * `deleted` is `PlanError.deleted`. Null when every attempted row was deleted (nothing to tell) AND when none was (review F3
 * item 2: the job's own error stands and a "press again" hint would mislead). `typeName` names the one
 * type row when there is exactly one in a half. NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5).
 */
export function deletePartialMessage(args: {
  attempted: readonly LandedRowRef[];
  deleted: readonly LandedRowRef[];
  typeName?: string | null;
}): string | null {
  const notRemoved = remainingRows(args.attempted, args.deleted);
  if (notRemoved.length === 0) return null;
  const left = new Set(notRemoved.map(landedKey));
  const removed = args.attempted.filter((r) => !left.has(landedKey(r)));
  // Review F3 item 2: a "press Delete again" hint is only true when the job really made progress. With nothing deleted the
  // original error stands alone (after a 403 pressing again would fail the same way).
  if (removed.length === 0) return null;
  return DELETE_PARTIAL_MSG.text(deleteFamilyParts(removed, args.typeName), deleteFamilyParts(notRemoved, args.typeName));
}

/** `'Plant PV Cost [EUR]' = Σ PV cost + Σ inverter type cost + Σ substructure cost` (rule 16). */
const projectPvCost = (projectId: string, pv: SimpleTypeRow[], inverters: SimpleTypeRow[], substructures: SimpleTypeRow[]): PlannedWrite =>
  upd(ES.projects, projectId, {
    [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv, inverters, substructures }),
  }, "the project's Plant PV Cost");

/**
 * The PV save, first job: `Patch(PVModuleTypeInProjects, <row or Defaults>, {Project, Label, PVModule,
 * 'Other Supplier', degradations, 'Cost per Power', 'Capacity [MWp]', 'Cost [EUR]', OBU})` (Y:8001).
 */
function planSavePvTypeUnchecked(args: {
  project: PlanProject;
  pv: SimpleTypeRow | null;
  form: PvTypeFormState;
  deviceCostModules: number | null | undefined;
  otherSupplierChosen: boolean;
  /** The user's language. Required: capacity and degradations are typed in it. */
  lang: Lang;
}): WritePlan {
  const data = {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...buildPvTypeFields(args.form, {
      deviceCostModules: args.deviceCostModules, otherSupplierChosen: args.otherSupplierChosen, lang: args.lang,
    }),
    ...owner(args.project.owningBusinessUnitId),
  };
  const write = args.pv
    ? upd(ES_PLANT.pvModuleTypeInProjects, args.pv.id, data, "the PV module type")
    : ins(ES_PLANT.pvModuleTypeInProjects, data, "the PV module type");
  return { writes: [write], log: [args.form.moduleLabel] };
}

/** `planSavePvType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSavePvType = (...a: Parameters<typeof planSavePvTypeUnchecked>): ReturnType<typeof planSavePvTypeUnchecked> =>
  requireOwningBusinessUnit(planSavePvTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The PV save, second job (it needs the type's autonumber `Name`):
 *  1. `Patch(GeneratorInProjects, <the PV type's unit or Defaults>, {Name: <type>.Name,
 *     ModuleTypeInProject: <type>, OBU})` (Y:8038) — DIVERGENCE (D27): an edited type without a unit
 *     gets one created (the canvas `Patch` of a blank `LookUp` fails);
 *  2. G7 (solution 1.21.753, PO answer 20 Oct 2026) — a NEW PV type's unit is back-filled into every
 *     `AllWTGAllocated = Yes` land-lease cost (`If(varIsNewPvModule, …; Select(btn_Trigger_New_AllocateWTGs_To_Land_Lease))`,
 *     gap register G-05b; source: the 1.21.753 skeleton port `createPvBridgeAndUnit`). 1.21.709 allocated
 *     no PV unit. An edit never back-fills, as the canvas gates it on `varIsNewPvModule`;
 *  3. `'Plant PV Capacity [MWp]'` and `'Plant PV Cost [EUR]'` (Y:8128-8158) — the out-of-country
 *     permission branch is `If(true = false, …)` in the canvas, so this always runs;
 *  4. the queued `DeviceTypesInProjects` shadow when none exists (Y:8037 → Y:65).
 */
function planPvFollowUpUnchecked(args: {
  project: PlanProject;
  pvId: string;
  pvName: string;
  unitId: string | null;
  hasDeviceType: boolean;
  pvRows: Pick<SimpleTypeRow, "capacity" | "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: Pick<SimpleTypeRow, "cost">[];
  /** `varIsNewPvModule` — the type was created by the first job. */
  isNew?: boolean;
  /** The project's `AllWTGAllocated = Yes` land-lease costs (G7). */
  landLeaseCosts?: LandLeaseCostRow[];
}, opts?: PlanBulkOptions): WritePlan {
  const unit = {
    [GEN_INSTANCE_COL.name]: args.pvName,
    [PLANT_BIND.moduleTypePv]: ref(ES_PLANT.pvModuleTypeInProjects, args.pvId),
    ...owner(args.project.owningBusinessUnitId),
  };
  const unitWrite = args.unitId
    ? upd(ES_PLANT.generatorInProjects, args.unitId, unit, "the PV type's unit")
    : ins(ES_PLANT.generatorInProjects, unit, "the PV type's unit");
  const allocationArgs = {
    costs: args.landLeaseCosts ?? [], turbines: [{ id: args.unitId ?? createdRowRef(0), name: args.pvName }],
    owningBusinessUnitId: args.project.owningBusinessUnitId,
  };
  const rollupWrite = upd(ES.projects, args.project.id, {
    [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.pvRows),
    [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pvRows, inverters: args.inverters, substructures: args.substructures }),
  }, "the project's Plant PV Capacity / Cost");
  const shadow = args.hasDeviceType ? [] : [deviceTypeShadow({
    family: "pv", typeId: args.pvId, typeName: args.pvName, owningBusinessUnitId: args.project.owningBusinessUnitId,
  })];
  if (perfOn(opts, "relaneWrites")) {
    // D144 (`relaneWrites`): after the unit, the G7 allocations (bound to the unit), the project's PV capacity / cost and the
    // device-type row (it needs only the PV type's name) are ONE wave: no one of them reads a row another writes. The roll-up
    // still comes after the PV type and the unit it sums, and is written once. With `allocations` on the createMany stays its
    // own step, where it was (after the unit), and the roll-up and the device-type row share a wave.
    const bulkAllocations = bulkOn(opts, "allocations");
    const lane = [
      ...(args.isNew && !bulkAllocations ? allocationCreates(allocationArgs) : []),
      rollupWrite, ...shadow,
    ];
    return {
      writes: [unitWrite, ...(args.isNew && bulkAllocations ? allocationStep(allocationArgs, opts) : []), ...wave(lane, opts)],
      log: [],
    };
  }
  const writes: PlannedWrite[] = [
    unitWrite,
    // G7 — bound to the unit this plan created (its first create), or the existing one. Save performance
    // (6 Nov 2026): independent rows, sent as one parallel run; the unit before them, the roll-up after.
    ...(args.isNew ? allocationStep(allocationArgs, opts) : []),
    rollupWrite,
  ];
  writes.push(...shadow);
  return { writes, log: [] };
}

/** `planPvFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planPvFollowUp = (...a: Parameters<typeof planPvFollowUpUnchecked>): ReturnType<typeof planPvFollowUpUnchecked> =>
  requireOwningBusinessUnit(planPvFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The canvas PV delete, as shipped (`cmp_…ConfirmationDeletePVModuleType.OnConfirm`, Y:15466): `Remove`;
 * `'Plant PV Capacity [MWp]'`; every substructure's cost re-computed against the new capacity (`Fixed` /
 * `Tracker` × capacity, else 0); `'Plant PV Cost [EUR]'`. An open permission flow is cancelled first,
 * by the screen (D97). `planDeletePvType` runs this after the children (G2).
 */
export function planDeletePvTypeCanvasParity(args: {
  project: PlanProject;
  pv: SimpleTypeRow;
  pvRows: SimpleTypeRow[];
  inverters: SimpleTypeRow[];
  substructures: SimpleTypeRow[];
  deviceCostFix: number | null | undefined;
  deviceCostTracker: number | null | undefined;
}): WritePlan {
  const rest = args.pvRows.filter((r) => r.id !== args.pv.id);
  const capacity = plantPvCapacity(rest);
  const substructures = args.substructures.map((s) => ({
    ...s,
    cost: substructureCost({
      mounting: s.typeLabels?.[0] ?? null, deviceCostFix: args.deviceCostFix,
      deviceCostTracker: args.deviceCostTracker, plantPvCapacityMwp: capacity,
    }),
  }));
  const writes: PlannedWrite[] = [
    del(ES_PLANT.pvModuleTypeInProjects, args.pv.id, "the PV module type", { confirm: true }),
    upd(ES.projects, args.project.id, { [PROJECT_PLANT_COL.plantPvCapacity]: capacity }, "the project's Plant PV Capacity"),
    // Save performance (6 Nov 2026): independent rows, one parallel run between the capacity and the PV cost.
    ...group(substructures.map((s) => upd(ES_PLANT.substructureTypeInProjects, s.id, { vsb_substructurecost: s.cost }, "a substructure cost"))),
    projectPvCost(args.project.id, rest, args.inverters, substructures),
  ];
  return { writes, log: [] };
}

/**
 * The PV delete. G2 (PO answer 20 Oct 2026) / SOURCE DEFECT (D27): the confirmation says "All related
 * cost in O&M and Land Lease will be removed" (`DIALOG_TEXT.deletePvModuleType`), but the canvas only
 * `Remove`s the type. Dataverse then deletes the type's unit and its O&M device-type row by cascade
 * (`vsb_vsb_generatorinproject_vsb_pvmoduletypeinproject_…` and `vsb_vsb_devicetypesinproject_vsb_pvmoduletypeinproject_…`
 * are `CascadeDelete` in `customizations.xml`), while the unit's land-lease allocations and the
 * device-type row's O&M costs are only unlinked (`RemoveLink`) — orphaned rows that still carry cost.
 *
 * Now, children first, as the WTG type delete does:
 *  1. the land-lease clean-up of the PV unit(s) — the G1 rule (`planTypeLandLeaseCleanup`): a land-lease
 *     cost goes when all its allocations belong to the type, otherwise only the type's allocations go;
 *  2. the `'Opex Project Costs'` of the type's `DeviceTypesInProjects` rows (Y:15634, the WTG rule; DEL-3: every bridge row);
 *  3. the PV unit(s) (`GeneratorInProjects`);
 *  4. the canvas body (`planDeletePvTypeCanvasParity`): the type, the capacity, the substructure costs,
 *     the PV cost. The device-type row goes with the type (cascade), as on the WTG type delete.
 */
export function planDeletePvType(args: Parameters<typeof planDeletePvTypeCanvasParity>[0] & {
  unitIds: readonly string[];
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
  opexCostIds: readonly string[];
}, opts?: PlanBulkOptions): WritePlan {
  const canvas = planDeletePvTypeCanvasParity(args);
  if (canvas.refusedReason) return canvas;
  // Save performance (6 Nov 2026): the land-lease clean-up and the O&M deletes are independent rows; the unit(s)
  // follow (after them, as before), then the canvas body. Tiers (plan §9.4, phase 1B): the allocation and O&M deletes
  // are one leaf group (16), the land-lease costs one cascade group (4), the units a leaf group when there are several.
  const cleanup = landLeaseCleanupWrites(planTypeLandLeaseCleanup(args),
    { allocation: "a land-lease allocation of the PV module type", cost: "a land-lease cost of the PV module type" },
    costByAllocation(args.allocations), opts);
  const children: PlannedWrite[] = [
    ...leafDeletes([
      ...cleanup.allocations,
      // DEL-4 scope: O&M head/period ordering is not handled (plain ids from the loader); see `planDeleteGeneratorType`.
      ...args.opexCostIds.map((id) => del(ES_PLANT.opexProjectCosts, id, "an O&M cost of the PV module type")),
    ], opts),
    ...cascadeDeletes(cleanup.costs, opts),
    ...leafDeletesIfMany(args.unitIds.map((id) => del(ES_PLANT.generatorInProjects, id, "the PV module type's unit", { confirm: true })), opts),
  ];
  return { writes: [...children, ...canvas.writes], log: canvas.log };
}

/**
 * Inverter / substructure delete (`…DeleteInverterType.OnConfirm` Y:15377, `…DeleteSubstructureType`
 * Y:15288): `Remove`, then `'Plant PV Cost [EUR]'`. An open permission flow is cancelled first, by the
 * screen (D97). SOURCE DEFECT (D27): the canvas substructure cancellation sends `ModuleType.Inverter`
 * (Y:15288) — `buildCancellationPayload` maps the family correctly.
 */
export function planDeleteInverterOrSubstructure(args: {
  project: PlanProject;
  family: "inverter" | "substructure";
  row: SimpleTypeRow;
  pv: SimpleTypeRow[];
  inverters: SimpleTypeRow[];
  substructures: SimpleTypeRow[];
}): WritePlan {
  const inverters = args.family === "inverter" ? args.inverters.filter((r) => r.id !== args.row.id) : args.inverters;
  const substructures = args.family === "substructure" ? args.substructures.filter((r) => r.id !== args.row.id) : args.substructures;
  return {
    writes: [
      del(args.family === "inverter" ? ES_PLANT.inverterTypeInProjects : ES_PLANT.substructureTypeInProjects, args.row.id,
        args.family === "inverter" ? "the inverter type" : "the substructure type", { confirm: true }),
      projectPvCost(args.project.id, args.pv, inverters, substructures),
    ],
    log: [],
  };
}

const SIMPLE_TABLE: Record<SimpleCapacityFamily, { set: string; capacity: string; plant: string }> = {
  storage: { set: ES_PLANT.storageTypeInProjects, capacity: "vsb_storagecapacitydec", plant: PROJECT_PLANT_COL.plantStorageCapacity },
  hydrogen: { set: ES_PLANT.hydrogenTypeInProjects, capacity: "vsb_hydrogencapacitydec", plant: PROJECT_PLANT_COL.plantHydrogenCapacity },
  substation: { set: ES_PLANT.substationTypeInProjects, capacity: "vsb_substationcapacitydec", plant: PROJECT_PLANT_COL.plantSubstationCapacity },
};

/**
 * BESS / Hydrogen / Substation save (Y:12319, 13043, 13762): `Patch(<T>, <selected or Defaults>, {Name,
 * capacity (+ 'Energy Capacity [MWh]' for BESS), Supplier, Project, OBU})`, then `'Plant <X> Capacity'`
 * = Σ of the project's rows. The hidden Type combobox (`colDummyTypes`) is not written — DIVERGENCE
 * (D27): the canvas re-wrote the row's own value (or blank for a new row), which leaves it as it is.
 */
function planSaveSimpleUnchecked(args: {
  project: PlanProject;
  family: SimpleCapacityFamily;
  row: SimpleTypeRow | null;
  rows: SimpleTypeRow[];
  form: SimpleFormState;
  /** The user's language. Required: the capacity boxes open in it ("12,50"). */
  lang: Lang;
}): WritePlan {
  const { lang } = args;
  const t = SIMPLE_TABLE[args.family];
  const capacity = valueOrNull(args.form.capacity, lang);
  const data: Record<string, unknown> = {
    vsb_name: args.form.label,
    [t.capacity]: capacity,
    ...(args.family === "storage" ? { crc36_energycapacitymwh: valueOrNull(args.form.energyCapacity, lang) } : {}),
    vsb_supplier: args.form.supplier,
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...owner(args.project.owningBusinessUnitId),
  };
  const after = [...args.rows.filter((r) => r.id !== args.row?.id), { capacity }];
  return {
    writes: [
      args.row ? upd(t.set, args.row.id, data, args.form.label) : ins(t.set, data, args.form.label),
      upd(ES.projects, args.project.id, { [t.plant]: sumCapacity(after) }, "the project's plant capacity"),
    ],
    log: [args.form.label],
  };
}

/** `planSaveSimple` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveSimple = (...a: Parameters<typeof planSaveSimpleUnchecked>): ReturnType<typeof planSaveSimpleUnchecked> =>
  requireOwningBusinessUnit(planSaveSimpleUnchecked(...a), a[0].project.owningBusinessUnitId);

/** BESS / Hydrogen / Substation delete (Y:16315, 16298, 16281): `Remove`, then the capacity roll-up. */
export function planDeleteSimple(args: {
  project: PlanProject;
  family: SimpleCapacityFamily;
  row: SimpleTypeRow;
  rows: SimpleTypeRow[];
}): WritePlan {
  const t = SIMPLE_TABLE[args.family];
  return {
    writes: [
      del(t.set, args.row.id, args.row.name ?? "", { confirm: true }),
      upd(ES.projects, args.project.id, { [t.plant]: sumCapacity(args.rows.filter((r) => r.id !== args.row.id)) },
        "the project's plant capacity"),
    ],
    log: [],
  };
}
