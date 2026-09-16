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
import Spreadsheet, { type CellBase, type DataEditorComponent, type Matrix } from "react-spreadsheet";
import "./MySpreadsheet.css";
import DropdownEditor from "./CostPaidBy";
import YesNoEditor from "./YesNoDropDown";
import { findNearestAccountHeaderRow } from "./util_dataset";

export interface SheetCell extends CellBase<string> {
  value: string;
  Row_ID?: string;
  DataEditor?: DataEditorComponent<CellBase<string>>;
}
export type SheetGrid = SheetCell[][];

type KeyedMap = Record<string, Record<string, unknown>>;

export interface ISpreadSheetProps {
  data: SheetGrid;
  onDataChange: (grid: SheetGrid) => void;
  /** Sub-account id (or account number) -> { vsb_devcospv } — used only to default a new row's Cost Paid By. */
  subaccountDataIn: KeyedMap[];
  onAddRow?: () => void;
  onDeleteRow?: () => void;
  onCopyTable?: () => void;
  /** Bump to trigger the add/delete/copy effects below — the callback props above are invoked, this is the trigger token. */
  addRowToken?: number;
  deleteRowToken?: number;
  copyTableToken?: number;
}

const generateRowID = (rowIndex: number) => `Row_${rowIndex + 1}`;

function getRowEditable(rowIndex: number, data: SheetGrid): boolean {
  if (rowIndex === 0) return true;
  const firstCellValue = data[rowIndex]?.[0]?.value;
  const secondCellValue = data[rowIndex]?.[1]?.value;
  const descriptionValue = data[rowIndex]?.[2]?.value ?? "";

  if (descriptionValue.toLowerCase().includes("standard")) return true;
  if (firstCellValue && secondCellValue) return true;
  return false;
}

function getRowClassName(rowIndex: number, data: SheetGrid): string {
  const firstCellValue = data[rowIndex]?.[0]?.value;
  const secondCellValue = data[rowIndex]?.[1]?.value;
  if (rowIndex === 0) return "header";
  if (firstCellValue && secondCellValue) return "filled-row";
  return "empty-row";
}

/**
 * Fills down Account Number/Name from the nearest row above that has them, skips rows whose
 * Description is exactly "*Account*" (pure header/label rows), assigns Row_ID grouping.
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
  const rows = grid.slice(1).map((row) => row.map((cell) => ({ ...cell, value: cell.value || "" })));
  const sanitized = sanitizeSpreadsheetData(rows);
  const jsonData: SpreadsheetOutputRow[] = [];

  sanitized.forEach((row) => {
    const baseRow = {
      Number: row[0]?.value ?? "",
      Name: row[1]?.value ?? "",
      Description: row[2]?.value ?? "",
      CostPaidBy: row[3]?.value ?? "",
      Depreciation: row[4]?.value ?? "",
      ApplyVAT: row[5]?.value ?? "",
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
        if (key) newRow[key] = cell?.value || "";
      });
      jsonData.push(newRow);
    }
  });

  return jsonData;
}

export const SpreadSheetComp: React.FC<ISpreadSheetProps> = ({
  data: initialData,
  onDataChange,
  subaccountDataIn,
  onAddRow, onDeleteRow, onCopyTable,
  addRowToken, deleteRowToken, copyTableToken,
}) => {
  const [data, setData] = React.useState<SheetGrid>(initialData);
  const selectedRowIndexRef = React.useRef<number | null>(null);
  const selectedCtorRef = React.useRef<string>("");
  const hasMountedRef = React.useRef({ add: false, del: false, copy: false });

  // Re-hydrate whenever the caller supplies a genuinely new initial grid (e.g. after load).
  React.useEffect(() => {
    setData(initialData);
    // Only when the reference itself changes — the caller controls that by memoizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const handleChange = React.useCallback(
    (newDataArg: Matrix<SheetCell>) => {
      const newDataIn = newDataArg as SheetGrid;
      if (!Array.isArray(newDataIn) || newDataIn.length === 0) return;

      const headerRow = data[0] ?? [];
      const newData = newDataIn.map((row) => {
        if (!row) return headerRow.map(() => ({ value: "" }) as SheetCell);
        return row.map((cell) => (cell !== undefined ? cell : ({ value: "" } as SheetCell)));
      });

      let sanitizedData: SheetGrid = newData.map((row, rowIndex) => {
        if (rowIndex === 0) {
          return headerRow.map((cell) => ({ ...cell, readOnly: true }));
        }

        const rowID = generateRowID(rowIndex);
        const checkReadOnly = data[rowIndex]?.[0]?.readOnly === true;

        if (selectedCtorRef.current !== "EntireWorksheetSelection" && checkReadOnly) {
          return data[rowIndex] ?? row;
        }

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
          if (colIndex > 5 && !/^[0-9.]*$/.test(value)) {
            value = "";
          }

          return { value, Row_ID: rowID };
        });
      });

      sanitizedData[0] = headerRow;

      for (let i = 0; i < sanitizedData.length; i++) {
        const sanitizedRow = sanitizedData[i];
        if (!sanitizedRow) continue;
        for (let j = 0; j < sanitizedRow.length; j++) {
          const existing = sanitizedRow[j];
          if (!existing) continue;
          sanitizedRow[j] = {
            ...existing,
            className: getRowClassName(i, sanitizedData),
            readOnly: i === 0 ? true : getRowEditable(i, sanitizedData),
            ...(j === 3 ? { DataEditor: DropdownEditor } : {}),
            ...(j === 4 || j === 5 ? { DataEditor: YesNoEditor } : {}),
          };
        }
      }

      if (selectedCtorRef.current === "EntireWorksheetSelection") {
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

      setData(sanitizedData);
    },
    [data],
  );

  const handleSelect = React.useCallback(
    (selection: {
      normalizeTo?: (d: SheetGrid) => { toRange?: (d: SheetGrid) => unknown } | undefined;
      toRange?: (d: SheetGrid) => unknown;
      range?: unknown;
    }) => {
      type PointRange = { start: { row: number; column: number }; end: { row: number; column: number } };
      const range = (selection?.normalizeTo?.(data)?.toRange?.(data)
        ?? selection?.toRange?.(data)
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

      const lastRow = data.length - 1;
      const lastCol = (data[0]?.length ?? 1) - 1;

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
    [data],
  );

  // onDataChange fires whenever the sheet's data settles (mirrors the PCF's OnSave-timer trigger,
  // but here it fires on every change since there's no PCF one-way-binding round trip to avoid).
  React.useEffect(() => {
    onDataChange(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Copy Table: whole grid as tab/newline-separated text to the clipboard.
  React.useEffect(() => {
    if (!hasMountedRef.current.copy) {
      hasMountedRef.current.copy = true;
      return;
    }
    const text = data.map((row) => row.map((cell) => cell.value).join("\t")).join("\n");
    navigator.clipboard.writeText(text).then(() => "").catch(() => "");
    onCopyTable?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyTableToken]);

  // Add Row: insert after the currently-selected row, prefilled Cost Paid By from the nearest
  // account's DevCo/SPV mapping, Depreciation/Apply VAT defaulted "Yes".
  React.useEffect(() => {
    if (!hasMountedRef.current.add) {
      hasMountedRef.current.add = true;
      return;
    }

    const selectedRowIndex = selectedRowIndexRef.current !== null ? selectedRowIndexRef.current : data.length - 1;
    const header = findNearestAccountHeaderRow(data, selectedRowIndex);
    const accountNumberKey = (header?.row?.[0]?.value ?? "").toString().trim();
    const devcoSpvStr = (subaccountDataIn?.[0]?.[accountNumberKey] as { vsb_devcospv?: unknown } | undefined)
      ?.vsb_devcospv?.toString().trim() ?? "";

    let costPaidBy = "";
    if (devcoSpvStr === "952850002") costPaidBy = "SPV";
    else if (devcoSpvStr === "952850001") costPaidBy = "DevCo";

    const newRowId = generateRowID(data.length);
    const columnCount = data[0]?.length ?? 0;
    const newRow: SheetCell[] = Array(columnCount)
      .fill(null)
      .map((_, colIndex) => {
        let v = "";
        if (colIndex === 3) v = costPaidBy;
        else if (colIndex === 4 || colIndex === 5) v = "Yes";
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
    if (!hasMountedRef.current.del) {
      hasMountedRef.current.del = true;
      return;
    }
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

  return (
    <div style={{ height: "100%", width: "100%", overflow: "auto" }}>
      <Spreadsheet data={data} onChange={handleChange} onSelect={handleSelect} />
    </div>
  );
};

export { gridToJson as spreadsheetGridToJson };
