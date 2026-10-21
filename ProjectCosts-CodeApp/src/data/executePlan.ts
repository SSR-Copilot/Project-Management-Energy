/**
 * Runs a `WritePlan` (from a screen's `rules.ts`) against Dataverse, one write at a time, IN
 * THE PLAN'S ORDER.
 *
 * Order matters and is never changed here: server-side flows and plugins fire on each write
 * (`ProjectDocs/migration-plans/04-flow-inventory.md`), so a plan reproduces the canvas's own
 * sequence — e.g. Admin Default Checklists' create-then-update, which is what carries a task's
 * status into the project checklists.
 *
 * NOT TRANSACTIONAL. The SDK has no changeset, so a plan can half-apply. A failure stops the run
 * and throws `PlanError`, which says how many writes had already been sent, so the screen can
 * tell the user exactly what happened instead of claiming nothing changed.
 *
 * `CREATED_ROW_ID` in a write's `id` is replaced by the id of the most recent create in the same
 * plan (the canvas pattern `Patch(Defaults(T), …)` followed by `UpdateIf(T, id = <new>, …)`).
 * `createdRowRef(n)` — in the `id` or inside a string value of `data`, such as a bind — is
 * replaced by the id of the plan's n-th create (a parent row its children are bound to).
 */
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { unwrap } from "@/platform/errors";
import { CREATED_ROW_ID, type WritePlan } from "./writePlan";

/** The three SDK calls a plan needs — the `getClient` shape, narrowed so tests can stub it. */
export interface PlanClient {
  createRecordAsync: ReturnType<typeof getClient>["createRecordAsync"];
  updateRecordAsync: ReturnType<typeof getClient>["updateRecordAsync"];
  deleteRecordAsync: ReturnType<typeof getClient>["deleteRecordAsync"];
}

export interface PlanResult {
  /** Writes sent successfully. */
  done: number;
  /** The ids returned by the plan's creates, in order. */
  createdIds: string[];
}

/** A plan that stopped part-way. `done` writes were sent before `failedReason` failed. */
export class PlanError extends Error {
  readonly done: number;
  readonly total: number;
  readonly failedReason: string;
  override readonly cause: unknown;

  constructor(done: number, total: number, failedReason: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PlanError";
    this.done = done;
    this.total = total;
    this.failedReason = failedReason;
    this.cause = cause;
  }
}

const CREATED_REF = /@created#(\d+)/g;

/** Replaces every `createdRowRef(n)` in `value` with the n-th created id. */
function resolveRefs(value: string, createdIds: readonly string[]): string {
  return value.replace(CREATED_REF, (_, n: string) => {
    const id = createdIds[Number(n)];
    if (!id) throw new Error(`a write refers to created row ${n}, but that create has not run`);
    return id;
  });
}

function resolveData(
  data: Record<string, unknown> | undefined, createdIds: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = typeof v === "string" ? resolveRefs(v, createdIds) : v;
  }
  return out;
}

const primaryKeyOf = (entitySet: string): string => {
  const info = (dataSourcesInfo as Record<string, { primaryKey?: string } | undefined>)[entitySet];
  if (!info?.primaryKey) {
    throw new Error(
      `Table "${entitySet}" is not registered in this app — run \`pac code add-data-source\` for it.`,
    );
  }
  return info.primaryKey;
};

export async function executePlan(
  plan: WritePlan,
  operation: string,
  client: PlanClient = getClient(dataSourcesInfo),
): Promise<PlanResult> {
  if (plan.refusedReason) throw new Error(plan.refusedReason);

  const createdIds: string[] = [];
  let done = 0;
  for (const write of plan.writes) {
    try {
      const id = write.id === CREATED_ROW_ID
        ? createdIds[createdIds.length - 1]
        : write.id === undefined ? undefined : resolveRefs(write.id, createdIds);
      if (write.id === CREATED_ROW_ID && !id) {
        throw new Error("a write refers to a created row, but no create preceded it");
      }
      const data = resolveData(write.data, createdIds);
      const label = `${operation}: ${write.reason}`;
      if (write.op === "create") {
        const key = primaryKeyOf(write.entitySet);
        const row = unwrap(
          await client.createRecordAsync<Record<string, unknown>, Record<string, unknown>>(
            write.entitySet, data,
          ),
          label,
        );
        const newId = row?.[key];
        if (typeof newId !== "string" || !newId) throw new Error(`${label}: the create returned no id`);
        createdIds.push(newId);
      } else if (write.op === "update") {
        primaryKeyOf(write.entitySet);
        unwrap(
          await client.updateRecordAsync<Record<string, unknown>, Record<string, unknown>>(
            write.entitySet, id!, data,
          ),
          label,
        );
      } else {
        primaryKeyOf(write.entitySet);
        unwrap(await client.deleteRecordAsync(write.entitySet, id!), label);
      }
      done += 1;
    } catch (cause) {
      throw new PlanError(done, plan.writes.length, write.reason, cause);
    }
  }
  return { done, createdIds };
}
