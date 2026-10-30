import { describe, expect, it } from "vitest";
import { currentYearIndex, fromView, toView, viewColumns } from "./viewColumns";

const WIDTH = 6 + 12 * 3;

describe("sheet view columns", () => {
  it("UT-ADDCOST-VIEW-001 current year is its offset from the first year, clamped into the sheet", () => {
    expect(currentYearIndex(2026, 2024, 10)).toBe(2);
    expect(currentYearIndex(2020, 2024, 10)).toBe(0);
    expect(currentYearIndex(2040, 2024, 10)).toBe(9);
    expect(currentYearIndex(2026, 2026, 1)).toBe(0);
  });

  it("UT-ADDCOST-VIEW-002 one year shows the 6 fixed columns plus that year's 12 months", () => {
    expect(viewColumns(WIDTH, 1)).toEqual([0, 1, 2, 3, 4, 5, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it("UT-ADDCOST-VIEW-003 all years (null) and an unusable width show every column", () => {
    expect(viewColumns(WIDTH, null)).toBeNull();
    expect(viewColumns(6, 0)).toBeNull();
  });

  it("UT-ADDCOST-VIEW-004 a year index out of range is clamped to the first or last year", () => {
    expect(viewColumns(WIDTH, 99)?.slice(6)).toEqual(Array.from({ length: 12 }, (_, i) => 30 + i));
    expect(viewColumns(WIDTH, -3)?.slice(6)).toEqual(Array.from({ length: 12 }, (_, i) => 6 + i));
  });

  it("UT-ADDCOST-VIEW-005 the view shares the full grid's cells and an edit lands in the right full column", () => {
    const full = [0, 1].map((r) => Array.from({ length: WIDTH }, (_, c) => ({ value: `${r}:${c}` })));
    const cols = viewColumns(WIDTH, 1)!;
    const view = toView(full, cols);
    expect(view[1]![6]).toBe(full[1]![18]);
    const edited = view.map((row) => row.slice());
    edited[1]![7] = { value: "edited" };
    const back = fromView(edited, full, cols, WIDTH, () => ({ value: "" }));
    expect(back[1]![19]).toEqual({ value: "edited" });
    // Every hidden column is the very same cell as before.
    for (let c = 0; c < WIDTH; c++) if (!cols.includes(c)) expect(back[1]![c]).toBe(full[1]![c]);
    expect(back[0]).toEqual(full[0]);
  });

  it("UT-ADDCOST-VIEW-006 a paste wider than the view is clipped, and a row added below gets blank hidden cells", () => {
    const full = [Array.from({ length: WIDTH }, (_, c) => ({ value: `h${c}` }))];
    const cols = viewColumns(WIDTH, 0)!;
    const wide = [
      full[0]!.slice(0, cols.length + 5),
      Array.from({ length: cols.length + 5 }, () => ({ value: "x" })),
    ];
    const back = fromView(wide, full, cols, WIDTH, () => ({ value: "" }));
    expect(back).toHaveLength(2);
    expect(back[1]).toHaveLength(WIDTH);
    expect(back[1]![5]).toEqual({ value: "x" });
    expect(back[1]![6 + 12]).toEqual({ value: "" });
    expect(back[1]![0 + cols.length + 3]).toEqual({ value: "" });
  });

  it("UT-ADDCOST-VIEW-007 a missing view row stays as the full grid had it", () => {
    const full = [[{ value: "a" }, { value: "b" }]];
    const back = fromView([undefined], full, [0], 2, () => ({ value: "" }));
    expect(back[0]).toEqual(full[0]);
  });
});
