/**
 * `loadProjectPage`'s two-segment paging, and `deleteProject`'s page-token invalidation (P-1).
 *
 * `./client` is mocked at the module boundary: `countedPage` is the forward-only skip-token walk
 * and cannot be exercised for real without a Dataverse connection, so each segment's result is
 * handed in and what matters here is what `loadProjectPage` ASKS for and how it stitches the two
 * answers together.
 *
 * The invalidation tests are the exception. There, `realWalk` hands the call back to the REAL
 * `countedPage` and the SDK is faked one level lower instead, so the real module-level token
 * cache is exercised: that is the only way to prove `invalidatePageTokens(ES_PROJECTS)` passes a
 * string that actually MATCHES the cache key. The key is `` `${tableName}|${signature}` `` where
 * `tableName` is `countedPage`'s second argument, so asserting the argument alone would pass
 * just as happily with a string that clears nothing. What is asserted is the consequence: the
 * next SDK request for that table carries no `skipToken`.
 *
 * UT-PROJPAGE-022..025 also run the real walk, against a fake SDK that models Dataverse's
 * `$top`-versus-`odata.maxpagesize` paging: the regression net for "page 2 shows no projects".
 *
 * The segment algorithm itself is deliberate and documented in `projects.ts`; these tests pin it,
 * they do not propose a different one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COL, EMPTY_FILTER, type ProjectFilter, type SortState } from "@/features/pm/project-main/rules";

interface PageRequest {
  select?: string[];
  filter?: string;
  orderBy?: string[];
  top: number;
  page: number;
  signature: string;
}

interface PageAnswer {
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  hasNext: boolean;
  /** `client.ts`: true ONLY when the walk stopped at `DEFAULT_MAX_PAGE_WALK` with a token left. */
  limited: boolean;
}

interface SdkOptions {
  select?: string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
  count?: boolean;
  maxPageSize?: number;
  skipToken?: string;
}

/** Every `countedPage` call, in order: `[0]` is the named segment, `[1]` the blank one. */
let pageCalls: { operation: string; tableName: string; request: PageRequest }[] = [];
/** What each segment answers, keyed by the operation label `projects.ts` passes. */
let answers: Record<string, (request: PageRequest) => PageAnswer | Promise<PageAnswer>> = {};
/**
 * When set, every fake-SDK request awaits this before answering (it is pushed to `sdkCalls`
 * first). Lets a test hold one segment's read OPEN and look at what else was issued meanwhile.
 */
let sdkGate: ((options: SdkOptions) => Promise<void>) | null = null;
let deleted: { table: string; id: string }[] = [];
let invalidated: string[] = [];
/** Project ids whose `deleteRecord` should fail, the way an SDK refusal reaches the caller. */
let failDeleteFor = new Set<string>();
/** When true, `countedPage` runs for REAL against the fake SDK below, cache and all. */
let realWalk = false;
/** Every request the fake SDK client received, in order. */
let sdkCalls: { table: string; options: SdkOptions }[] = [];
/**
 * When true, the fake SDK models the Dataverse Web API's paging (UT-PROJPAGE-022..025) instead of
 * the fixed token chain below. Folded in from the root-cause harness for "page 2 of Project
 * Overview shows no projects":
 *   - `odata.maxpagesize` (the SDK's `maxPageSize`, default 500) is the page size, and the
 *     server hands back a skip token while rows remain;
 *   - `$top` caps the WHOLE result set: a request carrying `top` gets no skip token, and one
 *     carrying `top` AND a skip token gets zero rows.
 * Rows are numbered across the whole segment (`n1…`, `b1…`), so a test can tell page 2's named
 * rows from page 1's and from the blank segment's.
 */
let dataverse = false;
let namedTotal = 0;
let blankTotal = 0;
/**
 * When true, the fake SDK pages `cookieRows` the way a Dataverse paging cookie does
 * (UT-PROJPAGE-032..033). See `cookieAnswer`.
 */
let cookie = false;
let cookieRows: Record<string, unknown>[] = [];

/**
 * One segment's answer under the paging-cookie model.
 *
 * It sorts the segment by whatever `orderBy` the request carries, then serves `maxPageSize` rows.
 * The skip token records the last row's values in the ORDER columns only, and the next page
 * resumes strictly AFTER that tuple. `@odata.count` is always the segment's true size.
 *
 * How this relates to real Dataverse: its paging cookie also holds the last row's order values
 * (plus its primary key), and Microsoft documents that ordering on a non-unique column can skip
 * or repeat rows across a page boundary. This fake models the skip case deterministically: the
 * other rows that share the value at the seam are lost. Once `orderBy` ends with the primary key,
 * the tuple is unique and "strictly after" is exact, here as in Dataverse. The fake does not
 * know about the fix; it just honours the order it is sent, so the same data passes or fails
 * depending only on what `projects.ts` asks for.
 */
const cookieAnswer = (named: boolean, options: SdkOptions) => {
  const order = (options.orderBy ?? []).map((o) => {
    const [col, dir] = o.split(" ");
    return { col: col!, sign: dir === "desc" ? -1 : 1 };
  });
  const compare = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const { col, sign } of order) {
      const x = String(a[col] ?? "");
      const y = String(b[col] ?? "");
      if (x !== y) return (x < y ? -1 : 1) * sign;
    }
    return 0;
  };
  const rows = cookieRows.filter((r) => Boolean(r[COL.name]) === named).sort(compare);
  const after = options.skipToken ? (JSON.parse(options.skipToken) as Record<string, unknown>) : null;
  const remaining = after ? rows.filter((r) => compare(r, after) > 0) : rows;
  const size = options.maxPageSize ?? 500;
  const data = remaining.slice(0, size);
  const last = data[data.length - 1];
  const skipToken = remaining.length > size && last
    ? JSON.stringify(Object.fromEntries(order.map(({ col }) => [col, last[col]])))
    : undefined;
  return { success: true, data, count: rows.length, skipToken };
};

/** One segment's answer under the Dataverse model. Tokens are `dv-<0-based row offset>`. */
const dataverseAnswer = (named: boolean, options: SdkOptions) => {
  const total = named ? namedTotal : blankTotal;
  const make = (n: number) => row(`${named ? "n" : "b"}${n}`, named ? `Project ${n}` : "");
  if (options.top !== undefined) {
    const data = options.skipToken
      ? []
      : Array.from({ length: Math.min(options.top, total) }, (_, i) => make(i + 1));
    return { success: true, data, count: total, skipToken: undefined };
  }
  const size = options.maxPageSize ?? 500;
  const offset = options.skipToken ? Number(options.skipToken.replace("dv-", "")) : 0;
  const end = Math.min(offset + size, total);
  return {
    success: true,
    data: Array.from({ length: Math.max(0, end - offset) }, (_, i) => make(offset + i + 1)),
    count: total,
    skipToken: end < total ? `dv-${end}` : undefined,
  };
};

/**
 * The fake Dataverse. Hands back a token for the named segment's first two pages only, so a walk
 * to page 3 is a three-request walk whose second and third requests carry a token.
 */
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: async (table: string, options: SdkOptions) => {
      sdkCalls.push({ table, options });
      if (sdkGate) await sdkGate(options);
      const named = (options.filter ?? "").includes("ne null");
      if (dataverse) return dataverseAnswer(named, options);
      if (cookie) return cookieAnswer(named, options);
      const nextByToken: Record<string, string | undefined> = {
        "": "tok-2", "tok-2": "tok-3", "tok-3": undefined,
      };
      return {
        success: true,
        data: [row("a", "Alpha")],
        count: named ? 25 : 5,
        skipToken: named ? nextByToken[options.skipToken ?? ""] : undefined,
      };
    },
  }),
}));

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    ...actual,
    countedPage: async (operation: string, tableName: string, request: PageRequest) => {
      pageCalls.push({ operation, tableName, request });
      if (realWalk) return actual.countedPage(operation, tableName, request as never);
      const answer = answers[operation];
      if (!answer) throw new Error(`no stubbed answer for "${operation}"`);
      return answer(request);
    },
    deleteRecord: async (_operation: string, table: string, id: string) => {
      if (failDeleteFor.has(id)) throw new Error(`delete ${id} denied`);
      deleted.push({ table, id });
    },
    // Records the argument AND performs the real invalidation, so the cache test is honest.
    invalidatePageTokens: (tableName: string) => {
      invalidated.push(tableName);
      actual.invalidatePageTokens(tableName);
    },
  };
});

// The generated services call `getClient(dataSourcesInfo)` while their class statics initialise,
// which needs a Power context this suite does not have. Nothing under test calls them.
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: {} }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: {} }));
vi.mock("@/generated/services/Vsb_countryareasService", () => ({ Vsb_countryareasService: {} }));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({ Vsb_projectstatesService: {} }));
vi.mock("@/generated/services/Vsb_basecasesService", () => ({ Vsb_basecasesService: {} }));
vi.mock("@/generated/services/SystemusersService", () => ({ SystemusersService: {} }));

const { loadProjectPage, deleteProject, pageWindow, rowsBeforeEnd } = await import("./projects");
const { resetPageTokens } = await vi.importActual<typeof import("./client")>("./client");

const NAMED = "load projects";
const BLANK = "load projects with no sort value";
const PAGE_SIZE = 10;

const row = (id: string, name: string): Record<string, unknown> => ({
  [COL.id]: id,
  [COL.name]: name,
  [COL.projectIdCode]: `P-${id}`,
});

/** Row `n` of a segment: `n<n>` named "Project <n>", or the nameless `b<n>`. */
const seqRow = (prefix: "n" | "b", n: number) => row(`${prefix}${n}`, prefix === "n" ? `Project ${n}` : "");

/** `count` rows of `actual`, from 0-based row `from`, each numbered across the whole segment. */
const seqRows = (prefix: "n" | "b", actual: number, from: number, count: number) =>
  Array.from({ length: Math.max(0, Math.min(count, actual - from)) }, (_, i) => seqRow(prefix, from + i + 1));

/**
 * A segment answer whose `page` is clamped to what the stubbed row set actually holds, and whose
 * rows are REAL: `top` rows a page, the last one short, numbered across the segment.
 *
 * Was `segment(totalRows, rows = [])`, which handed back the same fixed rows on every page. Since
 * the pager reads the named segment's exact size off the walk (`(m - 1) * P + rows on page m`),
 * a stub has to serve as many rows as its count says exist.
 */
const segment = (totalRows: number, prefix: "n" | "b" = "n") => staleSegment(totalRows, totalRows, prefix);

/** As `segment`, but `@odata.count` says `countSays` while the walk really holds `actual` rows. */
const staleSegment = (actual: number, countSays: number, prefix: "n" | "b" = "n") =>
  (request: PageRequest): PageAnswer => {
    const pages = actual === 0 ? 1 : Math.ceil(actual / request.top);
    const page = Math.min(Math.max(1, request.page), pages);
    const rows = seqRows(prefix, actual, (page - 1) * request.top, request.top);
    return { rows, totalRows: countSays, page, hasNext: page < pages, limited: false };
  };

const idsOf = (result: { rows: { id: string }[] }) => result.rows.map((r) => r.id);
const seq = (from: number, to: number, prefix = "n") =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/**
 * A segment whose walk stopped at `DEFAULT_MAX_PAGE_WALK`: it is short of the page asked for AND
 * the server still had a token, which is the one case `limited` reports.
 */
const cappedSegment = (cap: number, totalRows: number, rows: Record<string, unknown>[] = []) =>
  (request: PageRequest): PageAnswer => ({
    rows,
    totalRows,
    page: cap,
    hasNext: true,
    limited: request.page > cap,
  });

const request = (page: number, sort?: Partial<SortState>, filter?: Partial<ProjectFilter>) => ({
  filter: { ...EMPTY_FILTER, ...filter },
  sort: { col: COL.name, asc: true, ...sort } as SortState,
  page,
  pageSize: PAGE_SIZE,
});

const namedCall = () => pageCalls.find((c) => c.operation === NAMED)!.request;
/**
 * The LAST blank-segment call. The probe is started alongside the named read on every page view,
 * so on a tail page it is followed by the real tail read; that later call is the one that pages.
 */
const blankCall = () => pageCalls.filter((c) => c.operation === BLANK).slice(-1)[0]!.request;
const blankCalls = () => pageCalls.filter((c) => c.operation === BLANK).map((c) => c.request);

beforeEach(() => {
  pageCalls = [];
  answers = {};
  deleted = [];
  invalidated = [];
  failDeleteFor = new Set();
  realWalk = false;
  sdkCalls = [];
  sdkGate = null;
  dataverse = false;
  namedTotal = 0;
  blankTotal = 0;
  cookie = false;
  cookieRows = [];
  // The real cache is module-level and survives between tests; each test starts from empty.
  resetPageTokens();
});

describe("loadProjectPage — the two ordered segments", () => {
  it("UT-PROJPAGE-001 counts totalPages as RoundUp(totalRows / pageSize), as the canvas does", async () => {
    // 25 named + 5 blank at 10 per page: ONE continuous sequence of 30 rows, so 3 pages.
    // Was titled "counts totalPages as namedPages + blankPages, not ceil(totalRows/pageSize)" and
    // asserted `totalPages` 4 (3 named pages + 1 blank page): the SOURCE DEFECT in `projects.ts`.
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    const result = await loadProjectPage(request(1));

    expect(result.totalRows).toBe(30);
    expect(result.totalPages).toBe(3);
    expect(result.totalPages).toBe(Math.ceil(result.totalRows / PAGE_SIZE));
  });

  it("UT-PROJPAGE-002 reports at least one page for an empty list", async () => {
    answers[NAMED] = segment(0);
    answers[BLANK] = segment(0);

    const result = await loadProjectPage(request(1));

    expect(result.totalRows).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.hasNext).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("UT-PROJPAGE-003 serves the named segment while the walk reaches the asked-for page", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    const result = await loadProjectPage(request(2));

    expect(result.page).toBe(2);
    // Was `toEqual(["a"])` — the old stub served one fixed row on every page.
    expect(idsOf(result)).toEqual(seq(11, 20));
    // The blank segment is only PROBED on a named page: one row, its own signature.
    expect(blankCall().top).toBe(1);
    expect(blankCall().page).toBe(1);
    expect(blankCall().signature).toContain("blank-probe");
    expect(namedCall().signature).toContain("named");
  });

  it("UT-PROJPAGE-004 serves a tail page offset by the blank rows the last named page already took", async () => {
    // 25 named + 15 blank. Page 3 holds n21..n25 + b1..b5, so page 4 is blank rows [5, 15).
    // Was titled "numbers a tail page as named.page + blank.page across the boundary" and asserted
    // `rows` ["z"] and ONE blank read of page 1 (the tail started on a fresh page).
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(15, "b");

    const result = await loadProjectPage(request(4));

    expect(result.page).toBe(4);
    expect(idsOf(result)).toEqual(seq(6, 15, "b"));
    // The probe, then the two 0-aligned blank pages the slice spans, at the full page size.
    expect(blankCalls().map((c) => [c.top, c.page])).toEqual([[1, 1], [PAGE_SIZE, 1], [PAGE_SIZE, 2]]);
    expect(blankCall().signature).toContain("blank");
    expect(blankCall().signature).not.toContain("blank-probe");
  });

  it("UT-PROJPAGE-005 carries on into the tail's own second and third aligned pages", async () => {
    // 25 named + 25 blank = 50 rows, 5 pages. Page 5 is blank rows [15, 25): aligned pages 2 and 3.
    // Was `segment(15)` for the blank segment, asserting blank page 2 and `page`/`totalPages` 5
    // (3 named pages + 2 tail pages). With 15 blank rows there are only 4 pages now (see 010).
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(25, "b");

    const result = await loadProjectPage(request(5));

    expect(blankCalls().map((c) => c.page)).toEqual([1, 2, 3]);
    expect(idsOf(result)).toEqual(seq(16, 25, "b"));
    expect(result.page).toBe(5);
    expect(result.totalPages).toBe(5);
  });

  it("UT-PROJPAGE-006 says hasNext on the named segment's LAST page when tail rows overflow it", async () => {
    // Page 3 is the named segment's last: 5 named rows topped up with b1..b5, and b6, b7 follow.
    // Was `segment(5)` for the blank segment: 25 + 5 now fit on page 3 exactly, so Next is off
    // there (UT-PROJPAGE-051); 7 blank rows keep this test's case, a tail after the last named page.
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(7, "b");

    const result = await loadProjectPage(request(3));

    expect(result.page).toBe(3);
    expect(idsOf(result)).toEqual([...seq(21, 25), ...seq(1, 5, "b")]);
    expect(result.hasNext).toBe(true);
  });

  it("UT-PROJPAGE-007 says hasNext false on the named segment's last page with no tail", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(0);

    const result = await loadProjectPage(request(3));

    expect(result.page).toBe(3);
    expect(result.hasNext).toBe(false);
    expect(result.totalPages).toBe(3);
  });

  it("UT-PROJPAGE-008 says hasNext false on the tail's last page", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(15, "b");

    const result = await loadProjectPage(request(5));

    expect(result.hasNext).toBe(false);
  });

  it("UT-PROJPAGE-009 falls back to the last named page when the page asked for is past the end and there is no tail", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(0);

    const result = await loadProjectPage(request(9));

    expect(result.page).toBe(3);
    // Was `toEqual(["a"])` — the old stub served one fixed row on every page.
    expect(idsOf(result)).toEqual(seq(21, 25));
    expect(result.hasNext).toBe(false);
  });

  it("UT-PROJPAGE-010 clamps a page past the end of the tail to the last page", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(15, "b");

    const result = await loadProjectPage(request(99));

    // 40 rows are 4 pages. Was `toBe(5)` (3 named pages + 2 tail pages).
    expect(result.page).toBe(4);
    expect(idsOf(result)).toEqual(seq(6, 15, "b"));
    expect(result.page).toBeLessThanOrEqual(result.totalPages);
  });

  it("UT-PROJPAGE-011 orders the blank segment by the autonumber, not by the sorted column", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    await loadProjectPage(request(1, { col: COL.totalCapacity, asc: false }));

    // Was `toEqual([`${COL.totalCapacity} desc`])`: the primary key now breaks ties (UT-PROJPAGE-034).
    expect(namedCall().orderBy).toEqual([`${COL.totalCapacity} desc`, `${COL.id} asc`]);
    // The sorted column is empty on every row of the tail, so it could not order them.
    // Was `toEqual([`${COL.projectIdCode} asc`])`.
    expect(blankCall().orderBy).toEqual([`${COL.projectIdCode} asc`, `${COL.id} asc`]);
    expect(blankCall().orderBy).not.toContain(`${COL.totalCapacity} desc`);
  });

  it("UT-PROJPAGE-012 splits the two segments on the sorted column being null, over the same base filter", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    await loadProjectPage({ ...request(1), scopeFilter: "_vsb_country_value eq 11111111-1111-1111-1111-111111111111" });

    expect(namedCall().filter).toContain(`${COL.name} ne null`);
    expect(blankCall().filter).toContain(`${COL.name} eq null`);
    for (const call of [namedCall(), blankCall()]) {
      expect(call.filter).toContain("statecode eq 0");
      expect(call.filter).toContain("_vsb_country_value eq 11111111-1111-1111-1111-111111111111");
    }
    expect(pageCalls.every((c) => c.tableName === "vsb_projects")).toBe(true);
  });

  it("UT-PROJPAGE-013 gives the two segments different token signatures for the same query", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    await loadProjectPage(request(1));

    expect(namedCall().signature).not.toBe(blankCall().signature);
    // The signature carries the filter, the sort and the page size — never the page number.
    expect(namedCall().signature).toContain(`${COL.name} asc`);
    expect(namedCall().signature).toContain(String(PAGE_SIZE));
  });

  it("UT-PROJPAGE-014 maps the rows of whichever segment is being served", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(15, "b");

    const named = await loadProjectPage(request(1));
    // Were "Alpha" and "P-a" — the old stub's one fixed row.
    expect(named.rows[0]?.name).toBe("Project 1");
    expect(named.rows[0]?.projectIdCode).toBe("P-n1");

    pageCalls = [];
    const tail = await loadProjectPage(request(4));
    // Was "z": page 4 now starts at the 6th blank row (page 3 took the first five).
    expect(tail.rows[0]?.id).toBe("b6");
    expect(tail.rows[0]?.name).toBe("");
  });

  it("UT-PROJPAGE-018 does NOT serve the tail when the named walk stopped at the page-walk cap", async () => {
    // `named.page < wanted` here too, but for the other reason: the walk hit
    // DEFAULT_MAX_PAGE_WALK with a token still in hand, so named rows DO continue past it.
    answers[NAMED] = cappedSegment(100, 5000, [row("a", "Alpha")]);
    answers[BLANK] = segment(15, "b");

    const result = await loadProjectPage(request(150));

    // The blank segment must have been probed, not paged: serving it here would hand the user
    // tail rows under a page number they asked for named rows at.
    expect(blankCall().top).toBe(1);
    expect(blankCall().signature).toContain("blank-probe");
    expect(result.rows.map((r) => r.id)).toEqual(["a"]);
    expect(result.page).toBe(100);
  });

  it("UT-PROJPAGE-019 DOES serve the tail when the named walk stopped because the rows ran out", async () => {
    // The pair to 018, at the same requested page: identical `named.page < wanted`, opposite
    // `limited`, opposite outcome. Both halves are needed, or the guard looks removable.
    answers[NAMED] = (req: PageRequest) => ({
      ...cappedSegment(100, 5000, [row("a", "Alpha")])(req), hasNext: false, limited: false,
    });
    answers[BLANK] = segment(15, "b");

    const result = await loadProjectPage(request(150));

    expect(blankCall().top).toBe(PAGE_SIZE);
    expect(blankCall().signature).not.toContain("blank-probe");
    // Was `toEqual(["z"])`. The named walk ended at 991 rows (99 full pages + "a"), so the 1,006
    // rows are 101 pages: page 150 clamps to 101, which is blank rows [9, 15).
    expect(idsOf(result)).toEqual(seq(10, 15, "b"));
    expect(result.page).toBe(101);
  });

  it("UT-PROJPAGE-015 treats a zero or fractional page number as page 1", async () => {
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    const result = await loadProjectPage(request(0));

    expect(namedCall().page).toBe(1);
    expect(result.page).toBe(1);
  });
});

describe("deleteProject — page-token invalidation (P-1)", () => {
  it("UT-PROJPAGE-016 drops the cached page tokens for vsb_projects after a successful delete", async () => {
    await deleteProject("11111111-1111-1111-1111-111111111111");

    expect(deleted).toEqual([
      { table: "vsb_projects", id: "11111111-1111-1111-1111-111111111111" },
    ]);
    expect(invalidated).toEqual(["vsb_projects"]);
  });

  it("UT-PROJPAGE-017 does NOT drop the tokens when the delete fails", async () => {
    failDeleteFor.add("22222222-2222-2222-2222-222222222222");

    await expect(deleteProject("22222222-2222-2222-2222-222222222222")).rejects.toThrow(/denied/);

    expect(deleted).toEqual([]);
    expect(invalidated).toEqual([]);
  });

  /** The named segment's SDK requests only — the blank probe walks page 1 and never holds one. */
  const namedSdkCalls = () => sdkCalls.filter((c) => (c.options.filter ?? "").includes("ne null"));

  it("UT-PROJPAGE-020 makes the next walk start from page 1 with no skipToken after a delete", async () => {
    realWalk = true;

    // Walk to page 3 so the cache holds tokens for pages 2 and 3 under this signature.
    await loadProjectPage(request(3));
    expect(namedSdkCalls().map((c) => c.options.skipToken)).toEqual([undefined, "tok-2", "tok-3"]);

    await deleteProject("11111111-1111-1111-1111-111111111111");
    expect(invalidated).toEqual(["vsb_projects"]);

    sdkCalls = [];
    await loadProjectPage(request(3));

    // The proof the argument matched the cache key: the walk restarts from the beginning rather
    // than resuming from a token computed against the pre-delete row set.
    expect(namedSdkCalls()[0]?.options.skipToken).toBeUndefined();
    expect(namedSdkCalls().map((c) => c.options.skipToken)).toEqual([undefined, "tok-2", "tok-3"]);
    expect(namedSdkCalls()).toHaveLength(3);
  });

  it("UT-PROJPAGE-021 resumes from a cached token when nothing was deleted", async () => {
    // The control for 020: without the invalidation the SECOND walk jumps straight to the token
    // for the page asked for, which is exactly the stale-cursor behaviour P-1 is about.
    realWalk = true;

    await loadProjectPage(request(3));
    sdkCalls = [];
    await loadProjectPage(request(3));

    expect(namedSdkCalls()[0]?.options.skipToken).toBe("tok-3");
    expect(namedSdkCalls()).toHaveLength(1);
  });
});

/*
 * "Page 2 of Project Overview shows no projects, and Next is disabled on page 2."
 *
 * The real `countedPage` and the real `loadProjectPage` run against a fake SDK that models how
 * Dataverse treats `$top` versus `odata.maxpagesize` (see `dataverse` above). `countedPage` used
 * to send the page size as `top`: the server then capped the result at one page and returned no
 * skip token, so the walk never left page 1, page 1's Next was lit only by the blank segment's
 * count, and `wantsTail` served the blank segment as page 2. `client.countedPage.test.ts`
 * UT-PAGE-014 pins the fix one level down; these pin it where the user saw it.
 */
describe("loadProjectPage — paging against a Dataverse-shaped server", () => {
  const ids = (result: { rows: { id: string }[] }) => result.rows.map((r) => r.id);
  const range = (from: number, to: number, prefix = "n") =>
    Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
  const namedSdkCalls = () => sdkCalls.filter((c) => (c.options.filter ?? "").includes("ne null"));

  beforeEach(() => {
    realWalk = true;
    dataverse = true;
    // 35 named at 10 per page: 4 named pages, the last one short.
    namedTotal = 35;
    blankTotal = 3;
  });

  it("UT-PROJPAGE-022 page 1 is a full page of named rows, and hasNext comes from a real skip token", async () => {
    // No blank segment, so `blank.totalRows > 0` cannot light Next: only a token can.
    blankTotal = 0;

    const result = await loadProjectPage(request(1));

    expect(ids(result)).toEqual(range(1, PAGE_SIZE));
    expect(result.hasNext).toBe(true);
    expect(result.totalPages).toBe(4);
    // The page size reached the server as the page-size preference, never as `$top`.
    expect(namedSdkCalls()[0]?.options.maxPageSize).toBe(PAGE_SIZE);
    expect(namedSdkCalls()[0]?.options.top).toBeUndefined();
  });

  it("UT-PROJPAGE-023 page 2 serves the NEXT named rows, not the blank segment", async () => {
    await loadProjectPage(request(1));
    const result = await loadProjectPage(request(2));

    expect(result.page).toBe(2);
    expect(ids(result)).toEqual(range(PAGE_SIZE + 1, 2 * PAGE_SIZE));
    expect(ids(result).some((id) => id.startsWith("b"))).toBe(false);
    expect(result.hasNext).toBe(true);
    // Reached from page 1's cached token: one request, carrying it.
    expect(namedSdkCalls().map((c) => c.options.skipToken)).toEqual([undefined, `dv-${PAGE_SIZE}`]);
  });

  it("UT-PROJPAGE-024 walks 1 → 2 → 3 → 4 with hasNext true until the last named page", async () => {
    blankTotal = 0;
    const seen: { page: number; ids: string[]; hasNext: boolean }[] = [];
    for (const page of [1, 2, 3, 4]) {
      const result = await loadProjectPage(request(page));
      seen.push({ page: result.page, ids: ids(result), hasNext: result.hasNext });
    }

    expect(seen).toEqual([
      { page: 1, ids: range(1, 10), hasNext: true },
      { page: 2, ids: range(11, 20), hasNext: true },
      { page: 3, ids: range(21, 30), hasNext: true },
      { page: 4, ids: range(31, 35), hasNext: false },
    ]);
  });

  it("UT-PROJPAGE-025 with a tail, the last named page is topped up with it, and the page after is past the end", async () => {
    // 35 named + 3 blank = 38 rows = 4 pages. Was: page 4 `range(31, 35)` with `hasNext` true,
    // then page 5 the tail (`range(1, 3, "b")`, `totalPages` 5) — the tail on a fresh page.
    const lastNamed = await loadProjectPage(request(4));
    expect(lastNamed.page).toBe(4);
    expect(ids(lastNamed)).toEqual([...range(31, 35), ...range(1, 3, "b")]);
    expect(lastNamed.hasNext).toBe(false);
    expect(lastNamed.totalPages).toBe(4);

    const pastEnd = await loadProjectPage(request(5));
    expect(pastEnd.page).toBe(4);
    expect(ids(pastEnd)).toEqual(ids(lastNamed));
    expect(pastEnd.hasNext).toBe(false);
    expect(pastEnd.totalPages).toBe(4);
    // No request on either segment ever carried `top`.
    expect(sdkCalls.every((c) => c.options.top === undefined)).toBe(true);
  });
});

/*
 * The blank probe runs CONCURRENTLY with the named read (one round trip of waiting saved per page
 * view); the real tail read stays sequential. Nothing here asserts `count: true` on any SDK
 * request: `countedPage` may send it only on a query key's first request.
 */
describe("loadProjectPage — the probe overlaps the named read", () => {
  const ids = (result: { rows: { id: string }[] }) => result.rows.map((r) => r.id);
  const range = (from: number, to: number, prefix = "n") =>
    Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
  const isNamed = (o: SdkOptions) => (o.filter ?? "").includes("ne null");
  const blankSdkCalls = () => sdkCalls.filter((c) => !isNamed(c.options));
  /** Lets every pending promise callback and zero-delay timer run. */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    realWalk = true;
    dataverse = true;
    namedTotal = 35;
    blankTotal = 3;
  });

  it("UT-PROJPAGE-026 issues the blank probe while the named read is still open", async () => {
    let releaseNamed!: () => void;
    const namedHeld = new Promise<void>((resolve) => { releaseNamed = resolve; });
    let namedAnswered = false;
    sdkGate = async (options) => {
      if (!isNamed(options)) return;
      await namedHeld;
      namedAnswered = true;
    };

    const pending = loadProjectPage(request(2));
    try {
      await flush();
      // The named read has been sent and is being held open by the gate...
      expect(sdkCalls.some((c) => isNamed(c.options))).toBe(true);
      expect(namedAnswered).toBe(false);
      // ...and the probe has ALREADY been sent: it did not wait for the named answer.
      expect(blankSdkCalls()).toHaveLength(1);
      expect(blankSdkCalls()[0]?.options.maxPageSize).toBe(1);
    } finally {
      releaseNamed();
    }

    const result = await pending;
    expect(result.page).toBe(2);
    expect(ids(result)).toEqual(range(11, 20));
  });

  it("UT-PROJPAGE-027 serves identical results on page 1, a middle page, the last named page and a tail page", async () => {
    const shape = async (page: number) => {
      const r = await loadProjectPage(request(page));
      return { ids: ids(r), totalRows: r.totalRows, totalPages: r.totalPages, page: r.page, hasNext: r.hasNext };
    };

    // 35 named + 3 blank at 10 a page: 38 rows, 4 pages; page 4 is n31..n35 then b1..b3.
    // Was `totalPages: 5` throughout, page 4 `range(31, 35)` with `hasNext: true`, and page 5
    // `range(1, 3, "b")`. Page 5 is past the end now and serves page 4.
    expect(await shape(1)).toEqual({ ids: range(1, 10), totalRows: 38, totalPages: 4, page: 1, hasNext: true });
    expect(await shape(2)).toEqual({ ids: range(11, 20), totalRows: 38, totalPages: 4, page: 2, hasNext: true });
    const last = [...range(31, 35), ...range(1, 3, "b")];
    expect(await shape(4)).toEqual({ ids: last, totalRows: 38, totalPages: 4, page: 4, hasNext: false });
    expect(await shape(5)).toEqual({ ids: last, totalRows: 38, totalPages: 4, page: 4, hasNext: false });
  });

  it("UT-PROJPAGE-028 on a boundary page still issues the real tail read with top = pageSize, after the named read", async () => {
    // Was `request(5)`, titled "on a tail page", expecting `range(1, 3, "b")`: page 5 is past the
    // end now; page 4 is the one that reads the tail (5 named rows + b1..b3).
    const result = await loadProjectPage(request(4));

    expect(ids(result)).toEqual([...range(31, 35), ...range(1, 3, "b")]);
    // The probe (one row) and then the real tail read (a full page).
    expect(blankCalls().map((c) => [c.top, c.page, c.signature.split("|")[0]])).toEqual([
      [1, 1, "blank-probe"],
      [PAGE_SIZE, 1, "blank"],
    ]);
    // Sequential: the tail read is issued last, once the named walk had said where it ended.
    expect(pageCalls.map((c) => c.operation)).toEqual([NAMED, BLANK, BLANK]);
    expect(blankSdkCalls().slice(-1)[0]?.options.maxPageSize).toBe(PAGE_SIZE);
  });
});

describe("loadProjectPage — a failed read rejects the page", () => {
  /** Lets every pending promise callback and zero-delay timer run. */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  let unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

  beforeEach(() => {
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);
    return () => { process.off("unhandledRejection", onUnhandled); };
  });

  const later = <T>(fn: () => T) =>
    new Promise<T>((resolve, reject) => setTimeout(() => {
      try { resolve(fn()); } catch (e) { reject(e); }
    }, 0));

  it("UT-PROJPAGE-029 rejects with the probe's error when the probe fails and the named read succeeds", async () => {
    answers[NAMED] = (req) => later(() => segment(25)(req));
    answers[BLANK] = () => { throw new Error("probe denied"); };

    await expect(loadProjectPage(request(1))).rejects.toThrow(/probe denied/);
    await flush();
    expect(unhandled).toEqual([]);
  });

  it("UT-PROJPAGE-030 rejects with the named read's error when it fails and the probe succeeds", async () => {
    answers[NAMED] = () => { throw new Error("named denied"); };
    answers[BLANK] = (req) => later(() => segment(5, "b")(req));

    await expect(loadProjectPage(request(1))).rejects.toThrow(/named denied/);
    await flush();
    expect(unhandled).toEqual([]);
  });

  it("UT-PROJPAGE-031 leaves no unhandled rejection when BOTH reads fail", async () => {
    answers[NAMED] = () => { throw new Error("named denied"); };
    // Fails after the page has already rejected with the named error.
    answers[BLANK] = () => later(() => { throw new Error("probe denied"); });

    await expect(loadProjectPage(request(1))).rejects.toThrow(/named denied/);
    await flush();
    await flush();
    expect(unhandled).toEqual([]);
  });
});

/*
 * "The pager reads page 6 of 7, but Next is disabled, so page 7 can never be reached."
 *
 * Seen against live VSBCloud_Dev. `@odata.count` said there were more named rows than the
 * skip-token walk returned, because the order was the sort column alone and project names are not
 * unique: the paging cookie lost the rows that shared a name at a page seam. Two fixes in
 * `projects.ts`, each pinned here: the primary key as a tie-breaker in both segments' order
 * (032..034), and a page count that takes the walk's word once the walk has reached the end
 * (035..037).
 */
describe("loadProjectPage — the walk and the page count agree", () => {
  const ids = (result: { rows: { id: string }[] }) => result.rows.map((r) => r.id);

  /** Clicks Next from page 1 until it is disabled, recording what the pager showed each time. */
  const clickThrough = async () => {
    const views: { page: number; totalPages: number; hasNext: boolean }[] = [];
    const seen: string[] = [];
    // Bounded by passes, not by page number: a served page that moved backwards must fail the
    // test, not spin the worker forever.
    for (let pass = 0, page = 1; pass < 20; pass++) {
      const result = await loadProjectPage(request(page));
      views.push({ page: result.page, totalPages: result.totalPages, hasNext: result.hasNext });
      seen.push(...ids(result));
      if (!result.hasNext) break;
      page = result.page + 1;
    }
    return { views, seen };
  };

  /**
   * 65 named rows at 10 a page, so the count says 7 pages. In each of the first five groups the
   * tenth name is shared by TWO projects (9 unique names plus a pair, 11 rows); the sixth group is
   * 10 unique names. Ordered by name alone, pages 1..5 each end on the first of a pair and the
   * cookie skips the second, so page 6 ends exactly at the data with no token: 60 rows, 6 pages.
   *
   * (If the LAST group straddled a seam too, the fake would still hand back a token, since a row
   * remains, and page 7 would come back empty. That is a different symptom, not this one.)
   */
  const namesSharedAtEverySeam = () => {
    const rows: Record<string, unknown>[] = [];
    for (let k = 1; k <= 5; k++) {
      for (let i = 1; i <= 9; i++) rows.push(row(`id-${k}-0${i}`, `P${k}-0${i}`));
      rows.push(row(`id-${k}-10b`, `P${k}-10`), row(`id-${k}-10a`, `P${k}-10`));
    }
    for (let i = 1; i <= 10; i++) rows.push(row(`id-6-${String(i).padStart(2, "0")}`, `P6-${String(i).padStart(2, "0")}`));
    return rows;
  };

  beforeEach(() => {
    realWalk = true;
    cookie = true;
  });

  it("UT-PROJPAGE-032 reaches the last page and every named project when names repeat at page seams", async () => {
    // No tail, as in the reported case: nothing after the named rows can light Next.
    cookieRows = namesSharedAtEverySeam();

    const { views, seen } = await clickThrough();

    // Before the fix this ended at { page: 6, totalPages: 7, hasNext: false }, 60 rows seen.
    expect(views.slice(-1)[0]).toEqual({ page: 7, totalPages: 7, hasNext: false });
    // Every page but the last says Next, and the count never disagrees with where Next stops.
    expect(views.every((v) => v.hasNext === v.page < v.totalPages)).toBe(true);
    expect(seen).toHaveLength(65);
    expect(new Set(seen).size).toBe(65);
  });

  it("UT-PROJPAGE-033 serves every tail project once when autonumbers repeat at page seams", async () => {
    // 5 named rows (one short page), then 22 nameless ones whose `vsb_name` repeats at each seam.
    // Under the old order both seams lose a row, and the second one's token leads to an EMPTY
    // last page, so the page count still looks right: the rows seen are what tell the orders apart.
    cookieRows = Array.from({ length: 5 }, (_, i) => row(`n${i}`, `Named ${i}`));
    for (let k = 1; k <= 2; k++) {
      for (let i = 1; i <= 9; i++) {
        cookieRows.push({ [COL.id]: `b-${k}-0${i}`, [COL.name]: "", [COL.projectIdCode]: `PRJ-${k}0${i}` });
      }
      cookieRows.push(
        { [COL.id]: `b-${k}-10b`, [COL.name]: "", [COL.projectIdCode]: `PRJ-${k}10` },
        { [COL.id]: `b-${k}-10a`, [COL.name]: "", [COL.projectIdCode]: `PRJ-${k}10` },
      );
    }

    const { views, seen } = await clickThrough();

    // 27 rows in one contiguous sequence: 3 pages (5 named + 5 blank, 10 blank, 7 blank).
    // Was `{ page: 4, totalPages: 4, hasNext: false }`: 1 named page + 3 tail pages (10, 10, 2).
    expect(views.slice(-1)[0]).toEqual({ page: 3, totalPages: 3, hasNext: false });
    expect(seen).toHaveLength(27);
    expect(new Set(seen).size).toBe(27);
  });

  it("UT-PROJPAGE-034 orders both segments with vsb_projectid asc last, in either sort direction", async () => {
    cookie = false;
    realWalk = false;
    answers[NAMED] = segment(25);
    answers[BLANK] = segment(5, "b");

    for (const ascending of [true, false]) {
      pageCalls = [];
      await loadProjectPage(request(1, { col: COL.name, asc: ascending }));

      // The user's direction on the sort column; the tie-breaker is always ascending.
      expect(namedCall().orderBy).toEqual([`${COL.name} ${ascending ? "asc" : "desc"}`, `${COL.id} asc`]);
      expect(blankCall().orderBy).toEqual([`${COL.projectIdCode} asc`, `${COL.id} asc`]);
      // The order is part of the token signature, so a cache under the old order is never reused.
      expect(namedCall().signature).toContain(`${COL.id} asc`);
    }
  });

  /**
   * A named walk that runs out at `walkPages` pages while the count claims `countRows` rows — a
   * walk that lost rows, a stale count or the 5000 cap all look like this to `loadProjectPage`.
   *
   * Every page is FULL (was one fixed row per page): the pager now reads the named segment's size
   * off the walk, `(m - 1) * P + rows on page m`, so a one-row page would mean a short segment.
   */
  const shortWalk = (walkPages: number, countRows: number) => staleSegment(walkPages * PAGE_SIZE, countRows);

  it("UT-PROJPAGE-035 counts the named pages off the walk once it has ended at the data", async () => {
    cookie = false;
    realWalk = false;
    // The count says 70 rows (7 pages at 10); the walk ends after 6.
    answers[NAMED] = shortWalk(6, 70);
    answers[BLANK] = segment(0);

    const views = [];
    for (const page of [1, 2, 3, 4, 5, 6]) {
      const r = await loadProjectPage(request(page));
      views.push({ page: r.page, totalPages: r.totalPages, hasNext: r.hasNext });
    }

    // Mid-walk the count is all there is; at the real last page the walk's answer wins.
    expect(views.slice(0, 5).every((v) => v.totalPages === 7 && v.hasNext)).toBe(true);
    expect(views[5]).toEqual({ page: 6, totalPages: 6, hasNext: false });
  });

  it("UT-PROJPAGE-036 with a tail, the walk's end is read off the walk and Next stays on until the tail ends", async () => {
    // Title was "... the walk's end is named.page + blankPages and ...". The 60 walked named rows
    // fill page 6 exactly, so the 5 blank rows are page 7 in both arithmetics.
    cookie = false;
    realWalk = false;
    answers[NAMED] = shortWalk(6, 70);
    answers[BLANK] = segment(5, "b");

    const lastNamed = await loadProjectPage(request(6));
    expect(lastNamed).toMatchObject({ page: 6, totalPages: 7, hasNext: true });

    const tail = await loadProjectPage(request(7));
    expect(tail).toMatchObject({ page: 7, totalPages: 7, hasNext: false });
    // Was `toEqual(["z"])` — the old stub's one fixed row.
    expect(ids(tail)).toEqual(seq(1, 5, "b"));
  });

  it("UT-PROJPAGE-037 keeps the count-derived figure on page 1 while more pages are to come", async () => {
    cookie = false;
    realWalk = false;
    answers[NAMED] = shortWalk(6, 70);
    answers[BLANK] = segment(5, "b");

    const result = await loadProjectPage(request(1));

    // 70 named rows from the count + 5 blank = 75 rows, 8 pages: the walk has not reached its end.
    expect(result).toMatchObject({ page: 1, totalPages: 8, hasNext: true });
  });

  it("UT-PROJPAGE-038 never reports fewer pages than the one being served", async () => {
    cookie = false;
    realWalk = false;
    // The tail's count says 5 rows, but its walk holds 40 and is still going past page 5
    // (`hasNext: true`), so neither the walk's end nor the count can set the total: 25 + 5 = 30
    // rows is 3 pages, and only the floor stops the total dropping below the page served.
    // Was: a stub serving one fixed row `z` with `hasNext: true` on every page; it stands for the
    // same case with real rows now, because the blank rows of page 5 are sliced out of it.
    answers[NAMED] = segment(25);
    answers[BLANK] = staleSegment(40, 5, "b");

    const result = await loadProjectPage(request(5));

    expect(result.page).toBe(5);
    expect(result.hasNext).toBe(true);
    // Was 5 (the page served). Since D45 C2 a lit Next promises at least one page more, so the
    // floor is `page + 1` while `hasNext` (UT-PROJPAGE-056): "5 from 5" with Next lit was a lie.
    expect(result.totalPages).toBe(6);
  });

  it("UT-PROJPAGE-039 counts the tail's pages off its walk on the tail's real last page", async () => {
    cookie = false;
    realWalk = false;
    // 25 named rows. The tail's count says 45 rows (70 in all, 7 pages); its walk holds 20 (45, 5).
    // Was: count 25 / walk 2 pages of one fixed row, asserting page 4 `{ 4, 6, true }` mid-tail.
    // Page 4 now reaches the tail's end (aligned blank page 2), so the mid-tail case is page 3.
    answers[NAMED] = segment(25);
    answers[BLANK] = staleSegment(20, 45, "b");

    // Mid-tail, the count is all there is.
    expect(await loadProjectPage(request(3))).toMatchObject({ page: 3, totalPages: 7, hasNext: true });
    // Taking the count here would say { page: 5, totalPages: 7, hasNext: false }: pages 6 and 7
    // could never be reached.
    expect(await loadProjectPage(request(5))).toMatchObject({ page: 5, totalPages: 5, hasNext: false, totalRows: 45 });
  });
});

/*
 * "The canvas shows 6 pages and the code app 7."
 *
 * The canvas pages ONE collection (`Project Main Screen.pa.yaml` L1605 / `App.pa.yaml`
 * L1082-1114): `TotalPages = RoundUp(TotalRows / PageSize, 0) + If(TotalRows = 0, 1, 0)`, and every
 * page holds `PageSize` rows of one continuous sequence. These pin that the two segments are
 * paged the same way — named rows first, then blank, with no fresh page at the seam.
 */
describe("loadProjectPage — one continuous sequence, as in the canvas", () => {
  /** Clicks Next from page 1 until it is disabled, recording every view. */
  const clickThrough = async (pageSize = PAGE_SIZE) => {
    const views: { page: number; totalPages: number; hasNext: boolean; ids: string[] }[] = [];
    for (let pass = 0, page = 1; pass < 30; pass++) {
      const r = await loadProjectPage({ ...request(page), pageSize });
      views.push({ page: r.page, totalPages: r.totalPages, hasNext: r.hasNext, ids: idsOf(r) });
      if (!r.hasNext) break;
      page = r.page + 1;
    }
    return views;
  };
  /** Every row of the list, in order: the named segment, then the blank one. */
  const everyRow = (n: number, b: number) => [...seq(1, n), ...seq(1, b, "b")];

  beforeEach(() => {
    realWalk = true;
    dataverse = true;
  });

  it("UT-PROJPAGE-040 pageWindow: a page wholly inside the named rows takes no blank rows", () => {
    expect(pageWindow(2, 10, 25)).toEqual({
      namedCount: 10, blankCount: 0, blankOffset: 0, blankPage: 1, blankOffsetInPage: 0, spansTwoBlankPages: false,
    });
    // An exact fit: N a multiple of P, the last named page is full.
    expect(pageWindow(2, 10, 20)).toMatchObject({ namedCount: 10, blankCount: 0 });
  });

  it("UT-PROJPAGE-041 pageWindow: the boundary page is the last named rows topped up from blank row 0", () => {
    expect(pageWindow(3, 10, 25)).toEqual({
      namedCount: 5, blankCount: 5, blankOffset: 0, blankPage: 1, blankOffsetInPage: 0, spansTwoBlankPages: false,
    });
    // The user's case: 1,100 named at 200 a page — page 6 is 100 named + 100 blank slots.
    expect(pageWindow(6, 200, 1100)).toMatchObject({ namedCount: 100, blankCount: 100, blankOffset: 0 });
  });

  it("UT-PROJPAGE-042 pageWindow: a tail page starts at o = (k-1)P - N and may span two aligned blank pages", () => {
    expect(pageWindow(4, 10, 25)).toEqual({
      namedCount: 0, blankCount: 10, blankOffset: 5, blankPage: 1, blankOffsetInPage: 5, spansTwoBlankPages: true,
    });
    expect(pageWindow(5, 10, 25)).toMatchObject({ blankOffset: 15, blankPage: 2, blankOffsetInPage: 5, spansTwoBlankPages: true });
    // Aligned (N a multiple of P): one blank page per tail page.
    expect(pageWindow(3, 10, 20)).toEqual({
      namedCount: 0, blankCount: 10, blankOffset: 0, blankPage: 1, blankOffsetInPage: 0, spansTwoBlankPages: false,
    });
    // No named rows at all: the blank segment is the whole list.
    expect(pageWindow(2, 10, 0)).toMatchObject({ namedCount: 0, blankOffset: 10, blankPage: 2, spansTwoBlankPages: false });
  });

  it("UT-PROJPAGE-043 rowsBeforeEnd: full pages before the walk's last page, plus the rows on it", () => {
    expect(rowsBeforeEnd(6, 200, 100)).toBe(1100);
    expect(rowsBeforeEnd(1, 10, 0)).toBe(0);
    expect(rowsBeforeEnd(3, 10, 10)).toBe(30);
  });

  it("UT-PROJPAGE-044 1,100 named + 50 blank at 200 a page is 6 pages; page 6 is 100 named then 50 blank", async () => {
    namedTotal = 1100;
    blankTotal = 50;

    const first = await loadProjectPage({ ...request(1), pageSize: 200 });
    expect(first).toMatchObject({ totalRows: 1150, totalPages: 6, hasNext: true });

    const last = await loadProjectPage({ ...request(6), pageSize: 200 });
    expect(last).toMatchObject({ page: 6, totalRows: 1150, totalPages: 6, hasNext: false });
    expect(idsOf(last)).toEqual([...seq(1001, 1100), ...seq(1, 50, "b")]);
    // The old arithmetic said ceil(1100 / 200) + ceil(50 / 200) = 7.
    expect(last.totalPages).not.toBe(Math.ceil(1100 / 200) + Math.ceil(50 / 200));
  });

  it("UT-PROJPAGE-045 N = 25, B = 7: 4 pages, page 3 is 5 named + 5 blank, page 4 the last 2 blank, every row once in order", async () => {
    namedTotal = 25;
    blankTotal = 7;

    const views = await clickThrough();

    // 25 named + 7 blank = 32 rows: RoundUp(32 / 10) = 4 on every page.
    expect(views.map((v) => [v.page, v.totalPages, v.hasNext])).toEqual([
      [1, 4, true], [2, 4, true], [3, 4, true], [4, 4, false],
    ]);
    expect(views[2]!.ids).toEqual([...seq(21, 25), ...seq(1, 5, "b")]);
    expect(views[3]!.ids).toEqual(seq(6, 7, "b"));
    expect(views.flatMap((v) => v.ids)).toEqual(everyRow(25, 7));
  });

  it("UT-PROJPAGE-046 N = 20, B = 0: 2 pages, and Next is off on page 2", async () => {
    namedTotal = 20;
    blankTotal = 0;

    const views = await clickThrough();

    expect(views.map((v) => [v.page, v.totalPages, v.hasNext])).toEqual([[1, 2, true], [2, 2, false]]);
    expect(views.flatMap((v) => v.ids)).toEqual(everyRow(20, 0));
  });

  it("UT-PROJPAGE-047 N = 20, B = 5: 3 pages; the full last named page lights Next, page 3 is the 5 blank", async () => {
    namedTotal = 20;
    blankTotal = 5;

    const views = await clickThrough();

    expect(views.map((v) => [v.page, v.totalPages, v.hasNext])).toEqual([[1, 3, true], [2, 3, true], [3, 3, false]]);
    expect(views[1]!.ids).toEqual(seq(11, 20));
    expect(views[2]!.ids).toEqual(seq(1, 5, "b"));
    expect(views.flatMap((v) => v.ids)).toEqual(everyRow(20, 5));
  });

  it("UT-PROJPAGE-048 N = 0, B = 12: 2 pages, all blank", async () => {
    namedTotal = 0;
    blankTotal = 12;

    const views = await clickThrough();

    expect(views.map((v) => [v.page, v.totalPages, v.hasNext])).toEqual([[1, 2, true], [2, 2, false]]);
    expect(views[0]!.ids).toEqual(seq(1, 10, "b"));
    expect(views[1]!.ids).toEqual(seq(11, 12, "b"));
  });

  it("UT-PROJPAGE-049 N = 0, B = 0: 1 page, no rows, no Next", async () => {
    namedTotal = 0;
    blankTotal = 0;

    const result = await loadProjectPage(request(1));

    expect(result).toMatchObject({ page: 1, totalRows: 0, totalPages: 1, hasNext: false });
    expect(result.rows).toEqual([]);
  });

  it("UT-PROJPAGE-050 a tail offset spanning two aligned blank pages reads both and slices across the seam", async () => {
    // N = 25, B = 17: page 4 is blank rows [5, 15) — the end of blank page 1 and the start of page 2.
    namedTotal = 25;
    blankTotal = 17;

    const views = await clickThrough();

    expect(views.map((v) => [v.page, v.totalPages, v.hasNext])).toEqual([
      [1, 5, true], [2, 5, true], [3, 5, true], [4, 5, true], [5, 5, false],
    ]);
    expect(views[3]!.ids).toEqual(seq(6, 15, "b"));
    expect(views[4]!.ids).toEqual(seq(16, 17, "b"));
    expect(views.flatMap((v) => v.ids)).toEqual(everyRow(25, 17));

    // Page 4 on its own: the probe, then blank pages 1 and 2 under the "blank" signature.
    pageCalls = [];
    await loadProjectPage(request(4));
    expect(blankCalls().map((c) => [c.top, c.page, c.signature.split("|")[0]])).toEqual([
      [1, 1, "blank-probe"], [PAGE_SIZE, 1, "blank"], [PAGE_SIZE, 2, "blank"],
    ]);
  });

  it("UT-PROJPAGE-051 hasNext on every boundary page, exact fits included", async () => {
    const at = async (n: number, b: number, page: number) => {
      namedTotal = n;
      blankTotal = b;
      resetPageTokens();
      const r = await loadProjectPage(request(page));
      return { page: r.page, hasNext: r.hasNext, totalPages: r.totalPages };
    };
    // Named rows end inside the page, blank rows fill it exactly: nothing follows.
    expect(await at(25, 5, 3)).toEqual({ page: 3, hasNext: false, totalPages: 3 });
    // ...one blank row more: it spills onto page 4.
    expect(await at(25, 6, 3)).toEqual({ page: 3, hasNext: true, totalPages: 4 });
    // Named rows fill the page exactly, no tail: nothing follows.
    expect(await at(30, 0, 3)).toEqual({ page: 3, hasNext: false, totalPages: 3 });
    // Named rows fill the page exactly, a tail follows on the next page.
    expect(await at(30, 1, 3)).toEqual({ page: 3, hasNext: true, totalPages: 4 });
    // An aligned tail page filled exactly by the last blank rows (blank page 1 full, no token).
    expect(await at(20, 10, 3)).toEqual({ page: 3, hasNext: false, totalPages: 3 });
    // A spanning tail page whose second aligned page is used up exactly.
    expect(await at(25, 15, 4)).toEqual({ page: 4, hasNext: false, totalPages: 4 });
  });

  it("UT-PROJPAGE-052 request counts: named-only 2 reads, boundary 3, spanning tail 4, aligned tail 3", async () => {
    namedTotal = 25;
    blankTotal = 17;
    const perView: { reads: number; sdk: number }[] = [];
    for (const page of [1, 2, 3, 4, 5]) {
      pageCalls = [];
      sdkCalls = [];
      await loadProjectPage(request(page));
      perView.push({ reads: pageCalls.length, sdk: sdkCalls.length });
    }
    // Clicking Next: every walk resumes from a cached token, so each read is one SDK request.
    // Page 5 is blank rows [15, 25) = blank page 2 from offset 5, which has no token: one blank read.
    expect(perView).toEqual([
      { reads: 2, sdk: 2 }, { reads: 2, sdk: 2 }, { reads: 3, sdk: 3 }, { reads: 4, sdk: 4 }, { reads: 3, sdk: 3 },
    ]);
  });

  it("UT-PROJPAGE-053 a page past the end clamps to the last page of the continuous sequence", async () => {
    namedTotal = 25;
    blankTotal = 7;

    const result = await loadProjectPage(request(9));

    expect(result).toMatchObject({ page: 4, totalPages: 4, hasNext: false });
    expect(idsOf(result)).toEqual(seq(6, 7, "b"));
  });

  it("UT-PROJPAGE-054 a walk stopped at the cap still never serves tail rows", async () => {
    realWalk = false;
    dataverse = false;
    answers[NAMED] = cappedSegment(100, 5000, [row("a", "Alpha")]);
    answers[BLANK] = segment(7, "b");

    const result = await loadProjectPage(request(101));

    expect(idsOf(result)).toEqual(["a"]);
    expect(result).toMatchObject({ page: 100, hasNext: true });
    expect(blankCalls().map((c) => c.signature.split("|")[0])).toEqual(["blank-probe"]);
  });

  it("UT-PROJPAGE-055 a stale probe count with no blank row does not light Next on an exact-fit last page", async () => {
    realWalk = false;
    dataverse = false;
    // 20 named rows (an exact 2 pages). The tail's cached count still says 3, but the probe finds
    // no row: the last blank project was named or deleted elsewhere since the count was cached.
    answers[NAMED] = segment(20);
    answers[BLANK] = staleSegment(0, 3, "b");

    // Before the fix: { page: 2, totalPages: 3, hasNext: true }, and page 3 clamped back to page 2
    // with Next still lit, so the pager was stuck in place.
    expect(await loadProjectPage(request(2))).toMatchObject({ page: 2, totalPages: 2, hasNext: false });
    expect(await loadProjectPage(request(3))).toMatchObject({ page: 2, totalPages: 2, hasNext: false });
  });

  it("UT-PROJPAGE-056 while Next is lit the total is at least one page more, however low the count", async () => {
    realWalk = false;
    dataverse = false;
    // 30 named rows (3 pages), but the cached count says 5: RoundUp(5 / 10) = 1.
    answers[NAMED] = staleSegment(30, 5);
    answers[BLANK] = segment(0, "b");

    // Before the fix: totalPages 1, so the pager (`TotalPages > 1`) was hidden with Next available.
    expect(await loadProjectPage(request(1))).toMatchObject({ page: 1, totalPages: 2, hasNext: true });
    expect(await loadProjectPage(request(3))).toMatchObject({ page: 3, totalPages: 3, hasNext: false });
  });
});
