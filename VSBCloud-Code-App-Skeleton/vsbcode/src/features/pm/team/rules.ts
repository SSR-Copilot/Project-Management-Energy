/**
 * Project General Team Screen — business rules.
 *
 * Canvas screen: `Project General Team Screen` (PM app)
 *   66 controls · 1 394 lines of Power Fx · 16 substantive blocks · band S
 *
 * Everything here is pure. `Screen.tsx` and `hooks.ts` call it; `rules.test.ts` tests it.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The `SVGImages` selection dot (rule 6): the canvas rendered the radio column as
 *    `Concatenate("data:image/svg+xml;utf8, ", EncodeUrl(varSvgImageRecord.SVGCode))`,
 *    picking `CircleDotBlue` / `CircleEmpty` per row. The grid's own single-select does
 *    this, so the `SVGImages` static data source is gone.
 *  - `cmp_PopUp_Team_Leave_Confirmation` (rule 19): it is wired to
 *    `locLeaveGeneralDataConfirmationDialog`, which NOTHING on this screen ever sets, so
 *    the dialog is unreachable. The panel has no unsaved-changes semantics worth guarding.
 *  - `colProjectsPrincipals` / `colProjectsPrincipalsPreSelected` and the
 *    `RenameColumns(FirstN(Users, 0), ...)` shape template — a zero-row query used purely
 *    to give a collection its column names.
 *  - The `locTeamlDataSavingDialogText` pattern (rule 16): the canvas wrote the success or
 *    error message into the loading overlay's text and then immediately blanked it, so the
 *    final message was never visible. Replaced by a real toast plus a `LoadingOverlay`.
 */
import { isBlank } from "@/domain/numeric";
import { ES, CHOICE } from "@/data/entities";
import { bind } from "@/features/pm/general-data/rules";

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
  /** `'A unique identifer for Microsoft Entra ID'` — the row id the lookup binds to. */
  rowId: string;
  displayName: string;
  mail: string | null;
}

export interface ProjectMemberRow {
  id: string;
  /** `Member.'Display Name'`, added by the gallery's `AddColumns`. */
  displayName: string;
  memberRowId: string | null;
  mail: string | null;
  /** `'Project Member Description'.Description` */
  descriptionId: string | null;
  description: string | null;
  /**
   * The legacy `Position` choice. READ for rows created before the switch, never written
   * (rule 14). This is the FORMATTED label, which is what
   * `LookUp(Choices(Positions), Value = ThisItem.Position, Value)` returns.
   */
  positionLabel: string | null;
  comment: string;
}

/** `Positions` on `Project Members.vsb_position` — 17 values; these two are branched on. */
export const POSITIONS: Record<number, string> = {
  [CHOICE.position.projectManager]: "Project Manager",
  [CHOICE.position.deputyProjectManager]: "Deputy Project Manager",
};

/* ═════════════════════════════════════════════════════════ the manager gallery ════ */

export interface ManagerRow {
  position: "Project Manager" | "Deputy Project Manager";
  member: TeamPerson;
  order: number;
}

/**
 * Rule 2 — the top gallery is built IN MEMORY from the project record, not from
 * `Project Members`, and is not editable here. The deputy row is appended with
 * `order: 2` only when the project actually has one.
 */
export function managerRows(project: TeamProject | null): ManagerRow[] {
  if (!project) return [];
  const out: ManagerRow[] = [];
  if (project.projectManager) {
    out.push({ position: "Project Manager", member: project.projectManager, order: 1 });
  }
  if (project.deputyProjectManager) {
    out.push({
      position: "Deputy Project Manager", member: project.deputyProjectManager, order: 2,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * Rule 4 — `Coalesce(ThisItem.'Project Member Description'.Description,
 *                    LookUp(Choices(Positions), Value = ThisItem.Position, Value))`
 */
export function memberDescription(
  member: Pick<ProjectMemberRow, "description" | "positionLabel">,
): string {
  if (!isBlank(member.description)) return member.description!;
  if (!isBlank(member.positionLabel)) return member.positionLabel!;
  return "";
}

/** Rule 3 — the member gallery is sorted by the expanded display name, ascending. */
export const sortMembers = (rows: ProjectMemberRow[]): ProjectMemberRow[] =>
  rows.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));

/* ═══════════════════════════════════════════════════════════════ the merged table ════ */

/**
 * GUIDE q21: the two galleries render as ONE table sharing the "Description" / "Display
 * Name" / "Comment" columns, not as two separate sections with their own headers — the
 * screenshot's Project Manager row and its Properties (member) row sit in the same grid.
 * The manager rows stay read-only and unselectable (rule 2); only member rows carry the
 * row-select control and an id the Edit/Delete commands can act on.
 */
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
  comment: string;
  selectable: boolean;
  memberId: string | null;
}

export function teamTableRows(
  managers: ManagerRow[],
  members: ProjectMemberRow[],
): TeamTableRow[] {
  const managerRowsOut: TeamTableRow[] = managers.map((m) => ({
    key: `manager-${m.order}`,
    description: m.position,
    displayName: m.member.displayName,
    comment: "",
    selectable: false,
    memberId: null,
  }));
  const memberRowsOut: TeamTableRow[] = members.map((m) => ({
    key: m.id,
    description: memberDescription(m),
    displayName: m.displayName,
    comment: m.comment,
    selectable: true,
    memberId: m.id,
  }));
  return [...managerRowsOut, ...memberRowsOut];
}

/**
 * Rule 5 — selection is a single-row toggle: clicking the selected row clears it,
 * clicking another row selects that one.
 */
export const toggleSelection = (
  current: string | null, clicked: string,
): string | null => (current === clicked ? null : clicked);

/* ═════════════════════════════════════════════════════════════════ the page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

export type PageLockReason = "General" | "Milestones" | "Generator" | "Production" | "Draft";

export interface PageLockEntry { reason: PageLockReason; label: string }

/**
 * `con_Milestones_Page_LockMessage_4.Visible` — the ordered list of missing prerequisites.
 *
 * SOURCE DEFECT: the banner's *height* formula tests `IsBlank('Project Start Date')` for
 * the Milestones line, while its *visibility* formula and the line's own `Visible` both
 * test `IsBlank('End Date')`. The two disagree, so on a project with an End Date but no
 * Project Start Date the banner is sized for a line it does not show — and on the reverse
 * it shows a line it did not size for.
 *
 * RESOLVED to `End Date`, because that is what the visibility rule and the line itself
 * use, and it is the semantically right test: End Date is the last milestone and the one
 * whose presence means the Milestones screen has actually been completed. Project Start
 * Date is optional for any project whose start cluster is 1 or later, so testing it would
 * lock the Team screen permanently for every acquired project.
 *
 * The canvas height behaviour is not kept reachable: it was a layout arithmetic bug with
 * no observable behaviour worth preserving.
 */
export function pageLock(project: TeamProject | null): PageLockEntry[] {
  if (!project) return [{ reason: "General", label: "• General" }];
  const out: PageLockEntry[] = [];

  if (isBlank(project.projectNumber)) out.push({ reason: "General", label: "• General" });
  // See the SOURCE DEFECT note above: 'End Date', not 'Project Start Date'.
  if (isBlank(project.endDate)) out.push({ reason: "Milestones", label: "• Milestones" });
  if (!project.totalCapacity) out.push({ reason: "Generator", label: "• Generator" });
  if (!project.netYieldP50) out.push({ reason: "Production", label: "• Production" });
  if (isBlank(project.clusterStateName) || project.clusterStateName === "Draft") {
    out.push({ reason: "Draft", label: "• Change the project status from Draft" });
  }

  return out;
}

export const isPageLocked = (project: TeamProject | null): boolean =>
  pageLock(project).length > 0;

/**
 * The same condition the canvas's HEIGHT formula uses, kept only so the divergence above
 * is testable and the difference is visible rather than asserted in a comment.
 */
export function pageLockCanvasHeightParity(project: TeamProject | null): PageLockEntry[] {
  if (!project) return [{ reason: "General", label: "• General" }];
  return pageLock({ ...project, endDate: project.projectStartDate });
}

/* ══════════════════════════════════════════════════════════════ the command bar ════ */

export interface TeamPermissions {
  /** `DataSourceInfo(Projects, DataSourceInfo.CreatePermission)` — server-derived. */
  canCreate: boolean;
  /** `RecordInfo(gblRecordSelectedProject, RecordInfo.EditPermission)` — server-derived. */
  canEditProject: boolean;
  /**
   * `RecordInfo(locSelectedMember, RecordInfo.EditPermission)` — note this is a
   * RECORD-level check on the MEMBER row, not on the project (rule 9).
   */
  canEditMember: boolean;
}

/** GUIDE q21 — the three command-bar labels, verbatim ("+ Add Member", "✎ Edit", "🗑 Delete"). */
export const TEAM_COMMAND_LABELS = {
  /**
   * `pcf_Team_DisplayProject_Body_CommandBar_Menu.Items.ItemDisplayName` — verbatim (the canvas
   * literal lives in that formula's record field).
   */
  addMember: "Add Member",
  /** `btn_Edit_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  edit: "Edit",
  /** `btn_Delete_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  delete: "Delete",
} as const;

export interface CommandGate { enabled: boolean; reason?: string }
export interface TeamCommandState {
  add: CommandGate;
  edit: CommandGate;
  delete: CommandGate;
}

/**
 * Rules 7–9.
 *
 * Rule 7 disables the WHOLE command bar while the project is Draft or the lock banner is
 * showing. Rule 8 adds create + record-edit permission and a non-Draft cluster state to
 * "Add Member". Rule 9 requires a selection and record-level edit permission on the
 * selected member for Edit and Delete.
 */
export function commandState(
  project: TeamProject | null,
  selectedMemberId: string | null,
  perms: TeamPermissions,
): TeamCommandState {
  const isDraft = isBlank(project?.clusterStateName) || project?.clusterStateName === "Draft";
  const locked = isPageLocked(project);

  // Rule 7 — the bar itself is disabled; nothing below can re-enable a command.
  if (isDraft || locked) {
    const reason = isDraft
      ? "The project is still in Draft. Advance its cluster state to manage the team."
      : "Complete General Data, Milestones, Generator and Production first.";
    return {
      add: { enabled: false, reason },
      edit: { enabled: false, reason },
      delete: { enabled: false, reason },
    };
  }

  const add: CommandGate =
    !project?.id ? { enabled: false, reason: "No project is selected." }
    : !perms.canCreate ? { enabled: false, reason: "You do not have permission to create project members." }
    : !perms.canEditProject ? { enabled: false, reason: "You do not have permission to edit this project." }
    : { enabled: true };

  const onSelection: CommandGate =
    !selectedMemberId ? { enabled: false, reason: "Select a team member first." }
    : !perms.canEditMember ? { enabled: false, reason: "You do not have permission to change this member." }
    : { enabled: true };

  return { add, edit: onSelection, delete: onSelection };
}

/* ══════════════════════════════════════════════════════════════════ the panel ════ */

/** `gblAppConstants.DefaultMiddleMaxLength` — the `Comment` field's real cap. */
export const COMMENT_MAX_LENGTH = 100;
/**
 * `gblAppConstants.DefaultDefMaxLength`. The canvas counter renders `{len}/256` while the
 * input's `MaxLength` is 100 — a mismatch that tells the user they have 156 characters
 * they cannot type. The counter is rendered against `COMMENT_MAX_LENGTH`; this constant
 * exists only to document what was wrong.
 */
export const CANVAS_COUNTER_MAX_LENGTH = 256;

export interface MemberDraft {
  /** Absent in add mode. */
  memberId?: string | null;
  descriptionId: string | null;
  /** The picked persona. `MaxPeople: =1`, so at most one. */
  person: TeamPerson | null;
  comment: string;
}

export const emptyMemberDraft: MemberDraft = {
  memberId: null, descriptionId: null, person: null, comment: "",
};

/** `Comment: Trim(<comment>.Value)`, capped at the field's real `MaxLength`. */
export const normaliseComment = (raw: string): string =>
  raw.trim().slice(0, COMMENT_MAX_LENGTH);

/**
 * Panel save is enabled only when a description is selected, a person is picked, and
 * neither error label is visible.
 */
export const canSaveMember = (draft: MemberDraft): boolean =>
  !isBlank(draft.descriptionId) && draft.person !== null && !isBlank(draft.person.rowId);

/**
 * The two error messages.
 *
 * Both fire ONLY while editing an existing member
 * (`And(Not(IsBlank(locSelectedMember)), IsBlank(<field>))`), so a blank ADD shows no
 * message — only a disabled save. That is preserved: it reads as "we are not going to
 * nag you about a form you have only just opened".
 */
export function memberPanelErrors(draft: MemberDraft): string[] {
  const editing = !isBlank(draft.memberId);
  if (!editing) return [];
  const out: string[] = [];
  if (isBlank(draft.descriptionId)) out.push("Input must not be blank");
  if (!draft.person) out.push("Input must not be blank");
  return out;
}

/**
 * Rule 13/14 — the `Project Members` payload.
 *
 * `Name` is DERIVED (`MBR-<member mail>`), never entered, and composed here so it cannot
 * drift between the add and edit paths.
 *
 * `Position` is deliberately NOT written. The canvas commented the line out
 * (`// Position: drp_..._Position.Selected.Value`), so new rows carry only the
 * `Project Member Description` lookup and legacy rows rely on the `Coalesce` fallback in
 * `memberDescription`. The repository keeps READING `Position` for those old rows.
 */
export function buildMemberPayload(
  draft: MemberDraft,
  project: TeamProject,
): Record<string, unknown> {
  if (!draft.person?.rowId) {
    // SOURCE DEFECT closed here, not only in the UI. The canvas wrote
    //   LookUp('Microsoft Entra IDs', Or(IsBlank(First(picker.SelectedPeople)), <id match>))
    // which returns the FIRST Entra row when the picker is empty — an arbitrary person
    // silently added to the project team. The save button's DisplayMode was the only
    // guard, and it lives in the UI.
    throw new Error("A team member must be selected before saving.");
  }
  return {
    vsb_name: `MBR-${draft.person.mail ?? ""}`,
    vsb_comment: normaliseComment(draft.comment),
    ...bind("vsb_Project", ES.projects, project.id),
    ...bind("vsb_Member", ES.microsoftEntraIds, draft.person.rowId),
    ...bind("vsb_ProjectMemberDescription", ES.projectMemberDescriptions, draft.descriptionId),
    "owningbusinessunit@odata.bind": project.owningBusinessUnitId
      ? `/businessunits(${project.owningBusinessUnitId})` : null,
  };
}

/** Rule 17 — the confirmation dialog's title and description. */
/** `cmp_PopUp_Member_Delete_Confirmation.Title` — verbatim. */
export const DELETE_DIALOG_TITLE = "Deletion of Project Member";
export const deleteDialogDescription = (displayName: string): string =>
  `Are you sure you want to delete the project member "${displayName}"?`;

/** Edit mode pre-loads the existing row into the draft. */
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
