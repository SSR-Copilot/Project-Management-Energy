// @vitest-environment jsdom
/**
 * Revenue screen: what a keystroke in an Individual-volume box costs, and how the Save's two pre-write reads are
 * sequenced (D146). `./hooks` is mocked with fixed rows, as in `Screen.perf.test.tsx`; `./rules` is real, with
 * `volumeRowLabel` (called once per volume row render) wrapped in a spy. Timings are jsdom + a fixed mock latency:
 * LOCAL-MOCK numbers, relative only, never a user-perceived time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import type { RevenueProject, StandardFlags, StoredRevenueContract } from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);

const project: RevenueProject = {
  id: "p-1", projectIdText: "FR-0001", projectName: "Parc Sud", countryName: "France", countryCode: "c-fr",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: null, construction: null,
  legallyBindingPermits: null, applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: d("2060-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bu-fr", clusterStateOrder: 4,
};
const noFlags: StandardFlags = {
  biddingPrice: false, contractDurationYears: false, contractDurationMonths: false,
  contractStartDate: false, contractEndDate: false, tariffPrice: false, tariffPriceP90: false,
  useInflationProfile: false, useCustomInflation: false, inflationProfileYear: false,
  customInflationProfile: false, hedgedVolume: false, correctionFactor: false, correctionFactorP90: false,
};
const contract = (id: string, over: Partial<StoredRevenueContract> = {}): StoredRevenueContract => ({
  id, name: `Parc Sud-PPA-PPA France ${id}`, description: "PPA France",
  label: CHOICE_FINANCE.revenueLabel.ppa, tariffPrice: 65, tariffPriceP90: 65, biddingPrice: 0,
  siteQuality: 0, siteQualityP90: 0, correctionFactor: 0, correctionFactorP90: 0,
  contractStartDate: d("2028-01-01"), contractEndDate: d("2042-12-31"),
  contractDurationYears: 15, contractDurationMonths: 0,
  hedgeType: CHOICE_FINANCE.hedgingType.hedgedVolumePercent, hedgedVolume: 70, fixedContractedMwhPa: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: 0, inflationStartYear: 0,
  inflationCountryArea: null, considerNegativePrices: false, negativePriceManualOverride: false,
  currencyId: "cur-eur", currencyName: "Euro", subaccountId: "sub-1", flags: noFlags,
  createdOn: "2026-01-01T00:00:00Z", canEdit: true, canDelete: true, isFolded: false, ...over,
});
const YEARS = 30;
const individualContract = (id: string) => contract(id, {
  hedgeType: CHOICE_FINANCE.hedgingType.individualVolumes, hedgedVolume: null,
  contractEndDate: d(`${2028 + YEARS - 1}-12-31`), contractDurationYears: YEARS,
});
const storedVolumes = Array.from({ length: YEARS }, (_, i) => ({
  recordId: `v-${i}`, year: 2028 + i, startDate: d(`${2028 + i}-01-01`), endDate: d(`${2028 + i}-12-31`),
  value: "5", initialState: false,
}));

const LATENCY_MS = 60;
const state = { contracts: [] as StoredRevenueContract[], volumes: [] as typeof storedVolumes };
const events: { name: string; at: number }[] = [];
const mark = (name: string) => events.push({ name, at: performance.now() });
const later = <T,>(v: T, ms = LATENCY_MS) => new Promise<T>((r) => { setTimeout(() => r(v), ms); });
const plans: WritePlan[] = [];
const planErrors: unknown[] = [];
/** What the mocked reads answer. `idsFail`: the volume-id read rejects (a 403, a timeout). */
const reads = {
  idsFail: false, overlap: [] as { id: string; startDate: Date; endDate: Date; hedgedVolume: number }[],
  /** Per-read latency, ms. */ overlapMs: LATENCY_MS, idsMs: LATENCY_MS,
};
const run = vi.fn(async (job: PlanJob): Promise<string[] | null> => {
  // Like `usePlanWrite`: the plan factory is awaited inside the job, and its failure is reported, never thrown at the click.
  try {
    plans.push(typeof job.plan === "function" ? await job.plan() : job.plan);
    mark("plan-ready");
  } catch (e) {
    planErrors.push(e);
    return null;
  }
  return [];
});
const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false }),
}));
vi.mock("./hooks", () => ({
  TABLES: ["vsb_projectrevenues"],
  useRevenueProject: () => ok(project),
  useItalyRegion: () => null,
  useRevenueAssumptions: () => ({ data: [], isLoading: false, error: undefined, connected: false }),
  useRevenueContracts: () => ok(state.contracts),
  useBalancingPrices: () => ok([]),
  useIndividualVolumes: () => ok(state.volumes),
  useNegativePriceProduction: () => ok(false),
  useRevenueSubaccount: () => ok({ id: "sub-1", name: "Revenues" }),
  useRevenueCurrency: () => ok({ id: "cur-eur", name: "Euro" }),
  useCountryInflationProfiles: () => ok([]),
  useRevenueWrites: () => ({ run, progress: null, error: null, success: null, clear: () => {} }),
  fetchOverlappingContracts: async () => { mark("overlap-start"); const r = await later(reads.overlap, reads.overlapMs); mark("overlap-done"); return r; },
  fetchIndividualVolumeIds: async () => {
    mark("ids-start");
    await later(null, reads.idsMs);
    mark("ids-done");
    if (reads.idsFail) throw new Error("HTTP 403");
    return ["v-old"];
  },
}));
vi.mock("./rules", async (importOriginal) => {
  const real = await importOriginal<typeof import("./rules")>();
  return { ...real, volumeRowLabel: vi.fn(real.volumeRowLabel) };
});

import ProjectRevenuesScreen from "./Screen";
import { volumeRowLabel } from "./rules";

const labelSpy = vi.mocked(volumeRowLabel);
const renderScreen = () => render(
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter initialEntries={["/project/revenues"]}><ProjectRevenuesScreen /></MemoryRouter>
  </FluentProvider>,
);
const button = (testId: string) => screen.getByTestId(testId) as HTMLButtonElement;
const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const BAR = (id: string) => `pcf_ProjectRevenues_Content_ContractCommandBar_3-${id}`;
const VOLUME = "txt_ProjectRevenue_RightPanel_IndividualVolume_Value";
const SAVE = "pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1";
const TARIFF = "txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_1";
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const at = (name: string) => events.find((e) => e.name === name)?.at ?? NaN;

async function openEdit(id: string) {
  fireEvent.click(await waitFor(() => {
    const b = button(`${BAR(id)}-editRevenueContract`);
    expect(b.disabled).toBe(false);
    return b;
  }));
  expect(await screen.findByText("Edit Revenue Contract")).toBeTruthy();
}

beforeEach(() => {
  state.contracts = [];
  state.volumes = [];
  events.length = 0;
  plans.length = 0;
  planErrors.length = 0;
  reads.idsFail = false;
  reads.overlap = [];
  reads.overlapMs = LATENCY_MS;
  reads.idsMs = LATENCY_MS;
  run.mockClear();
  labelSpy.mockClear();
});

describe("UT-REVPERF Screen: a keystroke in an Individual-volume box (LOCAL-MOCK: jsdom, relative only)", () => {
  it("UT-REVPERF-120 prints the volume-row renders and the commit time of each keystroke in a 30-year contract", async () => {
    state.contracts = [individualContract("r-1")];
    state.volumes = storedVolumes;
    renderScreen();
    await openEdit("r-1");
    await waitFor(() => expect(screen.getAllByTestId(VOLUME)).toHaveLength(YEARS));
    const boxes = screen.getAllByTestId(VOLUME) as HTMLInputElement[];
    const callsPerKey: number[] = [];
    const msPerKey: number[] = [];
    for (const v of ["6", "66", "666", "6666", "66666", "6", "7", "8", "9", "10"]) {
      labelSpy.mockClear();
      const t0 = performance.now();
      fireEvent.change(boxes[4]!, { target: { value: v } });
      msPerKey.push(performance.now() - t0);
      callsPerKey.push(labelSpy.mock.calls.length);
    }
    expect(boxes[4]!.value).toBe("10");
    // Only the edited row is rebuilt: exactly 1 call per keystroke, not one per row (the baseline was 30 for 30 rows).
    expect(callsPerKey).toEqual(Array.from({ length: callsPerKey.length }, () => 1));
    console.info(
      `[BENCH keystroke LOCAL-MOCK] rows=${YEARS} volumeRowLabel calls per keystroke: ${JSON.stringify(callsPerKey)}; `
      + `commit ms median=${median(msPerKey).toFixed(1)} min=${Math.min(...msPerKey).toFixed(1)} max=${Math.max(...msPerKey).toFixed(1)}`,
    );
  }, 60000);
});

describe("UT-REVPERF Screen: the Save's pre-write reads (LOCAL-MOCK: real timers, 60 ms per read)", () => {
  it("UT-REVPERF-121 prints when each read starts and when the plan is ready, for an Edit of a percentage contract", async () => {
    state.contracts = [contract("r-1")];
    renderScreen();
    await openEdit("r-1");
    fireEvent.change(input(TARIFF), { target: { value: "66.50" } });
    const save = await waitFor(() => { const b = button(SAVE); expect(b.disabled).toBe(false); return b; });
    events.length = 0;
    const t0 = performance.now();
    fireEvent.click(save);
    await waitFor(() => expect(plans).toHaveLength(1), { timeout: 5000 });
    const rel = (n: string) => Math.round(at(n) - t0);
    console.info(
      `[BENCH save pre-reads LOCAL-MOCK] overlap-start=${rel("overlap-start")} overlap-done=${rel("overlap-done")} `
      + `ids-start=${rel("ids-start")} ids-done=${rel("ids-done")} plan-ready=${rel("plan-ready")} (ms after the click; read latency ${LATENCY_MS})`,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]!.writes[0]).toMatchObject({ op: "update", id: "r-1" });
    // D146: the volume-id read starts BESIDE the overlap read, not after it (baseline: ids-start came after overlap-done) ...
    expect(at("ids-start")).toBeLessThan(at("overlap-done"));
    // ... and the plan still deletes the ids that fresh read returned (the orphan protection is unchanged).
    expect(plans[0]!.writes.filter((w) => w.op === "delete").map((w) => w.id)).toEqual(["v-old"]);
  });
});

describe("UT-REVPERF Screen: Individual-volume rows after the extraction (D146)", () => {
  const openIndividual = async () => {
    state.contracts = [individualContract("r-1")];
    state.volumes = storedVolumes;
    renderScreen();
    await openEdit("r-1");
    await waitFor(() => expect(screen.getAllByTestId(VOLUME)).toHaveLength(YEARS));
    return screen.getAllByTestId(VOLUME) as HTMLInputElement[];
  };

  it("UT-REVPERF-122 a typed value lands in its own row only, and every row keeps its test ids, labels and period box", async () => {
    const boxes = await openIndividual();
    fireEvent.change(boxes[4]!, { target: { value: "66" } });
    const after = screen.getAllByTestId(VOLUME) as HTMLInputElement[];
    expect(after.map((b) => b.value)).toEqual(Array.from({ length: YEARS }, (_, i) => (i === 4 ? "66" : "5")));
    for (const b of after) expect(b.getAttribute("aria-label")).toBe(VOLUME);
    const years = screen.getAllByTestId("txt_ProjectRevenue_RightPanel_IndividualVolume_Year") as HTMLInputElement[];
    expect(years).toHaveLength(YEARS);
    expect(years.every((y) => y.readOnly && y.value !== "")).toBe(true);
    expect(screen.getAllByTestId("lbl_ProjectRevenue_RightPanel_IndividualVolume_Header")).toHaveLength(YEARS);
    // the edit marks the form changed: Save is enabled without touching any other field
    expect(button(SAVE).disabled).toBe(false);
  });

  it("UT-REVPERF-123 two edits in one batch both land (the setter works on the current form, not on a stale one)", async () => {
    const boxes = await openIndividual();
    // Inside ONE act() React batches both updates into one render, so the second handler runs before the first edit is
    // rendered: a setter that closed over the rendered form would drop the first edit.
    act(() => {
      fireEvent.change(boxes[2]!, { target: { value: "7" } });
      fireEvent.change(boxes[3]!, { target: { value: "8" } });
    });
    const after = (screen.getAllByTestId(VOLUME) as HTMLInputElement[]).map((b) => b.value);
    expect(after.slice(0, 6)).toEqual(["5", "5", "7", "8", "5", "5"]);
  });

  it("UT-REVPERF-124 the Save writes the typed values: one create per year, the edited year carrying the new MWh", async () => {
    const boxes = await openIndividual();
    fireEvent.change(boxes[4]!, { target: { value: "66" } });
    fireEvent.click(button(SAVE));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(plans).toHaveLength(1), { timeout: 5000 });
    const w = plans[0]!.writes;
    expect(w.filter((x) => x.op === "delete")).toHaveLength(1); // the one id the fresh read returned
    const creates = w.filter((x) => x.op === "create" && x.entitySet === "vsb_revenueindividualhedgevolumes");
    expect(creates).toHaveLength(YEARS);
    const mwh = creates.map((x) => Object.values(x.data ?? {}).map(String).filter((v) => v === "66" || v === "5"));
    expect(mwh.filter((m) => m.includes("66"))).toHaveLength(1);
    expect(mwh.filter((m) => m.includes("5"))).toHaveLength(YEARS - 1);
    // an Individual Edit has no overlap read: the id read starts when the Save starts, as before
    expect(events.some((e) => e.name === "overlap-start")).toBe(false);
  }, 30000);
});

describe("UT-REVPERF Screen: the Save's pre-reads side by side (D146)", () => {
  const saveFromTariff = async () => {
    state.contracts = [contract("r-1")];
    renderScreen();
    await openEdit("r-1");
    fireEvent.change(input(TARIFF), { target: { value: "66.50" } });
    const save = await waitFor(() => { const b = button(SAVE); expect(b.disabled).toBe(false); return b; });
    events.length = 0;
    fireEvent.click(save);
  };

  it("UT-REVPERF-125 a failed id read is reported through the plan, writes nothing, and is not an unhandled rejection", async () => {
    reads.idsFail = true;
    reads.idsMs = 5;       // the id read fails while the (slower) overlap read is still pending: with no handler on the
    reads.overlapMs = 150; // early promise that rejection would be reported as unhandled
    await saveFromTariff();
    await waitFor(() => expect(planErrors).toHaveLength(1), { timeout: 5000 });
    expect((planErrors[0] as Error).message).toBe("HTTP 403");
    expect(plans).toHaveLength(0); // no write plan: nothing is sent
    expect(at("ids-start")).toBeLessThan(at("overlap-done"));
  });

  it("UT-REVPERF-126 a blocked hedge check sends no write, and the early read is harmless", async () => {
    reads.overlap = [{ id: "x-1", startDate: d("2028-01-01"), endDate: d("2042-12-31"), hedgedVolume: 40 }]; // 40 + 70 > 100
    await saveFromTariff();
    expect(await screen.findByText("Hedged Volume more than 100%", undefined, { timeout: 5000 })).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    expect(plans).toHaveLength(0);
    expect(events.some((e) => e.name === "ids-start")).toBe(true); // the read ran beside the check; its answer is dropped
  });
});
