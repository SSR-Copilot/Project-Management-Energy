import { describe, expect, it } from "vitest";
import { columnWidthsFor, sameWidths, type ColumnMetrics } from "./columnWidths";

// 7 px per character, 10 px more in the (bold) header row; 11 px of padding and border; 96 px minimum.
const metrics: ColumnMetrics = {
  textWidth: (text, header) => text.length * 7 + (header ? 10 : 0),
  cellExtra: 11,
  minWidth: 96,
};

describe("columnWidthsFor (D140)", () => {
  it("UT-ADDCOST-COLW-001 the widest cell of EVERY row sets a column, never under the minimum", () => {
    const grid = [
      [{ value: "Account Number" }, { value: "Cost Description" }, { value: "01/2026" }],
      [{ value: "80000" }, { value: "*Account*" }, { value: "" }],
      [{ value: "" }, { value: "A much longer contract description" }, { value: "12345" }],
    ];
    expect(columnWidthsFor(grid, metrics)).toEqual([
      14 * 7 + 10 + 11, // the bold header "Account Number"
      34 * 7 + 11, // the long description, in a data row far below the header
      96, // "01/2026" and "12345" fit in the minimum
    ]);
  });

  it("UT-ADDCOST-COLW-002 empty cells, missing cells and short rows count as empty", () => {
    const grid = [[{ value: "Header" }, { value: "" }], [{ value: undefined }], undefined];
    expect(columnWidthsFor(grid, metrics)).toEqual([96, 96]);
  });

  it("UT-ADDCOST-COLW-003 each distinct text is measured once per font", () => {
    let calls = 0;
    const counting: ColumnMetrics = { ...metrics, textWidth: (t, h) => { calls++; return metrics.textWidth(t, h); } };
    const grid = [[{ value: "100" }], ...Array.from({ length: 50 }, () => [{ value: "100" }])];
    columnWidthsFor(grid, counting);
    expect(calls).toBe(2); // the header's "100" and the data rows' "100"
  });

  it("UT-ADDCOST-COLW-004 sameWidths compares by value", () => {
    expect(sameWidths([1, 2], [1, 2])).toBe(true);
    expect(sameWidths([1, 2], [1, 3])).toBe(false);
    expect(sameWidths(null, null)).toBe(true);
    expect(sameWidths(null, [1])).toBe(false);
  });
});
