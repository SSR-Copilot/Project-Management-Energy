/**
 * Project General Team Screen — composition only (connected 19 Oct 2026, D30).
 *
 * Canvas screen: `Project General Team Screen.pa.yaml` (PM app).
 *
 * Structure, following the canvas containers:
 *   `con_Milestones_Page_LockMessage_4`               the page-lock banner
 *   `pcf_Team_DisplayProject_Body_CommandBar_Menu`    Add Member / Edit / Delete
 *   `con_Team_DisplayProject_Body_Content_Memebers`   one table — the manager rows built from the
 *                                                      project above the `Project Members` rows
 *   `con_Team_RightPanel_Member_Form`                 Description · Name · Comment
 *   `cmp_PopUp_Team_Saving_Dialog`                    `WriteFeedback` (progress, then the result)
 *   `cmp_PopUp_Member_Delete_Confirmation`            the delete confirmation
 *
 * Every caption, gate and write comes from `rules.ts`; every read and write from `./hooks`.
 */
import { useState } from "react";
import {
  Button, Dropdown, Field, Option, Table, TableBody, TableCell, TableHeader, TableHeaderCell,
  TableRow, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { CircleRegular, LockClosedRegular, RecordRegular } from "@fluentui/react-icons";
import {
  type Command,
  CommandBar,
  ConfirmDialog,
  EmptyState,
  FIELD_APPEARANCE,
  FormPanel,
  PanelButtons,
  PeoplePicker,
  TextAreaField,
  WriteFeedback,
  useFieldControlClass,
  useFieldSkin,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { palette, space } from "@/theme/tokens";
import {
  COMMAND_BAR_LABEL, COMMENT_MAX_LENGTH, DELETE_DIALOG_BUTTONS, DELETE_DIALOG_TITLE, PAGE_LOCK_TITLE,
  PAGE_LOCK_TITLE_TESTID, TEAM_COLUMN_HEADERS, TEAM_COMMAND_LABELS, TEAM_PANEL_LABELS, TEAM_SCREEN_TEXT,
  canSaveMember, commandState, deleteDialogDescription, deleteMemberJob, draftFromMember, emptyMemberDraft,
  commentCounterCanvasParity, managerRows, memberPanelErrors, pageLock, saveMemberJob, teamTableRows, toggleSelection,
  type MemberDraft, type TeamPerson,
} from "./rules";
import {
  TEAM_PERMISSIONS, useMemberDescriptions, useMemberSearch, useProjectMembers, useTeamProject, useTeamWrites,
} from "./hooks";

// Layout transcribed from `con_Team_DisplayProject_BodyRightContent` (UI layout pass, 20 Oct 2026).
// The shell's content area scrolls, so the page grows with its content and never clips itself.
const useStyles = makeStyles({
  /** The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Over the members table's left edge (`tableWrap`'s 20 px inset). */
  // Measured off the canvas Team screenshot (27 Oct 2026): "Add Member" sits 8 px further in.
  // The canvas commands also sit 4 px closer together than the shared bar's.
  commandBar: { paddingLeft: "28px", "& .fui-Button": { marginRight: "-4px" } },
  // The right content: a white vertical autolayout, no padding and no gap.
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  // `con_Milestones_Page_LockMessage_4`: Fill RGBA(89,89,89,1), horizontal, gap 10, PaddingLeft 20,
  // items centred; the white 20 px lock icon; `con_Milestones_pagelock_section_4` pads 8.
  lock: {
    display: "flex", alignItems: "center", gap: "10px", paddingLeft: "20px", flex: "none",
    backgroundColor: "rgb(89, 89, 89)", color: palette.white,
  },
  lockIcon: { fontSize: "24px", color: palette.white, flexShrink: 0 },
  lockList: {
    // The bullets start 9 px after the icon on the canvas screenshot, not 18.
    display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "11px", paddingLeft: 0, paddingRight: "8px",
    "& .fui-Text": { color: palette.white, fontWeight: tokens.fontWeightRegular, fontSize: "14px", lineHeight: "19px" },
  },
  // `con_Team_DisplayProject_Body_Content`: PaddingLeft 20, PaddingRight 10, `Parent.Width - 8`; the
  // members container adds PaddingTop 20.
  // On the canvas screenshot it is a framed card: a 1 px light border 9 px under the command
  // bar, from the content's 20 px inset to 10 px short of the right edge, down to the bottom.
  tableWrap: {
    overflowX: "auto", flex: 1, boxSizing: "border-box",
    marginTop: "9px", marginLeft: "19px", marginRight: "10px",
    paddingLeft: 0, paddingRight: "10px", paddingTop: "20px",
    // Top and right edges only: the canvas card shows no left or bottom line.
    borderTopWidth: "1px", borderRightWidth: "1px", borderLeftWidth: 0, borderBottomWidth: 0,
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderTopColor: "#edebe9", borderRightColor: "#edebe9",
  },
  // The header labels sit at X = 40 and are 250 wide each, so the grid is 40 + 3 x 250 = 790.
  table: { width: "790px", tableLayout: "fixed" },
  // `con_…_Memebers_Header`: Fill `gblAppColors.Gallery.Header` (Grayscale40), 32 high; captions
  // Semibold `gblAppSizes.Font.ExtraExtraSmall` (8 pt).
  headerRow: {
    // The canvas screenshot shows the header on white, no grey band and no rule under it.
    backgroundColor: "transparent", height: "32px",
    borderBottomWidth: 0,
    // Captions 2 px left of the cell text under them, as on the canvas screenshot.
    "& th:not(:first-child)": { paddingLeft: "6px" },
    "& th": { borderBottomWidth: 0, height: "32px", paddingTop: 0, paddingBottom: 0, fontSize: "10.67px", fontWeight: tokens.fontWeightSemibold },
  },
  // Each row: TemplateSize 34, labels ExtraExtraSmall (8 pt).
  // No rule between or under the rows on the canvas.
  bodyRow: {
    height: "34px", borderBottomWidth: 0,
    "& td": { fontSize: "10.67px", paddingTop: 0, paddingBottom: 0 },
    "& td:not(:first-child)": { paddingLeft: "10px" },
  },
  col: { width: "250px", overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // The radio image: 16 px at X = 10 in the 40 px lead.
  selectCell: { width: "40px", paddingLeft: "7px", paddingRight: 0 },
  memberRow: { cursor: "pointer" },
  // A plain grey ring on the canvas; the chosen one keeps the theme colour.
  radio: {
    color: "#605e5c", minWidth: "16px", width: "16px", height: "16px",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    "& svg": { fontSize: "16px" },
    "&[aria-checked=\"true\"]": { color: palette.themePrimary },
  },
  // Captions are Semibold in the canvas panel.
  /*
   * Measured off the canvas Add Project Member screenshot (27 Oct 2026): Semibold captions with
   * the `*` hung 10 px left of them; 29 px from the Description box to the Name caption, 23 px from
   * that caption to a white 30 px picker box, 44 px on to the Comment caption, then a 74 px box.
   */
  panelFields: {
    display: "flex", flexDirection: "column", gap: space.m,
    // Doubled class: outranks the shared field skin's caption rule whatever order they load in.
    "& .fui-Field .fui-Field__label.fui-Field__label, & .fui-Label.fui-Label": {
      fontWeight: tokens.fontWeightSemibold, position: "relative",
    },
    "& .fui-Label__required": { position: "absolute", left: "-10px", top: 0 },
    // At rest no underline; focused, the theme-colour bar (canvas screenshots, 27 Oct 2026).
    "& .fui-Dropdown.fui-Dropdown": {
      borderBottomColor: "transparent", borderRadius: "4px",
      ":hover": { borderBottomColor: "transparent" },
      // The canvas bar is 2 px, a shade bolder than Fluent's.
      ":focus-within": { borderBottomColor: "transparent" },
    },
    // The focus bar is Fluent's `::after`; the canvas one is bolder, 3 px.
    "& .fui-Dropdown.fui-Dropdown::after": { borderBottomWidth: "3px", borderBottomColor: palette.themePrimary },
    "& > :nth-child(2)": { marginTop: "8px" },
    "& > :nth-child(2) .fui-Field__label": { marginBottom: "14px" },
    "& > :nth-child(2) div:has(> .fui-Input)": {
      minHeight: "30px", height: "30px", paddingTop: 0, paddingBottom: 0,
      backgroundColor: palette.white, borderRadius: "2px",
      borderTopColor: "#323130", borderRightColor: "#323130", borderBottomColor: "#323130", borderLeftColor: "#323130",
      ":focus-within": {
        borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
        borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
      },
    },
    // The hint text starts 11 px inside the frame.
    "& > :nth-child(2) .fui-Input": {
      backgroundColor: "transparent", minHeight: "28px", height: "28px", paddingLeft: 0,
      "& input": { paddingLeft: "7px" },
    },
    "& > :nth-child(3)": { marginTop: "30px" },
    "& > :nth-child(3) .fui-Field__label": { marginBottom: "5px" },
    "& .fui-Textarea.fui-Textarea": { borderRadius: "4px", height: "74px", minHeight: "74px" },
    "& .fui-Textarea textarea.fui-Textarea__textarea": { height: "100%", minHeight: 0, maxHeight: "none" },
    "& .fui-Field ~ .fui-Text": { color: "#323130" },
  },
  /**
   * The member drawer's footer as the canvas draws it (screenshot, 27 Oct 2026): no rule above,
   * regular-weight 14 px captions, a 90 x 30 Cancel, and a disabled Save in dark grey text with a
   * near-black check rather than Fluent's pale disabled grey.
   */
  panelSkin: {
    // Header: a 17 px bold title and a larger, half-white ✕ (canvas screenshot, 27 Oct 2026).
    "&.canvas-panel .canvas-panel-header h2": { fontSize: "17px", fontWeight: tokens.fontWeightBold },
    "&.canvas-panel .canvas-panel-header button": { color: "rgba(255, 255, 255, 0.6)" },
    "&.canvas-panel .canvas-panel-header button svg": { fontSize: "22px" },
    // Title and ✕ ride 4 px above the bar's middle on the canvas.
    "&.canvas-panel .canvas-panel-header > *": { transform: "translateY(-4px)" },
    "&.canvas-panel .canvas-panel-footer": { borderTopWidth: 0, columnGap: "10px" },
    "&.canvas-panel .canvas-panel-footer button": {
      width: "90px", minWidth: "90px", height: "30px", fontSize: "14px", fontWeight: tokens.fontWeightRegular,
    },
    "&.canvas-panel .canvas-panel-footer button:disabled": { color: "#605e5c", backgroundColor: "transparent" },
    "&.canvas-panel .canvas-panel-footer button:disabled .fui-Button__icon": { color: "#323130" },
  },
  commentCell: { position: "relative" },
  commentCounter: {
    position: "absolute", top: 0, right: 0, lineHeight: "20px", fontSize: "12px", color: "#323130",
    pointerEvents: "none",
  },
  /**
   * The Description list as the canvas draws it: a flat grey panel, 1 px dark frame, no shadow,
   * 30 px rows of 14 px text, no check-mark gutter.
   */
  descriptionListbox: {
    maxHeight: "602px !important", paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0, rowGap: 0,
    backgroundColor: "#f5f5f5", boxShadow: "none", borderRadius: 0,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "#605e5c", borderRightColor: "#605e5c", borderBottomColor: "#605e5c", borderLeftColor: "#605e5c",
    "& .fui-Option": {
      boxSizing: "border-box", height: "30px", minHeight: "30px", flexShrink: 0, columnGap: 0,
      paddingTop: 0, paddingBottom: 0, paddingLeft: "12px", fontSize: "14px", lineHeight: "20px",
      color: palette.black, borderRadius: 0,
    },
    "& .fui-Option__checkIcon": { display: "none" },
    "& .fui-Option::after": { display: "none" },
    // Nothing is highlighted when the list opens; only the hovered row, or the keyboard's row.
    "& .fui-Option:hover, & .fui-Option[data-activedescendant-focusvisible]": {
      backgroundColor: palette.themePrimary, color: palette.white,
    },
  },
  error: { color: palette.akzent5, fontSize: tokens.fontSizeBase200 },
});

const toPicker = (p: TeamPerson | null) => (p ? [{ id: p.rowId, displayName: p.displayName, mail: p.mail ?? "" }] : []);

export default function TeamScreen() {
  const s = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const { projectId } = useSession();

  const projectQ = useTeamProject(projectId);
  const membersQ = useProjectMembers(projectId);
  const descriptionsQ = useMemberDescriptions();
  const writes = useTeamWrites(projectId);

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Saving a member (add or edit) shows no green success bar (PO, 27 Oct 2026); deletes keep theirs.
  const [lastWasSave, setLastWasSave] = useState(false);

  const people = useMemberSearch(memberSearch);
  const project = projectQ.data;
  const members = membersQ.data;
  const loading = projectQ.isLoading || membersQ.isLoading;
  const busy = writes.progress !== null;

  // New Project mode (no project yet): the canvas still lists the blank Project Manager row.
  const rows = teamTableRows(
    projectId ? managerRows(project) : [{ position: "Project Manager", member: null, order: 1 }],
    members,
  );
  const lock = loading ? [] : pageLock(project);
  const gates = commandState(project, selected, TEAM_PERMISSIONS);
  const selectedMember = members.find((m) => m.id === selected) ?? null;

  const commands: Command[] = [
    { key: "newMember", label: TEAM_COMMAND_LABELS.addMember, icon: "Add", enabled: !loading && !busy && gates.add },
    { key: "editMember", label: TEAM_COMMAND_LABELS.edit, icon: "Edit", enabled: !loading && !busy && gates.edit },
    { key: "deleteMember", label: TEAM_COMMAND_LABELS.delete, icon: "Delete", enabled: !loading && !busy && gates.delete },
  ];

  /** `closeKey`, Cancel, and the end of Save: reset the form, close the panel, clear the selection. */
  const closePanel = () => { setDraft(null); setMemberSearch(""); setSelected(null); };

  const onCommand = (key: string) => {
    writes.clear();
    setMemberSearch("");
    if (key === "newMember") { setSelected(null); setDraft(emptyMemberDraft); }
    if (key === "editMember" && selectedMember) setDraft(draftFromMember(selectedMember));
    if (key === "deleteMember" && selectedMember) setDeleteOpen(true);
  };

  const onSave = async () => {
    if (!draft) return;
    setLastWasSave(true);
    await writes.run(saveMemberJob(draft, project));
    closePanel();
  };

  const onDelete = async () => {
    if (!selectedMember) return;
    const job = deleteMemberJob(selectedMember.id);
    setLastWasSave(false);
    setDeleteOpen(false);
    await writes.run(job);
    setSelected(null);
  };

  if (projectQ.error || membersQ.error) {
    return (
      <div className={s.page} data-testid="Project General Team Screen">
        <EmptyState title={TEAM_SCREEN_TEXT.loadFailedTitle} description={TEAM_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  const errors = draft ? memberPanelErrors(draft) : {};
  // The canvas list is alphabetical.
  const descriptionOptions = [...descriptionsQ.data].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={s.page} data-testid="Project General Team Screen">
      {lock.length > 0 ? (
        <div className={s.lock} data-testid="con_Milestones_Page_LockMessage_4">
          <LockClosedRegular className={s.lockIcon} aria-hidden="true" />
          <div className={s.lockList}>
            <Text weight="semibold" data-testid={PAGE_LOCK_TITLE_TESTID}>{PAGE_LOCK_TITLE}</Text>
            {lock.map((entry) => <Text key={entry.reason} data-testid={entry.testId}>{entry.label}</Text>)}
          </div>
        </div>
      ) : null}

      {/* The canvas command bar sits in the screen BODY (`…_DisplayProject_Body_…CommandBar`), not the header. */}
      <div className={s.commandBar}>
        <CommandBar commands={commands} onCommand={onCommand} ariaLabel={COMMAND_BAR_LABEL} />
      </div>

      <WriteFeedback progress={writes.progress} error={writes.error} success={lastWasSave ? null : writes.success} testIdPrefix="team" />

      <div className={s.tableWrap}>
        <Table
          className={s.table}
          size="small"
          aria-label={TEAM_COLUMN_HEADERS.displayName}
          data-testid="con_Team_DisplayProject_Body_Content_Memebers"
        >
          <TableHeader>
            <TableRow className={s.headerRow}>
              <TableHeaderCell className={s.selectCell} />
              <TableHeaderCell className={s.col}>{TEAM_COLUMN_HEADERS.description}</TableHeaderCell>
              <TableHeaderCell className={s.col}>{TEAM_COLUMN_HEADERS.displayName}</TableHeaderCell>
              <TableHeaderCell className={s.col}>{TEAM_COLUMN_HEADERS.comment}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const checked = r.memberId !== null && r.memberId === selected;
              const toggle = r.memberId ? () => setSelected((cur) => toggleSelection(cur, r.memberId!)) : undefined;
              return (
                <TableRow key={r.key} aria-selected={checked} className={mergeClasses(s.bodyRow, r.selectable && s.memberRow)} onClick={toggle}>
                  <TableCell className={s.selectCell}>
                    {r.selectable && r.memberId ? (
                      <Button
                        appearance="transparent"
                        role="radio"
                        aria-checked={checked}
                        aria-label="img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection_1"
                        data-testid={`img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection_1-${r.memberId}`}
                        className={s.radio}
                        icon={checked ? <RecordRegular /> : <CircleRegular />}
                        onClick={(e) => { e.stopPropagation(); toggle?.(); }}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className={s.col} title={r.description}>{r.description}</TableCell>
                  <TableCell className={s.col} title={r.mail}>{r.displayName}</TableCell>
                  <TableCell className={s.col} title={r.comment}>{r.comment}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ────────────────────────────────────────────────────────── member panel */}
      <FormPanel
        open={draft !== null}
        title={TEAM_PANEL_LABELS.title}
        width="narrow"
        panelClassName={s.panelSkin}
        onDismiss={closePanel}
        closeTestId="psf_Team_RightPanel_Member_Form_CommandBar"
        closeLabel="psf_Team_RightPanel_Member_Form_CommandBar"
        footer={
          <PanelButtons
            onSave={() => void onSave()}
            onCancel={closePanel}
            saveTestId="pcf_btn_Team_RightPanel_Member_Form_Buttons_Save"
            cancelTestId="pcf_btn_Team_RightPanel_Member_Form_Buttons_Cancel"
            saveLabel="pcf_btn_Team_RightPanel_Member_Form_Buttons_Save"
            cancelLabel="pcf_btn_Team_RightPanel_Member_Form_Buttons_Cancel"
            saveTooltip={TEAM_PANEL_LABELS.saveTooltip}
            disabled={busy || !draft || !canSaveMember(draft)}
            subtleWhenDisabled
          />
        }
      >
        {draft ? (
          <div className={s.panelFields}>
            <div>
              <Field className={skin.field} label={TEAM_PANEL_LABELS.description} required>
                <Dropdown
                  appearance={FIELD_APPEARANCE}
                  className={controlClass(busy ? "disabled" : "edit")}
                  listbox={{ className: s.descriptionListbox }}
                  aria-label="drp_Team_RightPanel_Member_Form_Position_TableBackedChoices"
                  data-testid="drp_Team_RightPanel_Member_Form_Position_TableBackedChoices"
                  disabled={busy}
                  value={descriptionOptions.find((d) => d.id === draft.descriptionId)?.name ?? ""}
                  selectedOptions={draft.descriptionId ? [draft.descriptionId] : []}
                  onOptionSelect={(_, d) => setDraft({ ...draft, descriptionId: d.optionValue ?? null })}
                >
                  {descriptionOptions.map((d) => <Option key={d.id} value={d.id}>{d.name}</Option>)}
                </Dropdown>
              </Field>
              {errors.description ? (
                <Text className={s.error} data-testid="lbl_Team_RightPanel_Member_Form_Position_ErrMessage">{errors.description}</Text>
              ) : null}
            </div>
            <div>
              <PeoplePicker
                label={TEAM_PANEL_LABELS.name}
                placeholder={TEAM_PANEL_LABELS.nameHint}
                tooltip={TEAM_PANEL_LABELS.nameTooltip}
                ariaLabel="pcf_Team_RightPanel_Member_Form_Principal"
                testId="pcf_Team_RightPanel_Member_Form_Principal"
                required
                value={toPicker(draft.person)}
                onChange={(next) => setDraft({
                  ...draft,
                  person: next[0] ? { rowId: next[0].id, displayName: next[0].displayName, mail: next[0].mail || null } : null,
                })}
                onPick={(p) => [p]}
                maxPeople={1}
                term={memberSearch}
                onTermChange={setMemberSearch}
                suggestions={toPickerList(people.data)}
                disabled={busy}
              />
              {errors.person ? (
                <Text className={s.error} data-testid="lbl_Team_RightPanel_Member_Form_Principal_ErrorMessage">{errors.person}</Text>
              ) : null}
            </div>
            {/*
              The canvas counter reads "n/256" (`commentCounterCanvasParity`) while the box stops at
              100, the Dataverse column's length — shown as the canvas shows it, capped as it caps.
            */}
            <div className={s.commentCell}>
            <TextAreaField
              counter="none"
              label={TEAM_PANEL_LABELS.comment}
              ariaLabel="txt_Team_RightPanel_Member_Form_Comments_Comments"
              value={draft.comment}
              disabled={busy}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(v) => setDraft({ ...draft, comment: v })}
              testId="txt_Team_RightPanel_Member_Form_Comments_Comments"
            />
            <Text className={s.commentCounter} data-testid="lbl_Team_RightPanel_Member_Form_Comments_Details">
              {commentCounterCanvasParity(draft.comment)}
            </Text>
            </div>
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={deleteOpen}
        title={DELETE_DIALOG_TITLE}
        description={deleteDialogDescription(selectedMember?.displayName ?? "")}
        confirmText={DELETE_DIALOG_BUTTONS.confirm}
        cancelText={DELETE_DIALOG_BUTTONS.cancel}
        // Canvas `cmp_PopUp_Confirmation` look: flat card on a dark scrim, regular-weight
        // captions, no footer rule, a 120 px Yes.
        canvasFooter
        footerDivider={false}
        darkScrim
        confirmWidth={120}
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

const toPickerList = (people: TeamPerson[]) => people.flatMap(toPicker);
