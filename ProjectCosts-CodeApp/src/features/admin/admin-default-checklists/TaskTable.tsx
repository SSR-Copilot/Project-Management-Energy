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
 * Edit, Calendar, CalendarReply (`MDL2_PATH`) and the two Orders glyphs (the shared `ActivateOrdersIcon` /
 * `DeactivateOrdersIcon`) are the MDL2 outlines themselves (21 Nov 2026); Delete is still a Fluent v9 lookalike.
 */
import { memo } from "react";
import {
  Button, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import { ActivateOrdersIcon, DeactivateOrdersIcon, DisabledReason, EditIcon, RowActions } from "@/components";
import type { ChecklistTask } from "@/data/adminDefaultChecklists";
import { palette } from "@/theme/tokens";
import { useRowActionStyles } from "@/theme/buttonStyles";
import { HOLDING_CUT, truncateHolding, yesNo } from "./rules";
import { probeRender } from "@/platform/renderProbe";

/**
 * The canvas row icons that Fluent v9 only approximates, as the MDL2 glyph's own outline on its 2048-unit em, from
 * `@fluentui/react-icons-mdl2` 1.3.83 (the SVG build of the MDL2 font the PowerCAT `Icon` draws through
 * `data-icon-name`): `ico_Edit_…` `IconName: "Edit"` (L504) and `ico_EnablelCompletionDate_…`
 * `IconName: If('Is Completion Date', "CalendarReply", "Calendar")` (L570). Until 21 Nov 2026 these were
 * `EditRegular` (a rounder pencil) and `CalendarReplyRegular` / `CalendarRegular` (another arrow and grid).
 * The render tests read the glyph's `data-icon-name`.
 */
// The Edit pencil (U+E70F) is the shared `EditIcon` (`@/components`), which CAPEX Accounts' rows draw too.
const MDL2_PATH = {
  // Calendar — U+E787, the core fabric-icons set.
  calendar: "M768 768h128v128H768V768zm384 768h128v128h-128v-128zm384-768h128v128h-128V768zm-384 0h128v128h-128V768zm-384 256h128v128H768v-128zm-384 0h128v128H384v-128zm1152 0h128v128h-128v-128zm-384 0h128v128h-128v-128zm-384 256h128v128H768v-128zm-384 0h128v128H384v-128zm1152 0h128v128h-128v-128zm-384 0h128v128h-128v-128zm-384 256h128v128H768v-128zm-384 0h128v128H384v-128zM2048 128v1792H0V128h384V0h128v128h1024V0h128v128h384zM128 256v256h1792V256h-256v128h-128V256H512v128H384V256H128zm1792 1536V640H128v1152h1792z",
  // CalendarReply — U+E8F5, fabric-icons-1.
  calendarReply: "M896 896H768V768h128v128zm384 0h-128V768h128v128zm-384 256H768v-128h128v128zm-384 0H384v-128h128v128zm640-128h128v128h-128v-128zm512-128h-128V768h128v128zm-128 128h128v128h-128v-128zm-384 256h128v128h-128v-128zm-256 128H768v-128h128v128zm-384 0H384v-128h128v128zm256 128h128v128H768v-128zm-384 0h128v128H384v-128zM2048 128v1380q-28-26-60-44t-68-32V640H128v1152h1120l128 128H0V128h384V0h128v128h1024V0h128v128h384zm-128 384V256h-256v128h-128V256H512v128H384V256H128v256h1792zm-421 1024q50 0 110-2t122 0 118 14 101 40 71 78 27 126q0 53-20 99t-55 81-82 55-99 21v-128q27 0 50-10t40-27 28-41 10-50q0-27-10-50t-27-40-41-28-50-10h-293l162 163-90 90-317-317 317-317 90 90-162 163z",
} as const;

/**
 * The glyph IS the em (`viewBox` 0 0 2048), so the icon slot's font-size draws the glyph at that size, exactly as the
 * MDL2 font does; `currentColor` takes the button's `IconColor` rules as a Fluent icon would.
 */
const Mdl2Icon = ({ name, path }: { name: string; path: string }) => (
  <svg width="1em" height="1em" viewBox="0 0 2048 2048" fill="currentColor" aria-hidden="true" focusable="false" data-icon-name={name}>
    <path d={path} />
  </svg>
);

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  /**
   * `gal_TasksInClusterDefaultChecklist_AdminScreen.Width: =1210` and `con_Header_…` is 1210 wide: the table is exactly that wide, not the width of
   * its container (a 100 % table stretched the fixed columns about 1.3 times, found by the Canvas parity run, 29 Oct 2026). The canvas labels sit at
   * `PaddingLeft` 0 in their column, with the first one 20 px in (`X: gblAppSizes.Position.X`), so the cells carry no padding except the first.
   * Text is the modern-Text colour #242424 measured in the Canvas (the shell's default is black).
   */
  table: {
    width: "1210px", minWidth: "1210px", tableLayout: "fixed",
    // Fluent's cells set their own colour, so it is set on the cells and their text, not on the table. Only the
    // cell's own Text (a direct child): a descendant rule also painted the buttons' icon spans #242424.
    "& td, & th": { paddingLeft: "0", color: "#242424" },
    "& td > span, & th > span": { color: "#242424" },
    "& td:first-child, & th:first-child": { paddingLeft: "20px" },
  },
  /**
   * `con_Header_TasksInCluster*` — Grayscale40 (#FAFAFA), radius 2, Semibold labels, and no line under it: the
   * canvas band is a plain container (user's canvas screenshot, 23 Nov 2026), so Fluent's header border is off.
   */
  head: { backgroundColor: palette.Grayscale40, "& tr": { borderBottomStyle: "none" } },
  /** Header labels are `Text@0.0.51` Semibold with no `Size`: the modern Text default, 14 px. */
  headCell: { fontWeight: tokens.fontWeightSemibold, fontSize: "14px", lineHeight: "20px", height: "32px" },
  colDescription: { width: "320px" },
  colHolding: { width: "350px" },
  colFlag: { width: "180px" },
  /**
   * `ico_ActivateDeactivate_…` is 90 wide at the Active column's X; `ico_Edit_…` sits right after it
   * (X = Active.X + 90, Width 34) and `ico_Delete_…` right after that (+ 34, Width 34): the icons belong to
   * the Active column, not a column of their own.
   */
  activeCell: { display: "flex", alignItems: "center" },
  /**
   * `ico_ActivateDeactivate_…` (L557-581) sets no `TextAlignment`, and the canvas draws "Active" and "Inactive" with
   * their icons at the same X (user screenshot, 23 Nov 2026), i.e. left-aligned like Completion Date, the icon
   * about 16 px in from the column's X. Centring in the 90 px moved the shorter "Active" row to the right.
   */
  activeButton: { width: "90px", justifyContent: "flex-start", paddingLeft: "16px" },
  /**
   * `ico_Edit_…` / `ico_Delete_…`: `Width: =34`, `Height: =34` (L498-499, L532-533) around the 16 px icon, and
   * `IconColor: If(Self.DisplayMode = DisplayMode.Edit, akzent3, "#bbb")` (L503, L537): #bbb while locked.
   */
  rowIcons: {
    "& button": { width: "34px", height: "34px", minWidth: "0", paddingLeft: "0", paddingRight: "0" },
    "& .fui-Button__icon": { fontSize: "16px", width: "16px", height: "16px" },
    "& button[aria-disabled='true'] .fui-Button__icon": { color: "#bbb" },
  },
  /**
   * `TemplateSize: =34`, `TemplatePadding: =0`, and NO line between rows: the gallery template
   * (`con_Details_TasksInCluster…`) has `BorderStyle.None`, and the canvas screenshot (23 Nov 2026) shows no line
   * under any row or under the header band. Fluent's default row border (`colorNeutralStroke2`) is turned off. The two
   * lines the user sees round an unfolded cluster are the accordion's (`SettingsAccordion border="headerAndEnd"`).
   */
  row: { height: "34px", borderBottomStyle: "none" },
  /**
   * Row values: `Size: =gblAppSizes.Font.Large` (12) on a modern `Text@0.0.51`, whose `Size` is used as px
   * (as the other modern-Text ports do), so 12 px, smaller than the 14 px header. A classic label's 12 would be 16 px.
   */
  value: { fontSize: "12px", lineHeight: "16px", overflowWrap: "anywhere" },
  /** Completion Date / Active buttons: `FontColor: If(<Yes / Active>, akzent3, themePrimary)` (L567, L593). */
  flagButton: {
    minWidth: "0", paddingLeft: "4px", paddingRight: "4px", fontWeight: tokens.fontWeightRegular,
    // No `IconSize` / `FontSize` on the PowerCAT Icon: Fluent v8's 16 px button icon, 8 px before a 14 px regular label.
    fontSize: "14px",
    "& .fui-Button__icon": { fontSize: "16px", width: "16px", height: "16px", marginRight: "8px" },
  },
  /**
   * A row locked by a Project Gate (`DisplayMode.Disabled`, L553, L579): `IconColor … "#bbb"` (L567, L593) and the
   * PowerCAT Icon's disabled label, Fluent v8's `neutralTertiary` #a19f9d.
   */
  locked: { color: "#a19f9d", "& .fui-Button__icon": { color: "#bbb" } },
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

/**
 * FE-AD-03 (D162): memoised. The screen passes a stable `lockTip` (rebuilt only when the locks change) and stable handlers, so a
 * confirmation, the drawer or the overlay renders no table (UT-ADCHK-FE-002).
 */
export const TaskTable = memo(function TaskTable({
  clusterId, caption, tasks, lockTip, busy, readOnly = false, pendingTaskId = null,
  onToggleCompletion, onChangeStatus, onEdit, onDelete,
}: TaskTableProps) {
  probeRender(`TaskTable:${clusterId}`);
  const styles = useStyles();
  const feedback = useRowActionStyles();

  // An empty cluster shows the column header band and no rows, as the canvas does
  // (`con_Header_TasksInClusterDefaultChecklist_AdminScreen` has no Visible condition, L377; the gallery
  // just has no items). The port's "No tasks in this cluster yet." text was removed (the user, 23 Nov 2026).
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
                      className={mergeClasses(styles.flagButton, !disabled && feedback.interactive, lockReason ? styles.locked : task.isCompletionDate ? styles.positive : styles.neutral)}
                      icon={task.isCompletionDate ? <Mdl2Icon name="CalendarReply" path={MDL2_PATH.calendarReply} /> : <Mdl2Icon name="Calendar" path={MDL2_PATH.calendar} />}
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
                      className={mergeClasses(styles.flagButton, styles.activeButton, !disabled && feedback.interactive, lockReason ? styles.locked : task.isActive ? styles.positive : styles.neutral)}
                      icon={task.isActive ? <DeactivateOrdersIcon fit="em" /> : <ActivateOrdersIcon fit="em" />}
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
                      className={styles.rowIcons}
                      tone="accent"
                      actions={[
                        {
                          key: "edit", icon: <EditIcon />, label: "Edit", describedBy: nameId,
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
});
