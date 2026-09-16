/**
 * The Main Project Overview's data access.
 *
 * The canvas screen did all of this client-side: `ClearCollect(colFilteredProjects,
 * Filter(Projects, And(...)))`, then `CountRows` for the footer, then paged the collection in
 * memory. That is why the list is capped at `DefaultConnectedDataSourceMaxGetRowsCount: 2000`
 * — and the screenshot shows 1,129 rows, so the cap is closer than it looks.
 *
 * Here the filter, the sort, the page and the count are all server-side.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_countryareasService } from "@/generated/services/Vsb_countryareasService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { SystemusersService } from "@/generated/services/SystemusersService";
import { unwrap } from "@/platform/errors";
import { countedPage, fetchAll } from "./client";
import { ACTIVE, and, asc, desc, eq, guid, lookupEq, or, f } from "./odata";
import {
  COL, PROJECT_SELECT, PAGE_SIZE, buildProjectFilter, toProjectRow,
  type ProjectFilter, type ProjectRow, type SortState, type PersonOption,
} from "@/features/project-overview/rules";

/** The entity set `countedPage` addresses; the generated services use the same string. */
const ES_PROJECTS = "vsb_projects";

/* ═══════════════════════════════════════════════════════════ the project page */

export interface ProjectPage {
  rows: ProjectRow[];
  /** The server-side total for the whole filtered set, not the page. */
  totalRows: number;
  page: number;
  pageSize: number;
  /** Whether a further page exists. Forward-only paging cannot infer this from the total. */
  hasNext: boolean;
}

export interface ProjectPageRequest {
  filter: ProjectFilter;
  sort: SortState;
  page: number;
  pageSize?: number;
  /** The country scope — composed with the filter, never folded into it. */
  scopeFilter?: string | undefined;
  locale?: string;
}

/**
 * One page of projects, plus the total.
 *
 * The country scope is composed here with `and(...)` rather than folded into
 * `buildProjectFilter`, because it is the only thing standing between a country-scoped user
 * and the whole table — it has to be visible at the call site, not buried in a filter builder
 * a future edit might make conditional.
 *
 * Paging is a skip-token walk, not `$skip`: Dataverse rejects `$skip` outright with
 * `0x80060888 "Skip Clause is not supported in CRM"`. See `countedPage`.
 */
export async function loadProjectPage(req: ProjectPageRequest): Promise<ProjectPage> {
  const pageSize = req.pageSize ?? PAGE_SIZE;
  const filter = and(buildProjectFilter(req.filter, req.locale), req.scopeFilter, ACTIVE);
  const orderBy = [req.sort.asc ? asc(req.sort.col) : desc(req.sort.col)];

  const result = await countedPage<Record<string, unknown>>("load projects", ES_PROJECTS, {
    select: PROJECT_SELECT,
    filter,
    orderBy,
    top: pageSize,
    page: req.page,
    // Two different filters or sorts must never share a cached token.
    signature: `${filter ?? ""}|${orderBy.join(",")}|${pageSize}`,
  });

  return {
    rows: result.rows.map(toProjectRow),
    totalRows: result.totalRows,
    page: result.page,
    pageSize,
    hasNext: result.hasNext,
  };
}

/**
 * The extra facts the command gates need that the grid row does not carry.
 *
 * The canvas re-ran `LookUp(Projects, ...)` inside EVERY `ItemEnabled` — ten lookups per
 * render of the command bar. The grid row already holds all of it except the cluster state's
 * `Order`, which lives on `vsb_projectstates`, so that is the only extra read.
 */
export async function loadProjectStateOrder(
  clusterStateId: string | null,
): Promise<number | null> {
  if (!clusterStateId) return null;
  const result = await Vsb_projectstatesService.get(clusterStateId, {
    select: ["vsb_projectstateid", "vsb_order", "vsb_name"],
  });
  if (!result.success) return null;
  return unwrap(result, "load project state").vsb_order ?? null;
}

/* ══════════════════════════════════════════════════════════ filter sources */

export interface Lookup {
  id: string;
  name: string;
}

/** `cbx_..._Filter_Country.Items = Countries`. */
export async function listCountries(): Promise<Lookup[]> {
  const rows = await fetchAll(
    "list countries",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_countryid", "vsb_name"], filter: ACTIVE, orderBy: ["vsb_name asc"] },
  );
  return rows.map((r) => ({ id: r.vsb_countryid, name: r.vsb_name ?? "" }));
}

/**
 * `cbx_..._Filter_Area.Items = Filter(CountryAreas, Country.Country = <selected country>)`.
 *
 * Note the lookup on `vsb_CountryArea` is `vsb_areascountry`, not `vsb_country` — the
 * generated model says `_vsb_areascountry_value`.
 */
export async function listCountryAreas(countryId: string | null): Promise<Lookup[]> {
  if (!countryId) return [];
  const rows = await fetchAll(
    "list country areas",
    (o) => Vsb_countryareasService.getAll(o),
    {
      select: ["vsb_countryareaid", "vsb_name", "_vsb_areascountry_value"],
      filter: and(lookupEq("vsb_areascountry", countryId), ACTIVE),
      orderBy: ["vsb_name asc"],
    },
  );
  return rows.map((r) => ({ id: r.vsb_countryareaid, name: r.vsb_name ?? "" }));
}

/** `cbx_..._Filter_Status.Items = Sort('Project States', Order, Ascending)`. */
export async function listProjectStates(): Promise<(Lookup & { order: number | null })[]> {
  const rows = await fetchAll(
    "list project states",
    (o) => Vsb_projectstatesService.getAll(o),
    {
      select: ["vsb_projectstateid", "vsb_name", "vsb_order"],
      filter: ACTIVE,
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_projectstateid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? null,
  }));
}

/**
 * The Project Manager typeahead's source.
 *
 * `vsb_projectmanager` points at `aadusers` — a Graph-backed VIRTUAL entity, whose
 * server-side `$filter` support is limited and whose reads are slow. So the candidates come
 * from `systemusers` instead, which is a real table: fully queryable, sortable and cheap.
 *
 * The join that makes this work is `azureactivedirectoryobjectid` — for `aaduser` the primary
 * key IS the Entra object id, so a system user's `azureactivedirectoryobjectid` is exactly the
 * value `_vsb_projectmanager_value` holds. The canvas did the equivalent comparison
 * (`'Project Manager'.Id = GUID(picker.PersonaKey)`) against the picker's Graph id.
 *
 * A user with no `azureactivedirectoryobjectid` (an application or integration account) is
 * dropped: it could never be a project manager and it would filter to nothing.
 */
export async function searchProjectManagers(term: string, limit = 25): Promise<PersonOption[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const escaped = q.replace(/'/g, "''");
  const rows = await fetchAll(
    "search project managers",
    (o) => SystemusersService.getAll(o),
    {
      select: [
        "systemuserid", "fullname", "internalemailaddress", "azureactivedirectoryobjectid",
      ],
      filter: and(
        or(
          `contains(fullname,'${escaped}')`,
          `contains(internalemailaddress,'${escaped}')`,
        ),
        eq("isdisabled", false),
        "azureactivedirectoryobjectid ne null",
      ),
      orderBy: ["fullname asc"],
      top: limit,
      maxPages: 1,
    },
  );
  return rows
    .filter((r) => Boolean(r.azureactivedirectoryobjectid))
    .map((r) => ({
      id: r.azureactivedirectoryobjectid as string,
      label: r.fullname ?? "",
      mail: r.internalemailaddress ?? null,
    }));
}

/**
 * Per-record edit permission for the selected project.
 *
 * There is no `RecordInfo` in the code-app SDK — see `src/platform/privileges.ts` and
 * decision D1. What CAN be established cheaply and truthfully is whether the caller can read
 * the row back at all, which is what this does. It is NOT the same as edit permission and it
 * is not presented as such: the command bar takes `canEditSelected` from the privilege
 * provider, and this exists so that a row the caller cannot even read is never treated as
 * editable.
 */
export async function canReadProject(projectId: string): Promise<boolean> {
  const result = await Vsb_projectsService.getAll({
    select: [COL.id],
    filter: f.and(`vsb_projectid eq ${guid(projectId)}`, ACTIVE),
    top: 1,
  });
  if (!result.success) return false;
  return (result.data ?? []).length > 0;
}
