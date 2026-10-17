/**
 * M9 — the shared checklist-tables repository and `rawTable`, against an injected fake client
 * (the three tables have no generated service yet).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

import { DataError, RecordGoneError } from "@/platform/errors";
import { rawTable, type RawClient } from "../rawTable";
import {
  APPROVAL_COLUMNS, CHECKLIST_ENTITY_SETS, HEADER_COLUMNS, LOCKING_APPROVAL, NOT_TO_DELETE, OWNING_BU_BIND,
  TASK_COLUMNS, createChecklistTablesRepository, isLockingApproval, owningBusinessUnitBind, taskBinds,
} from "./checklistTables";

type Call = { op: string; table: string; id?: string; body?: unknown; options?: Record<string, unknown> };

let calls: Call[];
let pages: Record<string, unknown[][]>;
let throwOn: string | null;
let fail: { op: string; status: number } | null;
let createResult: unknown;
let gone: Set<string>;

const fake: RawClient = {
  retrieveMultipleRecordsAsync: (async (table: string, options?: Record<string, unknown>) => {
    // V-1 existence check of the guarded update: the row exists unless its id is in `gone`.
    const key = /^(\w+) eq ([0-9a-f-]{36})$/.exec(String(options?.["filter"] ?? ""));
    if (key && (options?.["select"] as string[] | undefined)?.join() === key[1]) {
      calls.push({ op: "exists", table, id: key[2] });
      return { success: true, data: gone.has(key[2]!) ? [] : [{ [key[1]!]: key[2] }] };
    }
    calls.push({ op: "read", table, options: options ?? {} });
    if (throwOn === table) throw new Error(`Data source '${table}' is not registered`);
    if (fail?.op === "read") return { success: false, data: [], error: { message: "denied", status: fail.status } };
    const tablePages = pages[table] ?? [[]];
    const token = options?.["skipToken"] as string | undefined;
    const index = token ? Number(token.slice(1)) : 0;
    const next = index + 1 < tablePages.length ? `p${index + 1}` : undefined;
    return { success: true, data: tablePages[index] ?? [], ...(next ? { skipToken: next } : {}) };
  }) as RawClient["retrieveMultipleRecordsAsync"],
  createRecordAsync: (async (table: string, body: unknown) => {
    calls.push({ op: "create", table, body });
    if (fail?.op === "create") return { success: false, data: undefined, error: { message: "denied", status: fail.status } };
    return { success: true, data: createResult };
  }) as RawClient["createRecordAsync"],
  updateRecordAsync: (async (table: string, id: string, body: unknown) => {
    calls.push({ op: "update", table, id, body });
    if (fail?.op === "update") return { success: false, data: undefined, error: { message: "denied", status: fail.status } };
    return { success: true, data: {} };
  }) as RawClient["updateRecordAsync"],
  deleteRecordAsync: async (table: string, id: string) => {
    calls.push({ op: "delete", table, id });
    if (fail?.op === "delete") return { success: false, data: undefined, error: { message: "denied", status: fail.status } };
    return { success: true, data: undefined };
  },
};

const repo = createChecklistTablesRepository(() => fake);
const H = "33333333-3333-3333-3333-333333333333";
const C = "44444444-4444-4444-4444-444444444444";
const T1 = "55555555-0000-0000-0000-000000000001";
const A1 = "66666666-0000-0000-0000-000000000001";
const reads = (table: string) => calls.filter((c) => c.op === "read" && c.table === table);

beforeEach(() => {
  calls = [];
  pages = {};
  throwOn = null;
  fail = null;
  createResult = {};
  gone = new Set();
});

describe("rawTable", () => {
  it("returns the SDK page unchanged so fetchAll follows the skip token past 500 rows", async () => {
    pages["t"] = [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]];
    const table = rawTable<{ id: number }>("t", () => fake);
    const page = await table.page({ select: ["id"] });
    expect(page.skipToken).toBe("p1");
    expect((await table.list({ select: ["id"] })).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(calls.filter((c) => c.op === "read").map((c) => c.options?.["skipToken"])).toEqual([undefined, undefined, "p1", "p2"]);
  });
  it("turns a THROW into a DataError naming the entity set", async () => {
    throwOn = "t";
    const error = await rawTable("t", () => fake).list({ select: ["id"] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toBe("read t");
  });
  it("turns success:false into a DataError with the status", async () => {
    fail = { op: "update", status: 403 };
    const error = await rawTable("t", () => fake, "t_id").update(T1, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).status).toBe(403);
    expect((error as DataError).operation).toBe("update t");
  });
});

describe("readers", () => {
  it("Checklist tabs: every header, superset select, ordered by vsb_order", async () => {
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

  it("Gates header: by country + vsb_technology code, oldest first", async () => {
    await repo.listChecklistHeaders({ countryId: "11111111-1111-1111-1111-111111111111", technology: 952850001 });
    const options = reads(CHECKLIST_ENTITY_SETS.headers)[0]?.options ?? {};
    expect(options["filter"]).toContain("_vsb_country_value eq 11111111-1111-1111-1111-111111111111");
    expect(options["filter"]).toContain("vsb_technology eq 952850001");
    expect(options["orderBy"]).toEqual(["createdon asc"]);
  });

  it("tasks: by header, To-Delete filtered null-safely on the server AND client by default", async () => {
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

  it("tasks: includeToDelete drops the filter (option, not a fork)", async () => {
    pages[CHECKLIST_ENTITY_SETS.tasks] = [[{ vsb_projectdefaultchecklistsid: "t2", vsb_todelete: true }]];
    const rows = await repo.listDefaultChecklists({ headerId: H, includeToDelete: true });
    expect(reads(CHECKLIST_ENTITY_SETS.tasks)[0]?.options?.["filter"]).not.toContain("vsb_todelete");
    expect(rows.map((r) => r.toDelete)).toEqual([true]);
  });

  it("Checklist locks: locking approvals only (mode ≠ Only Notifications OR null), every page", async () => {
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

  it("Gates approvals: by task ids, 40 per request, superset columns mapped", async () => {
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

  it("a missing table becomes a DataError whose operation names the entity set (Gates describeTableFailure)", async () => {
    throwOn = CHECKLIST_ENTITY_SETS.tasks;
    const error = await repo.listDefaultChecklists({ headerId: H }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toContain(CHECKLIST_ENTITY_SETS.tasks);
  });
});

describe("writes", () => {
  it("creates a task and returns its id; undefined when Dataverse returns none", async () => {
    createResult = { vsb_projectdefaultchecklistsid: "new-id" };
    expect(await repo.createDefaultChecklist({ vsb_name: "x" })).toBe("new-id");
    createResult = {};
    expect(await repo.createDefaultChecklist({ vsb_name: "x" })).toBeUndefined();
    expect(calls.filter((c) => c.op === "create").every((c) => c.table === CHECKLIST_ENTITY_SETS.tasks)).toBe(true);
  });

  it("updates tasks and approvals, deletes approvals, surfacing a refusal", async () => {
    await repo.updateDefaultChecklist(T1, { vsb_order: 2 });
    await repo.updateChecklistApproval(A1, { vsb_gateisactive: false });
    await repo.deleteChecklistApproval(A1);
    expect(calls.map((c) => [c.op, c.table, c.id])).toEqual([
      ["exists", CHECKLIST_ENTITY_SETS.tasks, T1],
      ["update", CHECKLIST_ENTITY_SETS.tasks, T1],
      ["exists", CHECKLIST_ENTITY_SETS.approvals, A1],
      ["update", CHECKLIST_ENTITY_SETS.approvals, A1],
      ["delete", CHECKLIST_ENTITY_SETS.approvals, A1],
    ]);
    fail = { op: "delete", status: 403 };
    await expect(repo.deleteChecklistApproval("a1")).rejects.toBeInstanceOf(DataError);
  });

  it("V-1: updating a deleted task or approval is refused with RecordGoneError and sends no PATCH", async () => {
    gone.add(T1);
    gone.add(A1);
    await expect(repo.updateDefaultChecklist(T1, { vsb_order: 2 })).rejects.toBeInstanceOf(RecordGoneError);
    await expect(repo.updateChecklistApproval(A1, { vsb_gateisactive: false })).rejects.toBeInstanceOf(RecordGoneError);
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
    // Each table is checked by its own primary key.
    expect(calls.map((c) => c.table)).toEqual([CHECKLIST_ENTITY_SETS.tasks, CHECKLIST_ENTITY_SETS.approvals]);
  });

  it("creates an approval and returns its id", async () => {
    createResult = { vsb_checklistdefaultapprovalsid: "ap-1" };
    expect(await repo.createChecklistApproval({ vsb_name: "x" })).toBe("ap-1");
  });
});

describe("binds and helpers", () => {
  it("uses the LOWER-CASE owning-BU bind (B14)", () => {
    expect(OWNING_BU_BIND).toBe("owningbusinessunit@odata.bind");
    expect(owningBusinessUnitBind("{AAAAAAAA-0000-0000-0000-000000000000}")).toEqual({
      "owningbusinessunit@odata.bind": "/businessunits(aaaaaaaa-0000-0000-0000-000000000000)",
    });
    expect(owningBusinessUnitBind(null)).toEqual({});
    expect(Object.keys(owningBusinessUnitBind(H))).not.toContain("OwningBusinessUnit@odata.bind");
  });
  it("task binds use the navigation-property SchemaNames", () => {
    expect(taskBinds(H, C)).toEqual({
      "vsb_AssociatedCountryAndTechnology@odata.bind": `/vsb_checklistcountryandtechnologies(${H})`,
      "vsb_ClusterState@odata.bind": `/vsb_projectstates(${C})`,
    });
  });
  it("isLockingApproval: everything but Only Notifications locks, including null", () => {
    expect(isLockingApproval({ mode: 952850002 })).toBe(false);
    expect(isLockingApproval({ mode: null })).toBe(true);
    expect(isLockingApproval({ mode: 952850000 })).toBe(true);
  });
});

describe("E9: checklist write operation label", () => {
  it("create / update default to the shared lower-case wording (PG and current callers unchanged)", async () => {
    fail = { op: "create", status: 500 };
    const created = await repo.createDefaultChecklist({ vsb_name: "x" }).catch((e: unknown) => e);
    expect((created as DataError).operation).toBe("create checklist item");
    fail = { op: "update", status: 500 };
    const updated = await repo.updateDefaultChecklist(T1, { vsb_order: 2 }).catch((e: unknown) => e);
    expect((updated as DataError).operation).toBe("update checklist item");
  });

  it("a caller-supplied operation appears in the DataError", async () => {
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