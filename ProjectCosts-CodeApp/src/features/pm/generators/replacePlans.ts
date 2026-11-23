/**
 * Project Generators Screen - Replace Generator / PV Module Type, the write plans.
 *
 * Split out of `rules.ts` by job (D159, audit finding 7). `rules.ts` re-exports this file, so every import of `@/features/pm/generators/rules` is unchanged.
 */
import { type BulkRow } from "@/data/bulkBackend";
import { ES, ES_PLANT } from "@/data/dataverseNames";
import { type Lang } from "@/domain/powerFxNumeric";
import { type PlannedWrite, type WritePlan, createdRowRef, refusePlan, updateMany } from "@/data/writePlan";
import { type CatalogModel, GEN_INSTANCE_COL, type GeneratorTypeRow, type LandLeaseCostRow, PROJECT_PLANT_COL, PV_BRIDGE_MISSING, type PvTypeFormState, type ReplaceAllocation, type SimpleTypeRow, type TurbineRow, planReplaceLandLease, plantPvCapacity, plantPvCost } from "./rulesCore";
import { type CreateTypePlan, PLANT_BIND, type PlanBulkOptions, type PlanProject, allocationCreates, allocationDelete, allocationStep, bulkOn, costByAllocation, del, deviceTypeShadow, group, guardedIf, ins, leafDeletes, leafDeletesIfMany, owner, perfOn, planCreateGeneratorType, ref, requireOwningBusinessUnit, uniqueRows, upd, wave } from "./plans";
import { planSavePvType } from "./rollback";

/* ═══════════════════ D27 G6 — Replace Generator / PV Module Type, the write plans (1.21.753) ════ */
/*
 * Ported 20 Oct 2026 on the PO's answer (G6). No 1.21.753 canvas YAML with these panels is on disk; the
 * sources are `migration-plans/10-solution-1.21.753-gap-register.md` (G-05, G-05b, G-05c),
 * `VSBCloud-Code-App-Skeleton/CHANGES-1.21.753.md` and the skeleton port
 * (`vsbcode/src/features/pm/generators/hooks.ts` `replaceGeneratorTypeImpl` / `replacePvModuleTypeImpl`,
 * `replace.test.ts`) — reference only, re-derived against this app's names and write plans.
 *
 * The canvas phases (`REPLACE_PHASES`): Identify → Detach → Delete → Add → AllocateLandLease → Repoint.
 * Job 1 (`planReplaceGeneratorType` / `planReplacePvType`): Detach (the old type's O&M costs lose their
 * device-type link), Delete (the old units, the old device-type rows, the old type), Add (the ordinary
 * save body). Job 2 (`…FollowUp`) needs the new ids: the new device-type row, the AllWTG back-fill, the
 * manual allocations moved, the old AllWTG rows removed, the O&M costs re-linked.
 *
 * SOURCE DEFECT 1.21.753-2 (G-05c) — not reproduced: the canvas T2c also removed the allocations of the
 * turbine selected at the time, which T2a had captured for re-pointing. Here they are re-pointed.
 * Excluded (D27, X3): a replace out of country (`RequestModulePermission`) and a replace of a type with
 * an open permission request (`Requestpermissioncancellation`) are refused.
 */

/** What a replace reads before its first job (T2a, "Identify"). */
export interface ReplaceInputs {
  /**
   * EVERY `DeviceTypesInProjects` row of the old type, oldest first (DEL-3; the canvas used only the first as the O&M bridge).
   * All of them are deleted.
   */
  bridgeIds: string[];
  /**
   * The project's `'Opex Project Costs'` on EVERY bridge row of the old type (any status), heads and their chain members
   * (DEL-3). The detach clears each one's device-type link and the follow-up links each one to the new bridge: period rows
   * carry the bridge bind like their head (`data/periodWrites.ts` re-binds it on every period save and import).
   */
  opexCostIds: string[];
  /** The old type's units (`GeneratorInProjects`). */
  unitIds: string[];
  /** The old units' land-lease allocations. */
  allocations: ReplaceAllocation[];
  /** The project's `AllWTGAllocated = Yes` land-lease costs — the T2g back-fill. */
  landLeaseCosts: LandLeaseCostRow[];
}

/**
 * T2a — the old units' allocations, each with its unit's index and its cost's AllWTG flag. `keepCostIds` (DEL-4, opt-in so the
 * default shape is unchanged) also keeps each allocation's land-lease cost id, the `serialKey` of its delete when
 * `GENERATORS_DELETE.parentOrder` is on.
 */
export function toReplaceAllocations(args: {
  allocations: readonly { id: string; costId: string; turbineId: string }[];
  units: readonly Pick<TurbineRow, "id" | "index">[];
  allWtgCostIds: ReadonlySet<string>;
  keepCostIds?: boolean;
}): ReplaceAllocation[] {
  const indexOf = new Map(args.units.map((u) => [u.id, u.index]));
  return args.allocations.map((a) => ({
    id: a.id,
    unitIndex: indexOf.get(a.turbineId) ?? 0,
    allWtgAllocated: args.allWtgCostIds.has(a.costId),
    ...(args.keepCostIds ? { costId: a.costId } : {}),
  }));
}

/** An O&M cost's device-type link — set, or cleared with `@odata.bind: null` (T2b / T2f). */
const opexLinkData = (bridge: string | null): Record<string, unknown> => ({
  [PLANT_BIND.deviceTypeInProject]: bridge ? ref(ES_PLANT.deviceTypesInProjects, bridge) : null,
});
const opexLink = (opexId: string, bridge: string | null, reason: string): PlannedWrite =>
  upd(ES_PLANT.opexProjectCosts, opexId, opexLinkData(bridge), reason);

/**
 * T2b Detach and T2c Delete, children first: O&M links cleared, units, device-type rows, the type.
 *
 * Save performance (6 Nov 2026): the O&M detach and the unit deletes touch unrelated rows — one parallel run.
 * The device-type rows are deleted one by one AFTER that run (a sequential write ends it), so every O&M cost
 * is detached before its device-type row goes and cannot be taken with it; the type last, as before.
 */
function replaceDetachAndDelete(inputs: ReplaceInputs, typeSet: string, typeId: string, opts?: PlanBulkOptions): PlannedWrite[] {
  // Tiers (plan §9.4, phase 1B): the detach is a group of UPDATES (default limit 8), the unit deletes a leaf group (16)
  // after it (they were one mixed group), the bridge rows a leaf group when there are several. The detach still runs
  // before every bridge-row delete. The type delete is one cascading request.
  // DIVERGENCE (plan §3 phase 5; flag `replace`): the detach is ONE `updateMany` of `{ DeviceTypeInProject: null }` rows
  // (a `null` bind clears the lookup and passes through the backend unchanged). It is still a step of its own BEFORE
  // the unit and bridge-row deletes, so an O&M cost is never taken along with its bridge row.
  const detach = bulkOn(opts, "replace")
    ? (inputs.opexCostIds.length > 0
      ? [updateMany(ES_PLANT.opexProjectCosts, uniqueRows(inputs.opexCostIds.map((id) => ({ id, data: opexLinkData(null) }))),
        "detach the O&M costs from the replaced type")]
      : [])
    : group(inputs.opexCostIds.map((id) => opexLink(id, null, "detach an O&M cost from the replaced type")), opts);
  const unitDeletes = inputs.unitIds.map((id) => del(ES_PLANT.generatorInProjects, id, "a unit of the replaced type", { confirm: true }));
  const bridgeDeletes = inputs.bridgeIds.map((id) => del(ES_PLANT.deviceTypesInProjects, id, "the replaced type's O&M device-type row"));
  if (perfOn(opts, "replaceLanes")) {
    // D144 (`replaceLanes`): the units and the device-type rows are sibling leaves of the type: ONE leaf wave (the leaf tier,
    // 16 in flight) after the detach, then the type delete. The detach still precedes every bridge-row delete, the type goes
    // last, and every delete keeps its own flags (`confirm`, hardened). One lone delete stays a plain step.
    return [...detach, ...leafDeletesIfMany([...unitDeletes, ...bridgeDeletes], opts), del(typeSet, typeId, "the replaced type", { confirm: true })];
  }
  return [
    ...detach,
    ...leafDeletes(unitDeletes, opts),
    ...leafDeletesIfMany(bridgeDeletes, opts),
    del(typeSet, typeId, "the replaced type", { confirm: true }),
  ];
}

/**
 * Replace Generator Type, job 1 (`pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.OnChange`): Detach,
 * Delete, then the WTG type save body (`planCreateGeneratorType`) for the "Replace to" model with the OLD
 * type's number of generators (`txt_…NumberOfGenerator_1` is disabled and copied). The new names continue
 * after the highest index of the OTHER types' turbines (the old ones are gone by then). Out of country the
 * Add skips the roll-up and the screen requests permission for the new type; an old type with an open
 * request has it cancelled first ("RDel001: Cancel pending permission for replaced generator") — both by the
 * screen, around this plan (D97).
 */
function planReplaceGeneratorTypeUnchecked(args: {
  project: PlanProject;
  oldType: GeneratorTypeRow;
  inCountry: boolean;
  model: Pick<CatalogModel, "id" | "specificCapacity" | "hubHeight" | "rotorDiameter">;
  /** `locGeneratorCostsPerWtg` for the old type's count, unrounded. */
  costPerWtg: number;
  selectedHeight: number;
  revisedHubHeight: number | null;
  /** Every type but the old one. */
  otherTypes: GeneratorTypeRow[];
  /** The turbines of every other type. */
  otherTurbines: Pick<TurbineRow, "index">[];
  inputs: ReplaceInputs;
}, opts?: PlanBulkOptions): CreateTypePlan {
  // Flag `turbines` (phase 4) reaches the Add through `opts`: the new type is still created first, single.
  // D144 (`replaceLanes`): the in-country roll-up is handed back for the follow-up's wave (`deferredRollup`), as the Add does.
  const add = planCreateGeneratorType({
    project: args.project, inCountry: args.inCountry, model: args.model,
    numberOfGenerators: Math.max(0, args.oldType.numberOfGenerators ?? 0), costPerWtg: args.costPerWtg,
    selectedHeight: args.selectedHeight, revisedHubHeight: args.revisedHubHeight,
    existingTypes: args.otherTypes, projectTurbines: args.otherTurbines,
    deferRollup: perfOn(opts, "replaceLanes"),
  }, opts);
  if (add.refusedReason) return add;
  return {
    writes: [...replaceDetachAndDelete(args.inputs, ES_PLANT.generatorTypeInProjects, args.oldType.id, opts), ...add.writes],
    log: add.log,
    ...(add.deferredRollup ? { deferredRollup: add.deferredRollup } : {}),
  };
}

/** `planReplaceGeneratorType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplaceGeneratorType = (...a: Parameters<typeof planReplaceGeneratorTypeUnchecked>): ReturnType<typeof planReplaceGeneratorTypeUnchecked> =>
  requireOwningBusinessUnit(planReplaceGeneratorTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

export interface ReplaceFollowUpPlan extends WritePlan {
  /** `locReplaceLandLeaseUnmatchedCount` — for `replaceSuccessText`. */
  unmatchedCount: number;
}

/**
 * Replace Generator Type, job 2: T2e the new type's device-type row (when absent, `deviceTypeShadow`);
 * T2g every AllWTG land-lease cost × every new unit; T2h the old manual allocations moved to the new
 * units BY POSITION (`planReplaceLandLease`), surplus removed; T2i the old units' AllWTG rows removed by
 * id; T2f the detached O&M costs linked to the new device-type row.
 */
function planReplaceGeneratorTypeFollowUpUnchecked(args: {
  project: PlanProject;
  newTypeId: string;
  newTypeName: string;
  /** The new type's device-type row, when one exists already. */
  existingBridgeId: string | null;
  /** The new units, ordered by index. */
  newUnits: { id: string; name: string | null }[];
  inputs: ReplaceInputs;
  /**
   * D144 (`replaceLanes`): the project roll-up `planReplaceGeneratorType` handed back (`deferredRollup`). It is written in this
   * plan's first wave: beside the device-type row when one is created, else beside the allocations. Unset = today's plan.
   */
  rollup?: PlannedWrite;
}, opts?: PlanBulkOptions): ReplaceFollowUpPlan {
  const obu = args.project.owningBusinessUnitId;
  const writes: PlannedWrite[] = [];
  /** The device-type row and the roll-up, as one wave (D144); empty with the switch off. */
  const lead: PlannedWrite[] = [];
  let rollupPending = args.rollup;
  /** Save performance (6 Nov 2026): after the device-type row, every write here is an independent row. */
  const rows: PlannedWrite[] = [];
  /** Plan §9.4 (phase 1B): the old allocations' deletes are their own leaf group, AFTER the new rows were created. */
  const removals: PlannedWrite[] = [];
  /** Flag `allocations`: the new allocations as ONE `createMany` step, before the run of moves and re-links. */
  let bulkCreates: PlannedWrite[] = [];
  let bridge = args.existingBridgeId;
  if (!bridge) {
    const shadow = deviceTypeShadow({ family: "wtg", typeId: args.newTypeId, typeName: args.newTypeName, owningBusinessUnitId: obu });
    if (rollupPending) {
      // Both need only rows that exist now (the new type and its units): one wave. The roll-up lands right after the units it sums,
      // as it did in job 1, so a failure further on never leaves the old type's capacity in the project totals.
      lead.push(shadow, rollupPending);
      rollupPending = undefined;
    } else writes.push(shadow);
    bridge = createdRowRef(0);
  }
  const allocation = { costs: args.inputs.landLeaseCosts, turbines: args.newUnits, owningBusinessUnitId: obu };
  if (bulkOn(opts, "allocations")) bulkCreates = allocationStep(allocation, opts);
  else rows.push(...allocationCreates(allocation));
  // Flag `replace` (plan §3 phase 5): the moves of the manual allocations and the O&M re-links are `updateMany` steps.
  const replaceBulk = bulkOn(opts, "replace");
  const moveRows: BulkRow[] = [];
  const relinkRows: BulkRow[] = [];
  const ll = planReplaceLandLease({ allocations: args.inputs.allocations, newUnitCount: args.newUnits.length });
  for (const r of ll.repoint) {
    const unit = args.newUnits[r.newUnitPosition];
    if (unit) {
      const bind = { [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, unit.id) };
      if (replaceBulk) moveRows.push({ id: r.allocationId, data: bind });
      else rows.push(upd(ES.landLeaseAllocationWtgs, r.allocationId, bind, `move a land-lease allocation to ${unit.name ?? "the new unit"}`));
    }
  }
  const costOf = costByAllocation(args.inputs.allocations);
  for (const id of [...ll.removeSurplus, ...ll.removeAllWtg]) {
    removals.push(allocationDelete(id, "a land-lease allocation of the replaced type", costOf, opts));
  }
  for (const id of args.inputs.opexCostIds) {
    if (replaceBulk) relinkRows.push({ id, data: opexLinkData(bridge) });
    // DEL-7(a): flag `guardedUpdates`: an O&M cost another user deleted since Identify is not re-created by the re-link PATCH.
    else rows.push(guardedIf(opexLink(id, bridge, "re-link an O&M cost to the new type"), opts));
  }
  // One parallel run after the device-type row it may bind to (the moves, creates and re-links are disjoint rows), then
  // the removals as their own leaf group (plan §9.4: deletes and creates never contend; the D51 lesson). With the flag the
  // moves and re-links are bulk steps after the creates (decision 3: delete and recreate, no repointing of old rows to new ones).
  // D144: no device-type row to create, so the handed-over roll-up joins the run of creates, moves and re-links.
  if (rollupPending) rows.push(rollupPending);
  writes.push(
    ...wave(lead, opts),
    ...bulkCreates, ...group(rows, opts),
    ...(moveRows.length > 0 ? [updateMany(ES.landLeaseAllocationWtgs, uniqueRows(moveRows), "move the land-lease allocations to the new units")] : []),
    ...(relinkRows.length > 0 ? [updateMany(ES_PLANT.opexProjectCosts, uniqueRows(relinkRows), "re-link the O&M costs to the new type")] : []),
    ...leafDeletes(removals, opts),
  );
  return { writes, log: [], unmatchedCount: ll.unmatchedCount };
}

/** `planReplaceGeneratorTypeFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplaceGeneratorTypeFollowUp = (...a: Parameters<typeof planReplaceGeneratorTypeFollowUpUnchecked>): ReturnType<typeof planReplaceGeneratorTypeFollowUpUnchecked> =>
  requireOwningBusinessUnit(planReplaceGeneratorTypeFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * Replace PV Module Type, job 1 (`pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2.OnChange`):
 * Detach, Delete, then the PV save body for the "Replace to" form (`planSavePvType`, a new row). An old type
 * with an open request has it cancelled first, by the screen (D97).
 */
function planReplacePvTypeUnchecked(args: {
  project: PlanProject;
  oldPv: SimpleTypeRow;
  form: PvTypeFormState;
  deviceCostModules: number | null | undefined;
  otherSupplierChosen: boolean;
  inputs: ReplaceInputs;
  /** The user's language. Required: the "Replace to" boxes are typed in it. */
  lang: Lang;
}, opts?: PlanBulkOptions): WritePlan {
  const add = planSavePvType({
    project: args.project, pv: null, form: args.form, deviceCostModules: args.deviceCostModules,
    otherSupplierChosen: args.otherSupplierChosen, lang: args.lang,
  });
  // F6: a refused add (no owning business unit) must not be preceded by the detach and delete of the old type.
  if (add.refusedReason) return add;
  return {
    writes: [...replaceDetachAndDelete(args.inputs, ES_PLANT.pvModuleTypeInProjects, args.oldPv.id, opts), ...add.writes],
    log: add.log,
  };
}

/** `planReplacePvType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplacePvType = (...a: Parameters<typeof planReplacePvTypeUnchecked>): ReturnType<typeof planReplacePvTypeUnchecked> =>
  requireOwningBusinessUnit(planReplacePvTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

/** A PV module has ONE unit: every manual allocation of the old unit moves to it; the old AllWTG rows go. */
export function planReplacePvLandLease(allocations: readonly ReplaceAllocation[]): { repoint: string[]; removeAllWtg: string[] } {
  return {
    repoint: allocations.filter((a) => !a.allWtgAllocated).map((a) => a.id),
    removeAllWtg: allocations.filter((a) => a.allWtgAllocated).map((a) => a.id),
  };
}

/**
 * Replace PV Module Type, job 2: the new device-type row (when absent), the new unit, the AllWTG back-fill
 * for it (G7), the old manual allocations moved to it, the old AllWTG rows removed, `'Plant PV Capacity /
 * Cost'`, then the O&M costs re-linked. The 1.21.753 hardening — O&M costs to re-link and no device-type
 * row — raises `PV_BRIDGE_MISSING` (unreachable here: the row is created when absent).
 */
function planReplacePvTypeFollowUpUnchecked(args: {
  project: PlanProject;
  newPvId: string;
  newPvName: string;
  existingBridgeId: string | null;
  inputs: ReplaceInputs;
  /** The PV rows after the replace (old out, new in). */
  pvRows: Pick<SimpleTypeRow, "capacity" | "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: Pick<SimpleTypeRow, "cost">[];
}, opts?: PlanBulkOptions): WritePlan {
  const obu = args.project.owningBusinessUnitId;
  const writes: PlannedWrite[] = [];
  const lanes = perfOn(opts, "replaceLanes");
  let bridge = args.existingBridgeId;
  let creates = 0;
  /** The device-type row and the new unit: sibling creates, ONE wave with `replaceLanes` (D144). */
  const siblings: PlannedWrite[] = [];
  if (!bridge) {
    const shadow = deviceTypeShadow({ family: "pv", typeId: args.newPvId, typeName: args.newPvName, owningBusinessUnitId: obu });
    if (lanes) siblings.push(shadow); else writes.push(shadow);
    bridge = createdRowRef(creates++);
  }
  if (args.inputs.opexCostIds.length > 0 && !bridge) return refusePlan(PV_BRIDGE_MISSING);
  const unitCreate = ins(ES_PLANT.generatorInProjects, {
    [GEN_INSTANCE_COL.name]: args.newPvName,
    [PLANT_BIND.moduleTypePv]: ref(ES_PLANT.pvModuleTypeInProjects, args.newPvId),
    ...owner(obu),
  }, "the new PV type's unit");
  if (lanes) siblings.push(unitCreate); else writes.push(unitCreate);
  const unit = createdRowRef(creates);
  // Save performance (6 Nov 2026): after the new unit, its allocation creates, moves and removals are disjoint
  // rows — one parallel run; the project's PV capacity / cost after them; then the O&M re-links, another run.
  const allocation = { costs: args.inputs.landLeaseCosts, turbines: [{ id: unit, name: args.newPvName }], owningBusinessUnitId: obu };
  // Flag `allocations`: the creates are ONE `createMany` step before the run of moves; off: they join that run (today).
  const bulkCreates: PlannedWrite[] = bulkOn(opts, "allocations") ? allocationStep(allocation, opts) : [];
  const landLease: PlannedWrite[] = bulkOn(opts, "allocations") ? [] : allocationCreates(allocation);
  const ll = planReplacePvLandLease(args.inputs.allocations);
  // Flag `replace` (plan §3 phase 5): the moves and the O&M re-links are `updateMany` steps (each ONE bulk step, never in a group).
  const replaceBulk = bulkOn(opts, "replace");
  const moveBind = { [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, unit) };
  const moveRows: BulkRow[] = [];
  for (const id of ll.repoint) {
    if (replaceBulk) moveRows.push({ id, data: moveBind });
    else landLease.push(upd(ES.landLeaseAllocationWtgs, id, moveBind, "move a land-lease allocation to the new PV unit"));
  }
  // Plan §9.4 (phase 1B): the old AllWTG allocations go as their own leaf group, after the creates and moves.
  const costOf = costByAllocation(args.inputs.allocations);
  const removals = ll.removeAllWtg.map((id) => allocationDelete(id, "a land-lease allocation of the replaced PV type", costOf, opts));
  const rollupWrite = upd(ES.projects, args.project.id, {
    [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.pvRows),
    [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pvRows, inverters: args.inverters, substructures: args.substructures }),
  }, "the project's Plant PV Capacity / Cost");
  // DEL-7(a): flag `guardedUpdates`, as in the generator follow-up.
  const relinks = replaceBulk ? [] : args.inputs.opexCostIds.map((id) => guardedIf(opexLink(id, bridge, "re-link an O&M cost to the new PV type"), opts));
  const relinkBulk = replaceBulk && args.inputs.opexCostIds.length > 0
    ? [updateMany(ES_PLANT.opexProjectCosts,
      uniqueRows(args.inputs.opexCostIds.map((id) => ({ id, data: opexLinkData(bridge) }))), "re-link the O&M costs to the new PV type")]
    : [];
  const moveBulk = moveRows.length > 0
    ? [updateMany(ES.landLeaseAllocationWtgs, uniqueRows(moveRows), "move the land-lease allocations to the new PV unit")]
    : [];
  if (lanes) {
    // D144 (`replaceLanes`): the device-type row and the unit are ONE wave (each needs only the new PV type's id and name);
    // then ONE wave of the allocation creates, the moves, the project's PV capacity / cost (it sums the type and the unit, both
    // written by now) and the O&M re-links (they need the device-type row, written by now); the old allocations are removed
    // LAST, after every create and move, so the delete lane never overlaps the create lane (D115 decision 5).
    writes.push(
      ...wave(siblings, opts),
      ...bulkCreates, ...wave([...landLease, rollupWrite, ...relinks], opts),
      ...moveBulk, ...relinkBulk,
      ...leafDeletes(removals, opts),
    );
    return { writes, log: [] };
  }
  writes.push(
    ...bulkCreates, ...group(landLease, opts),
    ...moveBulk,
    ...leafDeletes(removals, opts),
  );
  writes.push(rollupWrite);
  writes.push(...relinkBulk, ...group(relinks, opts));
  return { writes, log: [] };
}

/** `planReplacePvTypeFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplacePvTypeFollowUp = (...a: Parameters<typeof planReplacePvTypeFollowUpUnchecked>): ReturnType<typeof planReplacePvTypeFollowUpUnchecked> =>
  requireOwningBusinessUnit(planReplacePvTypeFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);
