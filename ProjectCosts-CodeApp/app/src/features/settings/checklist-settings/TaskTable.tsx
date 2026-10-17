/**
 * M6 — the task grid of one cluster, with the row actions. Canvas:
 * `gal_TasksInClusterDefaultChecklist_AdminScreen` (L446-677). Fixed canvas column widths
 * become minimum widths in a horizontally scrolling table (03-responsive-layout §4).
 *
 * Reusable components (Wave B): Edit / Delete are the shared `RowActions` (`tone="accent"`:
 * green only while not locked), a locked flag button goes through `DisabledReason` (the old
 * local `LockTip`), the empty text is `InlineEmpty`, the hidden header is `VisuallyHidden`.
 */
import {
  Button, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  CalendarCheckmarkRegular, CalendarRegular, CheckmarkCircleRegular, DeleteRegular,
  DismissCircleRegular, EditRegular,
} from "@fluentui/react-icons";
import { DisabledReason, InlineEmpty, RowActions, VisuallyHidden } from "@/components";
import type { ChecklistTask } from "@/data/settings/checklist-settings";
import { palette } from "@/theme/tokens";
import { HOLDING_CUT, truncateHolding, yesNo } from "./rules";

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  table: { minWidth: "1210px", tableLayout: "fixed" },
  /** `con_Header_TasksInCluster*` — #FAFAFA, radius 2, Semibold labels. */
  head: { backgroundColor: palette.Grayscale40 },
  headCell: { fontWeight: tokens.fontWeightSemibold, height: "32px" },
  colDescription: { width: "300px" },
  colHolding: { width: "350px" },
  colFlag: { width: "180px" },
  colActions: { width: "80px" },
  row: { height: "34px", borderBottomColor: "#F5F5F5" },
  /** Row values: `gblAppSizes.Font.Large` = 12 pt. */
  value: { fontSize: "16px", lineHeight: "20px", overflowWrap: "anywhere" },
  /** Completion Date / Active buttons: green when Yes/Active, brand blue otherwise. */
  flagButton: { minWidth: "0", paddingLeft: "4px", paddingRight: "4px", fontWeight: tokens.fontWeightRegular },
  positive: { color: palette.akzent3, ":hover": { color: palette.akzent3 } },
  neutral: { color: palette.themePrimary, ":hover": { color: palette.themePrimary } },
  /** A cut holding text is focusable so its full-text tooltip is keyboard-reachable (gap B-6). */
  focusableText: {
    cursor: "default",
    ":focus-visible": { outlineWidth: "2px", outlineStyle: "solid", outlineColor: tokens.colorStrokeFocus2 },
  },
});

export interface TaskTableProps {
  clusterId: string;
  /** The cluster caption; gives each cluster's table its own accessible name (gap B-6). */
  caption: string;
  tasks: readonly ChecklistTask[];
  /**
   * `null` for a free row. Otherwise Edit, Delete, Completion Date and Active are disabled and
   * show the returned tooltip (locked, locks still loading, or locks unknown — gap B-4).
   */
  lockTip: (task: ChecklistTask) => string | null;
  /** True while any write runs, so a second click cannot start a parallel write. */
  busy: boolean;
  /** FR-9: the row whose Completion Date write is pending shows a spinner in that cell. */
  pendingTaskId?: string | null;
  onToggleCompletion: (task: ChecklistTask) => void;
  onChangeStatus: (task: ChecklistTask) => void;
  onEdit: (task: ChecklistTask) => void;
  onDelete: (task: ChecklistTask) => void;
}

export function TaskTable({
  clusterId, caption, tasks, lockTip, busy, pendingTaskId = null,
  onToggleCompletion, onChangeStatus, onEdit, onDelete,
}: TaskTableProps) {
  const styles = useStyles();

  if (tasks.length === 0) {
    return <InlineEmpty padding={8}>No tasks in this cluster yet.</InlineEmpty>;
  }

  return (
    <div className={styles.scroller}>
      <Table className={styles.table} size="small" aria-label={`${caption} tasks`}>
        <TableHeader className={styles.head}>
          <TableRow>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colDescription)}>Description</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colHolding)}>Holding Description</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colFlag)}>Gate Relevance</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colFlag)}>Completion Date</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colFlag)}>Active</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.colActions)}>
              <VisuallyHidden>Actions</VisuallyHidden>
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            // `null` for a free row; otherwise the reason every action shows (C4 / C5).
            const lockReason = lockTip(task) ?? undefined;
            const disabled = lockReason !== undefined || busy;
            const nameId = `task-name-${clusterId}-${task.id}`;
            const completion = yesNo(task.isCompletionDate);
            const holdingCut = task.holdingDescription.length > HOLDING_CUT;
            return (
              <TableRow key={task.id} className={styles.row} data-testid={`task-row-${task.id}`}>
                <TableCell><Text id={nameId} className={styles.value}>{task.name}</Text></TableCell>
                <TableCell>
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
                <TableCell><Text className={styles.value}>{yesNo(task.gateRelevance)}</Text></TableCell>
                <TableCell>
                  {pendingTaskId === task.id ? (
                    <Spinner size="tiny" label="Saving…" aria-label={`Saving Completion Date for ${task.name}`} />
                  ) : (
                  <DisabledReason reason={lockReason}>
                    <Button
                      appearance="transparent"
                      className={mergeClasses(styles.flagButton, task.isCompletionDate ? styles.positive : styles.neutral)}
                      icon={task.isCompletionDate ? <CalendarCheckmarkRegular /> : <CalendarRegular />}
                      disabled={disabled}
                      aria-pressed={task.isCompletionDate === true}
                      aria-label={`Completion Date ${completion}`}
                      aria-describedby={nameId}
                      onClick={() => onToggleCompletion(task)}
                    >
                      {completion}
                    </Button>
                  </DisabledReason>
                  )}
                </TableCell>
                <TableCell>
                  <DisabledReason reason={lockReason}>
                    <Button
                      appearance="transparent"
                      className={mergeClasses(styles.flagButton, task.isActive ? styles.positive : styles.neutral)}
                      icon={task.isActive ? <CheckmarkCircleRegular /> : <DismissCircleRegular />}
                      disabled={disabled}
                      aria-label={`Status ${task.isActive ? "Active" : "Inactive"}`}
                      aria-describedby={nameId}
                      onClick={() => onChangeStatus(task)}
                    >
                      {task.isActive ? "Active" : "Inactive"}
                    </Button>
                  </DisabledReason>
                </TableCell>
                <TableCell>
                  {/* Edit / Delete are green when enabled (L503, L537); grey while locked. */}
                  <RowActions
                    tone="accent"
                    actions={[
                      {
                        key: "edit", icon: <EditRegular />, label: "Edit", describedBy: nameId,
                        disabled, ...(lockReason ? { disabledReason: lockReason } : {}),
                        onClick: () => onEdit(task),
                      },
                      {
                        key: "delete", icon: <DeleteRegular />, label: "Delete", describedBy: nameId,
                        disabled, ...(lockReason ? { disabledReason: lockReason } : {}),
                        onClick: () => onDelete(task),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
