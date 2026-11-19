import { describe, expect, it } from "vitest";
import {
  FALLBACK_VISIBLE_ROWS, OVERSCAN_COLUMNS, OVERSCAN_ROWS, columnRuns, columnWindowFor, rowDrawn, rowWindowFor,
} from "./rowWindow";

describe("rowWindowFor (D140)", () => {
  it("UT-ADDCOST-WIN-001 at the top: the visible rows plus the overscan below", () => {
    // 300 px tall, 30 px rows, a 30 px column-letter row: rows 0..10 visible (+1 partial).
    const w = rowWindowFor(0, 300, 30, 30, 225);
    expect(w.first).toBe(0);
    expect(w.last).toBe(0 + Math.ceil(300 / 30) + 1 + OVERSCAN_ROWS);
    expect(w.rowHeight).toBe(30);
  });

  it("UT-ADDCOST-WIN-002 scrolled: the overscan on both sides, clamped to the sheet", () => {
    const w = rowWindowFor(30 + 100 * 30, 300, 30, 30, 225);
    expect(w.first).toBe(100 - OVERSCAN_ROWS);
    expect(w.last).toBe(100 + 11 + OVERSCAN_ROWS);
    expect(rowWindowFor(30 + 220 * 30, 300, 30, 30, 225).last).toBe(224);
  });

  it("UT-ADDCOST-WIN-003 without layout (height 0) a fixed number of rows is drawn", () => {
    const w = rowWindowFor(0, 0, 0, 0, 225);
    expect(w).toEqual({ first: 0, last: FALLBACK_VISIBLE_ROWS + OVERSCAN_ROWS, rowHeight: 30 });
    expect(rowWindowFor(0, 0, 0, 0, 5).last).toBe(4);
  });

  it("UT-ADDCOST-WIN-004 the active cell's row is always drawn", () => {
    const w = { first: 10, last: 20, rowHeight: 30 };
    expect(rowDrawn(w, 15, null)).toBe(true);
    expect(rowDrawn(w, 40, null)).toBe(false);
    expect(rowDrawn(w, 40, 40)).toBe(true);
  });
});

describe("columnWindowFor / columnRuns (D140)", () => {
  // The row-number column, then 6 columns of 100 px and 20 of 50 px.
  const widths = [40, ...Array<number>(6).fill(100), ...Array<number>(20).fill(50)];

  it("UT-ADDCOST-WIN-010 at the left: the visible columns plus the overscan right", () => {
    // 0..700 px: the row numbers (40), the 6 fixed columns (to 640), and columns 6 and 7 (to 740).
    expect(columnWindowFor(0, 700, widths)).toEqual({ first: 0, last: 7 + OVERSCAN_COLUMNS });
  });

  it("UT-ADDCOST-WIN-011 scrolled right: the overscan both sides; no layout draws every column", () => {
    // 900..1100 px: columns 11..15 (column c >= 6 starts at 640 + (c - 6) * 50).
    expect(columnWindowFor(900, 200, widths)).toEqual({ first: 11 - OVERSCAN_COLUMNS, last: 15 + OVERSCAN_COLUMNS });
    expect(columnWindowFor(0, 0, widths)).toEqual({ first: 0, last: 25 });
  });

  it("UT-ADDCOST-WIN-012 the columns not drawn become one run per stretch; the active column is drawn", () => {
    expect(columnRuns(10, { first: 3, last: 5 }, null)).toEqual([
      { drawn: false, from: 0, to: 2 },
      { drawn: true, from: 3, to: 3 }, { drawn: true, from: 4, to: 4 }, { drawn: true, from: 5, to: 5 },
      { drawn: false, from: 6, to: 9 },
    ]);
    expect(columnRuns(10, { first: 3, last: 4 }, 8)).toEqual([
      { drawn: false, from: 0, to: 2 },
      { drawn: true, from: 3, to: 3 }, { drawn: true, from: 4, to: 4 },
      { drawn: false, from: 5, to: 7 },
      { drawn: true, from: 8, to: 8 },
      { drawn: false, from: 9, to: 9 },
    ]);
  });
});
