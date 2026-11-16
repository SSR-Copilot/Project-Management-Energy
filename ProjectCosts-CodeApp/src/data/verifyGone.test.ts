/** UT-PLAN-915.. — `verifyGone`: reading deleted rows back, in chunks of 40, 4 reads at a time. */
import { describe, expect, it, vi } from "vitest";
import { DeleteNotConfirmedError, VERIFY_READ_CONCURRENCY, verifyGone, type VerifyClient } from "./verifyGone";

const SET = "vsb_landleaseallocationwtgs";
const PK = "vsb_landleaseallocationwtgid";
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => g(from + i));

/** A client whose store holds `present`; it answers each read with the stored rows the filter names. */
function clientWith(present: string[], opts: { fail?: boolean; delayMs?: number } = {}) {
  const store = new Set(present.map((p) => p.toLowerCase()));
  let inFlight = 0;
  let peak = 0;
  const calls: { table: string; options: Record<string, unknown> }[] = [];
  const client = {
    retrieveMultipleRecordsAsync: vi.fn(async (table: string, options?: Record<string, unknown>) => {
      calls.push({ table, options: options ?? {} });
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => { setTimeout(r, opts.delayMs ?? 0); });
      inFlight -= 1;
      if (opts.fail) return { success: false as const, error: Object.assign(new Error("read failed"), { status: 500 }) };
      const named = String(options?.["filter"] ?? "").match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? [];
      return { success: true as const, data: named.filter((n) => store.has(n)).map((n) => ({ [PK]: n })) };
    }),
  };
  return { client: client as unknown as VerifyClient, calls, peak: () => peak };
}

describe("verifyGone", () => {
  it.each([[1, 1], [40, 1], [41, 2], [100, 3]])(
    "UT-PLAN-915 %i ids are read in %i request(s), the primary key only, none still present",
    async (count, reads) => {
      const { client, calls } = clientWith([]);
      await expect(verifyGone(client, SET, ids(count))).resolves.toEqual([]);
      expect(calls).toHaveLength(reads);
      for (const c of calls) {
        expect(c.table).toBe(SET);
        expect(c.options["select"]).toEqual([PK]);
      }
    },
  );

  it("UT-PLAN-916 returns the ids still present, as given, in input order (any case)", async () => {
    const all = ids(100);
    const stay = [all[3]!, all[45]!, all[99]!];
    const { client } = clientWith(stay);
    const given = all.map((id, i) => (i === 45 ? id.toUpperCase() : id));
    await expect(verifyGone(client, SET, given)).resolves.toEqual([all[3], all[45]!.toUpperCase(), all[99]]);
  });

  it("UT-PLAN-917 an empty list reads nothing; a duplicate id (any case) is read once", async () => {
    const { client, calls } = clientWith([g(1)]);
    await expect(verifyGone(client, SET, [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
    await expect(verifyGone(client, SET, [g(1), g(1).toUpperCase(), g(2)])).resolves.toEqual([g(1)]);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]!.options["filter"]).match(/[0-9a-f]{8}-[0-9a-f-]{27}/g)).toHaveLength(2);
  });

  it("UT-PLAN-918 a failed read THROWS: it is never read as \"gone\"", async () => {
    const { client } = clientWith([], { fail: true });
    await expect(verifyGone(client, SET, ids(3))).rejects.toThrow(/verify deleted/);
  });

  it("UT-PLAN-919 an unregistered entity set throws before any read", async () => {
    const { client, calls } = clientWith([]);
    await expect(verifyGone(client, "vsb_nosuchtable", ids(1))).rejects.toThrow(/not registered/);
    expect(calls).toHaveLength(0);
  });

  it("UT-PLAN-920 at most 4 reads are in flight at once", async () => {
    const { client, calls, peak } = clientWith([], { delayMs: 5 });
    await verifyGone(client, SET, ids(40 * 10));
    expect(calls).toHaveLength(10);
    expect(peak()).toBeLessThanOrEqual(VERIFY_READ_CONCURRENCY);
    expect(peak()).toBeGreaterThan(1);
    expect(VERIFY_READ_CONCURRENCY).toBe(4);
  });
});

describe("DeleteNotConfirmedError", () => {
  it("UT-PLAN-921 carries the count and the entity set and puts no id in its message", () => {
    const e = new DeleteNotConfirmedError(SET, 3);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("DeleteNotConfirmedError");
    expect(e.count).toBe(3);
    expect(e.entitySet).toBe(SET);
    expect(e.message).toBe(`3 rows of ${SET} are still present after the delete`);
    expect(new DeleteNotConfirmedError(SET, 1).message).toBe(`1 row of ${SET} is still present after the delete`);
  });
});
