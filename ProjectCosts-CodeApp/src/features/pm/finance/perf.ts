/**
 * Finance screen â€” the performance layer (D137).
 *
 * Pure functions that take the plans and jobs `rules.ts` already builds and change HOW they are sent, never WHAT is
 * written: the same rows, the same columns, the same binds (Owning Business Unit included), the same order wherever
 * one write depends on another. The business rules stay in `rules.ts`; this file only re-shapes the write list.
 * With every switch off (`FINANCE_PERF_ALL_OFF`) each function returns its input unchanged.
 *
 * The canvas itself runs these writes concurrently (`Project Finance Screen.pa.yaml`):
 *  - the tranche Delete: `Concurrent(RemoveIf(step-ups), RemoveIf(repayments))`, then the tranche (Y:8981-9000);
 *  - the tranche Save: after the tranche `Patch`, `Concurrent(repayments, step-ups)` (Y:13850);
 *  - the visit reads: one `Concurrent` (Y:100).
 *
 * WHAT IS CONCURRENT AND WHY IT IS SAFE (no flow and no plugin step is registered on the four Finance tables,
 * `hooks.ts` header, verified 19 Oct 2026): the rows of one group are different rows, never the one write order
 * depends on. A repayment delete targets a year that left the schedule and an upsert a year that stayed; a step-up
 * upsert targets an `Order` that stayed and a delete one that did not. The tranche itself is always written FIRST
 * and alone, because its children bind to it (`createdRowRef(0)` for a new tranche).
 *
 * `stopOnFailure` mirrors the sequential stop of today: after the first failure no NEW write of the group starts
 * (the ones in flight finish), and the plan stops there, so the tranche delete never deletes the tranche after a
 * failed child delete.
 */
import type { QueryKey } from "@tanstack/react-query";
import { ES, ES_FINANCE } from "@/data/dataverseNames";
import { BULK_MIN_ROWS, financePerf, type FinancePerfFlags } from "@/data/financeFlags";
import { PlanError } from "@/data/executePlan";
import { qk } from "@/data/keys";
import { OWNING_BU_BIND } from "@/data/odata";
import { writeErrorMessage, type PlanJob } from "@/data/usePlanWrite";
import {
  createMany, together, updateMany, type PlannedWrite, type WritePlan,
} from "@/data/writePlan";
import { LEAF_DELETE_CONCURRENCY, WIDE_GROUP_CONCURRENCY } from "@/data/concurrency";
import {
  FIN_LABEL, NOTIFY, SPINNER, seedWrite,
  type FinanceProject, type SeedRow,
} from "./rules";

/** The permission text's action (`useFinanceWrites`) and the seed failure texts use the same words. */
export const FINANCE_WRITE_ACTION = "change this project's financing inputs";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• reload targets â•â• */

/** What a write can change, so a write reloads only that. */
export type ReloadKind =
  /** The Financing Options switch: the project row (its option) and the inputs. */
  | "option"
  /** A status toggle or a panel save: the inputs. */
  | "inputs"
  /** A tranche Save or Delete: the inputs and the two schedules of the project. */
  | "schedules";

/**
 * The query keys one kind of write reloads, or `undefined` for "everything" (`targetedReload` off). The CAPEX total and
 * the turbine count are never in the list: no Finance write changes them, and they were the dearest part of the
 * reload (a contracts read, then one costs read per chunk, then two generator reads).
 */
export function reloadKeys(
  projectId: string | undefined, kind: ReloadKind, flags: Readonly<FinancePerfFlags> = financePerf(),
): readonly QueryKey[] | undefined {
  if (!flags.targetedReload || !projectId) return undefined;
  const project = qk.finance(projectId, "project");
  const inputs = qk.finance(projectId, "inputs");
  const repayments = qk.finance(projectId, "repayments");
  const stepUps = qk.finance(projectId, "stepUps");
  if (kind === "option") return [project, inputs];
  if (kind === "inputs") return [inputs];
  return [inputs, repayments, stepUps];
}

/** `job` with the reload of `kind` (a no-op while `targetedReload` is off). */
export function withReload(
  job: PlanJob, projectId: string | undefined, kind: ReloadKind, flags: Readonly<FinancePerfFlags> = financePerf(),
): PlanJob {
  const keys = reloadKeys(projectId, kind, flags);
  return keys ? { ...job, invalidate: keys } : job;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• plan transforms â•â• */

const isDelete = (w: PlannedWrite): boolean => w.op === "delete";
const unchanged = (plan: WritePlan): boolean => Boolean(plan.refusedReason) || plan.writes.length === 0;

/**
 * The tranche Delete: its step-ups and repayments in one concurrent group (16 at a time, the leaf-delete tier), then
 * the tranche. `rules.ts` `planTrancheDelete` still lists them in the canvas order (UT-FIN-222); only the sending changes.
 */
export function optimizeTrancheDeletePlan(plan: WritePlan, flags: Readonly<FinancePerfFlags> = financePerf()): WritePlan {
  if (!flags.concurrentWrites || unchanged(plan) || plan.writes.length < 3) return plan;
  const children = plan.writes.slice(0, -1);
  const parent = plan.writes[plan.writes.length - 1]!;
  const shaped = isDelete(parent) && parent.entitySet === ES_FINANCE.financingInputs
    && children.every((w) => isDelete(w) && (
      w.entitySet === ES_FINANCE.financingInputStepUpMargins || w.entitySet === ES_FINANCE.financingInputsRepaymentAmounts));
  if (!shaped) return plan;
  return {
    ...plan,
    writes: [...together(children, { limit: LEAF_DELETE_CONCURRENCY, stopOnFailure: true }), parent],
  };
}

/**
 * The Financing Options switch: the project write first (alone, as the canvas `Patch` before the cascade), then every
 * status update of the cascade together (VAT, tranches, DSRA/DSRF are different rows).
 */
export function optimizeFinancingOptionPlan(plan: WritePlan, flags: Readonly<FinancePerfFlags> = financePerf()): WritePlan {
  if (!flags.concurrentWrites || unchanged(plan) || plan.writes.length < 3) return plan;
  const [first, ...rest] = plan.writes as [PlannedWrite, ...PlannedWrite[]];
  const shaped = first.op === "update" && first.entitySet === ES.projects
    && rest.every((w) => w.op === "update" && w.entitySet === ES_FINANCE.financingInputs);
  if (!shaped) return plan;
  return { ...plan, writes: [first, ...together(rest, { stopOnFailure: true })] };
}

export interface SaveOptions {
  /** A fresh client-side id for a bulk create row (default: `crypto.randomUUID()`). Injected by tests. */
  newId?: () => string;
  /** Overrides `BULK_MIN_ROWS`. */
  minBulkRows?: number;
}

const randomId = (): string => {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("This browser cannot make an id for a bulk create (crypto.randomUUID is missing).");
  return id;
};

/** A bulk create needs the Owning Business Unit on every row (CONVENTIONS rule 4); a row without it stays a single create. */
const hasOwner = (w: PlannedWrite): boolean => {
  const bind = w.data?.[OWNING_BU_BIND];
  return typeof bind === "string" && bind.trim() !== "";
};

/**
 * The tranche Save. The tranche write stays first and alone. Everything after it (the repayment and step-up
 * creates, updates and deletes) is independent of each other, so it goes out as ONE concurrent group, the canvas
 * `Concurrent`. With `bulkSchedules` on, a table with at least `BULK_MIN_ROWS` creates (or updates) sends them as one
 * `createMany` (`updateMany`) step instead; the deletes and the smaller sets stay in the concurrent group.
 * `updateMany` is guarded by the backend: a row another user deleted fails the save instead of being re-created.
 */
export function optimizeTrancheSavePlan(
  plan: WritePlan, flags: Readonly<FinancePerfFlags> = financePerf(), options: SaveOptions = {},
): WritePlan {
  if (!flags.concurrentWrites || unchanged(plan) || plan.writes.length < 2) return plan;
  const [tranche, ...children] = plan.writes as [PlannedWrite, ...PlannedWrite[]];
  const kidSets = new Set<string>([ES_FINANCE.financingInputsRepaymentAmounts, ES_FINANCE.financingInputStepUpMargins]);
  const shaped = tranche.entitySet === ES_FINANCE.financingInputs && (tranche.op === "create" || tranche.op === "update")
    && children.every((w) => kidSets.has(w.entitySet) && !w.concurrent && w.op !== "createMany" && w.op !== "updateMany");
  if (!shaped) return plan;

  const min = options.minBulkRows ?? BULK_MIN_ROWS;
  const newId = options.newId ?? randomId;
  const bulkSteps: PlannedWrite[] = [];
  const grouped: PlannedWrite[] = [];

  for (const entitySet of [ES_FINANCE.financingInputsRepaymentAmounts, ES_FINANCE.financingInputStepUpMargins]) {
    const mine = children.filter((w) => w.entitySet === entitySet);
    const creates = mine.filter((w) => w.op === "create");
    const updates = mine.filter((w) => w.op === "update" && w.id !== undefined);
    const bulkCreates = flags.bulkSchedules && creates.length >= min && creates.every(hasOwner);
    const bulkUpdates = flags.bulkSchedules && updates.length >= min;
    // The group keeps the plan's own order for what is not bulk.
    for (const w of mine) {
      if (bulkCreates && w.op === "create") continue;
      if (bulkUpdates && w.op === "update") continue;
      grouped.push(w);
    }
    if (bulkCreates) {
      bulkSteps.push(createMany(
        entitySet, creates.map((w) => ({ id: newId(), data: w.data ?? {} })),
        creates[0]!.reason, `${creates[0]!.reason} (bulk)`,
      ));
    }
    if (bulkUpdates) {
      bulkSteps.push(updateMany(
        entitySet, updates.map((w) => ({ id: w.id!, data: w.data ?? {} })),
        updates[0]!.reason, `${updates[0]!.reason} (bulk)`,
      ));
    }
  }
  return {
    ...plan,
    // D149: `wideGroups` sends the group 16 at a time (a 25 + 4 row schedule is 2 awaited rounds, not 4); off = the 8-wide group.
    writes: [
      tranche,
      ...(grouped.length ? together(grouped, { stopOnFailure: true, ...(flags.wideGroups ? { limit: WIDE_GROUP_CONCURRENCY } : {}) }) : []),
      ...bulkSteps,
    ],
  };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• seeds â•â• */

/**
 * The on-visit writes as ONE job: the guarded `'Financing Options'` patch (when it is due) and every missing seed, all
 * independent rows, in one concurrent group, with ONE reload at the end. Before, each was its own job and each job
 * reloaded the whole screen (a new project: six jobs, six reloads).
 *
 * The canvas gives every seed its own `IfError` â†’ `Notify` ("Error while creating <X> financing input: â€¦"), so one
 * failing seed never stops the others: the group has no `stopOnFailure`, and `failureText` names EVERY failed seed with
 * the same text a lone seed job used to show (DIVERGENCE: before, each job cleared the previous message, so only the
 * last failure was visible; now all of them are).
 */
export function seedGroupJob(input: {
  seeds: readonly SeedRow[];
  project: Pick<FinanceProject, "id">;
  optionPlan: WritePlan | null;
  action: string;
  reload?: readonly QueryKey[] | undefined;
}): PlanJob | null {
  const { seeds, project, optionPlan, action } = input;
  const seedWrites = seeds.map((s) => ({ seed: s, write: seedWrite(s, project) }));
  const writes = [...(optionPlan?.writes ?? []), ...seedWrites.map((s) => s.write)];
  if (writes.length === 0) return null;
  const byReason = new Map(seedWrites.map((s) => [s.write.reason, s.seed]));
  return {
    progress: seeds.length > 0 ? FIN_LABEL.loading : SPINNER.saving,
    plan: { writes: together(writes), log: [] },
    failureText: (failures) => failures.map((f) => {
      const seed = byReason.get(f.reason);
      return writeErrorMessage(new PlanError(0, 1, f.reason, f.cause), action, seed ? (detail) => NOTIFY.seed(seed.category, detail) : undefined);
    }).join(" "),
    ...(input.reload ? { invalidate: input.reload } : {}),
  };
}
