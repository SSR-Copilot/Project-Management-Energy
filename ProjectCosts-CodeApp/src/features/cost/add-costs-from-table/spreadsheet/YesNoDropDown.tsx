/**
 * Ported near-verbatim from the PCF's `SpreadSheet/YesNoDropDown.tsx` — the `DataEditor` slot
 * for columns 4-5 (Depreciation, Apply VAT). A plain `<select>` with "Select...", "Yes", "No".
 */
import type { DataEditorProps, CellBase } from "react-spreadsheet";

const dropdownOptions = ["Yes", "No"];

/** Column header (aria-label) and test id for each grid column this editor serves. */
const DEPRECIATION_CAPTION = { label: "Depreciation", testId: "add-costs-depreciation" };
const COLUMN_CAPTIONS: Record<number, { label: string; testId: string }> = {
  4: DEPRECIATION_CAPTION,
  5: { label: "Apply VAT", testId: "add-costs-apply-vat" },
};

const YesNoEditor = ({ cell, column, onChange }: DataEditorProps<CellBase>) => {
  if (!cell) return null;
  const caption = COLUMN_CAPTIONS[column] ?? DEPRECIATION_CAPTION;

  return (
    <select
      aria-label={caption.label}
      data-testid={caption.testId}
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
