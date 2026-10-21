/**
 * A reorderable list — the code-app replacement for the canvas `pdd_CustomControl.PowerDragDrop`
 * control (Admin Default Checklists, Admin CAPEX Accounts).
 *
 * Rows can be dragged (native HTML drag-and-drop) or moved with the Move up / Move down buttons,
 * so the order can also be changed from the keyboard. The list is controlled: it renders `ids` in
 * the given order and reports a new order through `onChange`. Nothing is saved here; the screen
 * turns the final order into its own write plan.
 */
import { useState, type DragEvent } from "react";
import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowUpRegular, ReOrderDotsVerticalRegular } from "@fluentui/react-icons";
import { palette, space } from "@/theme/tokens";
import { moveItem } from "./reorder";

const useStyles = makeStyles({
  row: {
    display: "flex", alignItems: "center", gap: space.xs,
    paddingTop: space.xs, paddingBottom: space.xs, paddingLeft: space.s, paddingRight: space.s,
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.neutralLight,
    cursor: "grab", backgroundColor: palette.white,
  },
  // PowerDragDrop's item template on both screens is a bold name.
  name: { flexGrow: 1, fontWeight: tokens.fontWeightSemibold },
  over: { backgroundColor: palette.neutralLighter },
});

export interface ReorderListProps {
  /** The ids in their current order. */
  ids: readonly string[];
  /** The text shown for each id. */
  labelOf: (id: string) => string;
  onChange: (ids: string[]) => void;
  /** The canvas drag control's name. */
  testId: string;
  /** Prefix for the per-row button ids: `<prefix>-up-<id>` / `<prefix>-down-<id>`. */
  rowTestIdPrefix: string;
  ariaLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
}

export function ReorderList({
  ids, labelOf, onChange, testId, rowTestIdPrefix, ariaLabel, moveUpLabel, moveDownLabel,
}: ReorderListProps) {
  const s = useStyles();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const reset = () => { setDragIndex(null); setOverIndex(null); };

  const onDragStart = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOverIndex(index);
  };
  const onDrop = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIndex !== null) onChange(moveItem(ids, dragIndex, index));
    reset();
  };

  return (
    <div data-testid={testId} role="list" aria-label={ariaLabel}>
      {ids.map((id, index) => (
        <div
          key={id}
          role="listitem"
          className={mergeClasses(s.row, overIndex === index && s.over)}
          draggable
          onDragStart={onDragStart(index)}
          onDragOver={onDragOver(index)}
          onDragLeave={() => setOverIndex(null)}
          onDrop={onDrop(index)}
          onDragEnd={reset}
        >
          <ReOrderDotsVerticalRegular aria-hidden />
          <span className={s.name}>{labelOf(id)}</span>
          <Button
            appearance="subtle" size="small" icon={<ArrowUpRegular />}
            disabled={index === 0}
            aria-label={moveUpLabel}
            data-testid={`${rowTestIdPrefix}-up-${id}`}
            onClick={() => onChange(moveItem(ids, index, index - 1))}
          />
          <Button
            appearance="subtle" size="small" icon={<ArrowDownRegular />}
            disabled={index === ids.length - 1}
            aria-label={moveDownLabel}
            data-testid={`${rowTestIdPrefix}-down-${id}`}
            onClick={() => onChange(moveItem(ids, index, index + 1))}
          />
        </div>
      ))}
    </div>
  );
}
