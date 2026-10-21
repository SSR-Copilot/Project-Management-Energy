/**
 * Admin Project Default Checklists Screen — queries and mutations.
 *
 * Canvas screen: `Admin Project Default Checklists Screen` (PM app)
 *   75 controls · 1 343 lines of Power Fx · 16 substantive blocks · band S
 *
 * Every list is server-filtered. The canvas `Filter('Project Default Checklists', And(…))`
 * inside a gallery `Items` is a client-side scan of the whole table once per gate; here it
 * is one `$filter` on the two lookups plus `vsb_todelete ne true`, `$orderby=vsb_order`.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  checklistCountryTechRepo, projectStateRepo, adminDefaultChecklistRepo,
  adminCheckListDefaultApprovalRepo,
} from "@/data/repos";
import { CHOICE_PROCESS } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import { f, asc, desc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import {
  CHECKLIST_COUNTRY_TECH_COL, PROJECT_STATE_COL, DEFAULT_CHECKLIST_COL,
  CHECK_LIST_DEFAULT_APPROVAL_COL, blockingChecklistIds, nextOrderFromHighest,
  type ScopeRow, type GateRow, type TaskRow, type WritePlan,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : fallback;

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export const toScopeRow = (r: Record<string, unknown>): ScopeRow => ({
  id: String(r[CHECKLIST_COUNTRY_TECH_COL.id] ?? ""),
  name: String(r[CHECKLIST_COUNTRY_TECH_COL.name] ?? ""),
  order: num(r[CHECKLIST_COUNTRY_TECH_COL.order]),
  countryId: str(r[CHECKLIST_COUNTRY_TECH_COL.country]),
  technology: typeof r[CHECKLIST_COUNTRY_TECH_COL.technology] === "number"
    ? (r[CHECKLIST_COUNTRY_TECH_COL.technology] as number)
    : null,
  owningBusinessUnitId: str(r[CHECKLIST_COUNTRY_TECH_COL.owningBusinessUnit]),
});

export const toGateRow = (r: Record<string, unknown>): GateRow => ({
  id: String(r[PROJECT_STATE_COL.id] ?? ""),
  name: String(r[PROJECT_STATE_COL.name] ?? ""),
  order: num(r[PROJECT_STATE_COL.order]),
  isVisibleOnChecklist: r[PROJECT_STATE_COL.isVisibleOnChecklist] === true,
});

export const toTaskRow = (r: Record<string, unknown>): TaskRow => ({
  id: String(r[DEFAULT_CHECKLIST_COL.id] ?? ""),
  name: String(r[DEFAULT_CHECKLIST_COL.name] ?? ""),
  order: num(r[DEFAULT_CHECKLIST_COL.order]),
  holdingTaskDescription: str(r[DEFAULT_CHECKLIST_COL.holdingTaskDescription]),
  gateRelevance: r[DEFAULT_CHECKLIST_COL.gateRelevance] === true,
  isCompletionDate: r[DEFAULT_CHECKLIST_COL.isCompletionDate] === true,
  toDelete: r[DEFAULT_CHECKLIST_COL.toDelete] === true,
  countryTechId: str(r[DEFAULT_CHECKLIST_COL.countryTech]),
  clusterStateId: str(r[DEFAULT_CHECKLIST_COL.clusterState]),
  status: num(r[DEFAULT_CHECKLIST_COL.statecode]),
});

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

export const adminChecklistKeys = {
  scopes: ["admin", "checklistScopes"] as const,
  gates: ["admin", "checklistGates"] as const,
  tasks: (scopeId: string, gateId: string) =>
    ["admin", "defaultChecklists", scopeId, gateId] as const,
  tasksForScope: (scopeId: string) => ["admin", "defaultChecklists", scopeId] as const,
  approvals: (scopeId: string, gateId: string) =>
    ["admin", "defaultApprovals", scopeId, gateId] as const,
} as const;

/* ═════════════════════════════════════════════════════════════════════ queries ════ */

/** Reference data — a long `staleTime`; the scope axis changes about once a year. */
export function useChecklistScopes() {
  const q = useQuery({
    queryKey: adminChecklistKeys.scopes,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await checklistCountryTechRepo.listAll({
        orderBy: [asc(CHECKLIST_COUNTRY_TECH_COL.order)],
      })).map(toScopeRow),
  });
  return { scopes: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** Rule 2 — `$filter=vsb_isvisibleonchecklist eq true&$orderby=vsb_order`. */
export function useChecklistGates() {
  const q = useQuery({
    queryKey: adminChecklistKeys.gates,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await projectStateRepo.listAll({
        filter: f.eq(PROJECT_STATE_COL.isVisibleOnChecklist, true),
        orderBy: [asc(PROJECT_STATE_COL.order)],
      })).map(toGateRow),
  });
  return { gates: q.data ?? [], isLoading: q.isLoading };
}

/** Rule 3 — both lookup ids plus the soft-delete exclusion, all server-side. */
export function useScopeTasks(scopeId: string | null, gateId: string | null) {
  const q = useQuery({
    queryKey: adminChecklistKeys.tasks(scopeId ?? "none", gateId ?? "none"),
    enabled: Boolean(scopeId && gateId),
    queryFn: async () =>
      (await adminDefaultChecklistRepo.listAll({
        filter: f.and(
          f.guid(DEFAULT_CHECKLIST_COL.countryTech, scopeId!),
          f.guid(DEFAULT_CHECKLIST_COL.clusterState, gateId!),
          f.ne(DEFAULT_CHECKLIST_COL.toDelete, 1),
        ),
        orderBy: [asc(DEFAULT_CHECKLIST_COL.order)],
      })).map(toTaskRow),
  });
  return { tasks: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/**
 * The in-use lock, ONE query per gate rather than the canvas's per-row-per-property
 * `LookUp`. The `Only Notifications` exclusion is applied in `blockingChecklistIds` so it
 * stays testable; the id set is what the row actions consume.
 */
export function useBlockingApprovals(scopeId: string | null, gateId: string | null) {
  const q = useQuery({
    queryKey: adminChecklistKeys.approvals(scopeId ?? "none", gateId ?? "none"),
    enabled: Boolean(scopeId && gateId),
    queryFn: async () => {
      const rows = await adminCheckListDefaultApprovalRepo.listAll({
        filter: f.ne(
          CHECK_LIST_DEFAULT_APPROVAL_COL.approvalMode,
          CHOICE_PROCESS.approvalMode.onlyNotifications,
        ),
      });
      return rows.map((r) => ({
        projectDefaultChecklistId:
          str(r[CHECK_LIST_DEFAULT_APPROVAL_COL.projectDefaultChecklist]),
        approvalMode: typeof r[CHECK_LIST_DEFAULT_APPROVAL_COL.approvalMode] === "number"
          ? (r[CHECK_LIST_DEFAULT_APPROVAL_COL.approvalMode] as number)
          : null,
      }));
    },
  });
  return {
    blockingIds: useMemo(
      () => blockingChecklistIds(q.data ?? [], CHOICE_PROCESS.approvalMode.onlyNotifications),
      [q.data],
    ),
    isLoading: q.isLoading,
  };
}

/* ═══════════════════════════════════════════════════════════════════ mutations ════ */

/**
 * Rule 4's concurrency mitigation: the next order is read at SAVE time, one row, ordered
 * descending — not captured when the Add button was pressed. Documented in `rules.ts`;
 * the durable fix is a server-side allocation.
 */
export async function readNextOrder(scopeId: string, gateId: string): Promise<number> {
  const page = await adminDefaultChecklistRepo.list({
    select: [DEFAULT_CHECKLIST_COL.id, DEFAULT_CHECKLIST_COL.order],
    filter: f.and(
      f.guid(DEFAULT_CHECKLIST_COL.countryTech, scopeId),
      f.guid(DEFAULT_CHECKLIST_COL.clusterState, gateId),
      f.ne(DEFAULT_CHECKLIST_COL.toDelete, 1),
    ),
    orderBy: [desc(DEFAULT_CHECKLIST_COL.order)],
    top: 1,
  });
  const highest = page.rows[0]?.[DEFAULT_CHECKLIST_COL.order];
  return nextOrderFromHighest(typeof highest === "number" ? highest : 0);
}

/** Runs a plan as ONE `$batch`, or refuses without issuing anything. */
export async function runPlan(plan: WritePlan, source: string): Promise<Result<number>> {
  if (plan.refusedReason) {
    return err(toAppError({ status: 403, message: plan.refusedReason }, source));
  }
  if (plan.writes.length === 0) return ok(0);
  try {
    trace("information", source, { writes: plan.writes.length, log: plan.log });
    await dataClient.batch(plan.writes.map((w) => ({
      op: w.op, entitySet: w.entitySet, id: w.id, data: w.data,
    })));
    return ok(plan.writes.length);
  } catch (e) {
    const appError = toAppError(e, source);
    trace("error", source, { status: appError.status, message: appError.message });
    return err(appError);
  }
}

interface MutationScope { scopeId: string; gateId: string }

function useInvalidateScope() {
  const qc = useQueryClient();
  return (s: MutationScope) => {
    void qc.invalidateQueries({ queryKey: adminChecklistKeys.tasks(s.scopeId, s.gateId) });
    // Rule 12's `Refresh('Project Default Approvals')` — a DIFFERENT table, refreshed
    // because a completion-date change alters what an approval means.
    void qc.invalidateQueries({ queryKey: adminChecklistKeys.approvals(s.scopeId, s.gateId) });
  };
}

export function useRunChecklistPlan(source: string) {
  const invalidate = useInvalidateScope();
  return useMutation({
    mutationFn: async (args: { plan: WritePlan; scope: MutationScope }) => {
      const res = await runPlan(args.plan, source);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_n, args) => invalidate(args.scope),
  });
}
