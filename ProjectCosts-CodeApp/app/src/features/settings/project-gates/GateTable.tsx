/**
 * M5-M8 — the gate matrix: column header, gate rows, nested checklist-task rows and the
 * "Add Task" row. Presentation only; every rule comes from `./rules`.
 *
 * B9: no `aria-level` on rows of a plain table (invalid ARIA); the expanded state is exposed by
 * the collapse button's `aria-expanded` instead.
 *
 * Reusable components (Wave B): the pill is the shared `StatusPill variant="toggle"` (C6), the
 * collapse button `ExpandToggle variant="icon24"` (C10), the row icons `RowActions` (C5) and the
 * disabled Add Task reason a `DisabledReason` tooltip (C4, V8). People cells and the tree
 * connector stay local.
 */
import type { ReactNode } from "react";
import {
  Button, makeStyles, mergeClasses, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Tooltip, tokens,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, WarningRegular } from "@fluentui/react-icons";
import { DisabledReason, ExpandToggle, ExpandToggleSpacer, RowActions, StatusPill } from "@/components";
import { palette, space } from "@/theme/tokens";
import type { GatesDataset } from "@/data/settings/project-gates";
import {
  canAddTask, isGateToggleLocked, parsePeople, participantCell, pmCell, taskNotificationsCell,
  tasksOfGate, type GateRow, type ParticipantCell, type TaskRow,
} from "./rules";

/** Column widths from the canvas header labels (PGAS:447-672); Status/Action widened to fit. */
const COLUMNS = [
  { key: "description", label: "Description", width: 250 },
  { key: "pm", label: "Portfolio Manager", width: 200 },
  { key: "contributors", label: "Contributors", width: 180 },
  { key: "approvers", label: "Approvers", width: 180 },
  { key: "notifications", label: "Notifications", width: 180 },
  { key: "status", label: "Status", width: 90 },
  { key: "action", label: "Action", width: 96 },
] as const;

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/** Why "Add Task" is disabled (the texts of the former native `title`, unchanged). */
const addTaskDisabledReason = (tasksAvailable: boolean) => (tasksAvailable
  ? "Every check list task of this gate already has an approval."
  : "Check list tasks are not available.");

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  table: { width: `${TABLE_WIDTH}px`, tableLayout: "fixed" },
  headerCell: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200 },
  gateRow: {
    backgroundColor: "rgba(0,0,0,0.07)",
    ":hover": { backgroundColor: "rgba(0,0,0,0.1)" },
  },
  cell: { verticalAlign: "top", paddingTop: space.s, paddingBottom: space.s },
  descriptionCell: { display: "flex", alignItems: "center", columnGap: space.s },
  gateName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  taskCell: { position: "relative", paddingLeft: "44px" },
  treeLine: {
    position: "absolute", left: "20px", top: 0, bottom: "50%", width: "18px",
    borderLeft: "1px solid #B0B0B0", borderBottom: "1px solid #B3B5B5",
  },
  taskName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, wordBreak: "break-word" },
  person: { display: "flex", flexDirection: "column", marginBottom: space.s },
  personName: { fontSize: tokens.fontSizeBase200 },
  personMail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, wordBreak: "break-all" },
  chip: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: "110px", height: "25px", paddingLeft: space.s, paddingRight: space.s,
    backgroundColor: "rgba(255,255,255,0.6)", boxShadow: tokens.shadow2,
    fontSize: tokens.fontSizeBase200, cursor: "default",
  },
  taskChip: { backgroundColor: "rgba(0,0,0,0.1)" },
  tooltip: { whiteSpace: "pre-line" },
  dash: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  addTaskRow: { backgroundColor: palette.white },
  addTask: { color: palette.themePrimary, marginLeft: "24px" },
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
          // Parity R1 GAP-1: the canvas separator's `;` follows every person but the last.
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
        {showMail && pm.mail ? <span className={styles.personMail}>({pm.mail})</span> : null}
      </div>
    </Tooltip>
  );
}

/* ════════════════════════════════════════════════════════════════ the table ══ */

export interface GateTableProps {
  rows: readonly GateRow[];
  dataset: GatesDataset;
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
  const { rows, dataset, collapsed, isPending } = props;
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

    body.push(
      <TableRow key={`gate-${row.order}`} className={styles.gateRow} data-testid={`gate-row-${row.order}`}>
        <TableCell className={styles.cell}>
          <div className={styles.descriptionCell}>
            {tasks.length > 0 ? (
              <ExpandToggle
                variant="icon24"
                expanded={!isCollapsed}
                label={`${isCollapsed ? "Expand" : "Collapse"} tasks of ${row.description}`}
                onToggle={() => props.onToggleCollapse(row.order)}
              />
            ) : <ExpandToggleSpacer variant="icon24" />}
            <Text className={styles.gateName}>{row.description}</Text>
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
        <TableCell className={styles.cell}><PmCellView pmId={t?.pmId ?? null} people={dataset.people} showMail={false} /></TableCell>
        <TableCell className={styles.cell}><PeopleCell cell={participantCell(contributors, "Contributors")} /></TableCell>
        <TableCell className={styles.cell}><PeopleCell cell={participantCell(approvers, "Approvers")} /></TableCell>
        <TableCell className={styles.cell}><PeopleCell cell={participantCell(notifications, "Notifications")} /></TableCell>
        <TableCell className={styles.cell}>
          <StatusPill
            variant="toggle"
            active={t?.gateActive ?? false}
            locked={isGateToggleLocked(row)}
            pending={t ? isPending(t.id) : false}
            subject={`Gate ${row.description}`}
            onToggle={() => props.onToggleGate(row)}
          />
        </TableCell>
        <TableCell className={styles.cell}>
          <RowActions
            tooltip="always" tone="brand"
            actions={[{
              key: "edit", icon: <EditRegular />, tooltipText: "Edit",
              label: `Edit approvers of ${row.description}`, onClick: () => props.onEditGate(row),
            }]}
          />
        </TableCell>
      </TableRow>,
    );

    if (!isCollapsed) {
      for (const task of tasks) {
        const a = task.approval;
        const tc = parsePeople(a.contributors);
        const ta = parsePeople(a.approvers);
        const tn = parsePeople(a.notifications);
        body.push(
          <TableRow key={`task-${a.id}`} data-testid={`task-row-${a.id}`}>
            <TableCell className={mergeClasses(styles.cell, styles.taskCell)}>
              <span className={styles.treeLine} aria-hidden="true" />
              <Text className={styles.taskName}>{task.checklist.name}</Text>
            </TableCell>
            <TableCell className={styles.cell}><PmCellView pmId={a.pmId} people={dataset.people} showMail /></TableCell>
            <TableCell className={styles.cell}><PeopleCell task cell={participantCell(tc, "Contributors")} /></TableCell>
            <TableCell className={styles.cell}><PeopleCell task cell={participantCell(ta, "Approvers")} /></TableCell>
            <TableCell className={styles.cell}><PeopleCell task cell={taskNotificationsCell(tc, ta, tn)} /></TableCell>
            <TableCell className={styles.cell}>
              <StatusPill
                variant="toggle"
                active={a.gateActive}
                locked={false}
                pending={isPending(a.id)}
                subject={`Task ${task.checklist.name}`}
                onToggle={() => props.onToggleTask(task)}
              />
            </TableCell>
            <TableCell className={styles.cell}>
              <RowActions
                tooltip="always" tone="brand" gap={4}
                actions={[
                  {
                    key: "edit", icon: <EditRegular />, tooltipText: "Edit",
                    label: `Edit approvers of task ${task.checklist.name}`, onClick: () => props.onEditTask(row, task),
                  },
                  {
                    key: "delete", icon: <DeleteRegular />, tooltipText: "Delete",
                    label: `Delete approval of task ${task.checklist.name}`, onClick: () => props.onDeleteTask(row, task),
                  },
                ]}
              />
            </TableCell>
          </TableRow>,
        );
      }
    }

    body.push(
      <TableRow key={`add-${row.order}`} className={styles.addTaskRow}>
        <TableCell colSpan={COLUMNS.length}>
          {/* V8: the disabled reason is a keyboard-reachable tooltip, not a native `title`. */}
          <DisabledReason reason={addEnabled ? null : addTaskDisabledReason(tasksAvailable)}>
            <Button
              className={styles.addTask} appearance="transparent" icon={<AddRegular />}
              disabled={!addEnabled}
              aria-label={`Add task approval to ${row.description}`}
              onClick={() => props.onAddTask(row)}
            >
              Add Task
            </Button>
          </DisabledReason>
        </TableCell>
      </TableRow>,
    );
  }

  return (
    <div className={styles.scroller}>
      <Table className={styles.table} aria-label="Gate approvals" size="small">
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHeaderCell key={c.key} className={styles.headerCell} style={{ width: `${c.width}px` }}>
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
