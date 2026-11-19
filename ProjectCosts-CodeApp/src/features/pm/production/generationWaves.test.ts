/**
 * UT-PRODPLAN — D135: the one-shot standard-contract generation sends its independent creates together.
 *
 * The change is only HOW the plan is sent. These tests pin that the rows are exactly those of the sequential plan
 * (same writes, same order, same refs), that a run never holds a write whose parent is created inside the same run,
 * that the four project flags stay last and alone, and that the real engine resolves every ref and stops on a failure.
 * The sequential plan stays available as `{ waves: false }` (CONVENTIONS rule 15) and is the oracle here.
 */
import { describe, expect, it, vi } from "vitest";
import { CHOICE_PRODUCTION, ES, ES_PLANT } from "@/data/dataverseNames";
import { executePlan, PlanError, type PlanClient } from "@/data/executePlan";
import { WRITE_CONCURRENCY } from "@/data/concurrency";
import { createdRowRef, type PlannedWrite } from "@/data/writePlan";
import { steps, withoutGroupIds } from "@/features/pm/generators/bulkPlans.testkit";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";
import {
  groupIntoWaves, markForCapexRecalculationFields, planStandardContracts, PRODUCTION_GENERATION_WAVES,
  type GenerationInputs, type StandardAssumption,
} from "./rules";
import { assumption, generation, project } from "./productionPlans.testkit";

const P = CHOICE_PRODUCTION.opexLandLeasePeriod;
const T = CHOICE_PRODUCTION.typeOfContract;

/** A write with the concurrency markers removed: what the sequential plan holds. */
const plain = (writes: readonly PlannedWrite[]) =>
  withoutGroupIds(writes).map(({ concurrent: _c, stopOnFailure: _s, concurrencyLimit: _l, ...rest }) => rest);

const refsIn = (w: PlannedWrite): number[] => {
  const out: number[] = [];
  for (const v of [w.id, ...Object.values(w.data ?? {})]) {
    if (typeof v === "string") for (const m of v.matchAll(/@created#(\d+)/g)) out.push(Number(m[1]));
  }
  return out;
};

/** Sequential waves the engine awaits: a group costs ceil(size / limit) round trips, a single write one. */
function roundTrips(writes: readonly PlannedWrite[]): number {
  return steps(writes).reduce((n, s) => n + (s.kind === "group" ? Math.ceil(s.writes.length / (s.limit ?? WRITE_CONCURRENCY)) : 1), 0);
}

/** The structural rules every wave plan must keep. */
function expectSound(seq: readonly PlannedWrite[], waves: readonly PlannedWrite[]): void {
  expect(plain(waves)).toEqual(plain(seq)); // same rows, same order, same refs
  let creates = 0;
  for (const s of steps(waves)) {
    const firstCreate = creates;
    for (const w of s.writes) {
      if (s.kind === "group") {
        expect(w.op).toBe("create");
        expect(w.stopOnFailure).toBe(true);
        for (const ref of refsIn(w)) expect(ref).toBeLessThan(firstCreate); // a parent is never created inside the run
      }
      if (w.op === "create") creates += 1;
    }
  }
  const last = waves[waves.length - 1]!;
  expect(last).toMatchObject({ op: "update", entitySet: ES.projects, data: markForCapexRecalculationFields() });
  expect(last.concurrent).toBeUndefined(); // the flags go last, alone, after every create has landed
}

describe("UT-PRODPLAN generation waves", () => {
  it("UT-PRODPLAN-001 the switch is on, and `waves: false` is exactly the sequential plan (no write marked concurrent)", () => {
    expect(PRODUCTION_GENERATION_WAVES).toBe(true);
    const seq = planStandardContracts(generation(4, 30, 3), { waves: false });
    expect(seq.writes.every((w) => w.concurrent === undefined && w.concurrencyGroup === undefined)).toBe(true);
    expect(steps(seq.writes)).toHaveLength(seq.writes.length);
  });

  it("UT-PRODPLAN-002 same writes in the same order, with refs only to rows created before the run, the flags last (4 land leases x 30 turbines)", () => {
    const input = generation(4, 30, 3);
    expectSound(planStandardContracts(input, { waves: false }).writes, planStandardContracts(input).writes);
  });

  it("UT-PRODPLAN-003 the 151-request generation is 8 steps and 22 round trips, not 151", () => {
    const seq = planStandardContracts(generation(4, 30, 3), { waves: false }).writes;
    const waves = planStandardContracts(generation(4, 30, 3)).writes;
    expect([seq.length, waves.length]).toEqual([151, 151]); // not one request fewer: only fewer awaited waits
    expect([steps(seq).length, roundTrips(seq)]).toEqual([151, 151]);
    // 1 (first cost) + 3 x 4 (31 writes at 8) + 5 (37) + 2 (13) + 1 (6) + 1 (the flags) = 22 round trips in 8 steps.
    expect([steps(waves).length, roundTrips(waves)]).toEqual([8, 22]);
  });

  it("UT-PRODPLAN-004 at 200 turbines the sequential 831 round trips become a few dozen", () => {
    const waves = planStandardContracts(generation(4, 200, 3)).writes;
    expect(waves).toHaveLength(831);
    expect(roundTrips(waves)).toBeLessThan(120);
    console.info(`[AFTER] generation 4 LL x 200 WTG: requests=${waves.length} steps=${steps(waves).length} round-trips=${roundTrips(waves)} (was 831/831/831)`);
  });

  it("UT-PRODPLAN-005 every special case keeps the sequential rows: COD blank, families already present, no owner, canvas-parity chain", () => {
    const base = generation(3, 4, 2);
    const cases: [string, GenerationInputs, { otherOpexChain?: "subaccount" | "canvasParity" }][] = [
      ["no COD", { ...base, project: project({ cod: null }) }, {}],
      ["all families present", { ...base, existing: { landLease: 1, otherOpex: 1, oAndM: 1 } }, {}],
      ["only land lease present", { ...base, existing: { landLease: 2, otherOpex: 0, oAndM: 0 } }, {}],
      ["no owning business unit", { ...base, project: project({ owningBusinessUnitId: null }) }, {}],
      ["no O&M subaccount", { ...base, oAndM: null }, {}],
      ["canvas-parity Other OPEX chain", base, { otherOpexChain: "canvasParity" }],
    ];
    for (const [, input, opts] of cases) {
      expectSound(planStandardContracts(input, { ...opts, waves: false }).writes, planStandardContracts(input, opts).writes);
    }
  });

  it("UT-PRODPLAN-006 400 seeded random assumption sets: rows identical to the sequential plan, runs never hold a parent and its child", () => {
    let seed = 20261119;
    const rnd = (): number => { // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
    const periods = [P.period1, P.period2, P.period3, P.period4, P.period5];
    for (let n = 0; n < 400; n++) {
      const list: StandardAssumption[] = [];
      for (let i = 0; i < int(0, 12); i++) {
        const type = [T.landlease, T.opexOther, T.opexOandM][int(0, 2)]!;
        const sub = `s${int(1, 3)}`;
        list.push(assumption({
          id: `a${i}`, name: `N${i}`, description: `D${String(int(0, 99)).padStart(2, "0")}`, typeOfContract: type,
          period: periods[int(0, periods.length - 1)]!, allWtgAllocated: rnd() < 0.7,
          landLeaseSubaccountId: type === T.landlease ? sub : null, opexSubaccountId: type === T.landlease ? null : sub,
          landLeaseSubaccountName: sub, opexSubaccountName: sub, durationInYears: int(0, 5), durationInMonths: int(0, 11),
        }));
      }
      const input: GenerationInputs = {
        ...generation(0, int(0, 12), int(0, 4)), assumptions: list,
        existing: { landLease: int(0, 1) * int(0, 1), otherOpex: int(0, 1) * int(0, 1), oAndM: int(0, 1) * int(0, 1) },
        project: project({ cod: rnd() < 0.1 ? null : "2028-09-01" }),
      };
      expectSound(planStandardContracts(input, { waves: false }).writes, planStandardContracts(input).writes);
    }
  });

  it("UT-PRODPLAN-007 groupIntoWaves: independent creates share a run, a child waits for its parent's run, a non-create is a barrier", () => {
    const c = (name: string, data: Record<string, unknown> = {}): PlannedWrite =>
      ({ op: "create", entitySet: ES_PLANT.landLeaseProjectCosts, data: { vsb_name: name, ...data }, reason: name });
    const u: PlannedWrite = { op: "update", entitySet: ES.projects, id: "p1", data: { x: 1 }, reason: "flags" };
    const out = groupIntoWaves([c("A"), c("B"), c("child of A", { ref: createdRowRef(0) }), c("D"), u]);
    expect(steps(out).map((s) => [s.kind, s.writes.map((w) => w.reason)])).toEqual([
      ["group", ["A", "B"]], ["group", ["child of A", "D"]], ["single", ["flags"]],
    ]);
    expect(steps(groupIntoWaves([c("only")]))[0]!.kind).toBe("single"); // a run of one stays a plain write
    expect(groupIntoWaves([])).toEqual([]);
  });
});

/* ═══════════════════════════ through the real engine, with a stub client ═══ */

const ok = <T2,>(data: T2) => ({ success: true as const, data });

/** A client that numbers each table's creates at call time, so a plan's ids are the same however its writes interleave. */
function stub(failCreateNumber?: number) {
  const bodies: string[] = [];
  const counter = new Map<string, number>();
  let creates = 0;
  const key = (table: string): string => (dataSourcesInfo as Record<string, { primaryKey: string }>)[table]!.primaryKey;
  const client = {
    createRecordAsync: vi.fn(async (table: string, data: Record<string, unknown>) => {
      creates += 1;
      const n = (counter.get(table) ?? 0) + 1;
      counter.set(table, n);
      bodies.push(`create ${table} ${JSON.stringify(data)}`);
      await Promise.resolve();
      if (failCreateNumber !== undefined && creates === failCreateNumber) {
        return { success: false as const, data: undefined, error: { message: "refused", status: 500 } };
      }
      return ok({ [key(table)]: `${table}-${n}` });
    }),
    updateRecordAsync: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
      bodies.push(`update ${table} ${id} ${JSON.stringify(data)}`);
      return ok({});
    }),
    deleteRecordAsync: vi.fn(async () => ok(undefined)),
  };
  return { client: client as unknown as PlanClient, bodies, raw: client };
}

describe("UT-PRODPLAN generation waves through executePlan", () => {
  it("UT-PRODPLAN-008 the engine sends the same request bodies and returns the same created ids as the sequential plan", async () => {
    const input = generation(4, 30, 3);
    const a = stub();
    const seq = await executePlan(planStandardContracts(input, { waves: false }), "seq", a.client);
    const b = stub();
    const par = await executePlan(planStandardContracts(input), "waves", b.client);
    expect(b.bodies).toHaveLength(151);
    expect(b.bodies.some((x) => x.includes("@created"))).toBe(false); // every ref was resolved
    expect([...b.bodies].sort()).toEqual([...a.bodies].sort()); // the same requests; only their timing differs
    expect(par.createdIds).toEqual(seq.createdIds);
    expect(par.done).toBe(seq.done);
    expect(b.bodies[b.bodies.length - 1]).toContain("update vsb_projects p1"); // the flags are the last request sent
  });

  it("UT-PRODPLAN-009 a refused create stops the plan: no flags are written, later writes of the run are not started, and the count of what landed is true", async () => {
    const input = generation(4, 30, 3);
    const total = planStandardContracts(input).writes.length;
    const s = stub(40); // the 40th create is refused: inside the fourth run
    const err = await executePlan(planStandardContracts(input), "waves", s.client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanError);
    const e = err as PlanError;
    expect(e.total).toBe(total);
    expect(e.done).toBeLessThan(40);
    expect(e.done).toBeGreaterThan(30);
    expect(s.bodies.some((x) => x.startsWith("update vsb_projects"))).toBe(false);
    expect(s.raw.createRecordAsync.mock.calls.length).toBeLessThan(total - 1); // stopOnFailure held the rest back
    expect(e.createdIds.length).toBe(e.done); // every create that landed is reported, none invented
  });
});
