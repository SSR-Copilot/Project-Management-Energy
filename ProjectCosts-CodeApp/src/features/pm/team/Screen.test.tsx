// @vitest-environment jsdom
/**
 * Render tests for the connected Project General Team Screen (D30). `./hooks` is mocked with fixed
 * rows; the Save / Delete jobs handed to the write hook's `run` are asserted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";
import {
  PAGE_LOCK_TITLE, TEAM_COLUMN_HEADERS, TEAM_COMMAND_LABELS, TEAM_SCREEN_TEXT,
  type MemberDescriptionOption, type ProjectMemberRow, type TeamPerson, type TeamProject,
} from "./rules";

const baseProject: TeamProject = {
  id: "p-1", projectNumber: "DE-1021", endDate: "2059-12-31", projectStartDate: "2026-01-01",
  totalCapacity: 42.5, netYieldP50: 112400, clusterStateName: "Cluster 2", owningBusinessUnitId: "bu-de",
  projectManager: { rowId: "e-pm", displayName: "Anna Beck", mail: "anna.beck@vsb.energy" },
  deputyProjectManager: null,
};

const CARA: ProjectMemberRow = {
  id: "m-1", displayName: "Cara Diaz", memberRowId: "e-1", mail: "cara.diaz@vsb.energy",
  descriptionId: "d-1", description: "Site lead", positionLabel: null, comment: "On site Tuesdays",
};

const DESCRIPTIONS: MemberDescriptionOption[] = [
  { id: "d-1", name: "Properties", description: "Site lead" },
  { id: "d-2", name: "Legal", description: "Contracts" },
];

const DEE: TeamPerson = { rowId: "e-2", displayName: "Dee Roy", mail: "dee.roy@vsb.energy" };

const state = vi.hoisted(() => ({
  project: null as unknown,
  members: [] as unknown[],
  people: [] as unknown[],
  error: undefined as unknown,
  run: vi.fn(async (_job: unknown) => [] as string[]),
}));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", locale: "en-GB", loading: false, envVars: {} }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  TEAM_PERMISSIONS: { canCreate: true, canEditProject: true, canEditMember: true },
  useTeamProject: () => ({ ...ok(state.project), error: state.error }),
  useProjectMembers: () => ok(state.members),
  useMemberDescriptions: () => ok(DESCRIPTIONS),
  useMemberSearch: (term: string) => ok(term ? state.people : []),
  useTeamWrites: () => ({ run: state.run, progress: null, error: null, success: null, clear: () => {} }),
}));

import TeamScreen from "./Screen";

function renderScreen(project: TeamProject | null = baseProject, members: ProjectMemberRow[] = [CARA]) {
  state.project = project;
  state.members = members;
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter><TeamScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

const lastJob = (): PlanJob => state.run.mock.calls.at(-1)![0] as PlanJob;
const radio = () => screen.getByTestId("img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection_1-m-1");

afterEach(() => {
  cleanup();
  state.run.mockClear();
  state.error = undefined;
  state.people = [];
});

describe("UT-TEAM Team screen (connected)", () => {
  it("UT-TEAM-901 renders the canvas headers, the manager row and the member row with tooltips", () => {
    renderScreen();
    expect(screen.getByTestId("Project General Team Screen")).toBeTruthy();
    for (const header of Object.values(TEAM_COLUMN_HEADERS)) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(screen.getByText("Project Manager")).toBeTruthy();
    expect(screen.getByText("Anna Beck").getAttribute("title")).toBe("anna.beck@vsb.energy");
    expect(screen.getByText("Cara Diaz").getAttribute("title")).toBe("cara.diaz@vsb.energy");
    expect(screen.getByText("Site lead")).toBeTruthy();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.queryByText(PAGE_LOCK_TITLE)).toBeNull();
  });

  it("UT-TEAM-902 Add Member is enabled; Edit and Delete wait for a selection", () => {
    renderScreen();
    expect(screen.getByTestId("command-newMember").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("command-editMember").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: TEAM_COMMAND_LABELS.delete }).hasAttribute("disabled")).toBe(true);
  });

  it("UT-TEAM-903 the lock banner disables the whole bar and lists the missing sections", () => {
    renderScreen({ ...baseProject, netYieldP50: 0, clusterStateName: "Draft" });
    expect(screen.getByText(PAGE_LOCK_TITLE)).toBeTruthy();
    expect(screen.getByTestId("lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_19").textContent)
      .toBe("• Production");
    expect(screen.getByText("• Change the project status from Draft")).toBeTruthy();
    for (const key of ["newMember", "editMember", "deleteMember"]) {
      expect(screen.getByTestId(`command-${key}`).hasAttribute("disabled")).toBe(true);
    }
  });

  it("UT-TEAM-904 the row selection toggles: a second click clears it", () => {
    renderScreen();
    expect(radio().getAttribute("aria-label")).toBe("img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection_1");
    fireEvent.click(radio());
    expect(radio().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("command-editMember").hasAttribute("disabled")).toBe(false);
    fireEvent.click(radio());
    expect(radio().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("command-editMember").hasAttribute("disabled")).toBe(true);
  });

  it("UT-TEAM-905 Add Member: pick a person and a description, Save creates the row and closes", async () => {
    state.people = [DEE];
    renderScreen();
    fireEvent.click(screen.getByTestId("command-newMember"));
    const save = await screen.findByTestId("pcf_btn_Team_RightPanel_Member_Form_Buttons_Save");
    expect(save.getAttribute("title")).toBe("Add Project Member");
    expect(save.hasAttribute("disabled")).toBe(true);
    // A blank ADD shows no error label — only a disabled Save.
    expect(screen.queryByTestId("lbl_Team_RightPanel_Member_Form_Principal_ErrorMessage")).toBeNull();

    fireEvent.change(screen.getByTestId("pcf_Team_RightPanel_Member_Form_Principal"), { target: { value: "dee" } });
    fireEvent.click(await screen.findByTestId("pcf_Team_RightPanel_Member_Form_Principal-suggestion-e-2"));
    fireEvent.click(screen.getByTestId("drp_Team_RightPanel_Member_Form_Position_TableBackedChoices"));
    fireEvent.click(await screen.findByRole("option", { name: "Legal" }));
    fireEvent.change(screen.getByTestId("txt_Team_RightPanel_Member_Form_Comments_Comments"), { target: { value: " hi " } });

    await waitFor(() => expect(screen.getByTestId("pcf_btn_Team_RightPanel_Member_Form_Buttons_Save").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByTestId("pcf_btn_Team_RightPanel_Member_Form_Buttons_Save"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    const job = lastJob();
    expect(job.progress).toBe("The member 'Dee Roy' will be added, please wait...");
    const plan = job.plan as WritePlan;
    expect(plan.writes[0]).toMatchObject({ op: "create", entitySet: "vsb_projectmemberses" });
    expect(plan.writes[0]!.data).toMatchObject({
      vsb_name: "MBR-dee.roy@vsb.energy", vsb_comment: "hi",
      "vsb_Member@odata.bind": "/aadusers(e-2)",
      "vsb_ProjectDescription@odata.bind": "/vsb_projectmemberdescriptionses(d-2)",
    });
    await waitFor(() => expect(screen.queryByTestId("pcf_btn_Team_RightPanel_Member_Form_Buttons_Save")).toBeNull());
  });

  it("UT-TEAM-906 Edit pre-fills the panel and Save updates the selected row", async () => {
    renderScreen();
    fireEvent.click(radio());
    fireEvent.click(screen.getByTestId("command-editMember"));
    await screen.findByTestId("pcf_Team_RightPanel_Member_Form_Principal-remove-e-1");
    expect((screen.getByTestId("txt_Team_RightPanel_Member_Form_Comments_Comments") as HTMLTextAreaElement).value)
      .toBe("On site Tuesdays");
    expect(screen.getByTestId("psf_Team_RightPanel_Member_Form_CommandBar").getAttribute("aria-label"))
      .toBe("psf_Team_RightPanel_Member_Form_CommandBar");

    // Removing the person while editing shows the canvas error label and disables Save.
    fireEvent.click(screen.getByTestId("pcf_Team_RightPanel_Member_Form_Principal-remove-e-1"));
    expect((await screen.findByTestId("lbl_Team_RightPanel_Member_Form_Principal_ErrorMessage")).textContent)
      .toBe("Input must not be blank");
    expect(screen.getByTestId("pcf_btn_Team_RightPanel_Member_Form_Buttons_Save").hasAttribute("disabled")).toBe(true);
  });

  it("UT-TEAM-907 Edit → Save sends the update with the canvas progress text", async () => {
    renderScreen();
    fireEvent.click(radio());
    fireEvent.click(screen.getByTestId("command-editMember"));
    fireEvent.click(await screen.findByTestId("pcf_btn_Team_RightPanel_Member_Form_Buttons_Save"));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    const job = lastJob();
    expect(job.progress).toBe("Project member information will be updated, please wait...");
    expect((job.plan as WritePlan).writes[0]).toMatchObject({ op: "update", id: "m-1" });
    // The end of Save clears the selection.
    await waitFor(() => expect(radio().getAttribute("aria-checked")).toBe("false"));
  });

  it("UT-TEAM-908 Delete asks with the canvas texts and deletes the selected row", async () => {
    renderScreen();
    fireEvent.click(radio());
    fireEvent.click(screen.getByTestId("command-deleteMember"));
    expect(await screen.findByText("Deletion of Project Member")).toBeTruthy();
    expect(screen.getByText('Are you sure you want to delete the project member "Cara Diaz"?')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    expect((lastJob().plan as WritePlan).writes).toEqual([
      { op: "delete", entitySet: "vsb_projectmemberses", id: "m-1", reason: "delete the project member" },
    ]);
  });

  it("UT-TEAM-909 a failed read renders the load-error state, not an empty team", () => {
    state.error = new Error("403");
    renderScreen();
    expect(screen.getByText(TEAM_SCREEN_TEXT.loadFailedTitle)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
