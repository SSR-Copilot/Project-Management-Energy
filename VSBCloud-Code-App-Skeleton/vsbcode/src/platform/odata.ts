/** OData $filter builders. Keeps quoting/escaping in one place. */
const esc = (s: string) => s.replace(/'/g, "''");

export const f = {
  eq: (col: string, v: string | number | boolean | null) =>
    v === null ? `${col} eq null` : typeof v === "string" ? `${col} eq '${esc(v)}'` : `${col} eq ${v}`,
  ne: (col: string, v: string | number) =>
    typeof v === "string" ? `${col} ne '${esc(v)}'` : `${col} ne ${v}`,
  gt: (col: string, v: number | string) => `${col} gt ${typeof v === "string" ? `'${esc(v)}'` : v}`,
  ge: (col: string, v: number | string) => `${col} ge ${typeof v === "string" ? `'${esc(v)}'` : v}`,
  lt: (col: string, v: number | string) => `${col} lt ${typeof v === "string" ? `'${esc(v)}'` : v}`,
  le: (col: string, v: number | string) => `${col} le ${typeof v === "string" ? `'${esc(v)}'` : v}`,
  guid: (col: string, id: string) => `${col} eq ${id}`,
  isNull: (col: string) => `${col} eq null`,
  notNull: (col: string) => `${col} ne null`,
  contains: (col: string, v: string) => `contains(${col},'${esc(v)}')`,
  startsWith: (col: string, v: string) => `startswith(${col},'${esc(v)}')`,
  inList: (col: string, vs: (string | number)[]) =>
    vs.length ? `(${vs.map((v) => f.eq(col, v)).join(" or ")})` : "false",
  and: (...cs: (string | undefined | false | null)[]) => {
    const k = cs.filter(Boolean) as string[];
    return k.length ? k.map((c) => `(${c})`).join(" and ") : undefined;
  },
  or: (...cs: (string | undefined | false | null)[]) => {
    const k = cs.filter(Boolean) as string[];
    return k.length ? k.map((c) => `(${c})`).join(" or ") : undefined;
  },
  not: (c: string) => `not (${c})`,
};

export const asc = (col: string) => `${col} asc`;
export const desc = (col: string) => `${col} desc`;
