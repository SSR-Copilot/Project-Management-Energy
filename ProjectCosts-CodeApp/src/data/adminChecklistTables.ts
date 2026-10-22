/**
 * The three checklist tables shared by Check List Settings and Project Gates.
 *
 *   vsb_projectdefaultchecklists       vsb_projectdefaultchecklistses       checklist tasks
 *   vsb_checklistcountryandtechnology  vsb_checklistcountryandtechnologies  tabs / headers
 *   vsb_checklistdefaultapprovals      vsb_checklistdefaultapprovalses      task approvals / locks
 *
 * Each screen used to declare its own entity sets, selects and row types; this
 * file is the ONE place those live. Columns are the SUPERSET of both screens' selects, mapped to
 * one model per table; the screens' behavioural differences stay explicit as reader options:
 *
 *   | difference                                  | option                                   |
 *   |---------------------------------------------|------------------------------------------|
 *   | "To Delete" tasks hidden (both screens now) | `listDefaultChecklists({ includeToDelete })` (default false) |
 *   | Checklist reads every tab; Gates one header | `listChecklistHeaders({ countryId, technology })` |
 *   | Checklist locks = mode ≠ Only Notifications | `listChecklistApprovals({ lockingOnly: true })`   |
 *   | Gates approvals for given tasks (chunked)   | `listChecklistApprovals({ checklistIds })`        |
 *
 * Writes use the LOWER-CASE `owningbusinessunit@odata.bind` (PG audit PascalCase was
 * rejected live on a sibling table; every working project write is lower case).
 *
 * Reads and task creates go through the generated services (`Vsb_projectdefaultchecklistsesService`,
 * `Vsb_checklistcountryandtechnologiesService`, `Vsb_checklistdefaultapprovalsesService`). Task updates
 * use `updateRecordIfExists` (read-before-write, upsert guard): the generated `update` is an
 * upsert-prone PATCH. Approval writes are WritePlans (`data/runPlan.ts`), not repository methods.
 */
import type { IOperationOptions, IOperationResult } from "@microsoft/power-apps/data";
import type { Vsb_checklistcountryandtechnologies as ChecklistHeaderRow } from "@/generated/models/Vsb_checklistcountryandtechnologiesModel";
import type { Vsb_checklistdefaultapprovalses as ChecklistApprovalRow } from "@/generated/models/Vsb_checklistdefaultapprovalsesModel";
import type { Vsb_projectdefaultchecklistses as DefaultChecklistRow } from "@/generated/models/Vsb_projectdefaultchecklistsesModel";
import { Vsb_checklistcountryandtechnologiesService } from "@/generated/services/Vsb_checklistcountryandtechnologiesService";
import { Vsb_checklistdefaultapprovalsesService } from "@/generated/services/Vsb_checklistdefaultapprovalsesService";
import { Vsb_projectdefaultchecklistsesService } from "@/generated/services/Vsb_projectdefaultchecklistsesService";
import { fetchAll, guardedCall, guardedResult, updateRecordIfExists, type FetchAllOptions } from "./client";
import { CHECKLIST_ENTITY_SETS } from "./dataverseNames";
import { and, bindPath, chunk, eq, isNull, lookupEq, lookupIn, ne, or } from "./odata";

/* ═══════════════════════════════════════════════════════════════ tables ══ */

/** Global choice `vsb_approvalmode`. Only "Only Notifications" does NOT lock a task. */
export const APPROVAL_MODE = { formal: 952850000, local: 952850001, onlyNotifications: 952850002 } as const;

/** Superset of Check List Settings `TASK_SELECT` and Project Gates `CHECKLIST_SELECT`. */
export const TASK_COLUMNS = [
  "vsb_projectdefaultchecklistsid", "vsb_name", "vsb_order", "vsb_holdingtaskdescription",
  "vsb_gaterelevance", "vsb_iscompletiondate", "statecode", "vsb_todelete",
  "_vsb_clusterstate_value", "_vsb_associatedcountryandtechnology_value",
] as const;

/** Superset of Check List Settings `TAB_SELECT` and Project Gates `HEADER_SELECT`. */
export const HEADER_COLUMNS = [
  "vsb_checklistcountryandtechnologyid", "vsb_name", "vsb_order", "_owningbusinessunit_value",
  "_vsb_country_value", "vsb_technology", "createdon",
] as const;

/** Superset of Check List Settings `LOCK_SELECT` and Project Gates `APPROVAL_SELECT`. */
export const APPROVAL_COLUMNS = [
  "vsb_checklistdefaultapprovalsid", "vsb_name", "vsb_approvalmodecode", "vsb_gateisactive",
  "vsb_defaultapprovers", "vsb_defaultcontributors", "vsb_defaultnotifications",
  "_vsb_projectdefaultchecklistid_value", "_vsb_portfoliomanagerid_value",
] as const;

/* ════════════════════════════════════════════════════════════════ models ══ */
// Row types are the generated models. Notes that still apply: the header `vsb_order` is a TEXT
// column (sorted numerically by the screen); the technology column is `vsb_technology`, NOT
// `…code`; the approvals JSON columns are `…approvers`, not `…approvals` (max 1000 chars).

export interface DefaultChecklist {
  id: string;
  name: string;
  order: number | null;
  holdingDescription: string;
  gateRelevance: boolean;
  /** `null` kept: the Check List screen flips `null` to `true` (Power Fx `Not(blank)`). */
  isCompletionDate: boolean | null;
  /** `statecode = 0`; a missing statecode counts as active (both screens). */
  active: boolean;
  toDelete: boolean;
  clusterId: string | null;
  headerId: string | null;
}

export interface ChecklistHeader {
  id: string;
  name: string;
  order: string | null;
  owningBusinessUnitId: string | null;
  countryId: string | null;
  technology: number | null;
  createdOn: string | null;
}

export interface ChecklistApproval {
  id: string;
  name: string;
  mode: number | null;
  gateActive: boolean;
  checklistId: string | null;
  pmId: string | null;
  contributors: string | null;
  approvers: string | null;
  notifications: string | null;
}

export const toDefaultChecklist = (r: DefaultChecklistRow): DefaultChecklist => ({
  id: r.vsb_projectdefaultchecklistsid,
  name: r.vsb_name ?? "",
  order: typeof r.vsb_order === "number" ? r.vsb_order : null,
  holdingDescription: r.vsb_holdingtaskdescription ?? "",
  gateRelevance: r.vsb_gaterelevance === true,
  isCompletionDate: r.vsb_iscompletiondate ?? null,
  active: (r.statecode ?? 0) === 0,
  toDelete: r.vsb_todelete === true,
  clusterId: r._vsb_clusterstate_value ?? null,
  headerId: r._vsb_associatedcountryandtechnology_value ?? null,
});

export const toChecklistHeader = (r: ChecklistHeaderRow): ChecklistHeader => ({
  id: r.vsb_checklistcountryandtechnologyid,
  name: r.vsb_name ?? "",
  order: r.vsb_order ?? null,
  owningBusinessUnitId: r._owningbusinessunit_value ?? null,
  countryId: r._vsb_country_value ?? null,
  technology: typeof r.vsb_technology === "number" ? r.vsb_technology : null,
  createdOn: r.createdon ?? null,
});

export const toChecklistApproval = (r: ChecklistApprovalRow): ChecklistApproval => ({
  id: r.vsb_checklistdefaultapprovalsid ?? "",
  name: r.vsb_name ?? "",
  mode: typeof r.vsb_approvalmodecode === "number" ? r.vsb_approvalmodecode : null,
  gateActive: r.vsb_gateisactive === true,
  checklistId: r._vsb_projectdefaultchecklistid_value ?? null,
  pmId: r._vsb_portfoliomanagerid_value ?? null,
  contributors: r.vsb_defaultcontributors ?? null,
  approvers: r.vsb_defaultapprovers ?? null,
  notifications: r.vsb_defaultnotifications ?? null,
});

/** A task approval that locks its task: mode is not Only Notifications, or null. */
export function isLockingApproval(a: Pick<ChecklistApproval, "mode">): boolean {
  return a.mode !== APPROVAL_MODE.onlyNotifications;
}

/* ═══════════════════════════════════════════════════════════════ filters ══ */

/** Power Fx `Not('To Delete' = true)`, null-safe. */
export const NOT_TO_DELETE = or(eq("vsb_todelete", false), isNull("vsb_todelete")) as string;

/** Dataverse `ne` skips nulls, and a NULL mode locks in the canvas — so the null clause is explicit. */
export const LOCKING_APPROVAL = or(
  ne("vsb_approvalmodecode", APPROVAL_MODE.onlyNotifications), isNull("vsb_approvalmodecode"),
) as string;

/* ═════════════════════════════════════════════════════════════════ binds ══ */

/** Task → tab and task → cluster binds (navigation properties = SchemaName). */
export function taskBinds(headerId: string, clusterId: string): Record<string, string> {
  return {
    "vsb_AssociatedCountryAndTechnology@odata.bind": bindPath(CHECKLIST_ENTITY_SETS.headers, headerId),
    "vsb_ClusterState@odata.bind": bindPath(CHECKLIST_ENTITY_SETS.clusters, clusterId),
  };
}

/* ═════════════════════════════════════════════════════════════ repository ══ */

export interface ListHeadersOptions {
  /** With `technology`: the one (country, technology) header. */
  countryId?: string;
  technology?: number;
  select?: readonly string[];
  orderBy?: string[];
  operation?: string;
}

export interface ListTasksOptions {
  /** The tab / header the tasks hang off. Omit for every task (not used by either screen today). */
  headerId?: string;
  /** Default false: soft-deleted rows are filtered on the server (both screens). */
  includeToDelete?: boolean;
  select?: readonly string[];
  operation?: string;
}

export interface ListApprovalsOptions {
  /** Approvals of these tasks only, chunked 40 ids per request. */
  checklistIds?: readonly string[];
  /** Only approvals that lock their task. */
  lockingOnly?: boolean;
  select?: readonly string[];
  operation?: string;
}

/** Create/update payload: plain columns plus `…@odata.bind` keys (null clears a bind). */
export type ChecklistPayload = Record<string, string | number | boolean | null>;

export interface ChecklistTablesRepository {
  listChecklistHeaders(options?: ListHeadersOptions): Promise<ChecklistHeader[]>;
  listDefaultChecklists(options?: ListTasksOptions): Promise<DefaultChecklist[]>;
  listChecklistApprovals(options?: ListApprovalsOptions): Promise<ChecklistApproval[]>;
  /**
   * Returns the new id, or `undefined` when Dataverse answered success without one.
   * E9: `operation` names the write in a `DataError` (default "create checklist item").
   */
  createDefaultChecklist(payload: ChecklistPayload, operation?: string): Promise<string | undefined>;
  /** E9: `operation` names the write in a `DataError` (default "update checklist item"). */
  updateDefaultChecklist(id: string, changed: ChecklistPayload, operation?: string): Promise<void>;
  // Approval writes (create / update / delete) run as WritePlans through `data/runPlan.ts`
  // (`admin-gates-approvals/writes.test.ts`), so the repository only reads that table.
}

type TaskCreate = Parameters<typeof Vsb_projectdefaultchecklistsesService.create>[0];

/**
 * Every page of a table, `operation` defaulting to `read <entitySet>`. A THROWN SDK error becomes
 * a `DataError` naming the entity set; the page result keeps its `skipToken`, so `fetchAll` keeps
 * following it past 500 rows (a rebuilt `{success, data}` would drop it and cut the set short).
 */
function listAll<T>(
  entitySet: string,
  getAll: (options: IOperationOptions) => Promise<IOperationResult<T[]>>,
  options: FetchAllOptions,
  operation = `read ${entitySet}`,
): Promise<T[]> {
  return fetchAll<T>(operation, (o) => guardedResult(`read ${entitySet}`, () => getAll(o)), options);
}

/** The repository over the generated services; tests drive it through the mocked SDK client. */
export function createChecklistTablesRepository(): ChecklistTablesRepository {
  const tasks = {
    list: (options: FetchAllOptions, operation?: string) => listAll<DefaultChecklistRow>(
      CHECKLIST_ENTITY_SETS.tasks, (o) => Vsb_projectdefaultchecklistsesService.getAll(o), options, operation),
  };
  const headers = {
    list: (options: FetchAllOptions, operation?: string) => listAll<ChecklistHeaderRow>(
      CHECKLIST_ENTITY_SETS.headers, (o) => Vsb_checklistcountryandtechnologiesService.getAll(o), options, operation),
  };
  const approvals = {
    list: (options: FetchAllOptions, operation?: string) => listAll<ChecklistApprovalRow>(
      CHECKLIST_ENTITY_SETS.approvals, (o) => Vsb_checklistdefaultapprovalsesService.getAll(o), options, operation),
  };

  return {
    async listChecklistHeaders(options = {}) {
      const rows = await headers.list({
        select: [...(options.select ?? HEADER_COLUMNS)],
        filter: and(
          options.countryId ? lookupEq("vsb_country", options.countryId) : undefined,
          options.technology !== undefined ? eq("vsb_technology", options.technology) : undefined,
        ),
        orderBy: options.orderBy ?? (options.countryId ? ["createdon asc"] : ["vsb_order asc"]),
      }, options.operation);
      return rows.map(toChecklistHeader);
    },

    async listDefaultChecklists(options = {}) {
      const rows = await tasks.list({
        select: [...(options.select ?? TASK_COLUMNS)],
        filter: and(
          options.headerId ? lookupEq("vsb_associatedcountryandtechnology", options.headerId) : undefined,
          options.includeToDelete ? undefined : NOT_TO_DELETE,
        ),
        orderBy: ["vsb_order asc"],
      }, options.operation);
      const mapped = rows.map(toDefaultChecklist);
      // Defensive: even if the server filter changed, a row waiting for deletion stays hidden.
      return options.includeToDelete ? mapped : mapped.filter((t) => !t.toDelete);
    },

    async listChecklistApprovals(options = {}) {
      const select = [...(options.select ?? APPROVAL_COLUMNS)];
      const filterFor = (ids?: readonly string[]) => and(
        ids ? lookupIn("vsb_projectdefaultchecklistid", ids) : undefined,
        options.lockingOnly ? LOCKING_APPROVAL : undefined,
      );
      let rows: ChecklistApprovalRow[];
      if (options.checklistIds) {
        rows = [];
        for (const ids of chunk(options.checklistIds)) {
          rows.push(...await approvals.list({ select, filter: filterFor(ids) }, options.operation));
        }
      } else {
        rows = await approvals.list({ select, filter: filterFor() }, options.operation);
      }
      const mapped = rows.map(toChecklistApproval);
      // Re-check so a mock or a future filter change cannot widen the lock set.
      return options.lockingOnly ? mapped.filter(isLockingApproval) : mapped;
    },

    async createDefaultChecklist(payload, operation = "create checklist item") {
      const created = await guardedCall(operation, () =>
        Vsb_projectdefaultchecklistsesService.create(payload as unknown as TaskCreate));
      return created?.vsb_projectdefaultchecklistsid || undefined;
    },

    async updateDefaultChecklist(id, changed, operation = "update checklist item") {
      await updateRecordIfExists(operation, CHECKLIST_ENTITY_SETS.tasks, id, changed);
    },
  };
}

/** The repository both screens use. */
export const checklistTables: ChecklistTablesRepository = createChecklistTablesRepository();
