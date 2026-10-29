// @vitest-environment jsdom
/**
 * Render tests for the connected Project General Milestones Screen (D26). `./hooks` is mocked with
 * fixed rows; the write job handed to `run` is asserted, including the plan it builds.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { ES } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import { MILESTONES_MSG, MILESTONES_SCREEN_TEXT, type MilestoneProject } from "./rules";

const PROJECT: MilestoneProject = {
  id: "p-1", name: "Nordwind", projectNumber: "DE-1021", clusterStateName: "Cluster 2",
  countryId: "c-de", countryName: "Germany", countryBusinessUnitId: "bu-de", areaName: "Sachsen",
  technology: "Wind", technologyValue: 952850000, startCluster: 0, acquisitionDate: null,
  shareOfFarmdown: 50, isStandardShareOfFarmdown: true,
  dates: {
    StartDate: "2026-01-01", FeasibilityStudies: "2026-06-01", ProjectDevelopmentStarted: "2026-12-01",
    ApplicationSubmitted: "2027-06-01", LegallyBindingPermits: "2028-01-01",
    FinalInvestmentDecision: "2028-06-01", Construction: "2029-01-01", OperationsStartDate: "2030-01-01",
    EndDate: "2059-12-31", SalesStartDate: "2031-01-01", StartCompleted: "2031-06-01",
  },
  standardAssumption: { EndDate: true },
  createdByName: "Shakti Singh", createdOn: "2026-09-03T10:49:00Z",
  modifiedByName: "Ann Editor", modifiedOn: "2026-09-04T08:15:00Z",
};

type Job = { progress: string; success: (plan: WritePlan) => string; plan: () => Promise<WritePlan> };

const state = vi.hoisted(() => ({
  project: null as unknown,
  error: undefined as unknown,
  individualVolumes: 0,
  run: vi.fn(async (_job: unknown) => [] as string[]),
  loadRevenueSeed: vi.fn(async () => ({ draft: null as unknown, fabricFailed: false })),
  loadRepricing: vi.fn(async () => ({
    generators: [{ id: "g-1", count: 2, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 1,
      foundationCostIncluded: false, generatorsCost: 0 }],
    index: 2,
  })),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-US", loading: false, envVars: {} }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  useMilestoneProject: () => ({ ...ok(state.project), error: state.error }),
  useMilestoneLabels: () => ok(["Feasibility Studies", "Pre-Permitting", "Permitting", "Pre-Construction", "Construction", "Operation"]),
  useMilestoneAssumption: () => ok(null),
  useIndividualVolumeContractCount: () => ok(state.individualVolumes),

  useRecalculationRunning: () => ok(false),
  useMilestoneWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {} }),
  loadRepricing: state.loadRepricing,
  loadRevenueSeed: state.loadRevenueSeed,
}));

import MilestonesScreen from "./Screen";

function renderScreen(project: MilestoneProject = PROJECT) {
  state.project = project;
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter><MilestonesScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

afterEach(() => {
  cleanup();
  state.run.mockClear(); state.loadRepricing.mockClear(); state.loadRevenueSeed.mockClear();
  state.loadRevenueSeed.mockResolvedValue({ draft: null, fabricFailed: false });
  state.error = undefined; state.individualVolumes = 0;
});

const SAVE = "pcf_btn_Milestones_DisplayProject_Body_Buttons_Save";
const CANCEL = "pcf_btn_Milestones_DisplayProject_Body_Buttons_Reset";
const dtp = (seg: string) => `dtp_Milestones_DisplayProject_Body_General_Content_${seg}`;
const lastJob = (): Job => (state.run.mock.calls.at(-1) as unknown as [Job])[0];
/** Types a date into a picker (`IsEditable: true`) and leaves it, which commits it. */
const typeDate = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
};

describe("UT-MSTONE Screen (connected, D26)", () => {
  it("UT-MSTONE-901 renders the record, the canvas captions and the canvas AccessibleLabels", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    for (const caption of ["Project Start", "Pre-Permitting", "Final Investment Decision", "Sales Start Date", "Project End Date"]) {
      expect(screen.getByText(caption)).toBeTruthy();
    }
    const end = screen.getByTestId(dtp("EndDate")) as HTMLInputElement;
    // `DatePicker@0.0.46` (no Format): LongAbbreviated; `ModernDatePicker@1.0.1`: the long date.
    expect(end.value).toBe("Wed, Dec 31, 2059");
    expect((screen.getByTestId(dtp("StartDate")) as HTMLInputElement).value).toBe("Thursday, January 1, 2026");
    expect((screen.getByTestId(dtp("Cluster3")) as HTMLInputElement).value).toBe("Tuesday, June 1, 2027");
    expect((screen.getByTestId(dtp("Cluster1")) as HTMLInputElement).value).toBe("Mon, Jun 1, 2026");
    // Rule 16: the canvas AccessibleLabel is the control name.
    expect(end.getAttribute("aria-label")).toBe(dtp("EndDate"));
    expect((screen.getByTestId("txt_Milestones_DisplayProject_Body_General_Content_Share_of_Farmdown") as HTMLInputElement).value)
      .toBe("50.0");
    expect(screen.getByRole("button", { name: SAVE }).textContent).toBe(MILESTONES_MSG.save);
    expect(screen.getByRole("button", { name: CANCEL }).textContent).toBe(MILESTONES_MSG.cancel);
    // "Created:" is `Visible: false` in the canvas; the date sits under the name.
    expect(screen.queryByText(MILESTONES_MSG.createdOn)).toBeNull();
    expect(screen.getByTestId("lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_CreatorName_3").textContent)
      .toMatch(/^\d{1,2}\/\d{1,2}\/2026 \d{2}:\d{2}$/);
    // Operational Lifetime is `DisplayMode.View`: read-only, not disabled.
    const years = screen.getByTestId("txt_Milestones_DisplayProject_Body_General_Content_Years") as HTMLInputElement;
    expect(years.readOnly).toBe(true);
    expect(years.disabled).toBe(false);
    expect(screen.getByTestId("lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_CreatorName_2").textContent)
      .toBe("Shakti Singh");
    expect(screen.queryByTestId("con_Milestones_Page_LockMessage")).toBeNull();
  });

  it("UT-MSTONE-902 Save is disabled until dirty, then runs the plan with the canvas texts", async () => {
    renderScreen();
    expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(true);
    typeDate(dtp("EndDate"), "2060-06-30");
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const job = lastJob();
    expect(job.progress).toBe(MILESTONES_MSG.saving);
    const plan = await job.plan();
    expect(state.loadRepricing).not.toHaveBeenCalled();
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]!.entitySet).toBe(ES.projects);
    expect(plan.writes[0]!.data![PROJECT_COL.endDate]).toBe("2060-06-30");
    expect(plan.writes[0]!.data![PROJECT_COL.isEndDateStd]).toBe(false);
    expect(plan.writes[0]!.data!["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    expect(job.success(plan)).toBe("Project data was saved/updated successfully. \n");
  });

  it("UT-MSTONE-903 a moved FID re-prices the generators and patches the plant cost last", async () => {
    renderScreen();
    typeDate(dtp("FiD"), "2028-07-01");
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const plan = await lastJob().plan();
    expect(state.loadRepricing).toHaveBeenCalledWith("p-1", "2028-07-01");
    expect(plan.writes.map((w) => w.entitySet)).toEqual([ES.projects, ES.generatorTypeInProjects, ES.projects]);
    // the 2-WTG price (9) + 1 foundation, × index 2, × 2 WTG
    expect(plan.writes[1]!.data).toEqual({ vsb_generatorscost: 40 });
    expect(plan.writes[2]!.data).toEqual({ [PROJECT_COL.plantWtgCost]: 40 });
  });

  it("UT-MSTONE-904 a COD change with individual-volume contracts asks for review, Confirm saves", async () => {
    state.individualVolumes = 1;
    renderScreen();
    typeDate(dtp("Cluster6"), "2030-03-01");
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText(MILESTONES_MSG.codReviewTitle)).toBeTruthy();
    expect(state.run).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: MILESTONES_MSG.codReviewConfirm }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
  });

  it("UT-MSTONE-905 Cancel returns to the stored values and nothing stays dirty", async () => {
    renderScreen();
    typeDate(dtp("EndDate"), "2060-06-30");
    await waitFor(() => expect(screen.getByRole("button", { name: CANCEL }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: CANCEL }));
    await waitFor(() => expect((screen.getByTestId(dtp("EndDate")) as HTMLInputElement).value).toBe("Wed, Dec 31, 2059"));
    expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: CANCEL }).hasAttribute("disabled")).toBe(true);
  });

  it("UT-MSTONE-906 an invalid date shows the field error and the Required fields info button", async () => {
    renderScreen();
    typeDate(dtp("EndDate"), "2029-01-01");
    expect(await screen.findByText("The date needs to be later than Cluster 6 date.")).toBeTruthy();
    expect(screen.getByTestId("ibtn_GeneralData_DisplayProject_Body_Buttons_Requered_Fileds_1")).toBeTruthy();
    expect(screen.getByTestId("lbl_GeneralData_DisplayProject_Body_General_Content_ProjectName_ErrorMessage_5").textContent)
      .toBe(MILESTONES_MSG.requiredFields);
    expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(true);
  });

  it("UT-MSTONE-907 a project without a Project ID is locked: dates disabled, CalendarAdd not", () => {
    renderScreen({ ...PROJECT, projectNumber: null });
    expect(screen.getByTestId("con_Milestones_Page_LockMessage").textContent).toContain(MILESTONES_MSG.lockMessage);
    expect((screen.getByTestId(dtp("StartDate")) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("txt_Milestones_DisplayProject_Body_General_Content_Share_of_Farmdown") as HTMLInputElement).disabled).toBe(true);
    // `but_….DisplayMode` has no lock gate in the canvas.
    expect((screen.getByTestId("but_Milestones_DisplayProject_Body_General_Content_Cluster5") as HTMLButtonElement).disabled).toBe(false);
  });

  it("UT-MSTONE-908 a failed read shows the load-error state, not an empty form", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(MILESTONES_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
  });

  it("UT-MSTONE-909 the save creates the seeded revenue contract last, and no notice shows", async () => {
    state.loadRevenueSeed.mockResolvedValue({ draft: { data: { vsb_name: "seed" } }, fabricFailed: false });
    renderScreen();
    typeDate(dtp("EndDate"), "2060-06-30");
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const plan = await lastJob().plan();
    expect(state.loadRevenueSeed).toHaveBeenCalledWith(PROJECT, expect.objectContaining({ EndDate: "2060-06-30" }));
    expect(plan.writes.map((w) => [w.op, w.entitySet])).toEqual([["update", ES.projects], ["create", ES.projectRevenues]]);
    expect(screen.queryByTestId("milestones-revenue-seed-fabric-failed")).toBeNull();
  });

  it("UT-MSTONE-910 a failed Fabric read still saves the milestones and shows the warning", async () => {
    state.loadRevenueSeed.mockResolvedValue({ draft: null, fabricFailed: true });
    state.run.mockImplementationOnce(async (job: unknown) => { await (job as Job).plan(); return []; });
    renderScreen();
    typeDate(dtp("EndDate"), "2060-06-30");
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    expect((await screen.findByTestId("milestones-revenue-seed-fabric-failed")).textContent)
      .toBe(MILESTONES_SCREEN_TEXT.revenueSeedFabricFailed);
  });
});
