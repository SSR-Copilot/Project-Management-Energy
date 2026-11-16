// @vitest-environment jsdom
/**
 * Render tests for the rollback of a failed create save on the Generators screen (plan §9.3, work package S).
 * `./hooks` is mocked, with a STATEFUL `useGeneratorWrites` that behaves like `usePlanWrite` (the error is set
 * before `run` resolves to null, `run` clears it first, `lastLanded()` is what the job landed), so the screen's
 * own state machine runs for real. The flag `GENERATORS_BULK.createRollback` is switched per test.
 * Ids continue the Screen.test.tsx block (UT-GEN-930 and up; 945 and up: the independent review's findings).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import {
  ROLLBACK_MSG, describeLeftovers,
  type CatalogModel, type GeneratorTypeRow, type LandedRowRef, type SimpleTypeRow, type TurbineRow,
} from "./rules";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const baseProject = {
  id: PROJECT_ID, projectIdText: "DE-0001", projectName: "Windpark Nord", shortName: "WPN",
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

/** Not available in Germany: the model an out-of-country save picks. */
const MODEL2: CatalogModel = {
  ...MODEL, id: "g2", name: "SG145", displayName: "Siemens SG145 - not available", supplier: "Siemens", turbineType: "SG145",
  hubHeight: 120, countryAvailability: [952850001],
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

const row = (over: Partial<SimpleTypeRow>): SimpleTypeRow => ({
  id: "r", name: null, supplier: null, otherSupplier: null, capacity: null, cost: null, moduleLabel: null,
  degradation1stYear: null, degradationRemainingYears: null, requestPermissionState: null, flowRunId: null,
  flowApprovalId: null, status: 0, ...over,
});
const PV = row({ id: "pv1", name: "PVT-0001", moduleLabel: "JA 550", catalogueId: "m1", catalogueSupplier: "JA Solar", capacity: 10, cost: 3000 });

const TYPE_TABLE = "vsb_generatortypeinprojects";
const TURBINE_TABLE = "vsb_generatorinprojects";
const ALLOC_TABLE = "vsb_landleaseallocationwtgs";
const landedRow = (entitySet: string, id: string): LandedRowRef => ({ entitySet, id });
/** What a failed Add WTG type left behind: the type, its two turbines and one allocation. */
const LANDED_ALL: LandedRowRef[] = [
  landedRow(TYPE_TABLE, "new-type"), landedRow(TURBINE_TABLE, "nw1"), landedRow(TURBINE_TABLE, "nw2"), landedRow(ALLOC_TABLE, "al1"),
];

type Job = {
  progress: string;
  success?: unknown;
  errorText?: (detail: string) => string;
  plan: WritePlan | (() => Promise<WritePlan>);
  then?: (first: unknown, ctl: { setProgress: (t: string) => void }) => Promise<WritePlan | null | undefined>;
};
type Outcome = { ids: string[] } | { fail: string };

const UNDO_PROGRESS = "Undoing the failed save, please wait...";
const REASON = "“Add the new type” failed: boom. 1 of 4 changes had already been saved.";

const state = vi.hoisted(() => ({
  flag: true,
  refreshing: false,
  /** The project row the screen reads; null = not loaded (review finding 3c). */
  project: null as unknown,
  /** When set, a rollback job waits for it before answering (a rollback still running). */
  gate: null as Promise<void> | null,
  projectId: "11111111-1111-1111-1111-111111111111",
  jobs: [] as Job[],
  landed: [] as LandedRowRef[],
  landedCalls: 0,
  /** What the job number `n` does: resolves the plan and `then` like the engine, then answers. */
  exec: null as unknown as (job: Job, n: number) => Promise<{ outcome: Outcome; landed?: LandedRowRef[] }>,
  flows: {
    request: vi.fn(async () => ({ runid: "run-1", approvalid: "ap-1" })),
    cancel: vi.fn(async () => {}),
    cancelIfOpen: vi.fn(async () => {}),
  },
}));

vi.mock("@/data/generatorsBulkFlags", () => ({
  GENERATORS_BULK: new Proxy({}, { get: (_t, key) => (key === "createRollback" ? state.flag : false) }),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: state.projectId, locale: "en-US", loading: false, envVars: {}, session: { entraObjectId: "pm-1" } }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", async () => {
  const React = await import("react");
  return {
    SERVER_DECIDES: {
      canEdit: true, editPermission: true, pvEditPermission: true,
      deletePermission: { wtg: true, pv: true, inverter: true, substructure: true, storage: true, hydrogen: true, substation: true },
    },
    useGeneratorsProject: () => ok(state.project),
    useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
    useGeneratorTypes: () => ok([TYPE]),
    useModulePermissionFlows: () => state.flows,
    useGeneratorModels: () => ok([MODEL]),
    useGeneratorCatalog: () => ok([MODEL, MODEL2]),
    useInflationIndex: () => ok(1),
    useDeviceCosts: () => ok({ modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }),
    useProjectTurbines: () => ok([turbine(1), turbine(2)]),
    usePvModuleCatalog: () => ok([{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }]),
    usePvModuleTypes: () => ok([PV]),
    useInverterTypes: () => ok([]),
    useSubstructureTypes: () => ok([]),
    useSimpleTypes: () => ok([]),
    useAllWtgLandLeaseCosts: () => ok([]),
    useOpexDependency: () => ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
    useEntraObjectId: () => "pm-1",
    useGeneratorWrites: () => {
      const [progress, setProgress] = React.useState<string | null>(null);
      const [error, setError] = React.useState<string | null>(null);
      const run = async (job: Job): Promise<string[] | null> => {
        state.jobs.push(job);
        const n = state.jobs.length - 1;
        setError(null);
        state.landed = [];
        setProgress(job.progress);
        try {
          const { outcome, landed } = await state.exec(job, n);
          state.landed = landed ?? [];
          if ("fail" in outcome) { setError(outcome.fail); return null; }
          return outcome.ids;
        } finally {
          setProgress(null);
        }
      };
      return {
        run, progress, error, success: null, clear: () => setError(null), refreshing: state.refreshing,
        lastLanded: () => { state.landedCalls += 1; return state.landed; },
      };
    },
    loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
    loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
    loadAllocations: async () => ({ allocations: [], countByCost: {} }),
    loadTypeDeleteInputs: async () => ({ allocations: [], countByCost: {}, opexCostIds: [] }),
    loadPvDeleteInputs: async () => ({ unitIds: ["u1"], allocations: [], countByCost: {}, opexCostIds: ["o1"] }),
    loadReplaceInputs: async () => ({ bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["w1", "w2"], allocations: [], landLeaseCosts: [] }),
    usePlantSupplierCatalog: () => ok([]),
  };
});

import GeneratorsScreen from "./Screen";

const wrap = (ui: React.ReactNode) => (
  <FluentProvider theme={vsbTheme}><MemoryRouter>{ui}</MemoryRouter></FluentProvider>
);
const renderScreen = () => render(wrap(<GeneratorsScreen />));

const resolvePlan = async (job: Job): Promise<WritePlan> => (typeof job.plan === "function" ? job.plan() : job.plan);
const isUndo = (job: Job) => job.progress === UNDO_PROGRESS;
const FIRST = { done: 0, createdIds: ["new-type", "nw1", "nw2"], createdRows: { "new-type": { vsb_name: "WTG-0099" } } };

/** The Add WTG type job is driven like the engine does: the plan, then `then` (which may call the permission flow). */
async function driveSave(job: Job, fail: string, landed: LandedRowRef[]): Promise<{ outcome: Outcome; landed: LandedRowRef[] }> {
  await resolvePlan(job);
  if (job.then) {
    try { await job.then(FIRST, { setProgress: () => {} }); } catch (e) { return { outcome: { fail: `${fail} ${(e as Error).message}` }, landed }; }
  }
  return { outcome: { fail }, landed };
}
/** Script: job 0 (the save) fails with `landed`; the rollback jobs answer from `undo`. */
function script(saveLanded: LandedRowRef[], undo: Outcome[]) {
  let u = 0;
  state.exec = async (job, n) => {
    if (n === 0) return driveSave(job, REASON, saveLanded);
    if (isUndo(job)) {
      if (state.gate) await state.gate;
      return { outcome: undo[Math.min(u++, undo.length - 1)]! };
    }
    return { outcome: { ids: [] } };
  };
}

// `hidden: true`: in jsdom tabster marks the page aria-hidden for a moment after a panel closes (CA-19).
const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar", hidden: true });
const command = (name: string) => within(commandBar()).getByRole("button", { name, hidden: true }) as HTMLButtonElement;

async function pick(testId: string, option: string) {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

/** Opens Add WTG Type, fills it (Germany = in country; the toggle = out of country) and presses Save. */
async function saveNewType(outOfCountry = false) {
  fireEvent.click(command("Add WTG Type"));
  await screen.findByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save");
  if (outOfCountry) {
    fireEvent.click(await screen.findByTestId("tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"));
    await waitFor(() => expect(screen.getByText("Generators not available for Germany")).toBeTruthy());
  }
  await pick("cmb_Supplier", outOfCountry ? "Siemens" : "Vestas");
  await pick("cmb_Supplier_1", outOfCountry ? "SG145" : "V150");
  await pick("cmb_Supplier_2", outOfCountry ? "120" : "148");
  fireEvent.change(screen.getByTestId("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator"), { target: { value: "2" } });
  const save = () => screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save") as HTMLButtonElement;
  await waitFor(() => expect(save().disabled).toBe(false));
  fireEvent.click(save());
}

const errorBar = () => screen.queryByTestId("generators-write-error");
const retryButton = () => screen.queryByTestId("generators-retry-cleanup") as HTMLButtonElement | null;
const shape = (plan: WritePlan) => plan.writes.map((w) => `${w.op}:${w.entitySet}`);
const LEFTOVER_ALL = ROLLBACK_MSG.leftover(describeLeftovers(LANDED_ALL, { typeName: "WTG-0099" }));

beforeEach(() => {
  state.flag = true;
  state.refreshing = false;
  state.project = baseProject;
  state.gate = null;
  state.projectId = PROJECT_ID;
  state.jobs = [];
  state.landed = [];
  state.landedCalls = 0;
  state.flows.request.mockClear();
  state.flows.request.mockImplementation(async () => ({ runid: "run-1", approvalid: "ap-1" }));
});
afterEach(() => cleanup());

describe("UT-GEN Screen rollback of a failed create save (plan §9.3)", () => {
  it("UT-GEN-930 flag off: a failed Add WTG type shows today's error only: no rollback job, no Retry button", async () => {
    state.flag = false;
    script(LANDED_ALL, [{ ids: [] }]);
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(errorBar()).not.toBeNull());
    expect(errorBar()!.textContent).toContain(REASON);
    expect(state.jobs).toHaveLength(1);
    expect(state.landedCalls).toBe(0);
    expect(retryButton()).toBeNull();
  });

  it("UT-GEN-931 flag on but nothing landed: no rollback job, today's error only", async () => {
    script([], [{ ids: [] }]);
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(errorBar()).not.toBeNull());
    expect(state.jobs).toHaveLength(1);
    expect(state.landedCalls).toBeGreaterThan(0);
    expect(errorBar()!.textContent).not.toContain(ROLLBACK_MSG.undone);
    expect(retryButton()).toBeNull();
  });

  it("UT-GEN-932 in country: the type landed, then the failure: the rollback job deletes it, then recomputes the roll-up", async () => {
    script(LANDED_ALL, [{ ids: [] }]);
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    const undo = state.jobs[1]!;
    expect(undo.progress).toBe(UNDO_PROGRESS);
    expect(undo.success).toBeUndefined();
    const plan = await resolvePlan(undo);
    expect(plan.refusedReason).toBeUndefined();
    // Allocation, turbines (one parallel run), the type; the roll-up last. A bare delete per landed row, ids as landed.
    expect(shape(plan)).toEqual([
      `delete:${ALLOC_TABLE}`, `delete:${TURBINE_TABLE}`, `delete:${TURBINE_TABLE}`, `delete:${TYPE_TABLE}`, "update:vsb_projects",
    ]);
    expect(plan.writes.filter((w) => w.op === "delete").map((w) => w.id)).toEqual(["al1", "nw1", "nw2", "new-type"]);
    // The roll-up is rebuilt from the project's remaining types (TYPE: 11.2 MW), without the new one.
    expect(plan.writes[4]!.data).toMatchObject({ vsb_plantwtgcapacity: 11.2, vsb_plantwtgcost: 1_900_000 });
    // Original reason plus the undone text, in the error bar; no Retry button.
    await waitFor(() => expect(errorBar()!.textContent).toContain(`${REASON} ${ROLLBACK_MSG.undone}`));
    expect(retryButton()).toBeNull();
  });

  it("UT-GEN-933 out of country: a permission-flow failure rolls back too, and the project totals are left alone", async () => {
    state.flows.request.mockImplementation(async () => { throw new Error("flow refused"); });
    // The first job's rows landed; the flow (the job's `then`) then failed.
    script(LANDED_ALL.slice(0, 3), [{ ids: [] }]);
    renderScreen();
    await saveNewType(true);
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    expect(state.flows.request).toHaveBeenCalledTimes(1);
    const plan = await resolvePlan(state.jobs[1]!);
    expect(shape(plan)).toEqual([`delete:${TURBINE_TABLE}`, `delete:${TURBINE_TABLE}`, `delete:${TYPE_TABLE}`]);
    await waitFor(() => expect(errorBar()!.textContent).toContain(ROLLBACK_MSG.undone));
  });

  it("UT-GEN-934 the rollback fails: the message names what is left and Retry cleanup appears", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }]);
    renderScreen();
    await saveNewType();
    const retry = await screen.findByTestId("generators-retry-cleanup") as HTMLButtonElement;
    expect(retry.getAttribute("aria-label")).toBe("Retry cleanup");
    expect(retry.textContent).toBe(ROLLBACK_MSG.retryButton);
    expect(retry.disabled).toBe(false);
    expect(errorBar()!.textContent).toContain(LEFTOVER_ALL);
    expect(errorBar()!.textContent).toContain('generator type "WTG-0099", 2 generators, 1 land-lease allocation');
    expect(errorBar()!.textContent).not.toContain(ROLLBACK_MSG.undone);
  });

  it("UT-GEN-935 Retry cleanup re-runs the plan over only the recorded rows; on success the leftovers and the button go", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }, { ids: [] }]);
    renderScreen();
    await saveNewType();
    fireEvent.click(await screen.findByTestId("generators-retry-cleanup"));
    await waitFor(() => expect(state.jobs).toHaveLength(3));
    const again = state.jobs[2]!;
    expect(again.progress).toBe(UNDO_PROGRESS);
    const first = await resolvePlan(state.jobs[1]!);
    const plan = await resolvePlan(again);
    expect(plan.writes.filter((w) => w.op === "delete").map((w) => `${w.entitySet}/${w.id}`))
      .toEqual(first.writes.filter((w) => w.op === "delete").map((w) => `${w.entitySet}/${w.id}`));
    await waitFor(() => expect(retryButton()).toBeNull());
    // The original reason is kept in the success text.
    expect(errorBar()!.textContent).toContain(`${REASON} ${ROLLBACK_MSG.undone}`);
    expect(errorBar()!.textContent).not.toContain("could not be fully undone");
  });

  it("UT-GEN-936 Retry cleanup fails again: the leftover message and the button stay, with no automatic retry", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }, { fail: "still refused" }]);
    renderScreen();
    await saveNewType();
    fireEvent.click(await screen.findByTestId("generators-retry-cleanup"));
    await waitFor(() => expect(state.jobs).toHaveLength(3));
    await waitFor(() => expect(retryButton()).not.toBeNull());
    await waitFor(() => expect(errorBar()!.textContent).toContain(LEFTOVER_ALL));
    expect(state.jobs).toHaveLength(3);
  });

  it("UT-GEN-937 Retry cleanup is disabled while the screen reloads", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }]);
    const view = renderScreen();
    await saveNewType();
    const retry = await screen.findByTestId("generators-retry-cleanup") as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    state.refreshing = true;
    view.rerender(wrap(<GeneratorsScreen />));
    expect((screen.getByTestId("generators-retry-cleanup") as HTMLButtonElement).disabled).toBe(true);
  });

  it("UT-GEN-938 starting a new command clears the leftover state: the message and the button go", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }]);
    renderScreen();
    await saveNewType();
    await screen.findByTestId("generators-retry-cleanup");
    fireEvent.click(command("Add PV Module Type"));
    await waitFor(() => expect(retryButton()).toBeNull());
    expect(errorBar()).toBeNull();
  });

  it("UT-GEN-939 a project change clears the leftover state", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }]);
    const view = renderScreen();
    await saveNewType();
    await screen.findByTestId("generators-retry-cleanup");
    state.projectId = "22222222-2222-2222-2222-222222222222";
    view.rerender(wrap(<GeneratorsScreen />));
    await waitFor(() => expect(retryButton()).toBeNull());
    expect(errorBar()).toBeNull();
  });

  /** Every create job but Add WTG type is consulted too, and none is rolled back (`rollbackApplies` is false). */
  const failingCreate = (landed: LandedRowRef[]) => {
    state.exec = async (job, n) => {
      if (n === 0) {
        await resolvePlan(job);
        return { outcome: { fail: REASON }, landed };
      }
      return { outcome: { ids: [] } };
    };
  };

  it("UT-GEN-940 a failed Add BESS (simple type) never rolls back, even with rows landed", async () => {
    failingCreate([landedRow("vsb_storagetypeinprojects", "s-new")]);
    renderScreen();
    fireEvent.click(command("Add Others"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "BESS" }));
    const type = (testId: string, value: string) =>
      fireEvent.change(screen.getByTestId(testId), { target: { value } });
    await screen.findByTestId("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel");
    type("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel", "BESS West");
    type("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageCapacityMW_5", "5");
    type("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageCapacityMW_6", "10");
    type("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageSupplier", "Tesla");
    const save = () => screen.getByTestId("pcf_btn_GeneratorData_RightPanel_Form_Storage_Buttons_Save_2") as HTMLButtonElement;
    await waitFor(() => expect(save().disabled).toBe(false));
    fireEvent.click(save());
    await waitFor(() => expect(errorBar()).not.toBeNull());
    expect(state.jobs).toHaveLength(1);
    // `rollbackApplies` said no before the landed rows were even read.
    expect(state.landedCalls).toBe(0);
    expect(errorBar()!.textContent).not.toContain(ROLLBACK_MSG.undone);
    expect(retryButton()).toBeNull();
  });

  it("UT-GEN-941 a failed Add Generator (one turbine) never rolls back, even with rows landed", async () => {
    failingCreate([landedRow(TURBINE_TABLE, "w-new")]);
    renderScreen();
    fireEvent.click(screen.getByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"));
    fireEvent.click(await screen.findByRole("button", { name: "Add Generator", hidden: true }));
    const save = await screen.findByTestId("pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(errorBar()).not.toBeNull());
    expect(state.jobs).toHaveLength(1);
    // `rollbackApplies` said no before the landed rows were even read.
    expect(state.landedCalls).toBe(0);
    expect(errorBar()!.textContent).not.toContain(ROLLBACK_MSG.undone);
    expect(retryButton()).toBeNull();
  });
});

describe("UT-GEN Screen rollback: the independent review's findings (plan §9.3)", () => {
  const NO_PROJECT_TEXT = "The failed save could not be undone automatically. Reload the page and check the generator types.";
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  const thenCalled = { n: 0 };
  beforeEach(() => { thenCalled.n = 0; });

  it("UT-GEN-945 out of country: the approval flow resolved, then the follow-up failed: NO rollback job, no Retry; the type stays saved", async () => {
    // The default flow mock resolves, so a real approval is open for the type. Rows landed, the follow-up then fails.
    script(LANDED_ALL.slice(0, 3), [{ ids: [] }]);
    renderScreen();
    await saveNewType(true);
    await waitFor(() => expect(errorBar()).not.toBeNull());
    await settle();
    expect(state.flows.request).toHaveBeenCalledTimes(1);
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs.some(isUndo)).toBe(false);
    // The rollback was never even consulted, and the save's own error stays.
    expect(state.landedCalls).toBe(0);
    expect(errorBar()!.textContent).toContain(REASON);
    expect(errorBar()!.textContent).not.toContain(ROLLBACK_MSG.undone);
    expect(retryButton()).toBeNull();
  });

  it("UT-GEN-946 out of country: the approval flow call itself failed: the rollback runs as designed", async () => {
    state.flows.request.mockImplementation(async () => { throw new Error("flow refused"); });
    script(LANDED_ALL.slice(0, 3), [{ ids: [] }]);
    renderScreen();
    await saveNewType(true);
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    expect(isUndo(state.jobs[1]!)).toBe(true);
    expect(state.landedCalls).toBeGreaterThan(0);
    await waitFor(() => expect(errorBar()!.textContent).toContain(ROLLBACK_MSG.undone));
    expect(retryButton()).toBeNull();
  });

  it("UT-GEN-947 in country: a failing follow-up still rolls back, with no approval flow involved", async () => {
    script(LANDED_ALL, [{ ids: [] }]);
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    expect(state.flows.request).not.toHaveBeenCalled();
    expect(isUndo(state.jobs[1]!)).toBe(true);
    await waitFor(() => expect(errorBar()!.textContent).toContain(ROLLBACK_MSG.undone));
  });

  it("UT-GEN-948 a failure inside the first plan (type or turbine create): the rollback has NO roll-up, so the project is not written", async () => {
    // The engine fails the first plan, so `then` never runs.
    state.exec = async (job, n) => {
      if (n === 0) {
        await resolvePlan(job);
        return { outcome: { fail: REASON }, landed: [landedRow(TYPE_TABLE, "new-type"), landedRow(TURBINE_TABLE, "nw1")] };
      }
      return { outcome: { ids: [] } };
    };
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    const plan = await resolvePlan(state.jobs[1]!);
    expect(shape(plan)).toEqual([`delete:${TURBINE_TABLE}`, `delete:${TYPE_TABLE}`]);
    expect(plan.writes.some((w) => w.entitySet === "vsb_projects")).toBe(false);
    await waitFor(() => expect(errorBar()!.textContent).toContain(ROLLBACK_MSG.undone));
  });

  it("UT-GEN-949 a failure in the follow-up after the first plan finished: the rollback recomputes the roll-up", async () => {
    state.exec = async (job, n) => {
      if (n === 0) {
        await resolvePlan(job);
        await job.then!(FIRST, { setProgress: () => {} });
        thenCalled.n += 1;
        return { outcome: { fail: REASON }, landed: LANDED_ALL };
      }
      return { outcome: { ids: [] } };
    };
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    expect(thenCalled.n).toBe(1);
    const plan = await resolvePlan(state.jobs[1]!);
    expect(shape(plan).at(-1)).toBe("update:vsb_projects");
  });

  it("UT-GEN-950 a double click on Retry cleanup starts ONE rollback", async () => {
    script(LANDED_ALL, [{ fail: "delete refused" }, { ids: [] }]);
    renderScreen();
    await saveNewType();
    const retry = await screen.findByTestId("generators-retry-cleanup");
    let release: () => void = () => {};
    state.gate = new Promise<void>((r) => { release = r; });
    // Both clicks reach the same handler before the screen re-renders.
    act(() => { retry.click(); retry.click(); });
    await waitFor(() => expect(state.jobs).toHaveLength(3));
    await settle();
    expect(state.jobs).toHaveLength(3);
    release();
    await waitFor(() => expect(errorBar()!.textContent).toContain(ROLLBACK_MSG.undone));
    expect(state.jobs).toHaveLength(3);
  });

  it("UT-GEN-951 the project changes while a rollback runs: its late failure does not show on the new project", async () => {
    let release: () => void = () => {};
    state.gate = new Promise<void>((r) => { release = r; });
    script(LANDED_ALL, [{ fail: "delete refused" }]);
    const view = renderScreen();
    await saveNewType();
    await waitFor(() => expect(state.jobs).toHaveLength(2));
    state.projectId = "22222222-2222-2222-2222-222222222222";
    view.rerender(wrap(<GeneratorsScreen />));
    release();
    await settle();
    // No leftover text and no Retry button on the new project; Retry would otherwise recompute with its data.
    expect(retryButton()).toBeNull();
    expect(errorBar()).toBeNull();
    expect(state.jobs).toHaveLength(2);
  });

  it("UT-GEN-952 the project is not loaded when the rollback should start: a notice says so instead of silence", async () => {
    state.exec = async (job, n) => {
      if (n === 0) {
        await resolvePlan(job);
        // The project row disappears (e.g. a failed reload) before the screen can start the rollback.
        state.project = null;
        return { outcome: { fail: REASON }, landed: LANDED_ALL };
      }
      return { outcome: { ids: [] } };
    };
    renderScreen();
    await saveNewType();
    await waitFor(() => expect(errorBar()).not.toBeNull());
    expect(errorBar()!.textContent).toContain(`${REASON} ${NO_PROJECT_TEXT}`);
    expect(state.jobs).toHaveLength(1);
    expect(retryButton()).toBeNull();
  });
});
