// @vitest-environment jsdom
/**
 * Render tests for what a FAILED delete job tells the user (delete hardening plan DEL-5, scenarios S4, S5, S9).
 * `./hooks` is mocked with a STATEFUL `useGeneratorWrites` that behaves like `usePlanWrite`: `run` resolves the job's plan
 * (the screen captures it), reports `lastDeleted()` as the rows the exec callback says were deleted, and builds the error
 * text through the job's own `errorText`, so the screen's wiring runs for real. The failure text of the job stays; the
 * "Removed / Not removed" text follows it (`deletePartialMessage`). Ids: UT-GEN-1110 and up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import {
  DELETE_PARTIAL_MSG, deletePartialMessage, plannedDeleteRows,
  type CatalogModel, type GeneratorTypeRow, type LandedRowRef, type SimpleTypeRow, type TurbineRow,
} from "./rules";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const baseProject = {
  id: PROJECT_ID, projectIdText: "DE-0001", projectName: "Windpark Nord", shortName: "WPN",
  countryId: "c-de", countryName: "Germany", countryOptionValue: 952850000, isoCurrencyCode: "EUR",
  totalCapacity: 30, fid: "2028-06-01", endDate: "2055-12-31", projectStartDate: "2026-01-01",
  projectManagerId: "pm-1", projectManagerEmail: null, owningBusinessUnitId: "bu-1", plantPvCapacity: 10,
  plantWtgCapacity: 20, plantStorageCapacity: 5, plantHydrogenCapacity: 5, plantSubstationCapacity: 5,
};

const MODEL: CatalogModel = {
  id: "g1", name: "V150", displayName: "Vestas V150-5.6 - available", supplier: "Vestas", turbineType: "V150",
  hubHeight: 148, rotorDiameter: 150, specificCapacity: 5.6, totalHeight: 223, earliestPhaseout: "2035-01-01",
  countryAvailability: [952850000], foundationCostIncluded: true, additionalFoundationCost: 0,
  prices: [1_000_000, 950_000, 900_000, 850_000, 800_000],
};
const typeRow = (id: string, name: string, capacity: number): GeneratorTypeRow => ({
  id, name, generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 2,
  costPerWtg: 950_000, generatorsCost: 1_900_000, generatorsCapacity: capacity, requestPermissionState: null,
  flowRunId: null, flowApprovalId: null, status: CHOICE_PLANT.status.active, specificCapacity: null,
});
/** Two active types, so deleting one is not the project's last capacity (no last-capacity popup). */
const TYPES = [typeRow("t1", "WTG-0001", 11.2), typeRow("t2", "WTG-0002", 11.2)];
const turbine = (id: string, typeId: string, i: number): TurbineRow => ({
  id, name: `WTG WPN_${i}`, typeId, index: i, effectiveCapacity: 5.6, effectiveHubHeight: null,
  effectiveHubHeightChanged: false, foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status: 0,
});
const TURBINES = [turbine("w1", "t1", 1), turbine("w2", "t1", 2), turbine("w3", "t2", 3), turbine("w4", "t2", 4)];

const row = (over: Partial<SimpleTypeRow>): SimpleTypeRow => ({
  id: "r", name: null, supplier: null, otherSupplier: null, capacity: null, cost: null, moduleLabel: null,
  degradation1stYear: null, degradationRemainingYears: null, requestPermissionState: null, flowRunId: null,
  flowApprovalId: null, status: 0, ...over,
});
const PV = [
  row({ id: "pv1", name: "PVT-0001", moduleLabel: "JA 550", catalogueId: "m1", catalogueSupplier: "JA Solar", capacity: 10, cost: 3000 }),
  row({ id: "pv2", name: "PVT-0002", moduleLabel: "JA 600", catalogueId: "m1", catalogueSupplier: "JA Solar", capacity: 10, cost: 3000 }),
];
const INVERTER = row({ id: "inv1", name: "SMA Tripower", supplier: "SMA", cost: 100 });
const SUBSTRUCTURE = row({ id: "sub1", name: "Schletter Fix", supplier: "Schletter", cost: 100 });
const BESS = [row({ id: "s1", name: "BESS North", supplier: "Tesla", capacity: 5, energyCapacity: 10 }), row({ id: "s2", name: "BESS South", capacity: 5 })];
const HYDROGEN = [row({ id: "h1", name: "H2 North", capacity: 5 }), row({ id: "h2", name: "H2 South", capacity: 5 })];
const SUBSTATION = [row({ id: "ss1", name: "Substation North", capacity: 5 }), row({ id: "ss2", name: "Substation South", capacity: 5 })];

type Job = {
  progress: string;
  errorText?: (detail: string) => string;
  plan: WritePlan | (() => Promise<WritePlan>);
};
/** What the job ends with; `pick` chooses which of the plan's delete rows the engine managed to delete. */
type Exec = { fail: string; pick: (attempted: LandedRowRef[]) => LandedRowRef[] } | { ok: true };

const state = vi.hoisted(() => ({
  jobs: [] as Job[],
  deleted: [] as unknown[],
  attempted: [] as unknown[],
  plan: null as unknown,
  exec: { ok: true } as unknown,
  projectId: "11111111-1111-1111-1111-111111111111",
  flows: {
    request: vi.fn(async () => ({ runid: "run-1", approvalid: "ap-1" })),
    cancel: vi.fn(async () => {}),
    cancelIfOpen: vi.fn(async () => {}),
  },
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
    useGeneratorsProject: () => ok(baseProject),
    useProjectPlanning: () => ok({ isHeightLimitationForWtg: false, heightLimitation: null }),
    useGeneratorTypes: () => ok(TYPES),
    useModulePermissionFlows: () => state.flows,
    useGeneratorModels: () => ok([MODEL]),
    useGeneratorCatalog: () => ok([MODEL]),
    useInflationIndex: () => ok(1),
    useDeviceCosts: () => ok({ modules: 300, inverter: null, mountingFix: 100, mountingTracker: 200 }),
    useProjectTurbines: () => ok(TURBINES),
    usePvModuleCatalog: () => ok([{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }]),
    usePvModuleTypes: () => ok(PV),
    useInverterTypes: () => ok([INVERTER]),
    useSubstructureTypes: () => ok([SUBSTRUCTURE]),
    useSimpleTypes: (family: string) => ok(family === "storage" ? BESS : family === "hydrogen" ? HYDROGEN : SUBSTATION),
    useAllWtgLandLeaseCosts: () => ok([]),
    useOpexDependency: () => ok({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
    useEntraObjectId: () => "pm-1",
    useGeneratorWrites: () => {
      const [progress, setProgress] = React.useState<string | null>(null);
      const [error, setError] = React.useState<string | null>(null);
      const run = async (job: Job): Promise<string[] | null> => {
        state.jobs.push(job);
        state.deleted = [];
        setError(null);
        setProgress(job.progress);
        try {
          const plan = typeof job.plan === "function" ? await job.plan() : job.plan;
          state.plan = plan;
          const exec = state.exec as Exec;
          if ("ok" in exec) return [];
          const attempted = plannedDeleteRows(plan);
          state.attempted = attempted;
          state.deleted = exec.pick(attempted);
          // `usePlanWrite` builds the text through the job's own `errorText`.
          setError(job.errorText ? job.errorText(exec.fail) : exec.fail);
          return null;
        } finally {
          setProgress(null);
        }
      };
      return {
        run, progress, error, success: null, clear: () => setError(null), refreshing: false,
        lastLanded: () => [], lastMaybeLanded: () => [], lastDeleted: () => state.deleted,
      };
    },
    loadNewTypeInputs: async () => ({ typeName: "WTG-0099", hasDeviceType: false }),
    loadPvFollowUpInputs: async () => ({ pvName: "PVT-0001", unitId: null, hasDeviceType: true }),
    loadAllocations: async () => ({ allocations: [{ id: "al1", costId: "k1" }], countByCost: { k1: 1 } }),
    loadTypeDeleteInputs: async () => ({
      allocations: [{ id: "al1", costId: "k1" }, { id: "al2", costId: "k1" }], countByCost: { k1: 2 }, opexCostIds: ["o1", "o2"],
    }),
    loadPvDeleteInputs: async () => ({
      unitIds: ["u1"], allocations: [{ id: "al1", costId: "k1" }], countByCost: { k1: 1 }, opexCostIds: ["o1"],
    }),
    loadReplaceInputs: async () => ({ bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["w1", "w2"], allocations: [], landLeaseCosts: [] }),
    usePlantSupplierCatalog: () => ok([]),
  };
});

import GeneratorsScreen from "./Screen";

const renderScreen = () => render(
  <FluentProvider theme={vsbTheme}><MemoryRouter><GeneratorsScreen /></MemoryRouter></FluentProvider>,
);
const commandBar = () => screen.getByRole("toolbar", { name: "pcf_Generators_DisplayProject_Body_Form_CommandBar", hidden: true });
const errorBar = () => screen.queryByTestId("generators-write-error");
/** The bar's text. `WriteFeedback` adds its own heading before the message, so the message is matched at the end. */
const barText = () => errorBar()!.textContent ?? "";

/** Selects a gallery row, presses the delete command and confirms the dialog. */
async function deleteViaCommand(gallery: string, id: string, command: string) {
  fireEvent.click(screen.getByTestId(`${gallery}-select-${id}`));
  fireEvent.click(await within(commandBar()).findByRole("button", { name: command, hidden: true }));
  await confirmDelete();
}
async function confirmDelete() {
  fireEvent.click(await screen.findByRole("button", { name: "Delete", hidden: true }));
}

interface Family {
  /** The job family, for the test titles. */
  name: string;
  /** Drives the screen up to the confirmed delete. */
  start: () => Promise<void>;
  /** The one type row's name when the text should name it (a type delete), else null. */
  typeName: string | null;
  /** How many delete rows the plan attempts: 1 means a part-way failure cannot be told apart from nothing deleted. */
  rows: "many" | "one";
}
const FAMILIES: Family[] = [
  { name: "deleteType", typeName: "WTG-0001", rows: "many", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_GeneratorTypes", "t1", "Delete Generator Type") },
  {
    name: "deleteTurbine", typeName: null, rows: "many",
    start: async () => {
      // The first card is WTG-0001, which owns turbine w1.
      fireEvent.click(screen.getAllByTestId("ico_Generators_DisplayProject_Body_Form_GeneratorType_Down")[0]!);
      fireEvent.click(await screen.findByTestId("generators-turbine-delete-w1"));
      await confirmDelete();
    },
  },
  { name: "delete PV type", typeName: "PVT-0001", rows: "many", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_PvModule", "pv1", "Delete PV Module Type") },
  { name: "delete inverter", typeName: null, rows: "one", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_Invertors", "inv1", "Delete Inverter Type") },
  { name: "delete substructure", typeName: null, rows: "one", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_Substructure", "sub1", "Delete Substructure Type") },
  { name: "delete BESS", typeName: null, rows: "one", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_Storage_1", "s1", "Delete BESS") },
  { name: "delete hydrogen", typeName: null, rows: "one", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_Hydrogen", "h1", "Delete Hydrogen") },
  { name: "delete substation", typeName: null, rows: "one", start: () => deleteViaCommand("gal_Generators_DisplayProject_Body_Form_Substation_2", "ss1", "Delete Substation") },
];

const DETAIL = "boom";
/** The job's own failure text, exactly as `usePlanWrite` would have put it on the bar. */
const ownText = () => state.jobs[0]!.errorText!(DETAIL);

beforeEach(() => {
  state.jobs = [];
  state.deleted = [];
  state.attempted = [];
  state.plan = null;
  state.exec = { ok: true };
  state.projectId = PROJECT_ID;
});
afterEach(() => cleanup());

describe("UT-GEN Screen: a failed delete job says what it removed (DEL-5)", () => {
  FAMILIES.forEach((f, i) => {
    const base = 1110 + i * 4;

    it(`UT-GEN-${base} ${f.name}: nothing deleted: only the failure text stays (F3 item 2: no "Not removed" / "press again" text)`, async () => {
      state.exec = { fail: DETAIL, pick: () => [] } satisfies Exec;
      renderScreen();
      await f.start();
      await waitFor(() => expect(errorBar()).not.toBeNull());
      const plan = state.plan as WritePlan;
      expect(plan.refusedReason).toBeUndefined();
      const attempted = state.attempted as LandedRowRef[];
      expect(attempted.length).toBeGreaterThan(0);
      expect(deletePartialMessage({ attempted, deleted: [], typeName: f.typeName })).toBeNull();
      // The original error text alone: nothing is added after it.
      expect(barText().endsWith(ownText())).toBe(true);
      expect(errorBar()!.textContent).not.toContain(DELETE_PARTIAL_MSG.notRemoved);
      expect(errorBar()!.textContent).not.toContain(DELETE_PARTIAL_MSG.removed);
      expect(errorBar()!.textContent).not.toContain(DELETE_PARTIAL_MSG.pressAgain);
    });

    it(`UT-GEN-${base + 1} ${f.name}: part of the rows deleted: the text lists what was removed and what was not`, async () => {
      // A one-row plan cannot fail part-way: its only delete either went or did not.
      const keep = f.rows === "many" ? 1 : 0;
      state.exec = { fail: DETAIL, pick: (a: LandedRowRef[]) => a.slice(0, keep) } satisfies Exec;
      renderScreen();
      await f.start();
      await waitFor(() => expect(errorBar()).not.toBeNull());
      const attempted = state.attempted as LandedRowRef[];
      const deleted = state.deleted as LandedRowRef[];
      expect(deleted).toHaveLength(keep);
      if (f.rows === "many") expect(attempted.length).toBeGreaterThan(1);
      const partial = deletePartialMessage({ attempted, deleted, typeName: f.typeName });
      // keep = 0 (a one-row plan, nothing deleted): the failure text alone (F3 item 2).
      expect(barText().endsWith(partial ? `${ownText()} ${partial}` : ownText())).toBe(true);
      if (keep > 0) {
        expect(errorBar()!.textContent).toContain(DELETE_PARTIAL_MSG.removed);
        expect(errorBar()!.textContent).toContain(DELETE_PARTIAL_MSG.notRemoved);
      }
    });

    it(`UT-GEN-${base + 2} ${f.name}: every row deleted but the roll-up failed: only the failure text, nothing added`, async () => {
      state.exec = { fail: DETAIL, pick: (a: LandedRowRef[]) => a } satisfies Exec;
      renderScreen();
      await f.start();
      await waitFor(() => expect(errorBar()).not.toBeNull());
      expect(barText().endsWith(ownText())).toBe(true);
      expect(barText()).not.toContain(DELETE_PARTIAL_MSG.pressAgain);
    });

    it(`UT-GEN-${base + 3} ${f.name}: the delete succeeds: no error bar, no partial text`, async () => {
      state.exec = { ok: true } satisfies Exec;
      renderScreen();
      await f.start();
      await waitFor(() => expect(state.jobs).toHaveLength(1));
      expect(errorBar()).toBeNull();
    });
  });
});

describe("UT-GEN Screen: partial-delete text lifecycle (DEL-5)", () => {
  it("UT-GEN-1150 a type delete names the one type row in the text", async () => {
    state.exec = { fail: DETAIL, pick: (a: LandedRowRef[]) => a.slice(0, 1) } satisfies Exec;
    renderScreen();
    await FAMILIES[0]!.start();
    await waitFor(() => expect(errorBar()).not.toBeNull());
    // The type is the last row of the plan: it is among the rows NOT removed, and it is named.
    expect(errorBar()!.textContent).toContain('generator type "WTG-0001"');
  });

  it("UT-GEN-1152 a new command forgets the partial-delete text", async () => {
    state.exec = { fail: DETAIL, pick: (a: LandedRowRef[]) => a.slice(0, 1) } satisfies Exec;
    renderScreen();
    await FAMILIES[0]!.start();
    await waitFor(() => expect(errorBar()!.textContent).toContain(DELETE_PARTIAL_MSG.pressAgain));
    fireEvent.click(within(commandBar()).getByRole("button", { name: "Add PV Module Type", hidden: true }));
    await waitFor(() => expect(errorBar()).toBeNull());
  });

  it("UT-GEN-1153 a project change does not show the text on the new project", async () => {
    state.exec = { fail: DETAIL, pick: (a: LandedRowRef[]) => a.slice(0, 1) } satisfies Exec;
    const view = renderScreen();
    await FAMILIES[0]!.start();
    await waitFor(() => expect(errorBar()!.textContent).toContain(DELETE_PARTIAL_MSG.pressAgain));
    state.projectId = "22222222-2222-2222-2222-222222222222";
    view.rerender(<FluentProvider theme={vsbTheme}><MemoryRouter><GeneratorsScreen /></MemoryRouter></FluentProvider>);
    // The own error text may still show (it is the shared bar's); the partial text of the other project must not.
    await waitFor(() => expect(errorBar()?.textContent ?? "").not.toContain(DELETE_PARTIAL_MSG.pressAgain));
  });
});
