/**
 * Ported near-verbatim from the PCF's `SpreadSheet/YesNoDropDown.tsx` — the `DataEditor` slot
 * for columns 4-5 (Depreciation, Apply VAT). A plain `<select>` with "Select...", "Yes", "No".
 */
import type { DataEditorProps, CellBase } from "react-spreadsheet";

const dropdownOptions = ["Yes", "No"];

const YesNoEditor = ({ cell, onChange }: DataEditorProps<CellBase>) => {
  if (!cell) return null;

  return (
    <select
      value={cell.value}
      onChange={(e) => onChange({ ...cell, value: e.target.value })}
      style={{ width: "100%", border: "1px solid #ccc", height: "100%" }}
    >
      <option value="">Select...</option>
      {dropdownOptions.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
};

export default YesNoEditor;
