// @vitest-environment jsdom
/**
 * Render tests for the connected Project General Data Screen (and its New Project mode), D25.
 * `./hooks` is mocked with fixed rows; the write job handed to `run` is asserted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { useLocation } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE, ES } from "@/data/dataverseNames";
import { GD_LABELS, MSG, type ProjectRow } from "./rules";

const ROW: ProjectRow = {
  id: "p-1", projectNumber: "PL-1021", internalProjectId: "INT-7", projectName: "Wirmighausen",
  originalProjectName: "Wirmighausen", shortName: "WIR", projectType: null, spvName: "", spvCompanyCode: null,
  spvLegalStructure: null, countryId: "c-pl", areaId: null, district: "", municipality: "Poznan",
  utilizationId: null, terrainSize: null, latitude: 51.284745, longitude: 13.712023, technology: 952850000,
  approvalState: null, statecode: 0, clusterStateId: "s-draft", clusterStateName: "Draft", taxFactor: null,
  owningBusinessUnitId: "bu-pl", shareOfFarmdown: 50, isStandardShareOfFarmdown: true, standardCostCreated: false,
  developmentType: CHOICE.developmentType.ownDevelopment, startCluster: 0, acquisitionDate: null,
  acquisitionPrice: null, managerId: "e-1", managerName: "Ann Manager", deputyManagerId: null, deputyManagerName: null,
  projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
  legallyBindingPermits: null, fid: null, construction: null, cod: null,
  createdByName: "Shakti Singh", createdOn: "2026-09-03T10:49:00Z", modifiedByName: null, modifiedOn: null,
};

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  row: null as unknown,
  error: undefined as unknown,
  trackings: [] as unknown[],
  run: vi.fn(async (_job: unknown) => [] as string[]),
  readProject: vi.fn(async (_id: string) => null as unknown),
}));

vi.mock("@/app/SessionContext", () => ({ useSession: () => state.session }));
vi.mock("@/app/useCurrentUser", () => ({ useCurrentUser: () => ({ data: { editableCountries: [] } }) }));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  useGeneralDataProject: () => ({ ...ok(state.row), error: state.error }),
  useCountries: () => ok([{ id: "c-pl", name: "Poland", key: "33", besitzerBusinessUnitId: "bu-pl", businessUnitId: "bu-pl2" }]),
  useProjectStates: () => ok([{ id: "s-draft", name: "Draft", order: 0, isVisibleOnChecklist: true }]),
  useCountryAreas: () => ok([]),
  useTerrainUtilizations: () => ok([]),
  useShareholders: () => ok(state.row ? [{ key: "sh-1", recordId: "sh-1", entityTypeValue: 952850018, customName: "", ownership: 1 }] : []),
  useStateTrackings: () => ok(state.trackings),
  useEntraSearch: (term: string) => ok(term ? [{ id: "e-9", displayName: "Max Planner", mail: "max@vsb.energy" }] : []),
  useEntraPeople: () => ok(new Map([["e-1", { id: "e-1", displayName: "Ann Manager", mail: "ann@vsb.energy" }]])),
  useMunicipalitySearch: () => ok([]),
  useGermanTradeTaxRate: () => ok(null),
  useMilestoneDurations: () => undefined,
  useProjectReader: () => state.readProject,
  useGeneralDataWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {} }),
}));

import GeneralDataScreen from "./Screen";

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

function renderScreen(mode: "edit" | "create") {
  state.session = mode === "edit"
    ? { projectId: "p-1", locale: "en-US", loading: false, envVars: {} }
    : { projectId: undefined, locale: "en-US", loading: false, envVars: {} };
  state.row = mode === "edit" ? ROW : null;
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={[mode === "edit" ? "/project/general?projectId=p-1" : "/project/general"]}>
        <GeneralDataScreen />
        <Where />
      </MemoryRouter>
    </FluentProvider>,
  );
}

afterEach(() => { cleanup(); state.run.mockReset(); state.run.mockImplementation(async () => []); state.readProject.mockReset(); state.error = undefined; state.trackings = []; });

const SAVE = "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save";

describe("UT-GDATA General Data screen (connected)", () => {
  it("UT-GDATA-901 renders the canvas captions and the record's values", () => {
    renderScreen("edit");
    // The grey "General" band is removed (PO, 21 Oct 2026); the section captions remain.
    expect(screen.queryByTestId("lbl_GeneralData_DisplayProject_Body_General_Content_Label")).toBeNull();
    for (const caption of [GD_LABELS.basicInformation, GD_LABELS.placement]) {
      expect(screen.getByText(caption)).toBeTruthy();
    }
    expect((screen.getByTestId("txt_GeneralData_DisplayProject_Body_General_Content_ProjectID") as HTMLInputElement).value).toBe("INT-7");
    const name = screen.getByTestId("txt_GeneralData_DisplayProject_Body_General_Content_ProjectName") as HTMLInputElement;
    expect(name.value).toBe("Wirmighausen");
    // Rule 16: the canvas AccessibleLabel, not the caption.
    expect(name.getAttribute("aria-label")).toBe("txt_GeneralData_DisplayProject_Body_General_Content_ProjectName");
    expect(screen.getByTestId("lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_CreatorName").textContent)
      .toMatch(/^Shakti Singh {3}03\.09\.2026/);
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
  });

  it("UT-GDATA-902 the shareholding grid shows the type and the canvas ownership format", () => {
    renderScreen("edit");
    expect(screen.getByText("VSB Holding GmbH")).toBeTruthy();
    expect(screen.getByText("100.0 %")).toBeTruthy();
    // Sum is 100 % → Add is disabled (Y:4533).
    expect(screen.getByRole("button", { name: "btn_general_data_shareholding_entity_add_new" }).hasAttribute("disabled")).toBe(true);
  });

  it("UT-GDATA-903 Save is disabled until dirty, then runs the plan with the canvas texts", async () => {
    renderScreen("edit");
    const save = screen.getByRole("button", { name: SAVE });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByTestId("txt_GeneralData_DisplayProject_Body_General_Content_District"), { target: { value: "Nord" } });
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const job = (state.run.mock.calls[0] as unknown as [{ progress: string; success: string; plan: { writes: { entitySet: string; data: Record<string, unknown> }[] } }])[0];
    expect(job.progress).toBe(MSG.savingProject);
    expect(job.success).toBe(`${MSG.stepProjectSaved} \n`);
    expect(job.plan.writes[0]!.entitySet).toBe(ES.projects);
    expect(job.plan.writes[0]!.data.vsb_district).toBe("Nord");
    expect(job.plan.writes[0]!.data.vsb_projectname).toBe("Wirmighausen");
    // The project has a Draft tracking? No → the plan ends by creating it.
    expect(job.plan.writes.at(-1)!.entitySet).toBe(ES.projectStateTrackings);
  });

  it("UT-GDATA-904 the delete dialog names the row and deletes at once", async () => {
    renderScreen("edit");
    fireEvent.click(screen.getByRole("button", { name: "btn_general_data_shareholding_entity_Delete" }));
    expect(await screen.findByText("Are you sure that you want to delete 'VSB Holding GmbH'?")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(state.run).toHaveBeenCalled());
    const job = (state.run.mock.calls[0] as unknown as [{ success: string; plan: { writes: { op: string; id: string }[] } }])[0];
    expect(job.success).toBe(MSG.shareholderDeleted);
    expect(job.plan.writes).toEqual([expect.objectContaining({ op: "delete", id: "sh-1" })]);
  });

  it("UT-GDATA-905 a failed read shows the load-error state, not an empty form", () => {
    state.error = new Error("boom");
    renderScreen("edit");
    expect(screen.getByText("The project data could not be loaded")).toBeTruthy();
  });

  it("UT-GDATA-906 New Project: blank form; Save waits for the canvas required fields (PO 20 Oct)", () => {
    renderScreen("create");
    // The screen has no heading of its own: the app header carries "New Project" (PO, 28 Oct 2026).
    expect(screen.queryByText(GD_LABELS.newProject)).toBeNull();
    expect((screen.getByTestId("txt_GeneralData_DisplayProject_Body_General_Content_ProjectName") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(GD_LABELS.requiredFields)).toBeTruthy();
    expect(screen.queryByTestId("general-data-save-blocked")).toBeNull();
    expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(true);
  });

  it("UT-GDATA-909 New Project: Save creates the project, finishes the save on the re-read row, and opens it", async () => {
    state.run.mockImplementation(async (job: unknown) => {
      const j = job as { plan: unknown; resolved?: unknown };
      if (typeof j.plan === "function") { j.resolved = await (j.plan as () => Promise<unknown>)(); return []; }
      return ["p-new"];
    });
    state.readProject.mockImplementation(async (id: string) => ({ ...ROW, id, internalProjectId: null, projectNumber: "PL-2001" }));
    renderScreen("create");
    const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
    const pick = async (id: string, option: string) => {
      fireEvent.click(screen.getByTestId(id));
      fireEvent.click(await screen.findByRole("option", { name: option }));
    };
    type("txt_GeneralData_DisplayProject_Body_General_Content_ProjectName", "Nordwind");
    type("txt_GeneralData_DisplayProject_Body_General_Content_ShortName", "NDW");
    await pick("drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_Technology", "Wind");
    type("pcf_GeneralData_DisplayProject_Body_General_Content_Manager_PeoplePicker", "max");
    fireEvent.click(await screen.findByTestId("pcf_GeneralData_DisplayProject_Body_General_Content_Manager_PeoplePicker-suggestion-e-9"));
    await pick("drp_GeneralData_DisplayProject_Body_General_Content_Country", "Poland");
    type("txt_GeneralData_DisplayProject_Body_General_Content_Latitude", "51.284745");
    type("txt_GeneralData_DisplayProject_Body_General_Content_Longitude", "13.712023");
    fireEvent.click(screen.getByRole("button", { name: "btn_general_data_shareholding_entity_add_new" }));
    await pick("drp_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_EntityName", "VSB Holding GmbH");
    type("txt_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_Percentage", "100");
    fireEvent.click(screen.getByTestId("pcf_btn_GeneralData_RightPanel_ShareholdingEntity_Form_Buttons_Save"));

    await waitFor(() => expect(screen.getByRole("button", { name: SAVE }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));

    type W = { op: string; entitySet: string; id?: string; data: Record<string, unknown> };
    const create = state.run.mock.calls[0]![0] as { progress: string; plan: { writes: W[] } };
    expect(create.progress).toBe(MSG.savingProject);
    expect(create.plan.writes).toHaveLength(1);
    const c = create.plan.writes[0]!;
    expect(c).toMatchObject({ op: "create", entitySet: ES.projects });
    expect(c.data).toMatchObject({
      vsb_projectname: "Nordwind", vsb_shortname: "NDW", vsb_technology: 952850000,
      vsb_approvalstates: CHOICE.approvalState.notStarted, vsb_shareoffarmdown: 50,
      vsb_isstandardshareoffarmdown: true, vsb_standardcostcreated: false,
      vsb_startcluster: CHOICE.clusterState.greenfield,
      "vsb_ClusterState@odata.bind": "/vsb_projectstates(s-draft)",
      "vsb_Projectmanager@odata.bind": "/aadusers(e-9)",
      "vsb_Country@odata.bind": "/vsb_countries(c-pl)",
      "owningbusinessunit@odata.bind": "/businessunits(bu-pl)",
    });
    expect("vsb_DeputyprojectmanagerEntra@odata.bind" in c.data).toBe(false);

    const follow = state.run.mock.calls[1]![0] as { success: string; resolved: { writes: W[] } };
    expect(state.readProject).toHaveBeenCalledWith("p-new");
    expect(follow.success).toBe(MSG.stepProjectSaved + " \n" + MSG.stepShareholdersSaved + " \n");
    const w = follow.resolved.writes;
    expect(w[0]).toMatchObject({ op: "update", entitySet: ES.projects, id: "p-new" });
    expect(w[0]!.data).toMatchObject({ vsb_internalprojectid: "PL-2001", "owningbusinessunit@odata.bind": "/businessunits(bu-pl2)" });
    expect(w[1]).toMatchObject({ op: "create", entitySet: ES.shareholderEntityInProjects });
    expect(w[1]!.data).toMatchObject({ vsb_shareholderentitiytype: 952850018, vsb_ownership: 1, "vsb_Project@odata.bind": "/vsb_projects(p-new)" });
    expect(w.at(-1)).toMatchObject({ op: "create", entitySet: ES.projectStateTrackings });
    expect(w.at(-1)!.data["vsb_Project@odata.bind"]).toBe("/vsb_projects(p-new)");

    // The screen switches to the new project (replace), not blocked by the leave guard.
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/project/general?projectId=p-new"));
    expect(screen.queryByText("Unsaved data")).toBeNull();
  }, 60_000);

  it("UT-GDATA-907 the shareholding panel opens from Edit with the canvas labels", async () => {
    renderScreen("edit");
    fireEvent.click(screen.getByRole("button", { name: "btn_general_data_shareholding_entity_Edit" }));
    const pct = await screen.findByTestId("txt_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_Percentage");
    expect((pct as HTMLInputElement).value).toBe("100");
    expect(pct.getAttribute("aria-label")).toBe("Ownership");
    expect(screen.getByTestId("drp_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_EntityName").getAttribute("aria-label")).toBe("Shareholder Entity");
    // Not dirty yet → Save disabled.
    expect(screen.getByTestId("pcf_btn_GeneralData_RightPanel_ShareholdingEntity_Form_Buttons_Save").hasAttribute("disabled")).toBe(true);
  });
});
