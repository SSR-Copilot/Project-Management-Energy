/**
 * The "current year / all years" view of the sheet (product owner, 29 Oct 2026, D67).
 *
 * The grid always HOLDS every column: 6 fixed ones (Number, Name, Description, Cost Paid By,
 * Depreciation, Apply VAT) then 12 month columns per year. The toggle only chooses which columns
 * the table SHOWS. A table of ~28,000 cells (225 rows x ~126 columns) lags on every click and Tab
 * because `react-spreadsheet` renders and re-evaluates every cell; showing one year is 18 columns.
 *
 * Nothing else changes: edits made in the view are written back into the full grid, the hidden
 * years are never touched, and `onDataChange`, the save and Copy Table all see the whole grid.
 * Pure and framework-free so it is testable on its own (CONVENTIONS rule 5).
 */

/** Number, Name, Description, Cost Paid By, Depreciation, Apply VAT. */
export const FIXED_COLUMNS = 6;
export const MONTHS_PER_YEAR = 12;

/**
 * Which year the toggle opens on: the current year, or the nearest year the sheet covers when the
 * current year lies outside it (a project that starts later, or that has already ended its range).
 */
export function currentYearIndex(currentYear: number, startYear: number, yearCount: number): number {
  if (yearCount <= 1) return 0;
  return Math.min(Math.max(currentYear - startYear, 0), yearCount - 1);
}

/**
 * The full-grid column indexes the view shows, or `null` for every column (all years).
 * `yearIndex` is zero-based over the year blocks and is clamped into range.
 */
export function viewColumns(width: number, yearIndex: number | null): number[] | null {
  if (yearIndex === null) return null;
  const blocks = Math.max(Math.ceil((width - FIXED_COLUMNS) / MONTHS_PER_YEAR), 0);
  if (blocks === 0) return null;
  const year = Math.min(Math.max(Math.floor(yearIndex), 0), blocks - 1);
  const start = FIXED_COLUMNS + year * MONTHS_PER_YEAR;
  const columns: number[] = [];
  for (let c = 0; c < FIXED_COLUMNS; c++) columns.push(c);
  for (let c = start; c < Math.min(start + MONTHS_PER_YEAR, width); c++) columns.push(c);
  return columns;
}

/** The visible slice of every row. Cells are shared with the full grid, not copied. */
export function toView<T>(grid: readonly (readonly T[])[], columns: readonly number[]): T[][] {
  return grid.map((row) => columns.map((c) => row[c] as T));
}

/**
 * Writes the view's rows back into the full grid. A hidden column keeps the full grid's cell; a
 * view row longer than the view (a paste wider than one year) is clipped to the visible columns; a
 * row the view added (a paste below the last row) gets `blank()` in every hidden column.
 */
export function fromView<T>(
  view: readonly (readonly (T | undefined)[] | undefined)[],
  full: readonly (readonly T[])[],
  columns: readonly number[],
  width: number,
  blank: () => T,
): T[][] {
  return view.map((viewRow, r) => {
    const base = full[r];
    const row: T[] = [];
    for (let c = 0; c < width; c++) row.push(base?.[c] ?? blank());
    if (viewRow) {
      columns.forEach((column, i) => {
        const cell = viewRow[i];
        if (cell !== undefined) row[column] = cell;
      });
    }
    return row;
  });
}
