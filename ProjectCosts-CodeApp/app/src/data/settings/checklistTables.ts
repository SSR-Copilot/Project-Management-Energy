/**
 * The three checklist tables shared by Check List Settings and Project Gates (M9, gap C3 / R4).
 *
 *   vsb_projectdefaultchecklists       vsb_projectdefaultchecklistses       checklist tasks
 *   vsb_checklistcountryandtechnology  vsb_checklistcountryandtechnologies  tabs / headers
 *   vsb_checklistdefaultapprovals      vsb_checklistdefaultapprovalses      task approvals / locks
 *
 * Before: each screen declared its own entity sets, selects, row types and raw-client plumbing
 * (`data/settings/checklist-settings.ts:36-291`, `data/settings/project-gates.ts:41-353`). This
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
 * Writes use the LOWER-CASE `owningbusinessunit@odata.bind` (PG audit B14: PascalCase was
 * rejected live on a sibling table; every working project write is lower case).
 *
 * GENERATED-SERVICE SWAP (after R1, `pac code add-data-source` for the three tables): replace
 * the three `rawTable(...)` handles below with the `Vsb_…Service` calls. Nothing outside this
 * file changes. Paging is already correct: `rawTable.page` returns the SDK page unchanged.
 */
import { and, chunk, eq, guid, isNull, lookupEq, lookupIn, ne, or } from "../odata";
import { rawTable, type RawClient, defaultRawClient } from "../rawTable";

/* ═══════════════════════════════════════════════════════════════ tables ══ */

export const CHECKLIST_ENTITY_SETS = {
  tasks: "vsb_projectdefaultchecklistses",
  headers: "vsb_checklistcountryandtechnologies",
  approvals: "vsb_checklistdefaultapprovalses",
  clusters: "vsb_projectstates",
  businessUnits: "businessunits",
} as const;

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

/* ══════════════════════════════════════════════════════════════ raw rows ══ */
// Declared here until pac generates the models (04-data/01-dataverse-tables.md §2.2-2.4).

export interface DefaultChecklistRow {
  vsb_projectdefaultchecklistsid: string;
  vsb_name?: string | null;
  vsb_order?: number | null;
  vsb_holdingtaskdescription?: string | null;
  vsb_gaterelevance?: boolean | null;
  vsb_iscompletiondate?: boolean | null;
  /** 0 = Active, 1 = Inactive. */
  statecode?: number | null;
  vsb_todelete?: boolean | null;
  _vsb_clusterstate_value?: string | null;
  _vsb_associatedcountryandtechnology_value?: string | null;
}

export interface ChecklistHeaderRow {
  vsb_checklistcountryandtechnologyid: string;
  vsb_name?: string | null;
  /** TEXT column (Checklist D-8) — sorted numerically by the screen. */
  vsb_order?: string | null;
  _owningbusinessunit_value?: string | null;
  _vsb_country_value?: string | null;
  /** Global choice `vsb_technology`; the column is `vsb_technology`, NOT `…code`. */
  vsb_technology?: number | null;
  createdon?: string | null;
}

export interface ChecklistApprovalRow {
  vsb_checklistdefaultapprovalsid?: string;
  vsb_name?: string | null;
  vsb_approvalmodecode?: number | null;
  vsb_gateisactive?: boolean | null;
  /** JSON, max 1000 chars. Note `…approvers`, not `…approvals`. */
  vsb_defaultapprovers?: string | null;
  vsb_defaultcontributors?: string | null;
  vsb_defaultnotifications?: string | null;
  _vsb_projectdefaultchecklistid_value?: string | null;
  _vsb_portfoliomanagerid_value?: string | null;
}

/* ════════════════════════════════════════════════════════════════ models ══ */

export interface DefaultChecklist {
  id: string;
  name: string;
  order: number | null;
  holdingDescription: string;
  gateRelevance: boolean;
  /** `null` kept: Checklist W-1 flips `null` to `true` (Power Fx `Not(blank)`). */
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

/** A task approval that locks its task (Checklist FR-5): mode is not Only Notifications, or null. */
export function isLockingApproval(a: Pick<ChecklistApproval, "mode">): boolean {
  return a.mode !== APPROVAL_MODE.onlyNotifications;
}

/* ═══════════════════════════════════════════════════════════════ filters ══ */

/** Power Fx `Not('To Delete' = true)`, null-safe (Checklist DR-4, Gates G-4). */
export const NOT_TO_DELETE = or(eq("vsb_todelete", false), isNull("vsb_todelete")) as string;

/** Dataverse `ne` skips nulls, and a NULL mode locks in the canvas — so the null clause is explicit. */
export const LOCKING_APPROVAL = or(
  ne("vsb_approvalmodecode", APPROVAL_MODE.onlyNotifications), isNull("vsb_approvalmodecode"),
) as string;

/* ═════════════════════════════════════════════════════════════════ binds ══ */

/** The owning-BU bind key. LOWER CASE (B14). */
export const OWNING_BU_BIND = "owningbusinessunit@odata.bind";

export const bindPath = (entitySet: string, id: string): string => `/${entitySet}(${guid(id)})`;

/** `{ "owningbusinessunit@odata.bind": "/businessunits(<id>)" }`, or `{}` without an id. */
export function owningBusinessUnitBind(businessUnitId: string | null | undefined): Record<string, string> {
  return businessUnitId ? { [OWNING_BU_BIND]: bindPath(CHECKLIST_ENTITY_SETS.businessUnits, businessUnitId) } : {};
}

/** Task → tab and task → cluster binds (navigation properties = SchemaName, Checklist DR-6). */
export function taskBinds(headerId: string, clusterId: string): Record<string, string> {
  return {
    "vsb_AssociatedCountryAndTechnology@odata.bind": bindPath(CHECKLIST_ENTITY_SETS.headers, headerId),
    "vsb_ClusterState@odata.bind": bindPath(CHECKLIST_ENTITY_SETS.clusters, clusterId),
  };
}

/* ═════════════════════════════════════════════════════════════ repository ══ */

export interface ListHeadersOptions {
  /** With `technology`: the one (country, technology) header (Gates R-6 step 1). */
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
  /** Approvals of these tasks only, chunked 40 ids per request (Gates R-6 step 3). */
  checklistIds?: readonly string[];
  /** Only approvals that lock their task (Checklist R-5). */
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
   * Returns the new id, or `undefined` when Dataverse answered success without one (Checklist B-2).
   * E9: `operation` names the write in a `DataError` (default "create checklist item").
   */
  createDefaultChecklist(payload: ChecklistPayload, operation?: string): Promise<string | undefined>;
  /** E9: `operation` names the write in a `DataError` (default "update checklist item"). */
  updateDefaultChecklist(id: string, changed: ChecklistPayload, operation?: string): Promise<void>;
  createChecklistApproval(payload: ChecklistPayload): Promise<string | undefined>;
  updateChecklistApproval(id: string, changed: ChecklistPayload): Promise<void>;
  deleteChecklistApproval(id: string): Promise<void>;
}

/** Builds the repository over a client (the default is the SDK's; tests inject a fake). */
export function createChecklistTablesRepository(client: () => RawClient = defaultRawClient): ChecklistTablesRepository {
  // Primary keys passed explicitly: these tables are not in `dataSourcesInfo` yet, and the
  // guarded `update` (V-1) reads the row by its key before every PATCH.
  const tasks = rawTable<DefaultChecklistRow>(CHECKLIST_ENTITY_SETS.tasks, client, "vsb_projectdefaultchecklistsid");
  const headers = rawTable<ChecklistHeaderRow>(CHECKLIST_ENTITY_SETS.headers, client, "vsb_checklistcountryandtechnologyid");
  const approvals = rawTable<ChecklistApprovalRow>(CHECKLIST_ENTITY_SETS.approvals, client, "vsb_checklistdefaultapprovalsid");

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
      const created = await tasks.create(payload, operation);
      return created?.vsb_projectdefaultchecklistsid || undefined;
    },

    updateDefaultChecklist: (id, changed, operation = "update checklist item") => tasks.update(id, changed, operation),

    async createChecklistApproval(payload) {
      const created = await approvals.create(payload) as ChecklistApprovalRow | undefined;
      return created?.vsb_checklistdefaultapprovalsid || undefined;
    },

    updateChecklistApproval: (id, changed) => approvals.update(id, changed),
    deleteChecklistApproval: (id) => approvals.remove(id),
  };
}

/** The repository both screens use. */
export const checklistTables: ChecklistTablesRepository = createChecklistTablesRepository();
