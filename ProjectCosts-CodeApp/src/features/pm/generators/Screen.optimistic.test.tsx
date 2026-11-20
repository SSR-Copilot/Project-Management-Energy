// @vitest-environment jsdom
/**
 * UT-GENPERF-320.. — the status toggle with `GENERATORS_PERF.optimisticToggle` ON and OFF, as the Generators Screen runs it (D143).
 * `./hooks` is mocked, as in `Screen.gate.test.tsx`; `run` is a stub that calls the job's `optimistic` hook the way `usePlanWrite`
 * does, then waits until the test lets the "writes" end. What is pinned here: the job carries the hook only with the switch on, the
 * plan is built from the real rows, and the screen holds every command back while the optimistic rows are in the cache (F3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import type { WritePlan } from "@/data/writePlan";
import type { CatalogModel, GeneratorTypeRow, SimpleTypeRow, TurbineRow } from "./rules";

const baseProject = {
  id: "11111111-1111-1111-1111-111111111111", projectIdText: "DE-0001", projectName: "Windpark Nord", shortName: "WPN",
  countryId: "c-de", countryName: "Germany", countryOptionValue: 952850000, isoCurrencyCode: "EUR",
  totalCapacity: 30, fid: "2028-06-01", endDate: "2055-12-31", projectStartDate: "2026-01-01",
  projectManagerId: "pm-1", projectManagerEmail: null, owningBusinessUnitId: "bu-1", plantPvCapacity: 10,
  plantWtgCapacity: 20, plantStorageCapacity: 0, plantHydrogenCapacity: 0, plantSubstationCapacity: 0,
};
const MODEL: CatalogModel = {
  id: "g1", name: "V150", displayName: "Vestas V150-5.6 - available", supplier: "Vestas", turbineType: "V150",
  hubHeight: 148, rotorDiameter: 150, specificCapacity: 5.6, totalHeight: 223, earliestPhaseout: "2035-01-01",
  countryAvailability: [952850000], foundationCostIncluded: true, additionalFoundationCost: 0,
  prices: [1_000_000, 950_000, 900_000, 850_000, 800_000],
};
const TYPE: GeneratorTypeRow = {
  id: "t1", name: "WTG-0001", generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 2,
  costPerWtg: 950_000, generatorsCost: 1_900_000, generatorsCapacity: 11.2, requestPermissionState: null,
  flowRunId: null, flowApprovalId: null, status: CHOICE_PLANT.status.active, specificCapacity: null,
};
const turbine = (i: number): TurbineRow => ({
  id: `w${i}`, name: `WTG WPN_${i}`, typeId: "t1", index: i, effectiveCapacity: 5.6, effectiveHubHeight: null,
  effectiveHubHeightChanged: false, foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status: 0,
});

type Job = { plan: WritePlan | (() => Promise<WritePlan>); optimistic?: (qc: QueryClient) => Promise<unknown>; reload?: unknown };
const state = vi.hoisted(() => ({
  qc: null as unknown as import("@tanstack/react-query").QueryClient,
  /** Resolved by a test to let the stubbed writes end. */
  release: null as null | (() => void),
  refreshing: false,
  jobs: [] as unknown[],
  run: vi.fn(async (job: unknown) => {
    state.jobs.push(job);
    const j = job as Job;
    await j.optimistic?.(state.qc);
    await new Promise<void>((resolve) => { state.release = resolve; });
    return ["x"] as string[];
  }),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "11111111-1111-1111-1111-111111111111", locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true, hasData: true, placeholder: false });
vi.mock("./hooks", () => ({
  SERVER_DECIDES: {
    canEdit: true, editPermission: true, pvEditPermission: true,
    deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
  },
  useGeneratorsProject: () => ok(baseProject),
  useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
  useGeneratorTypes: () => ok([TYPE]),
  useModulePermissionFlows: () => ({ request: async () => ({}), cancel: async () => {}, cancelIfOpen: async () => {} }),
  useGeneratorModels: () => ok([MODEL]),
  useGeneratorCatalog: () => ok([MODEL]),
  useInflationIndex: () => ok(1),
  useDeviceCosts: () => ok({ modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }),
  useProjectTurbines: () => ok([turbine(1), turbine(2)]),
  usePvModuleCatalog: () => ok([]),
  usePvModuleTypes: () => ok([] as SimpleTypeRow[]),
  useInverterTypes: () => ok([]),
  useSubstructureTypes: () => ok([]),
  useSimpleTypes: () => ok([]),
  useAllWtgLandLeaseCosts: () => ok([]),
  useOpexDependency: () => ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
  useEntraObjectId: () => "pm-1",
  useGeneratorWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {}, refreshing: state.refreshing }),
  loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
  loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
  loadAllocations: async () => ({ allocations: [], countByCost: {} }),
  loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
  loadPvDeleteInputs: async () => ({ unitIds: [], allocations: [], countByCost: {}, opexCostIds: [] }),
  loadReplaceInputs: async () => ({ bridgeIds: [], opexCostIds: [], unitIds: [], allocations: [], landLeaseCosts: [] }),
  usePlantSupplierCatalog: () => ok([]),
}));

import GeneratorsScreen from "./Screen";

const tree = () => (
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><GeneratorsScreen /></MemoryRouter>
  </FluentProvider>
);
const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar" });
const addWtg = () => within(commandBar()).getByRole("button", { name: "Add WTG Type" }) as HTMLButtonElement;

beforeEach(() => {
  state.qc = new QueryClient();
  state.release = null;
  state.refreshing = false;
  state.jobs = [];
});
afterEach(() => {
  cleanup();
  setGeneratorsPerfFlags(null);
  state.run.mockClear();
});

/** Select the type, Deactivate, confirm: the job is handed to `run`. */
async function startToggle() {
  fireEvent.click(screen.getByTestId("gal_Generators_DisplayProject_Body_Form_GeneratorTypes-select-t1"));
  fireEvent.click(await within(commandBar()).findByRole("button", { name: "Deactivate" }));
  fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
  await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
}

describe("the optimistic status toggle on the screen (D143)", () => {
  it("UT-GENPERF-320 switch ON: the toggle's job carries the optimistic hook and a plan built from the real rows", async () => {
    setGeneratorsPerfFlags({ optimisticToggle: true });
    render(tree());
    await startToggle();
    const job = state.jobs[0] as Job;
    expect(typeof job.optimistic).toBe("function");
    // The plan is a ready plan (not built from the cache after the optimistic rows went in): the type, both turbines, the roll-up.
    const plan = job.plan as WritePlan;
    expect(plan.writes.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(plan.writes)).toContain(`"statecode":${CHOICE_PLANT.status.inactive}`);
    await act(async () => { state.release?.(); });
  });

  it("UT-GENPERF-321 switch OFF (canvas parity): the job has no optimistic hook, and the commands are not held back by it", async () => {
    render(tree());
    await startToggle();
    expect((state.jobs[0] as Job).optimistic).toBeUndefined();
    expect(addWtg().disabled).toBe(false);
    await act(async () => { state.release?.(); });
  });

  it("UT-GENPERF-322 switch ON: while the optimistic rows are in the cache every command stays off (F3), then they come back once the reload has ended", async () => {
    setGeneratorsPerfFlags({ optimisticToggle: true });
    const { rerender } = render(tree());
    await startToggle();
    // The writes are running and the optimistic rows are shown: nothing may be built from them.
    await waitFor(() => expect(addWtg().disabled).toBe(true));
    // The writes end; the reload is running (`refreshing`): still not settled.
    state.refreshing = true;
    await act(async () => { state.release?.(); });
    rerender(tree());
    expect(addWtg().disabled).toBe(true);
    // The reload has landed the server's rows.
    state.refreshing = false;
    rerender(tree());
    await waitFor(() => expect(addWtg().disabled).toBe(false));
  });

  it("UT-GENPERF-323 switch ON: a job refused before it starts (a second click while one runs) shows and holds nothing", async () => {
    setGeneratorsPerfFlags({ optimisticToggle: true });
    state.run.mockImplementationOnce(async (job: unknown) => { state.jobs.push(job); return null as unknown as string[]; });
    render(tree());
    await startToggle();
    // The stub never called the hook (as `run` does when its one-job guard refuses): the screen is not held back.
    await waitFor(() => expect(addWtg().disabled).toBe(false));
  });
});
