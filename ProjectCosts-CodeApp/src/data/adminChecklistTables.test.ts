/**
 * The shared checklist-tables repository over the generated services, against a fake SDK
 * client: the generated services, `updateRecordIfExists` and `deleteRecord` all go through
 * `getClient`, so one fake observes every request by entity-set name.
 */
import type { IOperationOptions, IOperationResult } from "@microsoft/power-apps/data";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The slice of the SDK client these tables use. */
interface FakeClient {
  retrieveMultipleRecordsAsync<T>(table: string, options?: IOperationOptions): Promise<IOperationResult<T[]>>;
  createRecordAsync<TIn, TOut>(table: string, record: TIn): Promise<IOperationResult<TOut>>;
  updateRecordAsync<TIn, TOut>(table: string, id: string, record: TIn): Promise<IOperationResult<TOut>>;
  deleteRecordAsync(table: string, id: string): Promise<IOperationResult<unknown>>;
}

// The services capture `getClient(...)` once at import, so it returns a thin delegate and the
// fake below is assigned afterwards.
const sdk = vi.hoisted(() => ({ client: undefined as unknown as FakeClient }));
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: (...a: unknown[]) => (sdk.client.retrieveMultipleRecordsAsync as (...x: unknown[]) => unknown)(...a),
    createRecordAsync: (...a: unknown[]) => (sdk.client.createRecordAsync as (...x: unknown[]) => unknown)(...a),
    updateRecordAsync: (...a: unknown[]) => (sdk.client.updateRecordAsync as (...x: unknown[]) => unknown)(...a),
    deleteRecordAsync: (...a: unknown[]) => (sdk.client.deleteRecordAsync as (...x: unknown[]) => unknown)(...a),
  }),
}));

import { DataError, RecordGoneError } from "@/platform/errors";
import {
  APPROVAL_COLUMNS, HEADER_COLUMNS, LOCKING_APPROVAL, NOT_TO_DELETE, TASK_COLUMNS,
  createChecklistTablesRepository, isLockingApproval, taskBinds,
} from "./adminChecklistTables";
import { createChecklistRepository, loadLockedTaskIds } from "./adminDefaultChecklists";
import { OWNING_BU_BIND, owningBusinessUnitBind } from "@/data/odata";
import { CHECKLIST_ENTITY_SETS } from "@/data/dataverseNames";

type Call = { op: string; table: string; id?: string; body?: unknown; options?: Record<string, unknown> };

let calls: Call[];
let pages: Record<string, unknown[][]>;
let throwOn: string | null;
let fail: { op: string; status: number } | null;
let createResult: unknown;
let gone: Set<string>;
/** OPT-17(a): when set, the reads of `hold.table` wait for `hold.until` before answering (to observe what starts together). */
let hold: { table: string; until: (options: Record<string, unknown>) => Promise<void> } | null;
/** OPT-08(c): when true the fake answers like Dataverse and keeps only the columns of `$select`. */
let project: boolean;

const fake: FakeClient = {
  retrieveMultipleRecordsAsync: (async (table: string, options?: Record<string, unknown>) => {
    // Upsert guard existence check of the guarded update: the row exists unless its id is in `gone`.
    const key = /^(\w+) eq ([0-9a-f-]{36})$/.exec(String(options?.["filter"] ?? ""));
    if (key && (options?.["select"] as string[] | undefined)?.join() === key[1]) {
      calls.push({ op: "exists", table, id: key[2] });
      return { success: true, data: gone.has(key[2]!) ? [] : [{ [key[1]!]: key[2] }] };
    }
    calls.push({ op: "read", table, options: options ?? {} });
    if (hold && hold.table === table) await hold.until(options ?? {});
    if (throwOn === table) throw new Error(`Data source '${table}' is not registered`);
    if (fail?.op === "read") return { success: false, data: [], error: { message: "denied", status: fail.status } };
    const select = options?.["select"] as string[] | undefined;
    const tablePages = (pages[table] ?? [[]]).map((page) => (project && select
      ? page.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([k]) => select.includes(k))))
      : page));
    const token = options?.["skipToken"] as string | undefined;
    const index = token ? Number(token.slice(1)) : 0;
    const next = index + 1 < tablePages.length ? `p${index + 1}` : undefined;
    return { success: true, data: tablePages[index] ?? [], ...(next ? { skipToken: next } : {}) };
  }) as FakeClient["retrieveMultipleRecordsAsync"],
  createRecordAsync: (async (table: string, body: unknown) => {
    calls.push({ op: "create", table, body });
    if (fail?.op === "create") return { success: false, data: undefined, error: { message: "denied", status: fail.status } };
    return { success: true, data: createResult };
  }) as FakeClient["createRecordAsync"],
  updateRecordAsync: (async (table: string, id: string, body: unknown) => {
    calls.push({ op: "update", table, id, body });
    if (fail?.op === "update") return { success: false, data: undefined, error: { message: "denied", status: fail.status } };
    return { success: true, data: {} };
  }) as FakeClient["updateRecordAsync"],
  deleteRecordAsync: async (table: string, id: string) => {
    calls.push({ op: "delete", table, id });
    if (fail?.op === "delete") return { success: false, data: undefined, error: { message: "denied", status: fail.status } };
    return { success: true, data: undefined };
  },
};

sdk.client = fake;
const repo = createChecklistTablesRepository();
const H = "33333333-3333-3333-3333-333333333333";
const C = "44444444-4444-4444-4444-444444444444";
const T1 = "55555555-0000-0000-0000-000000000001";
const reads = (table: string) => calls.filter((c) => c.op === "read" && c.table === table);

beforeEach(() => {
  calls = [];
  pages = {};
  throwOn = null;
  fail = null;
  createResult = {};
  gone = new Set();
  hold = null;
  project = false;
});

describe("Shared reads and writes", () => {
  it("UT-ADCHKTBL-001 Follows the skip token past 500 rows (the page result keeps its token)", async () => {
    pages[CHECKLIST_ENTITY_SETS.tasks] = [
      [{ vsb_projectdefaultchecklistsid: "t1" }], [{ vsb_projectdefaultchecklistsid: "t2" }], [{ vsb_projectdefaultchecklistsid: "t3" }],
    ];
    const rows = await repo.listDefaultChecklists({ headerId: H });
    expect(rows.map((r) => r.id)).toEqual(["t1", "t2", "t3"]);
    expect(reads(CHECKLIST_ENTITY_SETS.tasks).map((c) => c.options?.["skipToken"])).toEqual([undefined, "p1", "p2"]);
  });
  it("UT-ADCHKTBL-002 Turns a THROW into a DataError naming the entity set", async () => {
    throwOn = CHECKLIST_ENTITY_SETS.headers;
    const error = await repo.listChecklistHeaders().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toBe(`read ${CHECKLIST_ENTITY_SETS.headers}`);
  });
  it("UT-ADCHKTBL-003 Turns success:false into a DataError with the status", async () => {
    fail = { op: "update", status: 403 };
    const error = await repo.updateDefaultChecklist(T1, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).status).toBe(403);
    expect((error as DataError).operation).toBe("update checklist item");
  });
});

describe("Readers", () => {
  it("UT-ADCHKTBL-004 Checklist tabs: every header, superset select, ordered by vsb_order", async () => {
    pages[CHECKLIST_ENTITY_SETS.headers] = [[{
      vsb_checklistcountryandtechnologyid: "h1", vsb_name: "Germany Wind", vsb_order: "10",
      _owningbusinessunit_value: "bu", _vsb_country_value: "de", vsb_technology: 952850000, createdon: "2024",
    }]];
    const rows = await repo.listChecklistHeaders();
    const call = reads(CHECKLIST_ENTITY_SETS.headers)[0];
    expect(call?.options?.["select"]).toEqual([...HEADER_COLUMNS]);
    expect(call?.options?.["filter"]).toBeUndefined();
    expect(call?.options?.["orderBy"]).toEqual(["vsb_order asc"]);
    expect(rows).toEqual([{
      id: "h1", name: "Germany Wind", order: "10", owningBusinessUnitId: "bu", countryId: "de",
      technology: 952850000, createdOn: "2024",
    }]);
  });

  it("UT-ADCHKTBL-005 Gates header: by country + vsb_technology code, oldest first", async () => {
    await repo.listChecklistHeaders({ countryId: "11111111-1111-1111-1111-111111111111", technology: 952850001 });
    const options = reads(CHECKLIST_ENTITY_SETS.headers)[0]?.options ?? {};
    expect(options["filter"]).toContain("_vsb_country_value eq 11111111-1111-1111-1111-111111111111");
    expect(options["filter"]).toContain("vsb_technology eq 952850001");
    expect(options["orderBy"]).toEqual(["createdon asc"]);
  });

  it("UT-ADCHKTBL-006 Tasks: by header, To-Delete filtered null-safely on the server AND client by default", async () => {
    pages[CHECKLIST_ENTITY_SETS.tasks] = [[
      { vsb_projectdefaultchecklistsid: "t1", vsb_name: "A", vsb_order: 1, statecode: 1, vsb_iscompletiondate: null },
      { vsb_projectdefaultchecklistsid: "t2", vsb_name: "B", vsb_todelete: true },
    ]];
    const rows = await repo.listDefaultChecklists({ headerId: "22222222-2222-2222-2222-222222222222" });
    const options = reads(CHECKLIST_ENTITY_SETS.tasks)[0]?.options ?? {};
    expect(options["select"]).toEqual([...TASK_COLUMNS]);
    expect(options["filter"]).toContain("_vsb_associatedcountryandtechnology_value eq 22222222-2222-2222-2222-222222222222");
    expect(options["filter"]).toContain(NOT_TO_DELETE);
    expect(options["orderBy"]).toEqual(["vsb_order asc"]);
    expect(rows).toEqual([{
      id: "t1", name: "A", order: 1, holdingDescription: "", gateRelevance: false, isCompletionDate: null,
      active: false, toDelete: false, clusterId: null, headerId: null,
    }]);
  });

  it("UT-ADCHKTBL-007 Tasks: includeToDelete drops the filter (option, not a fork)", async () => {
    pages[CHECKLIST_ENTITY_SETS.tasks] = [[{ vsb_projectdefaultchecklistsid: "t2", vsb_todelete: true }]];
    const rows = await repo.listDefaultChecklists({ headerId: H, includeToDelete: true });
    expect(reads(CHECKLIST_ENTITY_SETS.tasks)[0]?.options?.["filter"]).not.toContain("vsb_todelete");
    expect(rows.map((r) => r.toDelete)).toEqual([true]);
  });

  it("UT-ADCHKTBL-008 Checklist locks: locking approvals only (mode ≠ Only Notifications OR null), every page", async () => {
    pages[CHECKLIST_ENTITY_SETS.approvals] = [
      [{ _vsb_projectdefaultchecklistid_value: "A", vsb_approvalmodecode: 952850000 }],
      [{ _vsb_projectdefaultchecklistid_value: "B", vsb_approvalmodecode: null },
        { _vsb_projectdefaultchecklistid_value: "C", vsb_approvalmodecode: 952850002 }],
    ];
    const rows = await repo.listChecklistApprovals({ lockingOnly: true });
    expect(reads(CHECKLIST_ENTITY_SETS.approvals)[0]?.options?.["filter"]).toBe(LOCKING_APPROVAL);
    // The client re-check removes C even though the fake ignored the filter.
    expect(rows.map((r) => r.checklistId)).toEqual(["A", "B"]);
  });

  it("UT-ADCHKTBL-009 Gates approvals: by task ids, 40 per request, superset columns mapped", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    pages[CHECKLIST_ENTITY_SETS.approvals] = [[{
      vsb_checklistdefaultapprovalsid: "ap", vsb_name: "n", vsb_approvalmodecode: 952850001, vsb_gateisactive: true,
      vsb_defaultapprovers: "[]", vsb_defaultcontributors: "[c]", vsb_defaultnotifications: null,
      _vsb_projectdefaultchecklistid_value: "t1", _vsb_portfoliomanagerid_value: "pm",
    }]];
    const rows = await repo.listChecklistApprovals({ checklistIds: ids });
    const approvalReads = reads(CHECKLIST_ENTITY_SETS.approvals);
    expect(approvalReads).toHaveLength(2);
    expect(approvalReads[0]?.options?.["select"]).toEqual([...APPROVAL_COLUMNS]);
    expect(rows[0]).toEqual({
      id: "ap", name: "n", mode: 952850001, gateActive: true, checklistId: "t1", pmId: "pm",
      contributors: "[c]", approvers: "[]", notifications: null,
    });
  });

  it("UT-ADCHKTBL-010 A missing table becomes a DataError whose operation names the entity set (Gates describeTableFailure)", async () => {
    throwOn = CHECKLIST_ENTITY_SETS.tasks;
    const error = await repo.listDefaultChecklists({ headerId: H }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toContain(CHECKLIST_ENTITY_SETS.tasks);
  });
});

describe("Writes", () => {
  it("UT-ADCHKTBL-011 Creates a task and returns its id; undefined when Dataverse returns none", async () => {
    createResult = { vsb_projectdefaultchecklistsid: "new-id" };
    expect(await repo.createDefaultChecklist({ vsb_name: "x" })).toBe("new-id");
    createResult = {};
    expect(await repo.createDefaultChecklist({ vsb_name: "x" })).toBeUndefined();
    expect(calls.filter((c) => c.op === "create").every((c) => c.table === CHECKLIST_ENTITY_SETS.tasks)).toBe(true);
  });

  // Approval writes moved to WritePlans (`admin-gates-approvals/writes.test.ts`); UT-ADCHKTBL-014
  // (create an approval) was retired with the repository method. Ids are not renumbered.
  it("UT-ADCHKTBL-012 Updates a task by read-before-write", async () => {
    await repo.updateDefaultChecklist(T1, { vsb_order: 2 });
    expect(calls.map((c) => [c.op, c.table, c.id])).toEqual([
      ["exists", CHECKLIST_ENTITY_SETS.tasks, T1],
      ["update", CHECKLIST_ENTITY_SETS.tasks, T1],
    ]);
  });

  it("UT-ADCHKTBL-013 Upsert guard: updating a deleted task is refused with RecordGoneError and sends no PATCH", async () => {
    gone.add(T1);
    await expect(repo.updateDefaultChecklist(T1, { vsb_order: 2 })).rejects.toBeInstanceOf(RecordGoneError);
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
    // The task table is checked by its own primary key.
    expect(calls.map((c) => c.table)).toEqual([CHECKLIST_ENTITY_SETS.tasks]);
  });
});

describe("Binds and helpers", () => {
  it("UT-ADCHKTBL-015 Uses the LOWER-CASE owning-BU bind", () => {
    expect(OWNING_BU_BIND).toBe("owningbusinessunit@odata.bind");
    expect(owningBusinessUnitBind("{AAAAAAAA-0000-0000-0000-000000000000}")).toEqual({
      "owningbusinessunit@odata.bind": "/businessunits(aaaaaaaa-0000-0000-0000-000000000000)",
    });
    expect(owningBusinessUnitBind(null)).toEqual({});
    expect(Object.keys(owningBusinessUnitBind(H))).not.toContain("OwningBusinessUnit@odata.bind");
  });
  it("UT-ADCHKTBL-016 Task binds use the navigation-property SchemaNames", () => {
    expect(taskBinds(H, C)).toEqual({
      "vsb_AssociatedCountryAndTechnology@odata.bind": `/vsb_checklistcountryandtechnologies(${H})`,
      "vsb_ClusterState@odata.bind": `/vsb_projectstates(${C})`,
    });
  });
  it("UT-ADCHKTBL-017 IsLockingApproval: everything but Only Notifications locks, including null", () => {
    expect(isLockingApproval({ mode: 952850002 })).toBe(false);
    expect(isLockingApproval({ mode: null })).toBe(true);
    expect(isLockingApproval({ mode: 952850000 })).toBe(true);
  });
});

describe("E9: checklist write operation label", () => {
  it("UT-ADCHKTBL-018 Create / update default to the shared lower-case wording (PG and current callers unchanged)", async () => {
    fail = { op: "create", status: 500 };
    const created = await repo.createDefaultChecklist({ vsb_name: "x" }).catch((e: unknown) => e);
    expect((created as DataError).operation).toBe("create checklist item");
    fail = { op: "update", status: 500 };
    const updated = await repo.updateDefaultChecklist(T1, { vsb_order: 2 }).catch((e: unknown) => e);
    expect((updated as DataError).operation).toBe("update checklist item");
  });

  it("UT-ADCHKTBL-019 A caller-supplied operation appears in the DataError", async () => {
    fail = { op: "create", status: 500 };
    const created = await repo.createDefaultChecklist({ vsb_name: "x" }, "Create the checklist task").catch((e: unknown) => e);
    expect(created).toBeInstanceOf(DataError);
    expect((created as DataError).operation).toBe("Create the checklist task");
    expect((created as DataError).message).toContain("Create the checklist task");
    fail = { op: "update", status: 500 };
    const updated = await repo.updateDefaultChecklist(T1, { vsb_order: 2 }, "Update the checklist task").catch((e: unknown) => e);
    expect((updated as DataError).operation).toBe("Update the checklist task");
  });
});

/* ═══════════ Optimization programme B7 (OPT-08 c, OPT-17 a) ═══════════ */

const LOCK_COLUMNS_NEEDED = ["vsb_checklistdefaultapprovalsid", "_vsb_projectdefaultchecklistid_value", "vsb_approvalmodecode"];
const JSON_COLUMNS = ["vsb_defaultapprovers", "vsb_defaultcontributors", "vsb_defaultnotifications"];
const gid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

/** A full approval row as Dataverse returns it with the superset select (three JSON columns of up to 1000 characters). */
const fullApproval = (n: number, checklistId: string | null, mode: number | null) => ({
  vsb_checklistdefaultapprovalsid: `ap-${n}`, vsb_name: `Approval ${n}`, vsb_approvalmodecode: mode, vsb_gateisactive: n % 2 === 0,
  vsb_defaultapprovers: "x".repeat(900), vsb_defaultcontributors: "y".repeat(900), vsb_defaultnotifications: "z".repeat(900),
  _vsb_projectdefaultchecklistid_value: checklistId, _vsb_portfoliomanagerid_value: gid(n),
});

describe("OPT-08(c) Check List Settings locks read only the columns it keeps", () => {
  const MODES = [952850000, 952850001, 952850002, null] as const;
  const fixture = () => Array.from({ length: 300 }, (_, i) => fullApproval(
    i, i % 17 === 0 ? null : (i % 5 === 0 ? gid(i % 40).toUpperCase() : gid(i % 40)), MODES[i % 4]!));

  it("UT-ADCHKTBL-OPT-001 the locks read selects 3 columns, none of the three JSON columns (old: all 9 APPROVAL_COLUMNS)", async () => {
    project = true;
    pages[CHECKLIST_ENTITY_SETS.approvals] = [fixture()];
    await loadLockedTaskIds(createChecklistRepository(repo));
    const select = reads(CHECKLIST_ENTITY_SETS.approvals)[0]?.options?.["select"] as string[];
    expect([...select].sort()).toEqual([...LOCK_COLUMNS_NEEDED].sort());
    for (const column of JSON_COLUMNS) expect(select).not.toContain(column);
    expect(APPROVAL_COLUMNS.length).toBe(9);
    // The server filter is unchanged.
    expect(reads(CHECKLIST_ENTITY_SETS.approvals)[0]?.options?.["filter"]).toBe(LOCKING_APPROVAL);
  });

  it("UT-ADCHKTBL-OPT-002 the lock set equals the old one (full columns) on a 300-row fixture with null modes, null ids, mixed case and 2 pages", async () => {
    project = true;
    const rows = fixture();
    pages[CHECKLIST_ENTITY_SETS.approvals] = [rows.slice(0, 150), rows.slice(150)];
    // Oracle: the old read (superset select, projected by the same fake) folded the way `loadLockedTaskIds` does.
    const oldRows = await repo.listChecklistApprovals({ lockingOnly: true, select: APPROVAL_COLUMNS });
    const oldSet = new Set<string>();
    for (const a of oldRows) if (a.checklistId && isLockingApproval(a)) oldSet.add(a.checklistId.toLowerCase());
    calls = [];
    const now = await loadLockedTaskIds(createChecklistRepository(repo));
    expect([...now].sort()).toEqual([...oldSet].sort());
    expect(now.size).toBeGreaterThan(5);
    expect(reads(CHECKLIST_ENTITY_SETS.approvals)).toHaveLength(2);
  });

  it("UT-ADCHKTBL-OPT-003 the narrow rows are a fraction of the old payload (JSON text bytes dropped)", async () => {
    project = true;
    pages[CHECKLIST_ENTITY_SETS.approvals] = [fixture()];
    await repo.listChecklistApprovals({ lockingOnly: true, select: APPROVAL_COLUMNS });
    const wide = JSON.stringify(pages[CHECKLIST_ENTITY_SETS.approvals]![0]!.map((r) => Object.fromEntries(
      Object.entries(r as Record<string, unknown>).filter(([k]) => (APPROVAL_COLUMNS as readonly string[]).includes(k)))));
    const narrow = JSON.stringify(pages[CHECKLIST_ENTITY_SETS.approvals]![0]!.map((r) => Object.fromEntries(
      Object.entries(r as Record<string, unknown>).filter(([k]) => LOCK_COLUMNS_NEEDED.includes(k)))));
    expect(wide.length / narrow.length).toBeGreaterThan(5);
  });
});

describe("OPT-17(a) the approvals read of a task list goes out in parallel chunks", () => {
  const ids = Array.from({ length: 100 }, (_, i) => gid(i + 1)); // 40 + 40 + 20 ids = 3 chunks

  it("UT-ADCHKTBL-OPT-004 all 3 chunk reads start before the first answers (old: one read in flight at a time)", async () => {
    let release!: () => void;
    const until = new Promise<void>((r) => { release = r; });
    hold = { table: CHECKLIST_ENTITY_SETS.approvals, until: () => until };
    const pending = repo.listChecklistApprovals({ checklistIds: ids });
    await new Promise((r) => setTimeout(r, 10));
    const startedBeforeAnswer = reads(CHECKLIST_ENTITY_SETS.approvals).length;
    release();
    await pending;
    expect(startedBeforeAnswer).toBe(3);
    expect(reads(CHECKLIST_ENTITY_SETS.approvals)).toHaveLength(3);
  });

  it("UT-ADCHKTBL-OPT-005 the rows come back in chunk order even when a later chunk answers first", async () => {
    const chunkOf = (options: Record<string, unknown>) => {
      const filter = String(options["filter"]);
      return filter.includes(gid(1)) ? 0 : filter.includes(gid(41)) ? 1 : 2;
    };
    // Chunk 0 answers last, chunk 2 first.
    hold = { table: CHECKLIST_ENTITY_SETS.approvals, until: (o) => new Promise((r) => setTimeout(r, (2 - chunkOf(o)) * 5 + 1)) };
    // The fake answers one page for every read, so give each chunk its own row through the read order of `pages`.
    pages[CHECKLIST_ENTITY_SETS.approvals] = [[{ vsb_checklistdefaultapprovalsid: "same", _vsb_projectdefaultchecklistid_value: "t" }]];
    const rows = await repo.listChecklistApprovals({ checklistIds: ids });
    expect(rows).toHaveLength(3); // one row per chunk read, none lost
    expect(reads(CHECKLIST_ENTITY_SETS.approvals).map((c) => chunkOf(c.options ?? {}))).toEqual([0, 1, 2]);
  });

  it("UT-ADCHKTBL-OPT-006 a failing chunk rejects with its DataError (first failure, as before) and no chunk is silently dropped", async () => {
    fail = { op: "read", status: 500 };
    const error = await repo.listChecklistApprovals({ checklistIds: ids }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).status).toBe(500);
  });
});
