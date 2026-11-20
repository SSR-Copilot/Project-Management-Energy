/**
 * Project Generators Screen — the card gallery and its two shared card parts (D143, moved from `Screen.tsx`).
 * `Gallery` is verbatim; `CardTitle` and `FoldButton` were the screen's inline `titleOf` / `foldButton` functions, now components so
 * the memoized sections can use them (same DOM, same classes, same test ids and labels).
 */
import type { ReactNode } from "react";
import { Button, Radio, mergeClasses } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { ExpandChevron } from "@/components";
import {
  CANCEL_REQUEST, cancelRequestVisible, permissionStateLabel, permissionStateTone, showsPermissionChip,
  type GeneratorTypeRow, type PermissionFamily, type PlantFamily, type SimpleTypeRow,
} from "../rules";
import { CANCEL_BUTTON, FOLD_ICON } from "./state";
import { useStyles } from "./styles";

/** One gallery card. */
export interface GalleryRow {
  id: string;
  title: ReactNode;
  cells: ReactNode[];
  selected: boolean;
  onSelect: () => void;
  /** Whether the card is expanded (`Not(ThisItem.IsFolded)`) — its details show. */
  open: boolean;
  /** The card body under the details — the WTG turbine grid, shown while expanded. */
  expanded?: ReactNode;
  /** Shown ABOVE the details while expanded — the WTG card's "Add Generator" bar (canvas). */
  before?: ReactNode;
  fold: ReactNode;
  /** D143: an expanded card with a long list (`cardLongList`): rendered only near the viewport. */
  longList?: boolean;
}

/** A value the canvas right-aligns: a plain number, optionally with a unit-free % sign. */
const isNumericValue = (v: ReactNode): boolean =>
  typeof v === "number" || (typeof v === "string" && /^-?[\d.,\s]+%?$/.test(v.trim()) && v.trim() !== "");

/** The 4-column grid column of cell `i`: row by row, or column by column when there are two rows. */
const detailColumn = (i: number, count: number, rowFlow: boolean): number =>
  rowFlow || count <= 4 ? i % 4 : Math.floor(i / 2);

/** A gallery: one card per row; an expanded card shows its detail captions and values. */
export function Gallery({
  name, columns, rows, disabled, selectLabel, rowFlow = false, layout, shadow = false,
}: {
  /**
   * The canvas auto-layout cards, where every cell is flush in its column and every value is
   * `Align.Left` (numbers included): `"pv"` — 260-px columns of two (`pvGrid`); `"simple"` — BESS /
   * Hydrogen / Substation, one row of quarter-width cells (`simpleGrid`). Omitted: the 4-column grid.
   */
  layout?: "pv" | "simple";
  /** `null` is an empty slot — the canvas leaves a cell of the 4-column grid blank. */
  name: string; columns: readonly (string | null)[]; rows: GalleryRow[]; disabled: boolean;
  /** Fill the detail grid row by row (the WTG card's 2 × 4 layout) instead of column by column. */
  rowFlow?: boolean;
  /** The card container keeps the default `DropShadow.Light` (WTG and inverter cards; `cardShadow`). */
  shadow?: boolean;
  /** The card's selection dot `AccessibleLabel` (`img_…_CardHeader_RowSelectionDot`). */
  selectLabel: string;
}) {
  const s = useStyles();
  if (rows.length === 0) return null;
  return (
    <div className={s.gallery} data-testid={name} role="list" aria-label={name}>
      {rows.map((r) => (
        <div key={r.id} className={mergeClasses(s.card, shadow && s.cardShadow, r.longList && s.cardLongList)} role="listitem" data-selected={r.selected || undefined}>
          <div className={s.cardHeader}>
            <Radio
              className={s.cardDot}
              checked={r.selected}
              aria-label={selectLabel}
              value={r.id}
              data-testid={`${name}-select-${r.id}`}
              disabled={disabled}
              onChange={r.onSelect}
              onClick={r.selected ? r.onSelect : undefined}
            />
            <div className={s.cardTitle}>{r.title}</div>
            <div className={s.cardFold}>{r.fold}</div>
          </div>
          {r.open ? (
            <div className={s.cardDetails}>
              {r.before}
              <div className={
                layout === "pv" ? s.pvGrid
                : layout === "simple" ? s.simpleGrid
                : mergeClasses(s.detailGrid, columns.length > 4 && !rowFlow && s.detailGridTwoRows)
              }>
                {columns.map((c, i) => (
                  c === null
                    ? <div key={`${i}-empty`} aria-hidden="true" />
                    : (
                      <div key={`${i}-${c}`} className={mergeClasses(s.detailCell, (layout !== undefined || detailColumn(i, columns.length, rowFlow) === 0) && s.detailCellFirst)}>
                        <span className={mergeClasses(s.detailLabel, layout === "pv" && s.detailLabelFull)}>{c}</span>
                        <div className={mergeClasses(s.detailValue, layout === undefined && isNumericValue(r.cells[i]) && s.detailValueNumeric)}>
                          {r.cells[i]}
                        </div>
                      </div>
                    )
                ))}
              </div>
              {r.expanded}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * The header's tags, left to right as the canvas places them from the right edge: `extra` (the Height
 * Limitation tag), the request-permission chip and its Cancel button, then `trailing` (the status tag,
 * rightmost: `con_Generator_GeneratorStatus.X = Parent.Width - 10 - Self.Width - 40`).
 */
export function CardTitle({ family, label, row, extra, trailing, refreshing, onCancelRequest }: {
  family: PlantFamily; label: string; row: SimpleTypeRow | GeneratorTypeRow; extra?: ReactNode; trailing?: ReactNode;
  /** `writes.refreshing`: the card's Cancel waits for a reload. */
  refreshing: boolean;
  onCancelRequest: (family: PermissionFamily, row: GeneratorTypeRow | SimpleTypeRow) => void;
}) {
  const s = useStyles();
  const PERM_TONE_CLASS = { success: s.permSuccess, error: s.permError, warning: s.permWarning, disabled: s.permDisabled };
  const chip = showsPermissionChip(family) ? permissionStateLabel(row.requestPermissionState) : null;
  const cancelName = CANCEL_BUTTON[family];
  return (
    <span className={s.title}>
      <span className={s.titleText}>{label}</span>
      {extra}
      {chip ? (
        <span className={mergeClasses(s.permChip, PERM_TONE_CLASS[permissionStateTone(row.requestPermissionState)])}>{chip}</span>
      ) : null}
      {cancelName && showsPermissionChip(family) && cancelRequestVisible(family, row) ? (
        <Button
          size="small" appearance="secondary" icon={<DismissRegular />}
          aria-label={cancelName} data-testid={`${cancelName}-${row.id}`}
          title={family === "wtg" ? CANCEL_REQUEST.wtgTooltip : CANCEL_REQUEST.tooltip}
          disabled={refreshing}
          onClick={(e) => {
            // The button sits in the card's title: the click must not also select / fold the card.
            e.stopPropagation();
            onCancelRequest(family as PermissionFamily, row);
          }}
        >
          {CANCEL_REQUEST.text}
        </Button>
      ) : null}
      {trailing}
    </span>
  );
}

/** The fold chevron of one card (`ico_…_Up` while expanded, `ico_…_Down` while collapsed). */
export function FoldButton({ family, id, open, editable, onFold }: {
  family: PlantFamily; id: string; open: boolean; editable: boolean; onFold: (family: PlantFamily, id: string) => void;
}) {
  const s = useStyles();
  const name = open ? FOLD_ICON[family].up : FOLD_ICON[family].down;
  return (
    <Button
      appearance="transparent" size="small" className={s.foldButton}
      icon={<ExpandChevron open={open} className={!editable ? s.foldIconDisabled : undefined} />}
      aria-label={name} aria-expanded={open} data-testid={name}
      disabled={!editable}
      onClick={() => onFold(family, id)}
    />
  );
}
