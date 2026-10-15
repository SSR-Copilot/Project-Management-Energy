import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The project list's paging, run through the REAL `countedPage` and `loadProjectPage` against a
 * fake that behaves the way Dataverse does where it matters for paging:
 *
 *  - the SDK ALWAYS sends `Prefer: odata.maxpagesize=<maxPageSize ?? 500>`, and Dataverse then
 *    IGNORES `$top` ("Don't use `$top` with `Prefer: odata.maxpagesize`. If you include both,
 *    `$top` is ignored." — learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results).
 *    So the server's page size is `maxPageSize`, never `top`;
 *  - a page that is not the last carries a skip token, a last page carries none;
 *  - a token is only meaningful for the page size it was issued under;
 *  - `@odata.count` may be left off pages after the first (the fake can be told to).
 *
 * Nothing here mocks `countedPage`, which is what `projects.test.ts` does — that file pins the
 * merge arithmetic, this one pins the contract with the transport underneath it.
 */

interface Served {
  options: Record<string, unknown>;
  rows: number;
}
const served: Served[] = [];

let namedCount = 0;
let blankCount = 0;
let countOnFirstPageOnly = false;
/** Pretend the platform reports `$top` as honoured — the behaviour the old code assumed. */
let honourTop = false;
/** Bumped to make every cookie issued so far stale. */
let tokenGeneration = 0;
/** Hand out a token after every FULL page, even when it was the last one. */
let eagerNext = false;

const SDK_DEFAULT_MAX_PAGE_SIZE = 500;

function fakeServer(options: Record<string, unknown>) {
  const isBlank = String(options.filter ?? "").includes(" eq null");
  const total = isBlank ? blankCount : namedCount;
  const prefix = isBlank ? "b" : "n";

  const maxPageSize = (options.maxPageSize as number | undefined) ?? SDK_DEFAULT_MAX_PAGE_SIZE;
  const size = honourTop && typeof options.top === "number" ? options.top : maxPageSize;

  // Token = "<offset>@<page size it was issued under>@<generation>"; the server rejects one it
  // did not issue, and one from before `expireTokens()` (a cookie that has gone stale).
  let offset = 0;
  if (typeof options.skipToken === "string") {
    const [o, issuedFor, gen, issuedCount] = options.skipToken.split("@");
    if (Number(issuedFor) !== size) {
      return { success: false, error: new Error(`token issued for page size ${issuedFor}`) };
    }
    // Dataverse: "Don't change the @odata.nextLink URL value or append any query options to it."
    if ((issuedCount === "1") !== Boolean(options.count)) {
      return { success: false, error: new Error("skip token replayed with different query options") };
    }
    if (Number(gen) !== tokenGeneration) {
      return { success: false, error: new Error("skip token expired") };
    }
    offset = Number(o);
  }

  const end = Math.min(total, offset + size);
  const data = Array.from({ length: end - offset }, (_, i) => ({
    vsb_projectid: `${prefix}${String(offset + i + 1).padStart(5, "0")}`,
    vsb_projectname: isBlank ? null : `${prefix}${String(offset + i + 1).padStart(5, "0")}`,
  }));
  served.push({ options, rows: data.length });
  return {
    success: true,
    data,
    ...((eagerNext ? end - offset === size : end < total) ? { skipToken: `${end}@${size}@${tokenGeneration}@${options.count ? 1 : 0}` } : {}),
    ...(options.count && !(countOnFirstPageOnly && offset > 0) ? { count: Math.min(total, 5000) } : {}),
  };
}

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn(async (_table: string, options: Record<string, unknown>) =>
      fakeServer(options)),
  }),
}));

import { loadProjectPage, resetProjectPageCache } from "./projects";
import { EMPTY_FILTER, DEFAULT_SORT } from "@/features/project-overview/rules";

const PAGE_SIZE = 200;
const load = (page: number, pageSize = PAGE_SIZE) =>
  loadProjectPage({ filter: EMPTY_FILTER, sort: DEFAULT_SORT, page, pageSize });

/**
 * The ids a page should hold. The list is `named` then `blank` CONCATENATED, and page P is global
 * rows [(P-1)*size, P*size) of it — the two segments share the boundary page (canvas parity).
 * SOURCE DEFECT fixed: they used to be paged separately, which cost an extra page.
 */
const expectedIds = (page: number, pageSize = PAGE_SIZE) => {
  const ids = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(5, "0")}`);
  return [...ids("n", namedCount), ...ids("b", blankCount)].slice((page - 1) * pageSize, page * pageSize);
};

/** `first..last (n rows)` — a failure then reads as one line instead of 200 ids. */
const span = (ids: string[]) =>
  ids.length === 0 ? "(no rows)" : `${ids[0]}..${ids[ids.length - 1]} (${ids.length} rows)`;
const idsOf = (p: Awaited<ReturnType<typeof load>>) => span(p.rows.map((r) => r.id));

beforeEach(() => {
  served.length = 0;
  namedCount = 0;
  blankCount = 0;
  countOnFirstPageOnly = false;
  honourTop = false;
  tokenGeneration = 0;
  eagerNext = false;
  resetProjectPageCache();
});

describe("loadProjectPage — paging against a Dataverse-faithful transport", () => {
  it("UT-PROJPAGE-010 serves exactly one app page per page, on every step of Next → Previous → Next → Next", async () => {
    // 1,129 projects, as in the screenshot. Dataverse (not the app) decides the page size, and
    // the only knob it honours is `maxPageSize`.
    namedCount = 1129;
    for (const page of [1, 2, 1, 2, 3, 2, 6]) {
      const result = await load(page);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
      expect(result.page).toBe(page);
      expect(result.totalPages).toBe(6);
      expect(result.hasNext).toBe(page < 6);
    }
  });

  it("UT-PROJPAGE-011 crosses from the named segment into the nameless tail without repeating or skipping a row", async () => {
    namedCount = 450; // 2 full pages + 50 rows of page 3, which the tail tops up
    blankCount = 130;
    // SOURCE DEFECT: this was 4 pages (3 named + 1 tail). 580 rows at 200 is ceil(580/200) = 3.
    for (const page of [1, 2, 1, 2, 3, 2, 3, 1]) {
      const result = await load(page);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
      expect(result.page).toBe(page);
      expect(result.totalRows).toBe(580);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(page < 3);
    }
  });

  it("UT-PROJPAGE-015 1,100 named + 29 nameless is 6 pages, not 7, and page 6 is the 129 rows after row 1000", async () => {
    namedCount = 1100;
    blankCount = 29;
    for (const page of [1, 5, 6, 3]) {
      const result = await load(page);
      expect(result.totalPages, `page ${page}`).toBe(6);
      expect(result.totalRows).toBe(1129);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
    }
  });

  it("UT-PROJPAGE-016 a pure-tail page that starts part-way through a tail page stitches two tail pages", async () => {
    namedCount = 50; // page 1 = 50 named + 150 blank; page 2 = blank rows 151..350 (offset 150)
    blankCount = 450;
    for (const page of [1, 2, 3, 2]) {
      const result = await load(page);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(page < 3);
    }
  });

  it("UT-PROJPAGE-017 a page past the end resets to page 1 (canvas adjustedPage = 1)", async () => {
    namedCount = 450;
    blankCount = 130;
    const result = await load(9);
    expect(result.page).toBe(1);
    expect(idsOf(result)).toEqual(span(expectedIds(1)));
    expect(result.hasNext).toBe(true);
    expect(result.totalRows).toBe(580);
    expect(result.totalPages).toBe(3);
  });

  it("UT-PROJPAGE-031 a page past the end of a purely named set also resets to page 1 with the right totals", async () => {
    namedCount = 1129;
    blankCount = 0;
    const result = await load(12);
    expect(result.page).toBe(1);
    expect(idsOf(result)).toEqual(span(expectedIds(1)));
    expect(result.totalRows).toBe(1129);
    expect(result.totalPages).toBe(6);
  });

  it("UT-PROJPAGE-020 a page after the first costs ONE named request, not one per page before it", async () => {
    namedCount = 1129;
    await load(1);
    await load(2); // the prefetch's request: opens on the token page 1 issued
    served.length = 0;
    const p3 = await load(3);
    expect(idsOf(p3)).toEqual(span(expectedIds(3)));
    expect(p3.totalRows).toBe(1129);
    const named = served.filter((s) => s.options.maxPageSize === PAGE_SIZE);
    expect(named).toHaveLength(1);
    // The query options match the request that issued the token (Dataverse: don't change them).
    expect(named[0]?.options.count).toBe(true);
  });

  it("UT-PROJPAGE-021 Previous and Next after a deep page replay tokens instead of re-walking", async () => {
    namedCount = 1129;
    await load(4); // cold: a four-request walk
    served.length = 0;
    for (const page of [3, 4, 2, 5]) {
      const result = await load(page);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
    }
    expect(served.filter((s) => s.options.maxPageSize === PAGE_SIZE)).toHaveLength(4);
  });

  it("UT-PROJPAGE-022 tokens older than the replay window are dropped and the walk restarts at page 1", async () => {
    namedCount = 1129;
    await load(2);
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(Date.now() + 61_000); // past TOKEN_TTL_MS
    served.length = 0;
    const result = await load(2);
    spy.mockRestore();
    expect(idsOf(result)).toEqual(span(expectedIds(2)));
    // Pages 1 and 2 again — no cookie older than the window is ever replayed.
    expect(served.filter((s) => s.options.maxPageSize === PAGE_SIZE)).toHaveLength(2);
  });

  it("UT-PROJPAGE-024 a replayed token the server rejects falls back to a clean walk, not an error", async () => {
    namedCount = 1129;
    await load(1);
    tokenGeneration += 1; // inside the window, but the server no longer honours the cookie
    const result = await load(3);
    expect(idsOf(result)).toEqual(span(expectedIds(3)));
    expect(result.totalRows).toBe(1129);
    expect(result.page).toBe(3);
  });

  it("UT-PROJPAGE-025 walks to and replays the LAST page with unchanged query options on every request", async () => {
    // The fake rejects a skip token replayed with different options (here: `$count`), exactly as
    // Dataverse's "don't change the nextLink or append query options" rule allows it to.
    namedCount = 1100;
    blankCount = 29;
    for (const page of [6, 5, 6, 1, 6]) {
      const result = await load(page);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
      expect(result.totalPages).toBe(6);
    }
  });

  it("UT-PROJPAGE-026 a token on an exactly-full last page does not invent another page", async () => {
    // 400 named at 200 a page: the server (wrongly or not) still hands out a token after page 2.
    namedCount = 400;
    blankCount = 0;
    eagerNext = true;
    for (const page of [1, 2]) {
      const result = await load(page);
      expect(result.totalPages, `page ${page}`).toBe(2);
      expect(result.hasNext, `page ${page}`).toBe(page < 2);
      expect(idsOf(result), `page ${page}`).toEqual(span(expectedIds(page)));
    }
  });

  it("UT-PROJPAGE-023 the nameless count is read once per criteria, not once per page", async () => {
    namedCount = 1129;
    blankCount = 29;
    await load(1);
    await load(2);
    await load(3);
    const probes = served.filter((s) => s.options.maxPageSize === 1);
    expect(probes).toHaveLength(1);
  });

  it("UT-PROJPAGE-012 asks Dataverse for the page size it means, and never sends a $top that would be ignored", async () => {
    namedCount = 450;
    await load(2);
    const named = served.filter((s) => s.options.maxPageSize !== 1);
    expect(named.length).toBeGreaterThan(0);
    for (const s of named) {
      expect(s.options.maxPageSize).toBe(PAGE_SIZE);
      expect(s.options).not.toHaveProperty("top");
    }
  });

  it("UT-PROJPAGE-013 keeps the total from page 1 when later pages leave @odata.count off", async () => {
    namedCount = 450;
    countOnFirstPageOnly = true;
    for (const page of [1, 2, 3, 2]) {
      const result = await load(page);
      expect(result.totalRows, `page ${page}`).toBe(450);
      expect(result.totalPages, `page ${page}`).toBe(3);
    }
  });

  it("UT-PROJPAGE-014 a token issued for one page size is never replayed at another", async () => {
    namedCount = 450;
    blankCount = 130;
    // A probe asks for one row and gets a token for a one-row page; the real walk must not pick it up.
    await load(1);
    await load(2);
    await load(1, 100);
    const result = await load(2, 100);
    expect(idsOf(result)).toEqual(span(expectedIds(2, 100)));
  });
});

