/**
 * Admin Project Gates Approvals — the Dataverse reads behind
 * `features/admin/admin-gates-approvals` (connected 19 Oct 2026, D22). Every table was already
 * registered in `power.config.json`; `'Microsoft Entra IDs'` is the virtual table `aadusers`.
 *
 * No flow and no plugin step fires on `vsb_projectdefaultapprovals` or
 * `vsb_checklistdefaultapprovals` (04-flow-inventory.md, verified 19 Oct 2026). The request flows
 * that start gate / check-list approvals only READ these rows later.
 */
import { AadusersService } from "@/generated/services/AadusersService";
import { Vsb_checklistcountryandtechnologiesService } from "@/generated/services/Vsb_checklistcountryandtechnologiesService";
import { Vsb_checklistdefaultapprovalsesService } from "@/generated/services/Vsb_checklistdefaultapprovalsesService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_projectdefaultapprovalsesService } from "@/generated/services/Vsb_projectdefaultapprovalsesService";
import { Vsb_projectdefaultchecklistsesService } from "@/generated/services/Vsb_projectdefaultchecklistsesService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import {
  CHECKLIST_APPROVAL_COL, ENTRA_COL, GATE_APPROVAL_COL, entraSearchFilter,
  type ChecklistApproval, type ChecklistItem, type CountryRef, type GateApproval, type GateState,
  type Persona,
} from "@/features/admin/admin-gates-approvals/rules";
import { fetchAll, fetchPage } from "./client";
import { and, chunk, eq, guid, idIn, lookupEq } from "./odata";

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
