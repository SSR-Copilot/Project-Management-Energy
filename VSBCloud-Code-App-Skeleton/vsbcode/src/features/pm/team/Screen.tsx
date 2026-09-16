/**
 * Project General Team Screen — layout and composition.
 *
 * Canvas screen: `Project General Team Screen` (PM app)
 *   66 controls · 1 394 lines of Power Fx · 16 substantive blocks · band S
 *
 * GUIDE q21: one flat table sharing the "Description" / "Display Name" / "Comment" columns
 * — the read-only manager rows synthesised from the project record, above the editable
 * `Project Members` rows, not two separate galleries. A three-command bar (Add Member /
 * Edit / Delete) behind a five-condition page lock, and a right panel with a description
 * dropdown, a single-select people picker and a comment box.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The `SVGImages` radio-dot column (rule 6) — the grid's own single-select replaces the
 *    inline `data:image/svg+xml` URI, and the static data source is gone.
 *  - `cmp_PopUp_Team_Leave_Confirmation` (rule 19) — wired to a context variable nothing
 *    on this screen ever sets, so the dialog was unreachable.
 *  - `colProjectsPrincipals` / `..._PreSelected` and the `RenameColumns(FirstN(Users, 0))`
 *    shape template.
 *  - The saving-dialog-text pattern (rule 16): the canvas wrote the outcome message into
 *    the loading overlay and blanked it in the same expression, so it was never seen.
 *    Now a `LoadingOverlay` while in flight and a real message bar afterwards.
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useMemo, useState } from "react";
import {
  Input, Dropdown, Option, Field, Textarea, Text, Badge, Combobox, Avatar,
  MessageBar, MessageBarBody, MessageBarTitle, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  PersonAddRegular, EditRegular, DeleteRegular, ArrowClockwiseRegular,
  LockClosedRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, CommandBar, DataGrid, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, type Column, type Command,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { useEntraSearch } from "@/features/pm/general-data/hooks";
import { space, media } from "@/theme/tokens";
import {
  pageLock, isPageLocked, commandState, managerRows, toggleSelection,
  canSaveMember, memberPanelErrors, normaliseComment, draftFromMember,
  emptyMemberDraft, COMMENT_MAX_LENGTH, PAGE_LOCK_TITLE, DELETE_DIALOG_TITLE,
  deleteDialogDescription, teamTableRows, TEAM_COLUMN_HEADERS, TEAM_COMMAND_LABELS,
  type MemberDraft, type TeamTableRow,
} from "./rules";
import {
  useTeamProject, useProjectMembers, useMemberDescriptions, useSaveMember,
  useDeleteMember, useTeamPermissions,
} from "./hooks";

const useStyles = makeStyles({
  memberGrid: { minHeight: "280px" },
  panel: { display: "flex", flexDirection: "column", gap: space.m },
  counter: {
    fontSize: "11px", color: tokens.colorNeutralForeground3, alignSelf: "flex-end",
    fontVariantNumeric: "tabular-nums",
  },
  lockList: {
    display: "flex", flexDirection: "column", gap: "2px",
    fontSize: "13px", textAlign: "left",
    [media.belowMd]: { fontSize: "12px" },
  },
  person: { display: "flex", alignItems: "center", gap: space.s, minWidth: 0 },
});

export default function TeamScreen() {
  const s = useStyles();
  const { project: selected, canEdit, isLoading } = useProjectContext();
  const projectId = selected?.projectId;

  const { project, isLoading: projectLoading } = useTeamProject(projectId);
  const { members, isLoading: membersLoading, isError, refetch } = useProjectMembers(projectId);
  const { descriptions } = useMemberDescriptions();
  const perms = useTeamPermissions(canEdit);

  const saveMember = useSaveMember();
  const deleteMember = useDeleteMember(projectId);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [personSearch, setPersonSearch] = useState("");

  const people = useEntraSearch(personSearch, draft !== null);
  const managers = useMemo(() => managerRows(project), [project]);
  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;

  const lock = pageLock(project);
  const locked = isPageLocked(project);
  const gates = commandState(project, selectedMemberId, perms);

  /*
   * GUIDE q21 — the merged table: manager rows (read-only) then member rows (selectable).
   *
   * ABOVE BOTH early returns, deliberately. It used to sit below them, which made it a
   * CONDITIONAL hook: while the project was loading, and again on a locked project, this
   * component returned before calling it, so the hook order differed between renders. React
   * only detects that when a project moves between those states while mounted, and then it
   * surfaces as error #185 — a message that names neither this hook nor this file. `tsc`
   * cannot see it; `npm run lint` can, and catching this is why the lint gate exists.
   */
  const tableRows = useMemo(() => teamTableRows(managers, members), [managers, members]);

  if (isLoading || projectLoading) {
    return <LoadingOverlay mode="inline" label="Loading the project team…" />;
  }

  /* ------------------------------------------------------------- the page lock */
  if (locked) {
    return (
      <>
        <PageHeader
          eyebrow="Project Management"
          title="Project team"
          description="The project manager, the deputy, and everyone else assigned to the project."
        />
        <EmptyState
          icon={<LockClosedRegular fontSize={28} />}
          title={PAGE_LOCK_TITLE}
          description={
            <span className={s.lockList}>
              {lock.map((e) => <span key={e.reason}>{e.label}</span>)}
            </span>
          }
        />
      </>
    );
  }

  /* --------------------------------------------------------------- the commands */
  const commands: Command[] = [
    {
      key: "add", label: TEAM_COMMAND_LABELS.addMember, icon: <PersonAddRegular />, primary: true,
      onClick: () => { setDraft({ ...emptyMemberDraft }); setPersonSearch(""); },
      disabled: !gates.add.enabled, disabledReason: gates.add.reason,
    },
    {
      key: "edit", label: TEAM_COMMAND_LABELS.edit, icon: <EditRegular />,
      onClick: () => {
        if (!selectedMember) return;
        setDraft(draftFromMember(selectedMember));
        setPersonSearch(selectedMember.displayName);
      },
      disabled: !gates.edit.enabled, disabledReason: gates.edit.reason,
    },
    {
      key: "delete", label: TEAM_COMMAND_LABELS.delete, icon: <DeleteRegular />, danger: true,
      onClick: () => setConfirmDelete(true),
      disabled: !gates.delete.enabled, disabledReason: gates.delete.reason,
    },
    {
      key: "refresh", label: "Refresh", icon: <ArrowClockwiseRegular />,
      onClick: () => void refetch(),
    },
  ];

  const tableColumns: Column<TeamTableRow>[] = [
    {
      key: "description", header: TEAM_COLUMN_HEADERS.description,
      width: "minmax(160px, 1.6fr)", sortable: true,
      value: (r) => r.description,
      render: (r) => r.description || <Text italic>—</Text>,
    },
    {
      key: "name", header: TEAM_COLUMN_HEADERS.displayName,
      width: "minmax(180px, 2fr)", sortable: true,
      value: (r) => r.displayName,
      render: (r) => (
        <span className={s.person}>
          <Avatar size={20} name={r.displayName} />
          <span>{r.displayName}</span>
        </span>
      ),
    },
    {
      key: "comment", header: TEAM_COLUMN_HEADERS.comment,
      width: "minmax(200px, 2.4fr)", hideBelow: "md",
      value: (r) => r.comment,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Project Management"
        title="Project team"
        description="The manager rows come from the project record itself and are maintained on General Data. Everyone else is a Project Members row and can be edited here."
        actions={<Badge appearance="tint">{project?.projectNumber}</Badge>}
      />

      <CommandBar commands={commands} />

      {saveMember.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The team member could not be saved</MessageBarTitle>
            {saveMember.error instanceof Error ? saveMember.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {deleteMember.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The team member could not be deleted</MessageBarTitle>
            {deleteMember.error instanceof Error ? deleteMember.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {saveMember.isSuccess && !draft && (
        <MessageBar intent="success">
          <MessageBarBody>
            Project member {saveMember.data.created ? "added" : "updated"} successfully.
          </MessageBarBody>
        </MessageBar>
      )}

      {/* GUIDE q21 — one flat table filling the page: manager rows (read-only), then the
          editable Project Members rows. No section headers, no separate manager grid. */}
      <div className={s.memberGrid}>
        <DataGrid
          rows={tableRows}
          columns={tableColumns}
          rowKey={(r) => r.key}
          loading={membersLoading}
          // A manager row (`selectable: false`) reports no selectionMode support for
          // per-row disabling of the radio column (DataGrid gap — see the report).
          selectionMode="single"
          selectedKey={selectedMemberId}
          onSelectionChange={(_k, r) => {
            if (!r || !r.selectable || !r.memberId) return;
            setSelectedMemberId((cur) => toggleSelection(cur, r.memberId!));
          }}
          // Rule 5 — clicking the selected row clears the selection; manager rows are inert.
          onRowClick={(r) => {
            if (!r.selectable || !r.memberId) return;
            setSelectedMemberId((k) => toggleSelection(k, r.memberId!));
          }}
          emptyMessage={isError
            ? "The team could not be loaded. Try Refresh."
            : "No team members yet. Use Add Member to assign someone."}
          caption="Select a row to edit or delete it."
          footer={
            <>
              <span>{members.length} member{members.length === 1 ? "" : "s"}</span>
              {selectedMember && <Text size={200}>Selected: {selectedMember.displayName}</Text>}
            </>
          }
        />
      </div>

      {/* ────────────────────────────────────────────────────── the member panel */}
      <FormPanel
        open={draft !== null}
        title={draft?.memberId ? "Edit team member" : "Add team member"}
        onClose={() => setDraft(null)}
        onSave={() => {
          if (!draft || !project) return;
          saveMember.mutate({ draft, project }, { onSuccess: () => setDraft(null) });
        }}
        saveDisabled={!draft || !canSaveMember(draft)}
        busy={saveMember.isPending}
        errors={draft ? memberPanelErrors(draft) : []}
      >
        {draft && (
          <div className={s.panel}>
            <Field label="Description" required>
              <Dropdown
                selectedOptions={draft.descriptionId ? [draft.descriptionId] : []}
                value={descriptions.find(
                  (d) => d.vsb_projectmemberdescriptionid === draft.descriptionId,
                )?.vsb_description ?? ""}
                onOptionSelect={(_, d) =>
                  setDraft({ ...draft, descriptionId: d.optionValue ?? null })}
              >
                {descriptions.map((d) => (
                  <Option
                    key={d.vsb_projectmemberdescriptionid}
                    value={d.vsb_projectmemberdescriptionid}
                  >
                    {d.vsb_description}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            {/* Rule 12 — enabled accounts only, four searchable columns, MaxPeople 1. */}
            <Field label="Member" required hint="Searched over enabled Microsoft Entra accounts">
              <Combobox
                freeform
                value={personSearch}
                placeholder="Type at least 2 characters"
                onInput={(e) => setPersonSearch((e.target as HTMLInputElement).value)}
                onOptionSelect={(_, d) => {
                  const p = (people.data ?? []).find((x) => x.rowId === d.optionValue);
                  // Rule 19 — one selection only; picking again replaces the previous one.
                  if (p) {
                    setDraft({
                      ...draft,
                      person: { rowId: p.rowId, displayName: p.displayName, mail: p.mail },
                    });
                    setPersonSearch(p.displayName);
                  }
                }}
              >
                {people.isFetching && <Option value="">Searching…</Option>}
                {(people.data ?? []).map((p) => (
                  <Option key={p.rowId} value={p.rowId} text={p.displayName}>
                    {p.displayName}{p.mail ? ` — ${p.mail}` : ""}
                  </Option>
                ))}
              </Combobox>
            </Field>

            {draft.person && (
              <Field label="Record name" hint="Derived, never entered">
                <Input readOnly value={`MBR-${draft.person.mail ?? ""}`} />
              </Field>
            )}

            <Field label="Comment">
              <Textarea
                resize="vertical"
                maxLength={COMMENT_MAX_LENGTH}
                value={draft.comment}
                onChange={(_, d) => setDraft({ ...draft, comment: d.value })}
              />
            </Field>
            {/* The canvas counter renders /256 against a MaxLength of 100. Fixed. */}
            <span className={s.counter}>
              {normaliseComment(draft.comment).length}/{COMMENT_MAX_LENGTH}
            </span>
          </div>
        )}
      </FormPanel>

      {/* Rule 17 — deletion behind the confirmation dialog. */}
      <ConfirmDialog
        open={confirmDelete}
        intent="danger"
        title={DELETE_DIALOG_TITLE}
        confirmLabel={deleteMember.isPending ? "Deleting…" : "Delete member"}
        busy={deleteMember.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!selectedMemberId) return;
          deleteMember.mutate(selectedMemberId, {
            onSuccess: () => {
              setSelectedMemberId(null);
              setConfirmDelete(false);
            },
          });
        }}
      >
        <Text>{deleteDialogDescription(selectedMember?.displayName ?? "")}</Text>
      </ConfirmDialog>

      {(saveMember.isPending || deleteMember.isPending) && (
        <LoadingOverlay
          label={saveMember.isPending
            ? "Project member information is being saved, please wait…"
            : "The project member is being removed, please wait…"}
        />
      )}
    </>
  );
}
