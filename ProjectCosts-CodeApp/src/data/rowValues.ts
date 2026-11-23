/**
 * Row-value coercers shared by the data modules (OPT-32, B8). Each was re-declared with the same body in up to ten modules; the copies
 * that were identical are here once. The DIFFERENT variants stay local on purpose (the Revenues `bool` accepts 1 and its `formatted` takes
 * a row; the admin `num` / `str` variants return undefined or "" instead of null; Check List's and Finance's `num` accept numbers only).
 */
import { numberOf } from "./odata";

/** A non-empty string, else null. */
export const rowStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** `numberOf` (a number, or a numeric string), else null. */
export const rowNum = (v: unknown): number | null => numberOf(v) ?? null;
/** A boolean, else null. */
export const rowBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
/** The OData formatted-value annotation key of a column. */
export const formattedColumn = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;
