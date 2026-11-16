#!/usr/bin/env node
/**
 * Generators orphan report and guarded one-off clean-up (DEL-8, `ProjectDocs/app-docs/GENERATORS-DELETE-HARDENING-PLAN.md`).
 *
 * SAFE BY DEFAULT. With no flag this script only READS. It never deletes unless `--apply` is given together with
 * `--class`, `--manifest` and `--yes-delete`. It is meant to be run by a person, against a TEST environment first, and
 * the product owner reviews the report before anything is deleted (plan section 6, question 4).
 *
 * Usage (from ProjectCosts-CodeApp/):
 *   node scripts/generators-orphans.mjs [--report] [--project <guid>] [--out <dir>]      live read-only report (default)
 *   node scripts/generators-orphans.mjs --input <snapshot.json> [--out <dir>]              classify a saved snapshot offline
 *   node scripts/generators-orphans.mjs --apply --dry-run --class B1 --manifest ids.txt    what --apply would do (reads only)
 *   node scripts/generators-orphans.mjs --apply --class B1 --manifest ids.txt --yes-delete the ONLY way to delete
 *
 * Live mode needs two environment variables and nothing else: DATAVERSE_URL (the org URL, https) and DATAVERSE_TOKEN
 * (a bearer token). The token is read from the environment only; it is never printed, logged, written to a file or put
 * in a URL, and it is sent only to the origin of DATAVERSE_URL (a paging link to any other origin is refused).
 * Exit codes: 0 done, 1 a request failed or something is still present, 2 usage or configuration error (nothing was sent).
 *
 * Classes (all queries are `$select`ed, filtered on the server, paged with @odata.nextLink up to 50 pages):
 *   B1 allocations with no turbine          B5 bridge rows with no type
 *   B2 allocations with no cost (expect 0)  B6 turbines with no type
 *   B3 O&M costs with no bridge             B7 phantom types (no model or no project)
 *   B4 types with more than one bridge (report only)
 *   B8 non-all-WTG land-lease costs with no allocation, or whose allocations all have no turbine (report only)
 * B8 is read client-side (costs, then their allocations in chunks of 40 ids) because an outer-join FetchXML cannot be paged
 * with @odata.nextLink; only ACTIVE costs are examined. With `--project`, B5 and B6 are skipped (their rows carry no project
 * column) and B4 is skipped (the bridge's type is polymorphic); B1/B2/B8 are scoped through the project's costs.
 *
 * Console output is COUNTS ONLY (no names, values or ids). `--out <dir>` (default: a new folder under the OS temp dir,
 * `generators-orphans-<timestamp>`) receives one CSV per class (id, name, lookup ids) and `summary.json`. CSVs hold ids
 * and names: treat the folder as confidential and keep it out of the repo.
 *
 * `--apply` (classes B1, B2, B3, B5, B6, B7 only; B4 and B8 are report-only):
 *   1. reads every id of `--manifest` (a plain text file, one id per line, `#` starts a comment) back from Dataverse;
 *   2. REFUSES the whole run, deleting nothing, when any id is not currently in the chosen class (a 404 is "already gone");
 *   3. writes a JSON backup of the full rows into `--out` BEFORE the first delete;
 *   4. deletes 4 at a time (429/503 retried up to 3 tries, honouring Retry-After; 404 = already gone);
 *   5. reads every id back and reports the ones still present.
 * Tested offline in `src/test/generatorsOrphans.test.ts` (UT-ORPH-*), with an injected fetch, clock, file system and console.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const API_PATH = "/api/data/v9.2/";
export const MAX_PAGES = 50;
export const DELETE_CONCURRENCY = 4;
export const MAX_TRIES = 3;
export const CHUNK = 40;
export const REQUEST_TIMEOUT_MS = 30000;
export const OM_SUBACCOUNT_NAME = "Operation & Maintenance";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** True for a bare GUID (no braces, no quotes), the only shape ever put into a query. */
export const isGuid = (v) => typeof v === "string" && GUID_RE.test(v);

/**
 * The classes. Entity-set names and column logical names are checked against
 * `ProjectDocs/reference/dataverse-entities.json` and `src/data/dataverseNames.ts` (ES, ES_PLANT) by UT-ORPH-016.
 */
export const CLASSES = {
  B1: { label: "allocations with no turbine", set: "vsb_landleaseallocationwtgs", id: "vsb_landleaseallocationwtgid", name: "vsb_name", lookups: ["_vsb_projectcost_value", "_vsb_generatorinproject_value"], reportOnly: false },
  B2: { label: "allocations with no cost", set: "vsb_landleaseallocationwtgs", id: "vsb_landleaseallocationwtgid", name: "vsb_name", lookups: ["_vsb_projectcost_value", "_vsb_generatorinproject_value"], reportOnly: false },
  B3: { label: "O&M costs with no bridge", set: "vsb_opexprojectcosts", id: "vsb_opexprojectcostid", name: "vsb_name", lookups: ["_vsb_project_value", "_vsb_parentcost_value", "_vsb_devicetypeinproject_value", "_vsb_subaccount_value"], reportOnly: false },
  B4: { label: "types with more than one bridge", set: "vsb_devicetypesinprojects", id: "vsb_devicetypesinprojectid", name: "vsb_name", lookups: ["_vsb_typeinprojectid_value"], reportOnly: true },
  B5: { label: "bridge rows with no type", set: "vsb_devicetypesinprojects", id: "vsb_devicetypesinprojectid", name: "vsb_name", lookups: ["_vsb_typeinprojectid_value"], reportOnly: false },
  B6: { label: "turbines with no type", set: "vsb_generatorinprojects", id: "vsb_generatorinprojectid", name: "vsb_name", lookups: ["_vsb_moduletypeinprojectid_value"], reportOnly: false },
  B7: { label: "phantom types (no model or no project)", set: "vsb_generatortypeinprojects", id: "vsb_generatortypeinprojectid", name: "vsb_name", lookups: ["_vsb_generator_value", "_vsb_project_value"], reportOnly: false },
  B8: { label: "land-lease costs with no usable allocation", set: "vsb_landleaseprojectcosts", id: "vsb_landleaseprojectcostid", name: "vsb_name", lookups: ["_vsb_project_value"], reportOnly: true },
};
export const CLASS_IDS = Object.keys(CLASSES);
export const APPLY_CLASSES = CLASS_IDS.filter((c) => !CLASSES[c].reportOnly);

const isNull = (v) => v === null || v === undefined || v === "";
const asRows = (v) => (Array.isArray(v) ? v : []);

/* ═══════════════════════════════════════════════════════════════ arguments ══ */

/** Parses argv (without node and script). Returns options plus `errors` (usage problems; nothing is read or sent). */
export function parseArgs(argv) {
  const o = { apply: false, dryRun: false, yesDelete: false, input: undefined, project: undefined, out: undefined, class: undefined, manifest: undefined, errors: [] };
  const valued = new Set(["--input", "--project", "--out", "--class", "--manifest"]);
  const flags = new Set(["--report", "--apply", "--dry-run", "--yes-delete"]);
  for (let i = 0; i < argv.length; i++) {
    let tok = String(argv[i]);
    let val;
    const eqAt = tok.indexOf("=");
    if (tok.startsWith("--") && eqAt > 0) { val = tok.slice(eqAt + 1); tok = tok.slice(0, eqAt); }
    if (flags.has(tok)) {
      if (val !== undefined) o.errors.push(`${tok} takes no value`);
      if (tok === "--apply") o.apply = true;
      else if (tok === "--dry-run") o.dryRun = true;
      else if (tok === "--yes-delete") o.yesDelete = true;
    } else if (valued.has(tok)) {
      if (val === undefined) val = argv[++i];
      if (val === undefined || String(val).startsWith("--")) { o.errors.push(`${tok} needs a value`); if (val !== undefined) i--; continue; }
      const key = tok.slice(2);
      o[key] = String(val);
    } else {
      o.errors.push(`unknown argument ${tok.startsWith("--") ? tok : "(positional)"}`);
    }
  }
  if (o.project !== undefined) {
    if (isGuid(o.project)) o.project = o.project.toLowerCase();
    else { o.errors.push("--project must be a GUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"); o.project = undefined; }
  }
  if (o.class !== undefined) {
    o.class = o.class.toUpperCase();
    if (!CLASS_IDS.includes(o.class)) o.errors.push(`--class must be one of ${CLASS_IDS.join(", ")}`);
  }
  if (o.dryRun) o.apply = true;
  o.mode = o.apply ? "apply" : "report";
  if (o.apply && o.input) o.errors.push("--input is a read-only mode and cannot be combined with --apply or --dry-run");
  if (o.apply && o.project) o.errors.push("--project cannot be combined with --apply: the manifest is the scope");
  return o;
}

/** Why `--apply` must refuse (an empty list means it may go on). `--dry-run` does not need `--yes-delete`. */
export function applyProblems(o) {
  const p = [];
  if (!o.class) p.push("--class <B1|B2|B3|B5|B6|B7> is required");
  else if (CLASSES[o.class]?.reportOnly) p.push(`class ${o.class} is report-only and cannot be deleted`);
  if (!o.manifest) p.push("--manifest <file> is required");
  if (!o.dryRun && !o.yesDelete) p.push("--yes-delete is required");
  return p;
}

/* ═════════════════════════════════════════════════════════ classification ══ */

/** `class` membership of ONE row. `omIds` is the set of O&M sub-account ids (B3). Pure. */
export function rowInClass(cls, row, omIds) {
  if (!row || typeof row !== "object") return false;
  switch (cls) {
    case "B1": return isNull(row._vsb_generatorinproject_value);
    case "B2": return isNull(row._vsb_projectcost_value);
    case "B3": return isNull(row._vsb_devicetypeinproject_value) && !isNull(row._vsb_subaccount_value) && (omIds ?? new Set()).has(String(row._vsb_subaccount_value).toLowerCase());
    case "B5": return isNull(row._vsb_typeinprojectid_value);
    case "B6": return isNull(row._vsb_moduletypeinprojectid_value);
    case "B7": return isNull(row._vsb_generator_value) || isNull(row._vsb_project_value);
    default: return false;
  }
}

const idOf = (cls, row) => String(row[CLASSES[cls].id] ?? "").toLowerCase();

/**
 * Classifies a snapshot (the raw results of the queries, keyed `B1`, `B2`, `B3`, `B4`, `B5`, `B6`, `B7`, `B8costs`,
 * `B8allocations`, plus `omSubaccountIds`). Every row is re-checked against its class predicate, so a snapshot that holds
 * extra rows is still classified correctly. Returns `{ classes, counts, details }`; `classes[Bn]` is a list of
 * `{ id, name, lookups }` (B4: one entry per bridge of an affected type, B8: one per cost with a `reason`).
 */
export function classify(snapshot) {
  const snap = snapshot ?? {};
  const omIds = new Set(asRows(snap.omSubaccountIds).map((v) => String(v).toLowerCase()));
  const classes = {};
  const entry = (cls, row, extra = {}) => ({
    id: idOf(cls, row),
    name: String(row[CLASSES[cls].name] ?? ""),
    lookups: Object.fromEntries(CLASSES[cls].lookups.map((k) => [k, isNull(row[k]) ? "" : String(row[k]).toLowerCase()])),
    ...extra,
  });
  const simple = (cls, source) => {
    const seen = new Set();
    classes[cls] = asRows(snap[source ?? cls])
      .filter((r) => rowInClass(cls, r, omIds) && idOf(cls, r) && !seen.has(idOf(cls, r)) && seen.add(idOf(cls, r)))
      .map((r) => entry(cls, r));
  };
  for (const cls of ["B1", "B2", "B3", "B5", "B6", "B7"]) simple(cls);

  // B4: group the bridge rows by type, ordered by createdon; any type with two or more rows is reported.
  const byType = new Map();
  const seen4 = new Set();
  for (const r of asRows(snap.B4)) {
    const t = r._vsb_typeinprojectid_value;
    const id = idOf("B4", r);
    if (isNull(t) || !id || seen4.has(id)) continue;
    seen4.add(id);
    const key = String(t).toLowerCase();
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(r);
  }
  const groups = [];
  classes.B4 = [];
  for (const [typeId, rows] of byType) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => String(a.createdon ?? "").localeCompare(String(b.createdon ?? "")) || idOf("B4", a).localeCompare(idOf("B4", b)));
    groups.push({ typeId, bridges: rows.length });
    rows.forEach((r, i) => classes.B4.push(entry("B4", r, { typeId, rank: i + 1, createdon: String(r.createdon ?? "") })));
  }

  // B8: non-all-WTG costs (active) with no allocation, or whose every allocation has no turbine.
  const allocByCost = new Map();
  const seenAlloc = new Set();
  for (const a of asRows(snap.B8allocations)) {
    const aid = String(a.vsb_landleaseallocationwtgid ?? "").toLowerCase();
    if (aid && seenAlloc.has(aid)) continue;
    if (aid) seenAlloc.add(aid);
    if (isNull(a._vsb_projectcost_value)) continue;
    const key = String(a._vsb_projectcost_value).toLowerCase();
    if (!allocByCost.has(key)) allocByCost.set(key, []);
    allocByCost.get(key).push(a);
  }
  classes.B8 = [];
  const seen8 = new Set();
  let noAllocation = 0;
  let allNullTurbine = 0;
  for (const c of asRows(snap.B8costs)) {
    const id = idOf("B8", c);
    if (!id || seen8.has(id) || c.vsb_allwtgallocated === true) continue;
    if (c.statecode !== undefined && c.statecode !== 0) continue;
    seen8.add(id);
    const allocs = allocByCost.get(id) ?? [];
    if (allocs.length === 0) { noAllocation++; classes.B8.push(entry("B8", c, { reason: "no-allocation" })); }
    else if (allocs.every((a) => isNull(a._vsb_generatorinproject_value))) { allNullTurbine++; classes.B8.push(entry("B8", c, { reason: "all-allocations-without-turbine" })); }
  }

  const counts = Object.fromEntries(CLASS_IDS.map((c) => [c, classes[c].length]));
  counts.B4 = groups.length; // types, not bridge rows
  return { classes, counts, details: { B4Groups: groups, B4BridgeRows: classes.B4.length, B8NoAllocation: noAllocation, B8AllNullTurbine: allNullTurbine } };
}

/* ═══════════════════════════════════════════════════════════════════ CSV ══ */

/** One CSV cell, quoted per RFC 4180; a leading `= + - @` is neutralised so a spreadsheet does not run a name as a formula. */
export function csvCell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The CSV text of one class (header, then one row per entry). */
export function toCsv(cls, entries) {
  const extra = cls === "B4" ? ["typeId", "rank", "createdon"] : cls === "B8" ? ["reason"] : [];
  const lookups = CLASSES[cls].lookups;
  const header = ["id", "name", ...lookups, ...extra];
  const lines = [header.map(csvCell).join(",")];
  for (const e of entries) lines.push([e.id, e.name, ...lookups.map((k) => e.lookups[k] ?? ""), ...extra.map((k) => e[k] ?? "")].map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/* ═════════════════════════════════════════════════════════ HTTP plumbing ══ */

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

/** `Retry-After` as milliseconds (seconds or an HTTP date), or `undefined`. Bounded to 60 s. */
export function retryAfterMs(header, nowMs) {
  if (header === null || header === undefined || header === "") return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs * 1000), 60000);
  const at = Date.parse(String(header));
  return Number.isFinite(at) ? Math.min(Math.max(0, at - nowMs), 60000) : undefined;
}

/** Reads `DATAVERSE_URL` and `DATAVERSE_TOKEN`. `{ ok: false, message }` when either is missing or the URL is not https. */
export function readEnv(env) {
  const url = String(env?.DATAVERSE_URL ?? "").trim();
  const token = String(env?.DATAVERSE_TOKEN ?? "").trim();
  const missing = [!url && "DATAVERSE_URL", !token && "DATAVERSE_TOKEN"].filter(Boolean);
  if (missing.length) return { ok: false, message: `missing environment variable(s): ${missing.join(", ")} (live mode reads them from the environment only)` };
  let u;
  try { u = new URL(url); } catch { return { ok: false, message: "DATAVERSE_URL is not a valid URL" }; }
  if (u.protocol !== "https:") return { ok: false, message: "DATAVERSE_URL must be an https URL" };
  return { ok: true, origin: u.origin, base: `${u.origin}${API_PATH}`, token };
}

/** Builds a request context: `request(method, url)` retries 429/503 (max 3 tries, Retry-After honoured) and times out. */
export function makeContext({ env, fetchImpl, sleep, now, timeoutMs }) {
  const e = readEnv(env);
  if (!e.ok) return e;
  const doFetch = fetchImpl ?? globalThis.fetch;
  const wait = sleep ?? sleepDefault;
  const clock = now ?? (() => new Date());
  const headersFor = (method) => ({
    Authorization: `Bearer ${e.token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    ...(method === "GET" ? { Prefer: "odata.maxpagesize=500" } : {}),
  });
  async function request(method, url) {
    if (!String(url).startsWith(e.origin + "/")) throw new Error("refused: request to a different origin than DATAVERSE_URL");
    for (let attempt = 1; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);
      let res;
      try { res = await doFetch(url, { method, headers: headersFor(method), signal: ctl.signal }); }
      catch (err) { throw new Error(ctl.signal.aborted ? `${method} timed out` : `${method} failed (${err?.name ?? "error"})`); }
      finally { clearTimeout(timer); }
      if ((res.status === 429 || res.status === 503) && attempt < MAX_TRIES) {
        const hinted = retryAfterMs(res.headers?.get?.("retry-after"), clock().getTime());
        await wait(hinted ?? Math.min(500 * 2 ** (attempt - 1), 8000));
        continue;
      }
      return res;
    }
  }
  return { ok: true, base: e.base, origin: e.origin, request };
}

const urlFor = (ctx, set, { select, filter, orderby } = {}) => {
  const q = [];
  if (select) q.push(`$select=${select.join(",")}`);
  if (filter) q.push(`$filter=${encodeURIComponent(filter)}`);
  if (orderby) q.push(`$orderby=${orderby.join(",")}`);
  return `${ctx.base}${set}${q.length ? `?${q.join("&")}` : ""}`;
};

/** Reads every page of one query (a GET with `@odata.nextLink`), up to MAX_PAGES. Returns `{ rows, truncated }`. */
export async function fetchPaged(ctx, set, query) {
  let url = urlFor(ctx, set, query);
  const rows = [];
  for (let page = 1; url; page++) {
    const res = await ctx.request("GET", url);
    if (res.status !== 200) throw new Error(`read of ${set} failed with HTTP ${res.status}`);
    const body = await res.json();
    rows.push(...asRows(body?.value));
    const next = body?.["@odata.nextLink"];
    if (!next) return { rows, truncated: false };
    if (!String(next).startsWith(ctx.origin + "/")) throw new Error("refused: paging link points to a different origin");
    if (page >= MAX_PAGES) return { rows, truncated: true };
    url = String(next);
  }
  return { rows, truncated: false };
}

const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
const orEq = (col, ids) => `(${ids.map((i) => `${col} eq ${i}`).join(" or ")})`;

/* ═════════════════════════════════════════════════════════ live snapshot ══ */

const SEL = {
  B1: ["vsb_landleaseallocationwtgid", "vsb_name", "_vsb_projectcost_value", "_vsb_generatorinproject_value"],
  B3: ["vsb_opexprojectcostid", "vsb_name", "_vsb_project_value", "_vsb_parentcost_value", "_vsb_devicetypeinproject_value", "_vsb_subaccount_value"],
  B4: ["vsb_devicetypesinprojectid", "vsb_name", "_vsb_typeinprojectid_value", "createdon"],
  B6: ["vsb_generatorinprojectid", "vsb_name", "_vsb_moduletypeinprojectid_value"],
  B7: ["vsb_generatortypeinprojectid", "vsb_name", "_vsb_generator_value", "_vsb_project_value"],
  B8: ["vsb_landleaseprojectcostid", "vsb_name", "_vsb_project_value", "vsb_allwtgallocated", "statecode"],
};

/** The O&M sub-account ids (by name). */
export async function readOmSubaccounts(ctx) {
  const { rows } = await fetchPaged(ctx, "vsb_opexsubaccounts", { select: ["vsb_opexsubaccountid", "vsb_name"], filter: `vsb_name eq '${OM_SUBACCOUNT_NAME}'` });
  return rows.map((r) => String(r.vsb_opexsubaccountid).toLowerCase()).filter(isGuid);
}

/**
 * Runs the report queries (read only) and returns a snapshot for `classify`, plus `truncated` (class -> true when the
 * 50-page cap was hit) and `skipped` (classes not run, with the reason).
 */
export async function readSnapshot(ctx, { project } = {}) {
  const snap = { truncated: {}, skipped: [] };
  const keep = (key, r) => { if (r.truncated) snap.truncated[key] = true; return r.rows; };
  const within = (parts) => parts.filter(Boolean).join(" and ");

  // Costs of the project (B1, B2 and B8 are scoped through them); without --project, B1/B2 are plain server-side filters.
  let projectCostIds;
  if (project) {
    const r = await fetchPaged(ctx, "vsb_landleaseprojectcosts", { select: ["vsb_landleaseprojectcostid"], filter: `_vsb_project_value eq ${project}` });
    if (r.truncated) snap.truncated.projectCosts = true;
    projectCostIds = r.rows.map((x) => String(x.vsb_landleaseprojectcostid).toLowerCase()).filter(isGuid);
  }
  for (const [cls, nullCol] of [["B1", "_vsb_generatorinproject_value"], ["B2", "_vsb_projectcost_value"]]) {
    if (!project) {
      snap[cls] = keep(cls, await fetchPaged(ctx, CLASSES[cls].set, { select: SEL.B1, filter: `${nullCol} eq null` }));
    } else {
      snap[cls] = [];
      if (cls === "B2") { snap.skipped.push("B2 (an allocation with no cost has no project)"); continue; }
      for (const part of chunks(projectCostIds, CHUNK)) snap[cls].push(...keep(cls, await fetchPaged(ctx, CLASSES[cls].set, { select: SEL.B1, filter: within([orEq("_vsb_projectcost_value", part), `${nullCol} eq null`]) })));
    }
  }

  snap.omSubaccountIds = await readOmSubaccounts(ctx);
  snap.B3 = snap.omSubaccountIds.length === 0 ? [] : keep("B3", await fetchPaged(ctx, "vsb_opexprojectcosts", {
    select: SEL.B3,
    filter: within([project && `_vsb_project_value eq ${project}`, "_vsb_devicetypeinproject_value eq null", `(${snap.omSubaccountIds.map((i) => `_vsb_subaccount_value eq ${i}`).join(" or ")})`]),
  }));

  if (project) {
    for (const c of ["B4", "B5", "B6"]) { snap[c] = []; snap.skipped.push(`${c} (its rows carry no project column)`); }
  } else {
    snap.B4 = keep("B4", await fetchPaged(ctx, "vsb_devicetypesinprojects", { select: SEL.B4, orderby: ["_vsb_typeinprojectid_value", "createdon"] }));
    snap.B5 = keep("B5", await fetchPaged(ctx, "vsb_devicetypesinprojects", { select: SEL.B4, filter: "_vsb_typeinprojectid_value eq null" }));
    snap.B6 = keep("B6", await fetchPaged(ctx, "vsb_generatorinprojects", { select: SEL.B6, filter: "_vsb_moduletypeinprojectid_value eq null" }));
  }
  snap.B7 = keep("B7", await fetchPaged(ctx, "vsb_generatortypeinprojects", {
    select: SEL.B7,
    filter: project ? `_vsb_project_value eq ${project} and _vsb_generator_value eq null` : "_vsb_generator_value eq null or _vsb_project_value eq null",
  }));

  // B8: active costs that are not all-WTG, then their allocations in chunks of 40 ids.
  snap.B8costs = keep("B8", await fetchPaged(ctx, "vsb_landleaseprojectcosts", {
    select: SEL.B8,
    filter: within([project && `_vsb_project_value eq ${project}`, "statecode eq 0", "vsb_allwtgallocated ne true"]),
  }));
  snap.B8allocations = [];
  const costIds = snap.B8costs.map((c) => String(c.vsb_landleaseprojectcostid).toLowerCase()).filter(isGuid);
  for (const part of chunks(costIds, CHUNK)) snap.B8allocations.push(...keep("B8", await fetchPaged(ctx, "vsb_landleaseallocationwtgs", { select: SEL.B1, filter: orEq("_vsb_projectcost_value", part) })));
  return snap;
}

/* ════════════════════════════════════════════════════════════ default deps ══ */

export const defaultIo = {
  readFile: (p) => fs.readFileSync(p, "utf8"),
  writeFile: (p, text) => fs.writeFileSync(p, text, "utf8"),
  mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
  tmpdir: () => os.tmpdir(),
};

const stamp = (d) => d.toISOString().replace(/[:.]/g, "-");

/** Wraps the console so no line ever carries the token, whatever produced it. */
function guardedLog(deps, token) {
  const raw = deps.log ?? ((l) => console.log(l));
  const rawErr = deps.err ?? ((l) => console.error(l));
  const scrub = (l) => { const s = String(l); return token && s.includes(token) ? s.split(token).join("***") : s; };
  return { log: (l) => raw(scrub(l)), err: (l) => rawErr(scrub(l)) };
}

const withDefaults = (deps = {}) => ({ io: defaultIo, now: () => new Date(), ...deps });

function outDirFor(o, deps) {
  return o.out ? path.resolve(o.out) : path.join(deps.io.tmpdir(), `generators-orphans-${stamp(deps.now())}`);
}

/* ═════════════════════════════════════════════════════════════════ report ══ */

/**
 * Report mode (read only). Returns the exit code. Reads `--input` offline, or queries Dataverse (live). Writes the CSVs and
 * `summary.json` into `--out`; prints counts only.
 */
export async function runReport(o, rawDeps) {
  const deps = withDefaults(rawDeps);
  const g = guardedLog(deps, deps.env?.DATAVERSE_TOKEN);
  let snapshot;
  if (o.input) {
    try { snapshot = JSON.parse(deps.io.readFile(path.resolve(o.input))); }
    catch { g.err("cannot read --input as JSON"); return 2; }
  } else {
    const ctx = makeContext(deps);
    if (!ctx.ok) { g.err(ctx.message); return 2; }
    try { snapshot = await readSnapshot(ctx, { project: o.project }); }
    catch (err) { g.err(`report failed: ${err.message}`); return 1; }
  }
  const result = classify(snapshot);
  const outDir = outDirFor(o, deps);
  deps.io.mkdirp(outDir);
  for (const cls of CLASS_IDS) deps.io.writeFile(path.join(outDir, `${cls}.csv`), toCsv(cls, result.classes[cls]));
  const summary = {
    generatedAt: deps.now().toISOString(),
    source: o.input ? "snapshot" : "live",
    projectScoped: Boolean(o.project),
    counts: result.counts,
    details: { B4BridgeRows: result.details.B4BridgeRows, B8NoAllocation: result.details.B8NoAllocation, B8AllNullTurbine: result.details.B8AllNullTurbine },
    truncated: snapshot.truncated ?? {},
    skipped: asRows(snapshot.skipped),
  };
  deps.io.writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  g.log(`Generators orphan report (${summary.source}${summary.projectScoped ? ", one project" : ""}) - counts only`);
  for (const cls of CLASS_IDS) {
    const extra = cls === "B4" ? ` (${result.details.B4BridgeRows} bridge rows)` : cls === "B8" ? ` (no allocation: ${result.details.B8NoAllocation}, allocations without turbine: ${result.details.B8AllNullTurbine})` : "";
    g.log(`${cls} ${CLASSES[cls].label}: ${result.counts[cls]}${extra}${snapshot.truncated?.[cls] ? " [TRUNCATED at 50 pages]" : ""}`);
  }
  for (const s of asRows(snapshot.skipped)) g.log(`skipped: ${s}`);
  g.log(`files written to ${outDir}`);
  return 0;
}

/* ═════════════════════════════════════════════════════════════════ apply ══ */

/** Parses a manifest (one id per line, blanks and `#` comments ignored). `{ ids, bad }`; `bad` counts malformed lines. */
export function parseManifest(text) {
  const ids = [];
  let bad = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (isGuid(line)) { const id = line.toLowerCase(); if (!ids.includes(id)) ids.push(id); } else bad++;
  }
  return { ids, bad };
}

/** Runs `worker` over `items`, `limit` at a time; never throws (a rejected worker is recorded as an error result). */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i]); } catch (err) { results[i] = { error: err?.message ?? "error" }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** `--apply` / `--dry-run`. Returns the exit code. Deletes ONLY after every refusal check passed. */
export async function runApply(o, rawDeps) {
  const deps = withDefaults(rawDeps);
  const g = guardedLog(deps, deps.env?.DATAVERSE_TOKEN);
  const problems = applyProblems(o);
  if (problems.length) {
    g.err(`refused: ${problems.join("; ")}. Nothing was read or deleted.`);
    return 2;
  }
  const ctx = makeContext(deps);
  if (!ctx.ok) { g.err(ctx.message); return 2; }
  let manifest;
  try { manifest = parseManifest(deps.io.readFile(path.resolve(o.manifest))); }
  catch { g.err("refused: cannot read --manifest. Nothing was deleted."); return 2; }
  if (manifest.bad > 0) { g.err(`refused: ${manifest.bad} manifest line(s) are not GUIDs. Nothing was deleted.`); return 2; }
  if (manifest.ids.length === 0) { g.err("refused: the manifest holds no ids. Nothing was deleted."); return 2; }

  const meta = CLASSES[o.class];
  const rowUrl = (id) => `${ctx.base}${meta.set}(${id})`;
  try {
    const omIds = o.class === "B3" ? new Set(await readOmSubaccounts(ctx)) : undefined;
    // 1. Read every manifest id back (one GET each; the full row is needed for the backup).
    const reads = await pool(manifest.ids, DELETE_CONCURRENCY, async (id) => {
      const res = await ctx.request("GET", rowUrl(id));
      if (res.status === 404) return { id, gone: true };
      if (res.status !== 200) throw new Error(`read-back failed with HTTP ${res.status}`);
      return { id, row: await res.json() };
    });
    const failed = reads.filter((r) => r.error);
    if (failed.length) { g.err(`read of ${failed.length} manifest id(s) failed. Nothing was deleted.`); return 1; }
    const present = reads.filter((r) => r.row);
    const gone = reads.filter((r) => r.gone).length;
    const outside = present.filter((r) => !rowInClass(o.class, r.row, omIds)).length;
    if (outside > 0) {
      g.err(`refused: ${outside} manifest id(s) are not currently in class ${o.class}. Nothing was deleted.`);
      return 2;
    }
    if (o.dryRun) {
      g.log(`dry run, class ${o.class}: ${present.length} row(s) would be deleted (4 at a time), ${gone} already gone; a backup would be written first. Nothing was changed.`);
      return 0;
    }
    if (present.length === 0) { g.log(`class ${o.class}: nothing to delete (${gone} already gone).`); return 0; }

    // 2. Backup BEFORE the first delete.
    const outDir = outDirFor(o, deps);
    deps.io.mkdirp(outDir);
    const backupFile = path.join(outDir, `backup-${o.class}-${stamp(deps.now())}.json`);
    deps.io.writeFile(backupFile, `${JSON.stringify({ class: o.class, entitySet: meta.set, createdAt: deps.now().toISOString(), rows: present.map((r) => r.row) }, null, 2)}\n`);

    // 3. Delete, 4 at a time. 404 = already gone.
    const deletes = await pool(present, DELETE_CONCURRENCY, async (r) => {
      const res = await ctx.request("DELETE", rowUrl(r.id));
      if (res.status === 404) return { id: r.id, gone: true };
      if (res.status >= 200 && res.status < 300) return { id: r.id, deleted: true };
      return { id: r.id, error: `HTTP ${res.status}` };
    });
    const deleted = deletes.filter((d) => d.deleted).length;
    const goneNow = deletes.filter((d) => d.gone).length;
    const errors = deletes.filter((d) => d.error).length;

    // 4. Read every id back; report those still present.
    const back = await pool(manifest.ids, DELETE_CONCURRENCY, async (id) => {
      const res = await ctx.request("GET", rowUrl(id));
      if (res.status === 404) return { id, gone: true };
      if (res.status === 200) return { id, stillPresent: true };
      return { id, error: `HTTP ${res.status}` };
    });
    const stillPresent = back.filter((b) => b.stillPresent).length;
    const unknown = back.filter((b) => b.error).length;
    g.log(`class ${o.class}: deleted ${deleted}, already gone ${gone + goneNow}, delete errors ${errors}, still present after read-back ${stillPresent}${unknown ? `, read-back failed ${unknown}` : ""}.`);
    g.log(`backup of ${present.length} row(s) written to ${backupFile}`);
    return errors + stillPresent + unknown > 0 ? 1 : 0;
  } catch (err) {
    g.err(`apply stopped: ${err.message}`);
    return 1;
  }
}

/* ══════════════════════════════════════════════════════════════════ main ══ */

/** Entry point: parses `argv`, dispatches, returns the exit code (the CLI sets `process.exitCode`). */
export async function main(argv, deps = {}) {
  const o = parseArgs(argv);
  const g = guardedLog(deps, deps.env?.DATAVERSE_TOKEN);
  if (o.errors.length) { g.err(`usage error: ${o.errors.join("; ")}`); return 2; }
  return o.mode === "apply" ? runApply(o, deps) : runReport(o, deps);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), { env: process.env }).then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
}
