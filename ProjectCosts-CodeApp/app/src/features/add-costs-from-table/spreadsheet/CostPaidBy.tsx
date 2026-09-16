/**
 * Ported near-verbatim from the PCF's `SpreadSheet/CostPaidBy.tsx` — the `DataEditor` slot for
 * column 3 (Cost Paid By). A plain `<select>` with "Select...", "DevCo", "SPV".
 */
import type { DataEditorProps, CellBase } from "react-spreadsheet";

const dropdownOptions = ["DevCo", "SPV"];

const CostPaidByEditor = ({ cell, onChange }: DataEditorProps<CellBase>) => {
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

export default CostPaidByEditor;
