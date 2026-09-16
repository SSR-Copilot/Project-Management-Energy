/* eslint-disable
 @typescript-eslint/no-unsafe-argument, @typescript-eslint/consistent-type-definitions,

  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/no-unsafe-argument
,
  @typescript-eslint/consistent-type-definitions,
  @typescript-eslint/prefer-nullish-coalescing,
  @typescript-eslint/no-base-to-string

*/
export enum cost_paid_by {
  SPV = 952850002,
  DevCoSPV = 952850001,
}


import * as React from "react";
import Spreadsheet, { DataEditor, DataEditorProps } from "react-spreadsheet";
import "./MySpreadsheet.css";
import DropdownEditor from "./CostPaidBy";
import YesNoEditor from "./YesNoDropDown";
import { findNearestAccountHeaderRow } from "./util_datset";


type RowObject = Record<string, unknown>;
type KeyedMap = Record<string, RowObject>;

export interface ISpreadSheetProps {
  initialData: { value: string }[][];
  Year: string;
  onCopy: boolean;
  OnSave: boolean;
  onDataChange: (data: string) => void;
  startingyear: string;
  completionyear: string;
  ShowCostEnabled: boolean;
  maxColumns: number;
  AddRow: boolean;
  DeleteRow: boolean;
  SubaccountDataIN: KeyedMap[]
  // dataDifference: { value: string }[][];
}

type DynamicRow = {
  Number: string;
  Name: string;
  Description: string;
  CostPaidBy: string; // New field
  Depreciation: string; // New field
  ApplyVAT: string; // New field
  Row_ID: string;
  Year: string;
  [key: string]: string;
};

export const SpreadSheetComp: React.FC<ISpreadSheetProps> = ({
  initialData,
  Year,
  onCopy,
  OnSave,
  onDataChange,
  ShowCostEnabled,
  maxColumns,
  AddRow,
  DeleteRow,
  SubaccountDataIN
}) => {
  //done till here
  const [data, setData] = React.useState(initialData);
  // const memoizedData = React.useMemo(() => data, [data]);
  const selectedRowIndexRef = React.useRef<number | null>(null);
  const selectedCtorRef = React.useRef<string>("");
  const [hasMounted, setHasMounted] = React.useState(false);
  const SUBACCOUNT_COL = 1;   // <-- put your actual subaccount column index
  const DATAEDITOR_COL = 6;   // <-- put your actual dataEditor column index


  // Helper to generate row IDs
  const generateRowID = (rowIndex: number) => `Row_${rowIndex + 1}`;

  const generateMonthLabels = (
    startMonth: number,
    year: string,
    count: number
  ) => {
    const labels = [];
    let month = startMonth;
    const years = [];
    let currentYear = Number(year);

    for (let i = 0; i < count; i++) {
      const monthString = month < 10 ? `0${month}` : `${month}`;
      labels.push(`${monthString}/${currentYear}`);
      years.push(`${currentYear}`);

      month++;
      if (month > 12) {
        month = 1;
        currentYear++;
      }
    }

    return { labels, years };
  };



  const handleChange = React.useCallback(
    
    (newData: any) => {
      if (!Array.isArray(newData) || newData.length === 0) {
        return;
      }


      // Ensure newData has a consistent structure
      
      newData = newData.map((row: any) => {
        if (!row) {
          return Array(data[0].length).fill({ value: "" }); // Replace undefined rows
        }
        
        return row.map((cell: any) =>
          cell !== undefined ? cell : { value: "" }
        ); // Replace undefined cells
      });


      let isValid = true;


      let sanitizedData = newData.map(
        (row: { value: string }[] = [], rowIndex: number) => {
          if (rowIndex === 0) {
            
            return data[0].map((cell: any) => ({
              ...cell,
              readOnly: true, // Prevents editing
            }));
          }

          const rowID = generateRowID(rowIndex);
          const isMainAccount = row[2]?.value === "*Account*";
          const isEmptyRow = row.every((cell) => !cell?.value);

          // if ((isMainAccount || isEmptyRow) && selectedCtorRef.current === "EntireRowsSelection") {
          //   return data[rowIndex] ?? row;
          // }

          const CheckReadOnly = (data?.[rowIndex]?.[0] as any)?.readOnly === true;

          if (
            selectedCtorRef.current !== "EntireWorksheetSelection" && CheckReadOnly
          ) { return data[rowIndex] ?? row; }
          


          // if (selectedCtorRef.current !== "EntireWorksheetSelection") {
          //   return data[rowIndex] ?? row; // default: keep old unless full worksheet selection
          // }





          return row.map(
            (cell: { value: string } = { value: "" }, colIndex: number) => {
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
                isValid = false;
              }

              return {
                value,
                Row_ID: rowID,
              };
            }
          );
        }
      );

      sanitizedData[0] = data[0];

      for (let i = 0; i < sanitizedData.length; i++) {
        for (let j = 0; j < sanitizedData[i].length; j++) {
          sanitizedData[i][j] = {
            ...sanitizedData[i][j],
            className: getRowClassName(i, sanitizedData),
            readOnly: i === 0 ? true : getRowEditable(i, sanitizedData),
            ...(j === 3 ? { DataEditor: DropdownEditor } : {}),
            ...(j === 4 || j === 5 ? { DataEditor: YesNoEditor } : {}),
          };
        }
      }

      if (selectedCtorRef.current === "EntireWorksheetSelection") {
        
        const valuesEqual = (a: any[] = [], b: any[] = []) => {
          const len = Math.max(a.length, b.length);
          for (let i = 0; i < len; i++) {
            const av = String(a[i]?.value ?? "");
            const bv = String(b[i]?.value ?? "");
            if (av !== bv) return false;
          }
          return true;
        };

        let lastChangedRow = 0; // 0 = only header

        for (let ri = 1; ri < sanitizedData.length; ri++) {
          const changed = !valuesEqual(newData[ri], data[ri]);

          if (changed) {
            lastChangedRow = ri;
          } else {
            // Row wasn't overwritten by paste → blank it out
            sanitizedData[ri] = data[ri] ?? sanitizedData[ri];

          }
        }

        // If nothing changed, don't wipe the grid
        if (lastChangedRow === 0) {
          sanitizedData = data;
        } else {
          // Trim to only pasted rows
          sanitizedData = sanitizedData.slice(0, lastChangedRow + 1);
          sanitizedData[0] = data[0]; // keep your header always
        }

        // COMMENT: CASE_1_CLEAR_UNCHANGED_ROWS_AND_TRIM
      }
      setData(sanitizedData);
    },
    [setData, data]
  );

  function getCellValueSafe(row: any[], colIndex: number): string {
    const v = row?.[colIndex]?.value;
    return (v ?? "").toString().trim();
  }

  const getRowEditable = (rowIndex: number, data: any) => {

    // const firstCellValue = data[rowIndex][0].value;
    // const secondCellValue = data[rowIndex][1].value;

    // if (rowIndex === 0) {
    //   return true; // Header row
    // } else if (firstCellValue && secondCellValue) {
    //   return true; // Grey background for filled rows
    // } else {
    //   return false; // White background for other rows
    // }

    if (rowIndex === 0) {
      return true; // Header row
    }

    const firstCellValue = data[rowIndex][0].value;
    const secondCellValue = data[rowIndex][1].value;
    const descriptionValue = data[rowIndex][2].value ?? "";

    // 🔒 If Description starts with "Standard" → make row non-editable
    if (descriptionValue.toLowerCase().includes("standard")) {
      return true;
    }

    if (firstCellValue && secondCellValue) {
      return true; // Grey background for filled rows
    } else {
      return false; // White background for other rows
    }
  };

  
  const getRowClassName = (rowIndex: number, data: any) => {
    const firstCellValue = data[rowIndex][0].value;
    const secondCellValue = data[rowIndex][1].value;

    if (rowIndex === 0) {
      return "header"; // Header row
    } else if (firstCellValue && secondCellValue) {
      return "filled-row"; // Grey background for filled rows
    } else {
      return "empty-row"; // White background for other rows
    }
  };

  React.useEffect(() => {
    const sanitizedData = data.map((row) =>
      row.map((cell) => ({ ...cell, value: cell.value || "" }))
    );

    const Fixed = [
      "Number",
      "Name",
      "Description",
      "Cost Paid By",
      "Depreciation",
      "Apply VAT",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const { years: yearLabels } = generateMonthLabels(
      1,
      Year,
      maxColumns - 6 // Adjusted for the new columns
    );
    const jsonData: DynamicRow[] = [];

    sanitizedData.shift(); // Remove header

    const Data = sanitizeSpreadsheetData(sanitizedData);
    

    Data.forEach((row) => {
      const baseRow: DynamicRow = {
        Number: row[0].value,
        Name: row[1].value,
        Description: row[2].value,
        CostPaidBy: row[3].value, // New field
        Depreciation: row[4].value, // New field
        ApplyVAT: row[5].value, // New field
        Row_ID: row[0].Row_ID,
        Year: "",
      };

      const yearChunks = Math.ceil((row.length - 6) / 12); // Adjusted for the new columns

      for (let i = 0; i < yearChunks; i++) {
        const start = 6 + i * 12; // Adjusted for the new columns
        const end = start + 12;
        const yearData = row.slice(start, end);

        const newRow: DynamicRow = { ...baseRow, Year: yearLabels[start] };

        yearData.forEach((cell: { value: string }, cellIndex: number) => {
          const key = Fixed[6 + cellIndex]; // Adjusted for the new columns
          newRow[key] = cell.value || "";
        });

        newRow.Year = String(Number(Year) + i);
        jsonData.push(newRow);
      }
    });

    onDataChange(JSON.stringify(jsonData));
  }, [OnSave]);

  React.useEffect(() => {
    if (!hasMounted) {
      // Set hasMounted to true after the first render
      setHasMounted(true);
      return; // Prevent the rest of the effect from running
    }
    const sanitizedData = data
      .map((row) => row.map((cell) => cell.value).join("\t"))
      .join("\n");
    navigator.clipboard
      .writeText(sanitizedData)
      .then(() => "")
      .catch(() => "");
  }, [onCopy]);

  React.useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true);
      return;
    }
    if (ShowCostEnabled) {
      setData(initialData);
    } else {
      setData(initialData);
    }
  }, [ShowCostEnabled]);

  
  // function sanitizeSpreadsheetData(CostDes: any[]) {
    
  //   const returningData: any[] = [];

  //   let Name = "";
  //   let Number = "";
  //   let currentRowID = ""; // Track the current Row_ID
  //   let rowIDCounter = 1; // Initialize Row_ID counter

  //   CostDes.forEach((item) => {
  //     if (item[1].value.length !== 0 || item[0].value.length !== 0) {
  //       item[2].value = "";
  //     }

  //     if (
  //       item[2].value.length === 0 ||
  //       item[1].value.length !== 0 ||
  //       item[0].value.length !== 0
  //     ) {
  //       rowIDCounter++;
  //     }
  //     currentRowID = `Row_${rowIDCounter}`;

  //     // If the row doesn't contain "*Account*" in the description
  //     if (!item[2].value.includes("*Account*")) {
  //       // Check if Name or Number has changed
  //       if (item[1].value !== Name || item[0].value !== Number) {
  //         Name = item[1].value ?? Name;
  //         Number = item[0].value ?? Number;
  //       }

  //       item[0].Row_ID = currentRowID;

  //       item[0].value = item[0].value ?? Number;
  //       item[1].value = item[1].value ?? Name;

  //       if (item[2].value !== "") {
  //         returningData.push(item);
  //       }
  //     }
  //   });

  //   return returningData;
  // }

  function sanitizeSpreadsheetData(CostDes: any[]) {
  const returningData: any[] = [];

  let Name = "";
  let Number = "";
  let currentRowID = "";
  let rowIDCounter = 1;

  CostDes.forEach((item) => {
    // Treat empty string as "missing" so we can fill-down header values on Save
    const accNo = (item?.[0]?.value ?? "").toString();
    const accName = (item?.[1]?.value ?? "").toString();

    // If user typed account info, clear description (your existing logic)
    if (accName.length !== 0 || accNo.length !== 0) {
      item[2].value = "";
    }

    if (item[2].value.length === 0 || accName.length !== 0 || accNo.length !== 0) {
      rowIDCounter++;
    }
    currentRowID = `Row_${rowIDCounter}`;

    // Skip account header rows
    if (!item[2].value.includes("*Account*")) {
      // Update trackers ONLY when non-empty
      if (accName !== "") Name = accName;
      if (accNo !== "") Number = accNo;

      item[0].Row_ID = currentRowID;

      // ✅ Fill-down Number/Name for detail rows (works even when value is "")
      if ((item?.[0]?.value ?? "").toString() === "") item[0].value = Number;
      if ((item?.[1]?.value ?? "").toString() === "") item[1].value = Name;

      if (item[2].value !== "") {
        returningData.push(item);
      }
    }
  });

  return returningData;
}



  React.useEffect(() => {
  if (!hasMounted) {
    setHasMounted(true);
    return;
  }

  const selectedRowIndex =
    selectedRowIndexRef.current !== null
      ? selectedRowIndexRef.current
      : data.length - 1;

  const anchorRow = data[selectedRowIndex];
  const header = findNearestAccountHeaderRow(data, selectedRowIndex);
console.log("This is header:",header)
  const accountNumberKey = (header?.row?.[0]?.value ?? "").toString().trim();
  // const subAccountValue = anchorRow?.[SUBACCOUNT_COL]?.value ?? "";
  // const dataEditorValue = anchorRow?.[DATAEDITOR_COL]?.value ?? "";
console.log("This is AccountNumberKey:",accountNumberKey)
  const devcoSpvStr = (SubaccountDataIN?.[0]?.[accountNumberKey]?.vsb_devcospv ?? "").toString().trim();

  console.log("DevCost:" ,devcoSpvStr);
  let costPaidBy = "";
  if (devcoSpvStr === "952850002") costPaidBy = "SPV";
  else if (devcoSpvStr === "952850001") costPaidBy = "DevCo";


  console.log("DevCost: after matching" ,costPaidBy);
  const newRowId = generateRowID(data.length);

  const newRow = Array(data[0].length)
    .fill(null)
    .map((_, colIndex) => {
      let v = "";
       
      if (colIndex === 3) v = costPaidBy;
      else if (colIndex === 4 || colIndex === 5) v = "Yes";


      if (colIndex === 0 || colIndex === 1 || colIndex===6) {
    v = "";
  }
      const cell: any = { value: v, Row_ID: newRowId,readOnly:false };

      // ✅ THIS is the missing piece (dropdown rendering)
      if (colIndex === 3) cell.DataEditor = DropdownEditor;
      else if (colIndex === 4 || colIndex === 5) cell.DataEditor = YesNoEditor;

      return cell;
    });
console.log("DevCost: New Row" ,newRow);
  setData((prevData) => {
    const updated = [...prevData];
    updated.splice(selectedRowIndex + 1, 0, newRow);
    return updated;
  });

  selectedRowIndexRef.current = null;
}, [AddRow]);



  React.useEffect(() => {
    if (!hasMounted) {
      // Set hasMounted to true after the first render
      setHasMounted(true);
      return; // Prevent the rest of the effect from running
    }
    if (data.length > 1) {
      const selectedRowIndex =
        selectedRowIndexRef.current !== null
          ? selectedRowIndexRef.current
          : data.length - 1;
      setData((prevData) => [
        ...prevData.slice(0, selectedRowIndex),
        ...prevData.slice(selectedRowIndex + 1),
      ]);
    }
  }, [DeleteRow]);

  const handleSelect = React.useCallback(
    (selection: any) => {
      // ✅ Always convert Selection -> PointRange using official API
      const range =
        selection?.normalizeTo?.(data)?.toRange?.(data) ??
        selection?.toRange?.(data) ??
        selection?.range ??
        null;

      if (!range?.start || !range?.end) {
        selectedCtorRef.current = "OtherSelection";
        console.log("selection debug (no range):", selection);
        return;
      }

      const sr = range.start.row;
      const sc = range.start.column;
      const er = range.end.row;
      const ec = range.end.column;

      const lastRow = data.length - 1;
      const lastCol = data[0].length - 1;

      const isFullWidth = sc === 0 && ec === lastCol;

      // If your row 0 is a readOnly header, allow sr===1 as "select all"
      const isEntireWorksheet =
        isFullWidth && (sr === 0 || sr === 1) && er === lastRow;

      const isEntireRows = isFullWidth && !isEntireWorksheet;

      selectedCtorRef.current = isEntireWorksheet
        ? "EntireWorksheetSelection"
        : isEntireRows
          ? "EntireRowsSelection"
          : "OtherSelection";

      selectedRowIndexRef.current = er;

      console.log("selection debug:", {
        mode: selectedCtorRef.current,
        ctorName: selection?.constructor?.name, // may be "t" in prod
        range: { sr, sc, er, ec },
        lastRow,
        lastCol,
      });
    },
    [data]
  );



  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        marginBottom: "10px",
        marginTop: "10px",
        marginLeft: "1px",
        marginRight: "1px",
      }}
    >
      <div style={{ marginBottom: "10px" }}>
        {/* <button onClick={handleAddRow}>Insert Row</button> */}
        {/* <button onClick={handleDeleteRow}>Delete Row</button> */}
      </div>
      <div style={{ height: "100%", width: "100%", overflow: "auto" }}>
        <Spreadsheet
          data={data}
          onChange={handleChange}
          onSelect={handleSelect}
        />
      </div>
      <br />
      Version 1.0.77
    </div>
  );
};
