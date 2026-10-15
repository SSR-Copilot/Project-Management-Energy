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
import { Vsb_basecasesService } from "@/generated/services/Vsb_basecasesService";
import { SystemusersService } from "@/generated/services/SystemusersService";
import { unwrap } from "@/platform/errors";
import { countedPage, deleteRecord, fetchAll, resetPageTokens } from "./client";
import { ACTIVE, and, asc, desc, eq, guid, isNull, lookupEq, notNull, or, f } from "./odata";
import {
  COL, PROJECT_SELECT, PAGE_SIZE, buildProjectFilter, toProjectRow,
  type ProjectFilter, type ProjectRow, type SortState, type PersonOption,
} from "@/features/project-overview/rules";

/** The entity set `countedPage` addresses; the generated services use the same string. */
const ES_PROJECTS = "vsb_projects";

/** The nameless-project count per criteria, shared across page loads for a short while. */
const blankCountCache = new Map<string, { at: number; count: Promise<number> }>();
const BLANK_COUNT_TTL_MS = 30_000;

/** The platform caps `@odata.count` here: a count of exactly this is "at least", not a total. */
const COUNT_CAP = 5000;

/** Forgets every cached skip token and count — after a write, or between tests. */
export function resetProjectPageCache(): void {
  blankCountCache.clear();
  resetPageTokens();
}

/* ═══════════════════════════════════════════════════════════ the project page */

export interface ProjectPage {
  rows: ProjectRow[];
  /** The server-side total for the whole filtered set, not the page. */
  totalRows: number;
  /**
   * The canvas's `RoundUp(totalRows / pageSize, 0) + If(totalRows = 0, 1, 0)`. The named and the
   * nameless segments are stitched into one continuous list, so this is plain division — except
   * past the platform's 5000 `@odata.count` ceiling, where a further page from the skip token
   * still raises it to at least `page + 1`.
   */
  totalPages: number;
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
  const base = and(buildProjectFilter(req.filter, req.locale), req.scopeFilter, ACTIVE);
  // The named query's order. The sort column is usually NOT unique (Technology, Short Name,
  // Capacity and Approval repeat heavily), and skip-token pages are cut at an arbitrary row of a
  // tie, so rows of equal value could repeat or vanish across a page boundary. The autonumber is
  // never blank and unique, so it makes the order total — unless it already is the sort column.
  const orderBy = [req.sort.asc ? asc(req.sort.col) : desc(req.sort.col)];
  if (req.sort.col !== COL.projectIdCode) orderBy.push(asc(COL.projectIdCode));
  // Two different filters or sorts must never share a cached token. The full orderBy (tie-break
  // included) is part of the key.
  const signature = (segment: string) =>
    `${segment}|${base ?? ""}|${orderBy.join(",")}|${pageSize}`;

  const namedQuery = (wanted: number) => countedPage<Record<string, unknown>>(
    "load projects", ES_PROJECTS, {
      select: PROJECT_SELECT,
      filter: and(base, notNull(req.sort.col)),
      orderBy,
      top: pageSize,
      page: wanted,
      signature: signature("named"),
    });

  // Nothing to sort these by — the column is empty on all of them — so they take the
  // autonumber, which is never blank and gives them a stable order of their own. The cache key
  // inside `countedPage` includes `top`, so a short top-up page never shares tokens with a full one.
  const blankQuery = (segment: string, top: number, page: number) =>
    countedPage<Record<string, unknown>>("load projects with no sort value", ES_PROJECTS, {
      select: PROJECT_SELECT,
      filter: and(base, isNull(req.sort.col)),
      orderBy: [asc(COL.projectIdCode)],
      top,
      page,
      signature: signature(segment),
    });

  /*
   * A project with NO value in the sorted column goes after every project that has one.
   *
   * Dataverse has no `NULLS LAST` — `$orderby=vsb_projectname asc` is SQL Server underneath, so
   * every nameless project came back FIRST and filled page 1 of the default view with blank
   * rows. The canvas app never showed that because it never sorts on the server at all: it
   * `ClearCollect`s the first `DefaultConnectedDataSourceMaxGetRowsCount` rows in table order
   * and runs `SortByColumns` over that collection, so whichever nameless rows fell outside the
   * cap were simply invisible. Truncating is not an option here, so the list is read as two
   * ORDERED SEGMENTS (named, then blank tail) and STITCHED into one continuous list.
   *
   * SOURCE DEFECT (data layer, not a canvas one): the segments used to be paged separately, each
   * starting on a page of its own, so `totalPages = ceil(named / size) + ceil(blank / size)`.
   * 1,100 named + 29 nameless at size 200 gave 6 + 1 = 7 pages where the canvas's
   * `RoundUp(1129 / 200, 0)` is 6, and the last "named" page was short. Now page P is always
   * rows [(P-1)*size, P*size) of `named ++ blank`, and `totalPages` is the canvas formula
   * `max(1, ceil((N + B) / size))` (`RoundUp(total/size, 0) + If(total = 0, 1, 0)`):
   *
   *  - pure named page: the named walk alone (plus a one-row probe of the tail for its count);
   *  - boundary page (the named rows end part-way through it): the named rows, topped up with
   *    the FIRST `size - namedRows` blank rows, fetched as a short page of their own;
   *  - pure tail page: the tail rows start `o = (P-1)*size - N` rows into the tail, which is
   *    generally NOT a tail-page boundary, so tail pages floor(o/size)+1 and, when o % size > 0,
   *    the next one are fetched and sliced.
   *
   * Where the named segment ENDS is read off the walk, not off `@odata.count`: `countedPage`
   * stops early only when the skip tokens run out, so an exhausted walk gives N exactly
   * (`(pages - 1) * size + rows on the last page`). The count is capped at 5000 by the
   * platform, so it is only trusted for the totals when the named walk is NOT exhausted
   * (then `hasNext` from the token still guarantees at least one more page).
   */
  // How many nameless projects there are — a 1-row read, memoised per criteria so paging through
  // the named rows does not pay for it on every page.
  const blankCount = (): Promise<number> => {
    const key = signature("blank-probe");
    const hit = blankCountCache.get(key);
    if (hit && Date.now() - hit.at < BLANK_COUNT_TTL_MS) return hit.count;
    const count = blankQuery("blank-probe", 1, 1).then((p) => p.totalRows);
    blankCountCache.set(key, { at: Date.now(), count });
    // A failed read must not be remembered.
    count.catch(() => blankCountCache.delete(key));
    return count;
  };

  const load = async (wanted: number, mayRetry: boolean): Promise<ProjectPage> => {
    // Independent reads, so they overlap: the page itself, and the tail's size for the pager.
    const [named, probeCount] = await Promise.all([
      namedQuery(wanted),
      blankCount().catch(() => undefined),
    ]);

    const result = (
      rows: Record<string, unknown>[], n: number, b: number, knownNext: boolean,
    ): ProjectPage => {
      const totalRows = n + b;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize), knownNext ? wanted + 1 : 1);
      return {
        rows: rows.map(toProjectRow),
        totalRows,
        totalPages,
        page: wanted,
        pageSize,
        hasNext: wanted < totalPages,
      };
    };

    // More named rows past this page: it is a pure named page. The tail only contributes its size.
    // A token is only taken as proof of a further page when the count cannot say (it is capped):
    // below the cap `@odata.count` is exact, and a token on an exactly-full last page must not
    // invent a page that is not there.
    if (named.hasNext) {
      return result(
        named.rows, named.totalRows, probeCount ?? await blankCount(),
        named.totalRows >= COUNT_CAP,
      );
    }

    // The named walk is exhausted, so N is exact (an empty segment reports page 1, zero rows).
    const namedOnPage = named.page === wanted ? named.rows.length : 0;
    const N = (named.page - 1) * pageSize + named.rows.length;
    const need = pageSize - namedOnPage;
    // How far into the tail this page starts. Non-zero only on a pure tail page; a boundary page
    // (namedOnPage > 0) starts at the tail's first row.
    const offset = (wanted - 1) * pageSize + namedOnPage - N;

    let tailRows: Record<string, unknown>[] = [];
    let B: number;
    if (need === 0) {
      // The named rows fill this page exactly; the tail is only counted.
      B = probeCount ?? await blankCount();
    } else if (need < pageSize) {
      // Boundary page: a short top-up from the head of the tail.
      const head = await blankQuery("blank-head", need, 1);
      tailRows = head.rows;
      B = head.totalRows;
    } else {
      const k = Math.floor(offset / pageSize) + 1;
      const skip = offset % pageSize;
      const first = await blankQuery("blank", pageSize, k);
      B = first.totalRows;
      // `countedPage` clamps a page beyond the end to the last one; `first.page < k` is that case
      // and is handled by the out-of-range check below, which discards these rows.
      if (first.page === k) {
        if (skip === 0) {
          tailRows = first.rows;
        } else {
          const second = first.hasNext ? await blankQuery("blank", pageSize, k + 1) : null;
          const joined = second && second.page === k + 1
            ? [...first.rows, ...second.rows]
            : first.rows;
          tailRows = joined.slice(skip, skip + pageSize);
        }
      }
    }

    // A page past the end serves PAGE 1, as the canvas Apply formula does
    // (`adjustedPage = 1` when `currentPage > TotalPages`). `ProjectPage.page` reports the page
    // actually served, so the caller can see the reset and correct its URL.
    const lastPage = Math.max(1, Math.ceil((N + B) / pageSize));
    if (wanted > lastPage && mayRetry) return load(1, false);

    return result([...(namedOnPage > 0 ? named.rows : []), ...tailRows], N, B, false);
  };

  const wanted = Math.max(1, Math.floor(req.page) || 1);
  const first = await load(wanted, true);

  /*
   * A page of a set that has rows must not come back short. The totals and the page disagree
   * only when something cached is stale — a skip token the server no longer honours, a count
   * from before rows were added or removed — so forget every cached token and count and read
   * the page once more from page 1. Once only: if the data really did shrink, the second
   * answer stands. Skipped at the count cap, where the count is a floor, not a total.
   */
  const expected = Math.min(pageSize, Math.max(0, first.totalRows - (first.page - 1) * pageSize));
  if (first.rows.length < expected && first.totalRows < COUNT_CAP) {
    resetProjectPageCache();
    return load(wanted, true);
  }
  return first;
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

/**
 * `IsBlank(LookUp('Base cases', ThisRecord.Project.Project = GUID(selected.vsb_projectid)))`,
 * negated — `simulateProject`'s second `OnSelect` guard.
 *
 * `top: 1` keeps this an existence check, not a listing: the canvas only ever asked whether a
 * row existed, never how many. Not cached — the canvas re-ran this `LookUp` on every click, so
 * this reads fresh every time too, same as `loadProjectStateOrder` above.
 */
export async function loadHasBaseCase(projectId: string): Promise<boolean> {
  const result = await Vsb_basecasesService.getAll({
    select: ["vsb_basecaseid"],
    filter: lookupEq("vsb_project", projectId),
    maxPageSize: 1,
  });
  if (!result.success) return false;
  return unwrap(result, "load base case").length > 0;
}

/* ═══════════════════════════════════════════════════════════════ the delete */

/**
 * `Remove(Projects, gblRecordSelectedProject)` from
 * `cmp_Project_PopUp_ConfirmationDeleteProject.OnConfirm`.
 *
 * Goes through `deleteRecord` rather than `Vsb_projectsService.delete`, which discards the
 * result — the canvas wraps this one call in `IfError` and notifies on failure, so the failure
 * has to be reachable. See `data/client.ts`.
 *
 * The approved-project block is a COMMAND gate, not a check here: the canvas enforces it only
 * in `ItemEnabled`, so a direct call succeeds. `docs/SECURITY.md` records that the real
 * boundary is a pre-operation plug-in on `vsb_project` Delete; this function deliberately does
 * not re-implement it on the client, because a client-side guard would read as the boundary.
 */
export async function deleteProject(projectId: string): Promise<void> {
  await deleteRecord("delete project", ES_PROJECTS, projectId);
  // The totals and the paging cookies were counted with this row in the set.
  resetProjectPageCache();
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
      // `maxPageSize`, not `top`: the SDK always sends `Prefer: odata.maxpagesize` (500 unless
      // overridden) and Dataverse ignores `$top` when that header is present, so `top: limit`
      // silently returned up to 500 people. See `countedPage` in `./client`.
      maxPageSize: limit,
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
    maxPageSize: 1,
  });
  if (!result.success) return false;
  return (result.data ?? []).length > 0;
}
