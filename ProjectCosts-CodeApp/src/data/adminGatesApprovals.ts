/**
 * Admin Project Gates Approvals — the Dataverse reads behind
 * `features/admin/admin-gates-approvals` (connected 19 Oct 2026, D22). Every table was already
 * registered in `power.config.json`; `'Microsoft Entra IDs'` is the virtual table `aadusers`.
 *
 * No flow and no plugin step fires on `vsb_projectdefaultapprovals` or
 * `vsb_checklistdefaultapprovals` (04-flow-inventory.md, verified 19 Oct 2026). The request flows
 * that start gate / check-list approvals only READ these rows later.
 *
 * The same module also carries the Application Settings "Project Gates" repository
 * (`projectGatesRepository`, every read of the screen; its writes are `WritePlan`s built by the
 * screen's `rules.ts`) and the shared definitions both
 * halves use (`Persona`, the column maps, `entraSearchFilter`), so that the admin `rules.ts` files
 * stay pure. Layout: shared definitions, the read side other modules import, the repository.
 */
import { AadusersService } from "@/generated/services/AadusersService";
import { Vsb_checklistcountryandtechnologiesService } from "@/generated/services/Vsb_checklistcountryandtechnologiesService";
import { Vsb_checklistdefaultapprovalsesService } from "@/generated/services/Vsb_checklistdefaultapprovalsesService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_projectdefaultapprovalsesService } from "@/generated/services/Vsb_projectdefaultapprovalsesService";
import { Vsb_projectdefaultchecklistsesService } from "@/generated/services/Vsb_projectdefaultchecklistsesService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { DataError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { fetchAll, fetchPage } from "./client";
import { and, chunk, contains, eq, guid, idIn, lookupEq, or } from "./odata";
import { checklistTables, type ChecklistApproval as GateTaskApproval } from "./adminChecklistTables";
import { CHECKLIST_ENTITY_SETS } from "@/data/dataverseNames";

/** The checklist-table approval row the Project Gates repository returns (the master `ChecklistApproval` below is the read-side shape). */
export type { GateTaskApproval };

/* ═══════════════════════════ shared definitions ═══════════════════════════ */

/** A country reference (`data/adminGatesApprovals.ts` `listGateCountries`). */
export interface CountryRef { id: string; name: string }

/* ═══════════════════════════════════════════════════════════ the persona JSON ════ */

/**
 * One person of the canvas persona JSON (`{PersonaKey, PersonaName, PersonaRole}`):
 * `PersonaRole` carries the E-MAIL, `PersonaKey` the Entra object id (`aadusers.id`).
 */
export interface Persona {
  /** `PersonaKey` — the Entra object id (`aadusers.id`, which equals `aaduserid`). */
  id: string;
  /** `PersonaName` — the display name. */
  displayName: string;
  /** `PersonaRole` — the e-mail. */
  mail: string;
}

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `Project Default Approvals` (`vsb_projectdefaultapprovals`) — from the generated model. */
export const GATE_APPROVAL_COL = {
  id: "vsb_projectdefaultapprovalsid",
  name: "vsb_name",
  approvalMode: "vsb_approvalmodecode",
  /** `'Gate active'` on the GATE table. */
  gateActive: "vsb_gateactive",
  clusterState: "_vsb_clusterstate_value",
  country: "_vsb_approvalscountry_value",
  technology: "vsb_technologycode",
  /** `'Portfolio Manager'` — logical `vsb_approvalparticipant1`, a lookup to `aadusers`. */
  portfolioManager: "_vsb_approvalparticipant1_value",
  /** The GATE table calls the approver list `Default Approvals` … */
  defaultApprovals: "vsb_defaultapprovals",
  defaultContributors: "vsb_defaultcontributors",
  defaultNotifications: "vsb_defaultnotifications",
} as const;

/** `Check List Default Approvals` (`vsb_checklistdefaultapprovals`) — from the generated model. */
export const CHECKLIST_APPROVAL_COL = {
  id: "vsb_checklistdefaultapprovalsid",
  name: "vsb_name",
  approvalMode: "vsb_approvalmodecode",
  /** `'Gate active'` on the CHECK-LIST table is a different column: `vsb_gateisactive`. */
  gateActive: "vsb_gateisactive",
  projectDefaultChecklist: "_vsb_projectdefaultchecklistid_value",
  /** `'Portfolio Manager'` — logical `vsb_portfoliomanagerid`, a lookup to `aadusers`. */
  portfolioManager: "_vsb_portfoliomanagerid_value",
  /** … while the CHECK-LIST table calls the same concept `Default Approvers`. */
  defaultApprovers: "vsb_defaultapprovers",
  defaultContributors: "vsb_defaultcontributors",
  defaultNotifications: "vsb_defaultnotifications",
} as const;

/** `aadusers` columns (generated `AadusersModel`). */
export const ENTRA_COL = {
  /** Display name "Id" — the primary key. */
  rowId: "aaduserid",
  /** Display name "A unique identifer for Microsoft Entra ID" — the canvas `PersonaKey`. */
  objectId: "id",
  displayName: "displayname",
  givenName: "givenname",
  surname: "surname",
  mail: "mail",
  /** A Boolean (`'Microsoft Entra ID Account Enabled (…)'.Yes` = true). */
  accountEnabled: "accountenabled",
} as const;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface GateState {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
  owningBusinessUnitId: string | null;
}

export interface GateApproval {
  id: string;
  name: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  clusterStateId: string | null;
  countryId: string | null;
  technology: number | null;
  portfolioManagerId: string | null;
  defaultApprovals: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

export interface ChecklistApproval {
  id: string;
  name: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  projectDefaultChecklistId: string | null;
  portfolioManagerId: string | null;
  defaultApprovers: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

/** One `Project Default Checklists` template. */
export interface ChecklistItem {
  id: string;
  name: string;
  order: number;
  countryTechId: string | null;
  clusterStateId: string | null;
}

/* ══════════════════════════════════════════════════════ the Entra people search ════ */

/**
 * The `$filter` for `Search(Filter('Microsoft Entra IDs', 'Microsoft Entra ID Account Enabled' =
 * …Yes), Trim(term), 'Display Name', 'Given Name', Surname, Mail)` on `aadusers`:
 * `accountenabled eq true` and a case-insensitive `contains` on the four `Search` columns.
 * `undefined` for a blank term (no request).
 */
export function entraSearchFilter(term: string): string | undefined {
  const t = term.trim();
  if (!t) return undefined;
  return and(
    eq(ENTRA_COL.accountEnabled, true),
    or(
      contains(ENTRA_COL.displayName, t), contains(ENTRA_COL.givenName, t),
      contains(ENTRA_COL.surname, t), contains(ENTRA_COL.mail, t),
    ),
  );
}

/* ═══════════ legacy reads (PM General Data / Team / Checklist) ════════════ */

const num = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Number(v);

/** `Countries` — the picker's source (`col_cmpCountryPickerItems`). Ordered in `rules.ts`. */
export async function listGateCountries(): Promise<CountryRef[]> {
  const rows = await fetchAll(
    "list countries for gate approvals",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_countryid", "vsb_name"] },
  );
  return rows.map((r) => ({ id: r.vsb_countryid, name: r.vsb_name ?? "" }));
}

/**
 * Every `Project States` row: the gate list filters the visible ones below Order 6, and the gate
 * dropdown looks the NEXT state up over all of them.
 */
export async function listGateStates(): Promise<GateState[]> {
  const rows = await fetchAll(
    "list project states for gate approvals",
    (o) => Vsb_projectstatesService.getAll(o),
    {
      select: ["vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "_owningbusinessunit_value"],
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_projectstateid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? 0,
    isVisibleOnChecklist: r.vsb_isvisibleonchecklist === true,
    owningBusinessUnitId: r._owningbusinessunit_value ?? null,
  }));
}

/**
 * `Filter('Project Default Approvals', 'Approvals Country'.Country = <country>, Text(Technology) =
 * <tech>)`.
 */
export async function listGateApprovals(countryId: string, technology: number): Promise<GateApproval[]> {
  const C = GATE_APPROVAL_COL;
  const rows = await fetchAll(
    "list gate default approvals",
    (o) => Vsb_projectdefaultapprovalsesService.getAll(o),
    {
      select: [
        C.id, C.name, C.approvalMode, C.gateActive, C.clusterState, C.country, C.technology,
        C.portfolioManager, C.defaultApprovals, C.defaultContributors, C.defaultNotifications,
      ],
      filter: and(lookupEq("vsb_approvalscountry", countryId), eq(C.technology, technology)),
      orderBy: ["createdon asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_projectdefaultapprovalsid,
    name: r.vsb_name ?? null,
    approvalMode: num(r.vsb_approvalmodecode),
    gateActive: r.vsb_gateactive === true,
    clusterStateId: r._vsb_clusterstate_value ?? null,
    countryId: r._vsb_approvalscountry_value ?? null,
    technology: num(r.vsb_technologycode),
    portfolioManagerId: r._vsb_approvalparticipant1_value ?? null,
    defaultApprovals: r.vsb_defaultapprovals ?? null,
    defaultContributors: r.vsb_defaultcontributors ?? null,
    defaultNotifications: r.vsb_defaultnotifications ?? null,
  }));
}

/**
 * `LookUp('Checklist Country And Technologies', Text(Technology) = <tech> && Country.Country =
 * <country>).'Checklist Country And Technology'` — the scope row's id, or null.
 */
export async function findScopeCountryTechId(countryId: string, technology: number): Promise<string | null> {
  const rows = await fetchPage(
    "find the checklist country/technology row",
    (o) => Vsb_checklistcountryandtechnologiesService.getAll(o),
    {
      select: ["vsb_checklistcountryandtechnologyid"],
      filter: and(lookupEq("vsb_country", countryId), eq("vsb_technology", technology)),
      top: 1,
    },
  );
  return rows[0]?.vsb_checklistcountryandtechnologyid ?? null;
}

/**
 * The scope's `Project Default Checklists` templates. The canvas applies NO "To Delete" filter on
 * this screen, so none is applied here either (canvas parity, D22).
 */
export async function listScopeChecklistItems(countryTechId: string): Promise<ChecklistItem[]> {
  const rows = await fetchAll(
    "list default checklist templates for gate approvals",
    (o) => Vsb_projectdefaultchecklistsesService.getAll(o),
    {
      select: [
        "vsb_projectdefaultchecklistsid", "vsb_name", "vsb_order",
        "_vsb_associatedcountryandtechnology_value", "_vsb_clusterstate_value",
      ],
      filter: lookupEq("vsb_associatedcountryandtechnology", countryTechId),
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_projectdefaultchecklistsid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? 0,
    countryTechId: r._vsb_associatedcountryandtechnology_value ?? null,
    clusterStateId: r._vsb_clusterstate_value ?? null,
  }));
}

/** `Check List Default Approvals` whose template is one of `itemIds`. */
export async function listChecklistApprovals(itemIds: readonly string[]): Promise<ChecklistApproval[]> {
  if (itemIds.length === 0) return [];
  const C = CHECKLIST_APPROVAL_COL;
  const batches = await Promise.all(chunk(itemIds).map((ids) =>
    fetchAll(
      "list check-list default approvals",
      (o) => Vsb_checklistdefaultapprovalsesService.getAll(o),
      {
        select: [
          C.id, C.name, C.approvalMode, C.gateActive, C.projectDefaultChecklist, C.portfolioManager,
          C.defaultApprovers, C.defaultContributors, C.defaultNotifications,
        ],
        filter: idIn(C.projectDefaultChecklist, ids),
      },
    )));
  return batches.flat().map((r) => ({
    id: r.vsb_checklistdefaultapprovalsid,
    name: r.vsb_name ?? null,
    approvalMode: num(r.vsb_approvalmodecode),
    gateActive: r.vsb_gateisactive === true,
    projectDefaultChecklistId: r._vsb_projectdefaultchecklistid_value ?? null,
    portfolioManagerId: r._vsb_portfoliomanagerid_value ?? null,
    defaultApprovers: r.vsb_defaultapprovers ?? null,
    defaultContributors: r.vsb_defaultcontributors ?? null,
    defaultNotifications: r.vsb_defaultnotifications ?? null,
  }));
}

const ENTRA_SELECT = [ENTRA_COL.rowId, ENTRA_COL.objectId, ENTRA_COL.displayName, ENTRA_COL.mail];

const toPersona = (r: { aaduserid: string; id?: string; displayname?: string; mail?: string }): Persona => ({
  id: r.id || r.aaduserid,
  displayName: r.displayname ?? "",
  mail: r.mail ?? "",
});

/** The pickers' cap on suggestions per search — one page of the Graph-backed table. */
export const PEOPLE_SEARCH_TOP = 25;

/**
 * `Search(Filter('Microsoft Entra IDs', 'Microsoft Entra ID Account Enabled' = …Yes), term,
 * 'Display Name', 'Given Name', Surname, Mail)` — `Search` is a case-insensitive `contains`.
 */
export async function searchEntraPeople(term: string): Promise<Persona[]> {
  const filter = entraSearchFilter(term);
  if (!filter) return [];
  const rows = await fetchPage(
    "search people in Microsoft Entra ID",
    (o) => AadusersService.getAll(o),
    { select: ENTRA_SELECT, filter, top: PEOPLE_SEARCH_TOP },
  );
  return rows.map(toPersona);
}

/**
 * The Portfolio Manager lookups (`aaduserid`) resolved to directory entries, one request per id
 * (the Graph-backed virtual table is queried by key only).
 */
export async function getEntraPeople(ids: readonly string[]): Promise<Map<string, Persona>> {
  const unique = [...new Set(ids)];
  const rows = await Promise.all(unique.map((id) => fetchPage(
    "look up a portfolio manager in Microsoft Entra ID",
    (o) => AadusersService.getAll(o),
    { select: ENTRA_SELECT, filter: `${ENTRA_COL.rowId} eq ${guid(id)}`, top: 1 },
  ).then((r) => [id, r[0]] as const)));
  const out = new Map<string, Persona>();
  for (const [id, r] of rows) if (r) out.set(id, toPersona(r));
  return out;
}

/* ════════════ Application Settings repository (Project Gates) ═════════════ */

/**
 * Project Gates (Application Settings) — every Dataverse read of the screen that replaces the
 * canvas `Admin Project Gates Approvals Screen` (its writes are `WritePlan`s, see the end).
 *
 * Everything sits behind ONE repository object (`projectGatesRepository`) so the screen never
 * talks to a service directly.
 *
 * THE THREE CHECKLIST TABLES are read and written through the
 * shared repository `@/data/adminChecklistTables` (over their generated services) — the ONE place
 * their entity sets, columns and row types live:
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
 * Inactive rows (`statecode = 1`) are NOT filtered on the server — that decision is open. The
 * one exception is checklist tasks: "To Delete" tasks are filtered on the
 * server by the shared repository (its default), and inactive tasks are mapped (`active`) so the
 * rules hide them from the grid and from Add Task.
 */

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
  /** `_owningbusinessunit_value`, copied onto saved templates (canvas parity). */
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
  /** `statecode = 0`. Inactive tasks are hidden from the grid and from Add Task. */
  active: boolean;
  /** `vsb_todelete`. Filtered on the server; kept so the rules can hide one defensively. */
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
  approvals: GateTaskApproval[];
  /** Portfolio Managers of gate and task rows, by Entra id. */
  people: Record<string, PersonRef>;
  /**
   * Set when the checklist half of the dataset could not be read (typically a
   * failed read of one checklist table). The gate half still renders.
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

/** Gate templates for (country, technology), matched by choice CODE. */
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
 * Step 1: the checklist header for (country, technology), ordered by `createdon` so
 * the pick is deterministic (the oldest wins) and a duplicate is reported. Whether to add an
 * `ACTIVE` filter here is an open product decision.
 */
async function findChecklistHeader(countryId: string, techCode: number): Promise<string | null> {
  // The shared reader orders a (country, technology) lookup by `createdon asc` (oldest first).
  const headers = await checklistTables.listChecklistHeaders({ countryId, technology: techCode });
  if (headers.length > 1) {
    trace(
      "warning",
      `[project-gates] ${headers.length} checklist headers match this country and technology; the oldest is used.`,
      headers.map((h) => h.id),
    );
  }
  return headers[0]?.id ?? null;
}

/** Step 2: the checklist tasks hanging off that header, without "To Delete" ones. */
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

/** Step 3: approvals for those tasks, chunked 40 ids per request by the shared reader. */
function listGateTaskApprovals(checklistIds: readonly string[]): Promise<GateTaskApproval[]> {
  return checklistTables.listChecklistApprovals({ checklistIds });
}

function toPerson(r: { aaduserid: string; id?: string; displayname?: string; mail?: string }): PersonRef {
  return { entraId: r.id || r.aaduserid, name: r.displayname ?? "", mail: r.mail ?? "" };
}

/**
 * Portfolio Manager names for every distinct PM id, in ⌈n/15⌉ requests — never one
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
 * People search over ENABLED Entra accounts in `aadusers`.
 *
 * `aadusers` and not `systemusers`, because the stored JSON contract is aaduser data:
 * `PersonaKey` = `aaduser.id`, `PersonaName` = `displayname`, `PersonaRole` = `mail`. A system
 * user's `fullname` / `internalemailaddress` are not guaranteed to hold the same strings, and
 * the downstream flows read these values verbatim. `contains` (case-insensitive on Graph) across
 * display name, given name, surname and mail matches the canvas `Search` (substring, PGAS:3089-3115).
 */
async function searchPeople(term: string, limit = 25): Promise<PersonRef[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const rows = await fetchAll("search people", (o) => AadusersService.getAll(o), {
    select: PEOPLE_SELECT,
    filter: and(
      eq("accountenabled", true),
      or(contains("displayname", q), contains("givenname", q), contains("surname", q), contains("mail", q)),
    ),
    maxPageSize: limit,
    maxPages: 1,
  });
  return rows.map(toPerson).filter((p) => p.entraId);
}

/**
 * One dataset per (country, technology): ≤ 5 + ⌈n/40⌉ reads plus the PM resolution;
 * the gate-template read runs in parallel with the checklist chain.
 * The gate half (generated tables) must succeed; the checklist half is captured into
 * `checklistError` so a missing table degrades the screen instead of blanking it.
 */
async function loadDataset(countryId: string, techCode: number): Promise<GatesDataset> {
  // the template read and the checklist chain are independent — run them in parallel.
  type ChecklistHalf = Pick<GatesDataset, "checklistHeaderId" | "checklists" | "approvals" | "checklistError">;
  const checklistHalf = async (): Promise<ChecklistHalf> => {
    try {
      const headerId = await findChecklistHeader(countryId, techCode);
      if (!headerId) return { checklistHeaderId: null, checklists: [], approvals: [], checklistError: null };
      const checklists = await listDefaultChecklists(headerId);
      const approvals = checklists.length ? await listGateTaskApprovals(checklists.map((c) => c.id)) : [];
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
// one action = one write; every result through `unwrap`.

/** A JSON-able payload. Values are what the Web API takes: strings, numbers, booleans, null. */
export type Payload = Record<string, string | number | boolean | null>;

/*
 * The screen's WRITES are not here: each is a one-write `WritePlan` built by `rules.ts`
 * (`planSetGateActive`, `planSetTaskApprovalActive`, `planSaveGate`, `planSaveTaskApproval`,
 * `planResetGate`, `planDeleteTaskApproval`) and sent by `@/data/runPlan` through `executePlan`.
 */

/**
 * The screen's only door to Dataverse (countries come from the shared `@/data/countries`).
 */
export const projectGatesRepository = {
  listProjectStates,
  loadDataset,
  searchPeople,
  resolvePeople,
};

