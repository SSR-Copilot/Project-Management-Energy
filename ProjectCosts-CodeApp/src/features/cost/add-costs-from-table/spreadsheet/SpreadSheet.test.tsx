// @vitest-environment jsdom
/**
 * The grid reads itself back once on mount, not three times.
 *
 * Mounting used to decorate the seeded grid a second time in an effect, which gave
 * react-spreadsheet a new `data` reference (a full table rebuild) and fired `onDataChange`
 * twice; the screen answers every `onDataChange` with a full read-back of the sheet. The
 * content never differed, so the second pass was pure cost. A genuinely new grid from the
 * caller must still re-hydrate.
 */
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { SpreadSheetComp, type SheetGrid } from "./SpreadSheet";
import { FALLBACK_VISIBLE_ROWS, OVERSCAN_ROWS } from "./rowWindow";

const grid = (description: string): SheetGrid => [
  [{ value: "Account Number" }, { value: "Account Name" }, { value: "Cost Description" },
    { value: "Cost Paid By" }, { value: "Depreciation" }, { value: "Apply VAT" }, { value: "01/2020" }],
  [{ value: "80000" }, { value: "Turbine" }, { value: "*Account*" }, { value: "" }, { value: "" },
    { value: "" }, { value: "" }],
  [{ value: "" }, { value: "" }, { value: description }, { value: "SPV" }, { value: "Yes" },
    { value: "No" }, { value: "5" }],
];

const props = { addRowToken: 0, deleteRowToken: 0, copyTableToken: 0 };

describe("SpreadSheetComp mount", () => {
  it("UT-ADDCOST-070 reports the seeded grid exactly once on mount", () => {
    const onDataChange = vi.fn();
    render(<SpreadSheetComp data={grid("Alpha")} onDataChange={onDataChange} {...props} />);
    expect(onDataChange).toHaveBeenCalledTimes(1);
    const reported = onDataChange.mock.calls[0]?.[0] as SheetGrid;
    expect(reported[2]?.[2]?.value).toBe("Alpha");
    // Decorated, as every later report is: rows dressed and locked the same way.
    expect(reported[1]?.[0]?.className).toBe("filled-row");
  });

  it("UT-ADDCOST-071 still re-hydrates when the caller hands it a new grid", () => {
    const onDataChange = vi.fn();
    const first = grid("Alpha");
    const { rerender } = render(<SpreadSheetComp data={first} onDataChange={onDataChange} {...props} />);
    // The same reference again is not new data.
    rerender(<SpreadSheetComp data={first} onDataChange={onDataChange} {...props} />);
    expect(onDataChange).toHaveBeenCalledTimes(1);
    rerender(<SpreadSheetComp data={grid("Beta")} onDataChange={onDataChange} {...props} />);
    expect(onDataChange).toHaveBeenCalledTimes(2);
    const reported = onDataChange.mock.calls[1]?.[0] as SheetGrid;
    expect(reported[2]?.[2]?.value).toBe("Beta");
  });
});

/** Two years: 6 fixed columns, then 12 months of 2020 ("m0"…"m11") and 12 of 2021 ("n0"…"n11"). */
const twoYears = (): SheetGrid => {
  const months = (p: string, fill = "") => Array.from({ length: 12 }, (_, i) => ({ value: fill || `${p}${i}` }));
  const fixed = (a: string, b: string, c: string) => [{ value: a }, { value: b }, { value: c }, { value: "" }, { value: "" }, { value: "" }];
  return [
    [...fixed("Account Number", "Account Name", "Cost Description"), ...months("m"), ...months("n")],
    [...fixed("80000", "Turbine", "*Account*"), ...months("", "0"), ...months("", "0")],
    [...fixed("", "", "Alpha"), ...months("", "3"), ...months("", "4")],
  ];
};

describe("SpreadSheetComp year view (D73)", () => {
  it("UT-ADDCOST-VIEW-020 a one-year view draws only that year's columns but reports the whole grid", () => {
    const onDataChange = vi.fn();
    const { container } = render(<SpreadSheetComp data={twoYears()} onDataChange={onDataChange} {...props} visibleYearIndex={1} />);
    const header = Array.from(container.querySelectorAll("tr")[1]?.querySelectorAll("td") ?? []).map((td) => td.textContent);
    expect(header).toContain("n0");
    expect(header).not.toContain("m0");
    expect(header).toHaveLength(6 + 12);
    const reported = onDataChange.mock.calls[0]?.[0] as SheetGrid;
    expect(reported[0]).toHaveLength(6 + 24);
    expect(reported[2]?.[6]?.value).toBe("3");
    expect(reported[2]?.[18]?.value).toBe("4");
  });

  it("UT-ADDCOST-VIEW-021 all years (null) draws every column", () => {
    const { container } = render(<SpreadSheetComp data={twoYears()} onDataChange={vi.fn()} {...props} visibleYearIndex={null} />);
    expect(container.querySelectorAll("tr")[1]?.querySelectorAll("td")).toHaveLength(6 + 24);
  });

  it("UT-ADDCOST-VIEW-022 switching the view never changes what is reported", () => {
    const onDataChange = vi.fn();
    const grid = twoYears();
    const { rerender } = render(<SpreadSheetComp data={grid} onDataChange={onDataChange} {...props} visibleYearIndex={0} />);
    rerender(<SpreadSheetComp data={grid} onDataChange={onDataChange} {...props} visibleYearIndex={null} />);
    const last = onDataChange.mock.calls.at(-1)?.[0] as SheetGrid;
    expect(last[0]).toHaveLength(6 + 24);
    expect(last[2]?.[18]?.value).toBe("4");
  });
});

/*
 * Typing in the real react-spreadsheet grid (19 Nov 2026). An edit rebuilds only the row it touched,
 * and the grid is not handed back to the library when the library already shows what the cell rules
 * produce; neither may change what is reported or shown.
 */
describe("SpreadSheetComp typing", () => {
  /** Data row `row`, column `col` of the drawn table (the first <tr> holds the column letters). */
  const cellAt = (container: HTMLElement, row: number, col: number) =>
    container.querySelectorAll("tr")[row + 1]!.querySelectorAll("td")[col]!;
  const typeInto = (container: HTMLElement, row: number, col: number, value: string) => {
    act(() => { fireEvent.mouseDown(cellAt(container, row, col)); });
    act(() => { fireEvent.click(container.querySelector(".Spreadsheet__active-cell")!); });
    const input = container.querySelector<HTMLInputElement>(".Spreadsheet__active-cell input");
    expect(input).not.toBeNull();
    act(() => { fireEvent.change(input!, { target: { value } }); });
  };
  const lastReport = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0] as SheetGrid;

  it("UT-ADDCOST-120 an edit rebuilds only its own row: every other row is reported as the same objects", () => {
    const onDataChange = vi.fn();
    const { container } = render(<SpreadSheetComp data={twoYears()} onDataChange={onDataChange} {...props} />);
    const before = lastReport(onDataChange);
    typeInto(container, 2, 6, "7");
    const after = lastReport(onDataChange);
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).not.toBe(before[2]);
    expect(after[2]?.[6]?.value).toBe("7");
    // The edited row keeps its dressing; the account row stays grey and locked.
    expect(after[2]?.every((c) => c.className === "empty-row" && c.readOnly === false)).toBe(true);
    expect(after[1]?.every((c) => c.className === "filled-row" && c.readOnly === true)).toBe(true);
  });

  it("UT-ADDCOST-121 two edits in a row are both reported and both shown", () => {
    const onDataChange = vi.fn();
    const { container } = render(<SpreadSheetComp data={twoYears()} onDataChange={onDataChange} {...props} />);
    typeInto(container, 2, 6, "5");
    typeInto(container, 2, 7, "6");
    const last = lastReport(onDataChange);
    expect(last[2]?.slice(6, 9).map((c) => c.value)).toEqual(["5", "6", "3"]);
    expect(cellAt(container, 2, 6).textContent).toBe("5");
    expect(cellAt(container, 2, 7).textContent).toBe("6");
  });

  it("UT-ADDCOST-122 a typed decimal is rounded in the report AND in the grid shown", () => {
    const onDataChange = vi.fn();
    const { container } = render(<SpreadSheetComp data={twoYears()} onDataChange={onDataChange} {...props} />);
    typeInto(container, 2, 6, "12.5");
    expect(lastReport(onDataChange)[2]?.[6]?.value).toBe("13");
    expect(cellAt(container, 2, 6).textContent).toBe("13");
  });

  it("UT-ADDCOST-123 the first edit still applies the cell rules to every row, as before (a stored decimal elsewhere)", () => {
    const g = twoYears();
    g.push(g[2]!.map((c, j) => ({ value: j === 2 ? "Beta" : j === 6 ? "7.6" : c.value })));
    const onDataChange = vi.fn();
    const { container } = render(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} />);
    expect(lastReport(onDataChange)[3]?.[6]?.value).toBe("7.6");
    typeInto(container, 2, 6, "1");
    expect(lastReport(onDataChange)[3]?.[6]?.value).toBe("8");
    expect(cellAt(container, 3, 6).textContent).toBe("8");
  });

  it("UT-ADDCOST-124 a row Add Row inserted is dressed by the next edit", () => {
    const onDataChange = vi.fn();
    const g = twoYears();
    const { container, rerender } = render(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} />);
    rerender(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} addRowToken={1} />);
    expect(lastReport(onDataChange)[3]?.[0]?.className).toBeUndefined();
    typeInto(container, 2, 6, "9");
    expect(lastReport(onDataChange)[3]?.every((c) => c.className === "empty-row")).toBe(true);
  });
});

/*
 * D140: only the rows in view are drawn with their cells. jsdom has no layout, so the fallback
 * applies: the first FALLBACK_VISIBLE_ROWS + OVERSCAN_ROWS rows after the header, every column.
 */
describe("SpreadSheetComp row window (D140)", () => {
  const tall = (rows: number): SheetGrid => [
    [{ value: "Account Number" }, { value: "Account Name" }, { value: "Cost Description" },
      { value: "Cost Paid By" }, { value: "Depreciation" }, { value: "Apply VAT" }, { value: "01/2026" }],
    ...Array.from({ length: rows }, (_, r) => [{ value: "" }, { value: "" }, { value: `C${r + 1}` },
      { value: "SPV" }, { value: "Yes" }, { value: "No" }, { value: String(r + 1) }]),
  ];
  const bodyRows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll(".Spreadsheet__table > tbody > tr")).slice(1);
  const drawn = (container: HTMLElement) => bodyRows(container).map((tr) => tr.querySelectorAll("td").length > 0);
  const lastDrawn = FALLBACK_VISIBLE_ROWS + OVERSCAN_ROWS;

  it("UT-ADDCOST-WIN-020 rows past the window are empty rows; the reported grid still holds every row", () => {
    const onDataChange = vi.fn();
    const { container } = render(<SpreadSheetComp data={tall(120)} onDataChange={onDataChange} {...props} />);
    const rows = drawn(container);
    expect(rows).toHaveLength(121);
    expect(rows.slice(0, lastDrawn + 1).every(Boolean)).toBe(true);
    expect(rows.slice(lastDrawn + 1).some(Boolean)).toBe(false);
    expect(bodyRows(container)[lastDrawn + 1]?.className).toBe("Spreadsheet__row--placeholder");
    const reported = onDataChange.mock.calls.at(-1)?.[0] as SheetGrid;
    expect(reported).toHaveLength(121);
    expect(reported[120]?.[6]?.value).toBe("120");
  });

  it("UT-ADDCOST-WIN-021 the active cell's row is drawn even outside the window (an arrow key past it)", () => {
    const { container } = render(<SpreadSheetComp data={tall(120)} onDataChange={vi.fn()} {...props} />);
    const cellAt = (row: number, col: number) => bodyRows(container)[row]!.querySelectorAll("td")[col]!;
    act(() => { fireEvent.mouseDown(cellAt(lastDrawn, 6)); });
    expect(drawn(container)[lastDrawn + 1]).toBe(false);
    act(() => { fireEvent.keyDown(container.querySelector(".Spreadsheet")!, { key: "ArrowDown" }); });
    expect(drawn(container)[lastDrawn + 1]).toBe(true);
    expect(cellAt(lastDrawn + 1, 6).textContent).toBe(String(lastDrawn + 1));
  });

  it("UT-ADDCOST-WIN-022 drawAllRows draws every row, as before D140", () => {
    const { container } = render(<SpreadSheetComp data={tall(120)} onDataChange={vi.fn()} {...props} drawAllRows />);
    expect(drawn(container).every(Boolean)).toBe(true);
  });
});

describe("SpreadSheetComp Add Row", () => {
  it("UT-ADDCOST-109 Add Row without a mapping leaves Cost Paid By blank, Depreciation and Apply VAT 'Yes'", () => {
    const onDataChange = vi.fn();
    const g = grid("Alpha");
    const { rerender } = render(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} />);
    rerender(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} addRowToken={1} />);
    const last = onDataChange.mock.calls.at(-1)?.[0] as SheetGrid;
    expect(last).toHaveLength(4);
    expect(last[3]?.slice(0, 6).map((c) => c.value)).toEqual(["", "", "", "", "Yes", "Yes"]);
  });

  it("UT-ADDCOST-125 Add Row seeds Cost Paid By from the DevCo/SPV mapping of the sub-account the row lands under (bug 15410)", () => {
    // Header, account 80000, sub-account 80000_0, one contract row; Add Row with nothing selected goes after the last row.
    const g: SheetGrid = [
      ...grid("Alpha").slice(0, 2),
      [{ value: "80000_0" }, { value: "Turbine" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
      grid("Alpha")[2]!,
    ];
    const onDataChange = vi.fn();
    const payerDefaults = new Map([["80000_0", "SPV"]]);
    const { rerender } = render(
      <SpreadSheetComp data={g} onDataChange={onDataChange} {...props} payerDefaults={payerDefaults} />,
    );
    rerender(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} payerDefaults={payerDefaults} addRowToken={1} />);
    const last = onDataChange.mock.calls.at(-1)?.[0] as SheetGrid;
    expect(last).toHaveLength(5);
    expect(last[4]?.slice(0, 6).map((c) => c.value)).toEqual(["", "", "", "SPV", "Yes", "Yes"]);
    // A sub-account the mapping does not know keeps the cell blank.
    const unmapped = new Map([["99999_0", "DevCo"]]);
    rerender(<SpreadSheetComp data={g} onDataChange={onDataChange} {...props} payerDefaults={unmapped} addRowToken={2} />);
    expect((onDataChange.mock.calls.at(-1)?.[0] as SheetGrid).at(-1)?.[3]?.value).toBe("");
  });
});

describe("SpreadSheetComp under StrictMode (18 Nov 2026)", () => {
  /** Header, an account, its sub-account, a contract, then a second account and its sub-account LAST. */
  const sheet = (): SheetGrid => {
    const blank = () => Array.from({ length: 4 }, () => ({ value: "" }));
    return [
      [{ value: "Account Number" }, { value: "Account Name" }, { value: "Cost Description" }, ...blank()],
      [{ value: "84000" }, { value: "Substation" }, { value: "*Account*" }, ...blank()],
      [{ value: "84000_0" }, { value: "Substation" }, { value: "" }, ...blank()],
      [{ value: "" }, { value: "" }, { value: "test" }, { value: "DevCo" }, { value: "Yes" }, { value: "Yes" }, { value: "" }],
      [{ value: "84001" }, { value: "Grid Connection Costs" }, { value: "*Account*" }, ...blank()],
      [{ value: "84001_0" }, { value: "Grid Connection Costs" }, { value: "" }, ...blank()],
    ];
  };
  const firstCells = (g: SheetGrid) => g.map((r) => r[0]?.value);

  it("UT-ADDCOST-110 opening the sheet adds, deletes and copies nothing: the last row stays; a press acts once", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onDataChange = vi.fn();
    const g = sheet();
    const view = (tokens: { addRowToken: number; deleteRowToken: number; copyTableToken: number }) => (
      <StrictMode><SpreadSheetComp data={g} onDataChange={onDataChange} {...tokens} /></StrictMode>
    );
    const { rerender } = render(view({ addRowToken: 0, deleteRowToken: 0, copyTableToken: 0 }));
    const opened = onDataChange.mock.calls.at(-1)?.[0] as SheetGrid;
    expect(firstCells(opened)).toEqual(["Account Number", "84000", "84000_0", "", "84001", "84001_0"]);
    expect(writeText).not.toHaveBeenCalled();

    rerender(view({ addRowToken: 1, deleteRowToken: 0, copyTableToken: 0 }));
    const added = onDataChange.mock.calls.at(-1)?.[0] as SheetGrid;
    expect(added).toHaveLength(7);
    expect(firstCells(added).slice(0, 6)).toEqual(["Account Number", "84000", "84000_0", "", "84001", "84001_0"]);

    rerender(view({ addRowToken: 1, deleteRowToken: 1, copyTableToken: 0 }));
    expect(onDataChange.mock.calls.at(-1)?.[0] as SheetGrid).toHaveLength(6);

    rerender(view({ addRowToken: 1, deleteRowToken: 1, copyTableToken: 1 }));
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
