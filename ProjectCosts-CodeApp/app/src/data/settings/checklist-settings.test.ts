/**
 * Check List Settings data module, against a mocked SDK client (the three tables have no
 * generated service yet) and a mocked `Vsb_projectstatesService`. Covers DR-1, DR-4, DR-6,
 * DR-7, DR-8, DR-9 and AC-11.2 / AC-11.3 of `06-code-app-requirements/01-build-requirements.md`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { op: string; table: string; id?: string; body?: unknown; options?: Record<string, unknown> };

const calls: Call[] = [];
let rowsByTable: Record<string, unknown[]> = {};
/** Return `{success:false}` for the Nth update call (1-based), or throw for a table read. */
let failUpdateAt: number[] = [];
let throwOnRead: string | null = null;
let failStatus: number | undefined;
let updateCount = 0;
/**
 * Multi-page reads (gap B-1): when set for a table, the read with no `skipToken` returns
 * page 0, and a read carrying `skipToken: "p<n>"` returns page n. Each page except the last
 * carries the token of the next one.
 */
let pagesByTable: Record<string, unknown[][]> = {};
let createReturnsNoId = false;
/** V-1: ids reported deleted by the pre-update existence check, and the checks made. */
let goneIds = new Set<string>();
let existenceChecks: { table: string; id: string }[] = [];

const client = {
  retrieveMultipleRecordsAsync: vi.fn(async (table: string, options: Record<string, unknown>) => {
    // V-1 existence check of the guarded update (`updateRecordIfExists`): the row exists unless
    // its id is in `goneIds`. Recorded in `existenceChecks`, not `calls`, so sequences are unchanged.
    const key = /^(\w+) eq ([0-9a-f-]{36})$/.exec(String(options?.filter ?? ""));
    if (key && (options?.select as string[] | undefined)?.join() === key[1]) {
      existenceChecks.push({ table, id: key[2]! });
      return { success: true, data: goneIds.has(key[2]!) ? [] : [{ [key[1]!]: key[2] }] };
    }
    calls.push({ op: "read", table, options });
    if (throwOnRead === table) throw new Error(`Data source '${table}' is not registered`);
    const pages = pagesByTable[table];
    if (pages) {
      const token = options.skipToken as string | undefined;
      const index = token ? Number(token.slice(1)) : 0;
      const next = index + 1 < pages.length ? `p${index + 1}` : undefined;
      return { success: true, data: pages[index] ?? [], ...(next ? { skipToken: next } : {}) };
    }
    return { success: true, data: rowsByTable[table] ?? [] };
  }),
  createRecordAsync: vi.fn(async (table: string, body: unknown) => {
    calls.push({ op: "create", table, body });
    if (createReturnsNoId) return { success: true, data: {} };
    return { success: true, data: { vsb_projectdefaultchecklistsid: "11111111-1111-1111-1111-111111111111" } };
  }),
  updateRecordAsync: vi.fn(async (table: string, id: string, body: unknown) => {
    updateCount += 1;
    calls.push({ op: "update", table, id, body });
    if (failUpdateAt.includes(updateCount)) {
      return { success: false, data: undefined, error: { message: "denied", status: failStatus } };
    }
    return { success: true, data: {} };
  }),
  deleteRecordAsync: vi.fn(async () => { calls.push({ op: "delete", table: "?" }); return { success: true }; }),
  retrieveRecordAsync: vi.fn(),
  executeAsync: vi.fn(),
};

// `getClient` is called at import time by other generated services; resolve lazily.
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => hoisted.client() }));
const hoisted = vi.hoisted(() => {
  let current: unknown = {};
  return { client: () => current, set: (c: unknown) => { current = c; } };
});
hoisted.set(client);

vi.mock("@/generated/services/Vsb_projectstatesService", () => ({
  Vsb_projectstatesService: {
    getAll: vi.fn(async (options: Record<string, unknown>) => {
      calls.push({ op: "read", table: "vsb_projectstates", options });
      return { success: true, data: [{ vsb_projectstateid: "c1", vsb_name: "Draft", vsb_order: 0 }] };
    }),
  },
}));

import { CHECKLIST_ENTITY_SETS, HEADER_COLUMNS } from "./checklistTables";
import {
  RenumberAfterDeleteError, TaskCreatedIdUnknownError, TaskStatusNotSetError,
  buildCreatePayload, buildEditPayload, createTask, loadClusters, loadLockedTaskIds, loadTabs,
  loadTasks, setTaskActive, softDeleteTask, toggleCompletionDate, updateTask, writeOrders,
  type ChecklistTab, type TaskForm,
} from "./checklist-settings";
import { BulkWriteError } from "../bulkWrite";
import { DataError, RecordGoneError } from "@/platform/errors";

const { tasks: ES_TASKS, headers: ES_TABS, approvals: ES_LOCKS } = CHECKLIST_ENTITY_SETS;

const TAB: ChecklistTab = {
  id: "AAAAAAAA-0000-0000-0000-000000000001", name: "DE Wind", order: "1",
  owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-000000000001",
};
const CLUSTER = "cccccccc-0000-0000-0000-000000000001";
const FORM: TaskForm = {
  name: "  Site identified ", holdingDescription: " hold ", gateRelevance: true,
  isCompletionDate: false, isActive: false,
};
const ID = (n: number) => `dddddddd-0000-0000-0000-${String(n).padStart(12, "0")}`;

const reads = (table: string) => calls.filter((c) => c.op === "read" && c.table === table);
const updates = () => calls.filter((c) => c.op === "update");

beforeEach(() => {
  calls.length = 0;
  rowsByTable = {};
  failUpdateAt = [];
  throwOnRead = null;
  failStatus = undefined;
  updateCount = 0;
  pagesByTable = {};
  createReturnsNoId = false;
  goneIds = new Set();
  existenceChecks = [];
});

describe("reads (DR-1 … DR-4)", () => {
  it("DR-1: every read passes a non-empty select", async () => {
    await loadTabs();
    await loadClusters();
    await loadTasks(TAB.id);
    await loadLockedTaskIds();
    const allReads = calls.filter((c) => c.op === "read");
    expect(allReads).toHaveLength(4);
    for (const read of allReads) {
      const select = read.options?.select as string[] | undefined;
      expect(Array.isArray(select)).toBe(true);
      expect(select?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("DR-2: tabs read every row ordered by vsb_order, with no filter (D-9)", async () => {
    rowsByTable[ES_TABS] = [{ vsb_checklistcountryandtechnologyid: "t1", vsb_name: "A", vsb_order: "10", _owningbusinessunit_value: "bu" }];
    const tabs = await loadTabs();
    const opts = reads(ES_TABS)[0]?.options;
    // Shared superset select (M9): this screen's four columns plus Project Gates' three.
    expect(opts?.select).toEqual([...HEADER_COLUMNS]);
    expect(opts?.select).toEqual(expect.arrayContaining(["vsb_checklistcountryandtechnologyid", "vsb_name", "vsb_order", "_owningbusinessunit_value"]));
    expect(opts?.filter).toBeUndefined();
    expect(opts?.orderBy).toEqual(["vsb_order asc"]);
    expect(tabs).toEqual([{ id: "t1", name: "A", order: "10", owningBusinessUnitId: "bu" }]);
  });

  it("DR-3: clusters filter on vsb_isvisibleonchecklist", async () => {
    const clusters = await loadClusters();
    const opts = reads("vsb_projectstates")[0]?.options;
    expect(opts?.filter).toBe("vsb_isvisibleonchecklist eq true");
    expect(opts?.orderBy).toEqual(["vsb_order asc"]);
    expect(clusters).toEqual([{ id: "c1", name: "Draft", order: 0 }]);
  });

  it("DR-4: one task query per tab, null-safe To Delete clause, rows mapped", async () => {
    rowsByTable[ES_TASKS] = [
      { vsb_projectdefaultchecklistsid: "x", vsb_name: "N", vsb_order: 2, statecode: 1, vsb_todelete: null, vsb_iscompletiondate: null, _vsb_clusterstate_value: "c" },
      { vsb_projectdefaultchecklistsid: "y", vsb_todelete: true },
    ];
    const tasks = await loadTasks(TAB.id);
    const opts = reads(ES_TASKS)[0]?.options;
    expect(reads(ES_TASKS)).toHaveLength(1);
    expect(opts?.filter).toBe(
      "(_vsb_associatedcountryandtechnology_value eq aaaaaaaa-0000-0000-0000-000000000001) and " +
      "((vsb_todelete eq false) or (vsb_todelete eq null))",
    );
    expect(opts?.select).toContain("vsb_todelete");
    expect(opts?.select).toContain("_vsb_clusterstate_value");
    expect(tasks).toHaveLength(1); // the To Delete row is dropped defensively too
    expect(tasks[0]).toMatchObject({ id: "x", name: "N", order: 2, isActive: false, isCompletionDate: null, toDelete: false, clusterId: "c" });
  });

  it("DR-4 / FR-5: locks — mode ≠ Only Notifications OR null; null mode locks; Only Notifications does not", async () => {
    rowsByTable[ES_LOCKS] = [
      { _vsb_projectdefaultchecklistid_value: "T-FORMAL", vsb_approvalmodecode: 952850000 },
      { _vsb_projectdefaultchecklistid_value: "T-NULL", vsb_approvalmodecode: null },
      { _vsb_projectdefaultchecklistid_value: "T-NOTIFY", vsb_approvalmodecode: 952850002 },
      { _vsb_projectdefaultchecklistid_value: null, vsb_approvalmodecode: 952850000 },
    ];
    const locked = await loadLockedTaskIds();
    expect(reads(ES_LOCKS)[0]?.options?.filter).toBe(
      "(vsb_approvalmodecode ne 952850002) or (vsb_approvalmodecode eq null)",
    );
    expect([...locked].sort()).toEqual(["t-formal", "t-null"]);
  });

  it("an unregistered table surfaces as a DataError, not a crash", async () => {
    throwOnRead = ES_TASKS;
    await expect(loadTasks(TAB.id)).rejects.toBeInstanceOf(DataError);
  });

  it("a {success:false} page is still a DataError (unwrapped by fetchAll)", async () => {
    client.retrieveMultipleRecordsAsync.mockImplementationOnce(async (table: string, options: Record<string, unknown>) => {
      calls.push({ op: "read", table, options });
      return { success: false, data: undefined, error: { message: "not found" } } as never;
    });
    await expect(loadLockedTaskIds()).rejects.toBeInstanceOf(DataError);
  });
});

describe("paging (gap B-1 / DR-4 / AC-5.1): the skip token is followed past 500 rows", () => {
  it("locks: a task referenced only on page 2 is locked; the second read carries the token", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      _vsb_projectdefaultchecklistid_value: `L-${i}`, vsb_approvalmodecode: 952850000,
    }));
    pagesByTable[ES_LOCKS] = [page1, [{ _vsb_projectdefaultchecklistid_value: "T-PAGE2", vsb_approvalmodecode: null }]];
    const locked = await loadLockedTaskIds();
    expect(reads(ES_LOCKS)).toHaveLength(2);
    expect(reads(ES_LOCKS)[0]?.options?.skipToken).toBeUndefined();
    expect(reads(ES_LOCKS)[1]?.options?.skipToken).toBe("p1");
    // The same filter and select travel on every page.
    expect(reads(ES_LOCKS)[1]?.options?.filter).toBe(reads(ES_LOCKS)[0]?.options?.filter);
    expect(locked.size).toBe(501);
    expect(locked.has("t-page2")).toBe(true);
  });

  it("tasks: rows from all three pages are returned", async () => {
    const row = (id: string) => ({ vsb_projectdefaultchecklistsid: id, vsb_name: id, vsb_todelete: false });
    pagesByTable[ES_TASKS] = [
      Array.from({ length: 500 }, (_, i) => row(`a${i}`)),
      Array.from({ length: 500 }, (_, i) => row(`b${i}`)),
      [row("c0")],
    ];
    const tasks = await loadTasks(TAB.id);
    expect(reads(ES_TASKS).map((r) => r.options?.skipToken)).toEqual([undefined, "p1", "p2"]);
    expect(tasks).toHaveLength(1001);
    expect(tasks.at(-1)?.id).toBe("c0");
  });

  it("tabs: both pages are returned", async () => {
    pagesByTable[ES_TABS] = [
      [{ vsb_checklistcountryandtechnologyid: "t1", vsb_name: "A", vsb_order: "1" }],
      [{ vsb_checklistcountryandtechnologyid: "t2", vsb_name: "B", vsb_order: "2" }],
    ];
    const tabs = await loadTabs();
    expect(reads(ES_TABS)).toHaveLength(2);
    expect(tabs.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("create / edit payloads (DR-6)", () => {
  it("create payload: trimmed texts, binds, BU from the tab", () => {
    expect(buildCreatePayload(TAB, CLUSTER, FORM, 4)).toEqual({
      vsb_name: "Site identified",
      vsb_order: 4,
      "vsb_AssociatedCountryAndTechnology@odata.bind": "/vsb_checklistcountryandtechnologies(aaaaaaaa-0000-0000-0000-000000000001)",
      "vsb_ClusterState@odata.bind": "/vsb_projectstates(cccccccc-0000-0000-0000-000000000001)",
      vsb_holdingtaskdescription: "hold",
      vsb_gaterelevance: true,
      vsb_iscompletiondate: false,
      "owningbusinessunit@odata.bind": "/businessunits(bbbbbbbb-0000-0000-0000-000000000001)",
    });
  });

  it("create payload omits the BU bind when the tab has no BU", () => {
    expect(buildCreatePayload({ ...TAB, owningBusinessUnitId: null }, CLUSTER, FORM, 1)).not.toHaveProperty("owningbusinessunit@odata.bind");
  });

  it("edit payload: texts, flags, statecode/statuscode and BU", () => {
    expect(buildEditPayload({ ...FORM, isActive: true }, TAB)).toEqual({
      vsb_name: "Site identified",
      vsb_holdingtaskdescription: "hold",
      vsb_gaterelevance: true,
      vsb_iscompletiondate: false,
      statecode: 0,
      statuscode: 1,
      "owningbusinessunit@odata.bind": "/businessunits(bbbbbbbb-0000-0000-0000-000000000001)",
    });
  });

  it("B14: create and edit SEND the lower-case owningbusinessunit@odata.bind, never PascalCase", async () => {
    await createTask({ tab: TAB, clusterId: CLUSTER, form: FORM, order: 1 });
    await updateTask(ID(1), FORM, TAB);
    const created = calls.find((c) => c.op === "create")?.body as Record<string, unknown>;
    const edited = updates().at(-1)?.body as Record<string, unknown>;
    for (const body of [created, edited]) {
      expect(body["owningbusinessunit@odata.bind"]).toBe("/businessunits(bbbbbbbb-0000-0000-0000-000000000001)");
      expect(body).not.toHaveProperty("OwningBusinessUnit@odata.bind");
    }
  });

  it("createTask keeps the create → update sequence; the update carries the status (D-3)", async () => {
    const id = await createTask({ tab: TAB, clusterId: CLUSTER, form: FORM, order: 3 });
    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect(calls.map((c) => c.op)).toEqual(["create", "update"]);
    expect(calls[0]?.table).toBe(ES_TASKS);
    expect(calls[1]).toMatchObject({ table: ES_TASKS, id, body: { statecode: 1, statuscode: 2 } });
  });

  it("a failed status step reports the created id so the retry updates instead of duplicating", async () => {
    failUpdateAt = [1];
    const error = await createTask({ tab: TAB, clusterId: CLUSTER, form: FORM, order: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TaskStatusNotSetError);
    expect((error as TaskStatusNotSetError).createdId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("gap B-2: a create that succeeds without an id throws TaskCreatedIdUnknownError and sends nothing else", async () => {
    createReturnsNoId = true;
    const error = await createTask({ tab: TAB, clusterId: CLUSTER, form: FORM, order: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TaskCreatedIdUnknownError);
    expect(error).not.toBeInstanceOf(DataError);
    expect(calls.map((c) => c.op)).toEqual(["create"]);
  });

  it("AC-7.1: edit turning Active off sends 1/2, on sends 0/1", async () => {
    await updateTask(ID(1), { ...FORM, isActive: false }, TAB);
    await updateTask(ID(1), { ...FORM, isActive: true }, TAB);
    expect(updates().map((u) => (u.body as Record<string, unknown>).statecode)).toEqual([1, 0]);
    expect(updates().map((u) => (u.body as Record<string, unknown>).statuscode)).toEqual([2, 1]);
  });

  it("AC-1.2: a 403 becomes a forbidden DataError", async () => {
    failUpdateAt = [1];
    failStatus = 403;
    const error = await updateTask(ID(1), FORM, TAB).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).isForbidden).toBe(true);
  });

  it("V9: a failed edit names the capitalised operation 'Update checklist item'", async () => {
    failUpdateAt = [1];
    const error = await updateTask(ID(1), FORM, TAB).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toBe("Update checklist item");
    expect((error as DataError).message).toMatch(/^Update checklist item failed: /);
  });

  it("V9: a failed create names the capitalised operation 'Create checklist item'", async () => {
    client.createRecordAsync.mockResolvedValueOnce({ success: false, data: undefined, error: { message: "no" } } as never);
    const error = await createTask({ tab: TAB, clusterId: CLUSTER, form: FORM, order: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toBe("Create checklist item");
    expect((error as DataError).message).toMatch(/^Create checklist item failed: /);
  });
});

describe("completion and status writes (DR-9)", () => {
  it("AC-9.1: null Completion Date becomes true; true becomes false", async () => {
    await toggleCompletionDate({ id: ID(1), isCompletionDate: null });
    await toggleCompletionDate({ id: ID(2), isCompletionDate: true });
    expect(updates().map((u) => u.body)).toEqual([{ vsb_iscompletiondate: true }, { vsb_iscompletiondate: false }]);
  });

  it("AC-10.1: deactivating sends statecode 1 / statuscode 2", async () => {
    await setTaskActive(ID(1), false);
    await setTaskActive(ID(2), true);
    expect(updates().map((u) => u.body)).toEqual([{ statecode: 1, statuscode: 2 }, { statecode: 0, statuscode: 1 }]);
    expect(existenceChecks).toEqual([{ table: ES_TASKS, id: ID(1) }, { table: ES_TASKS, id: ID(2) }]);
  });

  it("V-1: a status write on a task deleted meanwhile is refused (RecordGoneError), never upserted", async () => {
    goneIds.add(ID(1));
    await expect(setTaskActive(ID(1), false)).rejects.toBeInstanceOf(RecordGoneError);
    expect(updates()).toEqual([]);
  });
});

describe("order writes and soft delete (DR-7, DR-8)", () => {
  it("writeOrders updates only the given rows by id; empty list writes nothing", async () => {
    await writeOrders([]);
    expect(calls).toHaveLength(0);
    await writeOrders([{ id: ID(3), order: 1 }, { id: ID(1), order: 2 }]);
    expect(updates().map((u) => [u.id, u.body])).toEqual([[ID(3), { vsb_order: 1 }], [ID(1), { vsb_order: 2 }]]);
  });

  it("a partial order write throws BulkWriteError with partial = true", async () => {
    failUpdateAt = [3];
    const error = await writeOrders([1, 2, 3].map((n) => ({ id: ID(n), order: n }))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulkWriteError);
    expect((error as BulkWriteError).partial).toBe(true);
  });

  it("AC-11.1: soft delete flags To Delete, then renumbers; never deletes", async () => {
    await softDeleteTask(ID(2), [{ id: ID(3), order: 2 }, { id: ID(4), order: 3 }]);
    expect(updates().map((u) => [u.id, u.body])).toEqual([
      [ID(2), { vsb_todelete: true }],
      [ID(3), { vsb_order: 2 }],
      [ID(4), { vsb_order: 3 }],
    ]);
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
  });

  it("parity R2 GAP-1: a blank-Order delete (empty renumber) sends only the To Delete flag", async () => {
    await softDeleteTask(ID(2), []);
    expect(updates().map((u) => [u.id, u.body])).toEqual([[ID(2), { vsb_todelete: true }]]);
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
  });

  it("parity R2 GAP-3: the created-but-not-confirmed text warns the status may not be set", () => {
    expect(new TaskCreatedIdUnknownError().message).toBe(
      "The item was created but could not be confirmed, so its status may not be set. " +
        "Check the list before adding it again, and set Active on the item if needed.",
    );
  });

  it("AC-11.2: if the flag write fails, the renumber is not sent", async () => {
    failUpdateAt = [1];
    await expect(softDeleteTask(ID(2), [{ id: ID(3), order: 2 }])).rejects.toBeInstanceOf(DataError);
    expect(updates()).toHaveLength(1);
  });

  it("AC-11.3: a renumber failure after a successful flag says the item was deleted", async () => {
    failUpdateAt = [2];
    const error = await softDeleteTask(ID(2), [{ id: ID(3), order: 2 }]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RenumberAfterDeleteError);
    expect((error as Error).message).toContain("was deleted");
  });
});
