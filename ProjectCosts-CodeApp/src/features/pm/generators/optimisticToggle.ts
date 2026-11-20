/**
 * Generators screen — the optimistic Activate / Deactivate toggle (D143, `GENERATORS_PERF.optimisticToggle`, default OFF).
 *
 * DIVERGENCE: the canvas (and this app until now) shows the new status only once the save has landed and the screen has
 * reloaded: the type's chip, the command bar's Activate / Deactivate caption and the enabled state of its turbines' Edit and Delete
 * buttons all change after the writes. With the switch ON the screen shows the new status at once and puts the cache back to the
 * EXACT previous rows if the save fails. Proposed, not approved (`02-OPEN-DECISIONS.md`, D143).
 *
 *  - What is shown early: the type's status, its turbines' statuses. Nothing else: the plant totals are rolled up by the save and
 *    arrive with the reload.
 *  - The writes are never built from these rows. The plan is made from the real rows BEFORE anything is shown (`Screen.tsx`),
 *    and while the optimistic rows are in the cache the screen holds every write and every command back (`dataSettling`),
 *    until the targeted reload (`reload.ts`, kind `toggleStatus`) has brought the real rows. That reload runs after a success
 *    AND after a failure, so the server's rows are always the last word.
 *  - Failure, partial failure ("2 of 5 changes had already been saved") and a "rows gone" refusal all roll back through the same
 *    path (`usePlanWrite`: the job's rollback runs when the writes end without success), and the error text is the existing one.
 *
 * Switch OFF = `…CanvasParity`: no job hook is attached, so today's behaviour is unchanged.
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { logAction } from "@/platform/requestLog";
import { planStatusToggle, type GeneratorTypeRow, type TurbineRow } from "./rules";

/** The type with the new status. Every other row is the same object. */
export function optimisticTypes(types: readonly GeneratorTypeRow[], typeId: string, nextStatus: number): GeneratorTypeRow[] {
  return types.map((t) => (t.id === typeId ? { ...t, status: nextStatus } : t));
}

/** The type's turbines with the new status. Every other row is the same object. */
export function optimisticTurbines(turbines: readonly TurbineRow[], typeId: string, nextStatus: number): TurbineRow[] {
  return turbines.map((t) => (t.typeId === typeId ? { ...t, status: nextStatus } : t));
}

/** CANVAS PARITY twin of `optimisticTypes`: the canvas shows nothing before the save has landed. */
export const optimisticTypesCanvasParity = (types: readonly GeneratorTypeRow[]): GeneratorTypeRow[] => [...types];

/** CANVAS PARITY twin of `optimisticTurbines`. */
export const optimisticTurbinesCanvasParity = (turbines: readonly TurbineRow[]): TurbineRow[] => [...turbines];

/** The status the toggle will write: the same decision the plan makes (`planStatusToggle`), so the two never disagree. */
export const nextToggleStatus = (type: Pick<GeneratorTypeRow, "id" | "status">): number =>
  planStatusToggle({ type, turbines: [] }).nextStatus;

export interface OptimisticToggleInput {
  projectId: string;
  typeId: string;
  nextStatus: number;
}

/**
 * Shows the new status in the screen's cached rows and returns the rollback that puts the exact previous rows back.
 * In-flight reads of the two query groups are cancelled first, so an older answer cannot land over the optimistic rows.
 * Counts only in the console (CONVENTIONS rule 23).
 */
export async function applyOptimisticToggle(qc: QueryClient, input: OptimisticToggleInput): Promise<() => void> {
  const typesKey = qk.generators(input.projectId, "types");
  // A prefix: it reaches both turbine keys (the type-id key and the by-project key of D142).
  const turbinesKey = qk.generators(input.projectId, "turbines");
  await Promise.all([qc.cancelQueries({ queryKey: typesKey }), qc.cancelQueries({ queryKey: turbinesKey })]);
  const typeSnapshots = qc.getQueriesData<GeneratorTypeRow[]>({ queryKey: typesKey });
  const turbineSnapshots = qc.getQueriesData<TurbineRow[]>({ queryKey: turbinesKey });
  let shown = 0;
  for (const [key, data] of typeSnapshots) {
    if (!data) continue;
    qc.setQueryData(key, optimisticTypes(data, input.typeId, input.nextStatus));
    shown += 1;
  }
  for (const [key, data] of turbineSnapshots) {
    if (!data) continue;
    qc.setQueryData(key, optimisticTurbines(data, input.typeId, input.nextStatus));
    shown += 1;
  }
  logAction(`Generators optimistic status toggle: shown in ${shown} cached queries`);
  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    let restored = 0;
    for (const [key, data] of [...typeSnapshots, ...turbineSnapshots]) {
      if (!data) continue;
      qc.setQueryData(key, data);
      restored += 1;
    }
    logAction(`Generators optimistic status toggle: rolled back in ${restored} cached queries`);
  };
}
