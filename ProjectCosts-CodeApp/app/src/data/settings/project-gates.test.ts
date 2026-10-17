/**
 * Project Gates data module — the SDK client is mocked, so these assert the exact table names,
 * `$select` / `$filter` strings, request counts per action (DR-1, DR-2, DR-8), chunking, and
 * that failures (including a table that is not a data source yet) surface instead of passing
 * silently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { op: string; table: string; options?: { select?: string[]; filter?: string; orderBy?: string[] }; id?: string; payload?: unknown }

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    /** Rows per table for reads. */
    rows: {} as Record<string, unknown[]>,
    /** Tables whose reads answer success:false (status per table). */
    failing: {} as Record<string, number>,
    /** Tables whose reads throw (as for a table missing from dataSourcesInfo). */
    throwing: new Set<string>(),
    writeFails: undefined as number | undefined,
    /** Tables whose reads wait for this promise before answering. */
    hold: {} as Record<string, Promise<void>>,
    /** V-1: ids the pre-update existence check reports as deleted, and the checks made. */
    gone: new Set<string>(),
    existenceChecks: [] as { table: string; id: string }[],
  };
  const fail = (status: number) => ({ success: false, data: undefined, error: Object.assign(new Error(`HTTP ${status}`), { status }) });
  const write = (op: string) => async (table: string, a?: unknown, b?: unknown) => {
    const id = typeof a === "string" ? a : undefined;
    const payload = typeof a === "string" ? b : a;
    state.calls.push({ op, table, id, payload });
    if (state.writeFails) return fail(state.writeFails);
    return { success: true, data: op === "create" ? { vsb_projectdefaultapprovalsid: "new-pda", vsb_checklistdefaultapprovalsid: "new-clda" } : {} };
  };
  const client = {
    retrieveMultipleRecordsAsync: async (table: string, options: Call["options"]) => {
      // V-1 existence check before a guarded PATCH (`updateRecordIfExists`): the row exists
      // unless listed in `gone`. Kept out of `calls` so per-action request counts are unchanged.
      const key = /^(\w+) eq ([0-9a-f-]{36})$/.exec(options?.filter ?? "");
      if (key && options?.select?.length === 1 && options.select[0] === key[1]) {
        state.existenceChecks.push({ table, id: key[2]! });
        return { success: true, data: state.gone.has(key[2]!) ? [] : [{ [key[1]!]: key[2] }] };
      }
      state.calls.push({ op: "read", table, options });
      if (state.hold[table]) await state.hold[table];
      if (state.throwing.has(table)) throw new Error(`Data source ${table} not found`);
      const status = state.failing[table];
      if (status) return fail(status);
      return { success: true, data: state.rows[table] ?? [] };
    },
    retrieveRecordAsync: async () => ({ success: true, data: {} }),
    createRecordAsync: write("create"),
    updateRecordAsync: write("update"),
    deleteRecordAsync: write("delete"),
    executeAsync: async () => ({ success: true, data: {} }),
  };
  return { state, client };
});

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => h.client }));

import { DataError, RecordGoneError } from "@/platform/errors";
import { permissionMessage } from "@/platform/privileges";
import { projectGatesRepository as repo, RESET_GATE_PAYLOAD } from "./project-gates";

const COUNTRY = "00000000-0000-0000-0000-0000000000de";
const HEADER = "70000000-0000-0000-0000-000000000001";
const reads = (table?: string) => h.state.calls.filter((c) => c.op === "read" && (!table || c.table === table));
const writes = () => h.state.calls.filter((c) => c.op !== "read");
const gid = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
/** A checklist-approval id; a GUID because the guarded update (V-1) validates it. */
const A1 = gid(901);
/** A gate-template id (V-1: GUID, the guarded update validates it). */
const T1 = gid(801);

beforeEach(() => {
  h.state.calls = [];
  h.state.rows = {};
  h.state.failing = {};
  h.state.throwing = new Set();
  h.state.writeFails = undefined;
  h.state.hold = {};
  h.state.gone = new Set();
  h.state.existenceChecks = [];
});

describe("DR-2 reads", () => {
  it("project states: exact $select, no statecode filter (D-13 open)", async () => {
    h.state.rows.vsb_projectstates = [{ vsb_projectstateid: "s0", vsb_name: "Draft", vsb_order: 0, vsb_isvisibleonchecklist: true, _owningbusinessunit_value: "bu" }];
    const states = await repo.listProjectStates();
    expect(states).toEqual([{ id: "s0", name: "Draft", order: 0, visibleOnChecklist: true, businessUnitId: "bu" }]);
    const [call] = reads("vsb_projectstates");
    expect(call!.options!.select).toEqual(["vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "_owningbusinessunit_value"]);
    expect(call!.options!.filter).toBeUndefined();
  });

  it("the dataset issues the documented filters, matched by technology CODE", async () => {
    h.state.rows.vsb_projectdefaultapprovalses = [{ vsb_projectdefaultapprovalsid: "t1", vsb_gateactive: true, _vsb_clusterstate_value: "s1", _vsb_approvalparticipant1_value: "30000000-0000-0000-0000-000000000001" }];
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    h.state.rows.vsb_projectdefaultchecklistses = [{ vsb_projectdefaultchecklistsid: gid(1), vsb_name: "Task", vsb_order: 1, _vsb_clusterstate_value: "s1" }];
    h.state.rows.vsb_checklistdefaultapprovalses = [{ vsb_checklistdefaultapprovalsid: "a1", vsb_gateisactive: false, _vsb_projectdefaultchecklistid_value: gid(1), vsb_defaultapprovers: "[]" }];
    h.state.rows.aadusers = [{ aaduserid: "30000000-0000-0000-0000-000000000001", id: "30000000-0000-0000-0000-000000000001", displayname: "Pat", mail: "pat@vsb.energy" }];

    const data = await repo.loadDataset(COUNTRY, 952850001);

    expect(reads("vsb_projectdefaultapprovalses")[0]!.options!.filter)
      .toBe(`(_vsb_approvalscountry_value eq ${COUNTRY}) and (vsb_technologycode eq 952850001)`);
    expect(reads("vsb_checklistcountryandtechnologies")[0]!.options!.filter)
      .toBe(`(_vsb_country_value eq ${COUNTRY}) and (vsb_technology eq 952850001)`);
    // G-4: "To Delete" tasks are filtered with Check List Settings' null-safe clause.
    expect(reads("vsb_projectdefaultchecklistses")[0]!.options!.filter)
      .toBe(`(_vsb_associatedcountryandtechnology_value eq ${HEADER}) and ((vsb_todelete eq false) or (vsb_todelete eq null))`);
    expect(reads("vsb_checklistdefaultapprovalses")[0]!.options!.filter)
      .toBe(`_vsb_projectdefaultchecklistid_value eq ${gid(1)}`);
    expect(reads("vsb_checklistdefaultapprovalses")[0]!.options!.select).toContain("vsb_defaultapprovers");
    expect(reads("aadusers")[0]!.options!.filter).toBe("id eq '30000000-0000-0000-0000-000000000001'");

    // ≤ 5 + ⌈n/40⌉ reads plus one PM resolution, none per gate row (DR-2 AC1, DR-11).
    expect(reads()).toHaveLength(5);
    expect(data.templates[0]).toMatchObject({ id: "t1", gateActive: true, stateId: "s1" });
    expect(data.approvals[0]).toMatchObject({ id: "a1", checklistId: gid(1), approvers: "[]" });
    expect(data.people["30000000-0000-0000-0000-000000000001"]).toEqual({ entraId: "30000000-0000-0000-0000-000000000001", name: "Pat", mail: "pat@vsb.energy" });
    expect(data.checklistError).toBeNull();
  });

  it("G-4: checklist rows select statecode / vsb_todelete and map them to active / toDelete", async () => {
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    h.state.rows.vsb_projectdefaultchecklistses = [
      { vsb_projectdefaultchecklistsid: gid(1), vsb_name: "Active", statecode: 0, vsb_todelete: null },
      { vsb_projectdefaultchecklistsid: gid(2), vsb_name: "Inactive", statecode: 1, vsb_todelete: false },
      { vsb_projectdefaultchecklistsid: gid(3), vsb_name: "No state" },
    ];
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("vsb_projectdefaultchecklistses")[0]!.options!.select).toEqual(expect.arrayContaining(["statecode", "vsb_todelete"]));
    expect(data.checklists.map((c) => [c.name, c.active, c.toDelete])).toEqual([
      ["Active", true, false], ["Inactive", false, false], ["No state", true, false],
    ]);
  });

  it("B10: the checklist header is read oldest-first and a duplicate warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.state.rows.vsb_checklistcountryandtechnologies = [
      { vsb_checklistcountryandtechnologyid: HEADER, createdon: "2024-01-01T00:00:00Z" },
      { vsb_checklistcountryandtechnologyid: gid(99), createdon: "2025-01-01T00:00:00Z" },
    ];
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("vsb_checklistcountryandtechnologies")[0]!.options!.orderBy).toEqual(["createdon asc"]);
    expect(data.checklistHeaderId).toBe(HEADER);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("B11: the checklist chain starts without waiting for the gate-template read", async () => {
    let release!: () => void;
    h.state.hold.vsb_projectdefaultapprovalses = new Promise<void>((r) => { release = r; });
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    const pending = repo.loadDataset(COUNTRY, 952850000);
    await vi.waitFor(() => expect(reads("vsb_projectdefaultchecklistses")).toHaveLength(1));
    release();
    const data = await pending;
    expect(data.checklistHeaderId).toBe(HEADER);
  });

  it("chunks the approvals read at 40 checklist ids", async () => {
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    h.state.rows.vsb_projectdefaultchecklistses = Array.from({ length: 45 }, (_, i) => ({ vsb_projectdefaultchecklistsid: gid(i + 1) }));
    await repo.loadDataset(COUNTRY, 952850000);
    const clda = reads("vsb_checklistdefaultapprovalses");
    expect(clda).toHaveLength(2);
    expect(clda[0]!.options!.filter!.split(" or ")).toHaveLength(40);
    expect(clda[1]!.options!.filter!.split(" or ")).toHaveLength(5);
  });

  it("no checklist header → no checklist reads, empty task lists", async () => {
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("vsb_projectdefaultchecklistses")).toHaveLength(0);
    expect(data.checklists).toEqual([]);
    expect(data.checklistHeaderId).toBeNull();
  });

  it("a missing table (thrown or refused) degrades to checklistError; gates still load", async () => {
    h.state.rows.vsb_projectdefaultapprovalses = [{ vsb_projectdefaultapprovalsid: "t1" }];
    h.state.throwing.add("vsb_checklistcountryandtechnologies");
    const thrown = await repo.loadDataset(COUNTRY, 952850000);
    expect(thrown.templates).toHaveLength(1);
    expect(thrown.checklistError).toMatch(/Checklist Country And Technologies/);

    h.state.throwing.clear();
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    h.state.failing.vsb_projectdefaultchecklistses = 404;
    const refused = await repo.loadDataset(COUNTRY, 952850000);
    expect(refused.checklistError).toMatch(/Project Default Checklists/);
  });

  it("a failing gate-template read throws a DataError (the screen shows its error state)", async () => {
    h.state.failing.vsb_projectdefaultapprovalses = 500;
    await expect(repo.loadDataset(COUNTRY, 952850000)).rejects.toBeInstanceOf(DataError);
  });

  it("DR-11: PM names resolve in ⌈n/15⌉ requests for distinct ids, never one per row", async () => {
    const pm = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    h.state.rows.vsb_projectdefaultapprovalses = [
      ...Array.from({ length: 16 }, (_, i) => ({ vsb_projectdefaultapprovalsid: `t${i}`, _vsb_approvalparticipant1_value: pm(i) })),
      { vsb_projectdefaultapprovalsid: "dup", _vsb_approvalparticipant1_value: pm(0) },
    ];
    await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("aadusers")).toHaveLength(2);
    expect(reads("aadusers")[0]!.options!.filter!.split(" or ")).toHaveLength(15);
  });

  it("PM resolution failure is non-fatal", async () => {
    h.state.rows.vsb_projectdefaultapprovalses = [{ vsb_projectdefaultapprovalsid: "t1", _vsb_approvalparticipant1_value: "p1" }];
    h.state.failing.aadusers = 500;
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(data.peopleError).toBeTruthy();
    expect(data.templates).toHaveLength(1);
  });
});

describe("DR-10 people search", () => {
  it("enabled accounts, startswith over name/given/surname/mail, escaped", async () => {
    h.state.rows.aadusers = [{ aaduserid: "k", id: "k", displayname: "Anna Müller", mail: "anna@vsb.energy" }];
    const people = await repo.searchPeople(" o'mü ");
    expect(people).toEqual([{ entraId: "k", name: "Anna Müller", mail: "anna@vsb.energy" }]);
    expect(reads("aadusers")[0]!.options!.filter).toBe(
      "(accountenabled eq true) and ((startswith(displayname,'o''mü')) or (startswith(givenname,'o''mü')) or (startswith(surname,'o''mü')) or (startswith(mail,'o''mü')))",
    );
  });

  it("fewer than 2 characters sends nothing", async () => {
    expect(await repo.searchPeople("a")).toEqual([]);
    expect(reads()).toHaveLength(0);
  });
});

describe("DR-8 writes: exactly one request per action", () => {
  it("gate toggle → one PATCH on vsb_projectdefaultapprovalses", async () => {
    await repo.setGateActive(T1, false);
    expect(writes()).toEqual([{ op: "update", table: "vsb_projectdefaultapprovalses", id: T1, payload: { vsb_gateactive: false } }]);
    expect(h.state.existenceChecks).toEqual([{ table: "vsb_projectdefaultapprovalses", id: T1 }]);
  });

  it("task toggle → one PATCH with vsb_gateisactive", async () => {
    await repo.setTaskActive(A1, true);
    expect(writes()).toEqual([{ op: "update", table: "vsb_checklistdefaultapprovalses", id: A1, payload: { vsb_gateisactive: true } }]);
    expect(h.state.existenceChecks).toEqual([{ table: "vsb_checklistdefaultapprovalses", id: A1 }]);
  });

  it("V-1: a task toggle on a deleted approval row is refused before any PATCH (never upserted)", async () => {
    h.state.gone.add(A1);
    await expect(repo.setTaskActive(A1, true)).rejects.toBeInstanceOf(RecordGoneError);
    expect(writes()).toEqual([]);
  });

  it("V-1: gate toggle / save / reset on a deleted template are refused (RecordGoneError), nothing PATCHed", async () => {
    h.state.gone.add(T1);
    await expect(repo.setGateActive(T1, true)).rejects.toBeInstanceOf(RecordGoneError);
    await expect(repo.saveGate(T1, { vsb_name: "y" })).rejects.toBeInstanceOf(RecordGoneError);
    await expect(repo.resetGate(T1)).rejects.toBeInstanceOf(RecordGoneError);
    expect(writes()).toEqual([]);
    expect(h.state.existenceChecks).toHaveLength(3);
  });

  it("save gate: create → one POST, update → one PATCH", async () => {
    expect(await repo.saveGate(undefined, { vsb_name: "x" })).toBe("new-pda");
    expect(await repo.saveGate(T1, { vsb_name: "y" })).toBe(T1);
    expect(writes().map((c) => `${c.op}:${c.table}`)).toEqual(["create:vsb_projectdefaultapprovalses", "update:vsb_projectdefaultapprovalses"]);
  });

  it("save task: create → one POST, update → one PATCH", async () => {
    expect(await repo.saveTask(undefined, { vsb_name: "x" })).toBe("new-clda");
    await repo.saveTask(A1, { vsb_name: "y" });
    expect(writes().map((c) => `${c.op}:${c.table}`)).toEqual(["create:vsb_checklistdefaultapprovalses", "update:vsb_checklistdefaultapprovalses"]);
  });

  it("reset gate → one PATCH with the four nulls and gateactive false, mode untouched", async () => {
    await repo.resetGate(T1);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.payload).toEqual(RESET_GATE_PAYLOAD);
    expect(RESET_GATE_PAYLOAD).toEqual({
      vsb_gateactive: false, "vsb_Approvalparticipant1@odata.bind": null,
      vsb_defaultcontributors: null, vsb_defaultapprovals: null, vsb_defaultnotifications: null,
    });
    expect(RESET_GATE_PAYLOAD).not.toHaveProperty("vsb_approvalmodecode");
  });

  it("delete task → one DELETE", async () => {
    await repo.deleteTask("a1");
    expect(writes()).toEqual([{ op: "delete", table: "vsb_checklistdefaultapprovalses", id: "a1", payload: undefined }]);
  });

  it("a refused write throws; a 403 maps to the permission message (FR-1 AC3)", async () => {
    h.state.writeFails = 403;
    const error = await repo.saveTask(A1, { vsb_name: "y" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(permissionMessage(error, "save the approvals")).toMatch(/do not have permission/);
    h.state.writeFails = 500;
    await expect(repo.deleteTask("a1")).rejects.toBeInstanceOf(DataError);
    await expect(repo.setGateActive(T1, true)).rejects.toBeInstanceOf(DataError);
    await expect(repo.resetGate(T1)).rejects.toBeInstanceOf(DataError);
  });
});
