/**
 * The gate matrix — canvas `gal_Admin_ProjectGates_DefaultApprovals_Clusters`: the column header
 * (`con_Admin_ProjectGatest_Approvals_Gallery_Header`), gate rows
 * (`con_Admin_ProjectGates_DefaultClusterApproval_Item`), nested checklist-task rows
 * (`gal_…_ChecklistDefaultApprovals` → `cnt_…_ChecklistDefaultApproval_Item`) and the "Add Task" row
 * (`con_AddChecklistApproval`). Presentation only; every rule comes from `./rules`.
 *
 * Test ids (CONVENTIONS rule 16): each element carries its canvas control name; repeating rows
 * append the row's stable id — the gate's `Project States` id, the task approval's id. Captions
 * and aria-labels are the canvas captions (`LABELS`), never row data.
 *
 * No `aria-level` on rows of a plain table (invalid ARIA); the expanded state is exposed by
 * the collapse button's `aria-expanded` instead.
 *
 * Reusable components: the pill is the shared `StatusPill variant="toggle"`, the collapse button
 * `ExpandToggle variant="icon24"`, the row icons `RowActions` and the disabled Add Task reason a
 * `DisabledReason` tooltip. People cells and the tree connector stay local.
 *
 * `canEdit` (admin access): without it the status pills, Add Task and Delete are disabled; Edit
 * stays enabled so the approvers can still be read in the panel.
 */
import type { ReactNode } from "react";
import {
  Button, makeStyles, mergeClasses, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Tooltip, tokens,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, WarningRegular } from "@fluentui/react-icons";
import { DisabledReason, ExpandToggle, ExpandToggleSpacer, RowActions, StatusPill } from "@/components";
import { palette, space } from "@/theme/tokens";
import type { GatesDataset } from "@/data/adminGatesApprovals";
import {
  canAddTask, isGateToggleLocked, LABELS, NO_PERMISSION_MESSAGE, parsePeople, participantCell, pmCell,
  taskNotificationsCell, tasksOfGate, type GateRow, type ParticipantCell, type TaskRow,
} from "./rules";

/**
 * The column headers, `lbl_Admin_ProjectGatest_Approvals_Header_*.Text` — each label verbatim
 * (PGAS:447-672); `control` is the header label's canvas name. Widths from the canvas header
 * labels; Status/Action widened to fit.
 */
const COLUMNS = [
  { key: "description", label: "Description", width: 250, control: "lbl_Admin_ProjectGatest_Approvals_Header_Description" },
  { key: "pm", label: "Portfolio Manager", width: 200, control: "lbl_Admin_ProjectGatest_Approvals_Header_PortfolioManager" },
  { key: "contributors", label: "Contributors", width: 180, control: "lbl_Admin_ProjectGatest_Approvals_Header_Contributors" },
  { key: "approvers", label: "Approvers", width: 180, control: "lbl_Admin_ProjectGatest_Approvals_Header_Approvers" },
  { key: "notifications", label: "Notifications", width: 180, control: "lbl_Admin_ProjectGatest_Approvals_Header_Notifications" },
  { key: "status", label: "Status", width: 68, control: "lbl_Admin_ProjectGatest_Approvals_Header_Status" },
  { key: "action", label: "Action", width: 96, control: "lbl_Admin_ProjectGatest_Approvals_Header_Actions" },
] as const;

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Why "Add Task" is disabled, shown as its tooltip.
 * DIVERGENCE: NEW — the canvas button (`but_…_Row_Edit_3.DisplayMode`) is just disabled, with no reason.
 */
const addTaskDisabledReason = (tasksAvailable: boolean) => (tasksAvailable
  ? "Every check list task of this gate already has an approval."
  : "Check list tasks are not available.");

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  table: { width: `${TABLE_WIDTH}px`, tableLayout: "fixed" },
  // Canvas header labels: Size gblAppSizes.Font.ExtraExtraSmall (8 pt = 10.67 px), colour measured in the Canvas run (rgb(11, 11, 11)).
  headerCell: { fontWeight: tokens.fontWeightSemibold, fontSize: "10.6667px", color: "#0B0B0B" },
  gateRow: {
    // PGAS:1655 — Fill RGBA(0,0,0,0.1), DropShadow.Semilight.
    backgroundColor: "rgba(0,0,0,0.1)",
    ":hover": { backgroundColor: "rgba(0,0,0,0.1)" },
  },
  cell: { verticalAlign: "top", paddingTop: space.s, paddingBottom: space.s },
  descriptionCell: { display: "flex", alignItems: "center", columnGap: space.s },
  gateName: { fontWeight: tokens.fontWeightSemibold, fontSize: "12px", color: "#242424" },
  taskCell: { position: "relative", paddingLeft: "44px" },
  treeLine: {
    position: "absolute", left: "20px", top: 0, bottom: "50%", width: "18px",
    borderLeft: "1px solid #B0B0B0", borderBottom: "1px solid #B3B5B5",
  },
  taskName: { fontWeight: tokens.fontWeightSemibold, fontSize: "12px", color: "#242424", wordBreak: "break-word" },
  person: { display: "flex", flexDirection: "column", marginBottom: space.s },
  personName: { fontSize: "10.6667px", color: "#0B0B0B" },
  personMail: { fontSize: "10.6667px", color: "#0B0B0B", wordBreak: "break-all" },
  chip: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: "110px", height: "25px", paddingLeft: space.s, paddingRight: space.s,
    // PGAS:1845-1846 gate chip: Fill RGBA(255,255,255,0.5), DropShadow.Light.
    backgroundColor: "rgba(255,255,255,0.5)", boxShadow: tokens.shadow2,
    fontSize: tokens.fontSizeBase200, cursor: "default",
  },
  // PGAS:1088-1089 task chip: Fill RGBA(0,0,0,0.1), DropShadow.Semilight.
  taskChip: { backgroundColor: "rgba(0,0,0,0.1)", boxShadow: tokens.shadow4 },
  tooltip: { whiteSpace: "pre-line" },
  dash: { fontSize: "10.6667px", color: "#0B0B0B" },
  addTaskRow: { backgroundColor: palette.white },
  addTask: { color: palette.themePrimary, marginLeft: "2px", fontSize: "12px" },
  warning: { color: palette.Warning, flexShrink: 0 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/* ════════════════════════════════════════════════════════════ small pieces ══ */

function PeopleCell({ cell, task }: { cell: ParticipantCell; task?: boolean }) {
  const styles = useStyles();
  if (cell.kind === "empty") return <Text className={styles.dash}>-</Text>;
  if (cell.kind === "chip") {
    return (
      <Tooltip content={{ children: cell.tooltip, className: styles.tooltip }} relationship="description">
        <span className={mergeClasses(styles.chip, task && styles.taskChip)} tabIndex={0}>{cell.chipText}</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={{ children: cell.tooltip, className: styles.tooltip }} relationship="description">
      <div tabIndex={0}>
        {cell.people.map((p, i) => {
          // The canvas separator's `;` follows every person but the last.
          const sep = i < cell.people.length - 1 ? cell.listSeparator : "";
          return (
            <div key={`${p.entraId}-${i}`} className={styles.person}>
              <span className={styles.personName}>{p.name}{p.mail ? "" : sep}</span>
              {p.mail ? <span className={styles.personMail}>({p.mail}){sep}</span> : null}
            </div>
          );
        })}
      </div>
    </Tooltip>
  );
}

function PmCellView({ pmId, people, showMail }: { pmId: string | null; people: GatesDataset["people"]; showMail: boolean }) {
  const styles = useStyles();
  const pm = pmCell(pmId, people);
  if (pm.text === "-") return <Text className={styles.dash}>-</Text>;
  return (
    <Tooltip content={pm.tooltip} relationship="description">
      <div className={styles.person} tabIndex={0}>
        <span className={styles.personName}>{pm.text}</span>
        {/* PGAS:1077 — the task row prints the bare address on its own line, no parentheses. */}
        {showMail && pm.mail ? <span className={styles.personMail}>{pm.mail}</span> : null}
      </div>
    </Tooltip>
  );
}

/* ════════════════════════════════════════════════════════════════ the table ══ */

export interface GateTableProps {
  rows: readonly GateRow[];
  dataset: GatesDataset;
  /** Admin access: false disables every control that writes (pills, Add Task, Delete). */
  canEdit: boolean;
  collapsed: ReadonlySet<number>;
  /** True while the id's inline toggle is in flight (`useBusyRunner().isPending`). */
  isPending: (id: string) => boolean;
  onToggleCollapse: (order: number) => void;
  onToggleGate: (row: GateRow) => void;
  onToggleTask: (task: TaskRow) => void;
  onEditGate: (row: GateRow) => void;
  onAddTask: (row: GateRow) => void;
  onEditTask: (row: GateRow, task: TaskRow) => void;
  onDeleteTask: (row: GateRow, task: TaskRow) => void;
}

export function GateTable(props: GateTableProps) {
  const styles = useStyles();
  const { rows, dataset, canEdit, collapsed, isPending } = props;
  const tasksAvailable = !dataset.checklistError;

  const body: ReactNode[] = [];
  for (const row of rows) {
    const tasks = tasksOfGate(dataset, row.state);
    const isCollapsed = collapsed.has(row.order);
    const t = row.template;
    const contributors = parsePeople(t?.contributors);
    const approvers = parsePeople(t?.approvals);
    const notifications = parsePeople(t?.notifications);
    const addEnabled = tasksAvailable && canAddTask(dataset, row.state);

    /** The gate row's stable id: its `Project States` row (a placeholder has no template id). */
    const gid = row.state.id;
    body.push(
      <TableRow key={`gate-${row.order}`} className={styles.gateRow} data-testid={`con_Admin_ProjectGates_DefaultClusterApproval_Item-${gid}`}>
        <TableCell className={styles.cell}>
          <div className={styles.descriptionCell}>
            {/* `btn_…_Item_Collapse.Visible`: only while the gate has task rows. */}
            {tasks.length > 0 ? (
              <ExpandToggle
                variant="icon24"
                expanded={!isCollapsed}
                label={isCollapsed ? LABELS.expand : LABELS.collapse}
                testId={`btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse-${gid}`}
                onToggle={() => props.onToggleCollapse(row.order)}
              />
            ) : <ExpandToggleSpacer variant="icon24" />}
            <Text className={styles.gateName} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ApprovalDescription-${gid}`}>
              {row.description}
            </Text>
            {/* DIVERGENCE: NEW — the duplicate warning (see `buildGateRows`). */}
            {row.templateCount > 1 ? (
              <Tooltip
                relationship="description"
                content={`${row.templateCount} default approvals exist for this gate. The oldest one is shown; ask an administrator to remove the duplicates.`}
              >
                <WarningRegular className={styles.warning} aria-label="Duplicate default approvals" tabIndex={0} />
              </Tooltip>
            ) : null}
          </div>
        </TableCell>
        <TableCell className={styles.cell} data-testid={`btn_Admin_ProjectGates_DefaultClusterApproval_Item_PortfolioManager-${gid}`}>
          <PmCellView pmId={t?.pmId ?? null} people={dataset.people} showMail={false} />
        </TableCell>
        <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ControllingApprovals-${gid}`}>
          <PeopleCell cell={participantCell(contributors, "Contributors")} />
        </TableCell>
        <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_Approvers-${gid}`}>
          <PeopleCell cell={participantCell(approvers, "Approvers")} />
        </TableCell>
        <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_Notifications-${gid}`}>
          <PeopleCell cell={participantCell(notifications, "Notifications")} />
        </TableCell>
        <TableCell className={styles.cell}>
          {/* Caption "Active" / "Inactive" (`.Text`). The shared pill builds its own aria-label from `subject`. */}
          <StatusPill
            variant="toggle"
            active={t?.gateActive ?? false}
            locked={!canEdit || isGateToggleLocked(row)}
            pending={t ? isPending(t.id) : false}
            subject={`Gate ${row.description}`}
            testId={`btn_Admin_ProjectGates_DefaultClusterApproval_Item_ToggleStauts-${gid}`}
            onToggle={() => props.onToggleGate(row)}
          />
        </TableCell>
        <TableCell className={styles.cell}>
          <RowActions
            tooltip="always" tone="brand"
            actions={[{
              key: "edit", icon: <EditRegular />, label: LABELS.edit,
              testId: `btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit-${gid}`,
              onClick: () => props.onEditGate(row),
            }]}
          />
        </TableCell>
      </TableRow>,
    );

    // `gal_…_ChecklistDefaultApprovals.Visible`: hidden while the gate is collapsed.
    if (!isCollapsed) {
      for (const task of tasks) {
        const a = task.approval;
        const tc = parsePeople(a.contributors);
        const ta = parsePeople(a.approvers);
        const tn = parsePeople(a.notifications);
        body.push(
          <TableRow key={`task-${a.id}`} data-testid={`cnt_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item-${a.id}`}>
            <TableCell className={mergeClasses(styles.cell, styles.taskCell)}>
              <span className={styles.treeLine} aria-hidden="true" />
              <Text
                className={styles.taskName}
                data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_ApprovalDescription-${a.id}`}
              >
                {task.checklist.name}
              </Text>
            </TableCell>
            <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_PortfolioManager-${a.id}`}>
              <PmCellView pmId={a.pmId} people={dataset.people} showMail />
            </TableCell>
            <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Contributors-${a.id}`}>
              <PeopleCell task cell={participantCell(tc, "Contributors")} />
            </TableCell>
            <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Approvers-${a.id}`}>
              <PeopleCell task cell={participantCell(ta, "Approvers")} />
            </TableCell>
            <TableCell className={styles.cell} data-testid={`lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Notifications-${a.id}`}>
              <PeopleCell task cell={taskNotificationsCell(tc, ta, tn)} />
            </TableCell>
            <TableCell className={styles.cell}>
              {/* The canvas task pill has no `DisplayMode` (always enabled); here it needs admin access. */}
              <StatusPill
                variant="toggle"
                active={a.gateActive}
                locked={!canEdit}
                pending={isPending(a.id)}
                subject={`Task ${task.checklist.name}`}
                testId={`btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_ToggleStatus-${a.id}`}
                onToggle={() => props.onToggleTask(task)}
              />
            </TableCell>
            <TableCell className={styles.cell}>
              <RowActions
                tooltip="always" tone="brand" gap={4}
                actions={[
                  {
                    key: "edit", icon: <EditRegular />, label: LABELS.edit,
                    testId: `btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Edit-${a.id}`,
                    onClick: () => props.onEditTask(row, task),
                  },
                  {
                    key: "delete", icon: <DeleteRegular />, label: LABELS.delete, disabled: !canEdit,
                    testId: `btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Delete-${a.id}`,
                    onClick: () => props.onDeleteTask(row, task),
                  },
                ]}
              />
            </TableCell>
          </TableRow>,
        );
      }
    }

    // `con_AddChecklistApproval` has no `Visible`, so Add Task stays while the gate is collapsed.
    body.push(
      <TableRow key={`add-${row.order}`} className={styles.addTaskRow} data-testid={`con_AddChecklistApproval-${gid}`}>
        <TableCell colSpan={COLUMNS.length}>
          {/* The disabled reason is a keyboard-reachable tooltip, not a native `title`. */}
          <DisabledReason reason={!canEdit ? NO_PERMISSION_MESSAGE : addEnabled ? null : addTaskDisabledReason(tasksAvailable)}>
            <Button
              className={styles.addTask} appearance="transparent" icon={<AddRegular />}
              disabled={!canEdit || !addEnabled}
              aria-label={LABELS.addTask}
              data-testid={`but_Admin_ProjectGatest_Approvals_Row_Edit_3-${gid}`}
              onClick={() => props.onAddTask(row)}
            >
              {LABELS.addTask}
            </Button>
          </DisabledReason>
        </TableCell>
      </TableRow>,
    );
  }

  return (
    <div className={styles.scroller}>
      {/* The table's `aria-label` is NEW (the canvas gallery has no caption). */}
      <Table className={styles.table} aria-label="Gate approvals" size="small" data-testid="gal_Admin_ProjectGates_DefaultApprovals_Clusters">
        <TableHeader data-testid="con_Admin_ProjectGatest_Approvals_Gallery_Header">
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHeaderCell key={c.key} className={styles.headerCell} style={{ width: `${c.width}px` }} data-testid={c.control}>
                {c.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
    </div>
  );
}
