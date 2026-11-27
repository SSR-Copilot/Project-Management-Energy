/**
 * Stage 2 agent B throwaway MODEL (no network, no Dataverse). Counts requests and awaited rounds of write plans by formula and by
 * the repo's own plan builders, then prices the rounds with the UNIT COSTS RECORDED in the repo (D144: 0.25-0.5 s per single write;
 * D51 bulk model: a bulk request = a + b x rows with a = 0.5 s, b = 0.027 s). Every second printed here is DERIVED, never measured.
 * Run from ProjectCosts-CodeApp:
 *   npx vitest run --config ../ProjectDocs/bottleneck-identification/_bench/S2B/vitest.s2b.config.ts
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { ES } from "@/data/dataverseNames";
import { parallelChunkSize } from "@/data/bulkWrites";
import { createMany, type PlannedWrite } from "@/data/writePlan";
import { steps } from "@/features/pm/generators/bulkPlans.testkit";
import { groupIntoWaves, planStandardContracts } from "@/features/pm/production/rules";
import { generation } from "@/features/pm/production/productionPlans.testkit";

const out: string[] = [];
const say = (s: string): void => { out.push(s); };

const A = 0.5;
const B = 0.027; // D51 bulk model, PROVISIONAL
const TW = [0.25, 0.4, 0.5]; // single-write unit costs recorded in D144
const ceil = Math.ceil;

/** Rows of one bulk step -> requests and seconds of its round (parallel 8, chunk 10..500, D51 tuned splitter). */
function bulkRound(rows: number): { requests: number; chunk: number; sec: number } {
  const chunk = parallelChunkSize(rows, 8, 500, 10);
  const requests = rows < 20 ? 1 : ceil(rows / chunk);
  const per = rows < 20 ? rows : chunk;
  return { requests, chunk: per, sec: A + B * per };
}
const fmt = (n: number): string => n.toFixed(1);
const range = (rounds: number, extraBulkSec = 0): string =>
  `${fmt(rounds * TW[0]! + extraBulkSec)}-${fmt(rounds * TW[2]! + extraBulkSec)} s (mid ${fmt(rounds * TW[1]! + extraBulkSec)})`;

/* ---------- Production generation (SPB-01) ---------- */
function rounds(stepsList: ReturnType<typeof steps>, width: number): number {
  return stepsList.reduce((n, s) => n + (s.kind === "group" ? ceil(s.writes.length / width) : 1), 0);
}
const isAlloc = (w: PlannedWrite): boolean => w.entitySet === ES.landLeaseAllocationWtgs;

/** V2: the allocation creates leave the sequential plan and go into ONE createMany before the flags; refs are renumbered. */
function bulkAllocationsPlan(seq: readonly PlannedWrite[]): PlannedWrite[] {
  const createIndexMap = new Map<number, number>();
  let oldIdx = 0;
  let newIdx = 0;
  const rest: PlannedWrite[] = [];
  const allocs: PlannedWrite[] = [];
  for (const w of seq) {
    if (w.op === "create") {
      if (isAlloc(w)) { allocs.push(w); oldIdx += 1; continue; }
      createIndexMap.set(oldIdx, newIdx);
      oldIdx += 1;
      newIdx += 1;
    }
    rest.push(w);
  }
  const remap = (w: PlannedWrite): PlannedWrite => {
    const fix = (v: unknown): unknown => (typeof v === "string"
      ? v.replace(/@created#(\d+)/g, (_m, n: string) => `@created#${createIndexMap.get(Number(n)) ?? "X"}`) : v);
    return {
      ...w,
      id: w.id === undefined ? undefined : (fix(w.id) as string),
      data: w.data ? Object.fromEntries(Object.entries(w.data).map(([k, v]) => [k, fix(v)])) : w.data,
    };
  };
  const grouped = groupIntoWaves(rest.map(remap));
  const flags = grouped[grouped.length - 1]!;
  const rows = allocs.map((a, i) => ({ id: `id-${i}`, data: a.data ?? {} }));
  return [...grouped.slice(0, -1), ...(rows.length > 0 ? [createMany(ES.landLeaseAllocationWtgs, rows, "allocations")] : []), flags];
}

for (const [ll, turbines, dev] of [[4, 30, 3], [4, 100, 3], [4, 200, 3]] as const) {
  it(`production generation ${ll} LL x ${turbines} WTG x ${dev} device types`, () => {
    const input = generation(ll, turbines, dev);
    const seq = planStandardContracts(input, { waves: false }).writes;
    const v0 = planStandardContracts(input).writes;
    const v2 = bulkAllocationsPlan(seq);
    const s0 = steps(v0);
    const s2 = steps(v2);
    const r0 = rounds(s0, 8);
    const r1 = rounds(s0, 16);
    const bulkRows = v2.filter((w) => w.op === "createMany").reduce((n, w) => n + (w.rows?.length ?? 0), 0);
    const nonBulk = s2.filter((s) => s.kind !== "bulk");
    const r2 = rounds(nonBulk, 8);
    const r2w = rounds(nonBulk, 16);
    const br = bulkRound(bulkRows);
    const req0 = v0.length;
    const req2 = v2.filter((w) => w.op !== "createMany").length + br.requests;
    say(`PRODUCTION ${ll} LL x ${turbines} WTG x ${dev} dev: writes=${req0}; V0 (today, 8 wide) rounds=${r0}; V1 (16 wide) rounds=${r1}; `
      + `V2 (bulk allocations ${bulkRows} rows = ${br.requests} requests of ~${br.chunk}, others 8 wide) rounds=${r2}+1 bulk, requests=${req2}; V2w (others 16 wide) rounds=${r2w}+1 bulk`);
    say(`   time: V0 ${range(r0)} | V1 ${range(r1)} | V2 ${range(r2, br.sec)} | V2w ${range(r2w, br.sec)}`);
    say(`   steps V0=${s0.length} V2=${s2.length}`);
  });
}

/* ---------- Generators Add WTG type (NET-13): singles vs bulk (turbines + allocations) ---------- */
it("generators add type grid", () => {
  say("");
  say("GENERATORS Add WTG type (in country, D144 on = 16-wide waves). rounds = write rounds only (the pre-read and the reload are common to both).");
  for (const [n, l] of [[5, 1], [20, 1], [24, 1], [20, 3], [50, 2], [100, 3], [100, 5], [200, 5]] as const) {
    const single = 1 + ceil(n / 16) + ceil((2 + n * l) / 16);
    const singleReq = 1 + n + 2 + n * l;
    const bt = bulkRound(n);
    const ba = bulkRound(n * l);
    const bulkSec = 2 * TW[1]! + bt.sec + ba.sec;
    const bulkReq = 1 + bt.requests + 2 + ba.requests;
    const onlyAllocSec = TW[1]! * (1 + ceil(n / 16) + 1) + ba.sec;
    say(`  N=${n} L=${l}: singles rounds=${single} requests=${singleReq} (mid ${fmt(single * TW[1]!)} s) | bulk turbines+allocs rounds=4 requests=${bulkReq} (mid ${fmt(bulkSec)} s) | bulk allocs only: ${fmt(onlyAllocSec)} s`);
  }
  say("");
  say("GENERATORS status toggle (D144 on): wave{type + N turbines} then roll-up; bulk `status`: type, read(per 40), UpdateMultiple, roll-up");
  for (const nn of [10, 24, 50, 100, 200]) {
    const single = ceil((nn + 1) / 16) + 1;
    const br = bulkRound(nn);
    const bulkSec = TW[1]! * 3 + br.sec;
    say(`  N=${nn}: singles rounds=${single} requests=${nn + 2} (mid ${fmt(single * TW[1]!)} s) | bulk rounds=4 requests=${2 + ceil(nn / 40) + br.requests} (mid ${fmt(bulkSec)} s)`);
  }
});

/* ---------- CAPEX panel delete (SCC-02) ---------- */
it("capex panel delete", () => {
  say("");
  say("CAPEX panel delete: rounds = 1 (comments read) + ceil(C/L) + ceil(P/L) + 1 (contract); L = PANEL_DELETE_LIMIT");
  for (const p of [36, 58, 120, 200]) {
    for (const c of [0, 6]) {
      const row = [4, 8, 16].map((l) => { const r = 2 + ceil(c / l) + ceil(p / l); return `L=${l}: ${r} rounds ${range(r)}`; });
      say(`  P=${p} cost rows, C=${c} comments: ${row.join(" | ")} | cascade-only (comments + 1 contract delete): ${2 + ceil(c / 4)} rounds + server cascade time (D51 live: 5.2 s for one contract, size and contention unknown)`);
    }
  }
});

/* ---------- Admin guarded updates (SAD-07, NET-14) ---------- */
it("admin guarded updates", () => {
  say("");
  say("ADMIN guarded updates (n rows, width 8): today 2n requests, 2 x ceil(n/8) sequential latencies; chunked existence read: n + ceil(n/40) requests, 1 + ceil(n/8) latencies");
  for (const n of [1, 4, 8, 30, 100, 550]) {
    const t0 = 2 * ceil(n / 8);
    const t1 = 1 + ceil(n / 8);
    say(`  n=${n}: today ${2 * n} req / ${t0} lat (mid ${fmt(t0 * TW[1]!)} s) | chunked guard ${n + ceil(n / 40)} req / ${t1} lat (mid ${fmt(t1 * TW[1]!)} s)`);
  }
  say("");
  say("ADMIN CAPEX clean-up: Z zero rows (guarded PATCH width 8), D later-year deletes (width 16), phases side by side");
  for (const [z, d] of [[50, 150], [200, 600], [550, 1800], [1100, 3600]] as const) {
    const t = Math.max(2 * ceil(z / 8), ceil(d / 16));
    const req = 2 * z + d;
    const tChunk = Math.max(1 + ceil(z / 8), ceil(d / 16));
    const br = bulkRound(z);
    const tBulk = Math.max(TW[1]! * 2 + br.sec, ceil(d / 16) * TW[1]!);
    say(`  Z=${z} D=${d}: ${req} requests, critical path ${t} lat (mid ${fmt(t * TW[1]!)} s); chunked guard: ${z + ceil(z / 40) + d} req, ${tChunk} lat (mid ${fmt(tChunk * TW[1]!)} s); UpdateMultiple zeroing: ${ceil(z / 40) + br.requests + d} req, mid ${fmt(tBulk)} s (deletes bound it)`);
  }
});

it("write", () => {
  writeFileSync("c:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectDocs/bottleneck-identification/_bench/S2B/s2b.bench.out.txt", `${out.join("\n")}\n`);
});
