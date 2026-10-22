/**
 * Admin Project Gates Approvals data module — the SDK client is mocked, so these assert the exact table names,
 * `$select` / `$filter` strings, request counts per action, chunking, and
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
    /** Ids the pre-update existence check reports as deleted, and the checks made. */
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
      // Upsert guard existence check before a guarded PATCH (`updateRecordIfExists`): the row exists
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

import { DataError } from "@/platform/errors";
import { clearTraces, traces } from "@/platform/telemetry";
import { ENTRA_COL, entraSearchFilter, projectGatesRepository as repo } from "./adminGatesApprovals";

const COUNTRY = "00000000-0000-0000-0000-0000000000de";
const HEADER = "70000000-0000-0000-0000-000000000001";
const reads = (table?: string) => h.state.calls.filter((c) => c.op === "read" && (!table || c.table === table));
const gid = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

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

describe(" reads", () => {
  it("UT-ADGATE-001 Project states: exact $select, no statecode filter ", async () => {
    h.state.rows.vsb_projectstates = [{ vsb_projectstateid: "s0", vsb_name: "Draft", vsb_order: 0, vsb_isvisibleonchecklist: true, _owningbusinessunit_value: "bu" }];
    const states = await repo.listProjectStates();
    expect(states).toEqual([{ id: "s0", name: "Draft", order: 0, visibleOnChecklist: true, businessUnitId: "bu" }]);
    const [call] = reads("vsb_projectstates");
    expect(call!.options!.select).toEqual(["vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "_owningbusinessunit_value"]);
    expect(call!.options!.filter).toBeUndefined();
  });

  it("UT-ADGATE-002 The dataset issues the documented filters, matched by technology CODE", async () => {
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
    // "To Delete" tasks are filtered with Check List Settings' null-safe clause.
    expect(reads("vsb_projectdefaultchecklistses")[0]!.options!.filter)
      .toBe(`(_vsb_associatedcountryandtechnology_value eq ${HEADER}) and ((vsb_todelete eq false) or (vsb_todelete eq null))`);
    expect(reads("vsb_checklistdefaultapprovalses")[0]!.options!.filter)
      .toBe(`_vsb_projectdefaultchecklistid_value eq ${gid(1)}`);
    expect(reads("vsb_checklistdefaultapprovalses")[0]!.options!.select).toContain("vsb_defaultapprovers");
    expect(reads("aadusers")[0]!.options!.filter).toBe("id eq '30000000-0000-0000-0000-000000000001'");

    // ≤ 5 + ⌈n/40⌉ reads plus one PM resolution, none per gate row.
    expect(reads()).toHaveLength(5);
    expect(data.templates[0]).toMatchObject({ id: "t1", gateActive: true, stateId: "s1" });
    expect(data.approvals[0]).toMatchObject({ id: "a1", checklistId: gid(1), approvers: "[]" });
    expect(data.people["30000000-0000-0000-0000-000000000001"]).toEqual({ entraId: "30000000-0000-0000-0000-000000000001", name: "Pat", mail: "pat@vsb.energy" });
    expect(data.checklistError).toBeNull();
  });

  it("UT-ADGATE-003 Checklist rows select statecode / vsb_todelete and map them to active / toDelete", async () => {
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

  it("UT-ADGATE-004 the checklist header is read oldest-first and a duplicate warns", async () => {
    clearTraces();
    h.state.rows.vsb_checklistcountryandtechnologies = [
      { vsb_checklistcountryandtechnologyid: HEADER, createdon: "2024-01-01T00:00:00Z" },
      { vsb_checklistcountryandtechnologyid: gid(99), createdon: "2025-01-01T00:00:00Z" },
    ];
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("vsb_checklistcountryandtechnologies")[0]!.options!.orderBy).toEqual(["createdon asc"]);
    expect(data.checklistHeaderId).toBe(HEADER);
    expect(traces().filter((e) => e.severity === "warning")).toHaveLength(1);
  });

  it("UT-ADGATE-005 the checklist chain starts without waiting for the gate-template read", async () => {
    let release!: () => void;
    h.state.hold.vsb_projectdefaultapprovalses = new Promise<void>((r) => { release = r; });
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    const pending = repo.loadDataset(COUNTRY, 952850000);
    await vi.waitFor(() => expect(reads("vsb_projectdefaultchecklistses")).toHaveLength(1));
    release();
    const data = await pending;
    expect(data.checklistHeaderId).toBe(HEADER);
  });

  it("UT-ADGATE-006 Chunks the approvals read at 40 checklist ids", async () => {
    h.state.rows.vsb_checklistcountryandtechnologies = [{ vsb_checklistcountryandtechnologyid: HEADER }];
    h.state.rows.vsb_projectdefaultchecklistses = Array.from({ length: 45 }, (_, i) => ({ vsb_projectdefaultchecklistsid: gid(i + 1) }));
    await repo.loadDataset(COUNTRY, 952850000);
    const clda = reads("vsb_checklistdefaultapprovalses");
    expect(clda).toHaveLength(2);
    expect(clda[0]!.options!.filter!.split(" or ")).toHaveLength(40);
    expect(clda[1]!.options!.filter!.split(" or ")).toHaveLength(5);
  });

  it("UT-ADGATE-007 No checklist header → no checklist reads, empty task lists", async () => {
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("vsb_projectdefaultchecklistses")).toHaveLength(0);
    expect(data.checklists).toEqual([]);
    expect(data.checklistHeaderId).toBeNull();
  });

  it("UT-ADGATE-008 A missing table (thrown or refused) degrades to checklistError; gates still load", async () => {
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

  it("UT-ADGATE-009 A failing gate-template read throws a DataError (the screen shows its error state)", async () => {
    h.state.failing.vsb_projectdefaultapprovalses = 500;
    await expect(repo.loadDataset(COUNTRY, 952850000)).rejects.toBeInstanceOf(DataError);
  });

  it("UT-ADGATE-010 PM names resolve in ⌈n/15⌉ requests for distinct ids, never one per row", async () => {
    const pm = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    h.state.rows.vsb_projectdefaultapprovalses = [
      ...Array.from({ length: 16 }, (_, i) => ({ vsb_projectdefaultapprovalsid: `t${i}`, _vsb_approvalparticipant1_value: pm(i) })),
      { vsb_projectdefaultapprovalsid: "dup", _vsb_approvalparticipant1_value: pm(0) },
    ];
    await repo.loadDataset(COUNTRY, 952850000);
    expect(reads("aadusers")).toHaveLength(2);
    expect(reads("aadusers")[0]!.options!.filter!.split(" or ")).toHaveLength(15);
  });

  it("UT-ADGATE-011 PM resolution failure is non-fatal", async () => {
    h.state.rows.vsb_projectdefaultapprovalses = [{ vsb_projectdefaultapprovalsid: "t1", _vsb_approvalparticipant1_value: "p1" }];
    h.state.failing.aadusers = 500;
    const data = await repo.loadDataset(COUNTRY, 952850000);
    expect(data.peopleError).toBeTruthy();
    expect(data.templates).toHaveLength(1);
  });
});

describe(" people search", () => {
  it("UT-ADGATE-012 Enabled accounts, contains (canvas Search = substring) over name/given/surname/mail, escaped", async () => {
    h.state.rows.aadusers = [{ aaduserid: "k", id: "k", displayname: "Anna Müller", mail: "anna@vsb.energy" }];
    const people = await repo.searchPeople(" o'mü ");
    expect(people).toEqual([{ entraId: "k", name: "Anna Müller", mail: "anna@vsb.energy" }]);
    expect(reads("aadusers")[0]!.options!.filter).toBe(
      "(accountenabled eq true) and ((contains(displayname,'o''mü')) or (contains(givenname,'o''mü')) or (contains(surname,'o''mü')) or (contains(mail,'o''mü')))",
    );
  });

  it("UT-ADGATE-013 Fewer than 2 characters sends nothing", async () => {
    expect(await repo.searchPeople("a")).toEqual([]);
    expect(reads()).toHaveLength(0);
  });
});

/*
 * The six writes of the screen are WritePlans built by the screen's `rules.ts`; their exact requests
 * (UT-ADGATE-014..023, relocated) are asserted in `features/admin/admin-gates-approvals/writes.test.ts`.
 */

/**
 * The cross-feature Entra people search (`entraSearchFilter`, `ENTRA_COL`) used by PM General Data /
 * Team. Test ids kept from master's former admin-gates `rules.test.ts`.
 */
describe("The Entra people search (aadusers)", () => {
  it("UT-ADGATE-020 enabled accounts only (a Boolean), contains on four columns; blank issues nothing", () => {
    expect(entraSearchFilter("  ")).toBeUndefined();
    const filter = entraSearchFilter("an")!;
    expect(filter).toContain("accountenabled eq true");
    for (const c of ["displayname", "givenname", "surname", "mail"]) expect(filter).toContain(`contains(${c},'an')`);
    expect(ENTRA_COL.objectId).toBe("id");
    expect(ENTRA_COL.rowId).toBe("aaduserid");
  });

  it("UT-ADGATE-020b a quote in the search term is escaped", () => {
    expect(entraSearchFilter("O'Brien")).toContain("O''Brien");
  });
});
