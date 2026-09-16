/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/no-unsafe-argument
*/

import * as React from "react";
import { DataEditorProps, CellBase } from "react-spreadsheet";

const dropdownOptions = ["DevCo", "SPV"];

const DropdownEditor: React.FC<DataEditorProps<CellBase>> = ({
  cell,
  onChange,
}) => {
  if (!cell) return null;

  return (
    <select
      value={cell.value}
      onChange={(e) => onChange({ ...cell, value: e.target.value })} // ✅ Update logic
      style={{ width: "100%", border: "1px solid #ccc", height: "100%" }}
    >
      <option value="">Select...</option>
      {dropdownOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
};

export default DropdownEditor;
