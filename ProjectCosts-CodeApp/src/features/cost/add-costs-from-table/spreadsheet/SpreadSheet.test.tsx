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
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SpreadSheetComp, type SheetGrid } from "./SpreadSheet";

const grid = (description: string): SheetGrid => [
  [{ value: "Account Number" }, { value: "Account Name" }, { value: "Cost Description" },
    { value: "Cost Paid By" }, { value: "Depreciation" }, { value: "Apply VAT" }, { value: "01/2020" }],
  [{ value: "80000" }, { value: "Turbine" }, { value: "*Account*" }, { value: "" }, { value: "" },
    { value: "" }, { value: "" }],
  [{ value: "" }, { value: "" }, { value: description }, { value: "SPV" }, { value: "Yes" },
    { value: "No" }, { value: "5" }],
];

const props = { subaccountDataIn: [{}], addRowToken: 0, deleteRowToken: 0, copyTableToken: 0 };

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
