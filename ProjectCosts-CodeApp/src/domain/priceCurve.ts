/**
 * The standard price curve — ONE rule for "which price belongs to this COD year" (D155).
 *
 * The country assumptions (`Assumptions Revenues SQL`, Fabric) hold one `valuetype = "price"` row per
 * YEAR, the year in `category` and the price in `wind` / `pv`. Every screen that seeds a tariff from that
 * curve (Revenues' Add Contract panel, the Milestones screen's default revenue) calls this function, so
 * they cannot disagree for the same project.
 *
 * THE RULE
 *  1. If the curve has a row for the COD year, that row's price is used.
 *  2. Otherwise the row whose year is NEAREST to the COD year is used. This covers both ends of the curve
 *     without a special case: a COD before the first year gets the first year's price, a COD after the
 *     last year gets the last year's price, and a COD inside a gap gets the closer side of the gap.
 *  3. Two years equally near (a COD exactly halfway across a gap): the HIGHER price wins. That is the
 *     canvas's own secondary sort (`SortByColumns(…, "Diff", Ascending, "pv"/"wind", Descending)`).
 *
 * THE RESULT NEVER DEPENDS ON ROW ORDER. Fabric returns the rows unsorted, and the canvas's "first" and
 * "last" row are whatever order the source happened to give. Here no step reads an array position: the
 * exact match is by year, the nearest match by distance, and the tie by price. (If a curve holds the same
 * year twice, which is a data error, the first of them is used, as the canvas `LookUp` does.)
 *
 * A row with no usable price is never chosen as the NEAREST row (a blank row is not a price); an exact
 * row with a blank price answers `null`, as the canvas would show a blank.
 *
 * Pure: no React, no network, no clock. The caller turns its rows into points, so each caller keeps its
 * own number parsing (Revenues parses with the user's language, Milestones with `Number`).
 */

/** One year of the curve. `price` is `NaN` for a row whose price is blank or unreadable. */
export interface PricePoint {
  readonly year: number;
  readonly price: number;
}

const usablePrice = (p: PricePoint): boolean => Number.isFinite(p.price);

/** The standard price for `year` on `points`, or `null` when the curve has none. See the file header. */
export function priceForYearOnCurve(points: readonly PricePoint[], year: number): number | null {
  if (!Number.isFinite(year)) return null;
  const dated = points.filter((p) => Number.isFinite(p.year));
  if (dated.length === 0) return null;

  const exact = dated.find((p) => p.year === year);
  if (exact) return usablePrice(exact) ? exact.price : null;

  let best: PricePoint | null = null;
  for (const p of dated) {
    if (!usablePrice(p)) continue;
    if (best === null) { best = p; continue; }
    const d = Math.abs(p.year - year);
    const bd = Math.abs(best.year - year);
    if (d < bd || (d === bd && p.price > best.price)) best = p;
  }
  return best === null ? null : best.price;
}
