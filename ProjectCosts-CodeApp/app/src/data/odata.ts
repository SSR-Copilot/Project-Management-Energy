/**
 * OData fragment builders.
 *
 * The point of this file is that every list the canvas app built with
 * `ClearCollect(col, Filter(Table, ...))` — which pulls rows to the client and filters them
 * there, capped at `DefaultConnectedDataSourceMaxGetRowsCount: 2000` — becomes a server-side
 * `$filter`. That cap is why the canvas app silently truncated: `Contracts Screen.OnVisible`
 * alone does `ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')` with no
 * filter at all.
 *
 * Everything here escapes its inputs. A contract description is user-typed and goes into a
 * `$filter` string; an unescaped apostrophe in "O'Brien Wind Farm" produces a 400 at best.
 */

/** OData string literals are single-quoted, and a literal quote is doubled. */
export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * GUIDs go into `$filter` unquoted for Dataverse's own `Guid` columns but must still be
 * validated — a GUID that reaches a filter from a URL parameter is untrusted input.
 */
export function guid(value: string): string {
  const normalized = value.replace(/^\{|\}$/g, "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`Not a GUID: ${value}`);
  }
  return normalized;
}

export function eq(column: string, value: string | number | boolean): string {
  if (typeof value === "string") return `${column} eq ${quote(value)}`;
  return `${column} eq ${value}`;
}

/** Lookup columns filter on the `_<name>_value` form. */
export function lookupEq(column: string, id: string): string {
  return `_${column}_value eq ${guid(id)}`;
}

/**
 * Joins clauses, dropping every blank one, and returns **undefined** when nothing survives —
 * not `""`.
 *
 * That distinction is the whole point. `filter: ""` reaches Dataverse as `$filter=`, which is
 * a 400; `filter: undefined` omits the parameter. Call sites pass `condition && clause`, so
 * `false` and `undefined` both have to be tolerated.
 */
export function and(...clauses: (string | undefined | false | null)[]): string | undefined {
  const kept = clauses.filter((c): c is string => typeof c === "string" && c.length > 0);
  if (kept.length === 0) return undefined;
  return kept.length === 1 ? kept[0] : kept.map((c) => `(${c})`).join(" and ");
}

export function or(...clauses: (string | undefined | false | null)[]): string | undefined {
  const kept = clauses.filter((c): c is string => typeof c === "string" && c.length > 0);
  if (kept.length === 0) return undefined;
  return kept.length === 1 ? kept[0] : kept.map((c) => `(${c})`).join(" or ");
}

/**
 * `column in (a, b, c)`.
 *
 * Dataverse has no `in` for GUIDs in `$filter`, so this expands to an `or` chain. URLs have
 * a length limit, so callers must chunk: `CHUNK` is the number of GUIDs that fits
 * comfortably below the ~16 k practical query cap (36 chars + " or " + column name each).
 */
export const CHUNK = 40;

export function lookupIn(column: string, ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined;
  return or(...ids.map((id) => lookupEq(column, id)));
}

/** Split a long id list into filterable chunks. */
export function chunk<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Dataverse `statecode` 0 = Active for every custom table in this solution. */
export const ACTIVE = "statecode eq 0";

/* ══════════════════════════════════════════════════ comparison and text ══ */

export function ne(column: string, value: string | number | boolean): string {
  return typeof value === "string" ? `${column} ne ${quote(value)}` : `${column} ne ${value}`;
}

const cmp = (op: "gt" | "ge" | "lt" | "le") =>
  (column: string, value: number | string): string =>
    `${column} ${op} ${typeof value === "string" ? quote(value) : value}`;

export const gt = cmp("gt");
export const ge = cmp("ge");
export const lt = cmp("lt");
export const le = cmp("le");

export const isNull = (column: string): string => `${column} eq null`;
export const notNull = (column: string): string => `${column} ne null`;

/**
 * `contains(col,'x')`. Dataverse's `contains` is case-insensitive, which is what makes it the
 * right translation of Power Fx's `"x" in col`.
 */
export function contains(column: string, value: string): string {
  return `contains(${column},${quote(value)})`;
}

export function startsWith(column: string, value: string): string {
  return `startswith(${column},${quote(value)})`;
}

export function not(clause: string): string {
  return `not (${clause})`;
}

/**
 * `col in (a, b, …)` for non-GUID values, expanded to an `or` chain.
 *
 * An EMPTY list yields `"false"`, not `""`. That is the important half: an empty allow-list
 * must match nothing, whereas an omitted clause matches everything. Getting this backwards on
 * a country scope shows a user every project in the table.
 */
export function inList(column: string, values: readonly (string | number)[]): string {
  return values.length ? or(...values.map((v) => eq(column, v))) ?? "false" : "false";
}

/** `$orderby` fragments. An unvetted column here is a 400, so callers use an allow-list. */
export const asc = (column: string): string => `${column} asc`;
export const desc = (column: string): string => `${column} desc`;

/**
 * The builders as one object, so a filter reads `f.and(f.contains(...), f.eq(...))`.
 *
 * Every leaf goes through a builder and every join through `f.and` / `f.or` — never string
 * concatenation. That is not style: `A or B and C` has no parenthesisation of its own, and
 * the builders parenthesise each operand so the intended grouping survives.
 */
export const f = {
  quote, guid, eq, ne, gt, ge, lt, le, isNull, notNull,
  contains, startsWith, not, inList, lookupEq, lookupIn, and, or,
} as const;
