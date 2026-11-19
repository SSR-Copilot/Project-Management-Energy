/**
 * The sheet's column widths, from EVERY row (D140). With only the rows on screen drawn
 * (`rowWindow.ts`), the table's automatic layout would size each column by the drawn rows only,
 * so columns would jump as rows scroll in and out (the header row's "Account Number" alone sets
 * three of them). The widths are therefore worked out from every row the way that layout does it
 * (the widest cell, never under the cell's minimum width) and pinned on the table.
 *
 * Pure and framework-free so it is testable on its own (CONVENTIONS rule 5); the text is measured
 * by the caller (a canvas, at the cells' own fonts).
 */

export interface ColumnMetrics {
  /** Width of `text` at the header row's font, and at a data row's font. */
  textWidth: (text: string, header: boolean) => number;
  /** A cell's padding and border, around its text. */
  cellExtra: number;
  /** A cell's minimum width (`6em`). */
  minWidth: number;
}

/**
 * One width per grid column, in pixels, unrounded as the automatic layout gives it.
 * Row 0 is the header row (bold); a column absent from a row counts as empty.
 */
export function columnWidthsFor(grid: readonly (readonly ({ value?: unknown } | undefined)[] | undefined)[], m: ColumnMetrics): number[] {
  const width = grid.reduce((n, row) => Math.max(n, row?.length ?? 0), 0);
  const widest = new Array<number>(width).fill(0);
  const cache = [new Map<string, number>(), new Map<string, number>()];
  grid.forEach((row, r) => {
    if (!row) return;
    const header = r === 0;
    const known = cache[header ? 0 : 1]!;
    for (let c = 0; c < row.length; c++) {
      const raw = row[c]?.value;
      if (raw === undefined || raw === null || raw === "") continue;
      const text = String(raw);
      let w = known.get(text);
      if (w === undefined) {
        w = m.textWidth(text, header);
        known.set(text, w);
      }
      if (w > widest[c]!) widest[c] = w;
    }
  });
  return widest.map((w) => Math.max(m.minWidth, w > 0 ? w + m.cellExtra : 0));
}

export const sameWidths = (a: readonly number[] | null, b: readonly number[] | null): boolean =>
  a === b || (!!a && !!b && a.length === b.length && a.every((w, i) => w === b[i]));
