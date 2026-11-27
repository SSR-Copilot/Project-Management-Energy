/**
 * UT-BOOT-COST-04x / UT-BOOT-WAVE-0xx — T-C01 and T-C02: the sequential WAVES a deep link spends before a screen's first read, with
 * and without the entry prefetch, measured with the wave recorder (`src/test/waveClient.ts`) over the REAL data modules.
 *
 * Today (switch OFF) the route gate holds every Cost screen until the project row and its lookups are in, so the screen's own reads start two
 * waves late (`CostProjectGate`; `loadProject`: the row, then country + state + area in parallel). A Project Management gate waits for
 * the row only (one wave). With the prefetch the reads that need only the project id start at wave 0, beside the project. Request counts
 * are identical: the same reads, earlier.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createWaveClient, waveOf, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({ wave: undefined as unknown as WaveClient }));

vi.mock("@/data/client", async (original) => ({
  ...(await original<typeof import("@/data/client")>()),
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
  deleteRecord: async () => undefined,
}));

const P = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const CONTRACT = "c0000000-0000-0000-0000-000000000001";
const SUBACC = "a0000000-0000-0000-0000-0000000000a1";
const ACCT = "a0000000-0000-0000-0000-0000000000a0";
const CAT0 = "a0000000-0000-0000-0000-0000000000c0";
const ROOT = "a0000000-0000-0000-0000-0000000000f0";
const CHART = [
  { vsb_capexaccountlistid: ROOT, vsb_number: "00001", vsb_name: "Root" },
  { vsb_capexaccountlistid: CAT0, vsb_number: "10000", vsb_name: "Wind Turbine / Panels", vsb_order: 1, _vsb_parentaccount_value: ROOT },
  { vsb_capexaccountlistid: ACCT, vsb_number: "80000", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: CAT0 },
  { vsb_capexaccountlistid: SUBACC, vsb_number: "80000_0", vsb_name: "Turbine", vsb_order: 1, _vsb_parentaccount_value: ACCT },
];
const ANSWERS: Record<string, unknown[]> = {
  "list CAPEX accounts": CHART,
  "list CAPEX accounts for the cost book": CHART,
  "list CAPEX account categories": CHART,
  "list CAPEX project contracts": [{ vsb_capexprojectcontractid: CONTRACT, _vsb_account_value: SUBACC, vsb_name: "C" }],
  "list CAPEX contract totals": [{ vsb_capexprojectcontractid: CONTRACT, _vsb_account_value: SUBACC }],
  "list CAPEX costs for the cost book": [{ vsb_capexcostid: "k1", _vsb_contract_value: CONTRACT, vsb_year: 2027, vsb_month: 1, vsb_cost: 5 }],
  "sum CAPEX cost rows per contract": [{ _vsb_contract_value: CONTRACT, vsb_cost: 5 }],
};
const wave = createWaveClient((label) => ANSWERS[label] ?? []);
h.wave = wave;

const { prefetchCostScreenReads } = await import("./costScreenPrefetch");
const { prefetchPmScreenReads } = await import("./pmScreenPrefetch");
const { invalidateCapexChart } = await import("@/data/capexChart");
const { invalidatePayerDefaults } = await import("@/data/costBook");
/** The chart and the SPV/DevCo mapping are remembered between loads on purpose; a cold start forgets both. */
const coldStart = () => { invalidateCapexChart(); invalidatePayerDefaults(); };
// The boot loads the screen's modules in parallel with the session read (a chunk download, not a wave); here they are loaded first so the
// recorder, which releases a wave as soon as one macrotask passes with nothing else to start, does not mistake the module load for latency.
await Promise.all([
  import("@/features/pm/production/queries"), import("@/features/pm/revenues/queries"), import("@/features/pm/finance/queries"),
]);

/** What `CostProjectGate` waits for: `loadProject`, the row and then its three lookups in parallel (`data/project.ts`). */
async function costGate() {
  await wave.fetchAll("session project row", null);
  await Promise.all(["session project country", "session project state", "session project area"].map((label) => wave.fetchAll(label, null)));
}
/** What `ProjectScreenGate` waits for on a Project Management route: the row only (scope `pm`). */
async function pmGate() {
  await wave.fetchAll("session project row", null);
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const isSession = (label: string) => label.startsWith("session project");
const screenReads = (calls: readonly { label: string; wave: number }[]) => calls.filter((c) => !isSession(c.label));

beforeEach(() => {
  wave.reset();
  coldStart();
});

describe("T-C01 Cost deep link", () => {
  it("UT-BOOT-COST-040 Summary landing: the first Cost read starts at wave 0 (was 2) and the totals are in 2 waves earlier; same requests", async () => {
    const on = await wave.run(async () => { await Promise.all([costGate(), prefetchCostScreenReads(client(), "/costs/capex", P, { mode: "boot" })]); });
    const onReads = screenReads(on.calls);
    coldStart();
    wave.reset();
    // Today: the screen mounts after the gate, then its hooks read (the same prefetchers stand in for the hooks' reads).
    const off = await wave.run(async () => { await costGate(); await prefetchCostScreenReads(client(), "/costs/capex", P, { mode: "boot" }); });
    const offReads = screenReads(off.calls);

    expect(Math.min(...onReads.map((c) => c.wave))).toBe(0);
    expect(Math.min(...offReads.map((c) => c.wave))).toBe(2);
    // The per-contract sums are the last read of the Summary: the contracts' totals read starts with the chart, then the sums (2 waves).
    expect(waveOf(on.calls, "sum CAPEX cost rows per contract")).toBe(1);
    expect(waveOf(off.calls, "sum CAPEX cost rows per contract")).toBe(3);
    // The same reads, earlier: the request counts do not change.
    expect(onReads.map((c) => c.label).sort()).toEqual(offReads.map((c) => c.label).sort());
    expect(on.calls).toHaveLength(off.calls.length);
  });

  it("UT-BOOT-COST-041 category landing (?category=0): the book's chain (chart, contracts, payments) ends at wave 2 (was 4)", async () => {
    const on = await wave.run(async () => { await Promise.all([costGate(), prefetchCostScreenReads(client(), "/costs/capex", P, { mode: "boot", category: 0 })]); });
    coldStart();
    wave.reset();
    const off = await wave.run(async () => { await costGate(); await prefetchCostScreenReads(client(), "/costs/capex", P, { mode: "boot", category: 0 }); });
    expect(Math.min(...screenReads(on.calls).map((c) => c.wave))).toBe(0);
    expect(waveOf(on.calls, "list CAPEX costs for the cost book")).toBe(2);
    expect(waveOf(off.calls, "list CAPEX costs for the cost book")).toBe(4);
    expect(on.calls).toHaveLength(off.calls.length);
  });
});

describe("T-C02 Production and Revenues deep link", () => {
  for (const [id, slug] of [["010", "production"], ["011", "revenues"]] as const) {
    it(`UT-BOOT-WAVE-${id} ${slug}: the first screen read starts at wave 0 (was 1, after the one-wave PM gate); same requests`, async () => {
      const on = await wave.run(async () => { await Promise.all([pmGate(), prefetchPmScreenReads(client(), slug, P)]); });
      wave.reset();
      const off = await wave.run(async () => { await pmGate(); await prefetchPmScreenReads(client(), slug, P); });
      expect(Math.min(...screenReads(on.calls).map((c) => c.wave))).toBe(0);
      expect(Math.min(...screenReads(off.calls).map((c) => c.wave))).toBe(1);
      expect(on.calls).toHaveLength(off.calls.length);
      expect(screenReads(on.calls).length).toBeGreaterThan(0);
    });
  }
});
