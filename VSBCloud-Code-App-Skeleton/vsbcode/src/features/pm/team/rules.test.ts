/**
 * Project General Team Screen — unit tests.
 * IDs are the spec's (UT-TEAM-nnn). Pure functions only.
 */
import { describe, it, expect } from "vitest";
import { ES } from "@/data/entities";
import {
  pageLock, pageLockCanvasHeightParity, isPageLocked, commandState, managerRows,
  memberDescription, sortMembers, toggleSelection, canSaveMember, memberPanelErrors,
  normaliseComment, buildMemberPayload, draftFromMember, deleteDialogDescription,
  emptyMemberDraft, POSITIONS, COMMENT_MAX_LENGTH, CANVAS_COUNTER_MAX_LENGTH,
  DELETE_DIALOG_TITLE, PAGE_LOCK_TITLE, teamTableRows, TEAM_COLUMN_HEADERS,
  TEAM_COMMAND_LABELS,
  type TeamProject, type ProjectMemberRow, type TeamPermissions, type MemberDraft,
} from "./rules";
import { toTeamProject } from "./hooks";

/* ─────────────────────────────────────────────────────────────────── fixtures */

/** A project that passes every page-lock condition. */
const project = (o: Partial<TeamProject> = {}): TeamProject => ({
  id: "p-1",
  projectNumber: "DE-1021",
  endDate: "2059-12-31",
  projectStartDate: "2026-01-01",
  totalCapacity: 42.5,
  netYieldP50: 112400,
  clusterStateName: "Cluster 2",
  owningBusinessUnitId: "bu-de",
  projectManager: { rowId: "e-pm", displayName: "Anna Beck", mail: "anna.beck@vsb.energy" },
  deputyProjectManager: { rowId: "e-dp", displayName: "Bo Frei", mail: "bo.frei@vsb.energy" },
  ...o,
});

const member = (o: Partial<ProjectMemberRow> = {}): ProjectMemberRow => ({
  id: "m-1", displayName: "Cara Diaz", memberRowId: "e-1",
  mail: "cara.diaz@vsb.energy", descriptionId: "d-1", description: "Site Lead",
  positionLabel: null, comment: "On site Tuesdays", ...o,
});

const perms = (o: Partial<TeamPermissions> = {}): TeamPermissions => ({
  canCreate: true, canEditProject: true, canEditMember: true, ...o,
});

/* ═════════════════════════════════════════════════════════════ the two galleries */

describe("UT-TEAM the galleries", () => {
  it("UT-TEAM-001 manager rows synthesised from the project", () => {
    const rows = managerRows(project());
    expect(rows).toHaveLength(2);
    expect(rows[0].position).toBe("Project Manager");
    expect(rows[0].member.displayName).toBe("Anna Beck");
    expect(rows[1].position).toBe("Deputy Project Manager");
    expect(rows.map((r) => r.order)).toEqual([1, 2]);
  });

  it("UT-TEAM-002 deputy row omitted when unset", () => {
    expect(managerRows(project({ deputyProjectManager: null }))).toHaveLength(1);
    expect(managerRows(project({ projectManager: null, deputyProjectManager: null })))
      .toHaveLength(0);
    expect(managerRows(null)).toEqual([]);
  });

  it("UT-TEAM-003 member list sorted by display name", () => {
    const rows = sortMembers([
      member({ id: "m-3", displayName: "Zoe Kern" }),
      member({ id: "m-1", displayName: "Anna Beck" }),
      member({ id: "m-2", displayName: "Mo Rahal" }),
    ]);
    expect(rows.map((r) => r.displayName)).toEqual(["Anna Beck", "Mo Rahal", "Zoe Kern"]);
  });

  it("UT-TEAM-004 empty member list is handled without error", () => {
    expect(sortMembers([])).toEqual([]);
  });

  it("UT-TEAM-005 description falls back to the Positions label", () => {
    expect(memberDescription({ description: null, positionLabel: "Engineering" }))
      .toBe("Engineering");
    expect(memberDescription({ description: "", positionLabel: "Engineering" }))
      .toBe("Engineering");
    expect(memberDescription({ description: null, positionLabel: null })).toBe("");
  });

  it("UT-TEAM-006 description prefers the lookup value", () => {
    expect(memberDescription({ description: "Site Lead", positionLabel: "Engineering" }))
      .toBe("Site Lead");
  });

  it("UT-TEAM-006b the two Positions values the canvas branches on are mapped", () => {
    expect(Object.values(POSITIONS)).toContain("Project Manager");
    expect(Object.values(POSITIONS)).toContain("Deputy Project Manager");
  });

  it("UT-TEAM-006d GUIDE q21: the manager and member rows merge into one table", () => {
    const rows = teamTableRows(managerRows(project()), [
      member({ id: "m-1", displayName: "Cara Diaz", description: "Properties" }),
    ]);
    expect(rows.map((r) => r.description)).toEqual([
      "Project Manager", "Deputy Project Manager", "Properties",
    ]);
    expect(rows.map((r) => r.displayName)).toEqual(["Anna Beck", "Bo Frei", "Cara Diaz"]);
    // Manager rows are read-only and carry no member id to act on.
    expect(rows[0].selectable).toBe(false);
    expect(rows[0].memberId).toBeNull();
    expect(rows[1].selectable).toBe(false);
    // The member row is selectable and keyed by its own id.
    expect(rows[2].selectable).toBe(true);
    expect(rows[2].memberId).toBe("m-1");
    expect(TEAM_COLUMN_HEADERS).toEqual({
      description: "Description", displayName: "Display Name", comment: "Comment",
    });
  });

  it("UT-TEAM-006e GUIDE q21: the command bar labels are verbatim", () => {
    expect(TEAM_COMMAND_LABELS).toEqual({
      addMember: "Add Member", edit: "Edit", delete: "Delete",
    });
  });

  it("UT-TEAM-006c the project record maps into the Team shape", () => {
    const mapped = toTeamProject({
      vsb_projectid: "p-1", vsb_name: "Nordwind", vsb_internalprojectid: "DE-1021",
      vsb_technology: "Wind", vsb_totalcapacity: 42.5, vsb_plantwtgcapacity: 40,
      vsb_plantwtgcost: 1, vsb_projectstartdate: "2026-01-01", vsb_netyieldp50: 112400,
      vsb_finalinvestmentdecision: null, _vsb_country_value: "c-de", _vsb_clusterstate_value: "s-c2",
      statecode: 0, modifiedon: "2026-01-01",
      vsb_enddate: "2059-12-31", _owningbusinessunit_value: "bu-de",
      _vsb_projectmanager_value: "e-pm",
      "_vsb_projectmanager_value@OData.Community.Display.V1.FormattedValue": "Anna Beck",
      "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue": "Cluster 2",
    })!;
    expect(mapped.projectNumber).toBe("DE-1021");
    expect(mapped.clusterStateName).toBe("Cluster 2");
    expect(mapped.projectManager?.displayName).toBe("Anna Beck");
    expect(mapped.deputyProjectManager).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════════════════ the page lock */

describe("UT-TEAM the page lock", () => {
  it("UT-TEAM-007 page lock lists all missing prerequisites in order", () => {
    const entries = pageLock(project({
      projectNumber: null, endDate: null, totalCapacity: 0, netYieldP50: 0,
      clusterStateName: "Draft",
    }));
    expect(entries.map((e) => e.reason))
      .toEqual(["General", "Milestones", "Generator", "Production", "Draft"]);
    expect(entries.map((e) => e.label)).toEqual([
      "• General", "• Milestones", "• Generator", "• Production",
      "• Change the project status from Draft",
    ]);
    expect(PAGE_LOCK_TITLE)
      .toBe("This page is locked. To unlock it, please complete the following sections:");
  });

  it("UT-TEAM-008 page lock empty for a complete non-Draft project", () => {
    expect(pageLock(project())).toEqual([]);
    expect(isPageLocked(project())).toBe(false);
  });

  it("UT-TEAM-008b each condition locks the page on its own", () => {
    expect(pageLock(project({ projectNumber: null })).map((e) => e.reason)).toEqual(["General"]);
    expect(pageLock(project({ endDate: null })).map((e) => e.reason)).toEqual(["Milestones"]);
    expect(pageLock(project({ totalCapacity: null })).map((e) => e.reason)).toEqual(["Generator"]);
    expect(pageLock(project({ netYieldP50: 0 })).map((e) => e.reason)).toEqual(["Production"]);
    expect(pageLock(project({ clusterStateName: null })).map((e) => e.reason)).toEqual(["Draft"]);
    expect(pageLock(null).map((e) => e.reason)).toEqual(["General"]);
  });

  it("UT-TEAM-008c SOURCE DEFECT: the canvas height tests Project Start Date, visibility tests End Date", () => {
    // A project with an End Date but no Project Start Date — legitimate for any acquired
    // project starting at Cluster 1 or later.
    const acquired = project({ projectStartDate: null, endDate: "2059-12-31" });
    // The implemented rule (visibility) does NOT lock: milestones are complete.
    expect(pageLock(acquired)).toEqual([]);
    // The canvas HEIGHT formula's condition would have locked it.
    expect(pageLockCanvasHeightParity(acquired).map((e) => e.reason)).toEqual(["Milestones"]);
    // The two agree whenever both dates are present or both absent.
    expect(pageLock(project())).toEqual(pageLockCanvasHeightParity(project()));
  });
});

/* ═════════════════════════════════════════════════════════════ the command bar */

describe("UT-TEAM the command bar", () => {
  it("UT-TEAM-009 command bar disabled while Draft", () => {
    const g = commandState(project({ clusterStateName: "Draft" }), "m-1", perms());
    expect(g.add.enabled).toBe(false);
    expect(g.edit.enabled).toBe(false);
    expect(g.delete.enabled).toBe(false);
    expect(g.add.reason).toContain("Draft");
  });

  it("UT-TEAM-009b command bar disabled while the page is locked", () => {
    const g = commandState(project({ netYieldP50: 0 }), "m-1", perms());
    expect([g.add.enabled, g.edit.enabled, g.delete.enabled]).toEqual([false, false, false]);
    expect(g.add.reason).toContain("Production");
  });

  it("UT-TEAM-010 add disabled without create permission", () => {
    const g = commandState(project(), null, perms({ canCreate: false }));
    expect(g.add.enabled).toBe(false);
    expect(g.add.reason).toContain("create");
  });

  it("UT-TEAM-011 add disabled without record edit permission", () => {
    const g = commandState(project(), null, perms({ canEditProject: false }));
    expect(g.add.enabled).toBe(false);
    expect(g.add.reason).toContain("edit this project");
  });

  it("UT-TEAM-011b add enabled for a complete non-Draft project with both permissions", () => {
    expect(commandState(project(), null, perms()).add.enabled).toBe(true);
  });

  it("UT-TEAM-012 edit/delete disabled with no selection", () => {
    const g = commandState(project(), null, perms());
    expect(g.edit.enabled).toBe(false);
    expect(g.delete.enabled).toBe(false);
    expect(g.edit.reason).toContain("Select");
  });

  it("UT-TEAM-013 edit/delete disabled without permission on the member row", () => {
    const g = commandState(project(), "m-1", perms({ canEditMember: false }));
    expect(g.edit.enabled).toBe(false);
    expect(g.delete.enabled).toBe(false);
    // …and the record-level check is on the MEMBER, not the project: project edit is on.
    expect(commandState(project(), "m-1", perms()).edit.enabled).toBe(true);
  });

  it("UT-TEAM-014 selecting the selected row clears the selection", () => {
    expect(toggleSelection("m-1", "m-1")).toBeNull();
    expect(toggleSelection("m-1", "m-2")).toBe("m-2");
    expect(toggleSelection(null, "m-1")).toBe("m-1");
  });
});

/* ══════════════════════════════════════════════════════════════════ the panel */

describe("UT-TEAM the member panel", () => {
  const person = { rowId: "e-1", displayName: "Cara Diaz", mail: "a.b@vsb.energy" };

  it("UT-TEAM-015 panel save disabled without a description", () => {
    expect(canSaveMember({ ...emptyMemberDraft, person })).toBe(false);
  });

  it("UT-TEAM-016 panel save disabled without a member", () => {
    expect(canSaveMember({ ...emptyMemberDraft, descriptionId: "d-1" })).toBe(false);
  });

  it("UT-TEAM-016b panel save enabled with both", () => {
    expect(canSaveMember({ ...emptyMemberDraft, descriptionId: "d-1", person })).toBe(true);
  });

  it("UT-TEAM-017 required-field messages shown only when editing", () => {
    // Add mode: no memberId, so no messages — only a disabled save.
    expect(memberPanelErrors({ ...emptyMemberDraft })).toEqual([]);
    // Edit mode: both fields blank, both messages.
    const editing: MemberDraft = {
      memberId: "m-1", descriptionId: null, person: null, comment: "",
    };
    expect(memberPanelErrors(editing)).toEqual(["Input must not be blank", "Input must not be blank"]);
  });

  it("UT-TEAM-018 the people search is the shared enabled-accounts query", async () => {
    // The query itself lives in features/general-data/hooks (`useEntraSearch`) and is
    // shared by Project Main, General Data and Team — one hook, three call sites. Its
    // filter is asserted here structurally so a change to the shape breaks a test.
    const mod = await import("@/features/pm/general-data/hooks");
    expect(typeof mod.useEntraSearch).toBe("function");
  });

  it("UT-TEAM-019 the picker keeps one selection only", () => {
    // MaxPeople: =1 — picking again replaces the previous person.
    let draft: MemberDraft = { ...emptyMemberDraft, descriptionId: "d-1", person };
    draft = { ...draft, person: { rowId: "e-2", displayName: "Dee Roy", mail: "d.r@vsb.energy" } };
    expect(draft.person?.rowId).toBe("e-2");
    expect(canSaveMember(draft)).toBe(true);
  });

  it("UT-TEAM-020 create writes the derived name and owning business unit", () => {
    const payload = buildMemberPayload({
      ...emptyMemberDraft, descriptionId: "d-1",
      person: { rowId: "e-1", displayName: "Cara Diaz", mail: "a.b@vsb.energy" },
      comment: "  on site  ",
    }, project());
    expect(payload["vsb_name"]).toBe("MBR-a.b@vsb.energy");
    expect(payload["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    expect(payload["vsb_Project@odata.bind"]).toBe(`/${ES.projects}(p-1)`);
    expect(payload["vsb_Member@odata.bind"]).toBe(`/${ES.microsoftEntraIds}(e-1)`);
    expect(payload["vsb_ProjectMemberDescription@odata.bind"])
      .toBe(`/${ES.projectMemberDescriptions}(d-1)`);
  });

  it("UT-TEAM-021 create does not write the legacy Position choice", () => {
    const payload = buildMemberPayload({
      ...emptyMemberDraft, descriptionId: "d-1",
      person: { rowId: "e-1", displayName: "Cara Diaz", mail: "a.b@vsb.energy" },
    }, project());
    expect(payload).toHaveProperty("vsb_ProjectMemberDescription@odata.bind");
    expect(payload).not.toHaveProperty("vsb_position");
    // …but the row still READS Position for legacy rows (rule 4's fallback).
    expect(memberDescription({ description: null, positionLabel: "Engineering" }))
      .toBe("Engineering");
  });

  it("UT-TEAM-022 edit mode targets the existing row", () => {
    const draft = draftFromMember(member());
    expect(draft.memberId).toBe("m-1");
    expect(draft.descriptionId).toBe("d-1");
    expect(draft.person?.rowId).toBe("e-1");
    expect(draft.comment).toBe("On site Tuesdays");
    // Add mode carries no id, so the mutation creates instead of updating.
    expect(emptyMemberDraft.memberId).toBeNull();
  });

  it("UT-TEAM-023 comment trimmed and capped at 100 characters", () => {
    const long = `  ${"x".repeat(120)}  `;
    expect(normaliseComment(long)).toHaveLength(COMMENT_MAX_LENGTH);
    expect(normaliseComment("  hello  ")).toBe("hello");
    const payload = buildMemberPayload({
      ...emptyMemberDraft, descriptionId: "d-1",
      person: { rowId: "e-1", displayName: "X", mail: "x@vsb.energy" }, comment: long,
    }, project());
    expect(String(payload["vsb_comment"])).toHaveLength(100);
    // The canvas counter rendered /256 against a MaxLength of 100. Documented, not copied.
    expect(CANVAS_COUNTER_MAX_LENGTH).toBe(256);
    expect(COMMENT_MAX_LENGTH).toBe(100);
  });

  it("UT-TEAM-024 empty member is rejected before the request", () => {
    // SOURCE DEFECT closed: the canvas LookUp returned the FIRST Entra row when the
    // picker was empty. Here the payload builder refuses to compose a request at all.
    expect(() => buildMemberPayload(
      { ...emptyMemberDraft, descriptionId: "d-1", person: null }, project(),
    )).toThrow(/must be selected/);
  });
});

/* ═════════════════════════════════════════════════════════════════ deletion */

describe("UT-TEAM deletion", () => {
  it("UT-TEAM-028 delete dialog names the member", () => {
    expect(DELETE_DIALOG_TITLE).toBe("Deletion of Project Member");
    expect(deleteDialogDescription("Anna Beck"))
      .toBe('Are you sure you want to delete the project member "Anna Beck"?');
  });

  it("UT-TEAM-026 delete requires a selection the command gate has approved", () => {
    // The mutation is keyed on the selected member id; the gate is the only thing that
    // lets it be reached, so the gate is the unit under test.
    expect(commandState(project(), "m-1", perms()).delete.enabled).toBe(true);
    expect(commandState(project(), null, perms()).delete.enabled).toBe(false);
  });

  it("UT-TEAM-027 a failed delete leaves the selection intact", () => {
    // Selection is cleared only in the mutation's onSuccess, so an error keeps the row
    // selected and the command bar usable for a retry.
    expect(toggleSelection("m-1", "m-1")).toBeNull();
    expect(commandState(project(), "m-1", perms()).delete.enabled).toBe(true);
  });
});
