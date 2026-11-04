/**
 * The parity harness: generic table data for any screen (D80, plan section 5a "Data"), from the manifest's `tables`.
 *
 * The technique of `lib/dataverse.ts`, made generic: during a parity run the code app is served by `npm run dev`, so the
 * code-app frame can import the app's OWN modules (`/src/generated/services/…`, `/src/data/client.ts`). Reads go through
 * the app's real SDK connection as the signed-in user (`fetchAll`, which walks every page and prints its `[VSB] DATA`
 * line, CONVENTIONS rule 23) and return RAW Dataverse values. Deletes go through the app's `deleteRecord`, which surfaces
 * a refused delete (CONVENTIONS rule 14), never the generated `delete()`. Needs a page with the code app open.
 *
 *   readByTag          the rows of tagged tables whose tag column contains (or starts with) the run tag, and their children
 *                      (tables with `parent`) by lookup to the parents read, level by level
 *   readCreatedSince   the same tree, rooted at the project's rows created at or after a time (rows a run writes WITHOUT
 *                      its tag, e.g. a standard import named after its assumptions)
 *   deleteRows         deletes given rows, children first (`deleteOrder`), returns what could NOT be deleted
 *   deleteByTag        readByTag + deleteRows
 *   settledByTag       readByTag until two reads in a row are the same
 *   rowsWithoutBu      the absolute Owning Business Unit check on raw rows (CONVENTIONS rule 4)
 *   runTag             `PW-<runId>-<cv|ca>-<flow>`: the two apps' tags have equal length
 *   normaliseRows      what two apps must write the same: ids, audit / owner stamps and the tag masked, rows sorted by the
 *                      table's `sortKey`, then by their JSON
 *   defaultFingerprint counts and latest `modifiedon` per project table (counts only without a project): no values
 *
 * Only rows of a `PW-` run tag, or of one project after a given time, are ever touched.
 */
import type { Frame, Page } from "@playwright/test";
import type { Kind, ScreenManifest, TableSpec } from "./contract";

export type TableRows = Record<string, Record<string, unknown>[]>;
type Row = Record<string, unknown>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^PW-[A-Za-z0-9-]{6,}$/;

/** The code app's frame on `page` (the dev server on localhost:3000). */
export function codeFrame(page: Page): Frame {
  // By ORIGIN: the player's own page URL carries `_localAppUrl=http://localhost:3000` as a parameter, so a "contains" match
  // could pick the outer page, where `/src/...` resolves against apps.powerapps.com (live run 3 Nov 2026, write-canvas).
  const origin = (u: string): string => { try { return new URL(u).origin; } catch { return ""; } };
  const frame = page.frames().find((f) => origin(f.url()) === "http://localhost:3000");
  if (!frame) throw new Error("The code app frame (localhost:3000) is not open on this page");
  return frame;
}

/** Throws unless `tag` is a `PW-` run tag: nothing else may select rows to read back or delete. */
export function assertTag(tag: string): void {
  if (!TAG.test(tag)) throw new Error(`Refusing to touch rows for a tag that is not a PW- run tag: ${tag}`);
}

/**
 * The app's code in a run tag: two letters for both apps ("cv" Canvas, "ca" code app, as the old suite's `PW-LL-<run>-cv` /
 * `-ca`), so the two apps' tags have the SAME length. A column derived from the tag, or cut to a maximum length, then still
 * compares equal once the tag is masked.
 */
export const KIND_CODE: Readonly<Record<Kind, string>> = { canvas: "cv", code: "ca" };

/** The run tag of one flow in one app: `PW-<runId>-<cv|ca>-<flow>`, every character outside [A-Za-z0-9-] made "-". */
export function runTag(runId: string, kind: Kind, flow: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const tag = `PW-${clean(runId)}-${KIND_CODE[kind]}-${clean(flow)}`;
  assertTag(tag);
  return tag;
}

/**
 * The tables of `rows` that hold a row without an Owning Business Unit, one line each (CONVENTIONS rule 4: a create on a
 * project-scoped table binds `OwningBusinessUnit`; the old `diffLeaseRows` owningBusinessUnitMissing). An ABSOLUTE check on
 * raw rows: two apps that both leave it out compare equal, so this is not left to the comparison.
 */
export function rowsWithoutBu(rows: TableRows): string[] {
  const out: string[] = [];
  for (const [table, list] of Object.entries(rows)) {
    const n = list.filter((r) => !r._owningbusinessunit_value).length;
    if (n) out.push(`${table}: ${n} row(s) without an Owning Business Unit`);
  }
  return out;
}

/**
 * The tables in the order they can be read: roots (no `parent`) first, then each child after its parent. Throws on a
 * parent that is not in the list or a cycle, naming the tables.
 */
export function readOrder(tables: readonly TableSpec[]): TableSpec[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const out: TableSpec[] = [];
  const done = new Set<string>();
  let left = [...tables];
  while (left.length) {
    const ready = left.filter((t) => !t.parent || done.has(t.parent.table));
    if (!ready.length) {
      const missing = left.filter((t) => t.parent && !byName.has(t.parent.table)).map((t) => `${t.name} -> ${t.parent!.table}`);
      throw new Error(missing.length
        ? `tables: parent not in the list (${missing.join(", ")})`
        : `tables: parent cycle among ${left.map((t) => t.name).join(", ")}`);
    }
    for (const t of ready) { out.push(t); done.add(t.name); }
    left = left.filter((t) => !done.has(t.name));
  }
  return out;
}

/** The tables in delete order: `deleteOrder` ascending (children first), then the manifest's order. */
export function deleteOrder(tables: readonly TableSpec[]): TableSpec[] {
  return tables.map((t, i) => ({ t, i })).sort((a, b) => a.t.deleteOrder - b.t.deleteOrder || a.i - b.i).map((x) => x.t);
}

/**
 * The in-page reader: for each table in read order, the root filter (from `rootFilter`) or the children of the parent rows
 * already read. A root without a filter is skipped (no rows). Runs inside the code-app frame.
 */
async function readTree(page: Page, tables: readonly TableSpec[], rootFilter: Record<string, string | null>): Promise<TableRows> {
  const plan = readOrder(tables).map((t) => ({
    name: t.name, service: t.service, serviceModule: t.serviceModule, primaryKey: t.primaryKey,
    parent: t.parent ?? null, filter: t.parent ? null : rootFilter[t.name] ?? null,
  }));
  return codeFrame(page).evaluate(async (steps) => {
    // A variable path: these modules exist only on the dev server, inside the frame (not to the type checker).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
    const { fetchAll } = await load("/src/data/client.ts");
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const s of steps) {
      const mod = await load(s.serviceModule);
      const svc = mod[s.service];
      if (!svc || typeof svc.getAll !== "function") throw new Error(`${s.serviceModule} has no service "${s.service}" with getAll`);
      const read = (filter: string) => fetchAll(`parity read ${s.name}`, (o: unknown) => svc.getAll(o), { filter }) as Promise<Record<string, unknown>[]>;
      const rows: Record<string, unknown>[] = [];
      if (s.parent) {
        const parentTable = steps.find((p) => p.name === s.parent!.table)!;
        for (const p of out[s.parent.table] ?? []) rows.push(...await read(`${s.parent.lookup} eq ${String(p[parentTable.primaryKey])}`));
      } else if (s.filter) {
        rows.push(...await read(s.filter));
      }
      out[s.name] = rows;
    }
    return out;
  }, plan);
}

/**
 * The rows of this run's tag: each root table with a `tagColumn` filtered by `contains` (default) or `startswith` on it,
 * then every child table through its parent lookup. Every table of `tables` is a key of the result (possibly empty).
 */
export async function readByTag(page: Page, tables: readonly TableSpec[], tag: string, match: "contains" | "startswith" = "contains"): Promise<TableRows> {
  assertTag(tag);
  const filters: Record<string, string | null> = {};
  for (const t of tables) filters[t.name] = t.tagColumn ? `${match}(${t.tagColumn},'${tag}')` : null;
  return readTree(page, tables, filters);
}

/**
 * The rows of one project created at or after `sinceIso`: each root table with a `projectLookup`, narrowed by `where`
 * (lookup column -> GUID, e.g. one sub-account), then the children. Narrow on purpose: a cleanup built on this deletes only
 * what the run itself created.
 */
export async function readCreatedSince(
  page: Page, tables: readonly TableSpec[], projectId: string, sinceIso: string, where: Record<string, string> = {},
): Promise<TableRows> {
  if (!GUID.test(projectId) || Object.values(where).some((v) => !GUID.test(v))) throw new Error("ids must be GUIDs");
  if (Number.isNaN(Date.parse(sinceIso))) throw new Error(`not a timestamp: ${sinceIso}`);
  const since = new Date(sinceIso).toISOString();
  const extra = Object.entries(where).map(([col, id]) => ` and ${col} eq ${id}`).join("");
  const filters: Record<string, string | null> = {};
  for (const t of tables) filters[t.name] = t.projectLookup ? `${t.projectLookup} eq ${projectId} and createdon ge ${since}${extra}` : null;
  return readTree(page, tables, filters);
}

/**
 * Deletes the given rows through the app's `deleteRecord`, table by table in delete order (children first). Returns what
 * could NOT be deleted, one line per row: `<entity set> <id>: <reason>`.
 */
export async function deleteRows(page: Page, tables: readonly TableSpec[], rows: TableRows): Promise<string[]> {
  const plan = deleteOrder(tables).map((t) => ({ entitySet: t.entitySet, primaryKey: t.primaryKey, rows: rows[t.name] ?? [] }));
  return codeFrame(page).evaluate(async (steps) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { deleteRecord } = await (import(/* @vite-ignore */ "/src/data/client.ts" as string) as Promise<any>);
    const left: string[] = [];
    for (const s of steps) {
      for (const row of s.rows) {
        const id = String(row[s.primaryKey]);
        try { await deleteRecord("parity cleanup", s.entitySet, id); } catch (e) { left.push(`${s.entitySet} ${id}: ${String(e).slice(0, 160)}`); }
      }
    }
    return left;
  }, plan);
}

/** Deletes every row of this run's tag (children first) and returns what could NOT be deleted. */
export async function deleteByTag(page: Page, tables: readonly TableSpec[], tag: string): Promise<string[]> {
  assertTag(tag);
  return deleteRows(page, tables, await readByTag(page, tables, tag));
}

/** How many rows `rows` holds over all tables. */
export const rowCount = (rows: TableRows): number => Object.values(rows).reduce((n, r) => n + r.length, 0);

/**
 * `readByTag` until two reads in a row are the same (a save may still be writing child rows after the screen says it is
 * done; `lib/leaseFlows.ts` settledRows). After `timeoutMs` the last read is returned as it is.
 */
export async function settledByTag(page: Page, tables: readonly TableSpec[], tag: string, { pollMs = 1500, timeoutMs = 60_000 } = {}): Promise<TableRows> {
  const deadline = Date.now() + timeoutMs;
  let rows = await readByTag(page, tables, tag);
  let last = JSON.stringify(rows);
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    rows = await readByTag(page, tables, tag);
    const now = JSON.stringify(rows);
    if (now === last) return rows;
    last = now;
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────── normalising ── */

/** Audit stamps: always set, different on every write. Dropped. */
const AUDIT = new Set(["createdon", "modifiedon", "versionnumber", "overriddencreatedon", "importsequencenumber", "timezoneruleversionnumber", "utcconversiontimezonecode"]);
/** Owner and user stamps (the signing-in account, not the app): dropped, with their annotations. The owning BU is KEPT (CONVENTIONS rule 4). */
const OWNER = /^_?(createdby|createdonbehalfby|modifiedby|modifiedonbehalfby|owninguser|owningteam|ownerid)(_value)?$/;
/** The formatted-value annotation of a lookup: the referenced row's name, which two apps write the same. */
const LOOKUP_NAME = "@OData.Community.Display.V1.FormattedValue";

/**
 * Two normalised cell values in sort order: absent / null first, then numbers (numerically), then booleans, then every other
 * value by its JSON text. Deterministic; no locale.
 */
export function compareCells(a: unknown, b: unknown): number {
  const rank = (v: unknown) => (v === undefined || v === null ? 0 : typeof v === "number" ? 1 : typeof v === "boolean" ? 2 : 3);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra === 1) return (a as number) - (b as number);
  if (ra === 2) return Number(a) - Number(b);
  const sa = typeof a === "string" ? a : JSON.stringify(a);
  const sb = typeof b === "string" ? b : JSON.stringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Rows of one table as two apps must write them, keys sorted:
 *  - dropped: the primary key, audit stamps, owner stamps, `ignoreColumns`, and every annotation except a lookup's name
 *  - any value that is a GUID (lookups `_x_value` above all): "<guid>", so set vs null still compares; the project lookup
 *    "<project>"
 *  - a lookup's name annotation kept as `_x_value@name` (the project lookup's dropped: the two apps may write different
 *    projects), so WHICH row a lookup points at still compares
 *  - every string: this run's `tag` replaced by "<tag>"
 *  - rows sorted by the table's `sortKey` columns (of the normalised row, `compareCells`), then by the normalised JSON
 * An autonumber or another value that differs by nature goes in the table's `ignoreColumns`.
 */
export function normaliseRows(rows: readonly Row[], table: Pick<TableSpec, "primaryKey" | "projectLookup" | "ignoreColumns" | "sortKey">, tag: string): Row[] {
  const ignore = new Set(table.ignoreColumns ?? []);
  const untag = (v: unknown): unknown => (typeof v === "string" && tag ? v.split(tag).join("<tag>") : v);
  const one = (row: Row): Row => {
    const out: Row = {};
    for (const key of Object.keys(row).sort()) {
      const v = row[key];
      const at = key.indexOf("@");
      if (at >= 0) {
        const base = key.slice(0, at);
        if (key.slice(at) === LOOKUP_NAME && /^_.+_value$/.test(base) && base !== table.projectLookup && !OWNER.test(base) && !ignore.has(base)) {
          out[`${base}@name`] = untag(v);
        }
        continue;
      }
      if (key === table.primaryKey || AUDIT.has(key) || OWNER.test(key) || ignore.has(key)) continue;
      if (key === table.projectLookup) { out[key] = v === null || v === undefined ? null : "<project>"; continue; }
      out[key] = typeof v === "string" && GUID.test(v) ? "<guid>" : untag(v);
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  };
  const sortKey = table.sortKey ?? [];
  return rows.map(one).map((r) => ({ r, k: JSON.stringify(r) }))
    .sort((a, b) => {
      for (const col of sortKey) {
        const c = compareCells(a.r[col], b.r[col]);
        if (c !== 0) return c;
      }
      return a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
    })
    .map((x) => x.r);
}

/** `normaliseRows` for every table of `rows` (tables of `tables` only, in manifest order). */
export function normaliseTables(rows: TableRows, tables: readonly TableSpec[], tag: string): TableRows {
  const out: TableRows = {};
  for (const t of tables) out[t.name] = normaliseRows(rows[t.name] ?? [], t, tag);
  return out;
}

/* ─────────────────────────────────────────────────────────── fingerprint ── */

/**
 * The default data fingerprint (contract `ScreenManifest.fingerprint`): for each table with a `projectLookup`, the row
 * count of the project (`<name>.count`) and its latest `modifiedon` (`<name>.modifiedon`, "" when it has no rows). With no
 * project (an Application Settings screen), the row count of every table. Counts and dates only, never values.
 * `@odata.count` is capped at 5000 by the platform; that is enough to notice a change.
 */
export async function defaultFingerprint(page: Page, manifest: Pick<ScreenManifest, "tables">, projectId: string | null): Promise<Record<string, number | string>> {
  if (projectId !== null && !GUID.test(projectId)) throw new Error("projectId must be a GUID");
  const plan = manifest.tables
    .filter((t) => projectId === null || t.projectLookup)
    .map((t) => ({
      name: t.name, service: t.service, serviceModule: t.serviceModule, primaryKey: t.primaryKey,
      filter: projectId === null ? undefined : `${t.projectLookup} eq ${projectId}`, dated: projectId !== null,
    }));
  if (!plan.length) return {};
  return codeFrame(page).evaluate(async (steps) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
    const { fetchAll } = await load("/src/data/client.ts");
    const out: Record<string, number | string> = {};
    for (const s of steps) {
      const svc = (await load(s.serviceModule))[s.service];
      if (!svc || typeof svc.getAll !== "function") throw new Error(`${s.serviceModule} has no service "${s.service}" with getAll`);
      const select = s.dated ? [s.primaryKey, "modifiedon"] : [s.primaryKey];
      const r = await svc.getAll({ select, top: 1, count: true, ...(s.filter ? { filter: s.filter } : {}), ...(s.dated ? { orderBy: ["modifiedon desc"] } : {}) });
      if (r?.success === false) throw new Error(`fingerprint ${s.name}: read failed: ${JSON.stringify(r.error).slice(0, 200)}`);
      let count = typeof r?.count === "number" ? r.count : -1;
      // No server count on this SDK: walk the ids instead (still no values).
      if (count < 0) count = (await fetchAll(`parity fingerprint ${s.name}`, (o: unknown) => svc.getAll(o), { select: [s.primaryKey], ...(s.filter ? { filter: s.filter } : {}) })).length;
      out[`${s.name}.count`] = count;
      if (s.dated) out[`${s.name}.modifiedon`] = String((r?.data?.[0] as Record<string, unknown> | undefined)?.modifiedon ?? "");
    }
    return out;
  }, plan);
}
