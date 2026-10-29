// @vitest-environment jsdom
/**
 * Render tests for the connected Project Planning screen (D31). `./hooks` is mocked with fixed rows;
 * the jobs handed to the write hook's `run` are asserted. The rules are covered by `rules.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import {
  AQUISITION_GRID_COLUMNS, GENERAL_TAB_LABELS, LLA_TYPE_LABEL, PAGE_LOCK_TITLE, PERMIT_GRID_COLUMNS,
  PLANNING_SCREEN_TEXT,
  type AquisitionStatusRow, type PermitRow, type PlanningProject, type PlanningRecord,
} from "./rules";

const C = "ProjectPlanning_DisplayProjectBodyRightContent";
const P = "ProjectPlanning_RightPanel";
const YNU = CHOICE_PROCESS.yesNoUnknown;

const PROJECT: PlanningProject = {
  id: "p-1", projectNumber: "DE-1021", endDate: "2059-12-31", projectStartDate: "2026-01-01",
  totalCapacity: 42.5, netYieldP50: 112400, clusterStateName: "Cluster 2", countryId: "c-de",
  owningBusinessUnitId: "bu-de", projectName: "Windpark Nord",
};

const PLANNING: PlanningRecord = {
  id: "pp-1", cooperation: YNU.yes, cooperationPartner: "Stadtwerke", cooperationDetails: null,
  legalPlanningId: null, planningBasisCategory: null, permitProcedureId: null, planningBasisDetails: "B-Plan 14",
  repowering: YNU.yes, securedAccess: "12 of 14", repoweringDetails: null, isHeightLimitation: false,
  heightLimitation: null, owningBusinessUnitId: "bu-pp",
};

const PERMIT: PermitRow = {
  id: "pm-1", name: "BImSchG", submissionDate: "2026-04-01", submissionDateType: CHOICE_PROCESS.permitDateType.plan,
  approvalDate: "2027-02-01", approvalDateType: CHOICE_PROCESS.permitDateType.actual, canEdit: true, canDelete: true,
};

const LEASE: AquisitionStatusRow = {
  id: "as-1", typeId: "at-1", typeName: "Lease", typeOrder: 1, typeKind: CHOICE_PROCESS.aquisitionType.inPersonam,
  secured: 3, required: 4, percentage: 0.75,
};

const state = vi.hoisted(() => ({
  project: null as unknown,
  error: undefined as unknown,
  run: vi.fn(async (_job: unknown) => [] as string[]),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false, envVars: {} }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  PLANNING_CAN_EDIT: true,
  usePlanningProject: () => ({ ...ok(state.project), error: state.error }),
  useProjectPlanning: () => ok(PLANNING),
  usePermits: () => ok([PERMIT]),
  useAquisitionTypes: () => ok([]),
  useAquisitionStatuses: () => ok([LEASE]),
  useCustomChoiceValues: () => ok([]),
  usePlanningWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {} }),
}));

import PlanningScreen from "./Screen";

function renderScreen(path = "/project/planning", project: PlanningProject | null = PROJECT) {
  state.project = project;
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={[path]}><PlanningScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

const isDisabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
const lastJob = (): PlanJob => state.run.mock.calls.at(-1)![0] as PlanJob;
const lastPlan = (): WritePlan => lastJob().plan as WritePlan;

afterEach(() => {
  cleanup();
  state.run.mockClear();
  state.error = undefined;
});

describe("UT-PLAN Screen (connected)", () => {
  it("UT-PLAN-901 renders the General tab's canvas captions and identities, with no notice and no lock", () => {
    renderScreen();
    expect(screen.getByTestId("Project Planning Screen")).toBeTruthy();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.queryByText(PAGE_LOCK_TITLE)).toBeNull();
    for (const label of Object.values(GENERAL_TAB_LABELS)) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    for (const header of Object.values(PERMIT_GRID_COLUMNS)) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    const coop = screen.getByTestId(`drp_${C}_Cooperation`);
    expect(coop.getAttribute("aria-label")).toBe(`drp_${C}_Cooperation`);
    expect(screen.getByTestId(`txt_${C}_CooperationPartner`).getAttribute("aria-label")).toBe(`txt_${C}_CooperationPartner`);
    expect(screen.getByTestId(`pcf_${C}_ButtonsSave`).getAttribute("aria-label")).toBe(`pcf_${C}_ButtonsSave`);
    // The permit grid shows dd/mm/yyyy (D31 L3); only the Actual date is in the theme blue.
    expect(screen.getByText("01/04/2026").className).toBe(screen.getByText("BImSchG").className);
    expect(screen.getByText("01/02/2027").className).not.toBe(screen.getByText("BImSchG").className);
  });

  it("UT-PLAN-902 the lock banner lists the missing sections and disables the tabs and commands", () => {
    renderScreen("/project/planning", { ...PROJECT, netYieldP50: 0, clusterStateName: "Draft" });
    expect(screen.getByText(PAGE_LOCK_TITLE)).toBeTruthy();
    expect(screen.getByTestId("lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_25").textContent)
      .toBe("• Production");
    expect(isDisabled(screen.getByTestId("command-newPermit"))).toBe(true);
    expect(isDisabled(screen.getByRole("tab", { name: "Repowering" }))).toBe(true);
    expect(isDisabled(screen.getByTestId(`txt_${C}_PlanningBasisDetails`))).toBe(true);
  });

  it("UT-PLAN-903 Save and Cancel wait for a change; Save runs one planning update with the canvas texts", async () => {
    renderScreen();
    const save = screen.getByTestId(`pcf_${C}_ButtonsSave`);
    expect(isDisabled(save)).toBe(true);
    expect(isDisabled(screen.getByTestId(`pcf_${C}_ButtonsReset`))).toBe(true);
    fireEvent.change(screen.getByTestId(`txt_${C}_PlanningBasisDetails`), { target: { value: "B-Plan 15" } });
    await waitFor(() => expect(isDisabled(screen.getByTestId(`pcf_${C}_ButtonsSave`))).toBe(false));
    expect(isDisabled(screen.getByTestId(`pcf_${C}_ButtonsReset`))).toBe(false);
    fireEvent.click(screen.getByTestId(`pcf_${C}_ButtonsSave`));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    expect(lastJob().progress).toBe("Project Planning will be saved, please wait...");
    const write = lastPlan().writes[0]!;
    expect(write).toMatchObject({ op: "update", entitySet: "vsb_projectplannings", id: "pp-1" });
    expect(write.data?.vsb_planningbasisdetails).toBe("B-Plan 15");
    expect(write.data?.["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
  });

  it("UT-PLAN-904 the Repowering tab renders its fields with the canvas names from ?tab=repowering", () => {
    renderScreen("/project/planning?tab=repowering");
    const repowering = screen.getByTestId(`drp_${C}_Repowering`);
    expect(repowering.getAttribute("aria-label")).toBe(`drp_${C}_Repowering`);
    expect(screen.getByText("Repowering", { selector: "label" })).toBeTruthy();
    const secured = screen.getByTestId(`txt_${C}_SecuredAccess`) as HTMLInputElement;
    expect(secured.value).toBe("12 of 14");
    expect(secured.maxLength).toBe(100);
  });

  it("UT-PLAN-905 the Aquisition tab: canvas column order, the Edit panel and the In-personam Save", async () => {
    renderScreen("/project/planning?tab=aquisition");
    expect(screen.getByText(LLA_TYPE_LABEL.personam)).toBeTruthy();
    expect(screen.getByText(LLA_TYPE_LABEL.rem)).toBeTruthy();
    const headers = screen.getAllByRole("columnheader").slice(0, 4).map((h) => h.textContent);
    // The first header cell is the canvas header block: the section name over "Types".
    expect(headers[0]).toBe(`${LLA_TYPE_LABEL.personam}${AQUISITION_GRID_COLUMNS.types}`);
    expect(headers.slice(1)).toEqual([
      AQUISITION_GRID_COLUMNS.secured, AQUISITION_GRID_COLUMNS.required, AQUISITION_GRID_COLUMNS.percentage,
    ]);
    expect(screen.getByText("75")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`pcf_but_${C}_AquisitionStatus_UnderLaw_Edit`));
    const secured = await screen.findByTestId(`txt_${P}_AquisitionStatus_InpForm_Body_Secured`);
    expect((secured as HTMLInputElement).maxLength).toBe(3);
    expect(screen.getByTestId(`txt_${P}_AquisitionStatus_InpForm_Body_Percentage`).getAttribute("aria-label"))
      .toBe(`txt_${P}_AquisitionStatus_InpForm_Body_Percentage`);
    fireEvent.change(secured, { target: { value: "2" } });
    const save = await screen.findByTestId(`pcf_btn_${P}_AquisitionStatus_InpForm_Buttons_Save_UnderLaw`);
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    expect(lastJob().progress).toBe("Saving Aquisition Status...");
    expect(lastPlan().writes[0]).toMatchObject({ op: "update", entitySet: "vsb_aquisitionstatuses", id: "as-1" });
    expect(lastPlan().writes[0]!.data?.vsb_aquisitionstatuspercentage).toBe(0.5);
  });

  it("UT-PLAN-906 a permit row selects; Delete confirms and runs one delete", async () => {
    renderScreen();
    expect(isDisabled(screen.getByTestId("command-editPermit"))).toBe(true);
    const dot = screen.getByTestId(`img_${C}_PermitsRowSelectionDot-pm-1`);
    expect(dot.getAttribute("aria-label")).toBe(`img_${C}_PermitsRowSelectionDot`);
    fireEvent.click(dot);
    expect(dot.getAttribute("aria-checked")).toBe("true");
    expect(isDisabled(screen.getByTestId("command-editPermit"))).toBe(false);
    fireEvent.click(screen.getByTestId("command-deletePermit"));
    expect(await screen.findByText("Are you sure that you want to delete permit BImSchG?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    expect(lastJob().success).toBe("Permit deleted.");
    expect(lastPlan().writes).toEqual([{ op: "delete", entitySet: "vsb_permits", id: "pm-1", reason: "delete the permit" }]);
  });

  it("UT-PLAN-907 New Permit clears the selection and opens an empty panel whose Save waits for all five fields", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId(`img_${C}_PermitsRowSelectionDot-pm-1`));
    fireEvent.click(screen.getByTestId("command-newPermit"));
    const save = await screen.findByTestId(`pcf_${P}_NewEditPermitBodyButtons_Save`);
    expect(save.getAttribute("aria-label")).toBe(`pcf_${P}_NewEditPermitBodyButtons_Save`);
    expect(save.getAttribute("title")).toBe("Save Permit");
    expect(isDisabled(save)).toBe(true);
    expect(screen.getAllByText("New Permit").length).toBeGreaterThanOrEqual(2); // command + panel title
    expect(screen.getByTestId(`img_${C}_PermitsRowSelectionDot-pm-1`).getAttribute("aria-checked")).toBe("false");
  });

  it("UT-PLAN-909 Edit Permit shows the dates as \"Wed, Apr 1, 2026\" with their Plan / Actual tag (D31 L3)", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId(`img_${C}_PermitsRowSelectionDot-pm-1`));
    fireEvent.click(screen.getByTestId("command-editPermit"));
    const submission = await screen.findByTestId(`dte_${P}_NewEditPermitBodyContent_SubmissionDate`);
    expect(submission.getAttribute("aria-label")).toBe(`dte_${P}_NewEditPermitBodyContent_SubmissionDate`);
    expect((submission as HTMLInputElement).value).toBe("Wed, Apr 1, 2026");
    const approval = screen.getByTestId(`dte_${P}_NewEditPermitBodyContent_ApprovalDate`);
    expect((approval as HTMLInputElement).value).toBe("Mon, Feb 1, 2027");
    // The canvas shows no Plan / Actual tag beside the date; the radios carry the choice.
    expect(screen.queryByTestId("planning-permit-submission-date-tag")).toBeNull();
    expect(screen.queryByTestId("planning-permit-approval-date-tag")).toBeNull();
  });

  it("UT-PLAN-908 a failed read shows the load-error state (rule 19)", () => {
    state.error = new Error("boom");
    renderScreen();
    expect(screen.getByText(PLANNING_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
  });
});
