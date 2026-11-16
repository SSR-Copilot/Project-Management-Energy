/**
 * Shared fixtures and plan-shape helpers of the Generators bulk plan tests (work package R2): `bulkPlans.test.ts` (1B),
 * `bulkAllocations.test.ts` (2), `bulkUpdates.test.ts` (3), `bulkTurbines.test.ts` (4), `bulkReplace.test.ts` (5).
 * Test support only: nothing in the app imports it.
 */
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { GENERATORS_BULK } from "@/data/generatorsBulkFlags";
import type { PlannedWrite } from "@/data/writePlan";
import type * as RulesModule from "./rules";

type Rules = typeof RulesModule;
export type PlanProject = RulesModule.PlanProject;
export type GeneratorTypeRow = RulesModule.GeneratorTypeRow;
export type TurbineRow = RulesModule.TurbineRow;
export type SimpleTypeRow = RulesModule.SimpleTypeRow;
export type CatalogModel = RulesModule.CatalogModel;
export type LandLeaseCostRow = RulesModule.LandLeaseCostRow;
export type PlanBulkOptions = RulesModule.PlanBulkOptions;
export type { Rules };

export const ALLOC = "vsb_landleaseallocationwtgs";
export const COST = "vsb_landleaseprojectcosts";
export const OPEX = "vsb_opexprojectcosts";
export const BRIDGE = "vsb_devicetypesinprojects";
export const TURBINE = "vsb_generatorinprojects";
export const TYPE = "vsb_generatortypeinprojects";
export const PVTYPE = "vsb_pvmoduletypeinprojects";
export const PROJECTS = "vsb_projects";
export const OBU = "owningbusinessunit@odata.bind";

export const P: PlanProject = { id: "p1", shortName: "WPN", owningBusinessUnitId: "bu-1" };

export const genType = (over: Partial<GeneratorTypeRow> = {}): GeneratorTypeRow => ({
  id: "t1", name: "WTG type", generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 4,
  costPerWtg: 900_000, generatorsCost: 3_600_000, generatorsCapacity: 22.4, requestPermissionState: null,
  flowRunId: null, flowApprovalId: null, status: CHOICE_PLANT.status.active, specificCapacity: 5.6, ...over,
});

export const turbine = (index: number, over: Partial<TurbineRow> = {}): TurbineRow => ({
  id: `w${index}`, name: `WTG WPN_${index}`, typeId: "t1", index, effectiveCapacity: 5.6, effectiveHubHeight: null,
  effectiveHubHeightChanged: false, foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223,
  status: CHOICE_PLANT.status.active, ...over,
});

export const simple = (over: Partial<SimpleTypeRow> = {}): SimpleTypeRow => ({
  id: "s1", name: "Row", supplier: "Acme", otherSupplier: null, capacity: null, cost: null, moduleLabel: null,
  degradation1stYear: null, degradationRemainingYears: null, requestPermissionState: null, flowRunId: null,
  flowApprovalId: null, status: CHOICE_PLANT.status.active, ...over,
});

export const model = (over: Partial<CatalogModel> = {}): CatalogModel => ({
  id: "g1", name: "V150", displayName: "Vestas V150-5.6", supplier: "Vestas", turbineType: "V150", hubHeight: 148,
  rotorDiameter: 150, specificCapacity: 5.6, earliestPhaseout: "2035-01-01", countryAvailability: [1, 2],
  foundationCostIncluded: true, additionalFoundationCost: 0, prices: [1_000_000, 950_000, 900_000, 850_000, 800_000],
  totalHeight: 223, ...over,
});

export const n = <T,>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i + 1));
export const wtgUnits = (count: number): TurbineRow[] => n(count, (i) => turbine(i));
export const costs = (count: number): LandLeaseCostRow[] =>
  n(count, (i) => ({ id: `c${i}`, landOwner: "M", description: `D${i}`, allWtgAllocated: true }));

/** A counter id source: `id-1`, `id-2`, ... Tests inject it; production uses `newRowId`. */
export const counter = (prefix = "id") => {
  let k = 0;
  return () => `${prefix}-${++k}`;
};

/** One step of a plan: a plain write, one `together()` group, or a bulk step. */
export interface Step {
  kind: "single" | "group" | "bulk";
  /** `op:entitySet` of the members (a bulk step: its op and entity set once). */
  ops: string[];
  /** A group's `concurrencyLimit` (undefined = the default, 8). */
  limit?: number | undefined;
  /** A bulk step's rows. */
  rows?: readonly { id: string; data: Readonly<Record<string, unknown>> }[];
  writes: PlannedWrite[];
}

export const opOf = (w: PlannedWrite): string => `${w.op}:${w.entitySet}`;

/** Splits a plan into steps the way `executePlan` runs them: groups by `concurrencyGroup`, bulk steps alone. */
export function steps(writes: readonly PlannedWrite[]): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < writes.length;) {
    const w = writes[i]!;
    if (w.op === "createMany" || w.op === "updateMany") {
      out.push({ kind: "bulk", ops: [opOf(w)], rows: w.rows ?? [], writes: [w] });
      i += 1;
    } else if (w.concurrent) {
      let end = i;
      while (end < writes.length && writes[end]!.concurrent && writes[end]!.concurrencyGroup === w.concurrencyGroup) end += 1;
      const run = writes.slice(i, end);
      out.push({ kind: "group", ops: run.map(opOf), limit: w.concurrencyLimit, writes: run });
      i = end;
    } else {
      out.push({ kind: "single", ops: [opOf(w)], writes: [w] });
      i += 1;
    }
  }
  return out;
}

export const idsOf = (s: Step): (string | undefined)[] => s.writes.map((w) => w.id);
export const reps = (op: string, count: number): string[] => Array.from({ length: count }, () => op);

/** True when no `createMany` / `updateMany` step is inside a `together()` group (the engine would throw). */
export const noBulkInGroup = (writes: readonly PlannedWrite[]): boolean =>
  writes.every((w) => !(w.op === "createMany" || w.op === "updateMany") || (!w.concurrent && w.concurrencyGroup === undefined));

/** Total changes the plan makes: one per single write, one per ROW of a bulk step (the engine's `total`). */
export const changes = (writes: readonly PlannedWrite[]): number =>
  writes.reduce((sum, w) => sum + (w.op === "createMany" || w.op === "updateMany" ? (w.rows?.length ?? 0) : 1), 0);

/** Plan steps the engine awaits one after another (each single, group or bulk step is one wave). */
export const waves = (writes: readonly PlannedWrite[]): number => steps(writes).length;

/** Flag halves: `only("allocations")` turns just that flag on; `OFF` is today's behaviour (every flag false). */
export const only = (...on: (keyof typeof GENERATORS_BULK)[]): Required<PlanBulkOptions>["bulk"] =>
  Object.fromEntries(Object.keys(GENERATORS_BULK).map((k) => [k, on.includes(k as keyof typeof GENERATORS_BULK)]));
export const OFF = only();

/** The writes with the per-call `concurrencyGroup` counter removed, so two builds of the same plan compare equal. */
export const withoutGroupIds = (writes: readonly PlannedWrite[]): Omit<PlannedWrite, "concurrencyGroup">[] =>
  writes.map(({ concurrencyGroup: _group, ...rest }) => rest);
