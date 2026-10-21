/**
 * Auto-fixture — demo rows for the tables the hand-written seed does not cover.
 *
 * 27 of the 73 declared entity sets are seeded by hand in `mockBackend.ts`. The other 46 were
 * empty, so the screens that read them rendered an empty grid in `npm run dev` and there was
 * nothing to click. This fills them.
 *
 * It works off the REQUEST rather than off a table of column definitions, which is the whole
 * point: `$select` already names exactly the columns the caller wants, and `$filter` already
 * names the values a row must carry to be visible. Generating from those two means no column
 * list is duplicated here (the real ones live in `repos.ts`, which cannot be imported from the
 * mock without a cycle: repos -> repository -> dataClient -> mockBackend), and a table added
 * later is covered with no edit to this file.
 *
 * Deliberately NOT applied to hand-seeded tables. If `capexCosts` comes back empty for a
 * project, that project genuinely has no costs, and inventing some would hide a real bug.
 *
 * This is demo scaffolding, not VSB's data, and it never runs in `power` mode.
 */

export type Row = Record<string, unknown>;

/** Within the 5-10 the demo asks for. */
export const AUTO_FIXTURE_ROWS = 8;

/** Stop a screen that pages or re-filters from growing a table without bound. */
const MAX_AUTO_ROWS = 48;

const FV = "@OData.Community.Display.V1.FormattedValue";

const WORDS = [
  "Alpha", "Bravo", "Coastal", "Delta", "Eastfield", "Fenwick", "Granite", "Harbour",
  "Ironside", "Juniper",
];

/** Deterministic — a fixture that changes between reloads is impossible to reason about. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const has = (col: string, ...needles: string[]) =>
  needles.some((n) => col.includes(n));

/**
 * A plausible value for one column, from its name alone.
 *
 * Order matters: the more specific tests come first, because `vsb_costamount` matches both
 * "cost" and "amount" and `vsb_startdate` matches both "start" and "date".
 */
function valueFor(entitySet: string, col: string, i: number): unknown {
  const c = col.toLowerCase();
  const seed = hash(`${entitySet}|${col}`) + i;

  if (c === "statecode") return 0;
  if (c === "statuscode") return 1;
  if (c === "versionnumber") return seed;
  if (c.endsWith("createdon") || c.endsWith("modifiedon")) {
    return new Date(Date.UTC(2026, i % 12, 1 + (i % 27), 9, 30)).toISOString();
  }

  // Booleans: Dataverse names these `vsb_is…` / `…enabled` / `…active` / `…created`.
  if (/^vsb_is[a-z]/.test(c) || has(c, "enabled", "isactive", "isavailable", "created", "synchronized")) {
    return i % 3 !== 0;
  }

  if (has(c, "date")) {
    return new Date(Date.UTC(2026, (i * 2) % 12, 1 + (i % 27))).toISOString().slice(0, 10);
  }
  if (has(c, "order", "sequence", "position", "rank")) return i + 1;
  if (has(c, "year")) return 2026 + (i % 5);
  if (has(c, "percent", "margin", "rate", "inflation", "uncertainty", "share", "ownership")) {
    return +(((seed % 400) / 10 + 1).toFixed(2));
  }
  if (has(c, "amount", "cost", "price", "eur", "capex", "opex", "value") && !c.endsWith("_value")) {
    return (seed % 900 + 100) * 1000;
  }
  if (has(c, "capacity", "mw", "yield", "kwh", "height", "diameter", "size", "count", "number")) {
    return +(((seed % 900) / 10 + 1).toFixed(1));
  }
  if (has(c, "code")) return `C-${1000 + i}`;
  if (has(c, "mail")) return `demo.user${i + 1}@vsb.energy`;
  if (has(c, "url", "link")) return null;
  if (has(c, "comment", "description", "note", "informations")) {
    return `${WORDS[i % WORDS.length]} — sample text for the demo fixture.`;
  }
  if (has(c, "name", "title", "label", "type", "category", "operator", "supplier", "manufacturer")) {
    return `${WORDS[i % WORDS.length]} ${i + 1}`;
  }
  // Unknown: a readable placeholder beats null, which renders as an empty cell.
  return `${WORDS[i % WORDS.length]} ${i + 1}`;
}

/**
 * The equality constraints in a `$filter`, so generated rows actually satisfy it.
 *
 * Only plain `col eq value` is read — that is what every scoped read in this app emits
 * (`f.guid`, `f.eq`). Anything more (contains, comparisons, `or`) is left alone; those rows
 * simply will not match, which is correct.
 */
export function equalityConstraints(filter: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!filter) return out;
  const re = /([A-Za-z0-9_]+)\s+eq\s+(?:'((?:[^']|'')*)'|([^\s()]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) !== null) {
    const [, col, quoted, bare] = m;
    if (quoted !== undefined) out[col] = quoted.replace(/''/g, "'");
    else if (bare === "true" || bare === "false") out[col] = bare === "true";
    else if (bare === "null") out[col] = null;
    else if (/^-?\d+(\.\d+)?$/.test(bare)) out[col] = Number(bare);
    else out[col] = bare; // a bare GUID
  }
  return out;
}

/** The primary-key column, taken from `$select` where possible. */
function idColumn(entitySet: string, select: string[]): string {
  const fromSelect = select.find((c) => c.endsWith("id") && !c.startsWith("_"));
  if (fromSelect) return fromSelect;
  return `${entitySet}id`;
}

export interface AutoFixtureRequest {
  entitySet: string;
  select: string[];
  filter: string | null;
  /** How many rows the table already holds, so generation can stop. */
  existing: number;
}

/**
 * Build demo rows for one request, or `[]` when none should be made.
 *
 * A lookup column gets a `FormattedValue` sibling as well, because every dropdown and grid in
 * this app renders the label, not the GUID.
 */
export function buildAutoFixture(req: AutoFixtureRequest): Row[] {
  const { entitySet, select, filter, existing } = req;
  if (!select.length) return [];
  if (existing >= MAX_AUTO_ROWS) return [];

  const fixed = equalityConstraints(filter);
  const idCol = idColumn(entitySet, select);
  const cols = new Set([...select, idCol]);

  const rows: Row[] = [];
  for (let i = 0; i < AUTO_FIXTURE_ROWS; i++) {
    const n = existing + i;
    const row: Row = {};
    for (const col of cols) {
      if (col === idCol) {
        row[col] = `${entitySet}-auto-${n + 1}`;
        continue;
      }
      if (col in fixed) {
        // Satisfy the caller's own filter, so the rows it asked for are the rows it gets.
        row[col] = fixed[col];
        if (col.startsWith("_") && col.endsWith("_value")) {
          row[`${col}${FV}`] = `${WORDS[i % WORDS.length]} ${i + 1}`;
        }
        continue;
      }
      if (col.startsWith("_") && col.endsWith("_value")) {
        row[col] = `${col.slice(1, -6)}-auto-${(i % 4) + 1}`;
        row[`${col}${FV}`] = `${WORDS[i % WORDS.length]} ${i + 1}`;
        continue;
      }
      row[col] = valueFor(entitySet, col, n);
    }
    // Every table in this solution carries these; screens filter on `statecode` routinely.
    row.statecode ??= 0;
    rows.push(row);
  }
  return rows;
}
