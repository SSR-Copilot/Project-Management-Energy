/**
 * Check List Settings — Dataverse reads and writes.
 *
 * Canvas source: `Admin Project Default Checklists Screen.pa.yaml`. Every read (R-n) and write
 * (W-n) here is cited in `codeapp-knowledge-base/screens/application-settings/checklist-settings/
 * 04-data/02-operations-performed.md`; requirements DR-1…DR-11 are in
 * `06-code-app-requirements/01-build-requirements.md`.
 *
 * TABLES. The three checklist tables (tasks, country/technology tabs, default approvals) have no
 * `pac`-generated service yet. Their entity sets, columns, row shapes and raw-client plumbing
 * live in ONE shared place, `data/settings/checklistTables.ts` (M9, also used by Project Gates);
 * this module maps that repository's models onto this screen's models. When the services are
 * generated only `checklistTables.ts` changes. Clusters (`vsb_projectstates`) use the generated
 * `Vsb_projectstatesService`.
 *
 * WRITE MODEL. Nothing here changes the cache optimistically (DR-10): the sync flow
 * `SynchroniseProjectTaskList-Add_Update` reads the committed row, so the UI must reflect only
 * what Dataverse accepted.
 */
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { fetchAll } from "../client";
import { f } from "../odata";
import { BulkWriteError } from "../bulkWrite";
import { forEachLimit } from "../concurrency";
import {
  checklistTables, isLockingApproval, owningBusinessUnitBind, taskBinds,
  type ChecklistApproval, type ChecklistTablesRepository,
} from "./checklistTables";

/* ═══════════════════════════════════════════════════════════════ tables ══ */

export const CLUSTER_SELECT = ["vsb_projectstateid", "vsb_name", "vsb_order"] as const;

/**
 * Write shape for `vsb_projectdefaultchecklistses` (navigation properties = SchemaName, DR-6).
 * The owning-BU bind key is LOWER CASE (PG audit B14: PascalCase was rejected live).
 */
export interface ChecklistTaskWrite {
  vsb_name?: string;
  vsb_order?: number;
  vsb_holdingtaskdescription?: string;
  vsb_gaterelevance?: boolean;
  vsb_iscompletiondate?: boolean;
  vsb_todelete?: boolean;
  statecode?: 0 | 1;
  statuscode?: 1 | 2;
  "vsb_AssociatedCountryAndTechnology@odata.bind"?: string;
  "vsb_ClusterState@odata.bind"?: string;
  "owningbusinessunit@odata.bind"?: string;
}

/* ═════════════════════════════════════════════════════════ screen models ══ */

export interface ChecklistTab {
  id: string;
  name: string;
  /** Raw text Order — sorted numerically by `sortTabs` in the screen's rules. */
  order: string | null;
  owningBusinessUnitId: string | null;
}

export interface ChecklistCluster {
  id: string;
  name: string;
  order: number | null;
}

export interface ChecklistTask {
  id: string;
  name: string;
  order: number | null;
  holdingDescription: string;
  gateRelevance: boolean;
  /** `null` is kept: W-1 flips `null` to `true` (Power Fx `Not(blank)`). */
  isCompletionDate: boolean | null;
  isActive: boolean;
  toDelete: boolean;
  clusterId: string | null;
  tabId: string | null;
}

/** What the Add/Edit drawer submits. */
export interface TaskForm {
  name: string;
  holdingDescription: string;
  gateRelevance: boolean;
  isCompletionDate: boolean;
  isActive: boolean;
}

/** One Order write (reorder and renumber-after-delete). */
export interface OrderPatch {
  id: string;
  order: number;
}

/* ═══════════════════════════════════════════════════════════ repository ══ */

/**
 * The only seam to Dataverse for this screen (tests can inject a fake). The default
 * implementation delegates to the shared `checklistTables` repository.
 */
export interface ChecklistRepository {
  listTabs(): Promise<ChecklistTab[]>;
  listClusters(): Promise<ChecklistCluster[]>;
  listTasks(tabId: string): Promise<ChecklistTask[]>;
  /** Task approvals that lock their task (mode is not "Only Notifications", or null). */
  listLocks(): Promise<Pick<ChecklistApproval, "checklistId" | "mode">[]>;
  /** Returns the new row's id. */
  createTask(record: ChecklistTaskWrite): Promise<string>;
  updateTask(id: string, changed: ChecklistTaskWrite): Promise<void>;
}

/**
 * Step A (create) succeeded but Dataverse returned no id (gap B-2). The row very likely EXISTS,
 * so the screen must not leave the drawer in create mode — a retry would add a duplicate.
 */
export class TaskCreatedIdUnknownError extends Error {
  constructor() {
    // Parity R2 GAP-3: thrown before step B, so the status the user chose was never written.
    super(
      "The item was created but could not be confirmed, so its status may not be set. " +
        "Check the list before adding it again, and set Active on the item if needed.",
    );
    this.name = "TaskCreatedIdUnknownError";
  }
}

/** V9: the operation texts this screen's checklist writes carry in a `DataError`. */
export const OPERATION = {
  create: "Create checklist item",
  update: "Update checklist item",
} as const;

/** Builds the screen repository over a checklist-tables repository (default: the shared one). */
export function createChecklistRepository(tables: ChecklistTablesRepository = checklistTables): ChecklistRepository {
  return {
    /** R-1 + R-2: all tabs once, no status filter (D-9). Client sorts numerically (DR-2). */
    listTabs: async () =>
      (await tables.listChecklistHeaders({ operation: "Load checklist country/technology tabs" }))
        .map((h) => ({ id: h.id, name: h.name, order: h.order, owningBusinessUnitId: h.owningBusinessUnitId })),

    /** R-3 / DR-3. */
    listClusters: async () => {
      const rows = await fetchAll("Load checklist clusters", Vsb_projectstatesService.getAll, {
        select: [...CLUSTER_SELECT],
        filter: f.eq("vsb_isvisibleonchecklist", true),
        orderBy: ["vsb_order asc"],
      });
      return rows.map((r) => ({ id: r.vsb_projectstateid, name: r.vsb_name ?? "", order: r.vsb_order ?? null }));
    },

    /**
     * R-4 / DR-4: ONE query per tab (the canvas ran one per cluster). The shared reader's
     * `vsb_todelete` clause is null-safe, so it means what Power Fx `Not('To Delete' = true)` meant.
     */
    listTasks: async (tabId) =>
      (await tables.listDefaultChecklists({ headerId: tabId, operation: "Load checklist tasks" }))
        .map((t) => ({
          id: t.id,
          name: t.name,
          order: t.order,
          holdingDescription: t.holdingDescription,
          gateRelevance: t.gateRelevance,
          isCompletionDate: t.isCompletionDate,
          isActive: t.active,
          toDelete: t.toDelete,
          clusterId: t.clusterId,
          tabId: t.headerId,
        })),

    /**
     * R-5 / DR-4: one query per screen load instead of up to 8 LookUps per row. Dataverse `ne`
     * does not return nulls, and a NULL mode locks in the canvas, so the shared filter has an
     * explicit null clause.
     */
    listLocks: () =>
      tables.listChecklistApprovals({ lockingOnly: true, operation: "Load Project Gate checklist approvals" }),

    // V9 (reusable components E9): this screen names its writes with the capitalised
    // pre-batch-2 operation texts again, so an error reads "Create checklist item failed: …".
    createTask: async (record) => {
      const id = await tables.createDefaultChecklist({ ...record }, OPERATION.create);
      // `success: true` with no id: created, id unknown — never treat this as "not created".
      if (!id) throw new TaskCreatedIdUnknownError();
      return id;
    },

    updateTask: (id, changed) => tables.updateDefaultChecklist(id, { ...changed }, OPERATION.update),
  };
}

export const dataverseChecklistRepository: ChecklistRepository = createChecklistRepository();

/* ═══════════════════════════════════════════════════════════════ reads ══ */

export function loadTabs(repo: ChecklistRepository = dataverseChecklistRepository): Promise<ChecklistTab[]> {
  return repo.listTabs();
}

export function loadClusters(repo: ChecklistRepository = dataverseChecklistRepository): Promise<ChecklistCluster[]> {
  return repo.listClusters();
}

export async function loadTasks(
  tabId: string, repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<ChecklistTask[]> {
  // Defensive: even if the server filter ever changed, a row waiting for deletion stays hidden.
  return (await repo.listTasks(tabId)).filter((t) => !t.toDelete);
}

/** The ids of tasks "in use by a Project Gate" (FR-5). */
export async function loadLockedTaskIds(
  repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const approval of await repo.listLocks()) {
    const id = approval.checklistId;
    // The query already excludes "Only Notifications"; re-check so a fake or a future filter
    // change cannot widen the lock.
    if (id && isLockingApproval(approval)) ids.add(id.toLowerCase());
  }
  return ids;
}

/* ═══════════════════════════════════════════════════════════ payloads ══ */

/** Active → statecode 0 / statuscode 1; Inactive → 1 / 2 (DR-6, DR-9). */
export function statusPayload(isActive: boolean): { statecode: 0 | 1; statuscode: 1 | 2 } {
  return isActive ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 };
}

/** DR-6 create payload (W-2 step A). The BU bind is omitted when the tab has no BU. */
export function buildCreatePayload(
  tab: ChecklistTab, clusterId: string, form: TaskForm, order: number,
): ChecklistTaskWrite {
  return {
    vsb_name: form.name.trim(),
    vsb_order: order,
    ...taskBinds(tab.id, clusterId),
    vsb_holdingtaskdescription: form.holdingDescription.trim(),
    vsb_gaterelevance: form.gateRelevance,
    vsb_iscompletiondate: form.isCompletionDate,
    ...owningBusinessUnitBind(tab.owningBusinessUnitId),
  };
}

/** DR-6 edit payload (W-2 step B for an existing row). BU comes from the task's own tab (D-22). */
export function buildEditPayload(form: TaskForm, tab: ChecklistTab | undefined): ChecklistTaskWrite {
  return {
    vsb_name: form.name.trim(),
    vsb_holdingtaskdescription: form.holdingDescription.trim(),
    vsb_gaterelevance: form.gateRelevance,
    vsb_iscompletiondate: form.isCompletionDate,
    ...statusPayload(form.isActive),
    ...owningBusinessUnitBind(tab?.owningBusinessUnitId),
  };
}

/* ═══════════════════════════════════════════════════════════════ writes ══ */

/**
 * Step A succeeded and step B (status) failed: the row EXISTS. The screen switches the drawer
 * to edit that row, so a retry updates it instead of creating a duplicate.
 */
export class TaskStatusNotSetError extends Error {
  readonly createdId: string;
  override readonly cause?: unknown;
  constructor(createdId: string, cause: unknown) {
    super(
      "The checklist item was created, but its status could not be set. " +
      `Save again to retry. ${cause instanceof Error ? cause.message : ""}`.trim(),
    );
    this.name = "TaskStatusNotSetError";
    this.createdId = createdId;
    this.cause = cause;
  }
}

export interface CreateTaskArgs {
  tab: ChecklistTab;
  clusterId: string;
  form: TaskForm;
  order: number;
}

/**
 * W-2, Add mode. KEEPS the canvas create-then-update sequence on purpose (DR-6, D-3): the
 * sync flow copies `statecode` to project checklists only on Update, so a single create of an
 * Inactive task would produce Active project tasks.
 */
export async function createTask(
  args: CreateTaskArgs, repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<string> {
  const id = await repo.createTask(buildCreatePayload(args.tab, args.clusterId, args.form, args.order));
  try {
    await repo.updateTask(id, statusPayload(args.form.isActive));
  } catch (error) {
    throw new TaskStatusNotSetError(id, error);
  }
  return id;
}

/** W-2, Edit mode. */
export async function updateTask(
  id: string, form: TaskForm, tab: ChecklistTab | undefined,
  repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<void> {
  await repo.updateTask(id, buildEditPayload(form, tab));
}

/** W-1 / DR-9: `null` becomes `true`. */
export async function toggleCompletionDate(
  task: Pick<ChecklistTask, "id" | "isCompletionDate">,
  repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<void> {
  await repo.updateTask(task.id, { vsb_iscompletiondate: !(task.isCompletionDate ?? false) });
}

/** W-4 / DR-9: statecode AND statuscode, consistent with the form save. */
export async function setTaskActive(
  id: string, isActive: boolean, repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<void> {
  await repo.updateTask(id, statusPayload(isActive));
}

/** Per-row Order writes are bounded; each row starts one flow run (D-6). */
export const ORDER_WRITE_CONCURRENCY = 4;

/**
 * W-3 / DR-7: writes only the rows whose Order changed, one PATCH per row by id (the canvas'
 * non-delegable `UpdateIf` is gone). `UpdateMultiple` is not used: it is not proven against
 * this table and the table is not yet registered (see the build log). Throws `BulkWriteError`
 * with `partial` true when some rows were written before the failure.
 */
export async function writeOrders(
  rows: readonly OrderPatch[], repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<void> {
  if (rows.length === 0) return;
  let landed = 0;
  try {
    await forEachLimit(rows, async (row) => {
      await repo.updateTask(row.id, { vsb_order: row.order });
      landed += 1;
    }, ORDER_WRITE_CONCURRENCY);
  } catch (error) {
    throw new BulkWriteError(error, landed > 0);
  }
}

/** Step 2 of the soft delete failed after step 1 succeeded (AC-11.3). */
export class RenumberAfterDeleteError extends Error {
  override readonly cause?: unknown;
  constructor(cause: unknown) {
    super("The checklist item was deleted, but the order of the remaining items may be out of date.");
    this.name = "RenumberAfterDeleteError";
    this.cause = cause;
  }
}

/**
 * W-5 / DR-8: the canvas SOFT delete. Sets `vsb_todelete`; the sync flow removes the project
 * copies and then deletes the template row itself. The client never hard-deletes (D-17).
 * Step 2 (close the Order gap) runs ONLY if step 1 succeeded (AC-11.2).
 */
export async function softDeleteTask(
  id: string, renumber: readonly OrderPatch[],
  repo: ChecklistRepository = dataverseChecklistRepository,
): Promise<void> {
  await repo.updateTask(id, { vsb_todelete: true });
  try {
    await writeOrders(renumber, repo);
  } catch (error) {
    throw new RenumberAfterDeleteError(error);
  }
}
