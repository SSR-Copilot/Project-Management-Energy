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
  managerRows, memberPanelErrors, pageLock, saveMemberJob, teamTableRows, toggleSelection,
  type MemberDraft, type TeamPerson,
} from "./rules";
import {
  TEAM_PERMISSIONS, useMemberDescriptions, useMemberSearch, useProjectMembers, useTeamProject, useTeamWrites,
} from "./hooks";

// Layout transcribed from `con_Team_DisplayProject_BodyRightContent` (UI layout pass, 20 Oct 2026).
// The shell's content area scrolls, so the page grows with its content and never clips itself.
const useStyles = makeStyles({
  /** The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Over the members table's left edge (`tableWrap`'s 20 px inset). */
  commandBar: { paddingLeft: "20px" },
  // The right content: a white vertical autolayout, no padding and no gap.
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  // `con_Milestones_Page_LockMessage_4`: Fill RGBA(89,89,89,1), horizontal, gap 10, PaddingLeft 20,
  // items centred; the white 20 px lock icon; `con_Milestones_pagelock_section_4` pads 8.
  lock: {
    display: "flex", alignItems: "center", gap: "10px", paddingLeft: "20px", flex: "none",
    backgroundColor: "rgb(89, 89, 89)", color: palette.white,
  },
  lockIcon: { fontSize: "20px", color: palette.white, flexShrink: 0 },
  lockList: {
    display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px",
    "& .fui-Text": { color: palette.white, fontWeight: tokens.fontWeightRegular },
  },
  // `con_Team_DisplayProject_Body_Content`: PaddingLeft 20, PaddingRight 10, `Parent.Width - 8`; the
  // members container adds PaddingTop 20.
  tableWrap: {
    overflowX: "auto", paddingLeft: "20px", paddingRight: "10px", paddingTop: "20px",
    width: "calc(100% - 8px)", boxSizing: "border-box",
  },
  // The header labels sit at X = 40 and are 250 wide each, so the grid is 40 + 3 x 250 = 790.
  table: { width: "790px", tableLayout: "fixed" },
  // `con_…_Memebers_Header`: Fill `gblAppColors.Gallery.Header` (Grayscale40), 32 high; captions
  // Semibold `gblAppSizes.Font.ExtraExtraSmall` (8 pt).
  headerRow: {
    backgroundColor: palette.Grayscale40, height: "32px",
    "& th": { height: "32px", paddingTop: 0, paddingBottom: 0, fontSize: "10.67px", fontWeight: tokens.fontWeightSemibold },
  },
  // Each row: TemplateSize 34, labels ExtraExtraSmall (8 pt).
  bodyRow: { height: "34px", "& td": { fontSize: "10.67px", paddingTop: 0, paddingBottom: 0 } },
  col: { width: "250px", overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // The radio image: 16 px at X = 10 in the 40 px lead.
  selectCell: { width: "40px", paddingLeft: "2px", paddingRight: 0 },
  memberRow: { cursor: "pointer" },
  radio: { color: palette.themePrimary, minWidth: "28px", "& svg": { fontSize: "16px" } },
  panelFields: { display: "flex", flexDirection: "column", gap: space.m },
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

  const people = useMemberSearch(memberSearch);
  const project = projectQ.data;
  const members = membersQ.data;
  const loading = projectQ.isLoading || membersQ.isLoading;
  const busy = writes.progress !== null;

  const rows = teamTableRows(managerRows(project), members);
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
    await writes.run(saveMemberJob(draft, project));
    closePanel();
  };

  const onDelete = async () => {
    if (!selectedMember) return;
    const job = deleteMemberJob(selectedMember.id);
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
  const descriptionOptions = descriptionsQ.data;

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

      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="team" />

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
            <TextAreaField
              label={TEAM_PANEL_LABELS.comment}
              ariaLabel="txt_Team_RightPanel_Member_Form_Comments_Comments"
              value={draft.comment}
              disabled={busy}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(v) => setDraft({ ...draft, comment: v })}
              testId="txt_Team_RightPanel_Member_Form_Comments_Comments"
            />
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={deleteOpen}
        title={DELETE_DIALOG_TITLE}
        description={deleteDialogDescription(selectedMember?.displayName ?? "")}
        confirmText={DELETE_DIALOG_BUTTONS.confirm}
        cancelText={DELETE_DIALOG_BUTTONS.cancel}
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

const toPickerList = (people: TeamPerson[]) => people.flatMap(toPicker);
