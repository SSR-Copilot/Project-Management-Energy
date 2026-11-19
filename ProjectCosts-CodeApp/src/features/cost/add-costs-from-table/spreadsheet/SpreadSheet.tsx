/**
 * Ported from the PCF `vsb_Dev.SpreadSheet`'s `SpreadSheet/SpreadSheet.tsx` — the real
 * `react-spreadsheet`-based grid the canvas app used, not a re-derivation. All
 * `ComponentFramework.*` typing is dropped (this app has no PCF dataset binding); the
 * `AddRow`/`DeleteRow`/`CopyData` flip-flag boolean PROPS (a workaround for Power Fx's
 * one-way binding) are replaced with plain callback props called straight from toolbar
 * buttons — `onAddRow`, `onDeleteRow`, `onCopyTable` — which is the React-native equivalent
 * of the same "insert/delete/copy on demand" behavior.
 *
 * Everything else — the data model, row coloring, sanitizeSpreadsheetData's fill-down and
 * `"*Account*"` skip, the cell validation on change, the whole-worksheet-paste trim behavior,
 * and the `onDataChange` JSON shape — is preserved exactly, including the original's quirks
 * (e.g. numeric validation sets `isValid = false` but never actually blocks the change; that
 * matches the canvas, which relies on `validateSheet` downstream instead of blocking here).
 */
import * as React from "react";
import Spreadsheet, {
  type CellBase, type DataEditorComponent, type Matrix, type Point, type RowProps, type TableProps,
} from "react-spreadsheet";
import "./MySpreadsheet.css";
import DropdownEditor from "./CostPaidBy";
import YesNoEditor from "./YesNoDropDown";
import { fromView, toView, viewColumns } from "./viewColumns";
import { useTrimmedGridPaste } from "./pasteTrim";
import {
  DEFAULT_ROW_HEIGHT, columnRuns, columnWindowFor, rowDrawn, rowWindowFor, sameColumnWindow, sameRowWindow,
  type ColumnWindow, type RowWindow,
} from "./rowWindow";
import { columnWidthsFor, sameWidths, type ColumnMetrics } from "./columnWidths";

export interface SheetCell extends CellBase<string> {
  value: string;
  Row_ID?: string;
  DataEditor?: DataEditorComponent<CellBase<string>>;
}
export type SheetGrid = SheetCell[][];

export interface ISpreadSheetProps {
  data: SheetGrid;
  onDataChange: (grid: SheetGrid) => void;
  onAddRow?: () => void;
  onDeleteRow?: () => void;
  onCopyTable?: () => void;
  /** Bump to trigger the add/delete/copy effects below — the callback props above are invoked, this is the trigger token. */
  addRowToken?: number;
  deleteRowToken?: number;
  copyTableToken?: number;
  /**
   * Which year block the table shows (zero-based), or `null` / omitted for every year. NEW — no canvas
   * equivalent (D73): only the visible columns are rendered, which is what keeps a click or Tab fast; the
   * grid itself, `onDataChange`, Copy Table and the save always work on every column. The screen no longer
   * passes it (D139: every year is always shown); it is kept, and tested, in case a one-year view returns.
   */
  visibleYearIndex?: number | null;
  /**
   * Draw every row with its cells, as before D140, instead of only the rows in view. Off by
   * default; a fallback, and the reference the row window is measured against.
   */
  drawAllRows?: boolean;
}

const generateRowID = (rowIndex: number) => `Row_${rowIndex + 1}`;

/**
 * A month cell's value, forced to a whole number — typed, or pasted.
 *
 * The month columns used to accept `^[0-9.]*$` and clear anything else, so a decimal went
 * straight in and only `validateMonthAmount` downstream ever objected ("Value must be a
 * numeric"). Costs here are whole units, so a decimal is refused at the point of entry instead.
 *
 * `handleChange` is the one gate both routes pass through — `react-spreadsheet` reports a typed
 * edit and a paste the same way — so this is the only place the rule has to live.
 *
 * ROUNDS rather than truncates, matching "Recalculate Allocated Cost" (`Round(…, 0)`) on the
 * CAPEX screen, and because dropping the separator instead would turn a pasted 12.5 into 125.
 * A value that is still mid-typing ("12.") keeps its trailing separator so the cell does not
 * fight the person typing; it carries no fractional part yet, and the next keystroke settles it.
 *
 * Both locales' conventions are accepted, since a paste comes from whatever the user's Excel
 * uses: the LAST separator followed by one or two digits is the decimal point and the rest is
 * thousands grouping, so "1.234,56" and "1,234.56" both read as 1235, and "1.234" as 1234.
 */
export function wholeNumberCell(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  // Anything that is not a figure is cleared, exactly as the old `^[0-9.]*$` test did.
  if (!/^[\d.,\s]+$/.test(value)) return "";
  if (/^\d*[.,]$/.test(value)) return value;

  const cleaned = value.replace(/\s/g, "");
  const lastSeparator = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  const digits = (s: string) => s.replace(/[.,]/g, "");
  const normalized = lastSeparator >= 0 && /^\d{1,2}$/.test(cleaned.slice(lastSeparator + 1))
    ? `${digits(cleaned.slice(0, lastSeparator))}.${cleaned.slice(lastSeparator + 1)}`
    : digits(cleaned);

  const n = Number(normalized);
  return Number.isFinite(n) ? String(Math.round(n)) : "";
}

function getRowEditable(rowIndex: number, row: SheetCell[] | undefined): boolean {
  if (rowIndex === 0) return true;
  const firstCellValue = row?.[0]?.value;
  const secondCellValue = row?.[1]?.value;
  const descriptionValue = row?.[2]?.value ?? "";

  if (descriptionValue.toLowerCase().includes("standard")) return true;
  if (firstCellValue && secondCellValue) return true;
  return false;
}

function getRowClassName(rowIndex: number, row: SheetCell[] | undefined): string {
  const firstCellValue = row?.[0]?.value;
  const secondCellValue = row?.[1]?.value;
  if (rowIndex === 0) return "header";
  if (firstCellValue && secondCellValue) return "filled-row";
  return "empty-row";
}

/** Every row `decorateRow` produced. A row Add Row inserted is not one of them until an edit dresses it. */
const dressedRows = new WeakSet<SheetCell[]>();

/**
 * Row colouring and editability for one row. Both depend on that row's own cells only, so a row
 * whose values did not change keeps the dressing it already has (`handleChange` relies on this).
 */
function decorateRow(row: SheetCell[], rowIndex: number): SheetCell[] {
  if (rowIndex === 0) return row.map((cell) => ({ ...cell, readOnly: true, className: "header" }));
  const className = getRowClassName(rowIndex, row);
  const readOnly = getRowEditable(rowIndex, row);
  const dressed = row.map((cell, j) => ({
    ...cell,
    className,
    readOnly,
    ...(j === 3 ? { DataEditor: DropdownEditor } : {}),
    ...(j === 4 || j === 5 ? { DataEditor: YesNoEditor } : {}),
  }));
  dressedRows.add(dressed);
  return dressed;
}

/**
 * Row colouring and editability, applied to EVERY cell of a grid.
 *
 * This used to live inside `handleChange` alone, so the sheet was dressed only once the user
 * typed something: it opened with every row white and fully editable, and the account and
 * subaccount rows turned grey and locked on the first keystroke. Seeding the state through
 * the same function makes the first render agree with every render after it.
 */
export function decorateGrid(grid: SheetGrid): SheetGrid {
  return grid.map((row, i) => (row ? decorateRow(row, i) : row));
}

/** `handleChange`'s cell rules for one data row: the dropdown columns snap to their options, the months to whole numbers. */
function sanitizeRow(row: SheetCell[], rowIndex: number): SheetCell[] {
  const rowID = generateRowID(rowIndex);
  return row.map((cellIn, colIndex) => {
    const cell = cellIn ?? { value: "" };
    let value = cell.value ?? "";

    if (colIndex === 3) {
      const options = ["DevCo", "SPV"];
      const match = options.find((o) => o.trim().toLowerCase() === value.trim().toLowerCase());
      value = match ?? "";
    }
    if (colIndex === 4 || colIndex === 5) {
      const options = ["Yes", "No"];
      const match = options.find((o) => o.trim().toLowerCase() === value.trim().toLowerCase());
      value = match ?? "";
    }
    if (colIndex > 5) {
      value = wholeNumberCell(value);
    }

    return { value, Row_ID: rowID };
  });
}

/**
 * The library's row would look and behave exactly like ours: same values, same dressing and the
 * same editors. Used to tell whether react-spreadsheet already shows what `handleChange` produced.
 */
function sameCells(ours: readonly SheetCell[], theirs: readonly (SheetCell | undefined)[] | undefined): boolean {
  if (!theirs || ours.length !== theirs.length) return false;
  for (let i = 0; i < ours.length; i++) {
    const a = ours[i];
    const b = theirs[i];
    if (!a || !b) return false;
    if (a.value !== b.value || a.className !== b.className || a.readOnly !== b.readOnly
      || a.DataEditor !== b.DataEditor || a.DataViewer !== b.DataViewer) return false;
  }
  return true;
}

/** Same length, and every cell holds the same value. */
function sameValues(a: readonly SheetCell[], b: readonly SheetCell[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i]?.value ?? "") !== (b[i]?.value ?? "")) return false;
  }
  return true;
}

/**
 * Fills down Account Number/Name from the nearest row above that has them, skips rows whose
 * Description is exactly "*Account*" (pure header/label rows), assigns Row_ID grouping.
 *
 * Works on COPIES — `gridToJson` clones every cell before handing them over — so this shapes
 * the save payload without writing the filled-down account number back into the sheet.
 */
function sanitizeSpreadsheetData(costDes: SheetCell[][]): SheetCell[][] {
  const returningData: SheetCell[][] = [];

  let name = "";
  let number = "";
  let rowIDCounter = 1;

  costDes.forEach((item) => {
    const col0 = item[0];
    const col1 = item[1];
    const col2 = item[2];
    if (!col0 || !col1 || !col2) return;

    const accNo = (col0.value ?? "").toString();
    const accName = (col1.value ?? "").toString();

    if (accName.length !== 0 || accNo.length !== 0) {
      col2.value = "";
    }

    if (col2.value.length === 0 || accName.length !== 0 || accNo.length !== 0) {
      rowIDCounter++;
    }
    const currentRowID = `Row_${rowIDCounter}`;

    if (!col2.value.includes("*Account*")) {
      if (accName !== "") name = accName;
      if (accNo !== "") number = accNo;

      col0.Row_ID = currentRowID;

      if ((col0.value ?? "").toString() === "") col0.value = number;
      if ((col1.value ?? "").toString() === "") col1.value = name;

      if (col2.value !== "") {
        returningData.push(item);
      }
    }
  });

  return returningData;
}

const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The `onDataChange` payload shape: one flat row object per (row, year). */
export interface SpreadsheetOutputRow {
  Number: string;
  Name: string;
  Description: string;
  CostPaidBy: string;
  Depreciation: string;
  ApplyVAT: string;
  Row_ID: string;
  Year: string;
  [month: string]: string;
}

/** Unpivots the month-block columns (6+, 12 per year) back into one row per year. */
export function gridToJson(grid: SheetGrid, startYear: string): SpreadsheetOutputRow[] {
  /*
   * `sanitizeSpreadsheetData` writes to the first three cells of a row only (Number, Name,
   * Description, and Row_ID on the first), so only those are copied; every other cell is read
   * straight from the grid, through the same `value || ""` the copy used to apply. Copying all
   * ~126 cells of every row was most of this function's time, and it runs on every edit.
   */
  const rows = grid.slice(1).map((row) => row.map((cell, j) => (
    j < 3 ? { ...cell, value: cell.value || "" } : cell
  )));
  const sanitized = sanitizeSpreadsheetData(rows);
  const jsonData: SpreadsheetOutputRow[] = [];
  const valueOf = (cell: SheetCell | undefined): string => (cell ? cell.value || "" : "");

  sanitized.forEach((row) => {
    const baseRow = {
      Number: row[0]?.value ?? "",
      Name: row[1]?.value ?? "",
      Description: row[2]?.value ?? "",
      CostPaidBy: valueOf(row[3]),
      Depreciation: valueOf(row[4]),
      ApplyVAT: valueOf(row[5]),
      Row_ID: row[0]?.Row_ID ?? "",
      Year: "",
    };

    const yearChunks = Math.ceil((row.length - 6) / 12);
    for (let i = 0; i < yearChunks; i++) {
      const start = 6 + i * 12;
      const end = start + 12;
      const yearData = row.slice(start, end);
      const newRow: SpreadsheetOutputRow = { ...baseRow, Year: String(Number(startYear) + i) };
      yearData.forEach((cell, cellIndex) => {
        const key = MONTH_KEYS[cellIndex];
        if (key) newRow[key] = valueOf(cell);
      });
      jsonData.push(newRow);
    }
  });

  return jsonData;
}

/**
 * The rows and columns `WindowedRow` draws with their cells (D140, `rowWindow.ts`), the active
 * cell (always drawn), and the column widths `SizedTable` pins (`columnWidths.ts`; the row-number
 * column first). `null` widths: the table's own automatic layout, as before, and every column drawn.
 */
const RowWindowContext = React.createContext<{
  window: RowWindow; columns: ColumnWindow | null; active: Point | null; columnWidths: number[] | null;
} | null>(null);

/** Everything drawn (`drawAllRows`). */
const ALL_ROWS: RowWindow = { first: 0, last: Number.MAX_SAFE_INTEGER, rowHeight: DEFAULT_ROW_HEIGHT };

/**
 * react-spreadsheet's `Table` (same markup), with the column widths pinned once they are known.
 * Its stylesheet already asks for `table-layout: fixed`, which takes effect once the table has a
 * width: the widths no longer depend on which rows are drawn, and laying the table out is cheaper.
 */
function SizedTable({ children, columns, hideColumnIndicators }: TableProps) {
  const ctx = React.useContext(RowWindowContext);
  const count = columns + (hideColumnIndicators ? 0 : 1);
  const widths = ctx?.columnWidths && ctx.columnWidths.length === count ? ctx.columnWidths : null;
  return (
    <table className="Spreadsheet__table" style={widths ? { width: widths.reduce((a, b) => a + b, 0) } : undefined}>
      <colgroup>
        {Array.from({ length: count }, (_, i) => <col key={i} style={widths ? { width: widths[i] } : undefined} />)}
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  );
}

/**
 * The fonts, padding and minimum width of the cells as drawn, read once from the first drawn
 * table: the header row is bold, the others are not. `null` without layout (jsdom), where the
 * table keeps its automatic layout.
 */
function readColumnMetrics(box: HTMLElement): (ColumnMetrics & { rowNumberWidth: number }) | null {
  if (box.clientHeight === 0) return null;
  const headerText = box.querySelector<HTMLElement>("td.header .Spreadsheet__data-viewer");
  const bodyText = box.querySelector<HTMLElement>("td.empty-row .Spreadsheet__data-viewer, td.filled-row .Spreadsheet__data-viewer");
  const corner = box.querySelector<HTMLElement>(".Spreadsheet__table > tbody > tr > th");
  const cell = bodyText?.parentElement;
  const canvas = document.createElement("canvas").getContext("2d");
  if (!headerText || !bodyText || !corner || !cell || !canvas) return null;
  const px = (v: string) => parseFloat(v) || 0;
  const fontOf = (el: HTMLElement) => {
    const s = getComputedStyle(el);
    return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  };
  const headerFont = fontOf(headerText);
  const bodyFont = fontOf(bodyText);
  const text = getComputedStyle(bodyText);
  const td = getComputedStyle(cell);
  return {
    textWidth: (value, header) => {
      canvas.font = header ? headerFont : bodyFont;
      return canvas.measureText(value).width;
    },
    // Collapsed borders: a column carries half of each of its two borders.
    cellExtra: px(text.paddingLeft) + px(text.paddingRight) + px(td.paddingLeft) + px(td.paddingRight)
      + (px(td.borderLeftWidth) + px(td.borderRightWidth)) / 2,
    minWidth: px(td.minWidth),
    rowNumberWidth: corner.getBoundingClientRect().width,
  };
}

/**
 * react-spreadsheet's `Row`, drawing a row's cells only while it is in the window (or holds the
 * active cell). Any other row is an empty row of the drawn rows' height: its cells are never
 * mounted, so they hold no state subscription and no DOM, and the table keeps its full height.
 * Within a drawn row, once the column widths are pinned, only the columns in the window (and the
 * active cell's) are drawn; each stretch of other columns is one empty cell spanning them.
 * The grid's DATA is untouched: selection, keyboard moves, copy, paste and every read-back still
 * see every row, with the same coordinates as when every row was drawn.
 */
function WindowedRow({ row, children }: RowProps) {
  const ctx = React.useContext(RowWindowContext);
  if (!ctx) return <tr>{children}</tr>;
  if (!rowDrawn(ctx.window, row, ctx.active?.row ?? null)) {
    return <tr className="Spreadsheet__row--placeholder" style={{ height: ctx.window.rowHeight }} />;
  }
  if (!ctx.columns) return <tr>{children}</tr>;
  // The row-number cell, then one cell per grid column (react-spreadsheet's order).
  const [rowNumber, ...cells] = React.Children.toArray(children);
  const runs = columnRuns(cells.length, ctx.columns, ctx.active?.column ?? null);
  return (
    <tr>
      {rowNumber}
      {runs.map((run) => (run.drawn
        ? cells[run.from]
        : <td key={`gap-${run.from}`} className="Spreadsheet__cell-placeholder" colSpan={run.to - run.from + 1} />))}
    </tr>
  );
}

/**
 * Memoized: the screen re-renders on every read-back (validation banner, Save state), and none of
 * that concerns the grid. Its props change only on a new load or a toolbar press, provided the
 * caller hands a stable `onDataChange`.
 */
export const SpreadSheetComp = React.memo(function SpreadSheetComp({
  data: initialData,
  onDataChange,
  onAddRow, onDeleteRow, onCopyTable,
  addRowToken, deleteRowToken, copyTableToken, visibleYearIndex = null, drawAllRows = false,
}: ISpreadSheetProps) {
  /*
   * `data` is the sheet: what `onDataChange`, Copy Table, Add Row and Delete Row work on. `shown` is
   * the grid last HANDED to react-spreadsheet. They differ only after an edit the library already
   * shows exactly as `handleChange` would (see there); every other update sets both.
   */
  const [sheet, setSheet] = React.useState(() => {
    const seeded = decorateGrid(initialData);
    return { data: seeded, shown: seeded };
  });
  const data = sheet.data;
  const setData = React.useCallback((next: SheetGrid | ((prev: SheetGrid) => SheetGrid)) => {
    setSheet((s) => {
      const grid = typeof next === "function" ? next(s.data) : next;
      return { data: grid, shown: grid };
    });
  }, []);
  const selectedRowIndexRef = React.useRef<number | null>(null);
  const selectedCtorRef = React.useRef<string>("");
  /** Rows `handleChange`'s cell rules have already run on: running them again changes nothing. */
  const cleanRows = React.useRef(new WeakSet<SheetCell[]>());
  /*
   * The Add Row / Delete Row / Copy Table token each effect last acted on: an effect acts only when its token
   * CHANGED (a button press). The PCF's "skip the first run" flags (`hasMountedRef`) failed under React
   * StrictMode, which runs every effect twice when the sheet mounts in development: the second run found the
   * flag set and fired a phantom Add Row (a blank "Yes / Yes" row after the last one), a phantom Delete Row
   * (nothing selected, so the sheet's original LAST row went: 84001_0, 85002 *Account*, user screenshots
   * 18 Nov 2026) and a phantom Copy Table (the whole sheet on the clipboard).
   */
  const handledTokensRef = React.useRef({ add: addRowToken, del: deleteRowToken, copy: copyTableToken });
  // Bug 15333: an Excel row pasted as one row, not as that row plus an empty one.
  const gridRef = React.useRef<HTMLDivElement>(null);
  useTrimmedGridPaste(gridRef);

  /*
   * Re-hydrate whenever the caller supplies a genuinely new initial grid (e.g. after load).
   *
   * Not for the grid the state was just seeded with: on mount this used to decorate the same
   * grid a second time, which handed react-spreadsheet a new `data` reference (a full rebuild
   * of a ~190,000-cell table) and fired `onDataChange` twice — two more full read-backs of the
   * sheet. The content was identical every time; only the work was repeated.
   */
  const seededFrom = React.useRef(initialData);
  React.useEffect(() => {
    if (initialData === seededFrom.current) return;
    seededFrom.current = initialData;
    setData(decorateGrid(initialData));
    // Only when the reference itself changes — the caller controls that by memoizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const width = data[0]?.length ?? 0;
  const columns = React.useMemo(() => viewColumns(width, visibleYearIndex), [width, visibleYearIndex]);
  // The visible slice. Its cells ARE the full grid's cells, so a view costs one array per row, not a copy.
  const viewData = React.useMemo(
    () => (columns ? toView(sheet.shown, columns) : sheet.shown),
    [sheet.shown, columns],
  );
  /*
   * The rows react-spreadsheet holds right now: the grid last handed to it, or, after an edit it
   * already shows correctly, the matrix it reported. A row it hands back as the SAME array is a
   * row the change did not touch.
   */
  const libraryRows = React.useRef<Matrix<SheetCell>>(viewData);
  React.useLayoutEffect(() => { libraryRows.current = viewData; }, [viewData]);

  const handleChange = React.useCallback(
    (newDataArg: Matrix<SheetCell>) => {
      // An edit made in a one-year view is written back into the full-width grid first; every rule below then sees the whole sheet.
      const newDataIn = (columns
        ? fromView<SheetCell>(newDataArg as (SheetCell[] | undefined)[], data, columns, width, () => ({ value: "" }))
        : newDataArg) as SheetGrid;
      if (!Array.isArray(newDataIn) || newDataIn.length === 0) return;

      const headerRow = data[0] ?? [];
      const wholeSheet = selectedCtorRef.current === "EntireWorksheetSelection";
      const normalize = (row: SheetCell[] | undefined): SheetCell[] => {
        if (!row) return headerRow.map(() => ({ value: "" }) as SheetCell);
        return row.map((cell) => (cell !== undefined ? cell : ({ value: "" } as SheetCell)));
      };
      const newData = newDataIn.map(normalize);

      /*
       * Only the rows this change touched are rebuilt; every other row keeps its EXISTING array and
       * cell objects. react-spreadsheet re-renders a cell when its cell object changes, so
       * rebuilding all ~28,000 cells (as this used to, through `decorateGrid` on the whole grid)
       * re-rendered every drawn cell on every keystroke. A row's rules and dressing depend on that
       * row alone, so a row is reused when the library handed it back untouched (same array) and
       * its cell rules have already run on it (`cleanRows`), or when running them changes no value
       * on a row that is already dressed. The first edit therefore still applies the rules to every
       * row, exactly as before, and a row Add Row inserted is dressed on the next edit, as before.
       */
      let sanitizedData: SheetGrid = newData.map((row, rowIndex) => {
        if (rowIndex === 0) return headerRow;

        const previous = data[rowIndex];
        const checkReadOnly = previous?.[0]?.readOnly === true;

        if (!wholeSheet && checkReadOnly && previous) return previous;

        if (!wholeSheet && previous && newDataArg[rowIndex] === libraryRows.current[rowIndex]
          && cleanRows.current.has(previous)) {
          return previous;
        }

        const sanitized = sanitizeRow(row, rowIndex);
        if (!wholeSheet && previous && dressedRows.has(previous) && sameValues(sanitized, previous)) {
          cleanRows.current.add(previous);
          return previous;
        }
        const decorated = decorateRow(sanitized, rowIndex);
        cleanRows.current.add(decorated);
        return decorated;
      });

      if (wholeSheet) {
        const valuesEqual = (a: SheetCell[] = [], b: SheetCell[] = []) => {
          const len = Math.max(a.length, b.length);
          for (let i = 0; i < len; i++) {
            const av = String(a[i]?.value ?? "");
            const bv = String(b[i]?.value ?? "");
            if (av !== bv) return false;
          }
          return true;
        };

        let lastChangedRow = 0;
        for (let ri = 1; ri < sanitizedData.length; ri++) {
          const changed = !valuesEqual(newData[ri], data[ri]);
          if (changed) {
            lastChangedRow = ri;
          } else {
            const fallback = data[ri] ?? sanitizedData[ri];
            if (fallback) sanitizedData[ri] = fallback;
          }
        }

        if (lastChangedRow === 0) {
          sanitizedData = data;
        } else {
          sanitizedData = sanitizedData.slice(0, lastChangedRow + 1);
          sanitizedData[0] = headerRow;
        }
      }

      /*
       * Handing the result back to react-spreadsheet makes it reload the whole sheet: it rebuilds
       * its model of every cell and rechecks every drawn cell's state. When the library already
       * shows exactly what the rules produced, the common case
       * while typing a figure, the sheet is updated without handing it back; the next change is
       * then compared against the library's own rows.
       */
      const alreadyShown = !columns && !wholeSheet && sanitizedData.every((row, r) => (
        // Untouched by the library AND kept as it was: the library still shows it. A row the rules
        // just rewrote (the first edit rounds stored decimals everywhere) is compared like any other.
        (newDataArg[r] === libraryRows.current[r] && row === data[r]) || sameCells(row, newDataArg[r])
      ));
      if (alreadyShown) {
        libraryRows.current = newDataArg;
        setSheet((s) => ({ data: sanitizedData, shown: s.shown }));
      } else {
        setData(sanitizedData);
      }
    },
    [data, columns, width, setData],
  );

  const handleSelect = React.useCallback(
    (selection: {
      normalizeTo?: (d: SheetGrid) => { toRange?: (d: SheetGrid) => unknown } | undefined;
      toRange?: (d: SheetGrid) => unknown;
      range?: unknown;
    }) => {
      type PointRange = { start: { row: number; column: number }; end: { row: number; column: number } };
      const range = (selection?.normalizeTo?.(viewData)?.toRange?.(viewData)
        ?? selection?.toRange?.(viewData)
        ?? selection?.range
        ?? null) as PointRange | null;

      if (!range?.start || !range?.end) {
        selectedCtorRef.current = "OtherSelection";
        return;
      }

      const sr = range.start.row;
      const sc = range.start.column;
      const er = range.end.row;
      const ec = range.end.column;

      // Selection coordinates are the VIEW's: "the whole worksheet" means every visible column.
      const lastRow = viewData.length - 1;
      const lastCol = (viewData[0]?.length ?? 1) - 1;

      const isFullWidth = sc === 0 && ec === lastCol;
      const isEntireWorksheet = isFullWidth && (sr === 0 || sr === 1) && er === lastRow;
      const isEntireRows = isFullWidth && !isEntireWorksheet;

      selectedCtorRef.current = isEntireWorksheet
        ? "EntireWorksheetSelection"
        : isEntireRows
          ? "EntireRowsSelection"
          : "OtherSelection";

      selectedRowIndexRef.current = er;
    },
    [viewData],
  );

  // onDataChange fires whenever the sheet's data settles (mirrors the PCF's OnSave-timer trigger,
  // but here it fires on every change since there's no PCF one-way-binding round trip to avoid).
  React.useEffect(() => {
    onDataChange(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Copy Table: whole grid as tab/newline-separated text to the clipboard.
  React.useEffect(() => {
    if (copyTableToken === handledTokensRef.current.copy) return;
    handledTokensRef.current.copy = copyTableToken;
    const text = data.map((row) => row.map((cell) => cell.value).join("\t")).join("\n");
    navigator.clipboard.writeText(text).then(() => "").catch(() => "");
    onCopyTable?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyTableToken]);

  // Add Row: insert after the currently-selected row, with Depreciation / Apply VAT "Yes" and Cost Paid By BLANK.
  // The PCF source looks the nearest account up in the DevCo/SPV mapping; the user's canvas screenshot shows new
  // rows with Cost Paid By empty, and the user wants it so (18 Nov 2026: "SPV should not be selected by default
  // when adding a new row"). Save's missing-information check (`validateMissingMetadata`, as the canvas) makes
  // them pick one.
  React.useEffect(() => {
    if (addRowToken === handledTokensRef.current.add) return;
    handledTokensRef.current.add = addRowToken;

    const selectedRowIndex = selectedRowIndexRef.current !== null ? selectedRowIndexRef.current : data.length - 1;

    const newRowId = generateRowID(data.length);
    const columnCount = data[0]?.length ?? 0;
    const newRow: SheetCell[] = Array(columnCount)
      .fill(null)
      .map((_, colIndex) => {
        let v = "";
        if (colIndex === 4 || colIndex === 5) v = "Yes";
        if (colIndex === 0 || colIndex === 1 || colIndex === 6) v = "";

        const cell: SheetCell = { value: v, Row_ID: newRowId, readOnly: false };
        if (colIndex === 3) cell.DataEditor = DropdownEditor;
        else if (colIndex === 4 || colIndex === 5) cell.DataEditor = YesNoEditor;
        return cell;
      });

    setData((prevData) => {
      const updated = [...prevData];
      updated.splice(selectedRowIndex + 1, 0, newRow);
      return updated;
    });
    selectedRowIndexRef.current = null;
    onAddRow?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRowToken]);

  // Delete Row: remove the currently-selected row.
  React.useEffect(() => {
    if (deleteRowToken === handledTokensRef.current.del) return;
    handledTokensRef.current.del = deleteRowToken;
    if (data.length > 1) {
      const selectedRowIndex = selectedRowIndexRef.current !== null ? selectedRowIndexRef.current : data.length - 1;
      setData((prevData): SheetGrid => [
        ...prevData.slice(0, selectedRowIndex),
        ...prevData.slice(selectedRowIndex + 1),
      ]);
    }
    onDeleteRow?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteRowToken]);

  const rowCount = viewData.length;
  const rowCountRef = React.useRef(rowCount);
  React.useLayoutEffect(() => { rowCountRef.current = rowCount; }, [rowCount]);

  /*
   * Column widths from every row (`columnWidths.ts`), so they do not change with the rows drawn.
   * Worked out before the first paint, then again once an edit has settled (a longer description
   * widens its column, as the automatic layout did, a moment after typing instead of per key).
   */
  const [columnWidths, setColumnWidths] = React.useState<number[] | null>(null);
  const columnWidthsRef = React.useRef<number[] | null>(null);
  React.useLayoutEffect(() => { columnWidthsRef.current = drawAllRows ? null : columnWidths; }, [columnWidths, drawAllRows]);
  const metricsRef = React.useRef<ReturnType<typeof readColumnMetrics>>(null);
  const widthGrid = React.useMemo(() => (columns ? toView(data, columns) : data), [data, columns]);
  const measureColumns = React.useCallback((grid: SheetGrid) => {
    const box = gridRef.current;
    if (!box) return;
    metricsRef.current ??= readColumnMetrics(box);
    const m = metricsRef.current;
    if (!m) return;
    const next = [m.rowNumberWidth, ...columnWidthsFor(grid, m)];
    setColumnWidths((prev) => (sameWidths(prev, next) ? prev : next));
  }, []);
  const measuredOnce = React.useRef(false);
  React.useLayoutEffect(() => {
    if (drawAllRows) return undefined;
    if (!measuredOnce.current) {
      measuredOnce.current = true;
      measureColumns(widthGrid);
      return undefined;
    }
    const timer = setTimeout(() => measureColumns(widthGrid), 250);
    return () => clearTimeout(timer);
  }, [widthGrid, drawAllRows, measureColumns]);

  /*
   * D140: only the rows and columns in view (plus an overscan each side, `rowWindow.ts`) are
   * drawn with their cells; columns only once their widths are pinned. "In view" is the part of
   * the table inside every box above it that clips (this grid's own scroll box, the screen's
   * `.add-cost-table-grid`, the panel) and inside the window, so it is right whichever of them
   * actually scrolls. Heights are measured from the drawn table: the column-letter row, and a
   * drawn data row (every row is one line, `1.9em`).
   */
  const [cellWindow, setCellWindow] = React.useState<{ rows: RowWindow; columns: ColumnWindow | null }>(
    () => ({ rows: rowWindowFor(0, 0, 0, DEFAULT_ROW_HEIGHT, rowCount), columns: null }),
  );
  const rowHeightRef = React.useRef(DEFAULT_ROW_HEIGHT);
  const updateCellWindow = React.useCallback((scrolled = false) => {
    const box = gridRef.current;
    if (!box) return;
    const rows = box.querySelectorAll<HTMLTableRowElement>(".Spreadsheet__table > tbody > tr");
    // Exact (fractional) heights: a row is `1.9em`, 30.4 px at 16 px, and an empty row drawn 0.4 px
    // short would move every row below it by 0.4 px per empty row above.
    const headerHeight = rows[0]?.getBoundingClientRect().height ?? 0;
    for (let i = 1; i < rows.length; i++) {
      const tr = rows[i];
      if (tr && tr.cells.length > 0) {
        const height = tr.getBoundingClientRect().height;
        if (height > 0) rowHeightRef.current = height;
        break;
      }
    }
    const table = box.querySelector<HTMLElement>(".Spreadsheet__table");
    let top = 0;
    let bottom = window.innerHeight;
    let left = 0;
    let right = window.innerWidth;
    for (let el: HTMLElement | null = box; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
      const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
      if (!clipsX && !clipsY) continue;
      const r = el.getBoundingClientRect();
      if (clipsY) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
      if (clipsX) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
    }
    // How far the visible band starts below / right of the table's corner: the scroll offsets,
    // whichever box scrolls. No layout at all (jsdom): no band, so the fallback window applies.
    const tableRect = box.clientHeight > 0 ? table?.getBoundingClientRect() : undefined;
    if (!tableRect) { bottom = top; right = left; }
    const nextRows = rowWindowFor(
      tableRect ? top - tableRect.top : 0, Math.max(0, bottom - top), headerHeight, rowHeightRef.current, rowCountRef.current,
    );
    const widths = columnWidthsRef.current;
    const nextColumns = widths && tableRect ? columnWindowFor(left - tableRect.left, Math.max(0, right - left), widths) : null;
    const apply = () => setCellWindow((prev) => (
      sameRowWindow(prev.rows, nextRows) && sameColumnWindow(prev.columns, nextColumns)
        ? prev : { rows: nextRows, columns: nextColumns }));
    /*
     * A scroll draws the cells it brings in as a transition: React builds them in slices between
     * frames and a newer scroll replaces a window not yet drawn. The cells round the active cell
     * are always drawn, so typing and the arrow keys never wait for this.
     */
    if (scrolled) React.startTransition(apply);
    else apply();
  }, []);
  React.useLayoutEffect(() => { updateCellWindow(); }, [updateCellWindow, rowCount, columnWidths]);
  React.useEffect(() => {
    const box = gridRef.current;
    if (!box) return undefined;
    // `scroll` does not bubble; captured on the document it is seen from any box, the grid's own included.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && (event.target === document || event.target.contains(box))) updateCellWindow(true);
    };
    const onResize = () => updateCellWindow();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => updateCellWindow());
    observer?.observe(box);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [updateCellWindow]);
  /*
   * The active cell is always drawn: a cell activated by the keyboard outside the window is
   * mounted at once, focuses itself, and the browser scrolls it into view as before.
   */
  const [active, setActive] = React.useState<Point | null>(null);
  const onActivate = React.useCallback((point: Point) => setActive(point), []);
  const onBlur = React.useCallback(() => setActive(null), []);

  const windowContext = React.useMemo(() => ({
    window: drawAllRows ? ALL_ROWS : cellWindow.rows,
    columns: drawAllRows ? null : cellWindow.columns,
    active,
    columnWidths: drawAllRows ? null : columnWidths,
  }), [cellWindow, active, columnWidths, drawAllRows]);

  /*
   * The grid element only changes with the grid handed to it: re-rendering react-spreadsheet
   * makes it rebuild its model and recheck every cell's state, so an update that does not hand it
   * a new grid must not render it. The handlers are stable wrappers around the latest closures.
   */
  const handleChangeRef = React.useRef(handleChange);
  const handleSelectRef = React.useRef(handleSelect);
  React.useLayoutEffect(() => {
    handleChangeRef.current = handleChange;
    handleSelectRef.current = handleSelect;
  });
  const onChange = React.useCallback((d: Matrix<SheetCell>) => handleChangeRef.current(d), []);
  const onSelect = React.useCallback(
    (selection: Parameters<typeof handleSelect>[0]) => handleSelectRef.current(selection),
    [],
  );
  const grid = React.useMemo(() => (
    <Spreadsheet
      key={columns ? "one-year" : "all-years"} data={viewData} Row={WindowedRow} Table={SizedTable}
      onChange={onChange} onSelect={onSelect} onActivate={onActivate} onBlur={onBlur}
    />
  ), [columns, viewData, onChange, onSelect, onActivate, onBlur]);

  return (
    <div ref={gridRef} style={{ height: "100%", width: "100%", overflow: "auto" }}>
      <RowWindowContext.Provider value={windowContext}>{grid}</RowWindowContext.Provider>
    </div>
  );
});

export { gridToJson as spreadsheetGridToJson };
