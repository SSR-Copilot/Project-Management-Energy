/**
 * The task grid of one cluster, with the row actions. Canvas:
 * `con_Header_TasksInClusterDefaultChecklist_AdminScreen` (the column captions, verbatim) and
 * `gal_TasksInClusterDefaultChecklist_AdminScreen` (L446-677), one
 * `con_Details_TasksInClusterDefaultChecklist_AdminScreen` per task. Fixed canvas column widths
 * become minimum widths in a horizontally scrolling table.
 *
 * `data-testid`s are the canvas control names plus `-${task.id}` (the canvas gallery repeats one
 * name on every row). `aria-label`s are the visible captions: "Yes" / "No" and "Active" /
 * "Inactive" on the two flag buttons, "Edit" / "Delete" on the icons; the task's name is attached
 * with `aria-describedby`, never put into the label.
 *
 * Shared building blocks: Edit / Delete are the shared `RowActions` (`tone="accent"`: green only
 * while not locked, as the canvas `IconColor: If(DisplayMode = Edit, akzent3, "#bbb")`), a locked
 * flag button goes through `DisabledReason`, the empty text is `InlineEmpty`, the hidden header is
 * `VisuallyHidden`.
 *
 * Icons as the canvas: the Active button shows `DeactivateOrders` on an Active row and `ActivateOrders` on
 * an Inactive one (the action: a document with a cross / a tick), and the Completion Date button `CalendarReply`
 * / `Calendar`. (27 Oct 2026: the earlier port showed the state, a check / cross and a calendar with / without a tick.)
 */
import {
  Button, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  CalendarRegular, CalendarReplyRegular, DeleteRegular, DocumentCheckmarkRegular,
  DocumentDismissRegular, EditRegular,
} from "@fluentui/react-icons";
import { DisabledReason, InlineEmpty, RowActions } from "@/components";
import type { ChecklistTask } from "@/data/adminDefaultChecklists";
import { palette } from "@/theme/tokens";
import { useRowActionStyles } from "@/theme/buttonStyles";
import { HOLDING_CUT, truncateHolding, yesNo } from "./rules";

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  /** `gal_TasksInClusterDefaultChecklist_AdminScreen.Width: =1210`. */
  table: { minWidth: "1210px", tableLayout: "fixed" },
  /** `con_Header_TasksInCluster*` — Grayscale40 (#FAFAFA), radius 2, Semibold labels. */
  head: { backgroundColor: palette.Grayscale40 },
  /** Header labels are `Text@0.0.51` Semibold with no `Size`: the modern Text default, 14 px. */
  headCell: { fontWeight: tokens.fontWeightSemibold, fontSize: "14px", lineHeight: "20px", height: "32px" },
  colDescription: { width: "300px" },
  colHolding: { width: "350px" },
  colFlag: { width: "180px" },
  /**
   * `ico_ActivateDeactivate_…` is 90 wide at the Active column's X; `ico_Edit_…` sits right after it
   * (X = Active.X + 90, Width 34) and `ico_Delete_…` right after that (+ 34, Width 34): the icons belong to
   * the Active column, not a column of their own.
   */
  activeCell: { display: "flex", alignItems: "center" },
  activeButton: { width: "90px", justifyContent: "flex-start" },
  /**
   * `TemplateSize: =34`; the row rule is the gallery's `BorderColor: RGBA(245, 245, 245, 1)`.
   * Hard-coded: `src/theme/tokens.ts` has no #F5F5F5 token.
   */
  row: { height: "34px", borderBottomColor: "#F5F5F5" },
  /**
   * Row values: `Size: =gblAppSizes.Font.Large` (12) on a modern `Text@0.0.51`, whose `Size` is used as px
   * (as the other modern-Text ports do), so 12 px, smaller than the 14 px header. A classic label's 12 would be 16 px.
   */
  value: { fontSize: "12px", lineHeight: "16px", overflowWrap: "anywhere" },
  /** Completion Date / Active buttons: `FontColor: If(<Yes / Active>, akzent3, themePrimary)` (L567, L593). */
  flagButton: { minWidth: "0", paddingLeft: "4px", paddingRight: "4px", fontWeight: tokens.fontWeightRegular },
  positive: { color: palette.akzent3, ":hover": { color: palette.akzent3 } },
  neutral: { color: palette.themePrimary, ":hover": { color: palette.themePrimary } },
  /** A cut holding text is focusable so its full-text tooltip is keyboard-reachable. */
  focusableText: {
    cursor: "default",
    ":focus-visible": { outlineWidth: "2px", outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
  },
});

export interface TaskTableProps {
  clusterId: string;
  /** The cluster caption; gives each cluster's table its own accessible name. */
  caption: string;
  tasks: readonly ChecklistTask[];
  /**
   * `null` for a free row. Otherwise Edit, Delete, Completion Date and Active are disabled and
   * show the returned tooltip (locked, locks still loading, or locks unknown).
   */
  lockTip: (task: ChecklistTask) => string | null;
  /** True while any write runs, so a second click cannot start a parallel write. */
  busy: boolean;
  /** The admin rule is not met: every row action is disabled (no tooltip; not a lock). */
  readOnly?: boolean;
  /** The row whose Completion Date write is pending shows a spinner in that cell. */
  pendingTaskId?: string | null;
  onToggleCompletion: (task: ChecklistTask) => void;
  onChangeStatus: (task: ChecklistTask) => void;
  onEdit: (task: ChecklistTask) => void;
  onDelete: (task: ChecklistTask) => void;
}

export function TaskTable({
  clusterId, caption, tasks, lockTip, busy, readOnly = false, pendingTaskId = null,
  onToggleCompletion, onChangeStatus, onEdit, onDelete,
}: TaskTableProps) {
  const styles = useStyles();
  const feedback = useRowActionStyles();

  if (tasks.length === 0) {
    // NEW — no canvas equivalent: the canvas gallery simply rendered no rows.
    return <InlineEmpty padding={8}>No tasks in this cluster yet.</InlineEmpty>;
  }

  return (
    <div className={styles.scroller}>
      <Table
        className={styles.table} size="small" aria-label={`${caption} tasks`}
        data-testid={`gal_TasksInClusterDefaultChecklist_AdminScreen-${clusterId}`}
      >
        <TableHeader className={styles.head}>
          {/* Column captions: `lbl_{Description,HoldingDescription,GateRelevance,CompletionDate,IsActive}_TasksInClusterDefaultChecklist_AdminScreen.Text` — verbatim. */}
          <TableRow>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colDescription)}>Description</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colHolding)}>Holding Description</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colFlag)}>Gate Relevance</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colFlag)}>Completion Date</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colFlag)}>Active</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            // `null` for a free row; otherwise the reason every action shows.
            const lockReason = lockTip(task) ?? undefined;
            const disabled = lockReason !== undefined || busy || readOnly;
            const nameId = `task-name-${clusterId}-${task.id}`;
            const completion = yesNo(task.isCompletionDate);
            const holdingCut = task.holdingDescription.length > HOLDING_CUT;
            const status = task.isActive ? "Active" : "Inactive";
            return (
              <TableRow
                key={task.id} className={styles.row}
                data-testid={`con_Details_TasksInClusterDefaultChecklist_AdminScreen-${task.id}`}
              >
                {/* `lbl_DescriptionValue_….Text: =ThisItem.Name` */}
                <TableCell><Text id={nameId} className={styles.value}>{task.name}</Text></TableCell>
                <TableCell>
                  {/* `lbl_HoldingDescriptionValue_…`; DIVERGENCE: a cut text shows the full text as a tooltip (NEW). */}
                  {holdingCut ? (
                    <Tooltip content={task.holdingDescription} relationship="description" withArrow>
                      <Text className={mergeClasses(styles.value, styles.focusableText)} tabIndex={0}>
                        {truncateHolding(task.holdingDescription)}
                      </Text>
                    </Tooltip>
                  ) : (
                    <Text className={styles.value}>{task.holdingDescription}</Text>
                  )}
                </TableCell>
                {/* `lbl_GateRelevanceValue_…` — Yes / No here (DIVERGENCE, see `yesNo`). */}
                <TableCell><Text className={styles.value}>{yesNo(task.gateRelevance)}</Text></TableCell>
                <TableCell>
                  {/* DIVERGENCE: a pending Completion Date write shows a spinner in its cell (NEW). */}
                  {pendingTaskId === task.id ? (
                    <Spinner size="tiny" label="Saving…" aria-label={`Saving Completion Date for ${task.name}`} />
                  ) : (
                  <DisabledReason reason={lockReason}>
                    {/* `ico_EnablelCompletionDate_…` — caption `If(…, "Yes", "No")`. */}
                    <Button
                      appearance="transparent"
                      className={mergeClasses(styles.flagButton, !disabled && feedback.interactive, task.isCompletionDate ? styles.positive : styles.neutral)}
                      icon={task.isCompletionDate ? <CalendarReplyRegular /> : <CalendarRegular />}
                      disabled={disabled}
                      aria-pressed={task.isCompletionDate === true}
                      aria-label={completion}
                      aria-describedby={nameId}
                      data-testid={`ico_EnablelCompletionDate_TasksInClusterDefaultChecklist_AdminScreen-${task.id}`}
                      onClick={() => onToggleCompletion(task)}
                    >
                      {completion}
                    </Button>
                  </DisabledReason>
                  )}
                </TableCell>
                <TableCell>
                  <div className={styles.activeCell}>
                  <DisabledReason reason={lockReason}>
                    {/* `ico_ActivateDeactivate_…` — caption `=ThisItem.Status` ("Active" / "Inactive"); opens the confirmation. */}
                    <Button
                      appearance="transparent"
                      className={mergeClasses(styles.flagButton, styles.activeButton, !disabled && feedback.interactive, task.isActive ? styles.positive : styles.neutral)}
                      icon={task.isActive ? <DocumentDismissRegular /> : <DocumentCheckmarkRegular />}
                      disabled={disabled}
                      aria-label={status}
                      aria-describedby={nameId}
                      data-testid={`ico_ActivateDeactivate_TasksInClusterDefaultChecklist_AdminScreen-${task.id}`}
                      onClick={() => onChangeStatus(task)}
                    >
                      {status}
                    </Button>
                  </DisabledReason>
                    {/* `ico_Edit_…` / `ico_Delete_…` (`IconName` "Edit" / "Delete"): green when enabled (L503, L537); grey while locked. */}
                    <RowActions
                      tone="accent"
                      actions={[
                        {
                          key: "edit", icon: <EditRegular />, label: "Edit", describedBy: nameId,
                          testId: `ico_Edit_TasksInClusterDefaultChecklist_AdminScreen-${task.id}`,
                          disabled, ...(lockReason ? { disabledReason: lockReason } : {}),
                          onClick: () => onEdit(task),
                        },
                        {
                          key: "delete", icon: <DeleteRegular />, label: "Delete", describedBy: nameId,
                          testId: `ico_Delete_TasksInClusterDefaultChecklist_AdminScreen-${task.id}`,
                          disabled, ...(lockReason ? { disabledReason: lockReason } : {}),
                          onClick: () => onDelete(task),
                        },
                      ]}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
