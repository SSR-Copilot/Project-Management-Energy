/**
 * `data/settings/costs.ts` against mocked services — payloads (AC-3), scoped full-paging reads
 * (AC-1, DR-2), and the period-integrity round trip (AC-4) on an in-memory T2.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ───────────────────────────────────────────── in-memory T2 + call log ── */

interface StoreRow { id: string; fields: Record<string, unknown> }
let t2: StoreRow[] = [];
let seq = 0;
let fetchCalls: { label: string; options: Record<string, unknown> }[] = [];
let rowsByLabel: Record<string, Record<string, unknown>[]> = {};
let deletes: string[] = [];
let failDeleteAfter = Number.POSITIVE_INFINITY;
/** R2-3 — per-id delete latency / failure, and the overlap actually observed. */
let deleteDelayMs: Record<string, number> = {};
let failDeleteIds = new Set<string>();
let deleteStarts: string[] = [];
let inFlight = 0;
let maxInFlight = 0;
let t1Calls: { op: string; id?: string; payload?: Record<string, unknown> }[] = [];
let bulkCalls: { entitySet: string; rows: Record<string, unknown>[] }[] = [];
let t2Updates: { id: string; payload: Record<string, unknown> }[] = [];
/** The next N flag-only PATCHes fail (simulates a failed follow-up step). */
let failFlagWrites = 0;
/** The next `updateMultiple` fails. */
let failBulk = false;
/** V-1: ids the guarded update's existence check reports as deleted (even if still listed). */
let goneIds = new Set<string>();
/** V-1: every guarded update attempted (operation, table, id). */
let guarded: { table: string; id: string }[] = [];

const PK = "vsb_opexlandleasestandardassumptionsid";
const contractRows = () => t2.map((r) => ({ [PK]: r.id, vsb_period: r.fields["vsb_period"], vsb_islastperiod: r.fields["vsb_islastperiod"] }));

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

vi.mock("../client", async () => {
  const { RecordGoneError, unwrap } = await import("@/platform/errors");
  return {
  /*
   * V-1: the guarded update (`updateRecordIfExists`) — its contract is tested in
   * `client.updateRecordIfExists.test.ts`; here it checks existence against the in-memory
   * tables and then runs the same fake PATCH as the generated services.
   */
  updateRecordIfExists: async (op: string, table: string, id: string, payload: Record<string, unknown>) => {
    guarded.push({ table, id });
    const exists = table === "vsb_opexlandleasestandardassumptionses" ? t2.some((r) => r.id === id) : true;
    if (!exists || goneIds.has(id)) throw new RecordGoneError(op, table, id);
    return unwrap((table === "vsb_opexlandleasestandardassumptionses" ? await t2Update(id, payload) : await t1Update(id, payload)) as never, op);
  },
  fetchAll: async (label: string, _page: unknown, options: Record<string, unknown>) => {
    fetchCalls.push({ label, options });
    if (label === "list contract periods") return contractRows();
    return rowsByLabel[label] ?? [];
  },
  deleteRecord: async (_op: string, table: string, id: string) => {
    deleteStarts.push(id);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const delay = deleteDelayMs[id];
      if (delay !== undefined) await new Promise((r) => setTimeout(r, delay));
      if (failDeleteIds.has(id)) throw new Error("delete refused");
    } finally {
      inFlight -= 1;
    }
    if (deletes.length >= failDeleteAfter) throw new Error("delete refused");
    deletes.push(`${table}:${id}`);
    t2 = t2.filter((r) => r.id !== id);
  },
  };
});

async function t2Update(id: string, payload: Record<string, unknown>) {
  t2Updates.push({ id, payload: { ...payload } });
  const target = t2.find((r) => r.id === id);
  if (!target) return { success: false, error: { message: "not found", status: 404 } };
  const flagOnly = Object.keys(payload).length === 1 && "vsb_islastperiod" in payload;
  if (flagOnly && failFlagWrites > 0) {
    failFlagWrites -= 1;
    return { success: false, error: { message: "flag write refused", status: 500 } };
  }
  Object.assign(target.fields, payload);
  return { success: true, data: {} };
}

async function t1Update(id: string, payload: Record<string, unknown>) {
  t1Calls.push({ op: "update", id, payload });
  return id === "fail" ? { success: false, error: { message: "Server busy", status: 500 } } : { success: true, data: {} };
}

vi.mock("../bulkWrite", () => ({
  updateMultiple: async (entitySet: string, _type: string, rows: Record<string, unknown>[]) => {
    if (failBulk) { failBulk = false; throw new Error("bulk refused"); }
    bulkCalls.push({ entitySet, rows });
    for (const row of rows) {
      const target = t2.find((r) => r.id === row[PK]);
      if (target) Object.assign(target.fields, row);
    }
  },
}));

vi.mock("@/generated/services/Vsb_opexlandleasestandardassumptionsesService", () => ({
  Vsb_opexlandleasestandardassumptionsesService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async (payload: Record<string, unknown>) => {
      seq += 1;
      const id = `row-${seq}`;
      t2.push({ id, fields: { ...payload } });
      return { success: true, data: { [PK]: id } };
    },
    update: async () => { throw new Error("the unguarded service update must never be called (V-1)"); },
  },
}));

vi.mock("@/generated/services/Vsb_devexcapexstandardassumptionsesService", () => ({
  Vsb_devexcapexstandardassumptionsesService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async (payload: Record<string, unknown>) => {
      t1Calls.push({ op: "create", payload });
      return { success: true, data: { vsb_devexcapexstandardassumptionsid: "t1-new" } };
    },
    update: async () => { throw new Error("the unguarded service update must never be called (V-1)"); },
  },
}));

import {
  CONTRACT_TYPE, COST_UNIT, ContractDeleteError, DevexRuleError, INACTIVE_SUBACCOUNT_MESSAGE, OPEX_SELECT,
  OpexFollowUpError, OpexRuleError, TECHNOLOGY, buildCapexHierarchy, describeLastFlagIssue,
  deleteDevexCost, deleteOpexContract, deleteOpexPeriod, devexPayload, lastFlagUpdates, listDevexCosts,
  listInactiveOpexRows, listOpexPeriods, listOpexSubaccounts, propagationFields, repairLastFlags, saveDevexCost, saveOpexPeriod,
  toOpexPeriod, type ContractScope, type DevexWrite, type OpexFields, type OpexWrite,
} from "./costs";
import { DataError, RecordGoneError } from "@/platform/errors";

const COUNTRY = "11111111-1111-1111-1111-111111111111";
const SUB = "22222222-2222-2222-2222-222222222222";
const scope: ContractScope = { countryId: COUNTRY, technology: TECHNOLOGY.pv, type: CONTRACT_TYPE.landLease, subaccountId: SUB };

const fields = (over: Partial<OpexFields> = {}): OpexFields => ({
  description: "Standard LL Lease", startDate: "Cluster 6: Operation", years: 5, months: 0,
  fixCosts: 100, ofRevenues: null, eurMwh: null, eurMw: null, eurWtg: null,
  aggregation: 952850000, distributionFrequency: 3,
  useInflation: true, useCountryInflation: false, inflationProfile: 2, area: null,
  externalContract: undefined, secured: false, allWtgAllocated: true, alignWithProjectDuration: false, threshold: false,
  thresholdType: null, thresholdIndividual: null,
  otp: { dueDate1: null, amount1: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null },
  ...over,
});

const write = (over: Partial<OpexWrite>): OpexWrite => ({
  mode: "new", scope, countryName: "Italy", period: 1, isLastPeriod: true, currencyId: "cur-eur", fields: fields(), ...over,
});

const lastFlags = () => t2.filter((r) => r.fields["vsb_islastperiod"] === true);
const periodOf = (r: StoreRow) => (r.fields["vsb_period"] as number) - 952849999;

beforeEach(() => {
  t2 = []; seq = 0; fetchCalls = []; rowsByLabel = {}; deletes = []; failDeleteAfter = Number.POSITIVE_INFINITY;
  t1Calls = []; bulkCalls = []; t2Updates = []; failFlagWrites = 0; failBulk = false;
  deleteDelayMs = {}; failDeleteIds = new Set(); deleteStarts = []; inFlight = 0; maxInFlight = 0;
  goneIds = new Set(); guarded = [];
});

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

describe("scoped, fully paged reads (AC-1, DR-2, DR-13)", () => {
  it("T1 and T2 are read once each with the country + technology + active filter", async () => {
    rowsByLabel["list DEVEX/CAPEX standard costs"] = [{
      vsb_devexcapexstandardassumptionsid: "a", vsb_descriptioninput: "X", vsb_cluster1: true, vsb_cluster3: true,
      vsb_costamount: 5, vsb_unit: COST_UNIT.eur, _vsb_category_value: "c", _vsb_subaccount_value: "s",
    }];
    rowsByLabel["list OPEX & Land Lease standard assumptions"] = [{ [PK]: "p", vsb_period: 952850002, vsb_islastperiod: true, vsb_typeofcontract: 952850000 }];
    const costs = await listDevexCosts({ countryId: COUNTRY, technology: TECHNOLOGY.pv });
    const periods = await listOpexPeriods({ countryId: COUNTRY, technology: TECHNOLOGY.pv });
    expect(fetchCalls.map((c) => c.label)).toEqual(["list DEVEX/CAPEX standard costs", "list OPEX & Land Lease standard assumptions"]);
    for (const call of fetchCalls) {
      expect(call.options["filter"]).toBe(`((_vsb_country_value eq ${COUNTRY}) and (vsb_technology eq 952850001)) and (statecode eq 0)`);
      expect((call.options["select"] as string[]).length).toBeGreaterThan(5);
    }
    expect(costs[0]?.clusters).toEqual([true, false, true, false, false]);
    expect(periods[0]).toMatchObject({ period: 3, isLastPeriodFlag: true, type: 952850000 });
  });
  it("R2-5: the scope's NOT-active T2 rows are read with a minimal select", async () => {
    rowsByLabel["list inactive OPEX & Land Lease standard assumptions"] = [
      { [PK]: "i", vsb_period: 952850002, vsb_typeofcontract: 952850000, _vsb_landleasesubaccount_value: SUB },
    ];
    const rows = await listInactiveOpexRows({ countryId: COUNTRY, technology: TECHNOLOGY.pv });
    expect(fetchCalls[0]?.options["filter"]).toBe(`((_vsb_country_value eq ${COUNTRY}) and (vsb_technology eq 952850001)) and (statecode ne 0)`);
    expect(rows).toEqual([{ id: "i", type: 952850000, period: 3, landLeaseSubaccountId: SUB, opexSubaccountId: undefined }]);
  });
  it("R2-4: keeps the sub-account lookup's stored name for display", () => {
    const f = "@OData.Community.Display.V1.FormattedValue";
    expect(toOpexPeriod({ [`_vsb_landleasesubaccount_value${f}`]: "Old lease" }).subaccountLabel).toBe("Old lease");
    expect(toOpexPeriod({ [`_vsb_opexsubaccount_value${f}`]: "Old O&M" }).subaccountLabel).toBe("Old O&M");
    expect(toOpexPeriod({}).subaccountLabel).toBeUndefined();
  });
  it("splits O&M from Other by account order or name", async () => {
    rowsByLabel["list OPEX sub-accounts"] = [
      { vsb_opexsubaccountid: "om", vsb_name: "Operation & Maintenance", vsb_order: 1, _vsb_account_value: "acc2" },
      { vsb_opexsubaccountid: "x", vsb_name: "Something", vsb_order: 2, _vsb_account_value: "acc1" },
      { vsb_opexsubaccountid: "t", vsb_name: "TCMA", vsb_order: 1, _vsb_account_value: "acc2" },
    ];
    rowsByLabel["list OPEX accounts"] = [{ vsb_opexaccountid: "acc1", vsb_order: 1 }, { vsb_opexaccountid: "acc2", vsb_order: 2 }];
    const subs = await listOpexSubaccounts();
    expect(subs.filter((s) => s.isOAndM).map((s) => s.id).sort()).toEqual(["om", "x"]);
  });
  it("builds the CAPEX hierarchy from one read without the excluded category", () => {
    const h = buildCapexHierarchy([
      { id: "r", name: "Root", number: "00001", order: 0, parentId: undefined },
      { id: "c", name: "Cat", number: "1", order: 1, parentId: "r" },
      { id: "o", name: "Overleveraging", number: "4", order: 4, parentId: "r" },
      { id: "a", name: "Acc", number: "1.1", order: 1, parentId: "c" },
      { id: "s", name: "Sub", number: "111", order: 1, parentId: "a" },
      { id: "s2", name: "Sub O", number: "411", order: 1, parentId: "o" },
    ]);
    expect(h.categories.map((c) => c.id)).toEqual(["c"]);
    expect(h.subaccounts).toEqual([expect.objectContaining({ id: "s", aggregatedName: "Acc / Sub 111", categoryId: "c", accountName: "Acc" })]);
  });
});

/* ════════════════════════════════════════════════════════════════ DEVEX ══ */

describe("DEVEX writes (AC-3, FR-12, FR-13)", () => {
  const w: DevexWrite = {
    countryId: COUNTRY, countryName: "Poland", technology: TECHNOLOGY.wind, categoryId: "33333333-3333-3333-3333-333333333333",
    subaccountId: "44444444-4444-4444-4444-444444444444", subaccountName: "Permits", descriptionInput: " Fees ",
    clusters: [true, false, false, false, true], unit: COST_UNIT.plnMw, costAmount: 1000, comment: " note ", costPaidBy: 952850002,
  };
  it("writes exactly the FR-12 field map on create", async () => {
    const id = await saveDevexCost(w);
    expect(id).toBe("t1-new");
    expect(t1Calls[0]?.payload).toEqual({
      vsb_name: "Standard Cost : Poland-Wind-Permits",
      vsb_cluster1: true, vsb_cluster2: false, vsb_cluster3: false, vsb_cluster4: false, vsb_cluster5: true,
      vsb_description: "Standard Permits - Fees",
      vsb_descriptioninput: "Fees",
      "vsb_Country@odata.bind": `/vsb_countries(${COUNTRY})`,
      vsb_technology: 952850000,
      vsb_unit: COST_UNIT.plnMw,
      vsb_applyvat: true,
      vsb_depreciation: true,
      vsb_distributionfrequency: 3,
      vsb_costamount: 1000,
      vsb_comment: "note",
      vsb_costpaidby: 952850002,
      "vsb_Subaccount@odata.bind": "/vsb_capexaccountlists(44444444-4444-4444-4444-444444444444)",
      "vsb_Category@odata.bind": "/vsb_capexaccountlists(33333333-3333-3333-3333-333333333333)",
    });
  });
  it("updates by id with the same body and surfaces a failure", async () => {
    await saveDevexCost({ ...w, id: "row-1" });
    expect(t1Calls[0]).toMatchObject({ op: "update", id: "row-1", payload: devexPayload(w) });
    await expect(saveDevexCost({ ...w, id: "fail" })).rejects.toBeInstanceOf(DataError);
  });
  it("V-1 (S2): an edit of a cost deleted meanwhile is refused with RecordGoneError and nothing is PATCHed", async () => {
    goneIds.add("row-1");
    await expect(saveDevexCost({ ...w, id: "row-1" })).rejects.toBeInstanceOf(RecordGoneError);
    expect(guarded).toEqual([{ table: "vsb_devexcapexstandardassumptionses", id: "row-1" }]);
    expect(t1Calls).toEqual([]);
  });
  it("deletes through deleteRecord and writes no tracking row (D-APPLY-3)", async () => {
    await deleteDevexCost("t1-row");
    expect(deletes).toEqual(["vsb_devexcapexstandardassumptionses:t1-row"]);
    expect(t1Calls).toEqual([]);
  });
});

/* ═════════════════════════════════════════════════════ OPEX / Land Lease ══ */

describe("contract payload (FR-24, DR-14)", () => {
  it("writes the W-5 map for a new Land Lease contract", async () => {
    await saveOpexPeriod(write({}));
    const f = t2[0]?.fields as Record<string, unknown>;
    expect(f).toMatchObject({
      vsb_name: "Standard LL Lease - Italy - PV",
      vsb_description: "Standard LL Lease",
      vsb_typeofcontract: 952850000,
      vsb_period: 952850000,
      vsb_islastperiod: true,
      vsb_inflationstartyearstring: "Cluster 6 : Operation",
      "vsb_LandLeaseSubaccount@odata.bind": `/vsb_landleasesubaccounts(${SUB})`,
      "vsb_Country@odata.bind": `/vsb_countries(${COUNTRY})`,
      "vsb_Currency@odata.bind": "/transactioncurrencies(cur-eur)",
      vsb_technology: 952850001,
      vsb_secured: false, vsb_allwtgallocated: true, vsb_alignwithprojectduration: false, vsb_threshold: false,
      vsb_inflationprofile: 2,
    });
    expect(f).not.toHaveProperty("vsb_externalcontract");
    expect(f).not.toHaveProperty("vsb_OpexSubaccount@odata.bind");
    // Blank numerics are omitted on create (DR-7), never written as 0.
    expect(f).not.toHaveProperty("vsb_eurmw");
  });
  it("binds the opex sub-account and External Contract for O&M", async () => {
    await saveOpexPeriod(write({ scope: { ...scope, type: CONTRACT_TYPE.oAndM }, fields: fields({ externalContract: false }) }));
    expect(t2[0]?.fields).toMatchObject({ "vsb_OpexSubaccount@odata.bind": `/vsb_opexsubaccounts(${SUB})`, vsb_externalcontract: false, vsb_typeofcontract: 952850001 });
  });
  it("refuses a second contract for the same sub-account", async () => {
    await saveOpexPeriod(write({}));
    await expect(saveOpexPeriod(write({}))).rejects.toBeInstanceOf(OpexRuleError);
    expect(t2).toHaveLength(1);
  });
});

describe("period integrity round trip (AC-4)", () => {
  it("new → add 2 periods → edit Period 1 inflation → delete last → delete contract", async () => {
    // New contract.
    const head = await saveOpexPeriod(write({}));
    expect(lastFlags().map((r) => r.id)).toEqual([head.id]);

    // Add Period 2 and 3: numbers are highest + 1, exactly one last flag each time.
    await saveOpexPeriod(write({ mode: "addPeriod", period: 2, fields: fields({ description: "Standard LL Lease - 2" }) }));
    expect(lastFlags().map(periodOf)).toEqual([2]);
    await saveOpexPeriod(write({ mode: "addPeriod", period: 3, fields: fields({ description: "Standard LL Lease - 3" }) }));
    expect(t2.map(periodOf)).toEqual([1, 2, 3]);
    expect(lastFlags().map(periodOf)).toEqual([3]);

    // A stale "add Period 3" (someone else already added it) is refused, never a duplicate.
    await expect(saveOpexPeriod(write({ mode: "addPeriod", period: 3 }))).rejects.toBeInstanceOf(OpexRuleError);

    // Edit Period 1 inflation 2 → 3: ONE UpdateMultiple to every later period.
    const r = await saveOpexPeriod(write({ mode: "edit", id: head.id, isLastPeriod: false, fields: fields({ inflationProfile: 3 }) }));
    expect(r.propagated).toBe(2);
    expect(bulkCalls).toHaveLength(1);
    expect(bulkCalls[0]?.rows).toHaveLength(2);
    expect(t2.map((x) => x.fields["vsb_inflationprofile"])).toEqual([3, 3, 3]);
    expect(lastFlags().map(periodOf)).toEqual([3]);

    // Delete the last period: Period 2 becomes last.
    const tail = t2.find((x) => periodOf(x) === 3) as StoreRow;
    await deleteOpexPeriod(tail.id, scope);
    expect(t2.map(periodOf)).toEqual([1, 2]);
    expect(lastFlags().map(periodOf)).toEqual([2]);

    // Delete the contract: later periods first, Period 1 last, nothing left.
    const result = await deleteOpexContract(scope);
    expect(result.deleted).toBe(2);
    expect(deletes.slice(-2)).toEqual([`vsb_opexlandleasestandardassumptionses:row-2`, `vsb_opexlandleasestandardassumptionses:${head.id}`]);
    expect(t2).toHaveLength(0);
  });

  it("never creates Period 11", async () => {
    for (let p = 1; p <= 10; p += 1) {
      await saveOpexPeriod(write(p === 1 ? {} : { mode: "addPeriod", period: p }));
    }
    expect(t2).toHaveLength(10);
    await expect(saveOpexPeriod(write({ mode: "addPeriod", period: 11 }))).rejects.toThrow(/Maximum of 10 periods/);
    expect(t2).toHaveLength(10);
  });

  it("an unchanged inflation value is not sent in the PATCH, so a stored 0.02 stays 0.02", async () => {
    await saveOpexPeriod(write({}));
    t2[0]!.fields["vsb_inflationprofile"] = 0.02;
    await saveOpexPeriod(write({ mode: "edit", id: "row-1", isLastPeriod: true, fields: fields({ fixCosts: 5, inflationProfile: 0, inflationProfileUnchanged: true }) }));
    expect(t2[0]?.fields["vsb_inflationprofile"]).toBe(0.02);
    expect(t2[0]?.fields["vsb_fixcosts"]).toBe(5);
  });

  it("a Period 2+ edit does not propagate", async () => {
    await saveOpexPeriod(write({}));
    await saveOpexPeriod(write({ mode: "addPeriod", period: 2 }));
    await saveOpexPeriod(write({ mode: "edit", id: "row-2", period: 2, fields: fields({ fixCosts: 5 }) }));
    expect(bulkCalls).toHaveLength(0);
  });

  it("a failed Period-1 write propagates nothing (D-SAVE-2)", async () => {
    await expect(saveOpexPeriod(write({ mode: "edit", id: "missing" }))).rejects.toBeInstanceOf(DataError);
    expect(bulkCalls).toHaveLength(0);
  });

  it("reports a partial contract delete and keeps Period 1 when a later delete fails", async () => {
    await saveOpexPeriod(write({}));
    await saveOpexPeriod(write({ mode: "addPeriod", period: 2 }));
    await saveOpexPeriod(write({ mode: "addPeriod", period: 3 }));
    failDeleteAfter = 1;
    const err = await deleteOpexContract(scope).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractDeleteError);
    expect((err as ContractDeleteError).deleted).toBe(1);
    expect((err as ContractDeleteError).total).toBe(3);
    expect(t2.some((x) => periodOf(x) === 1)).toBe(true);
  });

  it("filters contract rows by scope, type and sub-account (no orphans in other contracts)", async () => {
    await deleteOpexContract(scope);
    const filter = fetchCalls.find((c) => c.label === "list contract periods")?.options["filter"];
    expect(filter).toContain(`_vsb_landleasesubaccount_value eq ${SUB}`);
    expect(filter).toContain("vsb_typeofcontract eq 952850000");
    expect(filter).toContain(`_vsb_country_value eq ${COUNTRY}`);
  });
});

describe("lastFlagUpdates (DR-12)", () => {
  it("flags only the highest period, numerically", () => {
    expect(lastFlagUpdates([
      { id: "a", period: 1, isLast: true }, { id: "b", period: 10, isLast: false }, { id: "c", period: 2, isLast: true },
    ])).toEqual([{ id: "a", isLast: false }, { id: "b", isLast: true }, { id: "c", isLast: false }]);
    expect(lastFlagUpdates([{ id: "a", period: 1, isLast: true }])).toEqual([]);
    expect(lastFlagUpdates([])).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════ gap closure ══ */

/** Seeds one contract: Period n = `row-pn`, flagged as given. */
const seed = (periods: number[], flagged: number[]) => {
  for (const p of periods) {
    t2.push({ id: `row-p${p}`, fields: { vsb_period: 952849999 + p, vsb_islastperiod: flagged.includes(p) } });
  }
};

describe("DEVEX inactive sub-account guard (B-2)", () => {
  const w: DevexWrite = {
    countryId: COUNTRY, countryName: "Germany", technology: TECHNOLOGY.wind, categoryId: "c", subaccountId: "s",
    subaccountName: "", descriptionInput: "X", clusters: [true, false, false, false, false], unit: COST_UNIT.eur,
    costAmount: 1, comment: "", costPaidBy: 952850001,
  };
  it("refuses to write a cost without a sub-account name — never 'Standard Cost : …-'", async () => {
    await expect(saveDevexCost({ ...w, id: "row" })).rejects.toBeInstanceOf(DevexRuleError);
    await expect(saveDevexCost(w)).rejects.toThrow(INACTIVE_SUBACCOUNT_MESSAGE);
    expect(t1Calls).toEqual([]);
  });
  it("a valid name never ends with '-' and the description has no double space", () => {
    const p = devexPayload({ ...w, subaccountName: "Permits" });
    expect(String(p["vsb_name"]).endsWith("-")).toBe(false);
    expect(String(p["vsb_description"])).not.toContain("Standard  - ");
  });
});

describe("Italy inflation area (B-10)", () => {
  it("reads vsb_inflationcountryarea (what the project screens read), falling back to vsb_inflationarea", () => {
    expect(OPEX_SELECT).toContain("vsb_inflationcountryarea");
    expect(OPEX_SELECT).toContain("vsb_inflationarea");
    expect(toOpexPeriod({ vsb_inflationcountryarea: "North", vsb_inflationarea: "Old" }).inflationArea).toBe("North");
    expect(toOpexPeriod({ vsb_inflationarea: "Old" }).inflationArea).toBe("Old");
    expect(toOpexPeriod({}).inflationArea).toBeUndefined();
  });

  it("an unchanged Area is not written: a legacy row keeps its country area (row and propagation)", async () => {
    seed([1, 2], [2]);
    t2[0]!.fields["vsb_inflationcountryarea"] = "Centre - North";
    t2[1]!.fields["vsb_inflationcountryarea"] = "Centre - North";
    await saveOpexPeriod(write({ mode: "edit", id: "row-p1", isLastPeriod: false, fields: fields({ useCountryInflation: true, inflationProfile: null, area: "Centre - North", areaUnchanged: true }) }));
    const patch = t2Updates.find((u) => u.id === "row-p1")?.payload ?? {};
    expect(patch).not.toHaveProperty("vsb_inflationcountryarea");
    expect(patch).not.toHaveProperty("vsb_inflationarea");
    expect(bulkCalls[0]?.rows[0]).not.toHaveProperty("vsb_inflationcountryarea");
    expect(t2.map((r) => r.fields["vsb_inflationcountryarea"])).toEqual(["Centre - North", "Centre - North"]);
    expect(t2.map((r) => r.fields["vsb_inflationarea"])).toEqual([undefined, undefined]);
  });

  it("a changed Area writes the column the project screens read (and keeps vsb_inflationarea in step)", async () => {
    seed([1, 2], [2]);
    await saveOpexPeriod(write({ mode: "edit", id: "row-p1", isLastPeriod: false, fields: fields({ useCountryInflation: true, inflationProfile: null, area: "South", areaUnchanged: false }) }));
    expect(t2.map((r) => r.fields["vsb_inflationcountryarea"])).toEqual(["South", "South"]);
    expect(t2.map((r) => r.fields["vsb_inflationarea"])).toEqual(["South", "South"]);
  });
});

describe("Period-1 propagation payload (FR-25)", () => {
  it("copies exactly the contract-level keys, with the saved values, to every existing later period", async () => {
    seed([1, 2, 3], [3]);
    const f = fields({ inflationProfile: 4, area: "X", thresholdType: 7 });
    await saveOpexPeriod(write({ mode: "edit", id: "row-p1", isLastPeriod: false, fields: f }));
    expect(bulkCalls).toHaveLength(1);
    const rows = bulkCalls[0]?.rows ?? [];
    expect(rows.map((r) => r[PK]).sort()).toEqual(["row-p2", "row-p3"]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([PK, ...Object.keys(propagationFields(f))].sort());
    expect(rows[0]).toMatchObject({
      vsb_inflationprofile: 4, vsb_inflationarea: "X", vsb_inflationcountryarea: "X", vsb_thresholdtype: 7,
      vsb_useinflationprofile: true, vsb_usecountryinflationprofile: false, vsb_secured: false, vsb_allwtgallocated: true,
    });
    expect(rows[0]).not.toHaveProperty("vsb_externalcontract");
    expect(rows[0]).not.toHaveProperty("vsb_islastperiod");
  });
});

describe("last-period integrity on failure paths (B-4, B-5, B-6, DR-12)", () => {
  it("describes inconsistent flags precisely", () => {
    expect(describeLastFlagIssue([{ id: "a", period: 1, isLast: false }, { id: "b", period: 2, isLast: true }])).toBeUndefined();
    expect(describeLastFlagIssue([{ id: "a", period: 1, isLast: false }, { id: "b", period: 2, isLast: false }]))
      .toBe("No period is marked as last; Period 2 should be.");
    expect(describeLastFlagIssue([{ id: "a", period: 1, isLast: true }, { id: "b", period: 2, isLast: true }, { id: "c", period: 3, isLast: true }]))
      .toBe("Period 1, Period 2 and Period 3 are marked as last; only Period 3 should be.");
    expect(describeLastFlagIssue([{ id: "a", period: 1, isLast: true }, { id: "b", period: 2, isLast: false }]))
      .toBe("Period 1 is marked as last; only Period 2 should be.");
  });

  it("period delete re-checks on the server that the row is still the tail", async () => {
    seed([1, 2, 3], [3]);
    // The screen still shows Period 2 as last; someone else added Period 3.
    await expect(deleteOpexPeriod("row-p2", scope)).rejects.toThrow(/no longer the last period/);
    await expect(deleteOpexPeriod("row-gone", scope)).rejects.toThrow(/no longer exists/);
    await expect(deleteOpexPeriod("row-p1", scope)).rejects.toBeInstanceOf(OpexRuleError);
    expect(deletes).toEqual([]);
    expect(t2).toHaveLength(3);
  });

  it("period delete: a failed re-flag is repaired once from the server", async () => {
    seed([1, 2, 3], [3]);
    failFlagWrites = 1;
    await deleteOpexPeriod("row-p3", scope);
    expect(lastFlags().map(periodOf)).toEqual([2]);
  });

  it("period delete: a re-flag that keeps failing is reported precisely", async () => {
    seed([1, 2, 3], [3]);
    failFlagWrites = 99;
    const err = await deleteOpexPeriod("row-p3", scope).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpexFollowUpError);
    expect((err as Error).message).toBe("The period was deleted, but the new last period could not be marked as last: No period is marked as last; Period 2 should be.");
  });

  it("partial contract delete (2nd of 4 fails) leaves exactly one row flagged last", async () => {
    seed([1, 2, 3, 4], [4]);
    failDeleteAfter = 1;
    const err = await deleteOpexContract(scope).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractDeleteError);
    expect((err as ContractDeleteError).deleted).toBe(1);
    expect((err as ContractDeleteError).flagIssue).toBeUndefined();
    expect(t2.map(periodOf).sort()).toEqual([1, 2, 3]);
    expect(lastFlags().map(periodOf)).toEqual([3]);
  });

  it("R2-3: contract delete runs strictly tail-first, one awaited delete at a time", async () => {
    seed([1, 2, 3, 4, 5], [5]);
    // Later periods are slow; if they overlapped, the start order would not prove the order.
    deleteDelayMs = { "row-p5": 5, "row-p4": 3, "row-p3": 1 };
    const result = await deleteOpexContract(scope);
    expect(result.deleted).toBe(5);
    expect(deleteStarts).toEqual(["row-p5", "row-p4", "row-p3", "row-p2", "row-p1"]);
    expect(maxInFlight).toBe(1);
    expect(t2).toHaveLength(0);
  });

  it("R2-3: a mid-way failure (P3 fails while P2 would have finished first) never leaves a gap", async () => {
    seed([1, 2, 3, 4], [4]);
    // Concurrent deletes would let fast P2 succeed while slow P3 fails → P1, P3 left (a gap).
    deleteDelayMs = { "row-p3": 10 };
    failDeleteIds = new Set(["row-p3"]);
    const err = await deleteOpexContract(scope).catch((e: unknown) => e) as ContractDeleteError;
    expect(err).toBeInstanceOf(ContractDeleteError);
    expect(err.deleted).toBe(1);
    expect(err.total).toBe(4);
    expect(err.flagIssue).toBeUndefined();
    expect(deleteStarts).toEqual(["row-p4", "row-p3"]); // P2 and P1 never attempted
    expect(maxInFlight).toBe(1);
    expect(t2.map(periodOf).sort()).toEqual([1, 2, 3]); // contiguous Period 1..3
    expect(lastFlags().map(periodOf)).toEqual([3]); // flag repaired onto the new tail
  });

  it("partial contract delete whose repair also fails reports what is inconsistent", async () => {
    seed([1, 2, 3], [3]);
    failDeleteAfter = 1;
    failFlagWrites = 99;
    const err = await deleteOpexContract(scope).catch((e: unknown) => e) as ContractDeleteError;
    expect(err.flagIssue).toBe("No period is marked as last; Period 2 should be.");
  });

  it("an edit normalises stale flags from the server: never a middle period flagged last", async () => {
    seed([1, 2, 3], [2, 3]);
    await saveOpexPeriod(write({ mode: "edit", id: "row-p2", period: 2, isLastPeriod: false, fields: fields({ fixCosts: 9 }) }));
    expect(lastFlags().map(periodOf)).toEqual([3]);
  });

  it("an edit on a stale screen that wrote `last` on a middle period is corrected", async () => {
    seed([1, 2, 3], [3]);
    await saveOpexPeriod(write({ mode: "edit", id: "row-p2", period: 2, isLastPeriod: true, fields: fields({ fixCosts: 9 }) }));
    expect(lastFlags().map(periodOf)).toEqual([3]);
  });

  it("add period: a failed un-flag is repaired; a persistent failure is reported precisely", async () => {
    seed([1, 2], [2]);
    failFlagWrites = 1;
    await saveOpexPeriod(write({ mode: "addPeriod", period: 3 }));
    expect(lastFlags().map(periodOf)).toEqual([3]);

    failFlagWrites = 99;
    const err = await saveOpexPeriod(write({ mode: "addPeriod", period: 4 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpexFollowUpError);
    expect((err as Error).message).toBe("The period was saved, but the last-period flags could not be corrected: Period 3 and Period 4 are marked as last; only Period 4 should be.");
  });

  it("a failed propagation still normalises flags and says exactly what failed", async () => {
    seed([1, 2], [1]);
    failBulk = true;
    const err = await saveOpexPeriod(write({ mode: "edit", id: "row-p1", isLastPeriod: false, fields: fields({ inflationProfile: 5 }) })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpexFollowUpError);
    expect((err as Error).message).toBe("Period 1 was saved, but its contract-level values could not be copied to the later periods.");
    expect(lastFlags().map(periodOf)).toEqual([2]);
  });

  it("V-1 (S4): editing a period deleted meanwhile is refused (RecordGoneError): no PATCH, no propagation, no re-flag", async () => {
    seed([1, 2], [2]);
    goneIds.add("row-p1");
    await expect(saveOpexPeriod(write({ mode: "edit", id: "row-p1", isLastPeriod: false, fields: fields({ fixCosts: 9 }) })))
      .rejects.toBeInstanceOf(RecordGoneError);
    expect(t2Updates).toEqual([]);
    expect(bulkCalls).toEqual([]);
  });

  it("V-1 (S3): a re-flag skips a period deleted since the read instead of recreating it", async () => {
    seed([1, 2], [1]);
    goneIds.add("row-p1");
    expect(await repairLastFlags(scope)).toBeUndefined();
    expect(guarded.map((g) => g.id).sort()).toEqual(["row-p1", "row-p2"]);
    expect(t2Updates.map((u) => u.id)).toEqual(["row-p2"]);
    expect(lastFlags().map(periodOf)).toEqual([1, 2]);
  });

  it("repairLastFlags re-flags exactly the highest period from the server", async () => {
    seed([1, 2], [1]);
    expect(await repairLastFlags(scope)).toBeUndefined();
    expect(lastFlags().map(periodOf)).toEqual([2]);
  });

  it("refuses to address a contract without a sub-account (B-3: no 'Not a GUID')", async () => {
    const orphan = { ...scope, subaccountId: "" };
    await expect(deleteOpexContract(orphan)).rejects.toBeInstanceOf(OpexRuleError);
    await expect(deleteOpexPeriod("x", orphan)).rejects.toBeInstanceOf(OpexRuleError);
    await expect(saveOpexPeriod(write({ scope: orphan }))).rejects.toBeInstanceOf(OpexRuleError);
    expect(fetchCalls).toEqual([]);
    expect(deletes).toEqual([]);
  });
});
