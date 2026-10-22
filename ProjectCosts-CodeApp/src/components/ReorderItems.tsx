/**
 * Accessible reorder list for the Application Settings reorder panels (named so it never shadows
 * `components/ReorderList.tsx`) — what CAPEX Accounts (`Panels.tsx` ReorderPanel) and Check List
 * Settings (`ReorderDrawer.tsx`) each built: Move up / Move down buttons, focus that follows the
 * moved item (or the other arrow once it reaches an edge), a polite live-region announcement per
 * move, and optional native drag-and-drop (CAPEX).
 *
 * CONTROLLED: the parent owns the order and applies `onMove(from, to)` (e.g. with
 * `domain/reorder.ts` `moveItem`). Both screens' differences are props:
 *
 *   | prop              | Check List Settings        | CAPEX Accounts                 |
 *   |-------------------|----------------------------|--------------------------------|
 *   | `buttonLabels`    | "describedby" (Move up)    | "inline" (Move <label> up)     |
 *   | `showPosition`    | true ("1.")                | false                          |
 *   | `draggable`       | false                      | true                           |
 *   | `announcePeriod`  | true                       | false                          |
 */
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Button, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowUpRegular, ReOrderDotsVerticalRegular } from "@fluentui/react-icons";
import { moveAnnouncement } from "@/domain/reorder";
import { useVisuallyHiddenStyles } from "@/theme/visuallyHidden";

const useStyles = makeStyles({
  list: { listStyleType: "none", margin: "0", paddingLeft: "0", display: "flex", flexDirection: "column", rowGap: "4px" },
  item: {
    display: "flex", alignItems: "center", columnGap: "8px",
    paddingTop: "4px", paddingBottom: "4px", paddingLeft: "8px", paddingRight: "4px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  dragging: { opacity: 0.5 },
  grip: { flexShrink: 0, color: tokens.colorNeutralForeground3, cursor: "grab" },
  position: { width: "28px", color: tokens.colorNeutralForeground3, flexShrink: 0 },
  name: { flexGrow: 1, minWidth: "0", fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
});

export interface ReorderItemsProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** The item's visible text; also used in the announcement and the inline button labels. */
  getLabel: (item: T) => string;
  /** Apply the move; the list re-renders with the new `items`. */
  onMove: (from: number, to: number) => void;
  /** The `<ol>`'s accessible name. */
  ariaLabel: string;
  disabled?: boolean;
  buttonLabels?: "describedby" | "inline";
  showPosition?: boolean;
  draggable?: boolean;
  announcePeriod?: boolean;
  emptyText?: string;
  /** `data-testid` per row (both screens' tests address rows this way). */
  itemTestId?: (item: T) => string;
  /** Stem of the Move up / Move down buttons' `data-testid` (`${stem}-up-${id}`); default `"reorder-move"`. */
  buttonTestIdPrefix?: string;
}

export function ReorderItems<T>({
  items, getId, getLabel, onMove, ariaLabel, disabled = false, buttonLabels = "describedby",
  showPosition = false, draggable = false, announcePeriod = true, emptyText, itemTestId,
  buttonTestIdPrefix = "reorder-move",
}: ReorderItemsProps<T>) {
  const styles = useStyles();
  const hidden = useVisuallyHiddenStyles();
  const baseId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef<{ id: string; dir: "up" | "down" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // After a keyboard move, keep focus on the moved item's arrow (the other one at an edge).
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (!target || !listRef.current) return;
    const find = (dir: "up" | "down") => [...listRef.current!.querySelectorAll<HTMLButtonElement>("button[data-reorder-dir]")]
      .find((b) => b.dataset["reorderId"] === target.id && b.dataset["reorderDir"] === dir);
    const preferred = find(target.dir);
    const fallback = find(target.dir === "up" ? "down" : "up");
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [items]);

  const move = (index: number, dir: "up" | "down") => {
    const to = dir === "up" ? index - 1 : index + 1;
    const item = items[index];
    if (item === undefined || to < 0 || to >= items.length) return;
    pendingFocus.current = { id: getId(item), dir };
    setAnnouncement(moveAnnouncement(getLabel(item), to + 1, items.length, announcePeriod));
    onMove(index, to);
  };

  const onDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    event.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    onMove(dragIndex, index);
    setDragIndex(index);
  };

  return (
    <>
      {items.length === 0 && emptyText ? (
        <Text role="status">{emptyText}</Text>
      ) : (
        <ol ref={listRef} className={styles.list} aria-label={ariaLabel}>
          {items.map((item, index) => {
            const id = getId(item);
            const label = getLabel(item);
            const nameId = `${baseId}-name-${index}`;
            const dnd = draggable && !disabled;
            return (
              <li
                key={id}
                className={mergeClasses(styles.item, dragIndex === index && styles.dragging)}
                data-testid={itemTestId?.(item)}
                draggable={dnd}
                {...(dnd ? {
                  onDragStart: (e: DragEvent<HTMLLIElement>) => { setDragIndex(index); e.dataTransfer.effectAllowed = "move"; },
                  onDragOver: (e: DragEvent<HTMLLIElement>) => onDragOver(e, index),
                  onDrop: (e: DragEvent<HTMLLIElement>) => { e.preventDefault(); setDragIndex(null); },
                  onDragEnd: () => setDragIndex(null),
                } : {})}
              >
                {draggable ? <ReOrderDotsVerticalRegular className={styles.grip} aria-hidden="true" /> : null}
                {showPosition ? <Text className={styles.position} aria-hidden="true">{index + 1}.</Text> : null}
                <Text id={nameId} className={styles.name}>{label}</Text>
                <Button
                  appearance="subtle" icon={<ArrowUpRegular />}
                  disabled={disabled || index === 0}
                  {...(buttonLabels === "inline"
                    ? { "aria-label": `Move ${label} up` }
                    : { "aria-label": "Move up", "aria-describedby": nameId })}
                  data-testid={`${buttonTestIdPrefix}-up-${id}`}
                  data-reorder-id={id} data-reorder-dir="up"
                  onClick={() => move(index, "up")}
                />
                <Button
                  appearance="subtle" icon={<ArrowDownRegular />}
                  disabled={disabled || index === items.length - 1}
                  {...(buttonLabels === "inline"
                    ? { "aria-label": `Move ${label} down` }
                    : { "aria-label": "Move down", "aria-describedby": nameId })}
                  data-testid={`${buttonTestIdPrefix}-down-${id}`}
                  data-reorder-id={id} data-reorder-dir="down"
                  onClick={() => move(index, "down")}
                />
              </li>
            );
          })}
        </ol>
      )}
      <div className={hidden.root} role="status" aria-live="polite" data-testid="reorder-announcement">
        {announcement}
      </div>
    </>
  );
}
