/**
 * Project Gates (Application Settings) — every Dataverse read and write of the screen that
 * replaces the canvas `Admin Project Gates Approvals Screen`.
 *
 * Everything sits behind ONE repository object (`projectGatesRepository`) so the screen never
 * talks to a service directly, and so the three tables below can move to generated services
 * without touching anything else.
 *
 * THE THREE CHECKLIST TABLES (no generated service yet) are read and written through the
 * shared repository `@/data/settings/checklistTables` (M9) — the ONE place their entity sets,
 * columns, row types and raw-client plumbing live:
 *
 *   vsb_checklistdefaultapprovals      vsb_checklistdefaultapprovalses   R C U D
 *   vsb_projectdefaultchecklists       vsb_projectdefaultchecklistses     R
 *   vsb_checklistcountryandtechnology  vsb_checklistcountryandtechnologies R
 *
 * A thrown SDK error or `success: false` becomes a `DataError` whose operation names the entity
 * set (`read <entityset>`), so `describeTableFailure` can still say which table is unavailable.
 * Gate templates keep the generated `Vsb_projectdefaultapprovalsesService`.
 *
 * Countries come from the shared `@/data/countries` read (`useCountries({ includeInactive: true })`).
 *
 * Inactive rows (`statecode = 1`) are NOT filtered on the server — decision D-13 is open. The
 * one exception is checklist tasks (gap closure G-4): "To Delete" tasks are filtered on the
 * server by the shared repository (its default), and inactive tasks are mapped (`active`) so the
 * rules hide them from the grid and from Add Task.
 */
import { Vsb_projectdefaultapprovalsesService } from "@/generated/services/Vsb_projectdefaultapprovalsesService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { AadusersService } from "@/generated/services/AadusersService";
import type { Vsb_projectdefaultapprovalsesBase } from "@/generated/models/Vsb_projectdefaultapprovalsesModel";
import { DataError } from "@/platform/errors";
import { fetchAll, updateRecordIfExists } from "../client";
import { guardedCall } from "../rawTable";
import { and, chunk, eq, lookupEq, or, startsWith } from "../odata";
import { CHECKLIST_ENTITY_SETS, checklistTables, type ChecklistApproval } from "./checklistTables";

export { CHECKLIST_ENTITY_SETS };
export type { ChecklistApproval };

/* ═══════════════════════════════════════════════════════════════ entity sets ══ */

/** The generated tables this module reads directly; the checklist ones are in `CHECKLIST_ENTITY_SETS`. */
export const ES = {
  gateTemplates: "vsb_projectdefaultapprovalses",
  projectStates: "vsb_projectstates",
  aadusers: "aadusers",
} as const;

/** Human names for the tables, used when one turns out to be unavailable. */
export const TABLE_DISPLAY_NAME: Record<string, string> = {
  [CHECKLIST_ENTITY_SETS.approvals]: "Check List Default Approvals",
  [CHECKLIST_ENTITY_SETS.tasks]: "Project Default Checklists",
  [CHECKLIST_ENTITY_SETS.headers]: "Checklist Country And Technologies",
};

/* ════════════════════════════════════════════════════════ screen-level shapes ══ */

export interface ProjectState {
  id: string;
  name: string;
  order: number | null;
  visibleOnChecklist: boolean;
  /** `_owningbusinessunit_value`, copied onto saved templates (D-16, canvas parity). */
  businessUnitId: string | null;
}

/** Project Default Approvals (gate template). The JSON columns are kept raw. */
export interface GateTemplate {
  id: string;
  name: string;
  mode: number | null;
  gateActive: boolean;
  stateId: string | null;
  pmId: string | null;
  contributors: string | null;
  approvals: string | null;
  notifications: string | null;
  createdOn: string | null;
}

export interface DefaultChecklist {
  id: string;
  name: string;
  order: number | null;
  stateId: string | null;
  /** `statecode = 0`. Inactive tasks are hidden from the grid and from Add Task (G-4). */
  active: boolean;
  /** `vsb_todelete`. Filtered on the server; kept so the rules can hide one defensively (G-4). */
  toDelete: boolean;
}

/**
 * One participant, as the canvas JSON stores it: `PersonaKey` = Entra object id
 * (`aaduser.id`), `PersonaName` = display name, `PersonaRole` = mail.
 */
export interface PersonRef {
  entraId: string;
  name: string;
  mail: string;
}

/** Everything the grid needs for one (country, technology), from one query key. */
export interface GatesDataset {
  templates: GateTemplate[];
  /** The Checklist Country And Technology header id; null when none matches. */
  checklistHeaderId: string | null;
  checklists: DefaultChecklist[];
  approvals: ChecklistApproval[];
  /** Portfolio Managers of gate and task rows, by Entra id. */
  people: Record<string, PersonRef>;
  /**
   * Set when the checklist half of the dataset could not be read (typically: one of the
   * missing tables is not yet a data source). The gate half still renders.
   */
  checklistError: string | null;
  /** Set when Portfolio Manager names could not be resolved. Non-fatal. */
  peopleError: string | null;
}

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

export const STATE_SELECT = [
  "vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "_owningbusinessunit_value",
];

export const TEMPLATE_SELECT = [
  "vsb_projectdefaultapprovalsid", "vsb_name", "vsb_approvalmodecode", "vsb_gateactive",
  "vsb_technologycode", "vsb_defaultapprovals", "vsb_defaultcontributors", "vsb_defaultnotifications",
  "_vsb_approvalscountry_value", "_vsb_clusterstate_value", "_vsb_approvalparticipant1_value", "createdon",
];

export const PEOPLE_SELECT = ["aaduserid", "id", "displayname", "mail"];

/** Graph-backed `aadusers` accepts few `or` clauses per filter; 15 is Graph's own cap. */
export const PEOPLE_CHUNK = 15;

/** `vsb_projectstates` — cached app-wide by the hook. */
async function listProjectStates(): Promise<ProjectState[]> {
  const rows = await fetchAll("list project states", (o) => Vsb_projectstatesService.getAll(o), {
    select: STATE_SELECT,
    orderBy: ["vsb_order asc"],
  });
  return rows.map((r) => ({
    id: r.vsb_projectstateid,
    name: r.vsb_name ?? "",
    order: typeof r.vsb_order === "number" ? r.vsb_order : null,
    visibleOnChecklist: r.vsb_isvisibleonchecklist === true,
    businessUnitId: r._owningbusinessunit_value ?? null,
  }));
}

/** R-5: gate templates for (country, technology), matched by choice CODE (DR-3). */
async function listGateTemplates(countryId: string, techCode: number): Promise<GateTemplate[]> {
  const rows = await fetchAll("list gate approval templates", (o) => Vsb_projectdefaultapprovalsesService.getAll(o), {
    select: TEMPLATE_SELECT,
    filter: and(lookupEq("vsb_approvalscountry", countryId), eq("vsb_technologycode", techCode)),
    orderBy: ["createdon asc"],
  });
  return rows.map((r) => ({
    id: r.vsb_projectdefaultapprovalsid,
    name: r.vsb_name ?? "",
    mode: typeof r.vsb_approvalmodecode === "number" ? Number(r.vsb_approvalmodecode) : null,
    gateActive: r.vsb_gateactive === true,
    stateId: r._vsb_clusterstate_value ?? null,
    pmId: r._vsb_approvalparticipant1_value ?? null,
    contributors: r.vsb_defaultcontributors ?? null,
    approvals: r.vsb_defaultapprovals ?? null,
    notifications: r.vsb_defaultnotifications ?? null,
    createdOn: r.createdon ?? null,
  }));
}

/**
 * R-6 step 1: the checklist header for (country, technology). B10: ordered by `createdon` so
 * the pick is deterministic (the oldest wins) and a duplicate is reported. An `ACTIVE` filter
 * waits on decision D-13.
 */
async function findChecklistHeader(countryId: string, techCode: number): Promise<string | null> {
  // The shared reader orders a (country, technology) lookup by `createdon asc` (oldest first).
  const headers = await checklistTables.listChecklistHeaders({ countryId, technology: techCode });
  if (headers.length > 1) {
    console.warn(
      `[project-gates] ${headers.length} checklist headers match this country and technology; the oldest is used.`,
      headers.map((h) => h.id),
    );
  }
  return headers[0]?.id ?? null;
}

/** R-6 step 2: the checklist tasks hanging off that header, without "To Delete" ones (G-4). */
async function listDefaultChecklists(headerId: string): Promise<DefaultChecklist[]> {
  // `includeToDelete` is left at its default (false): the null-safe "To Delete" filter is sent.
  const tasks = await checklistTables.listDefaultChecklists({ headerId });
  return tasks.map((t) => ({
    id: t.id,
    name: t.name,
    order: t.order,
    stateId: t.clusterId,
    active: t.active,
    toDelete: t.toDelete,
  }));
}

/** R-6 step 3: approvals for those tasks, chunked 40 ids per request by the shared reader. */
function listChecklistApprovals(checklistIds: readonly string[]): Promise<ChecklistApproval[]> {
  return checklistTables.listChecklistApprovals({ checklistIds });
}

function toPerson(r: { aaduserid: string; id?: string; displayname?: string; mail?: string }): PersonRef {
  return { entraId: r.id || r.aaduserid, name: r.displayname ?? "", mail: r.mail ?? "" };
}

/**
 * DR-11: Portfolio Manager names for every distinct PM id, in ⌈n/15⌉ requests — never one
 * per row. `id` is the Entra object id, which is what the lookups hold (aaduserid = id).
 */
async function resolvePeople(ids: readonly string[]): Promise<Record<string, PersonRef>> {
  const distinct = [...new Set(ids.filter(Boolean))];
  const out: Record<string, PersonRef> = {};
  for (const part of chunk(distinct, PEOPLE_CHUNK)) {
    const rows = await fetchAll("resolve portfolio managers", (o) => AadusersService.getAll(o), {
      select: PEOPLE_SELECT,
      filter: or(...part.map((id) => eq("id", id))),
    });
    for (const r of rows) {
      const p = toPerson(r);
      out[p.entraId.toLowerCase()] = p;
    }
  }
  return out;
}

/**
 * DR-10 / D-22: people search over ENABLED Entra accounts in `aadusers`.
 *
 * `aadusers` and not `systemusers`, because the stored JSON contract is aaduser data:
 * `PersonaKey` = `aaduser.id`, `PersonaName` = `displayname`, `PersonaRole` = `mail`. A system
 * user's `fullname` / `internalemailaddress` are not guaranteed to hold the same strings, and
 * the downstream flows read these values verbatim. `startswith` (case-insensitive on Graph)
 * across display name, given name, surname and mail replaces the canvas `Search` (contains),
 * which the virtual table cannot evaluate server-side.
 */
async function searchPeople(term: string, limit = 25): Promise<PersonRef[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const rows = await fetchAll("search people", (o) => AadusersService.getAll(o), {
    select: PEOPLE_SELECT,
    filter: and(
      eq("accountenabled", true),
      or(startsWith("displayname", q), startsWith("givenname", q), startsWith("surname", q), startsWith("mail", q)),
    ),
    maxPageSize: limit,
    maxPages: 1,
  });
  return rows.map(toPerson).filter((p) => p.entraId);
}

/**
 * DR-2: one dataset per (country, technology): ≤ 5 + ⌈n/40⌉ reads plus the PM resolution;
 * the gate-template read runs in parallel with the checklist chain (B11).
 * The gate half (generated tables) must succeed; the checklist half is captured into
 * `checklistError` so a missing table degrades the screen instead of blanking it.
 */
async function loadDataset(countryId: string, techCode: number): Promise<GatesDataset> {
  // B11: the template read and the checklist chain are independent — run them in parallel.
  type ChecklistHalf = Pick<GatesDataset, "checklistHeaderId" | "checklists" | "approvals" | "checklistError">;
  const checklistHalf = async (): Promise<ChecklistHalf> => {
    try {
      const headerId = await findChecklistHeader(countryId, techCode);
      if (!headerId) return { checklistHeaderId: null, checklists: [], approvals: [], checklistError: null };
      const checklists = await listDefaultChecklists(headerId);
      const approvals = checklists.length ? await listChecklistApprovals(checklists.map((c) => c.id)) : [];
      return { checklistHeaderId: headerId, checklists, approvals, checklistError: null };
    } catch (error) {
      return { checklistHeaderId: null, checklists: [], approvals: [], checklistError: describeTableFailure(error) };
    }
  };
  const [templates, { checklistHeaderId, checklists, approvals, checklistError }] = await Promise.all([
    listGateTemplates(countryId, techCode),
    checklistHalf(),
  ]);

  let people: Record<string, PersonRef> = {};
  let peopleError: string | null = null;
  try {
    people = await resolvePeople([
      ...templates.map((t) => t.pmId ?? ""),
      ...approvals.map((a) => a.pmId ?? ""),
    ]);
  } catch (error) {
    peopleError = error instanceof Error ? error.message : String(error);
  }

  return { templates, checklistHeaderId, checklists, approvals, people, checklistError, peopleError };
}

/** Names the unavailable table when the error came from one of the missing ones. */
export function describeTableFailure(error: unknown): string {
  const operation = error instanceof DataError ? error.operation : "";
  const table = Object.keys(TABLE_DISPLAY_NAME).find((es) => operation.includes(es));
  if (table) {
    return `The table '${TABLE_DISPLAY_NAME[table]}' (${table}) could not be read. It may not be added to this app as a data source yet.`;
  }
  return error instanceof Error ? error.message : String(error);
}

/* ══════════════════════════════════════════════════════════════════ writes ══ */
// DR-8: one action = one write; every result through `unwrap`.

/** A JSON-able payload. Values are what the Web API takes: strings, numbers, booleans, null. */
export type Payload = Record<string, string | number | boolean | null>;

type PdaPatch = Partial<Omit<Vsb_projectdefaultapprovalsesBase, "vsb_projectdefaultapprovalsid">>;
type PdaCreate = Omit<Vsb_projectdefaultapprovalsesBase, "vsb_projectdefaultapprovalsid">;

/** FR-5 / W-3. */
async function setGateActive(id: string, active: boolean): Promise<void> {
  // V-1: guarded PATCH — a template deleted meanwhile raises RecordGoneError, never upserted.
  await updateRecordIfExists("update gate active", ES.gateTemplates, id, { vsb_gateactive: active });
}

/** FR-8 / W-2. */
function setTaskActive(id: string, active: boolean): Promise<void> {
  return checklistTables.updateChecklistApproval(id, { vsb_gateisactive: active });
}

/** FR-17 / W-7. `id` undefined → create. Returns the record id. */
async function saveGate(id: string | undefined, payload: Payload): Promise<string> {
  if (id) {
    // Null clears a column / lookup bind; the generated type has no `| null`, hence the cast.
    await updateRecordIfExists("update gate approval template", ES.gateTemplates, id, payload as unknown as PdaPatch); // V-1
    return id;
  }
  const created = await guardedCall(
    "create gate approval template",
    () => Vsb_projectdefaultapprovalsesService.create(payload as unknown as PdaCreate),
  );
  return created?.vsb_projectdefaultapprovalsid ?? "";
}

/** FR-18 / W-8. */
async function saveTask(id: string | undefined, payload: Payload): Promise<string> {
  if (id) {
    await checklistTables.updateChecklistApproval(id, payload);
    return id;
  }
  return (await checklistTables.createChecklistApproval(payload)) ?? "";
}

/** The Reset Gate payload (FR-19): deactivate and clear the four participant fields. */
export const RESET_GATE_PAYLOAD: Payload = {
  vsb_gateactive: false,
  "vsb_Approvalparticipant1@odata.bind": null,
  vsb_defaultcontributors: null,
  vsb_defaultapprovals: null,
  vsb_defaultnotifications: null,
};

/** FR-19 / W-6. `vsb_approvalmodecode` deliberately untouched (D-18, parity). */
async function resetGate(id: string): Promise<void> {
  await updateRecordIfExists("reset gate approval template", ES.gateTemplates, id, RESET_GATE_PAYLOAD as unknown as PdaPatch); // V-1
}

/**
 * FR-10 / W-9. A refused delete surfaces (like `client.ts`'s `deleteRecord`); the shared
 * repository also guards a throw from a table that is not yet a data source.
 */
function deleteTask(id: string): Promise<void> {
  return checklistTables.deleteChecklistApproval(id);
}

/**
 * The screen's only door to Dataverse (countries come from the shared `@/data/countries`).
 * Callers do not change when the checklist tables get generated services: that swap happens in
 * `checklistTables.ts`.
 */
export const projectGatesRepository = {
  listProjectStates,
  loadDataset,
  searchPeople,
  resolvePeople,
  setGateActive,
  setTaskActive,
  saveGate,
  saveTask,
  resetGate,
  deleteTask,
};

export type ProjectGatesRepository = typeof projectGatesRepository;
