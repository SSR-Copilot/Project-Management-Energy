import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CountedPage, CountedPageRequest } from "./client";

/**
 * `loadProjectPage`'s two-segment merge (named rows with a sort value, then the "blank" tail
 * without one) is the densest logic in this file and had NO direct unit test before this —
 * only indirect coverage through `Screen.test.tsx`'s SDK-level mocks, which never happened to
 * exercise "the named segment is completely empty." Mocking `countedPage` directly here
 * isolates the merge logic itself from the transport.
 */
const countedPageMock = vi.fn<
  (op: string, table: string, req: CountedPageRequest) => Promise<CountedPage<Record<string, unknown>>>
>();

const fetchAllMock = vi.fn<(op: string, page: unknown, options: Record<string, unknown>) => Promise<unknown[]>>();

vi.mock("./client", () => ({
  countedPage: (...args: Parameters<typeof countedPageMock>) => countedPageMock(...args),
  deleteRecord: vi.fn(),
  resetPageTokens: vi.fn(),
  fetchAll: (...args: Parameters<typeof fetchAllMock>) => fetchAllMock(...args),
}));

const { loadProjectPage, searchProjectManagers, resetProjectPageCache } = await import("./projects");
const { EMPTY_FILTER, DEFAULT_SORT, COL } = await import("@/features/project-overview/rules");
const { asc, desc } = await import("./odata");

const PAGE_SIZE = 10;

beforeEach(() => resetProjectPageCache());

function row(id: string): Record<string, unknown> {
  return { vsb_projectid: id, Project: id };
}

describe("loadProjectPage — the named/blank segment merge", () => {
  it(
    "UT-PROJPAGE-001 serves the tail's real rows on page 1, not the empty named segment, " +
      "when every filtered project is blank on the sorted column",
    async () => {
      countedPageMock.mockImplementation(async (op) => {
        if (op === "load projects") {
          // The named segment: nothing has a value in the sorted column.
          return { rows: [], totalRows: 0, page: 1, hasNext: false };
        }
        // The tail: this is where the real data actually is.
        return {
          rows: [row("a"), row("b")],
          totalRows: 2,
          page: 1,
          hasNext: false,
        };
      });

      const result = await loadProjectPage({
        filter: EMPTY_FILTER,
        sort: DEFAULT_SORT,
        page: 1,
        pageSize: PAGE_SIZE,
      });

      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      // The bug this pins: totalPages was overcounted by one phantom named page.
      expect(result.totalPages).toBe(1);
      expect(result.page).toBe(1);
    },
  );

  it(
    "UT-PROJPAGE-002 does not overcount totalPages with a phantom named page when the " +
      "named segment is empty but the tail spans more than one page",
    async () => {
      countedPageMock.mockImplementation(async (op, _table, req) => {
        if (op === "load projects") {
          return { rows: [], totalRows: 0, page: 1, hasNext: false };
        }
        // 15 tail rows at pageSize 10 is 2 tail pages.
        if (req.page === 1) {
          return { rows: Array.from({ length: 10 }, (_, i) => row(`t${i}`)), totalRows: 15, page: 1, hasNext: true };
        }
        return { rows: [row("t10"), row("t11"), row("t12"), row("t13"), row("t14")], totalRows: 15, page: 2, hasNext: false };
      });

      const page1 = await loadProjectPage({
        filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 1, pageSize: PAGE_SIZE,
      });
      expect(page1.totalPages).toBe(2);
      expect(page1.rows).toHaveLength(10);

      const page2 = await loadProjectPage({
        filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 2, pageSize: PAGE_SIZE,
      });
      expect(page2.page).toBe(2);
      expect(page2.rows).toHaveLength(5);
    },
  );

  it(
    "UT-PROJPAGE-003 still serves the named segment's own page correctly when it has rows",
    async () => {
      countedPageMock.mockImplementation(async (op) => {
        if (op === "load projects") {
          return { rows: [row("n1"), row("n2")], totalRows: 2, page: 1, hasNext: false };
        }
        return { rows: [], totalRows: 0, page: 1, hasNext: false };
      });

      const result = await loadProjectPage({
        filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 1, pageSize: PAGE_SIZE,
      });
      expect(result.rows).toHaveLength(2);
      expect(result.totalPages).toBe(1);
      expect(result.page).toBe(1);
    },
  );

  /**
   * A model of `countedPage` over in-memory segments: pages of `req.top`, clamped to the last
   * page, `page: 1` and no rows for an empty segment, `hasNext` from what remains.
   */
  function modelSegments(named: number, blank: number) {
    const seg = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => row(`${prefix}${i + 1}`));
    countedPageMock.mockImplementation(async (op, _table, req) => {
      const isNamed = op === "load projects";
      const rows = isNamed ? seg("n", named) : seg("b", blank);
      const pages = Math.max(1, Math.ceil(rows.length / req.top));
      const page = Math.min(Math.max(1, req.page), pages);
      return {
        rows: rows.slice((page - 1) * req.top, page * req.top),
        totalRows: rows.length,
        page,
        hasNext: page < pages,
      };
    });
  }

  it(
    "UT-PROJPAGE-006 SOURCE DEFECT: the segments share the boundary page, so 25 named + 4 " +
      "nameless at size 10 is 3 pages (not 4) and page 3 is 5 named + 4 nameless rows",
    async () => {
      modelSegments(25, 4);
      const ids = async (page: number) => {
        const r = await loadProjectPage({
          filter: EMPTY_FILTER, sort: DEFAULT_SORT, page, pageSize: PAGE_SIZE,
        });
        return { r, ids: r.rows.map((x) => x.id) };
      };
      const p3 = await ids(3);
      expect(p3.r.totalRows).toBe(29);
      expect(p3.r.totalPages).toBe(3);
      expect(p3.r.hasNext).toBe(false);
      expect(p3.ids).toEqual(["n21", "n22", "n23", "n24", "n25", "b1", "b2", "b3", "b4"]);
      const p2 = await ids(2);
      expect(p2.ids).toHaveLength(10);
      expect(p2.r.hasNext).toBe(true);
    },
  );

  it(
    "UT-PROJPAGE-007 a pure-tail page that starts mid tail-page is sliced across two tail pages",
    async () => {
      modelSegments(5, 30); // page 1: n1..n5 + b1..b5; page 2: b6..b15; page 3: b16..b25; page 4: b26..b30
      const page2 = await loadProjectPage({
        filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 2, pageSize: PAGE_SIZE,
      });
      expect(page2.rows.map((x) => x.id)).toEqual(
        ["b6", "b7", "b8", "b9", "b10", "b11", "b12", "b13", "b14", "b15"]);
      expect(page2.totalPages).toBe(4);
      const page4 = await loadProjectPage({
        filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 4, pageSize: PAGE_SIZE,
      });
      expect(page4.rows.map((x) => x.id)).toEqual(["b26", "b27", "b28", "b29", "b30"]);
      expect(page4.hasNext).toBe(false);
    },
  );

  it("UT-PROJPAGE-008 a page past the end serves page 1 (canvas adjustedPage = 1)", async () => {
    modelSegments(25, 4);
    const r = await loadProjectPage({
      filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 40, pageSize: PAGE_SIZE,
    });
    expect(r.page).toBe(1);
    expect(r.rows.map((x) => x.id)).toEqual(
      ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10"]);
    expect(r.totalRows).toBe(29);
    expect(r.totalPages).toBe(3);
    expect(r.hasNext).toBe(true);
  });

  it("UT-PROJPAGE-027 the named query is ordered by the sort column then the unique Project ID", async () => {
    modelSegments(25, 4);
    countedPageMock.mockClear();
    await loadProjectPage({
      filter: EMPTY_FILTER, sort: { col: COL.technology, asc: false }, page: 1, pageSize: PAGE_SIZE,
    });
    const named = countedPageMock.mock.calls.filter(([op]) => op === "load projects");
    expect(named.length).toBeGreaterThan(0);
    for (const [, , req] of named) {
      expect(req.orderBy).toEqual([desc(COL.technology), asc(COL.projectIdCode)]);
    }
    // The nameless tail keeps its own order: the autonumber alone.
    const tail = countedPageMock.mock.calls.filter(([op]) => op === "load projects with no sort value");
    for (const [, , req] of tail) expect(req.orderBy).toEqual([asc(COL.projectIdCode)]);
  });

  it("UT-PROJPAGE-028 no tie-break is added when the sort column already is Project ID", async () => {
    modelSegments(25, 4);
    countedPageMock.mockClear();
    await loadProjectPage({
      filter: EMPTY_FILTER, sort: { col: COL.projectIdCode, asc: false }, page: 1, pageSize: PAGE_SIZE,
    });
    const named = countedPageMock.mock.calls.filter(([op]) => op === "load projects");
    expect(named.length).toBeGreaterThan(0);
    for (const [, , req] of named) expect(req.orderBy).toEqual([desc(COL.projectIdCode)]);
  });

  it("UT-PROJPAGE-029 the cache signature carries the whole orderBy, so sorts never share a token", async () => {
    modelSegments(25, 4);
    countedPageMock.mockClear();
    const signatureFor = async (sort: { col: string; asc: boolean }) => {
      countedPageMock.mockClear();
      await loadProjectPage({ filter: EMPTY_FILTER, sort, page: 1, pageSize: PAGE_SIZE });
      const call = countedPageMock.mock.calls.find(([op]) => op === "load projects");
      return call?.[2].signature;
    };
    const byTech = await signatureFor({ col: COL.technology, asc: true });
    const byTechDesc = await signatureFor({ col: COL.technology, asc: false });
    const byId = await signatureFor({ col: COL.projectIdCode, asc: true });
    expect(byTech).toContain(`${asc(COL.technology)},${asc(COL.projectIdCode)}`);
    expect(new Set([byTech, byTechDesc, byId]).size).toBe(3);
  });

  it("UT-PROJPAGE-030 a page past the end resets to page 1 with the correct totals (named segment only)", async () => {
    modelSegments(25, 0);
    const r = await loadProjectPage({
      filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 7, pageSize: PAGE_SIZE,
    });
    expect(r.page).toBe(1);
    expect(r.rows).toHaveLength(10);
    expect(r.totalRows).toBe(25);
    expect(r.totalPages).toBe(3);
  });

  it("UT-PROJPAGE-005 caps the Project Manager search with maxPageSize, never $top", async () => {
    // Dataverse ignores `$top` when the SDK's always-present `odata.maxpagesize` header is set,
    // so `top: limit` returned up to 500 people while the caller believed it asked for 25.
    fetchAllMock.mockResolvedValue([]);
    await searchProjectManagers("ann", 25);

    const options = fetchAllMock.mock.calls[0]?.[2];
    expect(options).toBeDefined();
    expect(options?.maxPageSize).toBe(25);
    expect(options).not.toHaveProperty("top");
  });

  it("UT-PROJPAGE-004 reports an honest empty page when NOTHING matches at all", async () => {
    countedPageMock.mockImplementation(async () => (
      { rows: [], totalRows: 0, page: 1, hasNext: false }
    ));

    const result = await loadProjectPage({
      filter: EMPTY_FILTER, sort: DEFAULT_SORT, page: 1, pageSize: PAGE_SIZE,
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totalRows).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});
