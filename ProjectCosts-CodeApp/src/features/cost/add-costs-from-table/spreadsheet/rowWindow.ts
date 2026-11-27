/**
 * Which rows of the sheet are drawn (D140). The grid HOLDS every row; only the rows on screen,
 * plus `OVERSCAN_ROWS` above and below, are drawn with their cells. Every other row is an empty
 * row of the same height, so the scroll range and every row's position are what the full table
 * gives. A 225-row x 10-year sheet is ~28,000 cells, and react-spreadsheet keeps seven state
 * subscriptions per drawn cell: drawing them all made every keystroke and click wait for
 * ~227,000 subscription checks and a layout of the whole table.
 *
 * Pure and framework-free so it is testable on its own (CONVENTIONS rule 5).
 */

/** Rows drawn beyond the visible ones, on each side: room for a scroll step or an arrow key. */
export const OVERSCAN_ROWS = 15;
/** Rows drawn before the scroll box has a height (first render, or no layout at all as in jsdom). */
export const FALLBACK_VISIBLE_ROWS = 40;
/** react-spreadsheet's cell height (`1.9em`) at the sheet's font, until a drawn row is measured. */
export const DEFAULT_ROW_HEIGHT = 30;

export interface RowWindow {
  /** First and last grid row (0 = the header row) drawn with cells, inclusive. */
  first: number;
  last: number;
  /** Height of a drawn row, given to every row drawn empty. */
  rowHeight: number;
}

/**
 * The rows to draw for a scroll position. `scrollTop` and `viewportHeight` are the scroll box's;
 * `headerHeight` is what sits above grid row 0 (the column-letter row). A height of 0 (no layout)
 * draws the first `FALLBACK_VISIBLE_ROWS` rows plus the overscan.
 */
export function rowWindowFor(
  scrollTop: number, viewportHeight: number, headerHeight: number, rowHeight: number, rowCount: number,
): RowWindow {
  const height = rowHeight > 0 ? rowHeight : DEFAULT_ROW_HEIGHT;
  const firstVisible = Math.max(0, Math.floor((scrollTop - headerHeight) / height));
  const visible = viewportHeight > 0 ? Math.ceil(viewportHeight / height) + 1 : FALLBACK_VISIBLE_ROWS;
  const last = Math.max(0, Math.min(rowCount - 1, firstVisible + visible + OVERSCAN_ROWS));
  const first = Math.max(0, Math.min(firstVisible - OVERSCAN_ROWS, last));
  return { first, last, rowHeight: height };
}

export const sameRowWindow = (a: RowWindow, b: RowWindow): boolean =>
  a.first === b.first && a.last === b.last && a.rowHeight === b.rowHeight;

/**
 * Whether grid row `row` is drawn with its cells. The active cell's row always is, and so is every row in `pinned`:
 * the first and last row of the current selection (bug 15411). react-spreadsheet sizes its selection rectangle from
 * the measured cells at both ENDS of the range, and a cell is measured only once it is mounted, so a selection whose
 * end row is outside the window (a column or the whole sheet selected) drew no rectangle at all.
 */
export const rowDrawn = (
  w: RowWindow, row: number, activeRow: number | null, pinned: readonly number[] = [],
): boolean =>
  row === activeRow || (row >= w.first && row <= w.last) || pinned.includes(row);

/** Columns drawn beyond the visible ones, on each side. */
export const OVERSCAN_COLUMNS = 4;

/** First and last grid column drawn with cells in a drawn row, inclusive. */
export interface ColumnWindow { first: number; last: number }

/**
 * The columns to draw for a horizontal scroll position. `widths` are the pinned widths, the
 * row-number column first (so grid column `c` is `widths[c + 1]`); `offsetX` is how far the
 * visible band starts right of the table's left edge, `bandWidth` how wide it is. A band of 0
 * width (no layout) draws every column.
 */
export function columnWindowFor(offsetX: number, bandWidth: number, widths: readonly number[]): ColumnWindow {
  const count = widths.length - 1;
  if (count <= 0) return { first: 0, last: -1 };
  if (bandWidth <= 0) return { first: 0, last: count - 1 };
  let x = widths[0] ?? 0;
  let firstVisible = 0;
  let lastVisible = count - 1;
  let foundFirst = false;
  for (let c = 0; c < count; c++) {
    const end = x + (widths[c + 1] ?? 0);
    if (!foundFirst && end > offsetX) { firstVisible = c; foundFirst = true; }
    if (x < offsetX + bandWidth) lastVisible = c;
    x = end;
  }
  return {
    first: Math.max(0, firstVisible - OVERSCAN_COLUMNS),
    last: Math.min(count - 1, lastVisible + OVERSCAN_COLUMNS),
  };
}

export const sameColumnWindow = (a: ColumnWindow | null, b: ColumnWindow | null): boolean =>
  a === b || (!!a && !!b && a.first === b.first && a.last === b.last);

/**
 * A drawn row's columns as runs: drawn columns one by one, and each stretch of columns not drawn
 * as ONE run (one spacer cell spanning them, so the pinned column widths still line up). The
 * active cell's column is always drawn, and so is every column in `pinned`: the first and last
 * column of the current selection (bug 15411). A row selected by its row number runs to the LAST
 * month column, far right of the window; with that cell never mounted, react-spreadsheet had no
 * end point for its selection rectangle and only the active first cell looked selected.
 */
export function columnRuns(
  count: number, w: ColumnWindow, activeColumn: number | null, pinned: readonly number[] = [],
): { drawn: boolean; from: number; to: number }[] {
  const runs: { drawn: boolean; from: number; to: number }[] = [];
  for (let c = 0; c < count; c++) {
    const drawn = c === activeColumn || (c >= w.first && c <= w.last) || pinned.includes(c);
    const last = runs[runs.length - 1];
    if (!drawn && last && !last.drawn) last.to = c;
    else runs.push({ drawn, from: c, to: c });
  }
  return runs;
}
