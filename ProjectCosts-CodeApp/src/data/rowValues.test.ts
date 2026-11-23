/**
 * OPT-32 (B8): the identical row-value coercers declared in ten data modules are one set in `rowValues.ts`. The OLD bodies are copied here as
 * oracles over an edge table (strings incl. "" and numeric text, numbers incl. 0 / -0 / NaN / Infinity, booleans, 1 / 0, null, undefined,
 * objects), compared with `Object.is`. Ids: UT-ROWVALUES-OPT-001 and up.
 */
import { describe, expect, it } from "vitest";
import { formattedColumn, rowBool, rowNum, rowStr } from "./rowValues";
import { numberOf } from "./odata";

const oldStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const oldNum = (v: unknown): number | null => numberOf(v) ?? null;
const oldBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const oldFormatted = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;

const VALUES: unknown[] = [
  "", " ", "a", "0", "5", "-5", "1.5", "1e3", "0x10", "Infinity", "NaN", " 7 ", "952850000", 0, -0, 1, -1, 1.5, 952850000, Number.NaN,
  Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, true, false, null, undefined, {}, [], [1], () => 0, Symbol.iterator, 10n,
];

describe("OPT-32 row-value coercers", () => {
  it("UT-ROWVALUES-OPT-001 rowStr, rowNum and rowBool equal the old bodies over the edge table", () => {
    for (const v of VALUES) {
      expect(Object.is(rowStr(v), oldStr(v)), `str ${String(v)}`).toBe(true);
      expect(Object.is(rowNum(v), oldNum(v)), `num ${String(v)}`).toBe(true);
      expect(Object.is(rowBool(v), oldBool(v)), `bool ${String(v)}`).toBe(true);
    }
  });

  it("UT-ROWVALUES-OPT-002 formattedColumn equals the old key builder", () => {
    for (const col of ["", "_vsb_clusterstate_value", "vsb_technology", "statecode"]) expect(formattedColumn(col)).toBe(oldFormatted(col));
    expect(formattedColumn("_vsb_country_value")).toBe("_vsb_country_value@OData.Community.Display.V1.FormattedValue");
  });
});
