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
import { countedPage, deleteRecord, fetchAll, invalidatePageTokens, type CountedPage } from "./client";
import { ACTIVE, and, asc, desc, eq, guid, isNull, lookupEq, notNull, or, f } from "./odata";
import {
  COL, PROJECT_SELECT, PAGE_SIZE, buildProjectFilter, toProjectRow,
  // The canvas page count, `RoundUp(total / size, 0) + If(total = 0, 1, 0)` (rule 17: one copy).
  totalPages as canvasTotalPages,
  type ProjectFilter, type ProjectRow, type SortState, type PersonOption,
} from "@/features/pm/project-main/rules";

/** The entity set `countedPage` addresses; the generated services use the same string. */
const ES_PROJECTS = "vsb_projects";

/* ═══════════════════════════════════════════════════════════ the project page */

export interface ProjectPage {
  rows: ProjectRow[];
  /** The server-side total for the whole filtered set, not the page. */
  totalRows: number;
  /**
   * `RoundUp(totalRows / pageSize, 0)`, at least 1, as the canvas computes it — the two segments
   * are paged as ONE continuous sequence (see `pageWindow`). Never below the page served, and
   * exactly the page served once the walk has reached the real end of the data (D44).
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
  /*
   * SOURCE DEFECT (code app only, no canvas parity involved: the canvas never paged on the
   * server, it `ClearCollect`s and pages a local collection; see `countedPage` in `client.ts`).
   * Each segment used to be ordered by ONE column: the sort column here (default
   * `vsb_projectname`) and `vsb_name` on the tail. Neither is unique. A Dataverse paging cookie
   * records where the previous page stopped in the ORDER columns, and Microsoft warns that
   * ordering on a non-unique column can skip or repeat rows across a page boundary: when several
   * projects share the value at the seam, the next page resumes after that value and loses the
   * rest of them. The walk then ran out pages before `@odata.count` said it would, and the pager
   * showed "page 6 of 7" with Next disabled. `vsb_projectid` is the primary key, so appending it
   * makes the order total and every boundary exact. It only breaks ties, so the visible order is
   * unchanged, and it is always ascending whatever the direction of the user's sort.
   * `signature()` below includes `orderBy`, so tokens cached under the old order are not reused.
   */
  const tieBreaker = asc(COL.id);
  const orderBy = [req.sort.asc ? asc(req.sort.col) : desc(req.sort.col), tieBreaker];
  const wanted = Math.max(1, Math.floor(req.page) || 1);
  // Two different filters or sorts must never share a cached token.
  const signature = (segment: string) =>
    `${segment}|${base ?? ""}|${orderBy.join(",")}|${pageSize}`;

  /*
   * A project with NO value in the sorted column goes after every project that has one.
   *
   * Dataverse has no `NULLS LAST` — `$orderby=vsb_projectname asc` is SQL Server underneath, so
   * every nameless project came back FIRST and filled page 1 of the default view with blank
   * rows. The canvas app never showed that because it never sorts on the server at all: it
   * `ClearCollect`s the first `DefaultConnectedDataSourceMaxGetRowsCount` rows in table order
   * and runs `SortByColumns` over that collection, so whichever nameless rows fell outside the
   * cap were simply invisible. Truncating is not an option here, so the list is read as two
   * ORDERED SEGMENTS instead, which puts them last without hiding any of them.
   *
   * SOURCE DEFECT: the segments used to be paged SEPARATELY — the tail always started on a fresh
   * page and `totalPages` was `ceil(named / P) + ceil(blank / P)`. That diverged from the canvas
   * page arithmetic. The canvas Apply handler
   * (`but_Main_Project_Overview_Context_Filter_Apply.OnSelect`, `Project Main Screen.pa.yaml`
   * L1605, mirroring `App.pa.yaml` L1082-1114) `ClearCollect`s every filtered project into ONE
   * collection, takes `TotalRows = CountRows(colFilteredProjects)` and
   * `TotalPages = RoundUp(TotalRows / PageSize, 0) + If(TotalRows = 0, 1, 0)` with
   * `PageSize: 200`, and pages that single collection. 1,100 named + 50 blank projects therefore
   * read "6 pages" in the canvas and "7" here, and every row after the seam sat on a different
   * page. The two segments are now paged as one CONTIGUOUS sequence `named ++ blank` — the last
   * named page is topped up with the first blank rows (`pageWindow`) — so every page but the
   * last holds exactly `pageSize` rows and the count matches `RoundUp(TotalRows / PageSize)`.
   * The segment ORDER (named first, then blank) is unchanged.
   */
  const namedRead = (page: number) =>
    countedPage<Record<string, unknown>>("load projects", ES_PROJECTS, {
      select: PROJECT_SELECT,
      filter: and(base, notNull(req.sort.col)),
      orderBy,
      top: pageSize,
      page,
      signature: signature("named"),
    });

  /*
   * The blank segment, read as the pager needs it, `top` rows of its page `blankPage`.
   *
   * `top` here (and on the named walk above) is `countedPage`'s rows-per-page, which it sends as
   * the `maxPageSize` page-size preference, never as `$top`: in Dataverse `$top` caps the whole
   * result set, returns no skip token, and once stranded every walk on page 1 — with page 2
   * then served from this segment (UT-PROJPAGE-022..025).
   */
  const blankRead = (top: number, blankPage: number, segmentName: string) =>
    countedPage<Record<string, unknown>>("load projects with no sort value", ES_PROJECTS, {
      select: PROJECT_SELECT,
      filter: and(base, isNull(req.sort.col)),
      // Nothing to sort these by — the column is empty on all of them — so they take the
      // autonumber, which is never blank and gives them a stable order of their own. No
      // constraint makes the autonumber unique, so the primary key breaks ties here too (see
      // the SOURCE DEFECT on `orderBy` above).
      orderBy: [asc(COL.projectIdCode), tieBreaker],
      top,
      page: blankPage,
      signature: signature(segmentName),
    });

  /*
   * The blank PROBE is started together with the named read, not after it.
   *
   * It asks for one row of page 1 under its own "blank-probe" signature, so none of its
   * parameters depend on the named result: it exists only so the pager knows how many projects
   * have no value in the sorted column. Awaiting the named page first made every page view wait
   * for two round trips back to back; running them at once saves one round trip of waiting per
   * page view, which is most of what a Next click cost.
   *
   * `Promise.all` rejects with whichever read fails first and keeps a handler on the other, so a
   * failed probe never leaves the named read's rejection unhandled, nor the other way round, and
   * neither failure is swallowed (rule 3): the page rejects with it.
   *
   * The probe is awaited even when blank rows are served below. Its count is not used then (the
   * blank read's own walk or count is), but a failure is a failure; it is the same filter the
   * blank read uses, so it is not a new way to fail. Both reads happen in `servePage`.
   */
  const reads: SegmentReads = { named: namedRead, blank: blankRead, pageSize };
  const first = await servePage(reads, wanted);
  if (!("clampTo" in first)) return first;
  /*
   * The page asked for lies past the end of the data. Today's semantics are kept: the LAST page is
   * served and `page` reports it (D41 P-3, the canvas's reset to page 1, is still open). The second
   * call re-reads through cached tokens only. It may not clamp again, so it cannot loop.
   */
  const second = await servePage(reads, first.clampTo);
  return "clampTo" in second ? pageOf([], second.totalRows, first.clampTo, pageSize, false) : second;
}

/* ─────────────────────────────────────────────── the contiguous page arithmetic */

/**
 * Where page `page` falls in the ONE continuous sequence `named ++ blank` (the canvas pages a
 * single collection, `Project Main Screen.pa.yaml` L1605). Pure.
 *
 * Page `k` holds rows `[(k-1)P, kP)` of the concatenation, so with `N` named rows:
 *   - `kP <= N`           → named page `k` only, no blank rows;
 *   - `(k-1)P < N < kP`   → the last `N - (k-1)P` named rows, then the first blank rows;
 *   - `(k-1)P >= N`       → blank rows `[o, o + P)` with `o = (k-1)P - N`.
 *
 * The blank rows are read from `countedPage`'s 0-aligned pages of size `P`: the one holding `o`
 * (`blankPage`) and, when the slice runs past it (`spansTwoBlankPages`), the next one.
 */
export interface PageWindow {
  /** How many of the page's rows are named ones (the tail of named page `k`). */
  namedCount: number;
  /** How many blank rows the page needs after them: `P - namedCount`. */
  blankCount: number;
  /** Offset into the blank segment of the page's first blank row. */
  blankOffset: number;
  /** The 1-based aligned blank page holding `blankOffset`. */
  blankPage: number;
  /** `blankOffset`'s position inside `blankPage`. */
  blankOffsetInPage: number;
  /** True when the blank slice continues onto `blankPage + 1`. */
  spansTwoBlankPages: boolean;
}

export function pageWindow(page: number, pageSize: number, namedRows: number): PageWindow {
  const size = Math.max(1, Math.floor(pageSize));
  const start = (Math.max(1, Math.floor(page)) - 1) * size;
  const named = Math.max(0, Math.floor(namedRows));
  const namedCount = Math.min(size, Math.max(0, named - start));
  const blankCount = size - namedCount;
  const blankOffset = Math.max(0, start - named);
  const blankOffsetInPage = blankOffset % size;
  return {
    namedCount,
    blankCount,
    blankOffset,
    blankPage: Math.floor(blankOffset / size) + 1,
    blankOffsetInPage,
    spansTwoBlankPages: blankCount > 0 && blankOffsetInPage + blankCount > size,
  };
}

/**
 * How many rows a segment holds, read off a walk that ENDED at the data on page `page` (no token,
 * not cut short by the cap): every page before it is full, so `(page - 1) * P + rows on it`.
 * This is exact where `@odata.count` is not (capped at 5000, cached per key; D43).
 */
export function rowsBeforeEnd(page: number, pageSize: number, rowsOnLastPage: number): number {
  return (Math.max(1, page) - 1) * pageSize + rowsOnLastPage;
}

type RawRow = Record<string, unknown>;
type SegmentRead = (page: number) => Promise<CountedPage<RawRow>>;
interface SegmentReads {
  named: SegmentRead;
  blank: (top: number, page: number, segmentName: string) => Promise<CountedPage<RawRow>>;
  pageSize: number;
}

function pageOf(
  rows: RawRow[], totalRows: number, page: number, pageSize: number, hasNext: boolean,
): ProjectPage {
  return {
    rows: rows.map(toProjectRow),
    totalRows,
    /*
     * The canvas count, `RoundUp(TotalRows / PageSize, 0) + If(TotalRows = 0, 1, 0)`, while more
     * rows remain, and never below the page served (D44). Once nothing follows this page the walk
     * has reached the real end of the data, so the page served IS the last page (D44 b): a stale
     * or capped count can never promise a page Next cannot reach. The reverse holds too: while Next
     * is lit there is at least one more page, however low a stale or capped count comes back —
     * otherwise page 1 read "1 from 1" and the pager (`TotalPages > 1`) hid a Next that existed.
     */
    totalPages: hasNext
      ? Math.max(page + 1, canvasTotalPages(totalRows, pageSize))
      : Math.max(1, page),
    page,
    pageSize,
    hasNext,
  };
}

/**
 * One page view: the named read and the blank probe at once, then — only on a page that needs
 * blank rows — one or two aligned blank reads. `{ clampTo }` when the page asked for is past the end.
 */
async function servePage(
  reads: SegmentReads,
  wanted: number,
): Promise<ProjectPage | { clampTo: number; totalRows: number }> {
  const P = reads.pageSize;
  const [named, probe] = await Promise.all([reads.named(wanted), reads.blank(1, 1, "blank-probe")]);
  // The probe's ROW is fresh on every page view (only tokens and counts are cached), so it is the
  // only witness that a tail exists. Its count is NOT one: a stale count above zero, after the last
  // blank project was named or deleted elsewhere, lit Next on an exact-fit last named page, and the
  // page after it clamped straight back with Next still lit — a pager stuck in place.
  const blankExists = probe.rows.length > 0;

  /*
   * Where the named segment ENDS is read off the walk, not off the count.
   *
   * `@odata.count` cannot be asked instead: Dataverse caps it at 5000, so on a table with more
   * named projects than that it would put the boundary in the wrong place and strand every
   * named project past page 25 behind a tail that should come after them. The skip token the
   * server hands back is always the truth — the same rule `hasNext` already follows.
   *
   * `named.page < wanted` on its own is NOT that truth, because `countedPage` has TWO reasons to
   * stop short of the page asked for:
   *   1. the data ran out — the server handed back no further token. Only this one means the
   *      named rows are exhausted at `named.page` pages and the rest of the list is the tail.
   *   2. the walk hit `DEFAULT_MAX_PAGE_WALK` — the server DID hand back a token and more named
   *      pages exist; the walk simply refused to issue another hundred round trips.
   * `limited` is exactly what tells the two apart (`client.ts` sets it only when the walk stopped
   * at the cap with a token still in hand), so it is what guards the boundary here. Without it a
   * page past the cap would silently serve rows from the OTHER segment under a plausible page
   * number — the tail displacing named rows the user actually asked for.
   */
  if (named.limited || named.hasNext) {
    // A named page with more named rows after it (or a walk stopped at the cap, which serves the
    // page it reached and never tail rows). `N` is not known yet, so the count stands in for it.
    const totalRows = named.totalRows + probe.totalRows;
    return pageOf(named.rows, totalRows, named.page, P, true);
  }
  /*
   * The named walk ENDED AT THE DATA: no further token, not cut short by the cap. `named.page`
   * (`m`) is then the last named page — `countedPage` clamps to what exists — and `N` is exact:
   * `(m - 1) * P` full pages plus the rows on page `m`, whatever `@odata.count` says.
   *
   * This defends against ANY disagreement between the count and the walk, whatever its cause:
   *   - a walk that loses rows at a page seam (the SOURCE DEFECT on `orderBy` above);
   *   - the platform's 5000 cap on the count;
   *   - a stale count. `client.ts` caches the count per query key, so a row added or removed by
   *     another user since the walk began is not reflected in it.
   * Before this, a count above the walk produced "page 6 of 7" with Next disabled, and page 7
   * could never be reached.
   *
   * Until the walk reaches the end (page 1 with more to come, for example), the count is the only
   * estimate there is (the branch above). A stale count can therefore still overstate pages the
   * user has not reached yet; the figure corrects itself on arrival at the real last page.
   */
  const lastNamedPage = named.page;
  const namedRows = rowsBeforeEnd(lastNamedPage, P, named.rows.length);

  /*
   * With no tail there is nothing past the named rows, so a page beyond the end falls back to the
   * last named page — `countedPage` has already clamped `named` to it. That is what asking for
   * page 9 of a 3-page list did before the split, and it still does.
   */
  if (!blankExists) return pageOf(named.rows, namedRows, lastNamedPage, P, false);

  const win = pageWindow(wanted, P, namedRows);
  // `namedCount > 0` only when page `wanted` IS the last named page (`(k-1)P < N <= mP`).
  const namedPart = win.namedCount > 0 ? named.rows.slice(0, win.namedCount) : [];

  if (win.blankCount === 0) {
    // An exact fit: the page is full of named rows, the tail starts on the next one.
    return pageOf(namedPart, namedRows + probe.totalRows, wanted, P, true);
  }

  /*
   * The blank rows the page needs, read from the 0-aligned pages of size `P` under the "blank"
   * signature (never the probe's, so neither walk pollutes the other's tokens), then sliced. This
   * read is sequential: which blank page to ask for depends on where the named walk ended.
   */
  const first = await reads.blank(P, win.blankPage, "blank");
  if (first.limited) {
    // The blank walk stopped at the cap short of `blankPage`. Serve the page holding the furthest
    // blank row it reached instead — never rows from a page the user did not ask for.
    return { clampTo: Math.floor((namedRows + (first.page - 1) * P) / P) + 1, totalRows: namedRows + first.totalRows };
  }
  if (first.page < win.blankPage) {
    // The blank rows ran out before this page: it is past the end of the data.
    const totalRows = namedRows + rowsBeforeEnd(first.page, P, first.rows.length);
    return { clampTo: canvasTotalPages(totalRows, P), totalRows };
  }

  let rows = [...namedPart, ...first.rows.slice(win.blankOffsetInPage, win.blankOffsetInPage + win.blankCount)];
  let last = first;
  let lastPage = win.blankPage;
  // Rows exist past this page if the blank page holds more than the slice took, or goes on.
  let hasNext = first.rows.length > win.blankOffsetInPage + win.blankCount || first.hasNext;
  if (win.spansTwoBlankPages && first.hasNext) {
    // The slice runs on into the next aligned blank page — reached through the token just cached.
    const rest = P - rows.length;
    const second = await reads.blank(P, win.blankPage + 1, "blank");
    rows = [...rows, ...second.rows.slice(0, rest)];
    last = second;
    lastPage = win.blankPage + 1;
    // The same question, asked of the second blank page.
    hasNext = second.rows.length > rest || second.hasNext;
  }

  if (rows.length === 0 && wanted > 1) {
    const totalRows = namedRows + rowsBeforeEnd(lastPage, P, last.rows.length);
    return { clampTo: canvasTotalPages(totalRows, P), totalRows };
  }

  // The blank segment's size: exact once its walk has ended at the data, the count until then.
  const blankRows = !last.hasNext && !last.limited
    ? rowsBeforeEnd(lastPage, P, last.rows.length)
    : last.totalRows;
  return pageOf(rows, namedRows + blankRows, wanted, P, hasNext);
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
    top: 1,
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
 * in `ItemEnabled`, so a direct call succeeds. `ProjectDocs/skeleton-reference/docs/SECURITY.md` records that the real
 * boundary is a pre-operation plug-in on `vsb_project` Delete; this function deliberately does
 * not re-implement it on the client, because a client-side guard would read as the boundary.
 *
 * P-1: the skip tokens `countedPage` cached for this table were computed against the row set as
 * it was BEFORE this delete. A Dataverse paging cookie encodes the last row's sort key and
 * primary key, so once a row is gone the row that moves up into its place can be served as both
 * the last row of one page and the first row of the next. The signature a caller passes does not
 * change on a delete — only the data does — so the cache has to be dropped here.
 *
 * It is dropped in the DATA LAYER, not in the calling hook, deliberately: the data layer owns
 * that cache, so invalidating it here covers every caller of `deleteProject` rather than only
 * the one hook that happens to know about paging today.
 *
 * Only after the delete actually succeeds: `deleteRecord` throws on an SDK failure, so a refused
 * delete never reaches this line and never throws away a cache that is still correct.
 */
export async function deleteProject(projectId: string): Promise<void> {
  await deleteRecord("delete project", ES_PROJECTS, projectId);
  invalidatePageTokens(ES_PROJECTS);
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
