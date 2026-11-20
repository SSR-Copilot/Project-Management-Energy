/**
 * Generators screen — what a save reloads afterwards (D141, `GENERATORS_PERF.targetedReload`).
 *
 * Before: every save refreshed `qk.generatorsAll(projectId)` — every Generators query of the project (the project row, the
 * planning row, the types, ALL the turbines, the six other families, the AllWTG costs and the O&M dependency reads), plus
 * the three copies of the project row. A BESS rename reloaded the turbines, whose read is one request per 40 types.
 *
 * Now: each kind of save declares the tables its plans (and the server) can change, and a table maps to the queries that
 * read it. The query list of a save is the union of those, so "a table a plan writes is reloaded" holds by construction:
 * `KIND_TABLES` is the only place a kind's tables are listed, and `reload.test.ts` (UT-GENPERF-*) proves it three ways:
 *  1. every table a real plan builder writes for a kind is in that kind's `KIND_TABLES` (the builders are run);
 *  2. every entity set `rules.ts` writes anywhere has a `TABLE_QUERIES` entry (the source is scanned), so a table added to
 *     a plan builder later fails the suite until it is mapped here;
 *  3. every table's queries are in the kind's key list.
 *
 * What is NOT reloaded after a save, and why: the project's planning row (no plan writes it), the orderable catalogue, the
 * model rows, the device costs and the price index (reference data nobody here writes), and the PV module catalogue.
 *
 * A kind that is not mapped clearly keeps the full reload (`"full"`, and the rollback / Retry cleanup jobs, whose landed
 * rows can be any table): never under-refresh. With the switch off every save is "full", today's behaviour.
 */
import type { QueryKey } from "@tanstack/react-query";
import { ES, ES_PLANT } from "@/data/dataverseNames";
import { generatorsPerf, type GeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { qk } from "@/data/keys";
import { logAction } from "@/platform/requestLog";
import type { PlanJob } from "@/data/usePlanWrite";

/** The query families the screen reads that a write can change. */
export type QueryFamily =
  | "project" | "types" | "turbines" | "pv" | "inverter" | "substructure" | "storage" | "hydrogen" | "substation"
  | "allWtgCosts" | "opexDependency";

/** The fixed order the keys are listed in (stable output, and the order the reloads start). */
export const FAMILY_ORDER: readonly QueryFamily[] = [
  "project", "types", "turbines", "pv", "inverter", "substructure", "storage", "hydrogen", "substation",
  "allWtgCosts", "opexDependency",
];

/**
 * The cache keys of one family. `turbines` and `opexDependency` are PREFIXES (the keys embed the type ids), so one
 * invalidation reaches every key of the family. `project` is the screen's own row plus the session header's copy and the
 * Milestones / General Data copies, as the full reload refreshed them.
 */
export function familyKeys(projectId: string, family: QueryFamily): readonly QueryKey[] {
  switch (family) {
    case "project":
      return [qk.generators(projectId, "project"), qk.project(projectId), qk.milestoneProject(projectId), qk.generalDataProject(projectId)];
    case "allWtgCosts": return [qk.generators(projectId, "allWtgCosts")];
    default: return [qk.generators(projectId, family)];
  }
}

/** PV units are `GeneratorInProjects` rows too, but no Generators query reads them (see `PV_UNITS`). */
export const PV_UNITS = `${ES_PLANT.generatorInProjects}#pv`;
/** The turbines (WTG units) `useProjectTurbines` reads. */
const TURBINES = ES_PLANT.generatorInProjects;

/**
 * The queries that read each table. An empty list is a table no screen query reads:
 *  - `vsb_landleaseallocationwtgs`: the allocations are read at write time (`loadTurbineAllocations`), never cached;
 *  - the PV units (`#pv`): `listProjectTurbines` filters on the WTG type lookup, and the PV save binds `moduleTypePv`.
 */
export const TABLE_QUERIES: Readonly<Record<string, readonly QueryFamily[]>> = {
  [ES.projects]: ["project"],
  [ES_PLANT.generatorTypeInProjects]: ["types"],
  [TURBINES]: ["turbines"],
  [PV_UNITS]: [],
  [ES_PLANT.pvModuleTypeInProjects]: ["pv"],
  [ES_PLANT.inverterTypeInProjects]: ["inverter"],
  [ES_PLANT.substructureTypeInProjects]: ["substructure"],
  [ES_PLANT.storageTypeInProjects]: ["storage"],
  [ES_PLANT.hydrogenTypeInProjects]: ["hydrogen"],
  [ES_PLANT.substationTypeInProjects]: ["substation"],
  [ES_PLANT.deviceTypesInProjects]: ["opexDependency"],
  [ES_PLANT.opexProjectCosts]: ["opexDependency"],
  [ES_PLANT.landLeaseProjectCosts]: ["allWtgCosts"],
  [ES.landLeaseAllocationWtgs]: [],
};

export type SimpleFamily = "storage" | "hydrogen" | "substation";
export type PermissionRequestFamily = "wtg" | "pv" | "inverter" | "substructure";

/** One kind per save the screen runs. `"full"` is the full reload. */
export type ReloadKind =
  | "addWtgType" | "saveTurbine" | "deleteTurbine" | "deleteWtgType" | "toggleStatus"
  | "savePv" | "deletePv" | "saveInverter" | "deleteInverter" | "saveSubstructure" | "deleteSubstructure"
  | "replaceWtg" | "replacePv"
  | `saveSimple:${SimpleFamily}` | `deleteSimple:${SimpleFamily}`
  | `cancelRequest:${PermissionRequestFamily}`
  | "full";

const PROJECT = ES.projects;
const TYPE = ES_PLANT.generatorTypeInProjects;
const ALLOC = ES.landLeaseAllocationWtgs;
const COST = ES_PLANT.landLeaseProjectCosts;
const BRIDGE = ES_PLANT.deviceTypesInProjects;
const OPEX = ES_PLANT.opexProjectCosts;
const PV = ES_PLANT.pvModuleTypeInProjects;
const INVERTER = ES_PLANT.inverterTypeInProjects;
const SUBSTRUCTURE = ES_PLANT.substructureTypeInProjects;
const SIMPLE: Record<SimpleFamily, string> = {
  storage: ES_PLANT.storageTypeInProjects, hydrogen: ES_PLANT.hydrogenTypeInProjects, substation: ES_PLANT.substationTypeInProjects,
};
const REQUEST_TABLE: Record<PermissionRequestFamily, string> = { wtg: TYPE, pv: PV, inverter: INVERTER, substructure: SUBSTRUCTURE };

/**
 * The tables each kind of save can change: every table its plan builders write (both jobs of a two-step save), plus what
 * the server does on its own. Comments say which plan builder, and what is only server-side.
 */
export const KIND_TABLES: Readonly<Record<Exclude<ReloadKind, "full">, readonly string[]>> = {
  // planCreateGeneratorType + planGeneratorTypeFollowUp. The permission flow (out of country) writes the type row.
  addWtgType: [TYPE, TURBINES, PROJECT, BRIDGE, ALLOC],
  // planSaveTurbine: the turbine, the apply-to-all siblings, the type totals, the roll-up, the new turbine's allocations.
  saveTurbine: [TURBINES, TYPE, PROJECT, ALLOC],
  // planDeleteTurbine: allocations, orphaned land-lease costs, the turbine, the type totals, the roll-up.
  deleteTurbine: [ALLOC, COST, TURBINES, TYPE, PROJECT],
  // planDeleteGeneratorType. The turbines and the device-type rows go by the Dataverse cascade (and the O&M costs by
  // the plan), so they are listed although the plan does not name the turbines.
  deleteWtgType: [ALLOC, COST, OPEX, BRIDGE, TURBINES, TYPE, PROJECT],
  // planToggleStatus: the type, its turbines, the roll-up.
  toggleStatus: [TYPE, TURBINES, PROJECT],
  // planSavePvType + planPvFollowUp: the type, its unit, the roll-up, the device-type row, the G7 AllWTG allocations.
  savePv: [PV, PV_UNITS, PROJECT, BRIDGE, ALLOC],
  // planDeletePvType: allocations, land-lease costs, O&M costs, the units, the type, the roll-up, the substructure costs.
  deletePv: [ALLOC, COST, OPEX, BRIDGE, PV_UNITS, PV, PROJECT, SUBSTRUCTURE],
  // planSaveInverter / planSaveSubstructure: the row and the Plant PV Cost roll-up. The permission flow writes the row.
  saveInverter: [INVERTER, PROJECT],
  saveSubstructure: [SUBSTRUCTURE, PROJECT],
  // planDeleteInverterOrSubstructure: the row and the Plant PV Cost roll-up.
  deleteInverter: [INVERTER, PROJECT],
  deleteSubstructure: [SUBSTRUCTURE, PROJECT],
  // planReplaceGeneratorType + planReplaceGeneratorTypeFollowUp: O&M links, the old units / bridge rows / type, the new
  // ones, the allocations (moved, created, deleted), the roll-up.
  replaceWtg: [OPEX, TURBINES, BRIDGE, TYPE, ALLOC, PROJECT],
  // planReplacePvType + planReplacePvTypeFollowUp: the same for a PV type and its unit; the PV capacity / cost roll-up.
  replacePv: [OPEX, PV_UNITS, BRIDGE, PV, ALLOC, PROJECT],
  // planSaveSimple / planDeleteSimple: the row and the plant capacity roll-up.
  "saveSimple:storage": [SIMPLE.storage, PROJECT],
  "saveSimple:hydrogen": [SIMPLE.hydrogen, PROJECT],
  "saveSimple:substation": [SIMPLE.substation, PROJECT],
  "deleteSimple:storage": [SIMPLE.storage, PROJECT],
  "deleteSimple:hydrogen": [SIMPLE.hydrogen, PROJECT],
  "deleteSimple:substation": [SIMPLE.substation, PROJECT],
  // A card's Cancel: no plan writes (`emptyPlan`); the flow rewrites the row's request fields. The project is refreshed
  // as well, because the flow's other effects on it are not documented.
  "cancelRequest:wtg": [REQUEST_TABLE.wtg, PROJECT],
  "cancelRequest:pv": [REQUEST_TABLE.pv, PROJECT],
  "cancelRequest:inverter": [REQUEST_TABLE.inverter, PROJECT],
  "cancelRequest:substructure": [REQUEST_TABLE.substructure, PROJECT],
};

/** The query families a kind refreshes, in `FAMILY_ORDER`; `undefined` for `"full"` (everything). */
export function familiesFor(kind: ReloadKind): readonly QueryFamily[] | undefined {
  if (kind === "full") return undefined;
  const wanted = new Set<QueryFamily>();
  for (const table of KIND_TABLES[kind]) for (const family of TABLE_QUERIES[table] ?? []) wanted.add(family);
  return FAMILY_ORDER.filter((f) => wanted.has(f));
}

/**
 * The cache keys a kind of save refreshes, or `undefined` for "the hook's full list" (`targetedReload` off, no project,
 * or the `"full"` kind).
 */
export function reloadKeys(
  projectId: string | undefined, kind: ReloadKind, flags: Readonly<GeneratorsPerfFlags> = generatorsPerf(),
): readonly QueryKey[] | undefined {
  if (!flags.targetedReload || !projectId) return undefined;
  const families = familiesFor(kind);
  if (!families) return undefined;
  return families.flatMap((f) => familyKeys(projectId, f));
}

/**
 * `job` with the reload of `kind` (a no-op while `targetedReload` is off or the kind is `"full"`). The reload is traced
 * (CONVENTIONS rule 23): one `[VSB] ACTION` line when the writes are over, naming the families, before the reload's own
 * `Load` lines.
 */
export function withReload(
  job: PlanJob, projectId: string | undefined, kind: ReloadKind, flags: Readonly<GeneratorsPerfFlags> = generatorsPerf(),
): PlanJob {
  const keys = reloadKeys(projectId, kind, flags);
  if (!keys) return job;
  const families = familiesFor(kind) ?? [];
  const previous = job.onWritten;
  return {
    ...job,
    invalidate: keys,
    onWritten: (ok) => {
      previous?.(ok);
      logAction(`Generators reload after ${kind}${ok ? "" : " (failed)"}: ${families.length} of ${FAMILY_ORDER.length} query groups (${families.join(", ")})`);
    },
  };
}
