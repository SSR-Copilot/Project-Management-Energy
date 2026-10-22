/**
 * A thin way for a screen that keeps its own busy / toast / panel feedback to run a `WritePlan`.
 *
 * `usePlanWrite` swallows errors into its own WriteFeedback state; the Application Settings screens
 * instead report failures on a toast or in the editor panel and branch on typed errors
 * (`RecordGoneError`, ...). `runPlan` therefore calls `executePlan` and, when it fails part-way,
 * rethrows the failed write's own error (`PlanError.cause`) — or whatever `mapError` makes of the
 * `PlanError` — so `instanceof` checks and `userErrorText` behave exactly as for a data-layer write.
 * A refused plan (`PlanRefusedError`) and anything else pass through untouched.
 *
 * Screens that use this keep their own `useMutation`: only its `mutationFn` calls `runPlan`.
 */
import { executePlan, PlanError, type PlanClient, type PlanResult } from "./executePlan";
import type { WritePlan } from "./writePlan";

export interface RunPlanOptions {
  /** Defaults to the real SDK client. */
  client?: PlanClient;
  /** Return what to throw for a part-way failure; return `undefined` to throw `error.cause`. */
  mapError?: (error: PlanError) => unknown;
}

export async function runPlan(
  plan: WritePlan,
  operation: string,
  options: RunPlanOptions = {},
): Promise<PlanResult> {
  try {
    return await executePlan(plan, operation, options.client);
  } catch (error) {
    if (error instanceof PlanError) throw options.mapError?.(error) ?? error.cause;
    throw error;
  }
}
