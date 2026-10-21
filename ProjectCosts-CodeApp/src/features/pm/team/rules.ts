/**
 * Project General Team Screen — business rules (connected 19 Oct 2026, D30).
 *
 * Canvas screen: `Project General Team Screen.pa.yaml` (PM app, solution 1.21.709). `Y:<n>` below
 * is a line in that file.
 *
 * Everything here is pure. `Screen.tsx` and `hooks.ts` call it; `rules.test.ts` tests it.
 *
 * NOT PORTED (no behaviour of their own):
 *  - The `SVGImages` selection dot: `CircleDotBlue` / `CircleEmpty` per row is the radio button's
 *    own checked state.
 *  - `cmp_PopUp_Team_Leave_Confirmation` (Y:1711): wired to `locLeaveGeneralDataConfirmationDialog`,
 *    which nothing on this screen ever sets, so the dialog is unreachable.
 *  - `colProjectsPrincipals` / `colProjectsPrincipalsPreSelected` and the
 *    `RenameColumns(FirstN(Users, 0), …)` shape template — a zero-row query used only to give a
 *    collection its column names.
 *  - The hidden `pcf_btn_Team_RightPanel_Member_Form_Buttons_Reset` (Y:1552), `Select`ed after every
 *    command, close and cancel: it resets the dropdown, the comment and the picker to their defaults.
 *    Here the panel's draft is rebuilt from the selected member every time it opens.
 */
import { isBlank } from "@/domain/powerFxNumeric";
import { ES, CHOICE } from "@/data/dataverseNames";
import { bind } from "@/data/odata";
import { refusePlan, type WritePlan } from "@/data/writePlan";
import type { PlanJob } from "@/data/usePlanWrite";

/* ═══════════════════════════════════════════════════════════════ column names ════ */

/** `Projects` columns the screen reads (generated `Vsb_projectsModel`). */
export const PROJECT_COL = {
  id: "vsb_projectid",
  /** `'Project ID'` — `vsb_name` (dataverse-attributes.json), not `vsb_internalprojectid`. */
  projectNumber: "vsb_name",
  endDate: "vsb_enddate",
  projectStartDate: "vsb_projectstartdate",
  totalCapacity: "vsb_totalcapacity",
  netYieldP50: "vsb_netyieldp50",
  clusterState: "_vsb_clusterstate_value",
  owningBusinessUnit: "_owningbusinessunit_value",
  /** `'Project Manager'` — a lookup to `aaduser`. */
  projectManager: "_vsb_projectmanager_value",
  /** `'Deputy Project Manager'` — `vsb_deputyprojectmanagerentra`, a lookup to `aaduser`. */
  deputyProjectManager: "_vsb_deputyprojectmanagerentra_value",
} as const;

/** `Project Members` columns (generated `Vsb_projectmembersesModel`). */
export const MEMBER_COL = {
  id: "vsb_projectmembersid",
  name: "vsb_name",
  comment: "vsb_comment",
  /** `Position` — the legacy choice, read for old rows, never written. */
  position: "vsb_position",
  project: "_vsb_project_value",
  /** `Member` — lookup to `aaduser` (`vsb_projectmembers_Member_aaduser`, customizations.xml). */
  member: "_vsb_member_value",
  /** `'Project Member Description'` — schema name `vsb_ProjectDescription`. */
  description: "_vsb_projectdescription_value",
  /** The write forms — navigation properties from the generated model. */
  projectBind: "vsb_Project@odata.bind",
  memberBind: "vsb_Member@odata.bind",
  descriptionBind: "vsb_ProjectDescription@odata.bind",
} as const;

/** `Project Member Descriptions` columns (generated `Vsb_projectmemberdescriptionsesModel`). */
export const DESCRIPTION_COL = {
  id: "vsb_projectmemberdescriptionsid",
  /** `Name` — what the panel dropdown shows (`Name21.FieldName: ="vsb_name"`, Y:1331). */
  name: "vsb_name",
  /** `Description` — what the member gallery shows (`'Project Member Description'.Description`). */
  description: "vsb_projectdescription",
} as const;

/** The owner bind, in the form the live screens write. */
const OBU_BIND = "owningbusinessunit@odata.bind";

/* ═════════════════════════════════════════════════════════════════ the model ════ */

export interface TeamProject {
  id: string | null;
  /** 'Project ID' — blank means General Data has never been saved. */
  projectNumber: string | null;
  /** 'End Date' — the Milestones prerequisite. See `pageLock` for the source defect. */
  endDate: string | null;
  /** 'Project Start Date' — what the banner's HEIGHT formula tests instead. */
  projectStartDate: string | null;
  totalCapacity: number | null;
  netYieldP50: number | null;
  clusterStateName: string | null;
  owningBusinessUnitId: string | null;
  projectManager: TeamPerson | null;
  deputyProjectManager: TeamPerson | null;
}

export interface TeamPerson {
  /** The `aaduser` row id (`aaduserid`, which equals the Entra object id) the lookup binds to. */
  rowId: string;
  displayName: string;
  mail: string | null;
}

export interface MemberDescriptionOption {
  id: string;
  /** `vsb_name` — the dropdown text. */
  name: string;
  /** `vsb_projectdescription` — the gallery text. */
  description: string | null;
}

export interface ProjectMemberRow {
  id: string;
  /** `Member.'Display Name'`, added by the gallery's `AddColumns`. */
  displayName: string;
  memberRowId: string | null;
  /** `Member.Mail` — the Name cell's tooltip. */
  mail: string | null;
  /** `'Project Member Description'` */
  descriptionId: string | null;
  /** `'Project Member Description'.Description` */
  description: string | null;
  /**
   * The legacy `Position` choice, as its label — what
   * `LookUp(Choices(Positions), Value = ThisItem.Position, Value)` returns. Read, never written.
   */
  positionLabel: string | null;
  comment: string;
}

/** `Positions` on `Project Members.vsb_position` — the two values the manager rows use. */
export const POSITIONS: Record<number, string> = {
  [CHOICE.position.projectManager]: "Project Manager",
  [CHOICE.position.deputyProjectManager]: "Deputy Project Manager",
};

/* ═════════════════════════════════════════════════════════ the manager gallery ════ */

export interface ManagerRow {
  position: "Project Manager" | "Deputy Project Manager";
  /** Blank when the project has no Project Manager — the canvas still shows the row. */
  member: TeamPerson | null;
  order: number;
}

/**
 * `colProjectMembers` (`OnVisible`, Y:72-91), sorted by `order` (Y:793). Built IN MEMORY from the
 * project, not from `Project Members`, and not editable here.
 *
 * The "Project Manager" row is ALWAYS collected, even when the project has none (it then shows a
 * blank name); the "Deputy Project Manager" row only `If(Not(IsBlank(…)))`.
 */
export function managerRows(project: TeamProject | null): ManagerRow[] {
  if (!project) return [];
  const out: ManagerRow[] = [{ position: "Project Manager", member: project.projectManager, order: 1 }];
  if (project.deputyProjectManager) {
    out.push({ position: "Deputy Project Manager", member: project.deputyProjectManager, order: 2 });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * `lbl_Admin_Controlling_Members_Row_Position_1.Text` (Y:1052):
 * `Coalesce(ThisItem.'Project Member Description'.Description,
 *           LookUp(Choices(Positions), Value = ThisItem.Position, Value))`
 */
export function memberDescription(
  member: Pick<ProjectMemberRow, "description" | "positionLabel">,
): string {
  if (!isBlank(member.description)) return member.description!;
  if (!isBlank(member.positionLabel)) return member.positionLabel!;
  return "";
}

/** `gal_Team_DisplayProject_Body_Content_Memebers.Items` (Y:923): sorted by display name, ascending. */
export const sortMembers = (rows: ProjectMemberRow[]): ProjectMemberRow[] =>
  rows.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));

/* ═══════════════════════════════════════════════════════════════ the merged table ════ */

/** The shared column headers (Y:716, Y:748, Y:780). */
export const TEAM_COLUMN_HEADERS = {
  /** `lbl_Team_DisplayProject_Body_Content_Memebers_Header_Position.Text` — verbatim. */
  description: "Description",
  /** `lbl_Team_DisplayProject_Body_Content_Memebers_Header_Name.Text` — verbatim. */
  displayName: "Display Name",
  /** `lbl_Team_DisplayProject_Body_Content_Memebers_Header_Mail.Text` — verbatim. */
  comment: "Comment",
} as const;

export interface TeamTableRow {
  key: string;
  description: string;
  displayName: string;
  /** The Name cell's tooltip: `ThisItem.member.Mail` / `ThisItem.Member.Mail` (Y:877, Y:1019). */
  mail: string;
  comment: string;
  selectable: boolean;
  memberId: string | null;
}

/**
 * GUIDE q21: the two galleries render as ONE table sharing the three columns. The manager rows stay
 * read-only and unselectable; only member rows carry the selection control and an id.
 */
export function teamTableRows(
  managers: ManagerRow[],
  members: ProjectMemberRow[],
): TeamTableRow[] {
  const managerRowsOut: TeamTableRow[] = managers.map((m) => ({
    key: `manager-${m.order}`,
    description: m.position,
    displayName: m.member?.displayName ?? "",
    mail: m.member?.mail ?? "",
    // `lbl_Admin_Controlling_Members_Row_Comment.Text: =""` (Y:842).
    comment: "",
    selectable: false,
    memberId: null,
  }));
  const memberRowsOut: TeamTableRow[] = members.map((m) => ({
    key: m.id,
    description: memberDescription(m),
    displayName: m.displayName,
    mail: m.mail ?? "",
    comment: m.comment,
    selectable: true,
    memberId: m.id,
  }));
  return [...managerRowsOut, ...memberRowsOut];
}

/**
 * `btn_Contracts_List_Card_Body_PaymentTargetsRow_TransparentButton_1.OnSelect` (Y:1113): clicking
 * the selected row clears the selection; clicking another row selects that one.
 */
export const toggleSelection = (
  current: string | null, clicked: string,
): string | null => (current === clicked ? null : clicked);

/* ═════════════════════════════════════════════════════════════════ the page lock ════ */

/** `lbl_ProjectRevenues_…_VisibilityMessage_15.Text` (Y:356) — verbatim. */
export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";
export const PAGE_LOCK_TITLE_TESTID = "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_15";

export type PageLockReason = "General" | "Milestones" | "Generator" | "Production" | "Draft";

export interface PageLockEntry { reason: PageLockReason; label: string; testId: string }

const LOCK_LINE: Record<PageLockReason, { label: string; testId: string }> = {
  /** `…_VisibilityMessage_16.Text` (Y:374) — verbatim. */
  General: { label: "• General", testId: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_16" },
  /** `…_VisibilityMessage_17.Text` (Y:392) — verbatim. */
  Milestones: { label: "• Milestones", testId: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_17" },
  /** `…_VisibilityMessage_18.Text` (Y:410) — verbatim. */
  Generator: { label: "• Generator", testId: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_18" },
  /** `…_VisibilityMessage_19.Text` (Y:428) — verbatim. */
  Production: { label: "• Production", testId: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_19" },
  /** `…_VisibilityMessage_20.Text` (Y:446) — verbatim. */
  Draft: { label: "• Change the project status from Draft", testId: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_20" },
};

const lockEntry = (reason: PageLockReason): PageLockEntry => ({ reason, ...LOCK_LINE[reason] });

/**
 * `con_Milestones_Page_LockMessage_4.Visible` (Y:289) and each line's own `Visible` (Y:376-452).
 *
 * With no project at all every condition is blank, so the canvas shows all five lines.
 *
 * SOURCE DEFECT: the banner's *height* formula tests `IsBlank('Project Start Date')` for the
 * Milestones line, while its *visibility* formula and the line's own `Visible` test
 * `IsBlank('End Date')`. RESOLVED to `End Date` (what the visibility rule and the line use); the
 * height condition is kept as `pageLockCanvasHeightParity` so the difference is tested.
 */
export function pageLock(project: TeamProject | null): PageLockEntry[] {
  const out: PageLockEntry[] = [];
  if (isBlank(project?.projectNumber)) out.push(lockEntry("General"));
  if (isBlank(project?.endDate)) out.push(lockEntry("Milestones"));
  if (!project?.totalCapacity) out.push(lockEntry("Generator"));
  if (!project?.netYieldP50) out.push(lockEntry("Production"));
  if (isBlank(project?.clusterStateName) || project?.clusterStateName === "Draft") out.push(lockEntry("Draft"));
  return out;
}

export const isPageLocked = (project: TeamProject | null): boolean =>
  pageLock(project).length > 0;

/** The canvas HEIGHT formula's condition (Project Start Date), kept only so the divergence is testable. */
export function pageLockCanvasHeightParity(project: TeamProject | null): PageLockEntry[] {
  if (!project) return pageLock(null);
  return pageLock({ ...project, endDate: project.projectStartDate });
}

/* ══════════════════════════════════════════════════════════════ the command bar ════ */

/**
 * The canvas permission checks. The SDK has no `DataSourceInfo` / `RecordInfo` (D1): the hook
 * passes `true` for all three and Dataverse refuses what the user may not do.
 */
export interface TeamPermissions {
  /** `DataSourceInfo(Projects, DataSourceInfo.CreatePermission)`. */
  canCreate: boolean;
  /** `RecordInfo(gblRecordSelectedProject, RecordInfo.EditPermission)`. */
  canEditProject: boolean;
  /** `RecordInfo(locSelectedMember, RecordInfo.EditPermission)` — on the MEMBER row. */
  canEditMember: boolean;
}

/** `pcf_Team_DisplayProject_Body_CommandBar_Menu.AccessibilityLabel` (Y:496). */
export const COMMAND_BAR_LABEL = "pcf_Team_DisplayProject_Body_CommandBar_Menu";

/** `pcf_Team_DisplayProject_Body_CommandBar_Menu.Items` (Y:508) — the `ItemDisplayName`s, verbatim. */
export const TEAM_COMMAND_LABELS = {
  /** `ItemKey: "newMember"`. */
  addMember: "Add Member",
  /** `ItemKey: "editMember"`. */
  edit: "Edit",
  /** `ItemKey: "deleteMember"`. */
  delete: "Delete",
} as const;

export interface TeamCommandState { add: boolean; edit: boolean; delete: boolean }

/**
 * The bar's `DisplayMode` (Y:497) and each item's `ItemEnabled` (Y:508-549).
 *  - The whole bar is disabled while the Cluster State is blank or "Draft", or the lock banner shows.
 *  - Add Member: a project, create + record-edit permission, Cluster State not "Draft".
 *  - Edit / Delete: a selected member and record-edit permission on it.
 * The canvas shows no reason for a disabled command, so none is invented.
 */
export function commandState(
  project: TeamProject | null,
  selectedMemberId: string | null,
  perms: TeamPermissions,
): TeamCommandState {
  const draft = isBlank(project?.clusterStateName) || project?.clusterStateName === "Draft";
  if (draft || isPageLocked(project)) return { add: false, edit: false, delete: false };
  const add = Boolean(project?.id) && perms.canCreate && perms.canEditProject;
  const onSelection = Boolean(selectedMemberId) && perms.canEditMember;
  return { add, edit: onSelection, delete: onSelection };
}

/* ══════════════════════════════════════════════════════════════════ the panel ════ */

/** `gblAppConstants.DefaultMiddleMaxLength` (App.pa.yaml) — the Comment field's `MaxLength` (Y:1503). */
export const COMMENT_MAX_LENGTH = 100;
/** `gblAppConstants.DefaultDefMaxLength` (App.pa.yaml) — what the canvas counter divides by. */
export const CANVAS_COUNTER_MAX_LENGTH = 256;

/**
 * `lbl_Team_RightPanel_Member_Form_Comments_Details.Text` (Y:1517).
 *
 * SOURCE DEFECT: the canvas renders `{Len}/{DefaultDefMaxLength}` = "n/256" while the input stops
 * at `DefaultMiddleMaxLength` = 100, promising 156 characters nobody can type. The counter is
 * shown against the real cap; `commentCounterCanvasParity` keeps the canvas text.
 */
export const commentCounter = (comment: string): string => `${comment.length}/${COMMENT_MAX_LENGTH}`;
export const commentCounterCanvasParity = (comment: string): string =>
  `${comment.length}/${CANVAS_COUNTER_MAX_LENGTH}`;

export interface MemberDraft {
  /** The member being edited (`locSelectedMember`); null in add mode. */
  memberId: string | null;
  descriptionId: string | null;
  /** The picked persona. `MaxPeople: =1` (Y:1405), so at most one. */
  person: TeamPerson | null;
  comment: string;
}

/** `newMember`: `locSelectedMember: Blank()` and an empty picker (Y:567-612). */
export const emptyMemberDraft: MemberDraft = {
  memberId: null, descriptionId: null, person: null, comment: "",
};

/**
 * `editMember` (Y:614-631): the dropdown defaults to the member's description (Y:1314), the comment
 * to `locSelectedMember.Comment` (Y:1506) and the picker to the member's Entra profile.
 *
 * DIVERGENCE (D25-Q6, D30): the canvas reads `Office365Users.UserProfile(locSelectedMember.Member.Id)`;
 * this app has no Office 365 Users connector, so the persona is the member's `aaduser` row, which
 * `data/team.ts` already resolved (display name and mail) when it read the members.
 */
export function draftFromMember(member: ProjectMemberRow): MemberDraft {
  return {
    memberId: member.id,
    descriptionId: member.descriptionId,
    person: member.memberRowId
      ? { rowId: member.memberRowId, displayName: member.displayName, mail: member.mail }
      : null,
    comment: member.comment,
  };
}

/** `Comment: Trim(txt_Team_RightPanel_Member_Form_Comments_Comments.Value)`, within the field's cap. */
export const normaliseComment = (raw: string): string =>
  raw.trim().slice(0, COMMENT_MAX_LENGTH);

/** `gblAppResx.InputBlank` (App.pa.yaml) — the two required-field messages (Y:1299, Y:1388). */
export const INPUT_BLANK = "Input must not be blank";

export interface MemberPanelErrors {
  /** `lbl_Team_RightPanel_Member_Form_Position_ErrMessage` */
  description?: string;
  /** `lbl_Team_RightPanel_Member_Form_Principal_ErrorMessage` */
  person?: string;
}

/**
 * The two error labels (Y:1300, Y:1391): ONLY while editing an existing member
 * (`And(Not(IsBlank(locSelectedMember)), IsBlank(<field>))`). A blank ADD shows no message — only
 * a disabled Save.
 */
export function memberPanelErrors(draft: MemberDraft): MemberPanelErrors {
  if (isBlank(draft.memberId)) return {};
  return {
    ...(isBlank(draft.descriptionId) ? { description: INPUT_BLANK } : {}),
    ...(!draft.person ? { person: INPUT_BLANK } : {}),
  };
}

/**
 * `pcf_btn_Team_RightPanel_Member_Form_Buttons_Save.DisplayMode` (Y:1573): a description, a person,
 * and neither error label visible.
 */
export function canSaveMember(draft: MemberDraft): boolean {
  const errors = memberPanelErrors(draft);
  return !isBlank(draft.descriptionId) && draft.person !== null && !isBlank(draft.person.rowId)
    && !errors.description && !errors.person;
}

/**
 * The `Project Members` payload of the Save `Patch` (Y:1624-1640), the same for add and edit.
 *
 * `Name` is DERIVED (`MBR-{varCandidateMember.Mail}`). `Position` is NOT written — the canvas line
 * is commented out — so new rows carry only the description lookup and legacy rows rely on the
 * `Coalesce` in `memberDescription`. `'Owning Business Unit'` is the project's.
 */
export function buildMemberPayload(
  draft: MemberDraft,
  project: TeamProject,
): Record<string, unknown> {
  if (!draft.person?.rowId) {
    // SOURCE DEFECT closed here, not only in the UI. The canvas wrote
    //   LookUp('Microsoft Entra IDs', Or(IsBlank(First(picker.SelectedPeople)), <id match>))
    // which returns the FIRST Entra row when the picker is empty — an arbitrary person silently
    // added to the team. The Save button's DisplayMode was the only guard.
    throw new Error("A team member must be selected before saving.");
  }
  return {
    [MEMBER_COL.name]: `MBR-${draft.person.mail ?? ""}`,
    ...(project.id ? { [MEMBER_COL.projectBind]: bind(ES.projects, project.id) } : {}),
    ...(draft.descriptionId ? { [MEMBER_COL.descriptionBind]: bind(ES.projectMemberDescriptions, draft.descriptionId) } : {}),
    [MEMBER_COL.memberBind]: bind(ES.aadUsers, draft.person.rowId),
    [MEMBER_COL.comment]: normaliseComment(draft.comment),
    ...(project.owningBusinessUnitId ? { [OBU_BIND]: `/businessunits(${project.owningBusinessUnitId})` } : {}),
  };
}

/** The Save: `Patch('Project Members', If(IsBlank(locSelectedMember), Defaults(…), locSelectedMember), …)`. */
export function planSaveMember(draft: MemberDraft, project: TeamProject | null): WritePlan {
  if (!project?.id) return refusePlan(MSG.noProject);
  if (!canSaveMember(draft)) return refusePlan(MSG.memberRequired);
  const data = buildMemberPayload(draft, project);
  return {
    writes: [draft.memberId
      ? { op: "update", entitySet: ES.projectMembers, id: draft.memberId, data, reason: "update the project member" }
      : { op: "create", entitySet: ES.projectMembers, data, reason: "add the project member" }],
    log: [],
  };
}

/** `cmp_PopUp_Member_Delete_Confirmation.OnConfirm` (Y:1763): `Remove('Project Members', locSelectedMember)`. */
export function planDeleteMember(memberId: string): WritePlan {
  return {
    writes: [{ op: "delete", entitySet: ES.projectMembers, id: memberId, reason: "delete the project member" }],
    log: [],
  };
}

/* ═══════════════════════════════════════════════════════════════ write texts ════ */

/** The Save and Delete texts. */
export const MSG = {
  /** `locTeamlDataSavingDialogText`, add (Y:1608) — verbatim. */
  adding: (name: string) => `The member '${name}' will be added, please wait...`,
  /** `locTeamlDataSavingDialogText`, edit (Y:1609) — verbatim. */
  updating: "Project member information will be updated, please wait...",
  /** Y:1645 — verbatim. */
  saved: (name: string) => `Project member '${name}' was saved/updated successfully.`,
  /**
   * Y:1648 — `$"Error: Project member could not be changed. Internal error: originated on
   * {FirstError.Source}. Message: {FirstError.Message} {FirstError.Details.HttpResponse}"`. The
   * table stands in for `FirstError.Source`, as on General Data (D25).
   */
  saveError: (detail: string) =>
    `Error: Project member could not be changed. Internal error: originated on ${ES.projectMembers}. Message: ${detail}`,
  /** `locDeleteMemberlDialogText` (Y:1770) — same shape. */
  deleteError: (detail: string) =>
    `Error: Project member could not be deleted. Internal error: originated on ${ES.projectMembers}. Message: ${detail}`,
  /** NEW (D30): the plan refusals — unreachable through the UI, which disables Save first. */
  noProject: "No project is selected.",
  memberRequired: "A team member must be selected before saving.",
} as const;

/**
 * The Save job (Y:1602-1666).
 *
 * SOURCE DEFECT: the canvas writes the success or error text into the saving dialog and then, in
 * the same handler, blanks it and hides the dialog, so neither is ever seen. Both are shown here.
 */
export function saveMemberJob(draft: MemberDraft, project: TeamProject | null): PlanJob {
  const name = draft.person?.displayName ?? "";
  return {
    progress: draft.memberId ? MSG.updating : MSG.adding(name),
    success: MSG.saved(name),
    errorText: MSG.saveError,
    plan: planSaveMember(draft, project),
  };
}

/**
 * The Delete job (Y:1763-1776). The canvas shows no progress text while it deletes, so none is
 * shown (`""` raises no overlay).
 *
 * SOURCE DEFECT: the canvas writes the error into `locDeleteMemberlDialogText`, which no control
 * displays, so a refused delete looked like success. It is shown here.
 */
export function deleteMemberJob(memberId: string): PlanJob {
  return { progress: "", errorText: MSG.deleteError, plan: planDeleteMember(memberId) };
}

/* ══════════════════════════════════════════════════════════ screen captions ════ */

/** `cmp_PopUp_Member_Delete_Confirmation.Title` (Y:1778) — verbatim. */
export const DELETE_DIALOG_TITLE = "Deletion of Project Member";
/** `cmp_PopUp_Member_Delete_Confirmation.Description` (Y:1757) — verbatim. */
export const deleteDialogDescription = (displayName: string): string =>
  `Are you sure you want to delete the project member "${displayName}"?`;
/** `cmp_PopUp_Member_Delete_Confirmation` — ConfirmButtonText / CancelButtonText (Y:1755-1756). */
export const DELETE_DIALOG_BUTTONS = { confirm: "Yes", cancel: "Cancel" } as const;

/** The member panel captions. */
export const TEAM_PANEL_LABELS = {
  /** `lbl_Team_RightPanel_Member_Form_Header.Text` (Y:1197) — for add AND edit. */
  title: "Add Project Member",
  /** `lbl_Team_RightPanel_Member_Form_Position.Text` (Y:1338) */
  description: "Description",
  /** `lbl_Team_RightPanel_Member_Form_Principal.Text` (Y:1460) */
  name: "Name",
  /** `pcf_Team_RightPanel_Member_Form_Principal.HintText` (Y:1402) */
  nameHint: "Select member",
  /** `pcf_Team_RightPanel_Member_Form_Principal.Tooltip` (Y:1451) */
  nameTooltip: "Search member",
  /** `lbl_Team_RightPanel_Member_Form_Comments.Text` (Y:1526) */
  comment: "Comment",
  /** `pcf_btn_Team_RightPanel_Member_Form_Buttons_Save.Tooltip` (Y:1672) */
  saveTooltip: "Add Project Member",
} as const;

/** NEW (D30, rule 19): the load-error state. The canvas has none. */
export const TEAM_SCREEN_TEXT = {
  loadFailedTitle: "Team data is unavailable",
  loadFailedDescription: "The project team could not be loaded. Reload the page to try again.",
} as const;
