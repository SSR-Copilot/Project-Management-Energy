/**
 * `queryProjects` — the portfolio screen's single read, exercised end to end against the
 * mock backend.
 *
 * These are integration assertions, not unit ones, and they exist because the interesting
 * failures in this path are all *between* layers. Three of them were live defects:
 *
 *   - `qs()` dropped `$skip` and `$count` while the live path sent both, so paging returned
 *     page 1 forever and the footer total was undefined in one mode only.
 *   - the mock ignored `$skip` even when it arrived.
 *   - the screen fetched with `all: true` and filtered in the component.
 *
 * A pure-function test cannot catch any of those: each one needs the request to actually be
 * built, serialised, and answered. So this file asserts on the `Query` the data client
 * receives, and on the rows that come back.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { dataClient, type Query } from "@/platform/dataClient";
import { SELECT } from "@/data/entities";
import { PAGE_SIZE, TOTAL_PROJECTS } from "@/data/mock/projectSeed";
import { queryProjects } from "./projectQueries";
import {
  DEFAULT_SORT, PROJECT_MAIN_COL as C, buildProjectFilter, emptyProjectListFilter,
} from "@/features/pm/project-main/rules";

/** Capture the Query objects the client is asked for, without stubbing the answer. */
function spyOnQueries(): Query[] {
  const seen: Query[] = [];
  const real = dataClient.list.bind(dataClient);
  vi.spyOn(dataClient, "list").mockImplementation((entitySet, q) => {
    seen.push(q);
    return real(entitySet, q);
  });
  return seen;
}

afterEach(() => vi.restoreAllMocks());

describe("UT-PQ — queryProjects against the mock backend", () => {
  it("UT-PQ-001 issues exactly ONE request per page, and never a table walk", async () => {
    const seen = spyOnQueries();
    await queryProjects(undefined, { page: 1, pageSize: PAGE_SIZE }, DEFAULT_SORT);

    expect(seen).toHaveLength(1);
    // `all: true` follows the skip token until the table is exhausted. On a 1,127-row table
    // that is six requests to render two hundred rows, and it is what this screen used to do.
    expect(seen[0].all).toBeUndefined();
  });

  it("UT-PQ-002 sends select, orderby, top, skip and count on the paged request", async () => {
    const seen = spyOnQueries();
    await queryProjects(undefined, { page: 3, pageSize: PAGE_SIZE }, DEFAULT_SORT);

    const q = seen[0];
    expect(q.select).toEqual([...SELECT.projectMain]);
    expect(q.orderBy).toEqual([`${DEFAULT_SORT.col} asc`]);
    expect(q.top).toBe(PAGE_SIZE);
    expect(q.skip).toBe(2 * PAGE_SIZE);
    // Without this the live path returns no `@odata.count` and the footer reads the page size.
    expect(q.count).toBe(true);
  });

  it("UT-PQ-003 page 1 has no skip — `$skip=0` is noise, and `if (q.skip)` omits it", async () => {
    const seen = spyOnQueries();
    await queryProjects(undefined, { page: 1, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    expect(seen[0].skip).toBe(0);
  });

  it("UT-PQ-004 reports the full table count and a full page of rows", async () => {
    const res = await queryProjects(undefined, { page: 1, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    expect(res.totalCount).toBe(TOTAL_PROJECTS);
    expect(res.rows).toHaveLength(PAGE_SIZE);
  });

  it("UT-PQ-005 returns disjoint windows across pages, and the remainder on the last", async () => {
    const p1 = await queryProjects(undefined, { page: 1, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    const p2 = await queryProjects(undefined, { page: 2, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    const last = await queryProjects(undefined, { page: 6, pageSize: PAGE_SIZE }, DEFAULT_SORT);

    const ids = (r: typeof p1) => r.rows.map((x) => x.vsb_projectid);
    // The assertion that proves the `$skip` fix: before it, page 2 was page 1.
    expect(ids(p2)).not.toEqual(ids(p1));
    expect(ids(p1).filter((id) => ids(p2).includes(id))).toEqual([]);

    expect(last.rows).toHaveLength(TOTAL_PROJECTS - 5 * PAGE_SIZE);
    expect(last.totalCount).toBe(TOTAL_PROJECTS);
  });

  it("UT-PQ-006 keeps the total post-filter and pre-page", async () => {
    // `totalCount` drives "Total Rows" and the page count, so it must be the size of the
    // filtered set, not of the page and not of the table.
    const filter = buildProjectFilter({ ...emptyProjectListFilter, keyword: "Test" });
    expect(filter).toBeTruthy();

    const res = await queryProjects(filter, { page: 1, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    expect(res.totalCount).toBeGreaterThan(0);
    expect(res.totalCount).toBeLessThan(TOTAL_PROJECTS);
    expect(res.rows.length).toBeLessThanOrEqual(res.totalCount);
  });

  it("UT-PQ-007 applies a keyword only at three characters, through the whole stack", async () => {
    const two = buildProjectFilter({ ...emptyProjectListFilter, keyword: "Te" });
    expect(two).toBeUndefined();

    const unfiltered = await queryProjects(two, { page: 1, pageSize: 5 }, DEFAULT_SORT);
    expect(unfiltered.totalCount).toBe(TOTAL_PROJECTS);

    const three = buildProjectFilter({ ...emptyProjectListFilter, keyword: "Tes" });
    const filtered = await queryProjects(three, { page: 1, pageSize: 5 }, DEFAULT_SORT);
    expect(filtered.totalCount).toBeLessThan(TOTAL_PROJECTS);
  });

  it("UT-PQ-008 orders ascending and descending, and the two disagree", async () => {
    const up = await queryProjects(undefined, { page: 1, pageSize: 5 }, { col: C.name, asc: true });
    const down = await queryProjects(undefined, { page: 1, pageSize: 5 }, { col: C.name, asc: false });

    const names = (r: typeof up) => r.rows.map((x) => String(x[C.name]));
    expect(names(up)).not.toEqual(names(down));
    // Code-unit order, matching the mock's comparator — deliberately NOT `localeCompare`.
    expect(names(up)).toEqual([...names(up)].sort());
  });

  it("UT-PQ-009 clamps a page below 1 to the first window rather than a negative skip", async () => {
    const seen = spyOnQueries();
    await queryProjects(undefined, { page: 0, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    // A negative `$skip` is a 400 against live Dataverse.
    expect(seen[0].skip).toBe(0);
  });

  it("UT-PQ-010 returns an empty page, with the total intact, past the last page", async () => {
    const res = await queryProjects(undefined, { page: 99, pageSize: PAGE_SIZE }, DEFAULT_SORT);
    expect(res.rows).toEqual([]);
    // `computePaging` resets the page in that case; the query itself must not invent rows.
    expect(res.totalCount).toBe(TOTAL_PROJECTS);
  });

  it("UT-PQ-011 projects the columns the grid reads, with lookup labels", async () => {
    const res = await queryProjects(undefined, { page: 1, pageSize: 1 }, DEFAULT_SORT);
    const row = res.rows[0] as Record<string, unknown>;

    for (const col of [C.name, C.shortName, C.internalProjectId, C.totalCapacity, C.approvalState]) {
      expect(col in row).toBe(true);
    }
    // The FormattedValue siblings are what the Country / Status / Manager columns render.
    expect(`${C.country}@OData.Community.Display.V1.FormattedValue` in row).toBe(true);
    expect(`${C.clusterState}@OData.Community.Display.V1.FormattedValue` in row).toBe(true);
  });
});
