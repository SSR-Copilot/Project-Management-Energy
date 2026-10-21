/**
 * Admin Project Default Checklists — the Dataverse reads behind
 * `features/admin/admin-default-checklists` (tables registered 19 Oct 2026, D18).
 *
 * SERVER AUTOMATION: every add or modify of `vsb_projectdefaultchecklists` fires the flow
 * `SynchroniseProjectTaskList-Add_Update`, which copies the task into live project checklists
 * (04-flow-inventory.md). The reads here have no side effects; the writes go through the screen's
 * `WritePlan`s, shaped so that flow behaves exactly as it does for the canvas.
 */
import { Vsb_checklistcountryandtechnologiesService } from "@/generated/services/Vsb_checklistcountryandtechnologiesService";
import { Vsb_checklistdefaultapprovalsesService } from "@/generated/services/Vsb_checklistdefaultapprovalsesService";
import { Vsb_projectdefaultchecklistsesService } from "@/generated/services/Vsb_projectdefaultchecklistsesService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import type { GateRow, ScopeRow, TaskRow } from "@/features/admin/admin-default-checklists/rules";
import { fetchAll, fetchPage } from "./client";
import { and, chunk, eq, idIn, lookupEq, ne } from "./odata";

/** `Checklist Country And Technologies` — the tab strip. Sorted client-side (`vsb_order` is text). */
export async function listChecklistScopes(): Promise<ScopeRow[]> {
  const rows = await fetchAll(
    "list checklist country/technology scopes",
    (o) => Vsb_checklistcountryandtechnologiesService.getAll(o),
    {
      select: [
        "vsb_checklistcountryandtechnologyid", "vsb_name", "vsb_order", "_vsb_country_value",
        "vsb_technology", "_owningbusinessunit_value",
      ],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_checklistcountryandtechnologyid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? null,
    countryId: r._vsb_country_value ?? null,
    technology: r.vsb_technology === undefined || r.vsb_technology === null ? null : Number(r.vsb_technology),
    owningBusinessUnitId: r._owningbusinessunit_value ?? null,
  }));
}

/** `Filter('Project States', 'Is Visible On Checklist')`, by `vsb_order`. */
export async function listChecklistGates(): Promise<GateRow[]> {
  const rows = await fetchAll(
    "list checklist gates",
    (o) => Vsb_projectstatesService.getAll(o),
    {
      select: ["vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist"],
      filter: eq("vsb_isvisibleonchecklist", true),
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_projectstateid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? 0,
    isVisibleOnChecklist: r.vsb_isvisibleonchecklist === true,
  }));
}

const TASK_SELECT = [
  "vsb_projectdefaultchecklistsid", "vsb_name", "vsb_order", "vsb_holdingtaskdescription",
  "vsb_gaterelevance", "vsb_iscompletiondate", "vsb_todelete",
  "_vsb_associatedcountryandtechnology_value", "_vsb_clusterstate_value", "statecode",
];

const scopeGateFilter = (scopeId: string, gateId: string) => and(
  lookupEq("vsb_associatedcountryandtechnology", scopeId),
  lookupEq("vsb_clusterstate", gateId),
);

/** One gate's tasks in one scope, without soft-deleted rows, by `vsb_order`. */
export async function listScopeTasks(scopeId: string, gateId: string): Promise<TaskRow[]> {
  const rows = await fetchAll(
    "list default checklist tasks",
    (o) => Vsb_projectdefaultchecklistsesService.getAll(o),
    {
      select: TASK_SELECT,
      // `ne true` keeps rows whose flag is null as well as false.
      filter: and(scopeGateFilter(scopeId, gateId), ne("vsb_todelete", true)),
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_projectdefaultchecklistsid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? 0,
    holdingTaskDescription: r.vsb_holdingtaskdescription ?? null,
    gateRelevance: r.vsb_gaterelevance === true,
    isCompletionDate: r.vsb_iscompletiondate === true,
    toDelete: r.vsb_todelete === true,
    countryTechId: r._vsb_associatedcountryandtechnology_value ?? null,
    clusterStateId: r._vsb_clusterstate_value ?? null,
    status: Number(r.statecode ?? 0),
  }));
}

/**
 * The highest `Order` in the scope and gate, read at SAVE time for the next order
 * (`nextOrderFromHighest`).
 */
export async function highestTaskOrder(scopeId: string, gateId: string): Promise<number | null> {
  const rows = await fetchPage(
    "read the highest default checklist order",
    (o) => Vsb_projectdefaultchecklistsesService.getAll(o),
    {
      select: ["vsb_projectdefaultchecklistsid", "vsb_order"],
      filter: and(scopeGateFilter(scopeId, gateId), ne("vsb_todelete", true)),
      orderBy: ["vsb_order desc"],
      top: 1,
    },
  );
  return rows[0]?.vsb_order ?? null;
}

/**
 * `Check List Default Approvals` for the given tasks, with their mode. The mode is NOT filtered
 * server-side: `ne` would drop blank modes, and a blank mode locks (`blockingChecklistIds`).
 */
export async function listTaskApprovals(
  taskIds: readonly string[],
): Promise<{ projectDefaultChecklistId: string | null; approvalMode: number | null }[]> {
  if (taskIds.length === 0) return [];
  const batches = await Promise.all(chunk(taskIds).map((ids) =>
    fetchAll(
      "list default approvals of checklist tasks",
      (o) => Vsb_checklistdefaultapprovalsesService.getAll(o),
      {
        select: ["vsb_checklistdefaultapprovalsid", "_vsb_projectdefaultchecklistid_value", "vsb_approvalmodecode"],
        filter: idIn("_vsb_projectdefaultchecklistid_value", ids),
      },
    )));
  return batches.flat().map((r) => ({
    projectDefaultChecklistId: r._vsb_projectdefaultchecklistid_value ?? null,
    approvalMode: r.vsb_approvalmodecode === undefined || r.vsb_approvalmodecode === null
      ? null : Number(r.vsb_approvalmodecode),
  }));
}
